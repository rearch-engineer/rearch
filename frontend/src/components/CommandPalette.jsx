import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useConversations } from "../contexts/ConversationsContext";
import { api } from "../api/client";
import "./CommandPalette.css";

const STORAGE_KEY_MODEL = "chat_selectedModel";

/**
 * Fuzzy match: checks whether all characters in `query` appear in `text`
 * in order (case-insensitive). Returns a score (higher = better match)
 * or -1 if there is no match.
 *
 * Scoring favours:
 *  - Consecutive character runs
 *  - Matches at word boundaries (start of word / after space/separator)
 *  - Matches near the beginning of the string
 */
function fuzzyScore(text, query) {
  if (!query) return 1; // empty query matches everything
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  let ti = 0;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatchIdx = -2;

  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      // Bonus for word-boundary match (first char or preceded by space / separator)
      if (ti === 0 || /[\s\-_/.]/.test(t[ti - 1])) {
        score += 10;
      }

      // Bonus for consecutive matches
      if (ti === prevMatchIdx + 1) {
        consecutive++;
        score += consecutive * 5;
      } else {
        consecutive = 0;
      }

      // Small bonus for matching earlier in the string
      score += Math.max(0, 5 - ti);

      prevMatchIdx = ti;
      qi++;
    }
    ti++;
  }

  // All query characters must be matched
  return qi === q.length ? score : -1;
}

/**
 * Command Palette component.
 *
 * Opens with Ctrl+P. Provides searchable commands grouped by sections.
 * Supports sub-views for switching conversations and models.
 */
const CommandPalette = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { conversations } = useConversations();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 'main' | 'conversations' | 'models'
  const [view, setView] = useState("main");

  // Model sub-view state
  const [modelOptions, setModelOptions] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [currentModel, setCurrentModel] = useState(null);

  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Extract the current conversation ID from the URL
  const currentConversationId = useMemo(() => {
    const match = location.pathname.match(/^\/conversations\/(.+)$/);
    if (match && match[1] !== "new") return match[1];
    return null;
  }, [location.pathname]);

  // Whether the user is on an active conversation (not 'new', not null)
  const isOnActiveConversation = !!currentConversationId;

  // ── Model fetching ──────────────────────────────────────────────────────

  const openModelsView = useCallback(async () => {
    setView("models");
    setSearchQuery("");
    setSelectedIndex(0);
    setLoadingModels(true);

    // Read the currently selected model from localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY_MODEL);
      if (raw) {
        setCurrentModel(JSON.parse(raw));
      }
    } catch {
      setCurrentModel(null);
    }

    try {
      const providerData = await api.getProviders(currentConversationId);
      const connectedProviders = providerData.connected || [];
      const options = [];

      for (const provider of providerData.all || []) {
        if (
          connectedProviders.length > 0 &&
          !connectedProviders.includes(provider.id)
        ) {
          continue;
        }

        const models = provider.models || {};
        for (const [modelId, model] of Object.entries(models)) {
          if (model.tool_call === false && model.toolcall === false) continue;

          options.push({
            providerID: provider.id,
            providerName: provider.name,
            modelID: modelId,
            modelName: model.name || modelId,
          });
        }
      }

      setModelOptions(options);
    } catch (error) {
      console.error("Failed to fetch models:", error);
      setModelOptions([]);
    } finally {
      setLoadingModels(false);
    }
  }, [currentConversationId]);

  // ── Command definitions ─────────────────────────────────────────────────

  const commands = useMemo(() => {
    const sections = [
      {
        section: "Conversations",
        items: [
          {
            label: "New conversation",
            synonyms: ["new chat", "create conversation"],
            action: () => {
              navigate("/conversations/new");
            },
          },
          {
            label: "Switch conversation",
            synonyms: [
              "change conversation",
              "go to conversation",
              "open conversation",
            ],
            action: () => {
              setView("conversations");
              setSearchQuery("");
              setSelectedIndex(0);
            },
          },
        ],
      },
    ];

    // Only show Models section when on an active conversation
    if (isOnActiveConversation) {
      sections.push({
        section: "Models",
        items: [
          {
            label: "Switch model",
            synonyms: ["change model", "select model", "pick model"],
            action: () => {
              openModelsView();
            },
          },
        ],
      });
    }

    sections.push({
      section: "ReArch",
      items: [
        {
          label: "Documentation",
          synonyms: ["docs", "help", "guide", "manual"],
          action: () => {
            window.open(
              "https://rearch.engineer/docs",
              "_blank",
              "noopener,noreferrer",
            );
          },
        },
        {
          label: "Website",
          synonyms: ["homepage", "site", "home", "rearch"],
          action: () => {
            window.open(
              "https://rearch.engineer",
              "_blank",
              "noopener,noreferrer",
            );
          },
        },
      ],
    });

    sections.push({
      section: "Session",
      items: [
        {
          label: "Logout",
          synonyms: ["sign out", "log out", "exit"],
          action: () => {
            logout();
            navigate("/login", { replace: true });
          },
        },
      ],
    });

    return sections;
  }, [isOnActiveConversation, logout, navigate, openModelsView]);

  // ── Flatten commands for navigation ─────────────────────────────────────

  const flatItems = useMemo(() => {
    const query = searchQuery.trim();

    if (view === "main") {
      const items = [];

      for (const section of commands) {
        // Score each item against the query; also match against section name
        const scored = section.items
          .map((item) => {
            const labelScore = fuzzyScore(item.label, query);
            const sectionScore = fuzzyScore(section.section, query);
            const synonymScores = (item.synonyms || []).map((s) =>
              fuzzyScore(s, query),
            );
            const bestScore = Math.max(
              labelScore,
              sectionScore,
              ...synonymScores,
            );
            return { item, score: bestScore };
          })
          .filter((s) => s.score >= 0)
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          items.push({ type: "section", label: section.section });
          for (const { item } of scored) {
            items.push({ type: "item", ...item });
          }
        }
      }

      return items;
    }

    if (view === "conversations") {
      return conversations
        .map((conv) => {
          const title = conv.title || "Untitled";
          const repo = conv.subResource?.name || "";
          const bestScore = Math.max(
            fuzzyScore(title, query),
            fuzzyScore(repo, query),
          );
          return { conv, title, repo, score: bestScore };
        })
        .filter((s) => s.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ conv, title, repo }) => ({
          type: "item",
          label: title,
          subtitle: repo || undefined,
          id: conv._id,
          action: () => {
            navigate(`/conversations/${conv._id}`);
          },
        }));
    }

    if (view === "models") {
      return modelOptions
        .map((m) => {
          const bestScore = Math.max(
            fuzzyScore(m.modelName, query),
            fuzzyScore(m.providerName, query),
            fuzzyScore(m.modelID, query),
          );
          return { m, score: bestScore };
        })
        .filter((s) => s.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ m }) => ({
          type: "item",
          label: m.modelName,
          subtitle: m.providerName,
          providerID: m.providerID,
          modelID: m.modelID,
          isActive:
            currentModel &&
            currentModel.providerID === m.providerID &&
            currentModel.modelID === m.modelID,
          action: () => {
            const newModel = { providerID: m.providerID, modelID: m.modelID };
            try {
              localStorage.setItem(STORAGE_KEY_MODEL, JSON.stringify(newModel));
            } catch {
              // ignore
            }
            // Notify ChatInterface about the model change
            window.dispatchEvent(
              new CustomEvent("model-changed", { detail: newModel }),
            );
          },
        }));
    }

    return [];
  }, [
    view,
    searchQuery,
    commands,
    conversations,
    modelOptions,
    currentModel,
    navigate,
  ]);

  // Only selectable items (skip section headers)
  const selectableItems = useMemo(
    () => flatItems.filter((item) => item.type === "item"),
    [flatItems],
  );

  // ── Open / close ───────────────────────────────────────────────────────

  const open = useCallback(() => {
    setIsOpen(true);
    setSearchQuery("");
    setSelectedIndex(0);
    setView("main");
    setModelOptions([]);
    setLoadingModels(false);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Notify other components so they can restore focus (e.g. message input)
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("command-palette-closed"));
    });
  }, []);

  // ── Global Ctrl+P listener ─────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        e.stopPropagation();

        if (isOpen) {
          close();
        } else {
          open();
        }
        return;
      }

      if (isOpen && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, open, close]);

  // ── Focus search input when opened ─────────────────────────────────────

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen, view]);

  // ── Reset selected index when search or items change ───────────────────

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // ── Scroll selected item into view ─────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(
      ".command-palette-item.selected",
    );
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // ── Keyboard navigation inside the palette ─────────────────────────────

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === "ArrowLeft" && view !== "main") {
        e.preventDefault();
        setView("main");
        setSearchQuery("");
        setSelectedIndex(0);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < selectableItems.length - 1 ? prev + 1 : 0,
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : selectableItems.length - 1,
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const item = selectableItems[selectedIndex];
        if (item?.action) {
          item.action();
          // Close palette after executing, unless entering a sub-view
          if (
            view !== "main" ||
            !["Switch conversation", "Switch model"].includes(item.label)
          ) {
            close();
          }
        }
        return;
      }
    },
    [close, selectableItems, selectedIndex, view],
  );

  // ── Click on backdrop closes ───────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        close();
      }
    },
    [close],
  );

  // ── Rendering ──────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const viewTitle = {
    main: "Command palette",
    conversations: "Switch conversation",
    models: "Switch model",
  }[view];

  // Track the selectable index for rendering
  let selectableIdx = -1;

  return (
    <div
      className="command-palette-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="command-palette">
        {/* Header */}
        <div className="command-palette-header">
          <div className="command-palette-title">
            {viewTitle}
            {view !== "main" && (
              <span className="command-palette-back-hint">&#8592; back</span>
            )}
          </div>
          <span className="command-palette-esc" onClick={close} style={{ cursor: "pointer" }}>esc</span>
        </div>

        {/* Search */}
        <div className="command-palette-search">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="command-palette-divider" />

        {/* List */}
        <div className="command-palette-list" ref={listRef}>
          {view === "models" && loadingModels && (
            <div className="command-palette-loading">Loading models...</div>
          )}

          {flatItems.length === 0 && !loadingModels && (
            <div className="command-palette-empty">No results found</div>
          )}

          {flatItems.map((item, idx) => {
            if (item.type === "section") {
              return (
                <div
                  key={`section-${item.label}`}
                  className="command-palette-section"
                >
                  {item.label}
                </div>
              );
            }

            selectableIdx++;
            const currentSelectableIdx = selectableIdx;

            // Add a spacer after the last item in a group (when the next item is a section header)
            const isLastInGroup =
              idx < flatItems.length - 1 &&
              flatItems[idx + 1].type === "section";

            return (
              <React.Fragment key={item.id || item.label + "-" + idx}>
              <div
                className={`command-palette-item${currentSelectableIdx === selectedIndex ? " selected" : ""}`}
                onClick={() => {
                  item.action();
                  if (
                    view !== "main" ||
                    !["Switch conversation", "Switch model"].includes(
                      item.label,
                    )
                  ) {
                    close();
                  }
                }}
                onMouseEnter={() => setSelectedIndex(currentSelectableIdx)}
              >
                {item.subtitle !== undefined ? (
                  <div className="command-palette-item-details">
                    <div className="command-palette-item-label">
                      {item.label}
                    </div>
                    <div className="command-palette-item-subtitle">
                      {item.subtitle}
                    </div>
                  </div>
                ) : (
                  <span className="command-palette-item-label">
                    {item.label}
                  </span>
                )}
                {item.shortcut && (
                  <span className="command-palette-item-shortcut">
                    {item.shortcut}
                  </span>
                )}
                {item.isActive && (
                  <span className="command-palette-item-active">active</span>
                )}
              </div>
              {isLastInGroup && (
                <div className="command-palette-group-spacer" />
              )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

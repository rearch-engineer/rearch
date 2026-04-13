import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import Input from "@mui/joy/Input";
import Typography from "@mui/joy/Typography";
import Chip from "@mui/joy/Chip";
import Divider from "@mui/joy/Divider";
import CircularProgress from "@mui/joy/CircularProgress";
import SearchIcon from "@mui/icons-material/Search";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CodeIcon from "@mui/icons-material/Code";
import LogoutIcon from "@mui/icons-material/Logout";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import TuneIcon from "@mui/icons-material/Tune";
import { useAuth } from "../../contexts/AuthContext";
import { useConversations } from "../../contexts/ConversationsContext";
import { api } from "../../api/client";
import "./CommandPalette.css";

const STORAGE_KEY_MODEL = "chat_selectedModel";
const PRESELECT_REPO_KEY = "command_palette_preselect_repo";

/**
 * Fuzzy match: checks whether all characters in `query` appear in `text`
 * in order (case-insensitive). Returns a score (higher = better match)
 * or -1 if there is no match.
 */
function fuzzyScore(text, query) {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  let ti = 0;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatchIdx = -2;

  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      if (ti === 0 || /[\s\-_/.]/.test(t[ti - 1])) {
        score += 10;
      }
      if (ti === prevMatchIdx + 1) {
        consecutive++;
        score += consecutive * 5;
      } else {
        consecutive = 0;
      }
      score += Math.max(0, 5 - ti);
      prevMatchIdx = ti;
      qi++;
    }
    ti++;
  }

  return qi === q.length ? score : -1;
}

/**
 * Command Palette / Search component.
 *
 * Opens with Ctrl+P / Cmd+P. Provides unified search across repositories,
 * conversations, and quick actions.
 */
const CommandPalette = () => {
  const { t } = useTranslation('CommandPalette');
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { conversations, markRead } = useConversations();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Repositories state
  const [repositories, setRepositories] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Model sub-view state
  const [view, setView] = useState("main"); // 'main' | 'models'
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

  const isOnActiveConversation = !!currentConversationId;

  // ── Fetch repositories on open ──────────────────────────────────────────

  const fetchRepositories = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const repos = await api.getAllSubResources("bitbucket-repository");
      const enabledRepos = repos.filter((repo) => repo.rearch?.enabled);
      setRepositories(enabledRepos);
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      setRepositories([]);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  // ── Model fetching ──────────────────────────────────────────────────────

  const openModelsView = useCallback(async () => {
    setView("models");
    setSearchQuery("");
    setSelectedIndex(0);
    setLoadingModels(true);

    try {
      const raw = localStorage.getItem(STORAGE_KEY_MODEL);
      if (raw) setCurrentModel(JSON.parse(raw));
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
        )
          continue;

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

  // ── Build flat items for main view ──────────────────────────────────────

  const flatItems = useMemo(() => {
    const query = searchQuery.trim();
    const items = [];

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
          category: "model",
          label: m.modelName,
          subtitle: m.providerName,
          icon: "model",
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
            window.dispatchEvent(
              new CustomEvent("model-changed", { detail: newModel }),
            );
          },
        }));
    }

    // ── Main view: Repositories ─────────────────────────────────────────

    const repoItems = repositories
      .map((repo) => {
        const nameScore = fuzzyScore(repo.name, query);
        const wsScore = fuzzyScore(repo.resourceName || "", query);
        const bestScore = Math.max(nameScore, wsScore);
        return { repo, score: bestScore };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ repo }) => ({
        type: "item",
        category: "repository",
        label: repo.name,
        subtitle: repo.resourceName || "",
        icon: "repo",
        id: repo._id,
        action: () => {
          // Store pre-selection info and navigate to new conversation
          try {
            sessionStorage.setItem(
              PRESELECT_REPO_KEY,
              JSON.stringify({
                subResourceId: repo._id,
                resourceId: repo.resourceId || repo.resource,
              }),
            );
          } catch {
            // ignore
          }
          navigate("/conversations/new");
          // Dispatch event so ChatInterface picks it up immediately
          window.dispatchEvent(new CustomEvent("repo-preselected"));
        },
      }));

    if (repoItems.length > 0) {
      items.push({ type: "section", label: t('repositories') });
      items.push(...repoItems);
    }

    // ── Conversations ───────────────────────────────────────────────────

    const convItems = conversations
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
      .slice(0, query ? 20 : 8) // Show more when actively searching
      .map(({ conv, title, repo }) => ({
        type: "item",
        category: "conversation",
        label: title,
        subtitle: repo || undefined,
        icon: "conversation",
        id: conv._id,
        action: () => {
          markRead(conv._id);
          navigate(`/conversations/${conv._id}`);
        },
      }));

    if (convItems.length > 0) {
      items.push({ type: "section", label: t('conversations') });
      items.push(...convItems);
    }

    // ── Quick actions ───────────────────────────────────────────────────

    const actions = [
      {
        label: t('newConversation'),
        synonyms: ["new chat", "create conversation", "start"],
        icon: "add",
        action: () => navigate("/conversations/new"),
      },
    ];

    if (isOnActiveConversation) {
      actions.push({
        label: t('switchModel'),
        synonyms: ["change model", "select model", "pick model"],
        icon: "tune",
        action: () => openModelsView(),
      });
    }

    actions.push(
      {
        label: t('documentation'),
        synonyms: ["docs", "help", "guide"],
        icon: "docs",
        action: () =>
          window.open(
            "https://rearch.engineer/docs",
            "_blank",
            "noopener,noreferrer",
          ),
      },
      {
        label: t('website'),
        synonyms: ["homepage", "site", "rearch"],
        icon: "web",
        action: () =>
          window.open(
            "https://rearch.engineer",
            "_blank",
            "noopener,noreferrer",
          ),
      },
      {
        label: t('logout'),
        synonyms: ["sign out", "log out", "exit"],
        icon: "logout",
        action: () => {
          logout();
          navigate("/login", { replace: true });
        },
      },
    );

    const actionItems = actions
      .map((item) => {
        const labelScore = fuzzyScore(item.label, query);
        const synonymScores = (item.synonyms || []).map((s) =>
          fuzzyScore(s, query),
        );
        const bestScore = Math.max(labelScore, ...synonymScores);
        return { item, score: bestScore };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => ({
        type: "item",
        category: "action",
        ...item,
      }));

    if (actionItems.length > 0) {
      items.push({ type: "section", label: t('actions') });
      items.push(...actionItems);
    }

    return items;
  }, [
    t,
    view,
    searchQuery,
    repositories,
    conversations,
    modelOptions,
    currentModel,
    isOnActiveConversation,
    navigate,
    markRead,
    logout,
    openModelsView,
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
    fetchRepositories();
  }, [fetchRepositories]);

  const close = useCallback(() => {
    setIsOpen(false);
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
        if (isOpen) close();
        else open();
        return;
      }

      if (isOpen && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };

    // Listen for external open requests (from MainMenu search trigger)
    const handleOpenRequest = () => {
      if (!isOpen) open();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("open-command-palette", handleOpenRequest);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("open-command-palette", handleOpenRequest);
    };
  }, [isOpen, open, close]);

  // ── Focus search input when opened ─────────────────────────────────────

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      requestAnimationFrame(() => {
        searchInputRef.current?.querySelector("input")?.focus();
      });
    }
  }, [isOpen, view]);

  // ── Reset selected index when search changes ──────────────────────────

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // ── Scroll selected item into view ────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(
      ".command-palette-item.selected",
    );
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // ── Keyboard navigation ───────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (view !== "main") {
          setView("main");
          setSearchQuery("");
          setSelectedIndex(0);
        } else {
          close();
        }
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
          // Don't close if entering a sub-view
          if (item.label !== t('switchModel')) {
            close();
          }
        }
        return;
      }
    },
    [close, selectableItems, selectedIndex, view],
  );

  // ── Icon helper ───────────────────────────────────────────────────────

  const renderIcon = (iconType) => {
    const iconProps = { sx: { fontSize: 18 } };
    switch (iconType) {
      case "repo":
        return <CodeIcon {...iconProps} />;
      case "conversation":
        return <ChatBubbleOutlineIcon {...iconProps} />;
      case "add":
        return <AddCircleOutlineIcon {...iconProps} />;
      case "tune":
      case "model":
        return <TuneIcon {...iconProps} />;
      case "docs":
        return <DescriptionOutlinedIcon {...iconProps} />;
      case "web":
        return <LanguageIcon {...iconProps} />;
      case "logout":
        return <LogoutIcon {...iconProps} />;
      default:
        return null;
    }
  };

  // ── Backdrop click ────────────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) close();
    },
    [close],
  );

  // ── Rendering ─────────────────────────────────────────────────────────

  if (!isOpen) return null;

  let selectableIdx = -1;

  return (
    <div
      className="command-palette-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="command-palette">
        {/* Search input */}
        <div style={{ padding: "12px 12px 0" }}>
          <Input
            ref={searchInputRef}
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            startDecorator={
              <SearchIcon sx={{ color: "var(--text-tertiary)", fontSize: 20 }} />
            }
            variant="plain"
            sx={{
              "--Input-focusedThickness": "0px",
              bgcolor: "transparent",
              border: "none",
              borderRadius: "10px",
              fontSize: 15,
              py: 1.2,
              px: 1.5,
              width: "100%",
              "& input": {
                width: "100%",
              },
            }}
          />
        </div>

        {/* View title for sub-views */}
        {view === "models" && (
          <div style={{ padding: "12px 20px 0" }}>
            <Typography
              level="body-xs"
              sx={{
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                fontWeight: 700,
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                "&:hover": { color: "var(--text-secondary)" },
              }}
              onClick={() => {
                setView("main");
                setSearchQuery("");
                setSelectedIndex(0);
              }}
            >
              {t('backToSearch')}
            </Typography>
          </div>
        )}

        <Divider sx={{ mt: 1.5, borderColor: "var(--border-color)" }} />

        {/* Results list */}
        <div className="command-palette-list" ref={listRef}>
          {/* Loading state */}
          {view === "main" && loadingRepos && repositories.length === 0 && (
            <div className="command-palette-loading">
              <CircularProgress size="sm" />
              <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
                {t('loading')}
              </Typography>
            </div>
          )}

          {view === "models" && loadingModels && (
            <div className="command-palette-loading">
              <CircularProgress size="sm" />
              <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
                {t('loadingModels')}
              </Typography>
            </div>
          )}

          {/* Empty state */}
          {flatItems.length === 0 &&
            !loadingRepos &&
            !loadingModels && (
              <div className="command-palette-empty">
                <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
                  {t('noResultsFound')}
                </Typography>
              </div>
            )}

          {/* Items */}
          {flatItems.map((item, idx) => {
            if (item.type === "section") {
              return (
                <Typography
                  key={`section-${item.label}`}
                  level="body-xs"
                  sx={{
                    px: 2.5,
                    pt: idx === 0 ? 1 : 2,
                    pb: 0.5,
                    color: "var(--text-tertiary)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "11px",
                    userSelect: "none",
                  }}
                >
                  {item.label}
                </Typography>
              );
            }

            selectableIdx++;
            const currentSelectableIdx = selectableIdx;

            return (
              <div
                key={item.id || `${item.label}-${idx}`}
                className={`command-palette-item${currentSelectableIdx === selectedIndex ? " selected" : ""}`}
                onClick={() => {
                  item.action();
                  if (item.label !== t('switchModel')) close();
                }}
                onMouseEnter={() => setSelectedIndex(currentSelectableIdx)}
              >
                {/* Icon */}
                <div
                  className={`command-palette-item-icon ${item.category || item.icon || ""}`}
                >
                  {renderIcon(item.icon)}
                </div>

                {/* Text */}
                <div className="command-palette-item-details">
                  <Typography
                    level="body-sm"
                    sx={{
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </Typography>
                  {item.subtitle && (
                    <Typography
                      level="body-xs"
                      sx={{
                        color: "var(--text-tertiary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        mt: 0.1,
                      }}
                    >
                      {item.subtitle}
                    </Typography>
                  )}
                </div>

                {/* Badges */}
                {item.isActive && (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="success"
                    className="command-palette-item-badge"
                    sx={{ fontSize: 11, height: 20 }}
                  >
                    {t('active')}
                  </Chip>
                )}
                {item.category === "repository" && (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="primary"
                    className="command-palette-item-badge"
                    sx={{ fontSize: 11, height: 20 }}
                  >
                    {t('new')}
                  </Chip>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer with keyboard hints */}
        <Divider sx={{ borderColor: "var(--border-color)" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
          }}
        >
          <Typography
            level="body-xs"
            sx={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <kbd
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              ↑↓
            </kbd>
            {t('navigate')}
          </Typography>
          <Typography
            level="body-xs"
            sx={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <kbd
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              ↵
            </kbd>
            {t('select')}
          </Typography>
          <Typography
            level="body-xs"
            sx={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <kbd
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              esc
            </kbd>
            {t('close')}
          </Typography>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

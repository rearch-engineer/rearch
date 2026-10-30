import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MessageList from "../MessageList";
import MessageInput from "../MessageInput";
import WelcomeScreen from "../WelcomeScreen";
import ChatSkeleton from "../ChatSkeleton";
import { api } from "../../api/client";
import Button from "@mui/joy/Button";
import CircularProgress from "@mui/joy/CircularProgress";
import Typography from "@mui/joy/Typography";
import Input from "@mui/joy/Input";
import { useToast } from "../../contexts/ToastContext";
import { useConversations } from "../../contexts/ConversationsContext";
import { useWorkspaces } from "../../contexts/WorkspacesContext";
import "./ChatInterface.css";

const STORAGE_KEY_AGENT = "chat_selectedAgent";
const STORAGE_KEY_MODEL = "chat_selectedModel";

const getSavedAgent = () => {
  try {
    return localStorage.getItem(STORAGE_KEY_AGENT) || "build";
  } catch {
    return "build";
  }
};

const getSavedModel = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODEL);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.providerID && parsed.modelID) return parsed;
    }
  } catch {
    // ignore corrupted data
  }
  return null;
};

const ChatInterface = ({
  conversationId,
  onConversationUpdate,
  onConversationCreated,
  onSessionInfoUpdate,
}) => {
  const { t } = useTranslation("ChatInterface");
  const toast = useToast();
  const { conversations, markBusy, markIdle, markRead, setActiveConversationId } =
    useConversations();
  const { activeWorkspace } = useWorkspaces();

  // Derive environment status from context (kept in sync via WebSocket)
  const conversationEnvStatus = conversations.find(
    (c) => c._id === conversationId,
  )?.environment?.status;
  const isContainerReady = conversationEnvStatus === "running";
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState(null);
  // ReArch agents (what a conversation runs with) — distinct from OpenCode
  // agents/modes stored in `agents` / `selectedAgent` below.
  const [selectedRearchAgentId, setSelectedRearchAgentId] = useState("");
  const [rearchAgents, setRearchAgents] = useState([]);
  const [isLoadingRearchAgents, setIsLoadingRearchAgents] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [pendingPermission, setPendingPermission] = useState(null);
  const [conversationRearchAgentId, setConversationRearchAgentId] = useState(null);
  const [conversationRearchAgentName, setConversationRearchAgentName] = useState(null);

  // Model and agent state
  const [providers, setProviders] = useState(null);
  const [agents, setAgents] = useState([]);
  const [selectedModel, setSelectedModel] = useState(getSavedModel);
  const [selectedAgent, setSelectedAgent] = useState(getSavedAgent);

  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const messageInputRef = useRef(null);

  // Listen for model changes from the command palette
  useEffect(() => {
    const handleModelChanged = (e) => {
      if (e.detail && e.detail.providerID && e.detail.modelID) {
        setSelectedModel(e.detail);
      }
    };
    window.addEventListener("model-changed", handleModelChanged);
    return () =>
      window.removeEventListener("model-changed", handleModelChanged);
  }, []);

  // Focus message input when the conversation view becomes ready
  useEffect(() => {
    if (conversationId && conversationId !== "new" && isContainerReady) {
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    }
  }, [conversationId, isContainerReady]);

  // Restore focus to message input when the command palette closes
  useEffect(() => {
    const handlePaletteClosed = () => {
      if (conversationId && conversationId !== "new") {
        requestAnimationFrame(() => {
          messageInputRef.current?.focus();
        });
      }
    };
    window.addEventListener("command-palette-closed", handlePaletteClosed);
    return () =>
      window.removeEventListener("command-palette-closed", handlePaletteClosed);
  }, [conversationId]);

  // Persist selected agent and model to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_AGENT, selectedAgent);
    } catch {
      // ignore
    }
  }, [selectedAgent]);

  useEffect(() => {
    try {
      if (selectedModel) {
        localStorage.setItem(STORAGE_KEY_MODEL, JSON.stringify(selectedModel));
      } else {
        localStorage.removeItem(STORAGE_KEY_MODEL);
      }
    } catch {
      // ignore
    }
  }, [selectedModel]);

  useEffect(() => {
    // Track which conversation the user is currently viewing
    setActiveConversationId(
      conversationId && conversationId !== "new" ? conversationId : null,
    );

    if (conversationId && conversationId !== "new") {
      // Wait for activeWorkspace to be available before loading
      if (!activeWorkspace?._id) return;
      isNearBottomRef.current = true;
      loadConversation();
      fetchContainerData();
      // Mark as read immediately (server-side mark happens via getMessages)
      markRead(conversationId);
      // Focus the message input when opening a conversation
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    } else {
      setMessages([]);
      setProviders(null);
      setAgents([]);
      setSelectedModel(getSavedModel());
      setSelectedAgent(getSavedAgent());
      setConversationRearchAgentId(null);
      setConversationRearchAgentName(null);
    }

    return () => {
      // Clear active conversation on unmount
      setActiveConversationId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, activeWorkspace?._id]);

  // Fetch providers and agents from the container
  const fetchContainerData = useCallback(async () => {
    if (!conversationId || conversationId === "new") return;

    // Try fetching providers
    try {
      const providerData = await api.getProviders(activeWorkspace?._id, conversationId);
      setProviders(providerData);

      // Set default model from provider defaults if not already selected
      if (!selectedModel && providerData?.default) {
        // providerData.default is like { "build": "providerID/modelID" } or similar
        const defaultEntry =
          providerData.default?.build ||
          providerData.default?.["code"] ||
          Object.values(providerData.default)[0];
        if (defaultEntry && typeof defaultEntry === "string") {
          const parts = defaultEntry.split("/");
          if (parts.length === 2) {
            setSelectedModel({ providerID: parts[0], modelID: parts[1] });
          }
        }
      }
    } catch (error) {
      // Container may not be ready yet, silently ignore
      console.log("Providers not available yet:", error.message);
    }

    // Try fetching agents
    try {
      const agentData = await api.getAgents(activeWorkspace?._id, conversationId);
      setAgents(agentData);

      // Ensure selectedAgent is valid
      if (agentData.length > 0) {
        const hasSelected = agentData.some((a) => a.name === selectedAgent);
        if (!hasSelected) {
          setSelectedAgent(agentData[0].name);
        }
      }
    } catch (error) {
      console.log("Agents not available yet:", error.message);
    }
  }, [conversationId, selectedModel, selectedAgent, activeWorkspace]);

  // Retry fetching container data if it wasn't available initially
  useEffect(() => {
    if (!conversationId || conversationId === "new") return;
    if (providers && agents.length > 0) return;

    const interval = setInterval(() => {
      fetchContainerData();
    }, 5000);

    return () => clearInterval(interval);
  }, [conversationId, providers, agents, fetchContainerData]);

  // Fetch the enabled ReArch agents when starting a new conversation
  useEffect(() => {
    if (conversationId !== "new") return;

    const fetchAgents = async () => {
      setIsLoadingRearchAgents(true);
      setSelectedRearchAgentId("");
      setAgentSearchQuery("");
      try {
        const list = await api.getRearchAgents();
        setRearchAgents(list);

        // Check for a pre-selected agent from the command palette
        try {
          const preselect = sessionStorage.getItem("command_palette_preselect_agent");
          if (preselect) {
            sessionStorage.removeItem("command_palette_preselect_agent");
            const { agentId } = JSON.parse(preselect);
            if (agentId && list.some((a) => a._id === agentId)) {
              setSelectedRearchAgentId(agentId);
            }
          }
        } catch {
          // ignore parse errors
        }
      } catch (error) {
        console.error("Error loading agents:", error);
        setRearchAgents([]);
      } finally {
        setIsLoadingRearchAgents(false);
      }
    };

    fetchAgents();

    // Listen for agent-preselected events (when palette selects while already on /new)
    const handleAgentPreselected = () => {
      fetchAgents();
    };
    window.addEventListener("agent-preselected", handleAgentPreselected);
    return () => window.removeEventListener("agent-preselected", handleAgentPreselected);
  }, [conversationId]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, streamingMessage]);

  const scrollToBottom = () => {
    const container = messageListRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const handleScroll = useCallback(() => {
    const container = messageListRef.current;
    if (!container) return;
    const threshold = 150;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
  }, []);

  const loadConversation = async () => {
    setIsLoadingMessages(true);
    try {
      const [messages, convData] = await Promise.all([
        api.getMessages(activeWorkspace?._id, conversationId),
        api.getConversation(activeWorkspace?._id, conversationId),
      ]);
      setMessages(messages);
      // Agent (preferred) or legacy repository link for the welcome screen
      const link = convData?.agent || convData?.resource;
      if (link) {
        const isPopulated = typeof link === "object";
        setConversationRearchAgentId(isPopulated ? link._id : link);
        if (isPopulated && link.name) {
          setConversationRearchAgentName(link.name);
        }
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Refresh session info after message completes
  const refreshSessionInfo = useCallback(() => {
    if (onSessionInfoUpdate) {
      onSessionInfoUpdate();
    }
  }, [onSessionInfoUpdate]);

  const handleQuestionEvent = useCallback((event) => {
    if (event.type === "question.asked") {
      setPendingQuestion({
        requestId: event.requestId,
        questions: event.questions,
        tool: event.tool,
        messageId: event.messageId,
        status: "pending",
      });
    } else if (event.type === "question.replied") {
      setPendingQuestion(null);
    } else if (event.type === "question.rejected") {
      setPendingQuestion(null);
    }
  }, []);

  const handlePermissionEvent = useCallback((event) => {
    if (event.type === "permission.asked") {
      setPendingPermission({
        requestId: event.requestId,
        sessionID: event.sessionID,
        permission: event.permission,
        patterns: event.patterns,
        metadata: event.metadata,
        always: event.always,
        tool: event.tool,
        status: "pending",
      });
    } else if (event.type === "permission.replied") {
      setPendingPermission(null);
    }
  }, []);

  const handleQuestionSubmit = useCallback(
    async (requestId, answers) => {
      try {
        await api.replyToQuestion(activeWorkspace?._id, conversationId, requestId, answers);
        setPendingQuestion(null);
      } catch (err) {
        console.error("Failed to submit question answers:", err);
        throw err;
      }
    },
    [conversationId],
  );

  const handleQuestionReject = useCallback(
    async (requestId) => {
      try {
        await api.rejectQuestion(activeWorkspace?._id, conversationId, requestId);
        setPendingQuestion(null);
      } catch (err) {
        console.error("Failed to reject question:", err);
        throw err;
      }
    },
    [conversationId],
  );

  const handlePermissionReply = useCallback(
    async (requestId, reply, message) => {
      try {
        await api.replyToPermission(activeWorkspace?._id, conversationId, requestId, reply, message);
        setPendingPermission(null);
      } catch (err) {
        console.error("Failed to reply to permission request:", err);
        throw err;
      }
    },
    [conversationId],
  );

  const handleSendMessage = async (content, files = []) => {
    if (!conversationId) return;

    // Always scroll to bottom when the user sends a message
    isNearBottomRef.current = true;

    // Immediately show the user message (with files for optimistic display)
    const userMessage = {
      role: "user",
      content,
      files: files.length > 0 ? files : undefined,
      _id: `temp-${Date.now()}`,
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsLoading(true);
    setPendingQuestion(null);
    setPendingPermission(null);
    markBusy(conversationId);

    // Build streaming message in native { info, parts } format
    const streamingId = `streaming-${Date.now()}`;
    setStreamingMessage({
      info: { id: streamingId, role: "assistant" },
      parts: [],
    });

    let accumulatedText = "";
    let toolParts = [];

    const buildStreamingParts = () => {
      const parts = [];
      if (accumulatedText) {
        parts.push({
          id: `${streamingId}-text`,
          type: "text",
          text: accumulatedText,
        });
      }
      parts.push(...toolParts);
      return parts;
    };

    await api.sendMessage(
      activeWorkspace?._id,
      conversationId,
      content,
      (chunk) => {
        accumulatedText += chunk;
        setStreamingMessage({
          info: { id: streamingId, role: "assistant" },
          parts: buildStreamingParts(),
        });
      },
      (toolEvent) => {
        // toolEvent is { type: "tool-call"|"tool-result", data: toolPartData }
        if (toolEvent.type === "tool-call" && toolEvent.data) {
          const part = toolEvent.data;
          // Upsert: update existing tool part by callID or id, or add new one
          const existingIdx = toolParts.findIndex(
            (t) =>
              (part.callID && t.callID === part.callID) ||
              (part.id && t.id === part.id),
          );
          if (existingIdx >= 0) {
            toolParts[existingIdx] = {
              ...toolParts[existingIdx],
              ...part,
              type: "tool",
            };
          } else {
            toolParts.push({ ...part, type: "tool" });
          }
        }
        setStreamingMessage({
          info: { id: streamingId, role: "assistant" },
          parts: buildStreamingParts(),
        });
      },
      (messageId) => {
        setIsLoading(false);
        setStreamingMessage(null);
        setPendingQuestion(null);
        setPendingPermission(null);
        markIdle(conversationId);
        loadConversation();
        onConversationUpdate();
        refreshSessionInfo();
      },
      (error) => {
        console.error("Error sending message:", error);
        setIsLoading(false);
        setStreamingMessage(null);
        markIdle(conversationId);
      },
      {
        model: selectedModel || undefined,
        agent: selectedAgent || undefined,
        files: files.length > 0 ? files : undefined,
        onQuestion: handleQuestionEvent,
        onPermission: handlePermissionEvent,
      },
    );
  };

  const handleEditMessage = async (messageId, content) => {
    setIsLoading(true);
    setPendingQuestion(null);
    setPendingPermission(null);
    markBusy(conversationId);

    // Remove messages after the edited one (support both native and legacy IDs)
    const editedMessageIndex = messages.findIndex(
      (m) => m._id === messageId || m.info?.id === messageId,
    );
    setMessages(messages.slice(0, editedMessageIndex + 1));

    // Build streaming message in native { info, parts } format
    const streamingId = `streaming-edit-${Date.now()}`;
    setStreamingMessage({
      info: { id: streamingId, role: "assistant" },
      parts: [],
    });

    let accumulatedText = "";
    let toolParts = [];

    const buildStreamingParts = () => {
      const parts = [];
      if (accumulatedText) {
        parts.push({
          id: `${streamingId}-text`,
          type: "text",
          text: accumulatedText,
        });
      }
      parts.push(...toolParts);
      return parts;
    };

    await api.editMessage(
      activeWorkspace?._id,
      conversationId,
      messageId,
      content,
      (chunk) => {
        accumulatedText += chunk;
        setStreamingMessage({
          info: { id: streamingId, role: "assistant" },
          parts: buildStreamingParts(),
        });
      },
      (toolEvent) => {
        if (toolEvent.type === "tool-call" && toolEvent.data) {
          const part = toolEvent.data;
          const existingIdx = toolParts.findIndex(
            (t) =>
              (part.callID && t.callID === part.callID) ||
              (part.id && t.id === part.id),
          );
          if (existingIdx >= 0) {
            toolParts[existingIdx] = {
              ...toolParts[existingIdx],
              ...part,
              type: "tool",
            };
          } else {
            toolParts.push({ ...part, type: "tool" });
          }
        }
        setStreamingMessage({
          info: { id: streamingId, role: "assistant" },
          parts: buildStreamingParts(),
        });
      },
      (newMessageId) => {
        setIsLoading(false);
        setStreamingMessage(null);
        setPendingQuestion(null);
        setPendingPermission(null);
        markIdle(conversationId);
        loadConversation();
        onConversationUpdate();
        refreshSessionInfo();
      },
      (error) => {
        console.error("Error editing message:", error);
        setIsLoading(false);
        setStreamingMessage(null);
        markIdle(conversationId);
        loadConversation();
      },
      {
        model: selectedModel || undefined,
        agent: selectedAgent || undefined,
        onQuestion: handleQuestionEvent,
        onPermission: handlePermissionEvent,
      },
    );
  };

  const handleStartConversation = async () => {
    if (!selectedRearchAgentId) {
      toast.warning(t("pleaseSelectAgent"));
      return;
    }

    setIsCreating(true);
    try {
      const newConv = await api.createConversation(
        activeWorkspace?._id,
        t("newConversation"),
        selectedRearchAgentId,
      );
      onConversationCreated(newConv);
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error(t("errorCreatingConversation", { message: error.message }));
    } finally {
      setIsCreating(false);
    }
  };

  // Show conversation layout with setup card for new conversations
  if (conversationId === "new") {
    const filteredAgents = rearchAgents.filter((agent) => {
      if (!agentSearchQuery) return true;
      const q = agentSearchQuery.toLowerCase();
      return (
        agent.name.toLowerCase().includes(q) ||
        (agent.description && agent.description.toLowerCase().includes(q)) ||
        (agent.repositoryName && agent.repositoryName.toLowerCase().includes(q))
      );
    });

    return (
      <div className="chat-interface">
        <div className="message-list">
          <div style={{ flex: 1 }} />
          {/* Setup card styled as an agent message */}
          <div className="message assistant">
            <div className="message-content-wrapper">
              <div className="message-content" style={{ cursor: "default" }}>
                <Typography
                  level="body-md"
                  sx={{ mb: 2, color: "var(--text-primary)" }}
                >
                  {t("selectAgent")}
                </Typography>

                {rearchAgents.length >= 6 && (
                  <div className="repo-search-container">
                    <Input
                      placeholder={t("searchAgents")}
                      value={agentSearchQuery}
                      onChange={(e) => setAgentSearchQuery(e.target.value)}
                      disabled={isCreating || isLoadingRearchAgents}
                      size="sm"
                      sx={{
                        bgcolor: "var(--bg-secondary)",
                        borderColor: "var(--border-color)",
                      }}
                      startDecorator={
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          opacity="0.5"
                        >
                          <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
                        </svg>
                      }
                    />
                  </div>
                )}

                {isLoadingRearchAgents ? (
                  <div className="repo-grid-loading">
                    <CircularProgress size="sm" />
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {t("loadingAgents")}
                    </Typography>
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <div className="repo-grid-empty">
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {rearchAgents.length === 0
                        ? t("noAgentsEnabled")
                        : t("noAgentsMatch")}
                    </Typography>
                  </div>
                ) : (
                  <div className="repo-grid-container">
                    <div className="repo-grid">
                      {filteredAgents.map((agent) => (
                        <div
                          key={agent._id}
                          data-testid={`agent-card-${agent.name}`}
                          className={`repo-card${selectedRearchAgentId === agent._id ? " selected" : ""}`}
                          onClick={() => {
                            if (isCreating) return;
                            setSelectedRearchAgentId(agent._id);
                          }}
                        >
                          <div className="repo-card-header">
                            <span className="repo-card-name">{agent.name}</span>
                            {agent.repositoryUrl && (
                              <button
                                className="repo-card-link"
                                title={t("openRepository")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(
                                    agent.repositoryUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 16 16"
                                  fill="currentColor"
                                >
                                  <path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5zm6.75 0a.75.75 0 000 1.5h1.94L8.22 7.72a.75.75 0 001.06 1.06l4.22-4.22v1.94a.75.75 0 001.5 0v-3.5A.75.75 0 0014.25 2h-3.75z" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <span className="repo-card-workspace">
                            {agent.repositoryName
                              ? agent.repositoryName
                              : agent.description || t("noRepositoryAgent")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  data-testid="start-conversation-btn"
                  onClick={handleStartConversation}
                  disabled={!selectedRearchAgentId || isCreating}
                  sx={{
                    mt: 1.5,
                    bgcolor: "#0052CC",
                    "&:hover": { bgcolor: "#0747A6" },
                    alignSelf: "flex-start",
                  }}
                  size="sm"
                  loading={isCreating}
                >
                  {t("startConversation")}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <MessageInput
          onSendMessage={() => {}}
          disabled={true}
          providers={null}
          agents={[]}
          selectedModel={null}
          onModelChange={() => {}}
          selectedAgent={null}
          onAgentChange={() => {}}
        />
      </div>
    );
  }

  // Show skeleton loader while container is starting/restarting
  if (conversationId && conversationId !== "new" && !isContainerReady) {
    return (
      <div className="chat-interface">
        <ChatSkeleton />
      </div>
    );
  }

  // Show welcome screen when conversation exists but has no messages yet
  const showWelcome =
    !isLoadingMessages &&
    messages.length === 0 &&
    !streamingMessage &&
    !isLoading;

  if (showWelcome) {
    return (
      <div className="chat-interface">
        <WelcomeScreen
          agentId={conversationRearchAgentId}
          agentName={conversationRearchAgentName || rearchAgents.find((a) => a._id === conversationRearchAgentId)?.name}
          onPromptClick={(promptText) => {
            handleSendMessage(promptText);
          }}
        >
          <MessageInput
            ref={messageInputRef}
            onSendMessage={handleSendMessage}
            disabled={isLoading || !!pendingQuestion || !!pendingPermission}
            providers={providers}
            agents={agents}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
          />
        </WelcomeScreen>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <MessageList
        messages={[
          ...messages,
          ...(streamingMessage ? [streamingMessage] : []),
        ]}
        isLoadingMessages={isLoadingMessages}
        onEditMessage={handleEditMessage}
        pendingQuestion={pendingQuestion}
        onQuestionSubmit={handleQuestionSubmit}
        onQuestionReject={handleQuestionReject}
        pendingPermission={pendingPermission}
        onPermissionReply={handlePermissionReply}
        containerRef={messageListRef}
        messagesEndRef={messagesEndRef}
        onScroll={handleScroll}
      />
      <MessageInput
        ref={messageInputRef}
        onSendMessage={handleSendMessage}
        disabled={isLoading || !!pendingQuestion || !!pendingPermission}
        providers={providers}
        agents={agents}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedAgent={selectedAgent}
        onAgentChange={setSelectedAgent}
      />
    </div>
  );
};

export default ChatInterface;

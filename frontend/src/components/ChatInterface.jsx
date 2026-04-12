import React, { useState, useEffect, useRef, useCallback } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import WelcomeScreen from "./WelcomeScreen";
import { api } from "../api/client";
import Button from "@mui/joy/Button";
import CircularProgress from "@mui/joy/CircularProgress";
import Typography from "@mui/joy/Typography";
import Input from "@mui/joy/Input";
import { useToast } from "../contexts/ToastContext";
import { useConversations } from "../contexts/ConversationsContext";
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
  const toast = useToast();
  const { markBusy, markIdle, markRead, setActiveConversationId } =
    useConversations();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState(null);
  const [selectedSubResource, setSelectedSubResource] = useState("");
  const [selectedRepoResourceId, setSelectedRepoResourceId] = useState("");
  const [allRepositories, setAllRepositories] = useState([]);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [pendingPermission, setPendingPermission] = useState(null);
  const [conversationSubResourceId, setConversationSubResourceId] = useState(null);

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
      setConversationSubResourceId(null);
    }

    return () => {
      // Clear active conversation on unmount
      setActiveConversationId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Fetch providers and agents from the container
  const fetchContainerData = useCallback(async () => {
    if (!conversationId || conversationId === "new") return;

    // Try fetching providers
    try {
      const providerData = await api.getProviders(conversationId);
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
      const agentData = await api.getAgents(conversationId);
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
  }, [conversationId, selectedModel, selectedAgent]);

  // Retry fetching container data if it wasn't available initially
  useEffect(() => {
    if (!conversationId || conversationId === "new") return;
    if (providers && agents.length > 0) return;

    const interval = setInterval(() => {
      fetchContainerData();
    }, 5000);

    return () => clearInterval(interval);
  }, [conversationId, providers, agents, fetchContainerData]);

  // Fetch all repositories when starting a new conversation
  useEffect(() => {
    if (conversationId !== "new") return;

    const fetchAllRepositories = async () => {
      setIsLoadingRepositories(true);
      setSelectedSubResource("");
      setSelectedRepoResourceId("");
      setRepoSearchQuery("");
      try {
        const repos = await api.getAllSubResources("bitbucket-repository");
        const enabledRepos = repos.filter((repo) => repo.rearch?.enabled);
        setAllRepositories(enabledRepos);

        // Check for pre-selected repo from the command palette
        try {
          const preselect = sessionStorage.getItem("command_palette_preselect_repo");
          if (preselect) {
            sessionStorage.removeItem("command_palette_preselect_repo");
            const { subResourceId, resourceId } = JSON.parse(preselect);
            if (subResourceId && enabledRepos.some((r) => r._id === subResourceId)) {
              setSelectedSubResource(subResourceId);
              setSelectedRepoResourceId(resourceId);
            }
          }
        } catch {
          // ignore parse errors
        }
      } catch (error) {
        console.error("Error loading repositories:", error);
        setAllRepositories([]);
      } finally {
        setIsLoadingRepositories(false);
      }
    };

    fetchAllRepositories();

    // Listen for repo-preselected events (when palette selects while already on /new)
    const handleRepoPreselected = () => {
      fetchAllRepositories();
    };
    window.addEventListener("repo-preselected", handleRepoPreselected);
    return () => window.removeEventListener("repo-preselected", handleRepoPreselected);
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
        api.getMessages(conversationId),
        api.getConversation(conversationId),
      ]);
      setMessages(messages);
      if (convData?.subResource) {
        setConversationSubResourceId(
          typeof convData.subResource === "object"
            ? convData.subResource._id
            : convData.subResource,
        );
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
        await api.replyToQuestion(conversationId, requestId, answers);
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
        await api.rejectQuestion(conversationId, requestId);
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
        await api.replyToPermission(conversationId, requestId, reply, message);
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
    if (!selectedRepoResourceId || !selectedSubResource) {
      toast.warning("Please select a repository");
      return;
    }

    setIsCreating(true);
    try {
      const newConv = await api.createConversation(
        "New Conversation",
        selectedRepoResourceId,
        selectedSubResource,
      );
      onConversationCreated(newConv);
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error(`Error creating conversation: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Show conversation layout with setup card for new conversations
  if (conversationId === "new") {
    const filteredRepos = allRepositories.filter((repo) => {
      if (!repoSearchQuery) return true;
      const q = repoSearchQuery.toLowerCase();
      return (
        repo.name.toLowerCase().includes(q) ||
        (repo.resourceName && repo.resourceName.toLowerCase().includes(q))
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
                  Select a repository to start a new conversation.
                </Typography>

                {allRepositories.length >= 6 && (
                  <div className="repo-search-container">
                    <Input
                      placeholder="Search repositories..."
                      value={repoSearchQuery}
                      onChange={(e) => setRepoSearchQuery(e.target.value)}
                      disabled={isCreating || isLoadingRepositories}
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

                {isLoadingRepositories ? (
                  <div className="repo-grid-loading">
                    <CircularProgress size="sm" />
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      Loading repositories...
                    </Typography>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div className="repo-grid-empty">
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {allRepositories.length === 0
                        ? "No repositories with ReArch enabled found. Enable ReArch on your repositories from the Resources page first."
                        : "No repositories match your search."}
                    </Typography>
                  </div>
                ) : (
                  <div className="repo-grid-container">
                    <div className="repo-grid">
                      {filteredRepos.map((repo) => (
                        <div
                          key={repo._id}
                          data-testid={`repo-card-${repo.name}`}
                          className={`repo-card${selectedSubResource === repo._id ? " selected" : ""}`}
                          onClick={() => {
                            if (isCreating) return;
                            setSelectedSubResource(repo._id);
                            setSelectedRepoResourceId(repo.resourceId);
                          }}
                        >
                          <div className="repo-card-header">
                            <span className="repo-card-name">{repo.name}</span>
                            {repo.data?.links?.html && (
                              <button
                                className="repo-card-link"
                                title="Open in Bitbucket"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(
                                    repo.data.links.html,
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
                            {repo.resourceName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  data-testid="start-conversation-btn"
                  onClick={handleStartConversation}
                  disabled={
                    !selectedRepoResourceId ||
                    !selectedSubResource ||
                    isCreating
                  }
                  sx={{
                    mt: 1.5,
                    bgcolor: "#0052CC",
                    "&:hover": { bgcolor: "#0747A6" },
                    alignSelf: "flex-start",
                  }}
                  size="sm"
                  loading={isCreating}
                >
                  Start Conversation
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
          subResourceId={conversationSubResourceId}
          repoName={allRepositories.find((r) => r._id === conversationSubResourceId)?.name}
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

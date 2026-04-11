import axios from "axios";
import config from "../config";

const API_BASE_URL = config.API_BASE_URL;
const TOKEN_KEY = "auth_token";

// ─── Axios interceptors for JWT ───────────────────────────────────────────────

// Request interceptor: attach Bearer token to every request
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 (expired/invalid token)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Redirect to login if not already there
      if (
        window.location.pathname !== "/login" &&
        !window.location.pathname.startsWith("/auth/")
      ) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

// Helper: get auth headers for fetch() calls (SSE streaming)
function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// Helper function to process SSE data events
const processSSEData = (
  data,
  onChunk,
  onToolCall,
  onDone,
  onError,
  onQuestion,
  onPermission,
) => {
  // Handle permission.asked events (agent needs permission for an action)
  if (data.type === "permission.asked") {
    if (onPermission) {
      onPermission({
        type: "permission.asked",
        requestId: data.requestId,
        sessionID: data.sessionID,
        permission: data.permission,
        patterns: data.patterns,
        metadata: data.metadata,
        always: data.always,
        tool: data.tool || null,
      });
    }
    return;
  }
  // Handle permission.replied events (permission was responded to, agent continues)
  if (data.type === "permission.replied") {
    if (onPermission) {
      onPermission({
        type: "permission.replied",
        requestId: data.requestId,
        sessionID: data.sessionID,
        reply: data.reply,
      });
    }
    return;
  }
  // Handle question.asked events (agent is asking the user a question)
  if (data.type === "question.asked") {
    if (onQuestion) {
      onQuestion({
        type: "question.asked",
        requestId: data.requestId,
        sessionID: data.sessionID,
        questions: data.questions,
        tool: data.tool || null,
        messageId: data.messageId,
      });
    }
    return;
  }
  // Handle question.replied events (question was answered, agent continues)
  if (data.type === "question.replied") {
    if (onQuestion) {
      onQuestion({
        type: "question.replied",
        requestId: data.requestId,
        answers: data.answers,
      });
    }
    return;
  }
  // Handle question.rejected events (question was dismissed)
  if (data.type === "question.rejected") {
    if (onQuestion) {
      onQuestion({
        type: "question.rejected",
        requestId: data.requestId,
      });
    }
    return;
  }
  // Handle message.part.delta events (incremental text streaming)
  if (data.type === "message.part.delta") {
    if (data.delta && data.field === "text") {
      onChunk(data.delta);
    }
  }
  // Handle message.part.updated events (streaming from OpenCode SDK)
  // The backend spreads event.properties, so structure is: { type, part, delta, ... }
  else if (data.type === "message.part.updated") {
    // Text part with delta - this is the streaming text
    if (data.part?.type === "text" && data.delta) {
      onChunk(data.delta);
    }
    // Tool part updates
    else if (data.part?.type === "tool") {
      onToolCall({ type: "tool-call", data: data.part });
    }
  }
  // Handle message.updated events (message metadata updates)
  else if (data.type === "message.updated") {
    // Message completed - could check data.info?.time?.completed
    if (data.info?.time?.completed) {
      // console.log("[SSE] Message completed");
    }
  }
  // Handle session.idle - session finished processing
  else if (data.type === "session.idle") {
    // console.log("[SSE] Session idle");
  }
  // Handle explicit done event from our backend wrapper
  else if (data.type === "done") {
    // console.log("[SSE] Done event");
    onDone(data.messageId || data.assistantMessageId);
  }
  // Handle response.complete from our backend wrapper
  else if (data.type === "response.complete") {
    // console.log("[SSE] Response complete");
    onDone(data.assistantMessageId, {
      contextUsage: data.contextUsage || null,
      cost: data.cost || null,
    });
  }
  // Handle tool-call events from backend
  else if (data.type === "tool-call") {
    onToolCall({ type: "tool-call", data: data.toolCall });
  }
  // Handle tool-result events from backend
  else if (data.type === "tool-result") {
    onToolCall({ type: "tool-result", data: data.toolResult });
  }
  // Handle errors
  else if (data.type === "error") {
    console.error("[SSE] Error event:", data.error);
    onError(data.error);
  } else if (data.type === "session.error") {
    const errorMsg = data.error?.data?.message || data.error || "Session error";
    console.error("[SSE] Session error:", errorMsg);
    onError(errorMsg);
  }
};

// Helper function to process SSE lines from a message
const processSSELines = (
  lines,
  onChunk,
  onToolCall,
  onDone,
  onError,
  onQuestion,
  onPermission,
) => {
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6));
        processSSEData(
          data,
          onChunk,
          onToolCall,
          onDone,
          onError,
          onQuestion,
          onPermission,
        );
      } catch (parseError) {
        console.error("Error parsing SSE data:", parseError, line);
      }
    }
  }
};

// Helper function to handle SSE streaming response
const handleSSEStream = async (
  response,
  onChunk,
  onToolCall,
  onDone,
  onError,
  onQuestion,
  onPermission,
) => {
  // console.log("[SSE] Starting stream, response status:", response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[SSE] Response not OK:", response.status, errorText);
    onError(`HTTP ${response.status}: ${errorText}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // console.log("[SSE] Stream done");
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    // console.log("[SSE] Raw chunk received:", chunk);
    buffer += chunk;

    // Split on double newline (SSE message separator)
    const messages = buffer.split("\n\n");
    // Keep the last potentially incomplete message in the buffer
    buffer = messages.pop() || "";

    for (const message of messages) {
      const lines = message.split("\n");
      processSSELines(
        lines,
        onChunk,
        onToolCall,
        onDone,
        onError,
        onQuestion,
        onPermission,
      );
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim()) {
    // console.log("[SSE] Processing remaining buffer:", buffer);
    const lines = buffer.split("\n");
    processSSELines(
      lines,
      onChunk,
      onToolCall,
      onDone,
      onError,
      onQuestion,
      onPermission,
    );
  }
};

export const api = {
  // Conversations
  createConversation: async (
    title = "New Conversation",
    repository,
    subResource,
  ) => {
    const response = await axios.post(`${API_BASE_URL}/conversations`, {
      title,
      repository,
      subResource,
    });
    return response.data;
  },

  createConversationByName: async (repoName) => {
    const response = await axios.post(
      `${API_BASE_URL}/conversations/start-by-name`,
      {
        name: repoName,
      },
    );
    return response.data;
  },

  getConversations: async () => {
    const response = await axios.get(`${API_BASE_URL}/conversations`);
    return response.data;
  },

  searchConversations: async (query) => {
    const response = await axios.get(`${API_BASE_URL}/conversations/search`, {
      params: { q: query },
    });
    return response.data;
  },

  getConversation: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/conversations/${id}`);
    return response.data;
  },

  getMessages: async (id) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${id}/messages`,
    );
    return response.data;
  },

  deleteConversation: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/conversations/${id}`);
    return response.data;
  },

  renameConversation: async (id, title) => {
    const response = await axios.patch(`${API_BASE_URL}/conversations/${id}`, {
      title,
    });
    return response.data;
  },

  // Conversation container data
  getProviders: async (conversationId) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/providers`,
    );
    return response.data;
  },

  getAgents: async (conversationId) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/agents`,
    );
    return response.data;
  },

  getSessionInfo: async (conversationId) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/session-info`,
    );
    return response.data;
  },

  getServices: async (conversationId) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/services`,
    );
    return response.data;
  },

  // File uploads
  uploadFiles: async (files) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    const response = await axios.post(
      `${API_BASE_URL}/files/upload`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  getFileUrl: (fileId) => {
    return `${API_BASE_URL}/files/${fileId}`;
  },

  getPublicFileUrl: (fileId) => {
    return `${API_BASE_URL}/files/public/${fileId}`;
  },

  // Messages
  sendMessage: async (
    conversationId,
    content,
    onChunk,
    onToolCall,
    onDone,
    onError,
    { model, agent, files, onQuestion, onPermission } = {},
  ) => {
    try {
      const body = { content };
      if (model) body.model = model;
      if (agent) body.agent = agent;
      if (files && files.length > 0) body.files = files;

      const response = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        },
      );

      await handleSSEStream(
        response,
        onChunk,
        onToolCall,
        onDone,
        onError,
        onQuestion,
        onPermission,
      );
    } catch (error) {
      console.error("[API] sendMessage error:", error);
      onError(error.message);
    }
  },

  editMessage: async (
    conversationId,
    messageId,
    content,
    onChunk,
    onToolCall,
    onDone,
    onError,
    { model, agent, onQuestion, onPermission } = {},
  ) => {
    try {
      const body = { content };
      if (model) body.model = model;
      if (agent) body.agent = agent;

      const response = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages/${messageId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        },
      );

      await handleSSEStream(
        response,
        onChunk,
        onToolCall,
        onDone,
        onError,
        onQuestion,
        onPermission,
      );
    } catch (error) {
      onError(error.message);
    }
  },

  // Question operations (agent asking user questions)
  replyToQuestion: async (conversationId, requestId, answers) => {
    const response = await axios.post(
      `${API_BASE_URL}/conversations/${conversationId}/question/${requestId}/reply`,
      { answers },
    );
    return response.data;
  },

  rejectQuestion: async (conversationId, requestId) => {
    const response = await axios.post(
      `${API_BASE_URL}/conversations/${conversationId}/question/${requestId}/reject`,
    );
    return response.data;
  },

  // Permission operations (agent requesting permission for actions)
  replyToPermission: async (conversationId, requestId, reply, message) => {
    const body = { reply };
    if (message) body.message = message;
    const response = await axios.post(
      `${API_BASE_URL}/conversations/${conversationId}/permission/${requestId}/reply`,
      body,
    );
    return response.data;
  },

  // Git operations
  getGitFiles: async (conversationId) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/git-files`,
    );
    return response.data;
  },

  getGitDiff: async (conversationId) => {
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/git-diff`,
    );
    return response.data;
  },

  getGitFileDiff: async (conversationId, filename) => {
    const response = await axios.post(
      `${API_BASE_URL}/conversations/${conversationId}/git-diff-file`,
      { filename },
    );
    return response.data;
  },

  commitAndPush: async (conversationId, { branchName, commitMessage }) => {
    const response = await axios.post(
      `${API_BASE_URL}/conversations/${conversationId}/git-commit-push`,
      { branchName, commitMessage },
    );
    return response.data;
  },

  createPullRequest: async (
    conversationId,
    { title, description, sourceBranch, reviewers },
  ) => {
    const response = await axios.post(
      `${API_BASE_URL}/conversations/${conversationId}/create-pr`,
      { title, description, sourceBranch, reviewers },
    );
    return response.data;
  },

  getBitbucketMembers: async (conversationId, search = "") => {
    const params = {};
    if (search) params.search = search;
    const response = await axios.get(
      `${API_BASE_URL}/conversations/${conversationId}/bitbucket-members`,
      { params },
    );
    return response.data;
  },

  // Resources
  getResources: async () => {
    const response = await axios.get(`${API_BASE_URL}/resources`);
    return response.data;
  },

  getResource: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/resources/${id}`);
    return response.data;
  },

  createResource: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/resources`, data);
    return response.data;
  },

  uploadFileResource: async (name, file) => {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("file", file);

    const response = await axios.post(
      `${API_BASE_URL}/resources/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  updateResource: async (id, data) => {
    const response = await axios.put(`${API_BASE_URL}/resources/${id}`, data);
    return response.data;
  },

  deleteResource: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/resources/${id}`);
    return response.data;
  },

  downloadFile: (fileId) => {
    return `${API_BASE_URL}/resources/file/${fileId}`;
  },

  // Get all subresources across all resources, with optional type filter
  getAllSubResources: async (type) => {
    const params = type ? `?type=${encodeURIComponent(type)}` : "";
    const response = await axios.get(
      `${API_BASE_URL}/resources/subresources${params}`,
    );
    return response.data;
  },

  // SubResources
  getSubResources: async (resourceId) => {
    const response = await axios.get(
      `${API_BASE_URL}/resources/${resourceId}/subresources`,
    );
    return response.data;
  },

  getSubResource: async (resourceId, subResourceId) => {
    const response = await axios.get(
      `${API_BASE_URL}/resources/${resourceId}/subresources/${subResourceId}`,
    );
    return response.data;
  },

  createSubResource: async (resourceId, data) => {
    const response = await axios.post(
      `${API_BASE_URL}/resources/${resourceId}/subresources`,
      data,
    );
    return response.data;
  },

  updateSubResource: async (resourceId, subResourceId, data) => {
    const response = await axios.post(
      `${API_BASE_URL}/resources/${resourceId}/subresources/${subResourceId}`,
      data,
    );
    return response.data;
  },

  deleteSubResource: async (resourceId, subResourceId) => {
    const response = await axios.delete(
      `${API_BASE_URL}/resources/${resourceId}/subresources/${subResourceId}`,
    );
    return response.data;
  },

  searchSubResources: async (resourceId, query) => {
    const response = await axios.post(
      `${API_BASE_URL}/resources/${resourceId}/subresources/import/search`,
      { query },
    );
    return response.data;
  },

  importSubResource: async (resourceId, data) => {
    const response = await axios.post(
      `${API_BASE_URL}/resources/${resourceId}/subresources/import/import`,
      data,
    );
    return response.data;
  },

  executeSubResourceAction: async (resourceId, subResourceId, action, data) => {
    const response = await axios.post(
      `${API_BASE_URL}/resources/${resourceId}/subresources/${subResourceId}/action/${action}`,
      data,
    );
    return response.data;
  },

  getSubResourceDockerfile: async (resourceId, subResourceId, ref) => {
    const params = ref ? { ref } : {};
    const response = await axios.get(
      `${API_BASE_URL}/resources/${resourceId}/subresources/${subResourceId}/dockerfile`,
      { params },
    );
    return response.data;
  },

  // Tools
  getTools: async () => {
    const response = await axios.get(`${API_BASE_URL}/tools`);
    return response.data;
  },

  // Skills
  getSkills: async () => {
    const response = await axios.get(`${API_BASE_URL}/skills`);
    return response.data;
  },

  getSkill: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/skills/${id}`);
    return response.data;
  },

  createSkill: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/skills`, data);
    return response.data;
  },

  updateSkill: async (id, data) => {
    const response = await axios.put(`${API_BASE_URL}/skills/${id}`, data);
    return response.data;
  },

  deleteSkill: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/skills/${id}`);
    return response.data;
  },

  // Jobs (admin)
  getJobs: async (params = {}) => {
    const response = await axios.get(`${API_BASE_URL}/jobs`, { params });
    return response.data;
  },

  getJob: async (queue, id) => {
    const response = await axios.get(`${API_BASE_URL}/jobs/${queue}/${id}`);
    return response.data;
  },

  // Usage analytics (admin)
  getUsage: async (params = {}) => {
    const response = await axios.get(`${API_BASE_URL}/usage`, { params });
    return response.data;
  },

  getUsageFilters: async () => {
    const response = await axios.get(`${API_BASE_URL}/usage/filters`);
    return response.data;
  },

  // Account (self-service)
  changePassword: async (currentPassword, newPassword) => {
    const response = await axios.post(`${API_BASE_URL}/auth/change-password`, {
      currentPassword,
      newPassword,
    });
    return response.data;
  },

  updateProfile: async (data) => {
    const response = await axios.patch(`${API_BASE_URL}/auth/profile`, data);
    return response.data;
  },

  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await axios.post(`${API_BASE_URL}/auth/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  deleteAvatar: async () => {
    const response = await axios.delete(`${API_BASE_URL}/auth/avatar`);
    return response.data;
  },

  // Users (admin)
  getUsers: async (params = {}) => {
    const response = await axios.get(`${API_BASE_URL}/users`, { params });
    return response.data;
  },

  getUser: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/users/${id}`);
    return response.data;
  },

  updateUser: async (id, data) => {
    const response = await axios.put(`${API_BASE_URL}/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/users/${id}`);
    return response.data;
  },

  // Settings
  getSettings: async () => {
    const response = await axios.get(`${API_BASE_URL}/settings`);
    return response.data;
  },

  // Signup restriction settings
  getSignupSettings: async () => {
    const response = await axios.get(`${API_BASE_URL}/settings/signup/public`);
    return response.data;
  },

  updateSignupSettings: async (data) => {
    const response = await axios.put(`${API_BASE_URL}/settings/signup`, data);
    return response.data;
  },

  // Docker rebuild schedule settings (admin)
  getDockerRebuildSettings: async () => {
    const response = await axios.get(`${API_BASE_URL}/settings/docker-rebuild`);
    return response.data;
  },

  updateDockerRebuildSettings: async (data) => {
    const response = await axios.put(
      `${API_BASE_URL}/settings/docker-rebuild`,
      data,
    );
    return response.data;
  },

  triggerDockerRebuildAll: async () => {
    const response = await axios.post(
      `${API_BASE_URL}/settings/docker-rebuild/trigger`,
    );
    return response.data;
  },

  // Container cleanup settings (admin)
  getContainerCleanupSettings: async () => {
    const response = await axios.get(
      `${API_BASE_URL}/settings/container-cleanup`,
    );
    return response.data;
  },

  updateContainerCleanupSettings: async (data) => {
    const response = await axios.put(
      `${API_BASE_URL}/settings/container-cleanup`,
      data,
    );
    return response.data;
  },

  triggerContainerCleanup: async () => {
    const response = await axios.post(
      `${API_BASE_URL}/settings/container-cleanup/trigger`,
    );
    return response.data;
  },

  // MCP Servers
  getMcpGallery: async () => {
    const response = await axios.get(`${API_BASE_URL}/mcp/gallery`);
    return response.data;
  },
  getMcpServers: async () => {
    const response = await axios.get(`${API_BASE_URL}/mcp/servers`);
    return response.data;
  },
  createMcpServer: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/mcp/servers`, data);
    return response.data;
  },
  updateMcpServer: async (name, data) => {
    const response = await axios.put(
      `${API_BASE_URL}/mcp/servers/${name}`,
      data,
    );
    return response.data;
  },
  deleteMcpServer: async (name) => {
    const response = await axios.delete(`${API_BASE_URL}/mcp/servers/${name}`);
    return response.data;
  },
  getMcpStatus: async () => {
    const response = await axios.get(`${API_BASE_URL}/mcp/status`);
    return response.data;
  },
  reloadMcpProxy: async () => {
    const response = await axios.post(`${API_BASE_URL}/mcp/reload`);
    return response.data;
  },

  // Suggested Prompt Categories
  getSuggestedPromptCategories: async () => {
    const response = await axios.get(`${API_BASE_URL}/suggested-prompts/categories`);
    return response.data;
  },

  createSuggestedPromptCategory: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/suggested-prompts/categories`, data);
    return response.data;
  },

  updateSuggestedPromptCategory: async (id, data) => {
    const response = await axios.put(`${API_BASE_URL}/suggested-prompts/categories/${id}`, data);
    return response.data;
  },

  deleteSuggestedPromptCategory: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/suggested-prompts/categories/${id}`);
    return response.data;
  },

  // Suggested Prompts
  getSuggestedPrompts: async () => {
    const response = await axios.get(`${API_BASE_URL}/suggested-prompts`);
    return response.data;
  },

  getSuggestedPromptsForRepo: async (subResourceId) => {
    const response = await axios.get(`${API_BASE_URL}/suggested-prompts/for-repo/${subResourceId}`);
    return response.data;
  },

  createSuggestedPrompt: async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/suggested-prompts`, formData, {
      headers: formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    });
    return response.data;
  },

  updateSuggestedPrompt: async (id, formData) => {
    const response = await axios.put(`${API_BASE_URL}/suggested-prompts/${id}`, formData, {
      headers: formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    });
    return response.data;
  },

  deleteSuggestedPrompt: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/suggested-prompts/${id}`);
    return response.data;
  },

  // LLM Providers
  getLlmProviders: async () => {
    const response = await axios.get(`${API_BASE_URL}/llm-providers`);
    return response.data;
  },

  getLlmProvider: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/llm-providers/${id}`);
    return response.data;
  },

  getLlmProviderRegistry: async () => {
    const response = await axios.get(`${API_BASE_URL}/llm-providers/registry`);
    return response.data;
  },

  createLlmProvider: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/llm-providers`, data);
    return response.data;
  },

  updateLlmProvider: async (id, data) => {
    const response = await axios.put(`${API_BASE_URL}/llm-providers/${id}`, data);
    return response.data;
  },

  deleteLlmProvider: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/llm-providers/${id}`);
    return response.data;
  },
};

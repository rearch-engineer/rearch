/**
 * Built-in ReArch MCP tools.
 *
 * These tools are always available alongside upstream tools and allow AI agents
 * inside conversation containers to:
 *   1. Search for available agents (each agent may be bound to a repository)
 *   2. Create new conversations (max 3 per call) with an initial prompt
 *
 * Agent search queries MongoDB directly (mongoose is already available).
 * Conversation creation delegates to the backend internal API so that all
 * existing logic (BullMQ job scheduling, Docker provisioning, WebSocket
 * broadcasts) is reused.
 */

import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:5000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const MAX_CONVERSATIONS_PER_CALL = 3;

// ---------------------------------------------------------------------------
// Mongoose models (mirrors backend models — reuse if already compiled)
// ---------------------------------------------------------------------------

// Resource: something an agent works with (today: repositories), imported through a Connection
const resourceSchema = new mongoose.Schema(
  {
    connection: { type: mongoose.Schema.Types.ObjectId, ref: 'Connection' },
    name: { type: String },
    description: { type: String, default: '' },
    kind: { type: String },
    provider: { type: String },
  },
  { timestamps: true, strict: false },
);

const Resource = mongoose.models.Resource || mongoose.model('Resource', resourceSchema);

const agentSchema = new mongoose.Schema(
  {
    name: { type: String },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    repository: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  },
  { timestamps: true, strict: false },
);

const Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);

const conversationSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: false },
);

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

// Connection: provider credentials (Bitbucket workspace, GitHub App)
const connectionSchema = new mongoose.Schema(
  {
    provider: { type: String },
  },
  { timestamps: true, strict: false },
);

const Connection =
  mongoose.models.Connection || mongoose.model('Connection', connectionSchema);

// ---------------------------------------------------------------------------
// Tool definitions (MCP schema format)
// ---------------------------------------------------------------------------

const BUILTIN_TOOLS = [
  {
    name: 'rearch_search_agents',
    description:
      '[rearch] Search for available agents. Returns enabled agents (and the repository each one works on, if any) that can be used to create new conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Optional search text to filter agents by name, description or repository name. Leave empty to list all.',
        },
      },
    },
  },
  {
    name: 'rearch_create_conversation',
    description:
      '[rearch] Create new conversations with one or more agents. Each conversation gets its own dev container and the prompt is sent to the AI agent immediately. Maximum 3 conversations per call.',
    inputSchema: {
      type: 'object',
      properties: {
        conversations: {
          type: 'array',
          description: 'Array of conversations to create (max 3).',
          maxItems: MAX_CONVERSATIONS_PER_CALL,
          items: {
            type: 'object',
            properties: {
              agent: {
                type: 'string',
                description:
                  'The agent ID (from rearch_search_agents results).',
              },
              prompt: {
                type: 'string',
                description: 'The initial prompt to send to the AI agent.',
              },
            },
            required: ['agent', 'prompt'],
          },
        },
      },
      required: ['conversations'],
    },
  },
];

const BUILTIN_TOOL_NAMES = new Set([
  ...BUILTIN_TOOLS.map((t) => t.name),
  'rearch_search_repositories', // legacy alias of rearch_search_agents
]);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** @returns {Array} MCP tool definitions for built-in tools */
export function getBuiltinTools() {
  return BUILTIN_TOOLS;
}

/** @param {string} name */
export function isBuiltinTool(name) {
  return BUILTIN_TOOL_NAMES.has(name);
}

/**
 * Execute a built-in tool.
 *
 * @param {string} name - Tool name
 * @param {object} args - Tool arguments
 * @param {Request} request - Original HTTP request (for reading headers)
 * @returns {Promise<object>} MCP tool result
 */
export async function callBuiltinTool(name, args, request, identity = null) {
  switch (name) {
    case 'rearch_search_agents':
    case 'rearch_search_repositories': // legacy name
      return handleSearchAgents(args);
    case 'rearch_create_conversation':
      return handleCreateConversation(args, request, identity);
    default:
      throw new Error(`Unknown built-in tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleSearchAgents(args) {
  const { query } = args || {};

  const filter = { enabled: true };

  if (query && query.trim()) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = { $regex: escaped, $options: 'i' };
    // Also match agents through the name of the repository they work on
    const repos = await Resource.find({ name: re }).select('_id').lean();
    const repositoryIds = repos.map((r) => r._id);
    filter.$or = [
      { name: re },
      { description: re },
      ...(repositoryIds.length > 0 ? [{ repository: { $in: repositoryIds } }] : []),
    ];
  }

  const docs = await Agent.find(filter)
    .populate({
      path: 'repository',
      select: 'name kind provider connection',
      populate: { path: 'connection', select: 'provider' },
    })
    .select('name description repository')
    .sort({ name: 1 })
    .lean();

  const results = docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description || '',
    repository: doc.repository
      ? {
          id: doc.repository._id.toString(),
          name: doc.repository.name,
          provider: doc.repository.provider || doc.repository.connection?.provider || 'unknown',
          kind: doc.repository.kind,
        }
      : null,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

async function handleCreateConversation(args, request, identity = null) {
  const { conversations } = args || {};

  if (!Array.isArray(conversations) || conversations.length === 0) {
    return {
      content: [{ type: 'text', text: 'Error: conversations array is required and must not be empty.' }],
      isError: true,
    };
  }

  if (conversations.length > MAX_CONVERSATIONS_PER_CALL) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Maximum ${MAX_CONVERSATIONS_PER_CALL} conversations per call. Got ${conversations.length}.`,
        },
      ],
      isError: true,
    };
  }

  // Resolve the calling user. Prefer the HMAC-verified identity token; fall
  // back to the legacy (unsigned) conversation-id header for containers that
  // were created before the identity header existed.
  let userId = identity?.userId || null;

  if (!userId) {
    const callerConversationId = request?.headers?.get('x-mcp-conversation-id');
    if (!callerConversationId) {
      return {
        content: [{ type: 'text', text: 'Error: Missing X-MCP-Identity / X-MCP-Conversation-Id header. Cannot determine calling user.' }],
        isError: true,
      };
    }

    const callerConversation = await Conversation.findById(callerConversationId)
      .select('createdBy')
      .lean();

    if (!callerConversation || !callerConversation.createdBy) {
      return {
        content: [{ type: 'text', text: 'Error: Could not resolve calling user from conversation.' }],
        isError: true,
      };
    }

    userId = callerConversation.createdBy.toString();
  }

  // Create all conversations in parallel
  const results = await Promise.allSettled(
    conversations.map((conv) =>
      createSingleConversation(userId, conv.agent, conv.repository, conv.prompt),
    ),
  );

  const output = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      agent: conversations[i].agent || conversations[i].repository,
      error: result.reason?.message || 'Unknown error',
    };
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// `agentId` is preferred; `resourceId` (a repository id) is still accepted
// for callers that used the old rearch_search_repositories tool.
async function createSingleConversation(userId, agentId, resourceId, prompt) {
  if (!agentId && !resourceId) {
    throw new Error('agent is required');
  }
  const url = `${BACKEND_API_URL}/api/internal/conversations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_API_SECRET,
    },
    body: JSON.stringify({
      userId,
      ...(agentId ? { agentId } : {}),
      ...(resourceId ? { resourceId } : {}),
      prompt,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Backend returned ${response.status}`);
  }

  const data = await response.json();

  return {
    conversation: data._id,
    link: `${FRONTEND_URL}/conversations/${data._id}`,
  };
}

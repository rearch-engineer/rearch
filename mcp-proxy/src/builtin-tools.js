/**
 * Built-in ReArch MCP tools.
 *
 * These tools are always available alongside upstream tools and allow AI agents
 * inside conversation containers to:
 *   1. Search for available repositories
 *   2. Create new conversations (max 3 per call) with an initial prompt
 *
 * Repository search queries MongoDB directly (mongoose is already available).
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

const subResourceSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
    name: { type: String },
    description: { type: String, default: '' },
    type: { type: String },
    rearch: {
      enabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true, strict: false },
);

const SubResource =
  mongoose.models.SubResource || mongoose.model('SubResource', subResourceSchema);

const conversationSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: false },
);

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

const resourceSchema = new mongoose.Schema(
  {
    provider: { type: String },
  },
  { timestamps: true, strict: false },
);

const Resource =
  mongoose.models.Resource || mongoose.model('Resource', resourceSchema);

// ---------------------------------------------------------------------------
// Tool definitions (MCP schema format)
// ---------------------------------------------------------------------------

const BUILTIN_TOOLS = [
  {
    name: 'rearch_search_repositories',
    description:
      '[rearch] Search for available repositories. Returns enabled repos that can be used to create new conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Optional search text to filter repositories by name or description. Leave empty to list all.',
        },
      },
    },
  },
  {
    name: 'rearch_create_conversation',
    description:
      '[rearch] Create new conversations for one or more repositories. Each conversation gets its own dev container and the prompt is sent to the AI agent immediately. Maximum 3 conversations per call.',
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
              repository: {
                type: 'string',
                description:
                  'The repository ID (from rearch_search_repositories results).',
              },
              prompt: {
                type: 'string',
                description: 'The initial prompt to send to the AI agent.',
              },
            },
            required: ['repository', 'prompt'],
          },
        },
      },
      required: ['conversations'],
    },
  },
];

const BUILTIN_TOOL_NAMES = new Set(BUILTIN_TOOLS.map((t) => t.name));

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
export async function callBuiltinTool(name, args, request) {
  switch (name) {
    case 'rearch_search_repositories':
      return handleSearchRepositories(args);
    case 'rearch_create_conversation':
      return handleCreateConversation(args, request);
    default:
      throw new Error(`Unknown built-in tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleSearchRepositories(args) {
  const { query } = args || {};

  const filter = {
    'rearch.enabled': true,
    type: { $in: ['bitbucket-repository', 'github-repository'] },
  };

  if (query && query.trim()) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ];
  }

  const docs = await SubResource.find(filter)
    .populate('resource', 'provider')
    .select('name description type resource')
    .sort({ name: 1 })
    .lean();

  const results = docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description || '',
    provider: doc.resource?.provider || 'unknown',
    type: doc.type,
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

async function handleCreateConversation(args, request) {
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

  // Resolve the calling user from the conversation that owns this container
  const callerConversationId = request?.headers?.get('x-mcp-conversation-id');
  if (!callerConversationId) {
    return {
      content: [{ type: 'text', text: 'Error: Missing X-MCP-Conversation-Id header. Cannot determine calling user.' }],
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

  const userId = callerConversation.createdBy.toString();

  // Create all conversations in parallel
  const results = await Promise.allSettled(
    conversations.map((conv) =>
      createSingleConversation(userId, conv.repository, conv.prompt),
    ),
  );

  const output = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      repository: conversations[i].repository,
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

async function createSingleConversation(userId, subResourceId, prompt) {
  const url = `${BACKEND_API_URL}/api/internal/conversations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_API_SECRET,
    },
    body: JSON.stringify({ userId, subResourceId, prompt }),
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

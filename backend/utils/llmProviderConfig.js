/**
 * Builds OpenCode-compatible provider configuration from the LlmProvider
 * collection in MongoDB.
 *
 * This is used by createConversationContainer to inject provider credentials
 * into the OPENCODE_CONFIG_CONTENT environment variable.
 */
import LlmProvider from "../models/LlmProvider.js";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import { decrypt } from "./encryption.js";

/**
 * Build the `provider` section of the opencode.json config from the database.
 * Only includes enabled providers with a valid API key and at least one enabled model.
 *
 * Multiple entries can exist for the same providerId (e.g. two Anthropic configs
 * with different keys/models). The first enabled entry with a valid key wins;
 * model whitelists from all entries for the same provider are merged.
 *
 * @returns {Promise<Object>} OpenCode provider config, e.g.:
 * {
 *   "anthropic": {
 *     "options": { "apiKey": "sk-ant-..." },
 *     "whitelist": ["claude-sonnet-4-20250514"]
 *   }
 * }
 */
export async function buildProviderConfig() {
  const providers = await LlmProvider.find({ enabled: true });
  const config = {};

  for (const provider of providers) {
    // Skip providers without an encrypted API key
    if (!provider.apiKey?.ciphertext) continue;

    // Get enabled models
    const enabledModels = (provider.models || []).filter((m) => m.enabled);
    if (enabledModels.length === 0) continue;

    // Decrypt the API key
    let plainKey;
    try {
      plainKey = decrypt(
        provider.apiKey.ciphertext,
        provider.apiKey.iv,
        provider.apiKey.tag,
      );
    } catch (err) {
      console.error(
        `Failed to decrypt API key for provider ${provider.providerId}:`,
        err.message,
      );
      continue;
    }

    if (config[provider.providerId]) {
      // Merge model whitelists from additional entries for the same provider
      const existing = new Set(config[provider.providerId].whitelist);
      for (const m of enabledModels) {
        existing.add(m.modelId);
      }
      config[provider.providerId].whitelist = [...existing];
    } else {
      const options = { apiKey: plainKey };
      if (provider.baseUrl) {
        options.baseURL = provider.baseUrl;
      }
      config[provider.providerId] = {
        options,
        whitelist: enabledModels.map((m) => m.modelId),
      };
    }
  }

  return config;
}

/**
 * Get the default model (first enabled model from the first enabled provider).
 * Used as the fallback when no model is explicitly selected by the user.
 *
 * @returns {Promise<{ providerID: string, modelID: string } | null>}
 */
export async function getDefaultModel() {
  const providers = await LlmProvider.find({ enabled: true }).sort({
    providerId: 1,
  });

  for (const provider of providers) {
    if (!provider.apiKey?.ciphertext) continue;
    const enabledModel = (provider.models || []).find((m) => m.enabled);
    if (enabledModel) {
      return {
        providerID: provider.providerId,
        modelID: enabledModel.modelId,
      };
    }
  }

  return null;
}

/**
 * Build the OpenCode auth.json content for GitHub Copilot.
 *
 * OpenCode stores provider credentials in `~/.local/share/opencode/auth.json`,
 * separate from the provider configuration in `opencode.json`.  GitHub Copilot
 * uses OAuth-style authentication with the provider ID `"github-copilot"`.
 *
 * Returns an object suitable for writing to auth.json, e.g.:
 * ```json
 * { "github-copilot": { "type": "oauth", "refresh": "gho_...", "access": "gho_...", "expires": 0 } }
 * ```
 * Returns an empty object if:
 * - The GitHub Copilot integration is disabled by the admin
 * - The user has not connected their Copilot token
 * - The token cannot be decrypted
 *
 * @param {string} userId - The ID of the user (conversation creator)
 * @returns {Promise<Object>} Auth config fragment for auth.json (may be empty)
 */
export async function buildCopilotAuthConfig(userId) {
  if (!userId) return {};

  // Check if the admin has enabled the GitHub Copilot integration
  const integrationsSetting = await Setting.findOne({ key: "integrations" });
  if (!integrationsSetting?.value?.githubCopilotEnabled) return {};

  // Load the user's Copilot token
  const user = await User.findById(userId);
  if (!user?.tools?.github_copilot?.token?.ciphertext) return {};

  // Decrypt the token
  const { ciphertext, iv, tag } = user.tools.github_copilot.token;
  let plainToken;
  try {
    plainToken = decrypt(ciphertext, iv, tag);
  } catch (err) {
    console.error(
      `Failed to decrypt GitHub Copilot token for user ${userId}:`,
      err.message,
    );
    return {};
  }

  return {
    "github-copilot": {
      type: "oauth",
      refresh: plainToken,
      access: plainToken,
      expires: 0,
    },
  };
}


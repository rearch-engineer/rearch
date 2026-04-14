/**
 * Builds OpenCode-compatible provider configuration from the LlmProvider
 * collection in MongoDB.
 *
 * This is used by createConversationContainer to inject provider credentials
 * into the OPENCODE_CONFIG_CONTENT environment variable.
 */
import LlmProvider from "../models/LlmProvider.js";
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


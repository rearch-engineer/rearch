/**
 * Static registry of known LLM providers and their models.
 * Used to populate the admin UI with available options.
 *
 * This is a reference list — providers and models can still be configured
 * freely by admins (e.g. for custom/self-hosted models), but this gives
 * a convenient starting point.
 */
const KNOWN_PROVIDERS = {
  anthropic: {
    name: "Anthropic",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    name: "OpenAI",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
      { id: "gpt-5.4-nano", name: "GPT-5.4 Nano" },
    ],
  },
  google: {
    name: "Google",
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
    ],
  },
};

/**
 * Get the full registry of known providers and models.
 * @returns {Object} Map of providerId -> { name, models: [{ id, name }] }
 */
export function getKnownProviders() {
  return KNOWN_PROVIDERS;
}

/**
 * Get known models for a specific provider.
 * @param {string} providerId
 * @returns {Array<{ id: string, name: string }>|null}
 */
export function getKnownModels(providerId) {
  return KNOWN_PROVIDERS[providerId]?.models || null;
}

/**
 * Get provider display name.
 * @param {string} providerId
 * @returns {string|null}
 */
export function getProviderName(providerId) {
  return KNOWN_PROVIDERS[providerId]?.name || null;
}

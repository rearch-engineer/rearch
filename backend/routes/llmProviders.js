import { Elysia } from "elysia";
import { z } from "zod";
import LlmProvider from "../models/LlmProvider.js";
import { authPlugin } from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";
import { encrypt, decrypt, maskApiKey } from "../utils/encryption.js";
import { getKnownProviders } from "../utils/llmProviderRegistry.js";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const modelSchema = z.object({
  modelId: z.string().min(1, "Model ID is required"),
  name: z.string().min(1, "Model name is required"),
  enabled: z.boolean().default(true),
});

const createProviderSchema = z.object({
  providerId: z
    .string()
    .min(1, "Provider ID is required")
    .max(50)
    .regex(
      /^[a-z0-9_-]+$/,
      "Provider ID must be lowercase alphanumeric with hyphens/underscores",
    ),
  name: z.string().min(1, "Provider name is required").max(100),
  enabled: z.boolean().default(true),
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url("Must be a valid URL").optional().nullable(),
  models: z.array(modelSchema).min(1, "At least one model is required"),
});

const updateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().optional(), // Empty string or omitted = keep existing key
  baseUrl: z.string().url("Must be a valid URL").optional().nullable(),
  models: z.array(modelSchema).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Transform a provider document for API response (mask API key).
 */
function toSafeResponse(doc) {
  const obj = doc.toJSON ? doc.toJSON() : { ...doc };

  // Decrypt and mask the API key for display
  let maskedKey = null;
  if (obj.apiKey?.ciphertext) {
    try {
      const plainKey = decrypt(
        obj.apiKey.ciphertext,
        obj.apiKey.iv,
        obj.apiKey.tag,
      );
      maskedKey = maskApiKey(plainKey);
    } catch {
      maskedKey = "****";
    }
  }

  return {
    _id: obj._id,
    providerId: obj.providerId,
    name: obj.name,
    enabled: obj.enabled,
    apiKey: maskedKey,
    hasApiKey: !!obj.apiKey?.ciphertext,
    baseUrl: obj.baseUrl || null,
    models: obj.models,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: "/api/llm-providers" })
  .use(authPlugin)
  .use(requireRole("admin"))

  // ─── List known providers (static registry) ─────────────────────────────

  /**
   * Get the static registry of known providers and models.
   * Useful for populating UI when adding a new provider.
   * GET /api/llm-providers/registry
   */
  .get(
    "/registry",
    async ({ status }) => {
      try {
        return getKnownProviders();
      } catch (err) {
        console.error("Error fetching provider registry:", err);
        return status(500, { error: err.message });
      }
    },
  )

  // ─── List all configured providers ──────────────────────────────────────

  /**
   * Get all configured LLM providers (API keys masked).
   * GET /api/llm-providers
   */
  .get(
    "/",
    async ({ status }) => {
      try {
        const providers = await LlmProvider.find().sort({ providerId: 1 });
        return providers.map(toSafeResponse);
      } catch (err) {
        console.error("Error fetching LLM providers:", err);
        return status(500, { error: err.message });
      }
    },
  )

  // ─── Get single provider ────────────────────────────────────────────────

  /**
   * Get a single LLM provider by ID (API key masked).
   * GET /api/llm-providers/:id
   */
  .get(
    "/:id",
    async ({ params, status }) => {
      try {
        const provider = await LlmProvider.findById(params.id);
        if (!provider) {
          return status(404, { error: "Provider not found" });
        }
        return toSafeResponse(provider);
      } catch (err) {
        console.error("Error fetching LLM provider:", err);
        return status(500, { error: err.message });
      }
    },
  )

  // ─── Create a new provider ──────────────────────────────────────────────

  /**
   * Create a new LLM provider configuration.
   * POST /api/llm-providers
   * Body: { providerId, name, enabled, apiKey, models }
   */
  .post(
    "/",
    async ({ body, status }) => {
      try {
        const parsed = createProviderSchema.safeParse(body);
        if (!parsed.success) {
          return status(400, {
            error: parsed.error.errors.map((e) => e.message).join(", "),
          });
        }

        const { providerId, name, enabled, apiKey, baseUrl, models } = parsed.data;

        // Encrypt the API key
        const encryptedKey = encrypt(apiKey);

        const provider = await LlmProvider.create({
          providerId,
          name,
          enabled,
          baseUrl: baseUrl || null,
          apiKey: {
            ciphertext: encryptedKey.ciphertext,
            iv: encryptedKey.iv,
            tag: encryptedKey.tag,
          },
          models,
        });

        return toSafeResponse(provider);
      } catch (err) {
        console.error("Error creating LLM provider:", err);
        return status(500, { error: err.message });
      }
    },
  )

  // ─── Update a provider ──────────────────────────────────────────────────

  /**
   * Update an existing LLM provider configuration.
   * PUT /api/llm-providers/:id
   * Body: { name?, enabled?, apiKey?, models? }
   */
  .put(
    "/:id",
    async ({ params, body, status }) => {
      try {
        const parsed = updateProviderSchema.safeParse(body);
        if (!parsed.success) {
          return status(400, {
            error: parsed.error.errors.map((e) => e.message).join(", "),
          });
        }

        const provider = await LlmProvider.findById(params.id);
        if (!provider) {
          return status(404, { error: "Provider not found" });
        }

        const { name, enabled, apiKey, baseUrl, models } = parsed.data;

        if (name !== undefined) provider.name = name;
        if (enabled !== undefined) provider.enabled = enabled;
        if (models !== undefined) provider.models = models;
        if (baseUrl !== undefined) provider.baseUrl = baseUrl || null;

        // Only update API key if a non-empty value is provided
        if (apiKey && apiKey.trim().length > 0) {
          const encryptedKey = encrypt(apiKey);
          provider.apiKey = {
            ciphertext: encryptedKey.ciphertext,
            iv: encryptedKey.iv,
            tag: encryptedKey.tag,
          };
        }

        await provider.save();
        return toSafeResponse(provider);
      } catch (err) {
        console.error("Error updating LLM provider:", err);
        return status(500, { error: err.message });
      }
    },
  )

  // ─── Delete a provider ──────────────────────────────────────────────────

  /**
   * Delete an LLM provider configuration.
   * DELETE /api/llm-providers/:id
   */
  .delete(
    "/:id",
    async ({ params, status }) => {
      try {
        const provider = await LlmProvider.findByIdAndDelete(params.id);
        if (!provider) {
          return status(404, { error: "Provider not found" });
        }
        return { success: true, providerId: provider.providerId };
      } catch (err) {
        console.error("Error deleting LLM provider:", err);
        return status(500, { error: err.message });
      }
    },
  );

export default router;

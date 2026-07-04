/**
 * AI-assisted curation of OpenAPI operations (PLACEHOLDER).
 *
 * Today this is a no-op pass-through: it returns the normalized operations
 * exactly as produced by the parser, with `aiApplied: false`.
 *
 * In the future this will call an LLM (using the platform's configured
 * LlmProvider credentials, see backend/utils/llmProviderConfig.js) to:
 *   - propose clearer, intent-revealing MCP tool names,
 *   - rewrite operation descriptions in terms of the *use case* an agent would
 *     have for calling them,
 *   - enrich each parameter description,
 *   - pre-select (enable) the operations that are most useful as agent tools.
 *
 * The contract (input/output shape, and the `aiApplied` flag in the response)
 * is intentionally fixed now so that turning the feature on later is a
 * backend-only change requiring no API or frontend modifications.
 */

/**
 * @param {Array<object>} operations - normalized operations from the parser
 * @param {object} spec - the parsed spec object (reserved for future AI context)
 * @param {object} [options]
 * @param {boolean} [options.aiCurate=false] - when true, run the AI pass (not yet implemented)
 * @returns {Promise<{ operations: Array<object>, aiApplied: boolean }>}
 */
export async function suggestCuration(operations, spec, options = {}) {
  const { aiCurate = false } = options;

  if (!aiCurate) {
    return { operations, aiApplied: false };
  }

  // TODO: AI analysis.
  // When implemented, this branch will:
  //   1. Load the active LLM provider config.
  //   2. Send the spec (or a compact summary of `operations`) to the model.
  //   3. Map the model output back onto the operation descriptors
  //      (toolName / description / parameters[].description / enabled).
  //   4. Return { operations: enriched, aiApplied: true }.
  //
  // Until then, AI curation requests degrade gracefully to a pass-through so
  // callers never break.
  return { operations, aiApplied: false };
}

export default { suggestCuration };

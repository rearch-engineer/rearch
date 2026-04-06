// =============================================================================
// Browser Evaluate Tool for OpenCode
// =============================================================================
//
// Executes JavaScript in the browser page context and returns the result.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { getPage } from './browser';

export default tool({
  description:
    'Execute JavaScript code in the browser page context. ' +
    'Returns the serialisable result of the expression. ' +
    'Useful for reading DOM state, extracting data, or triggering client-side logic.',
  args: {
    expression: {
      type: 'string',
      description: 'JavaScript expression or function body to evaluate in the page.',
      required: true,
    },
  },
  async run({ expression }) {
    const page = await getPage();

    try {
      const result = await page.evaluate(expression);
      return { result };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

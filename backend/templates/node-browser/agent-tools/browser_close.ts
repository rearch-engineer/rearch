// =============================================================================
// Browser Close Tool for OpenCode
// =============================================================================
//
// Closes the persistent browser instance to free resources.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { closeBrowser } from './browser';

export default tool({
  description:
    'Close the persistent browser instance. ' +
    'Frees memory and CPU. A new browser will be launched automatically on the next browser_* call.',
  args: {},
  async run() {
    await closeBrowser();
    return { closed: true };
  },
});

// =============================================================================
// Browser Wait Tool for OpenCode
// =============================================================================
//
// Waits for an element to appear, a URL to match, or a fixed delay.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { getPage } from './browser';

export default tool({
  description:
    'Wait for a condition before proceeding. ' +
    'Can wait for a CSS selector to appear, a URL pattern to match, or a fixed number of milliseconds.',
  args: {
    selector: {
      type: 'string',
      description: 'CSS selector to wait for (waits until visible).',
      required: false,
    },
    url: {
      type: 'string',
      description: 'URL substring or regex pattern to wait for.',
      required: false,
    },
    delay: {
      type: 'number',
      description: 'Fixed delay in milliseconds.',
      required: false,
    },
    timeout: {
      type: 'number',
      description: 'Maximum wait time in milliseconds. Default: 15000',
      required: false,
    },
  },
  async run({ selector, url, delay, timeout }) {
    const page = await getPage();
    const maxWait = timeout ?? 15000;

    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { waited: `${delay}ms` };
    }

    if (selector) {
      await page.waitForSelector(selector, { state: 'visible', timeout: maxWait });
      return { found: selector, url: page.url() };
    }

    if (url) {
      await page.waitForURL(url, { timeout: maxWait });
      return { url: page.url() };
    }

    return { error: 'Provide a selector, url, or delay to wait for.' };
  },
});

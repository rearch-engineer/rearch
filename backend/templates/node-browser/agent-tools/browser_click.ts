// =============================================================================
// Browser Click Tool for OpenCode
// =============================================================================
//
// Clicks an element on the page by CSS selector or visible text content.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { getPage } from './browser';

export default tool({
  description:
    'Click an element on the current page. ' +
    'Identify the target by CSS selector or by its visible text content.',
  args: {
    selector: {
      type: 'string',
      description: 'CSS selector of the element to click.',
      required: false,
    },
    text: {
      type: 'string',
      description: 'Visible text of the element to click (uses getByText).',
      required: false,
    },
  },
  async run({ selector, text }) {
    const page = await getPage();

    if (selector) {
      await page.click(selector, { timeout: 10000 });
    } else if (text) {
      await page.getByText(text, { exact: false }).click({ timeout: 10000 });
    } else {
      return { error: 'Provide either a selector or text to identify the element.' };
    }

    return {
      url: page.url(),
      title: await page.title(),
    };
  },
});

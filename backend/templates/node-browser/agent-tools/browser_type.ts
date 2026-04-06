// =============================================================================
// Browser Type Tool for OpenCode
// =============================================================================
//
// Types text into an input field or presses keyboard keys.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { getPage } from './browser';

export default tool({
  description:
    'Type text into an input field identified by CSS selector, or press keyboard keys. ' +
    'Use "text" to type into a field, or "key" to press a key (e.g. Enter, Escape, Tab).',
  args: {
    selector: {
      type: 'string',
      description: 'CSS selector of the input field to type into.',
      required: false,
    },
    text: {
      type: 'string',
      description: 'Text to type into the field.',
      required: false,
    },
    key: {
      type: 'string',
      description: 'Keyboard key to press (e.g. "Enter", "Escape", "Tab", "ArrowDown").',
      required: false,
    },
    clear: {
      type: 'boolean',
      description: 'Clear the field before typing. Default: false',
      required: false,
    },
  },
  async run({ selector, text, key, clear }) {
    const page = await getPage();

    if (key) {
      await page.keyboard.press(key);
      return { pressed: key };
    }

    if (!selector) {
      return { error: 'Provide a selector when typing text into a field.' };
    }

    if (clear) {
      await page.fill(selector, '');
    }

    if (text) {
      await page.type(selector, text, { delay: 30 });
    }

    return {
      url: page.url(),
      title: await page.title(),
    };
  },
});

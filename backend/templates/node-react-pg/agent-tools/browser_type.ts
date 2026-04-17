// =============================================================================
// Browser Type Tool for OpenCode
// =============================================================================
//
// Types text into an input field or presses keyboard keys.
//
// =============================================================================

import { tool } from "@opencode-ai/plugin";
import { getPage } from "./browser";

export default tool({
  description:
    "Type text into an input field identified by CSS selector, or press keyboard keys. " +
    'Use "text" to type into a field, or "key" to press a key (e.g. Enter, Escape, Tab).',
  args: {
    selector: tool.schema
      .string()
      .optional()
      .describe("CSS selector of the input field to type into."),
    text: tool.schema
      .string()
      .optional()
      .describe("Text to type into the field."),
    key: tool.schema
      .string()
      .optional()
      .describe(
        'Keyboard key to press (e.g. "Enter", "Escape", "Tab", "ArrowDown").',
      ),
    clear: tool.schema
      .boolean()
      .optional()
      .describe("Clear the field before typing. Default: false"),
  },
  async execute({ selector, text, key, clear }) {
    const page = await getPage();

    if (key) {
      await page.keyboard.press(key);
      return `Pressed key: ${key}`;
    }

    if (!selector) {
      return "Error: Provide a selector when typing text into a field.";
    }

    if (clear) {
      await page.fill(selector, "");
    }

    if (text) {
      await page.type(selector, text, { delay: 30 });
    }

    return JSON.stringify({ url: page.url(), title: await page.title() });
  },
});

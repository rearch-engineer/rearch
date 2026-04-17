// =============================================================================
// Browser Click Tool for OpenCode
// =============================================================================
//
// Clicks an element on the page by CSS selector or visible text content.
//
// =============================================================================

import { tool } from "@opencode-ai/plugin";
import { getPage } from "./browser";

export default tool({
  description:
    "Click an element on the current page. " +
    "Identify the target by CSS selector or by its visible text content.",
  args: {
    selector: tool.schema
      .string()
      .optional()
      .describe("CSS selector of the element to click."),
    text: tool.schema
      .string()
      .optional()
      .describe("Visible text of the element to click (uses getByText)."),
  },
  async execute({ selector, text }) {
    const page = await getPage();

    if (selector) {
      await page.click(selector, { timeout: 10000 });
    } else if (text) {
      await page.getByText(text, { exact: false }).click({ timeout: 10000 });
    } else {
      return "Error: Provide either a selector or text to identify the element.";
    }

    return JSON.stringify({ url: page.url(), title: await page.title() });
  },
});

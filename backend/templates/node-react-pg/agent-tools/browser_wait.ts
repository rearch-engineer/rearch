// =============================================================================
// Browser Wait Tool for OpenCode
// =============================================================================
//
// Waits for an element to appear, a URL to match, or a fixed delay.
//
// =============================================================================

import { tool } from "@opencode-ai/plugin";
import { getPage } from "./browser";

export default tool({
  description:
    "Wait for a condition before proceeding. " +
    "Can wait for a CSS selector to appear, a URL pattern to match, or a fixed number of milliseconds.",
  args: {
    selector: tool.schema
      .string()
      .optional()
      .describe("CSS selector to wait for (waits until visible)."),
    url: tool.schema
      .string()
      .optional()
      .describe("URL substring or regex pattern to wait for."),
    delay: tool.schema
      .number()
      .optional()
      .describe("Fixed delay in milliseconds."),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Maximum wait time in milliseconds. Default: 15000"),
  },
  async execute({ selector, url, delay, timeout }) {
    const page = await getPage();
    const maxWait = timeout ?? 15000;

    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return `Waited ${delay}ms`;
    }

    if (selector) {
      await page.waitForSelector(selector, {
        state: "visible",
        timeout: maxWait,
      });
      return JSON.stringify({ found: selector, url: page.url() });
    }

    if (url) {
      await page.waitForURL(url, { timeout: maxWait });
      return JSON.stringify({ url: page.url() });
    }

    return "Error: Provide a selector, url, or delay to wait for.";
  },
});

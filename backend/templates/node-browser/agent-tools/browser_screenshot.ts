// =============================================================================
// Browser Screenshot Tool for OpenCode
// =============================================================================
//
// Takes a screenshot of the current page or a specific URL and returns it as
// base64-encoded PNG data that OpenCode renders inline in the conversation.
//
// =============================================================================

import { tool } from "@opencode-ai/plugin";
import { getPage } from "./browser";

export default tool({
  description:
    "Take a screenshot of a web page running in the container. " +
    "Returns a base64-encoded PNG image displayed inline in the conversation. " +
    "By default captures http://localhost:3000. " +
    "Can capture the full scrollable page or just the viewport. " +
    "Can also capture a specific element by CSS selector.",
  args: {
    url: tool.schema
      .string()
      .optional()
      .describe(
        "URL to navigate to before taking the screenshot. Defaults to http://localhost:3000",
      ),
    fullPage: tool.schema
      .boolean()
      .optional()
      .describe(
        "Capture the full scrollable page instead of just the viewport. Default: false",
      ),
    selector: tool.schema
      .string()
      .optional()
      .describe(
        "CSS selector of a specific element to screenshot. If provided, only that element is captured.",
      ),
  },
  async execute({ url, fullPage, selector }) {
    const page = await getPage();
    const targetUrl = url || "http://localhost:3000";

    if (page.url() !== targetUrl) {
      await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
    }

    let buf: Uint8Array;
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        return `Error: Element not found: ${selector}`;
      }
      buf = await element.screenshot();
    } else {
      buf = await page.screenshot({ fullPage: fullPage ?? false });
    }

    const base64 = btoa(String.fromCharCode(...buf));
    return JSON.stringify({
      type: "image",
      image: base64,
      mimeType: "image/png",
      url: page.url(),
      title: await page.title(),
    });
  },
});

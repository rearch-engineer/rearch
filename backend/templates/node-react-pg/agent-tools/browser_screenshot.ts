// =============================================================================
// Browser Screenshot Tool for OpenCode
// =============================================================================
//
// Takes a screenshot of the current page or a specific URL and returns it as
// base64-encoded PNG data that OpenCode renders inline in the conversation.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { getPage } from './browser';

export default tool({
  description:
    'Take a screenshot of a web page running in the container. ' +
    'Returns a base64-encoded PNG image displayed inline in the conversation. ' +
    'By default captures http://localhost:3000. ' +
    'Can capture the full scrollable page or just the viewport. ' +
    'Can also capture a specific element by CSS selector.',
  args: {
    url: {
      type: 'string',
      description: 'URL to navigate to before taking the screenshot. Defaults to http://localhost:3000',
      required: false,
    },
    fullPage: {
      type: 'boolean',
      description: 'Capture the full scrollable page instead of just the viewport. Default: false',
      required: false,
    },
    selector: {
      type: 'string',
      description: 'CSS selector of a specific element to screenshot. If provided, only that element is captured.',
      required: false,
    },
  },
  async run({ url, fullPage, selector }) {
    const page = await getPage();
    const targetUrl = url || 'http://localhost:3000';

    if (page.url() !== targetUrl) {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    }

    let buffer: Buffer;
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        return { error: `Element not found: ${selector}` };
      }
      buffer = Buffer.from(await element.screenshot());
    } else {
      buffer = Buffer.from(await page.screenshot({ fullPage: fullPage ?? false }));
    }

    return {
      type: 'image',
      image: buffer.toString('base64'),
      mimeType: 'image/png',
      url: page.url(),
      title: await page.title(),
    };
  },
});

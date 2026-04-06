// =============================================================================
// Browser Navigate Tool for OpenCode
// =============================================================================
//
// Navigates the persistent browser to a URL or performs back/forward/reload.
//
// =============================================================================

import { tool } from '@opencode-ai/plugin';
import { getPage } from './browser';

export default tool({
  description:
    'Navigate the browser to a URL, or go back, forward, or reload the current page. ' +
    'Returns the final URL and page title after navigation.',
  args: {
    url: {
      type: 'string',
      description: 'URL to navigate to. Ignored if action is set.',
      required: false,
    },
    action: {
      type: 'string',
      description: 'Navigation action: "back", "forward", or "reload". If set, url is ignored.',
      required: false,
    },
  },
  async run({ url, action }) {
    const page = await getPage();

    if (action === 'back') {
      await page.goBack({ waitUntil: 'networkidle', timeout: 15000 });
    } else if (action === 'forward') {
      await page.goForward({ waitUntil: 'networkidle', timeout: 15000 });
    } else if (action === 'reload') {
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    } else if (url) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } else {
      return { error: 'Provide either a url or an action (back, forward, reload).' };
    }

    return {
      url: page.url(),
      title: await page.title(),
    };
  },
});

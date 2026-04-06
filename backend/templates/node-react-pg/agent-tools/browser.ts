// =============================================================================
// Shared Persistent Browser Instance for OpenCode Tools
// =============================================================================
//
// Provides a singleton Playwright Chromium browser page that is shared across
// all browser_* tools. The browser is launched on first use and kept alive
// until explicitly closed via browser_close.
//
// =============================================================================

import { chromium, type Browser, type Page } from 'playwright';

let browser: Browser | null = null;
let page: Page | null = null;

/**
 * Get (or create) the shared browser page.
 * Launches Chromium headlessly on the first call.
 */
export async function getPage(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();
  }
  if (!page || page.isClosed()) {
    const context = browser.contexts()[0] || (await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }));
    page = await context.newPage();
  }
  return page;
}

/**
 * Close the browser instance and reset references.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}

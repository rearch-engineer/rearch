// @ts-check
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * ReArch E2E Playwright configuration.
 *
 * All runtime values come from environment variables prefixed with PLAYWRIGHT_.
 * See .env.example for the full list.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // sequential — the test is a single ordered flow
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },

  /* Give each test generous time — external API calls (BitBucket) can be slow */
  timeout: 120_000,
  expect: { timeout: 15_000 },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

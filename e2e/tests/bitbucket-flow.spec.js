// @ts-check
import { test, expect } from "@playwright/test";

/*
 * Full BitBucket onboarding E2E flow:
 *
 *   1. Login with LOCAL credentials
 *   2. Create a new BitBucket resource
 *   3. Import a repository
 *   4. Enable the ReArch integration
 *   5. Start a new conversation
 *
 * All credentials and resource details are read from environment variables
 * prefixed with PLAYWRIGHT_. See ../. env.example for the full list.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Read a required env var or throw with a clear message. */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See e2e/.env.example.`,
    );
  }
  return value;
}

// ── Test ─────────────────────────────────────────────────────────────────────

test.describe("BitBucket onboarding flow", () => {
  let userEmail;
  let userPassword;
  let bbName;
  let bbWorkspace;
  let bbEmail;
  let bbUsername;
  let bbApiToken;
  let bbRepoName;

  test.beforeAll(() => {
    userEmail = requireEnv("PLAYWRIGHT_USER_EMAIL");
    userPassword = requireEnv("PLAYWRIGHT_USER_PASSWORD");
    bbName = requireEnv("PLAYWRIGHT_BB_NAME");
    bbWorkspace = requireEnv("PLAYWRIGHT_BB_WORKSPACE");
    bbEmail = requireEnv("PLAYWRIGHT_BB_EMAIL");
    bbUsername = requireEnv("PLAYWRIGHT_BB_USERNAME");
    bbApiToken = requireEnv("PLAYWRIGHT_BB_API_TOKEN");
    bbRepoName = requireEnv("PLAYWRIGHT_BB_REPO_NAME");
  });

  test("login, create resource, import repo, enable rearch, start conversation", async ({
    page,
  }) => {
    // ── Step 1: Login ──────────────────────────────────────────────────────

    await test.step("Login with LOCAL credentials", async () => {
      await page.goto("/login");

      // Wait for the login form to be visible (LOCAL auth mode)
      const form = page.locator('[data-testid="login-form"]');
      await expect(form).toBeVisible();

      // Fill credentials
      await page.locator('[data-testid="login-email"] input').fill(userEmail);
      await page
        .locator('[data-testid="login-password"] input')
        .fill(userPassword);

      // Submit
      await page.locator('[data-testid="login-submit"]').click();

      // Wait for redirect away from /login — should land on /conversations/new
      await page.waitForURL("**/conversations/new", { timeout: 30_000 });
    });

    // ── Step 2: Create BitBucket Resource ──────────────────────────────────

    await test.step("Create a new BitBucket resource", async () => {
      // Navigate to Resources page
      await page.goto("/resources");
      await expect(page.locator('[data-testid="add-resource-btn"]')).toBeVisible();

      // Click "Add Resource"
      await page.locator('[data-testid="add-resource-btn"]').click();
      await page.waitForURL("**/resources/new");

      // Select BitBucket
      await page.locator('[data-testid="resource-type-bitbucket"]').click();
      await page.waitForURL("**/resources/new/bitbucket");

      // Fill the form
      await page.locator('[data-testid="bb-resource-name"] input').fill(bbName);
      await page
        .locator('[data-testid="bb-resource-workspace"] input')
        .fill(bbWorkspace);
      await page
        .locator('[data-testid="bb-resource-email"] input')
        .fill(bbEmail);
      await page
        .locator('[data-testid="bb-resource-clone-username"] input')
        .fill(bbUsername);
      await page
        .locator('[data-testid="bb-resource-api-token"] input')
        .fill(bbApiToken);

      // Submit
      await page.locator('[data-testid="bb-resource-submit"]').click();

      // Wait for redirect back to the resources list
      await page.waitForURL("**/resources", { timeout: 30_000 });

      // Verify the new resource appears in the list
      await expect(page.getByText(bbName)).toBeVisible();
    });

    // ── Step 3: Import a Repository ────────────────────────────────────────

    // We need to navigate into the resource to access its subresources.
    // The resource card is clickable and navigates to /resources/:id.

    let resourceDetailUrl;
    let subResourcesUrl;

    await test.step("Navigate to the resource and open subresources", async () => {
      // Click on the resource card by its name
      await page.getByText(bbName).first().click();

      // Wait for navigation to /resources/:id
      await page.waitForURL("**/resources/*");
      resourceDetailUrl = page.url();

      // Navigate to subresources — look for a link/button that goes to the subresources page.
      // The resource detail page shows a "Repositories" link or the user navigates via the
      // subresources path. Let's navigate directly.
      const resourceId = resourceDetailUrl.split("/resources/")[1].split("/")[0];
      subResourcesUrl = `/resources/${resourceId}/subresources`;
      await page.goto(subResourcesUrl);

      // Wait for the page to load
      await expect(
        page.locator('[data-testid="import-btn"]'),
      ).toBeVisible();
    });

    await test.step("Import a repository", async () => {
      // Click the "Import" button to open the import modal
      await page.locator('[data-testid="import-btn"]').click();

      // Wait for the modal to appear
      await expect(page.getByText("Import Repository")).toBeVisible();

      // Search for the repository
      await page
        .locator('[data-testid="import-search-input"] input')
        .fill(bbRepoName);
      await page.locator('[data-testid="import-search-btn"]').click();

      // Wait for search results to appear
      await expect(
        page.locator('[data-testid="import-result-btn"]').first(),
      ).toBeVisible({ timeout: 30_000 });

      // Click the first result to import it
      await page.locator('[data-testid="import-result-btn"]').first().click();

      // Wait for the modal to close (import success triggers close + reload)
      await expect(page.getByText("Import Repository")).toBeHidden({
        timeout: 30_000,
      });

      // Verify the imported repository appears in the subresources list
      await expect(page.getByText(bbRepoName)).toBeVisible({ timeout: 15_000 });
    });

    // ── Step 4: Enable ReArch Integration ──────────────────────────────────

    await test.step("Enable the ReArch integration", async () => {
      // Click on the imported repository card to navigate to its details
      await page.getByText(bbRepoName).first().click();

      // Wait for the repository details page to load
      await page.waitForURL("**/subresources/*");

      // Wait for the ReArch Settings section to be visible
      await expect(page.getByText("ReArch Settings")).toBeVisible();

      // Click the Edit button on the ReArch Settings card
      await page.locator('[data-testid="rearch-edit-btn"]').click();

      // Toggle the "Enable ReArch" switch
      const switchLocator = page.locator('[data-testid="rearch-enable-switch"]');
      await expect(switchLocator).toBeVisible();
      // MUI Switch renders as a <span> wrapping an <input type="checkbox">.
      // Click the outer element to toggle.
      await switchLocator.click();

      // Select the "Minimal" template
      await page.getByText("Minimal").first().click();

      // Save
      await page.locator('[data-testid="rearch-save-btn"]').click();

      // Wait for save to complete — the edit mode should close and show "Enabled" chip
      await expect(page.getByText("Enabled")).toBeVisible({ timeout: 15_000 });
    });

    // ── Step 5: Start a New Conversation ───────────────────────────────────

    await test.step("Start a new conversation", async () => {
      // Click the "+" button in the main menu to start a new conversation
      await page.locator('[data-testid="new-conversation-btn"]').click();
      await page.waitForURL("**/conversations/new");

      // Wait for repository cards to load
      await expect(
        page.locator(`[data-testid="repo-card-${bbRepoName}"]`),
      ).toBeVisible({ timeout: 30_000 });

      // Select the repository
      await page.locator(`[data-testid="repo-card-${bbRepoName}"]`).click();

      // Click "Start Conversation"
      await page.locator('[data-testid="start-conversation-btn"]').click();

      // Wait for navigation to the new conversation page (URL should have a real ID, not "new")
      await page.waitForURL(/\/conversations\/(?!new)/, { timeout: 60_000 });

      // Verify we're on a conversation page with a real ID
      const url = page.url();
      expect(url).toMatch(/\/conversations\/[a-f0-9]+/);
    });
  });
});

// Satellite detail e2e — verifies historical TLE chart renders for a real sat.
// The Satellites list page → click an item → detail page is the user flow.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

test.describe("Satellite detail page", () => {
  test("clicking a satellite from the list opens a detail page with charts", async ({ page }) => {
    await visit(page);
    await page.locator("a:has-text('Satellites')").first().click({ force: true });
    await expect(page).toHaveURL(/\/satellites$/);

    // The list mounts with categories (LEO/MEO/GEO/HEO) + cards. Wait then
    // click the first link that points at /satellites/<name>.
    const detailLink = page
      .locator('a[href*="/satellites/"]')
      .filter({ hasNotText: /^Satellites$/i })
      .first();
    await expect(detailLink).toBeVisible({ timeout: 45_000 });
    await detailLink.click();

    await expect(page).toHaveURL(/\/satellites\/.+/);

    // Recharts renders a Recharts surface SVG per chart; expect at least 3.
    const charts = page.locator("svg.recharts-surface");
    await expect.poll(() => charts.count(), { timeout: 45_000 }).toBeGreaterThanOrEqual(3);
  });
});

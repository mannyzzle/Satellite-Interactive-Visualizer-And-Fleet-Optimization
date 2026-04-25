// Tracking page e2e — exercises real-time satellite focus + CDM panel.
// Tests the *predictive collision avoidance* value prop end-to-end.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

async function navigateToTracking(page) {
  await visit(page);
  // Click the real navbar link so React Router handles the route change.
  // There are two "Tracking" links on the page (desktop + mobile menu).
  // Three.js canvas can overlay the navbar; force click to bypass.
  await page.locator("a:has-text('Tracking')").first().click({ force: true });
  await expect(page).toHaveURL(/\/tracking$/);
}

test.describe("Tracking page", () => {
  test("renders Predictive Analytics title + Active CDM Events", async ({ page }) => {
    await navigateToTracking(page);
    // Title is animated via TypeAnimation — match the leading phrase only
    await expect(
      page.getByText(/Predictive Analytics/i).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Active CDM Events/i)).toBeVisible();

    // At least one CDM event card should be rendered, with TCA + range visible
    await expect(page.getByText(/CDM ID:/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Time of Closest Approach:/i).first()).toBeVisible();
  });

  test("typing into the search box surfaces autocomplete suggestions", async ({ page }) => {
    await navigateToTracking(page);

    const search = page.getByPlaceholder(/STARLINK-3000 or 76000/i);
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill("ISS");

    // At least one autocomplete row containing "ISS"
    await expect(page.locator("text=/ISS/i").first()).toBeVisible({ timeout: 15_000 });
  });
});

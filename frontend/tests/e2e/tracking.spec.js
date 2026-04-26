// Tracking page e2e — exercises the Mission Control / CDM analytics UI.
//
// The page used to be a single-sat propagation view. After redesign it's a
// conjunction-events dashboard. These tests check:
//   1. Hero loads + at least one populated KPI tile.
//   2. The CDM table renders rows; clicking one populates the detail panel.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

async function navigateToTracking(page) {
  await visit(page);
  await page.locator("a:has-text('Tracking')").first().click({ force: true });
  await expect(page).toHaveURL(/\/tracking$/);
}

test.describe("Tracking page (Mission Control)", () => {
  test("renders the hero + KPI tiles + risk timeline", async ({ page }) => {
    await navigateToTracking(page);

    await expect(
      page.getByRole("heading", { name: /Conjunction Risk Dashboard/i })
    ).toBeVisible({ timeout: 30_000 });

    // The risk-timeline section header renders before the data loads (the
    // chart area is replaced by an animated skeleton).
    await expect(page.getByText(/Risk timeline/i)).toBeVisible({
      timeout: 30_000,
    });

    // KPI tiles render their *labels* only once the CDM payload arrives —
    // before that they're shimmer skeletons. The live backend is slow with
    // 40k+ events, so allow generous time.
    await expect(page.getByText(/Active CDMs/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Top probability/i).first()).toBeVisible();
    await expect(page.getByText(/Most imminent TCA/i).first()).toBeVisible();
  });

  test("CDM table rows populate the detail panel on click", async ({ page }) => {
    await navigateToTracking(page);

    const rows = page.locator('[data-testid="cdm-row"]');
    // Wait for the table to settle with real data from the live backend.
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0);

    await rows.first().click();

    const detail = page.locator('[data-testid="cdm-detail"]');
    await expect(detail.getByText(/Time of closest approach/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(detail.getByText(/Collision probability/i)).toBeVisible();
  });
});

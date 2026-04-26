// Catalog → detail flow.
//
// SatelliteList is a single filterable table; SatelliteDetail is a tabbed
// dashboard (Altitude / Velocity / B*) with a vital-signs strip and
// neighbors panel. Charts are tabbed so only ONE Recharts surface is
// visible at a time — the test asserts ≥1 instead of ≥3.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

test.describe("Catalog → satellite detail", () => {
  test("clicking a catalog row opens the detail page with KPIs and chart", async ({ page }) => {
    await visit(page);
    await page.locator("a:has-text('Satellites')").first().click({ force: true });
    await expect(page).toHaveURL(/\/satellites$/);

    // Wait for the catalog rows to appear (live backend can be slow).
    const rows = page.locator('[data-testid="catalog-row"]');
    await expect.poll(() => rows.count(), { timeout: 45_000 }).toBeGreaterThan(0);
    await rows.first().click();

    await expect(page).toHaveURL(/\/satellites\/.+/);

    // Hero — back button + status pill should appear once data settles.
    await expect(page.getByText(/Back to catalog/i)).toBeVisible({ timeout: 15_000 });

    // Vital signs strip labels.
    await expect(page.getByText(/Mean altitude/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Period/i).first()).toBeVisible();

    // Tabbed time-series chart — at least one Recharts surface visible.
    const charts = page.locator("svg.recharts-surface");
    await expect.poll(() => charts.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

    // Switching tabs should keep the chart count stable (tabs swap content, not duplicate it).
    await page.getByRole("button", { name: /^Velocity$/ }).first().click();
    await expect.poll(() => charts.count(), { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  });
});

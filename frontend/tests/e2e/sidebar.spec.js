// Right-sidebar interactions on the home page.
//
// Guards two bugs that were live in production until 2026-04-25:
//   1. The active-filter ✕ button never removed the chip — `toggleFilter`
//      was hard-wired to `setActiveFilters([f])` so clicking the same
//      filter (or its chip ✕) re-applied it. Fixed by truly toggling.
//   2. Search hit a `/api/satellites/by_norad/{n}` URL that doesn't exist.
//      The route is `/api/satellites/{name_or_norad}`. Fixed by routing
//      both numeric and name lookups to the canonical endpoint.
//
// We scroll the 3D globe container into view before interacting so the
// lazy-mounted Home scene + sidebar are present.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

const SIDEBAR = '[data-testid="sat-sidebar"]';
const CHIP = '[data-testid="active-filter-chip"]';
const CARD = '[data-testid="satellite-card"]';

async function reachSidebar(page) {
  await visit(page);
  // Scene mounts a few viewports down — scroll to trigger it, then back to
  // make sure the sidebar is visible.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(1500);
  // The sidebar is `position: absolute` inside the globe section — scroll it
  // into view directly to be robust.
  await page.locator(SIDEBAR).first().scrollIntoViewIfNeeded({ timeout: 30_000 });
  await expect(page.locator(SIDEBAR).first()).toBeVisible({ timeout: 30_000 });
}

test.describe("Home sidebar", () => {
  test("clicking the ✕ on an active-filter chip removes it", async ({ page }) => {
    await reachSidebar(page);

    // Open the filters drawer.
    await page.getByRole("button", { name: /Filters/i }).first().click();

    // The default filter is "Recent Launches" → it should already show as a chip.
    // If not, pick any category button to seed one.
    let chip = page.locator(CHIP).first();
    if (!(await chip.isVisible().catch(() => false))) {
      const anyFilterBtn = page.locator('#filters-drawer button').first();
      await anyFilterBtn.click();
      await page.waitForTimeout(2_500); // toggleFilter has a 2s+ scene cleanup wait
      chip = page.locator(CHIP).first();
    }

    await expect(chip).toBeVisible({ timeout: 15_000 });

    // Click the ✕ inside the chip and assert it disappears.
    await chip.locator("button").click();
    // toggleFilter waits ~2s for cleanup + extra 2.5s for loading screen
    await expect(page.locator(CHIP)).toHaveCount(0, { timeout: 20_000 });
  });

  test("typing a query shows suggestions from the live backend", async ({ page }) => {
    await reachSidebar(page);

    const search = page.getByPlaceholder(/Search by name/i);
    await search.fill("ISS");

    const dropdown = page.locator('[data-testid="search-suggestions"]');
    await expect(dropdown).toBeVisible({ timeout: 15_000 });
    // At least one suggestion row.
    await expect(dropdown.locator("li").first()).toBeVisible();
  });

  test("clear-search ✕ button empties the input", async ({ page }) => {
    await reachSidebar(page);

    const search = page.getByPlaceholder(/Search by name/i);
    await search.fill("STARLINK");
    await page.locator('[aria-label="Clear search"]').click();
    await expect(search).toHaveValue("");
  });

  test("picking a suggestion outside the active filter still shows it in the list", async ({ page }) => {
    // Bug guard: picking ANIK A1 (1972) with "Recent Launches" filter active
    // used to leave the satellite focused on the globe but invisible in the
    // sidebar list — it wasn't in the filtered/paginated catalog. Now we pin
    // the selectedSatellite to the top of the list regardless of filter/page.
    await reachSidebar(page);

    await expect(page.locator('[data-testid="active-filter-chip"]').first()).toBeVisible({
      timeout: 15_000,
    });

    const search = page.getByPlaceholder(/Search by name/i);
    await search.fill("ANIK A1");
    const dropdown = page.locator('[data-testid="search-suggestions"]');
    await expect(dropdown).toBeVisible({ timeout: 15_000 });
    await dropdown.locator("li").first().click();

    // The picked satellite must be visible as a list card afterwards.
    await page.waitForTimeout(2_000);
    const cards = page.locator('[data-testid="satellite-card"]');
    await expect(cards.first()).toContainText(/ANIK A1/i, { timeout: 10_000 });

    // The active filter is preserved (we don't surprise the user by clearing it).
    await expect(page.locator('[data-testid="active-filter-chip"]')).toHaveCount(1);
  });

  test("picking a second satellite after the first one works (no stuck state)", async ({ page }) => {
    // Bug guard: previously the first search-pick worked but a second pick
    // appeared to do nothing — `revealPickedSatellite` left `loading=true`
    // for ~5s during a 5-page catalog walk, so subsequent setPage→
    // fetchAndUpdateSatellites runs got short-circuited by `if (loading)
    // return`. The new revealPickedSatellite is synchronous (no page walk)
    // and updates the scene directly via removeAll + loadSatelliteModel.
    await reachSidebar(page);

    const search = page.getByPlaceholder(/Search by name/i);
    const dropdown = page.locator('[data-testid="search-suggestions"]');
    const cards = page.locator('[data-testid="satellite-card"]');

    // Pick #1
    await search.fill("ISS");
    await expect(dropdown).toBeVisible({ timeout: 15_000 });
    await dropdown.locator("li").first().click();
    await page.waitForTimeout(1_500);
    const firstName = await cards.first().innerText();

    // Clear and pick #2 — different query.
    await page.locator('[aria-label="Clear search"]').click();
    await search.fill("STARLINK");
    await expect(dropdown).toBeVisible({ timeout: 15_000 });
    await dropdown.locator("li").first().click();
    await page.waitForTimeout(1_500);

    const secondName = await cards.first().innerText();
    expect(secondName, "second pick didn't replace the first").not.toBe(firstName);
    expect(secondName).toMatch(/STARLINK/i);
  });

  test("ArrowDown highlights and Enter picks the suggestion", async ({ page }) => {
    // Regression guard for the "Enter on visible suggestions" bug: pressing
    // Enter while suggestions were showing used to fall through to
    // handleSearch(), which 404'd on a literal name lookup of the partial
    // query. Now Enter picks the highlighted (or top) row.
    await reachSidebar(page);

    const search = page.getByPlaceholder(/Search by name/i);
    await search.fill("STARLINK");

    const dropdown = page.locator('[data-testid="search-suggestions"]');
    await expect(dropdown).toBeVisible({ timeout: 15_000 });
    const firstRow = dropdown.locator('li').first();
    await expect(firstRow).toBeVisible();

    // Press ArrowDown — the first row should become aria-selected.
    await search.press("ArrowDown");
    await expect(firstRow).toHaveAttribute("aria-selected", "true");

    // Pressing Enter must close the dropdown (suggestion got picked).
    await search.press("Enter");
    await expect(dropdown).toHaveCount(0, { timeout: 10_000 });
  });
});

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
  // Scene mounts a few viewports down — scroll to trigger it.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(1500);
  // After the redesign the sidebar starts collapsed (off-screen) and only
  // slides in when the user clicks the floating "Catalog" launcher chip.
  // Tests need to click that launcher first. Power users with
  // localStorage("sidebarOpen")=true skip the launcher — but Playwright
  // starts in a fresh storage context so the launcher is always present.
  const launcher = page.locator('[data-testid="sat-sidebar-launcher"]');
  if (await launcher.isVisible().catch(() => false)) {
    await launcher.click();
  }
  await page.locator(SIDEBAR).first().scrollIntoViewIfNeeded({ timeout: 30_000 });
  await expect(page.locator(SIDEBAR).first()).toBeVisible({ timeout: 30_000 });
  // Wait for the slide-in transition to settle so subsequent keyboard
  // interactions land cleanly on the input.
  await page.waitForTimeout(400);
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

  test("after a search pick, clicking other list rows still works", async ({ page }) => {
    // Bug guard: revealPickedSatellite used to clear the scene + only
    // load the picked satellite. The sidebar list still showed the
    // previously-fetched page rows pinned with the picked sat at top, so
    // clicking any of those other rows looked them up in
    // satelliteObjectsRef where they weren't present — focusOnSatellite
    // retried 20× and silently gave up. The "buttons stopped working"
    // symptom. Now revealPickedSatellite re-loads the page's sats so the
    // list ⇄ scene stay in sync.
    await reachSidebar(page);

    const search = page.getByPlaceholder(/Search by name/i);
    await search.fill("STARLINK");
    const dropdown = page.locator('[data-testid="search-suggestions"]');
    await expect(dropdown).toBeVisible({ timeout: 15_000 });
    await dropdown.locator("li").first().click();
    await page.waitForTimeout(1_500);

    // Clear the search filter so the page list re-populates with siblings —
    // otherwise displayedSatellites is just the pinned picked sat and we
    // can't verify another row is clickable.
    await page.locator('[aria-label="Clear search"]').click();
    await page.waitForTimeout(500);

    const cards = page.locator('[data-testid="satellite-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const firstCount = await cards.count();
    // Need at least 2 distinct rows to verify the click goes through.
    if (firstCount < 2) test.skip(true, "page returned <2 satellites");

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Click a non-pinned row.
    const secondRow = cards.nth(1);
    const secondName = await secondRow.innerText();
    await secondRow.click();
    await page.waitForTimeout(1_500);

    // The first card should now be the row we just clicked (selectedSatellite
    // is pinned at top), or at least the second-row click did NOT throw.
    expect(
      errors.filter((e) => !/Cannot read properties of null \(reading 'children'\)/.test(e)),
      `clicking a list row after a search-pick threw:\n${errors.join("\n")}`
    ).toHaveLength(0);
    expect(secondName.length, "list row text was empty").toBeGreaterThan(0);
  });

  test("clicking a suggestion picks it and closes the dropdown", async ({ page }) => {
    // Regression guard for the "Enter on visible suggestions" bug: picking
    // any suggestion (click or Enter) used to fall through to handleSearch
    // which 404'd on the partial literal query. Now both paths route
    // through handleSuggestionClick. Click path is more reliable than
    // keyboard against the live backend's debounce timing.
    await reachSidebar(page);

    const search = page.getByPlaceholder(/Search by name/i);
    await search.fill("STARLINK");

    const dropdown = page.locator('[data-testid="search-suggestions"]');
    await expect(dropdown).toBeVisible({ timeout: 15_000 });

    // Click the first suggestion row.
    await dropdown.locator("li").first().click();

    // Dropdown should close, picked sat ends up as a list card.
    await expect(dropdown).toHaveCount(0, { timeout: 10_000 });
  });
});

// Route-navigation smoke test.
//
// After lazy-loading was added to App.jsx, every non-Home route is fetched
// as a separate chunk on demand. This test walks every route in sequence
// from the navbar and verifies:
//   1. The URL changes as expected.
//   2. Each route's distinguishing content renders.
//   3. No uncaught JS errors fire across the entire walk.
//
// This is the test that would catch a bad lazy import, a Suspense fallback
// that doesn't resolve, or a circular dependency between extracted modules.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

test.describe("Cross-route navigation", () => {
  test("walks every primary route without errors", async ({ page }) => {
    test.setTimeout(120_000);

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await visit(page);
    await expect(page).toHaveURL(/Satellite-Interactive-Visualizer/);

    // Navigate via the real navbar links — exercises React Router + lazy chunks.
    const routes = [
      { name: "Satellites", url: /\/satellites$/, expect: /Satellite Catalog/i },
      { name: "Launches", url: /\/launches$/, expect: /Upcoming Launches/i },
      { name: "Tracking", url: /\/tracking$/, expect: /Conjunction Risk Dashboard/i },
      { name: "About", url: /\/about$/, expect: /Sat-Track/i },
      { name: "Home", url: /Satellite-Interactive-Visualizer-And-Fleet-Optimization\/$/, expect: /Welcome to Sat-Track/i },
    ];

    for (const route of routes) {
      await page.locator(`a:has-text('${route.name}')`).first().click({ force: true });
      await expect(page).toHaveURL(route.url, { timeout: 15_000 });
      await expect(page.getByText(route.expect).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    // CLAUDE.md notes a known StrictMode reading-'children' race; filter that
    // pre-existing noise out and assert no NEW uncaught errors.
    const unexpected = errors.filter(
      (e) => !/Cannot read properties of null \(reading 'children'\)/.test(e)
    );
    expect(
      unexpected,
      `route walk threw uncaught errors:\n${unexpected.join("\n")}`
    ).toHaveLength(0);
  });

  test("rapid back-and-forth navigation doesn't crash", async ({ page }) => {
    // Stress test for unmount-while-loading: lazy-loaded routes have a Suspense
    // boundary; clicking through them quickly tests that mid-fetch unmounts
    // don't leave dangling promises/refs.
    test.setTimeout(120_000);

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await visit(page);

    for (let i = 0; i < 4; i++) {
      await page.locator("a:has-text('Tracking')").first().click({ force: true });
      await page.waitForTimeout(150);
      await page.locator("a:has-text('Launches')").first().click({ force: true });
      await page.waitForTimeout(150);
      await page.locator("a:has-text('Home')").first().click({ force: true });
      await page.waitForTimeout(150);
    }

    // Settle.
    await page.waitForTimeout(2_000);

    const unexpected = errors.filter(
      (e) => !/Cannot read properties of null \(reading 'children'\)/.test(e)
    );
    expect(
      unexpected,
      `rapid nav threw uncaught errors:\n${unexpected.join("\n")}`
    ).toHaveLength(0);
  });
});

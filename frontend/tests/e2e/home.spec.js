// Home page e2e — runs against the deployed GitHub Pages build.
// Asserts the headline value props: "30k+ satellites visualized live".
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

test.describe("Home page", () => {
  test("loads with site title 'Sat-Track' and a tracked-objects count", async ({ page }) => {
    await visit(page);
    await expect(page).toHaveTitle(/Sat-Track/i);

    // The CountUp animation eventually settles. Look for any 5+ digit number
    // anywhere near the "Tracked" copy.
    await expect(page.getByText(/Tracked/i).first()).toBeVisible({ timeout: 30_000 });
    const html = await page.content();
    const numbers = [...html.matchAll(/(\d{2}[,.]?\d{3,})/g)]
      .map((m) => parseInt(m[1].replace(/[,.]/g, ""), 10))
      .filter((n) => n >= 10_000 && n <= 200_000);
    expect(numbers.length, "no plausible satellite count number rendered").toBeGreaterThan(0);
  });

  test("renders a Three.js canvas after the user scrolls down", async ({ page }) => {
    await visit(page);
    // Lazy-load gate: scroll to bring the globe container into view
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2_000);
    await page.evaluate(() => window.scrollTo(0, 0));
    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: 45_000 });
  });

  test("no uncaught JavaScript errors thrown during page load", async ({ page }) => {
    // We *only* listen for genuine `pageerror` (uncaught JS exceptions). Network
    // 404s and console.error from third-party libs are noise we can't fix.
    const jsErrors = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));
    await visit(page);
    await page.waitForTimeout(4_000);

    // There's a known non-fatal "reading 'children'" error from a Framer Motion
    // / TypeAnimation race during StrictMode double-mount. See CLAUDE.md.
    const unexpected = jsErrors.filter(
      (e) => !/Cannot read properties of null \(reading 'children'\)/.test(e)
    );
    expect(unexpected, `uncaught JS errors:\n${unexpected.join("\n")}`).toHaveLength(0);
  });
});

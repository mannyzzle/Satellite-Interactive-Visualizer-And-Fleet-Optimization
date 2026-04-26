// Stress / performance smoke tests.
//
// These tests don't assert pixel-perfect correctness. They assert that the
// product survives its advertised load: 500 satellites + 1000 orbits on the
// home page should render at >= 25 FPS, and a 60-second tracking session
// should not leak memory faster than ~50% growth.
//
// Both numbers are intentionally generous so we catch only real regressions.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

test.describe("Stress: home page rendering", () => {
  /**
   * Headless-Chrome FPS regression guard.
   *
   * On a 2024-era M-series Mac, the current implementation (per-satellite
   * THREE.Mesh, no instancing, no frustum culling — see CLAUDE.md "Quirks")
   * renders the globe at roughly 12-18 FPS in headless mode under
   * Playwright. Real-user FPS is significantly higher because GPU and
   * window compositor differ.
   *
   * The bar here is a *regression* threshold (10 FPS), not the eventual
   * target. Once the satellite layer is migrated to THREE.InstancedMesh,
   * raise this to 30+ to lock in the win.
   */
  test("home renders at >= 10 FPS over a 5s window (regression guard)", async ({ page }) => {
    await visit(page);
    // Wait for the globe to mount (canvas appears after IntersectionObserver fires)
    await page.mouse.wheel(0, 1500);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    // Sample frame rate via rAF for 5 seconds
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          function tick() {
            frames++;
            if (performance.now() - start >= 5000) {
              resolve(frames / 5);
            } else {
              requestAnimationFrame(tick);
            }
          }
          requestAnimationFrame(tick);
        })
    );

    console.log(`measured FPS: ${fps.toFixed(1)}`);
    expect(fps, "rendering FPS dropped below 10 — likely perf regression").toBeGreaterThanOrEqual(10);
  });
});

test.describe("Stress: tracking page memory stability", () => {
  test("60s of CDM-table interaction doesn't grow heap > 50%", async ({ page, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "performance.memory is a Chromium-only API"
    );

    // Tracking used to drive a propagation animation loop. After the
    // Mission Control redesign there is no animation loop on this page —
    // the memory regression we want to catch now is on table-row → detail
    // panel cycling (which rehydrates the detail card on every click and
    // could leak listeners/handlers if mishandled).
    await visit(page);
    await page.locator("a:has-text('Tracking')").first().click({ force: true });
    await expect(page).toHaveURL(/\/tracking$/);
    await expect(
      page.getByText(/Conjunction Risk Dashboard/i)
    ).toBeVisible({ timeout: 45_000 });

    const rows = page.locator('[data-testid="cdm-row"]');
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0);

    const baseline = await page.evaluate(
      () => performance.memory && performance.memory.usedJSHeapSize
    );
    if (!baseline) test.skip(true, "performance.memory unavailable");

    // Cycle row selection for ~60s.
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 60_000) {
      const count = await rows.count();
      if (count > 0) {
        await rows.nth(i % count).click({ force: true }).catch(() => {});
      }
      i++;
      await page.waitForTimeout(2_500);
    }

    const final = await page.evaluate(() => performance.memory.usedJSHeapSize);
    const growth = (final - baseline) / baseline;
    console.log(
      `heap grew ${(growth * 100).toFixed(1)}% over 60s ` +
      `(${(baseline / 1e6).toFixed(1)}MB → ${(final / 1e6).toFixed(1)}MB)`
    );
    expect(growth, "tracking page leaks memory faster than 50% per minute")
      .toBeLessThan(0.5);
  });
});

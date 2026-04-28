// Visual + structural check on the About-page orbit widget.
//
// Why this exists: the previous version of OrbitWidget used CSS
// `transform-origin: 50% 50%` to spin the orbit groups. Each group's
// bounding box was the union of an ellipse + an off-center satellite
// circle, so 50% wasn't (100,100) — it was the centroid of the
// asymmetric box. Result: satellites traced drifting loops that swept
// off the visible canvas. We're now using SVG-native animateTransform
// with explicit rotate(angle, 100, 100). This test catches a future
// regression.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

test.describe("About page — orbit widget", () => {
  test("widget mounts, has the expected SVG structure", async ({ page }) => {
    await visit(page, "about");

    // Find the orbit SVG by aria-label.
    const svg = page.locator('svg[aria-label*="Earth with three satellites"]');
    await expect(svg).toBeVisible({ timeout: 15_000 });

    // Three orbit ellipses (rx=78, 56, 36).
    await expect(svg.locator("ellipse")).toHaveCount(3);

    // animateTransform elements (one per orbit) — SVG-native rotation.
    // Catches regressions back to CSS transform-origin shenanigans.
    const animations = svg.locator("animateTransform");
    await expect.poll(() => animations.count()).toBe(3);

    // All three rotations must include "100 100" as the rotation center.
    // If a future refactor reintroduces the bounding-box bug, the from/to
    // attributes will lose those center coords.
    const fromAttrs = await animations.evaluateAll((els) =>
      els.map((el) => el.getAttribute("from"))
    );
    for (const from of fromAttrs) {
      expect(from, "rotation should pivot around (100, 100)").toMatch(/100\s+100$/);
    }
  });

  test("satellite halos stay within the SVG viewBox at multiple animation phases", async ({
    page,
  }) => {
    await visit(page, "about");
    const svg = page.locator('svg[aria-label*="Earth with three satellites"]');
    await expect(svg).toBeVisible({ timeout: 15_000 });

    // Sample the satellite circle screen-positions at several frames.
    // For each satellite (the small `circle` direct children of orbit
    // groups), verify it's within the SVG element's bounding rect.
    // If rotation drifts, the satellite would eventually exit the box.
    for (const wait of [200, 1500, 4500, 9000]) {
      await page.waitForTimeout(wait);
      const inBounds = await svg.evaluate((node) => {
        const svgBox = node.getBoundingClientRect();
        // Pick the small satellite circles (r ≤ 3) inside any orbit group.
        const sats = Array.from(node.querySelectorAll("g > g > circle"))
          .filter((c) => parseFloat(c.getAttribute("r")) <= 3);
        const tol = 3; // px of slack for halo thickness
        return sats.every((c) => {
          const box = c.getBoundingClientRect();
          return (
            box.left >= svgBox.left - tol &&
            box.right <= svgBox.right + tol &&
            box.top >= svgBox.top - tol &&
            box.bottom <= svgBox.bottom + tol
          );
        });
      });
      expect(inBounds, `satellite drifted outside the SVG at +${wait}ms`).toBe(true);
    }
  });
});

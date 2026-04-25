// Launches page e2e — verifies the launch feed renders + countdown ticks.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

async function navigateToLaunches(page) {
  await visit(page);
  await page.locator("a:has-text('Launches')").first().click({ force: true });
  await expect(page).toHaveURL(/\/launches$/);
}

test.describe("Launches page", () => {
  test("renders ≥1 launch card", async ({ page }) => {
    await navigateToLaunches(page);
    // The Launches page renders cards with a launch image / title. Wait for
    // at least one heading or img to settle in.
    const headings = page.locator("h2, h3");
    await expect.poll(() => headings.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test("countdown timer ticks within a 3-second window", async ({ page }) => {
    await navigateToLaunches(page);
    await page.waitForTimeout(8_000); // let the API + render settle

    const sampleA = await page.evaluate(() => document.body.innerText);
    await page.waitForTimeout(3_500);
    const sampleB = await page.evaluate(() => document.body.innerText);
    expect(sampleA, "page text didn't change in 3.5s — countdown not running")
      .not.toBe(sampleB);
  });
});

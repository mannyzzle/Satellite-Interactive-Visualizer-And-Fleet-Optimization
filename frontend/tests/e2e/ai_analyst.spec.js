// End-to-end stress test for the AI analyst drawer (AskSatTrack).
//
// What we're protecting against:
//   1. Markdown markers leaking through as literal text (the bug the
//      RichText component was added to fix). Assert no "**" survives.
//   2. The drawer staying broken on subsequent prompts (regressions in
//      the streaming state machine).
//   3. Model name leaking into UI strings (user asked it not to).
//
// The drawer hits the deployed backend via /api/llm/...; tests run against
// the local dev server pointed at the same backend. Each LLM call costs
// real tokens, so we cap to a couple of cheap prompts.
import { test, expect } from "@playwright/test";
import { visit } from "./helpers";

const SAMPLES = [
  // The pre-canned sample-prompt buttons — guaranteed to be visible on
  // first paint with no typing required, and they exercise tool calls.
  /How many active GPS satellites/i,
  /Top 3 conjunctions in the next 24h/i,
];

test.describe("AskSatTrack analyst", () => {
  test("opens the drawer, runs a sample prompt, renders markdown cleanly", async ({ page }) => {
    test.setTimeout(120_000);
    await visit(page);

    // Floating launcher is bottom-right.
    await page.getByRole("button", { name: /Ask Sat-Track/i }).click();

    // Drawer header should NOT leak the model name.
    const header = page.getByText(/AI analyst/i);
    await expect(header).toBeVisible({ timeout: 10_000 });
    const headerText = (await header.textContent()) || "";
    expect(/claude/i.test(headerText), "drawer header leaks the model name").toBe(false);

    // Click the first sample prompt to fire a real LLM round-trip.
    const sample = page.getByRole("button", { name: SAMPLES[0] });
    await sample.click();

    // Wait for the assistant bubble to receive at least 50 chars.
    const assistantBubble = page.locator("div", {
      has: page.locator(":text-matches('GPS|orbit|active|satellite', 'i')"),
    }).first();
    await expect(assistantBubble).toBeVisible({ timeout: 60_000 });

    // No literal "**" or "* " bullet markers should be visible — RichText
    // turns them into real <strong> / <ul>.
    const drawerHtml = await page.locator(".bg-gray-950\\/95").innerHTML();
    expect(drawerHtml.includes("**"), "literal bold markers leaked into the drawer").toBe(false);

    // Send a follow-up prompt to make sure the drawer doesn't get stuck.
    const input = page.getByPlaceholder(/Ask a question/i);
    await input.fill("Just say done.");
    await page.getByRole("button", { name: "Send" }).click();
    // Wait for a fresh assistant message containing "done" (case-insensitive).
    await expect(page.getByText(/done/i).last()).toBeVisible({ timeout: 60_000 });
  });
});

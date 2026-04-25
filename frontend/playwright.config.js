// @ts-check
import { defineConfig, devices } from "@playwright/test";

const PROD_URL =
  process.env.E2E_BASE_URL ||
  "https://mannyzzle.github.io/Satellite-Interactive-Visualizer-And-Fleet-Optimization/";

export default defineConfig({
  testDir: "./tests",
  // Vitest owns the unit tests; Playwright only runs e2e + stress projects.
  testIgnore: ["**/unit/**"],
  // E2E hits the live deployed site, so 3+ parallel workers tend to time out
  // against the API. Keep concurrency low to avoid flakiness; retry once.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: PROD_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "e2e-prod",
      testMatch: /tests\/e2e\/.*\.spec\.js/,
      testIgnore: [/stress\.spec\.js$/],
      use: { ...devices["Desktop Chrome"] },
      timeout: 60_000,
    },
    {
      name: "stress",
      testMatch: /tests\/e2e\/stress\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
      timeout: 180_000,
    },
  ],
});

// Common helper: navigate to the deployed Sat-Track app, respecting the
// GitHub Pages subpath. We can't rely on Playwright's `baseURL` here because
// `page.goto("/")` would resolve against the host and drop our /Satellite...
// prefix.
export const APP_URL =
  process.env.E2E_BASE_URL ||
  "https://mannyzzle.github.io/Satellite-Interactive-Visualizer-And-Fleet-Optimization/";

export async function visit(page, path = "") {
  const target = path
    ? `${APP_URL.replace(/\/$/, "")}/${path.replace(/^\/+/, "")}`
    : APP_URL;
  await page.goto(target);
}

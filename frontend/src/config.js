/**
 * Single source of truth for the backend host.
 *
 * Override locally with `VITE_API_BASE_URL` in `.env.local`. The trailing slash
 * is stripped so we can compose paths with a leading slash everywhere else.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://satellite-tracker-production.up.railway.app"
).replace(/\/$/, "");

/** Convenience: the most-used path roots, all rooted under API_BASE_URL. */
export const SATELLITES_API = `${API_BASE_URL}/api/satellites`;
export const CDM_API = `${API_BASE_URL}/api/cdm`;
export const OLD_TLES_API = `${API_BASE_URL}/api/old_tles`;
export const LAUNCHES_API = `${API_BASE_URL}/api/launches`;
export const LLM_API = `${API_BASE_URL}/api/llm`;
export const REENTRY_API = `${API_BASE_URL}/api/reentry`;
export const SPACE_WEATHER_API = `${API_BASE_URL}/api/space-weather`;
export const DIGEST_API = `${API_BASE_URL}/api/digest`;

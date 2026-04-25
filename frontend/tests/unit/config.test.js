import { describe, it, expect } from "vitest";
import {
  API_BASE_URL,
  SATELLITES_API,
  CDM_API,
  OLD_TLES_API,
  LAUNCHES_API,
} from "../../src/config";

describe("config.js", () => {
  it("falls back to the production Railway URL when no env override is set", () => {
    expect(API_BASE_URL).toBe(
      "https://satellite-tracker-production.up.railway.app"
    );
  });

  it("never has a trailing slash on the base URL", () => {
    expect(API_BASE_URL).not.toMatch(/\/$/);
  });

  it("composed paths are well-formed (single slash between segments)", () => {
    expect(SATELLITES_API).toBe(`${API_BASE_URL}/api/satellites`);
    expect(CDM_API).toBe(`${API_BASE_URL}/api/cdm`);
    expect(OLD_TLES_API).toBe(`${API_BASE_URL}/api/old_tles`);
    expect(LAUNCHES_API).toBe(`${API_BASE_URL}/api/launches`);
    for (const url of [SATELLITES_API, CDM_API, OLD_TLES_API, LAUNCHES_API]) {
      expect(url).not.toMatch(/\/\/api/);
    }
  });
});

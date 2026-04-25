import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock axios at module level so the service module sees our spy
vi.mock("axios", () => {
  const get = vi.fn();
  return { default: { get } };
});

import axios from "axios";
import {
  fetchSatellites,
  fetchSatelliteByName,
  fetchHistoricalTLEs,
  fetchCDMEvents,
} from "../../src/api/satelliteService";

beforeEach(() => {
  axios.get.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchSatellites", () => {
  it("hits /api/satellites/?page=&limit= and returns the response data", async () => {
    axios.get.mockResolvedValue({
      data: { satellites: [{ norad_number: 25544, name: "ISS" }], total: 1 },
    });
    const result = await fetchSatellites(1, 10);
    const url = axios.get.mock.calls[0][0];
    expect(url).toContain("/api/satellites/?page=1&limit=10");
    expect(result.satellites).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("URL-encodes filter param", async () => {
    axios.get.mockResolvedValue({ data: { satellites: [], total: 0 } });
    await fetchSatellites(1, 10, "Apogee > 35000 km");
    const url = axios.get.mock.calls[0][0];
    expect(url).toMatch(/filter=Apogee%20%3E%2035000%20km/);
  });

  it("returns an empty {satellites: []} on network error rather than throwing", async () => {
    // The service catches errors so the UI never crashes; that contract matters.
    axios.get.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await fetchSatellites(1, 10);
    expect(result).toEqual({ satellites: [] });
  });
});

describe("fetchSatelliteByName", () => {
  it("URL-encodes the name in the path and uses validateStatus to allow 404 handling", async () => {
    axios.get.mockResolvedValue({ status: 200, data: { norad_number: 25544, name: "ISS (ZARYA)" } });
    await fetchSatelliteByName("ISS (ZARYA)");
    const [url, opts] = axios.get.mock.calls[0];
    expect(url).toContain("/api/satellites/ISS%20(ZARYA)");
    expect(opts).toBeDefined();
    expect(typeof opts.validateStatus).toBe("function");
  });

  it("returns null on 404 instead of throwing (UI doesn't crash on bad name)", async () => {
    axios.get.mockResolvedValue({ status: 404, data: null });
    const result = await fetchSatelliteByName("DEFINITELYNOTREAL");
    expect(result).toBeNull();
  });
});

describe("fetchHistoricalTLEs + fetchCDMEvents", () => {
  it("fetchHistoricalTLEs uses /api/old_tles/fetch/{norad}", async () => {
    axios.get.mockResolvedValue({
      data: { historical_tles: [{ epoch: "2024-01-01", tle_line1: "x", tle_line2: "y" }] },
    });
    const r = await fetchHistoricalTLEs(25544);
    const url = axios.get.mock.calls[0][0];
    expect(url).toContain("/api/old_tles/fetch/25544");
    expect(r.historical_tles).toHaveLength(1);
  });

  it("fetchHistoricalTLEs returns empty array on error (graceful UI degradation)", async () => {
    axios.get.mockRejectedValue(new Error("network"));
    const r = await fetchHistoricalTLEs(99999);
    expect(r).toEqual({ historical_tles: [] });
  });

  it("fetchCDMEvents hits /api/cdm/fetch", async () => {
    axios.get.mockResolvedValue({ data: { cdm_events: [] } });
    await fetchCDMEvents();
    const url = axios.get.mock.calls[0][0];
    expect(url).toContain("/api/cdm/fetch");
  });
});

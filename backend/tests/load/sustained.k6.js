// k6 sustained load test — 25 VUs for 5 min mixing realistic user actions
// (browse list, search, lookup detail, check launches) with a small think-time.
// Total wall time ≈5 min.
//
//     k6 run backend/tests/load/sustained.k6.js

import http from "k6/http";
import { check, sleep, group } from "k6";

const BASE = __ENV.SATTRACK_API || "https://satellite-tracker-production.up.railway.app";

export const options = {
  scenarios: {
    sustained: {
      executor: "constant-vus",
      vus: 25,
      duration: "5m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],         // <0.5% errors
    http_req_duration: ["p(95)<1000"],
  },
};

const SUGGEST_QUERIES = ["ISS", "STARLINK", "COSMOS", "GPS", "GLONASS", "TELESAT"];

function randIn(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export default function () {
  group("browse_list", () => {
    const page = 1 + Math.floor(Math.random() * 10);
    const r = http.get(`${BASE}/api/satellites/?page=${page}&limit=50`);
    check(r, { "list: 200": (resp) => resp.status === 200 });
  });
  sleep(0.4 + Math.random() * 0.6); // 0.4-1.0s think time

  group("search_suggest", () => {
    const r = http.get(`${BASE}/api/satellites/suggest?query=${randIn(SUGGEST_QUERIES)}`);
    check(r, { "suggest: 200": (resp) => resp.status === 200 });
  });
  sleep(0.3 + Math.random() * 0.5);

  group("lookup_iss", () => {
    const r = http.get(`${BASE}/api/satellites/25544`);
    check(r, { "iss: 200": (resp) => resp.status === 200 });
  });
  sleep(0.4 + Math.random() * 0.4);

  group("upcoming_launches", () => {
    const r = http.get(`${BASE}/api/launches/upcoming`);
    check(r, { "launches: 200": (resp) => resp.status === 200 });
  });
  sleep(0.3 + Math.random() * 0.7);

  // CDM fetch is heavy — only hit it 1 in 4 iterations
  if (Math.random() < 0.25) {
    group("cdm", () => {
      const r = http.get(`${BASE}/api/cdm/fetch`);
      check(r, { "cdm: 200": (resp) => resp.status === 200 });
    });
    sleep(0.5);
  }
}

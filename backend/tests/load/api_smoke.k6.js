// k6 smoke load test — ramps to 50 VUs hitting the heavy list endpoint and
// the lightweight count endpoint. Run manually:
//
//     k6 run backend/tests/load/api_smoke.k6.js
//
// Hits prod read-only. Don't loop indefinitely; the default plan exits after
// ~2.5 minutes of total wall time.

import http from "k6/http";
import { check, sleep, group } from "k6";

const BASE = __ENV.SATTRACK_API || "https://satellite-tracker-production.up.railway.app";

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      stages: [
        { duration: "60s", target: 50 },
        { duration: "60s", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],          // <1% errors
    http_req_duration: ["p(95)<800"],         // p95 under 800ms
    "http_req_duration{name:list_500}": ["p(95)<2000"], // page+limit=500 is heavier
    "http_req_duration{name:count}":    ["p(95)<400"],
  },
};

export default function () {
  group("count", () => {
    const r = http.get(`${BASE}/api/satellites/count`, { tags: { name: "count" } });
    check(r, {
      "count: 200": (resp) => resp.status === 200,
      "count: total > 0": (resp) => (resp.json("total") || 0) > 0,
    });
  });

  group("list_500", () => {
    const r = http.get(
      `${BASE}/api/satellites/?page=1&limit=500`,
      { tags: { name: "list_500" } }
    );
    check(r, {
      "list_500: 200": (resp) => resp.status === 200,
      "list_500: returns satellites array": (resp) => {
        const body = resp.json();
        return Array.isArray(body) || Array.isArray(body.satellites);
      },
    });
  });

  sleep(1);
}

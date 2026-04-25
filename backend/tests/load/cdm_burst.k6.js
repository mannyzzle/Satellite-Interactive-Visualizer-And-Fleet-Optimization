// k6 burst load test — short spike on the heaviest endpoint (/api/cdm/fetch
// returns ~41k rows). The point is to verify the API doesn't fall over under
// a sudden flash crowd, e.g. from a Hacker News spike. Total wall time ~30s.
//
//     k6 run backend/tests/load/cdm_burst.k6.js

import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.SATTRACK_API || "https://satellite-tracker-production.up.railway.app";

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: "10s", target: 50 },   // ramp from 5/s → 50/s
        { duration: "10s", target: 50 },   // hold the spike
        { duration: "10s", target: 0 },    // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate==0"],            // zero errors during a spike
    http_req_duration: ["p(99)<2000"],       // p99 under 2s even in burst
  },
};

export default function () {
  const r = http.get(`${BASE}/api/cdm/fetch`);
  check(r, {
    "cdm: 200": (resp) => resp.status === 200,
    "cdm: has events": (resp) => Array.isArray(resp.json("cdm_events")),
  });
}

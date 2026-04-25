# Load tests

These tests use [k6](https://k6.io) to drive realistic load against the live
Sat-Track API on Railway. They are **read-only** — every request is a `GET`,
nothing writes to the database.

> ⚠️ **Manual only.** These run against production. Do not wire them into CI
> without thinking carefully — a sustained run will show up as a real load
> spike on the Railway dashboard and may briefly slow the site for actual users.

## Install k6

```bash
brew install k6                # macOS
# or: choco install k6         # Windows
# or: see https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Run

```bash
# 1) Smoke ramp — 5→50 VUs across the count + list endpoints. ~2.5 min.
k6 run backend/tests/load/api_smoke.k6.js

# 2) Burst — 50 req/s spike on /api/cdm/fetch (heaviest endpoint). ~30s.
k6 run backend/tests/load/cdm_burst.k6.js

# 3) Sustained — 25 VUs for 5 min mixing list/search/detail/launches/cdm.
k6 run backend/tests/load/sustained.k6.js
```

Override the target with `SATTRACK_API`:

```bash
SATTRACK_API=http://localhost:8000 k6 run backend/tests/load/api_smoke.k6.js
```

## What each test asserts

| Script | Goal | Key thresholds |
|---|---|---|
| `api_smoke.k6.js` | Steady-state under medium load | error rate < 1%, p95 < 800ms (count), p95 < 2s (list-500) |
| `cdm_burst.k6.js` | Survive a flash crowd on the heavy endpoint | error rate = 0, p99 < 2s |
| `sustained.k6.js` | No slow degradation under realistic mixed traffic | error rate < 0.5%, p95 < 1s |

## Why these tests exist

Real users browse a list (`/api/satellites/?page=&limit=`), peek at a satellite
(`/api/satellites/{name_or_norad}`), occasionally search
(`/api/satellites/suggest`), and reload the launches feed
(`/api/launches/upcoming`). The CDM endpoint is the most expensive — it returns
all ~41k conjunction events at once. These three scripts drive that mix and
the heavy outlier in shapes the API actually has to handle, so a regression
in query plan or N+1 problem will surface before real users notice.

## Reading the output

k6 prints a summary table at exit. The lines that matter:

- `http_req_failed` — share of non-2xx responses.
- `http_req_duration` — full latency including network. Look at `p(95)`.
- `iterations` — total user-flow loops completed.

If any threshold fails, k6 exits non-zero and the line is colored red.

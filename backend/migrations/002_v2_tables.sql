-- 002_v2_tables.sql
-- Additive only. Backs the v2 LLM features (Phase A + Phase B).
-- Run once: psql "$DATABASE_URL" -f backend/migrations/002_v2_tables.sql

-- Daily 5-paragraph briefing generated once per day, served from cache.
CREATE TABLE IF NOT EXISTS llm_daily_briefings (
  day        DATE PRIMARY KEY,
  briefing   TEXT NOT NULL,
  model      TEXT NOT NULL,
  generated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sampled telemetry for tuning rate limits + caches.
-- Sampling is done in the app (10% by default) — not all requests row here.
CREATE TABLE IF NOT EXISTS llm_request_log (
  id           BIGSERIAL PRIMARY KEY,
  endpoint     TEXT NOT NULL,
  ip           TEXT,
  cache_hit    BOOLEAN NOT NULL DEFAULT FALSE,
  tool_calls   INT NOT NULL DEFAULT 0,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  latency_ms   INT,
  status       INT NOT NULL DEFAULT 200,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS llm_request_log_created_idx ON llm_request_log(created_at);
CREATE INDEX IF NOT EXISTS llm_request_log_endpoint_idx ON llm_request_log(endpoint, created_at);

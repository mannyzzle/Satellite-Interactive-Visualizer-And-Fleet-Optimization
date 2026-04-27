-- 001_llm_tables.sql
-- Additive only. Creates two new tables for the Claude API integration.
-- Does NOT touch any existing satellite/cdm/launches data.
-- Run once: psql "$DATABASE_URL" -f backend/migrations/001_llm_tables.sql

CREATE TABLE IF NOT EXISTS llm_cache (
  endpoint    TEXT NOT NULL,
  input_hash  TEXT NOT NULL,
  response    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (endpoint, input_hash)
);

CREATE INDEX IF NOT EXISTS llm_cache_expires_idx ON llm_cache(expires_at);

CREATE TABLE IF NOT EXISTS llm_usage_daily (
  day            DATE PRIMARY KEY,
  request_count  INT    NOT NULL DEFAULT 0,
  input_tokens   BIGINT NOT NULL DEFAULT 0,
  output_tokens  BIGINT NOT NULL DEFAULT 0
);

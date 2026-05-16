-- Turso/libSQL archive layer for completed fleet runs.
--
-- One row per Coral session that ran to (orchestrator) synthesis. Acts as
-- the durable replacement for Coral's in-memory session — once the Coral
-- session is GC'd, this row is the source of truth for replaying the
-- trace on /research/[ns]/[sid].
--
-- Shape note: the full agents[] + threads[] snapshot is stored as a
-- single JSON blob (trace_json). Decompose into a normalized messages
-- table later if we ever need cross-run message search; for V0 the blob
-- is enough since the rendering path on /research already expects the
-- /extended snapshot shape.
--
-- The fleet_observations / fleet_run_messages / Mastra mastra_* tables
-- mentioned in the design doc come later, alongside the agent-side
-- memory tooling. This migration only lands what's needed for archive
-- + replay.

CREATE TABLE IF NOT EXISTS fleet_runs_archive (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  synthesis_text TEXT,
  trace_json TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fleet_runs_user
  ON fleet_runs_archive (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_runs_session
  ON fleet_runs_archive (session_id);

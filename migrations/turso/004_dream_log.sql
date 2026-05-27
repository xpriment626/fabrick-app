-- Stage 1 (design.md §16) — manual dreaming: the dream-act log + atom supersession.
--
-- Stage 0 gave us the loop (archive → dream → atoms + working memory) but
-- dreams left no record of the *act*, only the outputs. Two changes land here:
--
--   1. dream_runs — one row per dream invocation (on-completion OR manual
--      re-dream). This is the substrate for the §16 "inspect dreams over
--      time" activity log (surface C) and for Stage 2 scheduling (a recurring
--      cycle is just rows here on a timer). It captures the (scope, schedule,
--      intent) triple as plain columns so future scopes are a WHERE clause,
--      not a migration — same spine philosophy as 003. The richer
--      `dream_cycles` (config) / `dream_results` (artifact diffs) split from
--      §16 is deferred to Stage 2; for extraction dreaming the result summary
--      lives inline here and the atoms themselves live in fleet_memory_items.
--
--   2. fleet_memory_items.superseded_at — lets a manual re-dream RETIRE the
--      prior atoms it extracted from the same run instead of duplicating them.
--      Kept distinct from dismissed_at on purpose: dismissed = "user rejected
--      this"; superseded = "a newer dream replaced this". Default reads hide
--      both; the audit trail of every prior atom is preserved either way.
--
-- Re-run-safe: IF NOT EXISTS guards + a tolerated duplicate-column ADD.

------------------------------------------------------------------------
-- 1. dream_runs — the dream-act log (shared multi-tenant DB)
------------------------------------------------------------------------
-- source_run_id  fleet_runs_archive.id this dream was over. Nullable so a
--                future topic/composition/global-scoped dream (no single
--                source run) still logs here; run-scoped dreams always set it.
-- scope          'run' | 'topic' | 'composition' | 'global' (§16 scope axis).
-- schedule       'on-completion' | 'manual' (| 'recurring' at Stage 2).
-- intent         'extract' | 'refresh' (§16 intent axis; v0/v1 = extract).
-- status         'ok' | 'error'.
-- topic          the topic label this dream derived (result), nullable.
-- atoms_written / atoms_superseded  how many atoms this dream added / retired.
-- working_memory_updated  0/1 — did the synthesis blob get rewritten.
-- error          message on status='error', else null.
-- duration_ms    wall-clock of the dream (LLM round-trip + writes).
-- created_at     epoch ms (matches the rest of the schema).
CREATE TABLE IF NOT EXISTS dream_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_run_id TEXT,
  scope TEXT NOT NULL DEFAULT 'run',
  schedule TEXT NOT NULL DEFAULT 'on-completion',
  intent TEXT NOT NULL DEFAULT 'extract',
  status TEXT NOT NULL,
  topic TEXT,
  atoms_written INTEGER NOT NULL DEFAULT 0,
  atoms_superseded INTEGER NOT NULL DEFAULT 0,
  working_memory_updated INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

-- Activity log: a user's dream history, newest first (§16 surface C).
CREATE INDEX IF NOT EXISTS idx_dream_runs_user
  ON dream_runs (user_id, created_at DESC);

-- Per-run dream history: "when was this run last dreamed" + re-dream timeline.
CREATE INDEX IF NOT EXISTS idx_dream_runs_source
  ON dream_runs (source_run_id, created_at DESC);

------------------------------------------------------------------------
-- 2. fleet_memory_items.superseded_at — re-dream retirement marker
------------------------------------------------------------------------
ALTER TABLE fleet_memory_items ADD COLUMN superseded_at INTEGER;

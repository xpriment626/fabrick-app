-- Stage 0 memory loop + the discriminator spine for §16 dream scoping.
--
-- Two changes land together because they are one coherent shape:
--   1. fleet_memory_items — the queryable atom store the dream pass writes
--      (design.md §15). One row per extracted fact.
--   2. The discriminator spine on fleet_runs_archive (design.md §16) — the
--      columns that let every later dream scope (topic / composition /
--      artifact) be a WHERE clause instead of a migration, and that back
--      the Fleet Archives tabs.
--
-- The spine is added NOW even though Stage 0 dreaming is run/global-scoped
-- and naive, precisely so Stage 1 (scoped extraction + tabs) is pure query
-- work. See design.md §16 "Schema implications".
--
-- Runner notes: statements split on ';', '--' lines stripped, duplicate-
-- column ADDs tolerated, whole file re-run-safe (every statement is
-- idempotent: IF NOT EXISTS guards + UPDATEs that set to the same value).

------------------------------------------------------------------------
-- 1. fleet_memory_items — atom store (shared multi-tenant DB)
------------------------------------------------------------------------
-- kind         discriminator: 'observation' (auto-extracted tool output)
--              vs 'dream_item' (LLM-curated synthesis). Typed atom kinds
--              (declared by a template's memory_atoms) slot in here later.
-- content      the human-readable fact. Typed-atom JSON can serialize here
--              until/if a dedicated payload column is warranted.
-- salience     optional 0..1 importance the dream pass assigns; nullable.
-- source_run_id references fleet_runs_archive.id (the run this came from).
-- template_id  composition the source run was (e.g. 'research') — copied
--              from the archive row so atom queries don't need a join.
-- topic_id     nullable; cheap LLM-derived topic label in v0, FK to a
--              future clustered `topics` table later.
-- extracted_at / dismissed_at  epoch ms (matches archive's INTEGER ms).
CREATE TABLE IF NOT EXISTS fleet_memory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_run_id TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  salience REAL,
  template_id TEXT,
  topic_id TEXT,
  extracted_at INTEGER NOT NULL,
  dismissed_at INTEGER
);

-- Newest-first listing for "manage my memory" + working-memory rebuild.
CREATE INDEX IF NOT EXISTS idx_memory_items_user
  ON fleet_memory_items (user_id, extracted_at DESC);

-- Scope filters (Stage 1 reads): by kind, composition, topic.
CREATE INDEX IF NOT EXISTS idx_memory_items_kind
  ON fleet_memory_items (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_memory_items_template
  ON fleet_memory_items (user_id, template_id);
CREATE INDEX IF NOT EXISTS idx_memory_items_topic
  ON fleet_memory_items (user_id, topic_id);

-- Link back to the originating run.
CREATE INDEX IF NOT EXISTS idx_memory_items_source
  ON fleet_memory_items (source_run_id);

------------------------------------------------------------------------
-- 2. Discriminator spine on fleet_runs_archive (§16)
------------------------------------------------------------------------
-- template_id  the composition/mode (FleetMode id) the run executed.
--              Declared at dispatch today but dropped before archive —
--              this column is the linchpin connecting the shipped fleet
--              mode registry to the memory loop + Fleet Archives tabs.
-- topic_id     nullable topic label/FK (mirrors fleet_memory_items).
-- artifact_id  version-chain identity for living artifacts (§16 Stage 3).
--              Each run is its own artifact v1 by default; a refresh dream
--              writes a new row sharing artifact_id with version = N+1.
-- version      1-based version within an artifact chain.
-- supersedes   prior version's archive id (null for v1).
ALTER TABLE fleet_runs_archive ADD COLUMN template_id TEXT;
ALTER TABLE fleet_runs_archive ADD COLUMN topic_id TEXT;
ALTER TABLE fleet_runs_archive ADD COLUMN artifact_id TEXT;
ALTER TABLE fleet_runs_archive ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fleet_runs_archive ADD COLUMN supersedes TEXT;

-- Backfill existing rows: every historical run was the 'research' mode
-- (the only FleetMode that has ever shipped), and each is its own
-- artifact v1. Idempotent — sets to the same value on re-run.
UPDATE fleet_runs_archive SET template_id = 'research' WHERE template_id IS NULL;
UPDATE fleet_runs_archive SET artifact_id = id WHERE artifact_id IS NULL;

-- Fleet Archives tabs: list a user's runs within one composition, newest first.
CREATE INDEX IF NOT EXISTS idx_fleet_runs_template
  ON fleet_runs_archive (user_id, template_id, completed_at DESC);

-- Version-chain resolution for living artifacts.
CREATE INDEX IF NOT EXISTS idx_fleet_runs_artifact
  ON fleet_runs_archive (artifact_id, version);

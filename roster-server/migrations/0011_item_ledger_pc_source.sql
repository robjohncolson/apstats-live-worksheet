-- 0011_item_ledger_pc_source: allow source='pc' (progress-check rows) in item_ledger.
--
-- The 0002 CHECK constraint allowed only ('worksheet','frq','curriculum_quiz').
-- curriculum_render writes source='pc' for /^U\d+-PC-/ progress-check submissions
-- (see recordToGradebookLedger), which Postgres was REJECTING (check_violation),
-- silently swallowed by the fire-and-forget gradebook client -- so PC rows never
-- persisted and the PC-mastery track of Grading Model v3 was always null.
--
-- This unblocks the PC track once the P1 feeder (curriculum_render cd2ec6d) is live.
-- Grade-pipeline spec: GRADE_PIPELINE_E2E_SPEC.md (P2). Run on the shared Supabase.
--
-- NOTE: 'poster'/'blooket' are intentionally NOT added here -- they have no producer
-- yet; they join with their own migration when the v3.4/v3.5 tracks land (P5).
--
-- If your constraint has a non-default name, find it with `\d item_ledger` (psql)
-- and adjust the DROP below. The default for an inline column CHECK is
-- <table>_<column>_check = item_ledger_source_check.

alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','pc'));

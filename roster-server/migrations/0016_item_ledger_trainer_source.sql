-- 0016_item_ledger_trainer_source: allow source='trainer' (fleet trainer
-- practice rows) in item_ledger.
--
-- USER-RUN (run on the shared Supabase, like 0011/0013/0014/0015 -- never
-- auto-run). Additive: widens the source CHECK. Intended writers are the
-- fleet trainers: ti84-trainer-v2 (this repo) and tmux-trainer (the external
-- Equation Trainer).
--
-- GRADE-INERT BY OMISSION: lesson-grade.js consumes specific sources only,
-- so 'trainer' rows are engine-invisible until a future lesson-grade.js
-- track explicitly consumes them. Recording starts now; grading joins later.
--
-- Before this migration runs Postgres REJECTS trainer rows (check_violation)
-- and POST /ledger/record reports 503 "source 'trainer' not provisioned" so
-- nothing dies silently.
--
-- Mirror of 0011/0013/0014/0015: drop + re-add the source CHECK with the
-- extra value.

alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','pc','blooket','quiz_exception','quiz_review','trainer'));

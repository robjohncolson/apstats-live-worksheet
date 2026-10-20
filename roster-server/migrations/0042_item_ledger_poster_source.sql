-- USER-RUN: the unit poster as a Work-track ledger row (POSTER_WORK_TRACK_SPEC.md, 2026-10-20).
-- Full existing allow-list from 0036, plus 'poster' (POSTER-U{n}, score 90-115, teacher routes only).
alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','pc','blooket','quiz_exception','quiz_review','trainer','bonus','bonus_applied','poster'));

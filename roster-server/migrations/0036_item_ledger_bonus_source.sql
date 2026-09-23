-- USER-RUN: banked bonus and quarter-close audit rows, teacher routes only.
-- Full existing allow-list from 0016, plus the two bonus sources.
alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','pc','blooket','quiz_exception','quiz_review','trainer','bonus','bonus_applied'));

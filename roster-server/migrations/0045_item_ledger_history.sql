-- 0045_item_ledger_history.sql -- the server APPENDS: every overwritten ledger
-- version is kept in an append-only history table (simplify plan SH-2).
--
-- USER-RUN: paste this file into the Supabase SQL editor, off-hours (creating the
-- trigger takes a brief lock on item_ledger). A Railway deploy does NOT apply it.
-- Additive and re-run-safe. Order with deploys does not matter. Reversible with:
--   drop trigger if exists item_ledger_history_on_update on item_ledger;
--
-- WHY: item_ledger stays the current-state table (about 15 readers, the hourly
-- FRQ regrade and the weekly misconception feed rely on one row per student,
-- source, item and attempt). This trigger copies the OLD row aside whenever a
-- write changes its response, score or evidence tier, so no version is lost and
-- no route, reader or API call changes. Nothing reads the history yet; query it in
-- the SQL editor, for example:
--   select * from item_ledger_history
--   where student_id = '<uuid>' and item_id = '<item>' order by superseded_at;
--
-- Rules (see the plan, section 5.5):
--   * UPDATE only. A DELETE trigger would also fire on the roster-delete cascade.
--   * Foreign key to roster ON DELETE CASCADE (same cascade item_ledger has), so a
--     student purge also purges their history. NO foreign key to item_ledger:
--     quiz-reset and poster-convert delete ledger rows.
--   * No CHECK on source: migrations 0036/0042 rewrite the live check, and a stale
--     copy here would silently reject new sources.
--   * The long tail of columns is kept as to_jsonb(OLD), so a column that is
--     missing on a given database (reasoning, frq_*) cannot break the copy.
--   * The copy can never fail the ledger write (exception block), and the function
--     is SECURITY DEFINER with a pinned search_path, so row-level security and the
--     caller's insert rights cannot silently swallow history.
--   * Identical rewrites, receipt-only, claim and lease updates add nothing: the
--     WHEN guard skips them before the function runs.

create table if not exists item_ledger_history (
  history_id                 bigint generated always as identity primary key,
  ledger_id                  uuid not null,
  student_id                 uuid not null references roster(student_id) on delete cascade,
  source                     text not null,
  item_id                    text not null,
  attempt                    int  not null,
  response                   jsonb,
  score                      numeric,
  evidence_tier              text,
  receipt_id                 text,
  recorded_at                timestamptz,   -- the OLD row's recorded_at: last write time of that version
  graded_at                  timestamptz,
  superseded_at              timestamptz not null default now(),
  superseded_by_recorded_at  timestamptz,
  old_row                    jsonb not null
);

create index if not exists item_ledger_history_item_idx
  on item_ledger_history (student_id, source, item_id, attempt, superseded_at);

alter table item_ledger_history enable row level security;
-- (Intentionally NO policies. Service-role only.)

create or replace function item_ledger_history_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_json jsonb := to_jsonb(old);
begin
  begin
    insert into item_ledger_history (
      ledger_id, student_id, source, item_id, attempt,
      response, score, evidence_tier, receipt_id,
      recorded_at, graded_at, superseded_by_recorded_at, old_row
    ) values (
      old.ledger_id, old.student_id, old.source, old.item_id, old.attempt,
      old.response, old.score, old.evidence_tier, old_json ->> 'receipt_id',
      old.recorded_at, old.graded_at, new.recorded_at, old_json
    );
  exception when others then
    -- History must never cost a student their save.
    raise warning 'item_ledger_history copy skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function item_ledger_history_copy() from public;

drop trigger if exists item_ledger_history_on_update on item_ledger;
create trigger item_ledger_history_on_update
  after update on item_ledger
  for each row
  when (old.response is distinct from new.response
        or old.score is distinct from new.score
        or old.evidence_tier is distinct from new.evidence_tier)
  execute function item_ledger_history_copy();

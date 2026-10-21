-- 0043_pc_status.sql -- the AP Classroom Progress Check snapshot (PC_FOLLOWTHROUGH_SPEC.md section 2.3).
-- USER-RUN on the shared Supabase. Additive and idempotent. Not grade-affecting: nothing in the grade
-- engine reads this table. GET/POST /pc/status (teacher) read and write it; the teacher dashboard
-- "Progress Check completeness" panel shows it next to the posted ledger rows.
--
-- One row per (section, unit): what tools/apclassroom_pc_reconcile.py saw on its last --apply run.
-- The payload holds roster USERNAMES only; unmatched AP Classroom names are counted, never stored.
--
-- Until this runs, GET/POST /pc/status answer 503 { error: 'run migration 0043' }; posting the
-- per-part ledger rows (POST /pc/grade) does not need it.

create table if not exists pc_status (
  section    text        not null,
  unit       int         not null,
  payload    jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (section, unit)
);

alter table pc_status enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0038 / 0040).

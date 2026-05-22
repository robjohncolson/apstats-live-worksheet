-- 0007_poll_archive.sql -- Live Classroom v2.1. Apply to the
-- curriculum_render Supabase project (bzqbhtrurzzavhqbgqrs; section 1.1).
-- Creates ONLY poll_archive + its indexes -- NEVER ALTER an existing
-- table. Shared-project discipline (same posture as 0001_roster.sql and
-- 0004_remediation_assignment.sql).
--
-- Schema mirrors LIVE_CLASSROOM_V2_1_BUILD.md section 1.1. RLS is
-- enabled with zero policies -- service-role only access via roster-server.
--
-- Until this migration is run, the v2.1 poll-archive roster-server
-- endpoints respond with 503 {ok:false, error:"poll_archive not
-- provisioned -- run migration 0007"}; the rest of the service stays up.

create table if not exists poll_archive (
  id          uuid primary key default gen_random_uuid(),
  poll_id     text unique,
  section     text not null,
  poll_date   date not null,
  question    text not null,
  options     jsonb not null,
  tally       jsonb not null,
  blind       boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists poll_archive_section_date_idx on poll_archive (section, poll_date);

alter table poll_archive enable row level security;
-- Intentionally NO policies. Service-role only. Same posture as roster + item_ledger.

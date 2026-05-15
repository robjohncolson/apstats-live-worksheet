-- =============================================================================
-- The Desk — Summer 2026 student-progress migration
-- =============================================================================
--
-- Purpose:
--   Adds two new tables (`students`, `student_progress`) for tracking per-student
--   completion of lesson artifacts (videos watched, Blookets played, quizzes,
--   worksheets, drills). Students self-report from the live worksheet app via
--   anon-role INSERTs; the teacher reads aggregated views via service-role.
--
--   This is the data backbone for the summer-2026 rollout, in which students
--   work asynchronously through the AP Statistics roadmap and the app records
--   their progress events.
--
-- How to apply:
--   1. Open the Supabase SQL editor for project hgvnytaqmuybzbotosyj.
--   2. Paste this entire file.
--   3. Run once. The script is idempotent — re-running is safe.
--
-- Idempotency notes:
--   - `create table if not exists` for tables.
--   - `create index if not exists` for indexes.
--   - `create or replace view` for views.
--   - Policies use `drop policy if exists ... ; create policy ...` because
--     `create policy if not exists` is not supported in older Postgres
--     versions and is unreliable across Supabase upgrades.
--
-- Scope:
--   This migration is ADDITIVE ONLY. It does NOT modify, drop, or otherwise
--   touch the existing `lesson_urls` or `topic_schedule` tables that power
--   the teacher-side overlay in ap_stats_roadmap_square_mode.html.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists students (
  email      text primary key,
  name       text,
  period     text check (period in ('B','E')),
  created_at timestamptz not null default now()
);

create table if not exists student_progress (
  id            uuid primary key default gen_random_uuid(),
  student_email text not null,
  topic_id      text not null,
  artifact      text not null check (artifact in ('video','blooket','quiz','worksheet','drills')),
  score         numeric,
  ts            timestamptz not null default now(),
  meta          jsonb default '{}'::jsonb
);


-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index if not exists student_progress_student_topic_idx
  on student_progress (student_email, topic_id);

create index if not exists student_progress_ts_desc_idx
  on student_progress (ts desc);

create index if not exists students_period_idx
  on students (period);


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table students         enable row level security;
alter table student_progress enable row level security;

-- students: anon may INSERT (self-registration), no SELECT
drop policy if exists "students anon insert" on students;
create policy "students anon insert"
  on students
  for insert
  to anon
  with check (true);

-- student_progress: anon may INSERT only
drop policy if exists "student_progress anon insert" on student_progress;
create policy "student_progress anon insert"
  on student_progress
  for insert
  to anon
  with check (true);

-- Note: no SELECT/UPDATE/DELETE policies for anon on either table.
-- Teacher dashboards read via service-role, which bypasses RLS entirely.


-- -----------------------------------------------------------------------------
-- Convenience views (teacher / service-role)
-- -----------------------------------------------------------------------------

-- Most recent event per (student, topic, artifact) triple.
create or replace view student_progress_latest as
select distinct on (student_email, topic_id, artifact)
       student_email,
       topic_id,
       artifact,
       score,
       ts,
       meta
from   student_progress
order  by student_email, topic_id, artifact, ts desc;

-- Per-student rollup: counts of distinct topics completed per artifact type,
-- average quiz score, and most recent activity timestamp.
create or replace view student_progress_summary as
select student_email,
       count(distinct topic_id) filter (where artifact = 'video')     as videos_done,
       count(distinct topic_id) filter (where artifact = 'blooket')   as blookets_done,
       count(distinct topic_id) filter (where artifact = 'quiz')      as quizzes_done,
       count(distinct topic_id) filter (where artifact = 'worksheet') as worksheets_done,
       count(distinct topic_id) filter (where artifact = 'drills')    as drills_done,
       avg(score) filter (where artifact = 'quiz' and score is not null) as avg_quiz_score,
       max(ts) as last_activity
from   student_progress
group  by student_email;

-- 0038_official_grade.sql -- the official quarter grade (OFFICIAL_GRADE_SYNC_SPEC.md §4.3).
-- One row per (student, quarter), written nightly by tools/schoology_official.py after it
-- sets the same number as the student's Schoology marking-period override. The Desk shows
-- it as the official grade. A published value: the grade engine never reads it.
-- Idempotent.

create table if not exists official_grade (
  student_id   text not null,
  quarter      text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  grade        numeric not null check (grade >= 0 and grade <= 100),
  parts        jsonb not null default '{}'::jsonb,
  as_of        timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (student_id, quarter)
);

alter table official_grade enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0009).

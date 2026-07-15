-- 0029_pc_makeup.sql — Progress-Check makeup/backup delivery (PC_MAKEUP_DELIVERY_SPEC.md Phase 1).
-- Two tables:
--   pc_bank    — the CB-SECURE PC26 item banks (private; NEVER in the public repo).
--                Loaded out-of-band via scripts/load-pc-bank.mjs. Payload holds the
--                FULL items incl. answers; the /pc read endpoint strips answers before
--                sending to the client (grading is server-authoritative, Phase 2).
--   pc_unlock  — per-student, per-(unit,part) online-PC unlock, set by the teacher AFTER
--                the paper administration. The /pc read endpoint gates on this.
-- Idempotent. Service-role only (mirrors 0009 lesson_unlock).

create table if not exists pc_bank (
  unit        int  not null,
  part        text not null check (part in ('A', 'REST')),
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (unit, part)
);

create table if not exists pc_unlock (
  id                bigserial primary key,
  student_username  text not null,
  unit              int  not null,
  part              text not null check (part in ('A', 'REST')),
  unlocked_by       text not null,
  unlocked_at       timestamptz not null default now(),
  status            text not null default 'active' check (status in ('active', 'revoked')),
  unique (student_username, unit, part)
);

create index if not exists pc_unlock_student_idx on pc_unlock (student_username) where status = 'active';

alter table pc_bank   enable row level security;
alter table pc_unlock enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0009 lesson_unlock).

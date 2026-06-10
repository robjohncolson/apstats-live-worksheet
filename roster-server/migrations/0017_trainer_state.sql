-- 0017_trainer_state: per-student-per-deck cloud save for the fleet trainers
-- (tmux-trainer / Equation Trainer cloud sync + leaderboard).
--
-- USER-RUN (run on the shared Supabase, like 0011/0013/0014/0015/0016 -- never
-- auto-run). Additive: a brand-new table, nothing existing is touched.
--
-- One row per (student, deck). `state` is the client-owned JSONB blob (compact
-- SRS tuples, xp, streak, quests, plus a small denormalized `lb` summary the
-- leaderboard endpoints read without touching the SRS payload). The server
-- never validates `state` internals beyond size + deckId -- it is display /
-- engagement data, never grade evidence.
--
-- Before this migration runs Postgres answers 42P01 (undefined_table) and
-- every /trainer/* route reports 503 "trainer_state not provisioned (run
-- migration 0017)" so nothing dies silently -- code ships first, degrading
-- gracefully, and the trainer treats the 503 as "cloud save off".
--
-- NOTE: `default now()` only fires on INSERT -- the routes set
-- updated_at = now() explicitly on every upsert so leaderboard "last active"
-- never goes stale.

create table if not exists trainer_state (
  -- uuid, NOT text: roster.student_id is uuid (0001) and Postgres rejects
  -- cross-type FKs (42804). Mirrors 0002/0004.
  student_id uuid not null references roster(student_id) on delete cascade,
  deck_id    text not null check (deck_id ~ '^[a-z0-9-]{1,64}$'),
  state      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (student_id, deck_id)
);

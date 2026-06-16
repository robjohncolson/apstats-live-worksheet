-- 0019_doge_wallet: DOGE Effort Wallet (DOGE_WALLET_SPEC). Per-student candy/DOGE
-- balances + an append-only action log.
--
-- USER-RUN on the shared Supabase (like 0011/0013/0014/0015/0016/0017 -- never
-- auto-run). Additive: two brand-new tables, nothing existing is touched.
--
-- Before this migration runs, Postgres answers 42P01 (undefined_table) / PostgREST
-- answers PGRST205 (schema-cache miss), and every /wallet route reports 503
-- "doge_wallet not provisioned (run migration 0019)" so nothing dies silently --
-- code ships first, degrading gracefully, and the Desk wallet treats 503 as
-- "rewards not turned on yet".
--
-- Model (broker, custodial-tracked → real on-chain in Phase 3):
--   candy a student can spend  = effort-candy (from the ledger) - candy_eaten - doge_cost_basis
--   candy the teacher owes      = candy_eaten - candy_given
--   DOGE the teacher must send  = doge_balance - doge_sent

create table if not exists doge_account (
  student_id      uuid primary key references roster(student_id) on delete cascade,
  doge_address    text,                          -- the kid's paper-wallet PUBLIC address (watch-only)
  candy_eaten     numeric not null default 0,    -- candy the student chose to consume
  candy_given     numeric not null default 0,    -- candy the teacher has physically handed out
  doge_balance    numeric not null default 0,    -- DOGE coins the student has bought (app-tracked)
  doge_sent       numeric not null default 0,    -- DOGE the teacher has deposited on-chain
  doge_cost_basis numeric not null default 0,    -- total candy spent buying DOGE (avg-price display)
  updated_at      timestamptz not null default now()
);

create table if not exists doge_ledger (
  id             bigint generated always as identity primary key,
  student_id     uuid not null references roster(student_id) on delete cascade,
  ts             timestamptz not null default now(),
  kind           text not null check (kind in ('eat', 'buy_doge', 'give', 'send')),
  candy_delta    numeric not null default 0,
  doge_delta     numeric not null default 0,
  doge_price_usd numeric,                         -- stamped at conversion (buy_doge)
  candy_per_doge numeric
);
create index if not exists doge_ledger_student_idx on doge_ledger (student_id, ts desc);

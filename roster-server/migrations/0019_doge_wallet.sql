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

-- Defense-in-depth (matches 0001/0002/0004/0007/0008): RLS ON so a non-service-role
-- PostgREST key on this SHARED Supabase project can't read/write addresses+balances.
-- The roster server uses the service-role key (bypasses RLS), so it's unaffected.
alter table doge_account enable row level security;
alter table doge_ledger  enable row level security;

-- ── Atomic guarded spend (eat / buy_doge) ────────────────────────────────────
-- A student's candy balance = earnedCandy (computed from the ledger, passed in as
-- p_earned) − candy_eaten − doge_cost_basis. The READ-MODIFY-WRITE the JS used
-- could lose updates / clobber fields under concurrent spends. This runs the
-- guard + debit as a SINGLE UPDATE so concurrent spends for one student serialize
-- on the row: the second spend re-evaluates the guard against the already-debited
-- row and is rejected if the balance no longer covers it. Returns the updated row,
-- or NULL when the guard fails (insufficient balance).
create or replace function doge_spend(
  p_sid uuid, p_earned numeric, p_candy numeric, p_kind text,
  p_doge numeric default 0, p_price numeric default null, p_cpd numeric default null
) returns doge_account
language plpgsql as $$
declare
  result doge_account;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  if p_kind = 'eat' then
    update doge_account
      set candy_eaten = candy_eaten + p_candy, updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_eaten - doge_cost_basis) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_eaten - doge_cost_basis) >= p_candy - 1e-9
      returning * into result;
  else
    raise exception 'unknown doge_spend kind: %', p_kind using errcode = '22023';
  end if;
  if result.student_id is not null then
    insert into doge_ledger (student_id, kind, candy_delta, doge_delta, doge_price_usd, candy_per_doge)
      values (p_sid, p_kind, -p_candy, coalesce(p_doge, 0), p_price, p_cpd);
  end if;
  return result;  -- NULL row → guard failed (insufficient balance)
end;
$$;

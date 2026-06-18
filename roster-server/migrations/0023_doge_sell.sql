-- 0023_doge_sell: DOGE → candy "Cash Out" (SELL_DOGE_SPEC). USER-RUN, additive, idempotent.
--
-- Reverses the one-way design (DOGE_WALLET_SPEC #4) ON PURPOSE: a student can cash IN-APP,
-- un-sent DOGE back to candy at the live floating rate and realize an appreciation gain.
--
-- The 6-number candy ledger gains a 7th term — REALIZED (net realized P&L, can be negative):
--   Earned + Received + Realized = Gifted + Converted + Materialized + Owed
--   spendable(Owed) = earnedCandy + candy_gifted_in + candy_realized
--                     − candy_given − doge_cost_basis − candy_gifted_out
-- A cash-out of `s` coins at live rate `r` (avg cost basis B = doge_cost_basis·s/doge_balance):
--   doge_balance −= s · doge_cost_basis −= B (floored 0) · candy_realized += (s·r − B)
-- so Owed rises by the full payout s·r and the gain/loss is booked to Realized (identity holds).
--
-- Until this runs, POST /wallet/sell-doge 503s (doge_sell absent → 42883 / PGRST202) and
-- candy_realized reads as 0 everywhere (deriveBalances coalesces) — the rest of the wallet is
-- unaffected (realized = 0 for everyone, so the +candy_realized guard terms are no-ops).

-- 1. New realized-P&L accumulator (signed; a net loss is negative).
alter table doge_account add column if not exists candy_realized numeric not null default 0;

-- 2. doge_ledger gains the cash-out leg.
alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add  constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in','sell_doge'));

-- 3. Patch doge_spend + doge_gift: the spendable guard must now ADD candy_realized, else a kid
--    couldn't spend/gift/convert the candy they realized by cashing out. Same bodies as 0022 +
--    the one term (realized = 0 pre-cash-out, so default behavior is byte-identical).
create or replace function doge_spend(
  p_sid uuid, p_earned numeric, p_candy numeric, p_kind text,
  p_doge numeric default 0, p_price numeric default null, p_cpd numeric default null
) returns doge_account
language plpgsql as $$
declare result doge_account;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  if p_kind = 'eat' then
    update doge_account
      set candy_eaten = candy_eaten + p_candy, updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized) >= p_candy - 1e-9
      returning * into result;
  else
    raise exception 'unknown doge_spend kind: %', p_kind using errcode = '22023';
  end if;
  if result.student_id is not null then
    insert into doge_ledger (student_id, kind, candy_delta, doge_delta, doge_price_usd, candy_per_doge)
      values (p_sid, p_kind, -p_candy, coalesce(p_doge, 0), p_price, p_cpd);
  end if;
  return result;
end;
$$;

create or replace function doge_gift(
  p_from uuid, p_to uuid, p_candy numeric, p_earned_from numeric,
  p_cap numeric default null
) returns doge_account
language plpgsql as $$
declare result doge_account; gifted_today numeric;
begin
  if p_from = p_to or p_candy <= 0 then return null; end if;
  insert into doge_account (student_id) values (p_from) on conflict (student_id) do nothing;
  insert into doge_account (student_id) values (p_to)   on conflict (student_id) do nothing;
  perform 1 from doge_account where student_id = p_from for update;
  if p_cap is not null then
    select coalesce(sum(abs(candy_delta)), 0) into gifted_today
      from doge_ledger
      where student_id = p_from and kind = 'gift_out' and ts >= now() - interval '24 hours';
    if gifted_today + p_candy > p_cap + 1e-9 then return null; end if;
  end if;
  update doge_account
     set candy_gifted_out = candy_gifted_out + p_candy, updated_at = now()
   where student_id = p_from
     and (p_earned_from - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to,   'gift_in',   p_candy);
  return result;
end;
$$;

-- 4. Atomic guarded cash-out (DOGE → candy). Locks the row, enforces TWO guards on the live row:
--    (a) only un-sent in-app coins are sellable (doge_balance − doge_sent ≥ p_doge); coins already
--        pushed on-chain are self-custodied and can never be reclaimed.
--    (b) FIFO maturity: matured-bought (buys ≥ p_hold_hours old) − sold-back − sent ≥ p_doge, so
--        coins must be held ~overnight before cash-out (anti-churn; dwarfs the 5-min price window).
--    Then decrements doge_balance + doge_cost_basis (avg cost basis) and books the gain/loss to
--    candy_realized. Returns the updated row, or NULL on any guard fail (route → 400).
create or replace function doge_sell(
  p_sid uuid, p_doge numeric, p_rate numeric, p_price numeric,
  p_hold_hours numeric default 24
) returns doge_account
language plpgsql as $$
declare
  acct      doge_account;
  v_inapp   numeric;
  v_matured numeric;
  v_basis   numeric;
  v_return  numeric;
begin
  if p_doge is null or p_doge <= 0 or p_rate is null or p_rate <= 0 then return null; end if;
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  select * into acct from doge_account where student_id = p_sid for update;

  -- (a) in-app, un-sent coins only.
  v_inapp := acct.doge_balance - acct.doge_sent;
  if v_inapp < p_doge - 1e-9 then return null; end if;

  -- (b) FIFO maturity = matured-bought − sold-back − sent (capped at in-app).
  select coalesce(sum(case when kind = 'buy_doge'
                            and ts <= now() - (p_hold_hours::text || ' hours')::interval
                           then doge_delta else 0 end), 0)
       - coalesce(sum(case when kind = 'sell_doge' then abs(doge_delta) else 0 end), 0)
    into v_matured
    from doge_ledger where student_id = p_sid;
  v_matured := least(v_inapp, v_matured - acct.doge_sent);
  if v_matured < p_doge - 1e-9 then return null; end if;

  v_basis  := case when acct.doge_balance > 0 then acct.doge_cost_basis * (p_doge / acct.doge_balance) else 0 end;
  v_return := p_doge * p_rate;

  update doge_account
     set doge_balance    = doge_balance - p_doge,
         doge_cost_basis = greatest(0, doge_cost_basis - v_basis),
         candy_realized  = candy_realized + (v_return - v_basis),
         updated_at = now()
   where student_id = p_sid
  returning * into acct;

  insert into doge_ledger (student_id, kind, candy_delta, doge_delta, doge_price_usd, candy_per_doge)
    values (p_sid, 'sell_doge', v_return, -p_doge, p_price, p_rate);
  return acct;
end;
$$;

-- 0021_doge_gifting: kid → kid candy transfers (DOGE_GIFTING_SPEC). USER-RUN, additive.
--
-- A transfer is a pure in-app ledger move (no on-chain tx, no fee). Spendable candy
-- becomes:  earnedCandy − candy_eaten − doge_cost_basis − candy_gifted_out + candy_gifted_in
--
-- Until this runs, /wallet/gift 503s and the two new columns are absent — the rest
-- of the wallet is unaffected (the OLD doge_spend guard, without gift terms, is
-- still correct because gifted_out/in are 0 for everyone).

alter table doge_account add column if not exists candy_gifted_out numeric not null default 0;  -- candy this kid sent away
alter table doge_account add column if not exists candy_gifted_in  numeric not null default 0;  -- candy this kid received

-- doge_ledger gains the two transfer legs.
alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add  constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in'));

-- ── Patch doge_spend: the spendable-balance guard must now subtract gifted_out and
-- add gifted_in, else a kid could spend candy they already gave away (or be blocked
-- from spending candy they received). Same body as 0019 + the two gift terms. ──────
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
        and (p_earned - candy_eaten - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_eaten - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
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

-- ── Atomic guarded transfer: debit the sender (re-checking spendable on the live
-- row), credit the recipient, log both legs — all in one transaction. Returns the
-- SENDER's updated row, or NULL when the guard fails (insufficient / invalid). ─────
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
  -- Lock the sender's row FIRST so concurrent gifts from this student serialize:
  -- the rolling-24h gift_out sum below then counts all COMMITTED prior gifts, so a
  -- burst can't slip past the daily cap (the JS pre-check is just the fast/friendly
  -- path; this is the hard backstop). p_cap NULL = no cap.
  perform 1 from doge_account where student_id = p_from for update;
  if p_cap is not null then
    select coalesce(sum(abs(candy_delta)), 0) into gifted_today
      from doge_ledger
      where student_id = p_from and kind = 'gift_out' and ts >= now() - interval '24 hours';
    if gifted_today + p_candy > p_cap + 1e-9 then return null; end if;   -- over cap → clean abort (nothing modified yet)
  end if;
  -- Guarded debit of the SENDER (spendable ≥ gift).
  update doge_account
     set candy_gifted_out = candy_gifted_out + p_candy, updated_at = now()
   where student_id = p_from
     and (p_earned_from - candy_eaten - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;          -- insufficient → no credit
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to,   'gift_in',   p_candy);
  return result;  -- sender's updated row, or NULL when the guard failed
end;
$$;

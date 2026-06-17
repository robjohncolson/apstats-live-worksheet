-- 0022_retire_candy_eaten: retire the "eat" opt-in (CANDY_LEDGER_SPEC). USER-RUN, idempotent.
--
-- The 6-number candy ledger:  Earned + Received = Gifted + Converted + Materialized + Owed.
-- The candy a student can still gift/convert (spendable) IS the un-realized "Owed" pool, so
-- the spendable guard now subtracts MATERIALIZED candy (candy_given) instead of candy_eaten:
--   spendable = earnedCandy − candy_given − doge_cost_basis − candy_gifted_out + candy_gifted_in
-- (candy_eaten is no longer consumed; the teacher materializes Owed directly via mark-given.)
--
-- This is CREATE OR REPLACE of two functions only — NO columns are added or dropped.
-- candy_eaten stays as a vestigial audit column; POST /wallet/eat is now a no-op in JS.
-- The 'eat' branch of doge_spend is kept for back-compat but is no longer called.

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
        and (p_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
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

-- Atomic guarded transfer (gift / candy poke): the sender's spendable guard mirrors the
-- doge_spend change — subtract candy_given (Materialized) instead of candy_eaten.
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
     and (p_earned_from - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to,   'gift_in',   p_candy);
  return result;
end;
$$;

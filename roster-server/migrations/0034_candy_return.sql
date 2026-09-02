-- 0034_candy_return: record physical candy handed back to the teacher.
-- USER-RUN on the shared Supabase. Additive and idempotent.
--
-- candy_given remains monotonic. A return is a second monotonic counter,
-- candy_returned, capped at candy_given under the account-row lock. The candy
-- identity gains Returned as an inflow:
--
--   Earned + Received + Realized + Bonus + Returned
--     = Gifted + Converted + Materialized + Escrowed + Owed
--
-- Returned candy is spendable again, so every affordability guard gains the
-- same + candy_returned term. Until this migration runs, only
-- POST /wallet/mark-returned returns 503; the existing wallet remains usable.

begin;

alter table doge_account
  add column if not exists candy_returned numeric not null default 0;

alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in','sell_doge',
                  'bet_hold','bet_win','bet_loss','bet_refund','review_award',
                  'give_back'));

-- Atomic compensating return. Positive retries can advance only until all
-- candy still out has been returned; once capped, no extra ledger row is added.
create or replace function doge_give_back(p_sid uuid, p_amount numeric)
returns doge_account
language plpgsql as $$
declare acct doge_account; v_old numeric; v_new numeric;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  select * into acct from doge_account where student_id = p_sid for update;
  if p_amount is null or p_amount <= 0 then return acct; end if;

  v_old := acct.candy_returned;
  v_new := greatest(v_old, least(v_old + p_amount, acct.candy_given));

  update doge_account
     set candy_returned = v_new,
         updated_at = now()
   where student_id = p_sid
  returning * into acct;

  if v_new - v_old > 1e-9 then
    insert into doge_ledger (student_id, kind, candy_delta)
      values (p_sid, 'give_back', v_new - v_old);
  end if;
  return acct;
end;
$$;

-- Re-base every spendable guard so returned candy can be converted, gifted,
-- staked, or handed out again. These are the 0025 bodies plus one Returned term.
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
        and (p_earned + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
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
  insert into doge_account (student_id) values (p_to) on conflict (student_id) do nothing;
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
     and (p_earned_from + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to, 'gift_in', p_candy);
  return result;
end;
$$;

-- doge_mark stays monotonic. Returned raises only candy_given's absolute cap;
-- the DOGE branch is byte-for-byte the existing behavior.
create or replace function doge_mark(p_sid uuid, p_field text, p_amount numeric, p_earned numeric)
returns doge_account
language plpgsql as $$
declare acct doge_account; v_cap numeric; v_old numeric; v_new numeric;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  select * into acct from doge_account where student_id = p_sid for update;
  if p_amount is null or p_amount <= 0 then return acct; end if;
  if p_field = 'candy_given' then
    v_cap := p_earned + acct.candy_bonus + acct.candy_returned + acct.candy_gifted_in - acct.candy_gifted_out - acct.doge_cost_basis + acct.candy_realized - acct.candy_escrowed;
    v_old := acct.candy_given;
    v_new := greatest(v_old, least(v_old + p_amount, v_cap));
    update doge_account set candy_given = v_new, updated_at = now() where student_id = p_sid returning * into acct;
    if v_new - v_old > 1e-9 then
      insert into doge_ledger (student_id, kind, candy_delta) values (p_sid, 'give', -(v_new - v_old));
    end if;
  elsif p_field = 'doge_sent' then
    v_cap := acct.doge_balance;
    v_old := acct.doge_sent;
    v_new := greatest(v_old, least(v_old + p_amount, v_cap));
    update doge_account set doge_sent = v_new, updated_at = now() where student_id = p_sid returning * into acct;
    if v_new - v_old > 1e-9 then
      insert into doge_ledger (student_id, kind, doge_delta) values (p_sid, 'send', -(v_new - v_old));
    end if;
  else
    raise exception 'unknown doge_mark field: %', p_field using errcode = '22023';
  end if;
  return acct;
end;
$$;

create or replace function tetris_bet_open(
  p_match text, p_caller uuid, p_opp uuid, p_stake numeric, p_earned_caller numeric
) returns text
language plpgsql as $$
declare b tetris_bet; lo uuid; hi uuid; ok_a boolean; ok_b boolean;
begin
  if p_caller = p_opp or p_stake is null or p_stake <= 0 then return 'bad'; end if;
  if p_earned_caller is null then return 'bad'; end if;
  insert into tetris_bet (match_id, player_a, player_b, stake, status)
    values (p_match, p_caller, p_opp, p_stake, 'pending')
    on conflict (match_id) do nothing;
  select * into b from tetris_bet where match_id = p_match for update;
  if b.status <> 'pending' then return b.status; end if;
  if p_caller = b.player_a then
    if p_opp <> b.player_b then return 'not-a-player'; end if;
    update tetris_bet set a_joined = true, a_earned = p_earned_caller where match_id = p_match returning * into b;
  elsif p_caller = b.player_b then
    if p_opp <> b.player_a then return 'not-a-player'; end if;
    update tetris_bet set b_joined = true, b_earned = p_earned_caller where match_id = p_match returning * into b;
  else
    return 'not-a-player';
  end if;
  if not (b.a_joined and b.b_joined) then return 'waiting'; end if;
  insert into doge_account (student_id) values (b.player_a) on conflict (student_id) do nothing;
  insert into doge_account (student_id) values (b.player_b) on conflict (student_id) do nothing;
  lo := least(b.player_a, b.player_b); hi := greatest(b.player_a, b.player_b);
  perform 1 from doge_account where student_id = lo for update;
  perform 1 from doge_account where student_id = hi for update;
  select (b.a_earned + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_stake - 1e-9
    into ok_a from doge_account where student_id = b.player_a;
  select (b.b_earned + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_stake - 1e-9
    into ok_b from doge_account where student_id = b.player_b;
  if not (coalesce(ok_a, false) and coalesce(ok_b, false)) then
    update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;
    return 'insufficient';
  end if;
  update doge_account set candy_escrowed = candy_escrowed + p_stake, updated_at = now() where student_id = b.player_a;
  update doge_account set candy_escrowed = candy_escrowed + p_stake, updated_at = now() where student_id = b.player_b;
  update tetris_bet set status = 'open' where match_id = p_match;
  insert into doge_ledger (student_id, kind, candy_delta) values (b.player_a, 'bet_hold', -p_stake), (b.player_b, 'bet_hold', -p_stake);
  return 'opened';
end;
$$;

commit;

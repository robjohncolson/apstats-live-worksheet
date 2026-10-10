-- 0041_tetris_gold_premium: Study Break candy bets pay a GOLD PREMIUM (TETRIS_SQUARES_SPEC §3,
-- teacher 2026-10-10). USER-RUN on the shared Supabase. Run after 0024 and 0034 (it replaces the
-- tetris_bet_* functions those created). Additive columns; idempotent.
--
-- The stake stays 1 candy. With the premium on, each player's escrow at join is 2: the 1-candy
-- base stake + a 1-candy premium hold. At settle (both reports name the same winner):
--   * the base stake moves to the winner exactly as before;
--   * the premium moves to the winner ONLY when BOTH reports say the winner made at least one gold
--     square clear (a_gold >= 1 and b_gold >= 1); otherwise both premiums are refunded.
-- A winner disagreement, a timeout or an abort refunds everything (base + premium), as before.
-- A missing or disagreeing gold report never pays the premium.
--
-- Wallet maths (the audited identity): the hold is the same candy_escrowed column; a paid premium
-- is a second gifted_in / gifted_out leg exactly like the base stake; a refunded premium only
-- releases escrow. tetris_bet.premium = 0 (kill-switch STAKES_GOLD_PREMIUM off, or a row opened
-- before this ran) behaves byte-for-byte like 0024/0034.
--
-- Signatures: tetris_bet_open gains p_premium (default 0) and tetris_bet_resolve gains
-- p_winner_gold (default null). The old signatures are dropped so a call by name with the old
-- parameter list resolves to the new function (its defaults reproduce the old behaviour).
-- roster-server falls back to the old parameter list if this has not run yet (no premium).

begin;

alter table tetris_bet add column if not exists premium      numeric not null default 0;     -- per-player premium hold (0 or 1)
alter table tetris_bet add column if not exists a_gold       integer;                         -- player_a's report: the winner's gold lines
alter table tetris_bet add column if not exists b_gold       integer;                         -- player_b's report: the winner's gold lines
alter table tetris_bet add column if not exists premium_paid boolean not null default false;  -- the premium moved to the winner

drop function if exists tetris_bet_open(text, uuid, uuid, numeric, numeric);
drop function if exists tetris_bet_resolve(text, uuid, uuid);

-- tetris_bet_open — as 0034, with the escrow = stake + premium (both-or-neither, both must afford it).
create or replace function tetris_bet_open(
  p_match text, p_caller uuid, p_opp uuid, p_stake numeric, p_earned_caller numeric, p_premium numeric default 0
) returns text
language plpgsql as $$
declare b tetris_bet; lo uuid; hi uuid; ok_a boolean; ok_b boolean; v_hold numeric;
begin
  if p_caller = p_opp or p_stake is null or p_stake <= 0 then return 'bad'; end if;
  if p_earned_caller is null then return 'bad'; end if;
  if p_premium is null or p_premium < 0 then return 'bad'; end if;
  insert into tetris_bet (match_id, player_a, player_b, stake, premium, status)
    values (p_match, p_caller, p_opp, p_stake, p_premium, 'pending')
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
  v_hold := b.stake + b.premium;   -- the row's premium (set by the first joiner) decides
  insert into doge_account (student_id) values (b.player_a) on conflict (student_id) do nothing;
  insert into doge_account (student_id) values (b.player_b) on conflict (student_id) do nothing;
  lo := least(b.player_a, b.player_b); hi := greatest(b.player_a, b.player_b);
  perform 1 from doge_account where student_id = lo for update;
  perform 1 from doge_account where student_id = hi for update;
  select (b.a_earned + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= v_hold - 1e-9
    into ok_a from doge_account where student_id = b.player_a;
  select (b.b_earned + candy_bonus + candy_returned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= v_hold - 1e-9
    into ok_b from doge_account where student_id = b.player_b;
  if not (coalesce(ok_a, false) and coalesce(ok_b, false)) then
    update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;
    return 'insufficient';
  end if;
  update doge_account set candy_escrowed = candy_escrowed + v_hold, updated_at = now() where student_id = b.player_a;
  update doge_account set candy_escrowed = candy_escrowed + v_hold, updated_at = now() where student_id = b.player_b;
  update tetris_bet set status = 'open' where match_id = p_match;
  insert into doge_ledger (student_id, kind, candy_delta) values (b.player_a, 'bet_hold', -v_hold), (b.player_b, 'bet_hold', -v_hold);
  return 'opened';
end;
$$;

-- tetris_bet_settle — pay the agreed winner the base pot; the premium only on a two-sided gold
-- report (a_gold >= 1 AND b_gold >= 1), otherwise release both premiums. Idempotent on status.
create or replace function tetris_bet_settle(p_match text, p_winner uuid)
returns text
language plpgsql as $$
declare b tetris_bet; v_loser uuid; v_pay boolean; v_moved numeric;
begin
  select * into b from tetris_bet where match_id = p_match for update;
  if not found then return 'no-bet'; end if;
  if b.status <> 'open' then return b.status; end if;
  if p_winner <> b.player_a and p_winner <> b.player_b then return 'bad-winner'; end if;
  v_loser := case when p_winner = b.player_a then b.player_b else b.player_a end;
  v_pay := b.premium > 0 and coalesce(b.a_gold, 0) >= 1 and coalesce(b.b_gold, 0) >= 1;
  v_moved := b.stake + case when v_pay then b.premium else 0 end;
  update doge_account
     set candy_escrowed = candy_escrowed - (b.stake + b.premium),
         candy_gifted_in = candy_gifted_in + v_moved, updated_at = now()
   where student_id = p_winner;
  update doge_account
     set candy_escrowed = candy_escrowed - (b.stake + b.premium),
         candy_gifted_out = candy_gifted_out + v_moved, updated_at = now()
   where student_id = v_loser;
  update tetris_bet set status = 'settled', winner = p_winner, premium_paid = v_pay, resolved_at = now() where match_id = p_match;
  insert into doge_ledger (student_id, kind, candy_delta)
    values (p_winner, 'bet_win', 2 * v_moved + case when v_pay then 0 else b.premium end), (v_loser, 'bet_loss', 0);
  if b.premium > 0 and not v_pay then
    -- The loser's released premium (the winner's own release is folded into bet_win above).
    insert into doge_ledger (student_id, kind, candy_delta)
      select v_loser, 'bet_refund', b.premium where exists (select 1 from roster where student_id = v_loser);
  end if;
  return case when v_pay then 'settled-premium' else 'settled' end;
end;
$$;

-- tetris_bet_refund — release both full holds (stake + premium). Idempotent.
create or replace function tetris_bet_refund(p_match text)
returns text
language plpgsql as $$
declare b tetris_bet;
begin
  select * into b from tetris_bet where match_id = p_match for update;
  if not found then return 'no-bet'; end if;
  if b.status = 'pending' then
    update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;
    return 'refunded';
  end if;
  if b.status <> 'open' then return b.status; end if;
  update doge_account set candy_escrowed = candy_escrowed - (b.stake + b.premium), updated_at = now() where student_id = b.player_a;
  update doge_account set candy_escrowed = candy_escrowed - (b.stake + b.premium), updated_at = now() where student_id = b.player_b;
  update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;
  insert into doge_ledger (student_id, kind, candy_delta)
    select pid, 'bet_refund', b.stake + b.premium from (values (b.player_a), (b.player_b)) v(pid)
    where exists (select 1 from roster where student_id = v.pid);
  return 'refunded';
end;
$$;

-- tetris_bet_resolve — record a player's winner report and their count of THAT winner's gold
-- lines; when both are in, settle (same winner) or refund (different winners). A settled row
-- answers 'settled-premium' when its premium was paid (so a late re-report learns the outcome).
create or replace function tetris_bet_resolve(p_match text, p_reporter uuid, p_winner uuid, p_winner_gold integer default null)
returns text
language plpgsql as $$
declare b tetris_bet; v_gold integer;
begin
  select * into b from tetris_bet where match_id = p_match for update;
  if not found then return 'no-bet'; end if;
  if b.status <> 'open' then
    return case when b.status = 'settled' and b.premium_paid then 'settled-premium' else b.status end;
  end if;
  if p_reporter <> b.player_a and p_reporter <> b.player_b then return 'not-a-player'; end if;
  if p_winner is null or (p_winner <> b.player_a and p_winner <> b.player_b) then return 'bad-winner'; end if;
  v_gold := case when p_winner_gold is null or p_winner_gold < 0 then null else p_winner_gold end;
  if p_reporter = b.player_a then
    update tetris_bet set a_report = p_winner, a_gold = v_gold where match_id = p_match returning * into b;
  else
    update tetris_bet set b_report = p_winner, b_gold = v_gold where match_id = p_match returning * into b;
  end if;
  if b.a_report is not null and b.b_report is not null then
    if b.a_report = b.b_report then return tetris_bet_settle(p_match, b.a_report);
    else return tetris_bet_refund(p_match); end if;
  end if;
  return 'pending';
end;
$$;

commit;

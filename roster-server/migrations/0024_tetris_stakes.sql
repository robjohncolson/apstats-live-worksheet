-- 0024_tetris_stakes: bet candy on a Study Break (Tetris) match (STUDY_BREAK_STAKES_SPEC).
-- USER-RUN, additive, idempotent (CREATE OR REPLACE + IF NOT EXISTS).
--
-- A 1v1 match stakes 1 candy per player into ESCROW; the winner takes the 2-candy pot.
-- A bet is a conditional gift held in escrow, so it reuses the existing Gifted/Received
-- terms — the only NEW conservation term is ESCROWED (candy held mid-match, not spendable,
-- not destroyed). The 7-number identity becomes 8:
--   Earned + Received + Realized = Gifted + Converted + Materialized + Escrowed + Owed
--   spendable(Owed) = E + R + Z − G − C − M − Escrowed
--
-- Money flow (stake s):
--   open   : both players  candy_escrowed += s            (Owed −s each; held, not lost)
--   settle : winner  candy_escrowed −= s, candy_gifted_in  += s   (own stake back + loser's)
--            loser   candy_escrowed −= s, candy_gifted_out += s   (stake consumed → the winner)
--            => winner nets +s, loser nets −s; zero-sum across the class.
--   refund : both players  candy_escrowed −= s            (stakes return to Owed; nothing moved)
--
-- Anti-cheat: the match is P2P (the server has NO game truth), so resolution is
-- both-players-report-the-winner; AGREE → settle, DISAGREE or a timeout → refund. A lone
-- "I won" never pays. tetris_bet_resolve folds the report + settle/refund atomically under
-- the bet row lock, so two simultaneous reports can't double-pay.
--
-- Until this runs, POST /wallet/bet/* 503s (functions absent) and candy_escrowed reads 0
-- everywhere (deriveBalances coalesces) — the rest of the wallet is byte-identical.

-- 1. New escrow accumulator (candy held mid-match; always ≥ 0).
alter table doge_account add column if not exists candy_escrowed numeric not null default 0;

-- 2. Per-match bet bookkeeping (the candy_escrowed column is the conservation hook; this
--    table tracks which match an escrow belongs to + the both-report resolution + a timeout
--    sweep target). status ∈ open | settled | refunded.
create table if not exists tetris_bet (
  match_id     text primary key,
  player_a     uuid not null,   -- the caller who created the row (first to POST bet/open)
  player_b     uuid not null,   -- the opponent
  stake        numeric not null,
  status       text not null default 'pending',  -- pending (≤1 joined) → open (both joined, escrowed) → settled | refunded
  a_joined     boolean not null default false,    -- player_a confirmed (POSTed bet/open)
  b_joined     boolean not null default false,    -- player_b confirmed
  a_earned     numeric,         -- player_a's effort candy, captured from THEIR OWN authenticated join
  b_earned     numeric,         -- player_b's, captured from theirs (never trust the other client's claim)
  a_report     uuid,            -- player_a's reported winner
  b_report     uuid,            -- player_b's reported winner
  winner       uuid,            -- set when settled
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists tetris_bet_open_idx on tetris_bet (status, created_at);

-- 3. doge_ledger gains the bet legs (audit trail; conservation is on the COLUMNS).
alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add  constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in','sell_doge',
                  'bet_hold','bet_win','bet_loss','bet_refund'));

-- 4. Re-base the spendable guard in doge_spend/doge_gift/doge_sell to subtract candy_escrowed
--    (escrowed candy is not spendable). Same bodies as 0023 + the one `− candy_escrowed` term;
--    escrowed = 0 pre-bet, so default behavior is byte-identical. CREATE OR REPLACE.
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
        and (p_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
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
     and (p_earned_from - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to,   'gift_in',   p_candy);
  return result;
end;
$$;

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

  v_inapp := acct.doge_balance - acct.doge_sent;
  if v_inapp < p_doge - 1e-9 then return null; end if;

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

-- 5. tetris_bet_open — a per-player JOIN handshake (consent): each player POSTs bet/open with
--    THEMSELVES as p_caller. The row is created on first contact (status 'pending'); the escrow
--    (debit BOTH, atomic both-or-neither) fires only once BOTH have joined — so one client can
--    never escrow an opponent who didn't consent. A non-participant caller is rejected.
--    Returns 'waiting' (one joined) | 'opened' (both joined, escrowed) | 'insufficient' | 'bad'
--    | 'not-a-player' | an already-resolved status.
-- Each player passes ONLY their OWN effort candy (p_earned_caller), captured from their own
-- authenticated request; the function stores it (a_earned/b_earned). The escrow guards then use
-- each player's OWN stored earned — so one client can NEVER forge the other player's balance to
-- force-debit them. (doge_gift trusts the caller's own earned the same way.)
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
  if b.status <> 'pending' then return b.status; end if;   -- already opened/settled/refunded
  -- mark THIS caller joined + capture THEIR OWN earned (must be one of the two players AND must
  -- name the SAME opponent the row records — so a third party can't pre-create a row to occupy
  -- player_a of someone else's match and force the victim into an escrow against the wrong person).
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
  -- both consented → escrow both, atomic both-or-neither, each guarded by their OWN stored earned.
  insert into doge_account (student_id) values (b.player_a) on conflict (student_id) do nothing;
  insert into doge_account (student_id) values (b.player_b) on conflict (student_id) do nothing;
  lo := least(b.player_a, b.player_b); hi := greatest(b.player_a, b.player_b);
  perform 1 from doge_account where student_id = lo for update;
  perform 1 from doge_account where student_id = hi for update;
  select (b.a_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_stake - 1e-9
    into ok_a from doge_account where student_id = b.player_a;
  select (b.b_earned - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_stake - 1e-9
    into ok_b from doge_account where student_id = b.player_b;
  if not (coalesce(ok_a, false) and coalesce(ok_b, false)) then
    update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;  -- void; no escrow happened
    return 'insufficient';
  end if;
  update doge_account set candy_escrowed = candy_escrowed + p_stake, updated_at = now() where student_id = b.player_a;
  update doge_account set candy_escrowed = candy_escrowed + p_stake, updated_at = now() where student_id = b.player_b;
  update tetris_bet set status = 'open' where match_id = p_match;
  insert into doge_ledger (student_id, kind, candy_delta) values (b.player_a, 'bet_hold', -p_stake), (b.player_b, 'bet_hold', -p_stake);
  return 'opened';
end;
$$;

-- tetris_bet_settle — pay the agreed winner the pot. Idempotent on status (a re-call after
-- settle/refund is a no-op). Internal: called by tetris_bet_resolve when both reports agree.
create or replace function tetris_bet_settle(p_match text, p_winner uuid)
returns text
language plpgsql as $$
declare b tetris_bet; v_loser uuid;
begin
  select * into b from tetris_bet where match_id = p_match for update;
  if not found then return 'no-bet'; end if;
  if b.status <> 'open' then return b.status; end if;
  if p_winner <> b.player_a and p_winner <> b.player_b then return 'bad-winner'; end if;
  v_loser := case when p_winner = b.player_a then b.player_b else b.player_a end;
  update doge_account
     set candy_escrowed = candy_escrowed - b.stake,
         candy_gifted_in = candy_gifted_in + b.stake, updated_at = now()
   where student_id = p_winner;
  update doge_account
     set candy_escrowed = candy_escrowed - b.stake,
         candy_gifted_out = candy_gifted_out + b.stake, updated_at = now()
   where student_id = v_loser;
  update tetris_bet set status = 'settled', winner = p_winner, resolved_at = now() where match_id = p_match;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_winner, 'bet_win', 2 * b.stake), (v_loser, 'bet_loss', 0);
  return 'settled';
end;
$$;

-- tetris_bet_refund — return both stakes to Owed (disagreement / timeout / abort). Idempotent.
create or replace function tetris_bet_refund(p_match text)
returns text
language plpgsql as $$
declare b tetris_bet;
begin
  select * into b from tetris_bet where match_id = p_match for update;
  if not found then return 'no-bet'; end if;
  -- A 'pending' bet never escrowed (only one player joined) → just void it, no candy to return.
  if b.status = 'pending' then
    update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;
    return 'refunded';
  end if;
  if b.status <> 'open' then return b.status; end if;
  -- Clear each player's escrow (a row CASCADE-deleted with the student no-ops harmlessly).
  update doge_account set candy_escrowed = candy_escrowed - b.stake, updated_at = now() where student_id = b.player_a;
  update doge_account set candy_escrowed = candy_escrowed - b.stake, updated_at = now() where student_id = b.player_b;
  update tetris_bet set status = 'refunded', resolved_at = now() where match_id = p_match;
  -- Log a refund leg ONLY for players whose roster row still exists: if a teacher deleted a
  -- student mid-bet, doge_ledger.student_id's FK would otherwise reject the whole refund and
  -- leave the SURVIVING player's escrow frozen forever. This lets the survivor recover.
  insert into doge_ledger (student_id, kind, candy_delta)
    select pid, 'bet_refund', b.stake from (values (b.player_a), (b.player_b)) v(pid)
    where exists (select 1 from roster where student_id = v.pid);
  return 'refunded';
end;
$$;

-- tetris_bet_resolve — record a player's winner-report; when BOTH are in, settle (agree) or
-- refund (disagree) atomically under the row lock. Returns 'pending' | 'settled' | 'refunded'
-- | 'no-bet' | 'not-a-player' | 'bad-winner' | already-resolved status.
create or replace function tetris_bet_resolve(p_match text, p_reporter uuid, p_winner uuid)
returns text
language plpgsql as $$
declare b tetris_bet;
begin
  select * into b from tetris_bet where match_id = p_match for update;
  if not found then return 'no-bet'; end if;
  if b.status <> 'open' then return b.status; end if;
  if p_reporter <> b.player_a and p_reporter <> b.player_b then return 'not-a-player'; end if;
  if p_winner is null or (p_winner <> b.player_a and p_winner <> b.player_b) then return 'bad-winner'; end if;
  if p_reporter = b.player_a then
    update tetris_bet set a_report = p_winner where match_id = p_match returning * into b;
  else
    update tetris_bet set b_report = p_winner where match_id = p_match returning * into b;
  end if;
  if b.a_report is not null and b.b_report is not null then
    if b.a_report = b.b_report then return tetris_bet_settle(p_match, b.a_report);
    else return tetris_bet_refund(p_match); end if;
  end if;
  return 'pending';
end;
$$;

-- 6. doge_mark — ATOMIC teacher disbursement clamp (mark-given / mark-sent). Replaces the JS
--    read-modify-write in markEndpoint: the cap is recomputed from the LIVE row under a row lock,
--    so a student escrow/buy that commits between the old code's read and write can no longer be
--    missed. Closes the mark-given × escrow MINT race (a teacher materializing while a kid has a
--    live bet could over-materialize → negative Owed → minted candy on a loss-settle) AND the prior
--    accepted F1 mark residual. Clamps MONOTONICALLY (never claws back) and logs the give/send leg.
create or replace function doge_mark(p_sid uuid, p_field text, p_amount numeric, p_earned numeric)
returns doge_account
language plpgsql as $$
declare acct doge_account; v_cap numeric; v_old numeric; v_new numeric;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  select * into acct from doge_account where student_id = p_sid for update;
  if p_amount is null or p_amount <= 0 then return acct; end if;
  if p_field = 'candy_given' then
    -- Owed-eligible cap, with candy_escrowed read FRESH under the lock so a live bet's stake can't be materialized.
    v_cap := p_earned + acct.candy_gifted_in - acct.candy_gifted_out - acct.doge_cost_basis + acct.candy_realized - acct.candy_escrowed;
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

-- 0025_review_marks: Nightly Review (NIGHTLY_REVIEW_SPEC.md). USER-RUN, additive, idempotent.
--
-- A teacher reviews a student's recent work → marks it SEEN, leaves a COMMENT, and the
-- review drops 1 BONUS candy (once per student per review-day). Reviews are signed
-- (t:'review') so they ride the same durability rails as grades (snapshot/verify/restore).
--
-- Three additive pieces, nothing existing is dropped:
--   1. review_marks        — one row per reviewed item_ledger row (keyed on ledger_id).
--   2. review_candy_grants — the once-per-student-per-NY-date idempotency gate for the award.
--   3. doge_account.candy_bonus — a NEW additive inflow (a MINT: review reward is new candy,
--      not a transfer). The 8-number candy identity gains a Bonus term:
--        Earned + Received + Realized + Bonus = Gifted + Converted + Materialized + Escrowed + Owed
--        spendable(Owed) = E + R + Z + Bonus − G − C − M − Escrowed
--      candy_bonus = 0 for everyone pre-feature, so the guard re-creations below are
--      byte-identical to 0024 until a review actually mints — the established pattern
--      (candy_realized in 0023, candy_escrowed in 0024).
--
-- Until this runs, POST /class/review + GET /class/review-queue 503 (tables/fn absent),
-- candy_bonus reads 0 everywhere (deriveBalances coalesces), and the wallet is byte-identical.

-- 1. New additive inflow accumulator (review-reward candy; always ≥ 0, monotonic-up).
alter table doge_account add column if not exists candy_bonus numeric not null default 0;

-- 2. doge_ledger gains the mint leg.
alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add  constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in','sell_doge',
                  'bet_hold','bet_win','bet_loss','bet_refund','review_award'));

-- 3. One review per reviewed work item (keyed on the stable ledger_id PK, so it survives
--    re-attempts). Re-marking the same item UPSERTS (no dup rows, no second receipt).
create table if not exists review_marks (
  review_id        uuid primary key default gen_random_uuid(),
  ledger_id        uuid not null references item_ledger(ledger_id) on delete cascade,
  student_id       uuid not null,
  teacher_username text not null,
  seen_at          timestamptz not null default now(),
  comment          text,                            -- nullable; route caps <= 500 chars
  candy_awarded    numeric not null default 0,
  receipt_id       text,                            -- signed t:'review' receipt (best-effort persist)
  receipt_compact  text,
  updated_at       timestamptz not null default now(),
  unique (ledger_id)
);
create index if not exists review_marks_student_idx on review_marks (student_id);
create index if not exists review_marks_seen_idx     on review_marks (seen_at);

-- 4. The once-per-student-per-NY-date gate for the candy award. The (student_id, ny_date)
--    PK is the idempotency hook: the first review of a student on a given day inserts a row
--    and mints; every later review that day hits the conflict and mints nothing.
create table if not exists review_candy_grants (
  student_id uuid not null references roster(student_id) on delete cascade,
  ny_date    text not null,                          -- 'YYYY-MM-DD' in America/New_York (todayInTz)
  granted_at timestamptz not null default now(),
  primary key (student_id, ny_date)
);

-- Defense-in-depth RLS (matches doge_account/doge_ledger 0019): service-role bypasses.
alter table review_marks         enable row level security;
alter table review_candy_grants  enable row level security;

-- 5. Atomic, idempotent review-candy mint. Inserts the day's grant gate first; if a row
--    already exists for (student, NY-date) the insert no-ops (row_count 0) and we return 0
--    WITHOUT minting. Otherwise mint exactly 1 candy_bonus + log the audit leg. Race-safe:
--    two concurrent first-reviews of one student serialize on the PK, only one inserts.
create or replace function review_award(p_sid uuid, p_date text)
returns numeric
language plpgsql as $$
declare did int;
begin
  insert into review_candy_grants (student_id, ny_date) values (p_sid, p_date)
    on conflict (student_id, ny_date) do nothing;
  get diagnostics did = row_count;
  if did = 0 then return 0; end if;                       -- already awarded today → no second candy
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  update doge_account set candy_bonus = candy_bonus + 1, updated_at = now() where student_id = p_sid;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_sid, 'review_award', 1);
  return 1;
end;
$$;

-- 6. Re-base the spendable / cap guards to ADD candy_bonus (a new inflow), so a student can
--    spend/gift/convert/bet the candy a review minted, and the teacher can materialize it.
--    Same bodies as 0024 + the one `+ candy_bonus` term; bonus = 0 pre-review → byte-identical.

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
        and (p_earned + candy_bonus - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
      returning * into result;
  elsif p_kind = 'buy_doge' then
    update doge_account
      set doge_balance = doge_balance + p_doge,
          doge_cost_basis = doge_cost_basis + p_candy,
          updated_at = now()
      where student_id = p_sid
        and (p_earned + candy_bonus - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
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
     and (p_earned_from + candy_bonus - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to,   'gift_in',   p_candy);
  return result;
end;
$$;

create or replace function doge_mark(p_sid uuid, p_field text, p_amount numeric, p_earned numeric)
returns doge_account
language plpgsql as $$
declare acct doge_account; v_cap numeric; v_old numeric; v_new numeric;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  select * into acct from doge_account where student_id = p_sid for update;
  if p_amount is null or p_amount <= 0 then return acct; end if;
  if p_field = 'candy_given' then
    -- Owed-eligible cap, with candy_bonus added (a review-minted candy is materializable like any other Owed).
    v_cap := p_earned + acct.candy_bonus + acct.candy_gifted_in - acct.candy_gifted_out - acct.doge_cost_basis + acct.candy_realized - acct.candy_escrowed;
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
  select (b.a_earned + candy_bonus - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_stake - 1e-9
    into ok_a from doge_account where student_id = b.player_a;
  select (b.b_earned + candy_bonus - candy_given - doge_cost_basis - candy_gifted_out + candy_gifted_in + candy_realized - candy_escrowed) >= p_stake - 1e-9
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

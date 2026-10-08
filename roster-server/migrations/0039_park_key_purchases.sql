-- 0039_park_key_purchases: buy Pico Park campaign keys with candy (PICO_DESK_SPEC "Candy economy",
-- items 7-11). USER-RUN on the shared Supabase. Additive and idempotent. Run after 0034 (and 0035).
--
-- Candy is roster-server's; keys are the relay's (park_campaign_wallet). POST /wallet/buy-key:
--   1. park_key_buy        under the buyer's doge_account row lock: price = the n-th term of
--                          5, 8, 13, 21, 34, ... for the n-th live purchase on this school day,
--                          guard spendable >= price, debit, insert the purchase row (its receipt_id).
--   2. relay grant         POST /park/campaign/keys/grant {receiptId} (idempotent on receipt_id).
--   3. park_key_granted    stamps granted_at, or
--      park_key_refund     voids the row and restores the candy when the grant failed.
--
-- Wallet maths: the debit reuses candy_gifted_out (the "Gifted" outflow), the same column doge_gift
-- debits. Every affordability guard (doge_spend, doge_gift, doge_mark, tetris_bet_open) and both JS
-- views (deriveBalances, /class/wallets) already subtract candy_gifted_out, so the candy identity
--   Earned + Received + Realized + Bonus + Returned = Gifted + Converted + Materialized + Escrowed + Owed
-- holds with no guard rewritten. A key purchase is candy given away to the park. The ledger leg uses
-- its own kinds (key_buy / key_refund), so the rolling gift cap (kind = 'gift_out') is unaffected and
-- the wallet history can label it "Key (-price)". park_key_purchases is the itemised record.
--
-- Until this runs, POST /wallet/buy-key answers 503 and GET /wallet omits keyPrice; the rest of the
-- wallet is unaffected.

begin;

create table if not exists park_key_purchases (
  receipt_id   uuid        primary key default gen_random_uuid(),
  student_id   uuid        not null references roster(student_id) on delete cascade,
  purchased_at timestamptz not null default now(),
  school_day   date        not null,   -- America/New_York calendar day (roster-server todayInTz)
  seq          integer     not null check (seq >= 1),   -- n-th live purchase that day
  price        numeric     not null check (price > 0),  -- candy debited
  granted_at   timestamptz,            -- the relay confirmed the key
  voided_at    timestamptz             -- the grant failed: candy refunded
);
create index if not exists park_key_purchases_day_idx on park_key_purchases (student_id, school_day);

alter table park_key_purchases enable row level security;

alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in','sell_doge',
    'bet_hold','bet_win','bet_loss','bet_refund','review_award','give_back','key_reveal',
    'key_buy','key_refund'));

-- The n-th (1-based) key of a day costs F(n+4): 5, 8, 13, 21, 34, 55, ...
create or replace function park_key_price(p_n integer)
returns numeric
language plpgsql immutable as $$
declare a numeric := 5; b numeric := 8; t numeric; i integer := 1;
begin
  while i < greatest(p_n, 1) loop
    t := a + b; a := b; b := t; i := i + 1;
  end loop;
  return a;
end;
$$;

-- Atomic buy. Returns jsonb:
--   { status: 'bought', receipt_id, price, seq, account }   (account = the buyer's updated row)
--   { status: 'insufficient', price, seq }                   (nothing written)
create or replace function park_key_buy(p_sid uuid, p_earned numeric, p_day date)
returns jsonb
language plpgsql as $$
declare acct doge_account; v_seq integer; v_price numeric; v_spendable numeric; v_receipt uuid;
begin
  insert into doge_account (student_id) values (p_sid) on conflict (student_id) do nothing;
  -- The same row lock as doge_gift: concurrent buys (and gifts / spends) by this student serialize,
  -- so two buys can never both be charged the same day's price.
  select * into acct from doge_account where student_id = p_sid for update;

  select count(*) + 1 into v_seq from park_key_purchases
   where student_id = p_sid and school_day = p_day and voided_at is null;
  v_price := park_key_price(v_seq);

  v_spendable := p_earned + acct.candy_bonus + acct.candy_returned - acct.candy_given - acct.doge_cost_basis
    - acct.candy_gifted_out + acct.candy_gifted_in + acct.candy_realized - acct.candy_escrowed;
  if v_spendable < v_price - 1e-9 then
    return jsonb_build_object('status', 'insufficient', 'price', v_price, 'seq', v_seq);
  end if;

  update doge_account
     set candy_gifted_out = candy_gifted_out + v_price, updated_at = now()
   where student_id = p_sid
  returning * into acct;
  insert into park_key_purchases (student_id, school_day, seq, price)
    values (p_sid, p_day, v_seq, v_price)
  returning receipt_id into v_receipt;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_sid, 'key_buy', -v_price);

  return jsonb_build_object('status', 'bought', 'receipt_id', v_receipt, 'price', v_price,
    'seq', v_seq, 'account', to_jsonb(acct));
end;
$$;

-- The relay confirmed the key. A voided row stays voided. Returns the purchase row.
create or replace function park_key_granted(p_receipt uuid)
returns park_key_purchases
language plpgsql as $$
declare p park_key_purchases;
begin
  update park_key_purchases
     set granted_at = coalesce(granted_at, now())
   where receipt_id = p_receipt and voided_at is null
  returning * into p;
  if p.receipt_id is null then
    select * into p from park_key_purchases where receipt_id = p_receipt;
  end if;
  return p;
end;
$$;

-- The grant failed: void the purchase and give the candy back. A no-op (returns the row unchanged)
-- when the purchase is unknown, already voided, or already granted, so a retry never refunds twice
-- and a granted key is never refunded. Returns the buyer's account row (student_id NULL = no-op on
-- an unknown receipt).
create or replace function park_key_refund(p_receipt uuid)
returns doge_account
language plpgsql as $$
declare p park_key_purchases; acct doge_account;
begin
  select * into p from park_key_purchases where receipt_id = p_receipt;
  if p.receipt_id is null then return acct; end if;
  select * into acct from doge_account where student_id = p.student_id for update;
  -- Re-read under the account lock (a concurrent refund / grant of the same receipt).
  select * into p from park_key_purchases where receipt_id = p_receipt for update;
  if p.voided_at is not null or p.granted_at is not null then return acct; end if;

  update park_key_purchases set voided_at = now() where receipt_id = p_receipt;
  update doge_account
     set candy_gifted_out = greatest(0, candy_gifted_out - p.price), updated_at = now()
   where student_id = p.student_id
  returning * into acct;
  insert into doge_ledger (student_id, kind, candy_delta) values (p.student_id, 'key_refund', p.price);
  return acct;
end;
$$;

commit;

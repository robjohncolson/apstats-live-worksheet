-- 0032_payout_batch.sql -- frozen DOGE payout batches and atomic completion.
--
-- USER-RUN on the shared Supabase. This migration is additive and idempotent;
-- application code never runs it. Until the final payout_probe function exists,
-- every /payout/* endpoint returns 503 with an operator-facing message.
--
-- Railway stores only public addresses, amounts, state, txids, and optional
-- public receipts. Spending keys, claim tokens, and signed transaction hex never
-- belong here. Only the SHA-256 claim-token digest is persisted.

-- PostgreSQL DDL is transactional. Keep the entire first install and every
-- idempotent rerun invisible until the readiness probe and all permissions are
-- ready together.
begin;

-- Remove the readiness sentinel first. If a statement-by-statement migration is
-- interrupted, the application remains fail-closed until the final statement.
drop function if exists payout_probe();

create table if not exists payout_batch (
  batch_id         uuid primary key default gen_random_uuid(),
  status           text not null default 'pending'
                   check (status in ('pending', 'claimed', 'sent', 'failed', 'cancelled')),
  plan             jsonb not null,
  plan_hash        text not null,
  txid             text,
  error            text,
  created_at       timestamptz not null default now(),
  claimed_at       timestamptz,
  resolved_at      timestamptz,
  claim_token_hash text,
  broadcast_at     timestamptz
);

alter table payout_batch
  add column if not exists claim_token_hash text,
  add column if not exists broadcast_at timestamptz;

create unique index if not exists payout_batch_one_active
  on payout_batch ((true)) where status in ('pending', 'claimed');

alter table payout_batch enable row level security;

-- RLS is the primary Data API fence; explicit grants make that intent survive
-- project-level default-privilege changes too.
revoke all on table payout_batch from public;
do $table_permissions$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on table payout_batch from %I', v_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table payout_batch to service_role';
  end if;
end;
$table_permissions$;

-- Phase 5 attaches an issuer receipt to the exact send ledger row created by
-- payout_complete. A receipt is always absent or present as a complete pair.
alter table doge_ledger
  add column if not exists receipt_id text,
  add column if not exists receipt_compact text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'doge_ledger_receipt_pair_check'
       and conrelid = 'doge_ledger'::regclass
  ) then
    alter table doge_ledger
      add constraint doge_ledger_receipt_pair_check
      check (
        (receipt_id is null and receipt_compact is null)
        or (receipt_id is not null and receipt_compact is not null)
      );
  end if;
end;
$$;

-- Parse and exact-validate the frozen plan once for every database operation
-- that trusts it. Returned UUIDs also provide a stable wallet lock order.
create or replace function payout_plan_rows(p_plan jsonb)
returns table (
  row_student_id uuid,
  row_student_key text,
  row_address text,
  row_doge numeric
)
language plpgsql
as $$
declare
  v_item jsonb;
  v_key_count integer;
  v_minimum numeric;
  v_plan_total numeric;
  v_total numeric := 0;
  v_seen text[] := array[]::text[];
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'payout plan is malformed';
  end if;

  select count(*) into v_key_count from jsonb_object_keys(p_plan);
  if v_key_count <> 3
     or not (p_plan ? 'minPerStudent')
     or not (p_plan ? 'rows')
     or not (p_plan ? 'total')
     or jsonb_typeof(p_plan->'minPerStudent') is distinct from 'number'
     or jsonb_typeof(p_plan->'rows') is distinct from 'array'
     or jsonb_typeof(p_plan->'total') is distinct from 'number' then
    raise exception using errcode = 'P0001', message = 'payout plan is malformed';
  end if;

  v_minimum := (p_plan->>'minPerStudent')::numeric;
  v_plan_total := (p_plan->>'total')::numeric;
  if v_minimum <= 0 or v_minimum <> trunc(v_minimum, 8)
     or v_plan_total <= 0 or v_plan_total <> trunc(v_plan_total, 8) then
    raise exception using errcode = 'P0001', message = 'payout plan amount is invalid';
  end if;

  for v_item in
    select value
      from jsonb_array_elements(p_plan->'rows') with ordinality as item(value, position)
     order by position
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = 'payout plan row is malformed';
    end if;
    select count(*) into v_key_count from jsonb_object_keys(v_item);
    if v_key_count <> 3
       or not (v_item ? 'studentId')
       or not (v_item ? 'address')
       or not (v_item ? 'doge')
       or jsonb_typeof(v_item->'studentId') is distinct from 'string'
       or jsonb_typeof(v_item->'address') is distinct from 'string'
       or jsonb_typeof(v_item->'doge') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'payout plan row is malformed';
    end if;

    row_student_key := v_item->>'studentId';
    row_address := v_item->>'address';
    row_doge := (v_item->>'doge')::numeric;
    if row_student_key = '' or btrim(row_student_key) <> row_student_key
       or row_address = '' or btrim(row_address) <> row_address
       or row_doge < v_minimum or row_doge <> trunc(row_doge, 8) then
      raise exception using errcode = 'P0001', message = 'payout plan row is invalid';
    end if;

    begin
      row_student_id := row_student_key::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'payout plan student is invalid';
    end;
    if row_student_id::text <> row_student_key then
      raise exception using errcode = 'P0001', message = 'payout plan student is not canonical';
    end if;
    if row_student_key = any(v_seen) then
      raise exception using errcode = 'P0001', message = 'payout plan has duplicate students';
    end if;

    v_seen := array_append(v_seen, row_student_key);
    v_total := v_total + row_doge;
    return next;
  end loop;

  if cardinality(v_seen) = 0 or v_total <> v_plan_total then
    raise exception using errcode = 'P0001', message = 'payout plan total does not match rows';
  end if;
end;
$$;

-- Seal and reserve in one transaction. Locks referenced wallet rows in UUID
-- order to close the preview/create race with sells, marks, and address changes.
create or replace function payout_create(p_plan jsonb, p_plan_hash text)
returns payout_batch
language plpgsql
as $$
declare
  v_row record;
  v_balance numeric;
  v_sent numeric;
  v_address text;
  v_batch payout_batch;
begin
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'payout plan hash is invalid';
  end if;

  for v_row in
    select * from payout_plan_rows(p_plan) order by row_student_id
  loop
    select doge_balance, doge_sent, doge_address
      into v_balance, v_sent, v_address
      from doge_account
     where student_id = v_row.row_student_id
     for update;
    if not found
       or v_address is distinct from v_row.row_address
       or v_balance - v_sent < v_row.row_doge then
      raise exception using errcode = '23514', message = 'payout reservation is stale';
    end if;
  end loop;

  insert into payout_batch (status, plan, plan_hash)
  values ('pending', p_plan, p_plan_hash)
  returning * into v_batch;
  return v_batch;
end;
$$;

-- Prevent existing wallet mutations from consuming a reserved amount. Buys and
-- changes confined to later excess remain legal. payout_complete moves the batch
-- to sent before doge_mark, so its exact reserved updates are allowed.
create or replace function payout_guard_reserved_doge()
returns trigger
language plpgsql
as $$
declare
  v_reserved numeric;
  v_student_id uuid;
begin
  v_student_id := old.student_id;
  select coalesce(sum((item.value->>'doge')::numeric), 0)
    into v_reserved
    from payout_batch as batch
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(batch.plan->'rows') = 'array' then batch.plan->'rows'
        else '[]'::jsonb
      end
    ) as item(value)
   where batch.status in ('pending', 'claimed')
     and item.value->>'studentId' = v_student_id::text;

  -- Roster deletion cascades into doge_account. Fence that delete so an active
  -- frozen plan cannot lose its wallet row between seal and completion.
  if tg_op = 'DELETE' then
    if v_reserved > 0 then
      raise exception using errcode = '23514', message = 'payout reserved amount would be consumed';
    end if;
    return old;
  end if;

  -- student_id is normally immutable, but a direct identity move must not
  -- detach a JSON reservation from the row it protects.
  if new.student_id is distinct from old.student_id and v_reserved > 0 then
    raise exception using errcode = '23514', message = 'payout reserved amount would be consumed';
  end if;

  if new.student_id is distinct from old.student_id then
    select coalesce(sum((item.value->>'doge')::numeric), 0)
      into v_reserved
      from payout_batch as batch
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(batch.plan->'rows') = 'array' then batch.plan->'rows'
          else '[]'::jsonb
        end
      ) as item(value)
     where batch.status in ('pending', 'claimed')
       and item.value->>'studentId' = new.student_id::text;
  end if;

  if new.doge_balance - new.doge_sent < v_reserved then
    raise exception using errcode = '23514', message = 'payout reserved amount would be consumed';
  end if;
  return new;
end;
$$;

-- Never drop the live guard during an idempotent rerun. CREATE OR REPLACE above
-- updates the function in place; this block only installs the trigger when the
-- first migration run has not created it yet.
do $reservation_trigger$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'doge_account'::regclass
       and tgname = 'payout_reservation_guard'
       and not tgisinternal
  ) then
    create trigger payout_reservation_guard
    before update of student_id, doge_balance, doge_sent or delete on doge_account
    for each row execute function payout_guard_reserved_doge();
  end if;
end;
$reservation_trigger$;

-- Arm is the durable pre-broadcast fence. The replay bit is decided while the
-- row is locked: exactly one same-token caller can receive replayed=false.
create or replace function payout_arm(p_batch_id uuid, p_claim_token_hash text)
returns jsonb
language plpgsql
as $$
declare
  v_batch payout_batch;
  v_replayed boolean;
begin
  if p_claim_token_hash is null or p_claim_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'payout claim token is invalid';
  end if;
  select * into v_batch
    from payout_batch where batch_id = p_batch_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'payout batch not found';
  end if;
  if v_batch.status <> 'claimed'
     or v_batch.claim_token_hash is distinct from p_claim_token_hash then
    raise exception using errcode = 'P0001', message = 'payout batch cannot be armed';
  end if;

  v_replayed := v_batch.broadcast_at is not null;
  if not v_replayed then
    update payout_batch set broadcast_at = now()
     where batch_id = p_batch_id returning * into v_batch;
  end if;
  return jsonb_build_object('batch', to_jsonb(v_batch), 'replayed', v_replayed);
end;
$$;

-- Record the txid in its own transaction before receipt issuance and wallet
-- completion. A later completion rollback cannot erase broadcast evidence.
create or replace function payout_record_broadcast(
  p_batch_id uuid,
  p_claim_token_hash text,
  p_txid text
)
returns payout_batch
language plpgsql
as $$
declare
  v_batch payout_batch;
  v_txid text;
begin
  if p_claim_token_hash is null or p_claim_token_hash !~ '^[0-9a-f]{64}$'
     or p_txid is null or p_txid !~ '^[0-9A-Fa-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'payout broadcast identity is invalid';
  end if;
  v_txid := lower(p_txid);

  select * into v_batch
    from payout_batch where batch_id = p_batch_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'payout batch not found';
  end if;
  if v_batch.claim_token_hash is distinct from p_claim_token_hash
     or v_batch.broadcast_at is null
     or v_batch.status not in ('claimed', 'sent') then
    raise exception using errcode = 'P0001', message = 'payout batch is not armed by this claimant';
  end if;
  if v_batch.txid is not null and lower(v_batch.txid) <> v_txid then
    raise exception using errcode = 'P0001', message = 'payout batch has a different txid';
  end if;

  if v_batch.txid is null then
    update payout_batch set txid = v_txid
     where batch_id = p_batch_id returning * into v_batch;
  end if;
  return v_batch;
end;
$$;

-- Remove the pre-hardening overload so PostgREST does not expose two ambiguous
-- payout_complete signatures after an idempotent upgrade.
drop function if exists payout_complete(uuid, text, jsonb, jsonb);

-- Complete one armed broadcast atomically. Outputs must equal every frozen row;
-- the batch becomes sent before unchanged doge_mark calls so the reservation
-- trigger permits the exact mutations. Any later failure rolls everything back,
-- while payout_record_broadcast's prior txid transaction survives.
create or replace function payout_complete(
  p_batch_id uuid,
  p_claim_token_hash text,
  p_txid text,
  p_outputs jsonb,
  p_receipts jsonb default '[]'::jsonb
)
returns payout_batch
language plpgsql
as $$
declare
  v_batch payout_batch;
  v_plan_row record;
  v_item jsonb;
  v_receipt jsonb;
  v_receipts jsonb := coalesce(p_receipts, '[]'::jsonb);
  v_expected jsonb := '[]'::jsonb;
  v_actual jsonb := '[]'::jsonb;
  v_expected_sorted jsonb;
  v_actual_sorted jsonb;
  v_seen_outputs text[] := array[]::text[];
  v_seen_receipts text[] := array[]::text[];
  v_key_count integer;
  v_student_text text;
  v_student_id uuid;
  v_amount numeric;
  v_balance numeric;
  v_sent numeric;
  v_old_sent numeric;
  v_marked doge_account;
  v_ledger_id bigint;
  v_ledger_sequence text;
  v_txid text;
begin
  if p_claim_token_hash is null or p_claim_token_hash !~ '^[0-9a-f]{64}$'
     or p_txid is null or p_txid !~ '^[0-9A-Fa-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'payout completion identity is invalid';
  end if;
  v_txid := lower(p_txid);

  select * into v_batch
    from payout_batch where batch_id = p_batch_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'payout batch not found';
  end if;
  if v_batch.status = 'sent' then
    if v_batch.claim_token_hash is distinct from p_claim_token_hash
       or lower(coalesce(v_batch.txid, '')) <> v_txid then
      raise exception using errcode = 'P0001', message = 'payout completion conflicts with terminal batch';
    end if;
    return v_batch;
  end if;
  if v_batch.status <> 'claimed'
     or v_batch.claim_token_hash is distinct from p_claim_token_hash
     or v_batch.broadcast_at is null
     or lower(coalesce(v_batch.txid, '')) <> v_txid then
    raise exception using errcode = 'P0001', message = 'payout batch is not ready for completion';
  end if;

  for v_plan_row in select * from payout_plan_rows(v_batch.plan)
  loop
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'studentId', v_plan_row.row_student_key,
      'doge', v_plan_row.row_doge
    ));
  end loop;

  if jsonb_typeof(p_outputs) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'payout outputs are malformed';
  end if;
  for v_item in select value from jsonb_array_elements(p_outputs)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = 'payout output is malformed';
    end if;
    select count(*) into v_key_count from jsonb_object_keys(v_item);
    if v_key_count <> 2
       or not (v_item ? 'studentId')
       or not (v_item ? 'doge')
       or jsonb_typeof(v_item->'studentId') is distinct from 'string'
       or jsonb_typeof(v_item->'doge') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'payout output is malformed';
    end if;

    v_student_text := v_item->>'studentId';
    v_amount := (v_item->>'doge')::numeric;
    if v_student_text = '' or btrim(v_student_text) <> v_student_text
       or v_amount <= 0 or v_amount <> trunc(v_amount, 8)
       or v_student_text = any(v_seen_outputs) then
      raise exception using errcode = 'P0001', message = 'payout output is invalid';
    end if;
    begin
      v_student_id := v_student_text::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'payout output student is invalid';
    end;
    if v_student_id::text <> v_student_text then
      raise exception using errcode = 'P0001', message = 'payout output student is not canonical';
    end if;

    v_seen_outputs := array_append(v_seen_outputs, v_student_text);
    v_actual := v_actual || jsonb_build_array(jsonb_build_object(
      'studentId', v_student_text,
      'doge', v_amount
    ));
  end loop;

  select coalesce(jsonb_agg(value order by value->>'studentId'), '[]'::jsonb)
    into v_expected_sorted from jsonb_array_elements(v_expected);
  select coalesce(jsonb_agg(value order by value->>'studentId'), '[]'::jsonb)
    into v_actual_sorted from jsonb_array_elements(v_actual);
  if v_actual_sorted <> v_expected_sorted then
    raise exception using errcode = 'P0001', message = 'payout outputs do not match frozen plan';
  end if;

  if jsonb_typeof(v_receipts) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'payout receipts are malformed';
  end if;
  for v_item in select value from jsonb_array_elements(v_receipts)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = 'payout receipt is malformed';
    end if;
    select count(*) into v_key_count from jsonb_object_keys(v_item);
    if v_key_count <> 3
       or not (v_item ? 'studentId')
       or not (v_item ? 'receiptId')
       or not (v_item ? 'receiptCompact')
       or jsonb_typeof(v_item->'studentId') is distinct from 'string'
       or jsonb_typeof(v_item->'receiptId') is distinct from 'string'
       or jsonb_typeof(v_item->'receiptCompact') is distinct from 'string' then
      raise exception using errcode = 'P0001', message = 'payout receipt is malformed';
    end if;
    v_student_text := v_item->>'studentId';
    if not (v_student_text = any(v_seen_outputs))
       or v_student_text = any(v_seen_receipts)
       or char_length(v_item->>'receiptId') not between 1 and 256
       or char_length(v_item->>'receiptCompact') not between 1 and 8192 then
      raise exception using errcode = 'P0001', message = 'payout receipt is invalid';
    end if;
    v_seen_receipts := array_append(v_seen_receipts, v_student_text);
  end loop;

  -- Preflight and lock every wallet row before releasing the reservation.
  for v_item in
    select value from jsonb_array_elements(v_actual_sorted)
     order by value->>'studentId'
  loop
    v_student_text := v_item->>'studentId';
    v_student_id := v_student_text::uuid;
    v_amount := (v_item->>'doge')::numeric;
    select doge_balance, doge_sent into v_balance, v_sent
      from doge_account where student_id = v_student_id for update;
    if not found or v_balance - v_sent < v_amount then
      raise exception using errcode = 'P0001', message = 'payout wallet amount is no longer available';
    end if;
  end loop;

  update payout_batch
     set status = 'sent', error = null, resolved_at = now()
   where batch_id = p_batch_id
     and status = 'claimed'
     and claim_token_hash = p_claim_token_hash
     and broadcast_at is not null
     and lower(txid) = v_txid
  returning * into v_batch;
  if not found then
    raise exception using errcode = 'P0001', message = 'payout batch state changed';
  end if;

  v_ledger_sequence := pg_get_serial_sequence('doge_ledger', 'id');
  if v_ledger_sequence is null then
    raise exception using errcode = 'P0001', message = 'payout ledger identity is unavailable';
  end if;

  for v_item in
    select value from jsonb_array_elements(v_actual_sorted)
     order by value->>'studentId'
  loop
    v_student_text := v_item->>'studentId';
    v_student_id := v_student_text::uuid;
    v_amount := (v_item->>'doge')::numeric;
    select doge_sent into v_old_sent from doge_account where student_id = v_student_id;

    -- This is the sole wallet mutation. Keep doge_mark unchanged.
    select * into v_marked from doge_mark(v_student_id, 'doge_sent', v_amount, 0);
    if v_marked.student_id is null or v_marked.doge_sent - v_old_sent <> v_amount then
      raise exception using errcode = 'P0001', message = 'payout wallet mark was not exact';
    end if;

    -- currval is session-local, so concurrent inserts cannot redirect a receipt.
    v_ledger_id := currval(v_ledger_sequence::regclass);
    perform 1 from doge_ledger
     where id = v_ledger_id
       and student_id = v_student_id
       and kind = 'send'
       and doge_delta = -v_amount
       and receipt_id is null
       and receipt_compact is null;
    if not found then
      raise exception using errcode = 'P0001', message = 'payout ledger row could not be identified';
    end if;

    v_receipt := null;
    select value into v_receipt from jsonb_array_elements(v_receipts)
     where value->>'studentId' = v_student_text;
    if v_receipt is not null then
      update doge_ledger
         set receipt_id = v_receipt->>'receiptId',
             receipt_compact = v_receipt->>'receiptCompact'
       where id = v_ledger_id;
    end if;
  end loop;

  return v_batch;
end;
$$;

-- These RPCs belong to the roster service, not public database clients.
revoke all on function payout_plan_rows(jsonb) from public;
revoke all on function payout_create(jsonb, text) from public;
revoke all on function payout_guard_reserved_doge() from public;
revoke all on function payout_arm(uuid, text) from public;
revoke all on function payout_record_broadcast(uuid, text, text) from public;
revoke all on function payout_complete(uuid, text, text, jsonb, jsonb) from public;

do $permissions$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function payout_plan_rows(jsonb) from %I', v_role);
      execute format('revoke all on function payout_create(jsonb, text) from %I', v_role);
      execute format('revoke all on function payout_guard_reserved_doge() from %I', v_role);
      execute format('revoke all on function payout_arm(uuid, text) from %I', v_role);
      execute format('revoke all on function payout_record_broadcast(uuid, text, text) from %I', v_role);
      execute format('revoke all on function payout_complete(uuid, text, text, jsonb, jsonb) from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function payout_plan_rows(jsonb) to service_role';
    execute 'grant execute on function payout_create(jsonb, text) to service_role';
    execute 'grant execute on function payout_guard_reserved_doge() to service_role';
    execute 'grant execute on function payout_arm(uuid, text) to service_role';
    execute 'grant execute on function payout_record_broadcast(uuid, text, text) to service_role';
    execute 'grant execute on function payout_complete(uuid, text, text, jsonb, jsonb) to service_role';
  end if;
end;
$permissions$;

-- Readiness sentinel. Keep this DO block as the final migration statement so
-- the probe cannot exist unless its least-privilege grants were also applied.
do $payout_probe$
declare
  v_role text;
begin
  execute $definition$
    create or replace function payout_probe()
    returns boolean
    language sql
    stable
    as $body$ select true $body$
  $definition$;

  execute 'revoke all on function payout_probe() from public';
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function payout_probe() from %I', v_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function payout_probe() to service_role';
  end if;
end;
$payout_probe$;

commit;

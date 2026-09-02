-- 0033_wallet_address_proposals.sql -- student-proposed, teacher-approved DOGE addresses.
--
-- USER-RUN on the shared Supabase. Additive and idempotent. A proposal is inert:
-- every payout and chain path continues to read doge_address only.
--
-- Rejection text is the one deliberate addition to the spec's proposal pair.
-- Without a durable, bounded reason, a rejection made in the teacher's browser
-- cannot later appear in the student's drawer after the proposal is cleared.

begin;

-- Address promotion depends on the 0032 frozen-plan table and readiness
-- function. Fail the whole install up front instead of allowing proposals into
-- a database where neither approval nor the legacy paper-wallet path can work.
do $dependencies$
begin
  if to_regclass('payout_batch') is null
     or to_regprocedure('payout_probe()') is null then
    raise exception using
      errcode = 'P0001',
      message = 'wallet address proposals require migration 0032';
  end if;
end;
$dependencies$;

alter table doge_account
  add column if not exists proposed_address text,
  add column if not exists proposed_at timestamptz,
  add column if not exists proposal_rejection_reason text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'doge_account_proposal_pair_check'
       and conrelid = 'doge_account'::regclass
  ) then
    alter table doge_account
      add constraint doge_account_proposal_pair_check
      check ((proposed_address is null) = (proposed_at is null));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'doge_account_proposal_address_check'
       and conrelid = 'doge_account'::regclass
  ) then
    alter table doge_account
      add constraint doge_account_proposal_address_check
      check (
        proposed_address is null
        or proposed_address ~ '^D[1-9A-HJ-NP-Za-km-z]{33}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'doge_account_proposal_rejection_check'
       and conrelid = 'doge_account'::regclass
  ) then
    alter table doge_account
      add constraint doge_account_proposal_rejection_check
      check (
        char_length(coalesce(proposal_rejection_reason, '')) <= 240
        and (proposed_address is null or proposal_rejection_reason is null)
      );
  end if;
end;
$constraints$;

-- Latest-wins proposal write. Locking the roster row makes archival compose
-- with token auth, and locking the account makes proposed_at a monotonic CAS
-- version even if two requests arrive within the same system-clock tick.
create or replace function doge_propose_address(
  p_sid uuid,
  p_address text
)
returns doge_account
language plpgsql
as $$
declare
  v_status text;
  v_role text;
  v_account doge_account;
  v_proposed_at timestamptz;
begin
  select status, role
    into v_status, v_role
    from roster
   where student_id = p_sid
   for share;

  if not found or v_status is distinct from 'active' or v_role is distinct from 'student' then
    raise exception using errcode = 'P0001', message = 'student is not eligible to propose an address';
  end if;

  if p_address is null or p_address !~ '^D[1-9A-HJ-NP-Za-km-z]{33}$' then
    raise exception using errcode = '22023', message = 'wallet address proposal is invalid';
  end if;

  insert into doge_account (student_id)
  values (p_sid)
  on conflict (student_id) do nothing;

  select *
    into v_account
    from doge_account
   where student_id = p_sid
   for update;

  if v_account.doge_address is not distinct from p_address then
    raise exception using errcode = 'P0001', message = 'wallet address is already approved';
  end if;

  v_proposed_at := clock_timestamp();
  if v_account.proposed_at is not null and v_proposed_at <= v_account.proposed_at then
    v_proposed_at := v_account.proposed_at + interval '1 microsecond';
  end if;

  update doge_account
     set proposed_address = p_address,
         proposed_at = v_proposed_at,
         proposal_rejection_reason = null,
         updated_at = now()
   where student_id = p_sid
  returning * into v_account;

  return v_account;
end;
$$;

-- The 0032 reservation trigger protects balances, but its trigger column list
-- predates address proposals. Close that gap for BOTH paper-wallet edits and
-- proposal approvals: no approved address may change while its student appears
-- in a pending/claimed frozen plan.
create or replace function wallet_guard_active_payout_address()
returns trigger
language plpgsql
as $$
begin
  if new.doge_address is not distinct from old.doge_address then
    return new;
  end if;

  if exists (
    select 1
      from payout_batch as batch
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(batch.plan->'rows') = 'array' then batch.plan->'rows'
          else '[]'::jsonb
        end
      ) as item(value)
     where batch.status in ('pending', 'claimed')
       and item.value->>'studentId' = old.student_id::text
  ) then
    raise exception using
      errcode = '23514',
      message = 'wallet address change blocked by active payout batch';
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_active_payout_address_guard on doge_account;
create trigger wallet_active_payout_address_guard
before update of doge_address on doge_account
for each row execute function wallet_guard_active_payout_address();

-- Lock, version-check, active-batch-check, promote, and clear as one database
-- transaction. The row lock composes with payout_create's wallet locks:
-- whichever operation wins makes the other re-check live state before commit.
create or replace function doge_approve_address_proposal(
  p_sid uuid,
  p_expected_proposed_at timestamptz
)
returns doge_account
language plpgsql
as $$
declare
  v_status text;
  v_role text;
  v_account doge_account;
begin
  select status, role
    into v_status, v_role
    from roster
   where student_id = p_sid
   for share;

  if not found or v_status is distinct from 'active' or v_role is distinct from 'student' then
    raise exception using
      errcode = 'P0001',
      message = 'student is not eligible to approve an address proposal';
  end if;

  select *
    into v_account
    from doge_account
   where student_id = p_sid
   for update;

  if not found or v_account.proposed_address is null then
    raise exception using errcode = 'P0001', message = 'wallet address proposal not found';
  end if;

  if p_expected_proposed_at is null
     or v_account.proposed_at is distinct from p_expected_proposed_at then
    raise exception using errcode = 'P0001', message = 'wallet address proposal changed';
  end if;

  if v_account.proposed_address !~ '^D[1-9A-HJ-NP-Za-km-z]{33}$' then
    raise exception using errcode = '22023', message = 'wallet address proposal is invalid';
  end if;

  if exists (
    select 1
      from payout_batch as batch
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(batch.plan->'rows') = 'array' then batch.plan->'rows'
          else '[]'::jsonb
        end
      ) as item(value)
     where batch.status in ('pending', 'claimed')
       and item.value->>'studentId' = p_sid::text
  ) then
    raise exception using
      errcode = '23514',
      message = 'wallet address change blocked by active payout batch';
  end if;

  update doge_account
     set doge_address = proposed_address,
         proposed_address = null,
         proposed_at = null,
         proposal_rejection_reason = null,
         updated_at = now()
   where student_id = p_sid
  returning * into v_account;

  return v_account;
end;
$$;

revoke all on function wallet_guard_active_payout_address() from public;
revoke all on function doge_propose_address(uuid, text) from public;
revoke all on function doge_approve_address_proposal(uuid, timestamptz) from public;

do $function_permissions$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function wallet_guard_active_payout_address() from %I', v_role);
      execute format('revoke all on function doge_propose_address(uuid, text) from %I', v_role);
      execute format(
        'revoke all on function doge_approve_address_proposal(uuid, timestamptz) from %I',
        v_role
      );
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function doge_propose_address(uuid, text) to service_role';
    execute 'grant execute on function doge_approve_address_proposal(uuid, timestamptz) to service_role';
  end if;
end;
$function_permissions$;

commit;

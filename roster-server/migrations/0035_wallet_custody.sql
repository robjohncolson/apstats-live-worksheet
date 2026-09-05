-- 0035_wallet_custody: encrypted teacher-held paper wallets.
-- USER-RUN on shared Supabase. Never auto-run. Additive and idempotent.
-- Run after the existing wallet migrations, including 0034 candy return.
-- WALLET_KEY_SECRET is configured separately on the server, never in SQL.
begin;

alter table doge_account
  add column if not exists doge_wif_enc text,
  add column if not exists doge_wallet_label text,
  add column if not exists doge_key_held_at timestamptz;

alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in','sell_doge',
    'bet_hold','bet_win','bet_loss','bet_refund','review_award','give_back','key_reveal'));

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'doge_wallet_custody_pair_check'
    and conrelid = 'doge_account'::regclass) then
    alter table doge_account add constraint doge_wallet_custody_pair_check check (
      (doge_wif_enc is null and doge_key_held_at is null and doge_wallet_label is null)
      or (doge_wif_enc is not null and doge_key_held_at is not null and doge_address is not null)
    );
  end if;
end;
$constraints$;

-- The existing address writer remains the only address API. An address edit,
-- including proposal promotion, atomically invalidates custody on the same row.
-- No balances or payout functions are changed.
create or replace function wallet_clear_custody_on_address_change()
returns trigger language plpgsql as $$
begin
  if new.doge_address is distinct from old.doge_address then
    new.doge_wif_enc := null;
    new.doge_wallet_label := null;
    new.doge_key_held_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_clear_custody_on_address_change on doge_account;
create trigger wallet_clear_custody_on_address_change
  before update of doge_address on doge_account
  for each row execute function wallet_clear_custody_on_address_change();

-- The application derives p_address from a validated mainnet WIF. Matching and
-- storing under the row lock prevents an address edit from winning between them.
create or replace function doge_store_wallet_custody(
  p_sid uuid, p_address text, p_ciphertext text, p_label text
) returns boolean language plpgsql as $$
declare v_address text;
begin
  if p_ciphertext is null or p_ciphertext !~ '^v1:'
    or char_length(coalesce(p_label, '')) > 120 then
    raise exception using errcode = '22023', message = 'invalid wallet custody data';
  end if;
  select doge_address into v_address from doge_account
    where student_id = p_sid for update;
  if not found or p_address is null or v_address is distinct from p_address then return false; end if;
  update doge_account set doge_wif_enc = p_ciphertext, doge_wallet_label = p_label,
    doge_key_held_at = clock_timestamp() where student_id = p_sid;
  return true;
end;
$$;

-- Read/decrypt/derive happens only in the teacher route. Before revealing, check
-- that exact encrypted snapshot still belongs to the live address and persist a
-- zero-value audit row. Any insert failure rolls back; plaintext is not returned.
create or replace function doge_audit_key_reveal(
  p_sid uuid, p_address text, p_expected_ciphertext text
) returns boolean language plpgsql as $$
declare v_address text; v_ciphertext text;
begin
  select doge_address, doge_wif_enc into v_address, v_ciphertext from doge_account
    where student_id = p_sid for update;
  if not found or p_expected_ciphertext is null or v_ciphertext is null
    or v_address is distinct from p_address
    or v_ciphertext is distinct from p_expected_ciphertext then return false; end if;
  insert into doge_ledger (student_id, kind, candy_delta, doge_delta)
    values (p_sid, 'key_reveal', 0, 0);
  return true;
end;
$$;

-- These functions use caller privileges (RLS remains in force), and only the
-- server's service role receives execution permission on hosted Supabase.
revoke all on function doge_store_wallet_custody(uuid, text, text, text) from public;
revoke all on function doge_audit_key_reveal(uuid, text, text) from public;
do $permissions$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function doge_store_wallet_custody(uuid, text, text, text) to service_role;
    grant execute on function doge_audit_key_reveal(uuid, text, text) to service_role;
  end if;
end;
$permissions$;

commit;

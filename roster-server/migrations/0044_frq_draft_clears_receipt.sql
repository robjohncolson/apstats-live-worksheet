-- 0044_frq_draft_clears_receipt.sql -- an FRQ row must never keep a signed
-- receipt for content it no longer holds.
--
-- TEACHER-RUN: paste this file into the Supabase SQL editor (project
-- hgvnytaqmuybzbotosyj). A Railway deploy does NOT apply it. Re-run-safe:
-- both statements are CREATE OR REPLACE with unchanged signatures and return
-- types, so no caller changes and the grants from 0031 are re-asserted below.
--
-- WHY: the nightly snapshot verifier (snapshot-verify.js verifyRecord) fails
-- the whole snapshot when a stored score/response differs from the Ed25519
-- receipt beside it ("score-tampered" / "response-tampered"). An unsigned row
-- is only counted. Two 0031 paths changed signed content in place:
--   1. record_frq_draft replaced `response` on an ungraded row but kept the
--      old receipt (WS-U3L2-reflect2, 2026-09-28).
--   2. apply_frq_verdict sets `score` and leaves the old receipt; the worker
--      re-signs afterwards, best-effort. If that second write fails, the old
--      (score-less or lower-score) receipt attests the wrong score.
-- Both functions below are 0031's text with ONE change each: the receipt
-- columns are cleared in the same statement that changes the signed content.
-- The roster-server re-signs right after (draft route / FRQ worker).

-- Atomically create or refresh the unique (student, frq, item, attempt=1) ticket.
-- ON CONFLICT takes the same row lock an explicit SELECT FOR UPDATE would take.
-- A graded row is deliberately immutable here: score and its bound response/hash
-- survive cached drafts and OfflineQueue replay.
create or replace function record_frq_draft(
  p_student_id uuid,
  p_item_id text,
  p_response text,
  p_response_hash text,
  p_ready_at timestamptz
)
returns table (
  ledger_id uuid,
  status text,
  response_version bigint
)
language sql
as $$
  with upserted as (
    insert into item_ledger (
      student_id,
      source,
      item_id,
      response,
      score,
      attempt,
      frq_response_version,
      frq_response_hash,
      frq_ready_at
    )
    values (
      p_student_id,
      'frq',
      p_item_id,
      to_jsonb(p_response),
      null,
      1,
      1,
      p_response_hash,
      p_ready_at
    )
    on conflict (student_id, source, item_id, attempt) do update
    set
      response = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then excluded.response
        else item_ledger.response
      end,
      frq_response_version = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then item_ledger.frq_response_version + 1
        else item_ledger.frq_response_version
      end,
      frq_response_hash = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then excluded.frq_response_hash
        else item_ledger.frq_response_hash
      end,
      -- An identical blur/Done replay may only make work ready sooner. It must
      -- not delay an existing ticket or invalidate a worker grading the same text.
      frq_ready_at = case
        when item_ledger.score is not null then item_ledger.frq_ready_at
        when item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then excluded.frq_ready_at
        else coalesce(
          least(item_ledger.frq_ready_at, excluded.frq_ready_at),
          item_ledger.frq_ready_at,
          excluded.frq_ready_at
        )
      end,
      frq_claim_token = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_claim_token
      end,
      frq_claim_owner = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_claim_owner
      end,
      frq_claimed_until = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_claimed_until
      end,
      frq_retry_count = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then 0
        else item_ledger.frq_retry_count
      end,
      frq_next_attempt_at = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_next_attempt_at
      end,
      frq_last_error = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.frq_last_error
      end,
      -- 0044: a replaced response drops the receipt that signed the old text.
      receipt_id = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.receipt_id
      end,
      receipt_compact = case
        when item_ledger.score is null
          and item_ledger.frq_response_hash is distinct from excluded.frq_response_hash
          then null
        else item_ledger.receipt_compact
      end
    returning item_ledger.*
  )
  select
    u.ledger_id,
    case
      when u.score is not null then 'graded'
      when u.frq_claimed_until > now() then 'grading'
      when u.frq_next_attempt_at > now() then 'retrying'
      when u.response is null
        or jsonb_typeof(u.response) <> 'string'
        or char_length(u.response #>> '{}') < 20
        or u.frq_ready_at is null then 'draft'
      else 'queued'
    end,
    u.frq_response_version
  from upserted as u;
$$;

-- Apply under a row lock so the version/hash decision, max floor, result write,
-- and lease release serialize with drafts and competing graders. responseHash is
-- accepted as internal envelope metadata in p_result and removed before the
-- student-visible result is stored; response_version remains the required binding
-- for callers using the contracted sanitized result shape without that key.
create or replace function apply_frq_verdict(
  p_ledger_id uuid,
  p_claim_token uuid,
  p_response_version bigint,
  p_score numeric,
  p_result jsonb,
  p_rubric_version text,
  p_graded_at timestamptz,
  p_teacher boolean default false
)
returns table (
  applied boolean,
  stale boolean,
  previous_score numeric,
  score numeric,
  ledger_id uuid
)
language plpgsql
as $$
declare
  v_row item_ledger%rowtype;
  v_expected_hash text;
  v_previous_score numeric;
  v_final_score numeric;
  v_applied boolean;
  v_was_appeal boolean;
  v_hash_matches boolean;
  v_claim_matches boolean;
begin
  -- Invalid model output is not a verdict. In particular, do not release its
  -- lease; the caller must classify the failure with fail_frq_claim.
  if p_score is null or p_score not in (0::numeric, 0.5::numeric, 1::numeric) then
    select l.score
      into v_previous_score
      from item_ledger as l
      where l.ledger_id = p_ledger_id;

    return query
      select false, false, v_previous_score, v_previous_score, p_ledger_id;
    return;
  end if;

  -- WHY: every decision below is based on this exact row image; the lock makes
  -- a simultaneous draft or verdict wait and re-evaluate after our atomic write.
  select l.*
    into v_row
    from item_ledger as l
    where l.ledger_id = p_ledger_id
    for update;

  if not found then
    return query select false, true, null::numeric, null::numeric, p_ledger_id;
    return;
  end if;

  v_expected_hash := coalesce(
    p_result ->> 'responseHash',
    p_result ->> 'response_hash'
  );
  v_hash_matches := v_expected_hash is not null
    and v_row.frq_response_hash is not distinct from v_expected_hash;
  -- coalesce: a released/reissued claim leaves frq_claim_token NULL or different;
  -- NULL = uuid is SQL-null, and "not null" in the elsif below would silently treat
  -- that as a match-adjacent fallthrough. A worker token matches ONLY a stored equal token.
  v_claim_matches := p_claim_token is not null
    and coalesce(v_row.frq_claim_token = p_claim_token, false);

  if v_row.frq_response_version is distinct from p_response_version then
    return query
      select false, true, v_row.score, v_row.score, v_row.ledger_id;
    return;
  end if;

  if p_claim_token is null then
    -- Teacher/sweep calls have no lease token, so both the explicit authority
    -- bit and caller-carried response hash are mandatory.
    if not coalesce(p_teacher, false) or not v_hash_matches then
      return query
        select false, true, v_row.score, v_row.score, v_row.ledger_id;
      return;
    end if;
  elsif not v_claim_matches then
    -- A non-null worker token must be the token still stored on the row. An
    -- expired-but-unreclaimed owner may finish, but after reclaim the old token
    -- is stale. This intentionally spends one extra model call when a lease
    -- expires mid-grade; accepting a hash plus arbitrary/old token is unsafe.
    return query
      select false, true, v_row.score, v_row.score, v_row.ledger_id;
    return;
  else
    -- The token binds the snapshot. If the caller also carries the hash, reject
    -- disagreement instead of silently trusting one of the two bindings.
    if v_expected_hash is not null and not v_hash_matches then
      return query
        select false, true, v_row.score, v_row.score, v_row.ledger_id;
      return;
    end if;
  end if;

  v_previous_score := v_row.score;
  v_was_appeal := v_row.score is not null and v_row.frq_appeal_pending is not null;
  v_final_score := case
    when v_row.score is null then p_score
    else greatest(v_row.score, p_score)
  end;
  v_applied := v_final_score is distinct from v_row.score
    and v_final_score is not null;

  update item_ledger as l
  set
    score = v_final_score,
    -- 0044: a changed score drops the receipt that signed the old score. The
    -- worker signs the new score right after (updateFrqReceiptIfScore).
    receipt_id = case
      when v_applied then null
      else l.receipt_id
    end,
    receipt_compact = case
      when v_applied then null
      else l.receipt_compact
    end,
    frq_result = case
      when v_applied then
        (
          case when jsonb_typeof(p_result) = 'object' then p_result else '{}'::jsonb end
          - 'responseHash'
          - 'response_hash'
        ) || jsonb_build_object('score', v_final_score)
      else l.frq_result
    end,
    frq_rubric_version = case
      when v_applied then p_rubric_version
      else l.frq_rubric_version
    end,
    graded_at = case
      when v_applied then coalesce(p_graded_at, statement_timestamp())
      else l.graded_at
    end,
    frq_claim_token = null,
    frq_claim_owner = null,
    frq_claimed_until = null,
    frq_retry_count = 0,
    frq_next_attempt_at = null,
    frq_last_error = null,
    -- Preserve the completed request for the student while retaining the hash
    -- and request time used by queue_frq_appeal for dedup and cooldown.
    frq_last_appeal = case
      when v_was_appeal then jsonb_strip_nulls(jsonb_build_object(
        'text', v_row.frq_appeal_pending -> 'text',
        'revisedText', v_row.frq_appeal_pending -> 'revisedText',
        'hash', coalesce(
          v_row.frq_appeal_pending -> 'hash',
          v_row.frq_last_appeal -> 'hash'
        ),
        'at', coalesce(
          v_row.frq_appeal_pending -> 'requestedAt',
          v_row.frq_last_appeal -> 'at',
          to_jsonb(statement_timestamp())
        ),
        'outcome', case when v_applied then 'raised' else 'maintained' end
      ))
      else l.frq_last_appeal
    end,
    frq_appeal_pending = case
      when v_was_appeal then null
      else l.frq_appeal_pending
    end
  where l.ledger_id = p_ledger_id;

  return query
    select v_applied, false, v_previous_score, v_final_score, p_ledger_id;
end;
$$;

-- Functions are RPCs for the roster service, not public database APIs.
-- Same guarded pattern as 0031 (CREATE OR REPLACE keeps existing grants; this
-- re-asserts them in case the functions were ever recreated by hand).
revoke all on function record_frq_draft(uuid, text, text, text, timestamptz) from public;
revoke all on function apply_frq_verdict(uuid, uuid, bigint, numeric, jsonb, text, timestamptz, boolean) from public;

do $permissions$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on function record_frq_draft(uuid, text, text, text, timestamptz) from %I',
        v_role
      );
      execute format(
        'revoke all on function apply_frq_verdict(uuid, uuid, bigint, numeric, jsonb, text, timestamptz, boolean) from %I',
        v_role
      );
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function record_frq_draft(uuid, text, text, text, timestamptz) to service_role';
    execute 'grant execute on function apply_frq_verdict(uuid, uuid, bigint, numeric, jsonb, text, timestamptz, boolean) to service_role';
  end if;
end;
$permissions$;

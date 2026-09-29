// ledger-db.js — data-access wrapper for item_ledger around @supabase/supabase-js
// Injectable for tests: call createLedgerDb(supabaseClient) with a real or fake client.
// server.js calls createLiveLedgerDb() to get the production instance.

import { createClient } from '@supabase/supabase-js';
import { stableLedgerSort } from './scoring.js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveLedgerDb() {
  return createLedgerDb(createServiceClient());
}

// Raw service-role Supabase client from env. Lets out-of-repo tools (e.g. the
// scripts/ ingestion job) reuse roster-server's @supabase install instead of
// importing the dependency from a path where it isn't resolvable.
export function createServiceClient() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  return createClient(url, key);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

let reasoningColumnMissingLogged = false;

// True only when [error] says exactly [column] is missing. Known signatures:
//   PostgREST PGRST204: "Could not find the 'reasoning' column of 'item_ledger' in the schema cache"
//   Postgres  42703:    'column "reasoning" of relation "item_ledger" does not exist'
//                       'column item_ledger.reasoning does not exist'
// The column name is compared EXACTLY (so 'reasoning_extra' never matches 'reasoning').
export function isMissingColumnError(error, column) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');

  const cacheMiss = /could not find the '([^']+)' column/i.exec(message);
  if (cacheMiss && (code === 'PGRST204' || code === '')) return cacheMiss[1] === column;

  const undefinedColumn = /column "?(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)"?(?: of relation "?[A-Za-z0-9_.]+"?)? does not exist/i.exec(message);
  if (undefinedColumn && (code === '42703' || code === '')) return undefinedColumn[1] === column;

  return false;
}

// Write [row] with an optional `reasoning` field. Until migration 0037 adds the column the
// write is retried WITHOUT it, so a missing column can never lose the answer itself.
// [write] receives the row to send and returns the Supabase result.
async function writeWithReasoningFallback(row, reasoning, write) {
  const hasReasoning = typeof reasoning === 'string' && reasoning.trim() !== '';
  if (!hasReasoning) return write(row);

  const result = await write({ ...row, reasoning });
  if (!result || !isMissingColumnError(result.error, 'reasoning')) return result;
  if (!reasoningColumnMissingLogged) {
    reasoningColumnMissingLogged = true;
    console.warn('[ledger] item_ledger.reasoning column missing (run migration 0037); storing rows without reasoning');
  }
  return write(row);
}

export function createLedgerDb(client) {
  return { insertLedgerRow, insertLedgerRowIfAbsent, updateLedgerReceipt, updateFrqFeedback, getLedgerByStudent, getLedgerByItem, getRowsByLedgerIds };

  // Compare-and-set only the feedback JSON. Never include score, receipts, or
  // ticket state in this update, even when the grader suggests a higher score.
  async function updateFrqFeedback(existing, result) {
    let query = client.from('item_ledger').update({ frq_result: result })
      .eq('ledger_id', existing.ledger_id)
      .eq('source', 'frq')
      .eq('response', JSON.stringify(existing.response))
      .eq('score', existing.score);
    query = existing.frq_result == null
      ? query.is('frq_result', null)
      : query.eq('frq_result', JSON.stringify(existing.frq_result));
    return query.select('ledger_id, score');
  }

  // Upsert a ledger row on (student_id, source, item_id, attempt).
  // Returns { data, error } — data has ledger_id and evidence_tier on success.
  // [recordedAt] is OPTIONAL and only set by the faithful restore path
  // (admin-restore.js), which replays issuer-signed rows byte-for-byte and must
  // preserve the original timestamp so the recomputed commit-chain heads match.
  // Every other caller omits it and gets the original now() behavior.
  // [frqResult]/[gradedAt] are OPTIONAL (2026-09-09): the legacy /ledger/frq-regrade
  // path stores the grader's verdict + feedback alongside the score so the worksheet can
  // explain the grade. Omitted by every other caller → columns untouched.
  // [reasoning] is OPTIONAL (quiz retry, QUIZ_FIRST_ANSWER_SPEC v2): included only when a
  // non-empty string is given. Until migration 0037 adds the column, the upsert is retried
  // WITHOUT it so a missing column can never lose the answer itself.
  async function insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt, recordedAt, frqResult, gradedAt, reasoning }) {
    const extra = {};
    if (frqResult && typeof frqResult === 'object') {
      extra.frq_result = frqResult;
      extra.graded_at  = gradedAt || new Date().toISOString();
    }
    const baseRow = {
      student_id:    studentId,
      source:        source,
      item_id:       itemId,
      unit:          unit        || null,
      topic:         topic       || null,
      skill:         skill       || null,
      response:      response,
      score:         score       ?? null,
      evidence_tier: evidenceTier,
      attempt:       attempt     ?? 1,
      recorded_at:   recordedAt  || new Date().toISOString(),
      ...extra
    };
    const upsertRow = (row) => client
      .from('item_ledger')
      .upsert([row], { onConflict: 'student_id,source,item_id,attempt' })
      .select('ledger_id, evidence_tier')
      .single();
    return writeWithReasoningFallback(baseRow, reasoning, upsertRow);
  }

  // First writer wins: an existing application must never be overwritten.
  // Returns { data: rows[], error, inserted }. [reasoning] as in insertLedgerRow (optional,
  // missing-column fallback) — the quiz retry (attempt 2) is written through here.
  async function insertLedgerRowIfAbsent({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt, recordedAt, frqResult, gradedAt, reasoning }) {
    const payload = {
      student_id: studentId, source, item_id: itemId,
      unit: unit || null, topic: topic || null, skill: skill || null,
      response, score: score ?? null, evidence_tier: evidenceTier,
      attempt: attempt ?? 1, recorded_at: recordedAt || new Date().toISOString(),
    };
    if (frqResult && typeof frqResult === 'object') {
      payload.frq_result = frqResult;
      payload.graded_at = gradedAt || new Date().toISOString();
    }
    const insertRow = (row) => client.from('item_ledger')
      .upsert(row, { onConflict: 'student_id,source,item_id,attempt', ignoreDuplicates: true })
      .select('*');
    const { data, error } = await writeWithReasoningFallback(payload, reasoning, insertRow);
    return { data, error, inserted: !error && Array.isArray(data) && data.length > 0 };
  }

  // Persist a signed receipt after the grade row is safely recorded.
  // Returns { error }; callers treat this as best-effort.
  async function updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
    const { error } = await client
      .from('item_ledger')
      .update({
        receipt_id: receiptId,
        receipt_compact: receiptCompact
      })
      .eq('ledger_id', ledgerId);
    return { error };
  }

  // Fetch all ledger rows for a student, newest first.
  // Returns { data, error } — data is an array of item_ledger rows.
  //
  // Optional opts.prefix (string) filters rows whose item_id starts with prefix.
  // Uses Supabase .like (case-sensitive); the route layer is responsible for
  // sanitizing the prefix (no wildcards allowed in user input).
  async function getLedgerByStudent(studentId, opts) {
    const prefix = opts && opts.prefix;
    let q = client
      .from('item_ledger')
      .select('*')
      .eq('student_id', studentId);
    if (prefix) {
      q = q.like('item_id', prefix + '%');
    }
    const result = await q.order('recorded_at', { ascending: false });
    if (result && Array.isArray(result.data)) {
      result.data = stableLedgerSort(result.data);
    }
    return result;
  }

  // Fetch all ledger rows for ONE item_id, newest first. Optional source filter.
  // Used by the section-scoped /class/blank class-answers view. Returns
  // { data, error } — data rows carry student_id, response, source, recorded_at.
  async function getLedgerByItem(itemId, opts) {
    const source = opts && opts.source;
    let q = client
      .from('item_ledger')
      .select('student_id, response, source, recorded_at')
      .eq('item_id', itemId);
    if (source) {
      q = q.eq('source', source);
    }
    return q.order('recorded_at', { ascending: false });
  }

  // Fetch full ledger rows for an explicit set of ledger_ids. Used by the Nightly
  // Review mark endpoint to resolve each target's student_id + binding fields (so a
  // teacher can mark items by id without trusting the client's student attribution).
  // Empty input → no query. Returns { data, error } — rows in no particular order.
  async function getRowsByLedgerIds(ledgerIds) {
    if (!Array.isArray(ledgerIds) || !ledgerIds.length) return { data: [], error: null };
    return client.from('item_ledger').select('*').in('ledger_id', ledgerIds);
  }
}

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

export function createLedgerDb(client) {
  return { insertLedgerRow, updateLedgerReceipt, getLedgerByStudent, getLedgerByItem };

  // Upsert a ledger row on (student_id, source, item_id, attempt).
  // Returns { data, error } — data has ledger_id and evidence_tier on success.
  async function insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt }) {
    return client
      .from('item_ledger')
      .upsert(
        [{
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
          recorded_at:   new Date().toISOString()
        }],
        { onConflict: 'student_id,source,item_id,attempt' }
      )
      .select('ledger_id, evidence_tier')
      .single();
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
}

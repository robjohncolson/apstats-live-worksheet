// ledger-db.js — data-access wrapper for item_ledger around @supabase/supabase-js
// Injectable for tests: call createLedgerDb(supabaseClient) with a real or fake client.
// server.js calls createLiveLedgerDb() to get the production instance.

import { createClient } from '@supabase/supabase-js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveLedgerDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  const client = createClient(url, key);
  return createLedgerDb(client);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createLedgerDb(client) {
  return { insertLedgerRow, getLedgerByStudent };

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
          attempt:       attempt     ?? 1
        }],
        { onConflict: 'student_id,source,item_id,attempt' }
      )
      .select('ledger_id, evidence_tier')
      .single();
  }

  // Fetch all ledger rows for a student, newest first.
  // Returns { data, error } — data is an array of item_ledger rows.
  async function getLedgerByStudent(studentId) {
    return client
      .from('item_ledger')
      .select('*')
      .eq('student_id', studentId)
      .order('recorded_at', { ascending: false });
  }
}

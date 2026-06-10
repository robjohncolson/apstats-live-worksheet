// trainer-db.js — data-access wrapper for trainer_state around @supabase/supabase-js
// Injectable for tests: call createTrainerDb(supabaseClient) with a real or fake client.
// server.js resolves createLiveTrainerDb() inside createApp (nudge-db pattern:
// returns null when env vars are absent, so tests without Supabase env never throw).

import { createClient } from '@supabase/supabase-js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveTrainerDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key);
  return createTrainerDb(client);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createTrainerDb(client) {
  return { getState, getStamp, insertState, updateStateIf, upsertState, getLbByStudents };

  // Fetch one student's state for one deck.
  // Returns { data: { state, updated_at } | null, error } — maybeSingle, so a
  // missing row is { data: null, error: null } (the route answers found:false).
  async function getState(studentId, deckId) {
    return client
      .from('trainer_state')
      .select('state, updated_at')
      .eq('student_id', studentId)
      .eq('deck_id', deckId)
      .maybeSingle();
  }

  // Stamp-only read for PUT's concurrency pre-check: selects ONLY updated_at
  // so the per-answer hot path never pulls the (large) state JSONB.
  // Returns { data: { updated_at } | null, error }.
  async function getStamp(studentId, deckId) {
    return client
      .from('trainer_state')
      .select('updated_at')
      .eq('student_id', studentId)
      .eq('deck_id', deckId)
      .maybeSingle();
  }

  // First write for a (student, deck): plain insert. A concurrent first-PUT
  // race surfaces as unique_violation 23505 — the route answers 409.
  // updated_at is set EXPLICITLY here and in every write below: the column
  // default only fires on INSERT, and a stale stamp would freeze leaderboard
  // "last active" forever (spec CX-7).
  async function insertState({ studentId, deckId, state }) {
    return client
      .from('trainer_state')
      .insert([{
        student_id: studentId,
        deck_id:    deckId,
        state:      state,
        updated_at: new Date().toISOString()
      }])
      .select('updated_at')
      .single();
  }

  // Guarded full-replace: writes ONLY if updated_at still equals the
  // baseUpdatedAt the client pulled (atomic compare-and-set — closes the
  // read-then-write TOCTOU window in PUT). Zero rows matched →
  // { data: null, error: null } and the route 409s with a fresh stamp.
  async function updateStateIf({ studentId, deckId, state, baseUpdatedAt }) {
    return client
      .from('trainer_state')
      .update({ state, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('deck_id', deckId)
      .eq('updated_at', baseUpdatedAt)
      .select('updated_at')
      .maybeSingle();
  }

  // Unconditional full-replace upsert on (student_id, deck_id) — the PATCH
  // (best-effort flush, no concurrency check) write path.
  // Returns { data: { updated_at }, error } — the route hands updated_at back
  // to the client as its next baseUpdatedAt.
  async function upsertState({ studentId, deckId, state }) {
    return client
      .from('trainer_state')
      .upsert(
        [{
          student_id: studentId,
          deck_id:    deckId,
          state:      state,
          updated_at: new Date().toISOString()
        }],
        { onConflict: 'student_id,deck_id' }
      )
      .select('updated_at')
      .single();
  }

  // Leaderboard/summary read: lb summaries for many students on one deck.
  // Selects ONLY state->lb — never the full SRS blob — so a section-wide read
  // stays small. Returns { data: [{ student_id, updated_at, lb }], error }.
  async function getLbByStudents(studentIds, deckId) {
    return client
      .from('trainer_state')
      .select('student_id, updated_at, lb:state->lb')
      .eq('deck_id', deckId)
      .in('student_id', studentIds);
  }
}

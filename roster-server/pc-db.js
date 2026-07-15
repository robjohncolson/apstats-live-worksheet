// pc-db.js — Supabase DAL for the Progress-Check makeup feature
// (PC_MAKEUP_DELIVERY_SPEC.md Phase 1). Pure CRUD; no business rules.
//
//   pc_bank   — CB-secure PC26 banks (getBank reads the FULL payload incl. answers;
//               the route strips answers before sending to the client).
//   pc_unlock — per (student_username, unit, part) unlock set by the teacher.

import { createClient } from '@supabase/supabase-js';

export function createPcDb(client) {
  return {
    getBank,               // (unit, part) -> { data: { payload }|null, error }
    upsertUnlocks,         // bulk teacher unlock -> { data: rows, error }
    unlockOne,             // single teacher unlock (makeup) -> { data: row, error }
    isUnlocked,            // (username, unit, part) -> { data: bool, error }
    listActiveForStudent,  // (username) -> { data: rows, error }
  };

  // getBank(unit, part) -> { data: { unit, part, payload }|null, error }
  async function getBank(unit, part) {
    return client
      .from('pc_bank')
      .select('unit, part, payload')
      .eq('unit', unit)
      .eq('part', part)
      .maybeSingle();
  }

  // upsertUnlocks({ studentUsernames, unit, part, unlockedBy }) -> { data: rows, error }
  // One row per (student, unit, part). Re-unlock is idempotent (upsert).
  async function upsertUnlocks({ studentUsernames, unit, part, unlockedBy }) {
    var now = new Date().toISOString();
    var rows = (studentUsernames || []).map(function (u) {
      return {
        student_username: u,
        unit: unit,
        part: part,
        unlocked_by: unlockedBy,
        status: 'active',
        unlocked_at: now,
      };
    });
    if (rows.length === 0) return { data: [], error: null };
    return client
      .from('pc_unlock')
      .upsert(rows, { onConflict: 'student_username,unit,part' })
      .select('*');
  }

  // unlockOne({ studentUsername, unit, part, unlockedBy }) -> { data: row, error }
  async function unlockOne({ studentUsername, unit, part, unlockedBy }) {
    return client
      .from('pc_unlock')
      .upsert([{
        student_username: studentUsername,
        unit: unit,
        part: part,
        unlocked_by: unlockedBy,
        status: 'active',
        unlocked_at: new Date().toISOString(),
      }], { onConflict: 'student_username,unit,part' })
      .select('*')
      .single();
  }

  // isUnlocked(username, unit, part) -> { data: bool, error }
  async function isUnlocked(username, unit, part) {
    var res = await client
      .from('pc_unlock')
      .select('id')
      .eq('student_username', username)
      .eq('unit', unit)
      .eq('part', part)
      .eq('status', 'active')
      .maybeSingle();
    return { data: !!(res && res.data), error: res ? res.error : null };
  }

  // listActiveForStudent(username) -> { data: rows, error }
  async function listActiveForStudent(username) {
    return client
      .from('pc_unlock')
      .select('unit, part, unlocked_at')
      .eq('student_username', username)
      .eq('status', 'active');
  }
}

export function createLivePcDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key);
  return createPcDb(client);
}

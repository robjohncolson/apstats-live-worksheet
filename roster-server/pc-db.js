// pc-db.js — Supabase DAL for the Progress-Check makeup feature
// (PC_MAKEUP_DELIVERY_SPEC.md Phase 1). Pure CRUD; no business rules.
//
//   pc_bank   — CB-secure PC26 banks (getBank reads the FULL payload incl. answers;
//               the route strips answers before sending to the client).
//   pc_unlock — per (student_username, unit, part) unlock set by the teacher.
//   pc_status — the AP Classroom snapshot per (section, unit) the reconcile saw last
//               (PC_FOLLOWTHROUGH_SPEC.md §2.3, migration 0043).

import { createClient } from '@supabase/supabase-js';

export function createPcDb(client) {
  return {
    getBank,               // (unit, part) -> { data: { payload }|null, error }
    upsertUnlocks,         // bulk teacher unlock -> { data: rows, error }
    unlockOne,             // single teacher unlock (makeup) -> { data: row, error }
    isUnlocked,            // (username, unit, part) -> { data: bool, error }
    listActiveForStudent,  // (username) -> { data: rows, error }
    listActiveUnlocks,     // () -> { data: rows, error }  (teacher class view)
    getStatus,             // (section, unit) -> { data: { payload, updated_at }|null, error }
    upsertStatus,          // (section, unit, payload) -> { data, error }
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

  // listActiveUnlocks() -> { data: rows, error } — every active unlock across the
  // class (the teacher makeup-queue board). Enriched with roster identity by the route.
  async function listActiveUnlocks() {
    return client
      .from('pc_unlock')
      .select('student_username, unit, part, unlocked_by, unlocked_at')
      .eq('status', 'active');
  }

  // getStatus(section, unit) -> { data: { payload, updated_at }|null, error }
  async function getStatus(section, unit) {
    return client
      .from('pc_status')
      .select('payload, updated_at')
      .eq('section', section)
      .eq('unit', unit)
      .maybeSingle();
  }

  // upsertStatus(section, unit, payload) -> { data, error } — one row per (section, unit).
  async function upsertStatus(section, unit, payload) {
    return client
      .from('pc_status')
      .upsert([{ section: section, unit: unit, payload: payload, updated_at: new Date().toISOString() }],
        { onConflict: 'section,unit' });
  }
}

export function createLivePcDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key);
  return createPcDb(client);
}

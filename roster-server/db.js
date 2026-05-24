// db.js — data-access wrapper around @supabase/supabase-js
// Injectable for tests: call createDb(supabaseClient) with a real or fake client.
// server.js calls createLiveDb() to get the production instance.

import { createClient } from '@supabase/supabase-js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  const client = createClient(url, key);
  return createDb(client);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createDb(client) {
  return { insertRoster, findByUsername, findByStudentId, getRoleByStudentId, getSpriteHueByStudentId, updatePassword, updateStudent, updateSpriteHue, listRoster };

  // Phase 6: look up a single roster row by student_id -- used by /grade to
  // resolve the student's section, and by the Console routes (P3 nudges,
  // P5/P6 lesson-unlock, P7 nudge-history) to resolve the caller's
  // login_username from the Bearer token. The ledger doesn't persist
  // `section` or identity strings; the roster does. Returns {data, error}
  // where data carries `student_id`, `section`, `login_username`, `real_name`,
  // or null on no-match.
  //
  // Codex P7 BLOCKER fold: login_username MUST be in the SELECT projection.
  // Without it, every route that derives the caller's username from a Bearer
  // token (POST /teacher/nudge, POST /teacher/lesson-unlock, POST /teacher/
  // lesson-unlock/revoke, GET /teacher/nudge-history) silently fails to
  // resolve identity and returns 400. The x-teacher-secret break-glass path
  // bypasses this lookup so the bug was invisible until P7 caught it.
  async function findByStudentId(studentId) {
    return client
      .from('roster')
      .select('student_id, section, login_username, real_name')
      .eq('student_id', studentId)
      .maybeSingle();
  }

  // Defensive role lookup. Returns 'teacher' or 'student'.
  // Degrades to 'student' on ANY error (missing column pre-migration, missing
  // row, DB error) -- never throws. Sign-in is NEVER modified to call this.
  async function getRoleByStudentId(studentId) {
    try {
      const result = await client
        .from('roster')
        .select('role')
        .eq('student_id', studentId)
        .maybeSingle();
      if (result.error || !result.data) return 'student';
      const role = result.data.role;
      return role === 'teacher' ? 'teacher' : 'student';
    } catch (_) {
      return 'student';
    }
  }

  // Defensive sprite hue lookup. Returns integer 0-359 or null.
  // Degrades to null on ANY error (missing column pre-migration, missing
  // row, DB error) -- never throws. Mirrors getRoleByStudentId.
  async function getSpriteHueByStudentId(studentId) {
    try {
      const result = await client
        .from('roster')
        .select('sprite_hue')
        .eq('student_id', studentId)
        .maybeSingle();
      if (result.error || !result.data) return null;
      const hue = result.data.sprite_hue;
      if (typeof hue !== 'number') return null;
      return hue;
    } catch (_) {
      return null;
    }
  }

  // Write only sprite_hue for one student (+ updated_at via the existing trigger).
  // Returns { data, error } -- data is the updated row on success, null when no
  // row matched. Mirrors updateStudent.
  async function updateSpriteHue({ studentId, spriteHue }) {
    const payload = {
      sprite_hue: spriteHue,
      updated_at: new Date().toISOString()
    };

    return client
      .from('roster')
      .update(payload)
      .eq('student_id', studentId)
      .select('student_id, sprite_hue')
      .maybeSingle();
  }

  // Insert a new roster row.
  // Returns { data, error } — data has student_id on success.
  // TR1 additive: also stores the reversible password_cipher and marks the
  // student as must_change_password (default password handed out at enroll).
  async function insertRoster({ realName, section, loginUsername, passwordHash, email, passwordCipher }) {
    return client
      .from('roster')
      .insert([{
        real_name:            realName,
        section:              section,
        login_username:       loginUsername,
        password_hash:        passwordHash,
        email:                email || null,
        password_cipher:      passwordCipher ?? null,
        must_change_password: true
      }])
      .select('student_id, login_username, real_name, section')
      .single();
  }

  // Find a roster row by username (case-insensitive).
  // Returns { data, error } — data has student_id, password_hash, real_name,
  // section, status, must_change_password.
  async function findByUsername(username) {
    const normalizedUsername = String(username).toLowerCase();

    return client
      .from('roster')
      .select('student_id, login_username, password_hash, real_name, section, status, must_change_password')
      .eq('login_username', normalizedUsername)
      .single();
  }

  // Re-hash + re-encrypt a student's password and clear must_change_password.
  // Returns { data, error } — data has student_id on success.
  async function updatePassword({ studentId, passwordHash, passwordCipher }) {
    return client
      .from('roster')
      .update({
        password_hash:        passwordHash,
        password_cipher:      passwordCipher ?? null,
        must_change_password: false
      })
      .eq('student_id', studentId)
      .select('student_id')
      .single();
  }

  // Update a student's real_name and/or section. Touches updated_at always.
  // Returns { data, error } — data is the updated row on success, null when no
  // row matched (so the route can answer 404). Never throws.
  async function updateStudent({ studentId, realName, section }) {
    const payload = { updated_at: new Date().toISOString() };

    if (realName !== undefined) payload.real_name = realName;
    if (section  !== undefined) payload.section   = section;

    const result = await client
      .from('roster')
      .update(payload)
      .eq('student_id', studentId)
      .select('student_id, real_name, section, login_username')
      .maybeSingle();

    // maybeSingle() returns { data: null, error: null } when no row matched.
    // Treat that as a not-found signal so the route can answer 404.
    return result;
  }

  // Teacher roster view. Optional section filter. Ordered by section then created.
  // Returns { data, error } — data is an array of roster rows.
  async function listRoster(section) {
    // student_id is included in the projection so /class/grades + /class/mastery
    // can fan out per student via getLedgerByStudent(student_id). The existing
    // /roster/list handler explicitly maps to a UI-shaped object that omits it,
    // so this addition is invisible to the teacher console (additive, safe).
    let query = client
      .from('roster')
      .select('student_id, real_name, login_username, section, password_cipher, must_change_password, created_at');

    if (section) {
      query = query.eq('section', section);
    }

    return query.order('section', { ascending: true }).order('created_at', { ascending: true });
  }
}

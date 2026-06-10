// trainer.js — mounts /trainer routes onto an Express app.
// Cloud save + leaderboard for the fleet trainers (tmux-trainer / Equation
// Trainer). Desk Roster Alignment spec §2.2.
// Call mountTrainer(app, { db, trainerDb, verifyToken }) from createApp().
//
//   GET   /trainer/state/:deckId                  own row (Bearer ONLY)
//   PUT   /trainer/state/:deckId                  full-replace upsert, optimistic concurrency
//   PATCH /trainer/state/:deckId                  best-effort delta merge (page-hide flush)
//   GET   /trainer/leaderboard/:section/:deckId   public lb summaries
//   GET   /trainer/section/:section/summary/:deckId  teacher engagement snapshot
//
// `state` is client-owned display/engagement data — NEVER grade evidence. The
// server validates nothing inside it beyond size + deckId. No cross-student
// route ever returns full SRS state — only the small state->lb summary.

import { requireTeacher } from './teacher-auth.js';

// Every deckId on every route must match this (spec CX-10). No normalization —
// invalid input is rejected with 400.
const DECK_ID_RE = /^[a-z0-9-]{1,64}$/;

// Decks the server accepts WRITES for (storage-exhaustion guard): without
// this, any valid student token could create unlimited ~256 KB rows under
// arbitrary deckIds on the SHARED grade-pipeline Supabase. Reads stay
// regex-only — an unknown deck just answers found:false.
const DECK_ALLOWLIST = String(process.env.TRAINER_DECK_ALLOWLIST || 'ap-stats-formulas,joyo-kanji')
  .split(',').map(s => s.trim()).filter(Boolean);

// 256 KB cap on a serialized state (or delta). The kanji deck's compact SRS
// tuples are ~90–120 KB, so this is roomy headroom, not a squeeze.
const MAX_STATE_CHARS = 262144;

// Detect the "trainer_state table not provisioned" condition (migration 0017
// has not been run yet). Mirrors class.js's isBlooketSourceMissing: only this
// specific pre-migration condition maps to 503; every other DB error is a
// real 500.
function isTrainerStateMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (code === '42P01') return true; // undefined_table (raw Postgres, e.g. RPC paths)
  // Supabase/PostgREST does NOT pass 42P01 through for a missing table — it
  // reports a schema-cache miss instead (observed live: PGRST205 "Could not
  // find the table 'public.trainer_state' in the schema cache").
  if (code === 'PGRST205') return true;
  if (msg.includes('trainer_state') && msg.includes('schema cache')) return true;
  return msg.includes('trainer_state') && msg.includes('does not exist');
}

function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'trainer_state not provisioned (run migration 0017)' });
}

// Postgres unique_violation — a concurrent PUT inserted the row first.
function isUniqueViolation(e) {
  return !!e && String(e.code || '') === '23505';
}

// Extract a token from Authorization: Bearer <t> ONLY. Deliberately NO ?token
// query fallback on any /trainer route (spec CX-2): query strings land in
// access logs/history. Do not copy the legacy ?token pattern here.
function bearerToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader !== 'string' || !/^Bearer\s+/i.test(authHeader)) return null;
  return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
}

// SRS wire tuples are [rev, pKnown*1000, mastery, lastUpdatedMin, epoch].
// Newer = higher epoch, then higher rev, then later lastUpdatedMin. Used so a
// stale page-hide flush can never regress a card another device already
// advanced (the PATCH path has no optimistic-concurrency check).
function tupleIsNewer(incoming, existing) {
  if (!Array.isArray(existing)) return true;
  if (!Array.isArray(incoming)) return false;
  const epA = Number(incoming[4]) || 0;
  const epB = Number(existing[4]) || 0;
  if (epA !== epB) return epA > epB;
  const revA = Number(incoming[0]) || 0;
  const revB = Number(existing[0]) || 0;
  if (revA !== revB) return revA > revB;
  return (Number(incoming[3]) || 0) >= (Number(existing[3]) || 0);
}

// Merge a flush delta into an existing state: top-level keys shallow-replace,
// EXCEPT delta.srs which merges per-card into state.srs (per-card, the NEWER
// tuple wins — see tupleIsNewer) and delta.resetRev which merges with max().
// A non-object delta.srs (null, number, …) is IGNORED, never replaces — a
// buggy flush must not wipe the whole stored SRS map.
// Both sides untouched — returns a new object.
function applyDelta(state, delta) {
  const merged = { ...state };
  for (const key of Object.keys(delta)) {
    if (key === 'srs') {
      if (!delta.srs || typeof delta.srs !== 'object') continue; // skip, never null out
      if (!merged.srs || typeof merged.srs !== 'object') {
        merged.srs = delta.srs;
        continue;
      }
      const srs = { ...merged.srs };
      for (const cardId of Object.keys(delta.srs)) {
        if (tupleIsNewer(delta.srs[cardId], srs[cardId])) srs[cardId] = delta.srs[cardId];
      }
      merged.srs = srs;
      continue;
    }
    if (key === 'resetRev') {
      merged.resetRev = Math.max(Number(merged.resetRev) || 0, Number(delta.resetRev) || 0);
      continue;
    }
    merged[key] = delta[key];
  }
  return merged;
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountTrainer(app, { db, trainerDb, verifyToken }) {

  // ── GET /trainer/state/:deckId ──────────────────────────────────────────────
  // Auth: Authorization: Bearer ONLY → own row (any valid token, student or
  // teacher role, reads only its own row — spec CX-9).
  //   → 200 { ok:true, found:true, state, updatedAt } — updatedAt is the exact
  //         string the client must echo back as baseUpdatedAt on its next PUT
  //   → 200 { ok:true, found:false }                    no row yet
  //   → 400 bad deckId · 401 bad/missing token · 503 pre-migration
  app.get('/trainer/state/:deckId', async (req, res) => {
    const { deckId } = req.params;
    if (!DECK_ID_RE.test(deckId)) {
      return res.status(400).json({ ok: false, error: 'bad deckId' });
    }

    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    let data, error;
    try {
      ({ data, error } = await trainerDb.getState(studentId, deckId));
    } catch (err) {
      error = err;
    }

    if (error) {
      if (isTrainerStateMissing(error)) return notProvisioned(res);
      console.error('GET /trainer/state DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (!data) {
      return res.json({ ok: true, found: false });
    }
    return res.json({ ok: true, found: true, state: data.state, updatedAt: data.updated_at });
  });

  // ── PUT /trainer/state/:deckId ──────────────────────────────────────────────
  // Body: { token, state, baseUpdatedAt }. Full-replace upsert with optimistic
  // concurrency (spec CX-4): if a row exists and its updated_at != the
  // baseUpdatedAt the client got from its last pull → 409 stale (the client
  // re-pulls, merges, retries once). No row yet → insert regardless of
  // baseUpdatedAt (the client has never pulled, so null is honored).
  //   → 200 { ok:true, updatedAt }   updatedAt = the client's next baseUpdatedAt
  //   → 400 bad/unknown deckId / state not an object · 401 bad token
  //   → 409 { ok:false, error:'stale', updatedAt }   another device wrote first
  //   → 413 state too large · 503 pre-migration
  app.put('/trainer/state/:deckId', async (req, res) => {
    const { deckId } = req.params;
    if (!DECK_ID_RE.test(deckId)) {
      return res.status(400).json({ ok: false, error: 'bad deckId' });
    }
    // Writes are allowlisted (storage-exhaustion guard on the grade DB).
    if (!DECK_ALLOWLIST.includes(deckId)) {
      return res.status(400).json({ ok: false, error: 'unknown deck' });
    }

    const { token, state, baseUpdatedAt } = req.body || {};
    if (!token) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }
    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (!state || typeof state !== 'object') {
      return res.status(400).json({ ok: false, error: 'state object is required' });
    }
    if (JSON.stringify(state).length > MAX_STATE_CHARS) {
      return res.status(413).json({ ok: false, error: 'state too large' });
    }

    // Read ONLY the current stamp (never the full JSONB — this is the
    // per-answer hot path) for the concurrency pre-check.
    let stamp;
    try {
      stamp = await trainerDb.getStamp(studentId, deckId);
    } catch (err) {
      stamp = { data: null, error: err };
    }
    if (stamp.error) {
      if (isTrainerStateMissing(stamp.error)) return notProvisioned(res);
      console.error('PUT /trainer/state stamp error:', stamp.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Stale base → 409 with the current stamp so the client can re-pull,
    // merge, and retry. baseUpdatedAt must be the EXACT string a previous
    // GET/PUT returned (null only when the last pull said found:false).
    if (stamp.data && stamp.data.updated_at !== baseUpdatedAt) {
      return res.status(409).json({ ok: false, error: 'stale', updatedAt: stamp.data.updated_at });
    }

    // Row exists → conditional UPDATE guarded on updated_at = baseUpdatedAt
    // (atomic compare-and-set — no TOCTOU window after the pre-check). Zero
    // rows matched means another device won the race → 409 with a fresh stamp.
    if (stamp.data) {
      let data, error;
      try {
        ({ data, error } = await trainerDb.updateStateIf({ studentId, deckId, state, baseUpdatedAt }));
      } catch (err) {
        error = err;
      }
      if (error) {
        if (isTrainerStateMissing(error)) return notProvisioned(res);
        console.error('PUT /trainer/state write error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return staleAfterRace(res, studentId, deckId);
      return res.json({ ok: true, updatedAt: data.updated_at });
    }

    // No row yet → plain insert. A concurrent first-PUT race surfaces as a
    // unique violation → same 409-with-fresh-stamp answer.
    let data, error;
    try {
      ({ data, error } = await trainerDb.insertState({ studentId, deckId, state }));
    } catch (err) {
      error = err;
    }
    if (error) {
      if (isUniqueViolation(error)) return staleAfterRace(res, studentId, deckId);
      if (isTrainerStateMissing(error)) return notProvisioned(res);
      console.error('PUT /trainer/state write error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true, updatedAt: data ? data.updated_at : null });
  });

  // PUT lost a write race (guarded UPDATE matched zero rows, or the INSERT hit
  // the unique key): re-read the stamp and 409 with the winner's stamp.
  async function staleAfterRace(res, studentId, deckId) {
    let stamp;
    try {
      stamp = await trainerDb.getStamp(studentId, deckId);
    } catch (err) {
      stamp = { data: null, error: err };
    }
    if (stamp.error) {
      console.error('PUT /trainer/state race re-read error:', stamp.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.status(409).json({
      ok: false, error: 'stale',
      updatedAt: stamp.data ? stamp.data.updated_at : null
    });
  }

  // ── PATCH /trainer/state/:deckId ────────────────────────────────────────────
  // Body: { token, delta }. Best-effort page-hide flush (spec CX-3): top-level
  // keys of delta shallow-replace into state, EXCEPT delta.srs which merges
  // per-card (union, incoming card wins). NO concurrency check — the next
  // pull reconciles per-card by rev. No row yet → the delta becomes the
  // initial (sparse) state; the next full PUT completes it.
  //   → 200 { ok:true, updatedAt }
  //   → 400 bad/unknown deckId / delta not an object · 401 bad token
  //   → 413 delta too large · 503 pre-migration
  app.patch('/trainer/state/:deckId', async (req, res) => {
    const { deckId } = req.params;
    if (!DECK_ID_RE.test(deckId)) {
      return res.status(400).json({ ok: false, error: 'bad deckId' });
    }
    // Writes are allowlisted (storage-exhaustion guard on the grade DB).
    if (!DECK_ALLOWLIST.includes(deckId)) {
      return res.status(400).json({ ok: false, error: 'unknown deck' });
    }

    const { token, delta } = req.body || {};
    if (!token) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }
    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (!delta || typeof delta !== 'object') {
      return res.status(400).json({ ok: false, error: 'delta object is required' });
    }
    if (JSON.stringify(delta).length > MAX_STATE_CHARS) {
      return res.status(413).json({ ok: false, error: 'state too large' });
    }

    let existing;
    try {
      existing = await trainerDb.getState(studentId, deckId);
    } catch (err) {
      existing = { data: null, error: err };
    }
    if (existing.error) {
      if (isTrainerStateMissing(existing.error)) return notProvisioned(res);
      console.error('PATCH /trainer/state read error:', existing.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const base = (existing.data && existing.data.state && typeof existing.data.state === 'object')
      ? existing.data.state
      : null;
    const next = base ? applyDelta(base, delta) : delta;

    let data, error;
    try {
      ({ data, error } = await trainerDb.upsertState({ studentId, deckId, state: next }));
    } catch (err) {
      error = err;
    }
    if (error) {
      if (isTrainerStateMissing(error)) return notProvisioned(res);
      console.error('PATCH /trainer/state write error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true, updatedAt: data ? data.updated_at : null });
  });

  // ── GET /trainer/leaderboard/:section/:deckId ───────────────────────────────
  // PUBLIC (no auth) — same data class as GET /roster/section/:section (names
  // are already public there). Returns the small client-stamped lb summary per
  // student, never the SRS blob. Explicitly NON-AUTHORITATIVE classroom
  // display (spec CX-8): values are client-owned and tamperable — never feed
  // grades or rewards-with-teeth from this.
  // Students with no trainer_state row are omitted.
  //   → 200 { ok:true, section, deckId, rows:[{ username, realName, role, lb, updatedAt }] }
  //   → 400 bad deckId · 500 db error · 503 pre-migration
  app.get('/trainer/leaderboard/:section/:deckId', async (req, res) => {
    const { section, deckId } = req.params;
    if (!DECK_ID_RE.test(deckId)) {
      return res.status(400).json({ ok: false, error: 'bad deckId' });
    }

    const rows = await buildSectionRows(section, deckId, { includeMissing: false });
    if (rows.errorStatus) {
      return res.status(rows.errorStatus).json({ ok: false, error: rows.errorMessage });
    }

    // The board changes constantly during play — a soft 60 s cache keeps a
    // whole class refreshing the RANKS tab from hammering the table.
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({ ok: true, section, deckId, rows: rows.list });
  });

  // ── GET /trainer/section/:section/summary/:deckId ───────────────────────────
  // TEACHER ONLY via requireTeacher (x-teacher-secret OR a bearer token that
  // resolves to role='teacher'). Same rows as the leaderboard PLUS students
  // with no trainer_state row (lb:null, updatedAt:null) so the teacher sees
  // inactivity. Engagement signal built from client-stamped data — never
  // assessment evidence. Never returns full SRS state.
  //   → 200 { ok:true, section, deckId, rows:[{ username, realName, role, lb, updatedAt }] }
  //   → 400 bad deckId · 401 forbidden · 500 db error · 503 pre-migration
  app.get('/trainer/section/:section/summary/:deckId', async (req, res) => {
    // Spec CX-2: /trainer routes are Bearer/secret-only — reject requireTeacher's legacy ?token= fallback before it can run.
    if (req.query && req.query.token) {
      return res.status(401).json({ ok: false, error: 'token must be sent as Authorization: Bearer' });
    }
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { section, deckId } = req.params;
    if (!DECK_ID_RE.test(deckId)) {
      return res.status(400).json({ ok: false, error: 'bad deckId' });
    }

    const rows = await buildSectionRows(section, deckId, { includeMissing: true });
    if (rows.errorStatus) {
      return res.status(rows.errorStatus).json({ ok: false, error: rows.errorMessage });
    }

    return res.json({ ok: true, section, deckId, rows: rows.list });
  });

  // ── Shared section join ───────────────────────────────────────────────────
  // roster (filtered by section) ⟕ trainer_state (filtered by deck). The
  // leaderboard omits students without a state row; the teacher summary keeps
  // them (lb:null) so inactivity is visible.
  // Returns { list } on success, { errorStatus, errorMessage } on failure
  // (503 'trainer_state not provisioned…' pre-migration, 500 otherwise).
  async function buildSectionRows(section, deckId, { includeMissing }) {
    let students;
    try {
      const { data, error } = await db.listRoster(section);
      if (error) throw error;
      students = data || [];
    } catch (err) {
      console.error('/trainer section roster error:', err);
      return { errorStatus: 500, errorMessage: 'Database error' };
    }

    let stateRows = [];
    if (students.length > 0) {
      let data, error;
      try {
        ({ data, error } = await trainerDb.getLbByStudents(students.map(s => s.student_id), deckId));
      } catch (err) {
        error = err;
      }
      if (error) {
        if (isTrainerStateMissing(error)) {
          return { errorStatus: 503, errorMessage: 'trainer_state not provisioned (run migration 0017)' };
        }
        console.error('/trainer section state error:', error);
        return { errorStatus: 500, errorMessage: 'Database error' };
      }
      stateRows = data || [];
    }

    const stateById = new Map(stateRows.map(r => [r.student_id, r]));

    const list = [];
    for (const s of students) {
      const st = stateById.get(s.student_id);
      if (!st && !includeMissing) continue;
      list.push({
        username:  s.login_username,
        realName:  s.real_name,
        // role lets the client drop teacher rows from the student board
        // (spec §8); the teacher summary keeps them.
        role:      s.role || 'student',
        lb:        st ? (st.lb ?? null) : null,
        updatedAt: st ? st.updated_at : null
      });
    }
    return { list };
  }
}

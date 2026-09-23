// class.js — mounts teacher-gated class-wide endpoints (Gradebook Phase 4a).
// Call mountClass(app, { db, ledgerDb, loadAnswerKey, loadSkillMap, bkt }) from
// createApp(). All routes auth via x-teacher-secret (mirrors /roster/list);
// no student token is needed (the teacher holds none).
//
//   GET /class/grades?section=  →  per-student Phase-3 grade across the roster
//   GET /class/mastery?section= →  per-student mastery + class skill heatmap
//
// Pure compute is REUSED via computeGrade / computeMastery from grade.js +
// mastery.js — single source of truth, Phase-3 tests pin the math. READ-ONLY.

import { PHASE3_CONFIG, TEACHER_DIAGNOSTIC_CONFIG } from './grade-config.js';
import { answerKeyMapOrNull, skillMapValidOrNull, blooketScore, stableLedgerSort } from './scoring.js';
import { computeGrade } from './grade.js';
import { computeMastery } from './mastery.js';
import { buildGradebook } from './gradebook-grid.js';
import { todayInTz, combineV3 } from './lesson-grade.js';
import { requireTeacher } from './teacher-auth.js';
import { issueLedgerReceipt, recordReceiptPersistFailure } from './receipts.js';
import { backfillStudentReceipts } from './backfill.js';
import { computeEffort } from './doge-econ.js';
import { computeMisconceptions } from './misconceptions.js';
import { loadMisconceptionAssets } from './misconception-assets.js';
import { loadMisconceptionTriage } from './misconception-triage.js';

let receiptPersistenceNotProvisionedLogged = false;

function isReceiptPersistenceNotProvisioned(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '42703' || msg.includes('undefined_column') || msg.includes('undefined column');
}

function handleReceiptPersistenceError(err, ledgerId) {
  if (isReceiptPersistenceNotProvisioned(err)) {
    if (!receiptPersistenceNotProvisionedLogged) {
      receiptPersistenceNotProvisionedLogged = true;
      console.info('receipt persistence not provisioned; continuing without stored receipt columns');
    }
    return;
  }
  recordReceiptPersistFailure();
  console.warn('Receipt persistence failed for ledgerId:', ledgerId, err);
}

async function resolveReceiptUsername(resolveUsername, studentId) {
  if (typeof resolveUsername !== 'function') return undefined;
  try {
    const username = await resolveUsername(studentId);
    return username || undefined;
  } catch (_) {
    return undefined;
  }
}

// Pull all roster rows for the (optional) section, defensively.
// includeStaff=true keeps TEACHER accounts in the fan-out. By default they're
// excluded: a self-signup teacher has a real section (PeriodX) but is not a
// student; without this they'd show up as a blank-grade "student" in the in-Desk
// Class Gradebook + the dashboard's grades/gradebook/trainer tables. The teacher
// dashboard's Pacing Overview opts back in (includeStaff=1) so a teacher can see
// their OWN account drive the view before any student has logged in.
// (/roster/list uses db.listRoster directly, so the teacher console stays complete.)
async function listRoster(db, section, includeStaff) {
  try {
    const { data, error } = await db.listRoster(section || null);
    if (error) return { error };
    const all = Array.isArray(data) ? data : [];
    const rows = includeStaff ? all : all.filter(r => r && r.role !== 'teacher');
    return { rows };
  } catch (err) {
    return { error: err };
  }
}

// For each roster row, fetch ledger rows once. Tolerates per-student errors —
// one bad student must not 500 the whole class endpoint (a class endpoint
// fanning out is only as resilient as its weakest student row).
async function fanLedger(ledgerDb, rosterRows) {
  const out = [];
  for (const r of rosterRows) {
    const sid = r.student_id;
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(sid);
      out.push({ roster: r, ledgerRows: error ? [] : (Array.isArray(data) ? data : []), error: error || null });
    } catch (err) {
      out.push({ roster: r, ledgerRows: [], error: err });
    }
  }
  return out;
}

// Metadata only: the class workspace must not download every student's answers.
// Keep the latest attempt per item so a graded retry clears an older pending FRQ.
export function summarizeSavedWork(rows, error) {
  if (error) return { available: false, recent: [], pendingGrading: null };
  const latest = new Map();
  const ordered = rows.filter(r => r && r.item_id).slice().sort((a, b) =>
    String(b.recorded_at || '').localeCompare(String(a.recorded_at || '')) ||
    (Number(b.attempt) || 0) - (Number(a.attempt) || 0));
  for (const row of ordered) {
    const key = row.source + ':' + row.item_id;
    if (!latest.has(key)) latest.set(key, row);
  }
  const current = [...latest.values()];
  function pending(row) {
    return row.source === 'frq' && row.score == null &&
      row.response != null && String(row.response).trim() !== '';
  }
  return {
    available: true,
    pendingGrading: current.filter(pending).length,
    recent: current.slice(0, 8).map(row => ({
      itemId: row.item_id, source: row.source, recordedAt: row.recorded_at,
      score: row.score == null ? null : row.score, pendingGrading: pending(row)
    }))
  };
}

// Studentizer: roster columns → the dashboard's per-student header.
function studentMeta(r) {
  return { studentId: r.student_id, realName: r.real_name, username: r.login_username, section: r.section, role: r.role || 'student' };
}

// Per-student effort → candy: see doge-econ.js (computeEffort), shared with the
// /wallet routes so the teacher total and the kid's wallet agree.

// Parse a lessonKey like "1.2", "U1.2", or "4.1-2" into { unit, lessonKey }.
// Returns null on anything unparseable. The optional leading "U" is tolerated so
// "U1.2" and "1.2" both resolve to { unit: 1, lessonKey: "2" }.
function parseLessonKeyArg(lessonKeyRaw) {
  if (typeof lessonKeyRaw !== 'string') return null;
  const m = lessonKeyRaw.trim().match(/^U?(\d+)\.([\d-]+)$/i);
  if (!m) return null;
  return { unit: Number(m[1]), lessonKey: m[2] };
}

// Build the BLOOKET item id from a parsed lessonKey.
//   { unit:1, lessonKey:"2" }   -> "BLOOKET-U1L2"
//   { unit:4, lessonKey:"1-2" } -> "BLOOKET-U4L1-2"
function blooketItemId(unit, lessonKey) {
  return `BLOOKET-U${unit}L${lessonKey}`;
}

// Detect the "blooket source not provisioned" condition (the 0013 migration has
// not been run yet, so the source CHECK still rejects 'blooket'). Mirrors the
// sprite_hue / schoology_uid 503 precedent: only this specific pre-migration
// condition maps to 503; every other DB error is a real 500.
function isBlooketSourceMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (code === '42703') return true; // undefined_column (defensive)
  if (code === '23514') return true; // check_violation (the source CHECK rejects 'blooket')
  return msg.includes('item_ledger_source_check');
}

// First name + last initial (e.g. "Ana Smith" → "Ana S."). Friendlier and softer
// than the full name; first-name collisions stay distinguishable. Used by the
// student-facing /class/blank view so peers see a friendly label, not the opaque
// fruit_animal login or the full real name.
function friendlyLabel(realName) {
  const parts = String(realName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Someone';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return parts[0] + ' ' + last.charAt(0).toUpperCase() + '.';
}

// Bonus points go to Work only. PC is never changed by bonus application.
const BONUS_POINTS = { E: 5, P: 3, I: 1 };

function closedQuarterGrade(snapshotRow, appliedRow) {
  if (appliedRow) return { grade: Number(appliedRow.adjustedGrade), source: 'applied' };
  return { grade: snapshotRow?.frozen_grade == null ? null : Number(snapshotRow.frozen_grade), source: 'frozen' };
}

function bankedBonus(rows, quarter, snapshot) {
  const bonus = { points: 0, sheets: [], applied: null };
  for (const row of rows) {
    if (row.source !== 'bonus' && row.source !== 'bonus_applied') continue;
    let detail;
    try { detail = JSON.parse(row.response); } catch { detail = {}; }
    if (row.source === 'bonus_applied' && row.item_id === `BONUS-APPLIED-${quarter}`) {
      bonus.applied = { adjustedGrade: Number(row.score), appliedAt: detail?.appliedAt || null };
      if (snapshot && snapshot.frozen_at !== detail?.frozenAt) bonus.applied.stale = true;
    }
    if (row.source !== 'bonus' || detail?.quarter !== quarter) continue;
    const points = Number(row.score);
    if (![1, 3, 5].includes(points)) continue;
    bonus.points += points;
    bonus.sheets.push({ itemId: row.item_id, title: detail.title, grade: detail.grade, points });
  }
  return bonus;
}

function bonusAudit(roster, frozen, bonus, gates) {
  const workBefore = Number(frozen.frozen_work_avg);
  const pc = frozen.frozen_pc_avg == null ? null : Number(frozen.frozen_pc_avg) / 100;
  const frozenGrade = Number(frozen.frozen_grade);
  const workAfter = Math.min(100, workBefore + bonus.points);
  const baseBefore = Math.round(combineV3(pc, workBefore / 100, gates) * 1000) / 10;
  const residual = Math.max(0, frozenGrade - baseBefore);
  const computed = Math.round((combineV3(pc, workAfter / 100, gates) * 100 + residual) * 10) / 10;
  const floor = gates?.floor ?? PHASE3_CONFIG.v3Gates.floor;
  return {
    studentId: roster.student_id, username: roster.login_username, realName: roster.real_name,
    frozenGrade, frozenAt: frozen.frozen_at, earlyBonus: residual,
    points: bonus.points, workBefore, workAfter,
    switched: workBefore < floor * 100 && workAfter >= floor * 100,
    adjustedGrade: Math.min(100, computed), sheets: bonus.sheets.map(s => s.itemId),
  };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountClass(app, {
  db, ledgerDb, loadAnswerKey, loadSkillMap, bkt, lessonSchedule, eventSchedule = null,
  config = PHASE3_CONFIG, worksheetBlankCounts = null, verifyToken, resolveUsername,
  blooketPresence = null, blooketRequired = null, blooketLessons = null,
  loadTriage = loadMisconceptionTriage,
}) {
  const _presence = blooketPresence || blooketLessons || null;
  const _required = blooketRequired || null;

  const misconceptionCache = new Map();
  app.get('/class/misconceptions', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const section = typeof req.query.section === 'string' ? req.query.section.trim() : '';
    const days = req.query.days === undefined
      ? (config.misconceptions?.windowDays ?? TEACHER_DIAGNOSTIC_CONFIG.misconceptions.windowDays)
      : Number(req.query.days);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      return res.status(400).json({ ok: false, error: 'days must be an integer from 0 to 365' });
    }
    const cacheKey = JSON.stringify([section, days]);
    const now = Date.now();
    const cached = misconceptionCache.get(cacheKey);
    if (cached && now - cached.at < 60000) return res.json(cached.payload);
    try {
      const answerKey = answerKeyMapOrNull(await loadAnswerKey());
      if (!answerKey) throw new Error('Answer key malformed');
      const { rows, error } = await listRoster(db, section, false);
      if (error) throw error;
      const fan = await fanLedger(ledgerDb, rows);
      const payload = computeMisconceptions(fan, loadMisconceptionAssets(answerKey),
        { section, days, now, config: config.misconceptions, triage: await loadTriage() });
      for (const [key, value] of misconceptionCache) if (now - value.at >= 60000) misconceptionCache.delete(key);
      misconceptionCache.set(cacheKey, { at: now, payload });
      return res.json(payload);
    } catch (error) {
      console.error('GET /class/misconceptions error:', error);
      return res.status(500).json({ ok: false, error: 'Could not load misconceptions' });
    }
  });

  // ── GET /class/blank/:itemId ────────────────────────────────────────────────
  // STUDENT-accessible (NOT teacher-gated). Returns the requester's SECTION's
  // answers to one worksheet blank, each tagged with a friendly first-name +
  // last-initial label — NOT the full name, NOT scores, NOT other sections.
  // Powers the "📊 Class" dotplot / frequency-table drawer. Reuses item_ledger +
  // roster — no migration.
  //   Auth: Authorization: Bearer <token> OR ?token=<token>; verifyToken → studentId.
  //   → 200 { ok:true, itemId, section, total, responses:[{ answer, label }] }
  //   → 400 bad itemId · 401 forbidden (no valid token) · 500 db error
  app.get('/class/blank/:itemId', async (req, res) => {
    try {
      let token = null;
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
        token = authHeader.replace(/^Bearer\s+/i, '').trim() || null;
      }
      if (!token && typeof req.query.token === 'string' && req.query.token) token = req.query.token;

      const studentId = (token && typeof verifyToken === 'function') ? verifyToken(token) : null;
      if (!studentId) return res.status(401).json({ ok: false, error: 'forbidden' });

      const itemId = req.params.itemId;
      if (!itemId || !/^[A-Za-z0-9._-]+$/.test(itemId)) {
        return res.status(400).json({ ok: false, error: 'bad itemId' });
      }

      // The requester's section (defines "your class").
      const meRes = await db.findByStudentId(studentId);
      const me = meRes && meRes.data;
      const section = me && me.section ? me.section : null;
      if (!section) return res.json({ ok: true, itemId, section: null, total: 0, responses: [] });

      // Section roster → student_id → real_name.
      const rosterRes = await db.listRoster(section);
      const rosterRows = (rosterRes && rosterRes.data) || [];
      const nameById = {};
      rosterRows.forEach((r) => { if (r && r.student_id) nameById[r.student_id] = r.real_name || ''; });

      // Every recorded answer to this blank (worksheet source), newest first.
      const ledRes = await ledgerDb.getLedgerByItem(itemId, { source: 'worksheet' });
      const ledRows = (ledRes && ledRes.data) || [];

      // Keep the LATEST answer per IN-SECTION student.
      const seen = {};
      const responses = [];
      for (const row of ledRows) {
        if (!row || !(row.student_id in nameById)) continue;   // not in this section
        if (seen[row.student_id]) continue;                    // newest already taken
        seen[row.student_id] = true;
        const ans = (row.response === null || row.response === undefined) ? '' : String(row.response).trim();
        if (!ans) continue;
        responses.push({ answer: ans, label: friendlyLabel(nameById[row.student_id]) });
      }

      return res.json({ ok: true, itemId, section, total: responses.length, responses });
    } catch (err) {
      console.error('GET /class/blank error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // ── GET /class/grades?section= ──────────────────────────────────────────────
  // Teacher-gated. Fans out computeGrade over the roster.
  app.get('/class/grades', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    let answerKeyDoc;
    try { answerKeyDoc = await loadAnswerKey(); }
    catch (err) {
      console.error('GET /class/grades answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /class/grades answer-key malformed');
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }

    // includeStaff=1 keeps teacher accounts in the fan-out (Pacing Overview opt-in).
    const includeStaff = req.query.includeStaff === '1' || req.query.includeStaff === 'true';
    const { rows, error } = await listRoster(db, req.query.section, includeStaff);
    if (error) {
      console.error('GET /class/grades roster error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const fan = await fanLedger(ledgerDb, rows);

    const snapshots = new Map();
    if (typeof db.listQuarterSnapshot === 'function') {
      for (const quarter of ['Q1', 'Q2', 'Q3', 'Q4']) {
        const snap = await db.listQuarterSnapshot(quarter);
        if (snap.error && !isSnapshotMissing(snap.error)) {
          return res.status(500).json({ ok: false, error: 'Database error' });
        }
        for (const row of snap.data || []) snapshots.set(`${row.student_id}:${quarter}`, row);
      }
    }

    // P4b: surface the roster -> Schoology uid bridge so the grade-sync producer
    // can key its fixture by Schoology uid directly. Batched ONCE (not per
    // student) via the defensive getSchoologyUidMap. typeof-guarded so a fake
    // db / pre-bridge db without the function doesn't throw -- absent => {} =>
    // every student carries schoologyUid: null.
    const uidMap = (db && typeof db.getSchoologyUidMap === 'function')
      ? await db.getSchoologyUidMap(rows.map(r => r.student_id))
      : {};

    const todayStr = todayInTz((config && config.schoolTz) || 'America/New_York');

    const students = fan.map(({ roster, ledgerRows, error }) => {
      // Phase 6 (Codex MAJOR 1 fold): pass the lesson schedule + per-student
      // section so /class/grades uses the same lesson-weighted, date-driven
      // quarter math as /grade. Without these the teacher dashboard would
      // silently fall back to the Phase 3 unit-mean and disagree with the
      // student's own Desk pill.
      const section = roster && roster.section ? roster.section : null;
      const computed = computeGrade(ledgerRows, answerKey, config, {
        lessonSchedule,
        eventSchedule,
        section,
        worksheetBlankCounts,
        blooketPresence: _presence || undefined,
        blooketRequired: _required || undefined,
        blooketLessons: _presence || undefined,
      });
      const trainerRows = ledgerRows.filter(row => row && row.source === 'trainer');
      for (const [quarter, value] of Object.entries(computed.quarters || {})) {
        const snapshot = snapshots.get(`${roster.student_id}:${quarter}`);
        const bonus = bankedBonus(ledgerRows, quarter);
        value.closedGrade = snapshot ? closedQuarterGrade(snapshot, bonus.applied).grade : null;
        value.bonusApplied = bonus.applied;
      }
      let trainer = null;
      if (trainerRows.length) {
        const procedures = new Set();
        let scoreSum = 0;
        let scoreCount = 0;
        let lastAt = null;
        for (const row of trainerRows) {
          if (row.item_id) procedures.add(row.item_id);
          const score = Number(row.score);
          if (Number.isFinite(score)) {
            scoreSum += score;
            scoreCount += 1;
          }
          if (row.recorded_at && (!lastAt || row.recorded_at > lastAt)) lastAt = row.recorded_at;
        }
        trainer = {
          procedures: procedures.size,
          avgScore: scoreCount ? scoreSum / scoreCount : null,
          lastAt,
        };
      }
      // PACING: last activity across ALL sources (max recorded_at) — powers the
      // teacher pacing overview's "time since last session" + readiness color.
      // Additive read-only field; does not affect any grade computation.
      let lastActivityAt = null;
      for (const row of ledgerRows) {
        const ts = row && row.recorded_at;
        if (ts && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
      }
      // Merge schoologyUid at the call site so studentMeta stays a pure
      // roster->header map (do NOT touch studentMeta).
      // gradebook: the in-app "1:1 Schoology gradebook" grid (additive) — the
      // teacher class grid renders per-student component cells + both totals.
      // lessonSchedule + section + today stamp each column's `due` for date-gating.
      return {
        ...studentMeta(roster),
        schoologyUid: uidMap[roster.student_id] ?? null,
        ...computed,
        trainer,
        lastActivityAt,
        ...(req.query.includeSavedWork === '1' ? { savedWork: summarizeSavedWork(ledgerRows, error) } : {}),
        effort: computeEffort(ledgerRows),   // DOGE wallet: effort points → candy
        gradebook: buildGradebook(computed, { lessonSchedule, eventSchedule, section, todayStr }),
      };
    });

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      section: req.query.section || null,
      students,
      config: {
        C: config.C,
        feederWeights: config.feederWeights,
        frqBand: config.frqBand,
        quarters: config.quarters,
      },
    });
  });

  // ── Quarter close (freeze) + bonus deltas (PC makeup [D]) ─────────────────────
  // The freeze/delta pair. Close SNAPSHOTS each student's quarter grade (the
  // authoritative closed-quarter record the teacher enters into Schoology); deltas
  // surface post-close improvements (current - frozen) as extra-credit candidates.
  // Neither changes how grades COMPUTE — the live engine is untouched, so M2b /
  // the grade-invariance tests are unaffected. Best-wins-at-write (Phase 2 /pc
  // submit) means the live grade only rises post-close, so a delta is always a
  // positive bonus candidate, never a drop the freeze would have to shield.

  // Fan computeGrade over the roster → [{ roster, computed }], or { error }.
  async function fanGrades(section) {
    let answerKeyDoc;
    try { answerKeyDoc = await loadAnswerKey(); } catch (_) { return { error: 'answer-key' }; }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) return { error: 'answer-key' };
    const { rows, error } = await listRoster(db, section, false);
    if (error) return { error: 'roster' };
    const fan = await fanLedger(ledgerDb, rows);
    const graded = fan.map(({ roster, ledgerRows }) => ({
      roster,
      ledgerRows,
      computed: computeGrade(ledgerRows, answerKey, config, {
        lessonSchedule,
        eventSchedule,
        section: roster && roster.section ? roster.section : null,
        worksheetBlankCounts,
        blooketPresence: _presence || undefined,
        blooketRequired: _required || undefined,
        blooketLessons: _presence || undefined,
      }),
    }));
    return { graded };
  }

  // Best-effort acting-teacher name for the closed_by audit field.
  async function closedByUsername(req) {
    try {
      const auth = req.headers['authorization'] || '';
      const m = /^Bearer\s+(.+)$/i.exec(auth);
      if (m && typeof verifyToken === 'function') {
        const sid = verifyToken(m[1].trim());
        if (sid) { const { data } = await db.findByStudentId(sid); if (data && data.login_username) return data.login_username; }
      }
    } catch (_) { /* best-effort */ }
    return 'teacher';
  }

  const QUARTER_RE = /^Q[1-4]$/;
  function isSnapshotMissing(err) {
    return !!err && (err.code === '42P01' || String(err.message || '').includes('quarter_grade_snapshot'));
  }

  // Banked bonus is Work-track only; these routes never add points to PC.
  app.post('/class/bonus', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const { sheetId, title, section, entries } = req.body || {};
    const quarter = String(req.body?.quarter || '').toUpperCase();
    if (typeof sheetId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(sheetId) ||
        typeof title !== 'string' || !title.trim() || !QUARTER_RE.test(quarter) || !Array.isArray(entries)) {
      return res.status(400).json({ ok: false, error: 'sheetId, title, quarter (Q1..Q4), and entries required' });
    }
    const roster = await listRoster(db, section, false);
    if (roster.error) return res.status(500).json({ ok: false, error: 'Database error' });
    let written = 0;
    const errors = [];
    for (const [index, entry] of entries.entries()) {
      const matches = roster.rows.filter(r => entry?.studentId
        ? r.student_id === entry.studentId
        : typeof entry?.username === 'string' && r.login_username === entry.username.trim());
      if (matches.length !== 1 || !Object.hasOwn(BONUS_POINTS, entry?.grade)) {
        errors.push({ index, error: matches.length !== 1 ? 'unknown or ambiguous student' : 'grade must be E, P, or I' });
        continue;
      }
      try {
        const { error } = await ledgerDb.insertLedgerRow({
          studentId: matches[0].student_id, source: 'bonus', itemId: `BONUS-${sheetId}`,
          score: BONUS_POINTS[entry.grade], attempt: 1, evidenceTier: 'practice',
          response: JSON.stringify({ grade: entry.grade, quarter, title: title.trim() }),
        });
        if (error) throw error;
        written += 1;
      } catch (error) {
        const missing = isBlooketSourceMissing(error);
        return res.status(missing ? 503 : 500).json({ ok: false, sheetId, quarter, written, errors,
          error: missing ? 'bonus sources not provisioned — run migration 0036' : 'Database error' });
      }
    }
    return res.json({ ok: true, sheetId, quarter, written, errors });
  });

  app.post('/class/quarter/apply-bonus', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const body = req.body || {};
    const quarter = String(body.quarter || '').toUpperCase();
    const dryRun = body.dryRun !== false;
    if (!QUARTER_RE.test(quarter)) return res.status(400).json({ ok: false, error: 'quarter (Q1..Q4) required' });
    const rows = [], skipped = [];
    let applied = 0;
    try {
      const snap = await db.listQuarterSnapshot(quarter);
      if (snap.error) throw snap.error;
      const roster = await listRoster(db, body.section, false);
      if (roster.error) throw roster.error;
      const frozenById = new Map((snap.data || []).map(r => [r.student_id, r]));
      for (const student of roster.rows) {
        const frozen = frozenById.get(student.student_id);
        if (!frozen) continue;
        const ledger = await ledgerDb.getLedgerByStudent(student.student_id);
        if (ledger.error) throw ledger.error;
        const bonus = bankedBonus(ledger.data || [], quarter, frozen);
        if (bonus.applied) {
          skipped.push({ studentId: student.student_id, username: student.login_username,
            reason: 'already applied', applied: bonus.applied });
          continue;
        }
        if (!bonus.points) continue;
        const audit = bonusAudit(student, frozen, bonus, config.v3Gates);
        rows.push(audit);
        if (dryRun) continue;
        const { studentId, username, realName, ...detail } = audit;
        const { inserted, error } = await ledgerDb.insertLedgerRowIfAbsent({
          studentId, source: 'bonus_applied', itemId: `BONUS-APPLIED-${quarter}`,
          score: audit.adjustedGrade, attempt: 1, evidenceTier: 'practice',
          response: JSON.stringify({ ...detail, appliedAt: new Date().toISOString() }),
        });
        if (error) throw error;
        if (inserted) applied += 1;
        else skipped.push({ studentId, username, reason: 'already applied' });
      }
    } catch (error) {
      const snapshotMissing = isSnapshotMissing(error);
      const sourceMissing = isBlooketSourceMissing(error);
      return res.status(snapshotMissing || sourceMissing ? 503 : 500).json({
        ok: false, quarter, dryRun, rows, applied, skipped,
        error: snapshotMissing ? 'quarter_grade_snapshot not provisioned — run migration 0030'
          : sourceMissing ? 'bonus sources not provisioned — run migration 0036' : 'Database error',
      });
    }
    return res.json({ ok: true, quarter, dryRun, rows, applied, skipped });
  });

  // POST /class/quarter/close { quarter, section? } — freeze the quarter grade for
  // every student. Idempotent: the FIRST close of a (student, quarter) wins.
  app.post('/class/quarter/close', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const body = req.body || {};
    const quarter = String(body.quarter || '').toUpperCase();
    if (!QUARTER_RE.test(quarter)) return res.status(400).json({ ok: false, error: 'quarter (Q1..Q4) required' });

    const fg = await fanGrades(body.section);
    if (fg.error) return res.status(500).json({ ok: false, error: fg.error === 'answer-key' ? 'Answer key unavailable' : 'Database error' });

    const closedBy = await closedByUsername(req);
    // Only freeze students who actually HAVE a grade for the quarter. Freezing a
    // null (no work / quarter not started) would trap them at null immutably — so
    // a mistaken early close is a harmless no-op, and a real close later freezes
    // each student the first time their grade exists (first-close-wins per row).
    const snapRows = fg.graded.map(({ roster, computed }) => {
      const q = computed && computed.quarters && computed.quarters[quarter];
      return {
        studentId: roster.student_id,
        loginUsername: roster.login_username || null,
        quarter,
        frozenGrade: q ? (q.quarterGrade ?? null) : null,
        frozenPcAvg: q ? (q.pcAvg ?? null) : null,
        frozenWorkAvg: q ? (q.workAvg ?? null) : null,
        closedBy,
      };
    }).filter((r) => r.frozenGrade != null);

    const { data, error } = await db.snapshotQuarter(snapRows);
    if (error) {
      if (isSnapshotMissing(error)) return res.status(503).json({ ok: false, error: 'quarter_grade_snapshot not provisioned — run migration 0030' });
      console.error('POST /class/quarter/close error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.json({ ok: true, quarter, considered: fg.graded.length, gradeable: snapRows.length, frozen: Array.isArray(data) ? data.length : 0 });
  });

  // GET /class/quarter/deltas?quarter=&section= — per-student current vs frozen,
  // POSITIVE deltas only (improvement since close), biggest first.
  app.get('/class/quarter/deltas', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const quarter = String(req.query.quarter || '').toUpperCase();
    if (!QUARTER_RE.test(quarter)) return res.status(400).json({ ok: false, error: 'quarter (Q1..Q4) required' });

    const snap = await db.listQuarterSnapshot(quarter);
    if (snap.error) {
      if (isSnapshotMissing(snap.error)) return res.status(503).json({ ok: false, error: 'quarter_grade_snapshot not provisioned — run migration 0030' });
      console.error('GET /class/quarter/deltas snapshot error:', snap.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const frozenById = Object.create(null);
    (snap.data || []).forEach((r) => { if (r && r.student_id) frozenById[r.student_id] = r; });

    const fg = await fanGrades(req.query.section);
    if (fg.error) return res.status(500).json({ ok: false, error: fg.error === 'answer-key' ? 'Answer key unavailable' : 'Database error' });

    const deltas = fg.graded.map(({ roster, computed, ledgerRows }) => {
      const fr = frozenById[roster.student_id];
      if (!fr) return null; // not frozen for this quarter
      const bonus = bankedBonus(ledgerRows, quarter, fr);
      const q = computed && computed.quarters && computed.quarters[quarter];
      const current = q ? (q.quarterGrade ?? null) : null;
      // PostgREST serializes a `numeric` column as a STRING — coerce explicitly so
      // the math never rides on implicit string→number coercion.
      const frozen = fr.frozen_grade == null ? null : Number(fr.frozen_grade);
      if (frozen == null || !Number.isFinite(frozen) || (current == null && !bonus.points)) return null;
      const delta = current == null ? 0 : Math.round((current - frozen) * 10) / 10;
      return {
        studentId: roster.student_id,
        realName: roster.real_name || null,
        username: roster.login_username || null,
        frozen: Math.round(frozen * 10) / 10,
        closed: closedQuarterGrade(fr, bonus.applied).grade,
        current: current == null ? null : Math.round(current * 10) / 10,
        delta,
        bonus,
      };
    }).filter((d) => d && (d.delta > 0 || d.bonus.points > 0));
    deltas.sort((a, b) => b.delta - a.delta);

    // frozenCount scoped to the queried section (how many of THESE students are frozen).
    const frozenCount = fg.graded.filter((g) => g.roster && frozenById[g.roster.student_id]).length;
    return res.json({ ok: true, quarter, frozenCount, deltas });
  });

  // -- POST /class/blooket -- teacher-gated Blooket grade import ---------------
  // Body: { lessonKey: "1.2", total: <int>, section?: <str>,
  //         entries: [{ studentId, correct, attempted }] }
  // Computes blooketScore (0..1) per entry and writes source='blooket' rows via
  // the SAME ledger insert /ledger/record uses (attempt=1 so a re-import upserts
  // onto (student_id, source, item_id, attempt)). Malformed entries are collected
  // in `errors` and skipped -- one bad row never 500s the batch. Until migration
  // 0013 runs, the source CHECK rejects 'blooket' -> 503 (mirrors the sprite-hue /
  // schoology-uid pre-migration precedent).
  app.post('/class/blooket', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const body = req.body || {};
    const parsed = parseLessonKeyArg(body.lessonKey);
    if (!parsed) {
      return res.status(400).json({ ok: false, error: 'lessonKey must look like "1.2", "U1.2", or "4.1-2"' });
    }
    const total = Number(body.total);
    if (!Number.isInteger(total) || total <= 0) {
      return res.status(400).json({ ok: false, error: 'total must be a positive integer' });
    }
    if (!Array.isArray(body.entries)) {
      return res.status(400).json({ ok: false, error: 'entries must be an array' });
    }

    const itemId = blooketItemId(parsed.unit, parsed.lessonKey);
    const unitLabel = `U${parsed.unit}`;

    let recorded = 0;
    let skipped = 0;
    const receipts = {};
    const errors = [];

    for (let i = 0; i < body.entries.length; i++) {
      const entry = body.entries[i] || {};
      const studentId = entry.studentId;
      const correct = Number(entry.correct);
      const attempted = Number(entry.attempted);

      // Validate (malformed -> collect, don't 500). studentId required;
      // correct/attempted finite >= 0.
      if (typeof studentId !== 'string' || !studentId) {
        skipped += 1;
        errors.push({ index: i, error: 'missing studentId' });
        continue;
      }
      if (!Number.isFinite(correct) || correct < 0 || !Number.isFinite(attempted) || attempted < 0) {
        skipped += 1;
        errors.push({ index: i, studentId, error: 'correct/attempted must be finite numbers >= 0' });
        continue;
      }

      const score = blooketScore(correct, attempted, total);

      let error;
      let data;
      try {
        const result = await ledgerDb.insertLedgerRow({
          studentId,
          source: 'blooket',
          itemId,
          unit: unitLabel,
          response: { correct, attempted, total },
          score,
          evidenceTier: 'practice', // teacher-imported in-class work; matches other recorded rows (no cap-tier effect)
          attempt: 1,
        });
        data = result && result.data;
        error = result && result.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        if (isBlooketSourceMissing(error)) {
          return res.status(503).json({ ok: false, error: 'blooket source not provisioned' });
        }
        console.error('POST /class/blooket insert error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }

      recorded += 1;
      const username = await resolveReceiptUsername(resolveUsername, studentId);
      const receipt = issueLedgerReceipt({
        studentId,
        username,
        source: 'blooket',
        itemId,
        score,
        attempt: 1,
        evidenceTier: 'practice',
        response: { correct, attempted, total }
      });
      if (receipt) {
        receipts[`${itemId}:${studentId}`] = receipt;
        if (data && data.ledger_id && ledgerDb && typeof ledgerDb.updateLedgerReceipt === 'function') {
          try {
            const persistResult = await ledgerDb.updateLedgerReceipt(data.ledger_id, {
              receiptId: receipt.receiptId,
              receiptCompact: receipt.compact
            });
            if (persistResult && persistResult.error) {
              handleReceiptPersistenceError(persistResult.error, data.ledger_id);
            }
          } catch (err) {
            handleReceiptPersistenceError(err, data.ledger_id);
          }
        }
      }
    }

    const bodyOut = { ok: true, itemId, recorded, skipped, errors };
    if (Object.keys(receipts).length) bodyOut.receipts = receipts;
    return res.json(bodyOut);
  });

  app.post('/class/backfill-receipts', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { rows, error } = await listRoster(db, req.query.section);
    if (error) {
      console.error('POST /class/backfill-receipts roster error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let studentsProcessed = 0;
    let receiptsBackfilled = 0;
    const errors = [];

    for (const rosterRow of rows) {
      const studentId = rosterRow && rosterRow.student_id;
      if (!studentId) continue;

      studentsProcessed += 1;
      try {
        const ledgerResult = await ledgerDb.getLedgerByStudent(studentId);
        if (ledgerResult && ledgerResult.error) {
          errors.push({ studentId, error: ledgerResult.error.message || String(ledgerResult.error) });
          continue;
        }

        const ledgerRows = stableLedgerSort(
          ledgerResult && Array.isArray(ledgerResult.data) ? ledgerResult.data : []
        );
        const result = await backfillStudentReceipts(ledgerRows, ledgerDb, rosterRow.login_username);
        receiptsBackfilled += result.receiptsBackfilled;
        for (const rowError of result.errors) errors.push({ studentId, ...rowError });
      } catch (err) {
        errors.push({ studentId, error: err && err.message ? err.message : String(err || 'Backfill failed') });
      }
    }

    return res.json({ ok: true, studentsProcessed, receiptsBackfilled, errors });
  });

  // ── GET /class/mastery?section= ─────────────────────────────────────────────
  // Teacher-gated. Fans out computeMastery + builds the class skill heatmap.
  // Only mounts when the diagnostic deps are present (loadSkillMap + bkt).
  if (!loadSkillMap || !bkt) return;

  app.get('/class/mastery', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    let answerKeyDoc, skillMap;
    try { answerKeyDoc = await loadAnswerKey(); }
    catch (err) {
      console.error('GET /class/mastery answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /class/mastery answer-key malformed');
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }
    try { skillMap = await loadSkillMap(); }
    catch (err) {
      console.error('GET /class/mastery skill-map error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load skill map' });
    }
    if (!skillMapValidOrNull(skillMap)) {
      console.error('GET /class/mastery skill-map malformed');
      return res.status(500).json({ ok: false, error: 'Skill map malformed' });
    }

    if (!bkt || typeof bkt.updateMastery !== 'function') {
      return res.status(500).json({ ok: false, error: 'Diagnostic engine unavailable' });
    }

    const { rows, error } = await listRoster(db, req.query.section);
    if (error) {
      console.error('GET /class/mastery roster error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const fan = await fanLedger(ledgerDb, rows);
    const students = fan.map(({ roster, ledgerRows }) => {
      const computed = computeMastery(ledgerRows, answerKey, skillMap, bkt, config);
      return { ...studentMeta(roster), ...computed };
    });

    // ── Class skill heatmap ───────────────────────────────────────────────────
    // For each skill encountered: total = students with observations in that
    // skill; weak = students whose folded pKnow < θ; pctWeak = weak/total.
    const heatmap = {};
    for (const s of students) {
      const weakSet = new Set(s.weakSkills || []);
      for (const skill of Object.keys(s.skills || {})) {
        const h = heatmap[skill] || (heatmap[skill] = { weak: 0, total: 0, pctWeak: null });
        h.total += 1;
        if (weakSet.has(skill)) h.weak += 1;
      }
    }
    for (const skill of Object.keys(heatmap)) {
      const h = heatmap[skill];
      h.pctWeak = h.total > 0 ? Math.round((h.weak / h.total) * 1000) / 10 : null;
    }
    // Stable sorted skill order.
    const heatmapOut = {};
    for (const skill of Object.keys(heatmap).sort()) heatmapOut[skill] = heatmap[skill];

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      section: req.query.section || null,
      theta: config.diagnosticTheta,
      students,
      heatmap: heatmapOut,
    });
  });
}

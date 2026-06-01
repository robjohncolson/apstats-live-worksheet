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

import { PHASE3_CONFIG } from './grade-config.js';
import { answerKeyMapOrNull, skillMapValidOrNull, blooketScore } from './scoring.js';
import { computeGrade } from './grade.js';
import { computeMastery } from './mastery.js';
import { requireTeacher } from './teacher-auth.js';

// Pull all roster rows for the (optional) section, defensively.
async function listRoster(db, section) {
  try {
    const { data, error } = await db.listRoster(section || null);
    if (error) return { error };
    return { rows: Array.isArray(data) ? data : [] };
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

// Studentizer: roster columns → the dashboard's per-student header.
function studentMeta(r) {
  return { studentId: r.student_id, realName: r.real_name, username: r.login_username, section: r.section };
}

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

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountClass(app, { db, ledgerDb, loadAnswerKey, loadSkillMap, bkt, lessonSchedule, config = PHASE3_CONFIG, worksheetBlankCounts = null }) {

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

    const { rows, error } = await listRoster(db, req.query.section);
    if (error) {
      console.error('GET /class/grades roster error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const fan = await fanLedger(ledgerDb, rows);

    // P4b: surface the roster -> Schoology uid bridge so the grade-sync producer
    // can key its fixture by Schoology uid directly. Batched ONCE (not per
    // student) via the defensive getSchoologyUidMap. typeof-guarded so a fake
    // db / pre-bridge db without the function doesn't throw -- absent => {} =>
    // every student carries schoologyUid: null.
    const uidMap = (db && typeof db.getSchoologyUidMap === 'function')
      ? await db.getSchoologyUidMap(rows.map(r => r.student_id))
      : {};

    const students = fan.map(({ roster, ledgerRows }) => {
      // Phase 6 (Codex MAJOR 1 fold): pass the lesson schedule + per-student
      // section so /class/grades uses the same lesson-weighted, date-driven
      // quarter math as /grade. Without these the teacher dashboard would
      // silently fall back to the Phase 3 unit-mean and disagree with the
      // student's own Desk pill.
      const computed = computeGrade(ledgerRows, answerKey, config, {
        lessonSchedule,
        section: roster && roster.section ? roster.section : null,
        worksheetBlankCounts,
      });
      // Merge schoologyUid at the call site so studentMeta stays a pure
      // roster->header map (do NOT touch studentMeta).
      return { ...studentMeta(roster), schoologyUid: uidMap[roster.student_id] ?? null, ...computed };
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
    }

    return res.json({ ok: true, itemId, recorded, skipped, errors });
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

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
import { answerKeyMapOrNull, skillMapValidOrNull } from './scoring.js';
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
      return { ...studentMeta(roster), ...computed };
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

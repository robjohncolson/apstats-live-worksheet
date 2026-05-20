// grade.js — mounts GET /grade onto an Express app (Gradebook Phase 3+6).
// Call mountGrade(app, { verifyToken, ledgerDb, loadAnswerKey, lessonSchedule }) from createApp().
//
// Phase 3: unitGrade(u) = max( min(B(u), C=85), P(u) )
// Phase 6 additions:
//   - lessons[] array on the response (per-lesson grade breakdown)
//   - quarters[].quarterGrade is REPLACED with lesson-weighted, date-driven calc
//   - quarters[].lessonsDue / lessonsGraded / lessonsTotal added
//   - Quarter bands updated: Q1=[1,2,3], Q2=[4,5], Q3=[6,7], Q4=[8,9]
//
// The `units` field on the response is UNCHANGED in shape and values
// (teacher dashboard via class.js fans out computeGrade and reads it).

import {
  PHASE3_CONFIG,
  unitNumber,
  quarterOfUnit,
  pcRawToP,
} from './grade-config.js';
import {
  latestPerItem,
  unitOf,
  answerKeyMapOrNull,
  scoreAgainstKey,
} from './scoring.js';
import {
  computeLessonGrades,
  computeQuarterFromLessons,
  buildLessonsArray,
  todayInTz,
  sectionToPeriod,
} from './lesson-grade.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractToken(req) {
  const authHeader =
    typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const q = req.query?.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

// Resolve a worksheet/frq row's unit: prefer the recorded `unit` column
// (DN2b stamps "U4"), else parse the item_id ("WS-U4L1-2-reflect1" → U4).
function unitKeyOf(row) {
  if (row && row.unit != null && String(row.unit).trim() !== '') {
    const n = unitNumber(row.unit);
    if (n != null) return `U${n}`;
  }
  return unitOf(row?.item_id, null);
}

// DN2b records frq score ∈ {1,0.5,0} (E/P/I). Remap to the teacher band.
// Tolerant of float noise: nearest of E(1)/P(0.5)/I(0). A null/blank/non-
// numeric score = "recorded but not gradable" → excluded from the W
// denominator (completion-only). NOTE: Number(null)===0 (finite), so the
// nullish guard MUST precede Number() or an ungraded FRQ would score as I.
function frqScoreToPct(score, frqBand) {
  if (score === null || score === undefined || score === '') return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 0.75) return frqBand.E;
  if (s >= 0.25) return frqBand.P;
  return frqBand.I;
}

// ── Pure compute (extracted for class fan-out reuse; behaviour-identical) ────
// computeGrade(ledgerRows, answerKey, config, opts) → { units, quarters, completion, lessons }
// Phase-3 tests pin behaviour; class.js fans out over the roster calling this.
// opts.lessonSchedule: the lesson-schedule.json .lessons map (or null for graceful degrade).
// opts.section: student's section string (e.g. "PeriodB") for date filter.
export function computeGrade(ledgerRows, answerKey, config = PHASE3_CONFIG, opts = {}) {
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];
  const bySource = (s) => rows.filter((r) => r && r.source === s);

  // ── Q: cr-quiz correctness % per unit (re-scored vs key) ─────────────────
  const qAgg = scoreAgainstKey(bySource('curriculum_quiz'), answerKey);
  // ── PC raw %: proctored Progress Check, re-scored vs key ─────────────────
  const pcAgg = scoreAgainstKey(bySource('pc'), answerKey);

  // ── W: AI-FRQ pct per unit (worksheet fill-ins = completion-only, §5) ────
  const wByUnit = {};       // U# → { sum, n }
  for (const row of latestPerItem(bySource('frq'))) {
    const pct = frqScoreToPct(row.score, config.frqBand);
    if (pct == null) continue; // not yet graded → excluded from W denominator
    const u = unitKeyOf(row);
    const w = wByUnit[u] || (wByUnit[u] = { sum: 0, n: 0 });
    w.sum += pct;
    w.n += 1;
  }

  // ── Completion readout (SEPARATE accountability, NOT the grade) ──────────
  const completion = {};
  const bumpCompletion = (u, src) => {
    const c = completion[u] || (completion[u] = { worksheet: 0, frq: 0, curriculum_quiz: 0, pc: 0 });
    if (src in c) c[src] += 1;
  };
  for (const src of ['worksheet', 'frq']) {
    for (const row of latestPerItem(bySource(src))) bumpCompletion(unitKeyOf(row), src);
  }
  for (const row of latestPerItem(bySource('curriculum_quiz'))) {
    bumpCompletion(unitOf(row.item_id, answerKey[row.item_id]), 'curriculum_quiz');
  }
  for (const row of latestPerItem(bySource('pc'))) {
    bumpCompletion(unitOf(row.item_id, answerKey[row.item_id]), 'pc');
  }

  // ── Per-unit grade math ──────────────────────────────────────────────────
  const allUnitKeys = new Set([
    ...Object.keys(qAgg.units),
    ...Object.keys(pcAgg.units),
    ...Object.keys(wByUnit),
    ...Object.keys(completion),
  ]);

  const C = config.C;
  const { W: wWeight, Q: qWeight } = config.feederWeights;

  const units = {};
  for (const uKey of allUnitKeys) {
    const unitNum = unitNumber(uKey);

    const W = wByUnit[uKey] ? Math.round((wByUnit[uKey].sum / wByUnit[uKey].n) * 10) / 10 : null;
    const Q = qAgg.units[uKey] ? qAgg.units[uKey].pct : null;

    let B = null;
    {
      let num = 0, den = 0;
      if (W != null) { num += wWeight * W; den += wWeight; }
      if (Q != null) { num += qWeight * Q; den += qWeight; }
      if (den > 0) B = Math.round((num / den) * 10) / 10;
    }
    const banked = B == null ? null : Math.round(Math.min(B, C) * 10) / 10;

    const pcRawPct = pcAgg.units[uKey] ? pcAgg.units[uKey].pct : null;
    const q = unitNum == null ? null : quarterOfUnit(unitNum, config);
    const P = q ? pcRawToP(pcRawPct, config.quarters[q].pcAnchor) : 0;

    const graded = banked != null || P > 0;
    const unitGrade = graded
      ? Math.round(Math.max(banked == null ? 0 : banked, P) * 10) / 10
      : null;

    units[uKey] = { W, Q, B, banked, pcRawPct, P, unitGrade, graded };
  }

  // ── Phase 6: lesson-level aggregation + date-driven quarter grade ─────────
  //
  // The schedule is passed via opts.lessonSchedule. If missing or malformed,
  // we degrade gracefully: every lesson treated as "due" (no date filter),
  // using the old unit-mean quarter grade as the lesson-weighted result.
  const schedule = (opts && opts.lessonSchedule) || null;
  const section  = (opts && opts.section) || null;
  const schoolTz = (config && config.schoolTz) || 'America/New_York';
  const todayStr = todayInTz(schoolTz);

  // Compute per-lesson grades from all ledger rows (latest-per-item already
  // handled inside computeLessonGrades for the sources it cares about).
  // Codex MAJOR 2 fold 2026-05-20: when schedule is null we still populate
  // lessonMap — `expandLessonKey` synthesizes a "{unit}.{lessonKey}" topicKey
  // so the lesson-level math works without a schedule. The fallback in the
  // quarter-aggregation block (below) then iterates this populated map and
  // produces a lesson-weighted quarter grade, not the old unit-mean.
  const allLatestRows = latestPerItem(rows);
  const lessonMap = computeLessonGrades(allLatestRows, config.frqBand, answerKey, schedule);

  // ── Per-unit PC data needed for quarter-level P_quarter ──────────────────
  // Build unitPcData: unitNum → { P }
  const unitPcData = {};
  for (const uKey of Object.keys(units)) {
    const uNum = unitNumber(uKey);
    if (uNum != null) {
      unitPcData[uNum] = { P: units[uKey].P || 0 };
    }
  }

  // ── Per-quarter lesson-weighted grade ─────────────────────────────────────
  const quarters = {};
  for (const qKey of Object.keys(config.quarters)) {
    const band = config.quarters[qKey].units;
    const pcAnchor = config.quarters[qKey].pcAnchor;

    // Unit-level data (UNCHANGED — teacher dashboard reads this).
    const unitGrades = {};
    for (const n of band) {
      const uKey = `U${n}`;
      unitGrades[uKey] = units[uKey] ? units[uKey].unitGrade : null;
    }

    // P_quarter = mean of P_unit over band units that have PC data; 0 otherwise.
    // Each P_unit = pcRawToP(unit's PC raw%, quarter's pcAnchor).
    let P_quarter = 0;
    let pcUnitCount = 0;
    for (const n of band) {
      const uKey = `U${n}`;
      const pcRaw = units[uKey] ? units[uKey].pcRawPct : null;
      const P_unit = pcRawToP(pcRaw, pcAnchor);
      if (P_unit > 0) {
        P_quarter += P_unit;
        pcUnitCount += 1;
      }
    }
    if (pcUnitCount > 0) P_quarter = P_quarter / pcUnitCount;

    // Lesson-weighted date-driven quarter grade (Phase 6).
    let qResult;
    if (schedule) {
      qResult = computeQuarterFromLessons({
        quarterBand: band,
        lessonMap,
        schedule,
        todayDateStr: todayStr,
        section,
        pcBandData: { P_quarter },
        C,
      });
    } else {
      // Codex MAJOR 2 fold (2026-05-20): the contract says missing schedule
      // should disable only the DATE FILTER, not revert to old unit-mean.
      // Use lesson-level aggregation over the lessons we can SEE in the
      // ledger (parsed from item_ids), treating each parsed lesson as "due"
      // (no date filter). This preserves the lesson-weighted shape so the
      // teacher dashboard and student pill don't disagree on math just
      // because the bundled schedule file is missing.
      //
      // Note: without a schedule we don't know UNATTEMPTED lessons exist —
      // the denominator is only the lessons present in lessonMap whose unit
      // is in the band. That's a softer "current quality at lesson level"
      // grade, not the strict "ungraded-due counted as 0" semantics.
      const vals = [];
      for (const [topicKey, result] of lessonMap.entries()) {
        const m = /^(\d+)\./.exec(topicKey);
        if (!m) continue;
        const unitNum = Number(m[1]);
        if (!band.includes(unitNum)) continue;
        if (result && result.lessonGrade != null) vals.push(result.lessonGrade);
      }
      const rawQ = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
      const bankedQ = rawQ == null ? null : Math.round(Math.min(rawQ, C) * 10) / 10;
      const qGrade = rawQ == null && P_quarter === 0
        ? null
        : Math.round(Math.max(bankedQ == null ? 0 : bankedQ, P_quarter) * 10) / 10;
      qResult = {
        quarterGrade: qGrade,
        ceiling: null,            // no ceiling without a schedule denominator
        lessonsDue: null,         // not knowable without schedule
        lessonsGraded: vals.length,
        lessonsTotal: null,       // not knowable without schedule
      };
    }

    const unitsGraded = Object.values(unitGrades).filter(v => v != null).length;

    quarters[qKey] = {
      units: band,
      unitGrades,
      quarterGrade: qResult.quarterGrade,
      unitsGraded,
      unitsTotal: band.length,
      ceiling: qResult.ceiling,
      // Phase 6 additions:
      lessonsDue: qResult.lessonsDue,
      lessonsGraded: qResult.lessonsGraded,
      lessonsTotal: qResult.lessonsTotal,
    };
  }

  // ── Phase 6: build the lessons[] array ────────────────────────────────────
  const lessons = schedule ? buildLessonsArray(lessonMap, schedule) : [];

  // Stable sorted unit / completion order.
  const unitsOut = {};
  for (const u of Object.keys(units).sort()) unitsOut[u] = units[u];
  const completionOut = {};
  for (const u of Object.keys(completion).sort()) completionOut[u] = completion[u];

  return { units: unitsOut, quarters, completion: completionOut, lessons };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountGrade(app, { verifyToken, ledgerDb, loadAnswerKey, lessonSchedule, db, config = PHASE3_CONFIG }) {

  // GET /grade
  //   Auth: roster token (Authorization: Bearer <t> OR ?token=).
  //   → 200 { ok, asOf, config, units, quarters, completion, lessons }
  //   Read-only w.r.t. item_ledger.
  app.get('/grade', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }
    const studentId = verifyToken(rawToken);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    let ledgerResult;
    try {
      ledgerResult = await ledgerDb.getLedgerByStudent(studentId);
    } catch (err) {
      console.error('GET /grade ledger error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const { data: ledgerRows, error: ledgerError } = ledgerResult || {};
    if (ledgerError) {
      console.error('GET /grade ledger error:', ledgerError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let answerKeyDoc;
    try {
      answerKeyDoc = await loadAnswerKey();
    } catch (err) {
      console.error('GET /grade answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /grade answer-key malformed:', typeof answerKeyDoc);
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }

    // Resolve the student's section for the lesson-due date filter.
    // BLOCKER fold (Codex 2026-05-20): the ledger doesn't persist `section`,
    // so the previous "scan ledger rows" pattern always fell through to the
    // B/E union. Look up the roster row by student_id instead — that's the
    // only source of truth for section.
    let section = null;
    if (db && typeof db.findByStudentId === 'function') {
      try {
        const { data: rosterRow } = await db.findByStudentId(studentId);
        if (rosterRow && rosterRow.section) section = rosterRow.section;
      } catch (_) {
        // section stays null → date filter uses union of B+E (defensive degrade)
      }
    }

    const { units, quarters, completion, lessons } = computeGrade(
      ledgerRows,
      answerKey,
      config,
      { lessonSchedule, section }
    );

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      config: {
        C: config.C,
        feederWeights: config.feederWeights,
        frqBand: config.frqBand,
        quarters: config.quarters,
      },
      units,
      quarters,
      completion,
      lessons,
    });
  });
}

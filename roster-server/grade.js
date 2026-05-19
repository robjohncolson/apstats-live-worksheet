// grade.js — mounts GET /grade onto an Express app (Gradebook Phase 3).
// Call mountGrade(app, { verifyToken, ledgerDb, loadAnswerKey }) from createApp().
//
// Implements the FROZEN model (GRADEBOOK_PHASE3_BUILD.md §1 + §5,
// GRADEBOOK_GRADING_SPEC.md v2 §2):
//
//   unitGrade(u) = max( min(B(u), C=85), P(u) )
//   B(u)        = weighted mean over PRESENT feeders, weights renormalized
//                 (follow-along W : cr-quiz Q = 1 : 2)
//   W(u)        = mean AI-FRQ pct (E/P/I → 100/70/35); worksheet fill-ins are
//                 completion-only (no score recorded — §5)
//   Q(u)        = cr-quiz correct/graded ×100 (re-scored vs bundled key)
//   P(u)        = quarter-anchor curve over PC raw% (re-scored vs key);
//                 ONLY EVER RAISES (sits inside max); no PC ⇒ P=0
//   quarterGrade= mean(unitGrade) over graded units in the quarter's band
//
// Server-authoritative + READ-ONLY w.r.t. item_ledger. No grade is ever
// lowered by a bad PC (asymmetry preserved). Completion is a SEPARATE
// accountability readout, never folded into the grade.

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

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountGrade(app, { verifyToken, ledgerDb, loadAnswerKey, config = PHASE3_CONFIG }) {

  // GET /grade
  //   Auth: roster token (Authorization: Bearer <t> OR ?token=).
  //   → 200 { ok, asOf, config, units, quarters, completion }
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
    // distinct latest items attempted per source per unit.
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

      // B = weighted mean over feeders that HAVE graded data (renormalized).
      // Neither present → B=null (ungraded; NOT 0 — non-punitive, cumulative).
      let B = null;
      {
        let num = 0, den = 0;
        if (W != null) { num += wWeight * W; den += wWeight; }
        if (Q != null) { num += qWeight * Q; den += qWeight; }
        if (den > 0) B = Math.round((num / den) * 10) / 10;
      }
      const banked = B == null ? null : Math.round(Math.min(B, C) * 10) / 10;

      // P: quarter-anchor curve over PC raw%. Unit outside the bands → P=0.
      const pcRawPct = pcAgg.units[uKey] ? pcAgg.units[uKey].pct : null;
      const q = unitNum == null ? null : quarterOfUnit(unitNum, config);
      const P = q ? pcRawToP(pcRawPct, config.quarters[q].pcAnchor) : 0;

      // unitGrade = max(banked, P). A unit with no banked work AND no PC lift
      // has no grade yet → excluded from the quarter mean (not counted as 0).
      const graded = banked != null || P > 0;
      const unitGrade = graded
        ? Math.round(Math.max(banked == null ? 0 : banked, P) * 10) / 10
        : null;

      units[uKey] = { W, Q, B, banked, pcRawPct, P, unitGrade, graded };
    }

    // ── Per-quarter mean of the band's graded unitGrades ─────────────────────
    const quarters = {};
    for (const qKey of Object.keys(config.quarters)) {
      const band = config.quarters[qKey].units;
      const unitGrades = {};
      const vals = [];
      for (const n of band) {
        const uKey = `U${n}`;
        const ug = units[uKey] ? units[uKey].unitGrade : null;
        unitGrades[uKey] = ug;
        if (ug != null) vals.push(ug);
      }
      quarters[qKey] = {
        units: band,
        unitGrades,
        quarterGrade: vals.length
          ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
          : null,
      };
    }

    // Stable sorted unit order.
    const unitsOut = {};
    for (const u of Object.keys(units).sort()) unitsOut[u] = units[u];
    const completionOut = {};
    for (const u of Object.keys(completion).sort()) completionOut[u] = completion[u];

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      config: {
        C,
        feederWeights: config.feederWeights,
        frqBand: config.frqBand,
        quarters: config.quarters,
      },
      units: unitsOut,
      quarters,
      completion: completionOut,
    });
  });
}

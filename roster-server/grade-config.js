// @ts-check
// grade-config.js — the ONE Phase-3 config constant block.
// Every §7 pilot-tunable knob lives here and nowhere else (GRADEBOOK_PHASE3_BUILD.md
// §1–§3 + §5). Changing a number here re-tunes the model with zero code edits;
// because Phase 3 resolves grades at rollup time, a tweak retro-fixes history.

export const PHASE3_CONFIG = {
  // Completion ceiling: doing all the work banks at most this (flat, all units —
  // the difficulty ramp lives entirely in the per-quarter PC→P curve).
  C: 85,

  // Feeder weights for B = (wW·W + wQ·Q) / (present weights).
  // follow-along worksheet : cr-quiz = 1 : 2.
  // Used by the unit-level grade path (grade.js units{}) — unchanged.
  feederWeights: { W: 1, Q: 2 },

  // Feeder weights for the lesson-level B = (ws*Cws + W*W + Q*Q) / (present weights).
  // Spec D1: ws:W:Q = 1:2:3 (worksheet blanks : FRQ : quiz).
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },

  // AI-graded FRQ band → numeric. DN2b records score ∈ {1,0.5,0} (E/P/I);
  // Phase 3 remaps that to the teacher's E/P/I numeric band.
  frqBand: { E: 100, P: 70, I: 35 },

  // An frq row counts as "demonstrated" for the diagnostic BKT when its
  // numeric score (E=1/P=0.5/I=0) is at least this (E and P = evidence).
  // Grade-side frq uses frqBand directly; this is the diagnostic binary only.
  frqDiagnosticCorrectThreshold: 0.5,

  // Quarter → unit band + calendar window + the proctored-PC curve anchors.
  // Phase 6 update: Q1=[1,2,3], Q2=[4,5], Q3=[6,7], Q4=[8,9].
  // F2 update: each quarter gains start/end ISO date windows (inclusive).
  // A lesson dated within a window belongs to that quarter (date-driven).
  // quarterOfUnit() stays for PCs and null-date fallback.
  // raw% (PC correct/graded ×100) maps: ≥p100 → 100; [p85,p100) → linear
  // 85..100; [0,p85) → linear 0..85. Q4 ≈ published AP-Stats real (~70 = a 5);
  // Q1–Q3 deliberately gentler = the graduated-trust ramp. ALL pilot-tunable.
  quarters: {
    Q1: { units: [1, 2, 3], start: '2026-09-09', end: '2026-11-13', pcAnchor: { p85: 40, p100: 60 } },
    Q2: { units: [4, 5],    start: '2026-11-14', end: '2027-01-29', pcAnchor: { p85: 45, p100: 64 } },
    Q3: { units: [6, 7],    start: '2027-01-30', end: '2027-04-09', pcAnchor: { p85: 50, p100: 67 } },
    Q4: { units: [8, 9],    start: '2027-04-10', end: '2027-06-23', pcAnchor: { p85: 55, p100: 70 } },
  },

  // IANA timezone for computing "today" in the date filter (Phase 6).
  // Server clock in this timezone determines which lessons are "due".
  schoolTz: 'America/New_York',

  // Phase 6 (2026-05-20 fold): cohort-aware grading window. Any lesson
  // whose due dates are ENTIRELY BEFORE this date is excluded from the
  // active band — those are stale entries left over from a prior school
  // year (e.g. SY25-26's April-2026 dates lingering when SY26-27 begins).
  // A lesson with even ONE period date >= this start (or NULL dates =
  // not-yet-scheduled-for-this-cohort) stays in the band.
  // Update this once per year at cohort cutover.
  gradingWindowStart: '2026-09-01',

  // Diagnostic weak-skill flag cutoff (pKnow < θ ⇒ weak). GRADE-INDEPENDENT —
  // θ never enters any grade arithmetic (GRADEBOOK_GRADING_SPEC.md §3).
  diagnosticTheta: 0.65,

  // ── v3 grading model (GRADING_MODEL_V3_BUILD.md) — default OFF ──────────────
  // When true, quarterGrade = quarter_grade(pcAvg, workAvg): a two-track
  // max/mean conditional (PC mastery vs Work engagement, each gated by a 40%
  // floor on the other) that supersedes the Phase 6 mean(lessonGrade). Flip via
  // env USE_V3_GRADING=true; tests pass { useV3: true } via configOverrides.
  useV3: process.env.USE_V3_GRADING === 'true',

  // v3: exclude the curriculum-quiz feeder from the Lessons track. In v3's
  // 5-category model Quizzes is its own 15% track, so counting quizzes inside
  // Lessons too would double-count. Default true (the defensible reading; the
  // spec prose is ambiguous on this one point — see GRADING_MODEL_V3_BUILD.md).
  v3LessonsExcludeQuiz: true,

  // v3 Work-track weights (renormalized over present tracks) — formerly a
  // hardcoded const in lesson-grade.js (GRADE_SIMULATION FINDING F2). Now a
  // pilot-tunable knob; these defaults are byte-identical to the old constant.
  v3WorkWeights: { lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10 },

  // v3 quarter-grade gates: `floor` = the both-tracks-cleared threshold that
  // unlocks max(pc, work); `ceiling` = the single-track gaming bound (0.7·track).
  // Formerly hardcoded literals in quarterGradeV3; defaults preserve behavior.
  v3Gates: { floor: 0.40, ceiling: 0.70 },

  // Perverse-incentive fixes the grade simulator found (GRADE_FIX_F1_F3_BUILD.md).
  // ENABLED 2026-06-16. Each is a real grade change, simulator-verified.
  // F1-B: an un-taken quiz on a not-scheduled-due lesson stays absent, not 0.
  v3FixQuizZero: true,
  // F3: doing some-but-not-all worksheet blanks can't drop a lesson below FRQ-only.
  v3FixCwsReveal: true,
  // F1-A: how an ahead-of-schedule (worked, not-yet-due) lesson counts in the
  // Lessons track — 'count-all' (legacy) | 'not-until-due' | 'only-helps'.
  // 'not-until-due' chosen: it fully fixes the F1 incentive AND stays monotonic.
  // 'only-helps' scored marginally higher but the simulator proved it VIOLATES
  // A3 monotonicity (raising a due lesson can evict an above-avg early lesson and
  // lower the grade — FINDING F4). Monotonicity wins. (only-helps stays available
  // for experimentation but must not ship.)
  v3AheadOfScheduleLessons: 'not-until-due',

  // ── TI-84 trainer strand (TI84_GRADE_INTEGRATION_SPEC.md §C) ────────────────
  // weight 0 = VISIBLE-BUT-UNCOUNTED: per-lesson trainer pct + quarter
  // trainerDue/Done/Todo + workTracks.trainer are surfaced, but the track never
  // enters workAvgV3 (grade-invariant — pinned by test). Setting weight > 0
  // (teacher decision, ~Sept with real data) adds tracks.trainer at that weight,
  // which RENORMALIZES the other Work slices — a real grade change. Counted mode
  // should also restrict to mastery-tier evidence per the spec before enabling.
  // doneThreshold: what the Desk shows as "trainer done" (display only).
  trainer: { weight: 0, doneThreshold: 80 },

  // ── Progress-Check makeup track (PC_MAKEUP_PHASE2_GRADE_SPEC.md §C) ──────────
  // enabled=false = INERT: computeGrade skips PC scoring (pcRawPct stays null →
  // unit P=0, unitGrade unchanged) AND computeQuarterV3 skips the PC band loop
  // (pcAvg stays null → combineV3 short-circuits to the Work track). The grade is
  // then byte-identical to the pre-PC engine (pinned by the grade-invariance
  // test). Env-gated like useV3: set PC_TRACK_ENABLED=true (teacher decision,
  // ~Sept, once the real calendar is live AND paper PCs are administered +
  // scored) to let a unit's PC count once that unit's last lesson is due.
  // ⚠ Enabling makes an un-taken BUT due PC count as 0, which caps that quarter
  // at 70% of Work (the two-track sub-floor ceiling) — do NOT enable before
  // paper scores are entered, or every student silently drops when dates pass.
  // Gate semantics elsewhere: enabled UNLESS explicitly false, so tests with a
  // bespoke config (no pcTrack) keep exercising PC; production (this OFF default)
  // is inert until the env flag flips.
  pcTrack: { enabled: process.env.PC_TRACK_ENABLED === 'true' },
};

// unitNumber("U4") | "4" | 4 → 4 ; anything unparseable → null.
export function unitNumber(u) {
  if (u == null) return null;
  const m = String(u).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Which quarter a unit belongs to ("Q1".."Q4"), or null if outside the bands.
export function quarterOfUnit(unitNum, cfg = PHASE3_CONFIG) {
  for (const q of Object.keys(cfg.quarters)) {
    if (cfg.quarters[q].units.includes(unitNum)) return q;
  }
  return null;
}

// Which quarter a calendar date falls in ('Q1'..'Q4'), or null if the
// date is outside every quarter window. Boundaries inclusive. ISO
// YYYY-MM-DD strings compare correctly lexicographically.
export function quarterOfDate(dateStr, cfg = PHASE3_CONFIG) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  for (const q of Object.keys(cfg.quarters)) {
    const w = cfg.quarters[q];
    if (w.start && w.end && dateStr >= w.start && dateStr <= w.end) return q;
  }
  return null;
}

// Map a proctored-PC raw% (0–100, or null when no scorable PC evidence) to the
// uncapped P ∈ [0,100] using the quarter's two anchors. null raw → P = 0
// (P sits inside max(); no PC ⇒ no lift, banked dominates).
export function pcRawToP(rawPct, anchor) {
  if (rawPct == null || !Number.isFinite(rawPct)) return 0;
  const { p85, p100 } = anchor;
  const r = Math.max(0, Math.min(100, rawPct));
  let p;
  if (r >= p100) {
    p = 100;
  } else if (r >= p85) {
    p = 85 + ((r - p85) / (p100 - p85)) * 15;
  } else {
    p = (r / p85) * 85;
  }
  return Math.max(0, Math.min(100, Math.round(p * 10) / 10));
}

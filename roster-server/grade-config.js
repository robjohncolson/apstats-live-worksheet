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
  feederWeights: { W: 1, Q: 2 },

  // AI-graded FRQ band → numeric. DN2b records score ∈ {1,0.5,0} (E/P/I);
  // Phase 3 remaps that to the teacher's E/P/I numeric band.
  frqBand: { E: 100, P: 70, I: 35 },

  // An frq row counts as "demonstrated" for the diagnostic BKT when its
  // numeric score (E=1/P=0.5/I=0) is at least this (E and P = evidence).
  // Grade-side frq uses frqBand directly; this is the diagnostic binary only.
  frqDiagnosticCorrectThreshold: 0.5,

  // Quarter → unit band + the proctored-PC curve anchors.
  // raw% (PC correct/graded ×100) maps: ≥p100 → 100; [p85,p100) → linear
  // 85..100; [0,p85) → linear 0..85. Q4 ≈ published AP-Stats real (~70 = a 5);
  // Q1–Q3 deliberately gentler = the graduated-trust ramp. ALL pilot-tunable.
  quarters: {
    Q1: { units: [1, 2],    pcAnchor: { p85: 40, p100: 60 } },
    Q2: { units: [3, 4, 5], pcAnchor: { p85: 45, p100: 64 } },
    Q3: { units: [6, 7],    pcAnchor: { p85: 50, p100: 67 } },
    Q4: { units: [8, 9],    pcAnchor: { p85: 55, p100: 70 } },
  },

  // Diagnostic weak-skill flag cutoff (pKnow < θ ⇒ weak). GRADE-INDEPENDENT —
  // θ never enters any grade arithmetic (GRADEBOOK_GRADING_SPEC.md §3).
  diagnosticTheta: 0.65,
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

# PC_CURVE_SPEC — the class scale for a unit's Progress Check

Status: BUILT 2026-10-21 (Opus 5.5; raw-0 rule and 0.1 rounding added after the build; Codex astra review GREEN 2026-10-21).

## 0. Teacher decisions (2026-10-21)

1. The Unit 1 PC is curved so the top full-work score lands on 99, the score the
   teacher pointed at lands on 90, and the lowest full-work score lands on 70.
   Students who did not turn in parts follow the same scale downward (no floor).
2. The knots are FROZEN NUMBERS, never "the lowest student": retakes and late
   parts move only that student. Future units get their own knots when the
   teacher looks at the scores; a unit without knots is uncurved.
3. The curve lives in the grade ENGINE, so the Desk, the dashboard, the Schoology
   PC column and the official quarter grade all show the same curved number.
4. The curve applies to the BLENDED unit PC percent (after the half-MCQ /
   half-FRQ blend of PC_FOLLOWTHROUGH_SPEC §1), never to individual parts.
5. It applies to everyone, including students whose parts arrive later.

## 1. Engine

### 1.1 Config — `roster-server/grade-config.js`

```js
// Class scale per NEW unit: raw blended PC % -> curved %, piecewise linear through
// these knots (PC_CURVE_SPEC.md). Knots are frozen numbers chosen by the teacher.
export const PC_CURVE = {
  1: [[58.8, 70], [79.5, 90], [92.6, 99]],
};
```

### 1.2 Function — `pcCurvePct(unitNum, rawPct)` (export from `grade-config.js`)

- `rawPct == null` or not finite → `null`.
- `rawPct <= 0` → `0`. No PC work earns no place on the class scale (a student
  whose parts are all deadline zeros stays at 0, not 13.2).
- No knots for `unitNum` (or fewer than 2) → `rawPct` unchanged.
- Knots sorted by x. Between two knots: linear interpolation. Below the first
  knot: extend the FIRST segment's line downward. Above the last knot: extend the
  LAST segment's line upward. Clamp the result to [0, 100].
- The function is unrounded; the grade.js hook rounds the curved unit % to 0.1
  (the blend arrived rounded before, and the gradebook PC cell feeds Schoology).

Worked values (Unit 1): 92.6 → 99; 84.9 → 93.7; 79.5 → 90; 68.8 → 79.7;
58.8 → 70; 52.3 → 63.7; 51.4 → 62.9; 100 → 100 (104.1 clamped); 1 → 14.2; 0 → 0 (rule above).

### 1.3 Hook — `roster-server/grade.js` (the ONE place)

At the line that reads `const pcRawPct = pcAgg.units[uKey] ? pcAgg.units[uKey].pct : null;`
compute the unit number, keep the uncurved value, and curve:

```js
const pcUncurvedPct = pcAgg.units[uKey] ? pcAgg.units[uKey].pct : null;
const pcRawPct = pcCurvePct(unitNumber(uKey), pcUncurvedPct);
```

`units[uKey]` gains `pcUncurvedPct` (number|null) next to `pcRawPct`. Every
existing consumer of `pcRawPct` (quarter pcAvg, Desk, dashboard, gradebook grid,
Schoology sync, official grade, weekly slips, effort facts) therefore sees the
curved number with NO other change. Do not touch `scorePcRows`/`pcPaperBlend`
(they stay raw; `/pc/parts` stays raw per part).

The poster/no-PC branch (`pcRawPct: null`) is untouched.

### 1.4 Bundle

`scripts/build-grade-engine.mjs`: add `PC_CURVE` and `pcCurvePct` to the
`grade-config` exports, regenerate `grade-engine.bundle.js` (the Desk computes
offline with it). Grade-engine edits need the ROOT suite run too.

## 2. Dashboard / Desk

No new UI. Optional, cheap: where the teacher dashboard's PC completeness panel
shows a unit PC %, show the uncurved value in the hover title ("raw 79.5"). Not
required for this build.

## 3. Tools

`tools/apclassroom_pc_reconcile.py` prints "PC % DROPS a -> b" from its own
Python blend. Those are RAW numbers; relabel the line `PC raw % DROPS` so the log
does not look like the Schoology number. Nothing else in Python changes
(`schoology_official.py` and the fixture builder read `pcRawPct` from the server
and therefore get the curved value for free).

## 4. Tests

- `roster-server/tests/pc-curve.test.js`: the worked values in §1.2; identity for
  a unit without knots; null stays null; clamp at 100 and 0; a two-knot curve
  extrapolates both ends.
- `roster-server/tests/pc-grade-wiring.test.js` (or a new case): a Unit 1 ledger
  with per-part rows produces `units.U1.pcUncurvedPct` = raw blend and
  `units.U1.pcRawPct` = curved, and `quarters.Q1.pcAvg` uses the curved value.
- Goldens live in `roster-server/tests/fixtures/` (built by
  `roster-server/scripts/build-golden-synthetic.mjs`). The synthetic golden carries
  Unit 1 PC rows, so its Q1 values move; the floor student is rebuilt at raw 27.75
  so it still sits on the 40% floor after the curve. Units other than 1 must not move.
  `grade.test.js` and `pc-paper-blend.test.js` use Unit 1 as a generic unit and assert
  both `pcUncurvedPct` and the curved `pcRawPct`.
- Root: `npm test` focused on `tests/desk-why-so-low.test.js`,
  `tests/desk-ledger-calm.test.js`, `tests/weekly-slips.test.js`,
  `lib/effort-facts.test.js` plus the CED and bundle guards.

## 5. DO / DON'T

- DO keep the change to grade-config.js, grade.js, the bundle script, the bundle,
  tests, and the one reconcile label.
- DON'T curve parts, `/pc/parts`, `/pc/grade`, or the ledger rows.
- DON'T print 100/85/60 or "80% = done" anywhere student-facing.
- DON'T put student names or live scores in tracked files (the knots are numbers).
- DON'T re-derive knots from data at runtime.

## 6. Rollout

Push to master (roster-server auto-deploys), then re-run the Schoology sync for
B and E from this machine so the curved PC reaches Schoology tonight.

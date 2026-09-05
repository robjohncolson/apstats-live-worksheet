# Codex prompt — relabel the student-facing calendar to the Fall-2026 five-unit CED (display-only) — 2026-09-05

Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs` (Windows; forward slashes; `node`, `python` on PATH).
**Plan first** (`state/calendar-ced2026-relabel-PLAN.md`: the §2.5 audit table BEFORE you edit), then implement
`CALENDAR_CED2026_RELABEL_SPEC.md`. **Never push.** One or two commits; report hashes, test counts, and the §3 report.

## Hard limits
- Display only. `t` on every calendar cell, `lessons[].unit`, dates, pacing order, `data/lesson-schedule.json`, Schoology,
  DOK file names, the grade engine: untouched. Add the byte-identical test on the schedule JSON (spec §2.6-vi) FIRST and
  keep it green.
- Do NOT revive schedule packing (reverted 2026-09-05; branch `codex-packing-paused` is not to be merged or consulted).
- One helper (`cedLabel`, `cedUnitClass`) is the only source of NEW labels/classes. Grep for ad-hoc `'U'+`, `"Unit "+`,
  `inf.u` colour lookups and route them through it.
- Teacher-only surfaces may keep OLD ids in tooltips; student surfaces never show an OLD id alone (the resource-panel
  header's `(old 3.1: … u3_lesson1)` bridge is the one sanctioned place).

## Read first
`CALENDAR_CED2026_RELABEL_SPEC.md` (all); `2026-crosswalk.json`; in `ap_stats_roadmap_square_mode.html`: `function d(`
(~9885), `injectPcPosterEvents`, `SY2627_PACING_B/E` (~9925–10070), `SCHEDULE_DEFS["SY26-27"]` (~10103), `generateSchedule`
(~10190), `updateLegend` (~10328), `showResourcePanel` header block (~11290–11320), `rCal` (~22969) and `rProg` (~23295),
the unit colour tokens in the `<style>`; `tests/calendar-polish.test.js`, `tests/desk-due-today.test.js`,
`tests/desk-donow-speedbump.test.js` for how the Desk is loaded/rendered in jsdom. Also `start-here.html`
(`renderQuarters`, "Where you stand"), `mobile-home.html`, `index.html` for the §2.5 sweep.

## Steps
1. Audit sweep (spec §2.5) → the disposition table in the PLAN. Include the baked `BAKED_REGISTRY.progressChecks/posters`
   "Unit 6–9" titles (~4650–4800): prove dead or relabel.
2. `cedLabel` / `cedUnitClass` helpers + `d()` attaches `ced` to each cell; CSS `--bonus` tokens.
3. `rCal` cell text/colour, `rProg` segments, tooltips, Do Now / due-chip / "today" strings, resource-panel header
   (NEW id leads, OLD bridge kept), through the helper. Folded topics get the `(old)` suffix; bonus the ★ tone.
4. `tests/desk-calendar-ced2026.test.js` (spec §2.6 i–vi). Run it plus `npx vitest run tests/desk-*.test.js
   tests/calendar-*.test.js tests/classroom-structure.test.js` and `npx vitest run tests/grade-engine-bundle-parity.test.js`
   (must be untouched). Report before/after strings for old `1.1`, `3.1`, `4.10`, `9.6`.
5. If any consumer of `inf.u`/`inf.t` cannot be routed through the helper without a behaviour change (e.g. the offline
   pack, the Do Now oracle), STOP and report instead of special-casing.

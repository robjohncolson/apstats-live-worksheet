# Effort visibility v2 — plainer words, both periods named, tracks on the pill, Schoology colour key (2026-09-27)

Teacher, after reading the first slips: the strategy line "is hard to understand — needs to be clear
that in order for her to get the 94% at the end of the quarter, she needs to bring up her work average
by at least 5 points"; the score strip must say the scores are "from the students of both my period B
& E collated, not just 'scores'"; the Desk pill "Q1: <numbers>" should "show clearly the work track, the
progress track, and the combined track (using the 40% rule)"; and it must be "obvious that grades sent
to Schoology are colour coded and average out to be the same number the kid sees on Schoology, where
grades yet to be given to Schoology (where students are ahead) have been recorded and are colour
coded but NOT included in the Schoology grade."

Builds on `EFFORT_VISIBILITY_SPEC.md` (shipped `1ca1f414`). All four items are wording/display; no
engine change.

## 1. The strategy line, rewritten (lib `strategyLine`, every surface)

Replace the current two-sentence rule statement with a goal-first sentence. Numbers: PC = the track
value already chosen by `pcTrack` (projected or counting), W = unrounded Work, N = ceil(40 − W).

- **Projected (PC not counting yet), W < 40:**
  `To finish the quarter with your 94%, your Work average has to reach 40% — you are at 35%, so bring
  it up by at least 5 points. Once both tracks are at least 40%, your grade is the higher one, and
  yours would be the Progress Check.`
- **Projected, W ≥ 40:**
  `Your Work average is already past 40%, so once your Progress Check counts (Tue 10/13) your grade
  becomes the higher of the two — right now that would be your 94%. Keep Work at 40% or better and
  it stays that way.`
- **Counting, W < 40:** same as the first but `To keep your 94%…` and no "once it counts".
- **Counting, W ≥ 40:** `Your grade is the higher of your two tracks: Progress Check 94%, Work 61% →
  94%. Keep Work at 40% or better and it stays that way.`
- **Work ≥ PC (either mode):** `Your Work track (88%) is the higher one right now, so your grade
  follows it; your Progress Check (67%) is the safety net — the grade is whichever is higher once
  both are at least 40%.`
- PC < 40 → '' (unchanged).
The PC "so far" line above it stays: `Progress Check so far: 94% (paper) — counts from Tue 10/13.`
but drop the duplicated "Your Progress Check so far is 94%" opener from the strategy sentence (the
sentence now starts with "To finish…" / "Your Work average…"). Update every pin in
`lib/effort-facts.test.js`, `tests/weekly-slips.test.js`, `tests/desk-ledger-calm.test.js`,
`tests/desk-why-so-low.test.js`; the cr STRATEGY NOTE fact uses the same sentence verbatim.

## 2. Both periods, named (score strip everywhere)

- Lead: `All 29 scores from Period B and Period E together for 1.2 Quiz (2 tentative):`
- Foot: `23 of 29 students across both periods have a score here.` (+ the tentative sentence as today)
- Key: `red = you · yellow = a 0 that is not counting yet · every other number is one student in Period B or E`
- Heading on the slip: `The class on your first item` → `Both periods on your first item`.
- Same words in the Desk `_snapScoreList` lead/foot/key (`ap_stats_roadmap_square_mode.html` ~16314,
  ~16347, ~16359) and in the slip (`scripts/weekly-slips.mjs` `stripText` ~247–252). Section names come
  from the pooled payload's `sections` (`['PeriodB','PeriodE']` → "Period B and Period E"); if the
  payload has one section, say that one section's name; never hard-code the two letters.
- Pins: `tests/desk-class-snapshot-assignments.test.js`, `tests/desk-ledger-calm.test.js`,
  `tests/weekly-slips.test.js`.

## 3. The Do Now grade pill shows the tracks and the rule

Today: `Q1: 86.0 ↑100` (tooltip). New pill content, one line, same `#donow-grades` host, replacing the
single number (keep the class names `qpill`, `qkey`, `qgrade` so the missing-work pill still slots
after it; add `qtrack` spans):

- PC not counting yet: `Q1 86 = Work 84 (PC counts from Tue 10/13)`
- Both ≥ 40: `Q1 94 = higher of Work 61 · PC 94`
- One track below 40: `Q1 61 · Work 35 is under 40% → penalized until it reaches 40 (PC 94)`
- No PC on file at all: `Q1 86 = Work 86`
Numbers whole. Tooltip keeps the lessons-graded text and adds one sentence: `Once both tracks are at
least 40%, your grade is the higher one.` The ↑ceiling is dropped from the pill (it confused the
wording; the coach still has it). Teacher view unchanged (the pill is student-only today — verify).
Pins: `tests/desk-donow-*.test.js` / whichever test pins `qceil` / `qgrade` (grep `qceil` in tests/).

## 4. My Gradebook: what Schoology has vs what is recorded ahead

The in-app grid (`_gradeGradebookCache` from `/grade` → `gradebook.quarters[q].{columns, cells,…}`;
renderer near `ap_stats_roadmap_square_mode.html` ~18452; server `roster-server/gradebook-grid.js`
`buildGradebookRow` already ignores `col.due === false` for the Schoology total) gets a colour key:

- A cell whose column is DUE (`col.due !== false`) and has a value: **blue-grey tint** (`#e6eef7`,
  border `#2B5C8A`) = "in Schoology; this is in your Schoology grade".
- A cell whose column is NOT yet due and has a value: **green tint** (`#eaf6ea`, border `#2a8a2a`) =
  "recorded ahead — counts on the Desk, not in Schoology yet".
- Empty cells unchanged.
- Under the grid, a key line: `■ In Schoology now — these average to the number you see there:
  84%.  ■ Recorded ahead of the calendar — counted on the Desk, reaches Schoology when the class gets
  there. Desk quarter grade: 86%.` The two numbers are the two totals the modal already computes
  ("Shows BOTH totals" per the file comment); label them exactly `Schoology now` and `Desk`.
- If the payload's columns carry no `due` field (older cache), show no colours and no key.
Pins: the existing My Gradebook test (grep `_gradeGradebookCache` / `My Gradebook` in tests/) gains a
case with one due and one ahead column: classes on the cells and the key text.

## 5. Out of scope
Engine, bonus placement (separate spec), Schoology sync, teacher dashboard.

## 6. Acceptance
`npx vitest run lib/effort-facts.test.js tests/weekly-slips.test.js tests/desk-ledger-calm.test.js tests/desk-why-so-low.test.js tests/desk-class-snapshot-assignments.test.js` + the pill and gradebook tests green; `node scripts/weekly-slips.mjs --no-pdf --section PeriodB` renders; the cr server file parses. LF; no bump / shadow / commit — the orchestrator releases both repos.

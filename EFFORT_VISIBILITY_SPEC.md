# Effort visibility — the PC strategy and work done ahead (2026-09-27)

Teacher: "some of these students … have good progress check scores so far, so I want them to know
if this is part of their work strategy, then it is understood. The grading strategy of only getting
40% in work and 100% on the progress check might work for them. Also some of them have done a lot of
work AHEAD of what is being put into Schoology … their Schoology grade won't reflect all the future
work they've already done, and I commend their effort. So we need to close this gap on paper, and on
the grading engine/display for the students so they don't feel that I'm misplacing their effort."

## 0. What is already true (no engine change in this pass)
- **Quarter formula (v3):** once BOTH tracks are ≥ 40%, the grade is the HIGHER track; below that,
  `max(0.7·pc, 0.7·work, mean)`. So a student with a strong PC needs Work at 40%, not 100%. This is a
  legitimate strategy and the surfaces should say so plainly.
- **PC on file but not counting yet:** a paper score posted with `import-pc-scores.mjs` lands in
  `units[U<n>].pcRawPct` immediately (the `/grade` and `/class/grades` payloads both carry `units`),
  but `quarters[q].pcAvg` counts a unit only once its PC Day 2 has arrived
  (`isDateDue(adminDay2[period], today)`, i.e. counts FROM that date). Unit 1: B Tue 10/13, E Fri 10/16
  (`data/lesson-schedule.json → progressChecks[1].adminDay2`).
- **Work done ahead:** the engine's default `v3AheadOfScheduleLessons = 'count-all'` — an early lesson
  WITH work already counts in the Desk/engine Work track today. (Never switch to `only-helps`; see
  memory: non-monotonic.) The Schoology sync also pushes ANY scored lesson — but only into a column
  that exists; future-lesson columns are created by the teacher (column generator). So the "gap" is
  (a) students cannot SEE that their early work already counts, and (b) Schoology shows it only when
  the column exists.

## 1. Two new facts, computed once, used everywhere

Add a shared pure module `lib/effort-facts.js` (UMD like `lib/class-snapshot.js`; installs
`globalThis.EffortFacts`; importable from Node ESM for the slips script and tests):

```js
EffortFacts.pcOnFile(units, quarters, period, schedule, todayIso)
  → null | { unit: 1, pct: 66.7, counting: false, countsFrom: '2026-10-13', day: 'Tue 10/13' }
  // the LOWEST-numbered unit with pcRawPct != null in the current quarter's PC band;
  // counting = pcDue for that unit (Day 2 <= today). If several units are on file, return the
  // list under `all` and the first in the fields above.
EffortFacts.strategyLine(pcOnFile, workAvg, gradeFloor = 40)
  → '' | 'Your Progress Check so far is 67%. Once both tracks are at least 40%, your grade is the HIGHER one — so your Work track only needs to reach 40%. You are at 31%; 9 points of Work does it.'
  // variants: work already ≥ 40 → '…You are already past 40%, so your grade will follow your Progress Check once it counts (from Tue 10/13).'
  //           pc < 40 → '' (no strategy to commend; the missing-work advice stands)
  //           counting already → same sentences without the "(from …)" clause
EffortFacts.aheadLessons(lessons, period, todayIso)
  → [{ lessonKey, due: '2026-10-05', day: 'Mon 10/5', worksheet: 100, quiz: 67, blooket: 88 }]  // any of the three scores present, due date in the FUTURE for this period
EffortFacts.aheadLine(ahead)
  → '' | 'Ahead of the calendar: 3 lessons already done (1.6, 1.7, 1.8). They already count in your Desk grade; Schoology shows each one when its date arrives.'
```
Rounding: pct to one decimal in data, whole numbers in sentences. `day` format `Tue 10/13`
(the Desk's `_zeroDayText` shape). Tests in `lib/effort-facts.test.js` (colocated, like `lib/*.test.js`):
each function, both strategy variants, the empty cases, a unit with two parts on file.

## 2. Slip (`scripts/weekly-slips.mjs`)
Under the header line, before Missing work, up to two short lines:
- **PC line** when `pcOnFile` exists: `Progress Check so far: 67% (paper) — counts from Tue 10/13.`
  followed by the `strategyLine` when it is non-empty (bold the "40%" words is fine; plain is fine).
- **Ahead line** when `aheadLessons` is non-empty (the `aheadLine` text).
Both use the Desk colours: PC line in the section's ink (black), the ahead line prefixed with a
small green square (`#2a8a2a`, the Desk's all-clear green) so it reads as praise, not a warning.
The slip's candidate rule is UNCHANGED (grade < 70 or a counting 0) — this is about what the
candidates are told, and a strong-PC student below 70 is exactly who needs it.
PC dates come from `data/lesson-schedule.json` (already in the repo; read once per run).
Tests: `tests/weekly-slips.test.js` — a fixture student with `units: { U1: { pcRawPct: 66.7 } }`
and one early-scored lesson renders both lines; a student with neither renders neither.

## 3. Desk (`ap_stats_roadmap_square_mode.html`)
- Cache `units` from the `/grade` payload next to the existing caches (`_gradeUnitsCache`), cleared
  where the others are cleared.
- Missing-work card (`_walletPrependZeroCard` → after the `.wz-status` line): a `.wz-effort` block
  with the same two lines (PC line + strategy; ahead line), green left bar for the ahead line, grey
  for the PC line. Shown even when the Missing-work list is empty? — NO: the card only exists when
  something is missing. So ALSO add the two lines to the balance card in `_walletPaint` under the
  grade row (class `wallet-effort`), so a student with nothing missing but work ahead still sees the
  praise. (Do not duplicate: when the zero card is present it carries them; when absent the balance
  card does.)  Simplest: always render in the balance card; never in the zero card. Choose that.
- Coach context (`_buildCoachContext`): add `pcOnFile` (the object) and `ahead` (the list, ≤ 8) —
  and the instant panel (`_renderCoachPanel`) prints the PC line + strategy and the ahead line
  right under the track line, before the bottleneck sentence.
- Load `lib/effort-facts.js` with a `<script>` tag next to `lib/class-snapshot.js`.
Tests: `tests/desk-ledger-calm.test.js` (balance-card lines present/absent), `tests/desk-why-so-low.test.js`
(context carries both; panel prints both).

## 4. Coach prompt + facts (curriculum_render `railway-server/server.js`)
- `buildCoachFacts`: when `ctx.pcOnFile` exists: `PROGRESS CHECK ON FILE: 66.7% (paper), counts from
  Tue 10/13 — not yet in the grade.` plus `STRATEGY NOTE: with a PC of 66.7%, the student only needs
  the Work track at 40% for the grade to follow the PC; Work is at 31%.` (or the "already past 40%"
  variant). When `ctx.ahead` is non-empty: `WORK DONE AHEAD (commend this): Topic 1.6, Topic 1.7,
  Topic 1.8 — already counted in the Desk grade; Schoology shows each when its date arrives.`
- Prompt rules: (a) the "PC NOT OPEN YET" rule stays, but when a PC is ON FILE the coach MAY say
  "your paper Progress Check is on file at 67% and counts from Tue 10/13" and explain the 40%
  strategy in one sentence; it must never call the PC a 0 or a gap. (b) When WORK DONE AHEAD is
  listed, open with one sentence of credit for it before anything else ("You are three lessons
  ahead of the calendar — that already counts."), then the priorities as usual. (c) Never say the
  student's effort is "not counted"; say Schoology "catches up when the column opens".

## 5. Schoology (teacher action, not code)
Ahead work reaches Schoology only when the column exists. Add to the sync DRY-RUN output a per-section
summary line `Ahead scores waiting for a column: 1.6 Follow-Along (4), 1.7 Quiz (3), …` computed from
`component_grades_from_class_doc` keys whose column is absent — so the teacher knows which columns to
create. (`tools/schoology_sync_section.py`; pytest in `tests/test_schoology_sync_lib.py` or the
nearest existing file.) No write behaviour changes.

## 6. Out of scope
The engine (`v3AheadOfScheduleLessons` stays `count-all`), the PC due dates, the slip candidate rule,
roster-server routes.

## 7. Acceptance
- `npx vitest run lib/effort-facts.test.js tests/weekly-slips.test.js tests/desk-ledger-calm.test.js tests/desk-why-so-low.test.js` green; `pytest tests/test_schoology_sync_lib.py -q` green.
- `node scripts/weekly-slips.mjs --no-pdf --section PeriodB` still renders; the orchestrator compiles and reads one slip for a student with a PC on file (there is one in Period B today).
- LF endings; no build bump / shadow regen / commit / cr push — the orchestrator releases both repos.

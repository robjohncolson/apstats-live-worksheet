# Class Snapshot — spec (2026-09-26, draft for teacher review)

Teacher: "maybe we have a few modes — dot plot, stem and leaf, and finally box plot (reflects where we
are in class, and teaches the material). Any time a student has missing work about to become a zero,
they can get this graphical overview."

Purpose: when a student's grade drops, show them where they sit in the class using the graph the class
has learned so far — no names, AP vocabulary — right next to the Missing-work list that explains the gap.

## Data (roster-server, read-only, auto-deploys)

`GET /class/snapshot?section=PeriodB` — allowed for a signed-in student OF THAT SECTION (roster Bearer)
and for the teacher (any section). Response, anonymous by construction:

```json
{ "ok": true, "section": "PeriodB", "quarter": "Q1", "asOf": "2026-09-26",
  "n": 15, "values": [31, 37, 39, 50, 61, 92, 97, 97, 99, 99, 100, 100, 100, 100, 100],
  "fiveNumber": { "min": 31, "q1": 39, "median": 97, "q3": 100, "max": 100 },
  "iqr": 61, "fences": { "low": -52.5, "high": 191.5 }, "outliers": [] }
```

- `values` = each student's CURRENT quarter grade (the same `quarterGrade` the class gradebook shows),
  rounded to whole numbers, sorted ascending, teacher/test accounts excluded. Nothing else per student.
- Quartiles use the method the course teaches (median of each half, median excluded when n is odd),
  same as the TI-84. State it in a code comment; pin it in a test with the CED example data.
- Cache per section for 5 minutes (a Desk full of students refreshing must not recompute 15 grades each).
- 401 for a student asking about another section. 503 while the class gradebook is unavailable.

## Modes and when each unlocks

The mode follows the section's own pacing (the lesson's class date for that period ≤ today):

| Mode | Unlocks with | Default when |
|------|--------------|--------------|
| Dot plot | 1.5 (graphs for a quantitative variable) | before 1.8 is taught |
| Stem-and-leaf | 1.5 | offered as a tab once 1.5 is taught |
| Box plot | 1.8 (graphical representations of summary statistics) | once 1.8 is taught |

Default = the most advanced unlocked mode; earlier modes stay as tabs. Before 1.5: dot plot only, no
tabs. (Both sections are past 1.5 now; 1.8 lands the week of 9/29 for B.)

## Where it appears

Teacher 2026-09-26: "would be nice if this feature exists for everyone, not just the ones who are
falling behind, it's very educational!" So:

1. **Student — top of My Ledger, always** (every signed-in student, every day). Panel title:
   **Where you stand — Period B, N students**. The student's own dot is highlighted and labelled "you";
   everyone else is an unlabelled dot/leaf/point. When the student has zero warnings, the Missing-work
   card renders directly beneath it and the caption ends with "The list below is the gap."; otherwise
   the caption ends with the plain reading of the graph.
2. **Student — Do Now**: tapping the quarter-grade pill opens My Ledger (already does), scrolled to the
   panel.
3. **Teacher — workspace Class tab** (smartboard): the same panel, no "you" dot; clicking a student row
   places their dot (teacher-only; never rendered from the student endpoint).

## Rendering (System-7 canvas, 300×120 in the ledger; scales to width)

- **Dot plot:** integer bins 0–100 (+ a 100+ bin for bonus), stacked dots; own dot filled red with a
  "you" tag; axis with ticks every 10.
- **Stem-and-leaf:** stems = tens (10 for 100), leaves sorted; own leaf drawn red; key line
  "9 | 7 = 97"; the teacher view is the classic board layout.
- **Box plot:** whiskers to the most extreme non-outlier, box Q1–Q3, median line, outliers as dots by
  the 1.5×IQR rule (the 1.7 lesson's method 1), own value as a red dot on the number line beneath.

## Caption (one line, AP vocabulary, neutral, then the action)

- Dot/stem: `Shape: skewed left — most of the class is at 90+. Median 97. You: 31.`
- Box: `Five-number summary 31 · 39 · 97 · 100 · 100 (IQR 61). You: 31 — below Q1.` If the student is an
  outlier by 1.5×IQR: `…an outlier by the 1.5×IQR rule (lesson 1.7).`
- Always followed by: `The list below is the gap.` (the Missing-work rows).
- Shape wording from a tiny rule: compare mean vs median and the whisker lengths → "skewed left /
  roughly symmetric / skewed right". No other adjectives.

## Privacy

Only rounded values leave the server; no ids, no names, no ordering hint beyond sort. Sections of
n < 5 return `{ ok:true, n, values: [] }` and the panel says "not enough classmates yet". The teacher
view is the only place a dot can be attached to a name, and it never comes from the student endpoint.

## Tests

- roster-server: `snapshot.test.js` — quartile method against the CED worked example, exclusion of
  teacher rows, rounding, section auth (401 for a foreign section), cache TTL, n<5 empty.
- Desk: pure helpers `_snapFiveNumber`, `_snapStems`, `_snapBins`, `_snapShape`, `_snapMode(lessonsDue,
  period, today)`; the panel renders only with warnings; own dot present for the student and absent
  for the teacher; caption strings pinned.

## Build plan

roster endpoint + tests → Codex (small, backend). Desk panel + teacher view → in-session (frontend).
No grade math changes anywhere.

## Phase 2 — per-assignment analysis (teacher 2026-09-26, draft)

"For each assignment there should be a grade analysis, a box plot for each assignment; but the student
that has a zero should see the entire data set — no names, just the entire data set for that assignment,
to make it more real."

### Data
`GET /class/snapshot?section=PeriodB&by=assignment` → same auth as Phase 1; adds
`assignments: [{ key: "1.2:worksheet", lessonKey: "1.2", track: "worksheet"|"quiz"|"blooket",
title: "1.2 Follow-Along", zeroDate: "2026-09-23", n, values: [0, 0, 0, 85, 91, 100, ...],
fiveNumber, iqr, fences, outliers, zeros: 3 }]` for every lesson×track that is DUE for that section
(zero date before today, i.e. once the zero has actually been counted), in schedule order. A student with no score on a due item is a 0 in
`values` (that is the point: the zero is in the data). Items not yet due are omitted. Rounded whole
numbers, sorted, no ids/names; n<5 → empty values. Cached with the section payload.

### Where
1. **Class Snapshot app → "Assignments" tab** (students and teacher). One row per due assignment:
   title, a mini box plot (same renderer, 300×36, whiskers/box/median/outliers, red dot = you), and
   a one-line caption ("median 100 · IQR 5 · 3 zeros"). Rows sorted by zero date, newest first.
2. **The student's own zero → the whole data set.** When the student's value on that assignment is 0
   (or missing), the row expands automatically to show the full sorted list as plain numbers —
   `0 0 0 85 88 91 95 97 100 100 100 100 100 100 100` — with their own 0 in red, plus "13 of 15
   classmates have a score here." No names, ever. Rows the student scored on stay collapsed (tap to
   expand the list; the data set is public to the section either way).
3. **Teacher view:** the same rows per section with all values visible, plus the "Place a student"
   picker from Phase 1 applied to every row (one dot on every mini plot). Parallel box plots down
   the page = the 1.8 lesson on the smartboard.
4. **Missing-work card:** each row gains a small "see the class" link that opens the app scrolled to
   that assignment's row.

### Captions (AP vocabulary)
Per row: `Median 100 · IQR 5 · 3 zeros. You: 0 — an outlier by the 1.5×IQR rule.` (a 0 against a box at
95–100 always is; the rule names it). Expanded list header: `All 15 scores for 1.2 Follow-Along:`.

### Defaults chosen (say if you want otherwise)
- Zeros of OTHER students are shown as zeros in the list (honest; it also shows a struggling student
  they are not alone when they aren't). Nothing distinguishes a "missing" zero from a scored zero.
- Quizzes are included even though Schoology never zeroes them (the Desk grade does).
- Bonus items (no zero date) are not listed.

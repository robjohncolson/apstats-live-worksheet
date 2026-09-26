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

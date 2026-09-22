# RUBRIC_SLIM_SPEC — CB-style key elements, piloted on Unit 1 Lessons 1–6

Status: pilot (U1 L1–6) approved by the teacher and shipped 2026-09-21. Rollout to U2–U9 is a separate decision.

## Why

The teacher compared the Unit 1 Progress Check's expected answers with the follow-along rubrics and found the
rubrics harsher and more specific than College Board's own standard. The numbers agree:

| Unit | avg required elements / question | max |
|---|---|---|
| U1 | 4.5 | 6 |
| U2 | 4.4 | 7 |
| U6 | 5.5 | 9 |
| U7 | 7.6 | 12 |
| U8 | 7.4 | 9 |

A CB free-response part is scored on 2–3 components, each one a statistical idea. Many of our required elements
test recall of the video instead (U1 L1 `links-to-question`: "connects the number to … Flint's water"). The
misconception panel confirms it: the top "misconception" in Period B (9 students) is that exact element. Those
students hold no wrong idea — they did not think to mention it. Over-specified rubrics therefore cost grades AND
pollute the data the weekly DOK sheet is generated from.

Principle (unchanged from FRQ_GRADING_SOFTEN_SPEC): don't budge from the rubric — make the rubric say what
actually matters, and show it.

## The rule

For every reflection question (`reflect1`, `reflect2`, `exitTicket`):

1. **At most 3 `required:true` elements; 2 is normal.** One exception: a question that explicitly lists its parts
   (every exit ticket; L6 "all four characteristics") may require each listed part, **max 4** — **max 5 when the
   question enumerates five or more DISTINCT statistical asks** (old-U3 data-collection tickets: population, sample,
   bias + direction, wording, fix). CB scores those part-by-part too, and its own FRQs run 4–7 points. Identifying
   the population and the sample IS a scored idea (Unit 1 PC FRQ 1 gives a point each) — never demote it to fit a cap. Pilot result: 50 required across 18 questions (avg 2.8, was 4.0).
2. A required element must be a **statistical idea a CB reader would score** — tied to the lesson's CED learning
   objective — and must be answerable by a student who understood the idea but forgot the video's details.
3. Anything that names the video's specific context, numbers, or wording becomes `required:false`. It still
   appears under "Optional Elements" in the prompt and can still tip a torn verdict upward; it can never block an E.
4. Two required elements that are the same idea seen twice are merged into one.
5. `scoringGuide` is rewritten to match: **E** = every key element, in the student's own words; **P** = the
   central idea with one key element missing or muddled; **I** = the central idea is missing or wrong. In the
   inference units (new U3/U4) the guides are UNIFORM and DISJOINT — E all / P exactly one missing / I two or
   more — so a guide can never name an element the list made optional (the grader reads both; a Codex review
   found that contradiction across 14 questions).
7. **E = every key element** (teacher decision 2026-09-21, calibrated against the Unit 1 Progress Check scoring
   guidelines). CB awards one point per narrow idea, each earned independently, and full credit needs every point;
   it asks for a calculation with its work, a comparison that names both values in context, and a determination plus
   its justification — and never for a recited definition, a process list, or a particular example. So in a slimmed
   file the GRADING STANDARD's E line reads "every key element is present and correct … none may be skipped" and P
   reads "one key element is missing or wrong". The 9/14 "most of the key elements" wording stays in every file that
   has NOT been slimmed — slim the list first, then tighten the line, never the reverse. "If torn, give the higher
   score" is unchanged everywhere.
6. `contextFromVideo`, `questionText` are untouched. A `commonMistakes` line is reworded only when it would
   penalize a student for omitting something now optional (pilot: three lines).

Test for each element, asked during review: *"Would a CB reader take a point off for omitting this?"* No → optional.

## Hard constraints

- **Element ids never change and no element is deleted.** `roster-server/data/misconception-rubric-map.json` and
  stored `frq_result.matched/missing` are keyed by id / matched by description. Only the `required` flag, merged
  descriptions, and `scoringGuide` text change. **Descriptions of kept elements do NOT change** — stored `missing` strings resolve to ids by description overlap,
  so a reworded description orphans history (Codex review). Put leniency in the `scoringGuide` instead. A merge keeps the surviving id and demotes the other to optional.
- **No College Board text.** The Progress Check is the guide for *how much* to require, never a source of wording.
  The prompt files are public on GH Pages.
- **Only raises.** The server FRQ floor already guarantees a regrade never lowers a stored verdict. No engine,
  band, or config change in this spec → no grade-engine bundle regen, no M2B golden change.
- Pattern guard: only `ai-grading-prompts-u1-l{1..6}.js` in the pilot. edgar / MIT / study-guide variants untouched.

## What students see

The "What an E answer includes" checklist and "Missing N of M key elements" are built at runtime from
`required:true` (`u1_lesson1_live.html:1454`, `:1485`), so they shrink automatically. No worksheet HTML edit.

## Pilot scope

18 questions in 6 files. Today: reflections carry 3–5 required, every exit ticket carries 5 (the exit ticket is
bonus-only since EXIT_TICKET_BONUS_SPEC, but it lists its parts, so it goes to ≤4). Result: 72 → 50 required.

## Steps

1. **Draft** (main session): `state/rubric-slim/<batch>-decisions.json` (the judgment). Apply with
   `node scripts/rubric-slim-apply.mjs <decisions>` (deterministic; Codex's L7 write silently failed, so the
   applier is a script and Codex is used for the REVIEW pass) plus `state/rubric-slim/u1-l1-6-review.md`, one table per question: element id · old flag · new flag · one-line reason.
2. **Teacher review** of that table. Teacher may flip any element back. Nothing proceeds without it.
3. **Rebuild**: `node scripts/build-frq-rubrics.mjs`; run `tests/frq-rubrics-bundle.test.js`,
   `tests/frq-grading-standard.test.js`, `tests/frq-rubric-transparency.test.js`,
   `scripts/build-misconception-rubric-map.mjs --check`, the M2B golden, then the ROOT suite. New test
   `tests/rubric-slim.test.js`: the 6 pilot files have ≤4 required per question (avg ≤3), ≥1 required per question, and
   the full id set equals a pinned snapshot (ids never vanish).
4. **Ship** the prompt files + bundle (GH Pages + Railway worker read the committed bundle).
5. **Regrade, dry-run first**: `tools/regrade-ungraded-frqs.mjs --regrade-low` restricted to U1 L1–6 textarea ids
   (add a `--lessons` filter if the tool lacks one). Dry-run prints the old → new verdict per row; teacher reads a
   sample of 10 raised rows before `--apply`.
6. **Measure** (acceptance): before/after E-rate on the pilot rows; count of rows raised vs held; and the
   misconception panel's "Most frequent this window" — video-recall labels such as the Flint element should fall
   out because a demoted element is no longer reported as `missing`.

## Acceptance

- ≤4 required per pilot question, average ≤3; id snapshot unchanged; all suites at baseline.
- Zero verdicts lowered (assert from the regrade output, real rows — not a fixture).
- Teacher reads 10 raised rows and agrees ≥8 deserved the raise. Below that, the demotions were too aggressive:
  revisit step 2 before any rollout.

## Rollout after the pilot (separate decision)

U2 → U9 in unit order, U7/U8 first if the teacher prefers to fix the worst (7.5 avg, max 12) before students reach
them. Those units have no student rows yet, so there is no regrade — only steps 1–4. At ~150 questions this is
the point to have Codex draft the review tables, one unit per dispatch, teacher review per unit.

## Out of scope

- PC misconception import and `PC_TRACK_ENABLED` — separate spec (`PC_MISCONCEPTIONS_SPEC.md`, pending the
  AP Classroom export sample). The flag stays OFF until PC rows exist; Unit 1's PC comes due 2026-10-13 (B) /
  2026-10-16 (E).
- Any change to bands (P85/I60), the provisional floor, or the exit-ticket bonus values.
- Schoology: best-wins sync carries raised grades up on its normal run; no manual sync.

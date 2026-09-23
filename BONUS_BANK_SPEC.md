# Bonus Bank — hand-graded bonus sheets, held to quarter close

Status: DRAFT for teacher review (2026-09-23). Not built.

## What the teacher told students

Bonus sheets (the weekly DOK-3 sheets, starting with "Screen Time, Two Deletions") are
graded by hand, **held until the end of the quarter**, and then placed "wherever it helps
most." Until then they are not in the grade.

## Decisions (teacher, 2026-09-23)

1. **Work track only.** Bonus points are added to the Work track average, never to PC.
   PC stays the one number only mastery can move.
2. **The floor switch is allowed.** If the bonus lifts Work from under 40% to 40% or more,
   the quarter formula flips from `max(0.7·PC, 0.7·Work, mean)` to `max(PC, Work)`.
   Effect is deliberate: it rewards a student who did the extra work. With zero other work
   a student needs eight E sheets to flip; Q1 has at most seven, so the all-bonus route
   tops out at 70 this quarter.
3. **Placement is not published.** Students see that a bonus is banked and what it scored.
   They do not see the placement rule.
4. **Points:** E = +5, P = +3, I = +1 (the exit-ticket scale), applied to the Work track
   percentage. Quarter grade ceiling stays 100.

## Data model

Ledger rows only, no new tables. Written ONLY by teacher-authenticated routes (the
generic student `/ledger/record` route rejects these sources with 403).

```
source:   'bonus'                    one row per student per sheet
itemId:   BONUS-<sheetId>            e.g. BONUS-U1-screen-time
score:    5 | 3 | 1                  E=5, P=3, I=1 (numeric so the upsert is simple)
response: {"grade":"E","quarter":"Q1","title":"Screen Time, Two Deletions"}   (JSON string)
attempt:  1                          re-entering the same sheet upserts in place

source:   'bonus_applied'            one row per student per quarter, written by the apply step
itemId:   BONUS-APPLIED-<quarter>    e.g. BONUS-APPLIED-Q1
score:    the adjusted closed-quarter grade
response: {"points","workBefore","workAfter","frozenGrade","adjustedGrade","switched","sheets","appliedAt"}
```

Migration `0036_item_ledger_bonus_source.sql` adds both sources to the ledger's source
allow-list (teacher runs it by hand; routes answer 503 with that hint until then).

The grade engine **ignores** both sources entirely (early filters in `computeGrade`,
`computeLessonGrades`, mastery and rollup). Nothing about the live grade changes when a
bonus is entered.

## Surfaces

- **My Ledger (student):** a "Bonus banked" line per sheet: `Screen Time, Two Deletions — E
  (+5, applied at quarter close)`. No placement wording.
- **Teacher dashboard, Quarter Close & Bonus:** after **Freeze**, a new **Apply banked
  bonus** button. It computes, per student, from the frozen tracks:
  `newWork = min(100, workAvg + sum(points))`, recomputes the quarter grade with the
  existing formula, and shows an audit table: student · frozen grade · banked points ·
  Work before/after · switch flipped? · new grade. Nothing is written until the teacher
  confirms. On confirm, `appliedAt` is stamped and a `quarter-adjustment` row records the
  new quarter grade as the closed-quarter value (the number that goes to Schoology).
- **Schoology:** the sync already treats the frozen closed-quarter value as authoritative
  for the quarter column; no change.

## Entry tool

```
node scripts/enter-bonus.mjs <file>            # dry run: name matches + what would be written
node scripts/enter-bonus.mjs <file> --apply    # POST /class/bonus
```
Input file (kept OUTSIDE the repo, it holds names):
```
sheet=U1-screen-time quarter=Q1 title=Screen Time, Two Deletions
Real Name|E          ← or roster username; E, P or I
```
Matching is exact (case-insensitive, whitespace-collapsed) on real name or username.
Unmatched or ambiguous names are listed and the run refuses `--apply` until the file is
fixed. Never guesses.

Routes: `POST /class/bonus`, `GET /class/quarter/deltas` (now carries `bonus` per
student), `POST /class/quarter/apply-bonus` (`dryRun` defaults to true; only a literal
`dryRun:false` writes). Full contracts: `state/bonus-bank-backend-report.md`.

## Tests

- Engine: a `source:'bonus'` row never changes `computeQuarterV3` output (property test
  over the existing sim world).
- Quarter close: the switch case (Work 35 + 5 → 40 → grade = max(PC, Work)), the ceiling
  case (Work 98 + 5 → 100), and idempotence (applying twice does nothing).
- Ledger UI: banked line renders from a bonus row with no placement text.

## Out of scope

- Any mastery gate on the A (e.g. "PC ≥ 70 for a grade over 90"). Revisit only with Q1
  PC data in November, and only if the teacher raises it.
- Bonus on PC. Never.

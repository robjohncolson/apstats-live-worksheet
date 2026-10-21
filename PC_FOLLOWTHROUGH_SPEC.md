# PC_FOLLOWTHROUGH_SPEC.md — Progress Check follow-through: per-part rows, the MCQ/FRQ blend, the AP Classroom reconcile, and the completeness panel

Status: BUILT 2026-10-20 (Opus 5.5 implemented; Codex astra review RED -> 6 findings folded, 1 rejected: the teacher
dashboard already shows real names behind the secret). Accepted deviations: legacy REST rows keep max(A, REST) until a
per-part row exists (1.3 as written would have moved the banana_otter provisional 75 before the first reconcile); never-lower is
per PART (a replacement may never lower a stored part; the first reconcile may still lower a unit's blend, listed as
`PC % DROPS`); reminder drafts are written in dry runs too (private file). Weekday in the draft comes from the date.

## 0. Teacher decisions (2026-10-20, verbatim intent)

1. "PC combine should be a blend. FRQ is weighted 1/2, MCQ (total) is weighted 1/2." Today the engine takes the MAX of
   the Part A paper row and the REST paper row (`scorePcRows`, roster-server/scoring.js), so a 17/18 on Part A hides a
   weak REST. That changes to a blend.
2. "Placeholder, please fix." The /26 and /16 placeholder rows exist only because parts land on different days. With one
   ledger row per PART the placeholders disappear: a missing part is simply absent until it lands.
3. "The deadline is 10/23. Whatever she has will close and be graded at that point, so 10/24. If she didn't do the work
   she'd get a zero with a comment, and she'd schedule a retake." A close date per (section, unit): after it, unsubmitted
   parts become explicit 0 rows carrying a note. A retake is the existing online makeup path (best-wins, never lowers).
4. "Dashboard panel sounds good." A Progress Check completeness panel on teacher-dashboard.html.
5. "Departed, yes please do the exclude list." Students still in AP Classroom but gone from the class are skipped.
6. "q, w, e sounds good": the assignment registry, the nightly reconcile on Athena, and the FRQ grading queue
   (FRQ scoring stays a judgment task done in a Claude session with the pinned policy; the reconcile only REPORTS
   submitted-unscored FRQs and posts the numbers once AP Classroom shows a score).
7. Push without approval (given 2026-10-20). Roster-server auto-deploys; the Athena task is registered by the teacher
   once (print the exact `schtasks` line in the ps1 header, same as `tools/weekly_dok.ps1`).

Privacy rule that shapes every file below: the repo is PUBLIC on GitHub. No student real name, AP Classroom display
name, or score ever lands in a tracked file. Usernames (`banana_otter`) are pseudonyms and are allowed; the name map
and exclude list live in a PRIVATE file on Athena (same convention as `tools/schoology_read_grades.py`'s
`%USERPROFILE%/grade-backups/...`).

## 1. Engine: one ledger row per Progress Check part

### 1.1 Row shape (source `pc`, evidenceTier `proctored`, attempt 1, upsert)

```
item_id   U{n}-PC-{PART}-PAPER        PART in A | B | C | FRQ      (REST stays readable as legacy, see 1.3)
score     points / of, clamped 0..1
response  JSON string:
  { "part": "B", "points": 12, "of": 14, "origin": "apclassroom" | "paper" | "teacher",
    "note": "optional teacher/auto comment", "postedAt": "2026-10-20T23:10:00Z", "assignmentId": "81743327"? }
```

Legacy rows have `response: '(paper)'` and a score only. Everything that reads the response must tolerate a non-JSON
string (treat as `{}`).

### 1.2 `scorePcRows(rows, answerKey)` in roster-server/scoring.js — the blend

Keep the function name, signature, and return shape `{ units: { U#: { pct } }, totals: {} }`. Add `parts` to each unit
for the dashboard (see 1.4). New paper rule per unit:

```
mcqParts = present paper parts among A, B, C          (each: score 0..1, weight = of)
frq      = paper FRQ part (score 0..1) or absent

weight(part) = response.of if it parses as a positive number
             = PC_PART_POINTS[unit]?.[part]  (grade-config.js default table, U1: A 18, B 14, C 12, FRQ 16)
             = 1 otherwise

mcqHalf  = sum(score_i * weight_i) / sum(weight_i) over mcqParts        (absent when no MCQ part)
frqHalf  = frq.score                                                      (absent when no FRQ row)
paperPct = 100 * (0.5 * mcqHalf + 0.5 * frqHalf)   when both present
         = 100 * mcqHalf                            when only MCQ parts exist
         = 100 * frqHalf                            when only FRQ exists
unit pct = max(onlineMean, paperPct)   (unchanged best-wins against the online makeup mean; a makeup only raises)
round to 0.1 as today
```

A part posted with `points: 0` is PRESENT with score 0 (the deadline zero). An absent part is excluded, never 0.

### 1.3 Legacy REST rows (`U{n}-PC-REST-PAPER`, the (B + C + FRQ) / 42 convention)

Ignored for a unit as soon as ANY of that unit's B, C, or FRQ per-part rows exists. When none exists (a unit that has
not been reconciled yet), REST is treated as one MCQ-side part with weight `of` (default 42) so nothing regresses before
the first reconcile. No deletion route; the reconcile posts per-part rows for everyone with data and REST goes quiet.
Pin this with a test: A 5/18 + REST 12/16 (the banana_otter provisional) -> today's number; add FRQ 12/16 per-part -> REST ignored,
pct = 100 * (0.5 * 5/18 + 0.5 * 12/16) = 51.4.

### 1.4 Expose the parts

`scorePcRows` returns `units[U#].parts = { A: { score, points, of, note, origin, postedAt }, B: ..., C: ..., FRQ: ..., REST?: ... }`
(only present parts). `computeGrade` copies it to `units[uKey].pcParts` next to `pcRawPct`. `/class/grades` therefore
carries it; nothing else in the engine changes. `unitPcData`, `pcRawToP`, the 40% gate: untouched.

### 1.5 Config

`roster-server/grade-config.js`: `PC_PART_POINTS = { 1: { A: 18, B: 14, C: 12, FRQ: 16 } }` exported, with a comment that
later units are added when their PC is built (the reconcile always posts `of`, so this table is only the legacy fallback).

### 1.6 Bundle / goldens

`scripts/build-grade-engine.mjs` MODULES: export the new pure helper `pcPaperBlend(partsByName, unit)` from scoring.js so
the offline bundle and tests can call it. Regenerate the bundle (`node scripts/build-grade-engine.mjs`) and whichever
goldens change (`node scripts/build-golden-synthetic.mjs` from roster-server; `UPDATE_M2B_GOLDEN=1 npx vitest run
tests/m2b-grade-invariance.test.js`; the exit-ticket golden via the recipe in its test header). Re-pin numbers by hand
with the arithmetic in a comment, never by copying the new output blindly.

## 2. Routes (roster-server/pc.js)

### 2.1 `POST /pc/grade` (teacher) — extended, backward compatible

Body: `{ studentUsername, unit, part, score? , points?, of?, note?, origin? }`.
- `part` now accepts `A | B | C | FRQ | REST` (REST only so the old import still works; log a deprecation line).
- If `points` and `of` are given: both finite, `of > 0`, `0 <= points <= of`; `score = points / of`. Else `score` (0..1)
  is required as today.
- `note`: string <= 300 chars, optional. `origin`: one of `apclassroom | paper | teacher`, default `teacher`.
- Writes the row of 1.1. Response unchanged plus `{ points, of }` when given.
- Validation errors stay 400 with the existing message style; 503 on 23514 as today.

### 2.2 `GET /pc/parts?section=PeriodE&unit=1` (teacher)

Returns `{ ok, section, unit, students: [{ username, studentId, parts: {A:{...},...}, pct }] }` built from the ledger
(latest attempt per item) through `scorePcRows`. This is what the dashboard panel and the reconcile's "never lower"
check read. Cheap: one `getLedgerByStudent` per roster row, as `/class/poster/convert` does.

### 2.3 `POST /pc/status` and `GET /pc/status?section=&unit=` (teacher)

The AP Classroom snapshot the reconcile saw last. Stored in a new table (migration `0043_pc_status.sql`, TEACHER-RUN):

```sql
create table if not exists pc_status (
  section text not null, unit int not null, payload jsonb not null,
  updated_at timestamptz not null default now(), primary key (section, unit));
```

Payload (no real names: usernames only; unmatched AP Classroom names are COUNTED, not stored):
```
{ "fetchedAt": iso, "assignments": { "B": "81743327", "C": "81743453", "FRQ": "81743492" },
  "closeDate": "2026-10-24", "unmatched": 1, "excluded": 1,
  "students": { "banana_otter": { "B": { "status": "not_submitted" | "in_progress" | "submitted" | "scored",
                                         "points": 12?, "of": 14?, "submittedAt": "..."? }, "C": {...}, "FRQ": {...} } } }
```
`GET` degrades to 503 `{ error: 'run migration 0043' }` on 42P01, like `/class/net-probes`.

### 2.4 Student copy

`/ledger/record` already 403s source `pc`. No student route changes.

## 3. Registry: `data/apclassroom-assignments.json` (tracked, public-safe)

```json
{
  "classId": "33",
  "sections": { "PeriodB": {}, "PeriodE": {} },
  "progressChecks": [
    { "unit": 1, "section": "PeriodB", "parts": { "A": { "of": 18, "origin": "paper" },
        "B": { "id": "81595010", "of": 14 }, "C": { "id": "81595024", "of": 12 }, "FRQ": { "id": "81595036", "of": 16 } },
      "dueDate": "2026-10-15", "closeDate": "2026-10-24", "active": true },
    { "unit": 1, "section": "PeriodE", "parts": { "A": { "of": 18, "origin": "paper" },
        "B": { "id": "81743327", "of": 14 }, "C": { "id": "81743453", "of": 12 }, "FRQ": { "id": "81743492", "of": 16 } },
      "dueDate": "2026-10-23", "closeDate": "2026-10-24", "active": true }
  ]
}
```
Part A is paper (entered by `scripts/import-pc-scores.mjs`, never reconciled). `active:false` retires an entry once a
unit is fully closed and zeroed. Period B's close date is 10/24 too (teacher: Zabdy and Angie Gamez FRQs still owed;
Rubiat's Part C; Olivia's paper row is a Part A matter and stays manual).

Private companion (NOT tracked), default path `%USERPROFILE%/grade-backups/apclassroom/roster-map.json`, override
`--roster-map`:
```json
{ "nameToUsername": { "Pear Cat": "pear_cat", "P Cat Cat": "plum_dog" },
  "exclude": ["Fig Owl"] }
```
Matching order: exclude list -> explicit map -> the same rules as `matchStudent` in scripts/import-pc-scores.mjs
(exact normalized full name, then last token + first initial, must be unique). Unmatched names are printed to the log
(the log dir is gitignored) and counted in the snapshot; they never fail the run.

## 4. The reconcile: `tools/apclassroom_pc_reconcile.py` (Athena, CDP, nightly)

Python 3, ASCII, LF, stdlib + the existing `tools/schoology_ops.py` connection (`ops.connect(reuse=True)` attaches to
the Edge rig profile that is already signed into Schoology; the teacher signs that same profile into AP Classroom once).

```
python tools/apclassroom_pc_reconcile.py --section PeriodE            # dry run (default): prints the plan, posts nothing
python tools/apclassroom_pc_reconcile.py --section PeriodE --apply    # posts rows + snapshot
python tools/apclassroom_pc_reconcile.py --section PeriodE --fixture tools/fixtures/apclassroom/periodE-u1/   # offline
python tools/apclassroom_pc_reconcile.py --section PeriodE --dump tools/.pc-reconcile-logs/periodE-u1/         # save page texts
```

Per active registry entry for the section:
1. For B and C: navigate `https://apclassroom.collegeboard.org/{classId}/assignments/progress/{id}?tab=RESULTS_STUDENTS`,
   wait for the table (poll `document.body.innerText` for the "Points Earned" header, up to 30 s), read innerText, parse
   student blocks: `Name`, `points` (`-` = not submitted; a bare number = submitted+scored), testing sessions, submitted
   date. The parser is a pure function over the text (`parse_results_students(text) -> {name: {points|None, sessions,
   submitted}}`) and is unit-tested against a SANITIZED fixture (fake names, same layout) checked in under
   `tools/fixtures/apclassroom/`.
2. For FRQ: `?tab=PROGRESS`, parse `Name  Status  Date Submitted ... Score` blocks: status `Submitted | In progress |
   Not started | Scored`, score `n/16` when scored. Pure `parse_progress(text)`.
3. Login detection: if the URL leaves apclassroom.collegeboard.org or the body contains "Sign In" without the table, exit
   code 2 with the line `SIGN IN NEEDED: open AP Classroom in the Edge rig profile`, post nothing, and (when `gh` is on
   PATH and `--apply`) open or comment on a GitHub issue titled `PC reconcile: sign-in needed` (dedupe by title, as
   `scripts/weekly-dok.mjs` does).
4. Build per-student parts: `{B:{points, of}, C:{...}, FRQ:{points, of}}` for scored parts only. Then for each student with
   at least one new/changed part: compare with `GET /pc/parts` (existing rows). Post `POST /pc/grade` with
   `origin: "apclassroom"` for each part whose (points, of) differs from the stored row. NEVER LOWER: if the resulting
   blend for the unit (recompute with the same rule, implement `paper_blend` in Python mirroring 1.2 and test it against
   the same numbers as the JS test) would be lower than the stored `pct`, skip that student, print `WOULD LOWER`, and
   count it in the report. A lower value only ever happens when AP Classroom was corrected downward; the teacher decides.
5. Deadline close: when today (school date, reuse `today_school_date()` from schoology_sync_section.py) >= `closeDate`,
   every part among B, C, FRQ that is `not_submitted` or `in_progress` (no score) and has no stored row gets
   `points 0, of <registry of>, note "Not submitted by {dueDate}: scored 0. Schedule a retake with Mr. Colson."`,
   origin `apclassroom`. Idempotent: a stored 0 row with the same note is not re-posted. A stored non-zero row is never
   overwritten by a zero. Zeros also appear in the snapshot as `status: "zeroed"`.
6. Snapshot: `POST /pc/status` with the payload of 2.3 (always, even in dry run? NO: dry run posts nothing at all).
7. Report: one block per section to stdout and the log: counts posted / skipped-same / would-lower / zeroed /
   unmatched / excluded / needs-scoring (FRQ submitted, unscored -> the Claude session's queue), plus the per-student
   lines with USERNAMES only (never names) in the log file; names may appear on stdout only when `--names` is passed.

### 4b. Reminder drafts the day before a due date (teacher 2026-10-20: "check AP Classroom for who still has yet to
do their work, and then prepare messages to send to them in Schoology; I look them over and say yes or refine, and
you send")

8. When today (school date) == `dueDate - 1 day` for an active entry, or `--remind` is passed, the reconcile writes
   `reminders-{section}-U{unit}-{date}.json` into the log dir (PRIVATE, gitignored) with one entry per matched student
   who has at least one part among B, C, FRQ with status `not_submitted` or `in_progress`:
   ```
   { "section": "PeriodE", "unit": 1, "dueDate": "2026-10-23", "draftedAt": iso,
     "students": [ { "username": "banana_otter", "displayName": "<AP Classroom name>", "missing": ["B", "C"],
                     "message": "Hi <first name>, the Unit 1 Progress Check closes Friday 10/23 at 1:15 PM. AP Classroom
                                 still shows MCQ Part B and MCQ Part C unsubmitted. Anything not turned in by then is scored
                                 0 and you would need to schedule a retake with me. You can finish them from AP Classroom
                                 tonight or during class. - Mr. Colson" } ] }
   ```
   The message is a deterministic template (`draft_reminder(first_name, unit, due_date_text, missing_parts) -> str`,
   unit-tested; part names rendered as "MCQ Part B", "MCQ Part C", "the FRQ"; the weekday comes from the due date).
   Excluded students never get a draft. The snapshot (`POST /pc/status`) gains `"reminders": { "draftedAt": iso,
   "count": n, "sent": false }` so the dashboard can show it.
9. Sending is NOT automated by this spec. The main Claude session reads the draft file, shows the teacher the list
   (name, missing parts, message), takes "yes" or edits, and sends each message through Schoology in the teacher's
   signed-in browser (Claude in Chrome), then updates the snapshot's `reminders.sent` to true via `POST /pc/status`
   with the same payload plus the flag (the route merges: when the body has only `reminders`, update that key).
   Record the sent list in the same JSON file (`sentAt`, per-student `sent: true`). Nothing in this flow writes a
   student name into a tracked file.
10. The dashboard panel (§5) shows a line above the table when the snapshot has `reminders` with `sent: false`:
    "N reminder drafts waiting (drafted <date>)".

Secrets: `ROSTER_TEACHER_SECRET` from the environment only (as the daily sync); base URL `--base` default prod.
Never print the secret. HTTP via urllib, 20 s timeouts, one retry.

Scheduling: `tools/daily_pc_reconcile.ps1` (-Section, -Apply, -LogDir; dry run by default; logs under
`tools/.pc-reconcile-logs/`, gitignored) and `tools/register_pc_reconcile_task.ps1` (defaults: 16:00 daily for PeriodB,
16:10 for PeriodE, BEFORE the 16:30/16:45 Schoology syncs so the PC column carries the new number the same evening).
The ps1 header prints the two `schtasks /Create` lines for the teacher.

## 5. Dashboard panel: Progress Check completeness (teacher-dashboard.html)

A new `.section` directly under the existing PC makeup section (`#pc-makeup-section`): title "Progress Check
completeness", section selector reuses the page's current section, unit select (default 1), Refresh button, meta line
(`AP Classroom snapshot from <fetchedAt>` or `No snapshot yet: run tools/apclassroom_pc_reconcile.py`), and one table:

| Student | A | B | C | FRQ | PC % | Note |

Cell content per part, from `GET /pc/parts` (posted) overlaid with `GET /pc/status` (AP Classroom):
- posted: `12/14` (title attribute shows origin + postedAt); zeroed: `0/14` with class `pc-zero`;
- not posted but AP Classroom says `scored`: `12/14 · not posted` (class `pc-pending`);
- `submitted`, unscored FRQ: `needs scoring` (class `pc-needs-scoring`); `in_progress`: `in progress`; else `—`.
- PC % = `units.pcRawPct` style number from `/pc/parts` (`pct`), Note = the latest part note (textContent only).
Sorted by PC % ascending so the students who need attention are on top. Everything through `textContent`/`escHtml`,
same helpers the page already uses (`studentNameHtml`, `fetchJson`, `teacherSecret`). 503 on either call renders the
migration hint instead of an error banner. A jsdom test in `tests/teacher-dashboard-pc-completeness.test.js` renders
the panel from fixture payloads (fake usernames) and asserts the five cell states, the sort, and that no raw HTML from a
note is injected.

## 6. Student-facing copy

Grep for any student copy that describes the Progress Check as "best of" its parts or mentions placeholders
(`lib/effort-facts.js`, `start-here.html`, the Desk rules modal, `ai-tutor/` is content, skip). If a sentence describes
the combination, make it say: "Your Progress Check grade is half the multiple-choice parts and half the FRQ." Do NOT
add new copy where none exists. Never print 100/85/60 or any "80% = done" wording. Any Desk edit requires
`node scripts/bump-build.mjs` + LF normalization before commit.

## 7. Migration of the rows that exist today

No SQL. After deploy, the main session runs the reconcile in `--fixture` mode with the page texts captured on
2026-10-20 (Period E: B, C, FRQ tables already read; Period B: read fresh) and `--apply`, which posts B, C, FRQ per-part
rows for every matched student in both sections. The REST rows then go quiet under 1.3. Expected spot checks:
- `banana_otter`: A 5/18, FRQ 12/16, B and C absent -> PC 51.4, quarter 89 (Work) + early bonus.
- `pumpkin_deer`: A ?, B 13/14, C 12/12, FRQ 14/16 -> MCQ half = (A + 25)/(18 + 26); check by hand in the report.
- Nobody's quarter grade moves DOWN except where a 17/18 Part A was masking a weak REST; list those students in the
  report so the teacher sees them in the morning.

## 8. Tests (all must be green before commit)

- roster-server: `tests/pc-paper-blend.test.js` (new: blend arithmetic cases incl. 1.3, zero rows, legacy `(paper)`
  rows, `of` fallback table, online best-wins still max), `tests/pc.test.js` (route: points/of validation, note length,
  origin default, REST deprecation path), `tests/pc-parts-status.test.js` (new: `/pc/parts`, `/pc/status` get/post/503),
  existing `pc-grade-wiring.test.js` re-pinned where the max->blend changes a number (comment the arithmetic).
- root: `tests/teacher-dashboard-pc-completeness.test.js` (new), `grade-engine` bundle parity test, goldens.
- pytest: `tests/test_apclassroom_pc_reconcile.py` (parsers on the sanitized fixtures, `paper_blend` parity with the JS
  numbers, never-lower, deadline zeroing, exclude + map precedence, login-needed exit code; HTTP mocked).
- Run `npm test` at root, `cd roster-server && npm test`, `pytest tests/`. Pre-existing Windows failures are listed in
  memory `reference_windows_root_test_failures`; anything else red is yours.

## 9. DO / DON'T for the implementer

- DO edit in place; no wrapper functions, no new abstraction layers; early returns; skimmable code (CLAUDE.md style).
- DO run `impact` (GitNexus) on `scorePcRows`, `computeGrade`, and the `/pc/grade` handler before editing and note the
  blast radius in your report; `detect_changes` before you hand back.
- DO keep every new file ASCII + LF; Python runs with `python -I` in tests.
- DON'T put a real name, an AP Classroom display name, or a live score in any tracked file; fixtures use fake names.
- DON'T touch `ap_stats_roadmap_square_mode.html` unless §6 finds copy to fix (then bump-build).
- DON'T commit or push; report the changed file list, test output, and any spec deviation with a reason.
- DON'T stop any process you did not start; never `taskkill` by image name.
- DON'T use `git stash`.

## 10. Rollout order (main session)

1. Opus builds; Codex astra reviews read-only (VERDICT + file:line findings); fold findings; tests green.
2. `detect_changes`, bump-build if the Desk changed, commit, `PUSH_APPROVED`, push (pre-approved 2026-10-20).
3. Teacher-run later: migration 0043 (status table; everything else works without it), AP Classroom sign-in in the
   Edge rig profile on Athena, the two `schtasks` lines. Until then the main session runs the reconcile in fixture mode.
4. §7 data migration, spot checks, morning report to the teacher.

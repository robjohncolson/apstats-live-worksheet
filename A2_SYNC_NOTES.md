# A2_SYNC_NOTES.md — changes in the Algebra 2 fork worth syncing here

The Algebra 2 fork at `../../algebra2-live-worksheet` is a fresh-history snapshot of this AP Stats platform repo taken 2026-09-13.
Nothing is shared at runtime: the fork has its own Supabase, Railway, and secrets.
This file is an append-only running log, with the newest entry first.

## 2026-09-13 — "This week" student announcement chip (teacher decision)

Teacher: "every week has a small chip/announcement that's given by the principal on the saturday/sunday before the week via e-mail" → the Desk should carry a one-line, teacher-typed, **student-facing** note for the current week.

Teacher rule: "make sure it's only student facing knowledge."

### Contract being built in the fork

Port as-is if wanted.

| Surface | Contract |
|---------|----------|
| Public endpoint | `GET /announcement` in `roster-server` returns `{ text, weekOf, updatedAt }` or `{ text: null }`. |
| Teacher endpoint | `PUT /teacher/announcement` requires teacher auth and accepts `{ text, weekOf }`. |
| Validation | `text` is plain text, at most 280 characters. The server rejects anything containing an email address, a phone number, or a URL using regex checks to help prevent accidental staff-only material leaks. |
| Week selection | `weekOf` is the Monday, in the school timezone, of the week the note is for. GET only returns the note whose week contains today. |
| Storage | One table, `announcements(week_of date primary key, text, updated_at, updated_by)`, added via a migration. |
| Desk | The Do Now card shows a "This week" chip when GET returns text; nothing when null. |
| Teacher editor | Teacher menu → Pacing editor gets a textarea with a live character counter and the visible hint below. |

Editor hint: "Students see this. Student-facing info only — no staff names, no PD, no private data."

### Tests and weekly source

- Endpoint auth and validation: 280-character limit, email/phone/URL rejection, and week selection.
- Desk chip renders when text is present and does not render when null.
- Editor hint is present.

The source of weekly items is the principal's Sunday email. The teacher retypes only the student-relevant lines, such as "Open House Thu 6–8pm" or "Wed 9/30 half day". Never paste the email.

## 2026-09-13 — other fork changes this repo may care about

- Cross-agent runner (`Agent/runner/cross-agent.py`) gained `--max-files-changed N` (0 = unlimited) and `--allow-verification`; defaults are unchanged. Useful here for large Codex tasks.
- The Lesson_planning LaTeX ingest parser had a nested-brace bug that leaked `\answer{}` blocks into student prompts (fixed there). If any tool here reuses that parser pattern, check it.
- Fork's answer-leak guard test pattern: for every lesson content file, assert no student prompt contains `\answer{`, `\te{`, or `Answer key`. Cheap to add here for `ai-grading-prompts*` consumers.
- District SY26-27 pilot grading policy (Assessments 50 / Assignments 40 / Engagement 10, minimums 4/10/10) is implemented in the fork as `roster-server/district-grade.js` behind `useDistrictFormula`; AP Stats keeps v3. If the department applies the policy to AP Stats too, that module ports cleanly.

How to add an entry: insert a dated section above the existing entries with the fork change, relevant paths or contract, and porting notes; preserve older entries.

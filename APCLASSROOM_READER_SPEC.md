# AP Classroom reader v2: Grok Bot reads, the server keeps, Athena reconciles

Status: DRAFT 2026-11-15, for the teacher's review. Nothing here is built yet.
Builds on: `roster-server/apclassroom-pages.js` (fa `64464342`), `tools/apclassroom_pc_reconcile.py`,
`tools/daily_pc_reconcile.ps1`, PC_FOLLOWTHROUGH_SPEC.md section 4.

## 1. Who does what

| Actor | Job | Holds |
|-------|-----|-------|
| **Grok Bot** (the teacher's primary bot, routine "AP Classroom progress scrape", weekdays about 3:40 PM) | Opens each page in `data/apclassroom-page-urls.json`, waits for the table to settle, POSTs the text. Read-only in AP Classroom. | `APCLASSROOM_PAGE_KEY` only (write-only, authorizes nothing else) |
| **roster-server** | Stores the latest page per assignment (durably, section 3), reports reader health. | the pages |
| **Athena** (`ApStatsPcReconcileB` 16:00, `ApStatsPcReconcileE` 16:10, `-Pages server`) | Runs the reconcile: matches names, posts `/pc/grade` rows, never lowers, zeroes only after close. | `ROSTER_TEACHER_SECRET` |
| **Ops** (cloud chief of staff) | Coordination only. Does NOT run a second reader. | nothing |

The grade-writing step stays on Athena with the teacher secret. No bot ever holds the teacher secret or
posts `/pc/grade`. One reader only: if the routine moves from Grok Bot to Ops, the old one is turned off
the same day.

## 2. What goes wrong today (logs 11/11 to 11/15)

1. **A deploy forgets every page.** The store is in memory. Sunday 11/15 both runs read "not on the
   server" for every page (count 0 after the push). Any push between 3:40 and 4:10 PM on a school day
   does the same.
2. **Weekends and holidays read as failures.** The routine runs weekdays; the Athena tasks run daily.
   Saturday's pages are about 24 h old (fine), Sunday's about 48 h (over the 30 h limit), so Sunday is
   "failed" on status.html for no real reason.
3. **One unready part blocks the whole unit.** `server_entry_pages` raises on the first missing or
   half-painted part and the entry is skipped. Unit 2 Part A is open now; B, C and FRQ open on the PC
   days (B 11/30-12/01, E 12/04-12/07). From the due date until every part has a table, Part A is not
   reconciled.
4. **The FRQ page can be saved before its scores load** (the 0/0 early paint), and a status-only FRQ
   page is indistinguishable from one the sender gave up on.
5. **Nobody learns the reader is signed out.** A College Board sign-out shows up only as missing
   pages the next day.

Already fixed, not in scope: a future check with no score table is NOT OPEN YET, not a failure (`44496ba5`).
Stale memory, now false: "pages arrive about 7:44 PM". The routine runs about 3:40 PM.

## 3. Server: keep the pages (roster-server, grade-adjacent, flag on deploy)

- Migration `0046_apclassroom_pages.sql`: table `apclassroom_pages` (`assignment_id text primary key`,
  `text text not null`, `bytes int`, `received_at timestamptz`, `state text`). Service-role only, RLS on,
  no anon policy. One row per assignment: a POST upserts (latest wins), same as today.
- `createApclassroomPages({ db })`: write-through. POST writes the row, then the memory map. The GET
  routes read memory first and fall back to the table, so a restart loses nothing. If the table is
  missing (migration not run), it behaves exactly as today (memory only) and logs one line.
- Privacy unchanged: the text holds names and scores; it is served only behind teacher auth, never
  logged, and `/health` still shows a count and a time only. Retention: latest page per id only.
- **Page state.** The POST accepts an optional header `x-page-state`: `settled` (default) or
  `timed-out` (the sender waited its full time and the table never settled). Stored as `state`;
  returned by `GET /admin/apclassroom-pages?ids=`.

## 4. Server: the reader reports each run

- `POST /admin/apclassroom-reader-run` (page key OR teacher), JSON
  `{ at, pagesTried, pagesPosted, timedOut, signInNeeded: bool }`. Counts and a flag only: no ids,
  no names, no text. Latest wins; stored in the same table family (or `job_results`, whichever the
  status tiles already read).
- `/health` gains `apclassroomReader: { at, pagesPosted, pagesTried, signInNeeded }`.
- `status.html` gains a tile **AP Classroom reader**: green = a run today (school days) with
  pagesPosted = pagesTried; amber = no run since the last school day, or some timed out; red =
  `signInNeeded`. On a weekend the last weekday's run counts as today's.

## 5. The reconcile (tools/apclassroom_pc_reconcile.py)

1. **Per-part, not per-entry.** In `--pages server` mode a part whose page is missing, stale,
   timed-out or half-painted is skipped ALONE ("PART NOT READY: U2 B ..."); the entry's other parts
   still run. Safe by construction: `build_plan` already ignores a part that is not in `pages`, so an
   unread part is never posted and never zeroed. The exit code is still 1 when any part was not ready
   on or after its due date, so the tile stays honest.
2. **Snapshot carry-forward.** `/pc/status` replaces the whole snapshot. For a part not read this run,
   copy that part's statuses from the previous snapshot (same pattern as `previous_unsent_reminders`)
   so the dashboard does not blank it.
3. **No new pages on a non-school day is not a failure.** When today is not a school day for the
   section (`data/lesson-schedule.json`) and the newest page is older than the age limit, print
   "NO NEW PAGES (no school today)" and exit 0. On school days nothing changes.
4. A `timed-out` FRQ page with no score column is reported as PART NOT READY, never as NEEDS SCORING
   for everyone.

Tests (pytest, `tests/test_apclassroom_pc_reconcile*.py`): one part missing posts the others; an
unread part is never zeroed after close; snapshot carry-forward; weekend exit 0; school-day stale
still exit 1; timed-out FRQ.

## 6. The routine's contract (what Grok Bot changes)

For each URL in `data/apclassroom-page-urls.json`:
1. Open it; wait for the table header ("Points Earned" for A/B/C, "Date Submitted" for FRQ).
2. Wait until it settles: A/B/C have a number after "(of " and at least one student row; FRQ shows
   no "0/0". Up to 60 s per page.
3. POST the page innerText to `/admin/apclassroom-page/<assignmentId>` with `x-page-key` and
   `x-page-state: settled`, or `timed-out` if step 2 ran out of time.
4. A page with no table at all (a check that is not open yet) is POSTed only if it carries a marker;
   otherwise skipped and counted as tried. (The server rejects text without "Points Earned" or
   "Assessment Progress".)
5. If AP Classroom shows a sign-in page, stop and send the run report with `signInNeeded: true`.
6. Always end with `POST /admin/apclassroom-reader-run`.

Never: click anything that changes an assignment, score or setting; store page text anywhere else;
put names or scores in a message to Ops, Claude or the teacher's chat.

## 7. Phase 2 (separate sign-off): read-only Schoology check

After the 4:30/4:45 PM syncs, about 5:00 PM, Grok Bot reads each section's Schoology gradebook and
POSTs it to a new page-key route; the server compares it with the values the sync meant to write and
shows "N cells differ" on a status tile. Open question for the build: the gradebook's own CSV export
is far easier to compare than page text; check whether Grok's session can download it. Grok never
types in Schoology.

## 8. Open questions for the teacher

1. DECIDED 11/15: the reader stays on the primary Grok Bot. One reader only.
2. DECIDED 11/15: Unit 2 dueDate = the last PC day, PeriodB 2026-12-01, PeriodE 2026-12-07 (set in
   `data/apclassroom-assignments.json`).
3. DECIDED 11/15: Grok Bot runs migration 0046 through its Supabase connector, after the teacher OKs the exact SQL.

## 9. Build order

1. Section 5 (Python only, no deploy) + tests.
2. Section 3 + migration + roster-server tests; deploy outside a B or E block.
3. Section 4 + status tile.
4. Send the section 6 contract to Grok Bot; watch one school day's run.
5. Phase 2 only after its own sign-off.

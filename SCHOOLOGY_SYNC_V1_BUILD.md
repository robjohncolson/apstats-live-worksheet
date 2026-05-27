# Schoology Grade Sync v1 -- BUILD spec

Session 119+ (queued post-level-editor stress-test per
[[authoring-tool-stress-test]]). Pivot from the s119 level-editor
arc to the bigger-leverage workstream: stop manually retyping
grades into Schoology that already exist as structured data in
Supabase.

## Goal

Push grades from the gradebook (Supabase) into the teacher's
Schoology gradebook via browser automation, on demand (V1) and
eventually on schedule (V2+). The teacher never opens Schoology
to enter grades again -- only to verify that the auto-sync
worked.

## Non-goals

- Programmatic Schoology login. District uses Microsoft SSO;
  automating SSO is fragile and trips bot detection. V1 reuses
  a real Edge session cookie captured via manual sign-in.
- Schoology API integration. District does not issue teacher API
  keys; the REST API path is closed. CDP browser automation only.
- Schoology -> Supabase sync. One-way only. Supabase is source of
  truth. Manual teacher edits in Schoology between syncs get
  overwritten on next run -- this is documented + intended.
- Multi-teacher support. V1 is single-teacher (the user). V2 can
  generalize if other teachers want in.
- Cron / scheduled runs on Railway. V1 is manual trigger only.
  V2 layers cron once the cookie-capture + Railway upload flow is
  designed.

## Phasing & ship gate per phase

| Phase | Scope | Ship gate |
|---|---|---|
| P0 Discovery | Test login + gradebook DOM in edge.py rig | Can manually navigate to gradebook + identify cell selectors |
| P1 Manual one-shot | Hardcoded script enters ONE grade for ONE student in ONE existing lesson | Edge opens, grade lands in correct cell, verified in browser |
| P2 Section sync | Loop over one section: auto-create missing assignments, push all current grades, idempotent re-run | Re-running produces 0 changes (delta logic works) |
| P3 Dashboard log view | Teacher dashboard surfaces sync_log table; no trigger button yet | Last 10 runs visible with counts |
| P4 (V2) Cookie capture + Railway cron | Move to scheduled runs | TBD; out of V1 scope |

Each phase commits its own BUILD doc + tests + implementation.
P0/P1 land in one session if discovery is clean.

## Architecture (V1)

```
+-------------------+       +-------------------+      +-------------------+
| Teacher laptop    |       | Supabase          |      | Schoology web UI  |
|                   |       |                   |      |                   |
| python tools/     |--read-| schoology_*       |      |                   |
|   schoology-      |       |   tables          |      |                   |
|   sync.py         |--read-| roster, grades    |      |                   |
|       |           |       |                   |      |                   |
|       v           |       |                   |      |                   |
| edge.py rig       |---------------- CDP --------------> Edge browser     |
|       |           |       |                   |      |   (logged in)    |
|       |           |--write| schoology_grade_  |      |                   |
|       v           |       |   sync (deltas)   |      |                   |
| Edge profile dir  |--write| schoology_sync_   |      |                   |
| (persisted cookie)|       |   log             |      |                   |
+-------------------+       +-------------------+      +-------------------+
```

- All sync logic runs on the teacher's laptop.
- Edge profile dir at `%TEMP%/edge-claude-cdp` (the same one
  `tools/cdp/edge.py` already uses) holds the Schoology session
  cookie. Login happens ONCE in real browser; cookie persists
  until Microsoft SSO expires (typically 30 days).
- Supabase holds the source-of-truth grades + the sync tracking
  tables. Railway roster-server doesn't run the sync but DOES
  expose read-only endpoints for the dashboard log view.
- No credentials stored anywhere. Cookie lives in profile dir,
  which is on the teacher's machine.

## File layout

```
follow-alongs/
  tools/
    cdp/
      edge.py                 # existing rig, REUSED
    schoology-sync.py         # NEW main entry point (V1)
    schoology-capture.py      # NEW thin helper (V2, deferred)
  tests/
    schoology-sync.test.js    # NEW (V1) -- mocks Schoology DOM
roster-server/
  routes/
    schoology-log.js          # NEW read-only endpoints for dashboard
  migrations/
    0008_schoology_sync.sql   # NEW tables (user-run)
SCHOOLOGY_SYNC_V1_BUILD.md    # this doc
```

## Auth model

V1 reuses the existing `edge.py` rig's dedicated profile dir.
The teacher logs into Schoology ONCE manually:

```
python tools/cdp/edge.py --url "https://<district>.schoology.com" --keep
```

This opens Edge to the Schoology login page in the dedicated
profile. Teacher clicks through Microsoft SSO (including 2FA if
applicable). The session cookie is now in the profile dir.

Every subsequent sync run reuses the profile -- no auth happens
inside the sync script. If the cookie has expired, the sync
detects "login page rendered, gradebook not reachable" and exits
with a clear error: "Schoology session expired -- run
`python tools/cdp/edge.py --url https://<district>.schoology.com
--keep` and sign in, then re-run the sync."

V2 (Railway cron): the cookie gets captured locally + uploaded to
Supabase encrypted (AES-256-GCM, matching the existing roster
password lifecycle). Railway Playwright headless run pulls + sets
the cookie before navigating to gradebook. Out of V1 scope.

## Data model (Supabase)

Three new tables. Migration `0008_schoology_sync.sql`, user-run
(matches the s116-118 user-runs-migrations pattern).

```sql
-- One row per Schoology gradebook column (assignment).
create table schoology_assignment (
  id                       uuid primary key default gen_random_uuid(),
  section                  text not null,
  lesson_key               text not null,        -- e.g. 'U1.1', 'PC1', 'TEST_Q1'
  kind                     text not null check (kind in ('lesson','test','progress_check')),
  title                    text not null,        -- the title that lands in Schoology
  points                   integer not null default 100,
  due_date                 date,
  category                 text,                 -- Schoology gradebook category name
  schoology_assignment_id  text,                 -- nullable until auto-created in Schoology
  schoology_course_id      text,                 -- which Schoology course this assignment lives in
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (section, lesson_key)
);

-- Delta tracking: what value was last pushed to Schoology for each (student, assignment).
create table schoology_grade_sync (
  student_id               text not null,
  assignment_id            uuid not null references schoology_assignment(id) on delete cascade,
  last_synced_value        numeric,              -- nullable for "never synced"
  last_synced_at           timestamptz,
  last_attempted_at        timestamptz,
  last_error               text,                 -- error message if last attempt failed
  primary key (student_id, assignment_id)
);

-- One row per sync run.
create table schoology_sync_log (
  id                       uuid primary key default gen_random_uuid(),
  run_id                   text not null,        -- e.g. timestamp-based unique id
  section                  text,                 -- nullable for multi-section runs
  started_at               timestamptz not null,
  finished_at              timestamptz,
  success                  boolean,              -- nullable while in-flight
  assignments_created      integer default 0,
  grades_pushed            integer default 0,
  grades_skipped           integer default 0,    -- delta-skipped (same as last sync)
  errors_json              jsonb,                -- array of { kind, message, student_id?, assignment_id? }
  notes                    text,                 -- free-text human note
  created_at               timestamptz not null default now()
);

create index schoology_sync_log_finished_idx on schoology_sync_log(finished_at desc);
```

## Mapping rules (Supabase grades -> Schoology assignments)

Per the hybrid decision, the assignment kind is derived from
the `lesson_key`:

- `U<n>.<m>` (regular lesson) -> kind=`lesson`, points=100,
  title = `"Topic <n>.<m>: <title-from-lesson-schedule>"`,
  category = "Lessons"
- `PC<n>` or any key matching `progress_check` in the schedule
  -> kind=`progress_check`, points=100, title = `"Unit <n>
  Progress Check"`, category = "Progress Checks"
- `TEST_Q<n>` or matching key in the schedule -> kind=`test`,
  points=100, title = `"Quarter <n> Test"`, category = "Tests"

The lesson value pushed:
- For `lesson`: the unified `lessonGrade` from
  `roster-server/lesson-grade.js` (the same Cws-weighted score
  computed in Phase 6).
- For `progress_check` / `test`: the raw quiz/test score.

If `lessonGrade` is null/undefined (lesson not attempted), no
grade is pushed -- the Schoology cell stays blank (NOT zero;
treating no-attempt as zero is the gradebook's quarterGrade
job, not the sync's job).

## Sync flow (P2 full sync, one section)

Pseudo-code for `python tools/schoology-sync.py --section <X>`:

```
1. Connect to Supabase, load:
   - All students in section
   - All lessons in lesson-schedule.json scoped to section's
     quarter window
   - Existing schoology_assignment rows for section
   - Existing schoology_grade_sync rows
   - lessonGrade for every (student, lesson)

2. Determine ASSIGNMENT WORK:
   For each lesson_key in scope:
     If no schoology_assignment row exists -> needs auto-create
     If row exists but schoology_assignment_id is null -> auto-create
     Else -> reuse

3. Connect to Edge via edge.py rig (reuse profile).
   Navigate to https://<district>.schoology.com/courses/<course_id>/gradebook
   Detect "logged in" by checking for the gradebook header DOM.
   If login page is showing -> exit with "session expired" error.

4. AUTO-CREATE PHASE:
   For each lesson_key needing auto-create:
     - Navigate to Add Assignment UI
     - Fill title + points + due_date + category
     - Submit
     - Capture the new Schoology assignment id from the URL or DOM
     - Write back to schoology_assignment.schoology_assignment_id

5. GRADE PUSH PHASE:
   For each (student, lesson) pair:
     - Compute target value from lessonGrade
     - Compare to schoology_grade_sync.last_synced_value
     - If same -> skip (count as "skipped")
     - If different -> navigate to cell, type new value, save
       - On success: update last_synced_value + last_synced_at
       - On error: log error to errors_json, do NOT update last_*

6. Write summary to schoology_sync_log:
   - assignments_created, grades_pushed, grades_skipped, errors

7. Tear down browser. Print summary to terminal.
```

## Idempotency

Re-running the sync within the same session should produce 0
work (assignments_created=0, grades_pushed=0, grades_skipped=N).
Verified by:
- Assignment auto-create is gated on `schoology_assignment_id IS
  NULL` AND a pre-flight lookup-by-title in Schoology.
- Grade push is gated on `last_synced_value != current value`.

The delta is "value the SYNC last pushed vs current Supabase
value." NOT "value currently in Schoology vs current Supabase
value." This means a teacher-side manual edit in Schoology won't
trigger a re-push from the sync; only Supabase changes do.
Documented + intended.

## Auto-create idempotency (lookup-by-title)

Before creating a new Schoology assignment, the sync MUST do a
pre-flight check:
1. Load the section's existing assignment list (e.g., HTTP GET
   the gradebook page, parse the table)
2. Search by title (exact match to the title the sync would
   create)
3. If found, capture the id + write to schoology_assignment;
   skip create
4. If not found, proceed with create

Without this, a sync that crashed mid-create would on next run
create a duplicate column. The pre-flight step is mandatory.

## Failure handling

| Failure | Behavior |
|---|---|
| Session expired (login page shown) | Exit with clear instruction to re-run edge.py login flow |
| Schoology gradebook page slow / not loaded | Wait 10s, retry once, then exit with timeout error |
| Single grade write fails (cell unresponsive) | Log error to errors_json, continue with next student |
| Auto-create fails (form rejection, network) | Log error, skip all grade pushes for that assignment, continue with others |
| Student in Supabase not enrolled in Schoology section | Log warning, skip that student, continue |
| Grade value out of range (negative, >points, NaN) | Log warning, skip that grade, continue |
| Network outage mid-run | Catch, mark sync_log.success=false, write notes, exit gracefully |

The sync NEVER aborts the whole run for a single-cell failure.
Errors land in `sync_log.errors_json`; the dashboard surfaces
them so the teacher can investigate per-cell issues without
losing the rest of the run.

## Observability

P3 ships the dashboard view:
- New section on `teacher-dashboard.html`: "Schoology Sync Log"
- Table showing last 20 sync runs: timestamp, section,
  duration, counts (created / pushed / skipped / errors),
  success indicator
- Expand-row to see `errors_json` formatted as a list
- (P4) "Run sync now" button -- deferred until cookie-capture
  workflow lands

Read-only roster-server endpoints:
- `GET /schoology/sync-log?section=<X>&limit=20`
- `GET /schoology/sync-log/<run_id>` (full detail incl. errors)

No write endpoints on roster-server for V1 -- the sync writes
directly to Supabase from the local script.

## Test plan (P1 + P2)

- Vitest + jsdom for the DOM-parsing helpers (gradebook page ->
  assignment list)
- Mock the Schoology DOM with HTML fixtures captured during P0
  discovery (`tests/fixtures/schoology-gradebook.html` etc.)
- ~10-15 tests covering: assignment list parsing, cell selector
  generation, delta detection (current vs last_synced_value),
  error categorization

End-to-end CDP smoke (NOT in vitest -- manual):
- P1: enter one grade, verify in browser
- P2: full section sync, then immediate re-run, verify 0 work

## Open questions (resolve in P0)

1. **Schoology district URL pattern.** Confirm the actual base
   URL (`<district>.schoology.com` vs `app.schoology.com` vs
   custom domain). Affects all hardcoded navigation.

2. **Schoology course IDs vs section names.** Supabase uses
   section names like "PeriodB"; Schoology uses numeric course
   ids. Need a mapping table OR the sync grabs the course id
   from the section dropdown in Schoology on first run.

3. **Gradebook UI complexity.** Is the Schoology gradebook a
   plain HTML table with input cells, or a React-style
   single-page-app with virtual scrolling? Affects whether
   selectors are stable + whether we need to scroll into view
   before clicking each cell.

4. **Add Assignment form fields.** What does the auto-create
   form actually look like (which fields are required, what
   are valid values for category, what happens on duplicate
   title)? May need to handle field-by-field via screenshots
   in P0.

5. **Quarter window mapping.** Q1 = U1+U2+U3, Q2 = U4+U5, etc.
   per the Phase 6 grading model. Need to confirm Schoology
   has Q1/Q2/Q3/Q4 sections and how assignment categories
   align with them.

6. **2026-05-27 SCHOOLOGY UI VERSION.** Schoology releases
   change selectors. Capture a snapshot of the gradebook DOM
   during P0 as the baseline; if a future Schoology update
   breaks the sync, we re-snapshot.

## Risks (load-bearing for P0/P1)

1. **Bot detection.** Schoology may fingerprint navigator
   .webdriver or click cadence. Mitigations: realistic delays
   (~500ms between cells), use real Edge (not headless), low
   frequency. If account gets flagged, pivot to fully-manual
   workflow for affected sections.

2. **Schoology UI changes.** Each Schoology release could
   break selectors. Mitigations: stable selectors
   (aria-labels, role, semantic class names; avoid CSS-module
   hashed class names), capture before/after DOM snapshots on
   every breakage so re-targeting is fast.

3. **Browser memory / performance.** Edge with the school
   profile + gradebook is ~300-500MB. Acceptable for laptop.
   Concerning for Railway (V2) -- may need plan bump.

4. **Profile cookie expiry surprises.** Microsoft SSO sessions
   typically last 30 days but can be revoked by district IT
   at any time. The "session expired" path MUST be obvious
   and easy to fix (one terminal command).

5. **Auto-create duplicate columns.** Mitigated by mandatory
   lookup-by-title pre-flight. If pre-flight parsing is
   wrong, the sync could spam Schoology with duplicates;
   document the recovery procedure (manually delete dups,
   update schoology_assignment_id).

6. **The first run is high-stakes.** Pushing wrong grades into
   a real Schoology gradebook visible to students/parents is
   bad. Mitigations: P1 starts with a SINGLE student in a
   TEST assignment ("Sync Test 1") before touching real
   grades. P2 first run scoped to a section with student
   warning ("Grades may shuffle during sync test").

## P0 DISCOVERY (2026-05-27) -- COMPLETE

Probed live via the `tools/cdp/edge.py` rig. Teacher signed in
via MS SSO + 2FA + KMSI=Yes (session cookie now persists in
`%TEMP%/edge-claude-cdp` for ~90 days). All 6 open questions
answered with concrete selectors + IDs. Fixtures committed for
unit-test mocking.

### Fixtures captured (P0)

| File | Source | Purpose |
|---|---|---|
| `tests/fixtures/schoology-mycourses.html` | `/courses/mycourses` | Course/section enumeration for the teacher account |
| `tests/fixtures/schoology-gradebook-empty.html` | Algebra II Sec 10 gradebook | Empty-state DOM snapshot (no assignments) |
| `tests/fixtures/schoology-gradebook-apstats-sec1.html` | AP Stats Sec 1 gradebook | Empty-state DOM snapshot of the actual sync target |
| `tests/fixtures/schoology-add-assignment-form.html` | `course/<ID>/materials/assignments/add?is_popup=1` | Add Assignment popup form fields |
| `tests/fixtures/schoology-add-test-form.html` | `course/<ID>/materials/assignments/add_assessment?is_popup=1` | Add Test/Quiz popup form fields |
| `tests/fixtures/schoology-courses-map.json` | Structured | All 12 of the teacher's courses with ID -> name mapping; sync targets flagged |
| `tools/cdp/_shots/schoology-p0-*.png` | Throughout flow | Screenshots: initial nav, MS SSO, 2FA, KMSI, gradebook, course list, Add Assignment form |

### Q1: Schoology district URL pattern -- ANSWERED

- Base: `https://lynnschools.schoology.com`
- Auth federated to Microsoft SSO via OAuth: client_id
  `f97b3686-bc70-4fee-b56d-f45878420d15`, redirect_uri
  `https://app.schoology.com/login/external_accounts/receive/microsoft`
- The OAuth `state` token is single-use and bound to the
  session that initiated the authorize request. Implication:
  if the sync restarts mid-auth (e.g., CDP Edge respawn), the
  callback fails with "Could not validate authentication
  state." Remediation: navigate fresh to the gradebook URL
  after auth completes -- MS will round-trip silently because
  the user is already signed in.
- The `app.schoology.com` host appears only in the OAuth
  callback URL; the gradebook UI itself stays on
  `lynnschools.schoology.com`. Hardcode the district subdomain
  in `tools/schoology-sync.py`.

### Q2: Course IDs vs section names -- ANSWERED

Teacher has 12 courses. AP Stats sync targets (`syncTarget: true`
in `schoology-courses-map.json`):

| Course ID | Course Name | Section | Notes |
|---|---|---|---|
| `7945275782` | AP Statistics | Section 1 | 10 students enrolled |
| `7945275798` | AP Statistics | Section 2 | Period mapping TBD by teacher |

Period -> Course ID mapping is **manual** -- Schoology stores
"Section N" not "Period B/E". V1 should keep a hardcoded
section name -> course ID map in a config file (or in
`schoology_assignment.schoology_course_id` per row); V2 can
add a teacher-config table.

The URL the user originally pasted (`course/7945312369/grades`)
turned out to be **Algebra II Section 10**, not AP Stats. The
empty Algebra II gradebook fixture is still useful as a
baseline DOM snapshot (cleanest possible Schoology gradebook
state).

### Q3: Gradebook UI complexity -- ANSWERED

**AngularJS SPA** (`ng-repeat`, `ng-class`, `ng-switch`,
`ng-scope` throughout). Not React, not virtual-scrolled at
the row level (all 10 students rendered eagerly). Horizontal
scrolling behavior with many assignment columns is **untested**
(empty gradebooks during P0); P1 risk.

Stable selectors found:

| Target | Selector | Notes |
|---|---|---|
| Student row | `[data-uid="<schoology_user_id>"]` | One per student. `data-uid` is the Schoology user id |
| Student name | `[aria-label="<First Last>"]` on the row's `[role="rowheader"]` child | Use this to map name -> data-uid |
| Grade cell | `[role="gridcell"]` with `data-x="<column_key>"` + `data-y="<row_index>"`, id `grader-grid-cell-<column_key>-<row_index>` | row_index is 0-based; column_key is "overall_override" for the OVERALL aggregate, or the assignment id for graded columns |
| Marking period header | `[aria-label="Marking Period N: M/D/YY - M/D/YY"]` | Date range exposed in aria-label -- safe to parse |
| Add Materials dropdown trigger | `.s-js-grader-add-materials-wrapper [role="button"]` | Top-right of the gradebook bar |
| Gradebook canvas wrapper | `.s-app-gradebook-app-canvas-wrapper` | Container that paints the grid |
| Row container | `.grader-grid-row` | Each row (header + data rows share this) |

**Avoid** the auto-hashed React-style classes on the top nav
(e.g., `._13cCs _2M5aC ...`) -- those rotate per release.

### Q4: Add Assignment form fields -- ANSWERED

Two parallel forms, **identical schema**:

| Form | URL pattern |
|---|---|
| Assignment | `course/<ID>/materials/assignments/add?is_popup=1` |
| Test/Quiz | `course/<ID>/materials/assignments/add_assessment?is_popup=1` |

Form id `s-grade-item-add-form`, POST to its own URL. Named
visible inputs (V1 sync only needs to fill the starred ones):

| Field | Type | Required | Default | Used by V1 |
|---|---|---|---|---|
| `title` * | text | Yes | none | Yes |
| `due_date[date]` | text (datepicker) | No | none | Yes (lesson date) |
| `due_date[time]` | text | No | none | No |
| `max_points` * | text | No (defaults) | `100` | Yes (always 100) |
| `grading_category_id` * | select-one | No | none | Yes (category lookup) |
| `grading_period_id` * | select-one | No | last MP | Yes (quarter lookup) |
| `is_final` | checkbox | No | unchecked | No |
| `factor` * | text | Yes | `1.00` | No (leave default) |
| `publish_scores` | checkbox | No | unchecked | Yes (CHECK -- so students see grades) |
| `sync_to_sis_wrapper[sync_to_sis_option]` | checkbox | No | unchecked | OPEN: probably yes for district SIS sync |
| `option_collected_only` | checkbox | No | unchecked | No |
| `op` (submit) | submit | -- | `Create` | Click via `input#edit-submit` |

**Categories in AP Stats Sec 1 today**:

```
value="0"       text="(Ungraded)"
value="89825655" text="Classwork"
value="new"     text="(Create new grading category)"
```

⚠ **CATEGORY GAP**. BUILD spec assumed three categories
(Lessons / Progress Checks / Tests) but the only existing
category is "Classwork". Two paths for V1:

- **(a) Teacher pre-creates the three categories** in
  Grade Setup (one-time, ~3 minutes). Cleanest -- the sync
  just looks them up by name.
- **(b) Sync auto-creates them** via the `value="new"`
  option, which surfaces a sub-form for the category name.
  Riskier (the sub-form's selectors haven't been probed).

**Recommendation:** (a). The teacher does this once before
P1 ships, and the sync code stays simple.

### Q5: Quarter / Marking Period mapping -- ANSWERED

Schoology grading_period_id values for AP Stats Sec 1
(course 7945275782). Note: IDs are **per-course/per-section**
and may differ for Sec 2 -- the sync MUST look these up per
section at run time, not hardcode them.

| Quarter | Marking Period | Date range | grading_period_id |
|---|---|---|---|
| Q1 | MP1 | 9/03/25 - 11/07/25 | `1134333` |
| Q2 | MP2 | 11/08/25 - 1/30/26 | `1134331` |
| Q3 | MP3 | 1/31/26 - 4/10/26 | `1134334` |
| Q4 | MP4 | 4/11/26 - 6/30/26 | `1134332` |

Aligns with the Phase 6 gradebook model:
- Q1 = U1+U2+U3 -> MP1 1134333
- Q2 = U4+U5 -> MP2 1134331
- Q3 = U6+U7 -> MP3 1134334
- Q4 = U8+U9 -> MP4 1134332

The sync derives the right grading_period_id from the
`schoology_assignment.due_date` (date falls inside MP date
range -> use that MP's id).

### Q6: Schoology UI version baseline -- ANSWERED

Captured at 2026-05-27. The body element carries a
`s-app-gradebook-app-beta` class -- this is Schoology's
newer "gradebook app" iteration (not the legacy gradebook).
If the beta moves to GA without renaming the class, fixtures
remain valid. If beta is replaced, the `[data-uid]` /
`[role="gridcell"]` / `data-x` / `data-y` selectors are
likely to survive because they're semantic; the class names
under `_13cCs` etc are not.

User-agent string captured: `Edg/148.0.3967.83` on Win 10
1513x900 viewport. CDP rig forces `--remote-allow-origins=*`
to bypass Chromium 144+ origin handshake. No Schoology bot
detection triggered (3 separate page loads + ~10 DOM probes
+ 2 form loads in ~5 minutes; no captcha or rate limit).

### New P1 risks surfaced by P0

1. **OAuth state token expires fast.** First navigation after
   sign-in MUST be the gradebook URL, not the URL that was
   queued before sign-in (the queued state token may already
   be stale). Sync code: do `cdp.attach_url(GRADEBOOK_URL)`
   AFTER sign-in completes, never reuse a pre-auth state.

2. **Grading category pre-creation.** Teacher must create
   "Lessons", "Progress Checks", "Tests" categories in
   Schoology Grade Setup before P1 ships, OR the sync needs
   the auto-create category sub-form probed and wired.

3. **Per-section grading_period_id lookup.** The MP IDs in
   Section 1 may differ from Section 2. The sync's first
   action per course must be a quick GET to the Add
   Assignment form to harvest the period ID -> date range
   mapping, then cache it for the run.

4. **SIS sync checkbox decision pending.** Teacher must
   decide whether Schoology grades should also push to the
   district PowerSchool SIS. If yes, V1 always sets
   `sync_to_sis_wrapper[sync_to_sis_option]=1`. If no, leave
   unchecked. Default UI state is unchecked.

5. **publish_scores default is unchecked.** Without this
   checkbox, students don't see their grades. V1 must
   ALWAYS check it (otherwise grades land but stay hidden).

6. **Horizontal virtual scrolling untested.** With dozens of
   assignments, the gradebook may not render all cells in
   the DOM at once. P1 with the first 5 lessons will surface
   this; if so, the sync needs to scroll the grid container
   into view per cell before clicking.

### P1 readiness checklist

- [x] Q1 URL pattern confirmed (`lynnschools.schoology.com`)
- [x] Q2 course ID mapping in `schoology-courses-map.json`
- [x] Q3 stable selectors documented
- [x] Q4 Add Assignment form schema captured
- [x] Q5 quarter -> MP id mapping documented
- [x] Q6 UI version baseline (fixtures + user-agent)
- [x] CDP rig confirmed to drive MS SSO email+password (with manual 2FA)
- [x] KMSI=Yes locks in the cookie for ~90 days
- [ ] Teacher creates the 3 grading categories in AP Stats Sec 1 + Sec 2 (one-time setup, blocks P1)
- [ ] Teacher confirms SIS-sync checkbox decision (yes/no)
- [ ] Teacher confirms which Schoology section maps to which AP class period (B vs E)

P1 is unblocked the moment those three teacher-actions land.


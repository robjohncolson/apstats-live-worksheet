# Automatic worksheet diagnostics - 2026-09-10

## Behavior
- All 69 worksheets load worksheet-diagnostics.js before the gradebook client and report after prior-answer hydration, including failed and empty reads. A watchdog reports initialization or stalled-client failures.
- Counts distinguish downloaded answer records for this exact worksheet, matching form fields, restored answers, matching visible answers, edited fields, and filled fields. No answer text, password, token, user agent, or IP is stored in a report. The browser identifier is random and local to that browser profile.
- The actual client build is stamped by scripts/bump-build.mjs. Reports include HTTP outcome, online status, and whether a service worker controls the page.
- Reports that fail to upload are kept in a separate bounded local queue (20 reports, up to seven days), retried three times and on reconnect/focus/sign-in. Only the report owner's session can replay them. Nothing changes grades, completion marks, or the answer queue.
- Teacher dashboard: Worksheet answer loading section, authenticated boot load and visible-page 60-second polling, manual refresh, student search, captured section labels, separate opt-in teacher previews, visible unavailable/no-report states. Reports are browser observations, not grade evidence.

## Backend and storage
- POST /student/worksheet-diagnostics validates an explicit field allowlist, bounds counts and identifiers, derives student identity/section from the roster, and enforces per-student minute/day throttles. Students cannot target another student.
- GET /teacher/worksheet-diagnostics is teacher-only, no-store, optionally section filtered.
- Diagnostic-only signature verification accepts authentic sessions expired within 30 days so the failure can be reported. Normal token verification is unchanged. Expired teachers cannot target another student or read reports.
- Private Supabase Storage bucket worksheet-diagnostics was provisioned with public=false, JSON-only content, 8192-byte object limit. No SQL migration or grade-table changes.
- Latest summary per section/student/browser/worksheet/mode; previous recent failure retained after recovery; older incoming reports cannot overwrite newer ones. Storage survives Railway restarts. Dashboard reads show observations from the last seven days and prune old objects as encountered. Up to 200 recent summaries per section / 400 per read; truncation is visible.
- No retrospective browser state exists. A student's updated browser must execute a worksheet and be able to reach the service (or reconnect later). Missing/unverifiable identity cannot be attributed safely; missing reports are explicitly not treated as missing work.

## Validation before deployment
- Roster full suite: 85 files passed; 1709 tests passed, 3 skipped (1712 total).
- New roster diagnostic tests: 14 passed, including forged/expired tokens, cross-student rejection, preview separation, stripped fields, storage outage, throttling, persistent summaries and cleanup.
- New browser diagnostic and teacher panel tests: 20 passed. Includes actual worksheet hydration, HTTP failures, timeout, watchdog, offline replay after reload, privacy allowlist, ownership, bounded retries, explicit storage acknowledgements, and all 69 hooks.
- Release regression selection: 8 files / 106 tests passed before the final additional privacy test. PWA build lockstep and worksheet recovery also passed.
- Wider frontend sweep: 3463 passed, 9 failed in two existing timing-sensitive teacher-console suites. Baseline HEAD dashboard reproduced a nudge-pagination failure; isolated current run had 2 failures / 42 passes. No existing console handlers were changed. The targeted gradebook, inbox, and dashboard-deeplink tests pass.
- Headless Edge with real local worksheet and dashboard scripts: 37 restored, 37 matched, automatic report received; student row shown; teacher-preview toggle reveals a second row; no page errors. Remote services were stubbed, so this test did not write student grades.
- Real private-storage smoke: write/read succeeded; public access denied (400); temporary diagnostic objects removed.

## Deployment verification
Initial implementation: fa453638cb7e1431a638a9be5e23c55ad7edad01. Pages succeeded and served build 2026-09-10-rxfu. Railway deployment 874b9bdf-194b-452c-b851-44b1bc03f196 succeeded; the live diagnostic route correctly returned 401 without authentication.

A final failure-path check found a real recovery race: a successful background ledger repair read cancelled the visible restoration retry after an initial 503. The new regression reproduced 0 restored vs 37 expected. Background repair reads are now explicitly marked and cannot cancel visible restoration retries. All 69 repair callers and the generator were updated. The regression and associated suites pass: 5 files / 636 tests. Existing static tests were adjusted only for the additive optional argument and to inspect the complete repair function rather than truncating it at 1600 characters. Follow-up build: 2026-09-10-3b6d. Final live smoke follows deployment.

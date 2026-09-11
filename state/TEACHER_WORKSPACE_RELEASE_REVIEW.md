# Teacher workspace release review

Build: 2026-09-11-75yr (UTC build stamp; implemented September 10 locally).

## Delivered

- Desk > Teacher > Teacher workspace opens the dashboard in the same app, with Back to Desk. Role and message-origin/source guards remain in force; closing removes the iframe and its polling.
- Class / Needs attention / Recent work / More tools & recovery. Search, period selector, automatic authenticated class load, unread-message indicator.
- Every student-name surface opens the shared drawer: class rows, pacing, grades, component gradebook, trainer, triage, managed roster, remediation, makeup, quarter deltas, inbox, browser diagnostics, wallet proposals and payout preview. Names carry IDs; duplicate display names do not collide. Native buttons support keyboard activation.
- Drawer tabs: Overview, Recent work, Worksheet, Account, Messages. Saved responses are escaped; saved worksheet is a read-only teacher iframe. View student app remains a separate, explicitly labeled action. Account password recovery requires an explicit reveal and is cleared on close; Schoology linking uses the existing teacher-authorized PATCH endpoint.
- Live Classroom and Unlock Codes removed from the launcher. Nightly Review opener now routes to Recent work, with no unseen-review polling. Legacy review/revoke helpers remain for compatibility; ordinary drawer opens no longer request lesson unlocks. Grade Check-in and receipt verification remain secondary recovery tools.
- GET /class/grades?includeSavedWork=1 adds bounded metadata (eight latest distinct items per student), pending-FRQ count and explicit ledger-read availability. No answer bodies in the class summary. Default class response is unchanged, as proven by existing grade/export golden masters. Latest graded retries clear older pending attempts; zero remains a grade.
- Due items without a grade are information only, not a new zero policy. Unknown due dates are not flagged. Saved-work labels explain that offline edits only appear after syncing.

## Validation

Frontend command:
`npx vitest run tests/teacher- tests/desk-nightly-review.test.js tests/desk-grade-checkin.test.js tests/desk-view-as.test.js tests/pwa.test.js --maxWorkers=2 --minWorkers=1`

```
Test Files  23 passed (23)
     Tests  455 passed (455)
Start at  20:37:04
Duration  45.19s
```

Roster command (roster-server): `npx vitest run`

```
Test Files  86 passed (86)
     Tests  1713 passed | 3 skipped (1716)
Start at  20:32:57
Duration  63.55s
```

New tests: tests/teacher-workspace.test.js (8 behavioral/integration checks); roster-server/tests/saved-work-summary.test.js (3 checks), plus opt-in/default-response/auth assertion in tests/class.test.js.

Headless Edge fixture smoke at 1366x768: dashboard and integrated Desk render with zero page errors; Class, Needs attention, Recent work, shared drawer, Back to Desk, and non-teacher launch refusal passed. All external requests were intercepted; no real messages, grades, payouts or account changes were made. Actual worksheet iframe uses existing teacher view-as read-only path. Screenshots/logs are in the executor's old-app workspace as teacher-workspace-*.png / *.log / browser.json.

## Deliberately changed test expectations

- Drawer/nudge/unlock tests expect three student-panel fetches instead of four, excluding the independent boot inbox. Retired unlock render/revoke unit tests now inject their legacy rows explicitly; a pending retired response cannot revive the hidden UI.
- Nightly Review tests assert Recent work routing and no unseen badge/poll. Grade Check-in tests assert the recovery action instead of a launcher tile.
- Remediation and nudge-pagination JSDOM harnesses remove stylesheet links. They previously raced DOMContentLoaded against failed localhost stylesheet downloads; this was reproduced against the unchanged dashboard. No production message/remediation behavior changed.

## Scope and limitations

No grade math, grading schedule, worksheet files, progress storage, APStat Park protocol, student authentication behavior, or Schoology sync pipeline changed. Unrelated working-tree changes were not staged. No grade-engine bundles regenerated.

Recent class feed shows at most 100 events, drawn from eight latest distinct items per student. Student recent pane fetches the latest 100 submissions; older worksheets remain reachable through View student app. An offline device's unsynced answer cannot be displayed by the teacher workspace.

GitNexus upstream checks: indexed dashboard/backend symbols LOW; Desk launcher and diagnostics helpers not indexed, checked manually. Staged change analysis and live deploy verification recorded below after release.

# Cross-device calendar grey-out (build spec)

Make the calendar lesson grey-out **follow the student's login**, not the browser — so a lesson
marked Done on one computer shows greyed on every computer for the same signed-in user.

Decided with the teacher (2026-06-02): sync at the **per-resource** bar (a lesson greys once ANY
one resource is marked Done — the lenient behavior they already see, just synced via the ledger).

## The problem (confirmed)

Two independent grey-out signals:
- **Local** (`.dc-localdone`, set by `rCal` from `getStudentMarks()` → localStorage
  `apstats_desk_marks_<email>`): a lesson greys if `localLessonState` finds any `<topic>|<artifact>`
  mark with a `ts`. Renders instantly — but **per-device**, never synced.
- **Server** (`.dc-done`, set by `paintDonowCells` from `/donow` `lessonState`): per-identity +
  synced, but uses the **stricter** "every activity recorded" bar — so a lesson you Done-clicked one
  resource of doesn't grey on a fresh device.

The Done click already writes a per-identity `DESK_DONE` ledger row
(`_studentMarkSave`: `source` worksheet/curriculum_quiz, `itemId` `WS-/CR-U{u}-L{l}-DESK_DONE`,
`topic` = the topic, `response.selfAttest` = artifact). `computeDonow` loads ALL the student's
ledger rows but ignores DESK_DONE (it's not a manifest activity item). So the lenient "I marked it
done" signal exists per-identity on the server — it's just not surfaced or hydrated.

## The fix

### A. Server — `roster-server/donow.js` `computeDonow`
- Build `selfDoneTopics` = set of `row.topic` for ledger rows whose `item_id` ends `-DESK_DONE`
  (fallback: parse `^(?:WS|CR)-U(\d+)-L([\d-]+)-DESK_DONE$` → `u.l` when `topic` is absent).
- Add `selfDone: selfDoneTopics.has(lesson.lesson)` to each `lessons[]` entry. Additive; `teacher.js`
  (which reuses `computeDonow`) inherits it harmlessly.

### B. Client — `ap_stats_roadmap_square_mode.html`
- `_hydrateMarksFromDonow(data)`: for each `data.lessons[]` with `selfDone === true`, seed
  `apstats_desk_marks_<email>['<topic>|server'] = { ts, src:'donow-sync' }` if not already present.
  Returns whether anything changed. Idempotent; additive (never removes a mark). `<topic>|server` is
  a synthetic key — `localLessonState` matches any `<topic>|*` with a `ts`, so it greys the lesson
  exactly like a local Done.
- In `renderDoNow`, right after `_donowData = data` + `paintDonowCells()`: if
  `_hydrateMarksFromDonow(data)` changed anything, re-call `rCal()` so the grey-out **and** the
  next-up (`_calNextUp`/`.cal-current`) reflect the synced state. Idempotent → no loop (2nd pass:
  no change → no re-render).

## Why this matches what the teacher sees
`selfDone` is derived from DESK_DONE rows = exactly "clicked Done on ≥1 resource" = the local
`localLessonState === 'done'` condition. So hydrating it replicates the device-A grey on every
device, and fixes the next-up highlight too (both read local marks).

## Tests
- roster-server `donow` test: a DESK_DONE row → that topic's `selfDone` true; no DESK_DONE → false;
  topic taken from `row.topic`, fallback to itemId parse.
- Desk: `_hydrateMarksFromDonow` seeds `<topic>|server` for selfDone lessons, idempotent, additive,
  no-op when signed out / no lessons; `renderDoNow` re-renders only when marks changed.
- Full suites green (only the 3 known pre-existing fails).

## Known limitation (accepted)
Like the pre-existing per-device grey-out, the synced grey-out has **no un-do**: DESK_DONE rows are
append-only (no DELETE/tombstone), and `_hydrateMarksFromDonow` only seeds (never removes), so a
lesson stays greyed once marked. This is acceptable — the grey-out is cosmetic/navigational only and
never feeds the v3 grade (DESK_DONE rows don't match a manifest activity). A real un-mark would be a
future general progress-reset flow (ledger tombstone + local + `<topic>|server` mark removal), not
specific to this sync.

## Review
Adversarial review (3 dims, 19 agents) — folded: combined-topic DESK_DONE itemId collision
(`_studentMarkSave` regex `/^(\d+)\.(\d+)$/` → `/^(\d+)\.([\d-]+)$/` so combined lessons get unique
itemIds) and the view-as guard in `_hydrateMarksFromDonow`. No-undo = documented above (cosmetic,
pre-existing). Double-paint NIT left as-is (one-time, sub-ms; gating adds more risk than it saves).

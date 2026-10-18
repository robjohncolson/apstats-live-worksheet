# APStat Park: the solo door inside the calculator room

Teacher decisions, 2026-10-17 (verbatim intent): "Option 1 sounds amazing. 1. inside team intro next to
block 2. solo is default when no class is live, so this needs to be aware of my weekly school schedule
3. park door only!"

Follows `APSTAT_PARK_TRAINER_ABSORB_SPEC.md` (the solo room, §3) and finishes its §8 "park door only"
reading: the calculator room on the calendar board is the ONE calculator surface. No separate page, no
Desk app window.

## 0. What exists (audited 2026-10-17)

- `apstat-park/calculator-room.mjs` mounts one of two modes from the page hash at mount time
  (`parseRoomLink`): `#room=calc-solo[&skill=|&topic=]` → solo, anything else → team. The Desk's
  calendar board mounts the room as soon as the local sprite exists (the strip IS the approach,
  `classroom-board.js` `calculator_approach`), and remounts it on `hashchange` when
  `nativePanel.linkChanged(hash)` says the hash now asks for another room.
- Team intro (scenery, `drawScenery`): "CALCULATOR TOGETHER / PUSH THE TEAM BLOCK RIGHT >", the team
  block at `TEAM_BLOCK.start` (x 400, y 668, 32×32 in room coordinates, entry area 0..720), the PICO PARK
  door at x 30 (UP enters when `player.x < 95 && campaignUnlocked()`).
- Solo intro: "CALCULATOR SOLO / WALK RIGHT TO YOUR CALCULATOR >", no block; walking past x ≥ 740
  (`ENTRY_WIDTH + 20`) joins.
- Solo deep links today: Desk resource panel "N skills due" (`_openParkSolo`), worksheets
  (`ap_stats_roadmap_square_mode.html#room=calc-solo&topic=T`, wired by
  `scripts/wire-park-calculator-links.mjs`), the Desk `ti84` app window + Pico Desk "TI-84 TRAINER"
  tile + landing pages → `calculator-solo.html` (a standalone page mounting the same board).
- "Class is live" today = Live Classroom `state.live` (teacher-armed), exposed to the room as
  `board.classroom.isLive()`.
- The weekly schedule: `data/lesson-schedule.json` — `lessons[].dates.B` / `.dates.E` are the class
  days each section meets for a lesson (ISO dates), `calendar.breaks` the no-school ranges. The bell
  schedule is the "Bell Schedule" tab of `LEHS_SY2627_Schedule_and_Calendar.xlsx` (wired 2026-10-18;
  at spec time it had not been found and the module shipped with a single placeholder block).

## 1. Non-goals

- No relay change. Solo and team joins are unchanged (protocol stays 16). Nothing here touches a grade.
- No lobby, no third calendar door (teacher: three doors max, "never re-add a lobby").
- No change to the team round, the recognition step, SRS, keys, bonus or the handheld check.
- Not deleting the worksheet deep links: they already land in the park room (the room reads the hash).

## 2. Room modes: `solo`, `team`, and `auto`

`parseRoomLink(hash)` returns `{ mode, skill, topic }` with mode:

| hash | mode |
|---|---|
| `#room=calc-solo[&skill=\|&topic=]` | `solo` (as today) |
| `#room=calc-team` | `team` (NEW: the explicit team link) |
| anything else (bare Desk, other hashes) | `auto` (NEW) |

`auto` resolves to one of the two at mount, ONCE, by `resolveRoomMode({ link, isLive, inSession })`:
`team` when `isLive()` is true OR `inSession` is true; otherwise `solo`. The resolved mode is what the
room runs; `getView().mode` reports the resolved mode and `getView().link.mode` the hash's.

`linkChanged(hash)` compares the NEW hash's link against the mounted link (mode/skill/topic). `auto`
vs a resolved `solo`/`team` counts as different only if the hash's mode changed (so a hashchange from
bare → `#room=calc-team` remounts; bare → bare does not).

## 3. In session = the teacher's weekly schedule

New module `apstat-park/class-session.mjs` (ES module, pure functions + one loader; unit-tested):

```js
export const BELL_SCHEDULE = { B: { Mon, Tue, Thu, Fri }, E: { Mon, Wed, Fri } }   // ['HH:MM','HH:MM'] per weekday the block meets; see §3 note
export const SCHOOL_HOURS = { start: '07:45', end: '14:30' };   // first bell to last: the fallback window
export function blockFor(section, now)                 // the section's block that weekday, else SCHOOL_HOURS
export function classDaysFor(schedule, section)        // Set of ISO dates the section meets (lessons[].dates[period]; breaks removed)
export function inSession(schedule, section, now = new Date())   // boolean: today ∈ classDays AND blockFor(section, now).start ≤ now < .end (local)
export function loadSchedule(fetchFn)                  // fetch('../data/lesson-schedule.json' relative to import.meta.url, same `V` cache-bust as the room); null on failure
```

- `section` normalises like the relay's `eligibleLevels`: `PeriodB`/`B` → `B`, `PeriodE`/`E`/`PeriodX`
  → `E`; unknown section → never in session (solo).
- Dates compare as the LOCAL calendar date (`YYYY-MM-DD` from `now`'s local parts), never UTC.
- Section meeting days come only from `lessons[].dates[period]`; B "Work Day" rows (if present as
  lessons) count as meeting days; `calendar.breaks` ranges are excluded even if a lesson is dated inside.
- `BELL_SCHEDULE` (2026-10-18, teacher: "all bell times are in follow-alongs") is the LEHS SY26-27
  workbook's Bell Schedule tab: B meets Mon/Fri 08:55-09:50 and Tue/Thu 09:55-11:00; E meets Mon/Fri
  13:15-14:30 and Wed 11:16-13:25 (the 90+30 block; the window includes the rotating lunch). A lesson
  dated on a weekday the block does not meet (a special-day schedule) uses `SCHOOL_HOURS` 07:45-14:30.
  Before this the module shipped with that single block as a placeholder; per-period times were never
  to be invented.
- Schedule load failure (offline, 404) → `inSession` false → solo, unless `isLive()`.

Wiring: `classroom-board.js` passes `section` on the `board` object it gives `mountParkPanel`
(it already has `section` in mount opts). The room resolves `auto` AFTER the schedule loads (reuse the
`soloReady` gating pattern used for topic links: nothing joins and no intro is painted as solo/team until
the mode is known; paint a neutral "CALCULATOR" title + "LOADING…" until then — at most a few hundred ms).

## 4. The door, inside the intro, next to the block

Both intros gain a door in the entry area, drawn exactly like the PICO PARK door (atlas rect 48,0 48×48
drawn 40×40, `#493d48` rectangle fallback), floor-standing at **x 480** (right of the team block's
start 400+32, left of the walk-in zone), i.e. `SWITCH_DOOR = { x: 480, y: WORLD.floor - 40, w: 40, h: 40 }`
in room coordinates (export it from the room module for tests).

| mounted mode | door label (above, size 14) | caption (size 7, under the label) | entering sets the hash to |
|---|---|---|---|
| team | `SOLO` | `YOUR OWN ROUND . MASTER A SKILL - BANK A BONUS POINT` | `#room=calc-solo` |
| solo | `TEAM` | `PUSH THE BLOCK WITH YOUR CLASS` | `#room=calc-team` |

- Entering: UP while the player's centre is within 20 px of the door's centre and standing (same rule
  shape as the PICO PARK door), OR a click/tap on the door (the mouse is the game, teacher 2026-10-11).
  Entering sets `win.location.hash`; the board's existing `hashchange` handler does the remount. The
  door does nothing while a round is active (`participating`), only in the entry area.
- In solo mode the existing "MASTER A SKILL HERE - BANK ONE BONUS POINT" line moves onto the door's
  caption (one place for the bonus line, ABSORB_SPEC §6). The intro lines otherwise stay.
- The door is a scenery element (`drawScenery` cache invalidates on mode, already keyed by `solo`).
- Keyboard-only players still have UP; no new keys.
- The remount keeps the student in the entry area (the room starts at x 65 after remount, as today).

## 5. Park door only: retire the page and the app window

1. Delete `calculator-solo.html`. Delete the Desk `ti84` app window: `APP_REGISTRY.ti84`, the
   `#app-ti84-overlay` block, the menu item "TI-84 Trainer" (`openApp('ti84')`), the `ti84` branch of
   `appLaunchUrl`, and the `isTool` `'ti84'` clause (keep `'formulas'`). `_openTi84ForTopic(topic)` →
   `_openParkSolo('&topic=' + topic)`; the Do-Now "Today's calculator skill" button (`_renderTi84SkillBtn`)
   → `_openParkSolo('&topic=' + topic)`. Keep `_ti84LessonMap`/`_ti84TodayTopic` (they gate the row).
2. Pico Desk (`pico-home.js`): the PRACTICE item "TI-84 TRAINER" becomes `CALCULATOR` and runs
   `callDesk('_openParkSolo', [''])` (check how `callDesk` resolves names; use the same mechanism the other
   items use). Update `tests/pico-home*.test.js` pins. The `app-ti84-overlay` entry in the Pico window
   registry (line ~3109) goes.
3. Landing pages: `index.html` card and `start-here.html` button → `ap_stats_roadmap_square_mode.html#room=calc-solo`
   with copy "TI-84 practice (in APStat Park)". `mobile-home.html` if it links the page.
4. `scripts/smoke-student-host-matrix.mjs`: drop the `ti84` resource rows (or point at the Desk hash).
5. Docs: `CLAUDE.md` (App Surface table + In-Desk app windows table), `roadmap-apps-spec.md`,
   `apstat-park/README.md` — the solo room is reached by the door in the room, by the Desk hash
   (`#room=calc-solo…`) and by `_openParkSolo`. Say explicitly: no standalone page.
6. Tests: rewrite `tests/calculator-solo-entry.test.js` as the park-door entry pins (file absent; Desk
   has no `ti84` app; `_openParkSolo` present; landing links); update `tests/desk-ti84-skill-link.test.js`
   (`appLaunchUrl` no longer has a ti84 branch — pin `_openTi84ForTopic`/`_renderTi84SkillBtn` build the
   hash link instead), `tests/phase4-structure.test.js` (file list), `tests/park-absorbs-trainer.test.mjs`
   (drop the §8.2 describe added 2026-10-17), `tests/desk-ti84-trainer-chip.test.js` if it names the app.
7. `apstat-park/calculator-solo-browser-smoke.mjs`: retarget to the Desk hash URL (it is unrun today;
   keep it runnable, do not run it).

## 6. Tests (new)

- `apstat-park/class-session.test.mjs` (or `tests/`): class days from a fixture schedule (B vs E
  differ; breaks excluded; section normalisation; unknown section); `inSession` boundaries (07:29 no,
  07:30 yes, 14:29 yes, 14:30 no, a meeting day vs a weekend vs a break day; local date, not UTC).
- Room tests (`apstat-park/calculator-room.test.mjs`, jsdom, as the existing ones): `parseRoomLink`
  three modes; `resolveRoomMode` truth table (live → team even on a weekend; in session → team;
  neither → solo; explicit hash wins over both); the door: UP next to the door in team sets
  `#room=calc-solo`, in solo sets `#room=calc-team`, UP elsewhere does nothing, click on the door
  enters, no effect while participating; `linkChanged` bare→bare false, bare→`#room=calc-team` true.
- Existing suites green: `npm test`, `npm run test:park`.

## 7. Acceptance

- Teacher, at night, opens the Desk: the room is CALCULATOR SOLO with a TEAM door beside where the block
  would be. UP at the door → CALCULATOR TOGETHER with the block and a SOLO door. UP at that → back.
- Same at 10:00 on a Period B class day: the room opens as CALCULATOR TOGETHER.
- Live Classroom armed on a Sunday: TOGETHER.
- `rg calculator-solo.html` over the repo (outside git history and `state/`) returns nothing.
- Every Desk link that used to open the app window lands in the park room in solo mode, in the Desk.

## 8. Build notes for the implementer

- Edit in place; no wrappers, no managers. Early returns. Skimmable.
- `classroom-board.js` is a classic script (no `import`); the room and the new module are ES modules.
- The Desk file is ~27k lines; find things by the names above. Every Desk push needs
  `node scripts/bump-build.mjs` — the orchestrator runs that at commit time, do not run it.
- Windows: write LF line endings. Do not run `git stash`, do not commit, do not push.
- Do not touch `roster-server/`, `../curriculum_render`, or anything under `apstat-park/calculator-native/`.

## 9. Finishing the absorption: the teacher spectator sees solo rounds

The relay's `watch(section)` (protocol 12+) already returns `solo: [{ name, epoch, level, failure, state }]`
beside the team fields, and sends it in `park_watch_state.calculator`. `apstat-park/teacher-spectator.mjs`
ignores it: with no team room it prints "NO ACTIVE CALCULATOR TEAM" even while five students practise solo.

- Calculator scene, no team round: title `CALCULATOR · SOLO`, then one row per solo round (name, the level
  title, `step/route length` or `COMPLETE` or `FAILED`), newest first, up to 12 rows; the `focus` select
  lists the solo names; the focused student's calculator is drawn with the same keys-replay path as a team
  member (`state.keys`, `level`), reusing `drawCalculator`'s calculator cache keyed by `epoch:name`.
- Calculator scene, team round in progress: unchanged, plus a one-line footer `+ N SOLO` when `solo.length`.
- `auto` scene: a solo-only packet counts as an active calculator scene (today it falls to CLASSROOM).
- Read-only, like everything in the spectator. No relay change.
- Tests: NEW `apstat-park/teacher-spectator.test.mjs` (jsdom, mirroring `calculator-room-solo.test.mjs`; a fake socket feeds `park_watch_state` packets): solo-only packet
  draws the rows and the focus options; team+solo draws the footer; focus switch replays that student's keys.

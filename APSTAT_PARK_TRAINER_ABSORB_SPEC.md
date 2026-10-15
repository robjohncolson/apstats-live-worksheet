# APStat Park absorbs the TI-84 trainer (spec)

Status: draft 2026-10-14, for teacher review. Written against the current two-repo layout; the path table in §0
is the only thing that changes after the apstat-park monorepo merge. Build this AFTER the merge: Phase 6 deletes
whole directories, which is one commit in one tree and three in two.

Goal: `ti84-trainer-v2/` stops being a student surface. APStat Park becomes the only calculator surface, and it
inherits the two things the park does not have today: pattern recognition and spaced recall. Rewards stay in the
park's own economy (teacher 2026-10-14): the calculator never goes for grades. Clears pay campaign keys, and a solo
door banks one bonus point per skill. The native JavaScript calculator engine survives as a shared module; the
WebCEmu emulator leaves the student path.

## 0. What exists (audited 2026-10-14)

| Thing | Where | Keep? |
|---|---|---|
| v1 trainer `ti84_trainer.html` (3,310 lines) | fa root | Delete. Linked from nothing. |
| v2 trainer app (`app.js`, `bridge.js`, `build.mjs`, `standalone.html`) | `ti84-trainer-v2/` | Delete after Phase 6. |
| Native engine (`ti84-native.js` + 9 siblings, `stat-rom-contract.json`, `tests/`) | `ti84-trainer-v2/native/` | Keep. Becomes `calculator-native/` shared by client and relay. Byte-identical copy already at `curriculum_render/railway-server/apstat-park/calculator-native/`. |
| WebCEmu wasm + ROM upload + emulator mastery check | `ti84-trainer-v2/wasm/`, `bridge.js` | Move to `tools/ti84-rom/` as a verification harness. Not student-facing. |
| Procedure data | `ti84-procedures-data.json` (root) | Retire. The park catalogue (`calculator-catalog.mjs`, 32 skills, 99 problems) is the superset; skill ids are the same strings as v2 procedure ids. Phase 0 proves it. |
| Pattern recognition data: 29 signatures, 26 confusion pairs, 68 canonical problems, distractor sets | `ti84-pattern-recognition-data.json` (root) | Keep. Moves into the park as `calculator-patterns.mjs`. |
| Lesson map (topic → skill ids, `lessons` + `bonus`) | `data/ti84-lesson-map.json` | Keep unchanged. Desk, roster-server `lesson-grade.js` and the park all read it. |
| SRS (SM-2: interval 1 → 6 → ×ease, ease floor 1.3, two tracks, mastery gate) | `app.js` ~lines 1550–1700, 3100–3230 | Port the algorithm to the relay (Phase 3). Local per-device state is NOT migrated. |
| Ledger write (`source:'trainer'`, `itemId:'TI84-<skillId>'`, `attempt:1`, score 0..1 raise-only) | `app.js` ~3296, `roster-server/lesson-grade.js` 328–360, migration 0016 | Keep the row shape exactly. The grade engine does not change. |
| Grade strand `trainer: { weight: 0, doneThreshold: 80 }` | `roster-server/grade-config.js` 172–180 | Unchanged. |
| Deep links `#topic=1.7&source=worksheet`, `#procedure=<id>`, `#unit=N` | 25 worksheets, Desk `APP_REGISTRY.ti84`, Desk chip `_renderTi84SkillBtn`, resource panel `_openTi84ForTopic` | Rewire to the park solo room (Phase 6). |
| Park team room, relay, protocol 11, `park_calc_clears` (migration cr 0008), hint rungs, random data | `apstat-park/calculator-*.mjs`, `curriculum_render/railway-server/apstat-park/` | Base to build on. |

Shared-module rule (until the merge): `calculator-mission.mjs`, `calculator-curriculum.mjs`, `calculator-catalog.mjs`,
`calculator-engine.mjs`, `calculator-lobby.mjs`, and the new `calculator-patterns.mjs` / `calculator-srs.mjs` are
byte-identical between client and relay. Every phase that touches one bumps `CALCULATOR_PROTOCOL`.

## 1. Non-goals

- No grade credit. No `source:'trainer'` rows from the park, ever; the trainer strand in `grade-config.js` stays at
  weight 0 and goes quiet once v2 is deleted. The only ledger rows are banked bonus rows (§6), which the grade
  engine already ignores until quarter close.
- No change to the grade engine, the ledger schema, or `lesson-grade.js`.
- No change to the team room's feel: the 15 s step clock, the team block, the key celebration all stay.
- No migration of students' local v2 SRS state. Every student starts the park's recall schedule from zero.
  (Ledger rows, the only evidence that counts, are untouched.)
- No emulator in the browser for students. The ROM harness is a teacher/dev tool.
- No Schoology column, no weight change for the trainer strand.

## 2. Phase 0: contract tests (no behavior change)

1. `tests/park-absorbs-trainer.test.mjs`: every `lessons` and `bonus` skill id in `data/ti84-lesson-map.json`
   is a `CALCULATOR_LEVELS` skillId. Every v2 procedure id in `ti84-procedures-data.json` is a park skillId
   or is listed in an explicit `RETIRED_PROCEDURES` array in the test with a one-line reason.
2. The relay's `calculator-native/` equals `ti84-trainer-v2/native/` byte for byte (there is already a mirror
   test pattern; extend it).
3. Every `patternSignatures` key in `ti84-pattern-recognition-data.json` is a park skillId. Canonical
   problems reference only park skillIds.

Phase 0 ships alone. If a test fails, the fix is content, and it is the teacher's call.

## 3. Phase 1: solo room

A second calculator room, `calc-solo`, in the same continuous world. No team block, no roster gathering.
The student walks to the calculator zone and the round starts for them alone.

- Relay: `createSoloRound(section, username, skillId | null)`. Reuses `createLevelRotation`, `varyProblems`,
  `pressMissionKey`, `timeLimitFor`, hint rungs from `park_calc_clears`. `teamSize` is 1, `readyCount` is 1,
  `complete` fires on the student's own solve. Clears are recorded exactly as a team clear.
- Skill choice: `skillId` from the deep link (§6) or, when absent, the SRS due list (Phase 3), or, before Phase 3
  ships, the lesson rotation the team room already uses.
- Client: `calculator-room.mjs` gets a `mode: 'team' | 'solo'` switch rather than a second file; everything
  team-specific (`teamStep`, pusher logic, "ask your team" copy) is behind it. One keypad renderer, one status column.
- Protocol bump to 12. Older clients see "Waiting for the team-block server update." as they do today.

Acceptance: a signed-in student can open `#room=calc-solo&skill=one-var-stats`, complete the route against
random data, and see the same clear celebration. `park_calc_clears` increments. No ledger row yet.

## 4. Phase 2: pattern recognition round

Before the route, the round can open with a recognition step: a canonical word problem and four skill tiles
(the right one plus three distractors from the confusion pairs). This is the v2 "which procedure?" flow.

- Data: `calculator-patterns.mjs` exports `PATTERN_SIGNATURES`, `CONFUSION_PAIRS`, `CANONICAL_PROBLEMS`,
  generated from `ti84-pattern-recognition-data.json` by a build script in `scripts/` (the JSON stays the source).
- Relay judges the pick. Wrong pick: the status line names the discriminating signal from the signature
  (`dataType`, `parameterType`, `questionType`, `sampleStructure`) in one sentence, e.g. "This asks about a
  mean, not a proportion." Then the route starts anyway on the right skill. The wrong pick is remembered for
  the SRS quality (Phase 3) and the ledger `response` (Phase 4).
- When: solo rounds always, when the skill has at least one canonical problem. Team rounds: off by default,
  teacher toggle on the room (`recognition: true`), because it adds a step before the shared clock.
- Protocol bump.

Acceptance: a solo round for `one-propztest` opens with a proportion word problem and the tiles
`one-propztest`, `one-propzint`, `t-test-stats`, `two-propztest` (right answer plus confusion-pair distractors).

## 5. Phase 3: spaced recall in the relay

Port v2's SM-2 to the relay so the schedule follows the student, not the device.

- Table `park_calc_srs` (new cr migration `0009_park_calc_srs.sql`, teacher-run, zero RLS policies like 0008):
  `(section, username, skill_id) pk, repetitions int, interval_days int, ease real default 2.5,
  next_review date, last_quality int, mastered bool default false, updated_at`.
- Quality (0..5) from the round, computed on the relay: start at 5; minus 1 per wrong key beyond the first
  (`lastPress.wrong`); minus 1 if a time-up hint was needed; minus 1 for a wrong recognition pick; floor 0.
  Quality ≥ 3 advances the interval (1, 6, then ×ease); below 3 resets to 1. Ease update is v2's formula.
- `mastered` flips true on the first solo clear at hint rung 2 (no hints) with quality ≥ 4. This replaces v2's
  mastery gate, which required the emulator or handheld check (see Phase 5 for the handheld path). Mastery is
  what pays the solo door's bonus point (§6).
- `GET /park/calc/due?section&username` returns the due skills sorted by overdue days, then the lesson map's
  topics for today (the relay already reads `lesson-schedule.json` paths through roster-server; if not, the
  client passes today's topics in the deep link). The solo room with no `skill` picks the first due skill.
- The Desk chip "Today's calculator skill" keeps its lesson-map logic, and the resource panel adds "N skills
  due" from this endpoint. Both open the solo room.

Acceptance: clearing a skill at quality 5 twice on consecutive days yields `next_review` six days out; a
quality 2 clear resets it to tomorrow.

## 6. Phase 4: keys and the solo door's bonus point

Two rewards, both on rails that already exist. Nothing touches a grade.

**Keys.** A solo clear pays +1 campaign key to the student through the same wallet path a team clear uses
(`calculator-service.mjs` ~line 55, `campaign-wallet.mjs`, `park_campaign_wallet`). Once per round, guarded by
the round epoch exactly like `keysAwardedEpoch`. Keys keep their one job: gating campaign stage progression.

**The solo door.** In the world, the solo room is entered through its own door, and the door is where the bonus
is explained in one line: "Master a skill here, bank one bonus point." The point is paid once per skill, on the
round that flips `mastered` (§5), never on a plain clear and never again for the same skill.

- Rail: the banked bonus ledger (`BONUS_BANK_SPEC.md`, `BONUS_HIGHER_TRACK_SPEC.md`). The relay calls
  roster-server `POST /class/bonus` with `sheetId: 'TI84-<skillId>'`, `title: 'Calculator: <skill title>'`,
  the current quarter, and one entry `{ username, grade: 'I' }` (I = 1 point on the E/P/I scale). The row
  upserts at `attempt: 1`, so re-mastering is a no-op: exactly one point per skill per student, forever.
- Auth: `/class/bonus` is `requireTeacher`. The relay authenticates with the roster-server teacher key, the same
  value the hourly FRQ regrade workflow already holds as `APSTATS_TEACHER_KEY`. The relay reads it from one env
  var (`ROSTER_TEACHER_KEY`); add it to `.env.example` and to the teacher-switch wizard's secret list.
- Quarter: the relay asks roster-server which quarter is open (the route the Desk uses for the quarter label)
  rather than computing dates itself.
- Failure to reach roster-server never blocks the celebration. The relay retries once, then logs; the student's
  `park_calc_srs.mastered` stays true, and a nightly sweep (`scripts/park-bonus-sweep.mjs`, teacher-run) re-posts
  any mastered skill with no matching `BONUS-TI84-<skillId>` row.
- Visibility: the Desk's existing bonus-bank card lists it like any other banked sheet ("Calculator: 1-Var
  Stats, I, +1"). No new Desk surface.
- Team rounds pay keys only. No bonus from a team clear, because mastery is a solo judgement.

Acceptance: mastering `one-var-stats` in the solo room adds one key to the wallet and one `BONUS-TI84-one-var-stats`
row with score 1; clearing it again changes neither. The grade engine's output for the student is unchanged.

## 7. Phase 5: handheld check

v2's "type the result from your real calculator" verification, which never needed the emulator.

- After a solo clear, an optional tile: "Now on your real TI-84: enter the same data and type the result."
  The relay already has the round's random data and `computed`; it compares the typed value to the
  result-screen value with the same tolerance `stat-math.js` uses.
- Pass: SRS `mastered` true (which pays the solo door's bonus point if this is the first mastery of the skill).
  Fail: one retry, then nothing recorded.
- This is the only place a student is asked to touch a physical calculator, and it is where the
  "trainer fidelity gaps" in `apstat-park/CALCULATOR_GOALS_REVIEW.md` matter: the goal phrases already say
  "real CE: ENTER again" where the trainer and the hardware differ.

## 8. Phase 6: rewire and delete

1. Codemod (`scripts/wire-park-calculator-links.mjs`, pattern-guarded to `^u\d+_lesson.+_live\.html$`):
   `ti84-trainer-v2/standalone.html#topic=T&source=worksheet` → the park solo deep link for the same topic.
   The park resolves `topic` through the lesson map; the link carries `topic`, not `skill`, so the map stays
   the single source.
2. Desk: `APP_REGISTRY.ti84.url` → park solo entry; `_renderTi84SkillBtn` and `_openTi84ForTopic` build park
   links; `index.html`, `start-here.html`, `TOC.html` updated. The iframe id and app id `ti84` stay, so
   `isTool` logic and sfx are untouched.
3. `ti84-plot.js` (Live Classroom poll plots) was adapted from `native/screen-renderer.js`; it now imports from
   `calculator-native/` instead of carrying a copy, or stays as is if the import would need a bundler. Note which.
4. Delete: `ti84_trainer.html`, `ti84-verify.html`, `ti84-trainer-v2/` except `native/` (moved) and
   `wasm/` + `bridge.js` + `CEMU_BUILD.md` (moved to `tools/ti84-rom/`), `ti84-procedures-data.json`,
   `ti84-state-machine.js`, `ti84.png`, the 16 `TI84_*` specs and `ti84-*-spec.md` files, the three
   `codex-ti84-*-prompt.md` files. They live in git history.
5. `package.json`: drop `build:ti84`. CI: drop any step that builds the trainer.
6. roster-server `trainer.js` (cloud save for tmux-trainer decks) is unrelated to this trainer and stays.

Acceptance: `rg ti84-trainer-v2` over the repo returns nothing outside git history and `tools/ti84-rom/`.
All 25 worksheets open the park. The Desk chip opens the park. `npm test` and `npm run test:park` pass.

## 9. Teacher decisions needed before Phase 1

1. Bonus policy in §6: one point (grade I) per skill on first mastery, solo only. Alternatives: pay on first
   clear instead of mastery, or let the handheld check (§7) pay a second point.
2. Recognition step in team rounds: off by default, or on.
3. Keep the emulator anywhere student-facing, or tools only (spec says tools only).
4. Retire the four `bonus` skills (geometpdf, geometcdf, chi-square-gof, linreg-ttest/tint) from the solo
   rotation, or keep them reachable by deep link only (spec says deep link only, matching the lesson map note).

## 10. Order and size

Phase 0 is an hour. Phases 1 and 2 are one overnight each. Phase 3 and 4 together are one overnight
(they share the relay's round-complete hook). Phase 5 is half a day. Phase 6 is mechanical, one session,
and only after the teacher has used the solo room in class for a week.

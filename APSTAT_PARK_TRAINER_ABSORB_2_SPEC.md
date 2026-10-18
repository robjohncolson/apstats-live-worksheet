# APStat Park calculator: absorb round 2 (the trainer mechanics the first absorb skipped)

Status: approved by the teacher 2026-10-18 ("1..5 sound good, spec it all, implement with Opus 5.5, review
with Codex gpt-6-astra, go to your complete satisfaction"). Decisions the teacher could not be asked about
are made here and marked **(decided)**; each is one constant or one rule to flip later.

Builds on `APSTAT_PARK_TRAINER_ABSORB_SPEC.md` (phases 0–6, protocol 16) and
`APSTAT_PARK_CALCULATOR_FLUENCY_SPEC.md` (hint rungs, clears, random data). Nothing here touches a grade:
the only ledger row stays the solo door's banked bonus point on first mastery (ABSORB §6).

Protocol: one bump, **16 → 17**, for all five parts. Shared modules stay byte-identical between
`apstat-park/` and `curriculum_render/railway-server/apstat-park/` (the Phase 0 identity test). Any
module this spec adds to the shared set joins that test.

The retired trainer is at git `aa5d750f^` (`ti84-trainer-v2/app.js`); line numbers below point into it.

## 0. The five gaps (from the 2026-10-18 audit)

| # | Trainer had | Park has today | This spec |
|---|---|---|---|
| 1 | Wrong procedure pick → sample problem + guided walkthrough of the chosen procedure, then the original question again minus that choice (`openBranchIntro` 3066, `startBranchWalkthrough` 3083) | One discriminator sentence, then the route | §1 branch rounds (solo only) |
| 2 | Data-setup phase: the student types the lists / matrix (`renderDataSetupPanel` 4652, micro-skills enter-data-l1, clear-lists) | Lists pre-loaded every round | §2 data-entry steps at rung ≥ 1 (solo only) |
| 3 | Recall demoted to guided after a messy run: 3+ errors, 2+ hints, 2 missed cells (`applyTrack2Outcome` 3169) | Rungs only climb; any clear counts | §3 messy clears do not climb; a bad clear at rung 2 drops to 1 |
| 4 | Mastery check typed several fields: t and p, both bounds, x̄ and Sx (`VERIFICATION_FIELDS` 752) | The first labelled number only | §4 up to three fields |
| 5 | Dashboard: Due / New / Mastery % per procedure, unit filter (`renderDashboard` 5378) | " · N skills due" on one resource row | §5 Calculator Skills progress view (Desk + Pico Desk) |

## 1. Branch rounds after a wrong pick (solo only)

**Behaviour.** In a solo round with the recognition step, a wrong pick no longer starts the right route at
once. Instead:

1. The relay keeps the discriminator sentence (already in `state.recognition.message`) and starts a **branch
   round** on the skill the student picked: the catalogue level for that skill (its first problem, varied
   like any round; `CALCULATOR_PROBLEMS` filtered by `skillId`, same as `soloLevel`), no recognition step,
   the student's own rung for that skill (§1 fluency; a skill never cleared plays at rung 0, full hints).
   The branch has its own epoch. Client title row: `BRANCH · <picked skill title>`; caption under it:
   `NOT <picked>. <discriminator sentence>`; second line `RUN IT ONCE, THEN BACK TO YOUR PROBLEM.`
2. When the branch route completes (the usual `complete` for a roster of one), the relay does **not** award
   a key and does **not** count a clear for the branched skill. It records the recall review for the
   branched skill at **quality 2** (the trainer's passive credit, `track1QualityForBranches` 3336 region)
   **unless** the student already has a better-than-fresh record for it (repetitions > 0): then nothing is
   recorded, a branch is never allowed to lower a real schedule. **(decided)**
3. The relay then restarts the **original** round: same problem, same data, a new epoch, the recognition
   step back with the wrong option removed (`options` shrinks by one; `picked` null again), and
   `recognition.branches` = number of branches taken so far in this round. The client shows the original
   stem and the remaining tiles. The 15 s clock is not running during recognition (unchanged).
4. There is no limit on branches; the options shrink to one, which the student still has to click.
   **(decided)**: no cancel. A branch is at most the branched skill's route (7–37 keys at 15 s a step)
   with full hints, which is the lesson.
5. When the right skill is finally picked, the route plays as today. Quality for the round
   (`qualityFor`, shared `calculator-srs.mjs`): replace the flat −1 for a wrong pick with **−1 per branch**
   (`recognition.branches`), floor 0 as before. Team rounds keep the old behaviour exactly (one sentence,
   route starts, −1 once): team rounds have no branches, `branches` stays 0 there, and the old
   `correct === false` penalty applies when `branches` is absent/0 — write `qualityFor` so both hold.
6. Mastery (`isMasteryClear`) is unchanged; a branched round rarely reaches quality 4 anyway.

**Relay.** `calculator-service.mjs`: on `calculator_pick` in a solo room with a wrong pick, call
`startBranch(room, pickedSkillId)`: push `{ level: room.level, recognition: state.recognition (with the option
removed and picked reset), startedAt }` on `room.branchStack`, `setLevel(room, branchLevel)` with
`recognitionRound: null`, mark `state.branch = { skillId, returnTitle: original.title, depth }` on the new
attempt, new epoch, `resetReason: { type: 'branch', skillId }`. In `broadcast` where `teamComplete` triggers
`awardKeys`: if `room.branchStack.length`, call `finishBranch(room)` instead: SRS rule in (2), pop the stack,
`setLevel(room, popped.level)` with the popped recognition, new epoch, `resetReason: { type: 'branch-return' }`,
broadcast. A time-up in a branch restarts the branch like any solo round (`resetRoom` keeps the stack). A
door reset / leaving the room drops the stack (the original problem is gone with the round, as today).
The spectator's solo row shows the branch title with `BRANCH` prefixed.

**Client.** `calculator-room.mjs`: a packet whose `epoch` differs with `resetReason.type` of `branch` or
`branch-return` is a fresh round **without** walking back to the door (like a time-up restart:
`restarted` path with `solo`); the player keeps participating. `state.branch` drives the title row and the
two caption lines; `getView()` adds `branch: { skillId, title, depth } | null` and `recognition.branches`.
Screen reader status at branch start: `Not <picked>. <sentence> Run <picked> once, then your problem
comes back. Step 1/N ...`; at return: `Back to your problem. Which procedure? ...`.

**Shared.** `calculator-mission.mjs`: `createMission` takes the branch marker through its `recognition`
argument or a new `branch` argument (implementer's choice; byte-identical on both sides);
`pickRecognition` is unchanged (the relay decides what to do after it returns `correct === false`).

**Tests.** Relay: wrong pick in solo → branch round on the picked skill with no recognition; branch
complete → no key, no clear, SRS quality 2 only when fresh; return round has the option removed and the
same problem data; two branches → `branches: 2`, `qualityFor` = 3 at zero wrong keys; team wrong pick →
unchanged. Client: title/captions/status for branch and return; the player does not return to the door.

## 2. Data-entry steps (solo, rung ≥ 1)

**Behaviour.** The 13 list-based skills (one-var-stats, histogram, modified-boxplot, dotplot, scatterplot,
residual-plot, linreg-a-plus-bx, t-test-data, t-interval-data, chi-square-gof-test, linreg-ttest,
linreg-tint, matrix-entry → `setup.lists` non-empty) and chi-square-test (`setup.matrices.A`) currently
start with the data already in the calculator. In a **solo** round, once the student's rung for the skill
is **≥ 1** (cleared it at least once with the data pre-loaded), the calculator starts **empty** and the
route is prefixed with the keys that enter the data **(decided: the gradient is rung 0 = learn the
procedure, rung 1+ = enter your own data too; team rounds never enter data, the 15 s block clock is a
team game)**.

**The prefix** (new shared module `calculator-data-entry.mjs`, byte-identical both sides):
- `dataEntryRoute(setup)` → `{ route: [...], hints: [...], goals: [...] }`. Lists: `STAT`, `ENTER`
  (1:Edit), then for each value of L1 its keys (`(−)` for a minus sign, `.`, digits) followed by `ENTER`;
  then `RIGHT` to L2 and the same; then `2ND`, `MODE` (QUIT) back to the home screen. Matrix [A]: the
  catalogue's own `matrix-entry` route is the reference for the key path (`2ND`, `x⁻¹` → MATRIX, EDIT,
  dimensions, cells); reuse it. Hints (rung 0 text is never shown at rung ≥ 1, but write it anyway for
  the time-up help): `Type 68, then ENTER.`; goals (rung 1): `Enter the next L1 value.` /
  `Move to L2.` / `Quit to the home screen.`; rung 2: nothing, as today.
- `withDataEntry(level)` → a copy of the level with `setup.lists = {}` (and matrices `{}`) and
  `entryData: original setup`, `route`/`hints`/`goals` prefixed, `dataSteps: prefix.length`. Everything
  after the prefix (challenge, answers, computed, finalView) is unchanged because the engine's final
  state is identical once the data is in.
- Arrow keys and `ENTER` are already never wrong / free (`NEVER_WRONG`); a wrong **digit** costs the
  usual 2 s and counts as a wrong key (so a sloppy entry round is a messy clear under §3, which is right).
- The implementer must prove with an engine test (`calculator-native` via `createCalculatorRuntime`) that
  playing `withDataEntry(level).route` from an empty calculator ends with `lists` equal to `setup.lists`
  and the same final screen / computed values as the catalogue level, for **every** one of the 14 skills.
  If one skill's editor path cannot be driven by the engine, that skill is listed in
  `DATA_ENTRY_SKIPPED` with the reason, plays as today, and the spec says so here.

**Relay.** `soloLevel(room)`: after choosing/varying the level, if `rungFor(clears.clearsOf(...)) >= 1`
and the level has entry data, `level = withDataEntry(level)`. Varied data (protocol 10) is applied first,
so the student types the round's own numbers. A branch round (§1) never has data entry (the branch is the
procedure lesson, always rung-0 shaped) **(decided)**.

**Client.** While `state.step < level.dataSteps`: title row `ENTER THE DATA`, a progress line
`L1: 3/12 · L2: 0/12` (count the values present in `calculator.save().lists` vs `entryData`), and the
status line says `Enter the data. L1: 3 of 12. <hint>`. The room's `calculatorLists` view already carries
the lists. After the prefix the title is the skill title as today. `getView()` adds
`dataEntry: { active, lists: { L1: { entered, total } ... } } | null`.

**Tests.** Shared: `dataEntryRoute` key sequences for a 3-value L1, a negative decimal, two lists, the
matrix; `withDataEntry` prefix lengths. Engine proof test above. Relay: rung 0 → lists pre-loaded; rung 1
→ empty start + prefix; team room → never. Client: title/progress/status during entry.

## 3. Messy clears do not climb the rung

**Rule** (`calculator-clears.mjs`, relay, in `awardKeys` where `clears.record` runs):

| clear quality (`qualityFor`) | rung change |
|---|---|
| ≥ 3 | +1 clear (as today) |
| 2 | no change ("messy clear") |
| ≤ 1 at rung 2 | −1 clear (back to goals-only hints) |
| ≤ 1 at rung 0 or 1 | no change |

Clears are absolute counts, so `record(section, names, skillId, deltaByName)` takes a per-name delta of
+1 / 0 / −1, floor 0. Memory and store are unchanged otherwise. Quality 2 = three wrong keys with no
time-up, or two with one; the thresholds mirror the trainer's 3+ errors demotion. **(decided)**

**Visible.** The relay puts `rungChange: 1 | 0 | -1` and `clearQuality` on each member's completed state.
Client complete line (solo and team): `+1 key.` then one of `Hints fade next round.` (when the rung
actually rises, i.e. clears was < 2) / `Messy clear: hints stay where they are.` /
`Rough clear: the goal hints come back next round.` Nothing is said when the rung is already 2 and the
change is +1 (nothing changes for the student).

**Tests.** Relay: a quality-5 clear climbs; quality-2 does not; quality-1 at two clears drops to one;
floor 0; the store receives absolute counts. Client: the three lines. Spectator unchanged.

## 4. The handheld check asks for up to three fields

**Behaviour.** `handheldFor(level)` (shared `calculator-handheld.mjs`) returns
`{ fields: [{ label, expected }], label }` with the challenge's first **three** labelled numeric answers
(`challenge.labels`/`answers`), `label` kept as the first field's label for older packets. One-var stats
therefore asks for Minimum, Q1, Median; a t-test asks for its t and p (and df when the challenge has it);
an interval asks for both bounds. **(decided: three, not all five, keeps the form one row.)**

**Relay.** `state.handheld = { fields: [labels], attempts, status, misses: [] }`. `calculator_handheld`
carries `values: [..]` (strings, one per field; the old `value` string is accepted as a one-element
array). A check passes when **every** field matches (`handheldMatches`, tolerance unchanged). A failed
check sets `misses` to the indexes that did not match and increments `attempts`; `HANDHELD_ATTEMPTS = 2`
stays, the second failure closes the check as today. Mastery / bonus flow unchanged.

**Client.** The form shows one input per field, labelled, in a row; after a miss the missed inputs get a
red outline and the line `Not a match: <label>. Check sign and decimals.` (trainer's W2 wording,
`renderAnswerFieldRows` 4695); matched inputs are kept and disabled. `getView().handheld` carries
`fields`, `misses`.

**Tests.** Shared: `handheldFor` field lists for one-var-stats (3), t-test-data (t, p, df), t-interval
(lower, upper), histogram (whatever its challenge labels are). Relay: all-match passes; one miss →
`misses: [i]`, attempts 1; second miss closes; legacy `value` string works. Client: inputs, red outline,
line text.

## 5. Calculator Skills progress view

**Relay.** `GET /park/calc/progress?section&username` → `{ ok, today, skills: [ { skillId, title, topic,
unit, eligible, clears, rung, repetitions, intervalDays, nextReview, lastQuality, mastered, due,
overdueDays } ] }` for every catalogue skill (`CALCULATOR_LEVELS`), `eligible` from the section's
calendar gate (`available(section, today)`), clears from `clears.clearsOf`, the record from
`srs.recordOf` (fresh record → zeros/nulls), `due` from `dueSkills`. Service method `progress(section,
username)`, route in `server.js` beside `/park/calc/due`, same CORS. Read-only, creates no room or
attempt.

**Desk (classic).** `_openCalcProgress()` opens a content modal titled `Calculator Skills` (closes with
Esc like every content modal; reuse the existing modal helper the resource panel uses). Rows grouped by
unit, each: skill title, topic label through `cedLabel` (the CED-2026 rule: never print a raw old key),
a state chip, and a `Practice` link → `_openParkSolo('&skill=' + skillId)`. State chip, in this order:

| chip | when |
|---|---|
| MASTERED · <date> | `mastered` |
| DUE · <n> days overdue | `due` (0 days → `DUE TODAY`) |
| NO HINTS / GOALS ONLY / FULL HINTS | by `rung` 2 / 1 / 0 after at least one clear or review |
| NEW | no clears and no record |
| LOCKED | not `eligible` and no record (the calendar has not opened it; still playable by deep link) |

A header line: `<m> mastered · <d> due · <n> new` and a unit filter (`All` + one button per unit with a
catalogue skill). Entry points: the resource row's ` · N skills due` link stays; add a `progress` link
beside the `Calculator Skill` row link on every lesson that has one, and an item under the Desk's
practice/resources menu where the Review deck lives. The modal fetches on open and caches for 60 s like
`_renderCalcDue`.

**Pico Desk.** `pico-home.js` PRACTICE list gets `{ label: 'CALC SKILLS', run: function () {
callDesk('_openCalcProgress', []); } }` after `CALCULATOR`.

**Tests.** Relay: shape, `eligible`, a mastered row, a due row, a locked row. Desk (`tests/desk-*.test.js`
style, jsdom): the modal renders the chips in the right order, the header counts, the filter, the
practice link hash, Esc closes, no raw old keys (extend `tests/ced-no-raw-keys.test.js` with the modal).
Pico Desk: the menu item calls through.

## 6. Order, size and the shared-module rule

Sequential, one Opus 5.5 implementer per part, each leaving `npm run test:park`, the relay's
`npm test` (from `curriculum_render/railway-server`) and the root `npm test` green, and each syncing the
shared modules both ways before finishing (copy, then run the identity test):

1. §5 progress (new surface, least coupled).
2. §3 rung demotion (one relay function + one client line).
3. §4 handheld fields.
4. §2 data entry (new shared module + engine proof).
5. §1 branch rounds (touches the round flow that 2–4 just changed).
6. Protocol 16 → 17 in `calculator-lobby.mjs` (shared), both repos, once at the end; Desk build bump;
   Codex gpt-6-astra review of the whole diff; fixes; push `follow-alongs` then `curriculum_render`
   (the relay auto-deploys and restarts: rounds in progress at that moment reset, which is why this
   ships at night).

## 7. Acceptance

- Solo, wrong pick: a branch round on the picked skill; its clear gives no key; the original problem comes
  back with that choice gone; the final quality is 5 − branches at zero wrong keys.
- Solo at rung 1 on one-var-stats: the lists start empty, the title says ENTER THE DATA, the hint rung
  still applies, the progress line counts up, the route after the data is the catalogue's.
- A clear with four wrong keys does not change the rung; a clear with five at rung 2 drops to goals-only.
- After a solo clear the check asks for three labelled values; a miss names the field.
- Calculator Skills modal on the Desk and Pico Desk lists all 32 skills with the right chips.
- Team room: nothing in §1, §2 applies; §3 and §4 apply (§4 is solo-only already).
- `npm test`, `npm run test:park`, relay `npm test` green; shared modules byte-identical; protocol 17.

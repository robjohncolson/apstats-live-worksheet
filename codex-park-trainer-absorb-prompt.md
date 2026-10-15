# Prompt: absorb the TI-84 trainer into APStat Park

You are implementing `APSTAT_PARK_TRAINER_ABSORB_SPEC.md`. Read it in full first, then
`APSTAT_PARK_CALCULATOR_FLUENCY_SPEC.md` (the last spec built on this code) and
`apstat-park/CALCULATOR_GOALS_REVIEW.md`. Do one phase per invocation; the phase number is given
below as `PHASE=`. Stop at the phase's acceptance criteria and report.

## Repo facts you must not rediscover

- Client lives in this repo under `apstat-park/`. Relay lives in
  `../curriculum_render/railway-server/apstat-park/` (after the monorepo merge: `services/relay/apstat-park/`;
  the spec's §0 path table is the authority).
- `calculator-mission.mjs`, `calculator-curriculum.mjs`, `calculator-catalog.mjs`, `calculator-engine.mjs`,
  `calculator-lobby.mjs` are byte-identical between client and relay. If you change one, copy it to the other
  side in the same commit and bump `CALCULATOR_PROTOCOL` in `calculator-lobby.mjs` with a dated comment line,
  as the file already does for 9, 10, 11.
- The native engine is `ti84-trainer-v2/native/` on the client side and `calculator-native/` on the relay side,
  byte-identical. Park tests already load it through `nativeScriptFilenames` from `native/manifest.mjs`.
- The relay owns the clock, the problem, and every judgement. The client renders. Never let the client decide
  a clear, a quality, or a ledger score.
- `park_calc_clears` (cr migration 0008) is the model for any new table: teacher-run SQL, idempotent,
  RLS enabled with zero policies, relay keeps working memory-only when the table is missing.
- The park never writes `source:'trainer'` rows and never touches a grade. The only roster-server write is the
  banked bonus row in Phase 4, through the teacher route `POST /class/bonus` (`roster-server/class.js` ~line 550).
  Do not touch `lesson-grade.js` or `grade-config.js`.
- Keys: a completed round pays +1 key per member via the wallet (`calculator-service.mjs` ~line 55,
  `keysAwardedEpoch`). The solo room reuses that exact path.
- Tests: `npm test` (vitest, root) and `npm run test:park` (node --test over `apstat-park/*.test.mjs`) on the
  client; `npm run test:park` in the relay. Browser smokes are `apstat-park/calculator-browser-smoke.mjs`.
- GitNexus is indexed here. Run impact analysis on any exported function you change in
  `calculator-service.mjs`, `calculator-room.mjs`, or `calculator-mission.mjs` before editing, and
  `detect_changes` before you commit.
- Commit style: `APStat Park calculator: <what changed in one line> (ABSORB_SPEC §N, protocol P)`.
  Relay commits reference the client commit hash the way existing ones do (`— fa <hash>`).

## Phase instructions

PHASE=0: write `tests/park-absorbs-trainer.test.mjs` per spec §2. Do not fix content; if a lesson-map skill
or pattern signature has no park skillId, list it in `RETIRED_PROCEDURES` with a reason and flag it in the
report for the teacher. No protocol bump.

PHASE=1: solo room per §3. Add `mode` to `calculator-room.mjs`; do not fork the file. Relay:
`createSoloRound` beside the team round in `calculator-service.mjs`, reusing the rotation, variation,
press judgement and clears. Deep link `#room=calc-solo&skill=<id>` and `#room=calc-solo&topic=<t>`
(topic resolves through `data/ti84-lesson-map.json`, first skill in the array). Protocol 12.
Add a solo browser smoke next to the existing one.

PHASE=2: recognition step per §4. Build script `scripts/build-calculator-patterns.mjs` that writes
`calculator-patterns.mjs` from `ti84-pattern-recognition-data.json` (both sides, byte-identical). Relay
picks the canonical problem and the three distractors (confusion pairs first, then same-unit skills), judges
the pick, and emits the one-sentence discriminator. Solo always, team behind `recognition: true`.
Protocol bump.

PHASE=3: SRS per §5. Migration `0009_park_calc_srs.sql` in the relay's `migrations/`, memory fallback like
`calculator-clears.mjs`. New shared module `calculator-srs.mjs` with pure functions `qualityFor(round)`,
`advance(record, quality, today)`; port the numbers from `ti84-trainer-v2/app.js` lines 3100–3140 exactly
and cite them in a comment. `GET /park/calc/due`. The solo room with no skill opens the first due skill.
Tests: the two acceptance cases in §5, and a property test with fast-check that interval never goes below 1
and ease never below 1.3.

PHASE=4: keys and the solo door's bonus point per §6. Keys: solo clear pays +1 through the existing wallet
path with the epoch guard; add a test beside `campaign-keys-count.test.mjs`. Bonus: on the round that flips
`mastered`, POST `/class/bonus` with `sheetId 'TI84-<skillId>'`, `grade 'I'`, one entry; `ROSTER_TEACHER_KEY`
from env (confirm with `requireTeacher` in `roster-server/teacher-auth.js` which header it reads). Ask
roster-server for the open quarter; do not compute dates. One retry, then log, never block the celebration.
Write `scripts/park-bonus-sweep.mjs` (dry-run default). Test with the roster-server mock the relay tests already
use for key grants, and prove the second mastery of the same skill posts nothing.

PHASE=5: handheld check per §7. Tolerance from `stat-math.js`; one retry; no row on failure.

PHASE=6: rewire and delete per §8, only when the prompt says the teacher approved it. The codemod must
be pattern-guarded to `^u\d+_lesson.+_live\.html$` and idempotent (re-running changes nothing). Report the
`rg ti84-trainer-v2` result and the list of deleted paths.

## Report format

End with: phase, protocol number, files changed on each side, tests run with pass/fail counts, the
acceptance criteria as a checklist, and any question for the teacher. If a decision in spec §9 blocked you,
say which one and what default you used.

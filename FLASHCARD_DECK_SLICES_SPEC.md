# Flashcard decks: 30-card sittings, per-day slices, save & resume — spec

> Teacher, 2026-11-07: "cap to 30 cards sampled from any deck over 30 … deal each day its own
> 30-card slice of the combined csv … save and resume a half finished run … this will fix the
> lost work pain." Implementers: Opus 5.5 (two lanes, below). Review: Codex gpt-6-astra, ultra.
> Companion contracts: FLASHCARD_TIMED_DECK_BUILD.md (credit ladder, unchanged),
> FLASHCARD_V2_BUILD.md (per-card log, unchanged), CLAUDE.md "Blooket credit" (no pass mark).

## 0. Why

The Desk's timed deck deals **every** card of the lesson's Blooket CSV, 40 s a card, and records a
score only when the last card is resolved. Closing the window throws the run away. Unit 1 CSVs have
27–32 cards (5–7 min). The CED-2026 Unit 2 CSVs were generated per *combined worksheet*, so one
sitting is 55–80 cards (10–13 min median, 39 min worst) and nothing is saved if the student stops.
Finished-run counts collapsed from 12–23 per Unit 1 deck to 2 for the 2.7 and 2.8–2.9 decks.

| Worksheet (old keys → CED) | CSV | Cards dealt today | Finished runs (B+E) |
|---|---|---|---|
| u4_lesson1-2 (4.1, 4.2 → 2.3 Day 1/2) | u4_l1_l2_blooket.csv | 59 | 17 |
| u4_lesson3-4-5 (4.3, 4.4, 4.5 → 2.4, 2.5, 2.6) | u4_l3_l4_l5_blooket.csv | 55 | 12 |
| u4_lesson6 (4.6 → 2.7) | u4_l6_blooket.csv | 59 | 2 |
| u4_lesson7-8 (4.7, 4.8 → 2.8, 2.9) | u4_l7_l8_blooket.csv | 77 | 2 |
| u4_lesson10-12 (4.10, 4.11 → 2.10 Day 1/2; 4.12 unscheduled) | u4_l10_l12_blooket.csv | 80 | 0 |

Three other combined worksheets exist and are **not** sliced (their decks are already Unit-1 sized):
u3_lesson6-7 (30 cards), u5_lesson1-2 (35), u6_lesson1-2 (35). They keep today's behaviour except
for the cap and the resume.

## 1. Decisions (locked)

**D1 — A sitting is at most 30 cards.** `BLOOKET_DECK_CARDS = 30` (Desk) = `Flashcards.DECK_CARDS`
(engine). The deck dealt for a run is a fresh uniform random sample of 30 from the topic's *card
pool* (shuffle, take 30). Pools of 30 or fewer are dealt whole. The score is `earned / dealt × 100`
(the round's `total` is the dealt count — `_ftCreateRound` is unchanged). A re-run draws a new
sample; best-wins keeps the grade monotone exactly as today.

**D2 — Combined decks are sliced per day from `data/blooket-deck-slices.json`** (authored 2026-11-07,
ranges placed by reading every stem — see §2). A topic's card pool is its slice when the file has an
entry for `(csv, topic)`; otherwise the whole CSV. An entry whose filter would leave an empty pool
falls back to the whole CSV (a bad range must never produce an empty deck).

**D3 — Grading: per-day scores for sliced Q2 groups; nothing already counted moves.**
- A run dealt from a **slice** records item id `BL-U{u}-L{key}-DESK_DAY`. A run dealt from a whole
  CSV (solo deck, or a combined deck with no slice entry) records `BL-U{u}-L{key}-DESK_DONE` exactly
  as today. The Desk decides the suffix from one fact only: *was a slice dealt?*
- Server: `DESK_DONE` rows and real game rows keep today's rule — the group's best is copied to every
  topic of the worksheet group. That grandfathers every finished full-deck run (17 + 12 + 2 + 2 above)
  and makes a stale cached client degrade gracefully (its full-deck run still credits the group).
- `DESK_DAY` rows are **per topic** — except in a group that is *not per-day* (below), where they are
  shared like `DESK_DONE` so the tiles and the Blooket track always agree.
- A worksheet group is **per-day** when (a) its CSV has a slices entry **and** (b) the group's earliest
  zero date for the student's section is on/after `BLOOKET_PER_DAY_FROM = '2026-11-13'`
  (grade-config constant; a config override of `null` turns per-day off → today's behaviour). Zero
  date = the same `zeroDate` that `/grade` reports (class day + `dueLagDays`).
  Result for SY26-27: **2.3 (4.1-2) and 2.4–2.6 (4.3-5) stay one-score-per-worksheet** (their zero
  dates are 11/05–11/12 in both sections): a student catching up before the Q1 close can clear the
  group with any one day's short deck, and no Q1 number changes on Thursday.
  **2.8–2.9 (4.7-8) and 2.10 (4.10-12) are per-day** (zero dates 11/19+): each day is its own deck,
  its own score and its own slot in the Blooket track.
- `blooket = max` of the non-null among game, `DESK_DONE` best, `DESK_DAY` best (after sharing).
- Blooket track (`computeQuarterV3`): the combined-worksheet collapse (`blooketGroupKey`) keeps one slot
  per group **unless the group is per-day and the topic is due**: a per-day day that is due is its own
  slot; the group's days that are not yet due (ahead of schedule, or late after a quarter close) still
  share the group slot, worth the best of their scores. The late-decks loop uses the same key. (As built
  11/07: the literal "every per-day topic is its own slot" rule counted an early full-deck or game
  score twice before the days came due and broke the acceptance property below; see §11.)
- **Acceptance test at deploy:** every student's Q1 and Q2 numbers in `/class/grades` (both sections)
  are byte-identical before and after the deploy. Nothing per-day is due yet and every existing row
  keeps its semantics, so any difference is a bug.

**D4 — Save & resume.** A timed run persists in `localStorage` (per student, per topic) after every
card outcome and every card render. Opening the same topic's deck again resumes it: same dealt cards,
same queue, same credits, same `roundId`; the card that was on screen comes back with **the clock
still running in wall time** — `remaining = 40 − (now − cardStartMs)/1000` with the saved `cardStartMs` kept EXACTLY across any number of resumes (the deadline is `cardStartMs + 40 000 ms`; the seconds shown derive from wall time each tick; an answer after the deadline is a timeout); if that is ≤ 0 the card is
recorded as a timeout (one miss, re-queued, no answer shown) and the next card is dealt. A run saved
*between* cards (after an outcome, before the next render) resumes on the next card with a full
40 s. Saved runs expire after 14 days; a saved run for a different CSV than the topic now resolves
to is discarded. Finishing clears the save. Closing (`_bfCloseUI`, `closeFlashcards`) never clears
it. While a resumed run is on screen a small **Start over** control deals a fresh deck (clears the
save; best-wins means it can't hurt the grade). Per device only — cross-device resume is out of scope
(the per-card SRS log still syncs at finish as today).

**D5 — Student copy.** Never "80%", "done", "credit" or "pass" (tests pin this). Header:
`Timed deck — <cedLabel> · <N> cards · 40s/card · up to 100%`. Credit note unchanged, plus for a
sliced deck: `This deck covers <cedLabel> only — the other days of this worksheet have their own
decks.` Resume note: `Picking up where you left off — <k> of <N> cards left.` Tile labels
("Do flashcards (your score = Blooket grade)", "Flashcards N% — redo to raise it") unchanged.

## 2. The slices file — `data/blooket-deck-slices.json` (already written)

Shape: `{ version, generatedAt, note, cardsPerDeck: 30, slices: { "<csv>": { "<oldTopicKey>": [[lo, hi], …] } } }`.
Ranges are inclusive over the CSV's Q# column (column 0, the same `qnum` `_bfRowsToDeck` keeps);
gaps in the Q# numbering are fine. Old keys are storage ids and never printed.

Resulting pools (valid cards per `_bfRowsToDeck`):

| CSV | Topic → pool | Dealt |
|---|---|---|
| u4_l1_l2 (59) | 4.1 → 34 (random process, outcomes/events, simulation, LLN, independence, streaks) · 4.2 → 25 (sample space, P(A), complement, distributions) | 30 · 25 |
| u4_l3_l4_l5 (55) | 4.3 → 23 (sample space, P(A), 0/1, complement, record-store basics) · 4.4 → 17 (mutually exclusive, ∩, joint, Venn) · 4.5 → 15 (conditional, multiplication rule, with/without replacement, two-way table) | 23 · 17 · 15 |
| u4_l7_l8 (77) | 4.7 → 44 (random variables, discrete/continuous, valid distributions, shape) · 4.8 → 33 (expected value, SD/variance, parameters, interpretation) | 30 · 30 |
| u4_l10_l12 (80) | 4.10 → 27 (binomial setting, formula, pdf/cdf, AP writing) · 4.11 → 18 (binomial mean/SD, interpretation) · 4.12 → 35 (geometric; not scheduled in CED-2026, dormant) | 27 · 18 · (35) |

Vendored byte-for-byte to `roster-server/data/blooket-deck-slices.json` (the server needs it for the
per-day predicate). A test pins identity of the two copies.

`tests/blooket-deck-slices.test.js` (new): for every CSV in the file, parse it with the same rules as
`_bfRowsToDeck` and assert every valid card falls in **exactly one** topic's ranges (a partition);
every topic key is a registry topic whose worksheet maps to that CSV (`roadmap-data.json` +
`csvPathFromWorksheet`); every combined worksheet in `roadmap-data.json` whose CSV has more than
36 valid cards has an entry (today: the four above); `cardsPerDeck === 30`; the vendored copy is
identical. Pin the pool counts in the table above.

## 3. Desk — `ap_stats_roadmap_square_mode.html`

Pure helpers (byte-identical to the engine's, parity-tested, no DOM):

```js
const BLOOKET_DECK_CARDS = 30;
const BLOOKET_RESUME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
function _ftSliceRanges(slices, csvName, topicId)   // → [[lo,hi],…] | null  (slices = parsed file .slices; topicId may be "a+b": use its first key)
function _ftCardsInRanges(cards, ranges)             // → cards whose qnum is inside any range; ranges null → cards; empty result → cards
function _ftDealDeck(cards, max, shuffleFn)          // → shuffleFn(cards.slice()).slice(0, max)
function _ftResumeRemaining(cardStartMs, nowMs, perCardSeconds)  // → null when cardStartMs is null; else max(0, perCardSeconds − floor((nowMs − cardStartMs)/1000))
```

Flow changes:
- `_bfLoadDeckSlices()` — fetch `data/blooket-deck-slices.json` (`cache: 'no-cache'`), cache in a
  module var, `{}` on any failure (mirror `_bfLoadDifficultyTags`).
- `_ftStart(btn, topicId)`:
  1. `csvPath = _bfCsvPath(topicId)`, fetch, `allCards = _bfRowsToDeck(...)` (unchanged).
  2. `ranges = _ftSliceRanges(slices, csvName, topicId)`; `pool = _ftCardsInRanges(allCards, ranges)`;
     `perDay = !!ranges`.
  3. `saved = _ftLoadResume(topicId, csvName)` → if present: restore `round`, `roundId`, `perDay`,
     set `_ftState.resumed = true`, show the resume note and the Start over control, then
     `_ftRenderCard()`; the first render uses `_ftResumeRemaining(saved.cardStartMs, Date.now(), 40)`
     — `0` → `_ftHandle('timeout')` path first (no reveal, re-queue), `null` → full timer.
  4. Else `_ftState.round = _ftCreateRound(_ftDealDeck(pool, BLOOKET_DECK_CARDS, _bfShuffle))`.
  5. `_ftState.csv = csvName; _ftState.perDay = perDay; _ftState.topic = topicId;` header with
     `round.total` cards; `_bfCreditNote(topicId, perDay)`; save.
- `_ftStartTimer(remainingSeconds)` — optional initial remaining (default `BLOOKET_FULLDECK_SECONDS`);
  `_ftState.cardStartMs` must reflect the ORIGINAL start on a resume (the saved value itself — never re-derived from the rounded remaining: that let a close/reopen loop freeze the clock, Codex + verifier finding 11/07)
  so a second close keeps the same wall clock.
- `_ftRenderCard()` — after `_ftStartTimer(...)`, `_ftSaveResume()`.
- `_ftHandle(outcome, choiceIdx)` — after `_ftRecordOutcome(...)`, set `_ftState.cardStartMs = null`
  and `_ftSaveResume()` (so a close inside the 800 ms auto-advance window keeps the outcome).
- `_ftFinish()` — `_ftClearResume(topic)` before the commit; `_blooketCommit(btn, topic, score, perDay)`.
- `_blooketCommit(btn, topic, score, perDay)` → the item id built near lines 12859–12874 (the
  `'BL-' + unit + '-L' + key + '-DESK_DONE'` write in `_studentMarkSave`'s Blooket branch) takes the
  suffix `perDay ? 'DESK_DAY' : 'DESK_DONE'`. Everything else about the commit (best-wins floor
  against the displayed blooket, `/grade` refresh, local best) is unchanged.
- Resume storage: key `'apstats_desk_ft_resume_' + email` → `{ [topic]: { v: 1, csv, perDay, roundId,
  round: { deck, order, status, log, total }, cardStartMs, savedAt } }`. Helpers `_ftResumeKey()`,
  `_ftSaveResume()`, `_ftLoadResume(topic, csv)` (drops entries older than
  `BLOOKET_RESUME_MAX_AGE_MS` or with a different `csv`), `_ftClearResume(topic)`. All wrapped in
  try/catch; all return early in view-as or `__WS_READ_ONLY__` (same guards as `_bfSaveProgress`).
- `_bfCloseUI()` — unchanged (it already nulls `_ftState.round`; it must NOT clear the save).
- Start over: a `s7btn` in `bf-actions`, visible only when `_ftState.resumed`; click →
  `_ftClearResume(topic)` and re-enter `_ftStart(btn, topic)`.
- `_bfCreditNote(topicId, perDay)` — append the sliced-deck sentence when `perDay`.
- `sw.js` — add `'data/blooket-deck-slices.json'` to the precache list next to
  `data/blooket-difficulty.json`.
- Pico home (`pico-home.js`) needs no change — it opens the Desk's own deck window and reads the label.

## 4. Shared engine — `flashcards.js` (root)

Add `DECK_CARDS = 30`, `sliceRanges`, `cardsInRanges`, `dealDeck`, `resumeRemaining`, and extend
`blooketItemId(topicId, perDay)` → suffix `DESK_DAY` when `perDay` is truthy (default unchanged).
Export them. `tests/flashcards-engine.test.js` and `tests/flashcards-surface-parity.test.js` pin the
Desk inline copies byte-for-byte against the engine — add the four new pure functions and the item-id
builder to those lists.

## 5. Phone launcher — `mobile-home.html` (native deck, same engine)

`_fcStart(lesson, 'full')`: fetch the slices file (`cache: 'no-store'`, `{}` on failure) alongside the
CSV; `pool = FC.cardsInRanges(deck, FC.sliceRanges(slices, csvBase, topic))`; resume via
`_fcLoadFullProgress(topic, csvBase)` / `_fcSaveFullProgress()` / `_fcClearFullProgress(topic)`
(key `'apstats_mobile_fc_full_' + email`, same record shape as the Desk's, same wall-clock rule,
14-day expiry); otherwise `round = FC.createRound(FC.dealDeck(pool, FC.DECK_CARDS, FC.shuffle))`;
`_fc.perDay = !!ranges`. Save after each resolve (`_fcResolve`) and each render; `_fcFinish` clears
and commits with `FC.blooketItemId(topic, _fc.perDay)`. `closeFlashcards()` keeps the save. Progress
line shows `<left> left · <total> cards`; a resumed run shows "(resuming)" in the title as quick mode
did. Start over control as on the Desk.

## 6. Server — `roster-server/`

- `data/blooket-deck-slices.json` — vendored copy. Load it in `grade-contexts.js` the way
  `lesson-schedule.json` is loaded (bundled `roster-server/data` → repo `data` fallback → `{}`).
- `grade-config.js` — `export const BLOOKET_PER_DAY_FROM = '2026-11-13';` and
  `export function blooketPerDayFrom(config)` (config key `blooketPerDayFrom` wins when defined;
  `null` disables). Keep it outside `PHASE3_CONFIG` like `QUIZ_RETRY_HALF_CREDIT_FROM`.
- `lesson-grade.js`:
  - item-id parse (line ≈63) and the fold (≈461): `/^BL-U(\d+)-L([\d-]+)-DESK_(DONE|DAY)/`.
    `DESK_DONE` → `acc.blooketFlashcard`; `DESK_DAY` → `acc.blooketFlashcardDay` (new accumulator
    field, same null/blank/clamp guards). Both are per-item "latest wins" like today.
  - `export function perDayDeckGroups({ schedule, deckSlices, section, perDayFrom, config })` → `Set`
    of `unit|worksheetKey` group keys that are per-day (D3): ≥2 topics in the group, the group's
    worksheet CSV (derive with the same `u{u}_l{key}_blooket.csv` rule as `csvPathFromWorksheet` from
    `unit` + `worksheetKey`, e.g. `4|7-8` → `u4_l7_l8_blooket.csv`) has a `deckSlices.slices` entry, and
    the earliest `zeroDate` across the group's topics for `section` is `>= perDayFrom`. `perDayFrom`
    null → empty set.
  - `shareBlooketAcrossWorksheetGroups(byTopic, schedule, ensure, perDayGroups)` — share `game` and
    `flashcard` (DESK_DONE) as today; share `flashcardDay` only for groups NOT in `perDayGroups`.
  - finalize: `blooket = max(non-null of blooketGame, blooketFlashcard, blooketFlashcardDay)`.
  - `computeQuarterV3`: accept `perDayGroups`; `blooketGroupKey(topicKey)` returns `topicKey` when the
    topic's group is in the set **and `isDue(topicKey)`**, else the group key (due loop and late-decks
    loop both use it; a per-day group's not-yet-due days share one slot worth their best score).
  - `computeLessonGrades(..., opts)` takes `opts.perDayGroups` (default: empty set = today).
- `grade.js` (≈328 and ≈445): build `perDayGroups` once per request from the loaded schedule, the
  vendored slices and the student's `section`; pass it to both engines. Mirror in every other caller
  (`class.js`, `transcript.js`, `grade-offline-inputs.js` / the offline `GradeEngine` inputs — ship the
  computed group list, not the file). If a new export is imported across bundled modules, add it to
  the `MODULES` whitelist in `scripts/build-grade-engine.mjs`, then `node scripts/build-grade-engine.mjs`
  and commit `grade-engine.bundle.js` (tests/grade-engine-bundle-parity.test.js pins it).
- `doge-econ.js` and `js/wallet_logic.js`: effort points regex `/^BL-.*-DESK_(DONE|DAY)$/i`.
- Tests (`roster-server/tests/`): extend "combined-worksheet lessons share one flashcard deck"
  (lesson-grade.test.js ≈1269): DESK_DONE still shared; DESK_DAY not shared in a per-day group;
  DESK_DAY shared in a non-per-day group; `max` of the three; `perDayDeckGroups` on a two-section
  schedule (4.3-5 → not per-day, 4.7-8 → per-day, solo 4.6 never, no slices entry never, `null`
  cutoff → empty); `computeQuarterV3` slots: per-day group counts one slot per topic (a student who
  played only 4.7 has 4.8 in `blooketTodo` once due), non-per-day group still one slot; the
  zero-freeze late-decks loop honours the same key. Golden/m2b fixtures: expected unchanged (no
  DESK_DAY rows, no per-day group due) — if a golden moves, stop and explain the diff instead of
  regenerating.

## 7. Root tests to add / re-pin

- `tests/desk-timed-deck.test.js` — it 18 becomes "deals at most 30 from the pool (no top-10 trim)";
  new executed cases for the four pure helpers (sample size, pool ≤ 30 dealt whole, empty-range
  fallback, `resumeRemaining` boundaries 0 / 40 / null); resume journey in jsdom: start → answer 3
  (1 wrong) → close → reopen → same `total`, `order.length`, credits, `roundId`, resume note, Start over
  visible → finish → save cleared and the commit used `DESK_DAY` for a sliced topic / `DESK_DONE` for a
  solo one; wall-clock case: saved `cardStartMs` 50 s ago → front card logged as timeout.
- `tests/desk-blooket-flashcards.test.js` — 30b re-pinned (uses `_ftDealDeck`, no `_bfSelectTop10`);
  header/credit-note/resume copy; guard copy test still excludes "80%".
- `tests/ced2026-desk-labels.test.js` (header stub ≈174) — new header text.
- `tests/flashcards-engine.test.js`, `tests/flashcards-surface-parity.test.js` — new parity entries.
- `tests/mobile-home-flashcards.test.js` — full deck uses the pool + cap; resume after `closeFlashcards`;
  item id `BL-U4-L1-DESK_DAY` when the fixture lesson is sliced (fixture today records
  `BL-U4-L1-2-DESK_DONE` from a combined key — keep that case for an unsliced combined key).
- `tests/journeys/j5-timed-deck.journey.test.js` — still green (fixture ≤ 30 cards; resume save/clear
  runs inside it).
- `tests/feeder-record-contract.property.test.js`, `feeder-bestwins-invariants.property.test.js`,
  `ledger-merge-invariants.property.test.js`, `tests/wallet-logic.test.js` — accept both suffixes.
- `tests/blooket-deck-slices.test.js` — new (§2).
- `tests/desk-flashcards-guard-copy.test.js`, `desk-flashcards-recap.test.js`,
  `desk-flashcards-logging.test.js`, `desk-flashcard-outcome.test.js` — must stay green.

## 8. Gates, ship order, verification

1. `npm run test:quick`; `npx vitest run tests/desk-timed-deck.test.js tests/desk-blooket-flashcards.test.js tests/flashcards-engine.test.js tests/flashcards-surface-parity.test.js tests/mobile-home-flashcards.test.js tests/blooket-deck-slices.test.js tests/journeys/j5-timed-deck.journey.test.js tests/grade-engine-bundle-parity.test.js tests/wallet-logic.test.js tests/ced2026-desk-labels.test.js tests/desk-flashcards-guard-copy.test.js`;
   `cd roster-server && npx vitest run`; `python -m pytest tests/` (unchanged, sanity).
2. `node scripts/build-grade-engine.mjs` (if any engine module changed — it did), `npm run gitnexus:shadow`,
   `node scripts/bump-build.mjs` (+ LF check), GitNexus `detect_changes`, `node .gitnexus/run.cjs analyze`.
3. One commit, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; `touch .git/PUSH_APPROVED`;
   push (weekend: no B/E block). GH Pages + Railway deploy together.
4. Live: Desk build stamp; `/health` commit; **diff `/class/grades` for both sections against the
   pre-deploy snapshot — every Q1 and Q2 number identical**; open a sliced topic's deck as a test
   student (header shows ≤ 30 cards), close mid-run, reopen → resumed.

## 9. Blast radius (GitNexus, 2026-11-07)

`computeLessonGrades` — **HIGH** (1 direct caller `grade.js`; 15 impacted; process `mountTranscript`
in `transcript.js`; modules Roster-server, Tools, Tests). `shareBlooketAcrossWorksheetGroups` — LOW
(only `computeLessonGrades`). Desk inline functions are not indexed by name; by grep: `_ftStart` ←
`openBlooketFlashcards` ← `studentMark` (resource panel), `_flashcardsFromLauncher`,
`_zeroOpenFlashcards` (missing-work rows); `_bfCloseUI` ← `closeBlooketFlashcards`, the outcome
screen. `_fcStart` (mobile) — LOW. Implementers run `impact` again on anything else they touch.

## 10. Known limits

- A client still running the pre-deploy Desk (service worker cache) can finish a full-deck run after
  the deploy; it records `DESK_DONE` and is shared across the group — never less than before.
- Resume is per device. The 4.12 slice is dormant (geometric is not in CED-2026).
- The three small combined decks (3.6-7, 5.1-2, 6.1-2) are not sliced: one 30-card sample a run, one
  score per worksheet group, as today.
- `BLOOKET_PER_DAY_FROM` is a date on zero dates, not a deploy instant — flipping it later changes
  which groups are per-day; moving it earlier would turn Q1 groups per-day and must not be done
  before the Q1 close.

## 11. As built — accepted deviations (2026-11-07, Opus implementation lanes)

- **Slot rule** (D3, §6): a per-day topic is its own Blooket-track slot only once it is due; the group's
  not-yet-due days share one slot worth their best score. Reason: the literal rule double-counted an
  early full-deck or game score on 4.7-8 / 4.10-12 and changed 1,152 of 1,260 random pre-due ledgers;
  the acceptance property (no DESK_DAY rows, no per-day day due → identical to today's engine) is now a
  400-ledger property test in `roster-server/tests/lesson-grade.test.js`.
- **`perDay` on the Desk and mobile** = "a slice was dealt" (the pool is smaller than the CSV), not
  `!!ranges`. Identical for every real slices entry; a range that matches no card falls back to the
  whole deck and records `DESK_DONE`.
- **Fifth shared pure helper** `_ftSavedRoundOk` / `Flashcards.savedRoundOk` validates a saved round's
  shape so a broken save can never crash a deck; pinned in the parity tests. `resumeRemaining` returns
  `null` for a non-finite `cardStartMs` and the full 40 s when the device clock went backwards.
- **Server wiring:** `grade.js` exports `resolvePerDayGroups(opts, schedule, section, config)`
  (offline `opts.perDayGroups` wins over `opts.deckSlices`); callers pass `deckSlices`, loaded by
  `grade-contexts.js` `loadDeckSlicesWithPriority()` (vendored `roster-server/data/`, then repo `data/`,
  then `{}`); `server.js` adds `deckSlices` to the production bundle only when one is explicitly
  supplied (same pattern as `eventSchedule`), so fixtures and goldens keep one score per worksheet.
  Also threaded through `teacher.js` and `review.js`. The per-day predicate uses the raw
  `lessonZeroDate` (class day + `dueLagDays`), never the frozen-out `null` that `/grade` reports.
- **`donow.js`** treats `BL-…-DESK_DAY` like `DESK_DONE` for self-done artifacts (the day greys on the
  student's other devices). **`receipts.js`** provenance regex widened to `DESK_(DONE|DAY)`.
- **Desk `_phase2ReDeriveGrade`** passes `perDayGroups: inputs.perDayGroups || null` to the offline
  engine (`/grade/offline-inputs` ships the computed list).
- **Mobile:** `_fcStart` deals nothing when the sheet was closed before the deck loaded; with an older
  cached `flashcards.js` (service worker, first load after a deploy) the full deck falls back to the
  old whole-deck deal and records `DESK_DONE`.
- **Open for the teacher (unchanged on purpose):** Schoology group columns
  (`tools/schoology_components.py`), the in-app gradebook cell and the class snapshot still show ONE
  Blooket value per worksheet group (the first lesson's / first non-null day). From the first per-day
  zero date (first zeroing syncs: E 4.7-8 on 11/23, E 4.10-12 on 11/27, B 4.10-12 on 11/30; B's 4.7-8
  column never zeroes because B's 4.7 is a never-zero Q1 lesson) a student who played only Day 2
  would show a 0 in the Schoology group column while the Desk shows Day 2's score. Decide before the
  11/23 Period E sync: per-day columns, the best non-null day before applying any zero, or
  the mean of the days with missing-but-due = 0 (matches the Blooket track). `transcript.js`
  `artifactHash` does not bind the slices file (binding it would move the m2b art-hash fixture).

## 12. Review fixes folded 2026-11-07 (Codex gpt-6-astra at ultra effort + three Opus verifiers)

- **Resume clock (HIGH, both surfaces):** the timers rebuilt the card's start from the floored "seconds
  left", so every reopen forgave up to 0.999 s and a close/reopen loop never advanced the clock. Fixed as
  in §1 D4 / §3: the saved `cardStartMs` is kept exactly, the deadline is wall-clock, a late answer is a
  timeout. Pinned by 60-cycle reopen tests on the Desk and the phone.
- **Commit gate (HIGH):** the client floored a run against the topic's displayed max, which can come from a
  DIFFERENT item id (a DESK_DAY 100 on 4.7 blocked a whole-deck DESK_DONE 90 that would have credited 4.8).
  The ledger's durable "a lower score never replaces a higher one" floor covered only `frq` and
  `quiz_review`; it now also covers `worksheet` rows whose item id is `BL-U…-L…-DESK_(DONE|DAY)`
  (`roster-server/ledger.js`). The Desk and the phone therefore always send the finished run's row; the
  floor gates only the local mark/tint write and the "new best" copy.
- **Plus-topic launches (MEDIUM):** a `4.7+4.8` id produced `BL-U?-…`, which the engine ignores (an old
  hole). The timed run now normalises to its first key (the slice it deals); both item-id builders do too.
- **Re-entry (LOW):** `_ftStart` / `_fcStart` ignore a second call while a deck is loading (a double click
  used to show a brand-new deck as "resuming"). On the Desk a start still loading after 15 s
  (`BLOOKET_START_STALE_MS`) stops blocking, so a stalled fetch never wedges the launcher.
- **Phone copy:** the synced `/grade` map is bumped only for its owner (`_gradeOwner`), so a shared phone
  never tells a student a higher score is recorded when it is another student's; the kept-your-best notes
  say "this run didn't beat it" (true for a tie as well as a lower run).
- **Slices fetch failure (LOW):** a failed fetch is no longer cached for the session; the next open retries.
- **Pre-existing copy (gates lane):** the Blooket score chip tooltip said "passing" / "below the 80% gate";
  reworded with no pass mark (CLAUDE.md rule), guard test added.
- **Flaky gate (LOW):** `tests/desk-why-so-low.test.js` uses the win32 `budget()` scaling for its timeout.
- Grading verdict PASS: old vs new engine identical on 1,396 lesson maps and 43,528 quarter cases without
  DESK_DAY rows (differences only in the spec'd per-day slots once due, none before 11/23); DESK_DAY
  semantics verified on 14,400 random cases; offline bundle = server on 280/280.

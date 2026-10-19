# APStat Park calculator: fluency (spec)

Status: approved 2026-10-12 (teacher: rungs follow the student; 2 s). Being built overnight: Opus 5.5 implements,
Codex (gpt-6-astra) reviews, then commit + push (client first, then relay).

Teacher's brief (2026-10-11/12): the mouse-click game with the 15 s step clock is right and stays. What the
game lacks is any way to find out whether a student *knows* the route: the hint is always on, the data never
changes, the team only "all finishes". Chosen from the brainstorm: fading hints (1), random data (2), a
navigator round (3), a visible cost for a wrong key (5) — but never for a different route to the same place.
Rejected: teammate screens (6, clutter), lifts/keyboard scaffolding, touching the 15 s.

## 0. What exists

- `calculator-catalog.mjs`: 32 skills, 87 problems; each has `route` (7–37 keys), `hints` (one per key,
  almost all `Choose KEY.`), `values` (its data), `computed` (its results), `finalView`.
- `calculator-engine.mjs` `transitions(state)`: replays the real calculator for every key and accepts any key
  whose screen fingerprint matches a *later* checkpoint of the route. Shortcuts (ZOOM instead of DOWN DOWN
  ZOOM, digit instead of arrows + ENTER) are already accepted, on the relay and the client alike.
- The relay (`curriculum_render/railway-server/apstat-park/calculator-service.mjs`) owns the clock
  (`startedAt`, `timeLimitFor`), picks the problem (`createLevelRotation`), judges every press
  (`pressMissionKey`) and sends `hintKeys` after a time-up. Each member solves alone; results must match.
- Shared modules (`calculator-mission.mjs`, `calculator-curriculum.mjs`, `calculator-catalog.mjs`,
  `calculator-engine.mjs`, `calculator-lobby.mjs`) are byte-identical with the relay copy; `CALCULATOR_PROTOCOL = 9`.

## 1. Fading hints (client + catalogue content)

**Rungs.** Per student, per skill, **following the student** (teacher 2026-10-12): the relay counts clears and
keeps them in Supabase next to the campaign wallet (`park_calc_clears`, migration `0008`, TEACHER-RUN; the relay
keeps a memory-only count until the table exists, exactly like `park_campaign_wallet`). The round state tells
each member their own `clears` and `rung` for the current skill:

| rung | when | the hint line shows |
|---|---|---|
| 0 | never cleared | as today: `Press LIST (2ND STAT).` |
| 1 | cleared once | the **goal** only: `Open the LIST menu.` |
| 2 | cleared twice or more | nothing — the calculator screen is the hint, as on test day |

- A wrong key (§5's definition) drops the *current step* one rung for the rest of that step; a time-up (the
  relay's `hintKeys`) shows the full hint, as today. Nobody is stranded.
- A small tag on the status column says which rung is on: `FULL HELP` / `GOALS ONLY` / `ON YOUR OWN`
  (reworded 2026-10-18 from `HINTS: FULL` / `HINTS: GOALS` / `NO HINTS`; the teacher read "HINTS: FULL" as a bug), so
  students know why the hint changed. The screen-reader status line carries the same.
- Clears are counted by the relay when the team's round is `complete` (same moment as the key), once per
  student per round, for that round's `skillId`.
- **Content: goal hints.** Each route step gets a goal phrase (`goals[]`, parallel to `route`), written at the
  level of what the step achieves: `Open STAT PLOT (2ND Y=)` → `Turn Plot1 On` → `Pick the modified boxplot`
  → `ZoomStat (ZOOM 9)` → `TRACE across the plot`. Consecutive keys with the same goal share the phrase, so a
  student at rung 1 sees "Pick the modified boxplot" for all three RIGHT presses and reads the screen for the
  rest. I generate a first pass for all 87 problems from the routes and the engine's screens; **the teacher
  reviews the goals file** (one markdown table per skill) before it ships. `hints[]` stays for rung 0.


## 2. Random data (relay + client, protocol 10)

- The relay generates the problem's `values` per round from the problem's own shape (same list length,
  same kind of numbers — integers in the same range, the same number of decimals, the same n/p/x for
  binomials, sample sizes and counts in the same ranges) and sends them in the round state. The client
  initialises its calculator from the round's values, not the catalogue's.
- `computed` is no longer trusted from the catalogue: the relay replays the native engine on the round's
  values and reads the results off the result screen (it already fingerprints every screen; this reads the
  values). The challenge's answer tiles and the interpretation questions are built from those results.
- Only **list-based** problems vary: those whose data lives in `setup.lists` (and `setup.matrices`) and whose
  route never types a number — 1-Var Stats, modified boxplot, histogram, dot plot, scatterplot, LinReg(a+bx),
  residual plot, T-Test / TInterval (data input), LinRegTTest/TInt. Problems that type their numbers through
  the route (normalcdf, binompdf, the stats-input tests…) and scenario-text problems (interpretation,
  random assignment) play exactly as today; varying them means route templating, a later spec.
- Variation lives in `calculator-variation.mjs` (shared, mirrored), keyed by `skillId`: the generator keeps
  the list length, integer-ness/decimals and range of the catalogue's values, and for LinReg keeps a real
  linear relationship with noise so the fit is meaningful. The relay replays the native engine on the new
  lists and reads the results off the engine (`computed` + `finalView` rebuilt), then sends the round's
  `problem` override; `challengeFor` works from that.
- Protocol 10 (one bump for §1, §2 and §5 together) — **AS BUILT on the relay (2026-10-12)**:
  `CALCULATOR_PROTOCOL = 10` (both trees). `calculator_state` (per member) gains:
  - `clears: int` — this member's completed rounds for the round's `skillId` (Supabase `park_calc_clears`,
    memory-only until migration 0008 runs). Counted at the key-award moment, so the packet that first
    says `complete: true` already includes the just-finished round.
  - `rung: 0 | 1 | 2` — `Math.min(2, clears)`.
  - `problem: null | { values, setup, computed, finalView, stem }` — part of the mission state (it rides in
    via `...state`, like `step`). Same shapes as the catalogue problem; `stem` is rewritten with the new
    numbers when the catalogue stem quoted the lists. **Client: call `missionFor(state)` (shared
    `calculator-mission.mjs`)** — it already returns the catalogue level merged with `state.problem` plus
    `varied: true`; pass that level to `initializeCalculator`, `challengeFor`, `tilesFor`, `answerTiles`.
    (`tilesFor`/`answerTiles` stop using the fixed one-var-stats tiles `[14,4,20,7,11]` when `varied`.)
  - `lastPress` on a wrong key: `{ key, advanced: false, wrong: true, penaltyMs: 2000 | 0 }`
    (`0` = within 2 s of the last charge, nothing taken). Every other press keeps the old shape
    `{ key, advanced }` (no `wrong` field). `lastPenaltyAt` (relay time of the last charge, or null) also
    rides along in the state; `startedAt` is already shortened by the 2 s.
  - Wrong = `engine.isWrongKey(state, key)` (shared `calculator-engine.mjs`): the key changes the screen,
    is not a forward transition, does not return to a checkpoint already reached or to an empty home
    screen (compared by what is visible, so plot settings stored by ZOOM or a stored result never block
    recovery), and is not only a 2ND/ALPHA modifier. On top of that, `pressMissionKey` never
    charges `NEVER_WRONG` = UP, DOWN, LEFT, RIGHT, 2ND, ALPHA, CLEAR (shared `calculator-mission.mjs`): the routes
    were shortened to shortcuts, so the old long way (DOWN DOWN, scrolling a menu) stays free. Only keys
    that do something (open a menu, type a digit, run a function) can be wrong.
    `pressMissionKey`/`advanceMission` take the judgment as an optional 5th argument `isWrong(key)`;
    without it nothing is ever wrong (the client never needs it).
  Varied this way: one-var-stats (+@1), modified-boxplot (+@1), histogram (+@1), scatterplot (+@1),
  linreg-a-plus-bx (+@1), residual-plot (+@1), t-test-data (+@1), t-interval-data (+@1), linreg-ttest@1/@2,
  linreg-tint (+@1). Not varied: every interpretation problem, `linreg-ttest` (stem quotes b and SE_b),
  both `dotplot` problems (their stems quote a different dataset than their lists — a catalogue fix), and
  everything that types its numbers. An older client is told to reload, as always.
- Tests: for every opted-in problem, 20 generated rounds replay on the engine and produce a result screen
  with every expected statistic present and finite.

## 3. The navigator round (client only)

Every third round (deterministic from the relay's round epoch, so all clients agree) is a navigator round:

- Each teammate holds the hints for a share of the steps: step `k` belongs to `roster[k % n]`. Your panel shows
  a card `YOU ARE THE NAVIGATOR FOR STEPS 2, 5, 8` with those steps' goal phrases; for every other step your
  hint line says `ASK YOUR TEAM` and the keypad is unchanged.
- The relay rule is unchanged: everyone still clicks their own route, results must still match. The round
  is only about who knows what. Rungs (§1) are ignored in a navigator round; it is its own mode.
- Solo (roster of one) and the teacher-only roster: never a navigator round.
- The status column names the round (`NAVIGATOR ROUND · TALK`) and the screen reader announces it.

## 5. A wrong key costs time (relay + client, with §2's protocol bump)

- **Wrong key** = the engine's definition: the press changes the screen, matches no checkpoint ahead of the
  current step **and** matches no earlier checkpoint (returning to one is recovery and free). Shortcuts and
  equivalent keys are, by construction, never wrong. A key that does nothing (the screen does not change) is
  ignored, as today.
- Cost: 2 s off the current step's clock (`startedAt -= 2000` on the relay, which owns the clock), at most
  once per 2 s so a panic burst cannot drain the round. The 15 s limit itself is untouched.
- Shown: the cap shakes for ~200 ms, a red `-2s` floats off it, the status line says
  `WRONG KEY · -2S · CLEAR BACKS OUT`. The relay's `lastPress` gains `wrong: true` for the client to key off.
- Guard: a route audit script (`scripts/audit-calculator-routes.mjs`) replays every problem and lists, per
  step, the shortcut keys the engine accepts and any step where a written route takes ≥2 more keys than the
  engine's shortest path. Those routes are rewritten to the short path (and their hints/goals) before §5
  ships, so a hint never sends a student the long way and then charges them for the short one.

## Order of work

1. §1 fading hints — client + the goals file for review. Shown live, alone.
2. §5 wrong-key cost + §2 random data — one relay push (protocol 10), client first then relay. Shown live.
3. §3 navigator round — client only.

Each step is its own Desk push (bump-build), shown on the public URL before the next starts.

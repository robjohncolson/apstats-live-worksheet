# Live Classroom V7 Pico Parity -- master spec

Session 118 (2026-05-26). Author: CC. Status: DRAFT (awaiting user "go").

The user has selected **Tier 3 Pico parity** for deepening the 79
non-U1.1 levels in `cr/railway-server/activities/`. This file is the
master plan covering:

1. Pico-mechanic actor palette and the AP-Stats topic mapping.
2. Engine sprint order (V7.7 ... V7.12, six sprints across cr + fa).
3. Per-unit mechanic assignment for the 79 authoring tasks.
4. Hard constraints carried forward from the V7 .. V7.6.1 arc.

Reference source: `C:/Users/rober/Downloads/Projects/hermes/old-app/recovered/lua_sources/`
-- 104 carved Lua stage scripts from decompiled Pico Park
(`pico_park64_dx9.pdb`). The mechanic palette below mirrors the actor
types Pico Park uses (`Coin` + `CoinObserver`, `Switch` + `Block`,
`WeightedLift`, `Watch`, `Seesaw`, etc.) and matches the V7.1
"candidates" list in `LEVEL_DESIGN_RECIPE.md`.

Canonical depth baseline: `cr/railway-server/activities/U1.1.json`
(V7.5 / V7.6 -- 4 stages, multi-doorway voting, hidden SipStations,
Key + Goal). Every other level reaches this depth or deeper.

## 1. Mechanic palette -- 6 new actors

Each new actor is a single bounded engine change (cr level-engine.js
+ classroom.js wrapper + fa classroom-board.js sprite/UI). All
actors integrate with the existing V7.5 phase machine (SIPPING ->
VOTING -> REFLECTION -> KEY_HUNT -> GOAL_AVAILABLE -> LEVEL_CLEARED).

| Actor | Pico source | What it does | Phase it lives in | AP topic style fit |
|---|---|---|---|---|
| `Tally` | `CoinObserver` | Singleton meta-entity. Reads `state.coins[]` and `state.tally`. Renders a live count panel; gates `state.key.spawned` on a `threshold` rule (e.g. `tally['A'] >= 3`). | SIPPING/VOTING | U1.2, U1.7, U2.1, U5.1 -- "count what category each cup is" |
| `Watch` | `Watch` | Singleton HUD timer. Counts down a per-stage `duration_s` window. On expiry: VOTING auto-closes with current tally; engine emits `state.sideEffects.timeoutAt = stage_idx`. | VOTING | U6.4 setting up sig tests under time pressure; U7.6 means-test timing |
| `WeightedLift` | `WeightedLift` | A vertical platform sprite whose Y depends on `n_players_on_it`. When `n >= threshold`, lift reaches Goal-column Y and Goal becomes reachable. Pure visual gating (does not replace Key/Goal logic). | KEY_HUNT/GOAL | U3.2 random samples, U5.3 CLT (more samples = lift lifts further) |
| `Seesaw` | `Seesaw` | Horizontal balance beam centered at `pivot_x`. Tilts by `sum(player_x - pivot_x)`. Player positions on the beam mean the visible tilt shows the mean of player x. Targets a `balance_target` angle to unlock Key. | KEY_HUNT | U1.7 mean/median; U1.8 measures of variability; U4.10 / U4.12 expected value intuition |
| `Switch` + `Block` | `Puzzle` + `Block` | Local sub-puzzle: N `Block` sprites with `userData` codes are pushed/swapped by player X-position. When the row's userData sequence matches `target_sequence[]`, Switch flips and Key spawns. | KEY_HUNT | U1.4 representing data (order chart parts); U3.3 / U3.6 sampling design ordering |
| `TrafficLight` + `Bound` | `TrafficLight`, `Bound` | (a) `TrafficLight` flips RED/GREEN on a cycle; moving on RED triggers a setback. (b) `Bound` leashes two players: if `|p1.x - p2.x| > leash_px`, both freeze briefly. | SIPPING | U2.3 bivariate / correlation (leash = correlation strength); U4.4 conditional prob; U6.3 / U6.7 sampling timing |

### Existing actors that stay unchanged

`Text`, `SipStation`, `PlayerSpawn`, `TallyDisplay`, `QuestionDoor`,
`Goal`, `Key`, `ReturnWarp`, `CoinSprite`, `GoalSprite`, `KeySprite`
(client-side sprites for Coin/Goal/Key).

V7.5's `stages[]` shape stays as the per-level structure -- the new
mechanics ride INSIDE stages where appropriate (e.g., a `Watch`
applies to a single stage's VOTING window; a `Seesaw` is a KEY_HUNT
gate inside one stage; a `Switch` puzzle is a stage-terminal gate).

## 2. Engine sprint order (V7.7 .. V7.12)

Each sprint is a full V4-style cycle: spec freeze (BUILD .md) ->
parallel agent dispatch (CC engine + Sonnet client + Sonnet JSON +
Sonnet tests) -> Codex review via cross-agent.py -> fold findings ->
commit + push. Each sprint targets ONE new actor type; the level
designer JSON schema gains exactly one new actor stanza per sprint.

| Sprint | Actor(s) | Engine surface (cr) | Client surface (fa) | Sessions est. |
|---|---|---|---|---|
| **V7.7** | `Tally` | `level-engine.js` adds `tally` state + threshold check; `applyInput {kind:'collect'}` updates tally; key spawn gate adds `tally meets threshold` rule. | `classroom-board.js` adds `TallySprite` (HUD panel with live counts + threshold progress bar). | 1 |
| **V7.8** | `Watch` | `level-engine.js` adds per-stage `duration_s`; `activityTick` decrements; on 0 auto-transition VOTING -> REFLECTION with current tally; `state.sideEffects.timeoutAt` emitted. | `classroom-board.js` adds `WatchSprite` (zIndex 18 HUD timer); flash on <10 s remaining. | 1 |
| **V7.9** | `WeightedLift` | `level-engine.js` adds `lift` state (Y position = f(players_on_x_band)); Goal accessibility gated by `lift.y <= lift.target_y`. | `classroom-board.js` adds `WeightedLiftSprite` (vertical platform; Y interpolated); Goal reachability halo. | 1 |
| **V7.10** | `Seesaw` | `level-engine.js` adds `seesaw` state (tilt = f(sum(players_x - pivot_x))); Key gate on `|tilt| <= balance_target_deg`. | `classroom-board.js` adds `SeesawSprite` (rotating beam); KeySprite spawn animation when balanced. | 1 |
| **V7.11** | `Switch` + `Block` | `level-engine.js` adds `puzzle` sub-state (Block userData[] sequence; Switch fires when sequence matches `target_sequence[]`). `applyInput {kind:'push-block', blockId, direction}`. | `classroom-board.js` adds `BlockSprite` (pushable) + `SwitchSprite` (toggled by player overlap on a switch tile). | 2 (more engine logic) |
| **V7.12** | `TrafficLight` + `Bound` | `level-engine.js` adds (a) `trafficLight` state with `phase: 'red'|'green'` cycling on `cycle_s`; on-RED player movement records to `state.violations`. (b) `bound` state with `leash_px`; over-leash triggers `state.frozen[]`. | `classroom-board.js` adds `TrafficLightSprite` (HUD top-right) + `BoundLineSprite` (line between leashed players). | 1 |

Total estimate: **7 sessions** for engine sprints + **2-3 sessions**
for level authoring fan-out = **~10 sessions** for full Tier 3.

Per session: each sprint follows the proven loop (BUILD freeze ->
parallel dispatch -> Codex review -> fold -> commit + push) with full
test coverage. Existing 246 cr + 363 fa subset tests remain green;
each sprint adds ~10-25 new tests.

## 3. Per-unit mechanic assignment (79 levels)

Each level is assigned ONE primary mechanic from the palette (or
"plain" = V7.5 shape with no new actor). Assignment is by pedagogical
fit -- if the AP topic teaches "count what kind", it gets `Tally`;
if it teaches "samples accumulate", it gets `WeightedLift`; if it
teaches "balance/center", it gets `Seesaw`; etc.

Authoring still produces `stages[]` with multi-doorway QuestionDoors
(matching U1.1's V7.5 depth) -- the new actor is the KEY_HUNT or
SIPPING-phase mechanic that LIVES INSIDE the stage flow.

### Unit 1 -- Exploring 1-variable data

| Level | Topic (short) | Mechanic | Notes |
|---|---|---|---|
| 1.1 | Cola Mystery | (already V7.6 -- baseline) | -- |
| 1.2 | Variable / Indiv | `Tally` | Cups labeled W=word/N=number, tally each category, gate key |
| 1.3 | Categorical Display | `Tally` | Bar/pie variants as collect-targets |
| 1.4 | Representing Data | `Switch` + `Block` | Re-order chart parts into correct freq-table order |
| 1.5 | Describing Distrib | `Seesaw` | Players stand on number line; seesaw tilt = sample mean |
| 1.6 | Numerical Summary | `Seesaw` | Same as 1.5 but with explicit median marker |
| 1.7 | Mean & Median | `Seesaw` | The canonical seesaw mechanic level |
| 1.8 | Measures of Variability | `Seesaw` + `Tally` | Combined: tilt + spread |
| 1.9 | Boxplots | `Switch` + `Block` | 5 blocks (min, Q1, med, Q3, max) -- order them |
| 1.10 | Outliers | `Tally` | Coin labeled (in, low_out, high_out) -- tally each |

### Unit 2 -- Exploring 2-variable data

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 2.1 | Two Variables | `Tally` | Pairs of cups (x_value, y_value) |
| 2.2 | Scatter Plots | `WeightedLift` | Each (x,y) is a player position; lift to plot |
| 2.3 | Correlation | `Bound` | Two players leashed; leash length = 1 - |r|. Wide leash = weak correlation |
| 2.4 | Linear Reg | `WeightedLift` | Fit line position responds to player x-positions |
| 2.5 | Residuals | `Tally` + `Watch` | Time-pressured residual sign call |
| 2.6 | Squared Residuals | `Switch` + `Block` | Move blocks to minimize sum-of-squares |
| 2.7 | Influential Pts | `WeightedLift` | One "leverage" player position shifts the lift dramatically |
| 2.8 | Categorical Bivariate | `Tally` | 2-D contingency tally (count per cell) |
| 2.9 | Stratified Analysis | `Switch` + `Block` | Order strata by metric |

### Unit 3 -- Sampling

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 3.1 | Intro Planning | plain V7.5 | -- |
| 3.2 | Random Samples | `WeightedLift` | N players on the sampling platform = lift height |
| 3.3 | Sampling Strategies | `Switch` + `Block` | Pick the right strategy order (SRS / strat / cluster / systematic) |
| 3.4 | Bias | `Tally` + `TrafficLight` | "Bias" = TrafficLight phase distorts collect timing |
| 3.5 | Experimental Design | `Switch` + `Block` | Order: random assign / blind / replicate |
| 3.6 | Confounding | `Bound` | Two "lurking" players leashed to the treatment |
| 3.7 | Generalization | plain V7.5 | Conceptual; voting depth suffices |

### Unit 4 -- Probability

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 4.1 | Random Patterns | `Tally` + `Watch` | Speeded random-trial tally |
| 4.2 | Simulation | `Tally` | Many trials, see frequency stabilize |
| 4.3 | Intro Prob | `Tally` | -- |
| 4.4 | Conditional Prob | `TrafficLight` | RED = condition fails; collect only on GREEN |
| 4.5 | Independence | `Bound` + `Tally` | Leash forces dependence; release to see independence |
| 4.6 | Addition Rule | `Tally` | Combined-category coin counts |
| 4.7 | Random Variables | `Tally` + `Seesaw` | Expected value = seesaw balance |
| 4.8 | Probability Distributions | `Seesaw` | E[X] visualization |
| 4.9 | Discrete RV | `Seesaw` + `Tally` | Same |
| 4.10 | Geometric | `Watch` + `Tally` | "Trials until first success" |
| 4.11 | Binomial | `Tally` + `Switch` + `Block` | Order outcome blocks by count |
| 4.12 | Expected Value calc | `Seesaw` | Canonical |

### Unit 5 -- Sampling Distributions

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 5.1 | Sampling Variability | `WeightedLift` + `Tally` | Each sample = a coin; tally many samples |
| 5.2 | Normal Distrib Revisit | `Seesaw` | Center / spread visualization |
| 5.3 | CLT | `WeightedLift` | The MOST canonical lift mechanic -- more samples lift the platform higher AND tighter |
| 5.4 | Bias / Variability | `WeightedLift` + `Seesaw` | -- |
| 5.5 | Diff of p-hats | `WeightedLift` x 2 | Two side-by-side lifts |
| 5.6 | Sampling Distr for p | `WeightedLift` | -- |
| 5.7 | Sampling Distr for sum | `Seesaw` | -- |
| 5.8 | Diff of x-bars | `WeightedLift` x 2 | -- |

### Unit 6 -- Inference (proportions)

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 6.1 | Why Be Normal | plain V7.5 | Conceptual setup |
| 6.2 | Constructing CI for p | `WeightedLift` + `Watch` | Build the interval before timer expires |
| 6.3 | Justifying claim with CI | `Switch` + `Block` | Match interval to claim |
| 6.4 | Setting Up a Test | `Watch` | Speeded test-setup |
| 6.5 | Carrying Out Test | `WeightedLift` | Lift = sample evidence |
| 6.6 | Concluding Test | `Switch` + `Block` | Order conclusion steps |
| 6.7 | Type I / II Error | `TrafficLight` | RED = wrong decision; GREEN = correct |
| 6.8 | Test for diff of 2 p | `WeightedLift` x 2 | -- |
| 6.9 | CI for diff of 2 p | `WeightedLift` x 2 | -- |
| 6.10 | Justifying Test result | `Switch` + `Block` | -- |
| 6.11 | Putting it Together | `Watch` + `Switch` + `Block` | Composite challenge |

### Unit 7 -- Inference (means)

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 7.1 | Intro for Means | plain V7.5 | -- |
| 7.2 | CI for one mean | `WeightedLift` | -- |
| 7.3 | Justifying CI for mean | `Switch` + `Block` | -- |
| 7.4 | Setting Test for mean | `Watch` | -- |
| 7.5 | Carrying Out Test for mean | `WeightedLift` | -- |
| 7.6 | Concluding Test for mean | `Switch` + `Block` | -- |
| 7.7 | Test for diff of 2 means | `WeightedLift` x 2 | -- |
| 7.8 | CI for diff of 2 means | `WeightedLift` x 2 | -- |
| 7.9 | Test for diff of paired means | `WeightedLift` + `Bound` | Pairs are bound |
| 7.10 | Putting it Together | `Watch` + `Switch` + `Block` | -- |

### Unit 8 -- Chi-square

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 8.1 | Intro: Are Results Unexpected | `Tally` + `Watch` | -- |
| 8.2 | Chi-sq Distrib + GOF Setup | `Switch` + `Block` | -- |
| 8.3 | Carrying Out GOF | `Tally` + `WeightedLift` | -- |
| 8.4 | Test for Homogeneity | `Tally` (2-D) + `Switch` | -- |
| 8.5 | Test for Independence | `Bound` + `Tally` | -- |
| 8.6 | Putting it Together | `Switch` + `Block` | -- |
| 8.7 | Composite Drill | `Watch` + `Switch` + `Block` | -- |

### Unit 9 -- Slopes (LSRL)

| Level | Topic | Mechanic | Notes |
|---|---|---|---|
| 9.1 | Confidence Interval for Slope | `WeightedLift` | -- |
| 9.2 | Setting Test for Slope | `Watch` | -- |
| 9.3 | Carrying Out Test for Slope | `WeightedLift` | -- |
| 9.4 | Concluding Test for Slope | `Switch` + `Block` | -- |
| 9.5 | Putting it Together | `Watch` + `Switch` + `Block` | -- |
| 9.6 | Composite Drill | composite | -- |

Mechanic distribution: 21 plain/Tally, 17 WeightedLift, 14 Seesaw,
15 Switch+Block, 6 Watch, 5 TrafficLight, 5 Bound (counts include
composite levels where a level uses 2 mechanics).

## 4. Hard constraints (carry-forward)

- LC features are **ADDITIVE OVERLAYS** -- never replace the avatar /
  doorway / arrow-key scene. (`feedback_lc_additive_overlay.md`.)
- Levels live in `cr/railway-server/activities/<key>.json`. Railway
  deploys `railway-server/` as project root.
- `chipSize: 10`, `map.width <= 32`, `map.height <= 8`, actor `x` in
  `[0, 32)`, `y` in `[0, 8)`.
- Activity overlay canvas is ABOVE the avatar canvas in DOM order --
  full-overlay paints occlude sprite-engine entities. Use sprite
  engine entities (zIndex) for HUD displays (V7.6.1 lesson).
- Per-member `canvasW` rides `classroom_pos`; the server rescales
  player x into level coord space (V5 fix). Any new actor that reads
  player positions MUST use the rescaled coord.
- `curriculum_render/data/curriculum.js` is **SACRED** -- never edit.
  (`feedback_curriculum_render_sacred.md`.)
- ASCII-only in cross-agent prompts AND in level JSON / test files
  (s112/s113 lesson; the box-drawing chars + section-sign mojibake
  cost a Wave A roll-back in s113).
- LF line endings on new files (`/cr/` + new `/fa/` files; older
  U1-U3 / U8-U9 worksheets stay CRLF -- EOL-preserve).
- PowerShell 5.1: never `git commit -m` from PS; use `git commit -F-`
  with a Bash-tool heredoc.
- Stage own paths explicitly with `git add <path>`, never `-A`.
- Codex review is unreliable on diffs > ~35 KB (V7.5 + V7.6 both
  timed out at 280 s). Keep sprint diffs bounded; fall back to CC
  self-review of documented risk areas when needed.
- Edge CDP rig MUST pass `--remote-allow-origins=*` (Chromium 144+
  rejects WS handshakes from non-allowlisted origins).
- Never kill Edge from bash via `taskkill /F ...`; use PowerShell:
  `Get-Process msedge | Stop-Process -Force`.

## 5. Sprint 1 = V7.7 (start here)

See `LIVE_CLASSROOM_V7_7_BUILD.md` for the frozen contract once
written. Scope:

- One new actor type: `Tally`.
- Engine: `level-engine.js` adds threshold-gated Key spawn.
- Client: `classroom-board.js` adds `TallySprite` HUD.
- JSON schema: `actors[]` allows `{type:'Tally', x, y, threshold:{...}}`
  + `SipStation` already carries `drink` (no JSON change for tally
  source).
- One pilot level: rewrite U1.2 to use Tally. Authoring of the
  remaining 78 levels happens in the post-engine fan-out batch.
- Codex review per the loop; fold inline.

## 6. Open questions (defer until V7.7 ships)

1. Per-level `min_students` -- some Pico mechanics (Bound, paired
   tests in U7.9 / U8.5) genuinely need >= 2 players; the engine
   currently auto-fires success on solo. Should V7.12's `Bound` raise
   `min_students` to 2 by default for any level that includes it?
2. Authoring fan-out cadence -- ship engine sprints in series and
   author levels in series after, OR author levels for already-shipped
   mechanics in parallel with the next engine sprint? The former is
   simpler; the latter is faster.
3. Test deployment cadence -- the existing 80 levels are live in
   PeriodX; adding Tally to U1.2 will need a one-off teacher test
   before bulk authoring. Probably worth pausing after V7.7 ships
   for a single-level smoke before V7.8.

## 7. Rollback / backout

Each sprint is a single commit on cr and a single commit on fa. If
any sprint regresses live behavior, revert the cr commit only --
the engine falls back to the previous mechanic palette and the new
JSON actor type is treated as a no-op. The fa client gracefully
handles unknown actor types in `_classifyActor` (returns null +
console.warn).

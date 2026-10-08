# Pico Park campaign fidelity audit — 2026-10-07 (read-only; all 48 stages, 81 of 82 actor classes)

Produced by an Opus audit agent from the native decompile (memdump/ghidra_decompiled, factory FUN_7ff72bb72ae0)
versus the port's recovered runtime. Renders (frame 0, party 4, actor rects outlined) and per-class notes:
`scratchpad/audit-48/renders/`, `scratchpad/audit-48/classes/A..H-*.md`, `factory_index.json`.
WeightedLift was audited separately (fixed 2026-10-07, protocol 17).

## Counts
Match 20 · Misread 50 · Unimplemented 10 · Unknown 1 (PlaneObstacle).

Two patterns behind most misreads: (1) many factory branches read no params themselves — a per-class virtual at
vtable+0x60 (called from the factory tail at 0x7ff72bb772e5) applies them, while the port reads the numbers after
x,y as a width×height rect; (2) party-size terms (party−2 factors) are dropped in Rect, Bridge, Key,
WeightedLiftEx/Ex2, Lift, UpDownLift p1 and BreakoutPlayer.

## Top 10 most visible discrepancies
1. Every stage: cat body 26×34 feet at y+2; native 32×46 feet at y−1 (DAT_7ff72c62d1a8; Lua block_size = PLAYER_HEIGHT+4 = 50). Stacks ~26% too low.
2. 8-2, 8-4 (likely 9-1, 9-4): Goal opens at frame 0 on stages with no Key row; native opens only on key contact / message 9 / scene state 0x1a (FUN_7ff72bb531d0). BreakoutKey is a placeholder.
3. 9-2 unplayable: SeesawParent p1/p2 (365, 915) become a 365×915 wall; Balance is one block instead of two pans; PhysicsSwitch never reveals the key.
4. Thunder (17 stages): native sweeps to the first solid, any body incl. guard shields cuts it, drawn as an orange zigzag; port: always 2400 long, never cut, bolt icon. Breaks 4-1, 12-1, 5-4.
5. World 5: MajorityPlayer has no vote; MultiPlayer gives one ground jump instead of a 2/10-jump relay; JumpArea centred instead of top-left (5-2 pits uncovered).
6. 8-1/8-3 puzzle and 9-1/9-4 ball stages are placeholders (blocks at map origin; 9-1 laser fires up; 9-4 ball hops on jump).
7. Keys ignore the party offset x += (n−2)·p1, y += 0.8·n·p0 (FUN_7ff72bb651a0): 2-2 key 185.6 px high; 1-2/3-3/4-3 51.2 low; 6-4 32 low; 2-1 64; 12-3 x+120.
8. Rect party terms ignored (W = p0+p2k, H = p1+p3k, origin += (p4k, p5k), k = party−2): 2-2 stepping blocks 94 px low; 1-3 staircase 16 off, top step 64 not 48; 11-1 width 144 not 120. DarknessRect (10-4), SwitchRect (10-1) still centred.
9. World 11: WarpGun cats can't jump (gun on jump; native separate button); magnet does nothing; 11-4 Lift doesn't carry riders along its sweep; DelaySwitch fires at once instead of 10 s.
10. Non-PushBox boxes centred instead of bottom-anchored; 7-2 NormalBox/SmallBox are natively PushBoxes (port fixed solids); ColorBox unpushable by its colour; WeightedLiftEx/Ex2 64×14 centred vs 194×18 / 56×18 hanging 67 below the row.

VERIFY FIRST: the Warp auditor reads the native sensor as {0,0,w,h} extending DOWN from the row point, contradicting
the earlier `warp-sensor-origin` patch; if right, 5-1's third Warp covers the landing floor before the goal.

## Per-class table (Vis: B breaking, V visible, s subtle)
| Class | Stages | Native | Verdict | Worst discrepancy | Vis |
|---|---|---|---|---|---|
| Player | all | FUN_7ff72bb774a0; DAT_7ff72c62d1a8; FUN_7ff72bb67620 | Misread+unimpl | 26×34 vs 32×46; p0 facing ignored (7-3 Ghost); slots by label not row | B |
| GuardPlayer | 4-1 12-1 | FUN_7ff72bb56990/56c10 | Misread | no shield planks (6×60 / 48×6) | B |
| PlanePlayer | 4-2 12-3 | FUN_7ff72bb70860 | Match (×1.5); physics unknown | — | s |
| MajorityPlayer | 5-1 5-3 | FUN_7ff72bb7ffa0 | Unimpl | ≥ceil(0.7n) holding, hysteresis | B |
| MajorityController | 5-1 5-3 | FUN_7ff72bb65df0/660c0 | Unimpl | 5-bar HUD; port debug box + made-up goal rule | V |
| MultiPlayer | 5-2 5-4 | FUN_7ff72bb39ac0 | Unimpl | p1 jumps per airtime (2/10), control passes | B |
| WarpGunPlayer | 11-1 11-3 | FUN_7ff72bb57010 | Misread | gun on jump; native input bit 11 | B |
| MagnetPlayer | 11-2 11-4 | FUN_7ff72bb59090/59530 | Unimpl | pulls nearest cat in 110×80 field | B |
| BreakoutPlayer | 8-2 8-4 9-3 | FUN_7ff72bae5cf0 | Misread | one ball per row (9-3 party 4: 8 vs 4) | V/B |
| BreakoutSyncArea | 8-2 8-4 9-3 | FUN_7ff72bb778c0 | Misread | native empty; port 72×24 box + made-up clear | V |
| Rect | 19 stages | FUN_7ff72bb5b820 | anchor ok; party terms unimpl | p2..p5·(party−2) dropped | B |
| MapRect | 2-1 | FUN_7ff72bb36560 | Match | — | — |
| DarknessRect | 10-4 | FUN_7ff72bb5b820 | Misread | centred (≤144 px), black not orange | B |
| SwitchRect | 10-1 | FUN_7ff72bb5bcb0 | Misread | centred (platform "6" 240 px off), cyan | B |
| Bridge | 1-1 1-3 10-2 12-4 | FUN_7ff72bb4f630 | geometry ok; state/motion misread | starts folded solid nub, extends 2 px/f; p3 head start, p5 push ignored | V/B |
| KeyBridge | 12-2 | FUN_7ff72bb4f630 | Inverted | starts built; native folded, extends on key | B |
| Gate | 1-3 4-4 10-1 10-2 11-4 | FUN_7ff72bb4f630 | motion unimpl | instant; native 2 px/f open, 1 close | V |
| BlinkBlock | 3-3 | FUN_7ff72bb35390 | colour | cyan not orange | V |
| CollisionConstraintMove | 2-1 | FUN_7ff72bb3ab80 | Match | fires every frame vs once | s |
| ScrollLimitRange | 12-2 | FUN_7ff72bb5d230 | Match | — | — |
| PlaneObstacle | 4-2 12-3 | FUN_7ff72bb3dfb0 | Unknown | — | ? |
| PushBox | 9 stages | FUN_7ff72bb334f0/34820/343e0 | Match | box can't push box; body not inset 1 px | s/V |
| NormalBox | 7-2 | FUN_7ff72bb333d0 | Misread+unimpl | natively whole-party PushBox; port fixed, 48 px in floor | B |
| SmallBox | 7-2 11-4 | FUN_7ff72bb333d0 | Misread+unimpl | 1-cat PushBox {-25,-48,48,48} that falls | B |
| FallBox | 2-2 2-4 10-1 11-3 | FUN_7ff72bb42810 | Misread | centred, 24 px low; grey | V |
| ColorBox | 6-1 6-2 | FUN_7ff72bb3b5e0/3c2e0 | Misread+unimpl | matching cat can't push; colour p0 % n skipping p3 | B |
| ForceColorBox | 11-3 | FUN_7ff72bb3b490 | Misread | recolours any overlapping cat; centred | V |
| LaserKeyBox | 9-1 | FUN_7ff72bb544e0/54940 | Misread+unimpl | breaks after 3 hits; port waits for absent Key | B |
| BallBox | 9-4 | FUN_7ff72bb53e10 | Misread | 44×60 vs 48² centred | V |
| Switch | 11 stages | FUN_7ff72bb5e8c0/5f1d0 | Match | radius-12 circle vs 32×16; port's "box left spawn" rule extra | s |
| SwitchMediator | 1-3 | FUN_7ff72bb77b80 | Match | — | — |
| PhysicsSwitch | 9-2 | FUN_7ff72bb5e8c0 | Misread+unimpl | pressed by balls, latched, reveals key | B |
| DeadSwitch | 6-4 12-4 | FUN_7ff72bb3f080/3f1f0 | Misread | broadcasts cmd 3; "DON'T PUSH!" sign | V/B |
| JumpSwitch | 12-1 | FUN_7ff72bb778f0/5f410 | Misread+unimpl | fires on touch, re-arms, launches PushBox1 vy −9 | B |
| ScaleSwitch | 4-4 10-1 | FUN_7ff72bb77a30 | Match | "+"/"−" label/sprite missing | V |
| DelaySwitch | 11-4 | FUN_7ff72bb5f6d0/5f9c0 | Misread | 10 s countdown then reset; port instant | B? |
| CollisionChangePlayer | 10-x | FUN_7ff72bb3a210 | Match | — | — |
| CollisionActorCreator(+Silent) | 10-3 10-4 12-2 | FUN_7ff72bb3a640 | Match | — | — |
| UpDownLift | 1-4 5-1 5-3 12-2 | FUN_7ff72bb6d980/6db60 | Match | p1/p2 ignored (12-2 0.6 px) | s |
| Lift | 11-4 | FUN_7ff72bb550a0/34f30 | Misread | riders not carried sideways; 64×14 blue vs 118×18 orange | B |
| RouletteLift | 10-2 | FUN_7ff72bb49590 | Match | placeholder colours | V |
| MoveWall | 1-4 | FUN_7ff72bb664e0 | Match | — | — |
| WeightedLiftEx | 6-3 | FUN_7ff72bb63cf0 (wide) | Misread | 64×14 centred vs 194×18 at y+67; party travel table; 0.5/tick | B |
| WeightedLiftEx2 | 12-2 | FUN_7ff72bb63cf0 (narrow) | Misread | 56×18 at y+67; travel −96 vs −192 | B |
| DarknessWeightedLift | 10-3 10-4 | FUN_7ff72bb62450 | Match | — | s |
| JumpStand/Ex | 8 stages | FUN_7ff72bb649a0 | partial | boxes not launched; head-skip missing; green rect vs 32×42 sprite | V/B |
| JumpArea | 5-2 | FUN_7ff72bb36110 | Misread | centred vs top-left | B |
| Wind | 12-2 | FUN_7ff72bb6e140 | partial | 62×74 fan body missing | V |
| Thunder | 17 stages | FUN_7ff72bb4d220; sweep 0x7ff72bb4d600; cut 4da00; kill 4d850; draw 4dc10 | Misread | not swept/cut/drawn | B |
| StepEnemy | 6 stages | FUN_7ff72bb6c6c0 | Misread | 20×20 vs 48×26; no gravity; doesn't walk | B |
| UpDownEnemy | 5-1 5-3 7-3 | FUN_7ff72bb6d170 | Misread | 22×26 vs 56×48 | V |
| BowwowEnemy | 7-1 | FUN_7ff72bb38ba0 | Misread | 28×22 vs 60×78; wake rule | V/B |
| Ghost | 7-3 | FUN_7ff72bb51b00 | Match | placeholder sprite | V |
| TrafficLight/MoveEnergy/DeadTimer | 7-2 / 7-4 / 3-x | FUN_7ff72bb61be0/47a90/60c50 | layer | native on-screen HUD; port in world | V |
| Goal | 46 stages | FUN_7ff72bb52c20/531d0 | Misread | opens at frame 0 w/o Key; door 96×96 sunk 30 vs 64×64 on row | B/V |
| Key | 42 stages | FUN_7ff72bb64f20/651a0 | party offset unimpl | — | B |
| BreakoutKey | 8-2 8-4 | FUN_7ff72bb64f20 | Misread+unimpl | visible from frame 0, never carried | B |
| Warp | 12 stages | FUN_7ff72bb62ec0 | Misread (verify) | sensor y−h..y vs native y..y+h; boxes never warped | B (5-1) |
| WarpAll | 2-1 2-3 | FUN_7ff72bb62ec0 | Misread | sensors 720/960 px too high | s |
| CheckPoint | 5-1 5-3 5-4 | FUN_7ff72bb50710 | Misread | stand-in vs 32×64 flag {x−16,y−64} | V |
| Coin | 3-1 3-3 | FUN_7ff72bb50c30 | Misread | 12×20 vs 24×40 | V |
| CoinObserver | 3-1 3-3 | FUN_7ff72bb50fe0 | Match | — | — |
| Watch | 8 stages | creates nothing | Match | — | — |
| Text/OnlineText | 8-3 12-4 / 11-1 | FUN_7ff72bb77940 | partial | no [pl]/[shot] substitution | V |
| DistanceConstraint | 2-1 2-3 | FUN_7ff72bb3f3a0 | params ok; mechanism unknown | — | ? |
| Puzzle | 8-1 8-3 | FUN_7ff72bb5ff80 | Unimpl | sub-stage not simulated | B |
| PuzzlePredictProxy | 8-1 8-3 | FUN_7ff72bb4cd00 | Misread | native no body; port solid 32² proxies as win sensor | B |
| StopWatch | 4-3 | FUN_7ff72bb5de30 | view | 22² circle vs 164×64 panel | V |
| CoopStopWatch | 4-3 | FUN_7ff72bb3c6f0 | Match | colour 0xff1f8f vs #1f8fff | s |
| LaserBallPitcher | 9-1 | FUN_7ff72bb37d70 | Misread | fires up not left; speed as seconds; no cannon | B |
| BoundBallPitcher | 9-4 | FUN_7ff72bb37d70 | Misread | jump-controlled vs launched bouncing | B |
| PhysicsBallPitcher | 9-2 | FUN_7ff72bb37d70 | motion | ball through seesaws | B |
| PhysicsArea | 9-2 | FUN_7ff72bb77970 | Misread | made-up slow-fall; natively rigid wall | V |
| Seesaw/SeesawParent | 9-2 | FUN_7ff72bb5d420/77b30 | Misread | 365×915 wall; native plank {-300,-10,450,20}, ±10° | B |
| Balance | 9-2 | FUN_7ff72bb313f0 | Unimpl | two 194×14 pans at x ±450 | B |

## No native evidence found
PlaneObstacle geometry; PlanePlayer physics; DistanceConstraint mechanism; Puzzle rule/p3/p4 (no Ghidra split for
FUN_7ff72bb4c0b0; `.puzzle` file not found); BallBox; LaserKeyBox +0x400; BreakoutPlayer controller mode; physics
gravity / body type 3; Thunder sweep details; StepEnemy stomp/speed units; JumpStand side body; command 0x2d; Lift
flag 0x1000; ScrollLimitRange 528; who sends message 9 to the Goal in 9-1/9-4; 5-2 `Switch "MultiPlayer1"` rows;
the Warp vertical anchor.

## Proposed fix batches (one patch entry per class; batch 1 lands ALONE with full replay + smokes)
1 native-player-body (all) · 2 goal-native-open-and-door · 3 rect-party-terms (1-3 2-2 11-1) ·
4 rect-anchor-darkness-and-switchrect (10-1 10-4) · 5 key-party-offset · 6 thunder-beam (17) · 7 guard-shields ·
8 bottom-centre-boxes · 9 normal-small-box-are-pushboxes (7-2 11-4) · 10 colorbox-colour-push · 11 weighted-lift-ex-variants ·
12 lift-horizontal-carry (11-4) · 13 jumparea-top-left (5-2) · 14 bridge-folded-start-and-motion · 15 warp-sensor-downward
(verify first) · 16 step-enemy-native · 17 switch-family-native · 18 majority-vote · 19 multi-jump-relay ·
20 warpgun-action-button + magnet-grab · 21 breakout-key-and-balls · 22 ball-pitchers · 23 seesaw-balance ·
24 hud-layer-overlays · 25 jumpstand-launch-boxes · 26 small-looks · 27 puzzle-substage (research first).

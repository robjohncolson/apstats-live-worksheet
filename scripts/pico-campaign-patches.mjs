import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const CAMPAIGN_PATCHES = [{
  id: 'authored-switch-release-and-keyed-goal-entry',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/Goal.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb78b70', 'FUN_7ff72bb5eef0', 'FUN_7ff72bb531d0', 'FUN_7ff72bb52ec0'],
  behavior: 'Plain switches retain their pressed state unless the authored reset parameter is enabled. A carried key must reach the goal; cats enter with UP. Desk entry requires UP for key delivery as requested.',
}, {
  id: 'optional-teacher-cats',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Desk requirement: teachers can help without counting toward the student team'],
  behavior: 'Desk adaptation, not a native rule: optional teacher cats do not increase party thresholds, goal quorums, or scroll-camera membership. A teacher cat that leaves is removed with every retained reference to it (removeRuntimePlayer): a WarpGun that held it returns to the empty hold (native aux +0x430 == 0, FUN_7ff72bb580a0), a cat it held is put back where it is, and its keys, magnet, ride and hop entries are dropped.',
}, {
  id: 'warp-sensor-origin',
  files: ['src/engine/actors/Warp.ts', 'src/engine/actors/WarpAll.ts'],
  evidence: ['FUN_7ff72bb62ec0', 'FUN_7ff72bc12370', 'FUN_7ff72bc17170'],
  behavior: 'Local [0,0,width,height] sensor translated to the actor (top-left at the row point since warp-sensor-top-left; this entry first read it as a left/bottom anchor). Sensors have no visible artwork.',
}, {
  id: 'push-box-native-art',
  files: ['src/engine/actors/PushBox.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb340f0'],
  behavior: 'Native opaque white/orange nine-patch, 24-unit corners from the recovered atlas.',
}, {
  id: 'jump02-unsupported-boxes',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb33890'],
  behavior: 'In jump02, unsupported numbered boxes fall at .65 units/tick squared and settle on floors, boxes, or live cats. Other stages retain their current movement controllers.',
}, {
  id: 'solid-push-chains-and-segment-anchors',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/Bridge.ts', 'src/engine/actors/KeyGate.ts'],
  evidence: ['FUN_7ff72bb343e0', 'FUN_7ff72bc16780', 'FUN_7ff72bb4f630', 'FUN_7ff72bb4f9d0'],
  behavior: 'Pushes carry obstructing cats or stop at blocked chains. Gate extents follow authored segment counts. Bridge segment rectangles use local zero-origin bounds.',
}, {
  // Teacher 2026-10-07 (campaign 1-2): a block pushed off a ledge never came back.
  id: 'push-box-sky-respawn',
  files: ['src/engine/actors/PushBox.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['Teacher observation of shipped PICO PARK (no recovered native handler yet)', 'FUN_7ff72bb6f0e0 (shared bottom kill-line)'],
  behavior: 'Every stage: a push box whose top passes the bottom kill-line that fails players returns to its spawn x, falling from rest, and drops back onto its origin. It starts just above the top of the screen, or, when map tiles overhang the origin, from just under the lowest overhang. While that start overlaps a cat or another box, the box waits parked at the kill line (off-screen, at rest) and retries each frame. Deterministic (map tiles and frame state only).',
}, {
  // Teacher 2026-10-07: "the escalator should still count the cat even when stacked."
  id: 'stacked-cats-weigh-lifts',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb64310', 'FUN_7ff72bc132c0 (recursive DOWN contact count)', 'FUN_7ff72bc17330 (recursive carry)'],
  behavior: 'WeightedLift/Ex/Ex2 count every cat in the contact stack resting on the slab (directly, on another cat, or on a box), transitively, and carry the whole stack with the slab, as DarknessWeightedLift already did. Thresholds unchanged (optional teacher cats still add weight but never raise the requirement). Deterministic: rect geometry in player-index order.',
}, {
  // Teacher 2026-10-07: "the box is stuck to the cat's head like crazy glue — it should be something you can
  // jump and move off the head". Rewritten to the native rule (was: the box copied every cat move).
  id: 'push-box-head-carry',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/PushBox.ts'],
  evidence: ['FUN_7ff72bb33890 (PushBox resolver: zeroes its own vx; support = any body in the cell below via FUN_7ff72bc13690, which has no category filter, so a cat holds a box; else the 0.65 settle)',
    'FUN_7ff72bc17330 callers (box push, lifts, plane, stretch, RouletteLift, switch motion): the normal cat update FUN_7ff72bb6f0e0 never chain-displaces, so a walking cat does not carry its head box',
    'FUN_7ff72bb6f0e0 jump: vy is set only if FUN_7ff72bb5b630(body, 0 = above, 1, 0) finds nothing above (an unfiltered FUN_7ff72bc13690 query); with something above, see head-stack-jump-impulse',
    'Carriers move stacks: lifts/MoveWalls sweep (FUN_7ff72bc16f50) and displace contacted bodies by the same delta (FUN_7ff72bb34f30 -> FUN_7ff72bc17330 -> FUN_7ff72bc16780, recursive)'],
  behavior: 'Every stage: a cat holds a push box like a floor; once unsupported (the carrier drops away or the box is blocked while the cat walks on) it falls. A rising cat meets a box above it at its underside (it never passes into it). What a jump press does with a body on the head is head-stack-jump-impulse; a walking cat carries its head box (stack-riding, which supersedes this entry\'s earlier "a walking cat carries nothing" reading). A carrier (WeightedLift family or MoveWall) under the cat moves the head box by that carrier\'s own delta, transitively down the stack, with cats riding the box. Deterministic: frame-start rects, lowest player index wins.',
}, {
  // Teacher 2026-10-07 (plays the original): "if the bottom cat moves when a cat is on top, the top cat just falls
  // down — in the game the top cat RIDES the bottom cat's head". Confirmed by a capture of the original (1-3,
  // og-capture-2/notes.md, runs A1/A2/B2/B3/E1/F2/G1/G2). The decompile did NOT locate the mechanism (see evidence).
  id: 'stack-riding',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Retail capture og-capture-2: a walking cat carries the cat and/or box resting on it by its exact dx in every sampled frame, from the first sample (same frame, no lag); transitive (cat / box / cat: identical deltas); a cat on a pushed box rides it 1:1; an airborne cat keeps its x; when the carrier drops off a ledge, contact breaks and the box keeps its x and falls',
    'Decompile (og-capture-2/decomp/matrix.md): NOT found. avatar+0x140 is written only by CollisionConstraintMove (FUN_7ff72bb6e6d0); FUN_7ff72bb6f0e0 never calls FUN_7ff72bc17330; PushBox FUN_7ff72bb33890 zeroes its vx and inherits nothing. Supporting hint: FUN_7ff72bb7b700 -> FUN_7ff72bb7cd20 caps a walking cat\'s scroll-mode speed by the furthest x of the stack on top of it (recursive), which presumes the stack moves with the walker'],
  behavior: 'Every stage: after a cat\'s own update and collisions, everything resting on its pre-move rect (cats and push boxes; not a rising cat, a falling, hopping or hop-requested box) moves sideways by the same dx in the same frame, transitively up the stack (bottom-up, breadth-first; cats by index, then boxes by index). A cat carried by a pushed box carries its own stack the same way. A rider blocked by a tile, solid or body moves only as far as it can, and the support walks out from under it. A body is displaced by riding at most once per frame (frame-wide set), and only by ONE support: of the bodies it rested on at frame start, the one with the largest horizontal overlap (ties: cats by index, then boxes by index); a rider that landed this frame rides whatever it rests on. Vertical motion is not inherited (gravity / carriers handle it). Steps over 48 units (teleports) never drag a stack. Deterministic: simulation state only.',
}, {
  // Teacher 2026-10-07 (plays the original): "with a box on your head jumping works a little, the box bounces;
  // with a cat on your head jumping doesn't work at all". Confirmed by a capture of the original (1-3,
  // og-capture/notes.md, runs O/Q/R/P/U/I/E/M): the cat rises 0; a free box on the head hops 22 native units
  // (~0.28 s, hold-independent, keeps its x, lands back with no bounce); a box carrying a cat does not move.
  id: 'head-stack-jump-impulse',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/PushBox.ts'],
  evidence: ['FUN_7ff72bb6f0e0: with a contact above (FUN_7ff72bb5b630 dir 0) the jumper\'s velocity is never set; FUN_7ff72bc15c70(player, node, GetJumpSpeed, 2) hands the jump up the column',
    'FUN_7ff72bc15c70: v = GetJumpSpeed / FUN_7ff72bc13430(node, UP, 0xffffffff) (depth of the stack above); FUN_7ff72bc15dc0 calls each receiving owner\'s vtable +0x78 with (2, (0, v)), recursing with v + step, so the top layer gets the full speed',
    'A player\'s +0x78 is FUN_7ff72bb69440 (setState): cats in the column change state, not velocity',
    'Retail capture (og-capture/notes.md): box hop 22 native, airtime 0.27-0.30 s, hold 47/330/670 ms -> 34/33/33 px; stack blue/red/box: box hops, cats still; blue/box/red: nothing moves'],
  behavior: 'Every stage: a jump press by a grounded normal cat with a cat or box resting on its head does not move the cat. The column above is walked bottom-up (breadth-first; cats by index, then boxes by index): cats pass the hand-off up (state only, no velocity); a box with anything on it receives nothing; the first free box reached gets one upward impulse, v0 = sqrt(2 G h) + G dt / 2 with h = 22 (the retail hop) and G the box gravity the port already uses for that stage, so its apex is 22 units. It keeps its x, rises under G, and lands with the exact-landing resolve on whatever is below (the head if still under it). Edge-triggered: holding jump changes nothing. Deterministic: simulation state only.',
}, {
  // Teacher 2026-10-07: "blocks can be used to hold down buttons!" FIDELITY fix, not a desk rule: the
  // native plain-switch begin-contact accepts any body with mask bit 0x2 and category 1..3, and a
  // PushBox body is category 2 (ENGINE_SPEC's earlier "player bodies only" reading was wrong).
  id: 'push-box-holds-switches',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb5f1d0 (switch begin-contact: mode != 2 requires body+0x20 & 2 and 1 <= body+0x4 <= 3)',
    'FUN_7ff72bb340f0 (PushBox body: FUN_7ff72bc16bf0(..., 3) mask 3; body+0x4 = 2, category 2)'],
  behavior: 'Fidelity: a landed push box that has moved from its spawn holds a plain Switch (and SwitchMediator pad) down like a cat, using the native 1px-inset body, as the native begin-contact accepts category-2 PushBox bodies. Roulette stop switches, JumpSwitch, ScaleSwitch, DelaySwitch, SwitchTimer and DeadSwitch stay player-only.',
}, {
  // Teacher 2026-10-07 (approved): the 1-3 square jammed a 50-tall box and a 46-tall cat; the port centred Rects.
  id: 'rect-left-bottom-anchor',
  files: ['src/engine/actors/StaticRect.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb72ae0 literal "Rect" branch (DAT_7ff72bcbf448): W = p0 + p2*k, H = p1 + p3*k; if W < 0 the origin x += W and W *= -1.0 (0x7ff72bcff6a8); FUN_7ff72bb77c10(rect, 0, H ^ 0x80000000, W, H) = local {0, -H, |W|, H} (0x7ff72bb7692b..0x7ff72bb7696b)',
    'Origin [rsp+0x48] = row x,y (row+0x14, 0x7ff72bb72b4f) passed to the actor transform in the common tail (0x7ff72bb772f2)',
    'FUN_7ff72bb5b820 (Rect ctor) passes that rect unchanged to FUN_7ff72bc16bf0(actor, rect, 2, 1)'],
  behavior: 'Every stage: a literal Rect spans x from its spawn toward its signed width and y from spawn - height up to the spawn (left-bottom anchor, height upward), not centred. Other StaticRect users (MoveWall, CollisionSwitch, PuzzlePredictProxy, CollisionActorCreator) are unchanged (unverified). The 1-1 override in campaign-jump01.mjs still reassigns after load.',
}, {
  // Teacher 2026-10-07: "if a platform (elevator/lift) comes down on top of a cat's head, the cat stays stuck in the
  // platform until I reload". Retail capture (og-capture-2/notes.md run L4, stage_weight01 UpDownLift): the slab comes
  // down onto a cat standing on the floor, STOPS on its head (no push, no damage), holds ~1.5 s, then rises on its
  // normal schedule; the next peak is the same height as before (no lasting phase offset).
  id: 'descending-lift-stops-on-bodies',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Retail capture og-capture-2 L4: lift underside stops at the cat top (screen 577 vs cat 581, sprite margin), held 2.84 s -> 4.32 s, then follows its sine path upward; cat y unchanged throughout',
    'FUN_7ff72bc16f50 (chain test): fails when a body touching the slab in its motion direction touches a tile in that direction (FUN_7ff72bc137b0) or its own chain fails; FUN_7ff72bc17330 is only ever called with direction UP: no lift pushes a body down; no crush / damage path from body overlap',
    'FUN_7ff72bb6db60 (UpDownLift): blocked -> +0x3f8 |= 1, hold, wait +0x410 ~ the time its sine path spends past the obstacle, then mirror the phase (back up)',
    'FUN_7ff72bb64310 (WeightedLift family): a contact under the slab freezes it (+0x408 = 0.06 s)',
    'FUN_7ff72bc1e050 / FUN_7ff72bc1e4a0: a remaining overlap is rolled back to the time of impact; the lift (node flag 2) is not pushed, the other body is'],
  behavior: 'Every stage: a WeightedLift / Ex / Ex2 / DarknessWeightedLift / UpDownLift moving DOWN onto a live cat or a resting push box that stands on something (tile, solid, lift, box or cat) stops exactly in contact with its top and never moves into it (the stack on the slab gets the shortened delta). An UpDownLift then holds at that height until its own sine path rises back above it (equivalent to the native wait + phase mirror for a symmetric path), even if the body leaves. A weighted lift resumes from where it stopped. A body under the slab that stands on nothing (mid-air) is pushed down to the slab underside instead. No crush, no damage. Not modelled: the 0.06 s WeightedLift freeze after contact ends, and its freeze of upward motion while something touches its underside; base Lift and RouletteLift unchanged. Deterministic: frame-start lift rects, bodies in index order.',
}, {
  // Teacher 2026-10-07 (1-4 side by side with the original): "the platforms aren't orange like the real one, and the
  // moving door/wall is HUGE". Retail frames og-capture-2 (c04, L1-L4) vs the port at the same scale/framing
  // (og-capture-2/look14). Decompile: og-capture-2/look14/decomp/look.md.
  id: 'native-movewall',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Factory call at 0x7ff72bb74904: FUN_7ff72bb664e0(this, trunc(p0), trunc(p1), p2 > 0 ? p2 : -1.0); no party-size term',
    'FUN_7ff72bb664e0: travel = a (|a| <= 1.19e-7 -> 50); sensor width = b (~0 -> 50); height c (< 0 -> 260); body {-8, -c+1, 16, c-2} (category 4, flag 0x10); view {-9, -c, 18, c} from atlas (500,255,9,130) = solid #ff864d; sensor {min(b,0)+10, -c+1, |b|, c-2}, moving with the wall',
    'FUN_7ff72bb66be0 (sensor begin-contact): state := 2, timer := 0 only if the other body has category != 0, state < 2 and timer >= 1.5 s; the wall spawns in state 0, which never moves on its own',
    'FUN_7ff72bb667e0: slide sign(travel)*2 per tick until |offset| > |travel|, wait 1.5 s, return sign(travel)*-1.5 per tick until offset*travel <= 0, snap 0, wait 1.5 s, then cycle (the port constants already match)',
    'Retail 1-4: both cats stayed on the floor, outside the sensor band (y 49..239), and the wall never moved; the orange block right of the UpDownLift is the row-5 MC_BW* ledge, not the wall'],
  behavior: 'Every stage: a MoveWall row {x, y, p0, p1, p2} is a 16-wide pillar standing on (x, y): body x-8..x+8, y-c+1..y-1 with c = p2 (260 when p2 <= 0), drawn with the native orange bar; p0 is its travel, p1 its sensor width. It waits idle until a live cat or push box begins touching its sensor (x + min(p1,0) + 10, width |p1|, the body height band, moving with the wall) at least 1.5 s after load; then it runs the existing slide / wait / return / wait cycle. Not modelled: undoing a slide step when the native chain test fails (the port keeps its existing shove).',
}, {
  id: 'native-lift-and-ledge-look',
  files: ['src/engine/actors/WeightedLift.ts', 'src/engine/sprites.ts', 'src/engine/picoStyle.ts'],
  evidence: ['FUN_7ff72bb6d980 (UpDownLift ctor): view {-60, -10, 120, 20} from atlas (385,49,60,10) = solid #ff864d; body {-59, -9, 118, 18}; retail capture L4: slab 173 x 23 screen px = 115 x 15 native, orange',
    'FUN_7ff72bb63cf0 (WeightedLift family): orange scale sprites (atlas (351,511,98,42) wide / (383,559,34,42) narrow); body anchor relative to the row is NOT traced, so only the colour is changed',
    'Retail capture (L4 frame 75): the MC_BWL/MC_BWC/MC_BWR ledge (stage_weight01 row 5) is #ff864d with rounded ends; no evidence was captured for MC_BH* / MC_BR* chips'],
  behavior: 'Look and size: the UpDownLift body is the native 118 x 18 (was 64 x 14) centred on its row point and drawn with its native orange atlas slab (no guide line). WeightedLift / Ex / Ex2 are drawn as solid orange rounded slabs at their existing size (was translucent light blue with a guide line); their native scale sprite and body size are left for when the anchor is traced. MC_BW* chips render stage orange (was brown); other MC_B* chips keep their colour (no evidence).',
}, {
  // Teacher 2026-10-07: "please study the behaviour of the other two platforms" (1-4, the WeightedLifts). Decompile
  // study og-capture-2/wlift/decomp/wlift.md (the game was not running: no retail capture of these lifts exists).
  id: 'native-weighted-lift',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/WeightedLift.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bc2a1a0: row column 1 is a party-size spawn filter (-4 = up to 4 players, 5 = 5 or more); the 1-4 lifts are independent (no shared label, no balance object)',
    'FUN_7ff72bb72ae0 plain WeightedLift branch (0x7ff72bb740db..0x7ff72bb74223): FUN_7ff72bb63cf0(obj, 0.0, 0) = wide variant; travel = p0 + p2*n; FUN_7ff72bb64100(int p1, int p3) only when p1 > 0: required = max(p3 or 2, ceil(p1/100*n)); else the ctor default max(2, ceil(0.2*n)) (DAT_7ff72bc7d858); p4 > 0 disables auto-return; p5 adds p5*max(0, n-2) to the return step',
    'FUN_7ff72bb63cf0: wide body {x-92, y+67, 194, 18}; sprite {x-93, y, 196, 84} from atlas (351,511,98,42) (sign box on a post over an orange slab)',
    'FUN_7ff72bb64310: count = FUN_7ff72bc132c0(UP, mask 6) = cats and push boxes, recursively (a box weighs one, a box on a cat counts); fixed 1.0 per tick toward full travel when count >= required, else the return step toward 0 (if auto-return), clamped; any contact under the slab sets +0x408 = 0.06 s and nothing moves until it expires',
    'FUN_7ff72bb64640: the sign prints "%d" = max(0, required - count) at (x+5, y+7+offset), size 32'],
  behavior: 'Plain WeightedLift rows, every stage: body {x-92, y+67, 194, 18} (was 64 x 14 centred) drawn with the native sign-and-slab sprite and the number of bodies still needed on the sign; required = max(p3 or 2, ceil(p1/100 n)) when p1 > 0, else max(2, ceil(0.2 n)) (was floor, and p3 applied always); travel p0 + p2 n; 1 unit per tick toward full travel while loaded, else 1 + p5 max(0, n-2) per tick back to rest unless p4 > 0 (no auto-return); a cat or push box touching the slab underside freezes it 0.06 s. The weight counts cats and push boxes resting on the slab, transitively (a box on a cat now counts); n = the student party (optional teacher cats never raise the requirement). 1-1 keeps its verified 184 x 19 slab (campaign-jump01.mjs). Not modelled: the native chain test before each step (a rider pinned on a ceiling), tile contacts in the underside freeze (1-4 A sinks flush with the floor by design; whether native freezes there is open), WeightedLiftEx / Ex2 (variant mapping unverified), the sign text colour/font (not decoded: stage orange used).',
}, {
  // Fidelity audit 2026-10-07 (state/pico-campaign-fidelity-audit-2026-10-07.md, Top 10 #1, batch 1; teacher "Let's go").
  id: 'native-player-body',
  files: ['src/engine/actors/PlayerGeometry.ts', 'src/engine/actors/Player.ts', 'src/engine/physics.ts',
    'src/engine/GameRuntime.ts', 'src/engine/actors/BreakoutBall.ts'],
  evidence: ['FUN_7ff72bb66e50 (avatar ctor) -> FUN_7ff72bb6a3b0(avatar, 0): rect = DAT_7ff72c62d1a8 (copied from DAT_7ff72bcbdfa0 by FUN_7ff72baa5f10; the memory image reads [-16, -47, 32, 46]) -> FUN_7ff72bc16bf0(avatar, &rect, 3); FUN_7ff72bc12370 stores it as the body {x, y, w, h} at +0x28..+0x34; category 1 (+4)',
    'FUN_7ff72bb66e50 view: DAT_7ff72bcb98a0 = [-32, -62, 64, 62] with UV DAT_7ff72c62ad68.. = [1, 1, 31, 31] atlas px, so the drawn cat spans y-62..y and its bottom is 1 below the body bottom (y-1); the port already draws this 64 x 62 root bottom-centred on the row point',
    'Lua stage rows stack spawned cats 50 apart (block_size = PLAYER_HEIGHT + 4 with PLAYER_HEIGHT 46): stage_jump02 P1..P8 at y = 432, 382, ..., 82',
    'FUN_7ff72bb774a0 common tail -> setParams FUN_7ff72bb67620: if p0 is numeric and (int)p0 == 1, vtable +0xa8 = FUN_7ff72bae78f0 makes scale.x negative (the cat spawns facing left)',
    'FUN_7ff72bb774a0: slot = table(+0xc0)[counter(+0xb8) % length(+0xf0)], the counter = player rows spawned so far in row order; FUN_7ff72bb72960 fills the table with 0..numPlayers-1 (shuffled only when enableShufflePlayer); the row label is never read'],
  behavior: 'Every stage: a cat\'s body is the native 32 x 46 with its bottom 1 above the row point (x-16..x+16, y-47..y-1); it was 26 x 34 with its bottom 2 below it. The drawn cat is unchanged relative to the row point (64 x 62, bottom-centred on it, as native). The browser-only 3-unit floor-rest inset in the tile sweep is removed: it existed only because the old body started 2 units inside the floor, and the new body never starts inside one. A Player-family row whose p0 is 1 spawns facing left (the port also restores that facing on respawn: native respawn facing not traced). Stage player rows bind input slot and colour by row order (slot-table entry k for the k-th spawned row), not by label; optional teacher cats keep their own slot. Adapters keyed to the old body follow it: the key-carry actor point (body bottom + 1) and the BreakoutBall native-contact offset (now 0). Not changed: the jump/gravity integrator and the ScaleSwitch scaling rule.',
}, {
  // Fidelity audit 2026-10-07 batch 2 (Top 10 #2; audit-48 F-goal-key-warp section 1).
  id: 'goal-native-open-and-door',
  files: ['src/engine/actors/Goal.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb52c20 (Goal ctor): view {-32, -64, 64, 64} (DAT_7ff72bcbad80/84, DAT_7ff72bc7d1b8, DAT_7ff72bcbad90) from atlas (96,512,48,48), drawn at 4/3; open frame (96,576,48,48) (FUN_7ff72bb52ec0)',
    'FUN_7ff72bb53000 (slot 12): sensor DAT_7ff72bcbada0 = {-24, -32, 48, 32}, category 10; a numeric p0 raises its top: y = -32 - p0, h = 32 + p0',
    'FUN_7ff72bb531d0 (contact): the Goal opens (FUN_7ff72bb52ec0) only on a category-8 body (Key) touching its sensor, on message 9 (FUN_7ff72bb53190) or on scene state 0x1a; it never opens by itself',
    'No campaign row sends message 9 to a Goal (no row targets "Goal"). 9-1 / 9-4: LaserKeyBox / BallBox vtable slot 6 (FUN_7ff72bb54780 / FUN_7ff72bb53ff0) allocates an ordinary Key (FUN_7ff72bb64f20(key, 0)) into +0x400; breaking the box (FUN_7ff72bb54940: 3 category-5 hits / FUN_7ff72bb54330: a ball answering command 0xb within 5.0) puts that Key at (box x, box y - 30) (DAT_7ff72bcb4ee8) and adds it to the scene (FUN_7ff72bb54d60); the Key carried into the door opens it'],
  behavior: 'Every stage: a Goal starts closed and opens only when a Key is delivered (the desk keeps UP for delivery, authored-switch-release-and-keyed-goal-entry); it no longer opens at frame 0 on stages with no Key row. The door is the native 64 x 64 (48 x 48 frame at 4/3) with its bottom on the row point (was 96 x 96 sunk 30 below it), and the sensor is {x-24, y-32-p0, 48, 32+p0} (was {x-20, y-30, 40, 60}). KeyGoal is a different class and is unchanged. Consequence: 8-2 / 8-4 (BreakoutKey) and 9-1 / 9-4 (the Key inside the LaserKeyBox / BallBox) cannot be cleared until those openers are implemented (batches 21 / 22).',
}, {
  // Fidelity audit 2026-10-07 batches 3 + 4 (Top 10 #8; audit-48 A-geometry sections 1-3).
  id: 'rect-party-terms',
  files: ['src/engine/actors/StaticRect.ts', 'src/engine/actors/DarknessRect.ts', 'src/engine/actors/SwitchRect.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb72ae0 Rect / InvisibleRect / DarknessRect branch 0x7ff72bb76872..0x7ff72bb7696b: k = (u32)(party - 2) (0x7ff72bb7687f add ebx,-2); W = p0 + p2 k (0x7ff72bb768bb..c9); H = p1 + p3 k (0x7ff72bb768d7..e5); if the param count > 4 (0x7ff72bb768ea cmp [r12+0x1c],4) origin += (p4 k, p5 k) (FUN_7ff72bb93620 on rsp+0x48); if W < 0 origin.x += W, W = -W; rect = FUN_7ff72bb77c10(0, -H, W, H)',
    'DarknessRect: same branch and ctor FUN_7ff72bb5b820 (+0x6e0 = 1 only changes command 0x2c)',
    'SwitchRect branch 0x7ff72bb7633f: W = p0, H = p1 (no party terms), the same negative-W flip, rect FUN_7ff72bb77c10(0, -H, W, H)',
    'Colour: FUN_7ff72bb5b820 (Rect) and FUN_7ff72bb5bcb0 (SwitchRect) build the same 9-slice from the same UV table DAT_7ff72bcbbdf0..DAT_7ff72bcbbe60 (atlas (0..47, 528..575), solid #ff864d)'],
  behavior: 'Every stage: a literal Rect / DarknessRect is W = p0 + p2 k wide, H = p1 + p3 k tall, shifted by (p4 k, p5 k) when the row has more than 4 params, k = student party - 2 (clamped at 0; native wraps unsigned for a party of 1), left-bottom anchored (was: p0 x p1 only). DarknessRect and SwitchRect use the same left-bottom anchor (were centred) and the stage orange (were black / translucent cyan). Zero sizes follow native (no 32 default for Rects). 1-1 keeps its campaign-jump01.mjs override.',
}, {
  // Fidelity audit 2026-10-07 batch 5 (Top 10 #7; audit-48 F-goal-key-warp section 2).
  id: 'key-party-offset',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb72ae0 Key branch 0x7ff72bb7450a..0x7ff72bb7455f: int p0 -> xmm6, int p1 -> xmm1 (FUN_7ff72bb78470), vec = (p1, p0) (FUN_7ff72bb930e0), FUN_7ff72bb651a0 writes origin + ((N - 2) p1, 0.8 N p0) back to the factory origin rsp+0x48',
    'FUN_7ff72bb651a0: ((float)N - DAT_7ff72bcff5c0 (2.0)) * a, (float)N * DAT_7ff72bcb5530 (0.8) * b; N = DAT_7ff72c629fa8+0xcc08 (the configured player count)'],
  behavior: 'Every stage: a Key row spawns at x + (n - 2) p1, y + 0.8 n p0 (n = the student party; optional teacher cats never move it); its home position (where a dropped key returns) is that moved point. Was: the row point at every party size.',
}, {
  // Fidelity audit 2026-10-07 batch 8 anchors (Top 10 #10; audit-48 B-boxes sections 3-5).
  id: 'bottom-anchored-boxes',
  files: ['src/engine/actors/FallBox.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FallBox: FUN_7ff72bb42900 (slot 12) rect = {-p0/2, -p1, p0, p1} (bottom-centre) -> FUN_7ff72bb42d90; view 9-slice from atlas (144..191, 640..687) tinted with palette index 9 (FUN_7ff72baea070(9) = DAT_7ff72c62a040[9] = 0xffffffff)',
    'ColorBox: shared block 0x7ff72bb76d9d builds {-w/2, -h, w, h} with w = p1, h = p2 (default 32) for FUN_7ff72bb3b350; ForceColorBox branch 0x7ff72bb73c9b builds the same rect for FUN_7ff72bb3b490',
    'ForceColorBox has no recolour rule: it shares the ColorBox vtable (PTR_LAB_7ff72bcb7c88); the only callers of the player recolour FUN_7ff72bb67670 are FUN_7ff72bb688c0 (own slot), FUN_7ff72bb68a50 (network packet), FUN_7ff72bb6a160 (online slot reassignment) and FUN_7ff72bb6f0e0 (MultiPlayer relay)',
    'The FallBox atlas region is a channel mask (red fill, blue outline) that the native draw remaps; the remap is not decoded, so the grey look stays'],
  behavior: 'Every stage: FallBox, ColorBox and ForceColorBox stand bottom-centred on their row point (were centred on it, half their height too low). ForceColorBox no longer recolours a cat that overlaps it (invented; the warp-gun colour of the box is unchanged). Not changed here: FallBox art (grey), its 2-unit body inset, ColorBox colour / push rules (batch 3).',
}, {
  // Fidelity audit 2026-10-07 batch 3 (Top 10 #10; audit-48 B-boxes section 2).
  id: 'normal-small-box-are-pushboxes',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb72ae0 branches 0x7ff72bb739a7 / 0x7ff72bb73a09 / 0x7ff72bb73a77 / 0x7ff72bb73ae7 (TallBox / BigBox / NormalBox / SmallBox, index 0..3) -> FUN_7ff72bb333d0(obj, index)',
    'FUN_7ff72bb333d0: the PushBox ctor body (vtable PTR_FUN_7ff72bcb68c0, weight +0x404 = 100, offset +0x40c = 0) with rect DAT_7ff72bcb66a0[index]; the memory image reads Tall {-40,-703,80,703}, Big {-48,-128,96,128}, Normal {-48,-96,96,96}, Small {-25,-48,48,48}; then +0x90 |= 0x10 (hop propagation)',
    'Same vtable as PushBox: p0 = weight / offset (FUN_7ff72bb33780), required = ceil(weight/100 n) + offset (FUN_7ff72bb34820, ceil = IAT 0x7ff72bc7c5d8), pushed by FUN_7ff72bb33890, falls 0.65 when unsupported (FUN_7ff72bb34c40)'],
  behavior: 'Every stage: TallBox / BigBox / NormalBox / SmallBox rows are push boxes (the port PushBox, so they push, fall, ride, hop, respawn and hold switches like one) with the native table rect on the row point and p0 as the weight: 7-2 NormalBox (p0 100) needs the whole student party, the 7-2 / 11-4 SmallBoxes (p0 10) one cat. Was: static grey solids centred on the row point. LaserKeyBox / BallBox keep their own actors. Not modelled: the native 1-unit body inset.',
}, {
  // Fidelity audit 2026-10-07 batch 3 (audit-48 B-boxes sections 1, 4).
  id: 'colorbox-colour-push',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/PushBox.ts'],
  evidence: ['FUN_7ff72bb3b350 (ColorBox ctor): colour +0x6fc = p0 % n (n = DAT_7ff72c629fa8+0xcc08); if p3 >= 0 and that colour == p3 % n it becomes (colour + 1) % n; flags |= 0x10',
    'FUN_7ff72bb3b5e0 (update): vx = 0, then it moves if FUN_7ff72bb3c2e0(side 2) or (side 3) finds the colour; FUN_7ff72bb3c2e0 walks the side contacts recursively and returns 1 on a player (type DAT_7ff72c62a101) moving into the box whose colour (player +0x400 = plVar2[0x80]) equals the box colour; one such cat anywhere in the chain is enough',
    'Box pushes box: FUN_7ff72bb343e0 (leading side) fails on a wall (FUN_7ff72bc137b0); for a push-box contact (type DAT_7ff72c62a10f) it counts that box own chain (FUN_7ff72bb34530, any body moving into it, the pushed box included) and fails only when the count < its requirement (FUN_7ff72bb34820), then recurses along the line'],
  behavior: 'Every stage: a ColorBox row is a push box (rect {-w/2, -h, w, h}, w = p1, h = p2, default 32) of colour p0 % n (p3 skip) that moves only when a cat of that colour (the cat on that player slot) is in the chain pushing it; it falls, rides, hops and respawns like a push box. Was: a static solid in a 6-colour palette. ForceColorBox (11-3) keeps its own actor (warp-gun target). And every stage: a push box pushed into another push box moves it (and the line beyond it) when each box requirement is met by the pushers plus the boxes in front of them; a solid ends the line. Was: a box never moved into another box.',
}, {
  // Fidelity audit 2026-10-07 batch 3 (audit-48 D-movers section 5).
  id: 'weighted-lift-ex-variants',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/WeightedLift.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb72ae0 0x7ff72bb742ab..0x7ff72bb74307: bl = (name == "WeightedLiftEx2", string at 0x7ff72bcbef18); FUN_7ff72bb63cf0(obj, 0.0, bl)',
    'FUN_7ff72bb63cf0: param_3 == 0 -> DAT_7ff72c62d108 = {-92, 67, 194, 18} (wide), else DAT_7ff72c62d118 = {-28, 67, 56, 18} (narrow): WeightedLiftEx is wide, WeightedLiftEx2 narrow',
    'Factory 0x7ff72bb74314..0x7ff72bb743ae: if int p0 != 0, travel = p0 + int(param[n + 1]) (when nonzero) -> FUN_7ff72bb64050; if int p1 > 0, FUN_7ff72bb64100(int p1, 0) (required = max(2, ceil(p1/100 n))); float p2 -> +0x414 and +0x418 (the step per tick both ways)',
    'Narrow sprite atlas (383,559,34,42) drawn {-34, 0, 68, 84}; sign at (x + 0, y + 7) (FUN_7ff72bb64640: +5 only for the wide variant)'],
  behavior: 'Every stage: WeightedLiftEx (6-3) is the wide 194 x 18 slab and WeightedLiftEx2 (12-2) the narrow 56 x 18 slab, 67 below the row point, with the sign showing the bodies still needed; travel = p0 + the party table entry p[n + 1]; required = max(2, ceil(p1/100 n)); p2 units per tick in both directions; auto-return; the 0.06 s underside freeze; weight = cats and push boxes on the slab, transitively (as native-weighted-lift). Was: a 64 x 14 slab centred on the row point, travel p0, 1 unit per tick.',
}, {
  // Fidelity audit 2026-10-07 batch 3 (audit-48 D-movers section 2).
  id: 'lift-horizontal-carry',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/WeightedLift.ts'],
  evidence: ['FUN_7ff72bb550a0 (Lift ctor): body DAT_7ff72c62d010 = {-59, -9, 118, 18} (memory image), view {-60, -10, 120, 20} from atlas (385,49,60,10), as UpDownLift',
    'FUN_7ff72bb55370 (update): FUN_7ff72bb34f30(this, (0, dy), dir 0 = the contacts above) and FUN_7ff72bb34f30(this, (dx, 0), dir 0) -> the stack on the slab moves by the slab dx as well as its dy (recursively, FUN_7ff72bc17330)'],
  behavior: 'Every stage: a Lift is the native 118 x 18 orange slab, and what rests on it (cats and push boxes, transitively) moves with its horizontal sweep as well as its vertical one (11-4: the 1488-unit trip). Was: 64 x 14 translucent blue, vertical carry only. Not changed: Lift p2 / p3 (native: amplitude per party member; 11-4 has 0, 0).',
}, {
  // Fidelity audit 2026-10-07 batch 3 (audit-48 A-geometry section 4).
  id: 'bridge-folded-start-and-motion',
  files: ['src/engine/actors/Bridge.ts', 'src/engine/actors/KeyGate.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb72ae0 Bridge / KeyBridge block 0x7ff72bb76c59: count = int p0, dir = normalize(int p1, int p2), seg = int p4, headPush = int p5 > 0 -> FUN_7ff72bb4f630(obj, type 0, ...); if int p3 > 0: +0x518 = trunc(int p3 * (8 - N) * 0.1) (0x7ff72bb76d0d..0x7ff72bb76d5f, 8 - N unsigned); KeyBridge also sets +0x520 = 1',
    'FUN_7ff72bb4f9d0 (on add): type 0 segments start at the row point (base +0x130 = the row point), target row + dir seg (count - 1 - i); segment i < +0x518 starts at row + dir seg (m - i); type 1 (Gate) starts extended and targets the row cell',
    'FUN_7ff72bb4fea0: command 9 -> segment state 1, command 10 -> state 2; FUN_7ff72bb4f230: state 1 moves toward the target at DAT_7ff72bcff538 (1.0), state 2 back to the base at DAT_7ff72bcff4fc (0.5) via FUN_7ff72bb4f3e0 (2 units per tick at 1.0)',
    'FUN_7ff72bb4fe10 (KeyBridge slot 25): while +0x520 is set, once the actor named "Key" is held (key +0x408 != 0) it sends itself command 9',
    'FUN_7ff72bb4f630: the head segment with headPush (+1000 |= 4) pushes the bodies it meets (FUN_7ff72bb34f30)'],
  behavior: 'Every stage: a Bridge is a solid strip that starts folded into the one-cell nub at its row point (or pre-extended by trunc(p3 (8 - n) 0.1) cells), extends 2 units per tick when switched on and folds back to the nub at 1 per tick when switched off; a KeyBridge starts folded and extends once any key is held (was: deployed from frame 0 and removed by a key). A Gate is solid and shrinks to its row-point cell at 2 per tick when opened and grows back at 1 per tick when closed (was: instant hide / show). Growing stops for a frame instead of entering a live cat or push box; a head-push bridge (p5 > 0) shoves them along instead. Switch / mediator / key wiring unchanged. Deterministic: frame-counted. Not modelled: the 4-tick follower stagger (the strip stays contiguous either way).',
}, {
  // Teacher 2026-10-07 (1-4): "a character on the middle lift gets frozen in place when the moving door goes over them".
  id: 'native-movewall-rollback',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb667e0 (MoveWall update): the timer (+0x3fc) and the state machine advance first (state 2: offset += sign 2 until |offset| > |travel| -> state 3; state 3: offset += sign -1.5 after 1.5 s until offset travel <= 0 -> 0, state 1); then delta = offset - saved, and FUN_7ff72bc16f50(this, delta, 0, 0): on failure the offset is restored to the saved value (FUN_7ff72bb93150(pfVar1, local_res18)) and nothing moves (state and timer kept, retried next tick); on success the body moves (FUN_7ff72bb97ce0) and FUN_7ff72bb34f30(this, delta, side 2 / 3) displaces what it meets (FUN_7ff72bc17330, recursive)',
    'FUN_7ff72bc16f50 (chain test): for each body touching in the motion direction (FUN_7ff72bc13550), fail if that body touches a tile in that direction (FUN_7ff72bc137b0) or its own chain fails (recursive)'],
  behavior: 'Every stage: each MoveWall step is planned before it is taken: the cats and push boxes the wall would enter are pushed ahead of it (each pushes what it meets, recursively); if any of them would enter a tile, a Rect, a solid gate / bridge, a lift slab or another wall, or the wall itself would enter a lift slab or a solid, the whole step is undone (the wall waits; its state and timer keep running, as native) and it retries next tick. Bodies are moved only by a step that succeeds, so a cat is never left inside the wall. Was: the wall always advanced and shoved, leaving a cat pinned against the 1-4 ledge inside the wall (frozen).',
}, {
  id: 'weighted-lift-chain-test',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb64310 (WeightedLift family update): the step (0, d) is tested with FUN_7ff72bc16f50(this, step, 0, 0); only when it passes is the offset (+0x400) committed (FUN_7ff72bb31fc0) and the stack carried (FUN_7ff72bc17330); otherwise nothing moves this tick',
    'The port already applied this preflight to DarknessWeightedLift (FUN_7ff72bb62790)'],
  behavior: 'Every stage: a WeightedLift / Ex / Ex2 rising step is taken only if the slab and every cat or push box resting on it (transitively) can rise with it without entering a tile, a Rect, a MoveWall, a solid gate / bridge, another lift or another body; otherwise it waits this tick (a rider is never carried into the 1-4 wall or a ceiling). Descending steps keep descending-lift-stops-on-bodies.',
}, {
  // Fidelity audit 2026-10-07 batch 6 (Top 10 #4; audit-48 E-hazards section 1).
  id: 'thunder-beam',
  files: ['src/engine/actors/Thunder.ts', 'src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb4d330 (slot 12): p0 = direction (0 UP, 1 DOWN, 2 LEFT, 3 RIGHT; view rotation 0 / 0x8000 / 0xc000 / 0x4000); p1 != 0: no emitter cap and objects never shorten the beam; p2 != 0: the 32 x 32 aux body stays enabled',
    'First update 0x7ff72bb4d600 (once, +0x3e8 & 1): the aux body {-16, -16, 32, 32} (DAT_7ff72bcba2e0) is swept from the row point 2400 along the direction against the map (FUN_7ff72bc2fca0(world + 0x51760, ...)); L0 = 32 + the travel (+0x4d4, copied to +0x4cc / +0x4d0): the beam stops at the first solid chip, ending 16 inside it. Map chips the box overlaps at its start are not hits (the emitters sit inside walls)',
    'Every update: L = L0; FUN_7ff72bb4da00 (beam contact): players are listed; Thunder and the MagnetPlayer aux are ignored; ANY other body overlapping the beam (when p1 == 0) cuts L to the distance from the origin to its near edge, including the GuardPlayer shield (tag DAT_7ff72c62d0c0)',
    'FUN_7ff72bb4d850 (kill): a listed player overlapping the 4-unit beam of length L on two consecutive steps, with the whole +0x4e8 mask clear, gets command 5 (death); no other actor is killed',
    'FUN_7ff72bb4dc10 (draw): floor(L / 32) + 1 tiles 32 x 32 from atlas (160,400,32,32) / (192,400,32,32) (DAT_7ff72bcba170), x -16, from y -5 outward, the last cropped, the frame toggling every 0.1 s; the emitter cap {-16, -8, 32, 8} from atlas (192,436,16,4) (p1 == 0 only)'],
  behavior: 'Every Thunder: its beam is as long as the native sweep (to the first solid map chip, ending 16 inside it; 2432 when nothing is hit), not a fixed 2400; bodies in its path still cut it each frame (now including guard shields); it is drawn as the native animated orange zigzag along its live length with the orange emitter cap, rotated to its direction (was: a small yellow bolt icon). The kill latch is unchanged (it already matched).',
}, {
  // Fidelity audit 2026-10-07 batch 7 (audit-48 G-players section 2).
  id: 'guard-shields',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb72ae0 GuardPlayer branch 0x7ff72bb72de7: a normal avatar, then for each extra param p1, p2, p3 present a guard object FUN_7ff72bb56990(guard, avatar, dir) added to the scene',
    'FUN_7ff72bb56990: shape = {UP: 1, DOWN: 1, LEFT: 0, RIGHT: 0} (offline table); body DAT_7ff72c62d050[shape] = {-3, -30, 6, 60} (vertical) / {-24, -3, 48, 6} (horizontal) (memory image), FUN_7ff72bc16bf0(..., 0, 1) with +4 = 2: a contact body, not a floor; colour = the owner colour (+0x404)',
    'FUN_7ff72bb56c10 (update): position = the owner transform + DAT_7ff72c62d030[dir] = UP (0, -56), DOWN (0, 10), LEFT (-28, -24), RIGHT (30, -24); it copies the owner visibility; no button anywhere: the shield is always on and the guard moves and jumps normally'],
  behavior: 'GuardPlayer rows (4-1, 12-1): each extra direction param gives the cat an always-on shield plank (6 x 60 beside it for LEFT / RIGHT, 48 x 6 above or below it for UP / DOWN) at the native offset from its row point, drawn in its colour; a plank cuts a Thunder beam like any other body, so it protects whoever is behind it. Was: holding JUMP made the guard alone immune and froze it, with no plank. Ambiguous: the offset is applied unmirrored (the owner transform copy may include its facing flip; not traced), and the plank is not solid for cats (contact body).',
}, {
  // Fidelity audit 2026-10-07 batch 16 (audit-48 E-hazards sections 2-4).
  id: 'step-enemy-native',
  files: ['src/engine/actors/StepEnemy.ts', 'src/engine/actors/UpDownEnemy.ts', 'src/engine/actors/BowwowEnemy.ts', 'src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['StepEnemy FUN_7ff72bb6c6c0: body DAT_7ff72c62d250 = {-24, -13, 48, 26}, mode 3 (moving physical body); view {-25, -14, 50, 28} from atlas (358,8,25,14); FUN_7ff72bb6ca10: p0 < 0 -> direction -1, otherwise the ctor default +1 (RIGHT)',
    'FUN_7ff72bb6cbe0 (update): vx = direction * DAT_7ff72c61f5e0 (1.0 per tick, the unit of its 0.65 per tick gravity DAT_7ff72bcb69bc); no ground below -> vy += 0.65, else vy = 0',
    'FUN_7ff72bb6ce10 (contact): a wall contact with a horizontal normal reverses it; a side contact with a player kills the player (command 4); a contact from above sends command 0 to the player (effect not traced) and does not hurt either',
    'UpDownEnemy FUN_7ff72bb6d170: sensor DAT_7ff72c62d260 = {-28, -22, 56, 48}; view {-30, -26, 60, 52} from atlas (385,0,30,26); motion FUN_7ff72bb6d5c0 unchanged (already matched)',
    'BowwowEnemy FUN_7ff72bb38ba0: sensors {-30, -39, 60, 78} (DAT_7ff72c61f358); FUN_7ff72bb39180 picks the candidate with the largest 30-frame average movement (FUN_7ff72bb67b10(player, out, 0x1e) averages the ring of per-frame deltas)'],
  behavior: 'StepEnemy (5-1, 5-3, 7-2, 7-3, 7-4, 12-4): the native 48 x 26 body centred on its row point, falling at 0.65 per tick until it stands on a chip or a solid, walking 1 unit per tick (60 per second; was 100) to the right unless p0 < 0, turning back at walls (it walks off ledges); a side contact kills a cat, a cat from above is safe (unchanged). UpDownEnemy (5-1, 5-3, 7-3): the native 56 x 48 sensor {x-28, y-22}. BowwowEnemy (7-1): the native 60 x 78 sensor, and it wakes / chases on each cat\'s 30-frame average movement (was: one frame of velocity). Sprites: the atlas slug and spike for StepEnemy / UpDownEnemy; the Bowwow art is not decoded (a dark 60 x 78 placeholder). Not modelled: a StepEnemy reversing on a body, standing on a StepEnemy, Bowwow state 4.',
}, {
  // Codex batch-5 must-fix: guard planks, beam cut and kill judged on one frame's state.
  id: 'thunder-frame-order',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb56c10 (the guard object update) places the plank from the owner transform (+0x3f0 -> +0x44) in the actor update pass, before the shared body/contact pass in which FUN_7ff72bb4da00 (Thunder beam contact) cuts L against bodies and lists players',
    'FUN_7ff72bb4d850 (Thunder slot 27) then kills only listed players overlapping the beam of that same L: the plank, the cut and the kill all read one frame of body positions; Thunder slot 25 (0x7ff72bb4d600) only shifts the +0x4e0 / +0x4e4 / +0x4e8 latch and toggles the frame'],
  behavior: 'Thunder stages with GuardPlayers (4-1, 12-1): planks are refreshed after every cat and body has moved this frame, and the beam cut, the drawn length and the kill judge all use those same positions (was: the plank was placed and the beam cut at the start of the frame, before the cats moved, so a guard walking into a beam left the beam at its old length for one frame and the cat behind it could die on the second contact). Thunder kills are judged for the same cats as before (those that reached the contact checks this frame), after the per-cat loop instead of inside it.',
}, {
  // Fidelity audit 2026-10-08 batch 6 (solvability harness: 7-1 BLOCKED by BowwowEnemy).
  id: 'bowwow-chase-stops',
  files: ['src/engine/actors/BowwowEnemy.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb39180 (update) picks the in-range cat (|dx| < 300 asleep DAT_7ff72bc7daa8, else < 400 DAT_7ff72bc7da00) with the largest FUN_7ff72bb67b10(cat, out, 0x1e) movement, and only when that movement is strictly above 0.0 (best starts at 0.0, strict compare): a cat whose 30-frame mean displacement is zero is never a target',
    'States (+0x3f8): 0 sleep (bob, Zzz) -> 1 on any target; 1 -> 2 (warn) when best > 1.5 (DAT_7ff72bc7d1ac); 2 -> 0 with no target, -> 3 (wake) when best > 2.5 (DAT_7ff72bcb74c4); 3 steers v = normalize(cat - (dog + (0, 64 DAT_7ff72bc7d1b8))) * speed (+0x40c, p0) only while it has a target, and adds v to its position EVERY tick, target or not; it never returns to sleep',
    'Contact FUN_7ff72bb39680 (fixture category 7, rect {-30, -39, 60, 78} DAT_7ff72c61f358): a category-1 (cat) contact gets command 4 (death), and a dog in state 3 enters state 4, which only keeps adding the last v (no more steering)'],
  behavior: 'BowwowEnemy (7-1): a cat standing still (zero 30-frame mean movement) no longer wakes or steers the dog, and a warned dog goes back to sleep when every cat in range is still; a dog that is already chasing keeps flying straight along its last heading while the cats are still (it steers again as soon as one moves), and after it catches a cat it only drifts along that heading (state 4) instead of turning to the next cat. Was: any cat in range counted as a target even when still, and a chasing dog froze in place when the cats froze. The coordinator expectation "it stops when all cats are still" is not native: only a warned (state 2) dog gives up; the way through 7-1 is to keep each cat\'s 30-frame mean movement under 1.5 (sneak in short steps).',
}, {
  // Fidelity audit 2026-10-08 batch 6 (solvability harness: 2-2, 2-4, 10-1 BLOCKED by FallBox).
  id: 'fallbox-solid-while-armed',
  files: ['src/engine/actors/FallBox.ts', 'src/engine/actors/KeyGate.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb42d90 (body): the rect inset 2 (DAT_7ff72bcff5c0 = 2.0, DAT_7ff72bcb7d8c = -4.0), FUN_7ff72bc16bf0(..., 3), body+4 = 2; nothing in the update FUN_7ff72bb429b0 disables it except the horizontal on-screen gate FUN_7ff72bb42ff0: the box is solid unarmed, during the arm delay and while it falls',
    'Contact FUN_7ff72bb42fb0: ANY body or chip contact whose normal has y < 0 (something resting on its top) sets +0x6f4 |= 1 (armed): a cat, a push box or another FallBox',
    'FUN_7ff72bb429b0 (update): armed -> if t <= 0.22 (DAT_7ff72bcb8d20 = 0.22) t += dt and the box holds still; else FUN_7ff72bc13690(body, (0, 1.0 DAT_7ff72bcff538), 1) tests for a contact below: none -> vy += 0.65 per tick (DAT_7ff72bcb69bc, gravity, no cap), else vy = 0; the box lands on chips and bodies (cats too); vx is never written; nothing carries a rider (a cat on it falls by its own gravity)',
    'Despawn in the fall branch: the node y (the box BOTTOM, row-point anchored) > 2 * 720 / scale (DAT_7ff72bc7db90) -> FUN_7ff72bc11650 destroys it; there is no respawn timer (only a stage rebuild brings it back)'],
  behavior: 'FallBox (2-2, 2-4, 10-1 and every FallBox stage): an armed box stays solid while it waits 0.22 s and while it falls (was: it stopped being solid the tick it armed, so a cat dropped straight through it); it then falls under gravity (0.65 per tick per tick, uncapped; was a constant 0.65 per frame) and lands on chips, blocks, boxes, other FallBoxes and cats, starting to fall again if that support goes; a push box or FallBox resting on its top arms it too (was: cats only); it despawns when its bottom passes twice the view height (was: its centre), and never respawns. Its solid body is the native rect inset 2 on every side (the drawn box is unchanged), so a cat stands 2 lower on a FallBox than on its drawn top (2-2: on 336, level with the Rect blocks either side; was 334) and neighbouring boxes leave a 4-unit seam. FallBox bodies are resolved in the same pass as Rects and gates, and that pass sets a cat back on top of what it stands on before any side push, so it walks off a FallBox onto a level Rect (native: the down contact keeps vy 0, so the feet never dip below a level neighbour). A cat standing on it is not carried; it falls with the box under the same gravity.',
}, {
  // Fidelity audit 2026-10-08 batch 6 (solvability harness: 10-3 BLOCKED by DarknessWeightedLift).
  id: 'darkness-weighted-lift-tiles',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb62580 (setParams): the slab body is FUN_7ff72bc16bf0(this, {0, 0, p0, p1}, 2), a type-2 body: FUN_7ff72bc12490 moves a body whose type (+0x20) has bit 0 clear straight (pos += delta), never through the map sweep FUN_7ff72bc2fca0, and it never records a chip contact (its +0xa0 list stays empty)',
    'FUN_7ff72bb62790 (update): the 0.06 s freeze (0x3d75c28f) is refreshed by FUN_7ff72bc13690(body, DOWN, 1), which for this body can only see bodies below it; the offset step is committed only when FUN_7ff72bc16f50(this, delta, 0, 0) accepts it, and that test walks the slab\'s BODY contacts in the move direction (a contacted body blocks when it touches a chip that way or its own chain fails); the slab\'s own chip contacts are never consulted. The plain WeightedLift (FUN_7ff72bb63cf0 / FUN_7ff72bb64310) is the same'],
  behavior: 'DarknessWeightedLift (10-3; 10-4 unchanged): the slab is no longer stopped or frozen by map chips it passes through: only bodies under it freeze it, and only riders that would hit a chip (rising) or a static block block a step. 10-3 lift 2 now sinks past the row-144 chips (it stopped at y 96 after 48 of its 144); its riders land on those chips and the lift holds just below them, uncovering the door slot. Was: the port tested the slab itself against chips (freeze probe and step preflight). The plain WeightedLift branch already skipped the slab\'s chip test.',
}, {
  // Fidelity audit 2026-10-08 batch 6 (Codex batch-5 note: the 7-2 StepEnemy spawns inside a step chip and flips every frame).
  id: 'stepenemy-unspawn',
  files: ['src/engine/actors/StepEnemy.ts'],
  evidence: ['The Lua row is read correctly: stage_traffic_light01.lua { "StepEnemy", chipSize*20, chipSize*8, -1 } = (960, 384), p0 -1; map column 20 row 8 is MC_FLL (solid), so the native body {-24, -13, 48, 26} (DAT_7ff72c62d250) starts 24 x 13 inside that chip',
    'Native never pushes a body out of a chip. FUN_7ff72bc1da80 (world step) sweeps a moved body with FUN_7ff72bc12490(body, map, delta, 0, slide 1) -> FUN_7ff72bc2fca0: per moving axis FUN_7ff72bc304f0 first tests a face strip 0.5 (DAT_7ff72bcff4fc) past the leading face, cells floor(coord / 48) edges inclusive (every chip id >= 2 solid, DAT_7ff72bcc8a30): a hit zeroes that axis and records the contact (FUN_7ff72bb31cf0); the sweep itself only tests cells the box enters beyond its current extents (FUN_7ff72bc28390 / FUN_7ff72bc284a0) and stops 0.01 short of the cell boundary (DAT_7ff72bc7d45c); chips already under the box are never tested',
    'FUN_7ff72bb6cbe0: grounded = a down contact (FUN_7ff72bc13690(body, (0, 1), 1)) -> vy = 0, else vy += 0.65 per tick; FUN_7ff72bb6ce10 reverses only on a NEW contact with a horizontal normal (begin-contact, FUN_7ff72bc14040 re-checks it with the same face strip)'],
  behavior: 'StepEnemy (every stage; visible on 7-2): its chip collision follows the native face-strip rule instead of testing its whole next rect: the ground is the strip 0.5 under its bottom (a chip it already overlaps counts as ground), a wall is the strip 0.5 past its leading face, chips it already overlaps never block it, a fall stops 0.01 above the chip, and it turns only on a new wall contact. The 7-2 StepEnemy (spawned 24 x 13 inside the first step) now stands on that step, walks left off it after 25 ticks, drops about 35 to the floor and keeps walking left (was: it reversed every frame in place). Bodies (blocks, boxes, lifts, gates) keep the rect test, ignoring any it already overlaps.',
}, {
  // Fidelity audit 2026-10-08 batch 6 (solvability harness: 7-3 BLOCKED by the MC_D* chips).
  id: 'mc-d-tiles-solid',
  files: ['src/engine/chips.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['stage_common.lua: MC_DLU = 26, MC_DLD = 27, MC_DRU = 28, MC_DRD = 29 (MC_BR1..5 = 30..34)',
    'FUN_7ff72bc2fc00 (map ctor, from scene ctor FUN_7ff72bc1a070) sets map+0x40 = DAT_7ff72bcc8c40, map+0x48 = 9: chips 26..34 read that extension table; FUN_7ff72bc285c0 (inlined in FUN_7ff72bc281c0 / 28270 / 28390 / 284a0): chip < 26 -> DAT_7ff72bcc8a30[chip] = {0, 0, 1 x 24}, chip 26..34 -> ext = {3, 3, 3, 3, 1, 1, 1, 1, 1}; solid = attr & 1',
    'FUN_7ff72bc2fca0 (map sweep) tests only bit 0, the same in every direction: no one-way and no kill for any chip; bit 1 (set only on MC_D*) is never read by action-stage code. The only kill near these blocks is the UpDownEnemy sensor (FUN_7ff72bb6d780)'],
  behavior: 'MC_DLU / MC_DLD / MC_DRU / MC_DRD (the red 2 x 2 blocks the UpDownEnemy hides in on 5-1, 5-3, 7-3): solid blocks like any other chip, still drawn red; touching them no longer kills (was: non-solid tiles that killed a cat on a guessed directional rule, a 96-wide death pit). Cats can stand on the block while the enemy is down; the enemy\'s own sensor still kills. A StepEnemy walking into the block now turns back.',
}, {
  // Fidelity audit 2026-10-08 batch 6 (solvability harness: 3-4 BLOCKED by a push box hanging off a ledge).
  id: 'pushbox-general-fall',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/PushBox.ts'],
  evidence: ['PushBox vtable PTR_FUN_7ff72bcb68c0 slot +0xc8 = FUN_7ff72bb33890, installed by every PushBox ctor (FUN_7ff72bb334f0 / FUN_7ff72bb33600) and the Normal / Small / Tall / Big ctor FUN_7ff72bb333d0: no stage test anywhere',
    'FUN_7ff72bb33890 (every tick): vx = 0, then the push rule may set +-1.0 (DAT_7ff72c61f320); no contact with normal (0, 1) below (FUN_7ff72bc13690(body, (0, +1), 1), any body or chip, the whole bottom edge) -> FUN_7ff72bb34c40(a, 0, 0.65) adds 0.65 (DAT_7ff72bcb69bc) to vy; else vy = 0. No maximum fall speed (the 19.5 cap DAT_7ff72bcbdf88 is the Player\'s FUN_7ff72bb67da0 only)',
    'Nothing in FUN_7ff72bb33890 or its callees moves x except the +-1.0 push: there is no snap into a box-wide gap; a box drops into a one-chip gap because the push moves it 1 unit per tick, so it cannot skip the first position where nothing is under it. The world sweep FUN_7ff72bc12760 lands it flush (0.01 margin)'],
  behavior: 'Every stage: an unsupported push box (PushBox and the Normal / Small / Tall / Big family) falls at the native 0.65 per tick per tick with no speed cap, as soon as nothing is under its whole bottom edge, and lands flush (was: only on stage_jump02 or for the box family; elsewhere a box pushed off a ledge hung in the air unless it fitted a box-wide gap, under 980 / s^2 capped at 600 / s, with a centre tip-over rule). The box-wide-gap snap is removed (not native). Because the port pushes a box by the pusher\'s whole step (about 4.9 per frame, native: 1 per tick), a push step now stops at the first unit where the box loses all support, as the native 1-unit steps would. Floating spawns drop from frame 0 (10-3 box onto row 192, 10-4 onto 240, 12-1 onto Rect 302.4); a DamageRect under a box supports it like any body (the 4-2 BlockRoad plug rests on its lower DamageRect, FUN_7ff72bb3e730). A push step also ends flush against a wall it would hit (native 1-unit steps end at contact; was: the whole step was refused, leaving the box up to a step short). The support and fall tests use the native body\'s x extent (FUN_7ff72bb340f0: the rect inset 1 on each side), so 10-4\'s 96-wide box drops into the 95.52 gap beside DarknessRect 2. Not modelled: the body\'s 1-unit vertical inset and the native 1-unit-per-tick push speed.',
}, {
  // Fidelity audit 2026-10-08 batch 7 (solvability harness: 4-4 BLOCKED, a growing cat shoved its rider off).
  id: 'scaleswitch-carry',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['ScaleSwitch update FUN_7ff72bb5f550: while pressed by a cat (contact category 1) it sends command 0x21 with its rate (p0, +-0.015 per tick on 4-4) to that cat every tick',
    'Player command 0x21: rate <= 0 only resizes (FUN_7ff72bb679c0); rate > 0 reads body 0\'s world box (FUN_7ff72bb70550) before and after the resize, and with dh = h_after - h_before, dw = (w_after - w_before) * 0.5 (DAT_7ff72bcff4fc) calls FUN_7ff72bb34f30(player, (0, -dh), up), (+dw, 0) right and (-dw, 0) left',
    'FUN_7ff72bb34f30 -> FUN_7ff72bc17330 (params _DAT_7ff72bcb6220 = {1, 0, 1, 0}, mask 2): every cat contact (category 1 only, so not push boxes) whose normal is that direction is moved by the delta with FUN_7ff72bc16780 (position += delta, no map sweep, body synced, recursing into the moved cat the same way, visited set of 100); velocity and grounded state are untouched'],
  behavior: 'ScaleSwitch (4-4): while a cat grows, every cat standing on its head (and the whole stack on that cat) rises with it by the height gained, and cats touching its sides are pushed out by half the width gained, recursively; no map test (native moves them directly). Was: the rider overlapped the grown head and was shoved off sideways. Shrinking moves nobody (a rider just drops), and push boxes are never lifted by growth.',
}, {
  // Fidelity audit 2026-10-08 batch 7 (solvability harness: 2-4 and 3-2 BLOCKED on the JumpStand launch).
  id: 'jumpstand-launch',
  files: ['src/engine/actors/Player.ts', 'src/engine/actors/PushBox.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['Factory: JumpStand builds the launch vector (0, p0) (0x7ff72bb7495c..6c), JumpStandEx (p0, p1) (0x7ff72bb749f1..a10); ctor FUN_7ff72bb649a0: body {-16, -34, 32, 34} (DAT_7ff72bcbd960) mode 3, category 5, which the Stage contact matrix pairs with cats (1) and boxes (2): a solid block cats and boxes stand on; no gravity',
    'Update FUN_7ff72bb64c70 (every tick, no cooldown, no extra sensor): every body touching its top (FUN_7ff72bb40af0(body, up, ..., mask -1)) that has nothing on its own top (FUN_7ff72bc132c0(other, up, 0, 0, -1) == 0) gets command 0 with the vector; a cat gets x forced to 0 (0x7ff72bb64da1)',
    'Player strategy FUN_7ff72bb6fd20: command 0 is taken only while the hold-ramp counter (ctrl+0x14) is 0; FUN_7ff72bb6f0e0 then sets vy = p_y after gravity (the first tick moves exactly p_y), the counter stays 0 (no held-jump ramp), a jump press that tick is ignored, and a later press keeps vy when it is already below the -5.1 jump speed (counter 0xe: no ramp)',
    'PushBox family (vtable PTR_FUN_7ff72bcb68c0 +0x98 = FUN_7ff72bb33d00): stores (|x| * sign(current vx, 0 -> +), y) at +0x7e8 with flag 1; FUN_7ff72bb33890 sets vy = launch.y on the ground, then while airborne with nothing on its top adds launch.x to vx every tick; the stored launch clears on landing'],
  behavior: 'JumpStand / JumpStandEx (1-1 ... 12-x; blocking 2-4 and 3-2): the stand is a solid 32 x 34 block for cats and boxes (was: walk-through, boxes fell into the 2-4 gap). Every tick, a cat or push box resting on its top with nothing on its own head is launched: a cat straight up at p_y per tick with no held-jump boost, its first tick moving the full p_y (the port lost that tick: a -10 stand rose 71 instead of the native 82); a box up at p_y with the stand\'s sideways component (JumpStandEx) pushing it each tick while nothing rides it (2-4: the -18 / 3 stand throws a box about 258 up and onto the floor east of the gap). A cat or box with something on its head is not launched (a loaded stand is a pedestal), and a coyote jump right after a launch keeps the launch speed. Was: only a falling cat in the top 8 was bounced, after its move, and boxes never.',
}, {
  // Fidelity audit 2026-10-08 batch 7 (solvability harness: 2-1, 2-3 BLOCKED by the rope).
  id: 'distance-constraint-native',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Factory 0x7ff72bb75e9a, ctor FUN_7ff72bb3f3a0 (no body); slot 12 FUN_7ff72bb40be0: N = party size, maxDist = p[2N - 4], w = p[2N - 3] (the hanging weight); links bind neighbours in player order (i, i + 1)',
    'Update FUN_7ff72bb3f580 (slot 25): nothing while any player is in state 1 or 3; per player the far-side loads L / R (FUN_7ff72bb40380 / FUN_7ff72bb40570: W = (0, (stackAbove + 1) * w) when unsupported, plus, walking every link out to the chain end, unit(p_neighbour - p) * (stackAbove + 1) for each link that is stretched (FUN_7ff72bb407a0 returns 0 for a slack link, which does not stop the walk), stackAbove = FUN_7ff72bc132c0(body, up, 1, 0, -1)) and the count of unsupported neighbours out to the chain end (0 as soon as one is supported); c_i = pair(i, i - 1) + pair(i, i + 1) (FUN_7ff72bb3fce0)',
    'pair FUN_7ff72bb3ffe0: nothing unless len > maxDist (a rope); n = d / len; share = (s2 + 1) / (s1 + s2 + 2), s1 = max(0, -n.selfFar), s2 = max(0, n.otherFar) (1 when the partner is in state 4); c = n * (len - maxDist) * share * 0.2 (DAT_7ff72c61f374); blocked redirects from the tile-contact normals (FUN_7ff72bc137b0): a blocked side turns x into y, a blocked ceiling turns y into x, a blocked floor turns y into x (x k = min(1, 1.2 / (count + 1)) under the cmd-0x29 latch, DAT_7ff72c61f37c); sgn(0) = +1',
    'Post rules: latch and opposing velocity -> c.x = -sgn(v.x) (|v.x| - 0.1); an upward pull weaker than gravity (c.y > -0.65, DAT_7ff72bcb69bc) on a grounded cat is dropped; |c.y| <= 20.15 (DAT_7ff72bcb86e8); every c is computed first, then applied: position += c and velocity += c (FUN_7ff72bb97db0 / FUN_7ff72bb93620), riders carried (FUN_7ff72bc17330); the moved body reaches its world position only through the world step\'s tile sweep with slide (FUN_7ff72bc17ca0 -> FUN_7ff72bc1da80 -> FUN_7ff72bc12490), so a rope never pulls a cat into chips',
    'WarpAll (FUN_7ff72bb63060 -> cmd 7 -> FUN_7ff72bb6fd20 -> msg 0x14 to "Key" -> FUN_7ff72bb65700): a carried key is released and eases home (FUN_7ff72bb65430); the port already matches (unchanged)'],
  behavior: 'DistanceConstraint rope (2-1, 2-3): the pull is the native rope: only when a link is stretched past its length, split by anchoring (a hanging cat gets a third, the standing partner two thirds, weighted by the stack above and the hanging weight w), all corrections computed first and then applied, each moved through the tile sweep (a cat is never pulled into a wall, bar or roof; a blocked pull turns sideways or down as native does), velocity changed by the same amount, riders carried, a grounded cat ignoring an upward pull weaker than gravity, and the whole rope idle while any cat is dying. Was: equal halves applied link by link with no tile test (cats were pulled into the bar / roof tiles), no hanging share, the cmd-0x29 velocity clamp with the wrong sign. WarpAll dropping a carried key back home is native (unchanged).',
}, {
  // Codex batch-7 must-fix: a carrier stopped on the lift edge counted for the lift while its head boxes were carried into it.
  id: 'lift-load-carry-agree',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb64310 (WeightedLift update) counts its load with FUN_7ff72bc132c0(body, up, recursive, mask 6) over the slab\'s own support contacts and carries exactly that contact set with FUN_7ff72bc17330 (recursive, one visited set): what counts is what rides, and a stack rides only through the body under it',
    'Browser adaptation: a body is taken as supported by the slab when the centre of its feet is over the slab (a narrow Ex2 slab still carries a cat wider than it); a body only touching the slab corner while standing on a ledge is not on the slab'],
  behavior: 'Weighted lifts (every family): a cat or box counts toward a lift, and is carried by it, only when the centre of its feet is over the slab; the cats and boxes on its head count and ride through it. A push box on a cat\'s head is carried by a lift only when that cat itself was carried (moved by the lift\'s delta this frame). Was: a cat touching the slab by 1 unit while stopped by a ledge counted (the lift moved) and its head boxes were moved by the lift into the stopped cat (2-4 lift edge).',
}, {
  // Fidelity audit 2026-10-08 batch 8 (solvability harness: 5-2 / 5-4 SKIPPED, MultiPlayer Unimpl).
  id: 'multi-jump-relay',
  files: ['src/engine/actors/Player.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['Factory 0x7ff72bb735d3 -> 0x7ff72bb76f17: MultiPlayer is ONE normal avatar (FUN_7ff72bb66e50) shared by the whole party; p1 (int) -> avatar+0xc90 = jumps per airtime (5-2: 2, 5-4: 10; < 1 = unlimited); p0 = facing',
    'FUN_7ff72bb68290(av, -5.1, 3.0): +0x3f8 |= 2 (air jumps allowed), input source 3, relay component +0x17e0 (FUN_7ff72bb58c40) with jump speed -5.1 and move speed 3.0 (the ordinary 300 px/s, FUN_7ff72bb687e0 reads +0x195c); then +0x3f8 |= 4 (turn passing)',
    'Relay FUN_7ff72bb58db0 every frame: turn slot +0x178 (starts at the avatar spawn input slot), holder slot +0x174 (-1); only a JUMP press edge from the turn slot counts (FUN_7ff72bc18f10(inp, 2, +0x178)) and makes holder = turn (even while the previous jumper still holds); LEFT / RIGHT / DOWN are read from the holder OR the turn slot (FUN_7ff72bb59000), nobody else controls anything; the holder releasing JUMP -> holder = -1; landing (cmd 0x17, FUN_7ff72bb58d60) also resets the holder',
    'Jump rule FUN_7ff72bb6f0e0: ground contact -> ctrl+0x18 = 0; flag 2 skips the ground / coyote test; a jump starts on the press edge when (c90 < 1 || ctrl+0x18 < c90) and no JumpArea launch is pending; each jump ctrl+0x18++ (the ground jump counts), sets vy = -5.1 and runs the 13-frame hold boost read from the holder (already rising faster than -5.1: vy kept, no boost); then FUN_7ff72bb67670(av, (+0x400 + 1) % n), n = party size, recolours the cat to palette[turn]; a head already touching a ceiling uses the count but does not pass the turn; landing does not reset the turn',
    'HUD FUN_7ff72bb702d0: draws remaining = c90 - ctrl+0x18 above the cat (y - 96)',
    'Command 9 with input source 3 doubles c90 (0x7ff72bb699ca..db); a Switch whose target is actorName + label (5-2: two "MultiPlayer1" pads) sends it on its press edge: 2 -> 4 -> 8'],
  behavior: 'MultiPlayer (5-2, 5-4): one cat shared by the party, played as a jump relay. The cat may jump in mid air up to its jumps-per-airtime count (5-2: 2, doubled by each "MultiPlayer1" switch to 4 and 8; 5-4: 10; reset on touching ground); only the player whose turn it is can start a jump, and every jump passes the turn to the next player (round robin over the party, the cat recolours to that player). The player who pressed jump holds the hold-boost; walking is controlled by that holder and by the turn player together. A remaining-jumps number floats above the cat. Was: whoever held jump took all input, nobody else could even walk, and only one ground jump per airtime.',
}, {
  // Fidelity audit 2026-10-08 batch 8 (5-2's pits were uncovered: the port centred the JumpArea sensors).
  id: 'jumparea-top-left',
  files: ['src/engine/actors/JumpArea.ts', 'src/engine/actors/Player.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['JumpArea setParams FUN_7ff72bb361a0: sensor {0, 0, p0, p1} -- the top-left corner at the row point (the port centred it)',
    'Begin-contact only (FUN_7ff72bb36340) sends command 0 with (p2, p3)',
    'Player strategy FUN_7ff72bb6fd20 ignores command 0 while the hold counter ctrl+0x14 != 0 (frames 1..13 of a jump); otherwise FUN_7ff72bb6f0e0 sets vy = p3 once on the next update (jumping blocked that frame) and overrides vx with p2 every frame until landing (steering ignored)'],
  behavior: 'JumpArea (5-2): the launch sensor hangs from its row point (top-left corner), so the five areas sit under the three pits as nets that throw a fallen cat back up and out (vy -18 per tick, vx -4 / -8 / -12 per tick until it lands). A cat entering the area during the first 13 frames of a held jump is not launched. Was: centred on the row point (half of every pit uncovered) and the launch speed was replaced by steering on the next frame.',
}, {
  // Fidelity audit 2026-10-08 batch 8 (solvability harness: 5-1 / 5-3 SKIPPED, MajorityPlayer Unimpl).
  id: 'majority-player',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Factory branch 0x7ff72bb736e3: FUN_7ff72bb774a0(ctx, pos, scene, mode 4) spawns ONE normal avatar on the first slot (spawned-player counter 1, no per-player controller); n = numPlayers (DAT_7ff72c629fa8+0xcc08) = party size; ratio = clamp(ceil(0.7f * n) / n, 0.1, 1.0) (0.7 DAT_7ff72bcb77b0, ceil import 0x7ff72bc7c5d8, clamp FUN_7ff72bae6bf0; n == 0 -> 1.0 DAT_7ff72bcff538)',
    'FUN_7ff72bb68220(avatar, n, ratio): vote block +0x1530 (FUN_7ff72bb7fec0), input source +0x1528 = 1, body colour +0x378 = 0xffbfffdf (neutral)',
    'Tally FUN_7ff72bb7ffa0 every tick before physics (from FUN_7ff72bb690d0): prev = cur; for buttons 0..11 count slots p < n holding b (FUN_7ff72bc18c90); bit set when (prev clear and frac >= ratio) or (prev set and frac >= 0.5 * ratio) (DAT_7ff72bcff4fc); progress = clear: min(frac / ratio, 1), set: min((frac - r/2) / (r/2), 1)',
    'press = cur & ~prev (FUN_7ff72bb80150), release = prev & ~cur (FUN_7ff72bb801a0), held = cur (FUN_7ff72bb80110); the avatar readers FUN_7ff72bb68300 / 68510 / 68640 take the source-1 path (voted bits only); buttons 2 jump, 3 up, 4 down, 5 left, 6 right; right is checked before left (FUN_7ff72bb6f0e0)',
    'MajorityController (branch 0x7ff72bb747d3, ctor FUN_7ff72bb65df0, player p0 via FUN_7ff72bb78680) is HUD only: FUN_7ff72bb65f80 copies progress of [3, 4, 5, 6, 2]; draw FUN_7ff72bb660c0: pad {-82, 0, 164, 84}, per value > 0 an orange 0xffff864d bar from the bottom; bars up (-54, 12.5, 28, 16), down (-54, 52.5, 28, 16), left (-69.5, 28.5, 16, 24), right (-29.5, 28.5, 16, 24), jump (24.5, 20.5, 43, 40)',
    'Nothing majority-specific in goal / key / respawn: the single cat is the whole roster (its door entry clears the stage); the port\'s floor(n / 2) + 1 goal rule has no native source'],
  behavior: 'MajorityPlayer (5-1, 5-3): one neutral-coloured cat shared by the party, steered by a vote. Every tick each button (jump, up, down, left, right) is counted over the party\'s n input slots (a missing player abstains): it turns on when at least ceil(0.7 n) players hold it (2 of 2, 3 of 3, 3 of 4, 6 of 8) and stays on while at least half that ratio still hold it (1 of 2, 2 of 3, 2 of 4, 3 of 8); presses may be staggered. The cat sees only the voted buttons (a jump starts on the vote\'s rising edge, the hold boost reads the held vote; right beats left). The MajorityController is a screen-fixed pad drawing five orange progress bars. Was: one player (or anyone) drove the cat with no vote, a debug box for the pad, and an invented majority door rule.',
}, {
  // Fidelity audit 2026-10-08 batch 8 (12-1: the JumpSwitch only moved non-PushBox boxes and opened gates).
  id: 'jumpswitch-launch',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Ctor FUN_7ff72bb778f0: base Switch type 0 (FUN_7ff72bb5e8c0), bit 0x40 (momentary), no 0x100; vtable 7ff72bcbf6b0 +0x60 FUN_7ff72bb78cb0 stores (p0, p1) at +0x430 (12-1: (0, -9))',
    'Pressed by any body with fixture flag +0x20 & 2 and category 1-3 (cat, push box) overlapping the radius-12 sensor circle (FUN_7ff72bb5f1d0); the jump button plays no part',
    'FUN_7ff72bb5eef0: rising edge -> SE "switch" + fire (+0x108 = FUN_7ff72bb5f410); 0x40 clears pressed at the end of each update, so it fires once per new overlap and again after release + re-press',
    'Fire FUN_7ff72bb5f410 (0x7ff72bb5f4d8..f524): target by name (FUN_7ff72bc1bc80, "PushBox1"), else the toucher; a player (actor+0x70 == 1) gets command 1 with (0, p1), anything else command 0 with (p0, p1); the base fire\'s 9 / 10 to the target is ignored by a box',
    'PushBox receiver (vtable 7ff72bcb68c0 +0x98 FUN_7ff72bb33d00) cmd 0: +0x7e8 = (|x| * sign(vx), y), flag 1; FUN_7ff72bb33890: vy = launch.y with no rider check (hop 9, 8.35, ... apex ~66.9 after 14 ticks)'],
  behavior: 'JumpSwitch (12-1): a momentary pad pressed by any live cat or push box within 12 of its point (no jump press needed); each new press launches its labelled target ("PushBox1": the push box hops 9 per tick up, ~67 high, even with a cat on it; a named cat would be launched straight up), or the toucher when no target matches, and it fires again after release and re-press. It opens no gates, bridges or stopwatches. Was: only a cat pressing jump on it, once per stage, opening gates and moving only the legacy normal / small / colour boxes (never PushBox 1).',
}, {
  // Fidelity audit 2026-10-08 batch 8 (11-4: the DelaySwitch fired at once and never reset).
  id: 'delayswitch-countdown',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Ctor FUN_7ff72bb5f6d0: type 0, latched (no 0x40), bit 0x100 (the press itself sends nothing), +0x74 = 2; vtable 7ff72bcbc808 +0x60 FUN_7ff72bb5f960: delay = p0 (11-4: 10) at +0x434',
    'Update FUN_7ff72bb5f9c0: the press edge sets the countdown +0x430 = delay; while > 0 subtract dt; at <= 0 fire the label target with 9 (on, value +0x3fc) via FUN_7ff72bb5ebb0 once, set bit 4, zero the countdown; the base update clears pressed (bit 8): an empty pad pops up (0x100 suppresses the off message) and a body still on it is pressed again at once (fires every delay seconds)',
    'Draw FUN_7ff72bb5fa80: while counting, "%d" of (int)(t + 0.99) (DAT_7ff72bcbc918) at (x, y - 75) (DAT_7ff72bcbc91c), size 0x20, centred',
    'Pressers: cats and push boxes (the Switch contact categories)'],
  behavior: 'DelaySwitch (11-4): a press by a cat or push box starts a countdown of p0 seconds (10 on 11-4) drawn as a whole-second number above the pad; at zero it sends its "on" once (11-4: starts Lift 1) and pops up, and if something is still on it the countdown restarts at once; it never sends "off" and no longer counts as a latched opener holding gates or lifts. Was: it fired the moment it was touched (by the current cat only), stayed down forever, and showed no countdown.',
}, {
  // Fidelity audit 2026-10-08 batch 8 (5-1: the third Warp, row y 480 / h 96, covered the floor in front of the door).
  id: 'warp-sensor-top-left',
  files: ['src/engine/actors/Warp.ts', 'src/engine/actors/WarpAll.ts'],
  evidence: ['Warp ctor FUN_7ff72bb62ec0 builds its sensor with FUN_7ff72bc16bf0(actor, {0, 0, p0, p1}, 0, 1) -> FUN_7ff72bc12370, which stores the rect as given (x, y, w, h at +0x28..+0x34) -- the same call and the same {0, 0, w, h} form as the JumpArea sensor FUN_7ff72bb361a0 (jumparea-top-left: top-left at the row point)',
    'The engine rects are y-down top-left: the JumpStand body {-16, -34, 32, 34} (DAT_7ff72bcbd960) is the block standing ON its row point, from y - 34 to y',
    'Stage data: 5-1 stage_majo01 Warps at rows y 576 / 576 / 480 with h 96 on a 480-high map: top-left puts all three just below the map (pit catchers); a bottom anchor put the third one over the floor x 2256..2352 in front of the door (any cat walking to the door was warped back)'],
  behavior: 'Warp / WarpAll sensors hang down from their row point (top-left corner at the row x / y, w x h below it), like JumpArea. Was: the bottom-left reading of warp-sensor-origin (the sensor rose h above the row point), which on 5-1 turned the floor before the door into a warp.',
}, {
  // Fidelity audit 2026-10-08 batch 9 (10-2 BLOCKED: a cat cannot jump off a falling partner).
  id: 'jump-off-body-contact',
  files: ['src/engine/actors/Player.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb6f0e0 lines 220-237: a jump press is accepted on ANY contact below - chip or body - found by FUN_7ff72bc13690(body, DOWN, 1, 0); the 0.07 s coyote timer only covers having no contact at all',
    'FUN_7ff72bb67850 -> FUN_7ff72bb69dd0: a cat falls when it has no chip below and every body below it is a falling cat, so a rider falls with its carrier on the same tick, still touching it, and may jump off it at any point of the fall'],
  behavior: 'Every stage: a cat resting on another cat (or a push box) may jump even while that support is itself falling or moving (was: only while grounded or within the 0.07 s coyote time, so a rider on a falling partner could jump only in the first ~4 ticks of the fall). A cat landing on a falling cat takes its fall speed, so the two fall together still touching (native: the rider is unsupported and falls under the same gravity; was: the landing zeroed the rider speed and the carrier dropped away). This is how 10-2\'s pit under the slab is crossed: the carrier walks off the block with the rider on its head and the rider jumps from it mid-fall.',
}, {
  // Fidelity audit 2026-10-08 batch 9 (6-1, 6-2 BLOCKED: a pushed box slid out from under its stack).
  id: 'pushed-box-carries-stack',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Retail capture og-capture-2 (E1): a CAT resting on a pushed box rides it (box-on-box carry is not shown by the capture; it is inferred from the 6-1 / 6-2 designs below; the native code path was not located: FUN_7ff72bb34f30 -> FUN_7ff72bc17330 only shoves the LEADING side of a push, and the ColorBox update FUN_7ff72bb3b5e0 only sets its own vx)',
    'stage_push01.lua (6-1) builds a pyramid of six ColorBoxes ("階段作り", stair building: widths 62..32, heights 62..52) dropped onto a box pushed along the floor, and stage_auto_scroll01.lua (6-2) a leaning stair of 8 ColorBoxes pushed by its bottom box: both need the stack to ride the pushed box'],
  behavior: 'Every stage: when a push moves a box, the boxes and cats resting on it ride along by the same step (through the same stack-riding pass as a walking cat, one support per rider, never into a solid). Was: only cats on the pushed box were carried; boxes on it stayed put and the stack fell apart as the bottom box slid out (6-1 pyramid, 6-2 leaning stair).',
}, {
  // Fidelity audit 2026-10-08 batch 9 (6-1: the five-box stack hit the Rect underside at 160 by 2 units).
  id: 'colorbox-native-body',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['ColorBox body FUN_7ff72bb3c0c0: the collision body is the drawn rect shrunk 2 on every side (PushBox is shrunk 1, FUN_7ff72bb340f0); each box therefore adds h - 4 to a stack'],
  behavior: 'ColorBox push boxes (6-1, 6-2 and every colour stage): the collision rect is the drawn box inset 2 on every side (the drawing keeps its full size, so a resting box overlaps the floor by 2 and neighbours show 4 units of seam). 6-1\'s five-box stack now tops out at 178 and passes under Rect 2016..2208 (underside 160) with 18 to spare; 6-2\'s leaning stair settles to the native 8 x 44. Was: the full drawn rect (the 6-1 stack hit that Rect by 2).',
}, {
  // Fidelity audit 2026-10-08 batch 9 (10-2 BLOCKED: a cat landing on a rising RouletteLift froze inside it).
  id: 'land-on-rising-lift',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['A lift platform is a moving body: the world step resolves its contact with a cat landing on it and the lift carries its riders up with FUN_7ff72bc17330 (the same rider carry as every lift family); natively a rider is never left inside a rising platform',
    'Port: a cat falling onto a platform that rose this frame ends up to one tick of lift travel inside its top; resolveClosedGateCollision sees a previous bottom below the new top (not a landing) and restores the previous rect every frame (10-2 RouletteLift: feet 378.2 vs top 378.0, frozen with vy 0, never grounded)'],
  behavior: 'Every lift (WeightedLift family and RouletteLift): a cat that was above a lift top within 2 units last frame and now overlaps it is set on the top and grounded, unless standing there would put it into a chip or block above (then it is not moved) (was: a cat landing on a platform rising under it ended 0.2 inside it, could neither walk nor jump and kept the lift counting a rider for good: 10-2 roulette lifts).',
}, {
  // Batch 10 (coordinator + Codex disassembly; retail capture og-capture-2): native walk and push speeds.
  id: 'native-walk-and-push-speed',
  files: ['src/engine/actors/Player.ts', 'src/engine/actors/PushBox.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['Walk: the avatar ctor writes 3.0 at +0x41c (0x7ff72bb66efa); FUN_7ff72bb687e0 returns +0x41c * +0x418 (0x7ff72bb687fc..68804, +0x418 = 1.0 unless message 0x22 scales it); FUN_7ff72bb6f0e0 sets vx = +-3 per tick on a held direction (input masks 0x20 / 0x10), instantly, the same in the air; the 0.98 (DAT_7ff72bcbea28, 0x7ff72bb6f1de) only decays PRIOR momentum while avatar+0x3f8 bit 0 is clear (a rope yank), it is not an input scale',
    'Jump: the takeoff tick integrates (0, J) (xmm8 cleared at 0x7ff72bb6f1c1): no horizontal travel on the jump tick, +-3 again from the next tick',
    'Push: FUN_7ff72bb33890 (PushBox / BigBox / NormalBox / SmallBox, 0x7ff72bb33971) and ColorBox FUN_7ff72bb3b5e0 (0x7ff72bb3b690) set the box vx = +-1.0 (DAT_7ff72c61f320) per tick when enough bodies with vx > 0 press its face; the pusher keeps vx = 3 and the world sweep stops it at the box face, so it advances 1 per tick with the box',
    'Retail capture og-capture-2: walk 0.22..0.28 screen px/ms (/1.5 = 2.5..3.1 per tick), constant from the first sample, dead stop on release; E1 push: box -13 -> +31 screen px over 203..688 ms = 1.01 per tick, the pusher at the same rate'],
  behavior: 'Every stage: cats walk at the native 3 per tick (180 / s; was 4.9 per tick, 294 / s, the 0.98 decay misread as an input scale), on the ground and in the air, with no travel on the jump takeoff tick; a pushed box (every push-box family, ColorBox included) moves at most 1 per tick in total however many cats push it (one budget per box per frame), and every pusher stays flush against it (was: the box moved by the pusher\'s whole step, ~4.9). The collision-off cat and the MoveWall opposing-intent check use the same 3 per tick sideways. Not changed: ice sliding (native ice not decoded), rope coasting (the 0.98 decay after a rope yank), the box-against-box chain rule (native may block a box that meets another box; flagged, not changed).',
}, {
  // Batch 11 (decoded spec b11/spec-breakout.md): native breakout family (8-2, 8-4, 9-3), port fix 1 + 6.
  id: 'breakout-paddle-dome',
  files: ['src/engine/actors/BreakoutBall.ts', 'src/engine/sprites.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['Paddle = separate head actor FUN_7ff72bb6b070(ctrl, avatar, 0, 1) -> FUN_7ff72bb6b720: body FUN_7ff72bc16e00(ctrl, DAT_7ff72c62d1c0 = circle {0, 0, r 25}, 2), category 3, mass 100; update FUN_7ff72bb6b250 places it at the avatar position + (0, -34) * scaleY (DAT_7ff72c62d1d0[0]) every tick: a dome centred 34 above the feet, top 12 above the head',
    'Ball contact FUN_7ff72bae64f0 (n from the ball toward the other body): accepted when approaching; other mass >= 100 -> v_n\' = 2(d.n) - v.n with d = the other body\'s displacement this tick (+0xf8, FUN_7ff72bc16460), renormalised to 4 * scale; |v\'|^2 <= 1.19e-7 (DAT_7ff72bc7d458) -> v = -n + (0, 0.05) (DAT_7ff72bc7d460). Against the circle n is radial through the paddle centre',
    'Ball vs ball (both mass 1.0, ctor FUN_7ff72bae5cf0): the same contact function, plain elastic exchange along n',
    'Views: paddle {-25, -26, 50, 26} (DAT_7ff72c62d200[0]) from atlas (288, 464, 24, 12) (DAT_7ff72c61f570[0]); ball {-12, -12, 24, 24} from atlas (256, 512, 12, 12) player-bound / (272, 496, 12, 12)'],
  behavior: 'Breakout stages (8-2, 8-4, 9-3): every BreakoutPlayer carries a paddle dome, a circle of radius 25 centred 34 above its feet (12 above its head), that moves with the cat. A ball touching the dome bounces along the radial normal: hit left of the paddle centre goes left, right goes right, dead centre goes straight up; a resting ball touched by a cat launches along the dome normal at 4 per tick. The cat box stays a second contact surface with the same response (was: the box only, so every hit came off an axis-aligned face). Balls now bounce off each other (equal-mass exchange of the normal components; a ball left with no speed leaves along -n). The paddle and ball use their native atlas frames. Not modelled: the native positional separation of overlapping bodies (the port changes headings only, as before); ball-ball contact is resolved once per frame, not per native sub-tick.',
}, {
  id: 'breakout-ball-per-row',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['BreakoutPlayer factory FUN_7ff72bb72ae0 (0x7ff72bb73113) ALWAYS allocates the ball first, FUN_7ff72bae5cf0(0x4f8, 0) at row + (0, -120) (DAT_7ff72bcb74d8), then the avatar FUN_7ff72bb774a0(mode 0, arg5 = 1); the ball death callback (+0x4b0, LAB_7ff72bb786c0) is bound to that avatar',
    'When the party limit drops the avatar (0x7ff72bb7333f) the ball is still created and bound to the LAST spawned player (FUN_7ff72bb78650), whose ball count +0x420 is incremented; the avatar ctor FUN_7ff72bb66e50 starts +0x420 at 1'],
  behavior: 'Breakout stages: every active BreakoutPlayer row makes its ball, even when the party is smaller than the row count; the ball of a row with no cat belongs to the last cat spawned, which owns one more ball. 8-2 / 8-4 at party 2: 4 balls (P1 owns 1, P2 owns 3); party 4: one each; party 8: 8 balls. 9-3 always has 8 balls: party 2 P2 owns 7, party 4 P4 owns 5, party 8 one each. Was: one ball per spawned cat (2 balls at party 2).',
}, {
  id: 'breakout-loss-and-fail',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Lost ball: FUN_7ff72bae64f0 stops it on a top-face (n.y == 1) hit of any tile but BLK / BWL / BWC / BWR (unchanged in the port), 180-tick timer +0x4a8; at 0 it calls the owner callback LAB_7ff72bb786c0 -> avatar FUN_7ff72bb69440 cmd 3 and is removed',
    'FUN_7ff72bb69440 cmd 3: skipped if the scene is resolved; else +0x420 -= 1; at 0 the player gets flag +0x3f8 |= 0x10 (out). The cat does NOT die',
    'Stage fail FUN_7ff72bb7bbe0: while scene flag 0x40 is clear and not everyone is in the goal, if EVERY player is out (flag 0x10) the stage fails and restarts (scene flag |= 2)'],
  behavior: 'Breakout stages: each cat counts its balls (1 + the extra balls of party-limited rows); a lost ball takes one from its owner and a cat at 0 is out (it keeps walking and jumping). When every student cat is out and the key has not appeared, the stage restarts from its start (bricks, balls and cats; teacher cats are kept). 9-3 has no BreakoutKey, so the rule stays armed the whole stage. Was: losses were recorded and never read (losing every ball left the stage unwinnable with no restart). Not modelled: the native "or in state 1" alternative of the fail test (state 1 not identified).',
}, {
  id: 'breakout-key-hidden-until-clear',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['BreakoutKey row (0x7ff72bb7457a) builds the ordinary Key class FUN_7ff72bb64f20(0x558, 1), type 1, no params, and starts it hidden: FUN_7ff72bb65240(this, 0) turns its sensor and view off',
    'Key update FUN_7ff72bb65430 state 0: FUN_7ff72bc30790(map) = any tile 30..34 (MC_BR1..BR5) left anywhere; when none remains it activates at its spawn point as a normal 32 x 56 Key and sets scene flag 0x40 (disarms the lost-balls fail FUN_7ff72bb7bbe0)',
    'Then an ordinary Key: hangs at home, carried on touch, opens the Goal by the existing key / goal rule'],
  behavior: 'Breakout stages 8-2 / 8-4: the BreakoutKey is an ordinary Key, hidden and untouchable until no MC_BR1..BR5 brick is left anywhere on the map; then it appears at its spawn point, is carried like any key and opens the Goal (enter with UP); its appearance disarms the lost-balls restart. Was: a 24 x 24 pickup visible from frame 0 whose collection did nothing (the Goal never opened).',
}, {
  id: 'breakout-syncarea-inert',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['BreakoutSyncArea FUN_7ff72bb778c0 only drives online sync chunks (FUN_7ff72bae82a0); offline it has no body, no view and no clear rule'],
  behavior: 'Breakout stages: the BreakoutSyncArea row creates nothing (was: an invented 72 x 48 box at the map corner that cleared the stage when every cat stood in it).',
}, {
  // Codex batch-11 must-fix: broken bricks stayed broken across a restart / a second load of the same stage.
  id: 'stage-map-private-copy',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Native rebuilds the stage (and its map grid from the Lua table, FUN_7ff72bc27dc0) on every load and every fail restart, so chips a ball destroyed (FUN_7ff72bae7be0) are back on the next attempt; the shared stage data is never written'],
  behavior: 'Every stage: each load (and each breakout restart, which reloads) plays on its own copy of the map chip table; breaking chips (bricks, breakable chips) changes only that copy. Was: the runtime wrote into the shared stage table, so bricks broken on one attempt stayed gone on the restart and on every later load of that stage in the same session (a second 9-3 run stalled at frame 171).',
}, {
  // Batch 12 (decoded spec b12/spec-9-4.md): 9-4 BALL PARK, the BoundBall cannon.
  id: 'bound-ball-pitcher',
  files: ['src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['BoundBallPitcher factory 0x7ff72bb74b10 mode 0 -> ctor FUN_7ff72bb37d70: solid cannon body FUN_7ff72bc16bf0(this, DAT_7ff72bcb7320 = {-40, -18, 54, 40}, 3), category 4; ctor speed 5.0 (+0x3f0 / +0x3f4); params FUN_7ff72bb37f30: speed = p[N-1] * 0.1 (DAT_7ff72bc7d464), index N-1 (0x7ff72bb38064..82 via FUN_7ff72bb389b0); direction (sin a, -cos a) (FUN_7ff72bb933e0): 270 = left',
    'Update FUN_7ff72bb38130: the first update is skipped (+0x3ec); one child at a time, no timer: a gone child is cleared that tick and the next update spawns; spawn FUN_7ff72bb383e0 at pos + dir * 20 (DAT_7ff72bc7d1b0), velocity dir * speed, held for 0.5 s (DAT_7ff72bcff4fc)',
    'BoundBall ctor FUN_7ff72bb36d10 (setup FUN_7ff72bb36e40, update FUN_7ff72bb36ee0, msg FUN_7ff72bb37250, contact slot 31 FUN_7ff72bb37500): circle r 12 (DAT_7ff72c62add8), category 5, gravity +0x12c 0.65 per tick, mass +0x148 50 (cats 100 DAT_7ff72bcc7dc4, default 1.0 FUN_7ff72bc155e0); view 24 x 24 atlas (272, 496, 12, 12)',
    'Contact step 1: |vy| = sqrt(vy_prev^2 + 2 * 0.65 * (y - y_prev)) (DAT_7ff72bcb69bc, prev state +0x100 / +0x110, FUN_7ff72bc16120), sign kept; map chips: v\' = v - (1 + e)(v.n)n, e 1.0 (DAT_7ff72bcff538), a normal part < 1.2 (DAT_7ff72bcb7134) -> 0; a top-face landing (n.y == 1) -> 30-frame fade (+0x3f8 = 0x1e), velocity 0 (FUN_7ff72bb37d00), body off',
    'Actor contact, closing only: v1n\' = ((m1 - e m2) u1 + (e + 1) m2 u2) / (m1 + m2), e 1.2 (DAT_7ff72bcb7134) when N < 5 else 1.0, |v1n\'| < 1.2 -> 0; resting on a category 1 / 5 body with vy\' <= 1.19e-7 (DAT_7ff72bc7d458): +0x3fc++, update kills the ball at 2 (0 when N > 4, FUN_7ff72bb37af0) while |vy| ~ 0; grounded vx *= 0.95 (DAT_7ff72bcb7130) from the 2nd grounded frame (1st when N > 4); cats are never harmed (no avatar command)',
    'Port (b12 snapshot): 126-133 a 16 px ball under 980 / s^2 with jump -408 / hold 13; 10372-10428 the ball sat at the pitcher and jumped on player 0\'s jump button (native: no player input); 10448-10470 an invented missing-BallBox fade; 10498-10528 an invented side push / support; 1305-1309 a generic DeadBallPitcher (no cannon body, no speed params)'],
  behavior: '9-4 BALL PARK: the BoundBallPitcher is a solid cannon {x-40, y-18, 54, 40} (cats can stand on it) with the native barrel / base art. Its speed is 0.1 * p[N-1] (party 2: 3.16 per tick, party 4: 3.55; solo 5.0); after one skipped tick it fires one ball at a time from 20 px along its heading (left), held still and visible for 0.5 s, then flying; when that ball is gone the slot is cleared and the next tick fires again. The BoundBall is a circle of radius 12 falling 0.65 per tick per tick with no speed cap; bounces keep their energy (the vy fix). Map chips reflect it elastically (normal parts under 1.2 are dropped); landing on the top face of any chip (floor or ledge) stops it, it fades for 30 frames and is removed. Cats (mass 100), boxes and every other body (mass 1.0) bounce it only while it closes on them: off a still head it comes back at -0.467 of its speed (party 5+: -0.333), a cat jumping up into it adds a lot (10 vs a rising -10: -19.3). Two resting contacts (vy left ~0) on a head or box kill it (party 5+: the first; the native limit 0 is read as "after one resting contact", else a ball would die whenever |vy| passes ~0); on a head vx decays 0.95 per tick from the 2nd grounded frame. Cats are never harmed and never moved by it. Removed: the jump-button ball control, the invented side push and the invented missing-BallBox fade. Approximations: contacts are found by closest point on each chip / body rect at sub-steps of at most 4 px (native: the world sweep); the ball ignores its own cannon (it spawns inside the cannon body; native filtering not traced) and does not push cats.',
}, {
  id: 'ball-box',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['BallBox branch 0x7ff72bb7514d -> ctor FUN_7ff72bb53e10 (vtable PTR_FUN_7ff72bcbaf48): view {-24, -64, 48, 64} (DAT_7ff72bcb94c0), solid body {-22, -62, 44, 60} (DAT_7ff72bcb64f0) category 5, top sensor {-4, -66, 8, 10} (DAT_7ff72bcbb170); setup FUN_7ff72bb53ff0 pre-builds an ordinary Key (FUN_7ff72bb64f20) into +0x400',
    'Update FUN_7ff72bb54060: falls when unsupported, vy 0 grounded; breaking: a 40-frame countdown, alpha fade frames 30..20, then removed (FUN_7ff72bc11650)',
    'Sensor contact (slot 31 FUN_7ff72bb54330): |other.x - box.x| <= 5 (DAT_7ff72bc7d588) -> message 0xb; a reply > 0 starts the break and places the Key at (box.x, box.y - 30) (DAT_7ff72bcb4ee8); only the BoundBall answers 0xb (FUN_7ff72bb37250: 30-frame fade, velocity (0, 3.0) DAT_7ff72bc7eb00, body off, x = box x, reply 1); the player handler FUN_7ff72bb69440 never handles 0xb',
    'Port (b12 snapshot): 919-923 / 12441 a centred 48 x 48 NormalBox with no sensor that never broke and held no Key (the Goal could never open)'],
  behavior: '9-4 BALL PARK: the BallBox is a solid 44 x 60 body standing on its row point ({x-22, y-62}), falling when unsupported (it settles 3 px onto the floor; the fall uses the box-family 0.65 per tick per tick, the BallBox constant is not decoded). A BoundBall touching its 8 x 10 top sensor {x-4, y-66} with its centre within 5 of the box x breaks it: the ball drops into it (velocity (0, 3), fading for 30 frames), the box fades out over its 40-frame break (alpha from frame 30 to 20) and is removed, and an ordinary Key appears at (box x, box y - 30), carried like any key and opening the Goal by the existing key rule. A ball crossing the sensor off-centre (more than 5 away) just bounces off the box. Cats never break it (standing on it does nothing). Was: a centred 48 x 48 NormalBox that never broke and held no Key. The Key is created when the box breaks (native pre-builds it off-scene in +0x400 and adds it then: the same thing on screen).',
}, {
  // Batch 12 (decoded spec b12/spec-9-2.md): 9-2 seesaw stage.
  id: 'seesaw-and-balance',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Seesaw / SeesawParent ctor FUN_7ff72bb5d420(obj, p0) (SeesawParent FUN_7ff72bb77b30 ignores p1 / p2): plank rect from LAB_7ff72bcbc230[p0] = {-300, -10, 600, 20} / {-300, -10, 450, 20} / {-150, -10, 450, 20} about the pivot (the row point); setup FUN_7ff72bb5d700: one dynamic Box2D box (density 1, friction 1, restitution 0, gravity scale 0), revolute joint limits +-0.1745 rad (DAT_7ff72bcbc478 / DAT_7ff72bcbc470); NO engine collision body (no FUN_7ff72bc16bf0): cats and boxes never touch a plank',
    'Children with p1 = 1: gear joint ratio -1.0 to the parent (FUN_7ff72bb5d9e0, FUN_7ff72bbe7210, DAT_7ff72bcff6a8) = they copy its angle; SeesawParent update FUN_7ff72bb5da90: angular velocity = (target - angle) / dt, target +0x930 from message 0xc (FUN_7ff72bb5db00); draw FUN_7ff72bb5d870 rotated (angle * 10430.378)',
    'Balance ctor FUN_7ff72bb313f0(obj, 900.0), setup FUN_7ff72bb31900: two pans, body {-97, -7, 194, 14} (DAT_7ff72c62ada0) solid, at x -/+ p0 * 0.5 (DAT_7ff72bcff4fc); pan update FUN_7ff72bb31050: count FUN_7ff72bc132c0(pan, UP, 1), at most +0x400 px per tick toward +0x3f8 with the move check FUN_7ff72bc16f50 and rider carry FUN_7ff72bc17330',
    'Balance update FUN_7ff72bb315f0: r = clamp((R - L) / (N * 0.5), -1, 1); amp = sin(0.12217) * 450 = 54.84 (DAT_7ff72bcb6210); |r| > 1.19e-7: targets -r * amp / +r * amp, else 0; speed max(|r|, 0.2) (DAT_7ff72bc7d858), 0.2 when a pan moves against the imbalance; angle = atan2(s * max(|L|, |R|), 450) with s = +1 when R >= 0 and -1 only when R < 0 (0x7ff72bb31809..31826) -> message 0xc to "SeesawParent"',
    'Physics world 100 px / m (DAT_7ff72bc7d45c), gravity (0, 980) px/s^2 (DAT_7ff72bcc84b0, FUN_7ff72bbe76d0); PhysicsBall ctor FUN_7ff72bb55c30 / setup FUN_7ff72bb55d80: circle r 12 (DAT_7ff72c61f3d8), density 0.1, friction 0.5, restitution 0.2; death FUN_7ff72bb55e40: touching the area floor or ceiling starts a 30-tick countdown (moves 15, still below 15, removed at 0); the pitcher (angle 180 = down, 0.1 * p[N-1]) re-fires through FUN_7ff72bb38130',
    'PhysicsSwitch: switch type 2, no fixture, latched; each update casts a ray (x, y) -> (x, y - 16) (DAT_7ff72bc7e738) through the Box2D world (FUN_7ff72bbe7770): only balls hit it; a hit sends ("Key", 9) and FUN_7ff72bb65700 shows the hidden Key',
    'Port (b12 snapshot): seesawFromSpawn 12483-12505 (SeesawParent = a 365 x 915 wall from p1 / p2, children p0 * 48 x 16, no rotation) solid for cats and boxes in every collision list; updateSeesawTilts 8649-8720 (cat-driven tilt, rider snapping); balanceFromSpawn one static 28 x 20 block; the ball a straight line through the planks; physicsSwitchRect pressed by cats / boxes and released; no key.activate(); applyPhysicsAreas an invented 96 px/s slow-fall'],
  behavior: '9-2: the three planks are rectangles from the p0 shape table about their pivots (SeesawParent 340..790 at y 358, the geared Seesaws 490..940 at 258 and 340..790 at 164), drawn rotated, and are NOT solid for cats or boxes (removed from every collision list; updateSeesawTilts deleted; the cats spawn on the floor strip again instead of inside a 365 x 915 wall). The SeesawParent is driven toward the Balance angle (see seesaw-box2d); the geared children copy it. The Balance is two 194 x 14 pans at x 640 -/+ 450 (y 597..611) that move like lift slabs (the rising-lift chain test, a sinking pan stops on what is under it, riders and their stacks are carried): r = clamp((right - left riders) / (N / 2), -1, 1) (stacked cats count), each pan heads for -/+ r * 54.84 at max(|r|, 0.2) px per tick (0.2 when moving against the imbalance), and the plank angle is atan2(s * max(|left|, |right|), 450), s = +1 when the right pan offset is >= 0 and -1 only below 0: at party 2 one extra cat on a pan gives the full 6.95 deg after ~55 ticks. The planks, the PhysicsArea boundary, the PhysicsBall and the PhysicsSwitch ray are a real Box2D world (seesaw-box2d supersedes this entry\'s batch-12 hand-rolled circle solver). The PhysicsBall lifecycle: touching the area floor or ceiling starts the native 30-tick death (moves 15 ticks, asleep, removed) and the pitcher fires the next ball (one at a time, first tick skipped). The PhysicsSwitch latches the first time a ball body is hit by its 16 px ray and shows the hidden Key; cats and boxes never press it and it never releases. The invented PhysicsArea slow-fall and its blue fill are gone.',
}, {
  // Batch 12 (decoded spec b12/spec-9-1.md): 9-1 laser ball.
  id: 'laser-ball-pitcher',
  files: ['src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['LaserBallPitcher factory 0x7ff72bb74b72 -> FUN_7ff72bb37d70 mode 1 (+0x3ec = 1: first update skipped; speed +0x3f0 / +0x3f4 = 5.0); cannon body FUN_7ff72bc16bf0(this, DAT_7ff72bcb7320 = {-40, -18, 54, 40}, 3), category 4',
    'Params FUN_7ff72bb37f30: p0 angle, direction (sin a, -cos a), barrel {-23, -38, 46, 58} (DAT_7ff72bcb7330) atlas (240, 400, 23, 29) (DAT_7ff72bcb7300) rotated a / 180 * 32768; a outside 170..190 also draws the base {-25, -4, 52, 40} (DAT_7ff72bcb7310) atlas (240, 432, 26, 20) (DAT_7ff72bcb72f0); modes 1..3: raw p1 float = speed px/tick; 3+ params: p2 target (+0x660)',
    'Firing FUN_7ff72bb38130 / FUN_7ff72bb383e0: one ball at a time at pos + dir * 20 (DAT_7ff72bc7d1b0), velocity dir * +0x3f0, 0.5 s spawn delay (DAT_7ff72bcff4fc), a gone child cleared and refired the next update; messages FUN_7ff72bb38210: 0x15 speed *= payload, 0x16 base speed',
    'Ball FUN_7ff72bb4e470: view {-12, -12, 24, 24} atlas (256, 512, 12, 12), circle r 12 (DAT_7ff72c62cfd0) category 5; delay FUN_7ff72bb4e6f0 parks the velocity and hides it; no gravity; on its FIRST contact with anything (FUN_7ff72bb4ea70, chips too via FUN_7ff72bc14040) FUN_7ff72bb4ec10: velocity 0, body off, 30-frame fade, removed; hitting a category-1 cat with a target: message 0x25 to the target; no kill, no push',
    'Port (b12 snapshot): 1295-1299 a DeadBallPitcher (no body, no sprite); 10684-10690 a 16 x 16 loop 96 px every p1 s along (cos, sin) (270 aimed up) that never collided; 10348-10352 cat contact a no-op'],
  behavior: '9-1: each LaserBallPitcher is a solid cannon {x-40, y-18, 54, 40} (9-1: x 752..806, y 380..420) with the native barrel and base art; after one skipped tick it fires one ball at a time from 20 px along its heading (270 = left) at its raw p1 speed (7 per tick), hidden and still for 0.5 s, then flying in a straight line at constant speed with no gravity. The ball stops on its first contact with anything but its own cannon (map chips, cats, boxes, the LaserKeyBox, Rects, lifts), fades for 30 frames and is removed; the next tick the cannon fires again. A ball that hits a cat while its row names a target (the party <= 3 row: "LaserKeyBox") sends resetHits to that target; the party >= 4 rows have no target, so cats just absorb balls. Messages: 0x15 multiplies the NEXT ball\'s speed (the current ball keeps its own), 0x16 restores the base speed. Approximations: contact by closest point at sub-steps of at most 4 px; the ball ignores its own cannon (it spawns inside it; the category (4, 5) filter is not traced); the 11-frame scale part of the fade is drawn as an alpha fade only.',
}, {
  id: 'laser-key-box',
  files: ['src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['LaserKeyBox ctor FUN_7ff72bb544e0: view {-23, -62, 46, 62} (DAT_7ff72bcb6500), frames (288, 480), (320, 480), (352, 480) 23 x 31 (DAT_7ff72bcbaf10); body {-22, -62, 44, 60} (DAT_7ff72bcb64f0) type 3 category 5; params FUN_7ff72bb54fe0: p0 pitcher name (+0x408), k = p[max(N-1, 1)] (+0x428); on-add FUN_7ff72bb54780 an ordinary Key FUN_7ff72bb64f20(0x558, 0) kept off-scene in +0x400',
    'Hits FUN_7ff72bb54940: only actor contacts with a category-5 body (laser balls), any side; cats do not count; hits++ (+0x3fc); while hits < 3: frame = hits, message 0x15 with &k to the pitcher; at 3: a 40-frame fade (+0x3f8 = 0x28, FUN_7ff72bb547f0 alpha (n - 20) / 10, solid during the fade, then destroyed) and the Key moved to (box x, box y - 30) (DAT_7ff72bcb4ee8) and added to the scene (FUN_7ff72bb31f00, FUN_7ff72bb54d60)',
    'Message 0x25 FUN_7ff72bb54860, only while hits < 3: hits = 0, 0x16 to the pitcher (base speed), frame 0',
    'Port (b12 snapshot): 924-928 a centred 48 x 48 NormalBox; 7897-7900 / 11205 the box was hidden ("unlocked") only when a Key targeting it was carried (9-1 has no such Key: the Goal stayed closed)'],
  behavior: '9-1: the LaserKeyBox is a solid 44 x 60 body standing on its row point ({x-22, y-62}; 9-1: x 53..97, y 372..432, blocking the left tunnel) drawn with its three native hit frames. Only laser balls count as hits (cats never do): hits 1 and 2 show the next frame and multiply the pitcher\'s next-ball speed by k = p[max(N-1, 1)] (party 2: 1.8, so 7 -> 12.6 -> 22.68 per tick; party 4: 1.6); the 3rd hit fades the box out over 40 frames (still solid while fading) and removes it, and an ordinary Key appears at (box x, box y - 30) (9-1: (75, 404)) that opens the Goal by the existing key rule. resetHits (a ball hitting a cat on the targeted row) works only while hits < 3: hits 0, frame 0, the pitcher back to its base speed. Removed: the carried-Key "unlock" path (carryKeyForPlayer hid a LaserKeyBox; isLaserKeyBoxUnlocked filtered it out of every collision list).',
}, {
  // Codex batch-12 must-fix (b13): the 9-2 clear depended on a non-native ball trajectory; the world is now Box2D 2.3.
  id: 'seesaw-box2d',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Step call site: scene tick FUN_7ff72bc1b830 runs the actor updates, then vtable +0x30 = stage update FUN_7ff72bb7bbe0 with dt = DAT_7ff72bc7d790 = 1/60 (vtable 0x7ff72bcbfec0 / 0x7ff72bcc00b8 slot +0x30); FUN_7ff72bb7bbe0 calls FUN_7ff72bbe7720(world + 0x51950, dt) once per tick, which is mov r9d, 0xa; mov r8d, r9d; jmp FUN_7ff72bbf4e50 = b2World::Step(dt, 10 velocity, 10 position iterations); then the engine world step FUN_7ff72bc1da80',
    'World FUN_7ff72bbe74f0 -> b2World ctor FUN_7ff72bbf2950 (allowSleep 1 at +0x19340; warmStarting / continuousPhysics / subStepping / stepComplete = 0x1000101 at +0x1935c: Box2D 2.3 defaults) plus a static ground body (+0x19380); gravity FUN_7ff72bbe76d0: (x, y * 0.01) = (0, 9.8) m/s^2 from (0, 980) px/s^2; 100 px per metre (DAT_7ff72bc7d45c = 0.01 in FUN_7ff72bbe6520 / 5ad0 / 5d30 / 5f80 / 6ef0 / 7770)',
    'Body FUN_7ff72bbe6520: b2BodyDef type 2 when wrapper +8 == 1, position (+0x20, +0x24) * 0.01, angle +0x30, angular damping +0x38, allowSleep / awake 0x101, velocity (+0x28, +0x2c) * 0.01, gravity scale +0x3c -> b2Body +0xa8; userData = the wrapper; fixtures (FUN_7ff72bbe5ad0 circle / 5d30 polygon / 5f80 edges): friction +0xc, restitution +0x10, density +8, category 1, mask 0xffff',
    'PhysicsArea factory 0x7ff72bb7540f ("PhysicsArea" -> FUN_7ff72bb77970; "PhysicsRect" -> FUN_7ff72bb56400): static body, wrapper +0xc (kind) = 1, density 1 / friction 1 / restitution 0; params FUN_7ff72bb78d80: 5 points (p0, p1), (p0, p1 + p3), (p0 + p2, p1 + p3), (p0 + p2, p1), (p0, p1); FUN_7ff72bbe5f80 makes one b2EdgeShape per segment (radius 0.01) with vertex0 = the segment start (hasVertex0 after the first) and vertex3 = the next point (hasVertex3 before the last)',
    'Seesaw setup FUN_7ff72bb5d700: dynamic box (polygon FUN_7ff72bbe5c70 from LAB_7ff72bcbc230[p0], y negated, then scaled), density 1 (+0x750), friction 1 (+0x754), restitution 0, gravity scale 0 (+0x734), angular damping 0; revolute (joint type 1, bodyA = the ground body when none, FUN_7ff72bbe6f70) with localAnchorA = the pivot * 0.01, localAnchorB 0 (FUN_7ff72bb5dd40 -> FUN_7ff72bbe6ef0), limits enabled -0.17453292 / +0.17453292 (DAT_7ff72bcbc478 / 470, FUN_7ff72bbe6ea0), no motor; children: gear joint (type 6) bodyA = parent, bodyB = child, joint1 = the parent revolute, joint2 = its own, ratio -1 (DAT_7ff72bcff6a8; FUN_7ff72bb5d9e0 / 7170 / 7210 / 7250); SeesawParent update (vtable 0x7ff72bcbfae0 +0xc8) FUN_7ff72bb5da90: SetAngularVelocity((+0x930 - angle) * (1 / dt)); Seesaw update 0x7ff72bb5d850 is empty',
    'PhysicsBall setup FUN_7ff72bb55d80: circle r 12 (DAT_7ff72c61f3d8), density 0.1, friction 0.5, restitution 0.2, angular damping 0.5 (DAT_7ff72bcff4fc via FUN_7ff72bbe6850 -> b2Body +0xa4), dynamic; FUN_7ff72bb383e0 mode 4 stores dir * speed on the actor (+0x118) before the ball has components (registered in setup), and the body is built from the wrapper velocity (still 0): the ball starts at rest',
    'Death FUN_7ff72bb55e40: walks the ball body contact list (+0x88): other body userData kind (+0xc) == 1 and |1 - |manifold localNormal.y (contact +0xa4)|| <= DAT_7ff72bc7d458 -> 30; below 15 the awake flag is cleared, sleep time / velocities / forces zeroed every tick; 0 -> FUN_7ff72bc11650. PhysicsSwitch ray FUN_7ff72bbe7770: every fixture of every body (no broad-phase), shape RayCast from (x, y) * 0.01 to (x, y - 16) * 0.01, maxFraction 1',
    'Codex replay (real Box2D 2.3.1) of the batch-12 solver\'s per-frame plank angles: the ball first lands at frame 672 near x 236.91 and never reaches the switch (the hand-rolled port latched at 929); reproduced here: the death test fires at tick 674, x 239.1, never latched'],
  behavior: '9-2: the planks, the PhysicsArea boundary, the PhysicsBall and the PhysicsSwitch ray live in one Box2D 2.3 world (planck 1.5.0, a faithful JS port of Box2D 2.3, bundled into runtime.mjs from the repo node_modules) built on the first ball-park tick in native creation order (ground, PhysicsArea, SeesawParent + revolute, each Seesaw + revolute + gear) at 100 px per metre with gravity (0, 9.8). Each tick, after the actor updates (Balance -> SeesawParent SetAngularVelocity((target - angle) * 60), the ball death test on the last step\'s contacts, the switch ray), the world steps once with b2World::Step(1/60, 10, 10); the plank angles and the ball position / velocity are read back for drawing. Planks: dynamic boxes from the shape table, density 1, friction 1, restitution 0, gravity scale 0, revolute to the ground at the pivot with limits +-0.1745 rad, children geared to the parent at ratio -1. PhysicsArea: a static body with four edges (density 1, friction 1, restitution 0, kind 1) with the native ghost vertices. Ball: dynamic circle r 12, density 0.1, friction 0.5, restitution 0.2, angular damping 0.5, spawned at rest at the pitcher + 20 px; it rolls as a damped disk (about (2/3) (g sin(theta) - 0.25 v)). Death: a contact with the area whose manifold normal is vertical starts the 30-tick countdown (15 ticks moving, then put to sleep each tick, then the body is destroyed). Switch: the 16 px segment is ray-cast through every fixture with each shape\'s RayCast, so a ball whose centre sits on the segment start misses while one approaching from the side is hit. The 9-2 solver was re-routed on this world (FLIP_LEFT_AT 520 / FLIP_RIGHT_AT 760). Remaining approximations: planck computes in float64 (Box2D: float32); the native polygon keeps an unscaled centroid (used only by edge-polygon contacts, which never occur here); the order of the SeesawParent and Balance updates within a tick follows the port (Balance first), not a traced actor-list order; a contact that stops touching keeps its stale manifold normal in Box2D but is zeroed by planck (equivalent for the death test, which fires on the first touching tick).',
}, {
  // Batch 13 (decoded spec b13/spec-warpgun.md + spec-magnet.md): the action button.
  id: 'action-button',
  files: ['src/engine/types.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['Warp gun update FUN_7ff72bb57280 fires on FUN_7ff72bb68510(owner, 0xb) = input bit 11 press edge ((cur & m) == m && (prev & m) == 0, FUN_7ff72bb6ad30); magnet input FUN_7ff72bb59530 reads FUN_7ff72bb68300(owner, 0xb) = bit 11 held; jump is bit 2 (BUTTON_JUMP = 2, stage_common.lua); bit 11 > BUTTON_MAX = 10, shown as \'[shot]\' in the stage text',
    'Port (b12 snapshot): InputState (types.ts 65-75) had no such button; the warp gun fired on jumpPressed (GameRuntime 2131)'],
  behavior: 'Every stage: InputState gains action (held) and actionPressed (press edge) for native input bit 11. The desk sends them as bits 64 (held) and 256 (press edge) beside 1/2/4/8 directions, 16 jump, 32 jump edge (128 stays the teacher-helper flag); keys: X (also K) for the player, G for the solo buddy; the relay accepts bits <= 511 and keeps the edges one tick like jump. Old packets (bits <= 63) decode exactly as before. A cat with zero Roulette activity has no action button either; an action press counts as player activity for the solo input routing.',
}, {
  id: 'warp-gun-player',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Factory branch 0x7ff72bb72c13: a normal mode-3 cat (FUN_7ff72bb6f0e0 moves and jumps normally) + the gun FUN_7ff72bb57010; fire FUN_7ff72bb57280 on the bit-11 press edge, independent of jump; one live shot per gun (+0x408)',
    'Range FUN_7ff72bb57c80: dies when its SCREEN x (FUN_7ff72bc15b90 subtracts the camera scroll when actor +0x90 bit 8 is set; base ctor FUN_7ff72bc155e0 line 107 sets it on every actor) < 0 or >= 1280 / scale (DAT_7ff72bc7db94)',
    'Pick-up: message 0xe value 0 to a hit cat (FUN_7ff72bb6fd20 -> FUN_7ff72bb67cc0(0)): active off, collision off, hidden (the port still ran resolvePlayerBodyCollisions on it, so a held cat blocked walking)',
    'Port (b12 snapshot): 2131-2134 fired on jumpPressed and cancelled the jump (gun cats never jumped); 9585 / 9646 tested the WORLD x (a shot fired at world x >= 853 died on its first step)'],
  behavior: '11-1 / 11-3: a WarpGun cat fires on the action press edge (X), not on jump; it jumps like any cat. The shot range is the visible screen: shot x minus the scroll-camera scroll in 0 .. 1280 / scale, so a shot fired far right in the world flies. Unchanged (already native): the gun at (+-20, -10), the shot from owner + (+-30, -17) at 6 per tick, its 10 x 10 contact and launch probe, the 0.5 s hit fade, one live shot per gun, Player / ColorBox pick-up (hidden, inert where hit, a carried key stays), placement on the shooter\'s side (x = shot.x - w - 1 / shot.x + 1, bottom = shot.y - 1, one retry h + 2 lower), the key drop on placement. A held cat cannot fire (it is skipped as before) and no longer blocks another cat (cat-vs-cat body push skipped while held: collision bit off). Not modelled: the launch probe ignores the tile map (unverified natively); the scroll camera still counts a held cat at its old position (native unknown); a ColorBox-class push box (ColorBox rows) is not a pick-up target (no gun stage has one).',
}, {
  id: 'colorbox-gravity',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['ForceColorBox factory 0x7ff72bb73c9b, ctor FUN_7ff72bb3b490: the ColorBox class (vtable 0x7ff72bcb7c88), colour = raw p0 = 8; update FUN_7ff72bb3b5e0 pushable only by a cat whose slot == colour (8: nobody) and HAS GRAVITY: falls when FUN_7ff72bc13690 fails (FUN_7ff72bb34c40)',
    'Port (b12 snapshot): ColorBox / ForceColorBox in colorBoxes never fell; a warp-gun release (9830-9835) only wrote the spawn x / y, so a placed box floated'],
  behavior: '11-3 (every ForceColorBox): a ColorBox-class box outside the push-box list falls when unsupported with the push-box family fall (0.65 per tick per tick, 2-unit sweep steps, flush landing on the map, any solid, a push box, another ColorBox or a live cat below; side contact never holds it up). A ForceColorBox the warp gun places falls from where it appears. It stays unpushable (colour 8: no slot matches). ColorBox rows were already push boxes that fall (colorbox-colour-push).',
}, {
  id: 'magnet-player',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/Player.ts', 'src/engine/sprites.ts'],
  evidence: ['Factory branch 0x7ff72bb72d33: an ordinary mode-3 cat + the aux FUN_7ff72bb59090(new 0x670, cat), attached by FUN_7ff72bb59390; sprite {-11, -22.5, 22, 30} atlas (208, 496) 11 x 15; field body {20, -50, 110, 80} (DAT_7ff72c61f438), contact callback FUN_7ff72bb5a180',
    'Placement FUN_7ff72bb59e50: facing right aux = cat + (20, -10), hold offset (0, 0); facing left aux = cat + (-170, -10), hold offset (150, 0), body not mirrored: field {cat.x + 40, cat.y - 60, 110, 80} / {cat.x - 150, cat.y - 60, 110, 80}',
    'Input FUN_7ff72bb59530: on while bit 11 is held (toggle variant only when DAT_7ff72c6301b0 != 0; 0 in the memdump)',
    'Candidates FUN_7ff72bb5a180: up to 8 per step, cats (+4 == 1) but its own, box family DAT_7ff72c62a10f (FUN_7ff72bb34e10); |normalize(target - cat).y| < sin(2.0) (FUN_7ff72bc4cd48); grab: insertion-sorted by squared distance, command 0x1e(1), first accepting wins (cat FUN_7ff72bb6fd20: input skipped, velocity 0, gravity bit cleared FUN_7ff72bb691d0; box FUN_7ff72bb33d00: +0x400 bit 2 freezes push / fall); holder +0x90 bit 4 cleared (FUN_7ff72bae78f0 / FUN_7ff72bae7950)',
    'Pull FUN_7ff72bb5a2d0: hold y = cat.y, near edge 30 in front; d = hold - (target + vOwner), vOwner once locked; gains (0.03, 0.08) / (0.06, 0.16) (DAT_7ff72bc7eaf8 / DAT_7ff72bcbbb34 / bbb30 / bbb38); |dx| > 1 -> sign * max(2, g|d|) else snap, y threshold 2; both snapped -> lock; FUN_7ff72bb5b630 -> FUN_7ff72bc13690 wall / ceiling zeroing; velocity FUN_7ff72bb35190 and pos += v FUN_7ff72bb97db0; lock break > 32 (DAT_7ff72bc7d7f8); release 0x1e(0) zeroes the target velocity',
    'Blocking FUN_7ff72bb59530: FUN_7ff72bb5b630(body, side 2 / 3, 1) zeroes v.x, (side 0, 1) zeroes v.y < 0; FUN_7ff72bb5b630 -> FUN_7ff72bc13690 param_3 = 1 also tests the actor contacts at body +0xa0 (count +0xe8), not only the map contacts (+0x90); then FUN_7ff72bb35190 (velocity) and FUN_7ff72bb97db0 (pos += v), the engine sweep resolves the body; the lock bit (+0x3f8 bit 0) is only set while unlocked, never cleared by a block',
    'Shared targets: command 0x1e handlers FUN_7ff72bb33d00 (box: set / clear +0x400 bit 2, velocity 0, return 1) and FUN_7ff72bb6fd20 (cat) accept unconditionally; FUN_7ff72bb5a180 filters by class, field, angle and the cap of 8, not by holder; each aux keeps its own +0x518 and pulls every update',
    'Port (b12 snapshot): 2745-2747 MagnetPlayer only joined magnetPlayers; 241-242 / 7798-7825 a MoveEnergy pull (radius 112) and collect radius 56 with no caller and no native source'],
  behavior: '11-2 / 11-4: each MagnetPlayer carries a magnet (drawn at cat + (+-20, -10), mirrored by facing). While its action button is HELD the magnet field is {x + 40, y - 60, 110, 80} in front of the cat (x / y = centre x / feet y; facing left {x - 150, ...}). Field list: other live cats and box-family push boxes (PushBox, Normal / Small / Tall / Big Box; not ColorBox) touching the field with |normalize(target - cat).y| < 0.909, at most 8. With nothing held the nearest (squared distance, ties in list order) is grabbed, even one another magnet already holds: then both magnets pull it, each in its own update (MagnetPlayer order), each moving it once; the held state is one flag on the target, so either magnet letting go unfreezes it (a box falls again, a cat gets its buttons and gravity back) while the other keeps pulling it. A held cat ignores its buttons and has no gravity (its own update is skipped; it is still a body for keys, Thunder, cats standing on it); a held box neither falls nor is pushed. The holder cannot turn while it holds (it walks backwards). Each tick, after the cats moved, the target is pulled toward the hold point (its origin at the holder\'s feet level, near edge 30 in front): d = hold - (target + vOwner) with vOwner the holder\'s motion this tick once locked, gains (0.03, 0.08) unlocked / (0.06, 0.16) locked, |dx| > 1 -> sign * max(2, gx |dx|) else dx, y the same with threshold 2, both snapped -> locked; v.x = 0 when the target touches a wall on that side, v.y < 0 -> 0 under a ceiling (map OR a solid actor body: Rect, gate, bridge, lift, wall, blink block, FallBox, jump stand, box, live cat); the target then moves once by vOwner + v swept against the map and then those bodies, stopping flush at contact (no second move). A blocked pull keeps the lock (only the > 32 distance unlocks). A locked target more than 32 from the hold point unlocks. Letting go, the holder dying, or the target leaving the field list releases: the target velocity is zeroed (it drops straight down), a cat gets gravity back, the holder can turn. A helper cat that leaves is released first. The invented MoveEnergy pull / collect radius is deleted. Not modelled: the repeating magnet sound (0.6 s); the field list order among cats and boxes beyond distance (cats first, then boxes); lift carry of a locked target is by the holder\'s displacement.',
}, {
  // Batch 14 (decoded spec b14/spec-puzzle.md): 8-1 / 8-3 native co-op Tetris. Data: scripts/export-pico-campaign.py.
  id: 'puzzle-stage-data',
  files: ['src/engine/types.ts'],
  evidence: ['The Puzzle row p0 "stage_switch_puzzleNN.puzzle" is a Lua dotted path resolved by FUN_7ff72bbd8bf0 (getglobal + getfield), called from FUN_7ff72bb4be20 via FUN_7ff72bbd8e60: the sub-stage table lives in the same stage .lua file (stage_switch_puzzle01.lua lines 85-300)',
    'Map loader FUN_7ff72bc27dc0 reads width / height / offsetX / offsetY / chipSize / variable / table; Lua index k -> x = k // height, y = k % height (column-major, one source line per column); variable != 0 -> table[party] (Lua 1-based)',
    'Puzzle map loader FUN_7ff72bb17090 -> FUN_7ff72bb16920 (judge x / y / w / h, infoX, infoY) + fallTimeDefault (+0x258) / fallTimeFloorDefault (+0x25c) / fallTimeTable (+0x2a8 count, +0x2ac + 8i threshold, +0x2b0 + 8i time)',
    'Port (b13 snapshot): convert_stage_lua.py kept only puzzle.createTable; types.ts PuzzleDef { createTable } (the map, judge, info and fall tables were dropped)'],
  behavior: 'Every stage with a puzzle sub-stage (8-1, 8-3; also the unused endless stage): the bundled stage data now carries stage.puzzle.map = {width, height, chipSize, variable, offsetX / offsetY when present, judge {x, y, w, h}, infoX, infoY, fallTimeDefault / fallTimeFloorDefault when present, fallTimeTable rows [threshold, t(party 2) .. t(party 8)] (Lua row[party], 1-based), table (the default grid), variants {4, 6, 8} and variantByPlayerCount (index = party - 1)}. Grids are chip names, row-major (the Lua tables are column-major, transposed like stage.map). The Block rows stay in stage.puzzle.createTable. The exporter (follow-alongs scripts/export-pico-campaign.py) reads the Lua with the recovered converter\'s own parsers; the hermes tree is untouched. PuzzleDef gains the optional map field (PuzzleMapDef).',
}, {
  id: 'puzzle-proxies-netcode-only',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['PuzzlePredictProxy (class 0x2a) rows {"PuzzlePredictProxy", n, 0, 0, "PuzzleMain", "BlockN"}: netcode prediction of remote Blocks only; no body, no view (puzzle_8-1_8-3.json predict_proxies)',
    'Blocks are sub-stage actors: FUN_7ff72bb181b0 creates them inside PuzzleTetrisStage (FUN_7ff72bb17f80) from puzzle.createTable, Tetris ctor FUN_7ff72bb142d0, grid cells, never a main-stage body',
    'Port (b13 snapshot): GameRuntime 1114 a 32 x 32 StaticRect per proxy (8 orange squares at the origin, solid in every unfiltered collision list); 1421 every Block a PushBox at its grid coordinates read as pixels; 1785 the puzzle createTable spawned into the main stage; 2243 / 11695 checkPuzzlePredictProxies cleared the stage when every proxy was occupied (bypassing Key / Goal)'],
  behavior: '8-1 / 8-3: the PuzzlePredictProxy rows create nothing (no body, no view); the Block rows are no longer spawned into the main stage as push boxes (they are the Puzzle sub-stage pieces, see puzzle-tetris); the invented proxy-occupancy instant clear is deleted (the stage clears only through the ordinary Key and Goal).',
}, {
  id: 'puzzle-tetris',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['RNG: one global subtractive generator DAT_7ff72c62f7b0 (uint32 a[1..55]): seed FUN_7ff72bba81c0 (a[55] = s, mj = s, mk = 1, a[21i mod 55] = mk, mk = mj - mk, mj = a[ii]; 3 refills; index 55), refill FUN_7ff72bba8840 (a[i] -= a[i + 31] for i 1..24, a[i] -= a[i - 24] for 25..55), draw FUN_7ff72bba8a90 / FUN_7ff72bb9d380 (n == 0 -> 0, else a[++index] % (n + 1), refill at > 55); piece pick FUN_7ff72bb14810 / 148c0 / 14420: below(count - 1), one redraw if not spawnable; mode 1 table DAT_7ff72c62a330 = L (0,0),(0,1),(1,0) / I (-1,0),(0,0),(1,0): 1 draw per piece. Seed: stage start FUN_7ff72bb27b50 case 0 -> FUN_7ff72bb28f60 -> FUN_7ff72bb9d2f0(stage + 0x24b80) = the host clock (FUN_7ff72bba4b30) shared in the session block; % 2 makes the sequence depend on the seed parity only',
    'Blocks FUN_7ff72bb181b0 / FUN_7ff72bb12610: spawn cell = the createTable (x, y), idx = int(p0) % 10, colour = the cat colour slot of idx, active (0x40) iff idx < party (clamped >= 2); init FUN_7ff72bb14420: next = draw, then current = next, next = draw (2 draws per Block, inactive ones too, createTable order); attach FUN_7ff72bb12b60 writes the first piece, fall timer = fallTime * 1.0',
    'Update FUN_7ff72bb128d0: BLOCKED (0x10) -> retry FUN_7ff72bb146e0 only; grounded = the shape one row down is blocked by a non-falling cell (FUN_7ff72bb135c0 out flag); JUMP press edge (FUN_7ff72bc28ce0) rotates, LEFT (5) / RIGHT (6) / DOWN (4) use the auto-repeat bit (FUN_7ff72bb137f0 -> FUN_7ff72bc28c10), left wins; DOWN while grounded is ignored when lockTimer >= max(ft, floor) - 0.12 (DAT_7ff72bc819a8), else it drops (and so locks at once on the ground); fall / lock timers -= dt; fall <= 0 -> drop; grounded without a soft drop: no gravity, the drop (lock) waits until lockTimer - dt <= 0; any drop resets fall = ft * 1.0, lock = max(ft, floor)',
    'Move FUN_7ff72bb13130: erase own cells; rotate (x, y) -> (-y, x) tested at the current position (no wall kick); x += dx if free; drop: free -> y + 1, blocked by a non-falling cell -> cells 0x24 + colour and vtable +0xb0 FUN_7ff72bb14530 in the same tick, blocked by a falling cell -> stay; then cells 0x1a + colour. Collision FUN_7ff72bc281c0: coordinates clamped; codes 0 / 1 free, 2..25 solid (DAT_7ff72bcc8a30), 26..55 solid (DAT_7ff72bc81e10)',
    'Respawn FUN_7ff72bb14530: the just-locked shape (rotation reset, FUN_7ff72bb12bf0) is tested at the spawn cell (FUN_7ff72bb127b0); fits -> erase, FUN_7ff72bb148c0 (current = next, one new draw), the new piece written untested; else flag 0x10 (BLOCKED); retry FUN_7ff72bb146e0 places the same shape again, no draw',
    'Repeat source: the Block reads bridge record +0xc (FUN_7ff72bb137f0 -> FUN_7ff72bc28c10), written by FUN_7ff72bc28fc0 from the keyboard state (FUN_7ff72bc18dd0 -> FUN_7ff72bbd33c0, bit 0 of the per-key byte kept by FUN_7ff72bbd2ce0); its mark-repeating-on-press branch only drives the virtual random-input pads (ctor FUN_7ff72bc29780, update FUN_7ff72bc29870; gate bridge +0x10 = 0 from FUN_7ff72bc28960), never player input. Strict timer > threshold, remainder carried (timer -= threshold), dt in ms: at 60 Hz a held key fires on ticks 0, 8, 12, 15, 19, 23, 27 ...',
    'Repeat: device rule FUN_7ff72bbd2ce0: fire on the press, then when held time > DAT_7ff72c61fb30 (FUN_7ff72bbd58f0; 134 ms offline, set by the map loader FUN_7ff72bb17090 from DAT_7ff72bc82150), then every DAT_7ff72c61fb34 = 66 ms (FUN_7ff72bbd5950), the excess carried',
    'Map update FUN_7ff72bb172e0 / FUN_7ff72bb17530: rows judge.y + h - 1 .. 0, full = every judge cell 0x24..0x2d; shift copy with the r - shift >= 1 and sticky terrain-source rules; n > 0: lines += n, each Block FUN_7ff72bb145d0 (y + n, erase, test at y + n - 1: free -> original y), then every fallTimeTable row with threshold <= lines sets fallTime. Judge narrowing FUN_7ff72bb16920: the first run of empty cells in row judge.y',
    'FUN_7ff72bb180f0 (after the Blocks): every active Block BLOCKED -> sub flag 8 -> Puzzle update sets +0x3f8 | 1 and FUN_7ff72bb60000 main stage +0xc |= 2 (the fail / restart flag); target != 0 && lines >= target -> flag 4 -> Puzzle stops ticking (+0x3f8 | 1), FUN_7ff72bb60030 message 9 to "Key" (FUN_7ff72bb65700 shows the hidden Key) and broadcast 0x1b. Setup FUN_7ff72bb4c420 broadcasts 0x1a; player FUN_7ff72bb69440: 0x1a -> +0x430 -= 1, 0x1b -> +0x430 += 1 (max +0x42c); FUN_7ff72bb68510 / 68640 read no input while +0x430 == 0'],
  behavior: '8-1 / 8-3: the Puzzle row runs the native co-op Tetris sub-stage. Grid: the party\'s table (4 for party 2-4, 6 for 5-6, 8 for 7-8), judge narrowed to the well (table4 x 19 w 15, table6 x 15 w 23, table8 x 11 w 31; rows 8..21). One Block per createTable row, active iff its player index (row p0) < party, in its bay at (x, 5); a Block is steered by input slot = its player index and drawn in that cat\'s colour. Pieces: the native generator (L / I trominoes), seeded from ONE draw of the runtime\'s seeded random at puzzle setup (RNG decision: native seeds from the host clock per stage start and only the seed parity matters for these pieces; the port seeds per stage attempt from the relay-seeded picoRandom stream, so the seed is in the journal and replays identically; a fail restart reloads and draws a new seed); 16 init draws (2 per Block x 8 in createTable order), then 1 per successful respawn in lock order. Controls: JUMP press = rotate clockwise (no wall kick), LEFT / RIGHT / DOWN fire on the press, after 134 ms held, then every 66 ms (each Block keeps its own held state, the wire has no edges for them); DOWN drops a row (locks at once when grounded, except during the 0.12 s grace after landing). Gravity: one row per fallTime (fallTimeTable by party and lines: 8-1 0.6 / 0.4 / 0.3 s at party 2 from 0 / 3 / 6 lines, 8-3 0.2 / 0.1 s from 0 / 5 lines); on the ground the piece locks after max(fallTime, 0.5) s (moves and rotations do not reset it); other players\' falling pieces block but are not ground. Lock -> respawn in the same tick (the locked shape is tested at the spawn cell; the new piece is written untested); a Block that cannot respawn is BLOCKED and retries every tick. Line clear exactly per FUN_7ff72bb17530 (landed cells only; the bay separators make columns right of the first separator clear instead of shift across rows 4-7; falling pieces keep their y unless the y + n - 1 test fails). The counter shows lines still needed (target 10). Every active Block blocked -> the stage restarts (the breakout restart path). 10 lines -> the puzzle stops (still drawn, "OK"), the hidden Key appears (Key.activate + refreshKeyGoalViews) and the cats get their buttons back; from setup until then every cat is frozen (visible, physics on, buttons ignored: the Roulette activity credit model). Readable state: game.puzzle {grid (row-major codes: 1 empty, 2..25 terrain, 26 + c falling, 36 + c landed), width, height, chips, judge, blocks [{label, player, colour, active, piece (0 L, 1 I), next, x, y, rotation, shape, cells(), blocked, spawnX, spawnY, fallTimer, lockTimer}], linesCleared, linesNeeded, target, won, failed, seed, fallTime(), lockDelay(), cellAt(x, y), previewPieces(n)}; GameRuntime.puzzlePieceSequence(seed, n) is the pure generator. Inferred / untraced: the win is checked before the fail when both happen in one tick; the lock timer starts at 0; the repeat clock is 1000 / 60 ms per tick; whether native re-seeds on a fail restart.',
}, {
  id: 'puzzle-tetris-draw',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Sub-stage origin = the Puzzle actor position (FUN_7ff72bb4c0b0 tail: FUN_7ff72bc15b90 -> translate sub + 0x20 + 0x50, scale 1); cells drawn at (x * 24, y * 24) size 24 (FUN_7ff72bb16bd0, offsetX / Y absent), codes >= 2, UV DAT_7ff72c62a390[code]: falling 0x1a + c and landed 0x24 + c share one UV per colour',
    'Counter FUN_7ff72bb17320: "%d" (DAT_7ff72bc820f0), size 48, align 2 / 2, at (infoX, infoY) + chip * (offsetX, offsetY) + origin = (636, 48); value max(0, target - lines). Win draw FUN_7ff72bb4c290: "OK" (DAT_7ff72bcb9e38) at (640, 300) (DAT_7ff72bc7d8ac / DAT_7ff72bc7daa8)',
    '8-3 "SPEED UP": an ordinary Text row {-100, 300, "SPEED UP", 32, 0, 6, 1} (no message from the puzzle); the port\'s RecoveredText renders and slides it'],
  behavior: '8-1 / 8-3: the puzzle draws in one container in the actor layer at the Puzzle row point (world (0, 0); inferred from the native translate by the Puzzle actor position): terrain chips 2..25 in the main-map style (picoStyle tiles, same-fill neighbours merged), piece cells as rounded 24 x 24 squares in the owning cat\'s colour (falling and landed identical), the "%d" lines-still-needed counter (48 px, centred at (636, 48)) and, after the win, "OK" centred at (640, 300), both in the runtime\'s monospace bold Text style. Inferred / untraced: the atlas cell art (plain colour squares instead), the text colour (the runtime text orange), the draw order against the cats (they never overlap: the grid ends at y 552, the cats live below the ceiling row at y 544).',
}];

// Fail the build if upstream code changes: never silently skip a correction.
function replaceOnce(source, before, after, file) {
  assert.equal(source.split(before).length - 1, 1, `Patch anchor changed: ${file}: ${before}`);
  return source.replace(before, after);
}

export function patchCampaignSource(file, source) {
  source = source.replaceAll('\r\n', '\n');
  if (file === 'src/engine/chips.ts') {
    // mc-d-tiles-solid: chips 26..29 have attribute 3 (bit 0 solid) in DAT_7ff72bcc8c40.
    for (const corner of ['LU', 'LD', 'RU', 'RD']) {
      source = replaceOnce(source, `  MC_D${corner}: { color: danger, alpha: 1.0, solid: false,`, `  MC_D${corner}: { color: danger, alpha: 1.0, solid: true,`, file);
    }
    return replaceOnce(source, "  if (chip.startsWith('MC_D')) return { color: danger, alpha: 1.0, solid: false, label: 'danger chip' };",
      "  if (chip.startsWith('MC_D')) return { color: danger, alpha: 1.0, solid: true, label: 'danger chip' };", file);
  }
  if (file === 'src/engine/actors/PlayerGeometry.ts') {
    // native-player-body: FUN_7ff72bb6a3b0 body = DAT_7ff72c62d1a8 = {-16, -47, 32, 46} from the row point.
    source = replaceOnce(source, 'export const PLAYER_RECT_WIDTH = 26;', 'export const PLAYER_RECT_WIDTH = 32;', file);
    source = replaceOnce(source, 'export const PLAYER_RECT_HEIGHT = 34;', 'export const PLAYER_RECT_HEIGHT = 46;', file);
    source = replaceOnce(source, 'export const PLAYER_RECT_CENTER_OFFSET_X = 13;', 'export const PLAYER_RECT_CENTER_OFFSET_X = 16;', file);
    return replaceOnce(source, 'export const PLAYER_RECT_CENTER_OFFSET_Y = 32;',
      '// The body bottom is the row point - 1; the drawn 64 x 62 cat (bottom at the row point) is 1 lower.\nexport const PLAYER_RECT_CENTER_OFFSET_Y = 47;', file);
  }
  if (file === 'src/engine/actors/Player.ts') {
    // native-player-body: row p0 == 1 spawns the cat facing left (FUN_7ff72bb67620 -> FUN_7ff72bae78f0).
    source = replaceOnce(source, '  private facing: -1 | 1 = 1;\n', `  private facing: -1 | 1 = 1;
  private spawnFacing: -1 | 1 = 1;

  setSpawnFacing(direction: -1 | 1): void {
    this.spawnFacing = direction;
    this.facing = direction;
    this.refreshPose();
  }
`, file);
    source = replaceOnce(source, '    this.facing = 1;\n    this.refreshPose();', '    this.facing = this.spawnFacing;\n    this.refreshPose();', file);
    source = replaceOnce(source, '// Browser PlayerGeometry can rest a fraction above (or up to 2px inside) a floor. Probe only',
      '// The native body rests up to one step above a floor (never inside it). Probe only', file);
    // jumpstand-launch: a stand's command 0 sets vy after gravity (the first tick moves the full launch), no ramp,
    // and a press that tick is ignored (FUN_7ff72bb6fd20 / FUN_7ff72bb6f0e0).
    source = replaceOnce(source, '  private facing: -1 | 1 = 1;\n', `  private facing: -1 | 1 = 1;
  /** jumpstand-launch: a stand launch waiting for this cat's next update (per second; null = none). */
  pendingLaunchY: number | null = null;
`, file);
    // jumpstand-launch: the runtime reads the hold-ramp counter (a stand launch is refused while it runs).
    source = replaceOnce(source, '  private jumpPhase = 0;', '  jumpPhase = 0;', file);
    // jump-off-body-contact: any contact below (a cat or box, even a falling one) allows a jump (FUN_7ff72bb6f0e0).
    source = replaceOnce(source, '  jumpPhase = 0;', `  jumpPhase = 0;
  /** jump-off-body-contact: set by the runtime each frame when this cat rests on another cat or a push box. */
  bodySupportContact = false;`, file);
    source = replaceOnce(source, `    const startsJump = input.jumpPressed && canStartJump;
    if (startsJump) {
      this.velocity.y = this.getJumpSpeed();
      this.grounded = false;
      this.jumpPhase = 1;
      this.jumpCoyoteTimer = 0;
    } else if`, `    const launch = this.pendingLaunchY;
    this.pendingLaunchY = null;
    const startsJump = launch === null && input.jumpPressed && canStartJump;
    if (launch !== null) {
      this.velocity.y = launch;
      this.grounded = false;
      this.jumpPhase = 0;
      this.jumpCoyoteTimer = 0;
    } else if (startsJump && this.velocity.y < this.getJumpSpeed()) {
      // Already rising faster than a jump (a stand launch): the press keeps it and starts no ramp.
      this.grounded = false;
      this.jumpPhase = 0;
      this.jumpCoyoteTimer = 0;
    } else if (startsJump) {
      this.velocity.y = this.getJumpSpeed();
      this.grounded = false;
      this.jumpPhase = 1;
      this.jumpCoyoteTimer = 0;
    } else if`, file);
    // multi-jump-relay: MultiPlayer air jumps (avatar +0x3f8 flag 2) up to +0xc90 per airtime (FUN_7ff72bb6f0e0).
    source = replaceOnce(source, '  pendingLaunchY: number | null = null;\n', `  pendingLaunchY: number | null = null;
  /** multi-jump-relay: MultiPlayer air jumps (+0x3f8 flag 2), jumps per airtime (+0xc90, < 1 = unlimited), airtime counter (ctrl+0x18). */
  airJumps = false;
  maxJumps = 0;
  jumpsUsed = 0;
  /** multi-jump-relay: set by update when a jump started, and when that jump's head was blocked (the runtime clears both). */
  jumpStarted = false;
  jumpHeadBlocked = false;
  /** jumparea-top-left: horizontal speed forced by a JumpArea launch until landing (per second; null = steering). */
  lockedVx: number | null = null;
`, file);
    source = replaceOnce(source, '    const canStartJump = wasGrounded || this.jumpCoyoteTimer > 0;\n', `    // multi-jump-relay: ground contact resets the airtime counter; flag 2 skips the ground / coyote test.
    if (wasGrounded) this.jumpsUsed = 0;
    const canStartJump = this.airJumps
      ? this.maxJumps < 1 || this.jumpsUsed < this.maxJumps
      : wasGrounded || this.jumpCoyoteTimer > 0;
    // jumparea-top-left: a launch overrides steering until the cat lands.
    if (wasGrounded && this.pendingLaunchY === null) this.lockedVx = null;
    if (this.lockedVx !== null) this.velocity.x = this.lockedVx;
`, file);
    source = replaceOnce(source, `    const result = moveRectWithTileCollisions(tileMap, this.rect, {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
    }, wasGrounded);
`, `    if (startsJump) {
      this.jumpStarted = true;
      this.jumpsUsed += 1;
    }
    const result = moveRectWithTileCollisions(tileMap, this.rect, {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
    }, wasGrounded);
    if (startsJump && this.velocity.y < 0 && result.velocity.y === 0) this.jumpHeadBlocked = true;
`, file);
    source = replaceOnce(source, '    this.grounded = result.grounded || remainsTileSupported;\n', `    this.grounded = result.grounded || remainsTileSupported;
    if (this.grounded) {
      this.jumpsUsed = 0;
      this.lockedVx = null;
    }
`, file);
    source = replaceOnce(source, '    this.jumpCoyoteTimer = 0;\n    this.deathTimer = 0;\n', `    this.jumpCoyoteTimer = 0;
    this.deathTimer = 0;
    this.jumpsUsed = 0;
    this.lockedVx = null;
    this.pendingLaunchY = null;
`, file);
    // jump-off-body-contact: a body below counts as ground for the jump gate and refreshes the coyote time.
    source = replaceOnce(source, `    if (wasGrounded) {
      this.jumpCoyoteTimer = JUMP_COYOTE_SECONDS;
    } else {`, `    if (wasGrounded || this.bodySupportContact) {
      this.jumpCoyoteTimer = JUMP_COYOTE_SECONDS;
    } else {`, file);
    source = replaceOnce(source, '      : wasGrounded || this.jumpCoyoteTimer > 0;', '      : wasGrounded || this.bodySupportContact || this.jumpCoyoteTimer > 0;', file);
    // native-walk-and-push-speed: walk 3 per tick (FUN_7ff72bb687e0 = 3.0 * 1.0); the 0.98 is a momentum decay, not a scale.
    source = replaceOnce(source, 'const MOVE_SPEED = 300;', 'const MOVE_SPEED = 3 * 60;', file);
    source = replaceOnce(source, 'const MOVE_AXIS_SCALE = 0.98;', 'const MOVE_AXIS_SCALE = 1;', file);
    // native-walk-and-push-speed: the takeoff tick integrates (0, J): no horizontal travel on the jump tick.
    source = replaceOnce(source, `    if (startsJump) {
      this.jumpStarted = true;
      this.jumpsUsed += 1;
    }`, `    if (startsJump) {
      this.jumpStarted = true;
      this.jumpsUsed += 1;
      this.velocity.x = 0;
    }`, file);
    // magnet-player: a holding MagnetPlayer cannot turn (owner +0x90 bit 4 'can turn' cleared, FUN_7ff72bae78f0 /
    // FUN_7ff72bae7950): it can walk backwards.
    source = replaceOnce(source, '  private spawnFacing: -1 | 1 = 1;\n',
      '  private spawnFacing: -1 | 1 = 1;\n  /** magnet-player: facing frozen while this cat\'s magnet holds something. */\n  facingLocked = false;\n', file);
    source = replaceOnce(source, '    if (this.velocity.x > 0) this.facing = 1;\n    else if (this.velocity.x < 0) this.facing = -1;',
      '    if (!this.facingLocked && this.velocity.x > 0) this.facing = 1;\n    else if (!this.facingLocked && this.velocity.x < 0) this.facing = -1;', file);
    return source;
  }
  if (file === 'src/engine/physics.ts') {
    // native-player-body: the 3-unit floor-rest inset only compensated for the old body starting 2 units
    // inside the floor. The native body (bottom = row point - 1) never starts inside a floor, and this
    // sweep never moves a rect into a tile, so walking and jumping use the full rect.
    source = replaceOnce(source, '  const xSweepRect: Rect = restingOnFloor ? insetBottom(next) : next;', '  const xSweepRect: Rect = next;', file);
    source = replaceOnce(source, '  const ySweepRect: Rect = (restingOnFloor && velocity.y < 0) ? insetBottom(next) : next;', '  const ySweepRect: Rect = next;', file);
    source = replaceOnce(source, '  const insetBottom = (r: Rect): Rect => ({ ...r, height: Math.max(1, r.height - FLOOR_REST_TOLERANCE) });\n', '  void restingOnFloor;\n', file);
    const oldComment = source.slice(source.indexOf('// Recovered Player actors are authored'), source.indexOf('const FLOOR_REST_TOLERANCE = 3;\n'));
    assert(oldComment.length > 0 && oldComment.length < 1200, 'Patch anchor changed: physics.ts floor-rest comment');
    return replaceOnce(source, oldComment + 'const FLOOR_REST_TOLERANCE = 3;\n',
      '// Sweeps stop a rect at contact; it never enters a tile (native-player-body removed the old floor-rest inset).\n', file);
  }
  if (file === 'src/engine/actors/BreakoutBall.ts') {
    // native-player-body: the browser rect IS the native {-16, -47, 32, 46} body now; no adapter offset.
    source = replaceOnce(source, 'const NATIVE_PLAYER_CONTACT_OFFSET_FROM_BROWSER_X = -3;', 'const NATIVE_PLAYER_CONTACT_OFFSET_FROM_BROWSER_X = 0;', file);
    source = replaceOnce(source, 'const NATIVE_PLAYER_CONTACT_OFFSET_FROM_BROWSER_Y = -15;', 'const NATIVE_PLAYER_CONTACT_OFFSET_FROM_BROWSER_Y = 0;', file);
    // breakout-paddle-dome: the head actor's r 25 circle at the row point + (0, -34) (FUN_7ff72bb6b720 / FUN_7ff72bb6b250).
    source = replaceOnce(source, "import { Container, Graphics } from 'pixi.js';", "import { Container, Graphics, Sprite } from 'pixi.js';\nimport { frameTexture } from '../sprites';", file);
    source = replaceOnce(source, 'const NATIVE_PLAYER_CONTACT_MASS = 100;\n', `const NATIVE_PLAYER_CONTACT_MASS = 100;
// breakout-paddle-dome: FUN_7ff72bb6b720 body = circle r 25 (DAT_7ff72c62d1c0), placed by FUN_7ff72bb6b250 at the
// avatar row point + (0, -34) (DAT_7ff72c62d1d0). The row point is the cat body {-16, -47, 32, 46} origin.
export const BREAKOUT_PADDLE_RADIUS = 25;
export const BREAKOUT_PADDLE_OFFSET_Y = -34;
export function breakoutPaddleCenter(playerRect: Rect): Vector2 {
  return { x: playerRect.x + 16, y: playerRect.y + 47 + BREAKOUT_PADDLE_OFFSET_Y };
}
`, file);
    // breakout-paddle-dome: only BreakoutPlayer avatars carry the head actor (the runtime says which).
    source = replaceOnce(source, '  tryApplyPlayerContact(previousPlayerRect: Rect, currentPlayerRect: Rect): boolean {',
      '  tryApplyPlayerContact(previousPlayerRect: Rect, currentPlayerRect: Rect, hasPaddleDome = false): boolean {', file);
    source = replaceOnce(source, `    const normal = mixedBodyContactNormal(
      this.playerContactFrameStartRect,
      this.rect,
      previousContactRect,
      currentContactRect,
    );
    if (!normal) return false;
`, `    // breakout-paddle-dome: the dome (radial normal through the paddle centre) first; the cat box is a second
    // surface with the same mass-100 response.
    const domeNormal = hasPaddleDome ? breakoutPaddleDomeNormal(this.center, currentContactRect) : undefined;
    if (domeNormal && this.applyHeavyBodyContact(domeNormal, previousContactRect, currentContactRect)) return true;
    const normal = mixedBodyContactNormal(
      this.playerContactFrameStartRect,
      this.rect,
      previousContactRect,
      currentContactRect,
    );
    if (!normal) return false;
    return this.applyHeavyBodyContact(normal, previousContactRect, currentContactRect);
  }

  /** FUN_7ff72bae64f0 against a mass-100 body (the cat box or its paddle dome); n points from the ball to the body. */
  private applyHeavyBodyContact(normal: Vector2, previousContactRect: Rect, currentContactRect: Rect): boolean {
`, file);
    source = replaceOnce(source, '    this.view.addChild(this.body);\n', `    this.view.addChild(this.body);
    // breakout-paddle-dome: native ball frames, view {-12, -12, 24, 24} (base BreakoutBall only).
    const ballTexture = new.target === BreakoutBall ? frameTexture((owner ? 'breakout_ball' : 'breakout_ball_free') as any) : undefined;
    if (ballTexture) {
      const sprite = new Sprite(ballTexture);
      sprite.anchor.set(0.5);
      sprite.width = BREAKOUT_BALL_DIAMETER;
      sprite.height = BREAKOUT_BALL_DIAMETER;
      this.view.addChild(sprite);
      this.body.visible = false;
    }
`, file);
    source += `
/** breakout-paddle-dome: n from the ball centre to the paddle centre while the circles overlap. */
function breakoutPaddleDomeNormal(ballCenter: Vector2, playerRect: Rect): Vector2 | undefined {
  const paddle = breakoutPaddleCenter(playerRect);
  const dx = paddle.x - ballCenter.x;
  const dy = paddle.y - ballCenter.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance >= BREAKOUT_PADDLE_RADIUS + BREAKOUT_BALL_RADIUS) return undefined;
  return { x: dx / distance, y: dy / distance };
}
`;
    return source;
  }
  if (file === 'src/engine/picoStyle.ts') {
    // native-lift-and-ledge-look: the MC_BW* ledge is stage orange in the original (retail capture, 1-4).
    return replaceOnce(source, "  if (chip.startsWith('MC_B')) return 0xb0784f;",
      "  if (chip.startsWith('MC_BW')) return PICO_PLATFORM;\n  if (chip.startsWith('MC_B')) return 0xb0784f;", file);
  }
  if (file === 'src/engine/actors/WeightedLift.ts') {
    // native-lift-and-ledge-look: UpDownLift = native 118 x 18 body + orange atlas slab; weighted lifts orange.
    source = replaceOnce(source, `    const travel = this.params?.travel ?? 0;
    const guideX`, `    if (spawn.actorName === 'UpDownLift') {
      // FUN_7ff72bb6d980: body {-59, -9, 118, 18}, view {-60, -10, 120, 20} from atlas (385,49,60,10).
      this.rect.x = spawn.x - 59; this.rect.y = spawn.y - 9; this.rect.width = 118; this.rect.height = 18;
      this.bodyOffsetY = -9;
      const slab = frameTexture('updown_lift' as AtlasFrameName);
      if (slab) {
        const sprite = new Sprite(slab);
        sprite.x = -60; sprite.y = -10; sprite.width = 120; sprite.height = 20;
        this.view.addChild(sprite);
        return;
      }
    }
    if (spawn.actorName !== 'Lift' && !isDarknessWeightedLift) {
      // Native lifts are stage orange (#ff864d), never the old translucent blue debug look.
      const slab = new Graphics();
      slab.beginFill(0xff864d, 1);
      slab.drawRoundedRect(this.rect.x - spawn.x, this.rect.y - spawn.y, this.rect.width, this.rect.height,
        Math.round(Math.min(this.rect.width, this.rect.height) * 0.28));
      slab.endFill();
      this.view.addChild(slab);
      return;
    }

    const travel = this.params?.travel ?? 0;
    const guideX`, file);
    // native-weighted-lift: body offset below the view anchor, the sign text and the wide native body.
    source = replaceOnce(source, "import { Container, Graphics, Sprite } from 'pixi.js';", "import { Container, Graphics, Sprite, Text } from 'pixi.js';", file);
    source = replaceOnce(source, '  readonly rect: Rect;\n', `  readonly rect: Rect;
  /** rect.y - view.y: centred lifts -height/2; the native wide WeightedLift body sits 67 below its row point. */
  bodyOffsetY = 0;
  private signText?: Text;
  setSignNumber(count: number): void {
    if (this.signText && this.signText.text !== String(count)) this.signText.text = String(count);
  }
`, file);
    source = replaceOnce(source, `    if (spawn.actorName !== 'Lift' && !isDarknessWeightedLift) {
      // Native lifts`, `    this.bodyOffsetY = isDarknessWeightedLift ? 0 : this.rect.y - spawn.y;
    if (spawn.actorName === 'WeightedLift') {
      // FUN_7ff72bb63cf0 wide variant: body {-92, 67, 194, 18}; sprite {-93, 0, 196, 84} from atlas (351,511,98,42);
      // FUN_7ff72bb64640: the sign shows the bodies still needed at (x+5, y+7), size 32.
      this.rect.x = spawn.x - 92; this.rect.y = spawn.y + 67; this.rect.width = 194; this.rect.height = 18;
      this.bodyOffsetY = 67;
      const art = frameTexture('weighted_lift_wide' as AtlasFrameName);
      if (art) {
        const sprite = new Sprite(art);
        sprite.x = -93; sprite.y = 0; sprite.width = 196; sprite.height = 84;
        this.view.addChild(sprite);
      } else {
        const slab = new Graphics();
        slab.beginFill(0xff864d, 1);
        slab.drawRoundedRect(-92, 67, 194, 18, 5);
        slab.endFill();
        this.view.addChild(slab);
      }
      this.signText = new Text('', { fontFamily: 'monospace', fontSize: 32, fontWeight: 'bold', fill: 0xff864d });
      this.signText.anchor.set(0.5, 0);
      this.signText.x = 5; this.signText.y = 7;
      this.view.addChild(this.signText);
      return;
    }
    if (spawn.actorName !== 'Lift' && !isDarknessWeightedLift) {
      // Native lifts`, file);
    source = replaceOnce(source, '    this.view.y = this.spawn.y + offset;\n    this.rect.y = this.view.y - LIFT_HEIGHT / 2;',
      '    this.view.y = this.spawn.y + offset;\n    this.rect.y = this.view.y - this.rect.height / 2;', file);
    // lift-horizontal-carry: FUN_7ff72bb550a0 Lift = the UpDownLift body {-59, -9, 118, 18} and orange atlas slab.
    source = replaceOnce(source, "    if (spawn.actorName === 'UpDownLift') {\n", "    if (spawn.actorName === 'UpDownLift' || spawn.actorName === 'Lift') {\n", file);
    source = replaceOnce(source, '    this.rect.x = this.view.x - LIFT_WIDTH / 2;\n    this.rect.y = this.view.y - LIFT_HEIGHT / 2;',
      '    this.rect.x = this.view.x - this.rect.width / 2;\n    this.rect.y = this.view.y - this.rect.height / 2;', file);
    // weighted-lift-ex-variants: FUN_7ff72bb63cf0(obj, 0.0, name == "WeightedLiftEx2"): Ex wide, Ex2 narrow.
    source = replaceOnce(source, "    if (spawn.actorName === 'WeightedLift') {\n      // FUN_7ff72bb63cf0 wide variant", `    if (spawn.actorName === 'WeightedLiftEx' || spawn.actorName === 'WeightedLiftEx2') {
      // DAT_7ff72c62d108 wide {-92, 67, 194, 18} / DAT_7ff72c62d118 narrow {-28, 67, 56, 18}; narrow sprite (383,559,34,42)
      // drawn {-34, 0, 68, 84}; FUN_7ff72bb64640 sign at (x + (narrow ? 0 : 5), y + 7).
      const narrow = spawn.actorName === 'WeightedLiftEx2';
      this.rect.x = spawn.x + (narrow ? -28 : -92); this.rect.y = spawn.y + 67;
      this.rect.width = narrow ? 56 : 194; this.rect.height = 18;
      this.bodyOffsetY = 67;
      const art = frameTexture((narrow ? 'weighted_lift_narrow' : 'weighted_lift_wide') as AtlasFrameName);
      if (art) {
        const sprite = new Sprite(art);
        sprite.x = narrow ? -34 : -93; sprite.y = 0; sprite.width = narrow ? 68 : 196; sprite.height = 84;
        this.view.addChild(sprite);
      } else {
        const slab = new Graphics();
        slab.beginFill(0xff864d, 1);
        slab.drawRoundedRect(narrow ? -28 : -92, 67, narrow ? 56 : 194, 18, 5);
        slab.endFill();
        this.view.addChild(slab);
      }
      this.signText = new Text('', { fontFamily: 'monospace', fontSize: 32, fontWeight: 'bold', fill: 0xff864d });
      this.signText.anchor.set(0.5, 0);
      this.signText.x = narrow ? 0 : 5; this.signText.y = 7;
      this.view.addChild(this.signText);
      return;
    }
    if (spawn.actorName === 'WeightedLift') {
      // FUN_7ff72bb63cf0 wide variant`, file);
    return source;
  }
  if (file === 'src/engine/sprites.ts') {
    const frames = Array.from({ length: 9 }, (_, i) =>
      `  push_box_${i}: [${464 + i % 3 * 16}, ${32 + Math.floor(i / 3) * 16}, 16, 16],`).join('\n');
    source = replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n  door_closed: [96, 512, 48, 48],\n  updown_lift: [385, 49, 60, 10],\n  weighted_lift_wide: [351, 511, 98, 42],\n  weighted_lift_narrow: [383, 559, 34, 42],\n  thunder_0: [160, 400, 32, 32],\n  thunder_1: [192, 400, 32, 32],\n  thunder_cap: [192, 436, 16, 4],\n  step_enemy: [358, 8, 25, 14],\n  updown_enemy: [385, 0, 30, 26],\n  move_wall: [500, 255, 9, 130],\n' + frames, file);
    // breakout-paddle-dome: paddle (DAT_7ff72c61f570[0]) and ball atlas frames (player-bound / free).
    source = replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n  breakout_paddle: [288, 464, 24, 12],\n  breakout_ball: [256, 512, 12, 12],\n  breakout_ball_free: [272, 496, 12, 12],', file);
    // bound-ball-pitcher / laser-ball-pitcher / laser-key-box: cannon barrel (DAT_7ff72bcb7300), base (DAT_7ff72bcb72f0),
    // LaserKeyBox hit frames (DAT_7ff72bcbaf10).
    source = replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n  ball_cannon_barrel: [240, 400, 23, 29],\n  ball_cannon_base: [240, 432, 26, 20],\n  laser_key_box_0: [288, 480, 23, 31],\n  laser_key_box_1: [320, 480, 23, 31],\n  laser_key_box_2: [352, 480, 23, 31],', file);
    // magnet-player: the aux sprite (ctor FUN_7ff72bb59090: atlas (208, 496) 11 x 15).
    source = replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n  magnet_auxiliary: [208, 496, 11, 15],', file);
    return source;
  }
  if (file === 'src/engine/actors/Goal.ts') {
    source = replaceOnce(source, '  readonly rect: Rect;', `  readonly rect: Rect;
  opened = false;
  setOpened(opened: boolean): void {
    this.opened = opened;
    const sprite = this.view.children[0];
    const texture = frameTexture(opened ? 'door_black' : 'door_closed');
    if (sprite instanceof Sprite && texture) sprite.texture = texture;
  }
  /** goal-native-open-and-door: FUN_7ff72bb52c20 view {-32, -64, 64, 64} (the 48 x 48 frame at 4/3) with its
   *  bottom on the row point; FUN_7ff72bb53000 sensor {-24, -32 - p0, 48, 32 + p0}. */
  applyNativeDoor(sensorExtraHeight: number): void {
    const x = this.view.x;
    const y = this.view.y;
    Object.assign(this.rect, { x: x - 24, y: y - 32 - sensorExtraHeight, width: 48, height: 32 + sensorExtraHeight });
    const sprite = this.view.children[0];
    if (sprite instanceof Sprite) {
      sprite.scale.set(64 / 48);
      sprite.y = 0;
    }
  }`, file);
    return replaceOnce(source, "const texture = frameTexture('door_black');", "const texture = frameTexture('door_closed');", file);
  }
  if (file === 'src/engine/actors/PushBox.ts') {
    // push-box-sky-respawn: remember the spawn rectangle (feet-anchored, set at stage load).
    source = replaceOnce(source, '  rect: Rect;\n', '  rect: Rect;\n  /** Where the stage placed this box; it returns here from the sky after a fall. */\n  readonly spawnRect: Rect;\n', file);
    source = replaceOnce(source, '    // PICO PARK push boxes are white', '    this.spawnRect = { ...this.rect };\n\n    // PICO PARK push boxes are white', file);
    source = replaceOnce(source, "import { Container, Graphics, Text, TextStyle }", "import { Container, Graphics, Sprite, Text, TextStyle }", file);
    source = "import { frameTexture } from '../sprites';\n" + source;
    // push-box-head-carry (native rewrite): a rising cat meets a box above it and stops at its underside;
    // it never passes into it. (Native FUN_7ff72bb6f0e0 never sets a jump velocity while a body touches
    // above, via the unfiltered FUN_7ff72bb5b630(body, 0, 1, 0) gate. Its local_174 is a SIDE step-up
    // assist from contacts in directions 3 / 2, not a headroom cap, as an earlier comment wrongly said.)
    // head-stack-jump-impulse: a box remembers a requested hop and whether it is in one.
    source = replaceOnce(source, '  falling = false;\n', '  falling = false;\n  /** head-stack-jump-impulse: a hop handed up from the cat below, applied in the box update. */\n  hopRequested = false;\n  /** head-stack-jump-impulse: in a hop; lands with the exact-landing resolve. */\n  hopping = false;\n', file);
    source = replaceOnce(source, '    let pushDelta = 0;\n    let resolvedPlayerX = playerRect.x;', `    if (playerVelocity.y < 0 && previousPlayerRect.y >= box.y + box.height - 0.5) {
      playerRect = { ...playerRect, y: box.y + box.height };
      playerVelocityOut.y = 0;
      blocked = true;
      continue;
    }

    let pushDelta = 0;
    let resolvedPlayerX = playerRect.x;`, file);
    source = replaceOnce(source, '    this.view.addChild(g);', `    const cornerX = Math.min(24, resolvedWidth / 2);
    const cornerY = Math.min(24, resolvedHeight / 2);
    const widths = [cornerX, resolvedWidth - 2 * cornerX, cornerX];
    const heights = [cornerY, resolvedHeight - 2 * cornerY, cornerY];
    const xs = [0, cornerX, resolvedWidth - cornerX];
    const ys = [0, cornerY, resolvedHeight - cornerY];
    const textures = Array.from({ length: 9 }, (_, i) => frameTexture(('push_box_' + i) as any));
    if (textures.every(Boolean)) {
      g.destroy();
      textures.forEach((texture, i) => {
        const sprite = new Sprite(texture);
        sprite.position.set(xs[i % 3], ys[Math.floor(i / 3)]);
        sprite.width = widths[i % 3]; sprite.height = heights[Math.floor(i / 3)];
        this.view.addChild(sprite);
      });
    } else this.view.addChild(g);`, file);
    // colorbox-colour-push: the player colour whose cat alone pushes this box (FUN_7ff72bb3b5e0 / FUN_7ff72bb3c2e0).
    source = replaceOnce(source, '  falling = false;\n', '  falling = false;\n  /** colorbox-colour-push: the player slot colour that pushes this ColorBox (undefined for other boxes). */\n  colorIndex?: number;\n  /** normal-small-box-are-pushboxes / colorbox-colour-push: falls when unsupported in every stage (FUN_7ff72bb33890 -> FUN_7ff72bb34c40). */\n  nativeFall = false;\n', file);
    // colorbox-colour-push (box pushes box, FUN_7ff72bb343e0): a push into another box moves the line when each box
    // in it meets its requirement with the pushers plus the boxes in front of them; a solid ends the line.
    source = replaceOnce(source, '  canMoveBox?: (index: number, sign: number) => boolean,',
      '  canMoveBox?: (index: number, sign: number, chain?: { lead: number; bodies: number }) => boolean,', file);
    source = replaceOnce(source, `    const destinationHitsBox = boxRects.some((otherBox, otherIndex) => (
      otherIndex !== i && rectsOverlap(destination, otherBox)
    ));

    const enoughPushers = !canMoveBox || canMoveBox(i, Math.sign(pushDelta));
    if (!destinationHitsSolid && !destinationHitsBox && enoughPushers) {
      boxRects[i] = destination;
      movedBoxIndex = i;
    }`, `    const enoughPushers = !canMoveBox || canMoveBox(i, Math.sign(pushDelta));
    const followers = !destinationHitsSolid && enoughPushers
      ? planPushBoxLine(i, destination, Math.sign(pushDelta), boxRects, map, canMoveBox)
      : null;
    if (followers) {
      boxRects[i] = destination;
      for (const [index, rect] of followers) boxRects[index] = rect;
      movedBoxIndex = i;
    }`, file);
    source += `
/** colorbox-colour-push: the boxes a pushed box drives in front of it (breadth-first from the lead), or null when a
 *  solid or an under-pushed box ends the line (FUN_7ff72bb343e0). depth = the boxes already moving behind it. */
function planPushBoxLine(
  lead: number,
  leadRect: Rect,
  sign: number,
  boxRects: readonly Rect[],
  map: PushBoxCollisionMap,
  canMoveBox?: (index: number, sign: number, chain?: { lead: number; bodies: number }) => boolean,
): Map<number, Rect> | null {
  const planned = new Map<number, Rect>();
  const frontier: Array<{ rect: Rect; depth: number }> = [{ rect: leadRect, depth: 1 }];
  while (frontier.length > 0) {
    const { rect, depth } = frontier.shift()!;
    for (let index = 0; index < boxRects.length; index += 1) {
      if (index === lead || planned.has(index)) continue;
      const other = boxRects[index];
      if (!rectsOverlap(rect, other) || !hasVerticalOverlap(rect, other)) continue;
      const next = { ...other, x: sign > 0 ? rect.x + rect.width : rect.x - other.width };
      if (map.rectHitsSolid(next, { axis: 'x', sign, previousRect: other })) return null;
      if (canMoveBox && !canMoveBox(index, sign, { lead, bodies: depth })) return null;
      planned.set(index, next);
      frontier.push({ rect: next, depth: depth + 1 });
    }
  }
  return planned;
}
`;
    // jumpstand-launch: the sideways part of a stand launch, applied while airborne with nothing on top (per second).
    source = replaceOnce(source, '  velocityY = 0;\n', '  velocityY = 0;\n  launchX = 0;\n', file);
    // native-walk-and-push-speed: a moved box leaves its pusher flush against its new face.
    source = replaceOnce(source, `    if (followers) {
      boxRects[i] = destination;
      for (const [index, rect] of followers) boxRects[index] = rect;
      movedBoxIndex = i;
    }`, `    if (followers) {
      boxRects[i] = destination;
      for (const [index, rect] of followers) boxRects[index] = rect;
      movedBoxIndex = i;
      resolvedPlayerX = flushPlayerX;
    }`, file);
    // pushbox-general-fall: the runtime may stop a push step where the box first loses all support (native 1 per tick).
    source = replaceOnce(source, `  canMoveBox?: (index: number, sign: number, chain?: { lead: number; bodies: number }) => boolean,
): PushBoxCollisionResult {`, `  canMoveBox?: (index: number, sign: number, chain?: { lead: number; bodies: number }) => boolean,
  limitPush?: (index: number, from: Rect, to: Rect) => Rect,
): PushBoxCollisionResult {`, file);
    source = replaceOnce(source, `    const destination = { ...box, x: box.x + pushDelta };
    const destinationHitsSolid = map.rectHitsSolid(destination, {`, `    const unlimited = { ...box, x: box.x + pushDelta };
    const destination = limitPush ? limitPush(i, box, unlimited) : unlimited;
    // native-walk-and-push-speed: the pusher is stopped by the box face where the box ends this tick.
    const flushPlayerX = pushDelta > 0 ? destination.x - playerRect.width : destination.x + destination.width;
    const destinationHitsSolid = map.rectHitsSolid(destination, {`, file);
    return source;
  }
  if (file === 'src/engine/actors/KeyGate.ts') {
    source = replaceOnce(source, '    this.rect = { x: spawn.x - 8, y: spawn.y - 32, width: 16, height: 64 };', `    const [countValue, dxValue, dyValue, sizeValue] = spawn.raw.slice(6);
    const count = Math.max(1, Number(countValue) || 1), size = Number(sizeValue) || 32;
    const length = Math.hypot(Number(dxValue), Number(dyValue)) || 1;
    const dx = (Number(dxValue) || 0) / length, dy = (Number(dyValue) || 0) / length;
    const horizontal = Math.abs(dy) <= 1.1920928955078125e-7;
    const endX = dx * (count - 1) * size, endY = dy * (count - 1) * size;
    this.rect = { x: spawn.x + Math.min(0, endX), y: spawn.y + Math.min(0, endY),
      width: Math.abs(endX) + size + Number(horizontal),
      height: Math.abs(endY) + size + Number(!horizontal) };`, file);
    const begin = source.indexOf('    g.beginFill(0x4f8cff, 0.9);');
    const end = source.indexOf('    this.view.addChild(g);', begin);
    if (begin < 0 || end < begin) throw new Error('Gate artwork anchor changed');
    source = source.slice(0, begin) + `    g.beginFill(0xff864d, 1);
    g.drawRoundedRect(this.rect.x - spawn.x, this.rect.y - spawn.y, this.rect.width, this.rect.height, 4);
    g.endFill();
` + source.slice(end);
    // bridge-folded-start-and-motion (Gate = FUN_7ff72bb4f630 type 1): starts extended; opened -> shrinks into the
    // row cell at 2 units per tick; closed -> grows back at 1 per tick (FUN_7ff72bb4fea0 / FUN_7ff72bb4f230).
    source = `import { segmentExtent, drawSegmentStrip, type SegmentMotion } from './Bridge';
` + source;
    source = replaceOnce(source, '      height: Math.abs(endY) + size + Number(!horizontal) };', `      height: Math.abs(endY) + size + Number(!horizontal) };
    this.segmentMotion = { length: (count - 1) * size, progress: (count - 1) * size, target: (count - 1) * size, speed: 1,
      dirX: dx, dirY: dy, cellW: size + Number(horizontal), cellH: size + Number(!horizontal), headPush: false };`, file);
    source = replaceOnce(source, `  open(): void {
    this.opened = true;
    this.view.visible = false;
  }

  close(): void {
    this.opened = false;
    this.view.visible = true;
  }`, `  segmentMotion?: SegmentMotion;

  isSolid(): boolean {
    return this.segmentMotion ? true : !this.opened;
  }

  extentAt(progress: number): Rect {
    return segmentExtent(this.spawn, this.segmentMotion!, progress);
  }

  applyProgress(progress: number): void {
    if (!this.segmentMotion) return;
    this.segmentMotion.progress = progress;
    Object.assign(this.rect, this.extentAt(progress));
    drawSegmentStrip(this.view, this.rect, this.spawn);
  }

  open(): void {
    this.opened = true;
    if (this.segmentMotion) {
      this.segmentMotion.target = 0;
      this.segmentMotion.speed = 2;
      return;
    }
    this.view.visible = false;
  }

  close(): void {
    this.opened = false;
    if (this.segmentMotion) {
      this.segmentMotion.target = this.segmentMotion.length;
      this.segmentMotion.speed = 1;
      return;
    }
    this.view.visible = true;
  }`, file);
    // fallbox-solid-while-armed: a cat that sank a little into the body it stands on is set back on top of it before
    // any side push, so it walks across level seams (FallBox body -> Rect, both tops 336) as it does on native bodies,
    // where the down contact zeroes vy and the feet never dip (FUN_7ff72bc13690 / FUN_7ff72bc304f0).
    source = replaceOnce(source, `  for (const gate of closedGateRects) {
    if (!rectsOverlap(rect, gate)) continue;

    const previousRight = previousRect.x + previousRect.width;`, `  const landings = closedGateRects.filter((gate) => previousRect.y + previousRect.height <= gate.y);
  const ordered = [...landings, ...closedGateRects.filter((gate) => !landings.includes(gate))];
  for (const gate of ordered) {
    if (!rectsOverlap(rect, gate)) continue;
    if (landings.includes(gate) && velocity.y >= 0) {
      // It was above this body's top last frame: it is standing on it, whatever its sideways motion.
      rect = { ...rect, y: gate.y - rect.height };
      outVelocity.y = 0;
      grounded = true;
      blocked = true;
      continue;
    }

    const previousRight = previousRect.x + previousRect.width;`, file);
    return source;
  }
  if (file === 'src/engine/actors/Bridge.ts') {
    source = replaceOnce(source, 'const segmentWidth = horizontalSegment ? segmentSize : segmentSize + 1;', 'const segmentWidth = horizontalSegment ? segmentSize + 1 : segmentSize;', file);
    source = replaceOnce(source, 'const segmentHeight = horizontalSegment ? segmentSize + 1 : segmentSize;', 'const segmentHeight = horizontalSegment ? segmentSize : segmentSize + 1;', file);
    for (const [before, after] of [
      ['Math.min(-segmentWidth / 2, endCenterX - segmentWidth / 2)', 'Math.min(0, endCenterX)'],
      ['Math.max(segmentWidth / 2, endCenterX + segmentWidth / 2)', 'Math.max(0, endCenterX) + segmentWidth'],
      ['Math.min(-segmentHeight / 2, endCenterY - segmentHeight / 2)', 'Math.min(0, endCenterY)'],
      ['Math.max(segmentHeight / 2, endCenterY + segmentHeight / 2)', 'Math.max(0, endCenterY) + segmentHeight'],
      ['const width = horizontalSegment ? params.segmentSize : params.segmentSize + 1;', 'const width = horizontalSegment ? params.segmentSize + 1 : params.segmentSize;'],
      ['const height = horizontalSegment ? params.segmentSize + 1 : params.segmentSize;', 'const height = horizontalSegment ? params.segmentSize : params.segmentSize + 1;'],
      ['x: spawn.x - width / 2,', 'x: spawn.x,'], ['y: spawn.y - height / 2,', 'y: spawn.y,'],
    ]) source = replaceOnce(source, before, after, file);
    // bridge-folded-start-and-motion: a solid strip whose length follows commands 9 / 10 at 2 / 1 units per tick.
    source = replaceOnce(source, '  private usesSegmentCommands = false;\n  opened = false;\n', `  private usesSegmentCommands = false;
  opened = false;
  /** bridge-folded-start-and-motion: head distance from the row cell (progress), its target and speed per tick. */
  segmentMotion?: SegmentMotion;
  private partyCount = 2;

  setPartyCount(count: number): void {
    this.partyCount = count;
  }

  isSolid(): boolean {
    return this.segmentMotion ? true : !this.opened;
  }

  extentAt(progress: number): Rect {
    return segmentExtent(this.spawn, this.segmentMotion!, progress);
  }

  applyProgress(progress: number): void {
    if (!this.segmentMotion) return;
    this.segmentMotion.progress = progress;
    Object.assign(this.rect, this.extentAt(progress));
    drawSegmentStrip(this.view, this.rect, this.spawn);
  }
`, file);
    source = replaceOnce(source, `  enableSegmentCommandMode(): void {
    if (this.spawn.actorName !== 'Bridge') return;
    this.usesSegmentCommands = true;
    this.retract();
  }`, `  enableSegmentCommandMode(): void {
    if (this.spawn.actorName !== 'Bridge' && this.spawn.actorName !== 'KeyBridge') return;
    this.usesSegmentCommands = true;
    const p = this.params;
    if (p.segmentCount === undefined || p.segmentSize === undefined || p.directionX === undefined || p.directionY === undefined) {
      this.retract();
      return;
    }
    const horizontal = Math.abs(p.directionX) > ENGINE_AXIS_EPSILON;
    const length = p.segmentSize * (p.segmentCount - 1);
    const row = this.spawn.raw.slice(6);
    const preExtension = typeof row[3] === 'number' ? Math.trunc(row[3]) : 0;
    // FUN_7ff72bb72ae0 0x7ff72bb76d0d..0x7ff72bb76d5f: m = trunc(p3 (8 - N) 0.1); 8 - N is unsigned (N > 8 wraps huge).
    const cells = preExtension <= 0 ? 0
      : this.partyCount > 8 ? Infinity
        : Math.trunc(Math.fround(Math.fround(preExtension * (8 - this.partyCount)) * Math.fround(0.1)));
    const start = Math.min(length, cells * p.segmentSize);
    this.segmentMotion = {
      length, progress: start, target: start, speed: 2, dirX: p.directionX, dirY: p.directionY,
      cellW: horizontal ? p.segmentSize + 1 : p.segmentSize, cellH: horizontal ? p.segmentSize : p.segmentSize + 1,
      headPush: typeof row[5] === 'number' && Math.trunc(row[5]) > 0,
    };
    this.opened = true;
    this.applyProgress(start);
  }`, file);
    source = replaceOnce(source, '  private deploy(): void {\n', `  private deploy(): void {
    if (this.segmentMotion) {
      this.segmentMotion.target = this.segmentMotion.length;
      this.segmentMotion.speed = 2;
      this.opened = false;
      return;
    }
`, file);
    source = replaceOnce(source, '  private retract(): void {\n', `  private retract(): void {
    if (this.segmentMotion) {
      this.segmentMotion.target = 0;
      this.segmentMotion.speed = 1;
      this.opened = true;
      return;
    }
`, file);
    source += `
/** bridge-folded-start-and-motion: shared by Bridge / KeyBridge / Gate (FUN_7ff72bb4f630 segment platforms). */
export interface SegmentMotion {
  length: number;
  progress: number;
  target: number;
  speed: number;
  dirX: number;
  dirY: number;
  cellW: number;
  cellH: number;
  headPush: boolean;
}

/** The union of the segments when the head is 'progress' along the direction from the row cell. */
export function segmentExtent(spawn: ActorSpawnDef, motion: SegmentMotion, progress: number): Rect {
  const endX = motion.dirX * progress;
  const endY = motion.dirY * progress;
  return {
    x: spawn.x + Math.min(0, endX),
    y: spawn.y + Math.min(0, endY),
    width: Math.abs(endX) + motion.cellW,
    height: Math.abs(endY) + motion.cellH,
  };
}

/** The 16 px orange cells (atlas (240,576) family) drawn as one rounded strip. */
export function drawSegmentStrip(view: Container, rect: Rect, spawn: ActorSpawnDef): void {
  for (const child of view.removeChildren()) child.destroy();
  const g = new Graphics();
  g.lineStyle(0, 0, 0);
  g.beginFill(0xff864d, 1);
  g.drawRoundedRect(rect.x - spawn.x, rect.y - spawn.y, rect.width, rect.height,
    Math.round(Math.min(rect.width, rect.height) * 0.28));
  g.endFill();
  view.addChild(g);
  view.visible = true;
}
`;
    return source;
  }
  if (file === 'src/engine/actors/StaticRect.ts') {
    // rect-left-bottom-anchor: StaticRect may be given its rectangle; the literal Rect rule lives here.
    source = replaceOnce(source, '  constructor(readonly spawn: ActorSpawnDef) {\n    this.rect = getStaticRectRect(spawn);',
      '  constructor(readonly spawn: ActorSpawnDef, rect: Rect = getStaticRectRect(spawn)) {\n    this.rect = rect;', file);
    return source + `
/** Native literal Rect (FUN_7ff72bb72ae0 + FUN_7ff72bb77c10): local {0, -H, |W|, H} at the spawn, the origin
 *  moved left by |W| when the width is negative. Downward-Y: x spawn..spawn+W (signed), y spawn-H..spawn. */
export function getRectLeftBottomRect(spawn: ActorSpawnDef): Rect {
  const { width, height } = findDimensionsAfterCoordinatePair(spawn.raw, spawn.x, spawn.y);
  const signedWidth = typeof width === 'number' && Number.isFinite(width) && width !== 0 ? width : DEFAULT_STATIC_RECT_SIZE;
  const absHeight = nonZeroFiniteAbsOrDefault(height, DEFAULT_STATIC_RECT_SIZE);
  return {
    x: signedWidth < 0 ? spawn.x + signedWidth : spawn.x,
    y: spawn.y - absHeight,
    width: Math.abs(signedWidth),
    height: absHeight,
  };
}

/** rect-party-terms: FUN_7ff72bb72ae0 Rect / DarknessRect branch (0x7ff72bb76872..0x7ff72bb7696b). Params read as
 *  FUN_7ff72bb389b0 does (absent or non-number = 0). k = party - 2; W = p0 + p2 k, H = p1 + p3 k; with more than 4
 *  params the origin moves by (p4 k, p5 k); a negative W moves the origin left by |W|; local rect {0, -H, W, H}.
 *  partyTerms = false is the SwitchRect branch (0x7ff72bb7633f: W = p0, H = p1 only). */
export function getNativeRectRect(spawn: ActorSpawnDef, partyCount: number, partyTerms = true): Rect {
  const params = spawn.raw.slice(6);
  const param = (index: number): number => {
    const value = params[index];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const k = partyTerms ? Math.max(0, partyCount - 2) : 0;
  let width = param(0) + param(2) * k;
  const height = param(1) + param(3) * k;
  let x = spawn.x;
  let y = spawn.y;
  if (partyTerms && params.length > 4) {
    x += param(4) * k;
    y += param(5) * k;
  }
  if (width < 0) {
    x += width;
    width = -width;
  }
  return { x, y: y - height, width, height };
}

/** rect-party-terms: FUN_7ff72bb5b820 / FUN_7ff72bb5bcb0 draw the same orange 9-slice (UV table DAT_7ff72bcbbdf0..). */
export function drawNativeRectSlab(view: Container, rect: Rect, originX: number, originY: number): void {
  const g = new Graphics();
  g.lineStyle(0, 0, 0);
  g.beginFill(0xff864d, 1);
  g.drawRoundedRect(rect.x - originX, rect.y - originY, rect.width, rect.height, Math.round(Math.min(rect.width, rect.height) * 0.28));
  g.endFill();
  view.addChild(g);
}
`;
  }
  if (file === 'src/engine/actors/DarknessRect.ts') {
    // rect-party-terms: native left-bottom rect with party terms (same branch as Rect), stage orange.
    source = `import { drawNativeRectSlab } from './StaticRect';
` + source;
    source = replaceOnce(source, `  constructor(readonly spawn: ActorSpawnDef) {
    this.params = parseDarknessRectParamsFromSpawn(spawn);
    this.rect = {`,
      `  constructor(readonly spawn: ActorSpawnDef, nativeRect?: Rect) {
    this.params = parseDarknessRectParamsFromSpawn(spawn);
    this.rect = nativeRect ?? {`, file);
    return replaceOnce(source, `    this.view.alpha = 0.72;
`, `    this.view.alpha = 0.72;
    if (nativeRect) {
      this.view.alpha = 1;
      drawNativeRectSlab(this.view, nativeRect, spawn.x, spawn.y);
      return;
    }
`, file);
  }
  if (file === 'src/engine/actors/SwitchRect.ts') {
    // rect-party-terms: SwitchRect is left-bottom (no party terms) and drawn in the stage orange.
    source = `import { drawNativeRectSlab, getNativeRectRect } from './StaticRect';
` + source;
    return replaceOnce(source, `    this.rect = { x: spawn.x - width / 2, y: spawn.y - height / 2, width, height };
    this.view.visible = false;
    const g = new Graphics();`, `    this.rect = getNativeRectRect(spawn, 2, false);
    this.view.visible = false;
    if (this.params) {
      drawNativeRectSlab(this.view, this.rect, spawn.x, spawn.y);
      return;
    }
    const g = new Graphics();`, file);
  }
  if (file === 'src/engine/actors/Thunder.ts') {
    // thunder-beam: the swept base length (0x7ff72bb4d600) and the native zigzag beam (FUN_7ff72bb4dc10).
    source = `import { Sprite, Texture, Rectangle } from 'pixi.js';
import { frameTexture } from '../sprites';
` + source;
    source = replaceOnce(source, '  animationFrame = 0;\n', `  animationFrame = 0;
  /** thunder-beam: L0 from the first-update sweep (2400 until swept); the live length is L0 cut by bodies. */
  baseLength = THUNDER_STRIP_LENGTH;
  swept = false;
  private drawnLength = -1;

  setBaseLength(length: number): void {
    this.baseLength = length;
    this.swept = true;
    Object.assign(this.rect, getThunderRectForLength(this.spawn, this.direction, length));
    this.setDrawLength(length);
  }

  activeLengthFor(blockerRects: readonly Rect[]): number {
    if (this.blockShorteningDisabled) return this.baseLength;
    return this.activeLengthForBlockers(blockerRects);
  }

  /** FUN_7ff72bb4dc10: floor(L / 32) + 1 zigzag tiles from y -5 outward (the last cropped), two frames, plus the cap. */
  setDrawLength(length: number): void {
    const rounded = Math.round(length);
    if (rounded === this.drawnLength) return;
    this.drawnLength = rounded;
    for (const child of this.view.removeChildren()) child.destroy();
    const angle = { DIR_UP: 0, DIR_RIGHT: Math.PI / 2, DIR_DOWN: Math.PI, DIR_LEFT: Math.PI * 1.5 }[this.direction as 'DIR_UP'] ?? 0;
    const frames = [frameTexture('thunder_0' as any), frameTexture('thunder_1' as any)];
    this.animationFrames.length = 0;
    for (let frame = 0; frame < 2; frame += 1) {
      const strip = new Graphics();
      strip.rotation = angle;
      const texture = frames[frame];
      for (let start = 5, i = 0; start < length && i <= Math.floor(length / 32); start += 32, i += 1) {
        const height = Math.min(32, length - start);
        if (texture) {
          const cropped = new Texture(texture.baseTexture, new Rectangle(texture.frame.x, texture.frame.y + (32 - height), 32, height));
          const tile = new Sprite(cropped);
          tile.x = -16; tile.y = -start - height;
          strip.addChild(tile);
        } else {
          // Headless: the same zigzag geometry in the stage orange.
          strip.lineStyle(2, 0xff864d, 1);
          strip.moveTo(frame ? 6 : -6, -start);
          strip.lineTo(frame ? -6 : 6, -start - height / 2);
          strip.lineTo(frame ? 6 : -6, -start - height);
        }
      }
      if (!this.blockShorteningDisabled) {
        const capTexture = frameTexture('thunder_cap' as any);
        if (capTexture) {
          const cap = new Sprite(capTexture);
          cap.x = -16; cap.y = -8; cap.width = 32; cap.height = 8;
          strip.addChild(cap);
        } else {
          strip.lineStyle(0, 0, 0);
          strip.beginFill(0xff864d, 1);
          strip.drawRect(-16, -8, 32, 8);
          strip.endFill();
        }
      }
      this.animationFrames.push(strip);
      this.view.addChild(strip);
    }
    this.applyAnimationFrame();
  }
`, file);
    source = replaceOnce(source, '  private readonly animationFrames: Graphics[] = [];', '  private animationFrames: Graphics[] = [];', file);
    source = replaceOnce(source, "    if (this.blockShorteningDisabled || blockerRects.length === 0) return { ...this.rect };",
      "    if (this.blockShorteningDisabled || blockerRects.length === 0) return getThunderRectForLength(this.spawn, this.direction, this.baseLength);", file);
    return replaceOnce(source, '    let activeLength = THUNDER_STRIP_LENGTH;\n', '    let activeLength = this.baseLength;\n', file);
  }
  if (file === 'src/engine/actors/StepEnemy.ts') {
    // step-enemy-native: FUN_7ff72bb6c6c0 body {-24, -13, 48, 26}; FUN_7ff72bb6cbe0 walks 1 per tick and falls 0.65.
    source = `import { Sprite } from 'pixi.js';
import { frameTexture } from '../sprites';
` + source;
    source = replaceOnce(source, 'export const STEP_ENEMY_WIDTH = 20;', 'export const STEP_ENEMY_WIDTH = 48;', file);
    source = replaceOnce(source, 'export const STEP_ENEMY_HEIGHT = 20;', 'export const STEP_ENEMY_HEIGHT = 26;', file);
    source = replaceOnce(source, 'export const STEP_ENEMY_PATROL_SPEED = 100;', 'export const STEP_ENEMY_PATROL_SPEED = 60;', file);
    source = replaceOnce(source, '    this.view.addChild(g);\n  }\n', `    this.view.addChild(g);
    // FUN_7ff72bb6ca10: p0 < 0 walks left; otherwise (p0 absent too) the ctor default walks right.
    this.walkDirection = (this.params?.direction ?? 0) < 0 ? -1 : 1;
    const texture = frameTexture('step_enemy' as any);
    if (texture) {
      g.destroy();
      const sprite = new Sprite(texture);
      sprite.x = -25; sprite.y = -14; sprite.width = 50; sprite.height = 28;
      if (this.walkDirection < 0) { sprite.scale.x *= -1; sprite.x = 25; }
      this.view.addChild(sprite);
    }
  }
`, file);
    source = replaceOnce(source, '  readonly rect: Rect;\n', '  readonly rect: Rect;\n  walkDirection: -1 | 1 = 1;\n  fallVelocity = 0;\n', file);
    const begin = source.indexOf('  update(dt: number, tileMap?: TileMap): void {');
    const end = source.indexOf('\n  }\n}\n', begin);
    if (begin < 0 || end < 0) throw new Error('Patch anchor changed: StepEnemy.update');
    source = source.slice(0, begin) + `  /** FUN_7ff72bb6cbe0: walk 1 unit per tick; reverse at a wall; fall 0.65 per tick squared while unsupported. */
  update(dt: number, tileMap?: TileMap, solids: readonly Rect[] = []): void {
    const blocked = (rect: Rect): boolean => !!tileMap?.rectHitsSolid(rect)
      || solids.some((solid) => rect.x < solid.x + solid.width && rect.x + rect.width > solid.x
        && rect.y < solid.y + solid.height && rect.y + rect.height > solid.y);
    const ground = { ...this.rect, y: this.rect.y + this.rect.height, height: 0.5 };
    if (blocked(ground)) {
      this.fallVelocity = 0;
    } else {
      this.fallVelocity = Math.min(19.5 * 60, this.fallVelocity + 0.65 * 3600 * dt);
      let fall = this.fallVelocity * dt;
      while (fall > 1e-6) {
        const stepY = Math.min(1, fall);
        if (blocked({ ...this.rect, y: this.rect.y + stepY })) {
          // land exactly on the support
          let low = 0, high = stepY;
          for (let pass = 0; pass < 16; pass += 1) {
            const middle = (low + high) / 2;
            if (blocked({ ...this.rect, y: this.rect.y + middle })) high = middle; else low = middle;
          }
          this.rect.y += low;
          this.fallVelocity = 0;
          break;
        }
        this.rect.y += stepY;
        fall -= stepY;
      }
    }
    const deltaX = this.walkDirection * STEP_ENEMY_PATROL_SPEED * dt;
    const next = { ...this.rect, x: this.rect.x + deltaX };
    if (blocked(next)) {
      this.walkDirection = this.walkDirection > 0 ? -1 : 1;
      const sprite = this.view.children[0] as { scale?: { x: number }; x: number } | undefined;
      if (sprite?.scale) { sprite.scale.x *= -1; sprite.x = -sprite.x; }
    } else {
      this.rect.x = next.x;
    }
    this.view.x = this.rect.x + this.rect.width / 2;
    this.view.y = this.rect.y + this.rect.height / 2;
` + source.slice(end);
    // stepenemy-unspawn: the native face-strip chip rule (FUN_7ff72bc304f0 / FUN_7ff72bc2fca0); no push-out.
    const nativeBegin = source.indexOf('  /** FUN_7ff72bb6cbe0: walk 1 unit per tick;');
    const nativeEnd = source.indexOf('    this.view.x = this.rect.x + this.rect.width / 2;', nativeBegin);
    if (nativeBegin < 0 || nativeEnd < 0) throw new Error('Patch anchor changed: StepEnemy native update');
    return source.slice(0, nativeBegin) + `  private wasWallContact = false;

  /** FUN_7ff72bb6cbe0 + the world sweep: walk 1 unit per tick, fall 0.65 per tick squared, turn on a new wall contact.
   *  Chips: a face strip 0.5 past the leading face (edges inclusive) blocks that axis; chips the body already
   *  overlaps never block it (FUN_7ff72bc304f0 / FUN_7ff72bc2fca0). Bodies: the rect test, minus bodies it overlaps. */
  update(dt: number, tileMap?: TileMap, solids: readonly Rect[] = []): void {
    const chip = tileMap?.map.chipSize ?? 48;
    const solidCell = (tx: number, ty: number): boolean => !!tileMap
      && tx >= 0 && ty >= 0 && tx < tileMap.map.width && ty < tileMap.map.height && tileMap.isSolidTile(tx, ty);
    // A zero-thickness strip at x (vertical) or y (horizontal); cells floor(coord / chip), edges inclusive.
    const verticalStripHits = (x: number, top: number, bottom: number): boolean => {
      const tx = Math.floor(x / chip);
      for (let ty = Math.floor(top / chip); ty <= Math.floor(bottom / chip); ty += 1) if (solidCell(tx, ty)) return true;
      return false;
    };
    const horizontalStripHits = (y: number, left: number, right: number): boolean => {
      const ty = Math.floor(y / chip);
      for (let tx = Math.floor(left / chip); tx <= Math.floor(right / chip); tx += 1) if (solidCell(tx, ty)) return true;
      return false;
    };
    const overlapsInclusive = (a: Rect, b: Rect): boolean => a.x <= b.x + b.width && a.x + a.width >= b.x
      && a.y <= b.y + b.height && a.y + a.height >= b.y;
    const overlapsStrict = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
    const freeSolids = solids.filter((solid) => !overlapsStrict(this.rect, solid));

    const left = this.rect.x, right = this.rect.x + this.rect.width;
    const top = this.rect.y, bottom = this.rect.y + this.rect.height;
    const downStrip = { x: left, y: bottom + 0.5, width: this.rect.width, height: 0 };
    const grounded = horizontalStripHits(bottom + 0.5, left, right)
      || freeSolids.some((solid) => overlapsInclusive(downStrip, solid));
    if (grounded) {
      this.fallVelocity = 0;
    } else {
      this.fallVelocity = Math.min(19.5 * 60, this.fallVelocity + 0.65 * 3600 * dt);
      const fall = this.fallVelocity * dt;
      // Sweep down: only rows entered below the current bottom; stop 0.01 above the first solid row.
      let allowed = fall;
      for (let ty = Math.floor(bottom / chip) + 1; ty <= Math.floor((bottom + fall) / chip); ty += 1) {
        let hit = false;
        for (let tx = Math.floor(left / chip); tx <= Math.floor((right - 1e-6) / chip); tx += 1) if (solidCell(tx, ty)) hit = true;
        if (hit) { allowed = Math.max(0, Math.min(allowed, ty * chip - 0.01 - bottom)); break; }
      }
      for (const solid of freeSolids) {
        if (solid.x < right && solid.x + solid.width > left && solid.y >= bottom) {
          allowed = Math.max(0, Math.min(allowed, solid.y - bottom));
        }
      }
      if (allowed < fall) this.fallVelocity = 0;
      this.rect.y += allowed;
    }

    const step = this.walkDirection * STEP_ENEMY_PATROL_SPEED * dt;
    const faceX = this.walkDirection > 0 ? this.rect.x + this.rect.width + 0.5 : this.rect.x - 0.5;
    const faceStrip = { x: faceX, y: this.rect.y, width: 0, height: this.rect.height };
    const wallContact = verticalStripHits(faceX, this.rect.y, this.rect.y + this.rect.height)
      || freeSolids.some((solid) => overlapsInclusive(faceStrip, solid));
    if (wallContact) {
      if (!this.wasWallContact) {
        this.walkDirection = this.walkDirection > 0 ? -1 : 1;
        const sprite = this.view.children[0] as { scale?: { x: number }; x: number } | undefined;
        if (sprite?.scale) { sprite.scale.x *= -1; sprite.x = -sprite.x; }
      }
    } else {
      // Sweep sideways: only columns entered past the leading face; stop 0.01 short of the first solid column.
      let allowed = Math.abs(step);
      const lead = this.walkDirection > 0 ? this.rect.x + this.rect.width : this.rect.x;
      const target = lead + step;
      const firstTx = this.walkDirection > 0 ? Math.ceil(lead / chip) : Math.floor(lead / chip) - 1;
      const lastTx = this.walkDirection > 0 ? Math.floor((target - 1e-9) / chip) : Math.floor(target / chip);
      for (let tx = firstTx; this.walkDirection > 0 ? tx <= lastTx : tx >= lastTx; tx += this.walkDirection) {
        let hit = false;
        for (let ty = Math.floor(this.rect.y / chip); ty <= Math.floor((this.rect.y + this.rect.height - 1e-6) / chip); ty += 1) {
          if (solidCell(tx, ty)) hit = true;
        }
        if (hit) {
          const boundary = this.walkDirection > 0 ? tx * chip : (tx + 1) * chip;
          allowed = Math.max(0, Math.min(allowed, Math.abs(boundary - lead) - 0.01));
          break;
        }
      }
      for (const solid of freeSolids) {
        if (solid.y < this.rect.y + this.rect.height && solid.y + solid.height > this.rect.y) {
          const gap = this.walkDirection > 0 ? solid.x - lead : lead - (solid.x + solid.width);
          if (gap >= 0) allowed = Math.min(allowed, gap);
        }
      }
      this.rect.x += this.walkDirection * allowed;
    }
    this.wasWallContact = wallContact;
` + source.slice(nativeEnd);
  }
  if (file === 'src/engine/actors/UpDownEnemy.ts') {
    // step-enemy-native: FUN_7ff72bb6d170 sensor {-28, -22, 56, 48}; view {-30, -26, 60, 52} from atlas (385,0,30,26).
    source = `import { Sprite } from 'pixi.js';
import { frameTexture } from '../sprites';
` + source;
    source = replaceOnce(source, 'export const UP_DOWN_ENEMY_WIDTH = 22;', 'export const UP_DOWN_ENEMY_WIDTH = 56;', file);
    source = replaceOnce(source, 'export const UP_DOWN_ENEMY_HEIGHT = 26;', 'export const UP_DOWN_ENEMY_HEIGHT = 48;', file);
    source = replaceOnce(source, '    y: spawn.y - UP_DOWN_ENEMY_HEIGHT / 2,', '    y: spawn.y - 22,', file);
    return replaceOnce(source, '    this.view.addChild(g);\n  }\n', `    this.view.addChild(g);
    const texture = frameTexture('updown_enemy' as any);
    if (texture) {
      g.destroy();
      const sprite = new Sprite(texture);
      sprite.x = -30; sprite.y = -26; sprite.width = 60; sprite.height = 52;
      this.view.addChild(sprite);
    }
  }
`, file);
  }
  if (file === 'src/engine/actors/BowwowEnemy.ts') {
    // step-enemy-native: FUN_7ff72bb38ba0 sensors {-30, -39, 60, 78}; the art is not decoded (dark placeholder).
    source = replaceOnce(source, 'export const BOWWOW_ENEMY_WIDTH = 28;', 'export const BOWWOW_ENEMY_WIDTH = 60;', file);
    source = replaceOnce(source, 'export const BOWWOW_ENEMY_HEIGHT = 22;', 'export const BOWWOW_ENEMY_HEIGHT = 78;', file);
    source = replaceOnce(source, "    g.beginFill(0x2b2f77, 0.72);\n    g.lineStyle(2, 0xf97316, 0.95);\n    g.drawRoundedRect(-14, -11, 28, 22, 5);",
      "    g.beginFill(0x1b1b1b, 1);\n    g.lineStyle(2, 0x3a2418, 1);\n    g.drawEllipse(0, 0, 30, 39);", file);
    // bowwow-chase-stops: only a moving cat (mean movement > 0) is a target (FUN_7ff72bb39180).
    source = replaceOnce(source, `      const movement = Math.hypot(target.movementX, target.movementY);
      if (!selected || movement > selected.movement) {`, `      const movement = Math.hypot(target.movementX, target.movementY);
      if (!(movement > 0)) continue;
      if (!selected || movement > selected.movement) {`, file);
    // bowwow-chase-stops: state 3 steers only with a target but always moves along its last heading.
    source = replaceOnce(source, `    if (this.state === 3) {
      if (candidate) {
        this.chase(candidate.target);
      }
      return;
    }`, `    if (this.state === 3) {
      if (candidate) this.steer(candidate.target);
      this.translate(this.lastChaseDelta.x, this.lastChaseDelta.y);
      return;
    }`, file);
    source = replaceOnce(source, `  private chase(target: BowwowEnemyTarget): void {
    const dx = target.x - this.view.x;
    const dy = target.y - (this.view.y + BOWWOW_CHASE_SOURCE_Y_OFFSET);
    const length = Math.hypot(dx, dy);
    if (length === 0) return;

    this.lastChaseDelta = {
      x: (dx / length) * this.params.chaseStepPerFrame,
      y: (dy / length) * this.params.chaseStepPerFrame,
    };
    this.translate(this.lastChaseDelta.x, this.lastChaseDelta.y);
  }`, `  private steer(target: BowwowEnemyTarget): void {
    const dx = target.x - this.view.x;
    const dy = target.y - (this.view.y + BOWWOW_CHASE_SOURCE_Y_OFFSET);
    const length = Math.hypot(dx, dy);
    if (length === 0) return;

    this.lastChaseDelta = {
      x: (dx / length) * this.params.chaseStepPerFrame,
      y: (dy / length) * this.params.chaseStepPerFrame,
    };
  }

  /** bowwow-chase-stops: FUN_7ff72bb39680 - a catch in state 3 locks the dog into state 4 (drift only). */
  notifyCatch(): void {
    if (this.state === 3) this.state = 4;
  }

  get chaseState(): number {
    return this.state;
  }`, file);
    return source;
  }
  if (file === 'src/engine/actors/FallBox.ts') {
    // bottom-anchored-boxes: FUN_7ff72bb42900 rect {-p0/2, -p1, p0, p1} (bottom-centre on the row point).
    source = replaceOnce(source, '      y: spawn.y - size.height / 2,', '      y: spawn.y - size.height,', file);
    // fallbox-solid-while-armed: every active box is solid, armed or not (FUN_7ff72bb42d90 / FUN_7ff72bb429b0).
    source = replaceOnce(source, `  fallBoxRects.forEach((box, index) => {
    if (falling.has(index)) return;
    if (shouldTriggerFallBox(previousPlayerRect, currentPlayerRect, playerVelocity, box)) {
      triggeredBoxIndices.push(index);
      return;
    }
    activeBoxRects.push(box);
  });`, `  fallBoxRects.forEach((box, index) => {
    if (!falling.has(index) && shouldTriggerFallBox(previousPlayerRect, currentPlayerRect, playerVelocity, box)) {
      triggeredBoxIndices.push(index);
    }
    activeBoxRects.push(box);
  });`, file);
    // fallbox-solid-while-armed: hold while t <= 0.22 (compare, then add), then gravity 0.65 per tick per tick.
    source = replaceOnce(source, `  const stepDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const armedSeconds = velocity.armedSeconds + stepDt;
  if (armedSeconds <= armDelaySeconds) {
    return {
      rect: { ...rect },
      velocity: { y: 0, armedSeconds },
    };
  }`, `  const stepDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (velocity.armedSeconds <= armDelaySeconds) {
    return {
      rect: { ...rect },
      velocity: { y: 0, armedSeconds: velocity.armedSeconds + stepDt },
    };
  }
  const armedSeconds = velocity.armedSeconds;`, file);
    source = replaceOnce(source, `  return {
    rect: { ...rect, y: rect.y + settleStep },
    velocity: { y: settleStep, armedSeconds },
  };
}`, `  const fallVelocity = velocity.y + settleStep * 60 * 60 * stepDt;
  return {
    rect: { ...rect, y: rect.y + fallVelocity * stepDt },
    velocity: { y: fallVelocity, armedSeconds },
  };
}`, file);
    // fallbox-solid-while-armed: the despawn test reads the box bottom (the row-point anchored node y).
    source = replaceOnce(source, `  const actorCenterY = rect.y + rect.height / 2;
  return actorCenterY > (FALL_BOX_NATIVE_SCREEN_HEIGHT / scale) * 2;`, `  const actorBottomY = rect.y + rect.height;
  return actorBottomY > (FALL_BOX_NATIVE_SCREEN_HEIGHT / scale) * 2;`, file);
    // fallbox-solid-while-armed: the runtime limits the fall to the free space below (land on the first support).
    // fallbox-solid-while-armed: the native body is the rect inset 2 on every side (FUN_7ff72bb42d90).
    source = replaceOnce(source, `  setActive(active: boolean): void {`, `  get body(): Rect {
    return { x: this.rect.x + 2, y: this.rect.y + 2, width: this.rect.width - 4, height: this.rect.height - 4 };
  }

  setActive(active: boolean): void {`, file);
    return replaceOnce(source, `  updateFalling(dt: number, supported = false): void {
    if (!this.falling) return;
    const result = integrateFallingFallBox(this.rect, this.velocity, dt, supported);
    this.rect = result.rect;
    this.velocity = result.velocity;
    this.syncView();
  }`, `  updateFalling(dt: number, supported = false, freeDrop?: (rect: Rect, dy: number) => number): void {
    if (!this.falling) return;
    const result = integrateFallingFallBox(this.rect, this.velocity, dt, supported);
    const dy = result.rect.y - this.rect.y;
    if (dy > 0 && freeDrop) {
      const allowed = freeDrop(this.body, dy);
      if (allowed < dy) {
        result.rect = { ...result.rect, y: this.rect.y + allowed };
        result.velocity = { ...result.velocity, y: 0 };
      }
    }
    this.rect = result.rect;
    this.velocity = result.velocity;
    this.syncView();
  }`, file);
  }
  if (file === 'src/engine/actors/JumpArea.ts') {
    // jumparea-top-left: FUN_7ff72bb361a0 sensor {0, 0, p0, p1} -- the top-left corner at the row point.
    source = replaceOnce(source, `      x: spawn.x - this.params.width / 2,
      y: spawn.y - this.params.height / 2,`, `      x: spawn.x,
      y: spawn.y,`, file);
    source = replaceOnce(source, '    g.drawRoundedRect(-this.params.width / 2, -this.params.height / 2, this.params.width, this.params.height, 6);',
      '    g.drawRoundedRect(0, 0, this.params.width, this.params.height, 6);', file);
    source = replaceOnce(source, '    g.drawRect(-10, -2, 20, 4);', '    g.drawRect(this.params.width / 2 - 10, this.params.height / 2 - 2, 20, 4);', file);
    return source;
  }
  if (file === 'src/engine/types.ts') {
    // action-button: native input bit 11 ('[shot]'; jump is bit 2, BUTTON_MAX = 10 in stage_common.lua): held
    // (magnet, FUN_7ff72bb68300) and press edge (warp gun, FUN_7ff72bb68510). Optional: older callers omit them.
    source = replaceOnce(source, '  jumpPressed: boolean;\n  resetPressed: boolean;',
      '  jumpPressed: boolean;\n  /** action-button: native input bit 11 held. */\n  action?: boolean;\n  /** action-button: native input bit 11 press edge. */\n  actionPressed?: boolean;\n  resetPressed: boolean;', file);
    // puzzle-stage-data: the puzzle sub-stage map rides along with the Block rows.
    source = replaceOnce(source, `export interface PuzzleDef {
  createTable: ActorSpawnDef[];
}`, `/** puzzle-stage-data: the Puzzle sub-stage map (FUN_7ff72bc27dc0 + FUN_7ff72bb17090 / FUN_7ff72bb16920). */
export interface PuzzleMapDef extends MapDef {
  offsetX?: number;
  offsetY?: number;
  judge?: { x: number; y: number; w: number; h: number };
  infoX?: number;
  infoY?: number;
  fallTimeDefault?: number;
  fallTimeFloorDefault?: number;
  /** Rows [lines threshold, seconds for party 2, ..., party 8] (Lua row[party], 1-based). */
  fallTimeTable?: number[][];
}

export interface PuzzleDef {
  createTable: ActorSpawnDef[];
  /** puzzle-stage-data: the sub-stage map; absent in data exported before batch 14. */
  map?: PuzzleMapDef;
}`, file);
    return source;
  }
  if (file === 'src/engine/GameRuntime.ts') {
    // optional-teacher-cats: a leaving helper cat is removed with every retained reference to it.
    source = replaceOnce(source, '  private addRuntimePlayer(spawn: ActorSpawnDef): void {', `  /**
   * Desk adaptation (optional teacher cats leave mid-stage; native cats never do). Removes the cat and every
   * retained reference to it, deterministically (own-property order): Map entries keyed by it or whose value is
   * it / names it as player, owner, carrier or target; Set / WeakSet / WeakMap keys; array entries. A WarpGun
   * that held it returns to the native empty hold (aux +0x430 == 0, FUN_7ff72bb580a0: the next contact selects
   * anew); a cat it held is put back, visible and enabled, where it is.
   */
  removeRuntimePlayer(player: Player): void {
    const index = this.players.indexOf(player);
    if (index < 0) return;
    const held = this.warpGunSelectedPlayers.get(player);
    if (held instanceof Player) {
      this.warpGunDisabledPlayers.delete(held);
      held.view.visible = true;
    }
    for (const [owner, target] of [...this.warpGunSelectedPlayers]) {
      if (target === player) this.setWarpGunSelectedTarget(owner);
    }
    this.players.splice(index, 1);
    this.playerSpawns.splice(index, 1);
    this.playerInputSlots.splice(index, 1);
    if (this.player === player) this.player = this.players[0];
    const names = (value: unknown): boolean => value === player || (!!value && typeof value === 'object'
      && ['player', 'owner', 'carrier', 'target'].some((key) => (value as Record<string, unknown>)[key] === player));
    const dropView = (value: unknown): void => {
      const view = (value as { view?: Container } | undefined)?.view;
      if (view && view !== player.view && view.parent) view.parent.removeChild(view);
    };
    for (const value of Object.values(this as unknown as Record<string, unknown>)) {
      if (value === this.players || value === this.playerSpawns || value === this.playerInputSlots) continue;
      if (value instanceof Map) {
        for (const [key, entry] of [...value]) {
          if (key === player || names(entry)) {
            if (key === player) dropView(entry);
            value.delete(key);
          } else if (entry instanceof Set) entry.delete(player);
          else if (Array.isArray(entry)) entry.splice(0, entry.length, ...entry.filter((item) => !names(item)));
        }
      } else if (value instanceof Set || value instanceof WeakSet || value instanceof WeakMap) {
        value.delete(player);
      } else if (Array.isArray(value) && value.some(names)) {
        value.splice(0, value.length, ...value.filter((item) => !names(item)));
      }
    }
    if (player.view.parent) player.view.parent.removeChild(player.view);
  }

  private addRuntimePlayer(spawn: ActorSpawnDef): void {`, file);
    // native-player-body: FUN_7ff72bb774a0 binds the k-th spawned player row to slot table[k % length]
    // (FUN_7ff72bb72960: 0..n-1, shuffled only with enableShufflePlayer). The row label is never read.
    source = replaceOnce(source, `    const shuffledInputSlot = (this.stage?.enableShufflePlayer ?? 0) !== 0
      ? this.controllerInputSlotPermutation[this.players.length]
      : undefined;`, `    const slotTable = this.controllerInputSlotPermutation;
    const nativeRowCounter = this.players.filter((other) => !(other as { parkHelper?: boolean }).parkHelper).length;
    const isStageRow = !!this.stage?.createTable.includes(spawn) && slotTable.length > 0;
    const shuffledInputSlot = isStageRow
      ? slotTable[nativeRowCounter % slotTable.length]
      : (this.stage?.enableShufflePlayer ?? 0) !== 0
        ? slotTable[this.players.length]
        : undefined;`, file);
    // native-player-body: setParams FUN_7ff72bb67620: numeric p0 with (int)p0 == 1 -> FUN_7ff72bae78f0 (scale.x < 0).
    source = replaceOnce(source, `      usesMoveSpeedMultiplier,
    );
    this.players.push(player);`, `      usesMoveSpeedMultiplier,
    );
    const facingParam = spawn.raw[6];
    if (typeof facingParam === 'number' && Math.trunc(facingParam) === 1) player.setSpawnFacing(-1);
    this.players.push(player);`, file);
    // native-player-body: the body bottom is the actor point - 1 (DAT_7ff72c62d1a8), so the actor point is bottom + 1.
    source = replaceOnce(source, 'const actorY = Math.fround(player.rect.y + player.rect.height - 2);',
      'const actorY = Math.fround(player.rect.y + player.rect.height + 1);', file);
    // rect-left-bottom-anchor: literal Rect rows use the native left-bottom rectangle.
    source = replaceOnce(source, "import { StaticRect } from './actors/StaticRect';",
      "import { StaticRect, getRectLeftBottomRect } from './actors/StaticRect';", file);
    source = replaceOnce(source, '    Rect: (spawn) => {\n      const staticRect = new StaticRect(spawn);',
      '    Rect: (spawn) => {\n      const staticRect = new StaticRect(spawn, getRectLeftBottomRect(spawn));', file);
    source = replaceOnce(source,
      'const nowPressed = this.momentarySourceHasAnyActivationOverlap(switchPad.spawn);',
      'const nowPressed = (switchPad.pressed && !switchPad.params.forceClearPressed) || this.momentarySourceHasAnyActivationOverlap(switchPad.spawn);', file);
    source = replaceOnce(source, '      this.checkGoals();', '      this.checkGoals(resolvedPlayerInput);', file);
    source = replaceOnce(source, '  private checkGoals(): void {', `  private checkGoals(input?: InputState): void {`, file);
    source = replaceOnce(source, '    const singleUntargetedKey = this.keyGoals.length === 1', `    // The native Goal is armed by delivered Key contact, not remote pickup.
    // The desk requires the carrier to press UP here to deliver and enter.
    for (const goal of this.goals) {
      const goalKeys = this.keys.filter(key => !getKeyTargetActorName(key.spawn)
        || getKeyTargetActorName(key.spawn) === 'Goal');
      if (!goalKeys.length) goal.setOpened(true);
      if (!goal.opened && input?.up && this.player.deathTimer <= 0
        && rectsOverlap(this.player.rect, goal.rect)) {
        const delivery = this.carriedKeys.find(entry => entry.player === this.player && goalKeys.includes(entry.key));
        if (delivery) {
          goal.setOpened(true);
          delivery.key.consume();
          this.carriedKeys = this.carriedKeys.filter(entry => entry !== delivery);
          this.onEvent?.({ type: 'get', playerIndex: this.currentInputPlayerIndex() });
        }
      }
    }
    const singleUntargetedKey = this.keyGoals.length === 1`, file);
    source = replaceOnce(source, 'standardGoals.some((goal) => rectsOverlap(player.rect, goal.rect))',
      'player === this.player && !!input?.up && player.deathTimer <= 0\n      && standardGoals.some((goal) => goal.opened && rectsOverlap(player.rect, goal.rect))', file);
    source = replaceOnce(source, '      unlockedKeyGoals.some((goal) => (',
      '      player === this.player && !!input?.up && player.deathTimer <= 0 && unlockedKeyGoals.some((goal) => (', file);
    // Desk-specific optional helpers: thresholds and goal requirements remain
    // those of the student party selected before helper cats are spawned.
    for (const before of [
      'Math.max(2, this.players.length)',
      '(thresholdPercent / 100) * this.players.length',
      'requiredPushPlayers(box.weightPercent, box.offset, this.players.length)',
    ]) {
      const after = before.replace('this.players.length', '(this.requiredPlayerCount ?? this.players.length)');
      source = replaceOnce(source, before, after, file);
    }
    source = replaceOnce(source, 'const goalEligiblePlayers = this.players.filter((player) => (',
      'const goalEligiblePlayers = this.players.filter((player) => (!player.parkHelper &&', file);
    source = source.replaceAll('.filter(({ player }) => (\n        !this.collisionChangePlayersCollisionOff.has(player)',
      '.filter(({ player }) => (\n        !player.parkHelper && !this.collisionChangePlayersCollisionOff.has(player)');
    source = source.replaceAll('const playerCount = this.players.length;', 'const playerCount = this.requiredPlayerCount ?? this.players.length;');
    source = replaceOnce(source, 'const activeAvatarCount = this.players.length;',
      'const activeAvatarCount = this.requiredPlayerCount ?? this.players.length;', file);
    source = replaceOnce(source, 'this.players.map((player) => player.rect.x + player.rect.width / 2)',
      'this.players.filter(player => !player.parkHelper).map((player) => player.rect.x + player.rect.width / 2)', file);
    source = replaceOnce(source, 'this.players.some((player) => player.deathTimer > 0)',
      'this.players.some((player) => !player.parkHelper && player.deathTimer > 0)', file);
    source = 'import { planBoxPush } from ' + JSON.stringify(fileURLToPath(new URL('../apstat-park/campaign-push-contacts.mjs', import.meta.url))) + ';\n' + source;
    source = replaceOnce(source, '    const previousPushBoxRects = this.pushBoxes.map((pushBox) => ({ ...pushBox.rect }));', `    const previousPushBoxRects = this.pushBoxes.map((pushBox) => ({ ...pushBox.rect }));
    const planPush = (previous: Rect, destination: Rect) => planBoxPush(previous, destination,
      this.players.map(player => player.deathTimer > 0 || this.collisionChangePlayersCollisionOff.has(player) ? null : player.rect),
      this.players.indexOf(this.player!), (rect: Rect) => pushBoxCollisionMap.rectHitsSolid(rect)
        || previousPushBoxRects.some(box => box !== previous && rectsOverlap(rect, box)));
    const solidPushMap = { rectHitsSolid: (rect: Rect, movement: any) =>
      pushBoxCollisionMap.rectHitsSolid(rect, movement)
      || (movement && planPush(movement.previousRect, rect) === null) };`, file);
    source = replaceOnce(source, '      pushBoxCollisionMap,', '      solidPushMap,', file);
    source = replaceOnce(source, '        this.carryPlayersWithPushedBox(previousBoxRect, currentBoxRect);', `        const contacts = planPush(previousBoxRect, currentBoxRect);
        for (const [index, rect] of contacts || []) {
          const player = this.players[index];
          player.applyResolvedCollision(rect, player.velocity, player.grounded);
        }
        this.carryPlayersWithPushedBox(previousBoxRect, currentBoxRect);`, file);

    // push-box-head-carry: frame-start rects (simulation state only) + boxes that began the frame on a head.
    source = replaceOnce(source, '  private readonly pushBoxesMovedThisFrame = new Set<PushBox>();', `  private readonly pushBoxesMovedThisFrame = new Set<PushBox>();
  private frameStartPlayerRects: Rect[] = [];
  private frameStartPushBoxRects: Rect[] = [];
  private frameStartLiftRects: Rect[] = [];
  private frameStartMoveWallRects: Rect[] = [];
  private readonly pushBoxesOnHeads = new Set<PushBox>();`, file);
    source = replaceOnce(source, '    const previousLiftRects = this.weightedLifts.map((lift) => ({ ...lift.rect }));', `    this.frameStartPlayerRects = this.players.map((player) => ({ ...player.rect }));
    this.frameStartPushBoxRects = this.pushBoxes.map((box) => ({ ...box.rect }));
    this.frameStartLiftRects = this.weightedLifts.map((lift) => ({ ...lift.rect }));
    this.frameStartMoveWallRects = this.moveWalls.map((moveWall) => ({ ...moveWall.rect }));
    const previousLiftRects = this.weightedLifts.map((lift) => ({ ...lift.rect }));`, file);
    source = replaceOnce(source, '    this.updateFallingPushBoxes(clampedDt);', `    this.carryPushBoxesOnPlayerHeads();
    this.updateFallingPushBoxes(clampedDt);`, file);
    source = replaceOnce(source, '  private updateFallingPushBoxes(dt: number): void {', `  // push-box-head-carry (native rewrite): a box resting on a live cat's head at frame start is a head
  // box (it falls once unsupported). It moves only when a CARRIER under that cat moved this frame
  // (native lifts / MoveWalls displace the whole stack; a walking or jumping cat carries nothing).
  private carryPushBoxesOnPlayerHeads(): void {
    this.pushBoxesOnHeads.clear();
    if (!this.tileMap || this.pushBoxes.length === 0) return;
    const MAX_CARRY_STEP = 48; // a respawn / warp teleport detaches the box instead of dragging it
    const canCarry = (player: Player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
      && !this.collisionChangePlayersCollisionOff.has(player);
    const solidRects: Rect[] = [
      ...this.gates.filter((gate) => !gate.opened).map((gate) => gate.rect),
      ...this.stationaryActiveFallBoxRects(),
      ...this.staticRects.filter((s) => s.spawn.actorName !== 'PuzzlePredictProxy').map((s) => s.rect),
      ...this.moveWalls.map((m) => m.rect),
      ...this.weightedLifts.map((w) => w.rect),
      ...this.bridges.filter((b) => !b.opened).map((b) => b.rect),
      ...this.blinkBlocks.filter((b) => b.solid).map((b) => b.rect),
      ...this.smallBoxes.map(smallBoxRect),
      ...this.normalBoxes.filter((b) => !this.isLaserKeyBoxUnlocked(b)).map(normalBoxRect),
      ...this.colorBoxes.map(colorBoxRect),
    ];
    // Stacks bottom-up (frame-start y, lowest first; ties by index): a lower head box moves before one above it.
    const order = this.pushBoxes.map((_, index) => index).sort((a, b) =>
      ((this.frameStartPushBoxRects[b]?.y ?? 0) - (this.frameStartPushBoxRects[a]?.y ?? 0)) || a - b);
    for (const i of order) {
      const box = this.pushBoxes[i]!;   // (distinct text: the sky-respawn anchor must stay unique)
      const boxStart = this.frameStartPushBoxRects[i];
      if (!boxStart) continue;
      // On a head at frame start (any cat, even one that just died): the box is a head box and
      // falls if nothing holds it. Only a live cat can carry it.
      const supporting = this.players.map((player, index) => index)
        .filter((index) => !!this.frameStartPlayerRects[index] && rectRestsOnSupport(boxStart, this.frameStartPlayerRects[index]));
      if (!supporting.length) continue;
      this.pushBoxesOnHeads.add(box);
      // Already moved this frame (push, MoveWall): never double-move.
      if (box.rect.x !== boxStart.x || box.rect.y !== boxStart.y) continue;
      // The head box moves only by the delta of a carrier (lift or MoveWall) that the cat under it
      // stood on at frame start and that moved this frame. Lowest cat index, lifts before walls.
      // Transitive (native recursive displacement, FUN_7ff72bc17330 / FUN_7ff72bc16780): walk DOWN the
      // frame-start support chain (cat -> cat / box -> ... -> lift or MoveWall) and use the carrier's delta.
      // Visited-set guarded and depth-capped; candidates in fixed order (carriers, then cats by index,
      // then boxes by index), so every client resolves the same chain.
      const moved = [
        ...this.weightedLifts.map((lift, i) => [this.frameStartLiftRects[i], lift.rect] as const),
        ...this.moveWalls.map((moveWall, i) => [this.frameStartMoveWallRects[i], moveWall.rect] as const),
      ];
      const carrierUnder = (feet: Rect, visited: Set<Rect>, depth: number): { dx: number; dy: number } | null => {
        for (const [startRect, nowRect] of moved) {
          if (!startRect || !rectRestsOnSupport(feet, startRect)) continue;
          const dx = nowRect.x - startRect.x, dy = nowRect.y - startRect.y;
          if (dx !== 0 || dy !== 0) return { dx, dy };
        }
        if (depth >= 16) return null;
        const below = [
          ...this.frameStartPlayerRects.filter((_, i) => canCarry(this.players[i])),
          ...this.frameStartPushBoxRects,
        ];
        for (const support of below) {
          if (!support || visited.has(support) || !rectRestsOnSupport(feet, support)) continue;
          visited.add(support);
          const delta = carrierUnder(support, visited, depth + 1);
          if (delta) return delta;
        }
        return null;
      };
      const carrierDelta = (index: number): { dx: number; dy: number } | null => {
        const feet = this.frameStartPlayerRects[index];
        return carrierUnder(feet, new Set<Rect>([feet, boxStart]), 0);
      };
      let carrierIndex = -1, dx = 0, dy = 0;
      for (const index of supporting) {
        if (!canCarry(this.players[index])) continue;
        const delta = carrierDelta(index);
        if (!delta) continue;
        carrierIndex = index; dx = delta.dx; dy = delta.dy;
        break;
      }
      if (carrierIndex < 0) continue;
      const carrier = this.players[carrierIndex];
      if (Math.abs(dx) > MAX_CARRY_STEP || Math.abs(dy) > MAX_CARRY_STEP) continue;
      const riders = this.players.filter((player) => player !== carrier && canCarry(player)
        && rectRestsOnSupport(player.rect, boxStart));
      const hitsSolid = (rect: Rect) => this.tileMap!.rectHitsSolid(rect)
        || solidRects.some((solid) => rectsOverlap(rect, solid))
        || this.pushBoxes.some((other) => other !== box && rectsOverlap(rect, other.rect))
        || this.players.some((player) => player !== carrier && !riders.includes(player)
          && canCarry(player) && rectsOverlap(rect, player.rect));
      // The riders shift with the box, so they must clear the same way.
      const blocked = (rect: Rect) => hitsSolid(rect) || riders.some((rider) => hitsSolid({
        ...rider.rect, x: rider.rect.x + rect.x - box.rect.x, y: rider.rect.y + rect.y - box.rect.y }));
      const slide = (from: Rect, axis: 'x' | 'y', delta: number): Rect => {
        const at = (t: number) => ({ ...from, [axis]: from[axis] + delta * t });
        if (delta === 0) return from;
        if (!blocked(at(1))) return at(1);
        let low = 0, high = 1; // largest clear fraction, as in the jump02 settle
        for (let pass = 0; pass < 20; pass += 1) {
          const middle = (low + high) / 2;
          if (blocked(at(middle))) high = middle; else low = middle;
        }
        return at(low);
      };
      const previous = { ...box.rect };
      const next = slide(slide(previous, 'x', dx), 'y', dy);
      box.applyRect(next);
      if (dy < 0 && next.y > previous.y + dy + 1e-6) {
        // A ceiling stopped the box: it stops the cat's head too (the cameFromBelow rule).
        carrier.applyResolvedCollision({ ...carrier.rect, y: next.y + next.height },
          { ...carrier.velocity, y: 0 }, carrier.grounded);
      }
      for (const rider of riders) {
        rider.applyResolvedCollision({ ...rider.rect, x: rider.rect.x + next.x - previous.x,
          y: rider.rect.y + next.y - previous.y }, rider.velocity, true);
        this.resetPlayerIfTouchingDangerChip(rider, this.players.indexOf(rider));
      }
    }
  }

  private updateFallingPushBoxes(dt: number): void {`, file);
    // push-box-holds-switches: a landed, moved push box presses a plain Switch pad like a cat.
    source = replaceOnce(source, '      return switchPad !== undefined && eligiblePlayerTouches(switchPad.rect);', `      if (switchPad === undefined) return false;
      if (eligiblePlayerTouches(switchPad.rect)) return true;
      // Roulette stop switches stay player-only (each press spends that player's activity budget).
      if (this.roulettes.some((roulette) => roulette.stopSwitch === switchPad)) return false;
      // A box still at its spawn never presses (a stage may place one over a pad on purpose).
      return this.pushBoxes.some((box) => !box.falling && box.wasSupported && !this.pushBoxesOnHeads.has(box)
        && (box.rect.x !== box.spawnRect.x || box.rect.y !== box.spawnRect.y)
        && rectsOverlap({ x: box.rect.x + 1, y: box.rect.y + 1,
          width: Math.max(0, box.rect.width - 2), height: Math.max(0, box.rect.height - 2) }, switchPad.rect));`, file);
    source = replaceOnce(source, '    const PUSH_BOX_GRAVITY = 980;', `    const nativeJumpBoxes = this.stage?.name === 'stage_jump02';
    const PUSH_BOX_GRAVITY = nativeJumpBoxes ? .65 * 60 * 60 : 980;`, file);
    source = replaceOnce(source, '    const PUSH_BOX_MAX_FALL_SPEED = 600;', '    const PUSH_BOX_MAX_FALL_SPEED = nativeJumpBoxes ? Infinity : 600;', file);
    source = replaceOnce(source, '      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);', `      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);
      // Only live cats below the box support it (every stage since push-box-head-carry); side contact must not suspend a fall.
      const heads = this.players.filter(player => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
        && !this.collisionChangePlayersCollisionOff.has(player)
        && player.rect.y >= box.rect.y + box.rect.height - .001).map(player => player.rect);
      otherBoxRects.push(...heads);`, file);
    // push-box-sky-respawn: past the players' bottom kill-line, the box returns from the sky.
    source = replaceOnce(source, '      const box = this.pushBoxes[i];\n', `      const box = this.pushBoxes[i];
      if (this.scrollCameraConfig && isBelowFailWindow(box.rect.y, this.scrollCameraConfig)) {
        // Drop from just above the screen, or from under the lowest overhang above the origin
        // (map tiles only, so every client computes the same start).
        let dropY = box.spawnRect.y;
        while (dropY > -box.rect.height && !this.tileMap.rectHitsSolid({ ...box.spawnRect, y: Math.max(-box.rect.height, dropY - 8) })) {
          dropY = Math.max(-box.rect.height, dropY - 8);
        }
        const start = { ...box.rect, x: box.spawnRect.x, y: dropY };
        // Never return into a cat or another box: park at the kill line (off-screen, at rest) and
        // retry this same check next frame until the start is clear (simulation state only).
        const occupied = this.players.some((player) => rectsOverlap(start, player.rect))
          || this.pushBoxes.some((other) => other !== box && rectsOverlap(start, other.rect));
        if (occupied) {
          box.applyRect({ ...box.rect, y: this.scrollCameraConfig.failWindow });
          box.falling = false;
          box.velocityY = 0;
          box.wasSupported = false;
          continue;
        }
        box.applyRect(start);
        box.falling = true;
        box.velocityY = 0;
        box.wasSupported = false;
        continue;
      }
`, file);
    // stacked-cats-weigh-lifts: a cat on a cat (or box) on the slab weighs the lift, transitively.
    source = replaceOnce(source, `    let loadCount = 0;
    for (const player of this.players) {
      if (!this.collisionChangePlayersCollisionOff.has(player) && rectLoadsLift(player.rect)) {
        loadCount += 1;
      }
    }
`, `    let loadCount = 0;
    const liftLoadSupports: Rect[] = [lift.rect, ...[
      ...this.pushBoxes.map((pushBox) => pushBox.rect),
      ...this.smallBoxes.map(smallBoxRect),
      ...this.normalBoxes.filter((normalBox) => !this.isLaserKeyBoxUnlocked(normalBox)).map(normalBoxRect),
    ].filter(rectLoadsLift)];
    const liftLoadPlayers = new Set<Player>();
    const liftLoadBoxes = new Set<PushBox>();
    for (let supportIndex = 0; supportIndex < liftLoadSupports.length; supportIndex += 1) {
      for (const player of this.players) {
        if (liftLoadPlayers.has(player) || this.collisionChangePlayersCollisionOff.has(player)) continue;
        if (!rectRestsOnSupport(player.rect, liftLoadSupports[supportIndex])) continue;
        liftLoadPlayers.add(player);
        liftLoadSupports.push(player.rect);
      }
      // native-weighted-lift: a push box on a counted cat or box counts too (boxes ON the slab are counted below).
      if (supportIndex === 0) continue;
      for (const pushBox of this.pushBoxes) {
        if (liftLoadBoxes.has(pushBox) || liftLoadSupports.includes(pushBox.rect)) continue;
        if (!rectRestsOnSupport(pushBox.rect, liftLoadSupports[supportIndex])) continue;
        liftLoadBoxes.add(pushBox);
        liftLoadSupports.push(pushBox.rect);
      }
    }
    loadCount += liftLoadPlayers.size + liftLoadBoxes.size;
`, file);
    // push-box-head-carry: a box on the cat's head rides along (carryPushBoxesOnPlayerHeads), so it
    // must not block the lift / MoveWall from moving the cat.
    source = replaceOnce(source, `          ...this.moveWalls.map((moveWall) => moveWall.rect),
          ...this.pushBoxes.map((pushBox) => pushBox.rect),
          ...this.smallBoxes.map(smallBoxRect),
          ...this.normalBoxes.map(normalBoxRect),
          ...this.colorBoxes.map(colorBoxRect),
          ...this.stationaryActiveFallBoxRects(),`, `          ...this.moveWalls.map((moveWall) => moveWall.rect),
          ...this.pushBoxes.filter((pushBox) => !rectRestsOnSupport(pushBox.rect, previousPlayerRect)).map((pushBox) => pushBox.rect),
          ...this.smallBoxes.map(smallBoxRect),
          ...this.normalBoxes.map(normalBoxRect),
          ...this.colorBoxes.map(colorBoxRect),
          ...this.stationaryActiveFallBoxRects(),`, file);
    source = replaceOnce(source, `          ...this.moveWalls.filter((_, moveWallIndex) => moveWallIndex !== index).map((blocker) => blocker.rect),
          ...this.pushBoxes.map((pushBox) => pushBox.rect),`, `          ...this.moveWalls.filter((_, moveWallIndex) => moveWallIndex !== index).map((blocker) => blocker.rect),
          ...this.pushBoxes.filter((pushBox) => !rectRestsOnSupport(pushBox.rect, previousPlayerRect)).map((pushBox) => pushBox.rect),`, file);
    // ...and the whole stack rides the slab, so a rising lift never shoves the upper cat off.
    source = replaceOnce(source,
      "if (lift.spawn.actorName !== 'DarknessWeightedLift' || !previousLiftRect) return supportedPlayers;",
      "if (!['WeightedLift', 'WeightedLiftEx', 'WeightedLiftEx2', 'DarknessWeightedLift'].includes(lift.spawn.actorName) || !previousLiftRect) return supportedPlayers;", file);
    source = replaceOnce(source, '        x: box.rect.x + box.rect.width / 2 - 2,', '        x: nativeJumpBoxes ? box.rect.x + .001 : box.rect.x + box.rect.width / 2 - 2,', file);
    source = replaceOnce(source, '        width: 4,\n        height: 1,', '        width: nativeJumpBoxes ? box.rect.width - .002 : 4,\n        height: 1,', file);
    source = replaceOnce(source, '      if (!box.falling) {', `      if ((nativeJumpBoxes || this.pushBoxesOnHeads.has(box)) && !supported) box.falling = true;
      if (!box.falling) {`, file);
    source = replaceOnce(source, '        if (blockedAt({ ...box.rect, y: box.rect.y + moved + step })) break;', `        if (blockedAt({ ...box.rect, y: box.rect.y + moved + step })) {
          if (nativeJumpBoxes) {
            // Resolve the final fraction so the box visibly rests on its support.
            let low = 0, high = step;
            for (let pass = 0; pass < 20; pass++) {
              const middle = (low + high) / 2;
              if (blockedAt({ ...box.rect, y: box.rect.y + moved + middle })) high = middle;
              else low = middle;
            }
            moved += low;
            box.velocityY = 0;
          }
          break;
        }`, file);

    // head-stack-jump-impulse (1/4): a jump press with a body on the head hands the jump up the column.
    source = replaceOnce(source, '      const previousPlayerRect = { ...this.player.rect };\n      const startedJump = resolvedPlayerInput.jumpPressed', `      if (resolvedPlayerInput.jumpPressed && this.player.grounded && this.player.mode === 'normal'
        && this.handOffHeadJump(this.player)) {
        resolvedPlayerInput = { ...resolvedPlayerInput, jump: false, jumpPressed: false };
      }
      const previousPlayerRect = { ...this.player.rect };
      const startedJump = resolvedPlayerInput.jumpPressed`, file);
    // head-stack-jump-impulse (2/4): the column walk.
    source = replaceOnce(source, '  private updateFallingPushBoxes(dt: number): void {', `  // head-stack-jump-impulse: true when a cat or box rests on the jumper's head (the jumper then does not
  // rise). Walks the column above bottom-up, breadth-first (cats by index, then boxes by index): cats pass
  // the hand-off up; a box with anything on it receives nothing; the first free box gets the hop.
  private handOffHeadJump(jumper: Player): boolean {
    const live = (player: Player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
      && !this.collisionChangePlayersCollisionOff.has(player);
    // Frame-start rects (Codex review): a rising lift has already moved the cats this frame, but not yet
    // their head boxes, so "what is on my head" must be read from where everything was at frame start.
    const startRect = (body: Player | PushBox): Rect => body instanceof PushBox
      ? (this.frameStartPushBoxRects[this.pushBoxes.indexOf(body)] ?? body.rect)
      : (this.frameStartPlayerRects[this.players.indexOf(body)] ?? body.rect);
    const onTop = (support: Rect): Array<Player | PushBox> => [
      ...this.players.filter((player) => player !== jumper && live(player) && rectRestsOnSupport(startRect(player), support)),
      ...this.pushBoxes.filter((box) => !box.falling && rectRestsOnSupport(startRect(box), support)),
    ];
    let frontier = onTop(startRect(jumper));
    if (!frontier.length) return false;
    const seen = new Set<Player | PushBox>([jumper]);
    for (let depth = 0; depth < 16 && frontier.length; depth += 1) {
      const next: Array<Player | PushBox> = [];
      for (const body of frontier) {
        if (seen.has(body)) continue;
        seen.add(body);
        const above = onTop(startRect(body));
        if (body instanceof PushBox) {
          if (above.length) continue;          // a loaded box receives nothing
          body.hopRequested = true;
          return true;
        }
        next.push(...above);                   // a cat only passes the hand-off up
      }
      frontier = next;
    }
    return true;
  }

  private updateFallingPushBoxes(dt: number): void {`, file);
    // head-stack-jump-impulse (3/4): turn a requested hop into the one-shot upward speed (apex 22 units).
    source = replaceOnce(source, '      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);', `      if (box.hopRequested) {
        const HEAD_HOP_HEIGHT = 22;   // retail capture: 33 screen px at the 1.5 stage scale
        box.hopRequested = false;
        box.velocityY = -(Math.sqrt(2 * PUSH_BOX_GRAVITY * HEAD_HOP_HEIGHT) + PUSH_BOX_GRAVITY * dt / 2);
        box.falling = true;
        box.hopping = true;
        box.wasSupported = false;
      }
      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);`, file);
    // head-stack-jump-impulse (4/4): a hopping box is not caught by its old support while rising, rises
    // under the same gravity, then falls and lands with the exact-landing resolve.
    source = replaceOnce(source, '      if (supported) {\n        box.falling = false;\n        box.velocityY = 0;', `      if (supported && box.velocityY >= 0) {
        if (box.hopping) {
          // Codex review: the 1-unit support strip can catch a landing box with a gap still open (it then
          // hovered up to 1 unit above the head). Close it with the exact-landing resolve, so the box is in
          // contact again exactly at its rest y.
          let low = 0, high = 1.002;
          for (let pass = 0; pass < 20; pass++) {
            const middle = (low + high) / 2;
            if (blockedAt({ ...box.rect, y: box.rect.y + middle })) high = middle;
            else low = middle;
          }
          if (low > 0) box.applyRect({ ...box.rect, y: box.rect.y + low });
        }
        box.hopping = false;
        box.falling = false;
        box.velocityY = 0;`, file);
    source = replaceOnce(source, '      box.velocityY = Math.min(PUSH_BOX_MAX_FALL_SPEED, box.velocityY + PUSH_BOX_GRAVITY * dt);', `      if (box.velocityY < 0 && box.velocityY + PUSH_BOX_GRAVITY * dt < 0) {
        box.velocityY += PUSH_BOX_GRAVITY * dt;
        const rise = -box.velocityY * dt;
        let up = 0, ceiling = false;
        while (rise - up > 1e-6) {
          const stepUp = Math.min(2, rise - up);
          if (blockedAt({ ...box.rect, y: box.rect.y - up - stepUp })) { ceiling = true; break; }
          up += stepUp;
        }
        if (up > 0) box.applyRect({ ...box.rect, y: box.rect.y - up });
        if (ceiling) {
          // Codex review: a ceiling cut the hop short. Settle straight back onto the support below with the
          // exact-landing resolve (the retail box always returns to its rest y), so it is in contact again.
          box.velocityY = 0;
          let down = 0;
          while (down < 256 && !blockedAt({ ...box.rect, y: box.rect.y + down + 2 })) down += 2;
          if (down < 256) {
            let low = 0, high = 2;
            for (let pass = 0; pass < 20; pass++) {
              const middle = (low + high) / 2;
              if (blockedAt({ ...box.rect, y: box.rect.y + down + middle })) high = middle;
              else low = middle;
            }
            box.applyRect({ ...box.rect, y: box.rect.y + down + low });
            box.falling = false;
            box.hopping = false;
            box.wasSupported = true;
          }
        }
        continue;
      }
      box.velocityY = Math.min(PUSH_BOX_MAX_FALL_SPEED, box.velocityY + PUSH_BOX_GRAVITY * dt);`, file);
    source = replaceOnce(source, '          if (nativeJumpBoxes) {\n            // Resolve the final fraction', '          if (nativeJumpBoxes || box.hopping) {\n            // Resolve the final fraction', file);

    // stack-riding (0/3): a frame-wide set, so a riding pass displaces any body at most once per frame
    // (Codex review: a box on two walking heads was carried by both).
    source = replaceOnce(source, '  private readonly pushBoxesOnHeads = new Set<PushBox>();',
      '  private readonly pushBoxesOnHeads = new Set<PushBox>();\n  private readonly riddenThisFrame = new Set<Player | PushBox>();', file);
    source = replaceOnce(source, '    this.frameStartMoveWallRects = this.moveWalls.map((moveWall) => ({ ...moveWall.rect }));',
      '    this.frameStartMoveWallRects = this.moveWalls.map((moveWall) => ({ ...moveWall.rect }));\n    this.riddenThisFrame.clear();', file);
    // stack-riding (1/3): after a cat's own update and collisions, what rests on it rides its sideways move.
    source = replaceOnce(source, '      this.applyJumpStands(previousPlayerRect);\n      this.applyJumpAreas();',
      `      this.applyJumpStands(previousPlayerRect);
      if (!this.collisionChangePlayersCollisionOff.has(this.player)) {
        this.rideStackOnSupport(previousPlayerRect, this.player.rect.x - previousPlayerRect.x, this.player);
      }
      this.applyJumpAreas();`, file);
    // stack-riding (2/3): a cat carried by a pushed box carries its own stack the same way (transitive).
    source = replaceOnce(source, `      player.applyResolvedCollision(
        { ...player.rect, x: player.rect.x + deltaX, y: player.rect.y + deltaY },
        player.velocity,
        true,
      );
      this.resetPlayerIfTouchingDangerChip(player, playerIndex);`, `      if (this.riddenThisFrame.has(player)) continue;   // already displaced by a riding pass this frame
      this.riddenThisFrame.add(player);
      const riderBefore = { ...player.rect };
      player.applyResolvedCollision(
        { ...player.rect, x: player.rect.x + deltaX, y: player.rect.y + deltaY },
        player.velocity,
        true,
      );
      this.resetPlayerIfTouchingDangerChip(player, playerIndex);
      this.rideStackOnSupport(riderBefore, player.rect.x - riderBefore.x, player);`, file);
    // stack-riding (3/3): the column walk.
    source = replaceOnce(source, '  private updateFallingPushBoxes(dt: number): void {', `  // stack-riding: a support that moved sideways by dx this frame carries everything resting on it (its
  // rect before the move): cats and push boxes, transitively up the stack, by the same dx, in the same frame.
  // Bottom-up, breadth-first; cats by index, then boxes by index. A rider that a wall, tile or body blocks
  // moves only as far as it can (the support then walks out from under it). Airborne bodies (a rising cat,
  // a falling or hopping box) are not resting and do not ride. Simulation state only.
  private rideStackOnSupport(supportBefore: Rect, dx: number, support: Player | PushBox): void {
    const MAX_RIDE_STEP = 48; // a respawn / warp teleport never drags a stack along
    if (!this.tileMap || dx === 0 || Math.abs(dx) > MAX_RIDE_STEP) return;
    const live = (player: Player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
      && !this.collisionChangePlayersCollisionOff.has(player) && !this.activelyGuardingPlayers.has(player);
    const solidRects: Rect[] = [
      ...this.gates.filter((gate) => !gate.opened).map((gate) => gate.rect),
      ...this.stationaryActiveFallBoxRects(),
      ...this.staticRects.filter((s) => s.spawn.actorName !== 'PuzzlePredictProxy').map((s) => s.rect),
      ...this.moveWalls.map((m) => m.rect),
      ...this.weightedLifts.map((w) => w.rect),
      ...this.bridges.filter((b) => !b.opened).map((b) => b.rect),
      ...this.blinkBlocks.filter((b) => b.solid).map((b) => b.rect),
      ...this.smallBoxes.map(smallBoxRect),
      ...this.normalBoxes.filter((b) => !this.isLaserKeyBoxUnlocked(b)).map(normalBoxRect),
      ...this.colorBoxes.map(colorBoxRect),
    ];
    const visited = new Set<Player | PushBox>([support]);
    // One support per rider (Codex review): of the bodies the rider rested on at frame start, the one with the
    // largest horizontal overlap; ties -> cats by index, then boxes by index. Null when the rider was not resting
    // on any body at frame start (it landed this frame): then whichever support it rests on now carries it.
    const startOf = (body: Player | PushBox): Rect | undefined => body instanceof PushBox
      ? this.frameStartPushBoxRects[this.pushBoxes.indexOf(body)]
      : this.frameStartPlayerRects[this.players.indexOf(body)];
    const chosenSupport = (rider: Player | PushBox): Player | PushBox | null => {
      const riderStart = startOf(rider);
      if (!riderStart) return null;
      let best: Player | PushBox | null = null, bestOverlap = 0;
      for (const candidate of [...this.players, ...this.pushBoxes]) {
        const start = candidate === rider ? undefined : startOf(candidate);
        if (!start || !rectRestsOnSupport(riderStart, start)) continue;
        const overlap = Math.min(riderStart.x + riderStart.width, start.x + start.width) - Math.max(riderStart.x, start.x);
        if (overlap > bestOverlap) { best = candidate; bestOverlap = overlap; }
      }
      return best;
    };
    const ridesOn = (rider: Player | PushBox, layer: Player | PushBox) => {
      const chosen = chosenSupport(rider);
      return chosen === null || chosen === layer;
    };
    const blocked = (body: Player | PushBox, rect: Rect) => this.tileMap!.rectHitsSolid(rect)
      || solidRects.some((solid) => rectsOverlap(rect, solid))
      || this.pushBoxes.some((other) => other !== body && rectsOverlap(rect, other.rect))
      || this.players.some((other) => other !== body && live(other) && rectsOverlap(rect, other.rect));
    const slide = (body: Player | PushBox, from: Rect, delta: number): Rect => {
      const at = (t: number) => ({ ...from, x: from.x + delta * t });
      if (!blocked(body, at(1))) return at(1);
      let low = 0, high = 1; // largest clear fraction
      for (let pass = 0; pass < 20; pass += 1) {
        const middle = (low + high) / 2;
        if (blocked(body, at(middle))) high = middle; else low = middle;
      }
      return at(low);
    };
    let frontier: Array<{ body: Player | PushBox; before: Rect; dx: number }> = [{ body: support, before: supportBefore, dx }];
    for (let depth = 0; depth < 16 && frontier.length; depth += 1) {
      const next: Array<{ body: Player | PushBox; before: Rect; dx: number }> = [];
      for (const { body: layer, before, dx: layerDx } of frontier) {
        for (const [index, rider] of this.players.entries()) {
          if (visited.has(rider) || this.riddenThisFrame.has(rider)) continue;
          if (!live(rider) || rider.velocity.y < 0 || !rectRestsOnSupport(rider.rect, before) || !ridesOn(rider, layer)) continue;
          visited.add(rider); this.riddenThisFrame.add(rider);
          const from = { ...rider.rect };
          rider.applyResolvedCollision(slide(rider, from, layerDx), rider.velocity, rider.grounded);
          this.resetPlayerIfTouchingDangerChip(rider, index);
          if (rider.rect.x !== from.x) next.push({ body: rider, before: from, dx: rider.rect.x - from.x });
        }
        for (const box of this.pushBoxes) {
          if (visited.has(box) || this.riddenThisFrame.has(box)) continue;
          if (box.falling || box.hopping || box.hopRequested || !rectRestsOnSupport(box.rect, before) || !ridesOn(box, layer)) continue;
          visited.add(box); this.riddenThisFrame.add(box);
          const from = { ...box.rect };
          box.applyRect(slide(box, from, layerDx));
          // Not a push: never joins pushBoxesMovedThisFrame (that drives the pushed-off-a-ledge gap snap).
          if (box.rect.x !== from.x) next.push({ body: box, before: from, dx: box.rect.x - from.x });
        }
      }
      frontier = next;
    }
  }

  private updateFallingPushBoxes(dt: number): void {`, file);

    // descending-lift-stops-on-bodies (1/2): the hold latch per UpDownLift (the y it holds at).
    source = replaceOnce(source, '  private readonly weightedLiftOffsets = new WeakMap<WeightedLift, number>();',
      '  private readonly weightedLiftOffsets = new WeakMap<WeightedLift, number>();\n  private readonly upDownLiftHolds = new Map<WeightedLift, number>();', file);
    // descending-lift-stops-on-bodies (2/2): right after the lifts move, before anything rides them.
    source = replaceOnce(source, '    this.updateWeightedLifts(clampedDt);\n', `    this.updateWeightedLifts(clampedDt);
    this.stopDescendingLiftsOnBodies(previousLiftRects);
`, file);
    source = replaceOnce(source, '  private updateFallingPushBoxes(dt: number): void {', `  // descending-lift-stops-on-bodies: a lift moving down onto a body that stands on something stops on its top.
  private stopDescendingLiftsOnBodies(previousLiftRects: readonly Rect[]): void {
    if (!this.tileMap) return;
    const FAMILY = ['WeightedLift', 'WeightedLiftEx', 'WeightedLiftEx2', 'DarknessWeightedLift', 'UpDownLift'];
    const live = (player: Player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
      && !this.collisionChangePlayersCollisionOff.has(player);
    const overlapsX = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width;
    const setLiftY = (lift: WeightedLift, y: number) => {
      lift.rect.y = y;
      lift.view.y = lift.spawn.actorName === 'DarknessWeightedLift' ? y : y - lift.bodyOffsetY;
      if (lift.spawn.actorName !== 'UpDownLift') this.weightedLiftOffsets.set(lift, lift.view.y - lift.spawn.y);
    };
    for (const [index, lift] of this.weightedLifts.entries()) {
      if (!FAMILY.includes(lift.spawn.actorName)) continue;
      const previous = previousLiftRects[index];
      if (!previous) continue;
      // An UpDownLift that stopped on a body holds there until its own path rises back above that height.
      const hold = this.upDownLiftHolds.get(lift);
      if (hold !== undefined) {
        if (lift.rect.y > hold) setLiftY(lift, hold);
        else this.upDownLiftHolds.delete(lift);
      }
      if (lift.rect.y <= previous.y) continue;   // not moving down this frame
      const previousBottom = previous.y + previous.height;
      const solids: Rect[] = [
        ...this.staticRects.filter((s) => s.spawn.actorName !== 'PuzzlePredictProxy').map((s) => s.rect),
        ...this.gates.filter((gate) => !gate.opened).map((gate) => gate.rect),
        ...this.bridges.filter((bridge) => !bridge.opened).map((bridge) => bridge.rect),
        ...this.moveWalls.map((moveWall) => moveWall.rect),
        ...this.weightedLifts.filter((other) => other !== lift).map((other) => other.rect),
        ...this.blinkBlocks.filter((block) => block.solid).map((block) => block.rect),
        ...this.stationaryActiveFallBoxRects(),
      ];
      const bodies: Array<{ rect: Rect; player?: Player; box?: PushBox }> = [
        ...this.players.filter(live).map((player) => ({ rect: player.rect, player })),
        ...this.pushBoxes.filter((box) => !box.falling && !box.hopping).map((box) => ({ rect: box.rect, box })),
      ];
      // Native chain test: the body below blocks only when it stands on something.
      const standsOnSomething = (rect: Rect) => {
        const strip = { x: rect.x + 0.001, y: rect.y + rect.height, width: rect.width - 0.002, height: 0.5 };
        return this.tileMap!.rectHitsSolid(strip)
          || solids.some((solid) => rectsOverlap(strip, solid))
          || bodies.some((other) => other.rect !== rect && rectsOverlap(strip, other.rect));
      };
      const below = bodies.filter(({ rect }) => overlapsX(rect, lift.rect)
        && rect.y >= previousBottom - 0.5 && rect.y < lift.rect.y + lift.rect.height);
      const blockers = below.filter(({ rect }) => standsOnSomething(rect));
      if (blockers.length) {
        const stopY = Math.max(previous.y, Math.min(...blockers.map(({ rect }) => rect.y)) - lift.rect.height);
        if (stopY < lift.rect.y) {
          setLiftY(lift, stopY);
          if (lift.spawn.actorName === 'UpDownLift') this.upDownLiftHolds.set(lift, stopY);
        }
      }
      // A body in mid-air under the slab is pushed down to its underside (never left inside it).
      const liftBottom = lift.rect.y + lift.rect.height;
      for (const { rect, player, box } of below) {
        if (rect.y >= liftBottom) continue;
        if (player) {
          player.applyResolvedCollision({ ...player.rect, y: liftBottom },
            { ...player.velocity, y: Math.max(0, player.velocity.y) }, false);
        } else if (box) {
          box.applyRect({ ...box.rect, y: liftBottom });
        }
      }
    }
  }

  private updateFallingPushBoxes(dt: number): void {`, file);

    // native-movewall (1/4): the row decodes to a 16-wide pillar, its travel and its sensor.
    source = replaceOnce(source, '      const moveWall = new StaticRect(spawn);', `      const moveWall = new StaticRect(spawn, nativeMoveWall(spawn).body);
      // Native view {-9, -c, 18, c} from atlas (500,255,9,130), relative to the body's top-left (x-8, y-c+1).
      const wallArt = frameTexture('move_wall' as any);
      if (wallArt) {
        moveWall.view.removeChildren();
        const bar = new Sprite(wallArt);
        bar.x = -1; bar.y = -1; bar.width = 18; bar.height = moveWall.rect.height + 2;
        moveWall.view.addChild(bar);
      }`, file);
    // native-movewall (2/4): it spawns idle (native state 0); only its sensor starts it.
    source = replaceOnce(source, '    phase: 1,\n    timer: 0,\n    offsetX: 0,', '    phase: 0,\n    timer: 0,\n    offsetX: 0,', file);
    // native-movewall (3/4): sensor begin-contact (a live cat or push box newly touching it, timer >= 1.5 s).
    source = replaceOnce(source, `      state.timer = Math.min(MOVE_WALL_TIMER_CAP_SECONDS, state.timer + dt);
      if (state.phase === 1) {`, `      state.timer = Math.min(MOVE_WALL_TIMER_CAP_SECONDS, state.timer + dt);
      const native = nativeMoveWall(moveWall.spawn);
      const sensor = { ...native.sensor, x: native.sensor.x + state.offsetX };
      const touching = new Set<object>([
        ...this.players.filter((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
          && !this.collisionChangePlayersCollisionOff.has(player) && rectsOverlap(player.rect, sensor)),
        ...this.pushBoxes.filter((box) => rectsOverlap(box.rect, sensor)),
      ]);
      const before = this.moveWallSensorContacts[index] ?? new Set<object>();
      const began = [...touching].some((body) => !before.has(body));
      this.moveWallSensorContacts[index] = touching;
      if (began && state.phase < 2 && state.timer >= MOVE_WALL_WAIT_SECONDS) {
        state.phase = 2;
        state.timer = 0;
      }
      if (state.phase === 0) {
        // idle until the sensor is touched
      } else if (state.phase === 1) {`, file);
    source = replaceOnce(source, `      const baseX = moveWall.spawn.x - moveWall.rect.width / 2;
      const baseY = moveWall.spawn.y - moveWall.rect.height / 2;`, `      const baseX = native.body.x;
      const baseY = native.body.y;`, file);
    source = replaceOnce(source, '  private readonly upDownLiftHolds = new Map<WeightedLift, number>();',
      '  private readonly upDownLiftHolds = new Map<WeightedLift, number>();\n  private moveWallSensorContacts: Array<Set<object>> = [];', file);
    // native-movewall (4/4): the decoder (FUN_7ff72bb664e0 via the factory call at 0x7ff72bb74904).
    source = replaceOnce(source, 'function createMoveWallState(spawn: ActorSpawnDef): MoveWallState {', `export function nativeMoveWall(spawn: ActorSpawnDef): { body: Rect; sensor: Rect; travel: number } {
  const at = spawn.raw.findIndex((value, index) => value === spawn.x && spawn.raw[index + 1] === spawn.y);
  const read = (offset: number) => {
    const value = at >= 0 ? spawn.raw[at + offset] : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const a = Math.trunc(read(2)), b = Math.trunc(read(3)), p2 = read(4);
  const travel = Math.abs(a) <= 1.1920928955078125e-7 ? 50 : a;
  const sensorWidth = Math.abs(b) <= 1.1920928955078125e-7 ? 50 : b;
  const c = p2 > 0 ? p2 : 260;
  return {
    body: { x: spawn.x - 8, y: spawn.y - c + 1, width: 16, height: c - 2 },
    sensor: { x: spawn.x + Math.min(sensorWidth, 0) + 10, y: spawn.y - c + 1, width: Math.abs(sensorWidth), height: c - 2 },
    travel,
  };
}

function createMoveWallState(spawn: ActorSpawnDef): MoveWallState {`, file);

    // native-weighted-lift (draw order): the sign, post and slab draw behind the riders (first in the actor layer,
    // still above the tiles). The native ctor gives its sprites depth -0.1 / text -0.2 (FUN_7ff72bb63cf0 +0x6c,
    // +0xc6, +0xcf); the renderer's sort convention is not traced, so 'behind the cats' is the sane choice.
    source = replaceOnce(source, `      const weightedLift = new WeightedLift(spawn);
      this.weightedLifts.push(weightedLift);
      this.addActorView(spawn, weightedLift.view);
    },
    WeightedLiftEx:`, `      const weightedLift = new WeightedLift(spawn);
      this.weightedLifts.push(weightedLift);
      this.addActorView(spawn, weightedLift.view);
      this.actorLayer.setChildIndex(weightedLift.view, 0);
    },
    WeightedLiftEx:`, file);
    // native-weighted-lift (Codex review): the lift carries its WHOLE supported stack, as FUN_7ff72bc17330 displaces
    // recursively UP. The weight count already includes a box on a box (or a cat on a box on a box); the old carries
    // moved only the bottom box, so contact broke and the sign flipped 0/1. After the existing carries, every cat or
    // push box that rested on the stack at frame start and has not moved yet gets the lift's delta (bottom-up; a tile
    // in the way leaves it where it is).
    source = replaceOnce(source, '    this.carryColorBoxesWithWeightedLifts(previousLiftRects);\n', `    this.carryColorBoxesWithWeightedLifts(previousLiftRects);
    this.carryWholeStacksWithLifts();
`, file);
    source = replaceOnce(source, '  private updateFallingPushBoxes(dt: number): void {', `  private carryWholeStacksWithLifts(): void {
    if (!this.tileMap) return;
    for (const [liftIndex, lift] of this.weightedLifts.entries()) {
      const liftStart = this.frameStartLiftRects[liftIndex];
      if (!liftStart) continue;
      const dy = lift.rect.y - liftStart.y;
      if (dy === 0) continue;
      const bodies: Array<{ start: Rect; now: () => Rect; move: (rect: Rect) => void }> = [
        ...this.players.map((player, index) => ({ player, start: this.frameStartPlayerRects[index] }))
          .filter(({ player, start }) => !!start && !this.collisionChangePlayersCollisionOff.has(player)
            && player.deathTimer <= 0 && !this.deathFallPlayers.has(player))
          .map(({ player, start }) => ({ start: start!, now: () => player.rect,
            move: (rect: Rect) => player.applyResolvedCollision(rect, player.velocity, true) })),
        ...this.pushBoxes.map((box, index) => ({ box, start: this.frameStartPushBoxRects[index] }))
          .filter(({ box, start }) => !!start && !box.hopping)
          .map(({ box, start }) => ({ start: start!, now: () => box.rect, move: (rect: Rect) => box.applyRect(rect) })),
      ];
      // The frame-start stack on the slab, bottom-up (breadth-first: cats by index, then boxes by index).
      const supports: Rect[] = [liftStart];
      const stack: typeof bodies = [];
      for (let i = 0; i < supports.length && stack.length < bodies.length; i += 1) {
        for (const body of bodies) {
          if (stack.includes(body) || !rectRestsOnSupport(body.start, supports[i])) continue;
          stack.push(body);
          supports.push(body.start);
        }
      }
      for (const body of stack) {
        const now = body.now();
        if (now.x !== body.start.x || now.y !== body.start.y) continue;   // already carried (or moved itself)
        const target = { ...now, y: now.y + dy };
        if (this.tileMap.rectHitsSolid(target)) continue;
        body.move(target);
      }
    }
  }

  private updateFallingPushBoxes(dt: number): void {`, file);
    // native-weighted-lift (GameRuntime): the plain WeightedLift threshold / travel / speeds / auto-return / freeze.
    source = replaceOnce(source, `      const thresholdPercent = weight > 0 ? weight : WEIGHTED_LIFT_DEFAULT_THRESHOLD_PERCENT;`, `      if (lift.spawn.actorName === 'WeightedLift') {
        // FUN_7ff72bb72ae0 + FUN_7ff72bb64100 + FUN_7ff72bb64310 (native-weighted-lift).
        const n = this.requiredPlayerCount ?? this.players.length;
        const flags = lift.params?.numericFlags ?? [];
        const p3 = Math.trunc(flags[1] ?? 0);
        const required = Math.trunc(weight) > 0
          ? Math.max(p3 || WEIGHTED_LIFT_DEFAULT_MIN_LOAD, Math.ceil((Math.trunc(weight) / 100) * n))
          : Math.max(2, Math.ceil(0.2 * n));
        lift.setSignNumber(Math.max(0, required - loadCount));
        // A cat or push box touching the slab underside freezes it for 0.06 s (body contacts only).
        const probe = { ...lift.rect, y: lift.rect.y + 0.01 };
        const touchedBelow = [...this.players.filter((player) => !this.collisionChangePlayersCollisionOff.has(player)
          && player.deathTimer <= 0 && !this.deathFallPlayers.has(player)).map((player) => player.rect),
          ...this.pushBoxes.map((box) => box.rect)]
          .some((rect) => rect.y >= lift.rect.y + lift.rect.height - 0.5 && !rectsOverlap(lift.rect, rect) && rectsOverlap(probe, rect));
        let cooldown = Math.fround((this.darknessWeightedLiftContactCooldowns.get(lift) ?? 0) - Math.fround(dt));
        if (touchedBelow) cooldown = Math.fround(0.06);
        this.darknessWeightedLiftContactCooldowns.set(lift, cooldown);
        if (cooldown > 0) return;
        const fullTravel = travel + (flags[0] ?? 0) * n;
        const autoReturn = !((flags[2] ?? 0) > 0);
        const loaded = loadCount >= required;
        const target = loaded ? fullTravel : autoReturn ? 0 : currentOffset;
        const stepSize = loaded ? 1 : 1 + (flags[3] ?? 0) * Math.max(0, n - 2);
        const delta = target - currentOffset;
        nextOffset = Math.abs(delta) <= stepSize ? target : currentOffset + Math.sign(delta) * stepSize;
      } else {
      const thresholdPercent = weight > 0 ? weight : WEIGHTED_LIFT_DEFAULT_THRESHOLD_PERCENT;`, file);
    source = replaceOnce(source, `      nextOffset = Math.abs(delta) <= maxStep
        ? targetOffset
        : currentOffset + Math.sign(delta) * maxStep;
    }`, `      nextOffset = Math.abs(delta) <= maxStep
        ? targetOffset
        : currentOffset + Math.sign(delta) * maxStep;
      }
    }`, file);
    source = replaceOnce(source, `      : lift.view.y - lift.rect.height / 2;
  }`, `      : lift.view.y + lift.bodyOffsetY;
  }`, file);
    // goal-native-open-and-door: no Goal opens by itself (FUN_7ff72bb531d0 opens on Key contact / msg 9 / state 0x1a).
    source = replaceOnce(source, `      if (!goalKeys.length) goal.setOpened(true);
`, '', file);
    source = replaceOnce(source, `      const goal = new Goal(spawn.x, spawn.y);
      this.goals.push(goal);`,
      `      const goal = new Goal(spawn.x, spawn.y);
      const sensorExtra = spawn.raw[6];
      goal.applyNativeDoor(typeof sensorExtra === 'number' && Number.isFinite(sensorExtra) ? sensorExtra : 0);
      this.goals.push(goal);`, file);
    // rect-party-terms: Rect / DarknessRect with the party terms; the student party is the native N.
    source = replaceOnce(source, "import { StaticRect, getRectLeftBottomRect } from './actors/StaticRect';",
      "import { StaticRect, getRectLeftBottomRect, getNativeRectRect } from './actors/StaticRect';", file);
    source = replaceOnce(source, '      const staticRect = new StaticRect(spawn, getRectLeftBottomRect(spawn));',
      '      const staticRect = new StaticRect(spawn, getNativeRectRect(spawn, this.nativePartyCount()));', file);
    source = replaceOnce(source, '      const darknessRect = new DarknessRect(spawn);',
      '      const darknessRect = new DarknessRect(spawn, getNativeRectRect(spawn, this.nativePartyCount()));', file);
    // key-party-offset: FUN_7ff72bb651a0 moves the Key row point by ((N - 2) p1, 0.8 N p0).
    source = replaceOnce(source, '      const key = new Key(spawn);', `      const n = this.nativePartyCount();
      const intParam = (index: number): number => {
        const value = spawn.raw[6 + index];
        return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
      };
      const key = new Key(spawnMovedTo(spawn,
        spawn.x + Math.fround((n - 2) * intParam(1)),
        spawn.y + Math.fround(n * 0.8 * intParam(0))));`, file);
    // bottom-anchored-boxes: ColorBox / ForceColorBox are bottom-centred natively; the port keeps their centre
    // in spawn.x / spawn.y, so the row point is converted once here (a copy: the stage row is never mutated).
    for (const name of ['ColorBox', 'ForceColorBox']) {
      source = replaceOnce(source, `    ${name}: (spawn) => {
      const colorBox = new ColorBox(spawn);`,
        `    ${name}: (spawn) => {
      const boxHeight = parseColorBoxParamsFromSpawn(spawn)?.height ?? COLOR_BOX_FALLBACK_SIZE;
      const colorBox = new ColorBox(spawnMovedTo(spawn, spawn.x, spawn.y - boxHeight / 2));`, file);
    }
    source = replaceOnce(source, "import { COLOR_BOX_FALLBACK_SIZE, ColorBox } from './actors/ColorBox';",
      "import { COLOR_BOX_FALLBACK_SIZE, ColorBox, parseColorBoxParamsFromSpawn } from './actors/ColorBox';", file);
    // normal-small-box-are-pushboxes: the box family are push boxes (FUN_7ff72bb333d0 + DAT_7ff72bcb66a0).
    source = replaceOnce(source, `    SmallBox: (spawn) => {
      const smallBox = new SmallBox(spawn);
      this.smallBoxes.push(smallBox);
      this.addActorView(spawn, smallBox.view);
    },`, `    SmallBox: (spawn) => {
      this.addBoxFamilyPushBox(spawn, 3);
    },`, file);
    for (const [name, index] of [['TallBox', 0], ['NormalBox', 2], ['BigBox', 1]]) {
      source = replaceOnce(source, `    ${name}: (spawn) => {
      const normalBox = new NormalBox(spawn);
      this.normalBoxes.push(normalBox);
      this.addActorView(spawn, normalBox.view);
    },`, `    ${name}: (spawn) => {
      this.addBoxFamilyPushBox(spawn, ${index});
    },`, file);
    }
    source = replaceOnce(source, "import { PushBox, parsePushBoxParamsFromSpawn, requiredPushPlayers, resolvePushBoxCollision } from './actors/PushBox';",
      "import { PushBox, parsePushBoxParamsFromSpawn, parsePushBoxWeightValue, requiredPushPlayers, resolvePushBoxCollision } from './actors/PushBox';", file);
    // colorbox-colour-push: a ColorBox row is a push box moved only by its colour cat.
    source = replaceOnce(source, `    ColorBox: (spawn) => {
      const boxHeight = parseColorBoxParamsFromSpawn(spawn)?.height ?? COLOR_BOX_FALLBACK_SIZE;
      const colorBox = new ColorBox(spawnMovedTo(spawn, spawn.x, spawn.y - boxHeight / 2));
      this.colorBoxes.push(colorBox);
      this.addActorView(spawn, colorBox.view);
    },`, `    ColorBox: (spawn) => {
      this.addColorPushBox(spawn);
    },`, file);
    source = replaceOnce(source, '  private countPlayersPushingBox(boxRect: Rect, sign: number): number {',
      '  private countPlayersPushingBox(boxRect: Rect, sign: number, colour?: number): number {', file);
    source = replaceOnce(source, '      .map((player, index) => ({ rect: player.rect, intent: this.framePushIntentX[index] ?? 0 }))',
      '      .map((player, index) => ({ rect: player.rect, intent: this.framePushIntentX[index] ?? 0, slot: this.playerInputSlots[index] ?? index }))', file);
    if (source.split('used[i] = true; count += 1;').length !== 3) throw new Error('Patch anchor changed: GameRuntime.ts pusher count');
    source = source.replaceAll('used[i] = true; count += 1;', 'used[i] = true; count += colour === undefined || c.slot === colour ? 1 : 0;');
    source = replaceOnce(source, `      (index, sign) => {
        const box = this.pushBoxes[index];
        const required = this.pushBoxRequiredPlayers(box);
        if (required <= 1) return true;
        return this.countPlayersPushingBox(previousPushBoxRects[index], sign) >= required;
      },`, `      (index, sign, chain) => {
        // colorbox-colour-push: a ColorBox needs a cat of its colour in the chain (FUN_7ff72bb3c2e0); a box driven by
        // another box counts the boxes in front of the pushers as bodies (FUN_7ff72bb34530 / FUN_7ff72bb343e0).
        const box = this.pushBoxes[index];
        const pushedRect = previousPushBoxRects[chain ? chain.lead : index];
        if (box?.colorIndex !== undefined) return this.countPlayersPushingBox(pushedRect, sign, box.colorIndex) >= 1;
        const required = this.pushBoxRequiredPlayers(box);
        if (required <= 1) return true;
        return this.countPlayersPushingBox(pushedRect, sign) + (chain ? chain.bodies : 0) >= required;
      },`, file);
    // colorbox-colour-push (Codex review): a pushed line of boxes commits ALL OR NONE. Every moved box gets its cat
    // contact plan (planBoxPush, against the final box rects and the cats already moved by earlier plans), its rider
    // carry and its moved-this-frame mark (ledge tip-over / support bookkeeping); if any plan fails, or any two boxes
    // would overlap, nothing moves and the pusher stops at the lead box's old face.
    source = replaceOnce(source, `    result.boxRects.forEach((rect, index) => {
      this.pushBoxes[index]?.applyRect(rect);
    });
    if (result.movedBoxIndex !== undefined) {
      const previousBoxRect = previousPushBoxRects[result.movedBoxIndex];
      const currentBoxRect = result.boxRects[result.movedBoxIndex];
      if (previousBoxRect && currentBoxRect) {
        const contacts = planPush(previousBoxRect, currentBoxRect);
        for (const [index, rect] of contacts || []) {
          const player = this.players[index];
          player.applyResolvedCollision(rect, player.velocity, player.grounded);
        }
        this.carryPlayersWithPushedBox(previousBoxRect, currentBoxRect);
      }
      const movedBox = this.pushBoxes[result.movedBoxIndex];
      if (movedBox) this.pushBoxesMovedThisFrame.add(movedBox);
    }`, `    const lead = result.movedBoxIndex;
    const movedIndices = lead === undefined ? [] : [lead, ...result.boxRects.map((rect, index) => index)
      .filter((index) => index !== lead && (result.boxRects[index].x !== previousPushBoxRects[index].x
        || result.boxRects[index].y !== previousPushBoxRects[index].y))];
    const catRects: Array<Rect | null> = this.players.map((player) => (player.deathTimer > 0
      || this.collisionChangePlayersCollisionOff.has(player) ? null : { ...player.rect }));
    const pusherIndex = this.players.indexOf(this.player!);
    const catMoves = new Map<number, Rect>();
    let lineCommits = movedIndices.length > 0;
    for (const index of movedIndices) {
      const before = previousPushBoxRects[index];
      const after = result.boxRects[index];
      const othersOverlap = result.boxRects.some((rect, other) => other !== index && rectsOverlap(rect, after));
      const plan = othersOverlap ? null : planBoxPush(before, after, catRects, pusherIndex, (rect: Rect) =>
        pushBoxCollisionMap.rectHitsSolid(rect) || result.boxRects.some((other) => rectsOverlap(rect, other)));
      if (!plan) { lineCommits = false; break; }
      for (const [catIndex, rect] of plan) { catMoves.set(catIndex, rect); catRects[catIndex] = rect; }
    }
    if (lineCommits) {
      result.boxRects.forEach((rect, index) => {
        this.pushBoxes[index]?.applyRect(rect);
      });
      for (const [catIndex, rect] of catMoves) {
        const player = this.players[catIndex];
        player.applyResolvedCollision(rect, player.velocity, player.grounded);
      }
      for (const index of movedIndices) {
        this.carryPlayersWithPushedBox(previousPushBoxRects[index], result.boxRects[index]);
        this.pushBoxesMovedThisFrame.add(this.pushBoxes[index]);
      }
    } else if (lead !== undefined) {
      // Nothing moves: the pusher stops against the lead box where it was.
      const before = previousPushBoxRects[lead];
      const pushedRight = result.boxRects[lead].x > before.x;
      result.playerRect = { ...result.playerRect, x: pushedRight ? before.x - result.playerRect.width : before.x + before.width };
      result.playerVelocity = { ...result.playerVelocity, x: 0 };
    }`, file);
    source = replaceOnce(source, "        box.spawn.actorName === 'PushBox'\n        && rectsOverlap({",
      "        /^(Push|Normal|Small|Tall|Big|Color)Box$/.test(box.spawn.actorName)\n        && rectsOverlap({", file);
    // bridge-folded-start-and-motion: a native Bridge / Gate is always solid; its length moves (isSolid()).
    for (const [before, after] of [['(gate) => !gate.opened)', '(gate) => gate.isSolid())'], ['(bridge) => !bridge.opened)', '(bridge) => bridge.isSolid())']]) {
      if (source.split(before).length < 18) throw new Error('Patch anchor changed: GameRuntime.ts ' + before);
      source = source.replaceAll(before, after);
    }
    source = replaceOnce(source, '    this.updateMoveWalls(clampedDt);\n', '    this.updateMoveWalls(clampedDt);\n    this.advanceSegmentPlatforms(clampedDt);\n', file);
    source = replaceOnce(source, '    KeyBridge: (spawn) => {\n      const bridge = new Bridge(spawn);\n',
      '    KeyBridge: (spawn) => {\n      const bridge = new Bridge(spawn);\n      bridge.setPartyCount(this.nativePartyCount());\n      bridge.enableSegmentCommandMode();\n', file);
    source = replaceOnce(source, '      if (controlledByPlainSwitch) bridge.enableSegmentCommandMode();',
      '      if (controlledByPlainSwitch) {\n        bridge.setPartyCount(this.nativePartyCount());\n        bridge.enableSegmentCommandMode();\n      }', file);
    // weighted-lift-ex-variants: the Ex / Ex2 factory rule in the shared lift update.
    source = replaceOnce(source, `      if (lift.spawn.actorName === 'WeightedLift') {
        // FUN_7ff72bb72ae0 + FUN_7ff72bb64100 + FUN_7ff72bb64310 (native-weighted-lift).`, `      if (lift.spawn.actorName === 'WeightedLiftEx' || lift.spawn.actorName === 'WeightedLiftEx2') {
        // FUN_7ff72bb72ae0 0x7ff72bb74314..0x7ff72bb743ae: travel p0 + int(p[n + 1]); FUN_7ff72bb64100(int p1, 0);
        // p2 per tick both ways (+0x414 / +0x418); auto-return; FUN_7ff72bb64310 underside freeze 0.06 s.
        const n = this.requiredPlayerCount ?? this.players.length;
        const row = lift.spawn.raw.slice(6);
        const param = (i: number): number => (typeof row[i] === 'number' && Number.isFinite(row[i] as number) ? row[i] as number : 0);
        const fullTravel = Math.trunc(param(0)) !== 0 ? param(0) + Math.trunc(param(n + 1)) : travel;
        const required = Math.trunc(param(1)) > 0
          ? Math.max(2, Math.ceil((Math.trunc(param(1)) / 100) * n))
          : Math.max(2, Math.ceil(0.2 * n));
        lift.setSignNumber(Math.max(0, required - loadCount));
        const probe = { ...lift.rect, y: lift.rect.y + 0.01 };
        const touchedBelow = [...this.players.filter((player) => !this.collisionChangePlayersCollisionOff.has(player)
          && player.deathTimer <= 0 && !this.deathFallPlayers.has(player)).map((player) => player.rect),
          ...this.pushBoxes.map((box) => box.rect)]
          .some((rect) => rect.y >= lift.rect.y + lift.rect.height - 0.5 && !rectsOverlap(lift.rect, rect) && rectsOverlap(probe, rect));
        let cooldown = Math.fround((this.darknessWeightedLiftContactCooldowns.get(lift) ?? 0) - Math.fround(dt));
        if (touchedBelow) cooldown = Math.fround(0.06);
        this.darknessWeightedLiftContactCooldowns.set(lift, cooldown);
        if (cooldown > 0) return;
        const target = loadCount >= required ? fullTravel : 0;
        const stepSize = param(2) > 0 ? param(2) : 1;
        const delta = target - currentOffset;
        nextOffset = Math.abs(delta) <= stepSize ? target : currentOffset + Math.sign(delta) * stepSize;
      } else if (lift.spawn.actorName === 'WeightedLift') {
        // FUN_7ff72bb72ae0 + FUN_7ff72bb64100 + FUN_7ff72bb64310 (native-weighted-lift).`, file);
    // lift-horizontal-carry: a Lift moves its stack by its dx too (FUN_7ff72bb55370 -> FUN_7ff72bb34f30 (dx, 0)).
    source = replaceOnce(source, `      const dy = lift.rect.y - liftStart.y;
      if (dy === 0) continue;`, `      const dy = lift.rect.y - liftStart.y;
      const dx = lift.spawn.actorName === 'Lift' ? lift.rect.x - liftStart.x : 0;
      if (dy === 0 && dx === 0) continue;`, file);
    source = replaceOnce(source, `        if (now.x !== body.start.x || now.y !== body.start.y) continue;   // already carried (or moved itself)
        const target = { ...now, y: now.y + dy };
        if (this.tileMap.rectHitsSolid(target)) continue;`, `        let target = now;
        // already carried vertically (or moved itself): no second dy; the Lift's dx is carried by nothing else
        if (dy !== 0 && now.x === body.start.x && now.y === body.start.y) target = { ...target, y: now.y + dy };
        if (dx !== 0) target = { ...target, x: target.x + dx };
        if (target === now) continue;
        if (this.tileMap.rectHitsSolid(target)) continue;`, file);
    // normal-small-box-are-pushboxes / colorbox-colour-push: the converted boxes take the native unsupported fall
    // (0.65 units / tick squared, FUN_7ff72bb34c40) that jump02 boxes already use; other PushBox rows are unchanged.
    source = replaceOnce(source, "    const nativeJumpBoxes = this.stage?.name === 'stage_jump02';\n    const PUSH_BOX_GRAVITY = nativeJumpBoxes ? .65 * 60 * 60 : 980;",
      "    const stageNativeBoxes = this.stage?.name === 'stage_jump02';\n    const STAGE_PUSH_BOX_GRAVITY = stageNativeBoxes ? .65 * 60 * 60 : 980;", file);
    source = replaceOnce(source, '    const PUSH_BOX_MAX_FALL_SPEED = nativeJumpBoxes ? Infinity : 600;',
      '    const STAGE_PUSH_BOX_MAX_FALL_SPEED = stageNativeBoxes ? Infinity : 600;', file);
    source = replaceOnce(source, '      const box = this.pushBoxes[i];\n      if (this.scrollCameraConfig && isBelowFailWindow(box.rect.y, this.scrollCameraConfig)) {',
      `      const box = this.pushBoxes[i];
      const nativeJumpBoxes = stageNativeBoxes || box.nativeFall === true;
      const PUSH_BOX_GRAVITY = box.nativeFall === true ? .65 * 60 * 60 : STAGE_PUSH_BOX_GRAVITY;
      const PUSH_BOX_MAX_FALL_SPEED = box.nativeFall === true ? Infinity : STAGE_PUSH_BOX_MAX_FALL_SPEED;
      if (this.scrollCameraConfig && isBelowFailWindow(box.rect.y, this.scrollCameraConfig)) {`, file);
    // Helpers for the batch-3 entries.
    source = replaceOnce(source, '  removeRuntimePlayer(player: Player): void {', `  /** normal-small-box-are-pushboxes: FUN_7ff72bb333d0(obj, index) = the PushBox ctor with rect DAT_7ff72bcb66a0[index]
   *  (Tall {-40,-703,80,703}, Big {-48,-128,96,128}, Normal {-48,-96,96,96}, Small {-25,-48,48,48}); p0 = weight. */
  private addBoxFamilyPushBox(spawn: ActorSpawnDef, index: number): void {
    const [left, width, height] = [[-40, 80, 703], [-48, 96, 128], [-48, 96, 96], [-25, 48, 48]][index];
    const weight = parsePushBoxWeightValue(spawn.raw[6] ?? null);
    const pushBox = Object.assign(
      new PushBox(spawn.x + left + width / 2, spawn.y, width, height, weight.weightPercent, weight.offset),
      { spawn },
    );
    pushBox.nativeFall = true;
    this.pushBoxes.push(pushBox);
    this.actorLayer.addChild(pushBox.view);
  }

  /** colorbox-colour-push: FUN_7ff72bb3b350 colour = p0 % n, skipping p3 % n; rect {-w/2, -h, w, h}, w = p1, h = p2. */
  private addColorPushBox(spawn: ActorSpawnDef): void {
    const row = spawn.raw.slice(6);
    const param = (i: number, fallback: number): number => (typeof row[i] === 'number' && Number.isFinite(row[i] as number) ? row[i] as number : fallback);
    const n = this.nativePartyCount();
    const width = param(1, 32);
    const height = param(2, 32);
    let colour = Math.trunc(param(0, 0)) % n;
    const skip = Math.trunc(param(3, -1));
    if (skip >= 0 && colour === skip % n) colour = (colour + 1) % n;
    const pushBox = Object.assign(new PushBox(spawn.x, spawn.y, width, height), { spawn });
    pushBox.colorIndex = colour;
    pushBox.nativeFall = true;
    // Native: the FallBox 9-slice tinted with the player colour (FUN_7ff72bb3c0c0); the mask remap is not decoded.
    for (const child of pushBox.view.removeChildren()) child.destroy();
    const g = new Graphics();
    g.lineStyle(3, 0x3a2418, 1);
    g.beginFill(PLAYER_BODY_COLORS[colour] ?? 0xe0e0e0, 1);
    g.drawRoundedRect(0, 0, width, height, Math.min(8, width / 4, height / 4));
    g.endFill();
    pushBox.view.addChild(g);
    this.pushBoxes.push(pushBox);
    this.actorLayer.addChild(pushBox.view);
  }

  /** bridge-folded-start-and-motion: lengths approach their command targets; a KeyBridge extends once a key is held. */
  private advanceSegmentPlatforms(dt: number): void {
    // FUN_7ff72bb4fe10: the KeyBridge sends itself command 9 once the key is held (key +0x408 != 0).
    if (this.carriedKeys.length > 0) {
      for (const bridge of this.bridges) {
        if (bridge.spawn.actorName === 'KeyBridge' && bridge.opened && bridge.segmentMotion) bridge.open();
      }
    }
    const bodies = (): Array<{ rect: Rect; move: (dx: number, dy: number) => void }> => [
      ...this.players.filter((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
        && !this.collisionChangePlayersCollisionOff.has(player))
        .map((player) => ({ rect: player.rect, move: (dx: number, dy: number): void => {
          player.applyResolvedCollision({ ...player.rect, x: player.rect.x + dx, y: player.rect.y + dy }, player.velocity, player.grounded);
        } })),
      ...this.pushBoxes.map((box) => ({ rect: box.rect, move: (dx: number, dy: number): void => {
        box.applyRect({ ...box.rect, x: box.rect.x + dx, y: box.rect.y + dy });
      } })),
    ];
    for (const platform of [...this.bridges, ...this.gates]) {
      const motion = platform.segmentMotion;
      if (!motion || motion.progress === motion.target) continue;
      const step = motion.speed * dt * 60;
      const growing = motion.target > motion.progress;
      const next = growing ? Math.min(motion.target, motion.progress + step) : Math.max(motion.target, motion.progress - step);
      if (growing) {
        const before = { ...platform.rect };
        const after = platform.extentAt(next);
        const hit = bodies().filter((body) => rectsOverlap(after, body.rect) && !rectsOverlap(before, body.rect));
        if (hit.length > 0) {
          if (!motion.headPush) continue;   // a growing strip waits instead of entering a body
          // Atomic shove (Codex review): every hit body moves by the head's step only if EVERY destination is clear of
          // tiles, solids, the strip itself and every other body; otherwise neither the strip nor any body moves.
          const push = next - motion.progress;
          const planned = hit.map((body) => ({ body, rect: { ...body.rect, x: body.rect.x + motion.dirX * push, y: body.rect.y + motion.dirY * push } }));
          const others = bodies().filter((body) => !hit.some((moving) => moving.rect === body.rect)).map((body) => body.rect);
          const solids = [
            ...this.staticRects.map((block) => block.rect),
            ...this.gates.filter((gate) => gate.isSolid()).map((gate) => gate.rect),
            ...this.bridges.filter((bridge) => bridge !== platform && bridge.isSolid()).map((bridge) => bridge.rect),
            ...this.weightedLifts.map((lift) => lift.rect),
            ...this.moveWalls.map((wall) => wall.rect),
          ];
          const clear = planned.every(({ rect }, i) => !this.tileMap?.rectHitsSolid(rect)
            && !rectsOverlap(rect, after)
            && !solids.some((solid) => rectsOverlap(rect, solid))
            && !others.some((other) => rectsOverlap(rect, other))
            && !planned.some((otherPlan, j) => j !== i && rectsOverlap(rect, otherPlan.rect)));
          if (!clear) continue;
          for (const { body, rect } of planned) body.move(rect.x - body.rect.x, rect.y - body.rect.y);
        }
      }
      platform.applyProgress(next);
    }
  }

  removeRuntimePlayer(player: Player): void {`, file);
    // bottom-anchored-boxes: native ForceColorBox never recolours a cat (no caller of FUN_7ff72bb67670).
    source = replaceOnce(source, '      this.applyForceColorBoxes();', '      // bottom-anchored-boxes: no native recolour-on-overlap (applyForceColorBoxes retired).', file);
    // Shared helpers for the batch-2 entries.
    source = replaceOnce(source, '  removeRuntimePlayer(player: Player): void {', `  /** The native configured player count N (DAT_7ff72c629fa8+0xcc08) = the student party; teachers never count. */
  private nativePartyCount(): number {
    return this.partySize ?? Math.max(2, this.activePlayerCount);
  }

  removeRuntimePlayer(player: Player): void {`, file);
    // native-movewall-rollback: FUN_7ff72bb667e0 + FUN_7ff72bc16f50 (plan the step; undo it when anything is pinned).
    source = replaceOnce(source, `      const baseX = native.body.x;
      const baseY = native.body.y;
      moveWall.rect.x = baseX + state.offsetX;
      moveWall.rect.y = baseY;`, `      const baseX = native.body.x;
      const baseY = native.body.y;
      const stepPlan = this.planMoveWallStep(moveWall, { ...moveWall.rect, x: baseX + state.offsetX, y: baseY });
      if (!stepPlan) {
        // The chain test failed: restore the offset (state and timer keep running) and retry next tick.
        state.offsetX = moveWall.rect.x - baseX;
      } else {
        for (const [body, rect] of stepPlan) body.move(rect);
      }
      moveWall.rect.x = baseX + state.offsetX;
      moveWall.rect.y = baseY;`, file);
    // weighted-lift-chain-test: FUN_7ff72bb64310 commits a step only after FUN_7ff72bc16f50 accepts it.
    source = replaceOnce(source, `    this.weightedLiftOffsets.set(lift, nextOffset);
    lift.view.y = lift.spawn.y + nextOffset;`, `    if (lift.spawn.actorName !== 'DarknessWeightedLift' && nextOffset < currentOffset
      && this.liftRiseBlocked(lift, nextOffset - currentOffset)) return;
    this.weightedLiftOffsets.set(lift, nextOffset);
    lift.view.y = lift.spawn.y + nextOffset;`, file);
    source = replaceOnce(source, '  private nativePartyCount(): number {', `  /** The rects a moving wall or lift must never enter (excluding the mover itself). */
  private stepSolidRects(except: object): Rect[] {
    return [
      ...this.staticRects.filter((block) => block !== except).map((block) => block.rect),
      ...this.gates.filter((gate) => gate !== except && gate.isSolid()).map((gate) => gate.rect),
      ...this.bridges.filter((bridge) => bridge !== except && bridge.isSolid()).map((bridge) => bridge.rect),
      ...this.weightedLifts.filter((lift) => lift !== except).map((lift) => lift.rect),
      ...this.moveWalls.filter((wall) => wall !== except).map((wall) => wall.rect),
    ];
  }

  /** The live cats and push boxes a moving wall or lift can meet. */
  private stepBodies(): Array<{ key: object; rect: Rect; move: (rect: Rect) => void }> {
    return [
      ...this.players.filter((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
        && !this.collisionChangePlayersCollisionOff.has(player))
        .map((player) => ({ key: player, rect: player.rect,
          move: (rect: Rect) => player.applyResolvedCollision(rect, player.velocity, player.grounded) })),
      ...this.pushBoxes.map((box) => ({ key: box, rect: box.rect, move: (rect: Rect) => box.applyRect(rect) })),
    ];
  }

  /** native-movewall-rollback: the bodies a wall step pushes and where to, or null when the chain test fails. */
  private planMoveWallStep(wall: object, next: Rect): Map<{ move: (rect: Rect) => void }, Rect> | null {
    const current = (wall as { rect: Rect }).rect;
    const dx = next.x - current.x;
    const plan = new Map<{ key: object; rect: Rect; move: (rect: Rect) => void }, Rect>();
    if (dx === 0) return plan;
    const solids = this.stepSolidRects(wall);
    if (solids.some((solid) => !rectsOverlap(current, solid) && rectsOverlap(next, solid))) return null;
    const bodies = this.stepBodies();
    const pushers: Rect[] = [next];
    for (let i = 0; i < pushers.length; i += 1) {
      const front = pushers[i];
      for (const body of bodies) {
        if (plan.has(body) || !rectsOverlap(front, body.rect)) continue;
        const rect = { ...body.rect, x: dx < 0 ? front.x - body.rect.width : front.x + front.width };
        if (this.tileMap?.rectHitsSolid(rect)) return null;
        if (solids.some((solid) => rectsOverlap(rect, solid))) return null;
        plan.set(body, rect);
        pushers.push(rect);
      }
    }
    return plan;
  }

  /** weighted-lift-chain-test: would this rising lift step carry the slab or its stack into anything solid? */
  private liftRiseBlocked(lift: object, dy: number): boolean {
    const slab = (lift as { rect: Rect }).rect;
    const solids = this.stepSolidRects(lift);
    const bodies = this.stepBodies();
    const stack: Rect[] = [];
    const supports: Rect[] = [slab];
    for (let i = 0; i < supports.length; i += 1) {
      for (const body of bodies) {
        if (stack.includes(body.rect)) continue;
        const support = supports[i];
        const resting = Math.abs(body.rect.y + body.rect.height - support.y) <= 0.5
          && body.rect.x < support.x + support.width && body.rect.x + body.rect.width > support.x;
        if (!resting) continue;
        stack.push(body.rect);
        supports.push(body.rect);
      }
    }
    const others = bodies.map((body) => body.rect).filter((rect) => !stack.includes(rect));
    return [slab, ...stack].some((rect) => {
      const target = { ...rect, y: rect.y + dy };
      return (rect !== slab && this.tileMap?.rectHitsSolid(target))
        || solids.some((solid) => !rectsOverlap(rect, solid) && rectsOverlap(target, solid))
        || others.some((other) => !rectsOverlap(rect, other) && rectsOverlap(target, other));
    });
  }

  private nativePartyCount(): number {`, file);
    // thunder-beam: sweep each Thunder once (0x7ff72bb4d600) at spawn; the drawn beam follows its live length.
    source = replaceOnce(source, `      const thunder = new Thunder(spawn);
      this.thunders.push(thunder);`, `      const thunder = new Thunder(spawn);
      thunder.setBaseLength(this.sweepThunderLength(thunder));
      this.thunders.push(thunder);`, file);
    source = replaceOnce(source, `  private updateThunders(dt: number): void {
    for (const thunder of this.thunders) thunder.update(dt);
  }`, `  private updateThunders(dt: number): void {
    this.updateGuardShields();
    for (const thunder of this.thunders) thunder.update(dt);
    const blockers = this.thunderBlockerRects();
    for (const thunder of this.thunders) thunder.setDrawLength(thunder.activeLengthFor(blockers));
  }

  /** thunder-beam: the aux 32 x 32 box swept from the row point up to 2400 against map chips (chips it overlaps at
   *  the start are not hits); L0 = 32 + its travel (0x7ff72bb4d600). */
  private sweepThunderLength(thunder: Thunder): number {
    const map = this.tileMap;
    const step = ({ DIR_UP: [0, -1], DIR_DOWN: [0, 1], DIR_LEFT: [-1, 0], DIR_RIGHT: [1, 0] } as Record<string, number[]>)[thunder.direction];
    if (!map || !step) return 2400;
    const chip = map.map.chipSize;
    const tilesUnder = (x: number, y: number): string[] => {
      const keys: string[] = [];
      for (let ty = Math.floor(y / chip); ty <= Math.floor((y + 32 - 0.001) / chip); ty += 1) {
        for (let tx = Math.floor(x / chip); tx <= Math.floor((x + 32 - 0.001) / chip); tx += 1) {
          if (tx < 0 || ty < 0 || tx >= map.map.width || ty >= map.map.height) continue;
          if (map.isSolidTile(tx, ty)) keys.push(tx + ',' + ty);
        }
      }
      return keys;
    };
    const x0 = thunder.spawn.x - 16, y0 = thunder.spawn.y - 16;
    const ignored = new Set(tilesUnder(x0, y0));
    let travel = 0;
    while (travel < 2400) {
      const next = Math.min(2400, travel + 1);
      if (tilesUnder(x0 + step[0] * next, y0 + step[1] * next).some((key) => !ignored.has(key))) break;
      travel = next;
    }
    return 32 + travel;
  }

  /** guard-shields: FUN_7ff72bb56c10 places each plank at the owner + DAT_7ff72c62d030[dir] every frame. */
  private updateGuardShields(): void {
    for (const shield of this.guardShields) {
      const owner = shield.owner;
      const x = owner.rect.x + PLAYER_RECT_CENTER_OFFSET_X + shield.offset[0];
      const y = owner.rect.y + PLAYER_RECT_CENTER_OFFSET_Y + shield.offset[1];
      Object.assign(shield.rect, { x: x + shield.shape[0], y: y + shield.shape[1], width: shield.shape[2], height: shield.shape[3] });
      shield.view.x = shield.rect.x;
      shield.view.y = shield.rect.y;
      shield.view.visible = owner.view.visible !== false && this.players.includes(owner);
    }
  }`, file);
    source = replaceOnce(source, '  private thunderBlockerRects(): Rect[] {\n    return [\n',
      '  private thunderBlockerRects(): Rect[] {\n    return [\n      ...this.guardShields.filter((shield) => this.players.includes(shield.owner)).map((shield) => shield.rect),\n', file);
    // guard-shields: no hold-jump guarding (native has no button); every extra direction param is a plank.
    source = replaceOnce(source, '      if (this.guardPlayers.has(this.player) && resolvedPlayerInput.jump) {',
      '      if (false) {   // guard-shields: native GuardPlayers have no guard button (FUN_7ff72bb56990 / FUN_7ff72bb56c10)', file);
    source = replaceOnce(source, `    if (spawn.actorName === 'GuardPlayer') {
      this.guardPlayers.add(player);`, `    if (spawn.actorName === 'GuardPlayer') {
      this.guardPlayers.add(player);
      // FUN_7ff72bb72ae0 0x7ff72bb72de7: one plank per extra direction param p1..p3 (FUN_7ff72bb56990).
      for (const value of spawn.raw.slice(7, 10)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        const dir = Math.trunc(value);
        if (dir < 0 || dir > 3) continue;
        const shape = dir <= 1 ? [-24, -3, 48, 6] : [-3, -30, 6, 60];
        const offset = [[0, -56], [0, 10], [-28, -24], [30, -24]][dir];
        const view = new Graphics();
        view.beginFill(player.bodyColor, 1);
        view.lineStyle(1, 0x3a2418, 1);
        view.drawRect(0, 0, shape[2], shape[3]);
        view.endFill();
        this.actorLayer.addChild(view);
        this.guardShields.push({ owner: player, dir, shape, offset, rect: { x: 0, y: 0, width: shape[2], height: shape[3] }, view });
      }
      this.updateGuardShields();`, file);
    // step-enemy-native: the StepEnemy body is a moving physical body (mode 3): a cat landing on its top stands on it
    // (contact from above: no harm, FUN_7ff72bb6ce10), instead of sinking in and dying on the next frame.
    source = replaceOnce(source, `    if (this.stepEnemies.some((enemy) => shouldRespawnPlayerForStepEnemy(this.player!.rect, enemy.rect, previousPlayerRect))) {`,
      `    for (const enemy of this.stepEnemies) {
      const cat = this.player.rect;
      const previousBottom = (previousPlayerRect ?? cat).y + (previousPlayerRect ?? cat).height;
      const overlapsX = cat.x < enemy.rect.x + enemy.rect.width && cat.x + cat.width > enemy.rect.x;
      if (overlapsX && previousBottom <= enemy.rect.y + 0.5 && cat.y + cat.height > enemy.rect.y && this.player.velocity.y >= 0) {
        this.player.applyResolvedCollision({ ...cat, y: enemy.rect.y - cat.height }, { ...this.player.velocity, y: 0 }, true);
      }
    }
    if (this.stepEnemies.some((enemy) => shouldRespawnPlayerForStepEnemy(this.player!.rect, enemy.rect, previousPlayerRect))) {`, file);
    source = replaceOnce(source, '  private guardPlayers = new Set<Player>();',
      '  private guardPlayers = new Set<Player>();\n  /** guard-shields: the always-on planks. */\n  guardShields: Array<{ owner: Player; dir: number; shape: number[]; offset: number[]; rect: Rect; view: Graphics }> = [];', file);
    source = replaceOnce(source, '    this.thunders = [];', '    this.thunders = [];\n    this.guardShields = [];', file);
    // step-enemy-native: StepEnemies fall and stand on solids too; the Bowwow reads 30-frame average movement.
    source = replaceOnce(source, '      enemy.update(dt, this.tileMap);', `      enemy.update(dt, this.tileMap, [
        ...this.staticRects.map((block) => block.rect),
        ...this.gates.filter((gate) => gate.isSolid()).map((gate) => gate.rect),
        ...this.bridges.filter((bridge) => bridge.isSolid()).map((bridge) => bridge.rect),
        ...this.weightedLifts.map((lift) => lift.rect),
        ...this.moveWalls.map((wall) => wall.rect),
        ...this.pushBoxes.map((box) => box.rect),
      ]);`, file);
    source = replaceOnce(source, `      movementX: player.velocity.x * clampedDt,
      movementY: player.velocity.y * clampedDt,`, `      ...this.bowwowAverageMovement(player),`, file);
    source = replaceOnce(source, '  private nativePartyCount(): number {', `  /** step-enemy-native: FUN_7ff72bb67b10(player, out, 0x1e): the mean of the last 30 per-frame displacements. */
  private bowwowMovementRings = new Map<Player, { last: { x: number; y: number }; deltas: Array<{ x: number; y: number }> }>();
  private bowwowAverageMovement(player: Player): { movementX: number; movementY: number } {
    const point = { x: player.rect.x + player.rect.width / 2, y: player.rect.y + player.rect.height };
    let ring = this.bowwowMovementRings.get(player);
    if (!ring) {
      ring = { last: point, deltas: Array.from({ length: 30 }, () => ({ x: 0, y: 0 })) };
      this.bowwowMovementRings.set(player, ring);
    }
    ring.deltas.shift();
    ring.deltas.push({ x: point.x - ring.last.x, y: point.y - ring.last.y });
    ring.last = point;
    const sum = ring.deltas.reduce((acc, delta) => ({ x: acc.x + delta.x, y: acc.y + delta.y }), { x: 0, y: 0 });
    return { movementX: sum.x / 30, movementY: sum.y / 30 };
  }

  private nativePartyCount(): number {`, file);
    // thunder-frame-order: Thunder slot 25 keeps only the latch shift and frame toggle; planks, the cut,
    // the drawn length and the kill run once every cat and body has moved (FUN_7ff72bb56c10 -> FUN_7ff72bb4da00 -> FUN_7ff72bb4d850).
    source = replaceOnce(source, `  private updateThunders(dt: number): void {
    this.updateGuardShields();
    for (const thunder of this.thunders) thunder.update(dt);
    const blockers = this.thunderBlockerRects();
    for (const thunder of this.thunders) thunder.setDrawLength(thunder.activeLengthFor(blockers));
  }`, `  private updateThunders(dt: number): void {
    for (const thunder of this.thunders) thunder.update(dt);
  }

  /** thunder-frame-order: after all motion, place the planks (FUN_7ff72bb56c10), then cut and draw each beam
   *  (FUN_7ff72bb4da00), then judge the kill (FUN_7ff72bb4d850), all on this frame's positions. */
  private applyThundersAfterMotion(activePlayers: readonly Player[], contactIndexes: readonly number[]): void {
    this.updateGuardShields();
    if (this.thunders.length === 0) return;
    const blockers = this.thunderBlockerRects();
    for (const thunder of this.thunders) thunder.setDrawLength(thunder.activeLengthFor(blockers));
    for (const index of contactIndexes) {
      this.player = activePlayers[index];
      this.currentPlayerIndex = index;
      this.applyThunders();
    }
  }`, file);
    source = replaceOnce(source, `    for (let index = 0; index < activePlayers.length; index += 1) {
      if (this.cleared) break;
      this.player = activePlayers[index];`, `    // thunder-frame-order: the cats that reach the contact checks; their Thunder kill is judged after all motion.
    const thunderContactIndexes: number[] = [];
    for (let index = 0; index < activePlayers.length; index += 1) {
      if (this.cleared) break;
      this.player = activePlayers[index];`, file);
    source = replaceOnce(source, `      this.applyThunders();
      this.applyStepEnemies(previousPlayerRect);`, `      thunderContactIndexes.push(index);
      this.applyStepEnemies(previousPlayerRect);`, file);
    source = replaceOnce(source, `    this.updatePushBoxDisplayCounts();
    this.player = activePlayers[0];`, `    this.updatePushBoxDisplayCounts();
    this.applyThundersAfterMotion(activePlayers, thunderContactIndexes);
    this.player = activePlayers[0];`, file);
    // bowwow-chase-stops: the dog that catches a cat locks into state 4 (FUN_7ff72bb39680).
    source = replaceOnce(source, `    if (this.bowwowEnemies.some((enemy) => shouldRespawnPlayerForBowwowEnemy(this.player!.rect, enemy.rect))) {
      this.startPlayerDeathSequence(this.player, this.currentInputPlayerIndex());
    }`, `    const catchers = this.bowwowEnemies.filter((enemy) => shouldRespawnPlayerForBowwowEnemy(this.player!.rect, enemy.rect));
    if (catchers.length > 0) {
      for (const enemy of catchers) enemy.notifyCatch();
      this.startPlayerDeathSequence(this.player, this.currentInputPlayerIndex());
    }`, file);
    source = replaceOnce(source, `    this.bowwowEnemies = [];`, `    this.bowwowEnemies = [];
    this.bowwowMovementRings.clear();`, file);
    // fallbox-solid-while-armed: FallBox bodies are resolved in the same pass as the Rects and gates, so a cat on one
    // is set on its top before a level neighbour can push it sideways.
    source = replaceOnce(source, `    const blockerRects = [
      ...(bracingGuardPlayer ? [] : closedGateRects),`, `    const blockerRects = [
      ...this.stationaryActiveFallBoxRects(),
      ...(bracingGuardPlayer ? [] : closedGateRects),`, file);
    // fallbox-solid-while-armed: armed and falling boxes stay solid (FUN_7ff72bb42d90 / FUN_7ff72bb429b0).
    source = replaceOnce(source, `  private stationaryActiveFallBoxRects(): Rect[] {
    return this.fallBoxes
      .filter((fallBox) => fallBox.active && !fallBox.falling)
      .map((fallBox) => fallBox.rect);
  }`, `  private stationaryActiveFallBoxRects(): Rect[] {
    return this.fallBoxes
      .filter((fallBox) => fallBox.active)
      .map((fallBox) => fallBox.body);
  }`, file);
    source = replaceOnce(source, `  private activeFallBoxRects(): Rect[] {
    return this.fallBoxes
      .filter((fallBox) => fallBox.active)
      .map((fallBox) => fallBox.rect);
  }`, `  private activeFallBoxRects(): Rect[] {
    return this.fallBoxes
      .filter((fallBox) => fallBox.active)
      .map((fallBox) => fallBox.body);
  }`, file);
    source = replaceOnce(source, `      activeFallBoxes.map(({ fallBox }) => fallBox.rect),`, `      activeFallBoxes.map(({ fallBox }) => fallBox.body),`, file);
    source = replaceOnce(source, `    const supportProbe: Rect = {
      x: fallBox.rect.x + 0.5,
      y: fallBox.rect.y + fallBox.rect.height + 0.001,
      width: Math.max(1, fallBox.rect.width - 1),
      height: 1,
    };`, `    const body = fallBox.body;
    const supportProbe: Rect = {
      x: body.x + 0.5,
      y: body.y + body.height + 0.001,
      width: Math.max(1, body.width - 1),
      height: 1,
    };`, file);
    source = replaceOnce(source, `      ...this.fallBoxes
        .filter((fallBox, index) => index !== fallBoxIndex && fallBox.active)
        .map((fallBox) => fallBox.rect),`, `      ...this.fallBoxes
        .filter((fallBox, index) => index !== fallBoxIndex && fallBox.active)
        .map((fallBox) => fallBox.body),`, file);
    // fallbox-solid-while-armed: a body resting on a box top arms it (FUN_7ff72bb42fb0); the fall lands on the
    // first chip or body below, cats included (FUN_7ff72bc13690).
    source = replaceOnce(source, `  private updateFallBoxes(dt: number): void {
    for (let index = this.fallBoxes.length - 1; index >= 0; index -= 1) {
      const fallBox = this.fallBoxes[index];
      fallBox.updateFalling(dt, this.fallBoxHasSupport(fallBox, index));`, `  private updateFallBoxes(dt: number): void {
    this.armFallBoxesUnderBodies();
    for (let index = this.fallBoxes.length - 1; index >= 0; index -= 1) {
      const fallBox = this.fallBoxes[index];
      fallBox.updateFalling(dt, this.fallBoxHasSupport(fallBox, index), (rect, dy) => this.fallBoxFreeDrop(rect, dy, index));`, file);
    source = replaceOnce(source, `  private fallBoxSupportBlockerRects(fallBoxIndex: number): Rect[] {
    return [`, `  /** fallbox-solid-while-armed: FUN_7ff72bb42fb0 arms a box when any body rests on its top (normal y < 0). */
  private armFallBoxesUnderBodies(): void {
    const bodies = [
      ...this.pushBoxes.map((pushBox) => pushBox.rect),
      ...this.fallBoxes.filter((fallBox) => fallBox.active).map((fallBox) => fallBox.body),
    ];
    for (const fallBox of this.fallBoxes) {
      if (!fallBox.active || fallBox.falling) continue;
      const own = fallBox.body;
      const restsOnTop = bodies.some((body) => !(body.x === own.x && body.y === own.y)
        && Math.abs(body.y + body.height - own.y) <= 0.5
        && body.x < own.x + own.width && body.x + body.width > own.x);
      if (restsOnTop) fallBox.trigger();
    }
  }

  /** fallbox-solid-while-armed: how far the box can drop this frame before it meets a chip or a body. */
  private fallBoxFreeDrop(rect: Rect, dy: number, fallBoxIndex: number): number {
    // A body the box already overlaps (a cat sunk into its top) touches it from above, not below: it never stops the drop.
    const blockers = this.fallBoxSupportBlockerRects(fallBoxIndex).filter((other) => !rectsOverlap(rect, other));
    const hits = (y: number) => {
      const probe = { ...rect, y };
      return !!this.tileMap?.rectHitsSolid(probe) || blockers.some((other) => rectsOverlap(probe, other));
    };
    let travelled = 0;
    while (travelled < dy) {
      const next = Math.min(dy, travelled + 1);
      if (hits(rect.y + next)) {
        let low = travelled, high = next;
        for (let i = 0; i < 12; i += 1) {
          const mid = (low + high) / 2;
          if (hits(rect.y + mid)) high = mid; else low = mid;
        }
        return low;
      }
      travelled = next;
    }
    return dy;
  }

  private fallBoxSupportBlockerRects(fallBoxIndex: number): Rect[] {
    return [
      ...this.players
        .filter((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
          && !this.collisionChangePlayersCollisionOff.has(player) && !this.goalClearedPlayers.has(player))
        .map((player) => player.rect),
      ...this.balances.map((balance) => balance.rect),
      ...this.seesaws.map((seesaw) => seesaw.rect),`, file);
    // darkness-weighted-lift-tiles: the type-2 slab never meets map chips (FUN_7ff72bc12490 / FUN_7ff72bc16f50).
    source = replaceOnce(source, `      if (
        touchesLowerSolidChip
        || touchesLowerStaticBody`, `      if (
        touchesLowerStaticBody`, file);
    source = replaceOnce(source, `      const blockedBySolidChip = movementSign !== 0 && preflightRects.some((rect) =>`, `      const chipPreflightRects = movementSign < 0 ? darknessSupportedRects : [];
      const blockedBySolidChip = movementSign !== 0 && chipPreflightRects.some((rect) =>`, file);
    // mc-d-tiles-solid: no map chip kills (FUN_7ff72bc2fca0 reads only the solid bit).
    source = replaceOnce(source, `  if (!chip.startsWith('MC_D')) return false;
  const directionalMatch = /^MC_D([LR])([UD])$/.exec(chip);`, `  if (!chip.startsWith('MC_D')) return false;
  return false; // mc-d-tiles-solid: native MC_D* chips are plain solid blocks
  const directionalMatch = /^MC_D([LR])([UD])$/.exec(chip);`, file);
    // pushbox-general-fall: every box falls natively on every stage (FUN_7ff72bb33890 -> FUN_7ff72bb34c40).
    source = replaceOnce(source, `    const stageNativeBoxes = this.stage?.name === 'stage_jump02';
    const STAGE_PUSH_BOX_GRAVITY = stageNativeBoxes ? .65 * 60 * 60 : 980;
    const STAGE_PUSH_BOX_MAX_FALL_SPEED = stageNativeBoxes ? Infinity : 600;`, `    const PUSH_BOX_GRAVITY = .65 * 60 * 60;
    const PUSH_BOX_MAX_FALL_SPEED = Infinity;`, file);
    // pushbox-general-fall: any body under the box supports it, DamageRects too (the BlockRoad plug rests on one).
    source = replaceOnce(source, `      ...this.colorBoxes.map(colorBoxRect),
    ];
    for (let i = 0; i < this.pushBoxes.length; i += 1) {
      const box = this.pushBoxes[i];`, `      ...this.colorBoxes.map(colorBoxRect),
      ...this.damageRects.map((damageRect) => damageRect.rect),
    ];
    for (let i = 0; i < this.pushBoxes.length; i += 1) {
      const box = this.pushBoxes[i];`, file);
    source = replaceOnce(source, `      const nativeJumpBoxes = stageNativeBoxes || box.nativeFall === true;
      const PUSH_BOX_GRAVITY = box.nativeFall === true ? .65 * 60 * 60 : STAGE_PUSH_BOX_GRAVITY;
      const PUSH_BOX_MAX_FALL_SPEED = box.nativeFall === true ? Infinity : STAGE_PUSH_BOX_MAX_FALL_SPEED;`, `      const nativeJumpBoxes = true;`, file);
    {
      const snapBegin = source.indexOf('      if (!box.falling) {\n        // Engage only on the supported -> unsupported transition');
      const snapEnd = source.indexOf('      if (supported && box.velocityY >= 0) {', snapBegin);
      if (snapBegin < 0 || snapEnd < 0) throw new Error('Patch anchor changed: push box gap snap');
      source = source.slice(0, snapBegin) + '      box.wasSupported = supported;\n' + source.slice(snapEnd);
    }
    // pushbox-general-fall: the fall and support tests use the body's x extent (the rect inset 1 on each side,
    // FUN_7ff72bb340f0: {x + 1, y + 1, w - 2, h - 2}), so a box whose drawn rect overlaps a ledge by under 1 drops.
    source = replaceOnce(source, `      const blockedAt = (rect: Rect): boolean =>
        this.tileMap!.rectHitsSolid(rect)
        || solidRects.some((solid) => rectsOverlap(rect, solid))
        || otherBoxRects.some((other) => rectsOverlap(rect, other));`, `      const blockedAt = (rect: Rect): boolean => {
        const body = { ...rect, x: rect.x + 1, width: rect.width - 2 };
        return this.tileMap!.rectHitsSolid(body)
          || solidRects.some((solid) => rectsOverlap(body, solid))
          || otherBoxRects.some((other) => rectsOverlap(body, other));
      };`, file);
    // pushbox-general-fall: every box lands flush on its support (FUN_7ff72bc12760), not only a hopping one: the
    // 1-unit support strip otherwise stops a falling box up to 1 above what it lands on.
    source = replaceOnce(source, `      if (supported && box.velocityY >= 0) {
        if (box.hopping) {`, `      if (supported && box.velocityY >= 0) {
        {`, file);
    // pushbox-general-fall: a push step stops where the box first has nothing under it (native pushes 1 per tick).
    source = replaceOnce(source, `        return this.countPlayersPushingBox(pushedRect, sign) + (chain ? chain.bodies : 0) >= required;
      },
    );`, `        return this.countPlayersPushingBox(pushedRect, sign) + (chain ? chain.bodies : 0) >= required;
      },
      (index, from, to) => {
        const firstFreeX = this.firstUnsupportedPushBoxX(index, from, to);
        const limited = firstFreeX === undefined ? to : { ...to, x: firstFreeX };
        if (!pushBoxCollisionMap.rectHitsSolid(limited)) return limited;
        // Native moves the box 1 unit per tick and the sweep stops it flush (FUN_7ff72bc12760): end at contact.
        const sign = Math.sign(limited.x - from.x);
        let low = 0, high = Math.abs(limited.x - from.x);
        for (let pass = 0; pass < 20; pass += 1) {
          const middle = (low + high) / 2;
          if (pushBoxCollisionMap.rectHitsSolid({ ...from, x: from.x + sign * middle })) high = middle; else low = middle;
        }
        return low > 0.001 ? { ...from, x: from.x + sign * low } : limited;
      },
    );`, file);
    source = replaceOnce(source, `  private updateFallingPushBoxes(dt: number): void {`, `  /** pushbox-general-fall: the first x on the push path (1-unit steps) where nothing is under the box's whole
   *  bottom edge, starting from a supported box; undefined when it stays supported (FUN_7ff72bb33890). */
  private firstUnsupportedPushBoxX(index: number, before: Rect, after: Rect): number | undefined {
    if (!this.tileMap || after.x === before.x) return undefined;
    const solids: Rect[] = [
      ...this.gates.filter((gate) => gate.isSolid()).map((gate) => gate.rect),
      ...this.stationaryActiveFallBoxRects(),
      ...this.staticRects.filter((staticRect) => staticRect.spawn.actorName !== 'PuzzlePredictProxy').map((staticRect) => staticRect.rect),
      ...this.moveWalls.map((moveWall) => moveWall.rect),
      ...this.weightedLifts.map((weightedLift) => weightedLift.rect),
      ...this.bridges.filter((bridge) => bridge.isSolid()).map((bridge) => bridge.rect),
      ...this.blinkBlocks.filter((blinkBlock) => blinkBlock.solid).map((blinkBlock) => blinkBlock.rect),
      ...this.colorBoxes.map(colorBoxRect),
      ...this.damageRects.map((damageRect) => damageRect.rect),
      ...this.pushBoxes.filter((_, other) => other !== index).map((other) => other.rect),
      ...this.players.filter((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
        && !this.collisionChangePlayersCollisionOff.has(player)).map((player) => player.rect),
    ];
    const supportedAt = (x: number): boolean => {
      const strip = { x: x + 1.001, y: before.y + before.height + .001, width: before.width - 2.002, height: 1 };
      return this.tileMap!.rectHitsSolid(strip) || solids.some((solid) => rectsOverlap(strip, solid));
    };
    if (!supportedAt(before.x)) return undefined;
    const sign = Math.sign(after.x - before.x);
    const distance = Math.abs(after.x - before.x);
    for (let travelled = 1; travelled < distance; travelled += 1) {
      const x = before.x + sign * travelled;
      if (!supportedAt(x)) return x;
    }
    return undefined;
  }

  private updateFallingPushBoxes(dt: number): void {`, file);
    // scaleswitch-carry: a growing cat lifts the stack on its head and pushes cats at its sides (command 0x21 ->
    // FUN_7ff72bb34f30 -> FUN_7ff72bc17330).
    source = replaceOnce(source, `    this.player.charge = nextSize;
    this.player.view.scale.set(nextBodyScale, nextBodyScale);
    this.player.applyResolvedCollision(nextRect, this.player.velocity, this.player.grounded);
  }`, `    const grower = this.player;
    const beforeRect = { ...currentRect };
    this.player.charge = nextSize;
    this.player.view.scale.set(nextBodyScale, nextBodyScale);
    this.player.applyResolvedCollision(nextRect, this.player.velocity, this.player.grounded);
    if (nextSize > currentSize) {
      const dh = nextRect.height - beforeRect.height;
      const dw = (nextRect.width - beforeRect.width) / 2;
      if (dh > 0) this.pushTouchingCats(grower, beforeRect, 'up', 0, -dh, new Set([grower]));
      if (dw > 0) {
        this.pushTouchingCats(grower, beforeRect, 'right', dw, 0, new Set([grower]));
        this.pushTouchingCats(grower, beforeRect, 'left', -dw, 0, new Set([grower]));
      }
    }
  }

  /** scaleswitch-carry: FUN_7ff72bc17330 / FUN_7ff72bc16780 - move every cat touching \`sourceRect\` on the \`side\` face
   *  by (dx, dy), no map sweep, then the cats touching each moved cat the same way (visited set). */
  private pushTouchingCats(source: Player, sourceRect: Rect, side: 'up' | 'left' | 'right', dx: number, dy: number, visited: Set<Player>): void {
    for (const cat of this.players) {
      if (visited.size >= 100) return;
      if (visited.has(cat) || cat === source) continue;
      if (this.collisionChangePlayersCollisionOff.has(cat) || cat.deathTimer > 0 || this.deathFallPlayers.has(cat)) continue;
      const rect = cat.rect;
      const verticalOverlap = rect.y < sourceRect.y + sourceRect.height && rect.y + rect.height > sourceRect.y;
      const touches = side === 'up'
        ? rectRestsOnSupport(rect, sourceRect)
        : side === 'right'
          ? verticalOverlap && Math.abs(rect.x - (sourceRect.x + sourceRect.width)) <= 0.5
          : verticalOverlap && Math.abs(rect.x + rect.width - sourceRect.x) <= 0.5;
      if (!touches) continue;
      visited.add(cat);
      const before = { ...rect };
      cat.applyResolvedCollision({ ...rect, x: rect.x + dx, y: rect.y + dy }, cat.velocity, cat.grounded);
      this.pushTouchingCats(cat, before, side, dx, dy, visited);
    }
  }`, file);
    // jumpstand-launch: the stand is a solid body for cats and boxes (FUN_7ff72bb649a0, category 5).
    source = replaceOnce(source, `    const blockerRects = [
      ...this.stationaryActiveFallBoxRects(),`, `    const blockerRects = [
      ...this.jumpStands.map((jumpStand) => jumpStand.rect),
      ...this.stationaryActiveFallBoxRects(),`, file);
    source = replaceOnce(source, `          || publishedSwitchRectRects.some((switchRect) => rectsOverlap(rect, switchRect));
      },
    };`, `          || publishedSwitchRectRects.some((switchRect) => rectsOverlap(rect, switchRect))
          || this.jumpStands.some((jumpStand) => rectsOverlap(rect, jumpStand.rect));
      },
    };`, file);
    source = replaceOnce(source, `      ...this.colorBoxes.map(colorBoxRect),
      ...this.damageRects.map((damageRect) => damageRect.rect),
    ];
    for (let i = 0; i < this.pushBoxes.length; i += 1) {`, `      ...this.colorBoxes.map(colorBoxRect),
      ...this.damageRects.map((damageRect) => damageRect.rect),
      ...this.jumpStands.map((jumpStand) => jumpStand.rect),
    ];
    for (let i = 0; i < this.pushBoxes.length; i += 1) {`, file);
    source = replaceOnce(source, `      ...this.damageRects.map((damageRect) => damageRect.rect),
      ...this.pushBoxes.filter((_, other) => other !== index).map((other) => other.rect),`, `      ...this.damageRects.map((damageRect) => damageRect.rect),
      ...this.jumpStands.map((jumpStand) => jumpStand.rect),
      ...this.pushBoxes.filter((_, other) => other !== index).map((other) => other.rect),`, file);
    // jumpstand-launch: launch a cat resting on a stand top with nothing on its head (FUN_7ff72bb64c70).
    {
      const begin = source.indexOf('  private applyJumpStands(previousPlayerRect: Rect): void {');
      const end = source.indexOf('  private applyJumpAreas(): void {', begin);
      if (begin < 0 || end < 0) throw new Error('Patch anchor changed: applyJumpStands');
      source = source.slice(0, begin) + `  private applyJumpStands(previousPlayerRect: Rect): void {
    void previousPlayerRect;
    const cat = this.player;
    if (!cat) return;
    if (this.collisionChangePlayersCollisionOff.has(cat)) return;
    if (this.activelyGuardingPlayers.has(cat)) return;
    if (cat.jumpPhase !== 0) return;   // command 0 is refused while the hold ramp runs
    const stand = this.jumpStands.find((jumpStand) => rectRestsOnSupport(cat.rect, jumpStand.rect));
    if (!stand) return;
    if (this.somethingRestsOn(cat.rect, cat)) return;
    cat.pendingLaunchY = stand.launchVelocity.y;
  }

  /** jumpstand-launch: FUN_7ff72bc132c0(body, up, ...) != 0 - a cat or box rests on top of \`rect\`. */
  private somethingRestsOn(rect: Rect, self: unknown): boolean {
    return this.players.some((other) => other !== self && !this.collisionChangePlayersCollisionOff.has(other)
        && other.deathTimer <= 0 && rectRestsOnSupport(other.rect, rect))
      || this.pushBoxes.some((box) => box !== self && rectRestsOnSupport(box.rect, rect));
  }

` + source.slice(end);
    }
    // jumpstand-launch: launch a box resting on a stand top (FUN_7ff72bb33d00 / FUN_7ff72bb33890).
    source = replaceOnce(source, `      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);`, `      {
        const stand = this.jumpStands.find((jumpStand) => rectRestsOnSupport(box.rect, jumpStand.rect));
        if (stand && box.velocityY >= 0 && !this.somethingRestsOn(box.rect, box)) {
          const start = this.frameStartPushBoxRects[i];
          const movedLeft = !!start && box.rect.x < start.x;
          box.launchX = Math.abs(stand.launchVelocity.x) * (movedLeft ? -1 : 1);
          // vy = launch after gravity: the first airborne tick moves the full launch (the rise branch adds gravity).
          box.velocityY = stand.launchVelocity.y - PUSH_BOX_GRAVITY * dt;
          box.falling = true;
          box.hopping = true;
          box.wasSupported = false;
        }
      }
      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);`, file);
    source = replaceOnce(source, `      const supported = blockedAt(supportStrip);`, `      // jumpstand-launch: while airborne with nothing on top, the stand's sideways launch moves the box each tick.
      if (box.launchX !== 0 && box.falling && !this.somethingRestsOn(box.rect, box)) {
        const dx = box.launchX * dt;
        const moved = { ...box.rect, x: box.rect.x + dx };
        if (blockedAt(moved)) box.launchX = 0; else box.applyRect(moved);
      }
      const supported = blockedAt(supportStrip);`, file);
    source = replaceOnce(source, `        box.hopping = false;
        box.falling = false;
        box.velocityY = 0;
        box.wasSupported = true;
        continue;`, `        box.hopping = false;
        box.falling = false;
        box.velocityY = 0;
        box.launchX = 0;
        box.wasSupported = true;
        continue;`, file);
    // distance-constraint-native: the native rope solver (FUN_7ff72bb3f580 / FUN_7ff72bb3fce0 / FUN_7ff72bb3ffe0).
    {
      const begin = source.indexOf('  private applyDistanceConstraints(): void {');
      const end = source.indexOf('  private applyCollisionConstraintMoves(): void {', begin);
      if (begin < 0 || end < 0) throw new Error('Patch anchor changed: applyDistanceConstraints');
      source = source.slice(0, begin) + `  private applyDistanceConstraints(): void {
    if (this.distanceConstraints.length === 0) return;
    try {
      for (const distanceConstraint of this.distanceConstraints) this.applyNativeRope(distanceConstraint);
    } finally {
      for (const distanceConstraint of this.distanceConstraints) distanceConstraint.clearCommand29Latches();
    }
  }

  /** distance-constraint-native: one tick of FUN_7ff72bb3f580 for one rope. */
  private applyNativeRope(rope: DistanceConstraint): void {
    const cats = this.players;
    const count = cats.length;
    if (count < 2 || !this.tileMap) return;
    // States 1 / 3 (respawning / dying) idle the whole rope.
    if (cats.some((cat) => cat.deathTimer > 0 || this.deathFallPlayers.has(cat))) return;
    const link = selectDistanceConstraintLinkForPlayerCount(rope.params.values, count);
    if (!link || link.maxDistance <= 0) return;
    const maxDist = link.maxDistance;
    const weight = link.secondValue;
    const cleared = (cat: Player) => this.goalClearedPlayers.has(cat);   // state 4
    const point = (cat: Player) => ({ x: cat.rect.x + cat.rect.width / 2, y: cat.rect.y + cat.rect.height + 1 });
    const sgn = (value: number) => (value < 0 ? -1 : 1);
    const tileMap = this.tileMap;
    const blocked = (cat: Player, dx: number, dy: number) => tileMap.rectHitsSolid({ ...cat.rect, x: cat.rect.x + dx, y: cat.rect.y + dy });

    // Recursive stack above each cat (cats and boxes resting on it).
    const stackAbove = (rect: Rect, seen: Set<unknown>): number => {
      let total = 0;
      for (const other of cats) {
        if (seen.has(other) || !rectRestsOnSupport(other.rect, rect)) continue;
        seen.add(other);
        total += 1 + stackAbove(other.rect, seen);
      }
      for (const box of this.pushBoxes) {
        if (seen.has(box) || !rectRestsOnSupport(box.rect, rect)) continue;
        seen.add(box);
        total += 1 + stackAbove(box.rect, seen);
      }
      return total;
    };
    const stacks = cats.map((cat) => stackAbove(cat.rect, new Set([cat])));
    // Supported: on a tile or a non-cat body, or on a supported cat (FUN_7ff72bb67850 / FUN_7ff72bb69dd0).
    const supported = cats.map((cat) => cat.grounded);
    for (let pass = 0; pass < count; pass += 1) {
      cats.forEach((cat, i) => {
        if (!cat.grounded) return;
        const onTile = tileMap.rectHitsSolid({ ...cat.rect, y: cat.rect.y + 1 });
        if (onTile) return;
        const supports = cats.filter((other, j) => j !== i && rectRestsOnSupport(cat.rect, other.rect));
        if (supports.length > 0 && supports.every((other) => !supported[cats.indexOf(other)])) supported[i] = false;
      });
    }
    const positions = cats.map(point);
    const taut = (a: number, b: number) => Math.hypot(positions[b].x - positions[a].x, positions[b].y - positions[a].y) > maxDist;
    // FUN_7ff72bb40380 / FUN_7ff72bb40570: walk EVERY link out to the chain end; a slack link adds nothing
    // (FUN_7ff72bb407a0 returns 0 when len <= maxDist) but does not stop the walk.
    const farSide = (i: number, step: -1 | 1) => {
      const far = { x: 0, y: supported[i] ? 0 : (stacks[i] + 1) * weight };
      for (let j = i; j + step >= 0 && j + step < count; j += step) {
        if (!taut(j, j + step)) continue;
        const dx = positions[j + step].x - positions[j].x, dy = positions[j + step].y - positions[j].y;
        const len = Math.hypot(dx, dy);
        far.x += (dx / len) * (stacks[j + step] + 1);
        far.y += (dy / len) * (stacks[j + step] + 1);
      }
      return far;
    };
    // The same walk counts unsupported neighbours; the first supported one resets the count to 0 for good.
    const hangingRun = (i: number, step: -1 | 1) => {
      let run = 0;
      for (let j = i + step; j >= 0 && j < count; j += step) {
        if (supported[j]) return 0;
        run += 1;
      }
      return run;
    };
    const left = cats.map((_, i) => farSide(i, -1));
    const right = cats.map((_, i) => farSide(i, 1));

    const corrections = cats.map((cat, i) => {
      if (cleared(cat)) return { x: 0, y: 0 };
      let upRedirect = false;
      const latch = rope.hasCommand29Latch(i);
      const pair = (j: number, selfFar: { x: number; y: number }, otherFar: { x: number; y: number }, run: number) => {
        if (j < 0 || j >= count) return { x: 0, y: 0 };
        const dx = positions[j].x - positions[i].x, dy = positions[j].y - positions[i].y;
        const len = Math.hypot(dx, dy);
        if (len <= maxDist || len === 0) return { x: 0, y: 0 };
        const nx = dx / len, ny = dy / len;
        const s1 = Math.max(0, -(nx * selfFar.x + ny * selfFar.y));
        const s2 = Math.max(0, nx * otherFar.x + ny * otherFar.y);
        const share = cleared(cats[j]) ? 1 : (s2 + 1) / (s1 + s2 + 2);
        const c = { x: nx * (len - maxDist) * share * 0.2, y: ny * (len - maxDist) * share * 0.2 };
        const eps = 1.19e-7;
        if ((c.x > eps && blocked(cat, 1, 0)) || (c.x < -eps && blocked(cat, -1, 0))) {
          c.y += Math.abs(c.x) * sgn(c.y);
          c.x = 0;
          if (sgn(c.y) < 0) upRedirect = true;
        }
        if (c.y < -eps && blocked(cat, 0, -1)) {
          c.x += Math.abs(c.y) * sgn(c.x);
          c.y = 0;
        } else if (c.y > eps && blocked(cat, 0, 1)) {
          const k = latch ? Math.min(1, 1.2 / (run + 1)) : 1;
          c.x += Math.abs(c.y) * sgn(c.x) * k;
          c.y = 0;
        }
        return c;
      };
      const a = pair(i - 1, right[i], left[i - 1] ?? { x: 0, y: 0 }, hangingRun(i, -1));
      const b = pair(i + 1, left[i], right[i + 1] ?? { x: 0, y: 0 }, hangingRun(i, 1));
      const c = { x: a.x + b.x, y: a.y + b.y };
      const vx = cat.velocity.x / 60, vy = cat.velocity.y / 60;
      if (latch && vx * c.x < 0 && Math.abs(vx) < Math.abs(c.x) + 0.1) c.x = -sgn(vx) * (Math.abs(vx) - 0.1);
      if (c.y < -0.1 && !cat.grounded && upRedirect && c.y > vy) c.y = 0;
      if (c.y < 0 && cat.grounded && c.y > -0.65) c.y = 0;
      c.y = Math.max(-20.15, Math.min(20.15, c.y));
      return c;
    });

    // Apply every correction through the tile sweep, then carry riders by what was applied.
    cats.forEach((cat, i) => {
      const c = corrections[i];
      if (c.x === 0 && c.y === 0) return;
      const before = { ...cat.rect };
      const moved = moveRectWithTileCollisions(tileMap, cat.rect, { x: c.x, y: c.y });
      cat.applyResolvedCollision(moved.rect, { x: cat.velocity.x + c.x * 60, y: cat.velocity.y + c.y * 60 },
        c.y > 0 ? false : cat.grounded);
      const dx = moved.rect.x - before.x, dy = moved.rect.y - before.y;
      if (dx === 0 && dy === 0) return;
      for (const rider of cats) {
        if (rider === cat || !rectRestsOnSupport(rider.rect, before)) continue;
        const carried = moveRectWithTileCollisions(tileMap, rider.rect, { x: dx, y: dy });
        rider.applyResolvedCollision(carried.rect, rider.velocity, rider.grounded);
      }
    });
  }

` + source.slice(end);
    }
    // lift-load-carry-agree: the slab counts and carries only bodies whose foot centre is over it (FUN_7ff72bb64310).
    source = replaceOnce(source, `    const rectLoadsLift = (rect: Rect) => {
      const rectBottom = rect.y + rect.height;
      return Math.abs(rectBottom - lift.rect.y) <= 0.5
        && rect.x + rect.width > lift.rect.x
        && rect.x < lift.rect.x + lift.rect.width;
    };`, `    const rectLoadsLift = (rect: Rect) => feetOnSlab(rect, lift.rect);`, file);
    source = replaceOnce(source, `        if (liftLoadPlayers.has(player) || this.collisionChangePlayersCollisionOff.has(player)) continue;
        if (!rectRestsOnSupport(player.rect, liftLoadSupports[supportIndex])) continue;`, `        if (liftLoadPlayers.has(player) || this.collisionChangePlayersCollisionOff.has(player)) continue;
        if (supportIndex === 0 ? !feetOnSlab(player.rect, lift.rect) : !rectRestsOnSupport(player.rect, liftLoadSupports[supportIndex])) continue;`, file);
    source = replaceOnce(source, `          const playerRect = previousPlayerRects[playerIndex];
          if (!restsOnSupport(playerRect, supportRect)) continue;
          supportedPlayers.add(playerIndex);`, `          const playerRect = previousPlayerRects[playerIndex];
          if (supportIndex === 0 ? !feetOnSlab(playerRect, supportRect) : !restsOnSupport(playerRect, supportRect)) continue;
          supportedPlayers.add(playerIndex);`, file);
    // lift-load-carry-agree: a head box rides a lift only through a cat the lift actually carried this frame.
    source = replaceOnce(source, `      if (carrierIndex < 0) continue;
      const carrier = this.players[carrierIndex];`, `      if (carrierIndex < 0) continue;
      const carrier = this.players[carrierIndex];
      {
        const carrierStart = this.frameStartPlayerRects[carrierIndex];
        const carrierMoved = carrierStart
          && Math.abs(carrier.rect.x - carrierStart.x - dx) <= 0.01 && Math.abs(carrier.rect.y - carrierStart.y - dy) <= 0.01;
        if (!carrierMoved) continue;
      }`, file);
    source += `
/** lift-load-carry-agree: a body is on a lift slab when its feet rest on the slab top with their centre over it. */
function feetOnSlab(rect: Rect, slab: Rect): boolean {
  const centre = rect.x + rect.width / 2;
  return Math.abs(rect.y + rect.height - slab.y) <= 0.5
    && centre >= slab.x && centre <= slab.x + slab.width;
}
`;
    // multi-jump-relay: the relay component (+0x17e0) per MultiPlayer.
    source = replaceOnce(source, '  private multiPlayerActiveInputSlots = new Map<Player, number>();\n', `  private multiPlayerActiveInputSlots = new Map<Player, number>();
  /** multi-jump-relay: turn slot (+0x178), holder slot (+0x174, -1 = none), party size n, switch target name, HUD. */
  private multiRelay = new Map<Player, {
    turnSlot: number;
    holderSlot: number;
    partyN: number;
    targetName: string;
    wasGrounded: boolean;
    hud: Text;
  }>();
`, file);
    source = replaceOnce(source, '    this.multiPlayerActiveInputSlots.clear();\n    this.currentPlayerIndex = 0;\n', `    this.multiPlayerActiveInputSlots.clear();
    this.multiRelay.clear();
    this.currentPlayerIndex = 0;
`, file);
    source = replaceOnce(source, `    if (spawn.actorName === 'MultiPlayer') {
      this.multiPlayers.add(player);
    }
`, `    if (spawn.actorName === 'MultiPlayer') {
      this.multiPlayers.add(player);
      this.createMultiPlayerRelay(player, spawn, inputSlot);
    }
`, file);
    source = replaceOnce(source, `  private resolveMultiPlayerInput(
    input: InputState,
    playerInputs: readonly InputState[] | undefined,
    player: Player,
  ): InputState {
    if (!playerInputs || playerInputs.length === 0) return input;

    const activeSlot = this.multiPlayerActiveInputSlots.get(player);
    if (activeSlot !== undefined) {
      const activeInput = playerInputs[activeSlot];
      if (activeInput && inputStateHoldsMultiPlayerLatch(activeInput)) return activeInput;
      this.multiPlayerActiveInputSlots.delete(player);
    }

    const nextSlot = playerInputs.findIndex(inputStateHoldsMultiPlayerLatch);
    if (nextSlot >= 0) {
      this.multiPlayerActiveInputSlots.set(player, nextSlot);
      return playerInputs[nextSlot] ?? NEUTRAL_INPUT;
    }

    return NEUTRAL_INPUT;
  }
`, `  // multi-jump-relay: relay FUN_7ff72bb58db0. Only a jump press from the turn slot counts and takes the hold;
  // steering (FUN_7ff72bb59000) is the holder's OR the turn slot's; the hold boost is the holder's jump button.
  private resolveMultiPlayerInput(
    input: InputState,
    playerInputs: readonly InputState[] | undefined,
    player: Player,
  ): InputState {
    const relay = this.multiRelay.get(player);
    if (!relay) return input;
    const inputs = playerInputs && playerInputs.length > 0 ? playerInputs : [input];
    const turnInput = inputs[relay.turnSlot] ?? NEUTRAL_INPUT;
    if (turnInput.jumpPressed) relay.holderSlot = relay.turnSlot;
    let holderInput = relay.holderSlot >= 0 ? inputs[relay.holderSlot] : undefined;
    if (relay.holderSlot >= 0 && !holderInput?.jump && !holderInput?.jumpPressed) {
      relay.holderSlot = -1;
      holderInput = undefined;
    }
    this.multiPlayerActiveInputSlots.set(player, relay.holderSlot >= 0 ? relay.holderSlot : relay.turnSlot);
    const either = (key: 'left' | 'right' | 'up' | 'down' | 'resetPressed') => !!(turnInput[key] || holderInput?.[key]);
    // The merged mask keeps both bits; FUN_7ff72bb6f0e0 tests RIGHT (6) before LEFT (5), so right wins a conflict.
    return {
      ...NEUTRAL_INPUT,
      left: either('left') && !either('right'),
      right: either('right'),
      up: either('up'),
      down: either('down'),
      jump: !!holderInput?.jump,
      jumpPressed: !!turnInput.jumpPressed,
      resetPressed: either('resetPressed'),
    };
  }

  // multi-jump-relay: factory 0x7ff72bb76f17 -- p1 = jumps per airtime (+0xc90); the turn starts at the spawn slot.
  private createMultiPlayerRelay(player: Player, spawn: ActorSpawnDef, inputSlot: number): void {
    const at = spawn.raw.findIndex((value, index) => value === spawn.x && spawn.raw[index + 1] === spawn.y);
    const maxJumps = at >= 0 ? Number(spawn.raw[at + 3]) : Number.NaN;
    player.airJumps = true;
    player.maxJumps = Number.isFinite(maxJumps) ? Math.trunc(maxJumps) : 0;
    const hud = new Text('', new TextStyle({
      fill: 0xffffff,
      fontSize: 28,
      fontWeight: '700',
      stroke: 0x000000,
      strokeThickness: 5,
    }));
    hud.anchor.set(0.5);
    this.actorLayer.addChild(hud);
    this.multiRelay.set(player, {
      turnSlot: inputSlot,
      holderSlot: -1,
      partyN: Math.max(1, Math.trunc(this.nativePartyCount())),
      targetName: 'MultiPlayer' + spawn.label.trim(),
      wasGrounded: false,
      hud,
    });
    this.updateMultiPlayerHud(player);
  }

  // multi-jump-relay: after the avatar update -- landing (cmd 0x17) drops the holder; a jump whose head was not
  // blocked passes the turn to (turn + 1) % n and recolours the cat (FUN_7ff72bb67670).
  private passMultiPlayerTurn(player: Player): void {
    const relay = this.multiRelay.get(player);
    if (!relay) return;
    if (!relay.wasGrounded && player.grounded) relay.holderSlot = -1;
    relay.wasGrounded = player.grounded;
    if (player.jumpStarted && !player.jumpHeadBlocked) {
      relay.turnSlot = (relay.turnSlot + 1) % relay.partyN;
      player.setBodyColor(PLAYER_BODY_COLORS[relay.turnSlot] ?? DEFAULT_PLAYER_BODY_COLOR);
    }
    this.updateMultiPlayerHud(player);
  }

  // multi-jump-relay: HUD FUN_7ff72bb702d0 -- remaining = c90 - counter, drawn 96 above the cat.
  private updateMultiPlayerHud(player: Player): void {
    const relay = this.multiRelay.get(player);
    if (!relay) return;
    relay.hud.visible = player.maxJumps >= 1;
    relay.hud.text = String(Math.max(0, player.maxJumps - player.jumpsUsed));
    relay.hud.x = player.rect.x + player.rect.width / 2;
    relay.hud.y = player.rect.y + player.rect.height - 96;
  }

  // multi-jump-relay: command 9 with input source 3 doubles c90 (0x7ff72bb699ca..db); a Switch targets the cat by
  // actorName + label ("MultiPlayer1").
  private doubleMultiPlayerJumps(switchSpawn: ActorSpawnDef): void {
    const target = switchSpawn.label.trim();
    for (const [player, relay] of this.multiRelay) {
      if (relay.targetName === target) player.maxJumps *= 2;
    }
  }
`, file);
    source = replaceOnce(source, `      const previousHorizontalVelocity = this.player.velocity.x;
      const wasRisingBeforeUpdate = this.player.velocity.y < 0;
`, `      const previousHorizontalVelocity = this.player.velocity.x;
      const wasRisingBeforeUpdate = this.player.velocity.y < 0;
      this.player.jumpStarted = false;
      this.player.jumpHeadBlocked = false;
`, file);
    source = replaceOnce(source, '      this.applyIceChipSlide(clampedDt, activePlayerInput, previousHorizontalVelocity);\n', `      this.applyIceChipSlide(clampedDt, activePlayerInput, previousHorizontalVelocity);
      this.passMultiPlayerTurn(this.player);
`, file);
    source = replaceOnce(source, `        switchPad.press();
        this.onEvent?.({ type: 'switch', playerIndex: this.inputSlotForPlainSwitchActivation(switchPad) });
`, `        switchPad.press();
        this.doubleMultiPlayerJumps(switchPad.spawn);
        this.onEvent?.({ type: 'switch', playerIndex: this.inputSlotForPlainSwitchActivation(switchPad) });
`, file);
    // jumparea-top-left: begin-contact cmd 0 (FUN_7ff72bb36340), dropped during the hold ramp (FUN_7ff72bb6fd20);
    // the next update sets vy = p3 once and vx = p2 until landing (FUN_7ff72bb6f0e0).
    source = replaceOnce(source, `      if (!launched) {
        this.player.applyResolvedCollision(this.player.rect, getJumpAreaVelocity(jumpArea), false);
        launched = true;
      }
`, `      if (!launched && this.player.jumpPhase === 0) {
        const velocity = getJumpAreaVelocity(jumpArea);
        this.player.pendingLaunchY = velocity.y;
        this.player.lockedVx = velocity.x;
        launched = true;
      }
`, file);
    // majority-player: state reset with the stage; the vote is stepped once per frame before any input reader.
    source = replaceOnce(source, '  private hasMajorityController = false;\n', `  private hasMajorityController = false;
  /** majority-player: the shared cat (vote block +0x1530), its vote {n, ratio, cur, prev, progress} and the HUD pad. */
  private majorityPlayers = new Set<Player>();
  private majorityVote: { n: number; ratio: number; cur: number; prev: number; progress: number[] } | null = null;
  private majorityHud: { spawn: ActorSpawnDef; view: Graphics } | null = null;
`, file);
    source = replaceOnce(source, `    this.hasMajorityController = false;
    this.breakoutKeys = [];
`, `    this.hasMajorityController = false;
    this.majorityPlayers.clear();
    this.majorityVote = null;
    this.majorityHud = null;
    this.breakoutKeys = [];
`, file);
    source = replaceOnce(source, `    MajorityController: (spawn) => {
      this.hasMajorityController = true;
      this.addActorView(spawn, drawDebugActor(spawn));
    },
`, `    MajorityController: (spawn) => {
      // majority-player: ctor FUN_7ff72bb65df0 -- HUD only (the pad with five progress bars), no body.
      this.hasMajorityController = true;
      const view = new Graphics();
      this.majorityHud = { spawn, view };
      this.actorLayer.addChild(view);
    },
`, file);
    source = replaceOnce(source, `    if (spawn.actorName === 'MajorityPlayer') {
      this.hasMajorityController = true;
    }
`, `    if (spawn.actorName === 'MajorityPlayer') {
      this.createMajorityVote(player);
    }
`, file);
    source = replaceOnce(source, '    if (!this.tileMap || this.players.length === 0 || this.cleared) return;\n', `    if (!this.tileMap || this.players.length === 0 || this.cleared) return;
    this.stepMajorityVote(input, playerInputs);
`, file);
    source = replaceOnce(source, `  private resolvePlayerInput(
    input: InputState,
    playerInputs: readonly InputState[] | undefined,
    activePlayerCount: number,
    playerIndex: number,
    playerInputSlot: number,
  ): InputState {
`, `  private resolvePlayerInput(
    input: InputState,
    playerInputs: readonly InputState[] | undefined,
    activePlayerCount: number,
    playerIndex: number,
    playerInputSlot: number,
  ): InputState {
    const majorityCat = this.players[playerIndex];
    if (majorityCat && this.majorityPlayers.has(majorityCat)) return this.resolveMajorityInput(input, playerInputs);
`, file);
    source = replaceOnce(source, `    const requiredGoalPlayerCount = this.hasMajorityController
      ? Math.floor(goalEligiblePlayers.length / 2) + 1
      : goalEligiblePlayers.length;
`, `    // majority-player: no majority goal rule natively (the one shared cat is the whole roster).
    const requiredGoalPlayerCount = goalEligiblePlayers.length;
`, file);
    source = replaceOnce(source, '    this.layoutCamera();\n    // Recovered-data: Ghost vtable POST slot', `    this.layoutCamera();
    this.drawMajorityHud();
    // Recovered-data: Ghost vtable POST slot`, file);
    source = replaceOnce(source, '  // multi-jump-relay: relay FUN_7ff72bb58db0.', `  // majority-player: FUN_7ff72bb774a0 mode 4 + FUN_7ff72bb68220(avatar, n, ratio). n = party size (DAT_7ff72c629fa8+0xcc08),
  // ratio = clamp(ceil(0.7f * n) / n, 0.1, 1.0); input source 1; body colour 0xffbfffdf (neutral).
  private createMajorityVote(player: Player): void {
    const n = Math.min(10, Math.max(1, Math.trunc(this.nativePartyCount())));
    const ratio = Math.min(1, Math.max(0.1, Math.fround(Math.ceil(Math.fround(Math.fround(0.7) * n)) / n)));
    this.majorityPlayers.add(player);
    this.majorityVote = { n, ratio, cur: 0, prev: 0, progress: [0, 0, 0, 0, 0] };
    player.setBodyColor(0xbfffdf);
  }

  // majority-player: tally FUN_7ff72bb7ffa0, once per tick before the avatar reads input. For each button, count the
  // slots p < n holding it (a missing slot abstains); set when (clear and frac >= ratio) or (set and frac >= ratio / 2).
  // Bits: 2 jump, 3 up, 4 down, 5 left, 6 right. Progress (HUD) = clear: frac / ratio; set: (frac - r/2) / (r/2).
  private stepMajorityVote(input: InputState, playerInputs: readonly InputState[] | undefined): void {
    const vote = this.majorityVote;
    if (!vote) return;
    const inputs = playerInputs && playerInputs.length > 0 ? playerInputs : [input];
    const holds: Array<(slot: InputState) => boolean> = [];
    holds[2] = (slot) => !!(slot.jump || slot.jumpPressed);
    holds[3] = (slot) => !!slot.up;
    holds[4] = (slot) => !!slot.down;
    holds[5] = (slot) => !!slot.left;
    holds[6] = (slot) => !!slot.right;
    vote.prev = vote.cur;
    vote.cur = 0;
    const keep = Math.fround(vote.ratio * 0.5);
    const progress: number[] = [];
    for (let bit = 2; bit <= 6; bit += 1) {
      let count = 0;
      for (let slot = 0; slot < vote.n; slot += 1) {
        const slotInput = inputs[slot];
        if (slotInput && holds[bit](slotInput)) count += 1;
      }
      const frac = Math.fround(count / vote.n);
      const wasSet = (vote.prev & (1 << bit)) !== 0;
      const set = wasSet ? frac >= keep : frac >= vote.ratio;
      if (set) vote.cur |= 1 << bit;
      progress[bit] = wasSet ? Math.max(0, Math.min((frac - keep) / keep, 1)) : Math.min(frac / vote.ratio, 1);
    }
    // FUN_7ff72bb65f80 copies buttons [3, 4, 5, 6, 2] (up, down, left, right, jump).
    vote.progress = [progress[3], progress[4], progress[5], progress[6], progress[2]];
  }

  // majority-player: the avatar reads only the voted bits (source 1): held = cur, press = cur & ~prev; right is
  // checked before left (FUN_7ff72bb6f0e0), so right wins a double vote.
  private resolveMajorityInput(input: InputState, playerInputs: readonly InputState[] | undefined): InputState {
    const vote = this.majorityVote;
    if (!vote) return input;
    const held = (bit: number) => (vote.cur & (1 << bit)) !== 0;
    const pressed = (bit: number) => held(bit) && (vote.prev & (1 << bit)) === 0;
    const inputs = playerInputs && playerInputs.length > 0 ? playerInputs : [input];
    return {
      ...NEUTRAL_INPUT,
      left: held(5) && !held(6),
      right: held(6),
      up: held(3),
      down: held(4),
      jump: held(2),
      jumpPressed: pressed(2),
      resetPressed: !!input.resetPressed || inputs.some((slot) => !!slot?.resetPressed),
    };
  }

  // majority-player: MajorityController draw FUN_7ff72bb660c0 -- the pad {-82, 0, 164, 84} at the row point (screen
  // fixed: the row x is WINDOW_WIDTH / (2 * scale)); each progress > 0 fills an orange 0xff864d bar from the bottom.
  private drawMajorityHud(): void {
    const hud = this.majorityHud;
    if (!hud) return;
    const progress = this.majorityVote?.progress ?? [0, 0, 0, 0, 0];
    const left = this.scrollCameraConfig?.mode ? this.scrollCameraState.scroll : 0;
    const g = hud.view;
    g.x = left + hud.spawn.x;
    g.y = hud.spawn.y;
    g.clear();
    g.beginFill(0x2b2b2b, 0.55);
    g.lineStyle(3, 0x3a2418, 0.9);
    g.drawRoundedRect(-82, 0, 164, 84, 14);
    g.endFill();
    // up, down, left, right, jump
    const rects = [[-54, 12.5, 28, 16], [-54, 52.5, 28, 16], [-69.5, 28.5, 16, 24], [-29.5, 28.5, 16, 24], [24.5, 20.5, 43, 40]];
    rects.forEach(([x, y, w, h], index) => {
      g.lineStyle(2, 0xffffff, 0.8);
      g.beginFill(0xffffff, 0.2);
      g.drawRect(x, y, w, h);
      g.endFill();
      const p = progress[index] ?? 0;
      if (p <= 0) return;
      g.lineStyle(0);
      g.beginFill(0xff864d, 1);
      g.drawRect(x, y + h - h * p, w, h * p);
      g.endFill();
    });
  }

  // multi-jump-relay: relay FUN_7ff72bb58db0.`, file);
    // jumpswitch-launch: a momentary pad (bit 0x40) pressed by any cat or push box; the edge launches its labelled target.
    source = replaceOnce(source, '  private readonly pressedJumpSwitches = new Set<JumpSwitch>();\n', `  private readonly pressedJumpSwitches = new Set<JumpSwitch>();
  /** jumpswitch-launch: pads overlapped last tick (press edges) and box launches for the push-box pass (+0x7e8). */
  private jumpSwitchesOccupied = new Set<JumpSwitch>();
  private pendingSwitchBoxLaunches = new Map<PushBox, { x: number; y: number }>();
`, file);
    source = replaceOnce(source, '    this.pressedJumpSwitches.clear();\n', `    this.pressedJumpSwitches.clear();
    this.jumpSwitchesOccupied.clear();
    this.pendingSwitchBoxLaunches.clear();
`, file);
    source = replaceOnce(source, '      this.pressJumpSwitches(resolvedPlayerInput);\n', ``, file);
    source = replaceOnce(source, `    this.carryPushBoxesOnPlayerHeads();
    this.updateFallingPushBoxes(clampedDt);
`, `    this.updateJumpSwitches();
    this.updateDelaySwitches(clampedDt);
    this.carryPushBoxesOnPlayerHeads();
    this.updateFallingPushBoxes(clampedDt);
`, file);
    source = replaceOnce(source, '      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);\n', `      {
        // jumpswitch-launch: FUN_7ff72bb33890 -- vy = launch (the first tick moves the full p1), no rider check.
        const launch = this.pendingSwitchBoxLaunches.get(box);
        if (launch) {
          this.pendingSwitchBoxLaunches.delete(box);
          box.launchX = launch.x;
          box.velocityY = launch.y - PUSH_BOX_GRAVITY * dt;
          box.falling = true;
          box.hopping = true;
          box.wasSupported = false;
        }
      }
      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);
`, file);
    source = replaceOnce(source, '  private pressJumpSwitches(input: InputState): void {\n', `  // jumpswitch-launch: ctor FUN_7ff72bb778f0 (type 0, momentary 0x40). Sensor: radius 12 at the row point
  // (FUN_7ff72bb5f1d0), any cat or push box. The press edge (FUN_7ff72bb5eef0) fires FUN_7ff72bb5f410: the target named
  // by the label (else the toucher); a cat gets command 1 (vy = p1), anything else command 0 (vx = |p0| * sign(vx),
  // vy = p1). No gate / bridge / stopwatch message (the base fire's 9 / 10 to the box is ignored by it).
  private updateJumpSwitches(): void {
    for (const jumpSwitch of this.jumpSwitches) {
      const sensor = { x: jumpSwitch.spawn.x - 12, y: jumpSwitch.spawn.y - 12, width: 24, height: 24 };
      const cat = this.players.find((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
        && !this.collisionChangePlayersCollisionOff.has(player) && rectsOverlap(player.rect, sensor));
      const box = cat ? undefined : this.pushBoxes.find((pushBox) => rectsOverlap(pushBox.rect, sensor));
      const occupied = !!(cat || box);
      const wasOccupied = this.jumpSwitchesOccupied.has(jumpSwitch);
      jumpSwitch.view.alpha = occupied ? 0.55 : 1;
      jumpSwitch.view.scale.y = occupied ? 0.65 : 1;
      if (!occupied) {
        this.jumpSwitchesOccupied.delete(jumpSwitch);
        continue;
      }
      this.jumpSwitchesOccupied.add(jumpSwitch);
      if (wasOccupied) continue;
      const toucherIndex = cat ? this.players.indexOf(cat) : -1;
      this.onEvent?.({
        type: 'switch',
        playerIndex: toucherIndex >= 0 ? this.playerInputSlots[toucherIndex] ?? toucherIndex : this.currentInputPlayerIndex(),
      });
      const name = jumpSwitch.spawn.label.trim();
      const named = (spawn: ActorSpawnDef | undefined) => !!spawn && name !== '' && spawn.actorName + spawn.label.trim() === name;
      const targetBoxes = this.pushBoxes.filter((pushBox) => named(pushBox.spawn));
      const targetCats = this.players.filter((_, index) => {
        const row = this.stage?.createTable.find((spawn) => spawn.x === this.playerSpawns[index]?.x
          && spawn.y === this.playerSpawns[index]?.y && runtimePlayerActorNames.has(spawn.actorName));
        return named(row);
      });
      const launchCats = targetBoxes.length + targetCats.length > 0 ? targetCats : cat ? [cat] : [];
      const launchBoxes = targetBoxes.length + targetCats.length > 0 ? targetBoxes : box ? [box] : [];
      const vx = jumpSwitch.params.state * 60;
      const vy = jumpSwitch.params.impulse * 60;
      for (const target of launchCats) target.pendingLaunchY = vy;
      for (const target of launchBoxes) {
        const start = this.frameStartPushBoxRects[this.pushBoxes.indexOf(target)];
        const movedLeft = !!start && target.rect.x < start.x;
        this.pendingSwitchBoxLaunches.set(target, { x: Math.abs(vx) * (movedLeft ? -1 : 1), y: vy });
      }
    }
  }

  // jumpswitch-launch: the old player-only jump-press path, no longer called.
  private pressJumpSwitches(input: InputState): void {
`, file);
    // delayswitch-countdown: a press starts a p0-second countdown; the on fan-out fires once at zero, then the pad pops up.
    source = replaceOnce(source, '  private delaySwitches: DelaySwitch[] = [];\n', `  private delaySwitches: DelaySwitch[] = [];
  /** delayswitch-countdown: seconds left per pressed DelaySwitch (+0x430) and its countdown label. */
  private delaySwitchCountdowns = new Map<DelaySwitch, number>();
  private delaySwitchLabels = new Map<DelaySwitch, Text>();
`, file);
    source = replaceOnce(source, '    this.delaySwitches = [];\n', `    this.delaySwitches = [];
    this.delaySwitchCountdowns.clear();
    this.delaySwitchLabels.clear();
`, file);
    source = replaceOnce(source, `    for (const delaySwitch of this.delaySwitches) {
      if (delaySwitch.pressed || !this.delaySwitchHasActivationOverlap(delaySwitch)) continue;
      delaySwitch.press();
      this.onEvent?.({ type: 'switch', playerIndex: this.currentInputPlayerIndex() });
      for (const gate of this.gates) {
        if (!gate.opened && shouldOpenGateForSwitch(delaySwitch.spawn, gate.spawn)) {
          gate.open();
        }
      }
      for (const bridge of this.bridges) {
        if (!bridge.opened && shouldOpenGateForSwitch(delaySwitch.spawn, bridge.spawn)) {
          bridge.open();
        }
      }
      this.openTrafficLightsForSwitch(delaySwitch.spawn);
      this.activateBaseLiftsForSwitch(delaySwitch.spawn);
      for (const stopWatch of this.stopWatches) {
        if (!stopWatch.activated && shouldActivateStopWatchForSwitch(delaySwitch.spawn, stopWatch.spawn)) {
          stopWatch.activate();
        }
      }
      this.disableDeadTimersForSwitch(delaySwitch.spawn);
      this.pressSwitchMediatorsForSwitch(delaySwitch.spawn);
      this.relayNativeDelaySwitchMediatorCommand(delaySwitch);
    }
`, ``, file);
    source = replaceOnce(source, `  private delaySwitchHasActivationOverlap(delaySwitch: DelaySwitch): boolean {
    return !this.collisionChangePlayersCollisionOff.has(this.player!)
      && !this.activelyGuardingPlayers.has(this.player!)
      && rectsOverlap(this.player!.rect, delaySwitch.rect);
  }
`, `  // delayswitch-countdown: pressed by any live cat or push box on the pad.
  private delaySwitchHasActivationOverlap(delaySwitch: DelaySwitch): boolean {
    return this.players.some((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
        && !this.collisionChangePlayersCollisionOff.has(player) && !this.activelyGuardingPlayers.has(player)
        && rectsOverlap(player.rect, delaySwitch.rect))
      || this.pushBoxes.some((box) => rectsOverlap(box.rect, delaySwitch.rect));
  }

  // delayswitch-countdown: ctor FUN_7ff72bb5f6d0 (latched, 0x100: the press sends nothing), delay p0 (+0x434).
  // Press edge: countdown = p0 s. Update FUN_7ff72bb5f9c0: subtract dt; at <= 0 fire the label target once (9 = on,
  // FUN_7ff72bb5ebb0) and release; a body still on it presses it again (every p0 s). Never sends off.
  // Label "%d" of (int)(t + 0.99) at (x, y - 75), size 32, centred, while counting.
  private updateDelaySwitches(dt: number): void {
    for (const delaySwitch of this.delaySwitches) {
      const label = this.delaySwitchLabel(delaySwitch);
      if (!delaySwitch.pressed) {
        label.visible = false;
        if (!this.delaySwitchHasActivationOverlap(delaySwitch)) continue;
        delaySwitch.press();
        this.delaySwitchCountdowns.set(delaySwitch, delaySwitch.params.delay);
        this.onEvent?.({ type: 'switch', playerIndex: this.currentInputPlayerIndex() });
      } else {
        const left = (this.delaySwitchCountdowns.get(delaySwitch) ?? 0) - dt;
        this.delaySwitchCountdowns.set(delaySwitch, left);
        if (left <= 0) {
          this.fireDelaySwitch(delaySwitch);
          this.delaySwitchCountdowns.set(delaySwitch, 0);
          delaySwitch.pressed = false;
          delaySwitch.view.alpha = 1;
          delaySwitch.view.scale.y = 1;
          label.visible = false;
          continue;
        }
      }
      const seconds = this.delaySwitchCountdowns.get(delaySwitch) ?? 0;
      label.text = String(Math.trunc(seconds + 0.99));
      label.visible = true;
    }
  }

  private delaySwitchLabel(delaySwitch: DelaySwitch): Text {
    let label = this.delaySwitchLabels.get(delaySwitch);
    if (label) return label;
    label = new Text('', new TextStyle({ fill: 0xffffff, fontSize: 32, fontWeight: '700', stroke: 0x000000, strokeThickness: 5 }));
    label.anchor.set(0.5);
    label.x = delaySwitch.spawn.x;
    label.y = delaySwitch.spawn.y - 75;
    label.visible = false;
    this.actorLayer.addChild(label);
    this.delaySwitchLabels.set(delaySwitch, label);
    return label;
  }

  // delayswitch-countdown: the on fan-out (was run at once on the press).
  private fireDelaySwitch(delaySwitch: DelaySwitch): void {
    for (const gate of this.gates) {
      if (!gate.opened && shouldOpenGateForSwitch(delaySwitch.spawn, gate.spawn)) {
        gate.open();
      }
    }
    for (const bridge of this.bridges) {
      if (!bridge.opened && shouldOpenGateForSwitch(delaySwitch.spawn, bridge.spawn)) {
        bridge.open();
      }
    }
    this.openTrafficLightsForSwitch(delaySwitch.spawn);
    this.activateBaseLiftsForSwitch(delaySwitch.spawn);
    for (const stopWatch of this.stopWatches) {
      if (!stopWatch.activated && shouldActivateStopWatchForSwitch(delaySwitch.spawn, stopWatch.spawn)) {
        stopWatch.activate();
      }
    }
    this.disableDeadTimersForSwitch(delaySwitch.spawn);
    this.pressSwitchMediatorsForSwitch(delaySwitch.spawn);
    this.relayNativeDelaySwitchMediatorCommand(delaySwitch);
  }
`, file);
    source = replaceOnce(source, '    if (this.delaySwitches.some((s) => s.pressed && shouldOpenGateForSwitch(s.spawn, targetSpawn))) return true;\n', ``, file);
    source = replaceOnce(source, '    if (this.delaySwitches.some((s) => s.pressed && shouldOpenTrafficLightForSwitch(s.spawn, targetSpawn))) return true;\n', ``, file);
    source = replaceOnce(source, '    if (this.delaySwitches.some((s) => s.pressed && shouldDisableDeadTimerForSwitch(s.spawn, deadTimerSpawn))) return true;\n', ``, file);
    source = replaceOnce(source, '    if (this.delaySwitches.some((s) => s.pressed && shouldActivateStopWatchForSwitch(s.spawn, stopWatchSpawn))) return true;\n', ``, file);
    source = replaceOnce(source, '    if (this.delaySwitches.some((delaySwitch) => delaySwitch.pressed && holdsMediator(delaySwitch.spawn))) return true;\n', ``, file);
    // jump-off-body-contact: a cat landing on a falling cat falls with it (native: a body is unsupported when every body
    // under it is a falling cat, FUN_7ff72bb67850 / FUN_7ff72bb69dd0), so the two stay touching through the fall.
    source = replaceOnce(source, `      } else if (cameFromAbove) {
        nextRect.y = otherRect.y - playerRect.height;
        nextVelocity.y = 0;
        nextGrounded = true;
      } else if (cameFromBelow) {
        nextRect.y = otherRect.y + otherRect.height;
        nextVelocity.y = 0;
      } else {
        const pushLeft = playerRect.x + playerRect.width - otherRect.x;`, `      } else if (cameFromAbove) {
        nextRect.y = otherRect.y - playerRect.height;
        nextVelocity.y = otherPlayer.grounded ? 0 : Math.max(0, otherPlayer.velocity.y);
        nextGrounded = true;
      } else if (cameFromBelow) {
        nextRect.y = otherRect.y + otherRect.height;
        nextVelocity.y = 0;
      } else {
        const pushLeft = playerRect.x + playerRect.width - otherRect.x;`, file);
    // jump-off-body-contact: before each cat's update, note a cat or push box directly under it (FUN_7ff72bc13690).
    source = replaceOnce(source, `      this.player.jumpStarted = false;
      this.player.jumpHeadBlocked = false;`, `      this.player.jumpStarted = false;
      this.player.jumpHeadBlocked = false;
      {
        // Contacts from the last step (frame-start rects), as native reads the body's contact list.
        const cat = this.player;
        const catStart = this.frameStartPlayerRects[this.players.indexOf(cat)] ?? cat.rect;
        cat.bodySupportContact = !this.collisionChangePlayersCollisionOff.has(cat) && (
          this.players.some((other, j) => other !== cat && other.deathTimer <= 0 && !this.deathFallPlayers.has(other)
            && !this.collisionChangePlayersCollisionOff.has(other)
            && rectRestsOnSupport(catStart, this.frameStartPlayerRects[j] ?? other.rect))
          || this.pushBoxes.some((box, j) => rectRestsOnSupport(catStart, this.frameStartPushBoxRects[j] ?? box.rect)));
      }`, file);
    // pushed-box-carries-stack: what rests on a pushed box rides it like a walking cat's stack.
    source = replaceOnce(source, `      for (const index of movedIndices) {
        this.carryPlayersWithPushedBox(previousPushBoxRects[index], result.boxRects[index]);
        this.pushBoxesMovedThisFrame.add(this.pushBoxes[index]);
      }`, `      for (const index of movedIndices) {
        this.carryPlayersWithPushedBox(previousPushBoxRects[index], result.boxRects[index]);
        this.pushBoxesMovedThisFrame.add(this.pushBoxes[index]);
      }
      for (const index of movedIndices) {
        const box = this.pushBoxes[index];
        if (box) this.rideStackOnSupport(previousPushBoxRects[index], result.boxRects[index].x - previousPushBoxRects[index].x, box);
      }`, file);
    // colorbox-native-body: the ColorBox body is the drawn rect inset 2 (FUN_7ff72bb3c0c0); the drawing stays full size.
    source = replaceOnce(source, `    g.drawRoundedRect(0, 0, width, height, Math.min(8, width / 4, height / 4));
    g.endFill();
    pushBox.view.addChild(g);`, `    g.drawRoundedRect(-2, -2, width, height, Math.min(8, width / 4, height / 4));
    g.endFill();
    pushBox.view.addChild(g);
    const body = { x: pushBox.rect.x + 2, y: pushBox.rect.y + 2, width: width - 4, height: height - 4 };
    pushBox.applyRect(body);
    (pushBox as { spawnRect: Rect }).spawnRect = { ...body };`, file);
    // land-on-rising-lift: a cat just above a lift top last frame and inside it now is standing on it.
    source = replaceOnce(source, `    this.dispatchRouletteLiftTriggerBeginContacts(previousPlayerRect);
    const result = resolveWeightedLiftPlayerCollision(`, `    this.dispatchRouletteLiftTriggerBeginContacts(previousPlayerRect);
    {
      const cat = this.player;
      const previousBottom = previousPlayerRect.y + previousPlayerRect.height;
      const tops = [...this.weightedLifts.map((lift) => lift.rect), ...this.rouletteLifts.flatMap((lift) => lift.bodyRects)];
      for (const top of tops) {
        if (cat.velocity.y < 0 || !rectsOverlap(cat.rect, top)) continue;
        if (previousBottom > top.y + 2) continue;
        const seated = { ...cat.rect, y: top.y - cat.rect.height };
        // Never into a chip or solid above (batch 4: a lift never carries a rider into a solid).
        if (this.tileMap?.rectHitsSolid(seated) || this.staticRects.some((block) => rectsOverlap(seated, block.rect))) continue;
        cat.applyResolvedCollision(seated, { ...cat.velocity, y: 0 }, true);
      }
    }
    const result = resolveWeightedLiftPlayerCollision(`, file);
    // native-walk-and-push-speed: a pushed box moves at most 1 per tick (FUN_7ff72bb33890 vx = +-1.0).
    source = replaceOnce(source, `      (index, from, to) => {
        const firstFreeX = this.firstUnsupportedPushBoxX(index, from, to);`, `      (index, from, toUncapped) => {
        // One budget per box per frame: the box's own update moves it at most 1 per tick whatever the pusher count.
        const pushedBox = this.pushBoxes[index];
        const maxStep = Math.max(0, 60 * this.currentFrameDt - (pushedBox ? this.pushBoxStepThisFrame.get(pushedBox) ?? 0 : 0));
        const to = Math.abs(toUncapped.x - from.x) <= maxStep ? toUncapped
          : { ...toUncapped, x: from.x + Math.sign(toUncapped.x - from.x) * maxStep };
        const firstFreeX = this.firstUnsupportedPushBoxX(index, from, to);`, file);
    source = replaceOnce(source, `    const clampedDt = Math.min(dt, 1 / 20);`, `    const clampedDt = Math.min(dt, 1 / 20);
    this.currentFrameDt = clampedDt;
    this.pushBoxStepThisFrame.clear();`, file);
    // native-walk-and-push-speed: the distance each box has been pushed this frame (shared by all its pushers).
    source = replaceOnce(source, `      for (const index of movedIndices) {
        this.carryPlayersWithPushedBox(previousPushBoxRects[index], result.boxRects[index]);
        this.pushBoxesMovedThisFrame.add(this.pushBoxes[index]);
      }`, `      for (const index of movedIndices) {
        this.carryPlayersWithPushedBox(previousPushBoxRects[index], result.boxRects[index]);
        this.pushBoxesMovedThisFrame.add(this.pushBoxes[index]);
        const pushed = this.pushBoxes[index];
        if (pushed) {
          const step = Math.abs(result.boxRects[index].x - previousPushBoxRects[index].x);
          this.pushBoxStepThisFrame.set(pushed, (this.pushBoxStepThisFrame.get(pushed) ?? 0) + step);
        }
      }`, file);
    source = replaceOnce(source, `  private rouletteLifts: RouletteLift[] = [];`, `  private rouletteLifts: RouletteLift[] = [];
  /** native-walk-and-push-speed: this frame's dt (the push cap is 1 per tick). */
  private currentFrameDt = 1 / 60;
  /** native-walk-and-push-speed: how far each box has been pushed this frame (budget 1 per tick per box). */
  private readonly pushBoxStepThisFrame = new Map<PushBox, number>();`, file);
    // native-walk-and-push-speed: the collision-off cat and the MoveWall intent walk 3 per tick sideways too.
    source = replaceOnce(source, `      x: horizontalDirection * COLLISION_OFF_PLAYER_MOVE_AXIS_SCALE * COLLISION_OFF_PLAYER_MOVE_SPEED,`, `      x: horizontalDirection * NATIVE_WALK_SPEED,`, file);
    source = replaceOnce(source, `          const intendedDeltaX = inputDirection
            * COLLISION_OFF_PLAYER_MOVE_AXIS_SCALE
            * COLLISION_OFF_PLAYER_MOVE_SPEED
            * dt;`, `          const intendedDeltaX = inputDirection * NATIVE_WALK_SPEED * dt;`, file);
    source += `
/** native-walk-and-push-speed: the native walk, 3 units per tick (FUN_7ff72bb687e0). */
const NATIVE_WALK_SPEED = 3 * 60;
`;
    // native-walk-and-push-speed: pushers behind a pusher close the box's step (native moves every body in one world
    // step, so a cat pushing a cat that pushes a box stays flush; the per-cat loop left it one step behind).
    source = replaceOnce(source, `    this.applyThundersAfterMotion(activePlayers, thunderContactIndexes);`, `    this.closePushChainGaps(activePlayers);
    this.applyThundersAfterMotion(activePlayers, thunderContactIndexes);`, file);
    source = replaceOnce(source, `  private firstUnsupportedPushBoxX(`, `  /** native-walk-and-push-speed: a cat pushing (intent) into a cat or a box that moved this frame closes the gap. */
  private closePushChainGaps(activePlayers: readonly Player[]): void {
    if (this.pushBoxStepThisFrame.size === 0 || !this.tileMap) return;
    for (let pass = 0; pass < activePlayers.length; pass += 1) {
      let moved = false;
      activePlayers.forEach((cat, index) => {
        const dir = Math.sign(this.framePushIntentX[index] ?? 0);
        if (dir === 0 || cat.deathTimer > 0 || this.collisionChangePlayersCollisionOff.has(cat)) return;
        const fronts = [
          ...activePlayers.filter((other, j) => other !== cat && Math.sign(this.framePushIntentX[j] ?? 0) === dir).map((other) => other.rect),
          ...[...this.pushBoxStepThisFrame.keys()].map((box) => box.rect),
        ];
        for (const front of fronts) {
          if (!(front.y < cat.rect.y + cat.rect.height && front.y + front.height > cat.rect.y)) continue;
          const gap = dir > 0 ? front.x - (cat.rect.x + cat.rect.width) : cat.rect.x - (front.x + front.width);
          if (!(gap > 1e-6 && gap <= 1.0001)) continue;
          const target = { ...cat.rect, x: cat.rect.x + dir * gap };
          if (this.tileMap!.rectHitsSolid(target)) continue;
          cat.applyResolvedCollision(target, cat.velocity, cat.grounded);
          moved = true;
          break;
        }
      });
      if (!moved) break;
    }
  }

  private firstUnsupportedPushBoxX(`, file);
    // breakout-paddle-dome: paddle views; ball-ball contact after every ball has moved.
    source = replaceOnce(source, '  private breakoutLostPlayers = new Set<Player>();\n', `  private breakoutLostPlayers = new Set<Player>();
  /** breakout-paddle-dome: the head actor view of each BreakoutPlayer (FUN_7ff72bb6b070). */
  private breakoutPaddleViews = new Map<Player, Sprite>();
`, file);
    source = replaceOnce(source, '    this.breakoutLostPlayers.clear();\n', `    this.breakoutLostPlayers.clear();
    this.breakoutPaddleViews.clear();
`, file);
    source = replaceOnce(source, '    if (breakoutBallMapChanged) this.redrawTiles();\n', `    if (breakoutBallMapChanged) this.redrawTiles();
    this.collideBreakoutBalls();
`, file);
    source = replaceOnce(source, '      ball.tryApplyPlayerContact(previousPlayerRect, player.rect);\n',
      '      ball.tryApplyPlayerContact(previousPlayerRect, player.rect, this.breakoutBallCounts.has(player));\n', file);
    source = replaceOnce(source, '    this.updateGhosts(ghostPreKeyTarget);\n', `    this.layoutBreakoutPaddles();
    this.updateGhosts(ghostPreKeyTarget);
`, file);
    source = replaceOnce(source, '  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {\n', `  /** breakout-paddle-dome: equal-mass balls exchange their normal speed components when they touch while approaching. */
  private collideBreakoutBalls(): void {
    const balls = this.breakoutBalls.filter((ball) => ball.lossCountdownTicks === 0 && !ball.removalRequested);
    const minimumDistance = BREAKOUT_BALL_RADIUS * 2;
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];
        const dx = b.center.x - a.center.x;
        const dy = b.center.y - a.center.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0 || distance >= minimumDistance) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const aNormal = a.velocity.x * nx + a.velocity.y * ny;
        const bNormal = b.velocity.x * nx + b.velocity.y * ny;
        if (aNormal - bNormal <= 0) continue;
        a.velocity.x = Math.fround(a.velocity.x + (bNormal - aNormal) * nx);
        a.velocity.y = Math.fround(a.velocity.y + (bNormal - aNormal) * ny);
        b.velocity.x = Math.fround(b.velocity.x + (aNormal - bNormal) * nx);
        b.velocity.y = Math.fround(b.velocity.y + (aNormal - bNormal) * ny);
        // FUN_7ff72bae64f0 fallback: a ball left with no heading leaves along -n (+ (0, 0.05)).
        if (a.velocity.x * a.velocity.x + a.velocity.y * a.velocity.y <= 1.1920928955078125e-7) {
          a.velocity.x = Math.fround(-nx);
          a.velocity.y = Math.fround(-ny + 0.05);
        }
        if (b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y <= 1.1920928955078125e-7) {
          b.velocity.x = Math.fround(nx);
          b.velocity.y = Math.fround(ny + 0.05);
        }
      }
    }
  }

  /** breakout-paddle-dome: the paddle view {-25, -26, 50, 26} sits on the dome centre, the row point + (0, -34). */
  private layoutBreakoutPaddles(): void {
    for (const [player, view] of this.breakoutPaddleViews) {
      const center = breakoutPaddleCenter(player.rect);
      view.x = center.x;
      view.y = center.y;
    }
  }

  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {
`, file);
    source = replaceOnce(source, "import { BREAKOUT_BALL_SPAWN_OFFSET_Y, BreakoutBall } from './actors/BreakoutBall';",
      "import { BREAKOUT_BALL_RADIUS, BREAKOUT_BALL_SPAWN_OFFSET_Y, BreakoutBall, breakoutPaddleCenter } from './actors/BreakoutBall';", file);
    // breakout-ball-per-row: every BreakoutPlayer row makes its ball; a party-limited row's ball goes to the last cat.
    source = replaceOnce(source, '  private breakoutLostPlayers = new Set<Player>();\n', `  private breakoutLostPlayers = new Set<Player>();
  /** breakout-ball-per-row: balls bound to each BreakoutPlayer (avatar +0x420, 1 from the ctor). */
  private breakoutBallCounts = new Map<Player, number>();
`, file);
    source = replaceOnce(source, '    this.breakoutLostPlayers.clear();\n', `    this.breakoutLostPlayers.clear();
    this.breakoutBallCounts.clear();
`, file);
    source = replaceOnce(source, `      const ball = new BreakoutBall(
        spawn.x,
        spawn.y + BREAKOUT_BALL_SPAWN_OFFSET_Y,
        player,
      );
      this.breakoutBalls.push(ball);
      this.actorLayer.addChild(ball.view);
`, `      this.addBreakoutBallForRow(spawn, player);
      this.breakoutBallCounts.set(player, 1);
      const paddleTexture = frameTexture('breakout_paddle' as any);
      if (paddleTexture) {
        const paddle = new Sprite(paddleTexture);
        paddle.anchor.set(0.5, 1);
        paddle.width = 50;
        paddle.height = 26;
        const center = breakoutPaddleCenter(player.rect);
        paddle.x = center.x;
        paddle.y = center.y;
        this.breakoutPaddleViews.set(player, paddle);
        this.actorLayer.addChild(paddle);
      }
`, file);
    source = replaceOnce(source, `        this.addBattleBreakoutBall(spawn);
      }
      if (suppressRuntimePlayer) continue;
`, `        this.addBattleBreakoutBall(spawn);
      }
      if (suppressRuntimePlayer && spawn.actorName === 'BreakoutPlayer' && this.players.length > 0) {
        // breakout-ball-per-row: FUN_7ff72bb72ae0 0x7ff72bb7333f -> FUN_7ff72bb78650 (last spawned player, +0x420 += 1).
        const owner = this.players[this.players.length - 1];
        this.addBreakoutBallForRow(spawn, owner);
        this.breakoutBallCounts.set(owner, (this.breakoutBallCounts.get(owner) ?? 0) + 1);
      }
      if (suppressRuntimePlayer) continue;
`, file);
    source = replaceOnce(source, '  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {\n', `  /** breakout-ball-per-row: the row's ball at row + (0, -120), bound to its owner's callback. */
  private addBreakoutBallForRow(spawn: ActorSpawnDef, owner: Player): void {
    const ball = new BreakoutBall(spawn.x, spawn.y + BREAKOUT_BALL_SPAWN_OFFSET_Y, owner);
    this.breakoutBalls.push(ball);
    this.actorLayer.addChild(ball.view);
  }

  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {
`, file);
    // breakout-loss-and-fail: owner count -1 per lost ball, out at 0; everyone out and no key yet -> restart.
    source = replaceOnce(source, `    if (owner && ownerIndex >= 0) {
      this.breakoutLostPlayers.add(owner);
      // Stage post-update FUN_7ff72bb7bbe0 later consumes the native bit, but
      // its generic clear/fail result producer has additional gates and stays
      // deliberately unmodeled here.
    }
`, `    if (owner && ownerIndex >= 0 && !this.cleared) {
      // breakout-loss-and-fail: FUN_7ff72bb69440 cmd 3: +0x420 -= 1; at 0 flag 0x10 (out). The cat lives on.
      const ballsLeft = (this.breakoutBallCounts.get(owner) ?? 1) - 1;
      this.breakoutBallCounts.set(owner, ballsLeft);
      if (ballsLeft <= 0) this.breakoutLostPlayers.add(owner);
    }
`, file);
    source = replaceOnce(source, '    this.collideBreakoutBalls();\n', `    this.collideBreakoutBalls();
    if (this.breakoutEveryoneOut()) {
      this.restartBreakoutStage();
      return;
    }
`, file);
    source = replaceOnce(source, '  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {\n', `  /** breakout-loss-and-fail: FUN_7ff72bb7bbe0 while scene flag 0x40 (key appeared) is clear: every student cat out. */
  private breakoutEveryoneOut(): boolean {
    if (this.breakoutBallCounts.size === 0 || this.breakoutKeyAppeared || this.cleared) return false;
    const students = this.players.filter((player) => !player.parkHelper);
    return students.length > 0 && students.every((player) => this.breakoutLostPlayers.has(player));
  }

  /** breakout-loss-and-fail: the stage restarts (scene flag 2); Desk teacher cats are put back at their spawns. */
  private restartBreakoutStage(): void {
    const helpers = this.players
      .map((player, index) => ({ player, slot: this.playerInputSlots[index] ?? index, spawn: this.playerSpawns[index] }))
      .filter(({ player }) => player.parkHelper);
    this.resetStage();
    for (const { player, slot, spawn } of helpers) {
      const at = spawn ?? this.playerSpawn;
      player.reset(at.x, at.y);
      this.players.push(player);
      this.playerSpawns.push({ x: at.x, y: at.y });
      this.playerInputSlots.push(slot);
      this.actorLayer.addChild(player.view);
    }
    this.emitStats();
  }

  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {
`, file);
    // breakout-key-hidden-until-clear: an ordinary Key, hidden until no MC_BR1..BR5 is left; its appearance = flag 0x40.
    source = replaceOnce(source, '  private breakoutLostPlayers = new Set<Player>();\n', `  private breakoutLostPlayers = new Set<Player>();
  /** breakout-key-hidden-until-clear: BreakoutKeys still hidden, and scene flag 0x40 (a key appeared). */
  private breakoutHiddenKeys: Key[] = [];
  private breakoutKeyAppeared = false;
`, file);
    source = replaceOnce(source, '    this.breakoutLostPlayers.clear();\n', `    this.breakoutLostPlayers.clear();
    this.breakoutHiddenKeys = [];
    this.breakoutKeyAppeared = false;
`, file);
    source = replaceOnce(source, `    BreakoutKey: (spawn) => {
      const breakoutKey = new BreakoutKey(spawn);
      this.breakoutKeys.push(breakoutKey);
      this.actorLayer.addChild(breakoutKey.view);
    },
`, `    BreakoutKey: (spawn) => {
      // breakout-key-hidden-until-clear: FUN_7ff72bb64f20(0x558, 1) + FUN_7ff72bb65240(this, 0): a hidden ordinary Key.
      const key = new Key(spawn);
      key.active = false;
      key.view.visible = false;
      this.keys.push(key);
      this.breakoutHiddenKeys.push(key);
      this.actorLayer.addChild(key.view);
    },
`, file);
    source = replaceOnce(source, '    this.collideBreakoutBalls();\n', `    this.collideBreakoutBalls();
    this.revealBreakoutKeysWhenBricksGone();
`, file);
    source = replaceOnce(source, '  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {\n', `  /** breakout-key-hidden-until-clear: Key PRE FUN_7ff72bb65430 state 0 polls FUN_7ff72bc30790 (any chip 30..34 left). */
  private revealBreakoutKeysWhenBricksGone(): void {
    if (this.breakoutHiddenKeys.length === 0 || !this.tileMap) return;
    const bricks = new Set(['MC_BR1', 'MC_BR2', 'MC_BR3', 'MC_BR4', 'MC_BR5']);
    const { width, height } = this.tileMap.map;
    for (let tileY = 0; tileY < height; tileY += 1) {
      for (let tileX = 0; tileX < width; tileX += 1) {
        if (bricks.has(this.tileMap.chipAt(tileX, tileY))) return;
      }
    }
    for (const key of this.breakoutHiddenKeys) key.activate();
    this.breakoutHiddenKeys = [];
    this.breakoutKeyAppeared = true;
    this.refreshKeyGoalViews();
  }

  private addBattleBreakoutBall(spawn: ActorSpawnDef): void {
`, file);
    // breakout-syncarea-inert: FUN_7ff72bb778c0 is online-only; offline it has no body and no clear rule.
    source = replaceOnce(source, `    BreakoutSyncArea: (spawn) => {
      const breakoutSyncArea = breakoutSyncAreaFromSpawn(spawn);
      this.breakoutSyncAreas.push(breakoutSyncArea);
      this.addActorView(spawn, breakoutSyncArea.view);
    },
`, `    BreakoutSyncArea: () => {
      // breakout-syncarea-inert: online sync only (FUN_7ff72bae82a0); nothing offline.
    },
`, file);
    // stage-map-private-copy: play on a private copy of the chip table, never the shared stage data.
    source = replaceOnce(source, `    const resolvedStage = paintActiveMapRects(mapVariantStage, activePartyCount);
    this.stage = resolvedStage;
    this.tileMap = new TileMap(resolvedStage.map);`, `    const paintedStage = paintActiveMapRects(mapVariantStage, activePartyCount);
    const resolvedStage = { ...paintedStage, map: { ...paintedStage.map, table: [...paintedStage.map.table] } };
    this.stage = resolvedStage;
    this.tileMap = new TileMap(resolvedStage.map);`, file);
    // ---- Batch 12 (decoded specs b12/spec-9-1, spec-9-2, spec-9-4): Ball Park (9-1, 9-2, 9-4). ----
    // bound-ball-pitcher / laser-ball-pitcher / seesaw-and-balance: rowParams reads ValueAtom params.
    source = replaceOnce(source, `import type { ActorSpawnDef, InputState, MapDef, Rect, RuntimeStats, StageDef } from './types';`, `import type { ActorSpawnDef, InputState, MapDef, Rect, RuntimeStats, StageDef, ValueAtom } from './types';`, file);
    // Ball Park actor state (cannons, key boxes, planks, pans, physics balls, ray switches).
    source = replaceOnce(source, `  private physicsSwitches: PhysicsSwitch[] = [];
`, `  private physicsSwitches: PhysicsSwitch[] = [];
  /** bound-ball-pitcher / laser-ball-pitcher: FUN_7ff72bb37d70 cannons (mode 0 BoundBall, mode 1 laser ball). */
  private nativeCannons: NativeCannon[] = [];
  /** ball-box / laser-key-box: the boxes holding the stage Key (BallBox FUN_7ff72bb53e10, LaserKeyBox FUN_7ff72bb544e0). */
  private nativeKeyBoxes: NativeKeyBox[] = [];
  /** seesaw-and-balance: rotating planks (no engine body), Balance pans (lifts), Box2D balls and the ray switch. */
  private seesawPlanks: SeesawPlank[] = [];
  private nativeBalances: NativeBalance[] = [];
  private physicsPitchers: PhysicsPitcher[] = [];
  private nativePhysicsSwitches: Array<{ physicsSwitch: PhysicsSwitch; latched: boolean }> = [];
  /** seesaw-box2d: the stage's Box2D world (planck), built on the first ball-park tick. */
  private ballParkWorld: planck.World | undefined;
`, file);
    // Ball Park actor state is rebuilt on every load / restart.
    source = replaceOnce(source, `    this.physicsAreas = [];
`, `    this.physicsAreas = [];
    this.nativeCannons = [];
    this.nativeKeyBoxes = [];
    this.seesawPlanks = [];
    this.nativeBalances = [];
    this.physicsPitchers = [];
    this.nativePhysicsSwitches = [];
    this.ballParkWorld = undefined;
`, file);
    // ball-box / laser-key-box: native boxes, not centred 48 x 48 NormalBoxes.
    source = replaceOnce(source, `    BallBox: (spawn) => {
      const normalBox = new NormalBox(spawn);
      this.normalBoxes.push(normalBox);
      this.addActorView(spawn, normalBox.view);
    },
    LaserKeyBox: (spawn) => {
      const normalBox = new NormalBox(spawn);
      this.normalBoxes.push(normalBox);
      this.addActorView(spawn, normalBox.view);
    },
`, `    BallBox: (spawn) => {
      // ball-box: FUN_7ff72bb53e10, body {-22, -62, 44, 60} (DAT_7ff72bcb64f0), top sensor {-4, -66, 8, 10}.
      this.addNativeKeyBox(spawn, 'ball');
    },
    LaserKeyBox: (spawn) => {
      // laser-key-box: FUN_7ff72bb544e0, the same body; three hit frames (DAT_7ff72bcbaf10).
      this.addNativeKeyBox(spawn, 'laser');
    },
`, file);
    // seesaw-and-balance: PhysicsSwitch is latched and pressed only by a ball on its ray.
    source = replaceOnce(source, `    PhysicsSwitch: (spawn) => {
      const physicsSwitch = new PhysicsSwitch(spawn);
      this.physicsSwitches.push(physicsSwitch);
      this.addActorView(spawn, physicsSwitch.view);
    },
`, `    PhysicsSwitch: (spawn) => {
      // seesaw-and-balance: switch type 2, no fixture, latched; only a Box2D ray (balls) presses it.
      const physicsSwitch = new PhysicsSwitch(spawn);
      this.nativePhysicsSwitches.push({ physicsSwitch, latched: false });
      this.addActorView(spawn, physicsSwitch.view);
    },
`, file);
    // bound-ball-pitcher / laser-ball-pitcher / seesaw-and-balance: native pitchers, not the generic DeadBallPitcher.
    source = replaceOnce(source, `    LaserBallPitcher: (spawn) => {
      const laserBallPitcher = new DeadBallPitcher(spawn);
      this.deadBallPitchers.push(laserBallPitcher);
      this.addActorView(spawn, laserBallPitcher.view);
    },
    PhysicsBallPitcher: (spawn) => {
      const physicsBallPitcher = new DeadBallPitcher(spawn, this.activePlayerCount);
      this.deadBallPitchers.push(physicsBallPitcher);
      this.addActorView(spawn, physicsBallPitcher.view);
    },
    BoundBallPitcher: (spawn) => {
      const boundBallPitcher = new DeadBallPitcher(spawn);
      this.deadBallPitchers.push(boundBallPitcher);
      this.addActorView(spawn, boundBallPitcher.view);
    },
`, `    LaserBallPitcher: (spawn) => {
      // laser-ball-pitcher: factory 0x7ff72bb74b72 -> FUN_7ff72bb37d70 mode 1.
      this.addNativeCannon(spawn, 'laser');
    },
    PhysicsBallPitcher: (spawn) => {
      // seesaw-and-balance: the pitcher fires one PhysicsBall (FUN_7ff72bb55c30) at a time.
      this.addPhysicsPitcher(spawn);
    },
    BoundBallPitcher: (spawn) => {
      // bound-ball-pitcher: factory 0x7ff72bb74b10 -> FUN_7ff72bb37d70 mode 0.
      this.addNativeCannon(spawn, 'bound');
    },
`, file);
    // seesaw-and-balance: Balance = two moving pans.
    source = replaceOnce(source, `    Balance: (spawn) => {
      const balance = balanceFromSpawn(spawn);
      this.balances.push(balance);
      this.addActorView(spawn, balance.view);
    },
`, `    Balance: (spawn) => {
      // seesaw-and-balance: FUN_7ff72bb313f0(obj, p0): two moving pans at x -/+ p0 * 0.5.
      this.addNativeBalance(spawn);
    },
`, file);
    // seesaw-and-balance: PhysicsArea is only the Box2D boundary; planks rotate about their pivot.
    source = replaceOnce(source, `    PhysicsArea: (spawn) => {
      const physicsArea = physicsAreaFromSpawn(spawn);
      this.physicsAreas.push(physicsArea);
      this.actorLayer.addChild(physicsArea.view);
    },
    Seesaw: (spawn) => {
      const seesaw = seesawFromSpawn(spawn);
      this.seesaws.push(seesaw);
      this.addActorView(spawn, seesaw.view);
    },
    SeesawParent: (spawn) => {
      const seesaw = seesawFromSpawn(spawn);
      this.seesaws.push(seesaw);
      this.addActorView(spawn, seesaw.view);
    },
`, `    PhysicsArea: (spawn) => {
      // seesaw-and-balance / seesaw-box2d: only the Box2D boundary edges (no slow-fall, no fill).
      this.physicsAreas.push(physicsAreaFromSpawn(spawn));
    },
    Seesaw: (spawn) => {
      this.addSeesawPlank(spawn);
    },
    SeesawParent: (spawn) => {
      // seesaw-and-balance: FUN_7ff72bb77b30 wraps FUN_7ff72bb5d420(obj, p0) and ignores p1 / p2.
      this.addSeesawPlank(spawn);
    },
`, file);
    // Ball Park: one tick of every ball-park actor (replaces the BoundBall input control and the straight-line PhysicsBall).
    source = replaceOnce(source, `    this.updateBoundBallPitchers(clampedDt, input, playerInputs);
    this.updateDeadBallPitcherViews();
    this.updatePhysicsBallLifecycles();
`, `    this.updateNativeBallPark(clampedDt);
    this.updateDeadBallPitcherViews();
`, file);
    // seesaw-and-balance: no invented PhysicsArea slow-fall for cats.
    source = replaceOnce(source, `      if (this.applyPhysicsAreas()) {
        continue;
      }
`, ``, file);
    // seesaw-and-balance: no cat-driven plank tilt / rider snapping (updateSeesawTilts deleted).
    source = replaceOnce(source, `    this.updateSeesawTilts();
`, ``, file);
    // seesaw-and-balance: updateSeesawTilts deleted.
    source = replaceOnce(source, `  private updateSeesawTilts(): void {
    for (const seesaw of this.seesaws) {
      const targetBalance = this.balances.find((balance) => (
        balance.targetLabel !== ''
        && (balance.targetLabel === seesaw.spawn.label || balance.targetLabel === seesaw.spawn.actorName)
      ));
      const pivotX = targetBalance?.spawn.x ?? seesaw.spawn.x;
      const standingPlayers = this.players.filter((player) => (
        !this.collisionChangePlayersCollisionOff.has(player)
        && !this.activelyGuardingPlayers.has(player)
        && rectsOverlap(
          {
            x: player.rect.x,
            y: player.rect.y + player.rect.height,
            width: player.rect.width,
            height: 2,
          },
          seesaw.rect,
        )
      ));
      if (standingPlayers.length === 0) {
        seesaw.view.rotation = 0;
        continue;
      }

      const sideWeight = standingPlayers.reduce((sum, player) => (
        sum + rectCenter(player.rect).x - pivotX
      ), 0);
      const rotation = clamp(sideWeight / seesaw.rect.width, -0.16, 0.16);
      seesaw.view.rotation = rotation;
      const surfaceCenterY = seesaw.rect.y + seesaw.rect.height / 2;
      for (const player of standingPlayers) {
        const surfaceY = surfaceCenterY + Math.sin(rotation) * (rectCenter(player.rect).x - pivotX);
        const nextY = surfaceY - player.rect.height;
        player.applyResolvedCollision(
          { ...player.rect, y: nextY },
          { ...player.velocity, y: 0 },
          true,
        );
      }
      for (const pushBox of this.pushBoxes) {
        const standingOnSeesaw = rectsOverlap(
          {
            x: pushBox.rect.x,
            y: pushBox.rect.y + pushBox.rect.height,
            width: pushBox.rect.width,
            height: 2,
          },
          seesaw.rect,
        );
        if (!standingOnSeesaw) continue;

        const surfaceY = surfaceCenterY + Math.sin(rotation) * (rectCenter(pushBox.rect).x - pivotX);
        pushBox.applyRect({ ...pushBox.rect, y: surfaceY - pushBox.rect.height });
      }
      for (const normalBox of this.normalBoxes) {
        const boxRect = normalBoxRect(normalBox);
        const standingOnSeesaw = rectsOverlap(
          {
            x: boxRect.x,
            y: boxRect.y + boxRect.height,
            width: boxRect.width,
            height: 2,
          },
          seesaw.rect,
        );
        if (!standingOnSeesaw) continue;

        const surfaceY = surfaceCenterY + Math.sin(rotation) * (rectCenter(boxRect).x - pivotX);
        normalBox.spawn.y = surfaceY - boxRect.height / 2;
        normalBox.view.y = normalBox.spawn.y;
      }
      for (const smallBox of this.smallBoxes) {
        const boxRect = smallBoxRect(smallBox);
        const standingOnSeesaw = rectsOverlap(
          {
            x: boxRect.x,
            y: boxRect.y + boxRect.height,
            width: boxRect.width,
            height: 2,
          },
          seesaw.rect,
        );
        if (!standingOnSeesaw) continue;

        const surfaceY = surfaceCenterY + Math.sin(rotation) * (rectCenter(boxRect).x - pivotX);
        smallBox.spawn.y = surfaceY - boxRect.height / 2;
        smallBox.view.y = smallBox.spawn.y;
      }
      for (const colorBox of this.colorBoxes) {
        const boxRect = colorBoxRect(colorBox);
        const standingOnSeesaw = rectsOverlap(
          {
            x: boxRect.x,
            y: boxRect.y + boxRect.height,
            width: boxRect.width,
            height: 2,
          },
          seesaw.rect,
        );
        if (!standingOnSeesaw) continue;

        const surfaceY = surfaceCenterY + Math.sin(rotation) * (rectCenter(boxRect).x - pivotX);
        colorBox.spawn.y = surfaceY - boxRect.height / 2;
        colorBox.view.y = colorBox.spawn.y;
      }
    }
  }

`, ``, file);
    // seesaw-and-balance: the pans carry stacked riders like the other lift slabs (FUN_7ff72bc17330, recursive).
    source = replaceOnce(source, `if (!['WeightedLift', 'WeightedLiftEx', 'WeightedLiftEx2', 'DarknessWeightedLift'].includes(lift.spawn.actorName) || !previousLiftRect) return supportedPlayers;`, `if (!['WeightedLift', 'WeightedLiftEx', 'WeightedLiftEx2', 'DarknessWeightedLift', 'BalancePan'].includes(lift.spawn.actorName) || !previousLiftRect) return supportedPlayers;`, file);
    // seesaw-and-balance: planks have no engine body (no FUN_7ff72bc16bf0): out of every cat / box collision list.
    {
      const spread = /^[ \t]*\.\.\.this\.seesaws\.map\(\(seesaw\) => seesaw\.rect\),\n/gm;
      assert.equal((source.match(spread) ?? []).length, 13, `Patch anchor changed: ${file}: seesaw collision lists`);
      source = source.replace(spread, '');
      const seesawRects = '    const seesawRects = this.seesaws.map((seesaw) => seesaw.rect);\n';
      assert.equal(source.split(seesawRects).length - 1, 2, `Patch anchor changed: ${file}: ${seesawRects}`);
      source = source.replaceAll(seesawRects, '    const seesawRects: Rect[] = [];   // seesaw-and-balance: planks are not solid\n');
      source = replaceOnce(source, '    const seesawBlockerRects = this.seesaws.map((seesaw) => seesaw.rect);\n',
        '    const seesawBlockerRects: Rect[] = [];   // seesaw-and-balance: planks are not solid\n', file);
    }
    // bound-ball-pitcher / laser-ball-pitcher / seesaw-and-balance: these pitchers are no longer DeadBallPitchers.
    source = replaceOnce(source, `      const phasesThroughCollisionOff = pitcher.spawn.actorName === 'DeadBallPitcher'
        || pitcher.spawn.actorName === 'PhysicsBallPitcher'
        || pitcher.spawn.actorName === 'BoundBallPitcher';
`, `      const phasesThroughCollisionOff = pitcher.spawn.actorName === 'DeadBallPitcher';
`, file);
    // laser-ball-pitcher: the laser ball handles its own cat contact (stepLaserBall).
    source = replaceOnce(source, `      if (hitPitcher.spawn.actorName === 'LaserBallPitcher') {
        // Recovered-data: projectile mode 0 broadcasts command 0x25 to the
        // named target, but LaserKeyBox/BallReceiver named receivers are no-ops.
        return;
      }
`, ``, file);
    // bound-ball-pitcher / seesaw-and-balance: their balls handle their own contacts.
    source = replaceOnce(source, `      if (hitPitcher.spawn.actorName === 'BoundBallPitcher') {
        // Recovered-data: BoundBall is owner-input controlled ball hardware
        // (FUN_7ff72bb3b5e0), not DeadBall's avatar cmd-4 reset branch.
        return;
      }
      if (hitPitcher.spawn.actorName === 'PhysicsBallPitcher') {
        // Recovered-data: PhysicsBall player contact is nonfatal. Only a
        // vertical-normal PhysicsArea contact starts FUN_7ff72bb55e40's own
        // 30-frame child-removal countdown; DeadBall's avatar cmd 4 is absent.
        return;
      }
`, ``, file);
    // bound-ball-pitcher: delete the player-jump ball control, invented side push / support and missing-box timer.
    source = replaceOnce(source, `  private updateBoundBallPitchers(
    dt: number,
    input: InputState,
    playerInputs: readonly InputState[] | undefined,
  ): void {
    if (this.deadBallPitchers.length === 0) return;

    for (const pitcher of [...this.deadBallPitchers]) {
      if (pitcher.spawn.actorName !== 'BoundBallPitcher') continue;
      const state = this.boundBallPitcherState(pitcher);
      const ownerIndex = 0;
      const ownerInputSlot = this.playerInputSlots[ownerIndex] ?? ownerIndex;
      const ownerInput = this.resolvePlayerInput(input, playerInputs, this.players.length, ownerIndex, ownerInputSlot);

      state.velocityX = this.boundBallPitcherSideContactVelocity(centeredRect(state.x, state.y, BOUND_BALL_SIZE, BOUND_BALL_SIZE));
      if (state.velocityY >= 0) state.holdPhase = 0;
      const canBoost = this.boundBallPitcherHasSupport(state)
        || (state.holdPhase >= 1 && state.holdPhase <= BOUND_BALL_HOLD_FRAMES);

      if (canBoost) {
        if (ownerInput.jumpPressed) {
          state.velocityY = BOUND_BALL_DEFAULT_JUMP_SPEED;
          state.holdPhase = 1;
          this.onEvent?.({ type: 'jump', playerIndex: this.eventInputSlotForPlayer(this.players[ownerIndex], ownerInputSlot) });
        } else if (ownerInput.jump && state.holdPhase >= 1 && state.holdPhase <= BOUND_BALL_HOLD_FRAMES) {
          const boost = BOUND_BALL_DEFAULT_JUMP_SPEED
            * (1 - state.holdPhase / BOUND_BALL_HOLD_DECAY_DEN)
            * BOUND_BALL_HOLD_GAIN;
          state.velocityY += boost;
          state.holdPhase += 1;
        } else {
          state.holdPhase = 0;
        }
      }

      state.velocityY += BOUND_BALL_GRAVITY * dt;
      const rect = centeredRect(state.x, state.y, BOUND_BALL_SIZE, BOUND_BALL_SIZE);
      if (this.tileMap) {
        const result = moveRectWithTileCollisions(
          this.tileMap,
          rect,
          { x: state.velocityX * dt, y: state.velocityY * dt },
          state.grounded,
        );
        state.x = result.rect.x + result.rect.width / 2;
        state.y = result.rect.y + result.rect.height / 2;
        if (result.velocity.y === 0) state.velocityY = 0;
        state.grounded = result.grounded;
      } else {
        state.x += state.velocityX * dt;
        state.y += state.velocityY * dt;
        state.grounded = false;
      }

      if (this.updateBoundBallMissingBallBoxLifetime(pitcher, state, dt)) continue;
    }
  }

  private boundBallPitcherState(pitcher: DeadBallPitcher): BoundBallPitcherState {
    let state = this.boundBallPitcherStates.get(pitcher);
    if (!state) {
      state = {
        x: pitcher.spawn.x,
        y: pitcher.spawn.y,
        velocityX: 0,
        velocityY: 0,
        holdPhase: 0,
        grounded: false,
        ballBoxSeen: false,
        missingBallBoxFadeSeconds: undefined,
      };
      this.boundBallPitcherStates.set(pitcher, state);
    }
    return state;
  }

  private updateBoundBallMissingBallBoxLifetime(
    pitcher: DeadBallPitcher,
    state: BoundBallPitcherState,
    dt: number,
  ): boolean {
    const hasBallBox = this.normalBoxes.some((box) => box.spawn.actorName === 'BallBox');
    if (hasBallBox) {
      state.ballBoxSeen = true;
      state.missingBallBoxFadeSeconds = undefined;
      pitcher.view.alpha = 1;
      return false;
    }
    if (!state.ballBoxSeen) return false;

    const previousRemaining = state.missingBallBoxFadeSeconds ?? BOUND_BALL_MISSING_BALL_BOX_FADE_SECONDS;
    const remaining = Math.max(0, previousRemaining - dt);
    state.missingBallBoxFadeSeconds = remaining;
    pitcher.view.alpha = remaining / BOUND_BALL_MISSING_BALL_BOX_FADE_SECONDS;

    if (remaining > 0) return false;
    this.removeBoundBallPitcher(pitcher);
    return true;
  }

  private removeBoundBallPitcher(pitcher: DeadBallPitcher): void {
    const index = this.deadBallPitchers.indexOf(pitcher);
    if (index >= 0) this.deadBallPitchers.splice(index, 1);
    this.boundBallPitcherStates.delete(pitcher);
    pitcher.view.visible = false;
    const parent = pitcher.view.parent as unknown as {
      removeChild?: (child: Container) => void;
      children?: Container[];
    } | null;
    if (typeof parent?.removeChild === 'function') {
      parent.removeChild(pitcher.view);
      return;
    }
    if (parent && Array.isArray(parent.children)) {
      parent.children = parent.children.filter((child) => child !== pitcher.view);
      (pitcher.view as unknown as { parent: unknown }).parent = null;
    }
  }

  private boundBallPitcherHasSupport(state: BoundBallPitcherState): boolean {
    const rect = centeredRect(state.x, state.y, BOUND_BALL_SIZE, BOUND_BALL_SIZE);
    if (this.boundBallPitcherHitsVerticalContact(rect, -1)) return false;
    if (this.boundBallPitcherHitsVerticalContact(rect, 1)) return true;
    return state.grounded;
  }

  private boundBallPitcherSideContactVelocity(rect: Rect): number {
    const rectRight = rect.x + rect.width;
    const centerX = rect.x + rect.width / 2;
    for (const box of this.normalBoxes) {
      if (box.spawn.actorName !== 'BallBox') continue;
      const boxRect = normalBoxRect(box);
      if (rect.y >= boxRect.y + boxRect.height || rect.y + rect.height <= boxRect.y) continue;

      const boxRight = boxRect.x + boxRect.width;
      if (boxRight <= centerX && Math.abs(boxRight - rect.x) <= 1) return BOUND_BALL_SIDE_CONTACT_SPEED;
      if (boxRect.x >= centerX && Math.abs(boxRect.x - rectRight) <= 1) return -BOUND_BALL_SIDE_CONTACT_SPEED;
    }
    return 0;
  }

  private boundBallPitcherHitsVerticalContact(rect: Rect, sign: -1 | 1): boolean {
    const centerY = rect.y + rect.height / 2;
    const touchesBallBox = this.normalBoxes.some((box) => {
      if (box.spawn.actorName !== 'BallBox') return false;
      const boxRect = normalBoxRect(box);
      if (rect.x >= boxRect.x + boxRect.width || rect.x + rect.width <= boxRect.x) return false;
      if (sign < 0) return boxRect.y + boxRect.height <= centerY && boxRect.y + boxRect.height >= rect.y - 1;
      return boxRect.y >= centerY && boxRect.y <= rect.y + rect.height + 1;
    });
    if (touchesBallBox) return true;
    if (!this.tileMap) return false;

    const probe = { ...rect, y: rect.y + sign };
    return this.tileMap.rectHitsSolid(probe, { axis: 'y', sign, previousRect: rect });
  }

`, ``, file);
    // seesaw-and-balance: the straight-line PhysicsBall lifecycle is replaced by the circle solver.
    source = replaceOnce(source, `  private updatePhysicsBallLifecycles(): void {
    for (const pitcher of [...this.deadBallPitchers]) {
      if (pitcher.spawn.actorName !== 'PhysicsBallPitcher') continue;

      if (this.physicsBallRearmPending.delete(pitcher)) {
        // Recovered-data: FUN_7ff72bb38130 retains the one-child owner, clears
        // its removed child slot, and creates the replacement on a later update.
        this.physicsBallFrozenOffsets.delete(pitcher);
        this.physicsBallMotionStartElapsed.set(pitcher, this.deadBallPitcherElapsed);
        pitcher.restoreProjectile();
        continue;
      }

      const countdown = this.physicsBallCountdowns.get(pitcher) ?? 0;
      if (countdown > 0) {
        if (countdown >= 20) {
          const scale = Math.pow(1.0499999523162842, 31 - countdown);
          pitcher.setProjectileAppearance(scale, (countdown - 20) / 10);
        }

        const nextCountdown = countdown - 1;
        if (nextCountdown === 0) {
          this.physicsBallCountdowns.delete(pitcher);
          pitcher.removeProjectile();
          this.physicsBallRearmPending.add(pitcher);
        } else {
          this.physicsBallCountdowns.set(pitcher, nextCountdown);
          if (nextCountdown < 15 && !this.physicsBallFrozenOffsets.has(pitcher)) {
            const rect = this.deadBallProjectileRect(pitcher);
            this.physicsBallFrozenOffsets.set(pitcher, {
              x: rect.x + rect.width / 2 - pitcher.spawn.x,
              y: rect.y + rect.height / 2 - pitcher.spawn.y,
            });
          }
        }
        continue;
      }

      const projectileRect = this.deadBallProjectileRect(pitcher);
      const hasHorizontalFaceContact = this.physicsAreas.some((area) => {
        const horizontalOverlap = projectileRect.x < area.rect.x + area.rect.width
          && projectileRect.x + projectileRect.width > area.rect.x;
        if (!horizontalOverlap) return false;
        const ballBottom = projectileRect.y + projectileRect.height;
        const areaBottom = area.rect.y + area.rect.height;
        return Math.abs(ballBottom - area.rect.y) <= 1.1920929e-7
          || Math.abs(projectileRect.y - areaBottom) <= 1.1920929e-7;
      });
      if (hasHorizontalFaceContact) {
        // Recovered-data: PhysicsBall PRE FUN_7ff72bb55e40 starts an integer
        // 30-frame countdown on vertical-normal PhysicsArea contact. Detection
        // does not consume the first count.
        this.physicsBallCountdowns.set(pitcher, 30);
      }
    }
  }

`, ``, file);
    // bound-ball-pitcher / seesaw-and-balance: no projectile rects for the removed paths.
    source = replaceOnce(source, `    if (pitcher.spawn.actorName === 'BoundBallPitcher') {
      const state = this.boundBallPitcherState(pitcher);
      return centeredRect(state.x, state.y, BOUND_BALL_SIZE, BOUND_BALL_SIZE);
    }
    if (pitcher.spawn.actorName === 'PhysicsBallPitcher') {
      const frozenOffset = this.physicsBallFrozenOffsets.get(pitcher);
      if (frozenOffset) {
        return centeredRect(
          pitcher.spawn.x + frozenOffset.x,
          pitcher.spawn.y + frozenOffset.y,
          PHYSICS_BALL_DIAMETER,
          PHYSICS_BALL_DIAMETER,
        );
      }
      // Recovered-data: FUN_7ff72bb37f30 selects 0.1 * param[playerCount-1]
      // (or the solo ctor default 5.0). FUN_7ff72bb383e0 launches the child
      // 20px along the quantized rotated-up direction, and FUN_7ff72bc16120
      // applies the same vector once per native 1/60 Stage tick.
      const motionElapsed = this.deadBallPitcherElapsed
        - (this.physicsBallMotionStartElapsed.get(pitcher) ?? 0);
      const distance = motionElapsed * 60 * pitcher.physicsBallMotionMagnitude;
      const direction = physicsBallDirectionFromAngle(pitcher.angleDegrees);
      const launchDistance = Math.fround(PHYSICS_BALL_SPAWN_OFFSET + distance);
      const centerX = Math.fround(
        Math.fround(pitcher.spawn.x) + Math.fround(direction.x * launchDistance),
      );
      const centerY = Math.fround(
        Math.fround(pitcher.spawn.y) + Math.fround(direction.y * launchDistance),
      );
      return centeredRect(
        centerX,
        centerY,
        PHYSICS_BALL_DIAMETER,
        PHYSICS_BALL_DIAMETER,
      );
    }
`, ``, file);
    // laser-key-box: a carried Key never hides a LaserKeyBox (not native).
    source = replaceOnce(source, `    for (const box of this.normalBoxes) {
      if (box.spawn.actorName === 'LaserKeyBox' && laserKeyBoxMatchesKey(key.spawn, box.spawn)) {
        box.view.visible = false;
      }
    }
`, ``, file);
    // laser-key-box: LaserKeyBox / BallBox are no longer NormalBoxes; drop the isLaserKeyBoxUnlocked filters.
    {
      const patterns = [
        [/\n[ \t]*\.filter\(\((\w+)\) => !this\.isLaserKeyBoxUnlocked\(\1\)\)(?=\n)/g, 9],
        [/\.filter\(\((\w+)\) => !this\.isLaserKeyBoxUnlocked\(\1\)\)/g, 8],
        [/!this\.isLaserKeyBoxUnlocked\((\w+)\) && /g, 3],
        [/!this\.isLaserKeyBoxUnlocked\((\w+)\)\n[ \t]*&& /g, 2],
      ];
      for (const [pattern, count] of patterns) {
        assert.equal((source.match(pattern) ?? []).length, count, `Patch anchor changed: ${file}: ${pattern}`);
        source = source.replace(pattern, '');
      }
    }
    // laser-key-box: isLaserKeyBoxUnlocked deleted.
    source = replaceOnce(source, `  private isLaserKeyBoxUnlocked(box: NormalBox): boolean {
    return box.spawn.actorName === 'LaserKeyBox' && box.view.visible === false;
  }

`, ``, file);
    assert.ok(!source.includes('isLaserKeyBoxUnlocked'), `Patch anchor changed: ${file}: isLaserKeyBoxUnlocked`);
    // seesaw-box2d: the 9-2 world is real Box2D 2.3 (planck, bundled from the repo's node_modules).
    source = "import * as planck from 'planck';\n" + source;
    // Ball Park methods.
    source = replaceOnce(source, `  private applyDeadBallPitchers(): void {
`, `  // ---- Ball Park (9-1 / 9-2 / 9-4): bound-ball-pitcher, ball-box, laser-ball-pitcher, laser-key-box, seesaw-and-balance ----

  /** One native tick of every ball-park actor, before the cats move. */
  private updateNativeBallPark(dt: number): void {
    this.ensureBallParkWorld();
    this.updateNativeBalances();
    this.updateSeesawPlanks();
    this.updatePhysicsPitchers();
    this.updateNativePhysicsSwitches();
    // Boxes first: a box broken this tick starts its 40-frame countdown on the next one.
    this.updateNativeKeyBoxes();
    this.updateNativeCannons(dt);
    this.stepBallParkWorld();
  }

  /** FUN_7ff72bb37d70: a cannon with a solid body {-40, -18, 54, 40} (category 4) and the barrel / base art. */
  private addNativeCannon(spawn: ActorSpawnDef, kind: 'bound' | 'laser'): void {
    const cannon = nativeCannonFromSpawn(spawn, kind, this.nativePartyCount());
    this.staticRects.push(cannon.body);
    this.nativeCannons.push(cannon);
    this.addActorView(spawn, cannon.view);
  }

  /** FUN_7ff72bb38130: first update skipped; one child at a time; a gone child is cleared, the next update refires. */
  private updateNativeCannons(dt: number): void {
    for (const cannon of this.nativeCannons) {
      if (!cannon.firstTickSkipped) {
        cannon.firstTickSkipped = true;
        continue;
      }
      if (cannon.ball?.gone) {
        cannon.ball = undefined;
        continue;
      }
      if (!cannon.ball) {
        cannon.ball = spawnNativeBall(cannon);
        this.actorLayer.addChild(cannon.ball.view);
        continue;
      }
      if (cannon.kind === 'bound') this.stepBoundBall(cannon, cannon.ball, dt);
      else this.stepLaserBall(cannon, cannon.ball, dt);
    }
  }

  /** The 30-frame fade (+0x3f8 = 0x1e) after a ball stops; at 0 the child is removed. True while fading. */
  private advanceNativeBallFade(ball: NativeBall): boolean {
    if (ball.fadeFrames <= 0) return false;
    ball.fadeFrames -= 1;
    ball.y += ball.dropVy;
    ball.view.x = ball.x;
    ball.view.y = ball.y;
    if (ball.fadeFrames <= 10) ball.view.alpha = ball.fadeFrames / 10;
    if (ball.fadeFrames > 0) return true;
    ball.gone = true;
    this.actorLayer.removeChild(ball.view);
    return true;
  }

  /** The 0.5 s spawn delay (DAT_7ff72bcff4fc): the launch velocity is parked, then restored. True while waiting. */
  private advanceNativeBallDelay(ball: NativeBall, dt: number): boolean {
    if (ball.delaySeconds <= 0) return false;
    ball.delaySeconds = Math.fround(ball.delaySeconds - Math.fround(dt));
    if (ball.delaySeconds > 1e-6) return true;
    ball.delaySeconds = 0;
    ball.vx = ball.launchVx;
    ball.vy = ball.launchVy;
    ball.view.visible = true;
    return true;
  }

  /** FUN_7ff72bb37d00 + body off + the 30-frame fade. */
  private stopNativeBall(ball: NativeBall): void {
    ball.vx = 0;
    ball.vy = 0;
    ball.fadeFrames = NATIVE_BALL_FADE_FRAMES;
  }

  /** bound-ball-pitcher: BoundBall update FUN_7ff72bb36ee0 + contact slot 31 FUN_7ff72bb37500. */
  private stepBoundBall(cannon: NativeCannon, ball: NativeBall, dt: number): void {
    if (this.advanceNativeBallFade(ball)) return;
    if (this.advanceNativeBallDelay(ball, dt)) return;
    const party = this.nativePartyCount();
    // The settle count kill (FUN_7ff72bb37af0): 2 resting contacts (0 when N > 4) while |vy| ~ 0.
    const settleLimit = party > 4 ? 0 : 2;
    if (ball.settleCount > 0 && ball.settleCount >= settleLimit && Math.abs(ball.vy) <= NATIVE_FLOAT_EPSILON) {
      this.stopNativeBall(ball);
      return;
    }
    // FUN_7ff72bb36ee0: vertical flight resumed (|vy| > 1.19e-7, DAT_7ff72bc7d458) clears the resting count (+0x3fc = 0).
    if (ball.settleCount > 0 && Math.abs(ball.vy) > NATIVE_FLOAT_EPSILON) ball.settleCount = 0;
    const previousY = ball.y;
    const previousVy = ball.vy;
    ball.vy += BOUND_BALL_GRAVITY_PER_TICK;
    const restitution = party < 5 ? 1.2 : 1.0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) / 4));
    let restingOnBody = false;
    for (let step = 0; step < steps; step += 1) {
      ball.x += ball.vx / steps;
      ball.y += ball.vy / steps;
      if (this.ballBoxSensorCatches(ball)) return;
      const tile = this.deepestTileContact(ball.x, ball.y);
      if (tile) {
        ball.x += tile.nx * tile.depth;
        ball.y += tile.ny * tile.depth;
        restoreBoundBallEnergy(ball, previousY, previousVy);
        if (tile.ny === -1) {
          // A top-face landing (floor or ledge top) kills the ball; the pitcher re-fires.
          this.stopNativeBall(ball);
          return;
        }
        reflectOffMap(ball, tile.nx, tile.ny);
      }
      for (const body of this.boundBallBodies(cannon)) {
        const contact = circleRectContact(ball.x, ball.y, NATIVE_BALL_RADIUS, body.rect);
        if (!contact) continue;
        ball.x += contact.nx * contact.depth;
        ball.y += contact.ny * contact.depth;
        restoreBoundBallEnergy(ball, previousY, previousVy);
        bounceOffBody(ball, contact.nx, contact.ny, body, restitution);
        // Resting on a cat / box (category 1 or 5) with vy' ~ 0: +0x3fc++.
        if (body.settles && Math.abs(ball.vy) <= NATIVE_FLOAT_EPSILON) ball.settleCount += 1;
        if (contact.ny < -0.5) restingOnBody = true;
      }
    }
    // Ground friction 0.95 (DAT_7ff72bcb7130) from the 2nd grounded frame (the 1st when N > 4).
    if (restingOnBody) {
      ball.groundedFrames += 1;
      if (ball.groundedFrames >= (party > 4 ? 1 : 2)) ball.vx *= BOUND_BALL_GROUND_FRICTION;
    } else {
      ball.groundedFrames = 0;
    }
    ball.view.x = ball.x;
    ball.view.y = ball.y;
  }

  /** Every actor body a BoundBall meets: cats (mass 100) and the other solids (mass 1.0); never its own cannon. */
  private boundBallBodies(cannon: NativeCannon): BallContactBody[] {
    const bodies: BallContactBody[] = [];
    for (const player of this.players) {
      if (player.deathTimer > 0 || this.deathFallPlayers.has(player)) continue;
      if (this.collisionChangePlayersCollisionOff.has(player)) continue;
      bodies.push({
        rect: player.rect,
        vx: player.velocity.x / 60,
        vy: player.velocity.y / 60,
        mass: CAT_BODY_MASS,
        settles: true,
      });
    }
    for (const staticRect of this.staticRects) {
      if (staticRect === cannon.body) continue;
      const keyBox = this.nativeKeyBoxes.find((box) => box.body === staticRect);
      bodies.push({ rect: staticRect.rect, vx: 0, vy: 0, mass: DEFAULT_BODY_MASS, settles: keyBox !== undefined });
    }
    for (const pushBox of this.pushBoxes) {
      bodies.push({ rect: pushBox.rect, vx: 0, vy: 0, mass: DEFAULT_BODY_MASS, settles: true });
    }
    return bodies;
  }

  /** The deepest solid map chip under a ball circle (r 12), with the normal pointing from the chip to the ball. */
  private deepestTileContact(x: number, y: number): CircleContact | undefined {
    if (!this.tileMap) return undefined;
    const size = this.tileMap.map.chipSize;
    let deepest: CircleContact | undefined;
    const minTileX = Math.floor((x - NATIVE_BALL_RADIUS) / size);
    const maxTileX = Math.floor((x + NATIVE_BALL_RADIUS) / size);
    const minTileY = Math.floor((y - NATIVE_BALL_RADIUS) / size);
    const maxTileY = Math.floor((y + NATIVE_BALL_RADIUS) / size);
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        if (!this.tileMap.isSolidTile(tileX, tileY)) continue;
        const tileRect = { x: tileX * size, y: tileY * size, width: size, height: size };
        const contact = circleRectContact(x, y, NATIVE_BALL_RADIUS, tileRect);
        if (!contact) continue;
        if (!deepest || contact.depth > deepest.depth) deepest = contact;
      }
    }
    return deepest;
  }

  /** ball-box: BallBox sensor contact FUN_7ff72bb54330 -> message 0xb; the BoundBall answers 1 (FUN_7ff72bb37250). */
  private ballBoxSensorCatches(ball: NativeBall): boolean {
    for (const box of this.nativeKeyBoxes) {
      if (box.kind !== 'ball' || box.breaking) continue;
      const sensor = {
        x: box.x + BALL_BOX_SENSOR.x,
        y: box.y + BALL_BOX_SENSOR.y,
        width: BALL_BOX_SENSOR.width,
        height: BALL_BOX_SENSOR.height,
      };
      if (!circleRectContact(ball.x, ball.y, NATIVE_BALL_RADIUS, sensor)) continue;
      if (Math.abs(ball.x - box.x) > BALL_BOX_SENSOR_REACH) continue;
      // Message 0xb: 30-frame fade, velocity (0, 3.0) (DAT_7ff72bc7eb00), body off, x = box x, reply 1.
      this.stopNativeBall(ball);
      ball.x = box.x;
      ball.dropVy = BOUND_BALL_BOX_DROP_SPEED;
      this.breakNativeKeyBox(box);
      return true;
    }
    return false;
  }

  /** laser-ball-pitcher: ball FUN_7ff72bb4e470: straight line, constant speed; the first contact stops it. */
  private stepLaserBall(cannon: NativeCannon, ball: NativeBall, dt: number): void {
    if (this.advanceNativeBallFade(ball)) return;
    if (this.advanceNativeBallDelay(ball, dt)) return;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) / 4));
    for (let step = 0; step < steps; step += 1) {
      ball.x += ball.vx / steps;
      ball.y += ball.vy / steps;
      const contact = this.firstLaserBallContact(cannon, ball);
      if (!contact) continue;
      // FUN_7ff72bb4ec10: velocity 0, body off, 'ball_hit', 30-frame fade, removed.
      this.stopNativeBall(ball);
      ball.view.x = ball.x;
      ball.view.y = ball.y;
      if (contact.keyBox) this.hitLaserKeyBox(contact.keyBox);
      if (contact.player && cannon.target) this.resetLaserKeyBoxHits(cannon.target);
      return;
    }
    ball.view.x = ball.x;
    ball.view.y = ball.y;
  }

  /** What a laser ball touches first: map chips, cats, every solid body; never its own cannon. */
  private firstLaserBallContact(
    cannon: NativeCannon,
    ball: NativeBall,
  ): { player?: Player; keyBox?: NativeKeyBox } | undefined {
    const touches = (rect: Rect) => circleRectContact(ball.x, ball.y, NATIVE_BALL_RADIUS, rect) !== undefined;
    for (const staticRect of this.staticRects) {
      if (staticRect === cannon.body || !touches(staticRect.rect)) continue;
      const keyBox = this.nativeKeyBoxes.find((box) => box.body === staticRect);
      return { keyBox };
    }
    for (const player of this.players) {
      if (player.deathTimer > 0 || this.deathFallPlayers.has(player)) continue;
      if (this.collisionChangePlayersCollisionOff.has(player)) continue;
      if (touches(player.rect)) return { player };
    }
    if (this.pushBoxes.some((box) => touches(box.rect))) return {};
    if (this.weightedLifts.some((lift) => touches(lift.rect))) return {};
    if (this.deepestTileContact(ball.x, ball.y)) return {};
    return undefined;
  }

  /** ball-box / laser-key-box: a bottom-anchored body {-22, -62, 44, 60}; the Key is added only when the box breaks. */
  private addNativeKeyBox(spawn: ActorSpawnDef, kind: 'ball' | 'laser'): void {
    const box = nativeKeyBoxFromSpawn(spawn, kind, this.nativePartyCount());
    this.staticRects.push(box.body);
    this.nativeKeyBoxes.push(box);
    this.addActorView(spawn, box.view);
  }

  /** BallBox update FUN_7ff72bb54060 / LaserKeyBox FUN_7ff72bb547f0: fall (BallBox), then the 40-frame break fade. */
  private updateNativeKeyBoxes(): void {
    for (const box of [...this.nativeKeyBoxes]) {
      if (box.kind === 'ball') this.dropBallBox(box);
      if (!box.breaking) continue;
      box.breakFrames -= 1;
      box.view.alpha = clamp((box.breakFrames - 20) / 10, 0, 1);
      if (box.breakFrames > 0) continue;
      // FUN_7ff72bc11650: removed; the body (solid during the fade) goes with it.
      this.staticRects = this.staticRects.filter((staticRect) => staticRect !== box.body);
      this.nativeKeyBoxes = this.nativeKeyBoxes.filter((candidate) => candidate !== box);
      this.actorLayer.removeChild(box.view);
    }
  }

  /** ball-box: falls when unsupported (0.65 per tick per tick, the box fall), vy 0 when grounded. */
  private dropBallBox(box: NativeKeyBox): void {
    if (!this.tileMap) return;
    box.vy += BOUND_BALL_GRAVITY_PER_TICK;
    const result = moveRectWithTileCollisions(this.tileMap, box.body.rect, { x: 0, y: box.vy });
    const dy = result.rect.y - box.body.rect.y;
    if (result.velocity.y === 0) box.vy = 0;
    if (dy === 0) return;
    box.body.rect.y += dy;
    box.y += dy;
    box.view.y = box.y;
  }

  /** The 40-frame break and the Key placed at (box x, box y - 30) (DAT_7ff72bcb4ee8) and added to the scene. */
  private breakNativeKeyBox(box: NativeKeyBox): void {
    if (box.breaking) return;
    box.breaking = true;
    box.breakFrames = BREAKING_BOX_FRAMES;
    const keyY = box.y - BOX_KEY_RISE;
    const key = new Key({ raw: [0, 0, 'Key', '', box.x, keyY], actorName: 'Key', label: '', x: box.x, y: keyY });
    this.keys.push(key);
    this.actorLayer.addChild(key.view);
    this.refreshKeyGoalViews();
  }

  /** laser-key-box: FUN_7ff72bb54940: a laser-ball contact; hits 1-2 send 0x15 (speed *= k), hit 3 breaks the box. */
  private hitLaserKeyBox(box: NativeKeyBox): void {
    if (box.kind !== 'laser' || box.breaking) return;
    box.hits += 1;
    if (box.hits >= 3) {
      this.breakNativeKeyBox(box);
      return;
    }
    showLaserKeyBoxFrame(box);
    for (const cannon of this.nativeCannonsNamed(box.pitcherName)) {
      cannon.speed = Math.fround(cannon.speed * box.speedFactor);
    }
  }

  /** laser-key-box: message 0x25 FUN_7ff72bb54860, only while hits < 3: hits 0, 0x16 (base speed), frame 0. */
  private resetLaserKeyBoxHits(target: string): void {
    for (const box of this.nativeKeyBoxes) {
      if (box.kind !== 'laser' || box.breaking || box.hits >= 3) continue;
      if (box.spawn.label !== target && box.spawn.actorName !== target) continue;
      box.hits = 0;
      showLaserKeyBoxFrame(box);
      for (const cannon of this.nativeCannonsNamed(box.pitcherName)) cannon.speed = cannon.baseSpeed;
    }
  }

  private nativeCannonsNamed(name: string): NativeCannon[] {
    return this.nativeCannons.filter((cannon) => cannon.spawn.label === name || cannon.spawn.actorName === name);
  }

  /** seesaw-and-balance: FUN_7ff72bb5d420 plank from the p0 shape table, local to the pivot (the row point). */
  private addSeesawPlank(spawn: ActorSpawnDef): void {
    const plank = seesawPlankFromSpawn(spawn);
    this.seesawPlanks.push(plank);
    this.addActorView(spawn, plank.view);
  }

  /**
   * seesaw-box2d: SeesawParent update FUN_7ff72bb5da90: SetAngularVelocity((target - angle) * (1 / dt)) on its Box2D
   * body; the revolute limit (+-10 deg) and the geared children are left to the Box2D step. Seesaw children have no update
   * (vtable +0xc8 = 0x7ff72bb5d850, empty).
   */
  private updateSeesawPlanks(): void {
    for (const plank of this.seesawPlanks) {
      if (!plank.parent || !plank.body) continue;
      plank.body.setAngularVelocity((plank.target - plank.body.getAngle()) * (1 / BOX2D_TIME_STEP));
    }
  }

  /** seesaw-box2d: FUN_7ff72bbe74f0 world + ground body, then each PhysicsArea / plank body in row order. */
  private ensureBallParkWorld(): void {
    if (this.ballParkWorld) return;
    if (this.seesawPlanks.length === 0 && this.physicsPitchers.length === 0) return;
    const world = createBallParkWorld();
    const ground = world.createBody();
    for (const area of this.physicsAreas) addPhysicsAreaBody(world, area.spawn);
    const parent = this.seesawPlanks.find((plank) => plank.parent);
    for (const plank of this.seesawPlanks) addSeesawPlankBody(world, ground, plank, parent);
    this.ballParkWorld = world;
  }

  /** seesaw-box2d: one b2World::Step(1/60, 10, 10) per game tick, after every actor update (FUN_7ff72bb7bbe0). */
  private stepBallParkWorld(): void {
    const world = this.ballParkWorld;
    if (!world) return;
    world.step(BOX2D_TIME_STEP, BOX2D_VELOCITY_ITERATIONS, BOX2D_POSITION_ITERATIONS);
    for (const plank of this.seesawPlanks) {
      if (!plank.body) continue;
      plank.angle = plank.body.getAngle();
      plank.view.rotation = plank.angle;
    }
    for (const pitcher of this.physicsPitchers) {
      const ball = pitcher.ball;
      if (!ball || ball.gone) continue;
      syncPhysicsBall(ball);
    }
  }

  /** seesaw-and-balance: Balance FUN_7ff72bb313f0 + setup FUN_7ff72bb31900: pans {-97, -7, 194, 14} at x -/+ p0 * 0.5. */
  private addNativeBalance(spawn: ActorSpawnDef): void {
    const balance = nativeBalanceFromSpawn(spawn);
    for (const pan of [balance.left, balance.right]) {
      this.weightedLifts.push(pan.lift);
      this.actorLayer.addChild(pan.lift.view);
    }
    this.nativeBalances.push(balance);
  }

  /** Balance update FUN_7ff72bb315f0 + pan update FUN_7ff72bb31050; sends the angle (message 0xc) to its plank. */
  private updateNativeBalances(): void {
    for (const balance of this.nativeBalances) {
      const party = this.nativePartyCount();
      const leftCount = this.balancePanRiderCount(balance.left.lift.rect);
      const rightCount = this.balancePanRiderCount(balance.right.lift.rect);
      const ratio = clamp((rightCount - leftCount) / (party * 0.5), -1, 1);
      const tilted = Math.abs(ratio) > NATIVE_FLOAT_EPSILON;
      balance.left.target = tilted ? -ratio * BALANCE_AMPLITUDE : 0;
      balance.right.target = tilted ? ratio * BALANCE_AMPLITUDE : 0;
      const speed = Math.max(Math.abs(ratio), BALANCE_MIN_SPEED);
      this.moveBalancePan(balance.left, speed);
      this.moveBalancePan(balance.right, speed);
      const reach = Math.max(Math.abs(balance.left.offset), Math.abs(balance.right.offset));
      // FUN_7ff72bb315f0 (0x7ff72bb31809..31826): the sign is +1 when the right pan offset is >= 0, -1 only below 0.
      const side = balance.right.offset < 0 ? -1 : 1;
      balance.angle = Math.atan2(side * reach, BALANCE_ARM);
      for (const plank of this.seesawPlanks) {
        if (!plank.parent) continue;
        if (plank.spawn.label !== balance.targetLabel && plank.spawn.actorName !== balance.targetLabel) continue;
        plank.target = balance.angle;
      }
    }
  }

  /** FUN_7ff72bc132c0(pan, UP, 1): cats on the pan plus the cats stacked on them. */
  private balancePanRiderCount(slab: Rect): number {
    const supports: Rect[] = [slab];
    const riders = new Set<Player>();
    for (let index = 0; index < supports.length; index += 1) {
      for (const player of this.players) {
        if (riders.has(player) || player.deathTimer > 0 || this.deathFallPlayers.has(player)) continue;
        if (this.collisionChangePlayersCollisionOff.has(player)) continue;
        if (!rectRestsOnSupport(player.rect, supports[index])) continue;
        riders.add(player);
        supports.push(player.rect);
      }
    }
    return riders.size;
  }

  /** At most +0x400 px toward the target (0.2 when moving against its imbalance), with the lift move check. */
  private moveBalancePan(pan: BalancePan, speed: number): void {
    const delta = pan.target - pan.offset;
    if (delta === 0) return;
    const returning = pan.target !== 0 && Math.sign(delta) === -Math.sign(pan.target);
    const limit = returning ? BALANCE_MIN_SPEED : speed;
    const dy = Math.abs(delta) <= limit ? delta : Math.sign(delta) * limit;
    if (this.balancePanBlocked(pan, dy)) return;
    pan.offset += dy;
    pan.lift.view.y = pan.homeY + pan.offset;
    pan.lift.rect.y = pan.lift.view.y + pan.lift.bodyOffsetY;
  }

  /** FUN_7ff72bc16f50: a rising pan may not push its stack into anything; a sinking pan stops on what is under it. */
  private balancePanBlocked(pan: BalancePan, dy: number): boolean {
    if (dy < 0) return this.liftRiseBlocked(pan.lift, dy);
    const slab = pan.lift.rect;
    const next = { ...slab, y: slab.y + dy };
    if (this.tileMap?.rectHitsSolid(next)) return true;
    if (this.stepSolidRects(pan.lift).some((solid) => !rectsOverlap(slab, solid) && rectsOverlap(next, solid))) return true;
    return this.stepBodies().some((body) => !rectsOverlap(slab, body.rect) && rectsOverlap(next, body.rect));
  }

  /** seesaw-and-balance: PhysicsBallPitcher (angle 180 = down), launch 0.1 * p[N-1] (solo 5.0). */
  private addPhysicsPitcher(spawn: ActorSpawnDef): void {
    const pitcher = physicsPitcherFromSpawn(spawn, this.nativePartyCount());
    this.physicsPitchers.push(pitcher);
    this.addActorView(spawn, pitcher.view);
  }

  /** FUN_7ff72bb38130 for the PhysicsBall child, then FUN_7ff72bb55e40's 30-tick death countdown. */
  private updatePhysicsPitchers(): void {
    for (const pitcher of this.physicsPitchers) {
      if (!pitcher.firstTickSkipped) {
        pitcher.firstTickSkipped = true;
        continue;
      }
      if (pitcher.ball?.gone) {
        pitcher.ball = undefined;
        continue;
      }
      if (!pitcher.ball) {
        // seesaw-box2d: the body exists at once, so this tick's Box2D step already moves it.
        if (!this.ballParkWorld) continue;
        pitcher.ball = spawnPhysicsBall(this.ballParkWorld, pitcher);
        this.actorLayer.addChild(pitcher.ball.view);
        continue;
      }
      this.updatePhysicsBall(pitcher.ball);
    }
  }

  /** PhysicsBall update FUN_7ff72bb55e40: the death test on the last step's contacts, then the 30-tick countdown. */
  private updatePhysicsBall(ball: PhysicsBall): void {
    if (ball.countdown === 0) {
      // Detection does not consume the first count.
      if (physicsBallTouchesAreaFloorOrCeiling(ball.body)) ball.countdown = PHYSICS_BALL_DEATH_TICKS;
      return;
    }
    if (ball.countdown >= 20) {
      ball.view.scale.set(Math.pow(1.0499999523162842, 31 - ball.countdown));
      ball.view.alpha = (ball.countdown - 20) / 10;
    }
    ball.countdown -= 1;
    if (ball.countdown === 0) {
      // FUN_7ff72bc11650: the actor (and its body) is removed.
      ball.gone = true;
      this.ballParkWorld?.destroyBody(ball.body);
      this.actorLayer.removeChild(ball.view);
      return;
    }
    // Below 15: the body is put to sleep (awake flag cleared, sleep time, velocities and forces zeroed) every tick.
    if (ball.countdown < 15) {
      ball.body.setAwake(false);
      syncPhysicsBall(ball);
    }
  }

  /**
   * PhysicsSwitch: FUN_7ff72bbe7770 casts (x, y) -> (x, y - 16) through every fixture of every body of the Box2D world
   * (the shapes' own RayCast, no broad-phase); any hit sends ("Key", 9).
   */
  private updateNativePhysicsSwitches(): void {
    const world = this.ballParkWorld;
    for (const entry of this.nativePhysicsSwitches) {
      if (entry.latched || !world) continue;
      const { spawn } = entry.physicsSwitch;
      if (!box2dRayHitsAnyFixture(world, spawn.x, spawn.y, spawn.x, spawn.y + PHYSICS_SWITCH_RAY)) continue;
      entry.latched = true;
      entry.physicsSwitch.view.alpha = 0.5;
      // FUN_7ff72bb65700: the hidden Key appears.
      for (const key of this.keys) {
        if (key.spawn.actorName === spawn.label || key.spawn.label === spawn.label) key.activate();
      }
      this.refreshKeyGoalViews();
    }
  }

  private applyDeadBallPitchers(): void {
`, file);
    source += `
// ---- Ball Park (9-1 / 9-2 / 9-4) module helpers: bound-ball-pitcher, ball-box, laser-ball-pitcher, laser-key-box,
// seesaw-and-balance. Every length is in map px, every speed in px per native tick (1/60 s).

const NATIVE_FLOAT_EPSILON = 1.1920928955078125e-7;     // DAT_7ff72bc7d458
const NATIVE_BALL_RADIUS = 12;                            // DAT_7ff72c62add8 / DAT_7ff72c62cfd0 / DAT_7ff72c61f3d8
const NATIVE_BALL_FADE_FRAMES = 30;                       // +0x3f8 = 0x1e (BoundBall), +0x41c (laser ball)
const CANNON_BODY = { x: -40, y: -18, width: 54, height: 40 };   // DAT_7ff72bcb7320
const CANNON_SPAWN_OFFSET = 20;                           // DAT_7ff72bc7d1b0
const CANNON_SPAWN_DELAY_SECONDS = 0.5;                   // DAT_7ff72bcff4fc
const CANNON_SOLO_SPEED = 5;                              // ctor +0x3f0 / +0x3f4
const CANNON_PARTY_SPEED_SCALE = Math.fround(0.1);        // DAT_7ff72bc7d464
const BOUND_BALL_GRAVITY_PER_TICK = 0.65;                 // +0x12c (DAT_7ff72bcb69bc)
const BOUND_BALL_MASS = 50;                               // +0x148
const CAT_BODY_MASS = 100;                                // DAT_7ff72bcc7dc4
const DEFAULT_BODY_MASS = 1;                              // FUN_7ff72bc155e0
const BOUND_BALL_MIN_NORMAL_SPEED = 1.2;                  // DAT_7ff72bcb7134
const BOUND_BALL_GROUND_FRICTION = 0.95;                  // DAT_7ff72bcb7130
const BOUND_BALL_BOX_DROP_SPEED = 3;                      // DAT_7ff72bc7eb00
const NATIVE_KEY_BOX_BODY = { x: -22, y: -62, width: 44, height: 60 };   // DAT_7ff72bcb64f0
const BALL_BOX_SENSOR = { x: -4, y: -66, width: 8, height: 10 };         // DAT_7ff72bcbb170
const BALL_BOX_SENSOR_REACH = 5;                          // DAT_7ff72bc7d588
const BREAKING_BOX_FRAMES = 40;                           // +0x3f8 = 0x28
const BOX_KEY_RISE = 30;                                  // DAT_7ff72bcb4ee8
const SEESAW_ANGLE_LIMIT = 0.1745329201221466;            // DAT_7ff72bcbc478 = -0.17453292 / DAT_7ff72bcbc470 = +0.17453292
const SEESAW_PLANK_SHAPES: readonly Rect[] = [            // LAB_7ff72bcbc230[p0]
  { x: -300, y: -10, width: 600, height: 20 },
  { x: -300, y: -10, width: 450, height: 20 },
  { x: -150, y: -10, width: 450, height: 20 },
];
const BALANCE_PAN_BODY = { x: -97, y: -7, width: 194, height: 14 };      // DAT_7ff72c62ada0
const BALANCE_ARM = 450;
const BALANCE_AMPLITUDE = Math.sin(0.12217) * BALANCE_ARM;               // DAT_7ff72bcb6210: 54.84 px
const BALANCE_MIN_SPEED = 0.2;                            // DAT_7ff72bc7d858
const PHYSICS_BALL_DEATH_TICKS = 30;                      // FUN_7ff72bb55e40
// seesaw-box2d: the Box2D 2.3 world of the PhysicsArea / Seesaw / PhysicsBall actors (planck, a JS port of Box2D 2.3).
const BOX2D_SCALE = 0.009999999776482582;                 // DAT_7ff72bc7d45c: metres per px (FUN_7ff72bbe6520 / 5d30 / 6ef0)
const BOX2D_GRAVITY_Y = 980;                              // (0, 980) px/s^2 (DAT_7ff72bcc84b0) -> FUN_7ff72bbe76d0: y * 0.01
const BOX2D_TIME_STEP = 0.01666666753590107;              // DAT_7ff72bc7d790 = 1/60: scene tick FUN_7ff72bc1b830 -> FUN_7ff72bb7bbe0
const BOX2D_VELOCITY_ITERATIONS = 10;                     // FUN_7ff72bbe7720: mov r9d, 0xa; mov r8d, r9d; jmp b2World::Step
const BOX2D_POSITION_ITERATIONS = 10;
const BOX2D_AREA_KIND = 1;                                // body wrapper +0xc: PhysicsArea ctor FUN_7ff72bb77970 (+0x404 = 1)
const PHYSICS_AREA_DENSITY = 1;                           // FUN_7ff72bb77970: +0x450 = 1.0
const PHYSICS_AREA_FRICTION = 1;                          //                   +0x454 = 1.0 (restitution 0)
const SEESAW_DENSITY = 1;                                 // FUN_7ff72bb5d700: +0x750 = 1.0
const SEESAW_FRICTION = 1;                                //                   +0x754 = 1.0 (restitution 0)
const SEESAW_GEAR_RATIO = -1;                             // DAT_7ff72bcff6a8 (FUN_7ff72bb5d9e0 -> FUN_7ff72bbe7210)
const PHYSICS_BALL_DENSITY = 0.10000000149011612;         // FUN_7ff72bb55d80: +0x468 = 0x3dcccccd
const PHYSICS_BALL_FRICTION = 0.5;                        //                   +0x46c = 0x3f000000
const PHYSICS_BALL_RESTITUTION = 0.20000000298023224;     //                   +0x470 = 0x3e4ccccd
const PHYSICS_BALL_ANGULAR_DAMPING = 0.5;                 // DAT_7ff72bcff4fc -> FUN_7ff72bbe6850 -> b2Body +0xa4
const PHYSICS_SWITCH_RAY = -16;                           // DAT_7ff72bc7e738

interface NativeBall {
  kind: 'bound' | 'laser';
  x: number;
  y: number;
  vx: number;
  vy: number;
  launchVx: number;
  launchVy: number;
  delaySeconds: number;
  fadeFrames: number;
  dropVy: number;
  gone: boolean;
  settleCount: number;
  groundedFrames: number;
  view: Container;
}

interface NativeCannon {
  spawn: ActorSpawnDef;
  kind: 'bound' | 'laser';
  dirX: number;
  dirY: number;
  speed: number;
  baseSpeed: number;
  target?: string;
  body: StaticRect;
  view: Container;
  firstTickSkipped: boolean;
  ball?: NativeBall;
}

interface NativeKeyBox {
  spawn: ActorSpawnDef;
  kind: 'ball' | 'laser';
  x: number;
  y: number;
  vy: number;
  body: StaticRect;
  view: Container;
  frames: Container[];
  hits: number;
  speedFactor: number;
  pitcherName: string;
  breaking: boolean;
  breakFrames: number;
}

interface SeesawPlank {
  spawn: ActorSpawnDef;
  parent: boolean;
  geared: boolean;
  pivotX: number;
  pivotY: number;
  local: Rect;
  angle: number;
  target: number;
  view: Container;
  /** seesaw-box2d: the plank's Box2D body and its revolute joint to the ground body. */
  body?: planck.Body;
  joint?: planck.RevoluteJoint;
}

interface BalancePan {
  lift: WeightedLift;
  homeY: number;
  offset: number;
  target: number;
}

interface NativeBalance {
  spawn: ActorSpawnDef;
  targetLabel: string;
  left: BalancePan;
  right: BalancePan;
  angle: number;
}

interface PhysicsBall {
  /** Read back from the Box2D body after every step (px, px per tick). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  countdown: number;
  gone: boolean;
  view: Container;
  body: planck.Body;
}

interface PhysicsPitcher {
  spawn: ActorSpawnDef;
  dirX: number;
  dirY: number;
  speed: number;
  firstTickSkipped: boolean;
  ball?: PhysicsBall;
  view: Container;
}

interface CircleContact {
  nx: number;
  ny: number;
  depth: number;
  pointX: number;
  pointY: number;
}

interface BallContactBody {
  rect: Rect;
  vx: number;
  vy: number;
  mass: number;
  settles: boolean;
}

/** The row's params after its x / y pair. */
function rowParams(spawn: ActorSpawnDef): ValueAtom[] {
  for (let index = 0; index <= spawn.raw.length - 2; index += 1) {
    if (spawn.raw[index] === spawn.x && spawn.raw[index + 1] === spawn.y) return spawn.raw.slice(index + 2);
  }
  return [];
}

function numberParam(params: readonly ValueAtom[], index: number): number | undefined {
  const value = params[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A sprite from the atlas at a local rect, or a flat fallback block. */
function atlasPiece(frame: string, rect: Rect, fallbackColor: number): Container {
  const texture = frameTexture(frame as any);
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.x = rect.x;
    sprite.y = rect.y;
    sprite.width = rect.width;
    sprite.height = rect.height;
    return sprite;
  }
  const g = new Graphics();
  g.beginFill(fallbackColor, 1);
  g.drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
  g.endFill();
  return g;
}

/** FUN_7ff72bb37d70 + params FUN_7ff72bb37f30. */
function nativeCannonFromSpawn(spawn: ActorSpawnDef, kind: 'bound' | 'laser', party: number): NativeCannon {
  const params = rowParams(spawn);
  const angle = Math.trunc(numberParam(params, 0) ?? 0);
  const direction = physicsBallDirectionFromAngle(angle);
  let speed = CANNON_SOLO_SPEED;
  let target: string | undefined;
  if (kind === 'laser') {
    // Modes 1..3: raw p1 float = speed px/tick; a 3rd param is the hit target (+0x660).
    speed = numberParam(params, 1) ?? CANNON_SOLO_SPEED;
    if (params.length >= 3 && typeof params[2] === 'string') target = params[2];
  } else if (party > 1) {
    // Mode 0: speed = p[N-1] * 0.1 (index N-1, FUN_7ff72bb389b0); solo keeps 5.0.
    const partyValue = numberParam(params, party - 1);
    if (partyValue !== undefined) speed = Math.fround(Math.fround(partyValue) * CANNON_PARTY_SPEED_SCALE);
  }
  const body = new StaticRect(spawn, {
    x: spawn.x + CANNON_BODY.x,
    y: spawn.y + CANNON_BODY.y,
    width: CANNON_BODY.width,
    height: CANNON_BODY.height,
  });
  body.view.visible = false;
  const view = new Container();
  view.x = spawn.x;
  view.y = spawn.y;
  // Base {-25, -4, 52, 40} (DAT_7ff72bcb7310) unless the angle is within 170..190; barrel {-23, -38, 46, 58} rotated.
  if (angle < 170 || angle > 190) {
    view.addChild(atlasPiece('ball_cannon_base', { x: -25, y: -4, width: 52, height: 40 }, 0x5b6470));
  }
  const barrel = new Container();
  barrel.addChild(atlasPiece('ball_cannon_barrel', { x: -23, y: -38, width: 46, height: 58 }, 0x3a404a));
  barrel.rotation = angle * Math.PI / 180;
  view.addChild(barrel);
  return {
    spawn, kind, dirX: direction.x, dirY: direction.y, speed, baseSpeed: speed, target,
    body, view, firstTickSkipped: false,
  };
}

/** FUN_7ff72bb383e0: the child at pos + dir * 20, velocity dir * speed, parked for 0.5 s. */
function spawnNativeBall(cannon: NativeCannon): NativeBall {
  const x = Math.fround(cannon.spawn.x + Math.fround(cannon.dirX * CANNON_SPAWN_OFFSET));
  const y = Math.fround(cannon.spawn.y + Math.fround(cannon.dirY * CANNON_SPAWN_OFFSET));
  const view = new Container();
  view.x = x;
  view.y = y;
  const frame = cannon.kind === 'bound' ? 'breakout_ball_free' : 'breakout_ball';
  view.addChild(atlasPiece(frame, { x: -12, y: -12, width: 24, height: 24 }, cannon.kind === 'bound' ? 0xff864d : 0xff4f6d));
  // The laser ball is hidden while it waits (FUN_7ff72bb4e6f0); the BoundBall shows, frozen.
  view.visible = cannon.kind === 'bound';
  return {
    kind: cannon.kind, x, y, vx: 0, vy: 0,
    launchVx: Math.fround(cannon.dirX * cannon.speed),
    launchVy: Math.fround(cannon.dirY * cannon.speed),
    delaySeconds: CANNON_SPAWN_DELAY_SECONDS,
    fadeFrames: 0, dropVy: 0, gone: false, settleCount: 0, groundedFrames: 0, view,
  };
}

/** Closest point of a rect to a circle; the normal points from the rect to the centre. Undefined when apart. */
function circleRectContact(x: number, y: number, radius: number, rect: Rect): CircleContact | undefined {
  const pointX = clamp(x, rect.x, rect.x + rect.width);
  const pointY = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - pointX;
  const dy = y - pointY;
  const distance = Math.hypot(dx, dy);
  if (distance > 0) {
    if (distance >= radius) return undefined;
    return { nx: dx / distance, ny: dy / distance, depth: radius - distance, pointX, pointY };
  }
  // The centre is inside: leave through the nearest face.
  const faces = [
    { d: x - rect.x, nx: -1, ny: 0 },
    { d: rect.x + rect.width - x, nx: 1, ny: 0 },
    { d: y - rect.y, nx: 0, ny: -1 },
    { d: rect.y + rect.height - y, nx: 0, ny: 1 },
  ];
  const face = faces.reduce((best, candidate) => (candidate.d < best.d ? candidate : best));
  return { nx: face.nx, ny: face.ny, depth: face.d + radius, pointX, pointY };
}

/** Contact step 1 (DAT_7ff72bcb69bc): |vy| = sqrt(vy_prev^2 + 2 * 0.65 * (y - y_prev)), sign kept: no energy lost. */
function restoreBoundBallEnergy(ball: NativeBall, previousY: number, previousVy: number): void {
  const squared = previousVy * previousVy + 2 * BOUND_BALL_GRAVITY_PER_TICK * (ball.y - previousY);
  ball.vy = Math.sign(ball.vy) * Math.sqrt(Math.max(0, squared));
}

/** Map chips: v' = v - (1 + e)(v.n)n with e = 1.0 (DAT_7ff72bcff538); a normal part under 1.2 is dropped. */
function reflectOffMap(ball: NativeBall, nx: number, ny: number): void {
  const normal = ball.vx * nx + ball.vy * ny;
  if (normal >= 0) return;
  const reflected = Math.abs(normal) < BOUND_BALL_MIN_NORMAL_SPEED ? 0 : -normal;
  ball.vx += (reflected - normal) * nx;
  ball.vy += (reflected - normal) * ny;
}

/** Actor bodies, closing only: v1n' = ((m1 - e m2) u1 + (e + 1) m2 u2) / (m1 + m2); under 1.2 -> 0. */
function bounceOffBody(ball: NativeBall, nx: number, ny: number, body: BallContactBody, restitution: number): boolean {
  const u1 = ball.vx * nx + ball.vy * ny;
  const u2 = body.vx * nx + body.vy * ny;
  if (u1 - u2 >= 0) return false;
  const m1 = BOUND_BALL_MASS;
  const m2 = body.mass;
  let after = ((m1 - restitution * m2) * u1 + (restitution + 1) * m2 * u2) / (m1 + m2);
  if (Math.abs(after) < BOUND_BALL_MIN_NORMAL_SPEED) after = 0;
  ball.vx += (after - u1) * nx;
  ball.vy += (after - u1) * ny;
  return true;
}

/** ball-box / laser-key-box: body {-22, -62, 44, 60} from the row point; views {-24, -64, 48, 64} / {-23, -62, 46, 62}. */
function nativeKeyBoxFromSpawn(spawn: ActorSpawnDef, kind: 'ball' | 'laser', party: number): NativeKeyBox {
  const params = rowParams(spawn);
  const body = new StaticRect(spawn, {
    x: spawn.x + NATIVE_KEY_BOX_BODY.x,
    y: spawn.y + NATIVE_KEY_BOX_BODY.y,
    width: NATIVE_KEY_BOX_BODY.width,
    height: NATIVE_KEY_BOX_BODY.height,
  });
  body.view.visible = false;
  const view = new Container();
  view.x = spawn.x;
  view.y = spawn.y;
  const frames: Container[] = [];
  if (kind === 'laser') {
    for (let index = 0; index < 3; index += 1) {
      const frame = atlasPiece('laser_key_box_' + index, { x: -23, y: -62, width: 46, height: 62 }, [0xffffff, 0xffd166, 0xff864d][index]);
      frame.visible = index === 0;
      frames.push(frame);
      view.addChild(frame);
    }
  } else {
    const g = new Graphics();
    g.beginFill(0xffffff, 1);
    g.lineStyle(3, 0x3a404a, 1);
    g.drawRoundedRect(-24, -64, 48, 64, 6);
    g.endFill();
    g.beginFill(0x3a404a, 1);
    g.drawRect(-6, -64, 12, 6);
    g.endFill();
    view.addChild(g);
  }
  // LaserKeyBox params FUN_7ff72bb54fe0: p0 pitcher name, k = p[max(N-1, 1)].
  const pitcherName = typeof params[0] === 'string' ? params[0] : 'LaserBallPitcher';
  const speedFactor = numberParam(params, Math.max(party - 1, 1)) ?? 1;
  return {
    spawn, kind, x: spawn.x, y: spawn.y, vy: 0, body, view, frames,
    hits: 0, speedFactor: Math.fround(speedFactor), pitcherName, breaking: false, breakFrames: 0,
  };
}

function showLaserKeyBoxFrame(box: NativeKeyBox): void {
  box.frames.forEach((frame, index) => { frame.visible = index === Math.min(box.hits, box.frames.length - 1); });
}

/** FUN_7ff72bb5d420(obj, p0): plank rect from the shape table; Seesaw rows with p1 != 0 are geared to the parent. */
function seesawPlankFromSpawn(spawn: ActorSpawnDef): SeesawPlank {
  const params = rowParams(spawn);
  const shape = SEESAW_PLANK_SHAPES[Math.trunc(numberParam(params, 0) ?? 0)] ?? SEESAW_PLANK_SHAPES[0];
  const parent = spawn.actorName === 'SeesawParent';
  const view = new Container();
  view.x = spawn.x;
  view.y = spawn.y;
  const g = new Graphics();
  g.beginFill(0xff864d, 1);
  g.drawRoundedRect(shape.x, shape.y, shape.width, shape.height, 6);
  g.endFill();
  g.beginFill(0x3a404a, 1);
  g.drawCircle(0, 0, 5);
  g.endFill();
  view.addChild(g);
  return {
    spawn, parent, geared: !parent && Math.trunc(numberParam(params, 1) ?? 0) !== 0,
    pivotX: spawn.x, pivotY: spawn.y, local: { ...shape },
    angle: 0, target: 0, view,
  };
}

/** The two pans as lift bodies (the lift family's move check and rider carry); body {-97, -7, 194, 14}. */
function nativeBalanceFromSpawn(spawn: ActorSpawnDef): NativeBalance {
  const half = (numberParam(rowParams(spawn), 0) ?? 900) * 0.5;
  const pan = (x: number): BalancePan => {
    const lift = new WeightedLift({ raw: [0, 0, 'BalancePan', '', x, spawn.y], actorName: 'BalancePan', label: '', x, y: spawn.y });
    lift.rect.x = x + BALANCE_PAN_BODY.x;
    lift.rect.y = spawn.y + BALANCE_PAN_BODY.y;
    lift.rect.width = BALANCE_PAN_BODY.width;
    lift.rect.height = BALANCE_PAN_BODY.height;
    lift.bodyOffsetY = BALANCE_PAN_BODY.y;
    lift.view.removeChildren();
    const g = new Graphics();
    g.beginFill(0xff864d, 1);
    g.drawRoundedRect(-98, -8, 196, 16, 5);
    g.endFill();
    lift.view.addChild(g);
    return { lift, homeY: spawn.y, offset: 0, target: 0 };
  };
  return { spawn, targetLabel: spawn.label, left: pan(spawn.x - half), right: pan(spawn.x + half), angle: 0 };
}

/** PhysicsBallPitcher (FUN_7ff72bb37d70 family): direction (sin a, -cos a), launch 0.1 * p[N-1], solo 5.0. */
function physicsPitcherFromSpawn(spawn: ActorSpawnDef, party: number): PhysicsPitcher {
  const params = rowParams(spawn);
  const direction = physicsBallDirectionFromAngle(Math.trunc(numberParam(params, 0) ?? 0));
  let speed = CANNON_SOLO_SPEED;
  const partyValue = party > 1 ? numberParam(params, party - 1) : undefined;
  if (partyValue !== undefined) speed = Math.fround(Math.fround(partyValue) * CANNON_PARTY_SPEED_SCALE);
  const view = new Container();
  view.x = spawn.x;
  view.y = spawn.y;
  const g = new Graphics();
  g.beginFill(0x3a404a, 1);
  g.drawRoundedRect(-14, -14, 28, 28, 6);
  g.endFill();
  view.addChild(g);
  return { spawn, dirX: direction.x, dirY: direction.y, speed, firstTickSkipped: false, view };
}

/** seesaw-box2d: the b2World of FUN_7ff72bbe74f0 / FUN_7ff72bbf2950 (Box2D 2.3 defaults: sleeping, warm starting, CCD on). */
function createBallParkWorld(): planck.World {
  return new planck.World({ gravity: new planck.Vec2(0, BOX2D_GRAVITY_Y * BOX2D_SCALE) });
}

function box2dPoint(x: number, y: number): planck.Vec2 {
  return new planck.Vec2(x * BOX2D_SCALE, y * BOX2D_SCALE);
}

/**
 * PhysicsArea FUN_7ff72bb77970 + params FUN_7ff72bb78d80: a static body at the row point (kind 1) whose 5-point loop
 * (p0, p1) -> (p0, p1 + p3) -> (p0 + p2, p1 + p3) -> (p0 + p2, p1) -> (p0, p1) becomes four b2EdgeShapes
 * (FUN_7ff72bbe5f80): each edge after the first has a ghost vertex0 equal to its own vertex1 (the loop reads the
 * previous edge's end), each edge before the last has vertex3 = the next point; density 1, friction 1, restitution 0.
 */
function addPhysicsAreaBody(world: planck.World, spawn: ActorSpawnDef): void {
  const params = rowParams(spawn);
  const left = Math.trunc(numberParam(params, 0) ?? 0);
  const top = Math.trunc(numberParam(params, 1) ?? 0);
  const width = Math.trunc(numberParam(params, 2) ?? 0);
  const height = Math.trunc(numberParam(params, 3) ?? 0);
  const body = world.createBody({ type: 'static', position: box2dPoint(spawn.x, spawn.y) });
  body.setUserData({ kind: BOX2D_AREA_KIND });
  const points = [
    box2dPoint(left, top),
    box2dPoint(left, top + height),
    box2dPoint(left + width, top + height),
    box2dPoint(left + width, top),
    box2dPoint(left, top),
  ];
  for (let index = 0; index < points.length - 1; index += 1) {
    const edge = new planck.Edge(points[index], points[index + 1]);
    if (index > 0) edge.setPrevVertex(points[index]);
    if (index < points.length - 2) edge.setNextVertex(points[index + 2]);
    body.createFixture(edge, { density: PHYSICS_AREA_DENSITY, friction: PHYSICS_AREA_FRICTION, restitution: 0 });
  }
}

/**
 * Seesaw setup FUN_7ff72bb5d700: a dynamic box at the pivot (gravity scale 0) from the p0 shape table, polygon
 * FUN_7ff72bbe5c70 (x, -(y + h)), (x + w, -(y + h)), (x + w, -y), (x, -y) scaled by 0.01; a revolute joint from the
 * ground body (anchor = the pivot, FUN_7ff72bbe6ef0) with limits +-0.1745 rad (FUN_7ff72bbe6ea0); geared children get
 * a gear joint (parent revolute, own revolute, ratio -1: FUN_7ff72bb5d9e0 / FUN_7ff72bbe7250).
 */
function addSeesawPlankBody(world: planck.World, ground: planck.Body, plank: SeesawPlank, parent: SeesawPlank | undefined): void {
  const body = world.createBody({
    type: 'dynamic', position: box2dPoint(plank.pivotX, plank.pivotY), angle: 0, gravityScale: 0,
  });
  body.setUserData({ kind: 0 });
  const { x, y, width, height } = plank.local;
  const outline = new planck.Polygon([
    box2dPoint(x, -(y + height)),
    box2dPoint(x + width, -(y + height)),
    box2dPoint(x + width, -y),
    box2dPoint(x, -y),
  ]);
  body.createFixture(outline, { density: SEESAW_DENSITY, friction: SEESAW_FRICTION, restitution: 0 });
  const joint = world.createJoint(new planck.RevoluteJoint({
    bodyA: ground, bodyB: body,
    localAnchorA: box2dPoint(plank.pivotX, plank.pivotY), localAnchorB: new planck.Vec2(0, 0), referenceAngle: 0,
    enableLimit: true, lowerAngle: -SEESAW_ANGLE_LIMIT, upperAngle: SEESAW_ANGLE_LIMIT,
  }));
  plank.body = body;
  plank.joint = joint ?? undefined;
  if (!plank.geared || !parent?.body || !parent.joint || !plank.joint) return;
  world.createJoint(new planck.GearJoint({
    bodyA: parent.body, bodyB: body, joint1: parent.joint, joint2: plank.joint, ratio: SEESAW_GEAR_RATIO,
  }));
}

/**
 * PhysicsBall FUN_7ff72bb55c30 / setup FUN_7ff72bb55d80, fired by FUN_7ff72bb383e0 mode 4 at pos + dir * 20: a dynamic
 * circle r 12, density 0.1, friction 0.5, restitution 0.2, angular damping 0.5, gravity scale 1. The pitcher's
 * 0.1 * p[N-1] speed only goes to the actor (+0x118): the body is built later in setup from the wrapper velocity, which
 * is still 0 (FUN_7ff72bbe6520), so the ball starts at rest.
 */
function spawnPhysicsBall(world: planck.World, pitcher: PhysicsPitcher): PhysicsBall {
  const x = Math.fround(pitcher.spawn.x + Math.fround(pitcher.dirX * CANNON_SPAWN_OFFSET));
  const y = Math.fround(pitcher.spawn.y + Math.fround(pitcher.dirY * CANNON_SPAWN_OFFSET));
  const body = world.createBody({
    type: 'dynamic', position: box2dPoint(x, y), angularDamping: PHYSICS_BALL_ANGULAR_DAMPING, gravityScale: 1,
  });
  body.setUserData({ kind: 0 });
  body.createFixture(new planck.Circle(NATIVE_BALL_RADIUS * BOX2D_SCALE), {
    density: PHYSICS_BALL_DENSITY, friction: PHYSICS_BALL_FRICTION, restitution: PHYSICS_BALL_RESTITUTION,
  });
  const view = new Container();
  view.x = x;
  view.y = y;
  const g = new Graphics();
  g.beginFill(0xff4f6d, 1);
  g.lineStyle(2, 0xfff0f3, 0.9, 1);
  g.drawCircle(0, 0, NATIVE_BALL_RADIUS);
  g.endFill();
  view.addChild(g);
  return { x, y, vx: 0, vy: 0, countdown: 0, gone: false, view, body };
}

/** The ball's px position and px-per-tick velocity, read back from its body (FUN_7ff72bbe68a0: metres / 0.01). */
function syncPhysicsBall(ball: PhysicsBall): void {
  const position = ball.body.getPosition();
  const velocity = ball.body.getLinearVelocity();
  ball.x = position.x / BOX2D_SCALE;
  ball.y = position.y / BOX2D_SCALE;
  ball.vx = velocity.x / BOX2D_SCALE * BOX2D_TIME_STEP;
  ball.vy = velocity.y / BOX2D_SCALE * BOX2D_TIME_STEP;
  ball.view.x = ball.x;
  ball.view.y = ball.y;
}

/**
 * FUN_7ff72bb55e40's death test: some contact of the ball's contact list is with a kind-1 body (the PhysicsArea) and
 * its manifold's local normal is vertical (|1 - |n.y|| <= 1.19e-7): the area's floor or ceiling edge.
 */
function physicsBallTouchesAreaFloorOrCeiling(body: planck.Body): boolean {
  for (let edge = body.getContactList(); edge; edge = edge.next) {
    const data = edge.other?.getUserData() as { kind?: number } | null | undefined;
    if (data?.kind !== BOX2D_AREA_KIND) continue;
    const normalY = Math.abs(edge.contact.getManifold().localNormal.y);
    if (Math.abs(1 - normalY) <= NATIVE_FLOAT_EPSILON) return true;
  }
  return false;
}

/** FUN_7ff72bbe7770: the segment through every fixture of every body (maxFraction 1); true on any hit. */
function box2dRayHitsAnyFixture(world: planck.World, x1: number, y1: number, x2: number, y2: number): boolean {
  const input = { p1: box2dPoint(x1, y1), p2: box2dPoint(x2, y2), maxFraction: 1 };
  const output = { normal: new planck.Vec2(0, 0), fraction: 0 };
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
      if (fixture.rayCast(output, input, 0)) return true;
    }
  }
  return false;
}
`;
    // action-button: native input bit 11 ('[shot]') reaches the runtime as action (held) / actionPressed (edge).
    // A cat whose Roulette activity is 0 has no buttons at all, the action button included.
    source = replaceOnce(source, `            jump: false,
            jumpPressed: false,
          }
        : playerInput;`, `            jump: false,
            jumpPressed: false,
            action: false,
            actionPressed: false,
          }
        : playerInput;`, file);
    source = replaceOnce(source, `    || input.jumpPressed
    || input.resetPressed;
}`, `    || input.jumpPressed
    || !!input.action
    || !!input.actionPressed
    || input.resetPressed;
}`, file);
    // warp-gun-player: the gun fires on the action press edge (FUN_7ff72bb57280 -> FUN_7ff72bb68510(owner, 0xb) =
    // FUN_7ff72bb6ad30: (cur & m) == m && (prev & m) == 0); jump is bit 2 and independent: gun cats jump normally.
    source = replaceOnce(source, `      if (resolvedPlayerInput.jumpPressed && this.warpGunPlayers.has(this.player)) {
        this.createWarpGunPlayerShot(this.player);
        resolvedPlayerInput = { ...resolvedPlayerInput, jump: false, jumpPressed: false };
      }`, `      if (resolvedPlayerInput.actionPressed && this.warpGunPlayers.has(this.player)) {
        this.createWarpGunPlayerShot(this.player);
      }`, file);
    // warp-gun-player: range FUN_7ff72bb57c80 tests the SCREEN x (FUN_7ff72bc15b90 subtracts the camera scroll for
    // every actor: base ctor FUN_7ff72bc155e0 sets +0x90 bit 8), as viewportWorldRight does: the shot lives until it
    // leaves the visible screen (was the world x: a shot fired at world x >= 1280 / scale died on its first step).
    source = replaceOnce(source, `      const previousShotX = shot.x;
      shot.x += shot.direction * WARP_GUN_SHOT_STEP;
      if (shot.x < 0 || shot.x >= rightBoundary) {`, `      const previousShotX = shot.x;
      shot.x += shot.direction * WARP_GUN_SHOT_STEP;
      const cameraScroll = this.scrollCameraConfig && this.scrollCameraConfig.mode !== 0
        ? this.scrollCameraState.scroll
        : 0;
      const shotScreenX = shot.x - cameraScroll;
      if (shotScreenX < 0 || shotScreenX >= rightBoundary) {`, file);
    // magnet-player / warp-gun-player: the decoded actors (spec b13).
    source = replaceOnce(source, `  MagnetPlayer: { provenance: 'suspected', runtimeRole: 'player' },
  WarpGunPlayer: { provenance: 'suspected', runtimeRole: 'player' },`, `  MagnetPlayer: { provenance: 'recovered-data', runtimeRole: 'player' },
  WarpGunPlayer: { provenance: 'recovered-data', runtimeRole: 'player' },`, file);

    // colorbox-gravity: ColorBox-class boxes outside the push-box list (ForceColorBox, incl. one a warp gun placed)
    // fall when unsupported, like the push-box family (FUN_7ff72bb3b5e0 -> FUN_7ff72bb34c40).
    source = replaceOnce(source, `  private colorBoxes: ColorBox[] = [];`, `  private colorBoxes: ColorBox[] = [];
  /** colorbox-gravity: fall speed (per second) of each ColorBox in colorBoxes. */
  private colorBoxFallVelocity = new Map<ColorBox, number>();`, file);
    source = replaceOnce(source, `    this.updateFallingPushBoxes(clampedDt);
`, `    this.updateFallingPushBoxes(clampedDt);
    this.updateFallingColorBoxes(clampedDt);
`, file);
    source = replaceOnce(source, `  private applyWarpAlls(): void {`, `  /**
   * colorbox-gravity: FUN_7ff72bb3b5e0 (the ColorBox-class update, ForceColorBox included) falls when the support
   * test FUN_7ff72bc13690 fails (FUN_7ff72bb34c40, the push-box family fall): 0.65 per tick per tick, stopping flush
   * on the map, any solid, a box or a cat below. The colour push rule is unchanged (a ForceColorBox has colour 8:
   * no slot matches, so it is never pushed).
   */
  private updateFallingColorBoxes(dt: number): void {
    if (!this.tileMap || this.colorBoxes.length === 0) return;
    const COLOR_BOX_GRAVITY = .65 * 60 * 60;
    const lowestY = this.tileMap.pixelHeight + 2880;
    for (const box of this.colorBoxes) {
      const boxRect = colorBoxRect(box);
      if (boxRect.y > lowestY) continue;
      const solids: Rect[] = [
        ...this.gates.filter((gate) => gate.isSolid()).map((gate) => gate.rect),
        ...this.stationaryActiveFallBoxRects(),
        ...this.staticRects
          .filter((staticRect) => staticRect.spawn.actorName !== 'PuzzlePredictProxy')
          .map((staticRect) => staticRect.rect),
        ...this.moveWalls.map((moveWall) => moveWall.rect),
        ...this.weightedLifts.map((weightedLift) => weightedLift.rect),
        ...this.bridges.filter((bridge) => bridge.isSolid()).map((bridge) => bridge.rect),
        ...this.blinkBlocks.filter((blinkBlock) => blinkBlock.solid).map((blinkBlock) => blinkBlock.rect),
        ...this.smallBoxes.map(smallBoxRect),
        ...this.normalBoxes.map(normalBoxRect),
        ...this.pushBoxes.map((pushBox) => pushBox.rect),
        ...this.colorBoxes.filter((other) => other !== box).map(colorBoxRect),
        ...this.jumpStands.map((jumpStand) => jumpStand.rect),
        // Only live cats below the box hold it up (side contact never suspends a fall, as for push boxes).
        ...this.players
          .filter((player) => player.deathTimer <= 0 && !this.deathFallPlayers.has(player)
            && !this.collisionChangePlayersCollisionOff.has(player) && !this.warpGunDisabledPlayers.has(player)
            && player.rect.y >= boxRect.y + boxRect.height - .001)
          .map((player) => player.rect),
      ];
      const blockedAt = (rect: Rect): boolean => {
        const body = { ...rect, x: rect.x + 1, width: rect.width - 2 };
        return this.tileMap!.rectHitsSolid(body) || solids.some((solid) => rectsOverlap(body, solid));
      };
      const moveBy = (deltaY: number): void => {
        box.spawn.y += deltaY;
        box.view.y += deltaY;
      };
      const resolveLanding = (from: number, span: number): number => {
        let low = 0, high = span;
        for (let pass = 0; pass < 20; pass += 1) {
          const middle = (low + high) / 2;
          if (blockedAt({ ...boxRect, y: boxRect.y + from + middle })) high = middle;
          else low = middle;
        }
        return low;
      };
      const supportStrip: Rect = {
        x: boxRect.x + .001,
        y: boxRect.y + boxRect.height + 0.001,
        width: boxRect.width - .002,
        height: 1,
      };
      if (blockedAt(supportStrip)) {
        const settle = resolveLanding(0, 1.002);
        if (settle > 0) moveBy(settle);
        this.colorBoxFallVelocity.set(box, 0);
        continue;
      }
      const velocityY = (this.colorBoxFallVelocity.get(box) ?? 0) + COLOR_BOX_GRAVITY * dt;
      const fall = velocityY * dt;
      let moved = 0;
      let landed = false;
      while (fall - moved > 1e-6) {
        const step = Math.min(2, fall - moved);
        if (blockedAt({ ...boxRect, y: boxRect.y + moved + step })) {
          moved += resolveLanding(moved, step);
          landed = true;
          break;
        }
        moved += step;
      }
      if (moved > 1e-6) moveBy(moved);
      this.colorBoxFallVelocity.set(box, landed ? 0 : velocityY);
    }
  }

  /** magnet-player: the aux (FUN_7ff72bb59090) drawn in the cat's hand: atlas (208, 496) 11 x 15 as {-11, -22.5, 22, 30}. */
  private createMagnetAuxiliary(owner: Player): void {
    if (this.magnetAuxiliaries.has(owner)) return;
    const auxiliary: MagnetAuxiliaryState = { owner, locked: false, view: new Container() };
    auxiliary.view.zIndex = WARP_GUN_AUXILIARY_DEPTH;
    const texture = frameTexture('magnet_auxiliary');
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.x = -11;
      sprite.y = -22.5;
      sprite.scale.set(22 / texture.orig.width, 30 / texture.orig.height);
      auxiliary.view.addChild(sprite);
    } else {
      const graphic = new Graphics();
      graphic.beginFill(0xd84a4a, 1);
      graphic.drawRect(-11, -22.5, 22, 30);
      graphic.endFill();
      auxiliary.view.addChild(graphic);
    }
    this.magnetAuxiliaries.set(owner, auxiliary);
    this.syncMagnetAuxiliary(auxiliary);
    this.actorLayer.addChild(auxiliary.view);
  }

  /** magnet-player: vtable slot 27 FUN_7ff72bb59e50: the aux copies the cat position (+-20, -10) and visibility. */
  private syncMagnetAuxiliary(auxiliary: MagnetAuxiliaryState): void {
    const owner = auxiliary.owner;
    const origin = this.magnetOrigin(owner);
    const facing = owner.getFacingDirection();
    auxiliary.view.x = origin.x + facing * MAGNET_AUX_OFFSET_X;
    auxiliary.view.y = origin.y + MAGNET_AUX_OFFSET_Y;
    auxiliary.view.scale.set(facing, 1);
    auxiliary.view.visible = owner.view.visible !== false;
  }

  /** magnet-player: the native origin: a cat's centre x / feet y (body bottom + 1); a box's bottom centre. */
  private magnetOrigin(body: Player | PushBox): { x: number; y: number } {
    if (body instanceof Player) {
      return { x: body.rect.x + PLAYER_RECT_CENTER_OFFSET_X, y: body.rect.y + PLAYER_RECT_CENTER_OFFSET_Y };
    }
    return { x: body.rect.x + body.rect.width / 2, y: body.rect.y + body.rect.height };
  }

  /** magnet-player: the field body {20, -50, 110, 80} at aux = cat + (20, -10): {cat.x + 40, cat.y - 60, 110, 80};
   *  facing left the aux sits at cat + (-170, -10): {cat.x - 150, cat.y - 60, 110, 80} (body not mirrored). */
  private magnetField(owner: Player): Rect {
    const origin = this.magnetOrigin(owner);
    const left = owner.getFacingDirection() > 0
      ? origin.x + MAGNET_FIELD_NEAR
      : origin.x - MAGNET_FIELD_NEAR - MAGNET_FIELD_WIDTH;
    return { x: left, y: origin.y + MAGNET_FIELD_TOP, width: MAGNET_FIELD_WIDTH, height: MAGNET_FIELD_HEIGHT };
  }

  /**
   * magnet-player: contact callback FUN_7ff72bb5a180: every body touching the field, at most 8 (aux+0x520). Cats
   * (body +4 == 1) other than its own, and the box family (DAT_7ff72c62a10f, FUN_7ff72bb34e10: PushBox and
   * Normal / Small / Tall / Big Box; a ColorBox is another class); everything else is ignored. Angle filter:
   * d = normalize(target - cat), |d.y| < sin(2.0) = 0.909.
   */
  private magnetFieldList(owner: Player): Array<Player | PushBox> {
    const field = this.magnetField(owner);
    const origin = this.magnetOrigin(owner);
    const accepts = (body: Player | PushBox): boolean => {
      if (!rectsOverlap(field, body.rect)) return false;
      const point = this.magnetOrigin(body);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const length = Math.hypot(dx, dy);
      return length > 0 && Math.abs(dy / length) < MAGNET_ANGLE_LIMIT;
    };
    const list: Array<Player | PushBox> = [];
    for (const cat of this.players) {
      if (cat === owner) continue;
      if (cat.deathTimer > 0 || this.deathFallPlayers.has(cat)) continue;
      if (this.warpGunDisabledPlayers.has(cat) || this.collisionChangePlayersCollisionOff.has(cat)) continue;
      if (accepts(cat)) list.push(cat);
    }
    for (const box of this.pushBoxes) {
      if (box.colorIndex !== undefined) continue;
      if (accepts(box)) list.push(box);
    }
    return list.slice(0, MAGNET_FIELD_LIST_MAX);
  }

  /** magnet-player: command 0x1e(1). A cat accepts (FUN_7ff72bb6fd20: input skipped, velocity 0, no gravity
   *  FUN_7ff72bb691d0); a box accepts (FUN_7ff72bb33d00: +0x400 bit 2 freezes push / fall, velocity 0). Both
   *  handlers accept unconditionally, so a body another magnet already holds is grabbed too; the held state is ONE
   *  flag on the target (set by any grab, cleared by any release). */
  private grabMagnetTarget(auxiliary: MagnetAuxiliaryState, target: Player | PushBox): boolean {
    if (target instanceof Player) {
      this.magnetHeldPlayers.add(target);
      target.velocity = { x: 0, y: 0 };
      target.grounded = false;
    } else {
      this.magnetHeldBoxes.add(target);
      target.velocityY = 0;
      target.falling = false;
      target.hopping = false;
      target.launchX = 0;
    }
    auxiliary.target = target;
    auxiliary.locked = false;
    return true;
  }

  /** magnet-player: command 0x1e(0): the target's velocity is zeroed (it drops straight down), a cat gets its
   *  gravity back, the lock clears and the holder can turn again. */
  private releaseMagnetTarget(auxiliary: MagnetAuxiliaryState): void {
    const target = auxiliary.target;
    auxiliary.target = undefined;
    auxiliary.locked = false;
    auxiliary.owner.facingLocked = false;
    if (!target) return;
    if (target instanceof Player) {
      this.magnetHeldPlayers.delete(target);
      target.velocity = { x: 0, y: 0 };
      return;
    }
    this.magnetHeldBoxes.delete(target);
    target.velocityY = 0;
  }

  /**
   * magnet-player: hold point FUN_7ff72bb5a2d0 and the pull. The target's origin heads for the holder's feet level
   * with its near edge 30 in front of the holder. d = hold - (target + vOwner), vOwner = the holder's motion this
   * tick once locked (else 0); gains (0.03, 0.08) unlocked / (0.06, 0.16) locked; |dx| > 1 -> sign * max(2, gx|dx|)
   * else dx (snap), y likewise with 2; both snapped -> locked. No push into a wall / ceiling the target touches
   * (FUN_7ff72bb5b630). The target moves once, kinematically (its own update is frozen), by vOwner + v swept
   * against the map. Lock break: a locked target more than 32 from the hold point (DAT_7ff72bc7d7f8) unlocks.
   */
  private pullMagnetTarget(auxiliary: MagnetAuxiliaryState, holderStart: Rect | undefined): void {
    const owner = auxiliary.owner;
    const target = auxiliary.target;
    if (!target) return;
    const origin = this.magnetOrigin(owner);
    const halfWidth = target.rect.width / 2;
    const hold = {
      x: owner.getFacingDirection() > 0 ? origin.x + MAGNET_HOLD_GAP + halfWidth : origin.x - MAGNET_HOLD_GAP - halfWidth,
      y: origin.y,
    };
    const point = this.magnetOrigin(target);
    if (auxiliary.locked && Math.hypot(hold.x - point.x, hold.y - point.y) > MAGNET_LOCK_BREAK) auxiliary.locked = false;
    const carry = auxiliary.locked && holderStart
      ? { x: owner.rect.x - holderStart.x, y: owner.rect.y - holderStart.y }
      : { x: 0, y: 0 };
    const dx = hold.x - (point.x + carry.x);
    const dy = hold.y - (point.y + carry.y);
    const gainX = auxiliary.locked ? MAGNET_GAIN_LOCKED_X : MAGNET_GAIN_UNLOCKED_X;
    const gainY = auxiliary.locked ? MAGNET_GAIN_LOCKED_Y : MAGNET_GAIN_UNLOCKED_Y;
    const pull = (delta: number, gain: number, snap: number): number => (
      Math.abs(delta) > snap ? Math.sign(delta) * Math.max(MAGNET_MIN_SPEED, gain * Math.abs(delta)) : delta
    );
    let velocityX = pull(dx, gainX, MAGNET_SNAP_X);
    let velocityY = pull(dy, gainY, MAGNET_SNAP_Y);
    if (Math.abs(dx) <= MAGNET_SNAP_X && Math.abs(dy) <= MAGNET_SNAP_Y) auxiliary.locked = true;
    const rect = target.rect;
    const solids = this.magnetTargetSolids(target);
    const touches = (probe: Rect): boolean => (this.tileMap?.rectHitsSolid(probe) ?? false)
      || solids.some((solid) => rectsOverlap(probe, solid));
    if (velocityX !== 0 && touches({ x: rect.x + Math.sign(velocityX), y: rect.y + .5, width: rect.width, height: rect.height - 1 })) {
      velocityX = 0;
    }
    if (velocityY < 0 && touches({ x: rect.x + .5, y: rect.y - 1, width: rect.width - 1, height: rect.height })) {
      velocityY = 0;
    }
    const move = { x: carry.x + velocityX, y: carry.y + velocityY };
    const swept = this.tileMap
      ? moveRectWithTileCollisions(this.tileMap, rect, move).rect
      : { ...rect, x: rect.x + move.x, y: rect.y + move.y };
    const next = sweepRectAgainstSolids(rect, swept.x - rect.x, swept.y - rect.y, solids);
    if (target instanceof Player) {
      target.applyResolvedCollision(next, { x: velocityX * 60, y: velocityY * 60 }, false);
    } else {
      target.applyRect(next);
      // FUN_7ff72bb35190: the pull is also the target's velocity (frozen while held; zeroed on release).
      target.velocityY = velocityY * 60;
    }
  }

  /** magnet-player: the solid actor bodies a pulled target meets (FUN_7ff72bc13690 with param_3 != 0 reads the
   *  actor contacts at body +0xa0 as well as the map): Rects, gates, bridges, lifts, walls, blink blocks, FallBoxes,
   *  jump stands, every box and every live cat but the target itself. */
  private magnetTargetSolids(target: Player | PushBox): Rect[] {
    return [
      ...this.staticRects
        .filter((staticRect) => staticRect.spawn.actorName !== 'PuzzlePredictProxy')
        .map((staticRect) => staticRect.rect),
      ...this.gates.filter((gate) => gate.isSolid()).map((gate) => gate.rect),
      ...this.bridges.filter((bridge) => bridge.isSolid()).map((bridge) => bridge.rect),
      ...this.weightedLifts.map((lift) => lift.rect),
      ...this.moveWalls.map((wall) => wall.rect),
      ...this.blinkBlocks.filter((blinkBlock) => blinkBlock.solid).map((blinkBlock) => blinkBlock.rect),
      ...this.stationaryActiveFallBoxRects(),
      ...this.jumpStands.map((jumpStand) => jumpStand.rect),
      ...this.smallBoxes.map(smallBoxRect),
      ...this.normalBoxes.map(normalBoxRect),
      ...this.colorBoxes.map(colorBoxRect),
      ...this.pushBoxes.filter((box) => box !== target).map((box) => box.rect),
      ...this.players
        .filter((cat) => cat !== target && cat.deathTimer <= 0 && !this.deathFallPlayers.has(cat)
          && !this.collisionChangePlayersCollisionOff.has(cat) && !this.warpGunDisabledPlayers.has(cat))
        .map((cat) => cat.rect),
    ];
  }

  /**
   * magnet-player: one update of every MagnetPlayer aux, after the cats moved. Input FUN_7ff72bb59530: ON while
   * input bit 11 is HELD (the toggle variant needs DAT_7ff72c6301b0 != 0; it is 0). Off, an inactive holder, or a
   * target that left the field list: release. On with no target: the field list sorted by squared distance to the
   * cat (stable), the first to accept becomes the target. Then the pull. The holder's facing is frozen while it
   * holds (+0x90 bit 4 cleared).
   */
  private updateMagnets(input: InputState, playerInputs: readonly InputState[] | undefined): void {
    for (const [owner, auxiliary] of this.magnetAuxiliaries) {
      const index = this.players.indexOf(owner);
      const active = index >= 0
        && owner.deathTimer <= 0
        && !this.deathFallPlayers.has(owner)
        && !this.warpGunDisabledPlayers.has(owner);
      const slot = this.playerInputSlots[index] ?? index;
      const on = active && !!this.resolvePlayerInput(input, playerInputs, this.players.length, index, slot).action;
      if (!on) {
        this.releaseMagnetTarget(auxiliary);
        this.syncMagnetAuxiliary(auxiliary);
        continue;
      }
      const list = this.magnetFieldList(owner);
      if (auxiliary.target && !list.includes(auxiliary.target)) this.releaseMagnetTarget(auxiliary);
      if (!auxiliary.target) {
        const origin = this.magnetOrigin(owner);
        const ranked = list.map((body, order) => {
          const point = this.magnetOrigin(body);
          return { body, order, distance: (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2 };
        }).sort((a, b) => a.distance - b.distance || a.order - b.order);
        for (const { body } of ranked) {
          if (this.grabMagnetTarget(auxiliary, body)) break;
        }
      }
      if (auxiliary.target) this.pullMagnetTarget(auxiliary, this.frameStartPlayerRects[index]);
      owner.facingLocked = !!auxiliary.target;
      this.syncMagnetAuxiliary(auxiliary);
    }
  }

  private applyWarpAlls(): void {`, file);
    // magnet-player: replaces the invented MoveEnergy pull (radius 112) / collect radius 56 (no caller, no native source).
    source = replaceOnce(source, `const MAGNET_MOVE_ENERGY_PULL_RADIUS = 112;
const MAGNET_MOVE_ENERGY_PULL_SPEED = 240;
`, `// magnet-player (spec b13): aux FUN_7ff72bb59090 / FUN_7ff72bb59e50, pull FUN_7ff72bb5a2d0.
const MAGNET_AUX_OFFSET_X = 20;
const MAGNET_AUX_OFFSET_Y = -10;
const MAGNET_FIELD_NEAR = 40;
const MAGNET_FIELD_TOP = -60;
const MAGNET_FIELD_WIDTH = 110;
const MAGNET_FIELD_HEIGHT = 80;
const MAGNET_FIELD_LIST_MAX = 8;
const MAGNET_ANGLE_LIMIT = Math.sin(2.0);
const MAGNET_HOLD_GAP = 30;
const MAGNET_GAIN_UNLOCKED_X = 0.03;
const MAGNET_GAIN_UNLOCKED_Y = 0.08;
const MAGNET_GAIN_LOCKED_X = 0.06;
const MAGNET_GAIN_LOCKED_Y = 0.16;
const MAGNET_SNAP_X = 1;
const MAGNET_SNAP_Y = 2;
const MAGNET_MIN_SPEED = 2;
const MAGNET_LOCK_BREAK = 32;
`, file);
    {
      const start = source.indexOf('  private pullMoveEnergyTowardMagnetPlayer(');
      const end = source.indexOf('  private collectKeys(\n');
      assert(start > 0 && end > start && end - start < 2000, 'Patch anchor changed: GameRuntime.ts dead MoveEnergy magnet code');
      const dead = source.slice(start, end);
      assert(dead.includes('private playerCanCollectMoveEnergy(') && !source.slice(0, start).includes('pullMoveEnergyTowardMagnetPlayer(')
        && !source.slice(end).includes('pullMoveEnergyTowardMagnetPlayer(') && !source.slice(end).includes('playerCanCollectMoveEnergy('),
      'Patch anchor changed: GameRuntime.ts MoveEnergy magnet code gained a caller');
      source = source.slice(0, start) + source.slice(end);
    }
    source = replaceOnce(source, `interface WarpGunAuxiliaryState {
  owner: Player;
  tint: number;
  view: Container;
}`, `interface WarpGunAuxiliaryState {
  owner: Player;
  tint: number;
  view: Container;
}
/** magnet-player: the MagnetPlayer aux (FUN_7ff72bb59090): target +0x518, lock bit +0x3f8 bit 1. */
interface MagnetAuxiliaryState {
  owner: Player;
  target?: Player | PushBox;
  locked: boolean;
  view: Container;
}`, file);
    source = replaceOnce(source, `  private magnetPlayers = new Set<Player>();`, `  private magnetPlayers = new Set<Player>();
  private magnetAuxiliaries = new Map<Player, MagnetAuxiliaryState>();
  /** magnet-player: cats / boxes a magnet holds (input skipped, no gravity / push and fall frozen). */
  private magnetHeldPlayers = new Set<Player>();
  private magnetHeldBoxes = new Set<PushBox>();`, file);
    source = replaceOnce(source, `    this.magnetPlayers.clear();
`, `    this.magnetPlayers.clear();
    this.magnetAuxiliaries.clear();
    this.magnetHeldPlayers.clear();
    this.magnetHeldBoxes.clear();
    this.colorBoxFallVelocity.clear();
`, file);
    source = replaceOnce(source, `      this.createWarpGunAuxiliary(player);
    }
  }
`, `      this.createWarpGunAuxiliary(player);
    }
    // magnet-player: factory branch 0x7ff72bb72d33 attaches the aux (FUN_7ff72bb59390, cat slot 0).
    if (spawn.actorName === 'MagnetPlayer') {
      this.createMagnetAuxiliary(player);
    }
  }
`, file);
    // magnet-player: a held cat's input is skipped entirely (FUN_7ff72bb6f0e0 line 57) and it has no gravity: its
    // own update does not run; it is still an ordinary body for every contact (keys, Thunder, goals need UP: no).
    source = replaceOnce(source, `      if (playerInput.resetPressed) {
        this.resetPlayerToSpawn(this.player, index, this.eventInputSlotForPlayer(this.player, playerInputSlot));
        continue;
      }`, `      if (playerInput.resetPressed) {
        this.resetPlayerToSpawn(this.player, index, this.eventInputSlotForPlayer(this.player, playerInputSlot));
        continue;
      }
      const magnetHeld = this.magnetHeldPlayers.has(this.player);
      if (magnetHeld) {
        resolvedPlayerInput = {
          ...resolvedPlayerInput,
          left: false,
          right: false,
          up: false,
          down: false,
          jump: false,
          jumpPressed: false,
          action: false,
          actionPressed: false,
        };
      }`, file);
    source = replaceOnce(source, `      if (this.collisionChangePlayersCollisionOff.has(this.player)) {
        this.updateCollisionOffPlayer(clampedDt, activePlayerInput);
      } else {
        this.player.update(clampedDt, activePlayerInput, this.tileMap);
      }`, `      if (this.collisionChangePlayersCollisionOff.has(this.player)) {
        this.updateCollisionOffPlayer(clampedDt, activePlayerInput);
      } else if (magnetHeld) {
        // magnet-player: the magnet moves it (pullMagnetTarget), once per tick.
      } else {
        this.player.update(clampedDt, activePlayerInput, this.tileMap);
      }`, file);
    source = replaceOnce(source, `    this.layoutBreakoutPaddles();
    this.updateGhosts(ghostPreKeyTarget);`, `    // magnet-player: every aux after the cats moved (the pull reads the holder's motion this tick).
    this.updateMagnets(input, playerInputs);
    this.layoutBreakoutPaddles();
    this.updateGhosts(ghostPreKeyTarget);`, file);
    // magnet-player: a held box's push and fall logic is frozen (+0x400 bit 2, FUN_7ff72bb33d00).
    source = replaceOnce(source, `        const box = this.pushBoxes[index];
        const pushedRect = previousPushBoxRects[chain ? chain.lead : index];`, `        const box = this.pushBoxes[index];
        if (box && this.magnetHeldBoxes.has(box)) return false;
        const pushedRect = previousPushBoxRects[chain ? chain.lead : index];`, file);
    source = replaceOnce(source, `    for (let i = 0; i < this.pushBoxes.length; i += 1) {
      const box = this.pushBoxes[i];
      const nativeJumpBoxes = true;`, `    for (let i = 0; i < this.pushBoxes.length; i += 1) {
      const box = this.pushBoxes[i];
      if (this.magnetHeldBoxes.has(box)) {
        box.falling = false;
        box.velocityY = 0;
        continue;
      }
      const nativeJumpBoxes = true;`, file);
    // magnet-player + optional-teacher-cats: a leaving cat that holds, or is held by, a magnet is released first.
    source = replaceOnce(source, `    const held = this.warpGunSelectedPlayers.get(player);
    if (held instanceof Player) {`, `    for (const auxiliary of this.magnetAuxiliaries.values()) {
      if (auxiliary.owner === player || auxiliary.target === player) this.releaseMagnetTarget(auxiliary);
    }
    const held = this.warpGunSelectedPlayers.get(player);
    if (held instanceof Player) {`, file);
    // warp-gun-player: a held cat has its collision bit off (message 0xe value 0), so it never blocks a cat.
    source = replaceOnce(source, `        this.collisionChangePlayersCollisionOff.has(this.player)
        || this.collisionChangePlayersCollisionOff.has(otherPlayer)
      ) {`, `        this.collisionChangePlayersCollisionOff.has(this.player)
        || this.collisionChangePlayersCollisionOff.has(otherPlayer)
        || this.warpGunDisabledPlayers.has(this.player)
        || this.warpGunDisabledPlayers.has(otherPlayer)
      ) {`, file);
    // puzzle-proxies-netcode-only: class 0x2a has no body and no view offline.
    source = replaceOnce(source, `    PuzzlePredictProxy: (spawn) => {
      const staticRect = new StaticRect(spawn);
      this.staticRects.push(staticRect);
      this.addActorView(spawn, staticRect.view);
    },`, `    PuzzlePredictProxy: (_spawn) => {
      // puzzle-proxies-netcode-only: online prediction of remote Blocks; offline no body and no view.
    },`, file);
    // puzzle-tetris: the Puzzle row owns the sub-stage; Blocks are its cells, never main-stage push boxes.
    source = replaceOnce(source, `    Puzzle: (spawn) => {
      this.hasPuzzleController = true;
    },
    Block: (spawn) => {
      const pushBox = Object.assign(new PushBox(spawn.x, spawn.y), { spawn });
      this.pushBoxes.push(pushBox);
      this.actorLayer.addChild(pushBox.view);
    },`, `    Puzzle: (spawn) => {
      this.hasPuzzleController = true;
      // puzzle-tetris: the sub-stage is built once every createTable row is in (setupPuzzle).
      this.puzzleRows.push(spawn);
    },
    Block: (_spawn) => {
      // puzzle-proxies-netcode-only: a Block is a Puzzle sub-stage piece (puzzle-tetris), not a PushBox.
    },`, file);
    // puzzle-proxies-netcode-only: puzzle.createTable rows belong to the sub-stage.
    source = replaceOnce(source, `    for (const spawn of resolvedStage.puzzle?.createTable ?? []) {
      this.addSpawn(spawn);
    }
`, `    // puzzle-proxies-netcode-only: puzzle.createTable rows are the sub-stage's Blocks (puzzle-tetris), not main actors.
`, file);
    // puzzle-tetris: build the sub-stage after the cats exist (setup FUN_7ff72bb4c420 broadcasts 0x1a to them).
    source = replaceOnce(source, `    // Now that the live player count is final, draw each numbered box's resting`, `    const puzzleRow = this.puzzleRows[0];
    if (puzzleRow && resolvedStage.puzzle?.map) this.setupPuzzle(puzzleRow, resolvedStage.puzzle);

    // Now that the live player count is final, draw each numbered box's resting`, file);
    // puzzle-tetris: per-load reset.
    source = replaceOnce(source, `    this.hasPuzzleController = false;
`, `    this.hasPuzzleController = false;
    this.puzzle = null;
    this.puzzleRows = [];
`, file);
    // puzzle-tetris: state fields and the pure generator preview.
    source = replaceOnce(source, `  private hasPuzzleController = false;
`, `  private hasPuzzleController = false;
  /** puzzle-tetris: the Puzzle sub-stage (readable state for solvers / tests); null on other stages. */
  puzzle: PuzzleTetris | null = null;
  private puzzleRows: ActorSpawnDef[] = [];

  /** puzzle-tetris: the pieces (0 = L, 1 = I) the native generator hands out for a seed, in draw order. Pure. */
  static puzzlePieceSequence(seed: number, count: number): number[] {
    return puzzlePieceSequence(seed, count);
  }
`, file);
    // puzzle-proxies-netcode-only: no proxy-occupancy clear.
    source = replaceOnce(source, `      this.checkPuzzlePredictProxies();
`, ``, file);
    // puzzle-proxies-netcode-only: the invented instant clear is deleted; puzzle-tetris: the sub-stage driver.
    source = replaceOnce(source, `  private checkPuzzlePredictProxies(): void {
    if (!this.stage || !this.hasPuzzleController || !this.player) return;
    const puzzleBlockLabels = new Set(
      (this.stage.puzzle?.createTable ?? [])
        .filter((spawn) => spawn.actorName === 'Block')
        .map((spawn) => spawn.label)
        .filter((label) => label.length > 0),
    );
    const proxyOccupancyTargets = this.staticRects
      .filter((staticRect) => staticRect.spawn.actorName === 'PuzzlePredictProxy')
      .map((staticRect) => ({
        rect: staticRect.rect,
        targetLabel: puzzlePredictProxyTargetLabel(staticRect.spawn, puzzleBlockLabels),
      }));
    if (proxyOccupancyTargets.length === 0) return;
    const occupants: Array<{ rect: Rect; label?: string }> = [
      ...this.players
        .filter((player) => (
          !this.collisionChangePlayersCollisionOff.has(player)
          && !this.activelyGuardingPlayers.has(player)
        ))
        .map((player) => ({ rect: player.rect })),
      ...this.pushBoxes.map((box) => ({ rect: box.rect, label: box.spawn.label })),
      ...this.normalBoxes
        .map((box) => ({ rect: normalBoxRect(box), label: box.spawn.label })),
      ...this.smallBoxes.map((box) => ({ rect: smallBoxRect(box), label: box.spawn.label })),
    ];
    const usedOccupants = new Set<number>();
    const allTargetsOccupied = proxyOccupancyTargets.every((target) => {
      const occupantIndex = occupants.findIndex((occupant, index) => {
        if (usedOccupants.has(index)) return false;
        if (target.targetLabel && occupant.label !== target.targetLabel) return false;
        return rectsOverlap(occupant.rect, target.rect);
      });
      if (occupantIndex < 0) return false;
      usedOccupants.add(occupantIndex);
      return true;
    });
    if (!allTargetsOccupied) return;

    this.cleared = true;
    this.showClearOverlay();
    this.onEvent?.({ type: 'clear', playerIndex: this.currentInputPlayerIndex() });
    this.emitStats();
  }

`, `  /**
   * puzzle-tetris: the Puzzle row (p0 sub-stage path, p1 target actor name, p2 lines to clear; p3 / p4 are never read
   * by the factory branch 0x7ff72bb75eed..0x7ff72bb75f77) builds its sub-stage (FUN_7ff72bb4be20, mode 1 trominoes;
   * target default 5 from the ctor). Setup FUN_7ff72bb4c420 broadcasts 0x1a: every cat loses its activity credit
   * (+0x430, FUN_7ff72bb69440) and ignores its buttons until the win's 0x1b.
   * RNG decision: native seeds its generator once per stage start (FUN_7ff72bb28f60 -> FUN_7ff72bb9d2f0) from the
   * host clock, shared to clients in the session snapshot; only the seed parity matters for mode-1 pieces. The port
   * seeds it here from ONE draw of the runtime's seeded random (Math.random is the per-stage relay-seeded xorshift),
   * so the seed travels with the stage journal: 16 init draws (2 per Block x 8, createTable order), then 1 per respawn.
   */
  private setupPuzzle(row: ActorSpawnDef, definition: NonNullable<StageDef['puzzle']>): void {
    const party = Math.max(2, Math.trunc(this.nativePartyCount()));
    const targetParam = row.raw[8];
    const target = typeof targetParam === 'number' && Number.isFinite(targetParam) ? Math.trunc(targetParam) : 5;
    const targetName = typeof row.raw[7] === 'string' ? row.raw[7] : '';
    const seed = Math.floor(Math.random() * 4294967296) >>> 0;
    this.puzzle = new PuzzleTetris(definition, party, target, targetName, seed, row.x, row.y);
    this.actorLayer.addChild(this.puzzle.view);
    // +0x430 starts at its maximum +0x42c = 1 (the port's Roulette activity credit model); 0x1a takes one.
    if (this.roulettePlayerActivityBudgets.length === 0) {
      this.roulettePlayerActivityBudgets = this.players.map(() => ({ maximum: 1, current: 1 }));
    }
    for (const budget of this.roulettePlayerActivityBudgets) budget.current = Math.max(0, budget.current - 1);
  }

  /**
   * puzzle-tetris: one Puzzle update (FUN_7ff72bb4c0b0). A win stops the sub-stage (still drawn, "OK"), sends
   * message 9 to the target ("Key": FUN_7ff72bb65700 shows the hidden Key) and broadcasts 0x1b (credit back).
   * A fail (every active Block blocked) raises the stage fail flag 2 (vtable +0xf8 FUN_7ff72bb60000): restart.
   * Returns true when the stage restarted.
   */
  private stepPuzzle(dt: number, input: InputState, playerInputs?: readonly InputState[]): boolean {
    const puzzle = this.puzzle;
    if (!puzzle || puzzle.stopped) return false;
    const inputs = puzzle.blocks.map((block) => this.puzzleBlockInput(block.player, input, playerInputs));
    const result = puzzle.tick(dt, inputs);
    if (result === 'failed') {
      this.restartBreakoutStage();
      return true;
    }
    if (result !== 'won') return false;
    for (const key of this.keys) {
      if (key.spawn.actorName === puzzle.targetName) key.activate();
    }
    this.refreshKeyGoalViews();
    for (const budget of this.roulettePlayerActivityBudgets) {
      budget.current = Math.min(budget.maximum, budget.current + 1);
    }
    return false;
  }

  /** puzzle-tetris: a Block is steered by pad idx (FUN_7ff72bb137f0 / FUN_7ff72bc28ce0 read pad +0x90): input slot idx. */
  private puzzleBlockInput(slot: number, input: InputState, playerInputs?: readonly InputState[]): InputState {
    const catIndex = this.playerInputSlots.indexOf(slot);
    if (catIndex >= 0) return this.resolvePlayerInput(input, playerInputs, this.players.length, catIndex, slot);
    if (playerInputs && playerInputs.length > 0) return playerInputs[slot] ?? NEUTRAL_INPUT;
    return slot === 0 ? input : NEUTRAL_INPUT;
  }

`, file);
    // puzzle-proxies-netcode-only: its label helper goes with it.
    source = replaceOnce(source, `function puzzlePredictProxyTargetLabel(spawn: ActorSpawnDef, puzzleBlockLabels: ReadonlySet<string>): string | undefined {
  if (puzzleBlockLabels.size === 0) return undefined;
  return spawn.raw.find((value): value is string => typeof value === 'string' && value.startsWith('Block'));
}

`, ``, file);
    // puzzle-tetris: the Puzzle row follows the Player rows in createTable: its sub-stage ticks after the cats.
    source = replaceOnce(source, `    this.updateMagnets(input, playerInputs);
`, `    // puzzle-tetris: one Puzzle update per tick; a fail restarts the stage.
    if (this.puzzle && this.stepPuzzle(clampedDt, input, playerInputs)) return;
    this.updateMagnets(input, playerInputs);
`, file);
    // puzzle-tetris / puzzle-tetris-draw: the sub-stage, its Blocks and the native generator.
    source += `
// ---------------------------------------------------------------------------------------------------------------
// puzzle-tetris (spec b14/spec-puzzle.md): the Puzzle sub-stage of 8-1 / 8-3, a co-op falling-tromino well.
// Cell codes (FUN_7ff72bb12f60): 1 empty, 0x1a + colour a falling piece cell, 0x24 + colour a landed one.
const PUZZLE_EMPTY = 1;
const PUZZLE_FALLING = 0x1a;
const PUZZLE_LANDED = 0x24;
// The map loader FUN_7ff72bc27dc0 stores the chip value itself (stage_common.lua lines 31-64).
const PUZZLE_CHIP_CODES: Readonly<Record<string, number>> = {
  MC_INV: 0, MC_NON: 1, MC_BLK: 2, MC_FLC: 3, MC_FLL: 4, MC_FLR: 5, MC_CEC: 6, MC_CEL: 7, MC_CER: 8, MC_WAL: 9,
  MC_WAR: 10, MC_INC: 11, MC_ILU: 12, MC_IRU: 13, MC_ILD: 14, MC_IRD: 15, MC_IUP: 16, MC_IDW: 17, MC_ILE: 18,
  MC_IRG: 19, MC_BHU: 20, MC_BHC: 21, MC_BHD: 22, MC_BWL: 23, MC_BWC: 24, MC_BWR: 25, MC_DLU: 26, MC_DLD: 27,
  MC_DRU: 28, MC_DRD: 29, MC_BR1: 30, MC_BR2: 31, MC_BR3: 32, MC_BR4: 33, MC_BR5: 34,
};
// Tetris mode 1 piece table DAT_7ff72c62a330 (FUN_7ff72bb142d0(., 1)): {rotatable, spawnable, cells (dx, dy)}.
// 0 = the L tromino, 1 = the I tromino; the pivot (0, 0) sits on the Block position.
export const PUZZLE_PIECES: ReadonlyArray<{
  readonly name: string;
  readonly rotatable: boolean;
  readonly spawnable: boolean;
  readonly cells: ReadonlyArray<readonly [number, number]>;
}> = [
  { name: 'L', rotatable: true, spawnable: true, cells: [[0, 0], [0, 1], [1, 0]] },
  { name: 'I', rotatable: true, spawnable: true, cells: [[-1, 0], [0, 0], [1, 0]] },
];
// FUN_7ff72bb16f00 defaults when the Lua leaves them out: fallTime = floor = 1.0 (DAT_7ff72bd4f700) and the
// table DAT_7ff72bd4f6c8 {lines threshold, seconds}.
const PUZZLE_DEFAULT_FALL_TIME = 1.0;
const PUZZLE_DEFAULT_FALL_TABLE: ReadonlyArray<readonly [number, number]> = [
  [10, 0.8], [20, 0.6], [30, 0.4], [40, 0.39], [50, 0.37], [60, 0.35], [70, 0.33],
];
// DOWN while grounded is ignored for this long after landing (DAT_7ff72bc819a8).
const PUZZLE_DOWN_GRACE = Math.fround(0.12);
// Key repeat: the Tetris map loader FUN_7ff72bb17090 sets the first delay DAT_7ff72c61fb30 = 134 ms offline
// (DAT_7ff72bc82150); the repeat interval DAT_7ff72c61fb34 = 66 ms. Device rule FUN_7ff72bbd2ce0.
const PUZZLE_REPEAT_DELAY_MS = 134;
const PUZZLE_REPEAT_INTERVAL_MS = 66;
// "OK" (DAT_7ff72bcb9e38) is printed at (640, 300) (DAT_7ff72bc7d8ac / DAT_7ff72bc7daa8) by FUN_7ff72bb4c290.
const PUZZLE_OK_X = 640;
const PUZZLE_OK_Y = 300;
// The counter / OK font: size 48 (FUN_7ff72bb17320); colour untraced, the runtime's text colour is used.
const PUZZLE_TEXT_SIZE = 48;
const PUZZLE_TEXT_COLOR = 0xff864d;

/**
 * puzzle-tetris: the one global subtractive generator (Knuth / Numerical Recipes ran3 without MBIG / abs), uint32.
 * Seed FUN_7ff72bba81c0, refill FUN_7ff72bba8840, draw FUN_7ff72bba8a90 (wrapper FUN_7ff72bb9d380).
 */
export class PuzzleRandom {
  private a = new Uint32Array(56);
  private index = 55;

  constructor(seed: number) {
    const a = this.a;
    const s = seed >>> 0;
    a[55] = s;
    let mj = s;
    let mk = 1;
    for (let i = 1; i <= 54; i += 1) {
      const ii = (21 * i) % 55;
      a[ii] = mk;
      mk = (mj - mk) >>> 0;
      mj = a[ii];
    }
    this.refill();
    this.refill();
    this.refill();
    this.index = 55;
  }

  private refill(): void {
    const a = this.a;
    for (let i = 1; i <= 24; i += 1) a[i] = a[i] - a[i + 31];
    for (let i = 25; i <= 55; i += 1) a[i] = a[i] - a[i - 24];
  }

  nextU32(): number {
    this.index += 1;
    if (this.index > 55) {
      this.refill();
      this.index = 1;
    }
    return this.a[this.index];
  }

  /** FUN_7ff72bb9d380(n): 0 when n == 0, else a uint32 draw mod (n + 1). */
  below(n: number): number {
    if (n === 0) return 0;
    return this.nextU32() % (n + 1);
  }

  clone(): PuzzleRandom {
    const copy = new PuzzleRandom(0);
    copy.a = new Uint32Array(this.a);
    copy.index = this.index;
    return copy;
  }
}

/** FUN_7ff72bb14810 / FUN_7ff72bb148c0 / FUN_7ff72bb14420: k = below(count - 1); a non-spawnable k redraws once. */
function pickPuzzlePiece(random: PuzzleRandom): number {
  let piece = random.below(PUZZLE_PIECES.length - 1);
  if (!PUZZLE_PIECES[piece].spawnable) piece = random.below(PUZZLE_PIECES.length - 1);
  return piece;
}

/** puzzle-tetris: the piece sequence a seed produces (pure: one draw per piece in mode 1). */
export function puzzlePieceSequence(seed: number, count: number): number[] {
  const random = new PuzzleRandom(seed);
  return Array.from({ length: count }, () => pickPuzzlePiece(random));
}

interface PuzzleRepeatState {
  held: boolean;
  acc: number;
  flags: number;
}

const newPuzzleRepeatState = (): PuzzleRepeatState => ({ held: false, acc: 0, flags: 0 });

/** puzzle-tetris: one Block (base ctor FUN_7ff72bb124b0, Tetris ctor FUN_7ff72bb142d0, 0x1e0 bytes). */
export class PuzzleBlock {
  x: number;
  y: number;
  rotation = 0;
  piece = 0;
  next = 0;
  shape: Array<[number, number]> = [];
  /** +0xb0: the code its cells were last written with (1 erased, 0x1a falling, 0x24 landed). */
  code = PUZZLE_FALLING;
  fallTimer = 0;
  /** +0xa0; the ctor value is untraced (0 assumed): only the DOWN grace test reads it before the first drop. */
  lockTimer = 0;
  blocked = false;
  readonly repeat = { left: newPuzzleRepeatState(), right: newPuzzleRepeatState(), down: newPuzzleRepeatState() };

  constructor(
    readonly label: string,
    readonly player: number,
    readonly colour: number,
    readonly active: boolean,
    readonly spawnX: number,
    readonly spawnY: number,
  ) {
    this.x = spawnX;
    this.y = spawnY;
  }

  /** The piece's grid cells (absolute). */
  cells(): Array<{ x: number; y: number }> {
    return this.shape.map(([dx, dy]) => ({ x: this.x + dx, y: this.y + dy }));
  }
}

type PuzzleDefinition = NonNullable<StageDef['puzzle']>;

/**
 * puzzle-tetris: the Puzzle row's sub-stage (PuzzleTetrisStage FUN_7ff72bb17f80 / Tetris map FUN_7ff72bb16f00).
 * Readable state for solvers and tests: grid (row-major codes), width, height, judge, blocks, linesCleared,
 * linesNeeded, won, failed, fallTime(), lockDelay(), previewPieces(n).
 */
export class PuzzleTetris {
  readonly view = new Container();
  readonly width: number;
  readonly height: number;
  readonly chipSize: number;
  readonly grid: number[];
  readonly chips: string[];
  readonly judge: { x: number; y: number; w: number; h: number };
  readonly blocks: PuzzleBlock[] = [];
  readonly fallTable: Array<{ threshold: number; time: number }>;
  fallTimeValue: number;
  readonly fallTimeFloor: number;
  linesCleared = 0;
  /** +0x268: lines removed by the latest map update. */
  lastClear = 0;
  won = false;
  failed = false;
  private readonly random: PuzzleRandom;
  private readonly cellView = new Graphics();
  private readonly counter: Text;
  private readonly okText: Text;

  constructor(
    definition: PuzzleDefinition,
    readonly party: number,
    readonly target: number,
    readonly targetName: string,
    readonly seed: number,
    originX: number,
    originY: number,
  ) {
    const map = definition.map!;
    this.width = map.width;
    this.height = map.height;
    this.chipSize = map.chipSize;
    // FUN_7ff72bc27dc0: variable != 0 -> table[party] (Lua 1-based), the party clamped to >= 2 by FUN_7ff72bb27b50.
    const variantKey = map.variable !== 0 && map.variantByPlayerCount && map.variantByPlayerCount.length > 0
      ? map.variantByPlayerCount[Math.min(party, map.variantByPlayerCount.length) - 1]
      : undefined;
    this.chips = [...((variantKey !== undefined ? map.variants?.[variantKey] : undefined) ?? map.table)];
    this.grid = this.chips.map((chip) => PUZZLE_CHIP_CODES[chip] ?? PUZZLE_EMPTY);
    this.judge = this.narrowJudge(map.judge ?? { x: 0, y: 0, w: 0, h: 0 });
    // FUN_7ff72bb17090: fallTimeDefault / fallTimeFloorDefault, then fallTimeTable rows {threshold = Lua[1],
    // time = Lua[party]}; the initial fallTime is the first row with threshold 0.
    this.fallTimeValue = Math.fround(map.fallTimeDefault ?? PUZZLE_DEFAULT_FALL_TIME);
    this.fallTimeFloor = Math.fround(map.fallTimeFloorDefault ?? PUZZLE_DEFAULT_FALL_TIME);
    this.fallTable = map.fallTimeTable
      ? map.fallTimeTable.map((row) => ({ threshold: Number(row[0]), time: Math.fround(Number(row[party - 1])) }))
      : PUZZLE_DEFAULT_FALL_TABLE.map(([threshold, time]) => ({ threshold, time: Math.fround(time) }));
    const initialRow = this.fallTable.find((row) => row.threshold === 0);
    if (initialRow) this.fallTimeValue = initialRow.time;
    // Seeding FUN_7ff72bb9d2f0 happens before the stage's actors load; then each Block of the createTable, in row
    // order (inactive ones too), draws next and then current = next, next = draw (FUN_7ff72bb14420 / 148c0).
    this.random = new PuzzleRandom(seed);
    for (const row of definition.createTable) {
      if (row.actorName !== 'Block') continue;
      // FUN_7ff72bb12610: idx = int(p0) % 10, colour = the cat colour slot of idx, active iff idx < party.
      const p0 = row.raw[6];
      const player = typeof p0 === 'number' && Number.isFinite(p0) ? Math.trunc(p0) % 10 : 0;
      const block = new PuzzleBlock(row.label, player, player, player < party, Math.trunc(row.x), Math.trunc(row.y));
      block.next = pickPuzzlePiece(this.random);
      this.advanceQueue(block);
      this.blocks.push(block);
    }
    // Attach FUN_7ff72bb144b0 -> FUN_7ff72bb12b60: an active Block writes its first piece; fall timer = ft * 1.0.
    for (const block of this.blocks) {
      if (block.active) this.writeCells(block, PUZZLE_FALLING);
      block.fallTimer = this.fallTimeValue;
    }

    // Draw origin: the Puzzle actor position (FUN_7ff72bb4c0b0 translates the sub-stage by it, scale 1).
    this.view.x = originX;
    this.view.y = originY;
    this.view.addChild(this.drawTerrain());
    this.view.addChild(this.cellView);
    const style = new TextStyle({ fill: PUZZLE_TEXT_COLOR, fontSize: PUZZLE_TEXT_SIZE, fontFamily: 'monospace', fontWeight: '700' });
    this.counter = new Text('', style);
    this.counter.anchor.set(0.5, 0.5);
    this.counter.x = (map.infoX ?? 0) + this.chipSize * (map.offsetX ?? 0);
    this.counter.y = (map.infoY ?? 0) + this.chipSize * (map.offsetY ?? 0);
    this.view.addChild(this.counter);
    this.okText = new Text('OK', style);
    this.okText.anchor.set(0.5, 0.5);
    this.okText.x = PUZZLE_OK_X - originX;
    this.okText.y = PUZZLE_OK_Y - originY;
    this.okText.visible = false;
    this.view.addChild(this.okText);
    this.draw();
  }

  get stopped(): boolean {
    return this.won || this.failed;
  }

  /** Lines still needed (FUN_7ff72bb17320: max(0, target - lines); the plain line count when target is 0). */
  get linesNeeded(): number {
    if (this.target === 0) return 0;
    return Math.max(0, this.target - this.linesCleared);
  }

  /** Seconds per gravity row now (map +0x258). */
  fallTime(): number {
    return this.fallTimeValue;
  }

  /** Lock delay on contact: max(fallTime, floor). */
  lockDelay(): number {
    return Math.max(this.fallTimeValue, this.fallTimeFloor);
  }

  cellAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.grid[y * this.width + x];
  }

  /** The next count pieces the shared stream will hand out (respawns take them in lock order). Pure. */
  previewPieces(count: number): number[] {
    const random = this.random.clone();
    return Array.from({ length: count }, () => pickPuzzlePiece(random));
  }

  /**
   * One sub-stage tick: every Block in createTable order (FUN_7ff72bb128d0), then the map update (line clear
   * FUN_7ff72bb172e0 / 17530), then the fail / win tests of FUN_7ff72bb180f0. Returns 'won' / 'failed' on the
   * tick that ends the puzzle. inputs[i] steers blocks[i].
   */
  tick(dt: number, inputs: readonly InputState[]): 'won' | 'failed' | null {
    if (this.stopped) return null;
    const step = Math.fround(dt);
    const stepMs = Math.fround(dt * 1000);
    // The input system updates every button's repeat state each frame, whatever the Block does with it.
    const fired = this.blocks.map((block, index) => {
      const input = inputs[index] ?? NEUTRAL_INPUT;
      return {
        rotate: !!input.jumpPressed,
        left: this.repeatFires(block.repeat.left, !!input.left, stepMs),
        right: this.repeatFires(block.repeat.right, !!input.right, stepMs),
        down: this.repeatFires(block.repeat.down, !!input.down, stepMs),
      };
    });
    this.blocks.forEach((block, index) => this.updateBlock(block, step, fired[index]));
    this.lastClear = 0;
    this.clearLines();
    // FUN_7ff72bb180f0: every active Block blocked -> flag 8 (fail); target reached -> flag 4 (win). The Puzzle
    // update's priority between the two is untraced: the win is taken first.
    const everyoneBlocked = this.blocks.every((block) => !block.active || block.blocked);
    if (this.target !== 0 && this.target <= this.linesCleared) this.won = true;
    else if (everyoneBlocked) this.failed = true;
    this.draw();
    if (this.won) return 'won';
    if (this.failed) return 'failed';
    return null;
  }

  /** Device repeat rule FUN_7ff72bbd2ce0: fires on the press, again after 134 ms held, then every 66 ms. */
  private repeatFires(state: PuzzleRepeatState, held: boolean, stepMs: number): boolean {
    if (!held) {
      state.held = false;
      state.acc = 0;
      state.flags = 0;
      return false;
    }
    const wasHeld = state.held;
    state.held = true;
    state.flags &= 2;
    const threshold = state.flags === 0 ? PUZZLE_REPEAT_DELAY_MS : PUZZLE_REPEAT_INTERVAL_MS;
    state.acc = Math.fround(state.acc + stepMs);
    if (!wasHeld) {
      state.flags |= 1;
      return true;
    }
    if (threshold < state.acc) {
      state.flags |= 3;
      state.acc = Math.fround(state.acc - threshold);
      return true;
    }
    return false;
  }

  /** FUN_7ff72bb128d0. */
  private updateBlock(block: PuzzleBlock, dt: number, fired: { rotate: boolean; left: boolean; right: boolean; down: boolean }): void {
    if (block.blocked) {
      // vtable +0xa0 FUN_7ff72bb146e0: retry the same (just-locked) shape at the spawn cell; no draw.
      if (this.placeAtSpawn(block)) block.blocked = false;
      return;
    }
    if (!block.active) return;
    const below = this.fits(block, block.x, block.y + 1, block.shape);
    // Grounded = blocked one row down by something that is not a falling piece (FUN_7ff72bb135c0 out flag).
    const grounded = !below.free && below.solidGround;
    const rotate = fired.rotate && PUZZLE_PIECES[block.piece].rotatable;
    let dx = 0;
    if (fired.left) dx = -1;
    else if (fired.right) dx = 1;
    let drop = false;
    let softDrop = false;
    if (fired.down) {
      const lockDelay = this.lockDelay();
      const inGrace = grounded && Math.fround(lockDelay - PUZZLE_DOWN_GRACE) <= block.lockTimer;
      if (!inGrace) {
        drop = true;
        softDrop = true;
      }
    }
    const lockBefore = block.lockTimer;
    block.fallTimer = Math.fround(block.fallTimer - dt);
    block.lockTimer = Math.fround(lockBefore - dt);
    if (block.fallTimer <= 0) {
      block.fallTimer = this.fallTimeValue;
      drop = true;
    }
    if (!softDrop && grounded) {
      // Gravity is suppressed on the ground; the drop attempt (and so the lock) waits for the lock timer.
      if (Math.fround(lockBefore - dt) > 0) {
        this.moveBlock(block, dx, false, rotate);
        return;
      }
      drop = true;
    } else if (!drop) {
      this.moveBlock(block, dx, false, rotate);
      return;
    }
    // Any drop resets both timers: fall = ft * 1.0, lock = max(ft, floor).
    block.fallTimer = this.fallTimeValue;
    block.lockTimer = Math.fround(this.lockDelay());
    this.moveBlock(block, dx, true, rotate);
  }

  /** FUN_7ff72bb13130: erase; rotate (x, y) -> (-y, x) (no wall kick); x += dx; drop one row or lock. */
  private moveBlock(block: PuzzleBlock, dx: number, drop: boolean, rotate: boolean): void {
    if (dx === 0 && !drop && !rotate) return;
    this.writeCells(block, PUZZLE_EMPTY);
    let x = block.x;
    let y = block.y;
    if (rotate) {
      const turned = block.shape.map(([cx, cy]): [number, number] => [0 - cy, cx]);
      if (this.fits(block, x, y, turned).free) {
        block.shape = turned;
        block.rotation = (block.rotation + 1) % 4;
      }
    }
    if (dx !== 0 && this.fits(block, x + dx, y, block.shape).free) x += dx;
    if (drop) {
      const below = this.fits(block, x, y + 1, block.shape);
      if (below.free) {
        y += 1;
      } else if (below.solidGround) {
        // Lock: cells become 0x24 + colour and vtable +0xb0 (FUN_7ff72bb14530) respawns in the same tick.
        block.x = x;
        block.y = y;
        this.writeCells(block, PUZZLE_LANDED);
        this.respawn(block);
        return;
      }
      // Blocked by another falling piece: no lock, no drop.
    }
    block.x = x;
    block.y = y;
    this.writeCells(block, PUZZLE_FALLING);
  }

  /**
   * FUN_7ff72bb14530: the just-locked piece's shape (rotation reset) is tested at the spawn cell; when it fits the
   * queue advances (current = next, one new draw) and the NEW piece is written there untested; else BLOCKED.
   */
  private respawn(block: PuzzleBlock): void {
    this.resetShape(block);
    if (!this.placeAtSpawn(block)) {
      block.blocked = true;
      return;
    }
    this.writeCells(block, PUZZLE_EMPTY);
    this.advanceQueue(block);
    this.writeCells(block, PUZZLE_FALLING);
  }

  /** FUN_7ff72bb127b0: the current shape fits at the spawn cell -> moved there and written as falling. */
  private placeAtSpawn(block: PuzzleBlock): boolean {
    if (!this.fits(block, block.spawnX, block.spawnY, block.shape).free) return false;
    if (block.code !== PUZZLE_LANDED) this.writeCells(block, PUZZLE_EMPTY);
    block.x = block.spawnX;
    block.y = block.spawnY;
    this.writeCells(block, PUZZLE_FALLING);
    return true;
  }

  /** FUN_7ff72bb148c0: current = next (shape from the table, rotation 0), next = one draw. */
  private advanceQueue(block: PuzzleBlock): void {
    block.piece = block.next;
    this.resetShape(block);
    block.next = pickPuzzlePiece(this.random);
  }

  /** FUN_7ff72bb12bf0(., table[current], ., ., 1): the table shape, rotation count 0. */
  private resetShape(block: PuzzleBlock): void {
    block.shape = PUZZLE_PIECES[block.piece].cells.map(([dx, dy]): [number, number] => [dx, dy]);
    block.rotation = 0;
  }

  /** FUN_7ff72bb12f60: write the cells at the Block position (1 = erase; else code + colour). */
  private writeCells(block: PuzzleBlock, code: number): void {
    for (const [dx, dy] of block.shape) {
      const x = block.x + dx;
      const y = block.y + dy;
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      this.grid[y * this.width + x] = code === PUZZLE_EMPTY ? PUZZLE_EMPTY : code + block.colour;
    }
    block.code = code;
  }

  /**
   * FUN_7ff72bb135c0: does the shape fit at (x, y)? A Block whose cells are written as falling is erased for the
   * test and rewritten after. solidGround: the first blocking cell is not a falling piece cell (0x1a..0x23).
   */
  private fits(block: PuzzleBlock, x: number, y: number, shape: ReadonlyArray<readonly [number, number]>): { free: boolean; solidGround: boolean } {
    const ownCellsWritten = block.code === PUZZLE_FALLING;
    if (ownCellsWritten) this.writeCells(block, PUZZLE_EMPTY);
    let result = { free: true, solidGround: false };
    for (const [dx, dy] of shape) {
      const cx = x + dx;
      const cy = y + dy;
      if (!this.solidAt(cx, cy)) continue;
      const code = this.cellAt(cx, cy);
      const fallingCell = cx >= 0 && cy >= 0 && cx < this.width && cy < this.height
        && code >= PUZZLE_FALLING && code - PUZZLE_FALLING < 10;
      result = { free: false, solidGround: !fallingCell };
      break;
    }
    if (ownCellsWritten) this.writeCells(block, PUZZLE_FALLING);
    return result;
  }

  /** FUN_7ff72bc281c0: coordinates clamped into the map; codes 0 / 1 free, 2..25 solid (DAT_7ff72bcc8a30),
   *  26..55 solid (DAT_7ff72bc81e10). */
  private solidAt(x: number, y: number): boolean {
    const cx = Math.min(Math.max(x, 0), this.width - 1);
    const cy = Math.min(Math.max(y, 0), this.height - 1);
    const code = this.grid[cy * this.width + cx];
    if (code > 0x19) return code - PUZZLE_FALLING < 30;
    return code >= 2;
  }

  /** FUN_7ff72bb16920: x / w narrow to the first run of empty (code 1) cells of row judge.y. */
  private narrowJudge(raw: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
    const judge = { ...raw };
    const end = raw.x + raw.w;
    let inRun = false;
    for (let x = raw.x; x < end; x += 1) {
      const code = x >= 0 && x < this.width && raw.y >= 0 && raw.y < this.height ? this.grid[raw.y * this.width + x] : 0;
      if (inRun) {
        if (code !== PUZZLE_EMPTY) {
          judge.w = x - judge.x;
          break;
        }
      } else if (code === PUZZLE_EMPTY) {
        judge.x = x;
        inRun = true;
      }
    }
    return judge;
  }

  private landedAt(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const code = this.grid[y * this.width + x];
    return code >= PUZZLE_LANDED && code - PUZZLE_LANDED < 10;
  }

  private rowFull(y: number): boolean {
    for (let x = this.judge.x; x - this.judge.x < this.judge.w; x += 1) {
      if (!this.landedAt(x, y)) return false;
    }
    return true;
  }

  /**
   * FUN_7ff72bb17530: rows from judge.y + h - 1 up to 0; a row whose judge cells are all landed adds 1 to the
   * shift; while the shift is > 0 each judge column copies (x, r - shift) to (x, r) -- only while r - shift >= 1
   * and no terrain / out-of-range source has been met in this row (sticky); an empty or piece destination takes the
   * source (the source becomes empty) or, with copying off, is emptied; terrain destinations are untouched.
   */
  private clearLines(): void {
    const width = this.width;
    const height = this.height;
    const grid = this.grid;
    const end = this.judge.x + this.judge.w;
    let shift = 0;
    for (let r = this.judge.y + this.judge.h - 1; r >= 0; r -= 1) {
      if (this.rowFull(r)) shift += 1;
      while (shift > 0) {
        const source = r - shift;
        let copy = source > 0;
        for (let x = this.judge.x; x < end; x += 1) {
          const columnInMap = x >= 0 && x < width;
          const rowInMap = r < height;
          const sourceInMap = columnInMap && source >= 0 && source < height;
          const sourceCode = sourceInMap ? grid[source * width + x] : 0;
          const destinationCode = columnInMap && rowInMap ? grid[r * width + x] : 0;
          if (sourceCode !== PUZZLE_EMPTY && sourceCode < PUZZLE_FALLING) copy = false;
          if (destinationCode !== PUZZLE_EMPTY && destinationCode <= 0x19) continue;
          if (!columnInMap || !rowInMap) continue;
          if (!copy) {
            grid[r * width + x] = PUZZLE_EMPTY;
            continue;
          }
          grid[r * width + x] = sourceCode;
          if (sourceInMap) grid[source * width + x] = PUZZLE_EMPTY;
        }
        if (!this.rowFull(r)) break;
        shift += 1;
      }
    }
    if (shift === 0) return;
    this.linesCleared += shift;
    this.lastClear = shift;
    // Each Block's vtable +0xa8 (FUN_7ff72bb145d0), then the fallTime table (every row with threshold <= lines).
    for (const block of this.blocks) this.afterClear(block);
    for (const row of this.fallTable) {
      if (row.threshold <= this.linesCleared) this.fallTimeValue = row.time;
    }
  }

  /**
   * FUN_7ff72bb145d0 (active Blocks): y += n, erase there, test the shape at (x, y + n - 1): free -> back to the
   * original y, else stays at y + n; written as falling. (Quirk: a falling piece normally does not move.)
   */
  private afterClear(block: PuzzleBlock): void {
    if (!block.active) return;
    const n = this.lastClear;
    block.y += n;
    this.writeCells(block, PUZZLE_EMPTY);
    let finalY = block.y;
    for (let i = 0; i < n; i += 1) {
      if (!this.fits(block, block.x, block.y - 1, block.shape).free) break;
      finalY -= 1;
    }
    block.y = finalY;
    this.writeCells(block, PUZZLE_EMPTY);
    this.writeCells(block, PUZZLE_FALLING);
  }

  /** Terrain chips 2..25 in the main map style (picoStyle drawPicoTile, same-fill neighbours merged). */
  private drawTerrain(): Graphics {
    const g = new Graphics();
    const size = this.chipSize;
    const fillAt = (x: number, y: number): number | undefined => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
      const code = this.grid[y * this.width + x];
      if (code < 2 || code >= PUZZLE_FALLING) return undefined;
      return chipFillColor(this.chips[y * this.width + x] ?? 'MC_NON');
    };
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const fill = fillAt(x, y);
        if (fill === undefined) continue;
        drawPicoTile(g, x * size, y * size, size, this.chips[y * this.width + x], {
          up: fillAt(x, y - 1) === fill,
          down: fillAt(x, y + 1) === fill,
          left: fillAt(x - 1, y) === fill,
          right: fillAt(x + 1, y) === fill,
        });
      }
    }
    return g;
  }

  /** Piece cells (falling and landed share the colour: FUN_7ff72bb16bd0 uses one UV per colour), the counter, OK. */
  private draw(): void {
    const g = this.cellView;
    const size = this.chipSize;
    g.clear();
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const code = this.grid[y * this.width + x];
        if (code < PUZZLE_FALLING) continue;
        const colour = code >= PUZZLE_LANDED ? code - PUZZLE_LANDED : code - PUZZLE_FALLING;
        g.lineStyle(2, 0x8b8b8b, 1);
        g.beginFill(PLAYER_BODY_COLORS[colour] ?? DEFAULT_PLAYER_BODY_COLOR, 1);
        g.drawRoundedRect(x * size + 1, y * size + 1, size - 2, size - 2, 5);
        g.endFill();
      }
    }
    this.counter.text = String(this.target !== 0 ? Math.max(0, this.target - this.linesCleared) : this.linesCleared);
    this.okText.visible = this.won;
  }
}
`;
    source += `
/** magnet-player: move a rect by (dx, dy), x then y, stopping flush at the first solid it would enter. A solid it
 *  already overlaps does not block (the lift that moved into it pushes it out). */
function sweepRectAgainstSolids(rect: Rect, dx: number, dy: number, solids: readonly Rect[]): Rect {
  const next = { ...rect };
  if (dx !== 0) {
    let x = next.x + dx;
    for (const solid of solids) {
      if (rectsOverlap(next, solid)) continue;
      const span = { ...next, x: Math.min(next.x, x), width: next.width + Math.abs(x - next.x) };
      if (!rectsOverlap(span, solid)) continue;
      x = dx > 0 ? Math.min(x, solid.x - next.width) : Math.max(x, solid.x + solid.width);
    }
    next.x = x;
  }
  if (dy !== 0) {
    let y = next.y + dy;
    for (const solid of solids) {
      if (rectsOverlap(next, solid)) continue;
      const span = { ...next, y: Math.min(next.y, y), height: next.height + Math.abs(y - next.y) };
      if (!rectsOverlap(span, solid)) continue;
      y = dy > 0 ? Math.min(y, solid.y - next.height) : Math.max(y, solid.y + solid.height);
    }
    next.y = y;
  }
  return next;
}

/** A copy of a stage row at a new point; raw x / y follow, because param parsers find their params after them. */
function spawnMovedTo(spawn: ActorSpawnDef, x: number, y: number): ActorSpawnDef {
  const raw = [...spawn.raw];
  for (let i = 0; i < raw.length - 1; i += 1) {
    if (raw[i] === spawn.x && raw[i + 1] === spawn.y) {
      raw[i] = x;
      raw[i + 1] = y;
      break;
    }
  }
  return { ...spawn, raw, x, y };
}
`;
    return source;
  }
  // Select by identity: prepending another patch must not disable warp recovery.
  if (!CAMPAIGN_PATCHES.find(patch => patch.id === 'warp-sensor-origin').files.includes(file)) return source;
  source = replaceOnce(source, 'x: spawn.x - triggerSize.width / 2,', 'x: spawn.x,', file);
  // warp-sensor-top-left: {0, 0, w, h} hangs DOWN from the row point (y-down, like JumpArea / JumpStand bodies).
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y,', file);
  return replaceOnce(source, 'this.view.addChild(g);', 'this.view.addChild(g);\n    this.view.visible = false;', file);
}

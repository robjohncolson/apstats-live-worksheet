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
  behavior: 'Local [0,0,width,height] sensor translated to the actor; downward-Y stage coordinates use a left/bottom anchor. Sensors have no visible artwork.',
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
}];

// Fail the build if upstream code changes: never silently skip a correction.
function replaceOnce(source, before, after, file) {
  assert.equal(source.split(before).length - 1, 1, `Patch anchor changed: ${file}: ${before}`);
  return source.replace(before, after);
}

export function patchCampaignSource(file, source) {
  source = source.replaceAll('\r\n', '\n');
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
    return replaceOnce(source, '// Browser PlayerGeometry can rest a fraction above (or up to 2px inside) a floor. Probe only',
      '// The native body rests up to one step above a floor (never inside it). Probe only', file);
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
    return replaceOnce(source, 'const NATIVE_PLAYER_CONTACT_OFFSET_FROM_BROWSER_Y = -15;', 'const NATIVE_PLAYER_CONTACT_OFFSET_FROM_BROWSER_Y = 0;', file);
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
    return replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n  door_closed: [96, 512, 48, 48],\n  updown_lift: [385, 49, 60, 10],\n  weighted_lift_wide: [351, 511, 98, 42],\n  weighted_lift_narrow: [383, 559, 34, 42],\n  move_wall: [500, 255, 9, 130],\n' + frames, file);
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
    return replaceOnce(source, `  open(): void {
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
  if (file === 'src/engine/actors/FallBox.ts') {
    // bottom-anchored-boxes: FUN_7ff72bb42900 rect {-p0/2, -p1, p0, p1} (bottom-centre on the row point).
    return replaceOnce(source, '      y: spawn.y - size.height / 2,', '      y: spawn.y - size.height,', file);
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
    source += `
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
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y - triggerSize.height,', file);
  return replaceOnce(source, 'this.view.addChild(g);', 'this.view.addChild(g);\n    this.view.visible = false;', file);
}

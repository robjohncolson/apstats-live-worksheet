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
  behavior: 'Desk adaptation, not a native rule: optional teacher cats do not increase party thresholds, goal quorums, or scroll-camera membership.',
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
}];

// Fail the build if upstream code changes: never silently skip a correction.
function replaceOnce(source, before, after, file) {
  assert.equal(source.split(before).length - 1, 1, `Patch anchor changed: ${file}: ${before}`);
  return source.replace(before, after);
}

export function patchCampaignSource(file, source) {
  source = source.replaceAll('\r\n', '\n');
  if (file === 'src/engine/sprites.ts') {
    const frames = Array.from({ length: 9 }, (_, i) =>
      `  push_box_${i}: [${464 + i % 3 * 16}, ${32 + Math.floor(i / 3) * 16}, 16, 16],`).join('\n');
    return replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n  door_closed: [96, 512, 48, 48],\n' + frames, file);
  }
  if (file === 'src/engine/actors/Goal.ts') {
    source = replaceOnce(source, '  readonly rect: Rect;', `  readonly rect: Rect;
  opened = false;
  setOpened(opened: boolean): void {
    this.opened = opened;
    const sprite = this.view.children[0];
    const texture = frameTexture(opened ? 'door_black' : 'door_closed');
    if (sprite instanceof Sprite && texture) sprite.texture = texture;
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
    return replaceOnce(source, '    this.view.addChild(g);', `    const cornerX = Math.min(24, resolvedWidth / 2);
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
    return source.slice(0, begin) + `    g.beginFill(0xff864d, 1);
    g.drawRoundedRect(this.rect.x - spawn.x, this.rect.y - spawn.y, this.rect.width, this.rect.height, 4);
    g.endFill();
` + source.slice(end);
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
`;
  }
  if (file === 'src/engine/GameRuntime.ts') {
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
    for (let supportIndex = 0; supportIndex < liftLoadSupports.length; supportIndex += 1) {
      for (const player of this.players) {
        if (liftLoadPlayers.has(player) || this.collisionChangePlayersCollisionOff.has(player)) continue;
        if (!rectRestsOnSupport(player.rect, liftLoadSupports[supportIndex])) continue;
        liftLoadPlayers.add(player);
        liftLoadSupports.push(player.rect);
      }
    }
    loadCount += liftLoadPlayers.size;
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
      lift.view.y = lift.spawn.actorName === 'DarknessWeightedLift' ? y : y + lift.rect.height / 2;
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
    return source;
  }
  // Select by identity: prepending another patch must not disable warp recovery.
  if (!CAMPAIGN_PATCHES.find(patch => patch.id === 'warp-sensor-origin').files.includes(file)) return source;
  source = replaceOnce(source, 'x: spawn.x - triggerSize.width / 2,', 'x: spawn.x,', file);
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y - triggerSize.height,', file);
  return replaceOnce(source, 'this.view.addChild(g);', 'this.view.addChild(g);\n    this.view.visible = false;', file);
}

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
  // Teacher 2026-10-07: "boxes can stay on top of the cat's head when the cat moves around (same dynamic as another cat on top)."
  id: 'push-box-head-carry',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/PushBox.ts'],
  evidence: ['Teacher request (desk rule); mirrors carryPlayersWithPushedBox / carryPlayersWithWeightedLifts'],
  behavior: 'Every stage: a push box resting on a live cat head at frame start follows that cat frame delta (x, then y), stopping at tiles, solids, other boxes and other cats; a ceiling that stops the box stops the cat too. Cats riding the box move with it. Cats support boxes in every stage (not only jump02), and a head box left unsupported falls. A cat rising under its own head box is not a side push. Deterministic: frame-start rects, lowest player index wins.',
}, {
  // Teacher 2026-10-07: "blocks can be used to hold down buttons!"
  id: 'push-box-holds-switches',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['Teacher request (desk rule); PhysicsSwitch/CollisionSwitch already accept boxes natively'],
  behavior: 'A landed push box that has moved from its spawn holds a plain Switch (and SwitchMediator pad) down like a cat, using the native 1px-inset body. Roulette stop switches, JumpSwitch, ScaleSwitch, DelaySwitch, SwitchTimer and DeadSwitch stay player-only.',
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
    // push-box-head-carry: a cat rising out from under the box on its head is not a side push;
    // GameRuntime.carryPushBoxesOnPlayerHeads lifts the box after the player pass.
    source = replaceOnce(source, '    const previousPlayerBottom = previousPlayerRect.y + previousPlayerRect.height;', `    if (playerVelocity.y < 0 && Math.abs(previousPlayerRect.y - (box.y + box.height)) <= 0.5) continue;
    const previousPlayerBottom = previousPlayerRect.y + previousPlayerRect.height;`, file);
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
  if (file === 'src/engine/GameRuntime.ts') {
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
  private readonly pushBoxesOnHeads = new Set<PushBox>();`, file);
    source = replaceOnce(source, '    const previousLiftRects = this.weightedLifts.map((lift) => ({ ...lift.rect }));', `    this.frameStartPlayerRects = this.players.map((player) => ({ ...player.rect }));
    this.frameStartPushBoxRects = this.pushBoxes.map((box) => ({ ...box.rect }));
    const previousLiftRects = this.weightedLifts.map((lift) => ({ ...lift.rect }));`, file);
    source = replaceOnce(source, '    this.updateFallingPushBoxes(clampedDt);', `    this.carryPushBoxesOnPlayerHeads();
    this.updateFallingPushBoxes(clampedDt);`, file);
    source = replaceOnce(source, '  private updateFallingPushBoxes(dt: number): void {', `  // push-box-head-carry: a box resting on a live cat's head at frame start follows that cat's
  // frame delta (x, then y), the way carryPlayersWithPushedBox moves riders of a pushed box.
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
    for (const [i, box] of this.pushBoxes.entries()) {
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
      // Of the live cats under it, the one that rose the most this frame carries (a jumping cat
      // lifts a shared box); ties go to the lowest index (stable createTable order).
      let carrierIndex = -1;
      for (const index of supporting) {
        if (!canCarry(this.players[index])) continue;
        const rise = this.players[index].rect.y - this.frameStartPlayerRects[index].y;
        if (carrierIndex < 0 || rise < this.players[carrierIndex].rect.y - this.frameStartPlayerRects[carrierIndex].y) carrierIndex = index;
      }
      if (carrierIndex < 0) continue;
      const carrier = this.players[carrierIndex];
      const start = this.frameStartPlayerRects[carrierIndex];
      const dx = carrier.rect.x - start.x, dy = carrier.rect.y - start.y;
      if ((dx === 0 && dy === 0) || Math.abs(dx) > MAX_CARRY_STEP || Math.abs(dy) > MAX_CARRY_STEP) continue;
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
    return source;
  }
  // Select by identity: prepending another patch must not disable warp recovery.
  if (!CAMPAIGN_PATCHES.find(patch => patch.id === 'warp-sensor-origin').files.includes(file)) return source;
  source = replaceOnce(source, 'x: spawn.x - triggerSize.width / 2,', 'x: spawn.x,', file);
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y - triggerSize.height,', file);
  return replaceOnce(source, 'this.view.addChild(g);', 'this.view.addChild(g);\n    this.view.visible = false;', file);
}

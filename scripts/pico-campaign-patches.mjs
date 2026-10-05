import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const CAMPAIGN_PATCHES = [{
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
    return replaceOnce(source, 'export const PICO_ATLAS_FRAMES = {', 'export const PICO_ATLAS_FRAMES = {\n' + frames, file);
  }
  if (file === 'src/engine/actors/PushBox.ts') {
    source = replaceOnce(source, "import { Container, Graphics, Text, TextStyle }", "import { Container, Graphics, Sprite, Text, TextStyle }", file);
    source = "import { frameTexture } from '../sprites';\n" + source;
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

    source = replaceOnce(source, '    const PUSH_BOX_GRAVITY = 980;', `    const nativeJumpBoxes = this.stage?.name === 'stage_jump02';
    const PUSH_BOX_GRAVITY = nativeJumpBoxes ? .65 * 60 * 60 : 980;`, file);
    source = replaceOnce(source, '    const PUSH_BOX_MAX_FALL_SPEED = 600;', '    const PUSH_BOX_MAX_FALL_SPEED = nativeJumpBoxes ? Infinity : 600;', file);
    source = replaceOnce(source, '      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);', `      const otherBoxRects = this.pushBoxes.filter((_, j) => j !== i).map((other) => other.rect);
      // Only cats below the box support it; side contact must not suspend a fall.
      const heads = nativeJumpBoxes ? this.players.filter(player => player.deathTimer <= 0
        && player.rect.y >= box.rect.y + box.rect.height - .001).map(player => player.rect) : [];
      otherBoxRects.push(...heads);`, file);
    source = replaceOnce(source, '        x: box.rect.x + box.rect.width / 2 - 2,', '        x: nativeJumpBoxes ? box.rect.x + .001 : box.rect.x + box.rect.width / 2 - 2,', file);
    source = replaceOnce(source, '        width: 4,\n        height: 1,', '        width: nativeJumpBoxes ? box.rect.width - .002 : 4,\n        height: 1,', file);
    source = replaceOnce(source, '      if (!box.falling) {', `      if (nativeJumpBoxes && !supported) box.falling = true;
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
  if (!CAMPAIGN_PATCHES[0].files.includes(file)) return source;
  source = replaceOnce(source, 'x: spawn.x - triggerSize.width / 2,', 'x: spawn.x,', file);
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y - triggerSize.height,', file);
  return replaceOnce(source, 'this.view.addChild(g);', 'this.view.addChild(g);\n    this.view.visible = false;', file);
}

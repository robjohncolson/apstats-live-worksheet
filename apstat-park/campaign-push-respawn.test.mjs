// Teacher 2026-10-07: a block pushed off a ledge never came back; in PICO PARK it returns from the
// sky. Patch 'push-box-sky-respawn' (scripts/pico-campaign-patches.mjs): a push box whose top passes
// the players' bottom kill-line returns to its spawn x just above the screen, falling from rest.
// Runs the rebuilt recovered runtime itself (pixi under jsdom, with a no-op canvas context).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html>', { pretendToBeVisual: true });
const noop = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({ canvas: this }, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 6, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return noop;
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['navigator', 'HTMLCanvasElement', 'Image', 'HTMLImageElement']) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
if (!('self' in globalThis)) globalThis.self = dom.window;
globalThis.requestAnimationFrame ||= (callback) => setTimeout(callback, 16);

const runtime = await import('./recovered/runtime.mjs');
const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  resetPressed: false, prevStagePressed: false, nextStagePressed: false };

function loadStage(source, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize: 2, simplifyPassivePlaceholders: false });
  return game;
}
function step(game, frames = 1) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, IDLE, [IDLE, IDLE]);
}
const rect = (box) => ({ x: box.rect.x, y: box.rect.y });

test('every push box remembers its spawn rectangle from stage load', () => {
  const game = loadStage('stage_push02');
  assert.equal(game.pushBoxes.length, 3);
  for (const box of game.pushBoxes) {
    assert.deepEqual(box.spawnRect, box.rect, 'spawnRect equals the rectangle placed at load');
    assert.notEqual(box.spawnRect, box.rect, 'spawnRect is a copy, not the live rect');
  }
});

// 1-3 (stage_jump02) is the stage where a box rests on cats' heads above a bottomless pit — the
// teacher's description. Its first box settles on the floor at x 940; carried over the pit, it drops.
test('1-3: a box over the bottomless pit falls past the kill line, reappears at its spawn x above its origin, and lands there', () => {
  const game = loadStage('stage_jump02');
  step(game, 120);                                   // let the floating boxes settle
  const box = game.pushBoxes[0];
  const rest = rect(box);                            // where this box lands from its spawn
  const killLine = game.scrollCameraConfig.failWindow;
  box.applyRect({ ...box.rect, x: 100 });            // pushed off the ledge, over the pit (x 48..712)
  // The return happens inside the update that crosses the kill line, so the box is never observed
  // at or past it: it is seen falling far below the map, then above the screen.
  let lowest = -Infinity, reappeared = null;
  for (let frame = 0; frame < 600 && !reappeared; frame++) {
    step(game);
    if (box.rect.x === box.spawnRect.x) reappeared = { ...box.rect, falling: box.falling };
    else lowest = Math.max(lowest, box.rect.y);
  }
  assert.ok(lowest > game.tileMap.pixelHeight, 'the box fell below the map toward the kill line ' + killLine + ' (lowest ' + lowest + ')');
  assert.ok(reappeared, 'the box came back');
  assert.equal(reappeared.x, box.spawnRect.x, 'it returns at its spawn x');
  assert.equal(reappeared.falling, true);
  // It starts above its origin with a clear drop down to it: above the screen when the column is
  // open, otherwise just under the overhang (here the jump02 box spawns beneath terrain).
  const s = box.spawnRect, h = s.height;
  assert.ok(reappeared.y < s.y, 'starts above its origin');
  assert.equal(game.tileMap.rectHitsSolid({ ...s, y: reappeared.y, height: s.y - reappeared.y + h }), false, 'clear drop to the origin');
  assert.ok(reappeared.y === -h || game.tileMap.rectHitsSolid({ ...s, y: Math.max(-h, reappeared.y - 8) }),
    'starts above the screen, or right under an overhang: ' + reappeared.y);
  step(game, 240);
  assert.equal(box.falling, false, 'it has landed');
  assert.equal(box.rect.x, rest.x, 'it lands at its origin x');
  assert.ok(Math.abs(box.rect.y - rest.y) < 1e-6, 'it lands where it rests from its spawn: ' + box.rect.y + ' vs ' + rest.y);
});

test('the respawn is deterministic: two runtimes, same frames and inputs, identical box positions every frame', () => {
  const a = loadStage('stage_jump02', 7), b = loadStage('stage_jump02', 7);
  step(a, 120); step(b, 120);
  for (const game of [a, b]) game.pushBoxes[0].applyRect({ ...game.pushBoxes[0].rect, x: 100 });
  for (let frame = 0; frame < 400; frame++) {
    step(a); step(b);
    assert.deepEqual(a.pushBoxes.map(rect), b.pushBoxes.map(rect), 'frame ' + frame);
  }
});

// 1-2 (stage_push02): every column has ground (the only pit, x 960..1000, has a floor), so a
// pushed-off pillar lands and stays — the kill line is never reached and the new rule is inert.
test('1-2: a pillar dropped into the floored pit lands there and is not respawned', () => {
  const game = loadStage('stage_push02');
  const box = game.pushBoxes[1];
  const spawnX = box.spawnRect.x;
  box.applyRect({ ...box.rect, x: 960 });
  box.falling = true;
  step(game, 300);
  assert.equal(box.rect.x, 960, 'not returned to its spawn x ' + spawnX);
  assert.ok(box.rect.y < game.scrollCameraConfig.failWindow, 'never reached the kill line');
  assert.equal(box.falling, false, 'it landed');
});

// The rule is global: in every stage that has a bottomless stretch (1-3, 2-4, 4-2, 7-4, 10-4), every
// push box dropped over it returns to its spawn x — from above the screen whenever its column is open.
test('every stage: a push box dropped over a bottomless stretch returns to its spawn x', () => {
  let checked = 0, fromSky = 0;
  for (const entry of runtime.stages) {
    const game = loadStage(entry.source);
    const map = game.tileMap;
    if (!game.pushBoxes.length) continue;
    step(game, 60);
    game.pushBoxes.forEach((box, index) => {
      const width = Math.ceil(box.rect.width);
      // The first stretch of open columns (top to bottom of the map) wide enough for this box.
      let x = null;
      for (let left = 0; left + width <= map.pixelWidth && x === null; left += 8) {
        if (!map.rectHitsSolid({ x: left, y: -box.rect.height, width, height: map.pixelHeight + box.rect.height + 50 })) x = left;
      }
      if (x === null) return;
      box.applyRect({ ...box.rect, x, y: 0 });
      box.falling = true;
      box.velocityY = 0;
      let back = null, lowest = -Infinity, belowFrames = 0;
      for (let frame = 0; frame < 900 && !back; frame++) {
        step(game);
        // The check runs at the start of a box's update: past the line for one frame, then back.
        belowFrames = box.rect.y >= game.scrollCameraConfig.failWindow ? belowFrames + 1 : 0;
        assert.ok(belowFrames <= 1, 'never left below the kill line for two frames');
        if (box.rect.x === box.spawnRect.x) back = { ...box.rect };
        else lowest = Math.max(lowest, box.rect.y);
      }
      // Some open-looking columns hold non-tile solids (e.g. 10-4): a box that lands on one is fine.
      if (lowest <= map.pixelHeight) return;
      assert.ok(back, entry.world + '-' + entry.stage + ' box ' + index + ' fell below the map and came back');
      checked += 1;
      const s = box.spawnRect;
      const openColumn = !map.rectHitsSolid({ ...s, y: -s.height, height: s.y + s.height + s.height });
      if (openColumn) { assert.equal(back.y, -s.height, entry.source + ' box ' + index + ' drops from above the screen'); fromSky += 1; }
    });
  }
  assert.ok(checked >= 5, 'boxes checked: ' + checked);
  assert.ok(fromSky >= 1, 'at least one box dropped from above the screen: ' + fromSky);
});

// Codex review P2 (2026-10-07): under the 1-3 overhang the returning box could be placed inside a cat
// standing at its drop start, and the overlap persisted. Now it waits off-screen until the start is clear.
test('1-3: a cat in the drop start keeps the box waiting off-screen; once the cat steps away it drops and lands', () => {
  const game = loadStage('stage_jump02');
  step(game, 120);
  const box = game.pushBoxes[0], cat = game.players[0];
  const rest = rect(box), killLine = game.scrollCameraConfig.failWindow;
  const start = { x: box.spawnRect.x, y: 150, width: box.rect.width, height: box.rect.height };   // under the overhang
  const holdCat = () => {
    cat.rect.x = start.x + 7; cat.rect.y = start.y + 8;   // the cat stands inside the drop start
    cat.velocity.x = 0; cat.velocity.y = 0;
  };
  box.applyRect({ ...box.rect, x: 100 });                // over the pit; it falls toward the kill line
  let parkedFrames = 0;
  for (let frame = 0; frame < 300; frame++) {
    holdCat();
    step(game);
    assert.notEqual(box.rect.x, box.spawnRect.x, 'never returned into the cat (frame ' + frame + ')');
    if (box.rect.y === killLine) {
      parkedFrames += 1;
      assert.equal(box.falling, false, 'parked at rest');
      assert.equal(box.velocityY, 0);
    }
  }
  assert.ok(parkedFrames > 100, 'the box waited off-screen at the kill line: ' + parkedFrames + ' frames');
  // The cat steps away (back to the start area): the next check finds the start clear.
  cat.rect.x = 395; cat.rect.y = 300; cat.velocity.y = 0;
  step(game);
  assert.equal(box.rect.x, box.spawnRect.x, 'returned at its spawn x');
  assert.equal(box.rect.y, start.y, 'from the same start under the overhang');
  assert.equal(box.falling, true);
  step(game, 240);
  assert.equal(box.falling, false, 'it landed');
  assert.equal(box.rect.x, rest.x);
  assert.ok(Math.abs(box.rect.y - rest.y) < 1e-6, 'at its origin: ' + box.rect.y + ' vs ' + rest.y);
});

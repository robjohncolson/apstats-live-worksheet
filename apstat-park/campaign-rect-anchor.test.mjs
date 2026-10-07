// Teacher 2026-10-07 (approved): Rects use the native left-bottom anchor (patch 'rect-left-bottom-anchor').
// Native evidence: FUN_7ff72bb72ae0's literal "Rect" branch builds the local body rect {0, -H, |W|, H} at the
// row's x, y (FUN_7ff72bb77c10 at 0x7ff72bb7696b; y = H ^ sign bit; a negative W moves the origin left by |W|
// and is multiplied by -1.0), and the Rect ctor FUN_7ff72bb5b820 passes it unchanged to the body.
// Runs the rebuilt recovered runtime itself (pixi under jsdom).
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
const { restoreJump01Steps } = await import('./campaign-jump01.mjs');
const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  resetPressed: false, prevStagePressed: false, nextStagePressed: false };
const RIGHT = { ...IDLE, right: true };

function definition(name) {
  for (const entry of runtime.stages) {
    if (entry.source === name) return entry.data;
    if (entry.largeParty?.data?.name === name) return entry.largeParty.data;
  }
  return null;
}
function load(name, partySize = 2, seed = 1) {
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(definition(name), 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
const literalRects = (game) => game.staticRects.filter((block) => block.spawn.actorName === 'Rect');
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// The native rectangle from the Lua row: params follow the x, y pair.
function nativeRect(spawn) {
  const at = spawn.raw.findIndex((value, i) => value === spawn.x && spawn.raw[i + 1] === spawn.y);
  const w = Number(spawn.raw[at + 2]) || 32, h = Math.abs(Number(spawn.raw[at + 3]) || 32);
  return { x: w < 0 ? spawn.x + w : spawn.x, y: spawn.y - h, width: Math.abs(w), height: h };
}

test('1-3: the square at (1056, 368) 48x48 sits at y 320..368, leaving a 64-unit gap above the floor at 432', () => {
  const game = load('stage_jump02');
  const square = literalRects(game).find((block) => block.spawn.x === 1056 && block.spawn.y === 368);
  assert.ok(square, 'the 1-3 square is loaded');
  assert.deepEqual(square.rect, { x: 1056, y: 320, width: 48, height: 48 });
  assert.equal(432 - (square.rect.y + square.rect.height), 64);
  // The 50-tall box and the cat both fit under it (the centred rect left only 40).
  const box = game.pushBoxes[0];
  assert.ok(box.rect.height <= 64 && game.players[0].rect.height <= 64);
});

test('1-3: a cat walks under the square without being stopped', () => {
  const game = load('stage_jump02');
  const cat = game.players[0], other = game.players[1];
  const square = literalRects(game).find((block) => block.spawn.x === 1056).rect;
  Object.assign(cat.rect, { x: 1000, y: 432 - cat.rect.height }); cat.velocity.x = 0; cat.velocity.y = 0;
  Object.assign(other.rect, { x: 395, y: 432 - other.rect.height });
  for (let frame = 0; frame < 90; frame++) {
    game.update(1 / 60, RIGHT, [RIGHT, IDLE]);
    assert.equal(overlaps(cat.rect, square), false, 'never inside the square (frame ' + frame + ')');
  }
  assert.ok(cat.rect.x > square.x + square.width, 'the cat passed under the square: x ' + cat.rect.x);
});

test('1-3: the stairs\' negative-width Rects run left from their spawn', () => {
  const game = load('stage_jump02');
  const stairs = literalRects(game).filter((block) => block.spawn.raw.slice(6, 8).some((value) => value < 0));
  assert.ok(stairs.length >= 2, 'negative-width stair rows loaded: ' + stairs.length);
  for (const { spawn, rect } of stairs) {
    assert.deepEqual(rect, nativeRect(spawn), spawn.x + ',' + spawn.y);
    assert.equal(rect.x + rect.width, spawn.x, 'right edge at the spawn x');
    assert.equal(rect.y + rect.height, spawn.y, 'bottom edge at the spawn y');
  }
});

// Stage authors sit many Rects in the ground (1-1 keeps a 25-unit skirt; some lie wholly below the map),
// so 'never touches a solid tile' is not a native invariant under ANY anchor. What holds natively, and is
// asserted: the exact native rect with bottom = Lua y; clear of every player spawn; no Key/Goal spawn point
// inside a Rect (except the one key-in-block that stage_fall01.lua authors: row 34 Rect at chip*31,
// chip*(fall_block_y-2) and row 37 Key 10 units above its base, inside it under either anchor); and the
// left-bottom anchor buries no more Rect tops than the old centred rect did.
const KEY_IN_BLOCK = new Set(['stage_fall01:1512,278']);
test('every stage with Rects (19): native rect, bottom = Lua y, clear of player spawns, keys and goals', () => {
  const names = new Set();
  for (const entry of runtime.stages) for (const data of [entry.data, entry.largeParty?.data].filter(Boolean)) {
    if (data.createTable.some((row) => row.actorName === 'Rect')) names.add(data.name);
  }
  assert.equal(names.size, 19);
  const inside = (r, x, y) => x > r.x + 2 && x < r.x + r.width - 2 && y > r.y + 2 && y < r.y + r.height - 2;
  const centred = (spawn) => { const n = nativeRect(spawn); return { ...n, x: spawn.x - n.width / 2, y: spawn.y - n.height / 2 }; };
  const buriedTop = (game, r) => game.tileMap.rectHitsSolid({ x: r.x + 1, y: r.y + 1, width: r.width - 2, height: 1 });
  const problems = [];
  let checked = 0, buriedNew = 0, buriedOld = 0;
  for (const name of names) {
    for (const party of [2, 8]) {
      const game = load(name, party);
      const points = definition(name).createTable.filter((row) => /^(Key|Goal)$/.test(row.actorName));
      for (const { spawn, rect } of literalRects(game)) {
        const where = name + ' x' + party + ' Rect@' + spawn.x + ',' + spawn.y;
        checked += 1;
        assert.deepEqual(rect, nativeRect(spawn), where);
        assert.equal(rect.y + rect.height, spawn.y, where + ' bottom = Lua y');
        // A cat standing on a Rect touches its top (the port's player body reaches 2 units below the feet).
        const deep = { x: rect.x + 3, y: rect.y + 3, width: rect.width - 6, height: rect.height - 6 };
        for (const player of game.players) if (overlaps(deep, player.rect)) problems.push(where + ' overlaps a player spawn');
        for (const point of points) {
          if (inside(rect, point.x, point.y) && !KEY_IN_BLOCK.has(name + ':' + point.x + ',' + point.y)) problems.push(where + ' contains the ' + point.actorName + ' at ' + point.x + ',' + point.y);
        }
        buriedNew += buriedTop(game, rect); buriedOld += buriedTop(game, centred(spawn));
      }
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(checked > 50, 'Rects checked: ' + checked);
  assert.ok(buriedNew <= buriedOld, 'buried tops: left-bottom ' + buriedNew + ' vs centred ' + buriedOld);
});

// stage_magnet01 spawns MagnetPlayers at y 336, 240 and 144: exactly the tops of its shelf Rects under the
// left-bottom anchor (the centred rects left them in mid-air), which is independent confirmation of the rule.
test('magnet01: the cats spawn standing exactly on the shelf Rects\' tops', () => {
  const game = load('stage_magnet01', 8);
  const tops = new Set(literalRects(game).map((block) => block.rect.y));
  const feet = definition('stage_magnet01').createTable.filter((row) => row.actorName === 'MagnetPlayer').map((row) => row.y);
  for (const y of feet) assert.ok(tops.has(y), 'a Rect top at the spawn y ' + y + ' (tops ' + [...tops].join(',') + ')');
});

test('1-1: the jump01 override still yields its existing measured rects', () => {
  const game = load('stage_jump01');
  restoreJump01Steps(game);
  const rects = literalRects(game);
  assert.ok(rects.length > 0);
  for (const { spawn, rect } of rects) {
    const width = spawn.raw[6], height = spawn.raw[7];
    assert.deepEqual(rect, { x: spawn.x, y: spawn.y - height, width, height: height - 25 });
  }
});

test('determinism: two runtimes, same frames and inputs, identical cats and boxes every frame (1-3 under the square)', () => {
  const a = load('stage_jump02', 2, 5), b = load('stage_jump02', 2, 5);
  for (const game of [a, b]) Object.assign(game.players[0].rect, { x: 1000, y: 432 - game.players[0].rect.height });
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), game.pushBoxes.map((box) => box.rect)]);
  for (let frame = 0; frame < 240; frame++) {
    const input = frame % 60 < 40 ? RIGHT : { ...IDLE, jump: frame % 60 === 45, jumpPressed: frame % 60 === 45 };
    a.update(1 / 60, input, [input, IDLE]); b.update(1 / 60, input, [input, IDLE]);
    assert.equal(snap(a), snap(b), 'frame ' + frame);
  }
});

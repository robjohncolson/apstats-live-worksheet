// stack-riding (scripts/pico-campaign-patches.mjs), teacher 2026-10-07: "if the bottom cat moves when a cat is
// on top, the top cat just falls down — in the game the top cat RIDES the bottom cat's head".
// Retail capture of PICO PARK 1-3 (og-capture-2/notes.md), every sampled frame:
//   A1/A2  cat on cat, bottom walks L/R    -> the top cat (and the box on it) move by the bottom cat's exact dx
//   B2     box on a walking cat            -> the box rides (+41 / +41 px)
//   B3     the carrier walks off a ledge   -> it drops away, contact breaks, the box keeps its x and falls
//   E1     cat on a pushed box             -> the cat rides the box 1:1
//   F2     box and cat side by side        -> both ride
//   G1     top cat airborne                -> no ride (keeps its x)
//   G2     cat / box / cat                 -> transitive, identical deltas from the first sample (same frame)
//   B1, C1 a jump press with a body on the head rises 0; the top cat's own jump does not move the bottom cat
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
const RIGHT = { ...IDLE, right: true };
const LEFT = { ...IDLE, left: true };
const JUMP = { ...IDLE, jump: true, jumpPressed: true };
const FLOOR = 432; // 1-3 floor top from x 820 on

function loadStage(source, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize: 2, simplifyPassivePlaceholders: false });
  lastGame = game;
  for (const cat of game.players) gameOf.set(cat, game);
  return game;
}
// Player 0 follows inputs[0]; player 1 follows inputs[1].
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
// native-camera (batch 17): a teleported cat is off the native screen until the camera catches up (3 px per tick), and
// a walking cat off the screen is pulled back onto it (FUN_7ff72bb7b700). Set-ups re-snap the camera onto the cats,
// as a fresh stage start does (FUN_7ff72bb7b9c0).
let lastGame = null;
const gameOf = new WeakMap();
function snapCamera(cat) {
  const game = gameOf.get(cat) || lastGame;
  if (game?.scrollCameraConfig?.mode !== 1) return;
  game.scrollCameraState = { ...game.scrollCameraState, latched: false };
  game.stepScrollCamera();
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); snapCamera(player); }
function boxOn(box, support, dx = 0) {
  box.applyRect({ ...box.rect, x: support.x + support.width / 2 - box.rect.width / 2 + dx, y: support.y - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
}
const restsOn = (top, bottom) => Math.abs(top.y + top.height - bottom.y) <= 0.5
  && top.x + top.width > bottom.x && top.x < bottom.x + bottom.width;

// x 1300 on the 1-3 floor is clear of the static block at 1032 and the floating box at 1180.
function catOnCat(source = 'stage_jump02', x = 1300, bottomIndex = 0) {
  const game = loadStage(source);
  const bottom = game.players[bottomIndex], top = game.players[1 - bottomIndex];
  place(bottom, x, FLOOR - bottom.rect.height);
  place(top, x, bottom.rect.y - top.rect.height);
  step(game, 10);
  assert.ok(restsOn(top.rect, bottom.rect), 'set-up: the top cat stands on the bottom cat');
  return { game, bottom, top };
}
const inputFor = (game, player, input) => game.players.indexOf(player) === 0 ? [input, IDLE] : [IDLE, input];

for (const bottomIndex of [0, 1]) {
  test(`1-3 (A1/A2): the bottom cat (player ${bottomIndex}) walks right then left; the top cat rides by its exact dx every frame`, () => {
    const { game, bottom, top } = catOnCat('stage_jump02', 1300, bottomIndex);
    const offset = top.rect.x - bottom.rect.x;
    let travelled = 0;
    for (let frame = 0; frame < 60; frame++) {
      const before = bottom.rect.x;
      step(game, 1, inputFor(game, bottom, frame < 30 ? RIGHT : LEFT));
      travelled += Math.abs(bottom.rect.x - before);
      assert.equal(top.rect.x - bottom.rect.x, offset, 'same x offset (frame ' + frame + ')');
      assert.ok(restsOn(top.rect, bottom.rect), 'still on the head (frame ' + frame + ')');
    }
    assert.ok(travelled > 100, 'the bottom cat really walked: ' + travelled);
  });
}

test('1-3 (B1/I): the bottom cat cannot jump with a cat on its head; neither cat rises', () => {
  const { game, bottom, top } = catOnCat();
  const rest = { b: bottom.rect.y, t: top.rect.y };
  for (let frame = 0; frame < 40; frame++) {
    step(game, 1, [frame === 0 ? JUMP : frame < 20 ? { ...IDLE, jump: true } : IDLE, IDLE]);
    assert.equal(bottom.rect.y, rest.b, 'frame ' + frame);
    assert.equal(top.rect.y, rest.t, 'frame ' + frame);
  }
});

test('1-3 (C1): the top cat jumps; the bottom cat does not move; it lands back on the head', () => {
  const { game, bottom, top } = catOnCat();
  const rest = { ...bottom.rect }, topY = top.rect.y;
  let rise = 0;
  for (let frame = 0; frame < 90; frame++) {
    step(game, 1, [IDLE, frame === 0 ? JUMP : frame < 14 ? { ...IDLE, jump: true } : IDLE]);
    assert.deepEqual(bottom.rect, rest, 'the bottom cat stays (frame ' + frame + ')');
    rise = Math.max(rise, topY - top.rect.y);
  }
  assert.ok(rise > 30, 'the top cat jumped: ' + rise);
  assert.ok(restsOn(top.rect, bottom.rect), 'and landed back on the head');
});

test('1-3 (G1): an airborne top cat does not ride; it keeps its x while the bottom cat walks under it', () => {
  const { game, bottom, top } = catOnCat();
  step(game, 1, [IDLE, JUMP]);
  const airX = top.rect.x;
  let walked = 0;
  for (let frame = 0; frame < 12; frame++) {
    const before = bottom.rect.x;
    step(game, 1, [RIGHT, { ...IDLE, jump: true }]);
    walked += bottom.rect.x - before;
    assert.ok(top.rect.y + top.rect.height < bottom.rect.y, 'still airborne (frame ' + frame + ')');
    assert.equal(top.rect.x, airX, 'no horizontal inheritance in the air (frame ' + frame + ')');
  }
  assert.ok(walked > 20, 'the bottom cat walked: ' + walked);
});

test('1-3 (B2): a box on a walking cat rides by the exact dx and stays on the head (no hop, no fall)', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 1300, FLOOR - cat.rect.height); place(other, 900, FLOOR - other.rect.height);
  step(game, 10);
  const box = game.pushBoxes[0];
  boxOn(box, cat.rect); step(game, 3);
  const offset = box.rect.x - cat.rect.x;
  for (let frame = 0; frame < 50; frame++) {
    step(game, 1, [frame < 25 ? RIGHT : LEFT, IDLE]);
    assert.equal(box.rect.x - cat.rect.x, offset, 'same x offset (frame ' + frame + ')');
    assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'on the head (frame ' + frame + ')');
    assert.equal(box.falling, false, 'not falling (frame ' + frame + ')');
  }
});

test('1-3 (G2): cat / box / cat: the box and the top cat ride the walking bottom cat, identical deltas every frame', () => {
  const game = loadStage('stage_jump02');
  const [bottom, top] = game.players;
  place(bottom, 1300, FLOOR - bottom.rect.height); place(top, 900, FLOOR - top.rect.height);
  step(game, 10);
  const box = game.pushBoxes[0];
  boxOn(box, bottom.rect);
  place(top, box.rect.x + 4, box.rect.y - top.rect.height);
  step(game, 3);
  for (let frame = 0; frame < 40; frame++) {
    const before = [bottom.rect.x, box.rect.x, top.rect.x];
    step(game, 1, [frame < 20 ? RIGHT : LEFT, IDLE]); // right first: the floating box near x 1200 would stop the tall stack
    const d = [bottom.rect.x - before[0], box.rect.x - before[1], top.rect.x - before[2]];
    assert.ok(d[0] !== 0 || frame === 0 || frame === 20, 'the bottom cat walks (frame ' + frame + ')');
    assert.deepEqual([d[1], d[2]], [d[0], d[0]], 'same frame, same dx (frame ' + frame + ')');
    assert.ok(restsOn(box.rect, bottom.rect) && restsOn(top.rect, box.rect), 'stack intact (frame ' + frame + ')');
  }
});

test('1-3 (F2): a box and a cat side by side on one head both ride', () => {
  const game = loadStage('stage_jump02');
  // Two 32-wide cats cannot share a 32-wide head: the carrier is player 0 and the box overhangs to the left.
  const [bottom, top] = game.players;
  place(bottom, 1300, FLOOR - bottom.rect.height); place(top, 900, FLOOR - top.rect.height);
  step(game, 10);
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: bottom.rect.x - box.rect.width + 8, y: bottom.rect.y - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  place(top, bottom.rect.x + 8, bottom.rect.y - top.rect.height);
  step(game, 3);
  const offsets = [box.rect.x - bottom.rect.x, top.rect.x - bottom.rect.x];
  for (let frame = 0; frame < 20; frame++) {
    step(game, 1, [RIGHT, IDLE]);
    assert.deepEqual([box.rect.x - bottom.rect.x, top.rect.x - bottom.rect.x], offsets, 'frame ' + frame);
  }
});

test('1-3 (E1): a cat on a pushed box rides it 1:1', () => {
  const game = loadStage('stage_jump02');
  const [pusher, rider] = game.players;
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: 1300, y: FLOOR - box.rect.height }); box.falling = false; box.velocityY = 0; box.wasSupported = true;
  place(pusher, 1300 - pusher.rect.width - 1, FLOOR - pusher.rect.height);
  place(rider, 1306, box.rect.y - rider.rect.height);
  step(game, 5);
  const offset = rider.rect.x - box.rect.x;
  const start = box.rect.x;
  // Native push speed: the box moves at most 1/tick (was the 4.9/tick walk), so push 45 frames for > 30 of travel.
  for (let frame = 0; frame < 45; frame++) {
    step(game, 1, [RIGHT, IDLE]);
    assert.equal(rider.rect.x - box.rect.x, offset, 'frame ' + frame);
  }
  assert.ok(box.rect.x - start > 30, 'the box was pushed: ' + (box.rect.x - start));
});

test('a rider that a wall blocks stops; the bottom cat walks out from under it and it drops to the floor', () => {
  const { game, bottom, top } = catOnCat();
  // A wall at the top cat's height only (left-bottom anchored Rect: x 1340..1360, y 300..380), clear of the bottom cat.
  game.spawnHandlers.Rect({ raw: [0, 0, 'Rect', '', 1340, 380, 20, 80], actorName: 'Rect', label: '', x: 1340, y: 380 });
  for (let frame = 0; frame < 40; frame++) step(game, 1, [RIGHT, IDLE]);
  assert.ok(top.rect.x + top.rect.width <= 1340 + 1e-6, 'the wall stopped the rider: ' + (top.rect.x + top.rect.width));
  assert.ok(bottom.rect.x > top.rect.x + top.rect.width, 'the bottom cat walked out from under it');
  step(game, 60);
  // (the port's existing fall resolve lands within 1 unit of the floor)
  assert.ok(Math.abs(top.rect.y + top.rect.height - FLOOR) <= 1, 'the rider dropped to the floor: ' + (top.rect.y + top.rect.height));
});

test('1-3 (B3): the carrier walks off a ledge with a box on its head: once airborne the box keeps its x and falls', () => {
  // Floor edge: the pit is left of x 820. The cat walks left off it with the box on its head.
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 840, FLOOR - cat.rect.height); place(other, 1300, FLOOR - other.rect.height);
  step(game, 10);
  const box = game.pushBoxes[0];
  boxOn(box, cat.rect); step(game, 3);
  let leftAt = -1, xAtLeave = 0;
  for (let frame = 0; frame < 30; frame++) {
    step(game, 1, [LEFT, IDLE]);
    if (leftAt < 0 && box.falling) { leftAt = frame; xAtLeave = box.rect.x; }
    if (leftAt >= 0) assert.equal(box.rect.x, xAtLeave, 'a falling box keeps its x (frame ' + frame + ')');
  }
  assert.ok(leftAt >= 0, 'the box lost its support and fell');
});

test('lift -> cat -> cat -> box on 1-4 still rides the slab (carrier rule unchanged)', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, top] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height);
  place(top, base.rect.x, base.rect.y - top.rect.height);
  step(game, 40);
  assert.ok(lift.rect.y < startY - 10, 'the lift rose');
  assert.ok(restsOn(base.rect, lift.rect) && restsOn(top.rect, base.rect), 'the stack rides it');
});

test('determinism (240 frames): two runtimes, a cat / box / cat stack walking and jumping, identical state', () => {
  const make = () => {
    const game = loadStage('stage_jump02', 5);
    const [bottom, top] = game.players;
    place(bottom, 1300, FLOOR - bottom.rect.height); place(top, 900, FLOOR - top.rect.height);
    step(game, 10);
    boxOn(game.pushBoxes[0], bottom.rect);
    place(top, game.pushBoxes[0].rect.x + 4, game.pushBoxes[0].rect.y - top.rect.height);
    return game;
  };
  const a = make(), b = make();
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), game.pushBoxes.map((box) => [box.rect, box.falling])]);
  for (let frame = 0; frame < 240; frame++) {
    const phase = frame % 80;
    const input0 = phase < 10 ? IDLE : phase === 10 ? JUMP : phase < 40 ? RIGHT : LEFT;
    const input1 = phase === 60 ? JUMP : phase > 65 && phase < 75 ? LEFT : IDLE;
    step(a, 1, [input0, input1]); step(b, 1, [input0, input1]);
    assert.equal(snap(a), snap(b), 'frame ' + frame);
  }
});

// Codex review: a rider resting on two supports was displaced by both. It now rides ONE support (largest
// frame-start horizontal overlap, ties -> lowest cat index, then boxes), at most once per frame.
function boxOnTwoCats(boxDx = 0) {
  const game = loadStage('stage_jump02');
  const [a, b] = game.players;
  // A 6-unit gap between the cats (native-player-body: b at 1300 + 32 + 6 = 1338; the 26-wide pair used 1332).
  place(a, 1300, FLOOR - a.rect.height); place(b, a.rect.x + a.rect.width + 6, FLOOR - b.rect.height);
  step(game, 10);
  const box = game.pushBoxes[0];
  // Box 40 wide centred over the pair (70 units for 32-wide cats: x 1315; 58 and 1309 for the old 26-wide
  // pair); boxDx shifts it toward one cat to choose the support.
  const pairCentre = (a.rect.x + b.rect.x + b.rect.width) / 2;
  box.applyRect({ ...box.rect, x: pairCentre - box.rect.width / 2 + boxDx, y: a.rect.y - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 3);
  assert.ok(restsOn(box.rect, a.rect) && restsOn(box.rect, b.rect), 'set-up: the box rests on both heads');
  return { game, a, b, box };
}
const overlapX = (r, s) => Math.min(r.x + r.width, s.x + s.width) - Math.max(r.x, s.x);

test('box on two cats walking the same way: it rides once per frame (+4.9), not twice', () => {
  const { game, a, b, box } = boxOnTwoCats();
  for (let frame = 0; frame < 10; frame++) {
    const before = [a.rect.x, b.rect.x, box.rect.x];
    step(game, 1, [RIGHT, RIGHT]);
    const da = a.rect.x - before[0], db = b.rect.x - before[1], dbox = box.rect.x - before[2];
    assert.ok(da > 0 && db > 0, 'both cats walk (frame ' + frame + ')');
    assert.ok(dbox === da || dbox === db, 'the box moves by ONE support dx (frame ' + frame + '): ' + [da, db, dbox]);
    assert.ok(dbox < 6, 'never the sum (frame ' + frame + '): ' + dbox);
  }
});

for (const [boxDx, chosen] of [[-6, 0], [6, 1], [0, 0]]) {
  test(`box on two cats walking apart (box shifted ${boxDx}): it rides the chosen support only (cat ${chosen}), then loses the other`, () => {
    const { game, a, b, box } = boxOnTwoCats(boxDx);
    const cats = [a, b];
    const overlaps = cats.map((cat) => overlapX(box.rect, cat.rect));
    const expected = overlaps[0] >= overlaps[1] ? 0 : 1;   // largest overlap, tie -> lowest index
    assert.equal(expected, chosen, 'set-up: overlaps ' + overlaps);
    const carrier = cats[chosen], other = cats[1 - chosen];
    const offset = box.rect.x - carrier.rect.x;
    for (let frame = 0; frame < 30; frame++) {
      const otherBefore = other.rect.x;
      step(game, 1, [LEFT, RIGHT]);
      assert.ok(other.rect.x !== otherBefore || frame > 25, 'the other cat walks too (frame ' + frame + ')');
      assert.equal(box.rect.x - carrier.rect.x, offset, 'the box rides the chosen cat only (frame ' + frame + ')');
    }
    assert.ok(!restsOn(box.rect, other.rect), 'the other cat walked out from under it');
    assert.ok(restsOn(box.rect, carrier.rect), 'still on the chosen head');
  });
}

test('three-deep single stack (cat / box / cat / on the walker) still rides 1:1, once per frame', () => {
  const game = loadStage('stage_jump02');
  const [bottom, top] = game.players;
  place(bottom, 1300, FLOOR - bottom.rect.height); place(top, 900, FLOOR - top.rect.height);
  step(game, 10);
  const box = game.pushBoxes[0];
  boxOn(box, bottom.rect);
  const second = game.pushBoxes[1];
  boxOn(second, box.rect);
  place(top, second.rect.x + 4, second.rect.y - top.rect.height);
  step(game, 3);
  const offsets = [box.rect.x, second.rect.x, top.rect.x].map((x) => x - bottom.rect.x);
  for (let frame = 0; frame < 20; frame++) {
    step(game, 1, [RIGHT, IDLE]);
    assert.deepEqual([box.rect.x, second.rect.x, top.rect.x].map((x) => x - bottom.rect.x), offsets, 'frame ' + frame);
  }
});

// Body interpenetration only: the port's tileMap.rectHitsSolid reports cats as "inside a tile" while they walk
// normally on some stages (stage_ghost01 frame 0) and during the collisionless death fall, on the committed
// pre-riding runtime too, so a tile clause would test that query rather than riding.
test('every campaign stage: a cat-on-cat stack walking left and right for 240 frames stays finite, and no live cat ends a frame inside another cat or a resting push box', () => {
  const inset = (r) => ({ x: r.x + 0.5, y: r.y + 0.5, width: r.width - 1, height: r.height - 1 });
  const hit = (r, s) => r.x < s.x + s.width && s.x < r.x + r.width && r.y < s.y + s.height && s.y < r.y + r.height;
  for (const entry of runtime.stages) {
    const game = loadStage(entry.source);
    const [bottom, top] = game.players;
    if (!bottom || !top) continue;
    place(top, bottom.rect.x, bottom.rect.y - top.rect.height);
    // Bodies that a stage spawns overlapping (before any riding) are not this check's business.
    const startHits = new Set(game.pushBoxes.flatMap((box, j) => game.players
      .filter((p) => hit(inset(p.rect), inset(box.rect))).map((_, i) => i + ':' + j)));
    let lastX = game.players.map((p) => p.rect.x), lastY = game.players.map((p) => p.rect.y);
    for (let frame = 0; frame < 240; frame++) {
      const phase = frame % 120;
      step(game, 1, [phase < 60 ? RIGHT : LEFT, frame === 90 ? JUMP : IDLE]);
      for (const p of game.players) {
        assert.ok(Number.isFinite(p.rect.x) && Number.isFinite(p.rect.y), entry.source + ' frame ' + frame);
      }
      for (const box of game.pushBoxes) {
        assert.ok(Number.isFinite(box.rect.x) && Number.isFinite(box.rect.y), entry.source + ' box frame ' + frame);
      }
      const live = game.players.filter((p) => p.deathTimer <= 0 && !game.deathFallPlayers.has(p));
      // A Warp teleport (a step over 48 units) may drop a cat onto the other's last position; the body
      // resolution separates them the next frame. With the native 46-tall body, jump02's pit Warp returns the
      // pair to (408, -32) two frames apart and the second overlaps the first for that one frame.
      const teleported = game.players.some((p, i) => Math.abs(p.rect.x - lastX[i]) > 48 || Math.abs(p.rect.y - lastY[i]) > 48);
      lastX = game.players.map((p) => p.rect.x); lastY = game.players.map((p) => p.rect.y);
      // stage_seesaw01 overlaps the placed pair at frame 0 on the committed pre-riding runtime too (checked
      // 2026-10-07 over all stages: the only stage, identical first frame with and without stack-riding).
      if (live.length === 2 && !teleported && entry.source !== 'stage_seesaw01') assert.ok(!hit(inset(live[0].rect), inset(live[1].rect)), entry.source + ': cats interpenetrate at frame ' + frame);
      live.forEach((p) => game.pushBoxes.forEach((box, j) => {
        const key = game.players.indexOf(p) + ':' + j;
        if (box.falling || box.hopping || startHits.has(key)) return;
        assert.ok(!hit(inset(p.rect), inset(box.rect)), entry.source + ': cat ' + key + ' inside a box at frame ' + frame);
      }));
    }
  }
});

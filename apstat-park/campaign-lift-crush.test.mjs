// descending-lift-stops-on-bodies (scripts/pico-campaign-patches.mjs), teacher 2026-10-07: "if a platform comes
// down on top of a cat's head, the cat stays stuck in the platform until I reload the page".
// Retail capture (og-capture-2/notes.md run L4, PICO PARK 1-4 = stage_weight01, the UpDownLift at x 917): the slab
// comes down onto a cat standing on the floor, STOPS on its head (the cat does not move and is not hurt), holds,
// then rises on its normal sine schedule (next peak unchanged). Hold time = the time its sine path spends below
// the cat's top: retail 1.48 s for a 28.7-unit overlap (46-tall native cat), (2/w)acos(1 - d/A) = 1.50 s; the
// port's 34-tall cat overlaps 15 -> 1.06 s. Decompile: FUN_7ff72bb6db60 holds / waits / mirrors its phase;
// FUN_7ff72bc16f50 blocks only on a body that stands on something; no lift ever pushes a body down or crushes it.
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
const FLOOR = 432;

function loadStage(source, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize: 2, simplifyPassivePlaceholders: false });
  return game;
}
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const inside = (a, b) => a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6
  && a.y < b.y + b.height - 1e-6 && b.y < a.y + a.height - 1e-6;

// 1-4: the UpDownLift (x 917, travel -70; native 118 x 18 body, native-lift-and-ledge-look) swings over open floor;
// its lowest underside is 336 + 70 + 9 = 415, a floor cat's top 398. (The native MoveWall stays idle: no cat here
// touches its sensor, native-movewall.)
function underUpDownLift() {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'UpDownLift');
  const [other, cat] = game.players;
  place(other, 820, FLOOR - other.rect.height);   // near, so the scroll camera never pulls the pair together
  place(cat, 900, FLOOR - cat.rect.height);
  return { game, lift, cat, other };
}

test('1-4 (L4): the UpDownLift comes down onto a standing cat, stops on its head, holds, and rises again; the cat never moves or dies', () => {
  const { game, lift, cat } = underUpDownLift();
  const catRect = { ...cat.rect };
  let held = 0, lowestBottom = 0, contactFrames = 0;
  const ys = [];
  for (let frame = 0; frame < 400; frame++) {
    step(game);
    ys.push(lift.rect.y);
    assert.deepEqual(cat.rect, catRect, 'the cat never moves (frame ' + frame + ')');
    assert.equal(cat.deathTimer <= 0, true, 'the cat is never hurt (frame ' + frame + ')');
    assert.ok(!inside(cat.rect, lift.rect), 'the cat is never inside the lift (frame ' + frame + ')');
    lowestBottom = Math.max(lowestBottom, lift.rect.y + lift.rect.height);
    if (lift.rect.y + lift.rect.height === cat.rect.y) contactFrames += 1;
    if (frame > 0 && ys[frame] === ys[frame - 1]) held += 1;
  }
  assert.equal(lowestBottom, cat.rect.y, 'it stops exactly on the head');
  // One pass in 400 frames (5 s = 300-frame period). The hold is the time the sine path spends below the head:
  // (2/w) acos(1 - d/A) with d = lowest underside - head (415 - 398 = 17), A = 70, w = 2pi/5 -> 1.13 s = 68 frames.
  // (Retail: d = 415 - 386 for its 46-tall cat = 29 -> 1.50 s; captured 1.48 s.)
  const d = 336 + 70 + lift.rect.height / 2 - cat.rect.y;
  const expected = 2 / (2 * Math.PI / 5) * Math.acos(1 - d / 70) * 60;
  assert.ok(Math.abs(contactFrames - expected) <= 2, 'held on the head ~' + expected.toFixed(1) + ' frames: ' + contactFrames);
  const peaks = ys.filter((y, i) => i > 0 && i < ys.length - 1 && y < ys[i - 1] && y <= ys[i + 1]);
  assert.ok(peaks.length >= 1 && peaks.every((y) => Math.abs(y - peaks[0]) < 1e-6), 'peaks unchanged (no phase drift): ' + peaks);
});

test('1-4: the hold is the native mirror: the lift goes back up even if the cat walks out during the hold', () => {
  const { game, lift, cat } = underUpDownLift();
  let frame = 0;
  while (lift.rect.y + lift.rect.height !== cat.rect.y && frame < 400) { step(game); frame += 1; }
  assert.ok(frame < 400, 'the lift reached the head');
  const holdY = lift.rect.y;
  step(game, 20, [IDLE, RIGHT]);   // the cat walks out from under the 118-wide slab
  assert.ok(cat.rect.x >= lift.rect.x + lift.rect.width - 1e-6, 'the cat left: ' + cat.rect.x);
  let lowest = holdY;
  for (let f = 0; f < 120; f++) { step(game); lowest = Math.max(lowest, lift.rect.y); }
  assert.equal(lowest, holdY, 'never dropped below the height it stopped at');
});

test('1-4: a cat riding ON TOP of the descending UpDownLift rides down with it (feet on the slab every frame)', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'UpDownLift');
  const [rider, other] = game.players;
  place(other, 820, FLOOR - other.rect.height);
  step(game, 10);
  place(rider, lift.rect.x + 19, lift.rect.y - rider.rect.height);
  let descending = 0;
  for (let frame = 0; frame < 300; frame++) {
    const before = lift.rect.y;
    step(game);
    if (lift.rect.y > before) descending += 1;
    assert.ok(Math.abs(rider.rect.y + rider.rect.height - lift.rect.y) <= 0.5, 'on the slab (frame ' + frame + ')');
  }
  assert.ok(descending > 60, 'it really rode a descent: ' + descending);
});

test('1-4: a push box standing under the UpDownLift stops it on its top (never pushed, never inside)', () => {
  const { game, lift, other, cat } = underUpDownLift();
  place(cat, 700, FLOOR - cat.rect.height); place(other, 660, FLOOR - other.rect.height);
  const x = 913, y = FLOOR;
  game.spawnHandlers.PushBox({ raw: [0, 0, 'PushBox', '', x, y, 10, 40, 50], actorName: 'PushBox', label: '', x, y });
  const box = game.pushBoxes.at(-1);
  step(game, 30);
  const boxRect = { ...box.rect };
  assert.ok(Math.abs(boxRect.y + boxRect.height - FLOOR) <= 1, 'set-up: the box stands on the floor');
  let lowestBottom = 0;
  for (let frame = 0; frame < 320; frame++) {
    step(game);
    assert.deepEqual(box.rect, boxRect, 'the box never moves (frame ' + frame + ')');
    assert.ok(!inside(box.rect, lift.rect), 'never inside (frame ' + frame + ')');
    lowestBottom = Math.max(lowestBottom, lift.rect.y + lift.rect.height);
  }
  assert.equal(lowestBottom, box.rect.y, 'it stopped on the box top');
});

test('1-4: a cat jumping up into the descending slab is never left inside it (pushed down to its underside)', () => {
  const { game, lift, cat } = underUpDownLift();
  for (let frame = 0; frame < 400; frame++) {
    // jump repeatedly as the lift comes down
    step(game, 1, [IDLE, frame % 40 === 0 ? JUMP : IDLE]);
    assert.ok(!inside(cat.rect, lift.rect), 'never inside (frame ' + frame + ')');
  }
});

// 1-4: the WeightedLift at x 2292 (travel -192) rises with two cats and returns DOWN when they leave.
test('1-4: the WeightedLift returning down onto a cat standing on a pillar stops on its head and resumes when it leaves', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [a, b] = game.players;
  const rest = lift.rect.y;
  place(a, lift.rect.x + 19, rest - a.rect.height); place(b, a.rect.x, a.rect.y - b.rect.height);
  step(game, 120);
  assert.ok(lift.rect.y < rest - 100, 'set-up: raised');
  // A pillar under the slab (left-bottom anchored Rect: x 2300..2340, y 330..432); a cat on it, top at 296.
  game.spawnHandlers.Rect({ raw: [0, 0, 'Rect', '', 2300, FLOOR, 40, 102], actorName: 'Rect', label: '', x: 2300, y: FLOOR });
  place(a, 2250, FLOOR - a.rect.height);
  place(b, 2306, 330 - b.rect.height);
  let frame = 0;
  for (; frame < 200; frame++) {
    step(game);
    assert.ok(!inside(b.rect, lift.rect), 'never inside (frame ' + frame + ')');
  }
  assert.equal(lift.rect.y + lift.rect.height, b.rect.y, 'it stopped on the head');
  for (let f = 0; f < 30; f++) step(game, 1, [IDLE, RIGHT]);   // walk off the pillar's far side
  step(game, 200);
  assert.ok(Math.abs(lift.rect.y - rest) < 1e-6, 'it resumed and returned to rest: ' + lift.rect.y);
});

test('determinism (240 frames): two runtimes, cats walking and jumping under the UpDownLift, identical state', () => {
  const a = underUpDownLift().game, b = underUpDownLift().game;
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), game.weightedLifts.map((l) => l.rect)]);
  for (let frame = 0; frame < 240; frame++) {
    const phase = frame % 80;
    const input = [phase < 30 ? IDLE : phase < 40 ? RIGHT : phase < 50 ? LEFT : IDLE, phase === 60 ? JUMP : IDLE];
    step(a, 1, input); step(b, 1, input);
    assert.equal(snap(a), snap(b), 'frame ' + frame);
  }
});

test('every campaign stage: for 360 frames no live cat ends a frame inside a lift or moving-wall body', () => {
  for (const entry of runtime.stages) {
    const game = loadStage(entry.source);
    for (let frame = 0; frame < 360; frame++) {
      const phase = frame % 120;
      step(game, 1, [phase < 60 ? RIGHT : LEFT, frame % 50 === 0 ? JUMP : phase < 60 ? LEFT : RIGHT]);
      const bodies = [
        ...game.weightedLifts.map((lift) => ['lift ' + lift.spawn.actorName, lift.rect]),
        ...game.moveWalls.map((wall) => ['moveWall', wall.rect]),
      ];
      for (const [i, p] of game.players.entries()) {
        if (p.deathTimer > 0 || game.deathFallPlayers.has(p) || game.collisionChangePlayersCollisionOff.has(p)) continue;
        for (const [name, rect] of bodies) {
          const shrunk = { x: p.rect.x + 0.5, y: p.rect.y + 0.5, width: p.rect.width - 1, height: p.rect.height - 1 };
          assert.ok(!inside(shrunk, rect), entry.source + ': cat ' + i + ' inside a ' + name + ' at frame ' + frame
            + ' ' + JSON.stringify(p.rect) + ' ' + JSON.stringify(rect));
        }
      }
    }
  }
});

// Teacher 2026-10-07, three campaign rules (scripts/pico-campaign-patches.mjs):
//   push-box-head-carry      — a box on a cat's head moves with the cat, in every stage;
//   stacked-cats-weigh-lifts — a cat standing on a cat on the weighted lift counts, and rides;
//   push-box-holds-switches  — a moved, landed push box holds a plain switch down.
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
const JUMP = { ...IDLE, jump: true, jumpPressed: true };

function loadStage(source, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize: 2, simplifyPassivePlaceholders: false });
  return game;
}
// Player 0 is the local cat (`update(dt, input, inputs)`); player 1 follows `inputs[1]`.
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
// Put a box on a cat's head: box bottom on the cat's top, centred over the cat.
function boxOnHead(box, player) {
  box.applyRect({ ...box.rect, x: player.rect.x + player.rect.width / 2 - box.rect.width / 2,
    y: player.rect.y - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
}

// 1-3 (stage_jump02): floor top at y 434 from x 820 on (a bottomless pit lies left of it); the box is 40 x 50.
// x 1300 is clear of the static block at x 1032 and of the third box floating at x 1180, y 286.
test('1-3: a box on a cat\'s head stays on the head while the cat walks', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 1300, 400); place(other, 900, 400);
  const box = game.pushBoxes[0];
  boxOnHead(box, cat);
  step(game, 2);
  const gap = box.rect.x - cat.rect.x;
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'box rests on the head at rest');
  step(game, 30, [RIGHT, IDLE]);
  assert.ok(cat.rect.x > 1320, 'the cat walked right: ' + cat.rect.x);
  assert.equal(box.rect.x - cat.rect.x, gap, 'the box kept its place over the head');
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'the box is still on the head');
  assert.equal(box.falling, false);
});

test('1-3: a cat jumping lifts the box on its head and the box comes back down with it', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 1300, 400); place(other, 900, 400);
  const box = game.pushBoxes[0];
  boxOnHead(box, cat);
  step(game, 2);
  const restY = box.rect.y;
  step(game, 1, [JUMP, IDLE]);
  step(game, 8, [{ ...IDLE, jump: true }, IDLE]);
  assert.ok(cat.rect.y < 400 - 5, 'the cat is in the air: ' + cat.rect.y);
  assert.ok(box.rect.y < restY - 5, 'the box rose with the cat: ' + box.rect.y);
  assert.ok(Math.abs(box.rect.y + box.rect.height - cat.rect.y) <= 0.5, 'the box stayed on the head mid-jump');
  step(game, 90);
  assert.ok(cat.grounded && cat.velocity.y === 0, 'the cat landed');
  assert.ok(Math.abs(box.rect.y + box.rect.height - cat.rect.y) <= 0.5, 'the box is back on the head: ' + box.rect.y);
  assert.equal(box.falling, false);
});

// 1-2 (stage_push02) is not jump02: before this rule, cats never supported boxes there.
test('1-2 (not jump02): a box rides a cat\'s head too, and falls off when the cat walks out from under a wall-blocked box', () => {
  const game = loadStage('stage_push02');
  const [cat, other] = game.players;
  place(cat, 1200, 400); place(other, 100, 400);
  const box = game.pushBoxes[2];   // the 96 x 96 block
  boxOnHead(box, cat);
  step(game, 2);
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'supported by the head outside jump02');
  const gap = box.rect.x - cat.rect.x;
  step(game, 20, [RIGHT, IDLE]);
  assert.equal(box.rect.x - cat.rect.x, gap, 'carried horizontally');
  assert.equal(box.falling, false);
});

// 1-4 (stage_weight01): the WeightedLift at x 2292 (travel -192: it rises when loaded) needs two cats.
// (The other one, at x 1307, starts inside the stage's MoveWall, so cats placed there are stuck.)
test('1-4: a cat standing on a cat on the lift counts, and both ride the slab up', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, top] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height - 10);
  place(top, base.rect.x, base.rect.y - top.rect.height - 10);
  step(game, 40);
  assert.ok(lift.rect.y < startY - 10, 'the lift rose with two stacked cats: ' + (lift.rect.y - startY));
  assert.ok(Math.abs(base.rect.y + base.rect.height - lift.rect.y) <= 0.5, 'the base cat rides the slab');
  assert.ok(Math.abs(top.rect.y + top.rect.height - base.rect.y) <= 1, 'the top cat rides the base cat: '
    + (top.rect.y + top.rect.height - base.rect.y));
});

test('1-4: one cat alone does not move the two-cat lift (threshold unchanged)', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, other] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height - 10); place(other, lift.rect.x - 80, 400);
  step(game, 40);
  assert.equal(lift.rect.y, startY);
});

// 1-3: switch pads sit at y 426..442 on the 434 floor, so a box on the floor overlaps them.
test('1-3: a pushed box resting on a switch pad holds the switch down; the box at its spawn does not', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 100, 400); place(other, 150, 400);
  const pad = game.switches.find((entry) => entry.rect.x === 1384);
  const box = game.pushBoxes[0];
  step(game, 1);
  assert.equal(pad.pressed, false);
  box.applyRect({ ...box.rect, x: pad.rect.x - 4, y: 434 - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 2);
  assert.equal(pad.pressed, true, 'a moved, landed box presses the pad');
  box.applyRect({ ...box.rect, x: 2000 });
  step(game, 2);
  assert.equal(pad.pressed, false, 'these pads reset when the box leaves (forceClearPressed)');
});

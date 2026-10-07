// Teacher 2026-10-07, three campaign rules (scripts/pico-campaign-patches.mjs):
//   push-box-head-carry      — native rule (rewritten 2026-10-07, 'like crazy glue'): a cat holds a box like a
//                              floor; walking out leaves it to fall; a cat cannot jump through it; only a
//                              lift / MoveWall under the cat moves the stack (FUN_7ff72bb33890, FUN_7ff72bb6f0e0);
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
test('1-3: a box rests on a standing cat; when the cat walks away the box stays put in x and falls to the floor', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 1300, 400); place(other, 900, 400);
  const box = game.pushBoxes[0];
  boxOnHead(box, cat);
  step(game, 2);
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'the box rests on the head');
  const boxX = box.rect.x;
  let fellAt = -1;
  for (let frame = 0; frame < 60; frame++) {
    step(game, 1, [RIGHT, IDLE]);
    assert.equal(box.rect.x, boxX, 'the box never moves with the cat (frame ' + frame + ')');
    if (fellAt < 0 && box.falling) fellAt = frame;
  }
  assert.ok(cat.rect.x > boxX + box.rect.width, 'the cat walked out from under it: ' + cat.rect.x);
  assert.ok(fellAt >= 0, 'the box lost its support and fell');
  step(game, 60);
  assert.equal(box.falling, false, 'it landed');
  assert.ok(Math.abs(box.rect.y + box.rect.height - 432) < 1, 'on the floor: ' + (box.rect.y + box.rect.height));
});

test('1-3: a cat with a box on its head cannot jump through it; the box is never launched, and walking frees it', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 1300, 400); place(other, 900, 400);
  const box = game.pushBoxes[0];
  boxOnHead(box, cat);
  step(game, 2);
  const restBox = { ...box.rect }, restCatY = cat.rect.y;
  step(game, 1, [JUMP, IDLE]);
  step(game, 12, [{ ...IDLE, jump: true }, IDLE]);
  assert.ok(Math.abs(cat.rect.y - restCatY) < 1, 'native: no jump with a body above the head: ' + cat.rect.y);
  assert.deepEqual({ x: box.rect.x, y: box.rect.y }, { x: restBox.x, y: restBox.y }, 'the box was not launched');
  assert.ok(cat.rect.y >= box.rect.y + box.rect.height - 0.5, 'the cat is never inside the box');
  step(game, 40, [RIGHT, IDLE]);
  step(game, 60);
  assert.ok(Math.abs(box.rect.y + box.rect.height - 432) < 1, 'walked out from under: the box fell to the floor');
  assert.equal(box.rect.x, restBox.x);
});

// 1-2 (stage_push02) is not jump02: cats hold boxes in every stage (native support has no category filter).
test('1-2 (not jump02): a cat holds a box; walking away leaves it in x and it falls', () => {
  const game = loadStage('stage_push02');
  const [cat, other] = game.players;
  place(cat, 1200, 400); place(other, 100, 400);
  const box = game.pushBoxes[2];   // the 96 x 96 block
  boxOnHead(box, cat);
  step(game, 2);
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'supported by the head outside jump02');
  const boxX = box.rect.x;
  step(game, 40, [RIGHT, IDLE]);
  assert.equal(box.rect.x, boxX, 'not carried horizontally');
  step(game, 60);
  assert.equal(box.falling, false, 'it fell and landed');
  assert.ok(box.rect.y + box.rect.height > cat.rect.y + 1, 'it is no longer on a head');
});

test('determinism (240 frames): two runtimes with a box on a head, same inputs, identical cats and boxes', () => {
  const make = () => {
    const game = loadStage('stage_jump02', 3);
    place(game.players[0], 1300, 400); place(game.players[1], 900, 400);
    boxOnHead(game.pushBoxes[0], game.players[0]);
    return game;
  };
  const a = make(), b = make();
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), game.pushBoxes.map((box) => [box.rect, box.falling])]);
  for (let frame = 0; frame < 240; frame++) {
    const phase = frame % 80;
    const input = phase < 10 ? IDLE : phase === 10 ? JUMP : phase < 20 ? { ...IDLE, jump: true } : phase < 50 ? RIGHT : { ...IDLE, left: true };
    step(a, 1, [input, IDLE]); step(b, 1, [input, IDLE]);
    assert.equal(snap(a), snap(b), 'frame ' + frame);
  }
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

// Review 2026-10-07 findings (Opus adversarial pass), each reproduced before the fix.
test('1-2: a box left on a cat that dies falls to the ground instead of floating', () => {
  const game = loadStage('stage_push02');
  const [cat, other] = game.players;
  place(cat, 1200, 400); place(other, 100, 400);
  const box = game.pushBoxes[2];
  boxOnHead(box, cat);
  step(game, 2);
  const headY = box.rect.y;
  game.startPlayerDeathSequence(cat);
  step(game, 240);
  assert.ok(box.rect.y > headY + 20, 'the box dropped once its cat died: ' + (box.rect.y - headY));
});

test('10-3: the dark-room lift rises with a cat carrying a box on its head (no jitter)', () => {
  const game = loadStage('stage_darkness01');
  const lift = game.weightedLifts[0];
  const [a, b] = game.players;
  const startY = lift.rect.y;
  // The slab is 48 wide: two 26-wide cats fit only packed edge to edge; the 48-wide box spans both heads.
  place(a, lift.rect.x, startY - a.rect.height - 6);
  place(b, lift.rect.x + 22, startY - b.rect.height - 6);
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: lift.rect.x, y: startY - a.rect.height - 6 - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 90);
  // Without the fix the slab flips between 431 and 432 forever; it rises ~13 here before a ceiling stops it.
  assert.ok(lift.rect.y < startY - 10, 'the lift rose: ' + (lift.rect.y - startY));
  assert.ok(Math.abs(box.rect.y + box.rect.height - a.rect.y) <= 0.5, 'the box is still on the head');
});

test('1-3: when a box rests on two cats, the cat that jumps is stopped by it and the box stays', () => {
  const game = loadStage('stage_jump02');
  const [a, b] = game.players;
  place(a, 1290, 400); place(b, 1316, 400);
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: 1296, y: 350 }); box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 2);
  step(game, 1, [IDLE, JUMP]);
  step(game, 6, [IDLE, { ...IDLE, jump: true }]);
  assert.ok(b.rect.y >= box.rect.y + box.rect.height - 0.5, 'cat 1 is under the box, not inside it');
  assert.equal(box.rect.y, 350, 'the box was not lifted');
});

// Codex review (2026-10-07): a lift -> cat -> cat -> box stack lost the box carry (only the cat DIRECTLY
// under a box was checked). The carrier is now found transitively down the frame-start support chain,
// as the native recursive displacement (FUN_7ff72bc17330 / FUN_7ff72bc16780) moves the whole stack.
// 1-4's lift is the one that demonstrably rises with stacked cats, but the stage has no push box, so a
// 1-3-shaped PushBox row (40 x 50) is spawned through the runtime's own handler. (10-3's only box is
// 48 x 192 and is jammed against the ceiling once stacked on two cats; 2-4's lift does not move for 2.)
test('lift -> cat -> cat -> box: the whole stack rides the rising slab together with no penetration', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, top] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height);
  place(top, base.rect.x, base.rect.y - top.rect.height);
  const x = top.rect.x + top.rect.width / 2, y = top.rect.y;
  game.spawnHandlers.PushBox({ raw: [0, 0, 'PushBox', '', x, y, 10, 40, 50], actorName: 'PushBox', label: '', x, y });
  const box = game.pushBoxes.at(-1);
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  assert.equal(box.rect.y + box.rect.height, top.rect.y, 'the box starts on the top cat');
  let rose = 0;
  for (let frame = 0; frame < 60; frame++) {
    step(game);
    rose = Math.max(rose, startY - lift.rect.y);
    const gap = top.rect.y - (box.rect.y + box.rect.height);
    assert.ok(gap >= -0.5, 'frame ' + frame + ': the box never sinks into the top cat (' + gap + ')');
    assert.ok(gap <= 0.5, 'frame ' + frame + ': the box stays seated on the top cat (' + gap + ')');
    assert.ok(Math.abs(top.rect.y + top.rect.height - base.rect.y) <= 1, 'frame ' + frame + ': the top cat rides the base cat');
  }
  assert.ok(rose > 10, 'the slab rose with the stack: ' + rose);
  assert.equal(box.falling, false);
});

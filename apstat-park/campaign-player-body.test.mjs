// native-player-body (scripts/pico-campaign-patches.mjs), fidelity audit 2026-10-07 batch 1:
//   FUN_7ff72bb6a3b0 body = DAT_7ff72c62d1a8 = {-16, -47, 32, 46} from the row point (memory image), so a cat is
//   32 x 46 spanning x-16..x+16, y-47..y-1 (the port had 26 x 34, bottom at y+2, 2 units inside the floor).
//   FUN_7ff72bb67620: a numeric p0 == 1 flips scale.x (FUN_7ff72bae78f0): the cat spawns facing left.
//   FUN_7ff72bb774a0 + FUN_7ff72bb72960: the k-th spawned player row takes slot table[k], the table is 0..n-1
//   (unshuffled); the row label is never read.
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

// Same variant choice as campaign-engine.mjs.
function loadStage(source, partySize = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
const idle = (n) => Array.from({ length: n }, () => IDLE);

test('1-1: the cat at row (100, 432) is the native body {84, 385, 32, 46}: bottom 1 above the row point', () => {
  const game = loadStage('stage_jump01');
  assert.deepEqual({ ...game.players[0].rect }, { x: 84, y: 385, width: 32, height: 46 });
  assert.deepEqual({ ...game.players[1].rect }, { x: 134, y: 385, width: 32, height: 46 });
});

test('1-1: a spawned cat settles onto the 432 floor without entering it, and can walk and jump from there', () => {
  const game = loadStage('stage_jump01');
  const cat = game.players[0];
  step(game, 30);
  const bottom = cat.rect.y + cat.rect.height;
  // The 1-unit sweep stops a falling rect within one step of contact, never inside the floor.
  assert.ok(bottom > 431 && bottom <= 432, 'resting on the floor: bottom ' + bottom);
  assert.equal(cat.grounded, true);
  const walker = game.players[1];   // cat 1 has open floor to its right (cat 0 is right behind cat 1)
  const x0 = walker.rect.x;
  step(game, 10, [IDLE, RIGHT]);
  // 10 frames x 3/tick native walk = 30 (was 4.9/tick, > 40).
  assert.ok(walker.rect.x > x0 + 25, 'walks (no floor-rest inset needed): ' + (walker.rect.x - x0));
  const top0 = cat.rect.y;
  step(game, 1, [JUMP, IDLE]);
  step(game, 10, [{ ...IDLE, jump: true }, IDLE]);
  assert.ok(cat.rect.y < top0 - 30, 'jumps off the floor: ' + (top0 - cat.rect.y));
});

test('1-3: the spawn stack (rows 50 apart, block_size = 46 + 4) closes to cats standing on each other', () => {
  const game = loadStage('stage_jump02', 4);
  const cats = game.players;
  assert.deepEqual(cats.map((cat) => cat.rect.y), [385, 335, 285, 235], 'frame 0: 4-unit gaps between 46-tall cats');
  step(game, 60, idle(4));
  for (let i = 1; i < cats.length; i++) {
    const gap = cats[i - 1].rect.y - (cats[i].rect.y + cats[i].rect.height);
    assert.ok(Math.abs(gap) <= 0.5, `cat ${i} stands on cat ${i - 1}: gap ${gap}`);
  }
});

test('7-3 (ghost01, every row p0 = 1): every cat spawns facing left, toward the Ghost, so it is watched at frame 0', () => {
  const game = loadStage('stage_ghost01', 4);
  assert.deepEqual(game.players.map((cat) => cat.getFacingDirection()), [-1, -1, -1, -1]);
  step(game, 1, idle(4));
  assert.equal(game.ghosts[0].gazeCount, 4, 'all four cats look at the Ghost (it stays frozen)');
});

test('p0 = 0 rows still face right (1-1), and a p0 = 1 cat faces left again after the death restart', () => {
  assert.deepEqual(loadStage('stage_jump01').players.map((cat) => cat.getFacingDirection()), [1, 1]);
  const game = loadStage('stage_ghost01', 2);
  const cat = game.players[0];
  step(game, 5, [RIGHT, IDLE]);
  assert.equal(cat.getFacingDirection(), 1, 'walking right turns it');
  game.startPlayerDeathSequence(cat, 0);
  // 1.0 s hold, then the death fall off the screen, then (death-restarts-stage, batch 16) the whole stage restarts:
  // a new cat at the row point.
  let frames = 0;
  do { step(game, 1, idle(2)); frames++; } while (game.players[0] === cat && frames < 600);
  assert.ok(frames < 600, 'restarted');
  const fresh = game.players[0];
  assert.deepEqual({ ...fresh.rect }, { x: 300 - 16, y: 432 - 47, width: 32, height: 46 }, 'at its row point');
  assert.equal(fresh.getFacingDirection(), -1, 'its spawn facing is restored');
});

test('8-1 (switch_puzzle01 lists label 8 before label 7): slots follow row order, not the label', () => {
  const at = (game, x) => game.playerInputSlots[game.players.findIndex((cat) => cat.rect.x === x - 16)];
  const seven = loadStage('stage_switch_puzzle01', 7);
  assert.deepEqual(seven.playerInputSlots, [0, 1, 2, 3, 4, 5, 6], 'party 7: seven cats on slots 0..6');
  assert.equal(at(seven, 415), 6, 'the label-8 row (7th row) is driven by slot 6, not the missing slot 7');
  const eight = loadStage('stage_switch_puzzle01', 8);
  assert.equal(at(eight, 415), 6, 'party 8: label 8 (row 7) -> slot 6');
  assert.equal(at(eight, 865), 7, 'party 8: label 7 (row 8) -> slot 7');
});

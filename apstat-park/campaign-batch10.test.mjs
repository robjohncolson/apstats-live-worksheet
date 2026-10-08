// Fidelity audit 2026-10-08 batch 10 (scripts/pico-campaign-patches.mjs): native-walk-and-push-speed.
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
const PARTIES = [2, 4, 8];

function load(source, partySize = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
const idle = (n) => Array.from({ length: Math.max(n, 8) }, () => IDLE);
function step(game, frames, inputs = idle(game.players.length)) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
/** Inputs that hold `buttons` for cat `catIndex` only (by its input slot). */
function holdFor(game, catIndex, buttons) {
  const slot = game.playerInputSlots[catIndex];
  return idle(game.players.length).map((input, index) => (index === slot ? { ...IDLE, ...buttons } : IDLE));
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const rectOf = (actor) => ({ x: actor.rect.x, y: actor.rect.y, width: actor.rect.width, height: actor.rect.height });
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const stagesWith = (name) => runtime.stages.filter((entry) => [entry.data, entry.largeParty?.data].filter(Boolean)
  .some((data) => data.createTable.some((row) => row.actorName === name))).map((entry) => entry.source);

// ---------------------------------------------------------------------------------------------------------------
// native-walk-and-push-speed

test('a cat walks 3 per tick (native FUN_7ff72bb687e0 = 3.0), stops dead on release, and the jump tick has no x travel', () => {
  for (const party of PARTIES) {
    const game = load('stage_fall01', party);
    const cat = game.players[0];
    place(cat, 700, 432 - 47);   // open floor, clear of the other cats (party 8 spawns reach x ~600)
    step(game, 30);
    const right = holdFor(game, 0, { right: true });
    step(game, 2, right);
    for (let k = 0; k < 5; k++) { const x = cat.rect.x; step(game, 1, right); assert.ok(close(cat.rect.x - x, 3, 1e-6), `p${party}: walk step ${cat.rect.x - x}`); }
    let x = cat.rect.x;
    step(game, 1);
    assert.ok(close(cat.rect.x, x, 1e-6), `p${party}: dead stop on release`);
    x = cat.rect.x;
    step(game, 1, holdFor(game, 0, { right: true, jump: true, jumpPressed: true }));
    assert.ok(close(cat.rect.x, x, 1e-6) && cat.rect.y < 432 - 46 - 1e-3 + 1, `p${party}: takeoff tick moves only up (dx ${cat.rect.x - x})`);
  }
});

const pushPairs = [
  ['stage_push02', (game) => game.pushBoxes[1], '1-2 pillar 2 (weight 100: both cats)'],
  ['stage_traffic_light01', (game) => game.pushBoxes.find((box) => box.spawn.actorName === 'NormalBox'), '7-2 NormalBox (whole party)'],
];

test('two cats pushing one box: the box moves exactly 1 per tick (one budget per box), both cats stay flush', () => {
  for (const [source, pick, label] of pushPairs) {
    const game = load(source, 2);
    const box = pick(game);
    const [rear, front] = game.players;
    const feet = box.rect.y + box.rect.height - 46;
    place(front, box.rect.x - 32, feet);
    place(rear, box.rect.x - 64, feet);
    const right = idle(2).map(() => ({ ...IDLE, right: true }));
    step(game, 3, right);
    for (let k = 0; k < 10; k++) {
      const x = box.rect.x;
      step(game, 1, right);
      assert.ok(close(box.rect.x - x, 1, 1e-6), `${label} tick ${k}: box step ${box.rect.x - x}`);
      assert.ok(close(front.rect.x + front.rect.width, box.rect.x, 1e-6), `${label} tick ${k}: front cat flush`);
      assert.ok(close(rear.rect.x + rear.rect.width, front.rect.x, 1e-6), `${label} tick ${k}: rear cat flush`);
    }
  }
});

test('two STACKED cats pushing a tall box (1-2 pillar): still exactly 1 per tick', () => {
  const game = load('stage_push02', 2);
  const box = game.pushBoxes[1];
  const [bottom, top] = game.players;
  const feet = box.rect.y + box.rect.height - 46;
  place(bottom, box.rect.x - 32, feet);
  place(top, box.rect.x - 32, feet - 46);
  const right = idle(2).map(() => ({ ...IDLE, right: true }));
  step(game, 3, right);
  for (let k = 0; k < 10; k++) {
    const x = box.rect.x;
    step(game, 1, right);
    assert.ok(close(box.rect.x - x, 1, 1e-6), `tick ${k}: box step ${box.rect.x - x}`);
    assert.ok(close(bottom.rect.x + bottom.rect.width, box.rect.x, 1e-6), `tick ${k}: bottom pusher flush`);
  }
});

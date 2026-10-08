// Fidelity audit 2026-10-08 batch 9 (scripts/pico-campaign-patches.mjs): jump-off-body-contact,
// pushed-box-carries-stack, colorbox-native-body.
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
// jump-off-body-contact

test('a rider can jump off a carrier that is falling (any contact below counts; 10-2 pit, parties 2/4/8)', () => {
  for (const party of PARTIES) {
    const game = load('stage_jump04', party);
    const [carrier, rider] = game.players;
    // The carrier stands on the block edge (block x 384..672, top 288), the rider on its head; the carrier walks off.
    place(carrier, 660, 288 - 46);
    place(rider, 660, carrier.rect.y - 46);
    step(game, 3);
    const walk = holdFor(game, game.players.indexOf(carrier), { right: true });
    let fallTicks = 0;
    for (let k = 0; k < 40 && fallTicks < 12; k++) {
      step(game, 1, walk);
      if (!carrier.grounded && carrier.velocity.y > 0) fallTicks += 1;
    }
    assert.ok(fallTicks >= 12, `p${party}: the carrier has been falling for 12 ticks`);
    assert.ok(close(rider.rect.y + rider.rect.height, carrier.rect.y, 1), `p${party}: the rider still rests on the falling carrier`);
    const before = rider.velocity.y;
    step(game, 1, holdFor(game, game.players.indexOf(rider), { jump: true, jumpPressed: true }));
    assert.ok(rider.velocity.y < 0 && before > 0, `p${party}: the rider jumped off the falling carrier (vy ${before} -> ${rider.velocity.y})`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// pushed-box-carries-stack

test('a box resting on a pushed box rides it (6-1 ColorBoxes, party 2)', () => {
  const game = load('stage_push01', 2);
  step(game, 30);
  const boxes = game.pushBoxes.filter((box) => box.colorIndex !== undefined);
  const base = boxes.find((box) => box.spawn.raw[4] === 576) ?? boxes[0];
  const top = boxes.find((box) => box !== base && box.rect.width <= base.rect.width);
  // Put the smaller box on top of the base box (centred), then push the base with a cat of its colour.
  top.applyRect({ ...top.rect, x: base.rect.x + (base.rect.width - top.rect.width) / 2, y: base.rect.y - top.rect.height });
  step(game, 2);
  const pusher = game.players.find((cat, i) => (game.players.length > 1 ? i : 0) === base.colorIndex) ?? game.players[0];
  const pi = game.players.indexOf(pusher);
  place(pusher, base.rect.x - 34, base.rect.y + base.rect.height - 46);
  const baseX = base.rect.x, topOffset = top.rect.x - base.rect.x;
  step(game, 40, holdFor(game, pi, { right: true }));
  assert.ok(base.rect.x > baseX + 5, `the base box moved (${base.rect.x - baseX})`);
  assert.ok(close(top.rect.x - base.rect.x, topOffset, 0.5), `the top box rode it (offset ${top.rect.x - base.rect.x} vs ${topOffset})`);
  assert.ok(close(top.rect.y + top.rect.height, base.rect.y, 0.5), 'and still rests on it');
});

// ---------------------------------------------------------------------------------------------------------------
// land-on-rising-lift

test('a cat that was just above a lift top and is now inside its rising platform stands on it (10-2 roulette lifts, parties 2/4/8)', () => {
  for (const party of PARTIES) {
    const game = load('stage_jump04', party);
    const cat = game.players[0];
    for (const top of game.rouletteLifts.flatMap((lift) => lift.bodyRects).slice(0, 1)) {
      place(cat, top.x + 10, top.y - cat.rect.height + 0.2);   // 0.2 inside: the platform rose under the falling cat
      cat.grounded = false;
      cat.velocity.y = 120;
      const previous = { ...cat.rect, y: cat.rect.y - 1.2 };     // last frame: 1 above the platform top
      game.player = cat;
      game.applyWeightedLifts(previous);
      assert.ok(close(cat.rect.y + cat.rect.height, top.y, 1e-6), `p${party}: feet on the platform top (${cat.rect.y + cat.rect.height} vs ${top.y})`);
      assert.equal(cat.grounded, true, `p${party}: grounded`);
      assert.equal(cat.velocity.y, 0, `p${party}: no fall speed`);
    }
  }
});

test('landing on a rising lift never seats a cat into a chip above it (1-chip-high ceiling, parties 2/4/8)', () => {
  for (const party of PARTIES) {
    const game = load('stage_jump04', party);
    const cat = game.players[0];
    const top = game.rouletteLifts.flatMap((lift) => lift.bodyRects)[0];
    const chip = game.tileMap.map.chipSize;
    // A ceiling chip whose bottom B is 0.4 above where a cat seated on the platform would have its head.
    const ty = Math.floor((top.y - cat.rect.height) / chip) - 1;
    const tx = Math.floor((top.x + 26) / chip);
    const B = (ty + 1) * chip;
    game.tileMap.setChip(tx, ty, 'MC_INC');
    top.y = B - 0.4 + cat.rect.height;                     // the platform has risen to put the seat 0.4 into the chip
    place(cat, tx * chip + 2, B);                           // head touching the chip, feet 0.4 inside the platform
    cat.grounded = false;
    cat.velocity.y = 120;
    game.player = cat;
    game.applyWeightedLifts({ ...cat.rect });              // the platform rose under a cat that did not move
    const inner = { x: cat.rect.x + 0.01, y: cat.rect.y + 0.01, width: cat.rect.width - 0.02, height: cat.rect.height - 0.02 };
    assert.equal(game.tileMap.rectHitsSolid(inner), false, `p${party}: the cat was not moved into the chip (head ${cat.rect.y} vs chip bottom ${B})`);
  }
});

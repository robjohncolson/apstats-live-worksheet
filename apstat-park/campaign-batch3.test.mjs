// Fidelity audit 2026-10-07 batch 3 (scripts/pico-campaign-patches.mjs): normal-small-box-are-pushboxes,
// colorbox-colour-push, weighted-lift-ex-variants, lift-horizontal-carry, bridge-folded-start-and-motion.
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

function load(source, partySize = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
const idle = (n) => Array.from({ length: n }, () => IDLE);
function step(game, frames, inputs) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
function park(game, except) {
  // Move the cats not in use far away on the floor (they must not push or weigh anything).
  game.players.forEach((cat, i) => { if (!except.includes(i)) place(cat, 40 + 40 * i, 432 - cat.rect.height); });
}
const rectOf = (actor) => ({ x: actor.rect.x, y: actor.rect.y, width: actor.rect.width, height: actor.rect.height });
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const near = (a, b) => Object.keys(b).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
const boxesNamed = (game, name) => game.pushBoxes.filter((box) => box.spawn.actorName === name);

// ---------------------------------------------------------------------------------------------------------------
// normal-small-box-are-pushboxes: FUN_7ff72bb333d0 + DAT_7ff72bcb66a0 {Normal {-48,-96,96,96}, Small {-25,-48,48,48}}

test('7-2 / 11-4 load the box family as push boxes with the native table rects and p0 weights (parties 2/4/8)', () => {
  for (const party of [2, 4, 8]) {
    const trafficLight = load('stage_traffic_light01', party);
    const [normal] = boxesNamed(trafficLight, 'NormalBox');
    assert.deepEqual(rectOf(normal), { x: 3312, y: 336, width: 96, height: 96 }, 'NormalBox (3360, 432) party ' + party);
    assert.equal(normal.weightPercent, 100);
    const [small] = boxesNamed(trafficLight, 'SmallBox');
    assert.deepEqual(rectOf(small), { x: 3935, y: 192, width: 48, height: 48 }, 'SmallBox (3960, 240): x - 25');
    assert.equal(small.weightPercent, 10);
    assert.deepEqual(rectOf(boxesNamed(load('stage_magnet02', party), 'SmallBox')[0]), { x: 503, y: 96, width: 48, height: 48 });
    assert.equal(trafficLight.normalBoxes.length + trafficLight.smallBoxes.length, 0, 'no static stand-ins left');
  }
});

test('7-2: the SmallBox falls to the floor; one cat pushes it; the NormalBox needs the whole party (2 here)', () => {
  const game = load('stage_traffic_light01', 2);
  const [a, b] = game.players;
  const [small] = boxesNamed(game, 'SmallBox');
  const [normal] = boxesNamed(game, 'NormalBox');
  step(game, 90, idle(2));
  // It falls (0.65, FUN_7ff72bb34c40) onto the Rect under it ({3696, 264, 312, 48}); the port's 1-unit support
  // strip (pre-existing, every push box) lets it settle up to 1 unit above a Rect top.
  assert.ok(Math.abs(small.rect.y + small.rect.height - 264) <= 1, 'fell onto the Rect: ' + (small.rect.y + small.rect.height));
  assert.equal(small.falling, false);
  // One cat on the Rect, left of the SmallBox, walks right into it.
  place(a, small.rect.x - a.rect.width - 2, 264 - a.rect.height); place(b, 3000, 432 - b.rect.height);
  const smallX = small.rect.x;
  step(game, 20, [RIGHT, IDLE]);
  assert.ok(small.rect.x > smallX + 20, 'one cat pushes the SmallBox (ceil(0.1 * 2) = 1): ' + (small.rect.x - smallX));
  // NormalBox: one cat alone cannot, two cats together can.
  place(a, normal.rect.x - a.rect.width - 1, 432 - a.rect.height); place(b, 3150, 432 - b.rect.height);
  const normalX = normal.rect.x;
  step(game, 20, [RIGHT, IDLE]);
  assert.equal(normal.rect.x, normalX, 'one cat: ceil(1.0 * 2) = 2 needed');
  place(b, a.rect.x - b.rect.width - 1, 432 - b.rect.height);
  step(game, 20, [RIGHT, RIGHT]);
  assert.ok(normal.rect.x > normalX + 10, 'two cats push it: ' + (normal.rect.x - normalX));
});

test('a SmallBox on a cat\'s head rides it like a push box (stack-riding path)', () => {
  const game = load('stage_traffic_light01', 2);
  const [a, b] = game.players;
  const [small] = boxesNamed(game, 'SmallBox');
  place(a, 3000, 432 - a.rect.height); place(b, 2800, 432 - b.rect.height);
  small.applyRect({ ...small.rect, x: a.rect.x + a.rect.width / 2 - 24, y: a.rect.y - 48 });
  small.falling = false; small.velocityY = 0; small.wasSupported = true;
  step(game, 3, idle(2));
  const offset = small.rect.x - a.rect.x;
  step(game, 10, [RIGHT, IDLE]);
  assert.equal(small.rect.x - a.rect.x, offset, 'rides the walking cat');
  assert.equal(small.rect.y + small.rect.height, a.rect.y, 'still on the head');
});

// ---------------------------------------------------------------------------------------------------------------
// colorbox-colour-push: FUN_7ff72bb3b350 colour = p0 % n (p3 skip); FUN_7ff72bb3c2e0 needs a cat of that colour.

test('6-1 colours at party 4 are p0 % 4 with the p3 skip: [0, 1, 2, 3, 0, 1, 3, 3]', () => {
  // Rows p0 / p3: 0, 1, 2, (3, 2), (4, 2), (5, 2), (6, 2) -> 2 == 2 % 4 -> 3, (7, 2) -> 3.
  const boxes = boxesNamed(load('stage_push01', 4), 'ColorBox');
  assert.deepEqual(boxes.map((box) => box.colorIndex), [0, 1, 2, 3, 0, 1, 3, 3]);
  // Party 2: 0, 1, 0, 1, then p3 2 % 2 = 0 bumps every 0 to 1: 4 -> 1, 5 -> 1, 6 -> 1, 7 -> 1.
  assert.deepEqual(boxesNamed(load('stage_push01', 2), 'ColorBox').map((box) => box.colorIndex), [0, 1, 0, 1, 1, 1, 1, 1]);
});

test('6-1: the colour-0 box moves for the slot-0 cat, not for the slot-1 cat; a matching cat behind another cat counts', () => {
  const game = load('stage_push01', 2);
  const [a, b] = game.players;   // slots 0 and 1
  assert.deepEqual(game.playerInputSlots, [0, 1]);
  const [box] = boxesNamed(game, 'ColorBox');   // (576, 432) colour 0
  const startX = box.rect.x;
  place(b, box.rect.x - b.rect.width - 1, 432 - b.rect.height); place(a, 200, 432 - a.rect.height);
  step(game, 20, [IDLE, RIGHT]);
  assert.equal(box.rect.x, startX, 'slot 1 cannot push colour 0');
  place(a, b.rect.x - a.rect.width - 1, 432 - a.rect.height);
  step(game, 20, [RIGHT, RIGHT]);
  assert.ok(box.rect.x > startX + 10, 'the slot-0 cat in the chain (behind slot 1) moves it: ' + (box.rect.x - startX));
  place(b, 1200, 432 - b.rect.height);
  place(a, box.rect.x - a.rect.width - 1, 432 - a.rect.height);
  const x1 = box.rect.x;
  step(game, 20, [RIGHT, IDLE]);
  assert.ok(box.rect.x > x1 + 10, 'slot 0 alone moves it');
});

test('box pushes box: a cat pushing a box into a second box moves both when each requirement is met', () => {
  // 1-3: box '4' (weight 10 -> 1 cat) and box '6' (filter -4, weight 10). Put them side by side on the floor.
  const game = load('stage_jump02', 2);
  const [a, b] = game.players;
  const [first, second] = game.pushBoxes;
  first.applyRect({ ...first.rect, x: 1300, y: 432 - first.rect.height });
  second.applyRect({ ...second.rect, x: 1300 + first.rect.width, y: 432 - second.rect.height });
  for (const box of [first, second]) { box.falling = false; box.velocityY = 0; box.wasSupported = true; }
  place(a, 1300 - a.rect.width - 1, 432 - a.rect.height); place(b, 900, 432 - b.rect.height);
  step(game, 2, idle(2));
  const x0 = [first.rect.x, second.rect.x];
  step(game, 20, [RIGHT, IDLE]);
  assert.ok(first.rect.x > x0[0] + 10 && second.rect.x > x0[1] + 10, 'both moved: ' + [first.rect.x - x0[0], second.rect.x - x0[1]]);
  assert.ok(!overlaps(first.rect, second.rect), 'never inside each other');
  assert.ok(Math.abs(first.rect.x + first.rect.width - second.rect.x) < 1e-6, 'still touching');
});

// ---------------------------------------------------------------------------------------------------------------
// weighted-lift-ex-variants: FUN_7ff72bb63cf0 wide (Ex) / narrow (Ex2); travel p0 + p[n + 1]; p2 per tick.

test('6-3 Ex lifts are the wide 194 x 18 slab 67 below the row point; 12-2 Ex2 is the narrow 56 x 18 slab', () => {
  const sixThree = load('stage_weight02', 2).weightedLifts.filter((lift) => lift.spawn.actorName === 'WeightedLiftEx');
  assert.ok(sixThree.length >= 2);
  for (const lift of sixThree) {
    assert.deepEqual(rectOf(lift), { x: lift.spawn.x - 92, y: lift.spawn.y + 67, width: 194, height: 18 });
  }
  const ex2 = load('stage_jump05', 2).weightedLifts.find((lift) => lift.spawn.actorName === 'WeightedLiftEx2');
  assert.deepEqual(rectOf(ex2), { x: 1676, y: 403, width: 56, height: 18 });
});

for (const [party, travel] of [[2, -192], [3, -144], [4, -96]]) {
  test(`12-2 Ex2 at party ${party}: the whole party on it carries it ${travel} at 0.5 per tick (p0 -192 + p[${party + 1}])`, () => {
    const game = load('stage_jump05', party);
    const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLiftEx2');
    // p1 = 100: required = max(2, ceil(n)) = n. 12-2's Wind pushes a rising stack sideways (a stage mechanic, not the
    // lift rule under test), so the winds are cleared here.
    game.winds.length = 0;
    const cats = game.players;
    place(cats[0], lift.rect.x - 8, lift.rect.y - 46); place(cats[1], lift.rect.x + 24, lift.rect.y - 46);
    for (let i = 2; i < cats.length; i++) place(cats[i], cats[i - 2].rect.x, cats[i - 2].rect.y - 46);
    const restY = lift.rect.y;
    const ys = [];
    for (let i = 0; i < 500; i++) { step(game, 1, idle(party)); ys.push(lift.rect.y); }
    const deltas = ys.map((y, i) => y - (i ? ys[i - 1] : restY)).filter((d) => d !== 0);
    assert.ok(deltas.every((d) => Math.abs(Math.abs(d) - 0.5) < 1e-9), '0.5 per tick: ' + [...new Set(deltas)]);
    assert.equal(Math.min(...ys), restY + travel, 'full travel');
  });
}

test('6-3 L1 (816, 384, -130, 100, 0.5, -20, -25, -35): travel -150 / -155 / -165 at party 2 / 3 / 4', () => {
  for (const [party, travel] of [[2, -150], [3, -155], [4, -165]]) {
    const game = load('stage_weight02', party);
    const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLiftEx' && entry.spawn.x === 816);
    // p1 = 100: required = n, so the whole party stands side by side on the 194-wide slab.
    game.players.forEach((cat, i) => place(cat, lift.rect.x + 8 + 44 * i, lift.rect.y - cat.rect.height));
    const restY = lift.rect.y;
    let lowest = restY;
    for (let i = 0; i < 600; i++) { step(game, 1, idle(party)); lowest = Math.min(lowest, lift.rect.y); }
    assert.equal(lowest, restY + travel, 'party ' + party);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// lift-horizontal-carry: FUN_7ff72bb550a0 body {-59, -9, 118, 18}; FUN_7ff72bb55370 carries riders by dx and dy.

test('11-4 Lift is 118 x 18 and a cat riding it travels sideways with the 1488-unit sweep', () => {
  const game = load('stage_magnet02', 2);
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'Lift');
  assert.ok(near(rectOf(lift), { x: 672 - 59, y: 153.6 - 9, width: 118, height: 18 }), JSON.stringify(rectOf(lift)));
  const [a, b] = game.players;
  // Start the trip: b stands on the DelaySwitch (552, 290); a rides the slab.
  place(a, lift.rect.x + 40, lift.rect.y - a.rect.height);
  place(b, 552 - 16, 290 - b.rect.height);
  let maxDx = 0, maxGap = 0;
  const startX = a.rect.x;
  // delayswitch-countdown: the pad starts the lift only after its 10 s countdown (600 frames).
  for (let i = 0; i < 160 + 600; i++) {
    const liftX = lift.rect.x;
    step(game, 1, idle(2));
    if (a.deathTimer > 0) break;
    maxDx = Math.max(maxDx, a.rect.x - startX);
    if (lift.rect.x !== liftX) maxGap = Math.max(maxGap, Math.abs((a.rect.x - lift.rect.x) - 40));
  }
  assert.ok(maxDx > 300, 'the rider travelled with the lift: ' + maxDx);
  assert.ok(maxGap < 1e-6, 'it kept its place on the slab: ' + maxGap);
});

// ---------------------------------------------------------------------------------------------------------------
// bridge-folded-start-and-motion: FUN_7ff72bb4f630 / FUN_7ff72bb4f9d0 / FUN_7ff72bb4fea0 / FUN_7ff72bb4f230.

test('1-1 Bridge (1872, 432, 20 cells of 20, p3 14) starts pre-extended trunc(14 (8 - n) 0.1) cells and solid', () => {
  // Cells are 21 x 20 (horizontal: seg + 1 wide); head distance m * 20 to the left of the row cell.
  const expected = { 2: { x: 1712, y: 432, width: 181, height: 20 }, 4: { x: 1772, y: 432, width: 121, height: 20 },
    8: { x: 1872, y: 432, width: 21, height: 20 } };
  for (const party of [2, 4, 8]) {
    const [bridge] = load('stage_jump01', party).bridges;
    assert.deepEqual(rectOf(bridge), expected[party], 'party ' + party);
    assert.equal(bridge.isSolid(), true);
    assert.equal(bridge.view.visible, true);
  }
});

test('1-1: the switch extends the bridge 2 units per tick to its full 401 x 20 span (110 ticks from party 2)', () => {
  const game = load('stage_jump01', 2);
  const [bridge] = game.bridges;
  const [a] = game.players;
  place(a, 1920 - 16, 432 - a.rect.height);
  const widths = [];
  for (let i = 0; i < 130; i++) { step(game, 1, idle(2)); widths.push(bridge.rect.width); }
  const grow = widths.map((w, i) => w - (i ? widths[i - 1] : 181)).filter((d) => d !== 0);
  assert.ok(grow.every((d) => Math.abs(d - 2) < 1e-9), '2 per tick: ' + [...new Set(grow)]);
  assert.deepEqual(rectOf(bridge), { x: 1492, y: 432, width: 401, height: 20 });
  assert.equal(grow.length, 110);
});

test('frame 0 at parties 2/4/8: 1-3, 10-2 and 12-4 bridges are folded nubs; 12-2 KeyBridges are folded until a key is held', () => {
  for (const party of [2, 4, 8]) {
    for (const [source, x, y, w, h] of [['stage_jump02', 826, 432, 21, 20], ['stage_jump02', 726, 96, 20, 21],
      ['stage_auto_scroll02', 1776, 432, 33, 32]]) {
      const bridge = load(source, party).bridges.find((entry) => entry.spawn.x === x && entry.spawn.y === y);
      assert.deepEqual(rectOf(bridge), { x, y, width: w, height: h }, source + ' p' + party);
    }
  }
  const game = load('stage_jump05', 2);
  const keyBridges = game.bridges.filter((bridge) => bridge.spawn.actorName === 'KeyBridge');
  assert.equal(keyBridges.length, 2);
  for (const bridge of keyBridges) assert.ok(near(rectOf(bridge), { x: 1684.8, y: 441.6, width: 21, height: 20 }), JSON.stringify(rectOf(bridge)));
  step(game, 30, idle(2));
  for (const bridge of keyBridges) assert.equal(bridge.rect.width, 21, 'still folded without the key');
  // Hold the key: both bridges extend (left to 1304.8..1705.8, right to 1684.8..1885.8).
  const [key] = game.keys;
  const [a] = game.players;
  place(a, key.rect.x, key.rect.y + key.rect.height - a.rect.height);
  for (let i = 0; i < 260; i++) step(game, 1, idle(2));
  assert.ok(game.carriedKeys.length > 0, 'the key is held');
  const spans = keyBridges.map(rectOf).sort((p, q) => p.x - q.x);
  assert.ok(near(spans[0], { x: 1304.8, y: 441.6, width: 401, height: 20 }), JSON.stringify(spans[0]));
  assert.ok(near(spans[1], { x: 1684.8, y: 441.6, width: 201, height: 20 }), JSON.stringify(spans[1]));
});

test('Gates shrink into their row cell at 2 per tick when opened and grow back at 1 per tick when closed (10-2)', () => {
  const game = load('stage_jump04', 2);
  const gate = game.gates[0];   // (1497.6, 432, 5 cells of 30, up): 30 wide, 4 * 30 + 31 tall
  const pad = game.switches.find((entry) => entry.spawn.label === 'Gate1');
  park(game, []);
  assert.ok(near(rectOf(gate), { x: 1497.6, y: 312, width: 30, height: 151 }), JSON.stringify(rectOf(gate)));
  place(game.players[0], pad.spawn.x - 16, 432 - 46);   // the cat on the Gate1 switch opens it
  const heights = [];
  for (let i = 0; i < 70; i++) { step(game, 1, idle(2)); heights.push(gate.rect.height); }
  assert.equal(heights.at(-1), 31, 'shrunk to its row cell');
  const shrink = heights.map((h, i) => h - (i ? heights[i - 1] : 151)).filter((d) => d !== 0);
  assert.ok(shrink.length === 60 && shrink.every((d) => Math.abs(d + 2) < 1e-9), '120 units at 2 per tick: ' + [...new Set(shrink)]);
  assert.equal(gate.isSolid(), true, 'the row cell stays solid');
  // Release: the cat leaves and the (authored, retaining) switch is released by hand; the gate closes.
  place(game.players[0], 200, 432 - 46);
  pad.pressed = false;
  step(game, 1, idle(2));
  for (let i = 0; i < 118; i++) step(game, 1, idle(2));
  assert.ok(gate.rect.height < 151 && gate.rect.height > 140, 'growing back at 1 per tick: ' + gate.rect.height);
  step(game, 2, idle(2));
  assert.equal(gate.rect.height, 151, 'closed again after 120 ticks');
});

test('a growing gate waits instead of entering a cat; a head-push bridge (10-2 Bridge 1, p5 1) shoves the cat', () => {
  const game = load('stage_jump04', 2);
  const gate = game.gates[0];
  const [a, b] = game.players;
  place(b, 100, 432 - b.rect.height);
  gate.open();
  step(game, 70, idle(2));
  place(a, gate.rect.x - 4, gate.rect.y - a.rect.height - 20);
  a.velocity.y = 0;
  const cell = { ...gate.rect };
  place(a, gate.rect.x, cell.y - a.rect.height - 2);   // just above the row cell, inside the gate's closed span
  gate.close();
  step(game, 30, [IDLE, IDLE]);
  assert.ok(!overlaps(gate.rect, a.rect) || a.deathTimer > 0 || a.rect.y + a.rect.height <= gate.rect.y + 1e-6, 'never inside the cat');
  const pusher = game.bridges.find((bridge) => bridge.spawn.label === '1');
  assert.equal(pusher.segmentMotion.headPush, true);
});

test('determinism (240 frames): two 1-1 runtimes, a cat on the bridge switch then off it, identical bridge and cats', () => {
  const make = () => load('stage_jump01', 2, 3);
  const games = [make(), make()];
  for (const game of games) place(game.players[0], 1920 - 16, 432 - game.players[0].rect.height);
  for (let frame = 0; frame < 240; frame++) {
    const input = frame < 60 ? IDLE : frame < 90 ? LEFT : IDLE;
    for (const game of games) step(game, 1, [input, IDLE]);
    const snap = (game) => JSON.stringify([game.bridges.map(rectOf), game.players.map(rectOf), game.pushBoxes.map(rectOf)]);
    assert.equal(snap(games[0]), snap(games[1]), 'frame ' + frame);
  }
});

test('every stage at parties 2/4/8, frame 0: no live cat inside a tile, push box, bridge or gate', () => {
  const problems = [];
  for (const entry of runtime.stages) {
    for (const party of [2, 4, 8]) {
      const game = load(entry.source, party);
      const solids = [
        ...game.pushBoxes.map((box) => [box.spawn.actorName, box.rect]),
        ...game.bridges.filter((bridge) => bridge.isSolid()).map((bridge) => [bridge.spawn.actorName, bridge.rect]),
        ...game.gates.filter((gate) => gate.isSolid()).map((gate) => ['Gate', gate.rect]),
      ];
      for (const [i, cat] of game.players.entries()) {
        const inner = { x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 };
        if (game.tileMap.rectHitsSolid(inner)) problems.push(`${entry.source} p${party} cat ${i} inside tiles`);
        for (const [name, rect] of solids) if (overlaps(inner, rect)) problems.push(`${entry.source} p${party} cat ${i} inside ${name}`);
      }
    }
  }
  assert.deepEqual(problems.filter((line) => !line.startsWith('stage_seesaw01')), []);
});

// ---------------------------------------------------------------------------------------------------------------
// Codex review of batch 3: the box line and the bridge head shove commit atomically (all or none).

// Tile fixtures write into the stage's shared map table: always restore them.
function withChips(game, chips, body) {
  const saved = chips.map(([tx, ty]) => [tx, ty, game.tileMap.chipAt(tx, ty)]);
  try {
    for (const [tx, ty, chip] of chips) game.tileMap.setChip(tx, ty, chip);
    body();
  } finally {
    for (const [tx, ty, chip] of saved) game.tileMap.setChip(tx, ty, chip);
  }
}
const noBoxOverlap = (game) => game.pushBoxes.every((box, i) => game.pushBoxes.every((other, j) => j <= i || !overlaps(box.rect, other.rect)));
const noCatInBox = (game) => game.players.every((cat) => game.pushBoxes.every((box) => !overlaps({ x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 }, box.rect)));
function twoBoxesOnFloor(game, x) {
  const [first, second] = game.pushBoxes;
  first.applyRect({ ...first.rect, x, y: 432 - first.rect.height });
  second.applyRect({ ...second.rect, x: x + first.rect.width, y: 432 - second.rect.height });
  for (const box of [first, second]) { box.falling = false; box.velocityY = 0; box.wasSupported = true; }
  return [first, second];
}

test('box line into a one-chip gap: the front box tips into it, the boxes never overlap, no cat ends inside a box', () => {
  const game = load('stage_jump02', 2);
  // Carve a one-chip pit (x 1392..1440) in the 1-3 floor.
  withChips(game, [[29, 9, 'MC_NON']], () => {
    const [a, b] = game.players;
    const [first, second] = twoBoxesOnFloor(game, 1300);
    place(a, 1300 - a.rect.width - 1, 432 - a.rect.height); place(b, 900, 432 - b.rect.height);
    let fell = false;
    for (let frame = 0; frame < 60; frame++) {
      step(game, 1, [frame < 25 ? RIGHT : IDLE, IDLE]);
      assert.ok(noBoxOverlap(game), 'boxes overlap at frame ' + frame);
      assert.ok(noCatInBox(game), 'a cat is inside a box at frame ' + frame);
      if (second.rect.y + second.rect.height > 432 + 4) fell = true;
    }
    assert.ok(fell, 'the front box dropped into the gap: ' + JSON.stringify(second.rect));
    assert.ok(first.rect.x > 1300, 'the line moved');
  });
});

test('box line whose last box is blocked by a wall: nothing moves and the pusher stays outside the boxes', () => {
  const game = load('stage_jump02', 2);
  // A wall chip right of the second box (x 1392..1440, row 8).
  withChips(game, [[29, 8, 'MC_WAL']], () => {
    const [a, b] = game.players;
    const [first, second] = twoBoxesOnFloor(game, 1392 - 80);
    place(a, first.rect.x - a.rect.width - 1, 432 - a.rect.height); place(b, 900, 432 - b.rect.height);
    const before = [first.rect.x, second.rect.x];
    for (let frame = 0; frame < 20; frame++) {
      step(game, 1, [RIGHT, IDLE]);
      assert.deepEqual([first.rect.x, second.rect.x], before, 'frame ' + frame);
      assert.ok(noCatInBox(game), 'the pusher is not inside a box (frame ' + frame + ')');
    }
  });
});

test('box line: the front box pushed onto a switch pad presses it', () => {
  const game = load('stage_jump02', 2);
  const pad = game.switches.find((entry) => entry.rect.x === 1384);
  const [a, b] = game.players;
  const [first, second] = twoBoxesOnFloor(game, 1290);
  place(a, 1290 - a.rect.width - 1, 432 - a.rect.height); place(b, 900, 432 - b.rect.height);
  for (let frame = 0; frame < 40 && second.rect.x < 1380; frame++) step(game, 1, [RIGHT, IDLE]);
  step(game, 3, idle(2));
  assert.ok(second.rect.x >= 1380 && second.rect.x < 1416, 'the front box is over the pad: ' + second.rect.x);
  assert.ok(noBoxOverlap(game) && noCatInBox(game));
  assert.equal(pad.pressed, true, 'the moved, landed box holds the pad');
});

// 10-2 Bridge '1' (384, 360, 3 cells of 32, left, p5 1): the head shoves what it meets. A fixture floor (row 8,
// x 240..384) lets a cat stand in the strip's band; its switch (480, 288) is held by the other cat.
function shoveFixture(extraChips, body) {
  const game = load('stage_jump04', 2);
  const bridge = game.bridges.find((entry) => entry.spawn.label === '1');
  const pad = game.switches.find((entry) => entry.spawn.label === 'Bridge1');
  withChips(game, [[5, 8, 'MC_FLC'], [6, 8, 'MC_FLC'], [7, 8, 'MC_FLC'], ...extraChips], () => {
    const [a, b] = game.players;
    place(a, 320, 384 - a.rect.height);
    place(b, pad.spawn.x - 16, 288 - b.rect.height);
    body(game, bridge, a);
  });
}

test('bridge head shove into open space: the strip extends and the cat moves with its head, never inside it', () => {
  shoveFixture([], (game, bridge, cat) => {
    let shoved = false;
    for (let frame = 0; frame < 60; frame++) {
      const x = cat.rect.x;
      step(game, 1, idle(2));
      if (cat.rect.x < x - 1e-9) shoved = true;
      assert.ok(!overlaps(cat.rect, bridge.rect), 'never inside the strip (frame ' + frame + ')');
    }
    assert.ok(shoved, 'the head shoved the cat');
    assert.equal(bridge.segmentMotion.progress, bridge.segmentMotion.length, 'fully extended');
  });
});

test('bridge head shove into a wall: neither the strip nor the cat moves while the shove would bury the cat', () => {
  // A wall chip (x 288..336, row 7) left of the cat: the cat is at x 320..352, so any shove puts it into the wall.
  shoveFixture([[6, 7, 'MC_WAL']], (game, bridge, cat) => {
    place(cat, 336, 384 - cat.rect.height);
    let stuckAt = -1;
    for (let frame = 0; frame < 60; frame++) {
      step(game, 1, idle(2));
      assert.ok(!game.tileMap.rectHitsSolid({ x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 }),
        'the cat is never inside a tile (frame ' + frame + ')');
      assert.ok(!overlaps(cat.rect, bridge.rect), 'never inside the strip (frame ' + frame + ')');
      if (stuckAt < 0 && bridge.rect.x + bridge.rect.width >= cat.rect.x && bridge.rect.x <= cat.rect.x + cat.rect.width) stuckAt = frame;
    }
    assert.ok(bridge.segmentMotion.progress < bridge.segmentMotion.length, 'the strip stopped at the cat');
    assert.equal(cat.rect.x, 336, 'the cat did not move');
  });
});

test('determinism (120 frames): two shove fixtures, identical strip and cat every frame', () => {
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const trace = [];
    shoveFixture([], (game, bridge, cat) => {
      for (let frame = 0; frame < 120; frame++) { step(game, 1, idle(2)); trace.push(JSON.stringify([rectOf(bridge), rectOf(cat)])); }
    });
    runs.push(trace);
  }
  assert.deepEqual(runs[0], runs[1]);
});

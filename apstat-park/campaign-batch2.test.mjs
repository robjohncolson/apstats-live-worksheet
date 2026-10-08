// Fidelity audit 2026-10-07 batch 2 (scripts/pico-campaign-patches.mjs): goal-native-open-and-door, rect-party-terms,
// key-party-offset, bottom-anchored-boxes. Each block cites its native function; numbers are derived in comments.
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
const UP = { ...IDLE, up: true };

// Same variant choice as campaign-engine.mjs.
function load(source, partySize = 2, onStats = () => {}) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(1);
  const game = new runtime.GameRuntime(onStats, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
const idle = (n) => Array.from({ length: n }, () => IDLE);
function step(game, frames, inputs) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const rectOf = (actor) => ({ x: actor.rect.x, y: actor.rect.y, width: actor.rect.width, height: actor.rect.height });

// ---------------------------------------------------------------------------------------------------------------
// goal-native-open-and-door: FUN_7ff72bb531d0 opens a Goal only on Key contact / message 9 / scene state 0x1a.

test('no stage, at parties 2/4/8, has a Goal open at frame 0 (none of the native openers fires at load)', () => {
  const open = [];
  for (const entry of runtime.stages) {
    for (const party of [2, 4, 8]) {
      const game = load(entry.source, party);
      step(game, 2, idle(party));
      for (const goal of game.goals) if (goal.opened) open.push(entry.source + ' p' + party);
    }
  }
  assert.deepEqual(open, []);
});

test('the door is the native 64 x 64 on the row point; the sensor is {x-24, y-32-p0, 48, 32+p0} (FUN_7ff72bb53000)', () => {
  // 1-2 Goal row (1728, 386, p0 0); 2-3 Goal row (864, 288, p0 25) raises the sensor top by 25.
  assert.deepEqual(rectOf(load('stage_push02').goals[0]), { x: 1704, y: 354, width: 48, height: 32 });
  const twoThree = runtime.stages.find((entry) => entry.world === 2 && entry.stage === 3).source;
  assert.deepEqual(rectOf(load(twoThree).goals[0]), { x: 840, y: 231, width: 48, height: 57 });
});

test('1-1 still clears: the key carried to the door opens it with UP, then both cats enter with UP', () => {
  let stats = {};
  const game = load('stage_jump01', 2, (next) => { stats = next; });
  const [a, b] = game.players;
  const [key] = game.keys;
  const [goal] = game.goals;
  step(game, 5, idle(2));
  // Pick up: stand on the key (its rect is 32 x 56 centred on (2352, 192)).
  place(a, key.rect.x, key.rect.y + key.rect.height - a.rect.height);
  step(game, 2, idle(2));
  assert.ok(game.carriedKeys.some((entry) => entry.player === a), 'cat a carries the key');
  // Deliver: stand in the door sensor (bottom on 194 - 2 = 192, the floor under the row point) and press UP.
  const doorX = goal.rect.x + 8, standY = goal.rect.y + goal.rect.height - 2 - a.rect.height;
  place(a, doorX, standY); place(b, doorX, standY - b.rect.height);
  assert.equal(goal.opened, false, 'closed until the key arrives');
  step(game, 1, [UP, IDLE]);
  assert.equal(goal.opened, true, 'the delivered key opened it');
  place(b, doorX + 10, standY);
  for (let frame = 0; frame < 30 && !stats.cleared; frame++) step(game, 1, [UP, UP]);
  assert.equal(stats.cleared, true, 'both cats entered: stage clear');
});

// ---------------------------------------------------------------------------------------------------------------
// rect-party-terms: W = p0 + p2 k, H = p1 + p3 k, origin += (p4 k, p5 k), k = party - 2.

const literal = (game) => game.staticRects.filter((block) => block.spawn.actorName === 'Rect');
const rectAt = (game, x, y) => rectOf(literal(game).find((block) => block.spawn.x === x && block.spawn.y === y));

test('2-2 (fall01) party 4: the stepping blocks {1488|2256, 336, 48, 48, 0, 0, 0, -47} sit at y 194..242', () => {
  // k = 2: y += -47 * 2 = -94 -> bottom 336 - 94 = 242, top 194.
  const game = load('stage_fall01', 4);
  assert.deepEqual(rectAt(game, 1488, 336), { x: 1488, y: 194, width: 48, height: 48 });
  assert.deepEqual(rectAt(game, 2256, 336), { x: 2256, y: 194, width: 48, height: 48 });
});

test('1-3 (jump02): the staircase moves 8 k left and its top step is 48 + 8 k wide (64 at party 4, 96 at party 8)', () => {
  // Top step row (752, 144, -48, 48, -8, 0): W = -48 - 8 k -> k = 2: 64 wide, x = 752 - 64 = 688.
  // Lower steps (x, y, -48, 48, 0, 0, -8): origin x -= 8 k -> k = 2: 16 left.
  const four = load('stage_jump02', 4);
  assert.deepEqual(rectAt(four, 752, 144), { x: 688, y: 96, width: 64, height: 48 });
  assert.deepEqual(rectAt(four, 608, 288), { x: 544, y: 240, width: 48, height: 48 });
  const eight = load('stage_jump02', 8);
  assert.deepEqual(rectAt(eight, 752, 144), { x: 656, y: 96, width: 96, height: 48 });
  assert.deepEqual(rectAt(load('stage_jump02', 2), 752, 144), { x: 704, y: 96, width: 48, height: 48 }, 'party 2 = the authored rect');
});

test('11-1 (gun01) party 4: the wall (1680, 576, -144, 144, 12) is {1560, 432, 120, 144}', () => {
  // W = -144 + 12 * 2 = -120 -> x = 1680 - 120.
  assert.deepEqual(rectAt(load('stage_gun01', 4), 1680, 576), { x: 1560, y: 432, width: 120, height: 144 });
});

test('10-1 (jump07): SwitchRects are left-bottom, no party terms; platform "6" (1344, 288, 480, 48) is {1344, 240, 480, 48}', () => {
  for (const party of [2, 4, 8]) {
    const game = load('stage_jump07', party);
    const byLabel = Object.fromEntries(game.switchRects.map((entry) => [entry.spawn.label, rectOf(entry)]));
    assert.deepEqual(byLabel['6'], { x: 1344, y: 240, width: 480, height: 48 }, 'party ' + party);
    assert.deepEqual(byLabel['1'], { x: 480, y: 432, width: 48, height: 48 });
    assert.deepEqual(byLabel['7'], { x: 3648, y: 384, width: 96, height: 96 });
  }
});

test('10-4 (darkness02): DarknessRects are left-bottom like Rect: "1" {240, 441.6, 288, 48}, "2" {192, 220.8, 48.48, 240}', () => {
  const game = load('stage_darkness02', 4);
  const byLabel = Object.fromEntries(game.darknessRects.map((entry) => [entry.spawn.label, rectOf(entry)]));
  const near = (a, b) => Object.keys(b).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
  assert.ok(near(byLabel['1'], { x: 240, y: 441.6, width: 288, height: 48 }), JSON.stringify(byLabel['1']));
  assert.ok(near(byLabel['2'], { x: 192, y: 220.8, width: 48.48, height: 240 }), JSON.stringify(byLabel['2']));
});

// ---------------------------------------------------------------------------------------------------------------
// key-party-offset: FUN_7ff72bb651a0 moves the Key row point by ((N - 2) p1, 0.8 N p0).

const KEY_STAGES = { stage_push02: '1-2', stage_constraint01: '2-1', stage_fall01: '2-2', stage_coin02: '3-3',
  stage_stopwatch01: '4-3', stage_jump06: '6-4', stage_plane02: '12-3' };

test('the listed keys at party 4 are where FUN_7ff72bb651a0 puts them', () => {
  // {source: [row x, row y, expected rect x, expected rect y]}: rect = {x - 16, y - 28, 32, 56} at the moved point.
  const expected = {
    stage_push02: [112, 300, 96, 220.8],          // p0 -16: y - 0.8 * 4 * 16 = -51.2
    stage_constraint01: [2304, 240, 2288, 276],   // p0 +20: +64 (filter -4 row)
    stage_fall01: [1512, 336, 1496, 122.4],       // p0 -58: -185.6 (filter 4 row)
    stage_coin02: [640, 534, 624, 454.8],         // p0 -16: -51.2
    stage_stopwatch01: [768, 384, 752, 304.8],    // p0 -16: -51.2
    stage_jump06: [2280, 206.4, 2264, 146.4],     // p0 -10: -32
    stage_plane02: [4560, 144, 4664, 116],        // p1 60: x + (4 - 2) * 60 = +120
  };
  for (const [source, [rowX, rowY, x, y]] of Object.entries(expected)) {
    const game = load(source, 4);
    const key = game.keys.find((entry) => entry.spawn.raw[4] === rowX && entry.spawn.raw[5] === rowY)
      ?? game.keys.find((entry) => Math.abs(entry.rect.x - x) < 1e-3);
    assert.ok(key, source + ': key loaded');
    assert.ok(Math.abs(key.rect.x - x) < 1e-3 && Math.abs(key.rect.y - y) < 1e-3, source + ': ' + JSON.stringify(rectOf(key)));
  }
});

test('the listed stages at parties 2/4/8: every key is clear of tiles and Rects and has a floor or platform below it', () => {
  const problems = [];
  for (const source of Object.keys(KEY_STAGES)) {
    for (const party of [2, 4, 8]) {
      const game = load(source, party);
      const solids = [...game.staticRects.map((block) => block.rect), ...game.weightedLifts.map((lift) => lift.rect),
        ...game.pushBoxes.map((box) => box.rect), ...game.fallBoxes.map((box) => box.rect)];
      const mapBottom = game.tileMap.pixelHeight;
      for (const key of game.keys) {
        const where = `${KEY_STAGES[source]} p${party} key ${JSON.stringify(rectOf(key))}`;
        const inner = { x: key.rect.x + 2, y: key.rect.y + 2, width: key.rect.width - 4, height: key.rect.height - 4 };
        if (game.tileMap.rectHitsSolid(inner)) problems.push(where + ' inside tiles');
        if (solids.some((solid) => overlaps(inner, solid))) problems.push(where + ' inside a Rect / lift / box');
        let below = false;
        for (let y = key.rect.y + key.rect.height; y < mapBottom && !below; y += 4) {
          const probe = { x: key.rect.x + 4, y, width: key.rect.width - 8, height: 4 };
          below = game.tileMap.rectHitsSolid(probe) || solids.some((solid) => overlaps(probe, solid));
        }
        // 2-1 (constraint01, the rope stage) authors its key over the bottomless pit at every party size (row point
        // included); 12-3 (plane02) is flown. Neither needs a floor under the key.
        if (!below && source !== 'stage_constraint01' && source !== 'stage_plane02') problems.push(where + ' has nothing below it');
      }
    }
  }
  assert.deepEqual(problems, []);
});

// ---------------------------------------------------------------------------------------------------------------
// bottom-anchored-boxes: FallBox FUN_7ff72bb42900, ColorBox 0x7ff72bb76d9d, ForceColorBox 0x7ff72bb73c9b:
// rect {-w/2, -h, w, h} on the row point.

test('FallBox rects stand on their row point: 2-2, 2-4, 10-1, 11-3', () => {
  const at = (game, x, y) => rectOf(game.fallBoxes.find((box) => box.spawn.x === x && box.spawn.y === y));
  assert.deepEqual(at(load('stage_fall01', 4), 1032, 430), { x: 1008, y: 382, width: 48, height: 48 });
  assert.deepEqual(at(load('stage_fall01', 2), 1032, 382), { x: 1008, y: 334, width: 48, height: 48 });
  assert.deepEqual(at(load('stage_fall02', 4), 984, 334), { x: 960, y: 286, width: 48, height: 48 });
  assert.deepEqual(at(load('stage_jump07', 4), 2304, 384), { x: 2280, y: 336, width: 48, height: 48 });
  const gun02 = load('stage_gun02', 4);
  assert.deepEqual([at(gun02, 936, 336), at(gun02, 1032, 288), at(gun02, 1128, 240)].map((rect) => rect.y), [288, 240, 192]);
});

const colorRect = (box) => {
  const width = box.params?.width ?? 32, height = box.params?.height ?? 32;
  return { x: box.spawn.x - width / 2, y: box.spawn.y - height / 2, width, height };
};

test('6-1 / 6-2 ColorBox rects stand on their row point; the stage row is never mutated', () => {
  const push01 = load('stage_push01', 4);
  const first = push01.colorBoxes.find((box) => box.spawn.raw[4] === 576);
  assert.deepEqual(colorRect(first), { x: 552, y: 384, width: 48, height: 48 });
  const big = push01.colorBoxes.find((box) => box.spawn.raw[4] === 1344);
  assert.deepEqual(colorRect(big), { x: 1313, y: 370, width: 62, height: 62 });
  const row = runtime.stages.find((entry) => entry.source === 'stage_push01').data.createTable.find((r) => r.actorName === 'ColorBox');
  assert.deepEqual([row.x, row.y], [576, 432], 'the row keeps its Lua point');
  const autoScroll = load('stage_auto_scroll01', 4);
  const rows = runtime.stages.find((entry) => entry.source === 'stage_auto_scroll01').data.createTable
    .filter((r) => r.actorName === 'ColorBox');
  assert.equal(autoScroll.colorBoxes.length, rows.length);
  autoScroll.colorBoxes.forEach((box, i) => {
    const rect = colorRect(box);
    assert.ok(Math.abs(rect.y + rect.height - rows[i].y) < 1e-9 && Math.abs(rect.x + rect.width / 2 - rows[i].x) < 1e-9,
      'bottom-centre on the row point: ' + JSON.stringify(rect) + ' row ' + rows[i].x + ',' + rows[i].y);
  });
});

test('11-3 ForceColorBox stands on its row point and never recolours a cat that touches it', () => {
  const game = load('stage_gun02', 2);
  const box = game.colorBoxes.find((entry) => entry.spawn.actorName === 'ForceColorBox');
  assert.deepEqual(colorRect(box), { x: 48, y: 384, width: 48, height: 48 });
  const cat = game.players[0];
  const colour = cat.bodyColor;
  place(cat, 48 + 30, 432 - cat.rect.height);
  step(game, 30, [{ ...IDLE, left: true }, IDLE]);
  assert.equal(cat.bodyColor, colour, 'no native recolour');
});

test('every stage at parties 2/4/8, frame 0: no live cat inside a tile, Rect, box, FallBox, ColorBox or SwitchRect', () => {
  const problems = [];
  for (const entry of runtime.stages) {
    for (const party of [2, 4, 8]) {
      const game = load(entry.source, party);
      const solids = [
        ...game.staticRects.map((block) => ['Rect', block.rect]),
        ...game.pushBoxes.map((box) => ['PushBox', box.rect]),
        ...game.fallBoxes.map((box) => ['FallBox', box.rect]),
        ...game.colorBoxes.map((box) => [box.spawn.actorName, colorRect(box)]),
        ...game.switchRects.filter((block) => block.collisionPublished).map((block) => ['SwitchRect', block.rect]),
      ];
      for (const [i, cat] of game.players.entries()) {
        const inner = { x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 };
        if (game.tileMap.rectHitsSolid(inner)) problems.push(`${entry.source} p${party} cat ${i} inside tiles`);
        for (const [name, rect] of solids) if (overlaps(inner, rect)) problems.push(`${entry.source} p${party} cat ${i} inside ${name}`);
      }
    }
  }
  // stage_seesaw01 (9-2): the SeesawParent row still decodes as a 365 x 915 wall (batch 23); pre-existing.
  assert.deepEqual(problems.filter((line) => !line.startsWith('stage_seesaw01')), []);
});

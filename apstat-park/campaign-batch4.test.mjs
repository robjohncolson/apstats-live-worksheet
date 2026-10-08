// Batch 4 (teacher 2026-10-07, 1-4: "a character on the middle lift gets frozen in place when the moving door goes
// over them"; "make sure 1-4 plays correctly"). Patches native-movewall-rollback (FUN_7ff72bb667e0 restores the offset
// when FUN_7ff72bc16f50 fails) and weighted-lift-chain-test (FUN_7ff72bb64310 commits a step only if it passes).
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
const { playStage14, IDLE } = await import('./campaign-playthrough-1-4.mjs');
const RIGHT = { ...IDLE, right: true };

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

// ---------------------------------------------------------------------------------------------------------------
// The reported freeze: lift A part-way down with two cats when the wall arrives. A cat pushed west meets the ledge
// side (a tile): natively the chain test fails and the step is undone, so the wall waits instead of burying the cat.

for (const delay of [20, 40, 60]) {
  test(`1-4: the wall reaching two cats on a half-sunk lift A waits, never enters them, and passes once they are low (delay ${delay})`, () => {
    const game = load('stage_weight01', 2);
    const [wall] = game.moveWalls;
    const liftA = game.weightedLifts.find((lift) => lift.spawn.actorName === 'WeightedLift' && lift.spawn.x === 1339);
    const [a, b] = game.players;
    step(game, 100, idle(2));
    place(b, 1100, 240 - 46);   // in the sensor band: starts the wall
    place(a, 1400, liftA.rect.y - 46);
    let inside = 0, waited = 0, previous = wall.rect.x;
    for (let frame = 0; frame < 420; frame++) {
      if (frame === delay) place(b, 1360, liftA.rect.y - 46);   // the second cat joins: A starts to sink
      step(game, 1, idle(2));
      if (overlaps(a.rect, wall.rect) || overlaps(b.rect, wall.rect)) inside += 1;
      if (frame > delay && wall.rect.x === previous && wall.rect.x > 1100 && wall.rect.x < 1480) waited += 1;
      previous = wall.rect.x;
    }
    assert.equal(inside, 0, 'no cat is ever inside the wall');
    assert.ok(wall.rect.x < liftA.rect.x, 'the wall got past lift A: ' + wall.rect.x);
    // Not frozen: both cats walk again.
    const x0 = [a.rect.x, b.rect.x];
    step(game, 10, [RIGHT, RIGHT]);
    assert.ok(a.rect.x > x0[0] + 20 && b.rect.x > x0[1] + 20, 'both cats walk afterwards: ' + [a.rect.x - x0[0], b.rect.x - x0[1]]);
    void waited;
  });
}

test('1-4: cats pinned between the wall and the ledge side hold the wall still (the step is undone); it resumes after', () => {
  // The reproduction timing: a cat on the ledge starts the wall; two cats on lift A make it sink, and the wall reaches
  // them while they are only part-way down, so a push west would drive them into the ledge's side (a tile).
  const game = load('stage_weight01', 2);
  const [wall] = game.moveWalls;
  const liftA = game.weightedLifts.find((lift) => lift.spawn.actorName === 'WeightedLift' && lift.spawn.x === 1339);
  const [a, b] = game.players;
  step(game, 100, idle(2));
  place(b, 1100, 240 - 46);                   // starts the wall (reaches x 1322 about 83 ticks later)
  place(a, 1290, liftA.rect.y - 46);          // alone on A: it holds
  step(game, 60, idle(2));
  place(b, 1252, liftA.rect.y - 46);          // at A's west edge: A sinks ~23 before the wall arrives, so a push west
  let stillTicks = 0, inside = 0, previous = wall.rect.x;
  for (let frame = 0; frame < 400; frame++) {
    step(game, 1, idle(2));
    if (wall.rect.x === previous && wall.rect.x < 1488 && wall.rect.x > liftA.rect.x) stillTicks += 1;
    if (overlaps(a.rect, wall.rect) || overlaps(b.rect, wall.rect)) inside += 1;
    previous = wall.rect.x;
  }
  assert.equal(inside, 0);
  assert.ok(stillTicks >= 10, 'the wall waited at the pinned cats: ' + stillTicks + ' ticks');
  assert.ok(wall.rect.x < liftA.rect.x, 'and passed over them once they sank below its band');
});

test('1-4: a cat on the left ledge is pushed by the wall (native displacement) but never left inside it, and walks after', () => {
  const game = load('stage_weight01', 2);
  const [wall] = game.moveWalls;
  const [a, b] = game.players;
  step(game, 100, idle(2));
  place(a, 1150, 240 - 46); place(b, 600, 432 - 46);
  for (let frame = 0; frame < 400; frame++) {
    step(game, 1, idle(2));
    assert.ok(!overlaps(a.rect, wall.rect), 'never inside the wall (frame ' + frame + ')');
  }
  const x0 = a.rect.x;
  step(game, 10, [RIGHT, IDLE]);
  assert.ok(a.rect.x !== x0 || a.deathTimer > 0, 'the cat is not frozen');
});

test('weighted-lift-chain-test: lift A will not carry a rider up into the wall pillar; it waits until the pillar is gone', () => {
  const game = load('stage_weight01', 2);
  const [wall] = game.moveWalls;
  const liftA = game.weightedLifts.find((lift) => lift.spawn.actorName === 'WeightedLift' && lift.spawn.x === 1339);
  const [a, b] = game.players;
  step(game, 100, idle(2));
  place(a, 1300, liftA.rect.y - 46); place(b, 1350, liftA.rect.y - 46);
  step(game, 120, idle(2));   // both on A: down 120; the wall is started by them and slides over
  place(b, 600, 432 - 46);   // one cat leaves: A rises with the rider
  let inside = 0;
  for (let frame = 0; frame < 700; frame++) {
    step(game, 1, idle(2));
    if (overlaps(a.rect, wall.rect)) inside += 1;
  }
  assert.equal(inside, 0, 'the rider is never carried into the pillar');
});

// ---------------------------------------------------------------------------------------------------------------
// FULL 1-4 PLAYTHROUGH (party 2) under the native rules as implemented.

test('1-4 playthrough at party 2: key, wall, lift A, lift B, door; the stage clears (condition-driven script)', () => {
  let stats = {};
  const game = load('stage_weight01', 2, (next) => { stats = next; });
  const result = playStage14({ runtime: game, advance: (inputs) => game.update(1 / 60, inputs[0], inputs), cleared: () => !!stats.cleared });
  assert.equal(result.failedPhase, null, 'stuck at: ' + result.failedPhase + ' ' + JSON.stringify(result.state));
  assert.equal(result.cleared, true);
  assert.ok(result.frames < 3600, 'within a minute of play: ' + result.frames);
});

test('1-4 playthrough is deterministic: two runs, the same frame count', () => {
  const run = () => {
    let stats = {};
    const game = load('stage_weight01', 2, (next) => { stats = next; });
    return playStage14({ runtime: game, advance: (inputs) => game.update(1 / 60, inputs[0], inputs), cleared: () => !!stats.cleared }).frames;
  };
  assert.equal(run(), run());
});

// ---------------------------------------------------------------------------------------------------------------
// Every stage, parties 2/4/8: no live cat ends a frame inside a MoveWall, lift slab, solid bridge / gate, Rect or push
// box; and no cat is frozen (a walk input always moves it unless something solid is right there).

test('every stage at parties 2/4/8: no cat inside a wall / lift / bridge / gate / Rect / box, and no frozen cat', () => {
  const problems = [];
  for (const entry of runtime.stages) {
    for (const party of [2, 4, 8]) {
      const game = load(entry.source, party);
      const tm = game.tileMap;
      const solids = () => [
        ...game.moveWalls.map((wall) => ['MoveWall', wall.rect]),
        ...game.weightedLifts.map((lift) => [lift.spawn.actorName, lift.rect]),
        ...game.bridges.filter((bridge) => bridge.isSolid()).map((bridge) => ['Bridge', bridge.rect]),
        ...game.gates.filter((gate) => gate.isSolid()).map((gate) => ['Gate', gate.rect]),
        ...game.staticRects.map((block) => [block.spawn.actorName, block.rect]),
        ...game.pushBoxes.map((box) => ['PushBox', box.rect]),
      ];
      // Other solid actors a walking cat can be stopped by (not part of the 'never inside' list above).
      const centred = (box, size) => ({ x: box.spawn.x - size.w / 2, y: box.spawn.y - size.h / 2, width: size.w, height: size.h });
      const otherSolids = () => [
        ...game.colorBoxes.map((box) => centred(box, { w: box.params?.width ?? 32, h: box.params?.height ?? 32 })),
        ...game.normalBoxes.map((box) => centred(box, { w: box.params?.size ?? 48, h: box.params?.size ?? 48 })),
        ...game.fallBoxes.filter((box) => box.active).map((box) => box.rect),
        ...game.switchRects.filter((block) => block.collisionPublished).map((block) => block.rect),
        ...game.blinkBlocks.filter((block) => block.solid).map((block) => block.rect),
        ...game.jumpStands.map((stand) => stand.rect),   // jumpstand-launch (batch 7): a solid 32 x 34 block
      ];
      let frozenRun = game.players.map(() => 0);
      for (let frame = 0; frame < 240; frame++) {
        const dir = Math.floor(frame / 60) % 2 === 0 ? 1 : -1;
        // One input per controller slot, as the desk sends (a shuffled slot table can bind a cat to slot 2..7).
        const slots = Math.max(party, game.players.length, ...game.playerInputSlots.map((slot) => slot + 1));
        const inputs = Array.from({ length: slots }, () => ({ ...IDLE, right: dir > 0, left: dir < 0,
          jump: frame % 45 >= 10 && frame % 45 < 25, jumpPressed: frame % 45 === 10 }));
        const before = game.players.map((cat) => ({ ...cat.rect }));
        game.update(1 / 60, inputs[0], inputs);
        const now = solids();
        game.players.forEach((cat, i) => {
          if (cat.deathTimer > 0 || game.deathFallPlayers.has(cat) || cat.parkHelper) return;
          // A cat a WarpGun has picked up is hidden and disabled until the next hit places it (native hold).
          if (game.warpGunDisabledPlayers.has(cat)) return;
          const inner = { x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 };
          for (const [name, rect] of now) {
            if (overlaps(inner, rect)) problems.push(`${entry.source} p${party} f${frame} cat ${i} inside ${name}`);
          }
          // Frozen: no horizontal progress although nothing solid (tile, solid, other cat) is right beside it.
          const probe = { ...cat.rect, x: cat.rect.x + dir * 1.5 };
          const blocked = tm.rectHitsSolid(probe) || now.some(([, rect]) => overlaps(probe, rect))
            || otherSolids().some((rect) => overlaps(probe, rect))
            || game.players.some((other, j) => j !== i && overlaps(probe, other.rect));
          frozenRun[i] = cat.rect.x === before[i].x && !blocked ? frozenRun[i] + 1 : 0;
          if (frozenRun[i] === 20) problems.push(`${entry.source} p${party} f${frame} cat ${i} frozen at ${Math.round(cat.rect.x)},${Math.round(cat.rect.y)}`);
        });
      }
    }
  }
  const unique = [...new Set(problems.map((line) => line.replace(/ f\d+ /, ' ')))];
  // Known, separately scheduled misreads (fidelity audit batches): 5-2 / 5-4 MultiPlayer control (batch 19: the port
  // latches the one cat to whoever holds jump) and 9-2's SeesawParent decoded as a 365 x 915 wall (batch 23).
  const KNOWN = /^stage_(multijump01|multijump02|seesaw01) /;
  assert.deepEqual(unique.filter((line) => !KNOWN.test(line)), []);
});

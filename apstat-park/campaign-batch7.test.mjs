// Fidelity audit 2026-10-08 batch 7 (scripts/pico-campaign-patches.mjs): scaleswitch-carry, jumpstand-launch,
// distance-constraint-native.
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
// scaleswitch-carry

test('ScaleSwitch growth lifts the cat on the grower head by the height gained; shrinking moves nobody (4-4, parties 2/4/8)', () => {
  for (const party of PARTIES) {
    const game = load('stage_big_and_small', party);
    const grow = game.scaleSwitches.find((pad) => pad.params.scaleDelta > 0);
    const shrink = game.scaleSwitches.find((pad) => pad.params.scaleDelta < 0);
    const [rider, grower] = game.players;
    place(grower, 300, 432 - 47);
    place(rider, 300, grower.rect.y - 46);
    step(game, 2);
    assert.ok(close(rider.rect.y + rider.rect.height, grower.rect.y, 1e-6), `p${party}: the rider stands on the grower`);
    game.player = grower;
    for (let k = 0; k < 60; k++) {
      game.applyScaleSwitchPlayerDelta(grow);
      assert.ok(close(rider.rect.y + rider.rect.height, grower.rect.y, 1e-6), `p${party} tick ${k}: the rider rides the growing head`);
      assert.ok(close(rider.rect.x + rider.rect.width / 2, grower.rect.x + grower.rect.width / 2, 1e-6), `p${party}: kept centred`);
    }
    const riderY = rider.rect.y;
    game.applyScaleSwitchPlayerDelta(shrink);
    assert.equal(rider.rect.y, riderY, `p${party}: shrinking does not move the rider`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// jumpstand-launch

const nativeRise = (perTick) => { let rise = 0; for (let k = 0; perTick - 0.65 * k > 0; k++) rise += perTick - 0.65 * k; return rise; };

test('JumpStand: a cat standing on it is launched (first tick moves the full launch) and rises the native height; parties 2/4/8 (7-2 stands, -16.3)', () => {
  for (const party of PARTIES) {
    const game = load('stage_traffic_light01', party);
    const stand = game.jumpStands[0];
    const cat = game.players[0];
    place(cat, stand.rect.x, stand.rect.y - 47);
    step(game, 1);
    let top = cat.rect.y + cat.rect.height, launchedAt = -1;
    for (let k = 0; k < 90; k++) {
      const before = cat.rect.y;
      step(game, 1);
      if (launchedAt < 0 && cat.rect.y < before) {
        launchedAt = k;
        assert.ok(close(before - cat.rect.y, 16.3, 1e-6), `p${party}: first launch tick moves ${before - cat.rect.y}`);
      }
      top = Math.min(top, cat.rect.y + cat.rect.height);
    }
    assert.ok(launchedAt >= 0 && launchedAt <= 1, `p${party}: launched while standing (tick ${launchedAt})`);
    assert.ok(close(stand.rect.y - top, nativeRise(16.3), 0.5), `p${party}: rise ${stand.rect.y - top} vs native ${nativeRise(16.3)}`);
  }
});

test('JumpStand: a cat with another cat on its head is not launched (a pedestal); the stand is solid to a walking cat', () => {
  for (const party of PARTIES) {
    const game = load('stage_traffic_light01', party);
    const stand = game.jumpStands[0];
    const [base, top] = game.players;
    place(base, stand.rect.x, stand.rect.y - 46);
    place(top, stand.rect.x, stand.rect.y - 46 - 46);
    for (let k = 0; k < 30; k++) {
      step(game, 1);
      assert.ok(close(base.rect.y + base.rect.height, stand.rect.y, 0.7), `p${party} tick ${k}: the loaded cat stays on the stand (feet ${base.rect.y + base.rect.height})`);
    }
    const walker = load('stage_traffic_light01', party);
    const wall = walker.jumpStands[0];
    const cat = walker.players[0];
    place(cat, wall.rect.x - 60, 432 - 47);
    step(walker, 30, holdFor(walker, 0, { right: true }));
    assert.ok(cat.rect.x + cat.rect.width <= wall.rect.x + 1e-6, `p${party}: stopped by the stand side (${cat.rect.x + cat.rect.width})`);
  }
});

test('JumpStandEx throws a push box resting on it up and sideways (2-4: -18 / +3 per tick)', () => {
  const game = load('stage_fall02', 2);
  const stand = game.jumpStands[0];
  assert.deepEqual(stand.launchVelocity, { x: 180, y: -1080 });
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: stand.rect.x + stand.rect.width / 2 - box.rect.width / 2, y: stand.rect.y - box.rect.height });
  const startX = box.rect.x;
  let peak = box.rect.y;
  for (let k = 0; k < 120; k++) { step(game, 1); peak = Math.min(peak, box.rect.y); }
  assert.ok(stand.rect.y - box.rect.height - peak > 200, `the box rose ${stand.rect.y - box.rect.height - peak}`);
  assert.ok(box.rect.x - startX > 100, `and travelled east ${box.rect.x - startX}`);
  assert.equal(box.falling, false, 'and landed');
});

// ---------------------------------------------------------------------------------------------------------------
// distance-constraint-native

test('rope stages 2-1 / 2-3 at parties 2/4/8: 300 frames of walking and jumping never leave a cat inside a map chip', () => {
  for (const source of ['stage_constraint01', 'stage_constraint02']) {
    for (const party of PARTIES) {
      const game = load(source, party);
      for (let frame = 0; frame < 300; frame++) {
        const dir = Math.floor(frame / 60) % 2 === 0 ? 1 : -1;
        const inputs = idle(game.players.length).map((_, i) => ({ ...IDLE, right: dir > 0 && i % 2 === 0, left: dir < 0 && i % 2 === 1,
          jump: frame % 40 >= 10 && frame % 40 < 24, jumpPressed: frame % 40 === 10 }));
        step(game, 1, inputs);
        for (const cat of game.players) {
          if (cat.deathTimer > 0 || game.deathFallPlayers.has(cat)) continue;
          const inner = { x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 };
          assert.equal(game.tileMap.rectHitsSolid(inner), false, `${source} p${party} f${frame}: a cat inside a chip at ${JSON.stringify(rectOf(cat))}`);
        }
      }
    }
  }
});

test('the rope only acts when stretched: two cats closer than its length are untouched (2-1, party 2)', () => {
  const game = load('stage_constraint01', 2);
  const [a, b] = game.players;
  step(game, 30);
  const before = [rectOf(a), rectOf(b)];
  game.applyDistanceConstraints();
  assert.deepEqual([rectOf(a), rectOf(b)], before);
});

test('a stretched rope pulls a hanging cat less than its standing partner (share (s2 + 1) / (s1 + s2 + 2), FUN_7ff72bb3ffe0)', () => {
  const game = load('stage_constraint01', 2);
  const [stander, hanger] = game.players;
  step(game, 30);
  place(hanger, stander.rect.x + 260, stander.rect.y - 120);
  hanger.grounded = false;
  const s0 = rectOf(stander), h0 = rectOf(hanger);
  game.applyDistanceConstraints();
  const standerMove = Math.hypot(stander.rect.x - s0.x, stander.rect.y - s0.y);
  const hangerMove = Math.hypot(hanger.rect.x - h0.x, hanger.rect.y - h0.y);
  assert.ok(hangerMove > 0 && standerMove > 0, `both pulled (${standerMove}, ${hangerMove})`);
  assert.ok(hangerMove < standerMove, `the hanging cat gets the smaller share (${hangerMove} < ${standerMove})`);
});

// ---------------------------------------------------------------------------------------------------------------

test('determinism (240 frames with movement) on 2-1, 2-4, 4-4, 3-2: two runtimes agree', () => {
  const snapshot = (game) => JSON.stringify({ cats: game.players.map(rectOf), boxes: game.pushBoxes.map(rectOf) });
  for (const source of ['stage_constraint01', 'stage_fall02', 'stage_big_and_small', 'stage_time_limit02']) {
    const runs = [load(source, 2), load(source, 2)].map((game) => {
      for (let frame = 0; frame < 240; frame++) {
        const inputs = idle(game.players.length).map(() => ({ ...IDLE, right: frame % 60 < 40, jump: frame % 50 < 12, jumpPressed: frame % 50 === 0 }));
        step(game, 1, inputs);
      }
      return snapshot(game);
    });
    assert.equal(runs[0], runs[1], source);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// lift-load-carry-agree (Codex must-fix)

test('2-4 lift: a carrier touching the slab by 1 unit from the ledge, two boxes on its head, does not count and nothing is carried; fully on, all count and ride', () => {
  for (const fullyOn of [false, true]) {
    const game = load('stage_fall02', 2);
    const lift = game.weightedLifts[0];   // {2350.6, 288, 194, 18}, needs 4 bodies at party 2
    const [carrier, other] = game.players;
    const [boxA, boxB] = game.pushBoxes;
    const carrierX = fullyOn ? lift.rect.x + 60 : lift.rect.x + 1 - 32;   // 1 unit onto the slab, rest on the ledge
    place(carrier, carrierX, 288 - 46);
    boxA.applyRect({ ...boxA.rect, x: carrierX - 3, y: carrier.rect.y - boxA.rect.height });
    boxB.applyRect({ ...boxB.rect, x: carrierX - 3, y: boxA.rect.y - boxB.rect.height });
    place(other, lift.rect.x + 140, 288 - 46);
    const liftStart = lift.rect.y;
    for (let k = 0; k < 60; k++) {
      step(game, 1);
      assert.ok(close(boxA.rect.y + boxA.rect.height, carrier.rect.y, 0.02), `${fullyOn ? 'on' : 'edge'} tick ${k}: box A stays on the carrier head (${boxA.rect.y + boxA.rect.height} vs ${carrier.rect.y})`);
      assert.ok(close(boxB.rect.y + boxB.rect.height, boxA.rect.y, 0.02), `${fullyOn ? 'on' : 'edge'} tick ${k}: box B stays on box A`);
    }
    if (fullyOn) {
      assert.ok(lift.rect.y > liftStart + 10, `four bodies sink the lift (${lift.rect.y})`);
      assert.ok(close(carrier.rect.y + carrier.rect.height, lift.rect.y, 0.02), 'the carrier rides it');
    } else {
      assert.equal(lift.rect.y, liftStart, 'one body on the slab: the lift does not move');
      assert.ok(close(carrier.rect.y + carrier.rect.height, 288, 0.02), 'the carrier stays on the ledge');
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// distance-constraint-native: the load walk crosses slack links (FUN_7ff72bb40380 / FUN_7ff72bb407a0)

/** Independent reference of FUN_7ff72bb3fce0 / FUN_7ff72bb3ffe0 for cats hanging in open air (no chips, no latch). */
function referenceRopeCorrections(points, maxDist, w) {
  const n = points.length;
  const taut = (a, b) => Math.hypot(points[b].x - points[a].x, points[b].y - points[a].y) > maxDist;
  const far = (i, step) => {
    const v = { x: 0, y: w };   // every cat unsupported, nothing on any head
    for (let j = i; j + step >= 0 && j + step < n; j += step) {
      if (!taut(j, j + step)) continue;   // a slack link adds nothing but the walk goes on
      const dx = points[j + step].x - points[j].x, dy = points[j + step].y - points[j].y, len = Math.hypot(dx, dy);
      v.x += dx / len; v.y += dy / len;
    }
    return v;
  };
  const L = points.map((_, i) => far(i, -1)), R = points.map((_, i) => far(i, 1));
  const pair = (i, j, selfFar, otherFar) => {
    if (j < 0 || j >= n) return { x: 0, y: 0 };
    const dx = points[j].x - points[i].x, dy = points[j].y - points[i].y, len = Math.hypot(dx, dy);
    if (len <= maxDist) return { x: 0, y: 0 };
    const nx = dx / len, ny = dy / len;
    const s1 = Math.max(0, -(nx * selfFar.x + ny * selfFar.y)), s2 = Math.max(0, nx * otherFar.x + ny * otherFar.y);
    const share = (s2 + 1) / (s1 + s2 + 2);
    return { x: nx * (len - maxDist) * share * 0.2, y: ny * (len - maxDist) * share * 0.2 };
  };
  return points.map((_, i) => {
    const a = pair(i, i - 1, R[i], L[i - 1] ?? { x: 0, y: 0 }), b = pair(i, i + 1, L[i], R[i + 1] ?? { x: 0, y: 0 });
    const c = { x: a.x + b.x, y: a.y + b.y };
    c.y = Math.max(-20.15, Math.min(20.15, c.y));
    return c;
  });
}

test('rope, four-cat chain in open air: the far-side load walks every link, slack ones included (matches the native walk)', () => {
  const game = load('stage_constraint01', 4);
  const cats = game.players;
  assert.equal(cats.length, 4);
  const link = runtime.selectDistanceConstraintLinkForPlayerCount
    ? runtime.selectDistanceConstraintLinkForPlayerCount(game.distanceConstraints[0].params.values, 4)
    : { maxDistance: game.distanceConstraints[0].params.values[4], secondValue: game.distanceConstraints[0].params.values[5] };
  const maxDist = link.maxDistance, w = link.secondValue;
  // Open air above the start (rows 0..4 are empty): links 0-1 stretched, 1-2 slack, 2-3 stretched.
  const xs = [100, 100 + maxDist + 60, 100 + maxDist + 60 + maxDist / 2, 100 + maxDist + 60 + maxDist / 2 + maxDist + 80];
  cats.forEach((cat, i) => { place(cat, xs[i] - 16, 60); cat.grounded = false; cat.velocity.x = 0; cat.velocity.y = 0; });
  const points = cats.map((cat) => ({ x: cat.rect.x + 16, y: cat.rect.y + 47 }));
  const expected = referenceRopeCorrections(points, maxDist, w);
  const before = cats.map(rectOf);
  game.applyDistanceConstraints();
  cats.forEach((cat, i) => {
    assert.ok(close(cat.rect.x - before[i].x, expected[i].x, 1e-6) && close(cat.rect.y - before[i].y, expected[i].y, 1e-6),
      `cat ${i}: moved (${cat.rect.x - before[i].x}, ${cat.rect.y - before[i].y}) vs native (${expected[i].x}, ${expected[i].y})`);
  });
  // The walk through the slack 1-2 link matters: cat 1's right-side load includes link 2-3.
  const total = cats.reduce((sum, cat, i) => sum + Math.hypot(cat.rect.x - before[i].x, cat.rect.y - before[i].y), 0);
  assert.ok(total > 0, 'the stretched links pull');
});

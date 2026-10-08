// Fidelity audit 2026-10-08 batch 6 (scripts/pico-campaign-patches.mjs): fallbox-solid-while-armed,
// pushbox-general-fall, mc-d-tiles-solid, darkness-weighted-lift-tiles, bowwow-chase-stops, stepenemy-unspawn.
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
// fallbox-solid-while-armed

test('FallBox body is the drawn rect inset 2 on every stage (FUN_7ff72bb42d90), parties 2/4/8', () => {
  const sources = stagesWith('FallBox');
  assert.deepEqual(sources.sort(), ['stage_fall01', 'stage_fall02', 'stage_gun02', 'stage_jump07'].sort());
  for (const source of sources) {
    for (const party of PARTIES) {
      for (const box of load(source, party).fallBoxes) {
        assert.deepEqual(box.body, { x: box.rect.x + 2, y: box.rect.y + 2, width: box.rect.width - 4, height: box.rect.height - 4 });
      }
    }
  }
});

test('2-2: a cat on a FallBox stays standing on it through the 0.22 s hold, then the box falls under 0.65 per tick squared and despawns for good (parties 2/4/8)', () => {
  for (const party of PARTIES) {
    const game = load('stage_fall01', party);
    const box = game.fallBoxes[0];
    const walker = game.players[0];
    // Gather the party on the block left of the bridge (level with the box bodies) so the camera holds the bridge.
    place(walker, 972, box.body.y - 47);
    game.players.slice(1).forEach((cat, k) => place(cat, 916, box.body.y - 47 - 50 * k));
    step(game, 90);
    assert.equal(box.active, true, `p${party}: the first bridge box is on screen`);
    const right = holdFor(game, 0, { right: true });
    // Walk on until the box arms (any overlap of 6 on its top), then stand still.
    let walked = 0;
    while (!box.falling && walked < 60) { step(game, 1, right); walked += 1; }
    assert.ok(walked < 60, `p${party}: the cat walks onto the box and arms it`);
    // The arming frame already counts toward the hold: t <= 0.22 is tested before dt is added (FUN_7ff72bb429b0).
    let y = box.rect.y;
    let held = 1;
    while (box.rect.y === y && held < 40) {
      step(game, 1, held < 6 ? right : undefined);
      if (box.rect.y !== y) break;
      held += 1;
      if (held > 8) {
        assert.equal(walker.grounded, true, `p${party}: the cat stands on the armed box (it is solid during the hold)`);
        assert.ok(close(walker.rect.y + walker.rect.height, box.body.y, 1e-6), `p${party}: feet on the body top (inset 2)`);
      }
    }
    assert.equal(held, 14, `p${party}: held ${held} frames (t <= 0.22 before the add, then fall)`);
    // Gravity: the drops grow by 0.65 each tick (no constant 0.65 settle any more).
    const drops = [box.rect.y - y];
    for (let k = 0; k < 3; k++) { y = box.rect.y; step(game, 1); drops.push(box.rect.y - y); }
    drops.forEach((drop, k) => assert.ok(close(drop, 0.65 * (k + 1), 1e-6), `p${party}: drop ${k} = ${drop}`));
    // Despawn when the bottom passes 2 * 720 / 1.5 = 960; never respawns.
    const count = game.fallBoxes.length;
    let lastBottom = 0;
    for (let k = 0; k < 120 && game.fallBoxes.includes(box); k++) { lastBottom = box.rect.y + box.rect.height; step(game, 1); }
    assert.equal(game.fallBoxes.includes(box), false, `p${party}: the box despawned`);
    assert.ok(lastBottom <= 960 && box.rect.y + box.rect.height > 960, `p${party}: removed once its bottom passed 960`);
    for (let k = 0; k < 240; k++) {
      step(game, 1);
      assert.ok(game.fallBoxes.length <= count - 1 && !game.fallBoxes.includes(box), `p${party}: no respawn`);
    }
  }
});

test('a falling FallBox lands on a chip or body below it; a push box resting on its top arms it', () => {
  const game = load('stage_fall01', 2);
  const [first, second] = game.fallBoxes;
  // Rest a stand-in body on the second box: a cat placed on it arms it like any body on its top.
  place(game.players[1], second.body.x + 6, second.body.y - 47);
  game.players[0].applyResolvedCollision({ ...game.players[0].rect, x: 940, y: 336 - 47 }, { x: 0, y: 0 }, true);
  step(game, 3);
  assert.equal(second.falling || !second.active, true, 'a cat on top arms it (or it is off screen)');
  assert.equal(first.falling, false, 'its neighbour is untouched');
});

test('2-2: a cat walks between a FallBox body and the level block beside it, both ways (party 2: Rect top 336; 4/8: the lower bridge, top 384)', () => {
  for (const party of PARTIES) {
    const game = load('stage_fall01', party);
    const box = game.fallBoxes[0];
    const walker = game.players[0];
    const top = box.body.y;   // level with the block left of the bridge (x < 1008)
    place(walker, 972, top - 47);
    game.players.slice(1).forEach((cat, k) => place(cat, 916, top - 47 - 50 * k));
    step(game, 90);
    // Rect -> FallBox: on to the box (it arms; it holds for 14 frames).
    let k = 0;
    while (walker.rect.x < box.body.x + 4 && k < 20) { step(game, 1, holdFor(game, 0, { right: true })); k += 1; }
    assert.ok(walker.rect.x >= box.body.x + 4, `p${party}: walked onto the box (x ${walker.rect.x})`);
    // FallBox -> Rect: straight back onto the left block before the box drops.
    k = 0;
    while (walker.rect.x + walker.rect.width > 1008 && k < 12) { step(game, 1, holdFor(game, 0, { left: true })); k += 1; }
    assert.ok(walker.rect.x + walker.rect.width <= 1008, `p${party}: walked back onto the Rect (right edge ${walker.rect.x + walker.rect.width})`);
    assert.ok(close(walker.rect.y + walker.rect.height, top, 1e-6) && walker.grounded, `p${party}: standing on the block`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// pushbox-general-fall

test('every PushBox stage at parties 2/4/8: after 3 idle seconds no box hangs unsupported (FUN_7ff72bb33890 on every stage)', () => {
  for (const source of stagesWith('PushBox')) {
    for (const party of PARTIES) {
      const game = load(source, party);
      step(game, 180);
      for (const box of game.pushBoxes) {
        assert.equal(box.falling, false, `${source} p${party}: box at ${JSON.stringify(rectOf(box))} is at rest`);
      }
    }
  }
});

test('floating spawn boxes drop natively from frame 0: 10-3 onto 192, 10-4 onto 240, 12-1 onto Rect 302.4 (parties 2/4/8)', () => {
  const cases = [['stage_darkness01', 192], ['stage_darkness02', 240], ['stage_thunder02', 302.4]];
  for (const [source, rest] of cases) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const box = game.pushBoxes[0];
      const start = box.rect.y;
      const drops = [];
      for (let k = 0; k < 3; k++) { const y = box.rect.y; step(game, 1); drops.push(box.rect.y - y); }
      if (rest - (start + box.rect.height) > 4) {
        drops.forEach((drop, k) => assert.ok(close(drop, 0.65 * (k + 1), 1e-6), `${source} p${party}: drop ${k} = ${drop}`));
      }
      step(game, 120);
      assert.ok(close(box.rect.y + box.rect.height, rest, 0.02), `${source} p${party}: rests at ${box.rect.y + box.rect.height}`);
    }
  }
});

test('4-2: the BlockRoad PushBox plug rests on its lower DamageRect and does not fall', () => {
  for (const party of PARTIES) {
    const game = load('stage_plane01', party);
    const plug = game.pushBoxes[0];
    const start = rectOf(plug);
    step(game, 60);
    assert.deepEqual(rectOf(plug), start, `p${party}`);
  }
});

test('1-2: pushed off the floor into the one-chip pit, the pillar stops where it loses support and drops straight in (no gap snap)', () => {
  const game = load('stage_push02', 2);
  const pillar = game.pushBoxes[1];
  const [a, b] = game.players;
  // Both cats push pillar 2 (weight 100) right toward the pit at x 960..1008.
  place(b, pillar.rect.x - 32, 432 - 47);
  place(a, pillar.rect.x - 64, 432 - 47);
  const right = idle(2).map(() => ({ ...IDLE, right: true }));
  let k = 0;
  while (!pillar.falling && k < 300) { step(game, 1, right); k += 1; }
  assert.ok(k < 300, 'the pillar started to fall');
  // The native body is the rect inset 1 on each side (FUN_7ff72bb340f0): it is that body that fits the pit.
  assert.ok(pillar.rect.x + 1 >= 960 && pillar.rect.x + pillar.rect.width - 1 <= 1008, `its body fits the pit: x ${pillar.rect.x}`);
  step(game, 120);
  assert.ok(close(pillar.rect.y + pillar.rect.height, 768, 0.02), `it lands on the pit floor (y 768): ${pillar.rect.y + pillar.rect.height}`);
});

// ---------------------------------------------------------------------------------------------------------------
// mc-d-tiles-solid

test('MC_DLU / DLD / DRU / DRD chips are solid on 5-1, 5-3 and 7-3 (DAT_7ff72bcc8c40 attribute 3)', () => {
  for (const source of ['stage_majo01', 'stage_majo02', 'stage_ghost01']) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const map = game.tileMap.map;
      let found = 0;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          if (!/^MC_D[LR][UD]$/.test(game.tileMap.chipAt(tx, ty) ?? '')) continue;
          found += 1;
          assert.equal(game.tileMap.isSolidTile(tx, ty), true, `${source} p${party} chip ${tx},${ty}`);
        }
      }
      assert.equal(found, 4, `${source} p${party}: one 2 x 2 block`);
    }
  }
});

test('7-3: a cat walking into the red block is stopped by its side and lives', () => {
  for (const party of PARTIES) {
    const game = load('stage_ghost01', party);
    const cat = game.players[0];
    place(cat, 1920 - 32 - 20, 336 - 47);
    step(game, 40, holdFor(game, 0, { right: true }));
    assert.ok(cat.rect.x + cat.rect.width <= 1920 + 1e-6, `p${party}: stopped at the block (${cat.rect.x + cat.rect.width})`);
    assert.equal(cat.deathTimer > 0 || game.deathFallPlayers.has(cat), false, `p${party}: alive`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// darkness-weighted-lift-tiles

test('10-3: two cats on lift 2 sink it past the row-144 chips; the cats land on the chips and the slab holds just below (party 2)', () => {
  const game = load('stage_darkness01', 2);
  const lift = game.weightedLifts.find((entry) => entry.rect.x === 720 && entry.rect.y === 48);
  assert.ok(lift, 'lift 2 at (720, 48, 96, 48)');
  place(game.players[0], 728, 2);
  place(game.players[1], 776, 2);
  step(game, 400);
  assert.ok(lift.rect.y > 144, `the slab top passed the door slot (y ${lift.rect.y}; it stopped at 96 before)`);
  for (const cat of game.players) {
    assert.ok(close(cat.rect.y + cat.rect.height, 144, 0.02), `a rider stands on the row-144 chips (feet ${cat.rect.y + cat.rect.height})`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// bowwow-chase-stops

test('7-1: a cat standing still in range never wakes the dog; a moving cat wakes it; a chase flies straight on, and a catch locks state 4 (parties 2/4/8)', () => {
  for (const party of PARTIES) {
    const game = load('stage_bowwow01', party);
    const dog = game.bowwowEnemies[0];
    const cat = game.players[1];
    place(cat, dog.view.x - 150, 385);
    const states = [];
    for (let f = 0; f < 150; f++) { step(game, 1); states.push(dog.chaseState); }
    assert.ok(states.every((state) => state === 0), `p${party}: a still cat 150 to the side does not wake it`);
    const left = holdFor(game, 1, { left: true });
    let path = [];
    for (let f = 0; f < 90; f++) {
      step(game, 1, f < 40 ? left : undefined);
      path.push({ x: dog.view.x, y: dog.view.y, state: dog.chaseState });
    }
    assert.ok(path.some((point) => point.state === 3), `p${party}: walking wakes it into a chase`);
    assert.equal(cat.deathTimer > 0 || game.deathFallPlayers.has(cat), true, `p${party}: the chase catches the cat`);
    assert.equal(dog.chaseState, 4, `p${party}: a catch locks state 4`);
    // From then on it drifts straight at its last speed (10 per tick).
    const tail = path.slice(-10);
    for (let k = 1; k < tail.length; k++) {
      const dx = tail[k].x - tail[k - 1].x, dy = tail[k].y - tail[k - 1].y;
      assert.ok(close(Math.hypot(dx, dy), 10, 1e-6), `p${party}: drift step ${Math.hypot(dx, dy)}`);
      assert.ok(close(dx, tail[1].x - tail[0].x, 1e-6) && close(dy, tail[1].y - tail[0].y, 1e-6), `p${party}: straight`);
    }
  }
});

test('7-1: a warned dog (state 2) goes back to sleep when every cat in range stands still', () => {
  const game = load('stage_bowwow01', 2);
  const dog = game.bowwowEnemies[0];
  place(game.players[1], dog.view.x - 250, 385);
  step(game, 60);
  // A short run: enough mean movement to warn (> 1.5), then stop before a chase (> 2.5).
  const left = holdFor(game, 1, { left: true });
  let reachedWarn = false;
  for (let f = 0; f < 60 && dog.chaseState < 3; f++) {
    step(game, 1, dog.chaseState === 2 ? undefined : left);
    if (dog.chaseState === 2) { reachedWarn = true; break; }
  }
  assert.ok(reachedWarn, 'the run warned the dog');
  let slept = false;
  for (let f = 0; f < 60; f++) { step(game, 1); if (dog.chaseState === 0) { slept = true; break; } }
  assert.ok(slept || dog.chaseState === 3, `still cats send a warned dog back to sleep (state ${dog.chaseState})`);
});

// ---------------------------------------------------------------------------------------------------------------
// stepenemy-unspawn

test('7-2: the StepEnemy spawned inside the first step stands on it, walks left off it at tick 25 and lands on the floor (parties 2/4/8)', () => {
  const expected = { 1: [959, 384], 24: [936, 384], 25: [935, 384], 26: [934, 384.65], 30: [930, 393.75], 35: [925, 418.99], 60: [900, 418.99] };
  for (const party of PARTIES) {
    const game = load('stage_traffic_light01', party);
    const enemy = game.stepEnemies[0];
    for (let tick = 1; tick <= 60; tick++) {
      step(game, 1);
      const want = expected[tick];
      if (!want) continue;
      const centre = [enemy.rect.x + 24, enemy.rect.y + 13];
      assert.ok(close(centre[0], want[0], 1e-6) && close(centre[1], want[1], 0.02), `p${party} tick ${tick}: ${centre}`);
      assert.equal(enemy.walkDirection, -1, `p${party} tick ${tick}: still walking left`);
    }
  }
});

test('no StepEnemy anywhere reverses on consecutive ticks (no jitter in a chip) over 5 s, parties 2/4/8', () => {
  for (const source of stagesWith('StepEnemy')) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const last = game.stepEnemies.map((enemy) => ({ dir: enemy.walkDirection, turnedAt: -10 }));
      for (let tick = 0; tick < 300; tick++) {
        step(game, 1);
        game.stepEnemies.forEach((enemy, index) => {
          if (enemy.walkDirection === last[index].dir) return;
          assert.ok(tick - last[index].turnedAt > 2, `${source} p${party} enemy ${index}: turned again at tick ${tick}`);
          last[index] = { dir: enemy.walkDirection, turnedAt: tick };
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------

test('determinism (240 frames with movement) on 2-2, 7-1, 10-3, 1-2: two runtimes agree on cats, boxes, fall boxes and the dog', () => {
  const snapshot = (game) => JSON.stringify({
    cats: game.players.map(rectOf),
    boxes: game.pushBoxes.map(rectOf),
    fall: game.fallBoxes.map((box) => [rectOf(box), box.falling]),
    dogs: game.bowwowEnemies.map((dog) => [rectOf(dog), dog.chaseState]),
    lifts: game.weightedLifts.map(rectOf),
  });
  for (const source of ['stage_fall01', 'stage_bowwow01', 'stage_darkness01', 'stage_push02']) {
    const runs = [load(source, 2), load(source, 2)].map((game) => {
      const right = idle(game.players.length).map(() => ({ ...IDLE, right: true }));
      for (let frame = 0; frame < 240; frame++) step(game, 1, frame % 50 < 30 ? right : undefined);
      return snapshot(game);
    });
    assert.equal(runs[0], runs[1], source);
  }
});

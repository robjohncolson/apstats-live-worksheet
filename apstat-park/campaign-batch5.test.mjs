// Fidelity audit 2026-10-07 batch 5 (scripts/pico-campaign-patches.mjs): thunder-beam, guard-shields, step-enemy-native.
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
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const rectOf = (actor) => ({ x: actor.rect.x, y: actor.rect.y, width: actor.rect.width, height: actor.rect.height });
const near = (a, b, tol = 1e-6) => Object.keys(b).every((k) => Math.abs(a[k] - b[k]) <= tol);
const thunderStages = runtime.stages.filter((entry) => [entry.data, entry.largeParty?.data].filter(Boolean)
  .some((data) => data.createTable.some((row) => row.actorName === 'Thunder'))).map((entry) => entry.source);
const tagOf = (source) => { const e = runtime.stages.find((s) => s.source === source); return e.world + '-' + e.stage; };

// ---------------------------------------------------------------------------------------------------------------
// thunder-beam. Independent sweep (0x7ff72bb4d600): the 32 x 32 box from the row point, chips it starts in ignored,
// L = 32 + travel (max 2400 travel).

function expectedSweep(game, thunder) {
  const map = game.tileMap.map, chip = map.chipSize;
  const dir = { DIR_UP: [0, -1], DIR_DOWN: [0, 1], DIR_LEFT: [-1, 0], DIR_RIGHT: [1, 0] }[thunder.direction];
  const solidUnder = (x, y) => {
    const out = [];
    for (let ty = Math.floor(y / chip); ty <= Math.floor((y + 31.999) / chip); ty++) {
      for (let tx = Math.floor(x / chip); tx <= Math.floor((x + 31.999) / chip); tx++) {
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (game.tileMap.isSolidTile(tx, ty)) out.push(tx + ',' + ty);
      }
    }
    return out;
  };
  const x0 = thunder.spawn.x - 16, y0 = thunder.spawn.y - 16;
  const start = new Set(solidUnder(x0, y0));
  let travel = 0;
  while (travel < 2400 && !solidUnder(x0 + dir[0] * (travel + 1), y0 + dir[1] * (travel + 1)).some((k) => !start.has(k))) travel++;
  return 32 + travel;
}

test('every Thunder stage (17) at parties 2/4/8: the beam length at frame 0 is the native sweep, never the old fixed 2400', () => {
  assert.equal(thunderStages.length, 17);
  for (const source of thunderStages) {
    for (const party of [2, 4, 8]) {
      const game = load(source, party);
      for (const thunder of game.thunders) {
        assert.equal(thunder.baseLength, expectedSweep(game, thunder), `${tagOf(source)} p${party} Thunder at ${thunder.spawn.x},${thunder.spawn.y}`);
      }
    }
  }
});

test('4-1: the 17 ceiling beams run down to the floor (L = 352: y 48..400, ending 16 inside the 384 floor)', () => {
  const game = load('stage_thunder01', 2);
  const down = game.thunders.filter((thunder) => thunder.direction === 'DIR_DOWN');
  assert.equal(down.length, 17);
  for (const thunder of down) assert.deepEqual(rectOf(thunder), { x: thunder.spawn.x - 2, y: 48, width: 4, height: 352 });
});

test('5-4: the beam at (1569.6, 216) ends near x 1824 (the gap between the hanging blocks), not 3969.6', () => {
  const thunder = load('stage_multijump02', 2).thunders.find((entry) => entry.spawn.y === 216);
  const end = thunder.rect.x + thunder.rect.width;
  assert.ok(end > 1800 && end < 1860, 'beam end ' + end);
});

test('12-1: the beams stop at the first solid in their path', () => {
  const game = load('stage_thunder02', 2);
  for (const thunder of game.thunders) {
    assert.equal(thunder.baseLength, expectedSweep(game, thunder));
    assert.ok(thunder.baseLength < 2432, 'hits the room wall: ' + thunder.baseLength);
  }
});

test('a body in the beam shortens it every frame (2-2: a push box placed across the pit beam)', () => {
  const game = load('stage_fall01', 2);
  const [thunder] = game.thunders;
  assert.equal(thunder.blockShorteningDisabled, true, '2-2 has p1 = 1: no shortening (cap-less beam)');
  const other = load('stage_thunder02', 2);   // 12-1 beams: p1 = 0, shortening enabled
  const beam = other.thunders[0];
  const box = other.pushBoxes[0];
  const full = beam.activeLengthFor([]);
  box.applyRect({ ...box.rect, x: beam.spawn.x + 200, y: beam.spawn.y - box.rect.height / 2 });
  const blockers = [box.rect];
  assert.equal(beam.activeLengthFor(blockers), 200, 'cut at the box near edge');
  assert.ok(full > 200);
});

test('a cat touching a beam dies on the second consecutive step (FUN_7ff72bb4d850 latch)', () => {
  const game = load('stage_multijump02', 2);
  const thunder = game.thunders.find((entry) => entry.spawn.y === 216);
  const [a] = game.players;
  step(game, 2);
  place(a, thunder.spawn.x + 100, thunder.spawn.y - 20);
  let diedAt = -1;
  for (let frame = 0; frame < 6 && diedAt < 0; frame++) {
    place(a, thunder.spawn.x + 100, thunder.spawn.y - 20);
    step(game, 1);
    if (a.deathTimer > 0 || game.deathFallPlayers.has(a)) diedAt = frame;
  }
  assert.ok(diedAt >= 1 && diedAt <= 3, 'died on the latch: frame ' + diedAt);
});

// ---------------------------------------------------------------------------------------------------------------
// guard-shields: FUN_7ff72bb56990 / FUN_7ff72bb56c10.

test('4-1 / 12-1 guard planks at frame 0 sit at the native offsets: Guard1 RIGHT {177,330,6,60}, Guard2 UP {176,325,48,6}, 12-1 LEFT {219,330,6,60}', () => {
  for (const party of [2, 4, 8]) {
    const four = load('stage_thunder01', party);
    const byDir = (game, dir) => game.guardShields.find((shield) => shield.dir === dir);
    assert.deepEqual(byDir(four, 3).rect, { x: 177, y: 330, width: 6, height: 60 }, 'Guard1 (150, 384) RIGHT: (180, 360) + {-3, -30, 6, 60}');
    assert.deepEqual(byDir(four, 0).rect, { x: 176, y: 325, width: 48, height: 6 }, 'Guard2 (200, 384) UP: (200, 328) + {-24, -3, 48, 6}');
    assert.deepEqual(byDir(load('stage_thunder02', party), 2).rect, { x: 219, y: 330, width: 6, height: 60 }, '12-1 Guard1 (250, 384) LEFT');
  }
  // The plank follows its owner (FUN_7ff72bb56c10 every frame), placed after this frame's motion (thunder-frame-order).
  const game = load('stage_thunder01', 2);
  for (let frame = 0; frame < 30; frame++) {
    step(game, 1, idle(2).map(() => ({ ...IDLE, right: true })));
    for (const shield of game.guardShields) {
      const ox = shield.owner.rect.x + 16, oy = shield.owner.rect.y + 47;
      assert.ok(near(shield.rect, { x: ox + shield.offset[0] + shield.shape[0], y: oy + shield.offset[1] + shield.shape[1], width: shield.shape[2], height: shield.shape[3] }),
        `frame ${frame}: the plank sits at its owner's current position`);
    }
  }
});

test('4-1: the UP plank cuts a ceiling beam above the guard, who lives; without the plank the guard dies', () => {
  for (const withPlank of [true, false]) {
    const game = load('stage_thunder01', 2);
    const beam = game.thunders.find((thunder) => thunder.direction === 'DIR_DOWN');
    const guard = game.guardShields.find((shield) => shield.dir === 0).owner;
    if (!withPlank) game.guardShields = game.guardShields.filter((shield) => shield.owner !== guard);
    let died = false;
    for (let frame = 0; frame < 12; frame++) {
      place(guard, beam.spawn.x - 16, 384 - 46);
      step(game, 1);
      if (guard.deathTimer > 0 || game.deathFallPlayers.has(guard)) died = true;
    }
    assert.equal(died, !withPlank, withPlank ? 'the plank protects the guard' : 'no plank: the beam kills');
  }
});

test('12-1: a guard LEFT plank between a RIGHT beam and a cat protects the cat behind it', () => {
  for (const withPlank of [true, false]) {
    const game = load('stage_thunder02', 2);
    const beam = game.thunders.find((thunder) => thunder.spawn.y === 288);
    const guardShield = game.guardShields.find((shield) => shield.dir === 2);
    const guard = guardShield.owner;
    const other = game.players.find((cat) => cat !== guard);
    if (!withPlank) game.guardShields = [];
    // Hold both cats in the beam's band (row point y 300: plank y 246..306 spans y 288), the other cat right of the guard.
    let died = false;
    for (let frame = 0; frame < 12; frame++) {
      place(guard, 400 - 16, 300 - 47);
      place(other, 440, 300 - 47);
      step(game, 1);
      if (other.deathTimer > 0 || game.deathFallPlayers.has(other)) died = true;
    }
    assert.equal(died, !withPlank, withPlank ? 'the plank protects the cat behind it' : 'no plank: the beam kills');
  }
});

test('thunder-frame-order: a guard walking right under a 4-1 beam shields the cat behind its plank on the second contact (parties 2/4/8)', () => {
  // Frame C: the cat steps into the beam while the plank is still short of it (first contact, latch set).
  // Frame C + 1: the guard's own motion carries the plank over the beam. Plank, cut and kill must all use that
  // frame's positions (FUN_7ff72bb56c10 -> FUN_7ff72bb4da00 -> FUN_7ff72bb4d850); the old start-of-frame plank
  // left the beam at 352 and killed the cat on this second contact.
  function run(party, withPlank) {
    const game = load('stage_thunder01', party);
    const shield = game.guardShields.find((entry) => entry.dir === 0);
    const guard = shield.owner;
    const other = game.players.find((cat) => cat !== guard);
    if (!withPlank) game.guardShields = game.guardShields.filter((entry) => entry !== shield);
    const slot = game.playerInputSlots[game.players.indexOf(guard)];
    const inputs = idle(game.players.length).map((input, index) => (index === slot ? { ...IDLE, right: true } : IDLE));
    const beam = game.thunders.find((thunder) => thunder.direction === 'DIR_DOWN' && thunder.spawn.x === 1680);
    const left = beam.spawn.x - 2;
    place(guard, 1600, 337.65);
    step(game, 1);
    let lastX = guard.rect.x, speed = 0, contact = -1, died = false;
    const lengths = [];
    for (let frame = 0; frame < 20; frame++) {
      const plankRight = guard.rect.x + 40; // UP plank: owner x + 16 + 0 - 24 + 48
      if (contact < 0 && speed > 0 && plankRight + speed <= left && plankRight + 2 * speed > left) contact = frame;
      place(other, contact >= 0 && frame <= contact + 2 ? left + 1 : 1560, 337.65);
      step(game, 1, inputs);
      speed = guard.rect.x - lastX;
      lastX = guard.rect.x;
      lengths[frame] = beam.drawnLength;
      if (other.deathTimer > 0 || game.deathFallPlayers.has(other)) died = true;
    }
    return { contact, died, lengths };
  }
  for (const party of [2, 4, 8]) {
    const shielded = run(party, true);
    assert.ok(shielded.contact > 0, `p${party}: the scenario reaches the contact frame`);
    assert.equal(shielded.lengths[shielded.contact], 352, `p${party}: first contact, the plank is short of the beam`);
    assert.equal(shielded.lengths[shielded.contact + 1], 278, `p${party}: next frame the moved plank cuts the beam at its top (y 326)`);
    assert.equal(shielded.died, false, `p${party}: the cat behind the moving plank lives`);
    assert.equal(run(party, false).died, true, `p${party}: without the plank the same second contact kills`);
  }
});

test('guards move and jump normally (no hold-JUMP freeze) and are never made immune by a button', () => {
  const game = load('stage_thunder01', 2);
  const guard = game.guardShields[0].owner;
  const index = game.players.indexOf(guard);
  step(game, 30);
  const x0 = guard.rect.x, y0 = guard.rect.y;
  const inputs = idle(8); inputs[game.playerInputSlots[index]] = { ...IDLE, right: true, jump: true, jumpPressed: true };
  step(game, 1, inputs);
  inputs[game.playerInputSlots[index]] = { ...IDLE, right: true, jump: true };
  step(game, 8, inputs);
  assert.ok(guard.rect.x > x0 + 10, 'walks while holding jump');
  assert.ok(guard.rect.y < y0 - 10, 'jumps');
  assert.equal(game.activelyGuardingPlayers.size, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// step-enemy-native.

const enemyStages = ['stage_majo01', 'stage_majo02', 'stage_bowwow01', 'stage_traffic_light01', 'stage_ghost01', 'stage_move01', 'stage_auto_scroll02'];

test('StepEnemies: 48 x 26 centred on the row point at frame 0; they fall onto a support and stand there (parties 2/4/8)', () => {
  for (const source of enemyStages) {
    for (const party of [2, 4, 8]) {
      const game = load(source, party);
      for (const enemy of game.stepEnemies) {
        assert.deepEqual(rectOf(enemy), { x: enemy.spawn.x - 24, y: enemy.spawn.y - 13, width: 48, height: 26 }, source);
      }
      step(game, 120);
      for (const enemy of game.stepEnemies) {
        const below = { ...enemy.rect, y: enemy.rect.y + enemy.rect.height, height: 1 };
        const supported = game.tileMap.rectHitsSolid(below)
          || [...game.staticRects.map((b) => b.rect), ...game.weightedLifts.map((l) => l.rect), ...game.pushBoxes.map((b) => b.rect)]
            .some((r) => below.x < r.x + r.width && below.x + below.width > r.x && below.y < r.y + r.height && below.y + below.height > r.y);
        assert.ok(supported || enemy.rect.y > game.tileMap.pixelHeight, `${tagOf(source)} p${party} enemy at ${enemy.spawn.x} stands on something: ${JSON.stringify(rectOf(enemy))}`);
      }
    }
  }
});

test('7-4 StepEnemies fall to the 432 floor (y 406..432) and walk left (p0 -1); 7-3 walks right by default and turns at a wall', () => {
  const move = load('stage_move01', 2);
  step(move, 90);
  for (const enemy of move.stepEnemies) assert.ok(Math.abs(enemy.rect.y + enemy.rect.height - 432) < 0.01, 'on the floor');
  const fresh = load('stage_move01', 2);
  assert.deepEqual(fresh.stepEnemies.map((enemy) => enemy.walkDirection), [-1, -1, -1], 'p0 -1: they start walking left');
  const x0 = move.stepEnemies.map((enemy) => enemy.rect.x);
  step(move, 30);
  move.stepEnemies.forEach((enemy, i) => assert.ok(Math.abs(enemy.rect.x - x0[i]) > 5, 'walking (1 unit per tick)'));
  const ghost = load('stage_ghost01', 2);
  const [slug] = ghost.stepEnemies;
  assert.equal(slug.walkDirection, 1, 'no p0: walks right');
  let turned = false;
  for (let frame = 0; frame < 2400 && !turned; frame++) { step(ghost, 1); if (slug.walkDirection < 0) turned = true; }
  assert.ok(turned, 'it turned back at a wall');
});

test('StepEnemy kill rule: a cat walking into its side dies; a cat landing on top is safe', () => {
  const game = load('stage_move01', 2);
  step(game, 90);
  const [enemy] = game.stepEnemies;
  const [a] = game.players;
  // side
  place(a, enemy.rect.x + enemy.rect.width - 2, 432 - 46);
  step(game, 2);
  assert.ok(a.deathTimer > 0 || game.deathFallPlayers.has(a), 'side contact kills');
  // top
  const game2 = load('stage_move01', 2);
  step(game2, 90);
  const [enemy2] = game2.stepEnemies;
  const [b] = game2.players;
  place(b, enemy2.rect.x + 8, enemy2.rect.y - 46 - 6);
  b.velocity.y = 120;
  let died = false;
  for (let frame = 0; frame < 4; frame++) { step(game2, 1); if (b.deathTimer > 0) died = true; }
  assert.equal(died, false, 'landing on top is safe');
});

test('UpDownEnemy is the native 56 x 48 sensor {x-28, y-22}; BowwowEnemy the native 60 x 78 {x-30, y-39}', () => {
  for (const source of ['stage_majo01', 'stage_majo02', 'stage_ghost01']) {
    for (const enemy of load(source, 2).upDownEnemies) {
      assert.deepEqual(rectOf(enemy), { x: enemy.spawn.x - 28, y: enemy.spawn.y - 22, width: 56, height: 48 }, source);
    }
  }
  const [dog] = load('stage_bowwow01', 2).bowwowEnemies;
  assert.deepEqual(rectOf(dog), { x: 768 - 30, y: 280 - 39, width: 60, height: 78 });
});

test('Bowwow wakes on the 30-frame average movement: one fast frame does not wake it, steady walking does', () => {
  const game = load('stage_bowwow01', 2);
  const [dog] = game.bowwowEnemies;
  const [a, b] = game.players;
  place(b, 100, 432 - 46);
  place(a, 700, 432 - 46);
  step(game, 40);
  const startRect = rectOf(dog);
  // One 40-unit hop in a single frame, then still: the average stays under 1.5.
  place(a, 740, 432 - 46);
  step(game, 25);
  assert.ok(Math.abs(dog.rect.x - startRect.x) < 1, 'still asleep after one fast frame');
  // Steady walking (4.9 per frame) wakes it and it chases.
  const inputs = idle(8); inputs[game.playerInputSlots[0]] = { ...IDLE, left: true };
  step(game, 60, inputs);
  assert.ok(Math.abs(dog.rect.x - startRect.x) > 2 || Math.abs(dog.rect.y - startRect.y) > 2, 'awake and moving');
});

test('determinism (240 frames) on 4-1, 7-1, 7-4: two runtimes, identical cats, enemies, beams and shields', () => {
  for (const source of ['stage_thunder01', 'stage_bowwow01', 'stage_move01']) {
    const games = [load(source, 4, 5), load(source, 4, 5)];
    for (let frame = 0; frame < 240; frame++) {
      const dir = Math.floor(frame / 60) % 2 === 0;
      const inputs = Array.from({ length: 8 }, () => ({ ...IDLE, right: dir, left: !dir, jump: frame % 45 >= 10 && frame % 45 < 25, jumpPressed: frame % 45 === 10 }));
      for (const game of games) game.update(1 / 60, inputs[0], inputs);
      const snap = (game) => JSON.stringify([game.players.map(rectOf), game.stepEnemies.map(rectOf), game.bowwowEnemies.map(rectOf),
        game.thunders.map((t) => t.baseLength), game.guardShields.map((s) => s.rect)]);
      assert.equal(snap(games[0]), snap(games[1]), source + ' frame ' + frame);
    }
  }
});

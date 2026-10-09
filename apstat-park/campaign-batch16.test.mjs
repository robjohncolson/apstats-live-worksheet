// Batch 16 (scripts/pico-campaign-patches.mjs): death-restarts-stage (a cat death rebuilds the whole stage after the
// native 0.5 s fade) and rope-native-swing (the rope runs before the cats; a yanked cat coasts like a pendulum).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { loadStage, STAGES, IDLE } = await import('./campaign-solve/driver.mjs');
const PARTIES = [2, 4, 8];
const FADE_TICKS = 30;   // DAT_7ff72bcff4fc = 0.5 s at 60 Hz

/** Inputs for one tick: buttons[i] is a partial button set for cat i, placed at its input slot; the jump / up press
 *  edges are derived from the previous tick (as the relay wire carries them). */
function inputsFor(run, buttons = []) {
  const game = run.game;
  run.held ||= [];
  const inputs = Array.from({ length: 8 }, () => IDLE);
  game.players.forEach((cat, i) => {
    const slot = game.playerInputSlots[i] ?? i;
    const spec = { ...IDLE, ...(buttons[i] || {}) };
    const prev = run.held[slot] || {};
    inputs[slot] = { ...spec, jumpPressed: spec.jump && !prev.jump, upPressed: spec.up && !prev.up };
  });
  run.held = inputs;
  return inputs;
}
const tick = (run, buttons) => run.tick(inputsFor(run, buttons));
const idleTicks = (run, n) => { for (let i = 0; i < n; i++) tick(run); };

/** Kill cat `index`: off the bottom of the screen where the stage has a fail line, else a fatal hit (state 3). */
function kill(game, index = 0) {
  const cat = game.players[index];
  if (game.scrollCameraConfig) {
    cat.applyResolvedCollision({ ...cat.rect, y: 5000 }, { x: 0, y: 0 }, false);
    return 'offscreen';
  }
  game.startPlayerDeathSequence(cat, game.playerInputSlots[index] ?? index);
  return 'hazard';
}

/** Tick until a restart has run (the fade counted down to 0 after it started). Returns the random state the rebuild
 *  drew from (frozen during the fade) and the tick count. */
function runUntilRestart(run, max = 900) {
  const game = run.game;
  let state = null;
  for (let i = 0; i < max; i++) {
    const fading = game.restartFadeSeconds > 0;
    if (fading && state === null) state = runtime.getRandomState();
    tick(run);
    if (fading && game.restartFadeSeconds === 0) return { state, ticks: i + 1 };
  }
  throw new Error('no restart within ' + max + ' ticks');
}

// ---- a deep, generic fingerprint of every actor list the runtime holds -------------------------------------------
const SKIP_KEYS = new Set(['view', 'root', 'world', 'parent', 'sprite', 'texture', 'graphics']);
function flat(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return undefined;
  if (depth > 2) return undefined;
  if (Array.isArray(value)) return value.length > 400 ? value.length + ':' + value.slice(0, 400).join(',') : value.map((v) => flat(v, depth + 1));
  if (value instanceof Map || value instanceof Set) return 'size:' + value.size;
  if (typeof value === 'object') {
    // Pixi display objects / textures are presentation (e.g. a push-box label redrawn by the first update).
    if (typeof value.updateTransform === 'function' || 'baseTexture' in value || 'textureCacheIds' in value) return undefined;
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (SKIP_KEYS.has(key)) continue;
      const f = flat(v, depth + 1);
      if (f !== undefined) out[key] = f;
    }
    return out;
  }
  return undefined;
}
function fingerprint(game) {
  const out = {};
  for (const [key, value] of Object.entries(game)) {
    if (SKIP_KEYS.has(key) || key === 'onEvent' || key === 'emit') continue;
    // Per-frame scratch buffers, rewritten at the start of every frame before any read.
    if (/^frame/.test(key)) continue;
    if (Array.isArray(value) || value instanceof Map || value instanceof Set) out[key] = flat(value, 0);
    else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') out[key] = flat(value);
  }
  out.cleared = game.cleared;
  out.stageResultFlags = game.stageResultFlags;
  out.restartFadeSeconds = game.restartFadeSeconds;
  out.scroll = flat(game.scrollCameraState);
  out.chips = game.tileMap.map.table.join(',');
  out.puzzle = game.puzzle ? flat({ grid: game.puzzle.grid, lines: game.puzzle.linesCleared, won: game.puzzle.won,
    failed: game.puzzle.failed, seed: game.puzzle.seed,
    blocks: game.puzzle.blocks.map((b) => ({ x: b.x, y: b.y, piece: b.piece, next: b.next, active: b.active })) }) : null;
  out.keys = game.keys.map((key) => ({ active: key.active, collected: key.collected, x: key.rect.x, y: key.rect.y }));
  out.cats = game.players.map((cat) => ({ ...cat.rect, vx: cat.velocity.x, vy: cat.velocity.y, grounded: cat.grounded,
    dead: cat.deathTimer, coast: cat.ropeCoast, facing: cat.getFacingDirection() }));
  return JSON.parse(JSON.stringify(out));
}
function diffKeys(a, b) {
  return Object.keys({ ...a, ...b }).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

// ---------------------------------------------------------------------------------------------------------------
test('death-restarts-stage, 2-2 exact: crossed FallBoxes and the key come back, cats at their spawns', () => {
  for (const party of PARTIES) {
    const run = loadStage('stage_fall01', party, 1);
    const game = run.game;
    const fresh = fingerprint(loadStage('stage_fall01', party, 1).game);
    const boxes = game.fallBoxes.length;
    if (party === 2) assert.equal(boxes, 27, '2-2 party 2 has 27 FallBoxes');
    const spawns = game.players.map((cat) => ({ x: cat.rect.x, y: cat.rect.y }));
    const key = { ...game.keys[0].rect };
    // Every cat walks right across the FallBoxes (hopping when stalled) until some boxes fall.
    for (let f = 0; f < 600 && !game.fallBoxes.some((box) => box.falling); f++) {
      tick(run, game.players.map(() => ({ right: true, jump: f % 30 < 14 })));
    }
    assert.ok(game.fallBoxes.some((box) => box.falling) || game.fallBoxes.length < boxes, `p${party}: boxes fell`);
    for (let f = 0; f < 90; f++) tick(run, game.players.map(() => ({ right: true })));
    const before = game.players[0];
    kill(game, 0);
    const { ticks } = runUntilRestart(run);
    assert.ok(ticks >= FADE_TICKS, `p${party}: the fade ran`);
    assert.notEqual(game.players[0], before, 'new cats');
    assert.equal(game.fallBoxes.length, boxes, `p${party}: every FallBox is back`);
    assert.ok(game.fallBoxes.every((box) => !box.falling), 'none falling');
    assert.deepEqual(game.fallBoxes.map((box) => box.rect.x), fresh.fallBoxes.map((box) => box.rect.x));
    assert.deepEqual({ ...game.keys[0].rect }, key, 'the key is back at its row');
    assert.equal(game.carriedKeys.length, 0);
    assert.deepEqual(game.players.map((cat) => ({ x: cat.rect.x, y: cat.rect.y })), spawns, 'cats at their spawns');
    assert.equal(game.players.length, party);
    assert.equal(game.stageResultFlags, 0);
  }
});

test('death-restarts-stage: every stage at parties 2 / 4 / 8 rebuilds exactly to a fresh load after a death', () => {
  const failures = [];
  for (const stage of STAGES) {
    for (const party of PARTIES) {
      const run = loadStage(stage.source, party, 7);
      const game = run.game;
      // 300 frames of scripted destruction: walk / jump right, then left; whatever can drop, drops.
      for (let f = 0; f < 300 && !game.cleared; f++) {
        const right = f < 150;
        tick(run, game.players.map((_, i) => ({ right, left: !right, jump: (f + i * 7) % 40 < 14, down: f % 50 < 5 })));
      }
      if (game.cleared) continue;
      // A restart may already be fading: let it finish first.
      if (game.restartFadeSeconds > 0) runUntilRestart(run);
      kill(game, 0);
      const { state } = runUntilRestart(run);
      const freshRun = loadStage(stage.source, party, state);
      const checkpoints = [...game.checkpointSpawns];
      for (const [index, target] of checkpoints) {
        freshRun.game.playerSpawns[index] = { ...target };
        if (index === 0) freshRun.game.playerSpawn = { ...target };
        freshRun.game.players[index].reset(target.x, target.y);
        freshRun.game.checkpointSpawns.set(index, target);
      }
      const a = fingerprint(game), b = fingerprint(freshRun.game);
      const differing = diffKeys(a, b);
      if (differing.length) failures.push(`${stage.tag} p${party}: ${differing.join(', ')}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('death-restarts-stage: an off-screen fall raises the restart on the same tick, then the 0.5 s fade, then one rebuild', () => {
  for (const party of PARTIES) {
    const events = [];
    const run = loadStage('stage_fall01', party, 1);
    const game = run.game;
    game.onEvent = (event) => events.push(event.type);
    idleTicks(run, 5);
    const cat = game.players[0];
    cat.applyResolvedCollision({ ...cat.rect, y: 5000 }, { x: 0, y: 0 }, false);
    tick(run);
    assert.equal(game.stageResultFlags & 2, 2, 'flag raised on the fall tick');
    assert.equal(game.restartFadeSeconds, 0.5, 'the fade starts');
    assert.equal(cat.deathTimer, 0, 'no 1.0 s hold');
    assert.ok(events.includes('hit'));
    const other = { ...game.players[1].rect };
    for (let i = 1; i < FADE_TICKS; i++) {
      tick(run, game.players.map(() => ({ right: true })));
      assert.equal(game.players[0], cat, `still fading at +${i}`);
      assert.deepEqual({ ...game.players[1].rect }, other, 'the stage is frozen during the fade');
    }
    tick(run);
    assert.notEqual(game.players[0], cat, 'rebuilt on the 30th tick after the flag');
    assert.equal(game.restartFadeSeconds, 0);
  }
});

test('death-restarts-stage: a fatal hit keeps the 1.0 s hold and the fall, then restarts (no lone respawn)', () => {
  const run = loadStage('stage_fall01', 2, 1);
  const game = run.game;
  idleTicks(run, 5);
  const cat = game.players[0];
  game.startPlayerDeathSequence(cat, 0);
  let flagTick = -1;
  for (let t = 1; t < 400 && flagTick < 0; t++) {
    tick(run);
    if (game.stageResultFlags & 2) flagTick = t;
    assert.equal(game.players[0], cat, 'the cat is never respawned on its own');
  }
  assert.ok(flagTick > 60, 'flag only after the hold and the fall: ' + flagTick);
  idleTicks(run, FADE_TICKS - 1);
  assert.equal(game.players[0], cat);
  tick(run);
  assert.notEqual(game.players[0], cat, 'rebuilt');
});

test('death-restarts-stage: map chips come back on a stage without map variants (2-2, 1-3)', () => {
  for (const source of ['stage_fall01', 'stage_jump02']) {
    const run = loadStage(source, 2, 1);
    const game = run.game;
    const pristine = game.tileMap.map.table.join(',');
    const solid = game.tileMap.map.table.findIndex((chip) => chip !== 'MC_NON' && chip !== '');
    const width = game.tileMap.map.width;
    game.tileMap.setChip(solid % width, Math.floor(solid / width), 'MC_NON');
    assert.notEqual(game.tileMap.map.table.join(','), pristine);
    game.resetStage();
    assert.equal(game.tileMap.map.table.join(','), pristine, `${source}: resetStage reloads the original definition`);
    game.tileMap.setChip(solid % width, Math.floor(solid / width), 'MC_NON');
    kill(game, 0);
    runUntilRestart(run);
    assert.equal(game.tileMap.map.table.join(','), pristine, `${source}: a death restart rebuilds the map`);
  }
});

test('death-restarts-stage: a CheckPoint target survives the restart (5-1, 5-3, 5-4); the others go back to the rows', () => {
  for (const source of ['stage_majo01', 'stage_majo02', 'stage_multijump02']) {
    for (const party of PARTIES) {
      const run = loadStage(source, party, 1);
      const game = run.game;
      const rows = game.players.map((cat) => ({ x: cat.rect.x, y: cat.rect.y }));
      const point = game.checkPoints[0];
      const cat = game.players[0];
      cat.applyResolvedCollision({ ...cat.rect, x: point.rect.x, y: point.rect.y }, { x: 0, y: 0 }, false);
      tick(run);
      assert.ok(point.activated, `${source} p${party}: reached`);
      const target = { ...game.playerSpawns[0] };
      kill(game, game.players.length - 1);
      runUntilRestart(run);
      const fresh = game.players[0];
      assert.deepEqual(game.playerSpawns[0], target, 'spawn kept');
      const expected = loadStage(source, party, 1).game.players[0];
      expected.reset(target.x, target.y);
      assert.deepEqual({ ...fresh.rect }, { ...expected.rect }, 'cat 0 restarts at the CheckPoint');
      game.players.slice(1).forEach((other, i) => {
        if (game.players.length > 1 && i + 1 < rows.length) assert.deepEqual({ x: other.rect.x, y: other.rect.y }, rows[i + 1]);
      });
      assert.equal(game.checkPoints[0].activated, false, 'the CheckPoint actor itself is rebuilt (INFERENCE)');
    }
  }
});

test('death-restarts-stage: Desk teacher cats are kept with their slot, at their spawn', () => {
  for (const party of PARTIES) {
    const run = loadStage('stage_fall01', party, 1);
    const game = run.game;
    const row = runtime.stages.find((entry) => entry.source === 'stage_fall01').data.createTable
      .find((spawn) => /Player/.test(spawn.actorName));
    game.addRuntimePlayer({ ...row, actorName: 'Player', label: String(party + 1), raw: [...row.raw] });
    const teacher = game.players.at(-1);
    teacher.parkHelper = true;
    game.playerInputSlots[game.players.length - 1] = party;
    const teacherSpawn = { x: teacher.rect.x, y: teacher.rect.y };
    for (let f = 0; f < 60; f++) tick(run, game.players.map(() => ({ right: true })));
    kill(game, 0);
    runUntilRestart(run);
    assert.equal(game.players.length, party + 1);
    assert.equal(game.players[party], teacher, 'the same teacher cat object');
    assert.equal(game.playerInputSlots[party], party);
    assert.deepEqual({ x: teacher.rect.x, y: teacher.rect.y }, teacherSpawn, 'at its spawn');
    assert.equal(game.requiredPlayerCount, party, 'requiredPlayerCount kept');
  }
});

test('death-restarts-stage: a journal replayed through restarts gives the identical state', () => {
  const play = (source, party) => {
    const run = loadStage(source, party, 11);
    const game = run.game;
    const log = [];
    for (let f = 0; f < 900; f++) {
      if (f === 200 || f === 520) kill(game, f === 200 ? 0 : party - 1);
      tick(run, game.players.map((_, i) => ({ right: (f + i) % 90 < 60, left: (f + i) % 90 >= 75, jump: (f * 3 + i) % 45 < 12 })));
      if (f % 50 === 49) log.push(JSON.stringify(fingerprint(game)) + runtime.getRandomState());
    }
    return log;
  };
  for (const source of ['stage_fall01', 'stage_switch_puzzle01', 'stage_constraint01']) {
    for (const party of [2, 4]) assert.deepEqual(play(source, party), play(source, party), `${source} p${party}`);
  }
});

/** Put cat 0 on `rect` (standing on its top when `onTop`, else overlapping its centre), tick until the restart, and
 *  compare with a fresh load from the random state the rebuild drew. */
function killByContactAndCompare(source, party, rect, { onTop, everyCat }) {
  const run = loadStage(source, party, 3);
  const game = run.game;
  idleTicks(run, 3);
  const cat = game.players[0];
  const x = rect.x + rect.width / 2 - cat.rect.width / 2;
  const y = onTop ? rect.y - cat.rect.height : rect.y + rect.height / 2 - cat.rect.height / 2;
  cat.applyResolvedCollision({ ...cat.rect, x, y }, { x: 0, y: 0 }, onTop);
  const before = [...game.players];
  // A plane rides the auto-scroll (FUN_7ff72bb708d0, batch 17): it moved by the scroll step in the hit tick.
  const carry = cat.mode === 'plane' ? game.scrollCameraConfig.autoScrollSpeed : 0;
  tick(run);
  const hit = before.filter((c) => c.deathTimer > 0 || game.deathFallPlayers.has(c));
  assert.ok(hit.includes(cat), `${source} p${party}: the contact is a fatal hit`);
  if (everyCat) assert.equal(hit.length, before.length, `${source} p${party}: every cat takes the hit`);
  assert.deepEqual({ x: cat.rect.x, y: cat.rect.y }, { x: x + carry, y: cat.rect.y }, 'not respawned on its own');
  let flagged = 0;
  for (let t = 0; t < 600 && !(game.stageResultFlags & 2); t++) { tick(run); flagged = t; }
  assert.ok(flagged > 55, `${source} p${party}: the 1 s hold and the fall run first (${flagged})`);
  const { state } = runUntilRestart(run);
  assert.ok(game.players.every((c) => !before.includes(c)), 'every cat rebuilt, the partner too');
  const fresh = loadStage(source, party, state);
  assert.deepEqual(diffKeys(fingerprint(game), fingerprint(fresh.game)), [], `${source} p${party}: equals a fresh load`);
}

test('death-restarts-stage (review): a DeadSwitch press is a fatal hit for every cat -> restart (6-4, 12-4)', () => {
  for (const source of ['stage_jump06', 'stage_auto_scroll02']) {
    for (const party of PARTIES) {
      const game = loadStage(source, party, 3).game;
      assert.ok(game.deadSwitches.length > 0);
      killByContactAndCompare(source, party, game.deadSwitches[0].rect, { onTop: true, everyCat: true });
    }
  }
});

test('death-restarts-stage (review): a PlaneObstacle contact is a fatal hit -> restart (4-2)', () => {
  for (const party of PARTIES) {
    const game = loadStage('stage_plane01', party, 3).game;
    const obstacle = game.planeObstacles.find((o) => o.spawn.actorName === 'PlaneObstacle');
    assert.ok(obstacle && game.players[0].mode === 'plane');
    killByContactAndCompare('stage_plane01', party, obstacle.rect, { onTop: false, everyCat: false });
  }
});

// ---------------------------------------------------------------------------------------------------------------
const TRACES = JSON.parse(readFileSync(new URL('./campaign-batch16.rope-traces.json', import.meta.url), 'utf8'));
function portTrace(name) {
  const sc = TRACES[name];
  const run = loadStage(sc.start.source, 2, 1);
  const [a, b] = run.game.players;
  const set = (cat, s) => cat.applyResolvedCollision({ ...cat.rect, x: s.x, y: s.y }, { x: s.vx * 60, y: s.vy * 60 }, s.grounded);
  set(a, sc.start.A); set(b, sc.start.B);
  const rope = run.game.distanceConstraints[0].params.values;
  assert.deepEqual([rope[0], rope[1]], [sc.start.rope.maxDist, sc.start.rope.w]);
  return sc.native.map((n) => {
    tick(run);
    return { n, gap: Math.max(Math.abs(n.A[0] - a.rect.x), Math.abs(n.A[1] - a.rect.y), Math.abs(n.B[0] - b.rect.x), Math.abs(n.B[1] - b.rect.y)) };
  });
}

test('rope-native-swing: 2-1 swing matches the native reference every tick for 120 ticks (<= 0.01 px)', () => {
  const rows = portTrace('swing-2-1');
  const worst = rows.reduce((m, r) => (r.gap > m.gap ? r : m), { gap: 0 });
  assert.ok(worst.gap <= 0.01, `worst ${worst.gap} at t${worst.n?.t}`);
  // The pendulum: B crosses under the stone and back, A stays on the stone.
  const xs = TRACES['swing-2-1'].native.map((n) => n.B[0]);
  assert.ok(Math.max(...xs) > 1440 && xs.at(-1) < 1400);
});

test('rope-native-swing: 2-3 hang matches the native reference (<= 0.01 px until B lands; < 1 px after)', () => {
  const rows = portTrace('hang-2-3');
  const beforeLanding = rows.filter((r) => r.n.t <= 31);
  assert.ok(beforeLanding.every((r) => r.gap <= 0.01), 'exact through the taut tick and the first yank');
  // Residual (explained): at t32 B lands on the floor below the shaft. The native world step sweeps to the face; the
  // port's tile sweep (physics.ts sweepAxis, 1 px sub-steps) stops up to 1 px short (0.53 px here), so every later
  // tick inherits that offset through the rope geometry. Not rope logic: a port-wide physics property.
  const worst = Math.max(...rows.map((r) => r.gap));
  assert.ok(worst < 1, `worst ${worst}`);
  const end = rows.at(-1).n;
  assert.ok(end.A[1] === 50, 'native A never leaves the top');
});

test('rope-native-swing: a yanked cat ignores left / right until it lands (parties 2 / 4 / 8); the p2 anchor stays on its ledge', () => {
  for (const party of PARTIES) {
    const runs = [0, 1].map(() => loadStage('stage_constraint02', party, 1));
    for (const run of runs) {
      const cats = run.game.players;
      cats.forEach((cat, i) => cat.applyResolvedCollision({ ...cat.rect, x: 1000 - 40 * (cats.length - 2 - i), y: 50 },
        { x: 0, y: 0 }, true));
      const b = cats.at(-1);
      b.applyResolvedCollision({ ...b.rect, x: 1070, y: 50 }, { x: 0, y: 0 }, false);
    }
    const [plain, steered] = runs;
    const bp = plain.game.players.at(-1), bs = steered.game.players.at(-1);
    let coasted = 0;
    for (let t = 0; t < 120; t++) {
      const coasting = bs.ropeCoast;
      tick(plain);
      // Steer only while the rope has the cat coasting (before that both runs are identical).
      const buttons = [];
      if (coasting) buttons[steered.game.players.length - 1] = { right: t % 20 < 10, left: t % 20 >= 10 };
      tick(steered, buttons);
      if (coasting && !bs.grounded) {
        coasted++;
        assert.equal(bs.rect.x, bp.rect.x, `p${party} t${t}: steering ignored while coasting`);
      }
    }
    assert.ok(coasted > 20, `p${party}: the hanging cat coasted (${coasted} ticks)`);
    const anchor = plain.game.players.at(-2);
    // The anchor staying on top is the native party-2 trace (310 / w 1); at parties 4 / 8 the rope is 160 / 0.4 and
    // 110 / 0.3 with a different chain, which no native trace covers, so only the coasting rule is checked there.
    if (party === 2) assert.equal(anchor.rect.y + anchor.rect.height, 96, 'p2: the anchor is still on the top block');
  }
});

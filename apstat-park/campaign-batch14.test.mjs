// Batch 14 (scripts/pico-campaign-patches.mjs): puzzle-stage-data, puzzle-proxies-netcode-only, puzzle-tetris and
// puzzle-tetris-draw -- the native co-op Tetris sub-stage of 8-1 (stage_switch_puzzle01) / 8-3 (stage_switch_puzzle02).
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
  action: false, actionPressed: false, resetPressed: false, prevStagePressed: false, nextStagePressed: false };
const PARTIES = [2, 4, 8];
const PUZZLES = ['stage_switch_puzzle01', 'stage_switch_puzzle02'];
const W = 54;
const LANDED = 0x24;
const FALLING = 0x1a;

function load(source, partySize = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
const idle = () => Array.from({ length: 8 }, () => IDLE);
function step(game, frames, inputs = idle()) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
/** Inputs by input slot (= the Block's player index). */
function slots(buttons) {
  return idle().map((input, slot) => (buttons[slot] ? { ...IDLE, ...buttons[slot] } : input));
}
const blockOf = (game, player) => game.puzzle.blocks.find((block) => block.player === player);
const cell = (game, x, y) => game.puzzle.grid[y * W + x];
const setCell = (game, x, y, code) => { game.puzzle.grid[y * W + x] = code; };
/** Every judge cell of row r landed (colour 0): the next map update clears it. */
function fillRow(game, r) {
  const { x, w } = game.puzzle.judge;
  for (let i = x; i < x + w; i++) setCell(game, i, r, LANDED);
}
/** Relay seeds whose puzzle seed (one picoRandom draw at setup) is even / odd. */
function relaySeedWithParity(source, parity) {
  for (let seed = 1; seed < 100; seed++) if (load(source, 2, seed).puzzle.seed % 2 === parity) return seed;
  throw new Error('no seed');
}
/** Soft-drop (press / release DOWN) until the Block stops falling: it has landed, 1 tick inside the 0.12 s grace. */
function dropToFloor(game, player) {
  const block = blockOf(game, player);
  for (let i = 0; i < 40; i++) {
    const y = block.y;
    step(game, 1, slots({ [player]: { down: true } }));
    if (block.y === y) return;
    step(game, 1);
  }
  throw new Error('never landed');
}

// Native generator vectors (b14/decode/rng_vectors.txt; rng.py, verified against the decompiled FUN_7ff72bba81c0).
const EVEN = '1011001001010110010111100110110111001110110000010111000010101010';
const ODD = '0010100111001101110011001100000000011101111011110110000001001110';
const INIT = {
  0: { 7: 'IL', 5: 'II', 3: 'LL', 1: 'IL', 2: 'LI', 4: 'LI', 6: 'LI', 8: 'IL' },
  1: { 7: 'LL', 5: 'IL', 3: 'IL', 1: 'LI', 2: 'II', 4: 'LL', 6: 'II', 8: 'LI' },
};
const POST_INIT = {
  0: 'LILIIIILLIILIILIIILLIIILIILLLLLILIIILLLLILILILIL',
  1: 'IILLIILLIILLLLLLLLLIIILIIIILIIIILIILLLLLLILLIIIL',
};

// ---------------------------------------------------------------------------------------------------------------
// The generator

test('generator: the piece sequence matches the native vectors; only the seed parity matters', () => {
  const seq = (seed) => runtime.GameRuntime.puzzlePieceSequence(seed, 64).join('');
  assert.equal(seq(0), EVEN);
  assert.equal(seq(1), ODD);
  for (const seed of [2, 4, 0x7ffffffe]) assert.equal(seq(seed), EVEN, `seed ${seed}`);
  for (const seed of [3, 12345, 0xdeadbeef]) assert.equal(seq(seed), ODD, `seed ${seed}`);
});

test('generator: 2 init draws per Block in createTable order (inactive ones too), then the shared stream', () => {
  for (const parity of [0, 1]) {
    const game = load('stage_switch_puzzle01', 2, relaySeedWithParity('stage_switch_puzzle01', parity));
    const { puzzle } = game;
    assert.equal(puzzle.seed % 2, parity);
    assert.deepEqual(puzzle.blocks.map((b) => b.label), ['7', '5', '3', '1', '2', '4', '6', '8']);
    for (const block of puzzle.blocks) {
      assert.equal('LI'[block.piece] + 'LI'[block.next], INIT[parity][block.label], `Block${block.label}`);
    }
    assert.equal(puzzle.previewPieces(48).map((p) => 'LI'[p]).join(''), POST_INIT[parity]);
  }
});

test('seed: the puzzle seed is one draw of the relay-seeded random; same seed -> identical play', () => {
  const script = (game) => {
    for (let i = 0; i < 400; i++) {
      const press = i % 3 === 0;
      step(game, 1, slots({ 0: { down: press, left: i % 50 < 10, jump: i % 40 === 0, jumpPressed: i % 40 === 0 },
        1: { right: i % 30 < 8, down: press } }));
    }
    return game.puzzle.grid.join(',');
  };
  for (const source of PUZZLES) {
    const a = load(source, 2, 77);
    const b = load(source, 2, 77);
    assert.equal(a.puzzle.seed, b.puzzle.seed);
    assert.equal(script(a), script(b), `${source}: replay identical`);
    const even = load(source, 2, relaySeedWithParity(source, 0));
    const odd = load(source, 2, relaySeedWithParity(source, 1));
    assert.notDeepEqual(even.puzzle.previewPieces(16), odd.puzzle.previewPieces(16));
    assert.notDeepEqual(even.puzzle.blocks.map((b) => b.piece), odd.puzzle.blocks.map((b) => b.piece));
  }
  // Other stages never draw for a puzzle: their random stream is untouched.
  runtime.setRandomState(5);
  load('stage_jump01', 2, 5);
  assert.equal(runtime.getRandomState(), 5);
});

// ---------------------------------------------------------------------------------------------------------------
// puzzle-stage-data + grid

test('stage data: puzzle.map carries the tables, judge, info and fall table', () => {
  for (const source of PUZZLES) {
    const map = runtime.stages.find((stage) => stage.source === source).data.puzzle.map;
    assert.equal(map.width, 54);
    assert.equal(map.height, 23);
    assert.equal(map.chipSize, 24);
    assert.equal(map.variable, 1);
    assert.deepEqual(map.judge, { x: 1, y: 8, w: 50, h: 14 });
    assert.equal(map.infoX, 636);
    assert.equal(map.infoY, 48);
    assert.equal(map.fallTimeFloorDefault, 0.5);
    assert.deepEqual(map.variantByPlayerCount, ['4', '4', '4', '4', '6', '6', '8', '8']);
    for (const key of ['4', '6', '8']) assert.equal(map.variants[key].length, 54 * 23);
  }
  const fall = (source) => runtime.stages.find((stage) => stage.source === source).data.puzzle.map.fallTimeTable;
  assert.deepEqual(fall('stage_switch_puzzle01')[1], [3, 0.4, 0.41, 0.42, 0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(fall('stage_switch_puzzle02'), [[0, 0.2, 0.2, 0.2, 0.3, 0.4, 0.4, 0.4], [5, 0.1, 0.1, 0.15, 0.25, 0.3, 0.3, 0.3]]);
});

test('grid parse: column-major Lua index k -> (k // 23, k % 23)', () => {
  // table4 Lua line 19 (x = 18) is MC_WAR from y 4 to 21; Lua index 18 * 23 + 10 = 424.
  const game = load('stage_switch_puzzle01', 2);
  assert.equal(game.puzzle.chips[10 * W + 18], 'MC_WAR');
  assert.equal(cell(game, 18, 10), 10, 'MC_WAR = 10');
  assert.equal(cell(game, 19, 10), 1, 'the well is empty (MC_NON)');
  assert.equal(cell(game, 22, 5), 11, 'bay separator MC_INC');
  assert.equal(cell(game, 19, 22), 11, 'table4 floor MC_INC');
  const six = load('stage_switch_puzzle01', 6);
  assert.equal(cell(six, 14, 22), 13, 'table6 floor corner MC_IRU');
  assert.equal(cell(six, 15, 22), 3, 'table6 floor MC_FLC');
});

test('bays and judge narrowing per party (4 / 6 / 8 tables; one active Block per player index < party)', () => {
  const judges = { 2: { x: 19, w: 15 }, 3: { x: 19, w: 15 }, 4: { x: 19, w: 15 }, 6: { x: 15, w: 23 }, 8: { x: 11, w: 31 } };
  for (const source of PUZZLES) {
    for (const party of [2, 3, 4, 6, 8]) {
      const { puzzle } = load(source, party);
      assert.deepEqual(puzzle.judge, { ...judges[party], y: 8, h: 14 }, `${source} p${party}`);
      const active = puzzle.blocks.filter((b) => b.active);
      assert.equal(active.length, party);
      assert.deepEqual(active.map((b) => b.player).sort(), [...Array(party).keys()]);
      for (const block of puzzle.blocks) {
        assert.equal(block.spawnY, 5);
        assert.equal(block.x, block.spawnX);
        const written = block.cells().every(({ x, y }) => cell({ puzzle }, x, y) === FALLING + block.player);
        assert.equal(written, block.active, `${source} p${party} Block${block.label}: only active Blocks are drawn`);
        // Every active Block sits in an open bay of this party's table.
        if (block.active) assert.equal(puzzle.chips[5 * W + block.spawnX - 1] === 'MC_NON' || puzzle.chips[5 * W + block.spawnX + 1] === 'MC_NON', true);
      }
    }
  }
});

test('proxies have no body or view; Blocks are not push boxes; no instant clear', () => {
  for (const source of PUZZLES) {
    for (const party of PARTIES) {
      const game = load(source, party);
      assert.equal(game.staticRects.filter((rect) => rect.spawn.actorName === 'PuzzlePredictProxy').length, 0);
      assert.equal(game.pushBoxes.length, 0);
      assert.equal(game.puzzle.view.parent, game.actorLayer);
      step(game, 120);
      assert.equal(game.cleared, false);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Input, movement, collision

test('movement: separate presses move one column; the bay walls stop the piece; left wins over right', () => {
  for (const party of PARTIES) {
    const game = load('stage_switch_puzzle01', party);
    const block = blockOf(game, 0);
    const minX = () => Math.min(...block.cells().map((c) => c.x));
    const maxX = () => Math.max(...block.cells().map((c) => c.x));
    for (let i = 0; i < 4; i++) { step(game, 1, slots({ 0: { left: true } })); step(game, 1); }
    assert.equal(minX(), 23, `p${party}: stopped by the separator at x 22`);
    for (let i = 0; i < 4; i++) { step(game, 1, slots({ 0: { right: true } })); step(game, 1); }
    assert.equal(maxX(), 25, `p${party}: stopped by the separator at x 26`);
    const x = block.x;
    const canGoLeft = minX() > 23;
    step(game, 1, slots({ 0: { left: true, right: true } }));
    assert.equal(block.x, canGoLeft ? x - 1 : x, 'left wins (never right)');
  }
});

test('rotation: JUMP press = (x, y) -> (-y, x) about the pivot; blocked -> no turn (no wall kick)', () => {
  const game = load('stage_switch_puzzle01', 2);
  const i = [0, 1].map((p) => blockOf(game, p)).find((b) => b.piece === 1);
  const l = [0, 1].map((p) => blockOf(game, p)).find((b) => b.piece === 0);
  const rotate = (block) => step(game, 1, slots({ [block.player]: { jump: true, jumpPressed: true } }));
  rotate(l);
  assert.deepEqual(l.shape, [[0, 0], [-1, 0], [0, 1]]);
  assert.equal(l.rotation, 1);
  step(game, 5, slots({ [l.player]: { jump: true } }));
  assert.equal(l.rotation, 1, 'held jump does not rotate again');
  rotate(i);
  assert.deepEqual(i.shape, [[0, -1], [0, 0], [0, 1]]);
  // Vertical I against the left separator: turning back needs x - 1 (solid) -> refused.
  step(game, 1, slots({ [i.player]: { left: true } }));
  assert.equal(Math.min(...i.cells().map((c) => c.x)), i.spawnX - 1);
  rotate(i);
  assert.deepEqual(i.shape, [[0, -1], [0, 0], [0, 1]], 'no wall kick');
  assert.equal(i.rotation, 1);
});

test('collision: another player\'s falling piece blocks a drop but is not ground (no lock)', () => {
  const game = load('stage_switch_puzzle01', 2);
  const a = blockOf(game, 0);
  const b = blockOf(game, 1);
  // Drop both into the open well, then park b right next to a.
  for (let i = 0; i < 6; i++) { step(game, 1, slots({ 0: { down: true }, 1: { down: true } })); step(game, 1); }
  for (const { x, y } of b.cells()) setCell(game, x, y, 1);
  b.x = a.x + 3; b.y = a.y + 2;
  b.shape = [[-1, 0], [0, 0], [1, 0]];
  for (const { x, y } of b.cells()) setCell(game, x, y, FALLING + 1);
  // A falling cell under a: a soft drop is refused but nothing locks.
  for (const { x, y } of a.cells()) setCell(game, x, y, 1);
  a.shape = [[-1, 0], [0, 0], [1, 0]]; a.x = b.x; a.y = b.y - 1;
  for (const { x, y } of a.cells()) setCell(game, x, y, FALLING);
  const y = a.y;
  step(game, 1, slots({ 0: { down: true } }));
  assert.equal(a.y, y, 'blocked by a falling piece');
  assert.equal(a.blocked, false);
  assert.ok(a.cells().every(({ x, y: cy }) => cell(game, x, cy) === FALLING), 'not locked (still falling cells)');
});

test('key repeat: fires on the press, after 134 ms held, then every 66 ms (DOWN soft drop)', () => {
  for (const party of PARTIES) {
    const game = load('stage_switch_puzzle01', party);
    const block = blockOf(game, 0);
    const ys = [];
    for (let t = 0; t < 24; t++) { step(game, 1, slots({ 0: { down: true } })); ys.push(block.y); }
    const fires = ys.map((y, t) => (y !== (t === 0 ? 5 : ys[t - 1]) ? t : -1)).filter((t) => t >= 0);
    assert.deepEqual(fires, [0, 8, 12, 15, 19, 23], `p${party}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Lock, grace, respawn

/** Ticks until a lock timer reset to delay runs out (float32, dt 1/60): the spec rule. */
function ticksToLock(delay) {
  const dt = Math.fround(1 / 60);
  let lock = Math.fround(delay);
  for (let k = 1; k < 200; k++) {
    const before = lock;
    lock = Math.fround(before - dt);
    if (Math.fround(before - dt) <= 0) return k;
  }
  return -1;
}

test('lock delay: max(fallTime, 0.5) s on the ground; moves do not reset it; respawn takes next', () => {
  for (const [source, party, delay] of [['stage_switch_puzzle01', 2, 0.6], ['stage_switch_puzzle02', 2, 0.5], ['stage_switch_puzzle02', 8, 0.5]]) {
    const game = load(source, party);
    const block = blockOf(game, 0);
    assert.equal(game.puzzle.lockDelay(), Math.max(game.puzzle.fallTime(), 0.5));
    assert.ok(Math.abs(game.puzzle.lockDelay() - delay) < 1e-6);
    const next = block.next;
    dropToFloor(game, 0);
    const landedY = block.y;
    const landedCells = block.cells();
    let ticks = 2;   // the landing press tick ended the soft-drop loop 2 ticks ago
    while (block.y === landedY && ticks < 200) {
      // Wiggle sideways: moves never reset the lock timer.
      step(game, 1, slots({ 0: ticks % 4 === 0 ? { left: true } : ticks % 4 === 2 ? { right: true } : {} }));
      ticks++;
    }
    assert.equal(ticks, ticksToLock(game.puzzle.lockDelay()), `${source} p${party}: locked after the lock delay`);
    assert.equal(block.y, 5, 'respawned at the spawn cell in the lock tick');
    assert.equal(block.piece, next, 'current = next');
    assert.ok(landedCells.some(({ x, y }) => cell(game, x, y) >= LANDED), 'landed cells written');
  }
});

test('DOWN on the ground: ignored for 0.12 s after landing, then it locks at once', () => {
  const game = load('stage_switch_puzzle01', 2);
  const block = blockOf(game, 0);
  dropToFloor(game, 0);   // landed 2 ticks ago; that press was already inside the grace
  const y = block.y;
  assert.notEqual(y, 5);
  step(game, 1);
  step(game, 1, slots({ 0: { down: true } }));   // 4 ticks after landing: lock timer 0.55 >= 0.6 - 0.12
  assert.equal(block.y, y, 'inside the grace: no lock');
  step(game, 5);
  step(game, 1, slots({ 0: { down: true } }));   // 10 ticks: 0.45 < 0.48
  assert.equal(block.y, 5, 'after the grace: DOWN locks immediately and the next piece spawns');
});

// ---------------------------------------------------------------------------------------------------------------
// Line clear, counter, speed up

test('line clear: landed rows clear, cells above shift, terrain stays, bay columns right of a separator clear', () => {
  for (const party of PARTIES) {
    const game = load('stage_switch_puzzle01', party);
    const { puzzle } = game;
    const terrain = puzzle.grid.map((code, i) => (code >= 2 && code < FALLING ? [i, code] : null)).filter(Boolean);
    fillRow(game, 21);
    const right = puzzle.judge.x + puzzle.judge.w - 2;
    setCell(game, right, 20, LANDED + 3);
    // Bays (rows 4-7): the left bay (left of the first separator) shifts, the right bays clear instead.
    const leftBay = puzzle.judge.x + 1;
    const rightBay = puzzle.judge.x + puzzle.judge.w - 2;
    setCell(game, leftBay, 7, LANDED + 5);
    setCell(game, rightBay, 7, LANDED + 6);
    const occupied = new Set(puzzle.blocks.filter((b) => b.active).flatMap((b) => b.cells().map((c) => c.x + ',' + c.y)));
    assert.ok(!occupied.has(leftBay + ',7') && !occupied.has(rightBay + ',7'));
    step(game, 1);
    assert.equal(puzzle.linesCleared, 1, `p${party}`);
    assert.equal(puzzle.linesNeeded, 9);
    assert.equal(cell(game, right, 21), LANDED + 3, 'the row above shifted down');
    assert.equal(cell(game, right, 20), 1);
    assert.equal(cell(game, leftBay, 8), LANDED + 5, 'left bay column shifted');
    assert.equal(cell(game, rightBay, 8), 1, 'right of the first separator: cleared, not shifted');
    assert.equal(cell(game, rightBay, 7), 1);
    for (const [i, code] of terrain) assert.equal(puzzle.grid[i], code, `terrain ${i % W},${Math.floor(i / W)} kept`);
    // Falling pieces keep their place (the y + n - 1 test passes in open air) and are rewritten.
    for (const block of puzzle.blocks.filter((b) => b.active)) {
      assert.equal(block.y, 5);
      assert.ok(block.cells().every(({ x, y }) => cell(game, x, y) === FALLING + block.player));
    }
    assert.equal(puzzle.view.children.find((child) => child.text !== undefined && child.text !== 'OK').text, '9', 'counter');
  }
});

test('two full rows clear together; the counter never goes below 0', () => {
  const game = load('stage_switch_puzzle02', 4);
  fillRow(game, 21);
  fillRow(game, 20);
  step(game, 1);
  assert.equal(game.puzzle.linesCleared, 2);
  assert.equal(game.puzzle.lastClear, 2);
  assert.equal(game.puzzle.linesNeeded, 8);
});

test('speed up: fallTimeTable row switch by lines (8-1 at 3 / 6, 8-3 at 5), per party', () => {
  const clearTo = (game, lines) => { game.puzzle.linesCleared = lines - 1; fillRow(game, 21); step(game, 1); };
  const cases = [
    ['stage_switch_puzzle01', 2, [0.6, 0.6, 0.4, 0.4, 0.3]],
    ['stage_switch_puzzle01', 4, [0.62, 0.62, 0.42, 0.42, 0.42]],
    ['stage_switch_puzzle01', 8, [0.66, 0.66, 0.5, 0.5, 0.5]],
  ];
  for (const [source, party, [t0, t2, t3, t5, t6]] of cases) {
    const game = load(source, party);
    const near = (want) => Math.abs(game.puzzle.fallTime() - want) < 1e-6;
    assert.ok(near(t0), `${source} p${party} start`);
    clearTo(game, 2); assert.ok(near(t2), 'below 3');
    clearTo(game, 3); assert.ok(near(t3), 'at 3');
    clearTo(game, 5); assert.ok(near(t5), 'at 5');
    clearTo(game, 6); assert.ok(near(t6), 'at 6');
  }
  for (const [party, before, after] of [[2, 0.2, 0.1], [4, 0.2, 0.15], [8, 0.4, 0.3]]) {
    const game = load('stage_switch_puzzle02', party);
    assert.ok(Math.abs(game.puzzle.fallTime() - before) < 1e-6);
    clearTo(game, 4);
    assert.ok(Math.abs(game.puzzle.fallTime() - before) < 1e-6);
    clearTo(game, 5);
    assert.ok(Math.abs(game.puzzle.fallTime() - after) < 1e-6, `8-3 p${party} at 5`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Cats, win, fail

test('cats are frozen (visible, buttons ignored) until the win; the win shows the Key, OK, and frees them', () => {
  for (const source of PUZZLES) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const cat = game.players[0];
      const key = game.keys.find((k) => k.spawn.actorName === 'Key');
      assert.equal(key.active, false, 'the Key starts hidden');
      step(game, 20);
      const x = cat.rect.x;
      const all = idle().map(() => ({ ...IDLE, right: true }));
      step(game, 30, all);
      assert.equal(cat.rect.x, x, `${source} p${party}: frozen`);
      assert.equal(cat.view.visible, true);
      game.puzzle.linesCleared = 9;
      fillRow(game, 21);
      step(game, 1);
      assert.equal(game.puzzle.won, true);
      assert.equal(game.puzzle.linesNeeded, 0);
      assert.equal(key.active, true, 'Key.activate on the win');
      const ok = game.puzzle.view.children.find((child) => child.text === 'OK');
      assert.equal(ok.visible, true);
      // The puzzle stops ticking (pieces stay put) but stays drawn.
      const grid = game.puzzle.grid.join(',');
      step(game, 90, slots({ 0: { down: true } }));
      assert.equal(game.puzzle.grid.join(','), grid);
      assert.equal(game.puzzle.view.parent, game.actorLayer);
      const x2 = cat.rect.x;
      step(game, 20, all);
      assert.ok(cat.rect.x > x2 + 30, `${source} p${party}: the cat walks again`);
    }
  }
});

test('every active Block blocked -> the stage restarts (fresh puzzle, cats frozen again)', () => {
  for (const source of PUZZLES) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const first = game.puzzle;
      // Ground every active piece at its spawn cell: it locks there and its own landed cells block the respawn.
      for (const block of first.blocks.filter((b) => b.active)) {
        for (const { x, y } of block.cells()) {
          if (cell(game, x, y + 1) === 1) setCell(game, x, y + 1, LANDED);
        }
      }
      let frames = 0;
      while (game.puzzle === first && frames < 120) { step(game, 1); frames++; }
      assert.notEqual(game.puzzle, first, `${source} p${party}: restarted`);
      assert.ok(first.failed && first.blocks.filter((b) => b.active).every((b) => b.blocked));
      assert.equal(game.puzzle.linesCleared, 0);
      assert.ok(game.puzzle.blocks.filter((b) => b.active).every((b) => !b.blocked && b.y === 5));
      assert.ok(game.roulettePlayerActivityBudgets.every((budget) => budget.current === 0));
      assert.equal(game.players.length, Math.max(2, party));
    }
  }
});

test('a blocked Block retries every tick and respawns the same shape when its spawn frees up', () => {
  const game = load('stage_switch_puzzle01', 2);
  const a = blockOf(game, 0);
  for (const { x, y } of a.cells()) if (cell(game, x, y + 1) === 1) setCell(game, x, y + 1, LANDED);
  const queue = [a.piece, a.next];
  while (!a.blocked) step(game, 1);
  assert.deepEqual([a.piece, a.next], queue, 'no draw on a failed respawn');
  const lockedCells = a.cells();
  step(game, 5);
  assert.equal(a.blocked, true);
  for (const { x, y } of lockedCells) setCell(game, x, y, 1);
  step(game, 1);
  assert.equal(a.blocked, false);
  assert.deepEqual([a.piece, a.next], queue, 'the same (just-locked) shape again, queue unchanged');
  assert.ok(a.cells().every(({ x, y }) => cell(game, x, y) === FALLING));
});

// ---------------------------------------------------------------------------------------------------------------
// Drawing

test('drawing: the puzzle container sits at the Puzzle row point; counter "%d" 48 px at (636, 48)', () => {
  const game = load('stage_switch_puzzle01', 4);
  const { view } = game.puzzle;
  assert.equal(view.x, 0);
  assert.equal(view.y, 0);
  const counter = view.children.find((child) => child.text === '10');
  assert.ok(counter);
  assert.equal(counter.x, 636);
  assert.equal(counter.y, 48);
  assert.equal(counter.style.fontSize, 48);
  const ok = view.children.find((child) => child.text === 'OK');
  assert.equal(ok.visible, false);
  assert.equal(ok.x, 640);
  assert.equal(ok.y, 300);
});

test('8-3: the SPEED UP Text row renders and slides', () => {
  const game = load('stage_switch_puzzle02', 2);
  const text = game.recoveredTexts.find((t) => t.message === 'SPEED UP');
  assert.ok(text);
  assert.equal(text.view.parent, game.actorLayer);
  const x = text.view.x;
  step(game, 30);
  assert.ok(text.view.x > x + 100, 'slides right');
});

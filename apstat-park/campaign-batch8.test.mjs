// Fidelity audit 2026-10-08 batch 8 (scripts/pico-campaign-patches.mjs): multi-jump-relay, jumparea-top-left,
// majority-player, jumpswitch-launch, delayswitch-countdown, warp-sensor-top-left.
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
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const relayOf = (game) => [...game.multiRelay.values()][0];

/** A party driver: frame(buttonsBySlot) with the jump press edge derived per slot (as the desk relay sends it). */
function party(game, n) {
  const held = new Array(n).fill(false);
  return (buttons = {}) => {
    const inputs = Array.from({ length: n }, (_, slot) => {
      const spec = { ...IDLE, ...(buttons[slot] || {}) };
      const pressed = spec.jump && !held[slot];
      held[slot] = spec.jump;
      return { ...spec, jumpPressed: pressed };
    });
    game.update(1 / 60, inputs[0], inputs);
  };
}
function settle(game, n, frames = 20) {
  const frame = party(game, n);
  for (let i = 0; i < frames; i++) frame();
}

// ---------------------------------------------------------------------------------------------------------------
// multi-jump-relay

test('MultiPlayer spawns ONE shared cat with p1 jumps per airtime (5-2: 2, 5-4: 10), turn at its spawn slot (parties 2/4/8)', () => {
  for (const [source, jumps] of [['stage_multijump01', 2], ['stage_multijump02', 10]]) {
    for (const n of PARTIES) {
      const game = load(source, n);
      assert.equal(game.players.length, 1, `${source} p${n}: one cat for the party`);
      const [cat] = game.players;
      const relay = relayOf(game);
      assert.equal(cat.maxJumps, jumps);
      assert.equal(cat.airJumps, true);
      assert.equal(relay.turnSlot, game.playerInputSlots[0]);
      assert.equal(relay.holderSlot, -1);
      assert.equal(relay.partyN, n);
      settle(game, n);
      assert.equal(relay.hud.text, String(jumps), 'the HUD shows the remaining jumps');
      assert.equal(relay.hud.y, cat.rect.y + cat.rect.height - 96, 'drawn 96 above the cat');
    }
  }
});

test('only the turn player starts a jump; every jump passes the turn round robin over the whole party and recolours the cat', () => {
  for (const n of PARTIES) {
    const game = load('stage_multijump02', n);   // 10 jumps per airtime
    const [cat] = game.players;
    const relay = relayOf(game);
    settle(game, n);
    const frame = party(game, n);
    // A press from a player whose turn it is not does nothing.
    for (let i = 0; i < 5; i++) frame({ 1: { jump: true } });
    for (let i = 0; i < 5; i++) frame();
    assert.equal(cat.grounded, true, `p${n}: slot 1 cannot start the jump`);
    assert.equal(relay.turnSlot, 0);
    const colours = [cat.bodyColor];
    for (let k = 0; k < n; k++) {
      const turn = relay.turnSlot;
      assert.equal(turn, k % n);
      frame({ [turn]: { jump: true } });
      assert.equal(cat.jumpsUsed, k + 1, `p${n}: jump ${k + 1} counted`);
      assert.equal(relay.turnSlot, (k + 1) % n, `p${n}: the turn passes`);
      assert.equal(relay.holderSlot, turn, 'the presser holds the jump');
      colours.push(cat.bodyColor);
      frame({});   // release
      if (k < n - 1) assert.notEqual(cat.grounded, true);
    }
    assert.equal(colours.at(-1), colours[0], `p${n}: after n jumps the turn (and colour) is back at slot 0`);
    assert.equal(new Set(colours.slice(0, n)).size, n, `p${n}: every turn has its own colour`);
  }
});

test('jumps per airtime: 5-2 allows 2 (the ground jump counts), the third press does nothing; landing resets the count', () => {
  for (const n of PARTIES) {
    const game = load('stage_multijump01', n);
    const [cat] = game.players;
    const relay = relayOf(game);
    settle(game, n);
    const frame = party(game, n);
    frame({ 0: { jump: true } });
    frame({});
    for (let i = 0; i < 4; i++) frame();
    frame({ 1: { jump: true } });
    assert.equal(cat.jumpsUsed, 2);
    assert.equal(relay.hud.text, '0');
    frame({});
    const turn = relay.turnSlot;
    const vyBefore = cat.velocity.y;
    frame({ [turn]: { jump: true } });
    assert.equal(cat.jumpsUsed, 2, `p${n}: no third jump`);
    assert.equal(relay.turnSlot, turn, 'no jump, no turn pass');
    assert.ok(cat.velocity.y > vyBefore, 'gravity only');
    for (let i = 0; i < 120 && !cat.grounded; i++) frame();
    frame();
    assert.equal(cat.grounded, true);
    assert.equal(cat.jumpsUsed, 0, 'ground contact resets the counter');
    assert.equal(relay.hud.text, '2');
    assert.equal(relay.turnSlot, turn, 'landing does not reset the turn');
  }
});

test('the holder drives the hold boost: a full hold rises higher than a tap; a later turn press takes the hold', () => {
  const rise = (holdFrames) => {
    const game = load('stage_multijump01', 2);
    const [cat] = game.players;
    settle(game, 2);
    const frame = party(game, 2);
    const start = cat.rect.y;
    let top = start;
    for (let i = 0; i < 60; i++) {
      frame({ 0: { jump: i < holdFrames } });
      top = Math.min(top, cat.rect.y);
    }
    return start - top;
  };
  const full = rise(14);
  const tap = rise(1);
  assert.ok(full > 75 && full < 82, 'full hold rises ~78.6: ' + full);
  assert.ok(tap < full - 20, 'a tap is a short hop: ' + tap);

  const game = load('stage_multijump01', 3);
  const relay = relayOf(game);
  settle(game, 3);
  const frame = party(game, 3);
  frame({ 0: { jump: true } });
  for (let i = 0; i < 4; i++) frame({ 0: { jump: true } });
  assert.equal(relay.holderSlot, 0);
  frame({ 0: { jump: true }, 1: { jump: true } });
  assert.equal(relay.holderSlot, 1, 'the turn press takes the hold although slot 0 still holds');
  frame({ 0: { jump: true } });
  assert.equal(relay.holderSlot, -1, 'the holder released: nobody holds');
});

test('steering is the holder OR the turn player; anyone else moves nothing (party 3)', () => {
  const game = load('stage_multijump01', 3);
  const [cat] = game.players;
  const relay = relayOf(game);
  settle(game, 3);
  const frame = party(game, 3);
  let x = cat.rect.x;
  for (let i = 0; i < 10; i++) frame({ 2: { right: true } });
  assert.equal(cat.rect.x, x, 'slot 2 (neither turn nor holder) cannot walk the cat');
  for (let i = 0; i < 10; i++) frame({ 1: { right: true } });
  assert.equal(cat.rect.x, x, 'slot 1 cannot either');
  for (let i = 0; i < 10; i++) frame({ 0: { right: true } });
  assert.ok(cat.rect.x > x + 40, 'the turn player walks it');
  frame({ 0: { jump: true } });   // turn -> 1, holder 0
  assert.equal(relay.turnSlot, 1);
  x = cat.rect.x;
  frame({ 0: { jump: true, right: true } });
  assert.ok(cat.rect.x > x, 'the holder steers');
  x = cat.rect.x;
  frame({ 1: { left: true } });
  assert.ok(cat.rect.x < x, 'the new turn player steers');
  x = cat.rect.x;
  frame({ 2: { left: true } });
  assert.equal(cat.rect.x, x, 'slot 2 still steers nothing');
});

test('holder and turn player pressing opposite directions: the merged mask moves RIGHT (FUN_7ff72bb6f0e0 tests right first)', () => {
  for (const [holderDir, turnDir] of [['left', 'right'], ['right', 'left']]) {
    const game = load('stage_multijump01', 2);
    const [cat] = game.players;
    const relay = relayOf(game);
    settle(game, 2);
    const frame = party(game, 2);
    frame({ 0: { jump: true } });   // slot 0 jumps: holder 0, turn -> 1
    assert.equal(relay.turnSlot, 1);
    for (let i = 0; i < 4; i++) {
      const x = cat.rect.x;
      frame({ 0: { jump: true, [holderDir]: true }, 1: { [turnDir]: true } });
      assert.equal(relay.holderSlot, 0, 'slot 0 still holds the jump');
      assert.ok(cat.rect.x > x, `holder ${holderDir} + turn ${turnDir}: moves right (${cat.rect.x - x})`);
    }
  }
});

test('a head against a ceiling uses a jump but does not pass the turn (5-4 hanging block, bottom y 240)', () => {
  const game = load('stage_multijump02', 2);
  const [cat] = game.players;
  const relay = relayOf(game);
  settle(game, 2, 2);
  const frame = party(game, 2);
  place(cat, 1545, 240);
  cat.applyResolvedCollision(cat.rect, { x: 0, y: 0 }, false);
  frame({ 0: { jump: true } });
  assert.equal(cat.jumpsUsed, 1);
  assert.equal(relay.turnSlot, 0, 'the turn stays');
});

test('the "MultiPlayer1" switches double the jumps on their press edge: 2 -> 4 -> 8 (5-2)', () => {
  for (const n of PARTIES) {
    const game = load('stage_multijump01', n);
    const [cat] = game.players;
    settle(game, n, 2);
    const pads = game.switches.filter((pad) => pad.spawn.label === 'MultiPlayer1');
    assert.equal(pads.length, 2);
    for (const [k, pad] of pads.entries()) {
      place(cat, pad.rect.x, 431 - cat.rect.height);
      settle(game, n, 30);
      assert.equal(cat.maxJumps, 2 * 2 ** (k + 1), `p${n}: after switch ${k + 1}`);
      settle(game, n, 30);
      assert.equal(cat.maxJumps, 2 * 2 ** (k + 1), `p${n}: standing on it doubles once`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// jumparea-top-left

test('5-2 JumpAreas hang from their row point (top-left) and cover every pit column', () => {
  const game = load('stage_multijump01', 2);
  for (const area of game.jumpAreas) {
    const [w, h] = area.spawn.raw.slice(6, 8);
    assert.deepEqual({ ...area.rect }, { x: area.spawn.x, y: area.spawn.y, width: w, height: h });
  }
  const map = game.tileMap;
  for (let x = 24; x < map.pixelWidth - 48; x += 48) {
    if (map.rectHitsSolid({ x: x - 4, y: 434, width: 8, height: 40 })) continue;
    assert.ok(game.jumpAreas.some((area) => x >= area.rect.x && x <= area.rect.x + area.rect.width), 'pit column at x ' + x);
  }
});

test('a JumpArea launch sets vy = p3 on the next update, forces vx = p2 until landing, and a press then keeps the launch speed', () => {
  const game = load('stage_multijump01', 2);
  const [cat] = game.players;
  const relay = relayOf(game);
  settle(game, 2, 2);
  const area = game.jumpAreas[0];   // (-4, -18) per tick
  const frame = party(game, 2);
  cat.applyResolvedCollision({ ...cat.rect, x: 900, y: area.rect.y - cat.rect.height - 4 }, { x: 0, y: 300 }, false);
  let entered = -1;
  for (let i = 0; i < 10 && entered < 0; i++) {
    frame({ 0: { right: true } });
    if (cat.pendingLaunchY !== null) entered = i;
  }
  assert.ok(entered >= 0, 'entered the area');
  assert.equal(cat.pendingLaunchY, -18 * 60);
  frame({ 0: { right: true } });
  assert.equal(cat.velocity.y, -18 * 60, 'vy = p3');
  assert.equal(cat.velocity.x, -4 * 60, 'vx = p2 although steering right');
  const turn = relay.turnSlot;
  frame({ [turn]: { jump: true, right: true } });
  assert.equal(cat.jumpsUsed, 1, 'the press is a jump');
  assert.ok(cat.velocity.y < -17 * 60, 'rising faster than a jump: vy kept, no boost');
  assert.equal(relay.turnSlot, (turn + 1) % 2, 'and passes the turn');
  for (let i = 0; i < 20; i++) {
    frame({ 0: { right: true }, 1: { right: true } });
    assert.equal(cat.velocity.x, -4 * 60, 'vx forced while airborne');
  }
  for (let i = 0; i < 200 && !cat.grounded; i++) frame({ 0: { right: true }, 1: { right: true } });
  assert.equal(cat.grounded, true, 'thrown back onto the floor west of the pit');
  assert.ok(cat.rect.x + cat.rect.width < 816, 'landed west of the pit: ' + cat.rect.x);
  const x = cat.rect.x;
  frame({ [relay.turnSlot]: { right: true } });
  assert.ok(cat.rect.x > x, 'steering is back after landing');
});

test('a JumpArea entered during the hold ramp is ignored (FUN_7ff72bb6fd20)', () => {
  const game = load('stage_multijump01', 2);
  const [cat] = game.players;
  settle(game, 2, 2);
  const area = game.jumpAreas[0];
  const frame = party(game, 2);
  // Jump (hold ramp running) while placed just above the area, falling into it is impossible while rising, so
  // place the rising cat straight into the area instead.
  frame({ 0: { jump: true } });
  assert.ok(cat.jumpPhase > 0);
  cat.applyResolvedCollision({ ...cat.rect, x: 900, y: area.rect.y + 1 }, { ...cat.velocity }, false);
  frame({ 0: { jump: true } });
  assert.equal(cat.pendingLaunchY, null, 'no launch during the ramp');
  assert.equal(cat.lockedVx, null);
});

// ---------------------------------------------------------------------------------------------------------------
// The solvers clear 5-2 / 5-4 and are deterministic.

test('5-2 and 5-4 solvers clear at party 2, deterministically (5-2 also at party 3)', async () => {
  const driver = await import('./campaign-solve/driver.mjs');
  for (const [tag, parties] of [['5-2', [2, 3]], ['5-4', [2]]]) {
    const stage = driver.STAGES.find((entry) => entry.tag === tag);
    const solver = await driver.loadSolver(stage);
    for (const n of parties) {
      const a = await driver.runSolver(stage, { ...solver, party: n });
      const b = await driver.runSolver(stage, { ...solver, party: n });
      assert.equal(a.status, 'SOLVED', `${tag} p${n}: ${a.reason}`);
      assert.equal(a.frames, b.frames, `${tag} p${n}: same frames`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// majority-player: FUN_7ff72bb774a0 mode 4, FUN_7ff72bb68220 (n, ratio), tally FUN_7ff72bb7ffa0.

// Start / keep thresholds (holders of n): ceil(0.7 n) to start, half the ratio to keep.
const MAJORITY = { 2: [2, 1], 3: [3, 2], 4: [3, 2], 8: [6, 3] };
const holders = (count, spec) => Object.fromEntries(Array.from({ length: count }, (_, slot) => [slot, spec]));

test('MajorityPlayer: one neutral 0xbfffdf cat; n = party size, ratio = ceil(0.7 n) / n (parties 2/3/4/8)', () => {
  for (const n of [2, 3, 4, 8]) {
    const game = load('stage_majo01', n);
    assert.equal(game.players.length, 1, `p${n}: one cat`);
    assert.equal(game.players[0].bodyColor, 0xbfffdf);
    assert.equal(game.majorityVote.n, n);
    assert.equal(game.majorityVote.ratio, Math.fround(MAJORITY[n][0] / n));
    assert.ok(game.majorityHud, 'the MajorityController pad exists');
  }
});

test('majority vote: start needs ceil(0.7 n) holders, keep needs half the ratio (parties 2/3/4/8)', () => {
  for (const n of [2, 3, 4, 8]) {
    const [start, keep] = MAJORITY[n];
    const game = load('stage_majo01', n);
    const frame = party(game, n);
    const cat = game.players[0];
    settle(game, n, 30);
    const x0 = cat.rect.x;
    for (let i = 0; i < 20; i++) frame(holders(start - 1, { right: true }));
    assert.equal(cat.rect.x, x0, `p${n}: ${start - 1} of ${n} never start the walk`);
    for (let i = 0; i < 10; i++) frame(holders(start, { right: true }));
    const x1 = cat.rect.x;
    assert.ok(x1 > x0 + 20, `p${n}: ${start} of ${n} walk`);
    for (let i = 0; i < 10; i++) frame(holders(keep, { right: true }));
    const x2 = cat.rect.x;
    assert.ok(x2 > x1 + 20, `p${n}: ${keep} of ${n} keep it walking (hysteresis)`);
    for (let i = 0; i < 10; i++) frame(holders(keep - 1, { right: true }));
    assert.ok(cat.rect.x - x2 < 6, `p${n}: ${keep - 1} of ${n} stop it`);
    assert.ok(game.majorityVote.progress.every((value) => value >= 0 && value <= 1));
  }
});

test('majority vote at party 2: 1-vs-1 from rest stays still; both players on both directions = right wins', () => {
  const game = load('stage_majo01', 2);
  const frame = party(game, 2);
  const cat = game.players[0];
  settle(game, 2, 30);
  const x0 = cat.rect.x;
  for (let i = 0; i < 30; i++) frame({ 0: { right: true }, 1: { left: true } });
  assert.equal(cat.rect.x, x0, 'one right vs one left: no vote');
  for (let i = 0; i < 10; i++) frame({ 0: { left: true, right: true }, 1: { left: true, right: true } });
  assert.ok(cat.rect.x > x0 + 20, 'right is checked before left');
});

test('majority jump: one player alone never jumps; a staggered second press starts it, the hold keeps boosting', () => {
  const game = load('stage_majo01', 2);
  const frame = party(game, 2);
  const cat = game.players[0];
  settle(game, 2, 30);
  const feet0 = cat.rect.y + cat.rect.height;
  for (let i = 0; i < 20; i++) frame({ 0: { jump: true } });
  assert.equal(cat.rect.y + cat.rect.height, feet0, 'a lone jump press is no vote');
  frame({ 0: { jump: true }, 1: { jump: true } });
  frame({ 0: { jump: true }, 1: { jump: true } });
  assert.ok(cat.rect.y + cat.rect.height < feet0, 'the second (staggered) press makes the voted press edge');
  // Player 1 lets go: 1 of 2 keeps the jump held (hysteresis), so the hold boost runs to a full jump.
  let top = cat.rect.y;
  for (let i = 0; i < 40; i++) { frame({ 0: { jump: true } }); top = Math.min(top, cat.rect.y); }
  assert.ok(feet0 - (top + cat.rect.height) > 70, 'full held jump: ' + (feet0 - (top + cat.rect.height)));
});

test('MajorityController pad: progress of [up, down, left, right, jump], screen fixed at the row point', () => {
  const game = load('stage_majo01', 4);
  const frame = party(game, 4);
  settle(game, 4, 5);
  frame(holders(2, { right: true }));
  const progress = game.majorityVote.progress;
  assert.ok(Math.abs(progress[3] - (0.5 / 0.75)) < 1e-6, 'right: 2 of 4 below the 3-of-4 start = 0.667, got ' + progress[3]);
  assert.deepEqual([progress[0], progress[1], progress[2], progress[4]], [0, 0, 0, 0]);
  const hud = game.majorityHud;
  assert.equal(hud.view.y, hud.spawn.y);
  assert.ok(Math.abs(hud.view.x - hud.spawn.x - game.scrollCameraState.scroll) < 1e-9);
});

test('5-1 and 5-3 solvers clear at party 2 and party 3 (the last player only helps to start), deterministically', async () => {
  const driver = await import('./campaign-solve/driver.mjs');
  for (const tag of ['5-1', '5-3']) {
    const stage = driver.STAGES.find((entry) => entry.tag === tag);
    const solver = await driver.loadSolver(stage);
    assert.equal(solver.party, 2);
    for (const n of [2, 3]) {
      const a = await driver.runSolver(stage, { ...solver, party: n });
      const b = await driver.runSolver(stage, { ...solver, party: n });
      assert.equal(a.status, 'SOLVED', `${tag} p${n}: ${a.reason}`);
      assert.equal(a.frames, b.frames, `${tag} p${n}: same frames`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// jumpswitch-launch: FUN_7ff72bb778f0 / FUN_7ff72bb5eef0 / FUN_7ff72bb5f410, PushBox cmd 0 FUN_7ff72bb33d00.

test('12-1 JumpSwitch: a cat on the pad launches PushBox 1 (9 per tick, ~67 high) and again after release + re-press', () => {
  for (const n of [2, 4, 8]) {
    const game = load('stage_thunder02', n);
    const frame = party(game, n);
    settle(game, n, 10);
    const box = game.pushBoxes.find((entry) => entry.spawn.label === '1');
    const rest = box.rect.y;
    const cat = game.players[game.players.length - 1];
    const off = { x: cat.rect.x, y: cat.rect.y };
    const press = () => place(cat, 150 - 16, 384 - cat.rect.height - 0.3);
    press();
    frame();
    assert.ok(Math.abs(rest - box.rect.y - 9) < 1e-6, `p${n}: the first tick moves the full 9, got ${rest - box.rect.y}`);
    frame();
    assert.ok(Math.abs(rest - box.rect.y - 9 - 8.35) < 1e-6, `p${n}: then 8.35, got ${rest - box.rect.y}`);
    let top = box.rect.y;
    for (let i = 0; i < 40; i++) { frame(); top = Math.min(top, box.rect.y); }
    assert.ok(Math.abs(rest - top - 66.9) < 1, `p${n}: apex ~67, got ${rest - top}`);
    assert.ok(Math.abs(box.rect.y - rest) < 1e-6, `p${n}: back at rest`);
    for (let i = 0; i < 20; i++) frame();
    assert.ok(Math.abs(box.rect.y - rest) < 1e-6, `p${n}: standing on the pad does not re-fire`);
    place(cat, off.x, off.y);
    frame();
    press();
    frame();
    assert.ok(Math.abs(rest - box.rect.y - 9) < 1e-6, `p${n}: a new press fires again`);
  }
});

test('12-1 JumpSwitch run is deterministic (same box path twice)', () => {
  const path = () => {
    const game = load('stage_thunder02', 2);
    const frame = party(game, 2);
    settle(game, 2, 10);
    const box = game.pushBoxes[0];
    const cat = game.players[1];
    place(cat, 150 - 16, 384 - cat.rect.height - 0.3);
    const ys = [];
    for (let i = 0; i < 40; i++) { frame(); ys.push(box.rect.y); }
    return ys;
  };
  assert.deepEqual(path(), path());
});

// ---------------------------------------------------------------------------------------------------------------
// delayswitch-countdown: FUN_7ff72bb5f6d0 / FUN_7ff72bb5f9c0 / FUN_7ff72bb5fa80.

test('11-4 DelaySwitch: a press counts down 10 s ((int)(t + 0.99) at y - 75), fires Lift 1 at zero, then re-presses while occupied', () => {
  for (const n of [2, 4, 8]) {
    const game = load('stage_magnet02', n);
    const frame = party(game, n);
    settle(game, n, 5);
    const [delaySwitch] = game.delaySwitches;
    const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'Lift');
    const liftX = lift.rect.x;
    const cat = game.players[0];
    place(cat, 552 - 16, 290 - cat.rect.height);
    frame();
    assert.equal(delaySwitch.pressed, true, `p${n}: pressed`);
    const label = game.delaySwitchLabels.get(delaySwitch);
    assert.equal(label.text, '10');
    assert.equal(label.visible, true);
    assert.equal(label.y, delaySwitch.spawn.y - 75);
    for (let i = 0; i < 60; i++) frame();
    assert.equal(label.text, '9');
    for (let i = 0; i < 530; i++) frame();
    assert.equal(lift.rect.x, liftX, `p${n}: nothing before 10 s`);
    let fired = -1;
    for (let i = 0; i < 20 && fired < 0; i++) { frame(); if (lift.rect.x !== liftX) fired = i; }
    assert.ok(fired >= 0, `p${n}: Lift 1 starts once the countdown reaches zero`);
    for (let i = 0; i < 3; i++) frame();
    assert.equal(delaySwitch.pressed, true, `p${n}: still occupied -> pressed again`);
    assert.ok(game.delaySwitchCountdowns.get(delaySwitch) > 9.9, `p${n}: the countdown restarted`);
  }
});

test('11-4 DelaySwitch pops up when empty after firing and is no latched opener', () => {
  const game = load('stage_magnet02', 2);
  const frame = party(game, 2);
  settle(game, 2, 5);
  const [delaySwitch] = game.delaySwitches;
  const cat = game.players[0];
  place(cat, 552 - 16, 290 - cat.rect.height);
  frame();
  place(cat, 300, 100);
  for (let i = 0; i < 610; i++) frame();
  assert.equal(delaySwitch.pressed, false, 'released after firing');
  assert.equal(game.delaySwitchLabels.get(delaySwitch).visible, false);
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'Lift');
  assert.equal(game.latchedSourceHoldsGate(lift.spawn), false);
});

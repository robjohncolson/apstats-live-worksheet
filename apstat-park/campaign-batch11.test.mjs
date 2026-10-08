// Batch 11 (scripts/pico-campaign-patches.mjs): the native breakout family -- breakout-paddle-dome, breakout-ball-per-row,
// breakout-loss-and-fail, breakout-key-hidden-until-clear, breakout-syncarea-inert (8-2, 8-4, 9-3).
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
const BRICKS = new Set(['MC_BR1', 'MC_BR2', 'MC_BR3', 'MC_BR4', 'MC_BR5']);
const BREAKOUT = ['stage_breakout01', 'stage_breakout02', 'stage_breakout03'];

function chips(game, filter = (chip) => BRICKS.has(chip)) {
  const out = [];
  const { width, height } = game.tileMap.map;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const chip = game.tileMap.chipAt(x, y);
    if (filter(chip)) out.push({ x, y, chip });
  }
  return out;
}
/** Put a ball centre at (cx, cy) heading (vx, vy) per tick. */
function setBall(ball, cx, cy, vx = 0, vy = 0) {
  ball.rect.x = cx - 12; ball.rect.y = cy - 12;
  ball.center.x = cx; ball.center.y = cy;
  ball.view.x = cx; ball.view.y = cy;
  ball.velocity.x = vx; ball.velocity.y = vy;
}
const speed = (ball) => Math.hypot(ball.velocity.x, ball.velocity.y);
const ownerCounts = (game) => game.players.map((cat) => game.breakoutBallCounts.get(cat));
/** Drop points (x, y) at least 37 (dome r 25 + ball r 12) sideways from every cat's paddle centre (its row x). */
const freeFloorXs = (party) => ({
  2: [[470, 600], [530, 600], [640, 600], [740, 600]],
  4: [[460, 600], [544, 600], [640, 600], [736, 600]],
  8: [[354, 600], [450, 600], [544, 600], [640, 600], [736, 600], [830, 600], [926, 600], [544, 560]],
})[party];
function loseAll(game, points) {
  game.breakoutBalls.forEach((ball, i) => setBall(ball, points[i][0], points[i][1], 0, 4));
}

// ---------------------------------------------------------------------------------------------------------------
// breakout-ball-per-row

const BALL_TABLE = {
  stage_breakout01: { 2: [1, 3], 4: [1, 1, 1, 1], 8: [1, 1, 1, 1, 1, 1, 1, 1] },
  stage_breakout02: { 2: [1, 3], 4: [1, 1, 1, 1], 8: [1, 1, 1, 1, 1, 1, 1, 1] },
  stage_breakout03: { 2: [1, 7], 4: [1, 1, 1, 5], 8: [1, 1, 1, 1, 1, 1, 1, 1] },
};

test('every active BreakoutPlayer row makes its ball; a party-limited row\'s ball belongs to the last spawned cat', () => {
  for (const source of BREAKOUT) {
    const rows = runtime.stages.find((entry) => entry.source === source).data.createTable
      .filter((row) => row.actorName === 'BreakoutPlayer');
    for (const party of PARTIES) {
      const game = load(source, party);
      const expected = BALL_TABLE[source][party];
      const label = `${source} p${party}`;
      assert.equal(game.players.length, party, `${label}: cats`);
      assert.equal(game.breakoutBalls.length, expected.reduce((a, b) => a + b, 0), `${label}: balls`);
      assert.deepEqual(ownerCounts(game), expected, `${label}: ball counts`);
      const owned = game.players.map((cat) => game.breakoutBalls.filter((ball) => ball.owner === cat).length);
      assert.deepEqual(owned, expected, `${label}: ball owners`);
      for (const ball of game.breakoutBalls) {
        assert.ok(rows.some((row) => close(ball.center.x, row.x) && close(ball.center.y, row.y - 120)), `${label}: ball at a row + (0, -120)`);
      }
    }
  }
  const game = load('stage_breakout01', 2);
  assert.deepEqual(game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]), [[590, 552], [690, 552], [498, 552], [782, 552]]);
  const nine = load('stage_breakout03', 2);
  assert.deepEqual(nine.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]), [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [96 + 72 * k, 264]));
});

test('a fresh ball hangs at rest at row + (0, -120) until touched (no gravity)', () => {
  for (const source of BREAKOUT) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const start = game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]);
      step(game, 120);
      assert.deepEqual(game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]), start, `${source} p${party}: balls moved`);
      assert.ok(game.breakoutBalls.every((ball) => speed(ball) === 0), `${source} p${party}: a resting ball has no heading`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// breakout-paddle-dome

/** Cat 0 of 8-2 stands with its row point (paddle centre x) at rowX under its ball (x 590) and jumps. */
function jumpIntoBall(rowX) {
  const game = load('stage_breakout01', 2);
  const cat = game.players[0];
  const ball = game.breakoutBalls[0];
  place(cat, rowX - 16, 672 - 47);
  step(game, 5);
  const jump = holdFor(game, 0, { jump: true, jumpPressed: true });
  const hold = holdFor(game, 0, { jump: true });
  for (let frame = 0; frame < 60; frame++) {
    step(game, 1, frame === 0 ? jump : hold);
    if (speed(ball) > 0) {
      const paddle = { x: cat.rect.x + 16, y: cat.rect.y + 47 - 34 };
      const dx = paddle.x - ball.center.x;
      const dy = paddle.y - ball.center.y;
      const d = Math.hypot(dx, dy);
      return { game, cat, ball, frame, n: { x: dx / d, y: dy / d }, distance: d };
    }
  }
  return assert.fail(`no launch for row x ${rowX}`);
}

test('a cat jumping into a resting ball launches it along the dome normal at 4 per tick (the hit offset sets the angle)', () => {
  for (const offset of [-14, -6, 0, 6, 14]) {
    // offset = ball centre - paddle centre (x): the cat stands at 590 - offset.
    const { ball, n, distance } = jumpIntoBall(590 - offset);
    assert.ok(distance < 25 + 12 + 1e-6, `offset ${offset}: contact through the dome (centre distance ${distance})`);
    assert.ok(close(speed(ball), 4, 1e-4), `offset ${offset}: speed ${speed(ball)}`);
    assert.ok(ball.velocity.y < 0, `offset ${offset}: goes up`);
    assert.ok(close(ball.velocity.x / 4, -n.x, 1e-3) && close(ball.velocity.y / 4, -n.y, 1e-3),
      `offset ${offset}: heading ${ball.velocity.x},${ball.velocity.y} vs -n ${-n.x},${-n.y}`);
    if (offset > 0) assert.ok(ball.velocity.x > 0.2, `offset ${offset}: hit right of centre goes right`);
    if (offset < 0) assert.ok(ball.velocity.x < -0.2, `offset ${offset}: hit left of centre goes left`);
    if (offset === 0) assert.ok(close(ball.velocity.x, 0, 1e-4), 'dead centre goes straight up');
  }
});

test('the dome reaches above the head: the ball is launched before it touches the cat box', () => {
  const { cat, ball } = jumpIntoBall(600);
  assert.ok(ball.rect.y + ball.rect.height <= cat.rect.y + 1e-6, `ball bottom ${ball.rect.y + 24} above the head ${cat.rect.y}`);
});

test('a falling ball bounces off a standing cat\'s dome radially (paddle left of the ball -> ball goes right)', () => {
  const game = load('stage_breakout01', 2);
  const cat = game.players[0];
  const ball = game.breakoutBalls[0];
  place(cat, 590 - 16, 672 - 47);
  step(game, 5);
  setBall(ball, 590 + 10, 520, 0, 4);
  for (let frame = 0; frame < 40 && ball.velocity.y > 0; frame++) step(game, 1);
  assert.ok(ball.velocity.y < 0 && ball.velocity.x > 0, `bounced up and right: ${ball.velocity.x},${ball.velocity.y}`);
  assert.ok(close(speed(ball), 4, 1e-4));
});

test('balls bounce off each other (equal masses exchange their normal components)', () => {
  const game = load('stage_breakout01', 2);
  const [a, b] = game.breakoutBalls;
  setBall(a, 560, 400, 4, 0);
  setBall(b, 640, 400, 0, 0);
  for (let frame = 0; frame < 40 && speed(b) === 0; frame++) step(game, 1);
  assert.ok(b.velocity.x > 0 && close(b.velocity.y, 0, 1e-3), `struck ball leaves along +x: ${b.velocity.x},${b.velocity.y}`);
  step(game, 1);
  assert.ok(close(speed(b), 4, 1e-4), 'renormalised to 4');
  assert.ok(a.velocity.x < 0, 'the striker, left with no heading, leaves along -n');
  // Glancing: the tangential part is kept, the normal parts are exchanged.
  const g2 = load('stage_breakout01', 2);
  const [c, d] = g2.breakoutBalls;
  setBall(c, 560, 400, 4, 0);
  setBall(d, 640, 410, -4, 0);
  for (let frame = 0; frame < 40 && c.velocity.x > 0; frame++) step(g2, 1);
  assert.ok(c.velocity.y < 0 && d.velocity.y > 0, `glancing hit deflects apart: ${c.velocity.y}, ${d.velocity.y}`);
});

// ---------------------------------------------------------------------------------------------------------------
// Map contacts (already native in the port; pinned here alongside the paddle)

test('map contact reflects the heading (a side wall flips x and keeps y)', () => {
  const game = load('stage_breakout01', 2);
  const ball = game.breakoutBalls[0];
  setBall(ball, 480, 400, -3, 2);
  for (let frame = 0; frame < 30 && ball.velocity.x <= 0; frame++) step(game, 1);
  assert.ok(ball.velocity.x > 0, 'bounced off the left wall');
  assert.ok(ball.velocity.y > 0, 'y kept');
  assert.ok(close(speed(ball), 4, 1e-4));
  assert.ok(ball.rect.x >= 448 - 1e-3, 'never inside the wall');
});

test('one hit destroys a brick (BR4 too: no hit counts) and the ball reflects', () => {
  const game = load('stage_breakout01', 2);
  const ball = game.breakoutBalls[0];
  const col = 16;
  assert.equal(game.tileMap.chipAt(col, 6), 'MC_BR4');
  const before = chips(game).length;
  setBall(ball, col * 32 + 16, 300, 0, -4);
  for (let frame = 0; frame < 40 && ball.velocity.y < 0; frame++) step(game, 1);
  assert.equal(game.tileMap.chipAt(col, 6), 'MC_NON');
  assert.equal(chips(game).length, before - 1);
  assert.ok(ball.velocity.y > 0, 'reflected down');
});

test('BR5: one hit doubles every ball to 8 per tick and turns every other BR5 into BR2', () => {
  const game = load('stage_breakout02', 2);
  const ball = game.breakoutBalls[0];
  assert.equal(game.tileMap.chipAt(17, 5), 'MC_BR5');
  assert.equal(game.tileMap.chipAt(22, 5), 'MC_BR5');
  game.tileMap.setChip(17, 6, 'MC_NON');
  game.tileMap.setChip(17, 7, 'MC_NON');
  setBall(ball, 17 * 32 + 16, 300, 0, -4);
  for (let frame = 0; frame < 60 && ball.velocity.y < 0; frame++) step(game, 1);
  assert.equal(game.tileMap.chipAt(17, 5), 'MC_NON', 'the hit BR5 is gone');
  assert.equal(game.tileMap.chipAt(22, 5), 'MC_BR2', 'the other BR5 is now BR2');
  assert.ok(game.breakoutBalls.every((other) => other.speedMultiplier === 2), 'every ball at scale 2');
  step(game, 1);
  assert.ok(close(speed(ball), 8, 1e-4), `the moving ball at 8: ${speed(ball)}`);
});

// ---------------------------------------------------------------------------------------------------------------
// breakout-loss-and-fail

test('a ball landing on a lethal top face is lost after 180 ticks and takes one ball from its owner', () => {
  for (const party of PARTIES) {
    const game = load('stage_breakout01', party);
    const owner = game.players[party === 2 ? 1 : 0];
    const ball = game.breakoutBalls.find((b) => b.owner === owner);
    const startCount = game.breakoutBallCounts.get(owner);
    setBall(ball, freeFloorXs(party)[0][0], 600, 0, 4);
    let frame = 0;
    while (ball.lossCountdownTicks === 0 && frame++ < 60) step(game, 1);
    assert.equal(ball.lossCountdownTicks, 180, `p${party}: countdown starts at 180`);
    assert.equal(speed(ball), 0, 'the lost ball stops');
    step(game, 179);
    assert.ok(game.breakoutBalls.includes(ball), `p${party}: still there after 179 more ticks`);
    assert.equal(game.breakoutBallCounts.get(owner), startCount);
    step(game, 1);
    assert.ok(!game.breakoutBalls.includes(ball), `p${party}: removed at 180`);
    assert.equal(game.breakoutBallCounts.get(owner), startCount - 1);
    assert.equal(game.breakoutLostPlayers.has(owner), startCount === 1, `p${party}: out only at 0`);
    assert.ok(owner.deathTimer <= 0 && !game.deathFallPlayers.has(owner), 'the cat does not die');
  }
});

test('exempt tops: a ball landing on BLK bounces instead of being lost', () => {
  const game = load('stage_breakout02', 2);
  const ball = game.breakoutBalls[0];
  setBall(ball, 17 * 32 + 16, 280, 0, 4);   // BLK at (17, 10): top y 320
  for (let frame = 0; frame < 30 && ball.velocity.y > 0; frame++) step(game, 1);
  assert.ok(ball.velocity.y < 0 && ball.lossCountdownTicks === 0, 'bounced off BLK');
});

test('every cat out (no key yet) -> the stage restarts: bricks, balls and counts come back', () => {
  for (const source of BREAKOUT.slice(0, 2)) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const label = `${source} p${party}`;
      const bricks = chips(game).length;
      const startBalls = game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]);
      const startCounts = ownerCounts(game);
      game.tileMap.setChip(16, 6, 'MC_NON');
      loseAll(game, freeFloorXs(party));
      step(game, 30);
      assert.ok(game.breakoutBalls.every((ball) => ball.lossCountdownTicks > 0), `${label}: all landing`);
      step(game, 175 + 30);   // + the 0.5 s restart fade (death-restarts-stage, batch 16)
      assert.equal(chips(game).length, bricks, `${label}: bricks restored`);
      assert.deepEqual(game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]), startBalls, `${label}: balls back at rest`);
      assert.deepEqual(ownerCounts(game), startCounts, `${label}: counts back`);
      assert.equal(game.breakoutLostPlayers.size, 0);
      assert.equal(game.players.length, party);
    }
  }
});

test('a Desk teacher cat neither holds off the restart nor is dropped by it', () => {
  const game = load('stage_breakout01', 2);
  const row = runtime.stages.find((entry) => entry.source === 'stage_breakout01').data.createTable[0];
  game.addRuntimePlayer({ ...row, actorName: 'Player', label: '3', raw: [...row.raw] });
  const teacher = game.players.at(-1);
  teacher.parkHelper = true;
  game.playerInputSlots[game.players.length - 1] = 2;
  assert.equal(game.breakoutBalls.length, 4, 'a teacher cat brings no ball');
  loseAll(game, freeFloorXs(2));
  step(game, 230 + 30);   // + the 0.5 s restart fade (death-restarts-stage, batch 16)
  assert.equal(game.breakoutBalls.length, 4, 'restarted: four balls at rest again');
  assert.ok(game.breakoutBalls.every((ball) => speed(ball) === 0));
  assert.equal(game.players.length, 3);
  assert.equal(game.players[2], teacher, 'the same teacher cat is kept');
  assert.equal(game.playerInputSlots[2], 2);
  assert.deepEqual(ownerCounts(game).slice(0, 2), [1, 3]);
});

test('9-3: losing every ball restarts the stage too (no BreakoutKey disarms the rule)', () => {
  const game = load('stage_breakout03', 2);
  const startBalls = game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]);
  // Drop all 8 balls straight onto the WAR floor beyond the cats' BR1 row (cols 31..33 at y 432) by hand.
  game.breakoutBalls.forEach((ball, i) => setBall(ball, 1500 + (i % 3) * 30, 300 + Math.floor(i / 3) * 30, 0, 4));
  step(game, 260);
  assert.deepEqual(game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y]), startBalls, 'restarted');
  assert.deepEqual(ownerCounts(game), [1, 7]);
});

test('one cat still holding a ball: no restart', () => {
  const game = load('stage_breakout01', 2);
  const [b0, b1, b2] = game.breakoutBalls;   // P1: b0; P2: b1, b2, b3
  setBall(b0, 470, 600, 0, 4);
  setBall(b1, 530, 600, 0, 4);
  setBall(b2, 740, 600, 0, 4);
  step(game, 220);
  assert.equal(game.breakoutBalls.length, 1);
  assert.ok(game.breakoutLostPlayers.has(game.players[0]) && !game.breakoutLostPlayers.has(game.players[1]));
  assert.equal(game.breakoutBallCounts.get(game.players[1]), 1);
});

// ---------------------------------------------------------------------------------------------------------------
// breakout-key-hidden-until-clear

test('the BreakoutKey is an ordinary Key, hidden and untouchable while any brick is left', () => {
  for (const source of ['stage_breakout01', 'stage_breakout02']) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const label = `${source} p${party}`;
      assert.equal(game.keys.length, 1);
      const key = game.keys[0];
      assert.ok(!key.active && !key.view.visible, `${label}: hidden`);
      assert.deepEqual(rectOf(key), { x: 624, y: 548, width: 32, height: 56 }, 'native 32 x 56 key sensor at home');
      place(game.players[0], 624, 556);
      step(game, 1);
      assert.equal(game.carriedKeys.length, 0, `${label}: a hidden key is not picked up`);
      const all = chips(game);
      for (const cell of all.slice(1)) game.tileMap.setChip(cell.x, cell.y, 'MC_NON');
      step(game, 1);
      assert.ok(!key.active, `${label}: one brick left: still hidden`);
    }
  }
});

test('the last brick gone -> the key appears at home, is carried and opens the Goal; losing every ball then no longer restarts', () => {
  for (const source of ['stage_breakout01', 'stage_breakout02']) {
    for (const party of PARTIES) {
      const game = load(source, party);
      const label = `${source} p${party}`;
      const key = game.keys[0];
      for (const cell of chips(game)) game.tileMap.setChip(cell.x, cell.y, 'MC_NON');
      step(game, 1);
      assert.ok(key.active && key.view.visible, `${label}: appears`);
      assert.equal(game.breakoutKeyAppeared, true);
      assert.deepEqual(rectOf(key), { x: 624, y: 548, width: 32, height: 56 }, `${label}: at home`);
      loseAll(game, freeFloorXs(party));
      step(game, 220);
      assert.equal(game.breakoutBalls.length, 0, `${label}: all balls gone`);
      assert.ok(game.players.every((cat) => game.breakoutLostPlayers.has(cat)), `${label}: everyone out`);
      assert.ok(key.active, `${label}: no restart (scene flag 0x40)`);
      const cat = game.players[0];
      place(cat, 624, 556);
      step(game, 2);
      assert.ok(game.carriedKeys.some((entry) => entry.key === key && entry.player === cat), `${label}: carried`);
      const goal = game.goals[0];
      place(cat, 624, 672 - 47);
      step(game, 2);
      assert.ok(!goal.opened);
      step(game, 1, holdFor(game, 0, { up: true }));
      assert.ok(goal.opened, `${label}: the Goal opens`);
    }
  }
});

test('9-3: a plain Key "6" and Goal "6", no BreakoutKey, so flag 0x40 is never set', () => {
  const game = load('stage_breakout03', 2);
  assert.equal(game.keys.length, 1);
  assert.ok(game.keys[0].active, 'the plain key is out from the start');
  for (const cell of chips(game)) game.tileMap.setChip(cell.x, cell.y, 'MC_NON');
  step(game, 1);
  assert.equal(game.breakoutKeyAppeared, false);
});

// ---------------------------------------------------------------------------------------------------------------
// breakout-syncarea-inert

test('BreakoutSyncArea is inert offline: no actor, no clear', () => {
  for (const source of BREAKOUT) {
    for (const party of PARTIES) {
      const game = load(source, party);
      assert.equal(game.breakoutSyncAreas.length, 0, `${source} p${party}`);
      for (const cat of game.players) place(cat, 0, 0);
      step(game, 5);
      assert.equal(game.cleared, false, `${source} p${party}: no clear`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Determinism

test('determinism: two runtimes, launched balls, walking cats, 600 frames -> identical balls, bricks and counts', () => {
  for (const [source, party] of [['stage_breakout01', 2], ['stage_breakout02', 4], ['stage_breakout03', 8]]) {
    const run = () => {
      const game = load(source, party);
      game.breakoutBalls.forEach((ball, i) => { ball.velocity.x = (i % 2 ? 1 : -1) * (1 + i * 0.3); ball.velocity.y = -3; });
      const walk = idle(game.players.length).map((input, i) => ({ ...IDLE, right: i % 2 === 0, left: i % 2 === 1, jump: true, jumpPressed: i % 3 === 0 }));
      for (let f = 0; f < 600; f++) step(game, 1, f % 90 < 45 ? walk : idle(game.players.length));
      return JSON.stringify({
        balls: game.breakoutBalls.map((ball) => [ball.center.x, ball.center.y, ball.velocity.x, ball.velocity.y, ball.lossCountdownTicks]),
        bricks: chips(game),
        counts: ownerCounts(game),
        cats: game.players.map((cat) => [cat.rect.x, cat.rect.y]),
      });
    };
    const a = run();
    assert.equal(run(), a, `${source} p${party}`);
    const parsed = JSON.parse(a);
    assert.ok(parsed.bricks.length < chips(load(source, party)).length || parsed.balls.length > 0, `${source} p${party}: the run did something`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// stage-map-private-copy (Codex batch-11 must-fix)

test('every stage at parties 2/4/8: playing, breaking chips and reloading never mutates the shared stage data', () => {
  for (const entry of runtime.stages) {
    for (const party of PARTIES) {
      const data = party >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
      const pristine = JSON.stringify({ map: data.map, rows: data.createTable });
      const game = load(entry.source, party);
      const right = idle(game.players.length).map(() => ({ ...IDLE, right: true, jump: true, jumpPressed: true }));
      step(game, 120, right);
      // Break every brick / breakable chip the way a ball or a head bump does (tileMap.setChip).
      const { width, height } = game.tileMap.map;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (game.tileMap.chipAt(x, y) !== 'MC_NON') game.tileMap.setChip(x, y, 'MC_NON');
      game.loadStage(data, 720, 750, { partySize: party, simplifyPassivePlaceholders: false });
      assert.equal(JSON.stringify({ map: data.map, rows: data.createTable }), pristine, `${entry.source} p${party}: shared stage data unchanged`);
      assert.ok(game.tileMap.map.table.some((chip) => chip !== 'MC_NON'), `${entry.source} p${party}: the reload has its chips back`);
    }
  }
});

test('a breakout restart after everyone is out restores every brick (8-2, party 2)', () => {
  const game = load('stage_breakout01', 2);
  const before = chips(game).length;
  const { width, height } = game.tileMap.map;
  let broken = 0;
  for (let y = 0; y < height && broken < 10; y++) for (let x = 0; x < width && broken < 10; x++) {
    if (BRICKS.has(game.tileMap.chipAt(x, y))) { game.tileMap.setChip(x, y, 'MC_NON'); broken += 1; }
  }
  assert.equal(chips(game).length, before - 10);
  game.restartBreakoutStage();
  assert.equal(chips(game).length, before, 'all bricks back after the restart');
});

test('9-3 solved twice in one process gives the same frame count', async () => {
  const { STAGES, loadSolver, runSolver } = await import('./campaign-solve/driver.mjs');
  const stage = STAGES.find((entry) => entry.tag === '9-3');
  const first = await runSolver(stage, await loadSolver(stage));
  const second = await runSolver(stage, await loadSolver(stage));
  assert.equal(first.status, 'SOLVED');
  assert.deepEqual([second.status, second.frames], [first.status, first.frames]);
});

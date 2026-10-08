// Batch 12 (scripts/pico-campaign-patches.mjs): Ball Park -- bound-ball-pitcher, ball-box (9-4), seesaw-and-balance and
// seesaw-box2d (9-2), laser-ball-pitcher, laser-key-box (9-1).
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

const rectOf = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const DEG = 180 / Math.PI;

/** Step until the cannon's ball has finished its 0.5 s hold (and is not fading); returns it. */
function liveBall(game, cannon, limit = 200) {
  for (let i = 0; i < limit; i++) {
    const ball = cannon.ball;
    if (ball && !ball.gone && ball.delaySeconds === 0 && ball.fadeFrames === 0) return ball;
    step(game, 1);
  }
  throw new Error('no live ball');
}
function setBall(ball, x, y, vx = 0, vy = 0) {
  ball.x = x; ball.y = y; ball.vx = vx; ball.vy = vy;
  ball.settleCount = 0; ball.groundedFrames = 0;
}
/** Keep every cat parked off the 9-1 ball lane (in the open room above it). */
function park(game) { game.players.forEach((cat, i) => place(cat, 160 + 36 * i, 100)); }
function stepParked(game, frames) { for (let i = 0; i < frames; i++) { park(game); step(game, 1); } }

// ---------------------------------------------------------------------------------------------------------------
// bound-ball-pitcher (9-4)

const BOUND_SPEED = { 2: 3.16, 4: 3.55, 8: 3.1 };   // 0.1 * p[N-1]; party 8 plays stage_bound01_net_many (p[7] = 31)

test('9-4 BoundBallPitcher: a solid cannon {x-40, y-18, 54, 40}; speed 0.1 * p[N-1] per party', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    assert.equal(game.nativeCannons.length, 1);
    const cannon = game.nativeCannons[0];
    const { x, y } = cannon.spawn;
    assert.equal(x, 1185);
    assert.equal(y, party >= 5 ? 446 : 190, `p${party}: the large-party variant`);
    assert.deepEqual(rectOf(cannon.body.rect), { x: x - 40, y: y - 18, width: 54, height: 40 });
    assert.ok(game.staticRects.includes(cannon.body), 'the cannon is a solid body');
    assert.ok(close(cannon.speed, BOUND_SPEED[party], 1e-5), `p${party}: speed ${cannon.speed}`);
    assert.ok(close(cannon.dirX, -1, 1e-6) && Math.abs(cannon.dirY) < 1e-6, 'angle 270 = left');
    assert.equal(game.deadBallPitchers.length, 0, 'not a generic DeadBallPitcher');
  }
});

test('9-4: one skipped tick, a ball at pos + 20 * dir held still (and visible) for 0.5 s, then flying left', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    const cannon = game.nativeCannons[0];
    step(game, 1);
    assert.equal(cannon.ball, undefined, `p${party}: the first update is skipped`);
    step(game, 1);
    const ball = cannon.ball;
    assert.ok(ball, `p${party}: fired on the 2nd tick`);
    assert.ok(close(ball.x, cannon.spawn.x - 20) && close(ball.y, cannon.spawn.y), 'spawned 20 px along its heading');
    assert.ok(ball.view.visible, 'visible while held');
    for (let tick = 0; tick < 29; tick++) {
      step(game, 1);
      assert.ok(close(ball.x, cannon.spawn.x - 20) && close(ball.y, cannon.spawn.y) && ball.vx === 0 && ball.vy === 0,
        `p${party}: held still on tick ${tick}`);
    }
    step(game, 1);
    assert.ok(close(ball.vx, -cannon.speed, 1e-5), `p${party}: launched left at the cannon speed (vx ${ball.vx})`);
    step(game, 1);
    assert.ok(close(ball.x, cannon.spawn.x - 20 - cannon.speed, 1e-4), 'one tick of flight');
    assert.ok(close(ball.vy, 0.65, 1e-5), 'gravity 0.65 per tick');
    step(game, 1);
    assert.ok(close(ball.vy, 1.3, 1e-5));
    assert.equal(game.nativeCannons[0].ball, ball, 'one ball at a time');
  }
});

test('9-4: a ball falling onto a still head comes back at -0.467 of its (energy-fixed) speed (party 5+: -1/3)', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    const cannon = game.nativeCannons[0];
    const ball = liveBall(game, cannon);
    const cat = game.players[0];
    place(cat, 600, 625);
    step(game, 3);
    assert.ok(cat.velocity.x === 0 && cat.velocity.y === 0, 'the cat stands still');
    const top = cat.rect.y;
    const centre = cat.rect.x + cat.rect.width / 2;
    const u = 10, gap = 5;
    setBall(ball, centre, top - 12 - gap, 0, u);
    step(game, 1);
    const factor = party < 5 ? (50 - 1.2 * 100) / 150 : (50 - 100) / 150;
    const expected = factor * Math.sqrt(u * u + 2 * 0.65 * gap);
    assert.ok(close(ball.vy, expected, 1e-6), `p${party}: vy ${ball.vy} vs ${expected}`);
    assert.ok(ball.fadeFrames === 0, 'a cat never kills the ball');
    assert.ok(cat.deathTimer <= 0, 'the cat is not harmed');
  }
});

test('9-4: a rising cat adds a lot: u1 10 against a head rising at 10 per tick -> -19.3', () => {
  const game = load('stage_bound01', 2);
  const cannon = game.nativeCannons[0];
  const ball = liveBall(game, cannon);
  const cat = game.players[0];
  place(cat, 600, 625);
  step(game, 3);
  cat.velocity.y = -600;   // 10 per tick upward (the ball reads the cat's last velocity)
  // Falling at 9.35 + 0.65 with a gap chosen so the energy-fixed contact speed is exactly 10.
  const gap = (100 - 9.35 * 9.35) / (2 * 0.65);
  setBall(ball, cat.rect.x + 16, cat.rect.y - 12 - gap, 0, 9.35);
  step(game, 1);
  const expected = -((50 - 120) * -10 + 2.2 * 100 * 10) / 150;   // along n = (0, -1)
  assert.ok(close(ball.vy, expected, 1e-6), `vy ${ball.vy} vs ${expected}`);
  assert.ok(close(ball.vy, -19.3, 0.1));
});

test('9-4: a top-face floor landing stops the ball, it fades 30 frames, and the cannon fires a new one', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    const cannon = game.nativeCannons[0];
    const ball = liveBall(game, cannon);
    let frames = 0;
    while (ball.fadeFrames === 0 && frames < 400) { step(game, 1); frames++; }
    assert.equal(ball.fadeFrames, 30, `p${party}: fading`);
    assert.ok(close(ball.y, 660, 1e-6), `p${party}: on the floor top (centre ${ball.y})`);
    assert.ok(ball.vx === 0 && ball.vy === 0, 'velocity 0');
    if (party === 2) assert.ok(ball.x > 1035 && ball.x < 1060, `party 2 lands near x 1045 (${ball.x})`);
    const landedX = ball.x;
    step(game, 29);
    assert.ok(!ball.gone && ball.x === landedX, 'still there, fading');
    step(game, 1);
    assert.ok(ball.gone, 'removed after 30 frames');
    assert.equal(cannon.ball, ball, 'the slot clears on the next update');
    step(game, 1);
    assert.equal(cannon.ball, undefined);
    step(game, 1);
    assert.ok(cannon.ball && cannon.ball !== ball, `p${party}: a new ball`);
    assert.ok(close(cannon.ball.x, cannon.spawn.x - 20) && cannon.ball.delaySeconds > 0, 'held at the muzzle again');
  }
});

test('9-4: two resting contacts on a still head kill the ball (party 5+: one)', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    const cannon = game.nativeCannons[0];
    const ball = liveBall(game, cannon);
    const cat = game.players[0];
    place(cat, 600, 625);
    step(game, 3);
    setBall(ball, cat.rect.x + 16, cat.rect.y - 12, 0, 0);
    let frames = 0;
    while (ball.fadeFrames === 0 && frames < 20) { step(game, 1); frames++; }
    assert.equal(ball.fadeFrames, 30, `p${party}: killed while resting on the head`);
    assert.equal(ball.settleCount, party > 4 ? 1 : 2, `p${party}: settle count`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// ball-box (9-4)

test('9-4 BallBox: a bottom-anchored 44 x 60 body that settles onto the floor; no Key yet', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    const box = game.nativeKeyBoxes[0];
    assert.equal(box.kind, 'ball');
    assert.deepEqual(rectOf(box.body.rect), { x: 42, y: 609, width: 44, height: 60 }, 'row (64, 671) + {-22, -62, 44, 60}');
    assert.ok(game.staticRects.includes(box.body), 'solid');
    assert.equal(game.normalBoxes.length, 0, 'not a NormalBox');
    assert.equal(game.keys.length, 0, 'no Key until the box breaks');
    step(game, 10);
    assert.ok(close(box.body.rect.y + box.body.rect.height, 672, 0.1), `falls onto the floor (${box.body.rect.y + 60})`);
    assert.ok(close(box.y - box.body.rect.y, 62), 'the row point moves with it');
  }
});

test('9-4 BallBox: a ball crossing the top sensor within 5 breaks it; the Key appears at (x, y - 30); 40-frame removal', () => {
  for (const party of PARTIES) {
    for (const dx of [0, -5, 5]) {
      const game = load('stage_bound01', party);
      const label = `p${party} dx ${dx}`;
      const cannon = game.nativeCannons[0];
      const box = game.nativeKeyBoxes[0];
      const ball = liveBall(game, cannon);
      setBall(ball, box.x + dx, box.y - 66 - 12 - 2, 0, 3);
      step(game, 1);
      assert.ok(box.breaking, `${label}: breaking`);
      assert.equal(ball.fadeFrames, 30, `${label}: the ball answers 0xb (fade)`);
      assert.equal(ball.x, box.x, 'x = box x');
      assert.equal(ball.dropVy, 3, 'velocity (0, 3)');
      assert.equal(game.keys.length, 1);
      const key = game.keys[0];
      assert.ok(key.active && key.view.visible, `${label}: the Key is out`);
      assert.equal(key.spawn.x, box.x);
      assert.ok(close(key.spawn.y, box.y - 30), `${label}: key y ${key.spawn.y} vs box ${box.y}`);
      step(game, 39);
      assert.ok(game.staticRects.includes(box.body), 'solid while fading');
      assert.equal(box.view.alpha, 0, 'faded by frame 20');
      step(game, 1);
      assert.ok(!game.staticRects.includes(box.body) && !game.nativeKeyBoxes.includes(box), `${label}: removed at 40`);
    }
  }
});

test('9-4 BallBox: off-centre (6 px) the sensor does nothing; cats on the box never break it', () => {
  for (const party of PARTIES) {
    const game = load('stage_bound01', party);
    const cannon = game.nativeCannons[0];
    const box = game.nativeKeyBoxes[0];
    const ball = liveBall(game, cannon);
    setBall(ball, box.x + 6, box.y - 66 - 12 - 2, 0, 3);
    step(game, 10);
    assert.ok(!box.breaking && game.keys.length === 0, `p${party}: 6 px off: no break`);
    const fresh = load('stage_bound01', party);
    const freshBox = fresh.nativeKeyBoxes[0];
    step(fresh, 10);
    const cat = fresh.players[0];
    place(cat, freshBox.body.rect.x + 6, freshBox.body.rect.y - 46);
    step(fresh, 60, idle(fresh.players.length).map((input, i) => (i === fresh.playerInputSlots[0] ? { ...IDLE, jump: true, jumpPressed: true } : IDLE)));
    assert.ok(!freshBox.breaking && fresh.keys.length === 0, `p${party}: a cat on the box does nothing`);
  }
});

test('9-4: the BallBox Key is carried like any key and opens the Goal', () => {
  const game = load('stage_bound01', 2);
  const cannon = game.nativeCannons[0];
  const box = game.nativeKeyBoxes[0];
  const ball = liveBall(game, cannon);
  setBall(ball, box.x, box.y - 66 - 12 - 2, 0, 3);
  step(game, 1);
  const key = game.keys[0];
  step(game, 45);
  const cat = game.players[0];
  place(cat, key.rect.x, key.rect.y + 10);
  step(game, 2);
  assert.ok(game.carriedKeys.some((entry) => entry.key === key && entry.player === cat), 'carried');
  const goal = game.goals[0];
  place(cat, 1150 - 16, 674 - 47);
  step(game, 2);
  assert.ok(!goal.opened);
  step(game, 1, holdFor(game, 0, { up: true }));
  assert.ok(goal.opened, 'the Goal opens');
});

// ---------------------------------------------------------------------------------------------------------------
// seesaw-and-balance (9-2)

const FULL_TILT = Math.atan2(Math.sin(0.12217) * 450, 450);   // 6.95 deg

test('9-2: planks from the shape table about their pivots; pans {-97, -7, 194, 14} at 640 -/+ 450; no plank is solid', () => {
  for (const party of PARTIES) {
    const game = load('stage_seesaw01', party);
    const planks = game.seesawPlanks.map((plank) => [plank.spawn.actorName, plank.pivotX, plank.pivotY, plank.local.x, plank.local.width, plank.geared]);
    assert.deepEqual(planks, [
      ['SeesawParent', 640, 358, -300, 450, false],
      ['Seesaw', 640, 258, -150, 450, true],
      ['Seesaw', 640, 164, -300, 450, true],
    ]);
    assert.equal(game.seesaws.length, 0, 'no plank is in any collision list');
    const pans = game.nativeBalances[0];
    assert.deepEqual(rectOf(pans.left.lift.rect), { x: 93, y: 597, width: 194, height: 14 });
    assert.deepEqual(rectOf(pans.right.lift.rect), { x: 993, y: 597, width: 194, height: 14 });
    assert.ok(game.weightedLifts.includes(pans.left.lift) && game.weightedLifts.includes(pans.right.lift), 'pans are lift bodies');
    assert.equal(game.physicsSwitches.length, 0, 'no momentary PhysicsSwitch');
    assert.ok(game.keys.length === 1 && !game.keys[0].active, 'the Key starts hidden');
    // Every cat spawns on the floor strip, outside the sealed room.
    for (const cat of game.players) assert.ok(cat.rect.y > 480, `p${party}: cat at ${cat.rect.y}`);
  }
});

test('9-2: the plank angle follows the pans: one extra cat -> r = 2/N; party 2 full tilt 6.95 deg; children copy', () => {
  for (const party of PARTIES) {
    for (const side of ['right', 'left']) {
      const game = load('stage_seesaw01', party);
      const balance = game.nativeBalances[0];
      const pan = balance[side].lift;
      const cat = game.players[0];
      step(game, 5);
      place(cat, pan.rect.x + 81, pan.rect.y - 46);
      step(game, 150);
      const r = Math.min(1, 2 / party);
      const expected = Math.atan2(r * Math.sin(0.12217) * 450, 450) * (side === 'right' ? 1 : -1);
      const [parent, middle, top] = game.seesawPlanks;
      // seesaw-box2d: the Box2D body reaches the target through the joint solver (to ~1e-5 rad), not exactly.
      assert.ok(close(parent.angle, expected, 1e-4), `p${party} ${side}: ${parent.angle * DEG} deg vs ${expected * DEG}`);
      assert.ok(close(middle.angle, parent.angle, 1e-4) && close(top.angle, parent.angle, 1e-4), 'geared children copy the parent');
      assert.ok(close(parent.view.rotation, parent.angle), 'drawn rotated');
      assert.ok(close(balance[side].offset, r * Math.sin(0.12217) * 450, 1e-9), `${side} pan sank`);
      assert.ok(close(cat.rect.y + cat.rect.height, pan.rect.y, 0.5), 'the rider rides the pan');
      if (party === 2) assert.ok(close(Math.abs(parent.angle) * DEG, 6.95, 0.01), 'full tilt 6.95 deg');
      // The cat leaves: the pans level at 0.2 px per tick.
      place(cat, 640 - 16, 672 - 47);
      step(game, 10);
      assert.ok(close(Math.abs(balance[side].offset), r * Math.sin(0.12217) * 450 - 2, 0.25), 'levelling at 0.2 per tick');
      step(game, 300);
      assert.ok(close(parent.angle, 0, 1e-4), `level again (${parent.angle})`);
    }
  }
});

test('9-2: party 2 swing side to side at 1 px per tick (one cat each way)', () => {
  const game = load('stage_seesaw01', 2);
  const balance = game.nativeBalances[0];
  const cat = game.players[0];
  place(cat, balance.right.lift.rect.x + 81, balance.right.lift.rect.y - 46);
  step(game, 60);
  const before = balance.right.offset;
  place(cat, balance.left.lift.rect.x + 81, balance.left.lift.rect.y - 46);
  step(game, 10);
  assert.ok(close(balance.right.offset, before - 10, 1e-9), `swinging back at 1 px per tick (${balance.right.offset})`);
});

test('9-2: cats never collide with a plank (a cat dropped onto the parent plank falls through to the room floor)', () => {
  for (const party of PARTIES) {
    const game = load('stage_seesaw01', party);
    const cat = game.players[0];
    place(cat, 500, 300);   // above the SeesawParent plank (y 348..368)
    step(game, 90);
    assert.ok(cat.rect.y + cat.rect.height > 440, `p${party}: fell through to the room floor (${cat.rect.y + cat.rect.height})`);
  }
});

test('9-2 seesaw-box2d: a ball rolls down the tilted plank as a damped rolling disk: dv/dt = (2/3) (g sin(theta) - 0.25 v)', () => {
  for (const party of PARTIES) {
    const game = load('stage_seesaw01', party);
    const balance = game.nativeBalances[0];
    const pitcher = game.physicsPitchers[0];
    // One cat per needed tilt step: party 8 needs 4 cats on the right pan for the full tilt.
    const riders = game.players.slice(0, Math.min(game.players.length, Math.max(1, party / 2)));
    riders.forEach((cat, i) => place(cat, balance.right.lift.rect.x + 4 + 36 * i, balance.right.lift.rect.y - 46));
    step(game, 120);
    const top = game.seesawPlanks[2];
    assert.ok(close(top.angle, FULL_TILT, 1e-4), `p${party}: full tilt (${top.angle * DEG})`);
    const ball = pitcher.ball;
    assert.ok(ball && !ball.gone, 'a ball is in play');
    // Rest the ball on the top plank, 150 px left of the pivot, on its upper face (+1 px polygon skin).
    const cos = Math.cos(top.angle), sin = Math.sin(top.angle);
    const lx = -150, ly = -10 - 1 - 12;
    setBallBody(ball, top.pivotX + lx * cos - ly * sin, top.pivotY + lx * sin + ly * cos);
    const start = { x: ball.x, y: ball.y };
    step(game, 40);
    const speedAlong = (ball.vx * cos + ball.vy * sin) * 60;
    // Rolling without slipping (friction sqrt(0.5 * 1)) with angular damping 0.5: v(t) = 4 g sin(theta) (1 - e^(-t / 6)).
    const g = 980 * Math.sin(FULL_TILT);
    const t = 40 / 60;
    const expected = 4 * g * (1 - Math.exp(-t / 6));
    assert.ok(close(speedAlong, expected, 0.03 * expected), `p${party}: speed ${speedAlong} px/s vs ${expected}`);
    assert.ok(speedAlong < (2 / 3) * g * t, 'slower than an undamped rolling disk');
    const along = (ball.x - start.x) * cos + (ball.y - start.y) * sin;
    assert.ok(along > 0, 'down the slope');
    const off = -(ball.x - top.pivotX) * sin + (ball.y - top.pivotY) * cos;
    assert.ok(close(off, -22.5, 1), `stays on the plank face (${off})`);
    assert.equal(ball.countdown, 0, 'alive');
  }
});

test('9-2: the PhysicsBall starts at rest at the pitcher, falls onto the top plank and rests there while level', () => {
  const game = load('stage_seesaw01', 2);
  const pitcher = game.physicsPitchers[0];
  step(game, 1);
  assert.equal(pitcher.ball, undefined, 'the first pitcher update is skipped');
  step(game, 1);
  const ball = pitcher.ball;
  // seesaw-box2d: the body is built with the wrapper velocity 0 (FUN_7ff72bbe6520); the launch speed stays on the actor.
  assert.ok(close(ball.x, 410, 1e-4) && close(ball.y, 68 + 980 / 3600, 1e-3), `spawned at pos + 20 * (0, 1), stepped once (${ball.y})`);
  assert.ok(close(ball.vx, 0) && close(ball.vy, 980 / 3600, 1e-6), 'from rest: one tick of gravity');
  step(game, 60);
  assert.ok(close(ball.y, 164 - 10 - 1 - 12 + 0.5, 0.25) && close(ball.x, 410, 0.1), `resting on the top plank (${ball.x}, ${ball.y})`);
});

test('9-2: touching the area floor starts the 30-tick death; the pitcher fires the next ball', () => {
  const game = load('stage_seesaw01', 2);
  const pitcher = game.physicsPitchers[0];
  step(game, 3);
  const ball = pitcher.ball;
  setBallBody(ball, 300, 420, 2, 2);
  let frames = 0;
  while (ball.countdown === 0 && frames < 20) { step(game, 1); frames++; }
  assert.equal(ball.countdown, 30, 'countdown starts (detection does not consume a count)');
  step(game, 15);
  assert.ok(ball.body.getLinearVelocity().x !== 0, 'still moving for 15 ticks');
  step(game, 1);
  assert.ok(ball.vx === 0 && ball.vy === 0 && !ball.body.isAwake(), 'put to sleep below 15');
  step(game, 14);
  assert.ok(ball.gone && !box2dBodies(game.ballParkWorld).includes(ball.body), 'removed at 0, body destroyed');
  step(game, 2);
  assert.ok(pitcher.ball && pitcher.ball !== ball, 'a new ball');
});

test('9-2 PhysicsSwitch: cats never press it; a ball crossing its 16 px ray latches it and shows the Key', () => {
  for (const party of PARTIES) {
    const game = load('stage_seesaw01', party);
    const entry = game.nativePhysicsSwitches[0];
    const key = game.keys[0];
    const cat = game.players[0];
    place(cat, 905.6 - 16, 448 - 46);
    step(game, 10);
    assert.ok(!entry.latched && !key.active, `p${party}: a cat on the switch does nothing`);
    const ball = game.physicsPitchers[0].ball;
    setBallBody(ball, 905.6, 380, 0, 2);
    let frames = 0;
    while (!entry.latched && frames < 30) { step(game, 1); frames++; }
    assert.ok(entry.latched, `p${party}: latched`);
    assert.ok(ball.y > 450 - 16 - 12 - 8 && ball.y < 450, `pressed by the ball dropping through the ray (${ball.y})`);
    assert.ok(key.active && key.view.visible, 'the Key appears');
    step(game, 60);
    assert.ok(entry.latched && key.active, 'latched for good');
  }
});

test('9-2 PhysicsSwitch: b2CircleShape::RayCast -- a floor ball centred on the ray misses (the ray starts inside it), a rolling one hits on approach', () => {
  // Resting on the floor edge (y 451, 1 px skin, 0.5 px slop): the ray start (905.6, 450) is 11.5 px from the centre.
  const restY = 451 - 1 - 12 + 0.5;
  const centred = load('stage_seesaw01', 2);
  step(centred, 3);
  const still = centred.physicsPitchers[0].ball;
  setBallBody(still, 905.6, restY);
  step(centred, 12);
  assert.ok(!centred.nativePhysicsSwitches[0].latched, `a ball sitting on the ray does not press it (${still.x}, ${still.y})`);
  const rolling = load('stage_seesaw01', 2);
  step(rolling, 3);
  const ball = rolling.physicsPitchers[0].ball;
  setBallBody(ball, 880, restY, 4, 0);
  ball.body.setAngularVelocity(4 * 60 / 12);
  let frames = 0;
  while (!rolling.nativePhysicsSwitches[0].latched && frames < 16) { step(rolling, 1); frames++; }
  assert.ok(rolling.nativePhysicsSwitches[0].latched, 'a rolling ball presses it');
  assert.ok(ball.x > 905.6 - 12 && ball.x < 905.6 - 3, `on its approach, before the centre reaches the ray (x ${ball.x})`);
});

// --- seesaw-box2d: the ball, planks and PhysicsArea are a real Box2D 2.3 world (planck) -------------------------------

const BOX2D_SCALE = 0.009999999776482582;   // DAT_7ff72bc7d45c
const px = (metres) => metres / BOX2D_SCALE;
/** Every body of the 9-2 Box2D world, in creation order (planck, like Box2D, prepends to its lists). */
function box2dBodies(world) {
  const bodies = [];
  for (let body = world.getBodyList(); body; body = body.getNext()) bodies.unshift(body);
  return bodies;
}
function box2dJoints(world) {
  const joints = [];
  for (let joint = world.getJointList(); joint; joint = joint.getNext()) joints.unshift(joint);
  return joints;
}
function fixturesOf(body) {
  const fixtures = [];
  for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) fixtures.unshift(fixture);
  return fixtures;
}
/** Put a PhysicsBall's Box2D body at (x, y) px with velocity (vx, vy) px per tick, awake, no spin. */
function setBallBody(ball, x, y, vx = 0, vy = 0) {
  ball.body.setTransform({ x: x * BOX2D_SCALE, y: y * BOX2D_SCALE }, 0);
  ball.body.setLinearVelocity({ x: vx * 60 * BOX2D_SCALE, y: vy * 60 * BOX2D_SCALE });
  ball.body.setAngularVelocity(0);
  ball.body.setAwake(true);
  ball.x = x; ball.y = y; ball.vx = vx; ball.vy = vy;
}

test('9-2 seesaw-box2d: the Box2D world mirrors the native bodies, fixtures, joints and step parameters', () => {
  const game = load('stage_seesaw01', 2);
  step(game, 3);
  const world = game.ballParkWorld;
  assert.ok(world, 'a Box2D world');
  assert.ok(close(world.getGravity().x, 0) && close(world.getGravity().y, 980 * BOX2D_SCALE, 1e-9), 'gravity (0, 980 px/s^2) at 100 px/m');
  const [ground, area, parent, middle, top, ball] = box2dBodies(world);
  assert.equal(box2dBodies(world).length, 6, 'ground, PhysicsArea, three planks, the ball');
  assert.ok(ground.isStatic() && fixturesOf(ground).length === 0, 'the ground body (FUN_7ff72bbe74f0)');
  // PhysicsArea: a static body at (224, 32) with the 5-point loop as four edges (kind 1 for the death test).
  assert.ok(area.isStatic() && close(px(area.getPosition().x), 224, 1e-4) && close(px(area.getPosition().y), 32, 1e-4));
  assert.equal(area.getUserData().kind, 1);
  const edges = fixturesOf(area);
  const corners = [[0, 0], [0, 419], [832, 419], [832, 0], [0, 0]];
  assert.equal(edges.length, 4);
  edges.forEach((fixture, i) => {
    const shape = fixture.getShape();
    assert.equal(shape.getType(), 'edge');
    assert.deepEqual([px(shape.m_vertex1.x), px(shape.m_vertex1.y)].map(Math.round), corners[i]);
    assert.deepEqual([px(shape.m_vertex2.x), px(shape.m_vertex2.y)].map(Math.round), corners[i + 1]);
    assert.equal(shape.m_hasVertex0, i > 0, 'ghost vertex0 after the first edge');
    if (i > 0) assert.deepEqual([px(shape.m_vertex0.x), px(shape.m_vertex0.y)].map(Math.round), corners[i], 'vertex0 = vertex1 (FUN_7ff72bbe5f80)');
    assert.equal(shape.m_hasVertex3, i < 3, 'ghost vertex3 before the last edge');
    if (i < 3) assert.deepEqual([px(shape.m_vertex3.x), px(shape.m_vertex3.y)].map(Math.round), corners[i + 2]);
    assert.ok(fixture.getDensity() === 1 && fixture.getFriction() === 1 && fixture.getRestitution() === 0);
  });
  // Planks: dynamic boxes at the pivots, gravity scale 0, density 1, friction 1, restitution 0, no damping.
  const shapes = { SeesawParent: [-300, 150], Seesaw258: [-150, 300], Seesaw164: [-300, 150] };
  for (const [body, pivotY, xs] of [[parent, 358, shapes.SeesawParent], [middle, 258, shapes.Seesaw258], [top, 164, shapes.Seesaw164]]) {
    assert.ok(body.isDynamic() && body.getGravityScale() === 0 && body.getAngularDamping() === 0 && body.getLinearDamping() === 0);
    assert.ok(close(px(body.getPosition().x), 640, 1e-3) && close(px(body.getPosition().y), pivotY, 1e-3), 'at the pivot');
    const [fixture] = fixturesOf(body);
    assert.ok(fixture.getDensity() === 1 && fixture.getFriction() === 1 && fixture.getRestitution() === 0);
    const vertices = fixture.getShape().m_vertices.map((v) => [Math.round(px(v.x)), Math.round(px(v.y))]);
    assert.deepEqual([Math.min(...vertices.map((v) => v[0])), Math.max(...vertices.map((v) => v[0]))], xs);
    assert.deepEqual([Math.min(...vertices.map((v) => v[1])), Math.max(...vertices.map((v) => v[1]))], [-10, 10]);
  }
  assert.deepEqual(game.seesawPlanks.map((plank) => plank.body), [parent, middle, top]);
  // Joints: a limited revolute per plank (ground -> plank at the pivot), gears ratio -1 for the two children.
  const joints = box2dJoints(world);
  assert.deepEqual(joints.map((joint) => joint.getType()),
    ['revolute-joint', 'revolute-joint', 'gear-joint', 'revolute-joint', 'gear-joint']);
  const revolutes = joints.filter((joint) => joint.getType() === 'revolute-joint');
  revolutes.forEach((joint, i) => {
    assert.ok(joint.getBodyA() === ground && joint.getBodyB() === [parent, middle, top][i]);
    assert.ok(joint.isLimitEnabled() && !joint.isMotorEnabled());
    assert.ok(close(joint.getLowerLimit(), -0.1745329201221466, 1e-12) && close(joint.getUpperLimit(), 0.1745329201221466, 1e-12));
    assert.equal(joint.getReferenceAngle(), 0);
    assert.ok(close(px(joint.getLocalAnchorA().x), 640, 1e-3) && close(joint.getLocalAnchorB().x, 0) && close(joint.getLocalAnchorB().y, 0));
  });
  const gears = joints.filter((joint) => joint.getType() === 'gear-joint');
  gears.forEach((gear, i) => {
    assert.equal(gear.getRatio(), -1);
    assert.ok(gear.getJoint1() === revolutes[0] && gear.getJoint2() === revolutes[i + 1], 'parent revolute -> child revolute');
  });
  // The ball: dynamic circle r 12 at rest at (410, 68): density 0.1, friction 0.5, restitution 0.2, angular damping 0.5.
  assert.ok(ball === game.physicsPitchers[0].ball.body && ball.isDynamic());
  const [ballFixture] = fixturesOf(ball);
  assert.ok(close(px(ballFixture.getShape().getRadius()), 12, 1e-4));
  assert.ok(close(ballFixture.getDensity(), 0.1, 1e-8) && ballFixture.getFriction() === 0.5 && close(ballFixture.getRestitution(), 0.2, 1e-8));
  assert.ok(ball.getAngularDamping() === 0.5 && ball.getGravityScale() === 1 && ball.getLinearDamping() === 0);
  // One b2World::Step(1/60, 10, 10) per game tick.
  const calls = [];
  const original = world.step.bind(world);
  world.step = (...args) => { calls.push(args); return original(...args); };
  step(game, 4);
  assert.deepEqual(calls.map((args) => args.slice(1)), [[10, 10], [10, 10], [10, 10], [10, 10]]);
  assert.ok(calls.every((args) => close(args[0], 1 / 60, 1e-9)), 'dt 1/60 (DAT_7ff72bc7d790)');
});

test('9-2 seesaw-box2d: the hand-rolled solver\'s plank-angle trace misses the switch under Box2D (Codex replay)', async () => {
  const { angles } = JSON.parse(readFileSync(new URL('./campaign-batch12.seesaw-angle-trace.json', import.meta.url), 'utf8'));
  assert.equal(angles.length, 1170);
  const game = load('stage_seesaw01', 2);
  const parent = game.seesawPlanks[0];
  let frame = 0;
  // Drive the SeesawParent target from the trace instead of the Balance (cats idle).
  game.updateNativeBalances = () => { parent.target = angles[frame]; };
  let firstFloor = null;
  let maxError = 0;
  for (frame = 0; frame < angles.length; frame++) {
    step(game, 1);
    maxError = Math.max(maxError, Math.abs(parent.angle - angles[frame]));
    const ball = game.physicsPitchers[0].ball;
    if (!firstFloor && ball && !ball.gone && ball.countdown === 30) firstFloor = { frame: frame + 1, x: ball.x };
    assert.ok(!game.nativePhysicsSwitches[0].latched, `latched at tick ${frame + 1}`);
  }
  assert.ok(maxError < 0.005, `the planks follow the trace (max error ${maxError} rad)`);
  // Codex (real Box2D 2.3.1): first lands at frame 672 near x 236.91. planck: the death test sees it at tick 674.
  assert.ok(firstFloor && firstFloor.frame >= 665 && firstFloor.frame <= 685, `first floor contact at tick ${firstFloor?.frame}`);
  assert.ok(firstFloor.x > 224 && firstFloor.x < 260, `on the far left of the room (x ${firstFloor.x})`);
});

test('9-2 seesaw-box2d: determinism: two worlds with the same pan schedule give bit-identical ball and plank states', () => {
  const run = () => {
    const game = load('stage_seesaw01', 2);
    const balance = game.nativeBalances[0];
    let frame = 0;
    const original = game.balancePanRiderCount.bind(game);
    game.balancePanRiderCount = (rect) => {
      if (frame < 30) return original(rect);
      const rightTilt = frame < 200 || frame >= 500;
      return (rect === balance.right.lift.rect) === rightTilt ? 1 : 0;
    };
    const states = [];
    for (frame = 0; frame < 900; frame++) {
      step(game, 1);
      const ball = game.physicsPitchers[0].ball;
      const body = ball?.body;
      states.push([body ? [body.getPosition().x, body.getPosition().y, body.getLinearVelocity().x, body.getLinearVelocity().y,
        body.getAngle(), body.getAngularVelocity()] : null, game.seesawPlanks.map((plank) => plank.body.getAngle()),
        game.nativePhysicsSwitches[0].latched]);
    }
    return JSON.stringify(states);
  };
  const a = run();
  assert.equal(run(), a);
});

// ---------------------------------------------------------------------------------------------------------------
// laser-ball-pitcher / laser-key-box (9-1)

test('9-1 LaserBallPitcher: a solid cannon; raw p1 speed; the target only on the party <= 3 row; k per party', () => {
  const K = { 2: 1.8, 4: 1.6, 8: 1.4 };
  for (const party of PARTIES) {
    const game = load('stage_laser_ball01', party);
    assert.equal(game.nativeCannons.length, 1, `p${party}: one pitcher row is active`);
    const cannon = game.nativeCannons[0];
    const { x, y } = cannon.spawn;
    assert.deepEqual(rectOf(cannon.body.rect), { x: x - 40, y: y - 18, width: 54, height: 40 });
    assert.ok(game.staticRects.includes(cannon.body));
    assert.equal(cannon.speed, 7);
    assert.equal(cannon.target, party <= 3 ? 'LaserKeyBox' : undefined);
    const box = game.nativeKeyBoxes[0];
    assert.equal(box.kind, 'laser');
    assert.deepEqual(rectOf(box.body.rect), { x: box.x - 22, y: box.y - 62, width: 44, height: 60 });
    if (party < 5) assert.deepEqual(rectOf(box.body.rect), { x: 53, y: 372, width: 44, height: 60 });
    assert.ok(close(box.speedFactor, K[party], 1e-6), `p${party}: k ${box.speedFactor}`);
    assert.equal(game.normalBoxes.length, 0, 'not a NormalBox');
    assert.equal(game.keys.length, 0, 'no Key until the box breaks');
  }
});

test('9-1: the ball is hidden and still for 0.5 s, then flies left in a straight line at constant speed', () => {
  for (const party of [2, 4]) {
    const game = load('stage_laser_ball01', party);
    const cannon = game.nativeCannons[0];
    stepParked(game, 2);
    const ball = cannon.ball;
    assert.ok(ball && close(ball.x, 772) && close(ball.y, 398), 'at pos + 20 * dir');
    assert.equal(ball.view.visible, false, 'hidden while held');
    stepParked(game, 29);
    assert.ok(ball.vx === 0 && ball.view.visible === false);
    stepParked(game, 1);
    assert.ok(ball.view.visible && close(ball.vx, -7, 1e-6) && Math.abs(ball.vy) < 1e-5, 'launched');
    const x0 = ball.x;
    stepParked(game, 20);
    assert.ok(close(ball.x, x0 - 140, 1e-3) && close(ball.y, 398, 1e-3), `straight, no gravity (${ball.x}, ${ball.y})`);
  }
});

test('9-1: three clean hits: speed x k on hits 1-2, the 3rd breaks the box and the Key appears at (75, 404)', () => {
  for (const party of [2, 4]) {
    const game = load('stage_laser_ball01', party);
    const cannon = game.nativeCannons[0];
    const box = game.nativeKeyBoxes[0];
    const k = box.speedFactor;
    const speeds = [];
    let frames = 0;
    while (box.hits < 3 && frames < 600) {
      const before = box.hits;
      stepParked(game, 1);
      frames++;
      if (box.hits !== before) speeds.push(cannon.speed);
    }
    assert.equal(box.hits, 3, `p${party}: three hits`);
    assert.ok(close(speeds[0], Math.fround(7 * k), 1e-4) && close(speeds[1], Math.fround(Math.fround(7 * k) * k), 1e-3),
      `p${party}: speeds ${speeds}`);
    assert.ok(box.breaking, 'breaking');
    assert.equal(game.keys.length, 1);
    const key = game.keys[0];
    assert.ok(key.active && key.spawn.x === 75 && key.spawn.y === 404, 'the Key at (box x, box y - 30)');
    stepParked(game, 39);
    assert.ok(game.staticRects.includes(box.body), 'solid while fading');
    stepParked(game, 1);
    assert.ok(!game.staticRects.includes(box.body), 'removed after 40 frames');
  }
});

test('9-1: a ball hitting a cat resets the hits and the speed (party <= 3 target); party 4+ cats just absorb balls', () => {
  for (const party of PARTIES) {
    const game = load('stage_laser_ball01', party);
    const cannon = game.nativeCannons[0];
    const box = game.nativeKeyBoxes[0];
    if (party < 5) {
      let frames = 0;
      while (box.hits < 1 && frames < 300) { stepParked(game, 1); frames++; }
      assert.equal(box.hits, 1);
      // The next ball meets a cat standing in the lane.
      game.players.forEach((cat, i) => place(cat, 300 + 40 * i, 432 - 47));
    }
    const hitsBefore = box.hits;
    const speedBefore = cannon.speed;
    const ball = liveBall(game, cannon, 400);
    let frames = 0;
    while (ball.fadeFrames === 0 && frames < 300) { step(game, 1); frames++; }
    const stoppedAt = ball.x;
    const catRight = Math.max(...game.players.map((cat) => cat.rect.x + cat.rect.width));
    assert.ok(stoppedAt > catRight && stoppedAt < catRight + 12 + 23, `p${party}: stopped on the first cat (${stoppedAt} vs ${catRight})`);
    if (cannon.target) {
      assert.equal(box.hits, 0, `p${party}: hits reset`);
      assert.equal(cannon.speed, cannon.baseSpeed, 'base speed');
      assert.equal(box.frames[0].visible, true, 'frame 0');
    } else {
      assert.equal(box.hits, hitsBefore, `p${party}: no target, no reset`);
      assert.equal(cannon.speed, speedBefore);
    }
  }
});

test('9-1: cats never count as box hits, and a reset after the 3rd hit does nothing', () => {
  const game = load('stage_laser_ball01', 2);
  const box = game.nativeKeyBoxes[0];
  const cat = game.players[0];
  for (let i = 0; i < 60; i++) { place(cat, 99, 432 - 47); step(game, 1, holdFor(game, 0, { left: true })); }
  assert.equal(box.hits, 0, 'a cat pushing on the box is not a hit');
  box.hits = 3;
  game.resetLaserKeyBoxHits('LaserKeyBox');
  assert.equal(box.hits, 3, 'resetHits only while hits < 3');
});

// ---------------------------------------------------------------------------------------------------------------

test('determinism: two runtimes with the same inputs -> identical balls, pans, planks and keys (9-1, 9-2, 9-4)', () => {
  for (const [source, party] of [['stage_bound01', 2], ['stage_bound01', 8], ['stage_seesaw01', 2], ['stage_seesaw01', 4], ['stage_laser_ball01', 2]]) {
    const run = () => {
      const game = load(source, party);
      const walk = idle(game.players.length).map((input, i) => ({ ...IDLE, right: i % 2 === 0, left: i % 2 === 1, jump: true, jumpPressed: i % 3 === 0 }));
      const trace = [];
      for (let f = 0; f < 600; f++) {
        step(game, 1, f % 90 < 45 ? walk : idle(game.players.length));
        if (f % 25 === 0) {
          trace.push([
            game.nativeCannons.map((cannon) => cannon.ball ? [cannon.ball.x, cannon.ball.y, cannon.ball.vx, cannon.ball.vy, cannon.ball.fadeFrames] : null),
            game.physicsPitchers.map((pitcher) => pitcher.ball ? [pitcher.ball.x, pitcher.ball.y, pitcher.ball.countdown] : null),
            game.seesawPlanks.map((plank) => plank.angle),
            game.nativeBalances.map((balance) => [balance.left.offset, balance.right.offset]),
            game.nativeKeyBoxes.map((box) => [box.hits, box.breaking, box.y]),
            game.keys.map((key) => key.active),
            game.players.map((cat) => [cat.rect.x, cat.rect.y]),
          ]);
        }
      }
      return JSON.stringify(trace);
    };
    const a = run();
    assert.equal(run(), a, `${source} p${party}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Codex batch-12 must-fixes 2 and 3

test('9-4: resuming vertical flight clears the resting count (FUN_7ff72bb36ee0), so a later separate rest does not kill (party 2)', () => {
  const game = load('stage_bound01', 2);
  const cannon = game.nativeCannons[0];
  const ball = liveBall(game, cannon);
  const cat = game.players[0];
  place(cat, 600, 625);
  step(game, 3);
  // One resting contact already counted, then the ball is flying again (|vy| > 1.19e-7).
  setBall(ball, cat.rect.x + 16, cat.rect.y - 200, 0, -4);
  ball.settleCount = 1;
  step(game, 1);
  assert.equal(ball.settleCount, 0, 'flight resumed: the count is cleared');
  // A separate single rest on the head is the first of two again: the ball lives.
  setBall(ball, cat.rect.x + 16, cat.rect.y - 12, 0, 0);
  step(game, 1);
  assert.equal(ball.fadeFrames, 0, 'one rest after a flight does not kill');
});

test('9-2: the Balance angle sign is +1 when the right pan offset is >= 0 (left -1, right 0 -> atan2(1, 450) = 0.1273 deg)', () => {
  const game = load('stage_seesaw01', 2);
  const balance = game.nativeBalances[0];
  // No riders: both pans head for 0 at 0.2 per tick; start the left pan 1.2 down so it is at -1.0 after this tick.
  balance.left.offset = -1.2;
  balance.right.offset = 0;
  game.updateNativeBalances();
  assert.ok(close(balance.left.offset, -1, 1e-9) && balance.right.offset === 0, `pans ${balance.left.offset} / ${balance.right.offset}`);
  assert.ok(close(balance.angle, Math.atan2(1, 450), 1e-12), `angle ${balance.angle * 180 / Math.PI} deg`);
});

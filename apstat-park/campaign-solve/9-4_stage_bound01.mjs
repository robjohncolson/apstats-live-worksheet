// 9-4 BALL PARK (stage_bound01).
// The puzzle: a BoundBallPitcher on the right ledge fires one bouncing ball at a time (party 2: 3.16 px/tick left,
// gravity 0.65/tick). The ball dies on any floor / ledge TOP face (or after resting on a head), and the pitcher re-fires.
// Cats keep it up by jumping into it from below: the mass impact off a cat (ball 50, cat 100, e 1.2) returns
// ((50 - 120) u1 + 220 u2) / 150, so a rising cat sends it up harder than it came down. The ball must come down onto the
// BallBox's top sensor (centre x 59..69) to break the box; the Key then appears at (64,641) and goes to the Goal.
//
// Route (party 2):
//   1. Both cats walk right under the pitcher's drop point (cat 1 ahead) and wait for a freshly launched ball.
//   2. Rally: after every cat contact the planner below enumerates every hit it can still make -- which cat, where it
//      stands (3 px walk steps), the tick it jumps, how long it holds jump -- and runs the cloned ball rules forward
//      for each one. It picks a hit whose arc lands on the BallBox sensor if one exists, and otherwise the hit after
//      which some cat can still reach the ball's next descent with the most spare ticks, preferring arcs that drift
//      toward the box. The cats take turns as the geometry allows (a cat can't walk through its partner).
//   3. The box breaks, the Key appears at (64,641); a cat walks into it and both cats enter the Goal with UP.
//
// The predictor is a line-for-line clone of the runtime's BoundBall step (GameRuntime.stepBoundBall) plus the cat jump
// state machine (Player.update), so a plan is exact; every tick the real ball is compared with the plan and a
// mismatch forces a replan.

const BALL_R = 12;
const GRAVITY = 0.65;                 // ball, px/tick^2
const EPS = 1.1920928955078125e-7;    // native float epsilon (settle test)
const MIN_NORMAL = 1.2;               // normal speed under this -> 0
const BALL_MASS = 50;
const CAT_MASS = 100;
const BODY_MASS = 1;
const RESTITUTION = 1.2;              // party < 5
const SETTLE_LIMIT = 2;               // party <= 4
const FRICTION = 0.95;
const SENSOR = { x: -4, y: -66, width: 8, height: 10 };   // BallBox top sensor, from the box point
const SENSOR_REACH = 5;

const DT = 1 / 60;
const CAT_W = 32;
const CAT_H = 46;
const CAT_GRAVITY = 0.65 * 3600;      // px/s^2
const JUMP_SPEED = -306;              // px/s (charge 1)
const WALK = 3;                       // px/tick
const FLOOR_Y = 672;
const STAND_Y = FLOOR_Y - CAT_H - 0.07;   // where a landing cat comes to rest (tile separation)

const HOLDS = [1, 4, 8, 14];          // jump-button hold lengths the planner tries
const ZONE_TOP = 520;                 // a descending ball below this is inside jump reach
const AIM_X = 180;                    // descents near here set up the last arc onto the BallBox

// ---------------------------------------------------------------------------------------------------------------------
// World snapshot: solid chips, the static bodies the ball can hit, the BallBox sensor.

function readWorld(game) {
  const tileMap = game.tileMap;
  const chip = tileMap.map.chipSize;
  const cannon = game.nativeCannons[0];
  const box = game.nativeKeyBoxes[0];
  const statics = game.staticRects
    .filter((s) => s !== cannon.body)
    .map((s) => ({ rect: { ...s.rect }, vx: 0, vy: 0, mass: BODY_MASS, settles: s === box.body }));
  const sensor = { x: box.x + SENSOR.x, y: box.y + SENSOR.y, width: SENSOR.width, height: SENSOR.height };
  return { chip, solid: (tx, ty) => tileMap.isSolidTile(tx, ty), statics, sensor, boxX: box.x };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ball rules (clone of GameRuntime.stepBoundBall and its helpers).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function circleRectContact(x, y, r, rect) {
  const px = clamp(x, rect.x, rect.x + rect.width);
  const py = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - px;
  const dy = y - py;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    if (dist >= r) return undefined;
    return { nx: dx / dist, ny: dy / dist, depth: r - dist };
  }
  const faces = [
    { d: x - rect.x, nx: -1, ny: 0 },
    { d: rect.x + rect.width - x, nx: 1, ny: 0 },
    { d: y - rect.y, nx: 0, ny: -1 },
    { d: rect.y + rect.height - y, nx: 0, ny: 1 },
  ];
  const face = faces.reduce((best, f) => (f.d < best.d ? f : best));
  return { nx: face.nx, ny: face.ny, depth: face.d + r };
}

function deepestTile(world, x, y) {
  const size = world.chip;
  let deepest;
  for (let ty = Math.floor((y - BALL_R) / size); ty <= Math.floor((y + BALL_R) / size); ty++) {
    for (let tx = Math.floor((x - BALL_R) / size); tx <= Math.floor((x + BALL_R) / size); tx++) {
      if (!world.solid(tx, ty)) continue;
      const c = circleRectContact(x, y, BALL_R, { x: tx * size, y: ty * size, width: size, height: size });
      if (c && (!deepest || c.depth > deepest.depth)) deepest = c;
    }
  }
  return deepest;
}

function restoreEnergy(ball, prevY, prevVy) {
  const sq = prevVy * prevVy + 2 * GRAVITY * (ball.y - prevY);
  ball.vy = Math.sign(ball.vy) * Math.sqrt(Math.max(0, sq));
}

function reflectOffMap(ball, nx, ny) {
  const normal = ball.vx * nx + ball.vy * ny;
  if (normal >= 0) return;
  const reflected = Math.abs(normal) < MIN_NORMAL ? 0 : -normal;
  ball.vx += (reflected - normal) * nx;
  ball.vy += (reflected - normal) * ny;
}

function bounceOffBody(ball, nx, ny, body) {
  const u1 = ball.vx * nx + ball.vy * ny;
  const u2 = body.vx * nx + body.vy * ny;
  if (u1 - u2 >= 0) return false;
  let after = ((BALL_MASS - RESTITUTION * body.mass) * u1 + (RESTITUTION + 1) * body.mass * u2) / (BALL_MASS + body.mass);
  if (Math.abs(after) < MIN_NORMAL) after = 0;
  ball.vx += (after - u1) * nx;
  ball.vy += (after - u1) * ny;
  return true;
}

function sensorHit(world, ball) {
  if (!circleRectContact(ball.x, ball.y, BALL_R, world.sensor)) return false;
  return Math.abs(ball.x - world.boxX) <= SENSOR_REACH;
}

// One tick of the ball. cats: [{ rect, vx, vy }] (px/tick) as they stand before this tick.
// Returns 'sensor', 'dead', or undefined; ball.touched lists the cat indices it bounced off this tick.
function stepBall(world, ball, cats) {
  ball.touched = [];
  if (ball.settle > 0 && ball.settle >= SETTLE_LIMIT && Math.abs(ball.vy) <= EPS) return 'dead';
  const prevY = ball.y;
  const prevVy = ball.vy;
  ball.vy += GRAVITY;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) / 4));
  const bodies = [
    ...cats.map((c) => ({ rect: c.rect, vx: c.vx, vy: c.vy, mass: CAT_MASS, settles: true })),
    ...world.statics,
  ];
  let resting = false;
  for (let s = 0; s < steps; s++) {
    ball.x += ball.vx / steps;
    ball.y += ball.vy / steps;
    if (sensorHit(world, ball)) return 'sensor';
    const tile = deepestTile(world, ball.x, ball.y);
    if (tile) {
      ball.x += tile.nx * tile.depth;
      ball.y += tile.ny * tile.depth;
      restoreEnergy(ball, prevY, prevVy);
      if (tile.ny === -1) return 'dead';
      reflectOffMap(ball, tile.nx, tile.ny);
    }
    bodies.forEach((body, i) => {
      const c = circleRectContact(ball.x, ball.y, BALL_R, body.rect);
      if (!c) return;
      ball.x += c.nx * c.depth;
      ball.y += c.ny * c.depth;
      restoreEnergy(ball, prevY, prevVy);
      bounceOffBody(ball, c.nx, c.ny, body);
      if (i < cats.length) ball.touched.push(i);
      if (body.settles && Math.abs(ball.vy) <= EPS) ball.settle += 1;
      if (c.ny < -0.5) resting = true;
    });
  }
  if (resting) {
    ball.grounded += 1;
    if (ball.grounded >= 2) ball.vx *= FRICTION;
  } else {
    ball.grounded = 0;
  }
  return undefined;
}

function readBall(game) {
  const b = game.nativeCannons[0].ball;
  if (!b || b.gone || b.fadeFrames > 0 || b.delaySeconds > 0) return undefined;
  return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, settle: b.settleCount, grounded: b.groundedFrames };
}

// ---------------------------------------------------------------------------------------------------------------------
// Cat motion (clone of Player.update for the moves this solver uses: walk, stand, a vertical jump with a held ramp).
// A track is the list of cat states the ball will see: track[i] = the cat before tick i (track[0] = now).

function catState(cat) {
  return { x: cat.rect.x, y: cat.rect.y, vx: cat.velocity.x, vy: cat.velocity.y, grounded: !!cat.grounded, phase: 0 };
}

// One cat tick. walk: -1/0/1; press: jump pressed this tick; held: jump button down.
function stepCat(s, walk, press, held) {
  const n = { ...s };
  n.vx = walk * WALK * 60;
  if (!s.grounded) n.vy = s.vy + CAT_GRAVITY * DT;
  if (press && s.grounded) {
    n.vy = JUMP_SPEED;
    n.grounded = false;
    n.phase = 1;
    n.vx = 0;
  } else if (held && s.phase >= 1 && s.phase <= 13) {
    n.vy += JUMP_SPEED * (1 - s.phase / 14) * 0.2;
    n.phase = s.phase + 1;
  } else {
    n.phase = 0;
  }
  n.x = s.x + n.vx * DT;
  n.y = s.y + n.vy * DT;
  if (!n.grounded && n.vy > 0 && n.y >= STAND_Y - 0.6) {
    n.y = Math.min(n.y, STAND_Y);
    n.vy = 0;
    n.grounded = true;
  }
  if (n.grounded && !press) n.vy = 0;
  return n;
}

// A cat that follows a plan: walk `walkTicks` ticks in `dir` (from now), jump at tick `jumpAt` holding `hold` ticks.
function buildTrack(start, length, { dir = 0, walkTicks = 0, jumpAt = -1, hold = 0 } = {}) {
  const track = [start];
  let s = start;
  for (let i = 0; i < length; i++) {
    const walk = i < walkTicks ? dir : 0;
    const press = i === jumpAt;
    const held = jumpAt >= 0 && i >= jumpAt && i < jumpAt + hold;
    s = stepCat(s, walk, press, held);
    track.push(s);
  }
  return track;
}

const asBody = (s) => ({ rect: { x: s.x, y: s.y, width: CAT_W, height: CAT_H }, vx: s.vx / 60, vy: s.vy / 60 });
const landTick = (track) => track.findIndex((s, i) => i > 0 && s.grounded && !track[i - 1].grounded);

// ---------------------------------------------------------------------------------------------------------------------
// Planner.

// Run the ball against the given cat tracks for up to `length` ticks. Returns the ball path and how it ended.
function runBall(world, ball, tracks, length) {
  const b = { ...ball };
  const path = [{ ...b }];
  for (let t = 0; t < length; t++) {
    const cats = tracks.map((tr) => asBody(tr[Math.min(t, tr.length - 1)]));
    const end = stepBall(world, b, cats);
    path.push({ ...b, touched: b.touched });
    if (end) return { path, end, at: t + 1 };
  }
  return { path, end: undefined, at: length };
}

// Spare ticks some cat has to get under the ball's next descent (path[from..to]; higher = easier). tracks = the cat
// tracks after the hit (a cat's last entry is where it rests).
function nextReachMargin(path, from, to, tracks) {
  let best = -Infinity;
  for (let t = from; t <= to; t++) {
    const p = path[t];
    if (p.vy <= 0 || p.y < 540 || p.y > 615) continue;
    tracks.forEach((track, q) => {
      const land = Math.max(0, landTick(track));
      const rest = track[track.length - 1];
      const cx = rest.x + CAT_W / 2;
      // The partner standing between the cat and the ball blocks the walk.
      const o = tracks[1 - q][tracks[1 - q].length - 1];
      const ox = o.x + CAT_W / 2;
      const partnerInTheWay = Math.sign(ox - cx) === Math.sign(p.x - cx) && Math.abs(ox - cx) < Math.abs(p.x - cx);
      if (partnerInTheWay) return;
      const walk = Math.max(0, Math.abs(p.x - cx) - 10) / WALK;
      const rise = Math.max(0, 614 - p.y) / 5 + 1;
      best = Math.max(best, t - rise - walk - land - 2);
    });
  }
  return best;
}

// Every hit the cats can still make on this ball; the best one (a sensor hit wins outright), or undefined.
function planHit(world, ball, catsNow) {
  const LOOK = 220;
  const idle = catsNow.map((s) => buildTrack(s, LOOK));
  const free = runBall(world, ball, idle, LOOK);
  // The ticks where the ball is inside jump reach on its way down (before it dies or first touches a cat).
  let firstTouch = free.path.findIndex((p, i) => i > 0 && p.touched?.length);
  if (firstTouch < 0) firstTouch = free.path.length - 1;
  const zone = [];
  for (let t = 1; t <= firstTouch; t++) if (free.path[t].vy > 0 && free.path[t].y >= ZONE_TOP) zone.push(t);
  if (!zone.length) return undefined;
  const xs = zone.map((t) => free.path[t].x);
  const zoneLo = Math.min(...xs) - CAT_W - BALL_R - 2;
  const zoneHi = Math.max(...xs) + BALL_R + 2;
  const tLast = zone[zone.length - 1];

  let best;
  for (let c = 0; c < catsNow.length; c++) {
    const me = catsNow[c];
    const partner = idle[1 - c];
    const partnerX = partner[partner.length - 1].x;
    const fall = idle[c];
    const ready = me.grounded ? 0 : landTick(fall);
    if (ready < 0) continue;
    for (let k = -80; k <= 80; k++) {
      const standX = me.x + WALK * k;
      if (standX < zoneLo || standX > zoneHi) continue;
      // Never walk into (or through) the partner.
      const lo = Math.min(me.x, standX), hi = Math.max(me.x, standX);
      if (partnerX + CAT_W > lo && partnerX < hi + CAT_W) continue;
      const walkTicks = Math.abs(k);
      for (let jumpAt = Math.max(ready, walkTicks, zone[0] - 24); jumpAt <= tLast; jumpAt++) {
        for (const hold of HOLDS) {
          const plan = { cat: c, dir: Math.sign(k), walkTicks, jumpAt, hold };
          const tracks = catsNow.map((s, i) => (i === c ? buildTrack(s, LOOK, plan) : idle[i]));
          const run = runBall(world, ball, tracks, LOOK);
          const hit = run.path.findIndex((p, i) => i > 0 && p.touched?.length);
          if (run.end === 'sensor') {
            const value = 1e6 - run.at;
            if (!best || value > best.value) best = { ...plan, value, win: true, run, tracks, hitAt: hit };
            continue;
          }
          // The hitter must be the only cat the ball touches first, and not on its way down.
          if (hit < 0 || !run.path[hit].touched.includes(c) || run.path[hit].touched.length > 1) continue;
          if (tracks[c][hit - 1].vy > 0) continue;   // a falling cat is a poor bat
          // The arc after the hit: up to the ball's next touch or its death.
          let arcEnd = run.path.findIndex((p, i) => i > hit && p.touched?.length);
          if (arcEnd < 0) arcEnd = run.path.length - 1;
          const desc = run.path.slice(hit + 1, arcEnd + 1).find((p) => p.vy > 0 && p.y >= 540);
          if (!desc) continue;   // it dies before it is back in reach
          const margin = nextReachMargin(run.path, hit + 1, arcEnd, tracks);
          if (margin < 2) continue;
          // Prefer spare ticks (capped), a ball no faster sideways than a cat can follow, descents closer to the
          // box, then gentler arcs.
          const out = run.path[hit + 1];
          const toward = Math.abs(desc.x - AIM_X);
          const tooFast = Math.max(0, Math.abs(out.vx) - WALK);
          const value = Math.min(margin, 14) * 10 - tooFast * 40 - toward * 0.05 - Math.abs(out.vy) * 0.2;
          if (!best || value > best.value) best = { ...plan, value, win: false, run, tracks, hitAt: hit, margin };
        }
      }
    }
  }
  return best;
}

// Inputs for every cat at plan tick i.
function planInputs(plan, i, party) {
  const specs = [];
  for (let c = 0; c < party; c++) specs[c] = {};
  const spec = {};
  if (i < plan.walkTicks) spec[plan.dir > 0 ? 'right' : 'left'] = true;
  if (i >= plan.jumpAt && i < plan.jumpAt + plan.hold) spec.jump = true;
  specs[plan.cat] = spec;
  return specs;
}

const sameBall = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
  && Math.abs(a.vx - b.vx) < 1e-6 && Math.abs(a.vy - b.vy) < 1e-6;

export default {
  party: 2,
  budget: 12000,
  async solve(stage, api) {
    const { game, cats } = api;
    const world = readWorld(game);
    const box = game.nativeKeyBoxes[0];
    const log = api.log;

    // 1. Under the drop point: cat 1 at x ~1030, cat 0 behind it.
    api.walkTo([0, 1], [880, 1040], { tol: 2, max: 400 });
    const fresh = () => {
      const b = game.nativeCannons[0].ball;
      return b && !b.gone && b.fadeFrames === 0 && b.delaySeconds > 0;
    };
    api.until(fresh, [], 400, 'no fresh ball from the pitcher');

    // 2. Rally until the box breaks.
    let plan;
    let planFrame = 0;
    let misses = 0;
    while (!box.breaking) {
      const ball = readBall(game);
      if (!ball) {
        plan = undefined;
        api.step([]);
        continue;
      }
      if (!plan) {
        plan = planHit(world, ball, cats.map(catState));
        planFrame = api.frame;
        if (!plan) {
          misses += 1;
          if (misses > 6) api.block(`9-4: no reachable hit for the ball at (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)}) v (${ball.vx.toFixed(2)}, ${ball.vy.toFixed(2)})`);
          // Let this ball go; wait for the next one.
          api.until(() => !readBall(game), [], 400, 'ball never ended');
          continue;
        }
        log.push(`f${api.frame} cat ${plan.cat} ${plan.win ? 'WIN' : ''} walk ${plan.dir * plan.walkTicks} jump +${plan.jumpAt} hold ${plan.hold} hit +${plan.hitAt} m ${plan.margin}`);
      }
      const i = api.frame - planFrame;
      api.step(planInputs(plan, i, cats.length));
      const expected = plan.run.path[i + 1];
      if (box.breaking) break;
      const actual = readBall(game);
      // Replan right after the contact, or whenever the real ball leaves the predicted path.
      if (!sameBall(actual, expected)) {
        if (actual && i + 1 < plan.hitAt) log.push(`f${api.frame} diverged before the hit`);
        plan = undefined;
        continue;
      }
      if (i + 1 >= plan.hitAt) plan = undefined;
    }

    // 3. Key -> Goal.
    api.until(() => game.keys.length > 0 && !game.nativeKeyBoxes.includes(box), [], 120, 'box never finished breaking');
    const keyX = game.keys[0].rect ? game.keys[0].rect.x + game.keys[0].rect.width / 2 : 64;
    const nearest = Math.abs(api.centreX(cats[0]) - keyX) < Math.abs(api.centreX(cats[1]) - keyX) ? 0 : 1;
    api.until(() => api.carrierOfKey() >= 0, () => {
      const specs = [{}, {}];
      const dx = keyX - api.centreX(cats[nearest]);
      specs[nearest] = Math.abs(dx) < 2 ? { jump: true } : dx > 0 ? { right: true } : { left: true };
      return specs;
    }, 600, 'could not pick up the key');
    api.enterGoal({ max: 1500 });
  },
};

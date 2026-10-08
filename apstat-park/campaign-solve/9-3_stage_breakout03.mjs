// 9-3 BALL PARK (stage_breakout03).
// The puzzle: Breakout. Every cat wears a dome paddle (circle r 25, 34 above its feet); 8 balls hang at (96 + 72k, 264)
// (P1 owns ball 0, P2 owns balls 1..7). A ball breaks any brick in one hit and is lost when it lands on the top face of
// a non-brick tile (the WAR floor under the BR1/BR4 floor row). The plain Key sits in a BR2 cage between two brick walls.
//
// Route (party 2):
//   1. Cat 0 parks against the left wall; cat 1 jumps straight up under ball 7 (same centre x) -> a vertical launch.
//   2. Brick phase: cat 1 is the paddle. After every paddle contact a planner tries every reachable standing spot,
//      runs the cloned-rule ball stepper below for the next catch and the flight after it, and picks the spot whose
//      flight breaks the most "door" bricks (row 7 of wall 1, both cage sides, row 7 of wall 2) without touching the
//      floor row or a hanging ball, and from which a chain of LOOKAHEAD further catches still exists.
//   3. When every door brick is gone the ball is let go (rows 1..7 are open by then, so a floor hole is a hop).
//   4. Cat 1 walks the row-7 tunnel into the cage, takes the key, and both cats walk to the Goal and enter with UP.
const CHIP = 48;
const BALL_R = 12;
const BALL_D = 24;
const PADDLE_R = 25;
const EPS2 = 1.1920928955078125e-7;
const TILE_SEP = 0.01;
const FLOOR_ROW = 8;
const CAT_W = 32;
const WALK = 3;

// The bricks the cats must walk through (row 7 = cat height on the floor row).
const DOOR_BRICKS = [[14, 7], [15, 7], [16, 7], [17, 7], [21, 7], [24, 7], [28, 7], [29, 7], [30, 7], [31, 7]];
const isDoor = (tx, ty) => DOOR_BRICKS.some(([x, y]) => x === tx && y === ty);

// ---------------------------------------------------------------------------------------------------------------------
// Cloned-rule ball stepper (BreakoutBall.ts / FUN_7ff72bae64f0 rules): AABB sweep against chips, one-hit bricks, top-face
// loss, and the mass-100 paddle response (dome first, then the cat box).
const f = Math.fround;
const isBrickChip = (c) => c >= 30 && c <= 34;

// chips: 0 empty, 1 solid, 2 solid but never a loss (BLK / BW*), 30..34 bricks.
function snapshotWorld(game) {
  const tm = game.tileMap;
  const w = tm.map.width, h = tm.map.height;
  const chips = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const name = tm.chipAt(x, y);
      const brick = /^MC_BR(\d)$/.exec(name);
      if (brick) chips[y * w + x] = 29 + Number(brick[1]);
      else if (!tm.isSolidTile(x, y)) chips[y * w + x] = 0;
      else chips[y * w + x] = name === 'MC_BLK' || /^MC_BW[LCR]$/.test(name) ? 2 : 1;
    }
  }
  return { w, h, chips };
}
const cloneWorld = (world) => ({ w: world.w, h: world.h, chips: world.chips.slice() });
function chipAt(world, tx, ty) {
  const x = Math.max(0, Math.min(world.w - 1, tx));
  const y = Math.max(0, Math.min(world.h - 1, ty));
  return world.chips[y * world.w + x];
}
const tileIndex = (p) => Math.trunc(f(p / CHIP));

function axisTimes(start, size, tileStart, tileSize, move) {
  const end = f(start + size), tileEnd = f(tileStart + tileSize);
  if (move > 0) return { entry: f(f(tileStart - end) / move), exit: f(f(tileEnd - start) / move) };
  if (move < 0) return { entry: f(f(tileEnd - start) / move), exit: f(f(tileStart - end) / move) };
  if (end < tileStart || start >= tileEnd) return undefined;
  return { entry: -Infinity, exit: Infinity };
}
function sweptTileHit(rect, move, tx, ty) {
  const xt = axisTimes(rect.x, BALL_D, tx * CHIP, CHIP, move.x);
  const yt = axisTimes(rect.y, BALL_D, ty * CHIP, CHIP, move.y);
  if (!xt || !yt) return undefined;
  const entry = f(Math.max(xt.entry, yt.entry)), exit = f(Math.min(xt.exit, yt.exit));
  if (entry > exit || entry < 0 || entry > 1 || (xt.entry < 0 && yt.entry < 0)) return undefined;
  const normal = xt.entry > yt.entry ? { x: Math.sign(move.x), y: 0 } : { x: 0, y: Math.sign(move.y) };
  if (normal.x === 0 && normal.y === 0) return undefined;
  return { time: entry, normal };
}
function firstTileHit(world, rect, move) {
  if (move.x === 0 && move.y === 0) return undefined;
  const ex = f(rect.x + move.x), ey = f(rect.y + move.y);
  const x0 = tileIndex(Math.min(rect.x, ex)), y0 = tileIndex(Math.min(rect.y, ey));
  const x1 = tileIndex(Math.max(f(rect.x + BALL_D), f(ex + BALL_D)));
  const y1 = tileIndex(Math.max(f(rect.y + BALL_D), f(ey + BALL_D)));
  let best;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (chipAt(world, tx, ty) === 0) continue;
      const hit = sweptTileHit(rect, move, tx, ty);
      if (!hit) continue;
      const earlier = !best || hit.time < best.time;
      const verticalTie = best && hit.time === best.time && hit.normal.y !== 0 && best.normal.y === 0;
      if (earlier || verticalTie) best = hit;
    }
  }
  return best;
}
function sweepBall(world, start, movement) {
  const rect = { ...start };
  let rest = { ...movement };
  const normals = [];
  for (let pass = 0; pass < 2; pass++) {
    const hit = firstTileHit(world, rect, rest);
    if (!hit) {
      rect.x = f(rect.x + rest.x);
      rect.y = f(rect.y + rest.y);
      break;
    }
    rect.x = f(rect.x + f(rest.x * hit.time) - f(hit.normal.x * TILE_SEP));
    rect.y = f(rect.y + f(rest.y * hit.time) - f(hit.normal.y * TILE_SEP));
    if (!normals.some((n) => n.x === hit.normal.x && n.y === hit.normal.y)) normals.push(hit.normal);
    const k = f(1 - hit.time);
    const after = { x: f(rest.x * k), y: f(rest.y * k) };
    const blocked = f(f(after.x * hit.normal.x) + f(after.y * hit.normal.y));
    rest = { x: f(after.x - f(blocked * hit.normal.x)), y: f(after.y - f(blocked * hit.normal.y)) };
    if (rest.x === 0 && rest.y === 0) break;
  }
  return { rect, normals };
}
function leadingTile(world, rect, n) {
  if (n.x !== 0) {
    const tx = tileIndex(n.x > 0 ? rect.x + BALL_D + 0.5 : rect.x - 0.5);
    for (let ty = tileIndex(rect.y); ty <= tileIndex(rect.y + BALL_D); ty++) if (chipAt(world, tx, ty) !== 0) return { tx, ty };
    return undefined;
  }
  const ty = tileIndex(n.y > 0 ? rect.y + BALL_D + 0.5 : rect.y - 0.5);
  for (let tx = tileIndex(rect.x); tx <= tileIndex(rect.x + BALL_D); tx++) if (chipAt(world, tx, ty) !== 0) return { tx, ty };
  return undefined;
}
function setHeading(ball, vx, vy) {
  const length = Math.hypot(vx, vy);
  const speed = f(4 * ball.scale);
  ball.vx = f((vx / length) * speed);
  ball.vy = f((vy / length) * speed);
}
function reflectHeading(ball, n) {
  const p = f(f(ball.vx * n.x) + f(ball.vy * n.y));
  const twice = f(p + p);
  const rx = f(ball.vx - f(twice * n.x)), ry = f(ball.vy - f(twice * n.y));
  if (f(f(rx * rx) + f(ry * ry)) <= EPS2) return setHeading(ball, f(-n.x), f(-n.y + 0.05));
  ball.vx = rx;
  ball.vy = ry;
}

// One fixed ball tick. Breaks bricks in `world`; returns [{ type: 'brick' | 'loss' | 'wall', tx, ty }].
function ballTick(world, ball) {
  ball.startX = ball.x;
  ball.startY = ball.y;
  if (ball.vx === 0 && ball.vy === 0) return [];
  setHeading(ball, ball.vx, ball.vy);
  const { rect, normals } = sweepBall(world, { x: ball.x, y: ball.y }, { x: ball.vx, y: ball.vy });
  ball.x = f(rect.x);
  ball.y = f(rect.y);
  const events = [];
  for (const n of normals) {
    const tile = leadingTile(world, ball, n);
    if (!tile) continue;
    const chip = chipAt(world, tile.tx, tile.ty);
    if (isBrickChip(chip)) {
      world.chips[tile.ty * world.w + tile.tx] = 0;
      events.push({ type: 'brick', ...tile });
    } else if (n.y === 1 && chip !== 2) {
      events.push({ type: 'loss', ...tile });
    } else {
      events.push({ type: 'wall', ...tile });
    }
    reflectHeading(ball, n);
  }
  return events;
}

// The mass-100 response: v_n' = 2(d.n) - v.n against the dome (radial normal), else against the cat box.
function heavyContact(ball, n, ballMove, catMove) {
  const bn = f(f(ballMove.x * n.x) + f(ballMove.y * n.y));
  const cn = f(f(catMove.x * n.x) + f(catMove.y * n.y));
  const approaching = f(bn * cn) <= 0 ? bn >= 0 : cn <= bn;
  if (!approaching) return false;
  const replaced = f(f(f(200 * cn) + f(-100 * bn)) / 100);
  let vx = f(f(ballMove.x - f(bn * n.x)) + f(replaced * n.x));
  let vy = f(f(ballMove.y - f(bn * n.y)) + f(replaced * n.y));
  if (f(f(vx * vx) + f(vy * vy)) <= EPS2) { vx = f(-n.x); vy = f(-n.y + 0.05); }
  if (Math.hypot(vx, vy) === 0) return false;
  setHeading(ball, vx, vy);
  return true;
}
function catBoxNormal(ball, prevCat, cat) {
  const H = 46;
  const b = ball, pb = { x: ball.startX, y: ball.startY };
  if (!(b.x < cat.x + CAT_W && b.x + BALL_D > cat.x && b.y < cat.y + H && b.y + BALL_D > cat.y)) return undefined;
  const mx = cat.x - prevCat.x - (b.x - pb.x), my = cat.y - prevCat.y - (b.y - pb.y);
  const entries = [];
  if (mx > 0 && prevCat.x + CAT_W <= pb.x && prevCat.x + CAT_W + mx > pb.x) entries.push({ t: (pb.x - prevCat.x - CAT_W) / mx, n: { x: -1, y: 0 } });
  else if (mx < 0 && prevCat.x >= pb.x + BALL_D && prevCat.x + mx < pb.x + BALL_D) entries.push({ t: (pb.x + BALL_D - prevCat.x) / mx, n: { x: 1, y: 0 } });
  if (my > 0 && prevCat.y + H <= pb.y && prevCat.y + H + my > pb.y) entries.push({ t: (pb.y - prevCat.y - H) / my, n: { x: 0, y: -1 } });
  else if (my < 0 && prevCat.y >= pb.y + BALL_D && prevCat.y + my < pb.y + BALL_D) entries.push({ t: (pb.y + BALL_D - prevCat.y) / my, n: { x: 0, y: 1 } });
  const swept = entries.filter((e) => e.t >= 0 && e.t <= 1).reduce((a, e) => (!a || e.t > a.t ? e : a), undefined);
  if (swept) return swept.n;
  const depths = [
    { d: cat.x + CAT_W - b.x, n: { x: -1, y: 0 } }, { d: b.x + BALL_D - cat.x, n: { x: 1, y: 0 } },
    { d: cat.y + H - b.y, n: { x: 0, y: -1 } }, { d: b.y + BALL_D - cat.y, n: { x: 0, y: 1 } }];
  return depths.reduce((a, e) => (e.d < a.d ? e : a)).n;
}
function paddleContact(ball, prevCat, cat) {
  if (ball.vx === 0 && ball.vy === 0 && ball.startX === undefined) return false;
  const ballMove = { x: f(ball.x - ball.startX), y: f(ball.y - ball.startY) };
  const catMove = { x: f(cat.x - prevCat.x), y: f(cat.y - prevCat.y) };
  const dx = cat.x + 16 - (ball.x + BALL_R), dy = cat.y + 13 - (ball.y + BALL_R);
  const dist = Math.hypot(dx, dy);
  if (dist !== 0 && dist < PADDLE_R + BALL_R && heavyContact(ball, { x: dx / dist, y: dy / dist }, ballMove, catMove)) return true;
  const n = catBoxNormal(ball, prevCat, cat);
  return !!n && heavyContact(ball, n, ballMove, catMove);
}

// ---------------------------------------------------------------------------------------------------------------------
// Planner.
const HORIZON = 1500;

// Fly the ball with the paddle cat walking to targetX (and staying). Stops at the first floor-row hit, a loss, a
// hanging-ball touch, or the horizon. Records paddle catches, broken bricks and the state right after the last catch.
function simulate(world0, ball0, hanging, cats0, paddle, targetX, { horizon = HORIZON, stopAtCatch = false } = {}) {
  const world = cloneWorld(world0);
  const ball = { ...ball0 };
  const cats = cats0.map((c) => ({ ...c }));
  const out = { firstCatch: -1, lastCatch: -1, end: 'horizon', endT: horizon, endX: 0, broken: [], after: null };
  for (let t = 0; t < horizon; t++) {
    const events = ballTick(world, ball);
    for (const e of events) {
      if (e.type === 'brick' && e.ty !== FLOOR_ROW) out.broken.push([e.tx, e.ty, t]);
      if (e.type === 'loss' || (e.type === 'brick' && e.ty === FLOOR_ROW)) {
        return { ...out, end: 'floor', endT: t, endX: ball.x + BALL_R, endTile: [e.tx, e.ty] };
      }
    }
    if (hanging.some((h) => Math.hypot(h.cx - (ball.x + BALL_R), h.cy - (ball.y + BALL_R)) < BALL_D)) {
      return { ...out, end: 'hanging', endT: t };
    }
    let caught = false;
    for (let i = 0; i < cats.length; i++) {
      const prev = { ...cats[i] };
      if (i === paddle && cats[i].x !== targetX) {
        const dx = targetX - cats[i].x;
        cats[i].x += Math.abs(dx) <= WALK ? dx : Math.sign(dx) * WALK;
      }
      if (paddleContact(ball, prev, cats[i]) && i === paddle) caught = true;
    }
    if (caught) {
      if (out.firstCatch < 0) out.firstCatch = t;
      out.lastCatch = t;
      if (stopAtCatch) return out;
      out.after = { world: cloneWorld(world), ball: { ...ball }, cats: cats.map((c) => ({ ...c })) };
    }
  }
  return out;
}

// The floor span (cat rect x range) the paddle can walk on from its column: row 7 open, floor row intact.
function walkSpan(world, catX, blockers) {
  const col = Math.floor((catX + CAT_W / 2) / CHIP);
  const open = (c) => chipAt(world, c, 7) === 0 && chipAt(world, c, FLOOR_ROW) !== 0 && c > 0 && c < world.w - 1;
  let lo = col, hi = col;
  while (open(lo - 1)) lo--;
  while (open(hi + 1)) hi++;
  let min = lo * CHIP, max = (hi + 1) * CHIP - CAT_W;
  for (const b of blockers) {
    if (b.x + CAT_W <= catX) min = Math.max(min, b.x + CAT_W);
    else max = Math.min(max, b.x - CAT_W);
  }
  return { min, max };
}
// Every standing spot the paddle can walk to (3-unit grid through its current x).
function spots(world, cats, paddle) {
  const cat = cats[paddle];
  const span = walkSpan(world, cat.x, cats.filter((_, i) => i !== paddle));
  const list = [];
  for (let x = cat.x - WALK * Math.floor((cat.x - span.min) / WALK); x <= span.max; x += WALK) list.push(x);
  return list;
}

function brickValue(tx, ty) {
  if (isDoor(tx, ty)) return 100;
  if (ty === 6 && DOOR_BRICKS.some(([x]) => x === tx)) return 10;
  return 1;
}

// Spots that can possibly meet the ball: where its free flight (paddle standing still out of reach) passes low
// enough for the dome, and that the paddle can walk to in time.
function catchableSpots(world, ball, hanging, cats, paddle) {
  const lowPoints = [];
  const probe = cloneWorld(world);
  const b = { ...ball };
  for (let t = 0; t < HORIZON; t++) {
    const events = ballTick(probe, b);
    if (b.y + BALL_R >= 290) lowPoints.push({ t, cx: b.x + BALL_R });
    if (events.some((e) => e.type === 'loss' || (e.type === 'brick' && e.ty === FLOOR_ROW))) break;
    if (hanging.some((h) => Math.hypot(h.cx - (b.x + BALL_R), h.cy - (b.y + BALL_R)) < BALL_D)) break;
  }
  const from = cats[paddle].x;
  return spots(world, cats, paddle).filter((x) => lowPoints.some((p) =>
    Math.abs(x + CAT_W / 2 - p.cx) <= 45 && Math.abs(x - from) <= WALK * p.t + WALK));
}

// Can the paddle keep catching the ball for `depth` more catches from this state?
function viable(state, hanging, paddle, depth) {
  if (depth === 0) return true;
  for (const x of catchableSpots(state.world, state.ball, hanging, state.cats, paddle)) {
    const run = simulate(state.world, state.ball, hanging, state.cats, paddle, x);
    if (run.firstCatch < 0 || run.end === 'hanging') continue;
    if (viable(run.after, hanging, paddle, depth - 1)) return true;
  }
  return false;
}

// Pick the paddle's standing spot for its next catch: most door bricks, and the ball must stay catchable afterwards.
function chooseSpot(world, ball, hanging, cats, paddle, depth = 3) {
  const cat = cats[paddle];
  const runs = [];
  for (const x of catchableSpots(world, ball, hanging, cats, paddle)) {
    const run = simulate(world, ball, hanging, cats, paddle, x);
    if (run.firstCatch < 0 || run.end === 'hanging') continue;
    const score = run.broken.reduce((s, [tx, ty]) => s + brickValue(tx, ty), 0);
    runs.push({ x, run, score, walk: Math.abs(x - cat.x) });
  }
  runs.sort((a, b) => b.score - a.score || a.walk - b.walk);
  const safe = runs.find((c) => viable(c.run.after, hanging, paddle, depth - 1));
  if (safe) return { ...safe, ok: true };
  // Nothing keeps the ball alive that far: take the longest flight.
  runs.sort((a, b) => b.run.endT - a.run.endT || a.walk - b.walk);
  return runs[0] && { ...runs[0], ok: false };
}

// ---------------------------------------------------------------------------------------------------------------------
function liveBall(ball) {
  return { x: ball.rect.x, y: ball.rect.y, vx: ball.velocity.x, vy: ball.velocity.y, scale: ball.speedMultiplier ?? 1 };
}
function hangingBalls(game, active) {
  return game.breakoutBalls.filter((b) => b !== active && b.velocity.x === 0 && b.velocity.y === 0 && !b.lossCountdownTicks)
    .map((b) => ({ cx: b.center.x, cy: b.center.y }));
}
const doorsOpen = (world) => DOOR_BRICKS.every(([x, y]) => chipAt(world, x, y) === 0);

const PADDLE = 1;          // cat 1 plays the paddle; cat 0 parks against the left wall
const ACTIVE_BALL = 7;     // ball 7 (x 600) hangs last in the row: deflections toward wall 1 miss the other hanging balls
const LOOKAHEAD = 5;       // catches the planner proves it can still make before it commits to a spot
const KEY_X = 1104;        // the plain Key's centre x (inside the BR2 cage)

export default {
  party: 2,
  budget: 20000,
  async solve(stage, api) {
    const { game, cats } = api;
    api.land();
    // 1. Cat 0 parks against the left wall, out of the paddle's way.
    api.walkTo(0, CHIP + CAT_W / 2, { tol: 2 });
    // Vertical launch: cat 1 stands centred under ball 7 and jumps straight up into it.
    const active = game.breakoutBalls[ACTIVE_BALL];
    api.walkTo(PADDLE, active.center.x, { tol: 0 });
    if (api.centreX(cats[PADDLE]) !== active.center.x) api.block('cat 1 not centred under ball ' + ACTIVE_BALL);
    api.until(() => active.velocity.y !== 0, [{}, { jump: true }], 40, 'ball never launched');
    api.land();

    // 2. Brick phase: after every catch, plan the next standing spot from the live state, walk there, wait for it.
    let catches = 0;
    while (!doorsOpen(snapshotWorld(game))) {
      if (!game.breakoutBalls.includes(active) || active.lossCountdownTicks) {
        api.block('active ball lost after ' + catches + ' catches');
      }
      const catRects = cats.map((c) => ({ x: c.rect.x, y: c.rect.y }));
      const pick = chooseSpot(snapshotWorld(game), liveBall(active), hangingBalls(game, active), catRects, PADDLE, LOOKAHEAD);
      if (!pick) api.block('no spot catches the ball (catch ' + catches + ')');
      api.log.push({ frame: api.frame, x: pick.x, score: pick.score, safe: pick.ok });
      const catchAt = api.frame + pick.run.firstCatch + 1;
      api.until(() => api.frame >= catchAt, () => {
        const dx = pick.x - cats[PADDLE].rect.x;
        return [{}, Math.abs(dx) < 0.5 ? {} : dx > 0 ? { right: true } : { left: true }];
      }, pick.run.firstCatch + 2, 'walk to catch spot');
      catches++;
    }

    // 3. Doors open: let the ball go (everything above the floor row is open, so any floor hole it digs is a
    //    48-deep dip the cats hop out of). Cat 1 takes the key, then both cats walk to the Goal and enter.
    api.walkTo([0, PADDLE], [KEY_X - 60, KEY_X], { hop: true, max: 1500, stall: 200 });
    if (api.carrierOfKey() !== PADDLE) api.block('cat 1 did not pick up the key at x ' + KEY_X);
    api.enterGoal({ max: 1500 });
  },
};

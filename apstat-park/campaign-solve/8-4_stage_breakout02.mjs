// 8-4 RETRO GAME (stage_breakout02).
// The puzzle: breakout. Each cat wears a dome paddle (circle r 25 centred 34 above its feet). Four balls hang at
// y 552 (x 590 owned by cat 0; 690, 498, 782 owned by cat 1); a cat jumps into one to launch it. Balls fly at 4 px/tick
// (8 after the first BR5 hit), reflect off chips, break any brick in one hit and are lost on the floor. 48 bricks
// (rows 4..7, x 448..832) hide the key; when none remain the key appears at (624, 548) and opens the Goal.
//
// Route: cat 0 jumps into ball 0. From then on, every time a ball's heading changes we re-plan with a readable
// cloned-rule stepper (stepBall: the ball rule, axis by axis, on a copy of the chip grid): for each reachable dome
// position (the cat walks 3 px/tick, 6 after the BR5 hit: the 0x22 command reaches the cats too) we find the tick
// the ball first touches the dome, reflect it about the radial normal, fly the rebound forward and score it (bricks broken, no hanging spare struck, next landing reachable).
// The catching cat walks there and stands still; the other cat keeps clear. Lost balls are fine while a spare remains.
// When the last brick breaks the key appears: cat 0 jumps into it and carries it into the Goal (enter with UP).

const CHIP = 32;
const BALL = 24;               // ball AABB (r 12) used by the native map sweep
const CONTACT = 37;            // ball r 12 + dome r 25
const DOME_ABOVE_RECT_Y = 13;  // dome centre = cat rect y + 47 - 34
const CAT_MIN_CX = 464;        // room x 448..832, cat body 32 wide
const CAT_MAX_CX = 816;
const KEEP_CLEAR = 80;         // an idle cat stays this far from the catcher so its own dome never touches the ball
const SAFE_FLOOR = new Set(['MC_BLK', 'MC_BWL', 'MC_BWC', 'MC_BWR']);
const isBrick = (chip) => /^MC_BR[1-5]$/.test(chip);

// --- the chip grid (a copy the predictor may break bricks in) ----------------------------------------------------------
function readGrid(game) {
  const map = game.tileMap;
  const w = map.map.width, h = map.map.height;
  const chip = [], solid = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      chip.push(map.chipAt(tx, ty));
      solid.push(map.isSolidTile(tx, ty));
    }
  }
  return { w, h, chip, solid };
}
const cloneGrid = (grid) => ({ ...grid, chip: [...grid.chip], solid: [...grid.solid] });
const cellIndex = (grid, tx, ty) => Math.max(0, Math.min(grid.h - 1, ty)) * grid.w + Math.max(0, Math.min(grid.w - 1, tx));
const bricksLeft = (grid) => grid.chip.filter(isBrick).length;

// First solid cell under a ball rect at (x, y), scanning rows then columns (the native leading-edge order).
function firstSolidCell(grid, x, y) {
  for (let ty = Math.floor(y / CHIP); ty <= Math.floor((y + BALL - 1e-4) / CHIP); ty++) {
    for (let tx = Math.floor(x / CHIP); tx <= Math.floor((x + BALL - 1e-4) / CHIP); tx++) {
      if (grid.solid[cellIndex(grid, tx, ty)]) return { tx, ty, chip: grid.chip[cellIndex(grid, tx, ty)] };
    }
  }
  return undefined;
}

// A brick hit: the cell empties; a BR5 doubles every ball's speed and turns the other BR5s into BR2.
function breakBrick(grid, ball, cell) {
  if (!isBrick(cell.chip)) return;
  if (cell.chip === 'MC_BR5') {
    ball.scale = 2;
    grid.chip = grid.chip.map((chip) => (chip === 'MC_BR5' ? 'MC_BR2' : chip));
  }
  const i = cellIndex(grid, cell.tx, cell.ty);
  grid.chip[i] = 'MC_NON';
  grid.solid[i] = false;
  ball.broke += 1;
}

// One native tick of the ball rule, axis by axis: move, reflect off the first solid cell, break bricks, and stop as
// lost when it lands on the top face of a non-brick, non-BLK chip. ball = { x, y (rect), vx, vy, scale, broke }.
function stepBall(grid, ball) {
  const speed = 4 * ball.scale;
  const length = Math.hypot(ball.vx, ball.vy);
  ball.vx = (ball.vx / length) * speed;
  ball.vy = (ball.vy / length) * speed;

  const nextX = ball.x + ball.vx;
  const hitX = firstSolidCell(grid, nextX, ball.y);
  if (!hitX) ball.x = nextX;
  else {
    ball.x = ball.vx > 0 ? hitX.tx * CHIP - BALL - 0.01 : (hitX.tx + 1) * CHIP + 0.01;
    ball.vx = -ball.vx;
    breakBrick(grid, ball, hitX);
  }

  const nextY = ball.y + ball.vy;
  const hitY = firstSolidCell(grid, ball.x, nextY);
  if (!hitY) { ball.y = nextY; return; }
  if (ball.vy > 0 && !isBrick(hitY.chip) && !SAFE_FLOOR.has(hitY.chip)) { ball.lost = true; return; }
  ball.y = ball.vy > 0 ? hitY.ty * CHIP - BALL - 0.01 : (hitY.ty + 1) * CHIP + 0.01;
  ball.vy = -ball.vy;
  breakBrick(grid, ball, hitY);
}

const centreOf = (ball) => ({ x: ball.x + BALL / 2, y: ball.y + BALL / 2 });

// The ball's path (centres, per tick) until it is lost on the floor, plus the grid after the bricks it broke on the way.
function flightPath(grid, start, maxTicks = 900) {
  const g = cloneGrid(grid);
  const ball = { ...start, broke: 0 };
  const path = [centreOf(ball)];
  for (let t = 1; t <= maxTicks && !ball.lost; t++) {
    stepBall(g, ball);
    path.push(centreOf(ball));
  }
  return { path, grid: g, scale: ball.scale };
}

// First tick the path touches a dome centred at (px, py) while approaching it; the rebound heading (mirror about
// the radial normal, the cat standing still).
function domeContact(path, px, py) {
  for (let t = 1; t < path.length; t++) {
    const c = path[t];
    const dx = px - c.x, dy = py - c.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance >= CONTACT) continue;
    const n = { x: dx / distance, y: dy / distance };
    const m = { x: c.x - path[t - 1].x, y: c.y - path[t - 1].y };
    const mn = m.x * n.x + m.y * n.y;
    if (mn < 0) continue;
    return { t, centre: c, out: { x: m.x - 2 * mn * n.x, y: m.y - 2 * mn * n.y } };
  }
  return undefined;
}

// --- the solver ------------------------------------------------------------------------------------------------------
export default {
  party: 2,
  budget: 8000,
  async solve(stage, api) {
    const { game, cats } = api;
    const cx = (i) => api.centreX(cats[i]);
    // Walk step per tick: 3, doubled with the balls by the first BR5 hit (runtime Player.moveSpeedMultiplier).
    const walkStep = (i) => 3 * (cats[i].moveSpeedMultiplier ?? 1);
    const live = () => game.breakoutBalls.filter((b) => b.lossCountdownTicks === 0 && !b.removalRequested);
    const moving = () => live().filter((b) => Math.hypot(b.velocity.x, b.velocity.y) > 0);
    const resting = () => live().filter((b) => Math.hypot(b.velocity.x, b.velocity.y) === 0);

    api.wait(5);
    const domeY = cats[0].rect.y + DOME_ABOVE_RECT_Y;   // dome centre y of a standing cat

    // Score one rebound: fly it forward to its next descent past y 600.
    function scoreRebound(grid, contactCentre, out, scale, catcherX, otherX) {
      const g = cloneGrid(grid);
      const ball = { x: contactCentre.x - BALL / 2, y: contactCentre.y - BALL / 2, vx: out.x, vy: out.y, scale, broke: 0 };
      const speed = 4 * scale;
      const spares = resting().map((b) => b.center);
      const brickCentres = [];
      g.chip.forEach((chip, i) => {
        if (isBrick(chip)) brickCentres.push({ x: (i % g.w) * CHIP + 16, y: Math.floor(i / g.w) * CHIP + 16 });
      });
      let struckSpare = false, nearestBrick = Infinity, land;
      for (let t = 1; t <= 700; t++) {
        stepBall(g, ball);
        const c = centreOf(ball);
        if (spares.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < BALL + 2)) struckSpare = true;
        if (ball.broke === 0) {
          for (const b of brickCentres) nearestBrick = Math.min(nearestBrick, Math.hypot(b.x - c.x, b.y - c.y));
        }
        if (ball.lost || (ball.vy > 0 && c.y >= 600)) { land = { x: c.x, t }; break; }
      }
      let score = ball.broke > 0 ? 1000 + 50 * ball.broke : -nearestBrick;
      if (struckSpare) score -= 600;
      if (Math.abs(out.y) / Math.hypot(out.x, out.y) < 0.4) score -= 500;   // too shallow: long, slow flights
      if (!land) return score - 800;
      const walk = Math.min(Math.abs(land.x - catcherX), Math.abs(land.x - otherX)) / walkStep(0);
      if (walk > land.t - 6) score -= 800;
      return score - land.t * 0.5;
    }

    // Best dome position for cat i to return this ball, or undefined. Candidates are the cat's reachable centres
    // (one walk step apart), kept on its own side of the other cat.
    function planCatch(ball, i, grid) {
      const other = 1 - i;
      const start = { x: ball.rect.x, y: ball.rect.y, vx: ball.velocity.x, vy: ball.velocity.y, scale: ball.speedMultiplier };
      const flight = flightPath(grid, start);
      const lo = i < other ? CAT_MIN_CX : CAT_MIN_CX + 36;
      const hi = i < other ? CAT_MAX_CX - 36 : CAT_MAX_CX;
      let best;
      for (let k = -120; k <= 120; k++) {
        const px = cx(i) + walkStep(i) * k;
        if (px < lo || px > hi) continue;
        if ((cx(i) < cx(other)) !== (px < cx(other))) continue;      // never cross the other cat
        const hit = domeContact(flight.path, px, domeY);
        if (!hit || hit.out.y >= 0 || Math.abs(k) > hit.t - 2) continue;
        const score = scoreRebound(flight.grid, hit.centre, hit.out, flight.scale, px, cx(other));
        if (!best || score > best.score) best = { px, t: hit.t, score, ball };
      }
      return best;
    }

    // Who catches what: the most urgent ball first, then the next ball for the other cat.
    function plan() {
      const grid = readGrid(game);
      const targets = [undefined, undefined];
      const balls = moving().map((b) => ({ b, down: b.velocity.y > 0 ? (domeY - b.center.y) / b.velocity.y : 1e9 }))
        .sort((a, b) => a.down - b.down).map((e) => e.b);
      for (const ball of balls) {
        let best;
        for (const i of [0, 1]) {
          if (targets[i]) continue;
          const option = planCatch(ball, i, grid);
          if (option && (!best || option.score > best.option.score)) best = { i, option };
        }
        if (best) targets[best.i] = best.option;
        if (targets[0] && targets[1]) break;
      }
      return targets;
    }

    // Walk toward x (3 px steps; stop when the next step would overshoot).
    const towards = (i, x) => (Math.abs(x - cx(i)) < walkStep(i) / 2 ? {} : x > cx(i) ? { right: true } : { left: true });
    const signature = () => live().map((b) => `${b.velocity.x.toFixed(3)},${b.velocity.y.toFixed(3)}`).join('|');

    // Launch the first ball: cat 0 stands under it and jumps.
    api.hold([{ jump: true }, {}], 14);

    let targets = [undefined, undefined];
    let lastSignature = '';
    while (bricksLeft(readGrid(game)) > 0) {
      if (!live().length) api.block('every ball lost with bricks left (stage restarts)');
      if (!moving().length) {
        // Relaunch from a spare: the nearer cat walks under it and jumps.
        const spare = resting()[0].center;
        const i = Math.abs(cx(0) - spare.x) <= Math.abs(cx(1) - spare.x) ? 0 : 1;
        api.walkTo(1 - i, i === 0 ? CAT_MAX_CX : CAT_MIN_CX, { max: 200, stall: 30 });
        api.walkTo(i, spare.x, { tol: 1.5, max: 300 });
        api.hold(i === 0 ? [{ jump: true }, {}] : [{}, { jump: true }], 14);
        lastSignature = '';
        continue;
      }
      if (signature() !== lastSignature) { targets = plan(); lastSignature = signature(); }
      const specs = [0, 1].map((i) => {
        if (targets[i]) return towards(i, targets[i].px);
        const catcher = targets[1 - i];
        if (!catcher) return {};
        // Idle cat: keep KEEP_CLEAR away from the catcher's spot, on its own side.
        const side = cx(i) < catcher.px ? -1 : 1;
        const wanted = Math.max(CAT_MIN_CX, Math.min(CAT_MAX_CX, catcher.px + side * KEEP_CLEAR));
        return Math.abs(cx(i) - catcher.px) >= KEEP_CLEAR ? {} : towards(i, wanted);
      });
      api.step(specs);
    }
    api.log.push(`bricks cleared at frame ${api.frame}`);

    // The key appears at (624, 548): cat 0 jumps into it, then everyone enters the Goal.
    const key = game.keys[0];
    const keyX = key.rect.x + key.rect.width / 2;
    api.walkTo(1, cx(1) < keyX ? keyX - 90 : keyX + 90, { max: 300 });
    api.walkTo(0, keyX, { tol: 2, max: 300 });
    api.until(() => api.carrierOfKey() >= 0, (f) => [{ jump: f % 40 < 14 }, {}], 200, 'cat 0 could not reach the key');
    api.land();
    api.enterGoal({ max: 1500 });
  },
};

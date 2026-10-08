// 8-2 RETRO GAME (stage_breakout01), party 2.
// The puzzle: Breakout. Each cat wears a dome paddle (circle r 25 centred 34 above its feet). Four balls hang still at
// y 552 (x 590, 690, 498, 782); a cat jumps into one to launch it. Balls (r 12, 4 px/tick) reflect off the walls and
// break any brick (rows 4..6, x 448..832, 36 bricks) in one hit; a ball that lands on the floor is lost. When no brick
// is left the key appears at (624,548): jump for it, carry it into the Goal right below and enter with UP.
//
// Route:
//   1. Launch a hanging ball: stand slightly beside it and jump (the hit offset tilts the launch toward a brick).
//   2. Keep every moving ball in play. Each tick, predict where each ball comes down to dome height (a small
//      tick-stepper that reflects off solid tiles and removes the bricks it touches), send a cat there, and choose the
//      dome offset whose reflection heads for a remaining brick.
//   3. A moving ball can knock a hanging ball loose (ball-ball contact): both are simply tracked.
//   4. If every moving ball is lost and bricks remain, launch the next hanging ball (spare lives).
//   5. Bricks gone: fetch the key, enter the Goal.
const BRICKS = new Set(['MC_BR1', 'MC_BR2', 'MC_BR3', 'MC_BR4', 'MC_BR5']);
const BALL_R = 12;
const CONTACT = 25 + BALL_R;          // dome radius + ball radius
const DOME_BELOW_RECT_TOP = 13;       // dome centre = cat rect top + 47 - 34
const ROOM_LEFT = 448, ROOM_RIGHT = 832;
const CAT_MIN_X = ROOM_LEFT + 16, CAT_MAX_X = ROOM_RIGHT - 16;   // cat centre limits
const CAT_GAP = 36;                   // two cats' centres never closer than this (bodies are 32 wide)
const KEY_X = 640;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const centreX = (cat) => cat.rect.x + cat.rect.width / 2;

// --- reading the game ---------------------------------------------------------------------------------------------
const alive = (ball) => ball.lossCountdownTicks === 0 && !ball.removalRequested;
const isMoving = (ball) => alive(ball) && (ball.velocity.x !== 0 || ball.velocity.y !== 0);
const isHanging = (ball) => alive(ball) && ball.velocity.x === 0 && ball.velocity.y === 0;

function bricksLeft(game) {
  const map = game.tileMap;
  let count = 0;
  for (let ty = 0; ty < map.map.height; ty++) {
    for (let tx = 0; tx < map.map.width; tx++) if (BRICKS.has(map.chipAt(tx, ty))) count++;
  }
  return count;
}

function domeY(cat) {
  return cat.rect.y + DOME_BELOW_RECT_TOP;
}

// --- the predictor --------------------------------------------------------------------------------------------------
// A copy of the ball, stepped one tick at a time: move along x and bounce if the ball box would enter a solid tile, then
// the same along y. Bricks it touches are removed from the copy. The real ball uses a swept test, so this is close, not
// exact; it is re-run every tick.
function makeTracer(game) {
  const map = game.tileMap, chip = map.map.chipSize;
  const broken = new Set();
  const solidCells = (cx, cy) => {
    const x0 = Math.floor((cx - BALL_R) / chip), x1 = Math.floor((cx + BALL_R - 0.01) / chip);
    const y0 = Math.floor((cy - BALL_R) / chip), y1 = Math.floor((cy + BALL_R - 0.01) / chip);
    const cells = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (!broken.has(tx + ',' + ty) && map.isSolidTile(tx, ty)) cells.push([tx, ty]);
    }
    return cells;
  };
  const isBrick = ([tx, ty]) => BRICKS.has(map.chipAt(tx, ty));
  // One tick. Returns the ball state and whether a brick was touched.
  return function tick(b) {
    let brick = false;
    const hx = solidCells(b.x + b.vx, b.y);
    if (hx.length) {
      for (const cell of hx.filter(isBrick)) { broken.add(cell.join(',')); brick = true; }
      b.vx = -b.vx;
    } else b.x += b.vx;
    const hy = solidCells(b.x, b.y + b.vy);
    if (hy.length) {
      for (const cell of hy.filter(isBrick)) { broken.add(cell.join(',')); brick = true; }
      b.vy = -b.vy;
    } else b.y += b.vy;
    return brick;
  };
}

// Where (and in how many ticks) the ball's centre next comes down through yLine, with the velocity it has then.
function predictLanding(game, ball, yLine, maxTicks = 1200) {
  const tick = makeTracer(game);
  const b = { x: ball.center.x, y: ball.center.y, vx: ball.velocity.x, vy: ball.velocity.y };
  if (b.y >= yLine) return null;                       // already below the dome line
  for (let t = 1; t <= maxTicks; t++) {
    const before = b.y;
    tick(b);
    if (b.vy > 0 && before < yLine && b.y >= yLine) return { x: b.x, ticks: t, v: { x: b.vx, y: b.vy } };
  }
  return null;
}

// Does a ball leaving (x, y) with velocity v reach a brick before it starts coming down?
function reachesBrick(game, x, y, v) {
  const tick = makeTracer(game);
  const b = { x, y, vx: v.x, vy: v.y };
  for (let t = 0; t < 400; t++) {
    if (tick(b)) return true;
    if (b.vy > 0) return false;
  }
  return false;
}

// Velocity a still dome gives a ball that meets it with offset dx (ball x - dome x), coming in with velocity v:
// the native heavy-body response with a still paddle is a mirror about the radial normal.
function reflectOffDome(v, dx) {
  const h = Math.sqrt(CONTACT * CONTACT - dx * dx);
  const n = { x: -dx / CONTACT, y: h / CONTACT };       // from the ball toward the dome centre
  const a = v.x * n.x + v.y * n.y;
  return { x: v.x - 2 * a * n.x, y: v.y - 2 * a * n.y };
}

// The dome offset (ball x - dome x) for a ball arriving at (x, y) with velocity v: the smallest offset whose outgoing
// ray rises steeply enough and reaches a brick; 0 when none does.
function chooseOffset(game, landing, contactY) {
  const speed = Math.hypot(landing.v.x, landing.v.y);
  const candidates = [0];
  for (let d = 2; d <= 22; d += 2) candidates.push(d, -d);
  for (const dx of candidates) {
    const out = reflectOffDome(landing.v, dx);
    if (out.y > -0.4 * speed) continue;                // too flat: slow to return, hard to follow
    if (reachesBrick(game, landing.x, contactY, out)) return dx;
  }
  return landing.v.x > 0 ? 6 : -6;                     // nothing aims at a brick: tilt it a little against its drift
}

// --- cat planning -----------------------------------------------------------------------------------------------------
// Targets (cat centre x) for the two cats, left-to-right order kept (cats cannot pass each other).
function planCatches(game, cats) {
  const contactY = domeY(cats[0]) - CONTACT + 1;
  const landings = game.breakoutBalls.filter(isMoving)
    .map((ball) => predictLanding(game, ball, contactY))
    .filter(Boolean)
    .sort((p, q) => p.ticks - q.ticks);
  const order = [...cats].sort((p, q) => centreX(p) - centreX(q));   // [left cat, right cat]
  const targets = new Map();
  if (landings.length === 0) return targets;

  const aims = landings.slice(0, 2).map((landing) => clamp(landing.x - chooseOffset(game, landing, contactY), CAT_MIN_X, CAT_MAX_X));
  const urgent = aims[0];
  const midpoint = (centreX(order[0]) + centreX(order[1])) / 2;
  const catcher = urgent < midpoint ? 0 : 1;            // index into order
  const other = 1 - catcher;
  const side = other === 1 ? 1 : -1;                    // which side of the catcher the other cat stays on
  let otherTarget = aims.length > 1 ? aims[1] : urgent + side * 90;
  // Keep the other cat on its side of the catcher with room to spare.
  if (side > 0) otherTarget = Math.max(otherTarget, urgent + CAT_GAP);
  else otherTarget = Math.min(otherTarget, urgent - CAT_GAP);
  if (otherTarget < CAT_MIN_X || otherTarget > CAT_MAX_X) otherTarget = urgent + side * CAT_GAP;
  targets.set(order[catcher], urgent);
  targets.set(order[other], clamp(otherTarget, CAT_MIN_X, CAT_MAX_X));
  return targets;
}

function walkSpec(cat, x, tol = 1.5) {
  const dx = x - centreX(cat);
  if (Math.abs(dx) <= tol) return {};
  return dx > 0 ? { right: true } : { left: true };
}

// --- the solver -------------------------------------------------------------------------------------------------------
export default {
  party: 2,
  budget: 40000,
  async solve(_stage, api) {
    const { game, cats } = api;

    // Launch a hanging ball: the nearer cat stands beside it (offset chosen so the launch heads for a brick) and
    // jumps; the other cat steps away.
    function launchSpare() {
      const ball = game.breakoutBalls.find(isHanging);
      if (!ball) api.block(`all balls used up with ${bricksLeft(game)} bricks left`);
      const order = [...cats].sort((p, q) => centreX(p) - centreX(q));
      const midpoint = (centreX(order[0]) + centreX(order[1])) / 2;
      const launcher = ball.center.x < midpoint ? order[0] : order[1];
      const helper = launcher === order[0] ? order[1] : order[0];
      // Launch direction = away from the dome centre: (dx, -h)/37 for offset dx = ball x - dome x.
      let offset = 8;
      for (const dx of [8, -8, 12, -12, 4, -4, 16, -16]) {
        const h = Math.sqrt(CONTACT * CONTACT - dx * dx);
        if (reachesBrick(game, ball.center.x, ball.center.y, { x: 4 * dx / CONTACT, y: -4 * h / CONTACT })) { offset = dx; break; }
      }
      const spot = clamp(ball.center.x - offset, CAT_MIN_X, CAT_MAX_X);
      const away = clamp(spot + (helper === order[1] ? 1 : -1) * 90, CAT_MIN_X, CAT_MAX_X);
      const step = () => {
        const specs = [];
        specs[cats.indexOf(launcher)] = walkSpec(launcher, spot, 1);
        specs[cats.indexOf(helper)] = walkSpec(helper, away, 3);
        return specs;
      };
      api.until(() => Math.abs(centreX(launcher) - spot) <= 1 && launcher.grounded, step, 600,
        `launcher could not reach the ball at x ${ball.center.x}`);
      let f = 0;
      api.until(() => isMoving(ball) || !alive(ball) || (f > 5 && launcher.grounded), () => {
        const specs = [];
        specs[cats.indexOf(launcher)] = { jump: f++ < 14 };
        return specs;
      }, 120, `jumping into the ball at x ${ball.center.x} did not launch it`);
      if (!isMoving(ball)) api.block(`ball at x ${ball.center.x} not launched by a jump from x ${centreX(launcher)}`);
    }

    // Phase 1: break every brick.
    while (bricksLeft(game) > 0) {
      if (!game.breakoutBalls.some(isMoving)) {
        launchSpare();
        continue;
      }
      const targets = planCatches(game, cats);
      api.step(cats.map((cat) => (targets.has(cat) ? walkSpec(cat, targets.get(cat)) : {})));
    }

    // Phase 2: the key appears at (624,548): the cat nearer x 640 jumps for it; the other steps aside.
    const order = [...cats].sort((p, q) => Math.abs(centreX(p) - KEY_X) - Math.abs(centreX(q) - KEY_X));
    const [fetcher, helper] = order;
    const aside = centreX(helper) < KEY_X ? KEY_X - 80 : KEY_X + 80;
    api.until(() => Math.abs(centreX(fetcher) - KEY_X) <= 1.5 && Math.abs(centreX(helper) - aside) <= 3 && fetcher.grounded, () => {
      const specs = [];
      specs[cats.indexOf(fetcher)] = walkSpec(fetcher, KEY_X);
      specs[cats.indexOf(helper)] = walkSpec(helper, aside, 3);
      return specs;
    }, 600, 'could not get under the key');
    api.until(() => api.carrierOfKey() >= 0, (f) => {
      const specs = [];
      specs[cats.indexOf(fetcher)] = { jump: f % 40 < 14 };
      return specs;
    }, 200, () => `jumping at x ${KEY_X} did not pick up the key (key visible: ${game.breakoutKeyAppeared})`);
    api.land();

    // Phase 3: the Goal is right below the key.
    api.enterGoal();
  },
};

// 8-3 RETRO GAME (stage_switch_puzzle02). Party 2: co-op Tetris (native spec scratchpad b14/spec-puzzle.md), fast variant.
//
// The puzzle (game.puzzle): a 54x23 grid; the well is the judge range (cols 19..33, rows 8..21, 15 wide). Each active
// Block spawns at (24,5) / (28,5) inside a 3-wide bay (rows 4..7, walled by cols 22/26/30), so a piece can rotate in its
// bay but only slides sideways once every cell is below row 7. Pieces are trominoes: L (0,0),(0,1),(1,0) and I
// (-1,0),(0,0),(1,0). Fall time 0.2 s per row (12 ticks), 0.1 s (6 ticks) after 5 lines; lock delay 0.5 s.
// Cats ignore input until the counter reaches 0 (10 lines); then the Key appears and the cats carry it to the Goal.
//
// Planner, per Block, per tick (it reads the live grid every tick, so line clears and the other Block never desync it):
// 1. A new piece (the Block's y jumped back to its spawn row) gets a plan: every distinct rotation x every column whose
//    cells stay inside the Block's own lane of the well, dropped straight down on a copy of the landed grid; each
//    result is scored (lines cleared, holes, aggregate height, bumpiness) and must be reachable (rotate in the bay,
//    slide along the exit row with room for the rows gravity adds while sliding).
// 2. Steering: one key press per tick, each key released between presses (a fresh press always fires; held keys
//    would wait 134 ms for the native repeat). Rotate with JUMP, then soft-drop (DOWN) out of the bay, slide with
//    LEFT/RIGHT, then DOWN until it locks (DOWN locks a grounded piece once the 0.12 s landing grace has passed).
// 3. If a press would not fit (the piece fell past a ledge, a line clear moved things), the plan is re-made from the
//    piece's current position with the same scoring.
// Lanes: the well is split between the Blocks at the midpoint of their spawn columns (cols 19..26 and 27..33), so the
// two falling pieces never cross or block each other. A Block whose lane is more than a row higher than the other's
// stops soft-dropping (its piece falls at native speed) so the two halves rise together and complete whole rows.

const IDLE_PRESS = {};

// --- grid model (codes: 1 empty, 2..25 terrain, 26+c falling, 36+c landed) --------------------------------------------
const EMPTY = 1;
const FALLING = 26;
const LANDED = 36;

function isTerrain(code) { return code === 0 || (code >= 2 && code < FALLING); }
function isLanded(code) { return code >= LANDED && code < LANDED + 10; }

// Snapshot of the puzzle as a solid/empty matrix. `ownCells` (the piece being steered) are empty; another Block's
// falling cells count as solid only when `withFalling` is set (they move, so plans ignore them; presses do not).
function solidGrid(puzzle, ownCells, withFalling) {
  const own = new Set(ownCells.map((c) => c.x + ',' + c.y));
  const solid = [];
  for (let y = 0; y < puzzle.height; y++) {
    const row = [];
    for (let x = 0; x < puzzle.width; x++) {
      const code = puzzle.cellAt(x, y);
      if (own.has(x + ',' + y)) { row.push(false); continue; }
      const falling = code >= FALLING && code < LANDED;
      row.push(isTerrain(code) || isLanded(code) || (withFalling && falling));
    }
    solid.push(row);
  }
  return solid;
}

function fits(solid, shape, x, y) {
  for (const [dx, dy] of shape) {
    const cx = x + dx, cy = y + dy;
    if (cy < 0 || cy >= solid.length || cx < 0 || cx >= solid[0].length) return false;
    if (solid[cy][cx]) return false;
  }
  return true;
}

// Native rotation: (x, y) -> (-y, x), applied `turns` times.
function rotate(shape, turns) {
  let out = shape.map(([dx, dy]) => [dx, dy]);
  for (let i = 0; i < turns % 4; i++) out = out.map(([dx, dy]) => [0 - dy, dx]);
  return out;
}

function shapeKey(shape) {
  return shape.map(([dx, dy]) => dx + ':' + dy).sort().join(' ');
}

// --- scoring a resting placement --------------------------------------------------------------------------------------
const WEIGHT = { lines: 3.0, holes: -4.0, height: -0.5, bumpiness: -0.35, top: -0.4 };

function scorePlacement(solid, judge, shape, x, y) {
  const grid = solid.map((row) => row.slice());
  for (const [dx, dy] of shape) grid[y + dy][x + dx] = true;
  const right = judge.x + judge.w;
  const bottom = judge.y + judge.h;

  // Clear full rows (whole judge width), keeping the rows above.
  let lines = 0;
  const rows = [];
  for (let r = judge.y; r < bottom; r++) {
    let full = true;
    for (let c = judge.x; c < right; c++) if (!grid[r][c]) { full = false; break; }
    if (full) lines++;
    else rows.push(r);
  }
  const well = rows.map((r) => grid[r].slice(judge.x, right));
  while (well.length < judge.h) well.unshift(new Array(judge.w).fill(false));

  let holes = 0, height = 0, bumpiness = 0, top = 0;
  const heights = [];
  for (let c = 0; c < judge.w; c++) {
    let h = 0;
    for (let r = 0; r < judge.h; r++) if (well[r][c]) { h = judge.h - r; break; }
    for (let r = judge.h - h; r < judge.h; r++) if (!well[r][c]) holes++;
    heights.push(h);
    height += h;
    top = Math.max(top, h);
  }
  for (let c = 1; c < heights.length; c++) bumpiness += Math.abs(heights[c] - heights[c - 1]);
  return WEIGHT.lines * lines + WEIGHT.holes * holes + WEIGHT.height * height + WEIGHT.bumpiness * bumpiness + WEIGHT.top * top;
}

// Average column height of a lane (columns lo..hi) on the landed grid.
function laneHeight(puzzle, lo, hi) {
  const { judge } = puzzle;
  let sum = 0;
  for (let c = lo; c <= hi; c++) {
    let h = 0;
    for (let r = judge.y; r < judge.y + judge.h; r++) if (isLanded(puzzle.cellAt(c, r))) { h = judge.y + judge.h - r; break; }
    sum += h;
  }
  return sum / (hi - lo + 1);
}

// --- the planner ------------------------------------------------------------------------------------------------------
// Choose { turns, x } (turns counted from the spawn rotation) for the Block's current piece, inside its lane.
// A piece still in its bay rotates freely there and starts its slide on the first row below the bay; a piece already
// in the well must rotate and slide from where it is.
function plan(puzzle, block, lane, ticksPerRow) {
  const base = rotate(block.shape, 4 - block.rotation);   // back to rotation 0
  const solid = solidGrid(puzzle, block.cells(), false);
  const { judge } = puzzle;
  const seen = new Set();
  let best = null;
  for (let turns = 0; turns < 4; turns++) {
    const shape = rotate(base, turns);
    const key = shapeKey(shape);
    if (seen.has(key)) continue;
    seen.add(key);
    const extra = (turns - block.rotation + 4) % 4;        // presses still needed
    const minDy = Math.min(...shape.map(([, dy]) => dy));
    const inBay = block.cells().some((c) => c.y < judge.y);
    // Row the slide starts on: just below the bay, or the current row once out.
    const startY = inBay ? Math.max(block.y, judge.y - minDy) : block.y;
    if (!inBay && !rotationPathFits(solid, base, block.rotation, extra, block.x, block.y)) continue;
    for (let x = lane.lo - 2; x <= lane.hi + 2; x++) {
      if (shape.some(([dx]) => x + dx < lane.lo || x + dx > lane.hi)) continue;
      if (!slideFits(solid, shape, block.x, x, startY, ticksPerRow)) continue;
      let y = startY;
      while (fits(solid, shape, x, y + 1)) y++;
      const score = scorePlacement(solid, judge, shape, x, y);
      if (!best || score > best.score) best = { turns, x, score };
    }
  }
  return best;
}

function rotationPathFits(solid, base, rotation, extra, x, y) {
  for (let k = 1; k <= extra; k++) if (!fits(solid, rotate(base, rotation + k), x, y)) return false;
  return true;
}

// The slide from column `fromX` to `toX` starting on row `y`. Gravity may add rows while sliding (one column per two
// ticks, one row per `ticksPerRow`; a grounded piece stops sinking but can still slide), so each next column must be
// free on every row the piece can be on when that press comes: from `y` down to its deepest possible row.
function slideFits(solid, shape, fromX, toX, y, ticksPerRow) {
  if (!fits(solid, shape, fromX, y)) return false;
  const dir = Math.sign(toX - fromX);
  const steps = Math.abs(toX - fromX);
  let deepest = y;
  for (let k = 0; k < steps; k++) {
    const x = fromX + dir * k;
    const sag = Math.floor((2 * (k + 1)) / ticksPerRow) + 1;
    while (deepest < y + sag && fits(solid, shape, x, deepest + 1)) deepest++;
    for (let row = y; row <= deepest; row++) if (!fits(solid, shape, x + dir, row)) return false;
  }
  return true;
}

// --- the solver -------------------------------------------------------------------------------------------------------
export default {
  party: 2,
  budget: 12000,
  async solve(stage, api) {
    const { game } = api;
    const puzzle = game.puzzle;
    if (!puzzle) api.block('8-3 has no game.puzzle (the PuzzleTetris sub-stage did not load)');
    const cats = api.cats;

    const active = puzzle.blocks.filter((b) => b.active).sort((a, b) => a.spawnX - b.spawnX);
    const { judge } = puzzle;
    // Lanes: split the well at the midpoints between neighbouring spawn columns.
    const lanes = active.map((b, i) => ({
      lo: i === 0 ? judge.x : Math.floor((active[i - 1].spawnX + b.spawnX) / 2) + 1,
      hi: i === active.length - 1 ? judge.x + judge.w - 1 : Math.floor((b.spawnX + active[i + 1].spawnX) / 2),
    }));
    const state = active.map(() => ({ target: null, lastY: Infinity, held: {} }));
    const catOf = (block) => game.playerInputSlots.indexOf(block.player);
    if (active.some((b) => catOf(b) < 0 || catOf(b) >= cats.length)) api.block('a Block has no steering cat');

    // One tick of steering for Block i: returns the button spec (one fresh press at most).
    function steer(i) {
      const block = active[i];
      const s = state[i];
      if (block.blocked) { s.lastY = Infinity; return IDLE_PRESS; }
      const ticksPerRow = Math.max(1, Math.round(puzzle.fallTime() * 60));
      if (block.y < s.lastY) s.target = null;              // a new piece at the spawn
      s.lastY = block.y;
      if (!s.target) s.target = plan(puzzle, block, lanes[i], ticksPerRow);
      if (!s.target) return press(s, 'down');

      const solid = solidGrid(puzzle, block.cells(), true);
      const base = rotate(block.shape, 4 - block.rotation);
      const inBay = block.cells().some((c) => c.y < judge.y);

      if (shapeKey(block.shape) !== shapeKey(rotate(base, s.target.turns))) {
        if (fits(solid, rotate(block.shape, 1), block.x, block.y)) return press(s, 'jump');
        s.target = plan(puzzle, block, lanes[i], ticksPerRow);
        return IDLE_PRESS;
      }
      if (block.x !== s.target.x) {
        if (inBay) return press(s, 'down');                // leave the bay quickly
        const dir = s.target.x > block.x ? 1 : -1;
        if (fits(solid, block.shape, block.x + dir, block.y)) return press(s, dir > 0 ? 'right' : 'left');
        s.target = plan(puzzle, block, lanes[i], ticksPerRow);
        return IDLE_PRESS;
      }
      // In place: soft-drop, unless this lane is already a row above the others (let them catch up).
      const mine = laneHeight(puzzle, lanes[i].lo, lanes[i].hi);
      const others = Math.min(...lanes.filter((_, k) => k !== i).map((l) => laneHeight(puzzle, l.lo, l.hi)));
      if (mine > others + 1 && block.y < judge.y + judge.h - 1 - Math.ceil(mine) - 3) return IDLE_PRESS;
      return press(s, 'down');
    }

    // A key fires only on a fresh press, so a key held last tick is released this tick instead.
    function press(s, key) {
      if (s.held[key]) { s.held = {}; return IDLE_PRESS; }
      s.held = { [key]: true };
      return { [key]: true };
    }

    api.until(() => puzzle.won || puzzle.failed || game.puzzle !== puzzle, () => {
      const specs = cats.map(() => ({}));
      active.forEach((block, i) => { specs[catOf(block)] = steer(i); });
      return specs;
    }, 9000, () => `puzzle not won: ${puzzle.linesCleared}/${puzzle.target} lines`);
    if (!puzzle.won) {
      api.block(`the puzzle failed (every Block blocked) at ${puzzle.linesCleared}/${puzzle.target} lines -- the stage restarted`);
    }

    // The Key appears at (640, 608) in the corridor; the cats pick it up on the way to the Goal below it.
    api.wait(2);
    api.land();
    api.enterGoal();
  },
};

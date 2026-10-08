// 8-1 RETRO GAME (stage_switch_puzzle01). Party 2: co-op Tetris, then a plain Key -> Goal walk.
//
// The puzzle (native spec scratchpad b14/spec-puzzle.md, runtime state game.puzzle):
// - Grid 54x23 cells. The well is the judge range: columns 19..33 (15 wide), rows 8..21. Above it four 3-wide bays
//   (rows 4..7, walls at columns 22 / 26 / 30); Block 1 spawns in bay 2 (pivot 24,5), Block 2 in bay 3 (pivot 28,5).
// - Pieces are trominoes: L (0,0),(0,1),(1,0) and I (-1,0),(0,0),(1,0). JUMP press rotates (x,y)->(-y,x), no wall kick;
//   LEFT / RIGHT / DOWN fire on the press tick (then auto-repeat); a soft drop on a grounded piece locks it (after a
//   0.12 s grace). Gravity drops every fallTime (0.6 s, faster after 3 and 6 lines). Cats are frozen until the win.
// - 10 full rows (across all 15 columns) win: the Key appears in the corridor and the cats carry it to the Goal.
//
// Planner:
// - The two Blocks never meet: Block 1 owns columns 19..26, Block 2 owns columns 27..33. Each spawns inside its own
//   half and only ever moves inside it, so the two falling pieces can never collide or block each other.
// - For each new piece, enumerate every rotation x pivot column whose cells stay in the Block's half, simulate the
//   exact route the controller will drive (rotate in the bay; then each step: shift toward the column if it fits,
//   otherwise drop one row) on a copy of game.puzzle.grid, then score the landed board (holes, bumpiness, height,
//   landing row, rows completed) plus the best follow-up placement of the Block's known next piece.
// - Controller: one button press per tick at most per button (a button must be released between presses so every
//   press fires once): rotate first, then shift / soft-drop, then soft-drop until it locks.
// - Balance: a half that is more than one row ahead of the other does not soft-drop (its piece still steers into
//   place while gravity brings it down), so the halves rise together and rows complete.

const WELL_TOP = 8;                 // first row below the bays
const HALVES = [[19, 26], [27, 33]]; // column ranges owned by Block 1 / Block 2 (by spawn column order)
const AHEAD_LIMIT = 1.0;            // rows a half may lead the other before its Block stops soft-dropping
const LINES_BUDGET_FRAMES = 9000;

// Native piece table (runtime Ta): L tromino, I tromino.
const PIECES = [
  [[0, 0], [0, 1], [1, 0]],
  [[-1, 0], [0, 0], [1, 0]],
];

// Shape after `turns` clockwise rotations, exactly as the runtime builds it ((x,y) -> (-y,x) per press).
function rotated(piece, turns) {
  let shape = PIECES[piece].map(([x, y]) => [x, y]);
  for (let i = 0; i < turns; i++) shape = shape.map(([x, y]) => [-y, x]);
  return shape;
}

// --- board model (a plain copy of the puzzle grid; codes: 0/1 free, everything else solid) ---------------------------
class Board {
  constructor(puzzle) {
    this.width = puzzle.width;
    this.height = puzzle.height;
    this.grid = Array.from(puzzle.grid);
    this.judge = puzzle.judge;
  }
  clone() {
    const copy = Object.create(Board.prototype);
    copy.width = this.width; copy.height = this.height; copy.judge = this.judge;
    copy.grid = this.grid.slice();
    return copy;
  }
  // Same clamping rule as the runtime's solidAt.
  solid(x, y) {
    const cx = Math.min(Math.max(x, 0), this.width - 1);
    const cy = Math.min(Math.max(y, 0), this.height - 1);
    const code = this.grid[cy * this.width + cx];
    return code >= 2;
  }
  fits(shape, x, y) {
    return shape.every(([dx, dy]) => !this.solid(x + dx, y + dy));
  }
  setCells(shape, x, y, code) {
    for (const [dx, dy] of shape) this.grid[(y + dy) * this.width + (x + dx)] = code;
  }
  landed(x, y) {
    const code = this.grid[y * this.width + x];
    return code >= 36 && code < 46;
  }
  // Remove the rows that are full across the judge width (the runtime's clear, without the bay quirks: the bays are
  // never filled by landed cells).
  clearFullRows() {
    const { x: jx, w: jw, y: jy, h: jh } = this.judge;
    let cleared = 0;
    for (let row = jy + jh - 1; row >= jy; ) {
      let full = true;
      for (let x = jx; x < jx + jw; x++) if (!this.landed(x, row)) { full = false; break; }
      if (!full) { row--; continue; }
      cleared++;
      for (let r = row; r > jy; r--) {
        for (let x = jx; x < jx + jw; x++) this.grid[r * this.width + x] = this.grid[(r - 1) * this.width + x];
      }
      for (let x = jx; x < jx + jw; x++) this.grid[jy * this.width + x] = 1;
    }
    return cleared;
  }
  // Column height inside the well (0 = empty column), counting landed cells only.
  columnHeight(x) {
    const bottom = this.judge.y + this.judge.h;
    for (let y = this.judge.y; y < bottom; y++) if (this.landed(x, y)) return bottom - y;
    return 0;
  }
  holes(x) {
    const bottom = this.judge.y + this.judge.h;
    let seen = false, holes = 0;
    for (let y = this.judge.y; y < bottom; y++) {
      if (this.landed(x, y)) seen = true;
      else if (seen) holes++;
    }
    return holes;
  }
  landedCount([from, to]) {
    let n = 0;
    for (let x = from; x <= to; x++) for (let y = this.judge.y; y < this.judge.y + this.judge.h; y++) if (this.landed(x, y)) n++;
    return n;
  }
}

// --- route simulation: exactly what the controller does ------------------------------------------------------------
// From the spawn pivot: rotate `turns` times in the bay, then repeat { shift one column toward targetX if it fits,
// else drop one row if it fits, else stop }. Returns the landing pivot or null when the target column is unreachable.
function simulateRoute(board, piece, turns, spawnX, spawnY, targetX) {
  let shape = PIECES[piece].map(([x, y]) => [x, y]);
  for (let i = 0; i < turns; i++) {
    const next = shape.map(([x, y]) => [-y, x]);
    if (!board.fits(next, spawnX, spawnY)) return null;
    shape = next;
  }
  let x = spawnX, y = spawnY;
  for (let guard = 0; guard < 200; guard++) {
    const dx = Math.sign(targetX - x);
    if (dx !== 0 && board.fits(shape, x + dx, y)) { x += dx; continue; }
    if (board.fits(shape, x, y + 1)) { y += 1; continue; }
    break;
  }
  if (x !== targetX) return null;
  return { shape, x, y };
}

// Score a board after a placement, judged on one half of the well.
function scoreHalf(board, [from, to], landingRow) {
  let holes = 0, aggregate = 0, bumpiness = 0, maxHeight = 0;
  let previous = null;
  for (let x = from; x <= to; x++) {
    const h = board.columnHeight(x);
    holes += board.holes(x);
    aggregate += h;
    maxHeight = Math.max(maxHeight, h);
    if (previous !== null) bumpiness += Math.abs(h - previous);
    previous = h;
  }
  const bottom = board.judge.y + board.judge.h;
  const landingHeight = bottom - landingRow;
  return -8 * holes - 1.2 * bumpiness - 0.4 * aggregate - 0.6 * landingHeight - 0.5 * maxHeight;
}

// All placements of `piece` in a half: { turns, x, board, cleared, score }.
function placements(board, piece, half, spawnX, spawnY) {
  const results = [];
  const seenShapes = new Set();
  for (let turns = 0; turns < 4; turns++) {
    const shape = rotated(piece, turns);
    const key = shape.map(([x, y]) => x + ',' + y).sort().join(' ');
    if (seenShapes.has(key)) continue;   // the I piece repeats after two turns
    seenShapes.add(key);
    const minDx = Math.min(...shape.map(([x]) => x));
    const maxDx = Math.max(...shape.map(([x]) => x));
    for (let x = half[0] - minDx; x + maxDx <= half[1]; x++) {
      const route = simulateRoute(board, piece, turns, spawnX, spawnY, x);
      if (!route || route.y + Math.max(...shape.map(([, y]) => y)) < WELL_TOP) continue;
      const after = board.clone();
      after.setCells(route.shape, route.x, route.y, 36);
      const cleared = after.clearFullRows();
      const landingRow = route.y + Math.min(...shape.map(([, y]) => y));
      results.push({ turns, x, board: after, cleared, score: scoreHalf(after, half, landingRow) + 4 * cleared });
    }
  }
  return results;
}

// Best placement for the current piece with one piece of lookahead (the Block's own next piece).
function plan(puzzle, block, half) {
  const board = new Board(puzzle);
  board.setCells(block.shape, block.x, block.y, 1);   // ignore the piece's own falling cells
  const firsts = placements(board, block.piece, half, block.spawnX, block.spawnY);
  let best = null;
  for (const first of firsts) {
    const seconds = placements(first.board, block.next, half, block.spawnX, block.spawnY);
    const follow = seconds.length ? Math.max(...seconds.map((s) => s.score)) : -1000;
    const total = first.score + follow;
    if (!best || total > best.total) best = { turns: first.turns, x: first.x, total };
  }
  return best;
}

// --- controller ----------------------------------------------------------------------------------------------------
// One Block's driver. Every tick it returns the buttons for its cat. A button is pressed only if it was released on
// the previous tick, so each press fires exactly once (the runtime's auto-repeat never kicks in).
function createPilot(puzzle, block, half) {
  let target = null;
  let lastY = Infinity;
  let held = {};

  function press(button) {
    if (held[button]) { held = {}; return {}; }
    held = { [button]: true };
    return { [button]: true };
  }

  function release() {
    held = {};
    return {};
  }

  function nextInput({ softDrop }) {
    if (!block.active || block.blocked) return release();
    // A new piece appears at the spawn row (a lock respawns it higher than it was): plan it.
    if (block.y < lastY || !target) target = plan(puzzle, block, half);
    lastY = block.y;
    if (!target) return release();

    if (block.rotation !== target.turns) return press('jump');
    const dx = Math.sign(target.x - block.x);
    if (dx !== 0) {
      const board = new Board(puzzle);
      board.setCells(block.shape, block.x, block.y, 1);
      if (board.fits(block.shape, block.x + dx, block.y)) return press(dx < 0 ? 'left' : 'right');
      return press('down');   // still inside the bay: drop until the shift fits
    }
    if (!softDrop) return release();
    return press('down');
  }

  return { nextInput, get target() { return target; } };
}

export default {
  party: 2,
  budget: LINES_BUDGET_FRAMES + 1500,
  async solve(stage, api) {
    const { game, cats } = api;
    const puzzle = game.puzzle;
    if (!puzzle) api.block('no puzzle on this stage');

    // Blocks in spawn-column order own the left / right half.
    const blocks = puzzle.blocks.filter((b) => b.active).sort((a, b) => a.spawnX - b.spawnX);
    if (blocks.length !== 2) api.block(`expected 2 active Blocks, found ${blocks.length}`);
    const pilots = blocks.map((block, i) => ({
      block,
      half: HALVES[i],
      cat: game.playerInputSlots.indexOf(block.player),
      pilot: createPilot(puzzle, block, HALVES[i]),
    }));
    for (const p of pilots) {
      if (p.cat < 0) api.block(`Block ${p.block.label} has no cat on input slot ${p.block.player}`);
      if (p.block.spawnX < p.half[0] || p.block.spawnX > p.half[1]) api.block(`Block ${p.block.label} spawns outside its half`);
    }

    // 1. Play the puzzle until the counter reaches 0.
    api.until(() => puzzle.won, () => {
      const rows = pilots.map((p) => new Board(puzzle).landedCount(p.half) / (p.half[1] - p.half[0] + 1));
      const specs = [];
      pilots.forEach((p, i) => {
        const ahead = rows[i] - rows[1 - i] > AHEAD_LIMIT;
        specs[p.cat] = p.pilot.nextInput({ softDrop: !ahead });
      });
      return specs;
    }, LINES_BUDGET_FRAMES, () => `puzzle not won: ${puzzle.linesCleared}/${puzzle.target} lines (failed ${puzzle.failed})`);

    // 2. The Key appears in the corridor; the cats walk into it and deliver it to the Goal.
    const key = game.keys[0];
    api.land();
    const keyX = key.rect.x + key.rect.width / 2;
    const nearest = cats.reduce((best, cat, i) => Math.abs(api.centreX(cat) - keyX) < Math.abs(api.centreX(cats[best]) - keyX) ? i : best, 0);
    api.walkTo(nearest, keyX, { tol: 2, max: 600 });
    api.until(() => api.carrierOfKey() >= 0, [], 60, 'the Key was not picked up');
    api.enterGoal();
  },
};

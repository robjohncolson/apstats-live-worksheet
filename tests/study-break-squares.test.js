// @vitest-environment jsdom
/**
 * tests/study-break-squares.test.js — TETRIS_SQUARES_SPEC (teacher 2026-10-10): gold and silver
 * squares in Study Break. Runs the REAL studyBreak and SFX object literals from the Desk in jsdom
 * (as tests/study-break-smoke.test.js does), with a recording 2D context and a recording
 * AudioContext.
 *   §1 detection (exactly four whole pieces; negatives: five pieces, a straddling piece, garbage,
 *      already-fused cells; overlap → top-left first), gold vs silver, clear scoring 100/500/1000
 *      × level, gravity after a partial slab clear, the fuse flash, determinism of a seeded run;
 *   §1 metallic draw (teacher addition): gradient + highlight for slabs only, tick-driven sweep;
 *   §2 1v1 garbage values (gold line +2, silver +1, same message);
 *   §3 the gold lines reported to bet/resolve (mine + the opponent's derived from their score / lines / level);
 *   §4 the sounds: the gate, and the exact frequencies / envelopes.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

// A 2D context that records every call (method name + args) and every gradient's colour stops.
function makeCtx(log) {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 6 });
      if (k === 'createLinearGradient') {
        return (...args) => {
          const gradient = { args, stops: [], addColorStop(at, color) { this.stops.push([at, color]); } };
          log.push({ fn: 'createLinearGradient', args, gradient });
          return gradient;
        };
      }
      if (typeof k === 'string') return (...args) => { log.push({ fn: k, args }); };
      return undefined;
    },
    set(t, k, v) { t[k] = v; if (k === 'fillStyle') log.push({ fn: 'set fillStyle', args: [v] }); return true; },
  });
}

// A Web Audio stand-in that records oscillators (type, frequencies, gain envelope), filters and buffers.
function makeAudio() {
  const nodes = [];
  const param = (owner, name) => {
    const events = [];
    owner[name + 'Events'] = events;
    return {
      setValueAtTime(v, t) { events.push(['set', v, t]); },
      linearRampToValueAtTime(v, t) { events.push(['linear', v, t]); },
      exponentialRampToValueAtTime(v, t) { events.push(['exp', v, t]); },
    };
  };
  const connectable = (node) => Object.assign(node, { connect(next) { node.next = next; return next; } });
  const ctx = {
    currentTime: 10,
    sampleRate: 1000,
    state: 'running',
    destination: { kind: 'destination' },
    resume() {},
    createOscillator() {
      const o = connectable({ kind: 'osc', start(t) { o.startAt = t; }, stop(t) { o.stopAt = t; } });
      o.frequency = param(o, 'frequency');
      nodes.push(o);
      return o;
    },
    createGain() { const g = connectable({ kind: 'gain' }); g.gain = param(g, 'gain'); nodes.push(g); return g; },
    createBiquadFilter() {
      const f = connectable({ kind: 'biquad' });
      f.frequency = param(f, 'frequency');
      f.Q = param(f, 'Q');
      nodes.push(f);
      return f;
    },
    createBuffer(ch, size) { return { size, getChannelData: () => new Float32Array(size) }; },
    createBufferSource() { const s = connectable({ kind: 'buffer', start(t) { s.startAt = t; }, stop(t) { s.stopAt = t; } }); nodes.push(s); return s; },
  };
  return { ctx, nodes };
}

let sb;
let SFXobj;
const drawLog = [];
const sent = [];

beforeAll(() => {
  const start = html.indexOf('const studyBreak = {');
  const end = html.indexOf('\n};\n', start);
  const sbSrc = html.slice(start, end) + '\n};\nwindow.studyBreak = studyBreak; window.closeGame = function () { studyBreak.close(); };';
  const sfxStart = html.indexOf('const SFX = {');
  const sfxEnd = html.indexOf('\n};\n', sfxStart);
  const sfxSrc = html.slice(sfxStart, sfxEnd) + '\n};\nwindow.__SFX = SFX;';

  document.body.innerHTML = `
    <div id="game-overlay" style="display:none"><div class="game-window">
      <button id="mute-btn"></button>
      <canvas id="gameCanvas" width="430" height="302" tabindex="0"></canvas>
      <div id="game-split" style="display:none"><div id="p1-label"></div><canvas id="gameCanvas1"></canvas><div id="p2-label"></div><canvas id="gameCanvas2"></canvas></div>
      <div id="game-lobby" style="display:none"><div id="lobby-casino"></div><div id="lobby-players"></div><div id="lobby-status"></div></div>
      <div id="challenge-dialog" style="display:none"><div id="challenge-msg"></div><span id="challenge-timer"></span><button id="challenge-accept-btn"></button><button id="challenge-decline-btn"></button></div>
      <div id="game-score"></div><div id="game-help"></div>
      <div id="game-touch"></div>
      <div id="game-live"></div>
    </div></div>
    <div id="doge-challenge-panel"></div>`;
  window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(drawLog); };
  window.matchMedia = () => ({ matches: false });
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  globalThis.MacSFX = { muted: false, init() {}, play() {} };
  globalThis._deskEsc = (s) => String(s == null ? '' : s);
  globalThis.eval(sfxSrc);
  SFXobj = window.__SFX;
  globalThis.SFX = SFXobj;
  globalThis.eval(sbSrc);
  sb = window.studyBreak;
  vi.useFakeTimers();
});
afterAll(() => { vi.useRealTimers(); });

const originals = {};
beforeEach(() => {
  for (const [name, fn] of Object.entries(originals)) sb[name] = fn;   // undo any per-test stub
  SFXobj.ctx = makeAudio().ctx;                                       // jsdom has no Web Audio
  sb.init();
  sb.mode = 'solo';
  sb.mpState = null;
  sb.resetBoardState();
  sb.level = 1;
  sb.score = 0;
  sb.lines = 0;
  sent.length = 0;
  SFXobj.muted = false;
  globalThis.MacSFX.muted = false;
});

// Replace a studyBreak method for one test (restored by the beforeEach above).
function stub(name, fn) {
  if (!(name in originals)) originals[name] = sb[name];
  sb[name] = fn;
}

// ── board helpers ──────────────────────────────────────────────────────────────
const ROWS = 24;
const piece = (id, type) => ({ kind: 'piece', pieceId: id, pieceType: type, squareId: null, material: null, color: '#123456' });
const garbage = () => ({ kind: 'fragment', pieceId: null, pieceType: null, squareId: null, material: null, color: '#888888' });
// Place a 2x2 O piece (id) with its top-left at (x, y).
function placeO(id, x, y, type = 'O') {
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) sb.board[y + dy][x + dx] = piece(id, type);
}
// Four O pieces (or the given types) filling the 4x4 at (x, y).
function fourBlocks(x, y, types = ['O', 'O', 'O', 'O'], firstId = 1) {
  placeO(firstId, x, y, types[0]);
  placeO(firstId + 1, x + 2, y, types[1]);
  placeO(firstId + 2, x, y + 2, types[2]);
  placeO(firstId + 3, x + 2, y + 2, types[3]);
}
const slabCells = () => sb.board.flat().filter((c) => c && c.kind === 'square');

describe('§1 detection', () => {
  it('four whole same-shape pieces → one gold slab (16 cells, one squareId)', () => {
    fourBlocks(0, 20);
    expect(sb.detectSquares()).toEqual({ gold: 1, silver: 0 });
    const cells = slabCells();
    expect(cells).toHaveLength(16);
    expect(new Set(cells.map((c) => c.squareId)).size).toBe(1);
    expect(cells.every((c) => c.material === 'gold' && c.color === '#F2C14E')).toBe(true);
  });

  it('four whole pieces of mixed shapes → silver', () => {
    fourBlocks(0, 20, ['O', 'T', 'O', 'S']);   // the pieceType decides the material, not the cell layout
    expect(sb.detectSquares()).toEqual({ gold: 0, silver: 1 });
    expect(slabCells().every((c) => c.material === 'silver' && c.color === '#C9D1D9')).toBe(true);
  });

  it('negative: a 4x4 filled by FIVE pieces never fuses', () => {
    placeO(1, 0, 20); placeO(2, 2, 20); placeO(3, 0, 22);
    // the last 2x2 is two pieces' cells (2 + 2)
    sb.board[22][2] = piece(4, 'I'); sb.board[22][3] = piece(4, 'I');
    sb.board[23][2] = piece(5, 'I'); sb.board[23][3] = piece(5, 'I');
    expect(sb.detectSquares()).toEqual({ gold: 0, silver: 0 });
    expect(slabCells()).toHaveLength(0);
  });

  it('negative: a piece straddling the region (part inside, part outside) blocks the fuse', () => {
    placeO(1, 0, 20); placeO(2, 2, 20); placeO(3, 0, 22);
    sb.board[22][2] = piece(4, 'O'); sb.board[22][3] = piece(4, 'O');
    sb.board[23][2] = piece(4, 'O'); sb.board[21][4] = piece(4, 'O');   // 4th cell outside the 4x4
    sb.board[23][3] = piece(5, 'O');
    expect(sb.detectSquares()).toEqual({ gold: 0, silver: 0 });
  });

  it('negative: garbage cells never count toward a square', () => {
    placeO(1, 0, 20); placeO(2, 2, 20); placeO(3, 0, 22);
    for (const [x, y] of [[2, 22], [3, 22], [2, 23], [3, 23]]) sb.board[y][x] = garbage();
    expect(sb.detectSquares()).toEqual({ gold: 0, silver: 0 });
  });

  it('negative: a region already fused does not fuse again', () => {
    fourBlocks(0, 20);
    expect(sb.detectSquares().gold).toBe(1);
    expect(sb.detectSquares()).toEqual({ gold: 0, silver: 0 });
    expect(sb.goldCount).toBe(1);
  });

  it('overlap: two qualifying regions sharing pieces → the top-left one fuses, deterministically', () => {
    // Rows 19-22 and 20-23 (cols 0-3) both hold exactly four whole pieces: a horizontal I on row
    // 19, three pieces on rows 20-22, a horizontal I on row 23. The upper region wins.
    for (let x = 0; x < 4; x++) { sb.board[19][x] = piece(10, 'I'); sb.board[23][x] = piece(14, 'I'); }
    for (let x = 0; x < 4; x++) sb.board[20][x] = piece(11, 'I');
    for (let x = 0; x < 4; x++) sb.board[21][x] = piece(12, 'I');
    for (let x = 0; x < 4; x++) sb.board[22][x] = piece(13, 'I');
    expect(sb.detectSquares()).toEqual({ gold: 1, silver: 0 });
    expect(slabCells()).toHaveLength(16);
    const fusedRows = new Set();
    sb.board.forEach((row, y) => row.forEach((c) => { if (c && c.kind === 'square') fusedRows.add(y); }));
    expect([...fusedRows].sort((a, b) => a - b)).toEqual([19, 20, 21, 22]);
    expect(sb.board[23][0].kind).toBe('piece');   // the lower I stays a plain piece
  });

  it('the fuse flash is armed for 250 ms on the new slab', () => {
    fourBlocks(0, 20);
    sb.detectSquares();
    expect(sb.fuseFx.timer).toBe(250);
    expect(sb.fuseFx.squareIds).toEqual([slabCells()[0].squareId]);
  });
});

describe('§1 clears: scoring and gravity', () => {
  function fillRowExcept(y, cols) {
    for (let x = 0; x < 10; x++) if (!cols.includes(x) && !sb.board[y][x]) sb.board[y][x] = garbage();
  }

  it('plain line 100, silver line 500, gold line 1000 (clearLines, before the level multiplier)', () => {
    fillRowExcept(23, []);
    expect(sb.clearLines()).toEqual({ lines: 1, points: 100, goldStrips: 0, silverStrips: 0 });
    sb.resetBoardState();
    fourBlocks(0, 20, ['O', 'T', 'O', 'S']); sb.detectSquares(); fillRowExcept(23, []);
    expect(sb.clearLines()).toEqual({ lines: 1, points: 500, goldStrips: 0, silverStrips: 1 });
    sb.resetBoardState();
    fourBlocks(0, 20); sb.detectSquares(); fillRowExcept(23, []);
    expect(sb.clearLines()).toEqual({ lines: 1, points: 1000, goldStrips: 1, silverStrips: 0 });
  });

  it('a row through a gold AND a silver slab is one gold line', () => {
    fourBlocks(0, 20, ['O', 'O', 'O', 'O'], 1);
    fourBlocks(4, 20, ['O', 'T', 'O', 'S'], 11);
    sb.detectSquares();
    fillRowExcept(23, []);
    expect(sb.clearLines()).toEqual({ lines: 1, points: 1000, goldStrips: 1, silverStrips: 0 });
  });

  it('gravity after a partial slab clear: the 4x3 remainder drops a row and keeps its material and id', () => {
    fourBlocks(0, 20, ['O', 'T', 'O', 'S']);
    sb.detectSquares();
    const id = slabCells()[0].squareId;
    fillRowExcept(23, []);
    sb.clearLines();
    const rest = [];
    sb.board.forEach((row, y) => row.forEach((c, x) => { if (c && c.squareId === id) rest.push([x, y, c.material]); }));
    expect(rest).toHaveLength(12);
    expect(new Set(rest.map((r) => r[1]))).toEqual(new Set([21, 22, 23]));
    expect(rest.every((r) => r[2] === 'silver')).toBe(true);
  });

  it('lockPiece multiplies by the level and marks the square-clear rows for the solid white flash', () => {
    // Three O pieces + the active O complete a gold 4x4 on rows 20-23 of cols 0-3, and row 23
    // (cols 4-9 garbage) clears through it.
    placeO(1, 0, 20); placeO(2, 2, 20); placeO(3, 0, 22);
    fillRowExcept(23, [2, 3]);
    sb.level = 3;
    sb.active = { id: 4, type: 'O', rot: 0, x: 1, y: 22 };   // O occupies cols x+1..x+2 → 2,3
    sb.lockPiece();
    expect(sb.goldCount).toBe(1);
    expect(sb.lines).toBe(1);
    expect(sb.score).toBe(3000);
    expect(sb.clearFx.squareRows).toEqual([23]);
  });
});

describe('§1 determinism with the seeded bag', () => {
  it('two runs from the same room seed produce the same pieces, boards and score', () => {
    const run = () => {
      sb.resetBoardState();
      sb.mode = 'solo';
      sb._seedRng('room-x:1');
      sb.state = 'running';
      sb.level = 1; sb.score = 0; sb.lines = 0;
      const seen = [];
      for (let i = 0; i < 30; i++) {
        if (!sb.active) sb.spawnNext();
        seen.push(sb.active.type);
        sb.hardDrop();
        if (sb.state !== 'running') break;
      }
      return { seen, board: JSON.stringify(sb.board.map((r) => r.map((c) => (c ? c.kind + ':' + (c.material || '') : '')))), score: sb.score };
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.seen.length).toBeGreaterThan(5);
  });
});

describe('§1 metallic slab draw (teacher addition)', () => {
  it('gold and silver slabs paint a five-stop vertical gradient and a specular band; plain cells do not', () => {
    for (const [material, stops] of [
      ['gold', ['#7A4F00', '#F2C14E', '#FFF1B0', '#D9A62E', '#6E4400']],
      ['silver', ['#4A4F57', '#C9D1D9', '#F4F7FA', '#AEB6C0', '#3E434A']],
    ]) {
      drawLog.length = 0;
      sb.drawSquareBlock(10, 20, 48, 48, material, 1);
      const gradients = drawLog.filter((e) => e.fn === 'createLinearGradient');
      expect(gradients).toHaveLength(2);
      const [base, spec] = gradients;
      expect(base.args).toEqual([10, 20, 10, 68]);   // vertical, top to bottom of the slab
      expect(base.gradient.stops.map((s) => s[1])).toEqual(stops);
      expect(spec.gradient.stops.map((s) => s[1])[1]).toBe(material === 'gold' ? 'rgba(255,246,213,0.6)' : 'rgba(255,255,255,0.55)');
      expect(drawLog.some((e) => e.fn === 'clip')).toBe(true);
      // brushed texture: four 1 px lines
      expect(drawLog.filter((e) => e.fn === 'fillRect' && e.args[3] === 1)).toHaveLength(4);
    }
    drawLog.length = 0;
    sb.drawCell(0, 0, 12, '#f5e04b', false);
    expect(drawLog.some((e) => e.fn === 'createLinearGradient')).toBe(false);
  });

  it('a board with a slab and plain cells: one gradient pair per slab, none for plain cells', () => {
    fourBlocks(0, 20);
    sb.detectSquares();
    sb.board[23][9] = garbage();
    drawLog.length = 0;
    sb.drawBoardCells();
    expect(drawLog.filter((e) => e.fn === 'createLinearGradient')).toHaveLength(2);
  });

  it('a partial slab draws its gradient over its CURRENT rows only', () => {
    fourBlocks(0, 20);
    sb.detectSquares();
    for (let x = 4; x < 10; x++) sb.board[23][x] = garbage();
    sb.clearLines();
    drawLog.length = 0;
    sb.drawBoardCells();
    const base = drawLog.find((e) => e.fn === 'createLinearGradient');
    expect(base.args[3] - base.args[1]).toBe(3 * sb.CELL);   // three rows tall now
  });

  it('the sweep phase comes from the game tick, not the clock: 1.2 s first pass, then one every 6 s', () => {
    sb.tick = 100;
    sb._slabBornAt = { 7: 100 };
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1);
    const a = sb._slabSweepPhase(7);
    now.mockReturnValue(9_999_999);
    expect(sb._slabSweepPhase(7)).toBe(a);
    now.mockRestore();
    expect(a).toBe(0);
    sb.tick = 136; expect(sb._slabSweepPhase(7)).toBe(0.5);           // halfway through the first 72-tick pass
    sb.tick = 172 + 180; expect(sb._slabSweepPhase(7)).toBe(0.5);     // halfway through a 360-tick drift pass
    sb.tick = 172 + 360; expect(sb._slabSweepPhase(7)).toBe(0);
    // update() advances the tick once per fixed step; a fused slab records the tick it fused at.
    sb.resetBoardState();
    expect(sb.tick).toBe(0);
    sb.state = 'running';
    sb.active = null; sb.spawnTimer = 1000;
    sb.update(16.67, 0); sb.update(16.67, 0);
    expect(sb.tick).toBe(2);
    fourBlocks(0, 20);
    sb.detectSquares();
    expect(sb._slabBornAt[slabCells()[0].squareId]).toBe(2);
  });
});

describe('§2 1v1 garbage values', () => {
  function liveMatch() {
    sb.mode = '1v1';
    sb.mpState = { roomId: 'r', opponent: 'Bob', pendingGarbage: 0 };
    stub('sendGameMessage', (msg) => { sent.push(msg); });
    stub('sendGameState', () => {});
    stub('draw', () => {});   // the split view's opponent board is not under test here
  }
  function lockCompletingGold(types) {
    placeO(1, 0, 20, types[0]); placeO(2, 2, 20, types[1]); placeO(3, 0, 22, types[2]);
    for (let x = 4; x < 10; x++) sb.board[23][x] = garbage();
    sb.active = { id: 4, type: 'O', rot: 0, x: 1, y: 22 };
    sb.lockPiece();
  }

  it('a single through a gold square sends 0 + 2 = 2 rows, in the same game_garbage message', () => {
    liveMatch();
    lockCompletingGold(['O', 'O', 'O']);
    expect(sent.filter((m) => m.type === 'game_garbage')).toEqual([{ type: 'game_garbage', lines: 2 }]);
    expect(sb.mpState.myGoldClears).toBe(1);
  });

  it('a single through a silver square sends 0 + 1 = 1 row', () => {
    liveMatch();
    sb.board[20][0] = null;
    placeO(1, 0, 20, 'T'); placeO(2, 2, 20, 'O'); placeO(3, 0, 22, 'S');
    for (let x = 4; x < 10; x++) sb.board[23][x] = garbage();
    sb.active = { id: 4, type: 'O', rot: 0, x: 1, y: 22 };
    sb.lockPiece();
    expect(sent.filter((m) => m.type === 'game_garbage')).toEqual([{ type: 'game_garbage', lines: 1 }]);
    expect(sb.mpState.myGoldClears || 0).toBe(0);
  });

  it('received garbage rows are plain cells (never slab material)', () => {
    liveMatch();
    sb.mpState.pendingGarbage = 2;
    sb.insertGarbage();
    const bottom = sb.board[ROWS - 1].filter(Boolean);
    expect(bottom.length).toBeGreaterThan(0);
    expect(bottom.every((c) => c.kind !== 'square' && !c.material)).toBe(true);
  });
});

describe('§3 the gold lines reported to bet/resolve', () => {
  // Codex review 2026-10-10: the witness comes from the score / lines / level values every
  // game_state already carries (not from a free-form board snapshot), and its trust level is the
  // base stake's (both rest on the clients' own reports; the server pays only on agreement).
  it('the derivation is unique: gold lines from (Δscore, Δlines, level) for every clear of 1-4 lines', () => {
    for (let level = 1; level <= 12; level++) {
      for (let n = 1; n <= 4; n++) {
        for (let gold = 0; gold <= n; gold++) {
          for (let silver = 0; silver + gold <= n; silver++) {
            const plain = n - gold - silver;
            const points = level * (100 * plain + 500 * silver + 1000 * gold);
            expect(sb._goldLinesFromDeltas(points, n, level), `L${level} p${plain} s${silver} g${gold}`).toBe(gold);
            expect(sb._goldLinesFromDeltas(points + 10, n, level), 'with a perfect clear').toBe(gold);
          }
        }
      }
    }
    expect(sb._goldLinesFromDeltas(2 * 500 * 1, 2, 1)).toBe(0);    // a double SILVER never reads as gold
    expect(sb._goldLinesFromDeltas(-5000, -10, 3)).toBe(0);        // a new game resets the score
    expect(sb._goldLinesFromDeltas(1234, 1, 1)).toBe(0);           // not one clear (a lost message): nothing
  });

  it('a gold fuse + four-line clear in ONE lock is witnessed by the opponent (from the real engine\'s score)', () => {
    // Side A: the active O completes a gold 4x4 on rows 20-23 (cols 0-3) and rows 20-23 are
    // otherwise full, so the same lock fuses the slab and clears four gold lines.
    const sentStates = [];
    sb.mode = '1v1';
    sb.mpState = { roomId: 'r', opponent: 'Bob', pendingGarbage: 0 };
    stub('sendGameMessage', () => {});
    stub('sendGameState', () => { sentStates.push({ score: sb.score, lines: sb.lines, level: sb.level }); });
    stub('draw', () => {});
    placeO(1, 0, 20); placeO(2, 2, 20); placeO(3, 0, 22);
    for (let y = 20; y < 24; y++) for (let x = 4; x < 10; x++) sb.board[y][x] = garbage();
    sb.level = 2;
    const before = { score: sb.score, lines: sb.lines, level: sb.level };
    sb.active = { id: 4, type: 'O', rot: 0, x: 1, y: 22 };
    sb.lockPiece();
    expect(sb.mpState.myGoldClears).toBe(4);
    const after = sentStates[sentStates.length - 1];
    expect(after.score - before.score).toBe(2 * 4 * 1000 + 10);   // four gold lines at level 2 + perfect clear
    // Side B: the same two state values, as the relay delivers them.
    sb.mpState = { roomId: 'r', opponent: 'Alice' };
    sb._witnessOpponentGold(before);
    sb._witnessOpponentGold(after);
    expect(sb.mpState.oppGoldClears).toBe(4);
  });

  it('a double SILVER clear in one event is not witnessed as gold; a fresh game restarts the witness', () => {
    sb.mpState = { roomId: 'r', opponent: 'Bob' };
    sb._witnessOpponentGold({ score: 0, lines: 0, level: 1 });
    sb._witnessOpponentGold({ score: 1000, lines: 2, level: 1 });   // 2 silver lines × 500
    expect(sb.mpState.oppGoldClears || 0).toBe(0);
    sb._witnessOpponentGold({ score: 1100, lines: 3, level: 1 });   // a plain single
    expect(sb.mpState.oppGoldClears || 0).toBe(0);
    sb._witnessOpponentGold({ score: 2100, lines: 4, level: 1 });   // a gold single
    expect(sb.mpState.oppGoldClears).toBe(1);
    sb._witnessOpponentGold({ score: 0, lines: 0, level: 1 });      // new game: negative delta, nothing
    expect(sb.mpState.oppGoldClears).toBe(1);
  });

  it('updateOpponentState feeds the witness from the existing fields (no board needed)', () => {
    sb.mpState = { roomId: 'r', opponent: 'Bob', opponentBoard: Array.from({ length: 24 }, () => Array(10).fill(null)) };
    stub('drawOpponentBoard', () => {});
    sb.updateOpponentState({ roomId: 'r', score: 0, lines: 0, level: 1 });
    sb.updateOpponentState({ roomId: 'r', score: 1000, lines: 1, level: 1 });
    expect(sb.mpState.oppGoldClears).toBe(1);
  });

  it('wording: lobby "Stake 1 🍬 · a gold clear doubles the pot"; in game "pot 2 🍬 · gold ×2"', () => {
    expect(html).toContain('>Stake 1 🍬 · a gold clear doubles the pot</div>');
    expect(html).not.toContain('winner takes 2 🍬, loser pays 1');
    expect(html).toContain("' \\u00b7 pot 2 \\ud83c\\udf6c \\u00b7 gold \\u00d72'");
    expect(html).toMatch(/same trust level as the base stake/);
  });

  it('the resolve body carries { me: myGoldClears, opponent: oppGoldClears }', async () => {
    const posts = [];
    globalThis._dogeWalletAction = (p, body) => { posts.push(body); return Promise.resolve({ ok: true, status: 'settled', premiumPaid: true }); };
    sb.mpUsername = 'Me';
    sb.mpState = { roomId: 'r9', opponent: 'Bob', myWins: 1, oppWins: 0, myGoldClears: 2, oppGoldClears: 0 };
    sb._pendingSettlements = null;
    stub('draw', () => {});
    await sb._studyBreakResolveStakes();
    expect(posts[0]).toEqual({ matchId: 'r9', winnerUsername: 'Me', goldClears: { Me: 2, Bob: 0 } });
    expect(sb.mpState.candyOutcome).toBe('+2');   // the server paid the premium
    delete globalThis._dogeWalletAction;
  });
});

describe('§4 sounds', () => {
  let audio;
  beforeEach(() => {
    audio = makeAudio();
    SFXobj.ctx = audio.ctx;
    SFXobj.muted = false;
    globalThis.MacSFX.muted = false;
  });
  const oscFreqs = () => audio.nodes.filter((n) => n.kind === 'osc').map((o) => o.frequencyEvents[0][1]);
  const oscGains = () => audio.nodes.filter((n) => n.kind === 'osc').map((o) => o.next.gainEvents);

  it('the gate: muted (game mute or the Desk Sound option) plays nothing', () => {
    SFXobj.muted = true;
    SFXobj.play('fuseGold', 0.7);
    expect(audio.nodes).toHaveLength(0);
    SFXobj.muted = false;
    globalThis.MacSFX.muted = true;
    SFXobj.play('squareChimeSilver', 0.6);
    expect(audio.nodes).toHaveLength(0);
  });

  it('fuse (silver): E6 1318 + B6 1976 sines, 2 ms attack, 350 ms exponential decay, 6-9 kHz sparkle 80 ms', () => {
    SFXobj.play('fuseSilver', 0.6);
    expect(oscFreqs()).toEqual([1318, 1976]);
    for (const g of oscGains()) {
      expect(g[1][0]).toBe('linear'); expect(g[1][2]).toBeCloseTo(10.002, 6);
      expect(g[2][0]).toBe('exp'); expect(g[2][2]).toBeCloseTo(10.002 + 0.35, 6);
    }
    const band = audio.nodes.find((n) => n.kind === 'biquad');
    expect(band.type).toBe('bandpass');
    expect(band.frequencyEvents[0][1]).toBe(7500);
    expect(band.QEvents[0][1]).toBe(2.5);
    const noise = audio.nodes.find((n) => n.kind === 'buffer');
    expect(noise.stopAt - noise.startAt).toBeCloseTo(0.08, 6);
  });

  it('fuse (gold): A6 1760 + E7 2637 + 3520 Hz, 450 ms decay', () => {
    SFXobj.play('fuseGold', 0.7);
    expect(oscFreqs()).toEqual([1760, 2637, 3520]);
    for (const g of oscGains()) expect(g[2][2]).toBeCloseTo(10.002 + 0.45, 6);
  });

  it('square clear chime: 60 ms after the line-clear cue, two rising notes of 200 ms', () => {
    SFXobj.play('squareChimeSilver', 0.6);
    let osc = audio.nodes.filter((n) => n.kind === 'osc');
    expect(osc.map((o) => o.frequencyEvents[0][1])).toEqual([1318, 1976]);
    expect(osc.map((o) => o.startAt)).toEqual([10.06, 10.26]);
    audio.nodes.length = 0;
    SFXobj.play('squareChimeGold', 0.6);
    osc = audio.nodes.filter((n) => n.kind === 'osc');
    expect(osc.map((o) => o.frequencyEvents[0][1])).toEqual([1760, 2637]);
  });

  it('lockPiece plays the gold fuse bell, then the line-clear cue + the gold chime on a square clear', () => {
    const played = [];
    const play = vi.spyOn(SFXobj, 'play').mockImplementation((name) => { played.push(name); });
    placeO(1, 0, 20); placeO(2, 2, 20); placeO(3, 0, 22);
    for (let x = 4; x < 10; x++) sb.board[23][x] = garbage();
    sb.active = { id: 4, type: 'O', rot: 0, x: 1, y: 22 };
    sb.lockPiece();
    play.mockRestore();
    expect(played).toEqual(['fuseGold', 'boing', 'squareChimeGold']);
  });
});

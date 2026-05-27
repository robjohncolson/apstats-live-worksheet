/**
 * tests/classroom-board-tally-chute.test.js
 *
 * V7.11 mechanic-first / Zone 3 -- TallyChuteSprite + syncLevelTallyChutes.
 * Pins the visual-only data-pattern columns added in the V7.11 sprint
 * (BUILD doc sections 5 + 7 + 8). Section 6 (RowBlock ephemeral
 * animation) is OUT OF SCOPE for V7.11 MVP -- deferred to V7.13.
 *
 * Coverage:
 *   - Constructor wires id, x, y, size, label, getCount.
 *   - Constructor defaults: label='A', size=28, getCount=()=>0,
 *     _bobT=0, zIndex=5 (same band as coins / key / goal / pads / gates).
 *   - _colorForLabel returns warm amber for 'A', cool blue for 'B',
 *     neutral gray fallback for other letters (no crash).
 *   - render() count=0 -> empty column (no block fillRect calls) but
 *     STILL paints label + count text glyphs.
 *   - render() count=5 -> exactly 5 fillRect calls for stacked blocks +
 *     "5" count number.
 *   - render() count=12 -> exactly 12 fillRect calls (max visible) +
 *     "12" count number (NOT overflow).
 *   - render() count=13 -> exactly 12 fillRect calls + "12+" overflow
 *     indicator (off-by-one boundary).
 *   - render() count=999 -> still exactly 12 fillRect calls + "12+".
 *   - render() handles negative / NaN / null getCount return without
 *     crashing (defensive against wire glitches).
 *   - Camera adoption: render() calls _translateForCamera at the top
 *     and _restoreFromCamera at the end (world-bucket pattern).
 *   - render() is null-ctx safe.
 *   - getLabelSpec() returns null (chute paints its own label inline).
 *   - syncLevelTallyChutes spawns one TallyChuteSprite per
 *     state.tallyChutes[] entry.
 *   - syncLevelTallyChutes despawns ALL chutes when activity ends.
 *   - syncLevelTallyChutes despawns ALL chutes when phase advances to
 *     LEVEL_CLEARED.
 *   - syncLevelTallyChutes is null-safe when state.tallyChutes is
 *     missing entirely (legacy / non-V7.11 levels).
 *   - syncLevelTallyChutes is null-safe when state.tallyChutes is an
 *     empty array.
 *   - Spawned chute reads its count from mount-scope state.tally.sips
 *     each tick (per-tick refresh, no diff detection).
 *   - syncLevelTallyChutes refreshes label + position when the wire
 *     re-emits a known chute id with new coords (level hot-swap).
 *
 * Strategy mirrors tests/classroom-board-gate.test.js -- vitest +
 * jsdom, load classroom-board.js into a vm context, exercise the
 * exposed _TallyChuteSprite constructor + mount() the board for the
 * wire-shape integration tests.
 *
 * ASCII-only. LF line endings.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BOARD_SRC = readFileSync(resolve(REPO_ROOT, 'classroom-board.js'), 'utf8');

// --- mock WebSocket factory (mirrors classroom-board-gate.test.js) ----

function makeMockWSClass() {
  var last = null;

  function MockWebSocket(url) {
    this.url        = url;
    this.readyState = 0;
    this.sent       = [];
    this.onopen     = null;
    this.onmessage  = null;
    this.onerror    = null;
    this.onclose    = null;
    last = this;
  }

  MockWebSocket.prototype.send = function (data) {
    this.sent.push(data);
  };

  MockWebSocket.prototype.close = function () {
    this.readyState = 3;
    if (this.onclose) { this.onclose({}); }
  };

  MockWebSocket.prototype._receive = function (obj) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(obj) });
    }
  };

  MockWebSocket.prototype._open = function () {
    this.readyState = 1;
    if (this.onopen) { this.onopen({}); }
  };

  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN       = 1;
  MockWebSocket.CLOSING    = 2;
  MockWebSocket.CLOSED     = 3;

  Object.defineProperty(MockWebSocket, 'last', { get: function () { return last; } });

  return MockWebSocket;
}

// --- engine stubs (mirrors classroom-board-gate.test.js) --------------

function makeEngineStubs(win) {
  function StubCanvasEngine(canvasId) {
    this.canvas   = win.document.getElementById(canvasId);
    this.ctx      = null;
    this.entities = new Map();
    this.running  = false;
  }

  StubCanvasEngine.prototype.addEntity = function (id, entity) {
    this.entities.set(id, entity);
    entity.engine = this;
    if (entity.onAdded) { entity.onAdded(); }
  };

  StubCanvasEngine.prototype.removeEntity = function (id) {
    var entity = this.entities.get(id);
    this.entities.delete(id);
    if (entity && entity.onRemoved) { entity.onRemoved(); }
  };

  StubCanvasEngine.prototype.start = function () { this.running = true; };
  StubCanvasEngine.prototype.stop  = function () { this.running = false; };

  Object.defineProperty(StubCanvasEngine.prototype, 'groundY', {
    get: function () {
      var h = (this.canvas && this.canvas.height) || 300;
      return h - 50;
    }
  });

  function StubSpriteSheet(src, fw, fh, opts) {
    this.loaded      = true;
    this.frameWidth  = fw;
    this.frameHeight = fh;
    this.columns     = (opts && opts.columns) || 11;
    this.rows        = (opts && opts.rows)    || 2;
  }
  StubSpriteSheet.prototype.drawFrame = function () { /* no-op */ };

  win.CanvasEngine = StubCanvasEngine;
  win.SpriteSheet  = StubSpriteSheet;
}

function injectEnvStubs(win) {
  try { win.devicePixelRatio = 1; } catch (_) {}
  try { win.innerWidth = 800; } catch (_) {}
  try { win.innerHeight = 600; } catch (_) {}
  try {
    Object.defineProperty(win, 'performance', {
      value: { now: function () { return 0; } },
      writable: true, configurable: true
    });
  } catch (_) {}
  try { win.requestAnimationFrame = function () {}; } catch (_) {}
  win.Map = Map;
}

// --- boot helpers ------------------------------------------------------

function makeBoard() {
  var dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com'
  });
  var win    = dom.window;
  var MockWS = makeMockWSClass();

  win.WebSocket     = MockWS;
  win.setInterval   = function () { return 0; };
  win.clearInterval = function () {};
  win.setTimeout    = function () { return 0; };
  win.clearTimeout  = function () {};
  injectEnvStubs(win);
  makeEngineStubs(win);

  var ctx = createContext(win);
  runInContext(BOARD_SRC, ctx);

  return {
    win:            win,
    ClassroomBoard: win.ClassroomBoard,
    MockWS:         MockWS,
    dom:            dom
  };
}

// makeMountWithEngine: tracing wrapper around CanvasEngine so the
// syncLevelTallyChutes test can reach the latest engine instance + entities Map.
function makeMountWithEngine() {
  var dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="mount"></div></body></html>',
    { url: 'https://example.com' }
  );
  var win    = dom.window;
  var MockWS = makeMockWSClass();

  win.WebSocket     = MockWS;
  win.setInterval   = function () { return 0; };
  win.clearInterval = function () {};
  win.setTimeout    = function () { return 0; };
  win.clearTimeout  = function () {};
  injectEnvStubs(win);
  makeEngineStubs(win);

  var lastEngine = null;
  var RealEngine = win.CanvasEngine;
  function TracingEngine(canvasId) {
    RealEngine.call(this, canvasId);
    lastEngine = this;
  }
  TracingEngine.prototype = Object.create(RealEngine.prototype);
  TracingEngine.prototype.constructor = TracingEngine;
  win.CanvasEngine = TracingEngine;

  var ctx = createContext(win);
  runInContext(BOARD_SRC, ctx);

  var container = win.document.getElementById('mount');

  return {
    win:            win,
    ClassroomBoard: win.ClassroomBoard,
    MockWS:         MockWS,
    container:      container,
    getEngine:      function () { return lastEngine; }
  };
}

// Shared ctx stub for render() pin tests -- records every save/restore/
// draw call so the tests can count blocks + verify the camera bracket.
function makeCtxStub() {
  var calls = {
    save:       0,
    restore:    0,
    fillRect:   [],
    strokeRect: [],
    fillText:   [],
    translate:  []
  };
  return {
    globalAlpha:  1,
    font:         '',
    textAlign:    '',
    textBaseline: '',
    fillStyle:    '',
    strokeStyle:  '',
    lineWidth:    1,
    save:       function () { calls.save += 1; },
    restore:    function () { calls.restore += 1; },
    translate:  function (x, y) { calls.translate.push({ x: x, y: y }); },
    scale:      function () {},
    fillRect:   function (x, y, w, h) { calls.fillRect.push({ x: x, y: y, w: w, h: h }); },
    strokeRect: function (x, y, w, h) { calls.strokeRect.push({ x: x, y: y, w: w, h: h }); },
    fillText:   function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y }); },
    _calls:     calls
  };
}

// =============================================================
// V7.11 TallyChuteSprite -- constructor + opts wiring
// =============================================================

describe('V7.11 TallyChuteSprite -- constructor', () => {
  it('accepts id, x, y, size, label, getCount', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 320, y: 200, size: 28, label: 'A',
      getCount: function () { return 7; }
    });
    expect(chute.id).toBe('tc-A');
    expect(chute.x).toBe(320);
    expect(chute.y).toBe(200);
    expect(chute.size).toBe(28);
    expect(chute.label).toBe('A');
    expect(typeof chute.getCount).toBe('function');
    expect(chute.getCount()).toBe(7);
  });

  it('defaults: label="A", size=28, getCount=()=>0, _bobT=0', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0 });
    expect(chute.label).toBe('A');
    expect(chute.size).toBe(28);
    expect(typeof chute.getCount).toBe('function');
    expect(chute.getCount()).toBe(0);
    expect(chute._bobT).toBe(0);
  });

  it('zIndex is 5 (same band as coins / key / goal / tally / pads / gates)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0, label: 'A' });
    expect(chute.zIndex).toBe(5);
  });

  it('id defaults to empty string when opts.id is missing', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0, label: 'B' });
    expect(chute.id).toBe('');
  });
});

// =============================================================
// V7.11 TallyChuteSprite._colorForLabel -- color per drink letter
// =============================================================

describe('V7.11 TallyChuteSprite._colorForLabel -- color per label', () => {
  it('returns warm amber for label A (matches ChoicePad-A)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0, label: 'A' });
    expect(chute._colorForLabel()).toBe('#FFB74D');
  });

  it('returns cool blue for label B (matches ChoicePad-B)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0, label: 'B' });
    expect(chute._colorForLabel()).toBe('#64B5F6');
  });

  it('returns neutral gray fallback for any other letter (no crash on future drinks)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0, label: 'C' });
    expect(chute._colorForLabel()).toBe('#BBBBBB');
  });
});

// =============================================================
// V7.11 TallyChuteSprite.update -- no-op tick
// =============================================================

describe('V7.11 TallyChuteSprite.update -- no-op tick', () => {
  it('update() accumulates dt into _bobT (animation reserve) but does NOT trigger any callback', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({ x: 0, y: 0, label: 'A' });
    chute.update(0.016);
    expect(chute._bobT).toBeCloseTo(0.016, 5);
    chute.update(0.016);
    expect(chute._bobT).toBeCloseTo(0.032, 5);
  });
});

// =============================================================
// V7.11 TallyChuteSprite.render -- camera adoption (world bucket)
// =============================================================

describe('V7.11 TallyChuteSprite.render -- camera adoption (world bucket)', () => {
  it('render() calls ctx.save() at top (via _translateForCamera) and ctx.restore() at end', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 3; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
  });

  it('render() is null-ctx safe (early return on null)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 0, y: 0, label: 'A',
      getCount: function () { return 3; }
    });
    expect(function () { chute.render(null); }).not.toThrow();
  });
});

// =============================================================
// V7.11 TallyChuteSprite.render -- count-driven block stack
// =============================================================

describe('V7.11 TallyChuteSprite.render -- count-driven block stack', () => {
  it('count=0 -> NO block fillRect calls but STILL paints label + count text', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 0; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(0);
    // Label glyph "A" should appear in the fillText calls.
    var letters = {};
    for (var i = 0; i < ctx._calls.fillText.length; i++) {
      letters[ctx._calls.fillText[i].text] = true;
    }
    expect(letters['A']).toBe(true);
    expect(letters['0']).toBe(true);
  });

  it('count=5 -> exactly 5 stacked block fillRect calls + "5" count number', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 5; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(5);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('5');
    expect(texts).toContain('A');
  });

  it('count=12 -> exactly 12 stacked block fillRect calls + "12" count number (NOT overflow)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-B', x: 200, y: 200, size: 28, label: 'B',
      getCount: function () { return 12; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(12);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('12');
    expect(texts).not.toContain('12+');
    expect(texts).toContain('B');
  });

  it('count=13 -> exactly 12 stacked block fillRect calls + "12+" overflow indicator', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 13; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(12);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('12+');
    expect(texts).not.toContain('13');
  });

  it('count=999 -> still exactly 12 blocks + "12+" (extreme overflow)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 999; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(12);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('12+');
  });

  it('count=1 -> exactly 1 block (off-by-one lower boundary)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 1; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(1);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('1');
  });

  it('blocks stack BOTTOM-UP from the floor (first block y > second block y)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 3; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(3);
    // Stack grows upward -> later blocks have SMALLER y values.
    expect(ctx._calls.fillRect[1].y).toBeLessThan(ctx._calls.fillRect[0].y);
    expect(ctx._calls.fillRect[2].y).toBeLessThan(ctx._calls.fillRect[1].y);
  });

  it('paints color per label: A renders amber-colored blocks; B renders blue', () => {
    var m = makeBoard();
    // We can verify the chute USED the correct color by checking the
    // ctx.fillStyle assignment that preceded the fillRect call. Stub
    // captures the last value at draw time.
    var chuteA = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 2; }
    });
    var ctxA = makeCtxStub();
    // Wrap fillRect to snapshot the fillStyle that's in effect at draw.
    var seenFillsA = [];
    ctxA.fillRect = function (x, y, w, h) {
      seenFillsA.push({ x: x, y: y, w: w, h: h, fillStyle: this.fillStyle });
      ctxA._calls.fillRect.push({ x: x, y: y, w: w, h: h });
    };
    chuteA.render(ctxA);
    expect(seenFillsA.length).toBe(2);
    expect(seenFillsA[0].fillStyle).toBe('#FFB74D');

    var chuteB = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-B', x: 200, y: 200, size: 28, label: 'B',
      getCount: function () { return 2; }
    });
    var ctxB = makeCtxStub();
    var seenFillsB = [];
    ctxB.fillRect = function (x, y, w, h) {
      seenFillsB.push({ x: x, y: y, w: w, h: h, fillStyle: this.fillStyle });
      ctxB._calls.fillRect.push({ x: x, y: y, w: w, h: h });
    };
    chuteB.render(ctxB);
    expect(seenFillsB.length).toBe(2);
    expect(seenFillsB[0].fillStyle).toBe('#64B5F6');
  });
});

// =============================================================
// V7.11 TallyChuteSprite.render -- defensive getCount handling
// =============================================================

describe('V7.11 TallyChuteSprite.render -- defensive getCount handling', () => {
  it('getCount returns NaN -> treated as 0 (no crash, no blocks)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return NaN; }
    });
    var ctx = makeCtxStub();
    expect(function () { chute.render(ctx); }).not.toThrow();
    expect(ctx._calls.fillRect.length).toBe(0);
  });

  it('getCount returns negative -> treated as 0 (no crash, no blocks)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return -5; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(0);
  });

  it('getCount throws -> caught; treated as 0 (no crash)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { throw new Error('wire glitch'); }
    });
    var ctx = makeCtxStub();
    expect(function () { chute.render(ctx); }).not.toThrow();
    expect(ctx._calls.fillRect.length).toBe(0);
  });

  it('getCount returns non-integer 3.7 -> floors to 3', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 3.7; }
    });
    var ctx = makeCtxStub();
    chute.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(3);
  });
});

// =============================================================
// V7.11 TallyChuteSprite.getLabelSpec -- inline label, no engine pass
// =============================================================

describe('V7.11 TallyChuteSprite.getLabelSpec -- inline label', () => {
  it('returns null (chute paints its own label + count inside render)', () => {
    var m = makeBoard();
    var chute = new m.ClassroomBoard._TallyChuteSprite({
      id: 'tc-A', x: 100, y: 200, size: 28, label: 'A',
      getCount: function () { return 5; }
    });
    expect(chute.getLabelSpec()).toBeNull();
  });
});

// =============================================================
// V7.11 syncLevelTallyChutes -- spawn / despawn lifecycle
// =============================================================

describe('V7.11 syncLevelTallyChutes -- spawn / despawn lifecycle', () => {
  // Helper: drive the board to a SIPPING-phase level with TallyChutes on
  // the wire. Default = U1.1-shape pilot (2 chutes: A + B).
  function _sippingMsg(opts) {
    opts = opts || {};
    var defaultChutes = [
      { id: 'tc-A', x: 32, y: 5, label: 'A' },
      { id: 'tc-B', x: 34, y: 5, label: 'B' }
    ];
    var chutes  = (opts.chutes === undefined) ? defaultChutes : opts.chutes;
    var players = (opts.players === undefined)
      ? { alice: { x: 100, y: 200, marks: { sampledA: false, sampledB: false, choice: null } } }
      : opts.players;
    var tally   = (opts.tally === undefined)
      ? { sips: { A: 0, B: 0 } }
      : opts.tally;
    return {
      type: 'classroom_activity_start',
      activity: {
        type: 'level',
        startedAt: 1000,
        durationMs: 60000,
        level: {
          schema: 'v7.5-level-1', levelKey: 'U1.1', lessonKey: '1.1',
          title: 'Cola mystery', duration: 60,
          map: { width: 48, height: 8, chipSize: 10 },
          actors: []
        },
        state: {
          phase: opts.phase || 'SIPPING',
          currentStage: 0,
          stagesTotal:  1,
          coins:        [],
          choicePads:   [],
          gates:        [],
          tallyChutes:  chutes,
          tally:        tally,
          players:      players
        }
      }
    };
  }

  it('spawns one TallyChuteSprite per state.tallyChutes[] entry (U1.1 pilot = 2 chutes)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());

    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(true);
    expect(engine.entities.has('tallychute_tc-B')).toBe(true);
    var chuteA = engine.entities.get('tallychute_tc-A');
    var chuteB = engine.entities.get('tallychute_tc-B');
    expect(chuteA).toBeInstanceOf(m.ClassroomBoard._TallyChuteSprite);
    expect(chuteA.label).toBe('A');
    expect(chuteB.label).toBe('B');

    handle.destroy();
  });

  it('despawns ALL chutes when activity ends (success / cancel / timeout)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(true);
    expect(engine.entities.has('tallychute_tc-B')).toBe(true);

    ws._receive({ type: 'classroom_activity_success' });
    expect(engine.entities.has('tallychute_tc-A')).toBe(false);
    expect(engine.entities.has('tallychute_tc-B')).toBe(false);

    handle.destroy();
  });

  it('despawns ALL chutes when phase advances to LEVEL_CLEARED', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(true);

    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'LEVEL_CLEARED',
        currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [],
        tallyChutes: [
          { id: 'tc-A', x: 32, y: 5, label: 'A' },
          { id: 'tc-B', x: 34, y: 5, label: 'B' }
        ],
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: 'A' } } }
      }
    });

    expect(engine.entities.has('tallychute_tc-A')).toBe(false);
    expect(engine.entities.has('tallychute_tc-B')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.tallyChutes missing entirely (legacy V7.5/V7.7/V7.8/V7.10 levels)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    expect(function () {
      ws._receive({
        type: 'classroom_activity_start',
        activity: {
          type: 'level',
          startedAt: 1000, durationMs: 60000,
          level: {
            schema: 'v7.5-level-1', levelKey: 'legacy', lessonKey: 'x',
            title: 'Legacy', duration: 60,
            map: { width: 32, height: 8, chipSize: 10 }, actors: []
          },
          state: {
            phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
            coins: [], choicePads: [], gates: []
            // no tallyChutes -- legacy shape
          }
        }
      });
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.tallyChutes is an empty array (no spawn, no crash)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    expect(function () {
      ws._receive(_sippingMsg({ chutes: [] }));
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(false);

    handle.destroy();
  });

  it('spawned chute reads getCount from mount-scope state.tally.sips each tick', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Initial wire: A=0, B=0.
    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var chuteA = engine.entities.get('tallychute_tc-A');
    var chuteB = engine.entities.get('tallychute_tc-B');
    expect(chuteA.getCount()).toBe(0);
    expect(chuteB.getCount()).toBe(0);

    // Server tick: tally bumped to A=3, B=2 (the class has been sipping).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [],
        tallyChutes: [
          { id: 'tc-A', x: 32, y: 5, label: 'A' },
          { id: 'tc-B', x: 34, y: 5, label: 'B' }
        ],
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: null } } }
      }
    });

    // Same entity instance, fresh wire state -- closure reaches MOUNT-scope.
    expect(chuteA.getCount()).toBe(3);
    expect(chuteB.getCount()).toBe(2);

    handle.destroy();
  });

  it('getCount returns 0 when state.tally is missing entirely (null-safe wire shape)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Spawn the chute with state.tally absent (defensive guard).
    ws._receive(_sippingMsg({ tally: undefined }));
    var engine = m.getEngine();
    var chuteA = engine.entities.get('tallychute_tc-A');
    expect(chuteA.getCount()).toBe(0);

    handle.destroy();
  });

  it('refreshes label + position when wire re-emits a known chute id with new coords', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var chuteA = engine.entities.get('tallychute_tc-A');
    var originalX = chuteA.x;
    expect(chuteA.label).toBe('A');

    // Wire re-emit: same id, different x (level hot-swap).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [],
        tallyChutes: [
          { id: 'tc-A', x: 40, y: 5, label: 'A' },
          { id: 'tc-B', x: 42, y: 5, label: 'B' }
        ],
        tally: { sips: { A: 1, B: 0 } },
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: false, choice: null } } }
      }
    });

    // Same entity (id matches), but x has been re-applied from the wire.
    var chuteA2 = engine.entities.get('tallychute_tc-A');
    expect(chuteA2).toBe(chuteA);             // same instance
    expect(chuteA2.x).not.toBe(originalX);    // x re-applied
    expect(chuteA2.label).toBe('A');

    handle.destroy();
  });

  it('despawns chutes that vanish from a subsequent wire tick (state.tallyChutes shrinks)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(true);
    expect(engine.entities.has('tallychute_tc-B')).toBe(true);

    // Wire emits ONLY tc-A this tick -- tc-B should despawn.
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [],
        tallyChutes: [
          { id: 'tc-A', x: 32, y: 5, label: 'A' }
        ],
        tally: { sips: { A: 1, B: 0 } },
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: false, choice: null } } }
      }
    });

    expect(engine.entities.has('tallychute_tc-A')).toBe(true);
    expect(engine.entities.has('tallychute_tc-B')).toBe(false);

    handle.destroy();
  });

  it('count from wire renders correct number of blocks via integration (5 sips -> 5 blocks)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg({ tally: { sips: { A: 5, B: 1 } } }));
    var engine = m.getEngine();
    var chuteA = engine.entities.get('tallychute_tc-A');
    var ctx = makeCtxStub();
    chuteA.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(5);

    handle.destroy();
  });

  it('chutes are NOT spawned for legacy U1.2 shape (no tallyChutes on wire)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // U1.2-shape level: V7.10 wire with coins / choicePads / gates but
    // NO tallyChutes field (the legacy shape every pre-V7.11 ship emits).
    ws._receive({
      type: 'classroom_activity_start',
      activity: {
        type: 'level',
        startedAt: 1000, durationMs: 60000,
        level: {
          schema: 'v7.5-level-1', levelKey: 'U1.2', lessonKey: '1.2',
          title: 'Legacy', duration: 60,
          map: { width: 32, height: 8, chipSize: 10 }, actors: []
        },
        state: {
          phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
          coins: [],
          choicePads: [{ id: 'cp-A', x: 8, y: 4, value: 'A' }],
          gates: []
        }
      }
    });

    var engine = m.getEngine();
    expect(engine.entities.has('tallychute_tc-A')).toBe(false);
    expect(engine.entities.has('tallychute_tc-B')).toBe(false);

    handle.destroy();
  });
});

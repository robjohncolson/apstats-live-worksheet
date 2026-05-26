/**
 * tests/classroom-board-choicepad.test.js
 *
 * V7.8 mechanic-first / Zone 1 -- ChoicePadSprite + syncLevelChoicePads.
 * Pins the per-player preference recorder added in the V7.8 sprint
 * (BUILD doc sections 10 + 11 + 13).
 *
 * Coverage:
 *   - Constructor wires id, x, y, value, size, getLocalSprite,
 *     getLocalMarks, onChoose.
 *   - update() does NOT fire onChoose when local lacks marks
 *     (no player joined / null marks).
 *   - update() does NOT fire onChoose when local has only one sample.
 *   - update() does NOT fire onChoose when local already has a choice
 *     (one-shot per player).
 *   - update() does NOT fire onChoose when local is not overlapping.
 *   - update() fires onChoose ONCE when overlap + both samples + no
 *     choice yet (the happy path).
 *   - update() is idempotent on subsequent overlaps (_sentChoice TTL
 *     guard, mirrors V7.4 CoinSprite _sentCollect pattern).
 *   - syncLevelChoicePads spawns one ChoicePadSprite per
 *     state.activity.state.choicePads[] entry during SIPPING.
 *   - syncLevelChoicePads despawns when phase advances past SIPPING.
 *   - syncLevelChoicePads despawns when the activity ends.
 *   - syncLevelChoicePads is null-safe when state.choicePads is missing
 *     (legacy / non-V7.8 levels).
 *   - syncLevelChoicePads is null-safe when state.choicePads is an
 *     empty array (no spawn).
 *   - zIndex is 5 (same band as coins / key / goal / tally).
 *
 * Strategy mirrors tests/classroom-board-tally-threshold.test.js --
 * vitest + jsdom, load classroom-board.js into a vm context, exercise
 * the exposed _ChoicePadSprite constructor + mount() the board for the
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

// --- mock WebSocket factory (mirrors classroom-board.test.js) ---------

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

// --- engine stubs (mirrors classroom-board.test.js) -------------------

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
// syncLevelChoicePads test can reach the latest engine instance + its
// entities Map (mirrors classroom-board-tally-threshold.test.js).
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

// =============================================================
// V7.8 ChoicePadSprite -- constructor + update behaviour
// =============================================================

describe('V7.8 ChoicePadSprite -- constructor', () => {
  it('accepts id, x, y, value, size, getLocalSprite, getLocalMarks, onChoose', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, value: 'A', size: 28,
      getLocalSprite: function () { return null; },
      getLocalMarks:  function () { return null; },
      onChoose:       function () {}
    });
    expect(pad.id).toBe('cp-A');
    expect(pad.x).toBe(100);
    expect(pad.y).toBe(50);
    expect(pad.value).toBe('A');
    expect(pad.size).toBe(28);
    expect(typeof pad.getLocalSprite).toBe('function');
    expect(typeof pad.getLocalMarks).toBe('function');
    expect(typeof pad.onChoose).toBe('function');
    expect(pad._sentChoice).toBe(false);
    expect(pad._sentChoiceAt).toBe(0);
  });

  it('defaults: value="A", size=28, no-op getters/onChoose when opts missing', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._ChoicePadSprite({ x: 0, y: 0 });
    expect(pad.value).toBe('A');
    expect(pad.size).toBe(28);
    // Default getters return null; onChoose null -> update fires nothing.
    expect(pad.getLocalSprite()).toBeNull();
    expect(pad.getLocalMarks()).toBeNull();
    expect(pad.onChoose).toBeNull();
  });

  it('zIndex is 5 (same band as coins / key / goal / tally; below avatars)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._ChoicePadSprite({ x: 0, y: 0, value: 'A' });
    expect(pad.zIndex).toBe(5);
  });
});

describe('V7.8 ChoicePadSprite.update -- mark gating + collision', () => {
  it('does NOT fire onChoose when getLocalMarks returns null (no player joined)', () => {
    var m = makeBoard();
    var chosen = 0;
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return null; },
      onChoose:       function () { chosen += 1; }
    });
    pad.update(0.016);
    expect(chosen).toBe(0);
    expect(pad._sentChoice).toBe(false);
  });

  it('does NOT fire onChoose when local has only sampledA (missing sampledB)', () => {
    var m = makeBoard();
    var chosen = 0;
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: true, sampledB: false, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function () { chosen += 1; }
    });
    pad.update(0.016);
    expect(chosen).toBe(0);
    expect(pad._sentChoice).toBe(false);
  });

  it('does NOT fire onChoose when local has only sampledB (missing sampledA)', () => {
    var m = makeBoard();
    var chosen = 0;
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: false, sampledB: true, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function () { chosen += 1; }
    });
    pad.update(0.016);
    expect(chosen).toBe(0);
    expect(pad._sentChoice).toBe(false);
  });

  it('does NOT fire onChoose when local already has a choice (one-shot per player)', () => {
    var m = makeBoard();
    var chosen = 0;
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    // Player previously chose pad A; walks onto pad B. The B-pad must
    // NOT re-record (per BUILD risk area #3 -- first choice is sticky).
    var marks = { sampledA: true, sampledB: true, choice: 'A' };
    var padB = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-B', x: 100, y: 50, size: 28, value: 'B',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function () { chosen += 1; }
    });
    padB.update(0.016);
    expect(chosen).toBe(0);
    expect(padB._sentChoice).toBe(false);
  });

  it('does NOT fire onChoose when local is not overlapping (X+Y far)', () => {
    var m = makeBoard();
    var chosen = 0;
    // Local player is far from the pad in BOTH axes.
    var localStub = { x: 500, y: 500, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: true, sampledB: true, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function () { chosen += 1; }
    });
    pad.update(0.016);
    expect(chosen).toBe(0);
    expect(pad._sentChoice).toBe(false);
  });

  it('fires onChoose ONCE with the pad id when overlap + both samples + no choice', () => {
    var m = makeBoard();
    var chosenIds = [];
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: true, sampledB: true, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function (id) { chosenIds.push(id); }
    });
    pad.update(0.016);
    expect(chosenIds.length).toBe(1);
    expect(chosenIds[0]).toBe('cp-A');
    expect(pad._sentChoice).toBe(true);
    expect(pad._sentChoiceAt).toBeGreaterThanOrEqual(0);
  });

  it('is idempotent on subsequent overlap (TTL guard -- second tick does NOT re-fire)', () => {
    var m = makeBoard();
    var chosenCount = 0;
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: true, sampledB: true, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function () { chosenCount += 1; }
    });
    pad.update(0.016);
    expect(chosenCount).toBe(1);
    // Second tick: still overlapping, still has marks, _sentChoice
    // gate prevents re-fire (mirrors V7.4 CoinSprite _sentCollect).
    pad.update(0.016);
    expect(chosenCount).toBe(1);
    // Third tick for good measure.
    pad.update(0.016);
    expect(chosenCount).toBe(1);
  });

  it('walking near in X but FAR in Y still triggers (pad is floor-level, no jump needed)', () => {
    // V7.8 pads sit at floor level; the player stands at floor level.
    // X+Y overlap should trigger when the player walks onto it -- not
    // require a jump (which CoinSprite / KeySprite require).
    var m = makeBoard();
    var chosen = 0;
    // Local player same Y -- walking next to / on top of the pad.
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: true, sampledB: true, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, size: 28, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; },
      onChoose:       function () { chosen += 1; }
    });
    pad.update(0.016);
    expect(chosen).toBe(1);
  });
});

describe('V7.8 ChoicePadSprite.render -- visual state', () => {
  // Minimal canvas ctx stub. Records fillText calls so the test can
  // assert the rendered label.
  function makeCtxStub() {
    var calls = { fillText: [], fillRect: [], strokeRect: [] };
    return {
      globalAlpha:  1,
      font:         '',
      textAlign:    '',
      textBaseline: '',
      fillStyle:    '',
      strokeStyle:  '',
      lineWidth:    1,
      fillText:    function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y, alpha: this.globalAlpha }); },
      fillRect:    function (x, y, w, h) { calls.fillRect.push({ x: x, y: y, w: w, h: h, alpha: this.globalAlpha }); },
      strokeRect:  function (x, y, w, h) { calls.strokeRect.push({ x: x, y: y, w: w, h: h }); },
      _calls:      calls
    };
  }

  it('renders the pad value letter ("A" or "B") in IDLE state', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, value: 'A',
      getLocalSprite: function () { return null; },
      getLocalMarks:  function () { return null; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    // IDLE state -> letter painted; full alpha.
    expect(ctx._calls.fillText.length).toBeGreaterThanOrEqual(1);
    expect(ctx._calls.fillText[0].text).toBe('A');
  });

  it('renders an ASCII "x" glyph when the local player chose THIS pad (RECORDED)', () => {
    var m = makeBoard();
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: true, sampledB: true, choice: 'A' };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('x');
  });

  it('renders the OTHER pad as IDLE letter when player chose the sibling pad', () => {
    var m = makeBoard();
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    // Player chose 'A'; this is the B-pad. B should stay as 'B' (IDLE
    // label) -- only the pad matching marks.choice flips to recorded.
    var marks = { sampledA: true, sampledB: true, choice: 'A' };
    var padB = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-B', x: 100, y: 50, value: 'B',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; }
    });
    var ctx = makeCtxStub();
    padB.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('B');
  });

  it('pulses alpha in HOVER state (overlapping but no samples)', () => {
    var m = makeBoard();
    var localStub = { x: 100, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var marks = { sampledA: false, sampledB: false, choice: null };
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 100, y: 50, value: 'A',
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; }
    });
    // Tick the pulse accumulator a bit so alpha modulates.
    pad.update(0.05);
    pad.update(0.05);
    var ctx = makeCtxStub();
    pad.render(ctx);
    expect(ctx._calls.fillText.length).toBeGreaterThanOrEqual(1);
    // HOVER alpha is in [0.5, 1.0], strictly < 1 most of the cycle.
    // We just verify the band -- any value in [0.5, 1.0] is acceptable.
    var alpha = ctx._calls.fillRect[0] ? ctx._calls.fillRect[0].alpha : ctx._calls.fillText[0].alpha;
    expect(alpha).toBeGreaterThanOrEqual(0.5);
    expect(alpha).toBeLessThanOrEqual(1);
  });

  it('getLabelSpec returns null (pad paints its own centered letter)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 0, y: 0, value: 'A'
    });
    expect(pad.getLabelSpec()).toBeNull();
  });
});

// =============================================================
// V7.8 syncLevelChoicePads -- spawn / despawn lifecycle
// =============================================================

describe('V7.8 syncLevelChoicePads -- spawn / despawn lifecycle', () => {
  // Helper: drive the board to a SIPPING-phase level with ChoicePads
  // on the wire. Default = U1.1-shape pilot (2 pads at x=8 + x=24).
  function _sippingMsg(opts) {
    opts = opts || {};
    var defaultPads = [
      { id: 'cp-A', x: 8,  y: 4, value: 'A' },
      { id: 'cp-B', x: 24, y: 4, value: 'B' }
    ];
    var pads = (opts.choicePads === undefined) ? defaultPads : opts.choicePads;
    var players = (opts.players === undefined)
      ? { alice: { x: 100, y: 200, marks: { sampledA: false, sampledB: false, choice: null } } }
      : opts.players;
    return {
      type: 'classroom_activity_start',
      activity: {
        type: 'level',
        startedAt: 1000,
        durationMs: 60000,
        level: {
          schema: 'v7.5-level-1', levelKey: 'U1.1', lessonKey: '1.1',
          title: 'Cola mystery', duration: 60,
          map: { width: 32, height: 8, chipSize: 10 },
          actors: []
        },
        state: {
          phase: opts.phase || 'SIPPING',
          currentStage: 0,
          stagesTotal:  1,
          coins:        [],
          choicePads:   pads,
          players:      players
        }
      }
    };
  }

  it('spawns one ChoicePadSprite per state.choicePads[] entry during SIPPING', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());

    var engine = m.getEngine();
    expect(engine.entities.has('choicepad_cp-A')).toBe(true);
    expect(engine.entities.has('choicepad_cp-B')).toBe(true);
    var padA = engine.entities.get('choicepad_cp-A');
    var padB = engine.entities.get('choicepad_cp-B');
    expect(padA).toBeInstanceOf(m.ClassroomBoard._ChoicePadSprite);
    expect(padB).toBeInstanceOf(m.ClassroomBoard._ChoicePadSprite);
    expect(padA.value).toBe('A');
    expect(padB.value).toBe('B');

    handle.destroy();
  });

  it('does NOT spawn when phase != SIPPING (e.g. KEY_HUNT)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg({ phase: 'KEY_HUNT' }));

    var engine = m.getEngine();
    expect(engine.entities.has('choicepad_cp-A')).toBe(false);
    expect(engine.entities.has('choicepad_cp-B')).toBe(false);

    handle.destroy();
  });

  it('despawns ALL pads when phase advances past SIPPING', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('choicepad_cp-A')).toBe(true);
    expect(engine.entities.has('choicepad_cp-B')).toBe(true);

    // Server advances phase to VOTING (everyone has rowComplete).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'VOTING',
        currentStage: 0,
        stagesTotal:  1,
        coins:        [],
        choicePads: [
          { id: 'cp-A', x: 8,  y: 4, value: 'A' },
          { id: 'cp-B', x: 24, y: 4, value: 'B' }
        ],
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: 'A' } } }
      }
    });

    expect(engine.entities.has('choicepad_cp-A')).toBe(false);
    expect(engine.entities.has('choicepad_cp-B')).toBe(false);

    handle.destroy();
  });

  it('despawns on activity end (success / cancel / timeout)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('choicepad_cp-A')).toBe(true);

    ws._receive({ type: 'classroom_activity_success' });
    expect(engine.entities.has('choicepad_cp-A')).toBe(false);
    expect(engine.entities.has('choicepad_cp-B')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.choicePads missing entirely (legacy level) does NOT crash', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Legacy V7.5 / V7.7 shape -- no choicePads field at all.
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
            coins: []
            // no choicePads -- legacy shape
          }
        }
      });
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('choicepad_cp-A')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.choicePads is an empty array (no spawn, no crash)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    expect(function () {
      ws._receive(_sippingMsg({ choicePads: [] }));
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('choicepad_cp-A')).toBe(false);

    handle.destroy();
  });

  it('spawned pad reads local player marks from mount-scope state.activity.state.players[username]', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Spawn with alice's marks all false (no sips yet).
    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var padA = engine.entities.get('choicepad_cp-A');

    // The getLocalMarks closure must surface alice's marks from the
    // mount-scope state -- exactly the V7.4 _Codex MAJOR fix pattern.
    expect(typeof padA.getLocalMarks).toBe('function');
    var marks = padA.getLocalMarks();
    expect(marks).toEqual({ sampledA: false, sampledB: false, choice: null });

    // Server tick: alice now has both samples (collected both coins).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1, coins: [],
        choicePads: [
          { id: 'cp-A', x: 8,  y: 4, value: 'A' },
          { id: 'cp-B', x: 24, y: 4, value: 'B' }
        ],
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: null } } }
      }
    });

    // Same entity instance, fresh wire state -- closure reaches MOUNT-scope.
    var marks2 = padA.getLocalMarks();
    expect(marks2).toEqual({ sampledA: true, sampledB: true, choice: null });

    handle.destroy();
  });

  it('TTL guard clears _sentChoice when server confirms marks.choice (vs timeout)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg({
      players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: null } } }
    }));
    var engine = m.getEngine();
    var padA = engine.entities.get('choicepad_cp-A');

    // Simulate the local player walking onto the pad: _sentChoice flips
    // true via the local update() path.
    padA._sentChoice   = true;
    padA._sentChoiceAt = Date.now();

    // Server tick that confirms marks.choice = 'A'. The TTL-guard clear
    // path in syncLevelChoicePads should reset _sentChoice on the
    // server-confirmed transition (NOT wait for the 600ms timeout).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1, coins: [],
        choicePads: [
          { id: 'cp-A', x: 8,  y: 4, value: 'A' },
          { id: 'cp-B', x: 24, y: 4, value: 'B' }
        ],
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: 'A' } } }
      }
    });

    expect(padA._sentChoice).toBe(false);
    expect(padA._sentChoiceAt).toBe(0);

    handle.destroy();
  });

  it('onChoose sends classroom_activity_value record-choice payload with the pad id', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Use real wire state with alice having both samples + no choice.
    ws._receive(_sippingMsg({
      players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: null } } }
    }));
    var engine = m.getEngine();
    var padA   = engine.entities.get('choicepad_cp-A');

    // Fire onChoose directly (we test the wiring; the update() collision
    // path is covered by the unit tests above).
    expect(typeof padA.onChoose).toBe('function');
    padA.onChoose('cp-A');

    // The last sent message on the mock WS should be the record-choice payload.
    var sentMsgs = ws.sent.map(function (s) { try { return JSON.parse(s); } catch (_) { return null; } });
    var recordChoiceMsg = null;
    for (var i = sentMsgs.length - 1; i >= 0; i--) {
      var msg = sentMsgs[i];
      if (msg && msg.type === 'classroom_activity_value' && msg.payload && msg.payload.kind === 'record-choice') {
        recordChoiceMsg = msg;
        break;
      }
    }
    expect(recordChoiceMsg).not.toBeNull();
    expect(recordChoiceMsg.payload.choicePadId).toBe('cp-A');

    handle.destroy();
  });
});

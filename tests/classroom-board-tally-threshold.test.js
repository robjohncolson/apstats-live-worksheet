/**
 * tests/classroom-board-tally-threshold.test.js
 *
 * V7.7 -- TallyDisplay threshold render + syncLevelTally getThreshold
 * wiring. Pins the threshold extension added in the V7.7 sprint
 * (BUILD doc sections 5 + 6 + 7).
 *
 * Coverage:
 *   - Backward compat: no threshold => no "/N" suffix (regression).
 *   - Threshold present => "A: 2/3  B: 1/3".
 *   - Threshold-only (no tally entry for that letter) => "A: 0/3".
 *   - Mixed: tally letter with no threshold entry stays slash-less.
 *   - Extra non-A/B letters in threshold appear in the output.
 *   - syncLevelTally wires getThreshold to read
 *     state.activity.state.tallyConfig.threshold.
 *
 * Strategy mirrors tests/classroom-board.test.js -- vitest + jsdom,
 * load classroom-board.js into a vm context, exercise the exposed
 * _TallyDisplay constructor + mount() the board for the wire-shape
 * integration test.
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
// syncLevelTally test can reach the latest engine instance + its
// entities Map (mirrors classroom-board.test.js).
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

// --- canvas context stub (mirrors classroom-board.test.js) ------------

function makeCtxStub() {
  var calls = { fillText: [], fillRect: [] };
  return {
    globalAlpha: 1,
    font:        '',
    textAlign:   '',
    fillStyle:   '',
    fillText:    function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y }); },
    fillRect:    function (x, y, w, h) { calls.fillRect.push({ x: x, y: y, w: w, h: h }); },
    measureText: function (s)          { return { width: s.length * 6 }; },
    _calls:      calls
  };
}

// =============================================================
// V7.7 TallyDisplay -- threshold progress render
// =============================================================

describe('V7.7 TallyDisplay._buildText -- threshold render', () => {
  it('backward compat: no getThreshold opt => no "/N" suffix (regression)', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally: function () { return { A: 2, B: 1 }; }
      // no getThreshold -- defaults to () => null
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 2  B: 1');
  });

  it('backward compat: getThreshold returns null => no "/N" suffix', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { A: 2, B: 1 }; },
      getThreshold: function () { return null; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 2  B: 1');
  });

  it('threshold present => appends "/N" to each letter ("A: 2/3  B: 1/3")', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { A: 2, B: 1 }; },
      getThreshold: function () { return { A: 3, B: 3 }; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 2/3  B: 1/3');
  });

  it('threshold-only (no tally entry yet) renders "A: 0/3  B: 0/3"', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return {}; },
      getThreshold: function () { return { A: 3, B: 3 }; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 0/3  B: 0/3');
  });

  it('mixed: A has threshold, B does NOT => "A: 2/3  B: 1"', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { A: 2, B: 1 }; },
      getThreshold: function () { return { A: 3 }; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 2/3  B: 1');
  });

  it('threshold has non-A/B letter (W) => appears in output with slash', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { W: 1 }; },
      getThreshold: function () { return { W: 3, N: 3 } ; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    // A and B are canonical (always shown, zero count, no threshold for
    // them) + W and N appear via the threshold pass.
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 0  B: 0  W: 1/3  N: 0/3');
  });

  it('non-A/B tally letter with non-zero count keeps legacy no-slash form', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { A: 1, B: 0, C: 3 }; },
      getThreshold: function () { return null; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    // Regression: identical to the V7.4 "appends any non-A/B drinks" test.
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 1  B: 0  C: 3');
  });

  it('threshold zero (need: 0) still renders the slash form ("A: 2/0")', () => {
    // Edge: a threshold of 0 is semantically "always satisfied" but
    // the renderer should still echo it; the engine handles the gate.
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { A: 2, B: 1 }; },
      getThreshold: function () { return { A: 0, B: 0 }; }
    });
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 2/0  B: 1/0');
  });

  it('null getTally + non-null threshold => zero counts with slash form', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return null; },
      getThreshold: function () { return { A: 3, B: 3 }; }
    });
    var ctx = makeCtxStub();
    expect(function () { tally.render(ctx); }).not.toThrow();
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 0/3  B: 0/3');
  });

  it('default getThreshold (no opt at all) returns null (constructor default)', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally: function () { return { A: 1, B: 1 }; }
    });
    // The constructor must install a () => null default so _buildText
    // never throws when getThreshold isn't passed by the caller.
    expect(typeof tally.getThreshold).toBe('function');
    expect(tally.getThreshold()).toBeNull();
  });

  it('zIndex is unchanged at 5 (constructor extension does not touch z-band)', () => {
    var m = makeBoard();
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 0, y: 0,
      getTally:     function () { return { A: 0, B: 0 }; },
      getThreshold: function () { return { A: 3, B: 3 }; }
    });
    expect(tally.zIndex).toBe(5);
  });
});

// =============================================================
// V7.7 syncLevelTally -- getThreshold wiring
// =============================================================

describe('V7.7 syncLevelTally -- getThreshold reads tallyConfig.threshold', () => {
  // Helper: drive the board into a level with a TallyDisplay actor
  // bound to tally.sips, and tally + tallyConfig on the wire state.
  function _tallyMsg(opts) {
    opts = opts || {};
    return {
      type: 'classroom_activity_start',
      activity: {
        type: 'level',
        startedAt: 1000,
        durationMs: 60000,
        level: {
          schema: 'v7.5-level-1', levelKey: 'U1.2', lessonKey: '1.2',
          title: 'Tally threshold', duration: 60,
          map: { width: 32, height: 8, chipSize: 10 },
          actors: [
            { type: 'TallyDisplay', binds: 'tally.sips', x: 16, y: 1 }
          ]
        },
        state: {
          phase: opts.phase || 'SIPPING',
          currentStage: 0,
          stagesTotal:  1,
          coins: [],
          tally: opts.tally === undefined ? { sips: { A: 2, B: 1 } } : opts.tally,
          tallyConfig: opts.tallyConfig === undefined
            ? { threshold: { A: 3, B: 3 }, binds: 'tally.sips' }
            : opts.tallyConfig
        }
      }
    };
  }

  it('spawns level_tally with getThreshold returning the wire threshold map', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_tallyMsg());

    var engine = m.getEngine();
    expect(engine.entities.has('level_tally')).toBe(true);
    var tally = engine.entities.get('level_tally');
    expect(tally).toBeInstanceOf(m.ClassroomBoard._TallyDisplay);

    // The closure should reach the mount-scope state and surface the
    // threshold map exactly as the server sent it.
    expect(typeof tally.getThreshold).toBe('function');
    expect(tally.getThreshold()).toEqual({ A: 3, B: 3 });

    handle.destroy();
  });

  it('getThreshold returns null for legacy levels (no tallyConfig on wire)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Legacy wire: tally present, tallyConfig MISSING (older server).
    ws._receive(_tallyMsg({ tallyConfig: null }));

    var engine = m.getEngine();
    expect(engine.entities.has('level_tally')).toBe(true);
    var tally = engine.entities.get('level_tally');
    expect(tally.getThreshold()).toBeNull();

    handle.destroy();
  });

  it('getThreshold returns null when tallyConfig present but threshold is null', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Server-side level WITHOUT a Tally actor still emits
    // tallyConfig: null (per engine serialize()), but a different
    // shape might emit { threshold: null, binds: 'tally.sips' } if a
    // Tally actor was defined without a threshold map.
    ws._receive(_tallyMsg({
      tallyConfig: { threshold: null, binds: 'tally.sips' }
    }));

    var engine = m.getEngine();
    var tally  = engine.entities.get('level_tally');
    expect(tally.getThreshold()).toBeNull();

    handle.destroy();
  });

  it('rendered text uses the wired threshold map ("A: 2/3  B: 1/3")', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_tallyMsg());

    var engine = m.getEngine();
    var tally  = engine.entities.get('level_tally');

    // End-to-end: the closure pulls both tally and threshold from the
    // mount-scope state and _buildText renders the combined string.
    var ctx = makeCtxStub();
    tally.render(ctx);
    expect(ctx._calls.fillText[0].text).toBe('Sips - A: 2/3  B: 1/3');

    handle.destroy();
  });

  it('threshold closure tracks updates -- new wire state with different threshold reflects on next render', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Initial: threshold {A:3, B:3}, tally {A:2, B:1}.
    ws._receive(_tallyMsg());
    var engine = m.getEngine();
    var tally  = engine.entities.get('level_tally');

    var ctx1 = makeCtxStub();
    tally.render(ctx1);
    expect(ctx1._calls.fillText[0].text).toBe('Sips - A: 2/3  B: 1/3');

    // Server publishes an updated activity_state (player sipped one A
    // coin -- tally moves to {A:3, B:1}). The closure must see the
    // updated tally on the next render WITHOUT re-instantiating the
    // entity (V7.4 Codex MAJOR fix -- closure reaches MOUNT-scope state).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING',
        currentStage: 0,
        stagesTotal:  1,
        coins: [],
        tally: { sips: { A: 3, B: 1 } },
        tallyConfig: { threshold: { A: 3, B: 3 }, binds: 'tally.sips' }
      }
    });

    var ctx2 = makeCtxStub();
    tally.render(ctx2);
    expect(ctx2._calls.fillText[0].text).toBe('Sips - A: 3/3  B: 1/3');

    handle.destroy();
  });
});

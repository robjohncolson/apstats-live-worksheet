/**
 * tests/classroom-board.test.js
 *
 * Live Classroom board component -- vitest + jsdom.
 * Exercises window.ClassroomBoard as loaded from classroom-board.js.
 *
 * Strategy: load the plain script into a vm context (same pattern as
 * roster-client.test.js).  B3 contract: _reduce is a pure function
 * that requires no canvas context, so every state-reduction assertion
 * runs without a real 2d canvas.
 *
 * r3: CanvasEngine and SpriteSheet are injected as stubs before the
 * script runs so mount() exercises the render-layer wiring without
 * needing a real RAF loop or image loading.
 *
 * A mock WebSocket class is injected into the context so mount() can
 * connect without a real server.
 *
 * ASCII-only.  LF line endings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT  = resolve(import.meta.dirname, '..');
const BOARD_SRC  = readFileSync(resolve(REPO_ROOT, 'classroom-board.js'), 'utf8');

// --- mock WebSocket factory -------------------------------------------

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

// --- stub CanvasEngine + SpriteSheet factory --------------------------

/**
 * Build stub CanvasEngine and SpriteSheet classes to inject into the
 * test window before classroom-board.js runs.
 *
 * CanvasEngine stub:
 *   - Resolves canvas by getElementById (the canvas must already be in the DOM).
 *   - Does NOT call requestAnimationFrame (keeps tests synchronous).
 *   - Provides addEntity / removeEntity / stop / groundY.
 *
 * SpriteSheet stub:
 *   - Sets loaded = true immediately so drawFrame is always a no-op.
 *   - drawFrame() is a no-op.
 */
function makeEngineStubs(win) {
  // CanvasEngine stub -- does NOT call getContext (not implemented in jsdom).
  function StubCanvasEngine(canvasId) {
    this.canvas   = win.document.getElementById(canvasId);
    this.ctx      = null;   // no real canvas context needed for tests
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

  // SpriteSheet stub -- loaded = true immediately; drawFrame is a no-op.
  function StubSpriteSheet(src, fw, fh, opts) {
    this.loaded      = true;
    this.frameWidth  = fw;
    this.frameHeight = fh;
    this.columns     = (opts && opts.columns) || 11;
    this.rows        = (opts && opts.rows)    || 2;
  }
  StubSpriteSheet.prototype.drawFrame = function () { /* no-op */ };

  win.CanvasEngine  = StubCanvasEngine;
  win.SpriteSheet   = StubSpriteSheet;
}

// --- boot helper (reduce tests, no timers needed) ---------------------

function injectEnvStubs(win) {
  // Some properties are read-only on jsdom Window; use defineProperty.
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

function makeBoard() {
  var dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com'
  });
  var win  = dom.window;
  var MockWS = makeMockWSClass();

  win.WebSocket    = MockWS;
  win.setInterval  = function () { return 0; };
  win.clearInterval = function () {};
  win.setTimeout   = function () { return 0; };
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

// --- sample wire messages ---------------------------------------------

var MEMBER_ALICE = { username: 'alice', role: 'student', status: 'present', online: true  };
var MEMBER_BOB   = { username: 'bob',   role: 'student', status: 'present', online: true  };
var MEMBER_CAROL = { username: 'carol', role: 'teacher', status: 'present', online: true  };

var STATE_MSG = {
  type:    'classroom_state',
  section: 'PeriodX',
  gate:    null,
  poll:    null,
  members: [MEMBER_ALICE, MEMBER_BOB, MEMBER_CAROL]
};

// --- _reduce tests (pure function, no canvas needed) ------------------

describe('ClassroomBoard._reduce -- classroom_state', function () {
  var board;
  beforeEach(function () {
    board = makeBoard();
  });

  it('is exposed as window.ClassroomBoard._reduce', function () {
    expect(typeof board.ClassroomBoard._reduce).toBe('function');
  });

  it('returns a new state object (no mutation)', function () {
    var s0 = { members: {}, gate: null, poll: null };
    var s1 = board.ClassroomBoard._reduce(s0, STATE_MSG);
    expect(s1).not.toBe(s0);
  });

  it('populates members from the snapshot', function () {
    var s = board.ClassroomBoard._reduce({ members: {}, gate: null, poll: null }, STATE_MSG);
    expect(Object.keys(s.members).sort()).toEqual(['alice', 'bob', 'carol'].sort());
  });

  it('stores role, status, online on each member', function () {
    var s = board.ClassroomBoard._reduce({ members: {}, gate: null, poll: null }, STATE_MSG);
    expect(s.members['alice'].role).toBe('student');
    expect(s.members['alice'].online).toBe(true);
    expect(s.members['carol'].role).toBe('teacher');
  });

  it('stores hue on each member (r3 additive field)', function () {
    var msg = {
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, hue: 120 },
        { username: 'bob',   role: 'student', status: 'present', online: true, hue: null }
      ]
    };
    var s = board.ClassroomBoard._reduce({ members: {}, gate: null, poll: null }, msg);
    expect(s.members['alice'].hue).toBe(120);
    expect(s.members['bob'].hue).toBeNull();
  });

  it('hue defaults to null when absent from wire message', function () {
    var s = board.ClassroomBoard._reduce({ members: {}, gate: null, poll: null }, STATE_MSG);
    // MEMBER_ALICE/BOB/CAROL have no hue field -- should default to null.
    expect(s.members['alice'].hue).toBeNull();
    expect(s.members['bob'].hue).toBeNull();
  });

  it('replaces existing members on a second snapshot', function () {
    var s0 = board.ClassroomBoard._reduce({ members: {}, gate: null, poll: null }, STATE_MSG);
    var freshMsg = {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: [{ username: 'dave', role: 'student', status: 'present', online: true }]
    };
    var s1 = board.ClassroomBoard._reduce(s0, freshMsg);
    expect(Object.keys(s1.members)).toEqual(['dave']);
  });

  it('passes gate and poll through from the message', function () {
    var msg = Object.assign({}, STATE_MSG, { gate: { armed: true }, poll: null });
    var s = board.ClassroomBoard._reduce({ members: {}, gate: null, poll: null }, msg);
    expect(s.gate).toEqual({ armed: true });
    expect(s.poll).toBeNull();
  });
});

describe('ClassroomBoard._reduce -- classroom_member_update (upsert)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null },
      STATE_MSG
    );
  });

  it('adds a new member not previously in state', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'dave', role: 'student', status: 'present', online: true }
    });
    expect(s.members['dave']).toBeDefined();
    expect(s.members['dave'].role).toBe('student');
  });

  it('updates online flag on an existing member', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    expect(s.members['alice'].online).toBe(false);
  });

  it('preserves other members unchanged', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    expect(s.members['bob'].online).toBe(true);
    expect(s.members['carol'].role).toBe('teacher');
  });

  it('ignores an update with no username', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { role: 'student', status: 'present', online: true }
    });
    expect(Object.keys(s.members)).toEqual(Object.keys(baseState.members));
  });

  it('carries hue through on upsert (r3)', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: true, hue: 200 }
    });
    expect(s.members['alice'].hue).toBe(200);
  });

  it('preserves existing hue when update omits it (durable)', function () {
    // First set alice's hue.
    var s1 = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: true, hue: 180 }
    });
    expect(s1.members['alice'].hue).toBe(180);

    // Update without hue -- should keep existing value.
    var s2 = board.ClassroomBoard._reduce(s1, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    expect(s2.members['alice'].hue).toBe(180);
  });
});

describe('ClassroomBoard._reduce -- classroom_member_left (delete)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null },
      STATE_MSG
    );
  });

  it('removes the named member', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:     'classroom_member_left',
      section:  'PeriodX',
      username: 'bob'
    });
    expect(s.members['bob']).toBeUndefined();
    expect(s.members['alice']).toBeDefined();
  });

  it('is a no-op for a username not in state', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:     'classroom_member_left',
      section:  'PeriodX',
      username: 'nobody'
    });
    expect(Object.keys(s.members).length).toBe(Object.keys(baseState.members).length);
  });
});

describe('ClassroomBoard._reduce -- unknown type', function () {
  it('returns the same state object unchanged', function () {
    var board = makeBoard();
    var s0 = { members: {}, gate: null, poll: null };
    var s1 = board.ClassroomBoard._reduce(s0, { type: 'unknown_message_type' });
    expect(s1).toBe(s0);
  });
});

// --- student-only rendering contract (via state + _assignCells) -------

describe('ClassroomBoard -- student-only rendering contract', function () {
  var board;
  var state;

  beforeEach(function () {
    board = makeBoard();
    state = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null },
      STATE_MSG
    );
  });

  it('teacher members are NOT in the student-avatar set', function () {
    var studentNames = Object.keys(state.members).filter(function (u) {
      return state.members[u].role === 'student';
    });
    expect(studentNames).toContain('alice');
    expect(studentNames).toContain('bob');
    expect(studentNames).not.toContain('carol');

    var cells = board.ClassroomBoard._assignCells(studentNames);
    expect(cells['alice']).toBeDefined();
    expect(cells['bob']).toBeDefined();
    expect(cells['carol']).toBeUndefined();
  });

  it('offline members have online:false flagged in state', function () {
    var s = board.ClassroomBoard._reduce(state, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    expect(s.members['alice'].online).toBe(false);
    expect(s.members['bob'].online).toBe(true);
  });

  it('all 3 members remain present after an online-flip (member NOT removed)', function () {
    var s = board.ClassroomBoard._reduce(state, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    expect(Object.keys(s.members).length).toBe(3);
  });

  it('offline student is assigned a cell (renders dimmed, not absent)', function () {
    var s = board.ClassroomBoard._reduce(state, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    var students = Object.keys(s.members).filter(function (u) {
      return s.members[u].role === 'student';
    });
    var cells = board.ClassroomBoard._assignCells(students);
    expect(cells['alice']).toBeDefined();
    expect(s.members['alice'].online).toBe(false);
  });
});

// --- _assignCells collision-probing tests -----------------------------

describe('ClassroomBoard._assignCells -- collision handling', function () {
  var board;

  beforeEach(function () {
    board = makeBoard();
  });

  it('assigns every username a unique cell', function () {
    var names = [];
    for (var i = 0; i < 30; i++) {
      names.push('student' + i);
    }
    var cells = board.ClassroomBoard._assignCells(names);
    var seen = {};
    for (var j = 0; j < names.length; j++) {
      var c = cells[names[j]];
      expect(c).toBeDefined();
      var key = c.col + ',' + c.row;
      expect(seen[key]).toBeUndefined();
      seen[key] = true;
    }
  });

  it('cell coordinates are in bounds (col < 40, row < 30)', function () {
    var names = ['alice', 'bob', 'carol', 'dave', 'eve'];
    var cells = board.ClassroomBoard._assignCells(names);
    for (var i = 0; i < names.length; i++) {
      var c = cells[names[i]];
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(40);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(30);
    }
  });

  it('placement is deterministic -- same names produce same cells', function () {
    var names = ['alice', 'bob', 'carol'];
    var cells1 = board.ClassroomBoard._assignCells(names);
    var cells2 = board.ClassroomBoard._assignCells(names);
    expect(cells1['alice']).toEqual(cells2['alice']);
    expect(cells1['bob']).toEqual(cells2['bob']);
    expect(cells1['carol']).toEqual(cells2['carol']);
  });

  it('handles an empty list', function () {
    var cells = board.ClassroomBoard._assignCells([]);
    expect(Object.keys(cells).length).toBe(0);
  });

  it('handles a single name', function () {
    var cells = board.ClassroomBoard._assignCells(['solo']);
    expect(cells['solo']).toBeDefined();
    expect(typeof cells['solo'].col).toBe('number');
    expect(typeof cells['solo'].row).toBe('number');
  });

  it('reserves the gate hole region -- no avatar in the bottom-right 4x4', function () {
    var names = [];
    for (var i = 0; i < 40; i++) { names.push('s' + i); }
    var cells = board.ClassroomBoard._assignCells(names);
    for (var k in cells) {
      var c = cells[k];
      var inHole = (c.col >= 36) && (c.row >= 26);
      expect(inHole).toBe(false);
    }
  });
});

// --- makeMount helper (timer-spy variant) -----------------------------

function makeMount_spies() {
  var dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="mount"></div></body></html>',
    { url: 'https://example.com' }
  );
  var win    = dom.window;
  var MockWS = makeMockWSClass();

  var _nextId       = 1;
  var _intervals    = {};
  var _timeouts     = {};
  var _clearedIntervals = [];
  var _clearedTimeouts  = [];

  var timerSpies = {
    setIntervalCalls:    [],
    setTimeoutCalls:     [],
    clearedIntervals:    _clearedIntervals,
    clearedTimeouts:     _clearedTimeouts,
    flushTimeouts: function () {
      var ids = Object.keys(_timeouts);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (_timeouts[id]) {
          var fn = _timeouts[id].fn;
          delete _timeouts[id];
          fn();
        }
      }
    }
  };

  win.setInterval = function (fn, ms) {
    var id = _nextId++;
    _intervals[id] = { fn: fn, ms: ms };
    timerSpies.setIntervalCalls.push({ fn: fn, ms: ms });
    return id;
  };
  win.clearInterval = function (id) {
    if (id != null) {
      _clearedIntervals.push(id);
      delete _intervals[id];
    }
  };
  win.setTimeout = function (fn, ms) {
    var id = _nextId++;
    _timeouts[id] = { fn: fn, ms: ms };
    timerSpies.setTimeoutCalls.push({ fn: fn, ms: ms });
    return id;
  };
  win.clearTimeout = function (id) {
    if (id != null) {
      _clearedTimeouts.push(id);
      delete _timeouts[id];
    }
  };

  win.WebSocket = MockWS;
  injectEnvStubs(win);
  makeEngineStubs(win);

  var ctx = createContext(win);
  runInContext(BOARD_SRC, ctx);

  var container = win.document.getElementById('mount');

  return {
    win:            win,
    ClassroomBoard: win.ClassroomBoard,
    MockWS:         MockWS,
    container:      container,
    timerSpies:     timerSpies
  };
}

// --- makeMount helper (no-op timers, for simple DOM tests) ------------

function makeMount() {
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

  var ctx = createContext(win);
  runInContext(BOARD_SRC, ctx);

  var container = win.document.getElementById('mount');

  return {
    win:            win,
    ClassroomBoard: win.ClassroomBoard,
    MockWS:         MockWS,
    container:      container
  };
}

// --- makeMountWithSpies alias (used by existing tests) ----------------
function makeMountWithSpies() { return makeMount_spies(); }

// --- mount() creates a canvas element ---------------------------------

describe('ClassroomBoard.mount -- DOM wiring', function () {
  it('appends a canvas element to the container', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://example.com/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var canvas = m.container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    // r3: canvas is responsive, no longer 320x240 / pixelated.
    expect(canvas.id).toMatch(/classroom-board-canvas-/);
    expect(canvas.style.display).toBe('block');

    handle.destroy();
  });

  it('destroy() removes the canvas from the container', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://example.com/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    expect(m.container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
    expect(m.container.querySelector('canvas')).toBeNull();
  });

  it('mount accepts hue opt without throwing (r3)', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://example.com/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student',
      hue:      120
    });

    expect(m.container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
  });
});

// --- WS integration: join + heartbeat + reconnect + destroy -----------

describe('ClassroomBoard.mount -- WebSocket behaviour', function () {
  it('sends classroom_join when the socket opens', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    expect(ws).not.toBeNull();
    ws._open();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var join = sent.find(function (msg) { return msg.type === 'classroom_join'; });
    expect(join).toBeDefined();
    expect(join.section).toBe('PeriodX');
    expect(join.username).toBe('alice');
    expect(join.role).toBe('student');

    handle.destroy();
  });

  it('classroom_join includes hue from opts (r3)', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student',
      hue:      200
    });

    var ws = m.MockWS.last;
    ws._open();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var join = sent.find(function (msg) { return msg.type === 'classroom_join'; });
    expect(join).toBeDefined();
    expect(join.hue).toBe(200);

    handle.destroy();
  });

  it('classroom_join carries null hue when not provided', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
      // no hue
    });

    var ws = m.MockWS.last;
    ws._open();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var join = sent.find(function (msg) { return msg.type === 'classroom_join'; });
    expect(join).toBeDefined();
    expect(join.hue).toBeNull();

    handle.destroy();
  });

  it('updates state when classroom_state is received over the socket', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);

    expect(function () { handle.destroy(); }).not.toThrow();
  });

  it('schedules heartbeat with setInterval(fn, 30000) on open', function () {
    var m = makeMountWithSpies();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    var heartbeats = m.timerSpies.setIntervalCalls.filter(function (c) {
      return c.ms === 30000;
    });
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    handle.destroy();
  });

  it('heartbeat sends classroom_heartbeat on the expected cadence', function () {
    var m = makeMountWithSpies();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    var heartbeatCall = m.timerSpies.setIntervalCalls.find(function (c) {
      return c.ms === 30000;
    });
    expect(heartbeatCall).toBeDefined();

    heartbeatCall.fn();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var hb = sent.find(function (msg) { return msg.type === 'classroom_heartbeat'; });
    expect(hb).toBeDefined();

    handle.destroy();
  });

  it('schedules reconnect with setTimeout on socket close', function () {
    var m = makeMountWithSpies();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    var timeoutsBefore = m.timerSpies.setTimeoutCalls.length;

    var savedOnClose = ws.onclose;
    ws.onclose = null;
    ws.readyState = 3;
    savedOnClose({});

    var timeoutsAfter = m.timerSpies.setTimeoutCalls.length;
    expect(timeoutsAfter).toBeGreaterThan(timeoutsBefore);

    handle.destroy();
  });

  it('re-sends classroom_join on reconnect after a socket drop', function () {
    var m = makeMountWithSpies();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws1 = m.MockWS.last;
    ws1._open();
    var joinsBefore = ws1.sent.filter(function (s) {
      return JSON.parse(s).type === 'classroom_join';
    }).length;
    expect(joinsBefore).toBe(1);

    var savedOnClose = ws1.onclose;
    ws1.onclose = null;
    ws1.readyState = 3;
    savedOnClose({});

    m.timerSpies.flushTimeouts();

    var ws2 = m.MockWS.last;
    expect(ws2).not.toBe(ws1);

    ws2._open();

    var joinsOnWs2 = ws2.sent.filter(function (s) {
      return JSON.parse(s).type === 'classroom_join';
    });
    expect(joinsOnWs2.length).toBeGreaterThanOrEqual(1);

    handle.destroy();
  });

  it('destroy() clears every timer and closes the socket', function () {
    var m = makeMountWithSpies();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    expect(m.timerSpies.setIntervalCalls.length).toBeGreaterThanOrEqual(1);

    handle.destroy();

    expect(m.timerSpies.clearedIntervals.length).toBeGreaterThanOrEqual(1);
    expect(ws.readyState).toBe(3);
  });

  it('destroy() prevents reconnect: no new WebSocket after destroy + close', function () {
    var m = makeMountWithSpies();
    var constructorCalls = 0;
    var OrigMockWS = m.MockWS;

    var wsInstances = [];
    m.win.WebSocket = function (url) {
      constructorCalls++;
      var inst = new OrigMockWS(url);
      wsInstances.push(inst);
      return inst;
    };
    m.win.WebSocket.CONNECTING = 0;
    m.win.WebSocket.OPEN       = 1;
    m.win.WebSocket.CLOSING    = 2;
    m.win.WebSocket.CLOSED     = 3;

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = wsInstances[wsInstances.length - 1];
    ws._open();
    var countAfterOpen = constructorCalls;

    handle.destroy();

    m.timerSpies.flushTimeouts();

    expect(constructorCalls).toBe(countAfterOpen);
  });
});

// --- setNameMap -------------------------------------------------------

describe('ClassroomBoard handle.setNameMap', function () {
  it('does not throw when called with a map', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'teacher',
      nameMap:  {}
    });

    expect(function () {
      handle.setNameMap({ alice: 'Alice Smith', bob: 'Bob Jones' });
    }).not.toThrow();

    handle.destroy();
  });
});

// ==========================================================================
// v1b tests (the Gate)
// ==========================================================================

// --- v1b: _reduce -- classroom_gate -----------------------------------

describe('ClassroomBoard._reduce -- classroom_gate (v1b)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    null,
        poll:    null,
        members: [
          { username: 'alice', role: 'student', status: 'checkedIn', online: true },
          { username: 'bob',   role: 'student', status: 'present',   online: true }
        ]
      }
    );
  });

  it('sets gate from the message', function () {
    var gateMsg = {
      type: 'classroom_gate',
      section: 'PeriodX',
      gate: { armed: true, theme: 'mon' }
    };
    var s = board.ClassroomBoard._reduce(baseState, gateMsg);
    expect(s.gate).not.toBeNull();
    expect(s.gate.armed).toBe(true);
    expect(s.gate.theme).toBe('mon');
  });

  it('resets all member statuses to "present" when gate is armed', function () {
    var gateMsg = {
      type: 'classroom_gate',
      section: 'PeriodX',
      gate: { armed: true, theme: 'tue' }
    };
    var s = board.ClassroomBoard._reduce(baseState, gateMsg);
    expect(s.members['alice'].status).toBe('present');
    expect(s.members['bob'].status).toBe('present');
  });

  it('preserves member online flags when gate is armed', function () {
    var gateMsg = {
      type: 'classroom_gate',
      section: 'PeriodX',
      gate: { armed: true, theme: 'wed' }
    };
    var s = board.ClassroomBoard._reduce(baseState, gateMsg);
    expect(s.members['alice'].online).toBe(true);
    expect(s.members['bob'].online).toBe(true);
  });

  it('hue is preserved (durable) when gate is armed (r3)', function () {
    // Give alice a hue first.
    var withHue = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: true, hue: 90 }
    });
    var gateMsg = {
      type: 'classroom_gate',
      section: 'PeriodX',
      gate: { armed: true, theme: 'thu' }
    };
    var s = board.ClassroomBoard._reduce(withHue, gateMsg);
    expect(s.members['alice'].hue).toBe(90);
  });

  it('handles a null gate payload without throwing', function () {
    var gateMsg = { type: 'classroom_gate', section: 'PeriodX', gate: null };
    expect(function () {
      board.ClassroomBoard._reduce(baseState, gateMsg);
    }).not.toThrow();
  });
});

// --- v1b: _reduce -- classroom_member_update with checkedIn status ----

describe('ClassroomBoard._reduce -- classroom_member_update checkedIn (v1b)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      STATE_MSG
    );
  });

  it('adopts status:"checkedIn" on an update', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'checkedIn', online: true }
    });
    expect(s.members['alice'].status).toBe('checkedIn');
  });

  it('preserves other members unchanged when alice checks in', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'checkedIn', online: true }
    });
    expect(s.members['bob'].status).toBe('present');
    expect(s.members['carol'].status).toBe('present');
  });
});

// --- v1b: _reduce -- classroom_state carries real gate + status -------

describe('ClassroomBoard._reduce -- classroom_state with gate + status (v1b)', function () {
  var board;

  beforeEach(function () {
    board = makeBoard();
  });

  it('adopts a non-null gate from the snapshot', function () {
    var msg = {
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'thu', openedAt: 1234567890 },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present',   online: true },
        { username: 'bob',   role: 'student', status: 'checkedIn', online: true }
      ]
    };
    var s = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      msg
    );
    expect(s.gate).not.toBeNull();
    expect(s.gate.armed).toBe(true);
    expect(s.gate.theme).toBe('thu');
  });

  it('stores each member status as-is from the snapshot', function () {
    var msg = {
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'fri', openedAt: 9999 },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present',   online: true },
        { username: 'bob',   role: 'student', status: 'checkedIn', online: false }
      ]
    };
    var s = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      msg
    );
    expect(s.members['alice'].status).toBe('present');
    expect(s.members['bob'].status).toBe('checkedIn');
  });
});

// --- v1b: _reduce -- classroom_greenlight -----------------------------

describe('ClassroomBoard._reduce -- classroom_greenlight (v1b)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      STATE_MSG
    );
  });

  it('sets greenlight to boolean true (pure -- no timestamp / Date.now)', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_greenlight',
      section: 'PeriodX'
    });
    expect(s.greenlight).toBe(true);
  });

  it('classroom_gate (a fresh arm) clears greenlight back to false', function () {
    var lit = board.ClassroomBoard._reduce(baseState, {
      type: 'classroom_greenlight', section: 'PeriodX'
    });
    expect(lit.greenlight).toBe(true);
    var armed = board.ClassroomBoard._reduce(lit, {
      type: 'classroom_gate', section: 'PeriodX', gate: { armed: true, theme: 'mon' }
    });
    expect(armed.greenlight).toBe(false);
  });

  it('preserves members and gate on greenlight', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_greenlight',
      section: 'PeriodX'
    });
    expect(Object.keys(s.members).length).toBe(3);
    expect(s.gate).toBeNull();
  });
});

// --- v1b: checkedIn student not drawn (render contract) ---------------

describe('ClassroomBoard -- checkedIn student drain contract (v1b)', function () {
  var board;

  beforeEach(function () {
    board = makeBoard();
  });

  it('checkedIn student is excluded from the visible student set', function () {
    var state = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    { armed: true, theme: 'mon' },
        poll:    null,
        members: [
          { username: 'alice', role: 'student', status: 'checkedIn', online: true },
          { username: 'bob',   role: 'student', status: 'present',   online: true }
        ]
      }
    );

    var visible = Object.keys(state.members).filter(function (u) {
      var m = state.members[u];
      return m.role === 'student' && m.status !== 'checkedIn';
    });

    expect(visible).toContain('bob');
    expect(visible).not.toContain('alice');
  });

  it('all students present -> all are visible', function () {
    var state = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    null,
        poll:    null,
        members: [
          { username: 'alice', role: 'student', status: 'present', online: true },
          { username: 'bob',   role: 'student', status: 'present', online: true }
        ]
      }
    );

    var visible = Object.keys(state.members).filter(function (u) {
      var m = state.members[u];
      return m.role === 'student' && m.status !== 'checkedIn';
    });

    expect(visible.length).toBe(2);
  });

  it('all students checkedIn -> visible set is empty (board drained)', function () {
    var state = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: null },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    { armed: true, theme: 'mon' },
        poll:    null,
        members: [
          { username: 'alice', role: 'student', status: 'checkedIn', online: true },
          { username: 'bob',   role: 'student', status: 'checkedIn', online: false }
        ]
      }
    );

    var visible = Object.keys(state.members).filter(function (u) {
      var m = state.members[u];
      return m.role === 'student' && m.status !== 'checkedIn';
    });

    expect(visible.length).toBe(0);
  });
});

// --- v1b: check-in button (B3) ----------------------------------------

describe('ClassroomBoard.mount -- check-in button (v1b)', function () {
  it('button exists in the container after mount', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var btn = m.container.querySelector('[data-classroom-checkin]');
    expect(btn).not.toBeNull();

    handle.destroy();
  });

  it('button is hidden by default (no gate armed)', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var btn = m.container.querySelector('[data-classroom-checkin]');
    expect(btn.style.display).toBe('none');

    handle.destroy();
  });

  it('button shows when gate is armed and local student is present', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    var btn = m.container.querySelector('[data-classroom-checkin]');
    expect(btn.style.display).not.toBe('none');

    handle.destroy();
  });

  it('button hides after alice checks in (status becomes checkedIn)', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    var btn = m.container.querySelector('[data-classroom-checkin]');
    expect(btn.style.display).not.toBe('none');

    ws._receive({
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'checkedIn', online: true }
    });

    expect(btn.style.display).toBe('none');

    handle.destroy();
  });

  it('button is hidden for teacher role even when gate is armed', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'carol', role: 'teacher', status: 'present', online: true }
      ]
    });

    var btn = m.container.querySelector('[data-classroom-checkin]');
    expect(btn.style.display).toBe('none');

    handle.destroy();
  });

  it('button click sends classroom_checkin on the socket', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    var btn = m.container.querySelector('[data-classroom-checkin]');
    btn.onclick();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var checkin = sent.find(function (msg) { return msg.type === 'classroom_checkin'; });
    expect(checkin).toBeDefined();

    handle.destroy();
  });

  it('destroy() removes the check-in button', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    expect(m.container.querySelector('[data-classroom-checkin]')).not.toBeNull();

    handle.destroy();

    expect(m.container.querySelector('[data-classroom-checkin]')).toBeNull();
  });
});

// --- v1b: onStateChange callback (B4) ---------------------------------

describe('ClassroomBoard.mount -- onStateChange callback (v1b)', function () {
  it('fires after the socket delivers classroom_state', function () {
    var m = makeMount();
    var calls = [];

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:          'wss://test.example/ws',
      section:        'PeriodX',
      username:       'alice',
      role:           'student',
      onStateChange:  function (summary) { calls.push(summary); }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);

    expect(calls.length).toBeGreaterThanOrEqual(1);

    handle.destroy();
  });

  it('summary has gate and members array', function () {
    var m = makeMount();
    var lastSummary = null;

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:          'wss://test.example/ws',
      section:        'PeriodX',
      username:       'alice',
      role:           'student',
      onStateChange:  function (summary) { lastSummary = summary; }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'fri' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    expect(lastSummary).not.toBeNull();
    expect(lastSummary.gate).not.toBeNull();
    expect(lastSummary.gate.armed).toBe(true);
    expect(Array.isArray(lastSummary.members)).toBe(true);
    expect(lastSummary.members.length).toBe(1);
    expect(lastSummary.members[0].username).toBe('alice');

    handle.destroy();
  });

  it('summary includes the greenlight flag (v1b)', function () {
    var m = makeMount();
    var lastSummary = null;

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:          'wss://test.example/ws',
      section:        'PeriodX',
      username:       'alice',
      role:           'teacher',
      onStateChange:  function (summary) { lastSummary = summary; }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);
    expect('greenlight' in lastSummary).toBe(true);
    expect(lastSummary.greenlight).toBe(false);

    ws._receive({ type: 'classroom_greenlight', section: 'PeriodX' });
    expect(lastSummary.greenlight).toBe(true);

    handle.destroy();
  });

  it('summary members carry username, role, status, online', function () {
    var m = makeMount();
    var lastSummary = null;

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:          'wss://test.example/ws',
      section:        'PeriodX',
      username:       'alice',
      role:           'student',
      onStateChange:  function (summary) { lastSummary = summary; }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);

    var aliceSummary = lastSummary.members.find(function (m) { return m.username === 'alice'; });
    expect(aliceSummary).toBeDefined();
    expect(aliceSummary.role).toBe('student');
    expect(aliceSummary.status).toBe('present');
    expect(typeof aliceSummary.online).toBe('boolean');

    handle.destroy();
  });

  it('fires with updated status after classroom_member_update', function () {
    var m = makeMount();
    var lastSummary = null;

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:          'wss://test.example/ws',
      section:        'PeriodX',
      username:       'alice',
      role:           'student',
      onStateChange:  function (summary) { lastSummary = summary; }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);

    ws._receive({
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'checkedIn', online: true }
    });

    var aliceSummary = lastSummary.members.find(function (m) { return m.username === 'alice'; });
    expect(aliceSummary.status).toBe('checkedIn');

    handle.destroy();
  });

  it('omitting onStateChange does not throw (v1a backward compat)', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();
    expect(function () {
      ws._receive(STATE_MSG);
    }).not.toThrow();

    handle.destroy();
  });
});

// --- v1b: teacher handle methods (B4) ---------------------------------

describe('ClassroomBoard handle -- teacher methods (v1b)', function () {
  it('armGate() sends classroom_arm_gate with the given theme', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.armGate('mon');

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_arm_gate'; });
    expect(msg).toBeDefined();
    expect(msg.theme).toBe('mon');

    handle.destroy();
  });

  it('greenLight() sends classroom_go', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.greenLight();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_go'; });
    expect(msg).toBeDefined();

    handle.destroy();
  });

  it('reset() sends classroom_reset', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.reset();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_reset'; });
    expect(msg).toBeDefined();

    handle.destroy();
  });

  it('v1a callers (no teacher methods used) still work', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.setNameMap).toBe('function');
    expect(typeof handle.armGate).toBe('function');
    expect(typeof handle.greenLight).toBe('function');
    expect(typeof handle.reset).toBe('function');

    expect(function () {
      handle.setNameMap({ alice: 'Alice Smith' });
      handle.destroy();
    }).not.toThrow();
  });
});

// ==========================================================================
// r3 tests -- render layer: CanvasEngine + sprite scene
// ==========================================================================

describe('ClassroomBoard r3 -- render layer engine wiring', function () {

  it('CanvasEngine.start() is called on mount', function () {
    var m = makeMount();
    var startCalled = false;

    // Override CanvasEngine stub to track start().
    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.start = function () { startCalled = true; };
      return inst;
    };

    // Re-run the board script with the patched engine.
    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    expect(startCalled).toBe(true);
    handle.destroy();
  });

  it('engine.stop() is called on destroy', function () {
    var m = makeMount();
    var stopCalled = false;

    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.stop = function () { stopCalled = true; };
      return inst;
    };

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    handle.destroy();
    expect(stopCalled).toBe(true);
  });

  it('receiving a classroom_state with student adds a sprite entity', function () {
    var m = makeMount();
    var addedIds = [];

    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.addEntity = function (eid, entity) {
        addedIds.push(eid);
        Orig.prototype.addEntity.call(inst, eid, entity);
      };
      return inst;
    };

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    // At least a sprite entity for alice should have been added.
    expect(addedIds.some(function (id) { return id === 'sprite_alice'; })).toBe(true);

    handle.destroy();
  });

  it('teacher members never get a sprite entity', function () {
    var m = makeMount();
    var addedIds = [];

    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.addEntity = function (eid, entity) {
        addedIds.push(eid);
        Orig.prototype.addEntity.call(inst, eid, entity);
      };
      return inst;
    };

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    null,
      members: [
        { username: 'carol', role: 'teacher', status: 'present', online: true },
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    expect(addedIds.some(function (id) { return id === 'sprite_carol'; })).toBe(false);
    expect(addedIds.some(function (id) { return id === 'sprite_alice'; })).toBe(true);

    handle.destroy();
  });

  it('gate armed -> gate_door entity is added', function () {
    var m = makeMount();
    var addedIds = [];

    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.addEntity = function (eid, entity) {
        addedIds.push(eid);
        Orig.prototype.addEntity.call(inst, eid, entity);
      };
      return inst;
    };

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    expect(addedIds.some(function (id) { return id === 'gate_door'; })).toBe(true);

    handle.destroy();
  });
});

// --- r3: present->checkedIn transition triggers walk-then-drain -------

describe('ClassroomBoard r3 -- present->checkedIn triggers walk-then-drain', function () {

  it('a member transitioning to checkedIn has its sprite set to walking state', function () {
    var m = makeMount();
    var spriteRef = null;

    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.addEntity = function (eid, entity) {
        if (eid === 'sprite_alice') { spriteRef = entity; }
        Orig.prototype.addEntity.call(inst, eid, entity);
      };
      return inst;
    };

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    // alice joins as present
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    expect(spriteRef).not.toBeNull();
    expect(spriteRef.state).toBe('idle');

    // alice checks in -> present->checkedIn transition
    ws._receive({
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'checkedIn', online: true }
    });

    // After the update the sprite should be in 'walking' state.
    expect(spriteRef.state).toBe('walking');

    handle.destroy();
  });

  it('on walk completion, the sprite entity is removed from the engine', function () {
    var m = makeMount();
    var spriteRef = null;
    var removedIds = [];

    var Orig = m.win.CanvasEngine;
    m.win.CanvasEngine = function (id) {
      var inst = new Orig(id);
      inst.addEntity = function (eid, entity) {
        if (eid === 'sprite_alice') { spriteRef = entity; }
        Orig.prototype.addEntity.call(inst, eid, entity);
      };
      inst.removeEntity = function (eid) {
        removedIds.push(eid);
        Orig.prototype.removeEntity.call(inst, eid);
      };
      return inst;
    };

    var ctx2 = createContext(m.win);
    runInContext(BOARD_SRC, ctx2);

    var handle = m.win.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    var ws = m.MockWS.last;
    ws._open();

    // alice joins as present
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    { armed: true, theme: 'mon' },
      poll:    null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    expect(spriteRef).not.toBeNull();

    // alice checks in
    ws._receive({
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'checkedIn', online: true }
    });

    // The sprite is walking.  Simulate completion by calling onDrained directly.
    // (In production the RAF loop calls update() until arrived, then onDrained fires.)
    expect(typeof spriteRef.onDrained).toBe('function');
    spriteRef.onDrained();

    expect(removedIds.some(function (id) { return id === 'sprite_alice'; })).toBe(true);

    handle.destroy();
  });
});

// --- r3: hue tinting via hashStringToHue fallback ---------------------

describe('ClassroomBoard r3 -- hue / hashStringToHue', function () {

  it('_hashStringToHue is deterministic and returns a hue in [0, 359]', function () {
    var board = makeBoard();
    var h = board.ClassroomBoard._hashStringToHue;
    expect(typeof h).toBe('function');

    // Deterministic: the same username always maps to the same hue.
    expect(h('alice')).toBe(h('alice'));
    expect(h('bob')).toBe(h('bob'));

    // Range: every result is an integer in [0, 359].
    ['alice', 'bob', 'carol', 'dave', 'eve', '', 'x'].forEach(function (name) {
      var hue = h(name);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
    });

    // Distinct usernames are not collapsed to a single constant hue.
    expect(h('alice')).not.toBe(h('zzzzzz'));
  });

  it('member.hue in wire message is carried into state', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    null,
        poll:    null,
        members: [
          { username: 'alice', role: 'student', status: 'present', online: true, hue: 270 }
        ]
      }
    );
    expect(s.members['alice'].hue).toBe(270);
  });
});

// --- r3: engineReady fallback (canvas_engine.js / sprite_sheet.js absent) ---

describe('ClassroomBoard r3 -- engineReady fallback', function () {

  it('mount degrades gracefully when the engine deps are missing', function () {
    var m = makeBoard();
    // Simulate canvas_engine.js / sprite_sheet.js not being loaded.
    delete m.win.CanvasEngine;
    delete m.win.SpriteSheet;

    var container = m.win.document.createElement('div');
    m.win.document.body.appendChild(container);

    var handle;
    expect(function () {
      handle = m.ClassroomBoard.mount(container, {
        wsUrl:    'wss://test.example/ws',
        section:  'PeriodX',
        username: 'alice',
        role:     'student'
      });
    }).not.toThrow();

    // The board still connects its WebSocket and reduces state.
    var ws = m.MockWS.last;
    expect(ws).not.toBeNull();
    expect(function () {
      ws._open();
      ws._receive({
        type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
        members: [{ username: 'alice', role: 'student', status: 'present', online: true }]
      });
    }).not.toThrow();

    // destroy() cleans up without an engine.
    expect(function () { handle.destroy(); }).not.toThrow();
  });
});

// ==========================================================================
// v1c tests -- greenLight opts + onStartVideo callback
// ==========================================================================

// --- v1c: greenLight sends startVideo + videoRef on the wire ----------

describe('ClassroomBoard handle.greenLight -- v1c opts (wire)', function () {

  it('greenLight({startVideo:true, videoRef:"x"}) sends classroom_go with both fields', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.greenLight({ startVideo: true, videoRef: 'x' });

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_go'; });
    expect(msg).toBeDefined();
    expect(msg.startVideo).toBe(true);
    expect(msg.videoRef).toBe('x');

    handle.destroy();
  });

  it('greenLight() with no args sends startVideo:false and videoRef:null', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.greenLight();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_go'; });
    expect(msg).toBeDefined();
    expect(msg.startVideo).toBe(false);
    expect(msg.videoRef).toBeNull();

    handle.destroy();
  });

  it('greenLight({}) (empty opts) sends startVideo:false and videoRef:null', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.greenLight({});

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_go'; });
    expect(msg).toBeDefined();
    expect(msg.startVideo).toBe(false);
    expect(msg.videoRef).toBeNull();

    handle.destroy();
  });

  it('greenLight({startVideo:false}) sends startVideo:false', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.greenLight({ startVideo: false });

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_go'; });
    expect(msg).toBeDefined();
    expect(msg.startVideo).toBe(false);

    handle.destroy();
  });

  it('non-string videoRef is coerced to null on the wire', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'carol',
      role:     'teacher'
    });

    var ws = m.MockWS.last;
    ws._open();
    handle.greenLight({ startVideo: true, videoRef: 42 });

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_go'; });
    expect(msg).toBeDefined();
    expect(msg.videoRef).toBeNull();

    handle.destroy();
  });
});

// --- v1c: onStartVideo callback fires on inbound greenlight -----------

describe('ClassroomBoard.mount -- onStartVideo callback (v1c)', function () {

  it('fires onStartVideo with videoRef when classroom_greenlight has startVideo:true', function () {
    var m = makeMount();
    var calls = [];

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:         'wss://test.example/ws',
      section:       'PeriodX',
      username:      'alice',
      role:          'student',
      onStartVideo:  function (ref) { calls.push(ref); }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:       'classroom_greenlight',
      section:    'PeriodX',
      startVideo: true,
      videoRef:   'u4l2'
    });

    expect(calls.length).toBe(1);
    expect(calls[0]).toBe('u4l2');

    handle.destroy();
  });

  it('fires onStartVideo with null when videoRef is absent but startVideo:true', function () {
    var m = makeMount();
    var calls = [];

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:         'wss://test.example/ws',
      section:       'PeriodX',
      username:      'alice',
      role:          'student',
      onStartVideo:  function (ref) { calls.push(ref); }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:       'classroom_greenlight',
      section:    'PeriodX',
      startVideo: true
      // videoRef absent
    });

    expect(calls.length).toBe(1);
    expect(calls[0]).toBeNull();

    handle.destroy();
  });

  it('does NOT fire onStartVideo when startVideo is false', function () {
    var m = makeMount();
    var calls = [];

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:         'wss://test.example/ws',
      section:       'PeriodX',
      username:      'alice',
      role:          'student',
      onStartVideo:  function (ref) { calls.push(ref); }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:       'classroom_greenlight',
      section:    'PeriodX',
      startVideo: false,
      videoRef:   'u4l2'
    });

    expect(calls.length).toBe(0);

    handle.destroy();
  });

  it('does NOT fire onStartVideo when startVideo is absent', function () {
    var m = makeMount();
    var calls = [];

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:         'wss://test.example/ws',
      section:       'PeriodX',
      username:      'alice',
      role:          'student',
      onStartVideo:  function (ref) { calls.push(ref); }
    });

    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_greenlight',
      section: 'PeriodX'
      // startVideo absent
    });

    expect(calls.length).toBe(0);

    handle.destroy();
  });

  it('omitting onStartVideo does not throw when a startVideo greenlight arrives', function () {
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
      // no onStartVideo
    });

    var ws = m.MockWS.last;
    ws._open();
    expect(function () {
      ws._receive({
        type:       'classroom_greenlight',
        section:    'PeriodX',
        startVideo: true,
        videoRef:   'ref'
      });
    }).not.toThrow();

    handle.destroy();
  });

  it('a throwing onStartVideo does not break the board (swallowed)', function () {
    var m = makeMount();
    var afterCalled = false;

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:         'wss://test.example/ws',
      section:       'PeriodX',
      username:      'alice',
      role:          'student',
      onStartVideo:  function () { throw new Error('boom'); }
    });

    var ws = m.MockWS.last;
    ws._open();

    expect(function () {
      ws._receive({
        type:       'classroom_greenlight',
        section:    'PeriodX',
        startVideo: true,
        videoRef:   null
      });
    }).not.toThrow();

    // The state reduction + onStateChange path still completed -- the board
    // is still alive.  Send another message to confirm no silent crash.
    expect(function () {
      ws._receive({
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    null,
        poll:    null,
        members: [{ username: 'alice', role: 'student', status: 'present', online: true }]
      });
    }).not.toThrow();

    handle.destroy();
  });
});

// --- v1c: _reduce stays pure -- startVideo/videoRef NOT stored in state

describe('ClassroomBoard._reduce -- v1c startVideo/videoRef NOT in state', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
  });

  it('greenlight is still a boolean true after a startVideo greenlight message', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:       'classroom_greenlight',
      section:    'PeriodX',
      startVideo: true,
      videoRef:   'u4l2'
    });
    expect(s.greenlight).toBe(true);
  });

  it('startVideo is NOT stored on state', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:       'classroom_greenlight',
      section:    'PeriodX',
      startVideo: true,
      videoRef:   'u4l2'
    });
    expect(s.startVideo).toBeUndefined();
  });

  it('videoRef is NOT stored on state', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:       'classroom_greenlight',
      section:    'PeriodX',
      startVideo: true,
      videoRef:   'u4l2'
    });
    expect(s.videoRef).toBeUndefined();
  });
});

// ==========================================================================
// v2 tests -- poll mechanic (Unit U2)
// ==========================================================================

// --- v2: _reduce -- classroom_poll (pure) ---------------------------------

describe('ClassroomBoard._reduce -- classroom_poll (v2 pure)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
  });

  it('sets state.poll from the message', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:     'classroom_poll',
      id:       'poll-1',
      question: 'Favorite color?',
      options:  ['Red', 'Blue', 'Green'],
      blind:    false
    });
    expect(s.poll).not.toBeNull();
    expect(s.poll.id).toBe('poll-1');
    expect(s.poll.question).toBe('Favorite color?');
    expect(s.poll.options).toEqual(['Red', 'Blue', 'Green']);
    expect(s.poll.blind).toBe(false);
  });

  it('sets blind:true when the message carries blind:true', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:     'classroom_poll',
      id:       'poll-2',
      question: 'Secret?',
      options:  ['Yes', 'No'],
      blind:    true
    });
    expect(s.poll.blind).toBe(true);
  });

  it('resets every member vote to null when poll opens', function () {
    // First give alice a vote.
    var withVote = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: true, vote: 1 }
    });
    expect(withVote.members['alice'].vote).toBe(1);

    // Opening a new poll must reset all votes.
    var s = board.ClassroomBoard._reduce(withVote, {
      type:     'classroom_poll',
      id:       'poll-3',
      question: 'Q?',
      options:  ['A', 'B'],
      blind:    false
    });
    expect(s.members['alice'].vote).toBeNull();
    expect(s.members['bob'].vote).toBeNull();
  });

  it('preserves members, gate, and greenlight when poll opens', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:     'classroom_poll',
      id:       'poll-4',
      question: 'Q?',
      options:  ['A', 'B'],
      blind:    false
    });
    expect(Object.keys(s.members).length).toBe(3);
    expect(s.gate).toBeNull();
    expect(s.greenlight).toBe(false);
  });

  it('returns a new state object (no mutation)', function () {
    var s0 = baseState;
    var s1 = board.ClassroomBoard._reduce(s0, {
      type:     'classroom_poll',
      id:       'poll-5',
      question: 'Q?',
      options:  ['A', 'B'],
      blind:    false
    });
    expect(s1).not.toBe(s0);
    expect(s0.poll).toBeNull();
  });
});

// --- v2: _reduce -- classroom_poll_closed (pure) --------------------------

describe('ClassroomBoard._reduce -- classroom_poll_closed (v2 pure)', function () {
  var board;
  var pollState;

  beforeEach(function () {
    board = makeBoard();
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
    pollState = board.ClassroomBoard._reduce(base, {
      type:     'classroom_poll',
      id:       'poll-1',
      question: 'Q?',
      options:  ['A', 'B'],
      blind:    false
    });
  });

  it('clears state.poll to null', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type: 'classroom_poll_closed',
      id:   'poll-1',
      tally: [2, 1]
    });
    expect(s.poll).toBeNull();
  });

  it('preserves members and gate on close', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type: 'classroom_poll_closed',
      id:   'poll-1',
      tally: [2, 1]
    });
    expect(Object.keys(s.members).length).toBe(3);
    expect(s.gate).toBeNull();
  });

  it('returns a new state object (no mutation)', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type: 'classroom_poll_closed',
      id:   'poll-1',
      tally: [0, 0]
    });
    expect(s).not.toBe(pollState);
    expect(pollState.poll).not.toBeNull();  // original unchanged
  });
});

// --- v2: _reduce -- classroom_poll_reveal (pure) --------------------------

describe('ClassroomBoard._reduce -- classroom_poll_reveal (v2 pure)', function () {
  var board;
  var pollState;

  beforeEach(function () {
    board = makeBoard();
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
    pollState = board.ClassroomBoard._reduce(base, {
      type:     'classroom_poll',
      id:       'poll-1',
      question: 'Q?',
      options:  ['A', 'B'],
      blind:    true
    });
  });

  it('updates member votes from the reveal members list', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type:    'classroom_poll_reveal',
      id:      'poll-1',
      tally:   [1, 1],
      members: [
        { username: 'alice', vote: 0 },
        { username: 'bob',   vote: 1 }
      ]
    });
    expect(s.members['alice'].vote).toBe(0);
    expect(s.members['bob'].vote).toBe(1);
  });

  it('preserves poll metadata after reveal', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type:    'classroom_poll_reveal',
      id:      'poll-1',
      tally:   [1, 1],
      members: [{ username: 'alice', vote: 0 }]
    });
    expect(s.poll).not.toBeNull();
    expect(s.poll.id).toBe('poll-1');
  });

  it('is a no-op when members list is absent or empty', function () {
    var s1 = board.ClassroomBoard._reduce(pollState, {
      type: 'classroom_poll_reveal',
      id:   'poll-1',
      tally: []
      // members absent
    });
    expect(s1).toBe(pollState);

    var s2 = board.ClassroomBoard._reduce(pollState, {
      type:    'classroom_poll_reveal',
      id:      'poll-1',
      tally:   [],
      members: []
    });
    expect(s2).toBe(pollState);
  });

  it('returns a new state object when members list is provided', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type:    'classroom_poll_reveal',
      id:      'poll-1',
      tally:   [1, 0],
      members: [{ username: 'alice', vote: 0 }]
    });
    expect(s).not.toBe(pollState);
  });
});

// --- v2: _reduce -- vote field threaded through classroom_state ----------

describe('ClassroomBoard._reduce -- vote field on classroom_state (v2)', function () {
  var board;

  beforeEach(function () { board = makeBoard(); });

  it('carries vote from the wire member onto state', function () {
    var s = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    null,
        poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
        members: [
          { username: 'alice', role: 'student', status: 'voted', online: true, hue: null, vote: 1 },
          { username: 'bob',   role: 'student', status: 'present', online: true, hue: null, vote: null }
        ]
      }
    );
    expect(s.members['alice'].vote).toBe(1);
    expect(s.members['bob'].vote).toBeNull();
  });

  it('defaults vote to null when absent from wire message', function () {
    var s = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
    expect(s.members['alice'].vote).toBeNull();
    expect(s.members['bob'].vote).toBeNull();
  });
});

// --- v2: _reduce -- vote field threaded through classroom_member_update --

describe('ClassroomBoard._reduce -- vote field on classroom_member_update (v2)', function () {
  var board;
  var baseState;

  beforeEach(function () {
    board = makeBoard();
    baseState = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
  });

  it('adopts vote from an update message', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: true, vote: 2 }
    });
    expect(s.members['alice'].vote).toBe(2);
    expect(s.members['alice'].status).toBe('voted');
  });

  it('preserves existing vote when update omits it (durable, like hue)', function () {
    var s1 = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: true, vote: 0 }
    });
    expect(s1.members['alice'].vote).toBe(0);

    var s2 = board.ClassroomBoard._reduce(s1, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: false }
    });
    expect(s2.members['alice'].vote).toBe(0);
  });

  it('does not bleed a vote to other members', function () {
    var s = board.ClassroomBoard._reduce(baseState, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: true, vote: 1 }
    });
    expect(s.members['bob'].vote).toBeNull();
  });
});

// --- v2: _reduce stays pure (no Date.now, no side effects) ---------------

describe('ClassroomBoard._reduce -- poll cases stay pure (v2)', function () {
  var board;

  beforeEach(function () { board = makeBoard(); });

  it('classroom_poll does not call Date.now or access the DOM', function () {
    // Replacing Date.now with a sentinel -- if _reduce called it, the
    // test would catch the call via wrapper tracking or simply not throw.
    var base = { members: {}, gate: null, poll: null, greenlight: false };
    var originalDateNow = Date.now;
    var dateCalled = false;
    Date.now = function () { dateCalled = true; return 0; };
    try {
      board.ClassroomBoard._reduce(base, {
        type:     'classroom_poll',
        id:       'p1',
        question: 'Q?',
        options:  ['A', 'B'],
        blind:    false
      });
    } finally {
      Date.now = originalDateNow;
    }
    expect(dateCalled).toBe(false);
  });

  it('classroom_poll_closed does not call Date.now', function () {
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      STATE_MSG
    );
    var withPoll = board.ClassroomBoard._reduce(base, {
      type: 'classroom_poll', id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false
    });
    var originalDateNow = Date.now;
    var dateCalled = false;
    Date.now = function () { dateCalled = true; return 0; };
    try {
      board.ClassroomBoard._reduce(withPoll, {
        type: 'classroom_poll_closed', id: 'p1', tally: [0, 0]
      });
    } finally {
      Date.now = originalDateNow;
    }
    expect(dateCalled).toBe(false);
  });
});

// --- v2: handle.openPoll / closePoll / reveal send correct messages ------

describe('ClassroomBoard handle -- poll teacher methods (v2)', function () {

  it('handle exposes openPoll, closePoll, reveal', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'carol', role: 'teacher'
    });
    expect(typeof handle.openPoll).toBe('function');
    expect(typeof handle.closePoll).toBe('function');
    expect(typeof handle.reveal).toBe('function');
    handle.destroy();
  });

  it('openPoll() sends classroom_open_poll with question, options, blind', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'carol', role: 'teacher'
    });
    var ws = m.MockWS.last;
    ws._open();
    handle.openPoll('Favorite color?', ['Red', 'Blue'], false);
    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_open_poll'; });
    expect(msg).toBeDefined();
    expect(msg.question).toBe('Favorite color?');
    expect(msg.options).toEqual(['Red', 'Blue']);
    expect(msg.blind).toBe(false);
    handle.destroy();
  });

  it('openPoll() with blind:true sends blind:true', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'carol', role: 'teacher'
    });
    var ws = m.MockWS.last;
    ws._open();
    handle.openPoll('Q?', ['A', 'B', 'C'], true);
    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_open_poll'; });
    expect(msg).toBeDefined();
    expect(msg.blind).toBe(true);
    handle.destroy();
  });

  it('closePoll() sends classroom_close_poll', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'carol', role: 'teacher'
    });
    var ws = m.MockWS.last;
    ws._open();
    handle.closePoll();
    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_close_poll'; });
    expect(msg).toBeDefined();
    handle.destroy();
  });

  it('reveal() sends classroom_reveal', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'carol', role: 'teacher'
    });
    var ws = m.MockWS.last;
    ws._open();
    handle.reveal();
    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var msg = sent.find(function (msg) { return msg.type === 'classroom_reveal'; });
    expect(msg).toBeDefined();
    handle.destroy();
  });
});

// --- v2: student vote affordance (vote button) ----------------------------

describe('ClassroomBoard.mount -- student vote affordance (v2)', function () {

  it('poll vote container exists in the DOM after mount', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var container = m.container.querySelector('[data-classroom-poll-votes]');
    expect(container).not.toBeNull();
    handle.destroy();
  });

  it('poll vote container is hidden by default (no poll open)', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var container = m.container.querySelector('[data-classroom-poll-votes]');
    expect(container.style.display).toBe('none');
    handle.destroy();
  });

  it('vote buttons appear when a poll opens and student has not voted', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // State with alice as present student and poll open.
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B', 'C'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    expect(pollDiv.style.display).not.toBe('none');

    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    expect(btns.length).toBe(3);

    handle.destroy();
  });

  it('vote button labels match the poll options', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Fav?', options: ['Red', 'Blue'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    expect(btns[0].textContent).toBe('Red');
    expect(btns[1].textContent).toBe('Blue');

    handle.destroy();
  });

  it('clicking a vote button sends classroom_vote with the choice index', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    expect(btns.length).toBe(2);
    btns[1].onclick();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var voteMsg = sent.find(function (msg) { return msg.type === 'classroom_vote'; });
    expect(voteMsg).toBeDefined();
    expect(voteMsg.choice).toBe(1);

    handle.destroy();
  });

  it('vote buttons hidden after alice is marked as voted', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    expect(pollDiv.style.display).not.toBe('none');

    // alice's status becomes "voted"
    ws._receive({
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: true, vote: 0 }
    });

    expect(pollDiv.style.display).toBe('none');

    handle.destroy();
  });

  it('vote buttons hidden after poll closes', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    expect(pollDiv.style.display).not.toBe('none');

    ws._receive({ type: 'classroom_poll_closed', id: 'p1', tally: [1, 0] });

    expect(pollDiv.style.display).toBe('none');

    handle.destroy();
  });

  it('vote buttons not shown to teacher even when poll is open', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'carol', role: 'teacher'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'carol', role: 'teacher', status: 'present', online: true }
      ]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    expect(pollDiv.style.display).toBe('none');

    handle.destroy();
  });

  it('destroy() removes the poll vote container', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    expect(m.container.querySelector('[data-classroom-poll-votes]')).not.toBeNull();
    handle.destroy();
    expect(m.container.querySelector('[data-classroom-poll-votes]')).toBeNull();
  });
});

// --- v2: onStateChange summary includes poll + tally --------------------

describe('ClassroomBoard -- onStateChange summary poll + tally (v2)', function () {

  it('summary.poll is null when no poll is open', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);
    expect(lastSummary.poll).toBeNull();
    handle.destroy();
  });

  it('summary.poll is set when a poll is open', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });
    expect(lastSummary.poll).not.toBeNull();
    expect(lastSummary.poll.id).toBe('p1');
    expect(lastSummary.poll.options).toEqual(['A', 'B']);
    handle.destroy();
  });

  it('summary.tally is null when no poll is open', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(STATE_MSG);
    expect(lastSummary.tally).toBeNull();
    handle.destroy();
  });

  it('summary.tally is a per-option count array when poll is open', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B', 'C'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'voted',   online: true, vote: 0 },
        { username: 'bob',   role: 'student', status: 'voted',   online: true, vote: 2 },
        { username: 'carol', role: 'teacher', status: 'present', online: true, vote: null }
      ]
    });
    expect(Array.isArray(lastSummary.tally)).toBe(true);
    expect(lastSummary.tally.length).toBe(3);
    expect(lastSummary.tally[0]).toBe(1);  // alice voted A
    expect(lastSummary.tally[1]).toBe(0);  // nobody voted B
    expect(lastSummary.tally[2]).toBe(1);  // bob voted C
    handle.destroy();
  });

  it('summary.tally updates when a member casts a vote', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null },
        { username: 'bob',   role: 'student', status: 'present', online: true, vote: null }
      ]
    });

    // tally starts at [0, 0]
    expect(lastSummary.tally).toEqual([0, 0]);

    // alice votes for option 1
    ws._receive({
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'voted', online: true, vote: 1 }
    });
    expect(lastSummary.tally).toEqual([0, 1]);

    handle.destroy();
  });

  it('summary.tally clears to null when poll closes', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type:    'classroom_state',
      section: 'PeriodX',
      gate:    null,
      poll:    { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true, vote: null }
      ]
    });
    expect(lastSummary.tally).not.toBeNull();

    ws._receive({ type: 'classroom_poll_closed', id: 'p1', tally: [1, 0] });
    expect(lastSummary.tally).toBeNull();
    handle.destroy();
  });
});

// ==========================================================================
// F4 code-review fixes
// ==========================================================================

// --- Finding 3 (MAJOR): classroom_poll _reduce must reset status to 'present'

describe('ClassroomBoard._reduce -- classroom_poll resets member status (Finding 3)', function () {
  var board;

  beforeEach(function () { board = makeBoard(); });

  it('resets status to "present" on every member when a new poll opens', function () {
    // Set up state with alice as "voted" from a prior poll.
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      {
        type:    'classroom_state',
        section: 'PeriodX',
        gate:    null,
        poll:    null,
        members: [
          { username: 'alice', role: 'student', status: 'voted', online: true, vote: 0 },
          { username: 'bob',   role: 'student', status: 'voted', online: true, vote: 1 }
        ]
      }
    );
    expect(base.members['alice'].status).toBe('voted');
    expect(base.members['bob'].status).toBe('voted');

    // A second poll opens -- every member must reset to 'present'.
    var s = board.ClassroomBoard._reduce(base, {
      type:     'classroom_poll',
      id:       'poll-2',
      question: 'Next Q?',
      options:  ['X', 'Y'],
      blind:    false
    });
    expect(s.members['alice'].status).toBe('present');
    expect(s.members['bob'].status).toBe('present');
  });

  it('vote buttons re-appear after a second poll opens (status reset unblocks them)', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // First poll -- alice votes.
    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'p1', question: 'Q1?', options: ['A', 'B'], blind: false },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });
    ws._receive({
      type: 'classroom_member_update', section: 'PeriodX',
      member: { username: 'alice', role: 'student', status: 'voted', online: true, vote: 0 }
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    // Alice has voted -- buttons should be hidden.
    expect(pollDiv.style.display).toBe('none');

    // Second poll opens -- classroom_poll resets status to 'present'.
    ws._receive({
      type: 'classroom_poll', id: 'p2', question: 'Q2?',
      options: ['X', 'Y', 'Z'], blind: false
    });

    // Buttons must re-appear so alice can vote in the new poll.
    expect(pollDiv.style.display).not.toBe('none');
    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    expect(btns.length).toBe(3);

    handle.destroy();
  });

  it('_reduce classroom_poll status reset does not mutate the prior state', function () {
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false },
      {
        type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
        members: [
          { username: 'alice', role: 'student', status: 'voted', online: true, vote: 1 }
        ]
      }
    );
    var s = board.ClassroomBoard._reduce(base, {
      type: 'classroom_poll', id: 'p99', question: 'Q?', options: ['A', 'B'], blind: false
    });
    // Pure: base is unchanged.
    expect(base.members['alice'].status).toBe('voted');
    // New state has the reset.
    expect(s.members['alice'].status).toBe('present');
    expect(s).not.toBe(base);
  });
});

// --- Finding 1 (MAJOR): blind-poll own-vote optimistic update on vote click

describe('ClassroomBoard.mount -- optimistic self-vote on option click (Finding 1)', function () {

  it('clicking a vote button immediately sets own avatar to voted status before server echo', function () {
    var m = makeMount();
    var summaries = [];
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { summaries.push(summary); }
    });
    var ws = m.MockWS.last;
    ws._open();

    // Blind poll opens.
    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'bp1', question: 'Secret?', options: ['A', 'B'], blind: true },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    expect(btns.length).toBe(2);

    summaries.length = 0;  // reset tracking

    // Click option B (index 1).
    btns[1].onclick();

    // An onStateChange MUST have fired BEFORE the server echo.
    expect(summaries.length).toBeGreaterThanOrEqual(1);

    // Alice's own state must show status:'voted' and vote:1 optimistically.
    var lastSummary = summaries[summaries.length - 1];
    var aliceSummary = lastSummary.members.find(function (m) { return m.username === 'alice'; });
    expect(aliceSummary).toBeDefined();
    expect(aliceSummary.status).toBe('voted');

    handle.destroy();
  });

  it('optimistic vote is preserved after a blind echo with vote:null arrives', function () {
    var m = makeMount();
    var summaries = [];
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { summaries.push(summary); }
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'bp1', question: 'Q?', options: ['A', 'B'], blind: true },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    btns[0].onclick();

    // Server echoes with vote:null (blind masking).
    ws._receive({
      type: 'classroom_member_update', section: 'PeriodX',
      member: { username: 'alice', role: 'student', status: 'voted', online: true, vote: null }
    });

    // The vote field in _reduce is durable -- the optimistic vote (0) must
    // still be present even after the masked echo.
    var lastSummary = summaries[summaries.length - 1];
    var aliceSummary = lastSummary.members.find(function (mb) { return mb.username === 'alice'; });
    // status should still be 'voted' (the echo carries voted status).
    expect(aliceSummary.status).toBe('voted');
    // Vote buttons should be hidden (status=voted hides them).
    expect(pollDiv.style.display).toBe('none');

    handle.destroy();
  });

  it('clicking a vote button still sends classroom_vote to the server', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'bp1', question: 'Q?', options: ['A', 'B'], blind: true },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });

    var pollDiv = m.container.querySelector('[data-classroom-poll-votes]');
    var btns = pollDiv.querySelectorAll('[data-vote-index]');
    btns[0].onclick();

    var sent = ws.sent.map(function (s) { return JSON.parse(s); });
    var voteMsg = sent.find(function (msg) { return msg.type === 'classroom_vote'; });
    expect(voteMsg).toBeDefined();
    expect(voteMsg.choice).toBe(0);

    handle.destroy();
  });
});

// ==========================================================================
// v2.1 Unit 2 tests -- pull-down result screen
// ==========================================================================

// --- v2.1: _reduce closedPoll set on classroom_poll_closed ---------------

describe('ClassroomBoard._reduce -- closedPoll (v2.1 Unit 2)', function () {
  var board;
  var pollState;

  beforeEach(function () {
    board = makeBoard();
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      STATE_MSG
    );
    pollState = board.ClassroomBoard._reduce(base, {
      type:     'classroom_poll',
      id:       'poll-1',
      question: 'Best option?',
      options:  ['A', 'B', 'C'],
      blind:    false
    });
  });

  it('closedPoll is null in emptyState', function () {
    var s = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      { type: 'unknown_message_type' }
    );
    // unknown type returns state unchanged; closedPoll stays null
    expect(s.closedPoll).toBeNull();
  });

  it('closedPoll is null after classroom_poll opens', function () {
    expect(pollState.closedPoll).toBeNull();
  });

  it('classroom_poll_closed sets closedPoll from pre-close poll + message tally', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type:  'classroom_poll_closed',
      id:    'poll-1',
      tally: [3, 1, 2]
    });
    expect(s.closedPoll).not.toBeNull();
    expect(s.closedPoll.question).toBe('Best option?');
    expect(s.closedPoll.options).toEqual(['A', 'B', 'C']);
    expect(s.closedPoll.tally).toEqual([3, 1, 2]);
    expect(s.closedPoll.blind).toBe(false);
  });

  it('classroom_poll_closed preserves blind flag from the poll', function () {
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      STATE_MSG
    );
    var withBlindPoll = board.ClassroomBoard._reduce(base, {
      type:     'classroom_poll',
      id:       'bp1',
      question: 'Secret?',
      options:  ['Yes', 'No'],
      blind:    true
    });
    var s = board.ClassroomBoard._reduce(withBlindPoll, {
      type:  'classroom_poll_closed',
      id:    'bp1',
      tally: [2, 3]
    });
    expect(s.closedPoll).not.toBeNull();
    expect(s.closedPoll.blind).toBe(true);
  });

  it('classroom_poll_closed with no prior poll leaves closedPoll null', function () {
    var base = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      STATE_MSG
    );
    // No poll open -- poll is already null.
    var s = board.ClassroomBoard._reduce(base, {
      type:  'classroom_poll_closed',
      id:    'x',
      tally: []
    });
    expect(s.closedPoll).toBeNull();
  });

  it('classroom_poll_closed still clears state.poll', function () {
    var s = board.ClassroomBoard._reduce(pollState, {
      type:  'classroom_poll_closed',
      id:    'poll-1',
      tally: [1, 2, 3]
    });
    expect(s.poll).toBeNull();
  });

  it('closedPoll carries the poll id (for cockpit dedup)', function () {
    var opened = board.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      { type: 'classroom_poll', id: 'poll-42', question: 'Q?', options: ['A', 'B'], blind: false }
    );
    var closed = board.ClassroomBoard._reduce(opened, {
      type: 'classroom_poll_closed', id: 'poll-42', tally: [1, 0]
    });
    expect(closed.closedPoll).not.toBeNull();
    expect(closed.closedPoll.id).toBe('poll-42');
  });

  it('classroom_poll clears closedPoll when a new poll opens', function () {
    // First close a poll to populate closedPoll.
    var withClosed = board.ClassroomBoard._reduce(pollState, {
      type:  'classroom_poll_closed',
      id:    'poll-1',
      tally: [1, 2, 3]
    });
    expect(withClosed.closedPoll).not.toBeNull();

    // A new poll opens -- closedPoll must clear.
    var s = board.ClassroomBoard._reduce(withClosed, {
      type:     'classroom_poll',
      id:       'poll-2',
      question: 'New Q?',
      options:  ['X', 'Y'],
      blind:    false
    });
    expect(s.closedPoll).toBeNull();
  });

  it('classroom_gate clears closedPoll', function () {
    var withClosed = board.ClassroomBoard._reduce(pollState, {
      type:  'classroom_poll_closed',
      id:    'poll-1',
      tally: [0, 0, 0]
    });
    expect(withClosed.closedPoll).not.toBeNull();

    var s = board.ClassroomBoard._reduce(withClosed, {
      type: 'classroom_gate',
      gate: { armed: true, theme: 'mon' }
    });
    expect(s.closedPoll).toBeNull();
  });

  it('a classroom_state reset snapshot clears closedPoll', function () {
    var withClosed = board.ClassroomBoard._reduce(pollState, {
      type:  'classroom_poll_closed',
      id:    'poll-1',
      tally: [1, 2, 3]
    });
    expect(withClosed.closedPoll).not.toBeNull();

    // A real reset is delivered AS classroom_state (LIVE_CLASSROOM_SPEC S5.3),
    // not a classroom_reset message -- a fresh snapshot carries no closedPoll.
    var s = board.ClassroomBoard._reduce(withClosed, {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null, members: []
    });
    expect(s.closedPoll).toBeNull();
  });

  it('_reduce is still pure: no Date.now on classroom_poll_closed', function () {
    var originalDateNow = Date.now;
    var dateCalled = false;
    Date.now = function () { dateCalled = true; return 0; };
    try {
      board.ClassroomBoard._reduce(pollState, {
        type:  'classroom_poll_closed',
        id:    'poll-1',
        tally: [1, 0, 0]
      });
    } finally {
      Date.now = originalDateNow;
    }
    expect(dateCalled).toBe(false);
  });

  it('_reduce classroom_poll_closed does not mutate the prior state', function () {
    var before = pollState;
    var s = board.ClassroomBoard._reduce(pollState, {
      type:  'classroom_poll_closed',
      id:    'poll-1',
      tally: [1, 2, 3]
    });
    expect(s).not.toBe(before);
    expect(before.poll).not.toBeNull();   // prior state unchanged
    expect(before.closedPoll).toBeNull(); // prior closedPoll unchanged
  });
});

// --- v2.1: showResultScreen / hideResultScreen DOM toggle ----------------

describe('ClassroomBoard handle -- showResultScreen / hideResultScreen (v2.1 Unit 2)', function () {

  it('handle exposes showResultScreen and hideResultScreen', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    expect(typeof handle.showResultScreen).toBe('function');
    expect(typeof handle.hideResultScreen).toBe('function');
    handle.destroy();
  });

  it('result screen element exists in the container after mount', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var screen = m.container.querySelector('[data-classroom-result-screen]');
    expect(screen).not.toBeNull();
    handle.destroy();
  });

  it('result screen is hidden by default (transform translateY(-100%))', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var screen = m.container.querySelector('[data-classroom-result-screen]');
    expect(screen.style.transform).toBe('translateY(-100%)');
    handle.destroy();
  });

  it('showResultScreen([poll]) slides the screen down (translateY(0))', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var screen = m.container.querySelector('[data-classroom-result-screen]');
    handle.showResultScreen([
      { question: 'Q?', options: ['A', 'B'], tally: [1, 2], blind: false }
    ]);
    expect(screen.style.transform).toBe('translateY(0)');
    handle.destroy();
  });

  it('hideResultScreen() slides the screen back up (translateY(-100%))', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var screen = m.container.querySelector('[data-classroom-result-screen]');
    handle.showResultScreen([
      { question: 'Q?', options: ['A', 'B'], tally: [1, 2], blind: false }
    ]);
    expect(screen.style.transform).toBe('translateY(0)');
    handle.hideResultScreen();
    expect(screen.style.transform).toBe('translateY(-100%)');
    handle.destroy();
  });

  it('showResultScreen renders the question text', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Favorite color?', options: ['Red', 'Blue'], tally: [3, 1], blind: false }
    ]);
    var questionEl = m.container.querySelector('[data-classroom-result-question]');
    expect(questionEl).not.toBeNull();
    expect(questionEl.textContent).toBe('Favorite color?');
    handle.destroy();
  });

  it('result screen contains a canvas element', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var canvas = m.container.querySelector('[data-classroom-result-canvas]');
    expect(canvas).not.toBeNull();
    handle.destroy();
  });

  it('result screen contains a close control', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var closeBtn = m.container.querySelector('[data-classroom-result-close]');
    expect(closeBtn).not.toBeNull();
    handle.destroy();
  });

  it('clicking the close control hides the screen', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Q?', options: ['A', 'B'], tally: [1, 2], blind: false }
    ]);
    var screen   = m.container.querySelector('[data-classroom-result-screen]');
    var closeBtn = m.container.querySelector('[data-classroom-result-close]');
    expect(screen.style.transform).toBe('translateY(0)');
    closeBtn.onclick();
    expect(screen.style.transform).toBe('translateY(-100%)');
    handle.destroy();
  });

  it('destroy() removes the result screen from the container', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    expect(m.container.querySelector('[data-classroom-result-screen]')).not.toBeNull();
    handle.destroy();
    expect(m.container.querySelector('[data-classroom-result-screen]')).toBeNull();
  });

  it('showResultScreen with an empty array does not show the screen', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var screen = m.container.querySelector('[data-classroom-result-screen]');
    handle.showResultScreen([]);
    expect(screen.style.transform).toBe('translateY(-100%)');
    handle.destroy();
  });
});

// --- v2.1: render-layer auto show/hide driven by closedPoll in state -----

describe('ClassroomBoard mount -- render-layer closedPoll auto show/hide (v2.1 Unit 2)', function () {

  it('result screen slides down automatically when classroom_poll_closed is received', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'p1', question: 'Best?', options: ['A', 'B'], blind: false },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });

    var screen = m.container.querySelector('[data-classroom-result-screen]');
    expect(screen.style.transform).toBe('translateY(-100%)');

    ws._receive({ type: 'classroom_poll_closed', id: 'p1', tally: [1, 0] });

    expect(screen.style.transform).toBe('translateY(0)');

    handle.destroy();
  });

  it('result screen hides automatically when classroom_poll opens (new poll clears closedPoll)', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'p1', question: 'Q1?', options: ['A', 'B'], blind: false },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });
    ws._receive({ type: 'classroom_poll_closed', id: 'p1', tally: [1, 0] });

    var screen = m.container.querySelector('[data-classroom-result-screen]');
    expect(screen.style.transform).toBe('translateY(0)');

    ws._receive({
      type: 'classroom_poll', id: 'p2', question: 'Q2?',
      options: ['X', 'Y'], blind: false
    });
    expect(screen.style.transform).toBe('translateY(-100%)');

    handle.destroy();
  });

  it('result screen hides automatically when classroom_gate is received', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });
    ws._receive({ type: 'classroom_poll_closed', id: 'p1', tally: [1, 0] });

    var screen = m.container.querySelector('[data-classroom-result-screen]');
    expect(screen.style.transform).toBe('translateY(0)');

    ws._receive({ type: 'classroom_gate', gate: { armed: true, theme: 'mon' } });
    expect(screen.style.transform).toBe('translateY(-100%)');

    handle.destroy();
  });

  it('result screen hides on a classroom_state reset snapshot (the real reset path)', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      poll: { id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false },
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });
    ws._receive({ type: 'classroom_poll_closed', id: 'p1', tally: [0, 1] });

    var screen = m.container.querySelector('[data-classroom-result-screen]');
    expect(screen.style.transform).toBe('translateY(0)');

    // A real teacher reset is broadcast AS classroom_state (poll + gate null),
    // not a classroom_reset message -- the result screen must clear on it.
    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: [{ username: 'alice', role: 'student', status: 'present', online: true, vote: null }]
    });
    expect(screen.style.transform).toBe('translateY(-100%)');

    handle.destroy();
  });
});

// --- v2.1: internal stepper for multi-poll array -------------------------

describe('ClassroomBoard handle -- showResultScreen stepper (v2.1 Unit 2)', function () {

  it('stepper is hidden when polls array has exactly one entry', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Q1?', options: ['A', 'B'], tally: [1, 2], blind: false }
    ]);
    var stepper = m.container.querySelector('[data-classroom-result-stepper]');
    expect(stepper).not.toBeNull();
    expect(stepper.style.display).toBe('none');
    handle.destroy();
  });

  it('stepper is visible when polls array has two or more entries', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Q1?', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Q2?', options: ['X', 'Y'], tally: [0, 2], blind: false }
    ]);
    var stepper = m.container.querySelector('[data-classroom-result-stepper]');
    expect(stepper.style.display).not.toBe('none');
    handle.destroy();
  });

  it('showResultScreen([p1, p2]) shows the last poll (p2) initially', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'First question', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Second question', options: ['X', 'Y'], tally: [0, 2], blind: false }
    ]);
    var questionEl = m.container.querySelector('[data-classroom-result-question]');
    expect(questionEl.textContent).toBe('Second question');
    handle.destroy();
  });

  it('prev button pages backward in the array', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'First', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Second', options: ['X', 'Y'], tally: [0, 2], blind: false }
    ]);
    // Currently showing index 1 (Second).  Click prev to go to index 0 (First).
    var prevBtn = m.container.querySelector('[data-classroom-result-prev]');
    expect(prevBtn).not.toBeNull();
    prevBtn.onclick();
    var questionEl = m.container.querySelector('[data-classroom-result-question]');
    expect(questionEl.textContent).toBe('First');
    handle.destroy();
  });

  it('next button pages forward in the array', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'First', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Second', options: ['X', 'Y'], tally: [0, 2], blind: false },
      { question: 'Third',  options: ['P', 'Q'], tally: [1, 1], blind: false }
    ]);
    var questionEl = m.container.querySelector('[data-classroom-result-question]');
    // Currently at index 2 (Third). Navigate back two then forward one.
    // Re-query each button after click because _renderStepper replaces DOM.
    m.container.querySelector('[data-classroom-result-prev]').onclick();  // -> index 1
    m.container.querySelector('[data-classroom-result-prev]').onclick();  // -> index 0 (First)
    expect(questionEl.textContent).toBe('First');

    m.container.querySelector('[data-classroom-result-next]').onclick();  // -> index 1 (Second)
    expect(questionEl.textContent).toBe('Second');
    handle.destroy();
  });

  it('stepper label shows N/M correctly at each position', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Q1', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Q2', options: ['C', 'D'], tally: [0, 2], blind: false }
    ]);
    // Currently at index 1 (last), so label should be "2/2" (with spaces).
    var stepper = m.container.querySelector('[data-classroom-result-stepper]');
    expect(stepper.textContent).toMatch(/2\/2/);
    handle.destroy();
  });

  it('prev button is disabled at the first entry', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Q1', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Q2', options: ['C', 'D'], tally: [0, 2], blind: false }
    ]);
    // Start at last (index 1). Go back to first.
    // Re-query after click because _renderStepper replaces the button DOM.
    m.container.querySelector('[data-classroom-result-prev]').onclick();
    var prevBtnAfter = m.container.querySelector('[data-classroom-result-prev]');
    expect(prevBtnAfter.disabled).toBe(true);
    handle.destroy();
  });

  it('next button is disabled at the last entry', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    handle.showResultScreen([
      { question: 'Q1', options: ['A', 'B'], tally: [1, 0], blind: false },
      { question: 'Q2', options: ['C', 'D'], tally: [0, 2], blind: false }
    ]);
    // Start at last (index 1). Next should be disabled.
    // Re-query after showResultScreen because _renderStepper just rebuilt the DOM.
    var nextBtn = m.container.querySelector('[data-classroom-result-next]');
    expect(nextBtn.disabled).toBe(true);
    handle.destroy();
  });
});

// =============================================================
// PlayerSprite (Phase 1) -- keyboard-controlled local sprite
// =============================================================

describe('PlayerSprite -- Phase 1 local controller', () => {
  function makePS(extra) {
    var m  = makeBoard();
    var ss = new m.win.SpriteSheet('sprite.png', 80, 96, {});
    var opts = {
      x: 100, y: 200, scale: 0.25, hue: 0, online: true, label: 'me',
      input:   { left: false, right: false, jump: false, up: false },
      peers:   function () { return {}; },
      canvasW: function () { return 400; }
    };
    if (extra) { for (var k in extra) { opts[k] = extra[k]; } }
    var p = new m.ClassroomBoard._PlayerSprite(ss, opts);
    return { p: p, opts: opts, m: m };
  }

  it('Right input -> x increases at WALK_SPEED (120 px/s)', () => {
    var t = makePS();
    t.opts.input.right = true;
    var x0 = t.p.x;
    t.p.update(1.0);
    expect(t.p.x - x0).toBeCloseTo(120, 1);
  });

  it('Left input -> x decreases at WALK_SPEED', () => {
    var t = makePS({ x: 300 });
    t.opts.input.left = true;
    var x0 = t.p.x;
    t.p.update(1.0);
    expect(x0 - t.p.x).toBeCloseTo(120, 1);
  });

  it('Right then released -> _moved stays true (D2: keep last walked spot)', () => {
    var t = makePS();
    t.opts.input.right = true;
    t.p.update(0.5);
    expect(t.p._moved).toBe(true);
    t.opts.input.right = false;
    t.p.update(0.5);
    expect(t.p._moved).toBe(true);   // sticky once set
  });

  it('Space (grounded) -> jumps; gravity returns to ground; state idle again', () => {
    var t = makePS();
    t.opts.input.jump = true;
    expect(t.p.state).toBe('idle');
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
    expect(t.p.vy).toBeLessThan(0);
    t.opts.input.jump = false;       // release so it does not auto-repeat on land
    var safety = 0;
    while (t.p.state === 'jumping' && safety < 500) {
      t.p.update(0.016);
      safety++;
    }
    expect(safety).toBeLessThan(500);
    expect(t.p.state).toBe('idle');
    expect(t.p.y).toBeCloseTo(200, 1);
  });

  it('Space does NOT auto-repeat while held (one-shot per press)', () => {
    var t = makePS();
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
    var safety = 0;
    while (t.p.state === 'jumping' && safety < 500) {
      t.p.update(0.016);
      safety++;
    }
    expect(t.p.state).toBe('idle');
    t.p.update(0.016);               // tick with jump still held
    expect(t.p.state).toBe('idle');  // must NOT jump again
  });

  it('Up edge-triggered: fires onUpPressed once per press, not on hold', () => {
    var calls = 0;
    var t = makePS({ onUpPressed: function () { calls++; } });
    t.p.update(0.016);
    expect(calls).toBe(0);
    t.opts.input.up = true;
    t.p.update(0.016);
    expect(calls).toBe(1);
    t.p.update(0.016);
    expect(calls).toBe(1);           // hold does NOT auto-repeat
    t.opts.input.up = false;
    t.p.update(0.016);
    t.opts.input.up = true;
    t.p.update(0.016);
    expect(calls).toBe(2);           // new press fires again
  });

  it('drain (walkTo) overrides keyboard -- one way out the door', () => {
    var t = makePS();
    t.opts.input.left = true;        // keyboard says left
    t.p.walkTo(300);                 // drain target to the right
    expect(t.p.state).toBe('walking');
    var x0 = t.p.x;
    t.p.update(0.016);
    // walkTo direction is +1 toward 300; keyboard says left. Drain wins.
    expect(t.p.x).toBeGreaterThan(x0);
  });

  it('soft-push: peer at same x nudges the player away (PUSH_DELTA)', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    expect(t.p.x).toBe(100);
    t.p.update(0.016);
    expect(t.p.x).toBeGreaterThan(100);
    expect(t.p._moved).toBe(true);
  });

  it('clamps x to the viewport right edge', () => {
    var t = makePS({ x: 380 });
    t.opts.input.right = true;
    t.p.update(1.0);
    // canvasW=400, spriteSize=80*0.25=20 -> maxX=380. Walked right but clamped.
    expect(t.p.x).toBe(380);
  });

  it('clamps x to the viewport left edge', () => {
    var t = makePS({ x: 0 });
    t.opts.input.left = true;
    t.p.update(1.0);
    expect(t.p.x).toBe(0);
  });

  // ----- Phase 1.5: direction + stackable one-way platforms -----

  it('facingRight: flips to false on Left input; back to true on Right', () => {
    var t = makePS();
    expect(t.p.facingRight).toBe(true);
    t.opts.input.left = true;
    t.p.update(0.016);
    expect(t.p.facingRight).toBe(false);
    t.opts.input.left = false;
    t.opts.input.right = true;
    t.p.update(0.016);
    expect(t.p.facingRight).toBe(true);
  });

  it('walking left -> frameIndex picks the bottom-row mirror (+11 offset)', () => {
    var t = makePS();
    t.opts.input.left = true;
    t.p.update(0.016);
    // WALK_FRAMES = [2,3,4,5]; left-facing adds +11 -> indices in [13, 16].
    expect(t.p.frameIndex).toBeGreaterThanOrEqual(13);
    expect(t.p.frameIndex).toBeLessThanOrEqual(16);
  });

  it('stack: drop onto a peer head -> lands at peerTop (peer.y - spriteHeight)', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    // Player starts above the peer; groundY stays at 200 (from opts.y).
    t.p.y  = 150;
    t.p.vy = 0;
    var safety = 0;
    while (safety < 500) {
      t.p.update(0.016);
      if (t.p.vy === 0 && t.p.state !== 'jumping' && safety > 0) break;
      safety++;
    }
    // peerTop = 200 - 24 = 176 (spriteHeight = 96 * 0.25).
    expect(t.p.y).toBeCloseTo(176, 0);
    expect(t.p.state).toBe('idle');
  });

  it('stack: walk off a peer head -> falls past it and lands on the ground', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y  = 176;        // already standing on the peer head
    t.p.vy = 0;
    t.opts.input.right = true;
    for (var i = 0; i < 200; i++) { t.p.update(0.016); }
    // Walked off, fell, landed on the real ground (groundY=200).
    expect(t.p.y).toBeCloseTo(200, 0);
  });

  it('one-way platform: rising UP through a peer does NOT collide', () => {
    var peer = { x: 100, y: 180 }; // peerTop=156; between ground (200) and peak (~151)
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.opts.input.jump = true;
    t.p.update(0.016);
    t.opts.input.jump = false;
    var peakY = t.p.y;
    for (var i = 0; i < 100 && t.p.vy < 0; i++) {
      t.p.update(0.016);
      if (t.p.y < peakY) peakY = t.p.y;
    }
    // Smaller y = physically higher. Player rose past peerTop=156 without snapping.
    expect(peakY).toBeLessThan(156);
  });

  it('one-way platform: descending lands on the peer head, not the ground', () => {
    var peer = { x: 100, y: 180 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.opts.input.jump = true;
    t.p.update(0.016);
    t.opts.input.jump = false;
    var safety = 0;
    while (t.p.state === 'jumping' && safety < 500) {
      t.p.update(0.016);
      safety++;
    }
    // Landed on the peer's head (peerTop=156), NOT on the ground (200).
    expect(t.p.y).toBeCloseTo(156, 0);
  });

  // ----- Phase 2.1: solid side collision + carry-while-standing -----

  it('side collision: walking right into a same-level peer is blocked', () => {
    var peer = { x: 150, y: 200 };
    var t = makePS({ x: 100, peers: function () { return { peer: peer }; } });
    t.opts.input.right = true;
    for (var i = 0; i < 200; i++) { t.p.update(0.016); }
    // Player can't pass; rests against the peer's left edge (peer.x - spriteSize).
    expect(t.p.x).toBeCloseTo(peer.x - 20, 0);
  });

  it('side collision: walking left into a same-level peer is blocked', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ x: 200, peers: function () { return { peer: peer }; } });
    t.opts.input.left = true;
    for (var i = 0; i < 200; i++) { t.p.update(0.016); }
    // Rests against the peer's right edge.
    expect(t.p.x).toBeCloseTo(peer.x + 20, 0);
  });

  it('side collision: skipped while airborne (pass laterally during a jump)', () => {
    // Peer to the right at the same y. Player jumps and walks right; in the
    // air the side collision is skipped, so player should sail past peer.x.
    var peer = { x: 150, y: 200 };
    var t = makePS({ x: 100, peers: function () { return { peer: peer }; } });
    t.opts.input.jump  = true;
    t.opts.input.right = true;
    t.p.update(0.016);
    t.opts.input.jump = false;
    var maxX = t.p.x;
    for (var i = 0; i < 100; i++) {
      t.p.update(0.016);
      if (t.p.x > maxX) maxX = t.p.x;
      if (t.p.state !== 'jumping') break;
    }
    // During the jump the player should have passed peer.x - spriteSize (130).
    expect(maxX).toBeGreaterThan(peer.x - 20);
  });

  it('carry: standing on a peer, peer.x moves -> player x tracks the delta', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    // Place player on the peer's head.
    t.p.y = 176;
    t.p.vy = 0;
    t.p.update(0.016);                   // first tick establishes standingOn + lastX
    expect(t.p.standingOn).toBe(peer);
    // Peer moves 50 to the right.
    peer.x = 150;
    t.p.update(0.016);
    // Player should have moved with the peer (delta 50).
    expect(t.p.x).toBeCloseTo(150, 0);
  });

  it('carry: player input ADDS on top of carry (not replaced)', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176;
    t.p.vy = 0;
    t.p.update(0.016);
    expect(t.p.standingOn).toBe(peer);
    var x0 = t.p.x;
    // Peer moves +50; player also presses Right (own delta ~1.92).
    peer.x += 50;
    t.opts.input.right = true;
    t.p.update(0.016);
    // Player moved by carry (+50) PLUS own walk step.
    expect(t.p.x).toBeGreaterThan(x0 + 50);
  });

  it('carry: jumping off clears standingOn (player is airborne)', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176;
    t.p.vy = 0;
    t.p.update(0.016);
    expect(t.p.standingOn).toBe(peer);
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.standingOn).toBeNull();
    expect(t.p.state).toBe('jumping');
  });

  it('carry: walking off the edge clears standingOn (player falls)', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176;
    t.p.vy = 0;
    t.opts.input.right = true;
    // Walk far enough that x-overlap is lost.
    for (var i = 0; i < 30; i++) { t.p.update(0.016); }
    // No longer on the peer; falling toward the ground.
    expect(t.p.standingOn).toBeNull();
    expect(t.p.y).toBeGreaterThan(176);
  });

  it('standingOn = null after landing on the ground (not on any peer)', () => {
    var t = makePS({ x: 50, peers: function () { return {}; } });
    // First tick: drop onto ground from initial y=200.
    t.p.update(0.016);
    expect(t.p.standingOn).toBeNull();
  });

  it('Phase 2: emits at 10 Hz while being carried by a walking peer (no input)', () => {
    var peer = { x: 100, y: 200, state: 'walking' };  // peer is walking somewhere
    var t = makePSpec({ peers: function () { return { peer: peer }; } });
    // Place player on peer head and establish standingOn.
    t.p.y = 176;
    t.p.vy = 0;
    t.p.update(0.016);
    expect(t.p.standingOn).toBe(peer);
    // No player input; but standingOn.state === 'walking' counts as moving.
    var n0 = t.emitted.length;
    t.advance(100);
    t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n0 + 1);
  });

  // ----- Phase 2.4: jump-blocked when a peer is riding -----

  it('Phase 2.4: jump is BLOCKED when a peer is standing on the player head', () => {
    // Realistic scenario: Jane has landed on John's head (peer.y = John.y -
    // spriteHeight). John presses Space -- the new gate refuses the jump
    // because Jane would have no way to follow John's upward motion and
    // would fall to the ground every time John launched.
    var peer = { x: 100, y: 176 };   // exactly headY for a player at y=200
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('idle');         // jump refused
    expect(t.p.vy).toBe(0);
    expect(t.p._jumpInheritedVx).toBe(0);
  });

  it('Phase 2.4: jump fires normally when no peer is at head level', () => {
    // Peer well below head -- not on top, jump goes through.
    var peer = { x: 100, y: 200 };          // peer on the ground, NOT on head
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
  });

  it('Phase 2.4: jump fires when a peer is floating high above (not riding)', () => {
    // Peer well above head (smaller y = physically higher). Not on top.
    var peer = { x: 100, y: 100 };          // floating up high
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
  });

  it('Phase 2.4: jump fires when a peer is at head level but NOT horizontally overlapping', () => {
    // Peer at the right y but far away in x -- not riding.
    var peer = { x: 300, y: 176 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
  });

  it("Phase 2.1 fix: carry emits when peer x moves even if peer state isn't 'walking'", () => {
    // Reproduces the "suspended passenger" bug: on slower clients (or in the
    // 'arrived' window between the carrier's broadcasts) the peer's BoardSprite
    // state is NOT 'walking', so the old gate (`standingOn.state === 'walking'`)
    // refused to fire and the passenger went silent in observers' views.
    // The _carriedThisTick fallback now triggers whenever the peer's x
    // actually moved this tick.
    var peer = { x: 100, y: 200, state: 'arrived' };  // explicitly NOT 'walking'
    var t = makePSpec({ peers: function () { return { peer: peer }; } });
    t.p.y = 176; t.p.vy = 0;
    t.p.update(0.016);                              // establish standingOn + lastX=100
    expect(t.p.standingOn).toBe(peer);
    // Peer moves while remaining in the non-'walking' state.
    peer.x = 110;
    var n0 = t.emitted.length;
    t.advance(100);
    t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n0 + 1);
  });

  // ----- Phase 2.3: platform velocity on jump -----

  it('Phase 2.3: jump from a moving peer captures _jumpInheritedVx', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176; t.p.vy = 0;
    t.p.update(0.016);                       // establish standingOn + _lastX=100
    expect(t.p.standingOn).toBe(peer);
    // Peer delta MUST stay within spriteSize (20 px) or the player loses
    // x-overlap with the peer and _onFloor() rejects the jump.
    peer.x = 110;                            // delta = 10 px
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
    expect(t.p.standingOn).toBeNull();
    expect(t.p._jumpInheritedVx).toBeGreaterThan(0);
  });

  it('Phase 2.3: jump from a stationary peer -> _jumpInheritedVx is 0', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176; t.p.vy = 0;
    t.p.update(0.016);
    // Peer didn't move; jump.
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p._jumpInheritedVx).toBe(0);
  });

  it('Phase 2.3: jump from the ground (no carrier) -> _jumpInheritedVx is 0', () => {
    var t = makePS();
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p._jumpInheritedVx).toBe(0);
  });

  it('Phase 2.3: landing clears _jumpInheritedVx', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176; t.p.vy = 0;
    t.p.update(0.016);
    peer.x = 110;                            // delta within spriteSize -- jump fires
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p._jumpInheritedVx).toBeGreaterThan(0);
    t.opts.input.jump = false;
    var safety = 0;
    while (t.p.state === 'jumping' && safety < 500) {
      t.p.update(0.016);
      safety++;
    }
    expect(t.p._jumpInheritedVx).toBe(0);
  });

  it('Phase 2.3: inherited Vx advances x during the airborne arc', () => {
    var peer = { x: 100, y: 200 };
    var t = makePS({ peers: function () { return { peer: peer }; } });
    t.p.y = 176; t.p.vy = 0;
    t.p.update(0.016);
    peer.x = 110;                            // small delta -> moderate inherited vx
    t.opts.input.jump = true;
    t.p.update(0.016);
    expect(t.p.state).toBe('jumping');
    var x0 = t.p.x;
    t.opts.input.jump = false;
    for (var i = 0; i < 5; i++) { t.p.update(0.016); }
    // Even with no player input mid-jump, x should have advanced via the
    // inherited platform velocity.
    expect(t.p.x).toBeGreaterThan(x0);
  });

  // ----- Phase 2: cross-client position broadcast -----

  function makePSpec(extra) {
    var m  = makeBoard();
    var ss = new m.win.SpriteSheet('sprite.png', 80, 96, {});
    var emitted   = [];
    var stubClock = 0;
    var opts = {
      x: 100, y: 200, scale: 0.25, hue: 0, online: true, label: 'me',
      input:   { left: false, right: false, jump: false, up: false },
      peers:   function () { return {}; },
      canvasW: function () { return 400; },
      onPos:   function (msg) { emitted.push({ x: msg.x, y: msg.y, state: msg.state, vx: msg.vx, t: stubClock }); },
      now:     function () { return stubClock; }
    };
    if (extra) { for (var k in extra) { opts[k] = extra[k]; } }
    var p = new m.ClassroomBoard._PlayerSprite(ss, opts);
    return {
      p: p, opts: opts, emitted: emitted,
      advance: function (ms) { stubClock += ms; }
    };
  }

  it('Phase 2: no emit when onPos is omitted (back-compat with Phase 1 tests)', () => {
    var m  = makeBoard();
    var ss = new m.win.SpriteSheet('sprite.png', 80, 96, {});
    var p = new m.ClassroomBoard._PlayerSprite(ss, {
      x: 0, y: 200, scale: 0.25, hue: 0, online: true, label: 'me',
      input:   { left: false, right: true, jump: false, up: false },
      canvasW: function () { return 400; }
    });
    expect(function () { p.update(0.016); }).not.toThrow();
  });

  it('Phase 2: at rest -> exactly ONE snapshot emitted (then 0 Hz)', () => {
    var t = makePSpec();
    t.p.update(0.016);
    expect(t.emitted.length).toBe(1);
    t.advance(200);
    t.p.update(0.016);
    t.advance(200);
    t.p.update(0.016);
    expect(t.emitted.length).toBe(1);  // still at rest -- no re-emit
  });

  it('Phase 2: moving -> emit at >= 10 Hz cadence', () => {
    var t = makePSpec();
    t.opts.input.right = true;
    t.advance(100);
    t.p.update(0.016);
    var n1 = t.emitted.length;
    expect(n1).toBeGreaterThanOrEqual(1);
    t.advance(100);
    t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('Phase 2: motion stops -> one rest snapshot, then 0 Hz again', () => {
    var t = makePSpec();
    t.opts.input.right = true;
    t.advance(100);
    t.p.update(0.016);
    var nMoving = t.emitted.length;
    expect(nMoving).toBeGreaterThanOrEqual(1);
    // Release.
    t.opts.input.right = false;
    t.advance(100);
    t.p.update(0.016);
    var nAfterRest = t.emitted.length;
    expect(nAfterRest).toBeGreaterThanOrEqual(nMoving + 1);
    // Subsequent idle ticks must not re-emit.
    t.advance(500);
    t.p.update(0.016);
    expect(t.emitted.length).toBe(nAfterRest);
  });

  it('Phase 2: emit carries x, y, state, vx', () => {
    var t = makePSpec();
    t.opts.input.right = true;
    t.advance(100);
    t.p.update(0.016);
    var last = t.emitted[t.emitted.length - 1];
    expect(typeof last.x).toBe('number');
    expect(typeof last.y).toBe('number');
    expect(typeof last.state).toBe('string');
    expect(typeof last.vx).toBe('number');
    expect(last.vx).toBeCloseTo(120, 1);
  });
});

// =============================================================
// Phase 2: inbound classroom_pos + reducer pos preservation
// =============================================================

describe('classroom-board -- Phase 2 inbound classroom_pos dispatch', () => {
  it('an inbound classroom_pos does not crash applyMessage', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type: 'classroom_state', section: 'PeriodX', gate: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true },
        { username: 'bob',   role: 'student', status: 'present', online: true }
      ]
    });
    expect(function () {
      ws._receive({
        type: 'classroom_pos', section: 'PeriodX', username: 'bob',
        x: 250, y: 200, state: 'walking', vx: 120
      });
    }).not.toThrow();
    handle.destroy();
  });

  it('an inbound classroom_pos for the local username is ignored', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    // self echo -- no crash, no effect.
    expect(function () {
      ws._receive({
        type: 'classroom_pos', section: 'PeriodX', username: 'alice',
        x: 999, y: 999, state: 'walking', vx: 120
      });
    }).not.toThrow();
    handle.destroy();
  });

  it('an inbound classroom_pos for an unknown peer is a clean no-op', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    expect(function () {
      ws._receive({
        type: 'classroom_pos', section: 'PeriodX', username: 'unknown_user',
        x: 50, y: 50, state: 'idle', vx: 0
      });
    }).not.toThrow();
    handle.destroy();
  });
});

describe('classroom-board _reduce -- Phase 2 pos in WireMember', () => {
  it('classroom_state with member.pos stores pos on state.members', () => {
    var m = makeBoard();
    var s = m.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      {
        type: 'classroom_state',
        members: [{
          username: 'bob', role: 'student', status: 'present', online: true,
          pos: { x: 50, y: 100, state: 'idle', vx: 0 }
        }]
      }
    );
    expect(s.members.bob.pos).toBeTruthy();
    expect(s.members.bob.pos.x).toBe(50);
    expect(s.members.bob.pos.y).toBe(100);
  });

  it('classroom_gate preserves pos through the status reset', () => {
    var m = makeBoard();
    var s1 = m.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      {
        type: 'classroom_state',
        members: [{
          username: 'bob', role: 'student', status: 'present', online: true,
          pos: { x: 50, y: 100, state: 'idle', vx: 0 }
        }]
      }
    );
    var s2 = m.ClassroomBoard._reduce(s1, { type: 'classroom_gate', gate: { armed: true } });
    expect(s2.members.bob.pos).toBeTruthy();
    expect(s2.members.bob.pos.x).toBe(50);
  });

  it('classroom_member_update preserves pos when upd lacks the field', () => {
    var m = makeBoard();
    var s1 = m.ClassroomBoard._reduce(
      { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null },
      {
        type: 'classroom_state',
        members: [{
          username: 'bob', role: 'student', status: 'present', online: true,
          pos: { x: 50, y: 100, state: 'idle', vx: 0 }
        }]
      }
    );
    var s2 = m.ClassroomBoard._reduce(s1, {
      type: 'classroom_member_update',
      member: { username: 'bob', status: 'voted', vote: 1 }  // no pos in the update
    });
    expect(s2.members.bob.pos).toBeTruthy();
    expect(s2.members.bob.pos.x).toBe(50);
    expect(s2.members.bob.status).toBe('voted');   // status DID change
  });
});

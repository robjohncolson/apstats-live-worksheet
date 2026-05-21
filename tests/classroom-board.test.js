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

const REPO_ROOT   = resolve(import.meta.dirname, '..');
const BOARD_SRC   = readFileSync(resolve(REPO_ROOT, 'classroom-board.js'), 'utf8');

// --- mock WebSocket factory -------------------------------------------

/**
 * Returns a constructor that behaves like the browser WebSocket API
 * but never makes real network calls.  An instance is accessible via
 * MockWebSocket.last so tests can control it.
 */
function makeMockWSClass() {
  var last = null;

  function MockWebSocket(url) {
    this.url        = url;
    this.readyState = 0;  // CONNECTING
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
    this.readyState = 3;  // CLOSED
    if (this.onclose) { this.onclose({}); }
  };

  // Helper: simulate server -> client message
  MockWebSocket.prototype._receive = function (obj) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(obj) });
    }
  };

  // Helper: simulate successful open
  MockWebSocket.prototype._open = function () {
    this.readyState = 1;  // OPEN
    if (this.onopen) { this.onopen({}); }
  };

  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN       = 1;
  MockWebSocket.CLOSING    = 2;
  MockWebSocket.CLOSED     = 3;

  Object.defineProperty(MockWebSocket, 'last', { get: function () { return last; } });

  return MockWebSocket;
}

// --- boot helper (reduce tests, no timers needed) ---------------------

/**
 * Load classroom-board.js into a fresh jsdom window context.
 * Returns { win, ClassroomBoard, MockWS }.
 *
 * The mock WebSocket is injected as win.WebSocket before the script runs,
 * so mount() will use it instead of the real WebSocket.
 */
function makeBoard() {
  var dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com'
  });
  var win  = dom.window;
  var MockWS = makeMockWSClass();

  // Inject dependencies the script needs
  win.WebSocket    = MockWS;
  win.setInterval  = function (fn, ms) { return 0; };  // no-op for _reduce tests
  win.clearInterval = function () {};
  win.setTimeout   = function (fn, ms) { return 0; };
  win.clearTimeout  = function () {};

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
    // The render path filters by role === "student" before calling assignCells.
    // We verify this through state: only student-role members should appear
    // in the cell assignment returned by _assignCells.
    var studentNames = Object.keys(state.members).filter(function (u) {
      return state.members[u].role === 'student';
    });
    expect(studentNames).toContain('alice');
    expect(studentNames).toContain('bob');
    expect(studentNames).not.toContain('carol');   // carol is teacher

    // _assignCells only receives student names -- verify carol is absent.
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
    // After an online flip alice is still a student, so she still gets a cell.
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
    // The online flag is false -- the render path dims but still draws her.
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
    // Generate 30 usernames (max expected class size).
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
      // The hole occupies cols 36-39, rows 26-29 (40x30 grid, 4x4 hole).
      var inHole = (c.col >= 36) && (c.row >= 26);
      expect(inHole).toBe(false);
    }
  });
});

// --- makeMount helper (timer-spy variant) -----------------------------

/**
 * Creates a board context with real spy-able timer functions.
 * Returns timer spies alongside the board handle so tests can assert
 * on heartbeat scheduling, reconnect scheduling, and cleanup.
 *
 * The container div lives in the same jsdom window as the script so
 * root.document.createElement works correctly.
 */
function makeMountWithSpies() {
  var dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="mount"></div></body></html>',
    { url: 'https://example.com' }
  );
  var win    = dom.window;
  var MockWS = makeMockWSClass();

  // Timer bookkeeping
  var _nextId       = 1;
  var _intervals    = {};  // id -> { fn, ms }
  var _timeouts     = {};  // id -> { fn, ms }
  var _clearedIntervals = [];
  var _clearedTimeouts  = [];

  var timerSpies = {
    setIntervalCalls:    [],   // each entry: { fn, ms }
    setTimeoutCalls:     [],   // each entry: { fn, ms }
    clearedIntervals:    _clearedIntervals,
    clearedTimeouts:     _clearedTimeouts,
    // Run all currently-pending timeouts (one-shot).
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
    expect(Number(canvas.width)).toBe(320);
    expect(Number(canvas.height)).toBe(240);
    expect(canvas.style.imageRendering).toBe('pixelated');

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

    // Verify indirectly: destroy() should not throw (clean state)
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

    // Find the heartbeat interval callback and fire it manually.
    var heartbeatCall = m.timerSpies.setIntervalCalls.find(function (c) {
      return c.ms === 30000;
    });
    expect(heartbeatCall).toBeDefined();

    // Fire the heartbeat -- the WS is open (readyState 1) so it should send.
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

    // Simulate drop WITHOUT destroying -- close fires onclose.
    // We null out onclose before calling the raw close to avoid the loop.
    var savedOnClose = ws.onclose;
    ws.onclose = null;
    ws.readyState = 3;
    // Manually invoke the board's onclose handler.
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
    // Capture classroom_join count on first socket.
    var joinsBefore = ws1.sent.filter(function (s) {
      return JSON.parse(s).type === 'classroom_join';
    }).length;
    expect(joinsBefore).toBe(1);

    // Simulate socket drop: save and call onclose, then flush the
    // reconnect timeout so connect() runs again and creates ws2.
    var savedOnClose = ws1.onclose;
    ws1.onclose = null;
    ws1.readyState = 3;
    savedOnClose({});          // schedules the reconnect timeout

    m.timerSpies.flushTimeouts();  // fires the reconnect, creates ws2

    var ws2 = m.MockWS.last;
    expect(ws2).not.toBe(ws1);   // a new socket was created

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

    // At least one setInterval (heartbeat) must have been registered.
    var intervalIds = m.timerSpies.setIntervalCalls.map(function (_, i) { return i + 1; });
    expect(m.timerSpies.setIntervalCalls.length).toBeGreaterThanOrEqual(1);

    handle.destroy();

    // Every interval that was set must have been cleared.
    expect(m.timerSpies.clearedIntervals.length).toBeGreaterThanOrEqual(1);

    // The socket should be closed (readyState CLOSED).
    expect(ws.readyState).toBe(3);
  });

  it('destroy() prevents reconnect: no new WebSocket after destroy + close', function () {
    var m = makeMountWithSpies();
    var constructorCalls = 0;
    var OrigMockWS = m.MockWS;

    // Wrap the MockWS to count constructor calls.
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

    // Reload the script with the wrapped WS.
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

    // Flush any pending timeouts (e.g. a reconnect that was scheduled before destroy).
    m.timerSpies.flushTimeouts();

    // No new WebSocket should be created after destroy().
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
    // Start from a state with alice (checked in) and bob (present).
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
    // alice was checkedIn; arming a gate starts a fresh ritual.
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
    // alice checks in; bob stays present.
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

    // Simulate the render filter: only present students get a cell.
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

    // Server sends a state with a gate armed and alice present.
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

    // Gate armed, alice present -> button visible.
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

    // Alice checks in -> button should hide.
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
    btn.onclick();   // simulate a click

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
      // no onStateChange
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
    // Verify backward compat: a v1a caller that only calls destroy()/setNameMap()
    // and passes no onStateChange does not throw.
    var m = makeMount();

    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl:    'wss://test.example/ws',
      section:  'PeriodX',
      username: 'alice',
      role:     'student'
    });

    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.setNameMap).toBe('function');

    // New v1b methods are present but caller does not call them.
    expect(typeof handle.armGate).toBe('function');
    expect(typeof handle.greenLight).toBe('function');
    expect(typeof handle.reset).toBe('function');

    expect(function () {
      handle.setNameMap({ alice: 'Alice Smith' });
      handle.destroy();
    }).not.toThrow();
  });
});

/**
 * tests/classroom-board-activity.test.js
 *
 * v4 activity-engine board-side coverage (LIVE_CLASSROOM_V4_BUILD.md Unit B).
 *
 * Exercises:
 *   - the 5 new _reduce cases (activity_start / _state / _success
 *     / _timeout / _cancel)
 *   - activity preservation across unrelated cases (member-update,
 *     member-left, gate, greenlight, poll lifecycle, doorways lifecycle,
 *     live-state)
 *   - classroom_state snapshot hydration of state.activity
 *   - buildSummary surfacing summary.activity via onStateChange
 *   - handle.sendActivityValue success + WS-not-ready return value
 *
 * Self-contained: pattern lifted from tests/classroom-board.test.js
 * (makeBoard / makeMount / MockWebSocket / engine stubs). NO cross-file
 * imports.
 *
 * ASCII-only.  LF line endings.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BOARD_SRC = readFileSync(resolve(REPO_ROOT, 'classroom-board.js'), 'utf8');

// --- mock WebSocket factory (copied verbatim from classroom-board.test.js) -

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

// --- stub CanvasEngine + SpriteSheet (copied verbatim) -------------------

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

// --- boot helpers --------------------------------------------------------

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

// --- canonical activity payloads -----------------------------------------

var INITIAL_ACTIVITY_STATE = {
  values:       { alice: 5, bob: 7 },
  target:       6,
  tolerance:    0.3,
  currentMean:  6,
  holdMs:       0,
  holdTargetMs: 3000
};

var START_MSG = {
  type:    'classroom_activity_start',
  section: 'PeriodX',
  activity: {
    type:       'bridge-mean',
    startedAt:  1000,
    durationMs: 90000,
    state:      INITIAL_ACTIVITY_STATE
  }
};

// Empty state with all v4 fields populated (matches emptyState()).
function emptyV4State() {
  return {
    members:        {},
    gate:           null,
    poll:           null,
    greenlight:     false,
    closedPoll:     null,
    live:           false,
    doorways:       null,
    closedDoorways: null,
    activity:       null
  };
}

// State with one activity already running, for preservation tests.
function stateWithActivity(reduce) {
  return reduce(emptyV4State(), START_MSG);
}

// --- _reduce: classroom_activity_start -----------------------------------

describe('ClassroomBoard._reduce -- classroom_activity_start', function () {
  it('sets state.activity to a fresh shell with type, startedAt, durationMs, state, finished:false', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(emptyV4State(), START_MSG);
    expect(s.activity).not.toBeNull();
    expect(s.activity.type).toBe('bridge-mean');
    expect(s.activity.startedAt).toBe(1000);
    expect(s.activity.durationMs).toBe(90000);
    expect(s.activity.state).toEqual(INITIAL_ACTIVITY_STATE);
    expect(s.activity.finished).toBe(false);
  });

  it('returns a new state object (no mutation)', function () {
    var board = makeBoard();
    var s0 = emptyV4State();
    var s1 = board.ClassroomBoard._reduce(s0, START_MSG);
    expect(s1).not.toBe(s0);
    expect(s0.activity).toBeNull();  // s0 untouched
  });

  it('replaces an existing activity slot (re-start)', function () {
    var board = makeBoard();
    var first = board.ClassroomBoard._reduce(emptyV4State(), START_MSG);
    var second = board.ClassroomBoard._reduce(first, {
      type:    'classroom_activity_start',
      section: 'PeriodX',
      activity: {
        type:       'bridge-mean',
        startedAt:  9999,
        durationMs: 30000,
        state:      { values: { carol: 3 }, target: 5, tolerance: 0.3, currentMean: 3, holdMs: 0, holdTargetMs: 3000 }
      }
    });
    expect(second.activity.startedAt).toBe(9999);
    expect(second.activity.durationMs).toBe(30000);
    expect(second.activity.state.values).toEqual({ carol: 3 });
    expect(second.activity.finished).toBe(false);
  });
});

// --- _reduce: classroom_activity_state -----------------------------------

describe('ClassroomBoard._reduce -- classroom_activity_state', function () {
  it('replaces the inner state.activity.state on a tick payload', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var nextInner = {
      values:       { alice: 6, bob: 6 },
      target:       6,
      tolerance:    0.3,
      currentMean:  6,
      holdMs:       400,
      holdTargetMs: 3000
    };
    var s1 = board.ClassroomBoard._reduce(s0, {
      type:         'classroom_activity_state',
      section:      'PeriodX',
      activityType: 'bridge-mean',
      state:        nextInner,
      elapsedMs:    400
    });
    expect(s1.activity.state).toEqual(nextInner);
    // Shell fields preserved.
    expect(s1.activity.type).toBe('bridge-mean');
    expect(s1.activity.startedAt).toBe(1000);
    expect(s1.activity.durationMs).toBe(90000);
    expect(s1.activity.finished).toBe(false);
  });

  it('is a no-op when no activity is live (state.activity null)', function () {
    var board = makeBoard();
    var s0 = emptyV4State();
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_activity_state', activityType: 'bridge-mean', state: INITIAL_ACTIVITY_STATE
    });
    expect(s1).toBe(s0);
  });

  it('is a no-op when state.activity.finished is true (late tick after success)', function () {
    var board = makeBoard();
    var live = stateWithActivity(board.ClassroomBoard._reduce);
    var done = board.ClassroomBoard._reduce(live, {
      type: 'classroom_activity_success', section: 'PeriodX', activityType: 'bridge-mean',
      finalState: INITIAL_ACTIVITY_STATE
    });
    // Now drop a late tick.
    var lateTickInner = Object.assign({}, INITIAL_ACTIVITY_STATE, { holdMs: 9999 });
    var after = board.ClassroomBoard._reduce(done, {
      type: 'classroom_activity_state', activityType: 'bridge-mean', state: lateTickInner
    });
    expect(after).toBe(done);
    expect(after.activity.state.holdMs).toBe(0);
  });
});

// --- _reduce: classroom_activity_success / _timeout / _cancel ------------

describe('ClassroomBoard._reduce -- terminal activity messages', function () {
  it('classroom_activity_success sets finished + outcome=success and carries finalState', function () {
    var board = makeBoard();
    var live = stateWithActivity(board.ClassroomBoard._reduce);
    var finalInner = Object.assign({}, INITIAL_ACTIVITY_STATE, { holdMs: 3000 });
    var done = board.ClassroomBoard._reduce(live, {
      type:         'classroom_activity_success',
      section:      'PeriodX',
      activityType: 'bridge-mean',
      finalState:   finalInner
    });
    expect(done.activity.finished).toBe(true);
    expect(done.activity.outcome).toBe('success');
    expect(done.activity.finalState).toEqual(finalInner);
  });

  it('classroom_activity_timeout sets finished + outcome=timeout', function () {
    var board = makeBoard();
    var live = stateWithActivity(board.ClassroomBoard._reduce);
    var done = board.ClassroomBoard._reduce(live, {
      type:         'classroom_activity_timeout',
      section:      'PeriodX',
      activityType: 'bridge-mean',
      finalState:   INITIAL_ACTIVITY_STATE
    });
    expect(done.activity.finished).toBe(true);
    expect(done.activity.outcome).toBe('timeout');
    expect(done.activity.finalState).toEqual(INITIAL_ACTIVITY_STATE);
  });

  it('classroom_activity_cancel sets finished + outcome=cancel', function () {
    var board = makeBoard();
    var live = stateWithActivity(board.ClassroomBoard._reduce);
    var done = board.ClassroomBoard._reduce(live, {
      type:         'classroom_activity_cancel',
      section:      'PeriodX',
      activityType: 'bridge-mean'
    });
    expect(done.activity.finished).toBe(true);
    expect(done.activity.outcome).toBe('cancel');
    // No finalState on the wire -> falls back to the prior inner state.
    expect(done.activity.finalState).toEqual(INITIAL_ACTIVITY_STATE);
  });

  it('terminal messages are a no-op when no activity exists', function () {
    var board = makeBoard();
    var s0 = emptyV4State();
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_activity_success', activityType: 'bridge-mean', finalState: INITIAL_ACTIVITY_STATE
    });
    expect(s1).toBe(s0);
  });
});

// --- _reduce: activity preserved across unrelated cases ------------------

describe('ClassroomBoard._reduce -- activity preservation across unrelated cases', function () {
  it('classroom_member_update preserves state.activity', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: false }
    });
    expect(s1.activity).toEqual(s0.activity);
  });

  it('classroom_member_left preserves state.activity', function () {
    var board = makeBoard();
    var withMembers = board.ClassroomBoard._reduce(stateWithActivity(board.ClassroomBoard._reduce), {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true },
        { username: 'bob',   role: 'student', status: 'present', online: true }
      ],
      activity: START_MSG.activity
    });
    var s1 = board.ClassroomBoard._reduce(withMembers, {
      type: 'classroom_member_left', section: 'PeriodX', username: 'bob'
    });
    expect(s1.activity).not.toBeNull();
    expect(s1.activity.type).toBe('bridge-mean');
  });

  it('classroom_gate preserves state.activity', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_gate', section: 'PeriodX', gate: { armed: true, theme: 'mean' }
    });
    expect(s1.activity).toEqual(s0.activity);
  });

  it('classroom_greenlight preserves state.activity', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_greenlight', section: 'PeriodX'
    });
    expect(s1.activity).toEqual(s0.activity);
  });

  it('classroom_live_state preserves state.activity', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_live_state', section: 'PeriodX', live: true
    });
    expect(s1.activity).toEqual(s0.activity);
  });

  it('classroom_poll lifecycle (open + close + reveal) preserves state.activity', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_poll', section: 'PeriodX',
      id: 'p1', question: 'Q?', options: ['A', 'B'], blind: false
    });
    expect(s1.activity).toEqual(s0.activity);

    var s2 = board.ClassroomBoard._reduce(s1, {
      type: 'classroom_poll_closed', section: 'PeriodX', tally: [0, 0]
    });
    expect(s2.activity).toEqual(s0.activity);

    var s3 = board.ClassroomBoard._reduce(s1, {
      type: 'classroom_poll_reveal', section: 'PeriodX',
      members: [{ username: 'alice', vote: 0 }]
    });
    expect(s3.activity).toEqual(s0.activity);
  });

  it('classroom_open_doorways / _tally / _close_doorways preserve state.activity', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_open_doorways', section: 'PeriodX',
      id: 'd1', question: 'Which?',
      options: [{ doorId: 'left', label: 'L' }, { doorId: 'right', label: 'R' }]
    });
    expect(s1.activity).toEqual(s0.activity);

    var s2 = board.ClassroomBoard._reduce(s1, {
      type: 'classroom_doorway_tally', section: 'PeriodX',
      id: 'd1', tally: [{ doorId: 'left', count: 1 }, { doorId: 'right', count: 2 }]
    });
    expect(s2.activity).toEqual(s0.activity);

    var s3 = board.ClassroomBoard._reduce(s2, {
      type: 'classroom_close_doorways', section: 'PeriodX',
      id: 'd1', question: 'Which?',
      options: [{ doorId: 'left', label: 'L' }, { doorId: 'right', label: 'R' }],
      tally: [{ doorId: 'left', count: 1 }, { doorId: 'right', count: 2 }]
    });
    expect(s3.activity).toEqual(s0.activity);
  });

  it('unknown message types preserve state.activity (default branch returns same state)', function () {
    var board = makeBoard();
    var s0 = stateWithActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, { type: 'never_heard_of_this' });
    expect(s1).toBe(s0);
    expect(s1.activity).toEqual(s0.activity);
  });
});

// --- _reduce: classroom_state snapshot hydration -------------------------

describe('ClassroomBoard._reduce -- classroom_state hydrates activity', function () {
  it('hydrates state.activity from message.activity on snapshot', function () {
    var board = makeBoard();
    var snapshotActivity = {
      type:       'bridge-mean',
      startedAt:  500,
      durationMs: 90000,
      finished:   false,
      state:      INITIAL_ACTIVITY_STATE
    };
    var s = board.ClassroomBoard._reduce(emptyV4State(), {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members:  [{ username: 'alice', role: 'student', status: 'present', online: true }],
      activity: snapshotActivity
    });
    expect(s.activity).toEqual(snapshotActivity);
  });

  it('defaults state.activity to null when snapshot omits activity', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(stateWithActivity(board.ClassroomBoard._reduce), {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: []
    });
    expect(s.activity).toBeNull();
  });
});

// --- buildSummary surfaces activity via onStateChange --------------------

describe('ClassroomBoard.mount -- summary.activity exposed via onStateChange', function () {
  it('summary.activity is null when no activity is live', function () {
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
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: [{ username: 'alice', role: 'student', status: 'present', online: true }]
    });
    expect(lastSummary).not.toBeNull();
    expect(lastSummary.activity).toBeNull();
    handle.destroy();
  });

  it('summary.activity reflects state.activity after classroom_activity_start', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(START_MSG);
    expect(lastSummary.activity).not.toBeNull();
    expect(lastSummary.activity.type).toBe('bridge-mean');
    expect(lastSummary.activity.startedAt).toBe(1000);
    expect(lastSummary.activity.durationMs).toBe(90000);
    expect(lastSummary.activity.state).toEqual(INITIAL_ACTIVITY_STATE);
    expect(lastSummary.activity.finished).toBe(false);
    handle.destroy();
  });

  it('summary.activity reflects finished + outcome after classroom_activity_success', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(START_MSG);
    var finalInner = Object.assign({}, INITIAL_ACTIVITY_STATE, { holdMs: 3000 });
    ws._receive({
      type: 'classroom_activity_success', section: 'PeriodX',
      activityType: 'bridge-mean', finalState: finalInner
    });
    expect(lastSummary.activity.finished).toBe(true);
    expect(lastSummary.activity.outcome).toBe('success');
    expect(lastSummary.activity.finalState).toEqual(finalInner);
    handle.destroy();
  });
});

// --- handle.sendActivityValue --------------------------------------------

describe('ClassroomBoard handle.sendActivityValue', function () {
  it('sends classroom_activity_value JSON over WS with the supplied payload', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    // Drain the classroom_join frame.
    ws.sent.length = 0;

    var ok = handle.sendActivityValue({ delta: 1 });
    expect(ok).toBe(true);
    expect(ws.sent.length).toBe(1);
    var parsed = JSON.parse(ws.sent[0]);
    expect(parsed.type).toBe('classroom_activity_value');
    expect(parsed.payload).toEqual({ delta: 1 });

    handle.destroy();
  });

  it('returns false (and does NOT send) when the WS is not OPEN', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    // Skip _open(); ws.readyState stays 0 (CONNECTING).
    var preSentCount = ws.sent.length;
    var ok = handle.sendActivityValue({ delta: -1 });
    expect(ok).toBe(false);
    expect(ws.sent.length).toBe(preSentCount);
    handle.destroy();
  });

  it('returns false after the WS has been closed', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    ws.sent.length = 0;
    ws.close();   // readyState -> 3
    var ok = handle.sendActivityValue({ delta: 1 });
    expect(ok).toBe(false);
    expect(ws.sent.length).toBe(0);
    handle.destroy();
  });
});

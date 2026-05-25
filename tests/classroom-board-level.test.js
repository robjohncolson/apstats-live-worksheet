/**
 * tests/classroom-board-level.test.js
 *
 * V7 level-activity board-side coverage (LIVE_CLASSROOM_V7_BUILD.md Unit B).
 *
 * Exercises the additive `level` field on state.activity introduced by V7:
 *   - classroom_activity_start with a `level` block stashes it
 *   - classroom_activity_state ticks PRESERVE state.activity.level
 *     (per C4: level shipped once on start; ticks omit it for payload size)
 *   - classroom_state snapshot hydrates the activity including its level
 *     block (so a late-joiner sees the actor layout)
 *   - buildSummary surfaces summary.activity.level via onStateChange
 *   - level preservation across unrelated _reduce cases
 *     (heartbeat / member-update / etc.)
 *   - V4-V6 paths still work (level absent stays absent, sendActivityValue
 *     unchanged)
 *
 * Self-contained: pattern lifted verbatim from
 * tests/classroom-board-activity.test.js (makeBoard / makeMount /
 * MockWebSocket / engine stubs). NO cross-file imports.
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

// --- mock WebSocket factory (copied verbatim from classroom-board-activity) -

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

// --- canonical V7 level payload ------------------------------------------
//
// Mirrors LIVE_CLASSROOM_V7_BUILD.md C3 -- a trimmed `U1.1` LevelDef
// sufficient to verify the field rides through _reduce. The board never
// interprets the actors (Unit D's renderer does), so a single Text actor
// is enough to confirm the block survives.

var U11_LEVEL_DEF = {
  schema:    'v7-level-1',
  levelKey:  'U1.1',
  lessonKey: '1.1',
  title:     'The Cola Mystery',
  skill:     '1.A',
  duration:  180,
  map:       { width: 32, height: 16, chipSize: 24 },
  actors: [
    { type: 'Text', x: 4, y: 2, text: 'Welcome to AP Stats.' },
    { type: 'SipStation', id: 's1', x: 6, y: 6, drink: 'A' },
    { type: 'PlayerSpawn', x: 4, y: 12 },
    { type: 'Goal', x: 16, y: 15 }
  ],
  min_students: 2
};

var INITIAL_LEVEL_STATE = {
  levelKey:  'U1.1',
  lessonKey: '1.1',
  players:   {},
  coins:     [{ id: 's1', collected: false }],
  switches:  [],
  gates:     [],
  goal:      { reached: false, reachedBy: null },
  reflection: { active: false, doorId: null, returnedCount: 0, totalCount: 0 },
  tally:     { sips: { A: 0, B: 0 }, votes: {} }
};

var START_LEVEL_MSG = {
  type:    'classroom_activity_start',
  section: 'PeriodX',
  activity: {
    type:       'level',
    startedAt:  1000,
    durationMs: 180000,
    state:      INITIAL_LEVEL_STATE,
    level:      U11_LEVEL_DEF
  }
};

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

function stateWithLevelActivity(reduce) {
  return reduce(emptyV4State(), START_LEVEL_MSG);
}

// --- _reduce: classroom_activity_start with a level block ----------------

describe('ClassroomBoard._reduce -- classroom_activity_start with level block', function () {
  it('stashes message.activity.level onto state.activity.level', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(emptyV4State(), START_LEVEL_MSG);
    expect(s.activity).not.toBeNull();
    expect(s.activity.type).toBe('level');
    expect(s.activity.level).not.toBeNull();
    expect(s.activity.level).toEqual(U11_LEVEL_DEF);
  });

  it('preserves the V4 activity shape alongside the new level field', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(emptyV4State(), START_LEVEL_MSG);
    expect(s.activity.startedAt).toBe(1000);
    expect(s.activity.durationMs).toBe(180000);
    expect(s.activity.state).toEqual(INITIAL_LEVEL_STATE);
    expect(s.activity.finished).toBe(false);
  });

  it('defaults state.activity.level to null when payload omits level (V4 path)', function () {
    var board = makeBoard();
    var v4Msg = {
      type:    'classroom_activity_start',
      section: 'PeriodX',
      activity: {
        type:       'bridge-mean',
        startedAt:  500,
        durationMs: 90000,
        state:      { values: {} }
      }
    };
    var s = board.ClassroomBoard._reduce(emptyV4State(), v4Msg);
    expect(s.activity.type).toBe('bridge-mean');
    expect(s.activity.level).toBeNull();
  });

  it('does not mutate the inbound message.activity.level object', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(emptyV4State(), START_LEVEL_MSG);
    expect(START_LEVEL_MSG.activity.level).toEqual(U11_LEVEL_DEF);
    expect(s.activity.level).toBe(START_LEVEL_MSG.activity.level);
  });
});

// --- _reduce: classroom_activity_state preserves the level ---------------

describe('ClassroomBoard._reduce -- classroom_activity_state preserves level', function () {
  it('keeps state.activity.level intact across a tick payload that omits level', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var nextInner = Object.assign({}, INITIAL_LEVEL_STATE, {
      tally: { sips: { A: 1, B: 0 }, votes: {} }
    });
    var s1 = board.ClassroomBoard._reduce(s0, {
      type:         'classroom_activity_state',
      section:      'PeriodX',
      activityType: 'level',
      state:        nextInner
    });
    // Level definition preserved verbatim by Object.assign spread.
    expect(s1.activity.level).toEqual(U11_LEVEL_DEF);
    expect(s1.activity.level).toBe(s0.activity.level);
  });

  it('updates state.activity.state but does not touch state.activity.level', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var nextInner = Object.assign({}, INITIAL_LEVEL_STATE, {
      coins: [{ id: 's1', collected: true }],
      tally: { sips: { A: 1, B: 0 }, votes: {} }
    });
    var s1 = board.ClassroomBoard._reduce(s0, {
      type:    'classroom_activity_state',
      section: 'PeriodX',
      state:   nextInner
    });
    expect(s1.activity.state).toEqual(nextInner);
    expect(s1.activity.level).toEqual(U11_LEVEL_DEF);
  });

  it('preserves level across many sequential tick payloads', function () {
    var board = makeBoard();
    var s = stateWithLevelActivity(board.ClassroomBoard._reduce);
    for (var i = 0; i < 5; i++) {
      s = board.ClassroomBoard._reduce(s, {
        type:    'classroom_activity_state',
        section: 'PeriodX',
        state:   Object.assign({}, INITIAL_LEVEL_STATE, {
          tally: { sips: { A: i, B: 0 }, votes: {} }
        })
      });
      expect(s.activity.level).toEqual(U11_LEVEL_DEF);
    }
  });

  it('terminal classroom_activity_success preserves level on the finished slot', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var done = board.ClassroomBoard._reduce(s0, {
      type:         'classroom_activity_success',
      section:      'PeriodX',
      activityType: 'level',
      finalState:   INITIAL_LEVEL_STATE
    });
    expect(done.activity.finished).toBe(true);
    expect(done.activity.outcome).toBe('success');
    expect(done.activity.level).toEqual(U11_LEVEL_DEF);
  });
});

// --- _reduce: classroom_state snapshot hydration with level --------------

describe('ClassroomBoard._reduce -- classroom_state hydrates activity.level', function () {
  it('hydrates state.activity.level from a snapshot for a late joiner', function () {
    var board = makeBoard();
    var snapshotActivity = {
      type:       'level',
      startedAt:  500,
      durationMs: 180000,
      finished:   false,
      state:      INITIAL_LEVEL_STATE,
      level:      U11_LEVEL_DEF
    };
    var s = board.ClassroomBoard._reduce(emptyV4State(), {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members:  [{ username: 'alice', role: 'student', status: 'present', online: true }],
      activity: snapshotActivity
    });
    expect(s.activity).toEqual(snapshotActivity);
    expect(s.activity.level).toEqual(U11_LEVEL_DEF);
  });

  it('snapshot with no activity clears the slot (level too)', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: []
    });
    expect(s1.activity).toBeNull();
  });
});

// --- _reduce: level preserved across unrelated cases ---------------------

describe('ClassroomBoard._reduce -- level preserved across unrelated cases', function () {
  it('classroom_member_update preserves state.activity.level', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type:    'classroom_member_update',
      section: 'PeriodX',
      member:  { username: 'alice', role: 'student', status: 'present', online: true }
    });
    expect(s1.activity.level).toEqual(U11_LEVEL_DEF);
  });

  it('classroom_member_left preserves state.activity.level', function () {
    var board = makeBoard();
    var seeded = board.ClassroomBoard._reduce(emptyV4State(), {
      type: 'classroom_state', section: 'PeriodX', gate: null, poll: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true },
        { username: 'bob',   role: 'student', status: 'present', online: true }
      ],
      activity: START_LEVEL_MSG.activity
    });
    var s1 = board.ClassroomBoard._reduce(seeded, {
      type: 'classroom_member_left', section: 'PeriodX', username: 'bob'
    });
    expect(s1.activity.level).toEqual(U11_LEVEL_DEF);
  });

  it('classroom_gate preserves state.activity.level', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, {
      type: 'classroom_gate', section: 'PeriodX', gate: { armed: true, theme: 'mean' }
    });
    expect(s1.activity.level).toEqual(U11_LEVEL_DEF);
  });

  it('unknown message types preserve state.activity.level (default branch)', function () {
    var board = makeBoard();
    var s0 = stateWithLevelActivity(board.ClassroomBoard._reduce);
    var s1 = board.ClassroomBoard._reduce(s0, { type: 'never_heard_of_this' });
    expect(s1).toBe(s0);
    expect(s1.activity.level).toEqual(U11_LEVEL_DEF);
  });
});

// --- buildSummary surfaces activity.level via onStateChange --------------

describe('ClassroomBoard.mount -- summary.activity.level exposed via onStateChange', function () {
  it('summary.activity.level reflects the started level after classroom_activity_start', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(START_LEVEL_MSG);
    expect(lastSummary).not.toBeNull();
    expect(lastSummary.activity).not.toBeNull();
    expect(lastSummary.activity.type).toBe('level');
    expect(lastSummary.activity.level).toEqual(U11_LEVEL_DEF);
    handle.destroy();
  });

  it('summary.activity.level survives a subsequent classroom_activity_state tick', function () {
    var m = makeMount();
    var lastSummary = null;
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student',
      onStateChange: function (summary) { lastSummary = summary; }
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(START_LEVEL_MSG);
    ws._receive({
      type:    'classroom_activity_state',
      section: 'PeriodX',
      state:   Object.assign({}, INITIAL_LEVEL_STATE, {
        tally: { sips: { A: 2, B: 1 }, votes: {} }
      })
    });
    expect(lastSummary.activity.level).toEqual(U11_LEVEL_DEF);
    expect(lastSummary.activity.state.tally.sips.A).toBe(2);
    handle.destroy();
  });
});

// --- V4-V6 paths still work (level-absent stays absent) ------------------

describe('ClassroomBoard -- V4-V6 backward compatibility (no level)', function () {
  it('a bridge-mean activity start leaves state.activity.level null', function () {
    var board = makeBoard();
    var s = board.ClassroomBoard._reduce(emptyV4State(), {
      type:    'classroom_activity_start',
      section: 'PeriodX',
      activity: {
        type:       'bridge-mean',
        startedAt:  1000,
        durationMs: 90000,
        state:      { values: { alice: 5 }, target: 6 }
        // no level field
      }
    });
    expect(s.activity.type).toBe('bridge-mean');
    expect(s.activity.level).toBeNull();
  });

  it('handle.sendActivityValue still works on a level activity (channel unchanged)', function () {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test.example/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive(START_LEVEL_MSG);
    ws.sent.length = 0;
    var ok = handle.sendActivityValue({ kind: 'sip', stationId: 's1' });
    expect(ok).toBe(true);
    expect(ws.sent.length).toBe(1);
    var parsed = JSON.parse(ws.sent[0]);
    expect(parsed.type).toBe('classroom_activity_value');
    expect(parsed.payload).toEqual({ kind: 'sip', stationId: 's1' });
    handle.destroy();
  });
});

/**
 * tests/classroom-board-gate.test.js
 *
 * V7.10 mechanic-first / Zones 2 + 4 -- GateSprite + syncLevelGates.
 * Pins the physical-gate actor added in the V7.10 sprint
 * (BUILD doc sections 9 + 10 + 11).
 *
 * Coverage:
 *   - Constructor wires id, x, y, value (=label), size, predicate,
 *     getOpened, getLocalSprite, getLocalMarks, onAttempt, onWalkThrough.
 *   - _visualState() returns CLOSED-LOCKED for always_false closed,
 *     CLOSED-SCAN for every_player_row_complete closed, CLOSED-DOOR
 *     for tally_nonzero closed, OPEN when getOpened() is true.
 *   - update() X-clamps the local player back to the gate's left edge
 *     when player approaches a CLOSED gate from the left.
 *   - update() X-clamps the local player back to the gate's right edge
 *     when player approaches a CLOSED gate from the right.
 *   - update() does NOT push out when the gate is OPEN (walk-through-able).
 *   - update() fires onAttempt ONCE per closed-gate overlap (TTL guard).
 *   - update() fires onWalkThrough ONCE when player overlaps an OPEN
 *     gate (TTL guard mirrors V7.5 KeySprite _sentCollect pattern).
 *   - update() does NOT fire onWalkThrough when gate is CLOSED.
 *   - update() does NOT fire onAttempt when gate is OPEN.
 *   - syncLevelGates spawns one GateSprite per state.gates[] entry.
 *   - syncLevelGates despawns all gates when phase advances to
 *     LEVEL_CLEARED OR the activity finishes.
 *   - syncLevelGates is null-safe when state.gates is missing
 *     (legacy / non-V7.10 levels).
 *   - syncLevelGates is null-safe when state.gates is an empty array.
 *   - syncLevelGates wires onAttempt to send classroom_activity_value
 *     attempt-gate; onWalkThrough sends walk-through-gate.
 *   - Camera adoption: render() calls _translateForCamera at the top
 *     and _restoreFromCamera at the end (world-bucket pattern).
 *   - zIndex is 5 (same band as coins / key / goal / tally / pads).
 *
 * Strategy mirrors tests/classroom-board-choicepad.test.js -- vitest +
 * jsdom, load classroom-board.js into a vm context, exercise the exposed
 * _GateSprite constructor + mount() the board for the wire-shape
 * integration tests.
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

// --- mock WebSocket factory (mirrors classroom-board-choicepad.test.js)

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

// --- engine stubs (mirrors classroom-board-choicepad.test.js) ---------

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
// syncLevelGates test can reach the latest engine instance + entities Map.
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
// V7.10 GateSprite -- constructor + opts wiring
// =============================================================

describe('V7.10 GateSprite -- constructor', () => {
  it('accepts id, x, y, value, size, predicate, getOpened, getLocalSprite, getLocalMarks, onAttempt, onWalkThrough', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, value: 'Open if data show', size: 32,
      predicate: 'tally_nonzero',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return null; },
      getLocalMarks:  function () { return null; },
      onAttempt:      function () {},
      onWalkThrough:  function () {}
    });
    expect(gate.id).toBe('g-data');
    expect(gate.x).toBe(200);
    expect(gate.y).toBe(50);
    expect(gate.value).toBe('Open if data show');
    expect(gate.size).toBe(32);
    expect(gate.predicate).toBe('tally_nonzero');
    expect(typeof gate.getOpened).toBe('function');
    expect(typeof gate.getLocalSprite).toBe('function');
    expect(typeof gate.getLocalMarks).toBe('function');
    expect(typeof gate.onAttempt).toBe('function');
    expect(typeof gate.onWalkThrough).toBe('function');
    expect(gate._sentAttempt).toBe(false);
    expect(gate._sentAttemptAt).toBe(0);
    expect(gate._sentWalkThrough).toBe(false);
    expect(gate._sentWalkThroughAt).toBe(0);
  });

  it('defaults: predicate="always_false", value="", size=32, no-op getters when opts missing', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({ x: 0, y: 0 });
    expect(gate.predicate).toBe('always_false');
    expect(gate.value).toBe('');
    expect(gate.size).toBe(32);
    expect(gate.getOpened()).toBe(false);
    expect(gate.getLocalSprite()).toBeNull();
    expect(gate.getLocalMarks()).toBeNull();
    expect(gate.onAttempt).toBeNull();
    expect(gate.onWalkThrough).toBeNull();
  });

  it('zIndex is 5 (same band as coins / key / goal / tally / pads; below avatars)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({ x: 0, y: 0, predicate: 'always_false' });
    expect(gate.zIndex).toBe(5);
  });
});

// =============================================================
// V7.10 GateSprite._visualState -- predicate-driven visual variants
// =============================================================

describe('V7.10 GateSprite._visualState -- predicate-driven visuals', () => {
  it('returns CLOSED-LOCKED when predicate=always_false and getOpened=false', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      x: 0, y: 0, predicate: 'always_false',
      getOpened: function () { return false; }
    });
    expect(gate._visualState()).toBe('CLOSED-LOCKED');
  });

  it('returns CLOSED-SCAN when predicate=every_player_row_complete and getOpened=false', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      x: 0, y: 0, predicate: 'every_player_row_complete',
      getOpened: function () { return false; }
    });
    expect(gate._visualState()).toBe('CLOSED-SCAN');
  });

  it('returns CLOSED-DOOR when predicate=tally_nonzero and getOpened=false', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      x: 0, y: 0, predicate: 'tally_nonzero',
      getOpened: function () { return false; }
    });
    expect(gate._visualState()).toBe('CLOSED-DOOR');
  });

  it('returns OPEN when getOpened()=true regardless of predicate (tally_nonzero advance gate)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      x: 0, y: 0, predicate: 'tally_nonzero',
      getOpened: function () { return true; }
    });
    expect(gate._visualState()).toBe('OPEN');
  });

  it('returns OPEN when getOpened()=true even for every_player_row_complete (scanner clears)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      x: 0, y: 0, predicate: 'every_player_row_complete',
      getOpened: function () { return true; }
    });
    expect(gate._visualState()).toBe('OPEN');
  });
});

// =============================================================
// V7.10 GateSprite.update -- collision push-out (CLOSED gates)
// =============================================================

describe('V7.10 GateSprite.update -- collision push-out', () => {
  it('X-clamps the local player back to the gate left edge when approached from left (CLOSED)', () => {
    var m = makeBoard();
    // Local player center at x=200 (left of gate center at x=216).
    var spriteW = 24;
    var localStub = { x: 200, y: 50, _spriteSize: spriteW, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-block', x: 200, y: 50, size: 32, predicate: 'always_false',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; }
    });
    gate.update(0.016);
    // Player should be pushed back to gate.x - spriteW = 200 - 24 = 176.
    expect(localStub.x).toBe(gate.x - spriteW);
  });

  it('X-clamps the local player back to the gate right edge when approached from right (CLOSED)', () => {
    var m = makeBoard();
    var spriteW = 24;
    // Local player center at x=232 (right of gate center 216 -- gate x=200, size=32).
    var localStub = { x: 220, y: 50, _spriteSize: spriteW, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-block', x: 200, y: 50, size: 32, predicate: 'always_false',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; }
    });
    gate.update(0.016);
    // Player should be pushed back to gate.x + gate.size = 200 + 32 = 232.
    expect(localStub.x).toBe(gate.x + gate.size);
  });

  it('does NOT push out the player when gate is OPEN (walk-through-able)', () => {
    var m = makeBoard();
    var spriteW = 24;
    var localStub = { x: 200, y: 50, _spriteSize: spriteW, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened:      function () { return true; },
      getLocalSprite: function () { return localStub; }
    });
    var beforeX = localStub.x;
    gate.update(0.016);
    expect(localStub.x).toBe(beforeX);   // not pushed back
  });

  it('does NOT push out the player when they are not overlapping (CLOSED)', () => {
    var m = makeBoard();
    var spriteW = 24;
    // Local player far away.
    var localStub = { x: 500, y: 50, _spriteSize: spriteW, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-block', x: 200, y: 50, size: 32, predicate: 'always_false',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; }
    });
    var beforeX = localStub.x;
    gate.update(0.016);
    expect(localStub.x).toBe(beforeX);
  });
});

// =============================================================
// V7.10 GateSprite.update -- onAttempt + onWalkThrough TTL guards
// =============================================================

describe('V7.10 GateSprite.update -- onAttempt TTL guard (CLOSED gates)', () => {
  it('fires onAttempt ONCE when player overlaps a CLOSED always_false gate', () => {
    var m = makeBoard();
    var attempts = 0;
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-brand', x: 200, y: 50, size: 32, predicate: 'always_false',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; },
      onAttempt:      function () { attempts += 1; }
    });
    gate.update(0.016);
    expect(attempts).toBe(1);
    expect(gate._sentAttempt).toBe(true);
    expect(gate._sentAttemptAt).toBeGreaterThanOrEqual(0);
  });

  it('is idempotent on subsequent ticks (TTL guard prevents per-frame spam)', () => {
    var m = makeBoard();
    var attempts = 0;
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-brand', x: 200, y: 50, size: 32, predicate: 'always_false',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; },
      onAttempt:      function () { attempts += 1; }
    });
    gate.update(0.016);
    expect(attempts).toBe(1);
    // Re-snap player overlap (push-out re-clamps, then update returns
    // early because _sentAttempt is sticky). Subsequent ticks DO NOT
    // re-fire onAttempt.
    localStub.x = 200;
    gate.update(0.016);
    localStub.x = 200;
    gate.update(0.016);
    expect(attempts).toBe(1);
  });

  it('does NOT fire onAttempt when gate is OPEN', () => {
    var m = makeBoard();
    var attempts = 0;
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened:      function () { return true; },
      getLocalSprite: function () { return localStub; },
      onAttempt:      function () { attempts += 1; }
    });
    gate.update(0.016);
    expect(attempts).toBe(0);
    expect(gate._sentAttempt).toBe(false);
  });

  it('does NOT fire onAttempt when player is not overlapping (CLOSED gate)', () => {
    var m = makeBoard();
    var attempts = 0;
    var localStub = { x: 500, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-brand', x: 200, y: 50, size: 32, predicate: 'always_false',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; },
      onAttempt:      function () { attempts += 1; }
    });
    gate.update(0.016);
    expect(attempts).toBe(0);
    expect(gate._sentAttempt).toBe(false);
  });
});

describe('V7.10 GateSprite.update -- onWalkThrough fires on OPEN gate', () => {
  it('fires onWalkThrough ONCE when player overlaps an OPEN tally_nonzero gate', () => {
    var m = makeBoard();
    var walked = 0;
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened:      function () { return true; },
      getLocalSprite: function () { return localStub; },
      onWalkThrough:  function () { walked += 1; }
    });
    gate.update(0.016);
    expect(walked).toBe(1);
    expect(gate._sentWalkThrough).toBe(true);
    expect(gate._sentWalkThroughAt).toBeGreaterThanOrEqual(0);
  });

  it('does NOT re-fire on subsequent ticks while still overlapping (TTL guard)', () => {
    var m = makeBoard();
    var walked = 0;
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened:      function () { return true; },
      getLocalSprite: function () { return localStub; },
      onWalkThrough:  function () { walked += 1; }
    });
    gate.update(0.016);
    gate.update(0.016);
    gate.update(0.016);
    expect(walked).toBe(1);
  });

  it('does NOT fire onWalkThrough when gate is CLOSED (e.g. tally_nonzero before any sip)', () => {
    var m = makeBoard();
    var walked = 0;
    var localStub = { x: 200, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; },
      onWalkThrough:  function () { walked += 1; }
    });
    gate.update(0.016);
    expect(walked).toBe(0);
    expect(gate._sentWalkThrough).toBe(false);
  });

  it('does NOT fire onWalkThrough when player is not overlapping (OPEN gate)', () => {
    var m = makeBoard();
    var walked = 0;
    var localStub = { x: 500, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened:      function () { return true; },
      getLocalSprite: function () { return localStub; },
      onWalkThrough:  function () { walked += 1; }
    });
    gate.update(0.016);
    expect(walked).toBe(0);
  });
});

// =============================================================
// V7.10 GateSprite.render -- camera adoption (world-bucket pattern)
// =============================================================

describe('V7.10 GateSprite.render -- camera adoption (world bucket)', () => {
  // Minimal canvas ctx stub that records save/restore + draw calls so
  // we can verify the camera helper bracketed the paint.
  function makeCtxStub() {
    var calls = { save: 0, restore: 0, fillRect: [], fillText: [], translate: [] };
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
      strokeRect: function () {},
      fillText:   function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y }); },
      _calls:     calls
    };
  }

  it('render() calls ctx.save() at top (via _translateForCamera) and ctx.restore() at end', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 100, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened: function () { return false; }
    });
    var ctx = makeCtxStub();
    gate.render(ctx);
    // _translateForCamera issues exactly one save(); _restoreFromCamera
    // pairs with one restore(). Both must fire on a real ctx with both
    // save and restore present.
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
  });

  it('render() paints SOMETHING (fillRect for the gate body in any visual state)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-block', x: 100, y: 50, size: 32, predicate: 'always_false',
      getOpened: function () { return false; }
    });
    var ctx = makeCtxStub();
    gate.render(ctx);
    expect(ctx._calls.fillRect.length).toBeGreaterThanOrEqual(1);
  });

  it('render() is null-ctx safe (early return on null)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g', x: 0, y: 0, predicate: 'always_false',
      getOpened: function () { return false; }
    });
    expect(function () { gate.render(null); }).not.toThrow();
  });

  it('CLOSED-LOCKED variant paints an X overlay glyph', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-brand', x: 100, y: 50, size: 32, predicate: 'always_false',
      getOpened: function () { return false; }
    });
    var ctx = makeCtxStub();
    gate.render(ctx);
    var hasX = false;
    for (var i = 0; i < ctx._calls.fillText.length; i++) {
      if (ctx._calls.fillText[i].text === 'X') { hasX = true; break; }
    }
    expect(hasX).toBe(true);
  });

  it('CLOSED-DOOR variant paints a lock glyph (L stand-in)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 100, y: 50, size: 32, predicate: 'tally_nonzero',
      getOpened: function () { return false; }
    });
    var ctx = makeCtxStub();
    gate.render(ctx);
    var hasL = false;
    for (var i = 0; i < ctx._calls.fillText.length; i++) {
      if (ctx._calls.fillText[i].text === 'L') { hasL = true; break; }
    }
    expect(hasL).toBe(true);
  });

  it('CLOSED-SCAN variant paints 3 checklist icons (A / B / C glyphs)', () => {
    var m = makeBoard();
    var marks = { sampledA: true, sampledB: false, choice: null };
    var localStub = { x: 500, y: 50, _spriteSize: 24, _spriteHeight: 24 };
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-scanner', x: 100, y: 50, size: 32, predicate: 'every_player_row_complete',
      getOpened:      function () { return false; },
      getLocalSprite: function () { return localStub; },
      getLocalMarks:  function () { return marks; }
    });
    var ctx = makeCtxStub();
    gate.render(ctx);
    // The three checklist letters (A, B, C) should appear among the
    // fillText calls.
    var letters = {};
    for (var i = 0; i < ctx._calls.fillText.length; i++) {
      letters[ctx._calls.fillText[i].text] = true;
    }
    expect(letters['A']).toBe(true);
    expect(letters['B']).toBe(true);
    expect(letters['C']).toBe(true);
  });
});

// =============================================================
// V7.10 GateSprite.getLabelSpec -- label projection
// =============================================================

describe('V7.10 GateSprite.getLabelSpec -- label projection', () => {
  it('returns label text + projected x when CLOSED and value is non-empty', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-brand', x: 200, y: 50, size: 32, predicate: 'always_false',
      value: 'Open if Cup A is Coke',
      getOpened: function () { return false; }
    });
    var spec = gate.getLabelSpec();
    expect(spec).not.toBeNull();
    expect(spec.text).toBe('Open if Cup A is Coke');
    expect(typeof spec.x).toBe('number');
    expect(typeof spec.y).toBe('number');
    expect(spec.isGold).toBe(false);
  });

  it('returns null when gate is OPEN (label hidden during walk-through moment)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g-data', x: 200, y: 50, size: 32, predicate: 'tally_nonzero',
      value: 'Open if data show',
      getOpened: function () { return true; }
    });
    expect(gate.getLabelSpec()).toBeNull();
  });

  it('returns null when value is empty (no label to render)', () => {
    var m = makeBoard();
    var gate = new m.ClassroomBoard._GateSprite({
      id: 'g', x: 0, y: 0, predicate: 'always_false', value: '',
      getOpened: function () { return false; }
    });
    expect(gate.getLabelSpec()).toBeNull();
  });
});

// =============================================================
// V7.10 syncLevelGates -- spawn / despawn lifecycle
// =============================================================

describe('V7.10 syncLevelGates -- spawn / despawn lifecycle', () => {
  // Helper: drive the board to a SIPPING-phase level with Gates on the
  // wire. Default = U1.1-shape pilot (4 gates: scanner + 3 doors).
  function _sippingMsg(opts) {
    opts = opts || {};
    var defaultGates = [
      { id: 'g-scanner', x: 30, y: 3, label: 'A SIP? B SIP? CHOICE RECORDED?', predicate: 'every_player_row_complete', opened: false },
      { id: 'g-brand',   x: 36, y: 6, label: 'Open if Cup A is Coke',          predicate: 'always_false',               opened: false },
      { id: 'g-better',  x: 40, y: 6, label: 'Open if Coke is better',         predicate: 'always_false',               opened: false },
      { id: 'g-data',    x: 44, y: 6, label: 'Open if data show',              predicate: 'tally_nonzero',              opened: false }
    ];
    var gates = (opts.gates === undefined) ? defaultGates : opts.gates;
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
          map: { width: 48, height: 8, chipSize: 10 },
          actors: []
        },
        state: {
          phase: opts.phase || 'SIPPING',
          currentStage: 0,
          stagesTotal:  1,
          coins:        [],
          choicePads:   [],
          gates:        gates,
          players:      players
        }
      }
    };
  }

  it('spawns one GateSprite per state.gates[] entry (U1.1 pilot = 4 gates)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());

    var engine = m.getEngine();
    expect(engine.entities.has('gate_g-scanner')).toBe(true);
    expect(engine.entities.has('gate_g-brand')).toBe(true);
    expect(engine.entities.has('gate_g-better')).toBe(true);
    expect(engine.entities.has('gate_g-data')).toBe(true);
    var scanner = engine.entities.get('gate_g-scanner');
    var dataDoor = engine.entities.get('gate_g-data');
    expect(scanner).toBeInstanceOf(m.ClassroomBoard._GateSprite);
    expect(scanner.predicate).toBe('every_player_row_complete');
    expect(dataDoor.predicate).toBe('tally_nonzero');

    handle.destroy();
  });

  it('despawns ALL gates when activity ends (success / cancel / timeout)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('gate_g-scanner')).toBe(true);
    expect(engine.entities.has('gate_g-data')).toBe(true);

    ws._receive({ type: 'classroom_activity_success' });
    expect(engine.entities.has('gate_g-scanner')).toBe(false);
    expect(engine.entities.has('gate_g-brand')).toBe(false);
    expect(engine.entities.has('gate_g-better')).toBe(false);
    expect(engine.entities.has('gate_g-data')).toBe(false);

    handle.destroy();
  });

  it('despawns ALL gates when phase advances to LEVEL_CLEARED', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    expect(engine.entities.has('gate_g-data')).toBe(true);

    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'LEVEL_CLEARED',
        currentStage: 0, stagesTotal: 1, coins: [], choicePads: [],
        gates: [
          { id: 'g-scanner', x: 30, y: 3, label: '', predicate: 'every_player_row_complete', opened: true },
          { id: 'g-data',    x: 44, y: 6, label: '', predicate: 'tally_nonzero',              opened: true }
        ],
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: 'A' } } }
      }
    });

    expect(engine.entities.has('gate_g-scanner')).toBe(false);
    expect(engine.entities.has('gate_g-data')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.gates missing entirely (legacy V7.5/V7.7/V7.8 levels)', () => {
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
            coins: [], choicePads: []
            // no gates -- legacy shape
          }
        }
      });
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('gate_g-data')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.gates is an empty array (no spawn, no crash)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    expect(function () {
      ws._receive(_sippingMsg({ gates: [] }));
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('gate_g-data')).toBe(false);

    handle.destroy();
  });

  it('spawned gate reads getOpened from mount-scope state.gates each tick', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var dataDoor = engine.entities.get('gate_g-data');
    // Initially closed.
    expect(dataDoor.getOpened()).toBe(false);

    // Server tick: g-data flips opened=true (tally_nonzero predicate
    // satisfied -- class has recorded a row).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [],
        gates: [
          { id: 'g-scanner', x: 30, y: 3, label: '', predicate: 'every_player_row_complete', opened: false },
          { id: 'g-brand',   x: 36, y: 6, label: '', predicate: 'always_false',              opened: false },
          { id: 'g-better',  x: 40, y: 6, label: '', predicate: 'always_false',              opened: false },
          { id: 'g-data',    x: 44, y: 6, label: '', predicate: 'tally_nonzero',             opened: true }
        ],
        players: { alice: { x: 100, y: 200, marks: { sampledA: true, sampledB: true, choice: 'A' } } }
      }
    });

    // Same entity instance, closure now reaches the updated wire state.
    expect(dataDoor.getOpened()).toBe(true);
    expect(dataDoor._visualState()).toBe('OPEN');

    handle.destroy();
  });

  it('onAttempt sends classroom_activity_value attempt-gate with the gate id', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var brand  = engine.entities.get('gate_g-brand');
    expect(typeof brand.onAttempt).toBe('function');
    brand.onAttempt();

    var sentMsgs = ws.sent.map(function (s) { try { return JSON.parse(s); } catch (_) { return null; } });
    var attemptMsg = null;
    for (var i = sentMsgs.length - 1; i >= 0; i--) {
      var msg = sentMsgs[i];
      if (msg && msg.type === 'classroom_activity_value' && msg.payload && msg.payload.kind === 'attempt-gate') {
        attemptMsg = msg;
        break;
      }
    }
    expect(attemptMsg).not.toBeNull();
    expect(attemptMsg.payload.gateId).toBe('g-brand');

    handle.destroy();
  });

  it('onWalkThrough sends classroom_activity_value walk-through-gate with the gate id', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var dataDoor = engine.entities.get('gate_g-data');
    expect(typeof dataDoor.onWalkThrough).toBe('function');
    dataDoor.onWalkThrough();

    var sentMsgs = ws.sent.map(function (s) { try { return JSON.parse(s); } catch (_) { return null; } });
    var walkMsg = null;
    for (var i = sentMsgs.length - 1; i >= 0; i--) {
      var msg = sentMsgs[i];
      if (msg && msg.type === 'classroom_activity_value' && msg.payload && msg.payload.kind === 'walk-through-gate') {
        walkMsg = msg;
        break;
      }
    }
    expect(walkMsg).not.toBeNull();
    expect(walkMsg.payload.gateId).toBe('g-data');

    handle.destroy();
  });

  it('TTL guard clears _sentAttempt when player steps off the closed gate', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_sippingMsg());
    var engine = m.getEngine();
    var brand  = engine.entities.get('gate_g-brand');

    // Simulate the local player walking into the closed gate -- _sentAttempt
    // flips true via the local update() path.
    brand._sentAttempt   = true;
    brand._sentAttemptAt = Date.now();

    // Next wire tick: player has moved away (no overlap). The TTL-guard
    // clear in syncLevelGates should reset _sentAttempt so a re-approach
    // re-fires (mirrors ChoicePadSprite _sentChoice clear pattern).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [],
        gates: [
          { id: 'g-scanner', x: 30, y: 3, label: '', predicate: 'every_player_row_complete', opened: false },
          { id: 'g-brand',   x: 36, y: 6, label: '', predicate: 'always_false',              opened: false },
          { id: 'g-better',  x: 40, y: 6, label: '', predicate: 'always_false',              opened: false },
          { id: 'g-data',    x: 44, y: 6, label: '', predicate: 'tally_nonzero',             opened: false }
        ],
        players: { alice: { x: 100, y: 200, marks: { sampledA: false, sampledB: false, choice: null } } }
      }
    });

    expect(brand._sentAttempt).toBe(false);
    expect(brand._sentAttemptAt).toBe(0);

    handle.destroy();
  });
});

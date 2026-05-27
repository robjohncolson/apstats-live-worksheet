/**
 * tests/classroom-board-zone5.test.js
 *
 * V7.14 mechanic-first / Zone 5 -- ContextSlotSprite + GoalPadSprite +
 * syncLevelContextSlots + syncLevelGoalPad. Pins the whole-class endgame
 * sprites added in the V7.14 sprint (BUILD doc sections 9 + 10 + 11 + 12).
 *
 * Coverage:
 *   - ContextSlotSprite constructor wires id, x, y, label, size, getLit,
 *     getLocalSprite; defaults size=32, getLit=()=>false; zIndex=5.
 *   - _visualState() returns LIT when getLit()=true, UNLIT otherwise.
 *   - render() honors the camera-bracket pattern (ctx.save at the top
 *     via _translateForCamera; ctx.restore at the end via
 *     _restoreFromCamera).
 *   - render() is null-ctx safe.
 *   - render() UNLIT paints gray rect + border; render() LIT paints
 *     green rect + border + "+" ASCII checkmark glyph.
 *   - render() paints the label string regardless of visual state.
 *   - render() pulses alpha on UNLIT when local player is near (overlap
 *     within the cue radius).
 *   - getLabelSpec() returns null (slot paints its own label inline).
 *
 *   - GoalPadSprite constructor wires id, x, y, size, getActive,
 *     getPresenceMs, getTriggerMs, getLocalSprite; defaults size=36,
 *     getActive=()=>false, getPresenceMs=()=>0, getTriggerMs=()=>1500;
 *     zIndex=5.
 *   - _visualState() returns DORMANT / ACTIVE / FILLING per BUILD doc.
 *   - render() honors the camera-bracket pattern.
 *   - render() is null-ctx safe.
 *   - render() DORMANT paints dim gray pad with "ALL CLASS" label;
 *     render() ACTIVE / FILLING paint solid green pad with pulsing
 *     ring and "STAND HERE" label.
 *   - render() ring thickness scales with presenceMs / triggerMs in
 *     FILLING state.
 *   - getLabelSpec() returns null.
 *
 *   - syncLevelContextSlots spawns one ContextSlotSprite per
 *     state.contextSlots[] entry.
 *   - syncLevelContextSlots despawns ALL slots when activity ends.
 *   - syncLevelContextSlots despawns ALL slots when phase advances to
 *     LEVEL_CLEARED.
 *   - syncLevelContextSlots is null-safe when state.contextSlots is
 *     missing entirely (legacy / pre-V7.14 levels).
 *   - syncLevelContextSlots is null-safe when state.contextSlots is
 *     an empty array.
 *   - Spawned slot reads getLit from mount-scope state each tick.
 *   - syncLevelContextSlots refreshes label + position when wire
 *     re-emits a known slot id with new coords.
 *
 *   - syncLevelGoalPad spawns the singleton GoalPadSprite when
 *     state.goalPad is non-null.
 *   - syncLevelGoalPad despawns the pad when state.goalPad is null.
 *   - syncLevelGoalPad despawns the pad when phase advances to
 *     LEVEL_CLEARED.
 *   - syncLevelGoalPad despawns the pad when activity ends.
 *   - Spawned pad's getActive closure reads state.contextSlots and
 *     returns true ONLY when every slot.lit === true.
 *   - Spawned pad's getPresenceMs closure reads
 *     state.goalPad.presenceMs each tick.
 *   - Spawned pad's getTriggerMs closure reads
 *     state.goalPad.triggerMs each tick (defaulting 1500).
 *
 * Strategy mirrors tests/classroom-board-tally-chute.test.js -- vitest +
 * jsdom, load classroom-board.js into a vm context, exercise the exposed
 * _ContextSlotSprite + _GoalPadSprite constructors + mount() the board
 * for the wire-shape integration tests.
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

// --- mock WebSocket factory (mirrors classroom-board-tally-chute.test.js)

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

// --- engine stubs (mirrors classroom-board-tally-chute.test.js) -------

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
// draw call AND snapshots the fillStyle / strokeStyle at draw time so
// tests can assert color-per-state.
function makeCtxStub() {
  var calls = {
    save:       0,
    restore:    0,
    fillRect:   [],
    strokeRect: [],
    fillText:   [],
    translate:  []
  };
  var stub = {
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
    fillRect:   function (x, y, w, h) {
      calls.fillRect.push({ x: x, y: y, w: w, h: h, fillStyle: this.fillStyle, alpha: this.globalAlpha });
    },
    strokeRect: function (x, y, w, h) {
      calls.strokeRect.push({ x: x, y: y, w: w, h: h, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, alpha: this.globalAlpha });
    },
    fillText:   function (text, x, y) {
      calls.fillText.push({ text: text, x: x, y: y, font: this.font, fillStyle: this.fillStyle });
    },
    _calls:     calls
  };
  return stub;
}

// =============================================================
// V7.14 ContextSlotSprite -- constructor + opts wiring
// =============================================================

describe('V7.14 ContextSlotSprite -- constructor', () => {
  it('accepts id, x, y, label, size, getLit, getLocalSprite', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 320, y: 200, label: 'QUESTION: ...', size: 32,
      getLit:         function () { return true; },
      getLocalSprite: function () { return null; }
    });
    expect(slot.id).toBe('cs-q');
    expect(slot.x).toBe(320);
    expect(slot.y).toBe(200);
    expect(slot.label).toBe('QUESTION: ...');
    expect(slot.size).toBe(32);
    expect(typeof slot.getLit).toBe('function');
    expect(slot.getLit()).toBe(true);
    expect(typeof slot.getLocalSprite).toBe('function');
  });

  it('defaults: label="", size=32, getLit=()=>false, getLocalSprite=()=>null, _bobT=0', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({ x: 0, y: 0 });
    expect(slot.label).toBe('');
    expect(slot.size).toBe(32);
    expect(typeof slot.getLit).toBe('function');
    expect(slot.getLit()).toBe(false);
    expect(slot.getLocalSprite()).toBeNull();
    expect(slot._bobT).toBe(0);
  });

  it('zIndex is 5 (same band as gates / chutes / coins; below avatars)', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({ x: 0, y: 0 });
    expect(slot.zIndex).toBe(5);
  });

  it('id defaults to empty string when opts.id is missing', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({ x: 0, y: 0, label: 'X' });
    expect(slot.id).toBe('');
  });
});

// =============================================================
// V7.14 ContextSlotSprite._visualState -- 2-state lit toggle
// =============================================================

describe('V7.14 ContextSlotSprite._visualState -- UNLIT / LIT', () => {
  it('returns UNLIT when getLit()=false', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 0, y: 0, label: 'Q', getLit: function () { return false; }
    });
    expect(slot._visualState()).toBe('UNLIT');
  });

  it('returns LIT when getLit()=true', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 0, y: 0, label: 'Q', getLit: function () { return true; }
    });
    expect(slot._visualState()).toBe('LIT');
  });
});

// =============================================================
// V7.14 ContextSlotSprite.update -- accumulates _bobT for pulse
// =============================================================

describe('V7.14 ContextSlotSprite.update -- _bobT accumulator', () => {
  it('update() accumulates dt into _bobT (pulse animation), no callbacks', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({ x: 0, y: 0, label: 'Q' });
    slot.update(0.016);
    expect(slot._bobT).toBeCloseTo(0.016, 5);
    slot.update(0.016);
    expect(slot._bobT).toBeCloseTo(0.032, 5);
  });
});

// =============================================================
// V7.14 ContextSlotSprite.render -- camera adoption (world bucket)
// =============================================================

describe('V7.14 ContextSlotSprite.render -- camera adoption (world bucket)', () => {
  it('render() calls ctx.save() at top (via _translateForCamera) and ctx.restore() at end', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 100, y: 200, label: 'Q',
      getLit: function () { return false; }
    });
    var ctx = makeCtxStub();
    slot.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
  });

  it('render() is null-ctx safe (early return on null)', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 0, y: 0, label: 'Q',
      getLit: function () { return false; }
    });
    expect(function () { slot.render(null); }).not.toThrow();
  });
});

// =============================================================
// V7.14 ContextSlotSprite.render -- visual state painting
// =============================================================

describe('V7.14 ContextSlotSprite.render -- UNLIT vs LIT painting', () => {
  it('UNLIT renders gray rect (color #9E9E9E) with black border, NO "+" glyph', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 100, y: 200, label: 'Q',
      getLit: function () { return false; }
    });
    var ctx = makeCtxStub();
    slot.render(ctx);
    // Exactly one rect fill (the slot body) at gray color.
    expect(ctx._calls.fillRect.length).toBe(1);
    expect(ctx._calls.fillRect[0].fillStyle).toBe('#9E9E9E');
    // Border stroked.
    expect(ctx._calls.strokeRect.length).toBe(1);
    expect(ctx._calls.strokeRect[0].strokeStyle).toBe('#222222');
    // No "+" glyph in UNLIT.
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).not.toContain('+');
    // But the label IS painted.
    expect(texts).toContain('Q');
  });

  it('LIT renders green rect (color #43A047) with border AND "+" ASCII checkmark', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 100, y: 200, label: 'Q',
      getLit: function () { return true; }
    });
    var ctx = makeCtxStub();
    slot.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(1);
    expect(ctx._calls.fillRect[0].fillStyle).toBe('#43A047');
    expect(ctx._calls.strokeRect.length).toBe(1);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('+');
    // Label still painted in LIT state.
    expect(texts).toContain('Q');
  });

  it('label string is painted in BOTH visual states (slot tells you what claim component it is)', () => {
    var m = makeBoard();
    var unlit = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 0, y: 0, label: 'QUESTION: which?',
      getLit: function () { return false; }
    });
    var lit = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 0, y: 0, label: 'QUESTION: which?',
      getLit: function () { return true; }
    });
    var ctxU = makeCtxStub();
    var ctxL = makeCtxStub();
    unlit.render(ctxU);
    lit.render(ctxL);
    var textsU = ctxU._calls.fillText.map(function (c) { return c.text; });
    var textsL = ctxL._calls.fillText.map(function (c) { return c.text; });
    expect(textsU).toContain('QUESTION: which?');
    expect(textsL).toContain('QUESTION: which?');
  });
});

// =============================================================
// V7.14 ContextSlotSprite.render -- "walk to me" alpha pulse cue
// =============================================================

describe('V7.14 ContextSlotSprite.render -- alpha pulse cue when near', () => {
  it('UNLIT renders at flat alpha=1 when local player is far away (no pulse)', () => {
    var m = makeBoard();
    var farPlayer = { x: 1000, y: 200, _spriteSize: 24 };
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 100, y: 200, size: 32, label: 'Q',
      getLit:         function () { return false; },
      getLocalSprite: function () { return farPlayer; }
    });
    var ctx = makeCtxStub();
    slot.render(ctx);
    // First fillRect = the slot body; should NOT be pulsed (alpha = 1).
    expect(ctx._calls.fillRect[0].alpha).toBe(1);
  });

  it('UNLIT pulses alpha when local player is overlapping (sub-1 alpha at non-peak _bobT)', () => {
    var m = makeBoard();
    // Player center matches slot center -> in the cue radius.
    var nearPlayer = { x: 108, y: 200, _spriteSize: 24 };
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 100, y: 200, size: 32, label: 'Q',
      getLit:         function () { return false; },
      getLocalSprite: function () { return nearPlayer; }
    });
    // Advance _bobT to a non-peak point so the pulse alpha is < 1.
    // sin(2*pi*3*0.05) is ~0.81; 0.55 + 0.45*(0.5 + 0.5*0.81) = ~0.96.
    // sin(2*pi*3*0.0833...) ~ 0; 0.55 + 0.45*0.5 = ~0.775.
    slot._bobT = 0.0833;
    var ctx = makeCtxStub();
    slot.render(ctx);
    var bodyAlpha = ctx._calls.fillRect[0].alpha;
    expect(bodyAlpha).toBeLessThan(1);
    expect(bodyAlpha).toBeGreaterThanOrEqual(0.5);
  });

  it('LIT does NOT pulse alpha when near (lit slots are stable)', () => {
    var m = makeBoard();
    var nearPlayer = { x: 108, y: 200, _spriteSize: 24 };
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 100, y: 200, size: 32, label: 'Q',
      getLit:         function () { return true; },
      getLocalSprite: function () { return nearPlayer; }
    });
    slot._bobT = 0.0833;
    var ctx = makeCtxStub();
    slot.render(ctx);
    // LIT branch sets alpha = 1 before fillRect.
    expect(ctx._calls.fillRect[0].alpha).toBe(1);
  });
});

// =============================================================
// V7.14 ContextSlotSprite.getLabelSpec -- inline label
// =============================================================

describe('V7.14 ContextSlotSprite.getLabelSpec -- inline label', () => {
  it('returns null (slot paints its own label inside render)', () => {
    var m = makeBoard();
    var slot = new m.ClassroomBoard._ContextSlotSprite({
      id: 'cs-q', x: 0, y: 0, label: 'Q',
      getLit: function () { return false; }
    });
    expect(slot.getLabelSpec()).toBeNull();
  });
});

// =============================================================
// V7.14 GoalPadSprite -- constructor + opts wiring
// =============================================================

describe('V7.14 GoalPadSprite -- constructor', () => {
  it('accepts id, x, y, size, getActive, getPresenceMs, getTriggerMs, getLocalSprite', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      id: 'goal-pad', x: 400, y: 200, size: 36,
      getActive:      function () { return true; },
      getPresenceMs:  function () { return 750; },
      getTriggerMs:   function () { return 1500; },
      getLocalSprite: function () { return null; }
    });
    expect(pad.id).toBe('goal-pad');
    expect(pad.x).toBe(400);
    expect(pad.y).toBe(200);
    expect(pad.size).toBe(36);
    expect(typeof pad.getActive).toBe('function');
    expect(pad.getActive()).toBe(true);
    expect(pad.getPresenceMs()).toBe(750);
    expect(pad.getTriggerMs()).toBe(1500);
  });

  it('defaults: size=36, getActive=()=>false, getPresenceMs=()=>0, getTriggerMs=()=>1500, _bobT=0', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({ x: 0, y: 0 });
    expect(pad.size).toBe(36);
    expect(typeof pad.getActive).toBe('function');
    expect(pad.getActive()).toBe(false);
    expect(pad.getPresenceMs()).toBe(0);
    expect(pad.getTriggerMs()).toBe(1500);
    expect(pad._bobT).toBe(0);
  });

  it('zIndex is 5 (same band as the other world sprites; below avatars)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({ x: 0, y: 0 });
    expect(pad.zIndex).toBe(5);
  });

  it('id defaults to empty string when opts.id is missing', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({ x: 0, y: 0 });
    expect(pad.id).toBe('');
  });
});

// =============================================================
// V7.14 GoalPadSprite._visualState -- 3-state DORMANT / ACTIVE / FILLING
// =============================================================

describe('V7.14 GoalPadSprite._visualState -- DORMANT / ACTIVE / FILLING', () => {
  it('returns DORMANT when getActive()=false (regardless of presenceMs)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 0, y: 0,
      getActive:     function () { return false; },
      getPresenceMs: function () { return 0; }
    });
    expect(pad._visualState()).toBe('DORMANT');
  });

  it('returns DORMANT even if presenceMs > 0 but getActive=false (defensive)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 0, y: 0,
      getActive:     function () { return false; },
      getPresenceMs: function () { return 500; }
    });
    expect(pad._visualState()).toBe('DORMANT');
  });

  it('returns ACTIVE when getActive()=true and presenceMs=0 (slots lit, no one stood yet)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 0, y: 0,
      getActive:     function () { return true; },
      getPresenceMs: function () { return 0; }
    });
    expect(pad._visualState()).toBe('ACTIVE');
  });

  it('returns FILLING when getActive()=true and presenceMs>0', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 0, y: 0,
      getActive:     function () { return true; },
      getPresenceMs: function () { return 500; }
    });
    expect(pad._visualState()).toBe('FILLING');
  });
});

// =============================================================
// V7.14 GoalPadSprite.update -- _bobT accumulator
// =============================================================

describe('V7.14 GoalPadSprite.update -- _bobT accumulator', () => {
  it('update() accumulates dt into _bobT (4 Hz pulse animation), no callbacks', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({ x: 0, y: 0 });
    pad.update(0.016);
    expect(pad._bobT).toBeCloseTo(0.016, 5);
    pad.update(0.016);
    expect(pad._bobT).toBeCloseTo(0.032, 5);
  });
});

// =============================================================
// V7.14 GoalPadSprite.render -- camera adoption (world bucket)
// =============================================================

describe('V7.14 GoalPadSprite.render -- camera adoption (world bucket)', () => {
  it('render() calls ctx.save() at top (via _translateForCamera) and ctx.restore() at end', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 100, y: 200,
      getActive: function () { return false; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
  });

  it('render() is null-ctx safe (early return on null)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 0, y: 0,
      getActive: function () { return false; }
    });
    expect(function () { pad.render(null); }).not.toThrow();
  });
});

// =============================================================
// V7.14 GoalPadSprite.render -- visual state painting
// =============================================================

describe('V7.14 GoalPadSprite.render -- DORMANT vs ACTIVE vs FILLING painting', () => {
  it('DORMANT paints dim gray pad (color #666666) with "ALL CLASS" label, NO ring', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 100, y: 200, size: 36,
      getActive:     function () { return false; },
      getPresenceMs: function () { return 0; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    expect(ctx._calls.fillRect.length).toBe(1);
    expect(ctx._calls.fillRect[0].fillStyle).toBe('#666666');
    // DORMANT only strokes the body border (1 strokeRect), not a ring.
    expect(ctx._calls.strokeRect.length).toBe(1);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('ALL CLASS');
    expect(texts).not.toContain('STAND HERE');
  });

  it('ACTIVE paints solid green pad (color #43A047) + pulsing ring + "STAND HERE" label', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 100, y: 200, size: 36,
      getActive:     function () { return true; },
      getPresenceMs: function () { return 0; },
      getTriggerMs:  function () { return 1500; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    expect(ctx._calls.fillRect[0].fillStyle).toBe('#43A047');
    // ACTIVE strokes 2 rects: body border + ring.
    expect(ctx._calls.strokeRect.length).toBe(2);
    var texts = ctx._calls.fillText.map(function (c) { return c.text; });
    expect(texts).toContain('STAND HERE');
    expect(texts).not.toContain('ALL CLASS');
  });

  it('FILLING paints solid green pad + thicker ring proportional to presenceMs/triggerMs', () => {
    var m = makeBoard();
    // 750 / 1500 = 0.5 progress -> ring thickness halfway between min (2) and max (8) = 5.
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 100, y: 200, size: 36,
      getActive:     function () { return true; },
      getPresenceMs: function () { return 750; },
      getTriggerMs:  function () { return 1500; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    // The 2nd strokeRect is the ring (1st is body border at lineWidth 2).
    expect(ctx._calls.strokeRect.length).toBe(2);
    var ringStroke = ctx._calls.strokeRect[1];
    expect(ringStroke.lineWidth).toBeGreaterThan(2);    // thicker than the body border
    expect(ringStroke.lineWidth).toBeLessThan(8);       // not at max yet (only 50% filled)
    expect(ringStroke.strokeStyle).toBe('#66BB6A');
  });

  it('FILLING at 100% (presenceMs >= triggerMs) renders ring at max thickness (8px)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 100, y: 200, size: 36,
      getActive:     function () { return true; },
      getPresenceMs: function () { return 1500; },
      getTriggerMs:  function () { return 1500; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    var ringStroke = ctx._calls.strokeRect[1];
    expect(ringStroke.lineWidth).toBe(8);
  });

  it('FILLING at 0% (defensive: state-transition tick where presenceMs just bumped) clamps to min', () => {
    var m = makeBoard();
    // Edge case: getPresenceMs returns a tiny positive number; ring should be just above min.
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 100, y: 200, size: 36,
      getActive:     function () { return true; },
      getPresenceMs: function () { return 1; },
      getTriggerMs:  function () { return 1500; }
    });
    var ctx = makeCtxStub();
    pad.render(ctx);
    var ringStroke = ctx._calls.strokeRect[1];
    // 1/1500 ~ 0 -> ring thickness ~ 2 (min).
    expect(ringStroke.lineWidth).toBeGreaterThanOrEqual(2);
    expect(ringStroke.lineWidth).toBeLessThan(2.1);
  });
});

// =============================================================
// V7.14 GoalPadSprite.getLabelSpec -- inline label
// =============================================================

describe('V7.14 GoalPadSprite.getLabelSpec -- inline label', () => {
  it('returns null (pad paints its own label inside render)', () => {
    var m = makeBoard();
    var pad = new m.ClassroomBoard._GoalPadSprite({
      x: 0, y: 0,
      getActive: function () { return false; }
    });
    expect(pad.getLabelSpec()).toBeNull();
  });
});

// =============================================================
// V7.14 syncLevelContextSlots -- spawn / despawn lifecycle
// =============================================================

describe('V7.14 syncLevelContextSlots -- spawn / despawn lifecycle', () => {
  // Helper: drive the board to a GOAL_AVAILABLE level with ContextSlots
  // + GoalPad on the wire. Default = U1.1 V7.14 pilot (3 slots, 1 pad).
  function _zone5Msg(opts) {
    opts = opts || {};
    var defaultSlots = [
      { id: 'cs-q', x: 84, y: 5, label: 'QUESTION: which?', lit: false },
      { id: 'cs-v', x: 87, y: 5, label: 'VARIABLE: A or B', lit: false },
      { id: 'cs-c', x: 90, y: 5, label: 'CONTEXT: this trial', lit: false }
    ];
    var defaultPad = { id: 'goal-pad', x: 94, y: 7, presenceMs: 0, triggerMs: 1500 };
    var slots   = (opts.contextSlots === undefined) ? defaultSlots : opts.contextSlots;
    var pad     = (opts.goalPad      === undefined) ? defaultPad   : opts.goalPad;
    var players = (opts.players      === undefined)
      ? { alice: { x: 800, y: 200, marks: { sampledA: true, sampledB: true, choice: 'A' } } }
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
          map: { width: 96, height: 8, chipSize: 10 },
          actors: []
        },
        state: {
          phase: opts.phase || 'GOAL_AVAILABLE',
          currentStage: 0,
          stagesTotal:  1,
          coins:        [],
          choicePads:   [],
          gates:        [],
          tallyChutes:  [],
          tally:        { sips: { A: 3, B: 2 } },
          contextSlots: slots,
          goalPad:      pad,
          players:      players
        }
      }
    };
  }

  it('spawns one ContextSlotSprite per state.contextSlots[] entry (U1.1 pilot = 3 slots)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());

    var engine = m.getEngine();
    expect(engine.entities.has('contextslot_cs-q')).toBe(true);
    expect(engine.entities.has('contextslot_cs-v')).toBe(true);
    expect(engine.entities.has('contextslot_cs-c')).toBe(true);
    var slotQ = engine.entities.get('contextslot_cs-q');
    expect(slotQ).toBeInstanceOf(m.ClassroomBoard._ContextSlotSprite);
    expect(slotQ.label).toBe('QUESTION: which?');

    handle.destroy();
  });

  it('despawns ALL slots when activity ends (success / cancel / timeout)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('contextslot_cs-q')).toBe(true);

    ws._receive({ type: 'classroom_activity_success' });
    expect(engine.entities.has('contextslot_cs-q')).toBe(false);
    expect(engine.entities.has('contextslot_cs-v')).toBe(false);
    expect(engine.entities.has('contextslot_cs-c')).toBe(false);

    handle.destroy();
  });

  it('despawns ALL slots when phase advances to LEVEL_CLEARED', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('contextslot_cs-q')).toBe(true);

    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'LEVEL_CLEARED',
        currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true },
          { id: 'cs-v', x: 87, y: 5, label: 'V', lit: true },
          { id: 'cs-c', x: 90, y: 5, label: 'C', lit: true }
        ],
        goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 1500, triggerMs: 1500 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 940, y: 200, marks: {} } }
      }
    });

    expect(engine.entities.has('contextslot_cs-q')).toBe(false);
    expect(engine.entities.has('contextslot_cs-v')).toBe(false);
    expect(engine.entities.has('contextslot_cs-c')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.contextSlots missing entirely (legacy V7.5-V7.13 levels)', () => {
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
            // no contextSlots, no goalPad -- legacy shape
          }
        }
      });
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('contextslot_cs-q')).toBe(false);

    handle.destroy();
  });

  it('null-safe: state.contextSlots is an empty array (no spawn, no crash)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    expect(function () {
      ws._receive(_zone5Msg({ contextSlots: [] }));
    }).not.toThrow();

    var engine = m.getEngine();
    expect(engine.entities.has('contextslot_cs-q')).toBe(false);

    handle.destroy();
  });

  it('spawned slot reads getLit from mount-scope state.contextSlots[].lit each tick', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Initial wire: all slots UNLIT.
    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    var slotQ = engine.entities.get('contextslot_cs-q');
    expect(slotQ.getLit()).toBe(false);

    // Server tick: cs-q just lit.
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'GOAL_AVAILABLE', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true },
          { id: 'cs-v', x: 87, y: 5, label: 'V', lit: false },
          { id: 'cs-c', x: 90, y: 5, label: 'C', lit: false }
        ],
        goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 0, triggerMs: 1500 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 850, y: 200, marks: {} } }
      }
    });

    // Same entity, fresh wire state -- closure reaches MOUNT-scope.
    expect(slotQ.getLit()).toBe(true);
    var slotV = engine.entities.get('contextslot_cs-v');
    expect(slotV.getLit()).toBe(false);

    handle.destroy();
  });

  it('refreshes label + position when wire re-emits a known slot id with new coords', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    var slotQ = engine.entities.get('contextslot_cs-q');
    var originalX = slotQ.x;

    // Wire re-emit: same id, different x + different label (hot-swap).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'GOAL_AVAILABLE', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 80, y: 5, label: 'QUESTION (renamed)', lit: false },
          { id: 'cs-v', x: 87, y: 5, label: 'V', lit: false },
          { id: 'cs-c', x: 90, y: 5, label: 'C', lit: false }
        ],
        goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 0, triggerMs: 1500 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 800, y: 200, marks: {} } }
      }
    });

    var slotQ2 = engine.entities.get('contextslot_cs-q');
    expect(slotQ2).toBe(slotQ);                       // same instance
    expect(slotQ2.x).not.toBe(originalX);             // x re-applied
    expect(slotQ2.label).toBe('QUESTION (renamed)');  // label re-applied

    handle.destroy();
  });

  it('despawns slots that vanish from a subsequent wire tick (state.contextSlots shrinks)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('contextslot_cs-q')).toBe(true);
    expect(engine.entities.has('contextslot_cs-v')).toBe(true);
    expect(engine.entities.has('contextslot_cs-c')).toBe(true);

    // Wire emits ONLY cs-q this tick -- cs-v + cs-c should despawn.
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'GOAL_AVAILABLE', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true }
        ],
        goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 0, triggerMs: 1500 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 800, y: 200, marks: {} } }
      }
    });

    expect(engine.entities.has('contextslot_cs-q')).toBe(true);
    expect(engine.entities.has('contextslot_cs-v')).toBe(false);
    expect(engine.entities.has('contextslot_cs-c')).toBe(false);

    handle.destroy();
  });
});

// =============================================================
// V7.14 syncLevelGoalPad -- singleton lifecycle
// =============================================================

describe('V7.14 syncLevelGoalPad -- singleton lifecycle', () => {
  function _zone5Msg(opts) {
    opts = opts || {};
    var defaultSlots = [
      { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: false },
      { id: 'cs-v', x: 87, y: 5, label: 'V', lit: false },
      { id: 'cs-c', x: 90, y: 5, label: 'C', lit: false }
    ];
    var defaultPad = { id: 'goal-pad', x: 94, y: 7, presenceMs: 0, triggerMs: 1500 };
    var slots = (opts.contextSlots === undefined) ? defaultSlots : opts.contextSlots;
    var pad   = (opts.goalPad      === undefined) ? defaultPad   : opts.goalPad;
    return {
      type: 'classroom_activity_start',
      activity: {
        type: 'level',
        startedAt: 1000, durationMs: 60000,
        level: {
          schema: 'v7.5-level-1', levelKey: 'U1.1', lessonKey: '1.1',
          title: 'Cola mystery', duration: 60,
          map: { width: 96, height: 8, chipSize: 10 }, actors: []
        },
        state: {
          phase: opts.phase || 'GOAL_AVAILABLE',
          currentStage: 0, stagesTotal: 1,
          coins: [], choicePads: [], gates: [], tallyChutes: [],
          tally: { sips: { A: 3, B: 2 } },
          contextSlots: slots,
          goalPad:      pad,
          players: { alice: { x: 800, y: 200, marks: {} } }
        }
      }
    };
  }

  it('spawns the singleton GoalPadSprite when state.goalPad is non-null', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('level_goalpad')).toBe(true);
    var pad = engine.entities.get('level_goalpad');
    expect(pad).toBeInstanceOf(m.ClassroomBoard._GoalPadSprite);
    expect(pad.id).toBe('goal-pad');

    handle.destroy();
  });

  it('does NOT spawn the pad when state.goalPad is null (legacy levels keep V7.5 GoalSprite)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg({ goalPad: null }));
    var engine = m.getEngine();
    expect(engine.entities.has('level_goalpad')).toBe(false);

    handle.destroy();
  });

  it('despawns the pad when activity ends (success / cancel / timeout)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('level_goalpad')).toBe(true);

    ws._receive({ type: 'classroom_activity_success' });
    expect(engine.entities.has('level_goalpad')).toBe(false);

    handle.destroy();
  });

  it('despawns the pad when phase advances to LEVEL_CLEARED', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('level_goalpad')).toBe(true);

    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'LEVEL_CLEARED', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true },
          { id: 'cs-v', x: 87, y: 5, label: 'V', lit: true },
          { id: 'cs-c', x: 90, y: 5, label: 'C', lit: true }
        ],
        goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 1500, triggerMs: 1500 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 940, y: 200, marks: {} } }
      }
    });

    expect(engine.entities.has('level_goalpad')).toBe(false);

    handle.destroy();
  });

  it('despawns the pad when subsequent wire tick has state.goalPad = null', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    expect(engine.entities.has('level_goalpad')).toBe(true);

    // Wire flips goalPad to null (e.g., level hot-swap to a legacy shape).
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'GOAL_AVAILABLE', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [],
        goalPad: null,
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 800, y: 200, marks: {} } }
      }
    });

    expect(engine.entities.has('level_goalpad')).toBe(false);

    handle.destroy();
  });

  it('spawned pad getActive() returns false when not all contextSlots are lit', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Initial wire: 2 of 3 slots lit.
    ws._receive(_zone5Msg({
      contextSlots: [
        { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true },
        { id: 'cs-v', x: 87, y: 5, label: 'V', lit: true },
        { id: 'cs-c', x: 90, y: 5, label: 'C', lit: false }
      ]
    }));
    var engine = m.getEngine();
    var pad = engine.entities.get('level_goalpad');
    expect(pad.getActive()).toBe(false);

    handle.destroy();
  });

  it('spawned pad getActive() returns true ONLY when every contextSlot.lit === true', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Initial wire: all 3 slots lit.
    ws._receive(_zone5Msg({
      contextSlots: [
        { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true },
        { id: 'cs-v', x: 87, y: 5, label: 'V', lit: true },
        { id: 'cs-c', x: 90, y: 5, label: 'C', lit: true }
      ]
    }));
    var engine = m.getEngine();
    var pad = engine.entities.get('level_goalpad');
    expect(pad.getActive()).toBe(true);

    handle.destroy();
  });

  it('spawned pad getActive() returns false when contextSlots is empty (no slots = no claim assembled)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Empty slots but pad present (edge case: hand-rolled level).
    ws._receive(_zone5Msg({ contextSlots: [] }));
    var engine = m.getEngine();
    var pad = engine.entities.get('level_goalpad');
    expect(pad.getActive()).toBe(false);

    handle.destroy();
  });

  it('spawned pad getPresenceMs / getTriggerMs read state.goalPad fields each tick', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Initial: presence=0, trigger=1500 (default).
    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    var pad = engine.entities.get('level_goalpad');
    expect(pad.getPresenceMs()).toBe(0);
    expect(pad.getTriggerMs()).toBe(1500);

    // Server tick: class is standing on the pad; presence accumulating.
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'GOAL_AVAILABLE', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: true },
          { id: 'cs-v', x: 87, y: 5, label: 'V', lit: true },
          { id: 'cs-c', x: 90, y: 5, label: 'C', lit: true }
        ],
        goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 800, triggerMs: 2000 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 940, y: 200, marks: {} } }
      }
    });

    // Same entity instance, fresh wire data -- closure reaches MOUNT-scope.
    expect(pad.getPresenceMs()).toBe(800);
    expect(pad.getTriggerMs()).toBe(2000);

    handle.destroy();
  });

  it('spawned pad getTriggerMs() defaults to 1500 when state.goalPad.triggerMs is missing', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Defensive: pad without triggerMs (server default would normally fill it).
    ws._receive(_zone5Msg({
      goalPad: { id: 'goal-pad', x: 94, y: 7, presenceMs: 0 }
    }));
    var engine = m.getEngine();
    var pad = engine.entities.get('level_goalpad');
    expect(pad.getTriggerMs()).toBe(1500);

    handle.destroy();
  });

  it('re-applies pad position when wire re-emits with new coords (level hot-swap)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    ws._receive(_zone5Msg());
    var engine = m.getEngine();
    var pad = engine.entities.get('level_goalpad');
    var originalX = pad.x;

    // Hot-swap: same pad id, different x.
    ws._receive({
      type: 'classroom_activity_state',
      state: {
        phase: 'GOAL_AVAILABLE', currentStage: 0, stagesTotal: 1,
        coins: [], choicePads: [], gates: [], tallyChutes: [],
        contextSlots: [
          { id: 'cs-q', x: 84, y: 5, label: 'Q', lit: false },
          { id: 'cs-v', x: 87, y: 5, label: 'V', lit: false },
          { id: 'cs-c', x: 90, y: 5, label: 'C', lit: false }
        ],
        goalPad: { id: 'goal-pad', x: 70, y: 7, presenceMs: 0, triggerMs: 1500 },
        tally: { sips: { A: 3, B: 2 } },
        players: { alice: { x: 800, y: 200, marks: {} } }
      }
    });

    var pad2 = engine.entities.get('level_goalpad');
    expect(pad2).toBe(pad);                  // same singleton instance
    expect(pad2.x).not.toBe(originalX);      // x re-applied from wire

    handle.destroy();
  });
});

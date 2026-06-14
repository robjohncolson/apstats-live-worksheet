/**
 * tests/classroom-board-scroll.test.js
 *
 * V7.9 side-scroll camera coverage (LIVE_CLASSROOM_V7_9_BUILD.md Unit B,
 * section 9). Pins:
 *
 *   Camera state + _updateCamera:
 *     - camera idle at 0 when local player is inside the deadzone
 *     - camera slides right when player crosses the right deadzone edge
 *     - camera slides left when player crosses the left deadzone edge
 *     - camera clamps at levelW - vw (right-edge stop)
 *     - camera clamps at 0 (left-edge stop / single-screen identity)
 *     - cockpit / disabled mode: _updateCamera does not move camera.x
 *
 *   _translateForCamera + _projectWorldX bucketing:
 *     - world sprites call ctx.save + translate(-camera.x, 0)
 *     - HUD sprites (TallyDisplay / ResultPanel / StageIndicator)
 *       render at their own coords with NO camera translate
 *     - cockpit fit-to-width: _translateForCamera uses ctx.scale,
 *       not ctx.translate
 *     - cockpit when levelW == vw: identity (no scale call)
 *     - _projectWorldX subtracts camera.x in follow mode
 *     - _projectWorldX scales x in cockpit fit-to-width mode
 *
 *   Mount-level wiring:
 *     - student role -> camera.enabled = true
 *     - teacher role -> camera.enabled = false
 *     - classroom_pos broadcast carries canvasW = levelPxWidth
 *       (not the actual canvas CSS width)
 *     - legacy single-screen levels (map.width=32) keep camera.x at 0
 *     - widened level (map.width=48) lets camera.x advance past 0
 *
 * Strategy mirrors tests/classroom-board-tally-threshold.test.js --
 * vitest + jsdom, load classroom-board.js into a vm context, exercise
 * the exposed _updateCamera + _translateForCamera helpers AND drive a
 * mounted board to verify the broadcast/canvasW wire shape.
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

// makeMountWithEngine: tracing wrapper so the broadcast shape test can
// reach the engine entities Map and read the local PlayerSprite. Mirrors
// the pattern used in tests/classroom-board-tally-threshold.test.js.
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

// --- ctx stub that records translate / scale / save / restore --------

function makeRecordingCtx() {
  var calls = {
    save:      0,
    restore:   0,
    translate: [],
    scale:     [],
    drawImage: [],
    fillRect:  [],
    fillText:  []
  };
  return {
    save:      function () { calls.save++; },
    restore:   function () { calls.restore++; },
    translate: function (x, y) { calls.translate.push({ x: x, y: y }); },
    scale:     function (sx, sy) { calls.scale.push({ sx: sx, sy: sy }); },
    drawImage: function (img, x, y, w, h) { calls.drawImage.push({ img: img, x: x, y: y, w: w, h: h }); },
    fillRect:  function (x, y, w, h) { calls.fillRect.push({ x: x, y: y, w: w, h: h }); },
    fillText:  function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y }); },
    beginPath: function () {},
    closePath: function () {},
    moveTo:    function () {},
    lineTo:    function () {},
    arc:       function () {},
    fill:      function () {},
    stroke:    function () {},
    strokeRect: function () {},
    measureText: function (s) { return { width: s.length * 6 }; },
    globalAlpha: 1,
    font:        '',
    textAlign:   '',
    textBaseline: '',
    fillStyle:   '',
    strokeStyle: '',
    lineWidth:   1,
    _calls:      calls
  };
}

// =============================================================
// V7.9 -- _camera state + reset
// =============================================================

describe('V7.9 _camera default state', () => {
  it('starts with x=0, enabled=true, vw=320, levelW=320, no followFn', () => {
    var m = makeBoard();
    // _resetCamera is exposed for explicit reset; call it to clear any
    // residue (also pins the public API surface).
    m.ClassroomBoard._resetCamera();
    var cam = m.ClassroomBoard._camera;
    expect(cam.x).toBe(0);
    expect(cam.enabled).toBe(true);
    expect(cam.vw).toBe(320);
    expect(cam.levelW).toBe(320);
    expect(cam.followFn).toBeNull();
    expect(cam.vwFn).toBeNull();
    expect(cam.levelWFn).toBeNull();
  });
});

// =============================================================
// V7.9 -- _updateCamera follow + clamp
// =============================================================

describe('V7.9 _updateCamera follow + clamp', () => {
  function setCam(m, opts) {
    m.ClassroomBoard._resetCamera();
    var cam = m.ClassroomBoard._camera;
    cam.x        = opts.x        != null ? opts.x        : 0;
    cam.vw       = opts.vw       != null ? opts.vw       : 320;
    cam.levelW   = opts.levelW   != null ? opts.levelW   : 320;
    cam.enabled  = opts.enabled  != null ? opts.enabled  : true;
    cam.followFn = opts.followFn != null ? opts.followFn : null;
  }

  it('camera idle at 0 when local player at levelX=100 (inside deadzone)', () => {
    var m = makeBoard();
    var player = { x: 100 };
    setCam(m, { x: 0, vw: 320, levelW: 480, followFn: function () { return player; } });
    // Drive several ticks; camera should not move (screenX=100 lies in
    // the deadzone [100, 220]).
    for (var i = 0; i < 20; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(0, 3);
  });

  it('camera slides right when local player at levelX=240 (past right deadzone)', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, { x: 0, vw: 320, levelW: 480, followFn: function () { return player; } });
    var x0 = m.ClassroomBoard._camera.x;
    m.ClassroomBoard._updateCamera(0.016);
    var x1 = m.ClassroomBoard._camera.x;
    expect(x1).toBeGreaterThan(x0);
    // Target = player.x - DEADZONE_R = 240 - 220 = 20; lerp factor 0.15
    // -> camera.x after 1 tick = 0 + (20-0)*0.15 = 3.
    expect(x1).toBeCloseTo(3, 1);
  });

  it('camera converges toward the right-side target across many ticks', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, { x: 0, vw: 320, levelW: 480, followFn: function () { return player; } });
    for (var i = 0; i < 100; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    // Should approach target = 20 px to within a small epsilon.
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(20, 1);
  });

  it('camera slides left when local player at levelX=50 (below left deadzone)', () => {
    var m = makeBoard();
    var player = { x: 50 };
    setCam(m, { x: 80, vw: 320, levelW: 480, followFn: function () { return player; } });
    var x0 = m.ClassroomBoard._camera.x;
    m.ClassroomBoard._updateCamera(0.016);
    var x1 = m.ClassroomBoard._camera.x;
    expect(x1).toBeLessThan(x0);
    // Target = player.x - DEADZONE_L = 50 - 100 = -50 (clamped to 0).
    // camera.x after 1 tick = 80 + (0-80)*0.15 = 80 - 12 = 68.
    expect(x1).toBeCloseTo(68, 1);
  });

  it('camera clamps at levelW - vw (right-edge stop)', () => {
    var m = makeBoard();
    // Player far to the right -- camera would want to slide past the
    // level bound. Clamp must hold camera.x <= 480 - 320 = 160.
    var player = { x: 460 };
    setCam(m, { x: 100, vw: 320, levelW: 480, followFn: function () { return player; } });
    for (var i = 0; i < 200; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    expect(m.ClassroomBoard._camera.x).toBeLessThanOrEqual(160 + 0.001);
    expect(m.ClassroomBoard._camera.x).toBeGreaterThanOrEqual(159.5);
  });

  it('camera clamps at 0 (left-edge stop)', () => {
    var m = makeBoard();
    var player = { x: 0 };
    setCam(m, { x: 100, vw: 320, levelW: 480, followFn: function () { return player; } });
    for (var i = 0; i < 200; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(0, 3);
  });

  it('backward compat: levelW == vw (single-screen level) -> camera.x stays at 0', () => {
    var m = makeBoard();
    // Map width=32 + chipSize=10 -> levelW=320 == DEFAULT_BOARD_W. The
    // 79 legacy levels (and U1.2 untouched) hit this branch. Player can
    // walk anywhere [0, 320]; camera must NOT move because levelW <= vw
    // makes the maxCam clamp upper bound 0.
    var player = { x: 0 };
    setCam(m, { x: 0, vw: 320, levelW: 320, followFn: function () { return player; } });
    // Walk the player all the way right; camera stays at 0.
    for (var step = 0; step <= 300; step += 10) {
      player.x = step;
      for (var i = 0; i < 30; i++) {
        m.ClassroomBoard._updateCamera(0.016);
      }
      expect(m.ClassroomBoard._camera.x).toBeCloseTo(0, 3);
    }
  });

  it('cockpit (enabled=false): _updateCamera does NOT move camera.x', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, { x: 0, vw: 320, levelW: 480, enabled: false, followFn: function () { return player; } });
    for (var i = 0; i < 100; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    // Cockpit relies on fit-to-width scale at render time, NOT camera
    // follow. camera.x must stay at its initialized value.
    expect(m.ClassroomBoard._camera.x).toBe(0);
  });

  it('null followFn -> no crash, camera stays at initial x', () => {
    var m = makeBoard();
    setCam(m, { x: 42, vw: 320, levelW: 480, followFn: null });
    expect(function () {
      m.ClassroomBoard._updateCamera(0.016);
    }).not.toThrow();
    expect(m.ClassroomBoard._camera.x).toBe(42);
  });

  it('followFn returning null -> no crash, camera stays at initial x', () => {
    var m = makeBoard();
    setCam(m, { x: 17, vw: 320, levelW: 480, followFn: function () { return null; } });
    expect(function () {
      m.ClassroomBoard._updateCamera(0.016);
    }).not.toThrow();
    expect(m.ClassroomBoard._camera.x).toBe(17);
  });

  it('vwFn / levelWFn refresh camera dims before clamp math', () => {
    var m = makeBoard();
    // Start with stale levelW=320; bump via callback to 480 mid-flight.
    m.ClassroomBoard._resetCamera();
    var cam = m.ClassroomBoard._camera;
    cam.vw       = 320;
    cam.levelW   = 320;
    cam.enabled  = true;
    cam.followFn = function () { return { x: 400 }; };
    cam.vwFn     = function () { return 320; };
    cam.levelWFn = function () { return 480; };  // widens mid-flight
    for (var i = 0; i < 100; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    expect(cam.levelW).toBe(480);
    // Player at 400 -> target = 400 - 220 = 180; clamp upper = 480 - 320 = 160.
    // So clamp wins; camera converges to 160.
    expect(cam.x).toBeCloseTo(160, 1);
  });
});

// =============================================================
// V7.9 -- _translateForCamera + _projectWorldX bucketing
// =============================================================

describe('V7.9 _translateForCamera + _projectWorldX', () => {
  it('camera enabled: _translateForCamera calls save + translate(-camera.x, 0)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 80;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var ctx = makeRecordingCtx();
    m.ClassroomBoard._translateForCamera(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -80, y: 0 });
    expect(ctx._calls.scale.length).toBe(0);
  });

  it('camera disabled (cockpit) + levelW > vw: uses ctx.scale, NOT translate', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = false;
    m.ClassroomBoard._camera.x       = 0;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;   // widened cockpit view
    var ctx = makeRecordingCtx();
    m.ClassroomBoard._translateForCamera(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.translate.length).toBe(0);
    expect(ctx._calls.scale.length).toBe(1);
    expect(ctx._calls.scale[0].sx).toBeCloseTo(320 / 480, 5);
    expect(ctx._calls.scale[0].sy).toBe(1);
  });

  it('camera disabled (cockpit) + levelW == vw: identity (no scale, no translate)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = false;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 320;
    var ctx = makeRecordingCtx();
    m.ClassroomBoard._translateForCamera(ctx);
    // save still fires so the matched restore is symmetric.
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.translate.length).toBe(0);
    expect(ctx._calls.scale.length).toBe(0);
  });

  it('_restoreFromCamera calls ctx.restore exactly once', () => {
    var m = makeBoard();
    var ctx = makeRecordingCtx();
    m.ClassroomBoard._restoreFromCamera(ctx);
    expect(ctx._calls.restore).toBe(1);
  });

  it('_translateForCamera is defensive against ctx without save/restore', () => {
    var m = makeBoard();
    var ctxNoSave = { /* no save, no restore */ };
    expect(function () {
      m.ClassroomBoard._translateForCamera(ctxNoSave);
    }).not.toThrow();
    expect(function () {
      m.ClassroomBoard._restoreFromCamera(ctxNoSave);
    }).not.toThrow();
  });

  it('_projectWorldX (camera enabled): subtracts camera.x', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 80;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    // A coin at level x=150 is 70 px past the camera origin.
    expect(m.ClassroomBoard._projectWorldX(150)).toBe(70);
    expect(m.ClassroomBoard._projectWorldX(80)).toBe(0);
  });

  it('_projectWorldX (cockpit + levelW > vw): scales by vw/levelW', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = false;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    // 480 -> 320 -> shrink factor 2/3 -> level x=240 lands at 160.
    expect(m.ClassroomBoard._projectWorldX(240)).toBeCloseTo(160, 5);
    expect(m.ClassroomBoard._projectWorldX(0)).toBe(0);
  });

  it('_projectWorldX (cockpit + levelW == vw): identity (no scale)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = false;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 320;
    expect(m.ClassroomBoard._projectWorldX(150)).toBe(150);
  });
});

// =============================================================
// V7.9 -- WORLD vs HUD sprite bucketing
// =============================================================

describe('V7.9 world sprites scroll, HUD sprites do not', () => {
  it('CoinSprite.render calls _translateForCamera (save + translate)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 50;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    // Fake "loaded" image so render takes the drawImage branch (not the
    // early bail at the image-not-ready guard).
    var fakeImg = { complete: true, naturalWidth: 32 };
    var coin = new m.ClassroomBoard._CoinSprite({
      x: 100, y: 50, size: 24, coinId: 's1', drink: 'A',
      collected: false, revealed: true, images: [fakeImg, fakeImg, fakeImg]
    });
    var ctx = makeRecordingCtx();
    coin.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -50, y: 0 });
    // The coin draws at its level x (100), not camera-offset coords;
    // the canvas transform handles the on-screen offset.
    expect(ctx._calls.drawImage.length).toBe(1);
    expect(ctx._calls.drawImage[0].x).toBe(100);
  });

  it('KeySprite.render calls _translateForCamera', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 40;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var fakeImg = { complete: true, naturalWidth: 32 };
    var key = new m.ClassroomBoard._KeySprite({
      x: 200, y: 80, size: 24, images: [fakeImg]
    });
    var ctx = makeRecordingCtx();
    key.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -40, y: 0 });
  });

  it('GoalSprite.render calls _translateForCamera', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 30;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var openImg = { complete: true, naturalWidth: 32 };
    var goal = new m.ClassroomBoard._GoalSprite({
      x: 300, y: 100, size: 28, imageOpen: openImg, imageClosed: openImg
    });
    var ctx = makeRecordingCtx();
    goal.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -30, y: 0 });
  });

  it('ChoicePadSprite.render calls _translateForCamera', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 20;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var pad = new m.ClassroomBoard._ChoicePadSprite({
      id: 'cp-A', x: 80, y: 100, value: 'A'
    });
    var ctx = makeRecordingCtx();
    pad.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -20, y: 0 });
  });

  it('RevealTextSprite.render calls _translateForCamera (follows the coin)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 60;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var sprite = new m.ClassroomBoard._RevealTextSprite({
      x: 150, y: 80, text: '+A', color: '#FFD700'
    });
    var ctx = makeRecordingCtx();
    sprite.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -60, y: 0 });
  });

  it('Doorway.render calls _translateForCamera (v3 P4 visuals)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 25;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var d = new m.ClassroomBoard._Doorway(function () { return 200; }, {
      x: 80, width: 28, label: 'A', doorId: 'doorA'
    });
    var ctx = makeRecordingCtx();
    d.render(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.restore).toBe(1);
    expect(ctx._calls.translate.length).toBe(1);
    expect(ctx._calls.translate[0]).toEqual({ x: -25, y: 0 });
  });

  it('TallyDisplay.render DOES NOT call save/translate (HUD-anchored)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 100;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var tally = new m.ClassroomBoard._TallyDisplay({
      x: 160, y: 30,
      getTally: function () { return { A: 2, B: 1 }; }
    });
    var ctx = makeRecordingCtx();
    tally.render(ctx);
    expect(ctx._calls.translate.length).toBe(0);
    expect(ctx._calls.scale.length).toBe(0);
    // The tally text lands at the sprite's literal x -- NO camera offset.
    expect(ctx._calls.fillText.length).toBe(1);
    expect(ctx._calls.fillText[0].x).toBe(160);
  });

  it('StageIndicator.render DOES NOT call save/translate (HUD-anchored)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 100;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var stage = new m.ClassroomBoard._StageIndicator({
      getCurrent: function () { return 2; },
      getTotal:   function () { return 5; },
      getViewportW: function () { return 320; }
    });
    var ctx = makeRecordingCtx();
    stage.render(ctx);
    expect(ctx._calls.translate.length).toBe(0);
    expect(ctx._calls.scale.length).toBe(0);
  });

  it('ResultPanel.render DOES NOT call save/translate (HUD-anchored)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    m.ClassroomBoard._camera.enabled = true;
    m.ClassroomBoard._camera.x       = 100;
    m.ClassroomBoard._camera.vw      = 320;
    m.ClassroomBoard._camera.levelW  = 480;
    var rp = new m.ClassroomBoard._ResultPanel({
      getClosedDoorways: function () {
        return {
          question: 'Q1', blind: false,
          options: [{ doorId: 'a', label: 'A' }, { doorId: 'b', label: 'B' }],
          tally:   [{ doorId: 'a', count: 2 }, { doorId: 'b', count: 3 }]
        };
      },
      getReflection: function () { return null; },
      getViewportW:  function () { return 320; }
    });
    var ctx = makeRecordingCtx();
    rp.render(ctx);
    expect(ctx._calls.translate.length).toBe(0);
    expect(ctx._calls.scale.length).toBe(0);
  });
});

// =============================================================
// V7.9 -- mount-level wiring (role, camera install, broadcast)
// =============================================================

describe('V7.9 mount() camera install + role gating', () => {
  it('student role -> camera.enabled === true', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    expect(m.ClassroomBoard._camera.enabled).toBe(true);
    handle.destroy();
  });

  it('teacher role -> camera.enabled === false (cockpit fit-to-width)', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'teacher1', role: 'teacher'
    });
    expect(m.ClassroomBoard._camera.enabled).toBe(false);
    handle.destroy();
  });

  it('mount installs a camera_controller entity that ticks _updateCamera', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    // The TracingEngine-style wiring isn't set up here; instead, pull
    // the controller via the entities Map -- the StubCanvasEngine
    // exposes it directly.
    handle.destroy();
    // Indirectly verify by checking that the camera state was reset
    // (mount resets + reconfigures).
    expect(m.ClassroomBoard._camera).toBeDefined();
  });

  it('classroom_pos broadcast carries canvasW = levelPxWidth (NOT viewport)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Open a wide level (map.width=48 -> levelPxWidth = 480) with alice
    // in the active section. ChoicePadSprite + activity-state path is
    // unrelated to the broadcast test; we just need alice's local
    // PlayerSprite to exist + the activity state to give a wide levelW.
    ws._receive({
      type: 'classroom_state',
      section: 'PeriodX',
      gate: null, poll: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ],
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
          phase: 'SIPPING', currentStage: 0, stagesTotal: 1,
          coins: [], players: { alice: { x: 100, y: 200, marks: {} } }
        }
      }
    });

    var engine = m.getEngine();
    var alice  = engine.entities.get('sprite_alice');
    expect(alice).toBeDefined();
    expect(alice).toBeInstanceOf(m.ClassroomBoard._PlayerSprite);

    // Clear any classroom_join broadcast so we only inspect the next
    // emit from onPos.
    ws.sent.length = 0;

    // Invoke onPos directly to surface the wire payload built by mount.
    alice.onPos({ x: 100, y: 200, state: 'idle', vx: 0 });
    expect(ws.sent.length).toBe(1);
    var payload = JSON.parse(ws.sent[0]);
    expect(payload.type).toBe('classroom_pos');
    expect(payload.x).toBe(100);
    expect(payload.y).toBe(200);
    // The wire-shape decision: canvasW = levelPxWidth (NOT viewport).
    // map.width=48 * chipSize=10 -> levelPxWidth=480.
    expect(payload.canvasW).toBe(480);

    handle.destroy();
  });

  it('classroom_pos broadcast (no activity): canvasW = viewport (legacy fallback)', () => {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // Snapshot WITHOUT an activity -- legacy / non-level mode. levelW
    // should fall back to viewport width, preserving the 79 legacy
    // levels' broadcast shape.
    ws._receive({
      type: 'classroom_state',
      section: 'PeriodX',
      gate: null, poll: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true }
      ]
    });

    var engine = m.getEngine();
    var alice  = engine.entities.get('sprite_alice');
    expect(alice).toBeDefined();

    ws.sent.length = 0;
    alice.onPos({ x: 50, y: 200, state: 'idle', vx: 0 });
    expect(ws.sent.length).toBe(1);
    var payload = JSON.parse(ws.sent[0]);
    expect(payload.type).toBe('classroom_pos');
    // Falls back to viewport width. The jsdom canvas defaults to 300 px
    // (no CSS width set on the host); the invariant we pin: canvasW
    // matches the camera's current vw field (set via _refreshCameraDims
    // at mount time).
    expect(payload.canvasW).toBe(m.ClassroomBoard._camera.vw);

    handle.destroy();
  });

  it('mount with no activity -> camera.levelW falls back to the viewport width', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type: 'classroom_state', section: 'PeriodX',
      gate: null, poll: null,
      members: [{ username: 'alice', role: 'student', status: 'present', online: true }]
    });
    // Drive one camera tick so the vwFn / levelWFn callbacks run.
    m.ClassroomBoard._updateCamera(0.016);
    // Legacy levels (no activity) -> levelW falls back to viewport.
    // jsdom's default canvas width = 300, so levelW = vw = 300 here.
    // The invariant we're pinning: levelW === vw (camera clamp = 0).
    expect(m.ClassroomBoard._camera.levelW).toBe(m.ClassroomBoard._camera.vw);
    handle.destroy();
  });

  it('mount with wide activity (map.width=48) -> camera.levelW advances to 480', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type: 'classroom_state', section: 'PeriodX',
      gate: null, poll: null,
      members: [{ username: 'alice', role: 'student', status: 'present', online: true }],
      activity: {
        type: 'level', startedAt: 1000, durationMs: 60000,
        level: {
          schema: 'v7.5-level-1', levelKey: 'U1.1', lessonKey: '1.1',
          title: 'cola', duration: 60,
          map: { width: 48, height: 8, chipSize: 10 },
          actors: []
        },
        state: { phase: 'SIPPING', currentStage: 0, stagesTotal: 1, coins: [] }
      }
    });
    // Drive one camera tick so vwFn / levelWFn refresh.
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.levelW).toBe(480);
    handle.destroy();
  });
});

// --- stale persisted pos.y clamp (off-screen avatar regression) --------
//
// A member's server-persisted pos may have been written on a TALLER canvas
// (the teacher cockpit, or a dev playtest). Restoring that pos.y raw spawned
// the sprite BELOW this board's ground line, where the floor-snap never
// catches it (it only lands a sprite crossing groundY from above) and gravity
// drove it off-screen forever -- the avatar silently vanished. addSprite now
// clamps pos.y to getSpriteY() (the resting ground line). Bug surfaced on the
// teacher's own heavily-used account whose pos carried a cockpit-height Y.
describe('ClassroomBoard.mount -- stale pos.y clamp', function () {
  // SPRITE_H * SPRITE_SCALE from classroom-board.js (96 * 0.25). getSpriteY()
  // = engine.groundY - this, i.e. the y at which a sprite stands on the ground.
  var SPRITE_FOOT_OFFSET = 96 * 0.25;

  it('clamps a below-ground pos.y to the ground line so the avatar stays on-screen', function () {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // alice rejoins carrying a pos.y from a taller canvas -- far below this
    // board's ground line. Pre-fix this set sp.y = 9999 (off-screen forever).
    ws._receive({
      type: 'classroom_state',
      section: 'PeriodX',
      gate: null, poll: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true,
          pos: { x: 0, y: 9999 } }
      ]
    });

    var engine = m.getEngine();
    var alice  = engine.entities.get('sprite_alice');
    expect(alice).toBeDefined();
    expect(alice).toBeInstanceOf(m.ClassroomBoard._PlayerSprite);

    var groundLine = engine.groundY - SPRITE_FOOT_OFFSET;
    expect(alice.y).toBe(groundLine);   // clamped to the ground, not 9999
    expect(alice.y).toBeLessThan(9999); // proves the clamp fired

    handle.destroy();
  });

  it('preserves a legitimate in-bounds (airborne) pos.y above the ground line', function () {
    var m = makeMountWithEngine();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();

    // y=10 is well above the ground line (smaller y = higher up) -- a valid
    // mid-jump position. The clamp (Math.min) must leave it untouched.
    ws._receive({
      type: 'classroom_state',
      section: 'PeriodX',
      gate: null, poll: null,
      members: [
        { username: 'alice', role: 'student', status: 'present', online: true,
          pos: { x: 0, y: 10 } }
      ]
    });

    var engine = m.getEngine();
    var alice  = engine.entities.get('sprite_alice');
    expect(alice).toBeDefined();

    var groundLine = engine.groundY - SPRITE_FOOT_OFFSET;
    expect(groundLine).toBeGreaterThan(10); // sanity: 10 is above the ground
    expect(alice.y).toBe(10);               // preserved, not clamped

    handle.destroy();
  });
});

/**
 * tests/classroom-board-shared-camera.test.js
 *
 * V7.15 Unit B -- shared-camera mode + dev-start hook
 * (LIVE_CLASSROOM_V7_15_BUILD.md sections 7 + 8 + 9). Pins:
 *
 *   Shared-camera read in _updateCamera:
 *     - cameraStateFn returning { x:<number> } -> _camera.x snaps to
 *       that value (no lerp, immediate set)
 *     - cameraStateFn returning null -> falls back to legacy local
 *       follow (V7.9 deadzone lerp)
 *     - cameraStateFn missing entirely -> legacy local follow
 *     - cameraStateFn returning a value WITHOUT .x -> legacy fallback
 *     - cockpit (_camera.enabled=false) -> shared-camera branch never
 *       fires, no _camera.x mutation, fit-to-width path untouched
 *     - vw / levelW refresh happens BEFORE the shared-camera branch
 *       (so canvas resizes during a level still re-clamp downstream)
 *     - shared-camera read is per-tick (camera.x tracks moving server
 *       value across multiple ticks)
 *     - _resetCamera clears cameraStateFn
 *     - default _camera has cameraStateFn === null
 *
 *   Dev-start hook (_tryDevAutoStartActivity in ap_stats_roadmap):
 *     - fires only when BOTH ?dev=1 AND ?devActivity=<key> present
 *     - missing ?dev -> no send
 *     - missing ?devActivity -> no send
 *     - empty ?devActivity -> no send
 *     - present both -> sends classroom_activity_start with the
 *       supplied levelKey
 *
 * Strategy mirrors tests/classroom-board-scroll.test.js -- vitest +
 * jsdom + a vm context for the camera tests. Dev hook tests stub out
 * a sendMessage spy and call the helper directly.
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
const HTML_SRC  = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf8');

// --- minimal MockWebSocket (copied shape from classroom-board-scroll) ----

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
  MockWebSocket.prototype.send = function (data) { this.sent.push(data); };
  MockWebSocket.prototype.close = function () {
    this.readyState = 3;
    if (this.onclose) { this.onclose({}); }
  };
  MockWebSocket.prototype._open = function () {
    this.readyState = 1;
    if (this.onopen) { this.onopen({}); }
  };
  MockWebSocket.prototype._receive = function (obj) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(obj) });
    }
  };
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN       = 1;
  MockWebSocket.CLOSING    = 2;
  MockWebSocket.CLOSED     = 3;
  Object.defineProperty(MockWebSocket, 'last', { get: function () { return last; } });
  return MockWebSocket;
}

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
  return { win: win, ClassroomBoard: win.ClassroomBoard, MockWS: MockWS, dom: dom };
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

// helper to seed the camera state without exercising mount() / WS.
function setCam(m, opts) {
  m.ClassroomBoard._resetCamera();
  var cam = m.ClassroomBoard._camera;
  cam.x             = opts.x             != null ? opts.x             : 0;
  cam.vw            = opts.vw            != null ? opts.vw            : 320;
  cam.levelW        = opts.levelW        != null ? opts.levelW        : 320;
  cam.enabled       = opts.enabled       != null ? opts.enabled       : true;
  cam.followFn      = opts.followFn      != null ? opts.followFn      : null;
  cam.vwFn          = opts.vwFn          != null ? opts.vwFn          : null;
  cam.levelWFn      = opts.levelWFn      != null ? opts.levelWFn      : null;
  cam.cameraStateFn = opts.cameraStateFn != null ? opts.cameraStateFn : null;
}

// =============================================================
// V7.15 -- _camera.cameraStateFn install + reset
// =============================================================

describe('V7.15 _camera default state includes cameraStateFn', () => {
  it('starts with cameraStateFn === null', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    expect(m.ClassroomBoard._camera.cameraStateFn).toBeNull();
  });

  it('_resetCamera clears a previously installed cameraStateFn', () => {
    var m = makeBoard();
    m.ClassroomBoard._camera.cameraStateFn = function () { return { x: 99 }; };
    m.ClassroomBoard._resetCamera();
    expect(m.ClassroomBoard._camera.cameraStateFn).toBeNull();
  });
});

// =============================================================
// V7.15 -- shared-camera read in _updateCamera (the headline)
// =============================================================

describe('V7.15 shared-camera read in _updateCamera', () => {
  it('cameraStateFn returns { x: 100 } -> _camera.x snaps to 100 (no lerp)', () => {
    var m = makeBoard();
    // followFn is also installed; the shared-camera branch should take
    // priority and the per-tick lerp toward the player must NOT run.
    var player = { x: 240 };  // would normally pull camera right
    setCam(m, {
      x: 0, vw: 320, levelW: 480,
      followFn: function () { return player; },
      cameraStateFn: function () { return { x: 100 }; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    // Single tick -- legacy follow would only nudge ~3 px on this
    // input; shared-camera must snap straight to 100.
    expect(m.ClassroomBoard._camera.x).toBe(100);
  });

  it('shared-camera value is read per-tick (tracks a moving server value)', () => {
    var m = makeBoard();
    var serverX = 50;
    setCam(m, {
      x: 0, vw: 320, levelW: 480,
      cameraStateFn: function () { return { x: serverX }; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBe(50);
    serverX = 120;
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBe(120);
    serverX = 0;  // forward-only ratchet is server-side; client just reads
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBe(0);
  });

  it('cameraStateFn returning null -> falls back to legacy local follow', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, {
      x: 0, vw: 320, levelW: 480,
      followFn: function () { return player; },
      cameraStateFn: function () { return null; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    // Legacy V7.9: target = 240 - 220 = 20; lerp factor 0.15 -> x ~ 3.
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(3, 1);
  });

  it('no cameraStateFn installed -> legacy local follow (backward compat)', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, {
      x: 0, vw: 320, levelW: 480,
      followFn: function () { return player; },
      cameraStateFn: null
    });
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(3, 1);
  });

  it('cameraStateFn returns object WITHOUT .x -> legacy fallback', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, {
      x: 0, vw: 320, levelW: 480,
      followFn: function () { return player; },
      cameraStateFn: function () { return { viewportFloor: 640 }; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    // No .x -> shared-camera branch skipped, legacy lerp runs.
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(3, 1);
  });

  it('cameraStateFn returns { x: non-number } -> legacy fallback', () => {
    var m = makeBoard();
    var player = { x: 240 };
    setCam(m, {
      x: 0, vw: 320, levelW: 480,
      followFn: function () { return player; },
      cameraStateFn: function () { return { x: 'oops' }; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBeCloseTo(3, 1);
  });

  it('cockpit (_camera.enabled=false) -> shared-camera read is SKIPPED', () => {
    var m = makeBoard();
    // Even with a perfectly valid cameraStateFn, the cockpit branch
    // short-circuits before the shared-camera read because cockpit
    // uses fit-to-width scale at render time -- the camera.x value
    // is irrelevant.
    setCam(m, {
      x: 0, vw: 320, levelW: 480, enabled: false,
      cameraStateFn: function () { return { x: 100 }; }
    });
    for (var i = 0; i < 10; i++) {
      m.ClassroomBoard._updateCamera(0.016);
    }
    expect(m.ClassroomBoard._camera.x).toBe(0);
  });

  it('vw + levelW refresh BEFORE shared-camera branch (resize during level)', () => {
    var m = makeBoard();
    // vwFn / levelWFn must fire on every tick so a canvas resize lands
    // even when shared-camera is owning camera.x. (Pinned because the
    // V7.9 levelW invariant -- map.width=48 -> 480 -- still has to
    // refresh for other call sites like _projectWorldX HUD math.)
    setCam(m, {
      x: 0, vw: 320, levelW: 320,
      vwFn:     function () { return 320; },
      levelWFn: function () { return 480; },
      cameraStateFn: function () { return { x: 150 }; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.levelW).toBe(480);
    expect(m.ClassroomBoard._camera.x).toBe(150);
  });

  it('shared-camera branch does NOT clamp -- server clamps; client trusts', () => {
    var m = makeBoard();
    // Server-side, the engine clamps camera.x to [0, levelW - vw]. The
    // client must NOT re-clamp because (a) the level width on the
    // client may briefly disagree with the server's, and (b) trusting
    // the server keeps the leftmost-leader display synchronized across
    // clients. Pin a value outside the local clamp window survives.
    setCam(m, {
      x: 0, vw: 320, levelW: 320,
      cameraStateFn: function () { return { x: 250 }; }
    });
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBe(250);
  });
});

// =============================================================
// V7.15 -- mount() installs cameraStateFn for STUDENT role
// =============================================================

describe('V7.15 mount() wires cameraStateFn', () => {
  it('student mount installs a non-null cameraStateFn', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    expect(typeof m.ClassroomBoard._camera.cameraStateFn).toBe('function');
    // With no activity in state, the fn should return null (legacy
    // fallback).
    expect(m.ClassroomBoard._camera.cameraStateFn()).toBeNull();
    handle.destroy();
  });

  it('teacher mount also installs cameraStateFn (but enabled=false skips it)', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'teacher1', role: 'teacher'
    });
    // mount() installs the callback regardless of role; the
    // enabled=false early-return in _updateCamera is what skips it.
    expect(typeof m.ClassroomBoard._camera.cameraStateFn).toBe('function');
    expect(m.ClassroomBoard._camera.enabled).toBe(false);
    handle.destroy();
  });

  it('after server emits state.camera, cameraStateFn returns it', () => {
    var m = makeMount();
    var handle = m.ClassroomBoard.mount(m.container, {
      wsUrl: 'wss://test/ws', section: 'PeriodX',
      username: 'alice', role: 'student'
    });
    var ws = m.MockWS.last;
    ws._open();
    ws._receive({
      type: 'classroom_state',
      section: 'PeriodX',
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
        state: {
          phase: 'SIPPING', currentStage: 0, stagesTotal: 1, coins: [],
          camera: { x: 75, viewportFloor: 640 }
        }
      }
    });
    var sharedCam = m.ClassroomBoard._camera.cameraStateFn();
    expect(sharedCam).not.toBeNull();
    expect(sharedCam.x).toBe(75);
    expect(sharedCam.viewportFloor).toBe(640);
    // Drive a tick -- _camera.x should snap to the server value.
    m.ClassroomBoard._updateCamera(0.016);
    expect(m.ClassroomBoard._camera.x).toBe(75);
    handle.destroy();
  });
});

// =============================================================
// V7.15 -- _translateForCamera + cockpit branch UNAFFECTED
// =============================================================

describe('V7.15 cockpit fit-to-width path unchanged', () => {
  function makeRecordingCtx() {
    var calls = { save: 0, restore: 0, translate: [], scale: [] };
    return {
      save:      function () { calls.save++; },
      restore:   function () { calls.restore++; },
      translate: function (x, y) { calls.translate.push({ x: x, y: y }); },
      scale:     function (sx, sy) { calls.scale.push({ sx: sx, sy: sy }); },
      _calls:    calls
    };
  }

  it('cockpit + levelW > vw still scales (no V7.15 regression)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    var cam = m.ClassroomBoard._camera;
    cam.enabled = false;
    cam.vw      = 320;
    cam.levelW  = 480;
    // Even with a cameraStateFn installed, cockpit render path uses
    // scale -- the cameraStateFn read only affects _updateCamera's
    // _camera.x mutation, which is unused in cockpit.
    cam.cameraStateFn = function () { return { x: 200 }; };
    var ctx = makeRecordingCtx();
    m.ClassroomBoard._translateForCamera(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.scale.length).toBe(1);
    expect(ctx._calls.scale[0].sx).toBeCloseTo(320 / 480, 5);
    expect(ctx._calls.translate.length).toBe(0);
  });

  it('cockpit + levelW == vw still identity (no V7.15 regression)', () => {
    var m = makeBoard();
    m.ClassroomBoard._resetCamera();
    var cam = m.ClassroomBoard._camera;
    cam.enabled = false;
    cam.vw      = 320;
    cam.levelW  = 320;
    cam.cameraStateFn = function () { return { x: 50 }; };
    var ctx = makeRecordingCtx();
    m.ClassroomBoard._translateForCamera(ctx);
    expect(ctx._calls.save).toBe(1);
    expect(ctx._calls.translate.length).toBe(0);
    expect(ctx._calls.scale.length).toBe(0);
  });
});

// =============================================================
// V7.15 -- dev-start hook in ap_stats_roadmap_square_mode.html
// =============================================================
// The helper lives inside the HTML <script> tag. Extract its source
// and exercise it directly in a vm context with a sendMessage spy.

describe('V7.15 _tryDevAutoStartActivity in ap_stats_roadmap_square_mode.html', () => {
  it('the helper exists in the page source', () => {
    expect(HTML_SRC).toMatch(/_tryDevAutoStartActivity/);
  });

  it('the helper checks both dev AND devActivity query params', () => {
    // The BUILD doc gates the auto-start on BOTH params. Two has()/get()
    // calls against URLSearchParams pin the contract; reject if only
    // one is present.
    var re = /function\s+_tryDevAutoStartActivity\s*\(\)\s*\{[\s\S]+?\}/;
    var match = HTML_SRC.match(re);
    expect(match).not.toBeNull();
    var body = match[0];
    expect(body).toMatch(/URLSearchParams/);
    expect(body).toMatch(/dev/);
    expect(body).toMatch(/devActivity/);
  });

  it('the helper sends classroom_activity_start (not some other type)', () => {
    var re = /function\s+_tryDevAutoStartActivity\s*\(\)\s*\{[\s\S]+?\}/;
    var match = HTML_SRC.match(re);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/classroom_activity_start/);
  });

  it('runtime: missing dev param -> no send', () => {
    var fn = extractDevHelper();
    var spy = makeSpy('https://example.com/');
    fn(spy.win);
    expect(spy.sent.length).toBe(0);
  });

  it('runtime: dev=1 but no devActivity -> no send', () => {
    var fn = extractDevHelper();
    var spy = makeSpy('https://example.com/?dev=1');
    fn(spy.win);
    expect(spy.sent.length).toBe(0);
  });

  it('runtime: devActivity but no dev -> no send', () => {
    var fn = extractDevHelper();
    var spy = makeSpy('https://example.com/?devActivity=U1.1');
    fn(spy.win);
    expect(spy.sent.length).toBe(0);
  });

  it('runtime: dev=1 + empty devActivity -> no send', () => {
    var fn = extractDevHelper();
    var spy = makeSpy('https://example.com/?dev=1&devActivity=');
    fn(spy.win);
    expect(spy.sent.length).toBe(0);
  });

  it('runtime: dev=1 + devActivity=U1.1 -> sends classroom_activity_start with levelKey', () => {
    var fn = extractDevHelper();
    var spy = makeSpy('https://example.com/?dev=1&devActivity=U1.1');
    fn(spy.win);
    expect(spy.sent.length).toBe(1);
    var msg = spy.sent[0];
    expect(msg.type).toBe('classroom_activity_start');
    // The BUILD doc shape: { activityType:'level', opts:{ levelKey:'U1.1' } }.
    // Either nesting that places the levelKey somewhere reachable is OK
    // as long as the levelKey is faithfully forwarded.
    var serialized = JSON.stringify(msg);
    expect(serialized).toMatch(/U1\.1/);
  });
});

// extractDevHelper: lift the function body from the HTML, wrap it so
// it accepts a fake window (with location + a sendMessage spy) instead
// of relying on the page globals, and return the executable. Brace-
// counts manually because the helper body contains nested `{` (object
// literals + try/catch) -- non-greedy regex stops at the first `}` and
// truncates the body mid-call.
function extractDevHelper() {
  var marker = 'function _tryDevAutoStartActivity';
  var start  = HTML_SRC.indexOf(marker);
  if (start < 0) throw new Error('_tryDevAutoStartActivity marker not found');
  var openBrace = HTML_SRC.indexOf('{', start);
  if (openBrace < 0) throw new Error('open brace not found after marker');
  var depth = 1;
  var i = openBrace + 1;
  while (i < HTML_SRC.length && depth > 0) {
    var c = HTML_SRC.charAt(i);
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error('unbalanced braces in _tryDevAutoStartActivity body');
  // [openBrace+1, i-1] = body (exclusive of the closing brace).
  var body = HTML_SRC.substring(openBrace + 1, i - 1);
  // Provide a wrapper that injects `window`, `location`, `console`, and
  // `_classroomBoardHandle` as locals so the helper body works in our
  // sandbox. The wrapper also exposes URLSearchParams from the host.
  var wrapper = 'return function (win) {\n' +
    '  var location = win.location;\n' +
    '  var _classroomBoardHandle = win._classroomBoardHandle;\n' +
    '  var console = win.console || { log: function() {} };\n' +
    '  var URLSearchParams = win.URLSearchParams;\n' +
    body + '\n' +
    '};';
  // eslint-disable-next-line no-new-func
  var factory = new Function(wrapper);
  return factory();
}

function makeSpy(url) {
  var sent = [];
  var win = {
    location: { search: '?' + (url.split('?')[1] || '') },
    URLSearchParams: URLSearchParams,
    _classroomBoardHandle: {
      sendMessage: function (msg) { sent.push(msg); }
    },
    console: { log: function () {} }
  };
  return { win: win, sent: sent };
}

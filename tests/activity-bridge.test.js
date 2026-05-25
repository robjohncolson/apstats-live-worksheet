/**
 * tests/activity-bridge.test.js
 *
 * Unit tests for activity-bridge.js (window.ActivityBridge.mount + handle).
 *
 * Strategy:
 *   - Build a jsdom window + document.
 *   - Inject a 2d-context stub (records every draw call into arrays) so
 *     we can assert what was drawn without a real canvas backend.
 *   - Run the bridge IIFE inside a vm context (mirrors ti84-plot.test.js).
 *
 * Coverage per LIVE_CLASSROOM_V4_BUILD.md C7 Unit D (bridge renderer):
 *   - mount returns handle { destroy, updateState, showOutcome }
 *   - updateState draws background + bridge fillRect
 *   - bridge height scales with currentMean (1 -> small, 10 -> tall)
 *   - green target band rendered with greenish fillStyle
 *   - showOutcome('success') renders some success indicator (text + fill)
 *   - destroy removes the canvas from the DOM
 *   - updateState does not throw on empty values
 *
 * ASCII-only.  LF line endings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BRIDGE_SRC = readFileSync(resolve(REPO_ROOT, 'activity-bridge.js'), 'utf8');

// --- 2d context stub --------------------------------------------------------

/**
 * Build a minimal 2D context stub that records every draw operation
 * AND the fillStyle/strokeStyle in effect at call time.  We snapshot
 * the style strings so assertions can detect which color was used.
 */
function makeCtxStub() {
  var stub = {
    fillStyle:    '#000',
    strokeStyle:  '#000',
    lineWidth:    1,
    font:         '12px sans-serif',
    textAlign:    'left',
    textBaseline: 'alphabetic',

    fillRects:   [],   // { x, y, w, h, fillStyle }
    strokeRects: [],   // { x, y, w, h, strokeStyle }
    arcs:        [],   // { x, y, r, fillStyle, strokeStyle }
    texts:       [],   // { text, x, y, fillStyle, font, textAlign, textBaseline }
    lines:       [],   // { type:'moveTo'|'lineTo', x, y }
    strokes:     0,
    begins:      0,
    fills:       0,
    closes:      0,
    scales:      [],

    fillRect: function (x, y, w, h) {
      this.fillRects.push({ x: x, y: y, w: w, h: h, fillStyle: this.fillStyle });
    },
    strokeRect: function (x, y, w, h) {
      this.strokeRects.push({ x: x, y: y, w: w, h: h, strokeStyle: this.strokeStyle });
    },
    fillText: function (text, x, y) {
      this.texts.push({
        text:         String(text),
        x:            x,
        y:            y,
        fillStyle:    this.fillStyle,
        font:         this.font,
        textAlign:    this.textAlign,
        textBaseline: this.textBaseline
      });
    },
    beginPath:  function () { this.begins++; },
    moveTo:     function (x, y) { this.lines.push({ type: 'moveTo', x: x, y: y }); },
    lineTo:     function (x, y) { this.lines.push({ type: 'lineTo', x: x, y: y }); },
    stroke:     function () { this.strokes++; },
    fill:       function () { this.fills++; },
    closePath:  function () { this.closes++; },
    arc: function (x, y, r) {
      this.arcs.push({ x: x, y: y, r: r, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle });
    },
    scale: function (sx, sy) { this.scales.push({ sx: sx, sy: sy }); },
    measureText: function (text) { return { width: String(text).length * 7 }; }
  };
  return stub;
}

// --- jsdom + vm context loader ---------------------------------------------

/**
 * Boot a fresh jsdom window, patch createElement('canvas') so getContext
 * returns our recording stub, then run activity-bridge.js inside a vm
 * context bound to that window.  Returns { win, doc, ActivityBridge }.
 */
function loadActivityBridge() {
  var dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount"></div></body></html>', {
    url: 'https://example.com'
  });
  var win = dom.window;
  var doc = win.document;

  // Patch HTMLCanvasElement.getContext on every newly-created canvas so
  // the bridge gets our recording stub.  We do not need any real canvas
  // backend (jsdom does not ship one).
  var origCreate = doc.createElement.bind(doc);
  doc.createElement = function (name) {
    var el = origCreate(name);
    if (String(name).toLowerCase() === 'canvas') {
      var stub = makeCtxStub();
      el.getContext = function () { return stub; };
      // Expose the stub so tests can read recorded calls.
      el._stub = stub;
    }
    return el;
  };

  // jsdom does not implement devicePixelRatio in older versions; ensure 1
  // so the bridge does not scale anything we cannot recover.
  try { win.devicePixelRatio = 1; } catch (_) {}

  var ctx = createContext(win);
  runInContext(BRIDGE_SRC, ctx);

  return { win: win, doc: doc, ActivityBridge: win.ActivityBridge };
}

/**
 * Find the mount div, mount the bridge, return { handle, mountEl, canvas, stub }.
 */
function mountIntoDom() {
  var env     = loadActivityBridge();
  var mountEl = env.doc.getElementById('mount');
  var handle  = env.ActivityBridge.mount(mountEl, {});
  var canvas  = mountEl.querySelector('canvas');
  return {
    env:     env,
    mountEl: mountEl,
    handle:  handle,
    canvas:  canvas,
    stub:    canvas ? canvas._stub : null
  };
}

// --- sample states ----------------------------------------------------------

function makeState(values, target, currentMean, holdMs) {
  return {
    values:       values,
    target:       target,
    tolerance:    0.3,
    currentMean:  currentMean,
    holdMs:       holdMs == null ? 0 : holdMs,
    holdTargetMs: 3000
  };
}

// --- tests ------------------------------------------------------------------

describe('activity-bridge.js module loader', function () {
  it('attaches window.ActivityBridge with a mount() function', function () {
    var env = loadActivityBridge();
    expect(env.ActivityBridge).toBeDefined();
    expect(typeof env.ActivityBridge.mount).toBe('function');
  });
});

describe('ActivityBridge.mount', function () {
  it('returns a handle with destroy, updateState, showOutcome methods', function () {
    var m = mountIntoDom();
    expect(m.handle).toBeDefined();
    expect(typeof m.handle.destroy).toBe('function');
    expect(typeof m.handle.updateState).toBe('function');
    expect(typeof m.handle.showOutcome).toBe('function');
  });

  it('appends a canvas element into the mount container', function () {
    var m = mountIntoDom();
    expect(m.canvas).not.toBeNull();
    expect(m.canvas.tagName.toLowerCase()).toBe('canvas');
    // Width default branches to 320 in jsdom (clientWidth is 0).
    expect(m.canvas.style.width).toMatch(/px$/);
    expect(m.canvas.style.height).toBe('180px');
  });

  it('renders an initial scene (background fillRect) without an updateState call', function () {
    var m = mountIntoDom();
    expect(m.stub).not.toBeNull();
    // The mount-time draw paints the background -- a large fillRect that
    // covers most of the canvas.
    var bg = m.stub.fillRects.find(function (r) { return r.w >= 100 && r.h >= 100; });
    expect(bg).toBeDefined();
  });

  it('does not throw when mountEl is null', function () {
    var env = loadActivityBridge();
    expect(function () { env.ActivityBridge.mount(null, {}); }).not.toThrow();
  });
});

describe('ActivityBridge handle.updateState', function () {
  it('draws additional fillRects on update (scene + band + bridge)', function () {
    var m = mountIntoDom();
    var beforeCount = m.stub.fillRects.length;
    m.handle.updateState(makeState({ alice: 5, bob: 5 }, 6, 5.0, 0));
    expect(m.stub.fillRects.length).toBeGreaterThan(beforeCount);
  });

  it('does not throw on empty values map', function () {
    var m = mountIntoDom();
    expect(function () {
      m.handle.updateState(makeState({}, 5, 0, 0));
    }).not.toThrow();
  });

  it('does not throw on null state', function () {
    var m = mountIntoDom();
    expect(function () { m.handle.updateState(null); }).not.toThrow();
  });

  it('bridge fragment is short when currentMean is near 1 and tall when near 10', function () {
    // Low mean -> bridge top sits near floor -> bridge height small (zero at exactly 1).
    var mLow = mountIntoDom();
    mLow.stub.fillRects.length = 0;
    mLow.handle.updateState(makeState({ a: 2, b: 2 }, 7, 2.0, 0));
    // Find the bridge fillRect: brown color and inside the gap region.
    var lowBridge = mLow.stub.fillRects.find(function (r) {
      return r.fillStyle === '#b58c5a' && r.w > 4;
    });
    expect(lowBridge).toBeDefined();
    var lowH = lowBridge.h;

    // High mean -> bridge tall.
    var mHigh = mountIntoDom();
    mHigh.stub.fillRects.length = 0;
    mHigh.handle.updateState(makeState({ a: 10, b: 10 }, 4, 10.0, 0));
    var highBridge = mHigh.stub.fillRects.find(function (r) {
      return r.fillStyle === '#b58c5a' && r.w > 4;
    });
    expect(highBridge).toBeDefined();
    var highH = highBridge.h;

    // Tall bridge must be meaningfully taller than the low-mean bridge.
    expect(highH).toBeGreaterThan(lowH + 20);
  });

  it('bridge fragment is zero-height (not drawn) when currentMean is exactly 1', function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.handle.updateState(makeState({ a: 1, b: 1 }, 5, 1.0, 0));
    var bridge = m.stub.fillRects.find(function (r) {
      return r.fillStyle === '#b58c5a';
    });
    // Per spec: mean=1 sits at the bottom, so the bridge height is 0.
    // Our renderer short-circuits before drawing a zero-height bridge.
    expect(bridge).toBeUndefined();
  });

  it('renders a green target band fillRect inside the gap', function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.handle.updateState(makeState({ a: 5, b: 6 }, 6, 5.5, 0));
    // The band uses a translucent green rgba fillStyle.
    var greenBand = m.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && r.fillStyle.indexOf('rgba(') === 0
          && /,\s*200\s*,\s*110/.test(r.fillStyle);
    });
    expect(greenBand).toBeDefined();
    // Band height should be a non-trivial slice but smaller than the full gap.
    expect(greenBand.h).toBeGreaterThan(2);
  });

  it('green band shifts upward (smaller y) when target value increases', function () {
    var mLow = mountIntoDom();
    mLow.stub.fillRects.length = 0;
    mLow.handle.updateState(makeState({ a: 3 }, 3, 3.0, 0));   // target = 3 (low)
    var lowBand = mLow.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && /,\s*200\s*,\s*110/.test(r.fillStyle);
    });
    expect(lowBand).toBeDefined();

    var mHigh = mountIntoDom();
    mHigh.stub.fillRects.length = 0;
    mHigh.handle.updateState(makeState({ a: 8 }, 8, 8.0, 0));  // target = 8 (high)
    var highBand = mHigh.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && /,\s*200\s*,\s*110/.test(r.fillStyle);
    });
    expect(highBand).toBeDefined();

    // Higher target -> band positioned higher on canvas -> smaller y.
    expect(highBand.y).toBeLessThan(lowBand.y);
  });

  it('renders the HUD text containing mean, target, and hold values', function () {
    var m = mountIntoDom();
    m.stub.texts.length = 0;
    m.handle.updateState(makeState({ alice: 4, bob: 6 }, 5, 5.0, 1500));
    var hudText = m.stub.texts.find(function (t) {
      return t.text.indexOf('mean:') >= 0
          && t.text.indexOf('target:') >= 0
          && t.text.indexOf('hold:') >= 0;
    });
    expect(hudText).toBeDefined();
    expect(hudText.text).toMatch(/mean:\s*5\.0/);
    expect(hudText.text).toMatch(/target:\s*5\.0/);
    expect(hudText.text).toMatch(/hold:\s*1\.5s\s*\/\s*3\.0s/);
  });

  it('renders one avatar dot (arc) per entry in state.values', function () {
    var m = mountIntoDom();
    m.stub.arcs.length = 0;
    m.handle.updateState(makeState({ alice: 3, bob: 7, carol: 5 }, 6, 5.0, 0));
    expect(m.stub.arcs.length).toBe(3);
  });

  it('renders each username as a text label', function () {
    var m = mountIntoDom();
    m.stub.texts.length = 0;
    m.handle.updateState(makeState({ alice: 4, bob: 6 }, 5, 5.0, 0));
    var alice = m.stub.texts.find(function (t) { return t.text === 'alice'; });
    var bob   = m.stub.texts.find(function (t) { return t.text === 'bob'; });
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
  });
});

describe('ActivityBridge handle.showOutcome', function () {
  it("renders a green overlay + 'SUCCESS!' text on 'success'", function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.stub.texts.length = 0;
    m.handle.showOutcome('success');
    // Overlay rect uses an rgba green; covers the canvas.
    var overlay = m.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && r.fillStyle.indexOf('rgba(40, 200, 90') === 0;
    });
    expect(overlay).toBeDefined();
    var msg = m.stub.texts.find(function (t) { return t.text === 'SUCCESS!'; });
    expect(msg).toBeDefined();
  });

  it("renders an orange overlay + 'TIME UP' text on 'timeout'", function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.stub.texts.length = 0;
    m.handle.showOutcome('timeout');
    var overlay = m.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && r.fillStyle.indexOf('rgba(230, 140, 40') === 0;
    });
    expect(overlay).toBeDefined();
    var msg = m.stub.texts.find(function (t) { return t.text === 'TIME UP'; });
    expect(msg).toBeDefined();
  });

  it("renders a gray overlay + 'CANCELLED' text on 'cancel'", function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.stub.texts.length = 0;
    m.handle.showOutcome('cancel');
    var overlay = m.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && r.fillStyle.indexOf('rgba(120, 120, 120') === 0;
    });
    expect(overlay).toBeDefined();
    var msg = m.stub.texts.find(function (t) { return t.text === 'CANCELLED'; });
    expect(msg).toBeDefined();
  });
});

describe('ActivityBridge handle.destroy', function () {
  it('removes the canvas from the mount element', function () {
    var m = mountIntoDom();
    expect(m.mountEl.querySelector('canvas')).not.toBeNull();
    m.handle.destroy();
    expect(m.mountEl.querySelector('canvas')).toBeNull();
  });

  it('is idempotent (calling destroy twice does not throw)', function () {
    var m = mountIntoDom();
    m.handle.destroy();
    expect(function () { m.handle.destroy(); }).not.toThrow();
  });

  it('updateState becomes a no-op after destroy', function () {
    var m = mountIntoDom();
    m.handle.destroy();
    var before = m.stub.fillRects.length;
    expect(function () {
      m.handle.updateState(makeState({ a: 5 }, 5, 5, 0));
    }).not.toThrow();
    // No new fillRects should have been recorded after destroy.
    expect(m.stub.fillRects.length).toBe(before);
  });
});

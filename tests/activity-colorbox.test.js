/**
 * tests/activity-colorbox.test.js
 *
 * Unit tests for activity-colorbox.js (window.ActivityColorbox.mount + handle).
 *
 * Strategy:
 *   - Build a jsdom window + document.
 *   - Inject a 2d-context stub (records every draw call into arrays) so
 *     we can assert what was drawn without a real canvas backend.
 *   - Run the colorbox IIFE inside a vm context (mirrors
 *     activity-bridge.test.js).
 *
 * Coverage per LIVE_CLASSROOM_V5_BUILD.md C7 Unit B (colorbox renderer):
 *   - mount returns handle { destroy, updateState, showOutcome }
 *   - updateState fills 4 colored zones via fillRect
 *   - updateState writes per-zone tally counts as text
 *   - updateState writes OK / X indicators per zone (matching expected
 *     count derived from assignments)
 *   - Progress bar width matches holdMs / holdTargetMs ratio
 *   - showOutcome('success') renders green flash
 *   - destroy removes the canvas element
 *
 * ASCII-only.  LF line endings.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT      = resolve(import.meta.dirname, '..');
const COLORBOX_SRC   = readFileSync(resolve(REPO_ROOT, 'activity-colorbox.js'), 'utf8');

// --- 2d context stub --------------------------------------------------------

/**
 * Build a minimal 2D context stub that records every draw operation
 * AND the fillStyle/strokeStyle/globalAlpha in effect at call time.
 */
function makeCtxStub() {
  var stub = {
    fillStyle:    '#000',
    strokeStyle:  '#000',
    lineWidth:    1,
    font:         '12px sans-serif',
    textAlign:    'left',
    textBaseline: 'alphabetic',
    globalAlpha:  1,

    fillRects:   [],   // { x, y, w, h, fillStyle, globalAlpha }
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
      this.fillRects.push({
        x: x, y: y, w: w, h: h,
        fillStyle:   this.fillStyle,
        globalAlpha: this.globalAlpha
      });
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
 * returns our recording stub, then run activity-colorbox.js inside a vm
 * context bound to that window.  Returns { win, doc, ActivityColorbox }.
 */
function loadActivityColorbox() {
  var dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount"></div></body></html>', {
    url: 'https://example.com'
  });
  var win = dom.window;
  var doc = win.document;

  // Patch HTMLCanvasElement.getContext on every newly-created canvas.
  var origCreate = doc.createElement.bind(doc);
  doc.createElement = function (name) {
    var el = origCreate(name);
    if (String(name).toLowerCase() === 'canvas') {
      var stub = makeCtxStub();
      el.getContext = function () { return stub; };
      el._stub = stub;
    }
    return el;
  };

  try { win.devicePixelRatio = 1; } catch (_) {}

  var ctx = createContext(win);
  runInContext(COLORBOX_SRC, ctx);

  return { win: win, doc: doc, ActivityColorbox: win.ActivityColorbox };
}

/**
 * Find the mount div, mount the colorbox renderer, return
 * { handle, mountEl, canvas, stub, env }.
 */
function mountIntoDom() {
  var env     = loadActivityColorbox();
  var mountEl = env.doc.getElementById('mount');
  var handle  = env.ActivityColorbox.mount(mountEl, {});
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

/**
 * Build a colorbox state shaped per C2 serializeForBoard.
 */
function makeState(opts) {
  opts = opts || {};
  return {
    assignments:  opts.assignments  || {},
    currentZone:  opts.currentZone  || {},
    tally:        opts.tally        || [0, 0, 0, 0],
    holdMs:       opts.holdMs       == null ? 0    : opts.holdMs,
    holdTargetMs: opts.holdTargetMs == null ? 5000 : opts.holdTargetMs,
    zones: [
      { id: 0, label: 'Red'    },
      { id: 1, label: 'Yellow' },
      { id: 2, label: 'Green'  },
      { id: 3, label: 'Blue'   }
    ]
  };
}

var ZONE_FILLS = ['#ff5555', '#ddcc44', '#55cc55', '#5577cc'];

// --- tests ------------------------------------------------------------------

describe('activity-colorbox.js module loader', function () {
  it('attaches window.ActivityColorbox with a mount() function', function () {
    var env = loadActivityColorbox();
    expect(env.ActivityColorbox).toBeDefined();
    expect(typeof env.ActivityColorbox.mount).toBe('function');
  });
});

describe('ActivityColorbox.mount', function () {
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
    expect(m.canvas.style.width).toMatch(/px$/);
    expect(m.canvas.style.height).toBe('40px');
  });

  it('does not throw when mountEl is null', function () {
    var env = loadActivityColorbox();
    expect(function () { env.ActivityColorbox.mount(null, {}); }).not.toThrow();
  });
});

describe('ActivityColorbox handle.updateState', function () {
  it('fills 4 colored zone rectangles (one fillRect per zone color)', function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.handle.updateState(makeState({
      assignments: { alice: 0, bob: 1, carol: 2, dan: 3 },
      tally: [1, 1, 1, 1]
    }));
    // We expect at least one fillRect using each of the four zone colors.
    for (var i = 0; i < 4; i++) {
      var color = ZONE_FILLS[i];
      var matchingRect = m.stub.fillRects.find(function (r) {
        return r.fillStyle === color;
      });
      expect(matchingRect, 'expected a fillRect with fillStyle ' + color).toBeDefined();
    }
  });

  it('renders the four zones at translucent alpha (~0.45)', function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.handle.updateState(makeState({
      assignments: { alice: 0 },
      tally: [1, 0, 0, 0]
    }));
    var redZone = m.stub.fillRects.find(function (r) {
      return r.fillStyle === ZONE_FILLS[0];
    });
    expect(redZone).toBeDefined();
    expect(redZone.globalAlpha).toBeGreaterThan(0);
    expect(redZone.globalAlpha).toBeLessThan(1);
  });

  it('writes per-zone tally counts as text (one number per zone)', function () {
    var m = mountIntoDom();
    m.stub.texts.length = 0;
    m.handle.updateState(makeState({
      assignments: { alice: 0, bob: 0, carol: 1, dan: 2, eve: 3 },
      tally: [2, 1, 1, 1]
    }));
    // Each tally count appears as its own text draw.
    var t0 = m.stub.texts.find(function (t) { return t.text === '2' && t.textAlign === 'left'; });
    var t1 = m.stub.texts.filter(function (t) { return t.text === '1' && t.textAlign === 'left'; });
    expect(t0).toBeDefined();
    // Three zones with tally 1 -> at least three '1' tally texts.
    expect(t1.length).toBeGreaterThanOrEqual(3);
  });

  it("writes OK / X indicators per zone reflecting tally vs expected", function () {
    var m = mountIntoDom();
    m.stub.texts.length = 0;
    // expected: zone 0 -> 2 students, zone 1 -> 1, zone 2 -> 1, zone 3 -> 0
    // tally:    zone 0 -> 2 (match), zone 1 -> 0 (miss), zone 2 -> 1 (match), zone 3 -> 1 (miss)
    m.handle.updateState(makeState({
      assignments: { a: 0, b: 0, c: 1, d: 2 },
      tally: [2, 0, 1, 1]
    }));
    var okMarks  = m.stub.texts.filter(function (t) { return t.text === 'OK'; });
    var badMarks = m.stub.texts.filter(function (t) { return t.text === 'X'; });
    expect(okMarks.length).toBe(2);
    expect(badMarks.length).toBe(2);
  });

  it("writes one mark per zone (4 total) when all zones are checked", function () {
    var m = mountIntoDom();
    m.stub.texts.length = 0;
    m.handle.updateState(makeState({
      assignments: { a: 0, b: 1, c: 2, d: 3 },
      tally: [1, 1, 1, 1]
    }));
    var okMarks  = m.stub.texts.filter(function (t) { return t.text === 'OK'; });
    var badMarks = m.stub.texts.filter(function (t) { return t.text === 'X'; });
    expect(okMarks.length + badMarks.length).toBe(4);
    // All four zones match expected, so all four marks are OK.
    expect(okMarks.length).toBe(4);
  });

  it('progress bar width is zero when holdMs is 0', function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.handle.updateState(makeState({
      assignments: { a: 0 },
      tally: [1, 0, 0, 0],
      holdMs: 0,
      holdTargetMs: 5000
    }));
    // The progress FILL rect (not the bg track) only appears when holdMs > 0.
    // The progress track is the rect with width === cssW at the very top (y=0).
    var progressFills = m.stub.fillRects.filter(function (r) {
      return r.y === 0 && r.h <= 4 && r.fillStyle === 'rgba(255, 255, 255, 0.75)';
    });
    expect(progressFills.length).toBe(0);
  });

  it('progress bar width scales with holdMs / holdTargetMs', function () {
    var mHalf = mountIntoDom();
    mHalf.stub.fillRects.length = 0;
    mHalf.handle.updateState(makeState({
      assignments: { a: 0 },
      tally: [1, 0, 0, 0],
      holdMs: 2500,
      holdTargetMs: 5000
    }));
    var halfFill = mHalf.stub.fillRects.find(function (r) {
      return r.y === 0 && r.h <= 4 && r.fillStyle === 'rgba(255, 255, 255, 0.75)';
    });
    expect(halfFill).toBeDefined();

    var mFull = mountIntoDom();
    mFull.stub.fillRects.length = 0;
    mFull.handle.updateState(makeState({
      assignments: { a: 0 },
      tally: [1, 0, 0, 0],
      holdMs: 5000,
      holdTargetMs: 5000
    }));
    var fullFill = mFull.stub.fillRects.find(function (r) {
      return r.y === 0 && r.h <= 4 && r.fillStyle === 'rgba(255, 255, 255, 0.75)';
    });
    expect(fullFill).toBeDefined();

    // Full progress should be roughly 2x the half-progress width.
    expect(fullFill.w).toBeGreaterThan(halfFill.w + 1);
    // Half should be about half of full (with small float slack).
    expect(Math.abs(halfFill.w * 2 - fullFill.w)).toBeLessThan(1);
  });

  it('renders the four zone labels (Red, Yellow, Green, Blue)', function () {
    var m = mountIntoDom();
    m.stub.texts.length = 0;
    m.handle.updateState(makeState({
      assignments: { alice: 0 },
      tally: [1, 0, 0, 0]
    }));
    var red    = m.stub.texts.find(function (t) { return t.text === 'Red'; });
    var yellow = m.stub.texts.find(function (t) { return t.text === 'Yellow'; });
    var green  = m.stub.texts.find(function (t) { return t.text === 'Green'; });
    var blue   = m.stub.texts.find(function (t) { return t.text === 'Blue'; });
    expect(red).toBeDefined();
    expect(yellow).toBeDefined();
    expect(green).toBeDefined();
    expect(blue).toBeDefined();
  });

  it('does not throw on empty / null state', function () {
    var m = mountIntoDom();
    expect(function () { m.handle.updateState(null); }).not.toThrow();
    expect(function () { m.handle.updateState({}); }).not.toThrow();
  });
});

describe('ActivityColorbox handle.showOutcome', function () {
  it("renders a green overlay + 'SORTED!' text on 'success'", function () {
    var m = mountIntoDom();
    m.stub.fillRects.length = 0;
    m.stub.texts.length = 0;
    m.handle.showOutcome('success');
    var overlay = m.stub.fillRects.find(function (r) {
      return typeof r.fillStyle === 'string'
          && r.fillStyle.indexOf('rgba(40, 200, 90') === 0;
    });
    expect(overlay).toBeDefined();
    var msg = m.stub.texts.find(function (t) { return t.text === 'SORTED!'; });
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

describe('ActivityColorbox handle.destroy', function () {
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
      m.handle.updateState(makeState({
        assignments: { a: 0 },
        tally: [1, 0, 0, 0]
      }));
    }).not.toThrow();
    expect(m.stub.fillRects.length).toBe(before);
  });
});

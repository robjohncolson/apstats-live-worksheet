/**
 * tests/ti84-plot.test.js
 *
 * Unit tests for ti84-plot.js (Ti84Plot.drawBarChart / Ti84Plot.drawDotplot).
 * Uses a 2d-context stub -- no real canvas / browser required.
 *
 * Coverage per BUILD doc Section 6:
 *   - drawBarChart: correct bar count, height scaling, axis drawn
 *   - drawDotplot:  correct dot stacking, axis drawn
 *   - Both: no throw on empty / degenerate data
 *
 * ASCII-clean.  LF line endings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PLOT_SRC  = readFileSync(resolve(REPO_ROOT, 'ti84-plot.js'), 'utf8');

// ── 2d context stub ────────────────────────────────────────────────────────

/**
 * Build a minimal CanvasRenderingContext2D stub that records drawing calls
 * so tests can assert on them without a real browser canvas.
 *
 * Recorded arrays:
 *   stub.rects    - all fillRect calls: { x, y, w, h }
 *   stub.arcs     - all arc calls:      { x, y, r }
 *   stub.texts    - all fillText calls: { text, x, y }
 *   stub.lines    - all moveTo/lineTo pairs: { type, x, y }
 *   stub.strokes  - count of stroke() calls
 *   stub.begins   - count of beginPath() calls
 */
function makeCtxStub(width, height) {
  var stub = {
    canvas: { width: width || 200, height: height || 150 },
    fillStyle:   '#000',
    strokeStyle: '#000',
    lineWidth:   1,
    font:        '12px monospace',
    textAlign:   'left',
    textBaseline:'alphabetic',

    rects:   [],
    arcs:    [],
    texts:   [],
    lines:   [],
    strokes: 0,
    begins:  0,

    fillRect: function (x, y, w, h) {
      this.rects.push({ x: x, y: y, w: w, h: h });
    },
    strokeRect: function (x, y, w, h) {
      this.rects.push({ x: x, y: y, w: w, h: h, stroke: true });
    },
    fillText: function (text, x, y) {
      this.texts.push({ text: String(text), x: x, y: y });
    },
    measureText: function (text) {
      // Approximate monospace character width
      return { width: String(text).length * 7 };
    },
    beginPath: function () {
      this.begins++;
    },
    moveTo: function (x, y) {
      this.lines.push({ type: 'moveTo', x: x, y: y });
    },
    lineTo: function (x, y) {
      this.lines.push({ type: 'lineTo', x: x, y: y });
    },
    stroke: function () {
      this.strokes++;
    },
    arc: function (x, y, r) {
      this.arcs.push({ x: x, y: y, r: r });
    },
    fill: function () {},
    closePath: function () {}
  };

  return stub;
}

// ── load Ti84Plot into a vm context ────────────────────────────────────────

function loadTi84Plot() {
  var fakeWindow = {};
  var ctx = createContext({ window: fakeWindow, module: { exports: {} } });
  runInContext(PLOT_SRC, ctx);
  return fakeWindow.Ti84Plot;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('ti84-plot.js module', function () {
  var Ti84Plot;

  beforeEach(function () {
    Ti84Plot = loadTi84Plot();
  });

  it('attaches Ti84Plot to window', function () {
    expect(Ti84Plot).toBeDefined();
    expect(typeof Ti84Plot.drawBarChart).toBe('function');
    expect(typeof Ti84Plot.drawDotplot).toBe('function');
  });
});

// ── drawBarChart ───────────────────────────────────────────────────────────

describe('Ti84Plot.drawBarChart', function () {
  var Ti84Plot;

  beforeEach(function () {
    Ti84Plot = loadTi84Plot();
  });

  it('does not throw on empty labels/counts', function () {
    var stub = makeCtxStub();
    expect(function () {
      Ti84Plot.drawBarChart(stub, { labels: [], counts: [] });
    }).not.toThrow();
  });

  it('does not throw on null opts', function () {
    var stub = makeCtxStub();
    expect(function () {
      Ti84Plot.drawBarChart(stub, null);
    }).not.toThrow();
  });

  it('does not throw on missing ctx', function () {
    expect(function () {
      Ti84Plot.drawBarChart(null, { labels: ['A'], counts: [5] });
    }).not.toThrow();
  });

  it('draws the frame (background fillRect) even for empty data', function () {
    var stub = makeCtxStub();
    Ti84Plot.drawBarChart(stub, { labels: [], counts: [] });
    // At minimum the LCD background fillRect must have fired
    var bgRect = stub.rects.find(function (r) { return r.w > 50 && r.h > 50; });
    expect(bgRect).toBeDefined();
  });

  it('draws one bar per label', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['Yes', 'No', 'Maybe'],
      counts: [10, 5, 3]
    });
    // Each non-zero bar produces exactly one filled (non-stroke) filled rect
    // with positive height.  Filter out the LCD background/frame/title rects
    // by requiring w < canvas.width / 2 (bars are narrower than half the canvas).
    var barRects = stub.rects.filter(function (r) {
      return !r.stroke && r.h > 0 && r.w < 100;
    });
    expect(barRects.length).toBe(3);
  });

  it('renders 0-count bars without a fill rect (height 0)', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['A', 'B'],
      counts: [0, 0]
    });
    // maxCount is 0 -> barH is always 0 -> no tall bar rects
    var tallBars = stub.rects.filter(function (r) {
      return !r.stroke && r.h > 2 && r.w < 80;
    });
    expect(tallBars.length).toBe(0);
  });

  it('scales tallest bar to full plot height', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['Big', 'Small'],
      counts: [20, 10]
    });
    // The tallest bar rect should have height >= half of the canvas height
    var tallBars = stub.rects.filter(function (r) {
      return !r.stroke && r.h > 50 && r.w < 80;
    });
    expect(tallBars.length).toBeGreaterThanOrEqual(1);
  });

  it('height of the small bar is proportional (roughly half the big bar)', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['Big', 'Small'],
      counts: [20, 10]
    });
    var bars = stub.rects
      .filter(function (r) { return !r.stroke && r.h > 0 && r.w < 80; })
      .sort(function (a, b) { return b.h - a.h; });

    expect(bars.length).toBe(2);
    // Small bar height should be ~50% of big bar height (allow +/- 2px rounding)
    var ratio = bars[1].h / bars[0].h;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.65);
  });

  it('draws the axis (frame strokeRect + L-axis stroke path)', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['A'],
      counts: [5]
    });
    // The LCD bezel is drawn with strokeRect; the L-shaped axis uses stroke().
    var frameStroke = stub.rects.some(function (r) { return r.stroke; });
    expect(frameStroke).toBe(true);
    // L-axis: at least one stroke() call from the path
    expect(stub.strokes).toBeGreaterThanOrEqual(1);
  });

  it('prints the count above each bar (as text)', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['Yes', 'No'],
      counts: [7, 3]
    });
    var countTexts = stub.texts.filter(function (t) {
      return t.text === '7' || t.text === '3';
    });
    // Both counts must appear
    expect(countTexts.map(function (t) { return t.text; })).toContain('7');
    expect(countTexts.map(function (t) { return t.text; })).toContain('3');
  });

  it('renders with a title string when provided', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawBarChart(stub, {
      labels: ['A'],
      counts: [1],
      title:  'Poll Results'
    });
    var titleText = stub.texts.find(function (t) { return t.text === 'Poll Results'; });
    expect(titleText).toBeDefined();
  });

  it('handles mismatched labels/counts by taking the shorter length', function () {
    var stub = makeCtxStub(200, 150);
    expect(function () {
      Ti84Plot.drawBarChart(stub, {
        labels: ['A', 'B', 'C'],
        counts: [1, 2]          // one fewer count
      });
    }).not.toThrow();
    // Should draw 2 bars (the overlap)
    var bars = stub.rects.filter(function (r) { return !r.stroke && r.h > 0 && r.w < 80; });
    expect(bars.length).toBe(2);
  });
});

// ── drawDotplot ────────────────────────────────────────────────────────────

describe('Ti84Plot.drawDotplot', function () {
  var Ti84Plot;

  beforeEach(function () {
    Ti84Plot = loadTi84Plot();
  });

  it('does not throw on empty values array', function () {
    var stub = makeCtxStub();
    expect(function () {
      Ti84Plot.drawDotplot(stub, { values: [] });
    }).not.toThrow();
  });

  it('does not throw on null opts', function () {
    var stub = makeCtxStub();
    expect(function () {
      Ti84Plot.drawDotplot(stub, null);
    }).not.toThrow();
  });

  it('draws the frame (background fillRect) even for empty data', function () {
    var stub = makeCtxStub();
    Ti84Plot.drawDotplot(stub, { values: [] });
    var bgRect = stub.rects.find(function (r) { return r.w > 50 && r.h > 50; });
    expect(bgRect).toBeDefined();
  });

  it('draws one dot per value entry', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, { values: [1, 2, 2, 3] });
    // Each dot is drawn as an arc + fill
    expect(stub.arcs.length).toBe(4);
  });

  it('stacks two dots for a repeated value', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, { values: [5, 5] });
    // The two dots for value 5 should be at the same x but different y
    expect(stub.arcs.length).toBe(2);
    expect(stub.arcs[0].x).toBeCloseTo(stub.arcs[1].x, 0);
    expect(stub.arcs[0].y).not.toBeCloseTo(stub.arcs[1].y, 0);
  });

  it('stacks higher dot further from the axis than the lower dot', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, { values: [1, 1, 1] });
    // Dots are stacked upward -- earlier dots have larger y (closer to axis)
    var ys = stub.arcs.map(function (a) { return a.y; }).sort(function (a, b) { return b - a; });
    expect(ys.length).toBe(3);
    // All y values should be strictly decreasing when going further from the axis
    for (var i = 0; i < ys.length - 1; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i + 1]);
    }
  });

  it('draws the axis (frame strokeRect + L-axis stroke path)', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, { values: [1, 2, 3] });
    // The LCD bezel is drawn with strokeRect; the L-shaped axis uses stroke().
    var frameStroke = stub.rects.some(function (r) { return r.stroke; });
    expect(frameStroke).toBe(true);
    expect(stub.strokes).toBeGreaterThanOrEqual(1);
  });

  it('renders axis labels below the axis', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, { values: [10, 20, 10] });
    // Unique values: 10, 20 -> two axis labels
    var labelTexts = stub.texts.filter(function (t) {
      return t.text === '10' || t.text === '20';
    });
    expect(labelTexts.map(function (t) { return t.text; })).toContain('10');
    expect(labelTexts.map(function (t) { return t.text; })).toContain('20');
  });

  it('uses opts.labels when provided and matching unique count', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, {
      values: [0, 1, 0],
      labels: ['No', 'Yes']
    });
    var hasNo  = stub.texts.some(function (t) { return t.text === 'No'; });
    var hasYes = stub.texts.some(function (t) { return t.text === 'Yes'; });
    expect(hasNo).toBe(true);
    expect(hasYes).toBe(true);
  });

  it('renders a title when provided', function () {
    var stub = makeCtxStub(200, 150);
    Ti84Plot.drawDotplot(stub, {
      values: [1, 2],
      title:  'Dot Test'
    });
    var titleText = stub.texts.find(function (t) { return t.text === 'Dot Test'; });
    expect(titleText).toBeDefined();
  });

  it('handles a single unique value without throwing', function () {
    var stub = makeCtxStub(200, 150);
    expect(function () {
      Ti84Plot.drawDotplot(stub, { values: [42, 42, 42] });
    }).not.toThrow();
    expect(stub.arcs.length).toBe(3);
  });
});

// ── drawHistogram ──────────────────────────────────────────────────────────

describe('Ti84Plot.drawHistogram', function () {
  var Ti84Plot;

  beforeEach(function () { Ti84Plot = loadTi84Plot(); });

  it('attaches drawHistogram to the public API', function () {
    expect(typeof Ti84Plot.drawHistogram).toBe('function');
  });

  it('does not throw on empty values', function () {
    var stub = makeCtxStub();
    expect(function () { Ti84Plot.drawHistogram(stub, { values: [] }); }).not.toThrow();
  });

  it('does not throw on null opts or missing ctx', function () {
    var stub = makeCtxStub();
    expect(function () { Ti84Plot.drawHistogram(stub, null); }).not.toThrow();
    expect(function () { Ti84Plot.drawHistogram(null, { values: [1] }); }).not.toThrow();
  });

  it('draws the LCD background frame even with empty data', function () {
    var stub = makeCtxStub();
    Ti84Plot.drawHistogram(stub, { values: [] });
    var bg = stub.rects.find(function (r) { return r.w > 50 && r.h > 50; });
    expect(bg).toBeDefined();
  });

  it('draws N filled bars when opts.bins is N (explicit count)', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawHistogram(stub, { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bins: 4 });
    var bars = stub.rects.filter(function (r) { return !r.stroke && r.h > 0 && r.w < 150; });
    expect(bars.length).toBe(4);
  });

  it('respects explicit bin edges array', function () {
    var stub = makeCtxStub(300, 200);
    // Edges [0,10,20,30] -> 3 bins
    Ti84Plot.drawHistogram(stub, { values: [5, 15, 25, 5, 15], bins: [0, 10, 20, 30] });
    var bars = stub.rects.filter(function (r) { return !r.stroke && r.h > 0 && r.w < 150; });
    expect(bars.length).toBe(3);
  });

  it('bars are flush (no gap between adjacent left edges)', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawHistogram(stub, { values: [1, 2, 3, 4, 5, 6], bins: 3 });
    var bars = stub.rects
      .filter(function (r) { return !r.stroke && r.h > 0 && r.w < 150; })
      .sort(function (a, b) { return a.x - b.x; });
    expect(bars.length).toBe(3);
    // Adjacent bars: bar[1].x ~= bar[0].x + bar[0].w (flush means no gap)
    expect(bars[1].x).toBeCloseTo(bars[0].x + bars[0].w, 0);
    expect(bars[2].x).toBeCloseTo(bars[1].x + bars[1].w, 0);
  });

  it('defaults bin count to ceil(sqrt(n)) when bins not specified', function () {
    var stub = makeCtxStub(400, 250);
    // n = 9 -> sqrt = 3
    Ti84Plot.drawHistogram(stub, { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    var bars = stub.rects.filter(function (r) { return !r.stroke && r.h > 0 && r.w < 150; });
    expect(bars.length).toBe(3);
  });

  it('handles a single-value degenerate dataset without throwing', function () {
    var stub = makeCtxStub();
    expect(function () { Ti84Plot.drawHistogram(stub, { values: [7, 7, 7] }); }).not.toThrow();
  });

  it('renders a title when provided', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawHistogram(stub, { values: [1, 2, 3], bins: 2, title: 'Test Heights' });
    var titleText = stub.texts.find(function (t) { return t.text === 'Test Heights'; });
    expect(titleText).toBeDefined();
  });
});

// ── drawBoxplot ────────────────────────────────────────────────────────────

describe('Ti84Plot.drawBoxplot', function () {
  var Ti84Plot;

  beforeEach(function () { Ti84Plot = loadTi84Plot(); });

  it('attaches drawBoxplot to the public API', function () {
    expect(typeof Ti84Plot.drawBoxplot).toBe('function');
  });

  it('does not throw on null opts or missing ctx', function () {
    var stub = makeCtxStub();
    expect(function () { Ti84Plot.drawBoxplot(stub, null); }).not.toThrow();
    expect(function () { Ti84Plot.drawBoxplot(null, { five: { min:0,q1:1,median:2,q3:3,max:4 } }); }).not.toThrow();
  });

  it('does not throw on missing five-num summary', function () {
    var stub = makeCtxStub();
    expect(function () { Ti84Plot.drawBoxplot(stub, {}); }).not.toThrow();
  });

  it('renders one box outline for a single five-num summary', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawBoxplot(stub, { five: { min: 0, q1: 10, median: 20, q3: 30, max: 40 } });
    // The box itself is the only strokeRect (the LCD bezel is also a strokeRect,
    // distinguished by being much larger). Box width spans Q1 -> Q3 in the plot area.
    var boxRects = stub.rects.filter(function (r) {
      return r.stroke && r.w < 200 && r.h < 100;
    });
    expect(boxRects.length).toBe(1);
  });

  it('renders N box outlines for N parallel datasets', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawBoxplot(stub, {
      datasets: [
        { label: 'A', five: { min: 0, q1: 5,  median: 10, q3: 15, max: 20 } },
        { label: 'B', five: { min: 2, q1: 8,  median: 12, q3: 18, max: 24 } },
        { label: 'C', five: { min: 1, q1: 6,  median: 11, q3: 16, max: 22 } }
      ]
    });
    var boxRects = stub.rects.filter(function (r) {
      return r.stroke && r.w < 200 && r.h < 100;
    });
    expect(boxRects.length).toBe(3);
  });

  it('stacks parallel boxes vertically (different y centers)', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawBoxplot(stub, {
      datasets: [
        { label: 'A', five: { min: 0, q1: 5, median: 10, q3: 15, max: 20 } },
        { label: 'B', five: { min: 0, q1: 5, median: 10, q3: 15, max: 20 } }
      ]
    });
    var boxes = stub.rects
      .filter(function (r) { return r.stroke && r.w < 200 && r.h < 100; })
      .sort(function (a, b) { return a.y - b.y; });
    expect(boxes.length).toBe(2);
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  });

  it('skips boxes with non-finite five-num components', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawBoxplot(stub, {
      datasets: [
        { label: 'A', five: { min: NaN, q1: 5, median: 10, q3: 15, max: 20 } },
        { label: 'B', five: { min: 0,   q1: 5, median: 10, q3: 15, max: 20 } }
      ]
    });
    var boxRects = stub.rects.filter(function (r) {
      return r.stroke && r.w < 200 && r.h < 100;
    });
    expect(boxRects.length).toBe(1);
  });

  it('renders a title when provided', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawBoxplot(stub, {
      five: { min: 0, q1: 1, median: 2, q3: 3, max: 4 },
      title: 'Box Test'
    });
    var titleText = stub.texts.find(function (t) { return t.text === 'Box Test'; });
    expect(titleText).toBeDefined();
  });

  it('handles a degenerate five-num where all values equal', function () {
    var stub = makeCtxStub(300, 200);
    expect(function () {
      Ti84Plot.drawBoxplot(stub, { five: { min: 5, q1: 5, median: 5, q3: 5, max: 5 } });
    }).not.toThrow();
  });
});

// ── drawNormalCurve ────────────────────────────────────────────────────────

describe('Ti84Plot.drawNormalCurve', function () {
  var Ti84Plot;

  beforeEach(function () { Ti84Plot = loadTi84Plot(); });

  it('attaches drawNormalCurve to the public API', function () {
    expect(typeof Ti84Plot.drawNormalCurve).toBe('function');
  });

  it('does not throw on null opts or missing ctx', function () {
    var stub = makeCtxStub();
    expect(function () { Ti84Plot.drawNormalCurve(stub, null); }).not.toThrow();
    expect(function () { Ti84Plot.drawNormalCurve(null, {}); }).not.toThrow();
  });

  it('defaults to a standard normal (mean=0, sd=1) and draws the curve', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawNormalCurve(stub, {});
    // The curve is one polyline stroked once -- expect at least one stroke()
    // and many moveTo/lineTo (sampled along the domain).
    expect(stub.strokes).toBeGreaterThanOrEqual(2); // axes + curve at minimum
    var lineToCount = stub.lines.filter(function (l) { return l.type === 'lineTo'; }).length;
    expect(lineToCount).toBeGreaterThan(20);
  });

  it('returns silently when sd <= 0 without drawing the curve', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawNormalCurve(stub, { mean: 0, sd: 0 });
    // Frame still drawn, but no curve polyline -> very few lineTo entries.
    var lineToCount = stub.lines.filter(function (l) { return l.type === 'lineTo'; }).length;
    expect(lineToCount).toBeLessThan(10);
  });

  it('shading produces at least one filled region (closed path + fill)', function () {
    var stubNo = makeCtxStub(300, 200);
    var stubYes = makeCtxStub(300, 200);
    // Track fill() calls explicitly on each stub.
    var fillsNo = 0, fillsYes = 0;
    stubNo.fill  = function () { fillsNo++; };
    stubYes.fill = function () { fillsYes++; };

    Ti84Plot.drawNormalCurve(stubNo,  { mean: 0, sd: 1 });
    Ti84Plot.drawNormalCurve(stubYes, { mean: 0, sd: 1, shadeLow: -1, shadeHigh: 1 });

    // The shaded version must have at least one more fill() than the unshaded.
    expect(fillsYes).toBeGreaterThan(fillsNo);
  });

  it('shadeLow only (no shadeHigh) shades the right tail', function () {
    var stub = makeCtxStub(300, 200);
    var fills = 0;
    stub.fill = function () { fills++; };
    Ti84Plot.drawNormalCurve(stub, { mean: 0, sd: 1, shadeLow: 1.5 });
    expect(fills).toBeGreaterThanOrEqual(1);
  });

  it('shadeHigh only (no shadeLow) shades the left tail', function () {
    var stub = makeCtxStub(300, 200);
    var fills = 0;
    stub.fill = function () { fills++; };
    Ti84Plot.drawNormalCurve(stub, { mean: 0, sd: 1, shadeHigh: -1.5 });
    expect(fills).toBeGreaterThanOrEqual(1);
  });

  it('renders title when provided', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawNormalCurve(stub, { mean: 100, sd: 15, title: 'IQ Scores' });
    var titleText = stub.texts.find(function (t) { return t.text === 'IQ Scores'; });
    expect(titleText).toBeDefined();
  });

  it('labels the x-axis at multiples of sd from the mean (default range)', function () {
    var stub = makeCtxStub(300, 200);
    Ti84Plot.drawNormalCurve(stub, { mean: 100, sd: 15 });
    // +/- 3 sd: 55, 70, 85, 100, 115, 130, 145
    var marks = ['55', '70', '85', '100', '115', '130', '145'];
    marks.forEach(function (m) {
      var hit = stub.texts.some(function (t) { return t.text === m; });
      expect(hit).toBe(true);
    });
  });

  it('respects xMin / xMax overrides for the plot domain', function () {
    var stub = makeCtxStub(300, 200);
    expect(function () {
      Ti84Plot.drawNormalCurve(stub, { mean: 0, sd: 1, xMin: -2, xMax: 2 });
    }).not.toThrow();
    // -3 sd label should NOT appear since it's outside the [-2, 2] domain.
    var hasMinus3 = stub.texts.some(function (t) { return t.text === '-3.0' || t.text === '-3'; });
    expect(hasMinus3).toBe(false);
  });
});

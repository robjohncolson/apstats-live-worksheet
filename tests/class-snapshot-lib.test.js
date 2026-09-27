// tests/class-snapshot-lib.test.js — CLASS_SNAPSHOT_SPEC.md: the shared "Where you stand"
// renderer (lib/class-snapshot.js). Pure math (AP/TI-84 quartiles, stems, bins, shape, mode
// unlock, captions) plus a draw() smoke on a recording 2D context.
import { describe, it, expect, beforeAll } from 'vitest';

let C;
beforeAll(async () => {
  await import('../lib/class-snapshot.js');   // installs globalThis.ClassSnapshot
  C = globalThis.ClassSnapshot;
});

const PERIOD_B = [31, 37, 39, 50, 61, 92, 97, 97, 99, 99, 100, 100, 100, 100, 100];

describe('five-number summary (TI-84 method: halves exclude the median when n is odd)', () => {
  it('Period B on 2026-09-26', () => {
    expect(C.fiveNumber(PERIOD_B)).toEqual({ min: 31, q1: 50, median: 97, q3: 100, max: 100 });
    expect(C.fences(C.fiveNumber(PERIOD_B))).toEqual({ iqr: 50, low: -25, high: 175 });
    expect(C.outliers(PERIOD_B)).toEqual([]);            // 31 is below Q1 but NOT an outlier
  });
  it('even n, single value, empty, unsorted input', () => {
    expect(C.fiveNumber([4, 1, 3, 2])).toEqual({ min: 1, q1: 1.5, median: 2.5, q3: 3.5, max: 4 });
    expect(C.fiveNumber([5])).toEqual({ min: 5, q1: 5, median: 5, q3: 5, max: 5 });
    expect(C.fiveNumber([])).toBeNull();
    expect(C.fiveNumber(['7', null, 'x', 3])).toEqual({ min: 3, q1: 3, median: 5, q3: 7, max: 7 });
  });
  it('flags a real outlier by the 1.5×IQR rule', () => {
    expect(C.outliers([10, 90, 92, 94, 96, 98, 100])).toEqual([10]);
  });
});

describe('graph helpers', () => {
  it('stems by tens include empty stems and put 100 on stem 10', () => {
    expect(C.stems([31, 37, 50, 97, 100])).toEqual([
      { stem: 3, leaves: [1, 7] }, { stem: 4, leaves: [] }, { stem: 5, leaves: [0] }, { stem: 6, leaves: [] },
      { stem: 7, leaves: [] }, { stem: 8, leaves: [] }, { stem: 9, leaves: [7] }, { stem: 10, leaves: [0] },
    ]);
  });
  it('bins round to integers and cap bonus grades at 100', () => {
    expect(C.bins([99.6, 100, 103.3, 31.2])).toEqual({ 100: 3, 31: 1 });
  });
  it('shape uses the mean-vs-median rule the course teaches', () => {
    expect(C.shape(PERIOD_B)).toBe('skewed left');
    expect(C.shape([90, 95, 100, 105, 110])).toBe('roughly symmetric');
    expect(C.shape([50, 52, 54, 56, 100])).toBe('skewed right');
    expect(C.shape([1, 2])).toBe('too few values to describe');
  });
});

describe('mode follows the section\'s pacing', () => {
  const LESSONS = [
    { lessonKey: '1.5', due: { B: '2026-09-14', E: '2026-09-15' } },
    { lessonKey: '1.8', due: { B: '2026-09-30', E: '2026-10-01' } },
  ];
  it('before 1.5: dot plot only, no tabs', () => {
    expect(C.mode(LESSONS, 'B', '2026-09-10')).toEqual({ available: ['dot'], default: 'dot', tabs: false });
  });
  it('after 1.5, before 1.8: dot + stem + histogram, stem is the default', () => {
    expect(C.mode(LESSONS, 'B', '2026-09-26')).toEqual({ available: ['dot', 'stem', 'hist'], default: 'stem', tabs: true });
  });
  it('after 1.8: all three, box plot is the default; period E uses its own dates', () => {
    expect(C.mode(LESSONS, 'B', '2026-09-30').default).toBe('box');
    expect(C.mode(LESSONS, 'E', '2026-09-30').default).toBe('stem');
    expect(C.mode(LESSONS, 'E', '2026-10-01').default).toBe('box');
  });
  it('tolerates a missing cache', () => {
    expect(C.mode(null, 'B', '2026-09-26').default).toBe('dot');
  });
});

describe('captions', () => {
  it('box mode: five-number summary, where you sit, the gap line when there is a gap', () => {
    expect(C.caption({ values: PERIOD_B, own: 31, mode: 'box', hasGap: true }))
      .toBe('Five-number summary 31 · 50 · 97 · 100 · 100 (IQR 50). You: 31 — below Q1. The list below is the gap.');
    expect(C.caption({ values: PERIOD_B, own: 100, mode: 'box', hasGap: false }))
      .toBe('Five-number summary 31 · 50 · 97 · 100 · 100 (IQR 50). You: 100 — inside the box. Every score here can still move.');
  });
  it('names an outlier by the 1.5×IQR rule and cites the lesson', () => {
    expect(C.caption({ values: [10, 90, 92, 94, 96, 98, 100], own: 10, mode: 'box', hasGap: true }))
      .toContain('an outlier by the 1.5×IQR rule (lesson 1.7)');
  });
  it('dot/stem mode: shape and median, your value, no five-number summary', () => {
    expect(C.caption({ values: PERIOD_B, own: 31, mode: 'stem', hasGap: true }))
      .toBe('Shape: skewed left. Median 97. You: 31. The list below is the gap.');
  });
  it('teacher view (no own value) omits the "You:" sentence; empty data explains itself', () => {
    expect(C.caption({ values: PERIOD_B, mode: 'dot', hasGap: false })).toBe('Shape: skewed left. Median 97. Every score here can still move.');
    expect(C.caption({ values: [], own: 31, mode: 'dot' })).toBe('Not enough classmates yet for a class picture.');
  });
});

describe('draw() on a recording context', () => {
  function recordingCanvas() {
    const calls = [];
    const ctx = new Proxy({ font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1 }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
        return (...args) => { calls.push([k, ...args]); };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    return { canvas: { width: 300, height: 120, getContext: () => ctx }, calls };
  }
  it.each(['dot', 'stem', 'hist', 'box'])('%s mode draws without throwing and marks "you"', (mode) => {
    const { canvas, calls } = recordingCanvas();
    C.draw(canvas, { values: PERIOD_B, own: 31, mode });
    const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    expect(texts).toContain(mode === 'stem' ? 'key: 9 | 7 = 97 · red leaf = you' : 'you');
  });
  it('the teacher view (no own value) never writes "you"; empty data writes the placeholder', () => {
    const a = recordingCanvas();
    C.draw(a.canvas, { values: PERIOD_B, mode: 'box' });
    expect(a.calls.filter(c => c[0] === 'fillText').map(c => c[1])).not.toContain('you');
    const b = recordingCanvas();
    C.draw(b.canvas, { values: [], own: 31, mode: 'dot' });
    expect(b.calls.filter(c => c[0] === 'fillText').map(c => c[1])).toContain('Not enough classmates yet');
  });
  it('tolerates a canvas with no 2D context', () => {
    expect(() => C.draw({ width: 10, height: 10, getContext: () => null }, { values: PERIOD_B, mode: 'dot' })).not.toThrow();
    expect(() => C.draw(null, { values: PERIOD_B })).not.toThrow();
  });
});

describe('per-assignment forms (teacher 2026-09-26: "stem and leaf, dotplot, and histogram models as well")', () => {
  const V = [0, 0, 0, 85, 88, 91, 95, 97, 100, 100, 100, 100, 100, 100, 100];
  it('histogram bins are left-closed tens with 100 (and bonus) in the top bin', () => {
    expect(C.histBins([0, 5, 10, 99, 100, 105]).map(b => b.count)).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 3]);
    expect(C.histBins(V)[9]).toEqual({ lo: 90, hi: 100, count: 10 });
  });
  it('miniHeight grows the stem-and-leaf canvas with the number of stems', () => {
    expect(C.miniHeight('box', V)).toBe(26);
    expect(C.miniHeight('hist', V)).toBe(60);
    expect(C.miniHeight('stem', [31, 100])).toBe(8 * 11 + 14);     // stems 3..10
  });
  it.each(['box', 'dot', 'hist', 'stem'])('drawMini %s draws without throwing and marks "you"', (mode) => {
    const calls = [];
    const ctx = new Proxy({ font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1 }, {
      get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return (s) => ({ width: String(s).length * 6 }); return (...a) => { calls.push([k, ...a]); }; },
      set(t, k, v) { t[k] = v; return true; },
    });
    C.drawMini({ width: 300, height: C.miniHeight(mode, V), getContext: () => ctx }, { values: V, own: 0, mode });
    const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    expect(mode === 'stem' ? texts.some(x => /red leaf = you/.test(x)) : mode === 'box' ? calls.some(c => c[0] === 'arc') : texts.includes('you')).toBe(true);
  });
  it('an IQR of 0 gets its sentence in the caption', () => {
    expect(C.assignmentCaption({ values: [0, 100, 100, 100, 100, 100, 100, 100], zeros: 1 }, 0))
      .toBe('Median 100 · IQR 0 · 1 zero. More than half the class has the same score, so every other score counts as an outlier. You: 0 — below Q1 — an outlier by the 1.5×IQR rule.');
  });
});

describe('the red "you" mark when the viewer is not in the pool (teacher 2026-09-26)', () => {
  const V = [50, 60, 70, 80, 90, 95, 97, 100];
  function record(mode, own) {
    const calls = [];
    const ctx = new Proxy({ font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1 }, {
      get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return (s) => ({ width: String(s).length * 6 }); return (...a) => { calls.push([k, t.fillStyle, ...a]); }; },
      set(t, k, v) { t[k] = v; return true; },
    });
    C.drawMini({ width: 300, height: C.miniHeight(mode, V, own), getContext: () => ctx }, { values: V, own, mode });
    return calls;
  }
  it('dot plot: a red dot labelled "you" appears even for a score nobody in the pool has', () => {
    const calls = record('dot', 0);
    expect(calls.filter(c => c[0] === 'arc').length).toBe(V.length + 1);
    expect(calls.some(c => c[0] === 'fillText' && c[2] === 'you' && c[1] === '#cc0000')).toBe(true);
  });
  it('stem-and-leaf: a red leaf is added on its own stem, and the canvas grows to hold that stem', () => {
    expect(C.miniHeight('stem', V, 0)).toBe(11 * 11 + 14);      // stems 0..10 once "you" = 0 is included
    expect(C.miniHeight('stem', V, 97)).toBe(6 * 11 + 14);      // 97 is already in the pool: stems 5..10
    const calls = record('stem', 0);
    const redLeaves = calls.filter(c => c[0] === 'fillText' && c[1] === '#cc0000' && c[2] === '0');
    expect(redLeaves.length).toBe(1);
  });
  it('a score already in the pool is marked, never duplicated', () => {
    expect(record('dot', 97).filter(c => c[0] === 'arc').length).toBe(V.length);
  });
});

describe('a 0 that sits at Q1 (teacher 2026-09-26: "all datapoints are 100 or 0, so even my zero is within the IQR")', () => {
  it('names why the 0 is inside the box instead of calling it fine', () => {
    const a = { values: [0, 0, 0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], zeros: 4 };
    expect(C.assignmentCaption(a, 0)).toBe('Median 100 · IQR 100 · 4 zeros. You: 0 — inside the box only because at least a quarter of the class is also at 0, so Q1 itself is 0.');
    expect(C.assignmentCaption(a, 100)).toBe('Median 100 · IQR 100 · 4 zeros. You: 100 — inside the box.');
  });
});

describe('tentative zeros (TENTATIVE_ZEROS_SPEC §2)', () => {
  const YELLOW = '#f5d76e', TINK = '#8a6d00', RED = '#cc0000';
  // 20 real scores in the 80s–100s, so 3 zeros are outliers even inside the display distribution.
  const HIGH = [80, 82, 84, 85, 86, 88, 90, 90, 92, 94, 95, 95, 96, 97, 98, 99, 100, 100, 100, 100];
  function record(mode, opts) {
    const calls = [];
    const ctx = new Proxy({ font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1 }, {
      get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return (s) => ({ width: String(s).length * 6 }); return (...a) => { calls.push([k, t.fillStyle, ...a]); }; },
      set(t, k, v) { t[k] = v; return true; },
    });
    const h = C.miniHeight(mode, opts.values, opts.own, opts.tentativeZeros);
    C.drawMini({ width: 300, height: h, getContext: () => ctx }, { mode, ...opts });
    return calls;
  }
  const count = (calls, op, color) => calls.filter(c => c[0] === op && c[1] === color).length;
  const OPTS = { values: HIGH, tentativeZeros: 3, own: 0, ownTentative: true };

  it('dot plot: 2 yellow dots + 1 red (the viewer is one of the 3 tentative zeros)', () => {
    const calls = record('dot', OPTS);
    expect(count(calls, 'fill', YELLOW)).toBe(2);
    expect(count(calls, 'fill', RED)).toBe(1);
    expect(calls.filter(c => c[0] === 'fill').length).toBe(HIGH.length + 3);   // nobody drawn twice
  });
  it('stem-and-leaf: stem 0 holds 2 yellow leaves + 1 red leaf; the key names yellow', () => {
    const calls = record('stem', OPTS);
    expect(count(calls, 'fillText', TINK)).toBe(2);
    expect(calls.filter(c => c[0] === 'fillText' && c[1] === RED && c[2] === '0').length).toBe(1);
    expect(calls.some(c => c[0] === 'fillText' && /yellow = tentative 0/.test(c[2]))).toBe(true);
  });
  it('histogram: bin 0 = one yellow segment on top of nothing real; the count label is the bin total; the red dot as today', () => {
    const calls = record('hist', OPTS);
    expect(count(calls, 'fillRect', YELLOW)).toBe(1);
    expect(count(calls, 'fill', RED)).toBe(1);
    expect(calls.some(c => c[0] === 'fillText' && c[2] === '3')).toBe(true);
  });
  it('histogram: a mixed bin 0 splits into a real segment and a yellow one stacked on top', () => {
    const calls = record('hist', { values: [0, 0, ...HIGH], tentativeZeros: 3 });
    const rects = calls.filter(c => c[0] === 'fillRect');
    const yellow = rects.find(c => c[1] === YELLOW), white = rects.find(c => c[1] === '#ffffff' && c[2] === rects[0][2]);
    expect(yellow[3]).toBeLessThan(white[3]);                                  // yellow sits above (smaller y)
    expect(calls.some(c => c[0] === 'fillText' && c[2] === '5')).toBe(true);   // 2 real + 3 tentative
  });
  it('box plot: one yellow tentative dot below the line, the red dot, and a real-zero dot when mixed', () => {
    const calls = record('box', OPTS);
    expect(count(calls, 'fill', YELLOW)).toBe(1);
    expect(count(calls, 'fill', RED)).toBe(1);
    const mixed = record('box', { values: [0, ...HIGH], tentativeZeros: 2 });
    expect(count(mixed, 'fill', YELLOW)).toBe(1);
    expect(count(mixed, 'fill', '#fff')).toBe(1);
  });
  it('a lone tentative 0 that is the viewer draws red only, never yellow too', () => {
    for (const mode of ['dot', 'stem', 'box', 'hist']) {
      const calls = record(mode, { values: HIGH, tentativeZeros: 1, own: 0, ownTentative: true });
      expect(count(calls, 'fill', YELLOW) + count(calls, 'fillText', TINK) + count(calls, 'fillRect', YELLOW)).toBe(0);
    }
  });
  it('histogram: the viewer\'s tentative 0 is a red slice at the top of the yellow segment, same bin height', () => {
    const calls = record('hist', OPTS);                       // 3 tentative, one of them the viewer
    expect(count(calls, 'fillRect', RED)).toBe(1);
    expect(count(calls, 'fillRect', YELLOW)).toBe(1);
    const red = calls.find(c => c[0] === 'fillRect' && c[1] === RED);
    const yellow = calls.find(c => c[0] === 'fillRect' && c[1] === YELLOW);
    expect(red[3]).toBeLessThan(yellow[3]);                    // red on top
    expect(red[3] + red[5]).toBe(yellow[3]);                   // flush: no gap, no overlap
    expect(calls.some(c => c[0] === 'fillText' && c[2] === '3')).toBe(true);   // bin total unchanged
    const lone = record('hist', { values: HIGH, tentativeZeros: 1, own: 0, ownTentative: true });
    expect(count(lone, 'fillRect', RED)).toBe(1);
    expect(count(lone, 'fillRect', YELLOW)).toBe(0);
  });
  it('dot plot: a tall pile of zeros (W14: 7 scores + 11 tentative, own 0 tentative) stays inside the canvas', () => {
    const W14 = [88, 92, 95, 100, 100, 100, 102];
    const opts = { values: W14, tentativeZeros: 11, own: 0, ownTentative: true };
    const height = C.miniHeight('dot', W14, 0, 11);
    expect(height).toBeGreaterThan(44);
    expect(height).toBeLessThanOrEqual(120);
    const calls = record('dot', opts);
    const arcs = calls.filter(c => c[0] === 'arc');
    expect(arcs.length).toBe(18);
    for (const a of arcs) { expect(a[3]).toBeGreaterThanOrEqual(0); expect(a[3]).toBeLessThanOrEqual(height); }
    // arc is recorded before dot() sets its fill; the red dot's fill call follows its arc
    expect(count(calls, 'fill', RED)).toBe(1);
    const you = calls.find(c => c[0] === 'fillText' && c[2] === 'you');
    expect(you[4]).toBeGreaterThanOrEqual(0); expect(you[4]).toBeLessThanOrEqual(height);
  });
  it('dot plot: even on a too-short canvas every stacked dot stays inside [0, H]', () => {
    const calls = [];
    const ctx = new Proxy({ font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1 }, {
      get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return (s) => ({ width: String(s).length * 6 }); return (...a) => { calls.push([k, t.fillStyle, ...a]); }; },
      set(t, k, v) { t[k] = v; return true; },
    });
    C.drawMini({ width: 300, height: 44, getContext: () => ctx }, { values: [88, 92, 95, 100, 100, 100, 102], tentativeZeros: 11, own: 0, ownTentative: true, mode: 'dot' });
    const arcs = calls.filter(c => c[0] === 'arc');
    expect(arcs.length).toBe(18);
    for (const a of arcs) { expect(a[3]).toBeGreaterThanOrEqual(0); expect(a[3]).toBeLessThanOrEqual(44); }
  });
  it('small-n uses the display distribution: 2 real + 3 tentative draws; 2 + 2 says n < 5', () => {
    expect(record('box', { values: [90, 100], tentativeZeros: 3 }).some(c => c[2] === 'n < 5')).toBe(false);
    expect(record('box', { values: [90, 100], tentativeZeros: 2 }).some(c => c[2] === 'n < 5')).toBe(true);
  });
  it('miniHeight counts stem 0 when tentative zeros exist', () => {
    expect(C.miniHeight('stem', [50, 60, 70, 80, 90, 100], 0, 2)).toBe(11 * 11 + 14);       // stems 0..10
    expect(C.miniHeight('stem', [50, 60, 70, 80, 90, 100], null, 2)).toBe(11 * 11 + 14);
    expect(C.miniHeight('stem', [50, 60, 70, 80, 90, 100])).toBe(6 * 11 + 14);             // unchanged without
  });
  it('caption: statistics from D and the "zeros + tentative (label)" phrase', () => {
    const a = { values: [0, 0, 0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], zeros: 4, tentativeZeros: 11 };
    expect(C.assignmentCaption(a, undefined, { tentativeLabel: 'real after Sun 9/27' }))
      .toBe('Median 100 · IQR 100 · 4 zeros + 11 tentative (real after Sun 9/27).');
    expect(C.assignmentCaption({ values: [90, 95, 100, 100], zeros: 1, tentativeZeros: 1 }, undefined))
      .toBe('Median 95 · IQR 55 · 1 zero + 1 tentative.');
    expect(C.assignmentCaption({ values: [90, 95, 100, 100, 100], zeros: 0, tentativeZeros: 0 }, undefined))
      .toBe('Median 100 · IQR 7.5 · 0 zeros.');
  });
  it('caption: the viewer\'s tentative 0 is named as tentative; the 0-at-Q1 sentence still applies', () => {
    const a = { values: [100, 100, 100, 100, 100, 100], zeros: 0, tentativeZeros: 3 };
    expect(C.assignmentCaption(a, null, { tentativeLabel: 'real after Mon 9/28', ownTentative: true }))
      .toBe('Median 100 · IQR 100 · 0 zeros + 3 tentative (real after Mon 9/28). You: 0 (tentative) — inside the box only because at least a quarter of the class is also at 0, so Q1 itself is 0.');
    const b = { values: HIGH, zeros: 0, tentativeZeros: 2 };
    expect(C.assignmentCaption(b, null, { ownTentative: true })).toMatch(/^Median .* · 0 zeros \+ 2 tentative\. You: 0 \(tentative\) — below Q1 — an outlier by the 1\.5×IQR rule\.$/);
  });
});

describe('scoreListWords — the pooled periods by name (EFFORT_VISIBILITY_V2_SPEC §2)', () => {
  it('two, one, three, none', () => {
    expect(C.scoreListWords(['PeriodB', 'PeriodE'])).toEqual({ from: ' from Period B and Period E together', who: 'students across both periods',
      one: 'one student in Period B or E', heading: 'Both periods on your first item' });
    expect(C.scoreListWords(['PeriodE'])).toEqual({ from: ' from Period E', who: 'students in Period E', one: 'one student in Period E', heading: 'Period E on your first item' });
    expect(C.scoreListWords(['PeriodA', 'PeriodB', 'PeriodE']).one).toBe('one student in Period A, B or E');
    expect(C.scoreListWords(['PeriodA', 'PeriodB', 'PeriodE']).who).toBe('students across all 3 periods');
    expect(C.scoreListWords(null)).toEqual({ from: '', who: 'classmates', one: 'one classmate', heading: 'The class on your first item' });
    expect(C.scoreListWords(['all'])).toEqual(C.scoreListWords([]));
  });
});

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
  it('after 1.5, before 1.8: dot + stem, stem is the default', () => {
    expect(C.mode(LESSONS, 'B', '2026-09-26')).toEqual({ available: ['dot', 'stem'], default: 'stem', tabs: true });
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
  it.each(['dot', 'stem', 'box'])('%s mode draws without throwing and marks "you"', (mode) => {
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

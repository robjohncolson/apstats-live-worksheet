// Pins the trainer's "expected answer" engine to values a real TI-84 produces.
//
// ti84-reference-values.json holds scipy-computed results (a faithful proxy for
// the TI-84 Plus CE display) for every canonical problem that has verification
// fields. This test runs the same stat-math.js the trainer uses, through the
// same routing computeExpected() uses, and asserts every verification field
// matches the TI reference within a tight tolerance — AND, critically, that a
// student who reads the calculator's rounded value off the screen is accepted
// by the trainer's actual valuesMatch() tolerance.
//
// This is the regression guard for "Check your answer says I'm wrong even
// though the calculator is right" (2026-06-12). Keep it green.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'ti84-trainer-v2');

let SM;
let patterns;
let reference;

beforeAll(() => {
  const code = fs.readFileSync(path.join(V2, 'native', 'stat-math.js'), 'utf-8');
  const fakeWindow = {};
  new Function('window', 'module', code)(fakeWindow, { exports: {} });
  SM = fakeWindow.TI84StatMath;
  patterns = JSON.parse(fs.readFileSync(path.join(ROOT, 'ti84-pattern-recognition-data.json'), 'utf-8'));
  reference = JSON.parse(fs.readFileSync(path.join(__dirname, 'ti84-reference-values.json'), 'utf-8'));
});

// Faithful mirror of app.js computeExpected() routing. The math lives in
// stat-math.js; this is only the dispatch.
function computeExpected(procedureId, v) {
  const singleData = Array.isArray(v.data) && !Array.isArray(v.data[0]) ? v.data
    : Array.isArray(v.L1) ? v.L1 : null;
  const xValues = Array.isArray(v.L1) ? v.L1
    : Array.isArray(v.x_values) ? v.x_values
    : Array.isArray(v.xValues) ? v.xValues : null;
  const yValues = Array.isArray(v.L2) ? v.L2
    : Array.isArray(v.y_values) ? v.y_values
    : Array.isArray(v.yValues) ? v.yValues : null;
  const observedMatrix = Array.isArray(v.observed) && Array.isArray(v.observed[0]) ? v.observed
    : Array.isArray(v.matrix) ? v.matrix : null;
  const sigma = v.sigma_xbar ?? v.sigma ?? 1;
  const trials = v.trials ?? v.n;

  switch (procedureId) {
    case 'one-var-stats': return singleData ? SM.oneVarStats(singleData) : null;
    case 't-test-data': { const s = singleData ? SM.oneVarStats(singleData) : null; return s ? SM.tTest(v.mu0, s.xbar, s.Sx, s.n, v.direction) : null; }
    case 't-test-stats': return SM.tTest(v.mu0, v.xbar, v.sx, v.n, v.direction);
    case 't-interval-data': { const s = singleData ? SM.oneVarStats(singleData) : null; return s ? SM.tInterval(s.xbar, s.Sx, s.n, v.cLevel) : null; }
    case 't-interval-stats': return SM.tInterval(v.xbar, v.sx, v.n, v.cLevel);
    case 'one-propztest': return SM.onePropZTest(v.p0, v.x, v.n, v.direction);
    case 'one-propzint': return SM.onePropZInt(v.x, v.n, v.cLevel);
    case 'two-propztest': return SM.twoPropZTest(v.x1, v.n1, v.x2, v.n2, v.direction);
    case 'two-propzint': return SM.twoPropZInt(v.x1, v.n1, v.x2, v.n2, v.cLevel);
    case 'chi-square-gof-test': {
      const expected = Array.isArray(v.expected) ? v.expected
        : Array.isArray(v.expected_counts) ? v.expected_counts
        : Array.isArray(v.expected_proportions) && Number.isFinite(v.n) ? v.expected_proportions.map((e) => e * v.n) : null;
      return Array.isArray(v.observed) && Array.isArray(expected) ? SM.chi2GOFTest(v.observed, expected, v.df) : null;
    }
    case 'chi-square-test': return observedMatrix ? SM.chi2Test(observedMatrix) : null;
    case 'linreg-a-plus-bx': return xValues && yValues ? SM.linReg(xValues, yValues) : null;
    case 'linreg-ttest': return xValues && yValues ? SM.linRegTTest(xValues, yValues, null, v.direction) : null;
    case 'linreg-tint': return xValues && yValues ? SM.linRegTInt(xValues, yValues, null, v.cLevel) : null;
    case 'two-samp-ttest': return SM.twoSampTTest(v.xbar1 ?? v.x1, v.sx1 ?? v.s1, v.n1, v.xbar2 ?? v.x2, v.sx2 ?? v.s2, v.n2, v.direction, false);
    case 'two-samp-tint': return SM.twoSampTInt(v.xbar1 ?? v.x1, v.sx1 ?? v.s1, v.n1, v.xbar2 ?? v.x2, v.sx2 ?? v.s2, v.n2, v.cLevel, false);
    case 'normalcdf': case 'normalcdf-sampling': return { value: SM.normalcdf(v.lower, v.upper, v.mu ?? 0, sigma) };
    case 'invnorm': case 'invnorm-sampling': return { value: SM.invNorm(v.area, v.mu ?? 0, sigma, v.tail ?? 'left') };
    case 'binompdf': return Number.isFinite(trials) ? { value: SM.binompdf(trials, v.p, v.x) } : null;
    case 'binomcdf': return Number.isFinite(trials) ? { value: SM.binomcdf(trials, v.p, v.x) } : null;
    case 'geometpdf': return { value: SM.geometpdf(v.p, v.x) };
    case 'geometcdf': return { value: SM.geometcdf(v.p, v.x) };
    default: return null;
  }
}

// Mirror of app.js valuesMatch() — rounding-resilient matching.
function typedDecimalPlaces(s) {
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return s.slice(dot + 1).replace(/0+$/, '').length;
}
function valuesMatch(typed, expected) {
  const normalized = `${typed}`.trim().replace(/\(-\)/g, '-').replace(/\s+/g, '');
  const a = parseFloat(normalized);
  if (Number.isNaN(a) || typeof expected !== 'number' || Number.isNaN(expected)) return false;
  if (expected === 0) return Math.abs(a) < 0.005;
  const decimals = typedDecimalPlaces(normalized);
  if (decimals > 0 || Math.abs(expected) >= 1) {
    const f = Math.pow(10, decimals);
    const sc = expected * f;
    const cands = [Math.round(sc), Math.floor(sc), Math.ceil(sc), Math.trunc(sc)];
    if (cands.some((c) => Math.abs(a - c / f) <= 1e-7)) return true;
  }
  return Math.abs(a - expected) <= Math.max(0.005 * Math.abs(expected), 0.0005);
}

// How a student reads the TI screen: ~4 significant figures.
function studentReads(value) {
  if (value === 0) return '0';
  return Number(value.toPrecision(4)).toString();
}

// The ways a student plausibly writes a value down off the calculator screen.
// For values >= 1 that includes whole-number rounding; for sub-1 values
// (proportions, p-values) a student keeps enough decimals to retain the value's
// significant figures — nobody writes "0.0" for p = 0.0152.
function studentRenderings(value) {
  const out = new Set([String(value)]);
  const mag = Math.abs(value);
  if (mag >= 1) {
    out.add(value.toFixed(1));
    out.add(value.toFixed(2));
    out.add(value.toFixed(3));
    out.add(String(Math.round(value)));
    out.add(String(Math.trunc(value)));
    out.add(String(Math.ceil(value)));
    out.add(String(Math.floor(value)));
  } else if (mag > 0) {
    const base = 2 - Math.floor(Math.log10(mag)); // decimals that keep ~3 sig figs
    out.add(value.toFixed(base));
    out.add(value.toFixed(base + 1));
    out.add(value.toFixed(Math.max(1, base - 1)));
  }
  return [...out];
}

describe('trainer expected answers match the real TI-84', () => {
  it('every canonical problem has a baked reference entry', () => {
    expect(reference.length).toBeGreaterThan(50);
  });

  it('engine output matches the TI reference within 0.05% for every field', () => {
    const failures = [];
    for (const entry of reference) {
      const problems = patterns.canonicalProblems[entry.procId];
      const problem = problems[entry.idx];
      const computed = computeExpected(entry.procId, problem.values);
      for (const [field, refVal] of Object.entries(entry.ref)) {
        const ours = computed?.[field];
        if (typeof ours !== 'number') {
          failures.push(`${entry.procId}#${entry.idx} [${field}]: engine returned ${ours}`);
          continue;
        }
        const abs = Math.abs(ours - refVal);
        const rel = abs / Math.max(Math.abs(refVal), 1e-9);
        // Near-zero p-values (< 1e-6) are indistinguishable from 0 to any
        // student and to the baked fixture's 8-decimal rounding, so an absolute
        // floor matters there more than the relative gap.
        if (rel > 0.0005 && abs > 1e-6) {
          failures.push(`${entry.procId}#${entry.idx} [${field}]: ours=${ours} ref=${refVal} rel=${(rel * 100).toFixed(4)}%`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('a student who reads the TI value off the screen is ACCEPTED by valuesMatch', () => {
    const rejected = [];
    for (const entry of reference) {
      const problems = patterns.canonicalProblems[entry.procId];
      const problem = problems[entry.idx];
      const computed = computeExpected(entry.procId, problem.values);
      for (const [field, refVal] of Object.entries(entry.ref)) {
        const ours = computed?.[field];
        const typed = studentReads(refVal); // what the student sees on the ROM and types
        if (!valuesMatch(typed, ours)) {
          rejected.push(`${entry.procId}#${entry.idx} [${field}]: typed ${typed}, expected ${ours}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it('ANY reasonable rounding the student writes (1/2/3 decimals, round, truncate, whole) is accepted', () => {
    const rejected = [];
    for (const entry of reference) {
      const problems = patterns.canonicalProblems[entry.procId];
      const problem = problems[entry.idx];
      const computed = computeExpected(entry.procId, problem.values);
      for (const [field, refVal] of Object.entries(entry.ref)) {
        const ours = computed?.[field];
        for (const typed of studentRenderings(refVal)) {
          if (!valuesMatch(typed, ours)) {
            rejected.push(`${entry.procId}#${entry.idx} [${field}]: typed "${typed}", expected ${ours}`);
          }
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it('a clearly wrong value (off by a large margin) is still REJECTED', () => {
    const leaked = [];
    for (const entry of reference) {
      const problems = patterns.canonicalProblems[entry.procId];
      const problem = problems[entry.idx];
      const computed = computeExpected(entry.procId, problem.values);
      for (const [field, refVal] of Object.entries(entry.ref)) {
        const ours = computed?.[field];
        if (typeof ours !== 'number') continue;
        // A genuinely different read: off by more than one whole unit and >5%.
        const wrong = ours + (Math.abs(ours) > 1 ? Math.abs(ours) * 0.5 + 1 : 0.5);
        if (valuesMatch(wrong.toFixed(4), ours)) {
          leaked.push(`${entry.procId}#${entry.idx} [${field}]: accepted wrong ${wrong}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });
});

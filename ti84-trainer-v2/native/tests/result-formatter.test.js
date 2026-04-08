/**
 * Tests for TI84ResultFormatter — verifies result screen formatting
 * against expected TI-84 Plus CE output.
 *
 * Run: npx vitest run ti84-trainer-v2/native/tests/result-formatter.test.js
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let RF;  // ResultFormatter
let SM;  // StatMath (for verifying formatTI integration)

beforeAll(() => {
  // Load dependencies in order: stat-math first, then field-tables, then result-formatter.
  // Each IIFE attaches to window (jsdom provides one) and module.exports.
  const smCode = readFileSync(resolve(__dirname, '..', 'stat-math.js'), 'utf-8');
  const ftCode = readFileSync(resolve(__dirname, '..', 'field-tables.js'), 'utf-8');
  const rfCode = readFileSync(resolve(__dirname, '..', 'result-formatter.js'), 'utf-8');

  const fakeWindow = {};
  const fakeModuleSM = { exports: {} };
  const fakeModuleFT = { exports: {} };
  const fakeModuleRF = { exports: {} };

  // StatMath
  new Function('window', 'module', smCode)(fakeWindow, fakeModuleSM);
  SM = fakeWindow.TI84StatMath || fakeModuleSM.exports;

  // FieldTables
  new Function('window', 'module', ftCode)(fakeWindow, fakeModuleFT);

  // ResultFormatter — needs window.TI84FieldTables and window.TI84StatMath
  new Function('window', 'module', rfCode)(fakeWindow, fakeModuleRF);
  RF = fakeWindow.TI84ResultFormatter || fakeModuleRF.exports;
});

// ─── 1-Var Stats formatting ───

describe('one-var-stats-result-page1', () => {
  it('formats all six lines with known values', () => {
    const result = RF.format('one-var-stats-result-page1', {
      xbar: 3,
      sumX: 15,
      sumX2: 55,
      Sx: 1.5811388301,
      sigmaX: 1.4142135624,
      n: 5
    });

    expect(result.lines).toHaveLength(6);
    expect(result.lines[0]).toBe('x\u0304 = 3');
    expect(result.lines[1]).toBe('\u03A3x = 15');
    expect(result.lines[2]).toBe('\u03A3x\u00B2 = 55');
    // Sx should be formatted via formatTI (10 sig digits, trailing zeros stripped)
    expect(result.lines[3]).toBe('Sx = 1.58113883');
    expect(result.lines[4]).toBe('\u03C3x = 1.414213562');
    expect(result.lines[5]).toBe('n = 5');
  });

  it('marks page1 as scrollable with nextPage pointing to page2', () => {
    const result = RF.format('one-var-stats-result-page1', {
      xbar: 0, sumX: 0, sumX2: 0, Sx: 0, sigmaX: 0, n: 0
    });

    expect(result.scrollable).toBe(true);
    expect(result.nextPage).toBe('one-var-stats-result-page2');
  });
});

describe('one-var-stats-result-page2', () => {
  it('formats five-number summary', () => {
    const result = RF.format('one-var-stats-result-page2', {
      minX: 1, Q1: 2, Med: 3, Q3: 4, maxX: 5
    });

    expect(result.lines).toHaveLength(5);
    expect(result.lines[0]).toBe('minX = 1');
    expect(result.lines[1]).toBe('Q1 = 2');
    expect(result.lines[2]).toBe('Med = 3');
    expect(result.lines[3]).toBe('Q3 = 4');
    expect(result.lines[4]).toBe('maxX = 5');
  });

  it('page2 is scrollable but has no nextPage', () => {
    const result = RF.format('one-var-stats-result-page2', {
      minX: 0, Q1: 0, Med: 0, Q3: 0, maxX: 0
    });

    expect(result.scrollable).toBe(true);
    expect(result.nextPage).toBeNull();
  });
});

// ─── 1-PropZTest ───

describe('one-propztest-result', () => {
  it('shows alternative hypothesis as first line', () => {
    const result = RF.format('one-propztest-result', {
      z: 2.1547,
      p: 0.0312,
      pHat: 0.6,
      n: 50
    }, '\u2260p\u2080');

    expect(result.lines[0]).toBe('prop \u2260p\u2080 p0');
  });

  it('formats z and p values correctly', () => {
    const result = RF.format('one-propztest-result', {
      z: -1.732050808,
      p: 0.0416064853,
      pHat: 0.35,
      n: 100
    }, '<p\u2080');

    expect(result.lines[0]).toBe('prop <p\u2080 p0');
    expect(result.lines[1]).toBe('z = -1.732050808');
    expect(result.lines[2]).toBe('p = 0.0416064853');
    expect(result.lines[3]).toBe('p\u0302 = 0.35');
    expect(result.lines[4]).toBe('n = 100');
  });

  it('handles > alternative', () => {
    const result = RF.format('one-propztest-result', {
      z: 1.5, p: 0.0668, pHat: 0.55, n: 200
    }, '>p\u2080');

    expect(result.lines[0]).toBe('prop >p\u2080 p0');
  });

  it('is not scrollable and has no nextPage', () => {
    const result = RF.format('one-propztest-result', {
      z: 0, p: 0, pHat: 0, n: 0
    });

    expect(result.scrollable).toBe(false);
    expect(result.nextPage).toBeNull();
  });
});

// ─── TInterval ───

describe('t-interval-result', () => {
  it('shows interval as (lower, upper) on first line', () => {
    const result = RF.format('t-interval-result', {
      lower: 2.345,
      upper: 7.655,
      xbar: 5,
      Sx: 3,
      n: 25
    });

    expect(result.lines[0]).toMatch(/^\(2\.345, 7\.655\)$/);
  });

  it('includes xbar, Sx, n on subsequent lines', () => {
    const result = RF.format('t-interval-result', {
      lower: 10.2, upper: 15.8, xbar: 13, Sx: 4.5, n: 30
    });

    expect(result.lines).toHaveLength(4);
    expect(result.lines[1]).toBe('x\u0304 = 13');
    expect(result.lines[2]).toBe('Sx = 4.5');
    expect(result.lines[3]).toBe('n = 30');
  });

  it('is not scrollable', () => {
    const result = RF.format('t-interval-result', {
      lower: 0, upper: 0, xbar: 0, Sx: 0, n: 0
    });

    expect(result.scrollable).toBe(false);
    expect(result.nextPage).toBeNull();
  });
});

// ─── Multi-page navigation ───

describe('multi-page results', () => {
  it('page1 has scrollable=true and nextPage set', () => {
    const result1 = RF.format('one-var-stats-result-page1', {
      xbar: 10, sumX: 50, sumX2: 330, Sx: 3.162, sigmaX: 2.828, n: 5
    });

    expect(result1.scrollable).toBe(true);
    expect(result1.nextPage).toBe('one-var-stats-result-page2');
  });

  it('page2 has scrollable=true but nextPage=null (end of chain)', () => {
    const result2 = RF.format('one-var-stats-result-page2', {
      minX: 5, Q1: 7.5, Med: 10, Q3: 12.5, maxX: 15
    });

    expect(result2.scrollable).toBe(true);
    expect(result2.nextPage).toBeNull();
  });

  it('can chain page1 nextPage to get page2 result', () => {
    const result1 = RF.format('one-var-stats-result-page1', {
      xbar: 3, sumX: 15, sumX2: 55, Sx: 1.58, sigmaX: 1.41, n: 5
    });

    // Use the nextPage ID from page1 to format page2
    expect(result1.nextPage).toBeTruthy();
    const result2 = RF.format(result1.nextPage, {
      minX: 1, Q1: 2, Med: 3, Q3: 4, maxX: 5
    });

    expect(result2.lines[0]).toBe('minX = 1');
    expect(result2.lines).toHaveLength(5);
  });

  it('two-samp-ttest-result is scrollable (10 lines)', () => {
    const result = RF.format('two-samp-ttest-result', {
      t: -2.5, p: 0.014, df: 48, xbar1: 10, xbar2: 13,
      Sx1: 3, Sx2: 4, n1: 25, n2: 25
    }, '\u2260');

    expect(result.lines).toHaveLength(10);
    expect(result.scrollable).toBe(true);
  });
});

// ─── formatTI integration ───

describe('formatTI integration in result lines', () => {
  it('formats integers without decimal point', () => {
    const result = RF.format('one-var-stats-result-page1', {
      xbar: 3, sumX: 15, sumX2: 55, Sx: 0, sigmaX: 0, n: 5
    });

    // n=5 should appear as "5", not "5.000000000"
    expect(result.lines[5]).toBe('n = 5');
    // xbar=3 should appear as "3"
    expect(result.lines[0]).toBe('x\u0304 = 3');
  });

  it('formats small decimals correctly', () => {
    const result = RF.format('one-propztest-result', {
      z: 0.5, p: 0.3085375387, pHat: 0.52, n: 100
    }, '\u2260p\u2080');

    // p should be formatted as a decimal, not scientific notation
    expect(result.lines[2]).toBe('p = 0.3085375387');
  });

  it('formats scientific notation for very small p-values', () => {
    const result = RF.format('one-propztest-result', {
      z: 5.0, p: 2.87e-7, pHat: 0.8, n: 200
    }, '>p\u2080');

    // Very small p should use scientific notation
    expect(result.lines[2]).toMatch(/p = .*E-7/);
  });

  it('formats zero correctly', () => {
    const result = RF.format('chi2gof-result', {
      chi2: 0, p: 1, df: 3
    });

    expect(result.lines[0]).toBe('\u03C7\u00B2 = 0');
    expect(result.lines[1]).toBe('p = 1');
    expect(result.lines[2]).toBe('df = 3');
  });
});

// ─── Other result screens ───

describe('t-test-result', () => {
  it('shows alternative hypothesis for mu', () => {
    const result = RF.format('t-test-result', {
      t: 2.236, p: 0.0322, xbar: 13, Sx: 4.47, n: 20
    }, '\u2260');

    expect(result.lines[0]).toBe('\u03BC \u2260 \u03BC0');
    expect(result.lines[1]).toMatch(/^t = 2\.236/);
  });
});

describe('linreg-result', () => {
  it('shows regression equation header and coefficients', () => {
    const result = RF.format('linreg-result', {
      a: 2.5, b: 1.3, r2: 0.95, r: 0.9747
    });

    expect(result.lines[0]).toBe('y = a + bx');
    expect(result.lines[1]).toBe('a = 2.5');
    expect(result.lines[2]).toBe('b = 1.3');
    expect(result.lines[3]).toBe('r\u00B2 = 0.95');
    expect(result.lines[4]).toBe('r = 0.9747');
  });
});

describe('one-propzint-result', () => {
  it('shows interval on first line', () => {
    const result = RF.format('one-propzint-result', {
      lower: 0.4215, upper: 0.5785, pHat: 0.5, n: 200
    });

    expect(result.lines[0]).toBe('(0.4215, 0.5785)');
    expect(result.lines[1]).toBe('p\u0302 = 0.5');
    expect(result.lines[2]).toBe('n = 200');
  });
});

describe('chi2gof-result', () => {
  it('formats chi-square, p, and df', () => {
    const result = RF.format('chi2gof-result', {
      chi2: 12.833, p: 0.0050, df: 4
    });

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toMatch(/^\u03C7\u00B2 = 12\.833/);
    expect(result.lines[1]).toMatch(/^p = /);
    expect(result.lines[2]).toBe('df = 4');
    expect(result.scrollable).toBe(false);
  });
});

describe('linreg-ttest-result', () => {
  it('shows beta/rho alternative hypothesis and all fields', () => {
    const result = RF.format('linreg-ttest-result', {
      t: 3.45, p: 0.002, df: 18, a: 1.2, b: 0.85, s: 2.1, r2: 0.92, r: 0.959
    }, '\u2260');

    expect(result.lines[0]).toBe('\u03B2 and \u03C1 \u2260 0');
    expect(result.lines).toHaveLength(9);
    expect(result.scrollable).toBe(true);
  });
});

describe('unknown screen id', () => {
  it('returns an error line for unknown screen IDs', () => {
    const result = RF.format('nonexistent-screen', { x: 1 });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/ERR/);
    expect(result.scrollable).toBe(false);
    expect(result.nextPage).toBeNull();
  });
});

/**
 * Tests for TI84StatMath — verifies all computation functions
 * against known TI-84 Plus CE output.
 *
 * Run: npx vitest run ti84-trainer-v2/native/tests/stat-math.test.js
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the IIFE module into a simulated window object.
// The module sets window.TI84StatMath when it detects a window global.
let SM;

beforeAll(() => {
  const code = readFileSync(resolve(__dirname, '..', 'stat-math.js'), 'utf-8');
  // jsdom provides a global `window`, so the IIFE will attach to it.
  // But just in case, also provide a fallback via Function constructor.
  const fakeWindow = {};
  const fakeModule = { exports: {} };
  new Function('window', 'module', code)(fakeWindow, fakeModule);
  SM = fakeWindow.TI84StatMath || fakeModule.exports;
});

// ─── Helpers ───

function approx(actual, expected, digits) {
  if (digits === undefined) digits = 8;
  var tol = Math.pow(10, -digits);
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

// ─── oneVarStats ───

describe('oneVarStats', () => {
  it('computes basic stats for [1,2,3,4,5]', () => {
    const r = SM.oneVarStats([1, 2, 3, 4, 5]);
    expect(r.xbar).toBe(3);
    expect(r.n).toBe(5);
    expect(r.sumX).toBe(15);
    expect(r.sumX2).toBe(55);
    approx(r.Sx, 1.5811388301, 8);
    approx(r.sigmaX, Math.sqrt(2), 10);
    expect(r.minX).toBe(1);
    expect(r.Q1).toBe(2);
    expect(r.Med).toBe(3);
    expect(r.Q3).toBe(4);
    expect(r.maxX).toBe(5);
  });

  it('handles even n: [1,2,3,4,5,6]', () => {
    const r = SM.oneVarStats([1, 2, 3, 4, 5, 6]);
    expect(r.xbar).toBe(3.5);
    expect(r.n).toBe(6);
    expect(r.Med).toBe(3.5);
    expect(r.Q1).toBe(2);
    expect(r.Q3).toBe(5);
  });

  it('handles single element', () => {
    const r = SM.oneVarStats([42]);
    expect(r.xbar).toBe(42);
    expect(r.n).toBe(1);
    expect(r.Med).toBe(42);
    expect(r.Q1).toBe(42);
    expect(r.Q3).toBe(42);
    expect(r.Sx).toBe(0);
  });

  it('handles frequency list', () => {
    // [1,1,2,2,2,3] — 1 appears 2x, 2 appears 3x, 3 appears 1x
    const r = SM.oneVarStats([1, 2, 3], [2, 3, 1]);
    expect(r.n).toBe(6);
    approx(r.xbar, 11 / 6, 10);
  });

  it('TI quartiles for n=7: [1,2,3,4,5,6,7]', () => {
    const r = SM.oneVarStats([1, 2, 3, 4, 5, 6, 7]);
    expect(r.Med).toBe(4);
    expect(r.Q1).toBe(2.5);
    expect(r.Q3).toBe(5.5);
  });

  it('handles two elements', () => {
    const r = SM.oneVarStats([10, 20]);
    expect(r.xbar).toBe(15);
    expect(r.Med).toBe(15);
    expect(r.Q1).toBe(10);
    expect(r.Q3).toBe(20);
  });
});

// ─── normalcdf ───

describe('normalcdf', () => {
  it('normalcdf(-1, 1, 0, 1) matches TI-84', () => {
    approx(SM.normalcdf(-1, 1, 0, 1), 0.6826894921, 9);
  });

  it('normalcdf(-Infinity, 0, 0, 1) = 0.5', () => {
    approx(SM.normalcdf(-1e99, 0, 0, 1), 0.5, 10);
  });

  it('normalcdf(0, Infinity, 0, 1) = 0.5', () => {
    approx(SM.normalcdf(0, 1e99, 0, 1), 0.5, 10);
  });

  it('normalcdf(-1.96, 1.96, 0, 1) ~ 0.95', () => {
    approx(SM.normalcdf(-1.96, 1.96, 0, 1), 0.9500042097, 8);
  });

  it('non-standard normal: mu=100, sigma=15', () => {
    // P(85 < X < 115) where X ~ N(100, 15)
    // Equivalent to P(-1 < Z < 1) = 0.6827
    approx(SM.normalcdf(85, 115, 100, 15), 0.6826894921, 8);
  });

  it('extreme tails', () => {
    // P(Z < -5) is very small
    const p = SM.normalcdf(-1e99, -5, 0, 1);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-5);
    approx(p, 2.8665157187e-7, 3); // ~2.87e-7
  });
});

// ─── invNorm ───

describe('invNorm', () => {
  it('invNorm(0.975, 0, 1, LEFT) matches TI-84', () => {
    approx(SM.invNorm(0.975, 0, 1, 'LEFT'), 1.959963985, 8);
  });

  it('invNorm(0.5, 0, 1, LEFT) = 0', () => {
    approx(SM.invNorm(0.5, 0, 1, 'LEFT'), 0, 10);
  });

  it('invNorm(0.025, 0, 1, LEFT) ~ -1.96', () => {
    approx(SM.invNorm(0.025, 0, 1, 'LEFT'), -1.959963985, 8);
  });

  it('invNorm RIGHT tail', () => {
    // RIGHT: area to the RIGHT = 0.025 => z = 1.96
    approx(SM.invNorm(0.025, 0, 1, 'RIGHT'), 1.959963985, 8);
  });

  it('invNorm CENTER returns lower boundary', () => {
    // CENTER 0.95: tail each side = 0.025, lower z = -1.96
    approx(SM.invNorm(0.95, 0, 1, 'CENTER'), -1.959963985, 8);
  });

  it('non-standard normal', () => {
    // invNorm(0.975, 100, 15, LEFT) = 100 + 15*1.96 = 129.4
    approx(SM.invNorm(0.975, 100, 15, 'LEFT'), 129.3994598, 5);
  });
});

// ─── tTest ───

describe('tTest', () => {
  it('basic two-sided t-test', () => {
    // mu0=100, xbar=105, Sx=10, n=25 => t=2.5, df=24
    const r = SM.tTest(100, 105, 10, 25, '\u2260');
    expect(r.t).toBe(2.5);
    expect(r.df).toBe(24);
    // p-value for two-sided t=2.5, df=24 ~ 0.01965
    approx(r.p, 0.01965, 4);
  });

  it('one-sided greater', () => {
    const r = SM.tTest(100, 105, 10, 25, '>');
    expect(r.t).toBe(2.5);
    // one-sided p ~ 0.00983
    approx(r.p, 0.00983, 4);
  });

  it('one-sided less', () => {
    const r = SM.tTest(100, 105, 10, 25, '<');
    expect(r.t).toBe(2.5);
    // p for less: P(T < 2.5) ~ 0.99017
    approx(r.p, 0.99017, 4);
  });
});

// ─── tInterval ───

describe('tInterval', () => {
  it('95% CI for xbar=50, Sx=10, n=25', () => {
    const r = SM.tInterval(50, 10, 25, 0.95);
    expect(r.df).toBe(24);
    // t* for 95% CI, df=24 ~ 2.0639
    // ME ~ 2.0639 * 10/5 = 4.1278
    approx(r.ME, 4.1278, 3);
    approx(r.lower, 45.8722, 3);
    approx(r.upper, 54.1278, 3);
  });
});

// ─── twoSampTTest ───

describe('twoSampTTest', () => {
  it('Welch (unpooled) two-sample t-test', () => {
    // x1=10, s1=2, n1=15, x2=8, s2=3, n2=20, alt=≠
    // se = sqrt(4/15 + 9/20) = sqrt(0.71667) = 0.84656
    // t = 2/0.84656 = 2.3625, df = 32.637 (Satterthwaite)
    const r = SM.twoSampTTest(10, 2, 15, 8, 3, 20, '\u2260', false);
    approx(r.t, 2.3625, 3);
    expect(r.df).toBeGreaterThan(32);
    expect(r.df).toBeLessThan(33);
    expect(r.p).toBeLessThan(0.05);
  });

  it('pooled two-sample t-test', () => {
    const r = SM.twoSampTTest(10, 2, 15, 8, 3, 20, '\u2260', true);
    expect(r.df).toBe(33); // n1+n2-2
    expect(r.p).toBeLessThan(0.05);
  });
});

// ─── twoSampTInt ───

describe('twoSampTInt', () => {
  it('95% CI for difference in means', () => {
    const r = SM.twoSampTInt(10, 2, 15, 8, 3, 20, 0.95, false);
    expect(r.lower).toBeLessThan(2);
    expect(r.upper).toBeGreaterThan(2);
    // Difference = 2, interval should contain 2
    expect(r.lower).toBeGreaterThan(0);
  });
});

// ─── onePropZTest ───

describe('onePropZTest', () => {
  it('two-sided: p0=0.5, x=55, n=100', () => {
    const r = SM.onePropZTest(0.5, 55, 100, '\u2260');
    approx(r.z, 1.0, 8);
    approx(r.p, 0.3173, 3);
    expect(r.pHat).toBe(0.55);
    expect(r.n).toBe(100);
  });

  it('one-sided greater: p0=0.5, x=60, n=100', () => {
    const r = SM.onePropZTest(0.5, 60, 100, '>');
    approx(r.z, 2.0, 8);
    // P(Z > 2) ~ 0.02275
    approx(r.p, 0.02275, 4);
  });

  it('one-sided less: p0=0.5, x=40, n=100', () => {
    const r = SM.onePropZTest(0.5, 40, 100, '<');
    approx(r.z, -2.0, 8);
    // P(Z < -2) ~ 0.02275
    approx(r.p, 0.02275, 4);
  });
});

// ─── onePropZInt ───

describe('onePropZInt', () => {
  it('95% CI for x=55, n=100', () => {
    const r = SM.onePropZInt(55, 100, 0.95);
    expect(r.pHat).toBe(0.55);
    // ME ~ 1.96 * sqrt(0.55*0.45/100) ~ 0.09753
    approx(r.ME, 0.09753, 3);
    approx(r.lower, 0.45247, 3);
    approx(r.upper, 0.64753, 3);
  });
});

// ─── twoPropZTest ───

describe('twoPropZTest', () => {
  it('one-sided less: x1=30,n1=250,x2=45,n2=240', () => {
    const r = SM.twoPropZTest(30, 250, 45, 240, '<');
    approx(r.z, -2.07, 2);
    approx(r.p, 0.019, 2);
    expect(r.pHat1).toBe(0.12);
    expect(r.pHat2).toBe(0.1875);
    approx(r.pHatPooled, 75 / 490, 8);
    expect(r.n1).toBe(250);
    expect(r.n2).toBe(240);
  });
});

// ─── twoPropZInt ───

describe('twoPropZInt', () => {
  it('95% CI for x1=30,n1=250,x2=45,n2=240', () => {
    const r = SM.twoPropZInt(30, 250, 45, 240, 0.95);
    expect(r.pHat1).toBe(0.12);
    expect(r.pHat2).toBe(0.1875);
    approx(r.ME, 0.0629, 3);
    approx(r.lower, -0.1304, 3);
    approx(r.upper, -0.0046, 3);
    expect(r.n1).toBe(250);
    expect(r.n2).toBe(240);
  });
});

// ─── chi2GOFTest ───

describe('chi2GOFTest', () => {
  it('basic goodness-of-fit test', () => {
    // Observed: [20, 30, 50], Expected: [33.33, 33.33, 33.33], df=2
    const obs = [20, 30, 50];
    const exp = [100 / 3, 100 / 3, 100 / 3];
    const r = SM.chi2GOFTest(obs, exp, 2);
    // chi2 = (20-33.33)^2/33.33 + (30-33.33)^2/33.33 + (50-33.33)^2/33.33
    // = 5.3333 + 0.3333 + 8.3333 = 14.0
    approx(r.chi2, 14.0, 1);
    expect(r.df).toBe(2);
    expect(r.p).toBeLessThan(0.001);
  });
});

// ─── chi2Test ───

describe('chi2Test', () => {
  it('2x2 independence test', () => {
    const observed = [
      [10, 20],
      [30, 40]
    ];
    const r = SM.chi2Test(observed);
    expect(r.df).toBe(1);
    // Grand total = 100
    // Expected: [12,18],[28,42]
    // chi2 = (10-12)^2/12 + (20-18)^2/18 + (30-28)^2/28 + (40-42)^2/42
    //       = 0.3333 + 0.2222 + 0.1429 + 0.0952 = 0.7937
    approx(r.chi2, 0.7937, 3);
    expect(r.p).toBeGreaterThan(0.3);
  });

  it('computes expected matrix when not provided', () => {
    const observed = [
      [10, 20],
      [30, 40]
    ];
    const r = SM.chi2Test(observed);
    expect(r.expected).toBeDefined();
    approx(r.expected[0][0], 12, 1);
    approx(r.expected[0][1], 18, 1);
  });
});

// ─── linReg ───

describe('linReg', () => {
  it('perfect positive linear relationship', () => {
    const r = SM.linReg([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    approx(r.a, 0, 10);
    approx(r.b, 2, 10);
    approx(r.r, 1, 10);
    approx(r.r2, 1, 10);
  });

  it('known regression', () => {
    // x = [1,2,3,4,5], y = [2,3,5,4,6]
    const r = SM.linReg([1, 2, 3, 4, 5], [2, 3, 5, 4, 6]);
    // b = Sxy/Sxx = 8/10 = 0.8, a = 4 - 0.8*3 = 1.6
    approx(r.b, 0.9, 1);
    approx(r.a, 1.3, 1);
    expect(r.r).toBeGreaterThan(0.8);
    expect(r.r).toBeLessThan(1);
  });
});

// ─── linRegTTest ───

describe('linRegTTest', () => {
  it('tests slope significance', () => {
    const r = SM.linRegTTest([1, 2, 3, 4, 5], [2, 4, 6, 8, 10], undefined, '\u2260');
    // Perfect linear: t should be very large, p ~ 0
    expect(Math.abs(r.t)).toBeGreaterThan(1000);
    expect(r.p).toBeLessThan(0.001);
    expect(r.df).toBe(3); // n-2 = 5-2 = 3
  });
});

// ─── linRegTInt ───

describe('linRegTInt', () => {
  it('95% CI for slope', () => {
    const r = SM.linRegTInt([1, 2, 3, 4, 5], [2, 3, 5, 4, 6], undefined, 0.95);
    expect(r.df).toBe(3);
    expect(r.lower).toBeLessThan(r.b);
    expect(r.upper).toBeGreaterThan(r.b);
  });
});

// ─── binompdf ───

describe('binompdf', () => {
  it('binompdf(10, 0.5, 5) matches TI-84', () => {
    approx(SM.binompdf(10, 0.5, 5), 0.2460937500, 9);
  });

  it('binompdf(10, 0.5, 0) = (0.5)^10', () => {
    approx(SM.binompdf(10, 0.5, 0), Math.pow(0.5, 10), 12);
  });

  it('binompdf(10, 0.5, 10) = (0.5)^10', () => {
    approx(SM.binompdf(10, 0.5, 10), Math.pow(0.5, 10), 12);
  });

  it('out of range returns 0', () => {
    expect(SM.binompdf(10, 0.5, -1)).toBe(0);
    expect(SM.binompdf(10, 0.5, 11)).toBe(0);
  });

  it('binompdf(20, 0.3, 6) ~ 0.1916', () => {
    approx(SM.binompdf(20, 0.3, 6), 0.1916, 3);
  });
});

// ─── binomcdf ───

describe('binomcdf', () => {
  it('binomcdf(10, 0.5, 5) ~ 0.6230', () => {
    approx(SM.binomcdf(10, 0.5, 5), 0.623046875, 9);
  });

  it('binomcdf(10, 0.5, 10) = 1', () => {
    approx(SM.binomcdf(10, 0.5, 10), 1, 12);
  });

  it('binomcdf(10, 0.5, 0) = (0.5)^10', () => {
    approx(SM.binomcdf(10, 0.5, 0), Math.pow(0.5, 10), 12);
  });
});

// ─── geometpdf ───

describe('geometpdf', () => {
  it('geometpdf(0.5, 1) = 0.5', () => {
    expect(SM.geometpdf(0.5, 1)).toBe(0.5);
  });

  it('geometpdf(0.5, 3) = 0.125', () => {
    expect(SM.geometpdf(0.5, 3)).toBe(0.125);
  });

  it('geometpdf(0.2, 5) = 0.2 * 0.8^4', () => {
    approx(SM.geometpdf(0.2, 5), 0.2 * Math.pow(0.8, 4), 12);
  });

  it('non-integer x returns 0', () => {
    expect(SM.geometpdf(0.5, 2.5)).toBe(0);
  });

  it('x < 1 returns 0', () => {
    expect(SM.geometpdf(0.5, 0)).toBe(0);
  });
});

// ─── geometcdf ───

describe('geometcdf', () => {
  it('geometcdf(0.5, 1) = 0.5', () => {
    approx(SM.geometcdf(0.5, 1), 0.5, 12);
  });

  it('geometcdf(0.5, 3) = 0.875', () => {
    approx(SM.geometcdf(0.5, 3), 0.875, 12);
  });

  it('geometcdf(0.5, 10) ~ 0.999', () => {
    approx(SM.geometcdf(0.5, 10), 1 - Math.pow(0.5, 10), 12);
  });

  it('x < 1 returns 0', () => {
    expect(SM.geometcdf(0.5, 0)).toBe(0);
  });
});

// ─── formatTI ───

describe('formatTI', () => {
  it('formats zero', () => {
    expect(SM.formatTI(0)).toBe('0');
  });

  it('formats integer', () => {
    expect(SM.formatTI(3)).toBe('3');
  });

  it('formats decimal — strips trailing zeros', () => {
    expect(SM.formatTI(3.14)).toBe('3.14');
  });

  it('scientific notation for large numbers', () => {
    expect(SM.formatTI(1e15)).toBe('1E15');
  });

  it('scientific notation for very small numbers', () => {
    expect(SM.formatTI(0.0001)).toBe('1E-4');
  });

  it('negative scientific notation', () => {
    expect(SM.formatTI(-0.0001)).toBe('-1E-4');
  });

  it('negative number', () => {
    expect(SM.formatTI(-3.14159)).toBe('-3.14159');
  });

  it('number just under sci threshold is fixed', () => {
    // 0.001 is the boundary — 0.001 itself should be fixed
    expect(SM.formatTI(0.001)).toBe('0.001');
  });

  it('number at 10^10 boundary uses sci notation', () => {
    expect(SM.formatTI(1e10)).toBe('1E10');
  });

  it('number just under 10^10 stays fixed', () => {
    expect(SM.formatTI(9999999999)).toBe('9999999999');
  });

  it('NaN returns ERR', () => {
    expect(SM.formatTI(NaN)).toBe('ERR');
  });

  it('Infinity formatting', () => {
    expect(SM.formatTI(Infinity)).toBe('9.999999999E99');
    expect(SM.formatTI(-Infinity)).toBe('-9.999999999E99');
  });
});

// ─── Internal: phi and phiInv roundtrip ───

describe('phi / phiInv roundtrip', () => {
  it('phiInv(phi(z)) ~ z for z in [-3, 3]', () => {
    var zValues = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3];
    for (var z of zValues) {
      var p = SM._phi(z);
      var zBack = SM._phiInv(p);
      approx(zBack, z, 8);
    }
  });
});

// ─── Internal: t-distribution CDF ───

describe('t-distribution CDF', () => {
  it('tCDF(0, any df) = 0.5', () => {
    approx(SM._tCDF(0, 10), 0.5, 10);
    approx(SM._tCDF(0, 1), 0.5, 10);
    approx(SM._tCDF(0, 100), 0.5, 10);
  });

  it('tCDF matches known values', () => {
    // t=2.0, df=10 => P(T < 2) ~ 0.9633
    approx(SM._tCDF(2.0, 10), 0.9633, 3);
  });

  it('tCDF symmetry: P(T < -t) = 1 - P(T < t)', () => {
    var p1 = SM._tCDF(1.5, 20);
    var p2 = SM._tCDF(-1.5, 20);
    approx(p1 + p2, 1, 10);
  });
});

// ─── Internal: chi-square CDF ───

describe('chi-square CDF', () => {
  it('chi2CDF(0, df) = 0', () => {
    expect(SM._chi2CDF(0, 5)).toBe(0);
  });

  it('chi2CDF known value: chi2=3.841, df=1 ~ 0.95', () => {
    approx(SM._chi2CDF(3.841, 1), 0.95, 2);
  });

  it('chi2CDF known value: chi2=5.991, df=2 ~ 0.95', () => {
    approx(SM._chi2CDF(5.991, 2), 0.95, 2);
  });
});

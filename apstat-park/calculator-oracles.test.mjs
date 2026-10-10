import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  closeEnough, displayRound, expandByFrequency, oneVarStats, fiveNumberSummary,
  modifiedBoxplot, histogramBins, binFor, choose, binompdf, binomcdf,
} from './calculator-oracles.mjs';

// Spec = ti84-transpile/APSTAT_PARK_CALCULATOR_HANDOFF_SPEC.md, tables A-F.
// Fixtures = compact copies of the ROM evidence (see fixtures/ti84/PROVENANCE.md).

function fixture(name) {
  return JSON.parse(fs.readFileSync(new URL('./fixtures/ti84/' + name, import.meta.url), 'utf8'));
}

const statistics = fixture('statistics-clocked432.json');
const zeroFrequency = fixture('statistics-clocked432-zero-frequency.json');
const allZero = fixture('statistics-clocked433-all-zero-frequency.json');
const plots = fixture('plots-clocked433.json');
const binomialCdf = fixture('binomial-cdf-clocked431.json');
const binomialBoundaries = fixture('binomial-clocked431-boundaries.json');

function statCase(file, scenario) {
  const found = file.cases.find((c) => c.scenario === scenario);
  assert.ok(found, 'fixture case ' + scenario);
  return found;
}

function assertClose(actual, expected, label) {
  assert.ok(closeEnough(actual, expected), `${label}: ${actual} vs ${expected}`);
}

// Fixture field name -> oracle value.
function oracleField(stats, field) {
  const table = {
    n: stats.n, mean: stats.mean, sum: stats.sum, squares: stats.sumOfSquares,
    sample: stats.Sx, population: stats.sigmaX,
    min: stats.fiveNumber.min, q1: stats.fiveNumber.q1, median: stats.fiveNumber.median,
    q3: stats.fiveNumber.q3, max: stats.fiveNumber.max,
  };
  return table[field];
}

// Checks the oracle against the spec numbers, then against every observed screen value.
function checkOneVar(stats, spec, fixtureCase) {
  for (const [field, expected] of Object.entries(spec)) assertClose(oracleField(stats, field), expected, 'spec ' + field);

  assert.deepEqual(expandByFrequency(fixtureCase.dataset, fixtureCase.frequencies), fixtureCase.expandedValues);
  for (const [field, shown] of Object.entries(fixtureCase.observed)) {
    const oracle = oracleField(stats, field);
    assertClose(shown.value, oracle, 'observed ' + field);
    assert.equal(displayRound(oracle), shown.value, 'display-rounded ' + field);
    assertClose(fixtureCase.expected[field], oracle, 'fixture expected ' + field);
  }
}

// ---------- helpers ----------

test('tolerance helper matches the source rule abs(a-e) <= max(1,|e|)*1e-9', () => {
  assert.ok(closeEnough(1.632993162, Math.sqrt(8 / 3)));
  assert.ok(closeEnough(1000 + 5e-7, 1000));
  assert.ok(!closeEnough(1000 + 2e-6, 1000));
  assert.ok(!closeEnough(0.1171876, 0.1171875));
  assert.equal(displayRound(Math.sqrt(2)), 1.414213562);
  assert.equal(displayRound(0), 0);
});

test('quartiles use TI median-of-halves (median excluded for odd n)', () => {
  assert.deepEqual(fiveNumberSummary([1, 2, 3, 4, 5]), { min: 1, q1: 1.5, median: 3, q3: 4.5, max: 5 });
  assert.deepEqual(fiveNumberSummary([1, 2, 3, 4, 5, 6, 7]), { min: 1, q1: 2, median: 4, q3: 6, max: 7 });
  assert.deepEqual(fiveNumberSummary([7]), { min: 7, q1: 7, median: 7, q3: 7, max: 7 });
});

// ---------- A. one-variable statistics ----------

test('A: 1-Var Stats of [2,4,6] matches spec and ROM screens', () => {
  const stats = oneVarStats([2, 4, 6]);
  const spec = { n: 3, mean: 4, sum: 12, squares: 56, sample: 2, population: Math.sqrt(8 / 3), min: 2, q1: 2, median: 4, q3: 6, max: 6 };
  checkOneVar(stats, spec, statCase(statistics, 'basic'));
});

// ---------- B. frequency lists ----------

test('B: L2=[1,2,1] means [2,4,4,6] and matches spec and ROM screens', () => {
  assert.deepEqual(expandByFrequency([2, 4, 6], [1, 2, 1]), [2, 4, 4, 6]);
  const stats = oneVarStats([2, 4, 6], [1, 2, 1]);
  const spec = { n: 4, mean: 4, sum: 16, squares: 72, sample: Math.sqrt(8 / 3), population: Math.sqrt(2), min: 2, q1: 3, median: 4, q3: 5, max: 6 };
  checkOneVar(stats, spec, statCase(statistics, 'frequency'));
});

test('B variant: zero-frequency row L2=[1,0,1] drops 4 and matches spec and ROM screens', () => {
  assert.deepEqual(expandByFrequency([2, 4, 6], [1, 0, 1]), [2, 6]);
  const stats = oneVarStats([2, 4, 6], [1, 0, 1]);
  const spec = { n: 2, mean: 4, sum: 8, squares: 40, sample: Math.sqrt(8), population: 2, min: 2, q1: 2, median: 4, q3: 6, max: 6 };
  checkOneVar(stats, spec, statCase(zeroFrequency, 'zero-frequency'));
});

test('B: frequency list is not paired data or equal weighting', () => {
  const weighted = oneVarStats([2, 4, 6], [1, 2, 1]);
  assert.notEqual(weighted.n, 6);
  assert.notEqual(weighted.n, 3);
  assert.throws(() => expandByFrequency([2, 4, 6], [1, 2]));
  assert.throws(() => expandByFrequency([2, 4, 6], [1, -1, 1]));
});

// ---------- C. invalid (all-zero) frequency list ----------

test('C: all-zero frequencies mean no observations; ROM shows the division-by-0 error', () => {
  assert.deepEqual(allZero.dataset, [2, 4, 6]);
  assert.deepEqual(allZero.frequencies, [0, 0, 0]);

  const stats = oneVarStats(allZero.dataset, allZero.frequencies);
  assert.equal(stats.n, 0);
  assert.equal(stats.mean, undefined);
  assert.equal(stats.Sx, undefined);
  assert.equal(stats.fiveNumber, undefined);
  assert.equal(stats.divisionByZero, true);

  const lines = allZero.observedLines.map((line) => line.text);
  for (const expected of ['Attempted calculation', 'contains division by 0.', 'Calculation fails.']) assert.ok(lines.includes(expected), expected);
  assert.ok(lines.includes('2:Goto'), 'Goto option shown (its execution is not verified)');
});

// ---------- D. modified boxplot ----------

const OUTLIER_DATA = [1, 2, 2, 3, 3, 9];

test('D: modified boxplot of [1,2,2,3,3,9] matches spec and ROM geometry', () => {
  const box = modifiedBoxplot(OUTLIER_DATA);
  assert.equal(box.q1, 2);
  assert.equal(box.median, 2.5);
  assert.equal(box.q3, 3);
  assert.equal(box.iqr, 1);
  assert.equal(box.lowerFence, 0.5);
  assert.equal(box.upperFence, 4.5);
  assert.equal(box.lowerWhisker, 1);
  assert.equal(box.upperWhisker, 3);
  assert.deepEqual(box.outliers, [9]);
  assert.equal(box.max, 9);

  const fixtureCase = plots.cases.find((c) => c.flow === 'boxplot');
  assert.deepEqual(fixtureCase.dataset, OUTLIER_DATA);
  const g = fixtureCase.geometry;
  assert.deepEqual(
    [g.q1, g.median, g.q3, g.lowerFence, g.upperFence, g.outliers, g.whiskers],
    [box.q1, box.median, box.q3, box.lowerFence, box.upperFence, box.outliers, [box.lowerWhisker, box.upperWhisker]],
  );
  assert.equal(fixtureCase.reportExpected.max, box.max);
});

test('D: upper whisker (3) is not the maximum (9)', () => {
  const box = modifiedBoxplot(OUTLIER_DATA);
  assert.notEqual(box.upperWhisker, box.max);
  assert.ok(box.max > box.upperFence);
});

test('D: rightward TRACE (visually transcribed) reads Med, Q3, whisker X, maxX, then stays at the end', () => {
  const box = modifiedBoxplot(OUTLIER_DATA);
  const screens = plots.cases.find((c) => c.flow === 'boxplot').traceScreens;
  const labels = screens.map((s) => s.visuallyTranscribed);
  assert.deepEqual(labels.slice(0, 4), ['Med=2.5', 'Q3=3', 'X=3', 'maxX=9']);

  const oracleByLabel = { Med: box.median, Q3: box.q3, X: box.upperWhisker, maxX: box.max };
  for (const label of labels) {
    const [name, value] = label.split('=');
    assert.equal(Number(value), oracleByLabel[name], label);
  }

  // Repeated RIGHT presses stay on the endpoint: identical label and identical saved screen.
  const tail = screens.slice(3);
  assert.ok(tail.every((s) => s.visuallyTranscribed === 'maxX=9' && s.sha256 === tail[0].sha256));
});

// ---------- E. histogram ----------

const SPEC_BINS = [
  { lo: 1, hi: 3, count: 3 },
  { lo: 3, hi: 5, count: 2 },
  { lo: 5, hi: 7, count: 0 },
  { lo: 7, hi: 9, count: 0 },
  { lo: 9, hi: 11, count: 1 },
  { lo: 11, hi: 13, count: 0 },
];

test('E: bins [lo, lo+2) from 1 match spec table, ROM geometry and TRACE', () => {
  const bins = histogramBins(OUTLIER_DATA, 1, 2, 6);
  assert.deepEqual(bins, SPEC_BINS);
  assert.equal(bins.reduce((total, b) => total + b.count, 0), OUTLIER_DATA.length);

  const fixtureCase = plots.cases.find((c) => c.flow === 'histogram');
  assert.deepEqual(fixtureCase.dataset, OUTLIER_DATA);
  const asTriples = bins.map((b) => [b.lo, b.hi, b.count]);
  assert.deepEqual(fixtureCase.geometry.bins, asTriples);
  assert.deepEqual(fixtureCase.traceScreens.map((s) => s.visuallyTranscribed), asTriples);
});

test('E: boundary observations go to the bin they start (3 -> [3,5), 9 -> [9,11))', () => {
  assert.deepEqual(binFor(3, 1, 2, 6), { index: 1, lo: 3, hi: 5 });
  assert.deepEqual(binFor(9, 1, 2, 6), { index: 4, lo: 9, hi: 11 });
  assert.deepEqual(binFor(1, 1, 2, 6), { index: 0, lo: 1, hi: 3 });
  assert.equal(binFor(13, 1, 2, 6), undefined);
  assert.equal(binFor(0.5, 1, 2, 6), undefined);
});

// ---------- F. binomial ----------

test('F: binompdf/binomcdf spec table, computed from elementary probabilities', () => {
  assert.equal(binompdf(10, 0.5, 3), 0.1171875);
  assert.equal(binomcdf(10, 0.5, 3), 0.171875);
  assert.equal(binomcdf(10, 0, 0), 1);
  assert.equal(binomcdf(10, 1, 3), 0);

  // Elementary check: 120/1024 and (1+10+45+120)/1024.
  assert.equal(choose(10, 3), 120);
  assert.equal(binompdf(10, 0.5, 3), 120 / 1024);
  assert.equal(binomcdf(10, 0.5, 3), 176 / 1024);
});

test('F: p=0 and p=1 boundaries are exact', () => {
  for (let x = 0; x <= 10; x++) {
    assert.equal(binompdf(10, 0, x), x === 0 ? 1 : 0);
    assert.equal(binompdf(10, 1, x), x === 10 ? 1 : 0);
    assert.equal(binomcdf(10, 0, x), 1);
    assert.equal(binomcdf(10, 1, x), x === 10 ? 1 : 0);
  }
  assert.equal(binomcdf(10, 0.5, 10), 1);
  assert.equal(binomcdf(10, 0.5, -1), 0);
});

test('F: oracle matches the ROM binomial fixtures', () => {
  const interior = binomialCdf.fixture;
  assert.deepEqual([interior.n, interior.p, interior.x], [10, 0.5, 3]);
  assert.deepEqual(binomialCdf.expected.terms, [0, 1, 2, 3].map((k) => choose(10, k)));
  assert.equal(binomialCdf.expected.numerator / binomialCdf.expected.denominator, binomcdf(10, 0.5, 3));
  assertClose(Number(binomialCdf.observed), binomcdf(interior.n, interior.p, interior.x), 'binomcdf interior');

  const seen = [];
  for (const c of binomialBoundaries.cases) {
    const oracle = c.procedure === 'binompdf' ? binompdf(c.trials, c.probability, c.x) : binomcdf(c.trials, c.probability, c.x);
    assertClose(Number(c.observed), oracle, c.label);
    assert.equal(c.expected, oracle, c.label + ' expected');
    for (const term of c.terms) {
      assert.equal(term.choose, choose(c.trials, term.k));
      assert.equal(term.probability, binompdf(c.trials, c.probability, term.k));
    }
    seen.push(`${c.procedure}(${c.trials},${c.probability},${c.x})=${c.observed}`);
  }
  assert.deepEqual(seen, ['binompdf(10,0.5,3)=0.1171875', 'binomcdf(10,0,0)=1', 'binomcdf(10,1,3)=0']);
});

// Independent reference computations for the APStatPark calculator activities.
//
// These functions do NOT import the trainer or any calculator-* module on
// purpose: they are the "second opinion" that trainer and Park answers are
// checked against. Keep them plain and obviously correct.
//
// Conventions (match the TI-84 Plus CE ROM evidence in fixtures/ti84/):
// - Frequencies expand a value list: values [2,4,6] with freqs [1,2,1] mean
//   the observations [2,4,4,6].
// - Quartiles use median-of-halves; for odd n the median is left out of both
//   halves.
// - Histogram bins are [lo, lo + width): lower boundary included, upper excluded.

// ---------- numeric helpers ----------

// Same tolerance the source screen verification used.
export function closeEnough(actual, expected) {
  return Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-9;
}

// Round to the number of significant digits a calculator screen shows
// (the TI-84 home/stat screens show up to 10).
export function displayRound(value, significantDigits = 10) {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;
  return Number(value.toPrecision(significantDigits));
}

// ---------- lists and frequencies ----------

export function expandByFrequency(values, frequencies = null) {
  if (!frequencies) return [...values];
  if (frequencies.length !== values.length) throw new Error('values and frequencies differ in length');

  const expanded = [];
  for (let i = 0; i < values.length; i++) {
    const count = frequencies[i];
    if (!Number.isInteger(count) || count < 0) throw new Error('frequency must be a whole number >= 0');
    for (let k = 0; k < count; k++) expanded.push(values[i]);
  }
  return expanded;
}

function sortedCopy(list) {
  return [...list].sort((a, b) => a - b);
}

export function medianOfSorted(sorted) {
  const n = sorted.length;
  if (n === 0) return undefined;
  const middle = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

// ---------- one-variable statistics ----------

// Returns n, mean, sum, sumOfSquares, Sx, sigmaX and the five-number summary.
// With no observations (for example all-zero frequencies) n is 0 and every
// derived statistic is undefined: the mean would divide by zero.
export function oneVarStats(values, frequencies = null) {
  const data = expandByFrequency(values, frequencies);
  const n = data.length;
  const sum = data.reduce((total, x) => total + x, 0);
  const sumOfSquares = data.reduce((total, x) => total + x * x, 0);

  if (n === 0) {
    return { n: 0, sum, sumOfSquares, mean: undefined, Sx: undefined, sigmaX: undefined, fiveNumber: undefined, divisionByZero: true };
  }

  const mean = sum / n;
  const squaredDeviations = data.reduce((total, x) => total + (x - mean) ** 2, 0);
  const sigmaX = Math.sqrt(squaredDeviations / n);
  const Sx = n > 1 ? Math.sqrt(squaredDeviations / (n - 1)) : undefined;

  return { n, sum, sumOfSquares, mean, Sx, sigmaX, fiveNumber: fiveNumberSummary(data), divisionByZero: false };
}

// TI median-of-halves: for odd n the median is excluded from both halves.
// A single observation is its own Q1 and Q3.
export function fiveNumberSummary(list) {
  const sorted = sortedCopy(list);
  const n = sorted.length;
  if (n === 0) return undefined;

  const min = sorted[0];
  const max = sorted[n - 1];
  const median = medianOfSorted(sorted);
  if (n === 1) return { min, q1: min, median, q3: max, max };

  const half = Math.floor(n / 2);
  const lowerHalf = sorted.slice(0, half);
  const upperHalf = sorted.slice(n - half);
  return { min, q1: medianOfSorted(lowerHalf), median, q3: medianOfSorted(upperHalf), max };
}

// ---------- modified boxplot ----------

export function modifiedBoxplot(list) {
  const summary = fiveNumberSummary(list);
  if (!summary) return undefined;

  const iqr = summary.q3 - summary.q1;
  const lowerFence = summary.q1 - 1.5 * iqr;
  const upperFence = summary.q3 + 1.5 * iqr;
  const sorted = sortedCopy(list);
  const inside = sorted.filter((x) => x >= lowerFence && x <= upperFence);
  const outliers = sorted.filter((x) => x < lowerFence || x > upperFence);

  return {
    min: summary.min,
    q1: summary.q1,
    median: summary.median,
    q3: summary.q3,
    max: summary.max,
    iqr,
    lowerFence,
    upperFence,
    // Whiskers end at the most extreme observations that are NOT outliers.
    lowerWhisker: inside[0],
    upperWhisker: inside[inside.length - 1],
    outliers,
  };
}

// ---------- histogram ----------

// Bin i covers [start + i*width, start + (i+1)*width). Counts by membership.
export function histogramBins(list, start, width, binCount) {
  if (!(width > 0)) throw new Error('bin width must be positive');

  const bins = [];
  for (let i = 0; i < binCount; i++) {
    const lo = start + i * width;
    const hi = lo + width;
    const count = list.filter((x) => x >= lo && x < hi).length;
    bins.push({ lo, hi, count });
  }
  return bins;
}

// The bin [lo, hi) that contains x, or undefined if x is outside all bins.
export function binFor(x, start, width, binCount) {
  const index = Math.floor((x - start) / width);
  if (index < 0 || index >= binCount) return undefined;
  const lo = start + index * width;
  return { index, lo, hi: lo + width };
}

// ---------- binomial ----------

// Exact n-choose-k with integers (n is small in every activity).
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

// p**k with 0**0 = 1, so p = 0 and p = 1 come out exact (no 0*log(0)).
function power(p, k) {
  if (k === 0) return 1;
  return p ** k;
}

// P(X = x) for X ~ Binomial(n, p).
export function binompdf(n, p, x) {
  if (!Number.isInteger(x) || x < 0 || x > n) return 0;
  if (p === 0) return x === 0 ? 1 : 0;
  if (p === 1) return x === n ? 1 : 0;
  return choose(n, x) * power(p, x) * power(1 - p, n - x);
}

// P(X <= x) for X ~ Binomial(n, p), summed from elementary terms.
export function binomcdf(n, p, x) {
  if (x < 0) return 0;
  const top = Math.min(Math.floor(x), n);
  let total = 0;
  for (let k = 0; k <= top; k++) total += binompdf(n, p, k);
  return total;
}

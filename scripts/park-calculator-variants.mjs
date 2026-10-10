// Content input for scripts/build-park-curriculum.mjs: interpretation variants A-F
// (ti84-transpile/APSTAT_PARK_CALCULATOR_HANDOFF_SPEC.md, "Initial activity set").
//
// Every variant is an extra problem of an EXISTING skill (same skillId), so it inherits
// that skill's lesson/date eligibility and never unlocks an untaught topic.
//
// Reference answers come from apstat-park/calculator-oracles.mjs (independent of the
// trainer). The generator separately checks the trainer's own result against the same
// oracle, and the engine still validates every calculator checkpoint by state.
//
// Datasets are the ROM fixtures' inputs (apstat-park/fixtures/ti84/, test-only; this
// module copies the numbers instead of reading the fixture files).
//
// Student text is plain ASCII: the Park's pixel font has no sigma, x-bar or <= glyphs.
import {
  oneVarStats, modifiedBoxplot, histogramBins, binFor, binompdf, binomcdf,
} from '../apstat-park/calculator-oracles.mjs';

// Same 5 significant digits the answer tiles show (calculator-curriculum.mjs `round`).
const round5 = value => Number(Number(value).toPrecision(5));
// Short screen-style number for option text.
const short = value => String(Number(Number(value).toPrecision(4)));
const binText = bin => '[' + bin.lo + ', ' + bin.hi + ')';
const binKey = bin => '[' + bin.lo + ',' + bin.hi + ')';

// A question with category choices. The correct option has no feedback.
function choose(label, prompt, answer, options) {
  return { label, prompt, answer, options: options.map(([key, text, feedback = null]) => ({ key, text, feedback })) };
}
// A question whose choices are numbers (compared exactly for integers, with the
// display tolerance for decimals: see answerMatches in calculator-curriculum.mjs).
function number(label, prompt, answer, distractors) {
  const options = [[answer, null], ...distractors].map(([value, feedback]) => {
    const key = String(round5(value));
    return { key, text: key, feedback };
  });
  return { label, prompt, answer: round5(answer), options };
}

// ---------- A. One-variable statistics, sample vs population SD ----------
const A_DATA = [2, 4, 6];
const a = oneVarStats(A_DATA);

const sampleSd = {
  skillId: 'one-var-stats', suffix: 'sample-sd',
  stem: 'Three quiz scores are a SAMPLE from a large class: L1 = {2, 4, 6}. Run 1-Var Stats and read the spread.',
  values: { data: A_DATA }, summaryPage: false,
  oracle: { kind: 'one-var', values: A_DATA, freq: null },
  interpretation: {
    title: 'SAMPLE OR POPULATION SD?',
    note: 'Sx divides by n - 1 (a sample). sigma x divides by n (a whole population).',
    questions: [
      choose('Sample SD', 'These scores are a sample. Which line is the sample standard deviation?', 'Sx', [
        ['Sx', 'Sx = ' + short(a.Sx)],
        ['sigmax', 'sigma x = ' + short(a.sigmaX), 'sigma x divides by n = 3: it treats L1 as the whole population. A sample uses Sx.'],
        ['xbar', 'x-bar = ' + short(a.mean), 'x-bar is the mean, the center of the data. The question asks for the spread.'],
      ]),
      choose('Sx divides by', 'Sx is larger than sigma x. Sx divides the sum of squared deviations by:', 'n-1', [
        ['n-1', 'n - 1 = ' + (a.n - 1)],
        ['n', 'n = ' + a.n, 'Dividing by n = 3 gives sigma x = ' + short(a.sigmaX) + ', the population SD.'],
        ['sum', 'Sum x = ' + a.sum, 'Sum x is the total of the scores, not the divisor of a standard deviation.'],
      ]),
    ],
  },
};

const populationSd = {
  skillId: 'one-var-stats', suffix: 'population-sd',
  stem: 'A lab has exactly three machines and you measured ALL of them: L1 = {2, 4, 6}. Run 1-Var Stats and read the spread.',
  values: { data: A_DATA, population: true }, summaryPage: false,
  oracle: { kind: 'one-var', values: A_DATA, freq: null },
  interpretation: {
    title: 'SAMPLE OR POPULATION SD?',
    note: 'A whole population uses sigma x (divide by n). A sample uses Sx (divide by n - 1).',
    questions: [
      choose('Population SD', 'L1 is the whole population. Which line is its standard deviation?', 'sigmax', [
        ['Sx', 'Sx = ' + short(a.Sx), 'Sx divides by n - 1 to estimate a population from a sample. Here L1 IS the population: use sigma x.'],
        ['sigmax', 'sigma x = ' + short(a.sigmaX)],
        ['n', 'n = ' + a.n, 'n counts the machines. It is not a measure of spread.'],
      ]),
      number('Population SD value', 'What is the population standard deviation (5 digits)?', a.sigmaX, [
        [a.Sx, 'Sx = 2 is the sample SD (divide by n - 1). The population SD divides by n.'],
        [a.mean, '4 is the mean x-bar, not a spread.'],
      ]),
    ],
  },
};

// ---------- B. Frequency lists ----------
const B_FREQ = [1, 2, 1];
const b = oneVarStats(A_DATA, B_FREQ);
const frequencyList = {
  skillId: 'one-var-stats', suffix: 'freq',
  stem: 'L1 = {2, 4, 6} are scores. L2 = {1, 2, 1} says how many students got each score. Run 1-Var Stats with FreqList L2.',
  values: { data: A_DATA, freq: B_FREQ }, freqList: 'L2', summaryPage: false,
  oracle: { kind: 'one-var', values: A_DATA, freq: B_FREQ },
  interpretation: {
    title: 'WHAT DOES THE FREQUENCY LIST MEAN?',
    note: 'A FreqList counts how many times each L1 value occurred.',
    questions: [
      number('n', 'How many students (observations) did the calculator use?', b.n, [
        [A_DATA.length, '3 is the number of rows. L2 says the score 4 occurred twice: 1 + 2 + 1 = 4 observations.'],
        [A_DATA.length + B_FREQ.length, '6 treats L1 and L2 as six data values. L2 holds counts, not scores.'],
      ]),
      choose('Data set', 'Which data set did the calculator summarize?', '2446', [
        ['246', '{2, 4, 6}', 'That ignores FreqList. With L2 = {1, 2, 1} the score 4 counts twice.'],
        ['2446', '{2, 4, 4, 6}'],
        ['246121', '{2, 4, 6, 1, 2, 1}', 'L2 is not more data. Each L2 entry counts the L1 value beside it.'],
      ]),
    ],
  },
};

const B_ZERO = [1, 0, 1];
const bz = oneVarStats(A_DATA, B_ZERO);
const zeroRow = {
  skillId: 'one-var-stats', suffix: 'zero-row',
  stem: 'L2 = {1, 0, 1} says how often each score in L1 = {2, 4, 6} occurred. Run 1-Var Stats with FreqList L2.',
  values: { data: A_DATA, freq: B_ZERO }, freqList: 'L2', summaryPage: false,
  oracle: { kind: 'one-var', values: A_DATA, freq: B_ZERO },
  interpretation: {
    title: 'A ZERO IN THE FREQUENCY LIST',
    note: 'A frequency of 0 leaves that value out: it was never observed.',
    questions: [
      choose('Zero row', 'What does the 0 in row 2 of L2 mean?', 'not-observed', [
        ['zero-value', 'A score of 0 was observed', 'A frequency counts how often the L1 value occurred. It is not a score itself.'],
        ['not-observed', 'The score 4 was not observed'],
        ['once', 'The score 4 was observed once', 'Once would be a frequency of 1. A 0 means the score 4 never occurred.'],
      ]),
      number('n', 'How many observations did the calculator use?', bz.n, [
        [A_DATA.length, 'Only rows with a positive frequency count: 1 + 0 + 1 = 2 observations.'],
        [4, '4 is the value in the zero row, not a count of observations.'],
      ]),
    ],
  },
};

// ---------- C. All-zero frequency list (no observations) ----------
const C_ZERO = [0, 0, 0];
const c = oneVarStats(A_DATA, C_ZERO);
const noObservations = {
  skillId: 'one-var-stats', suffix: 'no-observations',
  stem: 'Someone typed L2 = {0, 0, 0} as the frequencies for L1 = {2, 4, 6}. Run 1-Var Stats with FreqList L2 and explain the result.',
  values: { data: A_DATA, freq: C_ZERO }, freqList: 'L2', summaryPage: false,
  oracle: { kind: 'one-var', values: A_DATA, freq: C_ZERO },
  interpretation: {
    title: 'WHY DID THE CALCULATION FAIL?',
    note: 'With no observations, n = 0 and the mean would divide by 0.',
    questions: [
      choose('Diagnosis', 'The calculator says the calculation divides by 0. Why?', 'no-observations', [
        ['too-few', 'L1 needs more than 3 values', 'Three values are enough. The frequencies say none of them occurred.'],
        ['mean-zero', 'The mean of the data is 0', 'There is no mean: with no observations the mean is a sum divided by 0.'],
        ['no-observations', 'Every frequency is 0: no observations'],
        ['data-list', 'L2 must hold data, not counts', 'L2 is a FreqList, so counts are right. Here every count is 0.'],
      ]),
      number('n', 'How many observations do L1 and L2 describe?', c.n, [
        [A_DATA.length, 'There are 3 rows, but each one occurred 0 times: 0 + 0 + 0 = 0.'],
        [1, 'Every frequency is 0, so not even one observation exists.'],
      ]),
    ],
  },
};

// ---------- D. Modified boxplot and the outlier ----------
const PLOT_DATA = [1, 2, 2, 3, 3, 9];
const d = modifiedBoxplot(PLOT_DATA);
const dMean = oneVarStats(PLOT_DATA).mean;
const outlier = {
  skillId: 'modified-boxplot', suffix: 'outlier',
  stem: 'L1 = {1, 2, 2, 3, 3, 9}. Draw a modified boxplot, use ZoomStat, then TRACE right to the last stop.',
  values: { data: PLOT_DATA }, traceRights: 3,
  hints: {
    'Choose TRACE.': 'TRACE starts at the median (Med).',
    'Choose RIGHT.': 'Move right: TRACE stops at Q3, the whisker end (X), then the largest value.',
  },
  oracle: { kind: 'modified-boxplot', values: PLOT_DATA, endStop: { label: 'maxX', x: d.max } },
  interpretation: {
    title: 'WHISKER, MAXIMUM OR OUTLIER?',
    note: 'Fences: Q1 - 1.5 IQR = ' + d.lowerFence + ' and Q3 + 1.5 IQR = ' + d.upperFence + '. Whiskers stop at the last value inside them.',
    questions: [
      number('Median', 'What is the median (TRACE Med=)?', d.median, [
        [d.q1, d.q1 + ' is Q1, the median of the lower half.'],
        [d.q3, d.q3 + ' is Q3, the median of the upper half.'],
        [dMean, 'That is the mean x-bar. A boxplot marks the median.'],
      ]),
      number('Upper whisker', 'Where does the upper whisker end (TRACE X=)?', d.upperWhisker, [
        [d.max, d.max + ' is the maximum, but it is beyond the fence ' + d.upperFence + ', so the whisker stops at ' + d.upperWhisker + '.'],
        [d.upperFence, d.upperFence + ' is the fence. A whisker ends at a data value: the largest inside the fence.'],
      ]),
      choose('Outlier', 'Which value(s) does the modified boxplot show as outliers?', 'high', [
        ['high', d.outliers.join(' and ') + ' only'],
        ['both-ends', d.min + ' and ' + d.max, d.min + ' is above the lower fence ' + d.lowerFence + ', so it is the low whisker end.'],
        ['none', 'None: ' + d.max + ' is just the maximum', 'The maximum is an outlier when it lies beyond Q3 + 1.5 IQR = ' + d.upperFence + '.'],
      ]),
    ],
  },
};

// ---------- E. Histogram bins (ZoomStat layout from the ROM fixture) ----------
// plots-clocked433.json: ZoomStat bins start at 1 with width 2; TRACE reaches 6 bins.
const BIN_START = 1, BIN_WIDTH = 2, BIN_COUNT = 6;
const bins = histogramBins(PLOT_DATA, BIN_START, BIN_WIDTH, BIN_COUNT);
const binOf = x => binFor(x, BIN_START, BIN_WIDTH, BIN_COUNT);
const below = bin => ({ lo: bin.lo - BIN_WIDTH, hi: bin.lo });
const emptyBin = bins.find(bin => bin.count === 0);
const binThree = bins[binOf(3).index], binNine = bins[binOf(9).index];
const histogramBinsVariant = {
  skillId: 'histogram', suffix: 'bins',
  stem: 'L1 = {1, 2, 2, 3, 3, 9}. Draw the histogram, use ZoomStat, and TRACE the bins. Each bin is [min, max).',
  values: { data: PLOT_DATA }, traceRights: 1,
  // No general ZoomStat bin rule is verified, so the problem supplies the window the ROM showed.
  histogramWindow: { xmin: BIN_START, xscl: BIN_WIDTH, bins: BIN_COUNT },
  hints: {
    'Choose TRACE.': 'TRACE shows a bin: lower boundary (min=), upper boundary (max<) and count (n=).',
    'Choose RIGHT.': 'Move right to the next bin.',
  },
  oracle: { kind: 'histogram', values: PLOT_DATA, start: BIN_START, width: BIN_WIDTH, binCount: BIN_COUNT },
  interpretation: {
    title: 'WHICH BIN, HOW MANY?',
    note: 'A bin [min, max) includes its lower boundary and excludes its upper boundary.',
    questions: [
      choose('Bin for 3', 'Which bin counts the observation 3?', binKey(binThree), [
        [binKey(below(binThree)), binText(below(binThree)), '3 is not less than 3, so it is not in [1, 3). Bins exclude their upper boundary.'],
        [binKey(binThree), binText(binThree)],
        ['both', 'Both ' + binText(below(binThree)) + ' and ' + binText(binThree), 'Each observation is counted in exactly one bin: the one that starts at or below it.'],
      ]),
      choose('Bin for 9', 'Which bin counts the observation 9?', binKey(binNine), [
        [binKey(below(binNine)), binText(below(binNine)), '9 is not less than 9, so it is not in [7, 9). It starts the bin [9, 11).'],
        [binKey(binNine), binText(binNine)],
      ]),
      number('Empty bin', 'How many observations are in ' + binText(emptyBin) + '?', emptyBin.count, [
        [binThree.count, binThree.count + ' is the count of ' + binText(binThree) + '. TRACE shows n=0 for ' + binText(emptyBin) + '.'],
        [binNine.count, binNine.count + ' is the count of ' + binText(binNine) + '. No value lies from ' + emptyBin.lo + ' up to ' + emptyBin.hi + '.'],
      ]),
    ],
  },
};

// ---------- F. Binomial pdf vs cdf (fixtures: binomial-*-clocked431.json) ----------
const fair = { n: 10, p: 0.5, x: 3 };
const pdf3 = binompdf(10, 0.5, 3), cdf3 = binomcdf(10, 0.5, 3);
// Hints describe the event, not the function name: choosing pdf or cdf is the task.
const pdfHints = {
  'Scroll until A:binompdf( is highlighted.': 'Scroll to the function for P(exactly 3 heads): one exact count.',
  'Open the binompdf wizard.': 'Open the function you chose.',
};
const cdfHints = event => ({
  'Scroll until B:binomcdf( is highlighted.': 'Scroll to the function for ' + event + ': it adds up counts from 0.',
  'Open the binomcdf wizard.': 'Open the function you chose.',
});
const exactlyThree = {
  skillId: 'binompdf', suffix: 'exactly-3', title: 'Binomial probability',
  stem: 'A fair coin is tossed 10 times. X = the number of heads. Find P(exactly 3 heads).',
  values: fair, hints: pdfHints,
  oracle: { kind: 'binompdf', ...fair },
  interpretation: {
    title: 'EXACTLY OR AT MOST?',
    note: 'binompdf gives one exact count. binomcdf adds every count from 0 up to x.',
    questions: [
      choose('Event', 'binompdf(10, .5, 3) is the probability of which event?', 'X=3', [
        ['X<=3', 'P(X <= 3)', 'At most 3 is binomcdf: it adds 0, 1, 2 and 3 heads. binompdf gives exactly 3.'],
        ['X=3', 'P(X = 3)'],
        ['X>=3', 'P(X >= 3)', 'At least 3 adds 3 through 10 heads. binompdf gives exactly 3.'],
      ]),
      number('Probability', 'What is P(exactly 3 heads)?', pdf3, [
        [cdf3, 'That is binomcdf(10, .5, 3) = P(X <= 3): it also adds 0, 1 and 2 heads.'],
        [0.3, '0.3 is 3/10, a proportion of tosses, not a binomial probability.'],
        [0.5, '0.5 is p, the chance of heads on one toss.'],
      ]),
    ],
  },
};

const atMostThree = {
  skillId: 'binomcdf', suffix: 'at-most-3', title: 'Binomial probability',
  stem: 'A fair coin is tossed 10 times. X = the number of heads. Find P(at most 3 heads).',
  values: fair, hints: cdfHints('P(at most 3 heads)'),
  oracle: { kind: 'binomcdf', ...fair },
  interpretation: {
    title: 'EXACTLY OR AT MOST?',
    note: 'binomcdf(n, p, x) = P(X <= x): every count from 0 up to and including x.',
    questions: [
      choose('Event', 'binomcdf(10, .5, 3) is the probability of which event?', 'X<=3', [
        ['X=3', 'P(X = 3)', 'Exactly 3 is binompdf. binomcdf adds 0, 1, 2 and 3 heads.'],
        ['X<3', 'P(X < 3)', 'binomcdf includes x itself: P(X <= 3), not P(X < 3).'],
        ['X<=3', 'P(X <= 3)'],
      ]),
      number('Probability', 'What is P(at most 3 heads)?', cdf3, [
        [pdf3, 'That is P(X = 3) only (binompdf). At most 3 also adds 0, 1 and 2 heads.'],
        [1 - cdf3, 'That is 1 - P(X <= 3) = P(X >= 4), the complement.'],
      ]),
    ],
  },
};

const neverHeads = {
  skillId: 'binomcdf', suffix: 'never-heads', title: 'Binomial probability',
  stem: 'A trick coin never lands heads (p = 0). It is tossed 10 times. Find P(at most 0 heads).',
  values: { n: 10, p: 0, x: 0 }, hints: cdfHints('P(at most 0 heads)'),
  oracle: { kind: 'binomcdf', n: 10, p: 0, x: 0 },
  interpretation: {
    title: 'A CERTAIN EVENT',
    note: 'With p = 0 every toss is tails, so X = 0 every time.',
    questions: [
      number('Probability', 'What is P(X <= 0) when p = 0?', binomcdf(10, 0, 0), [
        [0, 'With p = 0 no toss can be heads, so X = 0 is certain: the probability is 1.'],
        [0.5, '0.5 would need a fair coin. This coin never lands heads.'],
      ]),
      choose('Why', 'Why does the calculator give that value?', 'all-zero', [
        ['impossible', 'X = 0 is impossible', 'X = 0 is the only possible outcome when p = 0.'],
        ['all-zero', 'Every outcome has X = 0'],
        ['rounding', 'It is rounding a small number', 'Nothing is rounded: every one of the 10 tosses is tails.'],
      ]),
    ],
  },
};

const alwaysHeads = {
  skillId: 'binomcdf', suffix: 'always-heads', title: 'Binomial probability',
  stem: 'A trick coin always lands heads (p = 1). It is tossed 10 times. Find P(at most 3 heads).',
  values: { n: 10, p: 1, x: 3 }, hints: cdfHints('P(at most 3 heads)'),
  oracle: { kind: 'binomcdf', n: 10, p: 1, x: 3 },
  interpretation: {
    title: 'AN IMPOSSIBLE EVENT',
    note: 'With p = 1 every toss is heads, so X = 10 every time.',
    questions: [
      number('Probability', 'What is P(X <= 3) when p = 1?', binomcdf(10, 1, 3), [
        [1, 'With p = 1 every toss is heads, so X = 10. X <= 3 cannot happen.'],
        [cdf3, 'That is the fair-coin answer (p = .5). This coin always lands heads.'],
      ]),
      choose('Why', 'Why does the calculator give that value?', 'all-ten', [
        ['all-ten', 'Every outcome has X = 10'],
        ['all-zero', 'Every outcome has X = 0', 'p = 1 means every toss is heads, so X = 10, not 0.'],
        ['rounding', 'It is rounding a small number', 'Nothing is rounded: X <= 3 is impossible when all 10 tosses are heads.'],
      ]),
    ],
  },
};

export const PARK_CALCULATOR_VARIANTS = [
  sampleSd, populationSd, frequencyList, zeroRow, noObservations,
  outlier, histogramBinsVariant, exactlyThree, atMostThree, neverHeads, alwaysHeads,
];

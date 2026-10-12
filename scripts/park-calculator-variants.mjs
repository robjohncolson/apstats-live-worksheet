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

// ---------- G. Breadth for the U1 skills (2026-10-12) ----------
// Realistic contexts; the questions are the AP skill (shape, outliers, center vs spread).
const expect = (condition, message) => { if (!condition) throw new Error('park-calculator-variants: ' + message); };
const listText = values => values.join(', ');
const plotHints = {
  histogram: { 'Choose TRACE.': 'TRACE shows a bin: min=, max< and its count n=.', 'Choose RIGHT.': 'Move right to the next bin.' },
  boxplot: { 'Choose TRACE.': 'TRACE starts at the median (Med).', 'Choose RIGHT.': 'Move right: Q3, then the whisker end, then any outlier.' },
};

// The trainer's ZoomStat layout without a ROM window: bins start at minX, width = range /
// ceil(sqrt(n)) (at least 1). Every dataset below makes that width a whole number, so the
// bins are readable; the oracle then checks the counts independently.
function zoomStatBins(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const width = Math.max(1, (hi - lo) / Math.ceil(Math.sqrt(values.length)));
  expect(Number.isInteger(width), 'histogram width must be whole: ' + width);
  return { start: lo, width, binCount: Math.ceil((hi - lo) / width) + 1 };
}
function histogramVariant(suffix, values, stem, interpretation) {
  const layout = zoomStatBins(values);
  return { skillId: 'histogram', suffix, stem, values: { data: values }, traceRights: 1, hints: plotHints.histogram,
    oracle: { kind: 'histogram', values, ...layout }, interpretation };
}

// Right-skewed commutes.
const COMMUTE = [2, 3, 4, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 24, 33, 42];
const commute = oneVarStats(COMMUTE), commuteBins = histogramBins(COMMUTE, ...Object.values(zoomStatBins(COMMUTE)));
const longCommutes = commuteBins.filter(bin => bin.lo >= 22).reduce((sum, bin) => sum + bin.count, 0);
expect(commute.mean > commute.fiveNumber.median, 'commutes: the tail pulls the mean up');
const histogramSkewed = histogramVariant('skewed', COMMUTE,
  'Commute distances (miles) for 16 workers: ' + listText(COMMUTE) + '. Draw the histogram with ZoomStat and describe its shape.', {
    title: 'DESCRIBE THE SHAPE',
    note: 'A long tail toward large values means skewed right. The tail pulls the mean toward it.',
    questions: [
      choose('Shape', 'What is the shape of the commute distances?', 'right', [
        ['right', 'Skewed right'],
        ['left', 'Skewed left', 'The long tail is on the HIGH side, toward 42 miles. A tail to the right is skewed right.'],
        ['symmetric', 'Roughly symmetric', 'Most workers are in the first bar and the bars trail off to the right: not symmetric.'],
      ]),
      choose('Mean vs median', 'For this shape, how do the mean and the median compare?', 'mean-higher', [
        ['mean-higher', 'The mean is larger than the median'],
        ['median-higher', 'The median is larger than the mean', 'The few long commutes pull the mean UP, toward the tail. The median resists them.'],
        ['equal', 'They are about equal', 'Equal mean and median fit a symmetric shape. Here the long tail pulls the mean right.'],
      ]),
      number('Long commutes', 'How many workers commute 22 miles or more?', longCommutes, [
        [commuteBins[2].count, 'That counts only [22, 32). Add the bars [32, 42) and [42, 52) too.'],
        [COMMUTE.length - longCommutes, 'That many workers commute LESS than 22 miles.'],
      ]),
    ],
  });

// Roughly symmetric heights.
const HEIGHTS = [60, 64, 65, 66, 67, 68, 68, 69, 70, 70, 71, 72, 73, 74, 75, 76];
const heightBins = histogramBins(HEIGHTS, ...Object.values(zoomStatBins(HEIGHTS)));
const tallest = Math.max(...heightBins.map(bin => bin.count));
expect(heightBins.map(bin => bin.count).join() === '1,4,6,4,1', 'heights: a symmetric mound');
const histogramSymmetric = histogramVariant('symmetric', HEIGHTS,
  'Heights (inches) of 16 students: ' + listText(HEIGHTS) + '. Draw the histogram with ZoomStat and describe its shape.', {
    title: 'DESCRIBE THE SHAPE',
    note: 'A symmetric mound with no outliers: summarize it with the mean and standard deviation.',
    questions: [
      choose('Shape', 'What is the shape of the heights?', 'symmetric', [
        ['symmetric', 'Roughly symmetric'],
        ['right', 'Skewed right', 'The bars rise to the middle bar and fall the same way on both sides: no long tail.'],
        ['uniform', 'Uniform (all bars equal)', 'The middle bar has ' + tallest + ' students and the end bars have 1: the bars are not equal.'],
      ]),
      choose('Summary', 'Which pair best summarizes center and spread here?', 'mean-sd', [
        ['mean-sd', 'Mean and standard deviation'],
        ['median-iqr', 'Median and IQR', 'Median and IQR are for skewed data or outliers. This shape is symmetric with no outliers.'],
      ]),
      number('Tallest bar', 'How many students are in the tallest bar?', tallest, [
        [heightBins[1].count, heightBins[1].count + ' is the bar [64, 68). TRACE right to the tallest bar.'],
        [HEIGHTS.length, HEIGHTS.length + ' is every student. One bar holds only some of them.'],
      ]),
    ],
  });

// Quiz scores with a gap.
const QUIZ = [40, 42, 45, 61, 63, 65, 66, 68, 70, 71, 73, 74, 75, 77, 79, 80];
const quizBins = histogramBins(QUIZ, ...Object.values(zoomStatBins(QUIZ)));
const gap = quizBins.find(bin => bin.count === 0);
expect(gap && gap.lo === 50, 'quiz: the gap is [50, 60)');
const belowGap = quizBins.filter(bin => bin.hi <= gap.lo).reduce((sum, bin) => sum + bin.count, 0);
const histogramGap = histogramVariant('gap', QUIZ,
  'Quiz scores of 16 students: ' + listText(QUIZ) + '. Draw the histogram with ZoomStat and look for a gap.', {
    title: 'FIND THE GAP',
    note: 'A gap is an empty bin inside the data. It can split off a separate group.',
    questions: [
      choose('Gap', 'Which bin is empty (the gap)?', binKey(gap), [
        [binKey(quizBins[0]), binText(quizBins[0]), 'TRACE shows n=' + quizBins[0].count + ' for ' + binText(quizBins[0]) + ': three students scored in the 40s.'],
        [binKey(gap), binText(gap)],
        [binKey(quizBins.at(-1)), binText(quizBins.at(-1)), binText(quizBins.at(-1)) + ' holds the score 80. A bin includes its lower boundary.'],
      ]),
      number('Below the gap', 'How many students scored below the gap?', belowGap, [
        [quizBins[2].count, quizBins[2].count + ' is the bar [60, 70), above the gap.'],
        [0, '0 is the gap itself. Count the bar BELOW it, [40, 50).'],
      ]),
      choose('Low scores', 'How would you describe the scores in the 40s?', 'cluster', [
        ['cluster', 'A separate low cluster'],
        ['center', 'The center of the distribution', 'The center is in the 60s and 70s, where most scores are.'],
        ['typical', 'Typical scores, like the rest', 'An empty bin separates them from the other ' + (QUIZ.length - belowGap) + ' scores.'],
      ]),
    ],
  });

function boxplotVariant(suffix, values, stem, traceRights, endLabel, interpretation) {
  const box = modifiedBoxplot(values);
  const end = { Q3: box.q3, X: box.upperWhisker, maxX: box.max }[endLabel];
  return { skillId: 'modified-boxplot', suffix, stem, values: { data: values }, traceRights, hints: plotHints.boxplot,
    oracle: { kind: 'modified-boxplot', values, endStop: { label: endLabel, x: end } }, interpretation };
}

// A high outlier: TRACE right reaches Q3, the whisker end (X) and the outlier (maxX), as in variant D.
const HOMEWORK = [15, 20, 25, 25, 30, 30, 35, 40, 40, 45, 50, 55, 120];
const hw = modifiedBoxplot(HOMEWORK), hwMean = oneVarStats(HOMEWORK).mean;
expect(hw.outliers.join() === '120' && hw.upperWhisker === 55, 'homework: 120 is the only outlier');
const boxplotHigh = boxplotVariant('high-outlier', HOMEWORK,
  'Minutes 13 students spent on homework last night: ' + listText(HOMEWORK) + '. Draw a modified boxplot and identify any outliers.', 3, 'maxX', {
    title: 'FIND THE OUTLIER',
    note: 'Fences: Q1 - 1.5 IQR = ' + hw.lowerFence + ' and Q3 + 1.5 IQR = ' + hw.upperFence + '. Beyond a fence is an outlier.',
    questions: [
      choose('Outliers', 'Which value(s) does the modified boxplot show as outliers?', 'high', [
        ['high', '120 only'],
        ['both', '15 and 120', '15 is above the lower fence ' + hw.lowerFence + ', so it is the low whisker end.'],
        ['none', 'None: 120 is just the maximum', '120 is beyond Q3 + 1.5 IQR = ' + hw.upperFence + ', so it is an outlier.'],
      ]),
      number('Upper whisker', 'Where does the upper whisker end?', hw.upperWhisker, [
        [hw.max, '120 is the outlier. The whisker stops at the largest value inside the fence.'],
        [hw.upperFence, hw.upperFence + ' is the fence. A whisker ends at a data value.'],
      ]),
      choose('Resistant', 'Which measure of center is resistant to the 120?', 'median', [
        ['median', 'The median, ' + hw.median],
        ['mean', 'The mean, ' + short(hwMean), 'The 120 pulls the mean up. The median depends only on the middle value.'],
      ]),
    ],
  });

// A low outlier. Leftward TRACE stops are not ROM-verified, so the route stops at Q3.
const TEST = [31, 68, 72, 75, 77, 78, 80, 81, 83, 85, 86, 88, 90, 94];
const tb = modifiedBoxplot(TEST), testMean = oneVarStats(TEST).mean;
expect(tb.outliers.join() === '31' && tb.lowerWhisker === 68 && testMean < tb.median, 'test: 31 is the only outlier');
const boxplotLow = boxplotVariant('low-outlier', TEST,
  'Unit test scores of 14 students: ' + listText(TEST) + '. Draw a modified boxplot and identify any outliers.', 1, 'Q3', {
    title: 'FIND THE OUTLIER',
    note: 'Fences: Q1 - 1.5 IQR = ' + tb.lowerFence + ' and Q3 + 1.5 IQR = ' + tb.upperFence + '.',
    questions: [
      choose('Outliers', 'Which value(s) does the modified boxplot show as outliers?', 'low', [
        ['low', '31 only'],
        ['both', '31 and 94', '94 is below the upper fence ' + tb.upperFence + ', so it is the high whisker end.'],
        ['none', 'None: 31 is just the minimum', '31 is below Q1 - 1.5 IQR = ' + tb.lowerFence + ', so it is an outlier.'],
      ]),
      number('Lower whisker', 'Where does the lower whisker end?', tb.lowerWhisker, [
        [tb.min, '31 is the outlier. The whisker stops at the smallest value inside the fence.'],
        [tb.lowerFence, tb.lowerFence + ' is the fence. A whisker ends at a data value.'],
      ]),
      choose('Mean vs median', 'How does the outlier affect the mean?', 'lower', [
        ['lower', 'Mean is below the median'],
        ['higher', 'Mean is above the median', 'A LOW outlier pulls the mean down: mean ' + short(testMean) + ', median ' + tb.median + '.'],
        ['equal', 'Mean equals the median', 'The 31 pulls the mean down to ' + short(testMean) + '. The median stays ' + tb.median + '.'],
      ]),
    ],
  });

// No outliers.
const PULSE = [58, 62, 64, 66, 68, 70, 71, 72, 74, 75, 77, 79, 82, 85, 88];
const pulse = modifiedBoxplot(PULSE);
expect(pulse.outliers.length === 0, 'pulse: no outliers');
const boxplotNone = boxplotVariant('no-outlier', PULSE,
  'Resting pulse rates of 15 adults: ' + listText(PULSE) + '. Draw a modified boxplot and identify any outliers.', 1, 'Q3', {
    title: 'ANY OUTLIERS?',
    note: 'An outlier lies below Q1 - 1.5 IQR or above Q3 + 1.5 IQR. The extremes are not automatically outliers.',
    questions: [
      choose('Outliers', 'Which value(s) does the modified boxplot show as outliers?', 'none', [
        ['none', 'None'],
        ['both', '58 and 88', '58 and 88 are the extremes, but both lie inside the fences ' + pulse.lowerFence + ' and ' + pulse.upperFence + '.'],
        ['high', '88 only', '88 is below Q3 + 1.5 IQR = ' + pulse.upperFence + ', so it is the whisker end.'],
      ]),
      number('Upper fence', 'What is Q3 + 1.5 IQR, the upper fence?', pulse.upperFence, [
        [pulse.max, pulse.max + ' is the maximum. The fence is Q3 + 1.5 x IQR = ' + pulse.q3 + ' + 1.5 x ' + pulse.iqr + '.'],
        [pulse.q3 + pulse.iqr, 'That adds 1 IQR. The fence adds 1.5 IQR to Q3.'],
      ]),
    ],
  });

// Plain 1-Var Stats samples.
const BATTERY = [9.8, 10.4, 11.1, 9.5, 10.9, 10.2, 11.8, 10, 9.9, 10.7, 11.3, 10.6];
const battery = oneVarStats(BATTERY);
expect(battery.mean !== battery.fiveNumber.median, 'battery: the median distractor differs from the mean');
const oneVarMeanSd = {
  skillId: 'one-var-stats', suffix: 'mean-sd',
  stem: 'A sample of 12 batteries lasted (hours): ' + listText(BATTERY) + '. Find the mean and standard deviation.',
  values: { data: BATTERY }, summaryPage: false,
  oracle: { kind: 'one-var', values: BATTERY, freq: null },
  interpretation: {
    title: 'MEAN AND STANDARD DEVIATION',
    note: 'x-bar is the mean. Sx is the sample standard deviation: a typical distance from the mean.',
    questions: [
      number('Mean', 'What is the mean battery life (x-bar)?', battery.mean, [
        [battery.sum, 'That is Sum x, the total of all 12 lifetimes. The mean divides it by n = 12.'],
        [battery.fiveNumber.median, 'That is the median. 1-Var Stats shows the mean as x-bar.'],
      ]),
      number('SD', 'These batteries are a sample. What is their standard deviation?', battery.Sx, [
        [battery.sigmaX, 'sigma x divides by n: the population SD. A sample uses Sx.'],
        [battery.fiveNumber.max - battery.fiveNumber.min, 'That is the range, max - min. The SD is a typical distance from the mean.'],
      ]),
      choose('Meaning', 'What does Sx describe?', 'typical', [
        ['typical', 'Typical distance from the mean'],
        ['range', 'Distance from shortest to longest', 'That is the range. Sx is a typical distance from the mean.'],
        ['error', 'How accurate x-bar is', 'Sx describes how spread out the 12 lifetimes are, not how accurate x-bar is.'],
      ]),
    ],
  },
};

const AGES = [24, 26, 29, 31, 33, 35, 38, 40, 42, 45, 47, 51, 54, 58, 63];
const ages = oneVarStats(AGES), agesFive = ages.fiveNumber;
const oneVarFiveNumber = {
  skillId: 'one-var-stats', suffix: 'five-number',
  stem: 'Ages of 15 teachers at a school: ' + listText(AGES) + '. Find the five-number summary.',
  values: { data: AGES }, summaryPage: true,
  oracle: { kind: 'one-var', values: AGES, freq: null },
  interpretation: {
    title: 'READ THE FIVE-NUMBER SUMMARY',
    note: 'IQR = Q3 - Q1: the spread of the middle half of the data.',
    questions: [
      number('Median', 'What is the median age (Med)?', agesFive.median, [
        [agesFive.q1, agesFive.q1 + ' is Q1, the median of the lower half.'],
        [ages.mean, 'That is the mean x-bar. The median is Med.'],
      ]),
      number('IQR', 'What is the IQR?', agesFive.q3 - agesFive.q1, [
        [agesFive.max - agesFive.min, 'That is the range, maxX - minX. IQR = Q3 - Q1.'],
        [agesFive.q3, agesFive.q3 + ' is Q3 itself. Subtract Q1.'],
      ]),
      choose('Middle half', 'The middle half of the ages lies between:', 'q1-q3', [
        ['q1-q3', agesFive.q1 + ' and ' + agesFive.q3],
        ['min-max', agesFive.min + ' and ' + agesFive.max, 'That is every teacher. The middle half lies between Q1 and Q3.'],
        ['q1-med', agesFive.q1 + ' and ' + agesFive.median, 'That is one quarter: Q1 to the median.'],
      ]),
    ],
  },
};

const ALLOWANCE = [0, 5, 5, 10, 10, 10, 15, 20, 20, 60];
const allowance = oneVarStats(ALLOWANCE), allowanceBox = modifiedBoxplot(ALLOWANCE);
const aboveMean = ALLOWANCE.filter(value => value > allowance.mean).length;
expect(allowanceBox.outliers.join() === '60', 'allowance: 60 is an outlier');
const oneVarCenter = {
  skillId: 'one-var-stats', suffix: 'center',
  stem: 'Weekly allowance (dollars) of 10 teens: ' + listText(ALLOWANCE) + '. Find the five-number summary.',
  values: { data: ALLOWANCE }, summaryPage: true,
  oracle: { kind: 'one-var', values: ALLOWANCE, freq: null },
  interpretation: {
    title: 'WHICH CENTER?',
    note: 'One large value pulls the mean toward it. The median resists it.',
    questions: [
      number('Median', 'What is the median allowance (Med)?', allowance.fiveNumber.median, [
        [allowance.fiveNumber.q1, allowance.fiveNumber.q1 + ' is Q1, the median of the lower half.'],
        [allowance.fiveNumber.q3, allowance.fiveNumber.q3 + ' is Q3, the median of the upper half.'],
      ]),
      choose('Typical', 'The mean is ' + short(allowance.mean) + '. Which center better describes a typical teen?', 'median', [
        ['median', 'The median, ' + allowance.fiveNumber.median],
        ['mean', 'The mean, ' + short(allowance.mean), 'The 60 pulls the mean up: only ' + aboveMean + ' of 10 teens get more than ' + short(allowance.mean) + '.'],
      ]),
      choose('Outlier', 'Is 60 an outlier by the 1.5 IQR rule?', 'yes', [
        ['yes', 'Yes, above Q3 + 1.5 IQR = ' + allowanceBox.upperFence],
        ['no', 'No, it is just the maximum', 'Q3 + 1.5 IQR = ' + allowanceBox.upperFence + ', and 60 is beyond it.'],
      ]),
    ],
  },
};

export const PARK_CALCULATOR_VARIANTS = [
  sampleSd, populationSd, frequencyList, zeroRow, noObservations,
  outlier, histogramBinsVariant, exactlyThree, atMostThree, neverHeads, alwaysHeads,
  histogramSkewed, histogramSymmetric, histogramGap, boxplotHigh, boxplotLow, boxplotNone,
  oneVarMeanSd, oneVarFiveNumber, oneVarCenter,
];

// Dot plots (skill 'dotplot'): small whole-number data drawn as a histogram on the calculator,
// then rebuilt dot by dot. The stem quotes exactly the list in L1, so calculator-variation.mjs
// can rewrite it for random data; the only other number a stem may carry is n. At most 5 equal
// values (the dot plot's answer tiles offer 0-5).
export const PARK_DOTPLOT_PROBLEMS = [
  { data: [1, 1, 2, 2, 2, 3, 4, 4, 5, 5], context: 'Number of pets owned by 10 students' },
  { data: [2, 2, 3, 4, 4, 4, 5, 5, 6, 6], context: 'Books read this month by 10 students' },
  { data: [0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 5], context: 'Number of siblings of 12 students' },
  { data: [0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 6, 7], context: 'Goals scored by a soccer team in 14 games' },
  { data: [5, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 10], context: 'Hours of sleep reported by 13 students' },
].map(({ data, context }) => ({
  values: { data },
  stem: context + ': ' + listText(data) + '. Graph the data with a histogram, then build the dot plot.',
}));

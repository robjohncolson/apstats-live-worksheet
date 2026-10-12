// Goal hints (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §1): one goal per route key for every problem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CALCULATOR_PROBLEMS } from './calculator-catalog.mjs';
import { GOALS, goalFor, goalSpans } from './calculator-goals.mjs';

test('every problem has exactly one goal per route key, and no other problem has goals', () => {
  assert.equal(CALCULATOR_PROBLEMS.length, 99);
  for (const problem of CALCULATOR_PROBLEMS) {
    const goals = GOALS[problem.id];
    assert(goals, problem.id + ' has goals');
    assert.equal(goals.length, problem.route.length, problem.id + ': goals parallel the route');
  }
  assert.deepEqual(Object.keys(GOALS).sort(), CALCULATOR_PROBLEMS.map(problem => problem.id).sort());
});

test('goal phrases are short, non-empty and end without a period', () => {
  for (const [problemId, goals] of Object.entries(GOALS)) {
    for (const goal of goals) {
      assert.equal(typeof goal, 'string', problemId);
      assert(goal.trim().length > 0, problemId + ': empty goal');
      assert.equal(goal, goal.trim(), problemId + ': padded goal ' + goal);
      // The Paste family names the real CE's second ENTER; it is the only phrase allowed past 40.
      const limit = goal.startsWith('Paste it to Home') ? 48 : 40;
      assert(goal.length <= limit, problemId + ': too long: ' + goal);
      assert(!goal.endsWith('.'), problemId + ': trailing period: ' + goal);
    }
  }
});

test('1-Var Stats: the spans follow the real screens', () => {
  assert.deepEqual(goalSpans('one-var-stats'), [
    { from: 0, to: 1, goal: 'Open STAT > CALC' },
    { from: 2, to: 2, goal: 'Pick 1:1-Var Stats' },
    { from: 3, to: 4, goal: 'Move down to Calculate' },
    { from: 5, to: 5, goal: 'Calculate' },
    { from: 6, to: 6, goal: 'Scroll to the five-number summary' },
  ]);
});

test('modified boxplot: STAT PLOT, the plot type, ZoomStat, TRACE', () => {
  const problem = CALCULATOR_PROBLEMS.find(item => item.id === 'modified-boxplot');
  assert.deepEqual(problem.route, ['2ND', 'Y=', 'ENTER', 'DOWN', 'RIGHT', 'RIGHT', 'RIGHT', 'ENTER', 'ZOOM', '9', 'TRACE', 'RIGHT']);
  assert.deepEqual(goalSpans('modified-boxplot'), [
    { from: 0, to: 1, goal: 'Open STAT PLOT (2ND Y=)' },
    { from: 2, to: 2, goal: 'Open Plot1 (check it is On)' },
    { from: 3, to: 3, goal: 'Move down to Type' },
    { from: 4, to: 7, goal: 'Pick the modified boxplot' },
    { from: 8, to: 9, goal: 'ZoomStat (ZOOM 9)' },
    { from: 10, to: 11, goal: 'TRACE across the plot' },
  ]);
});

// One fixture per route family: the exact keys and the goal spans, so an equal-length route
// change (or a goal drifting onto the wrong keys) cannot pass silently.
const FIXTURES = {
  'normalcdf': {
    route: '2ND VARS 2 (−) 1 2ND , 9 9 DOWN 2 4 0 DOWN 2 7 6 DOWN 3 8 DOWN ENTER',
    spans: [[0, 1, 'Open DISTR (2ND VARS)'], [2, 2, 'Pick 2:normalcdf('], [3, 8, 'Enter lower = -1E99'],
      [9, 9, 'Move down to upper'], [10, 12, 'Enter upper = 240'], [13, 13, 'Move down to μ'],
      [14, 16, 'Enter μ = 276'], [17, 17, 'Move down to σ'], [18, 19, 'Enter σ = 38'],
      [20, 20, 'Move down to Paste'], [21, 21, 'Paste it to Home (real CE: ENTER again)']],
  },
  'invnorm@1': {
    // The sigma field shows a default 1: CLEAR first, or the typed 1 is lost (sigma 00, answer 500).
    route: '2ND VARS 3 0 . 2 5 DOWN 5 0 0 DOWN CLEAR 1 0 0 DOWN DOWN ENTER',
    spans: [[0, 1, 'Open DISTR (2ND VARS)'], [2, 2, 'Pick 3:invNorm('], [3, 6, 'Enter area = 0.25'],
      [7, 7, 'Move down to μ'], [8, 10, 'Enter μ = 500'], [11, 11, 'Move down to σ'],
      [12, 15, 'Enter σ = 100'], [16, 17, 'Move down to Paste'], [18, 18, 'Paste it to Home (real CE: ENTER again)']],
  },
  'one-propztest': {
    route: 'STAT RIGHT RIGHT 5 0 . 7 DOWN 1 2 6 DOWN 2 0 0 DOWN RIGHT ENTER DOWN DOWN ENTER',
    spans: [[0, 2, 'Open STAT > TESTS'], [3, 3, 'Pick 5:1-PropZTest'], [4, 6, 'Enter p0 = 0.7'],
      [7, 7, 'Move down to x'], [8, 10, 'Enter x = 126'], [11, 11, 'Move down to n'], [12, 14, 'Enter n = 200'],
      [15, 15, 'Move down to prop'], [16, 17, 'Pick Ha: prop <p₀'], [18, 19, 'Move down to Calculate'], [20, 20, 'Calculate']],
  },
  'two-samp-ttest': {
    route: 'STAT RIGHT RIGHT 4 RIGHT DOWN 7 8 . 5 DOWN 9 . 2 DOWN 2 8 DOWN 7 3 . 1 DOWN 1 0 . 4 DOWN 3 2 DOWN DOWN DOWN DOWN ENTER',
    spans: [[0, 2, 'Open STAT > TESTS'], [3, 3, 'Pick 4:2-SampTTest'], [4, 4, 'Pick Stats for Inpt (real CE: ENTER)'],
      [5, 5, 'Move down to x̄1'], [6, 9, 'Enter x̄1 = 78.5'], [10, 10, 'Move down to Sx1'], [11, 13, 'Enter Sx1 = 9.2'],
      [14, 14, 'Move down to n1'], [15, 16, 'Enter n1 = 28'], [17, 17, 'Move down to x̄2'], [18, 21, 'Enter x̄2 = 73.1'],
      [22, 22, 'Move down to Sx2'], [23, 26, 'Enter Sx2 = 10.4'], [27, 27, 'Move down to n2'], [28, 29, 'Enter n2 = 32'],
      [30, 33, 'Move down to Calculate'], [34, 34, 'Calculate']],
  },
  'matrix-entry': {
    route: '2ND x⁻¹ RIGHT RIGHT ENTER 3 ENTER 2 ENTER 3 0 ENTER 7 0 ENTER 8 0 ENTER 6 0 ENTER 1 1 0 ENTER 5 0 ENTER',
    spans: [[0, 3, 'Open MATRIX > EDIT (2ND x⁻¹)'], [4, 4, 'Pick 1:[A]'], [5, 6, 'Set Rows = 3'], [7, 8, 'Set Columns = 2'],
      [9, 11, 'Enter row 1, column 1 = 30'], [12, 14, 'Enter row 1, column 2 = 70'], [15, 17, 'Enter row 2, column 1 = 80'],
      [18, 20, 'Enter row 2, column 2 = 60'], [21, 24, 'Enter row 3, column 1 = 110'], [25, 27, 'Enter row 3, column 2 = 50']],
  },
  'randint-sampling': {
    route: '4 2 STO→ MATH RIGHT RIGHT RIGHT 1 ENTER MATH RIGHT RIGHT RIGHT 8 1 DOWN 3 0 DOWN 5 DOWN ENTER ENTER',
    spans: [[0, 2, 'Store 42 as the rand seed'], [3, 6, 'Open MATH > PRB'], [7, 7, 'Pick 1:rand'],
      [8, 8, 'Run it: rand is now seeded'], [9, 12, 'Open MATH > PRB'], [13, 13, 'Pick 8:randIntNoRep('],
      [14, 14, 'Enter lower = 1'], [15, 15, 'Move down to upper'], [16, 17, 'Enter upper = 30'], [18, 18, 'Move down to n'],
      [19, 19, 'Enter n = 5'], [20, 20, 'Move down to Paste'], [21, 21, 'Paste it to Home'], [22, 22, 'Run the random draw']],
  },
  'linreg-a-plus-bx': {
    route: 'STAT RIGHT 8 DOWN DOWN DOWN DOWN ENTER',
    spans: [[0, 1, 'Open STAT > CALC'], [2, 2, 'Pick 8:LinReg(a+bx)'], [3, 6, 'Move down to Calculate'], [7, 7, 'Calculate']],
  },
};

for (const [problemId, fixture] of Object.entries(FIXTURES)) test(problemId + ': exact route keys and goal spans', () => {
  const problem = CALCULATOR_PROBLEMS.find(item => item.id === problemId);
  assert.deepEqual(problem.route, fixture.route.split(' '));
  assert.deepEqual(goalSpans(problemId), fixture.spans.map(([from, to, goal]) => ({ from, to, goal })));
});

test('a choice is one goal from the arrows through the ENTER that selects it', () => {
  for (const [problemId, goals] of Object.entries(GOALS)) {
    assert(!goals.includes('Select it'), problemId + ': ENTER carries the named goal');
  }
  assert.deepEqual(goalSpans('histogram').find(span => span.goal === 'Pick the histogram'), { from: 4, to: 6, goal: 'Pick the histogram' });
});

test('goalFor reads one step; unknown problems and steps have no goal', () => {
  assert.equal(goalFor('modified-boxplot', 5), 'Pick the modified boxplot');
  assert.equal(goalFor('modified-boxplot', 12), null);
  assert.equal(goalFor('no-such-problem', 0), null);
  assert.deepEqual(goalSpans('no-such-problem'), []);
});

test('spans cover the route without gaps', () => {
  for (const problem of CALCULATOR_PROBLEMS) {
    const spans = goalSpans(problem.id);
    assert.equal(spans[0].from, 0, problem.id);
    assert.equal(spans.at(-1).to, problem.route.length - 1, problem.id);
    spans.slice(1).forEach((span, i) => assert.equal(span.from, spans[i].to + 1, problem.id));
  }
});

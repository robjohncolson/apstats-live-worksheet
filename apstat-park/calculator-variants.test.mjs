// Interpretation variants A-F (ti84-transpile/APSTAT_PARK_CALCULATOR_HANDOFF_SPEC.md):
// fixture inputs, independent oracle answers, specific feedback, retry/timer rules and
// unchanged eligibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { CALCULATOR_PROBLEMS, CALCULATOR_LEVELS, eligibleLevels, challengeFor, initializeCalculator,
  answerMatches, answerTiles, createLevelRotation } from './calculator-curriculum.mjs';
import { createMissionEngine } from './calculator-engine.mjs';
import { createMission, pressMissionKey, advanceMission, KEYS, BOXPLOT_MS, HOLD_MS, tilesFor } from './calculator-mission.mjs';
import { createWorldDisplay } from './calculator-display.mjs';
import { oneVarStats, modifiedBoxplot, histogramBins, binompdf, binomcdf } from './calculator-oracles.mjs';
import { approachSteps } from './calculator-motion.mjs';

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
const create = sandbox.window.TI84Native.create;
const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/ti84/' + name, import.meta.url), 'utf8'));
const variants = CALCULATOR_PROBLEMS.filter(level => level.interpretation);
const level = id => CALCULATOR_PROBLEMS.find(item => item.id === id);
const answerOf = (problem, label) => challengeFor(problem).questions.find(question => question.label === label).answer;

// Finish the calculator route, as the relay does, and return the answer-phase state.
function atAnswers(problem) {
  const engine = createMissionEngine(create, problem.setup, problem.route, KEYS.map(tile => tile.key));
  const state = createMission(0, problem);
  let time = 0;
  for (const key of problem.route) pressMissionKey(state, key, ++time, engine.transitions(state));
  assert.equal(state.step, problem.route.length, problem.id);
  return state;
}
const keysFor = problem => challengeFor(problem).answers.map(String);

test('A-F are variants of existing skills and every new skill id is unchanged', () => {
  const ids = variants.map(problem => problem.id).sort();
  assert.deepEqual(ids, ['binomcdf@always-heads', 'binomcdf@at-most-3', 'binomcdf@never-heads', 'binompdf@exactly-3',
    'histogram@bins', 'modified-boxplot@outlier', 'one-var-stats@freq', 'one-var-stats@no-observations',
    'one-var-stats@population-sd', 'one-var-stats@sample-sd', 'one-var-stats@zero-row']);
  for (const problem of variants) {
    const base = CALCULATOR_LEVELS.find(item => item.id === problem.skillId);
    assert(base, problem.id + ' belongs to an existing skill');
    assert.equal(problem.procedureId, base.procedureId);
    assert.deepEqual(problem.coverage, base.coverage, problem.id + ' inherits coverage');
    assert.deepEqual(problem.dates, base.dates, problem.id + ' inherits dates');
  }
  assert.equal(CALCULATOR_LEVELS.some(item => item.interpretation), false, 'no new skill ids in the eligible bag');
});

test('eligibility is unchanged: a variant is playable exactly when its skill is', () => {
  const dates = ['2026-09-01', '2026-09-16', '2026-09-23', '2026-10-10', '2026-11-09', '2026-11-12', '2026-11-13', '2027-05-01'];
  for (const section of ['PeriodB', 'PeriodE', 'PeriodX'])
    for (const date of dates) {
      const eligible = new Set(eligibleLevels(section, date).map(item => item.id));
      for (const problem of variants) {
        assert.equal(eligibleLevels(section, date, [problem]).length === 1, eligible.has(problem.skillId), problem.id + ' ' + section + ' ' + date);
      }
    }
  // Binomial variants never open before the binomial lessons (topic 4.10).
  assert.equal(eligibleLevels('PeriodB', '2026-11-09', variants).some(item => item.procedureId.startsWith('binom')), false);
  // Rotation draws variants only through their eligible skill.
  const rotation = createLevelRotation(() => .99);
  const pool = eligibleLevels('PeriodB', '2026-10-10');
  for (let i = 0; i < 40; i++) {
    const next = rotation.next(pool);
    assert(pool.some(item => item.id === next.skillId), next.id);
  }
});

test('variant inputs are the ROM fixture inputs', () => {
  const stats = fixture('statistics-clocked432.json').cases;
  assert.deepEqual(level('one-var-stats@sample-sd').setup.lists, { L1: stats[0].dataset });
  assert.deepEqual(level('one-var-stats@freq').setup.lists, { L1: stats[1].dataset, L2: stats[1].frequencies });
  const zero = fixture('statistics-clocked432-zero-frequency.json').cases[0];
  assert.deepEqual(level('one-var-stats@zero-row').setup.lists, { L1: zero.dataset, L2: zero.frequencies });
  const allZero = fixture('statistics-clocked433-all-zero-frequency.json');
  assert.deepEqual(level('one-var-stats@no-observations').setup.lists, { L1: allZero.dataset, L2: allZero.frequencies });
  const plots = fixture('plots-clocked433.json').cases;
  assert.deepEqual(level('modified-boxplot@outlier').setup.lists.L1, plots[0].dataset);
  assert.deepEqual(level('histogram@bins').setup.lists.L1, plots[1].dataset);
  const binomial = fixture('binomial-clocked431-boundaries.json').cases;
  const params = id => { const v = level(id).values; return [v.n, v.p, v.x]; };
  assert.deepEqual(params('binompdf@exactly-3'), [binomial[0].trials, binomial[0].probability, binomial[0].x]);
  assert.deepEqual(params('binomcdf@never-heads'), [binomial[1].trials, binomial[1].probability, binomial[1].x]);
  assert.deepEqual(params('binomcdf@always-heads'), [binomial[2].trials, binomial[2].probability, binomial[2].x]);
  const cdf = fixture('binomial-cdf-clocked431.json').fixture;
  assert.deepEqual(params('binomcdf@at-most-3'), [cdf.n, cdf.p, cdf.x]);
});

test('reference answers agree with the independent oracles and the ROM fixtures', () => {
  const stats = fixture('statistics-clocked432.json').cases;
  assert.equal(answerOf(level('one-var-stats@population-sd'), 'Population SD value'), Number(stats[0].expected.population.toPrecision(5)));
  assert.equal(answerOf(level('one-var-stats@freq'), 'n'), oneVarStats([2, 4, 6], [1, 2, 1]).n);
  assert.equal(answerOf(level('one-var-stats@freq'), 'n'), stats[1].expected.n);
  assert.equal(answerOf(level('one-var-stats@zero-row'), 'n'), fixture('statistics-clocked432-zero-frequency.json').cases[0].expected.n);
  assert.equal(answerOf(level('one-var-stats@no-observations'), 'n'), 0);
  assert.equal(answerOf(level('one-var-stats@no-observations'), 'Diagnosis'), 'no-observations');
  const box = fixture('plots-clocked433.json').cases[0].geometry;
  assert.equal(answerOf(level('modified-boxplot@outlier'), 'Median'), box.median);
  assert.equal(answerOf(level('modified-boxplot@outlier'), 'Upper whisker'), box.whiskers[1]);
  assert.deepEqual(modifiedBoxplot([1, 2, 2, 3, 3, 9]).outliers, box.outliers);
  const bins = fixture('plots-clocked433.json').cases[1].geometry.bins;
  assert.deepEqual(histogramBins([1, 2, 2, 3, 3, 9], 1, 2, 6).map(bin => [bin.lo, bin.hi, bin.count]), bins);
  assert.equal(answerOf(level('histogram@bins'), 'Bin for 3'), '[3,5)');
  assert.equal(answerOf(level('histogram@bins'), 'Bin for 9'), '[9,11)');
  assert.equal(answerOf(level('histogram@bins'), 'Empty bin'), 0);
  assert.equal(answerOf(level('binompdf@exactly-3'), 'Probability'), Number(binompdf(10, .5, 3).toPrecision(5)));
  assert.equal(answerOf(level('binomcdf@at-most-3'), 'Probability'), Number(binomcdf(10, .5, 3).toPrecision(5)));
  assert.equal(answerOf(level('binomcdf@never-heads'), 'Probability'), 1);
  assert.equal(answerOf(level('binomcdf@always-heads'), 'Probability'), 0);
});

test('the trainer under test reaches the oracle result on each variant route', () => {
  for (const problem of variants) {
    const calculator = create(); initializeCalculator(calculator, problem);
    for (const key of problem.route) calculator.pressKey(key);
    const oracle = problem.values;
    if (problem.id === 'one-var-stats@no-observations') {
      assert.equal(calculator.getScreen().id, 'one-var-stats-error');
      assert.equal(calculator.getComputedValues(), null, 'no fabricated numerical result');
    } else if (problem.procedureId === 'one-var-stats') {
      const expected = oneVarStats(oracle.data, oracle.freq || null), c = calculator.getComputedValues();
      for (const [actual, value] of [[c.n, expected.n], [c.Sx, expected.Sx], [c.sigmaX, expected.sigmaX], [c.xbar, expected.mean]])
        assert(Math.abs(actual - value) <= Math.max(1, Math.abs(value)) * 1e-9, problem.id);
    } else if (problem.procedureId.startsWith('binom')) {
      const expected = (problem.procedureId === 'binompdf' ? binompdf : binomcdf)(oracle.n, oracle.p, oracle.x);
      assert(Math.abs(calculator.getComputedValues().value - expected) <= 1e-9, problem.id);
    } else {
      assert.equal(calculator.getScreen().type, 'graph', problem.id);
    }
  }
});

test('answer checks: exact for counts and categories, display tolerance for decimals', () => {
  assert.equal(answerMatches(4, 4), true);
  assert.equal(answerMatches(4.0000000001, 4), false, 'counts are exact');
  assert.equal(answerMatches('X<=3', 'X<=3'), true);
  assert.equal(answerMatches('x<=3', 'X<=3'), false, 'categories are exact');
  assert.equal(answerMatches(4, '4'), false, 'a number never matches a category');
  assert.equal(answerMatches(0.11719 + 1e-12, 0.11719), true, 'float noise below the 5-digit display');
  assert.equal(answerMatches(0.1172, 0.11719), false, 'a different 5-digit display value is wrong');
  assert.equal(answerMatches(NaN, 0.5), false);
});

for (const problem of variants) test(problem.id + ': every distractor gets its own feedback; retry keeps the clock', () => {
  const challenge = challengeFor(problem);
  assert.equal(challenge.kind, 'interpret');
  const state = atAnswers(problem), deadline = state.startedAt;
  assert(tilesFor(state.step, problem).every(tile => tile.label && tile.y >= 570 && tile.y + tile.h <= 640));
  let time = 100, attempts = 0;
  challenge.questions.forEach((question, index) => {
    for (const option of question.options.filter(option => option.key !== String(question.answer))) {
      const picks = keysFor(problem).map((key, i) => i === index ? option.key : key);
      for (const key of picks) assert(pressMissionKey(state, key, ++time), problem.id + ' accepts ' + key);
      attempts++;
      assert.equal(state.complete, false, 'a wrong answer never completes');
      assert.equal(state.boxAttempts, attempts);
      assert.equal(state.step, problem.route.length, 'back to the first question');
      assert.equal(state.lastPlot.correct, false);
      assert.equal(state.lastPlot.feedback, option.feedback, 'specific feedback for ' + option.key);
      assert.equal(state.startedAt, deadline, 'a wrong answer does not renew the clock');
    }
  });
  for (const key of keysFor(problem)) pressMissionKey(state, key, ++time);
  assert.equal(state.complete, true);
  assert.equal(state.lastPlot.feedback, undefined);
});

test('an exhausted round ignores wrong and right answers alike; no reset, no completion', () => {
  const problem = level('one-var-stats@freq'), state = atAnswers(problem);
  const before = JSON.stringify(state);
  for (const key of keysFor(problem)) assert.equal(pressMissionKey(state, key, state.startedAt + BOXPLOT_MS), false);
  assert.equal(pressMissionKey(state, '3', state.startedAt + BOXPLOT_MS + 1), false);
  assert.equal(JSON.stringify(state), before);
});

test('answer keys are only accepted on their own question; other rounds never count', () => {
  const freq = level('one-var-stats@freq'), zero = level('one-var-stats@zero-row');
  // Before the route is finished, an answer key is not a tile at all.
  const fresh = createMission(0, freq);
  assert.equal(pressMissionKey(fresh, '2446', 1), false);
  assert.equal(fresh.revision, 0);
  // Another variant's correct answers (same calculator route, different data) are wrong here.
  const state = atAnswers(zero), freqN = String(answerOf(freq, 'n'));
  assert.equal(pressMissionKey(state, freqN, 100), false, 'a number is not a choice on the category question');
  for (const key of ['not-observed', freqN]) assert(pressMissionKey(state, key, 101));
  assert.equal(state.complete, false);
  assert.equal(state.boxAttempts, 1);
  assert.match(state.lastPlot.feedback, /value in the zero row/);
});

test('display shows the trainer TRACE labels for boxplot stops and histogram bins', () => {
  const traceLabel = sandbox.window.TI84ScreenRenderer.traceLabel;
  for (const [id, expected] of [['modified-boxplot@outlier', 'TRACE maxX=9'], ['histogram@bins', 'TRACE min=3 max<5 n=2']]) {
    const display = createWorldDisplay({ traceLabel }), problem = level(id);
    const calculator = create(null, { renderer: display }); initializeCalculator(calculator, problem);
    for (const key of problem.route) calculator.pressKey(key);
    const lines = display.getLines().map(line => line.text);
    assert.equal(lines.at(-1), expected, id);
    if (id === 'histogram@bins') assert.deepEqual(lines.slice(1, 7), ['min=1 max<3 n=3', 'min=3 max<5 n=2', 'min=5 max<7 n=0', 'min=7 max<9 n=0', 'min=9 max<11 n=1', 'min=11 max<13 n=0']);
  }
  // Rightward boxplot TRACE stops in ROM order: Med, Q3, X (whisker end), maxX (outlier).
  const display = createWorldDisplay({ traceLabel }), problem = level('modified-boxplot@outlier');
  const calculator = create(null, { renderer: display }); initializeCalculator(calculator, problem);
  const seen = [];
  for (const key of problem.route) { calculator.pressKey(key); const last = display.getLines().at(-1).text; if (last.startsWith('TRACE')) seen.push(last); }
  assert.deepEqual(seen, ['TRACE Med=2.5', 'TRACE Q3=3', 'TRACE X=3', 'TRACE maxX=9']);
});

test('standing on an answer tile (the platforming board) chooses it after the usual hold', () => {
  const problem = level('histogram@bins'), state = atAnswers(problem);
  const tile = tilesFor(state.step, problem).find(tile => tile.key === String(challengeFor(problem).answers[0]));
  const member = { pose: { x: tile.x + 10, y: tile.y - 24 }, at: 1000, revision: state.revision, ready: true };
  advanceMission(state, [member], 1000);
  assert.equal(state.boxValues.length, 0, 'not before the hold');
  advanceMission(state, [member], 1000 + HOLD_MS);
  assert.deepEqual(state.boxValues, [tile.key]);
});

test('answer tiles are climbable from the floor ledges and fit their labels', () => {
  const ledges = approachSteps(true);
  for (const problem of variants) for (let index = 0; index < challengeFor(problem).answers.length; index++) {
    const tiles = answerTiles(problem, index);
    assert.equal(new Set(tiles.map(tile => tile.key)).size, tiles.length);
    const rows = [...new Set(tiles.map(tile => tile.y))].sort((a, b) => b - a);
    let from = Math.min(...ledges.map(ledge => ledge.y));
    for (const row of rows) { assert(from - row <= 36, problem.id + ': rise ' + (from - row)); from = row; }
    for (const tile of tiles) assert(tile.label.length * 6 <= tile.w - 8, problem.id + ': label fits ' + tile.label);
    assert(tiles.every(tile => tile.x >= 0 && tile.x + tile.w <= 720));
  }
});

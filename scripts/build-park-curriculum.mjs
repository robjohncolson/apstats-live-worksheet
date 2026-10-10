// Build reproducible levels from the trainer bank and the official section calendar.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { curriculumCoverage, firstCoveredDates } from './park-curriculum-coverage.mjs';
import { PARK_CALCULATOR_VARIANTS } from './park-calculator-variants.mjs';
import { closeEnough, oneVarStats, modifiedBoxplot, histogramBins, binompdf, binomcdf } from '../apstat-park/calculator-oracles.mjs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const procedures = read('ti84-procedures-data.json').procedures;
const problems = read('ti84-pattern-recognition-data.json').canonicalProblems;
const lessonMap = read('data/ti84-lesson-map.json');
const schedule = read('data/lesson-schedule.json');
const workManifest = read('data/work-manifest.json');
// Dot plots are taught with histograms, but are not a native TI-84 plot type.
// Reuse the real histogram procedure, then construct individual dots in Park.
procedures.push({ ...procedures.find(procedure => procedure.id === 'histogram'),
  activityId: 'dotplot', name: 'Histogram to dot plot', topics: ['1.5'],
  data: [1, 1, 2, 2, 2, 3, 4, 4, 5, 5], challenge: 'dotplot' });
const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
const keyAlias = { Y_EQUALS: 'Y=', X_INVERSE: 'x⁻¹', STO: 'STO→' };
const numberKeys = value => [...String(value)].flatMap(char => char === '-' ? ['(−)'] : /e/i.test(char) ? ['2ND', ','] : char === '+' ? [] : [char]);
const levels = [];

// Drive the real trainer through one problem and record its engine checkpoints.
// options: freqList (set the 1-Var FreqList, e.g. 'L2'), summaryPage (one-var-stats:
// scroll to the five-number summary), traceRights (plots: RIGHT presses after TRACE).
// histogramWindow: the ZoomStat window a real TI-84 showed (fixture-backed problems only).
function buildLevel(procedure, { levelId, v, stem, freqList = null, summaryPage = false, traceRights = 1, histogramWindow = null }) {
  const id = procedure.id;
  const lists = {}, matrices = {};
  if (v.data) lists.L1 = v.data;
  if (v.freq) lists.L2 = v.freq;
  if (v.x_values) { lists.L1 = v.x_values; lists.L2 = v.y_values; }
  if (v.observed && !Array.isArray(v.observed[0])) {
    lists.L1 = v.observed;
    lists.L2 = v.expected || v.expected_counts || v.expected_proportions.map(p => p * v.n);
  }
  if (id !== 'matrix-entry' && (v.matrix || Array.isArray(v.observed?.[0]))) matrices['[A]'] = v.matrix || v.observed;
  let rendered = null;
  const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph'].map(name => ['render' + name, value => { rendered = value; }]));
  function freshCalculator() {
    const calc = sandbox.window.TI84Native.create(null, { renderer });
    for (const [name, values] of Object.entries(lists)) calc.setList(name, values);
    for (const [name, values] of Object.entries(matrices)) calc.setMatrix(name, values);
    if (histogramWindow) calc.setHistogramWindow(histogramWindow);
    return calc;
  }
  let calculator = freshCalculator();
  const route = [], hints = [];
  const visibleState = () => JSON.stringify([calculator.save(), rendered, calculator.getWizardValues()]);
  function press(key, hint = 'Choose ' + key + '.') {
    key = keyAlias[key] || key;
    const before = visibleState();
    calculator.pressKey(key);
    if (visibleState() === before) {
      // Do not turn a no-op into a timed learning step. Replaying restores
      // invisible entry state too (e.g. typing the same digit as a default).
      calculator = freshCalculator();
      for (const accepted of route) calculator.pressKey(accepted);
      return;
    }
    route.push(key); hints.push(hint);
  }
  function type(value, label) { for (const key of numberKeys(value)) press(key, 'Enter ' + label + ' = ' + value + '.'); }
  const plot = ['histogram', 'modified-boxplot', 'scatterplot', 'residual-plot'].includes(id);
  if (plot) {
    for (const key of ['2ND', 'Y=', 'ENTER', 'ENTER', 'DOWN']) press(key);
    const count = id === 'histogram' ? 2 : id === 'modified-boxplot' ? 3 : 0;
    for (let i = 0; i < count; i++) press('RIGHT', 'Choose the ' + id + ' plot type.');
    press('ENTER'); press('DOWN'); press('DOWN');
    if (id === 'residual-plot') for (const key of ['2ND', 'STAT', '7']) press(key, 'Use RESID as the vertical list.');
    for (const key of ['ZOOM', '9', 'TRACE']) press(key);
    for (let i = 0; i < traceRights; i++) press('RIGHT');
    assert.equal(calculator.getScreen().type, 'graph', id);
    assert.equal(rendered.settings.Type, ['Histogram', 'ModBoxplot', 'Scatter'][count === 2 ? 0 : count === 3 ? 1 : 2], id);
  } else if (id === 'matrix-entry') {
    for (const key of ['2ND', 'x⁻¹', 'RIGHT', 'RIGHT', 'ENTER']) press(key);
    type(v.rows, 'rows'); press('ENTER'); type(v.cols, 'columns'); press('ENTER');
    for (const [i, value] of v.matrix.flat().entries()) { type(value, 'cell ' + (i + 1)); press('ENTER'); }
    assert.equal(JSON.stringify(calculator.getMatrix('[A]')), JSON.stringify(v.matrix));
  } else {
    if (id.startsWith('randint')) {
      // Teacher 2026-10-06: "enter seed = 15" told nobody HOW. Seeding is 15 → rand (type the
      // digits, STO→, MATH ▸ PRB ▸ 1:rand, ENTER), so each step carries the trainer's own
      // narration for this procedure instead of a bare "Choose KEY."
      const seedSteps = procedure.steps.slice(0, 13);
      assert.equal(seedSteps[0].key, '{seed}', id);
      assert.equal(seedSteps[12].key, '8', id);
      for (const key of numberKeys(v.seed)) press(key, 'Seed the random numbers: type ' + v.seed + ' (press ' + key + '), then STO→ it into rand.');
      for (const step of seedSteps.slice(1)) press(step.key, step.narration);
    } else {
      for (const step of procedure.steps) {
        for (let i = 0; i < (step.minPresses || 1); i++) press(step.key, step.narration);
        if (calculator.getScreen().type === 'wizard') break;
        assert(!step.key.startsWith('{'), 'No wizard: ' + id);
      }
    }
    assert.equal(calculator.getScreen().type, 'wizard', id);
    // Build real keypresses for every field, using the engine's field order.
    for (let guard = 0; guard < 30 && calculator.getScreen().type === 'wizard'; guard++) {
      const state = calculator.getWizardState(), field = { ...state.fields[state.cursorIndex], ...state.activeField };
      const label = field.label;
      if (field.type.startsWith('action-')) {
        press('ENTER', 'Calculate the result.');
        if (id.startsWith('randint')) press('ENTER', 'Evaluate the random draw.');
        break;
      }
      if (field.type === 'list-selector' && label === 'FreqList' && freqList) {
        // 2ND then the list's number key names a list (2ND 2 = L2), as on a real TI-84.
        const digit = freqList.replace(/^L/, '');
        press('2ND', 'Set FreqList to ' + freqList + ': press 2ND, then ' + digit + '.');
        press(digit, 'Set FreqList to ' + freqList + ': press ' + digit + ' (' + freqList + ').');
        assert.equal(calculator.getWizardValues().FreqList, freqList, id + ': FreqList');
      } else if (field.type === 'number' || field.type === 'integer') {
        const names = { 'μ': 'mu', 'σ': v.sigma_xbar == null ? 'sigma' : 'sigma_xbar', 'μ0': 'mu0',
          'x̄': 'xbar', Sx: 'sx', 'x̄1': 'xbar1', Sx1: 'sx1', 'x̄2': 'xbar2', Sx2: 'sx2',
          'C-Level': 'cLevel', trials: v.trials == null ? 'n' : 'trials',
          lower: id.startsWith('randint') ? 'lo' : 'lower', upper: id.startsWith('randint') ? 'hi' : 'upper' };
        const value = v[names[label] || label];
        assert(value != null, id + ': missing ' + label);
        type(value, label);
      } else if (field.type === 'choice') {
        let desired = field.value;
        if (label === 'Inpt') desired = id.endsWith('-data') ? 'Data' : 'Stats';
        else if (label === 'Tail') desired = (v.tail || 'left').toUpperCase();
        else if (label === 'Pooled') desired = 'No';
        else desired = field.options.find(option => option.startsWith(v.direction === '<' ? '<' : v.direction === '>' ? '>' : '≠')) || desired;
        const target = field.options.indexOf(desired);
        for (let i = state.choiceCursor; i < target; i++) press('RIGHT', 'Choose ' + desired + '.');
        for (let i = state.choiceCursor; i > target; i--) press('LEFT', 'Choose ' + desired + '.');
        press('ENTER', 'Confirm ' + desired + '.');
      }
      press('DOWN', 'Move to the next field.');
    }
    if (summaryPage) press('DOWN', 'Read the five-number summary.');
    assert(['home', 'result'].includes(calculator.getScreen().type), id + ': did not calculate');
  }
  const computed = calculator.getComputedValues();
  console.log(levelId + ': ' + route.length + ' engine checkpoints');
  const coverage = curriculumCoverage(id, lessonMap, schedule, workManifest, procedure.topics);
  const skillId = procedure.activityId || id;
  return { id: levelId, skillId, procedureId: id, challenge: procedure.challenge,
    title: procedure.name, topic: coverage[0]?.topic, coverage, dates: firstCoveredDates(coverage),
    stem, values: v, setup: { lists, matrices, ...(histogramWindow ? { histogramWindow } : {}) }, route, hints,
    computed: JSON.parse(JSON.stringify(computed)), finalView: JSON.parse(JSON.stringify(rendered)),
    screenId: calculator.getScreen().id };
}

for (const procedure of procedures) {
 for (let variant = 0; variant < Math.max(2, problems[procedure.id].length); variant++) {
  const id = procedure.id, problem = problems[id][variant % problems[id].length], v = structuredClone(problem.values);
  if (procedure.data) v.data = variant ? [2, 2, 3, 4, 4, 4, 5, 5, 6, 6] : procedure.data;
  if (id === 'one-var-stats' && variant === 0) v.data = [4, 6, 7, 8, 10, 12, 13, 14, 18, 20];
  if (id === 'matrix-entry' && variant) v.data = v.data.map(row => row.map(value => value + variant * 3));
  if (id === 'matrix-entry') { v.matrix = v.data; delete v.data; }
  const skillId = procedure.activityId || id;
  const level = buildLevel(procedure, { levelId: variant ? skillId + '@' + variant : skillId, v,
    stem: id === 'one-var-stats' ? 'Find the five-number summary for L1.' : problem.stem,
    summaryPage: id === 'one-var-stats' });
  delete level.screenId;
  levels.push(level);
 }
}

// The trainer's own result must agree with the independent oracle before a variant ships.
function checkAgainstOracle(level, oracle) {
  const near = (actual, expected, what) => assert(closeEnough(actual, expected), level.id + ': ' + what + ' ' + actual + ' != ' + expected);
  if (oracle.kind === 'one-var') {
    const expected = oneVarStats(oracle.values, oracle.freq);
    if (expected.divisionByZero) {
      assert.equal(level.screenId, 'one-var-stats-error', level.id + ': no observations must end on the error screen');
      assert.equal(level.computed, null, level.id + ': no numerical result');
      return;
    }
    const c = level.computed;
    near(c.n, expected.n, 'n'); near(c.xbar, expected.mean, 'mean'); near(c.sumX, expected.sum, 'sum');
    near(c.sumX2, expected.sumOfSquares, 'sum of squares'); near(c.Sx, expected.Sx, 'Sx'); near(c.sigmaX, expected.sigmaX, 'sigma x');
    const five = expected.fiveNumber;
    for (const [key, value] of [['minX', five.min], ['Q1', five.q1], ['Med', five.median], ['Q3', five.q3], ['maxX', five.max]]) near(c[key], value, key);
  } else if (oracle.kind === 'modified-boxplot') {
    const expected = modifiedBoxplot(oracle.values), stats = level.finalView.stats;
    for (const [key, value] of [['minX', expected.min], ['Q1', expected.q1], ['Med', expected.median], ['Q3', expected.q3], ['maxX', expected.max]]) near(stats[key], value, key);
    assert.deepEqual({ label: level.finalView.traceInfo.label, x: level.finalView.traceInfo.x }, oracle.endStop, level.id + ': TRACE end stop');
  } else if (oracle.kind === 'histogram') {
    const expected = histogramBins(oracle.values, oracle.start, oracle.width, oracle.binCount);
    assert.deepEqual(level.finalView.points.map(bin => ({ lo: bin.x, hi: bin.upper, count: bin.y })), expected, level.id + ': bins');
  } else if (oracle.kind === 'binompdf' || oracle.kind === 'binomcdf') {
    const expected = (oracle.kind === 'binompdf' ? binompdf : binomcdf)(oracle.n, oracle.p, oracle.x);
    near(level.computed.value, expected, oracle.kind);
  } else throw new Error(level.id + ': unknown oracle ' + oracle.kind);
}

function checkInterpretation(level) {
  const { questions } = level.interpretation;
  assert(questions.length >= 1 && questions.length <= 3, level.id + ': one small challenge per round');
  for (const question of questions) {
    const keys = question.options.map(option => option.key);
    assert.equal(new Set(keys).size, keys.length, level.id + ': duplicate option keys');
    assert(question.options.length >= 2 && question.options.length <= 4, level.id + ': 2-4 options');
    const correct = question.options.filter(option => option.key === String(question.answer));
    assert.equal(correct.length, 1, level.id + ': exactly one correct option for ' + question.label);
    assert.equal(correct[0].feedback, null, level.id + ': the correct option has no feedback');
    for (const option of question.options) {
      assert(option.text.length <= 44, level.id + ': option text fits its tile: ' + option.text);
      assert(/^[\x20-\x7e]+$/.test(option.text + question.prompt + (option.feedback || '')), level.id + ': ASCII only (pixel font)');
      if (option.key !== String(question.answer)) assert(option.feedback, level.id + ': every distractor explains itself');
    }
  }
}

for (const variant of PARK_CALCULATOR_VARIANTS) {
  const procedure = procedures.find(item => (item.activityId || item.id) === variant.skillId);
  assert(procedure, 'variant of an unknown skill: ' + variant.skillId);
  const level = buildLevel(procedure, { levelId: variant.skillId + '@' + variant.suffix, v: structuredClone(variant.values),
    stem: variant.stem, freqList: variant.freqList, summaryPage: variant.summaryPage, traceRights: variant.traceRights,
    histogramWindow: variant.histogramWindow });
  if (variant.title) level.title = variant.title;
  if (variant.hints) level.hints = level.hints.map(hint => variant.hints[hint] ?? hint);
  checkAgainstOracle(level, variant.oracle);
  delete level.screenId;
  level.interpretation = variant.interpretation;
  checkInterpretation(level);
  levels.push(level);
}

writeFileSync(new URL('../apstat-park/calculator-catalog.mjs', import.meta.url),
  '// Generated by scripts/build-park-curriculum.mjs. Do not edit.\nexport const CALCULATOR_PROBLEMS = ' + JSON.stringify(levels, null, 2)
  + ';\nexport const CALCULATOR_LEVELS = CALCULATOR_PROBLEMS.filter(level => level.id === level.skillId);\n');

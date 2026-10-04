// Build reproducible levels from the trainer bank and the official section calendar.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const procedures = read('ti84-procedures-data.json').procedures;
const problems = read('ti84-pattern-recognition-data.json').canonicalProblems;
const lessonMap = read('data/ti84-lesson-map.json');
const schedule = read('data/lesson-schedule.json');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
const keyAlias = { Y_EQUALS: 'Y=', X_INVERSE: 'x⁻¹', STO: 'STO→' };
const numberKeys = value => [...String(value)].flatMap(char => char === '-' ? ['(−)'] : /e/i.test(char) ? ['2ND', ','] : char === '+' ? [] : [char]);
const levels = [];

for (const procedure of procedures) {
  const id = procedure.id, problem = problems[id][0], v = structuredClone(problem.values);
  if (id === 'one-var-stats') v.data = [4, 6, 7, 8, 10, 12, 13, 14, 18, 20];
  if (id === 'matrix-entry') { v.matrix = v.data; delete v.data; }
  const lists = {}, matrices = {};
  if (v.data) lists.L1 = v.data;
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
    for (const key of ['ZOOM', '9', 'TRACE', 'RIGHT']) press(key);
    assert.equal(calculator.getScreen().type, 'graph', id);
    assert.equal(rendered.settings.Type, ['Histogram', 'ModBoxplot', 'Scatter'][count === 2 ? 0 : count === 3 ? 1 : 2], id);
  } else if (id === 'matrix-entry') {
    for (const key of ['2ND', 'x⁻¹', 'RIGHT', 'RIGHT', 'ENTER']) press(key);
    type(v.rows, 'rows'); press('ENTER'); type(v.cols, 'columns'); press('ENTER');
    for (const [i, value] of v.matrix.flat().entries()) { type(value, 'cell ' + (i + 1)); press('ENTER'); }
    assert.equal(JSON.stringify(calculator.getMatrix('[A]')), JSON.stringify(v.matrix));
  } else {
    if (id.startsWith('randint')) {
      type(v.seed, 'seed');
      for (const key of ['STO→', 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', '1', 'ENTER', 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', '8']) press(key);
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
      if (field.type === 'number' || field.type === 'integer') {
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
    if (id === 'one-var-stats') press('DOWN', 'Read the five-number summary.');
    assert(['home', 'result'].includes(calculator.getScreen().type), id + ': did not calculate');
  }
  const computed = calculator.getComputedValues();
  console.log(id + ': ' + route.length + ' engine checkpoints');
  const topic = Object.entries({ ...lessonMap.lessons, ...lessonMap.bonus }).find(([, ids]) => ids.includes(id))?.[0];
  levels.push({ id, title: procedure.name, topic, dates: schedule.lessons[topic]?.periods || {},
    stem: id === 'one-var-stats' ? 'Find the five-number summary for L1.' : problem.stem,
    values: v, setup: { lists, matrices }, route, hints,
    computed: JSON.parse(JSON.stringify(computed)), finalView: JSON.parse(JSON.stringify(rendered)) });
}
writeFileSync(new URL('../apstat-park/calculator-catalog.mjs', import.meta.url),
  '// Generated by scripts/build-park-curriculum.mjs. Do not edit.\nexport const CALCULATOR_LEVELS = ' + JSON.stringify(levels, null, 2) + ';\n');

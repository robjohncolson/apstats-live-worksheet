// ABSORB_2_SPEC §2, the shared module: the key sequences that type a level's data in, and the
// level copy that starts empty. (The engine proof over every skill lives with the relay's
// calculator-runtime: curriculum_render/railway-server/apstat-park/calculator-data-entry.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataEntryRoute, withDataEntry, hasEntryData, valueKeys, dataEntryProgress, MATRIX_OPEN_KEYS, DATA_ENTRY_MAX_KEYS } from './calculator-data-entry.mjs';
import { CALCULATOR_PROBLEMS, levelById } from './calculator-curriculum.mjs';
import { createMission, missionFor } from './calculator-mission.mjs';

const QUIT = ['2ND', 'MODE'];

test('a 3-value L1: STAT ENTER, each value then ENTER, QUIT', () => {
  const entry = dataEntryRoute({ lists: { L1: [68, 7, 120] } });
  assert.deepEqual(entry.route, ['STAT', 'ENTER', '6', '8', 'ENTER', '7', 'ENTER', '1', '2', '0', 'ENTER', ...QUIT]);
  assert.equal(entry.hints.length, entry.route.length);
  assert.equal(entry.goals.length, entry.route.length);
  assert.equal(entry.hints[2], 'Type 68, then ENTER.');
  assert.equal(entry.hints[4], 'Type 68, then ENTER.', 'the ENTER shares its value\'s hint');
  assert.equal(entry.goals[2], 'Enter the next L1 value.');
  assert.equal(entry.goals.at(-1), 'Quit to the home screen.');
});

test('a negative decimal: (−) for the minus sign, then the digits and the point', () => {
  assert.deepEqual(valueKeys(-2.5), ['(−)', '2', '.', '5']);
  assert.deepEqual(valueKeys(0.75), ['0', '.', '7', '5']);
  const entry = dataEntryRoute({ lists: { L1: [-2.5] } });
  assert.deepEqual(entry.route, ['STAT', 'ENTER', '(−)', '2', '.', '5', 'ENTER', ...QUIT]);
  assert.match(entry.hints[2], /^Type -2\.5, then ENTER\. The minus sign is the \(-\) key\.$/);
  assert.throws(() => valueKeys(1e-7), /cannot type/);
});

test('two lists: L1, RIGHT to L2, L2, QUIT', () => {
  const entry = dataEntryRoute({ lists: { L1: [1, 2], L2: [30, 4] } });
  assert.deepEqual(entry.route, ['STAT', 'ENTER', '1', 'ENTER', '2', 'ENTER', 'RIGHT', '3', '0', 'ENTER', '4', 'ENTER', ...QUIT]);
  assert.equal(entry.goals[6], 'Move to L2.');
  assert.equal(entry.goals[7], 'Enter the next L2 value.');
});

test('the matrix: the catalogue matrix-entry key path, dimensions, cells row by row, QUIT', () => {
  const entry = dataEntryRoute({ lists: {}, matrices: { '[A]': [[30, 70], [80, 60], [110, 50]] } });
  assert.deepEqual(levelById('matrix-entry').route.slice(0, 5), MATRIX_OPEN_KEYS, 'reuses the catalogue route');
  assert.deepEqual(entry.route, [...MATRIX_OPEN_KEYS, '3', 'ENTER', '2', 'ENTER',
    '3', '0', 'ENTER', '7', '0', 'ENTER', '8', '0', 'ENTER', '6', '0', 'ENTER', '1', '1', '0', 'ENTER', '5', '0', 'ENTER', ...QUIT]);
  assert.deepEqual(entry.route.slice(0, -2), levelById('matrix-entry').route, 'the whole matrix-entry route, then QUIT');
});

test('withDataEntry: empty setup, entryData, prefix lengths, explicit goals for every step', () => {
  const problem = levelById('one-var-stats');
  const typed = withDataEntry(problem);
  assert.equal(typed.dataSteps, 2 + problem.setup.lists.L1.reduce((sum, value) => sum + valueKeys(value).length + 1, 0) + 2);
  assert.equal(typed.route.length, typed.dataSteps + problem.route.length);
  assert.deepEqual(typed.setup.lists, {});
  assert.deepEqual(typed.entryData, problem.setup);
  assert.equal(typed.goals.length, typed.route.length);
  assert.deepEqual(problem.setup.lists.L1.length > 0, true, 'the catalogue problem is untouched');
  const matrix = withDataEntry(levelById('chi-square-test'));
  assert.equal(matrix.dataSteps, 5 + 4 + (5 * 3 + 4) + 2, "open, two dimensions, six cells (110 is three digits), QUIT");
  assert.deepEqual(matrix.setup.matrices, {});
  assert.equal(withDataEntry(typed), typed, 'never prefixed twice');
  assert.equal(withDataEntry(levelById('binompdf')), levelById('binompdf'), 'typed-number skills are unchanged');
  for (const level of CALCULATOR_PROBLEMS.filter(hasEntryData)) {
    const copy = withDataEntry(level);
    if (copy === level) continue; // over DATA_ENTRY_MAX_KEYS: plays pre-loaded
    assert(copy.goals.every(goal => typeof goal === 'string' && goal), level.id + ': a goal for every step');
  }
});

test('a data-entry round travels in state.problem and missionFor restores it', () => {
  const typed = withDataEntry(levelById('one-var-stats'));
  const state = createMission(0, typed);
  assert.equal(state.problem.dataSteps, typed.dataSteps);
  assert.deepEqual(state.problem.entryData, typed.entryData);
  const level = missionFor(JSON.parse(JSON.stringify(state)));
  assert.equal(level.dataSteps, typed.dataSteps);
  assert.deepEqual(level.route, typed.route);
  assert.deepEqual(level.goals, typed.goals);
  assert.equal(level.varied, false, 'catalogue data typed in is not a varied round');
  assert.equal(createMission(0, levelById('one-var-stats')).problem, null, 'rung 0: no override');
});

test('dataEntryProgress counts list values present and [A] cells typed in order', () => {
  const entryData = { lists: { L1: [1, 2, 3], L2: [4, 5, 6] } };
  assert.deepEqual(dataEntryProgress(entryData, { lists: { L1: [1, 2], L2: [] } }),
    { L1: { entered: 2, total: 3 }, L2: { entered: 0, total: 3 } });
  const matrix = { lists: {}, matrices: { '[A]': [[1, 2], [3, 4]] } };
  assert.deepEqual(dataEntryProgress(matrix, { matrices: { '[A]': [] } }), { '[A]': { entered: 0, total: 4 } });
  assert.deepEqual(dataEntryProgress(matrix, { matrices: { '[A]': [[1, 2], [0, 0]] } }), { '[A]': { entered: 2, total: 4 } });
});

test('a prefix longer than DATA_ENTRY_MAX_KEYS plays pre-loaded: the two-list regression sets', () => {
  const long = CALCULATOR_PROBLEMS.find(problem => problem.id === 'linreg-tint');
  assert.ok(dataEntryRoute(long.setup).route.length > DATA_ENTRY_MAX_KEYS);
  assert.equal(withDataEntry(long), long, 'returned unchanged');
  const typed = CALCULATOR_PROBLEMS.filter(problem => hasEntryData(problem) && withDataEntry(problem).dataSteps);
  assert.ok(typed.length >= 40, 'most problems still type their data: ' + typed.length);
  assert.ok(typed.every(problem => problem.dataSteps == null), 'the catalogue itself is never rewritten');
});

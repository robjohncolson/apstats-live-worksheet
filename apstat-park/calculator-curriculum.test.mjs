import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { CALCULATOR_LEVELS, DEFAULT_LEVEL, eligibleLevels, schoolDate, createLevelRotation, challengeFor, initializeCalculator } from './calculator-curriculum.mjs';
import { createMissionEngine } from './calculator-engine.mjs';
import { createMission, pressMissionKey, KEYS, tilesFor, timeLimitFor, BOXPLOT_MS } from './calculator-mission.mjs';

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
const create = sandbox.window.TI84Native.create;

test('every trainer skill has a level and the current section calendar dates', () => {
  const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
  const procedures = read('ti84-procedures-data.json').procedures;
  const schedule = read('data/lesson-schedule.json');
  assert.deepEqual(CALCULATOR_LEVELS.map(level => level.id).sort(), procedures.map(p => p.id).sort());
  for (const level of CALCULATOR_LEVELS) {
    assert.deepEqual(level.dates, schedule.lessons[level.topic]?.periods || {});
    assert(level.route.every(key => KEYS.some(tile => tile.key === key)), level.id);
  }
});

test('date gating uses New York midnight, section dates, and no undated/future fallback', () => {
  assert.equal(schoolDate(Date.parse('2026-10-05T03:59:59Z')), '2026-10-04');
  assert.equal(schoolDate(Date.parse('2026-10-05T04:00:00Z')), '2026-10-05');
  assert.deepEqual(eligibleLevels('B', '2026-09-01'), []);
  assert.deepEqual(eligibleLevels('unknown', '2030-01-01'), []);
  assert(eligibleLevels('B', '2026-09-22').some(level => level.id === DEFAULT_LEVEL.id));
  assert(!eligibleLevels('E', '2026-09-22').some(level => level.id === DEFAULT_LEVEL.id));
  assert(!eligibleLevels('B', '2030-01-01').some(level => level.id === 'geometcdf'));
});

test('rotation covers the eligible pool, avoids consecutive repeats, and adds new lessons', () => {
  const rotation = createLevelRotation(() => 0), pool = CALCULATOR_LEVELS.slice(0, 4);
  assert.equal(new Set(pool.map(() => rotation.next(pool).id)).size, 4);
  const last = rotation.next(pool).id;
  assert.notEqual(rotation.next(pool).id, last);
  assert.equal(rotation.next([pool[0]]).id, pool[0].id);
  assert.equal(rotation.next([]), null);
  const added = CALCULATOR_LEVELS[5];
  assert.equal(rotation.next([pool[0], added]).id, added.id);
});

for (const level of CALCULATOR_LEVELS) test(level.id + ': engine route, complete answer, retry deadline and checkpoint', () => {
  const engine = createMissionEngine(create, level.setup, level.route, KEYS.map(tile => tile.key));
  const state = createMission(0, level);
  let time = 0;
  for (const key of level.route) {
    const transitions = engine.transitions(state);
    pressMissionKey(state, key, ++time, transitions);
  }
  assert.equal(state.step, level.route.length, level.id + ': route must reach its result');
  assert.equal(timeLimitFor(state), BOXPLOT_MS);
  const deadline = state.startedAt;
  const challenge = challengeFor(level);
  assert(challenge.answers.every(Number.isFinite));
  const wrong = tilesFor(state.step, level).find(tile => Number(tile.key) !== challenge.answers[0]);
  pressMissionKey(state, wrong.key, ++time);
  for (const value of challenge.answers.slice(1)) pressMissionKey(state, String(value), ++time);
  assert.equal(state.boxAttempts, 1);
  assert.equal(state.step, level.route.length);
  assert.equal(state.startedAt, deadline, 'an incorrect full answer does not renew the 30-second clock');
  for (const value of challenge.answers) pressMissionKey(state, String(value), ++time);
  assert(state.complete, level.id + ': challenge must be solvable');
  assert.equal(state.startedAt, deadline);
  const calc = create(); initializeCalculator(calc, level);
  for (const key of level.route) calc.pressKey(key);
  assert.equal(JSON.stringify(calc.getComputedValues()), JSON.stringify(level.computed));
  if (level.id === 'matrix-entry') assert.equal(JSON.stringify(calc.getMatrix('[A]')), JSON.stringify(level.values.matrix));
});

test('reference results protect numerical input, scientific notation, and one-sided tests', () => {
  const result = id => CALCULATOR_LEVELS.find(level => level.id === id).computed;
  assert(Math.abs(result('normalcdf').value - .17172554) < 1e-7);
  assert(Math.abs(result('two-propztest').p - .01901438) < 1e-7);
  assert.equal(result('t-test-stats').t, -2);
  assert.deepEqual(CALCULATOR_LEVELS.find(level => level.id === 'histogram').finalView.points.map(p => p.y), [2, 4, 4, 4, 1]);
});

test('wrong keys do not renew the deadline on long numeric routes', () => {
  const level = CALCULATOR_LEVELS.find(level => level.id === 't-test-stats');
  const state = createMission(0, level), engine = createMissionEngine(create, level.setup, level.route, KEYS.map(tile => tile.key));
  pressMissionKey(state, 'MATH', 1000, engine.transitions(state));
  assert.equal(state.startedAt, 0); assert.equal(state.step, 0);
});

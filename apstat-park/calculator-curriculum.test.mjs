import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { curriculumCoverage, firstCoveredDates } from '../scripts/park-curriculum-coverage.mjs';
import { CALCULATOR_LEVELS, CALCULATOR_PROBLEMS, DEFAULT_LEVEL, eligibleLevels, schoolDate, createLevelRotation, challengeFor, initializeCalculator, answerMatches } from './calculator-curriculum.mjs';
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
  const lessonMap = read('data/ti84-lesson-map.json'), work = read('data/work-manifest.json');
  assert.deepEqual([...new Set(CALCULATOR_LEVELS.map(level => level.procedureId))].sort(), procedures.map(p => p.id).sort());
  for (const level of CALCULATOR_LEVELS) {
    const expected = curriculumCoverage(level.procedureId, lessonMap, schedule, work, level.id === 'dotplot' ? ['1.5'] : null);
    assert.deepEqual(level.coverage, expected);
    assert.deepEqual(level.dates, firstCoveredDates(expected));
    assert(level.route.every(key => KEYS.some(tile => tile.key === key)), level.id);
  }
});

test('date gating uses New York midnight, section dates, and no undated/future fallback', () => {
  assert.equal(schoolDate(Date.parse('2026-10-05T03:59:59Z')), '2026-10-04');
  assert.equal(schoolDate(Date.parse('2026-10-05T04:00:00Z')), '2026-10-05');
  assert.deepEqual(eligibleLevels('B', '2026-09-01'), []);
  assert.deepEqual(eligibleLevels('unknown', '2030-01-01'), []);
  for (const period of ['B', 'E']) {
    assert.deepEqual(eligibleLevels('Period' + period, '2026-10-04'), eligibleLevels(period, '2026-10-04'));
    assert.deepEqual(eligibleLevels('Period' + period, '2026-10-04').map(level => level.id).sort(),
      ['dotplot', 'histogram', 'modified-boxplot', 'one-var-stats', 'randint-sampling']);
  }
  assert.deepEqual(eligibleLevels('PeriodX', '2026-10-04'), eligibleLevels('PeriodE', '2026-10-04'));
  assert.deepEqual(eligibleLevels(' periodx ', '2026-09-15'), []);
  assert(eligibleLevels('B', '2026-09-22').some(level => level.id === DEFAULT_LEVEL.id));
  assert(!eligibleLevels('E', '2026-09-22').some(level => level.id === DEFAULT_LEVEL.id));
  assert(!eligibleLevels('B', '2030-01-01').some(level => level.id === 'geometcdf'));
});

test('past worksheet and quiz coverage remains available; any mapped lesson can unlock a skill', () => {
  const level = CALCULATOR_LEVELS.find(level => level.id === 'one-var-stats');
  assert.deepEqual(level.coverage.map(lesson => lesson.topic), ['1.7', '1.8']);
  assert(level.coverage.every(lesson => lesson.sources.includes('worksheet') && lesson.sources.includes('quiz')));
  const repeated = { ...level, coverage: [
    { dates: { E: '2026-11-01' } }, { dates: { E: '2026-09-23' } },
  ] };
  assert.deepEqual(eligibleLevels('PeriodX', '2026-10-04', [repeated]), [repeated]);
  assert.deepEqual(eligibleLevels('PeriodE', '2026-09-22', [repeated]), []);
  const dots = CALCULATOR_LEVELS.find(level => level.id === 'dotplot');
  assert.equal(dots.procedureId, 'histogram');
  assert.deepEqual(challengeFor(dots).answers, [2, 3, 1, 2, 2]);
  assert(eligibleLevels('PeriodX', '2027-04-01').some(level => level.id === 'dotplot'));
});

test('rotation covers the eligible pool, avoids consecutive repeats, and adds new lessons', () => {
  const rotation = createLevelRotation(() => 0), pool = CALCULATOR_LEVELS.slice(0, 4);
  assert.equal(new Set(pool.map(() => rotation.next(pool).id)).size, 4);
  const last = rotation.next(pool).id;
  assert.notEqual(rotation.next(pool).id, last);
  assert.equal(rotation.next([pool[0]]).skillId, pool[0].id);
  assert.equal(rotation.next([]), null);
  const added = CALCULATOR_LEVELS[5];
  assert.equal(rotation.next([pool[0], added]).id, added.id);
});

test('each skill has different problems and never repeats its previous dataset', () => {
  for (const level of CALCULATOR_LEVELS) {
    const rotation = createLevelRotation(() => .5);
    const first = rotation.next([level]), second = rotation.next([level]);
    assert.equal(first.skillId, level.id);
    assert.equal(second.skillId, level.id);
    assert.notEqual(first.id, second.id);
    assert.notDeepEqual(first.values, second.values, level.id);
  }
});

for (const level of CALCULATOR_PROBLEMS) test(level.id + ': engine route, complete answer, retry deadline and checkpoint', () => {
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
  assert(challenge.answers.every(answer => typeof answer === 'string' ? answer.length > 0 : Number.isFinite(answer)));
  const asValue = (key, i) => typeof challenge.answers[i] === 'number' ? Number(key) : key;
  const wrong = tilesFor(state.step, level).find(tile => !answerMatches(asValue(tile.key, 0), challenge.answers[0]));
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
  // The general ZoomStat bin rule is unknown: ordinary problems keep the legacy layout.
  // Only the fixture-backed histogram@bins carries the ROM's own window (calculator-variants.test.mjs).
  assert.deepEqual(CALCULATOR_LEVELS.find(level => level.id === 'histogram').finalView.points.map(p => p.y), [2, 4, 4, 4, 1]);
  assert.equal(CALCULATOR_PROBLEMS.filter(level => level.setup.histogramWindow).map(level => level.id).join(), 'histogram@bins');
  // TI quartiles leave the median out of both halves for odd n.
  const box = id => CALCULATOR_PROBLEMS.find(level => level.id === id).finalView.stats;
  assert.deepEqual([box('modified-boxplot').Q1, box('modified-boxplot').Q3], [28, 38]);
  assert.deepEqual([box('modified-boxplot@1').Q1, box('modified-boxplot@1').Q3], [16.5, 31]);
});

test('wrong keys do not renew the deadline on long numeric routes', () => {
  const level = CALCULATOR_LEVELS.find(level => level.id === 't-test-stats');
  const state = createMission(0, level), engine = createMissionEngine(create, level.setup, level.route, KEYS.map(tile => tile.key));
  pressMissionKey(state, 'MATH', 1000, engine.transitions(state));
  assert.equal(state.startedAt, 0); assert.equal(state.step, 0);
});

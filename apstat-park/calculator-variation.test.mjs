// Protocol 11: the randIntNoRep skills are templated, so every round is a fresh problem
// (calculator-variation.mjs varyRandInt). The route keeps its length so the goal spans line up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from './calculator-native/manifest.mjs';
import { CALCULATOR_PROBLEMS, challengeFor } from './calculator-curriculum.mjs';
import { varyProblem, solveProblem, RANDINT_SKILLS, VARIED_SKILLS } from './calculator-variation.mjs';
import { createMission, missionFor } from './calculator-mission.mjs';
import { createMissionEngine } from './calculator-engine.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) {
  vm.runInContext(readFileSync(new URL('./calculator-native/' + file, import.meta.url), 'utf8'), sandbox, { filename: file });
}
const createCalculator = sandbox.window.TI84Native.create;

// Small seeded generator so a failure can be replayed.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randIntProblems = CALCULATOR_PROBLEMS.filter(problem => RANDINT_SKILLS.has(problem.skillId) && !problem.interpretation);
const drawOf = level => level.finalView.at(-1).replace(/[{}]/g, '').split(' ').map(Number);
const digits = value => String(value).length;

test('protocol 15: the round packet carries the templated route (11), the solo mode (12), the waiting reset (13), the recognition step (14)', () => {
  assert.equal(CALCULATOR_PROTOCOL, 16);
});

test('the catalogue has the five randIntNoRep problems, all varied', () => {
  assert.equal(randIntProblems.length, 5);
  for (const problem of randIntProblems) {
    assert(VARIED_SKILLS.has(problem.skillId), problem.id);
    assert(varyProblem(problem, seeded(1)), problem.id + ' varies');
  }
});

test('the native engine draws the same numbers for the same seed', () => {
  for (const problem of randIntProblems) {
    const first = solveProblem(problem, createCalculator), second = solveProblem(problem, createCalculator);
    assert.deepEqual(first.finalView, second.finalView, problem.id);
    assert.deepEqual(first.finalView, problem.finalView, problem.id + ': the catalogue draw replays');
  }
});

test('every randIntNoRep problem: 20 rounds are fresh, solvable problems with the same route length', () => {
  for (const problem of randIntProblems) {
    const random = seeded(problem.id.length * 7);
    const assignment = problem.skillId === 'randint-assignment';
    const seeds = new Set();
    for (let round = 0; round < 20; round++) {
      const where = problem.id + ' round ' + round;
      const level = solveProblem(varyProblem(problem, random), createCalculator);
      const v = level.values, old = problem.values;
      seeds.add(v.seed);
      // Same digit counts, so the route types the same number of keys.
      for (const key of ['seed', 'hi', 'n']) assert.equal(digits(v[key]), digits(old[key]), where + ': ' + key + ' digits');
      assert.equal(v.lo, old.lo, where + ': lower stays');
      assert.equal(level.route.length, problem.route.length, where + ': route length');
      assert.equal(level.hints.length, problem.route.length, where + ': hints');
      assert.equal(level.goals.length, problem.route.length, where + ': goals');
      // The replay reached the drawn ordering.
      assert.equal(level.finalView.at(-2), 'randIntNoRep(' + v.lo + ',' + v.hi + ',' + v.n + ')', where);
      const draw = drawOf(level);
      assert.equal(draw.length, v.n, where + ': n numbers');
      for (const value of draw) assert(Number.isInteger(value) && value >= v.lo && value <= v.hi, where + ': ' + value);
      assert.equal(new Set(draw).size, draw.length, where + ': no repeats (randIntNoRep)');
      // The stem quotes the new numbers.
      for (const value of [v.seed, v.hi, v.n]) assert.match(level.stem, new RegExp('(?<!\\d)' + value + '(?!\\d)'), where + ': ' + value);
      assert.match(level.stem, /^[\x20-\x7E]*$/, where + ': ASCII stem');
      assert(level.hints[0].includes('type ' + v.seed + ' '), where + ': seed hint');
      assert.equal(level.goals[0], 'Store ' + v.seed + ' as the rand seed', where);
      // The answer check works from the varied draw.
      const answers = challengeFor(level).answers;
      if (assignment) {
        assert.equal(v.n, v.hi, where + ': the whole pool is ordered');
        assert.equal(v.groupSize * 2, v.hi, where + ': two equal groups');
        assert.deepEqual(answers, draw.slice(0, v.groupSize), where);
        assert.match(level.stem, new RegExp('FIRST ' + v.groupSize + ' numbers'), where);
      } else {
        assert.deepEqual(answers, draw, where);
      }
    }
    assert(seeds.size > 1, problem.id + ': the seed changes between rounds');
  }
});

// The whole assignment stem, rewritten by hand for the new pool: the spelled-out pool size,
// the numbered range, the seed and BOTH group counts must all move together.
const ASSIGNMENT_STEMS = {
  'randint-assignment': v => `${WORDS[v.hi]} volunteers, numbered 1 through ${v.hi}, will be split evenly between Treatment A and Treatment B. Seed your calculator with ${v.seed}, generate a random ordering of 1-${v.hi} with randIntNoRep, and assign the FIRST ${v.groupSize} numbers to Treatment A.`,
  'randint-assignment@1': v => `${WORDS[v.hi]} tomato plants, numbered 1 through ${v.hi}, are used to test a new fertilizer: ${v.groupSize} plants get the new fertilizer (Treatment A) and ${v.groupSize} get the standard one (Treatment B). Seed your calculator with ${v.seed}, generate a random ordering of 1-${v.hi}, and assign the FIRST ${v.groupSize} numbers to Treatment A.`,
};
const WORDS = { 10: 'Ten', 12: 'Twelve', 14: 'Fourteen' };

test('randint-assignment: every pool size rewrites the whole stem, spelled-out count included', () => {
  for (const problem of randIntProblems.filter(problem => problem.skillId === 'randint-assignment')) {
    const expected = ASSIGNMENT_STEMS[problem.id], pools = new Set();
    const random = seeded(11);
    for (let round = 0; round < 40; round++) {
      const level = varyProblem(problem, random);
      pools.add(level.values.hi);
      assert.equal(level.stem, expected(level.values), problem.id + ' round ' + round);
    }
    assert.deepEqual([...pools].sort((a, b) => a - b), [10, 12, 14], problem.id + ': every pool size seen');
  }
});

test('a stem whose numbers the template cannot account for is left unvaried', () => {
  const problem = randIntProblems[0];
  const stranger = { ...problem, stem: problem.stem + ' Report the 3 smallest.' };
  assert.equal(varyProblem(stranger, seeded(2)), null, 'unknown number 3');
  // A one-digit seed equal to n (both 5): the stem's "5" could mean either, so nothing is rewritten.
  const collision = { ...problem, values: { ...problem.values, seed: problem.values.n },
    stem: problem.stem.replace(String(problem.values.seed), String(problem.values.n)) };
  assert.equal(varyProblem(collision, seeded(2)), null, 'seed and n share a value: ambiguous');
});

test('a varied round rides in the mission state: missionFor merges route, hints and goals', () => {
  const problem = randIntProblems[0];
  const level = solveProblem(varyProblem(problem, seeded(9)), createCalculator);
  const state = createMission(0, level);
  for (const key of ['route', 'hints', 'goals', 'stem', 'values', 'finalView']) assert.deepEqual(state.problem[key], level[key], key);
  const merged = missionFor(state);
  assert.equal(merged.varied, true);
  assert.deepEqual(merged.route, level.route);
  assert.deepEqual(merged.hints, level.hints);
  assert.deepEqual(challengeFor(merged).answers, challengeFor(level).answers);
});

test('the mission engine judges the varied seed, not the catalogue seed', () => {
  // Find a round whose first seed digit differs from the catalogue's.
  const problem = randIntProblems[0], random = seeded(4);
  let level;
  do level = solveProblem(varyProblem(problem, random), createCalculator);
  while (level.route[0] === problem.route[0]);
  const engine = createMissionEngine(createCalculator, level.setup, level.route, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const transitions = engine.transitions({ step: 0, keys: [] });
  assert.equal(transitions[level.route[0]], 1, 'the varied first digit advances');
  assert.equal(transitions[problem.route[0]], undefined, 'the catalogue first digit does not');
});

// The recognition helpers (APSTAT_PARK_TRAINER_ABSORB_SPEC §4): shared byte-identical with the
// relay, generated data up to date with the JSON source, distractor ranking and discriminators.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { distractorsFor, discriminatorFor, recognitionFor, hasRecognition, skillTitle } from './calculator-recognition.mjs';
import { PATTERN_SIGNATURES, CONFUSION_PAIRS, CANONICAL_PROBLEMS } from './calculator-patterns.mjs';
import { createMission, pickRecognition, recognitionPending, tilesFor, tileAt, KEYS } from './calculator-mission.mjs';
import { levelById } from './calculator-curriculum.mjs';

const relay = file => new URL('../../curriculum_render/railway-server/apstat-park/' + file, import.meta.url);
const here = file => new URL('./' + file, import.meta.url);
const relayPresent = fs.existsSync(relay('calculator-service.mjs'));

test('calculator-patterns.mjs and calculator-recognition.mjs are byte-identical on both sides', { skip: !relayPresent }, () => {
  for (const file of ['calculator-patterns.mjs', 'calculator-recognition.mjs', 'calculator-mission.mjs']) {
    assert.equal(fs.readFileSync(here(file), 'utf8'), fs.readFileSync(relay(file), 'utf8'), file);
  }
});

test('the generated patterns module is up to date with ti84-pattern-recognition-data.json (build --check)', () => {
  execFileSync(process.execPath, [new URL('../scripts/build-calculator-patterns.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--check'], { stdio: 'pipe' });
  const data = JSON.parse(fs.readFileSync(new URL('../ti84-pattern-recognition-data.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(PATTERN_SIGNATURES).sort(), Object.keys(data.patternSignatures).sort());
  assert.equal(CONFUSION_PAIRS.length, data.confusionMatrix.length);
  assert.deepEqual(Object.keys(CANONICAL_PROBLEMS).sort(), Object.keys(data.canonicalProblems).sort());
  for (const [id, problems] of Object.entries(data.canonicalProblems)) assert.deepEqual(CANONICAL_PROBLEMS[id].map(p => p.stem), problems.map(p => p.stem), id);
});

test('distractors: confusion-pair partners first (same unit before other units), then same-unit skills', () => {
  assert.deepEqual(distractorsFor('one-propztest'), ['one-propzint', 'two-propztest', 't-test-stats']);
  assert.deepEqual(new Set(distractorsFor('one-propztest')), new Set(['one-propzint', 't-test-stats', 'two-propztest']), 'spec §4 acceptance set');
  // matrix-entry has few pair partners: the rest of unit 8 fills in.
  const matrix = distractorsFor('matrix-entry');
  assert.equal(matrix.length, 3);
  for (const id of matrix) assert.ok(PATTERN_SIGNATURES[id], id);
  for (const id of Object.keys(PATTERN_SIGNATURES)) {
    const set = distractorsFor(id);
    assert.equal(new Set(set).size, 3, id);
    assert.ok(!set.includes(id), id);
  }
});

test('discriminators: the first differing signal, in the order parameter, question, structure, data', () => {
  assert.equal(discriminatorFor('one-propztest', 't-test-stats'), 'This asks about a proportion, not a mean.');
  assert.equal(discriminatorFor('t-test-stats', 'one-propztest'), 'This asks about a mean, not a proportion.');
  assert.equal(discriminatorFor('one-propztest', 'one-propzint'), 'This asks for a test of a claim, not a confidence interval.');
  assert.equal(discriminatorFor('one-propztest', 'two-propztest'), 'This has one sample, not two separate samples.');
  assert.equal(discriminatorFor('t-test-data', 't-test-stats'), 'This gives the raw data, so enter it in a list (Data input), not summary statistics.');
  assert.equal(discriminatorFor('t-test-stats', 't-test-data'), 'This gives summary statistics (Stats input), not the raw data.');
  assert.match(discriminatorFor('binompdf', 'binomcdf'), /^binompdf gives the probability of exactly one outcome/);
  assert.equal(discriminatorFor('histogram', 'modified-boxplot'), 'This calls for Histogram, not Modified Boxplot.');
  for (const id of Object.keys(PATTERN_SIGNATURES)) for (const other of distractorsFor(id)) {
    assert.match(discriminatorFor(id, other), /^[A-Za-z].+\.$/, id + ' vs ' + other);
  }
});

test('recognitionFor: a canonical stem, the skill among four shuffled tiles, nothing picked yet', () => {
  let n = 0;
  const random = () => ((n++ * 0.37) % 1);
  const round = recognitionFor('normalcdf', random);
  assert.ok(CANONICAL_PROBLEMS.normalcdf.some(p => p.stem === round.stem));
  assert.equal(round.options.length, 4);
  assert.ok(round.options.includes('normalcdf'));
  assert.deepEqual({ skill: round.skill, picked: round.picked, correct: round.correct, message: round.message },
    { skill: 'normalcdf', picked: null, correct: null, message: null });
  assert.equal(recognitionFor('dotplot'), null);
  assert.equal(hasRecognition('dotplot'), false);
  assert.equal(skillTitle('one-propztest'), '1-PropZTest');
});

test('the mission: tiles are the four procedures while pending, the pick starts the clock, the keypad returns', () => {
  const level = levelById('one-propztest');
  const state = createMission(1000, level, recognitionFor('one-propztest', () => 0));
  assert.equal(recognitionPending(state), true);
  const tiles = tilesFor(0, level, state.recognition);
  assert.equal(tiles.length, 4);
  assert.deepEqual(tiles.map(tile => tile.key), state.recognition.options);
  assert.equal(tiles[0].label, skillTitle(tiles[0].key));
  assert.equal(tileAt({ x: tiles[2].x + 20, y: tiles[2].y - 24 }, 0, level, state.recognition), tiles[2].key, 'climbable like answer tiles');
  assert.equal(pickRecognition(state, 'no-such-skill', 2000), false);
  assert.equal(pickRecognition(state, state.recognition.options[1], 2000), true);
  assert.equal(recognitionPending(state), false);
  assert.equal(state.startedAt, 2000);
  assert.equal(tilesFor(0, level, state.recognition), KEYS, 'the keypad is back');
  assert.equal(pickRecognition(state, 'one-propztest', 3000), false, 'one pick');
});

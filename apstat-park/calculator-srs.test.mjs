// The spaced-recall module on the client side (APSTAT_PARK_TRAINER_ABSORB_SPEC §5): shared
// byte-identical with the relay (which owns the records); the acceptance cases; the room shows
// the relay's review on a completed round.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { advance, freshRecord, qualityFor } from './calculator-srs.mjs';

const relay = file => new URL('../../curriculum_render/railway-server/apstat-park/' + file, import.meta.url);
const relayPresent = fs.existsSync(relay('calculator-service.mjs'));

test('calculator-srs.mjs is byte-identical on both sides', { skip: !relayPresent }, () => {
  assert.equal(fs.readFileSync(new URL('./calculator-srs.mjs', import.meta.url), 'utf8'), fs.readFileSync(relay('calculator-srs.mjs'), 'utf8'));
});

test('acceptance: quality 5 on two consecutive days -> six days out; quality 2 -> tomorrow', () => {
  let record = advance(freshRecord(), 5, '2026-10-16');
  record = advance(record, 5, '2026-10-17');
  assert.equal(record.nextReview, '2026-10-23');
  record = advance(record, 2, '2026-10-23');
  assert.equal(record.nextReview, '2026-10-24');
  assert.equal(qualityFor({ wrongKeys: 2, timeoutCount: 0, recognition: { correct: false } }), 3);
});

test('ABSORB_2 §1: minus 1 per branch; a wrong pick without a branch (team) still costs one', () => {
  assert.equal(qualityFor({ wrongKeys: 0, recognition: { correct: true, branches: 2 } }), 3, 'two branches, zero wrong keys');
  assert.equal(qualityFor({ wrongKeys: 0, recognition: { correct: true, branches: 1 } }), 4);
  assert.equal(qualityFor({ wrongKeys: 0, recognition: { correct: false } }), 4, 'team: unchanged');
  assert.equal(qualityFor({ wrongKeys: 0, recognition: { correct: false, branches: 0 } }), 4);
  assert.equal(qualityFor({ wrongKeys: 0, recognition: { correct: true, branches: 0 } }), 5);
  assert.equal(qualityFor({ wrongKeys: 3, timeoutCount: 1, recognition: { correct: true, branches: 3 } }), 0, 'floor 0');
});

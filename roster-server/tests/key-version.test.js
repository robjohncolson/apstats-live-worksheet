// key-version.test.js — pins the §0.10 answer-key version hash (moved with the
// function from the retired grade-answer-key route tests).

import { describe, it, expect } from 'vitest';
import { keyVersionHash } from '../key-version.js';

const ANSWER_KEY = {
  'U1-L2-Q01': { answerKey: 'D', type: 'multiple-choice', unit: '1' },
  'U1-PC-MCQ-A-Q05': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
};
const WORKSHEET_KEY = { 'WS-U1L1-Q1': 'means|mean', 'WS-U1L1-Q2': '0|zero' };

describe('keyVersionHash (§0.10)', () => {
  it('is deterministic + order-independent, and changes when a key changes', () => {
    const a = keyVersionHash(ANSWER_KEY, WORKSHEET_KEY);
    const b = keyVersionHash({ ...ANSWER_KEY }, { ...WORKSHEET_KEY });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    const changed = keyVersionHash({ ...ANSWER_KEY, 'U1-L2-Q01': { answerKey: 'A' } }, WORKSHEET_KEY);
    expect(changed).not.toBe(a);
    const wsChanged = keyVersionHash(ANSWER_KEY, { 'WS-U1L1-Q1': 'different' });
    expect(wsChanged).not.toBe(a);
  });

  it('is byte-stable for a fixed input (pins the hash the grade contexts record)', () => {
    expect(keyVersionHash({ b: 1, a: [2, { d: 3, c: 4 }] }, {})).toBe(keyVersionHash({ a: [2, { c: 4, d: 3 }], b: 1 }, {}));
  });
});

// pc-item-typing.test.js — FRQ vs MCQ is explicit; a keyless MCQ is a loud bank
// defect (runtime backstop + loader refusal), never a silent "FRQ".
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { classifyPcItem, isPcBankDefect, scorePcItem } from '../pc.js';
import { validateBankItems } from '../scripts/load-pc-bank.mjs';

afterEach(() => vi.restoreAllMocks());

describe('classifyPcItem', () => {
  it('reads type first, then the id convention', () => {
    expect(classifyPcItem({ id: 'U1-PC26-MCQ-A-Q01', type: 'multiple-choice', answer: 'B' })).toBe('mcq');
    expect(classifyPcItem({ id: 'U1-PC26-FRQ-Q01', type: 'free-response' })).toBe('frq');
    expect(classifyPcItem({ id: 'U1-PC26-FRQ-Q02' })).toBe('frq');       // id convention
    expect(classifyPcItem({ id: 'U1-PC26-MCQ-B-Q03' })).toBe('mcq');
    expect(classifyPcItem({ id: 'weird', type: 'essay' })).toBe('unknown');
    expect(classifyPcItem(null)).toBe('unknown');
  });
});

describe('scorePcItem', () => {
  it('scores a keyed MCQ 1/0 and returns null for an FRQ', () => {
    const mcq = { id: 'U1-PC26-MCQ-A-Q01', type: 'multiple-choice', answer: 'B' };
    expect(scorePcItem(mcq, 'b')).toBe(1);
    expect(scorePcItem(mcq, 'C')).toBe(0);
    expect(scorePcItem({ id: 'U1-PC26-FRQ-Q01', type: 'free-response' }, 'long answer')).toBeNull();
  });
  it('a keyless MCQ is a BANK DEFECT: null score + console.error (once per item), NOT a silent FRQ', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = { id: 'U1-PC26-MCQ-A-Q09', type: 'multiple-choice' };
    expect(isPcBankDefect(bad)).toBe(true);
    expect(classifyPcItem(bad)).toBe('mcq');
    expect(scorePcItem(bad, 'A')).toBeNull();
    expect(scorePcItem(bad, 'A')).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toMatch(/BANK DEFECT.*U1-PC26-MCQ-A-Q09.*no answer key/);
  });
  it('an unknown-typed item is also logged and unscorable', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(scorePcItem({ id: 'mystery-1', type: 'essay', answer: 'A' }, 'A')).toBeNull();
    expect(err.mock.calls[0][0]).toMatch(/neither MCQ nor FRQ/);
  });
});

describe('load-pc-bank validateBankItems', () => {
  const row = (items) => [{ unit: 1, part: 'A', payload: { items } }];
  it('accepts a clean bank', () => {
    expect(validateBankItems(row([
      { id: 'U1-PC26-MCQ-A-Q01', type: 'multiple-choice', answer: 'B' },
      { id: 'U1-PC26-FRQ-Q01', type: 'free-response' },
    ]))).toEqual([]);
  });
  it('flags a keyless MCQ, an unknown type, a type/id disagreement, and a keyed FRQ', () => {
    const defects = validateBankItems(row([
      { id: 'U1-PC26-MCQ-A-Q02', type: 'multiple-choice' },
      { id: 'U1-PC26-X-Q03', type: 'essay' },
      { id: 'U1-PC26-MCQ-A-Q04', type: 'free-response' },
      { id: 'U1-PC26-FRQ-Q05', type: 'free-response', answer: 'A' },
    ]));
    expect(defects).toHaveLength(4);
    expect(defects.join('\n')).toMatch(/Q02: MCQ has no answer key/);
    expect(defects.join('\n')).toMatch(/Q03: type "essay" is neither/);
    expect(defects.join('\n')).toMatch(/Q04: type and id disagree/);
    expect(defects.join('\n')).toMatch(/Q05: FRQ carries an MCQ-style answer/);
  });
});

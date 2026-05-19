/**
 * tests/answer-key.test.js — Gradebook Phase 2a.
 * Pure-function tests for scripts/build-answer-key.mjs + invariants on the
 * generated data/answer-key.json (read-only extraction; sacred curriculum.js
 * is never written).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAnswerKey, deriveUnitTopic } from '../scripts/build-answer-key.mjs';

const ROOT = resolve(__dirname, '..');

describe('deriveUnitTopic', () => {
  it('lesson ids → unit + dotted topic', () => {
    expect(deriveUnitTopic('U1-L2-Q01')).toEqual({ unit: '1', topic: '1.2' });
    expect(deriveUnitTopic('U10-L3-Q07')).toEqual({ unit: '10', topic: '10.3' });
  });
  it('PC ids → unit, no lesson topic', () => {
    expect(deriveUnitTopic('U4-PC-MCQ-A-Q01')).toEqual({ unit: '4', topic: null });
  });
  it('unknown shape → nulls', () => {
    expect(deriveUnitTopic('weird')).toEqual({ unit: null, topic: null });
  });
});

describe('buildAnswerKey (pure)', () => {
  const items = [
    { id: 'U1-L2-Q01', type: 'multiple-choice', answerKey: 'B' },
    { id: 'U1-L2-Q02', type: 'multiple-choice', answerKey: ' C ' },   // trimmed
    { id: 'U2-PC-MCQ-A-Q01', type: 'multiple-choice', answerKey: 'A' },
    { id: 'U1-L10-Q04', type: 'free-response', solution: {} },          // excluded
    { id: 'U1-L1-Q00', type: 'resource' },                              // excluded
    { id: 'U3-L1-Q09', type: 'multiple-choice', answerKey: '' },        // excluded (no key)
    { id: 'U3-L1-Q10', type: 'multiple-choice' },                       // excluded (no key)
    { noId: true },                                                     // skipped
  ];
  const { answerKey, stats } = buildAnswerKey(items);

  it('emits only MCQ-with-key, trimmed, with unit/topic', () => {
    expect(Object.keys(answerKey).sort()).toEqual(['U1-L2-Q01', 'U1-L2-Q02', 'U2-PC-MCQ-A-Q01']);
    expect(answerKey['U1-L2-Q01']).toEqual({ answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.2' });
    expect(answerKey['U1-L2-Q02'].answerKey).toBe('C');
    expect(answerKey['U2-PC-MCQ-A-Q01'].topic).toBe(null);
  });

  it('counts exclusions correctly', () => {
    expect(stats).toEqual({ mcq: 3, excludedFreeResponse: 1, excludedResource: 1, excludedNoKey: 2, total: 8 });
  });

  it('is deterministic + key-sorted', () => {
    const a = buildAnswerKey(items);
    const b = buildAnswerKey(items);
    expect(JSON.stringify(a.answerKey)).toBe(JSON.stringify(b.answerKey));
    expect(Object.keys(a.answerKey)).toEqual([...Object.keys(a.answerKey)].sort());
  });
});

describe('generated data/answer-key.json (integration)', () => {
  const p = resolve(ROOT, 'data/answer-key.json');
  const bundled = resolve(ROOT, 'roster-server/data/answer-key.json');

  it('exists, dual-write byte-identical', () => {
    expect(existsSync(p)).toBe(true);
    expect(existsSync(bundled)).toBe(true);
    expect(readFileSync(p, 'utf8')).toBe(readFileSync(bundled, 'utf8'));
  });

  it('all keys are MCQ with a non-empty single-token answerKey', () => {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    const entries = Object.entries(doc.answerKey);
    expect(entries.length).toBeGreaterThan(700);
    for (const [, v] of entries) {
      expect(v.type).toBe('multiple-choice');
      expect(typeof v.answerKey).toBe('string');
      expect(v.answerKey.trim()).toBe(v.answerKey);
      expect(v.answerKey.length).toBeGreaterThan(0);
    }
  });

  it('answer-key ids are a subset of work-manifest keys (0 mapping needed)', () => {
    const ak = JSON.parse(readFileSync(p, 'utf8')).answerKey;
    const wm = JSON.parse(readFileSync(resolve(ROOT, 'data/work-manifest.json'), 'utf8'));
    const wmKeys = new Set();
    (function rec(o) {
      if (Array.isArray(o)) o.forEach(rec);
      else if (o && typeof o === 'object') for (const k in o) { if (/^U\d+-/.test(k)) wmKeys.add(k); rec(o[k]); }
    })(wm);
    const missing = Object.keys(ak).filter(id => !wmKeys.has(id));
    expect(missing).toEqual([]);
  });
});

/**
 * tests/disambiguate-skills.test.js
 *
 * Vitest tests for scripts/disambiguate-skills.mjs (Sprint T2).
 * Uses a deterministic fake classifier — no network, no API keys.
 *
 * Tests verify:
 *   1. Constrained pick: classifier result is always from candidates[]
 *   2. Dual-pass agree → provenance "ai-constrained", skill set, confidence averaged
 *   3. Dual-pass disagree → stays in review queue, NOT in resolved map
 *   4. No-item-text items → review queue with reason "no-item-text"
 *   5. Single-candidate items → resolved immediately without calling classifier
 *   6. Canonical data/skill-map.json is never written by the harness
 *   7. Out-of-candidates result from classifier throws an error
 *   8. Appeal-text items always go to review queue
 *   9. Pilot output schema is FC1-compatible (provenance, skill, candidates, confidence, topic)
 *  10. buildItemTextMap returns a Map with string values
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import {
  disambiguateBatch,
  buildItemTextMap,
  builtInClassifier,
  decideAgreement,
  disambiguateAll,
  asciiSanitize,
  buildBatchPrompt,
  buildAllItemTextMap,
  buildT3QueueDoc,
} from '../scripts/disambiguate-skills.mjs';

const ROOT = resolve(__dirname, '..');
const SKILL_MAP_PATH = resolve(ROOT, 'data/skill-map.json');

// ─────────────────────────────────────────────────────────────────────────────
// Fake classifiers for deterministic testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Always-agree fake classifier: returns the first candidate every time.
 * Both passes agree → should resolve.
 */
function alwaysFirstClassifier(itemText, candidates) {
  return Promise.resolve({ skill: candidates[0], confidence: 0.85 });
}

/**
 * Always-agree fake classifier: returns the last candidate every time.
 */
function alwaysLastClassifier(itemText, candidates) {
  return Promise.resolve({ skill: candidates[candidates.length - 1], confidence: 0.80 });
}

/**
 * Alternating disagreement classifier: alternates between first and last
 * so dual-pass always disagrees.
 */
let callCount = 0;
function alternatingClassifier(itemText, candidates) {
  callCount++;
  const pick = callCount % 2 === 1 ? candidates[0] : candidates[candidates.length - 1];
  return Promise.resolve({ skill: pick, confidence: 0.7 });
}

/**
 * Out-of-candidates classifier: always returns a skill NOT in candidates[].
 */
function outOfCandidatesClassifier(itemText, candidates) {
  return Promise.resolve({ skill: '9.Z', confidence: 0.99 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_ITEMS = [
  {
    id: 'U1-L3-Q01',
    entry: { skill: null, candidates: ['2.A', '2.B'], confidence: 0, provenance: 'unresolved', topic: '1.3' },
    itemText: 'The following frequency table shows responses. Which statement is supported?',
  },
  {
    id: 'U1-L7-Q02',
    entry: { skill: null, candidates: ['2.C', '4.B'], confidence: 0, provenance: 'unresolved', topic: '1.7' },
    itemText: 'Calculate the sum of the squared deviations from the mean.',
  },
  {
    id: 'U1-L10-Q01',
    entry: { skill: null, candidates: ['2.D', '3.A'], confidence: 0, provenance: 'unresolved', topic: '1.10' },
    itemText: 'The distribution is approximately normal with mean 80. What proportion is between 70 and 90?',
  },
];

const FIXTURE_NO_TEXT = [
  {
    id: 'WS-U1L3-appeal-text-${questionId}',
    entry: { skill: null, candidates: ['2.A', '2.B'], confidence: 0, provenance: 'unresolved', topic: '1.3' },
    itemText: null,
  },
];

const FIXTURE_SINGLE_CANDIDATE = [
  {
    id: 'U1-L6-Q01',
    entry: { skill: null, candidates: ['2.A'], confidence: 0, provenance: 'unresolved', topic: '1.6' },
    itemText: 'Describe the shape of the distribution.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constrained pick: result always from candidates[]
// ─────────────────────────────────────────────────────────────────────────────

describe('Constrained classification', () => {
  it('resolved skills are all within candidates[] for agree-first classifier', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const [id, entry] of Object.entries(resolved)) {
      const orig = FIXTURE_ITEMS.find(i => i.id === id);
      expect(orig.entry.candidates).toContain(entry.skill);
    }
  });

  it('resolved skills are all within candidates[] for agree-last classifier', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysLastClassifier);
    for (const [id, entry] of Object.entries(resolved)) {
      const orig = FIXTURE_ITEMS.find(i => i.id === id);
      expect(orig.entry.candidates).toContain(entry.skill);
    }
  });

  it('out-of-candidates classifier throws an error', async () => {
    await expect(
      disambiguateBatch(FIXTURE_ITEMS.slice(0, 1), outOfCandidatesClassifier)
    ).rejects.toThrow(/out-of-candidates/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dual-pass agree → ai-constrained
// ─────────────────────────────────────────────────────────────────────────────

describe('Dual-pass agreement → ai-constrained', () => {
  it('all three fixture items resolve when classifier always agrees', async () => {
    const { resolved, reviewQueue } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    expect(Object.keys(resolved)).toHaveLength(3);
    expect(reviewQueue).toHaveLength(0);
  });

  it('provenance is "ai-constrained" for all resolved items', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const entry of Object.values(resolved)) {
      expect(entry.provenance).toBe('ai-constrained');
    }
  });

  it('confidence is average of two passes', async () => {
    // alwaysFirstClassifier returns 0.85 both times → avg = 0.85
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const entry of Object.values(resolved)) {
      expect(entry.confidence).toBeCloseTo(0.85, 2);
    }
  });

  it('skill matches what the classifier picked', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    // alwaysFirst picks candidates[0]
    for (const item of FIXTURE_ITEMS) {
      expect(resolved[item.id].skill).toBe(item.entry.candidates[0]);
    }
  });

  it('topic is preserved from the original entry', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    expect(resolved['U1-L3-Q01'].topic).toBe('1.3');
    expect(resolved['U1-L7-Q02'].topic).toBe('1.7');
    expect(resolved['U1-L10-Q01'].topic).toBe('1.10');
  });

  it('candidates array is preserved', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    expect(resolved['U1-L3-Q01'].candidates).toEqual(['2.A', '2.B']);
    expect(resolved['U1-L7-Q02'].candidates).toEqual(['2.C', '4.B']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dual-pass disagree → unresolved + queued
// ─────────────────────────────────────────────────────────────────────────────

describe('Dual-pass disagreement → review queue', () => {
  beforeAll(() => { callCount = 0; }); // reset alternating counter

  it('items with disagreement go to reviewQueue, not resolved', async () => {
    callCount = 0;
    // Only test items that have 2+ candidates (to guarantee disagreement)
    const twoCandidate = FIXTURE_ITEMS.filter(i => i.entry.candidates.length >= 2);
    const { resolved, reviewQueue } = await disambiguateBatch(twoCandidate, alternatingClassifier);
    // All should be in queue (alternating always disagrees on 2-candidate sets)
    for (const item of twoCandidate) {
      expect(resolved[item.id]).toBeUndefined();
    }
    expect(reviewQueue.length).toBe(twoCandidate.length);
  });

  it('review queue entry has id, topic, candidates, pass1, pass2, reason', async () => {
    callCount = 0;
    const { reviewQueue } = await disambiguateBatch(FIXTURE_ITEMS.slice(0, 1), alternatingClassifier);
    const entry = reviewQueue[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('topic');
    expect(entry).toHaveProperty('candidates');
    expect(entry).toHaveProperty('pass1');
    expect(entry).toHaveProperty('pass2');
    expect(entry).toHaveProperty('reason', 'dual-pass-disagreement');
  });

  it('pass1 and pass2 skills are different in disagreement', async () => {
    callCount = 0;
    const { reviewQueue } = await disambiguateBatch(FIXTURE_ITEMS.slice(0, 1), alternatingClassifier);
    if (reviewQueue.length > 0) {
      expect(reviewQueue[0].pass1.skill).not.toBe(reviewQueue[0].pass2.skill);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. No-item-text → review queue with reason "no-item-text"
// ─────────────────────────────────────────────────────────────────────────────

describe('No-item-text items', () => {
  it('items with null itemText go to review queue', async () => {
    const { resolved, reviewQueue } = await disambiguateBatch(FIXTURE_NO_TEXT, alwaysFirstClassifier);
    expect(Object.keys(resolved)).toHaveLength(0);
    expect(reviewQueue).toHaveLength(1);
  });

  it('reason is "no-item-text" for null-text items', async () => {
    const { reviewQueue } = await disambiguateBatch(FIXTURE_NO_TEXT, alwaysFirstClassifier);
    expect(reviewQueue[0].reason).toBe('no-item-text');
  });

  it('pass1 and pass2 are null for no-text items', async () => {
    const { reviewQueue } = await disambiguateBatch(FIXTURE_NO_TEXT, alwaysFirstClassifier);
    expect(reviewQueue[0].pass1).toBeNull();
    expect(reviewQueue[0].pass2).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Single-candidate items → resolved without calling classifier
// ─────────────────────────────────────────────────────────────────────────────

describe('Single-candidate items', () => {
  it('single-candidate item resolves immediately', async () => {
    const { resolved, reviewQueue } = await disambiguateBatch(FIXTURE_SINGLE_CANDIDATE, alwaysFirstClassifier);
    expect(resolved['U1-L6-Q01']).toBeDefined();
    expect(reviewQueue).toHaveLength(0);
  });

  it('single-candidate item gets confidence 1.0 and ai-constrained provenance', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_SINGLE_CANDIDATE, alwaysFirstClassifier);
    const entry = resolved['U1-L6-Q01'];
    expect(entry.confidence).toBe(1.0);
    expect(entry.provenance).toBe('ai-constrained');
    expect(entry.skill).toBe('2.A');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Canonical data/skill-map.json never written by the harness
// ─────────────────────────────────────────────────────────────────────────────

describe('Canonical skill-map.json is immutable', () => {
  it('data/skill-map.json exists', () => {
    expect(existsSync(SKILL_MAP_PATH)).toBe(true);
  });

  it('skill-map.json mtime is not changed by disambiguateBatch', async () => {
    const mtimeBefore = statSync(SKILL_MAP_PATH).mtimeMs;
    await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    const mtimeAfter = statSync(SKILL_MAP_PATH).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('skill-map.json still has unresolved entries (not touched)', () => {
    const data = JSON.parse(readFileSync(SKILL_MAP_PATH, 'utf8'));
    const unresolved = Object.values(data).filter(v => v.provenance === 'unresolved');
    expect(unresolved.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Appeal-text items always go to review queue
// ─────────────────────────────────────────────────────────────────────────────

describe('Appeal-text items → review queue', () => {
  it('items with appeal-text in id go to review queue even with text', async () => {
    const appealItem = [{
      id: 'WS-U1L7-appeal-text-${questionId}',
      entry: { skill: null, candidates: ['2.C', '4.B'], confidence: 0, provenance: 'unresolved', topic: '1.7' },
      itemText: 'Some non-null text for this appeal form',
    }];
    const { resolved, reviewQueue } = await disambiguateBatch(appealItem, alwaysFirstClassifier);
    expect(Object.keys(resolved)).toHaveLength(0);
    expect(reviewQueue).toHaveLength(1);
    expect(reviewQueue[0].reason).toBe('no-item-text');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Pilot output FC1 schema compliance
// ─────────────────────────────────────────────────────────────────────────────

describe('FC1 schema compliance for resolved entries', () => {
  const FC1_PROVENANCES = new Set(['topic-inherit', 'formula-map', 'frq-xref', 'unresolved', 'ai-constrained', 'teacher']);
  const VALID_SKILL_RE = /^[1-4]\.[A-F]$/;

  it('all resolved entries have required FC1 fields', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const [id, entry] of Object.entries(resolved)) {
      expect(entry).toHaveProperty('skill');
      expect(entry).toHaveProperty('candidates');
      expect(entry).toHaveProperty('confidence');
      expect(entry).toHaveProperty('provenance');
      expect(entry).toHaveProperty('topic');
    }
  });

  it('provenance is always "ai-constrained" for dual-pass resolved entries', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const entry of Object.values(resolved)) {
      expect(FC1_PROVENANCES.has(entry.provenance)).toBe(true);
      expect(entry.provenance).toBe('ai-constrained');
    }
  });

  it('skill codes match the AP CED pattern /^[1-4].[A-F]$/', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const entry of Object.values(resolved)) {
      expect(VALID_SKILL_RE.test(entry.skill)).toBe(true);
    }
  });

  it('confidence is a number between 0 and 1', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const entry of Object.values(resolved)) {
      expect(typeof entry.confidence).toBe('number');
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('candidates is a non-empty array', async () => {
    const { resolved } = await disambiguateBatch(FIXTURE_ITEMS, alwaysFirstClassifier);
    for (const entry of Object.values(resolved)) {
      expect(Array.isArray(entry.candidates)).toBe(true);
      expect(entry.candidates.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. buildItemTextMap returns a Map
// ─────────────────────────────────────────────────────────────────────────────

describe('buildItemTextMap', () => {
  it('returns a Map object', () => {
    const result = buildItemTextMap(ROOT, 1);
    expect(result instanceof Map).toBe(true);
  });

  it('has non-zero entries for unit 1', () => {
    const result = buildItemTextMap(ROOT, 1);
    expect(result.size).toBeGreaterThan(0);
  });

  it('values are strings', () => {
    const result = buildItemTextMap(ROOT, 1);
    for (const [, text] of result) {
      expect(typeof text).toBe('string');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. builtInClassifier is constrained (exported, testable)
// ─────────────────────────────────────────────────────────────────────────────

describe('builtInClassifier', () => {
  it('always returns a skill from the candidates array', async () => {
    const cases = [
      { text: 'Calculate the mean and standard deviation.', candidates: ['2.A', '2.C'] },
      { text: 'Which statement is supported by the frequency table?', candidates: ['2.A', '2.B'] },
      { text: 'The distribution is approximately normal. What proportion?', candidates: ['2.D', '3.A'] },
      { text: 'Compare the two distributions shown.', candidates: ['2.A', '2.D'] },
    ];
    for (const { text, candidates } of cases) {
      const result = await builtInClassifier(text, candidates);
      expect(candidates).toContain(result.skill);
    }
  });

  it('returns confidence between 0 and 1', async () => {
    const result = await builtInClassifier('Describe the distribution.', ['2.A', '2.B']);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('calculation-heavy text leans toward 2.C when available', async () => {
    const result = await builtInClassifier(
      'Calculate the z-score given mean 80 and standard deviation 10.',
      ['2.A', '2.C', '4.B']
    );
    expect(result.skill).toBe('2.C');
  });

  it('normal distribution probability text leans toward 3.A when available', async () => {
    const result = await builtInClassifier(
      'The distribution is approximately normal. What proportion of values are within one standard deviation?',
      ['2.D', '3.A']
    );
    expect(result.skill).toBe('3.A');
  });

  it('"supported by the table" text leans toward 2.A when available', async () => {
    const result = await builtInClassifier(
      'Which of the following statements is supported by the relative frequency table?',
      ['2.A', '2.B']
    );
    expect(result.skill).toBe('2.A');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Full-run additions (decideAgreement / disambiguateAll / asciiSanitize /
//     buildBatchPrompt / buildAllItemTextMap) — the controlled --all path
// ─────────────────────────────────────────────────────────────────────────────

describe('decideAgreement (shared dual-pass decision)', () => {
  const entry = { candidates: ['2.A', '3.A'], topic: '1.10' };

  it('agreement → resolved ai-constrained, confidence averaged', () => {
    const d = decideAgreement('X-1', entry, 'txt',
      { skill: '3.A', confidence: 0.9 }, { skill: '3.A', confidence: 0.7 });
    expect(d.resolved).toBeTruthy();
    expect(d.resolved.skill).toBe('3.A');
    expect(d.resolved.provenance).toBe('ai-constrained');
    expect(d.resolved.confidence).toBe(0.8);
    expect(d.queued).toBeUndefined();
  });

  it('disagreement → queued dual-pass-disagreement', () => {
    const d = decideAgreement('X-2', entry, 'txt',
      { skill: '2.A', confidence: 0.6 }, { skill: '3.A', confidence: 0.6 });
    expect(d.queued).toBeTruthy();
    expect(d.queued.reason).toBe('dual-pass-disagreement');
    expect(d.queued.pass1.skill).toBe('2.A');
    expect(d.resolved).toBeUndefined();
  });
});

describe('disambiguateAll (precomputed dual passes)', () => {
  const items = [
    { id: 'U1-L10-Q01', entry: { candidates: ['2.A', '3.A'], topic: '1.10' }, itemText: 'normal probability' },
    { id: 'U1-L10-Q02', entry: { candidates: ['2.A', '3.A'], topic: '1.10' }, itemText: 'compare or compute' },
    { id: 'U1-L1-Q01', entry: { candidates: ['1.A'], topic: '1.1' }, itemText: 'single candidate' },
    { id: 'WS-U1-appeal-text-3', entry: { candidates: ['2.A', '2.B'], topic: '1.3' }, itemText: 'generic appeal' },
    { id: 'U1-L10-Q09', entry: { candidates: ['2.A', '3.A'], topic: '1.10' }, itemText: null },
  ];

  it('agree → resolved; disagree → queue; single-candidate → resolved 1.0; appeal/no-text → queue', () => {
    const passA = new Map([
      ['U1-L10-Q01', { skill: '3.A', confidence: 0.9 }],
      ['U1-L10-Q02', { skill: '2.A', confidence: 0.6 }],
    ]);
    const passB = new Map([
      ['U1-L10-Q01', { skill: '3.A', confidence: 0.8 }],
      ['U1-L10-Q02', { skill: '3.A', confidence: 0.6 }],
    ]);
    const { resolved, reviewQueue } = disambiguateAll(items, passA, passB);

    expect(resolved['U1-L10-Q01'].skill).toBe('3.A');
    expect(resolved['U1-L10-Q01'].provenance).toBe('ai-constrained');
    expect(resolved['U1-L1-Q01']).toEqual({
      skill: '1.A', candidates: ['1.A'], confidence: 1.0, provenance: 'ai-constrained', topic: '1.1',
    });
    const reasons = Object.fromEntries(reviewQueue.map(q => [q.id, q.reason]));
    expect(reasons['U1-L10-Q02']).toBe('dual-pass-disagreement');
    expect(reasons['WS-U1-appeal-text-3']).toBe('no-item-text');
    expect(reasons['U1-L10-Q09']).toBe('no-item-text');
    expect(resolved['U1-L10-Q02']).toBeUndefined();
  });

  it('out-of-candidates pick → queued (does NOT throw, unlike disambiguateBatch)', () => {
    const passA = new Map([['U1-L10-Q01', { skill: '9.Z', confidence: 0.9 }]]);
    const passB = new Map([['U1-L10-Q01', { skill: '9.Z', confidence: 0.9 }]]);
    const { resolved, reviewQueue } = disambiguateAll([items[0]], passA, passB);
    expect(resolved['U1-L10-Q01']).toBeUndefined();
    expect(reviewQueue[0].reason).toBe('out-of-candidates');
  });

  it('missing classifier result → queued classifier-missing', () => {
    const { reviewQueue } = disambiguateAll([items[0]], new Map(), new Map());
    expect(reviewQueue[0].reason).toBe('classifier-missing');
  });
});

describe('asciiSanitize', () => {
  it('maps math/typographic unicode to ASCII and strips the rest', () => {
    const out = asciiSanitize('μ = 5, σ² ≥ 1, x–y “q” …');
    expect(out).toBe('mu = 5, sigma^2 >= 1, x-y "q" ...');
    expect(/[^\x20-\x7E\n]/.test(out)).toBe(false);
  });

  it('handles null/empty safely', () => {
    expect(asciiSanitize(null)).toBe('');
    expect(asciiSanitize('')).toBe('');
  });
});

describe('buildBatchPrompt', () => {
  it('is ASCII-only and embeds every item id + its candidates', () => {
    const batch = [
      { id: 'U1-L10-Q01', candidates: ['2.D', '3.A'], topic: '1.10', itemText: 'normal μ text' },
      { id: 'U2-L3-Q07', candidates: ['2.A', '2.C'], topic: '2.3', itemText: 'calc' },
    ];
    const p = buildBatchPrompt(batch);
    expect(/[^\x20-\x7E\n]/.test(p)).toBe(false); // strict ASCII (cp1252 gotcha)
    expect(p).toContain('U1-L10-Q01');
    expect(p).toContain('U2-L3-Q07');
    expect(p).toContain('classifications');
  });
});

describe('buildT3QueueDoc', () => {
  it('separates certifier vs practice and is teacher-actionable', () => {
    const queue = [
      { id: 'U1-L10-Q01', topic: '1.10', candidates: ['2.D', '3.A'], reason: 'dual-pass-disagreement' },
      { id: 'U2-PC-MCQ-A-Q03', topic: null, candidates: ['2.A', '4.B'], reason: 'dual-pass-disagreement' },
      { id: 'WS-U3L6-7-Q5', topic: '3.6', candidates: ['1.A', '1.B'], reason: 'no-item-text' },
    ];
    const doc = buildT3QueueDoc(queue, 1234);
    expect(doc).toContain('Sprint T3');
    expect(doc).toContain('1234'); // auto-resolved count
    expect(doc).toContain('CERTIFIER pool first');
    expect(doc).toMatch(/CERTIFIER pool.*2 items/s); // U1-L10-Q01 + U2-PC = certifier
    expect(doc).toContain('Practice pool');
    expect(doc).toContain('| U1 |');
  });

  it('handles an empty queue (all auto-resolved)', () => {
    const doc = buildT3QueueDoc([], 2500);
    expect(doc).toContain('certifier fully auto-resolved');
    expect(doc).toContain('2500');
  });
});

describe('buildAllItemTextMap', () => {
  it('returns a Map spanning multiple units (string values)', () => {
    const m = buildAllItemTextMap(ROOT);
    expect(m instanceof Map).toBe(true);
    expect(m.size).toBeGreaterThan(0);
    for (const [, t] of m) { expect(typeof t).toBe('string'); break; }
    // curriculum.js ids from >1 unit present (proves all-unit span)
    const u1 = [...m.keys()].some(k => /^U1-/.test(k));
    const uN = [...m.keys()].some(k => /^U[3-9]-/.test(k));
    expect(u1 && uN).toBe(true);
  });
});

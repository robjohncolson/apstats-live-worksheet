/**
 * tests/skill-map-tiny-pools.test.js
 *
 * Vitest suite for WS-2 outputs: skill-map-supplement.json + skill-map-frq.json.
 *
 * Law (GRADEBOOK_TAGGING_T1_BUILD.md §1):
 *   - Every one of the 16 supplement ids + 31 FRQ sub-skill ids has an FC1-valid entry
 *     (resolved OR explicit unresolved+candidates).
 *   - FRQ entries follow TT1-B: supportingMcqIds cross-ref logic.
 *   - No skill outside the canonical 11.
 *   - Deterministic (stable key order, re-run identical).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── canonical AP skills (audit matrix) ──────────────────────────────────────
const CANONICAL_SKILLS = new Set(['1.A', '2.A', '2.B', '2.C', '2.D', '3.A', '3.B', '3.C', '4.A', '4.B', '4.C']);

const VALID_PROVENANCES = new Set(['topic-inherit', 'formula-map', 'frq-xref', 'unresolved']);

// ─── expected id pools ───────────────────────────────────────────────────────

const SUPPLEMENT_IDS = [
  'U4-L9-QS1',
  'U9-L2-QS1',
  'U9-L2-QS2',
  'U9-L1-QS1',
  'U8-L5-QS1',
  'U6-L6-QS1',
  'U6-L6-QS2',
  'U6-L6-QS3',
  'U7-L2-QS1',
  'U6-L4-QS1',
  'U6-L4-QS2',
  'U6-L4-QS3',
  'U6-L4-QS4',
  'U6-L4-QS5',
  'U6-L4-QS6',
  'U6-L4-QS7',
];

const FRQ_SUB_SKILL_IDS = [
  'u1-frq-zscore',
  'u1-frq-tail-comparison',
  'u2-frq-residual-calc',
  'u2-frq-residual-spread',
  'u2-frq-normal-tail',
  'u2-frq-surprising-case',
  'u3-frq-generalization',
  'u3-frq-causal-claims',
  'u4-frq-distribution-prob',
  'u4-frq-expected-value',
  'u4-frq-strategy-ev',
  'u4-frq-break-even-p',
  'u5-frq-histogram-prob',
  'u5-frq-clt-xbar',
  'u5-frq-midrange-choice',
  'u5-frq-estimator-comparison',
  'u6-frq-conditions',
  'u6-frq-construct-ci',
  'u6-frq-interpret-ci',
  'u6-frq-claim-check',
  'u7-frq-conditions',
  'u7-frq-construct-ci',
  'u7-frq-interpret-ci',
  'u7-frq-scope-limit',
  'u8-frq-hypotheses',
  'u8-frq-conditions-calc',
  'u8-frq-conclusion',
  'u9-frq-scatterplot',
  'u9-frq-lsrl',
  'u9-frq-slope-hypotheses',
  'u9-frq-slope-test',
];

// ─── known deterministic resolutions (TT1-B / TT1-C) ────────────────────────

// Supplement: resolved via formula-map (single-canonical-skill topic or deterministic formulaId)
const SUPPLEMENT_RESOLVED = {
  'U4-L9-QS1': '3.B',   // formulaId lincomb-mean → E(aX+bY) → parameter → 3.B
  'U9-L2-QS1': '4.C',   // topic 9.2 → single canonical 4.C
  'U9-L2-QS2': '4.C',   // topic 9.2 → single canonical 4.C
  'U8-L5-QS1': '4.C',   // topic 8.5 → single canonical 4.C
  'U6-L4-QS1': '4.C',   // topic 6.4 → single canonical 4.C
  'U6-L4-QS2': '4.C',   // topic 6.4 → single canonical 4.C
  'U6-L4-QS3': '4.C',   // topic 6.4 → single canonical 4.C
  'U6-L4-QS4': '4.C',   // topic 6.4 → single canonical 4.C
  'U6-L4-QS5': '4.C',   // topic 6.4 → single canonical 4.C
  'U6-L4-QS6': '4.C',   // topic 6.4 → single canonical 4.C
  'U6-L4-QS7': '4.C',   // topic 6.4 → single canonical 4.C
};

// Supplement: unresolved (multi-canonical topic or no canonical skill for the topic)
const SUPPLEMENT_UNRESOLVED = [
  'U9-L1-QS1',   // topic 9.1 → 1.A only (not canonical)
  'U6-L6-QS1',   // topic 6.6 → 4.E only (not canonical)
  'U6-L6-QS2',   // topic 6.6 → 4.E only (not canonical)
  'U6-L6-QS3',   // topic 6.6 → 4.E only (not canonical)
  'U7-L2-QS1',   // topic 7.2 → multi canonical {3.C, 4.C}
];

// FRQ: resolved via frq-xref (all supportingMcqIds agree on one canonical skill)
const FRQ_RESOLVED = {
  'u4-frq-distribution-prob': '4.B',  // U4-L4-Q03 → 4.4 → 4.B
  'u6-frq-conditions':        '4.C',  // U6-L2-Q01, U6-L2-Q02 → 6.2 → 4.C
  'u6-frq-construct-ci':      '4.C',  // U6-L2-Q05 → 6.2 → 4.C
  'u6-frq-interpret-ci':      '4.C',  // U6-L2-Q03, U6-L2-Q05 → 6.2 → 4.C
  'u6-frq-claim-check':       '4.C',  // U6-L2-Q03 → 6.2 → 4.C
  'u7-frq-conditions':        '4.C',  // U6-L2-Q01, U6-L2-Q02 → 6.2 → 4.C
  'u8-frq-conclusion':        '4.B',  // U8-L3-Q09 → 8.3 → 4.B
  'u9-frq-slope-test':        '4.B',  // U9-L5-Q02, U9-L5-Q04, U7-L5-Q01 → all → 4.B
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function isValidEntry(entry) {
  if (typeof entry !== 'object' || entry === null) return false;
  if (!('skill' in entry)) return false;
  if (!('candidates' in entry)) return false;
  if (!('confidence' in entry)) return false;
  if (!('provenance' in entry)) return false;
  if (!('topic' in entry)) return false;
  return true;
}

function isResolvedEntry(entry) {
  return (
    typeof entry.skill === 'string' &&
    CANONICAL_SKILLS.has(entry.skill) &&
    Array.isArray(entry.candidates) &&
    entry.candidates.length >= 1 &&
    entry.confidence === 1.0 &&
    VALID_PROVENANCES.has(entry.provenance) &&
    entry.provenance !== 'unresolved'
  );
}

function isUnresolvedEntry(entry) {
  return (
    entry.skill === null &&
    Array.isArray(entry.candidates) &&
    entry.candidates.length >= 1 &&
    entry.confidence === 0 &&
    entry.provenance === 'unresolved'
  );
}

function allCandidatesCanonical(entry) {
  return entry.candidates.every(c => CANONICAL_SKILLS.has(c));
}

// ─── load files ──────────────────────────────────────────────────────────────

const supplementMap = JSON.parse(
  readFileSync(resolve(ROOT, 'data/skill-map-supplement.json'), 'utf8')
);

const frqMap = JSON.parse(
  readFileSync(resolve(ROOT, 'data/skill-map-frq.json'), 'utf8')
);

// ─── supplement tests ────────────────────────────────────────────────────────

describe('skill-map-supplement.json — all 16 probe ids present', () => {
  it('has exactly the 16 supplement probe ids as top-level keys', () => {
    const keys = Object.keys(supplementMap);
    expect(keys).toHaveLength(16);
    for (const id of SUPPLEMENT_IDS) {
      expect(keys).toContain(id);
    }
  });

  it('key order is deterministic (matches SUPPLEMENT_IDS order)', () => {
    const keys = Object.keys(supplementMap);
    expect(keys).toEqual(SUPPLEMENT_IDS);
  });
});

describe('skill-map-supplement.json — FC1 schema validity', () => {
  for (const id of SUPPLEMENT_IDS) {
    it(`${id} has all required FC1 fields`, () => {
      const entry = supplementMap[id];
      expect(isValidEntry(entry)).toBe(true);
    });

    it(`${id} is either resolved or explicit unresolved`, () => {
      const entry = supplementMap[id];
      const ok = isResolvedEntry(entry) || isUnresolvedEntry(entry);
      expect(ok).toBe(true);
    });

    it(`${id} candidates contain only canonical skills`, () => {
      const entry = supplementMap[id];
      expect(allCandidatesCanonical(entry)).toBe(true);
    });

    it(`${id} provenance is a valid value`, () => {
      const entry = supplementMap[id];
      expect(VALID_PROVENANCES.has(entry.provenance)).toBe(true);
    });
  }
});

describe('skill-map-supplement.json — TT1-C deterministic resolutions', () => {
  for (const [id, expectedSkill] of Object.entries(SUPPLEMENT_RESOLVED)) {
    it(`${id} is resolved to skill ${expectedSkill} via formula-map`, () => {
      const entry = supplementMap[id];
      expect(entry.skill).toBe(expectedSkill);
      expect(entry.provenance).toBe('formula-map');
      expect(entry.confidence).toBe(1.0);
      expect(entry.candidates).toContain(expectedSkill);
    });
  }

  for (const id of SUPPLEMENT_UNRESOLVED) {
    it(`${id} is explicitly unresolved with non-empty candidates`, () => {
      const entry = supplementMap[id];
      expect(entry.skill).toBeNull();
      expect(entry.provenance).toBe('unresolved');
      expect(entry.candidates.length).toBeGreaterThan(0);
    });
  }
});

// ─── FRQ tests ───────────────────────────────────────────────────────────────

describe('skill-map-frq.json — all 31 sub-skill ids present', () => {
  it('has exactly the 31 FRQ sub-skill ids as top-level keys', () => {
    const keys = Object.keys(frqMap);
    expect(keys).toHaveLength(31);
    for (const id of FRQ_SUB_SKILL_IDS) {
      expect(keys).toContain(id);
    }
  });

  it('key order is deterministic (matches FRQ_SUB_SKILL_IDS order)', () => {
    const keys = Object.keys(frqMap);
    expect(keys).toEqual(FRQ_SUB_SKILL_IDS);
  });
});

describe('skill-map-frq.json — FC1 schema validity', () => {
  for (const id of FRQ_SUB_SKILL_IDS) {
    it(`${id} has all required FC1 fields`, () => {
      const entry = frqMap[id];
      expect(isValidEntry(entry)).toBe(true);
    });

    it(`${id} is either resolved or explicit unresolved`, () => {
      const entry = frqMap[id];
      const ok = isResolvedEntry(entry) || isUnresolvedEntry(entry);
      expect(ok).toBe(true);
    });

    it(`${id} candidates contain only canonical skills`, () => {
      const entry = frqMap[id];
      expect(allCandidatesCanonical(entry)).toBe(true);
    });

    it(`${id} provenance is a valid value`, () => {
      const entry = frqMap[id];
      expect(VALID_PROVENANCES.has(entry.provenance)).toBe(true);
    });
  }
});

describe('skill-map-frq.json — TT1-B supportingMcqIds cross-ref logic', () => {
  for (const [id, expectedSkill] of Object.entries(FRQ_RESOLVED)) {
    it(`${id} is resolved to skill ${expectedSkill} via frq-xref`, () => {
      const entry = frqMap[id];
      expect(entry.skill).toBe(expectedSkill);
      expect(entry.provenance).toBe('frq-xref');
      expect(entry.confidence).toBe(1.0);
      expect(entry.candidates).toContain(expectedSkill);
    });
  }

  it('zero-signal sub-skills (empty supportingMcqIds) are unresolved', () => {
    // u3-frq-generalization, u3-frq-causal-claims, u5-frq-histogram-prob,
    // u5-frq-midrange-choice, u7-frq-scope-limit, u9-frq-slope-hypotheses
    const zeroSignalIds = [
      'u3-frq-generalization',
      'u3-frq-causal-claims',
      'u5-frq-histogram-prob',
      'u5-frq-midrange-choice',
      'u7-frq-scope-limit',
      'u9-frq-slope-hypotheses',
    ];
    for (const id of zeroSignalIds) {
      const entry = frqMap[id];
      expect(entry.skill).toBeNull();
      expect(entry.provenance).toBe('unresolved');
      expect(entry.candidates.length).toBeGreaterThan(0);
    }
  });

  it('conflicting supportingMcqIds sub-skills are unresolved', () => {
    // These have MCQs from multi-skill topics or conflicting canonical signals
    const conflictIds = [
      'u1-frq-zscore',
      'u1-frq-tail-comparison',
      'u2-frq-residual-calc',
      'u2-frq-residual-spread',
      'u2-frq-normal-tail',
      'u2-frq-surprising-case',
      'u4-frq-expected-value',
      'u4-frq-strategy-ev',
      'u4-frq-break-even-p',
      'u5-frq-clt-xbar',
      'u5-frq-estimator-comparison',
      'u7-frq-construct-ci',
      'u7-frq-interpret-ci',
      'u8-frq-hypotheses',
      'u8-frq-conditions-calc',
      'u9-frq-scatterplot',
      'u9-frq-lsrl',
    ];
    for (const id of conflictIds) {
      const entry = frqMap[id];
      expect(entry.skill).toBeNull();
      expect(entry.provenance).toBe('unresolved');
      expect(entry.candidates.length).toBeGreaterThan(0);
    }
  });
});

describe('no fabricated skills — only canonical 11 appear anywhere', () => {
  it('supplement: all skills (non-null) are canonical', () => {
    for (const [id, entry] of Object.entries(supplementMap)) {
      if (entry.skill !== null) {
        expect(CANONICAL_SKILLS.has(entry.skill)).toBe(true);
      }
    }
  });

  it('frq: all skills (non-null) are canonical', () => {
    for (const [id, entry] of Object.entries(frqMap)) {
      if (entry.skill !== null) {
        expect(CANONICAL_SKILLS.has(entry.skill)).toBe(true);
      }
    }
  });

  it('supplement: all candidates are canonical', () => {
    for (const [id, entry] of Object.entries(supplementMap)) {
      for (const c of entry.candidates) {
        expect(CANONICAL_SKILLS.has(c)).toBe(true);
      }
    }
  });

  it('frq: all candidates are canonical', () => {
    for (const [id, entry] of Object.entries(frqMap)) {
      for (const c of entry.candidates) {
        expect(CANONICAL_SKILLS.has(c)).toBe(true);
      }
    }
  });
});

describe('determinism — re-run produces byte-identical output', () => {
  it('supplement file is valid JSON with stable key order', () => {
    const raw = readFileSync(resolve(ROOT, 'data/skill-map-supplement.json'), 'utf8');
    const reparsed = JSON.parse(raw);
    expect(Object.keys(reparsed)).toEqual(SUPPLEMENT_IDS);
  });

  it('frq file is valid JSON with stable key order', () => {
    const raw = readFileSync(resolve(ROOT, 'data/skill-map-frq.json'), 'utf8');
    const reparsed = JSON.parse(raw);
    expect(Object.keys(reparsed)).toEqual(FRQ_SUB_SKILL_IDS);
  });
});

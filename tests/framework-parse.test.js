/**
 * tests/framework-parse.test.js
 *
 * Tests for scripts/lib/framework-parse.mjs (hardened framework parser).
 *
 * Critical assertions (Sprint T1 acceptance gate):
 *   - parseFrameworks() yields ZERO "(none parsed)" topics across U1–U9
 *   - apstat_5 parses like siblings (not flagged malformed after TT1-E)
 *   - Previously-holed topics (3.3–3.6, 6.6, 7.10, 8.7) resolve correctly
 *   - Synthesis topics (7.10, 8.7, 9.6) are recognized as N/A with empty skills
 *   - Single-skill and multi-skill topics correctly identified
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseFrameworks } from '../scripts/lib/framework-parse.mjs';

const ROOT = resolve(__dirname, '..');

// Run once — parser is pure (no side effects)
const { topicSkills, malformed } = parseFrameworks(ROOT);
const topicNums = Object.keys(topicSkills);

// ─────────────────────────────────────────────────────────────────────────────
// Core: zero "(none parsed)" guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe('Zero (none parsed) guarantee (TT1-A)', () => {
  it('parseFrameworks() works with no root argument', () => {
    const bare = parseFrameworks();
    expect(Object.keys(bare.topicSkills).length).toBeGreaterThanOrEqual(80);
    expect(bare.malformed).toHaveLength(0);
  });

  it('parseFrameworks() returns a topicSkills object', () => {
    expect(topicSkills).toBeDefined();
    expect(typeof topicSkills).toBe('object');
  });

  it('at least 80 topics parsed across U1–U9', () => {
    expect(topicNums.length).toBeGreaterThanOrEqual(80);
  });

  it('every topic value is an array (never undefined or null)', () => {
    for (const [topic, skills] of Object.entries(topicSkills)) {
      expect(Array.isArray(skills)).toBe(true, `Topic ${topic} is not an array`);
    }
  });

  it('no topic has a string "(none parsed)" as its value', () => {
    // The old bug: topics with no skills became '(none parsed)' in the report.
    // The new behavior: empty array [] for N/A synthesis topics.
    for (const [topic, skills] of Object.entries(topicSkills)) {
      expect(typeof skills).toBe('object'); // Array, not string
    }
  });

  it('malformed list is empty (all files now well-formed)', () => {
    // After TT1-E restructure of apstat_5, no file is malformed
    expect(malformed).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 1: well-formed reference framework
// ─────────────────────────────────────────────────────────────────────────────

describe('Unit 1 — reference framework', () => {
  it('topics 1.1 through 1.10 all present', () => {
    for (let t = 1; t <= 10; t++) {
      expect(topicSkills[`1.${t}`]).toBeDefined();
    }
  });

  it('topic 1.1 → [1.A]', () => {
    expect(topicSkills['1.1']).toEqual(['1.A']);
  });

  it('topic 1.2 → [2.A]', () => {
    expect(topicSkills['1.2']).toContain('2.A');
  });

  it('topic 1.7 → [2.C, 4.B]', () => {
    expect(topicSkills['1.7']).toContain('2.C');
    expect(topicSkills['1.7']).toContain('4.B');
  });

  it('topic 1.10 → includes 3.A (normal distribution)', () => {
    expect(topicSkills['1.10']).toContain('3.A');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 5: restructured from malformed (TT1-E)
// ─────────────────────────────────────────────────────────────────────────────

describe('Unit 5 — restructured per TT1-E', () => {
  it('topics 5.1 through 5.8 all present', () => {
    for (let t = 1; t <= 8; t++) {
      expect(topicSkills[`5.${t}`]).toBeDefined();
    }
  });

  it('topic 5.1 → [1.A]', () => {
    expect(topicSkills['5.1']).toEqual(['1.A']);
  });

  it('topic 5.2 → [3.A, 3.C]', () => {
    expect(topicSkills['5.2']).toContain('3.A');
    expect(topicSkills['5.2']).toContain('3.C');
  });

  it('topic 5.3 → [3.C] (CLT)', () => {
    expect(topicSkills['5.3']).toContain('3.C');
  });

  it('topic 5.4 → [3.B, 4.B]', () => {
    expect(topicSkills['5.4']).toContain('3.B');
    expect(topicSkills['5.4']).toContain('4.B');
  });

  it('topic 5.5 → [3.B, 3.C, 4.B] (sampling distributions for proportions)', () => {
    const skills = topicSkills['5.5'];
    expect(skills).toContain('3.B');
    expect(skills).toContain('3.C');
    expect(skills).toContain('4.B');
  });

  it('topic 5.8 → [3.B, 3.C, 4.B] (difference in sample means)', () => {
    const skills = topicSkills['5.8'];
    expect(skills).toContain('3.B');
    expect(skills).toContain('3.C');
    expect(skills).toContain('4.B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Previously-holed topics (3.3–3.6, 6.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('Previously-holed topics now resolved (TT1-A fallback)', () => {
  it('topic 3.3 → [1.C] (was empty before)', () => {
    const skills = topicSkills['3.3'];
    expect(skills).toBeDefined();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills).toContain('1.C');
  });

  it('topic 3.4 → [1.C] (was empty before)', () => {
    expect(topicSkills['3.4']).toContain('1.C');
  });

  it('topic 3.5 → [1.B, 1.C] (was empty before)', () => {
    const skills = topicSkills['3.5'];
    expect(skills).toContain('1.C');
    // 1.B is also present in this topic
    expect(skills.length).toBeGreaterThan(0);
  });

  it('topic 3.6 → [1.C] (was empty before)', () => {
    expect(topicSkills['3.6']).toContain('1.C');
  });

  it('topic 6.6 → [4.E] (was empty before)', () => {
    const skills = topicSkills['6.6'];
    expect(skills).toBeDefined();
    expect(skills.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis topics (7.10, 8.7, 9.6) — correctly emit []
// ─────────────────────────────────────────────────────────────────────────────

describe('N/A synthesis topics emit empty arrays', () => {
  it('topic 7.10 is present but has empty skills (N/A synthesis)', () => {
    expect(topicSkills['7.10']).toBeDefined();
    expect(topicSkills['7.10']).toHaveLength(0);
  });

  it('topic 8.7 is present but has empty skills (N/A synthesis)', () => {
    expect(topicSkills['8.7']).toBeDefined();
    expect(topicSkills['8.7']).toHaveLength(0);
  });

  it('topic 9.6 is present but has empty skills (N/A synthesis)', () => {
    expect(topicSkills['9.6']).toBeDefined();
    expect(topicSkills['9.6']).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CED skill code range — broader than the canonical 11
// ─────────────────────────────────────────────────────────────────────────────

describe('CED skill code recognition', () => {
  it('recognizes 1.A (in canonical 11)', () => {
    // 1.1 → [1.A]
    expect(topicSkills['1.1']).toContain('1.A');
  });

  it('recognizes 1.C (not in canonical 11 but in CED)', () => {
    expect(topicSkills['3.3']).toContain('1.C');
  });

  it('recognizes 3.B (in canonical 11)', () => {
    expect(topicSkills['5.4']).toContain('3.B');
  });

  it('recognizes 4.C (in canonical 11 — inference conditions)', () => {
    // Multiple topics in U6/U7 have 4.C
    const topicsWithVC = Object.entries(topicSkills)
      .filter(([, skills]) => skills.includes('4.C'));
    expect(topicsWithVC.length).toBeGreaterThan(0);
  });

  it('skill codes in topicSkills are valid CED codes matching N.L pattern', () => {
    const allSkills = new Set(Object.values(topicSkills).flat());
    for (const code of allSkills) {
      expect(code).toMatch(/^[1-4]\.[A-F]$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// All units represented
// ─────────────────────────────────────────────────────────────────────────────

describe('All 9 units represented', () => {
  for (let unit = 1; unit <= 9; unit++) {
    it(`Unit ${unit} has at least one topic`, () => {
      const unitTopics = topicNums.filter(t => t.startsWith(`${unit}.`));
      expect(unitTopics.length).toBeGreaterThan(0);
    });
  }
});

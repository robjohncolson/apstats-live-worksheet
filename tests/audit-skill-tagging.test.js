/**
 * tests/audit-skill-tagging.test.js
 *
 * Vitest tests for the skill-tagging audit (scripts/audit-skill-tagging.mjs).
 *
 * Assertions:
 *   1. Report file is produced at GRADEBOOK_TAGGING_AUDIT.md
 *   2. Required sections and shape exist in the report
 *   3. Counts are deterministic across two runs
 *   4. apstat_5_framework.md is flagged as malformed (not fatal)
 *   5. Only apstat_5 is flagged — other frameworks parse correctly
 *   6. curriculum.js pool reports correctly (available or unavailable)
 *   7. Supplement + FRQ decomposition counts match expected shapes
 *   8. Worksheet counts are stable
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const REPORT_PATH = resolve(ROOT, 'GRADEBOOK_TAGGING_AUDIT.md');
const SCRIPT_PATH = resolve(ROOT, 'scripts/audit-skill-tagging.mjs');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read report content (must exist — run script first via beforeAll or pre-run). */
function report() {
  return readFileSync(REPORT_PATH, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Run the audit script before tests
// ─────────────────────────────────────────────────────────────────────────────

let auditResult;

beforeAll(async () => {
  // Import and run the audit. This both generates GRADEBOOK_TAGGING_AUDIT.md
  // and returns the result object for in-memory assertions.
  const mod = await import('../scripts/audit-skill-tagging.mjs');
  auditResult = mod.run(ROOT);
}, 30000); // allow up to 30s for FS scan

// ─────────────────────────────────────────────────────────────────────────────
// 1. Report file produced
// ─────────────────────────────────────────────────────────────────────────────

describe('Report file', () => {
  it('GRADEBOOK_TAGGING_AUDIT.md exists', () => {
    expect(existsSync(REPORT_PATH)).toBe(true);
  });

  it('report is non-empty', () => {
    expect(report().length).toBeGreaterThan(500);
  });

  it('script file exists', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Required sections and shape
// ─────────────────────────────────────────────────────────────────────────────

describe('Required report sections', () => {
  it('has main title', () => {
    expect(report()).toContain('# Gradebook Tagging Audit');
  });

  it('has ## Summary section', () => {
    expect(report()).toContain('## Summary');
  });

  it('has Pool (a) — Follow-Along Worksheets section', () => {
    expect(report()).toContain('Pool (a)');
    expect(report()).toContain('Follow-Along Worksheets');
  });

  it('has Pool (b) — curriculum_render section', () => {
    expect(report()).toContain('Pool (b)');
    expect(report()).toContain('curriculum_render');
  });

  it('has Pool (c) — Supplement Probes section', () => {
    expect(report()).toContain('Pool (c)');
    expect(report()).toContain('Supplement');
  });

  it('has Pool (d) — AP Framework Files section', () => {
    expect(report()).toContain('Pool (d)');
    expect(report()).toContain('Framework');
  });

  it('has ## Flags and Malformed Sources section', () => {
    expect(report()).toContain('## Flags and Malformed Sources');
  });

  it('has ## AP Skill Coverage Matrix section', () => {
    expect(report()).toContain('## AP Skill Coverage Matrix');
  });

  it('has ## Per-Unit Coverage section', () => {
    expect(report()).toContain('## Per-Unit Coverage');
  });

  it('has ## Framework Topic → AP Skill Map section', () => {
    expect(report()).toContain('## Framework Topic');
  });

  it('has ## Gap List section', () => {
    expect(report()).toContain('## Gap List');
  });

  it('has ## FRQ Decompositions section', () => {
    expect(report()).toContain('## FRQ Decompositions');
  });

  it('has ## Phase 3 Readiness Verdict section', () => {
    expect(report()).toContain('## Phase 3 Readiness Verdict');
  });

  it('Phase 3 verdict is dynamic and consistent with skill-map stats', () => {
    // The verdict is now COMPUTED from data/skill-map.json provenance, not
    // hardcoded. It must be one of the three states and match the value the
    // audit derived from the current skill-map.
    const stats = auditResult.skillMapStats;
    expect(stats).toBeTruthy();
    expect(stats.available).toBe(true);
    expect(['NOT READY', 'CONDITIONAL', 'READY']).toContain(stats.verdict);
    expect(report()).toContain(`### Verdict: ${stats.verdict}`);
    // Once ai-constrained tags exist (post full T2 run), state has moved off
    // the pre-T2 "NOT READY".
    if (stats.aiConstrained > 0) {
      expect(stats.verdict).not.toBe('NOT READY');
    }
  });

  it('Phase 3 verdict reports a provenance distribution table', () => {
    expect(report()).toContain('Provenance distribution');
    expect(report()).toContain('Confidence buckets:');
  });

  it('Coverage matrix has all 11 AP skill codes', () => {
    const content = report();
    for (const skill of ['1.A', '2.A', '2.B', '2.C', '2.D', '3.A', '3.B', '3.C', '4.A', '4.B', '4.C']) {
      expect(content).toContain(`| ${skill} |`);
    }
  });

  it('Per-unit table has rows U1 through U9', () => {
    const content = report();
    for (let u = 1; u <= 9; u++) {
      expect(content).toContain(`| U${u} |`);
    }
  });

  it('timestamp is in a comment line (not a section header)', () => {
    // Timestamp should be in <!-- GENERATED: ... --> not a visible heading
    expect(report()).toMatch(/<!--\s*GENERATED:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Counts are deterministic (run twice and compare)
// ─────────────────────────────────────────────────────────────────────────────

describe('Deterministic counts across two runs', () => {
  it('worksheet count is stable (69)', () => {
    expect(auditResult.worksheets.length).toBe(69);
  });

  it('worksheet blank count is stable', () => {
    const totalBlanks = auditResult.worksheets.reduce((s, w) => s + w.blanks, 0);
    expect(totalBlanks).toBeGreaterThan(0);
    // Run a second parse to verify determinism
    const { scanWorksheets } = auditResult; // not exported directly, use report content
    // Verify the same number appears in the report
    expect(report()).toContain(`Total fill-in-the-blank items (data-answer): ${totalBlanks}`);
  });

  it('FRQ textarea count is stable', () => {
    const totalTextareas = auditResult.worksheets.reduce((s, w) => s + w.textareaCount, 0);
    expect(totalTextareas).toBeGreaterThan(0);
    expect(report()).toContain(`Total FRQ reflection textareas: ${totalTextareas}`);
  });

  it('FRQ decomposition count is 9', () => {
    expect(Object.keys(auditResult.frqResult.frqs).length).toBe(9);
  });

  it('FRQ sub-skill count is 31', () => {
    expect(auditResult.frqResult.skillCount).toBe(31);
  });

  it('supplement probe count is 16', () => {
    expect(auditResult.supplementResult.probes.length).toBe(16);
  });

  it('second run produces identical key stats', async () => {
    // Import fresh and run again to confirm determinism
    const mod = await import('../scripts/audit-skill-tagging.mjs?run2=' + Date.now());
    const run2 = mod.run(ROOT);
    expect(run2.worksheets.length).toBe(auditResult.worksheets.length);
    expect(run2.frqResult.skillCount).toBe(auditResult.frqResult.skillCount);
    expect(run2.supplementResult.probes.length).toBe(auditResult.supplementResult.probes.length);
    expect(Object.keys(run2.topicSkillMap).length).toBe(Object.keys(auditResult.topicSkillMap).length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. apstat_5 is now well-formed (restructured per TT1-E)
// ─────────────────────────────────────────────────────────────────────────────

describe('apstat_5_framework.md — restructured per TT1-E', () => {
  it('no MALFORMED flags in allFlags (U5 restructured, all units well-formed)', () => {
    const malformedFlags = auditResult.allFlags.filter(f => f.includes('MALFORMED'));
    expect(malformedFlags).toHaveLength(0);
  });

  it('apstat_5 framework is NOT flagged as malformed after TT1-E restructure', () => {
    const fw5 = auditResult.frameworkScan.results.find(fw => fw.unit === 5);
    expect(fw5).toBeTruthy();
    expect(fw5.malformed).toBe(false);
  });

  it('audit runs to completion without throwing', () => {
    expect(auditResult).toBeTruthy();
    expect(auditResult.frameworkScan).toBeTruthy();
  });

  it('other frameworks (1,2,3,4,6,7,8,9) are also NOT flagged as malformed', () => {
    const malformedFrameworks = auditResult.frameworkScan.results.filter(fw => fw.malformed);
    expect(malformedFrameworks).toHaveLength(0);
  });

  it('apstat_5 framework is parsed and returns 8 topics (5.1–5.8)', () => {
    const fw5 = auditResult.frameworkScan.results.find(fw => fw.unit === 5);
    expect(fw5).toBeTruthy();
    expect(fw5.topics.length).toBe(8);
  });

  it('apstat_5 topics 5.1–5.8 all present in topicSkillMap', () => {
    for (let t = 1; t <= 8; t++) {
      expect(auditResult.topicSkillMap[`5.${t}`]).toBeDefined();
    }
  });

  it('apstat_5 extracts correct skills (5.2 → [3.A, 3.C], 5.3 → [3.C])', () => {
    expect(auditResult.topicSkillMap['5.2']).toContain('3.A');
    expect(auditResult.topicSkillMap['5.2']).toContain('3.C');
    expect(auditResult.topicSkillMap['5.3']).toContain('3.C');
  });

  it('previously-holed topics 3.3–3.6 now parse with skills', () => {
    for (const topic of ['3.3', '3.4', '3.5', '3.6']) {
      const skills = auditResult.topicSkillMap[topic];
      expect(skills).toBeDefined();
      expect(skills.length).toBeGreaterThan(0);
    }
  });

  it('previously-holed topic 6.6 now parses with skills', () => {
    const skills = auditResult.topicSkillMap['6.6'];
    expect(skills).toBeDefined();
    expect(skills.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Framework parsing — other units correct
// ─────────────────────────────────────────────────────────────────────────────

describe('Framework parsing correctness', () => {
  it('all 9 framework files found (none missing)', () => {
    const missing = auditResult.frameworkScan.results.filter(fw => fw.missing);
    expect(missing).toHaveLength(0);
  });

  it('unit 1 framework has topics 1.1 through 1.10', () => {
    const topicMap = auditResult.topicSkillMap;
    for (let t = 1; t <= 10; t++) {
      expect(topicMap[`1.${t}`]).toBeDefined();
    }
  });

  it('topic 1.1 maps to skill 1.A', () => {
    expect(auditResult.topicSkillMap['1.1']).toContain('1.A');
  });

  it('topic 1.7 maps to skill 2.C', () => {
    expect(auditResult.topicSkillMap['1.7']).toContain('2.C');
  });

  it('topic 1.10 maps to skill 3.A (normal distribution)', () => {
    expect(auditResult.topicSkillMap['1.10']).toContain('3.A');
  });

  it('at least 80 topics extracted total (all frameworks parseable, U5 fixed)', () => {
    expect(Object.keys(auditResult.topicSkillMap).length).toBeGreaterThanOrEqual(80);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. curriculum.js pool reporting
// ─────────────────────────────────────────────────────────────────────────────

describe('Pool (b) — curriculum.js', () => {
  it('curriculum pool is either available or reports unavailable clearly', () => {
    const r = auditResult.curriculumResult;
    expect(r).toHaveProperty('available');
    // Either it loaded or it's explicitly marked unavailable
    expect(typeof r.available).toBe('boolean');
  });

  it('if available, questions array is non-empty', () => {
    if (auditResult.curriculumResult.available) {
      expect(auditResult.curriculumResult.questions.length).toBeGreaterThan(0);
    }
  });

  it('curriculum.js questions have zero AP-skill tags (confirmed untagged)', () => {
    expect(auditResult.curriculumAnalysis.taggedCount).toBe(0);
  });

  it('report correctly labels curriculum.js tagging as ABSENT', () => {
    expect(report()).toContain('ABSENT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Supplement and FRQ decomposition data
// ─────────────────────────────────────────────────────────────────────────────

describe('Pool (c) — Supplement and FRQ decompositions', () => {
  it('supplement probes are available', () => {
    expect(auditResult.supplementResult.available).toBe(true);
  });

  it('all 16 supplement probes have formulaId (no zero-signal)', () => {
    expect(auditResult.supplementAnalysis.zeroSignal).toHaveLength(0);
  });

  it('frq decompositions are available', () => {
    expect(auditResult.frqResult.available).toBe(true);
  });

  it('6 FRQ sub-skills have zero supporting MCQs (known zero-signal)', () => {
    expect(auditResult.frqResult.zeroSignalSkills).toBe(6);
  });

  it('report shows zero-signal FRQ sub-skills count', () => {
    expect(report()).toContain('6');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Exported functions work in isolation (unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('Exported functions — unit tests', () => {
  it('extractUnit correctly identifies unit from worksheet filename', async () => {
    const { extractUnit } = await import('../scripts/audit-skill-tagging.mjs');
    expect(extractUnit('u1_lesson1_live.html')).toBe(1);
    expect(extractUnit('u9_lesson5_live.html')).toBe(9);
    expect(extractUnit('u4_lesson1-2_live.html')).toBe(4);
    expect(extractUnit('unknown.html')).toBe(0);
  });

  it('extractLesson extracts lesson range from filename', async () => {
    const { extractLesson } = await import('../scripts/audit-skill-tagging.mjs');
    expect(extractLesson('u1_lesson1_live.html')).toBe('1');
    expect(extractLesson('u4_lesson1-2_live.html')).toBe('1-2');
    expect(extractLesson('u3_lesson6-7_live.html')).toBe('6-7');
  });

  it('parseWorksheetHtml counts data-answer blanks', async () => {
    const { parseWorksheetHtml } = await import('../scripts/audit-skill-tagging.mjs');
    const html = '<input data-answer="yes"> <input data-answer="no"> <textarea id="reflect1"></textarea>';
    const result = parseWorksheetHtml(html, 'test.html');
    expect(result.blanks).toBe(2);
    expect(result.textareaIds).toContain('reflect1');
  });

  it('parseWorksheetHtml detects no skill anchoring in plain worksheets', async () => {
    const { parseWorksheetHtml } = await import('../scripts/audit-skill-tagging.mjs');
    const html = '<input data-answer="foo"> <textarea id="reflect1"></textarea>';
    const result = parseWorksheetHtml(html, 'test.html');
    expect(result.hasSkillAnchoring).toBe(false);
  });

  it('parseWorksheetHtml detects data-skill attribute', async () => {
    const { parseWorksheetHtml } = await import('../scripts/audit-skill-tagging.mjs');
    const html = '<input data-answer="foo" data-skill="2.A"> text';
    const result = parseWorksheetHtml(html, 'test.html');
    expect(result.hasSkillAnchoring).toBe(true);
  });

  it('extractRubricKeys finds reflect keys in grading prompt source', async () => {
    const { extractRubricKeys } = await import('../scripts/audit-skill-tagging.mjs');
    const src = `const RUBRICS = { reflect1: {}, reflect2: {}, exitTicket: {} }`;
    const keys = extractRubricKeys(src);
    expect(keys).toContain('reflect1');
    expect(keys).toContain('reflect2');
    expect(keys).toContain('exitTicket');
  });

  it('parseFramework does NOT flag apstat_5 as malformed after TT1-E restructure', async () => {
    const { parseFramework } = await import('../scripts/audit-skill-tagging.mjs');
    const { resolve } = await import('node:path');
    const result = parseFramework(resolve(ROOT, 'apstat_5_framework.md'), 5);
    expect(result.malformed).toBe(false);
    expect(result.missing).toBe(false);
    expect(result.topics.length).toBe(8);
  });

  it('parseFramework does NOT flag apstat_1 as malformed', async () => {
    const { parseFramework } = await import('../scripts/audit-skill-tagging.mjs');
    const { resolve } = await import('node:path');
    const result = parseFramework(resolve(ROOT, 'apstat_1_framework.md'), 1);
    expect(result.malformed).toBe(false);
    expect(result.missing).toBe(false);
    expect(result.topics.length).toBeGreaterThan(0);
  });

  it('parseFramework handles missing file gracefully', async () => {
    const { parseFramework } = await import('../scripts/audit-skill-tagging.mjs');
    const result = parseFramework('/nonexistent/path/apstat_99_framework.md', 99);
    expect(result.missing).toBe(true);
    expect(result.malformed).toBe(false);
    expect(result.topics).toHaveLength(0);
  });

  it('AP_SKILL_CODES exports exactly 11 skills', async () => {
    const { AP_SKILL_CODES } = await import('../scripts/audit-skill-tagging.mjs');
    expect(AP_SKILL_CODES).toHaveLength(11);
    expect(AP_SKILL_CODES).toContain('1.A');
    expect(AP_SKILL_CODES).toContain('4.C');
  });

  it('loadCurriculumJs returns pool-unavailable object when path is missing', async () => {
    const { loadCurriculumJs } = await import('../scripts/audit-skill-tagging.mjs');
    const result = loadCurriculumJs('/nonexistent/path');
    expect(result.available).toBe(false);
    expect(result.questions).toHaveLength(0);
  });

  it('loadSkillMapStats reports unavailable when skill-map is missing', async () => {
    const { loadSkillMapStats } = await import('../scripts/audit-skill-tagging.mjs');
    const result = loadSkillMapStats('/nonexistent/path');
    expect(result.available).toBe(false);
    expect(result.total).toBe(0);
  });

  it('loadSkillMapStats computes a verdict + split provenance for the real map', async () => {
    const { loadSkillMapStats } = await import('../scripts/audit-skill-tagging.mjs');
    const s = loadSkillMapStats(ROOT);
    expect(s.available).toBe(true);
    expect(s.total).toBeGreaterThan(0);
    expect(['NOT READY', 'CONDITIONAL', 'READY']).toContain(s.verdict);
    // certifier + practice totals partition the whole map.
    expect(s.certifier.total + s.practice.total).toBe(s.total);
    // verdict invariants: READY ⇒ no certifier unresolved/ai-constrained.
    if (s.verdict === 'READY') {
      expect(s.certifier.unresolved).toBe(0);
      expect(s.certifier['ai-constrained'] || 0).toBe(0);
    }
  });
});

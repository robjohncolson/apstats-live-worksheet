/**
 * tests/audit-feeder-ids.test.js
 *
 * Verifies the feeder-id audit produces a well-formed, deterministic report
 * and that every worksheet is classified.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const REPORT_PATH = resolve(ROOT, 'GRADEBOOK_FEEDER_ID_AUDIT.md');

let runAudit;
let auditResult;
let reportContent;

beforeAll(async () => {
  const mod = await import('../scripts/audit-feeder-ids.mjs');
  runAudit = mod.runAudit;
  auditResult = runAudit(ROOT);
  reportContent = existsSync(REPORT_PATH) ? readFileSync(REPORT_PATH, 'utf8') : null;
});

describe('audit-feeder-ids: result shape', () => {
  it('returns an object with required top-level keys', () => {
    expect(auditResult).toHaveProperty('results');
    expect(auditResult).toHaveProperty('cleanCount');
    expect(auditResult).toHaveProperty('mismatchCount');
    expect(auditResult).toHaveProperty('categories');
    expect(auditResult).toHaveProperty('worksheetCount');
  });

  it('audits all 69 worksheets', () => {
    expect(auditResult.worksheetCount).toBe(69);
    expect(auditResult.results).toHaveLength(69);
  });

  it('cleanCount + mismatchCount equals worksheetCount', () => {
    expect(auditResult.cleanCount + auditResult.mismatchCount).toBe(auditResult.worksheetCount);
  });

  it('every result has required fields', () => {
    for (const r of auditResult.results) {
      expect(r).toHaveProperty('file');
      expect(r).toHaveProperty('status');
      expect(r).toHaveProperty('issues');
      expect(['CLEAN', 'MISMATCH']).toContain(r.status);
      expect(Array.isArray(r.issues)).toBe(true);
    }
  });

  it('every result file matches the u*_lesson*_live.html pattern', () => {
    for (const r of auditResult.results) {
      expect(r.file).toMatch(/^u\d+_lesson.+_live\.html$/);
    }
  });

  it('results are sorted (deterministic order)', () => {
    const files = auditResult.results.map(r => r.file);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });
});

describe('audit-feeder-ids: classification accuracy', () => {
  it('classifies CLEAN results: onlyInRuntime and onlyInSkillMap are both empty', () => {
    for (const r of auditResult.results.filter(r => r.status === 'CLEAN')) {
      expect(r.onlyInRuntime).toHaveLength(0);
      expect(r.onlyInSkillMap).toHaveLength(0);
    }
  });

  it('classifies MISMATCH results: at least one of onlyInRuntime or onlyInSkillMap is non-empty', () => {
    for (const r of auditResult.results.filter(r => r.status === 'MISMATCH')) {
      const hasExtra = r.onlyInRuntime.length > 0 || r.onlyInSkillMap.length > 0;
      expect(hasExtra).toBe(true);
    }
  });

  it('CLEAN results have empty issues array', () => {
    for (const r of auditResult.results.filter(r => r.status === 'CLEAN')) {
      expect(r.issues).toHaveLength(0);
    }
  });

  it('MISMATCH results have at least one issue', () => {
    for (const r of auditResult.results.filter(r => r.status === 'MISMATCH')) {
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('audit-feeder-ids: known findings', () => {
  it('no worksheet has a phantom template key in skill-map (build-skill-map.mjs ${-guard; regression guard)', () => {
    // Was: exactly 1 phantom per worksheet (the appeal-text-${...} JS
    // template-literal artifact). FIXED in build-skill-map.mjs (skip textarea
    // ids containing ${ / backtick). This now guards the phantom never returns.
    for (const r of auditResult.results) {
      const phantomKeys = r.onlyInSkillMap.filter(id => /\$\{|`/.test(id));
      expect(phantomKeys).toHaveLength(0);
    }
  });

  it('phantom key always contains the worksheet UNIT_ID prefix', () => {
    for (const r of auditResult.results) {
      const phantomKeys = r.onlyInSkillMap.filter(id => /\$\{/.test(id));
      for (const key of phantomKeys) {
        expect(key.startsWith(`WS-${r.unitId}-`)).toBe(true);
      }
    }
  });

  it('Q-series ids in runtime always match Q-series ids in skill-map (no Q-key delta)', () => {
    for (const r of auditResult.results) {
      const runtimeQKeys = r.onlyInRuntime.filter(id => /-Q\d+$/.test(id));
      const smQKeys = r.onlyInSkillMap.filter(id => /-Q\d+$/.test(id));
      expect(runtimeQKeys).toHaveLength(0);
      expect(smQKeys).toHaveLength(0);
    }
  });

  it('u3_lesson6-7_live.html uses WORKSHEET_ID form', () => {
    const u3 = auditResult.results.find(r => r.file === 'u3_lesson6-7_live.html');
    expect(u3).toBeDefined();
    expect(u3.varForm).toBe('WORKSHEET_ID');
    expect(u3.unitId).toBe('U3L6-7');
  });

  it('all other worksheets use UNIT_ID form', () => {
    const others = auditResult.results.filter(r => r.file !== 'u3_lesson6-7_live.html');
    for (const r of others) {
      expect(r.varForm).toBe('UNIT_ID');
    }
  });

  it('blankCount equals dataAnswerCount for all worksheets (no .blank vs data-answer delta)', () => {
    for (const r of auditResult.results) {
      if (r.blankCount !== null && r.dataAnswerCount !== null) {
        expect(r.blankCount).toBe(r.dataAnswerCount);
      }
    }
  });

  it('no mismatch categories — all 69 worksheets CLEAN post-fix (regression guard)', () => {
    // Was ['PHANTOM_TEMPLATE_KEY']; the phantom is fixed in build-skill-map.mjs
    // so the audit now reports 0 mismatches. If it regresses, this goes red.
    expect(auditResult.categories).toEqual([]);
  });

  it('PHANTOM_TEMPLATE_KEY is the only mismatch category', () => {
    const nonPhantomMismatches = auditResult.results.filter(r => {
      return r.issues.some(issue => !issue.startsWith('PHANTOM_TEMPLATE_KEY'));
    });
    expect(nonPhantomMismatches).toHaveLength(0);
  });
});

describe('audit-feeder-ids: report file', () => {
  it('report file exists after audit run', () => {
    expect(reportContent).not.toBeNull();
    expect(reportContent.length).toBeGreaterThan(0);
  });

  it('report contains a summary section', () => {
    expect(reportContent).toContain('## Summary');
  });

  it('report contains a per-worksheet table', () => {
    expect(reportContent).toContain('## Per-Worksheet Table');
  });

  it('report contains a verdict section', () => {
    expect(reportContent).toContain('## Verdict');
  });

  it('report mentions all 69 worksheets in the table', () => {
    const tableRowCount = (reportContent.match(/`u\d+_lesson.+_live\.html`/g) || []).length;
    // At least 69 references (table rows + possibly mismatch details)
    expect(tableRowCount).toBeGreaterThanOrEqual(69);
  });

  it('report contains MISMATCH or CLEAN status for every worksheet', () => {
    const statusMatches = (reportContent.match(/\bCLEAN\b|\*\*MISMATCH\*\*/g) || []);
    // At least 69 status cells in the table (one per worksheet row)
    expect(statusMatches.length).toBeGreaterThanOrEqual(69);
  });

  it('report is deterministic: two runs produce identical output', () => {
    const { renderReport } = (() => {
      // We don't export renderReport directly, but we can verify determinism
      // by running the audit twice and checking the result structure is stable
      const second = runAudit(ROOT);
      return { renderReport: second };
    })();
    const second = runAudit(ROOT);
    // Results should be identical arrays (same files, same counts, same issues)
    expect(second.cleanCount).toBe(auditResult.cleanCount);
    expect(second.mismatchCount).toBe(auditResult.mismatchCount);
    expect(second.worksheetCount).toBe(auditResult.worksheetCount);
    expect(second.categories).toEqual(auditResult.categories);
    for (let i = 0; i < auditResult.results.length; i++) {
      expect(second.results[i].file).toBe(auditResult.results[i].file);
      expect(second.results[i].status).toBe(auditResult.results[i].status);
      expect(second.results[i].onlyInSkillMap).toEqual(auditResult.results[i].onlyInSkillMap);
      expect(second.results[i].onlyInRuntime).toEqual(auditResult.results[i].onlyInRuntime);
    }
  });
});

// W8b guard: the TI-84 trainer's skill codes must come from the canonical
// Fall-2026 taxonomy (data/skill-taxonomy-ced2026.json, plan G7) — with one
// documented exception: the five REMOVED-from-CED procedures pruned to
// bonus-only in W8a intentionally keep their old 2019 Big-Idea codes, because
// no current-CED code applies to content the CED dropped.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'skill-taxonomy-ced2026.json'), 'utf8'));
const patterns = JSON.parse(fs.readFileSync(path.join(root, 'ti84-pattern-recognition-data.json'), 'utf8'));

const REMOVED_FROM_CED = new Set(['geometpdf', 'geometcdf', 'chi-square-gof-test', 'linreg-ttest', 'linreg-tint']);
const OLD_BIG_IDEA = /^(UNC|VAR|DAT)-\d/;

const taxonomyCodes = new Set(
  taxonomy.practices.flatMap((p) => p.codes.map((c) => c.code)),
);

// Collect every frameworkSkill(s) value with the procedure id that owns it.
// Sections key entries by procedure id either directly (patternSignatures)
// or one level up (canonicalProblems arrays).
function collectSkillCodes() {
  const found = [];
  const visit = (node, owner) => {
    if (Array.isArray(node)) {
      node.forEach((x) => visit(x, owner));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'frameworkSkill' && typeof value === 'string') found.push({ owner, code: value });
      else if (key === 'frameworkSkills' && Array.isArray(value)) value.forEach((code) => found.push({ owner, code }));
      else visit(value, REMOVED_FROM_CED.has(key) || /^[a-z0-9-]+$/.test(key) ? key : owner);
    }
  };
  for (const section of ['patternSignatures', 'canonicalProblems', 'distractorSets', 'confusionMatrix']) {
    visit(patterns[section] ?? {}, null);
  }
  return found;
}

describe('ti84 skill taxonomy re-home (W8b)', () => {
  it('the canonical taxonomy has exactly 18 codes', () => {
    expect(taxonomy.codeCount).toBe(18);
    expect(taxonomyCodes.size).toBe(18);
  });

  it('every surviving procedure uses only canonical taxonomy codes', () => {
    for (const { owner, code } of collectSkillCodes()) {
      if (REMOVED_FROM_CED.has(owner)) continue;
      expect(taxonomyCodes.has(code), `"${owner}" carries non-taxonomy code "${code}"`).toBe(true);
    }
  });

  it('the five pruned procedures keep old Big-Idea codes (documented policy)', () => {
    const prunedCodes = collectSkillCodes().filter(({ owner }) => REMOVED_FROM_CED.has(owner));
    expect(prunedCodes.length).toBeGreaterThan(0);
    for (const { owner, code } of prunedCodes) {
      expect(OLD_BIG_IDEA.test(code), `pruned "${owner}" unexpectedly re-homed to "${code}"`).toBe(true);
    }
  });

  it('the policy note survives in the data file', () => {
    expect(patterns.meta.frameworkSkillsSource).toContain('skill-taxonomy-ced2026.json');
  });

  it('data-templates.js is fully cleansed of Big-Idea codes', () => {
    const templates = fs.readFileSync(path.join(root, 'ti84-trainer-v2', 'data-templates.js'), 'utf8');
    expect(templates.match(/(UNC|VAR|DAT)-\d/g)).toBeNull();
  });
});

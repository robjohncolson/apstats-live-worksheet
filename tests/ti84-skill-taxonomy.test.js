// W8b guard: the TI-84 trainer's skill codes must come from the canonical
// Fall-2026 taxonomy (data/skill-taxonomy-ced2026.json, plan G7) — with one
// documented exception: the five REMOVED-from-CED procedures pruned to
// bonus-only in W8a intentionally keep their old 2019 Big-Idea codes, because
// no current-CED code applies to content the CED dropped.
//
// Hardened per Codex review 2026-08-07: ownership comes from each section's
// top-level entry key (not inferred from nested property names), every
// surviving procedure must carry a non-empty skill set, and each of the five
// pruned procedures is asserted individually.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'skill-taxonomy-ced2026.json'), 'utf8'));
const patterns = JSON.parse(fs.readFileSync(path.join(root, 'ti84-pattern-recognition-data.json'), 'utf8'));

const REMOVED_FROM_CED = ['geometpdf', 'geometcdf', 'chi-square-gof-test', 'linreg-ttest', 'linreg-tint'];
const OLD_BIG_IDEA = /^(UNC|VAR|DAT)-\d/;

const taxonomyCodes = new Set(
  taxonomy.practices.flatMap((p) => p.codes.map((c) => c.code)),
);

// Every skill code found under a section's top-level entry, keyed by that
// entry's key — the procedure id (patternSignatures/canonicalProblems/
// distractorSets) or the confusion-pair key (confusionMatrix).
function codesByOwner() {
  const owners = new Map();
  const record = (owner, code) => {
    if (!owners.has(owner)) owners.set(owner, []);
    owners.get(owner).push(code);
  };
  const harvest = (owner, node) => {
    if (Array.isArray(node)) {
      node.forEach((x) => harvest(owner, x));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'frameworkSkill' && typeof value === 'string') record(owner, value);
      else if (key === 'frameworkSkills' && Array.isArray(value)) value.forEach((c) => record(owner, c));
      else harvest(owner, value);
    }
  };
  for (const section of ['patternSignatures', 'canonicalProblems', 'distractorSets', 'confusionMatrix']) {
    for (const [entryKey, entry] of Object.entries(patterns[section] ?? {})) {
      // Confusion pairs ("a|b") attribute to each named procedure.
      const entryOwners = entryKey.includes('|') ? entryKey.split('|') : [entryKey];
      for (const owner of entryOwners) harvest(owner, entry);
    }
  }
  return owners;
}

const owners = codesByOwner();
const allProcedureIds = Object.keys(patterns.patternSignatures);
const survivors = allProcedureIds.filter((id) => !REMOVED_FROM_CED.includes(id));

describe('ti84 skill taxonomy re-home (W8b)', () => {
  it('the canonical taxonomy has exactly 18 codes', () => {
    expect(taxonomy.codeCount).toBe(18);
    expect(taxonomyCodes.size).toBe(18);
  });

  it('every surviving procedure carries a NON-EMPTY, all-canonical skill set', () => {
    for (const id of survivors) {
      const codes = owners.get(id) ?? [];
      expect(codes.length, `survivor "${id}" has no skill codes at all`).toBeGreaterThan(0);
      for (const code of codes) {
        expect(taxonomyCodes.has(code), `"${id}" carries non-taxonomy code "${code}"`).toBe(true);
      }
    }
  });

  it('each of the five pruned procedures individually keeps old Big-Idea codes', () => {
    for (const id of REMOVED_FROM_CED) {
      const codes = owners.get(id) ?? [];
      expect(codes.length, `pruned "${id}" lost its (intentional) legacy codes`).toBeGreaterThan(0);
      for (const code of codes) {
        expect(OLD_BIG_IDEA.test(code), `pruned "${id}" unexpectedly re-homed to "${code}"`).toBe(true);
      }
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

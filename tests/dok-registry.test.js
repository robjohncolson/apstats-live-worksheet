/**
 * T1 — dok/registry.jsonl schema (APS_DOK_LADDER_SPEC.md §2.1, §7).
 * Pure Node: parses the registry, validates every row, and pins the spec's rules
 * (id pattern, dok enum, rationale that names the KIND of thinking not difficulty,
 * focus rows top out at DOK 3 with laddered parts + first_take + frq_pattern + scoring,
 * hypothetical flag on numeric stems, skill codes from the CED).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const REGISTRY_DIR = resolve(ROOT, 'dok', 'registry');

const ID_RE = /^aps-\d+\.\d+-d[123]-\d+$/;
const SKILL_RE = /^[1-4]\.[A-F]$/;
const BANNED = ['hard', 'easy', 'difficult'];

function loadRows() {
  // One file per lesson day (dok/registry/{topic}.jsonl) so parallel authors never collide.
  const rows = [];
  for (const f of readdirSync(REGISTRY_DIR).filter((n) => n.endsWith('.jsonl')).sort()) {
    const lines = readFileSync(resolve(REGISTRY_DIR, f), 'utf8').split(/\r?\n/).filter((l) => l.trim());
    lines.forEach((l, i) => {
      let row;
      try { row = JSON.parse(l); } catch (e) { throw new Error(`${f} line ${i + 1}: ${e.message}`); }
      if (row.topic !== f.slice(0, -6)) throw new Error(`${f} line ${i + 1}: topic ${row.topic} must equal the file name`);
      rows.push(row);
    });
  }
  return rows;
}

function cedSkillCodes() {
  // Every skill code that appears in the per-topic tutor tethers (generated from the CED frameworks).
  const codes = new Set();
  for (const f of readdirSync(resolve(ROOT, 'ai-tutor')).filter((n) => /^u\d+_l\d+\.md$/.test(n))) {
    const txt = readFileSync(resolve(ROOT, 'ai-tutor', f), 'utf8');
    for (const m of txt.matchAll(/Skills? ([1-4]\.[A-F])/g)) codes.add(m[1]);
  }
  return codes;
}

const rows = loadRows();
const skills = cedSkillCodes();

describe('dok/registry.jsonl', () => {
  it('parses, has unique ids, and at least the Phase-1 focus row', () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('aps-1.6-d3-1');
  });

  it.each(rows.map((r) => [r.id, r]))('%s satisfies the item schema', (_id, r) => {
    expect(r.id).toMatch(ID_RE);
    expect([1, 2, 3]).toContain(r.dok);
    expect(['focus', 'reinforcement']).toContain(r.role);
    expect(r.topic).toBe(r.id.split('-')[1]);
    expect(r.dok_rationale.length).toBeGreaterThanOrEqual(40);
    for (const w of BANNED) expect(r.dok_rationale.toLowerCase()).not.toContain(w);
    expect(r.skill).toMatch(SKILL_RE);
    expect(skills.has(r.skill)).toBe(true);
    if (/\d/.test(r.stem)) expect(r.hypothetical).toBe(true);
    expect(r.source).toMatch(/^(original|adapted:)/);
  });

  it.each(rows.filter((r) => r.role === 'focus').map((r) => [r.id, r]))('%s is a complete DOK-3 focus problem', (_id, r) => {
    expect(r.dok).toBe(3); // spec §1.3 — every lesson's problem tops out at DOK 3
    expect(r.first_take).toBeTruthy();
    expect(r.frq_pattern).toMatch(/^[a-z0-9-]+$/);
    expect(r.parts.length).toBeGreaterThanOrEqual(2);
    expect(r.parts.length).toBeLessThanOrEqual(4);
    const doks = r.parts.map((p) => p.dok);
    expect(doks).toEqual([...doks].sort((a, b) => a - b)); // non-decreasing ladder
    expect(doks[doks.length - 1]).toBe(3);
    for (const p of r.parts) {
      expect(p.skill).toMatch(SKILL_RE);
      expect(r.answers[p.label]).toBeTruthy(); // teacher key for every part
    }
    expect(r.scoring.expectedElements.length).toBeGreaterThan(0);
    for (const k of ['E', 'P', 'I']) expect(r.scoring.scoringGuide[k]).toBeTruthy();
  });
});

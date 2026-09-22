// RUBRIC_SLIM_SPEC guard: every decisions file under state/rubric-slim/ is fully
// applied to its prompt files (required sets, scoring guides, reworded mistakes,
// slimmed GRADING STANDARD), per-question required counts stay within 1..4, and
// no element id ever vanishes or reorders (state/rubric-slim/id-snapshot.json).
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRubrics, verifyDecisions } from '../scripts/rubric-slim-apply.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = resolve(ROOT, 'state/rubric-slim');
const DECISION_FILES = readdirSync(DIR).filter(f => f.endsWith('-decisions.json')).sort();
const SNAPSHOT = JSON.parse(readFileSync(resolve(DIR, 'id-snapshot.json'), 'utf8'));

describe('rubric slim decisions are applied', () => {
  expect(DECISION_FILES.length).toBeGreaterThanOrEqual(3);
  for (const name of DECISION_FILES) {
    const decisions = JSON.parse(readFileSync(resolve(DIR, name), 'utf8'));
    it(`${name} matches its prompt files`, () => {
      for (const [file, perQuestion] of Object.entries(decisions.files)) {
        const source = readFileSync(resolve(ROOT, file), 'utf8');
        expect(verifyDecisions(source, perQuestion, file)).toEqual([]);
      }
    });
    it(`${name} requires at most 10 elements per question (above 5 only for a full inference procedure whose asks compose CB's four compound points)`, () => {
      const counts = Object.values(decisions.files).flatMap(perQuestion => Object.values(perQuestion).map(d => d.required.length));
      expect(Math.max(...counts)).toBeLessThanOrEqual(10);
    });
  }
  it('averages at most 4.0 required elements across every slimmed question', () => {
    const counts = DECISION_FILES.flatMap(name => {
      const decisions = JSON.parse(readFileSync(resolve(DIR, name), 'utf8'));
      return Object.values(decisions.files).flatMap(perQuestion => Object.values(perQuestion).map(d => d.required.length));
    });
    expect(counts.reduce((a, b) => a + b, 0) / counts.length).toBeLessThanOrEqual(4.0);
  });
});

describe('element ids never vanish', () => {
  for (const [file, questions] of Object.entries(SNAPSHOT)) {
    it(file, () => {
      const rubrics = loadRubrics(readFileSync(resolve(ROOT, file), 'utf8'));
      for (const [q, ids] of Object.entries(questions)) {
        expect(rubrics[q].expectedElements.map(e => e.id), q).toEqual(ids);
      }
    });
  }
});

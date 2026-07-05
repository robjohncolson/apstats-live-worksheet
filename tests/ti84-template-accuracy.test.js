// Scipy pin for Track C template answers (TI84_TRAINER_TEMPLATES_SPEC.md §7B):
// stat-math.js must agree with the committed scipy references (<0.001% rel /
// 1e-6 abs) on every committed sample, and the committed files must match the
// CURRENT template (templateHash) — editing a template without regenerating
// the pins (scripts/build-ti84-template-samples.mjs then
// tools/ti84_template_reference.py) fails loudly here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const V2 = path.join(root, 'ti84-trainer-v2');

new Function(fs.readFileSync(path.join(V2, 'native', 'stat-math.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(V2, 'data-templates.js'), 'utf8'))();
const T = window.TI84V2Templates;

const samples = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'ti84-template-samples.json'), 'utf8'));
const refs = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'ti84-template-reference-values.json'), 'utf8'));

const refByKey = new Map(refs.map((r) => [`${r.templateId}:${r.seed}`, r]));

function closeEnough(actual, expected) {
  const tolerance = Math.max(Math.abs(expected) * 1e-5, 1e-6);
  return Math.abs(actual - expected) <= tolerance;
}

describe('template samples vs scipy references', () => {
  it('every sample has a reference and matches the current templateHash', () => {
    expect(samples.length).toBeGreaterThan(0);
    expect(refs.length).toBe(samples.length);
    for (const sample of samples) {
      const currentHash = T.templateHash(T.TEMPLATES[sample.templateId]);
      expect(sample.templateHash, `${sample.templateId} samples are stale — regenerate the pins`).toBe(currentHash);
      const ref = refByKey.get(`${sample.templateId}:${sample.seed}`);
      expect(ref, `missing reference for ${sample.templateId}:${sample.seed}`).toBeTruthy();
      expect(ref.templateHash, `${sample.templateId} references are stale — regenerate the pins`).toBe(currentHash);
    }
  });

  it('samples regenerate byte-identically from their seeds (committed file is honest)', () => {
    for (const sample of samples) {
      const problem = T.generateProblem(T.TEMPLATES[sample.templateId], sample.seed);
      expect(problem.values).toEqual(sample.values);
    }
  });

  it.each(samples.map((s) => [`${s.templateId}:${s.seed}`, s]))('%s matches scipy', (key, sample) => {
    const ref = refByKey.get(key).ref;
    const answer = T.TEMPLATES[sample.templateId].recompute(sample.values);
    for (const [field, expected] of Object.entries(ref)) {
      expect(closeEnough(answer[field], expected), `${field}: ${answer[field]} vs scipy ${expected}`).toBe(true);
    }
  });
});

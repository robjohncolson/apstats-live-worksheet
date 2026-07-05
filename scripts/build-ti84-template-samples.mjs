// Generates the committed sample problems for the Track C scipy pin
// (TI84_TRAINER_TEMPLATES_SPEC.md §7B): seeds 0..24 per template →
// tests/ti84-template-samples.json. Deterministic — the file only changes
// when a template changes (templateHash makes that loud).
//
// Usage: node scripts/build-ti84-template-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V2 = path.join(root, 'ti84-trainer-v2');

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(V2, 'native', 'stat-math.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(V2, 'data-templates.js'), 'utf8'))();

const T = window.TI84V2Templates;
const SEEDS = Array.from({ length: 25 }, (_, i) => i);

const samples = [];
for (const template of Object.values(T.TEMPLATES)) {
  for (const seed of SEEDS) {
    const problem = T.generateProblem(template, seed);
    samples.push({
      templateId: problem.templateId,
      templateHash: problem.templateHash,
      seed,
      values: problem.values,
    });
  }
}

const outPath = path.join(root, 'tests', 'ti84-template-samples.json');
fs.writeFileSync(outPath, `${JSON.stringify(samples, null, 2)}\n`);
console.log(`Wrote ${samples.length} samples to ${outPath}`);

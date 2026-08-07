/**
 * scripts/build-answer-key.mjs — Gradebook Phase 2a.
 *
 * READ-ONLY extraction of MCQ answer keys from the SACRED curriculum.js bank
 * into a derived artifact roster-server can score against. NEVER writes
 * curriculum.js (only `new Function`-evaluates it to read the array), exactly
 * like build-skill-map.mjs / disambiguate-skills.mjs.
 *
 * Dual-write (mirrors build-work-manifest.mjs): repo-root data/answer-key.json
 * + a byte-identical bundled roster-server/data/answer-key.json — the bundled
 * copy is the ONLY one shipped to Railway (Root Directory = roster-server).
 *
 * Shape (keyed by curriculum.js question id; ids are verbatim work-manifest /
 * skill-map keys — DN2d proved all 817 cr ids match with 0 mapping):
 *   { "U1-L2-Q01": { "answerKey": "B", "type": "multiple-choice",
 *                     "unit": "1", "topic": "1.2" }, ... }
 *
 * Only objectively-scorable `multiple-choice` items are emitted.
 * `free-response` / `resource` items have no objective key → excluded
 * (counted); FRQ correctness is the AI-graded follow-along feeder's job.
 *
 * CLI: node scripts/build-answer-key.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ANSWER_KEY_PATH = resolve(ROOT, 'data/answer-key.json');
const BUNDLED_PATH = resolve(ROOT, 'roster-server/data/answer-key.json');

// curriculum.js lives in the sibling cr repo (sacred, read-only).
const CURRICULUM_PATHS = [
  resolve(ROOT, '../curriculum_render/data/curriculum.js'),
  resolve(ROOT, '../curriculum_render_v2/data/curriculum.js'),
];

/** Load the curriculum array by evaluating the source READ-ONLY. */
function loadCurriculum() {
  for (const p of CURRICULUM_PATHS) {
    if (!existsSync(p)) continue;
    const source = readFileSync(p, 'utf8');
    const fn = new Function(
      source.replace(/^const\s+EMBEDDED_CURRICULUM\s*=\s*/, 'var EMBEDDED_CURRICULUM = ') +
      '; return EMBEDDED_CURRICULUM;'
    );
    const items = fn();
    if (Array.isArray(items)) return { items, path: p };
  }
  throw new Error('curriculum.js not found in any known location');
}

/** id → { unit, topic }. `U{u}-L{l}-Q..` → topic `{u}.{l}`; `U{u}-PC-..` → no lesson topic. */
export function deriveUnitTopic(id) {
  const um = String(id).match(/^U(\d+)-/i);
  const unit = um ? um[1] : null;
  const lm = String(id).match(/^U\d+-L(\d+)-/i);
  const topic = (unit && lm) ? `${unit}.${lm[1]}` : null;
  return { unit, topic };
}

/** Build the answer-key map + stats. Pure (no I/O) for testability. */
export function buildAnswerKey(items, bonusTopics = new Set()) {
  const key = {};
  let mcq = 0;
  let excludedFreeResponse = 0;
  let excludedResource = 0;
  let excludedNoKey = 0;
  let excludedBonusTopic = 0;
  for (const it of items) {
    if (!it || !it.id) continue;
    // Bonus topics are dropped from the live work-manifest, so their items
    // are never served — keying them would break the subset invariant.
    if (bonusTopics.has(deriveUnitTopic(it.id).topic)) {
      excludedBonusTopic++;
      continue;
    }
    if (it.type === 'multiple-choice') {
      if (it.answerKey == null || String(it.answerKey).trim() === '') {
        excludedNoKey++;
        continue;
      }
      const { unit, topic } = deriveUnitTopic(it.id);
      key[String(it.id)] = {
        answerKey: String(it.answerKey).trim(),
        type: 'multiple-choice',
        unit,
        topic,
      };
      mcq++;
    } else if (it.type === 'free-response') {
      excludedFreeResponse++;
    } else {
      excludedResource++;
    }
  }
  // Deterministic key order.
  const sorted = {};
  for (const k of Object.keys(key).sort()) sorted[k] = key[k];
  return {
    answerKey: sorted,
    stats: { mcq, excludedFreeResponse, excludedResource, excludedNoKey, excludedBonusTopic, total: items.length },
  };
}

function main() {
  const { items, path } = loadCurriculum();
  const crosswalk = JSON.parse(readFileSync(resolve(__dirname, '..', '2026-crosswalk.json'), 'utf8'));
  const bonusTopics = new Set(Object.entries(crosswalk.map).filter(([, v]) => v.status === 'bonus').map(([k]) => k));
  const { answerKey, stats } = buildAnswerKey(items, bonusTopics);

  // Report the ACTUAL source read (loadCurriculum may fall back to the
  // _v2 sibling) so artifact provenance is accurate (Codex MINOR).
  const srcLabel = path.replace(/\\/g, '/').replace(/^.*\/(curriculum_render(?:_v2)?\/data\/curriculum\.js)$/, '$1');
  const payload = {
    generatedFrom: `${srcLabel} (READ-ONLY)`,
    generated: new Date().toISOString(),
    counts: stats,
    answerKey,
  };
  const json = JSON.stringify(payload, null, 2);

  writeFileSync(ANSWER_KEY_PATH, json, 'utf8');
  console.log(`Wrote ${ANSWER_KEY_PATH}`);
  mkdirSync(dirname(BUNDLED_PATH), { recursive: true });
  writeFileSync(BUNDLED_PATH, json, 'utf8');
  console.log(`Wrote ${BUNDLED_PATH} (bundled for deploy)`);

  console.log(
    `Source: ${path}\n` +
    `MCQ answer keys: ${stats.mcq}\n` +
    `Excluded: free-response ${stats.excludedFreeResponse}, bonus-topic ${stats.excludedBonusTopic}, ` +
    `resource ${stats.excludedResource}, mc-without-key ${stats.excludedNoKey}\n` +
    `Total curriculum items: ${stats.total}`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

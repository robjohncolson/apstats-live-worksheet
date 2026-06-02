/**
 * scripts/gen-blooket-lessons.mjs
 *
 * Generates roster-server/data/blooket-lessons.json — the set of topicKeys that
 * HAVE a Blooket (a non-null blooket URL in the Desk registry). The v3 Blooket
 * grade track (BLOOKET_MAKEUP_BUILD.md) uses this as the denominator: only
 * lessons that actually have a Blooket count a missing Blooket as 0, so a
 * topic with no Blooket is never an unfair 0.
 *
 * Source of truth: ../../roadmap-data.json (.lessons[topicKey].urls.blooket).
 * Re-run after a roadmap rebake changes the Blooket set:
 *   node roster-server/scripts/gen-blooket-lessons.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..');                 // follow-alongs root
const SRC = resolve(REPO, 'roadmap-data.json');
const OUT = resolve(here, '..', 'data', 'blooket-lessons.json');

const data = JSON.parse(readFileSync(SRC, 'utf8'));

// Find the registry object (values shaped { topic, urls:{blooket,...} }).
function findRegistry(o) {
  if (o && typeof o === 'object') {
    for (const k in o) {
      const v = o[k];
      if (v && v.urls && ('blooket' in v.urls)) return o;
    }
    for (const k in o) {
      const r = findRegistry(o[k]);
      if (r) return r;
    }
  }
  return null;
}

const reg = findRegistry(data);
if (!reg) {
  console.error('Could not find the registry (no object with .urls.blooket) in roadmap-data.json');
  process.exit(1);
}

const topics = Object.keys(reg)
  .filter((k) => reg[k] && reg[k].urls && reg[k].urls.blooket)
  .sort((a, b) => {
    // numeric-aware sort: "1.2" < "1.10" < "2.1"
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    return (pa[0] - pb[0]) || (pa[1] - pb[1]) || a.localeCompare(b);
  });

const payload = {
  generatedFrom: 'roadmap-data.json',
  note: 'topicKeys with a Blooket — the v3 Blooket-track denominator (BLOOKET_MAKEUP_BUILD.md)',
  topics,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`Wrote ${OUT} — ${topics.length} Blooket-bearing topics.`);
console.log(topics.join(', '));

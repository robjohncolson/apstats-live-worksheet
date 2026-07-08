// apply-ced2026-overlay.mjs — apply the Fall 2026 CED overlay to the CURRENT
// roadmap-data.json IN PLACE, additively, without a full Agent rebake.
//
// Why this exists (not just the Agent generator): build-roadmap-data.mjs
// regenerates roadmap-data.json from Agent state, which currently carries an
// extra lesson (6.review) not in the deployed file. Re-running it would ship
// that lesson as a side effect of a CED-overlay change. This script instead
// reads the live roadmap-data.json and adds ONLY the `ced2026` object per
// lesson, leaving every other field (incl. the existing `status`) untouched.
//
// The Agent generator (build-roadmap-data.mjs) ALSO emits ced2026 now, so a
// future intentional rebake stays consistent — this is the interim applier for
// the live file. Idempotent: re-running just refreshes ced2026.
//
// Run: node scripts/apply-ced2026-overlay.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAP = resolve(REPO, 'roadmap-data.json');
const CROSSWALK = resolve(REPO, '2026-crosswalk.json');

const roadmap = JSON.parse(readFileSync(ROADMAP, 'utf8'));
const cw = JSON.parse(readFileSync(CROSSWALK, 'utf8')).map || {};

let core = 0, bonus = 0, unmapped = [];
for (const [id, lesson] of Object.entries(roadmap.lessons || {})) {
  const c = cw[id] || null;                 // ced2026 object, or null if not in the crosswalk (e.g. review lessons)
  lesson.ced2026 = c;                        // ADDITIVE: only this key is added/updated
  if (c && c.status === 'core') core++;
  else if (c && c.status === 'bonus') bonus++;
  else unmapped.push(id);
}

writeFileSync(ROADMAP, JSON.stringify(roadmap, null, 2) + '\n', 'utf8');
console.log(`ced2026 overlay applied to ${ROADMAP}`);
console.log(`  ${Object.keys(roadmap.lessons).length} lessons: ${core} core / ${bonus} bonus / ${unmapped.length} unmapped [${unmapped.join(', ')}]`);

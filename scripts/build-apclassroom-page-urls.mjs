// build-apclassroom-page-urls.mjs -- the page list for the AP Classroom page sender.
//
// The sender (an always-on agent signed into AP Classroom in its own browser) opens each
// page below on a schedule and POSTs its visible text (innerText) to the roster server:
//   POST /admin/apclassroom-page/<assignmentId>   (roster-server/apclassroom-pages.js)
// The nightly reconcile (tools/apclassroom_pc_reconcile.py --pages server) reads them back.
//
// Input:  data/apclassroom-assignments.json (the registry; never edited here)
// Output: data/apclassroom-page-urls.json, one row per part with an AP Classroom id:
//   { assignmentId, section, unit, part, url }
//   MCQ parts (A, B, C, D) -> ?tab=RESULTS_STUDENTS, FRQ -> ?tab=PROGRESS
// Public-safe: ids and urls only, the same facts as the registry. No student data.
//
// Run: node scripts/build-apclassroom-page-urls.mjs          (writes the file)
//      node scripts/build-apclassroom-page-urls.mjs --check  (fails if the file is stale)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = new URL('../', import.meta.url);
const REGISTRY = new URL('data/apclassroom-assignments.json', REPO);
const OUTPUT = new URL('data/apclassroom-page-urls.json', REPO);

const AP_BASE = 'https://apclassroom.collegeboard.org';
const PART_ORDER = ['A', 'B', 'C', 'D', 'FRQ'];

export function pageUrl(classId, assignmentId, part) {
  const tab = part === 'FRQ' ? 'PROGRESS' : 'RESULTS_STUDENTS';
  return `${AP_BASE}/${classId}/assignments/progress/${assignmentId}?tab=${tab}`;
}

// Registry parts in a fixed order: the known ones first, anything else after (sorted).
function orderedParts(parts) {
  const names = Object.keys(parts || {});
  const known = PART_ORDER.filter((name) => names.includes(name));
  const other = names.filter((name) => !PART_ORDER.includes(name)).sort();
  return [...known, ...other];
}

export function buildPageUrls(registry) {
  const classId = String(registry.classId);
  const pages = [];
  for (const entry of registry.progressChecks || []) {
    for (const part of orderedParts(entry.parts)) {
      const assignmentId = entry.parts[part] && entry.parts[part].id;
      if (!assignmentId) continue;
      pages.push({
        assignmentId: String(assignmentId),
        section: entry.section,
        unit: entry.unit,
        part,
        url: pageUrl(classId, assignmentId, part),
      });
    }
  }
  return { source: 'data/apclassroom-assignments.json', classId, pages };
}

export function renderPageUrls(registry) {
  return JSON.stringify(buildPageUrls(registry), null, 2) + '\n';
}

function main() {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const text = renderPageUrls(registry);
  if (process.argv.includes('--check')) {
    const current = readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n');
    if (current !== text) {
      console.error('data/apclassroom-page-urls.json is stale: run node scripts/build-apclassroom-page-urls.mjs');
      process.exit(1);
    }
    console.log('data/apclassroom-page-urls.json is current');
    return;
  }
  writeFileSync(OUTPUT, text);
  console.log(`wrote data/apclassroom-page-urls.json (${buildPageUrls(registry).pages.length} pages)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

#!/usr/bin/env node
/**
 * Rewire worksheet calculator practice links from the retired TI-84 trainer to the APStat Park
 * solo room (APSTAT_PARK_TRAINER_ABSORB_SPEC §8.1).
 *
 *   ti84-trainer-v2/standalone.html#topic=T&source=worksheet
 *     -> ap_stats_roadmap_square_mode.html#room=calc-solo&topic=T
 *
 * The link carries `topic`, not `skill`: the park resolves it through data/ti84-lesson-map.json,
 * so the map stays the single source. Pattern-guarded to ^u\d+_lesson.+_live\.html$ and
 * idempotent: a second run (and a run over already-wired files) changes nothing.
 *
 * Dry-run by default:
 *   node scripts/wire-park-calculator-links.mjs
 *   node scripts/wire-park-calculator-links.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, '..');
export const WORKSHEET_RE = /^u\d+_lesson.+_live\.html$/;
export const PARK_ENTRY = 'ap_stats_roadmap_square_mode.html';
// The old trainer link, as scripts/wire-ti84-practice-links.mjs wrote it (href only; the text,
// the bonus badge and the wrapper stay).
export const OLD_LINK_RE = /href="ti84-trainer-v2\/standalone\.html#topic=([^&"]+)&source=worksheet"/g;
export const NEW_LINK_RE = /href="ap_stats_roadmap_square_mode\.html#room=calc-solo&topic=([^&"]+)"/g;

export function parkLink(topic) {
  return `href="${PARK_ENTRY}#room=calc-solo&topic=${topic}"`;
}

// Returns { html, changed, topics } for one worksheet's HTML. Idempotent.
export function rewireHtml(html) {
  const topics = [];
  const next = html.replace(OLD_LINK_RE, (_, topic) => { topics.push(topic); return parkLink(topic); });
  return { html: next, changed: next !== html, topics };
}

export function worksheetFilenames(root = ROOT) {
  return fs.readdirSync(root).filter(name => WORKSHEET_RE.test(name)).sort();
}

export function run({ apply = false, root = ROOT, log = console.log } = {}) {
  const report = [];
  for (const filename of worksheetFilenames(root)) {
    const file = path.join(root, filename);
    const raw = fs.readFileSync(file, 'utf8');
    const { html, changed, topics } = rewireHtml(raw);
    if (!changed) continue;
    report.push({ filename, topics });
    log((apply ? 'rewired ' : 'would rewire ') + filename + ': ' + topics.join(', '));
    if (apply) fs.writeFileSync(file, html, 'utf8');
  }
  log((apply ? 'rewired ' : 'would rewire ') + report.length + ' worksheet(s)');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run({ apply: process.argv.includes('--apply') });
}

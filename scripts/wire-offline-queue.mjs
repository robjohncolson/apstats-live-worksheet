/**
 * scripts/wire-offline-queue.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of OFFLINE_MODE_SPEC §4.A to every
 * u*_lesson*_live.html: load offline-queue.js so gradebook-client.js can capture
 * grade writes locally when there is no server (offline pack or a dropped fetch)
 * and flush them later.
 *
 * One transform per file: inject `<script src="offline-queue.js"></script>`
 * immediately BEFORE the existing `<script src="gradebook-client.js"></script>`
 * (offline-queue must be defined before gradebook-client first calls record()).
 * Indentation of the anchor line is preserved.
 *
 * EOL-preserving: older U1–U3 / U8–U9 worksheets are CRLF; the rest LF. The file
 * is re-written in its own native EOL.
 *
 * Idempotency: a wired file already contains `src="offline-queue.js"`. SKIP it.
 *
 * Usage:
 *   node scripts/wire-offline-queue.mjs            # dry-run report
 *   node scripts/wire-offline-queue.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const MARKER = 'src="offline-queue.js"';
const ANCHOR_RE = /([ \t]*)<script src="gradebook-client\.js"><\/script>/;
const TAG = '<script src="offline-queue.js"></script>';

const files = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();

const report = [];
let wired = 0, already = 0, failed = 0;

for (const f of files) {
  const path = resolve(ROOT, f);
  const html = readFileSync(path, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const line = { f, eol: eol === '\r\n' ? 'CRLF' : 'LF', state: '', detail: '' };

  if (html.includes(MARKER)) {
    line.state = 'SKIP'; line.detail = 'already-wired'; already++; report.push(line); continue;
  }

  const matches = html.match(new RegExp(ANCHOR_RE.source, 'g')) || [];
  if (matches.length !== 1) {
    line.state = 'FAIL'; line.detail = `gradebook-client anchor ×${matches.length} (expected 1)`;
    failed++; report.push(line); continue;
  }

  const out = html.replace(ANCHOR_RE, (m, indent) => `${indent}${TAG}${eol}${indent}<script src="gradebook-client.js"></script>`);
  if (out === html || (out.match(new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
    line.state = 'FAIL'; line.detail = 'inject failed / marker not exactly once'; failed++; report.push(line); continue;
  }

  if (APPLY) writeFileSync(path, out, 'utf8');
  line.state = 'OK'; wired++; report.push(line);
}

console.log(`wire-offline-queue — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets\n`);
for (const r of report) {
  console.log(`[${r.state.padEnd(4)}] ${r.f.padEnd(38)} (${r.eol.padEnd(4)})${r.detail ? '  ' + r.detail : ''}`);
}
console.log(`\nSummary: ${wired} wired, ${already} already, ${failed} failed.`);
if (failed > 0) { console.log('\nFAIL — investigate above. Re-run will not auto-fix.'); process.exit(1); }
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');

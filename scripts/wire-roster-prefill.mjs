/**
 * scripts/wire-roster-prefill.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of <script src="../roster-prefill.js">
 * to every u*_lesson*_live.html. DRY-RUN by default — pass `--apply` to write.
 *
 * Mirrors scripts/dn2b-wire-feeders.mjs in shape: each file is read, edited,
 * and written in its OWN native EOL (~30 older U1-U3 / some U8-U9 worksheets
 * are CRLF; Desk + the newer worksheets are LF). The insertion anchor is the
 * existing `<script src="../roster-client.js"></script>` line — already
 * present in all 69 worksheets per DN2b. The roster-prefill tag goes
 * immediately AFTER roster-client.js so the prefill helper sees the rosterClient
 * global initialized.
 *
 * Idempotency: detected via the unique substring 'roster-prefill.js'. Files
 * already wired are reported as SKIP.
 *
 * Manual-hook fallback (anchor missing or non-unique): reported, NOT forced.
 * Expected: none — all 69 worksheets share the same roster-client.js script tag.
 *
 * Usage:
 *   node scripts/wire-roster-prefill.mjs            # dry-run report
 *   node scripts/wire-roster-prefill.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// Worksheets sit at the repo root; the roster-client.js / roster-prefill.js
// files are siblings — the script tag uses a bare relative path (no `../`).
const ANCHOR_LITERAL = '<script src="roster-client.js"></script>';
const NEW_TAG_LITERAL = '<script src="roster-prefill.js"></script>';
const SENTINEL = 'roster-prefill.js';

function occ(h, n) {
  let c = 0, i = 0;
  while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }
  return c;
}

const files = readdirSync(ROOT)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

let wrote = 0;
const manual = [];
const report = [];

for (const f of files) {
  const path = resolve(ROOT, f);
  let html = readFileSync(path, 'utf8');
  const before = html;
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const line = { f, eol: eol === '\r\n' ? 'CRLF' : 'LF', state: '' };

  if (html.includes(SENTINEL)) {
    line.state = 'already';
    report.push(line);
    continue;
  }

  const count = occ(html, ANCHOR_LITERAL);
  if (count !== 1) {
    line.state = `MANUAL(anchor×${count})`;
    manual.push(`${f} [${line.eol}]: roster-client.js anchor found ${count} times`);
    report.push(line);
    continue;
  }

  // Replace the anchor LINE with (anchor + native-EOL + same-indent new tag).
  // Use a regex to capture the leading whitespace on the anchor's line so the
  // new tag lines up visually under the existing script-load block (all 69
  // worksheets use 4-space indent today, but this stays robust to drift).
  const anchorLineRe = /([ \t]*)<script src="roster-client\.js"><\/script>/;
  const m = anchorLineRe.exec(html);
  if (!m) {
    line.state = 'MANUAL(line-regex)';
    manual.push(`${f} [${line.eol}]: roster-client.js line regex did not match`);
    report.push(line);
    continue;
  }
  const indent = m[1] || '';
  const replacement = ANCHOR_LITERAL + eol + indent + NEW_TAG_LITERAL;
  html = html.replace(ANCHOR_LITERAL, replacement);
  line.state = 'wire';

  if (html !== before && APPLY) {
    writeFileSync(path, html, 'utf8');
    wrote++;
  } else if (html !== before) {
    wrote++; // dry-run count
  }
  report.push(line);
}

console.log(`wire-roster-prefill — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
console.log('');
for (const r of report) {
  console.log(`[${r.state.padEnd(8)}] ${r.f.padEnd(38)} (${r.eol})`);
}
console.log('');
const already = report.filter((r) => r.state === 'already').length;
const wired = report.filter((r) => r.state === 'wire').length;
console.log(`Summary: ${wired} wired, ${already} already, ${manual.length} manual.`);
console.log(`Files needing manual hooks (${manual.length}):`);
console.log(manual.length ? manual.map((m) => '  ' + m).join('\n') : '  NONE');
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');

/**
 * scripts/wire-verdict-prompt.mjs  (W3.1)
 *
 * Idempotent, EOL-PRESERVING rollout that hardens the verdict instruction in
 * every in-scope ai-grading-prompts-*.js file.  The JSON "score" line in every
 * prompt builder is replaced with a version that explicitly mandates EXACTLY one
 * uppercase letter -- E, P, or I -- and nothing else.
 *
 * DRY-RUN by default -- pass `--apply` to write.
 *
 * EOL-preserving is load-bearing: each file is read, edited, and written in its
 * own native EOL.  The replacement is a same-line swap so no new EOL characters
 * are introduced.
 *
 * Four score-line patterns across the 69 in-scope files (confirmed unique per
 * file by analysis):
 *
 *   A  "score": "E" or "P" or "I",       -- 34 files (u1-u4 older style)
 *   B  "score": "E" | "P" | "I",         -- 4 files  (u5-l1-2, u6-l1-2/l3/l4)
 *   C  "score": "E|P|I",                 -- 24 files (u5-l3+, u6-l5+, u7, u8-l1/l2, u9-l4/l5)
 *   D  'score': 'E|P|I',                 -- 7 files  (u8-l3-l6, u9-l1-l3, single-quote style)
 *
 * EXCLUDED (not referenced by any u*_lesson*_live.html worksheet):
 *   ai-grading-prompts-edgar-u6.js
 *   ai-grading-prompts-mit6001.js
 *   ai-grading-prompts-mit6001-lec2.js
 *   ai-grading-prompts-study-guide.js
 *
 * Each pattern has its own done()-sentinel check so re-running is a no-op.
 * Any file where the anchor is absent or non-unique is REPORTED as MANUAL.
 *
 * Usage:  node scripts/wire-verdict-prompt.mjs            # dry-run report
 *         node scripts/wire-verdict-prompt.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// The sentinel used by done() checks -- must not appear in any original file
const SENTINEL = 'EXACTLY one uppercase letter';

// The four score-line replacement patterns.
// Each entry: { name, done, anchor, replacement }
//   done(html)        -> true if this file is already hardened
//   anchor            -> exact string to find (unique per in-scope file)
//   replacement       -> string to replace anchor with
const PATTERNS = [
  {
    name: 'A_or',
    done: (h) => h.includes(SENTINEL),
    anchor: '"score": "E" or "P" or "I",',
    replacement: '"score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text',
  },
  {
    name: 'B_pipe_dq',
    done: (h) => h.includes(SENTINEL),
    anchor: '"score": "E" | "P" | "I",',
    replacement: '"score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text',
  },
  {
    name: 'C_epi_dq',
    done: (h) => h.includes(SENTINEL),
    anchor: '"score": "E|P|I",',
    replacement: '"score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text',
  },
  {
    name: 'D_epi_sq',
    done: (h) => h.includes(SENTINEL),
    anchor: "'score': 'E|P|I',",
    replacement: "'score': 'E', 'P', or 'I', // EXACTLY one uppercase letter -- no words, no lowercase, no extra text",
  },
];

// In-scope files: only ai-grading-prompts-u*.js + ai-grading-prompts.js
// Excludes edgar-u6, mit6001, mit6001-lec2, study-guide
const IN_SCOPE_RE = /^ai-grading-prompts(-u[1-9].*|)\.js$/;
const EXCLUDE = new Set([
  'ai-grading-prompts-edgar-u6.js',
  'ai-grading-prompts-mit6001.js',
  'ai-grading-prompts-mit6001-lec2.js',
  'ai-grading-prompts-study-guide.js',
]);

const files = readdirSync(ROOT)
  .filter((f) => IN_SCOPE_RE.test(f) && !EXCLUDE.has(f))
  .sort();

const occ = (h, n) => {
  let c = 0;
  let i = 0;
  while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }
  return c;
};

let applied = 0;
let alreadyDone = 0;
const manual = [];
const report = [];

for (const f of files) {
  const path = resolve(ROOT, f);
  let html = readFileSync(path, 'utf8');
  const before = html;

  // Detect EOL (CRLF vs LF) -- needed only for verification; replacements are same-line
  const eol = html.includes('\r\n') ? 'CRLF' : 'LF';

  const line = { f, eol, status: '', patternName: '', note: '' };

  // Check if already done via sentinel
  if (html.includes(SENTINEL)) {
    alreadyDone++;
    line.status = 'SKIP';
    line.note = 'already hardened';
    report.push(line);
    continue;
  }

  // Find which pattern applies to this file
  let matched = null;
  for (const p of PATTERNS) {
    const count = occ(html, p.anchor);
    if (count === 1) {
      matched = p;
      break;
    } else if (count > 1) {
      line.status = 'MANUAL';
      line.note = `${p.name}(x${count}) -- anchor not unique`;
      manual.push(`${f} [${eol}]: ${line.note}`);
      report.push(line);
      matched = null;
      break;
    }
  }

  if (line.status === 'MANUAL') {
    continue;
  }

  if (!matched) {
    // No pattern anchor found at all
    line.status = 'MANUAL';
    line.note = 'no known score-line anchor found';
    manual.push(`${f} [${eol}]: ${line.note}`);
    report.push(line);
    continue;
  }

  // Apply replacement
  html = html.replace(matched.anchor, matched.replacement);

  // Verify sentinel is now present (sanity check)
  if (!html.includes(SENTINEL)) {
    line.status = 'MANUAL';
    line.note = `replacement did not introduce sentinel (pattern ${matched.name})`;
    manual.push(`${f} [${eol}]: ${line.note}`);
    report.push(line);
    continue;
  }

  applied++;
  line.status = 'WIRE';
  line.patternName = matched.name;
  line.note = `applied pattern ${matched.name}`;

  if (html !== before && APPLY) {
    writeFileSync(path, html, 'utf8');
  }

  report.push(line);
}

// Print report
console.log(`W3.1 verdict prompt hardening -- ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} -- ${files.length} in-scope files`);
console.log('');
for (const r of report) {
  let tag = r.status;
  if (tag === 'WIRE') tag = 'WIRE ';
  if (tag === 'SKIP') tag = 'SKIP ';
  let s = `[${tag}] ${r.f} (${r.eol})`;
  if (r.note) s += `  ${r.note}`;
  console.log(s);
}
console.log('');
console.log(`Summary:`);
console.log(`  Applied:      ${applied}`);
console.log(`  Already done: ${alreadyDone}`);
console.log(`  Manual:       ${manual.length}`);
console.log(`  Total:        ${files.length}`);
if (manual.length) {
  console.log(`\nFiles needing manual review (${manual.length}):`);
  manual.forEach((m) => console.log('  ' + m));
}
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');

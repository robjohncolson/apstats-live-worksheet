// wire-worksheet-script-paths.mjs — fix the worksheet config/client script paths.
// Worksheets live at the repo ROOT but load ../railway_config.js + ../railway_client.js,
// whose ../ resolves ABOVE the repo on GitHub Pages and 404s — so window.railwayClient
// (answer sync) and getGuestIdentity never load. The files actually sit same-dir.
// Swap ../railway_*.js -> railway_*.js across every follow-along worksheet
// (^u\d+_lesson..._live.html — edgar/MIT excluded). Idempotent.
//
// Usage:  node scripts/wire-worksheet-script-paths.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const PATTERN = /^u\d+_lesson.+_live\.html$/;
const REPLACEMENTS = [
  ['src="../railway_config.js"', 'src="railway_config.js"'],
  ['src="../railway_client.js"', 'src="railway_client.js"'],
];

const dry = process.argv.includes('--dry');
const files = readdirSync('.').filter((f) => PATTERN.test(f)).sort();

let changed = 0;
const already = [];
for (const f of files) {
  const before = readFileSync(f, 'utf8');
  let out = before;
  for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);
  if (out === before) { already.push(f); continue; }
  if (!dry) writeFileSync(f, out, 'utf8');
  changed++;
}

console.log(`${dry ? '[dry] ' : ''}script paths fixed: ${changed}  already: ${already.length}  (of ${files.length})`);

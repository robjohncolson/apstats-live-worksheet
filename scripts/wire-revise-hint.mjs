#!/usr/bin/env node
// One-shot codemod (2026-06-25): add a "you can revise anytime" hint under the
// action buttons of every worksheet, so students don't think a completed (greyed)
// worksheet is locked. Purely additive static markup (no logic, XSS-safe).
// EOL-preserving (some U1-U3 / U8-U9 worksheets are CRLF), idempotent.
//
//   node scripts/wire-revise-hint.mjs            # dry run (default)
//   node scripts/wire-revise-hint.mjs --apply    # write changes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const WS_RE = /^u\d+_lesson.+_live\.html$/;

// Anchor: the score span at the end of the .controls button row, then its closing
// </div>. Inject the hint as a block right AFTER .controls closes.
const ANCHOR = /(<span [^>]*id="scoreDisplay"[^>]*><\/span>[ \t]*\r?\n[ \t]*<\/div>)/;

const HINT =
  '<div class="revise-hint" style="margin:8px 0 12px;padding:7px 11px;'
  + 'background:#fffbe6;border:1px solid #e6d98a;border-radius:6px;'
  + 'font-size:12px;color:#5c4f00;line-height:1.55;max-width:680px">'
  + '&#8635; <b>Already did this one?</b> It stays open even after it&rsquo;s checked off &mdash; '
  + 'just change any answer and click <b>&#10003; Check Answers</b> again (no need to Reset). '
  + '<b>&#10024; Grade with AI</b> only ever <i>raises</i> your grade. '
  + 'Make sure you&rsquo;re <b>signed in</b> so your changes save.</div>';

const files = fs.readdirSync(ROOT).filter(f => WS_RE.test(f)).sort();
let changed = 0, already = 0;
const missed = [];
for (const f of files) {
  const p = path.join(ROOT, f);
  const src = fs.readFileSync(p, 'utf8');
  if (src.includes('revise-hint')) { already++; continue; }
  if (!ANCHOR.test(src)) { missed.push(f); continue; }
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const out = src.replace(ANCHOR, (m) => m + eol + '    ' + HINT);
  if (apply) fs.writeFileSync(p, out, 'utf8');
  changed++;
}

console.log(`worksheets scanned : ${files.length}`);
console.log(`${apply ? 'hint ADDED        ' : 'WOULD add (dry)   '}: ${changed}`);
console.log(`already have hint  : ${already}`);
if (missed.length) console.log(`!! INSPECT (anchor not found): ${missed.join(', ')}`);
if (!apply) console.log('(dry run — re-run with --apply to write)');

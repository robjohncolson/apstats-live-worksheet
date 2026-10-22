#!/usr/bin/env node
// scripts/migrate-desk-tests.mjs — point a test's Desk read at tests/helpers/desk-source.js.
//
// The Desk's inline script is being cut into js/desk-*.js modules (FABLE_SPRINT_2026_10_22C_SPEC.md
// track C3). Tests that pin FUNCTIONS by text (fnBody, indexOf, regex) must read the combined
// source (`deskSource()`); tests that pin MARKUP (<script src>, element ids, JSDOM) keep the raw
// file (`deskHtml()`). This codemod rewrites the one read line and adds the import; it is
// idempotent and touches nothing else.
//
//   node scripts/migrate-desk-tests.mjs [--html] [--dry] <test files...>
//     --split  the file pins both: keep the HTML and add <VAR>_SRC = deskSource() for fnBody pins
//     --html   rewrite to deskHtml() (same bytes as before, just via the helper); also turns an
//              earlier deskSource() rewrite back into deskHtml()
//     --dry    print what would change, write nothing
//
// Rewritten shapes (the RHS of an assignment, any quoting of the encoding):
//   readFileSync(<expr containing 'ap_stats_roadmap_square_mode.html'>, 'utf8')
//   readFileSync(deskPath | DESK_PATH, 'utf8')
//   (fs.readFileSync and `existsSync(...) ? readFileSync(...) : null` wrappers included)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const toHtml = args.includes('--html');
const dry = args.includes('--dry');
const split = args.includes('--split');
const files = args.filter((a) => !a.startsWith('--'));
const fn = (toHtml || split) ? 'deskHtml' : 'deskSource';
const HELPER = resolve('tests/helpers/desk-source.js');

const DESK_FILE = /ap_stats_roadmap_square_mode\.html/;
const PATH_VAR = /^\s*(?:deskPath|DESK_PATH)\s*$/;
// A test-local one-liner reader called with the Desk file name: read('...') / source('...').
const LOCAL_READER = /\b(?:read|source)\(\s*['"]ap_stats_roadmap_square_mode\.html['"]\s*\)/g;

// Every `readFileSync(<first arg>, 'utf8')` whose first argument names the Desk file (a string
// literal, a path/URL expression that contains it, or the deskPath / DESK_PATH variable),
// found by a balanced-paren scan so nesting depth does not matter.
function replaceReads(src, replacement) {
  let out = '';
  let i = 0;
  const re = /(?:fs\.)?readFileSync\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close < 0) break;
    const inner = src.slice(open + 1, close).replace(/,\s*$/, ''); // tolerate a trailing comma
    const comma = inner.lastIndexOf(',');
    const first = comma < 0 ? inner : inner.slice(0, comma);
    const second = comma < 0 ? '' : inner.slice(comma + 1);
    const namesDesk = DESK_FILE.test(first) || PATH_VAR.test(first);
    const utf8 = /^\s*['"]utf-?8['"]\s*$/.test(second);
    if (!namesDesk || !utf8) continue;
    out += src.slice(i, m.index) + replacement;
    i = close + 1;
    re.lastIndex = i;
  }
  return out + src.slice(i);
}
const ANY_HELPER_CALL = /\bdesk(?:Source|Html)\(\)/;
const HELPER_IMPORT = /^[^\n]*\b(?:import|require)\b[^\n]*helpers\/desk-source\.js[^\n]*$/m;

function helperPath(file) {
  let rel = relative(dirname(resolve(file)), HELPER).split('\\').join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function isEsm(src) {
  return /^\s*import\s[^;]*from\s/m.test(src) || !/\brequire\(/.test(src);
}

function addImport(src, file, name = fn) {
  const rel = helperPath(file);
  const esm = isEsm(src);
  const existing = HELPER_IMPORT.exec(src);
  if (existing) {
    const line = existing[0];
    const names = /\{([^}]*)\}/.exec(line);
    if (!names) return src;
    const list = names[1].split(',').map((n) => n.trim()).filter(Boolean);
    if (list.includes(name)) return src;
    list.push(name);
    return src.replace(line, line.replace(names[0], '{ ' + list.join(', ') + ' }'));
  }
  const text = esm ? `import { ${name} } from '${rel}';` : `const { ${name} } = require('${rel}');`;
  const anchor = esm
    ? /^import\s[^\n]*?from\s+['"][^'"]+['"];?[^\n]*$/gm
    : /^(?:const|let|var)\s[^\n]*=\s*require\([^\n]*$/gm;
  const hits = [...src.matchAll(anchor)];
  if (hits.length === 0) return text + '\n' + src;
  const last = hits[hits.length - 1];
  const at = last.index + last[0].length;
  return src.slice(0, at) + '\n' + text + src.slice(at);
}

// --split: the file pins both markup and code. Its Desk variable keeps the raw HTML
// (deskHtml()); a sibling `<NAME>_SRC = deskSource()` is added and every fnBody(<NAME>, ...)
// call (and a private `function fnBody(name)` that closes over <NAME>) reads the sibling.
function splitCodePins(src) {
  const read = /^(const|let|var)\s+(\w+)\s*=\s*(?:existsSync\([^)]*\)\s*\?\s*)?deskHtml\(\)(?:\s*:\s*null)?;[^\n]*$/m.exec(src);
  if (!read) return { src, split: false };
  const name = read[2];
  const sib = name + '_SRC';
  if (src.includes(sib)) return { src, split: true };
  const at = read.index + read[0].length;
  let out = src.slice(0, at) + `\nconst ${sib} = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this` + src.slice(at);
  const ident = new RegExp('(?<![\\w$.])' + name + '(?![\\w$])', 'g');
  out = out.replace(new RegExp('\\bfnBody\\(\\s*' + name + '\\s*,', 'g'), `fnBody(${sib},`);
  out = out.replace(/function fnBody\(name\) \{[\s\S]*?\n\}/, (m) => m.replace(ident, sib));
  return { src: out, split: true };
}

let changed = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = replaceReads(before, `${fn}()`).replace(LOCAL_READER, `${fn}()`);
  if (toHtml || split) after = after.replace(/\bdeskSource\(\)/g, 'deskHtml()');
  if (!ANY_HELPER_CALL.test(after)) { console.log(`skip    ${file} (no Desk read found)`); continue; }
  after = addImport(after, file);
  if (split) {
    const r = splitCodePins(after);
    after = r.src;
    if (r.split && /\bdeskSource\(\)/.test(after)) after = addImport(after, file, 'deskSource');
  }
  if (after === before) { console.log(`same    ${file}`); continue; }
  changed++;
  console.log(`${dry ? 'would   ' : 'rewrite '}${file} -> ${fn}()`);
  if (!dry) writeFileSync(file, after);
}
console.log(`${changed} file(s) ${dry ? 'would change' : 'changed'}`);

// tests/helpers/desk-source.js — the Desk's JavaScript as ONE string, so tests that pin a
// function by text (fnBody, indexOf, regex) keep working while the Desk's inline script is cut
// into js/desk-*.js modules (FABLE_SPRINT_2026_10_22C_SPEC.md track C3).
//
//   deskHtml()    the raw ap_stats_roadmap_square_mode.html (markup pins: <script src>, ids)
//   deskSource()  every inline <script> block plus every js/desk-*.js module the Desk loads,
//                 concatenated in load order (document order of the <script> tags)
//   fnBody(name)  the source text of `function name(...) {...}` found in deskSource()
//   fnBodyOf(src, name)  the same extractor over any string (the shape the private test
//                 copies use: async allowed, parameter list skipped before brace matching)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESK_PATH = resolve(ROOT, 'ap_stats_roadmap_square_mode.html');

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const DESK_MODULE_SRC = /\bsrc="(js\/desk-[^"?]+\.js)(?:\?[^"]*)?"/;

let htmlCache = null;
let sourceCache = null;

export function deskHtml() {
  if (htmlCache === null) htmlCache = readFileSync(DESK_PATH, 'utf8');
  return htmlCache;
}

// The js/desk-*.js paths the Desk loads, in document order.
export function deskModulePaths() {
  const paths = [];
  for (const m of deskHtml().matchAll(SCRIPT_TAG)) {
    const src = DESK_MODULE_SRC.exec(m[1]);
    if (src) paths.push(src[1]);
  }
  return paths;
}

export function deskSource() {
  if (sourceCache !== null) return sourceCache;
  const parts = [];
  for (const m of deskHtml().matchAll(SCRIPT_TAG)) {
    const attrs = m[1];
    const src = DESK_MODULE_SRC.exec(attrs);
    if (src) { parts.push(readFileSync(resolve(ROOT, src[1]), 'utf8')); continue; }
    if (/\bsrc=/.test(attrs)) continue; // other external scripts are not Desk source
    parts.push(m[2]);
  }
  sourceCache = parts.join('\n');
  return sourceCache;
}

export function fnBodyOf(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('Desk function not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

export function fnBody(name) {
  return fnBodyOf(deskSource(), name);
}

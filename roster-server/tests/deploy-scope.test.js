// deploy-scope.test.js
// Railway only redeploys roster-server when files under roster-server/ change
// (watch path /roster-server/**, Root Directory = roster-server). So production
// sees ONLY roster-server/ files; anything at the repo root does not exist there.
//
// This test fails when:
//   A. production source starts reading a path outside roster-server/ that is
//      not a known local-dev fallback (it would work here, crash in production);
//   B. a vendored copy in roster-server/ drifts from its repo-root original
//      (the root edit has not deployed).
//
// When A fails: vendor the file into roster-server/data and read it from there,
// or add it to ALLOWLIST below with a reason.
// When B fails: run the regenerate command named in the test, then commit the copy.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // roster-server/tests
const rs = resolve(here, '..');                       // roster-server
const repo = resolve(rs, '..');                       // repo root

// ---------------------------------------------------------------------------
// Part A: static scan
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['tests', 'scripts', 'tools', 'node_modules', 'migrations', 'docs', 'data']);
const SOURCE_EXT = /\.(js|mjs|cjs)$/;

// Local-dev fallbacks: each runs only when the bundled roster-server/data copy is missing.
const ALLOWLIST = [
  { file: 'server.js', snippet: "resolve(__dirname, '..', 'data', 'work-manifest.json')", bundled: 'data/work-manifest.json', why: 'local-dev fallback' },
  { file: 'server.js', snippet: "resolve(__dirname, '..', 'data', 'answer-key.json')", bundled: 'data/answer-key.json', why: 'local-dev fallback' },
  { file: 'server.js', snippet: "resolve(__dirname, '..', 'data', 'worksheet-key.json')", bundled: 'data/worksheet-key.json', why: 'local-dev fallback' },
  { file: 'server.js', snippet: "resolve(__dirname, '..', 'data', 'skill-map.json')", bundled: 'data/skill-map.json', why: 'local-dev fallback' },
  { file: 'server.js', snippet: "resolve(__dirname, '..', 'data', 'lesson-schedule.json')", bundled: 'data/lesson-schedule.json', why: 'local-dev fallback' },
  { file: 'grade-contexts.js', snippet: "const REPO_ROOT = resolve(__dirname, '..')", why: 'defines the repo root used only by the local-dev fallbacks below' },
  { file: 'grade-contexts.js', snippet: "resolve(REPO_ROOT, 'data', 'lesson-schedule.json')", bundled: 'data/lesson-schedule.json', why: 'local-dev fallback (matches every line containing it)' },
  { file: 'grade-contexts.js', snippet: "resolve(REPO_ROOT, 'data', 'blooket-deck-slices.json')", bundled: 'data/blooket-deck-slices.json', why: 'local-dev fallback' },
  { file: 'grade-contexts.js', snippet: "resolve(REPO_ROOT, 'data', 'answer-key.json')", bundled: 'data/answer-key.json', why: 'local-dev fallback' },
  { file: 'pc-figures.js', snippet: "resolve(__dirname, '..', 'data', 'pc-figures-manifest.json')", bundled: 'data/pc-figures-manifest.json', why: 'local-dev fallback' },
  { file: 'lib/ced-label.mjs', snippet: "const CANDIDATES = ['../2026-crosswalk.json', '../data/2026-crosswalk.json']", why: 'candidate paths; both resolve inside roster-server/ from lib/' },
];

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

// Every quoted string literal on the line (contents only).
function stringLiterals(line) {
  const found = [];
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = pattern.exec(line)) !== null) {
    found.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return found;
}

// Is this literal used as a module specifier or URL base, so we can resolve it?
function isResolvableSpecifier(line, literal) {
  const quoted = ["'" + literal + "'", '"' + literal + '"', '`' + literal + '`'];
  const hasQuoted = quoted.some((q) => line.includes(q));
  if (!hasQuoted) return false;
  const importLike =
    /\bimport\b/.test(line) || /\brequire\s*\(/.test(line) || /\bfrom\s+['"`]/.test(line);
  const urlLike = /new URL\(/.test(line) && /import\.meta\.url/.test(line);
  return importLike || urlLike;
}

function isInsideRosterServer(relPath, literal) {
  const fileDir = dirname(resolve(rs, relPath));
  const target = resolve(fileDir, literal);
  const rel = relative(rs, target);
  if (rel === '') return true;
  if (rel.startsWith('..')) return false;
  return !rel.startsWith('..' + sep);
}

// Returns [{ file, line, text }] for every suspicious line in `text`.
function scanSource(relPath, text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isCommentLine(line)) return;

    const literals = stringLiterals(line);
    let flagged = /\bREPO_ROOT\b/.test(line);

    for (const literal of literals) {
      if (flagged) break;
      if (literal === '..') {
        flagged = true;
        continue;
      }
      if (!literal.includes('../')) continue;
      const resolvable = isResolvableSpecifier(line, literal);
      if (resolvable && isInsideRosterServer(relPath, literal)) continue;
      flagged = true;
    }

    if (flagged) hits.push({ file: relPath, line: index + 1, text: line.trim() });
  });
  return hits;
}

function listProductionFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...listProductionFiles(full));
      continue;
    }
    if (!SOURCE_EXT.test(entry.name)) continue;
    if (/\.test\.[cm]?js$/.test(entry.name)) continue;
    files.push(full);
  }
  return files;
}

function toRelPath(full) {
  return relative(rs, full).split(sep).join('/');
}

function scanAllProduction() {
  const hits = [];
  for (const full of listProductionFiles(rs)) {
    hits.push(...scanSource(toRelPath(full), readFileSync(full, 'utf8')));
  }
  return hits;
}

function isAllowed(hit) {
  return ALLOWLIST.some((entry) => entry.file === hit.file && hit.text.includes(entry.snippet));
}

const allHits = scanAllProduction();

describe('deploy scope: production reads only roster-server/ files', () => {
  it('no production file reads outside roster-server/ except the allowlisted dev fallbacks', () => {
    const violations = allHits.filter((hit) => !isAllowed(hit));
    const report = violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`).join('\n');
    const message =
      'Production reads a path outside roster-server/ (Railway Root Directory = roster-server, so it will not exist there):\n' +
      report +
      '\nFix: vendor the file into roster-server/data and read it from there, or add it to the ALLOWLIST with a reason.';
    expect(violations, message).toEqual([]);
  });

  it('every allowlist entry is still hit (no stale entries, scanner sees something)', () => {
    const stale = ALLOWLIST.filter(
      (entry) => !allHits.some((hit) => hit.file === entry.file && hit.text.includes(entry.snippet)),
    );
    const report = stale.map((e) => `  ${e.file}: ${e.snippet}`).join('\n');
    expect(stale, `Stale allowlist entries (remove them):\n${report}`).toEqual([]);
  });

  it('each allowlisted fallback has its bundled copy in roster-server/', () => {
    const missing = ALLOWLIST.filter((e) => e.bundled && !existsSync(resolve(rs, e.bundled))).map((e) => e.bundled);
    expect(missing, `Missing bundled copies: ${missing.join(', ')}`).toEqual([]);
  });

  it('the scanner flags a synthetic offender', () => {
    const fake = [
      "const p = resolve(__dirname, '..', 'secret.json');",
      "import x from '../../js/foo.js';",
      "const q = resolve(REPO_ROOT, 'x');",
    ].join('\n');
    expect(scanSource('fake.js', fake)).toHaveLength(3);
  });

  it('the scanner accepts imports that stay inside roster-server/', () => {
    const ok = "import x from '../grade.js';";
    expect(scanSource('lib/fake.js', ok)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Part B: byte parity between roster-server copies and repo-root originals
// ---------------------------------------------------------------------------

// [roster-server copy, repo-root original, how to regenerate]
const PARITY = [
  ['data/work-manifest.json', 'data/work-manifest.json', 'node scripts/build-work-manifest-ced.mjs --deploy'],
  ['data/answer-key.json', 'data/answer-key.json', 'node scripts/build-answer-key.mjs'],
  ['data/worksheet-key.json', 'data/worksheet-key.json', 'node scripts/build-worksheet-key.mjs'],
  ['data/skill-map.json', 'data/skill-map.json', 'node scripts/build-skill-map.mjs'],
  ['data/lesson-schedule.json', 'data/lesson-schedule.json', 'scripts/build-lesson-schedule*.mjs'],
  ['data/blooket-deck-slices.json', 'data/blooket-deck-slices.json', 'by hand (copy the root file)'],
  ['data/2026-crosswalk.json', '2026-crosswalk.json', 'node scripts/sync-ced-crosswalk.mjs'],
  ['data/ti84-lesson-map.json', 'data/ti84-lesson-map.json', 'by hand (copy the root file)'],
  ['data/misconceptions.json', 'data/misconceptions.json', 'node scripts/misconception-server-assets.mjs'],
  ['data/misconception-distractor-map.json', 'data/misconception-distractor-map.json', 'node scripts/misconception-server-assets.mjs'],
  ['data/misconception-rubric-map.json', 'data/misconception-rubric-map.json', 'node scripts/misconception-server-assets.mjs'],
  ['lib/ced-label.js', 'lib/ced-label.js', 'node scripts/sync-ced-crosswalk.mjs'],
  ['lib/ced-label.mjs', 'lib/ced-label.mjs', 'node scripts/sync-ced-crosswalk.mjs'],
  ['bkt.js', 'lib/bkt.js', 'by hand (copy lib/bkt.js)'],
];

describe('deploy scope: vendored copies match their repo-root originals', () => {
  it.each(PARITY)('roster-server/%s === %s  (regenerate: %s)', (copyRel, originalRel, command) => {
    const copy = readFileSync(resolve(rs, copyRel)); // Buffer: EOL-sensitive
    const original = readFileSync(resolve(repo, originalRel));
    const message =
      `roster-server/${copyRel} differs from ${originalRel}. Production runs the roster-server copy, ` +
      `so the root edit has not deployed. Regenerate with: ${command}`;
    expect(copy.equals(original), message).toBe(true);
  });

  it('pc-figures-manifest.json lives only in roster-server/data (no root original)', () => {
    expect(existsSync(resolve(rs, 'data', 'pc-figures-manifest.json'))).toBe(true);
    const message = 'A repo-root data/pc-figures-manifest.json appeared: add it to the PARITY table.';
    expect(existsSync(resolve(repo, 'data', 'pc-figures-manifest.json')), message).toBe(false);
  });
});

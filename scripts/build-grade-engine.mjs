// build-grade-engine.mjs — generate grade-engine.bundle.js (window.GradeEngine).
//
// ANDROID_PHASE2_LEDGER_MERGE_SPEC §0/§1.A. The student device re-derives its own
// grade OFFLINE from local signed ledger rows. To guarantee the client math never
// drifts from the server, we SHARE the server's pure grade engine rather than
// re-implementing it: this script bundles the canonical roster-server modules into
// a single classic-<script> browser global.
//
// The server files are UNTOUCHED. We transform copies in-memory:
//   - each module → its own closure with an explicit export registry (__reg), so
//     same-named helpers across modules can never collide;
//   - intra-bundle `import { a } from './x.js'` → `const { a } = __reg['x'];`;
//   - Node-builtin imports (fs/path/url) dropped;
//   - grade.js only: the fs-based BLOOKET_LESSONS read → `[]` (the client always
//     passes blooketLessons via opts, so the default is never used), and the
//     express `mountGrade` route dropped.
//
// The committed bundle's output is pinned EQUAL to the server's by
// tests/grade-engine-bundle-parity.test.js (drift check + client≡server on real
// fixtures). If you edit the engine, re-run `node scripts/build-grade-engine.mjs`
// or the parity test fails loudly.
//
// Usage:
//   node scripts/build-grade-engine.mjs           # write grade-engine.bundle.js
//   import { generateBundle } from './build-grade-engine.mjs'  # pure (returns string)

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRV = resolve(ROOT, 'roster-server');
const OUT = resolve(ROOT, 'grade-engine.bundle.js');

// Dependency order: a module's deps must be registered before it.
const MODULES = [
  { key: 'grade-config',   file: 'grade-config.js',   exports: ['PHASE3_CONFIG', 'unitNumber', 'quarterOfUnit', 'quarterOfDate', 'pcRawToP'] },
  { key: 'scoring',        file: 'scoring.js',        exports: ['blooketScore', 'normalizeResponse', 'isCorrect', 'stableLedgerSort', 'latestPerItem', 'unitOf', 'answerKeyMapOrNull', 'skillMapValidOrNull', 'scoreAgainstKey'] },
  { key: 'lesson-grade',   file: 'lesson-grade.js',   exports: ['parseItemLesson', 'expandLessonKey', 'buildWorksheetBlankCounts', 'computeLessonGrades', 'todayInTz', 'sectionToPeriod', 'quarterOfLesson', 'computeQuarterFromLessons', 'V3_WORK_WEIGHTS', 'V3_GATES', 'quarterGradeV3', 'workAvgV3', 'computeQuarterV3', 'computeQuizTotals', 'buildLessonsArray'] },
  { key: 'gradebook-grid', file: 'gradebook-grid.js', exports: ['SCHOOLOGY_CATEGORY_WEIGHTS', 'buildGradebookColumns', 'reconcileQuarter', 'buildGradebookRow', 'schoologyWeightedTotal', 'buildGradebook'] },
  { key: 'grade',          file: 'grade.js',          exports: ['computeGrade', 'mountGrade'], omit: ['mountGrade'] },
];

// The curated public API surface exposed as window.GradeEngine.
const PUBLIC_API = {
  computeGrade:              'grade',
  buildGradebook:            'gradebook-grid',
  PHASE3_CONFIG:             'grade-config',
  computeQuarterV3:          'lesson-grade',
  computeLessonGrades:       'lesson-grade',
  buildLessonsArray:         'lesson-grade',
  buildWorksheetBlankCounts: 'lesson-grade',
  computeQuizTotals:         'lesson-grade',
  parseItemLesson:           'lesson-grade',
  todayInTz:                 'lesson-grade',
  sectionToPeriod:           'lesson-grade',
  latestPerItem:             'scoring',
  answerKeyMapOrNull:        'scoring',
};

function pathToRegKey(p) {
  // './grade-config.js' → 'grade-config'; node builtins ('fs','path','url') → null.
  if (!p.startsWith('.')) return null;
  return p.replace(/^\.\//, '').replace(/\.js$/, '');
}

// Rewrite imports: intra-bundle → registry destructure; node-builtin → dropped.
function rewriteImports(src) {
  return src.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,
    (_m, names, path) => {
      const key = pathToRegKey(path);
      if (!key) return ''; // node builtin (fs/path/url) — dropped
      const clean = names.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
      return `const { ${clean} } = __reg[${JSON.stringify(key)}];`;
    }
  );
}

// Strip the leading `export ` from declarations (the registry handles visibility).
function stripExportKeyword(src) {
  return src.replace(/^export\s+(function|const|let|var|class)\s+/gm, '$1 ');
}

function transformModule(mod) {
  let src = readFileSync(resolve(SRV, mod.file), 'utf8');

  if (mod.key === 'grade') {
    // Neutralize the fs-backed BLOOKET_LESSONS read — the client always supplies
    // blooketLessons via opts, so this default is never consulted in practice.
    src = src.replace(
      /const BLOOKET_LESSONS = \(\(\) => \{[\s\S]*?\}\)\(\);/,
      'const BLOOKET_LESSONS = [];'
    );
    // Drop the express route mounter (and its preceding banner) → EOF.
    const cutAt = src.search(/\n\/\/ ── Route mounter|^export function mountGrade/m);
    if (cutAt !== -1) src = src.slice(0, cutAt);
  }

  src = rewriteImports(src);
  src = stripExportKeyword(src);

  const returned = mod.exports.filter((n) => !(mod.omit || []).includes(n));
  const returnObj = returned.map((n) => `${n}: ${n}`).join(', ');

  return [
    `  // ── ${mod.file} ──────────────────────────────────────────────────────`,
    `  __reg[${JSON.stringify(mod.key)}] = (function () {`,
    src.replace(/^/gm, '    ').replace(/\s+$/, ''),
    `    return { ${returnObj} };`,
    `  })();`,
    ``,
  ].join('\n');
}

export function generateBundle() {
  const bodies = MODULES.map(transformModule).join('\n');

  const apiLines = Object.entries(PUBLIC_API)
    .map(([name, key]) => `    ${name}: __reg[${JSON.stringify(key)}].${name},`)
    .join('\n');

  // Hash the raw sources so the bundle carries a traceable engine version.
  const rawConcat = MODULES.map((m) => readFileSync(resolve(SRV, m.file), 'utf8')).join('\n');
  const version = createHash('sha256').update(rawConcat).digest('hex').slice(0, 12);

  return `/* grade-engine.bundle.js — GENERATED by scripts/build-grade-engine.mjs. DO NOT EDIT.
 *
 * window.GradeEngine — the roster-server grade engine (grade-config + scoring +
 * lesson-grade + gradebook-grid + grade), bundled for the browser so a student
 * device can re-derive its OWN grade offline from local signed ledger rows,
 * byte-identically to the server. See ANDROID_PHASE2_LEDGER_MERGE_SPEC.md.
 *
 * Regenerate after any engine edit:  node scripts/build-grade-engine.mjs
 * Parity is pinned by tests/grade-engine-bundle-parity.test.js.
 * engine-version: ${version}
 */
;(function (root) {
  'use strict';
  var __reg = {};

${bodies}
  var __api = {
${apiLines}
    _engineVersion: ${JSON.stringify(version)},
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = __api;
  root.GradeEngine = __api;
})(typeof window !== 'undefined' ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this));
`;
}

// CLI: write the bundle.
if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  const out = generateBundle();
  writeFileSync(OUT, out, 'utf8');
  const lines = out.split('\n').length;
  console.log(`Wrote ${OUT} (${lines} lines, ${out.length} bytes)`);
}

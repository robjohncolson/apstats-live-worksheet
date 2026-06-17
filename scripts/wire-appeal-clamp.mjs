#!/usr/bin/env node
// wire-appeal-clamp.mjs — fix FINDINGS F5/F6 (GRADE_SIMULATION_FINDINGS.md) across
// the templated worksheets: an appeal must NEVER lower the recorded/shown grade.
//
// The appeal handler reads `appealResult.score` for the `upgraded` flag, the
// history entry, `state.result`, and the gradebook record. Clamping that ONE
// value right after `const previousScore = state.result.score;` makes every
// downstream read non-decreasing — so this is a single inserted guard.
//
// Idempotent (marker APPEAL-CLAMP), EOL-preserving. Skips worksheets without the
// templated anchor (u3_lesson6-7_live.html, the original prototype, is handled
// separately). Run: node scripts/wire-appeal-clamp.mjs [--apply]
//
// Excludes edgar/mit per the worksheet-rollout pattern guard.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const WORKSHEET_RE = /^u\d+_lesson.+_live\.html$/;
const ANCHOR_RE = /^(\s*)const previousScore = state\.result\.score;\s*$/;
const MARKER = 'APPEAL-CLAMP';
const apply = process.argv.includes('--apply');

const files = readdirSync('.').filter((f) => WORKSHEET_RE.test(f));
let changed = 0, skipped = 0, noAnchor = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (content.includes(MARKER)) { skipped += 1; continue; }

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  let inserted = false;
  const out = [];
  for (const line of lines) {
    out.push(line);
    const m = inserted ? null : line.match(ANCHOR_RE);
    if (m) {
      const indent = m[1];
      out.push(`${indent}// ${MARKER} (F5/F6): an appeal can never LOWER the recorded/shown grade.`);
      out.push(`${indent}if (({ I: 0, P: 1, E: 2 })[appealResult.score] < ({ I: 0, P: 1, E: 2 })[previousScore]) appealResult.score = previousScore;`);
      inserted = true;
    }
  }

  if (!inserted) { noAnchor += 1; console.log(`  no anchor: ${file}`); continue; }
  changed += 1;
  if (apply) writeFileSync(file, out.join(eol));
}

console.log(`${apply ? 'APPLIED' : 'DRY-RUN'}: ${changed} worksheets clamped, ${skipped} already done, ${noAnchor} without anchor (of ${files.length}).`);

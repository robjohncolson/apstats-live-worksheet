// wire-frq-grading-standard.mjs — soften the FRQ grading bar in every
// ai-grading-prompts*.js reflection prompt builder (2026-09-14).
//
// WHY: the prompts told the model the listed elements were REQUIRED for an E and
// the rubrics list 3–5 very specific facts (exact percentages, every condition).
// Students writing a two-sentence homework reflection right after a video were
// held to an AP-exam completeness bar: fewer than half of honest reflections
// earned E, P was the modal verdict, and students (and the teacher) called it
// "too harsh". The AI only ever RAISES a grade, so a softer bar is safe to roll
// out and to re-sweep with.
//
// WHAT: in each prompt template
//   1. the "REQUIRED ... (must address for E)" heading becomes "KEY ELEMENTS
//      (what a complete answer usually covers)" — same list, no longer a gate;
//   2. a GRADING STANDARD block is inserted just before the "Grade ..."
//      instruction line: E = central idea right + most elements in the student's
//      own words; P = on track with one real gap; I = wrong/off-topic/blank;
//      torn between two → the higher one.
// Idempotent (guarded by the GRADING STANDARD marker). Prints a per-variant tally.
//
// AFTER RUNNING: `node scripts/build-frq-rubrics.mjs` — the server-side grader
// (roster-server/frq-worker.js) reads the committed bundle built from these
// files, and tests/frq-rubrics-bundle.test.js fails until it is regenerated.
//
// Usage: node scripts/wire-frq-grading-standard.mjs [--dry-run]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const MARKER = 'GRADING STANDARD (read before scoring)';

export const GRADING_STANDARD = [
  'GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.',
  '- E: the central idea is correct and the response covers most of the key elements in the student\'s own words. Do NOT withhold E for a missing specific number, a missing optional element, or informal vocabulary when the reasoning is right.',
  '- P: the response is on the right track but has one real gap or one substantive error.',
  '- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.',
  'If you are torn between two scores, give the higher one.',
].join('\n');

// Heading rewrites: the element list stays, the "required for E" framing goes.
const HEADINGS = [
  ['REQUIRED ELEMENTS (must address for E score):', 'KEY ELEMENTS (what a complete answer usually covers):'],
  ['REQUIRED ELEMENTS (must address for E):', 'KEY ELEMENTS (what a complete answer usually covers):'],
  ['## Required Elements (must be present for full credit)', '## Key Elements (what a complete answer usually covers)'],
];

// The "Grade ..." instruction line each template variant ends with. The
// standard block is inserted immediately before it.
const GRADE_LINES = [
  'Grade this response and provide:',
  'Grade the student\'s response. Return JSON:',
  'Grade this response using the E/P/I scoring system. Be generous but accurate.',
  'Grade the response as E, P, or I. Be encouraging but accurate.',
];

export function applyGradingStandard(source) {
  if (source.includes(MARKER)) return { source, changed: false, variant: 'already' };
  let out = source;
  for (const [from, to] of HEADINGS) out = out.split(from).join(to);

  let variant = null;
  for (const line of GRADE_LINES) {
    const idx = out.indexOf(line);
    if (idx < 0) continue;
    variant = line;
    // Insert before EVERY occurrence (a file may hold several builders).
    out = out.split(line).join(`${GRADING_STANDARD}\n\n${line}`);
    break;
  }
  if (!variant) return { source, changed: false, variant: 'no-match' };
  return { source: out, changed: out !== source, variant };
}

function main() {
  const files = readdirSync(ROOT)
    .filter((name) => /^ai-grading-prompts.*\.js$/.test(name))
    .sort();
  const tally = {};
  const skipped = [];
  for (const name of files) {
    const path = resolve(ROOT, name);
    const before = readFileSync(path, 'utf8');
    const { source, changed, variant } = applyGradingStandard(before);
    tally[variant] = (tally[variant] || 0) + 1;
    if (!changed) { if (variant === 'no-match') skipped.push(name); continue; }
    if (!DRY_RUN) writeFileSync(path, source, 'utf8');
    console.log(`${DRY_RUN ? '[dry] ' : ''}${name}: ${variant}`);
  }
  console.log('\nvariants:', JSON.stringify(tally, null, 2));
  if (skipped.length) console.log('skipped (no template match):', skipped.join(', '));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

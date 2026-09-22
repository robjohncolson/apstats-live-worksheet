#!/usr/bin/env node
/**
 * Apply a RUBRIC_SLIM_SPEC decisions file to its ai-grading-prompts-*.js files.
 *
 *   node scripts/rubric-slim-apply.mjs state/rubric-slim/<batch>-decisions.json [--check]
 *
 * Decisions shape (see state/rubric-slim/u1-l1-6-decisions.json):
 *   files[file][question] = { required: [ids], scoringGuide: {E,P,I}, mistakes?: {old: new} }
 *
 * What it does, per question, editing in place and touching nothing else:
 *   - every element whose id is in `required` -> required: true; all others -> required: false
 *   - scoringGuide E/P/I string literals replaced verbatim
 *   - each `mistakes` old line replaced by the new line
 * Per file: the GRADING STANDARD E/P lines switch to the "every key element" wording (spec rule 7).
 * Element ids, descriptions, questionText, contextFromVideo are never touched.
 *
 * --check verifies the files already match the decisions (used by tests / CI) and exits 1 if not.
 * After applying: node scripts/build-frq-rubrics.mjs && node scripts/build-misconception-rubric-map.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export const STANDARD_E_OLD = "- E: the central idea is correct and the response covers most of the key elements in the student's own words. Do NOT withhold E for a missing specific number, a missing optional element, or informal vocabulary when the reasoning is right.";
export const STANDARD_E_NEW = "- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.";
export const STANDARD_P_OLD = '- P: the response is on the right track but has one real gap or one substantive error.';
export const STANDARD_P_NEW = '- P: the central idea is right but one key element is missing or wrong.';

// Rubric objects live under window.RUBRICS_*, window.REFLECTION_RUBRICS_*, or a
// file-local const reachable only through window.getRubric*(questionId).
export function loadRubrics(source) {
  const window = {};
  runInNewContext(source, { window });
  const key = Object.keys(window).find(k => /RUBRICS/.test(k) && typeof window[k] === 'object');
  if (key) return window[key];
  const getter = Object.keys(window).find(k => /^getRubric/.test(k));
  if (!getter) throw new Error('no rubric object found');
  const out = {};
  for (const q of ['reflect1', 'reflect2', 'reflect3', 'reflect4', 'exitTicket']) {
    const r = window[getter](q);
    if (r) out[q] = r;
  }
  return out;
}

// A JS string literal, single- or double-quoted, with escapes.
function literal(text, quote) {
  const body = quote === "'" ? text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return quote + body + quote;
}
function findLiteral(source, text) {
  for (const q of ["'", '"']) {
    const lit = literal(text, q);
    if (source.includes(lit)) return { lit, q, count: source.split(lit).length - 1 };
  }
  return null;
}

function questionBounds(source, question, allQuestions) {
  // keys are bare (reflect1: {) in most files, quoted ("reflect1": {) in a few
  const keyRe = q => new RegExp('^\\s*["\']?' + q + '["\']?\\s*:\\s*\\{', 'm');
  const start = source.search(keyRe(question));
  if (start < 0) throw new Error('question block not found: ' + question);
  const others = allQuestions.filter(q => q !== question).map(keyRe);
  let end = source.length;
  for (const re of others) {
    const m = source.slice(start + 1).search(re);
    if (m >= 0 && start + 1 + m < end) end = start + 1 + m;
  }
  return { start, end };
}

export function applyDecisions(source, decisions, filename) {
  const rubrics = loadRubrics(source);
  const questions = Object.keys(rubrics);
  let out = source;
  for (const [q, d] of Object.entries(decisions)) {
    const rubric = rubrics[q];
    if (!rubric) throw new Error(`${filename}: no question ${q}`);
    for (const id of d.required) {
      if (!rubric.expectedElements.some(e => e.id === id)) throw new Error(`${filename} ${q}: unknown id ${id}`);
    }
    const { start, end } = questionBounds(out, q, questions);
    let block = out.slice(start, end);
    for (const e of rubric.expectedElements) {
      const want = d.required.includes(e.id);
      // one element per line; the description may itself contain braces
      const re = new RegExp(`^(\\s*\\{\\s*id:\\s*['"]${e.id}['"].*required:\\s*)(true|false)`, 'm');
      if (!re.test(block)) throw new Error(`${filename} ${q}: element line not found for ${e.id}`);
      block = block.replace(re, `$1${want}`);
    }
    for (const k of ['E', 'P', 'I']) {
      const found = findLiteral(block, rubric.scoringGuide[k]);
      if (!found || found.count !== 1) throw new Error(`${filename} ${q}: scoringGuide.${k} literal not found once`);
      block = block.replace(found.lit, () => literal(d.scoringGuide[k], found.q));
    }
    for (const [oldLine, newLine] of Object.entries(d.mistakes || {})) {
      const found = findLiteral(block, oldLine);
      if (!found && findLiteral(block, newLine)) continue; // already applied on an earlier run
      if (!found || found.count !== 1) throw new Error(`${filename} ${q}: commonMistakes line not found once: ${oldLine.slice(0, 50)}`);
      block = block.replace(found.lit, () => literal(newLine, found.q));
    }
    out = out.slice(0, start) + block + out.slice(end);
  }
  if (out.includes(STANDARD_E_OLD)) out = out.replace(STANDARD_E_OLD, STANDARD_E_NEW);
  if (out.includes(STANDARD_P_OLD)) out = out.replace(STANDARD_P_OLD, STANDARD_P_NEW);
  if (!out.includes(STANDARD_E_NEW)) throw new Error(`${filename}: GRADING STANDARD block not found`);
  return out;
}

export function verifyDecisions(source, decisions, filename) {
  const rubrics = loadRubrics(source);
  const problems = [];
  for (const [q, d] of Object.entries(decisions)) {
    const r = rubrics[q];
    if (!r) { problems.push(`${filename} ${q}: missing`); continue; }
    const req = r.expectedElements.filter(e => e.required).map(e => e.id).sort();
    if (JSON.stringify(req) !== JSON.stringify([...d.required].sort())) problems.push(`${filename} ${q}: required ${req}`);
    for (const k of ['E', 'P', 'I']) if (r.scoringGuide[k] !== d.scoringGuide[k]) problems.push(`${filename} ${q}: guide ${k}`);
    for (const line of Object.values(d.mistakes || {})) if (!r.commonMistakes.includes(line)) problems.push(`${filename} ${q}: mistake line missing`);
    if (req.length < 1 || req.length > 10) problems.push(`${filename} ${q}: ${req.length} required (must be 1..10)`);
  }
  if (!source.includes(STANDARD_E_NEW) || source.includes(STANDARD_E_OLD)) problems.push(`${filename}: GRADING STANDARD not slimmed`);
  return problems;
}

function main(argv) {
  const path = argv.find(a => !a.startsWith('--'));
  const check = argv.includes('--check');
  if (!path) { console.error('usage: rubric-slim-apply.mjs <decisions.json> [--check]'); return 2; }
  const decisions = JSON.parse(readFileSync(path, 'utf8'));
  let problems = [];
  for (const [file, perQuestion] of Object.entries(decisions.files)) {
    const source = readFileSync(file, 'utf8');
    if (check) { problems = problems.concat(verifyDecisions(source, perQuestion, file)); continue; }
    const next = applyDecisions(source, perQuestion, file);
    if (next !== source) writeFileSync(file, next);
    problems = problems.concat(verifyDecisions(next, perQuestion, file));
    console.log(`${next === source ? 'unchanged' : 'applied  '} ${file}`);
  }
  for (const p of problems) console.error('PROBLEM ' + p);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/rubric-slim-apply.mjs')) {
  process.exit(main(process.argv.slice(2)));
}

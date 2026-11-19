// Read-only: who owes what, per student, in the Desk's own words.
// Runs `scripts/weekly-slips.mjs --dry-run --all` (GETs only; it reads the teacher key from
// ~/grade-backups/config.json) and prints each student's missing work in three groups:
//   COUNTING NOW  = already a 0 (fix it)
//   ZERO SOON     = becomes a 0 within 3 days
//   LATE, NO ZERO = never a 0; counts when finished (only helps)
// Names are MASKED by default (S1, S2, ... in server order, the same within a run).
// --names prints real names: show them to the teacher only, never paste them into a file or elsewhere.
//
// Usage: node .grok/skills/reminders/owed.mjs --section B|E|PeriodB|PeriodE [--date YYYY-MM-DD] [--names]
// (--mask is still accepted and does nothing: masking is already the default.)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonLabel, whenText } from '../../../scripts/weekly-slips.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORDS = { worksheet: 'Follow-Along Worksheet', quiz: 'Quiz', blooket: 'Flashcards' };

// The private AP Classroom exclude list (students who left or are not tracked). Optional file.
function loadExcluded() {
  const file = path.join(os.homedir(), 'grade-backups', 'apclassroom', 'roster-map.json');
  try {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set((map.exclude || []).map(name => String(name).trim().toLowerCase()));
  } catch (_) {
    return new Set();
  }
}

// "B" or "e" or "PeriodB" -> "PeriodB". Anything else is rejected (null).
export function normalizeSection(text) {
  const value = String(text || '').trim();
  if (/^[BE]$/i.test(value)) return `Period${value.toUpperCase()}`;
  if (value === 'PeriodB' || value === 'PeriodE') return value;
  return null;
}

function parseArgs(argv) {
  const options = { section: null, date: null, names: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--section') options.section = argv[++i];
    else if (argv[i] === '--date') options.date = argv[++i];
    else if (argv[i] === '--names') options.names = true;
    else if (argv[i] === '--mask') continue;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  options.section = normalizeSection(options.section);
  if (!options.section) throw new Error('--section B, E, PeriodB or PeriodE is required');
  return options;
}

function group(item) {
  if (item.late) return 'LATE, NO ZERO';
  if (item.past) return 'COUNTING NOW';
  return 'ZERO SOON';
}

function line(item) {
  return `    - ${WORDS[item.kind] || item.kind} ${lessonLabel(item.lessonKey)} (stored as ${item.lessonKey}): ${whenText(item)}`;
}

function printStudent(student, label, excluded) {
  const missing = student.missing || [];
  console.log(`\n${label} | quarter so far: ${student.quarterGrade ?? 'no grade yet'}`);
  if (excluded.has(String(student.name).trim().toLowerCase())) {
    console.log('  ON THE EXCLUDE LIST (left the class or not tracked): no reminder');
    return;
  }
  if (student.quarterGrade === 0) {
    console.log('  NOTHING DONE THIS QUARTER: ask the teacher (still in the class?) before any reminder');
  }
  if (missing.length === 0) {
    console.log('  nothing missing');
    return;
  }
  for (const name of ['COUNTING NOW', 'ZERO SOON', 'LATE, NO ZERO']) {
    const rows = missing.filter(item => group(item) === name);
    if (rows.length === 0) continue;
    console.log(`  ${name} (${rows.length})`);
    for (const item of rows) console.log(line(item));
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  const args = ['scripts/weekly-slips.mjs', '--dry-run', '--all', '--section', options.section];
  if (options.date) args.push('--date', options.date);
  const run = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8' });
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout || 'weekly-slips failed');
    process.exitCode = 1;
    return;
  }
  const students = run.stdout.split(/\r?\n/).filter(text => text.startsWith('{')).map(text => JSON.parse(text));
  console.log(`${options.section} on ${options.date || 'today'}: ${students.length} students`);
  const excluded = loadExcluded();
  students.forEach((student, index) => printStudent(student, options.names ? student.name : `S${index + 1}`, excluded));
}

// Only run when started from the command line, so a test can import normalizeSection.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

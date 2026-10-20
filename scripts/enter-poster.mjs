#!/usr/bin/env node
// Keep input files outside the repo: they contain student names.
// node scripts/enter-poster.mjs <file> [--apply] [--url U] [--secret S]
//
// File format (POSTER_WORK_TRACK_SPEC.md section 3):
//   unit=1 quarter=Q1 title=Unit 1 Poster (Data, Graph, Sentence) section=PeriodB
//   Real Name|115
//   roster_user|E          # letter -> E 115 / P 100 / I 90
// A number must be an integer 90..115 inclusive.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickConfigUrl } from './teacher-roster.mjs';
import { matchBonusStudents } from './enter-bonus.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://roster-production-12c1.up.railway.app';
export const POSTER_SCORES = { E: 115, P: 100, I: 90 };
export const POSTER_MIN = 90;
export const POSTER_MAX = 115;

export function posterGradeForScore(score) {
  if (score >= POSTER_SCORES.E) return 'E';
  if (score >= POSTER_SCORES.P) return 'P';
  return 'I';
}

function parsePosterEntry(value, line) {
  if (Object.hasOwn(POSTER_SCORES, value)) return { score: POSTER_SCORES[value], grade: value };
  if (!/^\d+$/.test(value)) throw new Error('bad row (name|E, P, I or integer 90..115 required): ' + line);
  const score = Number(value);
  if (score < POSTER_MIN || score > POSTER_MAX) {
    throw new Error(`bad row (score must be ${POSTER_MIN}..${POSTER_MAX}): ` + line);
  }
  return { score, grade: posterGradeForScore(score) };
}

export function parsePosterFile(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+#.*$/, '').trim())
    .filter(line => line && !line.startsWith('#'));
  const header = Object.fromEntries([...String(lines[0] || '').matchAll(
    /(?:^|\s)(unit|quarter|section|title)=(.*?)(?=\s+(?:unit|quarter|section|title)=|$)/g,
  )].map(match => [match[1], match[2].trim()]));
  if (!/^[1-9]$/.test(header.unit || '') || !/^Q[1-4]$/.test(header.quarter || '') || !header.title) {
    throw new Error('header needs unit=1..9, quarter=Q1..Q4, title=');
  }
  const meta = { unit: Number(header.unit), quarter: header.quarter, title: header.title };
  if (header.section) meta.section = header.section;
  const rows = lines.slice(1).map(line => {
    const parts = line.split('|').map(part => part.trim());
    const [name, value] = parts;
    if (parts.length !== 2 || !name || !value) {
      throw new Error('bad row (name|E, P, I or integer 90..115 required): ' + line);
    }
    const { score, grade } = parsePosterEntry(value, line);
    return { name, score, grade };
  });
  return { meta, rows };
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function resolveSecret(flag) {
  if (flag) return flag;
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readFileSafe(resolve(REPO_ROOT, 'roster-server', '.env'));
  const match = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m);
  return match ? match[1].trim() : null;
}

function resolveUrl(flag) {
  if (flag) return flag.replace(/\/+$/, '');
  if (process.env.ROSTER_SERVICE_URL) return process.env.ROSTER_SERVICE_URL.replace(/\/+$/, '');
  return pickConfigUrl(readFileSafe(resolve(REPO_ROOT, 'roster_config.js'))) || DEFAULT_URL;
}

async function main(argv) {
  const options = {}, files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') { options.apply = true; continue; }
    if (arg === '--url' || arg === '--secret') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('missing value for ' + arg);
      options[arg.slice(2)] = argv[++i];
      continue;
    }
    if (arg.startsWith('--')) throw new Error('unknown option: ' + arg);
    files.push(arg);
  }
  if (files.length !== 1) throw new Error('usage: enter-poster.mjs <file> [--apply] [--url U] [--secret S]');
  const { meta, rows } = parsePosterFile(readFileSync(files[0], 'utf8'));
  const secret = resolveSecret(options.secret);
  if (!secret) throw new Error('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)');
  const url = resolveUrl(options.url);
  const headers = { 'Content-Type': 'application/json', 'x-teacher-secret': secret };
  const query = meta.section ? '?section=' + encodeURIComponent(meta.section) : '';
  const rosterRes = await fetch(`${url}/roster/list${query}`, { headers });
  const roster = await rosterRes.json();
  if (!rosterRes.ok || !roster.ok) throw new Error('roster/list failed: ' + (roster.error || rosterRes.status));
  const students = roster.students.filter(student => !student.archived && student.role !== 'teacher');
  const plan = rows.map(row => ({ ...row, matches: matchBonusStudents(row.name, students) }));
  for (const row of plan) {
    const label = row.matches.length === 1 ? row.matches[0].username
      : row.matches.length ? '?? AMBIGUOUS' : '?? NO MATCH';
    console.log(`${label.padEnd(20)} ${String(row.score).padStart(3)} ${row.grade} ${row.name}`);
  }
  if (plan.some(row => row.matches.length !== 1)) {
    throw new Error('Unmatched or ambiguous names. Fix the file; nothing was sent.');
  }
  if (!options.apply) {
    console.log(`Dry run: ${plan.length} row(s) for POSTER-U${meta.unit}, ${meta.quarter}: ${meta.title}. Re-run with --apply.`);
    return;
  }
  const response = await fetch(`${url}/class/poster`, {
    method: 'POST', headers,
    body: JSON.stringify({
      ...meta,
      entries: plan.map(row => ({ username: row.matches[0].username, score: row.score, grade: row.grade })),
    }),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok || !result.ok || result.errors?.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

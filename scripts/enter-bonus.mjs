#!/usr/bin/env node
// Keep input files outside the repo: they contain student names.
// node scripts/enter-bonus.mjs <file> [--apply] [--url U] [--secret S]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickConfigUrl } from './teacher-roster.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://roster-production-12c1.up.railway.app';
const POINTS = { E: 5, P: 3, I: 1 };

export function parseBonusFile(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+#.*$/, '').trim())
    .filter(line => line && !line.startsWith('#'));
  const header = Object.fromEntries([...String(lines[0] || '').matchAll(
    /(?:^|\s)(sheet|quarter|section|title)=(.*?)(?=\s+(?:sheet|quarter|section|title)=|$)/g,
  )].map(match => [match[1], match[2].trim()]));
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(header.sheet || '') ||
      !/^Q[1-4]$/.test(header.quarter || '') || !header.title) {
    throw new Error('header needs sheet=, quarter=Q1..Q4, title=');
  }
  const meta = { sheetId: header.sheet, quarter: header.quarter, title: header.title };
  if (header.section) meta.section = header.section;
  const rows = lines.slice(1).map(line => {
    const parts = line.split('|').map(part => part.trim());
    const [name, grade] = parts;
    if (parts.length !== 2 || !name || !Object.hasOwn(POINTS, grade)) {
      throw new Error('bad row (name|E, P, or I required): ' + line);
    }
    return { name, grade, points: POINTS[grade] };
  });
  return { meta, rows };
}

export function matchBonusStudents(name, students) {
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const want = normalize(name);
  return students.filter(student => [student.realName, student.username, student.real_name, student.login_username]
    .some(value => value && normalize(value) === want));
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
  if (files.length !== 1) throw new Error('usage: enter-bonus.mjs <file> [--apply] [--url U] [--secret S]');
  const { meta, rows } = parseBonusFile(readFileSync(files[0], 'utf8'));
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
    console.log(`${label.padEnd(20)} ${row.grade} (+${row.points}) ${row.name}`);
  }
  if (plan.some(row => row.matches.length !== 1)) {
    throw new Error('Unmatched or ambiguous names. Fix the file; nothing was sent.');
  }
  if (!options.apply) {
    console.log(`Dry run: ${plan.length} row(s) for ${meta.sheetId}, ${meta.quarter}: ${meta.title}. Re-run with --apply.`);
    return;
  }
  const response = await fetch(`${url}/class/bonus`, {
    method: 'POST', headers,
    body: JSON.stringify({ ...meta, entries: plan.map(row => ({ username: row.matches[0].username, grade: row.grade })) }),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok || !result.ok || result.errors?.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

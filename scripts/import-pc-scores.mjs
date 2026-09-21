#!/usr/bin/env node
/**
 * Import Progress Check scores (from AP Classroom's "Results by Student" table,
 * or teacher-scored paper copies) into the roster ledger via POST /pc/grade.
 *
 * Each row becomes the student's proctored PC row for (unit, part); the server
 * best-wins it against any online retake. Score = points / of.
 *
 * Input file (kept OUTSIDE the repo — it holds student names and answers):
 *   section=PeriodB unit=1 part=A of=18          ← header, key=value pairs
 *   Real Name|points|A B C ...                   ← one student per line (roster username also works)
 *   PAPER: Real Name|points|(anything)           ← paper copy, same treatment
 *   NOT STARTED: Real Name                       ← skipped
 *   # comments and blank lines are ignored; a trailing "# ..." on a row is too
 *
 * Only the score is sent. The answer letters stay in the file for the
 * misconception work (PC_MISCONCEPTIONS_SPEC.md) and never leave this machine.
 *
 * Usage:
 *   node scripts/import-pc-scores.mjs <file>            # dry run: shows the name matches
 *   node scripts/import-pc-scores.mjs <file> --apply    # posts to /pc/grade
 *   --url <U> --secret <S> as in import-blooket.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickConfigUrl } from './teacher-roster.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://roster-production-12c1.up.railway.app';

export function parseScoreFile(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+#.*$/, '').trim()).filter(l => l && !l.startsWith('#'));
  const header = Object.fromEntries(lines[0].split(/\s+/).map(kv => kv.split('=')));
  const meta = { section: header.section, unit: Number(header.unit), part: String(header.part || '').toUpperCase(), of: Number(header.of) };
  if (!meta.section || !Number.isInteger(meta.unit) || !/^(A|REST)$/.test(meta.part) || !(meta.of > 0)) {
    throw new Error('header needs section=, unit=, part=A|REST, of=');
  }
  const rows = [];
  const skipped = [];
  for (const line of lines.slice(1)) {
    if (/^NOT STARTED:/i.test(line)) { skipped.push(line.replace(/^NOT STARTED:\s*/i, '')); continue; }
    const paper = /^PAPER:/i.test(line);
    const [name, points] = line.replace(/^PAPER:\s*/i, '').split('|');
    const pts = Number(points);
    if (!name || !Number.isFinite(pts)) throw new Error('bad row: ' + line);
    rows.push({ name: name.trim(), points: pts, score: Math.min(1, Math.max(0, pts / meta.of)), paper });
  }
  return { meta, rows, skipped };
}

// "Z Chavez Chavez" vs roster "Zoe Chavez": compare on lowercase, accent-stripped
// tokens; exact full-name match first, then last-token + first-initial.
export function normalizeName(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
}

export function matchStudent(name, students) {
  const byUsername = students.find(s => s.username === String(name).trim());
  if (byUsername) return byUsername; // the file may name a student by roster username
  const want = normalizeName(name);
  const exact = students.filter(s => normalizeName(s.realName).join(' ') === want.join(' '));
  if (exact.length === 1) return exact[0];
  const last = want[want.length - 1];
  const initial = want[0] && want[0][0];
  const loose = students.filter(s => {
    const have = normalizeName(s.realName);
    return have.includes(last) && have[0] && have[0][0] === initial;
  });
  return loose.length === 1 ? loose[0] : null;
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function resolveSecret(flag) {
  if (flag) return flag;
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readFileSafe(resolve(REPO_ROOT, 'roster-server', '.env'));
  const m = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

function resolveUrl(flag) {
  if (flag) return flag.replace(/\/+$/, '');
  if (process.env.ROSTER_SERVICE_URL) return process.env.ROSTER_SERVICE_URL.replace(/\/+$/, '');
  return pickConfigUrl(readFileSafe(resolve(REPO_ROOT, 'roster_config.js'))) || DEFAULT_URL;
}

async function main(argv) {
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) { console.error('usage: import-pc-scores.mjs <file> [--apply] [--url U] [--secret S]'); return 2; }
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const apply = argv.includes('--apply');
  const url = resolveUrl(flag('--url'));
  const secret = resolveSecret(flag('--secret'));
  if (!secret) { console.error('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)'); return 2; }

  const { meta, rows, skipped } = parseScoreFile(readFileSync(file, 'utf8'));
  const headers = { 'Content-Type': 'application/json', 'x-teacher-secret': secret };
  const rosterRes = await fetch(`${url}/roster/list?section=${encodeURIComponent(meta.section)}`, { headers });
  const roster = await rosterRes.json();
  if (!roster.ok) { console.error('roster/list failed:', roster.error); return 1; }
  const students = roster.students.filter(s => !s.archived);

  let unmatched = 0;
  const plan = rows.map(row => {
    const student = matchStudent(row.name, students);
    if (!student) unmatched += 1;
    return { ...row, username: student ? student.username : null };
  });
  for (const p of plan) {
    console.log(`${p.username ? p.username.padEnd(18) : '?? NO MATCH       '} ${String(p.points).padStart(2)}/${meta.of} ${p.paper ? '(paper) ' : ''}${p.name}`);
  }
  for (const name of skipped) console.log(`-- skipped         ${name} (not started)`);
  if (unmatched) { console.error(`\n${unmatched} name(s) did not match a roster student in ${meta.section}. Fix the file, nothing was sent.`); return 1; }
  if (!apply) { console.log(`\nDry run: ${plan.length} row(s) would be posted as U${meta.unit} part ${meta.part}. Re-run with --apply.`); return 0; }

  let ok = 0;
  for (const p of plan) {
    const res = await fetch(`${url}/pc/grade`, {
      method: 'POST', headers,
      body: JSON.stringify({ studentUsername: p.username, unit: meta.unit, part: meta.part, score: p.score }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok !== false) { ok += 1; continue; }
    console.error(`FAILED ${p.username}: HTTP ${res.status} ${body.error || ''}`);
  }
  console.log(`\nPosted ${ok}/${plan.length} PC scores for ${meta.section} U${meta.unit} part ${meta.part}.`);
  return ok === plan.length ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code), err => { console.error(err); process.exit(1); });
}

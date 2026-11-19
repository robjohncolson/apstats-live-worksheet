#!/usr/bin/env node
// Read-only check after entering poster scores. GET requests only.
// Usage: node .grok/skills/poster-scores/readback.mjs <file>
// <file> is the same file given to scripts/enter-poster.mjs (it holds names, keep it outside the repo).
// Prints row numbers, never names or logins.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePosterFile } from '../../../scripts/enter-poster.mjs';
import { matchBonusStudents } from '../../../scripts/enter-bonus.mjs';
import { pickConfigUrl } from '../../../scripts/teacher-roster.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_URL = 'https://roster-production-12c1.up.railway.app';

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function findSecret() {
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readFileSafe(resolve(REPO_ROOT, 'roster-server', '.env'));
  const match = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m);
  return match ? match[1].trim() : null;
}

function findUrl() {
  if (process.env.ROSTER_SERVICE_URL) return process.env.ROSTER_SERVICE_URL.replace(/\/+$/, '');
  return pickConfigUrl(readFileSafe(resolve(REPO_ROOT, 'roster_config.js'))) || DEFAULT_URL;
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`GET failed (${response.status}): ${url.split('?')[0]}`);
  return body;
}

function judgeRow(expected, stored) {
  if (stored == null) return 'MISSING';
  if (Number(stored) === expected) return 'OK';
  return 'MISMATCH';
}

async function main(file) {
  if (!file) throw new Error('usage: readback.mjs <file>');
  const { meta, rows } = parsePosterFile(readFileSync(file, 'utf8'));
  const secret = findSecret();
  if (!secret) throw new Error('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)');
  const headers = { 'x-teacher-secret': secret };
  const base = findUrl();
  const query = meta.section ? '?section=' + encodeURIComponent(meta.section) : '';

  const roster = await getJson(`${base}/roster/list${query}`, headers);
  const students = roster.students.filter(student => !student.archived && student.role !== 'teacher');
  const grades = await getJson(`${base}/class/grades${query}`, headers);
  const gradesById = new Map(grades.students.map(student => [student.studentId, student]));

  const unitKey = 'U' + meta.unit;
  let ok = 0, mismatch = 0, missing = 0;

  rows.forEach((row, index) => {
    const label = `row ${String(index + 1).padStart(2)}`;
    const matches = matchBonusStudents(row.name, students);
    if (matches.length !== 1) {
      missing++;
      console.log(`${label}  expected ${row.score}  stored -  ${matches.length ? 'AMBIGUOUS' : 'UNMATCHED'}`);
      return;
    }
    const gradeRow = gradesById.get(matches[0].studentId ?? matches[0].student_id);
    const stored = gradeRow?.units?.[unitKey]?.posterPct ?? null;
    const verdict = judgeRow(row.score, stored);
    if (verdict === 'OK') ok++;
    else if (verdict === 'MISMATCH') mismatch++;
    else missing++;
    console.log(`${label}  expected ${row.score}  stored ${stored ?? '-'}  ${verdict}`);
  });

  console.log(`readback: ${ok} ok, ${mismatch} mismatch, ${missing} missing`);
  if (mismatch || missing) process.exitCode = 1;
}

main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });

#!/usr/bin/env node
// Print the real names on one section's roster (GET only), so first names on a
// poster can be turned into the full names enter-poster.mjs needs.
// node .grok/skills/poster-scores/roster-names.mjs PeriodB
// Output is names: read it on this PC, never paste it into a log or the repo.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const URL = process.env.ROSTER_SERVICE_URL || 'https://roster-production-12c1.up.railway.app';

const section = process.argv[2];
if (!/^Period[A-Z]$/.test(section || '')) {
  console.error('usage: roster-names.mjs PeriodB');
  process.exit(1);
}

const env = readFileSync(resolve(REPO_ROOT, 'roster-server', '.env'), 'utf8');
const secret = process.env.ROSTER_TEACHER_SECRET
  || (env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m) || [])[1];
if (!secret) {
  console.error('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)');
  process.exit(1);
}

const res = await fetch(`${URL}/roster/list?section=${section}`, {
  headers: { 'x-teacher-secret': secret.trim() },
});
const body = await res.json();
if (!res.ok || !body.ok) {
  console.error('roster/list failed: ' + (body.error || res.status));
  process.exit(1);
}

const students = body.students.filter(s => !s.archived && s.role !== 'teacher');
console.log(`${section}: ${students.length} students`);
for (const student of students) console.log(student.realName || student.real_name);

// Read-only: print the Progress Check parts already stored on the roster server
// for one section + unit, so an agent can check a proposed FRQ score would not
// LOWER a stored one. GET only. Never prints the teacher secret or student ids.
// Students are MASKED by default (S1, S2, ... in username order, stable for the same roster).
// --names prints the real usernames: show them to the teacher only, never paste them elsewhere.
//
// Usage: node .grok/skills/pc-frq-scoring/pc-parts.mjs --section PeriodB|PeriodE --unit <n> [--names]

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const DEFAULT_URL = 'https://roster-production-12c1.up.railway.app';
const PART_NAMES = ['A', 'B', 'C', 'FRQ'];

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function resolveSecret() {
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readFileSafe(resolve(REPO_ROOT, 'roster-server', '.env'));
  const match = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m);
  return match ? match[1].trim() : null;
}

function resolveUrl() {
  const url = process.env.ROSTER_SERVICE_URL || DEFAULT_URL;
  return url.replace(/\/+$/, '');
}

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

// "9/10" when points are stored, else the 0..1 score as a percent, else "-".
function formatPart(part) {
  if (!part) return '-';
  if (part.points != null && part.of != null) return `${part.points}/${part.of}`;
  if (part.points != null) return `${part.points}/?`;
  if (typeof part.score === 'number') return `${Math.round(part.score * 1000) / 10}%`;
  return '-';
}

function formatStudent(student, label) {
  const parts = student.parts || {};
  const cells = PART_NAMES.map((name) => `${name} ${formatPart(parts[name])}`);
  const pct = student.pct == null ? '-' : student.pct;
  return `${String(label).padEnd(22)} ${cells.join('  ')}  | unit PC raw ${pct}`;
}

async function main(argv) {
  const section = readFlag(argv, '--section');
  const unit = parseInt(readFlag(argv, '--unit'), 10);
  if (!section || !Number.isInteger(unit)) {
    console.error('usage: pc-parts.mjs --section PeriodB|PeriodE --unit <n> [--names]');
    return 2;
  }

  const secret = resolveSecret();
  if (!secret) {
    console.error('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)');
    return 2;
  }

  const query = `section=${encodeURIComponent(section)}&unit=${unit}`;
  const response = await fetch(`${resolveUrl()}/pc/parts?${query}`, {
    method: 'GET',
    headers: { 'x-teacher-secret': secret },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    console.error(`HTTP ${response.status}: ${body.error || 'request failed'}`);
    return 1;
  }

  const students = [...(body.students || [])].sort((a, b) =>
    String(a.username).localeCompare(String(b.username)));
  console.log(`${section} Unit ${unit}: ${students.length} students`);
  const showNames = argv.includes('--names');
  students.forEach((student, index) => {
    const label = showNames ? student.username : `S${index + 1}`;
    console.log(formatStudent(student, label));
  });
  return 0;
}

main(process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch((err) => { console.error(`failed: ${err.message}`); process.exitCode = 1; });

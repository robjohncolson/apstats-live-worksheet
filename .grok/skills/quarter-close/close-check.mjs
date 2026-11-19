#!/usr/bin/env node
// close-check.mjs: read-only checks for the quarter close. GET only. Prints no student names.
//   node .grok/skills/quarter-close/close-check.mjs bank --quarter Q2 --snapshot <snapshot.json>
//   node .grok/skills/quarter-close/close-check.mjs deltas --quarter Q2 [--close YYYY-MM-DD]
//   node .grok/skills/quarter-close/close-check.mjs powerteacher --quarter Q2 [--out <dir>]
// powerteacher writes a PRIVATE file WITH names, outside the repo. Exit: 0 ok, 1 a check failed, 2 refused/bad input.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE_URL = (process.env.ROSTER_SERVICE_URL || 'https://roster-production-12c1.up.railway.app').replace(/\/+$/, '');
const SECTIONS = ['PeriodB', 'PeriodE'];
const POWERTEACHER_ID = { PeriodB: '67887', PeriodE: '67888' };
const LEDGER_WARN_ROWS = 9000; // Supabase caps one read at 10,000 rows; a capped read drops the oldest.
const SYNC_LOG_DIR = resolve(REPO_ROOT, 'tools', '.schoology-sync-logs');
const BASELINE_TOLERANCE = 0.15; // the nightly table rounds to 1 decimal
const SCALE = [[93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'], [77, 'C+'], [73, 'C'], [70, 'C-']];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function stop(message, code) {
  console.error(message);
  process.exit(code);
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function quarterArg() {
  const quarter = String(arg('--quarter') || '').toUpperCase();
  if (!/^Q[1-4]$/.test(quarter)) stop('need --quarter Q1..Q4', 2);
  return quarter;
}

function resolveSecret() {
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readText(resolve(REPO_ROOT, 'roster-server', '.env'));
  const match = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+?)\s*$/m);
  if (!match) stop('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)', 2);
  return match[1];
}

async function getJson(path, secret) {
  const res = await fetch(BASE_URL + path, { headers: { 'x-teacher-secret': secret } });
  if (!res.ok) stop(`GET ${path.split('?')[0]} failed: HTTP ${res.status}`, 1);
  return res.json();
}

// ---- bank -------------------------------------------------------------------

// "BONUS-U2-whiteboard-2026-10-23" and "BONUS-whiteboard-2026-10-23" are the same sheet.
function sheetKey(itemId) {
  return itemId.replace(/^BONUS-/, '').replace(/^U\d+-/, '');
}

function bonusRowsOf(student, quarter) {
  const rows = [];
  for (const row of student.bundle.records || []) {
    if (row.source !== 'bonus') continue;
    if (/^BONUS-(APPLIED|POSTER)-/.test(row.itemId || '')) continue;
    const detail = safeParse(row.response);
    if (!detail || detail.quarter !== quarter) continue;
    rows.push({ itemId: row.itemId, key: sheetKey(row.itemId), grade: detail.grade, title: detail.title, score: row.score });
  }
  return rows;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function bankSection(students, quarter, section) {
  const sheets = new Map();
  const doubles = [];
  students.forEach((student, index) => {
    const rows = bonusRowsOf(student, quarter);
    const seen = new Map();
    for (const row of rows) {
      seen.set(row.key, (seen.get(row.key) || 0) + 1);
      const sheet = sheets.get(row.itemId) || { title: row.title, E: 0, P: 0, I: 0, n: 0 };
      sheet[row.grade] = (sheet[row.grade] || 0) + 1;
      sheet.n += 1;
      sheets.set(row.itemId, sheet);
    }
    for (const [key, count] of seen) {
      if (count > 1) doubles.push(`student #${index + 1} holds ${count} rows for sheet "${key}"`);
    }
  });
  console.log(`== ${section}: ${students.length} students, ${sheets.size} banked sheets for ${quarter}`);
  for (const [itemId, s] of sheets) {
    console.log(`  ${itemId}  "${s.title}"  E ${s.E}  P ${s.P}  I ${s.I}  students ${s.n}`);
  }
  doubles.forEach(line => console.log(`  DOUBLE: ${line}`));
  return doubles.length;
}

function bank() {
  const quarter = quarterArg();
  const path = arg('--snapshot');
  if (!path) stop('need --snapshot <backup snapshot json>', 2);
  const text = readText(path);
  if (!text) stop(`cannot read ${path}`, 2);
  const snapshot = JSON.parse(text);
  let doubles = 0;
  let nearCap = 0;
  for (const section of SECTIONS) {
    const students = (snapshot.students || []).filter(s => s.section === section);
    doubles += bankSection(students, quarter, section);
    const largest = Math.max(0, ...students.map(s => s.recordCount || 0));
    console.log(`  largest ledger row count: ${largest}`);
    if (largest >= LEDGER_WARN_ROWS) {
      nearCap += 1;
      console.log(`  WARN: a student is at ${largest} rows (read cap 10,000): STOP, tell the teacher`);
    }
  }
  console.log(`bank: ${doubles} double entries, ${nearCap} sections near the read cap. Show the teacher every DOUBLE before the go.`);
  process.exit(doubles || nearCap ? 1 : 0);
}

// ---- deltas -----------------------------------------------------------------
// Two checks. (1) delta above 1 point: the live grade is well above the frozen one.
// (2) frozen BELOW the last nightly official grade from before the close: a freeze that is too low.
// The nightly ledger backups hold records only (no grades), so the baseline is the per-student
// "official Quarter N grades" table the nightly Schoology sync prints into tools/.schoology-sync-logs/.

function normalizeName(text) {
  return String(text || '').slice(0, 28).trim().replace(/\s+/g, ' ').toLowerCase();
}

// "sync-PeriodB-20261118-163001.log" -> { file, date: "2026-11-18" }, or null.
function syncLogInfo(file, section) {
  const match = file.match(/^sync-(Period[BE])-(\d{4})(\d{2})(\d{2})-\d+\.log$/);
  if (!match || match[1] !== section) return null;
  return { file, date: `${match[2]}-${match[3]}-${match[4]}` };
}

// Newest sync log strictly before closeDate ("YYYY-MM-DD"), or null.
export function newestLogBefore(files, section, closeDate) {
  const logs = files.map(file => syncLogInfo(file, section)).filter(Boolean).filter(log => log.date < closeDate);
  logs.sort((a, b) => a.file.localeCompare(b.file));
  return logs.length ? logs[logs.length - 1] : null;
}

// Reads the "official Quarter N grades" table out of a sync log. Returns Map(normalized name -> official).
export function parseOfficialTable(text, quarter) {
  const lines = text.replace(/\u0000/g, '').split(/\r?\n/);
  const header = `official Quarter ${quarter.slice(1)} grades`;
  const start = lines.findIndex(line => line.includes(header));
  if (start < 0) return new Map();
  const official = new Map();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('wrote ')) break;
    const match = line.match(/->\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) continue;
    official.set(normalizeName(line.slice(0, 28)), Number(match[1]));
  }
  return official;
}

// rows: [{ realName, frozen }]. Returns the frozen values below the baseline, and how many had no baseline.
export function compareFrozenToBaseline(rows, baseline) {
  const tooLow = [];
  let unmatched = 0;
  rows.forEach((row, index) => {
    const before = baseline.get(normalizeName(row.realName));
    if (before === undefined) {
      unmatched += 1;
      return;
    }
    if (row.frozen < before - BASELINE_TOLERANCE) tooLow.push({ row: index + 1, frozen: row.frozen, baseline: before });
  });
  return { tooLow, unmatched };
}

function loadBaseline(section, quarter, closeDate) {
  let files = [];
  try { files = readdirSync(SYNC_LOG_DIR); } catch { return { baseline: null, date: null }; }
  const log = newestLogBefore(files, section, closeDate);
  if (!log) return { baseline: null, date: null };
  const baseline = parseOfficialTable(readText(resolve(SYNC_LOG_DIR, log.file)) || '', quarter);
  return { baseline: baseline.size ? baseline : null, date: log.date };
}

function localToday() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function deltas() {
  const quarter = quarterArg();
  const closeDate = arg('--close') || localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) stop('--close must be YYYY-MM-DD', 2);
  const secret = resolveSecret();
  let bad = 0;
  let lowFreezes = 0;
  let baselineMissing = 0;
  for (const section of SECTIONS) {
    const doc = await getJson(`/class/quarter/deltas?quarter=${quarter}&section=${section}`, secret);
    console.log(`== ${section}: ${doc.frozenCount} frozen students, ${doc.deltas.length} delta rows`);
    doc.deltas.forEach((row, index) => {
      const flag = row.delta > 1 ? '  <-- BAD' : '';
      if (row.delta > 1) bad += 1;
      console.log(`  row ${index + 1}: delta ${row.delta}${flag}`);
    });
    const { baseline, date } = loadBaseline(section, quarter, closeDate);
    if (!baseline) {
      baselineMissing += 1;
      console.log(`  WARN: no nightly sync log before ${closeDate} with an official ${quarter} table in ${SYNC_LOG_DIR}: the frozen-too-low check was NOT done for ${section}`);
      continue;
    }
    const { tooLow, unmatched } = compareFrozenToBaseline(doc.deltas, baseline);
    console.log(`  baseline: nightly sync log of ${date}; ${unmatched} delta rows had no match there`);
    tooLow.forEach(item => console.log(`  row ${item.row}: frozen ${item.frozen} is BELOW last nightly ${item.baseline}  <-- LOW FREEZE`));
    lowFreezes += tooLow.length;
  }
  console.log(`deltas: ${bad} above 1 point, ${lowFreezes} frozen below the last pre-close nightly, ${baselineMissing} sections without a baseline`);
  process.exit(bad || lowFreezes || baselineMissing ? 1 : 0);
}

// ---- powerteacher -----------------------------------------------------------

function wholePercent(value) {
  return Math.floor(value + 0.5); // half up
}

function letterOf(percent) {
  const hit = SCALE.find(([min]) => percent >= min);
  return hit ? hit[1] : 'ASK';
}

function finalOf(student, quarter, savedStudents) {
  const saved = savedStudents[student.studentId];
  if (saved && saved.final != null) return { value: saved.final, source: 'schoology' };
  const closed = ((student.quarters || {})[quarter] || {}).closedGrade;
  if (closed != null) return { value: closed, source: 'desk-only' };
  return null;
}

function checkOutDir(out) {
  const rel = relative(REPO_ROOT, resolve(out));
  const insideRepo = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (insideRepo) stop('refused: --out is inside the repo (the file holds student names)', 2);
}

function defaultOut(quarter) {
  const today = new Date().toISOString().slice(0, 10);
  return resolve(homedir(), 'grade-backups', `${quarter.toLowerCase()}-close-${today}`);
}

async function powerteacher() {
  const quarter = quarterArg();
  const out = arg('--out') || defaultOut(quarter);
  checkOutDir(out);
  const secret = resolveSecret();
  const state = safeParse(readText(resolve(REPO_ROOT, 'tools', '.schoology-sync-logs', 'official-final-state.json')) || '{}') || {};
  const lines = [`PRIVATE (student names). Not in the repo. ${quarter} PowerTeacher list.`,
    'Letter scale: A 93+, A- 90-92, B+ 87-89, B 83-86, B- 80-82, C+ 77-79, C 73-76, C- 70-72. Whole percent, half up.',
    'ASK = below 70: ask the teacher which percent and letter to type. Never guess.', ''];
  const letters = {};
  for (const section of SECTIONS) {
    const doc = await getJson(`/class/grades?section=${section}`, secret);
    const saved = (((state[section] || {})[quarter]) || {}).students || {};
    const people = doc.students.filter(s => s.role !== 'teacher' && !String(s.username || '').startsWith('zz_'));
    lines.push(`PERIOD ${section.slice(-1)}  (PowerTeacher sectionId ${POWERTEACHER_ID[section]})`);
    let count = 0;
    for (const student of people) {
      const final = finalOf(student, quarter, saved);
      if (!final) continue;
      const percent = wholePercent(final.value);
      const letter = letterOf(percent);
      const note = final.source === 'desk-only' ? '   (Desk only: no Schoology row)' : '';
      const ask = letter === 'ASK' ? '   <-- ASK THE TEACHER' : '';
      lines.push(`  ${student.realName || student.username}   ${final.value}  ->  ${letter} ${percent}%${note}${ask}`);
      letters[`${section} ${letter}`] = (letters[`${section} ${letter}`] || 0) + 1;
      count += 1;
    }
    lines.push('');
    console.log(`${section}: ${count} students with a final`);
  }
  mkdirSync(out, { recursive: true });
  const file = resolve(out, `powerteacher-${quarter}.txt`);
  writeFileSync(file, lines.join('\n'), 'utf8');
  Object.keys(letters).sort().forEach(key => console.log(`  ${key}: ${letters[key]}`));
  console.log(`wrote ${file}`);
}

// Only run when started from the command line, so a test can import the pure functions.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const commands = { bank, deltas, powerteacher };
  const command = commands[process.argv[2]];
  if (!command) stop('usage: close-check.mjs bank|deltas|powerteacher --quarter Q2 [...]', 2);
  await command();
}

#!/usr/bin/env node
// Nightly brief for AP Statistics (sections B and E): one Markdown note per section for its NEXT
// meeting. It carries every open promise from every earlier Class Log recording until the teacher
// closes it. Deterministic: no AI call, no network write (the pull is a read of the a2 server).
//
//   node scripts/nightly-brief.mjs                      # pull summaries, then write both briefs
//   node scripts/nightly-brief.mjs --no-pull            # skip the pull (use the last pulled index)
//   node scripts/nightly-brief.mjs --section B          # one section
//   node scripts/nightly-brief.mjs --today 2026-11-18   # override today (default: New York, see below)
//   node scripts/nightly-brief.mjs --for-date 2026-11-19 # brief for the class on this date (bad value exits 2)
//   node scripts/nightly-brief.mjs --with-a2            # also run the a2 carried-promises script
//   node scripts/nightly-brief.mjs --root DIR           # repo root (tests use a temp dir)
//
// Close a promise (no pull, no brief):
//   node scripts/nightly-brief.mjs --kept <id>          # or --dropped <id>, --reopen <id>
//   node scripts/nightly-brief.mjs --dropped-before YYYY-MM-DD [--section B|E]
//   node scripts/nightly-brief.mjs --list [--section B|E]
//   node scripts/nightly-brief.mjs --import-server-states   # one-time: copy the a2 roster-server's
//        done/cancelled/deferred commitment states into the local ledger (read-only GET; idempotent;
//        a failed fetch changes nothing and exits 0)
//
// "Today" is New York time, except that a run before 05:00 counts as the previous day: the scheduled
// task starts when available, so a run delayed past midnight must still brief that morning's class.
// The brief lists in full only promises last said in the last 14 days; older open ones are one line.
// A run that pulls (the scheduled path) writes roster-local/job-status/nightly-brief.json =
// {job, ranAt, state: ok|nothing|failed, reason, streak}: failed (and the process exits 1) when the pull,
// the summary index after a pull, the a2 script or the run fails; nothing when no section meets in the next 30 days; streak = runs in a row in that state.
//
// Sources: data/lesson-schedule.json, roster-local/class-summaries/index.json (written by
// ../algebra2-live-worksheet/scripts/pull-class-summaries.mjs), roster-local/job-status/*.json.
// Writes (all under gitignored roster-local/brief/): <date>-<section>.md, promises.json (the
// ledger, see scripts/lib/promise-ledger.mjs) and latest.json (read by the morning itinerary).
// A failed pull never stops the briefs; the brief says so at the top.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cedLabel } from '../lib/ced-label.mjs';
import {
  applyServerStates, dropBefore, fetchServerCommitments, loadLedger, mergeSummaries, openFor, promiseLine,
  promiseSectionLines, saveLedger, setState, splitByAge,
} from './lib/promise-ledger.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALL_SECTIONS = ['B', 'E'];
const COURSE = 'apstats';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NO_LABEL = '(topic label unavailable)';
const NO_ITEM = 'No schedule item for this date (check the Desk calendar).';
const SEARCH_DAYS = 30;
const OWED_WINDOW_DAYS = 14;
const ZERO_WINDOW_DAYS = 7;
const ZERO_LAG_DAYS = 13;

// ---------- dates ----------

const isIso = text => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text + 'T12:00:00Z'));

export function addDays(date, count) {
  return new Date(Date.parse(date + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
}

// A run before this hour (New York) still belongs to the previous day.
const NEW_DAY_HOUR = 5;

export function todayInNewYork(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return Number(part('hour')) < NEW_DAY_HOUR ? addDays(date, -1) : date;
}

// --for-date names the class date, so "today" is the day before it (the next meeting is strictly after).
export function resolveToday(args, now = new Date()) {
  if (args.forDate) return addDays(args.forDate, -1);
  return args.today || todayInNewYork(now);
}

function weekdayOf(date) {
  return new Date(date + 'T12:00:00Z').getUTCDay();
}

function longDate(date) {
  const day = new Date(date + 'T12:00:00Z');
  return `${WEEKDAYS[day.getUTCDay()]} ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}`;
}

// ---------- arguments ----------

const VALUE_FLAGS = {
  '--section': 'section', '--today': 'today', '--root': 'root', '--kept': 'kept',
  '--dropped': 'dropped', '--reopen': 'reopen', '--dropped-before': 'droppedBefore', '--for-date': 'forDate',
};
const BOOLEAN_FLAGS = { '--no-pull': 'noPull', '--list': 'list', '--with-a2': 'withA2', '--import-server-states': 'importServerStates' };

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (BOOLEAN_FLAGS[flag]) { args[BOOLEAN_FLAGS[flag]] = true; continue; }
    if (!VALUE_FLAGS[flag]) throw new Error(`unknown argument ${flag}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    args[VALUE_FLAGS[flag]] = value;
  }
  if (args.section && !ALL_SECTIONS.includes(args.section)) throw new Error('--section must be B or E');
  if (args.today && !isIso(args.today)) throw new Error('--today must be YYYY-MM-DD');
  if (args.forDate && !isIso(args.forDate)) {
    const error = new Error('--for-date must be YYYY-MM-DD');
    error.exitCode = 2;
    throw error;
  }
  if (args.droppedBefore && !isIso(args.droppedBefore)) throw new Error('--dropped-before must be YYYY-MM-DD');
  return args;
}

// ---------- schedule ----------

function insideBreak(schedule, date) {
  const breaks = schedule.calendar?.breaks || [];
  return breaks.some(range => date >= range.from && date <= range.to);
}

// A meeting day: the section's weekday and school open.
export function isMeetingDay(schedule, section, date) {
  const weekdays = schedule.calendar?.meetingDays?.[section] || [];
  if (!weekdays.includes(weekdayOf(date))) return false;
  // A section's own Break Day (calendar.breakDays) still meets: it shows as a "Break Day" item.
  return !insideBreak(schedule, date);
}

// First meeting STRICTLY after `today`, or null.
export function nextMeeting(schedule, section, today) {
  for (let offset = 1; offset <= SEARCH_DAYS; offset++) {
    const date = addDays(today, offset);
    if (isMeetingDay(schedule, section, date)) return date;
  }
  return null;
}

// Latest meeting strictly before `before` and not after `today`, or null.
export function lastMeeting(schedule, section, today, before) {
  const start = before <= today ? addDays(before, -1) : today;
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const date = addDays(start, -offset);
    if (isMeetingDay(schedule, section, date)) return date;
  }
  return null;
}

function topicLabel(key) {
  try {
    const text = cedLabel(key)?.text;
    return text || NO_LABEL;
  } catch {
    return NO_LABEL;
  }
}

function posterItem(poster, unit, section, date) {
  const days = poster.days?.[section];
  if (days?.includes(date)) return `Unit ${unit} Poster, day ${days.indexOf(date) + 1} of ${days.length}`;
  if (poster.periods?.[section] === date) return `Unit ${unit} Poster`;
  return null;
}

// Human strings for what the schedule has on one date. Empty list = nothing scheduled.
export function itemsOn(schedule, section, date) {
  const items = [];
  for (const [key, lesson] of Object.entries(schedule.lessons || {})) {
    if (lesson.periods?.[section] === date) items.push(topicLabel(lesson.topicKey || key));
  }
  for (const event of schedule.calendar?.events?.[section] || []) {
    if (event.date === date) items.push(`${event.title} (${event.kind})`);
  }
  for (const [unit, check] of Object.entries(schedule.progressChecks || {})) {
    if (check.periods?.[section] === date) items.push(`Unit ${unit} Progress Check (day 1)`);
    if (check.adminDay2?.[section] === date) items.push(`Unit ${unit} Progress Check (day 2)`);
  }
  for (const [unit, poster] of Object.entries(schedule.posters || {})) {
    const item = posterItem(poster, unit, section, date);
    if (item) items.push(item);
  }
  return items;
}

// Schedule-only look ahead: Progress Check days, poster days, lesson zero dates. Sorted by date.
export function owedItems(schedule, section, today) {
  const found = [];
  const windowEnd = addDays(today, OWED_WINDOW_DAYS);
  const inWindow = date => Boolean(date) && date > today && date <= windowEnd;

  for (const [unit, check] of Object.entries(schedule.progressChecks || {})) {
    const day1 = check.periods?.[section];
    const day2 = check.adminDay2?.[section];
    if (inWindow(day1)) found.push({ date: day1, text: `Unit ${unit} Progress Check (day 1): ${day1}` });
    if (inWindow(day2)) found.push({ date: day2, text: `Unit ${unit} Progress Check (day 2): ${day2}` });
  }

  for (const [unit, poster] of Object.entries(schedule.posters || {})) {
    const days = poster.days?.[section] || [poster.periods?.[section]];
    for (const date of days) {
      if (!inWindow(date)) continue;
      found.push({ date, text: `${posterItem(poster, unit, section, date)}: ${date}` });
    }
  }

  const zeroEnd = addDays(today, ZERO_WINDOW_DAYS);
  for (const [key, lesson] of Object.entries(schedule.lessons || {})) {
    const lessonDate = lesson.periods?.[section];
    if (!lessonDate) continue;
    const zero = addDays(lessonDate, ZERO_LAG_DAYS);
    if (zero <= today || zero > zeroEnd) continue;
    found.push({ date: zero, text: `${topicLabel(lesson.topicKey || key)}: zero date ${zero}` });
  }

  return found.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text)).map(item => item.text);
}

// ---------- job status ----------

// Only failures and long "nothing to do" streaks are worth a line. Missing folder = no lines.
export function readJobs(root) {
  const dir = join(root, 'roster-local', 'job-status');
  if (!existsSync(dir)) return [];
  const lines = [];
  for (const name of readdirSync(dir).filter(file => file.endsWith('.json')).sort()) {
    const job = readJson(join(dir, name));
    if (!job) continue;
    if (job.state === 'failed') lines.push(`${job.job} FAILED ${job.ranAt}: ${job.reason}`);
    if (job.state === 'nothing' && job.streak > 3) lines.push(`${job.job}: nothing to do ${job.streak} runs in a row`);
  }
  return lines;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// ---------- pull ----------

function tail(text, max = 200) {
  const clean = String(text || '').trim();
  return clean.length > max ? clean.slice(-max) : clean;
}

export function pullSummaries(root) {
  const a2 = resolve(root, '../algebra2-live-worksheet');
  const script = join(a2, 'scripts', 'pull-class-summaries.mjs');
  if (!existsSync(script)) return { ok: false, reason: 'algebra2-live-worksheet checkout not found next to this repo' };
  const out = join(root, 'roster-local', 'class-summaries');
  const result = spawnSync(process.execPath, [script, '--course', 'apstats', '--out', out], { cwd: root, encoding: 'utf8' });
  if (result.error) return { ok: false, reason: tail(result.error.message) };
  if (result.status !== 0) return { ok: false, reason: tail(result.stderr) || `exit code ${result.status}` };
  return { ok: true, reason: '' };
}

// ---------- brief ----------

function bullets(list) {
  const items = (Array.isArray(list) ? list : []).filter(text => typeof text === 'string' && text.trim());
  return items.length ? items.map(text => `- ${text.trim()}`) : ['- (none listed)'];
}

function lastClassLines({ summary, lastDate, hasAnySummary }) {
  if (!summary) return [hasAnySummary ? 'No earlier recording for this section.' : 'No recordings yet.'];
  if (!lastDate || summary.date === lastDate) return [`Recording of ${summary.date}.`];
  return [`No recording for the last class (${lastDate}); newest recording is ${summary.date}.`];
}

// Markdown for one section. `summaries` are this section's entries from the index.
export function buildBrief({ section, schedule, summaries, ledger, today, pull, jobs, next }) {
  const nextDate = next || nextMeeting(schedule, section, today);
  const mine = summaries.filter(s => s.section === section);
  const earlier = mine.filter(s => nextDate && s.date < nextDate).sort((a, b) => b.date.localeCompare(a.date));
  const summary = earlier[0] || null;
  const lastDate = nextDate ? lastMeeting(schedule, section, today, nextDate) : null;
  const open = openFor(ledger, section);
  const items = nextDate ? itemsOn(schedule, section, nextDate) : [];
  const owed = owedItems(schedule, section, today);

  const lines = [];
  lines.push(nextDate
    ? `# AP Statistics ${section} · ${longDate(nextDate)} (next meeting ${nextDate})`
    : `# AP Statistics ${section} · no meeting found in the next ${SEARCH_DAYS} days`);
  if (pull && !pull.ok) lines.push('', `**Pull failed (${pull.reason}): built from the summaries pulled before.**`);
  if (jobs && jobs.length) lines.push('', `**Jobs:** ${jobs.join('; ')}`);

  lines.push('', '## Next meeting');
  lines.push(...(items.length ? items.map(item => `- ${item}`) : [`- ${NO_ITEM}`]));

  lines.push('', '## Last class', ...lastClassLines({ summary, lastDate, hasAnySummary: mine.length > 0 }));
  lines.push('', '### Landed', ...bullets(summary?.landed));
  lines.push('', '### Student questions', ...bullets(summary?.studentQuestions));

  lines.push('', `## Open promises (${open.length})`);
  lines.push(...promiseSectionLines(open, today, `node scripts/nightly-brief.mjs --list --section ${section}`));

  lines.push('', summary ? `## Next prep (recording of ${summary.date})` : '## Next prep', ...bullets(summary?.nextPrep));

  lines.push('', '## Owed / coming up (from the schedule only; no per-student missing work)');
  lines.push(...(owed.length ? owed.map(text => `- ${text}`) : ['- Nothing scheduled in the next 14 days.']));

  lines.push('', '## Close a promise');
  lines.push('`node scripts/nightly-brief.mjs --kept <id>` (or `--dropped <id>`). Bulk: `node scripts/nightly-brief.mjs --dropped-before YYYY-MM-DD [--section B|E]`.');
  return lines.join('\n') + '\n';
}

// ---------- run ----------

function readSummaryIndex(root) {
  const list = readJson(join(root, 'roster-local', 'class-summaries', 'index.json'));
  return { summaries: Array.isArray(list) ? list.filter(s => s && s.date && s.section) : [], found: Array.isArray(list) };
}

function runA2(root) {
  const a2 = resolve(root, '../algebra2-live-worksheet');
  const script = join(a2, 'scripts', 'carried-promises.mjs');
  if (!existsSync(script)) return { text: '', failed: false };
  const result = spawnSync(process.execPath, [script], { cwd: a2, encoding: 'utf8' });
  const failed = Boolean(result.error) || result.status !== 0;
  const error = failed ? `
a2 carried-promises FAILED: ${tail(result.error?.message || result.stderr) || `exit code ${result.status}`}
` : '';
  return { text: (result.stdout || '') + error, failed };
}

// Builds and writes the briefs. Returns { briefs, pull, pulled, summariesIndexFound, a2Failed, exitCode }.
export function run({ root = REPO_ROOT, today = todayInNewYork(), pull = true, sections = ALL_SECTIONS, withA2 = false } = {}) {
  const schedule = readJson(join(root, 'data', 'lesson-schedule.json'));
  if (!schedule) throw new Error('data/lesson-schedule.json is missing or unreadable');

  const pullResult = pull ? pullSummaries(root) : { ok: true, reason: 'skipped (--no-pull)' };
  const { summaries, found } = readSummaryIndex(root);

  const briefDir = join(root, 'roster-local', 'brief');
  const ledgerPath = join(briefDir, 'promises.json');
  const ledger = mergeSummaries(loadLedger(ledgerPath), summaries, { course: COURSE, sections: ALL_SECTIONS });
  saveLedger(ledgerPath, ledger);

  const jobs = readJobs(root);
  mkdirSync(briefDir, { recursive: true });
  const briefs = [];
  for (const section of sections) {
    const next = nextMeeting(schedule, section, today);
    const markdown = buildBrief({ section, schedule, summaries, ledger, today, pull: pullResult, jobs, next });
    const file = join(briefDir, `${next || today}-${section}.md`);
    writeFileSync(file, markdown);
    const recorded = summaries.filter(s => s.section === section && next && s.date < next).map(s => s.date).sort();
    briefs.push({
      section, nextMeeting: next, file, markdown,
      openPromises: openFor(ledger, section).length,
      recentPromises: splitByAge(openFor(ledger, section), today).recent.length, lastRecording: recorded.length ? recorded[recorded.length - 1] : null,
    });
  }

  const latest = {
    generatedAt: new Date().toISOString(),
    pull: { ok: pullResult.ok, reason: pullResult.reason },
    summariesIndexFound: found,
    sections: briefs.map(b => ({
      section: b.section, nextMeeting: b.nextMeeting, file: b.file, openPromises: b.openPromises,
      recentPromises: b.recentPromises, lastRecording: b.lastRecording,
    })),
  };
  writeFileSync(join(briefDir, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

  const a2 = withA2 ? runA2(root) : { text: '', failed: false };
  const result = {
    briefs, pull: pullResult, pulled: pull, summariesIndexFound: found, a2Text: a2.text, a2Failed: a2.failed,
  };
  return { ...result, exitCode: exitCodeOf(result) };
}

// ---------- job status ----------

// Writes roster-local/job-status/nightly-brief.json. streak = runs in a row with this state.
export function writeJobStatus(root, state, reason, ranAt = new Date().toISOString()) {
  const dir = join(root, 'roster-local', 'job-status');
  const path = join(dir, 'nightly-brief.json');
  const before = readJson(path);
  const streak = before && before.state === state && Number.isInteger(before.streak) ? before.streak + 1 : 1;
  const status = { job: 'nightly-brief', ranAt, state, reason, streak };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(status, null, 2) + '\n');
  return status;
}

export function jobStateOf(result) {
  if (!result.pull.ok) return { state: 'failed', reason: `pull failed: ${result.pull.reason}` };
  if (result.pulled && !result.summariesIndexFound) return { state: 'failed', reason: 'summary index missing after the pull' };
  if (result.a2Failed) return { state: 'failed', reason: 'a2 carried-promises failed' };
  if (!result.briefs.some(b => b.nextMeeting)) return { state: 'nothing', reason: 'no section meets in the next 30 days' };
  return { state: 'ok', reason: `${result.briefs.length} brief(s) written` };
}

// A failed step (pull, summary index, a2 script) exits 1, the same condition as the recorded state.
export function exitCodeOf(result) {
  return jobStateOf(result).state === 'failed' ? 1 : 0;
}

// ---------- one-time import of the server's commitment states ----------

export async function importServerStates({ root = REPO_ROOT, today = todayInNewYork(), sections = ALL_SECTIONS, fetchImpl } = {}) {
  const a2Root = resolve(root, '../algebra2-live-worksheet');
  const { rows, errors } = await fetchServerCommitments({ a2Root, course: COURSE, sections, fetchImpl });
  if (errors.length && !rows.length) return `import skipped, nothing changed: ${errors.join('; ')}`;
  const ledgerPath = ledgerPathOf(root);
  const { summaries } = readSummaryIndex(root);
  const ledger = mergeSummaries(loadLedger(ledgerPath), summaries, { course: COURSE, sections: ALL_SECTIONS });
  const changed = applyServerStates(ledger, rows, today);
  saveLedger(ledgerPathOf(root), ledger);
  const warn = errors.length ? ` (partial: ${errors.join('; ')})` : '';
  return `imported server states: ${changed} local promise(s) closed${warn}`;
}

// ---------- closing promises ----------

function ledgerPathOf(root) {
  return join(root, 'roster-local', 'brief', 'promises.json');
}

export function closePromise({ root = REPO_ROOT, today = todayInNewYork(), id, state }) {
  const ledger = loadLedger(ledgerPathOf(root));
  const entry = setState(ledger, id, state, today);
  saveLedger(ledgerPathOf(root), ledger);
  return `${id}: ${state}\n${entry.text}`;
}

export function dropOlder({ root = REPO_ROOT, today = todayInNewYork(), date, section = null }) {
  const ledger = loadLedger(ledgerPathOf(root));
  const count = dropBefore(ledger, date, today, section);
  saveLedger(ledgerPathOf(root), ledger);
  return `dropped ${count} open promise(s) first said before ${date}${section ? ` (section ${section})` : ''}`;
}

export function listOpen({ root = REPO_ROOT, today = todayInNewYork(), sections = ALL_SECTIONS }) {
  const ledger = loadLedger(ledgerPathOf(root));
  const lines = [];
  for (const section of sections) {
    const open = openFor(ledger, section);
    lines.push(`## ${section} (${open.length} open)`);
    lines.push(...(open.length ? open.map(entry => promiseLine(entry, today)) : ['- None open.']));
  }
  return lines.join('\n');
}

// One command line. Returns { code, out }; throws on bad input.
export function cli(argv, now = new Date()) {
  const args = parseArgs(argv);
  const root = args.root ? resolve(args.root) : REPO_ROOT;
  const today = resolveToday(args, now);
  const sections = args.section ? [args.section] : ALL_SECTIONS;

  for (const state of [['kept', 'kept'], ['dropped', 'dropped'], ['reopen', 'open']]) {
    if (args[state[0]]) return { code: 0, out: closePromise({ root, today, id: args[state[0]], state: state[1] }) };
  }
  if (args.droppedBefore) return { code: 0, out: dropOlder({ root, today, date: args.droppedBefore, section: args.section || null }) };
  if (args.list) return { code: 0, out: listOpen({ root, today, sections }) };

  let result;
  try {
    result = run({ root, today, pull: !args.noPull, sections, withA2: Boolean(args.withA2) });
  } catch (error) {
    if (!args.noPull) writeJobStatus(root, 'failed', error.message);
    throw error;
  }
  if (!args.noPull) {
    const { state, reason } = jobStateOf(result);
    writeJobStatus(root, state, reason);
  }
  const parts = result.briefs.map(b => `${b.markdown}\n(written to ${b.file})`);
  if (result.a2Text) parts.push(result.a2Text);
  return { code: result.exitCode, out: parts.join('\n---\n\n') };
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--import-server-states')) {
      const args = parseArgs(argv);
      const root = args.root ? resolve(args.root) : REPO_ROOT;
      console.log(await importServerStates({ root, today: resolveToday(args), sections: args.section ? [args.section] : ALL_SECTIONS }));
      return;
    }
    const { code, out } = cli(argv);
    console.log(out);
    process.exitCode = code;
  } catch (error) {
    console.error('nightly-brief: ' + error.message);
    process.exitCode = error.exitCode || 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

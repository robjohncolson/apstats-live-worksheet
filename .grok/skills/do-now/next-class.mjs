#!/usr/bin/env node
// Read-only: shows what the next AP Stats class for a section looks like.
// Usage: node .grok/skills/do-now/next-class.mjs --section B|E [--date YYYY-MM-DD]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const { cedLabel } = await import(pathToFileURL(path.join(REPO_ROOT, 'lib', 'ced-label.mjs')).href);

// Mirrors dueLagDays in roster-server/grade-config.js
const ZERO_LAG_DAYS = 13;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

const schedule = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'lesson-schedule.json'), 'utf8'));
const calendar = schedule.calendar;

// ---------- dates ----------

function toDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(iso, days) {
  return new Date(toDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayName(iso) {
  return WEEKDAYS[toDate(iso).getUTCDay()];
}

function todayInNewYork() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function quarterOf(iso) {
  for (const [key, range] of Object.entries(calendar.quarters)) {
    if (iso >= range.start && iso <= range.end) return key;
  }
  return 'no quarter';
}

// ---------- meeting days ----------

// Returns '' when the section meets, otherwise the reason it does not.
function noMeetingReason(section, iso) {
  const weekday = toDate(iso).getUTCDay();
  if (!calendar.meetingDays[section].includes(weekday)) return `not a Period ${section} weekday`;
  if (calendar.breaks.some((b) => iso >= b.from && iso <= b.to)) return 'school break';
  if ((calendar.breakDays[section] || []).includes(iso)) return `Period ${section} break day`;
  return '';
}

function meets(section, iso) {
  return noMeetingReason(section, iso) === '';
}

function nextMeetingAfter(section, iso) {
  let day = iso;
  for (let i = 0; i < 400; i++) {
    day = addDays(day, 1);
    if (meets(section, day)) return day;
  }
  return null;
}

function previousMeetingBefore(section, iso) {
  let day = iso;
  for (let i = 0; i < 400; i++) {
    day = addDays(day, -1);
    if (meets(section, day)) return day;
  }
  return null;
}

// ---------- what is scheduled ----------

function labelLesson(oldKey) {
  return `${cedLabel(oldKey).text} (stored as ${oldKey})`;
}

function worksheetFile(lesson) {
  const file = `u${lesson.unit}_lesson${lesson.worksheetKey}_live.html`;
  return fs.existsSync(path.join(REPO_ROOT, file)) ? file : '(no worksheet file)';
}

function describeLesson(oldKey, lesson) {
  const lines = [`- Lesson ${labelLesson(oldKey)}`, `    worksheet: ${worksheetFile(lesson)}`];
  if (lesson.combinedWith && lesson.combinedWith.length > 0) {
    const others = lesson.combinedWith.map(labelLesson).join('; ');
    lines.push(`    combined with: ${others}`);
  }
  return lines;
}

function lessonsOn(section, iso) {
  return Object.entries(schedule.lessons).filter(([, lesson]) => lesson.periods[section] === iso);
}

function posterLines(section, iso) {
  const lines = [];
  for (const [unit, poster] of Object.entries(schedule.posters || {})) {
    const days = poster.days?.[section] || (poster.periods[section] ? [poster.periods[section]] : []);
    const index = days.indexOf(iso);
    if (index === -1) continue;
    lines.push(`- Unit ${unit} poster day ${index + 1} of ${days.length}`);
  }
  return lines;
}

function progressCheckLines(section, iso) {
  const lines = [];
  for (const [unit, pc] of Object.entries(schedule.progressChecks || {})) {
    if (pc.periods?.[section] === iso) lines.push(`- Unit ${unit} Progress Check day 1`);
    if (pc.adminDay2?.[section] === iso) lines.push(`- Unit ${unit} Progress Check day 2`);
    if (pc.mcqPartA?.[section] === iso) lines.push(`- Unit ${unit} Progress Check MCQ Part A`);
  }
  return lines;
}

function eventLines(section, iso) {
  const events = calendar.events[section] || [];
  return events.filter((e) => e.date === iso).map((e) => `- Event (${e.kind}): ${e.title}`);
}

function scheduledLines(section, iso) {
  const lines = [];
  for (const [oldKey, lesson] of lessonsOn(section, iso)) lines.push(...describeLesson(oldKey, lesson));
  lines.push(...eventLines(section, iso));
  lines.push(...posterLines(section, iso));
  lines.push(...progressCheckLines(section, iso));
  return lines;
}

function printScheduled(section, iso, indent) {
  const lines = scheduledLines(section, iso);
  if (lines.length === 0) lines.push('- nothing scheduled (free/slack day)');
  for (const line of lines) console.log(indent + line);
}

// ---------- recent lessons ----------

function lastLessonsBefore(section, iso, count) {
  return Object.entries(schedule.lessons)
    .filter(([, lesson]) => lesson.periods[section] && lesson.periods[section] < iso)
    .sort((a, b) => b[1].periods[section].localeCompare(a[1].periods[section]))
    .slice(0, count);
}

function zeroNote(zeroDate, classDate) {
  if (zeroDate < classDate) return `0 since ${zeroDate}`;
  if (zeroDate === classDate) return `0 after ${zeroDate} (the class date)`;
  return `0 after ${zeroDate}`;
}

// ---------- class summaries ----------

function newestFile(dir, matches) {
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter(matches).sort();
  return names.length > 0 ? names[names.length - 1] : null;
}

function printSummaries(section) {
  const summary = newestFile(
    path.join(REPO_ROOT, 'roster-local', 'class-summaries'),
    (name) => name.endsWith(`-${section}.md`),
  );
  console.log(`Newest class summary for ${section}:`);
  console.log(summary ? `  roster-local/class-summaries/${summary}` : '  none - run npm run pull-summaries');

  const briefDir = path.join(REPO_ROOT, 'roster-local', 'brief');
  if (!fs.existsSync(briefDir)) {
    console.log('roster-local/brief: not present');
    return;
  }
  const brief = newestFile(briefDir, (name) => name.includes(section));
  console.log(brief ? `roster-local/brief newest for ${section}: roster-local/brief/${brief}` : `roster-local/brief: nothing for ${section}`);
}

// ---------- main ----------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--section') args.section = argv[++i];
    if (argv[i] === '--date') args.date = argv[++i];
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const section = (args.section || '').toUpperCase();
  if (!calendar.meetingDays[section]) fail('Usage: next-class.mjs --section B|E [--date YYYY-MM-DD]');
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) fail('--date must be YYYY-MM-DD');

  let date;
  if (!args.date) {
    date = nextMeetingAfter(section, todayInNewYork());
  } else if (meets(section, args.date)) {
    date = args.date;
  } else {
    console.log(`Section ${section} does not meet on ${args.date} (${noMeetingReason(section, args.date)})`);
    date = nextMeetingAfter(section, args.date);
  }
  if (!date) fail('No upcoming meeting day found in the schedule.');

  console.log(`Period ${section} - ${weekdayName(date)} ${date} (${quarterOf(date)})`);
  console.log('');
  console.log('On the schedule:');
  printScheduled(section, date, '  ');

  console.log('');
  const previous = previousMeetingBefore(section, date);
  console.log(`Previous meeting: ${previous}`);
  if (previous) printScheduled(section, previous, '  ');

  console.log('');
  console.log('Last 4 lessons taught before this date:');
  const recent = lastLessonsBefore(section, date, 4);
  if (recent.length === 0) console.log('  (none)');
  for (const [oldKey, lesson] of recent) {
    const taught = lesson.periods[section];
    console.log(`  - ${taught}: ${labelLesson(oldKey)} - ${zeroNote(addDays(taught, ZERO_LAG_DAYS), date)}`);
  }

  console.log('');
  console.log('Next 2 meetings after this one:');
  let after = date;
  for (let i = 0; i < 2; i++) {
    after = nextMeetingAfter(section, after);
    if (!after) break;
    console.log(`  ${weekdayName(after)} ${after}`);
    printScheduled(section, after, '    ');
  }

  console.log('');
  printSummaries(section);
}

main();

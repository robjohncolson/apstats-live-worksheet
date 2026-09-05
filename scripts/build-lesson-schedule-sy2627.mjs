#!/usr/bin/env node
// build-lesson-schedule-sy2627.mjs — the SY2627 lesson-schedule generator.
//
// SINGLE SOURCE OF TRUTH: the Desk's own calendar. This script extracts
// SCHEDULE_DEFS["SY26-27"] (first day, closures, meeting days, exam date), the
// two SY2627_PACING_* lists and the Desk's generateSchedule() straight out of
// ap_stats_roadmap_square_mode.html, runs the SAME generator the students'
// calendar runs, and writes what it produced to
//
//   data/lesson-schedule.json
//   roster-server/data/lesson-schedule.json   (bundled → Railway; drives "due")
//
// so the server's due dates and the Desk's calendar can never disagree.
//
// Output shape (schemaVersion 2, additive to the s121 shape):
//   lessons[oldTopicKey] = { unit(OLD), topicKey, worksheetKey, periods:{B,E},
//                            combinedWith? }   — unit/worksheetKey/combinedWith
//                            are carried over from the previous file unchanged
//                            (grades key off them). Bonus topics (crosswalk
//                            status !== 'core') are never on the calendar →
//                            periods {B:null, E:null} = never due.
//   progressChecks[newUnit] = { unit(NEW CED), title, kind:'pc',
//                            periods:{B,E} (Day 1), adminDay2:{B,E},
//                            mcqPartA:{B,E}|null }
//   posters[newUnit]      = { unit(NEW CED), title, kind:'poster', periods:{B,E} }
//   calendar              = { schoolYear, firstDay, examDate, breaks[],
//                            meetingDays, quarters, events }
//
// Invariants (the script refuses to write on any violation):
//   - every pacing item lands on the calendar, in pacing order, per period
//   - every crosswalk-core topic is dated for BOTH periods; every bonus topic is
//     dated for NEITHER
//   - every date is a meeting day for its period, not a closure, before the exam
//   - core-topic order matches scripts/fixtures/topic-schedule-sy2627.fixture.json
//
// Run: node scripts/build-lesson-schedule-sy2627.mjs [--check]
//   --check  → compute + validate + print; exit 1 if the files on disk differ
//              (drift guard between the Desk block and the committed JSON).
// Output is deterministic (no timestamp) so a no-op rerun is a no-op diff.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK_PATH = resolve(ROOT, 'ap_stats_roadmap_square_mode.html');
const CROSSWALK_PATH = resolve(ROOT, '2026-crosswalk.json');
const FIXTURE_PATH = resolve(ROOT, 'scripts/fixtures/topic-schedule-sy2627.fixture.json');
const OUT_ROOT = resolve(ROOT, 'data/lesson-schedule.json');
const OUT_BUNDLED = resolve(ROOT, 'roster-server/data/lesson-schedule.json');
const CHECK_ONLY = process.argv.includes('--check');

const { PHASE3_CONFIG } = await import(new URL('../roster-server/grade-config.js', import.meta.url));

// ── 1. Extract the live calendar + generator from the Desk ───────────────────
const DESK = readFileSync(DESK_PATH, 'utf8');

function uniqueIndex(marker) {
  const at = DESK.indexOf(marker);
  if (at < 0) throw new Error('Desk anchor not found: ' + marker);
  if (DESK.indexOf(marker, at + 1) >= 0) throw new Error('Desk anchor is not unique: ' + marker);
  return at;
}
function fnBody(name) {
  const at = uniqueIndex('function ' + name + '(');
  const open = DESK.indexOf('{', at);
  let depth = 0;
  for (let j = open; j < DESK.length; j++) {
    if (DESK[j] === '{') depth++;
    else if (DESK[j] === '}') { depth--; if (depth === 0) return DESK.slice(at, j + 1); }
  }
  throw new Error('Desk function unbalanced: ' + name);
}
function constArray(name) {
  const at = uniqueIndex('const ' + name + ' = [');
  const open = DESK.indexOf('[', at);
  let depth = 0;
  for (let j = open; j < DESK.length; j++) {
    if (DESK[j] === '[') depth++;
    else if (DESK[j] === ']') { depth--; if (depth === 0) return DESK.slice(at, j + 1); }
  }
  throw new Error('Desk const unbalanced: ' + name);
}
function objBlock(marker) {
  const at = uniqueIndex(marker);
  const open = DESK.indexOf('{', at);
  let depth = 0;
  for (let j = open; j < DESK.length; j++) {
    if (DESK[j] === '{') depth++;
    else if (DESK[j] === '}') { depth--; if (depth === 0) return DESK.slice(open, j + 1); }
  }
  throw new Error('Desk block unbalanced: ' + marker);
}
function litField(block, name, open, close) {
  const at = block.indexOf(name + ':');
  if (at < 0) throw new Error('Desk field not found: ' + name);
  const start = block.indexOf(open, at);
  let depth = 0;
  for (let j = start; j < block.length; j++) {
    if (block[j] === open) depth++;
    else if (block[j] === close) { depth--; if (depth === 0) return block.slice(start, j + 1); }
  }
  throw new Error('Desk field unbalanced: ' + name);
}

const SY_BLOCK = objBlock('"SY26-27": {');
// eslint-disable-next-line no-new-func
const CFG = new Function('return {examDate:' + litField(SY_BLOCK, 'examDate', '[', ']')
  + ',range:' + litField(SY_BLOCK, 'range', '{', '}')
  + ',daysOff:' + litField(SY_BLOCK, 'daysOff', '[', ']')
  + ',periods:' + litField(SY_BLOCK, 'periods', '{', '}') + '}')();

const GEN_SRC =
  'const R="review",OFF="off",EX="exam",PO="post",NC="noclass";\n'
  + ['d', 'dateFromArr', 'buildOffSet', 'enumWeekdays', 'injectPcPosterEvents', 'generateSchedule'].map(fnBody).join('\n') + '\n'
  + constArray('SY2627_PACING_B') + ';\n'
  + constArray('SY2627_PACING_E') + ';\n'
  + 'const pacing={B:injectPcPosterEvents(SY2627_PACING_B),E:injectPcPosterEvents(SY2627_PACING_E)};\n'
  + 'const def={range:CFG.range,examDate:CFG.examDate,daysOff:CFG.daysOff,periods:CFG.periods,pacing};\n'
  + 'return {S:generateSchedule(def),pacing,offSet:buildOffSet(def.daysOff)};';
// eslint-disable-next-line no-new-func
const { S, pacing, offSet } = new Function('CFG', GEN_SRC)(CFG);

// ── 2. Walk the generated calendar ───────────────────────────────────────────
const iso = (y, m0, d) => `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const isoFromArr = (a) => iso(a[0], a[1], a[2]);
const EXAM_ISO = isoFromArr(CFG.examDate);
const FIRST_ISO = isoFromArr(CFG.range.start);

// placed[period] = ordered [{ t, kind, part, admin, n, u, date }]
const placed = { B: [], E: [] };
for (const row of S) {
  const [y, m0, d, cellB, cellE] = row;
  const date = iso(y, m0, d);
  for (const [period, cell] of [['B', cellB], ['E', cellE]]) {
    if (!cell || typeof cell !== 'object') continue;
    placed[period].push({ ...cell, date });
  }
}

function fail(msg) {
  console.error('build-lesson-schedule-sy2627: INVARIANT FAILED — ' + msg);
  process.exit(1);
}

// Invariant: everything in pacing landed, in order.
for (const period of ['B', 'E']) {
  const want = pacing[period];
  const got = placed[period];
  if (got.length !== want.length) fail(`${period}: ${got.length} placed vs ${want.length} pacing items (exam too early?)`);
  for (let i = 0; i < want.length; i++) {
    if (want[i].t !== got[i].t) fail(`${period}[${i}]: pacing ${want[i].t} vs placed ${got[i].t}`);
  }
}

// Invariant: meeting day, not a closure, before the exam, strictly increasing.
const DOW = (isoDate) => { const [y, m, d] = isoDate.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
for (const period of ['B', 'E']) {
  const meets = CFG.periods[period].meetsDays;
  let prev = '';
  for (const item of placed[period]) {
    const [y, m, d] = item.date.split('-').map(Number);
    if (!meets.includes(DOW(item.date))) fail(`${period} ${item.t} on ${item.date} is not a meeting day`);
    if (offSet.has(`${y}-${m - 1}-${d}`)) fail(`${period} ${item.t} on ${item.date} is a closure`);
    if (item.date >= EXAM_ISO) fail(`${period} ${item.t} on ${item.date} is on/after the exam ${EXAM_ISO}`);
    if (item.date <= prev) fail(`${period} ${item.t} on ${item.date} not after ${prev}`);
    prev = item.date;
  }
}

// ── 3. Lessons: carry the previous file's keys/units, replace the dates ───────
const previous = JSON.parse(readFileSync(OUT_BUNDLED, 'utf8'));
const crosswalk = JSON.parse(readFileSync(CROSSWALK_PATH, 'utf8')).map;
const TOPIC_KEY = /^\d+\.\d+$/;

const dateOf = { B: new Map(), E: new Map() };
for (const period of ['B', 'E']) {
  for (const item of placed[period]) {
    if (!TOPIC_KEY.test(item.t)) continue;
    if (dateOf[period].has(item.t)) fail(`${period}: topic ${item.t} placed twice`);
    dateOf[period].set(item.t, item.date);
  }
}

const lessons = {};
for (const [topicKey, prevEntry] of Object.entries(previous.lessons)) {
  const status = crosswalk[topicKey] ? crosswalk[topicKey].status : 'core';
  const b = dateOf.B.get(topicKey) || null;
  const e = dateOf.E.get(topicKey) || null;
  if (status === 'core' && (!b || !e)) fail(`core topic ${topicKey} is not on the calendar (B=${b} E=${e})`);
  if (status !== 'core' && (b || e)) fail(`bonus topic ${topicKey} is on the calendar (B=${b} E=${e})`);
  const entry = {
    unit: prevEntry.unit,
    topicKey,
    worksheetKey: prevEntry.worksheetKey,
    periods: { B: b, E: e },
  };
  if (prevEntry.combinedWith) entry.combinedWith = prevEntry.combinedWith;
  lessons[topicKey] = entry;
}
for (const period of ['B', 'E']) {
  for (const t of dateOf[period].keys()) {
    if (!lessons[t]) fail(`${period}: calendar topic ${t} has no lesson-schedule entry`);
  }
}

// Invariant: core order matches the independently generated fixture.
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
for (const period of ['B', 'E']) {
  const fixtureOrder = Object.keys(fixture[period]).filter((k) => TOPIC_KEY.test(k));
  const ours = [...dateOf[period].keys()];
  if (JSON.stringify(fixtureOrder) !== JSON.stringify(ours)) {
    fail(`${period}: core-topic order differs from the fixture\n  fixture: ${fixtureOrder.join(' ')}\n  desk:    ${ours.join(' ')}`);
  }
}

// ── 4. Progress checks + posters (keyed by NEW CED unit) ─────────────────────
function eventDates(match) {
  const out = { B: null, E: null };
  for (const period of ['B', 'E']) {
    const hit = placed[period].find(match);
    if (hit) out[period] = hit.date;
  }
  return out;
}
const progressChecks = {};
const posters = {};
const newUnits = [...new Set(pacing.B.filter((x) => x.kind === 'pc' && x.admin === 1).map((x) => x.u))].sort((a, b) => a - b);
for (const u of newUnits) {
  const day1 = eventDates((x) => x.t === `U${u}-PC1` && x.kind === 'pc' && x.admin === 1);
  const day2 = eventDates((x) => x.t === `U${u}-PC2` && x.kind === 'pc' && x.admin === 2);
  const partA = eventDates((x) => x.t === `U${u}-PCA` && x.part === 'A');
  const poster = eventDates((x) => x.t === `U${u}-Poster` && x.kind === 'poster');
  for (const [label, ev] of [['PC day 1', day1], ['PC day 2', day2], ['poster', poster]]) {
    if (!ev.B || !ev.E) fail(`U${u} ${label} missing for a period (B=${ev.B} E=${ev.E})`);
  }
  if ((partA.B == null) !== (partA.E == null)) fail(`U${u} MCQ Part A present for only one period`);
  progressChecks[String(u)] = {
    unit: u,
    title: `Unit ${u} Progress Check`,
    kind: 'pc',
    duration: { adminDays: 2, reviewDays: 0 },
    periods: day1,
    adminDay2: day2,
    mcqPartA: (partA.B || partA.E) ? partA : null,
  };
  posters[String(u)] = {
    unit: u,
    title: `Unit ${u} Poster`,
    kind: 'poster',
    duration: { longBlocks: 1, shortBlocks: 2 },
    periods: poster,
  };
}

// ── 5. Calendar block ────────────────────────────────────────────────────────
const breaks = CFG.daysOff.map((e) => ({ from: isoFromArr(e[0]), to: isoFromArr(e[e.length - 1]) }));
const quarters = {};
for (const [q, v] of Object.entries(PHASE3_CONFIG.quarters)) quarters[q] = { start: v.start, end: v.end };
for (const period of ['B', 'E']) {
  for (const item of placed[period]) {
    const inQ = Object.values(quarters).some((w) => item.date >= w.start && item.date <= w.end);
    if (!inQ) fail(`${period} ${item.t} on ${item.date} is outside every grade-config quarter window`);
  }
}
const events = {};
for (const period of ['B', 'E']) {
  events[period] = placed[period]
    .filter((x) => !TOPIC_KEY.test(x.t) && x.kind !== 'pc' && x.kind !== 'poster')
    .map((x, i) => ({ id: x.kind ? x.t : `review-${i + 1}`, kind: x.kind || 'review', title: x.n, date: x.date }));
}

// Meetings left before the exam after the last pacing item (slack for "stop and extend").
function slackAfterLast(period) {
  const last = placed[period][placed[period].length - 1].date;
  let n = 0;
  for (const row of S) {
    const date = iso(row[0], row[1], row[2]);
    const cell = period === 'B' ? row[3] : row[4];
    if (date > last && date < EXAM_ISO && cell === 'noclass' && CFG.periods[period].meetsDays.includes(DOW(date))) n++;
  }
  return n;
}

const calendar = {
  schoolYear: 'SY2627',
  source: 'ap_stats_roadmap_square_mode.html SCHEDULE_DEFS["SY26-27"] (see sy2627-calendar-intake.md)',
  firstDay: FIRST_ISO,
  examDate: EXAM_ISO,
  breaks,
  meetingDays: { B: CFG.periods.B.meetsDays, E: CFG.periods.E.meetsDays },
  quarters,
  events,
  slackMeetingsBeforeExam: { B: slackAfterLast('B'), E: slackAfterLast('E') },
};

// ── 6. Emit ──────────────────────────────────────────────────────────────────
const output = {
  schemaVersion: 2,
  generatedBy: 'scripts/build-lesson-schedule-sy2627.mjs',
  note: 'lessons[].unit is the OLD 9-unit id (grades key off it); progressChecks/posters are keyed by the NEW CED-2026 unit (matches the Desk U{n}-PC ids and pc_bank). Bonus topics have null dates = never due.',
  calendar,
  lessons,
  progressChecks,
  posters,
};
const json = JSON.stringify(output, null, 2) + '\n';

const coreCount = Object.values(lessons).filter((l) => l.periods.B).length;
console.log(`build-lesson-schedule-sy2627: ${Object.keys(lessons).length} lessons (${coreCount} dated core, ${Object.keys(lessons).length - coreCount} bonus/null), ${newUnits.length} PCs + posters`);
console.log(`  first day ${FIRST_ISO}, exam ${EXAM_ISO}; slack before exam B +${calendar.slackMeetingsBeforeExam.B} / E +${calendar.slackMeetingsBeforeExam.E} meetings`);
for (const period of ['B', 'E']) {
  console.log(`  ${period} first 12: ` + placed[period].slice(0, 12).map((x) => `${x.date.slice(5)}=${x.t}`).join(' '));
  console.log(`  ${period} last:     ${placed[period][placed[period].length - 1].date} ${placed[period][placed[period].length - 1].t}`);
}
for (const u of newUnits) {
  const pc = progressChecks[String(u)];
  console.log(`  U${u}: poster B ${posters[String(u)].periods.B} E ${posters[String(u)].periods.E} · PC B ${pc.periods.B}/${pc.adminDay2.B} E ${pc.periods.E}/${pc.adminDay2.E}` + (pc.mcqPartA ? ` · MCQ-A B ${pc.mcqPartA.B} E ${pc.mcqPartA.E}` : ''));
}

if (CHECK_ONLY) {
  let drift = false;
  for (const p of [OUT_ROOT, OUT_BUNDLED]) {
    let current = null;
    try { current = readFileSync(p, 'utf8'); } catch (_) { current = null; }
    if (current !== json) { drift = true; console.error(`  --check: ${p} differs from the Desk calendar — rerun without --check`); }
  }
  if (drift) process.exit(1);
  console.log('  --check: both files match the Desk calendar');
} else {
  writeFileSync(OUT_ROOT, json, 'utf8');
  writeFileSync(OUT_BUNDLED, json, 'utf8');
  console.log(`  wrote ${OUT_ROOT}\n  wrote ${OUT_BUNDLED}`);
}

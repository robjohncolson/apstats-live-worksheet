// build-sy2627-schedule.mjs -- SY26-27 lesson-schedule generator (F2).
//
// Reads roster-server/data/lesson-schedule.json, assigns every lesson a
// SY26-27 date using an even-spread algorithm, writes the file back.
//
// Grading Model v3 (s121) extension: ALSO places Progress Check + Poster
// dates after each unit's last lesson. Cadence per unit:
//   Day N    = last lesson date (already placed by lesson loop above)
//   Day N+1  = Poster (gallery walk + peer grade, 1 day default)
//   Day N+2  = PC Day 1 (administration)
//   Day N+3  = PC Day 2 (administration)
// PC and Poster dates are written to doc.progressChecks[unit].periods and
// doc.posters[unit].periods using the same {B, E} string-date shape as
// lessons. The 3-day cadence consumes school days from the same year-long
// school-day pool; if a unit's +3 spills past the school year, it clamps.
//
// Run: node scripts/build-sy2627-schedule.mjs
//
// Algorithm (BUILD doc Section 4):
//   1. School-day test: Mon-Fri and not a closure (UTC date methods).
//   2. For each quarter, schoolDays(Q) = ordered school days in the window.
//   3. Lessons in topic order: sort by (unit asc, numeric-part asc).
//   4. Slots: group lessons by unit + '/' + worksheetKey. Each group = 1 slot.
//      Slot order = order of each group's first topic.
//   5. Per quarter: place slot i at Math.round(i * (D-1) / (N-1)) for N>1,
//      or 0 for N===1. Enforce strictly increasing indices. Last slot on or
//      before the quarter close date.
//   6. Every topic in a slot gets the slot's date for both periods.B and periods.E.
//   7. PC + Poster placement: per unit, find its last-lesson date in the
//      year's school-day pool, then place Poster (+1), PC1 (+2), PC2 (+3).
//   8. Write back with bumped generatedAt, 2-space indent, LF, trailing newline.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, '../roster-server/data/lesson-schedule.json');
const ROADMAP_PATH = path.join(__dirname, '../roadmap-data.json');

// ── Calendar constants ────────────────────────────────────────────────────────

const WINDOWS = {
  Q1: ['2026-09-09', '2026-11-13'],
  Q2: ['2026-11-14', '2027-01-29'],
  Q3: ['2027-01-30', '2027-04-09'],
  Q4: ['2027-04-10', '2027-06-23'],
};

const UNIT_QUARTER = {
  1: 'Q1', 2: 'Q1', 3: 'Q1',
  4: 'Q2', 5: 'Q2',
  6: 'Q3', 7: 'Q3',
  8: 'Q4', 9: 'Q4',
};

// Closures: NOT school days. Singles and inclusive ranges.
// Half-days are NORMAL school days -- do not exclude them.
const CLOSURE_RANGES = [
  ['2026-10-12', '2026-10-12'],
  ['2026-11-03', '2026-11-03'],
  ['2026-11-11', '2026-11-11'],
  ['2026-11-26', '2026-11-27'],
  ['2026-12-24', '2027-01-01'],
  ['2027-01-18', '2027-01-18'],
  ['2027-02-15', '2027-02-19'],
  ['2027-03-26', '2027-03-26'],
  ['2027-04-19', '2027-04-23'],
  ['2027-05-31', '2027-05-31'],
  ['2027-06-18', '2027-06-18'],
];

// ── School-day helpers ────────────────────────────────────────────────────────

// Expand closure ranges into a Set of ISO date strings.
function buildClosureSet(ranges) {
  const set = new Set();
  for (const [start, end] of ranges) {
    let cur = new Date(start + 'T00:00:00Z');
    const stop = new Date(end + 'T00:00:00Z');
    while (cur <= stop) {
      set.add(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86400000);
    }
  }
  return set;
}

const CLOSURES = buildClosureSet(CLOSURE_RANGES);

// Return true if the ISO date string is a school day (Mon-Fri, not a closure).
// Uses UTC methods to avoid timezone off-by-one.
function isSchoolDay(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !CLOSURES.has(iso);
}

// Ordered list of school days in [startIso, endIso] (both inclusive).
function schoolDays(startIso, endIso) {
  const days = [];
  let cur = new Date(startIso + 'T00:00:00Z');
  const stop = new Date(endIso + 'T00:00:00Z');
  while (cur <= stop) {
    const iso = cur.toISOString().slice(0, 10);
    if (isSchoolDay(iso)) days.push(iso);
    cur = new Date(cur.getTime() + 86400000);
  }
  return days;
}

// ── Sort topics in lesson order (unit asc, then numeric-part asc) ─────────────

function topicSortKey(topicKey) {
  const [u, l] = topicKey.split('.');
  return [Number(u), Number(l)];
}

function sortTopics(topicKeys) {
  return [...topicKeys].sort((a, b) => {
    const [ua, la] = topicSortKey(a);
    const [ub, lb] = topicSortKey(b);
    if (ua !== ub) return ua - ub;
    return la - lb;
  });
}

// ── Main generator ────────────────────────────────────────────────────────────

function main() {
  const raw = readFileSync(SCHEDULE_PATH, 'utf8');
  const doc = JSON.parse(raw);
  const lessons = doc.lessons;

  // For each quarter, collect its topics in sorted order and build slots.
  // A slot = all topics sharing the same (unit, worksheetKey).
  // Slot order = order of each group's first topic.

  const quarterResults = {}; // qKey -> Map<slotId, [topicKey, ...]>

  for (const qKey of Object.keys(WINDOWS)) {
    const [winStart, winEnd] = WINDOWS[qKey];
    const days = schoolDays(winStart, winEnd);

    // Collect topics in this quarter (by UNIT_QUARTER mapping).
    const qTopics = Object.keys(lessons).filter(tk => {
      const entry = lessons[tk];
      return entry && UNIT_QUARTER[entry.unit] === qKey;
    });
    const sortedTopics = sortTopics(qTopics);

    // Build ordered slots (preserving first-appearance order).
    const slotOrder = [];       // slot IDs in order
    const slotTopics = {};      // slotId -> [topicKey, ...]
    for (const tk of sortedTopics) {
      const entry = lessons[tk];
      const slotId = `${entry.unit}/${entry.worksheetKey}`;
      if (!slotTopics[slotId]) {
        slotTopics[slotId] = [];
        slotOrder.push(slotId);
      }
      slotTopics[slotId].push(tk);
    }

    const N = slotOrder.length;
    const D = days.length;

    console.log(`${qKey}: ${N} slots, ${D} school days (${winStart} to ${winEnd})`);

    if (N === 0) {
      quarterResults[qKey] = slotTopics;
      continue;
    }

    // Place each slot at an even-spread day index; enforce strictly increasing.
    let prevIndex = -1;
    for (let i = 0; i < N; i++) {
      let dayIndex = (N === 1) ? 0 : Math.round(i * (D - 1) / (N - 1));
      // Enforce strictly increasing; clamp to D-1.
      if (dayIndex <= prevIndex) dayIndex = prevIndex + 1;
      if (dayIndex >= D) dayIndex = D - 1;
      prevIndex = dayIndex;

      const date = days[dayIndex];
      const slotId = slotOrder[i];
      // Assign date to all topics in this slot.
      for (const tk of slotTopics[slotId]) {
        lessons[tk].periods = { B: date, E: date };
      }
    }
  }

  // ── Grading Model v3: PC + Poster placement (per unit) ─────────────────────
  //
  // For each unit, find the max lesson date among its placed lessons,
  // then place Poster (+1 school day), PC Day 1 (+2), PC Day 2 (+3).
  // School-day arithmetic uses the year's full school-day pool so the
  // +3 cadence can carry across a quarter boundary if needed.

  const yearWinStart = WINDOWS.Q1[0];
  const yearWinEnd = WINDOWS.Q4[1];
  const yearDays = schoolDays(yearWinStart, yearWinEnd);
  const yearIndex = new Map();
  for (let i = 0; i < yearDays.length; i++) yearIndex.set(yearDays[i], i);

  function nextSchoolDay(iso, n) {
    const idx = yearIndex.get(iso);
    if (idx === undefined) return null;
    const target = idx + n;
    if (target >= yearDays.length) return null;
    return yearDays[target];
  }

  const pcMap = doc.progressChecks || {};
  const posterMap = doc.posters || {};
  let pcWritten = 0;
  let posterWritten = 0;

  for (let unit = 1; unit <= 9; unit++) {
    let lastLessonDate = null;
    for (const tk of Object.keys(lessons)) {
      const entry = lessons[tk];
      if (!entry || entry.unit !== unit) continue;
      const d = entry.periods && entry.periods.B;
      if (d && (!lastLessonDate || d > lastLessonDate)) lastLessonDate = d;
    }
    if (!lastLessonDate) continue;

    const posterDate = nextSchoolDay(lastLessonDate, 1);
    const pcDay1 = nextSchoolDay(lastLessonDate, 2);
    const pcDay2 = nextSchoolDay(lastLessonDate, 3);

    if (posterMap[String(unit)] && posterDate) {
      posterMap[String(unit)].periods = { B: posterDate, E: posterDate };
      posterWritten++;
    }
    if (pcMap[String(unit)] && pcDay1 && pcDay2) {
      // PC events span 2 school days; we store the FIRST admin day in
      // periods.B/E, and the second day is implicit via the `duration`
      // field (adminDays: 2). Future schedulers + renderers can expand
      // the implicit range.
      pcMap[String(unit)].periods = { B: pcDay1, E: pcDay1 };
      // Capture the second admin day for renderers that want to show
      // two consecutive PC tiles.
      pcMap[String(unit)].adminDay2 = pcDay2;
      pcWritten++;
    }
  }

  // Write back: bump generatedAt, preserve shape, 2-space indent, LF, trailing newline.
  doc.generatedAt = new Date().toISOString();
  const output = JSON.stringify(doc, null, 2) + '\n';
  // Normalize to LF (in case the runtime produces CRLF on Windows).
  writeFileSync(SCHEDULE_PATH, output.replace(/\r\n/g, '\n'), 'utf8');

  console.log(`\nWrote ${SCHEDULE_PATH}`);
  console.log(`Total lessons: ${Object.keys(lessons).length}`);
  console.log(`PCs placed: ${pcWritten} / ${Object.keys(pcMap).length}`);
  console.log(`Posters placed: ${posterWritten} / ${Object.keys(posterMap).length}`);

  // ── Mirror PC + Poster dates back to roadmap-data.json ────────────────────
  //
  // BAKED_REGISTRY in ap_stats_roadmap_square_mode.html is derived from
  // roadmap-data.json (via the Agent repo's export-registry.mjs). For the
  // roadmap calendar to render PC + Poster tiles on their scheduled dates,
  // the SAME dates must live in roadmap-data.json's progressChecks/posters
  // maps. We dual-write here so a single `node build-sy2627-schedule.mjs`
  // updates both sources of truth.
  //
  // Only the progressChecks/posters periods are mirrored. Lesson dates
  // stay in lesson-schedule.json (the gradebook side) since roadmap-data
  // .json's lesson periods are richer objects ({date, schoologyFolder, ...})
  // that the Agent rebake owns end-to-end.

  let roadmapDirty = false;
  let roadmap;
  try {
    roadmap = JSON.parse(readFileSync(ROADMAP_PATH, 'utf8'));
  } catch (e) {
    console.log(`(skip roadmap-data.json mirror -- not readable: ${e.message})`);
    return;
  }

  if (roadmap.progressChecks) {
    for (const u of Object.keys(pcMap)) {
      if (!roadmap.progressChecks[u]) continue;
      const pc = pcMap[u];
      roadmap.progressChecks[u].periods = pc.periods;
      if (pc.adminDay2 !== undefined) {
        roadmap.progressChecks[u].adminDay2 = pc.adminDay2;
      }
      roadmapDirty = true;
    }
  }
  if (roadmap.posters) {
    for (const u of Object.keys(posterMap)) {
      if (!roadmap.posters[u]) continue;
      roadmap.posters[u].periods = posterMap[u].periods;
      roadmapDirty = true;
    }
  }

  if (roadmapDirty) {
    const roadmapOut = JSON.stringify(roadmap, null, 2) + '\n';
    writeFileSync(ROADMAP_PATH, roadmapOut.replace(/\r\n/g, '\n'), 'utf8');
    console.log(`Mirrored PC + Poster dates to ${ROADMAP_PATH}`);
  }
}

main();

// build-sy2627-schedule.mjs -- SY26-27 lesson-schedule generator (F2).
//
// SUPERSEDED 2026-09-03: the real schedule is generated from the Desk calendar by
// scripts/build-lesson-schedule-sy2627.mjs. Do NOT run this even-spread estimator
// against lesson-schedule.json any more (it would overwrite the real dates).
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
  const pcMap = doc.progressChecks || {};
  const posterMap = doc.posters || {};

  // ── PACK-LEFT ALGORITHM (Grading Model v3, s121 refinement) ────────────────
  //
  // Front-load all content from Sept 9. Iterate units 1..9 in order; for
  // each unit, pack its lesson slots onto consecutive school days, then
  // append its Poster (next day) and PC Day 1 + Day 2 (two days after).
  // The remainder of the school year past the last placed event is buffer
  // for AP review, practice exams, and post-AP activities.
  //
  // Unit -> quarter mapping (UNIT_QUARTER) is NOT used for date placement
  // -- it only determines which marking-period bucket a unit's grade
  // contributes to (handled in roster-server's lesson-grade.js). A unit's
  // events can land on any school day regardless of the quarter window;
  // the quarter mapping is static (Q1=U1+U2+U3, Q2=U4+U5, etc.).

  const yearDays = schoolDays(WINDOWS.Q1[0], WINDOWS.Q4[1]);
  let cursor = 0;
  let pcWritten = 0;
  let posterWritten = 0;

  function placeNext() {
    return cursor < yearDays.length ? yearDays[cursor++] : null;
  }

  for (let unit = 1; unit <= 9; unit++) {
    const unitTopics = Object.keys(lessons).filter(tk => lessons[tk] && lessons[tk].unit === unit);
    const sortedTopics = sortTopics(unitTopics);

    // Group topics by worksheetKey -- one slot = one school day.
    const slotOrder = [];
    const slotTopics = {};
    for (const tk of sortedTopics) {
      const slotId = `${unit}/${lessons[tk].worksheetKey}`;
      if (!slotTopics[slotId]) {
        slotTopics[slotId] = [];
        slotOrder.push(slotId);
      }
      slotTopics[slotId].push(tk);
    }

    const unitStartCursor = cursor;

    // Pack each slot on the next available school day.
    for (const slotId of slotOrder) {
      const date = placeNext();
      if (!date) {
        console.warn(`U${unit} ran past school year at slot ${slotId}`);
        continue;
      }
      for (const tk of slotTopics[slotId]) {
        lessons[tk].periods = { B: date, E: date };
      }
    }

    // Append Poster (next school day after lessons).
    if (posterMap[String(unit)]) {
      const posterDate = placeNext();
      if (posterDate) {
        posterMap[String(unit)].periods = { B: posterDate, E: posterDate };
        posterWritten++;
      }
    }

    // Append PC Day 1 + Day 2 (two consecutive school days).
    if (pcMap[String(unit)]) {
      const pcDay1 = placeNext();
      const pcDay2 = placeNext();
      if (pcDay1 && pcDay2) {
        pcMap[String(unit)].periods = { B: pcDay1, E: pcDay1 };
        pcMap[String(unit)].adminDay2 = pcDay2;
        pcWritten++;
      }
    }

    const unitEndCursor = cursor;
    console.log(`U${unit}: ${slotOrder.length} slots + Poster + PC (${unitStartCursor}..${unitEndCursor - 1}) -> ${yearDays[unitStartCursor]} to ${yearDays[unitEndCursor - 1]}`);
  }

  const contentEndDate = cursor > 0 ? yearDays[cursor - 1] : null;
  const bufferStartDate = cursor < yearDays.length ? yearDays[cursor] : null;
  const bufferDays = yearDays.length - cursor;

  console.log(`\n--- pack-left summary ---`);
  console.log(`Year school days: ${yearDays.length} (${yearDays[0]} -> ${yearDays[yearDays.length - 1]})`);
  console.log(`Content cursor: ${cursor} (used ${cursor} days)`);
  console.log(`Content ends: ${contentEndDate || '-'}`);
  console.log(`Buffer starts: ${bufferStartDate || '-'} (${bufferDays} days for AP review + post-AP)`);

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

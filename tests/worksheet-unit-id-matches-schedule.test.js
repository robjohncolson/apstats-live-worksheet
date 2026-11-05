// Every follow-along worksheet stamps its ledger items with an id like WS-U4L3-5-Q1.
// The grade engine (roster-server/lesson-grade.js expandLessonKey) finds the lesson
// for a row by matching that stamp against data/lesson-schedule.json. A stamp that
// matches no lesson means the student's work counts for nothing, silently
// (2026-11-05: u4_lesson3-4-5 stamped U4L3-5, the schedule said 3-4-5, nine days lost).
//
// This test pins every worksheet's stamp to a schedule entry:
//   - EXACT: an entry with the same unit and worksheetKey, or
//   - RANGE: a multi-lesson worksheetKey whose first and last lesson equal the
//     stamp's (the "U4L3-5" -> "3-4-5" fallback shipped in 95528cff).
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSHEET_FILE = /^u\d+_lesson.+_live\.html$/;

// Known exception: an orphan worksheet nobody links to. Its stamp (U4L1-3) matches
// no schedule lesson, so it must stay unlinked; if it is ever linked, fix its stamp.
const ORPHAN_WORKSHEETS = ['u4_lesson1-2-3_live.html'];
const LINK_SURFACES = ['index.html', 'TOC.html', 'roadmap-data.json', 'ap_stats_roadmap_square_mode.html'];

function readRoot(name) {
  return readFileSync(resolve(ROOT, name), 'utf8');
}

function worksheetFiles() {
  return readdirSync(ROOT).filter((name) => WORKSHEET_FILE.test(name)).sort();
}

// The stamp a worksheet writes into its item ids, as "U<unit>L<key>".
// Most sheets declare `const UNIT_ID = 'U4L3-5'`; the older u3_lesson6-7 prototype
// declares `const WORKSHEET_ID = 'WS-U3L6-7'` and stamps `${WORKSHEET_ID}-Q<n>`.
function readStamp(html) {
  const unitId = html.match(/const UNIT_ID = '([^']+)'/);
  if (unitId) return unitId[1];
  const worksheetId = html.match(/const WORKSHEET_ID = 'WS-([^']+)'/);
  if (worksheetId) return worksheetId[1];
  return null;
}

function parseStamp(stamp) {
  const m = /^U(\d+)L([0-9-]+)$/.exec(stamp);
  if (!m) return null;
  return { unit: Number(m[1]), key: m[2] };
}

function keyEnds(key) {
  const parts = String(key).split('-').map(Number);
  return [parts[0], parts[parts.length - 1]];
}

function scheduleLessons() {
  return Object.values(JSON.parse(readRoot('data/lesson-schedule.json')).lessons);
}

function exactMatch(lessons, unit, key) {
  return lessons.some((entry) => entry.unit === unit && entry.worksheetKey === key);
}

function rangeMatch(lessons, unit, key) {
  if (!key.includes('-')) return false;
  const [first, last] = keyEnds(key);
  return lessons.some((entry) => {
    if (entry.unit !== unit) return false;
    if (!String(entry.worksheetKey).includes('-')) return false;
    const ends = keyEnds(entry.worksheetKey);
    return ends[0] === first && ends[1] === last;
  });
}

describe('worksheet item-id stamps match data/lesson-schedule.json', () => {
  const lessons = scheduleLessons();
  const files = worksheetFiles();

  it('finds the worksheet family', () => {
    expect(files.length).toBeGreaterThanOrEqual(69);
  });

  for (const file of files) {
    if (ORPHAN_WORKSHEETS.includes(file)) continue;

    it(`${file} stamps a scheduled lesson`, () => {
      const stamp = readStamp(readRoot(file));
      expect(stamp, `${file}: no UNIT_ID / WORKSHEET_ID constant`).toBeTruthy();
      const parsed = parseStamp(stamp);
      expect(parsed, `${file}: stamp ${stamp} is not U<n>L<key>`).toBeTruthy();
      const ok = exactMatch(lessons, parsed.unit, parsed.key) || rangeMatch(lessons, parsed.unit, parsed.key);
      expect(ok, `${file}: stamp ${stamp} matches no lesson in data/lesson-schedule.json`).toBe(true);
    });
  }

  for (const orphan of ORPHAN_WORKSHEETS) {
    it(`${orphan} stays unlinked (its stamp matches no lesson)`, () => {
      for (const surface of LINK_SURFACES) {
        expect(readRoot(surface).includes(orphan), `${surface} links ${orphan}`).toBe(false);
      }
    });
  }
});

/**
 * scripts/build-lesson-schedule.mjs — Gradebook Phase 6 + Grading Model v3.
 *
 * Reads roadmap-data.json and emits a slim lesson-schedule.json with:
 *   - One entry per numeric topic (e.g. "1.1", "4.2")
 *   - unit, topicKey, worksheetKey (lesson-number string for item-id parsing)
 *   - periods: { B: "YYYY-MM-DD", E: "YYYY-MM-DD" } (null when date unknown)
 *   - combinedWith: [...topicKeys] when two or more topics share a worksheet
 *
 * Grading Model v3 (s121): also emits progressChecks and posters top-level
 * maps when roadmap-data.json carries those keys. Each PC/poster entry is
 * keyed by unit number ("1".."9") with shape:
 *   { unit, title, kind, duration, periods: { B: "YYYY-MM-DD"|null, E: ... } }
 * If roadmap-data.json lacks those keys, the build emits the legacy
 * lessons-only schema (schemaVersion 1) -- safe to run against older
 * roadmap exports.
 *
 * Dual-writes:
 *   data/lesson-schedule.json          (repo root)
 *   roster-server/data/lesson-schedule.json  (bundled with Railway container)
 *
 * CLI: node scripts/build-lesson-schedule.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_ROOT     = resolve(ROOT, 'data/lesson-schedule.json');
const OUT_BUNDLED  = resolve(ROOT, 'roster-server/data/lesson-schedule.json');
const ROADMAP_PATH = resolve(ROOT, 'roadmap-data.json');

// ── Load roadmap ──────────────────────────────────────────────────────────────

const roadmap = JSON.parse(readFileSync(ROADMAP_PATH, 'utf8'));
const rawLessons = roadmap.lessons || {};

// ── Filter to numeric topic keys only (skip "6.review" etc.) ─────────────────

const NUMERIC_KEY = /^\d+\.\d+$/;
const numericEntries = Object.entries(rawLessons).filter(([k]) => NUMERIC_KEY.test(k));

// ── Identify combined worksheets (topics sharing a worksheet URL) ─────────────
//
// For each shared worksheet URL, compute the lesson-number suffix used
// in item IDs. E.g. topics [4.1, 4.2] sharing "u4_lesson1-2_live.html"
// → worksheetKey "1-2" and each is combinedWith the others.
//
// The worksheetKey is derived from the URL filename:
//   u4_lesson1-2_live.html  → "1-2"
//   u4_lesson1-2-3_live.html → "1-2-3"
//   u3_lesson6-7_live.html  → "6-7"
//   u4_lesson7-8_live.html  → "7-8"
//
// For solo worksheets, the worksheetKey = the lesson number within the unit:
//   topic "4.6" with "u4_lesson6_live.html" → "6"
//   topic "1.1" with any URL                → "1"

function extractWorksheetKeyFromUrl(url) {
  if (!url) return null;
  // Match pattern: u{N}_lesson{key}_live.html
  const m = url.match(/u\d+_lesson([\d-]+)_live\.html/i);
  return m ? m[1] : null;
}

// Group topics by worksheet URL within each unit to find combined worksheets.
// Map: worksheetUrl → [topicKey, ...]
const urlToTopics = {};
for (const [topicKey, data] of numericEntries) {
  const url = data.urls && data.urls.worksheet;
  if (!url) continue;
  if (!urlToTopics[url]) urlToTopics[url] = [];
  urlToTopics[url].push(topicKey);
}

// For each topicKey, compute its worksheetKey and combinedWith list.
// Topics with no worksheet URL get worksheetKey = the lesson number.
const worksheetKeyOf = {};
const combinedWithOf = {};

for (const [url, topics] of Object.entries(urlToTopics)) {
  const wsKey = extractWorksheetKeyFromUrl(url);
  for (const tk of topics) {
    worksheetKeyOf[tk] = wsKey;
    if (topics.length > 1) {
      combinedWithOf[tk] = topics.filter(t => t !== tk);
    }
  }
}

// Fall back for topics with no worksheet URL: key = lesson number.
for (const [topicKey] of numericEntries) {
  if (!worksheetKeyOf[topicKey]) {
    worksheetKeyOf[topicKey] = String(topicKey.split('.')[1]);
  }
}

// ── Build lesson entries ──────────────────────────────────────────────────────

const lessons = {};

for (const [topicKey, data] of numericEntries) {
  const unit = parseInt(topicKey.split('.')[0], 10);

  // Extract per-period due dates (null if missing or absent from data).
  const bDate = data.periods && data.periods.B && data.periods.B.date || null;
  const eDate = data.periods && data.periods.E && data.periods.E.date || null;

  const entry = {
    unit,
    topicKey,
    worksheetKey: worksheetKeyOf[topicKey],
    periods: { B: bDate, E: eDate },
  };

  const combinedWith = combinedWithOf[topicKey];
  if (combinedWith && combinedWith.length > 0) {
    entry.combinedWith = combinedWith;
  }

  lessons[topicKey] = entry;
}

// ── Sort lessons by unit then lesson number ────────────────────────────────────

const sortedLessons = {};
const sortedKeys = Object.keys(lessons).sort((a, b) => {
  const [ua, la] = a.split('.');
  const [ub, lb] = b.split('.');
  const ud = Number(ua) - Number(ub);
  return ud !== 0 ? ud : Number(la) - Number(lb);
});
for (const k of sortedKeys) {
  sortedLessons[k] = lessons[k];
}

// ── Build progressChecks + posters (Grading Model v3, optional) ──────────────

function buildEventMap(rawMap, kind) {
  if (!rawMap || typeof rawMap !== 'object') return null;
  const out = {};
  const sortedUnitKeys = Object.keys(rawMap).sort((a, b) => Number(a) - Number(b));
  for (const unitKey of sortedUnitKeys) {
    const data = rawMap[unitKey];
    if (!data || typeof data !== 'object') continue;
    const bDate = data.periods && data.periods.B && data.periods.B.date || null;
    const eDate = data.periods && data.periods.E && data.periods.E.date || null;
    const entry = {
      unit: Number(unitKey),
      title: data.title || null,
      kind,
      duration: data.duration || null,
      periods: { B: bDate, E: eDate },
    };
    out[unitKey] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const progressChecks = buildEventMap(roadmap.progressChecks, 'pc');
const posters = buildEventMap(roadmap.posters, 'poster');

// ── Emit ──────────────────────────────────────────────────────────────────────

const hasV3Events = progressChecks !== null || posters !== null;

const output = {
  schemaVersion: hasV3Events ? 2 : 1,
  generatedAt: new Date().toISOString(),
  lessons: sortedLessons,
};
if (progressChecks) output.progressChecks = progressChecks;
if (posters) output.posters = posters;

const json = JSON.stringify(output, null, 2) + '\n';

// Ensure data dirs exist.
const dataDir = resolve(ROOT, 'data');
const bundledDir = resolve(ROOT, 'roster-server/data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(bundledDir)) mkdirSync(bundledDir, { recursive: true });

writeFileSync(OUT_ROOT, json, 'utf8');
writeFileSync(OUT_BUNDLED, json, 'utf8');

const count = sortedKeys.length;
const pcCount = progressChecks ? Object.keys(progressChecks).length : 0;
const posterCount = posters ? Object.keys(posters).length : 0;
const eventSummary = (pcCount || posterCount)
  ? ` + ${pcCount} PCs + ${posterCount} posters (v3)`
  : '';
console.log(`build-lesson-schedule: wrote ${count} lessons${eventSummary} to`);
console.log(`  ${OUT_ROOT}`);
console.log(`  ${OUT_BUNDLED}`);

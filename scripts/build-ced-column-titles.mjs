// build-ced-column-titles.mjs -- the Schoology column title map, OLD title -> CED-2026 title.
//
// CED2026_SINGLE_SOURCE_SPEC.md section 3. Output: data/ced-column-titles.json, read by
//   - tools/schoology_sync_lib.py (python: assignment_title(..., ced=True), the rename tool)
//   - lib/ced-label.js tests (cedColumnTitle must agree with this file)
//
// Inputs (never edited here):
//   - 2026-crosswalk.json          the single crosswalk
//   - js/ced2026-labels.js         the Desk's label logic (topic, Day N, bonus), run in a vm
//   - data/lesson-schedule.json    lessons (worksheet groups), progressChecks, posters
//
// One entry per Schoology column key, the same keys the sync uses:
//   FA:<group>  QUIZ:<topic>  BL:<group>  PC:U<n>  POSTER:U<n>
// plus FA:<topic> for each topic inside a combined worksheet (lesson granularity only,
// "schoologyColumn": false -- never a real column, never renamed).
//
// Run: node scripts/build-ced-column-titles.mjs          (writes the file)
//      node scripts/build-ced-column-titles.mjs --check  (fails if the file is stale)

import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const REPO = new URL('../', import.meta.url);
const CROSSWALK = new URL('2026-crosswalk.json', REPO);
const LABELS_JS = new URL('js/ced2026-labels.js', REPO);
const SCHEDULE = new URL('data/lesson-schedule.json', REPO);
const OUTPUT = new URL('data/ced-column-titles.json', REPO);

const KIND_SUFFIX = { lesson: 'Follow-Along', quiz: 'Quiz', blooket: 'Blooket' };
const KIND_RANK = { lesson: 0, quiz: 1, blooket: 2, progress_check: 3, poster: 4 };

// ---------------------------------------------------------------------------
// Load the Desk's label logic exactly as the browser runs it.
// ---------------------------------------------------------------------------

// js/ced2026-labels.js exposes either bare globals (cedLabel) or, as the vendored copy of
// lib/ced-label.js, a CedLabel API object. Either way cedLabel() is the Desk's own logic.
function loadLabelApi(crosswalkMap) {
  const sandbox = { CED2026_CROSSWALK: crosswalkMap, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(LABELS_JS, 'utf8'), sandbox, { filename: 'ced2026-labels.js' });
  const api = sandbox.CedLabel || sandbox;
  if (typeof api.cedLabel !== 'function') throw new Error('js/ced2026-labels.js exposes no cedLabel()');
  return api;
}

// Cross-check (warning only): the shared JS cedColumnTitle must name every Schoology column
// exactly as this file does, or the roster's "Schoology: <column>" tag names a column that
// does not exist after the rename.
const JS_KIND = { lesson: 'followalong', quiz: 'quiz', blooket: 'blooket', progress_check: 'pc', poster: 'poster' };
function crossCheck(api, entries) {
  if (typeof api.cedColumnTitle !== 'function') return;
  const diffs = [];
  for (const e of entries.filter((x) => x.schoologyColumn)) {
    const arg = e.kind === 'progress_check' || e.kind === 'poster' ? e.unit : e.oldKey;
    const js = api.cedColumnTitle(JS_KIND[e.kind], arg);
    if (js !== e.ced) diffs.push(e.columnKey + ': JS ' + JSON.stringify(js) + ' vs fixture ' + JSON.stringify(e.ced));
  }
  if (diffs.length) {
    console.warn('WARN cedColumnTitle (js/ced2026-labels.js) disagrees with the Schoology titles on '
      + diffs.length + ' column(s):\n  ' + diffs.join('\n  '));
  }
}

function topicParts(topic) {
  const [unit, lesson] = String(topic).split('.').map(Number);
  return { unit, lesson };
}

function compareTopics(a, b) {
  const left = topicParts(a);
  const right = topicParts(b);
  return left.unit - right.unit || left.lesson - right.lesson;
}

// ---------------------------------------------------------------------------
// Title rules (lib/ced-label.js cedColumnTitle must produce the same strings).
// ---------------------------------------------------------------------------

// "Beyond the Exam: Slope inference" -> "Slope inference"; drops a trailing "(...)" note.
function shortBonusLabel(newLabel) {
  return String(newLabel || 'Additional practice')
    .replace(/^Beyond the Exam:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

function daysText(days) {
  if (days.length === 1) return 'Day ' + days[0];
  const contiguous = days.every((day, i) => i === 0 || day === days[i - 1] + 1);
  if (contiguous) return 'Days ' + days[0] + '-' + days[days.length - 1];
  return 'Days ' + days.join('+');
}

// One CED topic: "1.13", or "1.13 Day 2" when the column covers only part of the topic.
function topicToken(topic, labels) {
  const total = labels[0].days;
  const days = [...new Set(labels.map((l) => l.day).filter((d) => d !== null))].sort((a, b) => a - b);
  if (total <= 1 || days.length === total) return topic;
  return topic + ' ' + daysText(days);
}

// Several CED topics: consecutive runs collapse to "2.4-2.6", other runs join with " + ".
function topicRuns(topics) {
  const runs = [];
  for (let i = 0; i < topics.length; i += 1) {
    const start = topics[i];
    let end = start;
    while (i + 1 < topics.length) {
      const cur = topicParts(end);
      const next = topicParts(topics[i + 1]);
      if (next.unit !== cur.unit || next.lesson !== cur.lesson + 1) break;
      end = topics[++i];
    }
    runs.push(start === end ? start : start + '-' + end);
  }
  return runs.join(' + ');
}

function bonusPrefix(bonusKeys, cedLabel, bonusSiblings) {
  const short = shortBonusLabel(cedLabel(bonusKeys[0]).label);
  const siblings = bonusSiblings.get(short) || bonusKeys;
  const days = bonusKeys.map((key) => siblings.indexOf(key) + 1).sort((a, b) => a - b);
  if (siblings.length <= 1 || days.length === siblings.length) return 'Beyond the Exam: ' + short;
  return 'Beyond the Exam: ' + short + ' ' + daysText(days);
}

// The CED title prefix for a column made of these OLD topic keys.
function cedPrefix(oldKeys, cedLabel, bonusSiblings) {
  const labels = oldKeys.map((key) => ({ key, label: cedLabel(key) }));
  for (const { key, label } of labels) {
    if (!label.mapped) throw new Error('No crosswalk entry for old key ' + key);
  }
  const core = labels.filter((l) => !l.label.bonus);
  const bonus = labels.filter((l) => l.label.bonus).map((l) => l.key);
  if (!core.length) return { prefix: bonusPrefix(bonus, cedLabel, bonusSiblings), bonus };

  const byTopic = new Map();
  for (const { label } of core) {
    if (!byTopic.has(label.id)) byTopic.set(label.id, []);
    byTopic.get(label.id).push(label);
  }
  const topics = [...byTopic.keys()].sort(compareTopics);
  if (topics.length === 1) return { prefix: topicToken(topics[0], byTopic.get(topics[0])), bonus };
  return { prefix: topicRuns(topics), bonus };
}

// ---------------------------------------------------------------------------
// Column inventory from the schedule (same grouping as schoology_components).
// ---------------------------------------------------------------------------

function worksheetGroups(lessons) {
  const groups = new Map();
  for (const [topicKey, entry] of Object.entries(lessons)) {
    if (!entry || entry.kind === 'work') continue;
    if (entry.unit == null || entry.worksheetKey == null) continue;
    const label = entry.unit + '.' + entry.worksheetKey;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(topicKey);
  }
  for (const keys of groups.values()) keys.sort(compareTopics);
  return groups;
}

function eventUnits(schedule) {
  const units = new Set();
  for (const map of [schedule.progressChecks || {}, schedule.posters || {}]) {
    for (const [key, entry] of Object.entries(map)) {
      const unit = entry && entry.unit != null ? entry.unit : Number(String(key).replace(/^U/i, ''));
      units.add(Number(unit));
    }
  }
  return [...units].sort((a, b) => a - b);
}

function columnSortKey(entry) {
  const first = entry.topicKeys[0];
  const topic = first ? topicParts(first) : { unit: 999, lesson: 999 };
  const unit = first ? topic.unit : entry.unit;
  return [first ? 0 : 1, unit, topic.lesson, entry.oldKey.length, KIND_RANK[entry.kind], entry.oldKey];
}

function compareEntries(a, b) {
  const left = columnSortKey(a);
  const right = columnSortKey(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

function build() {
  const crosswalk = JSON.parse(readFileSync(CROSSWALK, 'utf8')).map;
  const schedule = JSON.parse(readFileSync(SCHEDULE, 'utf8'));
  const labelApi = loadLabelApi(crosswalk);
  const cedLabel = (oldKey) => labelApi.cedLabel(oldKey);

  // Bonus topics that share one short label ("Slope inference" = old 9.1-9.5) get Day N.
  const bonusSiblings = new Map();
  for (const key of Object.keys(crosswalk).sort(compareTopics)) {
    if (crosswalk[key].status !== 'bonus') continue;
    const short = shortBonusLabel(crosswalk[key].newLabel);
    if (!bonusSiblings.has(short)) bonusSiblings.set(short, []);
    bonusSiblings.get(short).push(key);
  }

  const entries = [];
  function add(columnKey, kind, oldKey, topicKeys, oldTitle, schoologyColumn) {
    const suffix = KIND_SUFFIX[kind];
    const { prefix, bonus } = cedPrefix(topicKeys, cedLabel, bonusSiblings);
    const entry = { columnKey, kind, oldKey, topicKeys, old: oldTitle, ced: prefix + ' ' + suffix,
      schoologyColumn };
    if (bonus.length) entry.bonusTopicKeys = bonus;
    if (bonus.length === topicKeys.length) entry.flag = 'bonus-only: Beyond the Exam column, no CED topic';
    else if (bonus.length) entry.flag = 'bonus topic(s) folded into the core column title';
    entries.push(entry);
  }

  const groups = worksheetGroups(schedule.lessons || {});
  for (const [group, topicKeys] of groups) {
    add('FA:' + group, 'lesson', group, topicKeys, group + ' Follow-Along', true);
    add('BL:' + group, 'blooket', group, topicKeys, group + ' Blooket', true);
    for (const topic of topicKeys) {
      add('QUIZ:' + topic, 'quiz', topic, [topic], topic + ' Quiz', true);
      if (topic !== group) add('FA:' + topic, 'lesson', topic, [topic], topic + ' Follow-Along', false);
    }
  }
  for (const unit of eventUnits(schedule)) {
    const pc = 'Unit ' + unit + ' Progress Check';
    const poster = 'Unit ' + unit + ' Poster';
    entries.push({ columnKey: 'PC:U' + unit, kind: 'progress_check', oldKey: 'U' + unit, topicKeys: [],
      unit, old: pc, ced: pc, schoologyColumn: true });
    entries.push({ columnKey: 'POSTER:U' + unit, kind: 'poster', oldKey: 'U' + unit, topicKeys: [],
      unit, old: poster, ced: poster, schoologyColumn: true });
  }
  entries.sort(compareEntries);
  crossCheck(labelApi, entries);

  // Safety: a CED title names exactly one real column (the sync matches columns by exact title).
  const seen = new Map();
  for (const e of entries.filter((x) => x.schoologyColumn)) {
    if (seen.has(e.ced)) throw new Error('CED title collision: ' + e.ced + ' (' + seen.get(e.ced) + ', ' + e.columnKey + ')');
    if (e.ced.includes(', ')) throw new Error('A title may not contain ", " (gradebook aria-label match): ' + e.ced);
    if (!/^[\x20-\x7e]+$/.test(e.ced)) throw new Error('A Schoology title must be plain ASCII: ' + e.ced);
    seen.set(e.ced, e.columnKey);
  }

  const columns = {};
  for (const e of entries) {
    const { columnKey, ...rest } = e;
    columns[columnKey] = rest;
  }
  return {
    _doc: 'GENERATED by scripts/build-ced-column-titles.mjs -- do not edit. Schoology column titles, '
      + 'OLD (what the sync names columns today) -> CED-2026. Keys are the sync column keys. '
      + 'CED2026_SINGLE_SOURCE_SPEC.md section 3.',
    rules: [
      'Suffix by kind: lesson -> "Follow-Along", quiz -> "Quiz", blooket -> "Blooket".',
      'One CED topic, whole topic covered -> "<topic> <Suffix>" (e.g. "1.11 Follow-Along").',
      'One CED topic shared by several old lessons, column covers part -> "<topic> Day <n> <Suffix>" '
        + '(Day = the Desk calendar day, cedLabel().day; several days -> "Days a-b").',
      'Several CED topics -> consecutive runs "a-b", other runs joined " + "; no Day (e.g. "2.4-2.6 Follow-Along").',
      'Bonus (Beyond the Exam) topics inside a core column are dropped from the title (flagged).',
      'All-bonus column -> "Beyond the Exam: <label without the parenthetical>[ Day n] <Suffix>".',
      'Progress Check / Poster: "Unit <new unit> Progress Check" / "Unit <new unit> Poster" (unchanged).',
      'Plain ASCII only (hyphen "-", never an en dash) and never ", ": the sync finds a column by matching '
        + '", <title>" inside the gradebook cell aria-label, so a comma-space would let "3.3 Quiz" match "2.4, 3.3 Quiz".',
      'Every real column has a unique CED title (asserted at build time).',
      'schoologyColumn false = lesson-granularity topic key inside a combined worksheet; never a real column.',
    ],
    columns,
  };
}

const text = JSON.stringify(build(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n');
  if (current !== text) {
    console.error('data/ced-column-titles.json is stale: run node scripts/build-ced-column-titles.mjs');
    process.exit(1);
  }
  console.log('data/ced-column-titles.json is up to date');
} else {
  writeFileSync(OUTPUT, text);
  console.log('wrote data/ced-column-titles.json (' + Object.keys(JSON.parse(text).columns).length + ' columns)');
}

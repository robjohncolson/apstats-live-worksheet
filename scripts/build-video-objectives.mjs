#!/usr/bin/env node
// build-video-objectives.mjs — "what will we learn" per topic, in the video's words.
//
// Every follow-along worksheet opens with an objective-box whose bullets are the
// lesson video's own "What will you learn in this video?" list (the live-worksheet
// skill copies them from the video's Learning Objectives slide). This script
// harvests those bullets from the 69 worksheets and keys them by topic via
// data/lesson-schedule.json (unit + worksheetKey → topicKey), writing
//
//   data/video-objectives.json  { topics: { "1.2": { worksheet, objectives:[...] } } }
//
// Consumer: teacher-week.html (the weekly "what are we covering" view).
// Usage: node scripts/build-video-objectives.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schedule = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lesson-schedule.json'), 'utf8'));

function decodeEntities(s) {
  return s
    .replace(/<sub>(.*?)<\/sub>/g, '$1')
    .replace(/<sup>(.*?)<\/sup>/g, '^$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&alpha;/g, 'α').replace(/&beta;/g, 'β').replace(/&mu;/g, 'μ').replace(/&sigma;/g, 'σ')
    .replace(/&chi;/g, 'χ').replace(/&ne;/g, '≠').replace(/&le;/g, '≤').replace(/&ge;/g, '≥')
    .replace(/&plusmn;/g, '±').replace(/&times;/g, '×').replace(/&minus;/g, '−').replace(/&rarr;/g, '→')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Three worksheet generations exist:
//   1. <strong>Learning Objectives:</strong><ul><li>plain sentence</li>…   (most)
//   2. <strong>Learning Objective:</strong><ul><li><strong>CODE:</strong> sentence</li>…
//   3. <div><strong>Learning Objective (CODE):</strong> sentence</div>…
// All reduce to the plain sentences (codes stripped).
function objectivesFrom(html) {
  const box = html.match(/<div class=['"]objective-box['"]>([\s\S]*?)<\/div>\s*(?:<!--|<div class=['"](?:vocab-box|ti84-practice)['"])/);
  if (!box) return null;
  const inner = box[1];
  const list = inner.match(/<strong>Learning Objectives?:<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  let items = [];
  if (list) {
    items = [...list[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => decodeEntities(x[1]));
  } else {
    items = [...inner.matchAll(/<strong>Learning Objective[^<]*<\/strong>\s*([^<]+)/g)].map((x) => decodeEntities(x[1]));
  }
  items = items.map((t) => t.replace(/^(?:VAR|UNC|DAT)-\d+\.[A-Z]{1,2}:\s*/, '').trim()).filter(Boolean);
  return items.length ? items : null;
}

const topics = {};
const missing = [];
for (const lesson of Object.values(schedule.lessons)) {
  if (!lesson.worksheetKey) continue;
  const file = `u${lesson.unit}_lesson${lesson.worksheetKey}_live.html`;
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { missing.push(`${lesson.topicKey} (${file} not found)`); continue; }
  const objectives = objectivesFrom(fs.readFileSync(full, 'utf8'));
  if (!objectives) { missing.push(`${lesson.topicKey} (${file} has no Learning Objectives block)`); continue; }
  topics[lesson.topicKey] = { worksheet: file, objectives };
}

const out = {
  generatedBy: 'scripts/build-video-objectives.mjs',
  source: 'The Learning Objectives box at the top of each u{unit}_lesson{key}_live.html (= the video\'s "What will you learn" slide)',
  topics,
};
const OUT = path.join(ROOT, 'data', 'video-objectives.json');
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT}: ${Object.keys(topics).length} topics`);
if (missing.length) console.log('no objectives for:', missing.join('; '));

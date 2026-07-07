#!/usr/bin/env node
// build-lessons-index.mjs — generate lessons-index.json for the mobile launcher
// (ANDROID_PACKET_APP_SPEC §2). One clean, offline-ready entry per topic:
//   - worksheet/quiz URLs relativized to local bundled paths
//   - the local video file(s), parsed straight from the media dir's filenames
//     (topic "1.2" → files "1-2__<order>__<driveId>.mp4")
// Usage: node scripts/build-lessons-index.mjs [--out <path>] [--media <dir>]

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(REPO, arg('--out', 'lessons-index.json'));
const WS_BASE = 'https://robjohncolson.github.io/apstats-live-worksheet/';
const CR_BASE = 'https://robjohncolson.github.io/curriculum_render/';

const roadmap = JSON.parse(readFileSync(resolve(REPO, 'roadmap-data.json'), 'utf8'));
const lessons = roadmap.lessons || {};

// Fall 2026 CED crosswalk (EK-verified vs the 5 official unit guides). ADDITIVE:
// old id + video filenames are unchanged; each entry gains status ('core'|'bonus'),
// newUnit/newTopic/newLabel (core), or bonusUnit (bonus → greyed "Beyond the Exam").
const CW_PATH = resolve(REPO, '2026-crosswalk.json');
const crosswalk = existsSync(CW_PATH) ? (JSON.parse(readFileSync(CW_PATH, 'utf8')).map || {}) : {};

const mediaDir = arg('--media', existsSync(resolve(REPO, 'media-compressed')) ? 'media-compressed'
                 : existsSync(resolve(REPO, 'media')) ? 'media' : null);
const videoFiles = (mediaDir && existsSync(resolve(REPO, mediaDir)))
  ? readdirSync(resolve(REPO, mediaDir)).filter((f) => f.toLowerCase().endsWith('.mp4'))
  : [];

function videosFor(topicId) {
  const dash = topicId.replace('.', '-');                       // "1.2" → "1-2", "4.10" → "4-10"
  return videoFiles
    .filter((f) => f.startsWith(dash + '__'))
    .map((f) => ({ file: 'media/' + f, idx: (f.match(/__(\d+)__/) || [, 0])[1] | 0 }))
    .sort((a, b) => a.idx - b.idx)
    .map((v) => v.file);
}
const relWS = (url) => (typeof url === 'string' && url.startsWith(WS_BASE)) ? url.slice(WS_BASE.length) : (url || null);
// Link the EXPLICIT quiz file, not the directory: the Capacitor WebView server doesn't resolve
// a bare `quiz/?…` to `quiz/index.html` (it falls back to the root index.html → the launcher's
// own "could not load" error). `quiz/index.html?u=&l=` is an unambiguous file the server serves,
// and the cr quiz reads ?u/&l from location.search regardless of the path.
function quizLocal(url) {
  if (typeof url !== 'string' || !url.startsWith(CR_BASE)) return url || null;
  const rest = url.slice(CR_BASE.length);                       // "?u=8&l=2" | "page.html?x" | "" | "#h"
  return (rest === '' || rest[0] === '?' || rest[0] === '#') ? 'quiz/index.html' + rest : 'quiz/' + rest;
}
const lessonNum = (id) => parseInt(String(id).split('.')[1], 10) || 0;

const out = [];
for (const id of Object.keys(lessons)) {
  const L = lessons[id] || {};
  const u = L.urls || {};
  const cw = crosswalk[id] || { status: 'unmapped' };
  out.push({
    id,
    unit: parseInt(id, 10) || 0,
    label: L.topic || ('Topic ' + id),
    worksheet: relWS(u.worksheet),
    quiz: quizLocal(u.quiz),
    blooket: u.blooket || null,          // external Blooket URL (needs internet; baked from roadmap-data.json)
    videos: videosFor(id),
    ...cw,                               // Fall 2026 CED: status, newUnit/newTopic/newLabel | bonusUnit
  });
}
out.sort((a, b) => (a.unit - b.unit) || (lessonNum(a.id) - lessonNum(b.id)));

const withVideo = out.filter((l) => l.videos.length).length;
const core = out.filter((l) => l.status === 'core').length;
const bonus = out.filter((l) => l.status === 'bonus').length;
writeFileSync(OUT, JSON.stringify({ generatedAt: null, count: out.length, lessons: out }, null, 1));
console.log(`lessons-index.json → ${OUT}`);
console.log(`  ${out.length} lessons; ${withVideo} with local video; ${core} core / ${bonus} bonus (Fall 2026); media: ${mediaDir || 'none'}`);

#!/usr/bin/env node
// Bake the offline video inventory into the synchronous Desk calendar.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const deskPath = fileURLToPath(new URL('../ap_stats_roadmap_square_mode.html', import.meta.url));
const inventory = JSON.parse(readFileSync(new URL('../data/video-minutes.json', import.meta.url), 'utf8'));
const minutes = {};
for (const [topic, entry] of Object.entries(inventory.topics)) {
  if (!Number.isFinite(entry.minutes) || entry.minutes < 0) throw new Error('Invalid minutes: ' + topic);
  minutes[topic] = entry.minutes;
}
const desk = readFileSync(deskPath, 'utf8');
const newline = desk.includes('\r\n') ? '\r\n' : '\n';
const comment = '// GENERATED from data/video-minutes.json by scripts/build-video-minutes-const.mjs — do not hand-edit.';
const generated = comment + newline + 'const VIDEO_MINUTES = ' + JSON.stringify(minutes) + ';';
const anchor = /\/\/ GENERATED from data\/video-minutes\.json by scripts\/build-video-minutes-const\.mjs[^\r\n]*\r?\nconst VIDEO_MINUTES = \{[^\r\n]*\};/g;
const matches = [...desk.matchAll(anchor)];
if (matches.length !== 1) throw new Error('Expected exactly one generated VIDEO_MINUTES anchor');
const output = desk.replace(anchor, () => generated);
if (process.argv.includes('--check')) {
  if (output !== desk) throw new Error('VIDEO_MINUTES drift: run node scripts/build-video-minutes-const.mjs');
  console.log('VIDEO_MINUTES matches data/video-minutes.json (' + Object.keys(minutes).length + ' topics)');
} else {
  if (output !== desk) writeFileSync(deskPath, output);
  console.log('VIDEO_MINUTES updated (' + Object.keys(minutes).length + ' topics)');
}

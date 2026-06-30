#!/usr/bin/env node
// build-video-catalog.mjs — generate video-catalog.json for the Google Play build
// (ANDROID_PHASE5_PLAY_SPEC §2). VideoOnDemand downloads videos per-unit on demand;
// this catalog tells it WHAT exists, each video's unit, and the storage key (= the
// filename the app downloads from MEDIA_BASE_URL/<file>).
//
// Source: media/media-manifest.json (byUrl: lessonUrl -> {topic, file}), produced by
// fetch-offline-videos.mjs. Deduped by file. `bytes` from media-compressed/<file>
// when present (so the UI can show a download size). The lessons-index references a
// video as 'media/<name>.mp4', so the catalog `url` matches that ref and `file` is
// the bare basename (the storage key + the path on the host).
//
// Usage: node scripts/build-video-catalog.mjs [--out <path>] [--manifest <path>]

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; };

const manifestPath = resolve(REPO, arg('--manifest', 'media/media-manifest.json'));
const outPath = resolve(REPO, arg('--out', 'video-catalog.json'));
const compressedDir = resolve(REPO, 'media-compressed');

// Pure: media-manifest byUrl -> deduped catalog entries. Exported for tests.
export function buildCatalog(manifest, sizeOf = () => null) {
  const byUrl = (manifest && manifest.byUrl) || {};
  const byFile = new Map();
  for (const url of Object.keys(byUrl)) {
    const v = byUrl[url] || {};
    if (!v.file) continue;
    const file = basename(v.file);                 // 'media/1-1__0__x.mp4' -> '1-1__0__x.mp4'
    if (byFile.has(file)) continue;                // dedup (multiple urls -> same file)
    const topic = String(v.topic || '');
    const unitMatch = topic.match(/^(\d+)/);
    byFile.set(file, {
      url: v.file,                                  // the lessons-index ref ('media/<name>.mp4')
      file,                                          // storage key + host path basename
      unit: unitMatch ? Number(unitMatch[1]) : 0,
      label: topic || file,
      bytes: sizeOf(file),
    });
  }
  return Array.from(byFile.values()).sort((a, b) => (a.unit - b.unit) || a.file.localeCompare(b.file));
}

function main() {
  if (!existsSync(manifestPath)) {
    console.warn(`⚠ ${manifestPath} not found — writing an EMPTY catalog. Run fetch-offline-videos.mjs first (and re-run) for the Play build to serve video.`);
    writeFileSync(outPath, JSON.stringify({ schema: 'apstats-video-catalog/v1', generatedAt: 0, videos: [] }, null, 0));
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sizeOf = (file) => {
    const p = resolve(compressedDir, file);
    try { return existsSync(p) ? statSync(p).size : null; } catch (_) { return null; }
  };
  const videos = buildCatalog(manifest, sizeOf);
  const totalBytes = videos.reduce((n, v) => n + (v.bytes || 0), 0);
  writeFileSync(outPath, JSON.stringify({ schema: 'apstats-video-catalog/v1', generatedAt: 0, videos }, null, 0));
  console.log(`build-video-catalog → ${outPath}: ${videos.length} videos across units ${[...new Set(videos.map((v) => v.unit))].sort((a, b) => a - b).join(',')}` + (totalBytes ? ` (~${(totalBytes / 1e6).toFixed(0)} MB sized)` : ' (sizes unknown — media-compressed/ absent)'));
}

if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) main();

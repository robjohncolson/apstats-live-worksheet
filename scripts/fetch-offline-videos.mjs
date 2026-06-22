#!/usr/bin/env node
// fetch-offline-videos.mjs — acquire the lesson videos for the offline pack.
// OFFLINE_MODE_SPEC §4.H (Phase 1b). TEACHER-RUN, ONLINE, one-time (resumable).
//
// Source: every lesson in the Desk's RESOURCES has an `altUrl` pointing at the
// teacher's own Google-Drive copy of the apclassroom video (~144 unique files),
// plus 1 YouTube link. This downloads them (the teacher's own files, under the
// teacher's session) into media/ and writes media-manifest.json mapping BOTH the
// apclassroom url and the Drive altUrl -> the local file. The future offline
// playback resolver looks a video up by either URL and plays the local copy.
//
// Downloads use yt-dlp (handles Drive confirm-tokens + YouTube + resume). Install
// once: https://github.com/yt-dlp/yt-dlp/releases (a single yt-dlp.exe on Windows),
// or `pip install -U yt-dlp` / `winget install yt-dlp` / `scoop install yt-dlp`.
//
// Usage:
//   node scripts/fetch-offline-videos.mjs --dry-run        # plan only, no downloads
//   node scripts/fetch-offline-videos.mjs --limit 3        # smoke test (first 3)
//   node scripts/fetch-offline-videos.mjs --unit 1         # only Unit 1 (topics 1-*)
//   node scripts/fetch-offline-videos.mjs                  # full pull (GBs; resumable)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = resolve(REPO, 'ap_stats_roadmap_square_mode.html');

// ── Pure extractor (unit-tested) ──────────────────────────────────────────────

// Brace-match the `const RESOURCES = { ... }` object so we only parse video data.
function sliceResources(html) {
  const start = html.indexOf('const RESOURCES');
  if (start < 0) return '';
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return html.slice(open, i + 1); }
  }
  return html.slice(open);
}

function classify(altUrl) {
  if (!altUrl) return { source: 'none', id: null };
  let m = altUrl.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/) || altUrl.match(/drive\.google\.com\/(?:open|uc)\?(?:export=download&)?id=([A-Za-z0-9_-]+)/);
  if (m) return { source: 'drive', id: m[1] };
  m = altUrl.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]+)/);
  if (m) return { source: 'youtube', id: m[1] };
  return { source: 'other', id: null };
}

// Returns [{ topic, idx, url, altUrl, source, id, key }] in document order.
export function extractVideos(html) {
  const block = sliceResources(html);
  const out = [];
  // Locate each topic key ("1-1": {) so a video can be attributed to its topic.
  const topics = [];
  const topicRe = /"(\d+(?:-\d+)?(?:\.\w+)?)"\s*:\s*\{/g;
  let tm;
  while ((tm = topicRe.exec(block)) !== null) topics.push({ key: tm[1], at: tm.index });
  const topicAt = (pos) => {
    let cur = null;
    for (const t of topics) { if (t.at <= pos) cur = t.key; else break; }
    return cur;
  };
  const perTopicCount = {};
  const videoRe = /\{\s*url:\s*"([^"]+)"\s*(?:,\s*altUrl:\s*"([^"]*)")?\s*\}/g;
  let vm;
  while ((vm = videoRe.exec(block)) !== null) {
    const url = vm[1];
    const altUrl = vm[2] || '';
    // Only entries that actually look like lesson videos.
    if (!/apclassroom|drive\.google|youtu/.test(url + ' ' + altUrl)) continue;
    const topic = topicAt(vm.index) || 'unknown';
    const idx = (perTopicCount[topic] = (perTopicCount[topic] || 0) + 1) - 1;
    const c = classify(altUrl);
    out.push({ topic, idx, url, altUrl, source: c.source, id: c.id, key: `${topic}__${idx}__${c.id || 'na'}` });
  }
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = { dryRun: false, limit: 0, unit: null, out: 'media' };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--dry-run') a.dryRun = true;
    else if (t === '--limit') a.limit = parseInt(argv[++i], 10) || 0;
    else if (t === '--unit') a.unit = String(argv[++i]).replace(/^U/i, '');
    else if (t === '--out') a.out = argv[++i];
  }
  return a;
}

function haveYtDlp() {
  try { return spawnSync('yt-dlp', ['--version'], { encoding: 'utf8' }).status === 0; }
  catch (_) { return false; }
}

function findDownloaded(outDir, key) {
  if (!existsSync(outDir)) return null;
  const hit = readdirSync(outDir).find((f) => f.startsWith(key + '.') && statSync(resolve(outDir, f)).size > 0);
  return hit ? `${basename(outDir)}/${hit}` : null;
}

function downloadUrl(entry, outDir) {
  // yt-dlp handles Drive confirm-tokens + YouTube; --continue/--no-overwrites = resumable + idempotent.
  const target = entry.source === 'youtube'
    ? `https://www.youtube.com/watch?v=${entry.id}`
    : `https://drive.google.com/file/d/${entry.id}/view`;
  const r = spawnSync('yt-dlp', [
    '--no-overwrites', '--continue', '--no-part',
    '--download-archive', resolve(outDir, '.downloaded.txt'),
    '-o', resolve(outDir, `${entry.key}.%(ext)s`),
    target,
  ], { stdio: 'inherit' });
  return r.status === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(REPO, args.out);
  let entries = extractVideos(readFileSync(DESK, 'utf8'));

  if (args.unit) entries = entries.filter((e) => e.topic.split('-')[0] === args.unit);
  const downloadable = entries.filter((e) => e.source === 'drive' || e.source === 'youtube');
  const planned = args.limit ? downloadable.slice(0, args.limit) : downloadable;

  const bySource = entries.reduce((m, e) => ((m[e.source] = (m[e.source] || 0) + 1), m), {});
  console.log(`Found ${entries.length} video entries:`, bySource);
  console.log(`Downloadable: ${downloadable.length}; planned this run: ${planned.length}${args.dryRun ? ' (DRY RUN)' : ''}`);

  const manifest = { schema: 'apstats-offline-media/v1', generatedAt: new Date().toISOString(), byUrl: {}, gaps: [] };
  const addManifest = (e, file) => {
    const rec = { topic: e.topic, idx: e.idx, source: e.source, file };
    manifest.byUrl[e.url] = rec;
    if (e.altUrl) manifest.byUrl[e.altUrl] = rec;
  };

  if (args.dryRun) {
    for (const e of planned) addManifest(e, null);
    for (const e of entries.filter((x) => x.source === 'other' || x.source === 'none')) manifest.gaps.push({ topic: e.topic, url: e.url, reason: 'no downloadable source' });
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'media-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Wrote plan to ${args.out}/media-manifest.json (no files downloaded).`);
    return;
  }

  if (!haveYtDlp()) {
    console.error('\nyt-dlp not found on PATH. Install it (one-time), then re-run:');
    console.error('  Windows: winget install yt-dlp   (or download yt-dlp.exe from the releases page)');
    console.error('  pip:     pip install -U yt-dlp');
    process.exit(2);
  }
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let ok = 0, failed = 0, totalBytes = 0;
  for (let i = 0; i < planned.length; i += 1) {
    const e = planned[i];
    let file = findDownloaded(outDir, e.key);
    if (file) { console.log(`[${i + 1}/${planned.length}] ${e.key} — already present, skipping`); }
    else {
      console.log(`[${i + 1}/${planned.length}] ${e.topic} #${e.idx} (${e.source}) -> ${e.key}`);
      const success = downloadUrl(e, outDir);
      file = success ? findDownloaded(outDir, e.key) : null;
    }
    if (file) { ok += 1; addManifest(e, file); try { totalBytes += statSync(resolve(REPO, file)).size; } catch (_) {} }
    else { failed += 1; manifest.gaps.push({ topic: e.topic, url: e.url, altUrl: e.altUrl, reason: 'download failed' }); }
  }

  writeFileSync(resolve(outDir, 'media-manifest.json'), JSON.stringify(manifest, null, 2));
  const gb = (totalBytes / 1e9).toFixed(2);
  console.log(`\nDone. ${ok} ok, ${failed} failed/gap. Pack media ~= ${gb} GB. Manifest: ${args.out}/media-manifest.json`);
  if (failed) console.log('Re-run to retry gaps (already-downloaded files are skipped).');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();

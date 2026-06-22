#!/usr/bin/env node
// fetch-offline-videos.mjs — acquire the lesson videos for the offline pack.
// OFFLINE_MODE_SPEC §4.H (Phase 1b). TEACHER-RUN, ONLINE, one-time (resumable).
//
// Source: every lesson carries a Google-Drive `altUrl` (the teacher's own / link-
// shared copy of the apclassroom video). The SAME 144 files are referenced from
// both the Desk (ap_stats_roadmap_square_mode.html RESOURCES) and the quiz app
// (../curriculum_render/data/units.js). We download those Drive copies DIRECTLY
// in pure Node (no yt-dlp needed) into media/ and write media-manifest.json
// mapping each in-page url + altUrl → the local file, which offline-video.js uses
// to play the local copy offline.
//
// Pure-Node Google Drive download handles the large-file "confirm" interstitial
// (the drive.usercontent.google.com download form). Link-shared / owned files only.
// (A lesson whose only alt is a YouTube link can't be fetched this way → reported
// as a gap; it falls back to the transcript.)
//
// Resumable: a per-id ledger (media/.downloaded.json) skips finished files; an
// interrupted file is a .part and is re-fetched cleanly.
//
// Usage:
//   node scripts/fetch-offline-videos.mjs --dry-run        # plan only, no downloads
//   node scripts/fetch-offline-videos.mjs --limit 3        # smoke (first 3)
//   node scripts/fetch-offline-videos.mjs --unit 1         # only Unit 1
//   node scripts/fetch-offline-videos.mjs                  # full pull (GBs; resumable)

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, createWriteStream, renameSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = resolve(REPO, 'ap_stats_roadmap_square_mode.html');
const CR_UNITS = resolve(REPO, '..', 'curriculum_render', 'data', 'units.js');
const UA = 'Mozilla/5.0 (offline-pack builder) AppleWebKit/537.36';

// ── Pure extractor (unit-tested) ──────────────────────────────────────────────

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

// Returns [{ topic, idx, url, altUrl, source, id, key }] from the Desk RESOURCES.
export function extractVideos(html) {
  const block = sliceResources(html);
  const out = [];
  const topics = [];
  const topicRe = /"(\d+(?:-\d+)?(?:\.\w+)?)"\s*:\s*\{/g;
  let tm;
  while ((tm = topicRe.exec(block)) !== null) topics.push({ key: tm[1], at: tm.index });
  const topicAt = (pos) => { let cur = null; for (const t of topics) { if (t.at <= pos) cur = t.key; else break; } return cur; };
  const perTopic = {};
  const videoRe = /\{\s*url:\s*"([^"]+)"\s*(?:,\s*altUrl:\s*"([^"]*)")?\s*\}/g;
  let vm;
  while ((vm = videoRe.exec(block)) !== null) {
    const url = vm[1], altUrl = vm[2] || '';
    if (!/apclassroom|drive\.google|youtu/.test(url + ' ' + altUrl)) continue;
    const topic = topicAt(vm.index) || 'unknown';
    const idx = (perTopic[topic] = (perTopic[topic] || 0) + 1) - 1;
    const c = classify(altUrl);
    out.push({ topic, idx, url, altUrl, source: c.source, id: c.id, key: `${topic}__${idx}__${c.id || 'na'}` });
  }
  return out;
}

// All unique Drive file IDs in any text (used to union-check the cr quiz app).
export function extractDriveIds(text) {
  const ids = new Set();
  const re = /drive\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:export=download&)?id=)([A-Za-z0-9_-]{20,})/g;
  let m; while ((m = re.exec(text)) !== null) ids.add(m[1]);
  return [...ids];
}

// ── Pure Google Drive download helpers (unit-tested) ──────────────────────────

function decodeEntities(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// From the Drive "can't scan for viruses" interstitial HTML, build the real
// download URL on drive.usercontent.google.com. Returns a URL string or null.
export function parseDriveConfirm(html, id) {
  const actionM = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download[^"]*)"/);
  if (actionM) {
    const action = decodeEntities(actionM[1]);
    const params = {};
    let m;
    const re1 = /<input[^>]*\btype="hidden"[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/g;
    while ((m = re1.exec(html)) !== null) params[m[1]] = decodeEntities(m[2]);
    const re2 = /<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"[^>]*\btype="hidden"/g;
    while ((m = re2.exec(html)) !== null) if (!(m[1] in params)) params[m[1]] = decodeEntities(m[2]);
    if (!params.id) params.id = id;
    if (!params.export) params.export = 'download';
    const qs = Object.keys(params).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    return action + '?' + qs;
  }
  const tok = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/);
  if (tok) return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=${tok[1]}`;
  return null;
}

function extFromHeaders(res) {
  const cd = res.headers.get('content-disposition') || '';
  const fn = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (fn) { const e = (fn[1].match(/\.([A-Za-z0-9]{2,5})$/) || [])[1]; if (e) return '.' + e.toLowerCase(); }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('mp4')) return '.mp4';
  if (ct.includes('webm')) return '.webm';
  if (ct.includes('matroska')) return '.mkv';
  if (ct.includes('quicktime')) return '.mov';
  return '.mp4';
}

async function driveResponse(id) {
  let res = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html')) return res; // small file → direct
  const url2 = parseDriveConfirm(await res.text(), id);
  if (!url2) throw new Error('private/quota or unparseable confirm page');
  res = await fetch(url2, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if ((res.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error('still HTML after confirm (private/quota?)');
  return res;
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

function loadLedger(outDir) {
  const p = resolve(outDir, '.downloaded.json');
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch (_) { return {}; }
}
function saveLedger(outDir, led) {
  try { writeFileSync(resolve(outDir, '.downloaded.json'), JSON.stringify(led, null, 2)); } catch (_) {}
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(REPO, args.out);

  let entries = extractVideos(readFileSync(DESK, 'utf8'));
  if (args.unit) entries = entries.filter((e) => e.topic.split('-')[0] === args.unit);

  // Union-check the quiz app: every cr Drive id should already be in the Desk set.
  if (existsSync(CR_UNITS)) {
    const deskIds = new Set(entries.filter((e) => e.source === 'drive').map((e) => e.id));
    const crOnly = extractDriveIds(readFileSync(CR_UNITS, 'utf8')).filter((id) => !deskIds.has(id));
    if (crOnly.length && !args.unit) console.log(`Note: ${crOnly.length} Drive id(s) in the quiz app are not in the Desk set (not downloaded here): ${crOnly.slice(0, 3).join(', ')}…`);
  }

  const drive = entries.filter((e) => e.source === 'drive');
  const planned = args.limit ? drive.slice(0, args.limit) : drive;
  const bySource = entries.reduce((m, e) => ((m[e.source] = (m[e.source] || 0) + 1), m), {});
  console.log(`Found ${entries.length} video entries:`, bySource);
  console.log(`Drive (downloadable): ${drive.length}; planned this run: ${planned.length}${args.dryRun ? ' (DRY RUN)' : ''}`);
  const nonDrive = entries.filter((e) => e.source !== 'drive');
  if (nonDrive.length) console.log(`${nonDrive.length} non-Drive (e.g. YouTube) entr(y/ies) → transcript fallback, not downloaded.`);

  const manifest = { schema: 'apstats-offline-media/v1', generatedAt: new Date().toISOString(), byUrl: {}, gaps: [] };
  const addManifest = (e, file) => { const rec = { topic: e.topic, idx: e.idx, source: e.source, file }; manifest.byUrl[e.url] = rec; if (e.altUrl) manifest.byUrl[e.altUrl] = rec; };

  if (args.dryRun) {
    for (const e of planned) addManifest(e, null);
    for (const e of nonDrive) manifest.gaps.push({ topic: e.topic, url: e.url, altUrl: e.altUrl, reason: 'no Drive alt (transcript fallback)' });
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'media-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Wrote plan to ${args.out}/media-manifest.json (no files downloaded).`);
    return;
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const ledger = loadLedger(outDir);

  // download once per unique Drive id; map every url/altUrl that shares it
  const byId = new Map();
  for (const e of planned) { if (!byId.has(e.id)) byId.set(e.id, []); byId.get(e.id).push(e); }

  let ok = 0, failed = 0, skipped = 0, bytes = 0;
  let n = 0; const total = byId.size;
  for (const [id, group] of byId) {
    n += 1;
    const e0 = group[0];
    const done = ledger[id];
    if (done && existsSync(resolve(outDir, done))) {
      group.forEach((e) => addManifest(e, 'media/' + done)); skipped += 1; ok += 1;
      console.log(`[${n}/${total}] ${e0.key} — already downloaded, skipping`);
      try { bytes += statSync(resolve(outDir, done)).size; } catch (_) {}
      continue;
    }
    process.stdout.write(`[${n}/${total}] ${e0.topic} #${e0.idx} (drive ${id}) … `);
    try {
      const res = await driveResponse(id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ext = extFromHeaders(res);
      const name = `${e0.topic}__${e0.idx}__${id}${ext}`;
      const part = resolve(outDir, name + '.part');
      await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
      renameSync(part, resolve(outDir, name));
      ledger[id] = name; saveLedger(outDir, ledger);
      group.forEach((e) => addManifest(e, 'media/' + name));
      const sz = statSync(resolve(outDir, name)).size; bytes += sz; ok += 1;
      console.log(`ok (${(sz / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      failed += 1;
      group.forEach((e) => manifest.gaps.push({ topic: e.topic, url: e.url, altUrl: e.altUrl, reason: 'download failed: ' + (err && err.message) }));
      try { rmSync(resolve(outDir, `${e0.topic}__${e0.idx}__${id}${'.mp4'}.part`), { force: true }); } catch (_) {}
      console.log('FAILED: ' + (err && err.message));
    }
  }
  for (const e of nonDrive) manifest.gaps.push({ topic: e.topic, url: e.url, altUrl: e.altUrl, reason: 'no Drive alt (transcript fallback)' });
  writeFileSync(resolve(outDir, 'media-manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nDone. ${ok} ok (${skipped} already present), ${failed} failed. Pack media ~= ${(bytes / 1e9).toFixed(2)} GB.`);
  console.log(`Manifest: ${args.out}/media-manifest.json`);
  if (failed) console.log('Re-run to retry failures (finished files are skipped).');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();

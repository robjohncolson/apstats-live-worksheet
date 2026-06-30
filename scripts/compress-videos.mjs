#!/usr/bin/env node
// compress-videos.mjs — one-time batch transcode of the offline lesson videos to
// H.264 CRF 23 (MAXIMUM COMPATIBILITY: hardware-decoded on every Android/iOS device).
//
// The source videos are CollegeBoard slide screen-recordings with a tiny talking-head
// corner — nearly static, and hugely over-bitrated (~2.5 Mbps for content that needs
// ~150 kbps). A measured test re-encode shrank a 9-min lesson 187.6 MB → 10.3 MB
// (−94.5%) with a pixel-for-pixel-identical frame. Across the library that's roughly
// 25 GB → ~1.5 GB — small enough to bundle the WHOLE course into one Capacitor APK.
//
// The source media/ tree is the MASTER and is left untouched; output goes to
// media-compressed/ with the SAME filenames so media-manifest.json still maps lesson →
// file (just repoint the offline pipeline at media-compressed/). Both are gitignored.
//
// Resumable: a finished output is skipped, and an interrupted file leaves a *.part.mp4
// that is re-done on the next run (never a truncated final). Usage:
//   node scripts/compress-videos.mjs            # all of media/ → media-compressed/
//   node scripts/compress-videos.mjs --src X --out Y --crf 23

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

const SRC = arg('--src', 'media');
const OUT = arg('--out', 'media-compressed');
const CRF = arg('--crf', '23');
const PRESET = arg('--preset', 'veryfast');   // veryfast ≈ 7× realtime; the size win is already ~95%, so a
                                              // slower preset buys ~10% on already-tiny files — not worth the hours.

if (!fs.existsSync(SRC)) { console.error(`no source dir: ${SRC}`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.mp4')).sort();
if (!files.length) { console.error(`no .mp4 files in ${SRC}`); process.exit(1); }

let done = 0, skipped = 0, failed = 0, srcBytes = 0, outBytes = 0;
const failedNames = [];
const t0 = Date.now();
console.log(`Transcoding ${files.length} videos: ${SRC}/ → ${OUT}/  (H.264 CRF ${CRF}, preset ${PRESET})\n`);

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const inP = path.join(SRC, f);
  const outP = path.join(OUT, f);
  const sBytes = fs.statSync(inP).size;
  srcBytes += sBytes;
  const tag = `[${i + 1}/${files.length}]`;

  if (fs.existsSync(outP) && fs.statSync(outP).size > 0) {
    outBytes += fs.statSync(outP).size;
    skipped++;
    console.log(`${tag} skip ${f} (already done)`);
    continue;
  }

  const tmp = outP + '.part.mp4';
  console.log(`${tag} ${f}  (${(sBytes / 1e6).toFixed(0)} MB) …`);
  const r = spawnSync('ffmpeg', [
    '-y', '-nostdin', '-i', inP,
    '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',          // moov atom up front → plays/streams in a WebView without full download
    '-v', 'error', '-nostats', tmp,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });

  if (r.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
    fs.renameSync(tmp, outP);
    const oBytes = fs.statSync(outP).size;
    outBytes += oBytes;
    done++;
    console.log(`        → ${(oBytes / 1e6).toFixed(1)} MB  (−${(100 * (1 - oBytes / sBytes)).toFixed(1)}%)`);
  } else {
    failed++;
    failedNames.push(f);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    console.error(`        ✗ FAILED (ffmpeg exit ${r.status})`);
  }
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n── DONE in ${mins} min — ${done} transcoded, ${skipped} skipped, ${failed} failed`);
console.log(`   source ${(srcBytes / 1e9).toFixed(2)} GB → output ${(outBytes / 1e9).toFixed(2)} GB  (−${(100 * (1 - outBytes / srcBytes)).toFixed(1)}%)`);
if (failedNames.length) console.log(`   failed: ${failedNames.join(', ')}`);
process.exit(failed ? 1 : 0);

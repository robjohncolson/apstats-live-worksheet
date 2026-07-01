#!/usr/bin/env node
// upload-r2.mjs — push media-compressed/*.mp4 to the Cloudflare R2 bucket that
// serves the Google-Play on-demand video (ANDROID_PHASE5_PLAY_SPEC §3). Also sets a
// permissive GET CORS policy so the in-app fetch works.
//
// CREDENTIALS never go through anything but a LOCAL, gitignored file. Create
// `.r2.env` at the repo root (see .r2.env.example) with:
//     R2_ACCESS_KEY_ID=...
//     R2_SECRET_ACCESS_KEY=...
// (from an R2 API token — "Object Read & Write"). Endpoint + bucket are baked (not
// secret); override with R2_ENDPOINT / R2_BUCKET if they differ.
//
// Usage:
//   node scripts/upload-r2.mjs            # set CORS, then upload (skips files already there)
//   node scripts/upload-r2.mjs --force    # re-upload everything
//   node scripts/upload-r2.mjs --cors-only

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = resolve(REPO, 'media-compressed');
const DEFAULT_ENDPOINT = 'https://e6c057c6ab5a5845b39d233735c83ec1.r2.cloudflarestorage.com';
const DEFAULT_BUCKET = 'apstats';
const CONCURRENCY = 4;

function loadCreds() {
  const env = { ...process.env };
  const envFile = resolve(REPO, '.r2.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.error('✖ Missing R2 credentials. Create .r2.env at the repo root with:\n    R2_ACCESS_KEY_ID=...\n    R2_SECRET_ACCESS_KEY=...\n  (from an R2 API token with Object Read & Write). Your secret stays in that local, gitignored file.');
    process.exit(2);
  }
  return {
    accessKeyId, secretAccessKey,
    endpoint: (env.R2_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/$/, ''),
    bucket: env.R2_BUCKET || DEFAULT_BUCKET,
  };
}

const CORS_XML = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<CORSConfiguration><CORSRule>'
  + '<AllowedOrigin>*</AllowedOrigin>'
  + '<AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>'
  + '<AllowedHeader>*</AllowedHeader>'
  + '<ExposeHeader>Content-Length</ExposeHeader><ExposeHeader>Content-Range</ExposeHeader>'
  + '<MaxAgeSeconds>3600</MaxAgeSeconds>'
  + '</CORSRule></CORSConfiguration>';

async function setCors(aws, base) {
  const md5 = createHash('md5').update(CORS_XML).digest('base64');
  const res = await aws.fetch(`${base}?cors`, { method: 'PUT', body: CORS_XML, headers: { 'Content-Type': 'text/xml', 'Content-MD5': md5 } });
  if (res.ok) { console.log('✓ CORS policy set (GET/HEAD, any origin).'); return true; }
  const body = await res.text().catch(() => '');
  console.warn(`⚠ Could not set CORS via API (HTTP ${res.status}). Set it in the R2 dashboard (bucket → Settings → CORS) with:\n${body.slice(0, 300)}`);
  return false;
}

async function head(aws, url) {
  try { const r = await aws.fetch(url, { method: 'HEAD' }); return r.status; } catch (_) { return 0; }
}

async function main() {
  const force = process.argv.includes('--force');
  const corsOnly = process.argv.includes('--cors-only');
  const { accessKeyId, secretAccessKey, endpoint, bucket } = loadCreds();
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' });
  const base = `${endpoint}/${bucket}`;

  await setCors(aws, base);
  if (corsOnly) return;

  if (!existsSync(MEDIA)) { console.error(`✖ ${MEDIA} not found. Run scripts/compress-videos.mjs first.`); process.exit(2); }
  const files = readdirSync(MEDIA).filter((f) => f.toLowerCase().endsWith('.mp4'));
  const totalBytes = files.reduce((n, f) => n + statSync(resolve(MEDIA, f)).size, 0);
  console.log(`Uploading ${files.length} videos (~${(totalBytes / 1e6).toFixed(0)} MB) → ${base}/  [concurrency ${CONCURRENCY}${force ? ', --force' : ', resumable'}]`);

  let done = 0, uploaded = 0, skipped = 0, failed = 0;
  const queue = files.slice();
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      const url = `${base}/${encodeURIComponent(f)}`;
      try {
        if (!force && (await head(aws, url)) === 200) { skipped += 1; }
        else {
          const body = readFileSync(resolve(MEDIA, f));
          const res = await aws.fetch(url, { method: 'PUT', body, headers: { 'Content-Type': 'video/mp4' } });
          if (res.ok) uploaded += 1; else { failed += 1; console.warn(`  ✖ ${f}: HTTP ${res.status}`); }
        }
      } catch (e) { failed += 1; console.warn(`  ✖ ${f}: ${e.message}`); }
      done += 1;
      if (done % 10 === 0 || done === files.length) console.log(`  … ${done}/${files.length} (${uploaded} up, ${skipped} skip, ${failed} fail)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone: ${uploaded} uploaded, ${skipped} already present, ${failed} failed.`);
  if (failed) process.exit(1);
  console.log('Next: rebuild the AAB → node scripts/build-android.mjs --play --media-base "<your pub-*.r2.dev URL>"');
}

main().catch((e) => { console.error('upload-r2 error:', e.message); process.exit(1); });

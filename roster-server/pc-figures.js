// pc-figures.js — sign short-lived URLs for the CB-secure PC26 figures
// (PC_FIGURES_INTEGRATION_SPEC.md, D1-a). The figures live in a PRIVATE Supabase
// bucket in a DIFFERENT project than roster's own DB, so this uses its OWN client
// (PC_FIGURES_SUPABASE_URL + PC_FIGURES_SUPABASE_SERVICE_KEY). The token-gated,
// server-authoritative GET /pc/:unit/:part attaches the signed URLs to each item
// → the CollegeBoard figures stay behind the class gate, no service key on the
// client. Degrades gracefully (null signer / per-file sign failure → item ships
// without that figure → cr falls back to the [Figure: …] text).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Long-ish window: openPc re-signs on each online open (network-first), so this
// only has to survive an offline PC sitting after the last online fetch. The
// figure is low-sensitivity behind the per-student unlock gate. Tunable.
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function resolveFiguresManifestPath() {
  if (process.env.PC_FIGURES_MANIFEST_PATH) return process.env.PC_FIGURES_MANIFEST_PATH;
  // Railway deploys with Root Directory = roster-server → only ./data ships; the
  // repo-root ../data is the local-dev fallback.
  const bundled = resolve(__dirname, 'data', 'pc-figures-manifest.json');
  if (existsSync(bundled)) return bundled;
  return resolve(__dirname, '..', 'data', 'pc-figures-manifest.json');
}

function loadFiguresManifest() {
  try {
    return JSON.parse(readFileSync(resolveFiguresManifestPath(), 'utf8'));
  } catch (_) {
    return null;
  }
}

// createFiguresSigner(client, manifest, opts) → { signForItems(itemIds[]) }
// signForItems returns { [itemId]: { stems:[url0,url1,…], choices:{A:url,…} } }
// for the items that HAVE figures — one BATCHED createSignedUrls call per request.
export function createFiguresSigner(client, manifest, { expiresIn = DEFAULT_TTL_SECONDS } = {}) {
  const bucket = (manifest && manifest.bucket) || 'pc-figures';
  const items = (manifest && manifest.items) || {};

  async function signForItems(itemIds) {
    if (!client || !Array.isArray(itemIds) || !itemIds.length) return {};
    // Collect every (itemId, kind, slot) that the manifest says exists.
    const slots = []; // { itemId, kind:'stem'|'choice', slot, path }
    for (const itemId of itemIds) {
      const entry = items[itemId];
      if (!entry) continue;
      (entry.stems || []).forEach((s) => slots.push({ itemId, kind: 'stem', slot: String(s), path: itemId + '_' + s + '.png' }));
      (entry.choices || []).forEach((c) => slots.push({ itemId, kind: 'choice', slot: String(c), path: itemId + '_' + c + '.png' }));
    }
    if (!slots.length) return {};

    const paths = slots.map((x) => x.path);
    let data = null;
    try {
      const res = await client.storage.from(bucket).createSignedUrls(paths, expiresIn);
      if (res.error || !Array.isArray(res.data)) return {};
      data = res.data;
    } catch (_) {
      return {};
    }

    // Per-entry: a single missing file fails only that slot, not its siblings.
    const byPath = {};
    data.forEach((d) => { if (d && d.signedUrl && !d.error) byPath[d.path] = d.signedUrl; });

    const out = {};
    for (const x of slots) {
      const url = byPath[x.path];
      if (!url) continue;
      const o = out[x.itemId] || (out[x.itemId] = { stems: [], choices: {} });
      if (x.kind === 'stem') o.stems.push(url); // pushed in manifest slot order (0,1,2)
      else o.choices[x.slot] = url;
    }
    return out;
  }

  return { signForItems };
}

// Live factory — null when the pc-figures Supabase env isn't configured, so the
// PC delivery still boots (figures just don't render). Mirrors createLivePcDb.
export function createLiveFiguresSigner() {
  const url = process.env.PC_FIGURES_SUPABASE_URL;          // https://bzqbhtrurzzavhqbgqrs.supabase.co
  const key = process.env.PC_FIGURES_SUPABASE_SERVICE_KEY;  // service-role key of that project (bucket is PRIVATE)
  if (!url || !key) return null;
  const manifest = loadFiguresManifest();
  if (!manifest) return null;
  return createFiguresSigner(createClient(url, key), manifest);
}

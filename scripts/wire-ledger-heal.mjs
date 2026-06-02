/**
 * scripts/wire-ledger-heal.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of the LEDGER_HEAL_BUILD.md Part-A heal
 * block to every u*_lesson*_live.html. Inserts AFTER the hydration-trigger IIFE
 * (wired earlier by scripts/wire-hydration.mjs) so hydration is guaranteed
 * present + runs first.
 *
 * The heal re-records locally-answered blanks that are MISSING from (or unscored
 * in) the ledger, reusing the worksheet's own recordBlankToGradebook (correct
 * scoring via checkAnswer) + gradebookClient.fetchPrior (dedup). This is what
 * makes a worksheet's real correctness reach the ledger when the original write
 * was dropped (signed-out, failed-open wall, prior identity, or null score), so
 * Cws — and the coach + day modal + resource-panel chip — show the real grade.
 *
 * Mirrors scripts/wire-hydration.mjs in shape: per-file native EOL detect +
 * re-emit; idempotency via MARKERS (all present = SKIP, some = FAIL half-wired,
 * none = wire); anchor occurrence must be exactly 1 or the file is REPORTED.
 *
 * Usage:
 *   node scripts/wire-ledger-heal.mjs            # dry-run report
 *   node scripts/wire-ledger-heal.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// Fully-wired = BOTH markers. All present → SKIP. Some → FAIL (half-wired). None → wire.
const MARKERS = [
  'async function healLocalAnswersToLedger',
  'function _kickHeal',
];

// Anchor: the hydration-trigger IIFE injected by scripts/wire-hydration.mjs —
// byte-for-byte. Authored with \n; re-emitted in each file's native EOL.
const ANCHOR_LF =
`        // Hydration trigger: fire on DOMContentLoaded + on any roster-client signin event.
        (function () {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', hydratePriorAnswers);
            } else {
                setTimeout(hydratePriorAnswers, 0);
            }
            // Also fire on storage event so a different tab signin re-hydrates.
            try {
                window.addEventListener('storage', function (e) {
                    if (e && e.key === 'apstats_roster.v1') hydratePriorAnswers();
                });
            } catch (_) {}
        })();`;

// The heal block to insert AFTER the anchor (separated by one blank line).
// Authored with \n; re-emitted in each file's native EOL at apply time.
const HEAL_BLOCK_LF =
`        // ==================== LEDGER HEAL ====================
        // LEDGER_HEAL_BUILD.md Part A — re-record locally-answered blanks that
        // are MISSING from (or unscored in) the ledger, so worksheet correctness
        // is never silently lost (answers filled before sign-in, under a prior
        // identity, or recorded with no score). Reuses recordBlankToGradebook
        // (correct scoring via checkAnswer) + fetchPrior (dedup). Fire-and-forget;
        // runs only when signed in; never blocks the worksheet.
        async function healLocalAnswersToLedger() {
            try {
                if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return;
                if (typeof recordBlankToGradebook !== 'function' || typeof gbWsPrefix !== 'function') return;
                var signedIn = false;
                try { signedIn = !!(window.rosterClient && typeof rosterClient.token === 'function' && rosterClient.token()); } catch (_) { signedIn = false; }
                if (!signedIn) return;
                var prefix = gbWsPrefix();
                if (!prefix) return;
                var prior = await window.gradebookClient.fetchPrior(prefix);
                document.querySelectorAll('.blank[data-question-id]').forEach(function (blank) {
                    try {
                        var value = (blank.value || '').trim();
                        if (!value) return;                                  // only answered blanks
                        var id = blank.dataset.questionId;
                        var entry = (prior && typeof prior.get === 'function') ? prior.get(id) : null;
                        // Skip ONLY when the ledger already holds this exact answer WITH a
                        // numeric score. Otherwise (missing / null-score / edited) re-record.
                        if (entry && typeof entry.score === 'number' && entry.response === value) return;
                        recordBlankToGradebook(blank);                       // checkAnswer -> score -> record
                    } catch (_) { /* per-blank best-effort */ }
                });
            } catch (_) { /* heal is best-effort; never block the worksheet */ }
        }

        // Heal trigger: after hydration settles (DOMContentLoaded), + on roster
        // signin (storage event). setTimeout lets hydratePriorAnswers run first.
        (function () {
            function _kickHeal() { try { setTimeout(healLocalAnswersToLedger, 400); } catch (_) {} }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _kickHeal);
            } else {
                _kickHeal();
            }
            try {
                window.addEventListener('storage', function (e) {
                    if (e && e.key === 'apstats_roster.v1') _kickHeal();
                });
            } catch (_) {}
        })();`;

function occ(haystack, needle) {
  let c = 0, i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) { c++; i += needle.length; }
  return c;
}

const files = readdirSync(ROOT)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

const report = [];
let wired = 0;
let already = 0;
let failed = 0;

for (const f of files) {
  const path = resolve(ROOT, f);
  let html = readFileSync(path, 'utf8');
  const before = html;
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const line = { f, eol: eol === '\r\n' ? 'CRLF' : 'LF', state: '', detail: '' };

  // Already wired? All markers → SKIP. Some → half-wired FAIL.
  const present = MARKERS.filter((m) => html.includes(m));
  if (present.length === MARKERS.length) {
    line.state = 'SKIP';
    line.detail = 'already-wired';
    already++;
    report.push(line);
    continue;
  }
  if (present.length > 0) {
    line.state = 'FAIL';
    line.detail = `half-wired (${present.length}/${MARKERS.length} markers) — manual repair needed`;
    failed++;
    report.push(line);
    continue;
  }

  // Resolve anchor in this file's native EOL.
  const anchor = eol === '\r\n' ? ANCHOR_LF.replace(/\n/g, '\r\n') : ANCHOR_LF;
  const anchorCount = occ(html, anchor);
  if (anchorCount !== 1) {
    line.state = 'FAIL';
    line.detail = `anchor×${anchorCount} (expected 1) — hydration must be wired first`;
    failed++;
    report.push(line);
    continue;
  }

  // Resolve heal block in this file's native EOL.
  const block = eol === '\r\n' ? HEAL_BLOCK_LF.replace(/\n/g, '\r\n') : HEAL_BLOCK_LF;

  // Insert AFTER the anchor: original close + blank line + block.
  const replacement = anchor + eol + eol + block;
  html = html.replace(anchor, replacement);

  if (html === before) {
    line.state = 'FAIL';
    line.detail = 'replace was a no-op';
    failed++;
    report.push(line);
    continue;
  }

  if (APPLY) {
    writeFileSync(path, html, 'utf8');
  }
  line.state = 'OK';
  wired++;
  report.push(line);
}

console.log(`wire-ledger-heal — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
console.log('');
for (const r of report) {
  const tag = r.state.padEnd(4);
  const eol = r.eol.padEnd(4);
  const name = r.f.padEnd(38);
  const detail = r.detail ? `  ${r.detail}` : '';
  console.log(`[${tag}] ${name} (${eol})${detail}`);
}
console.log('');
console.log(`Summary: ${wired} wired, ${already} already, ${failed} failed.`);
if (failed > 0) {
  console.log('');
  console.log('FAIL — investigate the FAIL lines above. Re-run will not auto-fix.');
  process.exit(1);
}
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');

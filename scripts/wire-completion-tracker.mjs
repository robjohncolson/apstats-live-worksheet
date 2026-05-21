/**
 * scripts/wire-completion-tracker.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of the WORKSHEET_COMPLETION_GATE_BUILD.md
 * §3-§4 completion-tracker block to every u*_lesson*_live.html. Inserts AFTER
 * the existing hydration trigger IIFE (wired earlier by
 * scripts/wire-hydration.mjs) and BEFORE the next code block in each file.
 *
 * Mirrors scripts/wire-hydration.mjs in shape: each file is read, edited, and
 * written in its OWN native EOL. All 69 worksheets are currently LF, but some
 * older U1-U3 / U8-U9 worksheets have been CRLF in the past; the script
 * detects per-file and re-emits in the same EOL so the git diff stays minimal
 * and additive.
 *
 * Idempotency: a fully-wired file contains `function updateWorksheetCompletion`.
 * If present → SKIP (already wired). If absent → wire it.
 *
 * Anchor: the byte-for-byte close of the hydration trigger IIFE — the same
 * literal block that scripts/wire-hydration.mjs (HYDRATION_BLOCK_LF) inserted
 * earlier, ending with the storage-event listener and the IIFE's `})();`. This
 * anchor is unique + present in all 69 worksheets (the hydration block was
 * committed in 1fbfcc1 — any worksheet that doesn't match is REPORTED, NOT
 * silently skipped).
 *
 * Usage:
 *   node scripts/wire-completion-tracker.mjs            # dry-run report
 *   node scripts/wire-completion-tracker.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// A fully-wired file contains this marker. Present → SKIP. Absent → wire it.
const MARKER = 'function updateWorksheetCompletion';

// Anchor is the literal close of the hydration trigger IIFE produced by
// scripts/wire-hydration.mjs HYDRATION_BLOCK_LF. Authored with \n so we can
// re-emit it in each file's native EOL when matching/replacing. The multi-line
// span (storage-event listener through `})();`) is unique in every worksheet.
const ANCHOR_LF =
`            // Also fire on storage event so a different tab signin re-hydrates.
            try {
                window.addEventListener('storage', function (e) {
                    if (e && e.key === 'apstats_roster.v1') hydratePriorAnswers();
                });
            } catch (_) {}
        })();`;

// The completion-tracker block to insert AFTER the anchor (separated by one
// blank line). Authored with \n; re-emitted in each file's native EOL at
// apply time. Matches the hand-piloted u4_lesson1-2 file exactly.
const COMPLETION_BLOCK_LF =
`        // ==================== COMPLETION TRACKER ====================
        // WORKSHEET_COMPLETION_GATE_BUILD.md §3-§4. Computes this worksheet's
        // completion and writes apstats_ws_completion[<studentKey>][<filename>]
        // so the Desk's Done button can gate on real progress. Student-scoped
        // so a shared browser never leaks one student's completion to the next.
        // Pure localStorage; no network.
        function _wsCompletionKey() {
            try { return (location.pathname || '').split('/').pop() || null; }
            catch (_) { return null; }
        }
        // Student identity — mirrors the Desk's getStudentEmail(): a legacy
        // free-text email if present, else <username>@roster.local from the
        // shared rosterClient session. Null when nobody is signed in.
        function _wsStudentKey() {
            try {
                var legacy = localStorage.getItem('apstats_desk_student_email');
                if (legacy) return legacy;
                var who = window.rosterClient && typeof window.rosterClient.current === 'function'
                    ? window.rosterClient.current() : null;
                if (who && who.username) return who.username + '@roster.local';
            } catch (_) {}
            return null;
        }
        function _wsReflectionTextareas() {
            // Reflection / exit-ticket boxes: <textarea id> NOT inside an appeal form.
            var out = [];
            var all = document.querySelectorAll('textarea[id]');
            for (var i = 0; i < all.length; i++) {
                var ta = all[i];
                if (ta.closest && ta.closest('.appeal-form')) continue;
                out.push(ta);
            }
            return out;
        }
        function updateWorksheetCompletion() {
            try {
                var key = _wsCompletionKey();
                if (!key) return;
                // Student-scoped write. No identity -> nothing to record; the
                // Desk's Done button only renders for signed-in students, and
                // the worksheet shares rosterClient with the Desk (same origin).
                var studentKey = _wsStudentKey();
                if (!studentKey) return;
                var blanks = document.querySelectorAll('.blank');
                var blanksTotal = blanks.length;
                var blanksFilled = 0;
                for (var i = 0; i < blanks.length; i++) {
                    if ((blanks[i].value || '').trim()) blanksFilled++;
                }
                var refs = _wsReflectionTextareas();
                var reflectionsTotal = refs.length;
                var reflectionsFilled = 0;
                var allE = reflectionsTotal > 0;
                for (var j = 0; j < refs.length; j++) {
                    if ((refs[j].value || '').trim()) reflectionsFilled++;
                    if (!refs[j].classList || !refs[j].classList.contains('graded-E')) allE = false;
                }
                var filled = blanksFilled + reflectionsFilled;
                var total = blanksTotal + reflectionsTotal;
                var pct = total > 0 ? filled / total : 0;
                var eligible = allE || pct >= 0.80;
                var store = {};
                try { store = JSON.parse(localStorage.getItem('apstats_ws_completion') || '{}'); }
                catch (_) { store = {}; }
                if (!store || typeof store !== 'object') store = {};
                if (!store[studentKey] || typeof store[studentKey] !== 'object') store[studentKey] = {};
                store[studentKey][key] = {
                    blanksFilled: blanksFilled, blanksTotal: blanksTotal,
                    reflectionsFilled: reflectionsFilled, reflectionsTotal: reflectionsTotal,
                    reflectionsAllE: allE,
                    filled: filled, total: total,
                    pct: pct, eligible: eligible,
                    ts: new Date().toISOString()
                };
                localStorage.setItem('apstats_ws_completion', JSON.stringify(store));
            } catch (_) { /* never block the worksheet */ }
        }
        (function () {
            var _wsCompTimer = null;
            function _wsCompDebounced() {
                if (_wsCompTimer) clearTimeout(_wsCompTimer);
                _wsCompTimer = setTimeout(updateWorksheetCompletion, 400);
            }
            // Manual typing in any blank / textarea.
            document.addEventListener('input', _wsCompDebounced);
            // Reflection grading (adds graded-E) + hydration (sets data-restored)
            // are attribute mutations, not input events — catch them too.
            try {
                var mo = new MutationObserver(_wsCompDebounced);
                mo.observe(document.body, {
                    subtree: true, attributes: true,
                    attributeFilter: ['class', 'data-restored']
                });
            } catch (_) {}
            // Initial compute on load, plus a delayed pass to catch async hydration.
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', updateWorksheetCompletion);
            } else {
                updateWorksheetCompletion();
            }
            setTimeout(updateWorksheetCompletion, 2500);
        })();
`;

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

  // Already wired? Marker present → SKIP (idempotent).
  if (html.includes(MARKER)) {
    line.state = 'SKIP';
    line.detail = 'already-wired';
    already++;
    report.push(line);
    continue;
  }

  // Resolve anchor in this file's native EOL.
  const anchor = eol === '\r\n' ? ANCHOR_LF.replace(/\n/g, '\r\n') : ANCHOR_LF;
  const anchorCount = occ(html, anchor);
  if (anchorCount !== 1) {
    line.state = 'FAIL';
    line.detail = `anchor×${anchorCount} (expected 1)`;
    failed++;
    report.push(line);
    continue;
  }

  // Resolve completion block in this file's native EOL.
  const block = eol === '\r\n' ? COMPLETION_BLOCK_LF.replace(/\n/g, '\r\n') : COMPLETION_BLOCK_LF;

  // Insert AFTER the anchor: original close + blank line + block.
  // The anchor already ends with the hydration IIFE's `})();`. We append
  // eol+eol+block so the result has one blank line between the hydration
  // trigger and the completion tracker — matches the hand-piloted
  // u4_lesson1-2 file exactly.
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

console.log(`wire-completion-tracker — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
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

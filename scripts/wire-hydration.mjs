/**
 * scripts/wire-hydration.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of the PERSISTENT_ANSWERS_BUILD.md §5
 * hydration block to every u*_lesson*_live.html. Inserts AFTER the existing
 * `function recordReflectionToGradebook(...)` (wired earlier by
 * scripts/dn2b-wire-feeders.mjs) and BEFORE the next code block in each file.
 *
 * Mirrors scripts/dn2b-wire-feeders.mjs / scripts/wire-roster-prefill.mjs in
 * shape: each file is read, edited, and written in its OWN native EOL. Some
 * older U1-U3 / some U8-U9 worksheets have been CRLF in the past; the script
 * detects per-file and re-emits in the same EOL so the git diff stays minimal
 * and additive.
 *
 * Idempotency: a fully-wired file has ALL THREE markers (the helper, the
 * badge fn, the DOMContentLoaded trigger). If only some are present the file
 * is half-wired (e.g. a botched manual merge) and is reported as FAIL — never
 * silently skipped — so the partial state gets a human's eyes.
 *
 * Anchor: the byte-for-byte close of `recordReflectionToGradebook` — the same
 * literal block that scripts/dn2b-wire-feeders.mjs (HELPER_BLOCK) inserted
 * earlier, ending with the function's closing `}`. This anchor is unique +
 * present in all 69 worksheets (verified at write time — any worksheet that
 * doesn't match is REPORTED, NOT silently skipped).
 *
 * Usage:
 *   node scripts/wire-hydration.mjs            # dry-run report
 *   node scripts/wire-hydration.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// A fully-wired file has ALL of these. All present → SKIP (already wired).
// Some but not all → FAIL (half-wired; needs manual repair). None → wire it.
const MARKERS = [
  'function hydratePriorAnswers',
  'function _markRestored',
  "addEventListener('DOMContentLoaded', hydratePriorAnswers)",
];

// Anchor is the literal close of recordReflectionToGradebook produced by
// scripts/dn2b-wire-feeders.mjs HELPER_BLOCK. Authored with \n so we can
// re-emit it in each file's native EOL when matching/replacing.
const ANCHOR_LF =
`            window.gradebookClient.record({
                source: 'frq', itemId: itemId,
                unit: gbUnitFromItemId(itemId), response: answer,
                score: (scoreLetter in scoreMap) ? scoreMap[scoreLetter] : undefined,
                attempt: 1
            });
        }`;

// The hydration block to insert AFTER the anchor (separated by one blank line).
// Authored with \n; re-emitted in each file's native EOL at apply time.
const HYDRATION_BLOCK_LF =
`        // ==================== PRIOR-ANSWER HYDRATION ====================
        // PERSISTENT_ANSWERS_BUILD.md §5 — fills empty .blank inputs +
        // reflection textareas with this student's most-recent prior
        // submissions, scoped to this worksheet's prefix. Fire-and-forget.
        // Never clobbers in-progress edits. Marks restored inputs with a
        // small badge so the student sees what was restored.
        async function hydratePriorAnswers() {
            try {
                if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return;
                var prefix = gbWsPrefix();
                if (!prefix) return;
                var prior = await window.gradebookClient.fetchPrior(prefix);
                if (!prior || prior.size === 0) return;

                // Fill empty .blank inputs.
                document.querySelectorAll('.blank[data-question-id]').forEach(function (blank) {
                    var itemId = blank.dataset.questionId;
                    var entry = prior.get(itemId);
                    if (!entry || entry.response === undefined || entry.response === null) return;
                    if (blank.value && blank.value.trim()) return;  // never clobber
                    var v = typeof entry.response === 'string'
                          ? entry.response
                          : String(entry.response);
                    blank.value = v;
                    blank.dataset.restored = '1';
                    if (typeof checkAnswer === 'function') checkAnswer(blank);
                    _markRestored(blank);
                });

                // Fill empty reflection textareas (source:'frq', itemId = prefix + '-' + textareaId).
                document.querySelectorAll('textarea[id]').forEach(function (ta) {
                    var itemId = prefix + '-' + ta.id;
                    var entry = prior.get(itemId);
                    if (!entry || entry.response === undefined || entry.response === null) return;
                    if (ta.value && ta.value.trim()) return;
                    var v = typeof entry.response === 'string'
                          ? entry.response
                          : String(entry.response);
                    ta.value = v;
                    ta.dataset.restored = '1';
                    _markRestored(ta);
                });
            } catch (_) { /* silent — never block the worksheet */ }
        }

        function _markRestored(el) {
            try {
                // Dedup per-element, not per-parent: a .question container can
                // hold several blanks, and EACH restored input gets its own badge.
                var sib = el.nextSibling;
                if (sib && sib.nodeType === 1 && sib.className === 'restored-badge') return;
                if (!el.parentNode) return;
                var b = document.createElement('span');
                b.className = 'restored-badge';
                b.textContent = '↻ restored';
                b.title = 'Filled from your prior submission. Edit freely to overwrite.';
                b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;' +
                                  'font-size:0.75em;background:#fff7d6;border:1px solid #d9b800;' +
                                  'border-radius:4px;color:#7a5a00;';
                el.parentNode.insertBefore(b, el.nextSibling);
            } catch (_) {}
        }

        // Hydration trigger: fire on DOMContentLoaded + on any roster-client signin event.
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

  // Already wired? All markers present → SKIP. Some present → half-wired FAIL.
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
    line.detail = `anchor×${anchorCount} (expected 1)`;
    failed++;
    report.push(line);
    continue;
  }

  // Resolve hydration block in this file's native EOL.
  const block = eol === '\r\n' ? HYDRATION_BLOCK_LF.replace(/\n/g, '\r\n') : HYDRATION_BLOCK_LF;

  // Insert AFTER the anchor: original close + blank line + block.
  // The anchor already ends with the function's closing `}`. We append eol+eol+block
  // so the result has one blank line between recordReflectionToGradebook and the
  // hydration helpers — matches the hand-piloted u4_lesson1-2 file exactly.
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

console.log(`wire-hydration — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
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

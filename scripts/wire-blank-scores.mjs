/**
 * scripts/wire-blank-scores.mjs  (W1 Section 4.2)
 *
 * Idempotent, EOL-PRESERVING rollout of GRADE_PIPELINE_BUILD.md W1 Section 4.2
 * (score the worksheet blanks) to every u*_lesson*_live.html.
 *
 * Mirrors scripts/wire-reflection-persistence.mjs pattern:
 *   - Per-file EOL detection (CRLF / LF); all authored strings use \n.
 *   - Per-edit sentinel: re-running a fully-wired file is a no-op.
 *   - A step whose anchor is missing or non-unique is reported MANUAL
 *     and skipped; the file is still written for any other applied steps.
 *   - DRY-RUN by default; pass --apply to write.
 *
 * Target files: ^u\d+_lesson.+_live\.html$ in repo root.
 * Excludes: edgar_u6_conceptual_driller_live.html (not a live worksheet).
 *
 * One step:
 *
 *   W1.4.2 -- rewrite the gradebookClient.record({...}) region inside
 *             recordBlankToGradebook so it computes the blank's verdict
 *             via checkAnswer(blank) and records a numeric score:
 *               correct  -> 1
 *               partial  -> 0.5
 *               incorrect -> 0
 *             Unknown verdicts (defensive) omit the score field rather
 *             than crashing. The existing empty-answer skip stays unchanged.
 *             Anchor: the record({...}) block + closing brace of the function.
 *             Sentinel: "// W1.4.2: compute verdict and score for this blank"
 *
 * Usage:
 *   node scripts/wire-blank-scores.mjs            # dry-run
 *   node scripts/wire-blank-scores.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// Count occurrences of needle in haystack.
function occ(haystack, needle) {
    let c = 0, i = 0;
    while ((i = haystack.indexOf(needle, i)) !== -1) { c++; i += needle.length; }
    return c;
}

// ============================================================
// W1.4.2 -- verdict + score in recordBlankToGradebook
//
// Anchor: the record({...}) call + closing function brace (unique 1/1 in all 69).
// The replacement computes the verdict via checkAnswer(blank) before the record
// call so the score is passed in. checkAnswer's CSS-class side effect is benign:
// it re-applies the class the blank already has at this point (it was already
// called earlier in handleLiveUpdate).
//
// Verdict -> score map: { correct: 1, partial: 0.5, incorrect: 0 }.
// Unknown verdict (defensive guard): omit score rather than crash.
// ============================================================
const W142_SENTINEL = '// W1.4.2: compute verdict and score for this blank';

const W142_ANCHOR_LF =
    "            window.gradebookClient.record({\n" +
    "                source: 'worksheet', itemId: itemId,\n" +
    "                unit: gbUnitFromItemId(itemId), response: value, attempt: 1\n" +
    "            });\n" +
    "        }";

const W142_REPLACEMENT_LF =
    "            // W1.4.2: compute verdict and score for this blank.\n" +
    "            // checkAnswer's CSS-class side effect is benign: it re-applies\n" +
    "            // the class the blank already has (it was already called upstream).\n" +
    "            var blankScoreMap = { correct: 1, partial: 0.5, incorrect: 0 };\n" +
    "            var blankVerdict = (typeof checkAnswer === 'function') ? checkAnswer(blank) : null;\n" +
    "            var blankScore = (blankVerdict !== null && blankVerdict in blankScoreMap)\n" +
    "                ? blankScoreMap[blankVerdict]\n" +
    "                : undefined;\n" +
    "            window.gradebookClient.record({\n" +
    "                source: 'worksheet', itemId: itemId,\n" +
    "                unit: gbUnitFromItemId(itemId), response: value,\n" +
    "                score: blankScore,\n" +
    "                attempt: 1\n" +
    "            });\n" +
    "        }";

// ============================================================
// Step definitions
// ============================================================
function buildSteps(eol) {
    function adapt(s) { return eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s; }
    return [
        {
            name: 'W1.4.2-blankScore',
            sentinel: W142_SENTINEL,
            done: (h) => h.includes(W142_SENTINEL),
            anchor: adapt(W142_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W142_ANCHOR_LF), adapt(W142_REPLACEMENT_LF)),
        },
    ];
}

const files = readdirSync(ROOT)
    .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
    .sort();

let fullyWired = 0;
const manual = [];
const report = [];

for (const f of files) {
    const path = resolve(ROOT, f);
    let html = readFileSync(path, 'utf8');
    const before = html;
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const steps = buildSteps(eol);
    const line = { f, eol: eol === '\r\n' ? 'CRLF' : 'LF', applied: [], already: [], MANUAL: [] };

    for (const step of steps) {
        if (step.done(html)) {
            line.already.push(step.name);
            continue;
        }
        const count = occ(html, step.anchor);
        if (count !== 1) {
            line.MANUAL.push(step.name + '(x' + count + ')');
            continue;
        }
        html = step.apply(html);
        line.applied.push(step.name);
    }

    if (line.MANUAL.length) {
        manual.push(f + ' [' + line.eol + ']: ' + line.MANUAL.join(', '));
    }
    const totalSteps = steps.length;
    const handled = line.applied.length + line.already.length;
    if (line.MANUAL.length === 0 && handled === totalSteps) fullyWired++;

    if (html !== before && APPLY) {
        writeFileSync(path, html, 'utf8');
    }
    report.push(line);
}

console.log('wire-blank-scores -- ' +
    (APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)') +
    ' -- ' + files.length + ' worksheets');
console.log('');
for (const r of report) {
    const tag = r.MANUAL.length ? 'MANUAL' : r.applied.length ? 'WIRE ' : 'SKIP ';
    let s = '[' + tag + '] ' + r.f + ' (' + r.eol + ')';
    if (r.applied.length) s += '  applied:' + r.applied.join(',');
    if (r.already.length) s += '  already:' + r.already.join(',');
    if (r.MANUAL.length) s += '  MANUAL:' + r.MANUAL.join(',');
    console.log(s);
}
console.log('');
console.log('Summary: ' + fullyWired + '/' + files.length + ' fully wired after this run.');
console.log('Files needing manual hooks (' + manual.length + '):');
console.log(manual.length ? manual.map((m) => '  ' + m).join('\n') : '  NONE');
console.log(APPLY
    ? '\nWritten. Re-run without --apply to confirm idempotent.'
    : '\nDry-run only. Re-run with --apply to write.');

/**
 * scripts/wire-reflection-persistence.mjs  (W2)
 *
 * Idempotent, EOL-PRESERVING rollout of GRADE_PIPELINE_BUILD.md W2
 * (FRQ-revision persistence) to every u*_lesson*_live.html.
 *
 * Mirrors scripts/dn2b-wire-feeders.mjs pattern:
 *   - Per-file EOL detection (CRLF / LF); all authored strings use \n.
 *   - Per-edit sentinel: re-running a fully-wired file is a no-op.
 *   - A step whose anchor is missing or non-unique is reported MANUAL
 *     and skipped; the file's other (unique) steps still apply and the
 *     file is still written (u3_lesson6-7 gets W2.0/W2.1/W2.2/W2.4/W2.5
 *     auto-applied; its W2.3 is MANUAL + hand-applied).
 *   - DRY-RUN by default; pass --apply to write.
 *
 * Target files: ^u\d+_lesson.+_live\.html$ in repo root.
 * Excludes: edgar_u6_conceptual_driller_live.html (not a live worksheet).
 *
 * Step edits (W2.0, W2.1+W2.2, W2.3, W2.4, W2.5):
 *
 *   W2.0 -- empty-answer skip guard in recordReflectionToGradebook.
 *            Anchor: "var scoreMap = { E: 1, P: 0.5, I: 0 };"  (1/1 all files)
 *
 *   W2.1+W2.2 -- reflection-edit listener (draft-persist + stale-grade clear).
 *            Anchor: "setTimeout(updateWorksheetCompletion, 2500);\n        })();"  (1/1 all files)
 *            Inserted as a new IIFE block after the completion-tracker IIFE.
 *
 *   W2.3 -- appeals re-record in submitAppeal.
 *            Anchor: "state.result = appealResult;"  (1/1 for 68 files)
 *            u3_lesson6-7_live.html: 0 occurrences -> MANUAL (hand-applied).
 *
 *   W2.4 -- hydration restores the grade class.
 *            Anchor: "ta.dataset.restored = '1';\n                    _markRestored(ta);"  (1/1 all files)
 *
 * Usage:
 *   node scripts/wire-reflection-persistence.mjs            # dry-run
 *   node scripts/wire-reflection-persistence.mjs --apply    # write files
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
// W2.0 -- empty-answer skip guard
// Anchor: the scoreMap declaration inside recordReflectionToGradebook.
// Insert: "if (!answer || !answer.trim()) return;" before scoreMap.
// Authored with \n; translated to file EOL at apply time.
// ============================================================
const W20_SENTINEL = 'if (!answer || !answer.trim()) return;';

const W20_ANCHOR_LF = '            var scoreMap = { E: 1, P: 0.5, I: 0 };';
const W20_REPLACEMENT_LF =
    '            if (!answer || !answer.trim()) return;\n' +
    '            var scoreMap = { E: 1, P: 0.5, I: 0 };';

// ============================================================
// W2.1 + W2.2 -- reflection-edit listener
// Anchor: the last two lines of the completion-tracker IIFE.
// Appended: a new self-contained IIFE with per-textarea debounce.
// ============================================================
const W21_SENTINEL = 'W2: reflection-edit listener';

const W21_ANCHOR_LF = '            setTimeout(updateWorksheetCompletion, 2500);\n        })();';

const W21_LISTENER_LF =
    '            setTimeout(updateWorksheetCompletion, 2500);\n' +
    '        })();\n' +
    '\n' +
    '        // ==================== W2: reflection-edit listener ====================\n' +
    '        // W2.1: draft-persist on edit. W2.2: stale-grade clear on edit.\n' +
    '        // Debounced per-textarea-id (~400ms) so edits to one textarea never\n' +
    '        // drop another\'s pending save. Mirrors the blank-feeder debounceMap.\n' +
    '        (function () {\n' +
    '            var _reflDebounce = {};\n' +
    '            document.addEventListener(\'input\', function (e) {\n' +
    '                var ta = e.target;\n' +
    '                if (!ta || ta.tagName !== \'TEXTAREA\' || !ta.id) return;\n' +
    '                if (ta.closest && ta.closest(\'.appeal-form\')) return;\n' +
    '                var id = ta.id;\n' +
    '                var text = (ta.value || \'\').trim();\n' +
    '                // W2.2: clear stale grade if text differs from the scored answer.\n' +
    '                var state = (typeof gradingState !== \'undefined\') ? gradingState.get(id) : null;\n' +
    '                if (state && (ta.classList.contains(\'graded-E\') ||\n' +
    '                              ta.classList.contains(\'graded-P\') ||\n' +
    '                              ta.classList.contains(\'graded-I\'))) {\n' +
    '                    if (text !== (state.originalAnswer || \'\').trim()) {\n' +
    '                        ta.classList.remove(\'graded-E\', \'graded-P\', \'graded-I\');\n' +
    '                        var fb = document.getElementById(id + \'-feedback\');\n' +
    '                        if (fb) fb.innerHTML = \'\';\n' +
    '                        gradingState.delete(id);\n' +
    '                    }\n' +
    '                }\n' +
    '                // W2.1: draft-persist (skip if unchanged since grading, skip empty).\n' +
    '                if (!text) return;\n' +
    '                var graded = (typeof gradingState !== \'undefined\') ? gradingState.get(id) : null;\n' +
    '                if (graded && (graded.originalAnswer || \'\').trim() === text) return;\n' +
    '                if (_reflDebounce[id]) clearTimeout(_reflDebounce[id]);\n' +
    '                _reflDebounce[id] = setTimeout(function () {\n' +
    '                    if (typeof recordReflectionToGradebook === \'function\') {\n' +
    '                        recordReflectionToGradebook(id, text, null);\n' +
    '                    }\n' +
    '                }, 400);\n' +
    '            });\n' +
    '        })();';

// ============================================================
// W2.3 -- appeals re-record in submitAppeal
// Anchor: "state.result = appealResult;" (one-liner assignment)
// Inserted: recordReflectionToGradebook call immediately after.
// ============================================================
const W23_SENTINEL = 'recordReflectionToGradebook(questionId, state.originalAnswer, appealResult.score)';

const W23_ANCHOR_LF = '                state.result = appealResult;';
const W23_REPLACEMENT_LF =
    '                state.result = appealResult;\n' +
    '                recordReflectionToGradebook(questionId, state.originalAnswer, appealResult.score);';

// ============================================================
// W2.4 -- hydration restores the grade class
// Anchor: the two-line block "ta.dataset.restored = '1';\n ... _markRestored(ta);"
// Insert grade-class logic between them.
// ============================================================
const W24_SENTINEL = 'W2.4: restore grade class from ledger score';

const W24_ANCHOR_LF =
    "                    ta.dataset.restored = '1';\n" +
    '                    _markRestored(ta);';

const W24_REPLACEMENT_LF =
    "                    ta.dataset.restored = '1';\n" +
    '                    // W2.4: restore grade class from ledger score (1->E, 0.5->P, 0->I).\n' +
    '                    if (entry.score !== null && entry.score !== undefined) {\n' +
    '                        var gradeMap = { 1: \'E\', 0.5: \'P\', 0: \'I\' };\n' +
    '                        var gradeClass = gradeMap[entry.score];\n' +
    '                        if (gradeClass) {\n' +
    '                            ta.classList.remove(\'graded-E\', \'graded-P\', \'graded-I\');\n' +
    '                            ta.classList.add(\'graded-\' + gradeClass);\n' +
    '                        }\n' +
    '                    }\n' +
    '                    _markRestored(ta);';

// ============================================================
// W2.5 -- hydration rebuilds the gradingState entry
// Codex BLOCKER fold: W2.4 restores the graded-* class but not the
// gradingState entry. After a reload gradingState is empty, so the
// W2.1+W2.2 listener has no originalAnswer to compare against and never
// clears the stale grade on the first post-reload edit. Rebuild the
// entry here, anchored on the graded-class line W2.4 inserts.
// ============================================================
const W25_SENTINEL = 'W2.5: rebuild gradingState';

const W25_ANCHOR_LF =
    "                            ta.classList.add('graded-' + gradeClass);";

const W25_REPLACEMENT_LF =
    "                            ta.classList.add('graded-' + gradeClass);\n" +
    '                            // W2.5: rebuild gradingState so a post-reload edit clears the stale grade.\n' +
    "                            if (typeof gradingState !== 'undefined' && gradingState && typeof gradingState.set === 'function') {\n" +
    "                                gradingState.set(ta.id, { result: { score: gradeClass, feedback: '' }, originalAnswer: v, appealCount: 0, history: [] });\n" +
    '                            }';

// ============================================================
// Step definitions (order matters for display; each independent)
// ============================================================
function buildSteps(eol) {
    function adapt(s) { return eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s; }
    return [
        {
            name: 'W2.0-emptyGuard',
            sentinel: W20_SENTINEL,
            done: (h) => h.includes(W20_SENTINEL),
            anchor: adapt(W20_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W20_ANCHOR_LF), adapt(W20_REPLACEMENT_LF)),
        },
        {
            name: 'W2.1+W2.2-editListener',
            sentinel: W21_SENTINEL,
            done: (h) => h.includes(W21_SENTINEL),
            anchor: adapt(W21_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W21_ANCHOR_LF), adapt(W21_LISTENER_LF)),
        },
        {
            name: 'W2.3-appealRecord',
            sentinel: W23_SENTINEL,
            done: (h) => h.includes(W23_SENTINEL),
            anchor: adapt(W23_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W23_ANCHOR_LF), adapt(W23_REPLACEMENT_LF)),
        },
        {
            name: 'W2.4-hydrateGrade',
            sentinel: W24_SENTINEL,
            done: (h) => h.includes(W24_SENTINEL),
            anchor: adapt(W24_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W24_ANCHOR_LF), adapt(W24_REPLACEMENT_LF)),
        },
        {
            name: 'W2.5-hydrateGradingState',
            sentinel: W25_SENTINEL,
            done: (h) => h.includes(W25_SENTINEL),
            anchor: adapt(W25_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W25_ANCHOR_LF), adapt(W25_REPLACEMENT_LF)),
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

console.log('wire-reflection-persistence -- ' +
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

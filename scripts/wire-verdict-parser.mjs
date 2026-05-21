/**
 * scripts/wire-verdict-parser.mjs  (W3.2)
 *
 * Idempotent, EOL-PRESERVING rollout of GRADE_PIPELINE_BUILD.md W3.2
 * (tolerant verdict parser) to every u*_lesson*_live.html.
 *
 * Mirrors scripts/wire-reflection-persistence.mjs pattern:
 *   - Per-file EOL detection (CRLF / LF); all authored strings use \n.
 *   - Per-edit sentinel: re-running a fully-wired file is a no-op.
 *   - A step whose anchor is missing or non-unique is reported MANUAL
 *     and skipped; the file's other (unique) steps still apply.
 *   - DRY-RUN by default; pass --apply to write.
 *
 * Target files: ^u\d+_lesson.+_live\.html$ in repo root.
 * Excludes: edgar_u6_conceptual_driller_live.html (not a live worksheet).
 *
 * Three steps:
 *
 *   W3.2a -- insert two helpers just before recordReflectionToGradebook:
 *              coerceVerdict(raw)         -- first-character verdict parser
 *              recordReflectionDraft(...) -- dedicated W2.1 draft sink
 *            Anchor: the recordReflectionToGradebook declaration line.
 *            Sentinel: "function recordReflectionDraft("
 *
 *   W3.2b -- replace the score-mapping region inside
 *            recordReflectionToGradebook with the GRADED two-case logic:
 *              coerceVerdict null  -> console.error + return (never silent)
 *              coerceVerdict E/P/I -> record the mapped score
 *            Draft writes no longer flow through here (see W3.2c).
 *            Anchor: the scoreMap + record({...}) block (unique in all 69).
 *            Sentinel: "// W3.2: graded verdict -- coerce or loudly skip"
 *
 *   W3.2c -- repoint the W2.1 draft listener at recordReflectionDraft so a
 *            draft (no verdict) is never confused with a graded write
 *            whose AI verdict came back null/missing.
 *            Anchor: the W2.1 listener's recordReflectionToGradebook call.
 *            Sentinel: "recordReflectionDraft(id, text)"
 *
 * Usage:
 *   node scripts/wire-verdict-parser.mjs            # dry-run
 *   node scripts/wire-verdict-parser.mjs --apply    # write files
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
// W3.2a -- coerceVerdict + recordReflectionDraft helpers
// Inserted immediately before function recordReflectionToGradebook.
// coerceVerdict: trim, uppercase, read the FIRST character only.
// recordReflectionDraft: the W2.1 draft sink -- records the in-progress
//   answer with NO score and runs no verdict logic, so a draft is never
//   mistaken for a graded write whose AI verdict came back null/missing.
// ============================================================
const W32A_SENTINEL = 'function recordReflectionDraft(';

const W32A_ANCHOR_LF =
    '        function recordReflectionToGradebook(textareaId, answer, scoreLetter) {';

const W32A_HELPER_LF =
    '        // W3.2a: tolerant verdict coercion -- trims, uppercases, reads the\n' +
    '        // FIRST character. E/P/I (any case, trailing junk, or as a word like\n' +
    '        // "Essentially"/"partial"/"incorrect") maps to that letter; any other\n' +
    '        // first character (e.g. "maybe", "correct", "", numbers) -> null.\n' +
    '        function coerceVerdict(raw) {\n' +
    '            if (raw === null || raw === undefined) return null;\n' +
    '            var s = String(raw).trim().toUpperCase();\n' +
    '            if (!s) return null;\n' +
    '            var c = s.charAt(0);\n' +
    '            return (c === \'E\' || c === \'P\' || c === \'I\') ? c : null;\n' +
    '        }\n' +
    '        // W3.2a: dedicated draft sink for W2.1 in-progress edits -- records\n' +
    '        // the answer with NO score and runs no verdict logic. Kept separate\n' +
    '        // from recordReflectionToGradebook so a graded write with a null or\n' +
    '        // missing AI verdict is never silently mistaken for a draft.\n' +
    '        function recordReflectionDraft(textareaId, answer) {\n' +
    '            if (!window.gradebookClient || !window.gradebookClient.record) return;\n' +
    '            if (!answer || !answer.trim()) return;\n' +
    '            var prefix = gbWsPrefix();\n' +
    '            if (!prefix) return;\n' +
    '            var itemId = prefix + \'-\' + textareaId;\n' +
    '            window.gradebookClient.record({\n' +
    '                source: \'frq\', itemId: itemId,\n' +
    '                unit: gbUnitFromItemId(itemId), response: answer,\n' +
    '                score: undefined,\n' +
    '                attempt: 1\n' +
    '            });\n' +
    '        }\n' +
    '        function recordReflectionToGradebook(textareaId, answer, scoreLetter) {';

// ============================================================
// W3.2b -- graded two-case verdict logic inside recordReflectionToGradebook
// Anchor: the scoreMap + record block (the W2-era scoring region).
// Replace with: coerce the verdict; null -> console.error + return;
// E/P/I -> record the mapped score. Draft writes go through
// recordReflectionDraft (W3.2c), never here.
// ============================================================
const W32B_SENTINEL = '// W3.2: graded verdict -- coerce or loudly skip';

const W32B_ANCHOR_LF =
    '            var scoreMap = { E: 1, P: 0.5, I: 0 };\n' +
    '            window.gradebookClient.record({\n' +
    '                source: \'frq\', itemId: itemId,\n' +
    '                unit: gbUnitFromItemId(itemId), response: answer,\n' +
    '                score: (scoreLetter in scoreMap) ? scoreMap[scoreLetter] : undefined,\n' +
    '                attempt: 1\n' +
    '            });';

const W32B_REPLACEMENT_LF =
    '            // W3.2: graded verdict -- coerce or loudly skip (never silent).\n' +
    '            // recordReflectionToGradebook is the GRADED/appeal sink; a null\n' +
    '            // or unparseable AI verdict is an error, not a draft.\n' +
    '            var verdict = coerceVerdict(scoreLetter);\n' +
    '            if (verdict === null) {\n' +
    '                console.error(\'[recordReflectionToGradebook] ambiguous or missing AI verdict:\', scoreLetter, \'itemId:\', itemId);\n' +
    '                return;\n' +
    '            }\n' +
    '            var scoreMap = { E: 1, P: 0.5, I: 0 };\n' +
    '            window.gradebookClient.record({\n' +
    '                source: \'frq\', itemId: itemId,\n' +
    '                unit: gbUnitFromItemId(itemId), response: answer,\n' +
    '                score: scoreMap[verdict],\n' +
    '                attempt: 1\n' +
    '            });';

// ============================================================
// W3.2c -- repoint the W2.1 draft listener at recordReflectionDraft
// The W2.1 listener (wire-reflection-persistence.mjs) currently calls
// recordReflectionToGradebook(id, text, null). After W3.2b that path
// would log an error (null verdict). Point it at recordReflectionDraft.
// ============================================================
const W32C_SENTINEL = 'recordReflectionDraft(id, text)';

const W32C_ANCHOR_LF =
    '                    if (typeof recordReflectionToGradebook === \'function\') {\n' +
    '                        recordReflectionToGradebook(id, text, null);\n' +
    '                    }';

const W32C_REPLACEMENT_LF =
    '                    if (typeof recordReflectionDraft === \'function\') {\n' +
    '                        recordReflectionDraft(id, text);\n' +
    '                    }';

// ============================================================
// Step definitions (order matters; each step is independent)
// ============================================================
function buildSteps(eol) {
    function adapt(s) { return eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s; }
    return [
        {
            name: 'W3.2a-helpers',
            done: (h) => h.includes(W32A_SENTINEL),
            anchor: adapt(W32A_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W32A_ANCHOR_LF), adapt(W32A_HELPER_LF)),
        },
        {
            name: 'W3.2b-gradedTwoCase',
            done: (h) => h.includes(W32B_SENTINEL),
            anchor: adapt(W32B_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W32B_ANCHOR_LF), adapt(W32B_REPLACEMENT_LF)),
        },
        {
            name: 'W3.2c-draftListener',
            done: (h) => h.includes(W32C_SENTINEL),
            anchor: adapt(W32C_ANCHOR_LF),
            apply: (h) => h.replace(adapt(W32C_ANCHOR_LF), adapt(W32C_REPLACEMENT_LF)),
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

console.log('wire-verdict-parser -- ' +
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

/**
 * scripts/dn2b-wire-feeders.mjs  (DN2b)
 *
 * Idempotent, EOL-PRESERVING rollout of the proven DN2a gradebook-feeder wiring
 * to every u*_lesson*_live.html. DRY-RUN by default — pass `--apply` to write.
 *
 * EOL-preserving is load-bearing: ~30 older worksheets (U1–U3, some U8/U9) use
 * CRLF. Each file is read, edited, and written in its OWN native EOL so it never
 * becomes mixed-ending and the git diff stays minimal/additive. The blankHook
 * regex is CRLF-tolerant (\r?\n).
 *
 * Per file, up to 5 robust indent/EOL-agnostic edits. Each step has an
 * INDEPENDENT done()-sentinel, so: (a) re-running a fully-wired file is a
 * no-op (idempotent), and (b) a file missing only some steps gets just the
 * missing steps applied. The sentinels are coarse substring checks — they
 * detect "this step's marker exists", not "this step is intact"; this script
 * applies/skips/reports, it does NOT repair a hand-corrupted partial block.
 *
 *   1. scriptTags   after  <script src="../railway_client.js"></script>   (literal, 69/69 unique)
 *   2. helperBlock  before `async function gradeAllReflections() {`        (literal, 69/69 unique)
 *   3. blankHook    after  the standalone `sendAnswer(blank);` call        (regex, line-start form)
 *   4. reflEnriched after  `renderEnrichedPass(id, enriched);`             (literal, 69/69 unique)
 *   5. reflNormal   after  `showFeedback(id, result);`                     (literal, 68/69 unique)
 *
 * Any edit whose anchor is missing/non-unique is REPORTED, not forced — the
 * file is left for manual handling (expected: only u3_lesson6-7, the lone
 * WORKSHEET_ID / different-submit worksheet, needs blankHook + reflNormal by
 * hand; its other 3 edits apply automatically).
 *
 * The helper block is FORM-AGNOSTIC: the WS- prefix derives from UNIT_ID OR
 * WORKSHEET_ID, mirroring scripts/audit-feeder-ids.mjs extractUnitId() exactly,
 * so itemIds always match the skill-map / work-manifest vocabulary.
 *
 * Usage:  node scripts/dn2b-wire-feeders.mjs            # dry-run report
 *         node scripts/dn2b-wire-feeders.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// Authored with \n; re-emitted in each file's native EOL at apply time.
export const HELPER_BLOCK = `        // ==================== GRADEBOOK LEDGER FEEDER (DN2) ====================
        // Fire-and-forget item_ledger writes via window.gradebookClient (CONTRACT 3).
        // No-ops without roster identity / without the client; never throws/blocks
        // the worksheet (decision L-D). Blank itemId is recorded VERBATIM from
        // assignQuestionIds(); reflection itemId = <WS-prefix>-<textareaId>. Both
        // match the skill-map / work-manifest vocabulary (proven by
        // scripts/audit-feeder-ids.mjs). topic/skill are intentionally NOT sent —
        // Phase 3 resolves them from the skill-map by itemId at roll-up time.
        function gbWsPrefix() {
            if (typeof UNIT_ID !== 'undefined' && UNIT_ID) return 'WS-' + UNIT_ID;
            if (typeof WORKSHEET_ID !== 'undefined' && WORKSHEET_ID) return WORKSHEET_ID;
            return null;
        }
        function gbUnitFromItemId(itemId) {
            var m = /^WS-(U\\d+)/.exec(itemId || '');
            return m ? m[1] : undefined;
        }
        function recordBlankToGradebook(blank) {
            if (!window.gradebookClient || !window.gradebookClient.record) return;
            var itemId = blank && blank.dataset ? blank.dataset.questionId : null;
            if (!itemId) return;
            var value = (blank.value || '').trim();
            if (!value) return;
            window.gradebookClient.record({
                source: 'worksheet', itemId: itemId,
                unit: gbUnitFromItemId(itemId), response: value, attempt: 1
            });
        }
        function recordReflectionToGradebook(textareaId, answer, scoreLetter) {
            if (!window.gradebookClient || !window.gradebookClient.record) return;
            var prefix = gbWsPrefix();
            if (!prefix) return;
            var itemId = prefix + '-' + textareaId;
            var scoreMap = { E: 1, P: 0.5, I: 0 };
            window.gradebookClient.record({
                source: 'frq', itemId: itemId,
                unit: gbUnitFromItemId(itemId), response: answer,
                score: (scoreLetter in scoreMap) ? scoreMap[scoreLetter] : undefined,
                attempt: 1
            });
        }

`;

const SCRIPT_TAG_LINES = [
  '<script src="../railway_client.js"></script>',
  '    <script src="roster_config.js"></script>',
  '    <script src="roster-client.js"></script>',
  '    <script src="gradebook-client.js"></script>',
];

const occ = (h, n) => { let c = 0, i = 0; while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; } return c; };

function buildSteps(eol) {
  const helper = HELPER_BLOCK.replace(/\n/g, eol);
  const tags = SCRIPT_TAG_LINES.join(eol);
  return [
    {
      name: 'scriptTags',
      done: (h) => h.includes('src="gradebook-client.js"'),
      anchor: '<script src="../railway_client.js"></script>',
      apply: (h, a) => h.replace(a, tags),
    },
    {
      name: 'helperBlock',
      done: (h) => h.includes('function recordBlankToGradebook'),
      anchor: `${eol}        async function gradeAllReflections() {`,
      apply: (h, a) => h.replace(a, `${eol}${helper}        async function gradeAllReflections() {`),
    },
    {
      name: 'blankHook',
      done: (h) => h.includes('recordBlankToGradebook(blank);'),
      // line-start standalone call only (excludes pushAllAnswers' inline form); CRLF-tolerant
      re: /\r?\n([ \t]+)sendAnswer\(blank\);\r?\n/g,
      apply: (h) =>
        h.replace(
          /\r?\n([ \t]+)sendAnswer\(blank\);\r?\n/,
          (_m, ind) => `${eol}${ind}sendAnswer(blank);${eol}${ind}recordBlankToGradebook(blank);${eol}`
        ),
    },
    {
      name: 'reflEnriched',
      done: (h) => h.includes("recordReflectionToGradebook(id, answer, 'E')"),
      anchor: 'renderEnrichedPass(id, enriched);',
      apply: (h, a) => h.replace(a, "renderEnrichedPass(id, enriched); recordReflectionToGradebook(id, answer, 'E');"),
    },
    {
      name: 'reflNormal',
      done: (h) => h.includes('recordReflectionToGradebook(id, answer, result.score)'),
      anchor: 'showFeedback(id, result);',
      apply: (h, a) => h.replace(a, 'showFeedback(id, result); recordReflectionToGradebook(id, answer, result.score);'),
    },
  ];
}

const files = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();

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
    if (step.done(html)) { line.already.push(step.name); continue; }
    const count = step.re ? (html.match(step.re) || []).length : occ(html, step.anchor);
    if (count !== 1) { line.MANUAL.push(`${step.name}(×${count})`); continue; }
    html = step.apply(html, step.anchor);
    line.applied.push(step.name);
  }

  if (line.MANUAL.length) manual.push(`${f} [${line.eol}]: ${line.MANUAL.join(', ')}`);
  if (line.MANUAL.length === 0 && line.applied.length + line.already.length === steps.length) fullyWired++;

  if (html !== before && APPLY) writeFileSync(path, html, 'utf8');
  report.push(line);
}

console.log(`DN2b feeder rollout — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
console.log('');
for (const r of report) {
  const tag = r.MANUAL.length ? 'MANUAL' : r.applied.length ? 'WIRE ' : 'SKIP ';
  let s = `[${tag}] ${r.f} (${r.eol})`;
  if (r.applied.length) s += `  applied:${r.applied.join(',')}`;
  if (r.already.length) s += `  already:${r.already.join(',')}`;
  if (r.MANUAL.length) s += `  MANUAL:${r.MANUAL.join(',')}`;
  console.log(s);
}
console.log('');
console.log(`Summary: ${fullyWired}/${files.length} fully wired after this run.`);
console.log(`Files needing manual hooks (${manual.length}):`);
console.log(manual.length ? manual.map((m) => '  ' + m).join('\n') : '  NONE');
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');

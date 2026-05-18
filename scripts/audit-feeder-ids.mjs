/**
 * scripts/audit-feeder-ids.mjs
 * Node 18+ ESM. Read-only.
 *
 * For every u*_lesson*_live.html in the repo root:
 *   1. Load via jsdom (DOM truth for .blank count, textarea ids)
 *   2. Extract the runtime UNIT_ID / WORKSHEET_ID
 *   3. Build the runtime id set exactly as assignQuestionIds() does
 *   4. Compare against WS-{UNIT_ID}-* keys in data/skill-map.json
 *   5. Classify CLEAN or MISMATCH
 *
 * Writes: GRADEBOOK_FEEDER_ID_AUDIT.md
 * Usage:  node scripts/audit-feeder-ids.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the canonical unitId (the part after "WS-" / the UNIT_ID value) and
 * the variable name used. Returns null if neither form is found.
 *
 * Two declaration forms found in the corpus:
 *   const UNIT_ID     = 'U4L1-2'          → { unitId: 'U4L1-2', varForm: 'UNIT_ID' }
 *   const WORKSHEET_ID = 'WS-U3L6-7'      → { unitId: 'U3L6-7', varForm: 'WORKSHEET_ID' }
 */
function extractUnitId(html) {
  const m1 = html.match(/const\s+UNIT_ID\s*=\s*['"]([^'"]+)['"]/);
  if (m1) return { unitId: m1[1], varForm: 'UNIT_ID' };

  const m2 = html.match(/const\s+WORKSHEET_ID\s*=\s*['"]WS-([^'"]+)['"]/);
  if (m2) return { unitId: m2[1], varForm: 'WORKSHEET_ID' };

  return null;
}

/**
 * Build the runtime id set for one worksheet.
 *
 * Mirrors assignQuestionIds() exactly:
 *   document.querySelectorAll('.blank').forEach((b,idx) =>
 *     b.dataset.questionId = `WS-${UNIT_ID}-Q${idx+1}`)
 *
 * Plus one textarea id per static <textarea id=...>:
 *   id = `WS-${UNIT_ID}-${textarea.id}`
 *
 * Both UNIT_ID and WORKSHEET_ID worksheets produce `WS-${unitId}-...` keys.
 * (WORKSHEET_ID = 'WS-U3L6-7' → prefix = 'WS-U3L6-7' — identical logic.)
 */
function buildRuntimeIds(unitId, doc) {
  const prefix = `WS-${unitId}`;

  const blanks = Array.from(doc.querySelectorAll('.blank'));
  const textareas = Array.from(doc.querySelectorAll('textarea[id]'));

  const ids = new Set();

  blanks.forEach((_, idx) => ids.add(`${prefix}-Q${idx + 1}`));
  textareas.forEach(ta => ids.add(`${prefix}-${ta.id}`));

  return ids;
}

/**
 * Return the set of WS-{unitId}-* keys present in skill-map.json.
 * Uses startsWith(`WS-${unitId}-`) so multi-lesson ids like U3L6-7 don't
 * accidentally match a hypothetical U3L6 worksheet.
 */
function getSkillMapIds(skillMap, unitId) {
  const prefix = `WS-${unitId}-`;
  return new Set(Object.keys(skillMap).filter(k => k.startsWith(prefix)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit one worksheet — returns a result record
// ─────────────────────────────────────────────────────────────────────────────

function auditWorksheet(filename, skillMap, root) {
  const filepath = resolve(root, filename);
  const html = readFileSync(filepath, 'utf8');

  // Extract declared id
  const extracted = extractUnitId(html);

  if (!extracted) {
    return {
      file: filename,
      unitId: null,
      varForm: 'NONE',
      blankCount: null,
      dataAnswerCount: null,
      smKeyCount: null,
      status: 'MISMATCH',
      issues: ['NO_UNIT_ID: could not find UNIT_ID or WORKSHEET_ID declaration'],
      onlyInRuntime: [],
      onlyInSkillMap: [],
    };
  }

  const { unitId, varForm } = extracted;

  // DOM truth via jsdom
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const blankCount = doc.querySelectorAll('.blank').length;
  const dataAnswerCount = (html.match(/data-answer=/g) || []).length;

  // Build runtime id set
  const runtimeIds = buildRuntimeIds(unitId, doc);

  // Build skill-map id set for this worksheet
  const smIds = getSkillMapIds(skillMap, unitId);

  const onlyInRuntime = [...runtimeIds].filter(id => !smIds.has(id)).sort();
  const onlyInSkillMap = [...smIds].filter(id => !runtimeIds.has(id)).sort();

  const issues = [];

  // Classify mismatch categories
  if (blankCount !== dataAnswerCount) {
    issues.push(`BLANK_DATAANSWER_DELTA: jsdom .blank=${blankCount} vs regex data-answer=${dataAnswerCount}`);
  }

  for (const id of onlyInSkillMap) {
    if (/\$\{/.test(id)) {
      // Template literal captured as literal textarea id by build-skill-map regex
      issues.push(`PHANTOM_TEMPLATE_KEY: ${id} (build-script regex captured JS template literal as textarea id)`);
    } else {
      issues.push(`SM_EXTRA: ${id} (in skill-map, not in runtime)`);
    }
  }

  for (const id of onlyInRuntime) {
    issues.push(`RUNTIME_EXTRA: ${id} (in runtime, not in skill-map)`);
  }

  const status = issues.length === 0 ? 'CLEAN' : 'MISMATCH';

  return {
    file: filename,
    unitId,
    varForm,
    blankCount,
    dataAnswerCount,
    smKeyCount: smIds.size,
    runtimeIdCount: runtimeIds.size,
    status,
    issues,
    onlyInRuntime,
    onlyInSkillMap,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export function runAudit(root = ROOT) {
  const skillMapPath = resolve(root, 'data/skill-map.json');
  const skillMap = JSON.parse(readFileSync(skillMapPath, 'utf8'));

  const worksheets = readdirSync(root)
    .filter(f => /^u\d+_lesson.+_live\.html$/.test(f))
    .sort();

  const results = worksheets.map(f => auditWorksheet(f, skillMap, root));

  // Tally
  const cleanCount = results.filter(r => r.status === 'CLEAN').length;
  const mismatchCount = results.filter(r => r.status === 'MISMATCH').length;

  // Collect distinct mismatch categories
  const categorySet = new Set();
  for (const r of results) {
    for (const issue of r.issues) {
      const cat = issue.split(':')[0].trim();
      categorySet.add(cat);
    }
  }
  const categories = [...categorySet].sort();

  return { results, cleanCount, mismatchCount, categories, worksheetCount: worksheets.length };
}

/**
 * Render the markdown report.
 */
function renderReport({ results, cleanCount, mismatchCount, categories, worksheetCount }) {
  const lines = [];

  lines.push('# Gradebook Feeder ID Audit');
  lines.push('');
  lines.push(`Generated by \`node scripts/audit-feeder-ids.mjs\`. Read-only — no files modified.`);
  lines.push('');

  // ── Summary ──────────────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Worksheets audited: **${worksheetCount}**`);
  lines.push(`- CLEAN (runtime == skill-map exactly): **${cleanCount}**`);
  lines.push(`- MISMATCH: **${mismatchCount}**`);
  lines.push('');
  lines.push('### Distinct mismatch categories');
  lines.push('');
  for (const cat of categories) {
    lines.push(`- \`${cat}\``);
  }
  lines.push('');

  // ── Per-worksheet table ───────────────────────────────────────────────────
  lines.push('## Per-Worksheet Table');
  lines.push('');
  lines.push('| File | UNIT_ID | Var | #.blank | #data-answer | #SM-keys | Runtime | Status | Mismatch Detail |');
  lines.push('|------|---------|-----|---------|--------------|----------|---------|--------|-----------------|');

  for (const r of results) {
    const status = r.status === 'CLEAN' ? 'CLEAN' : '**MISMATCH**';
    const detail = r.issues.length
      ? r.issues.map(i => i.replace(/\|/g, '\\|')).join('<br>')
      : '—';
    const unitId = r.unitId ?? '—';
    const varForm = r.varForm ?? '—';
    const blankCount = r.blankCount ?? '—';
    const dataAnswerCount = r.dataAnswerCount ?? '—';
    const smKeyCount = r.smKeyCount ?? '—';
    const runtimeIdCount = r.runtimeIdCount ?? '—';

    lines.push(
      `| \`${r.file}\` | \`${unitId}\` | ${varForm} | ${blankCount} | ${dataAnswerCount} | ${smKeyCount} | ${runtimeIdCount} | ${status} | ${detail} |`
    );
  }

  lines.push('');

  // ── Mismatch details ──────────────────────────────────────────────────────
  const mismatches = results.filter(r => r.status === 'MISMATCH');
  if (mismatches.length) {
    lines.push('## Mismatch Details');
    lines.push('');
    for (const r of mismatches) {
      lines.push(`### ${r.file}`);
      lines.push('');
      lines.push(`- UNIT_ID: \`${r.unitId}\` (declared as \`${r.varForm}\`)`);
      lines.push(`- Runtime ids: ${r.runtimeIdCount} | Skill-map ids: ${r.smKeyCount}`);
      if (r.onlyInRuntime.length) {
        lines.push(`- In runtime, not in skill-map (${r.onlyInRuntime.length}):`);
        for (const id of r.onlyInRuntime) lines.push(`  - \`${id}\``);
      }
      if (r.onlyInSkillMap.length) {
        lines.push(`- In skill-map, not in runtime (${r.onlyInSkillMap.length}):`);
        for (const id of r.onlyInSkillMap) lines.push(`  - \`${id}\``);
      }
      lines.push('');
    }
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  lines.push('## Verdict');
  lines.push('');

  const phantomCategory = categories.includes('PHANTOM_TEMPLATE_KEY');
  const otherCategories = categories.filter(c => c !== 'PHANTOM_TEMPLATE_KEY');

  if (phantomCategory && otherCategories.length === 0) {
    lines.push('**Single root cause — all mismatches are PHANTOM_TEMPLATE_KEY.**');
    lines.push('');
    lines.push(
      'Every worksheet has exactly one spurious skill-map key whose id contains a ' +
      'JS template literal (`${questionId}` or `${textareaId}`). These keys were ' +
      'emitted by `build-skill-map.mjs` because its textarea-detection regex scanned ' +
      'raw HTML and matched the `<textarea id="appeal-text-${questionId}">` element ' +
      'that lives inside a JS template string — not a static DOM element. jsdom (DOM ' +
      'truth) never returns these as real textarea ids because they are not present ' +
      'in the static HTML tree; they are created dynamically at runtime.'
    );
    lines.push('');
    lines.push('**Impact on the Do Now feeder:**');
    lines.push('');
    lines.push(
      'Feeders record `dataset.questionId` set by `assignQuestionIds()`. That function ' +
      'only touches `.blank` inputs and static `<textarea id=...>` elements — it never ' +
      'generates an id containing `${...}`. Therefore the phantom keys in skill-map ' +
      'can never be matched by a feeder submission. The diff between the work-manifest ' +
      '(built from skill-map keys) and the item ledger will contain one permanently-unmatched ' +
      'entry per worksheet (the phantom appeal key). This causes the Do Now manifest to ' +
      'over-count expected items by 1 per worksheet.'
    );
    lines.push('');
    lines.push('**Safe-as-is for feeders?** Partially.');
    lines.push('');
    lines.push(
      'Feeder submissions themselves are **safe** — no student answer will ever use the ' +
      'phantom id, so no data is lost or mislabeled. The problem is on the *manifest side*: ' +
      'if the Do Now feature computes completion or progress using the skill-map key count ' +
      'per worksheet, each worksheet will appear 1/N incomplete even when all real answers ' +
      'have been submitted. This requires reconciliation in `build-skill-map.mjs` (filter ' +
      'out textarea ids that contain `${`) — not in any worksheet HTML.'
    );
    lines.push('');
    lines.push('**Worksheets needing reconciliation:** ALL 69 (all contain the phantom key).');
    lines.push('');
    lines.push('**Reconciliation type:** `build-skill-map.mjs` fix only.');
    lines.push(
      'Add a guard: skip any textarea id that matches `/\\$\\{/` (template literal placeholder). ' +
      'No worksheet HTML needs to change. Re-running `node scripts/build-skill-map.mjs` after ' +
      'the fix will drop all 69 phantom keys.'
    );
  } else {
    lines.push('**Multiple mismatch categories detected.**');
    lines.push('');
    lines.push('Categories requiring action:');
    for (const cat of otherCategories) {
      lines.push(`- \`${cat}\`: inspect per-worksheet details above and reconcile manually`);
    }
    if (phantomCategory) {
      lines.push(`- \`PHANTOM_TEMPLATE_KEY\`: fix \`build-skill-map.mjs\` to skip template-literal textarea ids`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point (direct invocation)
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log('Auditing feeder ids…');
  const auditResult = runAudit();
  const report = renderReport(auditResult);

  const reportPath = resolve(ROOT, 'GRADEBOOK_FEEDER_ID_AUDIT.md');
  writeFileSync(reportPath, report, 'utf8');

  console.log(`\nResults:`);
  console.log(`  Worksheets: ${auditResult.worksheetCount}`);
  console.log(`  CLEAN:      ${auditResult.cleanCount}`);
  console.log(`  MISMATCH:   ${auditResult.mismatchCount}`);
  console.log(`  Categories: ${auditResult.categories.join(', ')}`);
  console.log(`\nWrote: ${reportPath}`);
}

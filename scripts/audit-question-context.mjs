/**
 * audit-question-context.mjs
 * Node 18+ ESM, zero external dependencies.
 *
 * Audits all questions the study guide can serve for whether they
 * have the visual context a student needs to solve them.
 *
 * Reads:
 *   - ../curriculum_render/data/curriculum.js  (EMBEDDED_CURRICULUM array)
 *   - data/formula-probe-supplement.js          (EMBEDDED_CURRICULUM_SUPPLEMENT array)
 *   - data/study-guide-frq-bank.js              (STUDY_GUIDE_FRQ_BANK object)
 *
 * Writes:
 *   - .session90-question-audit.md
 *   - .session90-missing-pictures.md
 *
 * Usage:
 *   node scripts/audit-question-context.mjs
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CR_ROOT = resolve(ROOT, '../curriculum_render');

// ─────────────────────────────────────────────────────────────────────────────
// Classification logic (exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

// Regex for orphan detection: prompt references a visual that isn't in attachments
// Case-insensitive, word-boundary anchored.
export const ORPHAN_REGEX = /\b(the\s+(?:graph|chart|table|diagram|histogram|boxplot|box\s*plot|scatterplot|scatter\s*plot|dotplot|dot\s*plot|display|figure|plot|image|picture|bar\s*chart|normal\s*curve)|distribution\s+shown|following\s+(?:figure|graph|histogram|boxplot|scatter|output|display)|shown\s+(?:above|below)|pictured\s+(?:above|below)|(?:refer\s+to|use|based\s+on)\s+the\s+(?:graph|chart|histogram|figure|diagram|scatter|box|dot|display))/i;

// Weak orphan signals (ambiguous — could be authoring style)
export const UNCLEAR_REGEX = /\bfollowing\s+data\b|\bdata\s+shown\b|\bbelow\b/i;

/**
 * Classify a single question object.
 *
 * @param {object} q - Question object from the data array
 * @param {string} pngRoot - Absolute path to the curriculum_render assets/pngs dir
 * @param {boolean} [chartRendererAvailable] - Whether lib/curriculum-charts.js is present.
 *   Defaults to checking the filesystem (follow-alongs/lib/curriculum-charts.js).
 * @returns {string} status code
 */
export function classifyQuestion(q, pngRoot, chartRendererAvailable) {
  // Default: check if the renderer file is present on disk
  if (chartRendererAvailable === undefined) {
    chartRendererAvailable = existsSync(resolve(ROOT, 'lib', 'curriculum-charts.js'));
  }

  const prompt = (q.prompt || '').replace(/\\n/g, ' ');
  const att = q.attachments || {};

  const hasTable = Array.isArray(att.table) && att.table.length > 0;
  const hasImage = typeof att.image === 'string' && att.image.trim().length > 0;
  const hasChart = typeof att.chartType === 'string' && att.chartType.trim().length > 0;
  const hasCharts = Array.isArray(att.charts) && att.charts.length > 0
    && att.charts.some(c => c && typeof c.chartType === 'string' && c.chartType.trim().length > 0);

  // Chart attachment (singular or plural multi-chart array)
  if (hasChart || hasCharts) {
    // After Phase 2: renderer is available, chart questions can render
    if (chartRendererAvailable) return 'OK_CHART';
    return 'CHART_MISSING_RENDERER';
  }

  // Image attachment
  if (hasImage) {
    const rawPath = String(att.image).replace(/^\.?\//, '');
    const fullPath = resolve(CR_ROOT, rawPath);
    if (existsSync(fullPath)) {
      return 'IMAGE_OK';
    }
    return 'IMAGE_NEEDS_FILE';
  }

  // Table attachment
  if (hasTable) {
    return 'OK_TABLE';
  }

  // No attachment — check if prompt references a visual
  const promptStripped = prompt.replace(/<[^>]+>/g, ' ');

  if (ORPHAN_REGEX.test(promptStripped)) {
    return 'CONTEXT_ORPHAN';
  }

  if (UNCLEAR_REGEX.test(promptStripped)) {
    return 'CONTEXT_UNCLEAR';
  }

  // Pure-text question
  return 'OK';
}

// ─────────────────────────────────────────────────────────────────────────────
// File loaders — each returns the array/object we need
// ─────────────────────────────────────────────────────────────────────────────

function loadCurriculumJs(filePath) {
  const source = readFileSync(filePath, 'utf8');

  // The file is: const EMBEDDED_CURRICULUM = [ ... ];
  // Use a synthetic-window approach via new Function
  const win = {};
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', source.replace(/^const /, 'window.'))(win);
    if (Array.isArray(win.EMBEDDED_CURRICULUM)) {
      return win.EMBEDDED_CURRICULUM;
    }
  } catch (_) { /* fall through to regex */ }

  // Fallback: assign into a fake global
  const fake = {};
  try {
    // eslint-disable-next-line no-new-func
    new Function('EMBEDDED_CURRICULUM', `this.result = EMBEDDED_CURRICULUM`).call(fake, undefined);
  } catch (_) { /* ignore */ }

  // Last resort: strip the const and eval
  try {
    const stripped = source.replace(/^const\s+EMBEDDED_CURRICULUM\s*=\s*/, 'var EMBEDDED_CURRICULUM = ');
    // eslint-disable-next-line no-new-func
    const fn = new Function(stripped + '; return EMBEDDED_CURRICULUM;');
    const result = fn();
    if (Array.isArray(result)) return result;
  } catch (e) {
    throw new Error(`Failed to parse curriculum.js: ${e.message}`);
  }
  throw new Error('EMBEDDED_CURRICULUM not found in curriculum.js');
}

function loadSupplementJs(filePath) {
  const source = readFileSync(filePath, 'utf8');

  // The file is: const EMBEDDED_CURRICULUM_SUPPLEMENT = [ ... ];
  try {
    const stripped = source
      .replace(/^const\s+EMBEDDED_CURRICULUM_SUPPLEMENT\s*=\s*/, 'var EMBEDDED_CURRICULUM_SUPPLEMENT = ');
    // eslint-disable-next-line no-new-func
    const fn = new Function(stripped + '; return EMBEDDED_CURRICULUM_SUPPLEMENT;');
    const result = fn();
    if (Array.isArray(result)) return result;
  } catch (e) {
    throw new Error(`Failed to parse supplement js: ${e.message}`);
  }
  throw new Error('EMBEDDED_CURRICULUM_SUPPLEMENT not found in supplement file');
}

function loadFrqBankJs(filePath) {
  const source = readFileSync(filePath, 'utf8');

  // The file is: (function(window){ window.STUDY_GUIDE_FRQ_BANK = { ... }; })(window);
  const win = {};
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', source)(win);
    if (win.STUDY_GUIDE_FRQ_BANK && typeof win.STUDY_GUIDE_FRQ_BANK === 'object') {
      return win.STUDY_GUIDE_FRQ_BANK;
    }
  } catch (e) {
    throw new Error(`Failed to parse frq-bank js: ${e.message}`);
  }
  throw new Error('STUDY_GUIDE_FRQ_BANK not found in frq-bank file');
}

/**
 * Find solution-part charts in an FRQ bank entry.
 * Returns an array of { id, partId, chartType } for each part with a chartType attachment.
 * These represent deferred work (Phase 4 — solution chart rendering not yet implemented).
 *
 * @param {object} q - FRQ bank question object
 * @returns {Array<{id:string, partId:string, chartType:string}>}
 */
export function classifyFrqSolutionCharts(q) {
  const parts = (q.solution && Array.isArray(q.solution.parts)) ? q.solution.parts : [];
  const results = [];
  for (const p of parts) {
    const att = p.attachments || {};
    if (typeof att.chartType === 'string' && att.chartType.trim().length > 0) {
      results.push({ id: q.id, partId: p.partId || '?', chartType: att.chartType.trim() });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main audit logic
// ─────────────────────────────────────────────────────────────────────────────

function getUnit(id) {
  // Extract unit number from ID like "U1-L2-Q01", "U3-PC-FRQ-Q01", etc.
  const m = String(id).match(/^U(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function promptExcerpt(prompt, maxLen = 80) {
  const clean = (prompt || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

function run() {
  const pngRoot = resolve(CR_ROOT, 'assets', 'pngs');
  const chartRendererAvailable = existsSync(resolve(ROOT, 'lib', 'curriculum-charts.js'));

  console.log(`Chart renderer available: ${chartRendererAvailable}`);

  // ── Load data ──────────────────────────────────────────────────────────────
  console.log('Loading curriculum.js…');
  const allCurriculum = loadCurriculumJs(resolve(CR_ROOT, 'data', 'curriculum.js'));
  console.log(`  Loaded ${allCurriculum.length} questions`);

  console.log('Loading formula-probe-supplement.js…');
  const supplement = loadSupplementJs(resolve(ROOT, 'data', 'formula-probe-supplement.js'));
  console.log(`  Loaded ${supplement.length} supplement MCQs`);

  console.log('Loading study-guide-frq-bank.js…');
  const frqBankObj = loadFrqBankJs(resolve(ROOT, 'data', 'study-guide-frq-bank.js'));
  const frqBankArr = Object.values(frqBankObj);
  console.log(`  Loaded ${frqBankArr.length} gate FRQs`);

  // ── Split curriculum into MCQ (served) + non-served FRQs ─────────────────
  const mcqList = allCurriculum.filter(q => q.type === 'multiple-choice');
  const nonServedFrqs = allCurriculum.filter(q => q.type === 'free-response');
  console.log(`  MCQs: ${mcqList.length}, non-served FRQs: ${nonServedFrqs.length}`);

  // ── Build audit entries ───────────────────────────────────────────────────
  const entries = [];

  // Main MCQs
  for (const q of mcqList) {
    entries.push({ id: q.id, source: 'curriculum', q, status: classifyQuestion(q, pngRoot, chartRendererAvailable) });
  }

  // Supplement MCQs
  for (const q of supplement) {
    entries.push({ id: q.id, source: 'supplement', q, status: classifyQuestion(q, pngRoot, chartRendererAvailable) });
  }

  // Gate FRQs
  for (const q of frqBankArr) {
    entries.push({ id: q.id, source: 'frq-bank', q, status: classifyQuestion(q, pngRoot, chartRendererAvailable) });
  }

  // Non-served FRQs (separate section in report)
  const nonServedEntries = [];
  for (const q of nonServedFrqs) {
    nonServedEntries.push({ id: q.id, source: 'curriculum-frq', q, status: classifyQuestion(q, pngRoot, chartRendererAvailable) });
  }

  // ── Deferred solution charts (Phase 4 carry-over) ────────────────────────
  // FRQ bank entries may have solution.parts[].attachments.chartType.
  // The runtime renderer for solution-part charts is deferred to Phase 4 (session 91).
  const deferredSolutionCharts = [];
  for (const e of entries.filter(x => x.source === 'frq-bank')) {
    const found = classifyFrqSolutionCharts(e.q);
    deferredSolutionCharts.push(...found);
  }

  // ── Tally counts ─────────────────────────────────────────────────────────
  const statuses = ['OK', 'OK_TABLE', 'OK_CHART', 'CHART_MISSING_RENDERER', 'IMAGE_OK',
    'IMAGE_NEEDS_FILE', 'CONTEXT_ORPHAN', 'CONTEXT_UNCLEAR', 'NO_VISUAL_NEEDED'];

  const counts = {};
  for (const s of statuses) counts[s] = 0;
  for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;

  // Chart type breakdown for CHART_MISSING_RENDERER
  const chartTypeCounts = {};
  for (const e of entries) {
    if (e.status === 'CHART_MISSING_RENDERER') {
      const ct = (e.q.attachments && e.q.attachments.chartType) || 'unknown';
      chartTypeCounts[ct] = (chartTypeCounts[ct] || 0) + 1;
    }
  }

  // By-unit breakdown
  const unitMap = {};
  for (const e of entries) {
    const u = getUnit(e.id);
    if (!unitMap[u]) unitMap[u] = { total: 0, OK: 0, chart: 0, image_missing: 0, orphan: 0 };
    unitMap[u].total++;
    if (e.status === 'OK' || e.status === 'OK_TABLE' || e.status === 'NO_VISUAL_NEEDED' || e.status === 'OK_CHART') unitMap[u].OK++;
    if (e.status === 'CHART_MISSING_RENDERER') unitMap[u].chart++;
    if (e.status === 'IMAGE_NEEDS_FILE') unitMap[u].image_missing++;
    if (e.status === 'CONTEXT_ORPHAN') unitMap[u].orphan++;
  }

  // ── Build audit markdown ──────────────────────────────────────────────────
  const chartBreakdown = Object.entries(chartTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([t, n]) => `${t} ${n}`)
    .join(', ');

  let md = `# Session 90 Question Context Audit\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  if (deferredSolutionCharts.length > 0) {
    md += `> **Note**: ${deferredSolutionCharts.length} solution chart(s) deferred to session 91. See DEFERRED_SOLUTION_CHART section.\n\n`;
  }

  md += `## Summary\n`;
  md += `- Chart renderer available (lib/curriculum-charts.js): ${chartRendererAvailable}\n`;
  md += `- Total in-scope questions: ${entries.length}\n`;
  md += `  - Main MCQs (curriculum.js): ${mcqList.length}\n`;
  md += `  - Supplement MCQs: ${supplement.length}\n`;
  md += `  - Gate FRQs (frq-bank): ${frqBankArr.length}\n`;
  md += `- OK (self-contained text): ${counts.OK || 0}\n`;
  md += `- OK_TABLE: ${counts.OK_TABLE || 0}\n`;
  md += `- OK_CHART (chart attachment, renderer present): ${counts.OK_CHART || 0}\n`;
  md += `- IMAGE_OK: ${counts.IMAGE_OK || 0}\n`;
  md += `- NO_VISUAL_NEEDED: ${counts.NO_VISUAL_NEEDED || 0}\n`;
  md += `- **CHART_MISSING_RENDERER: ${counts.CHART_MISSING_RENDERER || 0}** (${chartBreakdown || 'none'})\n`;
  md += `- IMAGE_NEEDS_FILE: ${counts.IMAGE_NEEDS_FILE || 0}\n`;
  md += `- CONTEXT_ORPHAN: ${counts.CONTEXT_ORPHAN || 0}\n`;
  md += `- CONTEXT_UNCLEAR: ${counts.CONTEXT_UNCLEAR || 0}\n`;
  md += `- DEFERRED_SOLUTION_CHART (Phase 4 carry-over): ${deferredSolutionCharts.length}\n`;

  md += `\n## By unit\n`;
  md += `| Unit | Total | OK/Table/None | Chart missing | Image missing | Orphan |\n`;
  md += `|------|-------|---------------|---------------|---------------|--------|\n`;
  for (const u of Object.keys(unitMap).sort((a, b) => a - b)) {
    const r = unitMap[u];
    md += `| U${u} | ${r.total} | ${r.OK} | ${r.chart} | ${r.image_missing} | ${r.orphan} |\n`;
  }

  // CHART_MISSING_RENDERER full list
  md += `\n## CHART_MISSING_RENDERER (Phase 2 unblocks these)\n`;
  md += `| ID | Source | Chart type | Prompt excerpt |\n`;
  md += `|----|--------|------------|----------------|\n`;
  for (const e of entries.filter(x => x.status === 'CHART_MISSING_RENDERER')) {
    const ct = (e.q.attachments && e.q.attachments.chartType) || 'unknown';
    md += `| ${e.id} | ${e.source} | ${ct} | ${promptExcerpt(e.q.prompt)} |\n`;
  }

  // CONTEXT_ORPHAN full list
  if (counts.CONTEXT_ORPHAN > 0) {
    md += `\n## CONTEXT_ORPHAN (prompt references visual not in attachments)\n`;
    md += `| ID | Source | Prompt excerpt |\n`;
    md += `|----|--------|----------------|\n`;
    for (const e of entries.filter(x => x.status === 'CONTEXT_ORPHAN')) {
      md += `| ${e.id} | ${e.source} | ${promptExcerpt(e.q.prompt)} |\n`;
    }
  }

  // CONTEXT_UNCLEAR full list
  if (counts.CONTEXT_UNCLEAR > 0) {
    md += `\n## CONTEXT_UNCLEAR (prompt language ambiguous)\n`;
    md += `| ID | Source | Prompt excerpt |\n`;
    md += `|----|--------|----------------|\n`;
    for (const e of entries.filter(x => x.status === 'CONTEXT_UNCLEAR')) {
      md += `| ${e.id} | ${e.source} | ${promptExcerpt(e.q.prompt)} |\n`;
    }
  }

  // IMAGE_NEEDS_FILE full list
  if (counts.IMAGE_NEEDS_FILE > 0) {
    md += `\n## IMAGE_NEEDS_FILE (image referenced but missing on disk)\n`;
    md += `| ID | Source | Referenced path | Exists |\n`;
    md += `|----|--------|-----------------|--------|\n`;
    for (const e of entries.filter(x => x.status === 'IMAGE_NEEDS_FILE')) {
      const rawPath = String(e.q.attachments.image).replace(/^\.?\//, '');
      const fullPath = resolve(CR_ROOT, rawPath);
      md += `| ${e.id} | ${e.source} | ${rawPath} | ${existsSync(fullPath) ? 'YES' : 'NO'} |\n`;
    }
  }

  // IMAGE_OK list
  if (counts.IMAGE_OK > 0) {
    md += `\n## IMAGE_OK (image file exists on disk)\n`;
    md += `| ID | Source | Path |\n`;
    md += `|----|--------|------|\n`;
    for (const e of entries.filter(x => x.status === 'IMAGE_OK')) {
      const rawPath = String(e.q.attachments.image).replace(/^\.?\//, '');
      md += `| ${e.id} | ${e.source} | ${rawPath} |\n`;
    }
  }

  // DEFERRED_SOLUTION_CHART section
  md += `\n## DEFERRED_SOLUTION_CHART (Phase 4 carry-over)\n`;
  if (deferredSolutionCharts.length > 0) {
    md += `These FRQ worked-solution parts have chartType attachments. The runtime renderer for solution-part charts is deferred to session 91 (Phase 4).\n\n`;
    md += `| Question ID | Part | Chart type | Notes |\n`;
    md += `|-------------|------|------------|-------|\n`;
    for (const item of deferredSolutionCharts) {
      md += `| ${item.id} | ${item.partId} | ${item.chartType} | solution chart in worked solution |\n`;
    }
  } else {
    md += `No deferred solution charts found.\n`;
  }

  // Non-served FRQ section
  const nsCounts = {};
  for (const e of nonServedEntries) nsCounts[e.status] = (nsCounts[e.status] || 0) + 1;
  md += `\n## Non-served curriculum FRQs (informational only)\n`;
  md += `These 34 FRQs in curriculum.js are NOT served by the study guide (gate FRQs come from the bank). Listed here so the user can decide which to promote to the FRQ bank.\n\n`;
  md += `Total: ${nonServedEntries.length}\n`;
  for (const s of statuses) {
    if (nsCounts[s]) md += `- ${s}: ${nsCounts[s]}\n`;
  }

  // ── Build missing-pictures markdown ─────────────────────────────────────
  // Only served entries (entries) — nonServedEntries are excluded from the picture list.
  // Deduplicate by normalized lowercase image path so duplicates from the same image
  // referenced by multiple questions only appear once.
  const missingByUnit = {};
  const allImagesTotal = [];
  const seenImagePaths = new Set(); // for dedup

  function addImageEntry(id, rawPath, exists, u, excerpt) {
    const dedupKey = rawPath.toLowerCase().replace(/\\/g, '/');
    if (seenImagePaths.has(dedupKey)) return;
    seenImagePaths.add(dedupKey);
    const info = { id, rawPath, exists, excerpt };
    if (!missingByUnit[u]) missingByUnit[u] = [];
    missingByUnit[u].push(info);
    allImagesTotal.push(info);
  }

  // Served question top-level images
  for (const e of entries) {
    const att = e.q.attachments || {};
    if (typeof att.image !== 'string' || !att.image.trim()) continue;
    const rawPath = String(att.image).replace(/^\.?\//, '');
    const fullPath = resolve(CR_ROOT, rawPath);
    addImageEntry(e.id, rawPath, existsSync(fullPath), getUnit(e.id), promptExcerpt(e.q.prompt, 60));
  }

  // Served FRQ bank solution-part images
  for (const e of entries.filter(x => x.source === 'frq-bank')) {
    const parts = (e.q.solution && e.q.solution.parts) || [];
    for (const p of parts) {
      const att = p.attachments || {};
      if (typeof att.image !== 'string' || !att.image.trim()) continue;
      const rawPath = String(att.image).replace(/^\.?\//, '');
      const fullPath = resolve(CR_ROOT, rawPath);
      addImageEntry(`${e.id}-sol`, rawPath, existsSync(fullPath), getUnit(e.id),
        `SOLUTION: ${promptExcerpt(p.description || '', 50)}`);
    }
  }

  const missingCount = allImagesTotal.filter(x => !x.exists).length;
  const presentCount = allImagesTotal.filter(x => x.exists).length;

  // Count non-served image refs separately (informational only)
  const nonServedImageRefs = [];
  for (const e of nonServedEntries) {
    const att = e.q.attachments || {};
    if (typeof att.image === 'string' && att.image.trim()) {
      nonServedImageRefs.push({ id: e.id, rawPath: String(att.image).replace(/^\.?\//, '') });
    }
  }

  let picsMd = `# Missing pictures for study guide questions\n\n`;
  picsMd += `The study guide renders images via \`attachMedia\` in study_guide_diagnostic.html.\n`;
  picsMd += `These question IDs reference image files. Fetch the originals and drop them at the listed paths under \`curriculum_render/\`.\n\n`;
  picsMd += `Total unique image refs in served questions: ${allImagesTotal.length} (${presentCount} present on disk, ${missingCount} missing)\n\n`;

  const allUnits = Object.keys(missingByUnit).sort((a, b) => a - b);

  for (const u of allUnits) {
    const items = missingByUnit[u];
    const missing = items.filter(x => !x.exists);
    if (!missing.length) continue;
    picsMd += `## Unit ${u}\n`;
    for (const item of missing) {
      picsMd += `- ${item.id} → \`${item.rawPath}\`\n  _${item.excerpt}_\n`;
    }
    picsMd += '\n';
  }

  if (missingCount === 0) {
    picsMd += `No missing image files found — all referenced image paths exist on disk.\n`;
  }

  // Also list present images for completeness
  picsMd += `\n## Images present on disk (no action needed)\n`;
  for (const u of allUnits) {
    const items = missingByUnit[u];
    const present = items.filter(x => x.exists);
    if (!present.length) continue;
    picsMd += `### Unit ${u}\n`;
    for (const item of present) {
      picsMd += `- ${item.id} → \`${item.rawPath}\` ✓\n`;
    }
  }

  // Non-served image refs — informational only, not actionable
  if (nonServedImageRefs.length > 0) {
    picsMd += `\n## Non-served question image refs (informational only)\n`;
    picsMd += `These ${nonServedImageRefs.length} image ref(s) come from curriculum.js FRQs not served by the study guide. Not included in the counts above.\n\n`;
    for (const ref of nonServedImageRefs) {
      picsMd += `- ${ref.id} → \`${ref.rawPath}\`\n`;
    }
  }

  // ── Write outputs ─────────────────────────────────────────────────────────
  const auditPath = resolve(ROOT, '.session90-question-audit.md');
  const picsPath = resolve(ROOT, '.session90-missing-pictures.md');

  writeFileSync(auditPath, md, 'utf8');
  writeFileSync(picsPath, picsMd, 'utf8');

  console.log(`\nAudit complete:`);
  console.log(`  Total in-scope: ${entries.length}`);
  console.log(`  CHART_MISSING_RENDERER: ${counts.CHART_MISSING_RENDERER || 0} (${chartBreakdown || 'none'})`);
  console.log(`  OK_CHART (renderer present): ${counts.OK_CHART || 0}`);
  console.log(`  IMAGE_NEEDS_FILE: ${counts.IMAGE_NEEDS_FILE || 0}`);
  console.log(`  IMAGE_OK: ${counts.IMAGE_OK || 0}`);
  console.log(`  CONTEXT_ORPHAN: ${counts.CONTEXT_ORPHAN || 0}`);
  console.log(`  CONTEXT_UNCLEAR: ${counts.CONTEXT_UNCLEAR || 0}`);
  console.log(`  DEFERRED_SOLUTION_CHART: ${deferredSolutionCharts.length}`);
  console.log(`  OK / OK_TABLE / OK_CHART / NO_VISUAL_NEEDED: ${(counts.OK || 0)} / ${(counts.OK_TABLE || 0)} / ${(counts.OK_CHART || 0)} / ${(counts.NO_VISUAL_NEEDED || 0)}`);
  console.log(`\nWrote: ${auditPath}`);
  console.log(`Wrote: ${picsPath}`);
}

// Only run when invoked directly (not when imported by tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run();
}

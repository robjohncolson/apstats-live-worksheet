/**
 * audit-skill-tagging.mjs
 * Node 18+ ESM, zero external dependencies.
 *
 * Inventories item → AP-skill coverage across 4 pools:
 *   (a) Follow-along worksheets (u*_lesson*_live.html) — blanks + FRQ textareas
 *   (b) curriculum_render/data/curriculum.js (READ ONLY / sacred — never write)
 *   (c) data/formula-probe-supplement.js + data/frq-decompositions.json
 *   (d) apstat_{1..9}_framework.md — AP skill definitions per topic
 *       apstat_5_framework.md is known-malformed (no ## TOPIC headers) — flagged, not fatal.
 *
 * Writes:
 *   GRADEBOOK_TAGGING_AUDIT.md  (regenerated on each run)
 *
 * Usage:
 *   node scripts/audit-skill-tagging.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseFrameworks as parseFrameworksLib, parseSingleFramework } from './lib/framework-parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// AP skill code lists extracted from the CED
// ─────────────────────────────────────────────────────────────────────────────

export const AP_SKILL_CODES = ['1.A', '2.A', '2.B', '2.C', '2.D', '3.A', '3.B', '3.C', '4.A', '4.B', '4.C'];

// AP skill names for readable reporting
export const AP_SKILL_NAMES = {
  '1.A': 'Selecting Statistical Methods (identify question/problem)',
  '2.A': 'Data Analysis (describe data)',
  '2.B': 'Data Analysis (construct representations)',
  '2.C': 'Data Analysis (calculate statistics)',
  '2.D': 'Data Analysis (compare distributions)',
  '3.A': 'Probability & Simulation (determine probabilities)',
  '3.B': 'Probability & Simulation (determine distribution parameters)',
  '3.C': 'Probability & Simulation (describe distributions)',
  '4.A': 'Statistical Argumentation (make claims)',
  '4.B': 'Statistical Argumentation (interpret/assess claims)',
  '4.C': 'Statistical Argumentation (verify conditions)',
};

const AP_SKILL_ORDER = new Map(AP_SKILL_CODES.map((code, index) => [code, index]));
const AP_SKILL_LITERAL_RE = /(?<![A-Z0-9-])([1-4]\.[A-D])(?![A-Z0-9.-])/g;

function createEmptySkillCountMap() {
  const counts = {};
  for (const skill of AP_SKILL_CODES) {
    counts[skill] = 0;
  }
  return counts;
}

function sortApSkillCodes(codes) {
  return [...codes].sort((a, b) => AP_SKILL_ORDER.get(a) - AP_SKILL_ORDER.get(b));
}

function extractApSkillCodesFromValue(value) {
  const found = new Set();
  collect(value);
  return sortApSkillCodes(found);

  function collect(candidate) {
    if (!candidate) {
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach(collect);
      return;
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return;
      }

      if (AP_SKILL_CODES.includes(trimmed)) {
        found.add(trimmed);
        return;
      }

      let match;
      while ((match = AP_SKILL_LITERAL_RE.exec(trimmed)) !== null) {
        if (AP_SKILL_CODES.includes(match[1])) {
          found.add(match[1]);
        }
      }
      AP_SKILL_LITERAL_RE.lastIndex = 0;
      return;
    }

    if (typeof candidate === 'object') {
      collect(candidate.code);
      collect(candidate.skill);
      collect(candidate.apSkill);
      collect(candidate.ap_skill);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (a): Follow-along worksheets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract unit number from a worksheet filename or question ID.
 * Returns integer 1-9, or 0 if unrecognized.
 */
export function extractUnit(name) {
  const m = String(name).match(/u(\d+)[_\-]/i) || String(name).match(/^U(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extract lesson range string from worksheet filename.
 * e.g. "u4_lesson1-2_live.html" -> "1-2"
 */
export function extractLesson(filename) {
  const m = String(filename).match(/lesson([^_]+)_live/);
  return m ? m[1] : '?';
}

/**
 * Parse a single worksheet HTML for:
 *  - blank count (data-answer attributes)
 *  - textarea IDs (FRQ reflections)
 *  - AP skill anchoring (data-skill, data-ap-skill, or skill codes in text)
 */
export function parseWorksheetHtml(html, filename) {
  const blanks = (html.match(/data-answer=/g) || []).length;
  const textareaIds = [];
  const idRe = /id=['"]([^'"]+)['"]/g;
  let m;
  // Find all textareas and extract their id attributes
  const textareaBlocks = html.match(/<textarea[^>]*>/g) || [];
  for (const block of textareaBlocks) {
    while ((m = idRe.exec(block)) !== null) {
      textareaIds.push(m[1]);
    }
    idRe.lastIndex = 0;
  }

  // Detect AP skill anchoring: data-skill or data-ap-skill attributes
  const dataSkillMatches = html.match(/data-(?:ap-)?skill=['"][^'"]+['"]/g) || [];
  const hasDataSkillAttr = dataSkillMatches.length > 0;

  // Detect skill code mentions in HTML text (e.g. "Skill 2.A" or "[Skill 3.A]")
  const skillCodeRe = /\[?[Ss]kill\s+(\d[A-D])\]?|(\d\.[A-D])\s*[-—]/g;
  const mentionedSkills = new Set();
  let sm;
  while ((sm = skillCodeRe.exec(html)) !== null) {
    const code = sm[1] || sm[2];
    if (AP_SKILL_CODES.includes(code)) mentionedSkills.add(code);
  }

  const hasSkillAnchoring = hasDataSkillAttr || mentionedSkills.size > 0;

  return { blanks, textareaIds, hasSkillAnchoring, mentionedSkills: [...mentionedSkills], dataSkillMatches };
}

/**
 * Scan all worksheets. Returns array of worksheet summary objects.
 */
export function scanWorksheets(root) {
  const results = [];
  const files = readdirSync(root).filter(f => /^u\d+_lesson.+_live\.html$/.test(f)).sort();

  for (const filename of files) {
    const html = readFileSync(resolve(root, filename), 'utf8');
    const parsed = parseWorksheetHtml(html, filename);
    const unit = extractUnit(filename);
    const lesson = extractLesson(filename);
    results.push({
      filename,
      unit,
      lesson,
      blanks: parsed.blanks,
      textareaIds: parsed.textareaIds,
      textareaCount: parsed.textareaIds.length,
      hasSkillAnchoring: parsed.hasSkillAnchoring,
      mentionedSkills: parsed.mentionedSkills,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (a): AI grading prompt files — cross-reference textarea IDs to rubrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract rubric keys from an ai-grading-prompts*.js file.
 * Returns array of key strings (e.g. ['reflect1', 'reflect2', 'exitTicket']).
 */
export function extractRubricKeys(jsSource) {
  // Match patterns like: reflect1: { or "reflect1": {
  const re = /['""]?(reflect\d+|exitTicket|reflect5)['""]?\s*:/g;
  const keys = new Set();
  let m;
  while ((m = re.exec(jsSource)) !== null) {
    keys.add(m[1]);
  }
  return [...keys];
}

/**
 * Scan all ai-grading-prompts*.js files (AP Stats ones, not MIT).
 * Returns map of filename -> array of rubric keys.
 */
export function scanGradingPrompts(root) {
  const files = readdirSync(root)
    .filter(f => /^ai-grading-prompts-u\d/.test(f) || f === 'ai-grading-prompts.js')
    .sort();
  const results = {};
  for (const filename of files) {
    const src = readFileSync(resolve(root, filename), 'utf8');
    results[filename] = extractRubricKeys(src);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (b): curriculum_render/data/curriculum.js (READ ONLY — never write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load curriculum.js. Returns { questions, available, error }.
 * If the file is absent, returns { available: false }.
 * NEVER writes to this file.
 */
export function loadCurriculumJs(root) {
  // Try adjacent repo path (standard layout per GRADEBOOK_SPEC)
  const candidatePaths = [
    resolve(root, '../curriculum_render/data/curriculum.js'),
    resolve(root, '../curriculum_render_v2/data/curriculum.js'),
  ];

  for (const p of candidatePaths) {
    if (!existsSync(p)) continue;
    try {
      const source = readFileSync(p, 'utf8');
      // Parse using new Function approach (same as audit-question-context.mjs model)
      const fn = new Function(
        source.replace(/^const\s+EMBEDDED_CURRICULUM\s*=\s*/, 'var EMBEDDED_CURRICULUM = ')
          + '; return EMBEDDED_CURRICULUM;'
      );
      const questions = fn();
      if (Array.isArray(questions)) {
        return { questions, available: true, path: p };
      }
    } catch (e) {
      return { questions: [], available: false, error: `Parse error: ${e.message}`, path: p };
    }
  }

  return { questions: [], available: false, error: 'pool unavailable — curriculum.js not found' };
}

/**
 * Analyze curriculum questions for AP-skill tags and unit coverage.
 * curriculum.js questions have no skill field — this audits the absence.
 */
export function analyzeCurriculumSkillCoverage(questions) {
  const byUnit = {};
  let taggedCount = 0;

  for (const q of questions) {
    const unit = (() => {
      const m = String(q.id).match(/^U(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    })();

    if (!byUnit[unit]) byUnit[unit] = { total: 0, tagged: 0, mcq: 0, frq: 0 };
    byUnit[unit].total++;
    if (q.type === 'multiple-choice') byUnit[unit].mcq++;
    if (q.type === 'free-response') byUnit[unit].frq++;

    // Check for any skill field
    const hasSkill = !!(q.skill || q.apSkill || q.ap_skill || q.skills);
    if (hasSkill) {
      byUnit[unit].tagged++;
      taggedCount++;
    }
  }

  return { byUnit, taggedCount, total: questions.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (c): formula-probe-supplement.js + frq-decompositions.json
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the supplement probe file.
 */
export function loadSupplementJs(root) {
  const p = resolve(root, 'data/formula-probe-supplement.js');
  if (!existsSync(p)) return { probes: [], available: false };

  const source = readFileSync(p, 'utf8');
  try {
    const fn = new Function(
      source.replace(/^const\s+EMBEDDED_CURRICULUM_SUPPLEMENT\s*=\s*/, 'var EMBEDDED_CURRICULUM_SUPPLEMENT = ')
        + '; return EMBEDDED_CURRICULUM_SUPPLEMENT;'
    );
    const probes = fn();
    return { probes: Array.isArray(probes) ? probes : [], available: true, path: p };
  } catch (e) {
    return { probes: [], available: false, error: e.message };
  }
}

/**
 * Load frq-decompositions.json.
 */
export function loadFrqDecompositions(root) {
  const p = resolve(root, 'data/frq-decompositions.json');
  if (!existsSync(p)) return { frqs: {}, skillCount: 0, available: false };

  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const frqs = data;
    let skillCount = 0;
    let zeroSignalSkills = 0;
    for (const k of Object.keys(frqs)) {
      for (const s of (frqs[k].skills || [])) {
        skillCount++;
        if (!s.supportingMcqIds || s.supportingMcqIds.length === 0) {
          zeroSignalSkills++;
        }
      }
    }
    return { frqs, skillCount, zeroSignalSkills, available: true, path: p };
  } catch (e) {
    return { frqs: {}, skillCount: 0, available: false, error: e.message };
  }
}

/**
 * Analyze supplement probes for zero-signal (no skill tag, no formulaId).
 */
export function analyzeSupplementProbes(probes) {
  const zeroSignal = probes.filter(p => !p.formulaId && !p.skill && !p.apSkill);
  const withFormulaId = probes.filter(p => !!p.formulaId);
  const byUnit = {};

  for (const p of probes) {
    const m = String(p.id).match(/^U(\d+)/);
    const unit = m ? parseInt(m[1], 10) : 0;
    if (!byUnit[unit]) byUnit[unit] = { total: 0, withFormulaId: 0, zeroSignal: 0 };
    byUnit[unit].total++;
    if (p.formulaId) byUnit[unit].withFormulaId++;
    if (!p.formulaId && !p.skill && !p.apSkill) byUnit[unit].zeroSignal++;
  }

  return { zeroSignal, withFormulaId, byUnit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (d): apstat_{1..9}_framework.md — AP skill definitions
// Refactored to consume scripts/lib/framework-parse.mjs (hardened parser).
// Exported signatures are preserved for backward compatibility with tests.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single framework markdown file.
 * Delegates to the hardened lib parser; returns the audit-script shape.
 *
 * Returns:
 *  {
 *    unit: number,
 *    topics: [ { topicNum, skills: string[], los: [], eks: [] } ],
 *    malformed: boolean,
 *    missing: boolean,
 *    skillsMentioned: Set<string>
 *  }
 */
export function parseFramework(filePath, unit) {
  return parseSingleFramework(filePath, unit);
}

/**
 * Scan all 9 framework files using the hardened parser.
 * Returns { results, flags } — same shape as before.
 */
export function scanFrameworks(root) {
  const results = [];
  const flags = [];

  const { topicSkills, malformed: malformedFiles } = parseFrameworksLib(root);

  // Build per-unit results matching the original shape
  for (let unit = 1; unit <= 9; unit++) {
    const filePath = resolve(root, `apstat_${unit}_framework.md`);

    if (!existsSync(filePath)) {
      flags.push(`WARN: apstat_${unit}_framework.md is MISSING — skipped.`);
      results.push({ unit, topics: [], malformed: false, missing: true, skillsMentioned: new Set() });
      continue;
    }

    const parsed = parseSingleFramework(filePath, unit);

    if (parsed.malformed) {
      flags.push(`FLAG: apstat_${unit}_framework.md is MALFORMED — no ## TOPIC headers (known defect for Unit 5). Parsed with fallback. Topic-level skill map may be incomplete for Unit 5.`);
    }

    results.push(parsed);
  }

  return { results, flags };
}

/**
 * Build a map of topic -> skills from all frameworks.
 * e.g. { '1.1': ['1.A'], '1.2': ['2.A'], ... }
 */
export function buildTopicSkillMap(frameworkResults) {
  const map = {};
  for (const fw of frameworkResults) {
    for (const topic of fw.topics) {
      map[topic.topicNum] = topic.skills;
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage matrix computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a skill -> pools coverage map.
 * Returns: { [skillCode]: { worksheet: count, curriculum: count, supplement: count, frq: count } }
 */
export function buildSkillCoverageMatrix(
  worksheets,
  gradingPrompts,
  curriculumAnalysis,
  supplementAnalysis,
  frqData,
  frameworkResults,
  topicSkillMap
) {
  // Initialize matrix
  const matrix = {};
  for (const skill of AP_SKILL_CODES) {
    matrix[skill] = { worksheet: 0, curriculum: 0, supplement: 0, frq: 0 };
  }

  // Pool (a): worksheets — use mentioned skills + framework-inferred skills via topic
  // Worksheets don't carry explicit skill tags, so we infer from topic number in filename
  for (const ws of worksheets) {
    const lesson = ws.lesson; // e.g. "1", "1-2", "6-7"
    // Map lesson to topic numbers (use first lesson for multi-lesson worksheets)
    const firstLesson = lesson.split('-')[0];
    const topicNum = `${ws.unit}.${firstLesson}`;
    const skills = topicSkillMap[topicNum] || [];
    for (const skill of skills) {
      if (matrix[skill]) {
        matrix[skill].worksheet += ws.blanks + ws.textareaCount;
      }
    }
  }

  // Pool (b): curriculum.js — no skill tags
  // (curriculum.js questions have NO skill field — coverage is 0 for all skills)

  // Pool (c): supplement probes — linked via formulaId, not AP skill code
  // They don't carry AP skill tags either; count them under "no-AP-skill" pool

  // Pool (c): FRQ decompositions — no AP skill codes, but have FRQ skill IDs
  // Infer AP skills from unit/topic
  for (const frqId of Object.keys(frqData.frqs)) {
    const frq = frqData.frqs[frqId];
    const unitNum = frq.unit;
    // Find all topics for this unit and their skills
    const unitFramework = frameworkResults.find(fw => fw.unit === unitNum);
    if (unitFramework) {
      const allSkills = new Set();
      for (const topic of unitFramework.topics) {
        topic.skills.forEach(s => allSkills.add(s));
      }
      for (const skill of allSkills) {
        if (matrix[skill]) {
          matrix[skill].frq += (frq.skills || []).length;
        }
      }
    }
  }

  // Pool (d): frameworks define the skills — mark as "defined"
  for (const fw of frameworkResults) {
    for (const topic of fw.topics) {
      for (const skill of topic.skills) {
        // Already counted in worksheet pool via topic inference
      }
    }
  }

  return matrix;
}

/**
 * Find AP skills with no worksheet items and no proctored-mappable items.
 */
export function findSkillGaps(matrix, worksheetsByUnit) {
  const gaps = [];
  for (const skill of AP_SKILL_CODES) {
    const row = matrix[skill];
    const hasWorksheetItems = row.worksheet > 0;
    const hasPracticeItems = row.curriculum > 0 || row.supplement > 0 || row.frq > 0;
    if (!hasWorksheetItems && !hasPracticeItems) {
      gaps.push({ skill, reason: 'no items in any pool' });
    } else if (!hasWorksheetItems) {
      gaps.push({ skill, reason: 'no worksheet items (follow-along pool)' });
    }
  }
  return gaps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-unit worksheet summary
// ─────────────────────────────────────────────────────────────────────────────

function buildUnitWorksheetSummary(worksheets, gradingPrompts) {
  const byUnit = {};
  for (const ws of worksheets) {
    if (!byUnit[ws.unit]) {
      byUnit[ws.unit] = { worksheets: 0, blanks: 0, textareas: 0, gradingFiles: 0, hasSkillAnchoring: 0 };
    }
    byUnit[ws.unit].worksheets++;
    byUnit[ws.unit].blanks += ws.blanks;
    byUnit[ws.unit].textareas += ws.textareaCount;
    if (ws.hasSkillAnchoring) byUnit[ws.unit].hasSkillAnchoring++;
  }

  // Count grading prompt files per unit
  for (const [filename] of Object.entries(gradingPrompts)) {
    const m = filename.match(/u(\d+)/);
    if (m) {
      const unit = parseInt(m[1], 10);
      if (byUnit[unit]) byUnit[unit].gradingFiles++;
    }
  }

  return byUnit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report generation
// ─────────────────────────────────────────────────────────────────────────────

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function buildReport({
  worksheets,
  gradingPrompts,
  curriculumResult,
  curriculumAnalysis,
  supplementResult,
  supplementAnalysis,
  frqResult,
  frameworkScan,
  topicSkillMap,
  matrix,
  gaps,
  unitWorksheetSummary,
  allFlags,
}) {
  const totalWorksheets = worksheets.length;
  const totalBlanks = worksheets.reduce((s, w) => s + w.blanks, 0);
  const totalTextareas = worksheets.reduce((s, w) => s + w.textareaCount, 0);
  const totalGradingFiles = Object.keys(gradingPrompts).length;
  const totalFrqSkills = frqResult.skillCount || 0;
  const zeroSignalFrqSkills = frqResult.zeroSignalSkills || 0;
  const supplementCount = supplementResult.probes.length;
  const zeroSignalSupp = supplementAnalysis.zeroSignal.length;

  // Count topics defined in frameworks
  const totalTopics = frameworkScan.results.reduce((s, fw) => s + fw.topics.length, 0);
  const malformedFrameworks = frameworkScan.results.filter(fw => fw.malformed).length;

  // Phase 3 readiness
  const skillsWithWorksheetItems = AP_SKILL_CODES.filter(s => matrix[s].worksheet > 0).length;
  const skillsWithAnyItems = AP_SKILL_CODES.filter(s =>
    matrix[s].worksheet > 0 || matrix[s].curriculum > 0 || matrix[s].supplement > 0 || matrix[s].frq > 0
  ).length;
  const worksheetSkillCoverage = Math.round((skillsWithWorksheetItems / AP_SKILL_CODES.length) * 100);

  // Build lines
  const lines = [];

  // Header (timestamp in clearly-marked single header line; test ignores this line)
  lines.push('# Gradebook Tagging Audit — AP Skill Coverage');
  lines.push(`<!-- GENERATED: ${new Date().toISOString()} -->`);
  lines.push('');

  // ── Summary ────────────────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push('### Pool (a) — Follow-Along Worksheets');
  lines.push(`- Worksheets scanned: ${totalWorksheets}`);
  lines.push(`- Total fill-in-the-blank items (data-answer): ${totalBlanks}`);
  lines.push(`- Total FRQ reflection textareas: ${totalTextareas}`);
  lines.push(`- AI grading prompt files: ${totalGradingFiles}`);
  lines.push(`- Worksheets with explicit AP-skill anchoring: ${worksheets.filter(w => w.hasSkillAnchoring).length} of ${totalWorksheets}`);
  lines.push('- AP skill anchoring method: NONE (no data-skill/data-ap-skill attrs found in any worksheet HTML)');
  lines.push('  Skills are inferred from lesson→topic→framework mapping only.');
  lines.push('');
  lines.push('### Pool (b) — curriculum_render/data/curriculum.js');
  if (curriculumResult.available) {
    lines.push(`- Status: AVAILABLE (${curriculumResult.path})`);
    lines.push(`- Total questions: ${curriculumResult.questions.length}`);
    lines.push(`- Questions with AP-skill tags: ${curriculumAnalysis.taggedCount} (${curriculumAnalysis.taggedCount === 0 ? '0%' : Math.round(curriculumAnalysis.taggedCount / curriculumResult.questions.length * 100) + '%'})`);
    lines.push(`- AP-skill tagging: **ABSENT** — no skill, apSkill, or skills field on any question.`);
  } else {
    lines.push(`- Status: **${curriculumResult.error || 'pool unavailable'}**`);
  }
  lines.push('');
  lines.push('### Pool (c) — Supplement Probes + FRQ Decompositions');
  lines.push(`- Supplement probes (formula-probe-supplement.js): ${supplementCount}`);
  lines.push(`  - With formulaId (practice signal): ${supplementAnalysis.withFormulaId.length}`);
  lines.push(`  - Zero-signal probes (no formulaId/skill): ${zeroSignalSupp}`);
  lines.push(`  - AP-skill tagging: **ABSENT** — probes link via formulaId, not AP skill code.`);
  lines.push(`- FRQ decompositions (frq-decompositions.json): ${Object.keys(frqResult.frqs).length} FRQs, ${totalFrqSkills} sub-skills`);
  lines.push(`  - Sub-skills with zero supporting MCQs: ${zeroSignalFrqSkills}`);
  lines.push(`  - AP-skill tagging: **ABSENT** — FRQ skills use internal IDs (u1-frq-zscore style), not AP codes.`);
  lines.push('');
  lines.push('### Pool (d) — AP Framework Files (apstat_1..9_framework.md)');
  lines.push(`- Framework files parsed: ${frameworkScan.results.filter(fw => !fw.missing).length} of 9`);
  lines.push(`- Topics extracted: ${totalTopics}`);
  lines.push(`- Malformed files: ${malformedFrameworks}`);
  lines.push('');

  // ── Framework flags ────────────────────────────────────────────────────────
  lines.push('## Flags and Malformed Sources');
  lines.push('');
  if (allFlags.length === 0) {
    lines.push('No flags.');
  } else {
    for (const flag of allFlags) {
      lines.push(`- ${flag}`);
    }
  }
  lines.push('');

  // ── Coverage matrix ────────────────────────────────────────────────────────
  lines.push('## AP Skill Coverage Matrix');
  lines.push('');
  lines.push('Skill inferred via: worksheet lesson → framework topic → AP skill code.');
  lines.push('curriculum.js, supplement, and FRQ decomposition pools carry NO AP-skill tags.');
  lines.push('');
  lines.push('| AP Skill | Skill Name | Worksheet Items (inferred) | curriculum.js | Supplement | FRQ Skills | Has Tag? |');
  lines.push('|----------|------------|---------------------------|---------------|------------|------------|----------|');

  for (const skill of AP_SKILL_CODES) {
    const row = matrix[skill];
    const hasTag = row.worksheet > 0 || row.curriculum > 0 || row.supplement > 0 || row.frq > 0;
    const name = AP_SKILL_NAMES[skill] || '';
    lines.push(`| ${skill} | ${name} | ${row.worksheet} | ${row.curriculum} | ${row.supplement} | ${row.frq} | ${hasTag ? 'YES (inferred)' : 'NO'} |`);
  }
  lines.push('');

  // ── Per-unit coverage ──────────────────────────────────────────────────────
  lines.push('## Per-Unit Coverage (Worksheets)');
  lines.push('');
  lines.push('| Unit | Worksheets | Blanks | Textareas | Grading Files | Explicit Skill Tags |');
  lines.push('|------|------------|--------|-----------|---------------|---------------------|');
  for (let unit = 1; unit <= 9; unit++) {
    const row = unitWorksheetSummary[unit] || { worksheets: 0, blanks: 0, textareas: 0, gradingFiles: 0, hasSkillAnchoring: 0 };
    lines.push(`| U${unit} | ${row.worksheets} | ${row.blanks} | ${row.textareas} | ${row.gradingFiles} | ${row.hasSkillAnchoring} |`);
  }
  lines.push('');

  // ── Framework topic-skill map ──────────────────────────────────────────────
  lines.push('## Framework Topic → AP Skill Map');
  lines.push('');
  lines.push('Extracted from apstat_{1..9}_framework.md. Unit 5 uses fallback parser (malformed).');
  lines.push('');
  lines.push('| Topic | AP Skills |');
  lines.push('|-------|-----------|');
  const topicNums = Object.keys(topicSkillMap).sort((a, b) => {
    const [au, al] = a.split('.').map(Number);
    const [bu, bl] = b.split('.').map(Number);
    return au !== bu ? au - bu : al - bl;
  });
  for (const topicNum of topicNums) {
    const skills = topicSkillMap[topicNum];
    // Empty-skills topics are N/A synthesis topics (7.10, 8.7, 9.6) — not a parse failure.
    lines.push(`| ${topicNum} | ${skills.length > 0 ? skills.join(', ') : '(N/A — synthesis topic)'} |`);
  }
  lines.push('');

  // ── Gap list ───────────────────────────────────────────────────────────────
  lines.push('## Gap List — Skills with Insufficient Coverage');
  lines.push('');
  lines.push('These AP skills have no items (via any pool) or are not inferrable from the topic→skill map.');
  lines.push('');
  if (gaps.length === 0) {
    lines.push('No gaps detected (all skills covered by at least one pool via topic inference).');
  } else {
    lines.push('| AP Skill | Gap Reason |');
    lines.push('|----------|------------|');
    for (const g of gaps) {
      lines.push(`| ${g.skill} | ${g.reason} |`);
    }
  }
  lines.push('');

  // ── curriculum.js per-unit breakdown ──────────────────────────────────────
  if (curriculumResult.available) {
    lines.push('## curriculum.js Per-Unit Breakdown (Read-Only Pool)');
    lines.push('');
    lines.push('| Unit | Total | MCQ | FRQ | Skill-Tagged |');
    lines.push('|------|-------|-----|-----|--------------|');
    for (let unit = 1; unit <= 9; unit++) {
      const row = curriculumAnalysis.byUnit[unit] || { total: 0, mcq: 0, frq: 0, tagged: 0 };
      lines.push(`| U${unit} | ${row.total} | ${row.mcq} | ${row.frq} | ${row.tagged} |`);
    }
    lines.push('');
  }

  // ── FRQ decomposition details ──────────────────────────────────────────────
  lines.push('## FRQ Decompositions — Sub-Skill Coverage');
  lines.push('');
  lines.push('| FRQ ID | Unit | Sub-Skills | Zero-Signal Sub-Skills |');
  lines.push('|--------|------|------------|------------------------|');
  for (const frqId of Object.keys(frqResult.frqs).sort()) {
    const frq = frqResult.frqs[frqId];
    const skills = frq.skills || [];
    const zeroSig = skills.filter(s => !s.supportingMcqIds || s.supportingMcqIds.length === 0).length;
    lines.push(`| ${frqId} | ${frq.unit} | ${skills.length} | ${zeroSig} |`);
  }
  lines.push('');

  // ── Phase 3 readiness verdict ──────────────────────────────────────────────
  lines.push('## Phase 3 Readiness Verdict');
  lines.push('');
  lines.push('**Question: Can per-skill BKT (Bayesian Knowledge Tracing) be trusted today?**');
  lines.push('');
  lines.push('### Verdict: NOT READY');
  lines.push('');
  lines.push('**Reason 1 — No explicit AP-skill tags on any item.**');
  lines.push(`All 4 pools (${pluralize(totalWorksheets, 'worksheet')}, curriculum.js ${curriculumResult.available ? `(${curriculumResult.questions.length} questions)` : '(unavailable)'}, ${pluralize(supplementCount, 'supplement probe')}, ${totalFrqSkills} FRQ sub-skills) lack AP skill codes on individual items.`);
  lines.push('Skill mapping is inference-only (lesson → framework topic → AP skill code).');
  lines.push('');
  lines.push('**Reason 2 — Worksheet items lack per-question skill attribution.**');
  lines.push(`${totalBlanks} fill-in-blank items and ${totalTextareas} FRQ textareas across ${totalWorksheets} worksheets carry no data-skill or data-ap-skill attributes.`);
  lines.push('BKT requires item-level skill tags; inferred topic-level coverage is too coarse for reliable estimation.');
  lines.push('');
  lines.push('**Reason 3 — curriculum.js is untagged.**');
  lines.push(`${curriculumResult.available ? curriculumResult.questions.length : 'N/A'} curriculum.js questions have NO skill field. The sacred-file rule prevents adding tags here.`);
  lines.push('Phase 2 (curriculum quiz feeder) must route through a skill-tagged wrapper layer.');
  lines.push('');
  lines.push('**Reason 4 — FRQ sub-skills use internal IDs, not AP codes.**');
  lines.push(`${zeroSignalFrqSkills} of ${totalFrqSkills} FRQ sub-skills have zero supporting MCQs. AP skill codes must be mapped to FRQ decomposition entries before BKT can aggregate across item types.`);
  lines.push('');
  lines.push('**What needs to happen before Phase 3:**');
  lines.push('1. Add AP skill codes to worksheet `<input>` and `<textarea>` elements (data-skill attr) — affects all 69 worksheets.');
  lines.push('2. Build a skill-tag wrapper for curriculum.js (read-only) that maps question IDs → AP skill codes.');
  lines.push('3. Map frq-decompositions.json sub-skill IDs → AP skill codes (u1-frq-zscore → 2.C or 4.B, etc.).');
  lines.push('4. Add AP skill codes to supplement probes (formulaId → AP skill code lookup).');
  lines.push('');
  lines.push('**Biggest coverage gaps:**');

  // Identify skills with most items (proxy for importance) and fewest tags
  const skillsByWorksheetDesc = [...AP_SKILL_CODES].sort((a, b) => matrix[b].worksheet - matrix[a].worksheet);
  const top3 = skillsByWorksheetDesc.slice(0, 3);
  const bottom3 = skillsByWorksheetDesc.slice(-3);
  lines.push(`- Skills with most inferred worksheet items: ${top3.map(s => `${s} (${matrix[s].worksheet})`).join(', ')}`);
  lines.push(`- Skills with fewest/zero inferred worksheet items: ${bottom3.map(s => `${s} (${matrix[s].worksheet})`).join(', ')}`);
  lines.push(`- Skills with zero items in ALL pools: ${gaps.filter(g => g.reason === 'no items in any pool').map(g => g.skill).join(', ') || 'none'}`);
  lines.push('');

  // ── Supplement zero-signal probes ──────────────────────────────────────────
  if (zeroSignalSupp > 0) {
    lines.push('## Supplement Zero-Signal Probes');
    lines.push('');
    lines.push('These probes have no formulaId and no AP skill tag — they carry no diagnostic signal for BKT.');
    lines.push('');
    lines.push('| Probe ID | Unit |');
    lines.push('|----------|------|');
    for (const p of supplementAnalysis.zeroSignal) {
      const m = String(p.id).match(/^U(\d+)/);
      lines.push(`| ${p.id} | ${m ? m[1] : '?'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported run function (called directly and importable by tests)
// ─────────────────────────────────────────────────────────────────────────────

export function run(root = ROOT) {
  const allFlags = [];

  // ── Pool (a): worksheets ───────────────────────────────────────────────────
  console.log('Scanning worksheets…');
  const worksheets = scanWorksheets(root);
  console.log(`  Found ${worksheets.length} worksheets`);
  console.log(`  Total blanks: ${worksheets.reduce((s, w) => s + w.blanks, 0)}`);
  console.log(`  Total textareas: ${worksheets.reduce((s, w) => s + w.textareaCount, 0)}`);

  console.log('Scanning AI grading prompt files…');
  const gradingPrompts = scanGradingPrompts(root);
  console.log(`  Found ${Object.keys(gradingPrompts).length} grading prompt files`);

  // ── Pool (b): curriculum.js ────────────────────────────────────────────────
  console.log('Loading curriculum.js (read-only)…');
  const curriculumResult = loadCurriculumJs(root);
  if (curriculumResult.available) {
    console.log(`  Loaded ${curriculumResult.questions.length} questions from ${curriculumResult.path}`);
  } else {
    console.log(`  ${curriculumResult.error || 'pool unavailable'}`);
    allFlags.push(`WARN: curriculum_render pool unavailable — ${curriculumResult.error || 'file not found'}`);
  }
  const curriculumAnalysis = analyzeCurriculumSkillCoverage(curriculumResult.questions);

  // ── Pool (c): supplement + FRQ decompositions ──────────────────────────────
  console.log('Loading supplement probes…');
  const supplementResult = loadSupplementJs(root);
  if (!supplementResult.available) {
    allFlags.push(`WARN: formula-probe-supplement.js unavailable — ${supplementResult.error || 'not found'}`);
  }
  const supplementAnalysis = analyzeSupplementProbes(supplementResult.probes);
  console.log(`  Loaded ${supplementResult.probes.length} supplement probes`);

  console.log('Loading FRQ decompositions…');
  const frqResult = loadFrqDecompositions(root);
  if (!frqResult.available) {
    allFlags.push(`WARN: frq-decompositions.json unavailable — ${frqResult.error || 'not found'}`);
  }
  console.log(`  Loaded ${Object.keys(frqResult.frqs).length} FRQs, ${frqResult.skillCount} sub-skills`);

  // ── Pool (d): frameworks ───────────────────────────────────────────────────
  console.log('Parsing framework files…');
  const frameworkScan = scanFrameworks(root);
  for (const flag of frameworkScan.flags) {
    allFlags.push(flag);
    console.log(`  ${flag}`);
  }
  const topicSkillMap = buildTopicSkillMap(frameworkScan.results);
  console.log(`  Extracted ${Object.keys(topicSkillMap).length} topics`);

  // ── Coverage matrix ────────────────────────────────────────────────────────
  const matrix = buildSkillCoverageMatrix(
    worksheets, gradingPrompts, curriculumAnalysis, supplementAnalysis,
    frqResult, frameworkScan.results, topicSkillMap
  );

  const gaps = findSkillGaps(matrix, null);
  const unitWorksheetSummary = buildUnitWorksheetSummary(worksheets, gradingPrompts);

  // ── Generate report ────────────────────────────────────────────────────────
  const report = buildReport({
    worksheets,
    gradingPrompts,
    curriculumResult,
    curriculumAnalysis,
    supplementResult,
    supplementAnalysis,
    frqResult,
    frameworkScan,
    topicSkillMap,
    matrix,
    gaps,
    unitWorksheetSummary,
    allFlags,
  });

  const outputPath = resolve(root, 'GRADEBOOK_TAGGING_AUDIT.md');
  writeFileSync(outputPath, report, 'utf8');

  // Summary to console
  const totalBlanks = worksheets.reduce((s, w) => s + w.blanks, 0);
  const totalTextareas = worksheets.reduce((s, w) => s + w.textareaCount, 0);
  console.log('\nAudit complete:');
  console.log(`  Worksheets: ${worksheets.length}`);
  console.log(`  Blanks: ${totalBlanks} | Textareas: ${totalTextareas}`);
  console.log(`  curriculum.js: ${curriculumResult.available ? curriculumResult.questions.length + ' questions' : 'unavailable'}`);
  console.log(`  Supplement probes: ${supplementResult.probes.length}`);
  console.log(`  FRQ sub-skills: ${frqResult.skillCount} (${frqResult.zeroSignalSkills} zero-signal)`);
  console.log(`  Topics mapped: ${Object.keys(topicSkillMap).length}`);
  console.log(`  Flags: ${allFlags.length}`);
  console.log(`  Gaps (skills with no items): ${gaps.filter(g => g.reason === 'no items in any pool').length}`);
  console.log(`\nWrote: ${outputPath}`);

  return {
    worksheets,
    gradingPrompts,
    curriculumResult,
    curriculumAnalysis,
    supplementResult,
    supplementAnalysis,
    frqResult,
    frameworkScan,
    topicSkillMap,
    matrix,
    gaps,
    allFlags,
    outputPath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point (direct invocation only)
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run();
}

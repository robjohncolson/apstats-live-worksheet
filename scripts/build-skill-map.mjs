/**
 * scripts/build-skill-map.mjs
 * Node 18+ ESM, zero external dependencies.
 *
 * CLI: node scripts/build-skill-map.mjs
 * Writes:
 *   data/skill-map.json  — unified skill map (all 4 pools)
 *   data/skill-map.js    — browser wrapper: window.SKILL_MAP = {...}
 *
 * Deterministic: two runs are byte-identical except the single timestamp
 * comment line at the top of skill-map.js (marked with // GENERATED:).
 *
 * Schema (FROZEN CONTRACT 1):
 *   { skill: "2.C"|null, candidates: ["2.A",...], confidence: 1.0|0,
 *     provenance: "topic-inherit"|"unresolved", topic: "2.3"|null }
 *
 * Rules:
 *   - Single-skill topic → skill set, candidates=[that one], conf 1.0, provenance "topic-inherit"
 *   - Multi-skill topic  → skill null, candidates=topic skills, conf 0, provenance "unresolved"
 *   - Topic with no skills (7.10, 8.7, 9.6 synthesis) → unresolved, candidates []
 *   - Merges data/skill-map-supplement.json and data/skill-map-frq.json verbatim if present
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseFrameworks } from './lib/framework-parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Topic derivation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Curriculum.js id → topic string or null.
 *
 * Standard form: "U{n}-L{l}-Q{q}"          → topic "{n}.{l}"
 * Infix form:    "U{n}-L{l}-MCQ-Q{q}"      → topic "{n}.{l}"
 *                "U{n}-L{l}-FRQ-Q{q}"      → topic "{n}.{l}"
 * Progress check: "U{n}-PC-..."            → unit-level only; null
 */
function curriculumIdToTopic(id) {
  // Plain form: U1-L1-Q2
  const plain = String(id).match(/^U(\d+)-L(\d+)-Q\d+/);
  if (plain) return `${plain[1]}.${plain[2]}`;

  // Infix form: U5-L6-MCQ-Q02, U9-L3-FRQ-Q01
  const infix = String(id).match(/^U(\d+)-L(\d+)-(?:MCQ|FRQ)-Q\d+/);
  if (infix) return `${infix[1]}.${infix[2]}`;

  return null;
}

/**
 * Build an unresolved entry for items where we cannot derive a lesson-level topic.
 * Used for curriculum.js PC (Progress Check) IDs that are unit-level only.
 * candidates[] must NOT be empty (FC1 requirement); caller populates via unit-union.
 */
function buildUnresolvableEntry(candidates = []) {
  return {
    skill: null,
    candidates,
    confidence: 0,
    provenance: 'unresolved',
    topic: null,
  };
}

/**
 * Worksheet UNIT_ID (embedded in HTML, e.g. "U3L6-7", "U4L1-2", "U1L10")
 * → topic "{unit}.{firstLesson}".
 * Also works on full question IDs: "WS-U4L1-2-Q3" → topic "4.1"
 */
function unitIdToTopic(unitId) {
  // Strip "WS-" prefix if present
  const stripped = String(unitId).replace(/^WS-/, '');
  // Parse "U{n}L{lessons}" where lessons may be "1", "1-2", "1-2-3", "10"
  const m = stripped.match(/^U(\d+)L(\d[\d-]*)/);
  if (!m) return null;
  const unit = m[1];
  const firstLesson = m[2].split('-')[0];
  return `${unit}.${firstLesson}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build one skill-map entry from a topic's skill list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a FC1-compliant entry for a given topic.
 * @param {string} topic - e.g. "2.3"
 * @param {string[]} topicSkills - skills from framework (may be empty)
 * @returns FC1 entry object
 */
function buildEntry(topic, topicSkills) {
  if (topicSkills.length === 1) {
    return {
      skill: topicSkills[0],
      candidates: [topicSkills[0]],
      confidence: 1.0,
      provenance: 'topic-inherit',
      topic,
    };
  }
  // Multi-skill or no-skill: unresolved
  return {
    skill: null,
    candidates: [...topicSkills],
    confidence: 0,
    provenance: 'unresolved',
    topic,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (a): Worksheet IDs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the UNIT_ID embedded in a worksheet HTML file.
 * Pattern: const UNIT_ID = 'U4L1-2';
 * or:      const WORKSHEET_ID = 'WS-U3L6-7';
 * Returns the normalized "U{n}L{lessons}" form, or null.
 */
function extractWorksheetUnitId(html) {
  const m1 = html.match(/const\s+UNIT_ID\s*=\s*['"]([^'"]+)['"]/);
  if (m1) return m1[1];

  const m2 = html.match(/const\s+WORKSHEET_ID\s*=\s*['"]WS-([^'"]+)['"]/);
  if (m2) return m2[1];

  return null;
}

/**
 * Scan all worksheets, generate all question IDs (WS-{UNIT_ID}-Q{N}),
 * and return Map<questionId, topic>.
 */
function buildWorksheetIds(root) {
  const idToTopic = new Map();
  const files = readdirSync(root)
    .filter(f => /^u\d+_lesson.+_live\.html$/.test(f))
    .sort();

  for (const filename of files) {
    const html = readFileSync(resolve(root, filename), 'utf8');
    const unitId = extractWorksheetUnitId(html);
    if (!unitId) {
      console.warn(`  WARN: Could not extract UNIT_ID from ${filename}`);
      continue;
    }

    const topic = unitIdToTopic(unitId);
    if (!topic) {
      console.warn(`  WARN: Could not derive topic from UNIT_ID=${unitId} in ${filename}`);
      continue;
    }

    // Count blanks (data-answer) and textareas to know how many Q IDs to emit
    const blanks = (html.match(/data-answer=/g) || []).length;
    const textareaIds = [];
    const textareaBlocks = html.match(/<textarea[^>]*>/g) || [];
    for (const block of textareaBlocks) {
      const m = block.match(/id=['"]([^'"]+)['"]/);
      // Skip unrendered JS template-literal artifacts (e.g. the appeal-form
      // `<textarea id="appeal-text-${questionId}">` lives inside a template
      // string, never the static DOM). Capturing these created 1 phantom
      // skill-map key per worksheet (GRADEBOOK_FEEDER_ID_AUDIT.md). The
      // worksheet runtime never emits them, so they corrupt the work-manifest
      // (over-counts expected items by 1/worksheet → never 100%).
      if (m && !m[1].includes('${') && !m[1].includes('`')) textareaIds.push(m[1]);
    }

    const prefix = `WS-${unitId}`;

    // Blank question IDs: WS-{UNIT_ID}-Q1 through Q{blanks}
    for (let i = 1; i <= blanks; i++) {
      idToTopic.set(`${prefix}-Q${i}`, topic);
    }

    // Textarea IDs: used as-is (reflect1, exitTicket, etc.) keyed under the worksheet prefix
    // The build doc says worksheet question ids; textareas are separate IDs in the worksheets
    // Per FC3: worksheet ids are WS-U{U}L{lessons}-Q{N} (blanks). Textareas have their own IDs.
    // We include textarea IDs too as part of the worksheet pool.
    for (const tid of textareaIds) {
      // Check if textarea id looks like a standard reflect/exit id
      idToTopic.set(`${prefix}-${tid}`, topic);
    }
  }

  return idToTopic;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (b): curriculum.js IDs (READ ONLY — never write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load curriculum.js ids. Returns Map<questionId, topic>.
 * Reads only the id field — never writes the file.
 */
function buildCurriculumIds(root) {
  const idToTopic = new Map();
  const candidatePaths = [
    resolve(root, '../curriculum_render/data/curriculum.js'),
    resolve(root, '../curriculum_render_v2/data/curriculum.js'),
  ];

  for (const p of candidatePaths) {
    if (!existsSync(p)) continue;

    try {
      const source = readFileSync(p, 'utf8');
      const fn = new Function(
        source.replace(/^const\s+EMBEDDED_CURRICULUM\s*=\s*/, 'var EMBEDDED_CURRICULUM = ')
          + '; return EMBEDDED_CURRICULUM;'
      );
      const questions = fn();
      if (!Array.isArray(questions)) break;

      for (const q of questions) {
        const topic = curriculumIdToTopic(q.id);
        // topic is null for PC (Progress Check) ids — still include them
        idToTopic.set(String(q.id), topic);
      }
      console.log(`  Loaded ${idToTopic.size} curriculum.js ids from ${p}`);
    } catch (e) {
      console.warn(`  WARN: Could not parse curriculum.js at ${p}: ${e.message}`);
    }
    break; // Use first available
  }

  if (idToTopic.size === 0) {
    console.log('  curriculum.js unavailable — pool (b) skipped');
  }

  return idToTopic;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool (c/d): WS-2 supplement and FRQ supplement files (merge verbatim)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load a WS-2 supplement file if present.
 * Returns the parsed object or {} if file is absent.
 */
function loadWs2File(path, name) {
  if (!existsSync(path)) {
    console.log(`  ${name} not present — WS-2 has not delivered yet, skipping`);
    return {};
  }

  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    console.log(`  Merged ${Object.keys(data).length} entries from ${name}`);
    return data;
  } catch (e) {
    console.warn(`  WARN: Could not parse ${name}: ${e.message}`);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main build function
// ─────────────────────────────────────────────────────────────────────────────

export function buildSkillMap(root = ROOT) {
  console.log('Building skill map…');

  // ── Parse frameworks ───────────────────────────────────────────────────────
  console.log('Parsing frameworks…');
  const { topicSkills, malformed } = parseFrameworks(root);
  if (malformed.length > 0) {
    console.log(`  Malformed (still using fallback): ${malformed.join(', ')}`);
  }
  console.log(`  Topics parsed: ${Object.keys(topicSkills).length}`);

  // ── Pool (a): Worksheets ───────────────────────────────────────────────────
  console.log('Scanning worksheet IDs…');
  const worksheetIds = buildWorksheetIds(root);
  console.log(`  Worksheet IDs: ${worksheetIds.size}`);

  // ── Pool (b): curriculum.js ────────────────────────────────────────────────
  console.log('Loading curriculum.js IDs (read-only)…');
  const curriculumIds = buildCurriculumIds(root);

  // ── Merge WS-2 files (verbatim if present) ─────────────────────────────────
  console.log('Merging WS-2 supplement files…');
  const supplementMap = loadWs2File(
    resolve(root, 'data/skill-map-supplement.json'),
    'data/skill-map-supplement.json'
  );
  const frqMap = loadWs2File(
    resolve(root, 'data/skill-map-frq.json'),
    'data/skill-map-frq.json'
  );

  // ── Build unit → skill-union map (for PC candidates) ──────────────────────
  // Pre-compute sorted, deduplicated skill union for each unit across all its topics.
  // Used to populate candidates[] for PC-MCQ and PC-FRQ entries (FC1 requires non-empty).
  const unitSkillUnion = {};
  for (const [topicNum, skills] of Object.entries(topicSkills)) {
    const unit = topicNum.split('.')[0];
    if (!unitSkillUnion[unit]) unitSkillUnion[unit] = new Set();
    for (const s of skills) unitSkillUnion[unit].add(s);
  }
  // Freeze into sorted arrays
  for (const unit of Object.keys(unitSkillUnion)) {
    unitSkillUnion[unit] = Array.from(unitSkillUnion[unit]).sort();
  }

  // ── Load frq-decompositions.json for PC-FRQ candidate resolution ──────────
  // TT1-B: PC-FRQ candidates derived from supportingMcqIds topic-inherit union.
  const frqDecompPath = resolve(root, 'data/frq-decompositions.json');
  let frqDecomp = {};
  if (existsSync(frqDecompPath)) {
    try {
      frqDecomp = JSON.parse(readFileSync(frqDecompPath, 'utf8'));
    } catch (e) {
      console.warn(`  WARN: Could not parse frq-decompositions.json: ${e.message}`);
    }
  }

  /**
   * Derive candidate skills for a PC-FRQ id using TT1-B logic:
   * union of topic-inherit skills from each supportingMcqId across all sub-skills.
   * Falls back to unit-skill-union if none resolved.
   */
  function pcFrqCandidates(pcFrqId) {
    const unitMatch = String(pcFrqId).match(/^U(\d+)/);
    if (!unitMatch) return [];
    const unit = unitMatch[1];

    const decompEntry = frqDecomp[pcFrqId];
    if (!decompEntry || !Array.isArray(decompEntry.skills)) {
      // Not in frq-decompositions.json — fall back to unit-skill-union
      return unitSkillUnion[unit] || [];
    }

    const candidateSet = new Set();
    for (const subSkill of decompEntry.skills) {
      if (!Array.isArray(subSkill.supportingMcqIds)) continue;
      for (const mcqId of subSkill.supportingMcqIds) {
        const topic = curriculumIdToTopic(mcqId);
        if (!topic) continue;
        const skills = topicSkills[topic] || [];
        for (const s of skills) candidateSet.add(s);
      }
    }

    if (candidateSet.size > 0) return Array.from(candidateSet).sort();

    // supportingMcqIds didn't resolve — fall back to unit-skill-union
    return unitSkillUnion[unit] || [];
  }

  // ── Build the unified map ──────────────────────────────────────────────────
  const skillMap = {};

  let resolvedCount = 0;
  let unresolvedCount = 0;

  // Helper: add an entry for one id with a known topic
  function addEntry(id, topic) {
    if (topic === null) {
      // Unit-level PC ids: no lesson-level topic. Populate candidates from unit-skill-union
      // or frq-decompositions (for PC-FRQ). FC1 requires candidates non-empty.
      const unitMatch = String(id).match(/^U(\d+)/);
      const unit = unitMatch ? unitMatch[1] : null;

      let candidates;
      if (/PC-FRQ/.test(id)) {
        // TT1-B: try frq-decompositions.json supportingMcqIds, fall back to unit-union
        candidates = pcFrqCandidates(id);
      } else {
        // PC-MCQ: unit-skill-union
        candidates = (unit && unitSkillUnion[unit]) ? unitSkillUnion[unit] : [];
      }

      skillMap[id] = buildUnresolvableEntry(candidates);
      unresolvedCount++;
      return;
    }
    const skills = topicSkills[topic] || [];
    const entry = buildEntry(topic, skills);
    skillMap[id] = entry;
    if (entry.provenance === 'topic-inherit') resolvedCount++;
    else unresolvedCount++;
  }

  // Pool (a): worksheets
  for (const [id, topic] of worksheetIds) {
    addEntry(id, topic);
  }

  // Pool (b): curriculum.js
  for (const [id, topic] of curriculumIds) {
    addEntry(id, topic);
  }

  // Pool (c/d): WS-2 files — merge verbatim (override if overlap)
  for (const [id, entry] of Object.entries(supplementMap)) {
    skillMap[id] = entry;
    // Don't double-count — WS-2 handles its own resolved/unresolved
  }
  for (const [id, entry] of Object.entries(frqMap)) {
    skillMap[id] = entry;
  }

  // ── Sort keys deterministically ────────────────────────────────────────────
  const sorted = {};
  for (const key of Object.keys(skillMap).sort()) {
    sorted[key] = skillMap[key];
  }

  // ── Write outputs ──────────────────────────────────────────────────────────
  const jsonPath = resolve(root, 'data/skill-map.json');
  const jsPath = resolve(root, 'data/skill-map.js');

  writeFileSync(jsonPath, JSON.stringify(sorted, null, 2), 'utf8');

  // skill-map.js: browser wrapper mirroring data/ti84-procedures.js pattern
  // GENERATED comment is a single clearly-marked line that tests may skip.
  const jsContent = [
    `// GENERATED: ${new Date().toISOString()} — do not edit directly`,
    `// Source: node scripts/build-skill-map.mjs`,
    `window.SKILL_MAP = ${JSON.stringify(sorted, null, 2)};`,
  ].join('\n');
  writeFileSync(jsPath, jsContent, 'utf8');

  const ws2SupplementCount = Object.keys(supplementMap).length;
  const ws2FrqCount = Object.keys(frqMap).length;
  const totalEntries = Object.keys(sorted).length;

  console.log('\nSkill map built:');
  console.log(`  Pool (a) worksheet IDs: ${worksheetIds.size}`);
  console.log(`  Pool (b) curriculum IDs: ${curriculumIds.size}`);
  console.log(`  Pool (c) supplement (WS-2): ${ws2SupplementCount}`);
  console.log(`  Pool (d) FRQ (WS-2): ${ws2FrqCount}`);
  console.log(`  Total entries: ${totalEntries}`);
  console.log(`  topic-inherit (resolved): ${resolvedCount}`);
  console.log(`  unresolved: ${unresolvedCount}`);
  console.log(`\nWrote: ${jsonPath}`);
  console.log(`Wrote: ${jsPath}`);

  return {
    skillMap: sorted,
    topicSkills,
    worksheetIds,
    curriculumIds,
    ws2SupplementCount,
    ws2FrqCount,
    resolvedCount,
    unresolvedCount,
    totalEntries,
    jsonPath,
    jsPath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point (direct invocation only)
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  buildSkillMap();
}

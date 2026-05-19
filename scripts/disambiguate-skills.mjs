/**
 * scripts/disambiguate-skills.mjs
 *
 * Constrained-AI disambiguation of "unresolved" skill-map entries.
 * Sprint T2 of the Gradebook Tagging workstream.
 *
 * CONTRACT (from GRADEBOOK_TAGGING_T1_BUILD.md / GRADEBOOK_TAGGING_SPEC.md §4 step 3):
 *   - For each unresolved entry: given item TEXT + its candidates[] array,
 *     run TWO independent classification passes (dual-pass).
 *   - If both passes pick the same code → resolve:
 *       provenance: "ai-constrained", skill: <picked>, confidence: <avg of two>.
 *   - If the passes disagree → stays unresolved, appended to teacher-review queue.
 *   - The classifier is PLUGGABLE (injected as a function) so tests use a fake
 *     and the real run wires the Codex pipeline.
 *   - NEVER invents a skill code outside the candidates[] array (constrained).
 *   - NEVER writes to data/skill-map.json (canonical map is immutable for this script).
 *
 * CLI:
 *   node scripts/disambiguate-skills.mjs --unit 1 --pilot
 *
 *   --unit <N>    : filter to Unit N unresolved items only (required for pilot)
 *   --pilot       : write outputs to data/skill-map.pilot-u<N>.json +
 *                   data/skill-map.review-queue.pilot-u<N>.json (never touches canonical)
 *   --all         : (future) process all 2642 unresolved items (controlled follow-on)
 *
 * Pluggable classifier interface:
 *   classify(itemText: string, candidates: string[]) => Promise<{skill: string, confidence: number}>
 *   - must return a skill from candidates[] (constrained)
 *   - confidence: 0–1
 *
 * Item text sources (read-only):
 *   - WS-U#L#-Q#       → u*_lesson*_live.html blanks (input.blank context)
 *   - WS-U#L#-reflect* → u*_lesson*_live.html textarea context
 *   - WS-U#L#-exitTicket → same
 *   - WS-U#L#-appeal-* → generic appeal textarea; no item-specific text
 *   - U#-L#-Q#         → ../curriculum_render/data/curriculum.js (prompt field) READ-ONLY
 *   - U#-PC-*          → same (Progress Check items)
 *   - u#-frq-*         → data/frq-decompositions.json (skills[].name + whyItMatters)
 *
 * Output schema (FC1-compatible, adds ai-constrained provenance):
 * {
 *   "item-id": {
 *     "skill": "2.C",
 *     "candidates": ["2.C","4.B"],
 *     "confidence": 0.87,
 *     "provenance": "ai-constrained",
 *     "topic": "1.7"
 *   }
 * }
 *
 * Review queue entry:
 * {
 *   "id": "U1-L3-Q01",
 *   "topic": "1.3",
 *   "candidates": ["2.A","2.B"],
 *   "itemText": "...",
 *   "pass1": { "skill": "2.A", "confidence": 0.7 },
 *   "pass2": { "skill": "2.B", "confidence": 0.6 },
 *   "reason": "dual-pass disagreement"
 * }
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Item-text extraction (read-only sources)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract blank (input.blank) contexts from a single worksheet HTML.
 * Returns a Map from WS item ID → context text.
 */
function extractWorksheetBlanks(htmlPath, unitId) {
  const content = readFileSync(htmlPath, 'utf8');
  // MUST mirror build-skill-map.mjs exactly: it counts `data-answer=`
  // occurrences. Matching `class="blank"` instead picked up a JS regex
  // literal in u3_lesson6-7_live.html (phantom key, Codex MINOR). Keying on
  // data-answer= aligns WS-{unitId}-Q{n} with the canonical skill-map keys.
  const blankRe = /data-answer=/g;
  const positions = [];
  let m;
  while ((m = blankRe.exec(content)) !== null) {
    positions.push(m.index);
  }

  const result = new Map();
  positions.forEach((pos, idx) => {
    const id = `WS-${unitId}-Q${idx + 1}`;
    const start = Math.max(0, pos - 600);
    const chunk = content.slice(start, pos + 10);
    const text = stripHtml(chunk).slice(-250);
    result.set(id, text);
  });
  return result;
}

/**
 * Extract textarea contexts for ALL real textarea ids — mirrors
 * build-skill-map.mjs exactly (parse every <textarea ...> block, take its
 * id, skip JS template-literal artifacts). The old hardcoded
 * ['reflect1','reflect2','exitTicket'] list missed reflect3 (and any other
 * textarea id), routing those items to no-item-text (Codex MAJOR).
 */
function extractWorksheetTextareas(htmlPath, unitId) {
  const content = readFileSync(htmlPath, 'utf8');
  const result = new Map();
  const blocks = content.match(/<textarea[^>]*>/g) || [];

  for (const block of blocks) {
    const idm = block.match(/id=['"]([^'"]+)['"]/);
    if (!idm) continue;
    const taId = idm[1];
    // Skip unrendered JS template-literal artifacts (e.g. the appeal-form
    // `<textarea id="appeal-text-${questionId}">`) — same guard as
    // build-skill-map.mjs so the id namespaces stay identical.
    if (taId.includes('${') || taId.includes('`')) continue;

    const idx = content.indexOf(block);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 600);
    const chunk = content.slice(start, idx + 50);
    const text = stripHtml(chunk).slice(-250);
    result.set(`WS-${unitId}-${taId}`, text);
  }
  return result;
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Load all worksheet item texts for a given unit.
 * Returns Map<itemId, text>.
 */
/**
 * Extract the worksheet UNIT_ID — MUST mirror build-skill-map.mjs exactly so
 * the WS-{unitId}-Q{n} ids align with skill-map keys. Handles both id-decl
 * forms (UNIT_ID and the lone-WORKSHEET_ID form) and single/double quotes.
 */
export function extractWorksheetUnitId(html) {
  const m1 = html.match(/const\s+UNIT_ID\s*=\s*['"]([^'"]+)['"]/);
  if (m1) return m1[1];
  const m2 = html.match(/const\s+WORKSHEET_ID\s*=\s*['"]WS-([^'"]+)['"]/);
  if (m2) return m2[1];
  return null;
}

function loadWorksheetTexts(root, unit) {
  const textMap = new Map();
  // `.+` (not `\d+`) so multi-lesson files (u4_lesson1-2_live.html,
  // u3_lesson6-7_live.html, u4_lesson10-12_live.html, ...) are NOT skipped.
  const files = readdirSync(root)
    .filter(f => new RegExp(`^u${unit}_lesson.+_live\\.html$`).test(f))
    .sort();

  for (const filename of files) {
    const htmlPath = resolve(root, filename);
    const content = readFileSync(htmlPath, 'utf8');
    const unitId = extractWorksheetUnitId(content);
    if (!unitId) continue;

    const blanks = extractWorksheetBlanks(htmlPath, unitId);
    blanks.forEach((text, id) => textMap.set(id, text));

    const textareas = extractWorksheetTextareas(htmlPath, unitId);
    textareas.forEach((text, id) => textMap.set(id, text));
  }
  return textMap;
}

/**
 * Load curriculum.js item prompts (READ-ONLY — never write).
 * Returns Map<itemId, promptText>.
 */
function loadCurriculumTexts(root) {
  const textMap = new Map();
  const paths = [
    resolve(root, '../curriculum_render/data/curriculum.js'),
    resolve(root, '../curriculum_render_v2/data/curriculum.js'),
  ];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const source = readFileSync(p, 'utf8');
      // Execute safely to extract array — never write
      const fn = new Function(
        source.replace(/^const\s+EMBEDDED_CURRICULUM\s*=\s*/, 'var EMBEDDED_CURRICULUM = ')
          + '; return EMBEDDED_CURRICULUM;'
      );
      const items = fn();
      if (!Array.isArray(items)) break;
      for (const item of items) {
        if (item.id && item.prompt) {
          textMap.set(String(item.id), item.prompt);
        }
      }
    } catch (e) {
      console.warn(`  WARN: Could not load curriculum.js from ${p}: ${e.message}`);
    }
    break;
  }
  return textMap;
}

/**
 * Load FRQ sub-skill descriptions from data/frq-decompositions.json.
 * Returns Map<skillId, text>.
 */
function loadFrqTexts(root) {
  const textMap = new Map();
  const p = resolve(root, 'data/frq-decompositions.json');
  if (!existsSync(p)) return textMap;

  const data = JSON.parse(readFileSync(p, 'utf8'));
  for (const [, val] of Object.entries(data)) {
    if (!val.skills) continue;
    for (const skill of val.skills) {
      const text = [skill.name, skill.whyItMatters].filter(Boolean).join(' — ');
      textMap.set(skill.id, text);
    }
  }
  return textMap;
}

/**
 * Build a combined text map for all item IDs in the skill-map.
 */
export function buildItemTextMap(root, unit) {
  const wsTexts = loadWorksheetTexts(root, unit);
  const currTexts = loadCurriculumTexts(root);
  const frqTexts = loadFrqTexts(root);

  const combined = new Map();
  wsTexts.forEach((text, id) => combined.set(id, text));
  currTexts.forEach((text, id) => combined.set(id, text));
  frqTexts.forEach((text, id) => combined.set(id, text));
  return combined;
}

/**
 * Build the item-text map for ALL units (1-9) — the full-run text source.
 * Worksheet texts are per-unit; curriculum.js + frq are global.
 */
export function buildAllItemTextMap(root) {
  const combined = new Map();
  for (let u = 1; u <= 9; u++) {
    loadWorksheetTexts(root, u).forEach((text, id) => combined.set(id, text));
  }
  loadCurriculumTexts(root).forEach((text, id) => combined.set(id, text));
  loadFrqTexts(root).forEach((text, id) => combined.set(id, text));
  return combined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-pass disambiguation engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run constrained dual-pass classification on a batch of unresolved entries.
 *
 * @param {Array<{id, entry, itemText}>} items
 * @param {Function} classifier  (itemText, candidates) => Promise<{skill, confidence}>
 * @returns {Promise<{resolved: Object, reviewQueue: Array}>}
 *   resolved: { [id]: FC1 entry with provenance "ai-constrained" }
 *   reviewQueue: [ {id, topic, candidates, itemText, pass1, pass2, reason} ]
 */
export async function disambiguateBatch(items, classifier) {
  const resolved = {};
  const reviewQueue = [];

  for (const { id, entry, itemText } of items) {
    const { candidates, topic } = entry;

    // Appeal-text items have no item-specific text; always queue for teacher review.
    if (!itemText || id.includes('appeal-text')) {
      reviewQueue.push({
        id,
        topic: topic || null,
        candidates,
        itemText: itemText || null,
        pass1: null,
        pass2: null,
        reason: 'no-item-text',
      });
      continue;
    }

    // Single candidate: should not be unresolved, but handle defensively.
    if (candidates.length === 1) {
      resolved[id] = {
        skill: candidates[0],
        candidates,
        confidence: 1.0,
        provenance: 'ai-constrained',
        topic: topic || null,
      };
      continue;
    }

    // Dual pass
    const pass1 = await classifier(itemText, candidates);
    const pass2 = await classifier(itemText, candidates);

    // Validate: classifier must return a skill from candidates[] (constrained)
    if (!candidates.includes(pass1.skill)) {
      throw new Error(
        `Classifier returned out-of-candidates skill "${pass1.skill}" for ${id}. ` +
        `Candidates: [${candidates.join(',')}]`
      );
    }
    if (!candidates.includes(pass2.skill)) {
      throw new Error(
        `Classifier returned out-of-candidates skill "${pass2.skill}" for ${id}. ` +
        `Candidates: [${candidates.join(',')}]`
      );
    }

    const decision = decideAgreement(id, entry, itemText, pass1, pass2);
    if (decision.resolved) {
      resolved[id] = decision.resolved;
    } else {
      reviewQueue.push(decision.queued);
    }
  }

  return { resolved, reviewQueue };
}

/**
 * Shared dual-pass decision (single source of truth for agree/disagree).
 * Pure: assumes pass1/pass2 are already in-candidates. Returns either
 * { resolved: <FC1 entry> } or { queued: <review-queue entry> }.
 * Used by both disambiguateBatch (live classifier) and disambiguateAll
 * (precomputed Codex passes) so the resolution logic never drifts.
 */
export function decideAgreement(id, entry, itemText, pass1, pass2) {
  const { candidates, topic } = entry;
  if (pass1.skill === pass2.skill) {
    const confidence = (pass1.confidence + pass2.confidence) / 2;
    return {
      resolved: {
        skill: pass1.skill,
        candidates,
        confidence: Math.round(confidence * 100) / 100,
        provenance: 'ai-constrained',
        topic: topic || null,
      },
    };
  }
  return {
    queued: {
      id,
      topic: topic || null,
      candidates,
      itemText,
      pass1,
      pass2,
      reason: 'dual-pass-disagreement',
    },
  };
}

/**
 * Full-run replay path: resolve every item from PRECOMPUTED dual passes
 * (the batched Codex classifier already ran both passes). Mirrors
 * disambiguateBatch's pre-checks (no-text/appeal → queue;
 * single-candidate → resolve conf 1.0) then defers the agree/disagree
 * call to the SAME decideAgreement().
 *
 * Unlike disambiguateBatch, an out-of-candidates pick here ROUTES TO THE
 * QUEUE rather than throwing — a 2,593-item run must not abort on one
 * stray model pick (it just becomes a T3 review item).
 *
 * @param {Array<{id, entry, itemText}>} items
 * @param {Map<string,{skill,confidence}>} pass1Map
 * @param {Map<string,{skill,confidence}>} pass2Map
 */
export function disambiguateAll(items, pass1Map, pass2Map) {
  const resolved = {};
  const reviewQueue = [];

  for (const { id, entry, itemText } of items) {
    const { candidates, topic } = entry;

    if (!itemText || id.includes('appeal-text')) {
      reviewQueue.push({
        id,
        topic: topic || null,
        candidates,
        itemText: itemText || null,
        pass1: null,
        pass2: null,
        reason: 'no-item-text',
      });
      continue;
    }

    if (candidates.length === 1) {
      resolved[id] = {
        skill: candidates[0],
        candidates,
        confidence: 1.0,
        provenance: 'ai-constrained',
        topic: topic || null,
      };
      continue;
    }

    const pass1 = pass1Map.get(id);
    const pass2 = pass2Map.get(id);

    if (!pass1 || !pass2) {
      reviewQueue.push({
        id,
        topic: topic || null,
        candidates,
        itemText,
        pass1: pass1 || null,
        pass2: pass2 || null,
        reason: 'classifier-missing',
      });
      continue;
    }

    if (!candidates.includes(pass1.skill) || !candidates.includes(pass2.skill)) {
      reviewQueue.push({
        id,
        topic: topic || null,
        candidates,
        itemText,
        pass1,
        pass2,
        reason: 'out-of-candidates',
      });
      continue;
    }

    const decision = decideAgreement(id, entry, itemText, pass1, pass2);
    if (decision.resolved) {
      resolved[id] = decision.resolved;
    } else {
      reviewQueue.push(decision.queued);
    }
  }

  return { resolved, reviewQueue };
}

/**
 * Render the human-readable Sprint T3 teacher-verification surface from the
 * machine review queue. Certifier pool (curriculum.js PC/lesson — the
 * proctored grade certifier, decision T-3) is called out FIRST per the
 * spec §2/§3 priority order. This run only PRODUCES this; Sprint T3 acts on it.
 */
export function buildT3QueueDoc(reviewQueue, resolvedCount) {
  const isCertifier = (id) => /^U\d+-(L\d+-Q|PC-)/.test(id);
  const unitOf = (id) => {
    const m = String(id).match(/U(\d+)/i) || String(id).match(/u(\d+)-/);
    return m ? `U${m[1]}` : 'U?';
  };
  const cert = reviewQueue.filter(q => isCertifier(q.id));
  const prac = reviewQueue.filter(q => !isCertifier(q.id));

  const tally = (rows) => {
    const t = {};
    for (const q of rows) {
      const u = unitOf(q.id);
      t[u] = t[u] || {};
      t[u][q.reason] = (t[u][q.reason] || 0) + 1;
    }
    return t;
  };
  const reasons = [...new Set(reviewQueue.map(q => q.reason))].sort();
  const table = (t) => {
    const units = Object.keys(t).sort();
    const lines = [`| Unit | ${reasons.join(' | ')} | total |`,
      `|------|${reasons.map(() => '----:').join('|')}|------:|`];
    for (const u of units) {
      const cells = reasons.map(r => t[u][r] || 0);
      lines.push(`| ${u} | ${cells.join(' | ')} | ${cells.reduce((a, b) => a + b, 0)} |`);
    }
    return lines.join('\n');
  };

  const out = [];
  out.push('# Gradebook Tagging — Sprint T3 Teacher-Verification Queue');
  out.push('');
  out.push(`<!-- GENERATED: ${new Date().toISOString()} by scripts/disambiguate-skills.mjs --all -->`);
  out.push('');
  out.push('Produced by the controlled full T2 run. **Sprint T3 (the next tagging ');
  out.push('sprint) acts on this — this run does NOT block on it.** Auto-resolved ');
  out.push(`(\`ai-constrained\`, dual-pass agreement): **${resolvedCount}**. Needs human `);
  out.push(`review below: **${reviewQueue.length}**.`);
  out.push('');
  out.push('Per spec §6: `unresolved` / un-verified tags **never certify** — they are ');
  out.push('excluded from the certifying rollup until a teacher verifies them here.');
  out.push('');
  out.push(`## 1. CERTIFIER pool first (curriculum.js PC/lesson) — ${cert.length} items`);
  out.push('');
  out.push('These gate Phase-3 READY (decision T-3). Highest priority.');
  out.push('');
  out.push(cert.length ? table(tally(cert)) : '_(none — certifier fully auto-resolved)_');
  out.push('');
  out.push(`## 2. Practice pool (worksheets / FRQ / probes) — ${prac.length} items`);
  out.push('');
  out.push('Capped below mastery anyway; lighter review (spec §T-3).');
  out.push('');
  out.push(prac.length ? table(tally(prac)) : '_(none)_');
  out.push('');
  out.push('## 3. How to act on this queue (Sprint T3)');
  out.push('');
  out.push('- Source of truth = `data/skill-map.review-queue.json` (full per-item ');
  out.push('  `pass1`/`pass2`/`itemText`/`candidates`).');
  out.push('- For each certifier item: pick the correct skill from `candidates`, add it ');
  out.push('  to `data/skill-map.disambiguated.json` with `provenance:"teacher"`, ');
  out.push('  re-run `node scripts/build-skill-map.mjs`, re-run the audit.');
  out.push('- `dual-pass-disagreement` = the two Codex passes split; `no-item-text` = ');
  out.push('  no extractable prompt (e.g. appeal boxes); `out-of-candidates` = model ');
  out.push('  picked outside the framework set (review the framework topic map).');
  out.push('');
  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// AP Skill code descriptions (for the built-in LLM classifier)
// Used to build the classification prompt.
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_DESCRIPTIONS = {
  '1.A': 'Identify the question to be answered or problem to be solved',
  '2.A': 'Describe data presented numerically or graphically',
  '2.B': 'Construct numerical or graphical representations of distributions',
  '2.C': 'Calculate summary statistics, relative positions of points within a distribution, correlation, and predicted response',
  '2.D': 'Compare distributions or relative positions of points within a distribution',
  '3.A': 'Determine relative frequencies, proportions, or probabilities using simulation or calculations',
  '3.B': 'Determine parameters for probability distributions',
  '3.C': 'Describe probability distributions',
  '4.A': 'Make an estimate or prediction using a statistical model',
  '4.B': 'Interpret statistical calculations and findings to assign meaning or assess a claim',
  '4.C': 'Verify that inference procedures apply in a given situation',
  '1.B': 'Identify an appropriate method for collecting data',
  '1.C': 'Determine relative frequencies, proportions, or probabilities',
  '1.D': 'Collect data appropriately',
  '1.E': 'Identify potential sources of error',
  '4.E': 'Justify a claim using a decision or conclusion from a significance test',
  // Inference-unit skills (U6-U9) — were missing, degrading those prompts.
  '1.F': 'Identify an appropriate inference method for a significance test',
  '3.D': 'Construct a confidence interval, provided conditions are met',
  '3.E': 'Calculate a test statistic and find a p-value, provided conditions are met',
  '4.D': 'Justify a claim based on a confidence interval',
};

// Prompt/classifier version — part of the cache key so a prompt or
// skill-description change INVALIDATES stale cached batch results
// (otherwise an improved prompt would silently reuse old classifications).
const CLASSIFIER_PROMPT_VERSION = 'v2';

/**
 * Build a classification prompt for the LLM.
 */
function buildClassificationPrompt(itemText, candidates) {
  const descList = candidates.map(c => {
    const desc = SKILL_DESCRIPTIONS[c] || c;
    return `  ${c}: ${desc}`;
  }).join('\n');

  return `You are an AP Statistics curriculum expert. Classify the following assessment item into exactly ONE AP skill code from the provided list.

ITEM TEXT:
${itemText}

CANDIDATE SKILL CODES (you MUST pick exactly one from this list):
${descList}

Rules:
- Pick the skill code that best describes what a student must DO to answer this item.
- 2.A = describing/reading data already shown (shape, center, spread, unusual features).
- 2.B = constructing/building a representation (making a graph or table).
- 2.C = calculating a value (mean, median, z-score, standard deviation, percentile).
- 2.D = comparing two distributions or relative positions.
- 3.A = computing a probability or proportion.
- 4.B = interpreting a result to make a claim or assess a statement.
- If the item asks "which statement is supported/not supported", lean toward 2.A (describing) unless it requires comparison (2.D) or calculation (2.C).
- Items about completing a fill-in-blank during a video lesson: classify by what concept is being filled in.

Respond with ONLY a JSON object: {"skill": "<code>", "confidence": <0.0-1.0>, "reason": "<one sentence>"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in LLM classifier (synchronous rule-based + heuristic for the pilot)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule-based constrained classifier for the pilot run.
 * Implements the same logic as a Claude classification call but deterministically,
 * so the pilot can run without an API key.
 *
 * For the full T2 run, replace this with the Codex pipeline classifier.
 *
 * Strategy:
 *   1. Topic-level prior: per the Unit 1 framework, each topic has a known
 *      primary skill. Use the topic in the entry + item text signals.
 *   2. Item-text signals: keyword patterns that distinguish skill codes.
 *   3. Return a confidence based on signal strength.
 */
export function builtInClassifier(itemText, candidates) {
  const text = (itemText || '').toLowerCase();
  const scores = {};

  // Initialize scores to 0
  for (const c of candidates) scores[c] = 0;

  // Signal: calculation / compute / formula / z-score / standard deviation / mean / median
  const calcSignals = [
    'calculat', 'compute', 'z-score', 'zscore', 'standard deviation', 'mean',
    'sum of squared', 'iqr', 'interquartile', 'percentile', 'quartile',
    'what is the', 'how many', 'find the', 'determine the value',
  ];
  if (candidates.includes('2.C')) {
    for (const s of calcSignals) {
      if (text.includes(s)) scores['2.C'] += 2;
    }
  }

  // Signal: constructing a graph / make a / draw a / create a
  const constructSignals = ['construct', 'draw a', 'create a graph', 'make a', 'build a'];
  if (candidates.includes('2.B')) {
    for (const s of constructSignals) {
      if (text.includes(s)) scores['2.B'] += 2;
    }
  }

  // Signal: comparison between two groups / compared to / versus
  const compareSignals = [
    'compar', 'versus', ' vs ', 'difference between', 'both groups',
    'two distributions', 'two groups', 'relative to', 'compared to',
  ];
  if (candidates.includes('2.D')) {
    for (const s of compareSignals) {
      if (text.includes(s)) scores['2.D'] += 2;
    }
  }

  // Signal: probability / proportion / percent / likelihood / at least
  const probSignals = [
    'probabilit', 'proportion', 'what proportion', 'what percent', 'likelihood',
    'at least', 'at most', 'normal distribution', 'within', 'between',
    'closer to', 'approximately normal', 'standard deviation',
  ];
  if (candidates.includes('3.A')) {
    for (const s of probSignals) {
      if (text.includes(s)) scores['3.A'] += 2;
    }
  }

  // Signal: interpret / what does / which statement / claim / supported / not supported
  const interpretSignals = [
    'interpret', 'what does', 'which statement', 'which of the following statements',
    'supported by', 'not supported', 'is correct', 'is true', 'claim',
    'conclude', 'conclusion', 'best describes',
  ];
  if (candidates.includes('4.B')) {
    for (const s of interpretSignals) {
      if (text.includes(s)) scores['4.B'] += 1; // lower weight — many items involve reading
    }
  }

  // Signal: describe / distribution / shape / center / variab / spread
  const describeSignals = [
    'describe', 'distribution', 'shape', 'center', 'variab', 'spread',
    'skew', 'symmetric', 'unimodal', 'bimodal', 'outlier', 'gap',
    'which of the following best describes', 'based on the',
    'histogram shows', 'boxplot shows', 'dotplot shows',
    'frequency table', 'relative frequency', 'bar chart', 'bar graph',
    'pie chart', 'table shows', 'represents',
  ];
  if (candidates.includes('2.A')) {
    for (const s of describeSignals) {
      if (text.includes(s)) scores['2.A'] += 1;
    }
  }

  // Topic-level priors (from the Unit 1 framework UNIT AT A GLANCE table)
  // These act as tie-breakers when scores are close.
  const topicPriors = {
    // topic 1.3: 2.B (primary), 2.A (secondary)
    // topic 1.4: 2.B (primary), 2.A, 2.D
    // topic 1.5: 2.A (primary), 2.B
    // topic 1.7: 2.C (primary), 4.B
    // topic 1.8: 2.B (primary), 2.A
    // topic 1.10: 2.D (primary), 3.A
  };

  // Apply topic priors based on the text context (detect topic from text)
  if (text.includes('frequency table') || text.includes('relative frequency') || text.includes('tabular')) {
    if (candidates.includes('2.B')) scores['2.B'] += 1;
  }
  if (text.includes('bar chart') || text.includes('bar graph') || text.includes('pie chart') || text.includes('histogram')) {
    if (candidates.includes('2.B')) scores['2.B'] += 1;
  }
  if (text.includes('normal distribution') || text.includes('approximately normal') || text.includes('normal with mean')) {
    if (candidates.includes('3.A')) scores['3.A'] += 3; // strong signal for topic 1.10
    if (candidates.includes('2.D')) scores['2.D'] += 1;
  }
  if (text.includes('z-score') || text.includes('zscore') || text.includes('standardized')) {
    if (candidates.includes('2.C')) scores['2.C'] += 3;
    if (candidates.includes('4.B')) scores['4.B'] += 1;
  }
  if (text.includes('mean') && (text.includes('standard deviation') || text.includes('sd'))) {
    if (candidates.includes('2.C')) scores['2.C'] += 2;
  }
  if (text.includes('outlier') && candidates.includes('2.C')) {
    scores['2.C'] += 1; // outlier detection uses IQR rule = calculation
  }
  if (text.includes('outlier') && candidates.includes('4.B')) {
    scores['4.B'] += 1;
  }
  if (text.includes('which of the following is closest') || text.includes('which value is closest')) {
    if (candidates.includes('3.A')) scores['3.A'] += 2;
  }
  // "is an outlier" / "is not an outlier" → 2.C (calculation to verify)
  if (text.includes('is an outlier') || text.includes('outlier for the')) {
    if (candidates.includes('2.C')) scores['2.C'] += 2;
  }
  // Boxplot → 2.B or 2.A
  if (text.includes('boxplot')) {
    if (candidates.includes('2.A')) scores['2.A'] += 1;
    if (candidates.includes('2.B')) scores['2.B'] += 1;
  }
  // "which of the following statements is supported" → 2.A (read/describe)
  if (text.includes('supported by the') || text.includes('not supported by')) {
    if (candidates.includes('2.A')) scores['2.A'] += 2;
  }
  // "describe the relationship" → 2.A
  if (text.includes('relationship between') || text.includes('best describes the relationship')) {
    if (candidates.includes('2.A')) scores['2.A'] += 2;
  }
  // Continuous / discrete → identifying variable type → 2.A
  if (text.includes('continuous') || text.includes('discrete')) {
    if (candidates.includes('2.A')) scores['2.A'] += 2;
    if (candidates.includes('2.B')) scores['2.B'] += 1;
  }

  // Fill-in-blank video lessons: the blank is likely about reading/describing
  // (most video-follow-along questions are definitional/descriptive)
  if (text.includes('video') || text.includes('[0:') || text.includes('lesson')) {
    if (candidates.includes('2.A')) scores['2.A'] += 0.5;
    if (candidates.includes('2.B')) scores['2.B'] += 0.5;
  }

  // Find best candidate
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const [c, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  // If tied, use first candidate as tiebreaker (deterministic)
  const tied = Object.entries(scores).filter(([, s]) => s === bestScore);
  if (tied.length > 1) {
    best = tied[0][0]; // first in candidate order
  }

  // Confidence: based on score margin and total signals
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const margin = sortedScores.length > 1 ? sortedScores[0] - sortedScores[1] : sortedScores[0];
  let confidence;
  if (bestScore === 0) {
    confidence = 0.5; // no signals, random-ish
  } else if (margin >= 4) {
    confidence = 0.9;
  } else if (margin >= 2) {
    confidence = 0.75;
  } else if (margin >= 1) {
    confidence = 0.65;
  } else {
    confidence = 0.5;
  }

  // For two-candidate sets: amplify confidence if signal is strong
  if (candidates.length === 2 && bestScore >= 3) {
    confidence = Math.min(0.92, confidence + 0.1);
  }

  return Promise.resolve({ skill: best, confidence });
}

// ─────────────────────────────────────────────────────────────────────────────
// Batched Codex classifier (the real full-run pipeline, signed-off §5 #1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize to ASCII (carry-forward gotcha: non-ASCII in Codex prompts can
 * crash on cp1252 0x97). Maps common math/typographic unicode to ASCII,
 * strips the rest.
 */
export function asciiSanitize(s) {
  if (!s) return '';
  return String(s)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[×]/g, 'x')
    .replace(/[÷]/g, '/')
    .replace(/[≠]/g, '!=')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[±]/g, '+/-')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/[√]/g, 'sqrt')
    .replace(/[μ]/g, 'mu')
    .replace(/[σ]/g, 'sigma')
    .replace(/[ρ]/g, 'rho')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[χ]/g, 'chi')
    .replace(/[ ]/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const CODEX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['classifications'],
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'skill', 'confidence'],
        properties: {
          id: { type: 'string' },
          skill: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  },
};

/** Build one ASCII batch-classification prompt. */
export function buildBatchPrompt(batch) {
  const seen = new Set();
  let descBlock = '';
  for (const it of batch) {
    for (const c of it.candidates) {
      if (!seen.has(c)) {
        seen.add(c);
        descBlock += `  ${c}: ${SKILL_DESCRIPTIONS[c] || c}\n`;
      }
    }
  }
  let body = '';
  for (const it of batch) {
    body +=
      `[${it.id}] candidates=${JSON.stringify(it.candidates)} topic=${it.topic || 'n/a'}\n` +
      `  text: ${asciiSanitize(it.itemText).slice(0, 300)}\n`;
  }
  return (
    'You are an AP Statistics curriculum expert. For EACH assessment item below, ' +
    'pick exactly ONE AP skill code that best describes what a student must DO to ' +
    'answer it. You MUST pick from that item\'s own candidate list ONLY -- never ' +
    'use a code outside an item\'s candidates.\n\n' +
    'AP skill code meanings:\n' +
    descBlock +
    '\nGuidance: 2.A=describe/read data shown; 2.B=construct a representation; ' +
    '2.C=calculate a value; 2.D=compare distributions/positions; 3.A=compute a ' +
    'probability/proportion; 3.B=find a distribution parameter; 3.C=describe a ' +
    'probability distribution; 4.A=estimate/predict from a model; 4.B=interpret a ' +
    'result/assess a claim; 4.C=verify inference conditions; 4.E=justify a claim ' +
    'from an inference decision.\n\n' +
    `ITEMS (${batch.length}):\n` +
    body +
    `\nReturn JSON {"classifications":[{"id","skill","confidence"}]} covering ALL ` +
    `${batch.length} items. skill MUST be one of that item's candidates; ` +
    'confidence is 0.0-1.0.'
  );
}

/**
 * Resolve how to spawn codex WITHOUT a shell. Going through cmd.exe
 * (`shell:true`) on Windows mangles a large stdin prompt and orphans the
 * real codex grandchild — proven failure at batch scale. The codex `.cmd`
 * shim is just `node <pkg>/bin/codex.js %*`; spawning that codex.js with
 * the current node binary gives a clean direct stdin pipe and correct
 * child lifecycle. Mirrors the cross-agent runner's Windows resolver.
 */
function resolveCodexSpawn() {
  if (process.env.CODEX_JS && existsSync(process.env.CODEX_JS)) {
    return { cmd: process.execPath, base: [process.env.CODEX_JS], shell: false };
  }
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const exeNames = process.platform === 'win32'
    ? ['codex.cmd', 'codex.exe', 'codex']
    : ['codex'];
  for (const dir of (process.env.PATH || '').split(pathSep)) {
    if (!dir) continue;
    for (const name of exeNames) {
      const full = resolve(dir, name);
      if (!existsSync(full)) continue;
      const js = resolve(dir, 'node_modules/@openai/codex/bin/codex.js');
      if (existsSync(js)) {
        return { cmd: process.execPath, base: [js], shell: false };
      }
      // Found the launcher but not the JS entry: use it directly.
      return { cmd: full, base: [], shell: name.endsWith('.cmd') };
    }
  }
  // Last resort: PATH lookup via shell (old behavior).
  return { cmd: 'codex', base: [], shell: process.platform === 'win32' };
}

const CODEX_SPAWN = resolveCodexSpawn();

/** Spawn one `codex exec` batch; resolve to parsed classifications array. */
function runCodexBatch(prompt, { root, schemaPath, outFile, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const args = [
      ...CODEX_SPAWN.base,
      'exec',
      '-s', 'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--output-schema', schemaPath,
      '-o', outFile,
      '-',
    ];
    const errFile = outFile.replace(/\.json$/, '.err.txt');
    let stderr = '';
    // BLOCKER fix: never let a stale -o file from a prior run be parsed as
    // fresh output. Delete it before spawn; only accept output when codex
    // exited 0 AND (re)wrote the file this invocation.
    try { if (existsSync(outFile)) unlinkSync(outFile); } catch { /* ignore */ }
    let exitCode = null;
    const child = spawn(CODEX_SPAWN.cmd, args, {
      cwd: root,
      shell: CODEX_SPAWN.shell,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (val === null) {
        try { writeFileSync(errFile, `exit=${exitCode}\n` + stderr.slice(-2000), 'utf8'); } catch { /* ignore */ }
      }
      resolvePromise(val);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(null);
    }, timeoutMs);
    if (child.stderr) child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', (e) => { stderr += `\nspawn error: ${e.message}`; finish(null); });
    child.on('exit', (code) => { exitCode = code; });
    child.on('close', () => {
      if (exitCode !== 0) return finish(null);          // codex must have succeeded
      if (!existsSync(outFile)) return finish(null);     // ...and written THIS run
      try {
        const raw = readFileSync(outFile, 'utf8').trim();
        const jsonStart = raw.indexOf('{');
        const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw);
        finish(Array.isArray(parsed.classifications) ? parsed.classifications : null);
      } catch {
        finish(null);
      }
    });
    child.stdin.on('error', () => { /* ignore EPIPE if codex exits early */ });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Batched Codex classifier. Runs ONE independent pass over all items.
 * Resumable: each batch's parsed result is cached at
 * <tmpDir>/pass<label>-batch<NN>.json and reused on re-run.
 *
 * @returns {Promise<Map<string,{skill,confidence}>>}
 */
export async function codexBatchClassify(items, opts) {
  const {
    root,
    passLabel,
    tmpDir,
    batchSize = 40,
    concurrency = 5,
    timeoutMs = 600000,
    log = () => {},
  } = opts;

  mkdirSync(tmpDir, { recursive: true });
  const schemaPath = resolve(tmpDir, 'codex-schema.json');
  writeFileSync(schemaPath, JSON.stringify(CODEX_SCHEMA), 'utf8');

  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  log(`  pass ${passLabel}: ${items.length} items in ${batches.length} batches (concurrency ${concurrency})`);

  const result = new Map();
  let nextBatch = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const idx = nextBatch++;
      if (idx >= batches.length) return;
      const batch = batches[idx];
      const tag = String(idx).padStart(3, '0');
      const batchIds = new Set(batch.map(b => b.id));
      // Truly content-addressed cache key: prompt version + the FULL batch
      // content (id + itemText + candidates + topic). If the skill map, text
      // extraction, or prompt changes while ids stay the same, the hash
      // changes and stale classifications are NOT reused (MAJOR fix).
      const sig = CLASSIFIER_PROMPT_VERSION + '|' + batch
        .map(b => `${b.id}${b.itemText || ''}${(b.candidates || []).join(',')}${b.topic || ''}`)
        .join('');
      let h = 5381;
      for (let k = 0; k < sig.length; k++) h = ((h * 33) ^ sig.charCodeAt(k)) >>> 0;
      const hx = h.toString(36);
      const cacheFile = resolve(tmpDir, `pass${passLabel}-${CLASSIFIER_PROMPT_VERSION}-b${tag}-${hx}.json`);
      let classifications = null;

      if (existsSync(cacheFile)) {
        try {
          classifications = JSON.parse(readFileSync(cacheFile, 'utf8'));
        } catch {
          classifications = null;
        }
      }
      if (!Array.isArray(classifications)) {
        const prompt = buildBatchPrompt(batch);
        // outFile is hash-unique (not just batch index) so a concurrent or
        // re-run can never collide / leave a foreign stale file behind.
        const outFile = resolve(tmpDir, `pass${passLabel}-out-${hx}.json`);
        classifications = await runCodexBatch(prompt, { root, schemaPath, outFile, timeoutMs });
        if (Array.isArray(classifications)) {
          writeFileSync(cacheFile, JSON.stringify(classifications), 'utf8');
        }
      }
      if (Array.isArray(classifications)) {
        // BLOCKER fix: only accept ids that BELONG to this batch (drops
        // foreign/stale-file content and out-of-batch hallucinated ids).
        let matched = 0;
        for (const c of classifications) {
          if (c && typeof c.id === 'string' && typeof c.skill === 'string' && batchIds.has(c.id)) {
            result.set(c.id, {
              skill: c.skill,
              confidence: typeof c.confidence === 'number' ? c.confidence : 0.5,
            });
            matched++;
          }
        }
        if (matched < batch.length) {
          log(`  pass ${passLabel}: batch ${tag} PARTIAL ${matched}/${batch.length} (rest -> review queue)`);
        }
      }
      completed++;
      log(`  pass ${passLabel}: batch ${completed}/${batches.length} done (${result.size} classified)`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
  );
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const unitIdx = args.indexOf('--unit');
  const isPilot = args.includes('--pilot');
  const isAll = args.includes('--all');

  if (unitIdx === -1 && !isAll) {
    console.error('Usage: node scripts/disambiguate-skills.mjs --unit <N> --pilot');
    console.error('       node scripts/disambiguate-skills.mjs --all   (full controlled run)');
    console.error('       [--batch-size N] [--concurrency N] [--limit N] [--tmp-dir DIR]');
    process.exit(1);
  }

  const unit = unitIdx !== -1 ? parseInt(args[unitIdx + 1], 10) : null;
  if (isPilot && !unit) {
    console.error('--pilot requires --unit <N>');
    process.exit(1);
  }

  // Load the canonical skill-map (READ-ONLY — never write back to this file)
  const skillMapPath = resolve(ROOT, 'data/skill-map.json');
  if (!existsSync(skillMapPath)) {
    console.error('data/skill-map.json not found. Run build-skill-map.mjs first.');
    process.exit(1);
  }
  const skillMap = JSON.parse(readFileSync(skillMapPath, 'utf8'));

  // Filter to unresolved items
  let unresolvedEntries = Object.entries(skillMap).filter(([, v]) => v.provenance === 'unresolved');
  if (unit !== null) {
    unresolvedEntries = unresolvedEntries.filter(([id]) => {
      // Match WS-U<N>..., U<N>-..., or u<N>-...
      return new RegExp(`^(WS-U${unit}|U${unit}-|u${unit}-)`, 'i').test(id);
    });
  }

  // Optional --limit N (smoke a subset of the full run, deterministic by key order)
  const limitIdx = args.indexOf('--limit');
  if (isAll && limitIdx !== -1) {
    const n = parseInt(args[limitIdx + 1], 10);
    if (Number.isFinite(n) && n > 0) unresolvedEntries = unresolvedEntries.slice(0, n);
  }

  console.log(`\nDisambiguating ${unresolvedEntries.length} unresolved items (unit=${unit || 'all'}, pilot=${isPilot}, all=${isAll})...`);

  // Build item text map
  console.log('Building item text map...');
  const textMap = isAll
    ? buildAllItemTextMap(ROOT)
    : buildItemTextMap(ROOT, unit !== null ? unit : null);
  console.log(`  Text map loaded: ${textMap.size} entries`);

  // Prepare items for disambiguation
  const items = unresolvedEntries.map(([id, entry]) => ({
    id,
    entry,
    itemText: textMap.get(id) || null,
  }));

  const withText = items.filter(i => i.itemText).length;
  const noText = items.filter(i => !i.itemText).length;
  console.log(`  Items with text: ${withText}, without text: ${noText}`);

  let resolved;
  let reviewQueue;

  if (isAll) {
    // ── Full run: real Codex pipeline, dual INDEPENDENT passes ──────────────
    const tmpIdx = args.indexOf('--tmp-dir');
    const tmpDir = resolve(ROOT, tmpIdx !== -1 ? args[tmpIdx + 1] : '.t2tmp');
    const bsIdx = args.indexOf('--batch-size');
    const ccIdx = args.indexOf('--concurrency');
    const batchSize = bsIdx !== -1 ? parseInt(args[bsIdx + 1], 10) : 40;
    const concurrency = ccIdx !== -1 ? parseInt(args[ccIdx + 1], 10) : 5;

    // Only items WITH text and >1 candidate need the classifier; the rest are
    // decided structurally by disambiguateAll (no Codex spend on them).
    const toClassify = items
      .filter(i => i.itemText && !i.id.includes('appeal-text') && i.entry.candidates.length > 1)
      .map(i => ({ id: i.id, itemText: i.itemText, candidates: i.entry.candidates, topic: i.entry.topic }));

    console.log(`\nCodex pipeline: ${toClassify.length} items need classification ` +
      `(batch ${batchSize}, concurrency ${concurrency}, tmp ${tmpDir})`);

    console.log('\nPass A...');
    const passA = await codexBatchClassify(toClassify, {
      root: ROOT, passLabel: 'A', tmpDir, batchSize, concurrency, log: console.log,
    });
    console.log('\nPass B (independent)...');
    const passB = await codexBatchClassify(toClassify, {
      root: ROOT, passLabel: 'B', tmpDir, batchSize, concurrency, log: console.log,
    });

    ({ resolved, reviewQueue } = disambiguateAll(items, passA, passB));
  } else {
    // ── Pilot / per-unit: deterministic built-in classifier ─────────────────
    console.log('\nRunning dual-pass classification (built-in)...');
    ({ resolved, reviewQueue } = await disambiguateBatch(items, builtInClassifier));
  }

  const resolvedCount = Object.keys(resolved).length;
  const queuedCount = reviewQueue.length;
  const resolveRate = ((resolvedCount / items.length) * 100).toFixed(1);

  // Reason breakdown for the queue
  const reasonCounts = {};
  for (const q of reviewQueue) reasonCounts[q.reason] = (reasonCounts[q.reason] || 0) + 1;

  console.log(`\nResults:`);
  console.log(`  Total items:   ${items.length}`);
  console.log(`  Resolved:      ${resolvedCount} (${resolveRate}%)`);
  console.log(`  Review queue:  ${queuedCount}`);
  console.log(`  Queue reasons: ${JSON.stringify(reasonCounts)}`);

  if (isAll) {
    // Full-run artifacts — NEVER touch canonical data/skill-map.json
    const disambPath = resolve(ROOT, 'data/skill-map.disambiguated.json');
    const queuePath = resolve(ROOT, 'data/skill-map.review-queue.json');
    const t3Path = resolve(ROOT, 'GRADEBOOK_TAGGING_T3_QUEUE.md');
    writeFileSync(disambPath, JSON.stringify(resolved, null, 2), 'utf8');
    writeFileSync(queuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
    writeFileSync(t3Path, buildT3QueueDoc(reviewQueue, resolvedCount), 'utf8');
    console.log(`\nFull-run outputs written:`);
    console.log(`  ${disambPath}`);
    console.log(`  ${queuePath}`);
    console.log(`  ${t3Path}`);
  } else if (isPilot && unit !== null) {
    // Write pilot output — NEVER writes to canonical skill-map.json
    const pilotPath = resolve(ROOT, `data/skill-map.pilot-u${unit}.json`);
    const queuePath = resolve(ROOT, `data/skill-map.review-queue.pilot-u${unit}.json`);
    writeFileSync(pilotPath, JSON.stringify(resolved, null, 2), 'utf8');
    writeFileSync(queuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
    console.log(`\nPilot outputs written:`);
    console.log(`  ${pilotPath}`);
    console.log(`  ${queuePath}`);
  }

  console.log('\nDone. data/skill-map.json was NOT modified.');
}

// Only run main() when this script is the direct entry point (not imported by tests).
// ESM entry-point check: compare import.meta.url to the resolved argv[1] URL.
// This prevents vitest from running main() when it imports the module.
(function guardedMain() {
  try {
    const entryUrl = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
    const thisUrl = import.meta.url;
    if (entryUrl !== thisUrl) return; // imported as a module, not run as script
  } catch {
    return; // vitest non-file:// scheme — definitely not the entry point
  }
  main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
  });
}());

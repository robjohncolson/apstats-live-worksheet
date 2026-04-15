/**
 * Structural tests for the AP Statistics Diagnostic Study Guide (v3).
 *
 * The v3 worksheet uses a focused three-pane layout: a weakness rail, one
 * active probe at a time, and a remediation panel. Adaptive probe selection,
 * BKT mastery updates, AI grading, focus synthesis, and export/import remain
 * in place, but the old per-unit card and DAG-renderer shell is gone.
 *
 * These tests assert the structural wiring — they don't render the UI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HTML_PATH = resolve(__dirname, '../study_guide_diagnostic.html');
const PROMPTS_PATH = resolve(__dirname, '../ai-grading-prompts-study-guide.js');

const EXPECTED_GATE_IDS = [
  'U1-PC-FRQ-Q02',
  'U2-PC-FRQ-Q02',
  'U3-PC-FRQ-Q01',
  'U4-PC-FRQ-Q02',
  'U5-PC-FRQ-Q02',
  'U6-PC-FRQ-Q01',
  'U7-PC-FRQ-Q02',
  'U8-PC-FRQ-Q01',
  'U9-PC-FRQ-Q01',
];

describe('ai-grading-prompts-study-guide.js — v2 exports', () => {
  it('exists on disk', () => {
    expect(existsSync(PROMPTS_PATH)).toBe(true);
  });

  it('defines the v2 schema + storage constants', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('SCHEMA_VERSION_SG');
    expect(src).toContain('STORAGE_KEY_SG');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v2');
  });

  it('exposes all required window globals for the worksheet', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('window.LESSON_CONTEXT_SG');
    expect(src).toContain('window.UNIT_TITLES_SG');
    expect(src).toContain('window.UNIT_TOPICS_SG');
    expect(src).toContain('window.GATE_IDS_SG');
    expect(src).toContain('window.buildReflectionPromptSG');
    expect(src).toContain('window.buildFocusSynthesisPromptSG');
    expect(src).toContain('window.getFrameworkContextSG');
    expect(src).toContain('window.stripFrqBoilerplateSG');
  });

  it('lists all 9 expected gate IDs', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    for (const gateId of EXPECTED_GATE_IDS) {
      expect(src, `gate ID ${gateId} should appear`).toContain(gateId);
    }
  });

  it('has UNIT_TITLES entries for all 9 units', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    for (let unit = 1; unit <= 9; unit++) {
      const pattern = new RegExp(`${unit}:\\s*'Unit ${unit}:`);
      expect(src, `UNIT_TITLES_SG[${unit}] should be defined`).toMatch(pattern);
    }
  });
});

describe('ai-grading-prompts-study-guide.js — prompt template structure', () => {
  it('FRQ template uses the AP rubric vocabulary', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('E (Essentially Correct)');
    expect(src).toContain('P (Partially Correct)');
    expect(src).toContain('I (Incorrect)');
  });

  it('FRQ template documents the JSON response schema keys', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('"score"');
    expect(src).toContain('"feedback"');
    expect(src).toContain('"matched"');
    expect(src).toContain('"missing"');
  });

  it('focus synthesis template requests LO-grounded recommendations', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('focusLessons');
    expect(src).toContain('loIds');
    expect(src).toContain('AP Course Framework');
  });
});

describe('study_guide_diagnostic.html — v3 structure', () => {
  it('exists on disk', () => {
    expect(existsSync(HTML_PATH)).toBe(true);
  });

  it('loads railway, curriculum, units, frameworks, and study-guide prompts', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('../railway_config.js');
    expect(src).toContain('../railway_client.js');
    expect(src).toContain('../curriculum_render/data/curriculum.js');
    expect(src).toContain('../curriculum_render/data/units.js');
    expect(src).toContain('../curriculum_render/data/frameworks.js');
    expect(src).toContain('ai-grading-prompts-study-guide.js');
  });

  it('references all 9 expected gate IDs', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    for (const gateId of EXPECTED_GATE_IDS) {
      expect(src, `gate ID ${gateId} should appear`).toContain(gateId);
    }
  });

  it('has the focused v3 layout containers', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="sg-rail"');
    expect(src).toContain('id="sg-active"');
    expect(src).toContain('id="sg-remediation"');
    expect(src).toContain('id="theme-toggle"');
  });

  it('uses the v3 localStorage key', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v3');
  });

  it('POSTs reflections to /api/ai/grade', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('/api/ai/grade');
  });

  it('calls the focus synthesis prompt builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('buildFocusSynthesisPromptSG');
  });

  it('has export and import buttons', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="export-btn"');
    expect(src).toContain('id="import-input"');
  });

  it('embeds a JSON state block id for re-import', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-state-v3');
  });

  it('references EMBEDDED_CURRICULUM, ALL_UNITS_DATA, and UNIT_FRAMEWORKS', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('EMBEDDED_CURRICULUM');
    expect(src).toContain('ALL_UNITS_DATA');
    expect(src).toContain('UNIT_FRAMEWORKS');
  });
});

describe('study_guide_diagnostic.html — DAG / BKT integration', () => {
  it('loads the adaptive-study scripts (topology, tag map, BKT, selector)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/dag-topology.js');
    expect(src).toContain('data/question-lo-map.js');
    expect(src).toContain('lib/bkt.js');
    expect(src).toContain('lib/probe-selector.js');
  });

  it('persists per-unit masteryState through makeDefaultState / normalizeState / getUnit', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const masteryOccurrences = (src.match(/masteryState/g) || []).length;
    expect(masteryOccurrences).toBeGreaterThanOrEqual(6);
  });

  it('defines adaptive probe selection via ProbeSelector with a legacy fallback', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.ProbeSelector');
    expect(src).toContain('selectProbes');
    expect(src).toContain('buildProbesLegacy');
    expect(src).toContain('PROBE_COUNT');
    expect(src).toContain('alreadyAnswered');
  });

  it('updates BKT mastery when a probe is checked', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.BKT.updateMastery');
    expect(src).toContain('loIdsForQuestion');
  });

  it('passes a masterySnapshot into the focus synthesis prompt builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('masterySnapshot');
    expect(src).toContain('ensureMasteryState');
  });

  it('prompt builder renders the mastery block when a snapshot is provided', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('masterySnapshot');
    expect(src).toContain('Current estimated mastery');
  });
});

describe('study_guide_diagnostic.html — v4 daily queue layout', () => {
  it('defines the v5 render pipeline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderQueuePane');
    expect(src).toContain('function renderSeeAllDisclosure');
    expect(src).toContain('function renderActiveProbe');
    expect(src).toContain('function renderRemediation');
    expect(src).toContain('function advanceDailyQueue');
    expect(src).toContain('function advanceDailyQueueV5');
    expect(src).toContain('function applyFrqFocusToBkt');
    expect(src).toContain('function buildCurriculumLink');
    expect(src).toContain('function renderTierInfoModal');
    expect(src).toContain('function setActiveProbe');
    expect(src).toContain('function applyTheme');
  });

  it('no longer references the removed v3 tree-rail pipeline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function renderTreeRail');
    expect(src).not.toContain('function markActiveRailRow');
    expect(src).not.toContain('function pickNextWeakest');
    expect(src).not.toContain('function activateNextWeakest');
  });

  it('no longer references the removed DAG renderer pipeline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('renderDagPanel');
    expect(src).not.toContain('window.DagRenderer');
    expect(src).not.toContain('lib/dag-renderer.js');
  });

  it('loads the formula-backed study-guide data layer scripts in order', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/ap-stats-cartridge.js');
    expect(src).toContain('data/formula-probe-map.js');
    expect(src).toContain('data/formula-probe-supplement.js');
  });

  it('uses the v6 schema version, storage key, and state id', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("STORAGE_KEY = 'apStatsStudyGuideDiagnostic.v6'");
    expect(src).toContain('SCHEMA_VERSION = 6');
    expect(src).toContain('sg-state-v6');
  });

  it('declares v6 storage schema', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v6');
    expect(src).toContain('sg-state-v6');
    expect(src).toContain('SCHEMA_VERSION = 6');
  });

  it('exposes v6 FRQ decomposition helpers', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('getFrqDecomposition');
    expect(src).toContain('computeEffectiveScore');
    expect(src).toContain('computeEffectivePenalty');
    expect(src).toContain('recordHelperUsed');
  });

  it('includes frqHelpers state field', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('frqHelpers');
    expect(src).toContain('defaultFrqHelpers');
    expect(src).toContain('normalizeFrqHelpers');
  });

  it('has FRQ helpers panel class', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-frq-helpers');
  });

  it('loads frq-decompositions.js script', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/frq-decompositions.js');
  });

  it('publishes and consumes __studyGuideV5__ while keeping the v4 bridge inline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.__studyGuideV4__');
    expect(src).toContain('window.__studyGuideV5__');
    expect(src).toContain('tier: 0');
    expect(src).toContain('mcq: 5');
    expect(src).toContain('frq: 1');
    expect(src).toContain('recordFormulaTouch');
  });

  it('renders the v5 tier meter, queue tabs, and FRQ paper toggle hooks', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-tier-meter');
    expect(src).toContain('sg-queue-tabs');
    expect(src).toContain('sg-frq-paper-toggle');
  });

  it('uses the v5 queue generator call sites instead of the old v4 init call', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('pickDailyQueueV5(state, today()');
    expect(src).not.toContain('pickDailyQueue(state, today()');
  });

  it('guards against supplement ID collisions on init', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('supplement ID collision');
  });

  it('links to curriculum_render via query params', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('../curriculum_render/index.html?u=');
  });
});

describe('study_guide_diagnostic.html — Thread 1: formula card modal', () => {
  it('defines showFormulaCardModal function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function showFormulaCardModal(');
  });

  it('uses the .sg-formula-modal class in the modal builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-formula-modal');
  });

  it('calls getFormulaEntry inside showFormulaCardModal to look up formula content', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('getFormulaEntry(formulaId)');
  });

  it('renders the latex block from formulaEntry', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-formula-modal-latex');
    expect(src).toContain('formulaEntry.latex');
  });

  it('renders the hint callout from formulaEntry', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-formula-modal-hint');
    expect(src).toContain('formulaEntry.hint');
  });

  it('calls showFormulaCardModal from doHelperAction formula branch', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("showFormulaCardModal(id, unit, data, questionId)");
  });

  it('calls recordFormulaHint from doHelperAction formula branch', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('recordFormulaHint(id, state)');
  });

  it('exports getFormulaEntry from __studyGuideV4__', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('getFormulaEntry: getFormulaEntry');
  });

  it('exports recordFormulaHint from __studyGuideV4__', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('recordFormulaHint: recordFormulaHint');
  });
});

describe('study_guide_diagnostic.html — Thread 2: SRS hint feed', () => {
  it('defines recordFormulaHint function in the inline v4 block', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function recordFormulaHint(');
  });

  it('includes hintedAt passthrough in normalizeState', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("entry.hintedAt = v.hintedAt");
  });

  it('formulaWeight reads hintedAt for the SRS boost', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('hintedAt');
    expect(src).toContain('hintBoost');
  });
});


describe('study_guide_diagnostic.html — session 79 fix-pass regression tests', () => {
  it('Fix 1: wraps formulaEntry.latex in block-math delimiters for MathJax', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The modal builder must delimit the raw TeX so MathJax recognizes it.
    // Accepts \\[...\\] (block) or \\(...\\) (inline) — either works.
    const hasBlockDelim = src.includes("'\\\\[' + formulaEntry.latex + '\\\\]'") ||
                          src.includes('"\\\\[" + formulaEntry.latex + "\\\\]"') ||
                          src.includes("'\\[' + formulaEntry.latex + '\\]'") ||
                          src.includes('"\\[" + formulaEntry.latex + "\\]"') ||
                          src.includes('`\\\\[${formulaEntry.latex}\\\\]`') ||
                          src.includes('`\\[${formulaEntry.latex}\\]`');
    const hasInlineDelim = src.includes("'\\\\(' + formulaEntry.latex + '\\\\)'") ||
                           src.includes('"\\\\(" + formulaEntry.latex + "\\\\)"') ||
                           src.includes('`\\\\(${formulaEntry.latex}\\\\)`') ||
                           src.includes('`\\(${formulaEntry.latex}\\)`');
    expect(hasBlockDelim || hasInlineDelim).toBe(true);
  });

  it('Fix 2: subconcept rendering accesses sc.q (not bare sc)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The subconcept loop must reference sc.q (the question string), not pass sc directly.
    expect(src).toContain('sc.q');
  });

  it('Fix 2: subconcept rendering accesses sc.correct for the answer', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sc.correct');
  });

  it('Fix 3: used formula buttons still get a click listener (re-open modal)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The else-if branch for used formula buttons must attach a click listener.
    expect(src).toContain("} else if (kind === 'formula') {");
    // And it must call showFormulaCardModal for re-opens.
    expect(src).toContain("showFormulaCardModal(id, unit, data, questionId)");
  });

  it('Fix 3: CSS pointer-events:none scoped to drill buttons only, not all used buttons', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The broad rule locking all [data-used="true"] with pointer-events:none must NOT exist.
    expect(src).not.toContain('.sg-frq-helper-btn[data-used="true"]{opacity:.72;background:var(--sg-bar-track);cursor:default;pointer-events:none}');
    // The drill-specific rule must exist.
    expect(src).toContain('sg-frq-helper-drill-btn[data-used="true"]');
    // Formula buttons must NOT have pointer-events:none when used.
    expect(src).toContain('sg-frq-helper-formula-btn[data-used="true"]');
    expect(src).not.toMatch(/sg-frq-helper-formula-btn\[data-used="true"\][^}]*pointer-events:none/);
  });

  it('Fix 4: null formulaEntry shows a data-issue fallback message in the modal', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // There must be a branch that renders a fallback when formulaEntry is falsy.
    expect(src).toContain('sg-formula-modal-not-found');
    expect(src).toContain('data issue');
  });

  it('Fix 2 (polish): subconcept loop filters out null/malformed entries before rendering', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The filter must guard against null entries and missing .q / .correct fields.
    expect(src).toContain('sc && typeof sc === \'object\' && sc.q && sc.correct');
    // The "Check your understanding" header must only appear inside the validSubconcepts guard.
    expect(src).toContain('validSubconcepts.length');
  });
});

describe('study_guide_diagnostic.html — session 80 formula UX fixes', () => {
  it('helper panel header renders queued-formulas chip when any formula was hinted today', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // renderFrqHelperPanel must call queuedFormulasToday with today().
    expect(src).toContain('queuedFormulasToday(state, today())');
    // The chip container class must be used.
    expect(src).toContain('sg-frq-queued-formulas');
    // CSS rules for the chip must be present.
    expect(src).toContain('.sg-frq-queued-label');
    expect(src).toContain('.sg-frq-queued-list');
  });

  it('queued-formulas chip is omitted when no formulas were queued today', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The chip must only render when queued.length is truthy.
    expect(src).toContain('if (queued.length)');
  });
});

describe('study_guide_diagnostic.html — session 81 review queue panel', () => {
  it('defines renderReviewQueuePanel function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderReviewQueuePanel()');
  });

  it('renderReviewQueuePanel reads from reviewQueueEntries(state, today())', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('reviewQueueEntries(state, today())');
  });

  it('renderReviewQueuePanel renders sg-review-queue disclosure', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-review-queue');
    expect(src).toContain('sg-review-queue-summary');
    expect(src).toContain('sg-review-queue-body');
  });

  it('renderReviewQueuePanel shows count badge', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-review-queue-count');
    expect(src).toContain('entries.length');
  });

  it('renderReviewQueuePanel shows empty-state message when list is empty', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-review-queue-empty');
    expect(src).toContain('No formulas to review yet');
  });

  it('review button click calls showFormulaCardModal with onClose callback', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // Review button must call showFormulaCardModal with entry.id and an onClose callback.
    expect(src).toContain('showFormulaCardModal(entry.id, null, null, null, function()');
    expect(src).toContain('renderReviewQueuePanel()');
  });

  it('graduate button click calls graduateFormula', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('graduateFormula(entry.id, state)');
    expect(src).toContain('sg-review-queue-btn-graduate');
  });

  it('showFormulaCardModal accepts optional onClose parameter', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function showFormulaCardModal(formulaId, unit, data, questionId, onClose)');
  });

  it('closeModal calls onClose when provided, renderActiveProbe otherwise', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('if (typeof onClose === \'function\')');
    expect(src).toContain('onClose()');
    // The else branch must still call renderActiveProbe.
    const closeModalIdx = src.indexOf('if (typeof onClose === \'function\')');
    const region = src.slice(closeModalIdx, closeModalIdx + 200);
    expect(region).toContain('renderActiveProbe()');
  });

  it('renderReviewQueuePanel is called from renderQueuePane at the end', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // renderReviewQueuePanel() must appear inside renderQueuePane, before renderSeeAllDisclosure.
    const queuePaneStart = src.indexOf('function renderQueuePane()');
    const seeAllIdx = src.indexOf('renderSeeAllDisclosure()', queuePaneStart);
    const reviewQueueCallIdx = src.indexOf('renderReviewQueuePanel()', queuePaneStart);
    expect(queuePaneStart).toBeGreaterThan(-1);
    expect(reviewQueueCallIdx).toBeGreaterThan(queuePaneStart);
    expect(reviewQueueCallIdx).toBeLessThan(seeAllIdx);
  });

  it('normalizeState preserves graduated field on touchedFormulas entries', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('if (v.graduated === true) entry.graduated = true');
  });

  it('meta text uses "Hinted today" / "Hinted yesterday" / "Hinted N days ago"', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Hinted today');
    expect(src).toContain('Hinted yesterday');
    expect(src).toContain('Hinted ');
    expect(src).toContain('days ago');
  });

  it('CSS rules for review queue are present', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-review-queue{');
    expect(src).toContain('.sg-review-queue-item{');
    expect(src).toContain('.sg-review-queue-btn{');
    expect(src).toContain('.sg-review-queue-btn-graduate{');
  });

  it('new functions are exported via v4 and destructured from v5', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('daysBetween: daysBetween');
    expect(src).toContain('reviewQueueEntries: reviewQueueEntries');
    expect(src).toContain('graduateFormula: graduateFormula');
    expect(src).toContain('daysBetween, reviewQueueEntries, graduateFormula');
  });
});

describe('study_guide_diagnostic.html — session 82 always-scored simplification', () => {
  it('handleHelperClick calls doHelperAction directly without any mode branching', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // handleHelperClick must be exactly 3 lines: guard + doHelperAction call. No frqMode branching.
    const fnStart = src.indexOf('function handleHelperClick(');
    const fnEnd = src.indexOf('\n      }', fnStart) + '\n      }'.length;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doHelperAction(kind, id, unit, data, questionId)');
    expect(fnBody).not.toContain("frqMode");
    expect(fnBody).not.toContain('showFrqHelperModal');
  });

  it('buildFrqHelperButton cost pills always show real penalty values', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // No 'free' string should appear inside the cost pill branch.
    const fnStart = src.indexOf('function buildFrqHelperButton(');
    const fnEnd = src.indexOf('\n      }', fnStart) + '\n      }'.length;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("'free'");
    // Formula button must show −5%.
    expect(fnBody).toContain('\\u22125%');
    // Drill pending state must show −10% / −15%.
    expect(fnBody).toContain('\\u221210% / \\u221215%');
  });

  it('renderFrqHelperPanel intro always includes the penalty values', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The source contains JS unicode escapes — check for the escape sequences literally.
    expect(src).toContain('Formula cards:');
    expect(src).toContain('Correct drill:');
    expect(src).toContain('Wrong drill:');
    expect(src).toContain('Max total penalty:');
    expect(src).toContain('sg-frq-helpers-intro');
  });

  it('renderFrqHelperPanel includes the escape-hatch note about grading', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-frq-helpers-escape-hatch');
    expect(src).toContain("Click");
    expect(src).toContain("Grade");
    expect(src).toContain("until then, helpers don");
  });

  it('renderGrade signature no longer includes a mode parameter', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderGrade(grade, effectiveScoreResult)');
    expect(src).not.toContain('function renderGrade(grade, effectiveScoreResult, mode)');
  });

  it('renderQueuePane FRQ click handler does not touch unitData.frqMode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The click handler block must not write frqMode.
    const queuePaneStart = src.indexOf('function renderQueuePane()');
    const queuePaneEnd = src.indexOf('\n      function ', queuePaneStart + 1);
    const queuePaneBody = src.slice(queuePaneStart, queuePaneEnd);
    expect(queuePaneBody).not.toContain("frqMode");
  });

  it('makeDefaultState per-unit defaults do not include frqMode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const fnStart = src.indexOf('function makeDefaultState()');
    const fnEnd = src.indexOf('\n      }', fnStart) + '\n      }'.length;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('frqMode');
  });

  it('normalizeState does not preserve frqMode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain("value.frqMode");
  });

  it('showFrqHelperModal is not defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function showFrqHelperModal(');
  });

  it('showGateEscalationModal is not defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function showGateEscalationModal(');
  });

  it('renderFrqModeBanner is not defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function renderFrqModeBanner(');
  });
});

describe('session 84 modal viewport overflow fix', () => {
  it('sg-modal base rule caps height at 90vh with overflow-y auto', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const rule = src.match(/\.sg-modal\{[^}]+\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toContain('max-height:90vh');
    expect(rule[0]).toContain('overflow-y:auto');
  });

  it('sg-modal uses overscroll-behavior:contain to prevent background scroll', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const rule = src.match(/\.sg-modal\{[^}]+\}/);
    expect(rule[0]).toContain('overscroll-behavior:contain');
  });
});

describe('session 83 TI-84 procedure walkthroughs', () => {
  const PROCEDURES_JS_PATH = resolve(__dirname, '../data/ti84-procedures.js');
  const MAP_JS_PATH = resolve(__dirname, '../data/formula-procedure-map.js');
  const PROCEDURES_JSON_PATH = resolve(__dirname, '../ti84-procedures-data.json');

  // Test 1
  it('loads window.TI84_PROCEDURES via data/ti84-procedures.js script tag', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('<script src="data/ti84-procedures.js"></script>');
  });

  // Test 2
  it('loads window.FORMULA_PROCEDURE_MAP via data/formula-procedure-map.js script tag', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('<script src="data/formula-procedure-map.js"></script>');
  });

  // Test 3
  it('defines renderProcedureWalkthrough function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderProcedureWalkthrough(');
  });

  // Test 4
  it('showFormulaCardModal reads window.FORMULA_PROCEDURE_MAP', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.FORMULA_PROCEDURE_MAP || {})[formulaId]');
  });

  // Test 5
  it('showFormulaCardModal renders calc-steps details only when procedure is mapped', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('if (procId && window.TI84_PROCEDURES');
  });

  // Test 6
  it('calc-steps details uses .sg-formula-modal-calc-steps class', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("calcDetails.className = 'sg-formula-modal-calc-steps'");
  });

  // Test 7
  it('calc-steps summary text is "📱 Show calculator steps"', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Show calculator steps');
  });

  // Test 8
  it('renderProcedureWalkthrough renders sg-calc-walkthrough container', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("make('div', 'sg-calc-walkthrough')");
  });

  // Test 9
  it('renderProcedureWalkthrough renders sg-calc-step-list', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("make('ol', 'sg-calc-step-list')");
  });

  // Test 10
  it('renderProcedureWalkthrough renders sg-calc-prereq when dataRequirements non-empty', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-calc-prereq');
    expect(src).toContain('hasDataReqs');
  });

  // Test 11
  it('KEY_DISPLAY map wraps arrow keys as unicode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("RIGHT: '\u2192'");
    expect(src).toContain("DOWN: '\u2193'");
  });

  // Test 12
  it('parameter placeholder keys are rendered as sg-calc-param chips', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("key.startsWith('{') && key.endsWith('}')" );
    expect(src).toContain("sg-calc-param");
  });

  // Test 13
  it('narration wraps [KEY] patterns in <strong>', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.replace(/\\[([A-Z0-9');
    expect(src).toContain('<strong>[$1]</strong>');
  });

  // Test 14
  it('formula-procedure-map.js exports at least 30 mappings', () => {
    const mapSrc = readFileSync(MAP_JS_PATH, 'utf8');
    const win = {};
    // eslint-disable-next-line no-new-func
    new Function('window', mapSrc)(win);
    expect(Object.keys(win.FORMULA_PROCEDURE_MAP).length).toBeGreaterThanOrEqual(30);
  });

  // Test 15
  it('every mapped procedure id exists in the procedures data', () => {
    const mapSrc = readFileSync(MAP_JS_PATH, 'utf8');
    const procSrc = readFileSync(PROCEDURES_JS_PATH, 'utf8');
    const win = {};
    // eslint-disable-next-line no-new-func
    new Function('window', mapSrc)(win);
    // eslint-disable-next-line no-new-func
    new Function('window', procSrc)(win);
    const procedureIds = new Set(win.TI84_PROCEDURES.procedures.map(p => p.id));
    const mapValues = Object.values(win.FORMULA_PROCEDURE_MAP);
    for (const procId of mapValues) {
      expect(procedureIds.has(procId), `Procedure id "${procId}" not found in ti84-procedures-data.json`).toBe(true);
    }
  });
});

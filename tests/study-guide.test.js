/**
 * Structural tests for the AP Statistics Diagnostic Study Guide (v2).
 *
 * The v2 worksheet has per-unit cards with a mode toggle (MCQ / FRQ / Both),
 * immediate client-side MCQ grading, per-unit FRQ grading via the Railway
 * AI endpoint, per-unit focus-synthesis ("Show me what to focus on") that
 * combines MCQ + FRQ signal + AP Course Framework metadata, and export /
 * import of a self-contained HTML file that doubles as the student's
 * submission to the teacher and as a save file for resuming later.
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

describe('study_guide_diagnostic.html — v2 structure', () => {
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

  it('wires a mode toggle per unit (mcq / frq / both)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data-mode="mcq"');
    expect(src).toContain('data-mode="frq"');
    expect(src).toContain('data-mode="both"');
  });

  it('has a container for the 9 unit cards', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="units-container"');
  });

  it('uses the v2 localStorage key', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v2');
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
    expect(src).toContain('sg-state-v2');
  });

  it('references EMBEDDED_CURRICULUM, ALL_UNITS_DATA, and UNIT_FRAMEWORKS', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('EMBEDDED_CURRICULUM');
    expect(src).toContain('ALL_UNITS_DATA');
    expect(src).toContain('UNIT_FRAMEWORKS');
  });
});

describe('study_guide_diagnostic.html — DAG / BKT integration', () => {
  it('loads the five new adaptive-study scripts (topology, tag map, BKT, selector, renderer)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/dag-topology.js');
    expect(src).toContain('data/question-lo-map.js');
    expect(src).toContain('lib/bkt.js');
    expect(src).toContain('lib/probe-selector.js');
    expect(src).toContain('lib/dag-renderer.js');
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

  it('renders a DAG panel inside each unit body', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('renderDagPanel');
    expect(src).toContain('window.DagRenderer.render');
    expect(src).toContain('dag-panel');
    expect(src).toContain('dag-legend');
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

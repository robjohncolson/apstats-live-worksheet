/**
 * Structural tests for the AP Statistics Diagnostic Study Guide.
 *
 * These tests check that the generated worksheet + grading prompts
 * file contain the expected wiring, not that the UI renders correctly.
 * (The UI behavior is tested implicitly by using the worksheet in a
 * browser — see STATE_MACHINES.md for the state machine specs.)
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

describe('ai-grading-prompts-study-guide.js', () => {
  it('exists on disk', () => {
    expect(existsSync(PROMPTS_PATH)).toBe(true);
  });

  it('exports the expected shape via window assignments', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('window.LESSON_CONTEXT_SG');
    expect(src).toContain('window.UNIT_TITLES_SG');
    expect(src).toContain('window.GATE_IDS_SG');
    expect(src).toContain('window.buildReflectionPromptSG');
    expect(src).toContain('window.getRubricSG');
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
  it('defines the grading rubric vocabulary in the prompt template', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('E (Essentially Correct)');
    expect(src).toContain('P (Partially Correct)');
    expect(src).toContain('I (Incorrect)');
  });

  it('includes the unit title and unit topic in the prompt builder output', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('You are grading an AP Statistics Progress Check Free-Response Question');
    expect(src).toContain('Unit focus:');
  });

  it('has JSON response schema keys documented in the prompt template', () => {
    const src = readFileSync(PROMPTS_PATH, 'utf8');
    expect(src).toContain('"score"');
    expect(src).toContain('"feedback"');
    expect(src).toContain('"matched"');
    expect(src).toContain('"missing"');
  });
});

describe('study_guide_diagnostic.html', () => {
  it('exists on disk', () => {
    expect(existsSync(HTML_PATH)).toBe(true);
  });

  it('loads the shared railway scripts and curriculum data', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('../railway_config.js');
    expect(src).toContain('../railway_client.js');
    expect(src).toContain('../curriculum_render/data/curriculum.js');
    expect(src).toContain('ai-grading-prompts-study-guide.js');
  });

  it('references all 9 expected gate IDs', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    for (const gateId of EXPECTED_GATE_IDS) {
      expect(src, `gate ID ${gateId} should appear`).toContain(gateId);
    }
  });

  it('wires the grading button and localStorage key', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="grade-btn"');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v1');
  });

  it('POSTs reflections to /api/ai/grade', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('/api/ai/grade');
  });

  it('references the gate container and summary panel', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="gates-container"');
    expect(src).toContain('id="summary-panel"');
  });
});

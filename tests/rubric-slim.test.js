import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const DECISIONS = JSON.parse(readFileSync(resolve(ROOT, 'state/rubric-slim/u1-l1-6-decisions.json'), 'utf8')).files;
const IDS = {
  'ai-grading-prompts-u1-l1.js': {
    reflect1: ['needs-context', 'units-or-variable', 'links-to-question', 'threshold-idea'],
    reflect2: ['changed-percent', 'changed-conclusion', 'responsible-use', 'real-consequences'],
    exitTicket: ['question-in-context', 'variable', 'variation', 'context-for-30', 'statistics-process'],
  },
  'ai-grading-prompts-u1-l2.js': {
    reflect1: ['individuals-are-properties', 'variable-definition', 'gives-example-variable', 'rows-vs-columns'],
    reflect2: ['numbers-as-labels', 'zip-code-location', 'grade-level-categories', 'not-average'],
    exitTicket: ['individuals', 'two-variables', 'sport-played-categorical', 'heart-rate-quantitative', 'id-not-variable'],
  },
  'ai-grading-prompts-u1-l3.js': {
    reflect1: ['frequency-counts', 'relative-frequency-proportion', 'superpower-context', 'divide-by-total'],
    reflect2: ['use-counts-or-percentages', 'specific-example', 'claim-judgment', 'majority-threshold'],
    exitTicket: ['frequency-definition', 'chips-relative-frequency', 'yogurt-relative-frequency', 'no-majority-chips', 'context-justification'],
  },
  'ai-grading-prompts-u1-l4.js': {
    reflect1: ['frequency-counts', 'relative-frequency-proportions', 'same-superpower-data', 'superpower-example', 'divide-by-total'],
    reflect2: ['different-group-sizes', 'use-proportions', 'lesson-example', 'comparison-conclusion', 'graph-or-table-link'],
    exitTicket: ['different-grade-sizes', 'ninth-jersey-frequency', 'tenth-jersey-frequency', 'claim-not-supported', 'context-justification'],
  },
  'ai-grading-prompts-u1-l5.js': {
    reflect1: ['discrete-definition', 'continuous-definition', 'counting-measuring', 'lesson-example', 'rounded-values-note'],
    reflect2: ['large-data-set', 'shows-individual-values', 'histogram-intervals', 'lose-exact-values', 'shape-idea'],
    exitTicket: ['discrete-classification', 'countable-gaps-explanation', 'best-display-choice', 'chosen-display-advantage', 'histogram-limitation'],
  },
  'ai-grading-prompts-u1-l6.js': {
    reflect1: ['shape-description', 'center-description', 'variability-description', 'unusual-features', 'context', 'single-peak-detail'],
    reflect2: ['two-unusual-features', 'flint-connection', 'distribution-description-role', 'gaps-clusters-together'],
    exitTicket: ['shape', 'center', 'variability', 'unusual-features', 'context'],
  },
};

const PILOT = Object.entries(IDS).map(([filename, questions]) => {
  const window = {};
  runInNewContext(readFileSync(resolve(ROOT, filename), 'utf8'), { window }, { filename });
  const key = Object.keys(window).find(name => name.startsWith('RUBRICS_'));
  return { filename, questions, rubrics: window[key] };
});

describe('rubric slim pilot', () => {
  for (const { filename, questions, rubrics } of PILOT) {
    it(`${filename} preserves every ordered element id and applies the required decisions`, () => {
      expect(Object.keys(rubrics)).toEqual(Object.keys(questions));
      for (const [question, ids] of Object.entries(questions)) {
        const elements = rubrics[question].expectedElements;
        const required = elements.filter(element => element.required).map(element => element.id);
        expect(elements.map(element => element.id), question).toEqual(ids);
        expect(required.length, question).toBeGreaterThanOrEqual(1);
        expect(required.length, question).toBeLessThanOrEqual(4);
        expect(new Set(required), question).toEqual(new Set(DECISIONS[filename][question].required));
        expect(rubrics[question].scoringGuide, question).toEqual(DECISIONS[filename][question].scoringGuide);
      }
    });
  }

  it('slimmed files ask for every key element, not most of them (RUBRIC_SLIM_SPEC, CB-calibrated)', () => {
    for (const { filename } of PILOT) {
      const source = readFileSync(resolve(ROOT, filename), 'utf8');
      expect(source, filename).toContain('- E: every key element is present and correct');
      expect(source, filename).not.toContain('covers most of the key elements');
    }
  });

  it('averages at most three required elements across all 18 questions', () => {
    const questions = PILOT.flatMap(({ rubrics }) => Object.values(rubrics));
    expect(questions).toHaveLength(18);
    const total = questions.reduce((sum, rubric) => sum + rubric.expectedElements.filter(element => element.required).length, 0);
    expect(total / questions.length).toBeLessThanOrEqual(3);
  });
});

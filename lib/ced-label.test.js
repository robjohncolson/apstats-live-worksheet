// @vitest-environment node
// lib/ced-label.test.js — the ONE CED-2026 label helper (CED2026_SINGLE_SOURCE_SPEC.md §1).
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import ced, { CedLabel, CED_CROSSWALK } from './ced-label.mjs';
import { buildGradebookColumns } from '../roster-server/gradebook-grid.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TITLES = JSON.parse(read('../data/ced-column-titles.json')).columns;
const SCHEDULE = JSON.parse(read('../data/lesson-schedule.json'));
const JS_KIND = { lesson: 'followalong', quiz: 'quiz', blooket: 'blooket', progress_check: 'pc', poster: 'poster' };

describe('cedTopicLabel', () => {
  it('names a folded core topic with its calendar day', () => {
    expect(ced.cedTopicLabel('3.5')).toEqual({ topic: '1.13', text: '1.13 · Experimental Design · Day 1',
      unit: 1, status: 'core', day: 1, days: 2 });
  });

  it('names a whole core topic without a day', () => {
    expect(ced.cedTopicLabel('3.3')).toMatchObject({ topic: '1.11', text: '1.11 · Random Sampling', unit: 1, status: 'core', day: null });
  });

  it('names a bonus topic as Beyond the Exam with the unit it extends', () => {
    expect(ced.cedTopicLabel('9.2')).toMatchObject({ topic: null, status: 'bonus', unit: 5,
      text: '★ Beyond the Exam · Slope inference' });
  });

  it('labels combined keys, including three-part chains', () => {
    expect(ced.cedTopicLabel('4.3-4-5')).toMatchObject({ topic: '2.4 / 2.5 / 2.6', unit: 2, status: 'core' });
    expect(ced.cedTopicLabel('3.6-7').text).toBe('1.13 · Experimental Design · Day 2 / ★ Beyond the Exam · Simulation-Based Significance (is the treatment difference real or due to chance?)');
  });

  it('warns once and shows the stored key for an unknown key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(ced.cedTopicLabel('7.99')).toMatchObject({ topic: '7.99', text: '7.99', status: 'unmapped' });
    ced.cedTopicLabel('7.99');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('cedUnitLabel', () => {
  it('names CED units from the crosswalk units map', () => {
    expect(ced.cedUnitLabel(1)).toBe('Exploring One-Variable Data & Collecting Data');
    expect(ced.cedUnitLabel('U5')).toBe('Regression Analysis');
    expect(ced.cedUnitLabel(7)).toBe('Unit 7');
    expect(Object.keys(CED_CROSSWALK.units)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('cedColumnTitle', () => {
  it('follows the spec examples', () => {
    expect(ced.cedColumnTitle('blooket', '3.1')).toBe('1.10 Day 1 Blooket');
    expect(ced.cedColumnTitle('followalong', '3.5')).toBe('1.13 Day 1 Follow-Along');
    expect(ced.cedColumnTitle('quiz', '3.6')).toBe('1.13 Day 2 Quiz');
    expect(ced.cedColumnTitle('followalong', '3.3')).toBe('1.11 Follow-Along');
    expect(ced.cedColumnTitle('followalong', '4.3-4-5')).toBe('2.4-2.6 Follow-Along');
    expect(ced.cedColumnTitle('blooket', '4.10-12')).toBe('2.10 Blooket');
    expect(ced.cedColumnTitle('quiz', '9.3')).toBe('Beyond the Exam: Slope inference Day 3 Quiz');
    expect(ced.cedColumnTitle('pc', 'U1')).toBe('Unit 1 Progress Check');
    expect(ced.cedColumnTitle('poster', 2)).toBe('Unit 2 Poster');
  });

  it('agrees with every real Schoology column in data/ced-column-titles.json', () => {
    const real = Object.entries(TITLES).filter(([, entry]) => entry.schoologyColumn);
    expect(real.length).toBeGreaterThan(100);
    for (const [key, entry] of real) {
      const arg = entry.kind === 'progress_check' || entry.kind === 'poster' ? entry.unit : entry.oldKey;
      expect(ced.cedColumnTitle(JS_KIND[entry.kind], arg), key).toBe(entry.ced);
    }
  });

  it('never prints a non-ASCII character or a comma-space (the sync matches exact titles)', () => {
    for (const entry of Object.values(TITLES)) {
      const arg = entry.kind === 'progress_check' || entry.kind === 'poster' ? entry.unit : entry.oldKey;
      const title = ced.cedColumnTitle(JS_KIND[entry.kind], arg);
      expect(title).toMatch(/^[\x20-\x7e]+$/);
      expect(title).not.toContain(', ');
    }
  });
});

describe('retitleGradebook', () => {
  // Every schedule lesson as a gradebook lesson; all units in one quarter band.
  const lessons = Object.entries(SCHEDULE.lessons).map(([lessonKey, l]) => ({
    lessonKey, unit: l.unit, worksheetKey: l.worksheetKey, quizTotal: 1, hasBlooket: true, blooketBonus: false,
  }));
  const gradeObj = { lessons, quarters: { Q: { units: [1, 2, 3, 4, 5, 6, 7, 8, 9], pcUnits: [1, 2, 3, 4, 5] } } };
  const build = () => ({ quarters: { Q: { columns: buildGradebookColumns(gradeObj, 'Q') } } });

  it('keeps schoologyTitle equal to the fixture `old` title while Schoology is unrenamed', () => {
    const columns = ced.retitleGradebook(build(), { schoologyTitlesCed: false }).quarters.Q.columns;
    expect(columns.length).toBeGreaterThan(100);
    for (const col of columns) {
      expect(TITLES[col.key], col.key).toBeTruthy();
      expect(col.schoologyTitle, col.key).toBe(TITLES[col.key].old);
      expect(col.title, col.key).toBe(TITLES[col.key].ced);
    }
  });

  it('switches schoologyTitle to the CED title after the rename', () => {
    const columns = ced.retitleGradebook(build(), { schoologyTitlesCed: true }).quarters.Q.columns;
    for (const col of columns) expect(col.schoologyTitle, col.key).toBe(TITLES[col.key].ced);
  });

  it('drops the teacher-facing (bonus) note from the Schoology title only', () => {
    const gb = { quarters: { Q: { columns: [{ key: 'BL:9.1', title: '9.1 Blooket (bonus)', blooketBonus: true }] } } };
    const [col] = ced.retitleGradebook(gb).quarters.Q.columns;
    expect(col).toMatchObject({ title: 'Beyond the Exam: Slope inference Day 1 Blooket', schoologyTitle: '9.1 Blooket' });
  });
});

describe('loading', () => {
  it('exposes the same API to a browser page with the Desk globals', () => {
    const sandbox = createContext({});
    sandbox.window = sandbox;
    runInContext(read('../js/ced2026-crosswalk.js') + '\n' + read('./ced-label.js'), sandbox);
    expect(sandbox.cedLabel('3.1').text).toBe('1.10 · Investigative Question & Data Collection · Day 1');
    expect(sandbox.cedColumnTitle('quiz', '3.1')).toBe('1.10 Day 1 Quiz');
    expect(typeof sandbox.CedLabel.createCedLabels).toBe('function');
  });

  it('does not leak Desk globals into Node', () => {
    expect(typeof CedLabel.cedLabel).toBe('function');
    expect(globalThis.cedLabel).toBeUndefined();
  });

  it('binds the ESM entry to the repo crosswalk', () => {
    expect(CED_CROSSWALK).toEqual(JSON.parse(read('../2026-crosswalk.json')));
  });
});

// @vitest-environment node
// CED2026_SINGLE_SOURCE_SPEC.md §2 — roster column titles are CED-2026; `schoologyTitle`
// keeps naming the real Schoology column until SCHOOLOGY_TITLES_CED flips.
import { describe, expect, it } from 'vitest';
import { buildGradebookColumns } from '../gradebook-grid.js';
import { SCHOOLOGY_TITLES_CED } from '../grade-config.js';
import { cedAssignmentTitle, cedRetitleGradebook } from '../ced-titles.js';
import { retitleGradebook } from '../lib/ced-label.mjs';

const lessons = [
  { lessonKey: '3.1', unit: 3, worksheetKey: '1', quizTotal: 4, hasBlooket: true },
  { lessonKey: '3.6', unit: 3, worksheetKey: '6-7', quizTotal: 4, hasBlooket: true },
  { lessonKey: '3.7', unit: 3, worksheetKey: '6-7', quizTotal: 0, hasBlooket: false },
];
const gradeObj = { lessons, quarters: { Q1: { units: [3], pcUnits: [1] } } };
const gradebook = () => ({ quarters: { Q1: { columns: buildGradebookColumns(gradeObj, 'Q1') } } });
const titles = (gb, field) => Object.fromEntries(gb.quarters.Q1.columns.map((c) => [c.key, c[field]]));

describe('CED column titles on roster responses', () => {
  it('Schoology columns carry the CED titles since rename day (2026-10-13, both sections)', () => {
    expect(SCHOOLOGY_TITLES_CED).toBe(true);
  });

  it('prints CED titles, and the Schoology title now matches them', () => {
    const gb = cedRetitleGradebook(gradebook());
    expect(titles(gb, 'title')).toEqual({
      'FA:3.1': '1.10 Day 1 Follow-Along', 'QUIZ:3.1': '1.10 Day 1 Quiz', 'BL:3.1': '1.10 Day 1 Blooket',
      'FA:3.6-7': '1.13 Day 2 Follow-Along', 'QUIZ:3.6': '1.13 Day 2 Quiz', 'BL:3.6-7': '1.13 Day 2 Blooket',
      'PC:U1': 'Unit 1 Progress Check',
    });
    expect(titles(gb, 'schoologyTitle')).toEqual(titles(gb, 'title'));
  });

  it('kept the old Schoology title beside the CED one before the rename ran', () => {
    const gb = retitleGradebook(gradebook(), { schoologyTitlesCed: false });
    expect(titles(gb, 'schoologyTitle')).toEqual({
      'FA:3.1': '3.1 Follow-Along', 'QUIZ:3.1': '3.1 Quiz', 'BL:3.1': '3.1 Blooket',
      'FA:3.6-7': '3.6-7 Follow-Along', 'QUIZ:3.6': '3.6 Quiz', 'BL:3.6-7': '3.6-7 Blooket',
      'PC:U1': 'Unit 1 Progress Check',
    });
  });

  it('titles class-snapshot assignments like the gradebook columns', () => {
    expect(cedAssignmentTitle(lessons[0], 'worksheet')).toBe('1.10 Day 1 Follow-Along');
    expect(cedAssignmentTitle(lessons[1], 'quiz')).toBe('1.13 Day 2 Quiz');
    expect(cedAssignmentTitle(lessons[1], 'blooket')).toBe('1.13 Day 2 Blooket');
  });
});

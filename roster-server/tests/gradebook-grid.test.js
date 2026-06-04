// gradebook-grid.test.js — pure-function unit tests for the in-app "1:1 Schoology
// gradebook" deriver. Tests column generation (opener-no-quiz, combined dedup,
// PC/Poster per unit), cell extraction, category averages, the Schoology
// category-weighted total, and the v3 passthrough. NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  buildGradebookColumns,
  buildGradebookRow,
  buildGradebook,
  schoologyWeightedTotal,
  SCHOOLOGY_CATEGORY_WEIGHTS,
} from '../gradebook-grid.js';

// A synthetic computeGrade() result: one quarter (Q1 band [1]) with an opener
// (1.1: no quiz, has blooket), a full lesson (1.2: quiz + blooket), and a
// combined pair (1.3/1.4 sharing worksheet "3-4", quiz only on 1.4).
function gradeObj() {
  return {
    units: { U1: { pcRawPct: 80 } },
    quarters: { Q1: { units: [1], quarterGrade: 91.2 } },
    lessons: [
      { lessonKey: '1.1', unit: 1, worksheetKey: '1', Cws: 88, Q: null, quizTotal: 0, blooket: 95, hasBlooket: true },
      { lessonKey: '1.2', unit: 1, worksheetKey: '2', Cws: 90, Q: 78, quizTotal: 3, blooket: 100, hasBlooket: true },
      { lessonKey: '1.3', unit: 1, worksheetKey: '3-4', Cws: 70, Q: null, quizTotal: 0, blooket: null, hasBlooket: false },
      { lessonKey: '1.4', unit: 1, worksheetKey: '3-4', Cws: 70, Q: 65, quizTotal: 4, blooket: null, hasBlooket: false },
    ],
  };
}

describe('buildGradebookColumns', () => {
  const cols = buildGradebookColumns(gradeObj(), 'Q1');
  const keys = cols.map((c) => c.key);

  it('opener (1.1) gets Follow-Along + Blooket but NO quiz', () => {
    expect(keys).toContain('FA:1.1');
    expect(keys).toContain('BL:1.1');
    expect(keys).not.toContain('QUIZ:1.1');
  });

  it('full lesson (1.2) gets all three', () => {
    expect(keys).toContain('FA:1.2');
    expect(keys).toContain('QUIZ:1.2');
    expect(keys).toContain('BL:1.2');
  });

  it('combined worksheet (1.3/1.4) shares ONE Follow-Along, quiz only on 1.4', () => {
    expect(keys.filter((k) => k === 'FA:1.3-4').length).toBe(1);
    expect(keys).toContain('QUIZ:1.4');
    expect(keys).not.toContain('QUIZ:1.3');
    expect(keys).not.toContain('BL:1.3-4'); // neither constituent hasBlooket
  });

  it('adds a Progress Check + Poster column per band unit', () => {
    expect(keys).toContain('PC:U1');
    expect(keys).toContain('POSTER:U1');
    const pc = cols.find((c) => c.key === 'PC:U1');
    expect(pc.category).toBe('Progress Check');
    const poster = cols.find((c) => c.key === 'POSTER:U1');
    expect(poster.category).toBe('Posters');
  });

  it('maps component kinds to Schoology categories', () => {
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['FA:1.2'].category).toBe('Lesson');
    expect(byKey['QUIZ:1.2'].category).toBe('Quizzes');
    expect(byKey['BL:1.2'].category).toBe('Blooket');
  });

  it('orders lesson components before the unit PC/Poster', () => {
    const pcIdx = keys.indexOf('PC:U1');
    const faIdx = keys.indexOf('FA:1.1');
    expect(faIdx).toBeLessThan(pcIdx);
  });
});

describe('buildGradebookRow', () => {
  const cols = buildGradebookColumns(gradeObj(), 'Q1');
  const row = buildGradebookRow(gradeObj(), cols);

  it('extracts the right cell values', () => {
    expect(row.cells['FA:1.1']).toBe(88);
    expect(row.cells['BL:1.1']).toBe(95);
    expect(row.cells['QUIZ:1.2']).toBe(78);
    expect(row.cells['FA:1.3-4']).toBe(70); // combined Cws (shared)
    expect(row.cells['QUIZ:1.4']).toBe(65);
  });

  it('reads the PC cell from units[].pcRawPct and leaves Poster null', () => {
    expect(row.cells['PC:U1']).toBe(80);
    expect(row.cells['POSTER:U1']).toBe(null);
  });

  it('computes category averages over present cells only', () => {
    // Lesson (FA): 88, 90, 70 -> 82.7 (one combined FA for 1.3-4)
    expect(row.categoryAverages.Lesson).toBeCloseTo(82.7, 1);
    // Quizzes: 78, 65 -> 71.5
    expect(row.categoryAverages.Quizzes).toBeCloseTo(71.5, 1);
    // Blooket: 95, 100 -> 97.5
    expect(row.categoryAverages.Blooket).toBeCloseTo(97.5, 1);
    // Progress Check: 80
    expect(row.categoryAverages['Progress Check']).toBe(80);
    // Posters: absent (all null) -> no key
    expect(row.categoryAverages.Posters).toBeUndefined();
  });

  it('Schoology total = category-weighted blend, renormalized over present categories', () => {
    // Present: Lesson 82.7 (w15), Quizzes 71.5 (w15), Blooket 97.5 (w5), PC 80 (w50)
    // num = 15*82.7 + 15*71.5 + 5*97.5 + 50*80 = 1240.5 + 1072.5 + 487.5 + 4000 = 6800.5
    // den = 15+15+5+50 = 85 -> 80.0059 -> 80.0   (Posters absent: no data)
    expect(row.schoologyTotal).toBeCloseTo(80.0, 1);
  });
});

describe('schoologyWeightedTotal', () => {
  it('renormalizes over present categories (missing one does not zero it)', () => {
    const t = schoologyWeightedTotal({ Lesson: 90, Quizzes: 80 },
      { Lesson: 15, Quizzes: 15, Blooket: 5 });
    // (15*90 + 15*80) / 30 = 85
    expect(t).toBe(85);
  });

  it('returns null when no category present', () => {
    expect(schoologyWeightedTotal({}, SCHOOLOGY_CATEGORY_WEIGHTS)).toBe(null);
  });
});

describe('buildGradebook', () => {
  const gb = buildGradebook(gradeObj());

  it('echoes the weights and builds every quarter', () => {
    expect(gb.weights).toEqual(SCHOOLOGY_CATEGORY_WEIGHTS);
    expect(Object.keys(gb.quarters)).toEqual(['Q1']);
  });

  it('surfaces both totals side by side', () => {
    expect(gb.quarters.Q1.v3Total).toBe(91.2);       // quarters[Q1].quarterGrade
    expect(gb.quarters.Q1.schoologyTotal).toBeCloseTo(80.0, 1);
  });

  it('carries columns + cells', () => {
    expect(gb.quarters.Q1.columns.length).toBeGreaterThan(0);
    expect(gb.quarters.Q1.cells['FA:1.1']).toBe(88);
  });
});

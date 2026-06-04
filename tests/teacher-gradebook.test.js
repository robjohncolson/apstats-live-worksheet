// teacher-gradebook.test.js — jsdom smoke test for the in-app gradebook grid in
// teacher-dashboard.html. Loads the page, feeds renderGradebook a synthetic
// /class/grades payload (mirroring roster-server/gradebook-grid.js buildGradebook
// output), and asserts the component grid renders with both totals.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../teacher-dashboard.html'), 'utf8');

function synthPayload() {
  const columns = [
    { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
    { key: 'FA:1.2', kind: 'followalong', category: 'Lesson', title: '1.2 Follow-Along', unit: 1, topicKeys: ['1.2'] },
    { key: 'QUIZ:1.2', kind: 'quiz', category: 'Quizzes', title: '1.2 Quiz', unit: 1, topicKeys: ['1.2'] },
    { key: 'BL:1.1', kind: 'blooket', category: 'Blooket', title: '1.1 Blooket', unit: 1, topicKeys: ['1.1'] },
    { key: 'PC:U1', kind: 'pc', category: 'Progress Check', title: 'Unit 1 Progress Check', unit: 1, topicKeys: [] },
    { key: 'POSTER:U1', kind: 'poster', category: 'Posters', title: 'Unit 1 Poster', unit: 1, topicKeys: [] },
  ];
  const gradebook = {
    weights: { Lesson: 15, Quizzes: 15, Blooket: 5, 'Progress Check': 50, Posters: 15 },
    quarters: {
      Q1: {
        columns,
        cells: { 'FA:1.1': 88, 'FA:1.2': 90, 'QUIZ:1.2': 78, 'BL:1.1': 95, 'PC:U1': 80, 'POSTER:U1': null },
        categoryAverages: { Lesson: 89, Quizzes: 78, Blooket: 95, 'Progress Check': 80 },
        schoologyTotal: 82.7,
        v3Total: 91.2,
        reconciliation: {
          pcAvg: 90, workAvg: 70, schoologyTotal: 82.7, v3Total: 91.2, delta: 8.5, branch: 'max',
          reason: 'Both tracks clear the 40 floor, so v3 takes the higher (PC 90), while Schoology averages the categories (82.7).',
        },
      },
    },
  };
  return {
    ok: true,
    students: [
      { studentId: 's1', realName: 'Ana Smith', username: 'apple_cat', section: 'PeriodB',
        quarters: { Q1: { quarterGrade: 91.2 } }, units: {}, completion: {}, lessons: [], gradebook },
    ],
  };
}

describe('teacher-dashboard in-app gradebook grid', () => {
  let win, doc;

  beforeAll(async () => {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://example.test/teacher-dashboard.html',
      pretendToBeVisual: true,
    });
    win = dom.window;
    doc = win.document;
    // Let any DOMContentLoaded wiring run.
    await new Promise((r) => setTimeout(r, 30));
  });

  it('exposes renderGradebook and has the grid mount points', () => {
    expect(typeof win.renderGradebook).toBe('function');
    expect(doc.getElementById('gb-thead')).toBeTruthy();
    expect(doc.getElementById('gb-tbody')).toBeTruthy();
  });

  it('renders a student row with cells and both totals', () => {
    win.renderGradebook(synthPayload());

    // table becomes visible, empty note hidden
    expect(doc.getElementById('gb-wrap').style.display).not.toBe('none');
    expect(doc.getElementById('gb-empty').style.display).toBe('none');

    const rows = doc.querySelectorAll('#gb-tbody tr');
    expect(rows.length).toBe(1);

    const tds = rows[0].querySelectorAll('td');
    // name + 6 component cells + 2 totals = 9
    expect(tds.length).toBe(9);
    expect(tds[0].textContent).toContain('Ana Smith');

    // The two total cells carry the Schoology + v3 numbers.
    const totals = rows[0].querySelectorAll('td.gb-tot');
    expect(totals.length).toBe(2);
    expect(totals[0].textContent).toContain('82.7'); // Schoology
    expect(totals[1].textContent).toContain('91.2'); // v3
    // Δ between v3 (91.2) and Schoology (82.7) = +8.5 surfaced on the v3 cell.
    expect(totals[1].textContent).toContain('8.5');
  });

  it('groups columns by Schoology category in the header (structural 1:1, incl. empty Posters)', () => {
    win.renderGradebook(synthPayload());
    const groupHeaders = Array.from(doc.querySelectorAll('#gb-thead th.gb-cat')).map((th) => th.textContent);
    const joined = groupHeaders.join(' | ');
    expect(joined).toContain('Lesson');
    expect(joined).toContain('Progress Check 50%'); // weight surfaced
    // The Poster COLUMN always exists (mirrors Schoology), even with no score yet,
    // so its category group header renders; the cell shows the empty placeholder.
    expect(joined).toContain('Posters 15%');
    const posterCell = doc.querySelector('#gb-tbody td.gb-cat-posters');
    expect(posterCell).toBeTruthy();
    expect(posterCell.textContent.trim()).toBe('·'); // null -> empty middot
  });

  it('shows the empty note when no gradebook data is present', () => {
    win.renderGradebook({ students: [] });
    expect(doc.getElementById('gb-wrap').style.display).toBe('none');
    expect(doc.getElementById('gb-empty').style.display).toBe('');
  });

  it('renders the per-student Schoology-vs-v3 reconciliation in the drawer', () => {
    win.lastGradesPayload = synthPayload();
    win.currentQuarter = 'Q1';
    win.renderTscReconcile('s1');
    const card = doc.getElementById('tsc-reconcile-card');
    expect(card.textContent).toContain('PC track');
    expect(card.textContent).toContain('Work track');
    expect(card.textContent).toContain('v3');
    expect(card.textContent).toContain('Schoology');
    expect(card.textContent).toContain('Δ'); // delta shown
    expect(card.textContent.toLowerCase()).toContain('higher'); // max-branch reason
    expect(card.textContent).toContain('Schoology categories'); // Schoology category averages line
  });
});

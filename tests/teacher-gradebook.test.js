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

  it('renders a 105-point follow-along without clipping the number', () => {
    const payload = synthPayload();
    payload.students[0].gradebook.quarters.Q1.cells['FA:1.1'] = 105;
    win.renderGradebook(payload);
    expect([...doc.querySelectorAll('#gb-tbody td.gb-cell')].some(td => td.textContent.includes('105'))).toBe(true);
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

  function payloadWithDue() {
    const columns = [
      { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', title: '1.1 FA', unit: 1, topicKeys: ['1.1'], due: true },
      { key: 'FA:1.9', kind: 'followalong', category: 'Lesson', title: '1.9 FA', unit: 1, topicKeys: ['1.9'], due: false },
      { key: 'POSTER:U1', kind: 'poster', category: 'Posters', title: 'U1 Poster', unit: 1, topicKeys: [], due: false },
    ];
    const gradebook = { weights: { Lesson: 15, Posters: 15 }, quarters: { Q1: {
      columns, cells: { 'FA:1.1': 88, 'FA:1.9': null, 'POSTER:U1': null },
      categoryAverages: { Lesson: 88 }, schoologyTotal: 88, v3Total: 88, reconciliation: {},
    } } };
    return { ok: true, students: [{ studentId: 's1', realName: 'Ana', username: 'a', section: 'PeriodX', gradebook }] };
  }

  it('date-gates: hides a future, not-started column + notes how many were hidden', () => {
    win.renderGradebook(payloadWithDue());
    const titles = Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
    expect(titles).toContain('1.1 FA');        // due → shown
    expect(titles).not.toContain('1.9 FA');    // future + not started → hidden
    expect(titles).not.toContain('U1 Poster'); // future + not started → hidden
    expect(doc.getElementById('gb-scope').textContent).toMatch(/hidden/i);
  });

  it('date-gates: keeps a future column that some student HAS started', () => {
    const p = payloadWithDue();
    p.students[0].gradebook.quarters.Q1.cells['FA:1.9'] = 75; // started despite due:false
    win.renderGradebook(p);
    const titles = Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
    expect(titles).toContain('1.9 FA');
  });

  it('colors cells by the grade-rules bands (90+ deep green, <40 red)', () => {
    const p = synthPayload();
    p.students[0].gradebook.quarters.Q1.cells['QUIZ:1.2'] = 30; // below the 40 floor
    win.renderGradebook(p);
    expect(doc.querySelector('#gb-tbody td.gb-cell.gb-top')).toBeTruthy(); // BL:1.1 = 95
    expect(doc.querySelector('#gb-tbody td.gb-cell.gb-low')).toBeTruthy(); // QUIZ:1.2 = 30
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

// Fixer finding C5 (QUARTER_LINE_BY_DUE_DATE_SPEC.md §3.5): columns are filed per section now,
// so an unfiltered load (both periods; listRoster puts Period B first) must show every
// student's columns, and a lift-only or other-marking-period column must read as such.
describe('teacher-dashboard gradebook with both periods in one load', () => {
  let win, doc;

  beforeAll(async () => {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://example.test/teacher-dashboard.html',
      pretendToBeVisual: true,
    });
    win = dom.window;
    doc = win.document;
    await new Promise((r) => setTimeout(r, 30));
  });

  const col = (key, category, topicKeys, flags = {}) => ({
    key, kind: category === 'Lesson' ? 'followalong' : 'quiz', category, title: key, unit: 4, topicKeys, due: true, ...flags,
  });
  // The Quarter 2 tab as the server files it. Period B: 4.1-2 is decided by 4.1 (Quarter 1),
  // so its Follow-Along sits in MP1; 4.8 is a regular Quarter 2 lesson. Period E: 2.3 and
  // 4.1-2 are regular Quarter 2 lessons (Period B has no 2.3 column in Quarter 2).
  function mixedPayload() {
    const student = (studentId, realName, section, columns, cells) => ({
      studentId, realName, username: studentId, section,
      quarters: { Q2: { quarterGrade: 80 } }, units: {}, completion: {}, lessons: [],
      gradebook: { weights: { Lesson: 15, Quizzes: 15 }, quarters: { Q2: {
        columns, cells, categoryAverages: {}, schoologyTotal: 80, v3Total: 80, reconciliation: {},
      } } },
    });
    return {
      ok: true,
      students: [
        student('b1', 'Bea B', 'PeriodB', [
          col('FA:4.1-2', 'Lesson', ['4.2'], { schoologyQuarter: 'Q1' }),
          col('QUIZ:4.2', 'Quizzes', ['4.2']),
          col('FA:4.8', 'Lesson', ['4.8']),
          col('FA:5.7', 'Lesson', ['5.7'], { liftOnly: true }),
        ], { 'FA:4.1-2': 80, 'QUIZ:4.2': 70, 'FA:4.8': 90, 'FA:5.7': 60 }),
        student('e1', 'Eli E', 'PeriodE', [
          col('FA:2.3', 'Lesson', ['2.3']),
          col('FA:4.1-2', 'Lesson', ['4.1', '4.2']),
          col('QUIZ:4.2', 'Quizzes', ['4.2']),
          col('FA:4.8', 'Lesson', ['4.8']),
        ], { 'FA:2.3': 75, 'FA:4.1-2': 85, 'QUIZ:4.2': 65, 'FA:4.8': 95 }),
      ],
    };
  }
  const headerTitles = () => Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
  const rowOf = (name) => Array.from(doc.querySelectorAll('#gb-tbody tr')).find((tr) => tr.textContent.includes(name));
  const cellUnder = (tr, title) => {
    const index = headerTitles().indexOf(title);
    return tr.querySelectorAll('td.gb-cell')[index];
  };

  it('takes the union of every student\'s columns, in first-seen order', () => {
    win.currentQuarter = 'Q2';
    win.renderGradebook(mixedPayload());
    const titles = headerTitles().map((t) => t.split(' — ')[0]);
    // Lessons first (category order), each category in first-seen order: Period B's, then Period E's 2.3.
    expect(titles).toEqual(['FA:4.1-2', 'FA:4.8', 'FA:5.7', 'FA:2.3', 'QUIZ:4.2']);
    // Period E's own 2.3 cell renders; Period B has no such column, so its cell is empty.
    expect(cellUnder(rowOf('Eli E'), 'FA:2.3').textContent).toBe('75.0');
    expect(cellUnder(rowOf('Bea B'), 'FA:2.3').textContent.trim()).toBe('·');
  });

  it('dims lift-only and other-marking-period columns, with the reason on hover', () => {
    win.currentQuarter = 'Q2';
    win.renderGradebook(mixedPayload());
    const ths = Array.from(doc.querySelectorAll('#gb-thead th.gb-col'));
    const th = (key) => ths.find((el) => el.getAttribute('title').startsWith(key));
    expect(th('FA:4.1-2').classList.contains('gb-other')).toBe(true);
    expect(th('FA:4.1-2').getAttribute('title')).toContain('Schoology column in MP1');
    expect(th('FA:5.7').classList.contains('gb-other')).toBe(true);
    expect(th('FA:5.7').getAttribute('title')).toContain('can raise Quarter 2 (never a 0)');
    expect(th('FA:4.8').classList.contains('gb-other')).toBe(false);
    expect(th('QUIZ:4.2').classList.contains('gb-other')).toBe(false);
  });

  it('dims each cell by the student\'s own column: Period B\'s 4.1-2 is MP1\'s, Period E\'s counts', () => {
    win.currentQuarter = 'Q2';
    win.renderGradebook(mixedPayload());
    const title = headerTitles().find((t) => t.startsWith('FA:4.1-2'));
    const bCell = cellUnder(rowOf('Bea B'), title);
    const eCell = cellUnder(rowOf('Eli E'), title);
    expect(bCell.classList.contains('gb-other')).toBe(true);
    expect(bCell.getAttribute('title')).toBe('Schoology column in MP1');
    expect(eCell.classList.contains('gb-other')).toBe(false);
    expect(eCell.hasAttribute('title')).toBe(false);
    expect(eCell.textContent).toBe('85.0');
  });

  it('a one-period load renders exactly as before (no dimming without the flags)', () => {
    win.currentQuarter = 'Q2';
    const payload = mixedPayload();
    payload.students = payload.students.slice(1);   // Period E only
    win.renderGradebook(payload);
    expect(headerTitles().map((t) => t.split(' — ')[0])).toEqual(['FA:2.3', 'FA:4.1-2', 'FA:4.8', 'QUIZ:4.2']);
    expect(doc.querySelectorAll('#gb-thead .gb-other, #gb-tbody .gb-other').length).toBe(0);
  });
});

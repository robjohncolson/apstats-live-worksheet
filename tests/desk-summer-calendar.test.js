// desk-summer-calendar.test.js — the Desk calendar shows the SUMMER schedule
// (Unit 1, weekly due dates → Sept 1) as an amber agenda above the blue
// school-year grid, ONLY during summer (today < firstDayOfSchool). It marks
// TODAY and the next lesson due, mirroring the My Ledger summer readiness gate.
//
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const SRC = ['_scEsc', '_scDateLabel', '_scTodayRow', 'rSummerCal'].map((n) => fnBody(DESK, n)).join('\n');
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SCHED = {
  goal: 'finish Unit 1 before school',
  unit: 1,
  firstDayOfSchool: '2026-09-01',
  restDays: 2,
  lessons: [
    { topic: '1.1', due: '2026-06-23' },
    { topic: '1.2', due: '2026-06-30' },
    { topic: '1.3', due: '2026-07-07' },
  ],
};

function render({ schedule = SCHED, today, doneTopics = [] }) {
  document.body.innerHTML = '<div id="summer-cal" style="display:none"></div>';
  window._summerSchedule = schedule;
  const _walletTodayISO = () => today;
  const getStudentMarks = () => ({});
  const _isLessonComplete = (topic) => doneTopics.includes(topic);
  // eslint-disable-next-line no-new-func
  new Function('MN', '_walletTodayISO', 'getStudentMarks', '_isLessonComplete', SRC + '\nrSummerCal();')(
    MN, _walletTodayISO, getStudentMarks, _isLessonComplete
  );
  return document.getElementById('summer-cal');
}

describe('Desk summer agenda — rSummerCal', () => {
  it('renders during summer with header, today divider, and first-day marker', () => {
    const host = render({ today: '2026-06-25', doneTopics: ['1.1'] });
    expect(host.style.display).not.toBe('none');
    expect(host.querySelector('.sc-hdr').textContent).toMatch(/Summer prep/);
    expect(host.querySelector('.sc-today')).not.toBeNull();
    expect(host.querySelector('.sc-school')).not.toBeNull();
  });

  it('marks the next not-done lesson "do this next" and greys the done one', () => {
    const host = render({ today: '2026-06-25', doneTopics: ['1.1'] });
    // 1.1 done → struck through; 1.2 is the next not-done → highlighted.
    expect(host.querySelector('.sc-done .sc-topic').textContent).toBe('Unit 1.1');
    const next = host.querySelector('.sc-next .sc-topic');
    expect(next.textContent).toBe('Unit 1.2');
    expect(host.querySelector('.sc-next .sc-status').textContent).toBe('do this next');
  });

  it('shows a human due date (Jun 23, not 2026-06-23)', () => {
    const host = render({ today: '2026-06-20' });
    const dues = Array.from(host.querySelectorAll('.sc-due')).map((e) => e.textContent);
    expect(dues.join(' ')).toContain('Jun 23');
    expect(dues.join(' ')).not.toContain('2026-06-23');
  });

  it('flags a past-due not-done lesson as overdue', () => {
    const host = render({ today: '2026-07-10', doneTopics: [] });
    expect(host.querySelector('.sc-overdue')).not.toBeNull();
  });

  it('is HIDDEN once school has started (today >= firstDayOfSchool)', () => {
    const host = render({ today: '2026-09-15' });
    expect(host.style.display).toBe('none');
    expect(host.innerHTML).toBe('');
  });

  it('is hidden when no summer schedule is loaded', () => {
    const host = render({ schedule: null, today: '2026-06-25' });
    expect(host.style.display).toBe('none');
  });
});

// teacher-dashboard-orphan-pc.test.js - the class grades table:
//   - an amber "unplaced" badge on a student whose ledger has rows the grade engine
//     could not place in any lesson (/class/grades `orphanRows`, teacher-only), and
//   - the per-unit column shows the PC % the v3 quarter reads (`pcRawPct`, curved),
//     with the uncurved % in the title, never the retired Phase 6 `unitGrade`.
//
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');

function makeDom() {
  const cleaned = DASH.replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(cleaned, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.rosterClient = { token: () => null, current: () => null };
  dom.window.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, students: [] }) });
  return dom;
}

function student(overrides) {
  return {
    studentId: 'stu_1', username: 'pear-wolf', realName: 'Ana Lee', section: 'PeriodB',
    quarters: {}, completion: {},
    units: { U1: { unitGrade: 90, pcRawPct: 84.2, pcUncurvedPct: 71.5 } },
    ...overrides,
  };
}

function render(students) {
  const dom = makeDom();
  dom.window.renderGradesTable({ students });
  return dom.window.document;
}

describe('class grades table: orphan rows badge', () => {
  it('shows an amber badge with the count and the samples in its title', () => {
    const doc = render([student({ orphanRows: { count: 7, samples: ['WS-U4L3-5-Q1', 'WS-U4L3-5-Q2'] } })]);
    const badge = doc.querySelector('#grades-tbody .orphan-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('7 unplaced');
    expect(badge.getAttribute('title')).toContain('WS-U4L3-5-Q1, WS-U4L3-5-Q2');
  });

  it('no badge when orphanRows is absent or zero', () => {
    const doc = render([student({}), student({ studentId: 'stu_2', orphanRows: { count: 0, samples: [] } })]);
    expect(doc.querySelector('#grades-tbody .orphan-badge')).toBeNull();
  });

  it('the badge title is escaped (item ids are remote data)', () => {
    const doc = render([student({ orphanRows: { count: 1, samples: ['"><img src=x>'] } })]);
    expect(doc.querySelector('#grades-tbody img')).toBeNull();
  });
});

describe('class grades table: PC column', () => {
  it('headers read "U<n> PC" and cells show the curved pcRawPct, not unitGrade', () => {
    const doc = render([student({})]);
    const headers = [...doc.querySelectorAll('#grades-thead th')].map((th) => th.textContent);
    expect(headers).toContain('U1 PC');
    expect(headers).not.toContain('U1');
    const cells = [...doc.querySelectorAll('#grades-tbody td.num')];
    const pcCell = cells.find((td) => td.textContent === '84.2');
    expect(pcCell).toBeTruthy();
    expect(pcCell.getAttribute('title')).toContain('uncurved 71.5%');
    expect(cells.some((td) => td.textContent === '90.0')).toBe(false);
  });

  it('a unit without a PC score shows a dash', () => {
    const doc = render([student({ units: { U2: { unitGrade: 80, pcRawPct: null } } })]);
    const cells = [...doc.querySelectorAll('#grades-tbody td.num')];
    expect(cells.some((td) => td.textContent === '80.0')).toBe(false);
    expect(cells.every((td) => td.textContent === '\u2014')).toBe(true);
  });
});

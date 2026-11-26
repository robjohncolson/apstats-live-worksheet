// teacher-student-console-unlocks.test.js -- retirement pin for the drawer's old Lesson Unlocks
// section (T3 of P6 BUILD section 4.4). Lesson locks and roster-server/lesson-unlock.js are retired
// (routes removed in 12e66c7a), and the dead drawer UI is gone from teacher-dashboard.html: no
// #tsc-section-unlocks markup, no .tsc-unlock* CSS, no renderTscUnlocks / revokeUnlock, and no
// stub slot in openTscDrawer's Promise.allSettled. This file pins that the dashboard never calls a
// /lesson-unlock or /lesson-unlocks route again and that the remaining drawer fetches (grade,
// recent, nudge-history) are intact and still render.
//
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');

function makeDom(fetchMock) {
  const cleaned = DASH.replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(cleaned, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  dom.window.rosterClient = { token: () => null, current: () => null };
  dom.window.fetch = fetchMock;
  return dom;
}

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
  });
}

describe('Lesson Unlocks drawer UI is retired', () => {
  it('has no unlocks markup, CSS or functions', () => {
    expect(DASH).not.toMatch(/tsc-section-unlocks/);
    expect(DASH).not.toMatch(/tsc-unlocks-list/);
    expect(DASH).not.toMatch(/\.tsc-unlock/);
    expect(DASH).not.toMatch(/class="tsc-unlock/);
    expect(DASH).not.toMatch(/renderTscUnlocks/);
    expect(DASH).not.toMatch(/revokeUnlock/);
  });

  it('never names a /lesson-unlock or /lesson-unlocks route', () => {
    expect(DASH).not.toMatch(/\/lesson-unlocks?\b/);
  });

  it('openTscDrawer settles exactly three drawer fetches with no stub slot', () => {
    const at = DASH.indexOf('Promise.allSettled([', DASH.indexOf('function openTscDrawer'));
    expect(at).toBeGreaterThan(-1);
    const block = DASH.slice(at, DASH.indexOf(']).then(', at));
    expect(block).not.toContain('Promise.resolve(');
    expect((block.match(/fetch\(/g) || []).length).toBe(3);
    expect(DASH).toContain('var gradeRes = results[0], recentRes = results[1], nudgesRes = results[2];');
  });
});

describe('openTscDrawer fetch wiring after the retirement', () => {
  it('fires grade, recent and nudge-history and no lesson-unlock request', async () => {
    const fetchMock = okFetch();
    const { window } = makeDom(fetchMock);
    window.openTscDrawer({ studentId: 'stu_3fetch', username: 'apple-bird', realName: 'Three Fetch', section: 'PeriodB' });
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes('/teacher/student/stu_3fetch/grade'))).toBe(true);
    expect(urls.some((u) => u.includes('/teacher/student/stu_3fetch/recent'))).toBe(true);
    expect(urls.some((u) => u.includes('/teacher/nudge-history'))).toBe(true);
    expect(urls.some((u) => /\/lesson-unlocks?\b/.test(u))).toBe(false);
  });

  it('every fetch (the three drawer fetches included) carries x-teacher-secret when a secret is set', async () => {
    const fetchMock = okFetch();
    const { window } = makeDom(fetchMock);
    const secretInput = window.document.getElementById('teacher-secret');
    if (secretInput) secretInput.value = 'my-secret';
    window.openTscDrawer({ studentId: 'stu_sec2', username: 'lime-fish', realName: 'Sec User', section: 'PeriodB' });
    await new Promise((r) => setTimeout(r, 20));

    const drawerUrls = fetchMock.mock.calls.map((c) => c[0]).filter((u) => /\/teacher\/(student\/|nudge-history)/.test(u));
    expect(drawerUrls.length).toBe(3);
    fetchMock.mock.calls.forEach((call) => {
      expect(call[1].headers['x-teacher-secret']).toBe('my-secret');
    });
  });

  it('the grade and nudge-history results still land in their own panes (index shift)', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/grade')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: { Q4: { quarterGrade: 88.0 } }, units: {} }) });
      }
      if (url.includes('/nudge-history')) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ ok: false, error: 'not provisioned' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, submissions: [] }) });
    });
    const { window } = makeDom(fetchMock);
    window.openTscDrawer({ studentId: 'stu_idx', username: 'kiwi-frog', realName: 'Index User', section: 'PeriodE' });
    await new Promise((r) => setTimeout(r, 30));

    expect(window.document.getElementById('tsc-grade-card').textContent).toMatch(/88/);
    expect(window.document.getElementById('tsc-unlocks-list')).toBeNull();
    expect(window.document.getElementById('tsc-nudges-list')).not.toBeNull();
  });
});
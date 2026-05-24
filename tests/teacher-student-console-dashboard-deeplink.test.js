// teacher-student-console-dashboard-deeplink.test.js -- Wave B of P9 BUILD section 3.
// Tests the ?openDrawerFor= and ?openRemediation=1 URL-param deep-link handler
// in teacher-dashboard.html.
//
// Strategy: two layers.
//   1. Static source analysis (node env) -- verifies the handler is present and
//      references the correct param names.
//   2. JSDOM behavioral tests -- loads the page with runScripts:'dangerously',
//      sets window.location.search to include the param, stubs fetch, and
//      exercises the open + remediation paths.
//
// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH_PATH = resolve(repo, 'teacher-dashboard.html');
const DASH = existsSync(DASH_PATH) ? readFileSync(DASH_PATH, 'utf8') : null;

// ---------------------------------------------------------------------------
// JSDOM helper -- mirrors the pattern from teacher-student-console-drawer.test.js
// ---------------------------------------------------------------------------

function makeDom(fetchMock, searchString) {
  if (!DASH) throw new Error('teacher-dashboard.html not found');

  const cleaned = DASH
    .replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');

  // Include the query string in the URL so URLSearchParams can read it.
  var url = 'http://localhost/' + (searchString ? searchString : '');

  const dom = new JSDOM(cleaned, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: url,
    pretendToBeVisual: true,
  });

  const { window } = dom;

  // Stubs required at script-eval time.
  window.rosterClient = { token: () => null, current: () => null };
  window.fetch = fetchMock || vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
  });

  return dom;
}

// Profile response stub used by several tests.
var PROFILE_STUB = {
  ok: true,
  studentId: 'stu_123',
  username: 'papaya-otter',
  realName: 'Jane Doe',
  section: 'PeriodB',
  role: 'student',
};

// ---------------------------------------------------------------------------
// 1. Deep-link DOM hooks (static analysis)
// ---------------------------------------------------------------------------

describe('Deep-link DOM hooks', () => {
  it('file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('source contains a DOMContentLoaded handler that reads URLSearchParams', () => {
    expect(DASH).toMatch(/URLSearchParams/);
    expect(DASH).toMatch(/DOMContentLoaded/);
  });

  it('handler references the openDrawerFor param name', () => {
    expect(DASH).toMatch(/openDrawerFor/);
  });

  it('handler references the openRemediation param name', () => {
    expect(DASH).toMatch(/openRemediation/);
  });
});

// ---------------------------------------------------------------------------
// 2. ?openDrawerFor= behavior (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('?openDrawerFor= behavior', () => {
  it('loading with ?openDrawerFor=stu_123 triggers a fetch to /teacher/student/stu_123/profile', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/profile')) {
        return Promise.resolve({ ok: true, json: async () => PROFILE_STUB });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
      });
    });

    makeDom(fetchMock, '?openDrawerFor=stu_123');

    // Allow the 50 ms setTimeout to fire plus microtasks.
    await new Promise(r => setTimeout(r, 100));

    const profileCalls = fetchMock.mock.calls.filter(c => c[0] && c[0].includes('/teacher/student/stu_123/profile'));
    expect(profileCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('on 200 success, openTscDrawer is called with the student stub from the profile response', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/profile')) {
        return Promise.resolve({ ok: true, json: async () => PROFILE_STUB });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
      });
    });

    const dom = makeDom(fetchMock, '?openDrawerFor=stu_123');
    await new Promise(r => setTimeout(r, 120));

    const document = dom.window.document;
    const drawer = document.getElementById('tsc-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer.classList.contains('tsc-open')).toBe(true);

    // Header populated from profile stub.
    const title = document.getElementById('tsc-drawer-title');
    expect(title.textContent).toBe('Jane Doe');
  });

  it('on 401, the failure is logged and the page does not crash', async () => {
    const warnSpy = vi.fn();
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/profile')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ ok: false, error: 'forbidden' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
      });
    });

    const dom = makeDom(fetchMock, '?openDrawerFor=stu_bad');
    dom.window.console.warn = warnSpy;

    await new Promise(r => setTimeout(r, 120));

    // Page must not crash -- drawer stays closed.
    const drawer = dom.window.document.getElementById('tsc-drawer');
    expect(drawer.classList.contains('tsc-open')).toBe(false);

    // console.warn must have been called with the deeplink prefix.
    const warned = warnSpy.mock.calls.some(c => c[0] && String(c[0]).includes('[deeplink]'));
    expect(warned).toBe(true);
  });

  it('without the query param, no profile fetch fires', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });

    makeDom(fetchMock, '');
    await new Promise(r => setTimeout(r, 120));

    const profileCalls = fetchMock.mock.calls.filter(c => c[0] && c[0].includes('/profile'));
    expect(profileCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. ?openRemediation=1 behavior (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('?openRemediation=1 behavior', () => {
  it('after drawer opens via ?openDrawerFor=...&openRemediation=1, the remediation button is clicked', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/profile')) {
        return Promise.resolve({ ok: true, json: async () => PROFILE_STUB });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
      });
    });

    const dom = makeDom(fetchMock, '?openDrawerFor=stu_123&openRemediation=1');
    const document = dom.window.document;

    // Track clicks on the remediation button.
    const remBtn = document.getElementById('tsc-action-remediation');
    expect(remBtn).not.toBeNull();

    const clickSpy = vi.fn();
    // Wire the spy BEFORE the DOMContentLoaded fires (it fires synchronously on
    // JSDOM parse, so we need to check the button after the fact).
    remBtn.addEventListener('click', clickSpy);

    // Wait for the 50 ms fetchdelay + fetch microtask + 250 ms remediation delay.
    await new Promise(r => setTimeout(r, 450));

    // The remediation modal should be open OR the button was clicked.
    const modal = document.getElementById('tsc-remediation-modal');
    const modalOpen = modal && modal.classList.contains('tsc-modal-open');
    const btnWasClicked = clickSpy.mock.calls.length > 0;

    // Either the modal opened (full flow), or the click was fired (button wired separately).
    expect(modalOpen || btnWasClicked).toBe(true);
  });

  it('?openRemediation=1 without openDrawerFor does not fire a profile fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });

    makeDom(fetchMock, '?openRemediation=1');
    await new Promise(r => setTimeout(r, 120));

    const profileCalls = fetchMock.mock.calls.filter(c => c[0] && c[0].includes('/profile'));
    expect(profileCalls.length).toBe(0);
  });
});

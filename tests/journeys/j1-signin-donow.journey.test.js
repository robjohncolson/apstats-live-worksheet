/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-08-18T12:00:00.000Z';

function gradeFixture() {
  return {
    ok: true,
    asOf: NOW,
    units: [],
    quarters: {
      Q1: {
        quarterGrade: 87.5,
        ceiling: 94,
        pcAvg: 82,
        workAvg: 87.5,
        lessonsDue: 7,
        lessonsGraded: 5,
        lessonsTotal: 10,
      },
    },
    completion: {},
    lessons: [],
    gradebook: {},
  };
}

async function settleSignIn(harness, username) {
  await harness.signIn(username);
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter')
  ), { message: 'signed-in identity chip did not render' });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

function clickSignOut(document) {
  const signOut = [...document.querySelectorAll('#menu-student .menu-dd-item')]
    .find((item) => item.textContent.includes('Sign Out'));
  expect(signOut, 'the real User menu has no Sign Out action').toBeTruthy();
  signOut.click();
}

// Boots the full Desk in JSDOM; under full-suite load that alone can exceed the
// 5 s default (passes alone). Same 30 s budget J7/J8 already use.
describe('Desk journey J1', { timeout: 30_000 }, () => {
  it('J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)', async () => {
    let harness = await bootDesk({
      now: NOW,
      roster: { grades: gradeFixture() },
    });

    try {
      await settleSignIn(harness, 'alpha_otter');
      await harness.waitFor(() => (
        harness.document.querySelector('#donow-grades .qgrade')?.textContent === '88'
      ), { message: 'Do Now grades did not render' });

      const doNow = harness.document.getElementById('donow-card');
      expect(doNow.style.display).toBe('flex');
      expect(doNow.className).toContain('donow-todo');
      expect(harness.document.getElementById('donow-msg').textContent).toContain('1.1');

      const grades = harness.document.getElementById('donow-grades');
      expect(grades.style.display).toBe('flex');
      expect(grades.querySelector('.qkey')?.textContent).toBe('Q1');
      expect(grades.querySelector('.qgrade')?.textContent).toBe('88');
      // EFFORT_VISIBILITY_V2_SPEC §3: the tracks and the 40% rule ride in the pill; no ↑ceiling.
      expect(grades.querySelector('.qceil')).toBeNull();
      expect(grades.querySelector('.qpill .qrule')?.textContent).toBe('= higher of Work 88 · PC 82');
      expect([...grades.querySelectorAll('.qpill .qtrack')].map((el) => el.textContent)).toEqual(['Work 88', 'PC 82']);

      const doNowRequest = await harness.waitFor(() => (
        harness.roster.state.requests.find((request) => (
          request.method === 'GET' && request.path === '/donow'
            && request.headers.authorization === 'Bearer token:alpha_otter'
        ))
      ), { message: 'authenticated /donow request was not recorded' });
      expect(doNowRequest.body).toBeNull();

      const gradeRequest = await harness.waitFor(() => (
        harness.roster.state.requests.find((request) => (
          request.method === 'GET' && request.path === '/grade'
            && new URL(request.url).searchParams.get('token') === 'token:alpha_otter'
        ))
      ), { message: 'authenticated /grade request was not recorded' });
      expect(gradeRequest.body).toBeNull();

      clickSignOut(harness.document);
      harness = await harness.reboot();

      expect(harness.window.localStorage.getItem('apstats_roster.v1')).toBeNull();
      expect(harness.document.getElementById('menu-identity').textContent).toBe('Sign in');
    } finally {
      harness.teardown();
    }
  });
});

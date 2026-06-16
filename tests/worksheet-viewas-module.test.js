/**
 * tests/worksheet-viewas-module.test.js
 *
 * Runs the REAL injected WS-VIEWAS-MODULE (from a shipped worksheet) in jsdom and
 * pins its two security-critical behaviors:
 *   Bug 2 — the Show-Answers button is revealed ONLY for a signed teacher on their
 *           own worksheet (never a student, never view-as, never a forged role flag).
 *   Bug 1 — teacher view-as enters READ-ONLY: __VIEW_AS_STUDENT_ID__ is set so reads
 *           target the student, and every server-write sink is neutered.
 *
 * The module source is extracted from u1_lesson2_live.html (all 69 are identical),
 * so this also guards against the codemod drifting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';

const REPO_ROOT = resolve(__dirname, '..');
const WS = readFileSync(resolve(REPO_ROOT, 'u1_lesson2_live.html'), 'utf-8');

// Extract the module's <script> body (the one right after the WS-VIEWAS-MODULE marker).
function extractModule(html) {
  const marker = html.indexOf('WS-VIEWAS-MODULE');
  if (marker < 0) throw new Error('WS-VIEWAS-MODULE marker not found');
  const open = html.indexOf('<script>', marker);
  const close = html.indexOf('</script>', open);
  return html.slice(open + '<script>'.length, close);
}

const MODULE_SRC = extractModule(WS);

// Build a jsdom window with a worksheet-ish DOM + injectable roster/clients.
function makeEnv({ url, role, hasRosterSession = true }) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
       <div class="controls">
         <button class="btn-check">Check</button>
         <button class="btn-show" id="btn-show-answers" hidden>Show</button>
         <button class="btn-reset">Reset</button>
       </div>
       <input class="blank" id="b1">
       <textarea id="reflect1"></textarea>
       <input id="worksheetName" value="Teacher McTeach">
       <input id="worksheetUsername" value="teacher_account">
       <input id="worksheetPeriod" value="B">
     </body></html>`,
    { url, runScripts: 'outside-only' }
  );
  const win = dom.window;

  win.ROSTER_SERVICE_URL = 'https://roster.test';
  win.rosterClient = {
    current: () => (hasRosterSession ? { username: 'someone', role } : null),
    token: () => 'tok-abc',
    studentId: () => 'uuid-self',
  };
  let recordCalls = 0, submitCalls = 0;
  win.gradebookClient = { record: () => { recordCalls++; return Promise.resolve({ ok: true }); } };
  win.railwayClient = { submitAnswer: () => { submitCalls++; return Promise.resolve(); } };
  // No real network — the read-only banner fetch must fail soft.
  win.fetch = () => Promise.reject(new Error('no network in test'));

  win.eval(MODULE_SRC);
  // jsdom is in readyState 'loading' at eval time, so _boot / _gateShowAnswers
  // are deferred to DOMContentLoaded — fire it so the synchronous lockdown runs.
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded')); } catch (_) {}
  return {
    win,
    counts: () => ({ record: recordCalls, submit: submitCalls }),
  };
}

const WS_URL = 'https://robjohncolson.github.io/apstats-live-worksheet/u1_lesson2_live.html';

describe('WS-VIEWAS-MODULE — Show-Answers gate (Bug 2)', () => {
  it('STUDENT (no view-as): button stays hidden', () => {
    const { win } = makeEnv({ url: WS_URL, role: 'student' });
    expect(win.document.getElementById('btn-show-answers').hidden).toBe(true);
  });

  it('GUEST / not signed in: button stays hidden', () => {
    const { win } = makeEnv({ url: WS_URL, role: undefined, hasRosterSession: false });
    expect(win.document.getElementById('btn-show-answers').hidden).toBe(true);
  });

  it('TEACHER on their own worksheet: button is revealed', () => {
    const { win } = makeEnv({ url: WS_URL, role: 'teacher' });
    expect(win.document.getElementById('btn-show-answers').hidden).toBe(false);
  });

  it('does NOT trust a forged localStorage role flag (cheat stays closed)', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body><button class="btn-show" id="btn-show-answers" hidden>Show</button></body></html>`,
      { url: WS_URL, runScripts: 'outside-only' }
    );
    const win = dom.window;
    win.localStorage.setItem('apstats_user_role', 'teacher');   // a kid forging the flag
    win.rosterClient = { current: () => ({ role: 'student' }), token: () => 't', studentId: () => 's' };
    win.eval(MODULE_SRC);
    try { win.document.dispatchEvent(new win.Event('DOMContentLoaded')); } catch (_) {}
    expect(win.document.getElementById('btn-show-answers').hidden).toBe(true);
  });
});

describe('WS-VIEWAS-MODULE — view-as read-only (Bug 1)', () => {
  it('TEACHER + ?viewAsUserId: enters read-only and targets the student', () => {
    const { win } = makeEnv({ url: WS_URL + '?viewAsUserId=stu_target', role: 'teacher' });
    expect(win.__VIEW_AS_STUDENT_ID__).toBe('stu_target');
    expect(win.__WS_READ_ONLY__).toBe(true);
  });

  it('neuters the gradebook + railway write sinks', async () => {
    const { win, counts } = makeEnv({ url: WS_URL + '?viewAsUserId=stu_target', role: 'teacher' });
    await win.gradebookClient.record({ source: 'worksheet', itemId: 'X', response: 'y' });
    await win.railwayClient.submitAnswer('user', 'q', 'a');
    // The originals (which increment counters) were replaced by no-ops.
    expect(counts()).toEqual({ record: 0, submit: 0 });
  });

  it('the gradebook no-op reports read-only (not a silent success)', async () => {
    const { win } = makeEnv({ url: WS_URL + '?viewAsUserId=stu_target', role: 'teacher' });
    const r = await win.gradebookClient.record({ source: 'worksheet', itemId: 'X', response: 'y' });
    expect(r).toEqual({ ok: false, reason: 'read-only' });
  });

  it('disables worksheet inputs + hides the answer/grade buttons', () => {
    const { win } = makeEnv({ url: WS_URL + '?viewAsUserId=stu_target', role: 'teacher' });
    expect(win.document.getElementById('b1').disabled).toBe(true);
    expect(win.document.getElementById('reflect1').disabled).toBe(true);
    expect(win.document.querySelector('.btn-check').style.display).toBe('none');
    expect(win.document.querySelector('.btn-show').style.display).toBe('none');
  });

  it('clears the teacher identity the worksheet pre-filled (fail-safe when profile fetch fails)', () => {
    // fetch is rejected in makeEnv, so _profile() returns null and _banner cannot
    // fill the student's name — the fields must NOT keep showing the teacher.
    const { win } = makeEnv({ url: WS_URL + '?viewAsUserId=stu_target', role: 'teacher' });
    expect(win.document.getElementById('worksheetName').value).toBe('');
    expect(win.document.getElementById('worksheetUsername').value).toBe('');
    expect(win.document.getElementById('worksheetPeriod').value).toBe('');
  });

  it('a NORMAL student keeps their pre-filled identity (no clearing outside view-as)', () => {
    const { win } = makeEnv({ url: WS_URL, role: 'student' });
    expect(win.document.getElementById('worksheetName').value).toBe('Teacher McTeach');
  });

  it('a STUDENT who forges ?viewAsUserId gets NO read-only and NO student-targeting', () => {
    const { win } = makeEnv({ url: WS_URL + '?viewAsUserId=stu_someone_else', role: 'student' });
    expect(win.__VIEW_AS_STUDENT_ID__).toBeUndefined();
    expect(win.__WS_READ_ONLY__).toBeUndefined();
    // Sinks remain the originals (read targets self via fetchPrior, which the
    // server still authorizes self-only — the forged URL leaks nothing).
    expect(win.document.getElementById('b1').disabled).toBe(false);
  });
});

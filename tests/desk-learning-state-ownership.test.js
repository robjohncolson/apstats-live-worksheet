// Behavioral regressions: continuations and legacy aliases belong to one student.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { DESK, extractFn, composeOracles } from './fixtures/incident-progress-reset/oracles.js';
import { composeRenderHarness } from './fixtures/incident-progress-reset/matrix-harness.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function grade(score = 100) {
  return { ok: true, lessons: [{ lessonKey: '1.2', Cws: score, blooket: score }], quarters: {} };
}

function response(data = grade()) {
  return { ok: true, status: 200, json: async () => data };
}

function pendingGrades() {
  const calls = [];
  const identity = { username: 'Alice', studentId: 'alice', origin: 'https://roster.test' };
  identity.fetchImpl = () => { const call = deferred(); calls.push(call); return call.promise; };
  const h = composeRenderHarness(identity);
  h.win.rosterClient.token = () => identity.studentId + '-token';
  runInContext(extractFn(DESK, '_resetGradeStateForIdentitySwitch'), createContext(h.win));
  function switchToBob() {
    identity.username = 'Bob';
    identity.studentId = 'bob';
    h.win._resetGradeStateForIdentitySwitch();
  }
  return { ...h, identity, calls, switchToBob };
}

describe('Grade request admission', () => {
  it.each(['success', 'auth failure', 'network failure'])('ignores an old owner\'s late %s', async (kind) => {
    const h = pendingGrades();
    try {
      const old = h.render(null, 'alice-token');
      h.switchToBob();
      const current = h.render(null, 'bob-token');
      h.calls[1].resolve(response(grade(40)));
      await current;
      const before = JSON.stringify({ cache: h.rawGradeCache(), latch: h.rawLatch(),
        lessons: h.win._gradeLessonsCache, state: h.win._gradeLoadState,
        html: h.win.document.getElementById('donow-grades').innerHTML });
      if (kind === 'network failure') h.calls[0].reject(new Error('offline'));
      else h.calls[0].resolve(kind === 'auth failure' ? { ok: false, status: 401 } : response());
      await old;
      expect(JSON.stringify({ cache: h.rawGradeCache(), latch: h.rawLatch(),
        lessons: h.win._gradeLessonsCache, state: h.win._gradeLoadState,
        html: h.win.document.getElementById('donow-grades').innerHTML })).toBe(before);
      expect(h.win.__signInOpened).not.toBe(true);
      expect(h.timers).toHaveLength(0);
    } finally { h.win.close(); }
  });

  it('checks ownership again after JSON decoding', async () => {
    const h = pendingGrades();
    const json = deferred();
    try {
      const pending = h.render(null, 'alice-token');
      h.calls[0].resolve({ ok: true, status: 200, json: () => json.promise });
      await new Promise(setImmediate);
      h.switchToBob();
      json.resolve(grade());
      await pending;
      expect(h.rawGradeCache()).toBeNull();
      expect(h.rawLatch()).toBeNull();
      expect(h.win._gradeLessonsCache).toBeNull();
      expect(h.win._gradeLoadState).toBe('unknown');
    } finally { h.win.close(); }
  });

  it('does not admit an offline derivation or schedule its retry after a switch', async () => {
    const h = pendingGrades();
    const derived = deferred();
    try {
      h.win._phase2ReDeriveGrade = () => derived.promise;
      const pending = h.render(null, 'alice-token');
      h.calls[0].resolve({ ok: false, status: 503 });
      await new Promise(setImmediate);
      h.switchToBob();
      derived.resolve(grade());
      await pending;
      expect(h.win._gradeLessonsCache).toBeNull();
      expect(h.win._gradeLoadState).toBe('unknown');
      expect(h.timers).toHaveLength(0);
    } finally { h.win.close(); }
  });

  it('keeps the newer request when the same student receives responses out of order', async () => {
    const h = pendingGrades();
    try {
      const old = h.render(null, 'alice-token');
      const current = h.render(null, 'alice-token');
      h.calls[1].resolve(response(grade(70)));
      await current;
      h.calls[0].resolve(response(grade(100)));
      await old;
      expect(h.win._gradeLessonsCache[0].Cws).toBe(70);
      expect(h.rawGradeCache().data.lessons[0].Cws).toBe(70);
      expect(h.rawLatch().topics['1.2'].bl).not.toBe(true);
    } finally { h.win.close(); }
  });

  it('ignores a result when view-as changes without a sign-in reset', async () => {
    const h = pendingGrades();
    try {
      const pending = h.render(null, 'alice-token');
      h.win._viewAsContext = () => ({ studentId: 'viewed-student' });
      h.calls[0].resolve(response());
      await pending;
      expect(h.win._gradeLessonsCache).toBeNull();
      expect(h.rawGradeCache()).toBeNull();
    } finally { h.win.close(); }
  });

  it('clears official projections and ignores an official grade that finishes after a switch', async () => {
    const h = pendingGrades();
    const official = deferred();
    try {
      h.win._officialGradeCache = { quarter: 'Q1', grade: 99 };
      h.win._officialGradeByQuarter = { Q1: h.win._officialGradeCache };
      let requested = false;
      h.win._fetchOfficialGrade = () => { requested = true; return official.promise; };
      const pending = h.render(null, 'alice-token');
      h.calls[0].resolve(response());
      await new Promise(setImmediate);
      expect(requested).toBe(true);
      h.switchToBob();
      expect(h.win._officialGradeCache).toBeNull();
      expect(h.win._officialGradeByQuarter).toEqual({});
      official.resolve({ quarter: 'Q1', grade: 99 });
      await pending;
      expect(h.win._officialGradeCache).toBeNull();
      expect(h.win._officialGradeByQuarter).toEqual({});
    } finally { h.win.close(); }
  });
});

describe('Offline grade input refresh ownership', () => {
  function offlineHarness() {
    const h = pendingGrades();
    const inputs = [];
    const pulls = [];
    let verifies = 0;
    h.win.fetch = () => { const call = deferred(); inputs.push(call); return call.promise; };
    h.win.LedgerStore = { pull() { const call = deferred(); pulls.push(call); return call.promise; } };
    h.win._phase2RegisterIssuer = () => {};
    h.win._phase2RefreshVerifySummary = () => { verifies++; };
    runInContext('var _phase2BaseUrl = null;\n' +
      ['_phase2InputsKey', '_phase2PersistInputs', '_phase2RefreshOnline'].map((name) => extractFn(DESK, name)).join('\n'),
    createContext(h.win));
    return { ...h, inputs, pulls, verifies: () => verifies };
  }

  it('persists inputs and refreshes verification for the same current owner', async () => {
    const h = offlineHarness();
    try {
      h.win._phase2RefreshOnline('https://roster.test', 'alice-token');
      h.inputs[0].resolve(response({ ok: true, config: { owner: 'alice' } }));
      h.pulls[0].resolve();
      await new Promise(setImmediate);
      const stored = JSON.parse(h.win.localStorage.getItem('apstats_grade_inputs_v1:alice'));
      expect(stored.inputs.config.owner).toBe('alice');
      expect(h.verifies()).toBe(1);
    } finally { h.win.close(); }
  });

  it('does not write pending decoded inputs or refresh the new owner after a switch', async () => {
    const h = offlineHarness();
    const json = deferred();
    try {
      h.win._phase2RefreshOnline('https://roster.test', 'alice-token');
      h.inputs[0].resolve({ ok: true, json: () => json.promise });
      await new Promise(setImmediate);
      h.switchToBob();
      json.resolve({ ok: true, config: { owner: 'alice' } });
      h.pulls[0].resolve();
      await new Promise(setImmediate);
      expect(h.win.localStorage.getItem('apstats_grade_inputs_v1:bob')).toBeNull();
      expect(h.win.localStorage.getItem('apstats_grade_inputs_v1:alice')).toBeNull();
      expect(h.verifies()).toBe(0);
    } finally { h.win.close(); }
  });

  it('keeps the newer inputs when overlapping refreshes finish out of order', async () => {
    const h = offlineHarness();
    try {
      h.win._phase2RefreshOnline('https://roster.test', 'alice-token');
      h.win._phase2RefreshOnline('https://roster.test', 'alice-token');
      h.inputs[1].resolve(response({ ok: true, version: 'new' }));
      h.pulls[1].resolve();
      await new Promise(setImmediate);
      h.inputs[0].resolve(response({ ok: true, version: 'old' }));
      h.pulls[0].resolve();
      await new Promise(setImmediate);
      const stored = JSON.parse(h.win.localStorage.getItem('apstats_grade_inputs_v1:alice'));
      expect(stored.inputs.version).toBe('new');
      expect(h.verifies()).toBe(1);
    } finally { h.win.close(); }
  });
});

describe('Boot session refresh during grade loading', () => {
  function refreshingGrades() {
    const h = pendingGrades();
    const refresh = deferred();
    let token = 'alice-token';
    h.win.rosterClient.token = () => token;
    h.win.rosterClient.isExpired = () => false;
    h.win.rosterClient.refreshIfNeeded = () => refresh.promise;
    runInContext(extractFn(DESK, '_refreshRosterSession'), createContext(h.win));
    return { ...h, refresh, rotateToken() { token = 'alice-renewed-token'; } };
  }

  it('replaces the invalidated grade request after same-student token rotation', async () => {
    const h = refreshingGrades();
    try {
      h.win._refreshRosterSession();
      const oldGrade = h.render(null, 'alice-token');
      h.rotateToken();
      h.refresh.resolve({ ok: true, refreshed: true });
      await new Promise(setImmediate);
      expect(h.calls).toHaveLength(2);
      h.calls[0].resolve(response(grade(100)));
      await oldGrade;
      expect(h.win._gradeLessonsCache).toBeNull();
      h.calls[1].resolve(response(grade(80)));
      await new Promise(setImmediate);
      expect(h.win._gradeLoadState).toBe('available');
      expect(h.win._gradeLessonsCache[0].Cws).toBe(80);
      expect(h.rawGradeCache().data.lessons[0].Cws).toBe(80);
      expect(h.win.document.getElementById('donow-grades').style.display).toBe('flex');
    } finally { h.win.close(); }
  });

  it.each([
    { ok: true, refreshed: false },
    { ok: false, reason: 'auth' },
    { ok: false, reason: 'network' },
  ])('does not replace a live request when refresh returns %j', async (result) => {
    const h = refreshingGrades();
    try {
      h.win._refreshRosterSession();
      const pending = h.render(null, 'alice-token');
      h.refresh.resolve(result);
      await new Promise(setImmediate);
      expect(h.calls).toHaveLength(1);
      h.calls[0].resolve(response(grade(80)));
      await pending;
      expect(h.win._gradeLoadState).toBe('available');
    } finally { h.win.close(); }
  });

  it.each(['different student', 'view-as'])('does not refresh grades after switching to %s', async (change) => {
    const h = refreshingGrades();
    try {
      h.win._refreshRosterSession();
      if (change === 'different student') h.switchToBob();
      else h.win._viewAsContext = () => ({ studentId: 'viewed-student' });
      h.rotateToken();
      h.refresh.resolve({ ok: true, refreshed: true });
      await new Promise(setImmediate);
      expect(h.calls).toHaveLength(0);
      expect(h.win._gradeLessonsCache).toBeNull();
    } finally { h.win.close(); }
  });
});

function signInHarness({ previousStudentId = 'alice', previousName = 'Alice', legacy = 'Alice' } = {}) {
  const state = { username: previousName, studentId: previousStudentId, legacyEmailKey: legacy };
  const o = composeOracles(state);
  const win = o.win;
  win.document.body.innerHTML = `
    <input id="signin-username" value="Bob"><input id="signin-password" value="1234">
    <div id="signin-error"></div><button id="signin-ok"></button>
    <input id="nf-pw" value="1234"><div id="nf-pw-error"></div><button id="nf-pw-ok"></button>
    <input id="signup-realname" value="Bob"><input id="signup-pin" value="1234">
    <input id="signup-pin2" value="1234"><div id="signup-error"></div><button id="signup-ok"></button>`;
  win.rosterClient.current = () => state.studentId ? { username: state.username, studentId: state.studentId } : null;
  function authenticate() {
    state.username = 'Bob'; state.studentId = 'bob';
    return Promise.resolve({ ok: true, username: 'Bob' });
  }
  win.rosterClient.signIn = authenticate;
  win.rosterClient.claim = authenticate;
  Object.assign(win, {
    _nfPicked: { username: 'Bob' }, _signupCandidate: 'Bob', _signupSectionValue: 'B',
    registerStudent() {}, updateStudentMenu() {}, showDialog() {},
    closeSignInModal() {}, closeNameFinder() {}, closeSignUpModal() {},
    _resetGradeStateForIdentitySwitch() {},
  });
  runInContext(['submitSignIn', '_nfSubmitPassword', 'submitSignUp', '_applySignedUpSession']
    .map((name) => extractFn(DESK, name)).join('\n'), createContext(win));
  win.localStorage.setItem('apstats_desk_marks_' + legacy, JSON.stringify({
    '1.2|worksheet': { ts: '2026-11-01', score: 100 },
    '1.2|blooket': { ts: '2026-11-01', score: 100 },
  }));
  return { ...o, state };
}

describe('Scheduled grade retry credentials', () => {
  it('uses the renewed token when an already scheduled retry fires', async () => {
    const h = pendingGrades();
    let token = 'alice-token';
    h.win.rosterClient.token = () => token;
    try {
      const first = h.render(null, token);
      h.calls[0].resolve({ ok: false, status: 503 });
      await first;
      expect(h.timers).toHaveLength(1);
      token = 'alice-renewed-token';
      h.timers[0].fn();
      await new Promise(setImmediate);
      expect(h.calls).toHaveLength(2);
      h.calls[1].resolve(response(grade(85)));
      await new Promise(setImmediate);
      expect(h.win._gradeLoadState).toBe('available');
      expect(h.win._gradeLessonsCache[0].Cws).toBe(85);
    } finally { h.win.close(); }
  });

  it('does not reuse a captured token after logout', async () => {
    const h = pendingGrades();
    let token = 'alice-token';
    h.win.rosterClient.token = () => token;
    try {
      const first = h.render(null, token);
      h.calls[0].resolve({ ok: false, status: 503 });
      await first;
      token = null;
      h.timers[0].fn();
      await new Promise(setImmediate);
      expect(h.calls).toHaveLength(1);
    } finally { h.win.close(); }
  });
});

describe('Alias migration through real authentication tails', () => {
  it.each(['submitSignIn', '_nfSubmitPassword', 'submitSignUp'])('%s does not copy a different roster owner\'s marks', async (entry) => {
    const h = signInHarness();
    try {
      await h.win[entry]();
      expect(h.state.studentId).toBe('bob');
      expect(h.marksFor('Bob')).toEqual({});
      expect(h.isLessonComplete('1.2', h.marksFor('Bob'))).toBe(false);
      expect(h.marksFor('Alice')['1.2|worksheet'].score).toBe(100);
    } finally { h.win.close(); }
  });

  it.each(['submitSignIn', '_nfSubmitPassword', 'submitSignUp'])('%s still recovers a pre-roster email bucket', async (entry) => {
    const h = signInHarness({ previousStudentId: null, previousName: null, legacy: 'bob@old.example' });
    try {
      await h.win[entry]();
      expect(h.marksFor('Bob')['1.2|worksheet'].score).toBe(100);
      expect(h.isLessonComplete('1.2', h.marksFor('Bob'))).toBe(true);
    } finally { h.win.close(); }
  });

  it('preserves legacy aliases when the same roster student refreshes the session', async () => {
    const h = signInHarness({ previousStudentId: 'bob', previousName: 'Bob', legacy: 'bob@old.example' });
    try {
      await h.win.submitSignIn();
      expect(h.marksFor('Bob')['1.2|worksheet'].score).toBe(100);
    } finally { h.win.close(); }
  });
});

// tests/poll-archive-cockpit.test.js
//
// U3 -- cockpit archive write.
// Verifies that teacher-classroom.html fires a guarded POST /poll-archive
// on poll close with the Section 1.4 body shape.
//
// Two layers:
//   1. Structure assertions -- regex over the source file.
//   2. Runtime check -- load the cockpit script into a vm context and
//      simulate a poll-open -> poll-close state-change sequence to confirm
//      the fetch is actually called with the right arguments.
//
// ASCII-only.  LF line endings.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPO_ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COCKPIT_SRC = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf8');

// ============================================================
// Layer 1 -- structural source assertions
// ============================================================

describe('U3 -- cockpit source structure: archivePoll function', () => {
  it('defines archivePoll as a function', () => {
    expect(COCKPIT_SRC).toMatch(/function\s+archivePoll\s*\(/);
  });

  it('archivePoll posts to /poll-archive', () => {
    expect(COCKPIT_SRC).toMatch(/\/poll-archive/);
    expect(COCKPIT_SRC).toMatch(/method\s*:\s*['"]POST['"]/);
  });

  it('archivePoll uses rosterServiceUrl() as the base URL', () => {
    expect(COCKPIT_SRC).toMatch(/rosterServiceUrl\s*\(\s*\)/);
  });

  it('archivePoll attaches an Authorization Bearer header', () => {
    expect(COCKPIT_SRC).toMatch(/Authorization/);
    expect(COCKPIT_SRC).toMatch(/Bearer/);
    expect(COCKPIT_SRC).toMatch(/rosterClient.*token|token.*rosterClient/);
  });

  it('archivePoll body includes all Section 1.4 fields', () => {
    // All seven body fields must appear in the source.
    for (const field of ['pollId', 'section', 'pollDate', 'question', 'options', 'tally', 'blind']) {
      expect(COCKPIT_SRC, `body field "${field}" must be present`).toMatch(
        new RegExp(field + '\\s*:')
      );
    }
  });

  it('archivePoll wraps fetch in try/catch (guarded)', () => {
    // The try/catch guard must appear around the fetch call.
    const idx = COCKPIT_SRC.indexOf('function archivePoll');
    expect(idx).toBeGreaterThan(-1);
    const fnSlice = COCKPIT_SRC.slice(idx, idx + 1000);
    expect(fnSlice).toMatch(/try\s*\{/);
    expect(fnSlice).toMatch(/catch\s*\(_\)/);
  });

  it('archivePoll attaches a .catch() to the fetch promise (double guard)', () => {
    expect(COCKPIT_SRC).toMatch(/\.catch\s*\(\s*function\s*\(\s*\)\s*\{\s*\}/);
  });
});

describe('U3 -- cockpit source structure: poll-close trigger', () => {
  it('archives from summary.closedPoll (the board close payload)', () => {
    expect(COCKPIT_SRC).toMatch(/summary\.closedPoll/);
  });

  it('dedups the archive by poll id against _lastArchivedPollId', () => {
    expect(COCKPIT_SRC).toMatch(/_lastArchivedPollId/);
    expect(COCKPIT_SRC).toMatch(/!==\s*_lastArchivedPollId/);
  });

  it('calls archivePoll with the closedPoll payload', () => {
    expect(COCKPIT_SRC).toMatch(/archivePoll\s*\(/);
  });

  it('teardown clears _lastArchivedPollId', () => {
    const idx = COCKPIT_SRC.indexOf('function teardown');
    expect(idx).toBeGreaterThan(-1);
    expect(COCKPIT_SRC.slice(idx, idx + 400)).toMatch(/_lastArchivedPollId\s*=\s*null/);
  });

  it('todayIsoDate() is defined and used for pollDate', () => {
    expect(COCKPIT_SRC).toMatch(/function\s+todayIsoDate\s*\(\s*\)/);
    expect(COCKPIT_SRC).toMatch(/todayIsoDate\s*\(\s*\)/);
  });

  it('todayIsoDate pads month and day to 2 digits', () => {
    const idx = COCKPIT_SRC.indexOf('function todayIsoDate');
    expect(idx).toBeGreaterThan(-1);
    const fnSlice = COCKPIT_SRC.slice(idx, idx + 500);
    expect(fnSlice).toMatch(/padStart\s*\(\s*2/);
  });
});

describe('U3 -- cockpit source structure: script tags', () => {
  it('loads roster_config.js', () => {
    expect(COCKPIT_SRC).toMatch(/<script\s+src=["']roster_config\.js["']/i);
  });

  it('loads roster-client.js', () => {
    expect(COCKPIT_SRC).toMatch(/<script\s+src=["']roster-client\.js["']/i);
  });
});

// ============================================================
// Layer 2 -- runtime check via vm/jsdom
// ============================================================

// Extract the inline <script> block from teacher-classroom.html.
// We grab the last <script> block (the main logic block, not the src tags).
function extractInlineScript(src) {
  // Find all <script> blocks without a src attribute.
  const results = [];
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    results.push(m[1]);
  }
  // Return the longest one (the main logic block).
  if (!results.length) return '';
  return results.reduce((a, b) => (b.length > a.length ? b : a), '');
}

// Build a minimal JSDOM environment suitable for running the cockpit script.
// We inject stubs for all external dependencies the script touches on load.
// Returns { dom, win, fireStateChange, fetchCalls }.
function makeTestEnv({ fetchImpl, token, rosterServiceUrl } = {}) {
  var dom = new JSDOM(
    `<!DOCTYPE html>
<html><body>
  <div id="board-region" style="display:none"></div>
  <div id="access-denied-panel" style="display:none"></div>
  <!-- v3 P1+P2: global presence + Go Live elements -->
  <div id="global-presence-section">
    <div id="global-presence-list"><div id="global-presence-empty"></div></div>
    <button id="btn-go-live"></button>
    <div id="go-live-hint"></div>
  </div>
  <div id="section-region" style="display:none">
    <h2 id="section-region-title">Live -- Period <span id="live-section-label">?</span></h2>
    <button id="btn-exit-live"></button>
  </div>
  <select id="section-select"><option value="PeriodE">PeriodE</option></select>
  <div id="status-row"></div>
  <div id="board-mount"></div>
  <div id="control-section" style="display:none"></div>
  <div id="checkin-section" style="display:none"></div>
  <div id="checkin-panel-section" style="display:none"></div>
  <div id="poll-history-section" style="display:none"></div>
  <div id="poll-section" style="display:none"></div>
  <div id="checkin-count"></div>
  <ul id="checkin-list"></ul>
  <div id="checkin-empty"></div>
  <span id="greenlight-dot"></span>
  <span id="greenlight-label"></span>
  <div id="poll-tally-label"></div>
  <canvas id="poll-result-canvas" width="480" height="160"></canvas>
  <div id="poll-options-list">
    <div class="poll-option-row">
      <input class="poll-option-input" type="text" value="Yes">
      <button class="poll-remove-btn">x</button>
    </div>
    <div class="poll-option-row">
      <input class="poll-option-input" type="text" value="No">
      <button class="poll-remove-btn">x</button>
    </div>
  </div>
  <button id="poll-add-option"></button>
  <input id="poll-question-input" type="text">
  <input id="poll-blind-checkbox" type="checkbox">
  <button id="btn-open-poll"></button>
  <button id="btn-close-poll"></button>
  <button id="btn-reveal-poll"></button>
  <button id="btn-arm-gate"></button>
  <button id="btn-green-light"></button>
  <input id="sync-video-start" type="checkbox">
  <button id="btn-reset"></button>
</body></html>`,
    { url: 'https://example.com' }
  );

  var win = dom.window;

  // Stub canvas getContext so renderPollTally does not throw.
  // jsdom does not implement HTMLCanvasElement.prototype.getContext.
  var stubCtx = {
    clearRect:   function () {},
    fillRect:    function () {},
    strokeRect:  function () {},
    fillText:    function () {},
    measureText: function () { return { width: 0 }; },
    beginPath:   function () {},
    moveTo:      function () {},
    lineTo:      function () {},
    stroke:      function () {},
    fill:        function () {}
  };
  win.HTMLCanvasElement.prototype.getContext = function () { return stubCtx; };

  // The captured onStateChange callback from ClassroomBoard.mount.
  var _onStateChange = null;

  // Stub ClassroomBoard -- capture onStateChange when mount is called.
  win.ClassroomBoard = {
    mount: function (_container, opts) {
      _onStateChange = (opts && opts.onStateChange) ? opts.onStateChange : null;
      return {
        destroy:    function () {},
        openPoll:   function () {},
        closePoll:  function () {},
        reveal:     function () {},
        armGate:    function () {},
        greenLight: function () {},
        reset:      function () {}
      };
    }
  };

  // Stub rosterClient with a teacher session so boot() calls mountBoard().
  win.rosterClient = {
    current: function () {
      return {
        studentId: 'teacher-id',
        username:  'teacher',
        realName:  'Ms. Teacher',
        section:   'PeriodE',
        role:      'teacher',
        spriteHue: null
      };
    },
    token: function () { return token || 'test-teacher-token'; }
  };

  // Stub ROSTER_SERVICE_URL.
  win.ROSTER_SERVICE_URL = rosterServiceUrl || 'https://roster-test.example.com';

  // v3 P1+P2: stub WebSocket -- jsdom doesn't provide it, and the cockpit
  // now opens its own WS for monitor mode + classroom_live_start/stop
  // signaling. The stub does nothing -- no events fire; the open/send/close
  // calls are no-ops. This is enough to keep the cockpit script from
  // throwing on the bare `new WebSocket(...)` calls.
  win.WebSocket = function StubWebSocket(_url) {
    this.readyState = 0;  // CONNECTING -- never advances; send() / close() no-op
    this.addEventListener = function () {};
    this.removeEventListener = function () {};
    this.send = function () {};
    this.close = function () {};
  };

  // Stub RAILWAY_SERVER_URL (used by wsUrl helper).
  win.RAILWAY_SERVER_URL = 'https://curriculum-test.example.com';

  // Stub fetch: returns a roster response for /roster/section/... and
  // delegates to fetchImpl (or a default no-op) for all other URLs.
  win.fetch = function (url, opts) {
    // Respond to the roster name-map fetch so mountBoard can proceed.
    if (url && url.includes('/roster/section/')) {
      return Promise.resolve({
        ok:   true,
        json: function () { return Promise.resolve({ ok: true, students: [] }); }
      });
    }
    if (fetchImpl) { return fetchImpl(url, opts); }
    return Promise.resolve({ ok: true });
  };

  // Helper to fire onStateChange once mountBoard has run.
  function fireStateChange(summary) {
    if (_onStateChange) { _onStateChange(summary); }
  }

  return { dom, win, fireStateChange };
}

// Extract the inline script once.
const INLINE_SCRIPT = extractInlineScript(COCKPIT_SRC);

// Run the cockpit inline script in a fresh environment.
// Returns { win, fireStateChange } after boot() + async mount settle.
//
// v3 P1+P2: the cockpit no longer auto-mounts on boot -- it starts in
// the Idle "global presence" view. To capture the onStateChange callback
// these tests need, we explicitly enter Live mode after boot by clicking
// the "Go Live" button. The button reads the section picker (default
// option "PeriodX"), invokes enterLiveMode -> mountBoard, which calls
// the stubbed ClassroomBoard.mount that captures onStateChange.
async function runCockpit(envOpts) {
  const { win, fireStateChange } = makeTestEnv(envOpts);
  const ctx = createContext(win);
  try {
    runInContext(INLINE_SCRIPT, ctx);
  } catch (_) {
    // Boot may fail due to stubbing limits; acceptable for these tests.
  }
  // Yield once so the access-check + startMonitorMode async paths settle.
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  // v3: trigger Live mode so the board mounts + onStateChange is captured.
  // The cockpit no longer auto-mounts on boot -- it starts in Idle (global
  // presence) mode and only mounts the section board when Go Live is pressed.
  try {
    var goLiveBtn = win.document.getElementById('btn-go-live');
    if (goLiveBtn) { goLiveBtn.click(); }
  } catch (_) { /* tolerate missing button on legacy / partial loads */ }
  // The click chain is: btn-go-live -> enterLiveMode -> mountBoard ->
  // (await fetchNameMap) -> ClassroomBoard.mount. Several promise ticks
  // sit between the click and the onStateChange capture, so yield enough
  // microtasks for the chain to settle.
  for (var i = 0; i < 10; i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
  return { win, fireStateChange };
}

describe('U3 -- runtime: archivePoll fires from summary.closedPoll on close', () => {
  function openSummary(poll, tally) {
    return { poll: poll, closedPoll: null, tally: tally || null, members: [], gate: null, greenlight: false };
  }
  function closeSummary(closedPoll) {
    return { poll: null, closedPoll: closedPoll, tally: null, members: [], gate: null, greenlight: false };
  }

  it('POST /poll-archive fires once when summary.closedPoll appears', async () => {
    const fetchCalls = [];
    const { fireStateChange } = await runCockpit({
      fetchImpl: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); }
    });
    fireStateChange(openSummary({ id: 'poll-001', question: 'Favorite color?', options: ['Red', 'Blue'], blind: false }, [3, 2]));
    fireStateChange(closeSummary({ id: 'poll-001', question: 'Favorite color?', options: ['Red', 'Blue'], tally: [4, 2], blind: false }));
    const archiveCalls = fetchCalls.filter(c => c.url && c.url.includes('/poll-archive'));
    expect(archiveCalls.length).toBe(1);
  });

  it('archives the FINAL closedPoll tally, not the last live tally', async () => {
    const fetchCalls = [];
    const { fireStateChange } = await runCockpit({
      fetchImpl: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); }
    });
    // Open: live tally [3, 2]. Close: the FINAL tally is [4, 2] -- a late vote.
    fireStateChange(openSummary({ id: 'p-final', question: 'Q?', options: ['A', 'B'], blind: false }, [3, 2]));
    fireStateChange(closeSummary({ id: 'p-final', question: 'Q?', options: ['A', 'B'], tally: [4, 2], blind: false }));
    const archiveCalls = fetchCalls.filter(c => c.url && c.url.includes('/poll-archive'));
    expect(archiveCalls.length).toBe(1);
    const body = JSON.parse(archiveCalls[0].opts.body);
    expect(body.tally).toEqual([4, 2]);     // the close payload, NOT [3, 2]
    expect(body.pollId).toBe('p-final');
  });

  it('POST body carries all Section 1.4 fields from closedPoll', async () => {
    const fetchCalls = [];
    const { fireStateChange } = await runCockpit({
      token: 'teacher-jwt-abc',
      fetchImpl: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); }
    });
    fireStateChange(openSummary({ id: 'poll-xyz', question: 'Best pizza?', options: ['Pepperoni', 'Cheese', 'Veggie'], blind: true }, [5, 4, 1]));
    fireStateChange(closeSummary({ id: 'poll-xyz', question: 'Best pizza?', options: ['Pepperoni', 'Cheese', 'Veggie'], tally: [5, 4, 1], blind: true }));
    const archiveCalls = fetchCalls.filter(c => c.url && c.url.includes('/poll-archive'));
    expect(archiveCalls.length).toBe(1);
    const call = archiveCalls[0];
    expect(call.opts.method).toBe('POST');
    const body = JSON.parse(call.opts.body);
    expect(body.pollId).toBe('poll-xyz');
    expect(body.section).toBeTruthy();
    expect(body.pollDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.question).toBe('Best pizza?');
    expect(body.options).toEqual(['Pepperoni', 'Cheese', 'Veggie']);
    expect(body.tally).toEqual([5, 4, 1]);
    expect(body.blind).toBe(true);
    expect(call.opts.headers['Authorization']).toMatch(/^Bearer /);
  });

  it('does NOT archive while the poll is still open (no closedPoll yet)', async () => {
    const fetchCalls = [];
    const { fireStateChange } = await runCockpit({
      fetchImpl: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); }
    });
    fireStateChange(openSummary({ id: 'p-open', question: 'Q?', options: ['A', 'B'], blind: false }, [1, 0]));
    const archiveCalls = fetchCalls.filter(c => c.url && c.url.includes('/poll-archive'));
    expect(archiveCalls.length).toBe(0);
  });

  it('does NOT archive on a reset / no-closedPoll summary (no false trigger)', async () => {
    const fetchCalls = [];
    const { fireStateChange } = await runCockpit({
      fetchImpl: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); }
    });
    // poll=null AND closedPoll=null -- a reset or remount snapshot.
    fireStateChange({ poll: null, closedPoll: null, tally: null, members: [], gate: null, greenlight: false });
    const archiveCalls = fetchCalls.filter(c => c.url && c.url.includes('/poll-archive'));
    expect(archiveCalls.length).toBe(0);
  });

  it('archives at most once even though closedPoll persists across summaries', async () => {
    const fetchCalls = [];
    const { fireStateChange } = await runCockpit({
      fetchImpl: function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); }
    });
    var cp = { id: 'p-dedup', question: 'Q?', options: ['X', 'Y'], tally: [2, 3], blind: false };
    fireStateChange(openSummary({ id: 'p-dedup', question: 'Q?', options: ['X', 'Y'], blind: false }, [2, 3]));
    fireStateChange(closeSummary(cp));
    // closedPoll lingers in later summaries (member updates after the close).
    fireStateChange(closeSummary(cp));
    fireStateChange(closeSummary(cp));
    const archiveCalls = fetchCalls.filter(c => c.url && c.url.includes('/poll-archive'));
    expect(archiveCalls.length).toBe(1);
  });

  it('a fetch rejection does NOT throw (guarded fire-and-forget)', async () => {
    const { fireStateChange } = await runCockpit({
      fetchImpl: function () { return Promise.reject(new Error('network error')); }
    });
    expect(() => {
      fireStateChange(openSummary({ id: 'p-err', question: 'Q?', options: ['A', 'B'], blind: false }, [1, 1]));
      fireStateChange(closeSummary({ id: 'p-err', question: 'Q?', options: ['A', 'B'], tally: [1, 1], blind: false }));
    }).not.toThrow();
  });
});

// tests/v3-p4-doorways.test.js
//
// LIVE_CLASSROOM_V3_P4 Unit T: cockpit doorways form + archive-on-close.
// Covers the cockpit-side teacher-classroom.html bindings at C8 --
// btn-open-doorways form validation, btn-close-doorways send, the
// closedDoorways summary triggering archivePoll exactly once, and
// the form cap (min 2, max 8 options).
//
// The classroom-board.js reducer tests live in classroom-board.test.js
// under "classroom-board -- v3 P4 doorways reducer".
//
// Mirror the harness from tests/v3-p3-webrtc.test.js: extract the
// inline <script> from teacher-classroom.html, run it in a vm context
// with JSDOM, stub ClassroomBoard.mount so the test captures the
// boardHandle methods + onStateChange.
//
// ASCII-only.  LF line endings.

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPO_ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COCKPIT_SRC = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf8');

// ----- inline script extraction (longest <script> sans src) ------------

function extractInlineScript(src) {
  var results = [];
  var re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(src)) !== null) { results.push(m[1]); }
  if (!results.length) return '';
  return results.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
}

var INLINE_SCRIPT = extractInlineScript(COCKPIT_SRC);

// ----- WebSocket stub (idle -- never fires events) ---------------------
//
// The cockpit opens its own monitor WS during boot. We just need the
// constructor to not throw + the open/send/close methods to be no-ops.

function makeMockWSClass() {
  function MockWS(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this._listeners = { open: [], message: [], close: [], error: [] };
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  MockWS.prototype.send             = function () {};
  MockWS.prototype.close            = function () { this.readyState = 3; };
  MockWS.prototype.addEventListener = function () {};
  MockWS.prototype.removeEventListener = function () {};

  MockWS.CONNECTING = 0;
  MockWS.OPEN       = 1;
  MockWS.CLOSING    = 2;
  MockWS.CLOSED     = 3;
  return MockWS;
}

// ----- JSDOM environment with the V3 P1+P2 + P4 scaffolding -----------

function makeCockpitEnv(opts) {
  opts = opts || {};
  var dom = new JSDOM(
    '<!DOCTYPE html>'
    + '<html><body>'
    + '<div id="board-region" style="display:none"></div>'
    + '<div id="access-denied-panel" style="display:none"></div>'
    + '<div id="global-presence-section">'
    +   '<div id="global-presence-list"><div id="global-presence-empty"></div></div>'
    +   '<button id="btn-go-live"></button>'
    +   '<div id="go-live-hint"></div>'
    + '</div>'
    + '<div id="section-region" style="display:none">'
    +   '<h2 id="section-region-title">Live -- Period <span id="live-section-label">?</span></h2>'
    +   '<button id="btn-exit-live"></button>'
    + '</div>'
    + '<select id="section-select"><option value="PeriodE">PeriodE</option></select>'
    + '<div id="status-row"></div>'
    + '<div id="board-mount"></div>'
    + '<div id="control-section" style="display:none"></div>'
    + '<div id="checkin-section" style="display:none"></div>'
    + '<div id="checkin-panel-section" style="display:none"></div>'
    + '<div id="poll-history-section" style="display:none"></div>'
    + '<div id="poll-section" style="display:none"></div>'
    + '<div id="checkin-count"></div>'
    + '<ul id="checkin-list"></ul>'
    + '<div id="checkin-empty"></div>'
    + '<span id="greenlight-dot"></span>'
    + '<span id="greenlight-label"></span>'
    + '<div id="poll-tally-label"></div>'
    + '<canvas id="poll-result-canvas" width="480" height="160"></canvas>'
    + '<div id="poll-options-list">'
    +   '<div class="poll-option-row"><input class="poll-option-input" type="text" value="Yes"><button class="poll-remove-btn">x</button></div>'
    +   '<div class="poll-option-row"><input class="poll-option-input" type="text" value="No"><button class="poll-remove-btn">x</button></div>'
    + '</div>'
    + '<button id="poll-add-option"></button>'
    + '<input id="poll-question-input" type="text">'
    + '<input id="poll-blind-checkbox" type="checkbox">'
    + '<button id="btn-open-poll"></button>'
    + '<button id="btn-close-poll"></button>'
    + '<button id="btn-reveal-poll"></button>'
    + '<button id="btn-arm-gate"></button>'
    + '<button id="btn-green-light"></button>'
    + '<input id="sync-video-start" type="checkbox">'
    + '<button id="btn-reset"></button>'
    // v3 P4 doorways scaffolding -- mirrors teacher-classroom.html C8.
    + '<div id="doorways-section" style="display:none">'
    +   '<input id="doorways-question-input" type="text">'
    +   '<div id="doorways-options-list">'
    +     '<div class="poll-option-row"><input class="poll-option-input" type="text" value="A"><button class="poll-remove-btn">x</button></div>'
    +     '<div class="poll-option-row"><input class="poll-option-input" type="text" value="B"><button class="poll-remove-btn">x</button></div>'
    +   '</div>'
    +   '<button id="doorways-add-option"></button>'
    +   '<button id="btn-open-doorways"></button>'
    +   '<button id="btn-close-doorways" style="display:none"></button>'
    +   '<canvas id="doorways-tally-canvas" width="480" height="160" style="display:none"></canvas>'
    + '</div>'
    + '</body></html>',
    { url: 'https://example.com' }
  );

  var win = dom.window;

  // Canvas stub (jsdom has no getContext).
  var stubCtx = {
    clearRect: function () {}, fillRect: function () {}, strokeRect: function () {},
    fillText: function () {}, measureText: function () { return { width: 0 }; },
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    stroke: function () {}, fill: function () {}
  };
  win.HTMLCanvasElement.prototype.getContext = function () { return stubCtx; };

  // ClassroomBoard.mount stub -- captures the opts so the test can drive
  // onStateChange, and records every call to openDoorways/closeDoorways.
  var capture = {
    boardOpts:           null,
    openDoorwaysCalls:   [],
    closeDoorwaysCalls:  []
  };
  win.ClassroomBoard = {
    mount: function (_container, mountOpts) {
      capture.boardOpts = mountOpts || null;
      return {
        destroy:       function () {},
        openPoll:      function () {},
        closePoll:     function () {},
        reveal:        function () {},
        armGate:       function () {},
        greenLight:    function () {},
        reset:         function () {},
        openDoorways:  function (id, question, options) {
          capture.openDoorwaysCalls.push({ id: id, question: question, options: options });
        },
        closeDoorways: function (id) {
          capture.closeDoorwaysCalls.push({ id: id });
        },
        sendSignaling: function () {}
      };
    }
  };

  // rosterClient stub (teacher session, so the boot path calls mountBoard).
  win.rosterClient = {
    current: function () {
      return {
        studentId: 'teacher-id',
        username:  'teacher1',
        realName:  'Ms. Teacher',
        section:   'PeriodE',
        role:      'teacher',
        spriteHue: null
      };
    },
    token: function () { return opts.token || 'test-teacher-token'; }
  };
  win.ROSTER_SERVICE_URL = opts.rosterServiceUrl || 'https://roster-test.example.com';
  win.RAILWAY_SERVER_URL = 'https://curriculum-test.example.com';

  // WebSocket stub -- idle, no events.
  var MockWS = makeMockWSClass();
  win.WebSocket = MockWS;

  // alert capture -- the form validation calls alert() on rejection.
  var alerts = [];
  win.alert = function (msg) { alerts.push(msg); };

  // fetch capture for archive POSTs.
  var fetchCalls = [];
  win.fetch = function (url, options) {
    fetchCalls.push({ url: url, options: options });
    if (url && url.indexOf('/roster/section/') !== -1) {
      return Promise.resolve({
        ok:   true,
        json: function () { return Promise.resolve({ ok: true, students: [] }); }
      });
    }
    return Promise.resolve({ ok: true });
  };

  // setTimeout / setInterval stubs (no-op so async ticks don't run forever).
  win.setTimeout    = function (fn) { return 0; };
  win.clearTimeout  = function () {};
  win.setInterval   = function () { return 0; };
  win.clearInterval = function () {};

  // Ti84Plot stub -- drawBarChart must not throw.
  win.Ti84Plot = { drawBarChart: function () {} };

  return {
    dom:        dom,
    win:        win,
    capture:    capture,
    alerts:     alerts,
    fetchCalls: fetchCalls
  };
}

// Yield event-loop ticks so vm-context promise chains settle.
async function yieldTicks(n) {
  for (var i = 0; i < (n || 12); i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

// Boot the cockpit + click Go Live so boardHandle gets wired. After this
// returns, capture.boardOpts.onStateChange is available + the boardHandle
// captures land in capture.openDoorwaysCalls / closeDoorwaysCalls.
async function bootCockpitAndGoLive(env) {
  var ctx = createContext(env.win);
  try { runInContext(INLINE_SCRIPT, ctx); } catch (_) { /* tolerate */ }

  await yieldTicks(2);

  // Click Go Live so mountBoard runs and capture.boardOpts gets the
  // onStateChange callback the close+archive flow relies on.
  try {
    var btn = env.win.document.getElementById('btn-go-live');
    if (btn) { btn.click(); }
  } catch (_) {}

  await yieldTicks(12);

  return env;
}

// =====================================================================
// Tests
// =====================================================================

describe('v3 P4 cockpit doorways flow', () => {
  // ----- btn-open-doorways form validation + happy path ----------------

  it('btn-open-doorways form-validates and calls boardHandle.openDoorways', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);

    // Seed the question + the two default options (already present).
    env.win.document.getElementById('doorways-question-input').value = 'Best snack?';
    var inputs = env.win.document.querySelectorAll('#doorways-options-list .poll-option-input');
    inputs[0].value = 'Apple';
    inputs[1].value = 'Banana';

    // Click Open.
    var btn = env.win.document.getElementById('btn-open-doorways');
    btn.click();

    // The cockpit must have called boardHandle.openDoorways exactly once
    // with question + 2 options.
    expect(env.capture.openDoorwaysCalls.length).toBe(1);
    var call = env.capture.openDoorwaysCalls[0];
    expect(call.question).toBe('Best snack?');
    expect(call.options.length).toBe(2);
    expect(call.options[0]).toEqual({ label: 'Apple',  doorId: 'd0' });
    expect(call.options[1]).toEqual({ label: 'Banana', doorId: 'd1' });

    // The id is a string starting with 'doorways-'.
    expect(typeof call.id).toBe('string');
    expect(call.id.startsWith('doorways-')).toBe(true);

    // No alert fired.
    expect(env.alerts.length).toBe(0);

    // Close button is now visible.
    expect(env.win.document.getElementById('btn-close-doorways').style.display).toBe('');
  });

  // ----- Close button calls closeDoorways with the right id ------------

  it('Close button calls boardHandle.closeDoorways with the right id', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);

    // Seed + open.
    var inputs = env.win.document.querySelectorAll('#doorways-options-list .poll-option-input');
    inputs[0].value = 'A';
    inputs[1].value = 'B';
    env.win.document.getElementById('btn-open-doorways').click();
    expect(env.capture.openDoorwaysCalls.length).toBe(1);
    var openId = env.capture.openDoorwaysCalls[0].id;

    // Now click Close.
    env.win.document.getElementById('btn-close-doorways').click();

    expect(env.capture.closeDoorwaysCalls.length).toBe(1);
    expect(env.capture.closeDoorwaysCalls[0].id).toBe(openId);
  });

  // ----- closedDoorways summary triggers archivePoll exactly once -----

  it('closedDoorways summary triggers archivePoll exactly once', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);

    // The board's onStateChange callback drives the archive path on the
    // cockpit. Grab it from the captured mount opts.
    var onStateChange = env.capture.boardOpts && env.capture.boardOpts.onStateChange;
    expect(typeof onStateChange).toBe('function');

    var closedDoorways = {
      id:       'doorways-123',
      question: 'Pick a door',
      options:  [{ label: 'A', doorId: 'd0' }, { label: 'B', doorId: 'd1' }],
      tally:    [{ doorId: 'd0', count: 4 }, { doorId: 'd1', count: 1 }]
    };

    // First summary -- closedDoorways present, archivePoll should fire.
    onStateChange({
      poll: null, closedPoll: null, tally: null, members: [], gate: null,
      greenlight: false, live: true,
      doorways: null, closedDoorways: closedDoorways
    });

    var archiveCalls = env.fetchCalls.filter(function (c) {
      return c.url && c.url.indexOf('/poll-archive') !== -1;
    });
    expect(archiveCalls.length).toBe(1);
    var body = JSON.parse(archiveCalls[0].options.body);
    expect(body.pollId).toBe('doorways-123');
    // Tally is flattened from [{doorId, count}, ...] to [count, count, ...].
    expect(body.tally).toEqual([4, 1]);
    // Options are flattened from [{label, doorId}, ...] to [label, label, ...].
    expect(body.options).toEqual(['A', 'B']);

    // A second summary with the SAME closedDoorways must NOT re-archive
    // (dedup via _lastArchivedDoorwaysId).
    onStateChange({
      poll: null, closedPoll: null, tally: null, members: [], gate: null,
      greenlight: false, live: true,
      doorways: null, closedDoorways: closedDoorways
    });
    var archiveCallsAfter = env.fetchCalls.filter(function (c) {
      return c.url && c.url.indexOf('/poll-archive') !== -1;
    });
    expect(archiveCallsAfter.length).toBe(1);
  });

  // ----- Form requires at least 2 options ------------------------------

  it('Form requires at least 2 options (rejects with alert if <2)', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);

    // Wipe both default option inputs so getDoorwaysFormValues returns 0.
    var inputs = env.win.document.querySelectorAll('#doorways-options-list .poll-option-input');
    inputs[0].value = '';
    inputs[1].value = '';

    env.win.document.getElementById('btn-open-doorways').click();

    expect(env.capture.openDoorwaysCalls.length).toBe(0);
    expect(env.alerts.length).toBe(1);
    expect(env.alerts[0]).toMatch(/at least 2/i);

    // Try again with exactly 1 option -- still rejected.
    env.alerts.length = 0;
    inputs[0].value = 'OnlyOne';
    inputs[1].value = '';
    env.win.document.getElementById('btn-open-doorways').click();
    expect(env.capture.openDoorwaysCalls.length).toBe(0);
    expect(env.alerts.length).toBe(1);
  });

  // ----- Form caps at 8 options ----------------------------------------

  it('Form caps at 8 options (Add disabled when reaching cap)', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);

    var addBtn = env.win.document.getElementById('doorways-add-option');
    expect(addBtn).not.toBeNull();

    // Start with 2 rows; click Add 6 times to reach the cap of 8.
    for (var i = 0; i < 6; i++) {
      addBtn.click();
    }
    var rowsAt8 = env.win.document.querySelectorAll('#doorways-options-list .poll-option-row');
    expect(rowsAt8.length).toBe(8);

    // The cap was reached -- the Add button is hidden.
    expect(addBtn.style.display).toBe('none');

    // One more click does nothing (Add is hidden + the cap holds).
    addBtn.click();
    var rowsStill = env.win.document.querySelectorAll('#doorways-options-list .poll-option-row');
    expect(rowsStill.length).toBe(8);
  });
});

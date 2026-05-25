// tests/cockpit-activity.test.js
//
// LIVE_CLASSROOM V4 Unit C -- cockpit Run-Activity panel.
//
// Verifies that teacher-classroom.html
//   * exposes #activity-section between #doorways-section and #nudge-section,
//   * toggles its visibility via setBoardSectionsVisible,
//   * disables the Start button when online students < 2 OR when any other
//     mode (gate / poll / doorways / activity) is live (mutex parity),
//   * sends classroom_activity_start via boardHandle.sendMessage on click,
//   * populates the live readout from summary.activity.state,
//   * surfaces the result panel + outcome text after activity.finished.
//
// Two layers:
//   1. Structural assertions over the source file.
//   2. Runtime check -- load the cockpit script in jsdom + vm, drive
//      onStateChange with fixture summaries, and assert DOM + WS effects.
//
// ASCII-only. LF line endings. No emojis.

import { describe, it, expect } from 'vitest';
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

describe('Unit C source structure: #activity-section markup', () => {
  it('declares the #activity-section block', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']activity-section["']/);
  });

  it('the activity section starts hidden via inline display:none', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']activity-section["'][^>]*style=["'][^"']*display\s*:\s*none/);
  });

  it('includes the #activity-type dropdown with bridge-mean option', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']activity-type["']/);
    expect(COCKPIT_SRC).toMatch(/value=["']bridge-mean["']/);
    expect(COCKPIT_SRC).toMatch(/Lift the Bridge/);
  });

  it('includes the #activity-duration input (default 90)', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']activity-duration["'][^>]*value=["']90["']/);
  });

  it('declares the Start + Cancel buttons (cancel hidden by default)', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']btn-activity-start["']/);
    expect(COCKPIT_SRC).toMatch(/id=["']btn-activity-cancel["'][^>]*style=["'][^"']*display\s*:\s*none/);
  });

  it('declares #activity-live (hidden) + #activity-readout + #activity-roster', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']activity-live["'][^>]*style=["'][^"']*display\s*:\s*none/);
    expect(COCKPIT_SRC).toMatch(/id=["']activity-readout["']/);
    expect(COCKPIT_SRC).toMatch(/id=["']activity-roster["']/);
  });

  it('declares #activity-result (hidden) + #activity-result-text + 3 buttons', () => {
    expect(COCKPIT_SRC).toMatch(/id=["']activity-result["'][^>]*style=["'][^"']*display\s*:\s*none/);
    expect(COCKPIT_SRC).toMatch(/id=["']activity-result-text["']/);
    expect(COCKPIT_SRC).toMatch(/id=["']btn-activity-advance["']/);
    expect(COCKPIT_SRC).toMatch(/id=["']btn-activity-hint["']/);
    expect(COCKPIT_SRC).toMatch(/id=["']btn-activity-retry["']/);
  });

  it('places #activity-section between #doorways-section and #nudge-section', () => {
    var idxDoorways = COCKPIT_SRC.indexOf('id="doorways-section"');
    var idxActivity = COCKPIT_SRC.indexOf('id="activity-section"');
    var idxNudge    = COCKPIT_SRC.indexOf('id="nudge-section"');
    expect(idxDoorways).toBeGreaterThan(-1);
    expect(idxActivity).toBeGreaterThan(-1);
    expect(idxNudge).toBeGreaterThan(-1);
    expect(idxActivity).toBeGreaterThan(idxDoorways);
    expect(idxNudge).toBeGreaterThan(idxActivity);
  });
});

describe('Unit C source structure: setBoardSectionsVisible extends to activity', () => {
  it('setBoardSectionsVisible toggles #activity-section', () => {
    var idx = COCKPIT_SRC.indexOf('function setBoardSectionsVisible');
    expect(idx).toBeGreaterThan(-1);
    var slice = COCKPIT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/getElementById\(\s*['"]activity-section['"]\s*\)/);
  });
});

describe('Unit C source structure: renderActivity / startActivity / cancelActivity', () => {
  it('defines renderActivity(summary)', () => {
    expect(COCKPIT_SRC).toMatch(/function\s+renderActivity\s*\(\s*summary\s*\)/);
  });

  it('renderActivity is wired into the onStateChange callback', () => {
    // The onStateChange callback inside the boardHandle = ... mount call
    // calls renderActivity(summary).
    expect(COCKPIT_SRC).toMatch(/renderActivity\s*\(\s*summary\s*\)/);
  });

  it('defines startActivity() and cancelActivity() helpers', () => {
    expect(COCKPIT_SRC).toMatch(/function\s+startActivity\s*\(\s*\)/);
    expect(COCKPIT_SRC).toMatch(/function\s+cancelActivity\s*\(\s*\)/);
  });

  it('startActivity sends classroom_activity_start via boardHandle.sendMessage', () => {
    var idx = COCKPIT_SRC.indexOf('function startActivity');
    expect(idx).toBeGreaterThan(-1);
    var slice = COCKPIT_SRC.slice(idx, idx + 800);
    expect(slice).toMatch(/boardHandle\.sendMessage\s*\(/);
    expect(slice).toMatch(/classroom_activity_start/);
  });

  it('cancelActivity sends classroom_activity_cancel via boardHandle.sendMessage', () => {
    var idx = COCKPIT_SRC.indexOf('function cancelActivity');
    expect(idx).toBeGreaterThan(-1);
    var slice = COCKPIT_SRC.slice(idx, idx + 400);
    expect(slice).toMatch(/boardHandle\.sendMessage\s*\(/);
    expect(slice).toMatch(/classroom_activity_cancel/);
  });
});

// ============================================================
// Layer 2 -- runtime via jsdom + vm
// ============================================================

// Extract the longest inline script block (the main cockpit logic).
function extractInlineScript(src) {
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  if (!out.length) return '';
  return out.reduce((a, b) => (b.length > a.length ? b : a), '');
}

// Build a JSDOM env that includes ALL elements the cockpit script touches
// on boot (poll panel, doorways panel, nudge panel, etc.) PLUS the new
// activity panel. We render the activity section using the exact HTML the
// production source ships so the test never disagrees with the runtime.
function makeTestEnv({ fetchImpl, token, rosterServiceUrl, sendMessageImpl } = {}) {
  var dom = new JSDOM(
    `<!DOCTYPE html>
<html><body>
  <div id="board-region" style="display:none"></div>
  <div id="access-denied-panel" style="display:none"></div>
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
  <div id="doorways-section" style="display:none">
    <input id="doorways-question-input" type="text">
    <div id="doorways-options-list">
      <div class="poll-option-row"><input class="poll-option-input" type="text" value="A"><button class="poll-remove-btn">x</button></div>
      <div class="poll-option-row"><input class="poll-option-input" type="text" value="B"><button class="poll-remove-btn">x</button></div>
    </div>
    <button id="doorways-add-option"></button>
    <button id="btn-open-doorways"></button>
    <button id="btn-close-doorways" style="display:none"></button>
    <canvas id="doorways-tally-canvas" width="480" height="160" style="display:none"></canvas>
  </div>

  <!-- V4 Unit C: activity panel mirrors the production HTML. -->
  <div id="activity-section" style="display:none">
    <h3>Run Activity</h3>
    <div>
      <label>Activity:
        <select id="activity-type">
          <option value="bridge-mean">U1.1 Lift the Bridge (mean)</option>
        </select>
      </label>
      <label>Duration (s): <input id="activity-duration" type="number" min="30" max="300" value="90"></label>
    </div>
    <div>
      <button type="button" id="btn-activity-start">Run Activity</button>
      <button type="button" id="btn-activity-cancel" style="display:none">Cancel Activity</button>
    </div>
    <div id="activity-status"></div>
    <div id="activity-live" style="display:none">
      <pre id="activity-readout"></pre>
      <ul id="activity-roster"></ul>
    </div>
    <div id="activity-result" style="display:none">
      <p id="activity-result-text"></p>
      <button type="button" id="btn-activity-advance">Manual Advance</button>
      <button type="button" id="btn-activity-hint">Show Hint</button>
      <button type="button" id="btn-activity-retry">Retry</button>
    </div>
  </div>
</body></html>`,
    { url: 'https://example.com' }
  );

  var win = dom.window;

  // Stub canvas getContext so render helpers don't throw.
  var stubCtx = {
    clearRect: function () {}, fillRect: function () {}, strokeRect: function () {},
    fillText: function () {}, measureText: function () { return { width: 0 }; },
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    stroke: function () {}, fill: function () {}
  };
  win.HTMLCanvasElement.prototype.getContext = function () { return stubCtx; };

  // Captured onStateChange callback + sent WS messages.
  var _onStateChange = null;
  var sentMessages = [];

  win.ClassroomBoard = {
    mount: function (_container, opts) {
      _onStateChange = (opts && opts.onStateChange) ? opts.onStateChange : null;
      return {
        destroy:    function () {},
        openPoll:   function () {}, closePoll: function () {},
        reveal:     function () {}, armGate: function () {},
        greenLight: function () {}, reset: function () {},
        openDoorways: function () {}, closeDoorways: function () {},
        // sendMessage records what the cockpit sends; default returns true.
        sendMessage: function (payload) {
          sentMessages.push(payload);
          if (typeof sendMessageImpl === 'function') return sendMessageImpl(payload);
          return true;
        }
      };
    }
  };

  win.rosterClient = {
    current: function () {
      return {
        studentId: 'teacher-id', username: 'teacher', realName: 'Ms. Teacher',
        section: 'PeriodE', role: 'teacher', spriteHue: null
      };
    },
    token: function () { return token || 'test-teacher-token'; }
  };

  win.ROSTER_SERVICE_URL = rosterServiceUrl || 'https://roster-test.example.com';
  win.RAILWAY_SERVER_URL = 'https://curriculum-test.example.com';

  win.WebSocket = function StubWebSocket() {
    this.readyState = 0;
    this.addEventListener = function () {};
    this.removeEventListener = function () {};
    this.send = function () {}; this.close = function () {};
  };

  win.fetch = function (url, opts) {
    if (url && url.includes('/roster/section/')) {
      return Promise.resolve({
        ok: true, json: function () { return Promise.resolve({ ok: true, students: [] }); }
      });
    }
    if (fetchImpl) return fetchImpl(url, opts);
    return Promise.resolve({ ok: true });
  };

  function fireStateChange(summary) {
    if (_onStateChange) _onStateChange(summary);
  }

  return { dom, win, fireStateChange, sentMessages };
}

const INLINE_SCRIPT = extractInlineScript(COCKPIT_SRC);

async function runCockpit(envOpts) {
  const env = makeTestEnv(envOpts);
  const ctx = createContext(env.win);
  try { runInContext(INLINE_SCRIPT, ctx); } catch (_) { /* tolerated */ }
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  try {
    var goLiveBtn = env.win.document.getElementById('btn-go-live');
    if (goLiveBtn) goLiveBtn.click();
  } catch (_) { /* tolerated */ }
  for (var i = 0; i < 10; i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
  return env;
}

// Builders ----------------------------------------------------

function makeMembers(onlineCount, opts) {
  opts = opts || {};
  var arr = [];
  for (var i = 0; i < onlineCount; i++) {
    arr.push({ username: 's' + (i + 1), role: 'student', online: true, status: 'present' });
  }
  // Optionally append an offline student (should NOT count toward the gate).
  if (opts.offline) {
    arr.push({ username: 'soffline', role: 'student', online: false, status: 'present' });
  }
  // Always include the teacher so member shapes mirror production.
  arr.push({ username: 'teacher', role: 'teacher', online: true, status: 'present' });
  return arr;
}

function emptySummary(extra) {
  return Object.assign({
    members: [], gate: null, poll: null, tally: null, doorways: null,
    closedPoll: null, closedDoorways: null, greenlight: false, activity: null,
    section: 'PeriodE'
  }, extra || {});
}

function liveActivity(extra) {
  return Object.assign({
    type: 'bridge-mean',
    startedAt: Date.now() - 1000,
    durationMs: 90000,
    state: {
      values:      { s1: 3, s2: 7 },
      target:      5,
      tolerance:   0.3,
      currentMean: 5.0,
      holdMs:      1200,
      holdTargetMs: 3000
    },
    finished: false
  }, extra || {});
}

// Tests -------------------------------------------------------

describe('Unit C runtime: activity-section visibility', () => {
  it('activity-section is hidden before the board mounts', () => {
    // Build env but don't fire the Go Live -> mount sequence; just inspect
    // the rendered HTML.
    var env = makeTestEnv({});
    var act = env.win.document.getElementById('activity-section');
    expect(act).toBeTruthy();
    expect(act.style.display).toBe('none');
  });

  it('activity-section is visible after the board mounts (setBoardSectionsVisible(true))', async () => {
    var env = await runCockpit({});
    var act = env.win.document.getElementById('activity-section');
    expect(act).toBeTruthy();
    expect(act.style.display).not.toBe('none');
  });
});

describe('Unit C runtime: Start button mutex + min-members gating', () => {
  it('Start button is disabled when online student count < 2', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({ members: makeMembers(1) }));
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it('Start button is enabled when 2+ online students AND no other mode is live', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({ members: makeMembers(2) }));
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn.disabled).toBe(false);
  });

  it('Start button is disabled when an activity is already live (mutex)', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(3),
      activity: liveActivity()
    }));
    var btn = env.win.document.getElementById('btn-activity-start');
    // The button is HIDDEN while live (its place is taken by Cancel); we
    // still assert it's disabled-or-hidden so a stray click is harmless.
    expect(btn.style.display === 'none' || btn.disabled === true).toBe(true);
  });

  it('Start button is disabled when a poll is open (mutex parity)', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(3),
      poll: { id: 'p1', question: 'Q?', options: ['A', 'B'] }
    }));
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn.disabled).toBe(true);
  });

  it('Start button is disabled when doorways are open (mutex parity)', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(3),
      doorways: { id: 'd1', question: 'Q?', options: [{ label: 'A', doorId: 'd0' }, { label: 'B', doorId: 'd1' }] }
    }));
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn.disabled).toBe(true);
  });

  it('Start button is disabled when the gate is armed (mutex parity)', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(3),
      gate: { armed: true, theme: 'normal' }
    }));
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn.disabled).toBe(true);
  });

  it('Offline students do NOT count toward the 2-min-members gate', async () => {
    var env = await runCockpit({});
    // 1 online + 1 offline = should still be disabled (online < 2).
    env.fireStateChange(emptySummary({ members: makeMembers(1, { offline: true }) }));
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn.disabled).toBe(true);
  });
});

describe('Unit C runtime: Start button click sends classroom_activity_start', () => {
  it('clicking #btn-activity-start sends classroom_activity_start via boardHandle.sendMessage', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({ members: makeMembers(3) }));
    // Click the button.
    var btn = env.win.document.getElementById('btn-activity-start');
    expect(btn.disabled).toBe(false);
    btn.click();
    // The cockpit's stub records sendMessage payloads.
    var startMsgs = env.sentMessages.filter(function (m) {
      return m && m.type === 'classroom_activity_start';
    });
    expect(startMsgs.length).toBe(1);
    expect(startMsgs[0].activityType).toBe('bridge-mean');
    expect(startMsgs[0].opts && startMsgs[0].opts.durationMs).toBe(90000);  // 90 s default
  });

  it('Duration is clamped to [30000, 300000] ms', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({ members: makeMembers(3) }));
    // Drop the duration input below the floor.
    var dur = env.win.document.getElementById('activity-duration');
    dur.value = '10';
    env.win.document.getElementById('btn-activity-start').click();
    // Push it above the ceiling.
    dur.value = '5000';
    env.win.document.getElementById('btn-activity-start').click();
    var msgs = env.sentMessages.filter(function (m) { return m && m.type === 'classroom_activity_start'; });
    expect(msgs.length).toBe(2);
    expect(msgs[0].opts.durationMs).toBe(30000);   // clamped to min
    expect(msgs[1].opts.durationMs).toBe(300000);  // clamped to max
  });
});

describe('Unit C runtime: renderActivity populates the live readout', () => {
  it('shows #activity-live + populates #activity-readout from summary.activity.state', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: liveActivity()
    }));
    var live = env.win.document.getElementById('activity-live');
    expect(live.style.display).not.toBe('none');
    var readout = env.win.document.getElementById('activity-readout');
    expect(readout.textContent).toMatch(/mean:/);
    expect(readout.textContent).toMatch(/target:\s*5/);
    expect(readout.textContent).toMatch(/hold:/);
    expect(readout.textContent).toMatch(/remaining:/);
  });

  it('populates #activity-roster with one li per username: value', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: liveActivity()
    }));
    var items = env.win.document.querySelectorAll('#activity-roster li');
    expect(items.length).toBe(2);
    // Sorted alphabetically by username.
    expect(items[0].textContent).toMatch(/^s1:\s*3/);
    expect(items[1].textContent).toMatch(/^s2:\s*7/);
  });

  it('shows #btn-activity-cancel + hides #btn-activity-start while activity is live', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: liveActivity()
    }));
    var start  = env.win.document.getElementById('btn-activity-start');
    var cancel = env.win.document.getElementById('btn-activity-cancel');
    expect(cancel.style.display).not.toBe('none');
    expect(start.style.display).toBe('none');
  });
});

describe('Unit C runtime: result panel after activity.finished', () => {
  it('shows #activity-result with success text when outcome=success', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: Object.assign(liveActivity(), { finished: true, outcome: 'success' })
    }));
    var result = env.win.document.getElementById('activity-result');
    expect(result.style.display).not.toBe('none');
    var txt = env.win.document.getElementById('activity-result-text');
    expect(txt.textContent.toLowerCase()).toMatch(/success/);
    // The live readout should be hidden again on result.
    var live = env.win.document.getElementById('activity-live');
    expect(live.style.display).toBe('none');
  });

  it('shows timeout outcome text when outcome=timeout', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: Object.assign(liveActivity(), { finished: true, outcome: 'timeout' })
    }));
    var txt = env.win.document.getElementById('activity-result-text');
    expect(txt.textContent.toLowerCase()).toMatch(/time up|timeout|not held/);
  });

  it('shows cancel outcome text when outcome=cancel', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: Object.assign(liveActivity(), { finished: true, outcome: 'cancel' })
    }));
    var txt = env.win.document.getElementById('activity-result-text');
    expect(txt.textContent.toLowerCase()).toMatch(/cancel/);
  });
});

describe('Unit C runtime: cancelActivity sends classroom_activity_cancel', () => {
  it('clicking #btn-activity-cancel sends classroom_activity_cancel via boardHandle.sendMessage', async () => {
    var env = await runCockpit({});
    env.fireStateChange(emptySummary({
      members: makeMembers(2),
      activity: liveActivity()
    }));
    var cancel = env.win.document.getElementById('btn-activity-cancel');
    cancel.click();
    var cancelMsgs = env.sentMessages.filter(function (m) {
      return m && m.type === 'classroom_activity_cancel';
    });
    expect(cancelMsgs.length).toBe(1);
  });
});

// 2026-05-24 Codex MAJOR 3 fold regression pins: the result-panel
// buttons (Manual Advance / Show Hint / Retry) must be wired, not
// dead UI. Structural pins are sufficient for this fold; the runtime
// behavior depends on the exact panel state which the cockpit test
// harness models in isolation.
describe('Codex MAJOR 3 fold: result-panel buttons wired (not dead UI)', () => {
  it('source defines manualAdvanceActivity, showActivityHint, retryActivity helpers', () => {
    var src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../teacher-classroom.html'),
      'utf8'
    );
    expect(src).toMatch(/function\s+manualAdvanceActivity\s*\(/);
    expect(src).toMatch(/function\s+showActivityHint\s*\(/);
    expect(src).toMatch(/function\s+retryActivity\s*\(/);
  });

  it('all three buttons are addEventListener wired in _wireActivityButtons', () => {
    var src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../teacher-classroom.html'),
      'utf8'
    );
    var startIdx = src.indexOf('function _wireActivityButtons');
    var endIdx = src.indexOf('\n    })()', startIdx);
    var body = src.slice(startIdx, endIdx);
    expect(body).toMatch(/btn-activity-advance/);
    expect(body).toMatch(/btn-activity-hint/);
    expect(body).toMatch(/btn-activity-retry/);
    expect(body).toMatch(/addEventListener\(['"]click['"],\s*manualAdvanceActivity\)/);
    expect(body).toMatch(/addEventListener\(['"]click['"],\s*showActivityHint\)/);
    expect(body).toMatch(/addEventListener\(['"]click['"],\s*retryActivity\)/);
  });

  it('manualAdvanceActivity calls cancelActivity (the existing cancel helper)', () => {
    var src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../teacher-classroom.html'),
      'utf8'
    );
    var startIdx = src.indexOf('function manualAdvanceActivity');
    var endIdx = src.indexOf('\n    }\n', startIdx);
    var body = src.slice(startIdx, endIdx);
    expect(body).toMatch(/cancelActivity\(\)/);
  });

  it('retryActivity calls startActivity (the existing start helper)', () => {
    var src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../teacher-classroom.html'),
      'utf8'
    );
    var startIdx = src.indexOf('function retryActivity');
    var endIdx = src.indexOf('\n    }\n', startIdx);
    var body = src.slice(startIdx, endIdx);
    expect(body).toMatch(/startActivity\(\)/);
  });
});

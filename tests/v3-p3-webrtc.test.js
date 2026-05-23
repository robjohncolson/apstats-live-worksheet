// tests/v3-p3-webrtc.test.js
//
// LIVE_CLASSROOM_V3_P3 Unit T: cockpit hub manager (teacher-classroom.html).
// Covers the WebRTC star transport spec at C4 -- studentPeers, _initPeerFor,
// _wireDataChannel, _handleRtcSignaling, _teardownAllPeers, and the 3-second
// fallback timeout.
//
// The student-side (classroom-board.js) tests live in classroom-board.test.js
// under "classroom-board -- v3 P3 student WebRTC receiver".
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

// =====================================================================
// Mocks: RTCPeerConnection + RTCDataChannel
// =====================================================================
//
// The spec's C6 example MockPC/mockDataChannel pattern, expanded to give
// the tests a registry of created PCs/DCs so they can drive the open/close
// lifecycle and inspect the sends.

function makeMockRTC() {
  var allPcs = [];   // every PC the cockpit instantiates this run
  var allDcs = [];   // every DC the cockpit creates

  function MockDataChannel(label) {
    this.label = label;
    this.readyState = 'connecting';
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.sent = [];   // every JSON.stringify(payload) the cockpit pushed
    var self = this;
    this.send = function (payload) { self.sent.push(payload); };
    this.close = function () {
      self.readyState = 'closed';
      self._closed = true;
      if (self.onclose) { self.onclose(); }
    };
    // Test-driver helpers (not part of the real RTCDataChannel API).
    this._open = function () {
      self.readyState = 'open';
      if (self.onopen) { self.onopen(); }
    };
    this._receive = function (obj) {
      if (self.onmessage) { self.onmessage({ data: JSON.stringify(obj) }); }
    };
  }

  function MockPC(config) {
    this.iceServers = config && config.iceServers;
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.localDescription = null;
    this.remoteDescription = null;
    this._iceCandidates = [];
    this._channels = [];
    this._closed = false;
    var self = this;
    this.createDataChannel = function (label) {
      var dc = new MockDataChannel(label);
      self._channels.push(dc);
      allDcs.push(dc);
      return dc;
    };
    this.createOffer = function () {
      return Promise.resolve({ type: 'offer', sdp: 'fake-offer-sdp' });
    };
    this.createAnswer = function () {
      return Promise.resolve({ type: 'answer', sdp: 'fake-answer-sdp' });
    };
    this.setLocalDescription = function (desc) {
      self.localDescription = desc;
      return Promise.resolve();
    };
    this.setRemoteDescription = function (desc) {
      self.remoteDescription = desc;
      return Promise.resolve();
    };
    this.addIceCandidate = function (c) {
      self._iceCandidates.push(c);
      return Promise.resolve();
    };
    this.close = function () { self._closed = true; };
    allPcs.push(self);
  }

  return { MockPC: MockPC, MockDataChannel: MockDataChannel, allPcs: allPcs, allDcs: allDcs };
}

// =====================================================================
// Cockpit harness: extract inline script + run it in a vm context.
// =====================================================================

function extractInlineScript(src) {
  var results = [];
  var re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(src)) !== null) { results.push(m[1]); }
  if (!results.length) return '';
  return results.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
}

var INLINE_SCRIPT = extractInlineScript(COCKPIT_SRC);

// A WebSocket stub that supports both addEventListener (monitor WS uses this)
// AND on{open,message,close,error} (in case other paths need it). Tests can
// drive open/message by calling instance helpers.
function makeMockWSClass() {
  var lastByUrl = {};
  var allInstances = [];

  function MockWS(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this._listeners = { open: [], message: [], close: [], error: [] };
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    lastByUrl[url] = this;
    allInstances.push(this);
  }
  MockWS.prototype.send = function (data) { this.sent.push(data); };
  MockWS.prototype.close = function () {
    this.readyState = 3;
    this._fire('close', {});
  };
  MockWS.prototype.addEventListener = function (event, fn) {
    if (this._listeners[event]) { this._listeners[event].push(fn); }
  };
  MockWS.prototype.removeEventListener = function (event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(function (f) { return f !== fn; });
  };
  MockWS.prototype._fire = function (event, payload) {
    var fns = this._listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](payload); } catch (_) {}
    }
    var on = this['on' + event];
    if (typeof on === 'function') { try { on(payload); } catch (_) {} }
  };
  MockWS.prototype._open = function () {
    this.readyState = 1;
    this._fire('open', {});
  };
  MockWS.prototype._receive = function (obj) {
    this._fire('message', { data: JSON.stringify(obj) });
  };

  MockWS.CONNECTING = 0;
  MockWS.OPEN       = 1;
  MockWS.CLOSING    = 2;
  MockWS.CLOSED     = 3;

  Object.defineProperty(MockWS, 'allInstances', { get: function () { return allInstances; } });
  Object.defineProperty(MockWS, 'lastByUrl',    { get: function () { return lastByUrl; } });

  return MockWS;
}

// Build the JSDOM env with all the DOM scaffolding the cockpit reads on boot.
// Mirrors poll-archive-cockpit.test.js's makeTestEnv, plus v3 P3 needs the
// RTCPeerConnection stub + the captured onSignaling.
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
  // onSignaling. The returned handle's sendSignaling pushes to a list so the
  // test can assert what the cockpit emitted (rtc_offer / rtc_ice).
  var capture = {
    boardOpts:        null,
    sendSignalingLog: []
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
        sendSignaling: function (payload) { capture.sendSignalingLog.push(payload); }
      };
    }
  };

  // rosterClient stub (teacher session).
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
    token: function () { return 'test-teacher-token'; }
  };
  win.ROSTER_SERVICE_URL  = 'https://roster-test.example.com';
  win.RAILWAY_SERVER_URL  = 'https://curriculum-test.example.com';

  // WebSocket stub.
  var MockWS = makeMockWSClass();
  win.WebSocket = MockWS;

  // RTCPeerConnection stub.
  var rtc = makeMockRTC();
  win.RTCPeerConnection = rtc.MockPC;

  // Spy on setTimeout / clearTimeout so the 3 s fallback can be exercised.
  var pendingTimeouts = {};
  var clearedTimeouts = [];
  var _nextTimeoutId = 1;
  win.setTimeout = function (fn, ms) {
    var id = _nextTimeoutId++;
    pendingTimeouts[id] = { fn: fn, ms: ms };
    return id;
  };
  win.clearTimeout = function (id) {
    if (id != null && pendingTimeouts[id]) {
      clearedTimeouts.push(id);
      delete pendingTimeouts[id];
    }
  };
  // setInterval doesn't matter for v3 P3 hub, but stub it cleanly.
  win.setInterval = function () { return 0; };
  win.clearInterval = function () {};

  // fetch -- the roster name-map endpoint must resolve so mountBoard proceeds.
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

  return {
    dom:               dom,
    win:               win,
    capture:           capture,
    MockWS:            MockWS,
    rtc:               rtc,
    pendingTimeouts:   pendingTimeouts,
    clearedTimeouts:   clearedTimeouts,
    fetchCalls:        fetchCalls,
    // Test helper: fire every pending timeout (used to drive the 3 s fallback).
    flushTimeouts: function () {
      var ids = Object.keys(pendingTimeouts);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var t = pendingTimeouts[id];
        if (t) {
          delete pendingTimeouts[id];
          try { t.fn(); } catch (_) {}
        }
      }
    }
  };
}

// Yield several event-loop ticks so promise chains inside the vm context
// can finish (e.g. mountBoard's `await fetchNameMap` + the offer microtasks).
async function yieldTicks(n) {
  for (var i = 0; i < (n || 12); i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

// Run the cockpit boot + enter Live mode WITHOUT seeding any students. The
// cockpit will mount the board (boardHandle gets set) and finish the entry,
// then the test injects students through the monitor WS, which routes
// through _applyMonitorDelta -> _initPeerFor with boardHandle ALREADY set.
// This avoids the race where the offer's microtasks fire before boardHandle
// is wired (an inherent ordering question in the impl that only surfaces
// when both chains resolve in the same microtask sweep with mock Promises).
async function bootCockpitAndGoLive(env) {
  var ctx = createContext(env.win);
  try { runInContext(INLINE_SCRIPT, ctx); } catch (_) { /* tolerate */ }

  // Yield for the initial access-check + startMonitorMode promise chain.
  await yieldTicks(2);

  // Open every pending WS instance (the monitor WS).
  for (var i = 0; i < env.MockWS.allInstances.length; i++) {
    var w = env.MockWS.allInstances[i];
    if (w.readyState === 0) { w._open(); }
  }
  // Seed an EMPTY section into the monitor WS so _globalState carries the
  // section header (with no members yet).
  if (env.MockWS.allInstances.length > 0) {
    var monitor = env.MockWS.allInstances[0];
    monitor._receive({
      type: 'classroom_state_all',
      sections: [{ section: 'PeriodE', gate: null, poll: null, live: false, members: [] }]
    });
  }

  // Click Go Live -> mountBoard -> fetchNameMap -> ClassroomBoard.mount.
  try {
    var btn = env.win.document.getElementById('btn-go-live');
    if (btn) { btn.click(); }
  } catch (_) {}

  // Let mountBoard complete (set boardHandle) + _sendLiveStart open its WS.
  await yieldTicks(12);

  // Open the board WS + sendLiveStart WS that were created during the click.
  for (var j = 0; j < env.MockWS.allInstances.length; j++) {
    var ws2 = env.MockWS.allInstances[j];
    if (ws2.readyState === 0) { ws2._open(); }
  }

  return env;
}

// Trigger _initPeerFor for a student by injecting a classroom_member_update
// through the monitor WS. _applyMonitorDelta runs and (while _cockpitMode is
// 'live') calls _initPeerFor for the student. Returns AFTER the offer's
// promise chain has settled so the rtc_offer has reached sendSignalingLog.
async function addStudent(env, username) {
  var monitor = env.MockWS.allInstances[0];
  monitor._receive({
    type:    'classroom_member_update',
    section: 'PeriodE',
    member:  { username: username, role: 'student', online: true, status: 'present' }
  });
  await yieldTicks(8);
  return env;
}

// =====================================================================
// Tests
// =====================================================================

describe('v3 P3 cockpit hub -- studentPeers + WebRTC initiation', () => {
  it('_initPeerFor creates an RTCPeerConnection per student + DataChannel called livedata', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');
    await addStudent(env, 'bob');

    // Two students -> two PCs, two DCs labelled 'livedata'.
    expect(env.rtc.allPcs.length).toBe(2);
    expect(env.rtc.allDcs.length).toBe(2);
    env.rtc.allDcs.forEach(function (dc) {
      expect(dc.label).toBe('livedata');
    });
    // Each PC was constructed with the STUN ICE server config.
    env.rtc.allPcs.forEach(function (pc) {
      expect(pc.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    });
  });

  it('_initPeerFor sends rtc_offer via boardHandle.sendSignaling with the right `to`', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');

    // Find the rtc_offer in the sendSignaling log.
    var offers = env.capture.sendSignalingLog.filter(function (m) { return m.type === 'rtc_offer'; });
    expect(offers.length).toBe(1);
    expect(offers[0].to).toBe('alice');
    expect(offers[0].sdp).toEqual({ type: 'offer', sdp: 'fake-offer-sdp' });
  });

  it('_handleRtcSignaling routes rtc_answer to the right PC via setRemoteDescription', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');

    expect(env.rtc.allPcs.length).toBe(1);
    var alicePc = env.rtc.allPcs[0];
    expect(alicePc.remoteDescription).toBeNull();

    // The board captured an onSignaling callback -- invoke it as if the
    // student's rtc_answer arrived on the board WS.
    expect(typeof env.capture.boardOpts.onSignaling).toBe('function');
    var fakeAnswer = { type: 'answer', sdp: 'real-answer-sdp' };
    env.capture.boardOpts.onSignaling({
      type: 'rtc_answer', from: 'alice', sdp: fakeAnswer
    });

    expect(alicePc.remoteDescription).toEqual(fakeAnswer);
  });

  it('_handleRtcSignaling routes rtc_ice to the right PC via addIceCandidate (after rtc_answer)', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');

    var alicePc = env.rtc.allPcs[0];
    expect(alicePc._iceCandidates).toHaveLength(0);

    // Codex MAJOR 3 fold: ICE is queued until setRemoteDescription
    // (rtc_answer) resolves. Send rtc_answer first, await the promise
    // chain, THEN send rtc_ice -- the queue should be empty and ICE
    // should land via addIceCandidate.
    env.capture.boardOpts.onSignaling({
      type: 'rtc_answer', from: 'alice', sdp: { type: 'answer', sdp: 'real-answer-sdp' }
    });
    // Yield enough microtasks for setRemoteDescription to settle.
    for (var i = 0; i < 5; i++) {
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    var fakeCandidate = { candidate: 'candidate-string', sdpMid: '0' };
    env.capture.boardOpts.onSignaling({
      type: 'rtc_ice', from: 'alice', candidate: fakeCandidate
    });

    expect(alicePc._iceCandidates).toHaveLength(1);
    expect(alicePc._iceCandidates[0]).toEqual(fakeCandidate);
  });

  it('Codex MAJOR 3 fold: rtc_ice arriving BEFORE rtc_answer is queued + flushed', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');

    var alicePc = env.rtc.allPcs[0];
    expect(alicePc._iceCandidates).toHaveLength(0);

    // ICE arrives first (before remote-description is set). With the
    // fold in place, it must be buffered -- addIceCandidate should NOT
    // be called yet.
    var earlyCandidate = { candidate: 'early-ice', sdpMid: '0' };
    env.capture.boardOpts.onSignaling({
      type: 'rtc_ice', from: 'alice', candidate: earlyCandidate
    });
    // Without the fold, addIceCandidate would have been called +
    // rejected; with the fold, the queue holds it.
    expect(alicePc._iceCandidates).toHaveLength(0);

    // Now rtc_answer arrives. setRemoteDescription resolves +
    // the queued ICE is drained.
    env.capture.boardOpts.onSignaling({
      type: 'rtc_answer', from: 'alice', sdp: { type: 'answer', sdp: 'real-answer-sdp' }
    });
    for (var i = 0; i < 5; i++) {
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    expect(alicePc._iceCandidates).toHaveLength(1);
    expect(alicePc._iceCandidates[0]).toEqual(earlyCandidate);
  });

  it('DC.onmessage: cockpit relays classroom_pos to OTHER peers DCs only (skip sender)', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');
    await addStudent(env, 'bob');
    await addStudent(env, 'carol');

    expect(env.rtc.allDcs.length).toBe(3);

    // Open all three DCs so dcOpen flips to true for each entry -- this is
    // the precondition for the relay loop's `p.dcOpen` check.
    env.rtc.allDcs.forEach(function (dc) { dc._open(); });

    // The cockpit calls createDataChannel once per addStudent, in order:
    // [0] = alice, [1] = bob, [2] = carol.
    var aliceDc = env.rtc.allDcs[0];
    var bobDc   = env.rtc.allDcs[1];
    var carolDc = env.rtc.allDcs[2];

    // alice's DC delivers a classroom_pos to the cockpit -- the cockpit
    // MUST relay to bob's DC and carol's DC, NOT alice's own DC.
    aliceDc._receive({
      type:  'classroom_pos',
      x:     150, y: 220, state: 'walking', vx: 120
    });

    // alice's DC should not have received any new send (only the relay loop
    // pushes to dc.sent on the other peers).
    expect(aliceDc.sent).toHaveLength(0);

    // bob + carol each got one classroom_pos send tagged from:'alice'.
    expect(bobDc.sent).toHaveLength(1);
    expect(carolDc.sent).toHaveLength(1);
    var bobPayload   = JSON.parse(bobDc.sent[0]);
    var carolPayload = JSON.parse(carolDc.sent[0]);
    [bobPayload, carolPayload].forEach(function (p) {
      expect(p.type).toBe('classroom_pos');
      expect(p.from).toBe('alice');
      expect(p.x).toBe(150);
      expect(p.y).toBe(220);
      expect(p.state).toBe('walking');
      expect(p.vx).toBe(120);
    });
  });

  it('_teardownAllPeers closes every PC + clears timeouts + empties studentPeers', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');
    await addStudent(env, 'bob');

    expect(env.rtc.allPcs.length).toBe(2);
    env.rtc.allPcs.forEach(function (pc) { expect(pc._closed).toBe(false); });

    // Count the pending fallback timeouts BEFORE Exit Live. The cockpit may
    // have scheduled other timeouts too (e.g. _sendLiveStart's 250 ms close
    // delay); the precise pre-teardown count is impl-driven, so we measure
    // only the post-teardown effect on the peer PCs/DCs/clearedTimeouts.
    var peerTimeoutCountBefore = Object.keys(env.pendingTimeouts).length;

    // Click Exit Live -- this invokes exitLiveMode which calls _teardownAllPeers.
    var btn = env.win.document.getElementById('btn-exit-live');
    btn.click();

    // Yield so any post-teardown async settles.
    await yieldTicks(2);

    // Every PC closed; every DC closed; pending fallback timeouts cleared.
    env.rtc.allPcs.forEach(function (pc) { expect(pc._closed).toBe(true); });
    env.rtc.allDcs.forEach(function (dc) { expect(dc._closed).toBe(true); });
    // At least the two per-peer fallback timeouts are cleared (clearedTimeouts
    // is cumulative -- any other clears in the lifecycle keep it >= 2).
    expect(env.clearedTimeouts.length).toBeGreaterThanOrEqual(2);
    // The pending-timeouts map dropped by at least the two peer fallbacks.
    var peerTimeoutCountAfter = Object.keys(env.pendingTimeouts).length;
    expect(peerTimeoutCountBefore - peerTimeoutCountAfter).toBeGreaterThanOrEqual(2);

    // A subsequent classroom_pos relay attempt MUST find no peers (DCs are
    // all closed). Verify by counting sends on every DC -- still 0 (no relays).
    env.rtc.allDcs.forEach(function (dc) {
      expect(dc.sent).toHaveLength(0);
    });
  });

  it('3-second timeout nulls the entry if DC did not open', async () => {
    var env = makeCockpitEnv();
    await bootCockpitAndGoLive(env);
    await addStudent(env, 'alice');

    expect(env.rtc.allPcs.length).toBe(1);
    var alicePc = env.rtc.allPcs[0];
    expect(alicePc._closed).toBe(false);

    // The DC is still 'connecting' (we never opened it). The cockpit
    // scheduled the 3 s fallback timeout for the peer; firing all pending
    // timeouts must close the PC (since DC never opened).
    env.flushTimeouts();

    // The PC for alice was closed (since its DC never opened in time).
    expect(alicePc._closed).toBe(true);
  });
});

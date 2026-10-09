// lib/net-probe.js — passive classroom network probe (NET_PROBE_SPEC.md).
//
// Data gathering only. Nothing in the Desk changes for students. Once per device per calendar
// day, at least 5 s after the Desk calendar first renders (rCal) and never while a park /
// Tetris / Live Classroom session is active, it measures:
//   rttRoster  median of 5 GET /health to roster-server
//   rttRelay   median of 5 GET /health to the cr relay
//   p2p        one WebRTC data channel to ONE classmate in the same section (types, counts, rtt)
//   conn, ua   navigator.connection hints, browser brand + platform
// and POSTs one record to roster-server /net/probe. No addresses ever leave this file:
// candidate lines are reduced to type counts here, and the server whitelists again.
//
// Hard budget 15 s. Every step has its own timeout; a failed step records its error code and
// the rest continue. Kill-switches: roster-server NET_PROBE_ENABLED (GET /net/probe/config)
// and, per device, localStorage 'apstats-net-probe' = 'off'.
//
// The Desk calls NetProbe.afterCal() once after its first calendar render. Everything is
// wrapped: this file must never throw into the Desk.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;
  root.NetProbeLib = api;
  try { root.NetProbe = api.create(root); } catch (_) { /* never break the Desk */ }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DAY_KEY = 'apstats-net-probe-day';
  var OFF_KEY = 'apstats-net-probe';
  var DEFAULT_RELAY = 'https://curriculumrender-production.up.railway.app';
  var DEFAULT_STUN = ['stun:stun.l.google.com:19302'];

  var DEFAULTS = {
    idleMs: 5000,          // wait after rCal
    busyRetryMs: 60000,    // a session was active: look again later
    busyRetries: 30,
    budgetMs: 15000,       // whole run
    postReserveMs: 2500,   // kept back for the final POST
    configMs: 3000,
    healthMs: 2000,        // per GET /health
    healthCount: 5,
    gatherMs: 3000,
    pollEveryMs: 1000,
    answerWaitMs: 8000,    // offer side: wait for a classmate's answer
    connectMs: 8000,       // channel open
    pingCount: 10,
    pingMs: 1000,          // per ping
    lingerMs: 500,         // keep the channel up so the classmate can finish its pings
  };

  // ── small helpers ──────────────────────────────────────────────────────────

  function fail(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  function codeOf(e) {
    return (e && e.code) || 'other';
  }

  function median(values) {
    var sorted = values.filter(function (v) { return typeof v === 'number' && isFinite(v); })
      .sort(function (a, b) { return a - b; });
    if (!sorted.length) return null;
    var mid = Math.floor(sorted.length / 2);
    var m = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.round(m * 10) / 10;
  }

  function localDay(date) {
    var d = date || new Date();
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    return d.getFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
  }

  // Reduce SDP candidate lines to type counts + "any mDNS host seen". Addresses are read only
  // to test for a '.local' suffix and are never kept.
  function countCandidates(sdp) {
    var counts = { host: 0, srflx: 0, prflx: 0, relay: 0, mdns: false };
    var lines = String(sdp || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('a=candidate:') !== 0) continue;
      var typ = /\styp\s+(host|srflx|prflx|relay)\b/.exec(line);
      if (typ) counts[typ[1]] += 1;
      var fields = line.split(' ');
      if (fields.length > 4 && /\.local$/i.test(fields[4])) counts.mdns = true;
    }
    return counts;
  }

  function hasCandidates(counts) {
    return !!counts && (counts.host + counts.srflx + counts.prflx + counts.relay) > 0;
  }

  // "Chrome 141; Chrome OS" — brand + major version + platform. No dotted versions.
  function uaSummary(nav) {
    if (!nav) return null;
    var data = nav.userAgentData;
    if (data && data.brands && data.brands.length) {
      // Prefer the real product ("Google Chrome", "Microsoft Edge"), then "Chromium".
      var real = data.brands.filter(function (b) { return !/not.?a.?brand/i.test(b.brand); });
      var named = real.filter(function (b) { return b.brand !== 'Chromium'; });
      var brand = named[0] || real[0] || null;
      var name = brand ? brand.brand.replace(/^Google /, '') + ' ' + String(brand.version).split('.')[0] : 'Unknown';
      return name + '; ' + (data.platform || 'unknown') + (data.mobile ? '; mobile' : '');
    }
    var ua = String(nav.userAgent || '');
    var browser = 'Unknown';
    var m;
    if ((m = /Edg\/(\d+)/.exec(ua))) browser = 'Edge ' + m[1];
    else if ((m = /Chrome\/(\d+)/.exec(ua))) browser = 'Chrome ' + m[1];
    else if ((m = /Firefox\/(\d+)/.exec(ua))) browser = 'Firefox ' + m[1];
    else if ((m = /Version\/(\d+).*Safari/.exec(ua))) browser = 'Safari ' + m[1];
    var platform = 'unknown';
    if (/CrOS/.test(ua)) platform = 'Chrome OS';
    else if (/Android/.test(ua)) platform = 'Android';
    else if (/iPhone|iPad/.test(ua)) platform = 'iOS';
    else if (/Windows/.test(ua)) platform = 'Windows';
    else if (/Mac OS X/.test(ua)) platform = 'macOS';
    else if (/Linux/.test(ua)) platform = 'Linux';
    return browser + '; ' + platform;
  }

  function connHints(nav) {
    var c = nav && nav.connection;
    if (!c) return {};
    var out = {};
    if (typeof c.effectiveType === 'string') out.effectiveType = c.effectiveType;
    if (typeof c.type === 'string') out.type = c.type;
    if (typeof c.rtt === 'number') out.rtt = c.rtt;
    if (typeof c.downlink === 'number') out.downlink = c.downlink;
    if (c.saveData === true) out.saveData = true;
    return out;
  }

  // ── the probe ──────────────────────────────────────────────────────────────

  function create(env, options) {
    var opts = {};
    var key;
    for (key in DEFAULTS) opts[key] = DEFAULTS[key];
    for (key in (options || {})) opts[key] = options[key];

    var state = { idleTimer: null, busyChecks: 0, started: false, lastSkip: null, lastRecord: null };

    function now() {
      var perf = env.performance;
      if (perf && typeof perf.now === 'function') return perf.now();
      return Date.now();
    }

    function wait(ms) {
      return new Promise(function (resolve) { env.setTimeout(resolve, Math.max(0, ms)); });
    }

    // Reject with `code` after ms. Clears its timer when the promise settles first.
    function withTimeout(promise, ms, code) {
      return new Promise(function (resolve, reject) {
        if (ms <= 0) return reject(fail('budget'));
        var timer = env.setTimeout(function () { reject(fail(code || 'timeout')); }, ms);
        promise.then(
          function (v) { env.clearTimeout(timer); resolve(v); },
          function (e) { env.clearTimeout(timer); reject(e); }
        );
      });
    }

    function storageGet(store, k) {
      try { return env[store] ? env[store].getItem(k) : null; } catch (_) { return null; }
    }

    function storageSet(store, k, v) {
      try { if (env[store]) env[store].setItem(k, v); } catch (_) { /* blocked storage: skip */ }
    }

    function session() {
      try {
        var rc = env.rosterClient;
        if (!rc || typeof rc.current !== 'function') return null;
        var cur = rc.current();
        if (!cur || !cur.studentId || cur.expired) return null;
        var token = typeof rc.token === 'function' ? rc.token() : null;
        if (!token) return null;
        return { section: cur.section, role: cur.role, token: token };
      } catch (_) { return null; }
    }

    function rosterUrl() {
      return String(env.ROSTER_SERVICE_URL || '').replace(/\/+$/, '');
    }

    function relayUrl() {
      return String(env.RAILWAY_SERVER_URL || DEFAULT_RELAY).replace(/\/+$/, '');
    }

    // A park level, the team calculator, Study Break Tetris, or a live classroom activity.
    function isBusy() {
      try {
        var doc = env.document;
        var mount = doc && doc.getElementById && doc.getElementById('classroom-board-mount');
        if (mount && (mount.hasAttribute('data-park-active')
          || mount.hasAttribute('data-calculator-active')
          || mount.hasAttribute('data-calculator-participating'))) return true;
        var sb = env.studyBreak;
        if (sb && typeof sb.isOpen === 'function' && sb.isOpen()) return true;
        var summary = env._lastClassroomSummary;
        if (summary && summary.live) return true;
        if (summary && summary.activity && !summary.activity.finished) return true;
      } catch (_) { return true; }   // unsure → treat as busy, never interrupt
      return false;
    }

    // Why the probe must NOT run right now, or null when it may.
    function skipReason() {
      if (storageGet('localStorage', OFF_KEY) === 'off') return 'off-device';
      if (storageGet('localStorage', DAY_KEY) === localDay()) return 'done-today';
      var s = session();
      if (!s) return 'signed-out';
      if (s.role === 'teacher') return 'teacher';
      if (storageGet('localStorage', 'apstats_user_role') === 'teacher') return 'teacher';
      if (storageGet('sessionStorage', 'apstats_preview_as_student') === '1') return 'preview';
      if (storageGet('sessionStorage', 'apstats_view_as_context')) return 'preview';
      if (isBusy()) return 'busy';
      return null;
    }

    // ── HTTP ───────────────────────────────────────────────────────────────

    async function request(method, url, body, ms, token) {
      if (typeof env.fetch !== 'function') throw fail('network');
      var headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = 'Bearer ' + token;
      var init = { method: method, headers: headers, cache: 'no-store' };
      if (body) init.body = JSON.stringify(body);
      var res;
      try {
        res = await withTimeout(env.fetch(url, init), ms, 'timeout');
      } catch (e) {
        throw e && e.code ? e : fail('network');
      }
      if (!res || !res.ok) throw fail('http');
      try { return await res.json(); } catch (_) { return null; }
    }

    // Median of `healthCount` sequential GET /health timings (successes only).
    async function measureRtt(base, deadline) {
      var times = [];
      for (var i = 0; i < opts.healthCount; i++) {
        var left = deadline();
        if (left <= 0) break;
        var t0 = now();
        try {
          var res = await withTimeout(env.fetch(base + '/health', { cache: 'no-store' }), Math.min(opts.healthMs, left), 'timeout');
          if (res && res.ok) times.push(now() - t0);
        } catch (_) { /* one failed ping; keep going */ }
      }
      if (!times.length) throw fail(deadline() <= 0 ? 'budget' : 'timeout');
      return median(times);
    }

    // ── WebRTC ─────────────────────────────────────────────────────────────

    function waitGather(pc, ms) {
      return new Promise(function (resolve) {
        if (pc.iceGatheringState === 'complete') return resolve(true);
        var done = false;
        function finish(ok) { if (done) return; done = true; resolve(ok); }
        var timer = env.setTimeout(function () { finish(false); }, Math.max(0, ms));
        function check() {
          if (pc.iceGatheringState === 'complete') { env.clearTimeout(timer); finish(true); }
        }
        try { pc.addEventListener('icegatheringstatechange', check); } catch (_) {}
        try { pc.addEventListener('icecandidate', function (ev) { if (!ev || !ev.candidate) check(); }); } catch (_) {}
      });
    }

    // Gathering that times out still continues with whatever was gathered; none at all is an error.
    async function gatherLocal(pc, ms) {
      await waitGather(pc, ms);
      var sdp = pc.localDescription && pc.localDescription.sdp;
      var counts = countCandidates(sdp);
      if (!hasCandidates(counts)) throw fail('gatherTimeout');
      return { sdp: sdp, counts: counts };
    }

    function waitOpen(pc, channelPromise, ms) {
      return new Promise(function (resolve, reject) {
        var timer = env.setTimeout(function () { reject(fail('connectTimeout')); }, Math.max(0, ms));
        function onIce() {
          var s = pc.iceConnectionState || pc.connectionState;
          if (s === 'failed') { env.clearTimeout(timer); reject(fail('iceFailed')); }
        }
        try { pc.addEventListener('iceconnectionstatechange', onIce); } catch (_) {}
        try { pc.addEventListener('connectionstatechange', onIce); } catch (_) {}
        channelPromise.then(function (dc) {
          if (dc.readyState === 'open') { env.clearTimeout(timer); return resolve(dc); }
          dc.addEventListener('open', function () { env.clearTimeout(timer); resolve(dc); });
        });
      });
    }

    // Both sides echo pings; each side measures its own round trips.
    function wireEcho(dc, pending) {
      dc.addEventListener('message', function (ev) {
        var msg = null;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg) return;
        if (msg.t === 'ping') { try { dc.send(JSON.stringify({ t: 'pong', id: msg.id })); } catch (_) {} return; }
        if (msg.t === 'pong' && pending[msg.id]) { pending[msg.id](); delete pending[msg.id]; }
      });
    }

    async function pingRtt(dc, pending, deadline) {
      var times = [];
      for (var i = 0; i < opts.pingCount; i++) {
        var left = deadline();
        if (left <= 0) break;
        var id = 'p' + i;
        var t0 = now();
        var pong = new Promise(function (resolve) { pending[id] = resolve; });
        try {
          dc.send(JSON.stringify({ t: 'ping', id: id }));
          await withTimeout(pong, Math.min(opts.pingMs, left), 'pingFailed');
          times.push(now() - t0);
        } catch (_) { delete pending[id]; }
      }
      if (!times.length) throw fail('pingFailed');
      return median(times);
    }

    // The selected pair's candidate TYPES from getStats. Never addresses.
    async function selectedPair(pc) {
      var report = await pc.getStats();
      var byId = {};
      var selectedId = null;
      report.forEach(function (s) {
        byId[s.id] = s;
        if (s.type === 'transport' && s.selectedCandidatePairId) selectedId = s.selectedCandidatePairId;
      });
      var pair = selectedId ? byId[selectedId] : null;
      if (!pair) {
        report.forEach(function (s) {
          if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || s.selected)) pair = pair || s;
        });
      }
      if (!pair) throw fail('noStats');
      var local = byId[pair.localCandidateId];
      var remote = byId[pair.remoteCandidateId];
      return { local: local ? local.candidateType : null, remote: remote ? remote.candidateType : null };
    }

    async function offerSide(pc, ctx, p2p) {
      p2p.role = 'offer';
      var dc = pc.createDataChannel('net-probe');
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      var local = await gatherLocal(pc, Math.min(opts.gatherMs, ctx.deadline()));
      p2p.candidates = local.counts;

      var posted = await request('POST', ctx.base + '/net/probe/offer', { sdp: local.sdp }, Math.min(opts.configMs, ctx.deadline()), ctx.token)
        .catch(function () { throw fail('signalFailed'); });
      var offerId = posted && posted.offerId;
      if (!offerId) throw fail('signalFailed');

      var answerSdp = null;
      var waitUntil = now() + opts.answerWaitMs;
      while (!answerSdp && now() < waitUntil && ctx.deadline() > 0) {
        await wait(Math.min(opts.pollEveryMs, ctx.deadline()));
        try {
          var got = await request('GET', ctx.base + '/net/probe/answer/' + encodeURIComponent(offerId), null, Math.min(opts.pollEveryMs * 2, Math.max(1, ctx.deadline())), ctx.token);
          answerSdp = got && got.answer;
        } catch (_) { /* keep polling until the window closes */ }
      }
      if (!answerSdp) throw fail('noPeer');

      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      return waitOpen(pc, Promise.resolve(dc), Math.min(opts.connectMs, ctx.deadline()));
    }

    async function answerSide(pc, ctx, p2p, offer) {
      p2p.role = 'answer';
      var channel = new Promise(function (resolve) {
        pc.addEventListener('datachannel', function (ev) { resolve(ev.channel); });
      });
      await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      var local = await gatherLocal(pc, Math.min(opts.gatherMs, ctx.deadline()));
      p2p.candidates = local.counts;
      await request('POST', ctx.base + '/net/probe/answer/' + encodeURIComponent(offer.offerId), { sdp: local.sdp }, Math.min(opts.configMs, ctx.deadline()), ctx.token)
        .catch(function () { throw fail('signalFailed'); });
      return waitOpen(pc, channel, Math.min(opts.connectMs, ctx.deadline()));
    }

    async function probeP2p(ctx, stun, errors) {
      var p2p = { connected: false, rtt: null, localPair: null, candidates: null, error: null, role: null };
      if (typeof env.RTCPeerConnection !== 'function') { p2p.error = 'policy'; return p2p; }
      var pc;
      try {
        pc = new env.RTCPeerConnection({ iceServers: [{ urls: stun }], iceCandidatePoolSize: 0 });
      } catch (_) {
        p2p.error = 'policy';
        return p2p;
      }
      var pending = {};
      try {
        var found = await request('GET', ctx.base + '/net/probe/pending?section=' + encodeURIComponent(ctx.section || ''), null, Math.min(opts.configMs, ctx.deadline()), ctx.token)
          .catch(function () { return null; });
        var offer = found && found.offer;
        var dc = offer ? await answerSide(pc, ctx, p2p, offer) : await offerSide(pc, ctx, p2p);
        p2p.connected = true;
        wireEcho(dc, pending);
        try { p2p.rtt = await pingRtt(dc, pending, ctx.deadline); } catch (e) { p2p.error = codeOf(e); }
        try { p2p.localPair = await withTimeout(selectedPair(pc), Math.min(1000, Math.max(1, ctx.deadline())), 'noStats'); }
        catch (e) { errors.stats = codeOf(e); }
        await wait(Math.min(opts.lingerMs, Math.max(0, ctx.deadline())));
      } catch (e) {
        p2p.error = p2p.error || codeOf(e);
      } finally {
        try { pc.close(); } catch (_) {}
      }
      return p2p;
    }

    // ── the run ────────────────────────────────────────────────────────────

    // Returns the posted record, or null when skipped. Never rejects.
    async function run() {
      try {
        return await runInner();
      } catch (_) {
        return null;
      }
    }

    async function runInner() {
      var reason = skipReason();
      if (reason) { state.lastSkip = reason; return null; }
      var s = session();
      var base = rosterUrl();
      if (!base) { state.lastSkip = 'no-url'; return null; }

      var started = now();
      function stepDeadline() { return opts.budgetMs - opts.postReserveMs - (now() - started); }

      // 1. Kill-switch. Unreachable or off → skip entirely (and do not stamp the day).
      var config = null;
      try { config = await request('GET', base + '/net/probe/config', null, opts.configMs); } catch (_) { config = null; }
      if (!config || config.enabled !== true) { state.lastSkip = config ? 'disabled' : 'no-config'; return null; }

      // Once per device per day: stamp before the work so a crash or reload cannot repeat it.
      storageSet('localStorage', DAY_KEY, localDay());

      var errors = {};
      var record = { rttRoster: null, rttRelay: null, p2p: {}, conn: {}, ua: null, errors: errors, preview: false };
      try { record.conn = connHints(env.navigator); } catch (_) {}
      try { record.ua = uaSummary(env.navigator); } catch (_) {}

      try { record.rttRoster = await measureRtt(base, stepDeadline); } catch (e) { errors.rttRoster = codeOf(e); }
      try { record.rttRelay = await measureRtt(relayUrl(), stepDeadline); } catch (e) { errors.rttRelay = codeOf(e); }

      var ctx = { base: base, token: s.token, section: s.section, deadline: stepDeadline };
      var stun = (config.stun && config.stun.length) ? config.stun : DEFAULT_STUN;
      try { record.p2p = await probeP2p(ctx, stun, errors); } catch (e) { errors.p2p = codeOf(e); }

      var postMs = Math.max(500, opts.budgetMs - (now() - started));
      try { await request('POST', base + '/net/probe', record, Math.min(postMs, opts.postReserveMs + 1000), s.token); }
      catch (e) { errors.post = codeOf(e); }
      state.lastRecord = record;
      return record;
    }

    // Busy now → look again later (bounded). Otherwise run.
    function attempt() {
      state.idleTimer = null;
      try {
        if (state.started) return;
        if (skipReason() === 'busy') {
          state.lastSkip = 'busy';
          if (state.busyChecks >= opts.busyRetries) return;
          state.busyChecks += 1;
          state.idleTimer = env.setTimeout(attempt, opts.busyRetryMs);
          return;
        }
        state.started = true;
        state.promise = run();
      } catch (_) { /* never throw into the Desk */ }
    }

    // The Desk's hook: called after rCal. Each call restarts the idle wait; one run per page.
    function afterCal() {
      try {
        if (state.started) return;
        if (state.idleTimer) env.clearTimeout(state.idleTimer);
        state.idleTimer = env.setTimeout(attempt, opts.idleMs);
      } catch (_) { /* never throw into the Desk */ }
    }

    return {
      afterCal: afterCal,
      run: run,
      isBusy: isBusy,
      skipReason: skipReason,
      state: state,
    };
  }

  return {
    create: create,
    countCandidates: countCandidates,
    uaSummary: uaSummary,
    connHints: connHints,
    median: median,
    localDay: localDay,
    DAY_KEY: DAY_KEY,
    OFF_KEY: OFF_KEY,
  };
});

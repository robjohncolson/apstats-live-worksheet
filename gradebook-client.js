// @ts-check
// gradebook-client.js — AP Stats gradebook ledger feeder client
// Repo root sibling of roster-client.js and roster_config.js.
// Loaded AFTER roster_config.js + roster-client.js.
// Pure browser JS: no build, no imports, no Supabase, no secrets.
// Reads window.ROSTER_SERVICE_URL and window.rosterClient.token() at call time.
//
// Implements FROZEN CONTRACT 3 (GRADEBOOK_PHASE1_BUILD.md):
//   window.gradebookClient.record({ source, itemId, unit, topic, skill, response, score, attempt })
//   → { ok:true, ledgerId } | { ok:false, reason:'no-identity'|'network'|'server'|'auth'|'bad-args'|'read-only' }
//
// OFFLINE_MODE_SPEC §4.A (additive): when a write is captured into
// window.OfflineQueue, the result carries `queued:true` — offline pack →
// { ok:true, queued:true }; an intermittent network failure → { ok:false,
// reason:'network', queued:true }. The `reason` whitelist is unchanged, so
// callers that switch on `reason` keep working.
//
// Decision L-D: fire-and-forget, no-ops without identity, NEVER throws/blocks the caller.
// Decision L-C: No proctor header is ever sent — proctored evidence tier is server-gated only.

(function () {
  'use strict';

  // ── No-identity nudge (defense-in-depth backstop) ───────────────────────────
  // Worksheets normally gate behind the sign-in wall, but that wall FAILS OPEN
  // (roster-client unavailable, teacher-role bypass, or sign-out mid-session).
  // If a real recording attempt is ever dropped for no-identity, the student
  // MUST see it — a silently dropped write is lost work with no warning (this is
  // what made a worksheet's score "disappear"). Fires at most ONCE per page;
  // never throws, never blocks — record()'s return contract is unchanged.
  var _noIdentityNudgeShown = false;
  function _showNoIdentityNudge() {
    try {
      if (_noIdentityNudgeShown) return;
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('gb-no-identity-nudge')) return;
      _noIdentityNudgeShown = true;

      var bar = document.createElement('div');
      bar.id = 'gb-no-identity-nudge';
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;'
        + 'background:#b00020;color:#fff;font-family:Geneva,Verdana,sans-serif;'
        + 'font-size:13px;padding:10px 14px;display:flex;align-items:center;'
        + 'gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';

      var msg = document.createElement('span');
      msg.textContent = '⚠️ You are not signed in — your answers are NOT being saved to your grade.';
      bar.appendChild(msg);

      var link = document.createElement('a');
      link.href = 'ap_stats_roadmap_square_mode.html';
      link.textContent = 'Open the Desk to sign in';
      link.style.cssText = 'color:#fff;font-weight:bold;text-decoration:underline;white-space:nowrap;';
      bar.appendChild(link);

      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'background:transparent;border:0;color:#fff;font-size:18px;'
        + 'line-height:1;cursor:pointer;padding:0 4px;';
      x.onclick = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
      bar.appendChild(x);

      document.body.appendChild(bar);
    } catch (_) { /* nudge is best-effort; never block or throw from record() */ }
  }

  // ── Receipt capture (RECEIPTS_BUILD.md / receipt-system-spec v1.1) ──────────
  // Stores signed receipts from /ledger/record responses in localStorage
  // 'desk_receipts_v1': newest-first array of {id, compact, src, i, sc, ts},
  // capped at 500. Shared-origin: the Desk's "My Receipts" view reads this key.
  // Best-effort — must never break record()'s fire-and-forget contract.
  var RECEIPTS_KEY = 'desk_receipts_v1';
  var RECEIPTS_CAP = 500;
  function _captureReceipt(receipt, source, itemId, score) {
    try {
      if (!receipt || !receipt.receiptId || !receipt.compact) return;
      var list = [];
      try { list = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]'); } catch (_) { list = []; }
      if (!Array.isArray(list)) list = [];
      var id = receipt.receiptId;
      list = list.filter(function (row) { return !row || row.id !== id; });
      list.unshift({
        id: id,
        compact: receipt.compact,
        src: source,
        i: itemId,
        sc: (typeof score === 'number') ? score : undefined,
        ts: Date.now()
      });
      if (list.length > RECEIPTS_CAP) list.length = RECEIPTS_CAP;
      localStorage.setItem(RECEIPTS_KEY, JSON.stringify(list));
    } catch (_) { /* receipts are best-effort; never block or throw from record() */ }
  }

  // ── Offline capture (OFFLINE_MODE_SPEC §4.A) ────────────────────────────────
  // gradebook-client is the GRADE-bearing write path. When there is no server
  // (a baked OFFLINE_MODE pack, or an intermittent fetch failure) the record is
  // captured into window.OfflineQueue instead of dropped, then flushed later by
  // syncOfflineQueue() (auto on 'online', or by the teacher importing the export).
  // Everything degrades gracefully if offline-queue.js isn't loaded on the page.
  function _token() {
    try {
      if (window.rosterClient && typeof window.rosterClient.token === 'function') {
        return window.rosterClient.token();
      }
    } catch (_) { /* treat as no identity */ }
    return null;
  }

  function _studentId() {
    try {
      if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
        return window.rosterClient.studentId();
      }
    } catch (_) { /* treat as no identity */ }
    return null;
  }

  function _hasQueue() {
    return !!(window.OfflineQueue && typeof window.OfflineQueue.enqueue === 'function');
  }

  function _isOfflineMode() {
    try {
      return !!(window.OfflineQueue && typeof window.OfflineQueue.isOffline === 'function' && window.OfflineQueue.isOffline());
    } catch (_) { return false; }
  }

  function _enqueueOffline(opts) {
    if (!_hasQueue()) return Promise.resolve(false);
    var sid = _studentId();
    try {
      // Cast: _hasQueue() above guarantees enqueue exists; tsc can't see across the call.
      return Promise.resolve(/** @type {any} */ (window.OfflineQueue).enqueue({
        source: opts.source, itemId: opts.itemId, response: opts.response,
        score: opts.score, attempt: opts.attempt,
        unit: opts.unit, topic: opts.topic, skill: opts.skill,
        studentId: sid || undefined, kind: opts.kind || 'record'
      })).then(function () { return true; }, function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }

  // Raw POST to /ledger/record. NEVER throws; NEVER enqueues (so it is safe to
  // call from a drain without re-queuing). Returns { ok, reason?, ledgerId? }.
  /** @param {RecordOpts} opts @returns {Promise<RecordResult>} */
  async function _postRecord(opts) {
    try {
      var token = _token();
      if (!token) return { ok: false, reason: 'no-identity' };
      var baseUrl = window.ROSTER_SERVICE_URL || null;
      if (!baseUrl) {
        console.warn('gradebook-client: ROSTER_SERVICE_URL is not configured');
        return { ok: false, reason: 'network' };
      }

      var body = {
        token:    token,
        source:   opts.source,
        itemId:   opts.itemId,
        unit:     opts.unit,
        topic:    opts.topic,
        skill:    opts.skill,
        response: opts.response,
        score:    opts.score,
        attempt:  opts.attempt
      };

      var res = await fetch(baseUrl + '/ledger/record', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      });

      var data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (data && data.ok) {
        _captureReceipt(data.receipt, opts.source, opts.itemId, opts.score);
        return { ok: true, ledgerId: data.ledgerId, receipt: data.receipt || null };
      }
      if (res && (res.status === 401 || res.status === 403)) { console.warn('gradebook-client: auth failed', data); return { ok: false, reason: 'auth' }; }
      if (res && !res.ok) { console.warn('gradebook-client: server error', data); return { ok: false, reason: 'server' }; }
      console.warn('gradebook-client: server returned ok:false', data);
      return { ok: false, reason: 'server' };
    } catch (err) {
      // fetch rejection / JSON error → treat as offline-ish (queueable)
      return { ok: false, reason: 'network' };
    }
  }

  window.gradebookClient = {

    // Fire-and-forget ledger write.
    // NEVER throws. NEVER rejects. NEVER blocks the caller.
    // Returns a Promise that always resolves to { ok, ... }.
    /** @param {RecordOpts} opts @returns {Promise<RecordResult>} */
    record: async function (opts) {
      try {
        // --- Validate required args BEFORE touching anything ---
        var source   = opts && opts.source;
        var itemId   = opts && opts.itemId;
        var response = opts && opts.response;

        if (!source || !itemId || response === undefined) {
          return { ok: false, reason: 'bad-args' };
        }

        // --- View-as / read-only: never capture or send (defense-in-depth) ---
        // The worksheet view-as module also neuters record(), but the Desk path
        // and any future caller rely on this guard so an impersonating teacher's
        // actions are never queued/attributed to the student. (OFFLINE_MODE_SPEC §4.A)
        if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) {
          return { ok: false, reason: 'read-only' };
        }

        // --- Offline pack: capture locally, skip the network entirely ---
        if (_isOfflineMode()) {
          // Identity FIRST (Codex P4 blocker): an unattributed capture would sit
          // in the queue and later be POSTed by syncOfflineQueue() under whatever
          // token is current at drain time — cross-student attribution on a
          // shared device. No token or no studentId → no-op, like the online path.
          if (!_token() || !_studentId()) {
            _showNoIdentityNudge();
            return { ok: false, reason: 'no-identity' };
          }
          // queued:true must be HONEST: if the capture itself fails (quota, a
          // broken queue), saying "queued" would hide a LOST grade behind a
          // "Saved offline" toast. Report the failure so the caller surfaces it.
          if (await _enqueueOffline(opts)) {
            return { ok: true, queued: true, ledgerId: null };
          }
          return { ok: false, reason: 'network' };
        }

        // --- Online path: must have identity to attribute the write ---
        if (!_token()) {
          _showNoIdentityNudge(); // surface the dropped write (never silent)
          return { ok: false, reason: 'no-identity' };
        }

        var r = await _postRecord(opts);
        if (r.ok) return r;

        // Reachability failure → capture for later instead of dropping the grade.
        // reason stays 'network' (the frozen whitelist); the additive `queued`
        // flag signals the write was captured locally — only when it actually was.
        // Attribution gate here too: a queued record must carry its owner's
        // studentId (the token alone is drain-time state, not ownership).
        if (r.reason === 'network' && _hasQueue() && _studentId()) {
          if (await _enqueueOffline(opts)) {
            return { ok: false, reason: 'network', queued: true };
          }
          return r;
        }
        if (r.reason === 'no-identity') _showNoIdentityNudge();
        return r;

      } catch (err) {
        console.warn('gradebook-client: record failed —', err && err.message);
        return { ok: false, reason: 'network' };
      }
    },

    // ── OFFLINE_MODE_SPEC §4.A — flush queued work to the server ────────────────
    // Replays each queued record via the raw POST; the queue deletes only the
    // ones that land. Auto-runs on 'online'; also callable from the export page.
    // NEVER throws; resolves to { sent, failed }.
    syncOfflineQueue: async function () {
      try {
        if (!window.OfflineQueue || typeof window.OfflineQueue.drain !== 'function') return { sent: 0, failed: 0 };
        return await window.OfflineQueue.drain(function (rec) { return _postRecord(/** @type {RecordOpts} */ (rec)); });
      } catch (_) {
        return { sent: 0, failed: 0 };
      }
    },

    // ── PERSISTENT_ANSWERS_BUILD.md §4 — fetchPrior(prefix) ─────────────────
    // Read-only self-fetch of this student's prior ledger rows for the given
    // itemId prefix (e.g. 'WS-U4L1-2'). Returns a Map<itemId, {response,score,source}>.
    //
    // NEVER throws. NEVER rejects. Always resolves to a Map (possibly empty).
    // No-ops without identity or without a sane prefix. The server enforces
    // self-only access — the client adds a token+sid so the server can verify.
    fetchPrior: async function (prefix) {
      try {
        if (!prefix || typeof prefix !== 'string') return new Map();
        // Mirror the server's strict-prefix charset: no underscore (it is a
        // SQL LIKE wildcard server-side). Real item_ids use [A-Za-z0-9-] only.
        if (!/^[A-Za-z0-9\-]+$/.test(prefix)) return new Map();

        var token = null;
        var sid = null;
        try {
          if (window.rosterClient && typeof window.rosterClient.token === 'function') {
            token = window.rosterClient.token();
          }
          // Teacher "view as student": a worksheet opened from the Desk under
          // view-as sets window.__VIEW_AS_STUDENT_ID__ so EVERY prior-answer read
          // targets THAT student instead of the signed-in teacher. The teacher's
          // own token rides along in the Authorization header — the server allows
          // a verified teacher to read any student's ledger (read-only). Falls
          // back to the signed-in student's own id for the normal student flow.
          if (typeof window !== 'undefined' && window.__VIEW_AS_STUDENT_ID__) {
            sid = window.__VIEW_AS_STUDENT_ID__;
          } else if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
            sid = window.rosterClient.studentId();
          }
        } catch (_) {
          return new Map();
        }
        if (!token || !sid) return new Map();

        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) return new Map();

        // Token goes in the Authorization header, NOT the query string —
        // query strings leak into access logs / Referer / browser history.
        var url = baseUrl + '/ledger/student/' + encodeURIComponent(sid)
                + '?prefix=' + encodeURIComponent(prefix);

        var res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res || !res.ok) return new Map();
        var data = await res.json();
        if (!data || !data.ok || !Array.isArray(data.rows)) return new Map();

        // Dedupe: rows are newest-first; first occurrence per item_id wins.
        var out = new Map();
        for (var i = 0; i < data.rows.length; i++) {
          var r = data.rows[i];
          if (!r || !r.item_id) continue;
          if (out.has(r.item_id)) continue;
          out.set(r.item_id, { response: r.response, score: r.score, source: r.source });
        }
        return out;
      } catch (_) {
        return new Map();
      }
    },

    // ── WALLET_BUILD.md Task B — fetchReceipts() ────────────────────────────
    // Read-only self-fetch of this student's DURABLE signed receipts (persisted
    // server-side, migration 0018). Returns an array of {id, compact, src, i,
    // sc, ts} for rows that carry a receipt_compact, newest first. The Wallet
    // merges this with the local desk_receipts_v1 cache (deduped by id) so the
    // receipt history survives a browser-storage wipe or a device switch.
    //
    // NEVER throws. NEVER rejects. Resolves to [] on any failure (offline,
    // signed-out, pre-migration server with no receipt columns).
    fetchReceipts: async function () {
      try {
        var token = null;
        var sid = null;
        try {
          if (window.rosterClient && typeof window.rosterClient.token === 'function') {
            token = window.rosterClient.token();
          }
          if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
            sid = window.rosterClient.studentId();
          }
        } catch (_) {
          return [];
        }
        if (!token || !sid) return [];

        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) return [];

        var url = baseUrl + '/ledger/student/' + encodeURIComponent(sid);
        var res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res || !res.ok) return [];
        var data = await res.json();
        if (!data || !data.ok || !Array.isArray(data.rows)) return [];

        var out = [];
        for (var i = 0; i < data.rows.length; i++) {
          var r = data.rows[i];
          if (!r || !r.receipt_compact) continue;
          out.push({
            id: r.receipt_id || null,
            compact: r.receipt_compact,
            src: r.source,
            i: r.item_id,
            sc: (typeof r.score === 'number') ? r.score : undefined,
            ts: r.recorded_at ? Date.parse(r.recorded_at) : undefined
          });
        }
        return out;
      } catch (_) {
        return [];
      }
    }

  };

  // Auto-flush the offline queue when connectivity returns (intermittent case).
  // Best-effort; never throws. The export→teacher-import path covers the fully
  // disconnected case where 'online' never fires.
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', function () {
        try { /** @type {any} */ (window.gradebookClient).syncOfflineQueue(); } catch (_) { /* best-effort */ }
      });
    }
  } catch (_) { /* best-effort */ }

})();

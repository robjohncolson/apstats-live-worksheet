// gradebook-client.js — AP Stats gradebook ledger feeder client
// Repo root sibling of roster-client.js and roster_config.js.
// Loaded AFTER roster_config.js + roster-client.js.
// Pure browser JS: no build, no imports, no Supabase, no secrets.
// Reads window.ROSTER_SERVICE_URL and window.rosterClient.token() at call time.
//
// Implements FROZEN CONTRACT 3 (GRADEBOOK_PHASE1_BUILD.md):
//   window.gradebookClient.record({ source, itemId, unit, topic, skill, response, score, attempt })
//   → { ok:true, ledgerId } | { ok:false, reason:'no-identity'|'network'|'bad-args' }
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
      list.unshift({
        id: receipt.receiptId,
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

  window.gradebookClient = {

    // Fire-and-forget ledger write.
    // NEVER throws. NEVER rejects. NEVER blocks the caller.
    // Returns a Promise that always resolves to { ok, ... }.
    record: async function (opts) {
      try {
        // --- Validate required args BEFORE touching the network ---
        var source   = opts && opts.source;
        var itemId   = opts && opts.itemId;
        var response = opts && opts.response;

        if (!source || !itemId || response === undefined) {
          return { ok: false, reason: 'bad-args' };
        }

        // --- Read token at call time (decision L-D) ---
        var token = null;
        try {
          if (
            window.rosterClient &&
            window.rosterClient.token &&
            typeof window.rosterClient.token === 'function'
          ) {
            token = window.rosterClient.token();
          }
        } catch (_) {
          // rosterClient.token() threw — treat as no identity
        }

        if (!token) {
          _showNoIdentityNudge(); // surface the dropped write (never silent)
          return { ok: false, reason: 'no-identity' };
        }

        // --- Read service URL at call time ---
        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) {
          console.warn('gradebook-client: ROSTER_SERVICE_URL is not configured');
          return { ok: false, reason: 'network' };
        }

        // --- POST to /ledger/record — no proctor header (decision L-C) ---
        var body = {
          token:    token,
          source:   source,
          itemId:   itemId,
          unit:     opts.unit,
          topic:    opts.topic,
          skill:    opts.skill,
          response: response,
          score:    opts.score,
          attempt:  opts.attempt
        };

        var res = await fetch(baseUrl + '/ledger/record', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body)
        });

        var data = await res.json();

        if (data && data.ok) {
          _captureReceipt(data.receipt, source, itemId, opts.score);
          return { ok: true, ledgerId: data.ledgerId, receipt: data.receipt || null };
        }

        // Server returned ok:false (e.g. 400/401) — treat as network failure
        console.warn('gradebook-client: server returned ok:false', data);
        return { ok: false, reason: 'network' };

      } catch (err) {
        // Catches: fetch rejection, JSON parse error, any other throw
        console.warn('gradebook-client: record failed —', err && err.message);
        return { ok: false, reason: 'network' };
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
          if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
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
    }

  };

})();

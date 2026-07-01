// qr-sync.js — the QR ledger-sync transport (ANDROID_PHASE6_QR_SYNC_SPEC §3.1/§4).
// Pure browser JS (no build, no imports); loaded as a <script> alongside
// qr-fountain.js + ledger-gossip.js + receipt-verify.js.
//
// v1 is a ONE-DIRECTIONAL push: one device SHOWS its signed ledger rows as a
// fountain-coded animated QR ("movie"), another SCANS and ingests them. Because the
// ledger is a content-addressed G-Set (union), a one-way push converges over repeated
// encounters — which fits QR's "one shows, one scans" perfectly, and covers both real
// flows: student→teacher (collect) and teacher→student (per-student handback).
//
// SECURITY: ingest routes every received row through the injected `verify` — which is
// ReceiptVerify.verifyLedgerRow (the BINDING verifier, Phase 6 §0). A forged/re-stapled
// QR row fails the signature↔grade binding and is dropped. QR carries only bytes; bytes
// can't forge a signature. A verify-BUDGET cap (maxRows) bounds the work one scan can
// force (each row is an async Ed25519 verify), so a malicious movie can't DoS the CPU.
//
// window.QrSync:
//   .buildDump(rows)                 -> { bytes, sid, count }   (signed rows only; sid = content hash)
//   .makeShow(rows, {symbolSize})    -> { sid, k, count, frameAt(seq) -> frame }
//   .makeScan({verify, store, maxRows, maxSessions, onProgress}) -> { frame(frame) -> Promise<status> }
//   .serialize(frame) -> string  /  .parse(string) -> frame|null   (what the QR carries)

(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var V = 1;
  var DEFAULT_SYMBOL = 512;   // ~one QR byte-mode frame after framing overhead
  var DEFAULT_MAX_ROWS = 600; // a legit single-student year ledger is a few hundred rows

  // Hard caps on attacker-controlled frame params. A QR frame's k/len/s come straight
  // off an untrusted camera; without these a single crafted frame (huge k or len) makes
  // the decoder allocate GBs and OOM the scanning phone BEFORE any verify runs.
  var S_MAX = 4096;                 // QR byte-mode symbol ceiling
  var K_MAX = 20000;                // source-symbol ceiling
  var MAX_PAYLOAD = 4 * 1024 * 1024;// 4 MiB decoded-payload ceiling (k*s)
  function validParams(k, len, s) {
    return Number.isInteger(k) && Number.isInteger(len) && Number.isInteger(s)
      && k >= 1 && k <= K_MAX && s >= 1 && s <= S_MAX
      && len >= 0 && len <= k * s && k * s <= MAX_PAYLOAD;
  }

  function enc(str) { return new (root.TextEncoder || TextEncoder)().encode(str); }
  function dec(bytes) { return new (root.TextDecoder || TextDecoder)().decode(bytes); }

  // Small non-crypto content hash (FNV-1a, 32-bit → 8 hex) to name a movie: groups a
  // movie's frames and lets a scanner dedupe an already-ingested payload. NOT security —
  // the receipt signatures are (verify-on-ingest handles trust).
  function contentSid(bytes) {
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // Only content-addressed (signed) rows can be verified by a peer, so only those are
  // shipped. Project to the fields the binding verify + grade engine need (keeps the
  // payload — and the movie — small).
  function projectRow(r) {
    return {
      receipt_id: r.receipt_id, receipt_compact: r.receipt_compact,
      source: r.source, item_id: r.item_id, score: r.score,
      attempt: r.attempt, student_id: (r.student_id != null ? r.student_id : r.sid)
    };
  }

  function buildDump(rows) {
    var signed = (Array.isArray(rows) ? rows : []).filter(function (r) {
      return r && r.receipt_compact && r.receipt_id;
    }).map(projectRow);
    var bytes = enc(JSON.stringify({ v: V, t: 'dump', rows: signed }));
    return { bytes: bytes, sid: contentSid(bytes), count: signed.length };
  }

  function makeShow(rows, opts) {
    var s = (opts && opts.symbolSize) || DEFAULT_SYMBOL;
    var dump = buildDump(rows);
    var encr = root.QrFountain.makeEncoder(dump.bytes, { symbolSize: s });
    return {
      sid: dump.sid, k: encr.k, count: dump.count, len: encr.len, symbolSize: s,
      // The frame for the movie's `seq`-th display (seq = 0,1,2,… forever).
      frameAt: function (seq) {
        var sym = encr.symbolAt(seq);
        return { v: V, t: 'dump', sid: dump.sid, k: encr.k, len: encr.len, s: s, seed: sym.seed, data: sym.data };
      }
    };
  }

  function makeScan(opts) {
    opts = opts || {};
    var verify = opts.verify;
    // QR ingest is an UNTRUSTED transport: it must never run without the binding
    // verifier, or forged rows would be stored. Fail loudly at wiring time.
    if (typeof verify !== 'function') throw new Error('QrSync.makeScan requires a verify function (the binding verifier)');
    var store = opts.store;
    var maxRows = (typeof opts.maxRows === 'number') ? opts.maxRows : DEFAULT_MAX_ROWS;
    var maxSessions = (typeof opts.maxSessions === 'number') ? opts.maxSessions : 4;
    var onProgress = (typeof opts.onProgress === 'function') ? opts.onProgress : null;

    var sessions = {};      // sid -> { decoder, k, len, s, symbols }  (ACTIVE/incomplete only)
    var active = [];        // sids of active sessions, oldest first (LRU eviction)
    var seen = {}, seenOrder = [];   // bounded set of already-ingested movie sids

    function markSeen(sid) {
      if (seen[sid]) return;
      seen[sid] = 1; seenOrder.push(sid);
      if (seenOrder.length > 128) delete seen[seenOrder.shift()];
    }
    function dropActive(sid) {
      var i = active.indexOf(sid);
      if (i >= 0) active.splice(i, 1);
      delete sessions[sid];
    }

    function ingestPayload(sid, bytes) {
      // Defense-in-depth: the decoded bytes MUST hash back to the movie's sid. Guards
      // against any future mis-decode feeding garbage to the grade ledger.
      if (contentSid(bytes) !== sid) return Promise.resolve({ done: true, sid: sid, error: 'corrupt', received: 0, rejected: 0 });
      var obj;
      try { obj = JSON.parse(dec(bytes)); }
      catch (e) { return Promise.resolve({ done: true, sid: sid, error: 'parse', received: 0, rejected: 0 }); }
      var rows = (obj && Array.isArray(obj.rows)) ? obj.rows : [];
      var capped = rows.length > maxRows;
      if (capped) rows = rows.slice(0, maxRows);   // verify-budget cap
      markSeen(sid);                               // a real ingest → ignore replays
      return root.LedgerGossip.ingest(rows, { verify: verify, store: store })
        .then(function (res) {
          return { done: true, sid: sid, received: res.accepted, rejected: res.rejected, total: rows.length, capped: capped };
        });
    }

    return {
      // Feed one decoded frame. Returns Promise<status>. status.done=true (with counts)
      // only on the frame that completes a movie; otherwise {done:false, progress}.
      frame: function (f) {
        if (!f || f.t !== 'dump' || f.sid == null) return Promise.resolve({ done: false, ignored: true });
        // Reject a malformed / hostile frame BEFORE allocating any decoder.
        if (!validParams(f.k, f.len, f.s) || !(Number.isInteger(f.seed) && f.seed >= 0)
          || !(f.data && f.data.length === f.s)) {
          return Promise.resolve({ done: false, ignored: true });
        }
        if (seen[f.sid]) return Promise.resolve({ done: true, sid: f.sid, already: true });
        var sess = sessions[f.sid];
        if (sess) {
          // Pin params: a same-sid frame with different k/len/s is a foreign movie
          // (collision / poison attempt) — drop it, don't fold it into a live decoder.
          if (sess.k !== f.k || sess.len !== f.len || sess.s !== f.s) return Promise.resolve({ done: false, ignored: true });
        } else {
          if (active.length >= maxSessions) dropActive(active[0]);  // LRU-evict oldest incomplete
          sess = { decoder: root.QrFountain.makeDecoder(f.k, f.len, f.s), k: f.k, len: f.len, s: f.s, symbols: 0 };
          sessions[f.sid] = sess; active.push(f.sid);
        }
        sess.symbols += 1;
        var complete;
        try { complete = sess.decoder.add(f.seed, f.data); }
        catch (e) { dropActive(f.sid); return Promise.resolve({ done: false, sid: f.sid, error: 'decode' }); }
        if (onProgress) { try { onProgress({ sid: f.sid, symbols: sess.symbols, k: f.k, complete: complete }); } catch (_) {} }
        if (!complete) return Promise.resolve({ done: false, sid: f.sid, symbols: sess.symbols, k: f.k });
        var bytes;
        try { bytes = sess.decoder.result(); }
        catch (e) { dropActive(f.sid); return Promise.resolve({ done: true, sid: f.sid, error: 'decode', received: 0, rejected: 0 }); }
        dropActive(f.sid);
        return ingestPayload(f.sid, bytes);
      }
    };
  }

  // ── Wire form: what a single QR actually carries ──────────────────────────────
  // "Q1|dump|<sid>|<k>|<len>|<s>|<seed>|<base64 symbol>". base64 (not raw byte-mode) is
  // the v1 wire; §5 notes byte-mode framing reclaims the 4/3 tax — a later optimization.
  function b64enc(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return root.btoa ? root.btoa(s) : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : s);
  }
  function b64dec(str) {
    var bin = root.atob ? root.atob(str) : (typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64').toString('binary') : str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function serialize(f) {
    return ['Q' + V, f.t, f.sid, f.k, f.len, f.s, f.seed, b64enc(f.data)].join('|');
  }
  function parse(str) {
    if (typeof str !== 'string' || str.slice(0, 3) !== 'Q' + V + '|') return null;
    var p = str.split('|');
    if (p.length !== 8 || p[1] !== 'dump') return null;
    var k = +p[3], len = +p[4], s = +p[5], seed = +p[6];
    if (!validParams(k, len, s) || !(Number.isInteger(seed) && seed >= 0)) return null;
    var data;
    try { data = b64dec(p[7]); } catch (e) { return null; }
    if (!data || data.length !== s) return null;   // symbol must be exactly s bytes
    return { v: V, t: 'dump', sid: p[2], k: k, len: len, s: s, seed: seed, data: data };
  }

  root.QrSync = {
    VERSION: V,
    buildDump: buildDump,
    contentSid: contentSid,
    makeShow: makeShow,
    makeScan: makeScan,
    serialize: serialize,
    parse: parse
  };
})();

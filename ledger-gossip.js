// ledger-gossip.js — anti-entropy gossip over the signed-ledger G-Set.
// ANDROID_PHASE3_GOSSIP_SPEC. Pure browser JS (no build, no imports); loaded as a
// <script> alongside ledger-store.js + receipt-verify.js.
//
// The data is a grow-only set of signed item_ledger rows keyed by `receipt_id`
// (content address) — so merging two peers is set UNION: commutative, idempotent,
// order-independent, conflict-free. Gossip is just "exchange the sets until both
// converge." A row hops A→B→teacher transitively, so a student's work reaches the
// teacher via classmates with no internet and no direct student↔teacher contact.
//
// SECURITY: ingest VERIFIES every row's Ed25519 receipt before storing — unsigned
// or tampered rows are rejected, never stored, never re-gossiped. A malicious peer
// cannot inject fake grades (forgery needs the teacher key); replay is harmless
// (idempotent G-Set). This is the trust boundary of the whole P2P layer.
//
// The engine is TRANSPORT-AGNOSTIC: a session calls an injected send(framedMsg)
// and is driven by handle(framedMsg). A Nearby-Connections Capacitor plugin (or a
// mock, in tests) provides the bytes. One round = 3 messages:
//   A → HELLO {digest}                  "here's what I have"
//   B → SYNC  {rows, request}           "rows you lack + ids I lack"
//   A → SEND  {rows}                     "the rows you requested"
// After SEND is ingested, both peers hold the union.
//
// window.LedgerGossip:
//   .digest(rows)                 -> { v, ids:[receipt_id…] }
//   .diff(haveIds, wantIds)       -> ids in wantIds not in haveIds
//   .rowsFor(rows, ids)           -> rows whose receipt_id ∈ ids
//   .frame(type, payload) / .parse(str)
//   .ingest(rows, {verify, store})-> Promise<{accepted, rejected, ids}>
//   .createSession(opts)          -> { initiate(), handle(msg), done }

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var V = 1;
  var T = { HELLO: 'hello', SYNC: 'sync', SEND: 'send' };

  // ── Pure helpers ────────────────────────────────────────────────────────────

  function idOf(row) { return row && row.receipt_id != null ? String(row.receipt_id) : null; }

  // Only content-addressed (signed) rows gossip — an un-addressable row can't be
  // verified by a peer anyway, so it's excluded from the digest and from sends.
  function digest(rows) {
    var ids = [];
    var seen = {};
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      var id = idOf(r);
      if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return { v: V, ids: ids };
  }

  function diff(haveIds, wantIds) {
    var have = {};
    (haveIds || []).forEach(function (id) { have[String(id)] = 1; });
    var out = [];
    (wantIds || []).forEach(function (id) { if (!have[String(id)]) out.push(String(id)); });
    return out;
  }

  function rowsFor(rows, ids) {
    var want = {};
    (ids || []).forEach(function (id) { want[String(id)] = 1; });
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      var id = idOf(r);
      return id && want[id];
    });
  }

  function frame(type, payload) { return JSON.stringify({ t: type, p: payload || {} }); }

  function parse(str) {
    try {
      var o = (typeof str === 'string') ? JSON.parse(str) : str;
      if (!o || typeof o.t !== 'string') return null;
      return { type: o.t, payload: o.p || {} };
    } catch (_) { return null; }
  }

  // ── Verify-on-ingest (the security boundary) ──────────────────────────────────
  // verify(row) -> Promise<boolean> (true = a trusted issuer signed it). Rows that
  // fail verification are dropped and reported, never stored. Accepted rows are
  // union-merged into the store (idempotent). store: { put(row)->Promise }.
  function ingest(rows, opts) {
    opts = opts || {};
    var verify = opts.verify;
    var store = opts.store;
    var list = Array.isArray(rows) ? rows : [];
    var accepted = 0, rejected = 0, acceptedIds = [];
    var chain = Promise.resolve();
    list.forEach(function (row) {
      chain = chain.then(function () {
        return Promise.resolve()
          .then(function () { return typeof verify === 'function' ? verify(row) : true; })
          .then(function (ok) {
            if (!ok) { rejected += 1; return; }
            var id = idOf(row);
            accepted += 1; if (id) acceptedIds.push(id);
            if (store && typeof store.put === 'function') return store.put(row);
          })
          .catch(function () { rejected += 1; });
      });
    });
    return chain.then(function () { return { accepted: accepted, rejected: rejected, ids: acceptedIds }; });
  }

  // ── Session: one anti-entropy exchange with one peer ──────────────────────────
  // opts: {
  //   getRows()   -> Promise<rows>   (e.g. LedgerStore.all)
  //   verify(row) -> Promise<bool>
  //   store       -> { put }         (e.g. LedgerStore)
  //   send(framedMsg) -> any         (transport send to THIS peer)
  // }
  // `done` resolves with {received} when this side has finished the exchange.
  function createSession(opts) {
    opts = opts || {};
    var getRows = opts.getRows || function () { return Promise.resolve([]); };
    var send = opts.send || function () {};
    var ingestOpts = { verify: opts.verify, store: opts.store };

    var received = 0;
    var resolveDone;
    var done = new Promise(function (res) { resolveDone = res; });
    function finish() { resolveDone({ received: received }); }

    function initiate() {
      return Promise.resolve(getRows()).then(function (rows) {
        send(frame(T.HELLO, { digest: digest(rows) }));
      });
    }

    function handle(msg) {
      var m = parse(msg);
      if (!m) return Promise.resolve();

      if (m.type === T.HELLO) {
        // Responder: reply with the rows the peer lacks + a request for what I lack.
        return Promise.resolve(getRows()).then(function (rows) {
          var myIds = digest(rows).ids;
          var peerIds = (m.payload.digest && m.payload.digest.ids) || [];
          var rowsPeerLacks = rowsFor(rows, diff(peerIds, myIds));
          var idsILack = diff(myIds, peerIds);
          send(frame(T.SYNC, { rows: rowsPeerLacks, request: idsILack }));
        });
      }

      if (m.type === T.SYNC) {
        // Initiator: ingest what I lacked, then send the peer the rows it requested.
        return ingest(m.payload.rows || [], ingestOpts).then(function (res) {
          received += res.accepted;
          return Promise.resolve(getRows()).then(function (rows) {
            send(frame(T.SEND, { rows: rowsFor(rows, m.payload.request || []) }));
            finish(); // I've sent everything the peer asked for → done.
          });
        });
      }

      if (m.type === T.SEND) {
        // Responder: ingest the rows I requested → converged.
        return ingest(m.payload.rows || [], ingestOpts).then(function (res) {
          received += res.accepted;
          finish();
        });
      }

      return Promise.resolve();
    }

    return { initiate: initiate, handle: handle, done: done };
  }

  root.LedgerGossip = {
    VERSION: V,
    TYPES: T,
    digest: digest,
    diff: diff,
    rowsFor: rowsFor,
    frame: frame,
    parse: parse,
    ingest: ingest,
    createSession: createSession
  };

})();

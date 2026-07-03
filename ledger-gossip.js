// @ts-check
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

  /** @param {LedgerRow | SubmissionRow | null | undefined} row @returns {string | null} */
  function idOf(row) { return row && row.receipt_id != null ? String(row.receipt_id) : null; }

  // Only content-addressed (signed) rows gossip — an un-addressable row can't be
  // verified by a peer anyway, so it's excluded from the digest and from sends.
  /**
   * @param {Array<LedgerRow | SubmissionRow>} rows
   * @returns {{v: number, ids: string[]}}
   */
  function digest(rows) {
    var ids = [];
    /** @type {Record<string, number>} */
    var seen = {};
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      var id = idOf(r);
      if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return { v: V, ids: ids };
  }

  /** @param {string[]} haveIds @param {string[]} wantIds @returns {string[]} ids in wantIds missing from haveIds */
  function diff(haveIds, wantIds) {
    /** @type {Record<string, number>} */
    var have = {};
    (haveIds || []).forEach(function (id) { have[String(id)] = 1; });
    var out = [];
    (wantIds || []).forEach(function (id) { if (!have[String(id)]) out.push(String(id)); });
    return out;
  }

  /**
   * @param {Array<LedgerRow | SubmissionRow>} rows
   * @param {string[]} ids
   * @returns {Array<LedgerRow | SubmissionRow>} rows whose receipt_id ∈ ids
   */
  function rowsFor(rows, ids) {
    /** @type {Record<string, number>} */
    var want = {};
    (ids || []).forEach(function (id) { want[String(id)] = 1; });
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      var id = idOf(r);
      return id && want[id];
    });
  }

  // Frames are {t, p}. A `lane` tag rides ONLY when the caller sets one
  // (OFFLINE_GRADING_MESH_SPEC §0.6, so a grades peer and a submissions peer don't
  // cross-feed digests). When lane is falsy the frame is BYTE-IDENTICAL to the
  // pre-mesh shape — existing grades gossip and its wire tests are unaffected.
  /**
   * @param {string} type
   * @param {object} payload
   * @param {string | null} [lane]
   * @returns {string}
   */
  function frame(type, payload, lane) {
    /** @type {{t: string, p: object, lane?: string}} */
    var o = { t: type, p: payload || {} };
    if (lane) o.lane = lane;
    return JSON.stringify(o);
  }

  /**
   * A parsed gossip frame. `payload` is untrusted until ingest verifies its rows.
   * @typedef {{type: string, payload: any, lane: string | null}} GossipFrame
   */
  /** @param {string | object} str @returns {GossipFrame | null} */
  function parse(str) {
    try {
      var o = (typeof str === 'string') ? JSON.parse(str) : str;
      if (!o || typeof o.t !== 'string') return null;
      return { type: o.t, payload: o.p || {}, lane: (typeof o.lane === 'string' ? o.lane : null) };
    } catch (_) { return null; }
  }

  // ── Verify-on-ingest (the security boundary) ──────────────────────────────────
  // verify(row) -> Promise<boolean> (true = a trusted issuer signed it). Rows that
  // fail verification are dropped and reported, never stored. Accepted rows are
  // union-merged into the store (idempotent). store: { put(row)->Promise }.
  /**
   * @param {Array<LedgerRow | SubmissionRow>} rows
   * @param {{verify?: RowVerifier, store?: GossipStore}} [opts]
   * @returns {Promise<{accepted: number, rejected: number, ids: string[]}>}
   */
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
          // Fail CLOSED: no verifier → reject. A trust boundary must never accept
          // unverified rows just because a caller forgot to wire the verifier.
          .then(function () { return typeof verify === 'function' ? verify(row) : false; })
          .then(function (ok) {
            if (!ok) { rejected += 1; return; }
            // Count accepted only AFTER the row is durably stored: a rejecting
            // store.put previously landed the row in BOTH tallies (the trailing
            // catch) and offered its id as converged when it never persisted.
            return Promise.resolve(store && typeof store.put === 'function' ? store.put(row) : undefined)
              .then(function () {
                var id = idOf(row);
                accepted += 1; if (id) acceptedIds.push(id);
              });
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
  /**
   * One anti-entropy exchange with one peer (createSession's return).
   * @typedef {Object} GossipSession
   * @property {() => Promise<void>} initiate - send HELLO with my digest
   * @property {(msg: string) => Promise<void>} handle - drive the exchange with an incoming framed message
   * @property {Promise<{received: number}>} done
   */
  /**
   * @param {{getRows?: () => any, verify?: RowVerifier, store?: GossipStore, send?: (msg: string) => void, lane?: string | null}} [opts]
   * @returns {GossipSession}
   */
  function createSession(opts) {
    opts = opts || {};
    var getRows = opts.getRows || function () { return Promise.resolve([]); };
    /** @type {(msg: string) => void} */
    var send = opts.send || function () {};
    var ingestOpts = { verify: opts.verify, store: opts.store };
    // opts.lane (mesh §0.6): when set, stamp it onto every outgoing frame and
    // DEFENSIVELY ignore any incoming frame of a different lane. Unset → the
    // pre-mesh behavior exactly (no stamp, accept every frame).
    var lane = opts.lane || null;

    var received = 0;
    var resolveDone;
    /** @type {Promise<{received: number}>} */
    var done = new Promise(function (res) { resolveDone = res; });
    function finish() { resolveDone({ received: received }); }

    function initiate() {
      return Promise.resolve(getRows()).then(function (rows) {
        send(frame(T.HELLO, { digest: digest(rows) }, lane));
      });
    }

    function handle(msg) {
      var m = parse(msg);
      if (!m) return Promise.resolve();
      // Lane isolation: a lane-scoped session ignores other lanes' frames. A
      // lane-less (legacy) session accepts everything, as before.
      if (lane && m.lane && m.lane !== lane) return Promise.resolve();

      if (m.type === T.HELLO) {
        // Responder: reply with the rows the peer lacks + a request for what I lack.
        return Promise.resolve(getRows()).then(function (rows) {
          var myIds = digest(rows).ids;
          // (casts: `m` is null-checked at the top of handle, but tsc can't carry a `var`'s narrowing into a callback)
          var peerIds = (/** @type {GossipFrame} */ (m).payload.digest && /** @type {GossipFrame} */ (m).payload.digest.ids) || [];
          var rowsPeerLacks = rowsFor(rows, diff(peerIds, myIds));
          var idsILack = diff(myIds, peerIds);
          send(frame(T.SYNC, { rows: rowsPeerLacks, request: idsILack }, lane));
        });
      }

      if (m.type === T.SYNC) {
        // Initiator: ingest what I lacked, then send the peer the rows it requested.
        return ingest(m.payload.rows || [], ingestOpts).then(function (res) {
          received += res.accepted;
          return Promise.resolve(getRows()).then(function (rows) {
            send(frame(T.SEND, { rows: rowsFor(rows, /** @type {GossipFrame} */ (m).payload.request || []) }, lane));
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

  // Drive one time-boxed anti-entropy ROUND over a GossipTransport: create a session
  // per discovered peer, initiate, route incoming messages, and after durationMs stop
  // + resolve {available, peers, received}. Shared by the Desk + the phone launcher.
  // transport: { start({onPeer,onMessage,onLost}), send(peerId,msg), stop() }.
  // opts: { getRows, store, verify, durationMs, onPeer, setTimeout }.
  /**
   * Options for one gossip round.
   * @typedef {{getRows?: () => any, verify?: RowVerifier, store?: GossipStore, durationMs?: number, onPeer?: (id: string) => void, setTimeout?: (fn: () => void, ms: number) => any}} GossipRoundOpts
   */
  /**
   * @param {GossipTransport} transport
   * @param {GossipRoundOpts} [opts]
   * @returns {Promise<{available: boolean, peers?: number, received?: number}>}
   */
  function runRound(transport, opts) {
    opts = opts || {};
    if (!transport || typeof transport.start !== 'function') return Promise.resolve({ available: false });
    var sessions = /** @type {Record<string, GossipSession>} */ ({}), peers = 0, received = 0;
    function ensure(peerId) {
      if (sessions[peerId]) return sessions[peerId];
      peers += 1;
      var sess = createSession({
        // (casts: `opts` is defaulted at the top of runRound, but `ensure` is a hoisted
        // declaration, so tsc can't carry that narrowing in here)
        getRows: /** @type {GossipRoundOpts} */ (opts).getRows,
        verify: /** @type {GossipRoundOpts} */ (opts).verify,
        store: /** @type {GossipRoundOpts} */ (opts).store,
        send: function (m) { try { transport.send(peerId, m); } catch (_) {} }
      });
      sess.done.then(function (r) { received += (r && r.received) || 0; }).catch(function () {});
      sessions[peerId] = sess;
      return sess;
    }
    try {
      transport.start({
        onPeer: function (id) { if (id) { ensure(id).initiate(); if (typeof opts.onPeer === 'function') opts.onPeer(id); } },
        onMessage: function (id, msg) { if (id) ensure(id).handle(msg); },
        onLost: function (id) { if (id) delete sessions[id]; }
      });
    } catch (_) {}
    var timer = opts.setTimeout || ((typeof setTimeout !== 'undefined') ? setTimeout : (typeof root.setTimeout !== 'undefined' ? root.setTimeout : null));
    return new Promise(function (resolve) {
      var ms = (typeof opts.durationMs === 'number') ? opts.durationMs : 15000;
      timer(function () {
        try { transport.stop(); } catch (_) {}
        resolve({ available: true, peers: peers, received: received });
      }, ms);
    });
  }

  // Multi-lane round (mesh §0.6): carry SEVERAL lanes over ONE transport session
  // per peer, so a single Nearby discovery syncs both the grades and submissions
  // G-Sets. Each lane has its own {getRows, verify, store}; incoming frames are
  // demuxed by their `lane` tag to the matching per-(peer,lane) session, and each
  // session only accepts/relays its own lane's rows (verify-on-ingest stays the
  // trust boundary — a submission offered to the grades lane fails grades verify).
  //   lanes: [{ lane:'grades'|'subs', getRows, verify, store }]
  // A frame with no lane tag routes to the FIRST lane (back-compat with a peer
  // still speaking the pre-mesh, lane-less protocol — that peer only knows grades).
  /**
   * Per-lane config for runLanes: one G-Set's row source + its own trust boundary.
   * @typedef {{lane: string, getRows?: () => any, verify?: RowVerifier, store?: GossipStore}} GossipLane
   */
  /**
   * @param {GossipTransport} transport
   * @param {{lanes?: GossipLane[], durationMs?: number, onPeer?: (id: string) => void, setTimeout?: (fn: () => void, ms: number) => any}} [opts]
   * @returns {Promise<{available: boolean, peers?: number, received?: number, byLane?: Record<string, number>}>}
   */
  function runLanes(transport, opts) {
    opts = opts || {};
    var lanes = Array.isArray(opts.lanes) ? opts.lanes.filter(function (l) { return l && l.lane; }) : [];
    if (!transport || typeof transport.start !== 'function' || !lanes.length) {
      return Promise.resolve({ available: false });
    }
    var defaultLane = lanes[0].lane;
    /** @type {Record<string, Record<string, GossipSession>>} */
    var byPeer = {};   // peerId -> { laneName -> session }
    var peers = 0;
    /** @type {Record<string, number>} */
    var received = {}; // laneName -> count
    lanes.forEach(function (l) { received[l.lane] = 0; });

    function laneCfg(name) {
      for (var i = 0; i < lanes.length; i++) if (lanes[i].lane === name) return lanes[i];
      return null;
    }
    function ensurePeer(peerId) {
      if (byPeer[peerId]) return byPeer[peerId];
      peers += 1;
      byPeer[peerId] = {};
      return byPeer[peerId];
    }
    function sessionFor(peerId, laneName) {
      var peer = ensurePeer(peerId);
      if (peer[laneName]) return peer[laneName];
      var cfg = laneCfg(laneName);
      if (!cfg) return null;
      var sess = createSession({
        lane: cfg.lane,
        getRows: cfg.getRows,
        verify: cfg.verify,
        store: cfg.store,
        send: function (m) { try { transport.send(peerId, m); } catch (_) {} }
      });
      // (cast: `cfg` is null-checked above, but tsc can't carry a `var`'s narrowing into a callback)
      sess.done.then(function (r) { received[/** @type {GossipLane} */ (cfg).lane] += (r && r.received) || 0; }).catch(function () {});
      peer[laneName] = sess;
      return sess;
    }
    try {
      transport.start({
        onPeer: function (id) {
          if (!id) return;
          ensurePeer(id);
          // Open every lane to the new peer (each initiates its own HELLO).
          lanes.forEach(function (l) { var s = sessionFor(id, l.lane); if (s) s.initiate(); });
          if (typeof opts.onPeer === 'function') opts.onPeer(id);
        },
        onMessage: function (id, msg) {
          if (!id) return;
          var m = parse(msg);
          var laneName = (m && m.lane) ? m.lane : defaultLane;   // lane-less → grades
          var s = sessionFor(id, laneName);
          if (s) s.handle(msg);
        },
        onLost: function (id) { if (id) delete byPeer[id]; }
      });
    } catch (_) {}
    var timer = opts.setTimeout || ((typeof setTimeout !== 'undefined') ? setTimeout : (typeof root.setTimeout !== 'undefined' ? root.setTimeout : null));
    return new Promise(function (resolve) {
      var ms = (typeof opts.durationMs === 'number') ? opts.durationMs : 15000;
      timer(function () {
        try { transport.stop(); } catch (_) {}
        var total = 0;
        Object.keys(received).forEach(function (k) { total += received[k]; });
        resolve({ available: true, peers: peers, received: total, byLane: received });
      }, ms);
    });
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
    createSession: createSession,
    runRound: runRound,
    runLanes: runLanes
  };

})();

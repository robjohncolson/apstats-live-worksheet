// submission-store.js — the SUBMISSIONS G-Set for the offline-grading mesh
// (OFFLINE_GRADING_MESH_SPEC.md §2, §0.6, §0.7). The second lane's durable store,
// deliberately SEPARATE from ledger-store.js (the grades lane) — the two lanes
// never share a store, a key space, or a verifier (§0.1).
//
// A submission is a student-self-signed record of RAW work: { source, item_id,
// student_id, response, attempt, recorded_at, receipt_id, receipt_compact } where
// the receipt is a t:'submission' Ed25519 receipt signed by the STUDENT's device
// key. Like the grades G-Set it is grow-only, content-addressed by receipt_id,
// union-merge — so gossip converges regardless of order/transport.
//
// Grade-gated SUPPRESSION (§0.7, replaces "pruning" which resurrects forever in a
// G-Set): a submission is "covered" once a teacher GRADE that references it exists
// locally. Covered submissions LEAVE getRows()/the digest (rowsForGossip — they stop
// being offered) AND are rejected on ingest (suppressingVerify — they stop being
// re-accepted). Grade-presence is grow-only, so the covered predicate is monotone →
// every device converges to "suppressed." The row itself is NOT deleted from the
// store (deletion would resurrect via a peer's digest); it is just filtered from
// what we offer and refused when re-offered.
//
// A teacher grade references its submission via a `sub` field in the signed grade
// payload = the submission's receipt_id (Phase 3 mints this). Until such grades
// exist, nothing is suppressed (safe: submissions keep gossiping until graded).
// Cross-student griefing is blocked: a grade only covers a submission with the SAME
// student_id.
//
// window.SubmissionStore: keyOf, tsOf, mergeRow, mergeAll, put, putAll, all, clear,
//   coveredKeys(gradesRows), rowsForGossip(gradesRows), isCovered(row, coveredSet).

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var DB_NAME = 'apstats_submissions_v1';
  var STORE = 'rows';

  function attemptOf(row) { return (row && row.attempt != null) ? row.attempt : 1; }

  // Content address first (receipt_id = hash of the signed payload). A submission
  // ALWAYS carries a receipt (it can only exist self-signed), so the fallback key
  // is just belt-and-suspenders for a malformed row.
  function keyOf(row) {
    if (row && row.receipt_id) return 'r:' + String(row.receipt_id);
    return 'k:' + String(row && row.student_id) + '|' + String(row && row.item_id) + '|' + String(attemptOf(row));
  }

  function tsOf(row) {
    if (!row) return 0;
    if (typeof row.ts === 'number' && isFinite(row.ts)) return row.ts;
    if (row.recorded_at) { var t = Date.parse(row.recorded_at); if (isFinite(t)) return t; }
    return 0;
  }

  function pickNewer(prev, next) { return tsOf(next) >= tsOf(prev) ? next : prev; }

  function mergeRow(list, row) {
    var out = Array.isArray(list) ? list.slice() : [];
    var k = keyOf(row);
    for (var i = 0; i < out.length; i++) {
      if (keyOf(out[i]) === k) { out[i] = pickNewer(out[i], row); return out; }
    }
    out.push(row);
    return out;
  }

  function mergeAll(list, rows) {
    var out = Array.isArray(list) ? list.slice() : [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) out = mergeRow(out, rows[i]);
    return out;
  }

  // ── The set of covered submission receipt_ids, from local GRADE rows (§0.7) ────
  // A grade covers a submission iff its signed payload names that submission
  // (`sub` = the submission's receipt_id) AND both are the SAME student (no
  // cross-student griefing). We read `sub` from the DECODED signed payload, not a
  // top-level row field, so a peer cannot forge coverage by editing the row — the
  // grade's own signature is verified elsewhere (verifyLedgerRow) before it is
  // stored, and here we only trust its receipt_compact payload.
  function decodePayload(row) {
    try {
      var compact = row && row.receipt_compact;
      if (typeof compact !== 'string') return null;
      var parts = compact.split('.');
      if (parts.length !== 2) return null;
      var b = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var json = (typeof atob === 'function') ? atob(b)
        : (typeof Buffer !== 'undefined' ? Buffer.from(b, 'base64').toString('binary') : null);
      if (json == null) return null;
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (_) { return null; }
  }

  function coveredKeys(gradesRows) {
    var set = {};
    (Array.isArray(gradesRows) ? gradesRows : []).forEach(function (g) {
      var p = decodePayload(g);
      if (!p || p.t !== 'ledger' || p.sub == null) return;
      var gsid = (g && g.student_id != null) ? g.student_id : p.sid;
      set[String(p.sub)] = String(gsid == null ? '' : gsid);
    });
    return set;   // { submissionReceiptId: coveringStudentId }
  }

  // A submission is covered iff the covered-set names its receipt_id AND the
  // covering grade is for the same student.
  function isCovered(row, covered) {
    if (!row || !covered) return false;
    var rid = row.receipt_id != null ? String(row.receipt_id) : null;
    if (!rid || !(rid in covered)) return false;
    var sub = String(row.student_id == null ? '' : row.student_id);
    return covered[rid] === sub;
  }

  // ── Storage adapter (IndexedDB, in-memory fallback) ───────────────────────────
  function makeMemStore() {
    var map = new Map();
    return {
      get: function (k) { return Promise.resolve(map.has(k) ? map.get(k) : null); },
      put: function (k, v) { map.set(k, v); return Promise.resolve(); },
      getAll: function () { return Promise.resolve(Array.from(map.values())); },
      clear: function () { map.clear(); return Promise.resolve(); }
    };
  }

  function makeIdbStore() {
    var idb = (typeof root.indexedDB !== 'undefined') ? root.indexedDB : null;
    if (!idb) return null;
    function open() {
      return new Promise(function (resolve, reject) {
        var req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: '_k' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, mode);
          var s = t.objectStore(STORE);
          var box = fn(s);
          t.oncomplete = function () { resolve(box && box._result !== undefined ? box._result : undefined); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      });
    }
    return {
      get: function (k) { return tx('readonly', function (s) { var box = {}; var r = s.get(k); r.onsuccess = function () { box._result = r.result ? r.result.v : null; }; return box; }); },
      put: function (k, v) { return tx('readwrite', function (s) { s.put({ _k: k, v: v }); return {}; }); },
      getAll: function () { return tx('readonly', function (s) { var box = {}; var r = s.getAll(); r.onsuccess = function () { box._result = (r.result || []).map(function (row) { return row.v; }); }; return box; }); },
      clear: function () { return tx('readwrite', function (s) { s.clear(); return {}; }); }
    };
  }

  var _store = null;
  function store() { if (!_store) _store = makeIdbStore() || makeMemStore(); return _store; }

  function put(row) {
    if (!row) return Promise.resolve(null);
    var s = store();
    var k = keyOf(row);
    return s.get(k).then(function (existing) {
      var merged = existing ? pickNewer(existing, row) : row;
      return s.put(k, merged).then(function () { return merged; });
    });
  }
  function putAll(rows) {
    if (!Array.isArray(rows) || !rows.length) return Promise.resolve(0);
    var chain = Promise.resolve(), n = 0;
    rows.forEach(function (row) { chain = chain.then(function () { return put(row).then(function () { n += 1; }); }); });
    return chain.then(function () { return n; });
  }
  function all() { return store().getAll(); }
  function clear() { return store().clear(); }

  // What to gossip: every stored submission EXCEPT those a local grade covers.
  // Accepts the grades G-Set as an ARRAY or a Promise of one (LedgerStore.all()
  // returns a Promise) — resolving here means a caller can't accidentally pass the
  // unresolved Promise and silently disable suppression.
  function rowsForGossip(gradesRows) {
    return Promise.resolve(gradesRows).then(function (grades) {
      var covered = coveredKeys(grades);
      return all().then(function (rows) {
        return rows.filter(function (r) { return !isCovered(r, covered); });
      });
    });
  }

  // §0.7 reject-on-ingest: wrap a base row verifier so a covered submission is
  // refused (returns false) BEFORE the signature check even runs. `coveredSet`
  // comes from coveredKeys(gradesRows), snapshotted once per round (monotone, so a
  // stale snapshot only under-suppresses by one round — never wrongly suppresses).
  function suppressingVerify(baseVerify, coveredSet) {
    return function (row) {
      if (isCovered(row, coveredSet)) return Promise.resolve(false);
      return Promise.resolve(typeof baseVerify === 'function' ? baseVerify(row) : false);
    };
  }

  root.SubmissionStore = {
    keyOf: keyOf,
    tsOf: tsOf,
    mergeRow: mergeRow,
    mergeAll: mergeAll,
    put: put,
    putAll: putAll,
    all: all,
    clear: clear,
    coveredKeys: coveredKeys,
    isCovered: isCovered,
    rowsForGossip: rowsForGossip,
    suppressingVerify: suppressingVerify,
    _DB_NAME: DB_NAME
  };

})();

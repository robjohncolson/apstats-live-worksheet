// qr-fountain.js — LT (Luby Transform) fountain codec for animated-QR transfer.
// ANDROID_PHASE6_QR_SYNC_SPEC §3.3. Pure browser JS (no build, no imports); loaded as
// a <script> alongside qr-sync.js.
//
// A payload bigger than one QR is split into K source symbols; the ENCODER emits an
// ENDLESS stream of encoded symbols (each = XOR of a seed-chosen subset of source
// symbols). The DECODER holds the camera on the "QR movie" and recovers the payload
// once it has collected enough symbols — ORDER-INDEPENDENT and DROP-TOLERANT, so a
// missed frame or a wandering camera just costs a few more frames, never a restart.
//
// A frame carries only {seed, k, len, s, data}: the (degree, source-indices) of a
// symbol are DERIVED from `seed` by the same seeded PRNG on both sides, so the wire
// never ships the index list. Degrees follow the Robust Soliton distribution (a
// function of K only), which keeps a healthy supply of degree-1 symbols to bootstrap
// the peeling decode.
//
// window.QrFountain:
//   .chunk(bytes, s)                 -> { k, blocks:[Uint8Array(s)] }  (last padded)
//   .makeEncoder(bytes, {symbolSize})-> { k, len, symbolSize, symbolAt(seq)->{seed,data} }
//   .makeDecoder(k, len, s)          -> { add(seed,data)->done, complete(), result()->Uint8Array|null }

(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  // Deterministic PRNG seeded by a uint32 — identical on encoder + decoder.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Robust Soliton degree CDF — a pure function of K, cached. Both sides compute the
  // same CDF, so sampling with the seed's PRNG yields the same degree on each side.
  var _cdf = {};
  function degreeCdf(k) {
    if (_cdf[k]) return _cdf[k];
    var c = 0.03, delta = 0.5, d;
    var R = c * Math.log(k / delta) * Math.sqrt(k);
    if (!isFinite(R) || R < 1) R = 1;
    var rho = new Array(k + 1), tau = new Array(k + 1);
    rho[1] = 1 / k;
    for (d = 2; d <= k; d++) rho[d] = 1 / (d * (d - 1));
    for (d = 1; d <= k; d++) tau[d] = 0;
    var pivot = Math.floor(k / R);
    for (d = 1; d < pivot; d++) tau[d] = R / (d * k);
    if (pivot >= 1 && pivot <= k) tau[pivot] = (R * Math.log(R / delta)) / k;
    var Z = 0;
    for (d = 1; d <= k; d++) Z += rho[d] + tau[d];
    var cdf = new Array(k + 1), acc = 0;
    for (d = 1; d <= k; d++) { acc += (rho[d] + tau[d]) / Z; cdf[d] = acc; }
    cdf[k] = 1; // guard against float drift
    _cdf[k] = cdf;
    return cdf;
  }

  function sampleDegree(rng, k) {
    if (k <= 1) return 1;
    var cdf = degreeCdf(k), x = rng();
    for (var d = 1; d <= k; d++) if (x < cdf[d]) return d;
    return k;
  }

  // `degree` distinct source indices in [0,k), drawn from the seeded PRNG.
  function pickIndices(rng, k, degree) {
    if (degree >= k) { var all = []; for (var i = 0; i < k; i++) all.push(i); return all; }
    var seen = {}, out = [];
    while (out.length < degree) {
      var j = Math.floor(rng() * k);
      if (j >= k) j = k - 1;
      if (!seen[j]) { seen[j] = 1; out.push(j); }
    }
    return out;
  }

  // The (degree, indices) a given seed maps to — the shared encode/decode contract.
  function indicesForSeed(seed, k) {
    var rng = mulberry32(seed >>> 0);
    return pickIndices(rng, k, sampleDegree(rng, k));
  }

  function xorInto(dst, src) { for (var i = 0; i < dst.length; i++) dst[i] ^= src[i]; }

  function chunk(bytes, s) {
    var k = Math.max(1, Math.ceil(bytes.length / s));
    var blocks = [];
    for (var b = 0; b < k; b++) {
      var blk = new Uint8Array(s);
      blk.set(bytes.subarray(b * s, Math.min(bytes.length, (b + 1) * s)));
      blocks.push(blk);
    }
    return { k: k, blocks: blocks };
  }

  function makeEncoder(bytes, opts) {
    var s = (opts && opts.symbolSize) || 512;
    var c = chunk(bytes, s);
    return {
      k: c.k, len: bytes.length, symbolSize: s,
      // Deterministic symbol for sequence number `seq` (seed = seq). Emit seq = 0,1,2,…
      // forever for an endless movie.
      symbolAt: function (seq) {
        var idx = indicesForSeed(seq, c.k);
        var val = new Uint8Array(s);
        for (var j = 0; j < idx.length; j++) xorInto(val, c.blocks[idx[j]]);
        return { seed: seq >>> 0, data: val };
      }
    };
  }

  // Peeling (belief-propagation) decoder. add() returns true once the whole payload is
  // recoverable; result() then reassembles it.
  function makeDecoder(k, len, s) {
    // Safety net for direct callers: bound params so bad input can't allocate a
    // giant array or throw a raw RangeError. qr-sync.js enforces tighter caps upstream.
    if (!(k >= 1 && k <= 1e6 && s >= 1 && s <= 65536 && len >= 0 && len <= k * s)) {
      throw new Error('QrFountain.makeDecoder: params out of range');
    }
    var blocks = new Array(k), recovered = 0, pending = [];

    function reduceKnown(sym) {
      for (var p = sym.idx.length - 1; p >= 0; p--) {
        var i = sym.idx[p];
        if (blocks[i] != null) { xorInto(sym.val, blocks[i]); sym.idx.splice(p, 1); }
      }
    }

    function peel() {
      var progressed = true;
      while (progressed) {
        progressed = false;
        for (var q = 0; q < pending.length; q++) {
          var sym = pending[q];
          if (sym.idx.length === 0) { pending.splice(q, 1); q--; continue; }
          if (sym.idx.length !== 1) continue;
          var i = sym.idx[0];
          pending.splice(q, 1); q--;
          if (blocks[i] == null) {
            blocks[i] = sym.val; recovered += 1;
            // Peel this newly-known block out of every other pending symbol.
            for (var r = 0; r < pending.length; r++) {
              var o = pending[r], pos = o.idx.indexOf(i);
              if (pos >= 0) { xorInto(o.val, blocks[i]); o.idx.splice(pos, 1); }
            }
          }
          progressed = true;
        }
      }
    }

    return {
      add: function (seed, data) {
        if (recovered >= k) return true;
        // Drop a malformed symbol (wrong length) rather than storing it as a block and
        // overrunning its slot in result(). A block MUST be exactly `s` bytes.
        if (!data || data.length !== s) return false;
        var sym = { idx: indicesForSeed(seed, k).slice(), val: new Uint8Array(data) };
        reduceKnown(sym);
        pending.push(sym);
        peel();
        return recovered >= k;
      },
      complete: function () { return recovered >= k; },
      result: function () {
        if (recovered < k) return null;
        var out = new Uint8Array(k * s);
        for (var b = 0; b < k; b++) out.set(blocks[b], b * s);
        return out.subarray(0, len);
      }
    };
  }

  root.QrFountain = {
    _mulberry32: mulberry32,
    chunk: chunk,
    indicesForSeed: indicesForSeed,
    makeEncoder: makeEncoder,
    makeDecoder: makeDecoder
  };
})();

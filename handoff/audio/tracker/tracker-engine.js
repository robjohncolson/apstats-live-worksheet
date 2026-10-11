/* tracker-engine.js — tiny WebAudio tracker for APStat Park (classic script, no modules).
 * TrackerEngine.create(ctx, dest, opts) -> engine
 *   engine.load(song) / play() / stop(fadeSec) / setStems({<channel or role>: level}) / mute(ch,bool) / solo(ch|null)
 *   Channels are per song (song.channels, e.g. ['drums','FM1',...,'PSG1']: one tracker channel per ORIGINAL channel).
 *   song.roles maps lead/bass/arp/pad -> a channel (used by setStems role names and by vibe.js SFX voices).
 *   song.mix[ch] = {vol (dB trim), gate (x note length), bright (x FM index), oct (shift), mute, solo}: optional per-channel
 *   hand-mix block (demo.html mixer exports it). engine.setMix(ch, {..}) changes it live; engine.getMix() returns it.
 *   Legacy songs with channels drums/bass/pad/arp/lead still load unchanged.
 *   engine.setTempoScale(x) / unlock(bool) / isUnlocked() / setMode('solo'|'class') / setLowPower(bool)
 *   engine.on('row'|'beat'|'bar'|'loop', fn) / off(evt, fn) / getClock() / nextGridTime(div)
 * Gating: LOCKED by default (easter egg) and mode 'class' by default -> play() is a no-op until
 *   unlock(true) AND (setMode('solo') or opts.allowInClass).
 * Graph: per channel: [pre-created osc] -> env -> chanGain -> stemGain -> master -> dest ; vibrato LFO -> osc.detune
 *        song.instrumentSet picks the voice family: 'nes' (pulse/tri4/LFSR noise, stepped 4-bit volume),
 *        'genesis' (2-op FM from SMPS patches, YM-style drums), 'opl2' (2-op FM, OPL waveforms). sfxOut -> dest (vibe.js)
 */
(function (root) {
'use strict';
var CH = ['drums', 'bass', 'pad', 'arp', 'lead'];   // legacy default channel list
var MAX_VOICES = 8, LP_VOICES = 5;
// ---- original Sega data (registered once per page): DAC sample kits and extracted SMPS SFX sets ----
var KITS = {}, SFXSETS = {};
function registerKit(j) { KITS[j.kit] = j; }
function registerSfx(j) { SFXSETS[j.set.replace(/^genesis-/, '')] = j; }
function sfxRef(ref) { var m = /^([^:]+):(.+)$/.exec(ref || ''); var S = m && SFXSETS[m[1]]; return S ? S.sfx[m[2]] || null : null; }                    // melodic voice caps (normal / lowPower)
function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function pulseWave(ctx, duty) {
  var n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (var k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty); im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty)); }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}
function tableWave(ctx, name) {     // tri4 = 2A03 4-bit stepped triangle; OPL2 waveforms 1-3
  var N = 256, H = 64, s = new Float32Array(N), re = new Float32Array(H), im = new Float32Array(H), i, k;
  for (i = 0; i < N; i++) {
    var ph = i / N, x = Math.sin(2 * Math.PI * ph);
    if (name === 'tri4') { var st = Math.floor(ph * 32), lv = st < 16 ? 15 - st : st - 16; x = lv / 7.5 - 1; }
    else if (name === 'halfsine') x = Math.max(0, x);
    else if (name === 'abssine') x = Math.abs(x);
    else if (name === 'quartersine') x = ((ph * 4) % 2) < 1 ? Math.abs(Math.sin(2 * Math.PI * ph)) : 0;
    s[i] = x;
  }
  for (k = 1; k < H; k++) { var a = 0, b = 0; for (i = 0; i < N; i++) { a += s[i] * Math.cos(2 * Math.PI * k * i / N); b += s[i] * Math.sin(2 * Math.PI * k * i / N); } re[k] = 2 * a / N; im[k] = 2 * b / N; }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}
// ---- ChipDSP: sample-level YM2612 (4-op, true phase modulation, op1 feedback, chip EG tables), SN76489 and OPL2 channels.
// Shared verbatim by the AudioWorklet (live) and tools/render_chip.js (offline previews / reference comparison).
function chipDSPFactory() {
  var SIN = new Float32Array(4097), i;
  for (i = 0; i <= 4096; i++) SIN[i] = Math.sin(2 * Math.PI * i / 4096);
  function sinc(c) { var x = c - Math.floor(c), p = x * 4096, k = p | 0; return SIN[k] + (SIN[k + 1] - SIN[k]) * (p - k); }
  function oplw(ws, c) {
    var x = c - Math.floor(c), s = sinc(x);
    if (ws === 1) return s > 0 ? s : 0;
    if (ws === 2) return s < 0 ? -s : s;
    if (ws === 3) return (x % 0.5) < 0.25 ? (s < 0 ? -s : s) : 0;
    return s;
  }
  var ATT = new Float32Array(1024); for (i = 0; i < 1024; i++) ATT[i] = Math.pow(10, -i * 0.09375 / 20);
  var EG_INC = [[0,1,0,1,0,1,0,1],[0,1,0,1,1,1,0,1],[0,1,1,1,0,1,1,1],[0,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],[1,1,1,2,1,1,1,2],[1,2,1,2,1,2,1,2],[1,2,2,2,1,2,2,2],
    [2,2,2,2,2,2,2,2],[2,2,2,4,2,2,2,4],[2,4,2,4,2,4,2,4],[2,4,4,4,2,4,4,4],
    [4,4,4,4,4,4,4,4],[4,4,4,8,4,4,4,8],[4,8,4,8,4,8,4,8],[4,8,8,8,4,8,8,8],[8,8,8,8,8,8,8,8]];
  var DT_TAB = [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,8,8],
    [1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,9,10,11,12,13,14,16,16,16,16],
    [2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,9,10,11,12,13,14,16,17,19,20,22,22,22,22]];
  var ALG = { 0: [[0, 1], [1, 2], [2, 3]], 1: [[0, 2], [1, 2], [2, 3]], 2: [[0, 3], [1, 2], [2, 3]], 3: [[0, 1], [1, 3], [2, 3]],
              4: [[0, 1], [2, 3]], 5: [[0, 1], [0, 2], [0, 3]], 6: [[0, 1]], 7: [] };
  var CAR = { 0: [3], 1: [3], 2: [3], 3: [3], 4: [1, 3], 5: [1, 2, 3], 6: [1, 2, 3], 7: [0, 1, 2, 3] };
  function keycode(f) {
    var x = f * 144 * 2097152 / 7670453, blk = 0;
    while (x > 0x4C4 && blk < 7) { x /= 2; blk++; }
    var fn = Math.round(x), f11 = (fn >> 10) & 1, f8 = (fn >> 7) & 7;
    return (blk << 2) | (f11 << 1) | (f11 ? (f8 ? 1 : 0) : (f8 === 7 ? 1 : 0));
  }
  var OPL_K = 2, FLOOR = 1e-5;
  function oplT(rate, kc, ksr, attack) {   // OPL2 EG times (YMF262 data sheet), effective rate 4*R + key-scale offset
    if (!rate) return Infinity;
    var off = ksr ? kc : kc >> 2, r = Math.min(63, 4 * rate + off);
    if (attack && r >= 60) return 0.0003;
    return (attack ? 2.82624 : 39.28064) * Math.pow(2, -(r - 4) / 4);
  }
  function oplEnv1(op, kc, peak, gate, from) {
    var ta = oplT(op.ar, kc, op.ksr, true); if (!isFinite(ta) || peak <= FLOOR) return [[0, 0, 'set']];
    var slDb = op.sl === 15 ? 93 : 3 * op.sl, sl = Math.max(FLOOR, peak * Math.pow(10, -slDb / 20)), Pp = [[0, Math.max(from, FLOOR), 'set'], [ta * (1 - Math.min(1, from / peak)), peak, 'lin']], t = Pp[1][0];
    var td = oplT(op.dr, kc, op.ksr) * slDb / 96; if (isFinite(td) && slDb > 0) { Pp.push([t + td, sl, 'exp']); t += td; }
    if (!op.eg && isFinite(td)) { var tr0 = oplT(op.rr, kc, op.ksr) * (96 - slDb) / 96; if (isFinite(tr0)) Pp.push([t + tr0, FLOOR, 'exp']); }
    var out = [], vg = null;
    for (var i = 0; i < Pp.length; i++) { var s = Pp[i]; if (s[0] <= gate) { out.push(s); vg = s[1]; continue; }
      var p = Pp[i - 1], fr = (gate - p[0]) / (s[0] - p[0]); vg = s[2] === 'lin' ? p[1] + (s[1] - p[1]) * fr : p[1] * Math.pow(s[1] / p[1], fr); out.push([gate, vg, s[2]]); break; }
    if (vg == null) vg = FLOOR;
    if (out[out.length - 1][0] < gate) out.push([gate, vg, 'set']);   // hold the sustain level until key-off
    var tr = oplT(op.rr, kc, op.ksr) * Math.max(0, 20 * Math.log10(vg / FLOOR)) / 96, tg = Math.max(gate, out[out.length - 1][0]);
    if (!isFinite(tr)) tr = 5;
    out.push([tg + Math.max(0.002, tr), FLOOR, 'exp']); out.push([tg + Math.max(0.002, tr) + 0.001, 0, 'set']); return out;
  }
  function kslDb(op, f) { return op.ksl ? Math.max(0, Math.log2(f / 130.8)) * [0, 3, 1.5, 6][op.ksl] : 0; }
  function oplEnvs(V, f, gate, va, bright, fromM, fromC) {
    var kc = Math.max(0, Math.min(15, Math.floor(Math.log2(f / 32.7)) * 2 + 1)), M = V.mod, C = V.car;
    var pkM = Math.pow(10, -(0.75 * M.tl + kslDb(M, f)) / 20) * (V.con ? 1 : (bright || 1));
    var pkC = Math.pow(10, -(0.75 * Math.min(63, C.tl + Math.max(0, va || 0)) + kslDb(C, f)) / 20);
    return [oplEnv1(M, kc, pkM, gate, fromM || 0), oplEnv1(C, kc, pkC, gate, fromC || 0)];
  }
  function egRate(p, ks) { return p ? Math.min(63, 2 * p + ks) : 0; }
  function ChipDSP(sr, chans) {
    this.sr = sr; this.dcA = 1 - 2 * Math.PI * 7 / sr; this.t = 0; this.egAcc = 0; this.egCnt = 0; this.ev = []; this.ei = 0; this.L = { fm: 0.261, psg: 0.14, opl: 0.25 };
    this.ch = chans.map(function (c) {
      return { kind: c.kind, name: c.name, op: [0, 1, 2, 3].map(function () { return { ph: 0, att: 1023, st: 3, tl: 127, y: 0 }; }),
               fb1: 0, fb2: 0, V: null, f: 0, cents: 0, on: false, va: 0, bright: 1, ph: 0, amp: 0, nz: 0, lfsr: 0x8000, nacc: 0, oplEnv: null };
    });
  }
  var P = ChipDSP.prototype;
  // events: {t, ch, type:'on'|'off'|'cents'|'vol', ...}; must be pushed in any order, sorted lazily
  P.push = function (e) {                 // keep events sorted (binary insert after the read index)
    var a = this.ev, lo = this.ei || 0, hi = a.length;
    if (!hi || a[hi - 1].t <= e.t) { a.push(e); return; }
    while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid].t <= e.t) lo = mid + 1; else hi = mid; }
    a.splice(lo, 0, e);
  };
  P.clear = function () { this.ev = []; this.ei = 0; for (var k = 0; k < this.ch.length; k++) { var c = this.ch[k]; c.on = false; c.amp = 0; c.V = null; c.op.forEach(function (o) { o.att = 1023; o.st = 3; }); } };
  P.keyOn = function (c, e) {
    c.on = true; c.f = e.f; c.cents = 0; c.va = e.va || 0; c.bright = e.bright != null ? e.bright : 1;
    if (c.kind === 'fm') {
      var V = c.V = e.V, kc = keycode(e.f), car = CAR[V.alg];
      for (var j = 0; j < 4; j++) {
        var o = c.op[j], p = V.op[j], ks = kc >> (3 - p.rs), mul = p.mul ? p.mul : 0.5;
        var dt = DT_TAB[p.dt & 3][kc] * (p.dt & 4 ? -1 : 1);
        o.fbase = e.f * mul + dt * 0.0508 * mul; o.ph = 0;
        o.Rar = egRate(p.ar, ks); o.Rd1 = egRate(p.d1r, ks); o.Rd2 = egRate(p.d2r, ks); o.Rr = egRate(p.rr * 2 + 1, ks);
        o.sl = p.d1l === 15 ? 992 : p.d1l * 32;
        var isCar = car.indexOf(j) >= 0;
        o.tl = Math.min(127, p.tl + (isCar ? Math.max(0, c.va) : 0)) * 8;
        if (!isCar && c.bright !== 1) o.tl = Math.max(0, Math.min(1023, o.tl - Math.round(20 * Math.log10(Math.max(1e-3, c.bright)) / 0.09375)));
        if (o.Rar >= 62) { o.att = 0; o.st = 1; } else o.st = 0;
      }
      c.fb1 = c.fb2 = 0;
    } else if (c.kind === 'psg') {
      c.vc = e.vc || [[0, 0]]; c.vi = 0; c.t0 = e.t; c.nz = e.nz; c.amp = 0; c.ts = e.ts || 1; c.lvl = e.lvl != null ? e.lvl : 1;
      if (c.nz != null) { var m = c.nz, N = (m & 3) === 3 ? Math.max(1, Math.round(3579545 / 32 / Math.max(1, e.f))) : [16, 32, 64][m & 3]; c.nrate = 3579545 / (32 * N) / this.sr; c.white = !!(m & 4); }
    } else if (c.kind === 'opl') {
      var V2 = e.V, rt = e.t - (c.t0 || 0), fromM = c.oplEnv ? this.oplEnvAt(c.oplEnv[0], rt) : 0, fromC = c.oplEnv ? this.oplEnvAt(c.oplEnv[1], rt) : 0;
      c.V = V2; c.oplEnv = oplEnvs(V2, e.f, e.gate, c.va, c.bright, fromM, fromC); c.t0 = e.t;
      c.fm = e.f * (V2.mod.mul ? V2.mod.mul : 0.5); c.fc = e.f * (V2.car.mul ? V2.car.mul : 0.5); c.kpm = e.kpm != null ? e.kpm : OPL_K;
      c.fbScale = 1; c.vibDepth = (e.depth && e.depth.vib) || 7; c.amDepth = (e.depth && e.depth.am) || 1;
      c.op[0].ph = 0; c.op[1].ph = 0;
    }
  };
  P.keyOff = function (c) { c.on = false; if (c.kind === 'fm') for (var j = 0; j < 4; j++) c.op[j].st = 3; };
  P.egTick = function () {
    var cnt = ++this.egCnt;
    for (var k = 0; k < this.ch.length; k++) {
      var c = this.ch[k]; if (c.kind !== 'fm' || !c.V) continue;
      for (var j = 0; j < 4; j++) {
        var o = c.op[j], R = o.st === 0 ? o.Rar : o.st === 1 ? o.Rd1 : o.st === 2 ? o.Rd2 : o.Rr;
        if (R < 4) { if (o.st === 1 && o.att >= o.sl) o.st = 2; continue; }
        var sh = R < 48 ? 11 - (R >> 2) : 0;
        if (sh && (cnt & ((1 << sh) - 1))) continue;
        var row = R < 48 ? (R & 3) : (R >= 60 ? 16 : 4 + (R - 48)), inc = EG_INC[row][(cnt >> sh) & 7];
        if (o.st === 0) { if (R >= 62) o.att = 0; else o.att += (~o.att * inc) >> 4; if (o.att <= 0) { o.att = 0; o.st = 1; } }
        else { o.att += inc; if (o.att > 1023) o.att = 1023; if (o.st === 1 && o.att >= o.sl) o.st = 2; }
      }
    }
  };
  P.oplEnvAt = function (P_, t) {
    var v = P_[0][1];
    for (var i = 1; i < P_.length; i++) { var s = P_[i], p = P_[i - 1];
      if (t >= s[0]) { v = s[1]; continue; }
      if (s[2] === 'set') return p[1];
      var fr = (t - p[0]) / Math.max(1e-9, s[0] - p[0]);
      return s[2] === 'lin' ? p[1] + (s[1] - p[1]) * fr : Math.max(1e-9, p[1]) * Math.pow(Math.max(1e-9, s[1]) / Math.max(1e-9, p[1]), fr); }
    return v;
  };
  // render n samples into outs[k] (Float32Array per channel); t advances by n/sr
  P.render = function (outs, n) {
    var sr = this.sr, egStep = 17755.7 / sr, ev = this.ev, L = this.L, chs = this.ch;
    for (var s = 0; s < n; s++) {
      var t = this.t + s / sr;
      while (this.ei < ev.length && ev[this.ei].t <= t) {
        var e = ev[this.ei++], c = chs[e.ch];
        if (e.type === 'on') this.keyOn(c, e);
        else if (e.type === 'off') { if (c.kind !== 'psg') this.keyOff(c); else c.on = false; }
        else if (e.type === 'cents') c.cents = e.v;
      }
      if (this.ei > 4096) { ev.splice(0, this.ei); this.ei = 0; }
      this.egAcc += egStep;
      while (this.egAcc >= 1) { this.egAcc -= 1; this.egTick(); }
      for (var k = 0; k < chs.length; k++) {
        var c = chs[k], out = 0;
        if (c.kind === 'fm') {
          if (!c.V) { outs[k][s] = 0; continue; }
          var V = c.V, links = ALG[V.alg], car = CAR[V.alg], det = c.cents ? Math.pow(2, c.cents / 1200) : 1, y = [0, 0, 0, 0];
          for (var j = 0; j < 4; j++) {
            var o = c.op[j], m = 0;
            if (j === 0) { if (V.fb) m = (c.fb1 + c.fb2) * Math.pow(2, V.fb - 7); }
            else for (var q = 0; q < links.length; q++) if (links[q][1] === j) m += 4 * y[links[q][0]];
            var a = o.att + o.tl; if (a > 1023) a = 1023;
            y[j] = sinc(o.ph + m) * ATT[a];
            o.ph += o.fbase * det / sr; if (o.ph > 1e6) o.ph -= Math.floor(o.ph);
          }
          c.fb2 = c.fb1; c.fb1 = y[0];
          // YM2612 output stage: each carrier truncated to 9 bits (fm_out >> 5), channel sum clamped, then the
          // model-1 DAC "ladder effect" (+4/-3 LSB crossover step, time-averaged) and AC coupling (7 Hz), as in Nuked OPN2.
          var o9 = 0;
          for (var cc = 0; cc < car.length; cc++) o9 += Math.round(y[car[cc]] * 8188) >> 5;
          o9 = o9 > 255 ? 255 : o9 < -256 ? -256 : o9;
          var ye = (o9 + (o9 >= 0 ? 4 : -3)) / 256;
          c.dcy = ye - (c.dcx || 0) + this.dcA * (c.dcy || 0); c.dcx = ye;
          outs[k][s] = c.dcy * L.fm;
        } else if (c.kind === 'psg') {
          if (c.vc) {
            var rel = t - c.t0;
            while (c.vi < c.vc.length && c.vc[c.vi][0] / 60 * (c.ts || 1) <= rel) { var at = c.vc[c.vi][1]; c.amp = at >= 15 ? 0 : Math.pow(10, -2 * at / 20); c.vi++; }
          }
          if (!c.on || !c.amp) { outs[k][s] = 0; continue; }
          if (c.nz != null) {
            c.nacc += c.nrate;
            while (c.nacc >= 1) { c.nacc -= 1; var fbb = c.white ? ((c.lfsr & 1) ^ ((c.lfsr >> 3) & 1)) : (c.lfsr & 1); c.lfsr = (c.lfsr >> 1) | (fbb << 15); }
            out = (c.lfsr & 1) ? 1 : -1;
          } else {
            c.ph += c.f * (c.cents ? Math.pow(2, c.cents / 1200) : 1) / sr; if (c.ph > 1) c.ph -= Math.floor(c.ph);
            out = c.ph < 0.5 ? 1 : -1;
          }
          outs[k][s] = out * c.amp * L.psg * (c.lvl != null ? c.lvl : 1);
        } else if (c.kind === 'opl') {
          if (!c.V) { outs[k][s] = 0; continue; }
          var V2 = c.V, E = c.oplEnv, rt = t - c.t0, mo = c.op[0], co = c.op[1];
          var vib = 1, trem = 1;
          if (V2.mod.vib || V2.car.vib) vib = Math.pow(2, c.vibDepth * Math.sin(2 * Math.PI * 6.1 * t) / 1200);
          if (V2.mod.am || V2.car.am) { var d = (1 - Math.pow(10, -c.amDepth / 20)) / 2; trem = 1 - d + d * Math.sin(2 * Math.PI * 3.7 * t); }
          var eM = this.oplEnvAt(E[0], rt), eC = this.oplEnvAt(E[1], rt);
          var mfb = V2.fb ? (c.fb1 + c.fb2) * Math.pow(2, V2.fb - 7) * c.fbScale : 0;
          var ym = oplw(V2.mod.ws, mo.ph + mfb) * eM * (V2.mod.am ? trem : 1);
          var yc = oplw(V2.car.ws, co.ph + (V2.con ? 0 : c.kpm * ym)) * eC * (V2.car.am ? trem : 1);
          c.fb2 = c.fb1; c.fb1 = ym;
          mo.ph += c.fm * (V2.mod.vib ? vib : 1) * (c.cents ? Math.pow(2, c.cents / 1200) : 1) / sr;
          co.ph += c.fc * (V2.car.vib ? vib : 1) * (c.cents ? Math.pow(2, c.cents / 1200) : 1) / sr;
          if (mo.ph > 1e6) mo.ph -= Math.floor(mo.ph); if (co.ph > 1e6) co.ph -= Math.floor(co.ph);
          outs[k][s] = (yc + (V2.con ? ym : 0)) * L.opl;
        }
      }
    }
    this.t += n / sr;
  };
  ChipDSP.oplEnvs = oplEnvs; ChipDSP.keycode = keycode; ChipDSP.setOplK = function (k) { OPL_K = k; };
  return ChipDSP;
}
var ChipDSP = chipDSPFactory();

// chip events for one tracker cell (shared by the live AudioWorklet path and tools/render_chip.js)
function chipEvents(song, c, k, cell, t, rd, m, ts) {
  m = m || {}; ts = ts || 1;
  var gate = cell.l * rd * (m.gate != null ? m.gate : 1), f = 440 * Math.pow(2, (cell.n + 12 * (m.oct || 0) - 69) / 12), ev = [];
  var vadd = cell.v != null && cell.v > 0 ? -20 * Math.log10(cell.v) / 0.75 : 0;
  if (/^PSG/.test(c)) {
    ev.push({ t: t, ch: k, type: 'on', f: f, gate: gate, vc: cell.vc, nz: cell.nz, ts: ts, lvl: cell.v != null ? cell.v : 1 });
  } else {
    var V = song.voices[cell.vo]; if (!V) return ev;
    ev.push({ t: t, ch: k, type: 'on', f: f, gate: gate, V: V, va: (cell.va || 0) + vadd, bright: m.bright != null ? m.bright : 1, depth: song.oplDepth, kpm: song.oplK });
  }
  if (cell.pc) for (var i = 0; i < cell.pc.length; i++) { var tc = t + cell.pc[i][0] / 60 * ts; if (tc < t + gate) ev.push({ t: tc, ch: k, type: 'cents', v: cell.pc[i][1] }); }
  ev.push({ t: t + gate, ch: k, type: 'off' });
  return ev;
}
var NES_DEFAULT = {"drums": {"kick": {"wave": "tri4", "from": 180, "to": 50, "decay": 0.09, "vol": 0.8}, "snare": {"noise": "lfsrLong", "filter": "none", "tone": 0, "decay": 0.11, "vol": 0.32, "steps": true}, "hat": {"noise": "lfsrShort", "filter": "highpass", "tone": 6000, "decay": 0.03, "vol": 0.14, "steps": true}}, "bass": {"wave": "tri4", "adsr": [0.001, 0.05, 1.0, 0.02], "vol": 0.6}, "pad": {"wave": "pulse", "duty": 0.5, "adsr": [0.06, 0.3, 0.6, 0.25], "vol": 0.08, "steps": true, "lowPowerOff": true}, "arp": {"wave": "pulse", "duty": 0.25, "adsr": [0.001, 0.08, 0.6, 0.03], "vol": 0.09, "steps": true}, "lead": {"wave": "pulse", "duty": 0.125, "adsr": [0.001, 0.12, 0.6, 0.05], "vol": 0.2, "steps": true}};
function create(ctx, dest, opts) {
  opts = opts || {};
  var LOOKAHEAD = opts.lookahead || 0.1, TIMER_MS = opts.timerMs || 25;
  var master = ctx.createGain(); master.gain.value = opts.volume != null ? opts.volume : 0.27; master.connect(dest);
  var sfxOut = ctx.createGain(); sfxOut.gain.value = opts.sfxVolume != null ? opts.sfxVolume : 0.48; sfxOut.connect(dest);
  var chan = {}, stem = {}, userLvl = {}, muted = {}, soloCh = null, CHS = CH.slice();
  // ---- AudioWorklet chip synth (exact phase modulation / feedback / chip EG). Falls back to node-graph FM when unavailable.
  var chipReady = false, chipPending = [], chipNode = null;
  var readyP = (function () {
    if (opts.noWorklet || !ctx.audioWorklet || typeof Blob === 'undefined' || typeof URL === 'undefined') return Promise.resolve(false);
    if (ctx.__chipReady) return ctx.__chipReady.then(function (ok) { chipReady = ok; return ok; });
    var src = 'var chipDSPFactory = ' + chipDSPFactory.toString() + ';\nvar ChipDSP = chipDSPFactory();\n' +
      'class ChipProc extends AudioWorkletProcessor { constructor(o) { super(); var p = o.processorOptions || {}; this.d = new ChipDSP(sampleRate, p.chans || []);' +
      ' if (p.levels) { for (var k in p.levels) this.d.L[k] = p.levels[k]; } this.alive = true; var self = this;' +
      ' this.port.onmessage = function (e) { var m = e.data; if (m.evs) for (var i = 0; i < m.evs.length; i++) self.d.push(m.evs[i]); if (m.clear) self.d.clear(); if (m.kill) self.alive = false; }; }' +
      ' process(inp, outs) { var o = []; for (var i = 0; i < outs.length; i++) o.push(outs[i][0]); this.d.t = currentTime; if (o.length) this.d.render(o, o[0].length); return this.alive; } }\n' +
      "registerProcessor('chipsynth-v2', ChipProc);";
    var url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    ctx.__chipReady = ctx.audioWorklet.addModule(url).then(function () { return true; }, function (e) { console.warn('chip worklet unavailable', e); return false; });
    return ctx.__chipReady.then(function (ok) { chipReady = ok; return ok; });
  })();
  function ensureChan(c) {
    if (stem[c]) return;
    stem[c] = ctx.createGain(); stem[c].connect(master);
    chan[c] = ctx.createGain(); chan[c].connect(stem[c]); userLvl[c] = 1; muted[c] = false;
  }
  CH.forEach(ensureChan);
  function resolve(c) { return (song && song.roles && song.roles[c] && !(song.channels || []).includes(c)) ? song.roles[c] : c; }
  function mixOf(c) { var m = song && song.mix && song.mix[c]; return m || {}; }
  function applyMixGains() {
    if (!song) return;
    var solo = null;
    CHS.forEach(function (c) { var m = mixOf(c); chan[c].gain.value = Math.pow(10, (m.vol || 0) / 20); if (m.solo) solo = c; });
    CHS.forEach(function (c) { muted[c] = !!mixOf(c).mute; });
    soloCh = solo;
  }
  function lpOff(c) { if (song && song.lowPowerOff && song.lowPowerOff.indexOf(c) >= 0) return true; var i = song && song.instruments[c]; return !!(i && i.lowPowerOff !== undefined ? i.lowPowerOff : (c === 'pad' && i)); }
  var patRows = {}, phase = 'loop';
  function seq() { return phase === 'intro' ? song.intro : song.order; }
  var song = null, pats = null, voices = null, playing = false, timer = null;
  var unlocked = !!opts.unlocked, mode = opts.mode || 'class', allowInClass = !!opts.allowInClass, lowPower = !!opts.lowPower;
  var tempoScale = 1, listeners = { row: [], beat: [], bar: [], loop: [] };
  var pos = { order: 0, row: 0, abs: 0, time: 0 }, anchor = { time: 0, row: 0 };
  var waveCache = {}, noiseBufs = {}, voiceCount = 0, kitBufs = {};
  function kitBuffer(kitName, sname) {          // decode 8-bit PCM once per context
    var k = kitName + '/' + sname; if (kitBufs[k]) return kitBufs[k];
    var S = KITS[kitName].samples[sname], bin = atob(S.pcm), b = ctx.createBuffer(1, bin.length, Math.max(3000, Math.round(S.rate))), d = b.getChannelData(0);
    for (var i = 0; i < bin.length; i++) d[i] = (bin.charCodeAt(i) - 128) / 128;
    return (kitBufs[k] = b);
  }
  function playSample(kitName, id, t, vel, out) {
    var K = KITS[kitName], m = K && K.ids[id]; if (!m) return false;
    var src = ctx.createBufferSource(), g = ctx.createGain(), buf = kitBuffer(kitName, m.sample);
    src.buffer = buf; src.playbackRate.value = m.rate / buf.sampleRate;
    g.gain.value = (song && song.levels && song.levels.dac ? song.levels.dac : ((song && song.instruments.drums && song.instruments.drums.sampleVol) || 0.55)) * vel;
    src.connect(g); g.connect(out); src.start(t); src.onended = function () { g.disconnect(); };
    return true;
  }

  function rowDur() { return 60 / (song.bpm * tempoScale) / song.rowsPerBeat; }
  function tickDur() { return rowDur() / (song.ticksPerRow || 6); }
  function emit(evt, data, t) {
    var fns = listeners[evt]; if (!fns.length) return;
    var ms = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(function () { if (playing) fns.forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }, ms);
  }
  function applyGains(rampSec) {
    var t = ctx.currentTime, r = rampSec == null ? 0.2 : rampSec;
    Object.keys(stem).forEach(function (c) {
      var lvl = CHS.indexOf(c) >= 0 ? userLvl[c] : 0;
      if (muted[c]) lvl = 0;
      if (soloCh && soloCh !== c) lvl = 0;
      if (lowPower && lpOff(c)) lvl = 0;
      var p = stem[c].gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(lvl, t + r);
    });
  }
  function load(s) {
    if (playing) stop(0);
    song = s; pats = {}; patRows = {}; CHS = (s.channels || CH).slice(); CHS.forEach(ensureChan); applyMixGains();
    Object.keys(s.patterns).forEach(function (name) {
      var P = s.patterns[name], byRow = {};
      CHS.forEach(function (c) {
        (P[c] || []).forEach(function (cell) {
          var r = Math.floor(cell.r + 1e-6); (byRow[r] = byRow[r] || []).push({ ch: c, cell: cell, frac: cell.r - r });
        });
      });
      pats[name] = byRow; patRows[name] = P.rows || s.rowsPerPattern || 16;
    });
    applyGains(0);
    return engine;
  }
  // ---------- platform voice factory ('nes' | 'genesis' | 'opl2'); one persistent voice per channel, nodes reused ----------
  function platform() { return (song && song.instrumentSet) || 'nes'; }
  function setWave(o, name, duty) {
    if (name === 'sine' || name === 'triangle' || name === 'square' || name === 'sawtooth') { o.type = name; return; }
    var key = name === 'pulse' ? 'p' + (duty || 0.5) : name;
    if (!waveCache[key]) waveCache[key] = name === 'pulse' ? pulseWave(ctx, duty || 0.5) : tableWave(ctx, name);
    o.setPeriodicWave(waveCache[key]);
  }
  function makeVoice(inst, out, lp, mixc) {
    mixc = mixc || {};
    var car = ctx.createOscillator(), env = ctx.createGain(), lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    setWave(car, inst.wave || 'square', inst.duty);
    env.gain.value = 0; lfo.frequency.value = 5.5; lfoAmt.gain.value = 0;
    lfo.connect(lfoAmt); lfoAmt.connect(car.detune); car.connect(env); env.connect(out);
    var fm = inst.fm, mod = null, modG = null, nodes = [car, lfo];
    if (fm && (fm.index > 0 || fm.addLevel > 0)) {
      mod = ctx.createOscillator(); setWave(mod, fm.modWave || 'sine'); lfoAmt.connect(mod.detune); nodes.push(mod);
      if (fm.addLevel > 0) { var ag = ctx.createGain(); ag.gain.value = fm.addLevel; mod.connect(ag); ag.connect(env); }   // OPL additive connection
      if (fm.index > 0) { modG = ctx.createGain(); modG.gain.value = 0; mod.connect(modG); modG.connect(car.frequency); }
    }
    return {
      inst: inst, env: env, lfo: lfo, lfoAmt: lfoAmt, osc: car, lastF: 0, nodes: nodes,
      setF: function (f, t) { car.frequency.setValueAtTime(f, t); if (mod) mod.frequency.setValueAtTime(f * fm.ratio, t); },
      freqParam: car.frequency,
      trig: function (t, gate, peak, f) {
        var a = inst.adsr || [0.005, 0.05, 0.7, 0.03];
        if (inst.steps) stepEnv(env.gain, t, gate, a[1], a[2], a[3], peak); else adsrEnv(env.gain, t, gate, a[0], a[1], a[2], a[3], peak);
        if (modG) {                                   // modulation index envelope = the FM "bright attack"
          var D = fm.index * (mixc.bright != null ? mixc.bright : 1) * f * fm.ratio, p = modG.gain; p.cancelScheduledValues(t);
          if (lp) { p.setValueAtTime(D * 0.6, t); return; }            // lowPower: fixed index, no envelope
          p.setValueAtTime(0, t); p.linearRampToValueAtTime(D, t + Math.max(0.001, fm.modAttack || 0.002));
          p.setTargetAtTime(D * (fm.modSus != null ? fm.modSus : 0.5), t + (fm.modAttack || 0.002), Math.max(0.005, (fm.modDecay || 0.3) / 3));
        }
      },
      start: function (t) { nodes.forEach(function (n) { n.start(t); }); },
      stop: function (t) { nodes.forEach(function (n) { try { n.stop(t); } catch (e) {} }); }
    };
  }
  function adsrEnv(p, t, gate, a, d, s, r, peak) {
    p.cancelScheduledValues(t);
    p.linearRampToValueAtTime(0, t + 0.002);                 // short de-click from whatever was sounding
    p.linearRampToValueAtTime(peak, t + 0.002 + a);
    p.linearRampToValueAtTime(peak * s, t + 0.002 + a + d);
    var end = Math.max(t + 0.002 + a + d, t + gate);
    p.setValueAtTime(peak * s, end);
    p.linearRampToValueAtTime(0, end + r);
  }
  function stepEnv(p, t, gate, d, s, r, peak) {           // 2A03-style 4-bit volume: 16 levels, changes on 60 Hz frames
    var F = 1 / 60, q = function (x) { return Math.round(x * 15) / 15 * peak; }, k;
    p.cancelScheduledValues(t); p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + 0.001);
    var frames = Math.max(1, Math.round(d / F)), last = 1;
    for (k = 1; k <= frames && t + k * F < t + gate; k++) {
      var x = 1 - (1 - s) * (k / frames), v = q(x);
      if (v !== q(last)) p.setValueAtTime(v, t + k * F); last = x;
    }
    var end = Math.max(t + 0.002, t + gate), rf = Math.max(1, Math.round(r / F));
    p.setValueAtTime(q(last), end);
    for (k = 1; k <= rf; k++) p.setValueAtTime(q(last * (1 - k / rf)), end + k * F);
  }
  function makeDrums(D, out, lp) {
    var nodes = [], K = D.kick || {}, S = D.snare || {}, H = D.hat || {};
    var kick = ctx.createOscillator(), kEnv = ctx.createGain(); setWave(kick, K.wave || 'sine'); kEnv.gain.value = 0; kick.connect(kEnv); kEnv.connect(out); nodes.push(kick);
    var tom = null, tEnv = null;
    if (D.tom && !lp) { tom = ctx.createOscillator(); setWave(tom, D.tom.wave || 'sine'); tEnv = ctx.createGain(); tEnv.gain.value = 0; tom.connect(tEnv); tEnv.connect(out); nodes.push(tom); }
    function noiseChain(spec, defFilter) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuffer(spec.noise || 'white'); src.loop = true; nodes.push(src);
      var e = ctx.createGain(), ft = spec.filter || defFilter; e.gain.value = 0;
      if (ft && ft !== 'none') { var f = ctx.createBiquadFilter(); f.type = ft; f.frequency.value = spec.tone || 2000; f.Q.value = 0.8; src.connect(f); f.connect(e); } else src.connect(e);
      e.connect(out); return e;
    }
    var sEnv = noiseChain(S, 'bandpass'), hEnv = noiseChain(H, 'highpass'), body = null, bEnv = null;
    if (S.body && !lp) { body = ctx.createOscillator(); body.type = 'triangle'; bEnv = ctx.createGain(); bEnv.gain.value = 0; body.connect(bEnv); bEnv.connect(out); nodes.push(body); }
    return { D: D, kick: kick, kEnv: kEnv, tom: tom, tEnv: tEnv, sEnv: sEnv, hEnv: hEnv, body: body, bEnv: bEnv, nodes: nodes,
      start: function (t) { nodes.forEach(function (n) { n.start(t); }); }, stop: function (t) { nodes.forEach(function (n) { try { n.stop(t); } catch (e) {} }); } };
  }
  function hit(p, t, vol, dec, steps) {
    p.cancelScheduledValues(t); p.setValueAtTime(0, t); p.linearRampToValueAtTime(vol, t + 0.001);
    if (steps) { for (var k = 1; k <= 8; k++) p.setValueAtTime(vol * Math.round(15 * (1 - k / 8)) / 15, t + k * dec / 8); return; }
    p.exponentialRampToValueAtTime(0.0005, t + dec); p.setValueAtTime(0, t + dec + 0.001);
  }
  function drumHit(v, n, t, vel, cell) {
    var D = v.D;
    if (n === 'T') {                                   // original DAC tom: pitched sine drop (lowPower: kick osc)
      var T = D.tom || D.kick || {}, f0 = (cell && cell.f) || T.from || 180, o = v.tom || v.kick, e = v.tEnv || v.kEnv, td = T.decay || 0.15;
      o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + td);
      hit(e.gain, t, (T.vol || 0.6) * vel, td, false); return;
    }
    if (n === 'K') {
      var K = D.kick || {}, dec = K.decay || 0.11;
      v.kick.frequency.cancelScheduledValues(t); v.kick.frequency.setValueAtTime(K.from || 150, t); v.kick.frequency.exponentialRampToValueAtTime(K.to || 45, t + dec);
      hit(v.kEnv.gain, t, (K.vol || 0.9) * vel, dec, false);
    } else if (n === 'S') {
      var S = D.snare || {}; hit(v.sEnv.gain, t, (S.vol || 0.3) * vel, S.decay || 0.12, S.steps);
      if (v.body) { v.body.frequency.setValueAtTime(S.body.f, t); v.body.frequency.exponentialRampToValueAtTime(S.body.f * 0.7, t + S.body.decay); hit(v.bEnv.gain, t, S.body.vol * vel, S.body.decay, false); }
    } else { var H = D.hat || {}; hit(v.hEnv.gain, t, (H.vol || 0.15) * vel, H.decay || 0.035, H.steps); }
  }
  function noiseBuffer(kind) {
    if (noiseBufs[kind]) return noiseBufs[kind];
    var sr = ctx.sampleRate, b = ctx.createBuffer(1, sr, sr), d = b.getChannelData(0), i;
    if (kind === 'white') { for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    else {                                               // 2A03 noise: 15-bit LFSR, long (tap 1) or short/metallic (tap 6) mode
      var tap = kind === 'lfsrShort' ? 6 : 1, rate = 1789773 / (kind === 'lfsrShort' ? 64 : 202), reg = 1, acc = 0;
      for (i = 0; i < d.length; i++) {
        acc += rate / sr;
        while (acc >= 1) { var fb = (reg ^ (reg >> tap)) & 1; reg = (reg >> 1) | (fb << 14); acc -= 1; }
        d[i] = (reg & 1) ? -1 : 1;
      }
    }
    return (noiseBufs[kind] = b);
  }
  // ======================= accurate chip voices (song.format 'smps-v2' / 'opl-v2') =======================
  // YM2612 4-op FM: 8 algorithms, op1 self-feedback (PeriodicWave of the simulated feedback loop), per-op MUL/DT,
  // hardware-style EG (AR/D1R/D2R/SL/RR with key scaling; times from the chip's EG increment tables, levels in dB).
  // Phase modulation of the chip is realised as FM: modulator op i -> gain(8*pi*f_i) -> carrier.frequency.
  var YM_ALG = { 0: [[1, 2], [2, 3], [3, 4]], 1: [[1, 3], [2, 3], [3, 4]], 2: [[1, 4], [2, 3], [3, 4]], 3: [[1, 2], [2, 4], [3, 4]],
                 4: [[1, 2], [3, 4]], 5: [[1, 2], [1, 3], [1, 4]], 6: [[1, 2]], 7: [] };
  var YM_CAR = { 0: [4], 1: [4], 2: [4], 3: [4], 4: [2, 4], 5: [2, 3, 4], 6: [2, 3, 4], 7: [1, 2, 3, 4] };
  var DT_TAB = [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,8,8],
    [1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,9,10,11,12,13,14,16,16,16,16],
    [2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,9,10,11,12,13,14,16,17,19,20,22,22,22,22]];
  var KPM = 8 * Math.PI, FLOOR = 1e-5;
  function ymKeycode(f) {
    var x = f * 144 * 2097152 / 7670453, blk = 0;
    while (x > 0x4C4 && blk < 7) { x /= 2; blk++; }
    var fn = Math.round(x), f11 = (fn >> 10) & 1, f8 = (fn >> 7) & 7;
    return (blk << 2) | (f11 << 1) | (f11 ? (f8 ? 1 : 0) : (f8 === 7 ? 1 : 0));
  }
  function ymT96(R) {                     // seconds for a full 96 dB decay at effective rate R (EG clock = 53267/3 Hz)
    if (R <= 0) return Infinity;
    var k = R >> 2, m = R & 3, shift = Math.max(0, 11 - k), inc = (4 + m) / 8 * Math.pow(2, Math.max(0, k - 11));
    return 1024 / (17755.7 / Math.pow(2, shift) * inc);
  }
  function ymRate(r, kc, rs) { return r ? Math.min(63, 2 * r + (kc >> (3 - rs))) : 0; }
  // envelope breakpoints for one operator: [[time, value, 'set'|'lin'|'exp'], ...] relative to note start
  function ymEnv(op, kc, peak, gate) {
    var P = [], Rar = ymRate(op.ar, kc, op.rs), ta = Rar >= 62 ? 0.0005 : (Rar ? 0.108 * ymT96(Rar) : Infinity);
    if (!isFinite(ta) || peak <= FLOOR) return [[0, 0, 'set']];
    var slDb = op.d1l === 15 ? 93 : 3 * op.d1l, sl = peak * Math.pow(10, -slDb / 20);
    var segs = [[0, FLOOR, 'set'], [ta, peak, 'lin']], t = ta, v = peak;
    var t1 = ymT96(ymRate(op.d1r, kc, op.rs)) * slDb / 96;
    if (isFinite(t1) && slDb > 0) { segs.push([t + t1, Math.max(sl, FLOOR), 'exp']); t += t1; v = Math.max(sl, FLOOR);
      var t2 = ymT96(ymRate(op.d2r, kc, op.rs)) * (96 - slDb) / 96;
      if (isFinite(t2) && v > FLOOR * 1.01) segs.push([t + t2, FLOOR, 'exp']);
    }
    // truncate at key-off and release (RR: rate 4*RR+2)
    var out = [], vg = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s[0] <= gate) { out.push(s); vg = s[1]; continue; }
      var p = segs[i - 1], fr = (gate - p[0]) / (s[0] - p[0]);
      vg = s[2] === 'lin' ? p[1] + (s[1] - p[1]) * fr : p[1] * Math.pow(s[1] / p[1], fr);
      out.push([gate, vg, s[2]]); break;
    }
    if (vg == null) vg = FLOOR;
    if (out[out.length - 1][0] < gate) out.push([gate, vg, 'set']);   // hold the sustain level until key-off
    var tr = ymT96(ymRate(op.rr * 2 + 1, kc, op.rs)) * Math.max(0, 20 * Math.log10(vg / FLOOR)) / 96;
    var tg = Math.max(gate, out[out.length - 1][0]);
    out.push([tg + Math.max(0.002, tr), FLOOR, 'exp']); out.push([tg + Math.max(0.002, tr) + 0.001, 0, 'set']);
    return out;
  }
  function envAt(P, t) {                  // value of a breakpoint list at time t (for re-triggering from the current level)
    if (!P || !P.length) return 0;
    var v = P[0][1];
    for (var i = 1; i < P.length; i++) {
      var s = P[i], p = P[i - 1];
      if (t >= s[0]) { v = s[1]; continue; }
      if (s[2] === 'set') return p[1];
      var fr = (t - p[0]) / Math.max(1e-9, s[0] - p[0]);
      return s[2] === 'lin' ? p[1] + (s[1] - p[1]) * fr : Math.max(1e-9, p[1]) * Math.pow(Math.max(1e-9, s[1]) / Math.max(1e-9, p[1]), fr);
    }
    return v;
  }
  function applyEnv(param, t, P, from) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(from, 0), t);
    for (var i = 0; i < P.length; i++) {
      var s = P[i], tt = t + s[0];
      if (i === 0) { if (from < FLOOR) param.setValueAtTime(s[1], tt); continue; }
      if (s[2] === 'set') param.setValueAtTime(s[1], tt);
      else if (s[2] === 'lin') param.linearRampToValueAtTime(s[1], tt);
      else param.exponentialRampToValueAtTime(Math.max(1e-6, s[1]), tt);
    }
  }
  var fbCache = {};
  function fbWave(fb, amp, ws) {          // op1 self-feedback waveform (Yamaha: FB n -> pi/16 * 2^(n-1) on the 2-sample mean)
    var key = fb + ':' + Math.round(amp * 50) + ':' + (ws || 0);
    if (fbCache[key]) return fbCache[key];
    var L = 128, H = 48, c = fb ? Math.PI / 16 * Math.pow(2, fb - 1) * amp : 0, x1 = 0, x2 = 0, buf = new Float32Array(L), n, k;
    for (n = 0; n < L * 40; n++) {
      var ph = 2 * Math.PI * (n % L) / L + c * (x1 + x2) / 2, x = oplWave(ws || 0, ph);
      x2 = x1; x1 = x; if (n >= L * 39) buf[n - L * 39] = x;
    }
    var re = new Float32Array(H), im = new Float32Array(H);
    for (k = 1; k < H; k++) { var a = 0, b = 0; for (n = 0; n < L; n++) { a += buf[n] * Math.cos(2 * Math.PI * k * n / L); b += buf[n] * Math.sin(2 * Math.PI * k * n / L); } re[k] = 2 * a / L; im[k] = 2 * b / L; }
    return (fbCache[key] = ctx.createPeriodicWave(re, im, { disableNormalization: true }));
  }
  function oplWave(ws, ph) {
    var s = Math.sin(ph);
    if (ws === 1) return Math.max(0, s);
    if (ws === 2) return Math.abs(s);
    if (ws === 3) { var q = ((ph / (2 * Math.PI)) % 1 + 1) % 1; return (q % 0.5) < 0.25 ? Math.abs(s) : 0; }
    return s;
  }
  function makeFM4(V, out) {              // one YM2612 channel voice for one SMPS voice (alg/fb/ops fixed per voice)
    var o = [null], g = [null], nodes = [], i, car = YM_CAR[V.alg], links = YM_ALG[V.alg], mg = [];
    var amp1 = Math.pow(10, -0.75 * V.op[0].tl / 20);
    for (i = 1; i <= 4; i++) {
      o[i] = ctx.createOscillator(); g[i] = ctx.createGain(); g[i].gain.value = 0;
      if (i === 1 && V.fb) o[i].setPeriodicWave(fbWave(V.fb, Math.min(1, amp1), 0)); else o[i].type = 'sine';
      o[i].connect(g[i]); nodes.push(o[i]);
      if (car.indexOf(i) >= 0) g[i].connect(out);
    }
    links.forEach(function (l) { var m = ctx.createGain(); m.gain.value = 0; g[l[0]].connect(m); m.connect(o[l[1]].frequency); mg.push({ from: l[0], g: m }); });
    var envs = [null, null, null, null, null], tPrev = -1;
    return { nodes: nodes, V: V,
      start: function (t) { nodes.forEach(function (n) { n.start(t); }); },
      stop: function (t) { nodes.forEach(function (n) { try { n.stop(t); } catch (e) {} }); },
      note: function (t, f, gate, va, pc, mix, tscale, retrig) {
        var kc = ymKeycode(f), bright = mix.bright != null ? mix.bright : 1;
        for (var j = 1; j <= 4; j++) {
          var op = V.op[j - 1], mul = op.mul ? op.mul : 0.5, dtv = DT_TAB[op.dt & 3][kc] * (op.dt & 4 ? -1 : 1);
          var fj = f * mul + dtv * 0.0508 * mul;
          o[j].frequency.cancelScheduledValues(t); o[j].frequency.setValueAtTime(fj, t);
          o[j].detune.cancelScheduledValues(t); o[j].detune.setValueAtTime(0, t);
          if (pc) for (var q = 0; q < pc.length; q++) o[j].detune.setValueAtTime(pc[q][1], t + pc[q][0] / 60 * tscale);
          var isCar = car.indexOf(j) >= 0, tl = Math.min(127, op.tl + (isCar ? Math.max(0, va) : 0));
          var peak = Math.pow(10, -0.75 * tl / 20) * (isCar ? 1 : bright);
          if (!retrig) continue;
          var P = ymEnv(op, kc, peak, gate), from = envs[j] ? envAt(envs[j], t - tPrev) : 0;
          applyEnv(g[j].gain, t, P, from); envs[j] = P;
        }
        mg.forEach(function (m) { var opm = V.op[m.from - 1]; m.g.gain.cancelScheduledValues(t); m.g.gain.setValueAtTime(KPM * f * (opm.mul ? opm.mul : 0.5), t); });
        if (retrig) tPrev = t;
      }
    };
  }
  function makeOPL2(V, out, depth) {      // OPL2 2-op: mod -> car (FM) or both to output (AM), waveforms, KSL, AM/VIB, EG type
    var mo = ctx.createOscillator(), co = ctx.createOscillator(), mg = ctx.createGain(), cg = ctx.createGain(), link = ctx.createGain(), nodes = [mo, co];
    var M = V.mod, C = V.car, ampM = Math.pow(10, -0.75 * M.tl / 20);
    mo.setPeriodicWave(fbWave(V.fb || 0, Math.min(1, ampM), M.ws || 0));
    if (C.ws) co.setPeriodicWave(fbWave(0, 0, C.ws)); else co.type = 'sine';
    mg.gain.value = 0; cg.gain.value = 0; mo.connect(mg); co.connect(cg); cg.connect(out);
    if (V.con) mg.connect(out); else { mg.connect(link); link.connect(co.frequency); }
    var lfoA = null, lfoV = null;
    if (M.am || C.am) { lfoA = ctx.createOscillator(); lfoA.frequency.value = 3.7; var ad = ctx.createGain(); ad.gain.value = 0; lfoA.connect(ad); nodes.push(lfoA);
      var trem = ctx.createGain(); trem.gain.value = 1 - (1 - Math.pow(10, -depth.am / 20)) / 2; ad.gain.value = (1 - Math.pow(10, -depth.am / 20)) / 2; ad.connect(trem.gain);
      cg.disconnect(); cg.connect(trem); trem.connect(out); }
    if (M.vib || C.vib) { lfoV = ctx.createOscillator(); lfoV.frequency.value = 6.1; var vd = ctx.createGain(); vd.gain.value = depth.vib; lfoV.connect(vd); nodes.push(lfoV);
      if (C.vib) vd.connect(co.detune); if (M.vib) vd.connect(mo.detune); }
    var envs = [null, null], tPrev = -1;
    function oplT(rate, kc, ksr, attack) {        // OPL2 EG times (YMF262 data sheet), effective rate 4*R + key-scale offset
      if (!rate) return Infinity;
      var off = ksr ? kc : kc >> 2, r = Math.min(63, 4 * rate + off);
      if (attack && r >= 60) return 0.0003;
      return (attack ? 2.82624 : 39.28064) * Math.pow(2, -(r - 4) / 4);
    }
    function env(op, kc, peak, gate) {
      var ta = oplT(op.ar, kc, op.ksr, true); if (!isFinite(ta)) return [[0, 0, 'set']];
      var slDb = op.sl === 15 ? 93 : 3 * op.sl, sl = Math.max(FLOOR, peak * Math.pow(10, -slDb / 20)), P = [[0, FLOOR, 'set'], [ta, peak, 'lin']], t = ta;
      var td = oplT(op.dr, kc, op.ksr) * slDb / 96; if (isFinite(td)) { P.push([t + td, sl, 'exp']); t += td; }
      if (!op.eg && isFinite(td)) { var tr0 = oplT(op.rr, kc, op.ksr) * (96 - slDb) / 96; if (isFinite(tr0)) P.push([t + tr0, FLOOR, 'exp']); }
      var out = [], vg = null;
      for (var i = 0; i < P.length; i++) { var s = P[i]; if (s[0] <= gate) { out.push(s); vg = s[1]; continue; }
        var p = P[i - 1], fr = (gate - p[0]) / (s[0] - p[0]); vg = s[2] === 'lin' ? p[1] + (s[1] - p[1]) * fr : p[1] * Math.pow(s[1] / p[1], fr); out.push([gate, vg, s[2]]); break; }
      if (vg == null) vg = FLOOR;
      if (out[out.length - 1][0] < gate) out.push([gate, vg, 'set']);   // hold the sustain level until key-off
      var tr = oplT(op.rr, kc, op.ksr) * Math.max(0, 20 * Math.log10(vg / FLOOR)) / 96, tg = Math.max(gate, out[out.length - 1][0]);
      if (!isFinite(tr)) tr = 5;
      out.push([tg + Math.max(0.002, tr), FLOOR, 'exp']); out.push([tg + Math.max(0.002, tr) + 0.001, 0, 'set']); return out;
    }
    function kslDb(op, f) { if (!op.ksl) return 0; var oct = Math.max(0, Math.log2(f / 130.8)); return oct * [0, 3, 1.5, 6][op.ksl]; }
    return { nodes: nodes, V: V,
      start: function (t) { nodes.forEach(function (n) { n.start(t); }); },
      stop: function (t) { nodes.forEach(function (n) { try { n.stop(t); } catch (e) {} }); },
      note: function (t, f, gate, va, pc, mix, tscale, retrig) {
        var bh = f * 1, kc = Math.max(0, Math.min(15, Math.floor(Math.log2(f / 32.7)) * 2 + 1)), bright = mix.bright != null ? mix.bright : 1;
        var fm = f * (M.mul ? M.mul : 0.5), fc = f * (C.mul ? C.mul : 0.5);
        mo.frequency.cancelScheduledValues(t); mo.frequency.setValueAtTime(fm, t); co.frequency.cancelScheduledValues(t); co.frequency.setValueAtTime(fc, t);
        link.gain.cancelScheduledValues(t); link.gain.setValueAtTime(OPL_KPM * fm, t);
        if (!retrig) return;
        var pkM = Math.pow(10, -(0.75 * M.tl + kslDb(M, f)) / 20) * (V.con ? 1 : bright);
        var pkC = Math.pow(10, -(0.75 * Math.min(63, C.tl + Math.max(0, va || 0)) + kslDb(C, f)) / 20);
        var PM = env(M, kc, pkM, gate), PC = env(C, kc, pkC, gate);
        applyEnv(mg.gain, t, PM, envs[0] ? envAt(envs[0], t - tPrev) : 0); applyEnv(cg.gain, t, PC, envs[1] ? envAt(envs[1], t - tPrev) : 0);
        envs = [PM, PC]; tPrev = t;
      }
    };
  }
  var OPL_KPM = 4 * Math.PI;
  function psgNoiseBuf(white) {           // SN76489 (Sega) 16-bit LFSR, taps 0/3 (white) or periodic; one shift per sample
    var key = white ? 'snW' : 'snP'; if (noiseBufs[key]) return noiseBufs[key];
    var n = 32768 * 2, b = ctx.createBuffer(1, n, 22050), d = b.getChannelData(0), reg = 0x8000;
    for (var i = 0; i < n; i++) { var fb = white ? ((reg & 1) ^ ((reg >> 3) & 1)) : (reg & 1); reg = (reg >> 1) | (fb << 15); d[i] = (reg & 1) ? 1 : -1; }
    return (noiseBufs[key] = b);
  }
  function makePSG(out, noise) {
    var g = ctx.createGain(); g.gain.value = 0; g.connect(out); var src, nodes = [];
    if (noise) {
      var w = ctx.createBufferSource(); w.buffer = psgNoiseBuf(true); w.loop = true; w.connect(g);
      var p = ctx.createBufferSource(); p.buffer = psgNoiseBuf(false); p.loop = true; var pg = ctx.createGain(); pg.gain.value = 0; p.connect(pg); pg.connect(g);
      var wg = ctx.createGain(); w.disconnect(); w.connect(wg); wg.connect(g); nodes = [w, p];
      src = { w: w, p: p, wg: wg, pg: pg };
    } else { src = ctx.createOscillator(); src.type = 'square'; src.connect(g); nodes = [src]; }
    return { nodes: nodes, noise: noise,
      start: function (t) { nodes.forEach(function (n) { n.start(t); }); },
      stop: function (t) { nodes.forEach(function (n) { try { n.stop(t); } catch (e) {} }); },
      note: function (t, cell, f, gate, lvl, tscale) {
        var P = g.gain, k;
        if (noise) {
          var mode = cell.nz || 0xE7, white = !!(mode & 4), N = (mode & 3) === 3 ? Math.max(1, Math.round(3579545 / 32 / Math.max(1, f))) : [16, 32, 64][mode & 3];
          var rate = 3579545 / (32 * N) / 22050;
          src.w.playbackRate.setValueAtTime(rate, t); src.p.playbackRate.setValueAtTime(rate, t);
          src.wg.gain.setValueAtTime(white ? 1 : 0, t); src.pg.gain.setValueAtTime(white ? 0 : 1, t);
        } else {
          src.frequency.cancelScheduledValues(t); src.frequency.setValueAtTime(f, t);
          src.detune.cancelScheduledValues(t); src.detune.setValueAtTime(0, t);
          if (cell.pc) for (k = 0; k < cell.pc.length; k++) src.detune.setValueAtTime(cell.pc[k][1], t + cell.pc[k][0] / 60 * tscale);
        }
        P.cancelScheduledValues(t);
        var vc = cell.vc || [[0, 0]];
        for (k = 0; k < vc.length; k++) { var tt = t + vc[k][0] / 60 * tscale; if (tt >= t + gate) break; P.setValueAtTime(vc[k][1] >= 15 ? 0 : lvl * Math.pow(10, -2 * vc[k][1] / 20), tt); }
        P.setValueAtTime(0, t + gate);
      }
    };
  }
  function isV2() { return !!(song && (song.format === 'smps-v2' || song.format === 'opl-v2')); }
  function usedVoices(c) {
    var u = {}; Object.keys(song.patterns).forEach(function (k) { (song.patterns[k][c] || []).forEach(function (x) { if (x.vo != null) u[x.vo] = 1; }); });
    return Object.keys(u);
  }
  function buildV2(c, lp) {               // accurate chip voice set for one channel
    var L = song.levels || {}, pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(), bus = ctx.createGain(), o = { v2: true, pan: pan, bus: bus, fm: {}, nodes: [] };
    bus.connect(pan); pan.connect(chan[c]);
    var psg = /^PSG/.test(c), opl = song.format === 'opl-v2';
    if (psg) { bus.gain.value = 1; o.psg = makePSG(bus, usedNoise(c)); o.nodes = o.psg.nodes; }
    else if (lp) { o.lp = makeVoice(song.instruments[c], bus, true, song.mix[c]); o.nodes = o.lp.nodes; bus.gain.value = 1; }
    else {
      bus.gain.value = opl ? (L.opl || 0.25) : (L.fm || 0.261);
      usedVoices(c).forEach(function (vid) { var V = song.voices[vid]; o.fm[vid] = opl ? makeOPL2(V, bus, song.oplDepth || { am: 1, vib: 7 }) : makeFM4(V, bus); o.nodes = o.nodes.concat(o.fm[vid].nodes); });
    }
    o.base = bus.gain.value;
    o.start = function (t) { if (o.psg) o.psg.start(t); if (o.lp) o.lp.start(t); Object.keys(o.fm).forEach(function (k) { o.fm[k].start(t); }); };
    o.stop = function (t) { if (o.psg) o.psg.stop(t); if (o.lp) o.lp.stop(t); Object.keys(o.fm).forEach(function (k) { o.fm[k].stop(t); }); };
    return o;
  }
  function usedNoise(c) { return Object.keys(song.patterns).some(function (k) { return (song.patterns[k][c] || []).some(function (x) { return x.nz != null; }); }); }
  function buildVoices() {
    var v = {}, lp = lowPower, n = 0, mel = 0;
    if (isV2() && !lp && chipReady) {                                  // one AudioWorkletNode renders every chip channel
      var cc = CHS.filter(function (c) { return c !== 'drums' && mel++ < MAX_VOICES + 1; });
      var kinds = cc.map(function (c) { return { name: c, kind: /^PSG/.test(c) ? 'psg' : (song.format === 'opl-v2' ? 'opl' : 'fm') }; });
      chipNode = new AudioWorkletNode(ctx, 'chipsynth-v2', { numberOfInputs: 0, numberOfOutputs: cc.length, outputChannelCount: cc.map(function () { return 1; }), processorOptions: { chans: kinds, levels: song.levels || {} } });
      cc.forEach(function (c, k) {
        var gL = ctx.createGain(), gR = ctx.createGain(), mg = ctx.createChannelMerger(2);
        chipNode.connect(gL, k); chipNode.connect(gR, k); gL.connect(mg, 0, 0); gR.connect(mg, 0, 1); mg.connect(chan[c]);
        if (!song.mix) song.mix = {}; if (!song.mix[c]) song.mix[c] = {};
        v[c] = { chip: true, k: k, gL: gL, gR: gR, nodes: [], start: function () {}, stop: function () {} };
      });
      n += cc.length * 4; mel = cc.length;
      v._chipNode = { nodes: [], start: function () {}, stop: function (t) { var nd = chipNode; setTimeout(function () { try { nd.port.postMessage({ kill: true }); nd.disconnect(); } catch (e) {} }, Math.max(0, (t - ctx.currentTime) * 1000) + 50); } };
    }
    CHS.forEach(function (c) {
      if (c === 'drums' || (v[c] && v[c].chip)) return;
      if (isV2()) {
        if (lp && lpOff(c)) return;
        if (!song.mix) song.mix = {};
        if (!song.mix[c]) song.mix[c] = {};
        v[c] = buildV2(c, lp); n += v[c].nodes.length; mel++; return;
      }
      if (lp && lpOff(c)) return;                                     // lowPower: fewer voices (doubles / inner harmony first)
      if (mel >= (lp ? LP_VOICES : MAX_VOICES)) return;               // hard voice cap
      if (!song.mix) song.mix = {};
      if (!song.mix[c]) song.mix[c] = {};
      v[c] = makeVoice(song.instruments[c] || NES_DEFAULT[c] || NES_DEFAULT.arp, chan[c], lp && platform() !== 'nes', song.mix[c]);
      n += v[c].nodes.length; mel++;
    });
    if (CHS.indexOf('drums') >= 0) { v.drums = makeDrums(song.instruments.drums || NES_DEFAULT.drums, chan.drums, lp); n += v.drums.nodes.length; }
    var t = ctx.currentTime + 0.01;
    Object.keys(v).forEach(function (c) { v[c].start(t); });
    voiceCount = n;
    return v;
  }
  function killVoices(at) {
    if (!voices) return;
    Object.keys(voices).forEach(function (c) { voices[c].stop(at); });
    voices = null; chipNode = null; chipPending = [];
  }
  function ymPeakTL(V) { if (V.car) return V.con ? Math.min(V.car.tl, V.mod.tl) : V.car.tl; var car = YM_CAR[V.alg]; return Math.min.apply(null, car.map(function (j) { return V.op[j - 1].tl; })); }
  function playNote(c, cell, t) {
    var v = voices[c]; if (!v) return;
    if (v.chip) {
      var pb = cell.pb != null ? cell.pb & 0xC0 : 0xC0;
      v.gL.gain.setValueAtTime(pb & 0x80 ? 1 : 0, t); v.gR.gain.setValueAtTime(pb & 0x40 ? 1 : 0, t);
      var evs = chipEvents(song, c, v.k, cell, t, rowDur(), mixOf(c), 1 / tempoScale);
      for (var q = 0; q < evs.length; q++) chipPending.push(evs[q]);
      return;
    }
    if (v.v2) {
      var m2 = mixOf(c), rd2 = rowDur(), gate2 = cell.l * rd2 * (m2.gate != null ? m2.gate : 1), f2 = mtof(cell.n + 12 * (m2.oct || 0)), ts = 1 / tempoScale;
      if (v.pan.pan) { var pb = cell.pb != null ? cell.pb & 0xC0 : 0xC0; v.pan.pan.setValueAtTime(pb === 0x80 ? -1 : pb === 0x40 ? 1 : 0, t); v.bus.gain.setValueAtTime(pb === 0 ? 0 : v.base, t); }
      var vadd = cell.v != null && cell.v > 0 ? -20 * Math.log10(cell.v) / 0.75 : 0;
      if (v.psg) { v.psg.note(t, cell, f2, gate2, ((song.levels && song.levels.psg) || 0.14) * (cell.v != null ? cell.v : 1), ts); return; }
      if (v.lp) {                                         // lowPower: 2-op approximation, original per-note volume
        var V0 = song.voices[cell.vo], tl0 = V0 ? ymPeakTL(V0) : 20;
        var lc = { n: cell.n, l: cell.l, v: (song.format === 'opl-v2' ? ((song.levels && song.levels.opl) || 0.25) : ((song.levels && song.levels.fm) || 0.261)) * Math.pow(10, -0.75 * Math.min(127, tl0 + (cell.va || 0) + vadd) / 20) / (v.lp.inst.vol || 0.2) };
        var save = voices[c]; voices[c] = v.lp; playNote(c, lc, t); voices[c] = save; return;
      }
      var fv = v.fm[cell.vo] || v.fm[Object.keys(v.fm)[0]]; if (!fv) return;
      fv.note(t, f2, gate2, (cell.va || 0) + vadd, cell.pc, m2, ts, true);
      return;
    }
    var m = mixOf(c), inst = v.inst, rd = rowDur(), td = tickDur(), gate = cell.l * rd * (m.gate != null ? m.gate : 1), f = mtof(cell.n + 12 * (m.oct || 0)), fx = cell.fx || {};
    var peak = (inst.vol || 0.2) * (cell.v != null ? cell.v : 1);
    var fp = v.freqParam;
    fp.cancelScheduledValues(t);
    if (fx.slide && v.lastF) { fp.setValueAtTime(v.lastF, t); fp.exponentialRampToValueAtTime(f, t + fx.slide * td); }
    else v.setF(f, t);
    if (fx.arp && fx.arp.length > 1) {                       // tracker arpeggio: cycle offsets every arpRate ticks
      var step = (fx.arpRate || 2) * td, k = 0;
      for (var tt = t; tt < t + gate - 1e-4; tt += step, k++) v.setF(f * Math.pow(2, fx.arp[k % fx.arp.length] / 12), tt);
    }
    var la = v.lfoAmt.gain; la.cancelScheduledValues(t); la.setValueAtTime(0, t);
    if (fx.vib && !lowPower) {
      v.lfo.frequency.setValueAtTime(fx.vib[1] || 5.5, t);
      la.setValueAtTime(0, t + (fx.vib[2] || 0.1)); la.linearRampToValueAtTime((fx.vib[0] || 0.2) * 100, t + (fx.vib[2] || 0.1) + 0.08);
      la.setValueAtTime((fx.vib[0] || 0.2) * 100, t + gate); la.linearRampToValueAtTime(0, t + gate + 0.02);
    }
    v.trig(t, gate, peak, f);
    v.lastF = f;
  }
  function playDrum(cell, t) {
    if (!voices.drums) return;
    var vel = cell.v != null ? cell.v : 1;
    // original DAC sample (per-song kit); lowPower and PSG-noise hats keep the synthesized kit
    if (cell.d && song.drumKit && !lowPower && KITS[song.drumKit] && playSample(song.drumKit, cell.d, t, vel, chan.drums)) return;
    drumHit(voices.drums, cell.n, t, vel, cell);
  }
  // ---------- original SMPS SFX: frame data played through the same Genesis FM voice factory ----------
  // ---- original SFX, accurate path: fx.v2 (same SMPS driver emulation as the songs) on a dedicated 6-slot chip worklet
  // (3 FM + 3 PSG, like the sound driver's SFX channels; a newer effect on the same slot takes it over, as in the game).
  var sfxChip = null;
  function getSfxChip() {
    if (sfxChip || !chipReady) return sfxChip;
    var kinds = ['fm', 'fm', 'fm', 'psg', 'psg', 'psg'].map(function (k, i) { return { name: 'S' + i, kind: k }; });
    var node = new AudioWorkletNode(ctx, 'chipsynth-v2', { numberOfInputs: 0, numberOfOutputs: 6, outputChannelCount: [1, 1, 1, 1, 1, 1], processorOptions: { chans: kinds } });
    var bus = ctx.createGain(); bus.gain.value = 0.27 / 0.48; bus.connect(sfxOut);    // same chip level as the music (master 0.27 vs sfxOut 0.48)
    var pans = [];
    for (var k = 0; k < 6; k++) { var gL = ctx.createGain(), gR = ctx.createGain(), mg = ctx.createChannelMerger(2); node.connect(gL, k); node.connect(gR, k); gL.connect(mg, 0, 0); gR.connect(mg, 0, 1); mg.connect(bus); pans.push([gL, gR]); }
    sfxChip = { node: node, bus: bus, pans: pans };
    return sfxChip;
  }
  function playSfxV2(fx, t, o) {
    var S = getSfxChip(); if (!S) return false;
    var V2 = fx.v2, F = 1 / 60, k = Math.pow(2, (o.semis || 0) / 12), evs = [], fmSlot = 0;
    S.bus.gain.setValueAtTime(0.27 / 0.48 * ((song && song.gainTrim) || 1) * (o.vol != null ? o.vol : 1), t);
    V2.tracks.forEach(function (tr) {
      var slot = tr.kind === 'fm' ? Math.min(2, fmSlot++) : 3 + Math.max(0, Math.min(2, (+tr.ch.slice(-1) || 1) - 1));
      tr.notes.forEach(function (n) {
        var tn = t + n.f * F, gate = n.l * F, f = 440 * Math.pow(2, (n.n - 69) / 12) * k;
        if (tr.kind === 'fm') {
          var V = V2.voices[n.vo]; if (!V) return;
          evs.push({ t: tn, ch: slot, type: 'on', f: f, gate: gate, V: V, va: n.va || 0, bright: 1 });
          var pb = n.pb != null ? n.pb : 0xC0;
          S.pans[slot][0].gain.setValueAtTime(pb & 0x80 ? 1 : 0, tn); S.pans[slot][1].gain.setValueAtTime(pb & 0x40 ? 1 : 0, tn);
        } else {
          evs.push({ t: tn, ch: slot, type: 'on', f: f, gate: gate, vc: n.vc, nz: n.nz, ts: 1, lvl: 1 });
          S.pans[slot][0].gain.setValueAtTime(1, tn); S.pans[slot][1].gain.setValueAtTime(1, tn);
        }
        (n.pc || []).forEach(function (p) { if (p[0] < n.l) evs.push({ t: tn + p[0] * F, ch: slot, type: 'cents', v: p[1] }); });
        evs.push({ t: tn + gate, ch: slot, type: 'off' });
      });
    });
    S.node.port.postMessage({ evs: evs });
    return true;
  }
  function playOriginalSfx(ref, t, o) {
    var fx = typeof ref === 'string' ? sfxRef(ref) : ref; if (!fx) return false;
    if (fx.v2 && !lowPower && chipReady && playSfxV2(fx, t, o || {})) return true;
    o = o || {}; var k = Math.pow(2, (o.semis || 0) / 12), vol = o.vol != null ? o.vol : 1, F = 1 / 60, endT = t + fx.frames * F + 0.6, lp = lowPower;
    fx.channels.forEach(function (c) {
      var ev = c.ev, gpv = c.gainDbPerVol, i;
      function lvl(v) { return Math.pow(10, gpv * Math.max(0, v) / 20) * vol; }
      function nextOff(i) { for (var x = i + 1; x < ev.length; x++) if (ev[x][1] == null || ev[x][3] === 1) return ev[x][0]; return fx.frames; }
      if (c.kind === 'fm') {
        var v = makeVoice(c.inst, sfxOut, lp); v.start(t);
        for (i = 0; i < ev.length; i++) {
          var e = ev[i], te = t + e[0] * F; if (e[1] == null) continue;
          var f = mtof(e[1]) * k; v.setF(f, te);
          if (e[3] === 1) v.trig(te, (nextOff(i) - e[0]) * F, (c.inst.vol || 0.3) * lvl(e[2]), f);
        }
        v.stop(endT);
      } else {
        var src, g = ctx.createGain(); g.gain.value = 0; g.connect(sfxOut);
        if (c.kind === 'psg') { src = ctx.createOscillator(); src.type = 'square'; }
        else { src = ctx.createBufferSource(); src.buffer = noiseBuffer(c.white === false ? 'lfsrShort' : 'white'); src.loop = true; }
        src.connect(g); src.start(t);
        var base = c.kind === 'psg' ? 0.10 : 0.12;
        for (i = 0; i < ev.length; i++) {
          var e2 = ev[i], t2 = t + e2[0] * F;
          if (e2[1] == null) { g.gain.setValueAtTime(0, t2); continue; }
          if (c.kind === 'psg') src.frequency.setValueAtTime(mtof(e2[1]) * k, t2);
          if (e2[3] === 1) { var L = base * lvl(e2[2]); g.gain.setValueAtTime(L, t2); g.gain.setTargetAtTime(L * 0.55, t2, 0.12); g.gain.setValueAtTime(0, t + nextOff(i) * F); }
        }
        src.stop(endT); src.onended = function () { g.disconnect(); };
      }
    });
    return true;
  }
  // ---------- SFX voices for vibe.js: same factory, current platform (NES set when no song is loaded) ----------
  function sfxVoice(kind) {
    var ins = (song && song.instruments) || NES_DEFAULT, ch = (song && song.roles && song.roles[kind]) || kind;
    var src = ins[ch] || ins[kind] || ins[(song && song.roles && song.roles.lead) || 'lead'] || NES_DEFAULT[kind] || NES_DEFAULT.lead;
    if (src.fm && src.fm.ratio > 4) {                   // SFX only: high modulator ratios (e.g. OPL MULT 9) make blips sound shrill
      src = JSON.parse(JSON.stringify(src)); while (src.fm.ratio > 4) src.fm.ratio /= 2; src.fm.index *= 0.6;
    }
    var v = makeVoice(src, sfxOut, lowPower && platform() !== 'nes');
    return v;
  }
  function sfxDrum(kind, t, vel, len) {
    var D = (song && song.instruments && song.instruments.drums) || NES_DEFAULT.drums;
    var d = makeDrums(D, sfxOut, true); d.start(t);
    drumHit(d, kind === 'kick' ? 'K' : 'S', t, vel); d.stop(t + Math.max(0.2, len) + 0.05);
  }
  function scheduleRow(t) {
    var name = seq()[pos.order], byRow = pats[name], rd = rowDur();
    var swingOff = (pos.row % 2 === 1) ? (song.swing || 0) * rd : 0, tr = t + swingOff;
    (byRow[pos.row] || []).forEach(function (e) {
      var tt = tr + e.frac * rd;
      if (e.ch === 'drums') playDrum(e.cell, tt); else playNote(e.ch, e.cell, tt);
    });
    var rpb = song.rowsPerBeat, rpp = patRows[name] || song.rowsPerPattern || 16;
    var info = { order: pos.order, pattern: name, row: pos.row, abs: pos.abs, time: t, intro: phase === 'intro' };
    emit('row', info, t);
    if (pos.row % rpb === 0) emit('beat', { beat: Math.floor(pos.abs / rpb), beatInBar: (pos.row / rpb) | 0, time: t }, t);
    if (pos.row === 0) emit('bar', { bar: pos.order, pattern: name, time: t }, t);
    anchor = { time: t, row: pos.abs };
    pos.row++; pos.abs++;
    if (pos.row >= rpp) {
      pos.row = 0; pos.order++;
      if (phase === 'intro' && pos.order >= song.intro.length) { phase = 'loop'; pos.order = 0; }
      else if (pos.order >= song.order.length) { pos.order = 0; emit('loop', { time: t + rd }, t + rd); if (song.loop === false) { stop(0.3); return false; } }
    }
    return true;
  }
  function tick() {
    if (!playing) return;
    while (pos.time < ctx.currentTime + LOOKAHEAD) {
      if (scheduleRow(pos.time) === false) return;
      pos.time += rowDur();
    }
    if (chipPending.length && chipNode) { chipNode.port.postMessage({ evs: chipPending }); chipPending = []; }
    timer = setTimeout(tick, TIMER_MS);
  }
  function allowed() { return unlocked && (mode === 'solo' || allowInClass); }
  function play() {
    if (!song || playing || !allowed()) return false;
    if (ctx.state === 'suspended' && ctx.resume && !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)) ctx.resume();
    voices = buildVoices();
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime((opts.volume != null ? opts.volume : 0.27) * (song.gainTrim || 1), t);
    phase = (song.intro && song.intro.length && !opts.skipIntro) ? 'intro' : 'loop';
    pos = { order: 0, row: 0, abs: 0, time: t + 0.05 }; playing = true; applyGains(0); tick(); return true;
  }
  function stop(fade) {
    if (!playing) return;
    playing = false; clearTimeout(timer);
    var t = ctx.currentTime, f = fade == null ? 0.3 : fade, v0 = master.gain.value;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(v0, t); master.gain.linearRampToValueAtTime(0, t + f + 0.001);
    killVoices(t + f + 0.02);
  }
  function nextGridTime(div) {
    var now = ctx.currentTime;
    if (!playing || !song) return now;
    var step = rowDur() * (16 / (div || 16)) * (4 / song.rowsPerBeat);
    var k = Math.ceil((now + 0.005 - anchor.time) / step);
    return anchor.time + k * step;
  }
  var engine = {
    load: load, play: play, stop: stop,
    setStems: function (o) { Object.keys(o || {}).forEach(function (k0) { var k = resolve(k0); if (k in userLvl) userLvl[k] = o[k] === true ? 1 : o[k] === false ? 0 : Math.max(0, Math.min(1, +o[k] || 0)); }); applyGains(0.2); },
    mute: function (c, m) { muted[resolve(c)] = !!m; applyGains(0.05); },
    solo: function (c) { soloCh = c ? resolve(c) : null; applyGains(0.05); },
    setTempoScale: function (x) { tempoScale = Math.max(0.25, Math.min(4, +x || 1)); },
    unlock: function (on) { unlocked = on !== false; if (!allowed()) stop(0.3); return unlocked; },
    isUnlocked: function () { return unlocked; },
    setMode: function (m) { mode = m === 'solo' ? 'solo' : 'class'; if (!allowed()) stop(0.3); },
    setLowPower: function (on) { lowPower = !!on; applyGains(0.2); },
    on: function (e, fn) { if (listeners[e]) listeners[e].push(fn); return engine; },
    off: function (e, fn) { if (listeners[e]) listeners[e] = listeners[e].filter(function (f) { return f !== fn; }); },
    getClock: function () { return song ? { playing: playing, bpm: song.bpm * tempoScale, rowDur: rowDur(), rowsPerBeat: song.rowsPerBeat, order: pos.order, row: pos.row, abs: pos.abs, anchor: anchor } : { playing: false }; },
    nextGridTime: nextGridTime, sfxVoice: sfxVoice, sfxDrum: sfxDrum, platform: platform,
    playOriginalSfx: playOriginalSfx, hasOriginalSfx: function (ref) { return !!sfxRef(ref); },
    getVoiceCount: function () { return voiceCount; },
    isPlaying: function () { return playing; },
    get song() { return song; }, ctx: ctx, sfxOut: sfxOut, master: master, CHANNELS: CH,
    getChannels: function () { return CHS.slice(); },
    getPhase: function () { return phase; },
    ready: function () { return readyP; },
    usesWorklet: function () { return !!(voices && voices._chipNode); },
    getMix: function () { return song ? song.mix || {} : {}; },
    setMix: function (c, o) {
      if (!song) return; song.mix = song.mix || {}; var m = song.mix[c] = song.mix[c] || {};
      Object.keys(o || {}).forEach(function (k) { m[k] = o[k]; });
      applyMixGains(); applyGains(0.05);
    }
  };
  return engine;
}
var api = { create: create, chipDSPFactory: chipDSPFactory, ChipDSP: ChipDSP, chipEvents: chipEvents, CHANNELS: CH, mtof: mtof, registerKit: registerKit, registerSfx: registerSfx,
            kits: KITS, sfxSets: SFXSETS, sfxRef: sfxRef };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrackerEngine = api;
})(typeof window !== 'undefined' ? window : this);

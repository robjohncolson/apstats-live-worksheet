#!/usr/bin/env node
// Offline render of the chip channels of a v2 song with the SAME ChipDSP + chipEvents code the live AudioWorklet runs.
// usage: node render_chip.js <song.json> <seconds> <out.f32> [--t0=0.05] [--skip-intro] [--sr=44100] [--per-channel]
// output: stereo interleaved float32 (YM pan bits per note: centre = full level both sides; mix gains/mute/solo applied;
// engine master NOT applied). --per-channel also writes each channel's mono chip output.
var fs = require('fs'), path = require('path');
var E = require(path.join(__dirname, '..', 'tracker-engine.js'));
var a = process.argv.slice(2), opt = {};
a.filter(function (x) { return x.indexOf('--') === 0; }).forEach(function (x) { var kv = x.slice(2).split('='); opt[kv[0]] = kv[1] == null ? true : kv[1]; });
var pos = a.filter(function (x) { return x.indexOf('--') !== 0; });
var song = JSON.parse(fs.readFileSync(pos[0])), dur = +pos[1], out = pos[2], sr = +(opt.sr || 44100), t0 = opt.t0 != null ? +opt.t0 : 0.05;
if (opt.oplk) song.oplK = +opt.oplk;
var chans = song.channels.filter(function (c) { return c !== 'drums'; });
var kinds = chans.map(function (c) { return { name: c, kind: /^PSG/.test(c) ? 'psg' : (song.format === 'opl-v2' ? 'opl' : 'fm') }; });
var D = new E.ChipDSP(sr, kinds); if (song.levels) { D.L.fm = song.levels.fm || D.L.fm; D.L.psg = song.levels.psg || D.L.psg; D.L.opl = song.levels.opl || D.L.opl; }
var rd = 60 / song.bpm / song.rowsPerBeat, RPP = song.rowsPerPattern, seq = opt['skip-intro'] ? [] : (song.intro || []).slice(), t = t0, k = 0, mix = song.mix || {};
var solo = Object.keys(mix).filter(function (c) { return mix[c].solo; });
var pans = chans.map(function () { return []; });
while (t < dur) {
  var name = k < seq.length ? seq[k] : song.order[(k - seq.length) % song.order.length], P = song.patterns[name];
  chans.forEach(function (c, ci) { (P[c] || []).forEach(function (cell) { pans[ci].push([t + cell.r * rd, cell.pb != null ? cell.pb & 0xC0 : 0xC0]); E.chipEvents(song, c, ci, cell, t + cell.r * rd, rd, mix[c], 1).forEach(function (e) { D.push(e); }); }); });
  t += (P.rows || RPP) * rd; k++;
}
var N = Math.round(dur * sr), B = 512, bufs = chans.map(function () { return new Float32Array(B); }), res = chans.map(function () { return new Float32Array(N); });
for (var s = 0; s < N; s += B) {
  var n = Math.min(B, N - s); D.render(bufs, n);
  for (var i = 0; i < chans.length; i++) res[i].set(bufs[i].subarray(0, n), s);
}
// pan byte 0 (both outputs off) and mixer gains
var st = new Float32Array(N * 2);
chans.forEach(function (c, i) {
  var m = mix[c] || {}, g = (m.mute || (solo.length && solo.indexOf(c) < 0)) ? 0 : Math.pow(10, (m.vol || 0) / 20);
  if (opt['per-channel']) fs.writeFileSync(out + '.' + c, Buffer.from(res[i].buffer));
  var pl = pans[i].sort(function (a, b) { return a[0] - b[0]; }), pi = 0, pb = 0xC0;
  for (var j = 0; j < N; j++) {
    while (pi < pl.length && pl[pi][0] * sr <= j) pb = pl[pi++][1];
    var x = res[i][j] * g; if (pb & 0x80) st[2 * j] += x; if (pb & 0x40) st[2 * j + 1] += x;
  }
});
fs.writeFileSync(out, Buffer.from(st.buffer));

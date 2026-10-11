#!/usr/bin/env node
// Key-on/off log of the chip emulator (same ChipDSP + chipEvents as the live worklet, same row timing as render_chip.js):
// node tools/bass_log.js <song.json> <seconds> <channel>  -> JSON [[t, type, f, keyedSec], ...] for that channel on stdout
var fs = require('fs'), path = require('path'), E = require(path.join(__dirname, '..', 'tracker-engine.js'));
var a = process.argv.slice(2), song = JSON.parse(fs.readFileSync(a[0])), dur = +a[1], CH = a[2], sr = 44100, t0 = 0.05;
var chans = song.channels.filter(function (c) { return c !== 'drums'; });
var kinds = chans.map(function (c) { return { name: c, kind: /^PSG/.test(c) ? 'psg' : (song.format === 'opl-v2' ? 'opl' : 'fm') }; });
var D = new E.ChipDSP(sr, kinds); D.log = [];
var rd = 60 / song.bpm / song.rowsPerBeat, seq = (song.intro || []).slice(), t = t0, k = 0, mix = song.mix || {};
while (t < dur) {
  var name = k < seq.length ? seq[k] : song.order[(k - seq.length) % song.order.length], P = song.patterns[name];
  chans.forEach(function (c, ci) { (P[c] || []).forEach(function (cell) { E.chipEvents(song, c, ci, cell, t + cell.r * rd, rd, mix[c], 1).forEach(function (e) { D.push(e); }); }); });
  t += (P.rows || song.rowsPerPattern) * rd; k++;
}
var N = Math.round(dur * sr), B = 512, bufs = chans.map(function () { return new Float32Array(B); });
for (var s = 0; s < N; s += B) D.render(bufs, Math.min(B, N - s));
var ci = chans.indexOf(CH), L = D.log.filter(function (x) { return x[1] === ci && (x[2] === 'on' || x[2] === 'off'); }), out = [];
var on = null;   // effective keyed span: key-on until the next key-off/key-on actually processed for this channel
for (var i = 0; i < L.length; i++) {
  var x = L[i];
  if (x[2] === 'on') { if (on) on[3] = x[0] - t0 - on[0]; on = [x[0] - t0, 'on', x[3], null, x[4], x[5]]; out.push(on); }
  else if (on && (!x[4] || x[4] === on[4])) { on[3] = x[0] - t0 - on[0]; on = null; }   // an off of an older note is ignored by the DSP
}
process.stdout.write(JSON.stringify(out.map(function (o) { return [o[0], o[1], o[2], o[3], o[5]]; })));

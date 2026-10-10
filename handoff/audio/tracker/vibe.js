/* vibe.js — "vibe shifter": re-voices game SFX to the current song (key/scale, timbre, beat grid).
 * VibeShifter.create(ctx, dest, engine?) -> { playSfx(name, {quantize, vel}), setSong(song), setQuantize(bool), names }
 * Steps are [scaleDegree, lengthIn32nds, voice] ; degree is relative to the song tonic (0 = tonic, 7 = octave up
 * in a 7-note scale, negatives go down). voice: 'lead' | 'arp' | 'bass' (song instrument timbre) | 'noise' | 'kick'.
 * Voices come from engine.sfxVoice/sfxDrum, i.e. the current song's platform set (genesis FM / opl2 FM / nes);
 * with no song loaded the NES set is the default. Fallback key: C major, 120 BPM, no quantize.
 */
(function (root) {
'use strict';
var SFX = /*SFX_JSON_START*/{
  "jump":       {"oct": 0, "steps": [[0,1,"lead"],[2,1,"lead"],[4,1,"lead"],[7,2,"lead"]]},
  "land":       {"oct": -2, "steps": [[0,1,"kick"],[0,2,"bass"]]},
  "coin":       {"oct": 1, "steps": [[4,1,"arp"],[7,4,"arp"]]},
  "key":        {"oct": 1, "steps": [[0,1,"arp"],[2,1,"arp"],[4,1,"arp"],[7,1,"arp"],[9,1,"arp"],[11,1,"arp"],[14,4,"arp"]]},
  "door":       {"oct": -1, "steps": [[0,2,"noise"],[4,2,"bass"],[0,4,"bass"]]},
  "stageClear": {"oct": 0, "steps": [[0,2,"lead"],[2,2,"lead"],[4,2,"lead"],[7,3,"lead"],[4,1,"lead"],[7,8,"lead"]]},
  "ui":         {"oct": 1, "steps": [[4,1,"arp"]]},
  "error":      {"oct": -1, "steps": [[1,2,"lead"],[0,2,"lead"],[-1,5,"lead"]]}
}/*SFX_JSON_END*/;
var SCALES = { major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10], dorian: [0,2,3,5,7,9,10], mixolydian: [0,2,4,5,7,9,10], pentatonic: [0,2,4,7,9] };
var KEYS = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
var FALLBACK = { key: 'C', scale: 'major', bpm: 120, instruments: { lead: { wave: 'square' }, arp: { wave: 'square' }, bass: { wave: 'triangle' } } };
function degToMidi(deg, key, scale, oct) {
  var sc = SCALES[scale] || SCALES.major, n = sc.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n;
  var k = KEYS[key] || 0; if (k > 6) k -= 12;          // nearest transposition: -5..+6 semitones from C, never up to +11
  return 60 + k + sc[i] + 12 * (o + oct);
}
// Pitch safety: the top note of a melodic SFX lands in C4..C6 (60..84), bass SFX in C2..C4 (36..60), by whole-octave folds;
// rising sweeps are capped at one octave above their first note (notes beyond fold down an octave); then the user offset.
var TOP_RANGE = { melodic: [60, 84], bass: [36, 60] }, SWEEP_CAP = 12;
function sfxNotes(def, key, scale, offset) {
  var notes = def.steps.map(function (st) { return st[2] === 'noise' || st[2] === 'kick' ? null : degToMidi(st[0], key, scale, def.oct); });
  ['melodic', 'bass'].forEach(function (grp) {
    var idx = []; def.steps.forEach(function (st, i) { if (notes[i] != null && ((st[2] === 'bass') === (grp === 'bass'))) idx.push(i); });
    if (!idx.length) return;
    var first = notes[idx[0]];
    idx.forEach(function (i) { while (notes[i] > first + SWEEP_CAP) notes[i] -= 12; });
    var top = Math.max.apply(null, idx.map(function (i) { return notes[i]; })), r = TOP_RANGE[grp], sh = 0;
    while (top + sh > r[1]) sh -= 12;
    while (top + sh < r[0]) sh += 12;
    idx.forEach(function (i) { notes[i] += sh; });
  });
  return notes.map(function (n) { return n == null ? null : n + (offset || 0); });
}
function pulseWave(ctx, duty) {
  var n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (var k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty); im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty)); }
  return ctx.createPeriodicWave(re, im);
}
function create(ctx, dest, engine) {
  var song = null, quantize = true, cache = {};
  var out = ctx.createGain(); out.gain.value = 0.9; out.connect(engine && engine.sfxOut ? engine.sfxOut : dest);
  function cur() { return song || (engine && engine.song) || FALLBACK; }
  function startTime(q) {
    var now = ctx.currentTime + 0.005;
    if (q && engine && engine.isPlaying && engine.isPlaying()) return Math.max(now, engine.nextGridTime(16));
    return now;
  }
  function playSfx(name, opt) {
    opt = opt || {};
    var def = SFX[name]; if (!def) return false;
    var s = cur(), bpm = s.bpm || 120, t32 = 60 / bpm / 8, mx = (s.mix && s.mix.sfx) || {};
    var vel = (opt.vel != null ? opt.vel : 1) * Math.pow(10, (mx.vol || 0) / 20);
    var notes = sfxNotes(def, s.key || 'C', s.scale || 'major', Math.max(-12, Math.min(12, mx.pitch || 0))), si = 0;
    var q = opt.quantize != null ? opt.quantize : quantize, t = startTime(q);
    var tones = {}, gains = {};
    def.steps.forEach(function (st) {
      var midi = notes[si++];
      var deg = st[0], len = st[1] * t32, kind = st[2];
      if (kind === 'noise' || kind === 'kick') {
        if (engine && engine.sfxDrum) engine.sfxDrum(kind, t, vel, len);   // platform drum (YM / OPL / 2A03 LFSR)
      } else {
        if (!tones[kind]) { tones[kind] = engine.sfxVoice(kind); tones[kind].start(t); }   // platform voice: FM blip / OPL bloop / NES chirp
        var f = 440 * Math.pow(2, (midi - 69) / 12);
        tones[kind].setF(f, t);
        tones[kind].trig(t, len * 0.85, (kind === 'bass' ? 0.5 : 0.24) * vel, f);
      }
      t += len;
    });
    Object.keys(tones).forEach(function (k) { tones[k].stop(t + 0.3); });
    return true;
  }
  return { playSfx: playSfx, setSong: function (sg) { song = sg; }, setQuantize: function (q) { quantize = !!q; },
           names: Object.keys(SFX), out: out, degToMidi: degToMidi, sfxNotes: sfxNotes };
}
var api = { create: create, SFX: SFX, SCALES: SCALES, degToMidi: degToMidi, sfxNotes: sfxNotes };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VibeShifter = api;
})(typeof window !== 'undefined' ? window : this);

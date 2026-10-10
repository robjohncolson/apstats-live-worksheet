/* lib/sfx.js — one shared sound engine for the Desk, Study Break and the park (SFX_SPEC.md).
 *
 * Plain script (no modules). Exposes window.sfx:
 *   sfx.define(name, recipe)      register a sound (plain data, see "Recipes" below)
 *   sfx.play(name, opts)          play it; opts = { gain, x, width, pan, distance, priority, onEnded }
 *   sfx.setLevel('normal'|'quiet'|'off') / sfx.getLevel()   per-device level (localStorage)
 *   sfx.setDefaultLevel(level)    the level used until one is stored (the Desk: quiet, teachers normal)
 *   sfx.setLowPower('auto'|'on'|'off') / sfx.isLowPower()   low-power mode (localStorage); auto =
 *                                 <= 4 cores, <= 4 GB, or slow frames. Low power: no reverb, no
 *                                 panning, 6 voices, no pitch / level jitter.
 *   sfx.setGate(fn)               master switch: nothing plays while fn() is false (the Desk's Sound option)
 *   sfx.setChannelMuted(ch, bool) sub-bus mute for one recipe channel (e.g. 'game', 'park')
 *
 * Graph (built once, on the first play after a user gesture):
 *   voice -> [panner] -> ui | duck -> sfx -> master(level) -> limiter -> ceiling(-3 dBFS) -> destination
 *   voice -> send -> reverb (synthesised 1.2 s stereo impulse, low-passed 6 kHz) -> master
 *   The reverb is built the first time a sound needs it (never in low power); its impulse is
 *   synthesised once per sample rate and reused by every later context.
 * Priority voices skip the ducker and dip every other sfx voice to -8 dB for 250 ms.
 *
 * Recipes:
 *   { bus: 'ui'|'sfx', channel, gain, priority, reverb (send 0..1), width (stereo spread of the notes),
 *     detune (± cents, default 40), gainJitter (± dB, default 1.5), roundRobin: [partial recipes],
 *     transient: { dur, gain, filter },             a noise click at t = 0
 *     body: [ note ],                               oscillators and noise bursts
 *     sample: url }                                 a recorded sound instead of a body
 *   note = { osc: 'sine'|'square'|'triangle'|'sawtooth', freq, freqEnd, at, dur, gain, env, attack, points }
 *        | { noise: true, at, dur, gain, amp, filter: { type, freq, q } }
 *   env: 'decay' (default: start at the peak, exponential fall to 0.001 over dur)
 *        'strike' (linear attack over `attack` s, default 2 ms, then the same fall over dur)
 *        'points' (points: [['set'|'linear'|'exp', fraction of the peak, seconds after the start]])
 *
 * Sound is never part of any simulation. Every public call is wrapped: without Web Audio (or on
 * any failure) play() returns false and never throws into its caller.
 */
(function (root) {
  'use strict';
  if (!root || (root.sfx && typeof root.sfx.define === 'function')) return;

  var LEVEL_KEY = 'apstats-sfx-level';
  var LEVEL_GAIN = { normal: 1, quiet: 0.35, off: 0 };   // quiet is about -9 dB
  var CEILING = 0.708;                                   // -3 dBFS after the limiter
  var MAX_VOICES = 12;
  var LOW_POWER_VOICES = 6;
  var LOW_POWER_KEY = 'apstats-sfx-lowpower';
  var LOW_POWER_SETTINGS = ['auto', 'on', 'off'];
  var SLOW_FRAME_MS = 25;                                // probe: a median frame slower than this is slow
  var PROBE_FRAMES = 30;
  var DUCK_GAIN = 0.398;                                 // -8 dB
  var DUCK_ATTACK = 0.01, DUCK_HOLD = 0.25, DUCK_RELEASE = 0.4;
  var DEFAULT_DETUNE = 40;                               // cents (about ±2.3 %)
  var DEFAULT_JITTER_DB = 1.5;
  var DEFAULT_REVERB = 0.1;
  var PAN_LIMIT = 0.6;                                   // never hard left / right
  var DISTANCE_DB = 12;                                  // distance 1 = -12 dB
  var REVERB_SECONDS = 1.2, REVERB_LOWPASS = 6000;
  var SAMPLE_LATE_MS = 500;                              // a sample still decoding after this is skipped
  var GESTURES = ['pointerdown', 'keydown', 'touchstart'];

  var recipes = {};
  var lastVariant = {};
  var channelMuted = {};
  var samples = {};
  var voices = [];
  var gate = null;
  var gestured = false;
  var unavailable = false;
  var audio = null;
  var defaultLevel = 'quiet';
  var impulseCache = {};                                 // sampleRate -> AudioBuffer (built once)
  var probeSlow = false;

  // ── small helpers ──────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function dbToGain(db) { return Math.pow(10, db / 20); }
  function spread(amount) { return (Math.random() * 2 - 1) * amount; }
  function num(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }

  function setParam(param, value, t) {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, t);
    else param.value = value;
  }

  function safeDisconnect(node) {
    try { if (node && typeof node.disconnect === 'function') node.disconnect(); } catch (_) {}
  }

  // ── level and gates ────────────────────────────────────────────────────
  function getLevel() {
    try {
      var stored = root.localStorage && root.localStorage.getItem(LEVEL_KEY);
      return Object.prototype.hasOwnProperty.call(LEVEL_GAIN, stored) ? stored : defaultLevel;
    } catch (_) { return defaultLevel; }
  }

  function hasStoredLevel() {
    try {
      var stored = root.localStorage && root.localStorage.getItem(LEVEL_KEY);
      return Object.prototype.hasOwnProperty.call(LEVEL_GAIN, stored);
    } catch (_) { return false; }
  }

  function setDefaultLevel(level) {
    if (!Object.prototype.hasOwnProperty.call(LEVEL_GAIN, level)) return false;
    defaultLevel = level;
    if (audio) applyLevel(audio);
    return true;
  }

  // ── low power ──────────────────────────────────────────────────────────
  function getLowPowerSetting() {
    try {
      var stored = root.localStorage && root.localStorage.getItem(LOW_POWER_KEY);
      return LOW_POWER_SETTINGS.indexOf(stored) >= 0 ? stored : 'auto';
    } catch (_) { return 'auto'; }
  }

  function setLowPower(setting) {
    if (LOW_POWER_SETTINGS.indexOf(setting) < 0) return false;
    try { root.localStorage.setItem(LOW_POWER_KEY, setting); } catch (_) {}
    return true;
  }

  function slowDevice() {
    try {
      var nav = root.navigator || {};
      if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
      if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return true;
    } catch (_) {}
    return probeSlow;
  }

  function isLowPower() {
    var setting = getLowPowerSetting();
    if (setting === 'on') return true;
    if (setting === 'off') return false;
    return slowDevice();
  }

  // A short frame-time probe at load: the median of PROBE_FRAMES animation frames.
  function startFrameProbe() {
    if (typeof root.requestAnimationFrame !== 'function') return;
    var last = null, gaps = [];
    function frame(now) {
      if (last != null) gaps.push(now - last);
      last = now;
      if (gaps.length < PROBE_FRAMES) { root.requestAnimationFrame(frame); return; }
      gaps.sort(function (a, b) { return a - b; });
      probeSlow = gaps[Math.floor(gaps.length / 2)] > SLOW_FRAME_MS;
    }
    try { root.requestAnimationFrame(frame); } catch (_) {}
  }

  function setLevel(level) {
    if (!Object.prototype.hasOwnProperty.call(LEVEL_GAIN, level)) return false;
    try { root.localStorage.setItem(LEVEL_KEY, level); } catch (_) {}
    if (audio) applyLevel(audio);
    return true;
  }

  function applyLevel(a) {
    setParam(a.master.gain, LEVEL_GAIN[getLevel()], a.ctx.currentTime);
  }

  function isEnabled() {
    if (getLevel() === 'off') return false;
    if (typeof gate !== 'function') return true;
    try { return !!gate(); } catch (_) { return false; }
  }

  function hasUserActivation() {
    if (gestured) return true;
    try {
      var ua = root.navigator && root.navigator.userActivation;
      return !!(ua && ua.hasBeenActive);
    } catch (_) { return false; }
  }

  // ── the graph ──────────────────────────────────────────────────────────
  function makeLimiter(ctx) {
    if (typeof ctx.createDynamicsCompressor !== 'function') return null;
    var c = ctx.createDynamicsCompressor();
    var t = ctx.currentTime;
    setParam(c.threshold, -6, t);
    setParam(c.knee, 0, t);
    setParam(c.ratio, 20, t);
    setParam(c.attack, 0.001, t);
    setParam(c.release, 0.1, t);
    return c;
  }

  // 1.2 s of stereo noise with an exponential decay (about -60 dB at the end). Built once per
  // sample rate and cached: a new or resumed context reuses it (AudioBuffers are not tied to one).
  function makeImpulse(ctx) {
    var rate = ctx.sampleRate || 44100;
    if (impulseCache[rate]) return impulseCache[rate];
    var length = Math.max(1, Math.floor(rate * REVERB_SECONDS));
    var impulse = ctx.createBuffer(2, length, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-6.9 * i / length);
    }
    impulseCache[rate] = impulse;
    return impulse;
  }

  function makeReverb(ctx, out) {
    if (typeof ctx.createConvolver !== 'function' || typeof ctx.createBuffer !== 'function') return null;
    var input = ctx.createGain();
    var convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    input.connect(convolver);
    if (typeof ctx.createBiquadFilter === 'function') {
      var lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      setParam(lowpass.frequency, REVERB_LOWPASS, ctx.currentTime);
      convolver.connect(lowpass);
      lowpass.connect(out);
    } else {
      convolver.connect(out);
    }
    return input;
  }

  function buildGraph(ctx) {
    var a = { ctx: ctx, noise: {} };
    a.master = ctx.createGain();
    a.limiter = makeLimiter(ctx);
    a.ceiling = ctx.createGain();
    setParam(a.ceiling.gain, CEILING, ctx.currentTime);
    if (a.limiter) { a.master.connect(a.limiter); a.limiter.connect(a.ceiling); }
    else a.master.connect(a.ceiling);
    a.ceiling.connect(ctx.destination);

    a.ui = ctx.createGain();
    a.ui.connect(a.master);
    a.sfx = ctx.createGain();
    a.sfx.connect(a.master);
    a.duck = ctx.createGain();
    a.duck.connect(a.sfx);
    a.reverbIn = undefined;   // built on first need (ensureReverb), never in low power
    applyLevel(a);
    return a;
  }

  function ensureReverb(a) {
    if (a.reverbIn === undefined) a.reverbIn = makeReverb(a.ctx, a.master);
    return a.reverbIn;
  }

  function resume() {
    try {
      if (audio && audio.ctx.state === 'suspended' && typeof audio.ctx.resume === 'function') {
        var p = audio.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (_) {}
  }

  // Lazily, only once the page has had a user gesture (autoplay policy).
  function ensureContext() {
    if (audio) { resume(); return audio; }
    if (unavailable || !hasUserActivation()) return null;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (typeof AC !== 'function') { unavailable = true; return null; }
    try {
      audio = buildGraph(new AC());
    } catch (_) {
      audio = null;
      unavailable = true;
      return null;
    }
    resume();
    preloadSamples();
    return audio;
  }

  function onGesture() {
    gestured = true;
    resume();
  }

  startFrameProbe();

  try {
    GESTURES.forEach(function (type) { root.addEventListener(type, onGesture, true); });
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () {
        if (!root.document.hidden) resume();
      });
    }
  } catch (_) {}

  // ── recipes ────────────────────────────────────────────────────────────
  function copy(obj) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }

  function define(name, recipe) {
    if (typeof name !== 'string' || !recipe || typeof recipe !== 'object') return false;
    recipes[name] = copy(recipe);
    if (recipe.sample && audio) loadSample(recipe.sample);
    return true;
  }

  // A round-robin recipe plays one of its variants, never the same one twice in a row.
  function resolveRecipe(name) {
    var recipe = recipes[name];
    if (!recipe) return null;
    var list = recipe.roundRobin;
    if (!list || !list.length) return recipe;
    var i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === lastVariant[name]) i = (i + 1) % list.length;
    lastVariant[name] = i;
    var merged = copy(recipe);
    delete merged.roundRobin;
    var variant = list[i] || {};
    for (var k in variant) if (Object.prototype.hasOwnProperty.call(variant, k)) merged[k] = variant[k];
    return merged;
  }

  // ── placement and variation ────────────────────────────────────────────
  function panFor(opts) {
    if (typeof opts.pan === 'number' && isFinite(opts.pan)) return clamp(opts.pan, -1, 1);
    if (typeof opts.x !== 'number' || !isFinite(opts.x)) return 0;
    var width = num(opts.width, num(root.innerWidth, 0));
    if (width <= 0) return 0;
    var fraction = clamp(opts.x / width, 0, 1);
    return (fraction * 2 - 1) * PAN_LIMIT;
  }

  function distanceGain(distance) {
    return dbToGain(-DISTANCE_DB * clamp(num(distance, 0), 0, 1));
  }

  function detuneFor(recipe) {
    return spread(Math.abs(num(recipe.detune, DEFAULT_DETUNE)));
  }

  function jitterFor(recipe) {
    return dbToGain(spread(Math.abs(num(recipe.gainJitter, DEFAULT_JITTER_DB))));
  }

  // A stereo panner when the browser has one; otherwise the signal goes straight through.
  function panInto(ctx, dest, pan) {
    if (!pan || typeof ctx.createStereoPanner !== 'function') return { input: dest, node: null };
    var panner = ctx.createStereoPanner();
    setParam(panner.pan, clamp(pan, -1, 1), ctx.currentTime);
    panner.connect(dest);
    return { input: panner, node: panner };
  }

  // ── envelopes and notes ────────────────────────────────────────────────
  // Schedules the gain envelope; returns when the note may stop.
  function envelope(param, note, t, peak) {
    var dur = num(note.dur, 0.1);
    if (note.env === 'points' && note.points && note.points.length) {
      note.points.forEach(function (point) {
        var kind = point[0], value = point[1] * peak, at = t + point[2];
        if (kind === 'linear') param.linearRampToValueAtTime(value, at);
        else if (kind === 'exp') param.exponentialRampToValueAtTime(Math.max(value, 0.0001), at);
        else param.setValueAtTime(value, at);
      });
      return t + dur;
    }
    if (note.env === 'strike') {
      var attack = num(note.attack, 0.002);
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak, t + attack);
      param.exponentialRampToValueAtTime(0.001, t + attack + dur);
      return t + attack + dur;
    }
    param.setValueAtTime(peak, t);
    param.exponentialRampToValueAtTime(0.001, t + dur);
    return t + dur;
  }

  function noiseBuffer(a, dur, amp) {
    var key = dur + '|' + amp;
    if (a.noise[key]) return a.noise[key];
    var rate = a.ctx.sampleRate || 44100;
    var size = Math.max(1, Math.floor(rate * dur));
    var buffer = a.ctx.createBuffer(1, size, rate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * amp;
    a.noise[key] = buffer;
    return buffer;
  }

  function oscNote(a, note, t0, dest, peak, cents) {
    var ctx = a.ctx;
    var t = t0 + num(note.at, 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = note.osc || 'sine';
    o.frequency.setValueAtTime(note.freq, t);
    if (note.freqEnd) o.frequency.exponentialRampToValueAtTime(note.freqEnd, t + num(note.dur, 0.1));
    if (cents && o.detune && typeof o.detune.setValueAtTime === 'function') o.detune.setValueAtTime(cents, t);
    var stopAt = envelope(g.gain, note, t, peak);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(stopAt);
    return { source: o, end: stopAt };
  }

  function noiseNote(a, note, t0, dest, peak) {
    var ctx = a.ctx;
    var t = t0 + num(note.at, 0);
    var dur = num(note.dur, 0.05);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(a, dur, num(note.amp, 1));
    var head = src;
    if (note.filter && typeof ctx.createBiquadFilter === 'function') {
      var f = ctx.createBiquadFilter();
      f.type = note.filter.type || 'bandpass';
      f.frequency.setValueAtTime(note.filter.freq, t);
      if (note.filter.q != null) f.Q.setValueAtTime(note.filter.q, t);
      src.connect(f);
      head = f;
    }
    var g = ctx.createGain();
    head.connect(g);
    g.connect(dest);
    envelope(g.gain, note, t, peak);
    src.start(t);
    src.stop(t + dur);
    return { source: src, end: t + dur };
  }

  // ── voices ─────────────────────────────────────────────────────────────
  function stopVoice(voice) {
    if (voice.stopped) return;
    voice.stopped = true;
    voice.sources.forEach(function (s) { try { s.stop(0); } catch (_) {} });
    voice.nodes.forEach(safeDisconnect);
  }

  // Keep at most `cap` voices sounding (12, or 6 in low power): drop the oldest non-priority voice (else the oldest).
  function makeRoom(now, cap) {
    voices = voices.filter(function (v) { return !v.stopped && v.end > now; });
    while (voices.length >= cap) {
      var victim = voices.filter(function (v) { return !v.priority; })[0] || voices[0];
      stopVoice(victim);
      voices.splice(voices.indexOf(victim), 1);
    }
  }

  // Dip every non-priority sfx voice to -8 dB for 250 ms, then recover over 400 ms.
  function duck(a, t) {
    var p = a.duck.gain;
    if (typeof p.cancelScheduledValues === 'function') p.cancelScheduledValues(t);
    p.setValueAtTime(num(p.value, 1), t);
    p.linearRampToValueAtTime(DUCK_GAIN, t + DUCK_ATTACK);
    p.setValueAtTime(DUCK_GAIN, t + DUCK_HOLD);
    p.linearRampToValueAtTime(1, t + DUCK_HOLD + DUCK_RELEASE);
  }

  function busFor(a, recipe, priority) {
    if (recipe.bus === 'ui') return a.ui;
    return priority ? a.sfx : a.duck;
  }

  function finishWhenDone(voice, opts) {
    var last = null;
    voice.sources.forEach(function (s) { if (!last || s._sfxEnd > last._sfxEnd) last = s; });
    if (!last) return;
    last.onended = function () {
      voice.nodes.forEach(safeDisconnect);
      voice.stopped = true;
      if (typeof opts.onEnded === 'function') { try { opts.onEnded(); } catch (_) {} }
    };
  }

  // One voice: [notes] -> input (jitter, distance) -> panner -> bus, and a reverb send.
  function startVoice(a, recipe, opts, sampleBuffer) {
    var ctx = a.ctx;
    var t = ctx.currentTime;
    var priority = !!(opts.priority || recipe.priority);
    var lowPower = isLowPower();
    makeRoom(t, lowPower ? LOW_POWER_VOICES : MAX_VOICES);

    var input = ctx.createGain();
    setParam(input.gain, (lowPower ? 1 : jitterFor(recipe)) * distanceGain(opts.distance), t);
    var placed = panInto(ctx, busFor(a, recipe, priority), lowPower ? 0 : panFor(opts));
    input.connect(placed.input);
    var voice = { start: t, end: t, priority: priority, sources: [], nodes: [input], stopped: false };
    if (placed.node) voice.nodes.push(placed.node);

    var send = lowPower ? 0 : num(recipe.reverb, DEFAULT_REVERB);
    if (send > 0 && ensureReverb(a)) {
      var sendGain = ctx.createGain();
      setParam(sendGain.gain, send, t);
      (placed.node || input).connect(sendGain);
      sendGain.connect(a.reverbIn);
      voice.nodes.push(sendGain);
    }
    if (priority) duck(a, t);

    var level = num(recipe.gain, 1) * num(opts.gain, 1);
    var cents = lowPower ? 0 : detuneFor(recipe);
    function track(result) {
      result.source._sfxEnd = result.end;
      voice.sources.push(result.source);
      if (result.end > voice.end) voice.end = result.end;
    }

    if (sampleBuffer) {
      var src = ctx.createBufferSource();
      src.buffer = sampleBuffer;
      if (cents && src.detune && typeof src.detune.setValueAtTime === 'function') src.detune.setValueAtTime(cents, t);
      src.connect(input);
      src.start(t);
      track({ source: src, end: t + num(sampleBuffer.duration, 1) });
    }
    if (recipe.transient) {
      track(noiseNote(a, recipe.transient, t, input, num(recipe.transient.gain, 0.3) * level));
    }
    var body = recipe.body || [];
    var width = lowPower ? 0 : num(recipe.width, 0);
    body.forEach(function (note, i) {
      var offset = body.length > 1 ? width * ((i / (body.length - 1)) * 2 - 1) : 0;
      var dest = panInto(ctx, input, offset);
      if (dest.node) voice.nodes.push(dest.node);
      var peak = num(note.gain, 1) * level;
      track(note.noise ? noiseNote(a, note, t, dest.input, peak) : oscNote(a, note, t, dest.input, peak, cents));
    });

    voices.push(voice);
    finishWhenDone(voice, opts);
    return voice;
  }

  // ── samples (recorded sounds) ──────────────────────────────────────────
  function loadSample(url) {
    if (samples[url]) { decodeSample(samples[url]); return samples[url]; }
    var entry = { url: url, data: null, buffer: null, failed: false, decoding: false, waiting: [] };
    samples[url] = entry;
    if (typeof root.fetch !== 'function') { entry.failed = true; return entry; }
    try {
      root.fetch(url)
        .then(function (res) { return res && res.ok ? res.arrayBuffer() : Promise.reject(new Error('sample ' + url)); })
        .then(function (data) { entry.data = data; decodeSample(entry); })
        .catch(function () { entry.failed = true; entry.waiting = []; });
    } catch (_) { entry.failed = true; }
    return entry;
  }

  function decodeSample(entry) {
    if (!audio || !entry.data || entry.buffer || entry.decoding) return;
    entry.decoding = true;
    var data = entry.data;
    entry.data = null;
    function done(buffer) {
      entry.buffer = buffer;
      var due = Date.now() - SAMPLE_LATE_MS;
      var waiting = entry.waiting;
      entry.waiting = [];
      waiting.forEach(function (w) {
        if (w.at >= due) { try { startVoice(audio, w.recipe, w.opts, buffer); } catch (_) {} }
      });
    }
    function fail() { entry.failed = true; entry.waiting = []; }
    try {
      var p = audio.ctx.decodeAudioData(data, done, fail);
      if (p && typeof p.catch === 'function') p.catch(fail);
    } catch (_) { fail(); }
  }

  function preloadSamples() {
    Object.keys(recipes).forEach(function (name) {
      if (recipes[name].sample) loadSample(recipes[name].sample);
    });
  }

  function playSample(a, recipe, opts) {
    var entry = loadSample(recipe.sample);
    if (entry.failed) return false;
    if (entry.buffer) { startVoice(a, recipe, opts, entry.buffer); return true; }
    entry.waiting.push({ recipe: recipe, opts: opts, at: Date.now() });
    return true;
  }

  // ── play ───────────────────────────────────────────────────────────────
  function play(name, opts) {
    try {
      opts = opts || {};
      if (!isEnabled()) return false;
      var recipe = resolveRecipe(name);
      if (!recipe) return false;
      if (recipe.channel && channelMuted[recipe.channel]) return false;
      var a = ensureContext();
      if (!a) return false;
      applyLevel(a);   // another tab may have changed the level
      if (recipe.sample) return playSample(a, recipe, opts);
      startVoice(a, recipe, opts, null);
      return true;
    } catch (_) {
      return false;
    }
  }

  root.sfx = {
    LEVELS: ['normal', 'quiet', 'off'],
    define: define,
    play: play,
    has: function (name) { return Object.prototype.hasOwnProperty.call(recipes, name); },
    getLevel: getLevel,
    setLevel: setLevel,
    hasStoredLevel: hasStoredLevel,
    setDefaultLevel: setDefaultLevel,
    getLowPower: getLowPowerSetting,
    setLowPower: setLowPower,
    isLowPower: isLowPower,
    setGate: function (fn) { gate = typeof fn === 'function' ? fn : null; },
    setChannelMuted: function (channel, muted) { channelMuted[channel] = !!muted; },
    isChannelMuted: function (channel) { return !!channelMuted[channel]; },
    unlock: onGesture,
    // Test hooks (tests/sfx.test.js and the Study Break suites): inject a stand-in context.
    _test: {
      useContext: function (ctx) { voices = []; unavailable = false; audio = ctx ? buildGraph(ctx) : null; return audio; },
      reset: function () {
        voices = []; audio = null; gate = null; gestured = false; unavailable = false;
        lastVariant = {}; channelMuted = {}; samples = {}; impulseCache = {};
        defaultLevel = 'quiet'; probeSlow = false;
      },
      resume: resume,
      voices: function () { return voices.slice(); },
      graph: function () { return audio; },
      constants: {
        LEVEL_GAIN: LEVEL_GAIN, CEILING: CEILING, MAX_VOICES: MAX_VOICES, LOW_POWER_VOICES: LOW_POWER_VOICES, DUCK_GAIN: DUCK_GAIN,
        DUCK_HOLD: DUCK_HOLD, DUCK_RELEASE: DUCK_RELEASE, PAN_LIMIT: PAN_LIMIT,
      },
    },
  };
})(typeof window !== 'undefined' ? window : this);

// @vitest-environment jsdom
/**
 * tests/sfx.test.js — SFX_SPEC.md §3: the shared sound engine (lib/sfx.js) in jsdom with a fake
 * AudioContext that records every node, connection and parameter event.
 *   lazy creation only after a gesture; master switch off => no node created / started; the quiet
 *   level gain; limiter / reverb / panner wiring per play; variation within bounds; round-robin
 *   never repeats; the voice cap; ducking timing; play never throws without audio.
 * Plus the migration wiring in the Desk / pico-home / park (structural pins).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const LIB = fs.readFileSync(path.join(root, 'lib', 'sfx.js'), 'utf8');
const DESK = fs.readFileSync(path.join(root, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const PICO = fs.readFileSync(path.join(root, 'pico-home.js'), 'utf8');

// ── a recording Web Audio stand-in ─────────────────────────────────────────
function makeFakeAudio() {
  const created = [];
  const param = (owner, name, value = 1) => {
    const events = [];
    const p = {
      value,
      events,
      setValueAtTime(v, t) { events.push(['set', v, t]); p.value = v; },
      linearRampToValueAtTime(v, t) { events.push(['linear', v, t]); },
      exponentialRampToValueAtTime(v, t) { events.push(['exp', v, t]); },
      cancelScheduledValues(t) { events.push(['cancel', t]); },
    };
    owner[name] = p;
    return p;
  };
  const node = (kind, params = []) => {
    const n = { kind, outputs: [], disconnected: false };
    n.connect = (next) => { n.outputs.push(next); return next; };
    n.disconnect = () => { n.disconnected = true; };
    params.forEach((name) => param(n, name));
    created.push(n);
    return n;
  };
  class FakeAudioContext {
    constructor() {
      this.currentTime = 5;
      this.sampleRate = 100;
      this.state = 'running';
      this.destination = { kind: 'destination' };
      FakeAudioContext.instances.push(this);
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return node('gain', ['gain']); }
    createDynamicsCompressor() { return node('compressor', ['threshold', 'knee', 'ratio', 'attack', 'release']); }
    createConvolver() { return node('convolver'); }
    createBiquadFilter() { return node('biquad', ['frequency', 'Q']); }
    createStereoPanner() { return node('panner', ['pan']); }
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      FakeAudioContext.buffers.push(channels);
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (c) => data[c] };
    }
    createOscillator() {
      const o = node('osc', ['frequency', 'detune']);
      o.start = (t) => { o.startAt = t; };
      o.stop = (t) => { o.stopAt = t; };
      return o;
    }
    createBufferSource() {
      const s = node('buffer', ['detune', 'playbackRate']);
      s.start = (t) => { s.startAt = t; };
      s.stop = (t) => { s.stopAt = t; };
      return s;
    }
  }
  FakeAudioContext.instances = [];
  FakeAudioContext.buffers = [];
  return { FakeAudioContext, created };
}

let fake;
let sfx;

function loadEngine() {
  delete window.sfx;
  window.eval(LIB);
  sfx = window.sfx;
  sfx._test.reset();
}

function gesture() {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a' }));
}

const blip = { bus: 'ui', reverb: 0.2, detune: 0, gainJitter: 0,
  transient: { dur: 0.003, gain: 0.5, filter: { type: 'highpass', freq: 2500 } },
  body: [{ osc: 'triangle', env: 'strike', freq: 1320, dur: 0.04, gain: 0.7 }] };

beforeEach(() => {
  fake = makeFakeAudio();
  window.AudioContext = fake.FakeAudioContext;
  try { window.localStorage.clear(); } catch (_) {}
  // The full-quality path unless a test turns low power on (jsdom reports few CPU cores).
  window.localStorage.setItem('apstats-sfx-lowpower', 'off');
  loadEngine();
  sfx.define('t:blip', blip);
});

afterEach(() => {
  delete window.AudioContext;
  vi.restoreAllMocks();
});

const oscs = () => fake.created.filter((n) => n.kind === 'osc');
const graph = () => sfx._test.graph();

describe('lazy creation and the master switch', () => {
  it('creates no AudioContext before a user gesture, then one on the first play after it', () => {
    expect(sfx.play('t:blip')).toBe(false);
    expect(fake.FakeAudioContext.instances).toHaveLength(0);
    gesture();
    expect(fake.FakeAudioContext.instances).toHaveLength(0);   // a gesture alone builds nothing
    expect(sfx.play('t:blip')).toBe(true);
    expect(sfx.play('t:blip')).toBe(true);
    expect(fake.FakeAudioContext.instances).toHaveLength(1);   // one context, reused
  });

  it('master switch off (the Desk Sound option) => no node created or started', () => {
    gesture();
    let soundOn = false;
    sfx.setGate(() => soundOn);
    expect(sfx.play('t:blip')).toBe(false);
    expect(fake.created).toHaveLength(0);
    expect(fake.FakeAudioContext.instances).toHaveLength(0);
    soundOn = true;
    expect(sfx.play('t:blip')).toBe(true);
    expect(oscs()).toHaveLength(1);
  });

  it('level off plays nothing; a channel (sub-bus) mute silences only that channel', () => {
    gesture();
    sfx.setLevel('off');
    expect(sfx.play('t:blip')).toBe(false);
    expect(fake.created).toHaveLength(0);
    sfx.setLevel('normal');
    sfx.define('t:game', { ...blip, channel: 'game' });
    sfx.setChannelMuted('game', true);
    expect(sfx.play('t:game')).toBe(false);
    expect(sfx.play('t:blip')).toBe(true);
  });

  it('play never throws: no Web Audio, a broken context, an unknown name, bad options', () => {
    delete window.AudioContext;
    loadEngine();
    gesture();
    sfx.define('t:blip', blip);
    expect(() => sfx.play('t:blip')).not.toThrow();
    expect(sfx.play('t:blip')).toBe(false);
    window.AudioContext = function () { return { state: 'running', resume() {}, currentTime: 0 }; };   // like the journey harness
    loadEngine();
    gesture();
    sfx.define('t:blip', blip);
    expect(sfx.play('t:blip')).toBe(false);
    window.AudioContext = function () { throw new Error('no device'); };
    loadEngine();
    gesture();
    expect(sfx.play('t:blip')).toBe(false);
    expect(sfx.play('nope', { x: 'left', distance: NaN })).toBe(false);
  });
});

describe('the graph and the quieter level', () => {
  it('master -> limiter (-6 dB, ratio 20, fast attack) -> -3 dBFS ceiling -> destination', () => {
    gesture();
    sfx.play('t:blip');
    const g = graph();
    expect(g.master.outputs).toEqual([g.limiter]);
    expect(g.limiter.threshold.value).toBe(-6);
    expect(g.limiter.ratio.value).toBe(20);
    expect(g.limiter.attack.value).toBeLessThanOrEqual(0.003);
    expect(g.limiter.outputs).toEqual([g.ceiling]);
    expect(g.ceiling.gain.value).toBeLessThanOrEqual(0.708);
    expect(g.ceiling.outputs[0].kind).toBe('destination');
    expect(g.ui.outputs).toEqual([g.master]);
    expect(g.duck.outputs).toEqual([g.sfx]);
    expect(g.sfx.outputs).toEqual([g.master]);
  });

  it('the reverb: a convolver with a 1.2 s stereo decaying impulse, low-passed 6 kHz', () => {
    gesture();
    sfx.play('t:blip');
    const conv = fake.created.find((n) => n.kind === 'convolver');
    expect(conv.buffer.numberOfChannels).toBe(2);
    expect(conv.buffer.duration).toBeCloseTo(1.2, 5);
    const data = conv.buffer.getChannelData(0);
    const head = Math.max(...data.slice(0, 10).map(Math.abs));
    const tail = Math.max(...data.slice(-10).map(Math.abs));
    expect(tail).toBeLessThan(head);
    const lowpass = conv.outputs[0];
    expect(lowpass.type).toBe('lowpass');
    expect(lowpass.frequency.value).toBe(6000);
  });

  it('quiet level sets the master gain (and persists per device); normal restores it', () => {
    gesture();
    sfx.setLevel('normal');
    sfx.play('t:blip');
    expect(graph().master.gain.value).toBe(1);
    sfx.setLevel('quiet');
    expect(window.localStorage.getItem('apstats-sfx-level')).toBe('quiet');
    expect(sfx.getLevel()).toBe('quiet');
    expect(graph().master.gain.value).toBeCloseTo(0.35, 5);
    sfx.setLevel('normal');
    expect(graph().master.gain.value).toBe(1);
    expect(sfx.setLevel('loud')).toBe(false);
  });

  it('per play: notes -> voice input -> panner -> bus, with a reverb send at the recipe level', () => {
    gesture();
    sfx.play('t:blip', { x: 1000, width: 1000 });
    const g = graph();
    const osc = oscs()[0];
    const env = osc.outputs[0];
    const input = env.outputs[0];
    const panner = input.outputs[0];
    expect(panner.kind).toBe('panner');
    expect(panner.pan.value).toBeCloseTo(0.6, 5);           // right edge => +0.6, never hard right
    expect(panner.outputs).toContain(g.ui);
    const send = panner.outputs.find((n) => n !== g.ui);
    expect(send.gain.value).toBeCloseTo(0.2, 5);
    expect(send.outputs).toEqual([g.reverbIn]);
    // the 3 ms noise transient, high-passed
    const noise = fake.created.find((n) => n.kind === 'buffer');
    expect(noise.stopAt - noise.startAt).toBeCloseTo(0.003, 6);
    expect(noise.outputs[0].type).toBe('highpass');
  });

  it('pan from screen x spans -0.6..+0.6; distance 1 attenuates the voice by 12 dB', () => {
    gesture();
    sfx.play('t:blip', { x: 0, width: 800 });
    const leftPanner = fake.created.filter((n) => n.kind === 'panner').at(-1);
    expect(leftPanner.pan.value).toBeCloseTo(-0.6, 5);
    sfx.play('t:blip', { distance: 1 });
    const input = oscs().at(-1).outputs[0].outputs[0];
    expect(input.gain.value).toBeCloseTo(Math.pow(10, -12 / 20), 5);
  });

  it('stereo width spreads a chord across the field', () => {
    gesture();
    sfx.define('t:chord', { bus: 'sfx', detune: 0, width: 0.3, body: [
      { osc: 'sine', freq: 440, dur: 0.2, gain: 0.3 }, { osc: 'sine', freq: 554, dur: 0.2, gain: 0.3 }, { osc: 'sine', freq: 659, dur: 0.2, gain: 0.3 }] });
    sfx.play('t:chord');
    const pans = oscs().map((o) => o.outputs[0].outputs[0]).map((p) => p.pan && p.pan.value);
    expect(pans[0]).toBeCloseTo(-0.3, 5);
    expect(pans[2]).toBeCloseTo(0.3, 5);
  });
});

describe('variation', () => {
  it('detune and gain jitter stay within their bounds (defaults ±40 cents, ±1.5 dB)', () => {
    gesture();
    sfx.define('t:var', { bus: 'sfx', body: [{ osc: 'sine', freq: 500, dur: 0.05, gain: 1 }] });
    for (let i = 0; i < 200; i++) sfx.play('t:var');
    const cents = oscs().map((o) => (o.detune.events[0] || ['set', 0])[1]);
    expect(Math.max(...cents.map(Math.abs))).toBeLessThanOrEqual(40);
    expect(new Set(cents.map((c) => Math.round(c))).size).toBeGreaterThan(5);   // it does vary
    const gains = oscs().map((o) => o.outputs[0].outputs[0].gain.value);
    const lo = Math.pow(10, -1.5 / 20), hi = Math.pow(10, 1.5 / 20);
    for (const g of gains) { expect(g).toBeGreaterThanOrEqual(lo - 1e-9); expect(g).toBeLessThanOrEqual(hi + 1e-9); }
    expect(oscs().every((o) => o.frequency.events[0][1] === 500)).toBe(true);   // the note itself is exact
  });

  it('detune 0 keeps the pitch exact (the Tetris bells and chimes)', () => {
    gesture();
    sfx.play('t:blip');
    expect(oscs()[0].detune.events).toHaveLength(0);
  });

  it('round-robin never plays the same variant twice in a row', () => {
    gesture();
    sfx.define('t:rr', { bus: 'sfx', detune: 0, roundRobin: [
      { body: [{ osc: 'sine', freq: 300, dur: 0.02, gain: 1 }] },
      { body: [{ osc: 'sine', freq: 400, dur: 0.02, gain: 1 }] },
      { body: [{ osc: 'sine', freq: 500, dur: 0.02, gain: 1 }] }] });
    const order = [];
    for (let i = 0; i < 60; i++) {
      sfx._test.graph() && (sfx._test.graph().ctx.currentTime += 1);   // let old voices end
      sfx.play('t:rr');
      order.push(oscs().at(-1).frequency.events[0][1]);
    }
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    expect(new Set(order).size).toBe(3);
  });
});

describe('voice cap and ducking', () => {
  it('at most 12 voices: the oldest non-priority voice is dropped', () => {
    gesture();
    sfx.define('t:long', { bus: 'sfx', detune: 0, body: [{ osc: 'sine', freq: 200, dur: 5, gain: 1 }] });
    sfx.define('t:alert', { bus: 'sfx', priority: true, detune: 0, body: [{ osc: 'sine', freq: 900, dur: 5, gain: 1 }] });
    sfx.play('t:alert');
    for (let i = 0; i < 12; i++) sfx.play('t:long');
    expect(sfx._test.voices()).toHaveLength(12);
    const all = oscs();
    expect(all[0].stopAt).toBeCloseTo(5 + 5, 5);   // the priority voice survives
    expect(all[1].stopAt).toBe(0);                  // the oldest non-priority voice was stopped
    expect(all[1].outputs[0].outputs[0].disconnected).toBe(true);
  });

  it('a priority sound dips the sfx bus to -8 dB for 250 ms, recovering over 400 ms; it skips the ducker', () => {
    gesture();
    sfx.define('t:alert', { bus: 'sfx', priority: true, detune: 0, body: [{ osc: 'sine', freq: 900, dur: 0.3, gain: 1 }] });
    sfx.play('t:alert');
    const g = graph();
    const t = g.ctx.currentTime;
    const events = g.duck.gain.events;
    const dip = Math.pow(10, -8 / 20);
    expect(events).toContainEqual(['linear', expect.closeTo(dip, 2), expect.closeTo(t + 0.01, 6)]);
    expect(events).toContainEqual(['set', expect.closeTo(dip, 2), expect.closeTo(t + 0.25, 6)]);
    expect(events.at(-1)).toEqual(['linear', 1, expect.closeTo(t + 0.65, 6)]);
    const input = oscs()[0].outputs[0].outputs[0];
    expect(input.outputs).toContain(g.sfx);           // straight to sfx, not through the ducker
    sfx.play('t:blip');                               // ui is never ducked
    sfx.define('t:plain', { bus: 'sfx', detune: 0, body: [{ osc: 'sine', freq: 300, dur: 0.1, gain: 1 }] });
    sfx.play('t:plain');
    expect(oscs().at(-1).outputs[0].outputs[0].outputs).toContain(g.duck);
  });

  it('opts.priority makes any recipe priority (the challenge alert)', () => {
    gesture();
    sfx.play('t:blip');
    const before = graph().duck.gain.events.length;
    sfx.play('t:blip', { priority: true });
    expect(graph().duck.gain.events.length).toBeGreaterThan(before);
  });
});

describe('envelopes reproduce the old hand-built sounds', () => {
  it("'decay' starts at the peak and falls to 0.001; 'strike' has a 2 ms linear attack", () => {
    gesture();
    sfx.define('t:decay', { bus: 'sfx', detune: 0, gainJitter: 0, body: [{ osc: 'sine', freq: 880, freqEnd: 440, at: 0.15, dur: 0.12, gain: 0.5 }] });
    sfx.play('t:decay', { gain: 0.6 });
    const o = oscs()[0];
    const t = graph().ctx.currentTime;
    expect(o.frequency.events).toEqual([['set', 880, expect.closeTo(t + 0.15, 9)], ['exp', 440, expect.closeTo(t + 0.27, 9)]]);
    expect(o.outputs[0].gain.events).toEqual([['set', expect.closeTo(0.3, 9), expect.closeTo(t + 0.15, 9)], ['exp', 0.001, expect.closeTo(t + 0.27, 9)]]);
    expect(o.startAt).toBeCloseTo(t + 0.15, 9);
    expect(o.stopAt).toBeCloseTo(t + 0.27, 9);
  });

  it("'points' schedules the given shape (the nudge chime)", () => {
    gesture();
    sfx.define('t:nudge', { bus: 'ui', detune: 0, gainJitter: 0, body: [{ osc: 'sine', freq: 880, dur: 0.2, gain: 0.08, env: 'points',
      points: [['set', 0, 0], ['linear', 1, 0.01], ['exp', 0.00125, 0.18]] }] });
    sfx.play('t:nudge');
    const t = graph().ctx.currentTime;
    const ev = oscs()[0].outputs[0].gain.events;
    expect(ev[0]).toEqual(['set', 0, t]);
    expect(ev[1][0]).toBe('linear'); expect(ev[1][1]).toBeCloseTo(0.08, 9); expect(ev[1][2]).toBeCloseTo(t + 0.01, 9);
    expect(ev[2][0]).toBe('exp'); expect(ev[2][1]).toBeCloseTo(0.0001, 9);
    expect(oscs()[0].stopAt).toBeCloseTo(t + 0.2, 9);
  });
});

describe('low power (AUDIO_IDEAS_HANDOFF §0)', () => {
  it('on: no convolver / reverb send and no panner nodes, even with x, width and reverb', () => {
    gesture();
    sfx.setLowPower('on');
    expect(sfx.isLowPower()).toBe(true);
    sfx.define('t:wide', { bus: 'sfx', reverb: 0.5, width: 0.4, body: [
      { osc: 'sine', freq: 440, dur: 0.1, gain: 1 }, { osc: 'sine', freq: 660, dur: 0.1, gain: 1 }] });
    sfx.play('t:wide', { x: 0, width: 800 });
    sfx.play('t:blip', { pan: 1 });
    expect(fake.created.filter((n) => n.kind === 'convolver')).toHaveLength(0);
    expect(fake.created.filter((n) => n.kind === 'panner')).toHaveLength(0);
    expect(graph().reverbIn).toBeUndefined();
  });

  it('on: the voice cap is 6', () => {
    gesture();
    sfx.setLowPower('on');
    sfx.define('t:long', { bus: 'sfx', body: [{ osc: 'sine', freq: 200, dur: 5, gain: 1 }] });
    for (let i = 0; i < 9; i++) sfx.play('t:long');
    expect(sfx._test.voices()).toHaveLength(6);
    expect(oscs().filter((o) => o.stopAt === 0)).toHaveLength(3);   // the three oldest were dropped
  });

  it('on: no pitch or level jitter, whatever the recipe asks for', () => {
    gesture();
    sfx.setLowPower('on');
    sfx.define('t:var', { bus: 'sfx', detune: 80, gainJitter: 6, body: [{ osc: 'sine', freq: 500, dur: 0.05, gain: 1 }] });
    for (let i = 0; i < 50; i++) sfx.play('t:var');
    expect(oscs().every((o) => o.detune.events.length === 0)).toBe(true);
    expect(oscs().every((o) => o.outputs[0].outputs[0].gain.value === 1)).toBe(true);
  });

  it('auto follows the device (<= 4 cores or <= 4 GB); on / off override it; bad values are refused', () => {
    const nav = window.navigator;
    const cores = vi.spyOn(nav, 'hardwareConcurrency', 'get').mockReturnValue(8);
    sfx.setLowPower('auto');
    expect(sfx.getLowPower()).toBe('auto');
    expect(sfx.isLowPower()).toBe(false);
    cores.mockReturnValue(4);
    expect(sfx.isLowPower()).toBe(true);
    cores.mockReturnValue(8);
    Object.defineProperty(nav, 'deviceMemory', { value: 2, configurable: true });
    expect(sfx.isLowPower()).toBe(true);
    sfx.setLowPower('off');
    expect(sfx.isLowPower()).toBe(false);
    expect(window.localStorage.getItem('apstats-sfx-lowpower')).toBe('off');
    delete nav.deviceMemory;
    expect(sfx.setLowPower('maybe')).toBe(false);
  });

  it('turning low power off later builds the reverb on the next sound that needs it', () => {
    gesture();
    sfx.setLowPower('on');
    sfx.play('t:blip');
    expect(graph().reverbIn).toBeUndefined();
    sfx.setLowPower('off');
    sfx.play('t:blip');
    expect(fake.created.filter((n) => n.kind === 'convolver')).toHaveLength(1);
  });
});

describe('the reverb impulse is built once (AUDIO_IDEAS_HANDOFF §0)', () => {
  it('one buffer across two resumes and a second context', () => {
    gesture();
    sfx.play('t:blip');
    const first = fake.created.find((n) => n.kind === 'convolver').buffer;
    const ctx = graph().ctx;
    ctx.state = 'suspended'; sfx._test.resume();
    sfx.play('t:blip');
    ctx.state = 'suspended'; sfx._test.resume();
    sfx.play('t:blip');
    sfx._test.useContext(new fake.FakeAudioContext());           // a fresh context (e.g. after a reload of audio)
    sfx.play('t:blip');
    const convolvers = fake.created.filter((n) => n.kind === 'convolver');
    expect(convolvers).toHaveLength(2);
    expect(convolvers[1].buffer).toBe(first);
    expect(fake.FakeAudioContext.buffers.filter((ch) => ch === 2)).toHaveLength(1);
  });
});

describe('default level by role (AUDIO_IDEAS_HANDOFF §0)', () => {
  const start = DESK.indexOf('function _sfxApplyRoleDefault(');
  const end = DESK.indexOf('\n}\n', start) + 2;
  const applyRoleDefault = new Function('window', DESK.slice(start, end) + '\nreturn _sfxApplyRoleDefault;')(window);

  it('the engine starts at quiet when nothing is stored', () => {
    expect(sfx.hasStoredLevel()).toBe(false);
    expect(sfx.getLevel()).toBe('quiet');
  });

  it('a signed-in student is stored as quiet; a teacher as normal', () => {
    applyRoleDefault({ username: 'apple_fox' }, false);
    expect(window.localStorage.getItem('apstats-sfx-level')).toBe('quiet');
    window.localStorage.removeItem('apstats-sfx-level');
    applyRoleDefault({ username: 'mr_c', role: 'teacher' }, true);
    expect(window.localStorage.getItem('apstats-sfx-level')).toBe('normal');
    expect(sfx.getLevel()).toBe('normal');
  });

  it('signed out: the default applies but nothing is stored; a level the user chose is never overwritten', () => {
    applyRoleDefault(null, true);
    expect(sfx.getLevel()).toBe('normal');
    expect(sfx.hasStoredLevel()).toBe(false);
    sfx.setLevel('quiet');                                         // a teacher who picked Quieter
    applyRoleDefault({ username: 'mr_c', role: 'teacher' }, true);
    expect(sfx.getLevel()).toBe('quiet');
  });

  it('updateUserRoleUI applies the role default', () => {
    expect(DESK).toMatch(/function updateUserRoleUI\(\) \{[\s\S]*?_sfxApplyRoleDefault\(who, isTeacher\)/);
  });
});

describe('families (AUDIO_IDEAS_HANDOFF §0): character from waveform and envelope', () => {
  function deskRecipes(objStart) {
    const start = DESK.indexOf(objStart);
    const src = DESK.slice(start, DESK.indexOf('\n};\n', start)) + '\n};';
    const name = objStart.match(/const (\w+)/)[1];
    window.MacSFX = window.MacSFX || { muted: false };
    return new Function(src + '\nreturn ' + name + '.recipes;')();
  }
  const oscTypes = (r) => [...new Set((r.body || []).filter((n) => !n.noise).map((n) => n.osc))];

  it('game cues are square / pulse with fast strikes; rewards are triangle bells with an octave', () => {
    const sb = deskRecipes('const SFX = {');
    for (const name of ['droplet', 'boing', 'sosumi', 'quack', 'wildEep', 'moof', 'monkey', 'logjam']) {
      expect(oscTypes(sb[name]), name).toEqual(['square']);
      expect(sb[name].body.filter((n) => !n.noise).every((n) => n.env === 'strike' && n.attack <= 0.001 && n.dur <= 0.2), name).toBe(true);
    }
    for (const name of ['indigo', 'koWin', 'goldChime', 'silverShimmer']) {
      expect(oscTypes(sb[name]), name).toEqual(['triangle']);
      const freqs = sb[name].body.map((n) => n.freq);
      expect(freqs.some((f) => freqs.some((g) => Math.abs(g - 2 * f) <= 1)), name).toBe(true);
    }
  });

  it('the Tetris bells and chimes keep their exact spec sines', () => {
    const sb = deskRecipes('const SFX = {');
    const sines = (name) => sb[name].body.filter((n) => !n.noise).map((n) => [n.osc, n.freq]);
    expect(sines('fuseSilver')).toEqual([['sine', 1318], ['sine', 1976]]);
    expect(sines('fuseGold')).toEqual([['sine', 1760], ['sine', 2637], ['sine', 3520]]);
    expect(sines('squareChimeSilver')).toEqual([['sine', 1318], ['sine', 1976]]);
    expect(sines('squareChimeGold')).toEqual([['sine', 1760], ['sine', 2637]]);
  });

  it('UI is short sine blips: click (closes) sweeps down, wildEep (app opens) sweeps up', () => {
    const ui = deskRecipes('const MacSFX = {');
    for (const name of ['click', 'wildEep', 'nudgeChime']) expect(oscTypes(ui[name]), name).toEqual(['sine']);
    expect(ui.click.body[0].freqEnd).toBeLessThan(ui.click.body[0].freq);
    expect(ui.wildEep.body.every((n) => n.freqEnd > n.freq)).toBe(true);
    expect(oscTypes(ui.candyChime)).toEqual(['triangle']);                 // a reward
    expect(ui.candyChime.body.map((n) => n.freq)).toEqual([880, 1760]);
  });
});

describe('the park (apstat-park/pico-audio.mjs) on the engine', () => {
  it('defines its sounds on the park channel and plays them placed relative to the own cat', async () => {
    const { createPicoAudio, placeSound } = await import('../apstat-park/pico-audio.mjs');
    const played = [], defined = {};
    const store = new Map();
    const listeners = {};
    const win = {
      localStorage: { getItem: (k) => store.get(k) ?? null },
      navigator: {},
      addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {},
      sfx: { define: (name, recipe) => { defined[name] = recipe; }, play: (name, opts) => { played.push([name, opts]); return true; } },
    };
    const audio = createPicoAudio(win);
    expect(defined['park:jump'].channel).toBe('park');
    expect(decodeURIComponent(defined['park:jump'].sample)).toContain('pico-jump.ogg');
    expect(audio.play('jump')).toBe(false);                   // no gesture yet
    listeners.keydown();
    expect(audio.play('key', placeSound({ x: 300, y: 0 }, { x: 100, y: 0 }, 400))).toBe(true);
    expect(played[0][0]).toBe('park:key');
    expect(played[0][1].pan).toBeCloseTo(0.3, 5);           // 200 px right of the own cat, span 400
    expect(played[0][1].distance).toBeCloseTo(0.5, 5);
    store.set('macsound-muted', 'true');
    expect(audio.play('jump')).toBe(false);                   // the calendar's Sound toggle still mutes
    store.set('macsound-muted', 'false');
    audio.clear();                                            // jingle, then the fanfare when it ends
    expect(played.at(-1)[0]).toBe('park:clear');
    played.at(-1)[1].onEnded();
    expect(played.at(-1)[0]).toBe('park:fanfare');
    expect(placeSound({ x: 5000, y: 0 }, { x: 0, y: 0 }, 400)).toEqual({ pan: 0.6, distance: 1 });
    audio.dispose();
  });
});

describe('migration wiring (structural)', () => {
  it('the Desk loads lib/sfx.js once, before its inline script; no direct AudioContext / oscillator / <audio> left', () => {
    const tags = DESK.match(/<script src="lib\/sfx\.js"[^>]*><\/script>/g) || [];
    expect(tags).toHaveLength(1);
    expect(DESK.indexOf('<script src="lib/sfx.js"')).toBeLessThan(DESK.indexOf('const SFX = {'));
    expect(DESK).not.toMatch(/new \(?window\.AudioContext|webkitAudioContext|createOscillator|new Audio\(/);
  });

  it('MacSFX and SFX route through window.sfx; the Sound option is the master gate', () => {
    expect(DESK).toMatch(/engine\.define\('mac:' \+ name, this\.recipes\[name\]\)/);
    expect(DESK).toMatch(/engine\.setGate\(function \(\) \{ return !MacSFX\.muted; \}\)/);
    expect(DESK).toMatch(/engine\.define\('sb:' \+ name, this\.recipes\[name\]\)/);
    expect(DESK).toMatch(/fuseGold: \{[^\n]*priority: true/);
    expect(DESK).toMatch(/squareChimeGold: \{[^\n]*priority: true/);
  });

  it('both challenge alerts are priority', () => {
    expect(DESK).toMatch(/SFX\.play\('sosumi', 0\.5, \{ priority: true \}\)/);
    expect(DESK).toMatch(/MacSFX\.play\('sosumi', 0\.5, \{ priority: true \}\)/);
  });

  it('the Quieter level is in the System 7 Sound menu and in the Pico OPTION list', () => {
    expect(DESK).toMatch(/id="menu-sound-quiet"[^>]*onclick="closeMenus\(\);_toggleSfxQuiet\(\);_renderMenuChecks\(\)"/);
    expect(DESK).toMatch(/function _toggleSfxQuiet\(\)/);
    expect(PICO).toMatch(/label: 'QUIETER: ' \+ \(quiet \? 'ON' : 'OFF'\)[^\n]*callDesk\('_toggleSfxQuiet'\)/);
  });

  it('the Desk sound recipes play on the real engine without throwing', () => {
    gesture();
    const start = DESK.indexOf('const SFX = {');
    const sfxSrc = DESK.slice(start, DESK.indexOf('\n};\n', start)) + '\n};\nwindow.__SFX = SFX;';
    window.MacSFX = { muted: false };
    window.eval(sfxSrc);
    const SFX = window.__SFX;
    for (const name of Object.keys(SFX.recipes)) {
      const before = fake.created.length;
      SFX.play(name, 0.5);
      expect(fake.created.length, name).toBeGreaterThan(before);
    }
    delete window.MacSFX;
  });
});

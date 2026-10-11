// Park music (teacher 2026-10-10): Grok's tracker engine + vibe shifter + palette, wired by
// park-music.mjs. Covers: the runtime copies match the handoff; the vibe shifter's pitch safety
// reproduces TRACKER_SPEC §4a's table for all five songs; the original Sega kits / SFX are registered; the engine's class / solo gating and
// lowPower voice cap; park-music's pick / play / class rules; pico-audio routing through the
// shifter; the stage-select music bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { drift, DATA } from '../scripts/sync-park-music.mjs';

const dom = new JSDOM('<!doctype html>', { pretendToBeVisual: true, url: 'https://example.test/' });
const win = dom.window;
globalThis.window = win; globalThis.document = win.document;
globalThis.getComputedStyle = win.getComputedStyle.bind(win);
globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

const TrackerEngine = (await import('./music/tracker-engine.mjs')).default;
const VibeShifter = (await import('./music/vibe.mjs')).default;
const Palette = (await import('./music/palette.mjs')).default;
const musicDir = new URL('./music/', import.meta.url);
const songsDir = new URL('./music/songs/', import.meta.url);
const DATA_JSON = Object.fromEntries(DATA.map(p => [p, JSON.parse(readFileSync(new URL(p, musicDir), 'utf8'))]));
const SONG = Object.fromEntries(readdirSync(songsDir).filter(f => f.endsWith('.json'))
  .map(f => { const s = JSON.parse(readFileSync(new URL(f, songsDir), 'utf8')); return [s.id, s]; }));

// ── a fake AudioContext: enough of the Web Audio surface for the engine and the shifter ──────────
function param(v = 0) {
  const p = { value: v, calls: [] };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) {
    p[m] = (...a) => { p.calls.push([m, ...a]); if (m === 'setValueAtTime') p.value = a[0]; return p; };
  }
  return p;
}
function fakeContext() {
  const ctx = { currentTime: 0, sampleRate: 44100, state: 'running', destination: { connect() {} }, started: [], resume() { return Promise.resolve(); } };
  const node = extra => Object.assign({ connect() { return this; }, disconnect() {} }, extra);
  ctx.createGain = () => node({ gain: param(1) });
  ctx.createOscillator = () => { const o = node({ frequency: param(440), detune: param(0), type: 'sine', setPeriodicWave() {}, start(t) { ctx.started.push(o); }, stop() {} }); return o; };
  ctx.createBufferSource = () => node({ buffer: null, loop: false, playbackRate: param(1), start(t) { ctx.started.push(this); }, stop() {} });
  ctx.createStereoPanner = () => node({ pan: param(0) });
  ctx.createBiquadFilter = () => node({ type: 'lowpass', frequency: param(350), Q: param(1) });
  ctx.createPeriodicWave = () => ({});
  ctx.createBuffer = (ch, len, rate) => ({ getChannelData: () => new Float32Array(len) });
  return ctx;
}

// ── 1. runtime copies ────────────────────────────────────────────────────────────────────────────
test('apstat-park/music/ matches handoff/audio/tracker/ (scripts/sync-park-music.mjs)', () => {
  assert.deepEqual(drift(), []);
  assert.equal(Object.keys(SONG).length, 5, 'Star Light Zone was removed (Oct 10 2026)');
  assert.ok(!SONG.starlight);
  for (const s of Object.values(SONG)) assert.ok(s.palette && s.key && s.scale && s.bpm && s.channels && s.order && s.instruments, s.id);
  // The accuracy pass (TRACKER_SPEC §7d) and the original Sega data (§7c).
  assert.equal(SONG.icecap.format, 'smps-v2'); assert.equal(SONG.icecap.drumKit, 's3'); assert.equal(SONG.icecap.sfxMap.coin, 's3k:33');
  assert.equal(SONG.launchbase.drumKit, 's3'); assert.equal(SONG.mushroomhill.drumKit, 'sk');
  assert.equal(SONG['keen-wotb'].format, 'opl-v2');
  assert.deepEqual(DATA, ['sfx/genesis-s3k.json', 'samples/s3.json', 'samples/sk.json']);
  assert.equal(DATA_JSON['sfx/genesis-s3k.json'].set, 'genesis-s3k');
  assert.equal(Object.keys(DATA_JSON['sfx/genesis-s3k.json'].sfx).length, 173);
  assert.equal(DATA_JSON['samples/s3.json'].kit, 's3'); assert.equal(DATA_JSON['samples/sk.json'].kit, 'sk');
  // The engine source carries the chip emulator and the v2 paths.
  const engineSrc = readFileSync(new URL('tracker-engine.mjs', musicDir), 'utf8');
  for (const needle of ['chipsynth-v2', 'ChipDSP', 'playSfxV2', 'registerKit']) assert.ok(engineSrc.includes(needle), needle);
});

// ── 2. TRACKER_SPEC §4a: highest SFX note per song, after pitch safety ───────────────────────────
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midi = name => { const m = /^([A-G]#?)(\d)$/.exec(name); return 12 * (+m[2] + 1) + NOTE[m[1]]; };
const SPEC_4A = {
  jump:       { 'park-bounce': 'C5', launchbase: 'G4', icecap: 'G4', mushroomhill: 'A#4', 'keen-wotb': 'G4' },
  land:       { 'park-bounce': 'C2', launchbase: 'G2', icecap: 'G2', mushroomhill: 'A#2', 'keen-wotb': 'G2' },
  coin:       { 'park-bounce': 'C6', launchbase: 'G5', icecap: 'G5', mushroomhill: 'A#5', 'keen-wotb': 'G5' },
  key:        { 'park-bounce': 'C6', launchbase: 'G5', icecap: 'G5', mushroomhill: 'A#5', 'keen-wotb': 'G5' },
  door:       { 'park-bounce': 'G3', launchbase: 'D3', icecap: 'D3', mushroomhill: 'F3', 'keen-wotb': 'D3' },
  stageClear: { 'park-bounce': 'C5', launchbase: 'G4', icecap: 'G4', mushroomhill: 'A#4', 'keen-wotb': 'G4' },
  ui:         { 'park-bounce': 'G5', launchbase: 'D5', icecap: 'D5', mushroomhill: 'F5', 'keen-wotb': 'D5' },
  error:      { 'park-bounce': 'D4', launchbase: 'A4', icecap: 'A4', mushroomhill: 'C4', 'keen-wotb': 'A4' },
};
test('vibe.js pitch safety reproduces the §4a table (top note per SFX per song)', () => {
  for (const [sfx, bySong] of Object.entries(SPEC_4A)) {
    for (const [id, top] of Object.entries(bySong)) {
      const s = SONG[id];
      const notes = VibeShifter.sfxNotes(VibeShifter.SFX[sfx], s.key, s.scale, 0).filter(n => n != null);
      assert.equal(Math.max(...notes), midi(top), sfx + ' in ' + id + ' tops at ' + top);
      assert.ok(Math.max(...notes) <= midi('C6'), sfx + ' in ' + id + ' never above C6');
    }
  }
});

// ── 3. engine gating + lowPower ──────────────────────────────────────────────────────────────────
test('engine: class mode never plays, solo plays; lowPower keeps at most 5 melodic voices', () => {
  const ctx = fakeContext();
  const eng = TrackerEngine.create(ctx, ctx.createGain(), { unlocked: true, mode: 'class' });
  eng.load(SONG.launchbase);
  assert.equal(eng.play(), false, 'class mode is silent');
  eng.setMode('solo');
  assert.equal(eng.play(), true);
  assert.ok(eng.isPlaying());
  eng.stop(0);
  assert.equal(eng.isPlaying(), false);

  const lp = TrackerEngine.create(fakeContext(), ctx.createGain(), { unlocked: true, mode: 'solo', lowPower: true });
  lp.load(SONG.launchbase);
  const before = lp.getVoiceCount();
  assert.equal(lp.play(), true);
  lp.stop(0);
  const full = TrackerEngine.create(fakeContext(), ctx.createGain(), { unlocked: true, mode: 'solo' });
  full.load(SONG.launchbase); full.play(); full.stop(0);
  assert.ok(lp.getVoiceCount() < full.getVoiceCount(), 'lowPower builds fewer voices (' + lp.getVoiceCount() + ' < ' + full.getVoiceCount() + ')');
  assert.equal(before, 0);
});

test('engine: a song mix block is applied (vol trim on the channel gain, mute)', () => {
  const ctx = fakeContext();
  const eng = TrackerEngine.create(ctx, ctx.createGain(), { unlocked: true, mode: 'solo' });
  const song = JSON.parse(JSON.stringify(SONG.mushroomhill));
  song.mix.FM3 = { vol: -6, mute: true };
  eng.load(song);
  assert.deepEqual(eng.getMix().FM3, { vol: -6, mute: true });
  eng.setMix('FM3', { mute: false });
  assert.equal(eng.getMix().FM3.mute, false);
});

// ── 4. park-music.mjs ────────────────────────────────────────────────────────────────────────────
const { createParkMusic, SONGS, ORIGINAL, SONG_KEY, PALETTE_VARS, VIBE_FOR } = await import('./park-music.mjs');
function fakeSfx({ enabled = true, lowPower = false } = {}) {
  const ctx = fakeContext();
  const sfx = { ctx, muted: {}, musicBus: () => enabled ? { ctx, input: ctx.createGain() } : null, isEnabled: () => enabled, isLowPower: () => lowPower,
    setChannelMuted(ch, m) { sfx.muted[ch] = m; } };
  return sfx;
}
const modules = async () => ({ TrackerEngine, VibeShifter, Palette });
const fetchSong = async id => { if (!SONG[id]) throw new Error('no ' + id); return JSON.parse(JSON.stringify(SONG[id])); };
const fetchData = async path => { if (!DATA_JSON[path]) throw new Error('no ' + path); return DATA_JSON[path]; };
const tick = () => new Promise(r => setTimeout(r, 5));

test('park-music: the song list starts with ORIGINAL and names every synced song', () => {
  assert.equal(SONGS[0].id, ORIGINAL);
  assert.deepEqual(SONGS.slice(1).map(s => s.id).sort(), Object.keys(SONG).sort());
  assert.deepEqual(Object.keys(VIBE_FOR).sort(), ['clear', 'dead', 'door', 'fanfare', 'jump', 'key', 'switch', 'ui']);
  assert.equal(VIBE_FOR.jump.quantize, false, 'a jump is heard at once');
  assert.equal(VIBE_FOR.dead.quantize, false);
});

test('park-music: pick persists, loads the song, applies the palette; ORIGINAL clears it', async () => {
  win.localStorage.clear();
  const sfx = fakeSfx();
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData });
  assert.equal(music.view().songId, ORIGINAL);
  const release = music.acquire();
  assert.equal(await music.pick('launchbase'), true);
  assert.equal(win.localStorage.getItem(SONG_KEY), 'launchbase');
  assert.equal(music.song.id, 'launchbase');
  await tick(); await new Promise(r => setTimeout(r, 450));
  assert.equal(win.document.documentElement.style.getPropertyValue('--park-bg'), '#1d2440');
  assert.equal(await music.pick(ORIGINAL), true);
  for (const v of PALETTE_VARS) assert.equal(win.document.documentElement.style.getPropertyValue(v), '');
  assert.equal(await music.pick('nope'), false);
  // A palette tween in flight is cancelled when the last scene lets go.
  await music.pick('icecap'); release();
  await new Promise(r => setTimeout(r, 500));
  for (const v of PALETTE_VARS) assert.equal(win.document.documentElement.style.getPropertyValue(v), '', v + ' cleared after release');
  music.dispose();
});

test('park-music: a song that fails to load is reported, never stuck on LOADING; a malformed song is refused', async () => {
  win.localStorage.clear();
  const sfx = fakeSfx();
  const bad = async id => { if (id === 'icecap') throw new Error('404'); if (id === 'mushroomhill') return { id, bogus: true }; return fetchSong(id); };
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong: bad, fetchData });
  assert.equal(await music.pick('icecap'), false);
  assert.equal(music.view().loading, false);
  assert.equal(music.view().failed, true);
  assert.equal(music.view().hasSong, false);
  assert.equal(await music.play(), false);
  assert.equal(await music.pick('mushroomhill'), false, 'malformed');
  assert.equal(music.view().failed, true);
  assert.equal(await music.pick('park-bounce'), true);
  assert.equal(music.view().failed, false);
  // A failed REPLACEMENT keeps the previous song (still playing) and names the failure.
  await music.play();
  assert.equal(await music.pick('icecap'), false);
  const v = music.view();
  assert.equal(v.songId, 'park-bounce', 'the pick falls back to the song that works');
  assert.equal(win.localStorage.getItem(SONG_KEY), 'park-bounce');
  assert.equal(v.hasSong, true); assert.equal(v.failed, true); assert.equal(v.failedTitle, 'ICECAP ZONE');
  assert.ok(music.isPlaying(), 'the previous song keeps playing');
  assert.equal(music.engine.song.id, 'park-bounce');
  const { musicBarView } = await import('./campaign-select.mjs');
  assert.match(musicBarView(v).caption, /COULD NOT LOAD ICECAP ZONE/);
  assert.equal(musicBarView(v).playLabel, 'STOP');
  assert.equal(await music.pick('launchbase'), true);
  assert.equal(music.view().failed, false);
  music.dispose();
});

test('park-music: play needs a song and a bus; class mode refuses; a bus later lets it play', async () => {
  win.localStorage.clear();
  let cls = false;
  const sfx = fakeSfx();
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData, classMode: () => cls });
  assert.equal(await music.play(), false, 'ORIGINAL has no music');
  await music.pick('icecap');
  cls = true;
  assert.equal(await music.play(), false, 'in class');
  assert.equal(music.view().inClass, true);
  cls = false;
  assert.equal(await music.play(), true);
  assert.ok(music.isPlaying());
  music.sync();
  assert.equal(sfx.muted.park, false);
  cls = true; music.sync();
  assert.equal(music.isPlaying(), false, 'going live stops the music');
  assert.equal(sfx.muted.park, true, 'and mutes the park sounds');
  cls = false; music.sync(); await tick();
  assert.equal(music.isPlaying(), true, 'back out of class it resumes (the student wanted it playing)');
  music.stop(0);
  assert.equal(music.isPlaying(), false);
  music.dispose();
});

test('park-music: playSfx only with a song, out of class, with sound enabled', async () => {
  win.localStorage.clear();
  let cls = false, enabled = true;
  const sfx = fakeSfx(); sfx.isEnabled = () => enabled;
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData, classMode: () => cls });
  assert.equal(music.playSfx('jump'), false, 'ORIGINAL: the .ogg plays instead');
  await music.pick('launchbase');
  await tick();   // the build also waits for the Sega data and the chip worklet
  assert.equal(music.playSfx('jump'), true, 'the pick (a gesture) built the shifter: re-voiced before PLAY');
  await music.play();
  assert.equal(music.playSfx('jump'), true);
  assert.equal(music.playSfx('nonsense'), false);
  enabled = false; assert.equal(music.playSfx('jump'), false, 'Sound off');
  enabled = true; cls = true; assert.equal(music.playSfx('jump'), false, 'in class');
  cls = false; music.sync(); await tick();
  assert.ok(music.isPlaying());
  enabled = false; music.sync();
  assert.equal(music.isPlaying(), false, 'Sound off stops the music');
  enabled = true; music.sync(); await tick();
  assert.ok(music.isPlaying(), 'Sound back on resumes it');
  music.dispose();
});

test('park-music: acquire / release — the last scene out stops the music after a grace', async () => {
  win.localStorage.clear();
  const sfx = fakeSfx();
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData });
  const r1 = music.acquire();
  await music.pick('park-bounce'); await music.play();
  const r2 = music.acquire();
  r1(); await new Promise(r => setTimeout(r, 350));
  assert.ok(music.isPlaying(), 'one scene still holds it');
  r2(); await new Promise(r => setTimeout(r, 350));
  assert.equal(music.isPlaying(), false);
  music.dispose();
});

test('park-music: a stored song is re-voiced on the next acquire; the swap stops the old song', async () => {
  win.localStorage.setItem(SONG_KEY, 'keen-wotb');
  const sfx = fakeSfx();
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData });
  assert.equal(music.view().songId, 'keen-wotb');
  music.acquire(); await tick(); await tick();
  assert.equal(music.song?.id, 'keen-wotb');
  await music.play();
  const first = music.engine;
  await music.pick('icecap');
  assert.equal(music.engine, first, 'one engine per window');
  assert.equal(music.engine.song.id, 'icecap');
  assert.ok(music.isPlaying(), 'kept playing on the new song');
  music.dispose();
});

test('park-music: music is on for every window (the ?music=1 preview gate is gone); one instance per window', async () => {
  const mod = await import('./park-music.mjs');
  assert.equal(mod.musicEnabled, undefined); assert.equal(mod.MUSIC_FLAG_KEY, undefined);
  const w = { location: { search: '' }, localStorage: win.localStorage, document: win.document, sfx: fakeSfx() };
  const music = mod.getParkMusic(w, { loadModules: modules, fetchSong, fetchData });
  assert.ok(music, 'a music instance without any flag');
  assert.equal(mod.getParkMusic(w), music, 'the same instance for the window');
  assert.equal(mod.getParkMusic(null), null);
  music.dispose(); delete w.__parkMusic;
});

test('park-music: before any gesture the .ogg plays; the first sound after a bus appears builds the shifter', async () => {
  win.localStorage.clear();
  let bus = false;
  const sfx = fakeSfx(); const real = sfx.musicBus; sfx.musicBus = () => bus ? real() : null;
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData });
  await music.pick('launchbase');
  assert.equal(music.playSfx('jump'), false, 'no bus yet');
  bus = true;
  assert.equal(music.playSfx('jump'), false, 'kicks the build; this one is still the .ogg');
  await tick(); await tick();
  assert.equal(music.playSfx('jump'), true);
  music.dispose();
});

test('park-music: the original Sega kits and SFX are registered before the engine exists; a coin in IceCap plays the S3K ring', async () => {
  win.localStorage.clear();
  const sfx = fakeSfx();
  const fetched = [];
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData: p => { fetched.push(p); return fetchData(p); } });
  assert.equal(await music.pick('icecap'), true);
  await tick(); await tick();
  assert.deepEqual(fetched.sort(), ['samples/s3.json', 'samples/sk.json', 'sfx/genesis-s3k.json']);
  assert.ok(TrackerEngine.kits.s3 && TrackerEngine.kits.sk, 'DAC kits registered');
  assert.equal(Object.keys(TrackerEngine.sfxSets.s3k.sfx).length, 173, 'S3K effects registered');
  assert.ok(music.engine, 'engine built after registration');
  assert.equal(music.engine.hasOriginalSfx('s3k:33'), true);
  assert.equal(music.engine.usesWorklet(), false, 'no AudioWorklet in the fake context: node-graph fallback');
  const played = [];
  const orig = music.engine.playOriginalSfx;
  music.engine.playOriginalSfx = (ref, t, o) => { played.push(ref); return orig(ref, t, o); };
  assert.equal(music.playSfx('switch'), true);
  assert.deepEqual(played, ['s3k:33'], 'a switch (coin) in IceCap is the S3K ring, not the synthesized vibe note');
  music.dispose();
});

test('park-music: when the Sega data cannot be fetched the engine still builds (synthesized kit / vibe SFX)', async () => {
  win.localStorage.clear();
  const sfx = fakeSfx();
  const music = createParkMusic(win, { sfx, loadModules: modules, fetchSong, fetchData: async () => { throw new Error('offline'); } });
  assert.equal(await music.pick('park-bounce'), true);
  await tick(); await tick();
  assert.ok(music.engine, 'engine built without the Sega data');
  assert.equal(await music.play(), true);
  music.dispose();
});

// ── 5. pico-audio routing ────────────────────────────────────────────────────────────────────────
test('pico-audio: sounds go through the shifter with a song, else the .ogg path; the scene holds the music', async () => {
  const { createPicoAudio } = await import('./pico-audio.mjs');
  const calls = [], held = [];
  let hasSong = true, classFn = null;
  const music = { playSfx: (n, o) => { calls.push([n, o.vel]); return true; }, hasSong: () => hasSong,
    acquire: () => { held.push('a'); return () => held.push('r'); }, setClassMode: fn => { classFn = fn; } };
  const fakeWin = { localStorage: { getItem: () => 'false' }, navigator: { userActivation: { hasBeenActive: true } }, addEventListener() {}, removeEventListener() {},
    sfx: null, Audio: undefined };
  const audio = createPicoAudio(fakeWin, { music, classMode: () => true });
  assert.equal(typeof classFn, 'function');
  assert.deepEqual(held, ['a']);
  assert.equal(audio.play('jump', { pan: 0, distance: 0.5 }), true);
  assert.deepEqual(calls, [['jump', 0.7]]);
  hasSong = false;
  assert.equal(audio.play('jump'), false, 'no song and no engine / Audio: nothing to play');
  audio.dispose();
  assert.deepEqual(held, ['a', 'r']);
});

// ── 6. stage-select music bar ────────────────────────────────────────────────────────────────────
test('campaign-select: music bar hit-testing and view', async () => {
  const { musicButtonAt, musicBarView, MUSIC_BAR } = await import('./campaign-select.mjs');
  assert.equal(musicButtonAt(MUSIC_BAR.prev.x + 1, MUSIC_BAR.prev.y + 1), 'prev');
  assert.equal(musicButtonAt(100 + MUSIC_BAR.play.x + 1, MUSIC_BAR.play.y + 1, 100), 'play');
  assert.equal(musicButtonAt(MUSIC_BAR.play.x + 1, 600), null);
  assert.equal(musicBarView(null), null);
  assert.equal(musicBarView({ title: 'X', inClass: true }).playLabel, 'IN CLASS');
  assert.equal(musicBarView({ title: 'X', hasSong: false, loading: true }).playLabel, 'LOADING');
  assert.equal(musicBarView({ title: 'ORIGINAL SOUNDS', hasSong: false }).canPlay, false);
  assert.equal(musicBarView({ title: 'X', hasSong: true, playing: true }).playLabel, 'STOP');
  assert.equal(musicBarView({ title: 'X', hasSong: true, playing: false }).playLabel, 'PLAY');
});

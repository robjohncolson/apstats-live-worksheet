// APStat Park music: Grok's tracker engine (handoff/audio/tracker, synced into ./music/ by
// scripts/sync-park-music.mjs) playing the five faithful songs, the "vibe shifter" that re-voices
// the park's sound effects to the chosen song, and the song's colour palette on <html>. The
// Genesis songs use the original DAC drum kits and Sega sound effects (TRACKER_SPEC §7c): those
// are registered on the engine before it is created, and the chip AudioWorklet is awaited.
//
// Teacher 2026-10-10: music is available to students all the time (no "finish all work" unlock);
// one song picker per student (solo play), persisted per device; switching songs re-voices the
// SFX and recolours the park + Pico Desk (never the classic System-7 Desk). In class — the room's
// Live flag is on and the teacher has not allowed sound — music and park SFX are off.
//
// One instance per window, shared by every park scene (campaign, calculator room, level 6): the
// scenes acquire() on mount and release() on dispose, and the music stops only when no scene
// holds it (a switch from one scene to the next keeps it playing). Audio goes through the Desk's
// engine (lib/sfx.js `musicBus`): its level (normal / quiet / off), Sound option, limiter and
// -3 dBFS ceiling apply, and music ducks under priority sounds. Nothing here is ever awaited by
// gameplay; every failure is swallowed.
const V = new URL(import.meta.url).search;

export const SONG_KEY = 'apstat-park-song';
export const ORIGINAL = 'original';   // PICO PARK's own .ogg sounds, no music, no palette
export const SONGS = [
  { id: ORIGINAL, title: 'ORIGINAL SOUNDS' },
  { id: 'park-bounce', title: 'PARK BOUNCE' },
  { id: 'launchbase', title: 'LAUNCH BASE ZONE' },
  { id: 'icecap', title: 'ICECAP ZONE' },
  { id: 'mushroomhill', title: 'MUSHROOM HILL ZONE' },
  { id: 'keen-wotb', title: 'WEDNESDAY ON THE BEACH' },
];
export const PALETTE_VARS = ['bg', 'fg', 'accent', 'accent2', 'hud'].map(k => '--park-' + k);
// Original Sega data under ./music/ (synced from the handoff): DAC drum kits, then the S3K SFX set.
export const SEGA_KITS = ['samples/s3.json', 'samples/sk.json'];
export const SEGA_SFX = ['sfx/genesis-s3k.json'];

// Park sound -> vibe SFX script (vibe.js SFX table). `quantize` snaps the sound to the song's
// next 1/16 while music plays (TRACKER_SPEC §4): feedback that must be instant stays unquantized.
export const VIBE_FOR = {
  jump: { name: 'jump', quantize: false },
  key: { name: 'key', quantize: true },
  switch: { name: 'coin', quantize: true },
  dead: { name: 'error', quantize: false },
  door: { name: 'door', quantize: true },
  clear: { name: 'stageClear', quantize: true },
  fanfare: { name: 'coin', quantize: true },
  ui: { name: 'ui', quantize: false },
};

// The engine schedules rows from a main-thread timer (default: 100 ms ahead, every 25 ms). Inside
// the park that thread also renders the game, and a stall longer than the lookahead lands a
// short note's key-on AND key-off in the past, so the note vanishes ("the tracker drops notes
// here and there", teacher 2026-10-11). Scheduling well ahead rides out those stalls; mix and
// mode changes still apply at once (they are gain changes, not scheduled events). 800 ms since the
// teacher heard the 400 ms version fix most of it (2026-10-11).
export const SCHEDULER = { lookahead: 0.8, timerMs: 50 };

export function isSongId(id) { return SONGS.some(s => s.id === id); }

export function storedSong(win) {
  try { const id = win.localStorage.getItem(SONG_KEY); return isSongId(id) ? id : ORIGINAL; } catch { return ORIGINAL; }
}

export function createParkMusic(win, {
  sfx = win?.sfx || null,
  loadModules = defaultModules,
  fetchSong = defaultFetchSong,
  fetchData = defaultFetchData,   // (path) -> the JSON under ./music/
  classMode = () => false,   // true while the room is live and the teacher has not allowed sound
} = {}) {
  const doc = win?.document;
  let songId = storedSong(win), song = null, engine = null, vibe = null, bus = null, mods = null;
  let wantPlaying = false, holders = 0, releaseTimer = null, loadSeq = 0, disposed = false, loadFailed = null;
  const listeners = new Set();
  const songs = new Map();
  let classModeFn = classMode;

  function notify() { for (const fn of listeners) { try { fn(view()); } catch {} } }
  function inClass() { try { return !!classModeFn(); } catch { return false; } }
  function hasSong() { return songId !== ORIGINAL && !!song; }

  async function modules() {
    if (!mods) mods = await loadModules(V);
    return mods;
  }
  async function songData(id) {
    if (!songs.has(id)) songs.set(id, fetchSong(id, V).catch(err => { songs.delete(id); throw err; }));
    return songs.get(id);
  }
  // The original Sega data (DAC kits, S3K sound effects), registered on the engine module once
  // per window, before the engine exists. A fetch that fails is retried on the next build; the
  // engine then plays the synthesized kit / vibe SFX for that song.
  let segaP = null;
  function registerSega() {
    if (!segaP) segaP = (async () => {
      const { TrackerEngine } = await modules();
      const [kits, sets] = await Promise.all([
        Promise.all(SEGA_KITS.map(p => fetchData(p, V))), Promise.all(SEGA_SFX.map(p => fetchData(p, V))),
      ]);
      for (const kit of kits) TrackerEngine.registerKit(kit);
      for (const set of sets) TrackerEngine.registerSfx(set);
      return true;
    })().catch(() => { segaP = null; return false; });
    return segaP;
  }
  // The engine needs the Desk's audio graph, which exists only after a user gesture. Built as soon
  // as a bus exists (a pick click is a gesture), so the sound effects are re-voiced before PLAY.
  // The chip AudioWorklet (engine.ready) is awaited so the first play() uses it.
  let building = null;
  async function ensureEngine() {
    if (engine) return engine;
    if (building) return building;
    if (!sfx || typeof sfx.musicBus !== 'function') return null;
    const next = sfx.musicBus();
    if (!next) return null;
    building = (async () => {
      try {
        const { TrackerEngine, VibeShifter } = await modules();
        await registerSega();
        if (engine || disposed) return engine;
        bus = next;
        const eng = TrackerEngine.create(bus.ctx, bus.input, { unlocked: true, mode: inClass() ? 'class' : 'solo', lowPower: lowPower(), ...SCHEDULER });
        try { await eng.ready(); } catch {}
        if (engine || disposed) return engine;
        engine = eng;
        vibe = VibeShifter.create(bus.ctx, bus.input, engine);
        if (song && !loadSong(song)) song = null;
        return engine;
      } catch { return null; } finally { building = null; }
    })();
    return building;
  }
  // A malformed song must never throw into a scene: false = unusable.
  function loadSong(s) {
    try { engine.load(s); vibe.setSong(s); return true; } catch { loadFailed = s.id; return false; }
  }
  function lowPower() { try { return !!(sfx && sfx.isLowPower && sfx.isLowPower()); } catch { return false; } }

  // The palette shows only while a scene holds the music; clearing it also cancels a running tween
  // (Palette.apply with nothing to tween cancels its animation frame).
  function applyPalette(pal) {
    if (!doc?.documentElement) return;
    const el = doc.documentElement;
    if (!pal || !holders) {
      if (mods) { try { mods.Palette.apply({}, { el, ms: 0 }); } catch {} }
      for (const v of PALETTE_VARS) el.style.removeProperty(v);
      return;
    }
    modules().then(({ Palette }) => {
      if (!disposed && holders && song && song.palette === pal) Palette.apply(pal, { el, ms: 400 });
    }).catch(() => {});
  }

  function persist(id) { try { win.localStorage.setItem(SONG_KEY, id); } catch {} }
  // A replacement that fails to load leaves the previous pick in place (and playing) and names
  // the failure in view().failed until the next successful pick.
  function failPick(id, previous) {
    loadFailed = id;
    if (songId === id) { songId = previous; persist(previous); }
    notify();
    return false;
  }
  async function pick(id) {
    if (!isSongId(id) || disposed) return false;
    const previous = songId;
    songId = id; persist(id);
    const seq = ++loadSeq;
    loadFailed = null;
    if (id === ORIGINAL) {
      song = null; applyPalette(null);
      if (engine) { engine.stop(0.3); vibe?.setSong(null); }
      notify(); return true;
    }
    ensureEngine().catch(() => {});   // the pick is a gesture: re-voice the sound effects now
    let next;
    try { next = await songData(id); } catch { return seq === loadSeq ? failPick(id, previous) : false; }
    if (seq !== loadSeq || disposed) return false;
    if (!next || typeof next !== 'object' || !next.patterns || !Array.isArray(next.order)) return failPick(id, previous);
    const before = song;
    song = next; applyPalette(song.palette);
    if (engine) {
      if (!loadSong(song)) {
        song = before;
        if (song) { loadSong(song); applyPalette(song.palette); if (wantPlaying) play(); } else applyPalette(null);
        return failPick(id, previous);
      }
      if (wantPlaying) play();
    }
    notify(); return true;
  }

  // Only from a user gesture (autoplay policy); returns whether music is now playing.
  async function play() {
    if (disposed || songId === ORIGINAL) return false;
    wantPlaying = true;
    if (inClass() || !sfxEnabled()) { notify(); return false; }
    const eng = await ensureEngine();
    if (!eng || !wantPlaying || !song) { notify(); return false; }
    eng.setMode(inClass() ? 'class' : 'solo'); eng.setLowPower(lowPower());
    if (!eng.isPlaying()) eng.play();
    notify(); return eng.isPlaying();
  }
  function stop(fade) {
    wantPlaying = false;
    if (engine) engine.stop(fade == null ? 0.3 : fade);
    notify();
  }
  function toggle() { return isPlaying() ? (stop(), Promise.resolve(false)) : play(); }
  function isPlaying() { return !!(engine && engine.isPlaying()); }

  // Park sound effects through the vibe shifter. False = not handled (play the .ogg instead).
  function playSfx(name, { vel = 1 } = {}) {
    if (!hasSong() || inClass()) return false;
    if (!vibe) { ensureEngine().catch(() => {}); return false; }   // first sound after a gesture: the .ogg, then the shifter
    const map = VIBE_FOR[name]; if (!map) return false;
    if (sfx && sfx.isEnabled && !sfx.isEnabled()) return false;
    try { return vibe.playSfx(map.name, { quantize: map.quantize && isPlaying(), vel }) === true; } catch { return false; }
  }

  function sfxEnabled() { try { return !(sfx && sfx.isEnabled) || !!sfx.isEnabled(); } catch { return false; } }
  // Class mode and the Desk's Sound option can change while a scene is open (the teacher goes
  // Live; the student flips Sound): one check per second. The student's wish to play survives.
  function sync() {
    if (disposed) return;
    const cls = inClass(), enabled = sfxEnabled();
    if (engine) {
      engine.setMode(cls ? 'class' : 'solo');
      engine.setLowPower(lowPower());
      if (!enabled && engine.isPlaying()) engine.stop(0.2);
      if (!cls && enabled && wantPlaying && song && !engine.isPlaying()) play();
    }
    if (sfx && sfx.setChannelMuted) sfx.setChannelMuted('park', cls);
  }
  const syncTimer = setInterval(sync, 1000);
  if (syncTimer && typeof syncTimer.unref === 'function') syncTimer.unref();   // node tests
  function onVisibility() { if (doc?.hidden) stop(0.2); }
  try { doc?.addEventListener('visibilitychange', onVisibility); } catch {}

  function acquire() {
    holders++; clearTimeout(releaseTimer); releaseTimer = null;
    // Re-voice straight away: a scene opened with a song picked earlier needs it loaded.
    if (songId !== ORIGINAL && !song) pick(songId);
    else if (song) { applyPalette(song.palette); ensureEngine().catch(() => {}); }
    return release;
  }
  function release() {
    holders = Math.max(0, holders - 1);
    if (holders) return;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (!holders) { stop(0.4); applyPalette(null); } }, 300);
  }
  function view() {
    return { songId, title: SONGS.find(s => s.id === songId)?.title || '', playing: isPlaying(), wantPlaying, inClass: inClass(), hasSong: hasSong(), loading: songId !== ORIGINAL && !song, failed: loadFailed != null,
      failedTitle: loadFailed != null ? SONGS.find(s => s.id === loadFailed)?.title || '' : '' };
  }
  function dispose() {
    disposed = true; clearInterval(syncTimer); clearTimeout(releaseTimer);
    try { doc?.removeEventListener('visibilitychange', onVisibility); } catch {}
    stop(0); applyPalette(null); listeners.clear();
  }
  return {
    SONGS, pick, play, stop, toggle, isPlaying, playSfx, hasSong, acquire, release, view, sync, dispose,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // The scene that knows the classroom state (board.classroom) installs the source.
    setClassMode(fn) { if (typeof fn === 'function') classModeFn = fn; sync(); },
    get engine() { return engine; },
    get song() { return song; },
  };
}

// One per window; the first park scene creates it. (The ?music=1 preview gate was removed on
// 2026-10-11: music is on for everyone; ORIGINAL SOUNDS in the picker is the per-device opt-out.)
export function getParkMusic(win, options) {
  if (!win) return null;
  if (!win.__parkMusic) win.__parkMusic = createParkMusic(win, options);
  return win.__parkMusic;
}

async function defaultModules(v) {
  const [t, s, p] = await Promise.all([
    import('./music/tracker-engine.mjs' + v), import('./music/vibe.mjs' + v), import('./music/palette.mjs' + v),
  ]);
  return { TrackerEngine: t.default, VibeShifter: s.default, Palette: p.default };
}

async function defaultFetchSong(id, v) { return defaultFetchData('songs/' + id + '.json', v); }

async function defaultFetchData(path, v) {
  const res = await fetch(new URL('./music/' + path + v, import.meta.url));
  if (!res.ok) throw new Error('music/' + path + ': HTTP ' + res.status);
  return res.json();
}

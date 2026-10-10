// APStat Park music: Grok's tracker engine (handoff/audio/tracker, synced into ./music/ by
// scripts/sync-park-music.mjs) playing the six faithful songs, the "vibe shifter" that re-voices
// the park's sound effects to the chosen song, and the song's colour palette on <html>.
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
  { id: 'starlight', title: 'STAR LIGHT ZONE' },
  { id: 'icecap', title: 'ICECAP ZONE' },
  { id: 'mushroomhill', title: 'MUSHROOM HILL ZONE' },
  { id: 'keen-wotb', title: 'WEDNESDAY ON THE BEACH' },
];
export const PALETTE_VARS = ['bg', 'fg', 'accent', 'accent2', 'hud'].map(k => '--park-' + k);

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

export function isSongId(id) { return SONGS.some(s => s.id === id); }

export function storedSong(win) {
  try { const id = win.localStorage.getItem(SONG_KEY); return isSongId(id) ? id : ORIGINAL; } catch { return ORIGINAL; }
}

export function createParkMusic(win, {
  sfx = win?.sfx || null,
  loadModules = defaultModules,
  fetchSong = defaultFetchSong,
  classMode = () => false,   // true while the room is live and the teacher has not allowed sound
} = {}) {
  const doc = win?.document;
  let songId = storedSong(win), song = null, engine = null, vibe = null, bus = null, mods = null;
  let wantPlaying = false, holders = 0, releaseTimer = null, loadSeq = 0, disposed = false;
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
  // The engine needs the Desk's audio graph, which exists only after a user gesture.
  async function ensureEngine() {
    if (engine) return engine;
    if (!sfx || typeof sfx.musicBus !== 'function') return null;
    const next = sfx.musicBus();
    if (!next) return null;
    const { TrackerEngine, VibeShifter } = await modules();
    if (engine) return engine;
    bus = next;
    engine = TrackerEngine.create(bus.ctx, bus.input, { unlocked: true, mode: inClass() ? 'class' : 'solo', lowPower: lowPower() });
    vibe = VibeShifter.create(bus.ctx, bus.input, engine);
    if (song) { engine.load(song); vibe.setSong(song); }
    return engine;
  }
  function lowPower() { try { return !!(sfx && sfx.isLowPower && sfx.isLowPower()); } catch { return false; } }

  function applyPalette(pal) {
    if (!doc?.documentElement) return;
    const el = doc.documentElement;
    if (!pal) { for (const v of PALETTE_VARS) el.style.removeProperty(v); return; }
    modules().then(({ Palette }) => { if (!disposed && song && song.palette === pal) Palette.apply(pal, { el, ms: 400 }); }).catch(() => {});
  }

  async function pick(id) {
    if (!isSongId(id) || disposed) return false;
    songId = id;
    try { win.localStorage.setItem(SONG_KEY, id); } catch {}
    const seq = ++loadSeq;
    if (id === ORIGINAL) {
      song = null; applyPalette(null);
      if (engine) { engine.stop(0.3); vibe?.setSong(null); }
      notify(); return true;
    }
    let next;
    try { next = await songData(id); } catch { if (seq === loadSeq) notify(); return false; }
    if (seq !== loadSeq || disposed) return false;
    song = next; applyPalette(song.palette);
    if (engine) {
      engine.load(song); vibe.setSong(song);
      if (wantPlaying) play();
    }
    notify(); return true;
  }

  // Only from a user gesture (autoplay policy); returns whether music is now playing.
  async function play() {
    if (disposed || songId === ORIGINAL) return false;
    wantPlaying = true;
    if (inClass()) { notify(); return false; }
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
    if (!hasSong() || inClass() || !vibe) return false;
    const map = VIBE_FOR[name]; if (!map) return false;
    if (sfx && sfx.isEnabled && !sfx.isEnabled()) return false;
    try { return vibe.playSfx(map.name, { quantize: map.quantize && isPlaying(), vel }) === true; } catch { return false; }
  }

  // Class mode can change while a scene is open (the teacher goes Live): one check per second.
  function sync() {
    if (disposed) return;
    const cls = inClass();
    if (engine) {
      engine.setMode(cls ? 'class' : 'solo');
      engine.setLowPower(lowPower());
      if (!cls && wantPlaying && song && !engine.isPlaying()) play();
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
    else if (song) applyPalette(song.palette);
    return release;
  }
  function release() {
    holders = Math.max(0, holders - 1);
    if (holders) return;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (!holders) { stop(0.4); applyPalette(null); } }, 300);
  }
  function view() {
    return { songId, title: SONGS.find(s => s.id === songId)?.title || '', playing: isPlaying(), wantPlaying, inClass: inClass(), hasSong: hasSong(), loading: songId !== ORIGINAL && !song };
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

// One per window; the first park scene creates it.
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

async function defaultFetchSong(id, v) {
  const res = await fetch(new URL('./music/songs/' + id + '.json' + v, import.meta.url));
  if (!res.ok) throw new Error('song ' + id + ': HTTP ' + res.status);
  return res.json();
}

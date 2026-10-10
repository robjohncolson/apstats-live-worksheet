// Level 6 sound effects (PICO PARK's own .ogg files in assets/). Gated by the calendar's sound
// toggle: the Desk's MacSFX mute writes localStorage 'macsound-muted', and the study-break game
// mirrors its mute there too, so 'true' silences the park as well. Sounds play only after the
// page has had a user gesture, and every failure is swallowed: gameplay never waits on audio.
// Music and re-voiced sounds (teacher 2026-10-10): park-music.mjs owns the tracker engine and the
// vibe shifter. With a song picked, every sound here goes through the shifter (the song's key,
// timbre and beat grid) instead of the .ogg; with ORIGINAL picked, or in class, the .ogg plays.
// Inside the Desk the sounds go through the shared engine (lib/sfx.js, window.sfx; SFX_SPEC.md):
// panned by where they happened and quieter the farther they are from the player's own cat.
// Without the engine (a page that does not load it, node tests) they fall back to <audio>.
// Same build as whoever imported this module: the board imports panel.mjs?v=<APP_BUILD> and every
// park module passes its own query on, so a deploy never mixes old and new modules (HTTP/CDN cache).
const V = new URL(import.meta.url).search;
const { SOUNDS } = await import('./assets/pico-atlas.mjs' + V);
const { getParkMusic } = await import('./park-music.mjs' + V);

export const SOUND_MUTE_KEY = 'macsound-muted';
const BASE = new URL('./assets/', import.meta.url).href;
export const soundUrl = name => BASE + SOUNDS[name] + V;

const PAN_LIMIT = 0.6;   // never hard left / right (lib/sfx.js uses the same limit)

// Where a sound sits relative to the listener (the player's own cat), both {x, y} in the same
// coordinates: pan from the horizontal offset, distance (0..1) from the straight-line offset.
// `span` is how far away a sound fades to the engine's quietest distance.
export function placeSound(source, listener, span) {
  if (!source || !listener || !(span > 0)) return {};
  const dx = (source.x ?? listener.x) - listener.x;
  const dy = (source.y ?? listener.y) - listener.y;
  const pan = Math.max(-1, Math.min(1, dx / span)) * PAN_LIMIT;
  const distance = Math.max(0, Math.min(1, Math.hypot(dx, dy) / span));
  return { pan, distance };
}

// music: optional (tests); defaults to the window's shared park music, held while this scene
// lives. classMode (optional): () => true while the room is live and the teacher has not allowed
// sound (board.classroom) — music and re-voiced sounds are off then.
export function createPicoAudio(win, { volume = 0.4, music = getParkMusic(win), classMode = null } = {}) {
  const cache = new Map();
  let gestured = false, disposed = false, releaseMusic = null;
  if (music) {
    try { if (classMode) music.setClassMode(classMode); releaseMusic = music.acquire(); } catch { releaseMusic = null; }
  }
  const mark = () => { gestured = true; };
  try { win?.addEventListener?.('keydown', mark, true); win?.addEventListener?.('pointerdown', mark, true); } catch {}
  const engine = win?.sfx && typeof win.sfx.play === 'function' && typeof win.sfx.define === 'function' ? win.sfx : null;
  if (engine) {
    try {
      for (const name of Object.keys(SOUNDS)) {
        engine.define('park:' + name, { bus: 'sfx', channel: 'park', sample: soundUrl(name), reverb: 0.12, detune: 25 });
      }
    } catch {}
  }
  function muted() {
    try { return win.localStorage.getItem(SOUND_MUTE_KEY) === 'true'; } catch { return false; }
  }
  function activated() {
    const ua = win?.navigator?.userActivation;
    return gestured || !!(ua && ua.hasBeenActive);
  }
  function element(name) {
    if (cache.has(name)) return cache.get(name);
    let audio = null;
    try { if (typeof win.Audio === 'function' && SOUNDS[name]) { audio = new win.Audio(soundUrl(name)); audio.preload = 'auto'; } } catch { audio = null; }
    cache.set(name, audio);
    return audio;
  }
  function playEngine(name, then, where) {
    if (!SOUNDS[name]) return false;
    const onEnded = then ? () => { if (!disposed) play(then); } : undefined;
    try {
      return engine.play('park:' + name, { gain: volume, pan: where?.pan, distance: where?.distance, onEnded }) === true;
    } catch { return false; }
  }
  function playElement(name, then) {
    const audio = element(name);
    if (!audio) return false;
    try {
      audio.currentTime = 0; audio.volume = volume;
      if (then) audio.onended = () => { audio.onended = null; play(then); };
      const started = audio.play();
      if (started && typeof started.catch === 'function') started.catch(() => {});
      return true;
    } catch { return false; }
  }
  // The vibe shifter voices the sound to the picked song; `then` chains (clear -> fanfare) run on
  // a timer there because the shifter has no onEnded. The .ogg path is unchanged.
  function playVibe(name, then, where) {
    if (!music || typeof music.playSfx !== 'function' || !music.hasSong()) return false;
    const vel = where && typeof where.distance === 'number' ? 1 - 0.6 * Math.max(0, Math.min(1, where.distance)) : 1;
    let played = false;
    try { played = music.playSfx(name, { vel }); } catch { played = false; }
    if (played && then) setTimeout(() => { if (!disposed) play(then); }, 900);
    return played;
  }
  // where (optional): { pan, distance } from placeSound(); omitted = the player's own cat.
  function play(name, then, where) {
    if (disposed || !win || muted() || !activated()) return false;
    if (playVibe(name, then, where)) return true;
    return engine ? playEngine(name, then, where) : playElement(name, then);
  }
  return {
    play: (name, where) => play(name, null, where),
    // Stage clear: the goal jingle, then the fanfare.
    clear: () => play('clear', 'fanfare'),
    muted,
    music,
    dispose() {
      disposed = true;
      try { releaseMusic?.(); } catch {}
      try { win?.removeEventListener?.('keydown', mark, true); win?.removeEventListener?.('pointerdown', mark, true); } catch {}
      for (const audio of cache.values()) { try { audio?.pause(); } catch {} }
    },
  };
}

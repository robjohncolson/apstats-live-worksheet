// Level 6 sound effects (PICO PARK's own .ogg files in assets/). Gated by the calendar's sound
// toggle: the Desk's MacSFX mute writes localStorage 'macsound-muted', and the study-break game
// mirrors its mute there too, so 'true' silences the park as well. Audio elements are created
// lazily, only after the page has had a user gesture, and every failure is swallowed: gameplay
// never waits on audio. No stage music: the site has no music preference to keep it off by
// default, and thirty Chromebooks looping it in one classroom is the wrong default.
import { SOUNDS } from './assets/pico-atlas.mjs';

export const SOUND_MUTE_KEY = 'macsound-muted';
const BASE = new URL('./assets/', import.meta.url).href;

export function createPicoAudio(win, { volume = 0.4 } = {}) {
  const cache = new Map();
  let gestured = false, disposed = false;
  const mark = () => { gestured = true; };
  try { win?.addEventListener?.('keydown', mark, true); win?.addEventListener?.('pointerdown', mark, true); } catch {}
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
    try { if (typeof win.Audio === 'function' && SOUNDS[name]) { audio = new win.Audio(BASE + SOUNDS[name]); audio.preload = 'auto'; } } catch { audio = null; }
    cache.set(name, audio);
    return audio;
  }
  function play(name, then) {
    if (disposed || !win || muted() || !activated()) return false;
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
  return {
    play: name => play(name),
    // Stage clear: the goal jingle, then the fanfare.
    clear: () => play('clear', 'fanfare'),
    muted,
    dispose() {
      disposed = true;
      try { win?.removeEventListener?.('keydown', mark, true); win?.removeEventListener?.('pointerdown', mark, true); } catch {}
      for (const audio of cache.values()) { try { audio?.pause(); } catch {} }
    },
  };
}

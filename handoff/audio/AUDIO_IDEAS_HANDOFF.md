# Apstat Park audio: handoff from Grok Bot (2026-10-10)

Builds on `SFX_SPEC.md` pass 1 (`lib/sfx.js`, commit 2d9957ba). Read that first. Everything here is a proposal for Robert to approve, item by item.
Rule: do not change live lesson pages, worksheets, or follow-alongs students are using unless Robert approves that specific change.

## 0. Performance first (Robert's main complaint)
Right now every sound feels the same except for the reverb, and the reverb is hard on slow Chromebooks.
- Build the reverb impulse response **once** and cache it. Don't regenerate it on each context unlock.
- Add a `lowPower` setting. It should **default ON for student devices** and be auto-detected (hardwareConcurrency <= 4, deviceMemory <= 4, or a frame-time probe).
  In lowPower: no convolver/reverb send, no ambience loop, no stereo panning, voice cap 6 instead of 12, no random pitch/volume jitter.
- Give sounds distinct character through **envelope and pitch shape** instead of reverb: short pitch sweeps (jump goes up, land goes down), different waveforms per family (UI = sine blips, game = square/pulse, rewards = triangle bell plus octave), and noise bursts for impacts. ZzFX/jsfxr-style parameter presets are a good, cheap model.
- Default student level: `quiet`. 25 devices at `normal` is loud even with the -3 dB cap.
- Keep visual flashes for alerts. A student who hasn't tapped yet can't hear audio (autoplay policy).

## 1. Stats sonification (the new, distinctive part)
1. **Hear the distribution**: a quick left-to-right sweep over histogram bars, with pitch by bin and loudness by bar height. Skew and spread become audible. (M)
2. **z-score pitch**: results above the mean play higher, below the mean lower, with a special "wow" sound past |z| > 2. (S)
3. **p-value drumroll**: a suspense roll that resolves to a bright major chord if p < alpha, or a flat or dull chord if not. (S)
4. **Simulation rain**: each simulated trial drops a soft tick into the dot plot, so the class hears the sampling distribution build. Respect the voice cap and throttle when trials are fast. (M)

## 2. Game and economy sounds
5. **Candy sounds**: a coin chime on purchase, a sparkle when a gift arrives, and a key-unlock fanfare when a key is bought. (S)
6. **Calculator key clicks** (TI-84 build-out): quiet clicks with one pitch per key row. (S)
7. **Period themes**: B and E each get their own key or jingle, plus a short fanfare when the whole period clears a stage. (S-M)

## 3. Classroom controls
8. **Teacher silence switch**: one dashboard toggle forces every device to `quiet` or `off` via a relay message (for tests and focused work). (M)
9. **Projector-only music**: a teacher "stage" mode where background music plays only on the teacher screen and students get short sound effects only. (S)
10. **Haptics fallback** when sound is off: `navigator.vibrate` on key events (Android only; iOS ignores it). (S)

## 4. Music easter egg (ready-made module)
`handoff/audio/park-music-v3.2.js` is a self-contained WebAudio chiptune player (Keen 5 "Wednesday On the Beach" melody in the Park voice set; Robert has the composer's OK for this use).
- API: `ParkMusic.create(ctx, destGain, {mode, unlocked, arrangement, sections, volume})`, then `start()`, `stop(fade)`, `setVolume()`, `setMode('class'|'solo')`, `duck(on)`, `isPlaying()`, `setStems({lead,bass,arp,drums})`, `setArrangement(on)`, `unlock(bool)`, `isUnlocked()`.
- **Locked by default.** `start()` does nothing until `unlock(true)`. It is solo-only by default.
- Wiring:
  1. Create a music bus `a.music = ctx.createGain()` into `a.master` (so it goes through the limiter, and skips the reverb send).
  2. There is no "all activities complete" check yet. Add one where activity completion is saved. When everything is done, call `unlock(true)`, persist a `musicUnlocked` flag, and on load re-apply it.
  3. Show a small "🎵 Music unlocked" toast with a play button. The click satisfies autoplay. Duck the music under SFX one-shots, and stop it on `visibilitychange` (hidden).
- Arrangement mode cycles the stems every 8 bars (bass+drums, then +arp, then full, then melody+light drums, then full). The arp stem is quiet and only starts at loop bar 9; raise it if wanted.

## Suggested order
0 (performance) first, then 5 and 2 and 3 (cheap, high fun), then 8, then 1 and 4, then the music easter egg.

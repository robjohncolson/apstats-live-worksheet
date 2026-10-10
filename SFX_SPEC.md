# SFX_SPEC — a shared sound engine with depth (teacher 2026-10-10: "improve the sound system to add more depth")

Pass 1 (this spec): the engine + migrating every existing sound onto it. No new sound EVENTS. Pass 2 (later): the
park's chiptune voice (jump/land/push/switch/key/door/clear) and per-context ambience.

## 1. One engine: `lib/sfx.js` (plain script, no modules)
- One `AudioContext`, created lazily on the first user gesture (autoplay policy); `resume()` on visibility/gesture.
- Buses: `master` → **limiter** (DynamicsCompressor, threshold −6 dB, ratio 20, fast attack) → destination; `sfx`
  and `ui` sub-buses with their own gains; a **reverb send** (ConvolverNode with a synthesised impulse: 1.2 s
  exponentially decaying stereo noise, low-passed 6 kHz) with per-sound send level; a **ducker** (a gain on `sfx`
  that dips to −8 dB for 250 ms when a `priority` sound plays, then recovers over 400 ms).
- **Panner**: StereoPanner per voice; `pan ∈ [−1, 1]` taken from an optional screen-x (0..width → −0.6..+0.6, never
  hard left/right) with distance attenuation (`distance` 0..1 → 0..−12 dB).
- **Variation**: optional `detune ±cents` (default ±40 = ~±2.3%), `gainJitter` (default ±1.5 dB), and `roundRobin`
  (a list of variants, never the same one twice in a row).
- **Layer model**: a sound = up to three layers — `transient` (noise burst / click, 5–20 ms), `body` (oscillators
  with ADSR), `tail` (reverb send level). `sfx.play(name, {x, distance, priority, gain})` plays a registered
  recipe; `sfx.define(name, recipe)` registers one. Recipes are plain data (type, freqs, envelope, filter) so the
  Desk, pico-home.js and the park register their own without touching the engine.
- **Master controls**: the Desk's Sound option is the master switch (nothing plays when off); a new per-device
  **"quieter"** level (localStorage `apstats-sfx-level`: `normal` | `quiet` | `off`) applied on `master`; the park's
  own mute and Study Break's mute keep working as sub-bus mutes.
- Hard caps: master never above −3 dBFS after the limiter; max 12 simultaneous voices (oldest non-priority dropped).
- Sound is never part of any simulation; no determinism concerns. Never throws into callers (try/catch, no-op
  when audio is unavailable).

## 2. Migration (pass 1)
- **Desk UI** (`data-sfx` clicks, menu open/close, dialog confirm/cancel, error): one consistent "instrument"
  (short triangle blip with a 3 ms noise transient), distinct pitches per action family: open ↑, close ↓,
  confirm two-note, cancel one low note, error a short buzz. Route on `ui`, low reverb send.
- **Study Break**: move/rotate/soft-drop (round-robin ×3, detune), lock (transient + low body), line clear,
  the new fuse bells and square-clear chimes (keep their exact frequencies/envelopes — add reverb tail and a
  slight stereo width), game over, countdown ticks. Opponent-board sounds pan to their side at −6 dB.
  Gold fuse / gold clear are `priority` (duck the rest).
- **Park** (apstat-park sounds that exist today — audit and list them; migrate as-is onto `sfx` with x-position
  panning and distance from the player's own cat; no new recipes in pass 1).
- **Challenge alert**: `priority`; the gold flash stays visual.
- Remove every direct `new AudioContext()` / `createOscillator()` outside `lib/sfx.js`.

## 3. Tests
- `tests/sfx.test.js` (jsdom + a fake AudioContext): lazy creation only after a gesture; master switch off ⇒ no
  node created/started; quiet level gain; limiter/reverb/panner wiring per play; variation stays within bounds and
  round-robin never repeats; voice cap; ducking timing; `play` never throws without audio.
- Migration parity: each surface's existing sound tests still pass; a spy asserts the same event names fire at the
  same moments as before (Study Break squares/stakes suites, Desk sfx tests, park sound tests if any).

## 4. Out of scope (pass 2)
- The park's chiptune voice for jump/land/push/switch/key/door/stage-clear (synthesised square/triangle, fast
  envelopes; the decompile may hold the original parameters if its audio was synthesised).
- Ambience beds (park: faint wind/birds; Study Break: soft pad), −24 dB, under the ducker.

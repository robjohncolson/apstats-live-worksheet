# APStat Park music: frozen songs (spec)

Status: draft 2026-10-11, for the teacher's review. Nothing built yet.

## 0. Why

IceCap (and, less often, the other Genesis songs) drops notes. Every row of every song is scheduled live:
the main thread posts chip events to the AudioWorklet from a `setTimeout` tick, and whenever the page stalls
(level draw, roster sync, tab throttling) notes arrive late or not at all. Longer look-ahead (0.1 → 0.8 s) and
priming at load (b8074e0f) helped, but the design is still only as reliable as the main thread.

Ableton's **Freeze** solves the same problem the same way: render the track to audio once, play the audio.
This trades memory for timing. Here the trade is right: a frozen song is one `AudioBufferSourceNode` with a
loop region — zero per-note work, nothing to drop, and it survives tab throttling.

## 1. What stays live, what gets frozen

| | today | after |
|---|---|---|
| Song (FM/PSG/DAC channels) | live chip worklet, row by row | **frozen** `.ogg`, decoded once, looped |
| Game SFX (coin/jump/key/door/…) | `engine.playOriginalSfx` → 6-slot SFX worklet | unchanged (one-shot, tiny) |
| Vibe key-shift + grid quantize | `vibe.js` reads `engine.isPlaying()` / `nextGridTime(16)` | unchanged — the engine keeps the clock (§3) |
| Song palette, ORIGINAL SOUNDS opt-out, class mode | park-music.mjs | unchanged |
| `lowPowerOff` (IceCap FM5, Launch Base FM4, Keen ch4) | voices skipped | a second render per song (`<id>.lowpower.ogg`) |
| Fallback when the `.ogg` is missing / fails to decode | — | the live scheduler, exactly as today |

Loss we accept: `setTempoScale` (unused by the park) and sub-row liveness of mixer changes (the park has no mixer).

## 2. Assets (Grok's side, handoff)

New dir `handoff/audio/tracker/frozen/`, produced by a new tool `tools/offline/freeze.js <id> [--all]` built on
`render_offline.js` (the real engine in headless Chrome):

- `frozen/<id>.ogg` — Vorbis q5 (~160 kbps), 44.1 kHz stereo. Content = `[intro][loop]`, where `loop` is the
  **second** pass of `song.order` from a render of intro + 2 loops. The second pass carries the previous pass's
  release tails across the loop seam, so wrapping `loopEnd → loopStart` is seamless. No normalisation: engine
  master is NOT applied (park-music sets volume), `gainTrim`, `levels`, `mix` vol/mute/solo are (same as live).
- `frozen/<id>.lowpower.ogg` — same with `--lowpower` (only for songs with a non-empty `lowPowerOff`).
- `frozen/<id>.json` sidecar:
  ```json
  { "id": "icecap", "sampleRate": 44100, "introSeconds": 0, "loopSeconds": 83.3086,
    "renderedFrom": "songs/icecap.json", "songSha1": "…", "lowPower": "icecap.lowpower.ogg" }
  ```
  `introSeconds` / `loopSeconds` are computed from the song (`rows × 60/bpm/rowsPerBeat`), not measured.
  `songSha1` lets the drift test fail when a song changes but its freeze was not re-rendered.

Vorbis, not mp3: mp3 has encoder delay/padding so loop points land in the wrong place; Vorbis decodes gapless.

Sizes (intro + loop): IceCap 83 s, Keen 56 s, Launch Base 104 s, Mushroom Hill 44 s, Park Bounce 34 s →
~8 files, ~9 MB tracked in git. Decoded in RAM: ≤ 37 MB (Launch Base), one song at a time. Re-render only when
a song changes; each re-render adds its size to git history, so freezes are rebuilt deliberately, not on every
mix tweak.

## 3. Engine (Grok's side, tracker-engine.js)

A frozen song plays **through the engine**, so the clock, `isPlaying`, `nextGridTime`, `on('beat'|'bar'|'loop')`,
`sfxOut`, mode gating and master gain all keep one owner and vibe.js needs no change.

```js
engine.load(song, { frozen: { buffer /* AudioBuffer */, introSeconds, loopSeconds,
                              lowPowerBuffer /* AudioBuffer | null */ } })
```

- `play()`: when `frozen` is set, start a buffer source at `pos.time` (`t + 0.05` as today) through `master`
  with `loop = true, loopStart = introSeconds, loopEnd = introSeconds + loopSeconds`; `skipIntro` → `offset = introSeconds`.
  No row scheduling, no chip worklet node for the song. The row/beat/bar/loop events and `nextGridTime` are
  derived from `(ctx.currentTime − startTime)` and the song's `rd`, so SFX quantize still lands on the grid.
- `stop(fade)`: same master ramp, then `source.stop(t + fade + 0.02)`.
- `setLowPower(bool)` while playing: swap to the other buffer at the same song offset (new source, `offset =
  current position`, 20 ms crossfade). If no `lowPowerBuffer`, keep playing the full mix.
- `setMode('class')`: unchanged (class refuses play / mutes as today).
- `usesWorklet()` stays true for SFX; a new `isFrozen()` for the park's diagnostics.
- `load(song)` without `frozen` behaves exactly as today — this is the fallback.

## 4. Park (our side)

- `scripts/sync-park-music.mjs`: copy `frozen/*.ogg` + `frozen/*.json` to `apstat-park/music/frozen/` (binary
  copy, byte compare in `drift()`); the drift test also checks each sidecar's `songSha1` against the live song.
- `park-music.mjs`: on song pick (and at boot for the persisted pick), fetch `frozen/<id>.json`, then the
  `.ogg` (+ `.lowpower.ogg` when the sidecar names one), `decodeAudioData` on the bus context, and call
  `engine.load(song, { frozen })`. Any failure (404, decode error, old engine without `frozen`) →
  `engine.load(song)` as today, one `console.info('park music: live fallback for <id>')`.
  Keep one decoded song in memory (the current one); drop it on song change. The existing priming step is
  removed for frozen songs (nothing to warm).
- Not in the service-worker precache (`sw.js` lists nothing under `apstat-park/music` today); plain HTTP cache.
- Tests (`park-music.test.mjs`): drift incl. frozen files + sha pin; pick → fetch sidecar/ogg → `load` called
  with `frozen` (fake `decodeAudioData`); 404 → plain `load`; lowPower sidecar → both buffers decoded;
  `playSfx` still routes to `playOriginalSfx` with a frozen song.

## 5. Verification

1. Grok: for each song, `freeze.js` output vs a 40 s `render_offline.js` render of the same song: spectral
   similarity ≥ 0.99 over the overlap (it is the same engine; anything less is a bug in the trim), and the loop
   seam has no click (peak of |x[loopEnd−1] − x[loopStart]| below −40 dBFS).
2. Us, in the browser (local harness, then the public URL): IceCap from a cold load, PLAY immediately — no
   missing notes at the start; let it wrap the loop twice — seamless; toggle low power mid-song — continuous;
   coin/jump SFX still in key and on the grid; `engine.isFrozen() === true`; no console errors. Then kill the
   `.ogg` (block the URL) and confirm the live fallback still plays.
3. Chromebook-class CPU: song playback cost should drop from ~15–25 % of a core (TRACKER_SPEC §7d CPU) to the
   cost of one buffer source; SFX worklet only.

## 6. Order of work

1. Grok: `freeze.js` + `frozen/` assets + the engine's `frozen` load option (+ TRACKER_SPEC section). Prompt in
   `state/park-music-freeze-grok-prompt.md`.
2. Us (branch off master in the music worktree): sync script + drift test, park-music fetch/decode/load with
   fallback, tests, local browser check, build bump, show the teacher, push on go (client only — the relay
   mirrors no music files).
3. If the teacher wants it sooner: step 2 can land first with the fallback active (no behaviour change), and
   the freezes switch on as soon as the handoff ships them.

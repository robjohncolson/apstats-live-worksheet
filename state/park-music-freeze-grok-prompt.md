# Prompt for Grok: frozen songs for APStat Park

Context: the park plays your tracker songs live (`tracker-engine.js` v2, chip AudioWorklet). On the students'
machines the main-thread scheduler drops notes whenever the page stalls — IceCap worst. We raised the
look-ahead to 0.8 s and prime the DAC kits + worklet node at load; it is better, not fixed. We want to
**freeze** the songs (Ableton sense): render each song once with the real engine, loop the audio, keep the
engine live only for SFX, clock and gating. Full spec on our side: `PARK_MUSIC_FREEZE_SPEC.md` (repo root).

Please add, in `handoff/audio/tracker/` (your editing home — we never touch these files):

## 1. `tools/offline/freeze.js <id> [--all]`

Built on `render_offline.js` (real engine, headless Chrome, OfflineAudioContext + AudioWorklet).

- Render **intro + 2 passes of `song.order`** at 44.1 kHz stereo, engine master NOT applied, everything else as
  live (`gainTrim`, `levels`, `mix` vol/mute/solo, approved mix). No `--normalize`.
- Write `frozen/<id>.ogg` = `[intro][second loop pass]` — the second pass so release tails from the previous
  pass are baked across the loop seam. Vorbis q5 (ffmpeg `-c:a libvorbis -q:a 5`). Not mp3 (encoder
  delay/padding breaks loop points).
- Songs with a non-empty `lowPowerOff` also get `frozen/<id>.lowpower.ogg` (`--lowpower` render).
- Sidecar `frozen/<id>.json`:
  `{ id, sampleRate: 44100, introSeconds, loopSeconds, renderedFrom: "songs/<id>.json", songSha1, lowPower: "<id>.lowpower.ogg" | null }`
  with `introSeconds`/`loopSeconds` computed from the song (`Σ rows × 60/bpm/rowsPerBeat` over `intro` / `order`,
  honouring per-pattern `rows`), not measured. `songSha1` = sha1 of `songs/<id>.json` at render time.
- Checks the tool prints: spectral similarity vs a plain `render_offline.js` render over the overlap (expect
  ≥ 0.99 — same engine), and the loop-seam step `|x[loopEnd−1] − x[loopStart]|` in dBFS (expect < −40).

Expected lengths: IceCap 0 + 83.3 s, Keen 0 + 55.6 s, Launch Base 46.7 + 56.8 s, Mushroom Hill 3.1 + 41.2 s,
Park Bounce 0 + 34.3 s.

## 2. Engine: `engine.load(song, { frozen })`

```js
engine.load(song, { frozen: { buffer, introSeconds, loopSeconds, lowPowerBuffer /* or null */ } })
```

- `play()` with `frozen`: one `AudioBufferSourceNode` → `master`, started at `pos.time` (`t + 0.05` as now),
  `loop = true, loopStart = introSeconds, loopEnd = introSeconds + loopSeconds`; `opts.skipIntro` → start at
  `offset = introSeconds`. No row scheduling and no song chip-worklet node. `row`/`beat`/`bar`/`loop` events and
  `nextGridTime(div)` / `getClock()` derived from `ctx.currentTime − startTime` and the song's row duration, so
  vibe.js quantize still lands on the grid with **no change to vibe.js**.
- `stop(fade)`: same master ramp as today, then `source.stop(t + fade + 0.02)`.
- `setLowPower(bool)` while playing: swap to the other buffer at the same song offset (new source with
  `offset`, ~20 ms crossfade). No `lowPowerBuffer` → keep the full mix.
- `setMode`, `unlock`, `isUnlocked`, `isPlaying`, `sfxOut`, `hasOriginalSfx`/`playOriginalSfx`, `usesWorklet()`
  (SFX still use the 6-slot worklet) unchanged. Add `engine.isFrozen()`.
- `load(song)` without `frozen` must behave exactly as today — that is our fallback when an `.ogg` is missing
  or fails to decode.

## 3. Docs

A short TRACKER_SPEC section (next to "Offline renders = the real engine"): what freeze.js renders, the
`[intro][second loop]` trim, the sidecar fields, when to re-render (song JSON changed → `songSha1` mismatch),
and the `frozen` load option. Add `frozen/` to START_HERE_FOR_CLAUDE.md's file list.

## Not asked

Don't change how songs are built (`smps_export.py`, `keen_export.py`, `faithful.py`), the song JSON format,
vibe.js, or the SFX path. We will do the park side (sync script copies `frozen/`, fetch + `decodeAudioData`,
`load(song, { frozen })`, live fallback, tests) once the assets and the load option are in the handoff.

Questions welcome: is `[intro][second pass]` the trim you'd pick, or would you rather bake tails some other way?
And if the YM "ladder"/AC-coupling stage has state across the seam that a trim can't carry, say so — a tiny
crossfade at the seam is acceptable to us.

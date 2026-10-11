# APStat Park tracker engine — handoff spec (prototype, lives in /workspace/tracker on the box)

> **Oct 10 2026, 8:52 PM:** Star Light Zone was removed at Robert's request. No remaining song used the Sonic 1 drum kit (samples/s1.json) or the Sonic 1 SFX (sfx/genesis-s1.json), so both were removed too. The removed files are in /workspace/tracker-prev/starlight-removed/ (box) and handoff\audio\tracker\_removed\ (Athena). Star Light / S1 mentions below are history only. The S1 timpani rates and S1 driver support in smps_drv.py are kept for reference.

Files: `tracker-engine.js`, `vibe.js`, `palette.js` (classic scripts; each exposes a global and `module.exports`),
`songs/launchbase.json`, `demo.html` (single file, modules + song inlined, works from file://), `arrange.py`
(score → tracker song), `render_preview.py` (offline numpy mirror of the engine), `build_demo.py`.

## 1. Architecture
- **Master clock / scheduler**: `setTimeout` every 25 ms, schedules every row whose time is < `ctx.currentTime + 0.1 s`.
  Row duration = `60 / (bpm * tempoScale) / rowsPerBeat`; tick = row / `ticksPerRow`. Swing delays odd rows by `swing * row`.
  Events (`row`, `beat`, `bar`, `loop`) fire via `setTimeout` aligned to the audio time of that row.
  `nextGridTime(16)` returns the next 1/16 on the song grid (used by the vibe shifter).
- **Channels**: `drums, bass, pad, arp, lead`. Each melodic channel = ONE pre-created oscillator (+ envelope gain, + vibrato
  LFO into `detune`), created on `play()`, stopped on `stop()`. Drums = one kick sine + one looping noise buffer into
  bandpass (snare) and highpass (hat) envelopes. ≈17 nodes total while playing, no convolver, no per-note node churn.
  Notes = automation on those nodes (frequency steps for arpeggios, ramps for slides, ADSR on the env gain).
- **Graph**: `voice (platform factory, §7b) → env → chanGain → stemGain → master(0.27) → dest` and `sfxOut(0.48) → dest` (vibe.js plays into sfxOut).
  In the game pass `dest` = the existing **sfx.js master bus** so its limiter + −3 dBFS ceiling apply to music and SFX.
  The 0.27 / 0.48 defaults keep music plus SFX below −3 dBFS for all six songs (offline worst case −3.4 dBFS; headless browser −7 to −9.7 dBFS).

### API
```
var eng = TrackerEngine.create(ctx, destGain, { mode:'class', unlocked:false, lowPower:false, volume:0.27 });
eng.load(song); eng.play() -> bool; eng.stop(fadeSec)
eng.setStems({drums:true, bass:0.5, pad:false, arp:1, lead:1})   // bool or 0..1, 200 ms ramp
eng.mute(ch, bool); eng.solo(ch|null); eng.setTempoScale(0.25..4); eng.setLowPower(bool)
eng.unlock(bool); eng.isUnlocked(); eng.setMode('solo'|'class')
eng.on('row'|'beat'|'bar'|'loop', fn); eng.off(evt, fn); eng.getClock(); eng.nextGridTime(div); eng.isPlaying()
```

## 2. Song format (JSON)
```
{ "id", "title", "source", "instrumentSet":"nes|genesis|opl2", "bpm", "rowsPerBeat":4, "rowsPerPattern":16, "ticksPerRow":6, "swing":0, "key":"G", "scale":"minor", "loop":true,
  "palette": {"bg","fg","accent","accent2","hud"},
  "instruments": {
    "drums": {"kick":{"wave","from","to","decay","vol"}, "snare":{"noise","filter","tone","decay","vol","steps?","body?"}, "hat":{...}},
    "<ch>":  {"wave":"pulse|square|triangle|sine|tri4|halfsine|abssine|quartersine", "duty", "adsr":[a,d,s,r], "vol", "steps?", "fm?":{...}, "from?":"patch provenance", "lowPowerOff":true} },   (see §7b)
  "channels": ["drums","bass","pad","arp","lead"],
  "patterns": { "P00": { "<ch>": [ {"r":row, "n":midi|"K"|"S"|"H", "l":lengthRows, "v":vel, "fx":{...}} ] } },
  "order": ["P00","P01",...] }
```
Cells are sparse (tracker rows). `r` may be fractional (sub-row offset). Effects (`fx`):
`arp:[0,4,7]` + `arpRate` ticks (2 = 1/48 note, 3 = 1/32) · `vib:[depthSemitones, rateHz, delaySec]` · `slide:ticks` (portamento from previous note).

## 3. Arrangement rules (all songs)
- **Lead**: exact pitches and onsets from the SMPS transcription; gate shortened (≈85 %, min 0.25 row); vibrato on notes ≥ 1.5 beats; octave trill (`arp:[0,12]`) on notes ≥ 3 beats.
- **Arp**: chord per beat from the transcription's harmony, one cell per beat cycling chord tones every 2 ticks (1/48).
- **Pad**: one soft 50 % pulse voice, long attack (0.35 s), plays the chord 3rd/5th, held while the chord is unchanged; muted in lowPower.
- **Bass**: original bass note on every 1/8, alternating root / +octave (bounce), short gate.
- **Drums**: kick / noise snare / hat only, original rhythm.
- Key detection: Krumhansl profile over lead+bass+harmony → **G minor** for LBZ1. 29 one-bar patterns (28 unique), 122.46 BPM.

## 4. Vibe shifter (vibe.js)
`VibeShifter.create(ctx, dest, engine).playSfx(name, {quantize, vel})`. SFX are scale-degree scripts (table between
`/*SFX_JSON_START*/…/*SFX_JSON_END*/`, also read by the offline renderer): `jump, land, coin, key, door, stageClear, ui, error`.
- Pitch: degree → MIDI via the song's `key` + `scale` (major/minor/dorian/mixolydian/pentatonic) and the SFX's octave.
- Timbre: each step names a song instrument (`lead`/`arp`/`bass`) → same wave/duty; `noise`/`kick` mirror the drum kit.
- Rhythm: step lengths in 1/32 notes of the song BPM; with `quantize` (default on) the SFX starts on `engine.nextGridTime(16)` while music plays.
- Fallback (no song): C major, 120 BPM, square, starts immediately. Keep feedback-critical SFX (error, UI) unquantized in-game if latency matters (worst case = one 1/16 ≈ 120 ms).

### 4a. SFX pitch safety (Oct 10 2026)
Cause of shrill SFX: degToMidi always transposed UP from C by the key (B = +11, A# = +10, G = +7). On top of that, `coin`/`ui`/`key` use oct +1 and `key` climbs two octaves (degree 14). In a B-major song, `key` peaked at B7 (3951 Hz) and `coin` at B6, played on the bright FM/square voices. Keen's arp voice also has an OPL modulator ratio of 9, which adds harsh high partials.
Fix (vibe.js `sfxNotes`, mirrored in render_preview.py):
- Nearest transposition: key offsets above +6 become negative (B = -1, A# = -2, G = -5).
- Rising sweeps are capped at one octave above their first note (higher notes fold down an octave).
- Whole-octave fold so the top melodic note is in C4..C6 (MIDI 60-84); bass SFX top notes go in C2..C4.
- Then the user offset: `song.mix.sfx = {pitch: -12..+12 semitones, vol: dB}`, set by the SFX row in the demo mixer and saved by Export.
- SFX voices only: an FM modulator ratio above 4 is halved until it is 4 or less, and the index is x0.6.
Highest SFX note per song, before -> after (Hz):

| SFX | park-bounce | launchbase | starlight | icecap | mushroomhill | keen-wotb |
|---|---|---|---|---|---|---|
| jump | C5 523 → C5 523 | G5 784 → G4 392 | B5 988 → B4 494 | G5 784 → G4 392 | A#5 932 → A#4 466 | G5 784 → G4 392 |
| land | C2 65 → C2 65 | G2 98 → G2 98 | B2 123 → B2 123 | G2 98 → G2 98 | A#2 117 → A#2 117 | G2 98 → G2 98 |
| coin | C6 1047 → C6 1047 | G6 1568 → G5 784 | B6 1976 → B5 988 | G6 1568 → G5 784 | A#6 1865 → A#5 932 | G6 1568 → G5 784 |
| key | C7 2093 → C6 1047 | G7 3136 → G5 784 | B7 3951 → B5 988 | G7 3136 → G5 784 | A#7 3729 → A#5 932 | G7 3136 → G5 784 |
| door | G3 196 → G3 196 | D4 294 → D3 147 | F#4 370 → F#3 185 | D4 294 → D3 147 | F4 349 → F3 175 | D4 294 → D3 147 |
| stageClear | C5 523 → C5 523 | G5 784 → G4 392 | B5 988 → B4 494 | G5 784 → G4 392 | A#5 932 → A#4 466 | G5 784 → G4 392 |
| ui | G5 784 → G5 784 | D6 1175 → D5 587 | F#6 1480 → F#5 740 | D6 1175 → D5 587 | F6 1397 → F5 698 | D6 1175 → D5 587 |
| error | D3 147 → D4 294 | A3 220 → A4 440 | C#4 277 → C#4 277 | A3 220 → A4 440 | C4 262 → C4 262 | A3 220 → A4 440 |

park-bounce: C major; launchbase: G minor; starlight: B major; icecap: G minor; mushroomhill: A# major; keen-wotb: G mixolydian

## 5. Palette contract (palette.js)
`Palette.apply(song.palette, {el, ms:400})` tweens and sets `--park-bg, --park-fg, --park-accent, --park-accent2, --park-hud`
on `<html>`. Game CSS should only read these vars. Launch Base palette: bg `#1d2440` (dusky indigo sky), fg `#f4ead8`
(warm off-white), accent `#f08a24` (LBZ orange), accent2 `#5f86b3` (steel blue), hud `#2a3a5c` (dark steel).

## 6. Classroom gating
- **Locked by default** (easter egg): `play()` returns false until the game calls `eng.unlock(true)` — call it from the
  "all activities complete" check and persist the flag so it survives reloads.
- **Solo-only**: default mode is `'class'` (no music); the game sets `'solo'` only in solo play. SFX via vibe.js still work in class (they're game SFX).
- **lowPower** default ON for Chromebooks/class devices (no pad, no vibrato); off in solo on capable devices.
- **Loudness**: route `dest` and vibe output through sfx.js' master → limiter → −3 dBFS ceiling; respect sfx.js level (normal/quiet/off) and its gate.
- Respect autoplay: call `play()` only from a user gesture (the unlock toast's button).

## 7. Song list (demo.html song picker switches music, vibe key/scale, and palette live)

| id | title | key / scale | BPM | rows/beat | bars | loop | bg | fg | accent | accent2 | hud |
|---|---|---|---|---|---|---|---|---|---|---|---|
| park-bounce (nes) | Park Bounce (hook A) | C major | 140.00 | 4 | 20 | 34.3 s | #fff4dc | #3a2e2a | #ff8a3d | #8fd3c8 | #ffd9b0 |
| launchbase (genesis) | Launch Base Zone Act 1 | G minor | 122.46 | 4 | 29 | 56.8 s | #1d2440 | #f4ead8 | #f08a24 | #5f86b3 | #2a3a5c |
| icecap (genesis) | IceCap Zone Act 1 | G minor | 138.28 | 4 | 48 | 83.3 s | #dff1ff | #14324f | #2bb6e8 | #7a5fd1 | #b9dcf5 |
| mushroomhill (genesis) | Mushroom Hill Zone Act 1 | A# major | 116.60 | 6 | 20 | 41.2 s | #1e3a22 | #f6efd6 | #e9472f | #f2a23a | #2f5a32 |
| keen-wotb (opl2) | Wednesday On the Beach (Commander Keen 5) | G mixolydian | 155.32 | 4 | 36 | 55.6 s | #f3dfb2 | #2b2a3a | #18a5a0 | #f2704a | #e8c48a |

Palette moods: Park Bounce = Pico Park pastel (cream, warm orange, mint); Launch Base = dusky indigo + LBZ orange; Starlight = night sky with yellow city lights and a neon-magenta sign; IceCap = icy white-blue with cyan and purple; Mushroom Hill = forest green with autumn red and orange; Keen beach = sand, teal water, sunset coral.

## 7a. Faithful arrangements (tools/faithful.py, Oct 10 2026)
Every song is now built by `tools/faithful.py` (`song.arrangement = "faithful"`). The old `arrange.py` stem arranger (lead/bass/arp/pad + generated 8th-note root/octave bass, per-beat arpeggio cells, chord-tone pad, auto vibrato/octave trills) is no longer used for any song; it remains only as a library for presets / `patch_to_inst`.
Rules:
- One tracker channel per ORIGINAL channel, named after it (`FM1`..`FM5`, `PSG1`, `PSG2`; Keen `ch1`..`ch8`). Notes are copied verbatim from the ROM/IMF data: onset (fractional rows allowed, so SMPS timing is exact), length, octave, and section order over the full loop. No added fx.
- Drums are the original drum data: Genesis DAC samples (kick / snare / hat / tom by sample id; toms are a pitched sine drop) plus PSG3 noise (hat); Keen IMF ch5 (kick) and ch6 (hats + a few snares), which the original plays as melodic-mode FM percussion.
- Only exact doubles are dropped (a channel that repeats another note-for-note with a tiny delay = chorus/echo). Distinct lines are always kept. Voice cap 8 melodic voices, lowPower cap 5: lowPower mutes channels flagged `lowPowerOff` (doubles first, then the lower of a harmony pair).
- Each channel gets its own original patch (most-used SMPS `EF` voice per channel; per-channel OPL registers in tools/patches/opl-patches-ch.json), mapped with the same 2-op rules as before (7b). Levels are role-based, not from the ROM: lead 0.20, bass 0.42, other channels 0.105 (genesis); 0.24 / 0.45 / 0.12 (opl2); the genesis kit is at 70% of the preset.
- `song.roles` = {lead, bass, arp, pad} -> channel. SFX (vibe.js) take their timbre from the role's channel; `setStems/mute/solo` accept a channel name or a role name.

| song | kept channels (roles) | dropped | lowPower mutes |
|---|---|---|---|
| Launch Base | FM1 lead, FM2 bass, FM3, FM4, FM5, PSG1 | PSG2 (identical to PSG1, 1 frame later) | FM4 (FM3 repeated 5 frames later) |
| Star Light | FM5 lead, FM2 bass, FM1 (partly an octave under FM5), FM3, FM4, PSG1, PSG2 | none | FM4, PSG2 (lower voices of the two harmony pairs) |
| IceCap | PSG1 lead, FM1 bass, FM2, FM3, FM4, FM5 | PSG2 (unison double of PSG1) | FM5 (echoes FM4 18 frames later) |
| Mushroom Hill | FM1 lead, FM2 bass, FM3, FM4 | FM5 (exact echo of FM1, 7 frames later) | none |
| Keen 5 WotB | ch8 lead, ch1 bass, ch2, ch3, ch4, ch7; drums ch5 + ch6 | none | ch4 (harmony under ch3) |
| Park Bounce (original) | lead, bass, kick + snare | generated arp + pad, 79 hi-hats | none |

Launch Base was frozen at the approved prototype. Checked against SMPS: the approved lead was FM1 note-for-note (100%), but the bass was the generated 8th-note root/octave bounce (17% match to FM2) and arp/pad were generated, so those were replaced by the original FM2..PSG1 lines. Keen is now the plain original "Wednesday On the Beach" at the IMF tempo (156 BPM, 36 bars); the v3 "blend" bridge was removed.

### 7a.1 Mix pass (Oct 10 2026, evening): Star Light, IceCap, Mushroom Hill
- Original volumes: for these three songs (`"volumes":"smps"` in songs.config.json) every channel's level comes from the ROM. That is header volume + `E6` volume changes (the value in effect during the loop) + carrier TL for FM at 0.75 dB per step; PSG is 2 dB per step + 6 dB. Levels are set relative to the lead channel (lead = 0.20). The attenuation used is stored as `instruments[ch].smpsAttenDb`. Launch Base and Keen are unchanged.
- Star Light: FM3/FM4 come out 10.5 dB under the FM5 lead, PSG1/PSG2 9 dB under, and FM1 8.25 dB under; FM2 bass is 4.5 dB over. Chord FM brightness is softened (FM1/FM3/FM4 modulator index x0.45, mod sustain x0.6).
- IceCap: the high repeated beeping is PSG1's G6 (MIDI 91) "ice bell" figure in the A sections. PSG1 also carries the B-section melody, so the channel stays. A note rule (`noteRules`) drops PSG1 notes >= MIDI 88 an octave (to G5) at velocity 0.35. FM2-FM5 sit 7.75 dB under PSG1 per the ROM.
- Mushroom Hill: FM3/FM4 chords use gate 0.55 (mix block), sustain 0.35, release 50 ms, modulator index x0.45, mod sustain x0.4, plus an extra -8 dB trim, so they sit 9.5 dB under the FM1 lead.

### 7a.2 Hand mixer (demo.html) and the song `mix` block
`song.mix[ch] = {vol, gate, bright, oct, mute, solo}` per channel, plus `song.mix.sfx = {pitch, vol}` (SFX row); tracker-engine.js applies it live:
vol = dB trim on the channel gain; gate = multiplier on note length; bright = multiplier on the FM modulator index (no effect on PSG/NES/pulse voices); oct = octave shift (-2..+2); mute; solo (one channel). `engine.setMix(ch, {...})` changes it while playing; `engine.getMix()` reads it. Songs without a mix block play exactly as before.
How to use:
1. Open `demo.html` (double-click; file:// is fine). Tick "Easter egg unlocked", pick the song, and press Play.
2. In **Mixer**, each original channel (hover for its patch) has vol / gate / bright / oct sliders, a mute checkbox, and a solo radio (double-click the radio to clear it). Changes are heard immediately. "Reset mix" returns to the song file's values.
3. Click **Export song JSON**. The browser downloads `<id>.json` (the whole song with your settings in `mix`).
4. Drop that file into `songs\` (replace the old one), then run `python3 tools/build_demo.py` to bake it into demo.html (or give the file straight to the game).
`tools/faithful.py` keeps an existing song file's `mix` block when it rebuilds (pass `--reset-mix` to discard it). render_preview.py mirrors the mix block.

## 7b. Instrument sets (song.instrumentSet: 'nes' | 'genesis' | 'opl2')
One voice factory in tracker-engine.js (`makeVoice` / `makeDrums`) builds one persistent voice per channel per play(). Nodes are reused for every note, and vibe.js gets voices from the same factory (`engine.sfxVoice(kind)` / `engine.sfxDrum(kind,t,vel,len)`), so SFX always match the current song's platform. With no song loaded, the NES set is the default.

Instrument JSON (per stem): `{wave, duty?, adsr:[a,d,s,r], vol, steps?, fm?:{ratio, index, modAttack, modDecay, modSus, modWave, addLevel?}, from?}`
- wave: sine | triangle | square | sawtooth | pulse (duty) | tri4 (2A03 4-bit stepped triangle) | halfsine | abssine | quartersine (OPL2 waveforms 1-3). The table waves are built with PeriodicWave (64 harmonics).
- fm: 2-op. Modulator osc -> GainNode (depth = index x f x ratio Hz) -> carrier.frequency. The depth has its own envelope (linear attack to the full index, then setTargetAtTime toward index x modSus with time constant modDecay/3), which gives the bright FM attack. addLevel>0 = OPL additive connection (the modulator is also heard directly).
- steps: 2A03-style volume, 16 levels changing only on 60 Hz frames (decay and release are staircases).
- drums: `{kick:{wave,from,to,decay,vol}, snare:{noise,filter,tone,decay,vol,steps?,body?:{f,decay,vol}}, hat:{noise,filter,tone,decay,vol,steps?}}`; noise is white | lfsrLong | lfsrShort (precomputed 1 s 15-bit LFSR buffers clocked at 1.789773 MHz / 202 and / 64).

| set | lead | bass | arp | pad | drums |
|---|---|---|---|---|---|
| nes | pulse 12.5% (Park Bounce uses 25%), stepped | tri4 stepped triangle | pulse 25%, stepped | pulse 50%, stepped | kick = tri4 pitch drop; snare = LFSR long mode; hat = LFSR short (metallic) mode, highpassed; stepped decays |
| genesis | per-song SMPS patch (preset: brass, ratio 1, index 3) | SMPS patch (preset: slap, fast mod decay) | SMPS patch (preset: EP/bell, ratio 3.5) | SMPS patch (preset: soft, index 0.6) | kick sine 220->48 Hz in 0.12 s; snare = bandpassed white noise + 190 Hz triangle body; hat = 9 kHz highpass, 25 ms |
| opl2 | per-channel OPL patch from the IMF stream | OPL patch | OPL patch | OPL patch | softer: sine kick 130->55 Hz, lowpassed-noise snare + body, quiet hat |

Patch provenance (tools/patches/):
- Genesis: smps_patches.py records each channel's most-used `EF` voice-select byte (S3K global-bank voices ignored), decodes the 25-byte YM2612 voice at the song's voice table (FB/ALG, then DT/MUL, RS/AR, AM/D1R, D2R, D1L/RR, TL for ops 1,3,2,4) and maps it to 2-op. Carrier = op4. Modulator = the loudest (lowest TL) non-carrier op for the algorithm. ratio = MULmod / MULcar (MUL 0 = 0.5). index = 7 x 10^(-0.75 TL/20), x0.6 for multi-carrier algorithms. Mod attack/decay/sustain come from AR/D1R/D1L, carrier ADSR from AR/D1R/D1L/RR. Feedback >= 5 on op1 makes the modulator a triangle (extra harmonics). Floors keep notes musical: index >= half the preset, sustain >= 0.35 lead / 0.5 pad / 0.2 arp / 0.25 bass, release >= 30 ms. Voices used: Launch Base 02/00/01/01 (lead/bass/arp/pad), Star Light 03/01/02/02, IceCap PSG1 (square, SN76489) / 00 / 01 / 01, Mushroom Hill 02/01/03/03.
- OPL2: opl_patches.py snapshots 0x20/0x40/0x60/0x80/0xE0 (modulator and carrier slots) and 0xC0 at every key-on of each IMF channel, then takes the most common patch per channel: lead = ch 8, bass = ch 1, arp = ch 6, pad = ch 2. MULT table, TL -> index (4 x amp, softer than Genesis), AR/DR/SL/RR -> envelopes, waveform select -> wave name, connection bit -> additive. "Wednesday On the Beach" uses only waveform 0 (sine) on these channels; the other OPL waves are supported for future songs.

lowPower: at most 5 melodic voices (channels flagged lowPowerOff are muted); no tom oscillator; for genesis/opl2 FM, the index is fixed at 0.6 x index (no index envelope), there is no snare body oscillator, and there is no vibrato.
Voice budget (oscillator/buffer sources per play(), measured headless Oct 10): park-bounce 7 (7), launchbase 22 (17 lowPower), starlight 24 (17), icecap 22 (17), mushroomhill 17 (15), keen 22 (18). Plus 1-4 short-lived nodes per SFX.
Levels: engine master default 0.27 and sfxOut 0.48. Headless browser peaks with SFX: -6.6 to -11.3 dBFS; offline mirror worst case (all channels + SFX) -3.8 dBFS (park-bounce).

## 7c. Original Sega SFX and DAC drum samples (Oct 10 2026)
These were extracted from Robert's own ROMs (Sonic 1 REV01, Sonic 3, Sonic & Knuckles) for use in APStat Park; Robert reports he has Sega's permission. Tools are in tools/sega/ and need the ROMs in /workspace/sonic/.

**SFX data** (`tools/sega/sfx_extract.py` -> `sfx/genesis-s1.json` 48 effects $A0-$CF, 52 KB; `sfx/genesis-s3k.json` 173 effects $33-$DF, 459 KB).
- S1 SoundIndex @0x78B44: big-endian, track pointers relative to the header.
- S3K: the SFX pointer table is in the S&K Kosinski driver data (@0xF7760, +0x37C), $33-$DF, with the data in z80 bank 0x1F. 166 of 169 effects are byte-identical to Sonic 3's table @0xE767C, so one set covers S3 and S&K.
- An SMPS interpreter runs each effect at 60 frames/s: notes, ties, note fill, loops/calls/jumps, transposition, E6/EC volume, E1 detune, F0 modulation (applied in FM fnum / PSG period units), voice changes, and F3 noise mode. Output per channel: `{kind: fm|psg|noise, ch, inst (2-op voice from the effect's own 25-byte SMPS patch), gainDbPerVol, ev: [[frame, midi|null, vol, keyon]]}`.
- Known approximations: PSG volume envelopes (F5) become a fixed short decay; S3K F1/F4 modulation envelopes are on/off; FM is the engine's 2-op mapping, not 4-op.
- Playback: `engine.playOriginalSfx("s3k:33", t, {semis, vol})` uses the same makeVoice FM factory (one short-lived voice per channel), plus a square osc for PSG and a noise buffer for noise. Check renders: `tools/sega/sfx_render.py` -> sfx/wav/<set>/<id>_<name>.wav (box only, about 65 MB).
- Identification: by fingerprint against S1 (note-interval / voice / length match plus byte matches of track data), with the S3K ID order anchored by those matches. Identified:
  - S1: A0 jump, A1 lamppost, A3 death, A4 skid, A6 spike hurt, AA splash, B5 ring, BE roll, C1 break item, C3 giant ring, C6 ring loss, CC spring, CD switch, CF signpost.
  - S3K: 33/34 ring R/L, 35 death, 36 skid, 37 spike hit, 39 splash, 3B drown, 3C roll, 3D break, 62 jump, 63 starpost, A9 air ding, AB spindash, AC continue, B1 spring (byte match with S1 spring), B2 error, B3 big ring, B4 explode, B8 signpost, B9 ring loss, 5B blip (matches S1 switch).
  - Not in the SFX tables: the extra-life jingle (it is a music track).

**DAC samples** (`tools/sega/dac_extract.py` -> samples/<kit>/*.wav, 8-bit mono at native rate, plus samples/<kit>.json with base64 PCM for the engine). DPCM decoding: 16-entry delta table, start 0x80, high nibble first.
- s1: 3 samples (kick, snare, timpani), 7 IDs, 14 KB WAV. Kosinski DAC driver @0x72E7C, table @z80 0xD6. Rate: fs = 2*3579545/(288+26*pitch).
- s3: 47 unique samples, 68 IDs ($81-$C4), 165 KB WAV. Per-bank playlists at the start of banks 0x1C/0x1D/0x1E (pointer table -> 5-byte entries: rate, length, pointer). Rate: fs = 2*3579545/(297+26*rate).
- sk: 39 unique samples, 61 IDs, 138 KB WAV (S&K bank 0x1E; IDs whose data doesn't decode cleanly there are left out).
- The rate formulas follow the SMPSPlay cycle model; small pitch error is possible.
- Songs: `song.drumKit` = s1 (Star Light), s3 (Launch Base, IceCap), sk (Mushroom Hill). Drum cells carry the original DAC ID in `d`. The engine plays the sample (one BufferSource per hit, gain `instruments.drums.sampleVol`, default 0.55). PSG-noise hats and lowPower use the synthesized kit.

**Vibe mapping**: `song.sfxMap = {coin, jump, key, door, stageClear, error, ui, land: "set:id"}`.

| game SFX | Star Light (s1) | Launch Base / IceCap / Mushroom Hill (s3k) |
|---|---|---|
| coin | B5 Ring | 33 Ring |
| jump | A0 Jump | 62 Jump |
| key | A1 Lamppost | 63 Starpost |
| door | CC Spring | B1 Spring |
| stageClear | CF Signpost | B8 Signpost |
| error | A6 Hit spikes | 37 Spike hit |
| ui | CD Switch | 5B Blip/switch |
| land | A4 Skid | 36 Skid |

Original SFX play at native pitch. `mix.sfx.pitch` (±12 st) and `mix.sfx.vol` still apply. `mix.sfx.transpose = true` adds the nearest key offset (±6); the total is capped at ±12. `mix.sfx.original = false` falls back to the synthesized vibe SFX. Songs without sfxMap (Park Bounce, Keen) are unchanged.
demo.html has an "Original Sega SFX" section: per-game-SFX dropdowns to reassign (saved in sfxMap by Export), original/transpose toggles, and a filterable browser to audition all 221 effects. demo.html is about 1.1 MB because the kits and SFX sets are inlined. previews/sega-sfx-sampler.mp3 (47 s) plays the 8 mapped effects plus death, break, splash, ring loss, and roll/spindash for each set, with 0.6 s silent gaps.

## 7d. Accuracy pass (Oct 10 2026, night): song formats `smps-v2` / `opl-v2`
All five original songs are now rebuilt straight from the sound-driver data, not from per-channel averages:
- **Sega (`python3 tools/smps_export.py`)**: tools/sega/smps_drv.py emulates the SMPS driver frame by frame (S1 68k and S3/S&K Z80): tempo, intro then loop (the intro plays once; `song.intro` lists the intro patterns, `order` is the loop), per-note volume (E6/EC/E5), F0 modulation and S3K modulation envelopes, the ROM PSG volume envelopes (F5), note fill (E8), ties (E7), rests, detune (E1), transposition, pan (E0: L/R/centre per note, `pb`) and noise mode. Each note cell carries `vo` (voice id into `song.voices`, the full 25-byte SMPS voice: alg, fb, 4 operators with DT/MUL/TL/RS/AR/AM/D1R/D2R/D1L/RR), `va` (volume added to the carriers' TL), `pc` (pitch curve in cents per 60 Hz frame) and for PSG `vc` (attenuation per frame = volume + envelope) and `nz`.
- **Keen (`python3 tools/keen_export.py`)**: every IMF key-on with the full OPL2 register snapshot (AM/VIB/EGT/KSR/MUL, KSL/TL, AR/DR, SL/RR, FB/CON; waveform select is never enabled by the song, so all sine), exact 560 Hz timing on the 36-bar grid (155.32 BPM from the IMF length), all 8 used OPL channels including the melodic-mode drum channels 5/6.
- **Synthesis (normal power)**: one AudioWorklet (`ChipDSP` in tracker-engine.js) renders every chip channel sample by sample: YM2612 with all 8 algorithms, op1 feedback, DT, MUL, the chip EG (rate tables, attenuation counter, SL, key scaling) and the YM2612 output stage (9-bit carrier truncation, channel clamp, the model-1 DAC "ladder" step and 7 Hz AC coupling); SN76489 (2 dB steps, 10-bit periods, 16-bit LFSR, taps 0/3); OPL2 2-op with KSL, AM (tremolo 3.7 Hz), VIB (6.1 Hz), EG type (sustained vs percussive), KSR and feedback. Hard YM pan (centre = full level both sides).
- **lowPower** (or no AudioWorklet): the older node-graph voices (2-op approximation of each voice, per-note volume kept); fewer voices.
- **DAC drums**: original samples at the driver rates (S1: fs = 2*3579545/(288+26*p); S3K: 2*3579545/(297+26*r)). S1 timpani: $83 7231 Hz (pitch $1B), $88 9470 Hz ($12, +4.6 st), $89 8697 Hz ($15, +3.1 st), $8A 7040 Hz ($1C, -0.5 st), $8B 6857 Hz ($1D, -0.9 st).
- **Original SFX (`python3 tools/sega/sfx_v2.py`)**: each effect is run through the same driver emulation (PSG envelopes, modulation, fill, detune, pan, per-note volume) into `fx.v2`, played on a separate 6-slot chip worklet (3 FM + 3 PSG; a newer effect on a slot takes it over, as in the game) at the same chip level as the music. lowPower keeps the older 2-op frame player.
- **Approved mix choices** (songs.config.json `faithful.approvedMix`, on top of the accurate volumes, written into the song `mix` block):
  - (removed song) Star Light: the accurate data contradicts the earlier assumption. In the original, FM1 is about 6 dB LOUDER than the lead FM5, and FM3/FM4 are level with it. To keep Robert's approved sound: FM1 -16 dB, FM3/FM4 -11 dB, brightness 0.6.
  - Mushroom Hill: in the original the FM3/FM4 chords already sit about 8 dB under the lead. Approved: gate 0.55, -3 dB, brightness 0.6.
  - IceCap: the original PSG1 bell is at near-full PSG volume (attenuation 1) at G6. Approved: notes >= E6 drop an octave and play at 0.35 (-9 dB).
  - Launch Base, Keen: no deviations (pure original data).
- `song.gainTrim` evens out loudness between songs (accurate levels differ by up to 13 dB); it also scales that song's SFX.

### Reference comparison (tools/ref/)
The reference is the SMPS driver's YM2612 register stream played through **Nuked OPN2** (libvgm's ym3438.c, `ym_ref`, YM2612 mode) plus an exact SN76489 model and the DAC samples (`compare.py <id> [--before]`). For Keen it is the IMF stream played through **pyopl** (DOSBox OPL2), in `compare_keen.py`. For SFX, run `compare_sfx.py <refs>`; there "after" is the real engine in headless Chrome. Metrics (`metrics.py`): spectral = mean framewise log-spectrum correlation, chroma = pitch-class correlation, onset = onset-envelope correlation (below 5 kHz). Results are in tools/ref/similarity.json and sfx/similarity-sfx.json. Before = the previous 2-op faithful arrangement. After = the v2 engine with the approved mix.

| song | before spectral / chroma / onset | after spectral / chroma / onset (segment) |
|---|---|---|
| IceCap | 0.861 / 0.759 / 0.650 | 0.985 / 0.918 / 0.736 (no intro; loops to the start) |
| Launch Base | 0.647 / 0.837 / 0.448 | 0.964 / 0.934 / 0.814 (loop); 0.981 / 0.942 / 0.821 (from start) |
| Mushroom Hill | 0.754 / 0.725 / 0.683 | 0.973 / 0.959 / 0.889 (loop); 0.973 / 0.960 / 0.869 (from start) |
| Keen | 0.710 / 0.741 / 0.011 | 0.890 / 0.984 / 0.994 (from start) |

Per FM channel the levels match the reference within about 1 dB.

### Offline renders = the real engine
`node tools/offline/render_offline.js <id> 40 out.wav [--normalize=-4] [--lowpower]` and `... --sfx s1:B5,s3k:33 out.wav` render with tracker-engine.js itself in headless Chrome (OfflineAudioContext, including the AudioWorklet). previews/*.mp3 and the SFX sampler come from this. render_preview.py is now legacy, and tools/render_v2.py + render_chip.js (same ChipDSP code in Node) feed the comparisons.

### CPU
Offline render cost on the box (one Xeon core, 40 s of song): normal 1.6-2.4 s (4-6% of a core), lowPower 0.9-1.3 s (2-3%). On a Chromebook-class CPU (roughly 3-4x slower per core), estimate about 15-25% of one core in normal mode and about 9-13% in lowPower. Voice/node counts per selftest: 25-37 normal, 18-21 lowPower.

## 8. Adding songs (tools/)
- Current builds: `python3 tools/smps_export.py [id]` (Sega v2), `python3 tools/keen_export.py` (Keen v2), `python3 tools/sega/sfx_extract.py && python3 tools/sega/sfx_v2.py` (SFX). Then run build_demo.py.
- (older) `python3 tools/faithful.py [id ...]` builds songs/<id>.json from the `faithful` block in songs.config.json (genesis: job + keep + roles + lowPowerOff; opl2: src, patches, bpm, bars, keep, roles). This is the current build for all six songs; build_songs.py/arrange.py is the old stem arranger.
- tools/arrange.py SRC OUT [--opts JSON | --opts-file F]: SRC is a `var SCORE = {...}` .js or a .json with {bpm, loopSeconds, tracks{lead,bass,arp,drum}}. Options: id, title, source, palette{bg,fg,accent,accent2,hud}, rowsPerBeat (4|6), key/scale override, leadJson/padJson {path, channel} (an exported channel line replaces the lead or becomes the pad), swing, leadDuty, vibBeats, trillBeats. Paths are never hardcoded.
- tools/songs.config.json holds every song's source, palette, platform, and `faithful` block. Run `python3 tools/faithful.py` (build_songs.py is the old stem arranger; running it would overwrite the faithful songs).
- `python3 tools/build_demo.py` inlines the engine, vibe, palette, and all songs into demo.html (open via file://; `?selftest` runs every song for 3 s and writes the timing results to document.title).
- `python3 tools/render_preview.py <id>` renders previews/<id>.mp3 (40 s, normalized to -4 dBFS, with vibe SFX hits). It mirrors the engine voices: FM depth envelopes, stepped NES volume, LFSR noise, tri4 and the OPL waves.
- Set `platform` (and `faithful`) in songs.config.json. No song is frozen any more.

## 9. Known gaps
- Offline renderer uses naive (aliased) pulses; the browser uses band-limited PeriodicWaves, so timbre differs slightly.
- Swing, slide and `loop:false` are implemented but untested by ear; tempo changes take effect at the next row.
- Envelope de-click ramps 2 ms to zero at each note; fast legato lines may sound slightly detached (by design: punchier).
- (fixed Oct 10 night) Per-note volumes, modulation, PSG envelopes and intros are now reproduced (section 7d).
- Notes are placed on fractional rows; the driver's frame timing is rounded to 1/10000 row. Onset similarity per channel is 0.65-0.85, versus about 0.99 for Keen, mostly from the reference's frame-exact timing and the YM2612 EG timing.
- OPL2 is not chip-exact (a float model with the data-sheet EG times). The reference (pyopl) also aliases, so Keen spectral similarity tops out around 0.89.
- DAC rates come from the SMPSPlay cycle model. The reference uses the same rates, so they are not independently verified.
- Overlapping SFX on the same slot can be cut by the earlier effect's key-off (rare).

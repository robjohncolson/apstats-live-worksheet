#!/usr/bin/env node
// Freeze songs (Ableton sense): render each song ONCE with the real engine (headless Chrome, OfflineAudioContext +
// chip AudioWorklet, exactly as render_offline.js) and write handoff frozen/ assets that the engine can loop:
//   frozen/<id>.ogg            Vorbis q5, 44.1 kHz stereo = [intro][second pass of song.order]
//   frozen/<id>.lowpower.ogg   same with lowPower (only for songs with a non-empty lowPowerOff)
//   frozen/<id>.json           sidecar {id, sampleRate, introSeconds, loopSeconds, renderedFrom, songSha1, lowPower, renderMaster, ...}
// Render = intro + 2 loop passes (+0.5 s); keep [intro][pass 2] so pass 1's release tails are baked into the start
// of the loop. Seam: the last 10 ms of pass 2 are crossfaded into the last 10 ms of pass 1 -- the audio that really
// precedes pass 2's first sample in the render -- so wrapping loopEnd -> loopStart continues exactly as the render did
// The intro's last 10 ms get the same treatment (the loop region starts with pass 2, not pass 1).
// (also carries chip state the trim cannot: LFO/vibrato phase, PSG LFSR, the YM DAC AC-coupling filter).
// Level: the default engine master (0.27) x gainTrim x levels/mix is baked in (same as a live play at default
// volume, ~ -7 dBFS peaks); the engine plays a frozen song through master at volume/renderMaster.
// usage: node tools/offline/freeze.js <id> [--all] [--no-check]
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { execFileSync } = require('child_process');
const puppeteer = require('/workspace/trackertools/node_modules/puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(ROOT, 'frozen'), SR = 44100, PRE = 0.05, XF = Math.round(0.010 * SR);
const ALL = ['park-bounce', 'launchbase', 'icecap', 'mushroomhill', 'keen-wotb'];
function lengths(song) {           // seconds, computed from the song (rows x 60/bpm/rowsPerBeat, per-pattern rows honoured)
  const rd = 60 / song.bpm / song.rowsPerBeat, rows = n => (song.patterns[n].rows || song.rowsPerPattern || 16);
  const sum = L => (L || []).reduce((a, n) => a + rows(n), 0);
  return { rd, introSeconds: sum(song.intro) * rd, loopSeconds: sum(song.order) * rd, introRows: sum(song.intro), loopRows: sum(song.order) };
}
function wavF32(file, x) {         // interleaved stereo float32 WAV
  const h = Buffer.alloc(44), d = Buffer.from(x.buffer, x.byteOffset, x.byteLength);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, d]));
}
const f32 = b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
async function freezeOne(page, id, lowPower) {
  const songFile = path.join(ROOT, 'songs', id + '.json'), raw = fs.readFileSync(songFile), song = JSON.parse(raw), Ln = lengths(song);
  const dur = PRE + Ln.introSeconds + 2 * Ln.loopSeconds + 0.5;
  const r = await page.evaluate((id, dur, o) => window.renderSong(id, dur, o), id, dur, { float: true, lowPower });
  const x = f32(r.f32), fr = s => Math.round(s * SR);
  fs.writeFileSync('/tmp/freeze_full_' + id + (lowPower ? '.lowpower' : '') + '.f32', Buffer.from(x.buffer, x.byteOffset, x.byteLength));   // for freeze_check.py
  const i0 = fr(PRE), nI = fr(Ln.introSeconds), nL = fr(Ln.loopSeconds), p1 = i0 + nI, p2 = p1 + nL;   // pass 1 / pass 2 start frames
  const out = new Float32Array(2 * (nI + nL));
  out.set(x.subarray(2 * i0, 2 * p1), 0); out.set(x.subarray(2 * p2, 2 * (p2 + nL)), 2 * nI);
  const before = Math.max(Math.abs(x[2 * (p2 + nL - 1)] - x[2 * p2]), Math.abs(x[2 * (p2 + nL - 1) + 1] - x[2 * p2 + 1]));
  for (let k = 0; k < XF; k++) {   // equal-gain crossfade pass2-end -> pass1-end over the last XF frames
    const w = (k + 1) / XF, o = 2 * (nI + nL - XF + k), a = 2 * (p2 + nL - XF + k), b = 2 * (p1 + nL - XF + k);
    for (let c = 0; c < 2; c++) out[o + c] = (1 - w) * x[a + c] + w * x[b + c];
  }
  if (nI >= XF) for (let k = 0; k < XF; k++) {   // intro -> loop junction: the loop region starts with pass 2, whose true predecessor is
    const w = (k + 1) / XF, o = 2 * (nI - XF + k), b = 2 * (p2 - XF + k);   // the end of pass 1, so fade the intro's last 10 ms into it
    for (let c = 0; c < 2; c++) out[o + c] = (1 - w) * out[o + c] + w * x[b + c];
  }
  const tag = id + (lowPower ? '.lowpower' : ''), wav = path.join('/tmp', 'freeze_' + tag + '.wav'), ogg = path.join(OUT, tag + '.ogg');
  wavF32(wav, out);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '5', ogg]);
  let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
  return { id, tag, song, raw, Ln, ogg, wav, renderMs: r.renderMs, worklet: r.worklet, peakDb: 20 * Math.log10(pk), seamStepRawDb: 20 * Math.log10(before + 1e-12) };
}
(async () => {
  const a = process.argv.slice(2), ids = a.includes('--all') ? ALL : a.filter(x => !x.startsWith('--'));
  if (!ids.length) { console.error('usage: freeze.js <id> [--all] [--no-check]'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, 'offline.html'));
  const report = [];
  for (const id of ids) {
    const song = JSON.parse(fs.readFileSync(path.join(ROOT, 'songs', id + '.json')));
    const full = await freezeOne(p, id, false);
    const lp = (song.lowPowerOff && song.lowPowerOff.length) ? await freezeOne(p, id, true) : null;
    const side = { id, sampleRate: SR, introSeconds: +full.Ln.introSeconds.toFixed(6), loopSeconds: +full.Ln.loopSeconds.toFixed(6),
      introRows: full.Ln.introRows, loopRows: full.Ln.loopRows, renderedFrom: 'songs/' + id + '.json',
      songSha1: crypto.createHash('sha1').update(full.raw).digest('hex'), lowPower: lp ? id + '.lowpower.ogg' : null,
      renderMaster: 0.27, engineSha1: crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'tracker-engine.js'))).digest('hex'),
      seamCrossfadeMs: 10, codec: 'vorbis q5' };
    fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(side, null, 1) + '\n');
    for (const f of [full, lp].filter(Boolean)) {
      const rep = { file: 'frozen/' + path.basename(f.ogg), bytes: fs.statSync(f.ogg).size, seconds: +(f.Ln.introSeconds + f.Ln.loopSeconds).toFixed(3),
        intro: +f.Ln.introSeconds.toFixed(3), loop: +f.Ln.loopSeconds.toFixed(3), peakDb: +f.peakDb.toFixed(2), renderMs: Math.round(f.renderMs),
        worklet: f.worklet, seamStepWithoutCrossfadeDb: +f.seamStepRawDb.toFixed(1) };
      report.push(rep); console.log(JSON.stringify(rep));
    }
  }
  await b.close();
  if (errs.length) console.log('console errors:', errs);
  if (!a.includes('--no-check')) execFileSync('python3', [path.join(__dirname, 'freeze_check.py'), ...ids], { stdio: 'inherit' });
})().catch(e => { console.error(e); process.exit(1); });

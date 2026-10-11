#!/usr/bin/env node
// usage: node render_offline.js <song-id> <seconds> <out.wav>   |   node render_offline.js --sfx s1:B5,s3k:33,... <out.wav>
// opts: [--lowpower] [--skip-intro] [--no-worklet] [--normalize=-4]
// Renders with the real tracker-engine.js in headless Chrome (OfflineAudioContext); prints JSON stats.
const path = require('path'), fs = require('fs');
const puppeteer = require('/workspace/trackertools/node_modules/puppeteer-core');
(async () => {
  const a = process.argv.slice(2), id = a[0], dur = +a[1], out = a[2];
  const o = { lowPower: a.includes('--lowpower'), skipIntro: a.includes('--skip-intro'), noWorklet: a.includes('--no-worklet') };
  const nz = a.find(x => x.startsWith('--normalize=')); if (nz) o.normalize = +nz.split('=')[1];
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, 'offline.html'));
  let r;
  if (id === '--sfx') { o.normalize = o.normalize || -4; r = await p.evaluate((refs, gap, o) => window.renderSfx(refs, gap, o), a[1].split(','), 0.6, o); }
  else r = await p.evaluate((id, dur, o) => window.renderSong(id, dur, o), id, dur, o);
  const pcm = Buffer.from(r.pcm, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(out, Buffer.concat([h, pcm])); delete r.pcm; r.errors = errs;
  console.log(JSON.stringify(r)); await b.close();
})();

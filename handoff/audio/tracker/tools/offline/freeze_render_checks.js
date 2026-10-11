#!/usr/bin/env node
// helper for freeze_check.py: decodes frozen/*.ogg with Chrome's decodeAudioData, renders the live song (40 s) and the
// frozen song THROUGH THE ENGINE (load(song,{frozen})) across two loop seams (+ low-power toggles), as float32 files in /tmp.
const path = require('path'), fs = require('fs');
const puppeteer = require('/workspace/trackertools/node_modules/puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..');
(async () => {
  const ids = process.argv.slice(2);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, 'offline.html'));
  const save = (f, r) => { fs.writeFileSync(f, Buffer.from(r.f32, 'base64')); delete r.f32; return r; };
  const out = {};
  for (const id of ids) {
    const side = JSON.parse(fs.readFileSync(path.join(ROOT, 'frozen', id + '.json'))), o = out[id] = { side };
    o.decoded = save('/tmp/dec_' + id + '.f32', await p.evaluate(u => window.decodeFile(u), 'file://' + path.join(ROOT, 'frozen', id + '.ogg')));
    if (side.lowPower) o.decodedLp = save('/tmp/dec_' + id + '.lowpower.f32', await p.evaluate(u => window.decodeFile(u), 'file://' + path.join(ROOT, 'frozen', side.lowPower)));
    o.live = save('/tmp/live_' + id + '.f32', await p.evaluate((id) => window.renderSong(id, 40, { float: true }), id));
    const long = 0.05 + side.introSeconds + 2 * side.loopSeconds + 2;
    const tog = side.lowPower ? [[+(0.05 + side.introSeconds + 0.37 * side.loopSeconds).toFixed(3), true], [+(0.05 + side.introSeconds + 0.71 * side.loopSeconds).toFixed(3), false]] : null;
    o.frozen = save('/tmp/fz_' + id + '.f32', await p.evaluate((id, d) => window.renderFrozen(id, d, {}), id, long));
    if (tog) { o.toggles = tog; o.frozenToggle = save('/tmp/fzt_' + id + '.f32', await p.evaluate((id, d, t) => window.renderFrozen(id, d, { toggleAt: t }), id, long, tog)); }
  }
  out.errors = errs; fs.writeFileSync('/tmp/freeze_checks.json', JSON.stringify(out)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });

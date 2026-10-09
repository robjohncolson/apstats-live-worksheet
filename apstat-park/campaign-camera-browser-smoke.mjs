// Camera smoke (batch 17): the Desk canvas shows the whole native band y 0..720/scale from frame 0.
// Native camera never scrolls vertically (projection FUN_7ff72bc1a830 translates y by a literal 0), so 2-3's lower
// rows (the pit under the row-2 floor) must be on the canvas at frame 0. Saves frame-0 shots of 2-3 / 1-1 / 10-3 /
// 12-2 (and 2-3 at a mid frame) to test-results/park-campaign-camera/<PARK_CAMERA_LABEL or after>/.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs; PARK_BROWSER to a Chromium/Chrome.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const root = path.resolve(process.env.PARK_CAMERA_ROOT || process.cwd());
const output = path.resolve('test-results/park-campaign-camera', process.env.PARK_CAMERA_LABEL || 'after');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const file = path.join(root, decodeURI(request.url).split('?')[0]);
    response.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.html') ? 'text/html' : 'text/javascript');
    response.end(await readFile(file));
  } catch { response.end(''); }
});
await new Promise(resolve => server.listen(0, resolve));
const browser = await chromium.launch({ executablePath: process.env.PARK_BROWSER, headless: true });
const shots = [
  { name: '2-3_frame0', stage: 6, frames: 0 },
  { name: '2-3_frame150', stage: 6, frames: 150 },
  { name: '1-1_frame0', stage: 0, frames: 0 },
  { name: '10-3_frame0', stage: 38, frames: 0 },
  { name: '12-2_frame0', stage: 45, frames: 0 },
];
try {
  const page = await browser.newPage({ viewport: { width: 760, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:' + server.address().port + '/');
  await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    window.game = await createCampaignEngine({});
    document.body.style.margin = '0';
    document.body.style.background = '#edf3ee';
    document.body.append(game.canvas);
  });
  const views = {};
  for (const shot of shots) {
    views[shot.name] = await page.evaluate(({ stage, frames }) => {
      game.load(stage, 2, 123);
      // Walk right for the mid-frame shot (bit 2 = right), so the camera has moved.
      for (let frame = 0; frame < frames; frame++) game.step([2, 2]);
      game.render();
      const view = game.getView();
      const ctx = game.canvas.getContext('2d');
      const { scale, y } = view.projection;
      const chip = game.runtime.tileMap.map.chipSize;
      const bandH = 720 / (game.runtime.scrollCameraConfig?.scale || 1);
      // Opaque pixels in the strip of the last native-band chip row (world y bandH - chip .. bandH).
      const top = Math.floor(y + (bandH - chip) * scale), bottom = Math.ceil(y + bandH * scale);
      let opaque = 0;
      if (bottom > 0 && top < game.canvas.height) {
        const strip = ctx.getImageData(0, Math.max(0, top), game.canvas.width, Math.min(game.canvas.height, bottom) - Math.max(0, top));
        for (let i = 3; i < strip.data.length; i += 4) if (strip.data[i] > 0) opaque++;
      }
      return { projection: view.projection, bandH, bandBottomOnCanvas: y + bandH * scale, canvasH: game.canvas.height, opaque };
    }, shot);
    await page.locator('canvas').screenshot({ path: path.join(output, shot.name + '.png') });
  }
  await writeFile(path.join(output, 'views.json'), JSON.stringify(views, null, 2));
  assert.deepEqual(errors, []);
  for (const name of ['2-3_frame0', '2-3_frame150']) {
    const view = views[name];
    assert.ok(view.bandBottomOnCanvas <= view.canvasH, `${name}: the native band bottom (world y ${view.bandH}) is at canvas y ${view.bandBottomOnCanvas} > ${view.canvasH}`);
    assert.ok(view.opaque > 0, `${name}: the bottom chip row of the native band draws nothing on the canvas`);
  }
  console.log('PASS: 2-3 shows the whole native band (bottom row on the canvas) at frame 0 and mid-stage; shots in ' + output);
} finally { await browser.close(); server.close(); }

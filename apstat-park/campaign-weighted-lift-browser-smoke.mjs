// Local-only smoke (teacher 2026-10-07: "please study the behaviour of the other two platforms", 1-4): the real browser
// engine renders the two plain WeightedLifts with the native wide body {x-92, y+67, 194, 18} and sign sprite
// (atlas (351,511,98,42) at {-93, 0, 196, 84}); the sign shows the bodies still needed; two cats on lift A take it
// down 1 unit per tick and the sign reads 0 (recovered patch 'native-weighted-lift').
// Needs Playwright: PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs and PARK_BROWSER to a
// Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-weighted-lift');
mkdirSync(output, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body style="margin:0;background:#f7f5ee"><div id="stage"></div></body></html>');
    return;
  }
  const file = path.resolve(app, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(app + path.sep)) { response.writeHead(403); response.end(); return; }
  response.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); }); stream.pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/');
  const info = await page.evaluate(async () => {
    const recovered = await import('/apstat-park/recovered/runtime.mjs');
    await recovered.loadPicoSpriteAtlas();
    const pixi = new recovered.Application({ width: 1280, height: 720, background: 0xffffff, antialias: false,
      resolution: 1, autoStart: false, preserveDrawingBuffer: true });
    document.getElementById('stage').append(pixi.view);
    const entry = recovered.stages.find(stage => stage.source === 'stage_weight01');
    recovered.setRandomState(1);
    const runtime = new recovered.GameRuntime(() => {}, () => {});
    runtime.loadStage(entry.data, 720, 750, { partySize: 2, simplifyPassivePlaceholders: false });
    pixi.stage.addChild(runtime.root);
    runtime.overlayLayer.visible = false;
    const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, resetPressed: false, prevStagePressed: false, nextStagePressed: false };
    window.view = camX => { runtime.world.scale.set(1.5); runtime.world.x = -camX * 1.5; runtime.world.y = 0; pixi.render(); };
    window.steps = n => { for (let i = 0; i < n; i++) runtime.update(1 / 60, IDLE, [IDLE, IDLE]); };
    const lifts = runtime.weightedLifts.filter(l => l.spawn.actorName === 'WeightedLift');
    window.lifts = lifts; window.cats = runtime.players;
    const sprite = lifts[0].view.children[0];
    window.steps(2);   // the sign's number is set by the lift update (the party size is known then)
    return { rects: lifts.map(l => ({ ...l.rect })), signs: lifts.map(l => l.signText.text),
      sprite: [sprite.texture?.frame?.width === 98 && sprite.texture?.frame?.height === 42, sprite.x, sprite.y, sprite.width, sprite.height] };
  });
  const sample = async (points) => page.evaluate((points) => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return points.map(({ x, y }) => {
      const out = new Uint8Array(4);
      gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return [out[0], out[1], out[2]];
    });
  }, points);
  const toScreen = (x, y, camX) => ({ x: Math.round((x - camX) * 1.5), y: Math.round(y * 1.5) });
  await page.evaluate(() => { window.view(1100); });
  await page.screenshot({ path: path.join(output, '1-4-lift-A-rest.png') });
  // slab centre (1339, 249) and the cream sign box (1339 + 5 - 25, 173 + 12), away from the digit
  const [slab, signBox] = await sample([toScreen(1339 + 40, 249, 1100), toScreen(1339 - 22, 173 + 12, 1100)]);
  const loaded = await page.evaluate(() => {
    const [A] = window.lifts, [a, b] = window.cats;
    const place = (p, x, y) => p.applyResolvedCollision({ ...p.rect, x, y }, { x: 0, y: 0 }, true);
    place(a, A.rect.x + 84, A.rect.y - a.rect.height); place(b, A.rect.x + 84, A.rect.y - a.rect.height - b.rect.height);
    const ys = [];
    for (let i = 0; i < 60; i++) { window.steps(1); ys.push(A.rect.y); }
    window.view(1100);
    return { ys, sign: A.signText.text };
  });
  await page.screenshot({ path: path.join(output, '1-4-lift-A-loaded.png') });
  await page.evaluate(() => window.view(2000));
  await page.screenshot({ path: path.join(output, '1-4-lift-B-rest.png') });
  assert.deepEqual(info.rects, [{ x: 1247, y: 240, width: 194, height: 18 }, { x: 2232, y: 403, width: 194, height: 18 }]);
  assert.deepEqual(info.signs, ['2', '2'], 'two bodies needed on each');
  assert.deepEqual(info.sprite, [true, -93, 0, 196, 84], 'the native sign-and-slab atlas sprite');
  assert.deepEqual(slab, [255, 134, 77], 'the slab is stage orange');
  assert.ok(signBox[0] > 240 && signBox[1] > 240 && signBox[2] > 220, 'the sign box is cream: ' + signBox);
  const deltas = loaded.ys.map((y, i) => y - (i ? loaded.ys[i - 1] : 240)).slice(2);
  assert.ok(deltas.every(d => Math.abs(d - 1) < 1e-9), 'down 1 per tick: ' + [...new Set(deltas)]);
  assert.equal(loaded.sign, '0');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'weighted-lift.json'), JSON.stringify({ info, slab, signBox, loaded }, null, 2));
  console.log('CAMPAIGN WEIGHTED LIFT PASS: 1-4 lifts 194 x 18 at (1247, 240) / (2232, 403), sign 2 -> 0, down 1 per tick with two cats');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}

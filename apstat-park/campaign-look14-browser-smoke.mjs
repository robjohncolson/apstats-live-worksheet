// Local-only smoke (teacher 2026-10-07: "1-4 looks very different from the real PICO PARK 1-4"): renders the real
// browser engine's 1-4 at the original 1.5 scale and samples colours where the retail capture (og-capture-2) shows
// stage orange #ff864d: the row-5 MC_BW* ledge, the UpDownLift slab (native atlas sprite {-60,-10,120,20}) and the
// MoveWall pillar (16 x 190, standing on the ledge). Patches 'native-lift-and-ledge-look' + 'native-movewall'.
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
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-look14');
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
    window.view = camX => { runtime.world.scale.set(1.5); runtime.world.x = -camX * 1.5; runtime.world.y = 0; pixi.render(); };
    const lift = runtime.weightedLifts.find(l => l.spawn.actorName === 'UpDownLift');
    const sprite = lift.view.children[0];
    window.lift = lift; window.wall = runtime.moveWalls[0];
    return { sprite: [!!sprite.texture?.frame && sprite.texture.frame.width === 60 && sprite.texture.frame.height === 10, sprite.x, sprite.y, sprite.width, sprite.height, lift.view.children.length],
      lift: { ...lift.rect }, wall: { ...runtime.moveWalls[0].rect } };
  });
  // Camera x 366 = the retail framing of capture L4 frame 75 (the 118-wide slab centred on 917 at screen 826).
  await page.evaluate(() => window.view(366));
  await page.screenshot({ path: path.join(output, '1-4-lift-and-ledge.png') });
  const toScreen = (x, y, camX) => ({ x: Math.round((x - camX) * 1.5), y: Math.round(y * 1.5) });
  const sample = async (points) => page.evaluate((points) => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return points.map(({ x, y }) => {
      const out = new Uint8Array(4);
      gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return [out[0], out[1], out[2]];
    });
  }, points);
  const liftY = await page.evaluate(() => window.lift.rect.y);
  const [ledge, slab] = await sample([toScreen(1100, 264, 366), toScreen(917, liftY + 9, 366)]);
  await page.evaluate(() => window.view(1100));
  await page.screenshot({ path: path.join(output, '1-4-movewall.png') });
  const [pillar] = await sample([toScreen(1496, 140, 1100)]);
  const ORANGE = [255, 134, 77];
  assert.deepEqual(info.sprite, [true, -60, -10, 120, 20, 1], 'the native 60 x 10 atlas slab at {-60,-10,120,20}, nothing else');
  assert.deepEqual(info.lift, { x: 858, y: 327, width: 118, height: 18 });
  assert.deepEqual(info.wall, { x: 1488, y: 49, width: 16, height: 190 });
  assert.deepEqual(ledge, ORANGE, 'the MC_BW* ledge is stage orange');
  assert.deepEqual(slab, ORANGE, 'the UpDownLift slab is stage orange');
  assert.deepEqual(pillar, ORANGE, 'the MoveWall pillar is stage orange');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'look14.json'), JSON.stringify({ info, ledge, slab, pillar }, null, 2));
  console.log('CAMPAIGN 1-4 LOOK PASS: ledge, UpDownLift slab (118 x 18, atlas sprite) and MoveWall pillar (16 x 190) render #ff864d');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}

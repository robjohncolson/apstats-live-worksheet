// Exercise the bundled collision path against shipped active Thunder auxiliaries.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.end('<!doctype html><body>Contact audit</body>'); return; }
  const file = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    response.setHeader('Content-Type', extname(file) === '.mjs' ? 'text/javascript' : 'image/png');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
  ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const samples = await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine(), samples = [];
    for (const count of [2, 8]) {
      game.load(44, count, 12345);
      const runtime = game.runtime;
      const thunder = runtime.thunders.find(t => t.auxiliaryBodyActive && t.auxiliaryBodyType === 3);
      if (!thunder) throw new Error('Missing shipped active Thunder auxiliary');
      // Isolate the recovered auxiliary from unrelated gates in this contact fixture.
      for (const name of ['gates', 'switchRects', 'staticRects', 'bridges', 'blinkBlocks',
        'trafficLights', 'ballReceivers', 'balances', 'seesaws']) runtime[name] = [];
      runtime.thunders = [thunder];
      const player = runtime.player = runtime.players[0];
      const x = thunder.spawn.x, y = thunder.spawn.y;
      const fixtures = [
        { name: 'left', start: [x - 34, y], next: [x - 30, y], expected: [Math.fround(x - 32 - Math.fround(.01)), y], velocity: [240, 0] },
        { name: 'right', start: [x + 34, y], next: [x + 30, y], expected: [Math.fround(x + 32 + Math.fround(.01)), y], velocity: [-240, 0] },
        { name: 'above', start: [x, y - 17], next: [x, y - 13], expected: [x, Math.fround(y - 15 - Math.fround(.01))], velocity: [0, 240] },
        { name: 'below', start: [x, y + 65], next: [x, y + 61], expected: [x, Math.fround(y + 63 + Math.fround(.01))], velocity: [0, -240] },
        { name: 'resting', start: [x, y - 15], next: [x, y - 14], expected: [x, y - 15], velocity: [0, 60] },
      ];
      for (const fixture of fixtures) {
        player.reset(...fixture.start);
        const previous = { ...player.rect };
        player.reset(...fixture.next);
        player.velocity.x = fixture.velocity[0]; player.velocity.y = fixture.velocity[1];
        runtime.applyClosedGateCollision(previous);
        samples.push({ count, name: fixture.name,
          actual: [player.rect.x + 16, player.rect.y + 47], expected: fixture.expected,
          velocity: { ...player.velocity }, grounded: player.grounded,
          stationary: thunder.spawn.x === x && thunder.spawn.y === y });
      }
      for (const disabled of [runtime.collisionChangePlayersCollisionOff, runtime.activelyGuardingPlayers]) {
        player.reset(x, y - 17);
        const previous = { ...player.rect };
        player.reset(x, y - 13);
        disabled.add(player);
        runtime.applyClosedGateCollision(previous);
        if (player.rect.y + 47 !== y - 13) throw new Error('Disabled or bracing body collided');
        disabled.delete(player);
      }
    }
    game.dispose(); return samples;
  });
  assert.equal(samples.length, 10);
  for (const sample of samples) {
    assert.deepEqual(sample.actual, sample.expected, JSON.stringify(sample));
    assert.deepEqual(sample.velocity, { x: 0, y: 0 }, JSON.stringify(sample));
    assert.equal(sample.grounded, ['above', 'resting'].includes(sample.name), JSON.stringify(sample));
    assert.equal(sample.stationary, true);
  }
  console.log('NATIVE CONTACT PASS: all four directions, resting support, stationary auxiliary, disabled/guard body gates, 2/8 players');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

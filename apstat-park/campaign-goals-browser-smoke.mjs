// Native goal unlock, input edge, key delivery and multiplayer completion contracts.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.end('<!doctype html><body>Sensor audit</body>'); return; }
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
  const result = await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine();
    const place = (player, goal, away = false) => {
      Object.assign(player.rect, { x: goal.rect.x + (away ? -180 : 1), y: goal.rect.y });
      player.velocity.x = 0; player.velocity.y = 0;
    };
    game.load(0, 2, 10);
    let runtime = game.runtime, goal = runtime.goals[0];
    runtime.players.forEach(player => place(player, goal));
    game.step([4, 4]);
    const locked = runtime.goalClearedPlayers.size;
    game.step([0, 0]);
    const key = runtime.keys[0];
    Object.assign(key.rect, goal.rect);
    game.step([0, 0]);
    const delivery = { opened: goal.opened, active: key.active };
    game.step([0, 0]);
    const consumed = !key.active;
    const touching = runtime.goalClearedPlayers.size;
    game.step([4, 0]);
    const firstPress = runtime.players.map(player => runtime.goalClearedPlayers.has(player));
    game.step([4, 0]);
    const held = runtime.goalClearedPlayers.size;
    game.step([4, 4]);
    const teamCleared = game.stats.cleared;
    game.load(0, 2, 10);
    runtime = game.runtime; goal = runtime.goals[0];
    goal.opened = true;
    place(runtime.players[0], goal, true);
    game.step([4, 0]);
    place(runtime.players[0], goal);
    game.step([4, 0]);
    const heldOnArrival = runtime.goalClearedPlayers.size;
    game.step([0, 0]); game.step([4, 0]);
    const freshOnArrival = runtime.goalClearedPlayers.size;
    const breakout = [];
    for (const stage of [29, 31]) {
      game.load(stage, 2, 10);
      runtime = game.runtime;
      const reward = runtime.keys.find(key => key.spawn.actorName === 'BreakoutKey');
      const hidden = !reward.active && !reward.view.visible;
      game.step([0, 0]);
      const stillHidden = !reward.active;
      for (let i = 0; i < runtime.tileMap.map.table.length; i++) {
        if (/^MC_BR[1-5]$/.test(runtime.tileMap.map.table[i])) runtime.tileMap.map.table[i] = 'MC_NON';
      }
      game.step([0, 0]);
      const unlocked = reward.active && reward.view.visible;
      const dimensions = { width: reward.rect.width, height: reward.rect.height };
      const cleared = game.stats.cleared;
      breakout.push({ stage, hidden, stillHidden, unlocked, dimensions, cleared });
    }
    game.dispose();
    return { breakout, locked, delivery, consumed, touching, firstPress, held, teamCleared, heldOnArrival, freshOnArrival };
  });
  for (const sample of result.breakout) {
    assert.deepEqual(sample, { stage: sample.stage, hidden: true, stillHidden: true, unlocked: true,
      dimensions: { width: 32, height: 56 }, cleared: false });
  }
  delete result.breakout;
  assert.deepEqual(result, { locked: 0, delivery: { opened: true, active: true }, consumed: true, touching: 0, firstPress: [true, false], held: 1,
    teamCleared: true, heldOnArrival: 0, freshOnArrival: 1 });
  console.log('CAMPAIGN GOAL INPUT PASS: touch, independent Up edges, held input, arrival and team latch');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

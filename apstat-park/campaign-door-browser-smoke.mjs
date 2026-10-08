import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href);
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<body></body>'); return; }
    res.setHeader('Content-Type', pathname.endsWith('.png') ? 'image/png' : 'text/javascript');
    res.end(await readFile(new URL('..' + pathname, import.meta.url)));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_BROWSER });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    window.game = await createCampaignEngine();
  });
  for (const stage of [0, 1, 2]) {
    const result = await page.evaluate(stage => {
      game.load(stage, 2, 123);
      const r = game.runtime, [a, b] = r.players, goal = r.goals[0], key = r.keys[0];
      const initialTexture = goal.view.children[0].texture;
      // goal-enter-native: entry needs this tick's UP press edge (the step loop sets goalUpPressed per cat).
      const checkGoals = (up) => { r.goalUpPressed = up; r.checkGoals({ up }); r.goalUpPressed = false; };
      r.player = a; r.carryKeyForPlayer(key, a, 0); checkGoals(true);
      const remotePickup = goal.opened;
      Object.assign(b.rect, { x: goal.rect.x, y: goal.rect.y });
      r.player = b; checkGoals(true);
      const noKey = goal.opened;
      Object.assign(a.rect, { x: goal.rect.x, y: goal.rect.y });
      r.player = a; checkGoals(false);
      const noUp = goal.opened;
      checkGoals(true);
      const delivered = { opened: goal.opened, consumed: !key.active, entered: r.goalClearedPlayers.size,
        changedArt: initialTexture !== goal.view.children[0].texture };
      r.player = b; checkGoals(false);
      const stillWaiting = !game.stats.cleared;
      checkGoals(true);
      return { remotePickup, noKey, noUp, delivered, stillWaiting, cleared: game.stats.cleared };
    }, stage);
    assert.deepEqual(result, { remotePickup: false, noKey: false, noUp: false,
      delivered: { opened: true, consumed: true, entered: 1, changedArt: true }, stillWaiting: true, cleared: true });
  }
  const switches = await page.evaluate(() => {
    game.load(2, 2, 123);
    const r = game.runtime, a = r.players[0], bridgePad = r.switches.find(pad => pad.spawn.label === 'Bridge');
    r.player = a;
    const place = pad => { a.rect.x = pad.rect.x; a.rect.y = pad.rect.y - a.rect.height + 4; };
    const leave = () => { a.rect.x = 200; a.rect.y = 100; r.players[1].rect.x = 250; r.players[1].rect.y = 100; };
    place(bridgePad); r.pressSwitches();
    const pressed = bridgePad.pressed;
    leave(); r.pressSwitches();
    const stays = bridgePad.pressed && r.bridges.every(bridge => !bridge.opened);
    const pressurePad = r.switches.find(pad => pad.params.forceClearPressed);
    place(pressurePad); r.pressSwitches(); const pressureOn = pressurePad.pressed;
    leave(); r.pressSwitches(); const pressureOff = !pressurePad.pressed;
    game.load(2, 2, 123);
    return { pressed, stays, pressureOn, pressureOff,
      reset: !game.runtime.switches.find(pad => pad.spawn.label === 'Bridge').pressed };
  });
  assert.deepEqual(switches, { pressed: true, stays: true, pressureOn: true, pressureOff: true, reset: true });
  assert.deepEqual(errors, []);
  console.log('Campaign door/bridge browser PASS: 1-1/1-2/1-3 require delivered key and UP; bridge persists, pressure pads release, retry resets');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }

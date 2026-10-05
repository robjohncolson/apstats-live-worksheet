// Real WebRTC + relay sockets in 31 browser pages, without 31 copies of the game renderer.
// Uses the same PARK_PLAYWRIGHT_MODULE, PARK_BROWSER and PARK_RELAY_ROOT as the shared-presence smoke.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';
const root = process.env.PARK_RELAY_ROOT || fileURLToPath(new URL('../../curriculum_render/', import.meta.url));
const { createClassroomRegistry } = await import(pathToFileURL(path.join(root, 'railway-server/classroom.js')));
const { createParkService } = await import(pathToFileURL(path.join(root, 'railway-server/apstat-park/service.mjs')));
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');
const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const registry = createClassroomRegistry(), errors = [];
const service = createParkService({ registry, calculatorOptions: { available: () => [] },
  send: (ws, message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); } });
const script = readFileSync(new URL('./peer-motion.mjs', import.meta.url));
const server = createServer((req, res) => {
  if (req.url === '/peer-motion.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>Class RTC test</title><script type="module">
    import { createPeerMotion } from '/peer-motion.mjs';
    const params = new URL(location.href).searchParams, id = +params.get('id');
    const name = id === 0 ? 'teacher' : 'student-' + id;
    const ws = new WebSocket(location.origin.replace('http', 'ws'));
    window.connections = [];
    class Peer extends RTCPeerConnection { constructor(options) { super(options); connections.push(this); } }
    window.motion = createPeerMotion({ name, PeerConnection: Peer,
      signal: message => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'calculator_rtc_signal', ...message })) });
    window.lobby = null; window.pose = { x: 65 + id * 7, y: 676 };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'classroom_join', username: name,
      section: id === 0 ? 'PeriodX' : id % 2 ? 'PeriodB' : 'PeriodE', role: id === 0 ? 'teacher' : 'student' }));
    ws.onmessage = event => {
      const packet = JSON.parse(event.data);
      if (packet.type === 'calculator_lobby_state') { lobby = packet; motion.sync(packet.epoch, packet.rtcPeers); }
      if (packet.type === 'calculator_rtc_signal') motion.receive(packet);
    };
    const presence = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'calculator_lobby', protocol: ${CALCULATOR_PROTOCOL},
        rtc: 2, rtcGeneration: motion.connectionGeneration(), pose, epoch: lobby?.epoch }));
    }, 100);
    const movement = setInterval(() => motion.publish(pose), 50);
    window.stop = () => { clearInterval(presence); clearInterval(movement); motion.dispose(); ws.close(); };
  </script>`);
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  ws.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.type === 'classroom_join') registry.join(ws, message.section, message.username, message.role, Date.now());
    else if (service.accepts(message)) {
      const result = service.handle(ws, message);
      if (result) ws.send(JSON.stringify(result));
    }
  });
  ws.on('close', () => { service.detached(ws); registry.detach(ws, Date.now()); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
try {
  const context = await browser.newContext(), pages = [];
  for (let i = 0; i <= 30; i++) {
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/?id=' + i);
    await page.waitForFunction(() => window.lobby);
  }
  console.log('31 browser pages joined; waiting for all 30 students to receive each other through the teacher');
  try {
    await pages[0].waitForFunction(() => motion.stats().connected === 30 && motion.stats().fresh === 30, null, { timeout: 60000 });
  } catch (error) {
    console.log('Connection diagnostics:', await Promise.all(pages.map(page => page.evaluate(() => ({
      stats: motion.stats(), states: connections.map(peer => peer.connectionState) })) )).then(value => JSON.stringify(value)));
    throw error;
  }
  for (const page of pages.slice(1)) await page.waitForFunction(() =>
    motion.stats().connected === 1 && motion.stats().fresh === 30, null, { timeout: 30000 });
  const initial = await Promise.all(pages.map(page => page.evaluate(() => motion.stats())));
  assert.equal(initial.reduce((sum, item) => sum + item.connected, 0), 60, '30 total links, counted at each endpoint');
  console.log('Class connected:', { students: 30, teachers: 1, links: 30, hub: initial[0] });

  // A student behind a blocked/disconnected RTC path still receives server positions.
  await pages[30].evaluate(() => { for (const connection of connections) connection.close(); pose.x = 600; });
  await pages[1].waitForFunction(() => lobby.members.find(member => member.name === 'student-30')?.pose.x === 600);
  await pages[30].waitForFunction(() => motion.stats().fresh === 0 && motion.stats().connected === 0);
  console.log('Forced peer failure retained server membership and movement');

  // Leaving the room removes the teacher hub. Students reconnect through the elected student.
  await pages[0].evaluate(() => stop());
  await pages[1].waitForFunction(() => motion.stats().hub && motion.stats().connected === 29
    && motion.stats().fresh === 29, null, { timeout: 60000 });
  for (const page of pages.slice(2)) await page.waitForFunction(() =>
    motion.stats().connected === 1 && motion.stats().fresh === 29, null, { timeout: 30000 });
  assert.deepEqual(errors, []);
  console.log('Teacher departure elected a student hub and restored all 30 students, including the previously failed peer');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  wss.close(); server.close();
}

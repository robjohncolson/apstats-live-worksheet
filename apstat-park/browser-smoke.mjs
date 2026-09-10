// Local-only integration smoke. Needs Playwright and the sibling relay checkout.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClassroomRegistry } from '../../curriculum_render/railway-server/classroom.js';
import { createParkService } from '../../curriculum_render/railway-server/apstat-park/service.mjs';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/apstat-park');
mkdirSync(output, { recursive: true });
const registry = createClassroomRegistry(), sockets = new Map(), errors = [], packets = [];
let hour = 0, timeOffset = 0;
const send = (ws, message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
const service = createParkService({ registry, wallNow: () => hour * 3600000,
  now: () => performance.now() + timeOffset, send });
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#edf3ee;font:16px system-ui"><main style="max-width:640px;margin:20px auto">
<h1>AP Statistics calendar</h1><div id="board"></div><p id="calendar">Today's lesson stays here.</p></main>
<script src="/canvas_engine.js"></script><script src="/sprite_sheet.js"></script><script src="/classroom-board.js"></script>
<script>const params=new URL(location.href).searchParams;window.board=ClassroomBoard.mount(document.querySelector('#board'),{
wsUrl:location.origin.replace('http','ws'),section:params.get('section')||'B',username:params.get('user'),hue:90,role:params.get('role')||'student'});</script></body></html>`);
    return;
  }
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const file = path.resolve(app, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(app + path.sep)) { response.writeHead(403); response.end(); return; }
  response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); }); stream.pipe(response);
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  ws.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.type === 'classroom_join') {
      registry.join(ws, message.section, message.username, message.role, Date.now(), message.hue);
      sockets.set(ws, message);
      for (const [socket, who] of sockets) send(socket, registry.stateFor(who.section, who.role, who.username));
    } else if (service.accepts(message)) {
      packets.push({ name: sockets.get(ws)?.username, ...message });
      const result = service.handle(ws, message); if (result) send(ws, result);
    }
  });
  ws.on('close', () => { sockets.delete(ws); service.detached(ws); registry.detach(ws, Date.now()); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });

async function open(name, section = 'B', width = 800, levelIndex = 0) {
  const page = await browser.newPage({ viewport: { width, height: 700 } });
  page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER:', error.message); });
  await page.goto(`${origin}/?user=${name}&section=${section}`);
  await page.waitForFunction(() => window.board?.getSpritePosition?.(new URL(location.href).searchParams.get('user')));
  await page.evaluate(() => { window.originalCanvas = board.getCanvas(); window.originalCanvasCount = document.querySelectorAll("canvas").length; });
  await page.getByRole('button', { name: 'Enter APStat Park', exact: true }).click();
  await choose(page, levelIndex);
  return page;
}
async function choose(page, index = 0) {
  await page.waitForFunction(() => board.getParkScene()?.getGame()?.getWorld().lobby);
  await move(page, [240,460,680][index]);
  await page.keyboard.press('ArrowUp', {delay:80});
  await page.waitForFunction(index => board.getParkScene()?.getGame()?.getWorld().level?.index === index, index);
}
async function calendarExit(page) {
  await move(page,43); await page.keyboard.press('ArrowUp',{delay:80});
  await page.waitForFunction(()=>!board.getParkScene());
}
async function position(page) { return page.evaluate(() => {
  const p = board.getParkScene().getGame().getWorld().player;
  return {x:p.x,y:p.y,vy:p.vy,state:p.state};
}); }
async function move(page, x, jump = false) {
  const from = (await position(page)).x;
  const direction = x > from ? 'ArrowRight' : 'ArrowLeft';
  await page.bringToFront();
  if (jump) await page.keyboard.down('Space');
  await page.keyboard.down(direction);
  try {
    await page.waitForFunction(({ x, right }) => {
      const p = board.getParkScene().getGame().getWorld().player;
      return right ? p.x >= x : p.x <= x;
    }, { x, right: x > from }, { timeout: 6500, polling: 'raf' });
  } catch (error) { console.error('MOVE FAILED', x, await position(page)); throw error; }
  finally {
    await page.keyboard.up(direction);
    if (jump) {
      await page.keyboard.up('Space');
      await page.waitForFunction(()=>!board.getParkScene().getGame().getWorld().player._jumpHandled);
    }
    await page.waitForTimeout(50);
  }
}
async function waitY(page,y) { try { await page.waitForFunction(y=>Math.abs(board.getParkScene().getGame().getWorld().player.y-y)<1,y,{timeout:12000}); } catch(e) {console.error('HEIGHT FAILED',y,await position(page),await page.evaluate(()=>board.getParkScene().getGame().getWorld().lift)); throw e;} }
async function progress(page, field) { await page.waitForFunction(field=>!!board.getParkScene().replica.state.progress[field],field); }
try {
  const alice = await open('alice'), bob = await open('bob');
  for (const page of [alice,bob]) {
    assert.equal(await page.locator('canvas').count(),await page.evaluate(()=>originalCanvasCount));
    assert.equal(await page.evaluate(()=>board.getCanvas()===originalCanvas),true);
    assert.equal(await page.locator('[data-park-scene]').count(),0);
    assert.equal(await page.getByRole('button',{name:/Left|Right|Jump|Help|Exit to calendar/}).count(),0);
  }
  await alice.waitForTimeout(1000);
  const idleStart=packets.filter(p=>p.type==='park_motion').length;
  await alice.waitForTimeout(1200);
  assert.equal(packets.filter(p=>p.type==='park_motion').length,idleStart,'stationary peers send no movement');
  await alice.screenshot({path:path.join(output,'board-scene-entry.png')});
  await move(bob,279);
  // Let the stationary head anchor reach Alice before attempting the boost.
  await alice.waitForFunction(()=>{
    const p=board.getParkScene().getGame().getWorld().peers.bob;
    return p && Math.abs(p.x-279)<5 && p.y===146;
  });
  await move(alice,240);
  await move(alice,278,true); await waitY(alice,122);
  console.log('STACK',await position(alice));
  await move(alice,340,true); await waitY(alice,82);
  await move(alice,377); await move(alice,490,true); await move(alice,505);
  await progress(alice,'bridgeOpen'); await progress(bob,'bridgeOpen');
  console.log('BRIDGE');
  const late=await open('late');
  assert.equal(await late.evaluate(()=>board.getParkScene().replica.state.progress.bridgeOpen),true);
  await late.close();
  await move(alice,670); await progress(alice,'keyHolder');
  console.log('KEY');
  for(const [ws,who] of sockets) if(who.username==='alice') ws.terminate();
  await bob.waitForFunction(()=>board.getParkScene().replica.state.progress.keyHolder===null);
  await move(alice,720); // local movement continues while the socket recovers
  await alice.waitForFunction(()=>!board.getParkScene().replica.needsResume && !document.querySelector('[data-park-status]').textContent.includes('Reconnect'),null,{timeout:20000});
  await move(alice,670); await progress(alice,'keyHolder');
  assert.equal(await alice.evaluate(()=>board.getParkScene().replica.state.progress.bridgeOpen),true);
  // Bob follows using the newly lowered step.
  await move(bob,236); await move(bob,278,true); await waitY(bob,114);
  await move(bob,340,true); await waitY(bob,82); await move(bob,620);
  await move(alice,785); await waitY(alice,40); await move(alice,905);
  await progress(alice,'doorOpen'); await alice.keyboard.press('ArrowUp', {delay:80});
  await alice.waitForFunction(()=>board.getParkScene().replica.state.progress.arrived.includes('alice'));
  console.log('ALICE ARRIVED');
  await move(bob,785); await waitY(bob,40); await move(bob,905); await bob.keyboard.press('ArrowUp', {delay:80});
  await progress(alice,'complete'); await progress(bob,'complete');
  await alice.screenshot({path:path.join(output,'board-scene-complete.png')});
  await alice.keyboard.press('ArrowUp', {delay:80});
  await alice.waitForFunction(()=>board.getParkScene()?.getGame()?.getWorld().lobby);
  await calendarExit(alice);
  assert.equal(await alice.evaluate(()=>board.getCanvas()===originalCanvas),true);

  // A second period has independent progress, including on a narrow screen.
  const mobile = await open('mobile','E',360);
  assert.equal(await mobile.evaluate(()=>board.getParkScene().replica.state.progress.bridgeOpen),false);
  assert.equal(await mobile.evaluate(()=>board.getCanvas()===originalCanvas),true);
  await mobile.screenshot({path:path.join(output,'board-scene-mobile.png')});
  // Return through the physical doorway while Up repeats for longer than the cooldown.
  await move(mobile,43);
  await mobile.keyboard.down('ArrowUp');
  await mobile.waitForFunction(()=>!board.getParkScene());
  for (let i=0;i<4;i++) { await mobile.waitForTimeout(350); await mobile.keyboard.down('ArrowUp'); }
  assert.equal(await mobile.evaluate(()=>board.getParkScene()),null);
  await mobile.keyboard.up('ArrowUp');
  // The actual room substrate must recall students for every classroom activity.
  for (const call of [
    {poll:{id:'recall',question:'Ready?',options:[{id:'yes',label:'Yes'}],blind:true}},
    {gate:{armed:true,theme:'test'}}, {greenlight:{at:Date.now()}},
    {doorways:{id:'recall',options:[{id:'one',label:'One'}]}},
    {activity:{id:'recall',type:'test',finished:false,state:{}}}
  ]) {
    await mobile.getByRole('button',{name:'Enter APStat Park',exact:true}).click();
    await choose(mobile);
    for (const [ws,who] of sockets) if(who.username==='mobile') send(ws,call.greenlight ? {type:'classroom_greenlight'} : {...registry.stateFor('E','student','mobile'),...call});
    await mobile.waitForFunction(()=>!board.getParkScene());
    console.log('RECALL',Object.keys(call)[0]);
    await mobile.evaluate(()=>board.openNativeGameplay());
    assert.equal(await mobile.evaluate(()=>board.getParkScene()),null);
    for (const [ws,who] of sockets) if(who.username==='mobile') send(ws,registry.stateFor('E','student','mobile'));
    await mobile.waitForTimeout(80);
  }
  // Explicit entry replays; reconnecting that new attempt must preserve it.
  await alice.getByRole('button',{name:'Enter APStat Park',exact:true}).click();
  await choose(alice);
  assert.equal(await alice.evaluate(()=>board.getParkScene().replica.state.progress.arrived.includes('alice')),false);
  const replayId = await alice.evaluate(()=>board.getParkScene().replica.state.level.id);
  assert.match(replayId,/attempt-/);
  assert.ok((await position(alice)).x < 200);
  const oldEpoch = await alice.evaluate(()=>board.getParkScene().replica.state.epoch);
  for (const [ws,who] of sockets) if(who.username==='alice') ws.terminate();
  await alice.waitForFunction(()=>board.getParkScene().replica.needsResume || document.querySelector('[data-park-status]').textContent.includes('Reconnect'));
  await alice.waitForFunction(()=>!board.getParkScene().replica.needsResume && !document.querySelector('[data-park-status]').textContent.includes('Reconnect'),null,{timeout:20000});
  assert.equal(await alice.evaluate(()=>board.getParkScene().replica.state.epoch),oldEpoch);
  assert.equal(await alice.evaluate(()=>board.getParkScene().replica.state.level.id),replayId);
  await calendarExit(alice);

  // Both new layouts are completed through the real keyboard and physics.
  for (const index of [1,2]) {
    const page = await open('solver'+index, 'new'+index, 800, index);
    await move(page,150); await move(page,210,true); await waitY(page,110);
    if(index===1) {
      await move(page,250); await move(page,320,true); await waitY(page,74);
      await progress(page,'bridgeOpen');
      await move(page,375); await move(page,490,true); await move(page,670);
      await progress(page,'keyHolder'); await move(page,695); await move(page,785,true); await waitY(page,40); await move(page,905);
    } else {
      await progress(page,'bridgeOpen');
      await move(page,430); await waitY(page,40);
      await move(page,530,true); await waitY(page,40);
      await move(page,635); await progress(page,'keyHolder');
      await move(page,655); await move(page,715,true); await waitY(page,76);
      await move(page,770); await move(page,850,true); await waitY(page,40); await move(page,905);
    }
    await progress(page,'doorOpen'); await page.keyboard.press('ArrowUp',{delay:80}); await progress(page,'complete');
    await page.screenshot({path:path.join(output,'level-'+index+'-complete.png')});
    await page.keyboard.press('ArrowUp',{delay:80});
    await page.waitForFunction(()=>board.getParkScene().getGame().getWorld().lobby);
    assert.ok(await page.evaluate(index=>JSON.parse(localStorage.getItem('apstat-park-completed:solver'+index)).includes(index),index));
    await choose(page,index);
    assert.equal(await page.evaluate(()=>board.getParkScene().replica.state.progress.doorOpen),false);
    await calendarExit(page); await page.close();
  }
  // Load the real calendar at Chromebook height, blocking production traffic.
  const calendar = await browser.newPage({ viewport: { width:1100,height:650 } });
  const calendarErrors=[];
  calendar.on('pageerror',e=>calendarErrors.push(e.message));
  await calendar.route('**/*', route => route.request().url().startsWith(origin+'/') ? route.continue() : route.abort());
  await calendar.addInitScript(origin=>{
    localStorage.setItem('apstats_roster.v1',JSON.stringify({studentId:'local-smoke',username:'calendar_test',realName:'Local Test',section:'F',role:'student',spriteHue:90}));
    Object.defineProperty(window,'RAILWAY_SERVER_URL',{get:()=>origin,set(){}});
    const Socket=window.WebSocket;
    window.WebSocket=class extends Socket {constructor(url,protocols){super(origin.replace('http','ws'),protocols);}};
  },origin);
  await calendar.goto(origin+'/ap_stats_roadmap_square_mode.html',{waitUntil:'domcontentloaded'});
  await calendar.waitForFunction(()=>!!window._classroomBoardHandle);
  await calendar.evaluate(()=>{window.board=_classroomBoardHandle;window.originalCanvas=board.getCanvas();});
  const before=await calendar.evaluate(()=>{const c=board.getCanvas();const r=c.getBoundingClientRect();return {width:r.width,height:r.height,background:getComputedStyle(c.parentElement).backgroundColor};});
  await calendar.screenshot({path:path.join(output,'actual-calendar-before.png')});
  await calendar.getByRole('button',{name:'Enter APStat Park',exact:true}).click();
  await choose(calendar);
  const after=await calendar.evaluate(()=>{const c=board.getCanvas();const r=c.getBoundingClientRect();return {width:r.width,height:r.height,background:getComputedStyle(c.parentElement).backgroundColor};});
  assert.deepEqual(after,before);
  assert.equal(await calendar.evaluate(()=>board.getCanvas()===originalCanvas),true);
  await move(calendar,150);
  await calendar.screenshot({path:path.join(output,'actual-calendar-park.png')});
  await move(calendar,43); await calendar.keyboard.press('ArrowUp',{delay:80});
  await calendar.waitForFunction(()=>!board.getParkScene());
  assert.ok(!calendarErrors.some(e=>/park|world|replica|scene|PlayerSprite/i.test(e)),JSON.stringify(calendarErrors));
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(output,'board-scene-result.json'),JSON.stringify({passed:true,sameCanvas:true,idleSilent:true,lateJoin:true,midLevelDisconnect:true,keyboardLevelCompleted:true,newLevelsCompleted:2,replayAtSpawn:true,completionStored:true,periodIsolation:true,teacherRecall:5,heldUpReturn:true,reconnect:true,actualCalendarAt650px:true,errors,calendarErrors,packets:packets.length},null,2));
  console.log('BOARD SCENE PASS',packets.length,'packets');
} finally {
  await browser.close(); service.close(); for(const ws of wss.clients) ws.terminate(); await new Promise(resolve=>wss.close(resolve)); await new Promise(resolve=>server.close(resolve));
}

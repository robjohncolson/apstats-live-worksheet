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
  await choose(page, levelIndex);
  await page.evaluate(()=>{
    window.parkFailures=[];const r=board.getParkScene().replica,queue=r.queue;
    r.queue=function(kind,...args){if(kind==='retry'){const w=board.getParkScene().getGame().getWorld();parkFailures.push({x:w.player.x,y:w.player.y,holds:r.state.progress.holds,gates:r.state.progress.gates,online:r.state.online});}return queue.call(this,kind,...args);};
  });
  return page;
}
async function choose(page, index = 6) {
  // The calendar's one door opens level 6; no lobby. Levels 0-5 have no door and are opened
  // through the test-only board hook.
  if (index === 6) await page.getByRole('button', { name: 'Enter APStat Park: Jump together' }).click();
  else await page.evaluate(index => board.openParkLevel(index), index);
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
  if (jump) await page.keyboard.down('Space');
  await page.keyboard.down(direction);
  try {
    await page.waitForFunction(({ x, right }) => {
      const p = board.getParkScene().getGame().getWorld().player;
      return right ? p.x >= x : p.x <= x;
    }, { x, right: x > from }, { timeout: 16000, polling: 'raf' });
  } catch (error) { console.error('MOVE FAILED', x, await position(page), await page.evaluate(()=>({failures:window.parkFailures,state:board.getParkScene().replica.state?.progress}))); await page.screenshot({path:path.join(output,'failure.png')}); throw error; }
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
async function arrive(page) {
  await progress(page,'doorOpen');await page.keyboard.press('ArrowUp',{delay:80});
  await page.waitForFunction(()=>board.getParkScene().replica.state.progress.arrived.includes(new URL(location.href).searchParams.get('user')));
}
async function gate(page,id) {await page.waitForFunction(id=>board.getParkScene().replica.state.progress.gates.includes(id),id);}

// ---- Level 6 (PICO PARK 1-1, physics 'pico'): positions are board sprites (pose = sprite + (2,1)). ----
const shots=process.env.PARK_SHOTS||output;mkdirSync(shots,{recursive:true});
async function grounded(page){await page.waitForFunction(()=>board.getParkScene().getGame().getWorld().player._airFrames===0,null,{timeout:8000});}
async function onLift(page){await page.waitForFunction(()=>{const w=board.getParkScene().getGame().getWorld(),p=w.player;return p._airFrames===0&&Math.abs(p.y+24-w.lift.y)<0.6;},null,{timeout:8000});}
async function liftAt(page,surface){await page.waitForFunction(s=>Math.abs(board.getParkScene().getGame().getWorld().lift.y-s)<0.05,surface,{timeout:12000});}
async function upTheStairs(p){
  await move(p,410);await move(p,480,true);await grounded(p);await waitY(p,192);   // over pit 1
  await move(p,600);await move(p,652,true);await waitY(p,168);                     // step A (blocked by B's side)
  await move(p,700,true);await waitY(p,144);                                       // step B
}
// From the raised lift's left end: a short hop left through the published key box.
async function hopKey(p){
  await p.keyboard.down('ArrowLeft');await p.keyboard.down('Space');await p.waitForTimeout(40);await p.keyboard.up('Space');
  await p.waitForFunction(()=>{const w=board.getParkScene().getGame().getWorld();return w.player.x<=1168||w.player._airFrames===0&&w.player.x<1200;},null,{timeout:5000,polling:'raf'});
  await p.keyboard.up('ArrowLeft');await grounded(p);
  await p.waitForFunction(()=>board.getParkScene().replica.state.progress.keyHolder,null,{timeout:5000});
}
async function enterDoor(p){
  await progress(p,'doorOpen');await p.waitForTimeout(100);
  await p.keyboard.down('ArrowUp');   // a fresh press, held until the relay confirms the arrival
  await p.waitForFunction(()=>board.getParkScene().replica.state.progress.arrived.includes(new URL(location.href).searchParams.get('user')));
  await p.keyboard.up('ArrowUp');
  await p.waitForFunction(()=>board.getParkScene().getGame().getWorld().player._hidden===true);   // inside the door: not drawn
}
async function soloLevel6(a){
  await upTheStairs(a);
  await move(a,800);await waitY(a,192);                       // off step B onto the party-of-one bridge
  await move(a,950);await a.waitForFunction(()=>board.getParkScene().replica.state.progress.latches?.bridge!=null);
  await move(a,1180);await move(a,1240,true);await onLift(a);await waitY(a,107.5-24);
  await move(a,1206);await hopKey(a);
  if(Math.abs((await position(a)).y-192)<1){await liftAt(a,201.5);await move(a,1180);await move(a,1240,true);await onLift(a);await waitY(a,107.5-24);}
  await move(a,1296);await move(a,1330,true);await waitY(a,72);   // held jump: lift top is 11.5 below the ledge
  await move(a,1425);await enterDoor(a);await progress(a,'complete');
}
async function duoLevel6(a,b){
  // b (carrier) waits at the right end of step B; a jumps onto its head and steps to its right side.
  await upTheStairs(b);await move(b,762);await b.waitForTimeout(1200);
  await upTheStairs(a);await a.waitForTimeout(800);
  await move(a,735);await move(a,758,true);await waitY(a,120);await move(a,776);
  assert.equal(await a.evaluate(()=>!!board.getParkScene().getGame().getWorld().player.standingOn),true,'stacked on the carrier');
  await a.waitForTimeout(600);await a.screenshot({path:path.join(shots,'level6-stack.png')});
  // The carrier walks off the stair; the rider launches from its head as it goes.
  await b.keyboard.down('ArrowRight');
  await a.waitForFunction(()=>Object.values(board.getParkScene().getGame().getWorld().peers)[0].x>762.5,null,{timeout:5000,polling:'raf'});
  await a.keyboard.down('Space');await a.keyboard.down('ArrowRight');
  await b.waitForFunction(()=>board.getParkScene().getGame().getWorld().player.y>160,null,{timeout:5000,polling:'raf'});await b.keyboard.up('ArrowRight');
  await a.waitForFunction(()=>{const p=board.getParkScene().getGame().getWorld().player;return p._airFrames===0&&p.y>150;},null,{timeout:8000,polling:'raf'});
  await a.keyboard.up('ArrowRight');await a.keyboard.up('Space');
  const landed=await position(a);
  assert.ok(Math.abs(landed.y-192)<1&&landed.x+18>856,'rider on the resting bridge '+JSON.stringify(landed));
  // (3b) Pit 2: the carrier is caught and drops back onto step B (a party of two keeps both stairs).
  await b.waitForFunction(()=>{const p=board.getParkScene().getGame().getWorld().player;return p._airFrames===0&&Math.abs(p.y-144)<0.5&&p.x<768;},null,{timeout:8000});
  assert.equal((await position(b)).x,688-2,'caught over pit 2 and respawned at its near-side spot');
  await move(a,950);await gate(a,'bridge');
  await b.waitForFunction(()=>board.getParkScene().getGame().getWorld().pico.bridgeLeft===746,null,{timeout:8000});
  await a.screenshot({path:path.join(shots,'level6-bridge.png')});
  await move(b,800);await waitY(b,192);                       // across the extended bridge
  await move(a,1180);await move(a,1240,true);await onLift(a);
  await a.waitForTimeout(400);
  assert.equal(await a.evaluate(()=>board.getParkScene().getGame().getWorld().lift.y),201.5,'one rider of two: the lift waits');
  await a.screenshot({path:path.join(shots,'level6-lift-1.png')});
  await move(b,1180);await move(b,1222,true);await onLift(b);
  await waitY(a,105.5-24);await waitY(b,105.5-24);
  await b.screenshot({path:path.join(shots,'level6-lift-up.png')});
  await move(b,1206);await hopKey(b);                         // the cat at the left end takes the key
  if(Math.abs((await position(b)).y-192)<1){
    await liftAt(b,201.5);await move(b,1180);await move(b,1222,true);await onLift(b);await waitY(b,105.5-24);
  }
  await move(a,1296);await a.waitForTimeout(700);await move(b,1272);await b.waitForTimeout(700);
  await Promise.all([move(a,1440,true),(async()=>{await b.waitForTimeout(60);await move(b,1330,true);})()]);
  await waitY(a,72);await waitY(b,72);
  await b.waitForTimeout(600);await move(b,1422);
  await progress(a,'doorOpen');await progress(b,'doorOpen');
  await b.waitForTimeout(300);await b.screenshot({path:path.join(shots,'level6-door.png')});
  await enterDoor(a);
  assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.progress.complete),false);
  await enterDoor(b);
  await progress(a,'complete');await progress(b,'complete');
  for(const page of [a,b])await page.waitForFunction(()=>/Together!/.test(document.querySelector('[data-park-status]').textContent));
}
async function level6(){
  // (1) Solo completion by keyboard.
  const solo=await open('sol6','L6a',800,6);
  assert.equal(await solo.evaluate(()=>board.getParkScene().replica.state.running),true,'one student is enough');
  assert.equal(await solo.evaluate(()=>board.getCanvas().getBoundingClientRect().height),240);
  await solo.waitForTimeout(300);
  const statusBottom=await solo.evaluate(()=>{const s=document.querySelector('[data-park-status]').getBoundingClientRect(),c=board.getCanvas().getBoundingClientRect();return s.bottom-c.top;});
  assert.ok(statusBottom<=216,'the status line stays above the floor row ('+statusBottom+')');
  assert.doesNotMatch(await solo.evaluate(()=>document.querySelector('[data-park-status]').textContent),/friend/i);
  const start=await position(solo);assert.deepEqual([start.x+2,start.y+1],[48,193],'spawn slot 0');
  await solo.screenshot({path:path.join(shots,'level6-start.png')});
  // (3a) Pit 1: walk off the lip, caught, back above the near side.
  await solo.keyboard.down('ArrowRight');
  await solo.waitForFunction(()=>board.getParkScene().getGame().getWorld().player.y>200,null,{timeout:8000,polling:'raf'});
  await solo.keyboard.up('ArrowRight');
  await solo.waitForFunction(()=>{const p=board.getParkScene().getGame().getWorld().player;return p._airFrames===0&&p.y===192;},null,{timeout:8000});
  assert.equal((await position(solo)).x,352-2,'pit 1 respawn before the pit');
  await soloLevel6(solo);
  console.log('LEVEL 6 SOLO PASS');
  // The board samples keys once per frame: leave a few frames between releasing Up (door entry)
  // and pressing it again, and hold it until the scene closes.
  await solo.waitForTimeout(150);
  await solo.keyboard.down('ArrowUp');await solo.waitForFunction(()=>!board.getParkScene());await solo.keyboard.up('ArrowUp');
  assert.equal(await solo.evaluate(()=>board.getCanvas().getBoundingClientRect().height),220);
  await solo.close();
  // (2) Two students, the real way (includes 3b, pit 2).
  const a=await open('ann6','L6b',800,6),b=await open('ben6','L6b',800,6);
  await duoLevel6(a,b);
  console.log('LEVEL 6 DUO PASS');
  await a.close();await b.close();
  // (4) Leave and re-enter: a safe spot is kept; an unsafe one falls back to the nearest checkpoint to its left.
  const r=await open('ret6','L6c',800,6);
  await move(r,410);await move(r,480,true);await grounded(r);await move(r,520);await r.waitForTimeout(700);
  const safe=await position(r);
  await r.keyboard.press('Escape');await r.waitForFunction(()=>!board.getParkScene());
  await r.waitForTimeout(1300);await choose(r,6);
  assert.deepEqual(await position(r).then(p=>[p.x,p.y]),[safe.x,safe.y],'safe floor spot resumed');
  await move(r,600);await move(r,652,true);await waitY(r,168);await move(r,700,true);await waitY(r,144);await r.waitForTimeout(700);
  await r.keyboard.press('Escape');await r.waitForFunction(()=>!board.getParkScene());
  await r.waitForTimeout(1300);await choose(r,6);
  await r.waitForFunction(()=>{const p=board.getParkScene().getGame().getWorld().player;return p._airFrames===0&&p.y===144;},null,{timeout:8000});
  assert.equal((await position(r)).x,688-2,'stair spot is not safe: the pit-2 checkpoint drops onto step B');
  console.log('LEVEL 6 RE-ENTRY PASS');
  await r.close();
  // (5) An old cached client (protocol 4) asking for level 6 is told to reload.
  const old=await browser.newPage({viewport:{width:800,height:700}});
  old.on('pageerror',error=>{errors.push(error.message);});
  await old.addInitScript(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){try{const m=JSON.parse(data);if(m.type==='park_join'||m.type==='park_resume'){m.protocol=4;data=JSON.stringify(m);}}catch{}return send.call(this,data);};});
  await old.goto(`${origin}/?user=old6&section=L6d`);
  await old.waitForFunction(()=>window.board?.getSpritePosition?.('old6'));
  await old.evaluate(()=>board.openParkLevel(6));
  await old.waitForFunction(()=>/Reload the calendar|park is updating/.test(document.querySelector('[data-park-status]')?.textContent||''),null,{timeout:8000});
  assert.equal(await old.evaluate(()=>board.getParkScene().replica.state),null,'no level for an old client');
  await old.waitForTimeout(2500);
  assert.equal(packets.filter(p=>p.name==='old6'&&p.type==='park_join').length,1,'no retry loop after PARK_UPDATE_REQUIRED');
  console.log('LEVEL 6 PROTOCOL-4 PASS');
  await old.close();
}
try {
  const filter=process.env.PARK_LEVEL_FILTER;
  const waitingOnly=process.env.PARK_WAITING_ONLY==='1';
  if(filter==null||filter.split(',').includes('6'))await level6();
  for(const index of [0,1,2,3,4,5].filter(i=>filter==null||filter.split(',').includes(String(i)))) {
    const a=await open('alice'+index,'coop'+index,800,index);
    assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.running),false);
    const start=await position(a);await a.keyboard.down('ArrowRight');await a.waitForTimeout(800);await a.keyboard.up('ArrowRight');
    assert.ok((await position(a)).x>start.x+50,'a waiting student can move');
    await move(a,start.x+30);
    await a.keyboard.down('Space');
    await a.waitForFunction(()=>board.getParkScene().getGame().getWorld().player.y<125);
    await a.keyboard.up('Space');await waitY(a,146);
    const waitingState=await a.evaluate(()=>structuredClone(board.getParkScene().replica.state));
    // Simulate a fall and reaching the locked goal; neither changes shared progress.
    await a.evaluate(()=>{const w=board.getParkScene().getGame().getWorld();Object.assign(w.player,{y:w.level.height+40,vy:50});});
    await a.waitForFunction(()=>board.getParkScene().getGame().getWorld().player.y===146);
    assert.ok((await position(a)).x<200);
    await a.evaluate(()=>{const w=board.getParkScene().getGame().getWorld();Object.assign(w.player,w.level.goal,{vx:0,vy:0});});
    await a.keyboard.press('ArrowUp',{delay:80});
    assert.deepEqual(await a.evaluate(()=>board.getParkScene().replica.state.progress),waitingState.progress);
    assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.level.id),waitingState.level.id);
    assert.equal(await a.evaluate(()=>board.getParkScene().replica.outbox.length),0);
    await a.evaluate(()=>{const w=board.getParkScene().getGame().getWorld();Object.assign(w.player,w.level.spawn,{vx:0,vy:0,state:'idle',standingOn:null});});
    if(waitingOnly){
      await move(a,43);await a.keyboard.press('ArrowUp',{delay:80});
      await a.waitForFunction(()=>!board.getParkScene());
      console.log('WAITING EXPLORATION PASS',index);await a.close();continue;
    }
    let b=await open('bob'+index,'coop'+index,800,index);
    await a.waitForFunction(()=>board.getParkScene().replica.state.running);
    if(index===0){
      const attempt=await a.evaluate(()=>board.getParkScene().replica.state.level.id);
      await b.close();await a.waitForFunction(()=>!board.getParkScene().replica.state.running);
      await move(a,140);await move(a,90);
      assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.level.id),attempt);
      b=await open('bob'+index,'coop'+index,800,index);
      await a.waitForFunction(()=>board.getParkScene().replica.state.running);
    }
    for(const page of [a,b]){assert.equal(await page.evaluate(()=>board.getCanvas()===originalCanvas),true);assert.equal(await page.locator('canvas').count(),await page.evaluate(()=>originalCanvasCount));}
    console.log('START LEVEL',index);
    if(index===0){
      await move(b,279);await a.waitForTimeout(700);await move(a,240);await move(a,278,true);await waitY(a,122);
      await move(a,340,true);await waitY(a,82);await move(a,377);await move(a,490,true);await move(a,510);await gate(b,'bridge');
      await move(b,236);await move(b,278,true);await waitY(b,114);await move(b,340,true);await waitY(b,82);await move(b,485);
      await move(a,670);await progress(a,'keyHolder');await move(b,620);
      await move(a,730);await a.waitForFunction(()=>{const g=board.getParkScene();return g.getGame().getWorld().lift.y>=169.9&&g.replica.clock()%10000<1200;},null,{timeout:12000});await move(a,785);await waitY(a,40);await a.waitForFunction(()=>board.getParkScene().getGame().getWorld().lift.y<=64.001);await move(a,905,true);await arrive(a);
      await move(b,730);await b.waitForFunction(()=>{const g=board.getParkScene();return g.getGame().getWorld().lift.y>=169.9&&g.replica.clock()%10000<1200;},null,{timeout:12000});await move(b,785);await waitY(b,40);await b.waitForFunction(()=>board.getParkScene().getGame().getWorld().lift.y<=64.001);await move(b,905,true);await arrive(b);
    } else if(index===1){
      let holder=b,runner=a;
      for(const [i,x] of [300,700,1100].entries()){
        await move(holder,x-55);await gate(runner,'cross-'+i);
        if(i===0){
          const planted=await position(holder);
          await holder.evaluate(({x,y})=>{const r=board.getParkScene().replica,name=r.state.online.find(n=>n!==new URL(location.href).searchParams.get('user'));r.peerMotion({epoch:r.state.epoch,level:r.state.level.id,member:name,pose:{x:x-5,y,vx:0,vy:0}});},planted);
          await holder.waitForTimeout(350);assert.equal((await position(holder)).x,planted.x,'sparse peer overlap must not push a stationary button holder');
        }
        await move(runner,x-105);await move(runner,x-15,true);await move(runner,x+210);
        await holder.waitForTimeout(350);await move(holder,x+185);
        [holder,runner]=[runner,holder];
      }
      await move(holder,1330);await progress(holder,'keyHolder');await move(holder,1390);await arrive(holder);await move(runner,1390);await arrive(runner);
    } else if(index===2){
      await move(b,430);await move(a,380);await move(a,465,true);
      await Promise.all([waitY(a,40),waitY(b,40)]);
      await Promise.all([move(a,530,true),move(b,570,true)]);
      await move(b,650);await progress(b,'keyHolder');await move(b,905);await arrive(b);await move(a,905);await arrive(a);
    } else if(index===3){
      await move(b,180);await a.waitForTimeout(700);await move(a,130);await move(a,230,true);await move(a,260);await move(a,340,true);await waitY(a,106);
      await move(a,420);await waitY(a,146);await move(a,305);
      await a.waitForFunction(()=>board.getParkScene().replica.state.progress.boxes.wall.node===0);
      await move(a,335);await progress(a,'keyHolder');await move(a,260,true);await waitY(a,106);
      await move(b,180);await b.keyboard.down('ArrowRight');
      await b.waitForFunction(()=>board.getParkScene().getGame().getWorld().moving.get('wall').x>=619.5,null,{timeout:20000});await b.keyboard.up('ArrowRight');
      await a.waitForTimeout(3000);await move(a,780);await move(b,760);
      await move(a,860,true);await waitY(a,106);
      await b.keyboard.down('ArrowRight');await b.waitForFunction(()=>board.getParkScene().getGame().getWorld().moving.get('step').x>=899.5,null,{timeout:10000});await b.keyboard.up('ArrowRight');
      await a.waitForTimeout(2000);await move(a,1040,true);await waitY(a,66);await move(a,1210);await arrive(a);
      await move(b,960,true);await waitY(b,106);await move(b,1040,true);await waitY(b,66);
      await move(b,1210);await arrive(b);
    } else if(index===4){
      await move(b,400);await move(a,150);await move(a,210,true);await waitY(a,110);await move(a,240);await move(a,310,true);await waitY(a,74);await move(a,335);await move(a,410,true);await waitY(a,40);
      await gate(b,'lower-bridge');await move(b,660);await gate(a,'upper-a');
      await move(a,880);await move(b,730,true);await move(b,880);await gate(a,'upper-b');
      await move(a,990);await progress(a,'keyHolder');await move(a,1040);await move(a,1170,true);await move(a,1210);await arrive(a);
      await move(b,950,true);await move(b,1030);await b.waitForFunction(()=>{const g=board.getParkScene();return g.getGame().getWorld().lift.y>=169.9&&g.replica.clock()%10000<1200;},null,{timeout:12000});await move(b,1090);await waitY(b,40);await move(b,1210);await arrive(b);
    } else {
      for(const page of [b,a]){
        await move(page,230);await page.waitForFunction(()=>{const g=board.getParkScene();return g.getGame().getWorld().lift.y>=169.9&&g.replica.clock()%10000<1200;},null,{timeout:12000});await move(page,275);await page.waitForFunction(()=>{const g=board.getParkScene(),t=g.replica.clock()%12000,p=g.getGame().getWorld().player;return Math.abs(p.y-76)<1&&t>3000&&t<5900;},null,{timeout:65000});
        await move(page,345,true);await waitY(page,76);await move(page,530);await waitY(page,186);await move(page,page===b?705:675);
      }
      await progress(a,'keyHolder');
      for(const page of [b,a]){await move(page,820);await page.waitForFunction(()=>board.getParkScene().getGame().getWorld().moving.get('exit-lift').y>=209.9,null,{timeout:12000});await move(page,865);await waitY(page,40);await move(page,970,true);await move(page,1050);await arrive(page);}
    }
    await progress(a,'complete');await progress(b,'complete');
    await a.screenshot({path:path.join(output,'cooperative-level-'+index+'.png')});
    const old=await a.evaluate(()=>board.getParkScene().replica.state.level.id);
    for(const [ws,who] of sockets)if(who.username==='alice'+index)ws.terminate();
    await a.waitForFunction(()=>board.getParkScene().replica.needsResume||document.querySelector('[data-park-status]').textContent.includes('Reconnect'));
    await a.waitForFunction(()=>!board.getParkScene().replica.needsResume&&!document.querySelector('[data-park-status]').textContent.includes('Reconnect'),null,{timeout:20000});
    assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.level.id),old);
    assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.progress.complete),true);
    await a.keyboard.press('ArrowUp',{delay:80});await choose(a,index);
    assert.notEqual(await a.evaluate(()=>board.getParkScene().replica.state.level.id),old);
    assert.equal(await a.evaluate(()=>board.getParkScene().replica.state.progress.doorOpen),false);
    assert.ok((await position(a)).x<200);
    if(index===0){
      await move(a,43);await a.keyboard.down('ArrowUp');
      await a.waitForFunction(()=>!board.getParkScene());
      for(let i=0;i<4;i++){await a.waitForTimeout(350);await a.keyboard.down('ArrowUp');}
      assert.equal(await a.evaluate(()=>board.getParkScene()),null);await a.keyboard.up('ArrowUp');
      for(const call of [
        {poll:{id:'recall',question:'Ready?',options:[{id:'yes',label:'Yes'}],blind:true}},
        {gate:{armed:true,theme:'test'}},{greenlight:{at:Date.now()}},
        {doorways:{id:'recall',options:[{id:'one',label:'One'}]}},
        {activity:{id:'recall',type:'test',finished:false,state:{}}}
      ]){
        await choose(a,0);
        for(const [ws,who] of sockets)if(who.username==='alice0')send(ws,call.greenlight?{type:'classroom_greenlight'}:{...registry.stateFor('coop0','student','alice0'),...call});
        await a.waitForFunction(()=>!board.getParkScene());await a.evaluate(()=>board.openNativeGameplay());
        assert.equal(await a.evaluate(()=>board.getParkScene()),null);
        for(const [ws,who] of sockets)if(who.username==='alice0')send(ws,registry.stateFor('coop0','student','alice0'));
        await a.waitForTimeout(80);
      }
    }
    console.log('COOPERATIVE LEVEL PASS',index);
    await a.close();await b.close();
  }
  if(filter==null&&!waitingOnly){
  // Load the real calendar at Chromebook height, blocking production traffic.
  const companion = await open('calendar_buddy','F',800,0);
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
  // (6) Exactly one door on the real calendar.
  assert.equal(await calendar.locator('[data-classroom-native]').count(),1);
  assert.equal(await calendar.getByRole('button',{name:/^Enter APStat Park/}).count(),1);
  await choose(calendar,6);
  const rect=()=>calendar.evaluate(()=>{const c=board.getCanvas();const r=c.getBoundingClientRect();return {width:r.width,height:r.height,background:getComputedStyle(c.parentElement).backgroundColor};});
  // The board grows to the level's height only while it is open: 220 -> 240 -> 220.
  const levelHeight=await calendar.evaluate(()=>board.getParkScene().getGame().getWorld().level.height);
  assert.equal(before.height,220);assert.equal(levelHeight,240);
  const after=await rect();
  assert.deepEqual(after,{...before,height:240});
  assert.equal(await calendar.evaluate(()=>board.getCanvas()===originalCanvas),true);
  await move(calendar,150);
  await calendar.screenshot({path:path.join(output,'actual-calendar-park.png')});
  await calendar.keyboard.press('Escape');
  await calendar.waitForFunction(()=>!board.getParkScene());
  assert.deepEqual(await rect(),before);
  // And the grow path directly on the real engine.
  await calendar.evaluate(()=>board.setBoardHeight(240));
  assert.deepEqual(await rect(),{...before,height:240});
  await calendar.setViewportSize({width:1000,height:650});
  assert.equal((await rect()).height,240);
  await calendar.evaluate(()=>board.setBoardHeight());
  assert.equal((await rect()).height,before.height);
  await companion.close();
  assert.ok(!calendarErrors.some(e=>/park|world|replica|scene|PlayerSprite/i.test(e)),JSON.stringify(calendarErrors));
  await calendar.close();
  }
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(output,'cooperative-result.json'),JSON.stringify({passed:true,levels:filter||'all six',waitingOnly,errors,packets:packets.length},null,2));
  console.log('COOPERATIVE BROWSER PASS',packets.length);
} finally {
  await browser.close(); service.close(); for(const ws of wss.clients) ws.terminate(); await new Promise(resolve=>wss.close(resolve)); await new Promise(resolve=>server.close(resolve));
}

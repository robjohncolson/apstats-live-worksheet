import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href);
const root = new URL('../', import.meta.url);
const desk = await readFile(new URL('ap_stats_roadmap_square_mode.html', root), 'utf8');
const tags = desk.match(/<script src="(?:canvas_engine|sprite_sheet|classroom-board)\.js[^"<>]*"><\/script>/g);
assert.equal(tags.length, 3);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/legacy-worker.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(`self.addEventListener('install', e => e.waitUntil((async()=>{
      const cache=await caches.open('old-desk');
      await cache.put('/classroom-board.js',new Response('window.oldBoardLoaded=true;', {headers:{'Content-Type':'text/javascript'}}));
      await self.skipWaiting();
    })()));
    self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch',e=>e.respondWith((async()=>await caches.match(e.request)||fetch(e.request))()));`);
    return;
  }
  if (url.pathname === '/' || url.pathname === '/desk') {
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html>' + (url.pathname === '/desk' ? tags.join('\n') : 'setup')); return;
  }
  try { res.setHeader('Content-Type','text/javascript'); res.end(await readFile(new URL('.'+url.pathname,root))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PARK_BROWSER});
try {
  const page=await browser.newPage();
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/legacy-worker.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.goto(origin+'/desk');
  const result=await page.evaluate(async()=>({old:!!window.oldBoardLoaded, current:typeof window.ClassroomBoard?.mount==='function',
    oldCacheRetained:!!(await caches.match('/classroom-board.js'))}));
  assert.deepEqual(result,{old:false,current:true,oldCacheRetained:true});
  console.log('PASS: actual desk entry scripts bypass a stale cache-first service worker');
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}

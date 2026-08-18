/**
 * PWA tests (OFFLINE_MODE_SPEC §4.G): manifest validity, the service-worker cache
 * strategy (extracted + executed), SW source contracts, registration guards, and
 * the build-version lockstep that prevents a stale stuck cache.
 */

import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const SW = read('sw.js');
const REG = read('pwa-register.js');
const DESK = read('ap_stats_roadmap_square_mode.html');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name);
  const o = src.indexOf('{', s);
  let d = 0;
  for (let i = o; i < src.length; i += 1) { if (src[i] === '{') d += 1; else if (src[i] === '}') { d -= 1; if (d === 0) return src.slice(s, i + 1); } }
  throw new Error('no ' + name);
}

describe('manifest.webmanifest', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  it('is valid and installable (name, start_url, standalone)', () => {
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe('ap_stats_roadmap_square_mode.html'); // relative → works on GH Pages subpath + localhost pack
    expect(m.scope).toBe('./');
    expect(m.display).toBe('standalone');
  });
  it('ships raster PNG icons (Chrome installability wants >=192px PNG)', () => {
    expect(m.icons.some((i) => i.type === 'image/png' && i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.type === 'image/png' && i.sizes === '512x512')).toBe(true);
    expect(existsSync(resolve(repo, 'icon-192.png'))).toBe(true);
    expect(existsSync(resolve(repo, 'icon-512.png'))).toBe(true);
  });
});

describe('sw.js cacheStrategyFor', () => {
  const cacheStrategyFor = new Function(extractFn(SW, 'cacheStrategyFor') + '\nreturn cacheStrategyFor;')();
  const ORIGIN = 'https://robjohncolson.github.io';
  const req = (over = {}) => ({ method: 'GET', url: ORIGIN + '/apstats-live-worksheet/x.js', mode: 'cors', headers: { get: () => '' }, ...over });

  it('same-origin static GET → asset (cache-first)', () => {
    expect(cacheStrategyFor(req(), ORIGIN)).toBe('asset');
  });
  it('navigations → navigate (network-first): mode navigate OR accept text/html', () => {
    expect(cacheStrategyFor(req({ mode: 'navigate' }), ORIGIN)).toBe('navigate');
    expect(cacheStrategyFor(req({ headers: { get: (h) => (h === 'accept' ? 'text/html' : '') } }), ORIGIN)).toBe('navigate');
  });
  it('non-GET → passthrough (never cache writes)', () => {
    expect(cacheStrategyFor(req({ method: 'POST' }), ORIGIN)).toBe('passthrough');
  });
  it('cross-origin (roster/cr/supabase APIs) → passthrough', () => {
    expect(cacheStrategyFor(req({ url: 'https://roster-production-12c1.up.railway.app/grade' }), ORIGIN)).toBe('passthrough');
  });
  it('version.json → passthrough (must not break the stale-tab update nudge)', () => {
    expect(cacheStrategyFor(req({ url: ORIGIN + '/apstats-live-worksheet/version.json' }), ORIGIN)).toBe('passthrough');
  });
});

describe('sw.js contracts', () => {
  it('pre-caches the mobile flashcard shell and supporting data', () => {
    const start = SW.indexOf('const CORE = [');
    const core = SW.slice(start, SW.indexOf('];', start));
    for (const asset of [
      'flashcards.js',
      'mobile-home.html',
      'data/blooket-difficulty.json',
      'data/blooket-topic-csv.json',
    ]) {
      expect(core).toContain(`'${asset}'`);
    }
  });
  it('versioned cache + activate purges old caches + skipWaiting/claim', () => {
    expect(SW).toMatch(/const CACHE = 'apstats-pwa-' \+ BUILD/);
    expect(SW).toContain('self.skipWaiting()');
    expect(SW).toContain('caches.delete');
    expect(SW).toContain('self.clients.claim()');
  });
  it('navigations are network-first (fresh online, cached offline)', () => {
    const body = SW.slice(SW.indexOf("strat === 'navigate'"));
    expect(body).toMatch(/const net = await fetch\(e\.request\)/);
    expect(body).toMatch(/caches\.match\(e\.request\)/);
  });
  it('background sync messages clients to drain (token lives on the page)', () => {
    expect(SW).toContain("e.tag !== 'apstats-sync-grades'");
    expect(SW).toContain("type: 'drain-offline-queue'");
  });
  it('documents a kill switch', () => {
    expect(SW).toMatch(/KILL SWITCH/i);
  });
});

describe('pwa-register.js', () => {
  function boot(url = 'https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html') {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', { url });
    const win = dom.window;
    const listeners = {};
    const reg = { sync: { register: vi.fn().mockResolvedValue(undefined) } };
    const swMock = {
      register: vi.fn().mockResolvedValue(reg),
      ready: Promise.resolve(reg),
      addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    Object.defineProperty(win.navigator, 'serviceWorker', { value: swMock, configurable: true });
    win.gradebookClient = { syncOfflineQueue: vi.fn() };
    const ctx = createContext(win);
    runInContext(REG, ctx);
    return { win, swMock, listeners };
  }

  it('registers sw.js on load (secure origin)', async () => {
    const { win, swMock } = boot();
    win.dispatchEvent(new win.Event('load'));
    await Promise.resolve();
    expect(swMock.register).toHaveBeenCalledWith('sw.js');
  });

  it('does NOT register on file:// (the pack uses a localhost server)', () => {
    const { win, swMock } = boot('file:///C:/x/ap_stats_roadmap_square_mode.html');
    win.dispatchEvent(new win.Event('load'));
    expect(swMock.register).not.toHaveBeenCalled();
  });

  it('drains the offline queue when the SW posts drain-offline-queue', () => {
    const { win, listeners } = boot();
    expect(typeof listeners.message).toBe('function');
    listeners.message({ data: { type: 'drain-offline-queue' } });
    expect(win.gradebookClient.syncOfflineQueue).toHaveBeenCalled();
  });

  it('exposes PWAInstall: captures beforeinstallprompt and install() triggers it', async () => {
    const { win } = boot();
    expect(win.PWAInstall.canInstall()).toBe(false);
    const e = new win.Event('beforeinstallprompt');
    e.prompt = vi.fn();
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    win.dispatchEvent(e);
    expect(win.PWAInstall.canInstall()).toBe(true);
    const outcome = await win.PWAInstall.install();
    expect(e.prompt).toHaveBeenCalled();
    expect(outcome).toBe('accepted');
    expect(win.PWAInstall.canInstall()).toBe(false); // consumed
  });

  it('install() returns "unavailable" with no captured prompt (iOS/unsupported → caller instructs)', async () => {
    const { win } = boot();
    expect(await win.PWAInstall.install()).toBe('unavailable');
  });

  it('ignores unrelated SW messages', () => {
    const { win, listeners } = boot();
    listeners.message({ data: { type: 'something-else' } });
    expect(win.gradebookClient.syncOfflineQueue).not.toHaveBeenCalled();
  });
});

describe('Desk PWA wiring + build lockstep', () => {
  it('the Desk links the manifest + icon + theme-color and loads pwa-register.js', () => {
    expect(DESK).toContain('rel="manifest" href="manifest.webmanifest"');
    expect(DESK).toContain('name="theme-color"');
    expect(DESK).toContain('src="pwa-register.js"');
  });
  it('the File menu has an Install App item (replacing Save to Floppy) wired to _pwaInstall', () => {
    expect(DESK).toContain('onclick="_pwaInstall()">Install App...');
    expect(DESK).not.toContain('Save to Floppy');
    expect(DESK).toMatch(/function _pwaInstall\s*\(/);
    expect(DESK).toMatch(/function _pwaInstallHelp\s*\(/); // manual-instructions fallback (iOS/already-installed)
  });
  it('sw BUILD === version.json build === APP_BUILD (no stale-cache drift)', () => {
    const swBuild = (SW.match(/const BUILD = '([^']+)'/) || [])[1];
    const verBuild = JSON.parse(read('version.json')).build;
    const appBuild = (DESK.match(/var APP_BUILD = '([^']+)'/) || [])[1];
    expect(swBuild).toBe(verBuild);
    expect(appBuild).toBe(verBuild);
  });
});

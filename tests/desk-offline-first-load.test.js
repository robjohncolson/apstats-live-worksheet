// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { deskHtml } from './helpers/desk-source.js';

const ROOT = resolve(import.meta.dirname, '..');
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BASE = 'https://school.test/apstats-live-worksheet/';
const MODULE_URLS = [...deskHtml().matchAll(/<script src="(js\/desk-[^"]+)"/g)]
  .map((match) => match[1]);

async function installThenGoOffline() {
  const handlers = {};
  const entries = new Map();
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, BASE).href;
  const cache = {
    async add(url) {
      const path = new URL(url, BASE).pathname.slice(new URL(BASE).pathname.length);
      entries.set(key(url), new Response(path.startsWith('js/desk-')
        ? readFileSync(resolve(ROOT, path), 'utf8') : 'cached shell'));
    },
    async put(request, response) { entries.set(key(request), response); },
  };
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  runInNewContext(SW, {
    URL, Response, fetch,
    caches: {
      open: async () => cache,
      match: async (request) => entries.get(key(request))?.clone(),
    },
    self: {
      location: new URL('sw.js', BASE),
      skipWaiting() {},
      addEventListener(type, handler) { handlers[type] = handler; },
    },
  });
  let installation;
  handlers.install({ waitUntil(promise) { installation = promise; } });
  await installation;
  return async (url) => {
    let response;
    handlers.fetch({
      request: { url: new URL(url, BASE).href, method: 'GET', mode: 'cors', headers: new Headers() },
      respondWith(promise) { response = promise; },
    });
    return response;
  };
}

describe('Desk first offline reload after an uncontrolled online visit', () => {
  it.each(MODULE_URLS)('serves the installed module at the actual Desk URL: %s', async (url) => {
    const request = await installThenGoOffline();
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(readFileSync(resolve(ROOT, url.split('?')[0]), 'utf8'));
  });

  it('does not substitute this build for another version', async () => {
    const request = await installThenGoOffline();
    expect((await request('js/desk-calendar.js?v=another-build')).status).toBe(504);
  });
});

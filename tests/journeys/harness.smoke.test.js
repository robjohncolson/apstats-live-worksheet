/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bootDesk,
  CURRICULUM_URL,
  ROSTER_URL,
  SUPABASE_URL,
  budget,
} from './harness.js';

const ROADMAP = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../roadmap-data.json'), 'utf8'));
const BULLETIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../data/bulletin.json'), 'utf8'));

describe('Desk journey harness smoke', { timeout: budget(20_000) }, () => {
  it('boots the real Desk cleanly with Do Now and disk-backed roadmap tiles in under 6 seconds', async () => {
    const harness = await bootDesk();
    try {
      expect(harness.consoleErrors, 'Desk called console.error during boot').toEqual([]);
      expect(harness.jsdomErrors, 'JSDOM reported an exception during boot').toEqual([]);
      expect(harness.windowErrors, 'Desk dispatched a window error during boot').toEqual([]);
      expect(harness.unhandledRejections, 'Desk had an unhandled rejection during boot').toEqual([]);
      expect(harness.unhandled, 'Desk boot requested a URL the harness does not route').toEqual([]);

      const doNow = harness.document.getElementById('donow-card');
      expect(doNow).toBeTruthy();
      expect(doNow.style.display).toBe('flex');
      expect(doNow.textContent).toContain('Do Now');

      expect(harness.requests.some(({ method, url }) => (
        method === 'GET' && new URL(url).pathname.endsWith('/roadmap-data.json')
      )), 'roadmap-data.json was not fetched from the disk router').toBe(true);

      const tiles = [...harness.document.querySelectorAll('#cg .dc[data-topic]')];
      expect(tiles.length, 'the real Desk rendered no roadmap tiles').toBeGreaterThan(0);
      expect(tiles.some((tile) => (
        String(tile.dataset.topic).split('+').some((topic) => ROADMAP.lessons[topic])
      )), 'no rendered roadmap tile maps to roadmap-data.json').toBe(true);

      expect(harness.bootTimeMs).toBeLessThan(budget(6_000));

      // Local fixture reads must not outlive a test waiting only for page load.
      // Preserve fetch's async interface, but require its bytes before a host
      // I/O turn: pending filesystem reads used to resume after JSDOM teardown.
      let fixtureResponse;
      const pendingFixture = harness.window.fetch('data/bulletin.json');
      expect(pendingFixture.then).toBeTypeOf('function');
      pendingFixture.then((response) => { fixtureResponse = response; });
      await Promise.resolve();
      expect(fixtureResponse, 'local fixture fetch still waits for filesystem I/O').toBeInstanceOf(Response);
      expect(await fixtureResponse.json()).toEqual(BULLETIN);
    } finally {
      harness.teardown();
    }
  });

  it('404s and records unmatched method+path pairs for every known remote origin', async () => {
    const harness = await bootDesk();
    try {
      const urls = [
        `${ROSTER_URL}/donow-typo`,
        `${ROSTER_URL}/donow`,
        `${CURRICULUM_URL}/api/typo`,
        `${CURRICULUM_URL}/api/ai/coach`,
        `${SUPABASE_URL}/rest/v1/typo`,
        `${SUPABASE_URL}/rest/v1/lesson_urls`,
      ];
      const methods = ['GET', 'POST', 'GET', 'GET', 'GET', 'POST'];
      const responses = await Promise.all(urls.map((url, index) => (
        harness.window.fetch(url, { method: methods[index] })
      )));

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
      expect(harness.unhandled).toEqual(urls.map((url, index) => `${methods[index]} ${url}`));
    } finally {
      harness.teardown();
    }
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { bootDesk, budget, DESK_URL } from './journeys/harness.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = 'js/desk-missing-work.js';
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const rows = [
  { lessonKey: '1.1', zeroDate: { B: '2026-09-29', E: '2026-10-02' }, Cws: 90, quizTotal: 2, Q: null },
  { lessonKey: '1.2', due: { B: '2026-09-25', E: '2026-09-25' }, zeroDate: { B: '2026-10-08', E: '2026-10-08' } },
];

describe('missing-work module integration', () => {
  it.each(['classic', 'park'])('loads the real module and renders its results in the %s Desk', async (home) => {
    const harness = await bootDesk({
      url: DESK_URL + '?home=' + home,
      now: '2026-09-30T16:00:00.000Z',
    });
    try {
      const { window, document } = harness;
      expect(harness.resources.map(normalize)).toContain(normalize(MODULE_PATH));
      expect(typeof window.DeskMissingWork.zeroWarnings).toBe('function');
      expect(typeof window.DeskMissingWork.pastDueWork).toBe('function');
      expect(harness.jsdomErrors).toEqual([]);
      expect(harness.windowErrors).toEqual([]);
      expect(harness.consoleErrors).toEqual([]);
      expect(harness.unhandledRejections).toEqual([]);

      // Supply grade data, not replacement selectors: the real wrappers and renderers run.
      window._gradeLessonsCache = rows;
      window.eval("cP = 'B'");
      expect(window._zeroCurrentWarnings()).toEqual([
        { lessonKey: '1.1', kind: 'quiz', zeroDate: '2026-09-29', daysLeft: -1, past: true },
      ]);
      expect(window._pastDueCurrentWork().map((row) => [row.lessonKey, row.kind])).toEqual([
        ['1.2', 'worksheet'],
      ]);
      window._updateZeroWarningBadge();
      expect(document.querySelector('.wallet-zero-badge')?.textContent).toBe('1');

      const host = document.getElementById('wallet-content');
      window._walletPrependZeroCard(host);
      expect(host.querySelectorAll('.wz-row:not(.wz-later)')).toHaveLength(1);
      expect(host.querySelectorAll('.wz-later')).toHaveLength(1);
      expect(host.querySelector('.wz-past')).not.toBeNull();

      window.eval("cP = 'E'");
      expect(window._zeroCurrentWarnings()[0]).toMatchObject({ daysLeft: 2, past: false });
      window._walletPrependZeroCard(host);
      expect(host.querySelector('.wz-past')).toBeNull();

      window._gradeLessonsCache = [];
      window._updateZeroWarningBadge();
      window._walletPrependZeroCard(host);
      expect(document.querySelector('.wallet-zero-badge')).toBeNull();
      expect(host.querySelector('.wallet-zero-card')).toBeNull();
    } finally {
      harness.teardown();
    }
  }, budget(30_000));

  it('precaches both the bare module and the exact versioned URL loaded by the Desk', async () => {
    const dom = new JSDOM(read('ap_stats_roadmap_square_mode.html'));
    try {
      const src = dom.window.document.querySelector('script[src^="' + MODULE_PATH + '"]')?.getAttribute('src');
      expect(src).toBe(MODULE_PATH + '?v=' + JSON.parse(read('version.json')).build);
      const handlers = {};
      const cached = [];
      const waits = [];
      runInNewContext(read('sw.js'), {
        self: { addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {} },
        caches: { open: async () => ({ add: async (url) => { cached.push(url); } }) },
      });
      handlers.install({ waitUntil: (promise) => { waits.push(promise); } });
      await Promise.all(waits);
      expect(cached.filter((url) => url === MODULE_PATH)).toHaveLength(1);
      expect(cached.filter((url) => url === src)).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });

  it('keeps the module URL versioned when the real build-bump script runs', () => {
    // Execute against an in-memory filesystem: this test never bumps the checkout.
    const files = new Map(['ap_stats_roadmap_square_mode.html', 'version.json', 'sw.js', 'worksheet-diagnostics.js']
      .map((file) => [resolve(ROOT, file), read(file)]));
    const script = read('scripts/bump-build.mjs')
      .replace(/^import .*;\r?\n/gm, '')
      .replaceAll('import.meta.url', JSON.stringify(new URL('../scripts/bump-build.mjs', import.meta.url).href));
    runInNewContext(script, {
      readFileSync(path) {
        if (!files.has(path)) throw new Error('Unexpected read: ' + path);
        return files.get(path);
      },
      writeFileSync(path, content) {
        if (!files.has(path)) throw new Error('Unexpected write: ' + path);
        files.set(path, content);
      },
      resolve, dirname, fileURLToPath,
      console: { log() {}, error(message) { throw new Error(message); } },
      process: { exit(code) { throw new Error('Unexpected exit: ' + code); } },
    });
    const build = JSON.parse(files.get(resolve(ROOT, 'version.json'))).build;
    const dom = new JSDOM(files.get(resolve(ROOT, 'ap_stats_roadmap_square_mode.html')));
    try {
      const scripts = dom.window.document.querySelectorAll('script[src^="' + MODULE_PATH + '"]');
      expect(scripts).toHaveLength(1);
      expect(scripts[0].getAttribute('src')).toBe(MODULE_PATH + '?v=' + build);
    } finally {
      dom.window.close();
    }
  });
});

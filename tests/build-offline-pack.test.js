/**
 * Tests for scripts/build-offline-pack.mjs (OFFLINE_MODE_SPEC §4.E).
 * Pure-helper units + one real build into a temp dir (then cleaned up).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { injectOfflineConfig, genOfflineConfig } from '../scripts/build-offline-pack.mjs';

const repo = resolve(import.meta.dirname, '..');

describe('injectOfflineConfig', () => {
  it('inserts offline-config.js as the first script after <head>', () => {
    const out = injectOfflineConfig('<html><head>\n<script src="a.js"></script></head><body></body></html>', '');
    expect(out).toMatch(/<head>\s*<script src="offline-config\.js"><\/script>/);
    expect(out.indexOf('offline-config.js')).toBeLessThan(out.indexOf('a.js'));
  });
  it('honors a nesting relPrefix (e.g. a subdir page)', () => {
    const out = injectOfflineConfig('<head></head>', '../');
    expect(out).toContain('src="../offline-config.js"');
  });
  it('is idempotent (no double-inject)', () => {
    const once = injectOfflineConfig('<head></head>', '');
    const twice = injectOfflineConfig(once, '');
    expect((twice.match(/offline-config\.js/g) || []).length).toBe(1);
  });
});

describe('genOfflineConfig', () => {
  it('generic pack sets OFFLINE_MODE and bakes no session', () => {
    const cfg = genOfflineConfig(null);
    expect(cfg).toContain('window.OFFLINE_MODE = true');
    expect(cfg).not.toContain('apstats_roster.v1');
  });
  it('personalized pack bakes a signed-in apstats_roster.v1 with an offline token', () => {
    const cfg = genOfflineConfig({ studentId: 'abc', username: 'mango_tiger', realName: 'Mango T.', section: 'PeriodX' }, { now: Date.parse('2026-06-22') });
    expect(cfg).toContain('window.OFFLINE_MODE = true');
    expect(cfg).toContain('apstats_roster.v1');
    expect(cfg).toContain('offline-abc');     // synthesized token
    expect(cfg).toContain('mango_tiger');
    expect(cfg).toContain('!localStorage.getItem'); // only sets a session if none cached
  });
});

describe('build (real, into a temp dir)', () => {
  const out = resolve(repo, 'state', '_pack_test');
  afterAll(() => { try { rmSync(out, { recursive: true, force: true }); } catch (_) {} });

  it('assembles a personalized pack with injected config and the launcher', () => {
    const r = spawnSync('node', ['scripts/build-offline-pack.mjs', '--out', 'state/_pack_test',
      '--identity', '{"studentId":"abc","username":"mango_tiger","realName":"Mango T.","section":"PeriodX"}'],
      { cwd: repo, encoding: 'utf8' });
    expect(r.status).toBe(0);

    // core artifacts
    expect(existsSync(resolve(out, 'offline-config.js'))).toBe(true);
    expect(existsSync(resolve(out, 'Start-Offline.cmd'))).toBe(true);
    expect(existsSync(resolve(out, 'serve.mjs'))).toBe(true);
    expect(existsSync(resolve(out, 'index.html'))).toBe(true);
    expect(existsSync(resolve(out, 'offline.html'))).toBe(true);
    expect(existsSync(resolve(out, 'offline-queue.js'))).toBe(true);

    // identity baked
    expect(readFileSync(resolve(out, 'offline-config.js'), 'utf8')).toContain('offline-abc');

    // a worksheet was copied AND had offline-config.js injected
    const ws = readFileSync(resolve(out, 'u3_lesson6-7_live.html'), 'utf8');
    expect(ws).toContain('src="offline-config.js"');
    expect(ws).toContain('src="offline-queue.js"'); // the Phase 0 wiring is present in the copy

    // a nested HTML (trainer) gets the ../-prefixed config
    if (existsSync(resolve(out, 'ti84-trainer-v2', 'standalone.html'))) {
      expect(readFileSync(resolve(out, 'ti84-trainer-v2', 'standalone.html'), 'utf8')).toContain('src="../offline-config.js"');
    }

    // the quiz app is bundled with OFFLINE_MODE injected + cr's offline-queue.js
    if (existsSync(resolve(out, 'quiz', 'index.html'))) {
      const q = readFileSync(resolve(out, 'quiz', 'index.html'), 'utf8');
      expect(q).toContain('src="../offline-config.js"');   // depth-1 prefix
      expect(q).toContain('src="offline-queue.js"');         // cr ships the queue + capture wiring
      expect(existsSync(resolve(out, 'quiz', 'offline-queue.js'))).toBe(true);
    }
  }, 90000);
});

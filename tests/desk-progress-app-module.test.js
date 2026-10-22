// desk-progress-app-module.test.js — the My Progress app window lives in
// js/desk-progress-app.js (FABLE_SPRINT_2026_10_22B_SPEC.md track H: the first
// region extracted from the Desk's inline script). Pins: the Desk loads it from
// the old position with the entry-script `?v=` stamp, nothing of it is left
// inline, the module still defines the same globals and wires the two HTML
// handlers, and the PWA precache + bump-build list carry the file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const MODULE = readFileSync(resolve(ROOT, 'js/desk-progress-app.js'), 'utf8');
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BUMP = readFileSync(resolve(ROOT, 'scripts/bump-build.mjs'), 'utf8');

describe('Desk loads the My Progress module in place', () => {
  it('splits the inline script exactly once, between the PWA install hint and the app launcher', () => {
    const tags = DESK.match(/<script src="js\/desk-progress-app\.js\?v=[^"<>]+"><\/script>/g) || [];
    expect(tags.length).toBe(1);
    const at = DESK.indexOf(tags[0]);
    const stamp = /src="classroom-board\.js\?v=([^"]+)"/.exec(DESK)[1];
    expect(tags[0]).toContain('?v=' + stamp);
    expect(DESK.slice(at - 400, at)).toContain('</script>');
    expect(DESK.slice(at, at + 200)).toContain('<script>');
    expect(at).toBeLessThan(DESK.indexOf('/* ═══ APP LAUNCHER ═══ */'));
    expect(at).toBeGreaterThan(DESK.indexOf('/* ═══ DIALOG ═══ */'));
  });
  it('leaves nothing of the region inline', () => {
    for (const marker of ['/* ═══ MY PROGRESS APP ═══ */', 'const ProgressApp = {', 'const PROG_DRILLER_API', 'const PROG_QUIZ_SB', 'function openProgress()', 'function destroyProgress()']) {
      expect(DESK).not.toContain(marker);
      expect(MODULE).toContain(marker);
    }
  });
  it('keeps the HTML handlers that reach the module globals', () => {
    expect(DESK).toContain('ondblclick="openProgress()"');
    expect(DESK).toContain('onclick="destroyProgress()"');
    expect(DESK).toContain('id="app-progress-overlay"');
  });
  it('is precached and versioned on bump-build', () => {
    const core = SW.slice(SW.indexOf('const CORE = ['), SW.indexOf('];', SW.indexOf('const CORE = [')));
    expect(core).toContain("'js/desk-progress-app.js'");
    expect(BUMP).toContain("'js/desk-progress-app.js'");
  });
});

describe('js/desk-progress-app.js', () => {
  it('is plain classic-script JS that defines the same globals and only leans on bumpUsage, MacSFX and supabase', () => {
    expect(MODULE.startsWith('/* ═══ MY PROGRESS APP ═══ */\n')).toBe(true);
    expect(MODULE).not.toMatch(/^\s*(import|export)\s/m);
    expect(MODULE).not.toContain("'use strict'");
    const calls = [];
    const sandbox = {
      bumpUsage: (k) => calls.push('bumpUsage:' + k),
      MacSFX: { play: (n) => calls.push('sfx:' + n) },
      document: { getElementById: () => null },
      window: {},
      console,
    };
    const ctx = createContext(sandbox);
    runInContext(MODULE + '\nthis.__api = { ProgressApp, openProgress, destroyProgress, PROG_DRILLER_API, PROG_QUIZ_SB };', ctx);
    const api = sandbox.__api;
    expect(typeof api.ProgressApp.open).toBe('function');
    expect(typeof api.ProgressApp.destroy).toBe('function');
    expect(typeof api.openProgress).toBe('function');
    expect(typeof api.destroyProgress).toBe('function');
    expect(api.PROG_DRILLER_API).toBe('https://lrsl-driller-production.up.railway.app');
    expect(api.PROG_QUIZ_SB.url).toMatch(/^https:\/\/.+\.supabase\.co$/);
    // openProgress goes straight to ProgressApp.open (which bumps usage + plays the open sound).
    api.ProgressApp.open = function () { calls.push('open'); };
    api.openProgress();
    expect(calls).toEqual(['open']);
  });
});

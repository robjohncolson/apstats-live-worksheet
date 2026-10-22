// desk-park-bridge-module.test.js — the Desk <-> APStat Park calculator bridge (the TI-84 skill
// button, the calc-due chip, _openParkSolo, the Calculator Skills progress modal) lives in
// js/desk-park-bridge.js (FABLE_SPRINT_2026_10_22C_SPEC.md track C3). Pins: the Desk loads it from
// the old position with the entry-script `?v=` stamp, nothing of it is left inline, the markup
// still reaches the module globals, the PWA precache and bump-build list carry the file, and the
// module evaluates as a classic script that defines the same globals.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskHtml, deskSource } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskHtml();
const MODULE = readFileSync(resolve(ROOT, 'js/desk-park-bridge.js'), 'utf8');
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BUMP = readFileSync(resolve(ROOT, 'scripts/bump-build.mjs'), 'utf8');

const GLOBALS = ['_ti84TodayTopic', '_renderTi84SkillBtn', '_openTi84ForTopic', '_calcDueUrl', '_renderCalcDue', '_openParkSolo', '_calcProgressUrl', '_renderCalcProgress', '_openCalcProgress', 'closeCalcProgress'];

describe('Desk loads the park bridge module in place', () => {
  it('splits the inline script between bumpUsage and appLaunchUrl', () => {
    const tags = DESK.match(/<script src="js\/desk-park-bridge\.js\?v=[^"<>]+"><\/script>/g) || [];
    expect(tags.length).toBe(1);
    const at = DESK.indexOf(tags[0]);
    const stamp = /src="classroom-board\.js\?v=([^"]+)"/.exec(DESK)[1];
    expect(tags[0]).toContain('?v=' + stamp);
    expect(DESK.slice(at - 400, at)).toContain('</script>');
    expect(DESK.slice(at, at + 200)).toContain('<script>');
    expect(at).toBeGreaterThan(DESK.indexOf('function bumpUsage(id)'));
    expect(at).toBeLessThan(DESK.indexOf('function appLaunchUrl(app, id)'));
  });
  it('leaves nothing of the region inline', () => {
    for (const marker of ['var _ti84LessonMap = null;', 'var _calcDueCache = ', 'var _calcProgressCache = ', ...GLOBALS.map((g) => 'function ' + g + '(')]) {
      expect(DESK).not.toContain(marker);
      expect(MODULE).toContain(marker);
    }
    expect(deskSource()).toContain(MODULE);
  });
  it('keeps the HTML handlers that reach the module globals', () => {
    expect(DESK).toContain('onclick="closeMenus();_openCalcProgress()"');
    expect(DESK).toContain('onclick="closeCalcProgress()"');
    expect(DESK).toContain('onclick="if(event.target===this)closeCalcProgress()"');
  });
  it('is precached and versioned on bump-build', () => {
    const core = SW.slice(SW.indexOf('const CORE = ['), SW.indexOf('];', SW.indexOf('const CORE = [')));
    expect(core).toContain("'js/desk-park-bridge.js'");
    expect(BUMP).toContain("'js/desk-park-bridge.js'");
  });
});

describe('js/desk-park-bridge.js', () => {
  it('is plain classic-script JS; its one top-level statement is the fail-open lesson-map fetch', () => {
    expect(MODULE).not.toMatch(/^\s*(import|export)\s/m);
    expect(MODULE).not.toContain("'use strict'");
    expect(MODULE).toContain("fetch('data/ti84-lesson-map.json')");
  });
  it('defines the same globals when evaluated as a classic script, and _openParkSolo sets the room hash', () => {
    const hashes = [];
    const sandbox = {
      window: { location: { set hash(v) { hashes.push(v); }, get hash() { return hashes[hashes.length - 1] || ''; } } },
      document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
      fetch: () => Promise.reject(new Error('offline')),
      console,
    };
    const ctx = createContext(sandbox);
    runInContext(MODULE + '\nthis.__api = { ' + GLOBALS.join(', ') + ' };', ctx);
    const api = sandbox.__api;
    for (const g of GLOBALS) expect(typeof api[g], g).toBe('function');
    api._openParkSolo('&skill=mean');
    expect(hashes).toEqual(['#room=calc-solo&skill=mean']);
  });
});

// desk-calendar-module.test.js — the completion calendar (CALENDAR APP: cP/setP, the cell
// helpers, paging, summer-prep weeks, rCal, rCD, rProg, uClock) lives in js/desk-calendar.js
// (FABLE_SPRINT_2026_10_22C_SPEC.md track C3, the last phase-2 cut). Pins: the Desk loads it
// from the old position with the entry-script `?v=` stamp, nothing of it is left inline, the
// markup still reaches the module globals, the PWA precache and bump-build list carry the file,
// and the module evaluates as a classic script that defines the same globals.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskHtml, deskSource } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskHtml();
const MODULE = readFileSync(resolve(ROOT, 'js/desk-calendar.js'), 'utf8');
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BUMP = readFileSync(resolve(ROOT, 'scripts/bump-build.mjs'), 'utf8');

const FUNCTIONS = ['setP', 'tdy', 'eq', 'cls', 'htm', 'cellAria', 'calStep', 'calToday', '_ymdISO', '_parseISODate', '_mondayOf', '_summerWeeks', '_openBaselineInfo', 'rCal', 'rCD', '_computePace', 'rProg', 'uClock'];

describe('Desk loads the calendar module in place', () => {
  it('splits the inline script between DogePresence and the tooltip', () => {
    const tags = DESK.match(/<script src="js\/desk-calendar\.js\?v=[^"<>]+"><\/script>/g) || [];
    expect(tags.length).toBe(1);
    const at = DESK.indexOf(tags[0]);
    const stamp = /src="classroom-board\.js\?v=([^"]+)"/.exec(DESK)[1];
    expect(tags[0]).toContain('?v=' + stamp);
    expect(DESK.slice(at - 400, at)).toContain('</script>');
    expect(DESK.slice(at, at + 200)).toContain('<script>');
    expect(at).toBeGreaterThan(DESK.indexOf('window.DogePresence = DogePresence;'));
    expect(at).toBeLessThan(DESK.indexOf('/* ═══ TOOLTIP ═══ */'));
  });
  it('leaves nothing of the region inline', () => {
    for (const marker of ['/* ═══ CALENDAR APP ═══ */', 'let cP="B";', 'let _calPageOffset = 0;', ...FUNCTIONS.map((f) => 'function ' + f + '(')]) {
      expect(DESK).not.toContain(marker);
      expect(MODULE).toContain(marker);
    }
    expect(deskSource()).toContain(MODULE);
  });
  it('keeps the HTML handlers that reach the module globals', () => {
    expect(DESK).toContain('onclick="setP(\'B\')"');
    expect(DESK).toContain('onclick="setP(\'E\')"');
    expect(DESK).toContain('onclick="calStep(-1)"');
    expect(DESK).toContain('onclick="calStep(1)"');
    expect(DESK).toContain('onclick="calToday()"');
  });
  it('is precached and versioned on bump-build', () => {
    const core = SW.slice(SW.indexOf('const CORE = ['), SW.indexOf('];', SW.indexOf('const CORE = [')));
    expect(core).toContain("'js/desk-calendar.js'");
    expect(BUMP).toContain("'js/desk-calendar.js'");
  });
});

describe('js/desk-calendar.js', () => {
  it('is plain classic-script JS with only declarations at the top level', () => {
    expect(MODULE.startsWith('/* ═══ CALENDAR APP ═══ */\nlet cP="B";\n')).toBe(true);
    expect(MODULE).not.toMatch(/^\s*(import|export)\s/m);
    expect(MODULE).not.toContain("'use strict'");
  });
  it('defines the same globals when evaluated as a classic script; eq/_ymdISO/_mondayOf keep their date semantics', () => {
    const sandbox = { window: {}, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, console, setInterval() {}, setTimeout() {} };
    const ctx = createContext(sandbox);
    runInContext(MODULE + '\nthis.__api = { cP, _calPageOffset, ' + FUNCTIONS.join(', ') + ' };', ctx);
    const api = sandbox.__api;
    for (const f of FUNCTIONS) expect(typeof api[f], f).toBe('function');
    expect(api.cP).toBe('B');
    expect(api._calPageOffset).toBe(0);
    expect(api.eq(new Date(2026, 9, 22, 8), new Date(2026, 9, 22, 20))).toBe(true);
    expect(api.eq(new Date(2026, 9, 22), new Date(2026, 9, 23))).toBe(false);
    expect(api._ymdISO(new Date(2026, 9, 22))).toBe('2026-10-22');
    expect(api._mondayOf(new Date(2026, 9, 22)).getDay()).toBe(1); // a Thursday -> its Monday
  });
});

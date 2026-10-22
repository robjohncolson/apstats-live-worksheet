// desk-gradebook-grid-module.test.js — the in-app My Gradebook grid (student modal, teacher
// Class Gradebook picker, date-gating + colour helpers) lives in js/desk-gradebook-grid.js
// (FABLE_SPRINT_2026_10_22C_SPEC.md track C3). Pins: the Desk loads it from the old position with
// the entry-script `?v=` stamp, nothing of it is left inline, the markup still reaches the module
// globals, the PWA precache and bump-build list carry the file, and the module evaluates as a
// classic script that defines the same globals.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskHtml, deskSource } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskHtml();
const MODULE = readFileSync(resolve(ROOT, 'js/desk-gradebook-grid.js'), 'utf8');
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BUMP = readFileSync(resolve(ROOT, 'scripts/bump-build.mjs'), 'utf8');

const GLOBALS = ['openMyGradebook', 'closeMyGradebook', 'renderMyGradebook', 'openClassGradebook', '_gradeBand', '_gbDateStr', '_lessonDateMap', '_colScheduledDate', '_myGradebookColourKey'];

describe('Desk loads the gradebook grid module in place', () => {
  it('splits the inline script between the teacher review fold and openDayGrade', () => {
    const tags = DESK.match(/<script src="js\/desk-gradebook-grid\.js\?v=[^"<>]+"><\/script>/g) || [];
    expect(tags.length).toBe(1);
    const at = DESK.indexOf(tags[0]);
    const stamp = /src="classroom-board\.js\?v=([^"]+)"/.exec(DESK)[1];
    expect(tags[0]).toContain('?v=' + stamp);
    expect(DESK.slice(at - 400, at)).toContain('</script>');
    expect(DESK.slice(at, at + 200)).toContain('<script>');
    expect(at).toBeLessThan(DESK.indexOf('function openDayGrade(dateStr)'));
    expect(at).toBeLessThan(DESK.indexOf('js/desk-study-break.js'));
  });
  it('leaves nothing of the region inline', () => {
    for (const marker of ['var _myGradebookQuarter = null;', 'var _activeGradebook = null;', ...GLOBALS.map((g) => 'function ' + g + '(')]) {
      expect(DESK).not.toContain(marker);
      expect(MODULE).toContain(marker);
    }
    expect(deskSource()).toContain(MODULE);
  });
  it('keeps the HTML handlers and the modal that reach the module globals', () => {
    expect(DESK).toContain('onclick="closeMyGradebook()"');
    expect(DESK).toContain('onclick="if(event.target===this)closeMyGradebook()"');
    expect(DESK).toContain('id="my-gradebook-title"');
  });
  it('is precached and versioned on bump-build', () => {
    const core = SW.slice(SW.indexOf('const CORE = ['), SW.indexOf('];', SW.indexOf('const CORE = [')));
    expect(core).toContain("'js/desk-gradebook-grid.js'");
    expect(BUMP).toContain("'js/desk-gradebook-grid.js'");
  });
});

describe('js/desk-gradebook-grid.js', () => {
  it('is plain classic-script JS with only declarations at the top level', () => {
    expect(MODULE.startsWith('var _myGradebookQuarter = null;\n')).toBe(true);
    expect(MODULE).not.toMatch(/^\s*(import|export)\s/m);
    expect(MODULE).not.toContain("'use strict'");
  });
  it('defines the same globals when evaluated as a classic script, and _gradeBand keeps the grade-rule bands', () => {
    const sandbox = { window: {}, document: { getElementById: () => null, addEventListener() {}, removeEventListener() {} }, console };
    const ctx = createContext(sandbox);
    runInContext(MODULE + '\nthis.__api = { ' + GLOBALS.join(', ') + ' };', ctx);
    const api = sandbox.__api;
    for (const g of GLOBALS) expect(typeof api[g], g).toBe('function');
    expect(api._gradeBand(39)).not.toBe(api._gradeBand(40));
    expect(api._gradeBand(69)).not.toBe(api._gradeBand(70));
    expect(api._gradeBand(89)).not.toBe(api._gradeBand(90));
    expect(api._gbDateStr(new Date(2026, 8, 3))).toMatch(/Sep/);
  });
});

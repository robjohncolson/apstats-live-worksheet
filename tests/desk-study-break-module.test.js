// desk-study-break-module.test.js — Study Break Tetris lives in js/desk-study-break.js
// (FABLE_SPRINT_2026_10_22C_SPEC.md track C3, the first phase-2 cut). Pins: the Desk loads it
// from the old position with the entry-script `?v=` stamp, nothing of it is left inline, the
// module still defines the same globals and the markup still reaches them, the PWA precache and
// bump-build list carry the file, and the module evaluates as a classic script.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskHtml, deskSource } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskHtml();
const MODULE = readFileSync(resolve(ROOT, 'js/desk-study-break.js'), 'utf8');
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BUMP = readFileSync(resolve(ROOT, 'scripts/bump-build.mjs'), 'utf8');

describe('Desk loads the Study Break module in place', () => {
  it('splits the inline script once more, between the PWA install hint and the My Progress module', () => {
    const tags = DESK.match(/<script src="js\/desk-study-break\.js\?v=[^"<>]+"><\/script>/g) || [];
    expect(tags.length).toBe(1);
    const at = DESK.indexOf(tags[0]);
    const stamp = /src="classroom-board\.js\?v=([^"]+)"/.exec(DESK)[1];
    expect(tags[0]).toContain('?v=' + stamp);
    expect(DESK.slice(at - 400, at)).toContain('</script>'); // the first inline block closes before it
    expect(at).toBeGreaterThan(DESK.indexOf('function _pwaInstallHelp()'));
    // The My Progress module follows directly (no empty inline block between them), then the
    // inline script reopens for the app launcher.
    const next = DESK.indexOf('<script', at + tags[0].length);
    expect(DESK.slice(next, next + 60)).toMatch(/^<script src="js\/desk-progress-app\.js\?v=/);
    const reopen = DESK.indexOf('<script>', next);
    expect(reopen).toBeGreaterThan(next);
    expect(DESK.slice(reopen, reopen + 200)).toContain('/* ═══ APP LAUNCHER ═══ */');
  });
  it('leaves nothing of the region inline', () => {
    for (const marker of ['/* ═══ STUDY BREAK: NEW TETRIS-STYLE ═══ */', 'const studyBreak = {', 'function openGame()', 'function closeGame()', 'window.studyBreak = studyBreak;']) {
      expect(DESK).not.toContain(marker);
      expect(MODULE).toContain(marker);
    }
    expect(deskSource()).toContain(MODULE); // the test helper still sees it in load order
  });
  it('keeps the HTML handlers that reach the module globals', () => {
    expect(DESK).toContain('onclick="closeMenus();openGame()"');
    expect(DESK).toContain('onclick="closeGame()"');
    expect(DESK).toContain('studyBreak.toggleMute()');
    expect(DESK).toContain('studyBreak.leaveLobby()');
  });
  it('is precached and versioned on bump-build', () => {
    const core = SW.slice(SW.indexOf('const CORE = ['), SW.indexOf('];', SW.indexOf('const CORE = [')));
    expect(core).toContain("'js/desk-study-break.js'");
    expect(BUMP).toContain("'js/desk-study-break.js'");
  });
});

describe('js/desk-study-break.js', () => {
  it('is plain classic-script JS: no imports, no strict pragma, and only declarations at the top level', () => {
    expect(MODULE.startsWith('/* ═══ STUDY BREAK: NEW TETRIS-STYLE ═══ */\n')).toBe(true);
    expect(MODULE.endsWith('window.studyBreak = studyBreak;\n')).toBe(true);
    expect(MODULE).not.toMatch(/^\s*(import|export)\s/m);
    expect(MODULE).not.toContain("'use strict'");
  });
  it('defines the same globals when evaluated as a classic script', () => {
    const sandbox = { window: {}, document: { getElementById: () => null, addEventListener() {} }, console, setTimeout, clearTimeout };
    sandbox.window.document = sandbox.document;
    const ctx = createContext(sandbox);
    runInContext(MODULE + '\nthis.__api = { studyBreak, openGame, closeGame };', ctx);
    const api = sandbox.__api;
    expect(typeof api.studyBreak.open).toBe('function');
    expect(typeof api.studyBreak.close).toBe('function');
    expect(typeof api.openGame).toBe('function');
    expect(typeof api.closeGame).toBe('function');
    expect(sandbox.window.studyBreak).toBe(api.studyBreak);
    // closeGame goes straight to studyBreak.close.
    const calls = [];
    api.studyBreak.close = function () { calls.push('close'); };
    api.closeGame();
    expect(calls).toEqual(['close']);
  });
});

// desk-teacher-dok-app.test.js — the Teacher menu opens the DOK ladders index inside the Desk.
// Why (teacher, 2026-09-12): "I won't be able to remember where the index.html is". The index is
// now an in-Desk app window reachable from the (role-gated) Teacher menu; the window is a clone of
// the TI-84 window so close / pop-out / minimize behave identically.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DESK = readFileSync(resolve('ap_stats_roadmap_square_mode.html'), 'utf8');

describe('Teacher menu → DOK ladders app window', () => {
  it('registers the dok app pointing at the GH Pages DOK index', () => {
    const reg = DESK.slice(DESK.indexOf('const APP_REGISTRY = {'), DESK.indexOf('function bumpUsage'));
    expect(reg).toMatch(/dok:\s*\{ url: 'https:\/\/robjohncolson\.github\.io\/apstats-live-worksheet\/dok\/index\.html', sfx: 'wildEep' \}/);
  });

  it('has an app window with the ids openApp/destroyApp/popOutApp/minimizeApp expect', () => {
    expect(DESK).toContain('id="app-dok-overlay"');
    expect(DESK).toContain('id="app-dok-frame"');
    const win = DESK.slice(DESK.indexOf('id="app-dok-overlay"'), DESK.indexOf('id="app-dok-frame"'));
    expect(win).toContain("destroyApp('dok')");
    expect(win).toContain("popOutApp('dok')");
    expect(win).toContain("minimizeApp('dok')");
    expect(win).toContain('DOK Ladders');
  });

  it('is reachable only from the role-gated Teacher menu', () => {
    const menu = DESK.slice(DESK.indexOf('id="menu-teacher"'), DESK.indexOf('data-menu="special"'));
    expect(menu).toContain('id="menu-dok-ladders"');
    expect(menu).toContain("openApp('dok')");
    // the Teacher menu itself stays hidden by default (role-gated)
    expect(DESK).toMatch(/id="menu-item-teacher" style="display:none"/);
    // and no student-facing menu links the dok app
    const before = DESK.slice(0, DESK.indexOf('id="menu-item-teacher"'));
    expect(before).not.toContain("openApp('dok')");
  });
});

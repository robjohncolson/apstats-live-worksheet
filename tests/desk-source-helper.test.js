// desk-source-helper.test.js — tests/helpers/desk-source.js is what lets the Desk's inline
// script be cut into js/desk-*.js modules without breaking the 130+ tests that pin a function by
// text (FABLE_SPRINT_2026_10_22C_SPEC.md track C3). Pins: deskSource() is every inline block plus
// every js/desk-*.js module in document order, deskHtml() is the raw file, and fnBody() finds a
// function whether it is still inline or already moved.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskSource, deskHtml, deskHtmlInlined, deskModulePaths, fnBody, fnBodyOf } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('deskHtml / deskSource', () => {
  it('deskHtml() is the raw Desk file', () => {
    expect(deskHtml()).toBe(readFileSync(resolve(ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf8'));
  });
  it('deskSource() holds no markup, every inline block, and every js/desk-*.js module the Desk loads', () => {
    const src = deskSource();
    expect(src).not.toContain('<!DOCTYPE');
    expect(src).not.toContain('</script>');
    expect(src).toContain('function showResourcePanel'); // inline, first block
    expect(src).toContain('/* ═══ INIT ═══ */'); // inline, last block
    const modules = deskModulePaths();
    expect(modules).toContain('js/desk-class-log.js');
    expect(modules).toContain('js/desk-progress-app.js');
    for (const path of modules) expect(src).toContain(readFileSync(resolve(ROOT, path), 'utf8'));
  });
  it('concatenates in document order: a module sits between the blocks that surround its <script src>', () => {
    const src = deskSource();
    const html = deskHtml();
    const before = html.indexOf('/* ═══ DIALOG ═══ */') < html.indexOf('js/desk-progress-app.js');
    expect(before).toBe(true);
    expect(src.indexOf('/* ═══ DIALOG ═══ */')).toBeLessThan(src.indexOf('const ProgressApp = {'));
    expect(src.indexOf('const ProgressApp = {')).toBeLessThan(src.indexOf('/* ═══ APP LAUNCHER ═══ */'));
  });
  it('deskHtmlInlined() pastes each js/desk-*.js back where its <script src> stood, leaving other src tags alone', () => {
    const inlined = deskHtmlInlined();
    expect(inlined).not.toMatch(/<script src="js\/desk-[^"]+"/);
    expect(inlined).toContain('<script src="classroom-board.js?v=');
    for (const path of deskModulePaths()) expect(inlined).toContain('<script>\n' + readFileSync(resolve(ROOT, path), 'utf8') + '</script>');
    // Same JS, same order, as deskSource().
    const inlineOnly = [...inlined.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    expect(inlineOnly.replace(/\s+/g, ' ')).toBe(deskSource().replace(/\s+/g, ' '));
  });
  it('is memoised (same string instance on every call)', () => {
    expect(deskSource()).toBe(deskSource());
    expect(deskHtml()).toBe(deskHtml());
  });
});

describe('fnBody', () => {
  it('finds a function that is still inline and one that already lives in a module', () => {
    expect(fnBody('showResourcePanel').startsWith('function showResourcePanel(')).toBe(true);
    expect(fnBody('openProgress')).toBe('function openProgress() { ProgressApp.open(); }');
  });
  it('skips braces in the parameter list and accepts async functions', () => {
    const src = 'async function a(x = {}) { return 1; }\nfunction b() {}';
    expect(fnBodyOf(src, 'a')).toBe('async function a(x = {}) { return 1; }');
    expect(fnBodyOf(src, 'b')).toBe('function b() {}');
    expect(() => fnBodyOf(src, 'zz')).toThrow(/not found/);
  });
});

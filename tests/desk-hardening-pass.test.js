// @vitest-environment node
// Hardening pass checks (2026-11-25):
//   1. Pico safety net: failed/missing pico-home.js removes html.pico-home instead of leaving a blank Desk.
//   2. Service worker precaches the 4 versioned entry scripts (incl. pico-home.js) for offline reloads.
//   3. Lesson URLs from the registry/database are escaped and unsafe schemes blocked via _resourcePanelSafeHref.
//   4. destroyApp('teachertools') delegates to destroyTeacherTools() so Esc and backdrop clicks clear polls/DOM.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { deskHtml, fnBody } from './helpers/desk-source.js';

const ROOT = resolve(__dirname, '..');
const HTML = deskHtml();
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const PICO = readFileSync(resolve(ROOT, 'pico-home.js'), 'utf8');

describe('Pico safety net + SW entry-script precache', () => {
  it('Desk removes html.pico-home if pico-home.js fails to load or leaves window.PicoHome unset', () => {
    expect(HTML).toMatch(/<script src="pico-home\.js(?:\?v=[^"]+)?" onerror="document\.documentElement\.classList\.remove\('pico-home'\)"><\/script>/);
    expect(HTML).toContain("if(document.documentElement.classList.contains('pico-home')&&!window.PicoHome)document.documentElement.classList.remove('pico-home');");
  });

  it('pico-home.js wraps init() so a boot throw falls back to the classic Desk cleanly', () => {
    expect(PICO).toContain('function bootPicoHome()');
    expect(PICO).toMatch(/catch\s*\(err\)\s*\{[\s\S]*?document\.documentElement\.classList\.remove\('pico-home'\)/);
  });

  it('sw.js precaches the four entry scripts (plain and ?v=BUILD)', () => {
    for (const file of ['canvas_engine.js', 'sprite_sheet.js', 'classroom-board.js', 'pico-home.js']) {
      expect(SW, file).toContain(`'${file}'`);
    }
    expect(SW).toMatch(/ENTRY_SCRIPTS\.includes\(u\)/);
  });
});

describe('Lesson URL escaping (_resourcePanelSafeHref)', () => {
  const ctx = createContext({});
  runInContext(fnBody('_resourcePanelEsc') + '\n' + fnBody('_resourcePanelSafeHref'), ctx);
  const safeHref = (u) => runInContext(`_resourcePanelSafeHref(${JSON.stringify(u)})`, ctx);

  it('keeps relative and http(s) URLs intact while HTML-escaping attributes', () => {
    expect(safeHref('u1_lesson1_live.html')).toBe('u1_lesson1_live.html');
    expect(safeHref('https://example.com/a?x=1&y=2')).toBe('https://example.com/a?x=1&amp;y=2');
    expect(safeHref('https://example.com/" onclick="alert(1)')).toBe('https://example.com/&quot; onclick=&quot;alert(1)');
  });

  it('blocks javascript:, data:, vbscript:, and protocol-relative URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(safeHref('  JaVaScRiPt:alert(1)')).toBe('');
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeHref('vbscript:msgbox(1)')).toBe('');
    expect(safeHref('//evil.example/x')).toBe('');
  });

  it('showResourcePanel routes registry and schoology URLs through _resourcePanelSafeHref', () => {
    const body = fnBody('showResourcePanel');
    expect(body).toContain('_resourcePanelSafeHref(u.worksheet)');
    expect(body).toContain('_resourcePanelSafeHref(u.quiz)');
    expect(body).toContain('_resourcePanelSafeHref(u.blooket)');
    expect(body).toContain('_resourcePanelSafeHref(_rpFolder)');
    expect(body).toContain('_resourcePanelSafeHref(b.url)');
    expect(body).toContain('_resourcePanelSafeHref(p.url)');
    expect(body).toContain('_resourcePanelEsc(p.label)');
  });
});

describe('Teacher Workspace cleanup via destroyApp (Esc + backdrop click)', () => {
  it('destroyApp("teachertools") delegates to destroyTeacherTools()', () => {
    const destroyTeacherTools = vi.fn();
    const ctx = createContext({
      destroyTeacherTools,
      document: { getElementById: () => { throw new Error('should delegate before touching app-teachertools-frame'); } },
    });
    runInContext(fnBody('destroyApp'), ctx);
    runInContext("destroyApp('teachertools')", ctx);
    expect(destroyTeacherTools).toHaveBeenCalledTimes(1);
  });
});

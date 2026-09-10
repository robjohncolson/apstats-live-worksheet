import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'teacher-dashboard.html'), 'utf8');
const source = readFileSync(resolve(root, 'teacher-worksheet-diagnostics.js'), 'utf8');
const windows = [];
const row = (extra = {}) => ({ studentId: 'student', realName: 'Test Student', username: 'test_login', deviceId: 'abcdef1234', worksheet: 'WS-U1L1', mode: 'student', outcome: 'loaded', downloaded: 37, saved: 37, matched: 37, restored: 37, edited: 0, filled: 37, fields: 40, build: 'test-build', observedAt: Date.now(), receivedAt: Date.now(), ...extra });
async function boot(fetch, credentials = true) {
  const dom = new JSDOM(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), { runScripts: 'outside-only', url: 'https://example.com', pretendToBeVisual: true });
  const w = dom.window; windows.push(w); w.setTimeout = setTimeout; w.clearTimeout = clearTimeout; w.setInterval = setInterval; w.fetch = fetch;
  w.eval(source); w.installWorksheetDiagnosticsPanel({ url: () => 'https://roster.example.com', headers: () => credentials ? { Authorization: 'Bearer teacher' } : {} });
  await vi.advanceTimersByTimeAsync(0); return w;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { windows.splice(0).forEach(w => w.close()); vi.clearAllTimers(); vi.useRealTimers(); });
describe('teacher worksheet report panel', () => {
  it('loads on boot and hides teacher previews until explicitly included', async () => {
    const w = await boot(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row(), row({ mode: 'teacher-preview', outcome: 'auth' })] }) }));
    const body = w.document.getElementById('worksheet-diagnostics-rows'); expect(body.children).toHaveLength(1); expect(body.textContent).toContain('showing saved: 37');
    const toggle = w.document.getElementById('worksheet-diagnostics-previews'); toggle.checked = true; toggle.dispatchEvent(new w.Event('change')); expect(body.children).toHaveLength(2); expect(body.textContent).toContain('TEACHER PREVIEW');
  });
  it('does not fetch without credentials', async () => { const f = vi.fn(); await boot(f, false); await vi.advanceTimersByTimeAsync(120000); expect(f).not.toHaveBeenCalled(); });
  it.each([401, 503])('stops automatic polling after %s and retries manually', async status => {
    const f = vi.fn().mockResolvedValue({ ok: false, status }); const w = await boot(f); await vi.advanceTimersByTimeAsync(120000); expect(f).toHaveBeenCalledTimes(1);
    w.document.getElementById('worksheet-diagnostics-refresh').click(); await vi.advanceTimersByTimeAsync(0); expect(f).toHaveBeenCalledTimes(2);
  });
  it('keeps the fetched section label, escapes student names and filters locally', async () => {
    let finish; const f = vi.fn(() => new Promise(r => { finish = r; })); const w = await boot(f);
    w.document.getElementById('section-filter').value = 'PeriodE';
    finish({ ok: true, json: async () => ({ ok: true, rows: [row({ realName: '<img src=x onerror=alert(1)>' })] }) }); await vi.advanceTimersByTimeAsync(0);
    expect(w.document.getElementById('worksheet-diagnostics-rows').querySelector('img')).toBeNull(); expect(w.document.getElementById('worksheet-diagnostics-meta').textContent).not.toContain('PeriodE');
    const input = w.document.getElementById('worksheet-diagnostics-search'); input.value = 'nobody'; input.dispatchEvent(new w.Event('input')); expect(w.document.getElementById('worksheet-diagnostics-rows').children).toHaveLength(0);
  });
  it('distinguishes missing display, true empty history and recovered failures', async () => {
    const w = await boot(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row({ matched: 0 }), row({ outcome: 'empty', saved: 0, matched: 0 }), row({ lastFailure: { outcome: 'auth' } })] }) }));
    const text = w.document.getElementById('worksheet-diagnostics-rows').textContent; expect(text).toContain('Check display'); expect(text).toContain('Server confirmed no saved answers'); expect(text).toContain('Recovered after Sign-in rejected');
  });
});

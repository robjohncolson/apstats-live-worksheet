// railway-leg-off.test.js — simplify plan D3: the worksheet's second write (to the
// answer server) is off. A worksheet page that loads railway_config.js and
// railway_client.js opens no socket, makes no health check and posts no answer;
// the per-blank "Class" chart button and drawer are hidden; the save chain still
// resolves; and RAILWAY_SERVER_URL stays defined (AI grading and the hourly FRQ
// regrade still use it).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');
const windows = [];
afterEach(() => { for (const w of windows.splice(0)) w.close(); vi.useRealTimers(); });

function bootWorksheetShell() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body>' +
    '<div class="question"><input class="blank"><button class="aggregate-trigger">Class</button></div>' +
    '<div class="aggregate-drawer" id="aggregateDrawer"></div></body></html>',
    { url: 'https://example.com/u1_lesson1_live.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; windows.push(w);
  w.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  w.WebSocket = vi.fn();
  w.eval(read('railway_config.js'));
  w.eval(read('railway_client.js'));
  return w;
}

describe('answer-server leg off (D3)', () => {
  it('is switched off in the shared config, and the server URL stays defined', () => {
    const w = bootWorksheetShell();
    expect(w.USE_RAILWAY).toBe(false);
    expect(typeof w.RAILWAY_SERVER_URL).toBe('string');
    expect(w.RAILWAY_SERVER_URL.length).toBeGreaterThan(10);
  });

  it('no socket, no health check, no answer POST; the save chain still resolves', async () => {
    vi.useFakeTimers();
    const w = bootWorksheetShell();
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(5000);
    const sent = await w.railwayClient.submitAnswer('WS-U1L1-Q1', 'mean', 'student_user');
    expect(sent).toBeFalsy();
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.WebSocket).not.toHaveBeenCalled();
  });

  it('hides the per-blank Class button and the drawer', () => {
    const w = bootWorksheetShell();
    const style = w.document.getElementById('railway-off-hide-class-chart');
    expect(style).not.toBeNull();
    expect(w.getComputedStyle(w.document.querySelector('.aggregate-trigger')).display).toBe('none');
    expect(w.getComputedStyle(w.document.getElementById('aggregateDrawer')).display).toBe('none');
  });

  it('keeps the window.railwayClient export (68 worksheets would otherwise POST directly)', () => {
    const w = bootWorksheetShell();
    expect(typeof w.railwayClient.submitAnswer).toBe('function');
    expect(typeof w.railwayClient.getStats).toBe('function');
  });
});

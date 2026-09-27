// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'dok/index.html'), 'utf8');
const MANIFEST = { '1.3': { title: 'Sheet one', misconceptions: ['label:one'], generated: { on: '2026-09-18' } } };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const doms = [];
afterEach(() => { while (doms.length) doms.pop().window.close(); });

// Loads the page with a stubbed fetch; `agent(url, options)` answers the loopback calls.
function load(search, agent) {
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://robjohncolson.github.io/apstats-live-worksheet/dok/index.html' + search,
    beforeParse(window) {
      window.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || 'GET' });
        if (String(url).startsWith('manifest.json')) return reply(200, MANIFEST);
        if (!agent) throw new Error('no agent expected');
        return agent(String(url), options);
      };
    },
  });
  doms.push(dom);
  return { dom, doc: dom.window.document, calls };
}

async function until(check, ms = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise(r => setTimeout(r, 10));
  }
}

const HEALTHY = url => {
  if (url === 'http://127.0.0.1:47831/health') {
    return reply(200, { ok: true, agent: 'slips', version: '1', lastRun: { at: '2026-09-28T09:00:00.000Z', counts: { B: 5, E: 4 }, out: 'C:\\x' } });
  }
  throw new Error('unexpected ' + url);
};

describe('DOK index teacher panel (SLIPS_V2_SPEC §3)', () => {
  it('never appears without ?teacher=1 and never calls the loopback agent', async () => {
    const { doc, calls } = load('', null);
    await until(() => doc.querySelectorAll('article').length === 1);
    expect(doc.getElementById('slips-panel')).toBeNull();
    expect(calls.every(call => call.url.startsWith('manifest.json'))).toBe(true);
    const other = load('?teacher=0', null);
    await until(() => other.doc.querySelectorAll('article').length === 1);
    expect(other.doc.getElementById('slips-panel')).toBeNull();
  });

  it('renders above the sheet list and shows the last printed line when the agent answers', async () => {
    const { doc, calls } = load('?teacher=1', HEALTHY);
    const panel = doc.getElementById('slips-panel');
    expect(panel).not.toBeNull();
    expect(panel.querySelector('h2').textContent).toBe('Slips \u2014 students who are falling behind');
    expect(panel.textContent).toContain('Paper "where you stand" slips for anyone under 70% or with a 0 counting.');
    expect(doc.querySelector('main').firstElementChild).toBe(panel);
    await until(() => !doc.getElementById('slips-print').disabled);
    expect(doc.getElementById('slips-status').textContent).toMatch(/^Last printed (Sun|Mon|Tue|Wed|Thu|Fri|Sat) 9\/2[78] \d\d:\d\d: B 5 \u00b7 E 4$/);
    expect(calls.map(call => call.url)).toContain('http://127.0.0.1:47831/health');
    // Only the manifest and the loopback agent are ever fetched.
    expect(calls.every(call => call.url.startsWith('manifest.json') || call.url.startsWith('http://127.0.0.1:47831/'))).toBe(true);
  });

  it('disables the button and shows the start hint when /health fails', async () => {
    const { doc } = load('?teacher=1', async () => { throw new TypeError('Failed to fetch'); });
    const status = doc.getElementById('slips-status');
    await until(() => status.textContent.length > 0);
    expect(doc.getElementById('slips-print').disabled).toBe(true);
    expect(status.textContent).toBe('The print agent is not running on this computer. Start it: powershell -NoProfile -File tools/register_slips_agent_task.ps1 (one time), or node tools/slips-agent.mjs.');
  });

  it('treats a /health that never answers within 1.5 s as not running', async () => {
    const { doc } = load('?teacher=1', () => new Promise(() => {}));
    const status = doc.getElementById('slips-status');
    await until(() => status.textContent.length > 0, 4000);
    expect(status.textContent).toContain('The print agent is not running on this computer.');
    expect(doc.getElementById('slips-print').disabled).toBe(true);
  });

  it('POSTs /slips and shows the printed line on success', async () => {
    const { doc, calls } = load('?teacher=1', (url, options) => {
      if (url.endsWith('/slips') && options.method === 'POST') {
        return reply(200, { ok: true, counts: { B: 5, E: 4 }, out: 'C:\\Users\\t\\grade-backups\\slips', pdfs: [] });
      }
      return HEALTHY(url);
    });
    const button = doc.getElementById('slips-print');
    await until(() => !button.disabled);
    button.click();
    const status = doc.getElementById('slips-status');
    await until(() => status.textContent.startsWith('Printed'));
    expect(status.textContent).toBe('Printed B 5 \u00b7 E 4 \u2192 C:\\Users\\t\\grade-backups\\slips (opened)');
    expect(calls.filter(call => call.method === 'POST').map(call => call.url)).toEqual(['http://127.0.0.1:47831/slips']);
    await until(() => !button.disabled);
  });

  it('says "Already running…" on 409 and shows the error text on failure', async () => {
    let answer = reply(409, { ok: false, error: 'busy' });
    const { doc } = load('?teacher=1', (url, options) => (options.method === 'POST' ? answer : HEALTHY(url)));
    const button = doc.getElementById('slips-print');
    const status = doc.getElementById('slips-status');
    await until(() => !button.disabled);
    button.click();
    await until(() => status.textContent === 'Already running\u2026');
    await until(() => !button.disabled);
    answer = reply(500, { ok: false, error: 'PeriodB: pdflatex failed; inspect the log', stderr: [] });
    button.click();
    await until(() => status.textContent === 'PeriodB: pdflatex failed; inspect the log');
  });
});

/**
 * status.html (FABLE_SPRINT_2026_10_22B_SPEC track K): the "Is everything up?"
 * page. Structure (public endpoints present, no secrets, linked from the teacher
 * dashboard and not the landing page, fetches once and never polls) and a
 * fetch-stubbed render: one healthy source and one failing source.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const PAGE = read('status.html');

const URLS = {
  roster: 'https://roster-production-12c1.up.railway.app/health',
  cr: 'https://curriculumrender-production.up.railway.app/health',
  a2: 'https://a2-live-worksheets-production.up.railway.app/health',
  pages: 'https://robjohncolson.github.io/apstats-live-worksheet/version.json',
  vercel: 'https://apstats-live-worksheet.vercel.app/version.json',
  ci: 'https://api.github.com/repos/robjohncolson/apstats-live-worksheet/actions/workflows/ci.yml/runs?per_page=1',
};

const SHA = 'c9350587ea5397aa6a34eeb8e58781cb3dc60d4d';
const NOW = Date.parse('2026-10-22T15:20:00Z');

function healthy() {
  return {
    [URLS.roster]: { ok: true, service: 'roster', time: '2026-10-22T15:19:50Z', receipts: { enabled: true, persistFailures: 0 }, commit: SHA,
      frq: { mode: 'authoritative', storage: { degraded: false }, worker: { mode: 'authoritative' } } },
    [URLS.cr]: { status: 'healthy', connections: 10, cache: 'cold', aiGradeAuth: 'log', timestamp: '2026-10-22T15:19:51Z' },
    [URLS.a2]: { ok: true, service: 'roster', time: '2026-10-22T15:19:52Z', receipts: { persistFailures: 0 }, commit: '742ed62',
      frq: { mode: 'off', storage: { degraded: false }, worker: { mode: 'off' } } },
    [URLS.pages]: { build: '2026-10-22-reqs', ts: NOW - 3 * 3600 * 1000 },
    [URLS.vercel]: { build: '2026-10-22-reqs', ts: NOW - 3 * 3600 * 1000 },
    [URLS.ci]: { workflow_runs: [{ run_number: 532, head_branch: 'master', head_sha: SHA, status: 'completed', conclusion: 'success',
      updated_at: '2026-10-22T15:00:00Z', html_url: 'https://github.com/robjohncolson/apstats-live-worksheet/actions/runs/1' }] },
  };
}

/** Boots the page with fetch stubbed from a url -> body map (a thrown value fails that url). */
async function boot(bodies) {
  const calls = [];
  const dom = new JSDOM(PAGE, {
    runScripts: 'dangerously',
    url: 'https://robjohncolson.github.io/apstats-live-worksheet/status.html',
    beforeParse(window) {
      window.__STATUS_NO_AUTOLOAD = true;
      window.AbortController = undefined;
      // The fixtures carry fixed timestamps; freeze the page's clock at NOW so
      // "age" stays in seconds/minutes no matter when the suite runs.
      window.Date.now = () => NOW;
      window.fetch = async (url) => {
        calls.push(url);
        const body = bodies[url];
        if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
        if (body instanceof Error) throw body;
        return { ok: true, status: 200, json: async () => body };
      };
    },
  });
  const tiles = await dom.window.StatusPage.load();
  return { dom, tiles, calls, doc: dom.window.document };
}

describe('status.html structure', () => {
  it('names every public endpoint from the spec and nothing secret', () => {
    for (const url of Object.values(URLS)) expect(PAGE).toContain(url);
    expect(PAGE).not.toMatch(/x-teacher-secret|service_role|Authorization|localStorage/i);
  });

  it('fetches once per load and never polls (GitHub API is rate-limited)', () => {
    expect(PAGE).not.toMatch(/setInterval/);
    expect(PAGE).toMatch(/no-store/);
    expect(PAGE).toMatch(/__STATUS_NO_AUTOLOAD/);
  });

  it('uses the Tango token block other non-Desk pages use', () => {
    expect(PAGE).toContain('--sg-bg: #E5E3D2');
    expect(PAGE).toContain('--sg-accent: #A8330A');
    expect(PAGE).toContain('#FF5B19');
    expect(PAGE).toContain('width=device-width');
  });

  it('is linked from the teacher dashboard header, not from index.html', () => {
    const dash = read('teacher-dashboard.html');
    const headerStart = dash.indexOf('<div class="page-header">');
    const headerEnd = dash.indexOf('</div>', headerStart);
    expect(dash.slice(headerStart, headerEnd)).toContain('href="status.html"');
    expect(read('index.html')).not.toContain('status.html');
  });
});

describe('status.html render (stubbed fetch)', () => {
  it('fetches each source exactly once', async () => {
    const { calls } = await boot(healthy());
    expect(calls.sort()).toEqual(Object.values(URLS).sort());
  });

  it('paints every tile green with value + age + rule when all sources are healthy', async () => {
    const { doc, tiles } = await boot(healthy());
    expect(tiles.map((t) => t.state)).toEqual(['green', 'green', 'green', 'green', 'green', 'green']);
    const roster = doc.getElementById('tile-roster');
    expect(roster.getAttribute('data-state')).toBe('green');
    expect(roster.querySelector('.value').textContent).toBe('commit c935058');
    expect(roster.querySelector('.detail').textContent).toContain('FRQ worker: authoritative');
    expect(roster.querySelector('.detail').textContent).toContain('persistFailures: 0');
    expect(roster.querySelector('.age').textContent).toMatch(/age: \d+ (s|min) ago/);
    expect(roster.querySelector('.light').getAttribute('title')).toMatch(/^Green: .*Amber: .*Red: /);
    expect(doc.getElementById('tile-cr').querySelector('.detail').textContent).toContain('connections: 10');
    expect(doc.getElementById('tile-ci').querySelector('.value').textContent).toBe('success');
    expect(doc.getElementById('summary').textContent).toBe('Everything is up.');
    expect(doc.querySelectorAll('.tile').length).toBe(6);
  });

  it('paints a failing endpoint red and keeps the others green', async () => {
    const bodies = healthy();
    bodies[URLS.cr] = new Error('Failed to fetch');
    const { doc, tiles } = await boot(bodies);
    const cr = doc.getElementById('tile-cr');
    expect(cr.getAttribute('data-state')).toBe('red');
    expect(cr.querySelector('.value').textContent).toBe('no answer');
    expect(cr.querySelector('.detail').textContent).toBe('Failed to fetch');
    expect(tiles.filter((t) => t.state === 'green').length).toBe(5);
    expect(doc.getElementById('summary').textContent).toContain('1 down');
  });

  it('paints amber for persist failures, a stale mirror, a running CI, and a deploy behind CI', async () => {
    const bodies = healthy();
    bodies[URLS.roster].receipts.persistFailures = 2;
    bodies[URLS.vercel].build = '2026-10-21-old';
    bodies[URLS.ci].workflow_runs[0].status = 'in_progress';
    const { tiles } = await boot(bodies);
    const by = Object.fromEntries(tiles.map((t) => [t.id, t]));
    expect(by.roster.state).toBe('amber');
    expect(by.roster.detail).toContain('persistFailures 2');
    expect(by.vercel.state).toBe('amber');
    expect(by.ci.state).toBe('amber');

    const behind = healthy();
    behind[URLS.roster].commit = 'deadbeef0000000000000000000000000000beef';
    const lag = Object.fromEntries((await boot(behind)).tiles.map((t) => [t.id, t]));
    expect(lag.roster.state).toBe('amber');
    expect(lag.roster.detail).toContain('deploy behind CI head c935058');
  });

  it('renders hostile remote text as text, never as markup (branch names, status strings, error text)', async () => {
    // Review D1 2026-10-22: every tile value/detail went through innerHTML unescaped; a PR
    // from a fork names its own head_branch, and a service's status string is remote data.
    const bodies = healthy();
    bodies[URLS.ci].workflow_runs[0].head_branch = '<img src=x onerror="window.__pwned=1">';
    bodies[URLS.ci].workflow_runs[0].html_url = 'javascript:alert(1)';
    bodies[URLS.cr].status = '<b id="injected-status">healthy</b>';
    bodies[URLS.pages] = new Error('<script id="injected-error">x</script>');
    const { doc, dom } = await boot(bodies);
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.getElementById('injected-status')).toBeNull();
    expect(doc.getElementById('injected-error')).toBeNull();
    expect(dom.window.__pwned).toBeUndefined();
    expect(doc.getElementById('tile-ci').textContent).toContain('<img src=x onerror=');
    expect(doc.getElementById('tile-ci').querySelector('a[href^="javascript:"]')).toBeNull();
    expect(doc.getElementById('tile-cr').textContent).toContain('<b id="injected-status">');
  });

  it('paints a failed CI run red', async () => {
    const bodies = healthy();
    bodies[URLS.ci].workflow_runs[0].conclusion = 'failure';
    const { tiles } = await boot(bodies);
    expect(tiles.find((t) => t.id === 'ci').state).toBe('red');
  });
});

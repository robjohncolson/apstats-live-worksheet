// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, parseSummary, readLastRun, SLIPS_AGENT_PORT } from '../tools/slips-agent.mjs';

const SUMMARY = [
  'PeriodB: 5 candidates -> C:\\Users\\t\\grade-backups\\slips\\2026-09-28-PeriodB-slips.pdf',
  'PeriodE: 4 candidates -> C:\\Users\\t\\grade-backups\\slips\\2026-09-28-PeriodE-slips.pdf',
  'Slips: 9 printed candidates (B 5, E 4) -> C:\\Users\\t\\grade-backups\\slips',
].join('\n');

const servers = [];
async function start(opts) {
  const server = createServer({ logFile: null, weeklyLog: null, openFolder: () => {}, outDir: path.join(os.tmpdir(), 'no-such-slips-dir'), ...opts });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  while (servers.length) await new Promise(resolve => servers.pop().close(resolve));
});

const post = (base, body, headers = {}) => fetch(base + '/slips', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe('slips agent', () => {
  it('listens on 47831 by default', () => {
    expect(SLIPS_AGENT_PORT).toBe(47831);
  });

  it('answers /health with the documented shape', async () => {
    const base = await start({});
    const response = await fetch(base + '/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, agent: 'slips', version: '1', lastRun: null });
  });

  it('echoes only allowed origins, handles preflight, and rejects the rest with 403', async () => {
    const base = await start({});
    for (const origin of ['https://robjohncolson.github.io', 'https://apstats-live-worksheet.vercel.app', 'http://localhost:8080', 'http://127.0.0.1:5500', 'http://localhost']) {
      const response = await fetch(base + '/health', { headers: { Origin: origin } });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('vary')).toBe('Origin');
      const preflight = await fetch(base + '/slips', { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
        'Access-Control-Request-Private-Network': 'true' } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
      expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
      expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');
    }
    for (const origin of ['https://evil.example', 'https://robjohncolson.github.io.evil.example', 'http://robjohncolson.github.io',
      'https://localhost:8080', 'http://localhost.evil.example', 'null']) {
      const response = await fetch(base + '/health', { headers: { Origin: origin } });
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      const preflight = await fetch(base + '/slips', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
      expect(preflight.status).toBe(403);
      const denied = await post(base, {}, { Origin: origin });
      expect(denied.status).toBe(403);
    }
  });

  it('POST runs the script once, parses the summary, opens the folder, and says busy while running', async () => {
    const calls = [];
    const opened = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const base = await start({
      openFolder: folder => opened.push(folder),
      runSlips: async args => { calls.push(args); await gate; return { code: 0, stdout: SUMMARY, stderr: '' }; },
    });
    const first = post(base, { section: 'PeriodB', all: true }, { Origin: 'https://robjohncolson.github.io' });
    await new Promise(resolve => setTimeout(resolve, 50));
    const second = await post(base, {});
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ ok: false, error: 'busy' });
    release();
    const response = await first;
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://robjohncolson.github.io');
    expect(await response.json()).toEqual({
      ok: true, counts: { B: 5, E: 4 }, out: 'C:\\Users\\t\\grade-backups\\slips',
      pdfs: ['C:\\Users\\t\\grade-backups\\slips\\2026-09-28-PeriodB-slips.pdf', 'C:\\Users\\t\\grade-backups\\slips\\2026-09-28-PeriodE-slips.pdf'],
    });
    expect(calls).toEqual([['--section', 'PeriodB', '--all']]);
    expect(opened).toEqual(['C:\\Users\\t\\grade-backups\\slips']);
    // Free again after the run; an empty body means both sections.
    const third = await fetch(base + '/slips', { method: 'POST' });
    expect(third.status).toBe(200);
    expect(calls[1]).toEqual([]);
  });

  it('returns 500 with a fixed message on failure — never the script output (it can hold student data)', async () => {
    const stderr = Array.from({ length: 30 }, (_, index) => `line ${index + 1} Zoe Chavez 0`).join('\n');
    const logFile = path.join(os.tmpdir(), 'slips-agent-test-' + process.pid + '.log');
    const base = await start({ runSlips: async () => ({ code: 1, stdout: '', stderr }), logFile });
    const response = await fetch(base + '/slips', { method: 'POST', headers: { Origin: 'https://robjohncolson.github.io', 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(500);
    const body = await response.json();
    const text = JSON.stringify(body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('The slips build failed. Details are in tools/.slips-agent-logs/agent.log on this computer.');
    expect(body.stderr).toBeUndefined();
    expect(text).not.toContain('Zoe');
    expect(text).not.toContain('line 30');
    expect(fs.readFileSync(logFile, 'utf8')).toContain('line 30');        // the detail went to the private log
  });

  it('validates section against ^Period[A-Z]$ and the body shape before anything runs', async () => {
    const calls = [];
    const base = await start({ runSlips: async args => { calls.push(args); return { code: 0, stdout: SUMMARY, stderr: '' }; } });
    for (const body of [{ section: 'B' }, { section: 'PeriodB; calc' }, { section: 'periodB' }, { section: 'PeriodBB' },
      { section: '--all' }, { section: 7 }, { all: 'yes' }, ['PeriodB'], 'PeriodB']) {
      const response = await post(base, body);
      expect(response.status).toBe(400);
    }
    const broken = await fetch(base + '/slips', { method: 'POST', body: '{not json' });
    expect(broken.status).toBe(400);
    expect(calls).toEqual([]);
    expect((await post(base, { section: 'PeriodE' })).status).toBe(200);
    expect(calls).toEqual([['--section', 'PeriodE']]);
  });

  it('rejects a non-loopback Host header (DNS rebinding) and unknown paths', async () => {
    const base = await start({});
    const http = await import('node:http');
    const port = new URL(base).port;
    const status = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/health', headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    expect(status).toBe(403);
    expect((await fetch(base + '/nope')).status).toBe(404);
  });

  it('parses the summary line and reads lastRun from the newest PDF + weekly.log', () => {
    expect(parseSummary(SUMMARY)).toMatchObject({ counts: { B: 5, E: 4 }, out: 'C:\\Users\\t\\grade-backups\\slips' });
    expect(parseSummary('Slips: 5 TeX-only candidates (B 5) -> /tmp/x')).toMatchObject({ counts: { B: 5 }, out: '/tmp/x', pdfs: [] });
    expect(parseSummary('no summary')).toBeNull();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slips-agent-'));
    expect(readLastRun({ outDir: dir, weeklyLog: path.join(dir, 'weekly.log') })).toBeNull();
    fs.writeFileSync(path.join(dir, '2026-09-28-PeriodB-slips.pdf'), '');
    fs.writeFileSync(path.join(dir, 'weekly.log'), 'Slips: 1 printed candidates (B 1, E 0) -> old\nSlips: 9 printed candidates (B 5, E 4) -> ' + dir + '\n');
    const when = new Date('2026-09-28T09:00:00Z');
    fs.utimesSync(path.join(dir, '2026-09-28-PeriodB-slips.pdf'), when, when);
    expect(readLastRun({ outDir: dir, weeklyLog: path.join(dir, 'weekly.log') })).toEqual({ at: when.toISOString(), counts: { B: 5, E: 4 }, out: dir });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

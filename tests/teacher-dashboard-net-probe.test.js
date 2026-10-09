// The teacher dashboard "Network" panel (NET_PROBE_SPEC.md): one table from GET /class/net-probes.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('teacher-dashboard.html'), 'utf8');
const panel = html.slice(html.indexOf('// BEGIN NETWORK PROBE PANEL'), html.indexOf('// END NETWORK PROBE PANEL'));
const cell = (o) => ({
  samples: 0, students: 0, medianRttRoster: null, medianRttRelay: null, peerFound: 0, p2pConnected: null,
  connectedRuns: 0, hostHost: null, gatheredRuns: 0, mdnsSeen: null, srflxOnly: null, policyBlocked: null, ...o,
});
const fixture = {
  ok: true, enabled: true,
  summary: [{
    section: '<b>PeriodB</b>',
    inSchool: cell({ samples: 4, students: 3, medianRttRoster: 41.6, medianRttRelay: 60, peerFound: 2, p2pConnected: 0.5, connectedRuns: 1, hostHost: 1, gatheredRuns: 4, mdnsSeen: 0.75, srflxOnly: 0, policyBlocked: 0.25 }),
    atHome: cell({}),
  }],
  rows: [],
};
let load, fetchJson;

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(parsed.getElementById('net-probe-section'));
  for (const [id, tag] of [['section-filter', 'select'], ['load-btn', 'button']]) {
    const node = document.createElement(tag); node.id = id; document.body.appendChild(node);
  }
  fetchJson = vi.fn(async () => ({ status: 200, data: structuredClone(fixture) }));
  load = new Function('$', 'fetchJson', 'teacherSecret', panel + ';return loadNetProbes;')(
    id => document.getElementById(id), fetchJson, () => 'fixture-secret');
});

describe('teacher Network panel', () => {
  it('renders one row per section × place with samples, medians and rates (text only)', async () => {
    await load();
    expect(fetchJson.mock.calls[0][0]).toBe('/class/net-probes?section=&days=14');
    const rows = [...document.querySelectorAll('#net-probe-tbody tr')];
    expect(rows).toHaveLength(1);   // at-home cell has no samples
    expect([...rows[0].children].map(td => td.textContent)).toEqual([
      '<b>PeriodB</b>', 'In school', '4', '3', '42 ms', '60 ms', '50% (n=2)', '100% (n=1)', '75% (n=4)', '0% (n=1)', '25% (n=4)',
    ]);
    expect(document.querySelector('#net-probe-tbody b')).toBeNull();
    expect(document.getElementById('net-probe-wrap').hidden).toBe(false);
  });

  it('503 tells the teacher to run migration 0040', async () => {
    fetchJson.mockResolvedValueOnce({ status: 503, data: { ok: false } });
    await load();
    expect(document.getElementById('net-probe-status').textContent).toMatch(/0040_net_probes\.sql/);
    expect(document.getElementById('net-probe-wrap').hidden).toBe(true);
  });

  it('empty window says so', async () => {
    fetchJson.mockResolvedValueOnce({ status: 200, data: { ok: true, enabled: true, summary: [], rows: [] } });
    await load();
    expect(document.getElementById('net-probe-status').textContent).toBe('No probe runs in this window yet.');
  });
});

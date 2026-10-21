// The teacher dashboard "Progress Check completeness" panel (PC_FOLLOWTHROUGH_SPEC.md section 5):
// GET /pc/parts (posted rows) overlaid with GET /pc/status (the AP Classroom snapshot).
// Fixture payloads use fake usernames only.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('teacher-dashboard.html'), 'utf8');
const panel = html.slice(html.indexOf('// BEGIN PC COMPLETENESS PANEL'), html.indexOf('// END PC COMPLETENESS PANEL'));

const posted = (points, of, extra = {}) => ({ score: points / of, points, of, origin: 'apclassroom', postedAt: '2026-10-20T23:10:00Z', note: null, ...extra });

const partsPayload = {
  ok: true, section: 'PeriodE', unit: 1,
  students: [
    { username: 'pear_cat', studentId: 'sid-pear', pct: 92.6,
      parts: { A: posted(18, 18, { origin: 'paper' }), B: posted(13, 14), C: posted(12, 12), FRQ: posted(14, 16) } },
    { username: 'plum_owl', studentId: 'sid-plum', pct: 25,
      parts: { A: posted(9, 18, { origin: 'paper' }),
        B: posted(0, 14, { note: '<img src=x onerror="alert(1)">Not submitted by 2026-10-23: scored 0.', postedAt: '2026-10-24T21:00:00Z' }) } },
    { username: 'fig_fox', studentId: 'sid-fig', pct: null, parts: {} },
  ],
};

const statusPayload = {
  ok: true, section: 'PeriodE', unit: 1, updatedAt: '2026-10-20T23:15:00Z',
  status: {
    fetchedAt: '2026-10-20T23:00:00Z', closeDate: '2026-10-24', unmatched: 0, excluded: 0,
    assignments: { B: '81743327', C: '81743453', FRQ: '81743492' },
    students: {
      plum_owl: { C: { status: 'in_progress' }, FRQ: { status: 'submitted', submittedAt: '10/19 02:16 PM' } },
      fig_fox: { B: { status: 'scored', points: 12, of: 14 } },
    },
  },
};

let load, fetchJson;

function respond(parts, status) {
  fetchJson.mockImplementation(async (path) => (path.startsWith('/pc/parts') ? parts : status));
}

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(parsed.getElementById('pc-completeness-section'));
  for (const [id, tag] of [['section-filter', 'input'], ['load-btn', 'button']]) {
    const node = document.createElement(tag); node.id = id; document.body.appendChild(node);
  }
  document.getElementById('section-filter').value = 'PeriodE';
  fetchJson = vi.fn();
  respond({ status: 200, data: structuredClone(partsPayload) }, { status: 200, data: structuredClone(statusPayload) });
  const studentNameElement = (stub) => {
    const b = document.createElement('button');
    b.className = 'student-name';
    b.textContent = stub.realName;
    return b;
  };
  load = new Function('$', 'fetchJson', 'teacherSecret', '_pcNameMap', 'studentNameElement', panel + ';return loadPcCompleteness;')(
    (id) => document.getElementById(id), fetchJson, () => 'fixture-secret', () => ({ pear_cat: 'Pear Cat' }), studentNameElement);
});

function rows() {
  return [...document.querySelectorAll('#pc-comp-tbody tr')].map((tr) => [...tr.children]);
}

describe('Progress Check completeness panel', () => {
  it('asks /pc/parts and /pc/status for the section + unit', async () => {
    await load();
    expect(fetchJson.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/pc/parts?section=PeriodE&unit=1', '/pc/status?section=PeriodE&unit=1',
    ]);
    expect(document.getElementById('pc-comp-meta').textContent).toContain('AP Classroom snapshot from 2026-10-20T23:00:00Z');
  });

  it('sorts by PC % ascending (no PC at all first)', async () => {
    await load();
    expect(rows().map((r) => r[0].textContent)).toEqual(['fig_fox', 'plum_owl', 'Pear Cat']);
    expect(rows().map((r) => r[5].textContent)).toEqual(['\u2014', '25', '92.6']);
  });

  it('renders the five cell states', async () => {
    await load();
    const [fig, plum, pear] = rows();
    // posted, with origin + postedAt in the title
    expect(pear[2].textContent).toBe('13/14');
    expect(pear[2].title).toBe('apclassroom \u00b7 2026-10-20T23:10:00Z');
    expect(pear[1].title).toMatch(/^paper/);
    // zeroed
    expect(plum[2].textContent).toBe('0/14');
    expect(plum[2].className).toBe('pc-zero');
    // scored in AP Classroom, not posted
    expect(fig[2].textContent).toBe('12/14 \u00b7 not posted');
    expect(fig[2].className).toBe('pc-pending');
    // submitted, unscored FRQ
    expect(plum[4].textContent).toBe('needs scoring');
    expect(plum[4].className).toBe('pc-needs-scoring');
    // in progress, and nothing at all
    expect(plum[3].textContent).toBe('in progress');
    expect(fig[1].textContent).toBe('\u2014');
  });

  it('a note is text only (no HTML injected)', async () => {
    await load();
    const plum = rows()[1];
    expect(plum[6].textContent).toBe('<img src=x onerror="alert(1)">Not submitted by 2026-10-23: scored 0.');
    expect(document.querySelector('#pc-comp-tbody img')).toBeNull();
  });

  it('503 on /pc/status shows the migration hint and still renders the posted rows', async () => {
    respond({ status: 200, data: structuredClone(partsPayload) }, { status: 503, data: { ok: false, error: 'run migration 0043' } });
    await load();
    expect(document.getElementById('pc-comp-meta').textContent).toMatch(/0043_pc_status\.sql/);
    expect(rows()).toHaveLength(3);
    expect(rows()[0][2].textContent).toBe('\u2014');   // no snapshot overlay
  });

  it('503 on /pc/parts shows a hint, not an error banner', async () => {
    respond({ status: 503, data: { ok: false } }, { status: 503, data: { ok: false } });
    await load();
    expect(document.getElementById('pc-comp-meta').textContent).toMatch(/Not provisioned yet/);
    expect(document.getElementById('pc-comp-wrap').hidden).toBe(true);
  });

  it('no snapshot yet says how to make one', async () => {
    respond({ status: 200, data: structuredClone(partsPayload) }, { status: 200, data: { ok: true, status: null } });
    await load();
    expect(document.getElementById('pc-comp-meta').textContent).toContain('No snapshot yet: run tools/apclassroom_pc_reconcile.py');
  });

  it('unsent reminder drafts show "N reminder drafts waiting (drafted <date>)"', async () => {
    const withDrafts = structuredClone(statusPayload);
    withDrafts.status.reminders = { draftedAt: '2026-10-22T20:05:00Z', count: 3, sent: false };
    respond({ status: 200, data: structuredClone(partsPayload) }, { status: 200, data: withDrafts });
    await load();
    const line = document.getElementById('pc-comp-reminders');
    expect(line.hidden).toBe(false);
    expect(line.textContent).toBe('3 reminder drafts waiting (drafted 2026-10-22)');
  });

  it('sent reminders (or none) hide the line', async () => {
    await load();
    expect(document.getElementById('pc-comp-reminders').hidden).toBe(true);
    const sent = structuredClone(statusPayload);
    sent.status.reminders = { draftedAt: '2026-10-22T20:05:00Z', count: 3, sent: true };
    respond({ status: 200, data: structuredClone(partsPayload) }, { status: 200, data: sent });
    await load();
    expect(document.getElementById('pc-comp-reminders').hidden).toBe(true);
  });

  it('no section typed -> asks for one and fetches nothing', async () => {
    document.getElementById('section-filter').value = '';
    await load();
    expect(fetchJson).not.toHaveBeenCalled();
    expect(document.getElementById('pc-comp-meta').textContent).toMatch(/section/);
  });
});

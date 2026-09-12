import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('teacher-dashboard.html'), 'utf8');
const panel = html.slice(html.indexOf('// BEGIN MISCONCEPTIONS PANEL'), html.indexOf('// END MISCONCEPTIONS PANEL'));
let render, load, openDrawer, fetchJson;
const fixture = {
  ok: true, section: 'PeriodE', vocabReviewed: false,
  class: [{ key: 'test', label: '<img src=x onerror=alert(1)>', draft: true, students: 1, activeStudents: 3,
    lessons: ['1.4'], sources: { mcq: 1, frq: 1 }, lastSeen: '2026-09-11T12:00:00Z', skills: ['3.C'] }],
  students: { one: { username: 'one', realName: '<script>bad()</script>', persistent: [
    { key: 'test', label: 'Conditional percentages', draft: true, count: 2, itemIds: ['U1-L4-Q01'] },
  ] } },
  evidence: { test: [{ studentId: 'one', ts: '2026-09-11T12:00:00Z', source: 'mcq', itemId: 'U1-L4-Q01',
    evidence: { chosen: 'C', correct: 'A' } },
  { studentId: 'one', ts: '2026-09-07T12:00:00Z', source: 'frq', itemId: 'WS-U1L4-reflect1',
    evidence: { missing: '<b>denominator</b>', feedback: '<svg onload=bad()>' } }] },
};

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(parsed.getElementById('misconceptions-section'));
  for (const [id, tag] of [['section-filter', 'select'], ['load-btn', 'button'], ['tsc-nudge-broadcast', 'input'], ['tsc-nudge-text', 'textarea']]) {
    const node = document.createElement(tag); node.id = id; document.body.appendChild(node);
  }
  openDrawer = vi.fn();
  fetchJson = vi.fn(async () => ({ status: 200, data: structuredClone(fixture) }));
  const functions = new Function('$', 'fetchJson', 'teacherSecret', 'openTscDrawer', panel + ';return { renderMisconceptions, loadMisconceptions };')(
    id => document.getElementById(id), fetchJson, () => 'fixture-secret', openDrawer);
  render = functions.renderMisconceptions;
  load = functions.loadMisconceptions;
});

describe('teacher misconception panel', () => {
  it('appears between Skills to review and Remediation with all windows and map links', () => {
    expect(html.indexOf('id="misconceptions-section"')).toBeGreaterThan(html.indexOf('Skills to review'));
    expect(html.indexOf('id="misconceptions-section"')).toBeLessThan(html.indexOf('<!-- Remediation (Phase 4b) -->'));
    expect([...document.querySelectorAll('#misconceptions-days option')].map(node => node.value)).toEqual(['14', '42', '0']);
    expect(document.querySelectorAll('#misconceptions-draft a')).toHaveLength(2);
  });
  it('renders draft labels, names and feedback safely and expands evidence', () => {
    render(fixture);
    expect(document.getElementById('misconceptions-draft').hidden).toBe(false);
    expect(document.body.textContent).toContain('draft — not yet reviewed');
    expect(document.querySelector('img, script, svg')).toBeNull();
    expect(panel).not.toMatch(/innerHTML|insertAdjacentHTML/);
    const evidence = document.querySelector('#misconceptions-class tr[hidden]');
    expect(evidence.hidden).toBe(true);
    document.querySelector('#misconceptions-class button').click();
    expect(evidence.hidden).toBe(false);
    expect(evidence.textContent).toContain('chose C on U1-L4-Q01');
    expect(evidence.textContent).toContain('<svg onload=bad()>');
    expect(document.querySelector('#misconceptions-students summary').textContent).toContain('2');
  });
  it('hides reviewed vocabulary pill and renders the specified empty state', () => {
    render({ ...fixture, vocabReviewed: true, class: [], students: {}, evidence: {} });
    expect(document.getElementById('misconceptions-draft').hidden).toBe(true);
    expect(document.getElementById('misconceptions-status').textContent).toBe('No persistent misconceptions in this window yet.');
  });
  it('opens the existing composer prefilled without sending', () => {
    render(fixture);
    [...document.querySelectorAll('button')].find(node => node.textContent === 'Nudge').click();
    expect(openDrawer).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'one', section: 'PeriodE' }));
    expect(document.getElementById('tsc-nudge-text').value).toContain('lessons 1.4');
    expect(document.getElementById('tsc-nudge-broadcast').checked).toBe(false);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(document.querySelector('#misconceptions-class a').getAttribute('href')).toBe('u1_lesson4_live.html');
  });
  it('uses the section, selected window and existing authenticated fetch helper', async () => {
    const option = document.createElement('option'); option.value = 'PeriodE';
    document.getElementById('section-filter').appendChild(option);
    document.getElementById('misconceptions-days').value = '14';
    await load();
    expect(fetchJson).toHaveBeenCalledWith('/class/misconceptions?section=PeriodE&days=14', 'fixture-secret');
  });
});

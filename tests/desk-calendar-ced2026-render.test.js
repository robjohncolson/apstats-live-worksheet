// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desk = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const labelSource = ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']
  .map(path => readFileSync(resolve(repo, path), 'utf8')).join('\n');

function functionSource(name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(desk);
  if (!match) throw new Error('Missing Desk function: ' + name);
  let depth = 0;
  for (let index = desk.indexOf('{', match.index); index < desk.length; index += 1) {
    if (desk[index] === '{') depth += 1;
    if (desk[index] === '}' && --depth === 0) return desk.slice(match.index, index + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

function makeDesk({ role = 'student', year = 'SY26-27' } = {}) {
  const dom = new JSDOM('<div id="resource-header"></div><div id="resource-body"></div>'
    + '<div id="resource-overlay"></div><div id="tip"></div><div id="pb"></div><div id="pl"></div>',
  { url: 'https://desk.example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  Object.assign(w, {
    cYear: year, cP: 'B', R: 'REVIEW', OFF: 'OFF', EX: 'EXAM', PO: 'POST', NC: 'NC',
    DN: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    REGISTRY: { lessons: {} }, RESOURCES: {}, _gradeLessonsCache: [], _lastResourcePanel: null,
    getStudentEmail: () => '', getRegistryEntry: () => null, getAllRegistryEntries: () => [],
    rosterClient: { current: () => ({ role }) },
    tdy: () => new Date(2027, 0, 1),
    SCHEDULE_DEFS: {
      'SY26-27': { units: [1, 2, 3, 4, 5].map(id => ({ id })) },
      'SY25-26': { units: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => ({ id })) },
      SUMMER26: { units: [1, 2, 3, 4, 5].map(id => ({ id })) }
    }
  });
  w.localStorage.setItem('apstats_user_role', role);
  w.eval(labelSource);
  w.configureCedLabels(() => w.REGISTRY);
  w.tip = w.document.getElementById('tip');
  w.eval(['_resourcePanelEsc', '_deskIsTeacher', 'cedTeacherBridgeAllowed',
    'parseDueAssigned', 'cls', 'htm', 'cellAria', 'sTip', 'rProg', 'showResourcePanel']
    .map(functionSource).join('\n'));
  // Keep these tests focused on header and due/assigned display. Full lesson
  // resource rendering and actual calendar orchestration are covered separately.
  w.lookupTopic = () => null;
  return { dom, w };
}

describe('CED calendar display preserves existing identities and resources', () => {
  it('translates due and assigned labels while retaining source strings and links', () => {
    const { dom, w } = makeDesk();
    const inf = { t: '3.1', n: 'OLD title', u: 1, due: 'Quiz 6.1', as: 'Drills 6.2, Quiz 6.1' };
    const original = JSON.parse(JSON.stringify(inf));
    w.RESOURCES = {
      '6-1': { blookets: [{ title: 'u6l1blooket', url: 'https://resources.test/u6_lesson1' }] },
      '6-2': { blookets: [{ title: 'u6l2blooket', url: 'https://resources.test/u6_lesson2' }] }
    };
    w.showResourcePanel(inf, 'Oct 5');
    const body = w.document.getElementById('resource-body');
    expect(body.textContent).toContain('3.3 · Constructing a CI for a Proportion · Day 1');
    expect(body.textContent).toContain('3.3 · Constructing a CI for a Proportion · Day 2');
    expect(body.textContent).not.toMatch(/6\.[12]|Unit 6|u6l/);
    expect([...body.querySelectorAll('a')].map(link => link.href)).toEqual([
      'https://resources.test/u6_lesson1', 'https://resources.test/u6_lesson2', 'https://resources.test/u6_lesson1'
    ]);
    expect(Object.fromEntries(Object.entries(inf).filter(([key]) => key !== 'ced'))).toEqual(original);
    dom.window.close();
  });

  it('uses updated registry presentation after a cell was already rendered', () => {
    const { dom, w } = makeDesk();
    const inf = { t: '3.1', n: '3.1 old title', u: 1 };
    expect(w.htm(inf, 'Oct 5')).toContain('Investigative Question &amp; Data Collection');
    w.REGISTRY.lessons['3.1'] = { ced2026: {
      status: 'core', newTopic: '1.10', newUnit: 1, newLabel: 'Updated collection lesson'
    } };
    expect(w.htm(inf, 'Oct 5')).toContain('Updated collection lesson');
    expect(w.cellAria(inf, 'Oct 5')).toContain('Updated collection lesson');
    expect(inf.t).toBe('3.1');
    expect(inf.n).toBe('3.1 old title');
    dom.window.close();
  });

  it('does not leak a missing crosswalk key or stale pacing name', () => {
    const { dom, w } = makeDesk();
    const inf = { t: '9.6', n: 'Unit 9 Lesson 6', u: 9 };
    const cell = w.document.createElement('div');
    cell.innerHTML = w.htm(inf, 'May 5');
    expect(cell.textContent).toBe('May 5Lesson');
    expect(w.cellAria(inf, 'May 5')).not.toMatch(/9\.6|Unit 9/);
    w.showResourcePanel(inf, 'May 5');
    expect(w.document.getElementById('resource-header').textContent).toBe('Lesson');
    dom.window.close();
  });

  it.each(['SY25-26', 'SUMMER26'])('keeps %s lesson colors and old labels frozen', year => {
    const { dom, w } = makeDesk({ year });
    const inf = { t: '3.1', n: 'Sampling methods', u: 3 };
    expect(w.cls(inf)).toBe('cell-u3');
    expect(w.htm(inf, 'Mar 9')).toContain('<div class="tl">3.1</div>');
    expect(w.cellAria(inf, 'Mar 9')).toContain('3.1 Sampling methods');
    expect(inf).not.toHaveProperty('ced');
    dom.window.close();
  });

  it('keeps frozen progress groups and session totals while current lessons use CED groups', () => {
    const { dom, w } = makeDesk({ year: 'SY25-26' });
    const inf = { t: '6.1', n: 'Proportion inference', u: 6 };
    w.S = [[2026, 2, 9, inf, w.NC], [2026, 2, 10, { t: w.R, n: 'Review', u: 0 }, w.NC]];
    w.rProg();
    expect([...w.document.querySelectorAll('.prog-seg')].map(el => el.textContent)).toEqual(['U6', 'Rev']);
    expect(w.document.getElementById('pl').textContent).toContain('2 of 2 sessions');
    w.cYear = 'SY26-27';
    w.rProg();
    expect([...w.document.querySelectorAll('.prog-seg')].map(el => el.textContent)).toEqual(['U3', 'Rev']);
    expect(w.document.getElementById('pl').textContent).toContain('2 of 2 sessions');
    expect(inf.u).toBe(6);
    dom.window.close();
  });

  it('escapes hydrated labels rather than interpreting them as markup', () => {
    const { dom, w } = makeDesk();
    w.REGISTRY.lessons['3.1'] = { ced2026: {
      status: 'core', newTopic: '1.10', newUnit: 1, newLabel: '<img src=x onerror=alert(1)>'
    } };
    const inf = { t: '3.1', n: 'stale', u: 1 };
    const cell = w.document.createElement('div');
    cell.innerHTML = w.htm(inf, 'Oct 5');
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.textContent).toContain('<img src=x onerror=alert(1)>');
    w.sTip({}, new Date(2026, 9, 5), inf, 'Oct 5');
    expect(w.tip.querySelector('img')).toBeNull();
    expect(w.tip.textContent).toContain('<img src=x onerror=alert(1)>');
    dom.window.close();
  });
});

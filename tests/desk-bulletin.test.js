// desk-bulletin.test.js — the Desk school bulletin (data/bulletin.json).
//   1. The pure visibility/label helpers, extracted from the Desk and run in a VM.
//   2. The shipped data file: schema, audience split, and the public-file privacy rule.
//   3. Source-level guards: role gate, no innerHTML, desktop-app wiring (icon + window).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const DATA = JSON.parse(readFileSync(resolve(repo, 'data/bulletin.json'), 'utf8'));

function fnBody(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!m) throw new Error('fn not found: ' + name);
  const i = DESK.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < DESK.length; j++) {
    if (DESK[j] === '{') depth++;
    else if (DESK[j] === '}') { depth--; if (depth === 0) return DESK.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext([
  'var BULLETIN_LOOKAHEAD_DAYS = 21;',
  fnBody('_bulletinDaysBetween'), fnBody('_bulletinVisible'), fnBody('_bulletinWhenLabel'),
].join('\n'), sandbox);
const visible = (today, isTeacher, items = DATA.items) =>
  Array.from(sandbox._bulletinVisible(items, today, isTeacher));

describe('bulletin visibility', () => {
  it('never shows a staff item to a student, at any date', () => {
    for (const today of ['2026-09-20', '2026-09-23', '2026-10-02', '2026-10-21']) {
      expect(visible(today, false).filter(item => item.audience === 'teacher')).toEqual([]);
    }
  });

  it('shows the teacher everything a student sees, plus staff items', () => {
    const student = visible('2026-09-21', false).map(item => item.id);
    const teacher = visible('2026-09-21', true).map(item => item.id);
    expect(teacher).toEqual(expect.arrayContaining(student));
    expect(teacher).toContain('t-noshow-0923');
  });

  it('drops an item the day after it happens and keeps a multi-day item through `until`', () => {
    expect(visible('2026-09-22', false).map(item => item.id)).toContain('loaners-0922');
    expect(visible('2026-09-23', false).map(item => item.id)).not.toContain('loaners-0922');
    expect(visible('2026-10-07', false).map(item => item.id)).toContain('neasc-1005');
    expect(visible('2026-10-08', false).map(item => item.id)).not.toContain('neasc-1005');
  });

  it('holds far-off items back until the lookahead window, unless showFrom says otherwise', () => {
    expect(visible('2026-09-20', false).map(item => item.id)).not.toContain('satday-1021');
    expect(visible('2026-09-30', false).map(item => item.id)).toContain('satday-1021');
    expect(visible('2026-09-20', true).map(item => item.id)).toContain('t-satday-1021');
  });

  it('orders dated items soonest-first with standing reminders last', () => {
    const items = visible('2026-09-21', true);
    const firstStanding = items.findIndex(item => !item.date);
    expect(firstStanding).toBeGreaterThan(0);
    expect(items.slice(firstStanding).every(item => !item.date)).toBe(true);
    const dates = items.slice(0, firstStanding).map(item => item.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('ignores malformed items instead of throwing', () => {
    expect(visible('2026-09-21', true, [null, {}, { id: 'x' }, { id: 'y', title: 'no dates' }])).toEqual([]);
  });

  it('labels today, tomorrow, and a later weekday', () => {
    const halfDay = DATA.items.find(item => item.id === 'halfday-0930');
    expect(sandbox._bulletinWhenLabel(halfDay, '2026-09-30')).toBe('Today');
    expect(sandbox._bulletinWhenLabel(halfDay, '2026-09-29')).toBe('Tomorrow');
    expect(sandbox._bulletinWhenLabel(halfDay, '2026-09-21')).toBe('Wed 9/30');
    expect(sandbox._bulletinWhenLabel({ date: null }, '2026-09-21')).toBe('Reminder');
  });
});

describe('data/bulletin.json', () => {
  it('has well-formed, uniquely identified items', () => {
    const ids = DATA.items.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of DATA.items) {
      expect(['all', 'student', 'teacher']).toContain(item.audience);
      expect(item.title.trim().length).toBeGreaterThan(0);
      for (const key of ['date', 'until', 'showFrom']) {
        if (item[key] != null) expect(item[key]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      // A standing reminder must still expire, or it lives on the Desk forever.
      expect(item.date || item.until).toBeTruthy();
    }
  });

  it('is fit for a public page: no links, phone extensions, or email addresses', () => {
    const text = JSON.stringify(DATA.items);
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/\bext(ension)?\.?\s*\d/i);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
  });
});

describe('Desk wiring', () => {
  it('is its own desktop app: an icon under My Ledger opens a window, and no strip sits over the Do Now card', () => {
    expect(DESK).toMatch(/<div class="app-icon" data-app="bulletin"[^>]*ondblclick="openBulletin\(\)"/);
    expect(DESK).toMatch(/id="app-bulletin-overlay"/);
    expect(DESK).toMatch(/onclick="minimizeApp\('bulletin'\)"/);
    expect(DESK).not.toMatch(/<details id="school-bulletin"/);
    expect(fnBody('openBulletin')).toMatch(/_renderBulletin\(\)/);
    expect(fnBody('openBulletin')).toMatch(/_loadBulletin\(\)/);
  });

  it('renders with textContent only and badges the icon with the soon count', () => {
    const render = fnBody('_renderBulletin');
    expect(render).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(render).toMatch(/_updateBulletinBadge\(soonCount\)/);
    expect(fnBody('_updateBulletinBadge')).not.toMatch(/innerHTML/);
    expect(fnBody('_updateBulletinBadge')).toMatch(/bulletin-soon-badge/);
  });

  it('gates staff items on the verified-teacher check and re-renders when the role changes', () => {
    expect(fnBody('_renderBulletin')).toMatch(/_deskIsTeacher\(\)/);
    expect(fnBody('updateUserRoleUI')).toMatch(/_renderBulletin\(\)/);
    expect(fnBody('loadYear')).toMatch(/_loadBulletin\(\)/);
  });
});

// desk-section-reconcile.test.js — the Desk corrects a stale cached section at
// boot. A student who stayed signed in across a section move (SY26-27 cutover:
// PeriodX -> PeriodB/E) used to see the Period E calendar until they signed
// out, because the cached session's section is captured once at sign-in.
// _reconcileRosterSection looks the signed-in username up in the live B/E
// rosters and fixes both the cached section and the calendar period.
//
// Static parse of the Desk HTML + real execution of the function with mocked
// rosters and roster client.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

// Build a runnable copy of _reconcileRosterSection with its collaborators injected.
function harness({ who, rosters, cP }) {
  const src = fnBody(DESK, '_reconcileRosterSection');
  const calls = { updateSection: [], setP: [] };
  const rosterClient = {
    current: () => who,
    updateSection: (s) => { calls.updateSection.push(s); return true; }
  };
  const window = { rosterClient };
  const _fetchSectionRoster = async (section) => rosters[section] || [];
  const setP = (p) => { calls.setP.push(p); };
  const fn = new Function(
    'window', '_fetchSectionRoster', 'setP', 'cP',
    'return (' + src + ');'
  )(window, _fetchSectionRoster, setP, cP);
  return { fn, calls };
}

const B = [{ username: 'pineapple_hamster', realName: 'Saly Ung', section: 'PeriodB' }];
const E = [{ username: 'avocado_koala', realName: 'Dereck Jimenez', section: 'PeriodE' }];

describe('Desk: boot-time section reconcile', () => {
  it('00: Desk defines and boots _reconcileRosterSection after the cP boot block', () => {
    expect(DESK).toBeTypeOf('string');
    expect(DESK).toMatch(/async\s+function\s+_reconcileRosterSection\s*\(/);
    expect(DESK).toMatch(/_reconcileRosterSection\(\)\.catch\(/);
    const bootIdx = DESK.indexOf("cP=(pp==='B'||pp==='E')?pp:'E';");
    const callIdx = DESK.indexOf('_reconcileRosterSection().catch(');
    expect(bootIdx).toBeGreaterThan(0);
    expect(callIdx).toBeGreaterThan(bootIdx);
  });

  it('01: a stale PeriodX session whose username is in Period B flips to B', async () => {
    const { fn, calls } = harness({
      who: { studentId: 'x', username: 'pineapple_hamster', section: 'PeriodX', role: 'student' },
      rosters: { PeriodB: B, PeriodE: E },
      cP: 'E'
    });
    expect(await fn()).toBe('PeriodB');
    expect(calls.updateSection).toEqual(['PeriodB']);
    expect(calls.setP).toEqual(['B']);
  });

  it('02: matches usernames case-insensitively', async () => {
    const { fn, calls } = harness({
      who: { studentId: 'x', username: 'Pineapple_Hamster', section: 'PeriodE', role: 'student' },
      rosters: { PeriodB: B, PeriodE: E },
      cP: 'E'
    });
    expect(await fn()).toBe('PeriodB');
    expect(calls.setP).toEqual(['B']);
  });

  it('03: a correct cached section is left alone (no write, no setP)', async () => {
    const { fn, calls } = harness({
      who: { studentId: 'x', username: 'avocado_koala', section: 'PeriodE', role: 'student' },
      rosters: { PeriodB: B, PeriodE: E },
      cP: 'E'
    });
    expect(await fn()).toBeNull();
    expect(calls.updateSection).toEqual([]);
    expect(calls.setP).toEqual([]);
  });

  it('04: corrects the session but skips setP when the calendar already shows the right period', async () => {
    const { fn, calls } = harness({
      who: { studentId: 'x', username: 'pineapple_hamster', section: 'PeriodX', role: 'student' },
      rosters: { PeriodB: B, PeriodE: E },
      cP: 'B'
    });
    expect(await fn()).toBe('PeriodB');
    expect(calls.updateSection).toEqual(['PeriodB']);
    expect(calls.setP).toEqual([]);
  });

  it('05: username in neither roster (offline / empty rosters) changes nothing', async () => {
    const { fn, calls } = harness({
      who: { studentId: 'x', username: 'ghost_owl', section: 'PeriodX', role: 'student' },
      rosters: {},
      cP: 'E'
    });
    expect(await fn()).toBeNull();
    expect(calls.updateSection).toEqual([]);
    expect(calls.setP).toEqual([]);
  });

  it('06: signed-out and teacher sessions are untouched', async () => {
    const out = harness({ who: null, rosters: { PeriodB: B }, cP: 'E' });
    expect(await out.fn()).toBeNull();
    const t = harness({
      who: { studentId: 't', username: 'pineapple_hamster', section: 'PeriodX', role: 'teacher' },
      rosters: { PeriodB: B }, cP: 'E'
    });
    expect(await t.fn()).toBeNull();
    expect(t.calls.setP).toEqual([]);
  });
});

// worksheet-identity-clean.test.js — every follow-along worksheet must populate
// its name/period/username from the LIVE shared session (roster student > active
// guest alias > local cache), never a stale 'worksheet-user' from a previous
// person on the device. Pins the 69-worksheet rollout (codemod
// scripts/wire-identity-clean.mjs) and the field-id-agnostic coverage of the one
// divergent worksheet (u3_lesson6-7).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worksheets = readdirSync(repo).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f));
const MARKER = 'IDENTITY (clean): the live shared session is AUTHORITATIVE';

function restoreFn(src) {
  const at = src.indexOf('function restoreSavedUser()');
  return at < 0 ? '' : src.slice(at, at + 3000);
}

describe('Worksheet identity — clean (no stale name/period/username)', () => {
  it('covers all 69 follow-along worksheets', () => {
    expect(worksheets.length).toBe(69);
  });

  it('every worksheet uses the identity-aware restoreSavedUser', () => {
    const missing = worksheets.filter((f) => !readFileSync(resolve(repo, f), 'utf8').includes(MARKER));
    expect(missing).toEqual([]);
  });

  it('prioritizes roster session > active guest > local cache', () => {
    const fn = restoreFn(readFileSync(resolve(repo, worksheets[0]), 'utf8'));
    const rosterAt = fn.indexOf('rosterClient.current');
    const guestAt = fn.indexOf('apstats_guest_active');
    const cacheAt = fn.indexOf('localStorage.getItem(anonKey)');
    expect(rosterAt).toBeGreaterThan(-1);
    expect(guestAt).toBeGreaterThan(rosterAt);
    expect(cacheAt).toBeGreaterThan(guestAt);
    // Guest alias read straight from localStorage — getGuestIdentity()'s file
    // (railway_client.js) 404s from a root worksheet's ../ path, so don't depend on it.
    expect(fn).toContain("localStorage.getItem('apstats_guest_identity')");
    expect(fn).not.toContain('window.getGuestIdentity()');
  });

  it('resolves fields by either id set (covers the divergent u3_lesson6-7)', () => {
    const v = readFileSync(resolve(repo, 'u3_lesson6-7_live.html'), 'utf8');
    expect(v).toContain(MARKER);
    const fn = restoreFn(v);
    expect(fn).toContain("getElementById('worksheetName')");
    expect(fn).toContain("getElementById('studentName')");
    expect(fn).toContain('LOCAL_USER_KEY'); // anon fallback uses the worksheet's own key
  });

  it('does NOT touch edgar / MIT worksheets (pattern-guarded)', () => {
    for (const f of ['edgar_u6_conceptual_driller_live.html', 'mit_ocw_6.0001_lec1_live.html', 'mit_ocw_6.0001_lec2_live.html']) {
      let src = '';
      try { src = readFileSync(resolve(repo, f), 'utf8'); } catch (_) { continue; }
      expect(src).not.toContain(MARKER);
    }
  });
});

describe('Worksheet config scripts load same-dir (../ 404s on GH Pages)', () => {
  it('no worksheet loads ../railway_client.js or ../railway_config.js', () => {
    const bad = worksheets.filter((f) => {
      const s = readFileSync(resolve(repo, f), 'utf8');
      return s.includes('src="../railway_client.js"') || s.includes('src="../railway_config.js"');
    });
    expect(bad).toEqual([]);
  });

  it('worksheets load railway_client.js + railway_config.js same-dir', () => {
    const s = readFileSync(resolve(repo, worksheets[0]), 'utf8');
    expect(s).toContain('src="railway_client.js"');
    expect(s).toContain('src="railway_config.js"');
  });
});

// Brace-match a named function's full source.
function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// Behavioral: actually RUN restoreSavedUser with injected fakes (the
// worksheet-signin-wall / desk-completion-gate extraction pattern) to prove the
// real branch behavior — especially the roster-student path the teacher couldn't
// test by hand (they only tried a guest).
describe('Worksheet identity — behavioral (roster / guest / cache)', () => {
  const SRC = fnBody(readFileSync(resolve(repo, 'u1_lesson1_live.html'), 'utf8'), 'restoreSavedUser');

  function run({ roster = null, guestActive = false, guestAlias = null, cache = null } = {}) {
    const els = {};
    const el = (id) => (els[id] || (els[id] = { value: '' }));
    const KNOWN = ['worksheetName', 'worksheetPeriod', 'worksheetUsername'];
    const document = { getElementById: (id) => (KNOWN.includes(id) ? el(id) : null) };
    const store = {};
    if (guestActive) store['apstats_guest_active'] = '1';
    if (guestAlias) store['apstats_guest_identity'] = guestAlias;
    if (cache) store['worksheet-user'] = JSON.stringify(cache);
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    };
    const rosterClient = roster ? { current: () => roster } : null;
    const window = { rosterClient };
    const saveUser = () => {};
    // restoreSavedUser reads document/window/localStorage/bare rosterClient/saveUser/
    // console and `typeof LOCAL_USER_KEY` — inject them all.
    // eslint-disable-next-line no-new-func
    new Function('document', 'window', 'localStorage', 'rosterClient', 'saveUser', 'console', 'LOCAL_USER_KEY',
      SRC + '\nrestoreSavedUser();'
    )(document, window, localStorage, rosterClient, saveUser, console, undefined);
    return { name: el('worksheetName').value, period: el('worksheetPeriod').value, username: el('worksheetUsername').value };
  }

  const STALE = { name: 'Robert Colson', klass: 'PeriodX', username: 'date_tiger' };

  it('signed-in roster student → their real identity (NOT the stale cache)', () => {
    const out = run({ roster: { username: 'apple_monkey', realName: 'Apple Monkey', section: 'PeriodX' }, cache: STALE });
    expect(out.username).toBe('apple_monkey');
    expect(out.name).toBe('Apple Monkey');
    expect(out.period).toBe('X');                 // 'Period' stripped from the section
    expect(out.name).not.toBe('Robert Colson');
  });

  it('roster student with no realName → name falls back to username', () => {
    const out = run({ roster: { username: 'kiwi_fox', realName: null, section: 'PeriodB' } });
    expect(out.name).toBe('kiwi_fox');
    expect(out.period).toBe('B');
  });

  it('active guest → the Guest_ alias, blank period (never the prior person)', () => {
    const out = run({ guestActive: true, guestAlias: 'Guest_Mango_Turtle', cache: STALE });
    expect(out.username).toBe('Guest_Mango_Turtle');
    expect(out.name).toBe('Guest_Mango_Turtle');
    expect(out.period).toBe('');
    expect(out.username).not.toBe('date_tiger');
  });

  it('active guest with no alias yet → blanks the fields (still never stale)', () => {
    const out = run({ guestActive: true, cache: STALE });
    expect(out.username).toBe('');
    expect(out.name).toBe('');
    expect(out.period).toBe('');
  });

  it('nobody signed in → restores the device-local cache (legacy)', () => {
    const out = run({ cache: STALE });
    expect(out.name).toBe('Robert Colson');
    expect(out.period).toBe('PeriodX');
    expect(out.username).toBe('date_tiger');
  });
});

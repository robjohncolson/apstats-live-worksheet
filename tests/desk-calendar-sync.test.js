// desk-calendar-sync.test.js — cross-device calendar grey-out
// (CALENDAR_SYNC_BUILD.md). The Desk hydrates local marks from the server's
// per-resource self-done flag (/donow lessons[].selfDone) so a lesson marked
// Done on ANY device greys on every device for the signed-in student.
// Behavioral test of _hydrateMarksFromDonow in jsdom + static wiring pins.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}

const KEY = (e) => 'apstats_desk_marks_' + e;

function makeCtx(email) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://desk.test' });
  const win = dom.window;
  win.getStudentEmail = () => email;
  const ctx = createContext(win);
  runInContext(extractFn(DESK, '_hydrateMarksFromDonow') + '\nwindow.__h = _hydrateMarksFromDonow;', ctx);
  return { win, hydrate: win.__h };
}

describe('_hydrateMarksFromDonow — cross-device grey-out sync', () => {
  it('seeds a <topic>|server mark for a selfDone lesson + returns true', () => {
    const { win, hydrate } = makeCtx('s@roster.local');
    const changed = hydrate({ lessons: [{ lesson: '1.1', selfDone: true }, { lesson: '1.2', selfDone: false }] });
    expect(changed).toBe(true);
    const marks = JSON.parse(win.localStorage.getItem(KEY('s@roster.local')));
    expect(marks['1.1|server'] && marks['1.1|server'].ts).toBeTruthy();
    expect(marks['1.2|server']).toBeUndefined(); // not selfDone → not seeded
  });

  it('is idempotent — a 2nd pass adds nothing + returns false', () => {
    const { hydrate } = makeCtx('s@roster.local');
    expect(hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] })).toBe(true);
    expect(hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] })).toBe(false);
  });

  it('is additive — never clobbers an existing real mark', () => {
    const { win, hydrate } = makeCtx('s@roster.local');
    win.localStorage.setItem(KEY('s@roster.local'), JSON.stringify({ '1.1|worksheet': { ts: 'real-ts' } }));
    hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] });
    const marks = JSON.parse(win.localStorage.getItem(KEY('s@roster.local')));
    expect(marks['1.1|worksheet'].ts).toBe('real-ts'); // preserved
    expect(marks['1.1|server'].ts).toBeTruthy();         // added alongside
  });

  it('no-ops + returns false when signed out (no email)', () => {
    const { win, hydrate } = makeCtx(null);
    expect(hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] })).toBe(false);
    expect(win.localStorage.getItem(KEY('null'))).toBeNull();
  });

  it('no-ops on a malformed / empty payload', () => {
    const { hydrate } = makeCtx('s@roster.local');
    expect(hydrate(null)).toBe(false);
    expect(hydrate({})).toBe(false);
    expect(hydrate({ lessons: [] })).toBe(false);
  });
});

describe('_hydrateMarksFromDonow — wiring + key format', () => {
  it('renderDoNow hydrates from /donow then re-renders rCal only when marks changed', () => {
    expect(DESK).toMatch(/_syncedMarks = _hydrateMarksFromDonow\(data\)/);
    expect(DESK).toMatch(/_syncedMarks && typeof rCal === 'function'/);
  });

  it('seeds a synthetic <topic>|server mark, gated on selfDone === true', () => {
    const body = extractFn(DESK, '_hydrateMarksFromDonow');
    expect(body).toMatch(/\|server/);
    expect(body).toMatch(/selfDone !== true/);
    // never removes a mark (additive only)
    expect(body).not.toMatch(/delete\s+marks/);
  });

  it('short-circuits in view-as (never seeds the teacher\'s marks from a viewed student)', () => {
    const body = extractFn(DESK, '_hydrateMarksFromDonow');
    expect(body).toMatch(/_viewAsContext/);
  });

  it('_studentMarkSave builds a UNIQUE DESK_DONE itemId for combined topics (no WS-U?- collision)', () => {
    // The unit/lesson parse must accept combined topics like "4.1-2" ([\d-], not \d)
    // so each combined lesson gets its own DESK_DONE itemId.
    expect(DESK).toContain('var um = /^(\\d+)\\.([\\d-]+)$/.exec(topicId');
  });
});

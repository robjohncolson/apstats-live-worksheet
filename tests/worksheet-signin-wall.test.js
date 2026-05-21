// worksheet-signin-wall.test.js — the no-guest-mode worksheet wall
// (SIGNIN_WALL_BUILD.md §3). Every u*_lesson*_live.html carries a
// self-contained <script> block that blocks the worksheet behind a sign-in
// overlay unless the visitor is a signed-in student or a teacher. The block
// fails OPEN — if rosterClient is unavailable or the check throws, no wall is
// shown (degrade, never brick).
//
// Static parse of every worksheet HTML source + a real-execution smoke test of
// the pure _wallAccessGranted helper, extracted via `new Function` with
// injected fakes (the desk-completion-gate.test.js pattern).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WORKSHEETS = readdirSync(repo)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

const ANCHOR = '<script src="gradebook-client.js"></script>';

// Extract the body of a named function from a source string by brace-matching.
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
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

describe('worksheet sign-in wall: corpus', () => {
  it('00: the worksheet corpus is non-empty (all 69 expected)', () => {
    expect(WORKSHEETS.length).toBe(69);
  });

  it('01: the wall block is byte-identical across all 69 worksheets', () => {
    // The rollout must inject ONE identical block everywhere. Hash the block
    // (sentinel comment through its closing IIFE) per file — exactly one
    // distinct hash proves no drift / no encoding corruption (e.g. a mangled
    // emoji would change the hash for the affected files).
    const hashes = new Map();
    for (const f of WORKSHEETS) {
      const html = readFileSync(resolve(repo, f), 'utf8');
      const s = html.indexOf('No-guest-mode wall');
      expect(s, f + ' must carry the wall block').toBeGreaterThan(-1);
      const e = html.indexOf('})();', s);
      expect(e, f + ' wall block must be well-formed').toBeGreaterThan(-1);
      const h = createHash('md5').update(html.slice(s, e + 5)).digest('hex');
      if (!hashes.has(h)) hashes.set(h, []);
      hashes.get(h).push(f);
    }
    expect([...hashes.keys()].length,
      'all 69 wall blocks must be byte-identical (one hash)').toBe(1);
  });

  it('02: every worksheet file is valid UTF-8 (no mojibake / encoding corruption)', () => {
    const bad = [];
    for (const f of WORKSHEETS) {
      const raw = readFileSync(resolve(repo, f));            // Buffer
      // A round-trip through strict UTF-8 must be lossless.
      const decoded = raw.toString('utf8');
      if (Buffer.from(decoded, 'utf8').length !== raw.length) bad.push(f);
    }
    expect(bad, 'worksheets with invalid UTF-8: ' + bad.join(', ')).toEqual([]);
  });
});

describe('worksheet sign-in wall: per-worksheet static checks', () => {
  for (const f of WORKSHEETS) {
    describe(f, () => {
      const html = readFileSync(resolve(repo, f), 'utf8');

      it('01: the wall block markers are all present', () => {
        // Overlay id (set programmatically), the access helper, the wall fns.
        expect(html).toContain("ov.id = 'ws-signin-wall'");
        expect(html).toMatch(/function\s+_wallAccessGranted\s*\(/);
        expect(html).toMatch(/function\s+_checkSigninWall\s*\(/);
        expect(html).toMatch(/function\s+_showSigninWall\s*\(/);
        expect(html).toMatch(/function\s+_removeSigninWall\s*\(/);
        // The storage listener re-checks the wall (via _checkSigninWall) on
        // BOTH the roster session key AND the teacher-role key — a teacher
        // signing in/out in another tab must also flip the wall.
        expect(html).toMatch(/addEventListener\(\s*['"]storage['"][\s\S]{0,260}_checkSigninWall/);
        expect(html).toContain('apstats_roster.v1');
        expect(html).toContain('apstats_user_role');
      });

      it('02: the wall block appears AFTER the gradebook-client.js script tag', () => {
        const anchorIdx = html.indexOf(ANCHOR);
        const wallIdx = html.indexOf('_wallAccessGranted');
        expect(anchorIdx, 'gradebook-client.js anchor present').toBeGreaterThan(-1);
        expect(wallIdx, 'wall block present').toBeGreaterThan(-1);
        expect(wallIdx, 'wall block must follow the gradebook-client.js tag')
          .toBeGreaterThan(anchorIdx);
      });

      it('03: the anchor is unique (exactly one gradebook-client.js tag)', () => {
        const count = html.split(ANCHOR).length - 1;
        expect(count).toBe(1);
      });

      it('04: _wallAccessGranted fails OPEN — its catch returns true', () => {
        const body = fnBody(html, '_wallAccessGranted');
        expect(body).toMatch(/catch\s*\([^)]*\)\s*\{\s*return\s+true\s*;?\s*\}/);
      });

      it('05: the wall is XSS-safe — built with createElement + textContent only', () => {
        const body = fnBody(html, '_showSigninWall');
        // No innerHTML / outerHTML / insertAdjacentHTML / document.write in the
        // block — the wall is assembled element-by-element with textContent.
        expect(body).not.toMatch(/innerHTML/);
        expect(body).not.toMatch(/outerHTML/);
        expect(body).not.toMatch(/insertAdjacentHTML/);
        expect(body).not.toMatch(/document\.write/);
        expect(body).toMatch(/createElement/);
        expect(body).toMatch(/textContent/);
      });

      it('06: the wall links back to the Desk for sign-in', () => {
        const body = fnBody(html, '_showSigninWall');
        expect(body).toContain('ap_stats_roadmap_square_mode.html');
      });

      it('07: the wall checks the teacher role and the rosterClient session', () => {
        const body = fnBody(html, '_wallAccessGranted');
        expect(body).toContain('apstats_user_role');
        expect(body).toContain('rosterClient');
        expect(body).toMatch(/rosterClient\.current/);
      });
    });
  }
});

// ── _wallAccessGranted real-execution smoke tests ───────────────────────────
// _wallAccessGranted references the globals `localStorage` and `window`. We
// extract its source from the pilot worksheet and instantiate it with injected
// fakes — the desk-completion-gate.test.js extraction pattern.
describe('worksheet sign-in wall: _wallAccessGranted smoke', () => {
  const pilot = readFileSync(resolve(repo, 'u4_lesson1-2_live.html'), 'utf8');
  const SRC = fnBody(pilot, '_wallAccessGranted');

  // Build the helper with injected fake `localStorage` + `window`. The block
  // reads bare `rosterClient` too (an implicit global), so we expose the same
  // object under a third `rosterClient` parameter.
  function makeWallAccessGranted({ role = null, session = undefined, throwOnCurrent = false } = {}) {
    const fakeLocalStorage = {
      getItem: (k) => (k === 'apstats_user_role' ? role : null),
    };
    let rosterClient;
    if (throwOnCurrent) {
      rosterClient = {
        current() {
          throw new Error('rosterClient blew up');
        },
      };
    } else if (session !== undefined) {
      rosterClient = { current: () => session };
    } else {
      rosterClient = undefined;
    }
    const fakeWindow = { rosterClient };
    // eslint-disable-next-line no-new-func
    return new Function(
      'localStorage', 'window', 'rosterClient',
      'return (' + SRC + ');'
    )(fakeLocalStorage, fakeWindow, rosterClient);
  }

  it('teacher role → access granted (true)', () => {
    const fn = makeWallAccessGranted({ role: 'teacher' });
    expect(fn()).toBe(true);
  });

  it('signed-in student (rosterClient.current() returns a session) → true', () => {
    const fn = makeWallAccessGranted({ session: { studentId: 's-123', name: 'Pat' } });
    expect(fn()).toBe(true);
  });

  it('neither teacher nor a session → access denied (false → wall shows)', () => {
    const fn = makeWallAccessGranted({ role: null, session: null });
    expect(fn()).toBe(false);
  });

  it('no rosterClient at all → false (wall shows, but see fail-open test)', () => {
    // window.rosterClient undefined is a normal "not signed in" state, not an
    // error — the && short-circuits to a falsy value → wall shows.
    const fn = makeWallAccessGranted({ role: null, session: undefined });
    expect(fn()).toBe(false);
  });

  it('rosterClient.current() THROWS → true (fail OPEN — never brick)', () => {
    const fn = makeWallAccessGranted({ role: null, throwOnCurrent: true });
    expect(fn()).toBe(true);
  });

  it('teacher role wins even when rosterClient.current() would throw', () => {
    // Teacher check runs first; the throwing rosterClient is never reached.
    const fn = makeWallAccessGranted({ role: 'teacher', throwOnCurrent: true });
    expect(fn()).toBe(true);
  });

  it('a non-"teacher" role string with no session → false', () => {
    const fn = makeWallAccessGranted({ role: 'student', session: null });
    expect(fn()).toBe(false);
  });
});

/**
 * tests/desk-roster-signin.test.js
 *
 * DN2c — verifies `rosterClient` is wired as the Desk's single sign-in surface
 * in ap_stats_roadmap_square_mode.html. Frozen contract: DESK_DONOW_DN2C_BUILD.md.
 *
 * Strategy mirrors schedule.test.js (jsdom DOM-structure, scripts NOT executed —
 * the Desk's inline app script has canvas/audio/Supabase deps) + roster-client.test.js
 * (source-text literal scan). No network, no Supabase.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const DESK_PATH = resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html');

let html;
let document;

beforeAll(() => {
  html = readFileSync(DESK_PATH, 'utf-8');
  // No runScripts — we only inspect the parsed DOM + raw source.
  document = new JSDOM(html).window.document;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Shared client loaded via <script src> — flat paths, config before client
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2c — shared roster client is loaded', () => {
  it('loads roster_config.js and roster-client.js via <script src> (flat paths)', () => {
    const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    expect(srcs).toContain('roster_config.js');
    expect(srcs).toContain('roster-client.js');
  });

  it('roster_config.js loads BEFORE roster-client.js (config sets the URL)', () => {
    const idxConfig = html.indexOf('<script src="roster_config.js">');
    const idxClient = html.indexOf('<script src="roster-client.js">');
    expect(idxConfig).toBeGreaterThan(-1);
    expect(idxClient).toBeGreaterThan(-1);
    expect(idxConfig).toBeLessThan(idxClient);
  });

  it('both roster scripts load before the main inline app <script>', () => {
    const idxClient = html.indexOf('<script src="roster-client.js">');
    // The main app script is the first inline <script> (BAKED_REGISTRY marker).
    const idxApp = html.indexOf('/* ═══ BAKED REGISTRY');
    expect(idxApp).toBeGreaterThan(-1);
    expect(idxClient).toBeLessThan(idxApp);
  });

  it('uses flat paths, not "../" (Desk is at repo root)', () => {
    expect(html).not.toContain('src="../roster-client.js"');
    expect(html).not.toContain('src="../roster_config.js"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sign-in modal = username + password (no leftover email)
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2c — sign-in modal is username + password', () => {
  it('has #signin-username (text) and #signin-password (type=password)', () => {
    const u = document.getElementById('signin-username');
    const p = document.getElementById('signin-password');
    expect(u).not.toBeNull();
    expect(p).not.toBeNull();
    expect(p.getAttribute('type')).toBe('password');
  });

  it('no #signin-email input remains anywhere', () => {
    expect(document.getElementById('signin-email')).toBeNull();
    expect(html).not.toContain('signin-email');
  });

  it('the OK button still calls submitSignIn()', () => {
    const overlay = document.getElementById('signin-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.innerHTML).toContain('submitSignIn()');
  });

  it('Student menu still exposes Sign In / Sign Out', () => {
    const menu = document.getElementById('menu-student');
    expect(menu).not.toBeNull();
    expect(menu.innerHTML).toContain('openSignInModal()');
    expect(menu.innerHTML).toContain('signOutStudent()');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Source wiring — functions call rosterClient and preserve legacy compat
// ─────────────────────────────────────────────────────────────────────────────

/** Slice the source of a top-level `function NAME(` (or `async function NAME(`)
 *  to its matching close brace, so assertions are scoped to that function. */
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('DN2c — submitSignIn uses rosterClient and mirrors legacy identity', () => {
  let body;
  beforeAll(() => { body = fnBody(html, 'submitSignIn'); });

  it('is async', () => {
    expect(/async\s+function\s+submitSignIn\s*\(/.test(html)).toBe(true);
  });

  it('calls window.rosterClient.signIn(username, password)', () => {
    expect(body).toMatch(/rosterClient\.signIn\s*\(/);
  });

  it('guards when rosterClient is absent (offline)', () => {
    expect(body).toMatch(/!window\.rosterClient/);
  });

  it('mirrors identity into the legacy apstats_desk_student_email key', () => {
    expect(body).toContain("localStorage.setItem('apstats_desk_student_email'");
  });

  it('does NOT keep the old email-regex validation path', () => {
    expect(body).not.toMatch(/\[\^\\s@\]\+@\[\^\\s@\]/);
  });
});

describe('DN2c — signOutStudent clears both roster session and legacy key', () => {
  let body;
  beforeAll(() => { body = fnBody(html, 'signOutStudent'); });

  it('calls window.rosterClient.signOut()', () => {
    expect(body).toMatch(/rosterClient\.signOut\s*\(/);
  });

  it('still removes the legacy apstats_desk_student_email key', () => {
    expect(body).toContain("localStorage.removeItem('apstats_desk_student_email')");
  });
});

describe('DN2c — menu + modal open read rosterClient.current()', () => {
  it('updateStudentMenu prefers rosterClient.current()', () => {
    expect(fnBody(html, 'updateStudentMenu')).toMatch(/rosterClient\.current\s*\(/);
  });

  it('openSignInModal prefills username from rosterClient.current()', () => {
    const b = fnBody(html, 'openSignInModal');
    expect(b).toMatch(/rosterClient\.current\s*\(/);
    expect(b).toContain('signin-username');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Legacy path bodies untouched (DN3 retires them, not DN2c)
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2c — legacy email-keyed feature bodies are untouched', () => {
  it('getStudentEmail still reads apstats_desk_student_email', () => {
    expect(fnBody(html, 'getStudentEmail'))
      .toContain("localStorage.getItem('apstats_desk_student_email')");
  });

  it('recordProgress still posts to the legacy student_progress path', () => {
    expect(fnBody(html, 'recordProgress')).toContain('/rest/v1/student_progress');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RUNTIME behavior — execute the real Desk helpers against fakes
//    (addresses Codex MAJOR: prove the wiring, not just string presence)
// ─────────────────────────────────────────────────────────────────────────────

/** Build a vm sandbox with the 5 real DN2c helpers loaded + injectable fakes. */
function makeDesk({ rosterClient } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const els = new Map();
  function el(id) {
    if (!els.has(id)) {
      els.set(id, { id, value: '', textContent: '', disabled: false, innerHTML: '',
                    style: {}, focus() {} });
    }
    return els.get(id);
  }

  const calls = { registerStudent: [], showDialog: [], closeSignInModal: 0,
                  signOut: 0, reload: 0 };

  const sandbox = {
    document: { getElementById: id => el(id) },
    localStorage,
    window: { rosterClient: rosterClient || undefined },
    setTimeout: fn => fn(),
    MacSFX: { play() {} },
    location: { reload: () => { calls.reload++; } },
    registerStudent: (x) => { calls.registerStudent.push(x); },
    closeSignInModal: () => { calls.closeSignInModal++; },
    showDialog: (...a) => { calls.showDialog.push(a); },
  };
  createContext(sandbox);

  const src = ['getStudentEmail', 'updateStudentMenu', 'openSignInModal',
               'submitSignIn', 'signOutStudent']
    .map(n => fnBody(html, n)).join('\n');
  runInContext(src + '\nthis.__api = { getStudentEmail, updateStudentMenu, '
    + 'openSignInModal, submitSignIn, signOutStudent };', sandbox);

  return { api: sandbox.__api, el, store, calls, sandbox };
}

describe('DN2c runtime — submitSignIn', () => {
  it('on success: writes rosterClient.current().username (NOT the typed username) to the legacy key, only after auth', async () => {
    let signInArgs = null;
    const d = makeDesk({
      rosterClient: {
        signIn: async (u, p) => { signInArgs = [u, p]; return { ok: true }; },
        current: () => ({ studentId: 'sid-1', username: 'coconut_shark', realName: 'Pat Q', section: 'SUMMER26' }),
      },
    });
    d.el('signin-username').value = '  typed_name  ';
    d.el('signin-password').value = ' p@ss with space ';

    await d.api.submitSignIn();

    // username trimmed into the signIn call; password passed verbatim (no trim)
    expect(signInArgs).toEqual(['typed_name', ' p@ss with space ']);
    // legacy key = current().username, NOT the typed value
    expect(d.store.get('apstats_desk_student_email')).toBe('coconut_shark');
    expect(d.calls.registerStudent).toEqual(['coconut_shark']);
    expect(d.calls.closeSignInModal).toBe(1);
  });

  it('on failure: does NOT write the legacy key and surfaces the error', async () => {
    const d = makeDesk({
      rosterClient: {
        signIn: async () => ({ ok: false, error: 'Invalid username or password' }),
        current: () => null,
      },
    });
    d.el('signin-username').value = 'x';
    d.el('signin-password').value = 'y';

    await d.api.submitSignIn();

    expect(d.store.has('apstats_desk_student_email')).toBe(false);
    expect(d.el('signin-error').textContent).toBe('Invalid username or password');
    expect(d.calls.closeSignInModal).toBe(0);
  });

  it('offline (no rosterClient): clear error message, no throw, no key write', async () => {
    const d = makeDesk({ rosterClient: undefined });
    d.el('signin-username').value = 'x';
    d.el('signin-password').value = 'y';

    await d.api.submitSignIn();

    expect(d.el('signin-error').textContent).toMatch(/offline/i);
    expect(d.store.has('apstats_desk_student_email')).toBe(false);
  });

  it('in-flight guard: a second call while the first is pending is a no-op', async () => {
    let resolve1;
    let signInCount = 0;
    const d = makeDesk({
      rosterClient: {
        signIn: () => { signInCount++; return new Promise(r => { resolve1 = r; }); },
        current: () => ({ username: 'u1' }),
      },
    });
    d.el('signin-username').value = 'u1';
    d.el('signin-password').value = 'pw';

    const p1 = d.api.submitSignIn();      // starts, awaits the pending promise
    await d.api.submitSignIn();           // must early-return (guard)
    expect(signInCount).toBe(1);

    resolve1({ ok: true });
    await p1;
    expect(signInCount).toBe(1);
  });
});

describe('DN2c runtime — signOutStudent / menu / modal open', () => {
  it('signOutStudent calls rosterClient.signOut, clears legacy key, reloads', () => {
    const d = makeDesk({ rosterClient: { signOut() { d.calls.signOut++; }, current: () => null } });
    d.store.set('apstats_desk_student_email', 'coconut_shark');

    d.api.signOutStudent();

    expect(d.calls.signOut).toBe(1);
    expect(d.store.has('apstats_desk_student_email')).toBe(false);
    expect(d.calls.reload).toBe(1);
  });

  it('updateStudentMenu shows realName (username) from rosterClient.current()', () => {
    const d = makeDesk({ rosterClient: { current: () => ({ username: 'coconut_shark', realName: 'Pat Q' }) } });
    d.api.updateStudentMenu();
    expect(d.el('menu-student-status').textContent).toBe('Signed in as: Pat Q (coconut_shark)');
  });

  it('updateStudentMenu falls back to "Not signed in" when no session', () => {
    const d = makeDesk({ rosterClient: { current: () => null } });
    d.api.updateStudentMenu();
    expect(d.el('menu-student-status').textContent).toBe('Not signed in');
  });

  it('openSignInModal prefills username from current() and blanks the password', () => {
    const d = makeDesk({ rosterClient: { current: () => ({ username: 'coconut_shark' }) } });
    d.el('signin-password').value = 'stale-secret';
    d.api.openSignInModal();
    expect(d.el('signin-username').value).toBe('coconut_shark');
    expect(d.el('signin-password').value).toBe('');
  });
});

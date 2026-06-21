// @vitest-environment jsdom
/**
 * tests/doge-presence-submenu.test.js — DOGE_PRESENCE_SUBMENU_SPEC.md
 *
 * The 🐶 "Online Now" dropdown gains a per-peer LOCATION chip (Desk / Worksheet /
 * Quiz / Study guide; the exact lesson is teacher-only) and clicking a name opens
 * an inline SUBMENU (never an instant Tetris challenge). "Challenge to Study Break"
 * is enabled only when the peer is on the Desk; "Send candy" works anywhere.
 *
 * Runs the REAL code:
 *  A. fa railway_client.js `_presenceSurface()` — URL -> {surface, lesson}.
 *  B. cr railway_client.js `_presenceSurface()` — quiz vs worksheet + ?u=&l= lesson.
 *  C. cr server.js sanitizeLocation / aggregateLocation — validation + onDesk-wins.
 *  D. The live DogePresence object — chip role-awareness, submenu gating, no
 *     auto-challenge, candy wiring, and the presence_snapshot/user_online/offline
 *     location handlers.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInContext, createContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');
const faClient = readFileSync(resolve(REPO_ROOT, 'railway_client.js'), 'utf-8');
const crClient = readFileSync(resolve(REPO_ROOT, '..', 'curriculum_render', 'railway_client.js'), 'utf-8');
const crServer = readFileSync(resolve(REPO_ROOT, '..', 'curriculum_render', 'railway-server', 'server.js'), 'utf-8');

// Extract a named `function foo(...) {...}` body (balanced braces).
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
// Extract an object literal that follows a `const Foo = {` declaration (balanced braces).
function objLiteral(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error('not found: ' + decl);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced: ' + decl);
}

// ── A/B. _presenceSurface(): run the real client helper against a faked location ──
function loadSurface(src, { pathname, search = '' }) {
  const sandbox = {
    console,
    URLSearchParams,
    location: { pathname, search },
  };
  createContext(sandbox);
  runInContext(fnBody(src, '_presenceSurface') + '\nthis.__s = _presenceSurface();', sandbox);
  return sandbox.__s;
}

describe('A. follow-alongs _presenceSurface (worksheets/edgar/mit/study-guide)', () => {
  it('a worksheet -> {worksheet, "U3 L6-7"}', () => {
    const s = loadSurface(faClient, { pathname: '/apstats-live-worksheet/u3_lesson6-7_live.html' });
    expect(s).toEqual({ surface: 'worksheet', lesson: 'U3 L6-7' });
  });
  it('a single-lesson worksheet -> "U1 L10"', () => {
    const s = loadSurface(faClient, { pathname: '/u1_lesson10_live.html' });
    expect(s).toEqual({ surface: 'worksheet', lesson: 'U1 L10' });
  });
  it('the edgar driller -> edgar (excluded from the worksheet bucket internally)', () => {
    const s = loadSurface(faClient, { pathname: '/edgar_u6_conceptual_driller_live.html' });
    expect(s.surface).toBe('edgar');
  });
  it('a MIT worksheet -> mit', () => {
    const s = loadSurface(faClient, { pathname: '/mit_ocw_6.0001_lec1_live.html' });
    expect(s.surface).toBe('mit');
  });
  it('the study guide -> study-guide', () => {
    const s = loadSurface(faClient, { pathname: '/study_guide_diagnostic.html' });
    expect(s).toEqual({ surface: 'study-guide', lesson: null });
  });
  it('an unknown page -> other', () => {
    const s = loadSurface(faClient, { pathname: '/start-here.html' });
    expect(s.surface).toBe('other');
  });
});

describe('B. curriculum_render _presenceSurface (quiz app + cr worksheets)', () => {
  it('the quiz app index with ?u=3&l=6 -> {quiz, "U3 L6"}', () => {
    const s = loadSurface(crClient, { pathname: '/curriculum_render/index.html', search: '?u=3&l=6' });
    expect(s).toEqual({ surface: 'quiz', lesson: 'U3 L6' });
  });
  it('the quiz root with no params -> {quiz, null}', () => {
    const s = loadSurface(crClient, { pathname: '/curriculum_render/', search: '' });
    expect(s).toEqual({ surface: 'quiz', lesson: null });
  });
  it('a cr worksheet variant -> worksheet', () => {
    const s = loadSurface(crClient, { pathname: '/worksheets/u3l67.html' });
    expect(s.surface).toBe('worksheet');
  });
});

// ── C. Server location logic (sanitize + aggregate) ──────────────────────────────
function loadServerLoc() {
  const sandbox = { console, Map, Set, String, Number };
  createContext(sandbox);
  runInContext(
    "const PRESENCE_SURFACES = new Set(['desk','worksheet','quiz','study-guide','edgar','mit','other']);\n" +
    'const SURFACE_RANK = { desk:6, worksheet:5, quiz:4, "study-guide":3, edgar:2, mit:2, other:1 };\n' +
    'const wsLocation = new Map();\n' +
    fnBody(crServer, 'sanitizeLocation') + '\n' +
    fnBody(crServer, 'aggregateLocation') + '\n' +
    'this.sanitizeLocation = sanitizeLocation; this.aggregateLocation = aggregateLocation; this.wsLocation = wsLocation;',
    sandbox
  );
  return sandbox;
}

describe('C. server sanitizeLocation / aggregateLocation', () => {
  it('sanitize: a known surface passes through; lesson clamps to 40 chars', () => {
    const { sanitizeLocation } = loadServerLoc();
    expect(sanitizeLocation({ surface: 'worksheet', lesson: 'U3 L6-7' })).toEqual({ surface: 'worksheet', lesson: 'U3 L6-7' });
    const long = sanitizeLocation({ surface: 'quiz', lesson: 'x'.repeat(80) });
    expect(long.lesson).toHaveLength(40);
  });
  it('sanitize: an unknown surface degrades to "other"; junk -> null', () => {
    const { sanitizeLocation } = loadServerLoc();
    expect(sanitizeLocation({ surface: 'hacker', lesson: null }).surface).toBe('other');
    expect(sanitizeLocation(null)).toBeNull();
    expect(sanitizeLocation('nope')).toBeNull();
  });
  it('aggregate: a desk connection wins onDesk even alongside a worksheet', () => {
    const { aggregateLocation, wsLocation } = loadServerLoc();
    const a = {}, b = {};
    wsLocation.set(a, { surface: 'worksheet', lesson: 'U3 L6-7' });
    wsLocation.set(b, { surface: 'desk', lesson: null });
    const out = aggregateLocation({ connections: new Set([a, b]) });
    expect(out).toEqual({ surface: 'desk', lesson: null, onDesk: true });
  });
  it('aggregate: worksheet-only -> onDesk false, lesson preserved', () => {
    const { aggregateLocation, wsLocation } = loadServerLoc();
    const a = {};
    wsLocation.set(a, { surface: 'worksheet', lesson: 'U2 L5' });
    expect(aggregateLocation({ connections: new Set([a]) })).toEqual({ surface: 'worksheet', lesson: 'U2 L5', onDesk: false });
  });
  it('aggregate: no known location -> null', () => {
    const { aggregateLocation } = loadServerLoc();
    expect(aggregateLocation({ connections: new Set([{}]) })).toBeNull();
    expect(aggregateLocation(null)).toBeNull();
  });
});

// ── D. The live DogePresence object ──────────────────────────────────────────────
function loadDoge({ teacher = false, gameOpen = false } = {}) {
  // Mirror the REAL nesting: #doge-dropdown lives INSIDE #doge-presence, whose onclick
  // toggles. A row click therefore bubbles to toggle() unless stopPropagation fires.
  document.body.innerHTML =
    '<span id="doge-presence" class="doge-dim"><span id="doge-badge"></span>' +
    '<div id="doge-dropdown"></div></span>';
  const calls = { poke: [], challenge: [], lobbySync: 0, challengeDialog: [] };
  const sandbox = {
    document,
    console,
    window: null,
    localStorage: { getItem: () => null, setItem: () => {} },
    rosterClient: { current: () => ({ username: 'Me_Self', role: teacher ? 'teacher' : 'student' }) },
    getGuestIdentity: () => 'Guest_Anon',
    _deskIsTeacher: () => teacher,
    _isTeacher: () => false,
    _candyPoke: (u) => { calls.poke.push(u); },
    DeskRoster: { realName: () => null, isGuest: () => false, load: () => Promise.resolve() },
    studyBreak: {
      mpOnlinePlayers: [],
      isOpen: () => !!gameOpen,
      updateLobby: () => { calls.lobbySync++; },
      showChallengeDialog: (from) => { calls.challengeDialog.push(from); },
    },
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
    JSON, Math, Date, String, Boolean,
  };
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(
    fnBody(html, '_deskEsc') + '\n' +
    'this.DogePresence = (' + objLiteral(html, 'const DogePresence = {') + ');',
    sandbox
  );
  const D = sandbox.DogePresence;
  D.username = 'Me_Self';   // pin identity (skip the roster/guest lookup)
  D.connected = true;
  // sendChallenge needs an open ws; stub a minimal one that records sends.
  D.ws = { readyState: 1, send: (m) => { calls.challenge.push(JSON.parse(m)); } };
  return { D, calls, sb: sandbox.studyBreak, dd: () => document.getElementById('doge-dropdown').innerHTML };
}

describe('D. DogePresence render — location chips', () => {
  it('a student sees the COARSE bucket (Worksheet), not the lesson', () => {
    const { D, dd } = loadDoge({ teacher: false });
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'worksheet', lesson: 'U3 L6-7', onDesk: false } };
    D.renderDropdown();
    expect(dd()).toContain('>Worksheet<');
    expect(dd()).not.toContain('U3 L6-7');
  });
  it('the TEACHER sees the exact lesson', () => {
    const { D, dd } = loadDoge({ teacher: true });
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'worksheet', lesson: 'U3 L6-7', onDesk: false } };
    D.renderDropdown();
    expect(dd()).toContain('U3 L6-7');
  });
  it('a Desk peer gets the doge-loc-desk chip class', () => {
    const { D, dd } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.renderDropdown();
    expect(dd()).toContain('doge-loc-desk');
  });
  it('an unknown-location peer still renders (no crash, a · chip)', () => {
    const { D, dd } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = {};
    D.renderDropdown();
    expect(dd()).toContain('doge-loc-unknown');
  });
});

describe('D. DogePresence render — self row (Desk = the complete view)', () => {
  it('lists YOU (labeled, counted) but NOT as a clickable .doge-dd-item peer', () => {
    const { D, dd } = loadDoge();   // D.username = 'Me_Self'
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.renderDropdown();
    const html = dd();
    expect(html).toContain('(you)');               // self labeled
    expect(html).toContain('doge-dd-self');         // distinct, non-interactive class
    expect(html).toContain('Online Now (2)');       // 1 peer + you (the complete set)
    // The self row is NOT a .doge-dd-item peer (candy/challenge wiring selects those).
    const peers = document.querySelectorAll('.doge-dd-item');
    expect(peers.length).toBe(1);
    expect(peers[0].getAttribute('onclick') || '').toContain('toggleRow("Ana_Fox")');
  });
  it('shows YOU even with no classmates online (Desk is never empty for you)', () => {
    const { D, dd } = loadDoge();
    D.players = [];
    D.renderDropdown();
    const html = dd();
    expect(html).toContain('(you)');
    expect(html).toContain('Online Now (1)');
    expect(html).toContain('No classmates online yet');
  });
});

describe('D. DogePresence render — no auto-challenge, submenu on click', () => {
  it('a player row toggles a submenu (NOT sendChallenge) on click', () => {
    const { D } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.renderDropdown();
    // getAttribute returns the DECODED onclick (entity-escaped username -> "Ana_Fox").
    const oc = document.querySelector('.doge-dd-item').getAttribute('onclick') || '';
    expect(oc).toContain('DogePresence.toggleRow("Ana_Fox")');
    expect(oc).not.toContain('sendChallenge');
  });
  it('expanding a Desk peer shows an ENABLED challenge button', () => {
    const { D, dd } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.toggleRow('Ana_Fox');
    const out = dd();
    expect(out).toContain('doge-submenu');
    expect(out).toContain('challengeFromMenu');
    expect(out).not.toContain('Challenge (Desk only)');
  });
  it('expanding a worksheet peer DISABLES the challenge (Desk-only)', () => {
    const { D, dd } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'worksheet', lesson: 'U3 L6-7', onDesk: false } };
    D.toggleRow('Ana_Fox');
    const out = dd();
    expect(out).toContain('Challenge (Desk only)');
    expect(out).toContain('disabled');
    expect(out).not.toContain('challengeFromMenu');
  });
  it('the submenu always offers Send candy; candyFromMenu calls _candyPoke', () => {
    const { D, calls } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'worksheet', lesson: 'U3 L6-7', onDesk: false } };
    D.toggleRow('Ana_Fox');
    expect(document.getElementById('doge-dropdown').innerHTML).toContain('candyFromMenu');
    D.candyFromMenu('Ana_Fox');
    expect(calls.poke).toEqual(['Ana_Fox']);
  });
  it('toggleRow twice collapses the submenu', () => {
    const { D, dd } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.toggleRow('Ana_Fox');
    expect(dd()).toContain('doge-submenu');
    D.toggleRow('Ana_Fox');
    expect(dd()).not.toContain('doge-submenu');
  });
  it('challengeFromMenu still routes to the real sendChallenge (game_challenge)', () => {
    const { D, calls } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.challengeFromMenu('Ana_Fox');
    expect(calls.challenge.some((m) => m.type === 'game_challenge' && m.target === 'Ana_Fox')).toBe(true);
  });
});

describe('D. DogePresence — clicks must not bubble the dropdown shut', () => {
  // #doge-dropdown is nested in #doge-presence (onclick=toggle). A standalone jsdom
  // probe confirmed a nested click bubbles to the span — so the row + submenu MUST
  // carry stopPropagation or a click would close the whole menu before the submenu shows.
  it('the row onclick calls event.stopPropagation() before toggleRow', () => {
    const { D } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.renderDropdown();
    const oc = document.querySelector('.doge-dd-item').getAttribute('onclick') || '';
    expect(oc).toMatch(/stopPropagation\(\)\s*;\s*DogePresence\.toggleRow/);
  });
  it('the open submenu container also stops propagation', () => {
    const { D } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.toggleRow('Ana_Fox');
    expect((document.querySelector('.doge-submenu').getAttribute('onclick') || '')).toContain('stopPropagation');
  });
});

describe('D. DogePresence — XSS: a hostile peer username cannot break out of onclick', () => {
  const EVIL = 'a"><img src=x onerror="window.__pwned=1">';
  it('a malicious username injects NO element into the dropdown', () => {
    const { D } = loadDoge();
    D.players = [EVIL];
    D.locations = { [EVIL]: { surface: 'desk', lesson: null, onDesk: true } };
    D.renderDropdown();
    const dd = document.getElementById('doge-dropdown');
    expect(dd.querySelectorAll('img').length).toBe(0);          // no injected <img>
    expect(dd.querySelectorAll('.doge-dd-item').length).toBe(1); // exactly the one real row
  });
  it('expanding a malicious peer still injects nothing (submenu sinks safe)', () => {
    const { D } = loadDoge();
    D.players = [EVIL];
    D.locations = { [EVIL]: { surface: 'desk', lesson: null, onDesk: true } };
    D.toggleRow(EVIL);
    const dd = document.getElementById('doge-dropdown');
    expect(dd.querySelectorAll('img').length).toBe(0);
    expect(dd.querySelector('.doge-submenu')).not.toBeNull();
  });
  it('the rendered onclick carries the entity-encoded username, not a raw breakout', () => {
    const { D, dd } = loadDoge();
    D.players = [EVIL];
    D.locations = { [EVIL]: { surface: 'desk', lesson: null, onDesk: true } };
    D.renderDropdown();
    // The innerHTML must not contain a live `"><img` breakout sequence.
    expect(dd()).not.toContain('"><img');
  });
});

describe('F. Study Break identity — username inherited from the Desk (no Player### ghost)', () => {
  it('connectMultiplayerWS uses the roster identity + reuses the Desk socket (source pin)', () => {
    const m = /connectMultiplayerWS\s*\(\s*\)\s*\{[\s\S]*?\n    \},/.exec(html);
    expect(m).not.toBeNull();
    const body = m[0];
    // mpUsername comes from DogePresence.getUsername() (roster-aware), not a bare random Player###.
    expect(body).toContain('DogePresence.getUsername()');
    expect(body).toContain('this.mpWs = DogePresence.ws'); // reuse the always-on socket
    // The random Player### only survives as a deep fallback, never the primary assignment.
    expect(body).toMatch(/DogePresence\.getUsername\(\)[\s\S]*Player/); // getUsername precedes the fallback
  });
  it('an incoming challenge routes to the in-game modal when Study Break is OPEN', () => {
    const { D, calls } = loadDoge({ gameOpen: true });
    D.onChallengeReceived = (from) => { calls.challenge.push(['wiggle', from]); }; // spy
    D.handleMessage({ type: 'challenge_received', from: 'Ana_Fox' });
    expect(calls.challengeDialog).toEqual(['Ana_Fox']);                 // in-game modal
    expect(calls.challenge.find((c) => c[0] === 'wiggle')).toBeUndefined(); // not the wiggle
  });
  it('an incoming challenge wiggles the doge icon when Study Break is CLOSED', () => {
    const { D, calls } = loadDoge({ gameOpen: false });
    D.onChallengeReceived = (from) => { calls.challenge.push(['wiggle', from]); }; // spy
    D.handleMessage({ type: 'challenge_received', from: 'Ana_Fox' });
    expect(calls.challenge).toContainEqual(['wiggle', 'Ana_Fox']);
    expect(calls.challengeDialog).toEqual([]);
  });
  it('presence changes keep the Study Break lobby player list in sync', () => {
    const { D, sb } = loadDoge({ gameOpen: true });
    D.handleMessage({ type: 'presence_snapshot', users: ['Ana_Fox', 'Bo_Cat', 'Me_Self'], locations: {} });
    expect(sb.mpOnlinePlayers).toEqual(['Ana_Fox', 'Bo_Cat']);    // self dropped, mirrored to the lobby
    D.handleMessage({ type: 'user_offline', username: 'Bo_Cat' });
    expect(sb.mpOnlinePlayers).toEqual(['Ana_Fox']);             // live update on leave
  });
});

describe('E. Study Break lobby — source pins (XSS + onDesk gating)', () => {
  it('the lobby escapes the username and gates the challenge on onDesk', () => {
    const m = /updateLobby\s*\(\s*\)\s*\{[\s\S]*?\n    \},/.exec(html);
    expect(m).not.toBeNull();
    const body = m[0];
    expect(body).toContain('_deskEsc(JSON.stringify(name))'); // XSS-safe onclick arg
    expect(body).toContain('_deskEsc(name)');                 // escaped visible name
    expect(body).toContain('onDesk');                          // location-gated challenge
    expect(body).not.toMatch(/sendChallenge\('\$\{name\.replace/); // old vulnerable pattern gone
  });
});

describe('D. DogePresence presence handlers — location plumbing', () => {
  it('presence_snapshot stores the locations map (and drops self)', () => {
    const { D } = loadDoge();
    D.handleMessage({
      type: 'presence_snapshot',
      users: ['Ana_Fox', 'Me_Self'],
      locations: { Ana_Fox: { surface: 'quiz', lesson: 'U3 L6', onDesk: false } },
    });
    expect(D.players).toEqual(['Ana_Fox']);
    expect(D.locations.Ana_Fox.surface).toBe('quiz');
  });
  it('user_online updates a location even for an already-listed peer', () => {
    const { D } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'worksheet', lesson: 'U3 L6-7', onDesk: false } };
    D.handleMessage({ type: 'user_online', username: 'Ana_Fox', location: { surface: 'desk', lesson: null, onDesk: true } });
    expect(D.locations.Ana_Fox.onDesk).toBe(true);
    expect(D.players).toEqual(['Ana_Fox']); // not duplicated
  });
  it('user_offline removes the peer + its location + any open submenu', () => {
    const { D } = loadDoge();
    D.players = ['Ana_Fox'];
    D.locations = { Ana_Fox: { surface: 'desk', lesson: null, onDesk: true } };
    D.expandedRow = 'Ana_Fox';
    D.handleMessage({ type: 'user_offline', username: 'Ana_Fox' });
    expect(D.players).toEqual([]);
    expect(D.locations.Ana_Fox).toBeUndefined();
    expect(D.expandedRow).toBeNull();
  });
});

describe('D. DogePresence — presence heartbeat (avatar-vs-list agreement)', () => {
  // The doge presence TTL is ~45s server-side; the doge socket must heartbeat or
  // a live-but-backgrounded Desk tab ages out of "Online Now" while its
  // Live-Classroom avatar (a separately-heartbeated socket) stays — the
  // avatar-present / list-absent disagreement. connect() arms a periodic
  // heartbeat and clears it on re-arm/close/error so it can't leak or double-fire.
  it('connect() arms a periodic presence heartbeat send', () => {
    expect(html).toMatch(/this\._hbTimer\s*=\s*setInterval/);
    expect(html).toMatch(/type:\s*'heartbeat'/);
  });
  it('the heartbeat is cleared on re-arm + close + error (no leak/double-fire)', () => {
    const clears = (html.match(/clearInterval\(this\._hbTimer\)/g) || []).length;
    expect(clears).toBeGreaterThanOrEqual(3); // onopen re-arm + onclose + onerror
  });
});

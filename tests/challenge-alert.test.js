/**
 * STUDY_BREAK_CHALLENGE_ALERT_SPEC — an incoming Study Break challenge is impossible to miss.
 *
 * Runs the REAL DogePresence object literal from the Desk in a jsdom sandbox and drives the
 * challenge path: receipt opens the big dialog by itself, the desk breathes, the tab title flips,
 * accept/decline/expiry clear everything, expiry SENDS a decline, Enter = yes / Escape = no.
 * Message shapes are pinned: the relay strips unknown fields, so they must never change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { runInContext, createContext } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf8');

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

function sandbox() {
  const dom = new JSDOM(`<!doctype html><html><head><title>AP Stats Desk</title></head><body>
    <span id="doge-presence" class="doge-dim"><img src="Doge-Asset.png" alt="Doge">
      <span id="doge-badge" style="display:none"></span>
      <div id="doge-dropdown" class="doge-dropdown"></div>
      <div id="doge-challenge-panel" class="doge-challenge-panel" style="display:none"></div>
    </span></body></html>`, { url: 'https://robjohncolson.github.io/apstats-live-worksheet/' });
  const w = dom.window;
  const sent = [];
  const s = {
    window: w, document: w.document, setInterval: w.setInterval, clearInterval: w.clearInterval,
    setTimeout: w.setTimeout, clearTimeout: w.clearTimeout, console,
    MacSFX: { play: vi.fn() },
    _deskEsc: (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    studyBreak: { isOpen: () => false },
    localStorage: w.localStorage,
  };
  createContext(s);
  runInContext('const DogePresence = ' + objLiteral(html, 'const DogePresence = {') + '; this.DogePresence = DogePresence;', s);
  const D = s.DogePresence;
  D.players = []; D.connected = true; D.locations = {}; D.dropdownOpen = false;
  D.ws = { readyState: 1, send: (m) => sent.push(JSON.parse(m)) };
  D.closeDropdown = D.closeDropdown || (() => {});
  return { D, w, doc: w.document, sent, close: () => w.close() };
}

describe('Study Break challenge alert (Desk)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('receipt opens the big dialog by itself, breathes the desk, and flips the tab title', () => {
    const { D, doc, close } = sandbox();
    try {
      D.onChallengeReceived('lemon_seal');
      const panel = doc.getElementById('doge-challenge-panel');
      expect(panel.style.display).toBe('block');
      expect(panel.textContent).toContain('lemon_seal wants to play');
      expect(panel.querySelector('img.challenge-doge').getAttribute('src')).toBe('Doge-Asset.png');
      expect(panel.querySelector('.btn-accept').textContent).toMatch(/YES, PLAY/);
      expect(panel.querySelector('.btn-decline').textContent).toBe('NO');
      expect(doc.getElementById('challenge-countdown').textContent).toBe('25s');
      expect(doc.body.classList.contains('challenge-waiting')).toBe(true);
      expect(doc.title).toBe('🐕 Challenge! — AP Stats Desk');
      expect(doc.getElementById('doge-presence').classList.contains('doge-wiggle')).toBe(true);
    } finally { close(); }
  });

  it('escapes the challenger name (usernames are untrusted presence data)', () => {
    const { D, doc, close } = sandbox();
    try {
      D.onChallengeReceived('<img src=x onerror=alert(1)>');
      expect(doc.getElementById('doge-challenge-panel').querySelector('img[src="x"]')).toBeNull();
      expect(doc.getElementById('doge-challenge-panel').textContent).toContain('<img src=x');
    } finally { close(); }
  });

  it('YES sends challenge_accept with the exact shape and clears everything', () => {
    const { D, doc, sent, close } = sandbox();
    try {
      D.onChallengeReceived('lemon_seal');
      D.acceptChallenge();
      expect(sent).toEqual([{ type: 'challenge_accept', from: 'lemon_seal' }]);
      expect(D.incomingChallenge).toBeNull();
      expect(doc.getElementById('doge-challenge-panel').style.display).toBe('none');
      expect(doc.body.classList.contains('challenge-waiting')).toBe(false);
      expect(doc.title).toBe('AP Stats Desk');
      expect(doc.getElementById('doge-presence').classList.contains('doge-wiggle')).toBe(false);
    } finally { close(); }
  });

  it('NO sends challenge_decline and clears everything', () => {
    const { D, doc, sent, close } = sandbox();
    try {
      D.onChallengeReceived('lemon_seal');
      D.declineChallenge();
      expect(sent).toEqual([{ type: 'challenge_decline', from: 'lemon_seal' }]);
      expect(doc.body.classList.contains('challenge-waiting')).toBe(false);
      expect(doc.title).toBe('AP Stats Desk');
    } finally { close(); }
  });

  it('expiry at 25s SENDS a decline (was silent) and counts down visibly', () => {
    const { D, doc, sent, close } = sandbox();
    try {
      D.onChallengeReceived('lemon_seal');
      vi.advanceTimersByTime(10_000);
      expect(doc.getElementById('challenge-countdown').textContent).toBe('15s');
      expect(sent).toEqual([]);
      vi.advanceTimersByTime(15_000);
      expect(sent).toEqual([{ type: 'challenge_decline', from: 'lemon_seal' }]);
      expect(D.incomingChallenge).toBeNull();
      expect(doc.body.classList.contains('challenge-waiting')).toBe(false);
    } finally { close(); }
  });

  it('a second challenge replaces the first without leaking its timer', () => {
    const { D, doc, sent, close } = sandbox();
    try {
      D.onChallengeReceived('lemon_seal');
      D.onChallengeReceived('quince_lion');
      expect(doc.getElementById('doge-challenge-panel').textContent).toContain('quince_lion wants to play');
      vi.advanceTimersByTime(25_000);
      expect(sent).toEqual([{ type: 'challenge_decline', from: 'quince_lion' }]);
      expect(doc.title).toBe('AP Stats Desk');
    } finally { close(); }
  });

  it('clicks inside the dialog do not bubble to the menubar toggle', () => {
    const { D, doc, w, close } = sandbox();
    try {
      const toggles = vi.fn();
      doc.getElementById('doge-presence').addEventListener('click', toggles);
      D.onChallengeReceived('lemon_seal');
      doc.getElementById('doge-challenge-panel').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      expect(toggles).not.toHaveBeenCalled();
    } finally { close(); }
  });
});

describe('Study Break challenge alert (source pins)', () => {
  it('the desk breathes gold while waiting, and holds a steady tint under reduced motion', () => {
    expect(html).toMatch(/@keyframes challenge-breathe/);
    expect(html).toMatch(/body\.challenge-waiting \{ animation: challenge-breathe/);
    expect(html).toMatch(/prefers-reduced-motion: reduce\) \{\s*body\.challenge-waiting \{ animation: none; background-color: #[0-9A-Fa-f]{6}; \}/);
  });

  it('the dialog is a big centered fixed panel with 44px buttons', () => {
    const css = html.slice(html.indexOf('.doge-challenge-panel {'), html.indexOf('.doge-challenge-panel .challenge-btns .btn-accept'));
    expect(css).toMatch(/position: fixed;\s*left: 50%;\s*top: 50%;/);
    expect(css).toMatch(/min-height: 44px;/);
  });

  it('Escape declines and Enter accepts at the global keydown handlers', () => {
    const esc = html.slice(html.indexOf("if (e.key === 'Escape') {\n        var signinRoster"), html.indexOf('var gameOpen = !!(typeof studyBreak'));
    expect(esc).toContain('DogePresence.declineChallenge();');
    expect(esc).not.toContain("document.getElementById('doge-challenge-panel').style.display = 'none'");
    expect(html).toMatch(/if \(e\.key !== 'Enter' \|\| !DogePresence\.incomingChallenge\) return;[\s\S]{0,400}DogePresence\.acceptChallenge\(\);/);
  });

  it('the in-game modal breathes too and stops on resolution', () => {
    const dlg = html.slice(html.indexOf('showChallengeDialog(fromUser) {'), html.indexOf('startMatch(data) {'));
    expect(dlg).toContain("document.body.classList.add('challenge-waiting')");
    expect((dlg.match(/classList\.remove\('challenge-waiting'\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * tests/desk-nudge-toast.test.js
 *
 * P3 -- Teacher to Student Console: nudge toast (TEACHER_STUDENT_CONSOLE_SPEC.md
 * Section 6 + TEACHER_STUDENT_CONSOLE_P3_BUILD.md Section 4.1).
 *
 * Student-side toast that appears when a 'classroom_teacher_nudge' WS message
 * arrives via the ClassroomBoard mount's onClassroomMessage callback. Includes
 * a soft chime, reply textarea, and send/dismiss buttons.
 *
 * Source assertions + Node `vm` runtime of the real helpers (mirrors
 * tests/desk-view-as.test.js).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
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

// ============================================================================
// 1. Structure pins
// ============================================================================

describe('nudge toast -- structure', () => {
  it('toast DOM is present in <body>, hidden by default', () => {
    expect(html).toMatch(/id="nudge-toast"\s+style="display:none"/);
  });

  it('toast has required IDs: from-name, text, reply textarea, send button, close', () => {
    const m = /id="nudge-toast"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
    expect(m).toBeTruthy();
    expect(html).toMatch(/id="nudge-toast-from"/);
    expect(html).toMatch(/id="nudge-toast-text"/);
    expect(html).toMatch(/id="nudge-toast-reply"/);
    expect(html).toMatch(/id="nudge-toast-send"/);
    expect(html).toMatch(/id="nudge-toast-close"/);
  });

  it('reply textarea enforces maxlength=280', () => {
    expect(html).toMatch(/id="nudge-toast-reply"[^>]*maxlength="280"/);
  });

  it('toast CSS rule is present', () => {
    expect(html).toMatch(/#nudge-toast\s*\{[\s\S]*?position:\s*fixed/);
  });

  it('ClassroomBoard.mount call includes onClassroomMessage hook for teacher nudge', () => {
    const idx = html.indexOf('onClassroomMessage');
    expect(idx).toBeGreaterThan(-1);
    expect(html).toMatch(/classroom_teacher_nudge[\s\S]{0,200}_showNudgeToast/);
  });

  it('_playNudgeChime, _showNudgeToast, _hideNudgeToast, _sendNudgeReply functions exist', () => {
    expect(fnBody(html, '_playNudgeChime')).toMatch(/AudioContext|webkitAudioContext/);
    expect(fnBody(html, '_showNudgeToast')).toMatch(/_activeNudge/);
    expect(fnBody(html, '_hideNudgeToast')).toMatch(/display\s*=\s*['"]none['"]/);
    expect(fnBody(html, '_sendNudgeReply')).toMatch(/_activeNudge/);
  });
});

// ============================================================================
// 2. _showNudgeToast behavioral
// ============================================================================

function makeFakeDoc(els) {
  return {
    getElementById: (id) => els[id] || null,
  };
}

function loadShowToast(elsBuilder) {
  const els = elsBuilder();
  const sandbox = {
    document: makeFakeDoc(els),
    _playNudgeChime: () => { els._chimeCalled = (els._chimeCalled || 0) + 1; },
    _activeNudge: null,
  };
  createContext(sandbox);
  // Patch in the var _activeNudge declaration + _showNudgeToast body.
  runInContext(
    'var _activeNudge = null;\n' +
    fnBody(html, '_showNudgeToast') + '\n' +
    'this.__f = _showNudgeToast; this.__getActiveNudge = function() { return _activeNudge; };',
    sandbox);
  return { f: sandbox.__f, els, getActiveNudge: sandbox.__getActiveNudge };
}

describe('nudge toast -- _showNudgeToast', () => {
  it('reveals the toast + populates from + text + chime', () => {
    const { f, els, getActiveNudge } = loadShowToast(() => ({
      'nudge-toast': { style: { display: 'none' } },
      'nudge-toast-from': { textContent: '' },
      'nudge-toast-text': { textContent: '' },
      'nudge-toast-reply': { value: 'stale' },
      'nudge-toast-send': { disabled: true },
    }));
    f({ nudgeId: 'nudge_1', text: 'Try problem 3', fromUsername: 'mr_colson', ts: 123 });
    expect(els['nudge-toast'].style.display).toBe('block');
    expect(els['nudge-toast-from'].textContent).toBe('mr_colson');
    expect(els['nudge-toast-text'].textContent).toBe('Try problem 3');
    expect(els['nudge-toast-reply'].value).toBe('');
    expect(els['nudge-toast-send'].disabled).toBe(false);
    expect(els._chimeCalled).toBe(1);
    const active = getActiveNudge();
    expect(active.nudgeId).toBe('nudge_1');
    expect(active.fromUsername).toBe('mr_colson');
  });

  it('falls back to "Teacher" when fromUsername is missing', () => {
    const { f, els } = loadShowToast(() => ({
      'nudge-toast': { style: { display: 'none' } },
      'nudge-toast-from': { textContent: '' },
      'nudge-toast-text': { textContent: '' },
      'nudge-toast-reply': { value: '' },
      'nudge-toast-send': { disabled: false },
    }));
    f({ nudgeId: 'n', text: 'hi' });
    expect(els['nudge-toast-from'].textContent).toBe('Teacher');
  });

  it('tolerates a missing toast root (no throw)', () => {
    const sandbox = {
      document: { getElementById: () => null },
      _playNudgeChime: () => {},
    };
    createContext(sandbox);
    runInContext(
      'var _activeNudge = null;\n' +
      fnBody(html, '_showNudgeToast') + '\n' +
      'this.__f = _showNudgeToast;',
      sandbox);
    expect(() => sandbox.__f({ nudgeId: 'n', text: 't' })).not.toThrow();
  });
});

// ============================================================================
// 3. _hideNudgeToast behavioral
// ============================================================================

function loadHideToast(toastEl) {
  const sandbox = {
    document: { getElementById: (id) => (id === 'nudge-toast' ? toastEl : null) },
    _activeNudge: { nudgeId: 'x', fromUsername: 'y' },
  };
  createContext(sandbox);
  runInContext(
    'var _activeNudge = { nudgeId: "x", fromUsername: "y" };\n' +
    fnBody(html, '_hideNudgeToast') + '\n' +
    'this.__f = _hideNudgeToast; this.__getActive = function() { return _activeNudge; };',
    sandbox);
  return { f: sandbox.__f, getActive: sandbox.__getActive };
}

describe('nudge toast -- _hideNudgeToast', () => {
  it('hides the toast + clears _activeNudge', () => {
    const toast = { style: { display: 'block' } };
    const { f, getActive } = loadHideToast(toast);
    f();
    expect(toast.style.display).toBe('none');
    expect(getActive()).toBe(null);
  });

  it('tolerates a missing toast root (no throw)', () => {
    const { f } = loadHideToast(null);
    expect(() => f()).not.toThrow();
  });
});

// ============================================================================
// 4. _playNudgeChime behavioral
// ============================================================================

describe('nudge toast -- _playNudgeChime', () => {
  it('tolerates absent AudioContext (no throw, silent)', () => {
    const sandbox = { window: {} };
    createContext(sandbox);
    runInContext(fnBody(html, '_playNudgeChime') + '\nthis.__f = _playNudgeChime;', sandbox);
    expect(() => sandbox.__f()).not.toThrow();
  });

  it('creates oscillator + gain when AudioContext exists', () => {
    let oscStarted = false;
    let oscStopped = false;
    function FakeAC() {
      this.currentTime = 0;
      this.destination = {};
      this.createOscillator = function () {
        return {
          type: '', frequency: { value: 0 },
          connect: () => {},
          start: () => { oscStarted = true; },
          stop: () => { oscStopped = true; }
        };
      };
      this.createGain = function () {
        return {
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          },
          connect: () => {}
        };
      };
    }
    const sandbox = { window: { AudioContext: FakeAC } };
    createContext(sandbox);
    runInContext(fnBody(html, '_playNudgeChime') + '\nthis.__f = _playNudgeChime;', sandbox);
    sandbox.__f();
    expect(oscStarted).toBe(true);
    expect(oscStopped).toBe(true);
  });
});

// ============================================================================
// 5. _sendNudgeReply behavioral
// ============================================================================

function loadSendReply({ activeNudge, replyText, fetchMock, sendMessageMock, token = 'TOK' }) {
  const sentMessages = [];
  const fetches = [];
  const els = {
    'nudge-toast': { style: { display: 'block' } },
    'nudge-toast-reply': { value: replyText },
    'nudge-toast-send': { disabled: false },
    'nudge-toast-from': { textContent: '' },
    'nudge-toast-text': { textContent: '' },
  };
  const sandbox = {
    document: { getElementById: (id) => els[id] || null },
    _activeNudge: activeNudge,
    _classroomBoardHandle: sendMessageMock ? { sendMessage: (m) => sentMessages.push(m) } : null,
    window: {
      ROSTER_SERVICE_URL: 'https://x',
      rosterClient: { token: () => token },
    },
    fetch: fetchMock || ((url, opts) => { fetches.push({ url, opts }); return Promise.resolve({ json: async () => ({ ok: true }) }); }),
    JSON,
    String,
    setTimeout: (fn) => fn(),
  };
  createContext(sandbox);
  runInContext(
    'var _activeNudge = ' + JSON.stringify(activeNudge) + ';\n' +
    fnBody(html, '_hideNudgeToast') + '\n' +
    fnBody(html, '_sendNudgeReply') + '\n' +
    'this.__f = _sendNudgeReply;',
    sandbox);
  return { f: sandbox.__f, sentMessages, fetches, els };
}

describe('nudge toast -- _sendNudgeReply', () => {
  it('sends WS message + POSTs to roster when text is non-empty', async () => {
    const { f, sentMessages, fetches } = loadSendReply({
      activeNudge: { nudgeId: 'n1', fromUsername: 'teacher' },
      replyText: 'On it!',
      sendMessageMock: true,
    });
    await f();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].type).toBe('classroom_student_nudge_reply');
    expect(sentMessages[0].nudgeId).toBe('n1');
    expect(sentMessages[0].text).toBe('On it!');
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/student\/nudge-reply$/);
    expect(fetches[0].opts.method).toBe('POST');
  });

  it('no-ops when text is empty / whitespace-only', async () => {
    const { f, sentMessages, fetches } = loadSendReply({
      activeNudge: { nudgeId: 'n1', fromUsername: 'teacher' },
      replyText: '   ',
      sendMessageMock: true,
    });
    await f();
    expect(sentMessages.length).toBe(0);
    expect(fetches.length).toBe(0);
  });

  it('truncates text > 280 chars before sending', async () => {
    const longText = 'x'.repeat(400);
    const { f, sentMessages } = loadSendReply({
      activeNudge: { nudgeId: 'n1', fromUsername: 'teacher' },
      replyText: longText,
      sendMessageMock: true,
    });
    await f();
    expect(sentMessages[0].text.length).toBe(280);
  });

  it('skips WS + POST when _activeNudge is null', async () => {
    const { f, sentMessages, fetches } = loadSendReply({
      activeNudge: null,
      replyText: 'hi',
      sendMessageMock: true,
    });
    await f();
    expect(sentMessages.length).toBe(0);
    expect(fetches.length).toBe(0);
  });

  it('hides the toast after sending', async () => {
    const { f, els } = loadSendReply({
      activeNudge: { nudgeId: 'n1', fromUsername: 't' },
      replyText: 'reply',
      sendMessageMock: true,
    });
    await f();
    expect(els['nudge-toast'].style.display).toBe('none');
  });
});

// ============================================================================
// 6. CSS shape
// ============================================================================

describe('nudge toast -- CSS', () => {
  it('toast is position:fixed in the top-right corner', () => {
    expect(html).toMatch(/#nudge-toast\s*\{[\s\S]*?position:\s*fixed;\s*top:[\s\S]*?right:/);
  });

  it('send button styling is present', () => {
    expect(html).toMatch(/#nudge-toast\s+\.nt-send/);
  });
});

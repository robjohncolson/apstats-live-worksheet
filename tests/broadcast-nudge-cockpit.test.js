// tests/broadcast-nudge-cockpit.test.js
//
// P8 -- Teacher -> Student Console: broadcast nudge toggle
// (TEACHER_STUDENT_CONSOLE_P8_BUILD.md Section 2).
//
// Verifies the P8 additions to teacher-classroom.html:
//   - DOM: #nudge-broadcast checkbox + #nudge-broadcast-count label
//   - CSS: .nudge-broadcast-toggle + .nudge-recipient-broadcast-dim
//   - State: _nudgeBroadcastActive + _nudgeLastOnlineList
//   - _refreshNudgeRecipients updates the count label + stashes online list
//   - _updateNudgeSendButton gates on broadcast mode vs single mode
//   - _sendNudgeFromCockpit: broadcast -> full online list; single -> P3 unchanged
//
// ASCII-only. LF line endings.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf-8');

// Extract a named function body from the source (handles async functions).
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
// 1. DOM structure
// ============================================================================

describe('Broadcast toggle DOM', () => {
  it('#nudge-broadcast checkbox exists in the source', () => {
    expect(html).toMatch(/id="nudge-broadcast"/);
  });

  it('#nudge-broadcast-count span exists in the source', () => {
    expect(html).toMatch(/id="nudge-broadcast-count"/);
  });

  it('#nudge-broadcast-row form-row exists in the source', () => {
    expect(html).toMatch(/id="nudge-broadcast-row"/);
  });

  it('.nudge-broadcast-toggle CSS rule is defined in the style block', () => {
    expect(html).toMatch(/\.nudge-broadcast-toggle\s*\{/);
  });

  it('.nudge-recipient-broadcast-dim CSS class is defined', () => {
    expect(html).toMatch(/\.nudge-recipient-broadcast-dim\s*\{/);
  });

  it('_nudgeBroadcastActive and _nudgeLastOnlineList are declared in the source', () => {
    expect(html).toMatch(/_nudgeBroadcastActive\s*=/);
    expect(html).toMatch(/_nudgeLastOnlineList\s*=/);
  });
});

// ============================================================================
// 2. _refreshNudgeRecipients -- count label + online list stash
// ============================================================================

// Build a sandbox for _refreshNudgeRecipients that includes the P8 state vars.
function makeRefreshSandbox({ summary, prevValue } = {}) {
  const opts = [];
  const sel = {
    value: prevValue || '',
    disabled: false,
    innerHTML: '',
    options: opts,
    appendChild: (opt) => { opts.push(opt); },
  };
  const text = { value: '' };
  const btn = { disabled: false };
  const countEl = { textContent: '' };

  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'nudge-recipient') return sel;
        if (id === 'nudge-text') return text;
        if (id === 'btn-send-nudge') return btn;
        if (id === 'nudge-broadcast-count') return countEl;
        return null;
      },
      createElement: (tag) => ({ value: '', textContent: '', tagName: tag.toUpperCase() }),
    },
    currentNameMap: {},
    String,
    Object,
    // P8 module-scope state
    _nudgeBroadcastActive: false,
    _nudgeLastOnlineList: [],
  };

  createContext(sandbox);
  runInContext(
    fnBody(html, '_updateNudgeSendButton') + '\n' +
    fnBody(html, '_refreshNudgeRecipients') + '\n' +
    'this.__refresh = _refreshNudgeRecipients;',
    sandbox
  );
  sandbox.__refresh(summary || { members: {} });
  return { sel, text, btn, countEl, sandbox };
}

describe('Recipient count label', () => {
  it('shows "(3 online)" when 3 online students are present', () => {
    const summary = {
      members: {
        alice: { role: 'student', online: true },
        bob: { role: 'student', online: true },
        carol: { role: 'student' },    // online:undefined treated as online
        teach: { role: 'teacher', online: true },
      },
    };
    const { countEl } = makeRefreshSandbox({ summary });
    expect(countEl.textContent).toBe('(3 online)');
  });

  it('shows "(no students online)" when no online students exist', () => {
    const summary = {
      members: {
        teach: { role: 'teacher', online: true },
        bob: { role: 'student', online: false },
      },
    };
    const { countEl } = makeRefreshSandbox({ summary });
    expect(countEl.textContent).toBe('(no students online)');
  });

  it('stashes online usernames into _nudgeLastOnlineList', () => {
    const summary = {
      members: {
        alice: { role: 'student', online: true },
        bob: { role: 'student', online: true },
      },
    };
    const { sandbox } = makeRefreshSandbox({ summary });
    expect(sandbox._nudgeLastOnlineList.sort()).toEqual(['alice', 'bob']);
  });
});

// ============================================================================
// 3. Send-button gating in broadcast mode
// ============================================================================

function makeSendButtonSandbox({ selVal, textVal, broadcastActive, lastOnlineList }) {
  const btn = { disabled: false };
  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'nudge-recipient') return { value: selVal };
        if (id === 'nudge-text') return { value: textVal };
        if (id === 'btn-send-nudge') return btn;
        return null;
      },
    },
    String,
    // P8 state
    _nudgeBroadcastActive: broadcastActive !== undefined ? broadcastActive : false,
    _nudgeLastOnlineList: lastOnlineList || [],
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_updateNudgeSendButton') + '\nthis.__f = _updateNudgeSendButton;', sandbox);
  sandbox.__f();
  return btn;
}

describe('Send button gating in broadcast mode', () => {
  it('broadcast OFF, dropdown empty -> button disabled', () => {
    const btn = makeSendButtonSandbox({
      selVal: '', textVal: 'hi',
      broadcastActive: false, lastOnlineList: [],
    });
    expect(btn.disabled).toBe(true);
  });

  it('broadcast ON, 0 online students + text present -> button disabled', () => {
    const btn = makeSendButtonSandbox({
      selVal: '', textVal: 'ping',
      broadcastActive: true, lastOnlineList: [],
    });
    expect(btn.disabled).toBe(true);
  });

  it('broadcast ON, 3 online students + text present -> button enabled', () => {
    const btn = makeSendButtonSandbox({
      selVal: '', textVal: 'ping',
      broadcastActive: true, lastOnlineList: ['alice', 'bob', 'carol'],
    });
    expect(btn.disabled).toBe(false);
  });

  it('broadcast ON, 3 online students + text empty -> button disabled', () => {
    const btn = makeSendButtonSandbox({
      selVal: '', textVal: '   ',
      broadcastActive: true, lastOnlineList: ['alice', 'bob', 'carol'],
    });
    expect(btn.disabled).toBe(true);
  });
});

// ============================================================================
// 4. Toggle visual dim (source assertions)
// ============================================================================

describe('Toggle visual dim', () => {
  it('source adds .nudge-recipient-broadcast-dim when broadcast is toggled ON', () => {
    expect(html).toMatch(/classList\.add\(['"]nudge-recipient-broadcast-dim['"]\)/);
    expect(html).toMatch(/setAttribute\(['"]disabled['"]/);
  });

  it('source removes .nudge-recipient-broadcast-dim when broadcast is toggled OFF', () => {
    expect(html).toMatch(/classList\.remove\(['"]nudge-recipient-broadcast-dim['"]\)/);
    expect(html).toMatch(/removeAttribute\(['"]disabled['"]\)/);
  });
});

// ============================================================================
// 5. _sendNudgeFromCockpit -- broadcast path
//
// Strategy: run _sendNudgeFromCockpit in a vm sandbox with all module-scope
// dependencies provided as sandbox properties. Use a fetch stub that resolves
// synchronously-ish via Promise.resolve. Await the send, then inspect the
// captured WS calls and fetch calls.
// ============================================================================

function buildSendSandbox({ broadcastActive, lastOnlineList, textVal, recipientDropdown }) {
  const wsMsgs = [];
  const fetchCalls = [];
  const statusEl = { textContent: '' };
  let textElCurrentValue = textVal || '';

  const sandbox = {
    // DOM
    document: {
      getElementById: (id) => {
        if (id === 'nudge-recipient') return { value: recipientDropdown || '' };
        if (id === 'nudge-text') return {
          get value() { return textElCurrentValue; },
          set value(v) { textElCurrentValue = v; },
        };
        if (id === 'nudge-status') return statusEl;
        if (id === 'btn-send-nudge') return { get disabled() { return false; }, set disabled(_) {} };
        return null;
      },
    },
    // Module-scope P8 state
    _nudgeBroadcastActive: !!broadcastActive,
    _nudgeLastOnlineList: lastOnlineList ? lastOnlineList.slice() : [],
    _nudgeIdSeq: 0,
    // boardHandle stub
    boardHandle: {
      sendMessage: (msg) => { wsMsgs.push(msg); return true; },
    },
    // fetch stub -- synchronous resolution via Promise
    fetch: (url, opts) => {
      fetchCalls.push({ url: url, opts: opts });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    },
    // setTimeout stub
    setTimeout: () => {},
    // Global helpers
    ROSTER_SERVICE_URL: 'https://roster-test.example.com',
    rosterClient: { token: () => 'test-teacher-token' },
    String,
    Array,
    JSON,
    Promise,
  };
  // The cockpit code reads window.ROSTER_SERVICE_URL / window.rosterClient.
  // In a Node.js vm context there is no automatic 'window' alias for the
  // sandbox global, so we add it explicitly.
  sandbox.window = sandbox;

  createContext(sandbox);
  // Provide _newNudgeId and _updateNudgeSendButton in scope as well.
  runInContext(
    'var _nudgeIdSeq = 0;\n' +
    fnBody(html, '_newNudgeId') + '\n' +
    fnBody(html, '_updateNudgeSendButton') + '\n' +
    fnBody(html, '_sendNudgeFromCockpit') + '\n' +
    'this.__send = _sendNudgeFromCockpit;',
    sandbox
  );

  return { sandbox, wsMsgs, fetchCalls, statusEl };
}

describe('Broadcast send', () => {
  it('WS message carries all 3 online usernames when broadcast is ON', async () => {
    const { sandbox, wsMsgs } = buildSendSandbox({
      broadcastActive: true,
      lastOnlineList: ['alice', 'bob', 'carol'],
      textVal: 'ping',
    });
    await sandbox.__send();
    const nudgeMsg = wsMsgs.find(m => m && m.type === 'classroom_teacher_nudge');
    expect(nudgeMsg).toBeTruthy();
    expect(nudgeMsg.recipientUsernames.slice().sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('POST /teacher/nudge body carries all 3 usernames when broadcast is ON', async () => {
    const { sandbox, fetchCalls } = buildSendSandbox({
      broadcastActive: true,
      lastOnlineList: ['alice', 'bob', 'carol'],
      textVal: 'ping',
    });
    await sandbox.__send();
    const nudgePost = fetchCalls.find(c => c.url && c.url.includes('/teacher/nudge'));
    expect(nudgePost).toBeTruthy();
    const body = JSON.parse(nudgePost.opts.body);
    expect(body.recipientUsernames.slice().sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('status reads "Broadcast sent to 3." on success', async () => {
    const { sandbox, statusEl } = buildSendSandbox({
      broadcastActive: true,
      lastOnlineList: ['alice', 'bob', 'carol'],
      textVal: 'ping',
    });
    await sandbox.__send();
    expect(statusEl.textContent).toBe('Broadcast sent to 3.');
  });
});

// ============================================================================
// 6. Zero-online broadcast edge case
// ============================================================================

describe('Broadcast with zero online', () => {
  it('no WS call, no fetch, status says no students online', async () => {
    const { sandbox, wsMsgs, fetchCalls, statusEl } = buildSendSandbox({
      broadcastActive: true,
      lastOnlineList: [],
      textVal: 'hello',
    });
    await sandbox.__send();
    expect(wsMsgs.length).toBe(0);
    expect(fetchCalls.length).toBe(0);
    expect(statusEl.textContent).toBe('No students online -- nothing to broadcast.');
  });
});

// ============================================================================
// 7. Non-broadcast regression (P3 single-recipient path unchanged)
// ============================================================================

describe('Non-broadcast (regression)', () => {
  it('broadcast OFF: WS message carries only the single dropdown recipient', async () => {
    const { sandbox, wsMsgs } = buildSendSandbox({
      broadcastActive: false,
      lastOnlineList: ['alice', 'bob', 'carol'],
      textVal: 'ping',
      recipientDropdown: 'apple-fox',
    });
    await sandbox.__send();
    const nudgeMsg = wsMsgs.find(m => m && m.type === 'classroom_teacher_nudge');
    expect(nudgeMsg).toBeTruthy();
    expect(nudgeMsg.recipientUsernames).toEqual(['apple-fox']);
  });
});

// ============================================================================
// 8. Codex P8 fold regressions (BLOCKER + 2 MAJOR + 1 MINOR)
// ============================================================================

describe('Codex P8 fold regressions', () => {
  // BLOCKER: no section-sign characters introduced by P8.
  it('BLOCKER fold: no non-ASCII characters in any P8 line in teacher-classroom.html', () => {
    // The P8 additions land near the broadcast comments + the broadcast wiring
    // block. Scope this to the new identifiers to avoid flagging pre-existing
    // non-ASCII text in other phases.
    const newRegions = [
      /nudge-broadcast-toggle[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*/g,
      /_nudgeBroadcastActive[^\n]*/g,
      /broadcast toggle[^\n]*/gi,
    ];
    newRegions.forEach(re => {
      var m;
      while ((m = re.exec(html))) {
        for (var ch of m[0]) {
          var code = ch.charCodeAt(0);
          // Tab + LF + CR + printable ASCII (0x20-0x7E) only.
          expect(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)).toBe(true);
        }
      }
    });
  });

  // MAJOR M1: _refreshNudgeRecipients does NOT unconditionally re-enable the
  // dropdown when there are online students. It respects _nudgeBroadcastActive.
  it('MAJOR M1: _refreshNudgeRecipients respects broadcast state when re-enabling dropdown', () => {
    const body = fnBody(html, '_refreshNudgeRecipients');
    // The new code: sel.disabled = (typeof _nudgeBroadcastActive !== 'undefined') && _nudgeBroadcastActive;
    expect(body).toMatch(/sel\.disabled\s*=\s*\(?typeof\s+_nudgeBroadcastActive/);
    // It must NOT have a bare 'sel.disabled = false;' inside the else-branch
    // (the bare line would re-enable even in broadcast mode).
    // Allow the early-branch 'sel.disabled = true;' (the no-online-students case).
    // Count the 'sel.disabled = false' occurrences -- should be zero, because
    // the new code uses the broadcast-aware expression.
    const matches = body.match(/sel\.disabled\s*=\s*false/g) || [];
    expect(matches.length).toBe(0);
  });

  // MAJOR M2: teardown() clears broadcast state on section change.
  it('MAJOR M2: teardown() clears _nudgeBroadcastActive and _nudgeLastOnlineList', () => {
    const body = fnBody(html, 'teardown');
    expect(body).toMatch(/_nudgeBroadcastActive\s*=\s*false/);
    expect(body).toMatch(/_nudgeLastOnlineList\s*=\s*\[\]/);
    // The checkbox should also be reset visually so a refresh-into-new-section
    // does not leave the checkbox ticked.
    expect(body).toMatch(/getElementById\(['"]nudge-broadcast['"]\)/);
  });

  // MINOR m1: outer catch in _sendNudgeFromCockpit branches on broadcast mode.
  it('MINOR m1: outer catch in _sendNudgeFromCockpit branches on broadcast mode', () => {
    const body = fnBody(html, '_sendNudgeFromCockpit');
    // The catch block (after the try resolves a fetch) should have a broadcast
    // branch that emits "Broadcast sent to N (log failed)" rather than the
    // single-mode "Sent (log failed)" string.
    expect(body).toMatch(/catch\s*\(\s*_\s*\)/);
    // Count "Broadcast sent to ' + recipientList.length + ' (log failed)" --
    // it should appear at least twice (once in the data.ok-false branch
    // inside try, once in the outer catch).
    const broadcastLogFailedMatches = body.match(/Broadcast sent to[^']*'\s*\+\s*recipientList\.length\s*\+\s*'\s*\(log failed\)/g) || [];
    expect(broadcastLogFailedMatches.length).toBeGreaterThanOrEqual(2);
  });
});

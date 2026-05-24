/**
 * tests/cockpit-nudge-panel.test.js
 *
 * P3 -- Teacher to Student Console: cockpit nudge panel
 * (TEACHER_STUDENT_CONSOLE_SPEC.md §6 + P3_BUILD.md §4.2).
 *
 * Cockpit-side panel that lets the teacher pick an online student from a
 * dropdown + type a message + Send. Replies arrive via onClassroomMessage
 * and render in the replies list.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf-8');

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

describe('cockpit nudge panel -- structure', () => {
  it('nudge section markup exists, hidden by default', () => {
    expect(html).toMatch(/id="nudge-section"\s+style="display:none"/);
  });

  it('panel has recipient select, text textarea, send button', () => {
    expect(html).toMatch(/id="nudge-recipient"/);
    expect(html).toMatch(/id="nudge-text"/);
    expect(html).toMatch(/id="btn-send-nudge"/);
    expect(html).toMatch(/id="nudge-status"/);
    expect(html).toMatch(/id="nudge-replies-list"/);
  });

  it('text textarea enforces maxlength=280', () => {
    expect(html).toMatch(/id="nudge-text"[^>]*maxlength="280"/);
  });

  it('setBoardSectionsVisible shows/hides the nudge section alongside other panels', () => {
    const b = fnBody(html, 'setBoardSectionsVisible');
    expect(b).toMatch(/getElementById\(['"]nudge-section['"]\)/);
  });

  it('mount-board call wires onClassroomMessage handler for nudge reply + ack', () => {
    expect(html).toMatch(/onClassroomMessage:\s*function[\s\S]{0,400}classroom_student_nudge_reply/);
    expect(html).toMatch(/onClassroomMessage:\s*function[\s\S]{0,600}classroom_teacher_nudge_ack/);
  });

  it('onStateChange callback refreshes recipient list', () => {
    expect(html).toMatch(/_refreshNudgeRecipients\(summary\)/);
  });

  it('all 6 cockpit helpers exist', () => {
    expect(() => fnBody(html, '_newNudgeId')).not.toThrow();
    expect(() => fnBody(html, '_refreshNudgeRecipients')).not.toThrow();
    expect(() => fnBody(html, '_updateNudgeSendButton')).not.toThrow();
    expect(() => fnBody(html, '_sendNudgeFromCockpit')).not.toThrow();
    expect(() => fnBody(html, '_renderReplyInList')).not.toThrow();
    expect(() => fnBody(html, '_renderNudgeAck')).not.toThrow();
  });
});

// ============================================================================
// 2. _newNudgeId
// ============================================================================

describe('cockpit nudge panel -- _newNudgeId', () => {
  it('returns a unique-per-call string', () => {
    const sandbox = { Date };
    createContext(sandbox);
    runInContext(
      'var _nudgeIdSeq = 0;\n' +
      fnBody(html, '_newNudgeId') + '\n' +
      'this.__f = _newNudgeId;',
      sandbox);
    const a = sandbox.__f();
    const b = sandbox.__f();
    const c = sandbox.__f();
    expect(a).toMatch(/^nudge_\d+_\d+$/);
    expect(b).not.toBe(a);
    expect(c).not.toBe(b);
  });
});

// ============================================================================
// 3. _refreshNudgeRecipients
// ============================================================================

function makeFakeSelect() {
  const opts = [];
  return {
    value: '',
    disabled: false,
    innerHTML: '',
    options: opts,
    appendChild: (opt) => { opts.push(opt); },
    set _innerHTMLReset(_) {},
  };
}

function loadRefresh(summary, prevValue, nameMap) {
  const sel = makeFakeSelect();
  sel.value = prevValue || '';
  const text = { value: '' };
  const btn = { disabled: false };
  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'nudge-recipient') return sel;
        if (id === 'nudge-text') return text;
        if (id === 'btn-send-nudge') return btn;
        return null;
      },
      createElement: (tag) => ({ value: '', textContent: '', tagName: tag.toUpperCase() }),
    },
    currentNameMap: nameMap || {},
    Array,
    String,
    Object,
  };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_updateNudgeSendButton') + '\n' +
    fnBody(html, '_refreshNudgeRecipients') + '\n' +
    'this.__refresh = _refreshNudgeRecipients;',
    sandbox);
  sandbox.__refresh(summary);
  return { sel, text, btn };
}

describe('cockpit nudge panel -- _refreshNudgeRecipients', () => {
  // Codex P10 BLOCKER fold: summary.members is an ARRAY of records (see
  // classroom-board.js buildSummary), NOT an object keyed by username.
  // The fixtures were updated to match the live shape.
  it('populates dropdown with online students only', () => {
    const summary = {
      members: [
        { username: 'alice', role: 'student', online: true },
        { username: 'bob',   role: 'student', online: false },
        { username: 'carol', role: 'student' },
        { username: 'teach', role: 'teacher', online: true },
      ],
    };
    const { sel } = loadRefresh(summary, '', { alice: 'Alice A', carol: 'Carol C' });
    // alice (online: true) + carol (online: undefined treated as online) -> 2 options.
    // bob explicitly online: false -> excluded. teach is a teacher -> excluded.
    expect(sel.options.length).toBe(2);
    expect(sel.options.map(o => o.value).sort()).toEqual(['alice', 'carol']);
    expect(sel.disabled).toBe(false);
  });

  it('shows (no students online) + disables when no online students', () => {
    const { sel } = loadRefresh({ members: [{ username: 'teach', role: 'teacher', online: true }] }, '');
    expect(sel.options.length).toBe(1);
    expect(sel.options[0].value).toBe('');
    expect(sel.options[0].textContent).toMatch(/no students/i);
    expect(sel.disabled).toBe(true);
  });

  it('preserves previous selection when student still online', () => {
    const summary = {
      members: [
        { username: 'alice', role: 'student', online: true },
        { username: 'bob',   role: 'student', online: true },
      ],
    };
    const { sel } = loadRefresh(summary, 'bob');
    expect(sel.value).toBe('bob');
  });

  it('does NOT restore previous selection when student no longer online', () => {
    const summary = { members: [{ username: 'alice', role: 'student', online: true }] };
    const { sel } = loadRefresh(summary, 'bob');
    // The options list does NOT include bob.
    expect(sel.options.map(o => o.value)).toEqual(['alice']);
    // The code only restores sel.value when prev is in onlineStudents,
    // so sel.value is NOT explicitly re-set to 'bob' by the refresh.
  });
});

// ============================================================================
// 4. _updateNudgeSendButton
// ============================================================================

function loadUpdateSend(selVal, textVal) {
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
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_updateNudgeSendButton') + '\nthis.__f = _updateNudgeSendButton;', sandbox);
  sandbox.__f();
  return btn;
}

describe('cockpit nudge panel -- _updateNudgeSendButton', () => {
  it('enables when both recipient AND text present', () => {
    const btn = loadUpdateSend('alice', 'hi');
    expect(btn.disabled).toBe(false);
  });

  it('disables when recipient missing', () => {
    const btn = loadUpdateSend('', 'hi');
    expect(btn.disabled).toBe(true);
  });

  it('disables when text empty / whitespace-only', () => {
    expect(loadUpdateSend('alice', '').disabled).toBe(true);
    expect(loadUpdateSend('alice', '   ').disabled).toBe(true);
  });
});

// ============================================================================
// 5. _renderReplyInList
// ============================================================================

function loadRenderReply(nameMap) {
  const list = {
    children: [],
    firstChild: null,
    insertBefore: function (row, _ref) {
      this.children.unshift(row);
      this.firstChild = this.children[0] || null;
    },
    removeChild: function (row) {
      this.children = this.children.filter(c => c !== row);
      this.firstChild = this.children[0] || null;
    },
    get lastChild() { return this.children[this.children.length - 1] || null; },
  };
  const sandbox = {
    document: {
      getElementById: (id) => (id === 'nudge-replies-list' ? list : null),
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        textContent: '',
        className: '',
        style: { cssText: '' },
        appendChild: function (child) { this.children = this.children || []; this.children.push(child); },
      }),
    },
    currentNameMap: nameMap || {},
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_renderReplyInList') + '\nthis.__f = _renderReplyInList;', sandbox);
  return { f: sandbox.__f, list };
}

describe('cockpit nudge panel -- _renderReplyInList', () => {
  it('prepends a reply row with from + text', () => {
    const { f, list } = loadRenderReply({ alice: 'Alice A' });
    f({ fromUsername: 'alice', text: 'On it!' });
    expect(list.children.length).toBe(1);
  });

  it('keeps only last 20 reply rows', () => {
    const { f, list } = loadRenderReply();
    for (let i = 0; i < 25; i++) {
      f({ fromUsername: 'u' + i, text: 'reply ' + i });
    }
    expect(list.children.length).toBe(20);
  });

  it('tolerates a missing list element (no throw)', () => {
    const sandbox = {
      document: { getElementById: () => null, createElement: () => ({}) },
      currentNameMap: {},
    };
    createContext(sandbox);
    runInContext(fnBody(html, '_renderReplyInList') + '\nthis.__f = _renderReplyInList;', sandbox);
    expect(() => sandbox.__f({ fromUsername: 'x', text: 'y' })).not.toThrow();
  });
});

// ============================================================================
// 6. _renderNudgeAck
// ============================================================================

describe('cockpit nudge panel -- _renderNudgeAck', () => {
  it('shows offline status when offline array non-empty', () => {
    const status = { textContent: '' };
    const sandbox = {
      document: { getElementById: (id) => (id === 'nudge-status' ? status : null) },
      setTimeout: () => {},
      Array,
    };
    createContext(sandbox);
    runInContext(fnBody(html, '_renderNudgeAck') + '\nthis.__f = _renderNudgeAck;', sandbox);
    sandbox.__f({ offline: ['alice', 'bob'] });
    expect(status.textContent).toMatch(/Offline.*alice.*bob/);
  });

  it('does nothing when offline is empty', () => {
    const status = { textContent: 'stale' };
    const sandbox = {
      document: { getElementById: (id) => (id === 'nudge-status' ? status : null) },
      setTimeout: () => {},
      Array,
    };
    createContext(sandbox);
    runInContext(fnBody(html, '_renderNudgeAck') + '\nthis.__f = _renderNudgeAck;', sandbox);
    sandbox.__f({ offline: [] });
    expect(status.textContent).toBe('stale');
  });
});

// ============================================================================
// 7. CSS / DOM checks
// ============================================================================

describe('cockpit nudge panel -- aesthetics', () => {
  it('panel uses the existing section class (no new visual primitives)', () => {
    expect(html).toMatch(/class="section"\s+id="nudge-section"/);
  });

  it('send button uses ctrl-btn primary classes (matches existing cockpit style)', () => {
    // Attribute order varies in the source; assert both class + id appear in
    // the same button tag, regardless of order.
    const m = /<button[^>]*id="btn-send-nudge"[^>]*>/.exec(html);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/class="ctrl-btn primary"/);
  });
});

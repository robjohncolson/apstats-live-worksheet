/**
 * tests/cockpit-select-students.test.js
 *
 * P4 -- Teacher to Student Console: Select Students mode
 * (TEACHER_STUDENT_CONSOLE_SPEC.md §11 + P4_BUILD.md).
 *
 * Cockpit toggle + multi-pick + group nudge. Avatar hit-testing in
 * classroom-board.js fires onAvatarClick; cockpit toggles selection.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf-8');
const boardJs = readFileSync(resolve(REPO_ROOT, 'classroom-board.js'), 'utf-8');

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

describe('Select Students -- structure', () => {
  it('select-students-section panel exists in the cockpit', () => {
    expect(html).toMatch(/id="select-students-section"\s+style="display:none"/);
    expect(html).toMatch(/id="btn-select-students"/);
  });

  it('select-bar overlay + markers overlay are present, hidden by default', () => {
    expect(html).toMatch(/id="select-bar"\s+style="display:none"/);
    expect(html).toMatch(/id="select-markers"\s+style="display:none"/);
    expect(html).toMatch(/id="select-bar-count"/);
    expect(html).toMatch(/id="select-bar-text"[^>]*maxlength="280"/);
    expect(html).toMatch(/id="btn-select-send"/);
    expect(html).toMatch(/id="btn-select-cancel"/);
  });

  it('CSS rules for select-mode + select-bar + markers', () => {
    expect(html).toMatch(/canvas\.classroom-select-mode\s*\{[\s\S]*?filter:\s*grayscale/);
    expect(html).toMatch(/#select-bar\s*\{[\s\S]*?position:\s*fixed/);
    expect(html).toMatch(/#select-markers\s+\.sel-marker/);
  });

  it('setBoardSectionsVisible toggles select-students-section', () => {
    const b = fnBody(html, 'setBoardSectionsVisible');
    expect(b).toMatch(/getElementById\(['"]select-students-section['"]\)/);
  });

  it('mount-board call wires onAvatarClick', () => {
    expect(html).toMatch(/onAvatarClick:\s*function[\s\S]{0,400}_toggleSelectAvatar/);
  });

  it('all 6 helpers are present in the cockpit', () => {
    expect(() => fnBody(html, '_enterSelectMode')).not.toThrow();
    expect(() => fnBody(html, '_exitSelectMode')).not.toThrow();
    expect(() => fnBody(html, '_toggleSelectAvatar')).not.toThrow();
    expect(() => fnBody(html, '_updateSelectBar')).not.toThrow();
    expect(() => fnBody(html, '_renderSelectMarkers')).not.toThrow();
    expect(() => fnBody(html, '_sendSelectedNudge')).not.toThrow();
  });

  it('classroom-board.js exposes setSelectMode + getCanvas + getSpritePosition on the handle', () => {
    expect(boardJs).toMatch(/setSelectMode:\s*function/);
    expect(boardJs).toMatch(/getCanvas:\s*function/);
    expect(boardJs).toMatch(/getSpritePosition:\s*function/);
  });

  it('classroom-board.js applyPos has the selectModeActive freeze gate', () => {
    const b = fnBody(boardJs, 'applyPos');
    expect(b).toMatch(/if\s*\(\s*selectModeActive\s*\)\s*return/);
  });

  it('classroom-board.js binds opts.onAvatarClick + tracks selectModeActive', () => {
    expect(boardJs).toMatch(/var\s+onAvatarClick\s*=\s*\(typeof\s+opts\.onAvatarClick/);
    expect(boardJs).toMatch(/var\s+selectModeActive\s*=\s*false/);
  });
});

// ============================================================================
// 2. _enterSelectMode / _exitSelectMode
// ============================================================================

function makeBoardHandle(spritePositions) {
  const calls = [];
  return {
    setSelectMode: (on) => { calls.push({ kind: 'setSelectMode', on }); },
    sendMessage: (m) => { calls.push({ kind: 'sendMessage', m }); return true; },
    getCanvas: () => null,
    getSpritePosition: (u) => spritePositions ? spritePositions[u] || null : null,
    section: 'PeriodX',
    _calls: calls,
  };
}

function loadEnterExit(initialActive, boardHandle) {
  const els = {
    'select-bar': { style: { display: 'none' } },
    'select-markers': { style: { display: 'none' }, innerHTML: '' },
    'btn-select-students': { textContent: 'Select Students' },
    'select-bar-text': { value: 'stale' },
    'select-bar-count': { textContent: '' },
    'btn-select-send': { disabled: false },
  };
  // Stub window so _enterSelectMode / _exitSelectMode can add/remove
  // their resize listener (Codex MINOR fold P4) without throwing.
  const listeners = [];
  const sandbox = {
    Set,
    document: { getElementById: (id) => els[id] || null },
    boardHandle: boardHandle,
    String,
    window: {
      addEventListener: (k, fn) => { listeners.push({ k, fn }); },
      removeEventListener: (k, fn) => {
        const i = listeners.findIndex(l => l.k === k && l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    },
  };
  createContext(sandbox);
  runInContext(
    'var _selectModeActive = ' + initialActive + ';\n' +
    'var _selectedUsernames = new Set();\n' +
    'var _selectResizeHandler = null;\n' +
    fnBody(html, '_updateSelectBar') + '\n' +
    fnBody(html, '_renderSelectMarkers') + '\n' +
    fnBody(html, '_enterSelectMode') + '\n' +
    fnBody(html, '_exitSelectMode') + '\n' +
    'this.__enter = _enterSelectMode; this.__exit = _exitSelectMode;' +
    'this.__active = function() { return _selectModeActive; };' +
    'this.__selected = function() { return _selectedUsernames; };',
    sandbox);
  return { enter: sandbox.__enter, exit: sandbox.__exit, els, active: sandbox.__active, selected: sandbox.__selected, listeners };
}

describe('Select Students -- _enterSelectMode / _exitSelectMode', () => {
  it('enter sets active true + shows bar + calls boardHandle.setSelectMode(true)', () => {
    const bh = makeBoardHandle();
    const { enter, els, active } = loadEnterExit(false, bh);
    enter();
    expect(active()).toBe(true);
    expect(els['select-bar'].style.display).toBe('flex');
    expect(els['select-markers'].style.display).toBe('block');
    expect(els['btn-select-students'].textContent).toBe('Exit Select Mode');
    expect(bh._calls.filter(c => c.kind === 'setSelectMode').some(c => c.on === true)).toBe(true);
  });

  it('exit clears selection + hides bar + calls setSelectMode(false)', () => {
    const bh = makeBoardHandle();
    const { exit, els, active, selected } = loadEnterExit(true, bh);
    selected().add('alice');
    selected().add('bob');
    exit();
    expect(active()).toBe(false);
    expect(selected().size).toBe(0);
    expect(els['select-bar'].style.display).toBe('none');
    expect(els['btn-select-students'].textContent).toBe('Select Students');
    expect(bh._calls.filter(c => c.kind === 'setSelectMode').some(c => c.on === false)).toBe(true);
  });

  it('enter no-op when already active', () => {
    const bh = makeBoardHandle();
    const { enter } = loadEnterExit(true, bh);
    enter();
    expect(bh._calls.filter(c => c.kind === 'setSelectMode').length).toBe(0);
  });

  it('exit no-op when already inactive', () => {
    const bh = makeBoardHandle();
    const { exit } = loadEnterExit(false, bh);
    exit();
    expect(bh._calls.filter(c => c.kind === 'setSelectMode').length).toBe(0);
  });
});

// ============================================================================
// 3. _toggleSelectAvatar
// ============================================================================

function loadToggle(initialActive, initialSelected) {
  const els = {
    'select-bar-count': { textContent: '' },
    'btn-select-send': { disabled: false },
    'select-bar-text': { value: '' },
    'select-markers': { innerHTML: '', parentNode: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
  };
  const sandbox = {
    Set,
    document: { getElementById: (id) => els[id] || null },
    boardHandle: { getSpritePosition: () => null, getCanvas: () => null },
    String,
  };
  createContext(sandbox);
  const setInit = 'var _selectedUsernames = new Set(' +
    (initialSelected ? JSON.stringify(initialSelected) : '') + ');\n';
  runInContext(
    'var _selectModeActive = ' + initialActive + ';\n' +
    setInit +
    fnBody(html, '_updateSelectBar') + '\n' +
    fnBody(html, '_renderSelectMarkers') + '\n' +
    fnBody(html, '_toggleSelectAvatar') + '\n' +
    'this.__toggle = _toggleSelectAvatar;' +
    'this.__selected = function() { return _selectedUsernames; };',
    sandbox);
  return { toggle: sandbox.__toggle, selected: sandbox.__selected };
}

describe('Select Students -- _toggleSelectAvatar', () => {
  it('adds to set when not present', () => {
    const { toggle, selected } = loadToggle(true, []);
    toggle('alice');
    expect(selected().has('alice')).toBe(true);
  });

  it('removes from set when present', () => {
    const { toggle, selected } = loadToggle(true, ['alice']);
    toggle('alice');
    expect(selected().has('alice')).toBe(false);
  });

  it('no-op when select mode inactive', () => {
    const { toggle, selected } = loadToggle(false, []);
    toggle('alice');
    expect(selected().size).toBe(0);
  });

  it('no-op when username is empty', () => {
    const { toggle, selected } = loadToggle(true, []);
    toggle('');
    toggle(null);
    expect(selected().size).toBe(0);
  });
});

// ============================================================================
// 4. _updateSelectBar
// ============================================================================

function loadUpdateBar(count, textVal) {
  const sel = new Set();
  for (let i = 0; i < count; i++) sel.add('u' + i);
  const els = {
    'select-bar-count': { textContent: '' },
    'select-bar-text': { value: textVal },
    'btn-select-send': { disabled: false },
  };
  const sandbox = {
    Set,
    document: { getElementById: (id) => els[id] || null },
    String,
  };
  createContext(sandbox);
  runInContext(
    'var _selectModeActive = true;\n' +
    'var _selectedUsernames = ' + JSON.stringify(Array.from(sel)) + ';\n' +
    '_selectedUsernames = new Set(_selectedUsernames);\n' +
    fnBody(html, '_updateSelectBar') + '\n' +
    'this.__f = _updateSelectBar;',
    sandbox);
  sandbox.__f();
  return els;
}

describe('Select Students -- _updateSelectBar', () => {
  it('count text reflects size', () => {
    const els = loadUpdateBar(3, 'hi');
    expect(els['select-bar-count'].textContent).toBe('3 selected');
  });

  it('Send disabled when count=0', () => {
    const els = loadUpdateBar(0, 'hi');
    expect(els['btn-select-send'].disabled).toBe(true);
  });

  it('Send disabled when text empty', () => {
    const els = loadUpdateBar(2, '');
    expect(els['btn-select-send'].disabled).toBe(true);
  });

  it('Send enabled when count >= 1 AND text non-empty', () => {
    const els = loadUpdateBar(1, 'hi');
    expect(els['btn-select-send'].disabled).toBe(false);
  });
});

// ============================================================================
// 5. _renderSelectMarkers
// ============================================================================

describe('Select Students -- _renderSelectMarkers', () => {
  it('renders one .sel-marker per selected user', () => {
    const positions = { alice: { x: 100, y: 80 }, bob: { x: 200, y: 80 } };
    const created = [];
    const markers = {
      innerHTML: '',
      appendChild: (div) => { created.push(div); },
    };
    const fakeCanvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 220 }),
      width: 320,
      height: 220,
    };
    const sandbox = {
      Set,
      document: {
        getElementById: (id) => id === 'select-markers' ? markers : null,
        createElement: () => ({ className: '', style: {}, setAttribute: function (k, v) { this[k] = v; } }),
      },
      boardHandle: {
        getCanvas: () => fakeCanvas,
        getSpritePosition: (u) => positions[u] || null,
      },
      Math,
    };
    createContext(sandbox);
    runInContext(
      'var _selectModeActive = true;\n' +
      'var _selectedUsernames = new Set(["alice", "bob"]);\n' +
      fnBody(html, '_renderSelectMarkers') + '\n' +
      'this.__f = _renderSelectMarkers;',
      sandbox);
    sandbox.__f();
    expect(created.length).toBe(2);
  });

  it('no markers when set empty', () => {
    const markers = { innerHTML: 'stale', appendChild: () => { throw new Error('should not append'); } };
    const sandbox = {
      Set,
      document: { getElementById: (id) => id === 'select-markers' ? markers : null },
      boardHandle: { getCanvas: () => null, getSpritePosition: () => null },
      Math,
    };
    createContext(sandbox);
    runInContext(
      'var _selectModeActive = true;\n' +
      'var _selectedUsernames = new Set();\n' +
      fnBody(html, '_renderSelectMarkers') + '\n' +
      'this.__f = _renderSelectMarkers;',
      sandbox);
    expect(() => sandbox.__f()).not.toThrow();
    expect(markers.innerHTML).toBe('');
  });
});

// ============================================================================
// 6. _sendSelectedNudge
// ============================================================================

function loadSendSelected({ selectedSet, text, sendMessageReturns = true, fetchOk = true, token = 'TOK' }) {
  const fetches = [];
  const sentMessages = [];
  const els = {
    'select-bar-text': { value: text },
    'btn-select-send': { disabled: false },
    'select-bar': { style: { display: 'flex' } },
    'select-markers': { style: { display: 'block' }, innerHTML: '' },
    'btn-select-students': { textContent: 'Exit Select Mode' },
    'select-bar-count': { textContent: '' },
  };
  const sandbox = {
    Array, Set, String, JSON, setTimeout: (fn) => fn(),
    document: { getElementById: (id) => els[id] || null },
    window: {
      ROSTER_SERVICE_URL: 'https://x',
      rosterClient: { token: () => token },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    boardHandle: {
      sendMessage: (m) => { sentMessages.push(m); return sendMessageReturns; },
      setSelectMode: () => {},
    },
  };
  // Capture fetch calls. Codex MAJOR fold P4: response includes `.ok` so
  // _sendSelectedNudge can read resp.ok before parsing JSON.
  sandbox.fetch = (url, opts) => {
    fetches.push({ url, opts });
    return Promise.resolve({ ok: fetchOk, status: fetchOk ? 200 : 500, json: async () => ({ ok: fetchOk }) });
  };
  createContext(sandbox);
  runInContext(
    'var _nudgeIdSeq = 0;\n' +
    'function _newNudgeId() { _nudgeIdSeq++; return "nudge_" + Date.now() + "_" + _nudgeIdSeq; }\n' +
    'var _selectModeActive = true;\n' +
    'var _selectedUsernames = new Set(' + JSON.stringify(Array.from(selectedSet)) + ');\n' +
    'var _selectResizeHandler = null;\n' +
    fnBody(html, '_updateSelectBar') + '\n' +
    fnBody(html, '_renderSelectMarkers') + '\n' +
    fnBody(html, '_exitSelectMode') + '\n' +
    fnBody(html, '_sendSelectedNudge') + '\n' +
    'this.__f = _sendSelectedNudge;',
    sandbox);
  return { f: sandbox.__f, fetches, sentMessages, els };
}

describe('Select Students -- _sendSelectedNudge', () => {
  it('sends WS classroom_teacher_nudge with the full recipient list + POSTs roster log', async () => {
    const { f, fetches, sentMessages } = loadSendSelected({
      selectedSet: ['alice', 'bob'],
      text: 'Group nudge!',
    });
    await f();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].type).toBe('classroom_teacher_nudge');
    expect(sentMessages[0].recipientUsernames.sort()).toEqual(['alice', 'bob']);
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/teacher\/nudge$/);
  });

  it('truncates text > 280 chars before sending', async () => {
    const longText = 'x'.repeat(400);
    const { f, sentMessages } = loadSendSelected({
      selectedSet: ['alice'],
      text: longText,
    });
    await f();
    expect(sentMessages[0].text.length).toBe(280);
  });

  it('skips send when no selection', async () => {
    const { f, sentMessages, fetches } = loadSendSelected({
      selectedSet: [],
      text: 'hi',
    });
    await f();
    expect(sentMessages.length).toBe(0);
    expect(fetches.length).toBe(0);
  });

  it('skips send when text empty', async () => {
    const { f, sentMessages, fetches } = loadSendSelected({
      selectedSet: ['alice'],
      text: '   ',
    });
    await f();
    expect(sentMessages.length).toBe(0);
    expect(fetches.length).toBe(0);
  });

  it('exits select mode after a successful send (UI cleared)', async () => {
    const { f, els } = loadSendSelected({
      selectedSet: ['alice'],
      text: 'hi',
    });
    await f();
    expect(els['select-bar'].style.display).toBe('none');
    expect(els['btn-select-students'].textContent).toBe('Select Students');
  });

  it('passes deliveredUsernames=[] when sendMessage returns false (WS not ready)', async () => {
    const { f, fetches } = loadSendSelected({
      selectedSet: ['alice'],
      text: 'hi',
      sendMessageReturns: false,
    });
    await f();
    const body = JSON.parse(fetches[0].opts.body);
    expect(body.deliveredUsernames).toEqual([]);
  });
});

// tests/avatar-popup-cockpit.test.js
//
// P9 -- Teacher -> Student Console: floating avatar popup
// (TEACHER_STUDENT_CONSOLE_P9_BUILD.md Section 2).
//
// Verifies the P9 additions to teacher-classroom.html:
//   - DOM: #avatar-popup with 6 data-ap-action buttons + close button
//   - CSS: .avatar-popup rules
//   - State: _avatarPopupStudent, open/close lifecycle
//   - _computeAvatarPopupPos: positioning and edge-flip
//   - _handleAvatarClickRouted: popup vs select-mode routing
//   - _handleAvatarPopupAction: cross-tab open + send-nudge pre-fill
//   - _prefillNudgePanelForStudent: broadcast clear + dropdown + focus
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
// 1. Popup DOM presence
// ============================================================================

describe('Popup DOM presence', () => {
  it('#avatar-popup element exists in the source with display:none', () => {
    expect(html).toMatch(/id="avatar-popup"/);
    expect(html).toMatch(/style="display:none"/);
  });

  it('has 6 data-ap-action buttons with correct values', () => {
    const expected = ['view-as', 'view-grade', 'view-recent', 'send-nudge', 'apply-remediation', 'override-gate'];
    expected.forEach(action => {
      expect(html).toContain('data-ap-action="' + action + '"');
    });
  });

  it('has a close button with id="avatar-popup-close"', () => {
    expect(html).toMatch(/id="avatar-popup-close"/);
  });

  it('.avatar-popup CSS class is defined in the style block', () => {
    expect(html).toMatch(/\.avatar-popup\s*\{/);
  });

  it('.ap-action CSS class is defined', () => {
    expect(html).toMatch(/\.avatar-popup .ap-action\s*\{/);
  });
});

// ============================================================================
// 2. Open / close lifecycle
// ============================================================================

function makeLifecycleSandbox() {
  let popupDisplay = 'none';
  let popupAriaHidden = 'true';
  let popupLeft = '';
  let popupTop = '';
  let popupDataView = 'main';
  const nameEl = { textContent: '' };
  const metaEl = { textContent: '' };

  // P11: views array for querySelectorAll stub.
  const viewItems = [
    { _name: 'main', _display: '' },
    { _name: 'nudge', _display: 'none' },
    { _name: 'remediation', _display: 'none' },
    { _name: 'gate', _display: 'none' },
  ].map(function (v) {
    return {
      getAttribute: (k) => (k === 'data-ap-view' ? v._name : null),
      get style() {
        const self = this;
        const store = v;
        return {
          get display() { return store._display; },
          set display(val) { store._display = val; },
        };
      },
    };
  });

  // P11: form field stubs for _closeAvatarPopup clear.
  const formFieldIds = ['ap-nudge-text','ap-rem-unit','ap-rem-skill','ap-rem-notes','ap-gate-key','ap-gate-reason'];
  const formEls = {};
  formFieldIds.forEach(function (id) { formEls[id] = { value: 'prefilled' }; });

  const popup = {
    get style() {
      return {
        get display() { return popupDisplay; },
        set display(v) { popupDisplay = v; },
        get left() { return popupLeft; },
        set left(v) { popupLeft = v; },
        get top() { return popupTop; },
        set top(v) { popupTop = v; },
      };
    },
    getAttribute: (k) => {
      if (k === 'aria-hidden') return popupAriaHidden;
      if (k === 'data-view') return popupDataView;
      return null;
    },
    setAttribute: (k, v) => {
      if (k === 'aria-hidden') popupAriaHidden = v;
      if (k === 'data-view') popupDataView = v;
    },
    contains: () => false,
    querySelectorAll: () => viewItems,
  };

  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'avatar-popup') return popup;
        if (id === 'avatar-popup-name') return nameEl;
        if (id === 'avatar-popup-meta') return metaEl;
        if (formEls[id]) return formEls[id];
        return null;
      },
    },
    currentNameMap: { 'alice': 'Alice Johnson' },
    currentIdMap: { 'alice': 'stu_alice_001' },
    boardHandle: null,
    _lastSummary: { section: 'PeriodB' },
    _selectModeActive: false,
    _avatarPopupStudent: null,
    _avatarPopupSpritePos: null,
    window: { innerWidth: 1024, innerHeight: 768 },
    String,
    Object,
  };
  sandbox.window = sandbox;

  createContext(sandbox);
  // P11 fold: include _resetAvatarPopupTransientState so the typeof-guarded
  // calls inside _openAvatarPopup + _closeAvatarPopup actually fire in the
  // sandbox (and clear the form values that the P11 regression tests check).
  // Also include _avatarPopupAutoCloseTimer state.
  runInContext(
    'var _avatarPopupAutoCloseTimer = null;\n' +
    fnBody(html, '_resetAvatarPopupTransientState') + '\n' +
    fnBody(html, '_openAvatarPopup') + '\n' +
    fnBody(html, '_closeAvatarPopup') + '\n' +
    fnBody(html, '_avatarPopupIsOpen') + '\n' +
    'this.__open = _openAvatarPopup;\n' +
    'this.__close = _closeAvatarPopup;\n' +
    'this.__isOpen = _avatarPopupIsOpen;',
    sandbox
  );

  return { sandbox, popup, nameEl, metaEl, formEls, viewItems,
           getDisplay: () => popupDisplay, getAriaHidden: () => popupAriaHidden,
           getDataView: () => popupDataView };
}

describe('Open/close lifecycle', () => {
  it('_openAvatarPopup sets display:block and populates name + meta', () => {
    const { sandbox, getDisplay, nameEl, metaEl } = makeLifecycleSandbox();
    sandbox.__open({ username: 'alice' }, { x: 100, y: 200 });
    expect(getDisplay()).toBe('block');
    expect(nameEl.textContent).toBe('Alice Johnson');
    expect(metaEl.textContent).toContain('@alice');
    expect(metaEl.textContent).toContain('PeriodB');
  });

  it('_openAvatarPopup sets _avatarPopupStudent with resolved fields', () => {
    const { sandbox } = makeLifecycleSandbox();
    sandbox.__open({ username: 'alice' }, { x: 0, y: 0 });
    expect(sandbox._avatarPopupStudent).toBeTruthy();
    expect(sandbox._avatarPopupStudent.username).toBe('alice');
    expect(sandbox._avatarPopupStudent.realName).toBe('Alice Johnson');
    expect(sandbox._avatarPopupStudent.studentId).toBe('stu_alice_001');
    expect(sandbox._avatarPopupStudent.section).toBe('PeriodB');
  });

  it('_closeAvatarPopup hides the popup and clears _avatarPopupStudent', () => {
    const { sandbox, getDisplay } = makeLifecycleSandbox();
    sandbox.__open({ username: 'alice' }, { x: 100, y: 200 });
    sandbox.__close();
    expect(getDisplay()).toBe('none');
    expect(sandbox._avatarPopupStudent).toBeNull();
  });

  it('P11: _closeAvatarPopup resets data-view to "main"', () => {
    const { sandbox, getDataView } = makeLifecycleSandbox();
    sandbox.__open({ username: 'alice' }, { x: 0, y: 0 });
    sandbox.__close();
    expect(getDataView()).toBe('main');
  });

  it('P11: _closeAvatarPopup clears all form input values', () => {
    const { sandbox, formEls } = makeLifecycleSandbox();
    sandbox.__open({ username: 'alice' }, { x: 0, y: 0 });
    sandbox.__close();
    Object.values(formEls).forEach(function (el) {
      expect(el.value).toBe('');
    });
  });

  it('_avatarPopupIsOpen returns true when display is block', () => {
    const { sandbox } = makeLifecycleSandbox();
    sandbox.__open({ username: 'alice' }, { x: 0, y: 0 });
    expect(sandbox.__isOpen()).toBe(true);
  });

  it('_avatarPopupIsOpen returns false when display is none', () => {
    const { sandbox } = makeLifecycleSandbox();
    expect(sandbox.__isOpen()).toBe(false);
  });
});

// ============================================================================
// 3. Position computation
// ============================================================================

function makePosSandbox({ popupW = 220, popupH = 200, innerWidth = 1024, innerHeight = 768 } = {}) {
  const popup = { offsetWidth: popupW, offsetHeight: popupH };
  const sandbox = {
    document: { getElementById: (id) => (id === 'avatar-popup' ? popup : null) },
    innerWidth: innerWidth,
    innerHeight: innerHeight,
    _avatarPopupStudent: null,
    String, Object,
  };
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(
    fnBody(html, '_computeAvatarPopupPos') + '\n' +
    'this.__pos = _computeAvatarPopupPos;',
    sandbox
  );
  return sandbox;
}

describe('Position computation', () => {
  it('places popup to the RIGHT + vertically centered for a sprite at center', () => {
    const sandbox = makePosSandbox();
    // Canvas rect: left=100, top=100; sprite at (200, 300) canvas coords.
    const canvas = {
      getBoundingClientRect: () => ({ left: 100, top: 100, width: 400, height: 400 }),
    };
    const pos = sandbox.__pos(canvas, 200, 300);
    // x = rect.left + sx + 24 = 100 + 200 + 24 = 324
    expect(pos.x).toBe(324);
    // y = rect.top + sy - popupH/2 = 100 + 300 - 100 = 300
    expect(pos.y).toBe(300);
  });

  it('flips to the left when the popup would overflow the right edge', () => {
    // viewport 800 wide; canvas at left=0; sprite at x=760 -> right would be 760+24+220=1004 > 800-8=792
    const sandbox = makePosSandbox({ innerWidth: 800 });
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };
    const pos = sandbox.__pos(canvas, 760, 300);
    // flipped: x = rect.left + sx - popupW - 24 = 0 + 760 - 220 - 24 = 516
    expect(pos.x).toBe(516);
  });

  it('clamps y to 8 when sprite is near the top edge', () => {
    const sandbox = makePosSandbox({ popupH: 200 });
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    };
    // y = rect.top + sy - popupH/2 = 0 + 10 - 100 = -90 -> clamp to 8
    const pos = sandbox.__pos(canvas, 100, 10);
    expect(pos.y).toBe(8);
  });
});

// ============================================================================
// 4. Click routing (_handleAvatarClickRouted)
// ============================================================================

function makeRoutingSandbox({ selectModeActive = false, popupOpen = false, popupUsername = null } = {}) {
  const openCalls = [];
  const closeCalls = [];
  const toggleCalls = [];

  let _avatarPopupStudentVal = popupOpen ? { username: popupUsername } : null;
  let displayVal = popupOpen ? 'block' : 'none';

  // P11: stub querySelectorAll for _openAvatarPopup / _closeAvatarPopup.
  const viewItemsR = ['main','nudge','remediation','gate'].map(function (n) {
    const store = { _display: n === 'main' ? '' : 'none' };
    return {
      getAttribute: (k) => (k === 'data-ap-view' ? n : null),
      get style() { return { get display() { return store._display; }, set display(v) { store._display = v; } }; },
    };
  });
  const formFieldIdsR = ['ap-nudge-text','ap-rem-unit','ap-rem-skill','ap-rem-notes','ap-gate-key','ap-gate-reason'];
  const formElsR = {};
  formFieldIdsR.forEach(function (id) { formElsR[id] = { value: '' }; });

  let dataViewR = 'main';
  const popupEl = {
    style: { get display() { return displayVal; }, set display(v) { displayVal = v; } },
    getAttribute: (k) => { if (k === 'data-view') return dataViewR; return 'false'; },
    setAttribute: (k, v) => { if (k === 'data-view') dataViewR = v; },
    querySelectorAll: () => viewItemsR,
  };

  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'avatar-popup') return popupEl;
        if (id === 'avatar-popup-name') return { textContent: '' };
        if (id === 'avatar-popup-meta') return { textContent: '' };
        if (formElsR[id]) return formElsR[id];
        return null;
      },
    },
    window: { innerWidth: 1024, innerHeight: 768 },
    _selectModeActive: selectModeActive,
    get _avatarPopupStudent() { return _avatarPopupStudentVal; },
    set _avatarPopupStudent(v) { _avatarPopupStudentVal = v; },
    _avatarPopupSpritePos: null,
    currentNameMap: {},
    currentIdMap: {},
    _lastSummary: null,
    boardHandle: {
      getSpritePosition: (u) => ({ x: 100, y: 100, canvasW: 400, canvasH: 400 }),
      getCanvas: () => ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
        offsetWidth: 400, offsetHeight: 400,
      }),
    },
    // stub _toggleSelectAvatar
    _toggleSelectAvatar: (u) => toggleCalls.push(u),
    String, Object,
  };
  sandbox.window = sandbox;

  createContext(sandbox);
  runInContext(
    fnBody(html, '_openAvatarPopup') + '\n' +
    fnBody(html, '_closeAvatarPopup') + '\n' +
    fnBody(html, '_avatarPopupIsOpen') + '\n' +
    fnBody(html, '_computeAvatarPopupPos') + '\n' +
    fnBody(html, '_handleAvatarClickRouted') + '\n' +
    'this.__route = _handleAvatarClickRouted;',
    sandbox
  );

  return { sandbox, toggleCalls };
}

describe('Click routing', () => {
  it('when select mode is OFF, opens popup for a hit', () => {
    const { sandbox } = makeRoutingSandbox({ selectModeActive: false });
    sandbox.__route({ username: 'bob', selectMode: false });
    expect(sandbox._avatarPopupStudent).toBeTruthy();
    expect(sandbox._avatarPopupStudent.username).toBe('bob');
  });

  it('when select mode is ON, routes to _toggleSelectAvatar and does NOT open popup', () => {
    const { sandbox, toggleCalls } = makeRoutingSandbox({ selectModeActive: true });
    sandbox.__route({ username: 'bob', selectMode: true });
    expect(toggleCalls).toContain('bob');
    expect(sandbox._avatarPopupStudent).toBeNull();
  });

  it('same-avatar repeat click closes the popup (toggle)', () => {
    const { sandbox } = makeRoutingSandbox({
      selectModeActive: false,
      popupOpen: true,
      popupUsername: 'carol',
    });
    sandbox.__route({ username: 'carol', selectMode: false });
    // After toggle-close, _avatarPopupStudent should be null.
    expect(sandbox._avatarPopupStudent).toBeNull();
  });

  it('different-avatar click repositions popup to the new sprite', () => {
    const { sandbox } = makeRoutingSandbox({
      selectModeActive: false,
      popupOpen: true,
      popupUsername: 'carol',
    });
    sandbox.__route({ username: 'dave', selectMode: false });
    expect(sandbox._avatarPopupStudent).toBeTruthy();
    expect(sandbox._avatarPopupStudent.username).toBe('dave');
  });
});

// ============================================================================
// 5. Action routing (_handleAvatarPopupAction)
// ============================================================================

function makeActionSandbox({ studentId = 'stu_001', username = 'alice' } = {}) {
  const openedWindows = [];
  const switchedViews = [];
  let popupDisplay = 'block';
  let dataViewA = 'main';
  let _nudgeBroadcastActive = false;

  // P11: stub querySelectorAll + setAttribute for _closeAvatarPopup.
  const viewItemsA = ['main','nudge','remediation','gate'].map(function (n) {
    const store = { _display: n === 'main' ? '' : 'none' };
    return {
      getAttribute: (k) => (k === 'data-ap-view' ? n : null),
      get style() { return { get display() { return store._display; }, set display(v) { store._display = v; } }; },
    };
  });
  const formFieldIdsA = ['ap-nudge-text','ap-rem-unit','ap-rem-skill','ap-rem-notes','ap-gate-key','ap-gate-reason'];
  const formElsA = {};
  formFieldIdsA.forEach(function (id) { formElsA[id] = { value: '' }; });

  const popupEl = {
    style: { get display() { return popupDisplay; }, set display(v) { popupDisplay = v; } },
    getAttribute: (k) => { if (k === 'data-view') return dataViewA; return 'false'; },
    setAttribute: (k, v) => { if (k === 'data-view') dataViewA = v; },
    querySelectorAll: () => viewItemsA,
  };

  // window.open, innerWidth, innerHeight must be on the sandbox directly
  // because sandbox.window = sandbox makes `window` the full sandbox.
  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'avatar-popup') return popupEl;
        if (id === 'avatar-popup-name') return { textContent: '' };
        if (id === 'avatar-popup-meta') return { textContent: '' };
        if (formElsA[id]) return formElsA[id];
        // nudge-broadcast / nudge-recipient / nudge-text kept for _prefillNudgePanelForStudent
        if (id === 'nudge-broadcast') return {
          get checked() { return _nudgeBroadcastActive; },
          set checked(v) { _nudgeBroadcastActive = v; },
        };
        if (id === 'nudge-recipient') return {
          get value() { return ''; }, set value(v) {},
          get disabled() { return false; }, set disabled(v) {},
          classList: { remove: () => {}, add: () => {} },
        };
        if (id === 'nudge-text') return { value: '', focus: () => {}, scrollIntoView: () => {} };
        return null;
      },
    },
    innerWidth: 1024,
    innerHeight: 768,
    open: (url, target, opts) => { openedWindows.push({ url, target, opts }); },
    _avatarPopupStudent: {
      username: username,
      realName: 'Alice Johnson',
      section: 'PeriodB',
      studentId: studentId,
    },
    _avatarPopupSpritePos: null,
    boardHandle: null,
    _nudgeBroadcastActive: _nudgeBroadcastActive,
    _updateNudgeSendButton: () => {},
    // P11: stub _switchAvatarPopupView so action tests can verify which view was requested.
    _switchAvatarPopupView: (v) => { switchedViews.push(v); },
    String, Object, encodeURIComponent,
  };
  sandbox.window = sandbox;

  createContext(sandbox);
  runInContext(
    fnBody(html, '_closeAvatarPopup') + '\n' +
    fnBody(html, '_avatarPopupIsOpen') + '\n' +
    fnBody(html, '_prefillNudgePanelForStudent') + '\n' +
    fnBody(html, '_handleAvatarPopupAction') + '\n' +
    'this.__action = _handleAvatarPopupAction;',
    sandbox
  );

  return {
    sandbox, openedWindows, switchedViews,
    getPopupDisplay: () => popupDisplay,
  };
}

describe('Action routing', () => {
  it('view-as opens ?viewAsUserId=<sid> in a new tab', () => {
    const { openedWindows, sandbox } = makeActionSandbox();
    sandbox.__action('view-as');
    expect(openedWindows.some(w => w.url.includes('viewAsUserId=stu_001'))).toBe(true);
  });

  it('view-grade opens ?openDrawerFor=<sid> in a new tab', () => {
    const { openedWindows, sandbox } = makeActionSandbox();
    sandbox.__action('view-grade');
    expect(openedWindows.some(w => w.url.includes('openDrawerFor=stu_001'))).toBe(true);
  });

  it('view-recent opens ?openDrawerFor=<sid> in a new tab', () => {
    const { openedWindows, sandbox } = makeActionSandbox();
    sandbox.__action('view-recent');
    expect(openedWindows.some(w => w.url.includes('openDrawerFor=stu_001'))).toBe(true);
  });

  it('P11: apply-remediation calls _switchAvatarPopupView("remediation") instead of opening a new tab', () => {
    const { switchedViews, openedWindows, sandbox } = makeActionSandbox();
    sandbox.__action('apply-remediation');
    expect(switchedViews).toContain('remediation');
    // Must NOT open a new tab for this action in P11.
    expect(openedWindows.length).toBe(0);
  });

  it('P11: override-gate calls _switchAvatarPopupView("gate") instead of opening a new tab', () => {
    const { switchedViews, openedWindows, sandbox } = makeActionSandbox();
    sandbox.__action('override-gate');
    expect(switchedViews).toContain('gate');
    expect(openedWindows.length).toBe(0);
  });

  it('P11: send-nudge calls _switchAvatarPopupView("nudge") and does NOT pre-fill panel', () => {
    const { switchedViews, openedWindows, sandbox } = makeActionSandbox({ username: 'alice' });
    sandbox.__action('send-nudge');
    expect(switchedViews).toContain('nudge');
    expect(openedWindows.length).toBe(0);
  });

  it('actions that need sid no-op when studentId is null', () => {
    const { openedWindows: opened, sandbox } = makeActionSandbox({ studentId: null });
    sandbox.window.open = (url) => opened.push(url);
    sandbox.__action('view-as');
    expect(opened.length).toBe(0);
  });
});

// ============================================================================
// 6. Send-nudge pre-fill side effects
// ============================================================================

describe('Send-nudge pre-fill side effects', () => {
  it('clears broadcast when it was active before pre-fill', () => {
    let _nudgeBroadcastActive = true;
    const recipSelDimmed = { removed: false };
    const popupEl = {
      style: { display: 'none' },
      getAttribute: () => 'true',
      setAttribute: () => {},
    };

    const sandbox = {
      document: {
        getElementById: (id) => {
          if (id === 'avatar-popup') return popupEl;
          if (id === 'avatar-popup-name') return { textContent: '' };
          if (id === 'avatar-popup-meta') return { textContent: '' };
          if (id === 'nudge-broadcast') return {
            get checked() { return _nudgeBroadcastActive; },
            set checked(v) { _nudgeBroadcastActive = v; },
          };
          if (id === 'nudge-recipient') return {
            get value() { return ''; },
            set value(v) {},
            get disabled() { return false; },
            set disabled(v) {},
            classList: { remove: (c) => { if (c === 'nudge-recipient-broadcast-dim') recipSelDimmed.removed = true; }, add: () => {} },
          };
          if (id === 'nudge-text') return { value: '', focus: () => {}, scrollIntoView: () => {} };
          return null;
        },
      },
      _nudgeBroadcastActive: true,
      _avatarPopupStudent: { username: 'alice', studentId: 'stu_001', realName: 'Alice', section: 'B' },
      _updateNudgeSendButton: () => {},
      window: { innerWidth: 1024, innerHeight: 768 },
      String, Object, encodeURIComponent,
    };
    sandbox.window = sandbox;

    createContext(sandbox);
    runInContext(
      fnBody(html, '_closeAvatarPopup') + '\n' +
      fnBody(html, '_avatarPopupIsOpen') + '\n' +
      fnBody(html, '_prefillNudgePanelForStudent') + '\n' +
      'this.__prefill = _prefillNudgePanelForStudent;',
      sandbox
    );
    sandbox.__prefill('alice');

    expect(sandbox._nudgeBroadcastActive).toBe(false);
    expect(recipSelDimmed.removed).toBe(true);
  });

  it("clears the dropdown's disabled attr via setting disabled=false", () => {
    let disabledVal = true;
    const popupEl = {
      style: { display: 'none' },
      getAttribute: () => 'true',
      setAttribute: () => {},
    };
    const sandbox = {
      document: {
        getElementById: (id) => {
          if (id === 'avatar-popup') return popupEl;
          if (id === 'avatar-popup-name') return { textContent: '' };
          if (id === 'avatar-popup-meta') return { textContent: '' };
          if (id === 'nudge-broadcast') return { get checked() { return false; }, set checked(v) {} };
          if (id === 'nudge-recipient') return {
            get value() { return ''; }, set value(v) {},
            get disabled() { return disabledVal; },
            set disabled(v) { disabledVal = v; },
            classList: { remove: () => {}, add: () => {} },
          };
          if (id === 'nudge-text') return { value: '', focus: () => {}, scrollIntoView: () => {} };
          return null;
        },
      },
      _nudgeBroadcastActive: false,
      _avatarPopupStudent: null,
      _updateNudgeSendButton: () => {},
      window: { innerWidth: 1024, innerHeight: 768 },
      String, Object, encodeURIComponent,
    };
    sandbox.window = sandbox;

    createContext(sandbox);
    runInContext(
      fnBody(html, '_prefillNudgePanelForStudent') + '\n' +
      'this.__prefill = _prefillNudgePanelForStudent;',
      sandbox
    );
    sandbox.__prefill('alice');

    expect(disabledVal).toBe(false);
  });
});

// ============================================================================
// 7. Source-level assertions (classroom-board.js changes)
// ============================================================================

describe('classroom-board.js P9 changes', () => {
  const cbSrc = readFileSync(resolve(REPO_ROOT, 'classroom-board.js'), 'utf-8');

  it('canvas click handler no longer gates on selectModeActive (P9 always-fire)', () => {
    // The old guard was: if (!selectModeActive || !onAvatarClick) return;
    // The new guard should be: if (!onAvatarClick) return;
    // Verify the old combined guard is gone.
    expect(cbSrc).not.toMatch(/!selectModeActive\s*\|\|\s*!onAvatarClick/);
  });

  it('canvas click handler fires onAvatarClick with { username, selectMode } object', () => {
    expect(cbSrc).toMatch(/onAvatarClick\(\s*\{[^}]*selectMode/);
  });

  it('onAvatarClick is still gated on !onAvatarClick null check', () => {
    expect(cbSrc).toMatch(/if\s*\(\s*!onAvatarClick\s*\)\s*return/);
  });
});

// ============================================================================
// 8. Source-level assertions (teacher-classroom.html P9 structure)
// ============================================================================

describe('P9 source structure (teacher-classroom.html)', () => {
  it('_avatarPopupStudent is declared in the source', () => {
    expect(html).toMatch(/_avatarPopupStudent\s*=/);
  });

  it('_handleAvatarClickRouted function is declared', () => {
    expect(html).toMatch(/function\s+_handleAvatarClickRouted/);
  });

  it('_prefillNudgePanelForStudent function is declared', () => {
    expect(html).toMatch(/function\s+_prefillNudgePanelForStudent/);
  });

  it('currentIdMap is declared in the source', () => {
    expect(html).toMatch(/var\s+currentIdMap/);
  });

  it('fetchIdMap function is declared', () => {
    expect(html).toMatch(/function\s+fetchIdMap/);
  });

  it('onAvatarClick callback uses _handleAvatarClickRouted', () => {
    expect(html).toMatch(/_handleAvatarClickRouted/);
  });

  it('popup DOMContentLoaded wiring is present in source', () => {
    expect(html).toMatch(/avatar-popup-close/);
    expect(html).toMatch(/data-ap-action/);
  });
});

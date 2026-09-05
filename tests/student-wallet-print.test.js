// @vitest-environment node
// The production student controller, print renderer, and QR encoder run together.
// Only the network and native browser print/window scheduling are replaced.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { addressFromWIF, deriveWIF, NETWORKS } from '../tools/lib/doge-keys.mjs';

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const STUDENT_SOURCE = source('js/student-wallet-print.js');
const RENDERER_SOURCE = source('js/wallet-print-sheets.js');
const QR_SOURCE = source('vendor/qrcode-generator/qrcode-2.0.4.js');
const DESK = source('ap_stats_roadmap_square_mode.html');
// Deterministic public test material, never a real student wallet.
const WIF = deriveWIF(Buffer.alloc(32, 17), NETWORKS.mainnet.wif);
const ADDRESS = addressFromWIF(WIF);
const disposers = [];

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function button(doc, text) {
  return [...doc.querySelectorAll('button')].find(node => node.textContent === text);
}

async function settle() {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

function functionSource(name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!match) throw new Error('Missing Desk function: ' + name);
  let depth = 0;
  for (let index = DESK.indexOf('{', match.index); index < DESK.length; index += 1) {
    if (DESK[index] === '{') depth += 1;
    if (DESK[index] === '}') depth -= 1;
    if (depth === 0) return DESK.slice(match.index, index + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

function compactToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url') + '.test-signature';
}

function harness({ blocked = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="wallet-host"></div></body>', {
    url: 'https://school.example/ap_stats_roadmap_square_mode.html', runScripts: 'outside-only',
  });
  const child = new JSDOM('<!doctype html><body></body>', { url: 'about:blank' });
  const root = dom.window;
  const popup = child.window;
  const disposePopup = popup.close.bind(popup);
  const doc = root.document;
  const host = doc.getElementById('wallet-host');
  const clock = { now: Date.now() };
  root.Date.now = () => clock.now;
  const identity = {
    studentId: 'student-a', role: 'student',
    token: compactToken({ sid: 'student-a', exp: clock.now + 60000 }),
  };
  const timers = new Map();
  const intervals = new Map();
  const frames = new Map();
  let nextId = 1;
  const events = [];
  const payload = {
    ok: true,
    wallet: { studentId: 'student-a', username: 'alex', realName: 'Alex Example', section: 'B', label: 'Wallet #7', address: ADDRESS, wif: WIF },
  };
  root.rosterClient = {
    current: () => identity.studentId ? { studentId: identity.studentId, role: identity.role } : null,
    token: () => identity.token,
  };
  root.ROSTER_SERVICE_URL = 'https://roster.example/';
  root.setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, delay }); return id; };
  root.clearTimeout = id => timers.delete(id);
  root.setInterval = callback => { const id = nextId++; intervals.set(id, callback); return id; };
  root.clearInterval = id => intervals.delete(id);
  popup.requestAnimationFrame = callback => { const id = nextId++; frames.set(id, callback); return id; };
  popup.cancelAnimationFrame = id => frames.delete(id);
  const nativeClose = vi.fn(() => { popup.closed = true; });
  popup.close = nativeClose;
  popup.focus = vi.fn();
  popup.print = vi.fn();
  root.open = vi.fn(() => { events.push('open'); return blocked ? null : popup; });
  const response = { ok: true, status: 200, json: vi.fn(async () => payload) };
  root.fetch = vi.fn(async () => { events.push('fetch'); return response; });
  const storageWrite = vi.spyOn(root.Storage.prototype, 'setItem');
  root.indexedDB = { open: vi.fn() };
  root.eval(QR_SOURCE);
  root.eval(RENDERER_SOURCE);
  root.eval(STUDENT_SOURCE);

  function attach(wallet = { dogeAddress: ADDRESS }) {
    root.StudentWalletPrint.attach(host, wallet);
    return button(doc, 'Print my wallet');
  }
  function openDialog() {
    const trigger = attach();
    trigger.click();
    return doc.querySelector('[role="dialog"]');
  }
  function confirm(value = 'PRINT') {
    const input = doc.querySelector('[role="dialog"] input');
    input.value = value;
    input.dispatchEvent(new root.Event('input', { bubbles: true }));
  }
  function begin() {
    openDialog();
    confirm();
    button(doc, 'Print / Save PDF').click();
  }
  function runTimers(delay) {
    for (const [id, timer] of [...timers]) {
      if (timer.delay !== delay) continue;
      timers.delete(id);
      timer.callback();
    }
  }
  function checkIdentity() { [...intervals.values()].forEach(callback => callback()); }
  disposers.push(() => { root.StudentWalletPrint.clear(); dom.window.close(); disposePopup(); });
  return { root, popup, doc, host, identity, clock, payload, response, events, storageWrite, nativeClose, timers, intervals, frames, attach, openDialog, confirm, begin, runTimers, checkIdentity };
}

describe('student wallet printing permission and request boundary', () => {
  it.each(['signed out', 'teacher', 'view-as', 'read-only', 'missing token', 'missing service'])('hides printing for %s', reason => {
    const h = harness();
    if (reason === 'signed out') h.identity.studentId = null;
    if (reason === 'teacher') h.identity.role = 'teacher';
    if (reason === 'view-as') h.root._viewAsContext = () => ({ studentId: 'student-b' });
    if (reason === 'read-only') h.root.__WS_READ_ONLY__ = true;
    if (reason === 'missing token') h.identity.token = null;
    if (reason === 'missing service') h.root.ROSTER_SERVICE_URL = '';
    expect(h.attach()).toBeUndefined();
    expect(h.root.fetch).not.toHaveBeenCalled();
  });

  it.each([null, {}, { dogeAddress: '' }, { dogeAddress: '<script>bad</script>' }])('hides printing without an assigned valid address: %j', wallet => {
    const h = harness();
    expect(h.attach(wallet)).toBeUndefined();
  });

  it.each(['malformed', 'invalid payload', 'expired', 'expires now', 'missing expiry', 'string expiry', 'nonfinite expiry', 'other student'])('hides printing for a %s token', reason => {
    const h = harness();
    const payload = { sid: 'student-a', exp: h.clock.now + 60000 };
    if (reason === 'expired') payload.exp = h.clock.now - 1;
    if (reason === 'expires now') payload.exp = h.clock.now;
    if (reason === 'missing expiry') delete payload.exp;
    if (reason === 'string expiry') payload.exp = String(payload.exp);
    if (reason === 'nonfinite expiry') payload.exp = Infinity;
    if (reason === 'other student') payload.sid = 'student-b';
    h.identity.token = compactToken(payload);
    if (reason === 'malformed') h.identity.token = 'not-a-compact-token';
    if (reason === 'invalid payload') h.identity.token = Buffer.from('not JSON').toString('base64url') + '.test-signature';
    expect(h.attach()).toBeUndefined();
    expect(h.root.fetch).not.toHaveBeenCalled();
  });

  it('opens a warning first and only sends an owner-scoped POST after typed confirmation', async () => {
    const h = harness();
    const dialog = h.openDialog();
    expect(dialog.textContent).toContain('Anyone with that key can spend your DOGE');
    expect(dialog.textContent).toContain('Printing does not move any coins');
    expect(h.root.fetch).not.toHaveBeenCalled();
    expect(h.root.open).not.toHaveBeenCalled();
    for (const value of ['', 'print', 'PRINT ']) {
      h.confirm(value);
      expect(button(h.doc, 'Print / Save PDF').disabled).toBe(true);
    }
    h.confirm();
    button(h.doc, 'Print / Save PDF').click();
    button(h.doc, 'Print / Save PDF').click();
    await settle();
    expect(h.events).toEqual(['open', 'fetch']);
    expect(h.root.fetch).toHaveBeenCalledOnce();
    const [url, options] = h.root.fetch.mock.calls[0];
    expect(url).toBe('https://roster.example/wallet/custody/print');
    expect(options).toMatchObject({
      method: 'POST', headers: { Authorization: 'Bearer ' + h.identity.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }), cache: 'no-store', credentials: 'omit', redirect: 'error',
    });
    expect(options.signal.aborted).toBe(false);
    expect(h.root.open).toHaveBeenCalledWith('', '_blank');
  });

  it('does not request a key if the popup is blocked', async () => {
    const h = harness({ blocked: true });
    h.begin();
    await settle();
    expect(h.root.fetch).not.toHaveBeenCalled();
    expect(h.doc.querySelector('[role="status"]').textContent).toContain('Allow popups');
    expect(h.doc.querySelector('input').value).toBe('');
  });

  it('rejects a stale button after another student signs in', () => {
    const h = harness();
    const trigger = h.attach();
    h.identity.studentId = 'student-b';
    h.identity.token = compactToken({ sid: 'student-b', exp: h.clock.now + 60000 });
    trigger.click();
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
    expect(h.root.fetch).not.toHaveBeenCalled();
  });
});

describe('student wallet key lifecycle', () => {
  it('renders one private sheet only in the temporary popup, wipes response keys, and clears when Done is clicked', async () => {
    const h = harness();
    h.begin();
    await settle();
    expect(h.popup.document.querySelectorAll('.wallet-sheet')).toHaveLength(1);
    expect(h.popup.document.querySelector('.wallet-cover')).toBeNull();
    expect(h.popup.document.querySelectorAll('svg')).toHaveLength(2);
    expect(h.popup.document.body.textContent).toContain(WIF);
    expect(h.popup.document.body.textContent).toContain('Your teacher keeps a backup');
    expect(h.popup.document.body.textContent).not.toContain('Student surfaces use only the address');
    expect(h.payload.wallet.wif).toBe('');
    expect(h.doc.documentElement.outerHTML).not.toContain(WIF);
    expect(h.root.location.href).not.toContain(WIF);
    expect(h.popup.location.href).toBe('about:blank');
    expect(h.storageWrite).not.toHaveBeenCalled();
    expect(h.root.indexedDB.open).not.toHaveBeenCalled();
    expect(JSON.stringify(h.root.fetch.mock.calls)).not.toContain(WIF);
    expect(h.popup.opener).toBeNull();

    h.runTimers(150);
    await settle();
    expect(h.popup.print).toHaveBeenCalledOnce();
    expect(h.nativeClose).not.toHaveBeenCalled();
    expect(h.popup.document.body.textContent).toContain(WIF);
    expect(h.doc.documentElement.outerHTML).not.toContain(WIF);
    expect(h.payload.wallet.wif).toBe('');
    button(h.popup.document, 'Done — close wallet sheet').click();
    h.checkIdentity();
    await settle();
    expect(h.nativeClose).toHaveBeenCalledOnce();
    expect(h.popup.document.documentElement.textContent).toBe('');
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
    expect(h.timers.size).toBe(0);
    expect(h.intervals.size).toBe(0);
  });

  it.each(['no-op print', 'early afterprint', 'later afterprint'])('keeps the sheet usable after %s until the student explicitly closes it', async behavior => {
    const h = harness();
    if (behavior === 'early afterprint') {
      h.popup.print.mockImplementation(() => h.popup.dispatchEvent(new h.popup.Event('afterprint')));
    }
    h.begin();
    await settle();
    h.runTimers(150);
    await settle();
    if (behavior === 'later afterprint') h.popup.dispatchEvent(new h.popup.Event('afterprint'));
    expect(h.popup.document.body.textContent).toContain(WIF);
    expect(h.nativeClose).not.toHaveBeenCalled();
    expect(h.payload.wallet.wif).toBe('');
    button(h.popup.document, 'Done — close wallet sheet').click();
    h.checkIdentity();
    await settle();
    expect(h.popup.document.documentElement.textContent).toBe('');
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(['parent Done', 'native window close', 'session expiry'])('clears a retained sheet after %s', async reason => {
    const h = harness();
    h.begin();
    await settle();
    h.runTimers(150);
    await settle();
    expect(h.popup.document.body.textContent).toContain(WIF);
    if (reason === 'parent Done') button(h.doc, 'Done').click();
    if (reason === 'native window close') {
      h.popup.closed = true;
      h.popup.dispatchEvent(new h.popup.Event('pagehide'));
    }
    if (reason === 'session expiry') h.clock.now += 60000;
    h.checkIdentity();
    await settle();
    expect(h.popup.document.documentElement.textContent).toBe('');
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
    expect(h.intervals.size).toBe(0);
    expect(h.payload.wallet.wif).toBe('');
  });

  it.each(['studentId', 'token', 'base'])('discards a successful response after %s changes during the request', async field => {
    const h = harness();
    const pending = deferred();
    h.root.fetch.mockReturnValueOnce(pending.promise);
    h.begin();
    if (field === 'studentId') h.identity.studentId = 'student-b';
    if (field === 'token') h.identity.token = compactToken({ sid: 'student-a', exp: h.clock.now + 120000 });
    if (field === 'base') h.root.ROSTER_SERVICE_URL = 'https://other-roster.example';
    pending.resolve(h.response);
    await settle();
    expect(h.payload.wallet.wif).toBe('');
    expect(h.popup.document.body.textContent).not.toContain(WIF);
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.nativeClose).toHaveBeenCalledOnce();
  });

  it('checks identity again between key rendering and the scheduled native print', async () => {
    const h = harness();
    h.begin();
    await settle();
    expect(h.popup.document.body.textContent).toContain(WIF);
    h.identity.studentId = 'student-b';
    h.runTimers(150);
    await settle();
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.popup.document.documentElement.textContent).toBe('');
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
  });

  it('discards a rendered sheet if the token expires before the scheduled native print', async () => {
    const h = harness();
    h.identity.token = compactToken({ sid: 'student-a', exp: h.clock.now + 1000 });
    h.begin();
    await settle();
    expect(h.popup.document.body.textContent).toContain(WIF);
    h.clock.now += 1000;
    h.runTimers(150);
    await settle();
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.popup.document.documentElement.textContent).toBe('');
    expect(h.payload.wallet.wif).toBe('');
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(['cancel', 'escape', 'pagehide', 'cross-tab', 'same-tab', 'detached trigger'])('aborts on %s and wipes a late response without displaying it', async reason => {
    const h = harness();
    const pending = deferred();
    h.root.fetch.mockReturnValueOnce(pending.promise);
    h.begin();
    const signal = h.root.fetch.mock.calls[0][1].signal;
    if (reason === 'cancel') button(h.doc, 'Cancel').click();
    if (reason === 'escape') h.doc.querySelector('input').dispatchEvent(new h.root.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (reason === 'pagehide') h.root.dispatchEvent(new h.root.Event('pagehide'));
    if (reason === 'cross-tab') {
      h.identity.studentId = 'student-b';
      h.root.dispatchEvent(new h.root.StorageEvent('storage', { key: 'apstats_roster.v1' }));
    }
    if (reason === 'same-tab') {
      h.identity.token = compactToken({ sid: 'student-a', exp: h.clock.now + 120000 });
      h.checkIdentity();
    }
    if (reason === 'detached trigger') { h.host.remove(); h.checkIdentity(); }
    expect(signal.aborted).toBe(true);
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
    pending.resolve(h.response);
    await settle();
    expect(h.payload.wallet.wif).toBe('');
    expect(h.popup.document.body.textContent).not.toContain(WIF);
    expect(h.popup.print).not.toHaveBeenCalled();
  });

  it.each(['studentId', 'address'])('never renders a response whose %s differs from the initiating wallet', async field => {
    const h = harness();
    h.payload.wallet[field] = 'different-owner-or-wallet';
    h.begin();
    await settle();
    expect(h.payload.wallet.wif).toBe('');
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.popup.document.body.textContent).not.toContain(WIF);
    expect(h.doc.querySelector('[role="status"]').textContent).toContain('Could not prepare');
  });

  it.each([401, 403, 404, 409, 429, 503, 500])('keeps status %i errors free of returned secrets', async status => {
    const h = harness();
    const response = { ok: false, status, json: vi.fn(async () => ({ error: WIF })) };
    h.root.fetch.mockResolvedValueOnce(response);
    h.begin();
    await settle();
    expect(response.json).not.toHaveBeenCalled();
    expect(h.doc.documentElement.outerHTML).not.toContain(WIF);
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.nativeClose).toHaveBeenCalledOnce();
    if (status === 404) expect(h.doc.querySelector('[role="status"]').textContent).toContain('No printable key is held');
    if (status === 429) expect(h.doc.querySelector('[role="status"]').textContent).toContain('minute');
    expect(button(h.doc, 'Print / Save PDF').disabled).toBe(true);
  });

  it('sanitizes network errors and aborts a request that times out', async () => {
    const h = harness();
    const pending = deferred();
    h.root.fetch.mockReturnValueOnce(pending.promise);
    h.begin();
    h.runTimers(15000);
    expect(h.root.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    pending.reject(new Error(WIF));
    await settle();
    expect(h.doc.querySelector('[role="status"]').textContent).toContain('Could not prepare');
    expect(h.doc.documentElement.outerHTML).not.toContain(WIF);
    expect(h.nativeClose).toHaveBeenCalledOnce();
  });
});

describe('Desk student print integration', () => {
  function loadDesk(h, names) {
    h.root.eval(names.map(functionSource).join('\n'));
  }

  it('makes the assigned wallet printable before a student earns any candy or receives a deposit', () => {
    const h = harness();
    loadDesk(h, ['_clearStudentWalletCeremony', '_dogeWalletRender']);
    h.root._dogeWalletRender(h.host, { ok: true, dogeAddress: ADDRESS }, { total: 0 });
    expect(h.host.textContent).toContain('earn your first candy');
    expect(button(h.doc, 'Print my wallet')).toBeTruthy();
    expect(h.root.fetch).not.toHaveBeenCalled();
  });

  it.each(['destroyWallet', 'destroyApp', 'minimizeApp', '_resetGradeStateForIdentitySwitch', '_dogeWalletRender'])('clears a revealed print document through the real %s lifecycle', async name => {
    const h = harness();
    h.doc.body.insertAdjacentHTML('beforeend', '<div id="app-wallet-overlay"><div class="app-window"></div></div>');
    loadDesk(h, ['_clearStudentWalletCeremony', name]);
    h.begin();
    await settle();
    expect(h.popup.document.body.textContent).toContain(WIF);
    if (name === '_dogeWalletRender') h.root[name](h.host, { ok: true, dogeAddress: ADDRESS }, { total: 0 });
    else h.root[name]('wallet');
    await settle();
    expect(h.popup.document.documentElement.textContent).toBe('');
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.doc.querySelector('[role="dialog"]')).toBeNull();
    expect(h.nativeClose).toHaveBeenCalledOnce();
  });
});

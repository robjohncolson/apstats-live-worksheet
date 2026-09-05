// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { webcrypto } from 'node:crypto';
import { deriveWIF, addressFromWIF, NETWORKS } from '../tools/lib/doge-keys.mjs';

const SOURCE = readFileSync(new URL('../js/teacher-wallet-loading.js', import.meta.url), 'utf8');
const SCANNER_SOURCE = readFileSync(new URL('../js/wallet-qr-scanner.js', import.meta.url), 'utf8');
const DASH = readFileSync(new URL('../teacher-dashboard.html', import.meta.url), 'utf8');
const wif = deriveWIF(Buffer.alloc(32, 7), NETWORKS.mainnet.wif);
const address = addressFromWIF(wif);
const secondWif = deriveWIF(Buffer.alloc(32, 8), NETWORKS.mainnet.wif);
const secondAddress = addressFromWIF(secondWif);
const wallets = [
  { label: 'Wallet #1', address, wif },
  { label: 'Wallet #2', address: secondAddress, wif: secondWif },
];
const students = [
  { studentId: 'b', realName: 'Beth', username: 'beth', section: 'E', status: 'active', role: 'student' },
  { studentId: 'a', realName: 'Ana', username: 'ana', section: 'B', status: 'active', role: 'student' },
];
const ok = data => ({ status: 200, data: { ok: true, ...data } });

function boot() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://school.example/teacher-dashboard.html', runScripts: 'outside-only' });
  dom.window.eval(SOURCE);
  dom.window.DogeKeys = { addressFromWIF: async value => addressFromWIF(value) };
  return { dom, api: dom.window.TeacherWalletLoading, doc: dom.window.document };
}
function csv(label = 'Wallet #1') {
  return 'label,address,wif,privHex\n' + [label, address, wif, '07'.repeat(32)].join(',') + '\n';
}
function findButton(doc, label) {
  return Array.from(doc.querySelectorAll('button')).find(button => button.textContent === label);
}

// Exercise the real adapter's duplicate suppression and camera lifecycle.
// Only browser media, pixels, and the QR image decoder are stubbed.
function attachScanner(dom) {
  const window = dom.window;
  const frames = new Map();
  let nextFrame = 1, timestamp = 0, code = null;
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop() {} }] }));
  Object.defineProperty(window.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage() {},
    getImageData: () => ({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) }),
  });
  window.HTMLVideoElement.prototype.play = async () => {};
  window.HTMLVideoElement.prototype.pause = () => {};
  for (const [property, value] of Object.entries({ readyState: 4, videoWidth: 8, videoHeight: 8 })) {
    Object.defineProperty(window.HTMLVideoElement.prototype, property, { get: () => value, configurable: true });
  }
  window.requestAnimationFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.jsQR = () => code ? { data: code } : null;
  window.eval(SCANNER_SOURCE);
  function frame(value) {
    code = value; timestamp += 100;
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(timestamp));
  }
  return { frame, frames, getUserMedia };
}

describe('wallet CSV and assignment plan', () => {
  it('handles BOM, CRLF, quoted labels and discards redundant private hex', async () => {
    const { api } = boot();
    const rows = await api.parseCsv('\uFEFF' + csv('"Wallet, ""one"""').replace(/\n/g, '\r\n'), addressFromWIF);
    expect(rows).toEqual([{ label: 'Wallet, "one"', address, wif }]);
    expect(rows[0]).not.toHaveProperty('privHex');
  });
  it('rejects a mismatched WIF, duplicates, wrong header and malformed CSV before any requests', async () => {
    const { api } = boot();
    await expect(api.parseCsv(csv().replace(wif, secondWif), addressFromWIF)).rejects.toThrow('does not match');
    await expect(api.parseCsv(csv() + csv().split('\n')[1], addressFromWIF)).rejects.toThrow('Duplicate');
    await expect(api.parseCsv(csv().replace('privHex', 'key'), addressFromWIF)).rejects.toThrow('header');
    await expect(api.parseCsv('"unfinished', addressFromWIF)).rejects.toThrow('quote');
    await expect(api.parseCsv(csv().replace(wif, 'private-key-invalid'), addressFromWIF)).rejects.not.toThrow('private-key-invalid');
  });
  it('sorts active students by section/name and reserves every assigned address, including archived students', () => {
    const { api } = boot();
    const people = [...students, { studentId: 'teacher', role: 'teacher' }, { studentId: 'old', status: 'archived' }];
    const rows = api.planAssignments(people, wallets, [{ studentId: 'old', dogeAddress: address }]);
    expect(rows.map(row => [row.student.studentId, row.walletIndex])).toEqual([['a', 1], ['b', -1]]);
    expect(api.planAssignments(students, wallets, [
      { studentId: 'a', dogeAddress: address }, { studentId: 'b', dogeAddress: secondAddress },
    ])).toEqual([]);
  });
});

function generatedHarness({ section = '', failCustody = false, failGeneration = false } = {}) {
  const h = boot();
  Object.defineProperty(h.dom.window, 'crypto', { value: webcrypto, configurable: true });
  h.dom.window.confirm = vi.fn(() => false);
  const generated = [], accounts = [];
  const generateWallet = vi.fn(async () => {
    if (failGeneration && generated.length === 1) throw new Error('generation failed');
    const value = { ...wallets[generated.length] };
    generated.push(value);
    return value;
  });
  h.dom.window.DogeKeys.generateWallet = generateWallet;
  const get = vi.fn(async path => {
    if (path === '/roster/list') return ok({ students: [...students,
      { studentId: 'old', realName: 'Archived', section: 'B', status: 'archived' },
      { studentId: 'teacher', realName: 'Teacher', section: 'B', role: 'teacher' },
      { studentId: 'assigned', realName: 'Assigned', section: 'B' },
    ] });
    if (path === '/class/grades') return ok({ students: [...students, { studentId: 'teacher', role: 'teacher' }, { studentId: 'assigned' }] });
    if (path === '/class/wallet-custody?includeArchived=1') return ok({ wallets: {
      outside: { held: true, label: 'Wallet #40' }, old: { held: false, label: 'Wallet #99' },
    } });
    return ok({ accounts: [{ studentId: 'assigned', dogeAddress: 'D' + '9'.repeat(33) }, ...accounts] });
  });
  let failed = false;
  const post = vi.fn(async (path, body) => {
    if (path === '/wallet/address') accounts.push({ studentId: body.studentId, dogeAddress: body.address });
    if (path === '/wallet/custody' && failCustody && !failed) {
      failed = true;
      return { status: 503, data: { error: 'untrusted detail ' + wif } };
    }
    return ok({});
  });
  const storage = vi.spyOn(h.dom.window.Storage.prototype, 'setItem');
  const loader = h.api.create({ get, post, changed() {}, section: () => section });
  return { ...h, generated, generateWallet, get, post, loader, storage };
}

function printHarness({ section = 'B', blocked = false, empty = false } = {}) {
  const h = boot();
  const events = [], printed = [];
  const responseWallets = [
    { ...wallets[0], studentId: 'a', realName: 'Ana', username: 'ana', section: 'B' },
    { ...wallets[1], studentId: 'b', realName: 'Beth', username: 'beth', section: 'E' },
  ];
  const session = {
    close: vi.fn(), isClosed: vi.fn(() => false),
    print: vi.fn(async (values, options) => { printed.push(structuredClone({ wallets: values, options })); }),
  };
  const open = vi.fn(() => { events.push('open'); if (blocked) throw new Error('popup blocked'); return session; });
  h.dom.window.WalletPrintSheets = { open };
  const get = vi.fn(async path => {
    events.push(path);
    if (path.includes('/export?')) return ok({ wallets: responseWallets, skipped: [{ studentId: 'skipped', reason: 'held key could not be read' }] });
    if (path.startsWith('/wallet/custody/')) return ok({ address, wif, label: 'Wallet #1' });
    return ok({ wallets: empty ? {} : { a: { held: true }, b: { held: true }, unheld: { held: false } } });
  });
  const storage = vi.spyOn(h.dom.window.Storage.prototype, 'setItem');
  const loader = h.api.create({ get, post: vi.fn(), changed() {}, section: () => section });
  function confirm(value = 'PRINT') {
    const input = h.doc.querySelector('dialog input');
    input.value = value; input.dispatchEvent(new h.dom.window.Event('input'));
  }
  return { ...h, loader, get, session, open, events, responseWallets, printed, storage, confirm };
}

describe('teacher wallet print controls', () => {
  it('does not reveal when the held count cannot be loaded', async () => {
    const h = printHarness();
    h.get.mockResolvedValueOnce({ status: 503, data: { ok: false } });
    await h.loader.openPrint();
    h.confirm();
    expect(findButton(h.doc, 'Print wallet sheets').disabled).toBe(true);
    expect(h.open).not.toHaveBeenCalled();
    expect(h.doc.body.textContent).toContain('Held wallet count unavailable');
  });

  it('discards response keys if the print window closes while export is loading', async () => {
    const h = printHarness();
    await h.loader.openPrint();
    h.session.isClosed.mockReturnValue(true);
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    await vi.waitFor(() => expect(h.responseWallets.every(wallet => wallet.wif === '')).toBe(true));
    expect(h.session.print).not.toHaveBeenCalled();
    expect(h.session.close).toHaveBeenCalledOnce();
  });

  it.each(['renderer fails', 'malformed response'])('clears all response keys when %s', async failure => {
    const h = printHarness();
    await h.loader.openPrint();
    if (failure === 'renderer fails') h.session.print.mockRejectedValueOnce(new Error(wif));
    else h.get.mockResolvedValueOnce(ok({ wallets: [h.responseWallets[0], 'invalid wallet', h.responseWallets[1]], skipped: [] }));
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    await vi.waitFor(() => expect(findButton(h.doc, 'Close').disabled).toBe(false));
    expect(h.responseWallets.every(wallet => wallet.wif === '')).toBe(true);
    expect(h.session.close).toHaveBeenCalled();
    expect(h.doc.body.textContent).not.toContain(wif);
    expect(h.doc.body.textContent).not.toContain(secondWif);
  });

  it('shows count and section, requires exact PRINT, opens before export and clears response keys', async () => {
    const h = printHarness({ section: 'B & E' });
    await h.loader.openPrint();
    expect(h.get).toHaveBeenCalledWith('/class/wallet-custody?includeArchived=1&section=B%20%26%20E');
    expect(h.doc.body.textContent).toContain('2 held wallets');
    expect(h.doc.body.textContent).toContain('B & E');
    h.confirm('print');
    expect(findButton(h.doc, 'Print wallet sheets').disabled).toBe(true);
    expect(h.open).not.toHaveBeenCalled();
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    await vi.waitFor(() => expect(h.session.print).toHaveBeenCalledOnce());
    expect(h.events.slice(-2)).toEqual(['open', '/class/wallet-custody/export?confirm=1&section=B%20%26%20E']);
    expect(h.printed[0].wallets.map(wallet => wallet.wif)).toEqual([wif, secondWif]);
    expect(h.printed[0].options).toEqual({ section: 'B & E', cover: true });
    expect(h.responseWallets.every(wallet => wallet.wif === '')).toBe(true);
    expect(h.doc.body.textContent).toContain('1 wallet skipped');
    expect(h.storage).not.toHaveBeenCalled();
    expect(h.doc.body.innerHTML).not.toContain(wif);
    expect(h.doc.body.innerHTML).not.toContain(secondWif);
    findButton(h.doc, 'Close').click();
    expect(h.doc.querySelector('dialog')).toBeNull();
    expect(h.session.close).not.toHaveBeenCalled();
  });

  it('shows all sections and refuses a zero-count export', async () => {
    const h = printHarness({ section: '', empty: true });
    await h.loader.openPrint();
    expect(h.doc.body.textContent).toContain('All sections');
    expect(h.doc.body.textContent).toContain('0 held wallets');
    h.confirm();
    expect(findButton(h.doc, 'Print wallet sheets').disabled).toBe(true);
    expect(h.open).not.toHaveBeenCalled();
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('does not reveal anything if popups are blocked', async () => {
    const h = printHarness({ blocked: true });
    await h.loader.openPrint();
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    await vi.waitFor(() => expect(h.doc.querySelector('.wallet-status').textContent).toContain('Allow popups'));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.session.print).not.toHaveBeenCalled();
  });

  it('closes an unused popup on export failure without echoing an error payload', async () => {
    const h = printHarness();
    await h.loader.openPrint();
    h.get.mockResolvedValueOnce({ status: 503, data: { ok: false, error: wif } });
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    await vi.waitFor(() => expect(h.session.close).toHaveBeenCalledOnce());
    expect(h.session.print).not.toHaveBeenCalled();
    expect(h.doc.body.textContent).not.toContain(wif);
  });

  it('clears late export keys and avoids printing after parent navigation', async () => {
    const h = printHarness();
    await h.loader.openPrint();
    let finish;
    h.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    expect(finish).toBeTypeOf('function');
    h.dom.window.dispatchEvent(new h.dom.window.Event('pagehide'));
    finish(ok({ wallets: h.responseWallets, skipped: [] }));
    await vi.waitFor(() => expect(h.responseWallets.every(wallet => wallet.wif === '')).toBe(true));
    expect(h.session.print).not.toHaveBeenCalled();
    expect(h.session.close).toHaveBeenCalled();
    expect(h.doc.querySelector('dialog')).toBeNull();
  });

  it('reprints from the address cell with one audited reveal and one wallet page', async () => {
    const h = printHarness();
    const cell = h.doc.createElement('td'); h.doc.body.appendChild(cell);
    h.loader.decorateAddressCell(cell, students[1]);
    await vi.waitFor(() => expect(findButton(h.doc, 'Reprint').disabled).toBe(false));
    h.get.mockClear();
    findButton(h.doc, 'Reprint').click();
    expect(h.doc.body.textContent).toContain('1 held wallet');
    expect(h.get).not.toHaveBeenCalled();
    h.confirm(); findButton(h.doc, 'Print wallet sheets').click();
    await vi.waitFor(() => expect(h.session.print).toHaveBeenCalledOnce());
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith('/wallet/custody/a?confirm=1');
    expect(h.printed[0]).toEqual({ wallets: [{ studentId: 'a', realName: 'Ana', username: 'ana', section: 'B', address, wif, label: 'Wallet #1' }], options: { section: 'B', cover: false } });
    expect(h.doc.body.innerHTML).not.toContain(wif);
  });

  it('prints an already revealed key without making another reveal request', async () => {
    const h = printHarness();
    h.loader.openReveal(students[1]);
    h.confirm('REVEAL'); findButton(h.doc, 'Reveal key').click();
    await vi.waitFor(() => expect(findButton(h.doc, 'Reprint sheet')).toBeTruthy());
    findButton(h.doc, 'Reprint sheet').click();
    await vi.waitFor(() => expect(h.session.print).toHaveBeenCalledOnce());
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.printed[0].wallets[0].wif).toBe(wif);
    expect(h.printed[0].options.cover).toBe(false);
    expect(h.doc.body.textContent).not.toContain('node tools/doge-wallet-gen');
    await vi.waitFor(() => expect(findButton(h.doc, 'Close').disabled).toBe(false));
    findButton(h.doc, 'Close').click();
    expect(h.doc.querySelector('input[readonly]')).toBeNull();
  });

  it('loads print scripts and controls only on the teacher dashboard', () => {
    const desk = readFileSync(new URL('../ap_stats_roadmap_square_mode.html', import.meta.url), 'utf8');
    expect(DASH).toContain('id="wallet-print-btn"');
    expect(DASH).toContain('_walletLoader.openPrint()');
    for (const file of ['js/wallet-print-sheets.js', 'vendor/qrcode-generator/qrcode-2.0.4.js']) {
      expect(DASH).toContain('src="' + file + '"');
      expect(desk).not.toContain('src="' + file + '"');
    }
  });
});

describe('generated wallet assignments', () => {
  it('warns before navigation only while generated keys remain unsaved', async () => {
    const h = generatedHarness({ section: 'B' });
    await h.loader.openGenerate();
    const before = new h.dom.window.Event('beforeunload', { cancelable: true });
    h.dom.window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    findButton(h.doc, 'Submit assignments').click();
    await vi.waitFor(() => expect(h.generated[0].wif).toBe(''));
    const after = new h.dom.window.Event('beforeunload', { cancelable: true });
    h.dom.window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('does not generate if held labels cannot be loaded', async () => {
    const h = generatedHarness();
    const normal = h.get.getMockImplementation();
    h.get.mockImplementation(path => path === '/class/wallet-custody?includeArchived=1'
      ? Promise.resolve({ status: 503, data: { error: 'missing schema' } }) : normal(path));
    await h.loader.openGenerate();
    expect(h.generateWallet).not.toHaveBeenCalled();
    expect(findButton(h.doc, 'Submit assignments').disabled).toBe(true);
    expect(h.post).not.toHaveBeenCalled();
  });

  it.each([{ subtle: webcrypto.subtle }, { getRandomValues() {} }])('disables generation when a required Web Crypto API is absent', async crypto => {
    const h = generatedHarness();
    Object.defineProperty(h.dom.window, 'crypto', { value: crypto, configurable: true });
    expect(h.loader.generationUnavailableReason()).not.toBe('');
    await h.loader.openGenerate();
    expect(h.generateWallet).not.toHaveBeenCalled();
  });

  it('prefills active unassigned students in section and continues class-wide held labels', async () => {
    const h = generatedHarness({ section: 'B' });
    await h.loader.openGenerate();
    expect(h.generateWallet).toHaveBeenCalledOnce();
    expect(h.doc.querySelector('table').textContent).toContain('Ana');
    expect(h.doc.querySelector('table').textContent).not.toContain('Beth');
    expect(h.generated[0].label).toBe('Wallet #41');
    expect(h.post).not.toHaveBeenCalled();
    const keep = Array.from(h.doc.querySelectorAll('input[type=checkbox]')).find(input => input.parentNode.textContent.includes('private keys'));
    expect(keep.checked).toBe(true); expect(keep.disabled).toBe(true);
    keep.checked = false; keep.dispatchEvent(new h.dom.window.Event('change'));
    findButton(h.doc, 'Submit assignments').click();
    await vi.waitFor(() => expect(h.post).toHaveBeenCalledTimes(2));
    expect(h.post.mock.calls.map(call => call[0])).toEqual(['/wallet/address', '/wallet/custody']);
    expect(h.post.mock.calls[0][1]).toEqual({ studentId: 'a', address });
    expect(h.post.mock.calls[1][1]).toEqual({ studentId: 'a', wif, label: 'Wallet #41' });
    await vi.waitFor(() => expect(h.generated[0].wif).toBe(''));
    expect(h.storage).not.toHaveBeenCalled();
    expect(h.doc.body.innerHTML).not.toContain(wif);
  });

  it('forces custody in the submission helper even when keepKeys is false', async () => {
    const { api } = boot();
    const generated = [{ ...wallets[0], generated: true }];
    const rows = api.planAssignments([students[0]], generated, []);
    const saveAddress = vi.fn(), saveCustody = vi.fn();
    await api.submitAssignments({ rows, wallets: generated, keepKeys: false, loadAccounts: async () => [], saveAddress, saveCustody });
    expect(saveCustody).toHaveBeenCalledWith('b', wif, 'Wallet #1');
    expect(generated[0].wif).toBe('');
    expect(rows[0].custodySaved).toBe(true);
  });

  it('preserves failed keys for custody-only retry, hides arbitrary errors, and warns on discard', async () => {
    const h = generatedHarness({ section: 'B', failCustody: true });
    await h.loader.openGenerate();
    findButton(h.doc, 'Submit assignments').click();
    await vi.waitFor(() => expect(findButton(h.doc, 'Submit assignments').disabled).toBe(false));
    expect(h.generated[0].wif).toBe(wif);
    expect(h.doc.querySelector('table').textContent.toLowerCase()).toContain('key not held');
    expect(h.doc.body.textContent).not.toContain(wif);
    findButton(h.doc, 'Close').click();
    expect(h.dom.window.confirm).toHaveBeenCalledOnce();
    expect(h.doc.querySelector('dialog')).not.toBeNull();
    findButton(h.doc, 'Submit assignments').click();
    await vi.waitFor(() => expect(h.generated[0].wif).toBe(''));
    expect(h.post.mock.calls.filter(call => call[0] === '/wallet/address')).toHaveLength(1);
    expect(h.post.mock.calls.filter(call => call[0] === '/wallet/custody')).toHaveLength(2);
    findButton(h.doc, 'Close').click();
    expect(h.doc.querySelector('dialog')).toBeNull();
    expect(h.dom.window.confirm).toHaveBeenCalledOnce();
  });

  it('allows deselection and discards unused keys once the selected batch succeeds', async () => {
    const h = generatedHarness();
    await h.loader.openGenerate();
    const selected = h.doc.querySelectorAll('table input[type=checkbox]');
    expect(selected).toHaveLength(2);
    selected[1].checked = false; selected[1].dispatchEvent(new h.dom.window.Event('change'));
    findButton(h.doc, 'Submit assignments').click();
    await vi.waitFor(() => expect(h.generated.every(wallet => wallet.wif === '')).toBe(true));
    expect(h.post).toHaveBeenCalledTimes(2);
    expect(findButton(h.doc, 'Submit assignments').disabled).toBe(true);
    expect(h.storage).not.toHaveBeenCalled();
    expect(h.doc.body.innerHTML).not.toContain(wif);
    expect(h.doc.body.innerHTML).not.toContain(secondWif);
  });

  it('aborts and clears the whole batch if any generation fails', async () => {
    const h = generatedHarness({ failGeneration: true });
    await h.loader.openGenerate();
    expect(h.generateWallet).toHaveBeenCalledTimes(2);
    expect(h.generated[0].wif).toBe('');
    expect(findButton(h.doc, 'Submit assignments').disabled).toBe(true);
    expect(h.post).not.toHaveBeenCalled();
    expect(h.doc.body.innerHTML).not.toContain(wif);
  });

  it('clears unsaved keys on confirmed close and prevents late pagehide generation from retaining keys', async () => {
    const h = generatedHarness({ section: 'B' });
    await h.loader.openGenerate();
    h.dom.window.confirm.mockReturnValue(true);
    findButton(h.doc, 'Close').click();
    expect(h.generated[0].wif).toBe('');
    expect(h.doc.querySelector('dialog')).toBeNull();

    const late = generatedHarness({ section: 'B' });
    let finish;
    late.generateWallet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const opened = late.loader.openGenerate();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    late.dom.window.dispatchEvent(new late.dom.window.Event('pagehide'));
    const wallet = { ...wallets[0] }; finish(wallet);
    await opened;
    expect(wallet.wif).toBe('');
    expect(late.post).not.toHaveBeenCalled();
  });

  it('refuses unavailable secure randomness and wires the disabled-button explanation only into the teacher dashboard', async () => {
    const h = generatedHarness();
    Object.defineProperty(h.dom.window, 'isSecureContext', { value: false, configurable: true });
    expect(h.loader.generationUnavailableReason()).toMatch(/HTTPS|secure/i);
    await h.loader.openGenerate();
    expect(h.generateWallet).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
    expect(DASH).toContain('id="wallet-generate-btn"');
    expect(DASH).toContain('generationUnavailableReason');
    expect(DASH).toContain('_walletLoader.openGenerate()');
    expect(readFileSync(new URL('../ap_stats_roadmap_square_mode.html', import.meta.url), 'utf8')).not.toContain('wallet-generate-btn');
  });
});

describe('bulk submission and retry', () => {
  it('retries only custody after address success and never reassigns on resubmit', async () => {
    const { api } = boot();
    const rows = api.planAssignments([students[0]], wallets, []);
    const accounts = [];
    const saveAddress = vi.fn(async (id, value) => { accounts.push({ studentId: id, dogeAddress: value }); });
    const saveCustody = vi.fn().mockRejectedValueOnce(new Error('wallet custody key not configured')).mockResolvedValue(undefined);
    const input = { rows, wallets, keepKeys: true, loadAccounts: async () => accounts, saveAddress, saveCustody };
    await api.submitAssignments(input);
    expect(rows[0]).toMatchObject({ addressSaved: true, done: false });
    expect(rows[0].message).toContain('key not held');
    await api.submitAssignments(input);
    await api.submitAssignments(input);
    expect(saveAddress).toHaveBeenCalledTimes(1);
    expect(saveCustody).toHaveBeenCalledTimes(2);
    expect(rows[0].done).toBe(true);
    expect(api.planAssignments([students[0]], wallets, accounts)).toEqual([]);
  });
  it('does not replace newly assigned or archived-owned addresses found during refresh', async () => {
    const { api } = boot();
    const saveAddress = vi.fn(), saveCustody = vi.fn();
    for (const accounts of [[{ studentId: 'b', dogeAddress: secondAddress }], [{ studentId: 'archived', dogeAddress: address }]]) {
      const rows = api.planAssignments([students[0]], wallets, []);
      await api.submitAssignments({ rows, wallets, keepKeys: true, loadAccounts: async () => accounts, saveAddress, saveCustody });
      expect(rows[0].done).toBe(false);
    }
    expect(saveAddress).not.toHaveBeenCalled(); expect(saveCustody).not.toHaveBeenCalled();
  });
  it('fails closed on refresh failure or duplicate dropdown selections', async () => {
    const { api } = boot();
    const rows = api.planAssignments(students, wallets, []);
    const saveAddress = vi.fn();
    const input = { rows, wallets, keepKeys: false, loadAccounts: vi.fn().mockRejectedValue(new Error('offline')), saveAddress };
    await expect(api.submitAssignments(input)).rejects.toThrow('offline');
    rows[1].walletIndex = rows[0].walletIndex;
    await expect(api.submitAssignments(input)).rejects.toThrow('different wallet');
    expect(saveAddress).not.toHaveBeenCalled();
  });
  it('can load addresses without custody configuration', async () => {
    const { api } = boot();
    const rows = api.planAssignments([students[0]], wallets, []);
    const saveAddress = vi.fn(), saveCustody = vi.fn();
    await api.submitAssignments({ rows, wallets, keepKeys: false, loadAccounts: async () => [], saveAddress, saveCustody });
    expect(saveAddress).toHaveBeenCalledOnce(); expect(saveCustody).not.toHaveBeenCalled();
    expect(rows[0].message).toBe('✓ Address saved.');
  });
});

describe('teacher import and reveal dialogs', () => {
  it('writes nothing during review, defaults custody on, uses text nodes for labels and clears input on close', async () => {
    const { api, doc } = boot();
    const post = vi.fn(async () => ok({}));
    const get = vi.fn(async path => {
      if (path === '/roster/list') return ok({ students: students.map(student => ({ ...student, currentPassword: 'not retained' })) });
      if (path === '/class/grades') return ok({ students });
      return ok({ accounts: [] });
    });
    const ui = api.create({ get, post, changed() {} });
    await ui.openBulk();
    expect(doc.querySelector('input[type=checkbox]').checked).toBe(true);
    doc.querySelector('textarea').value = csv('<img src=x onerror=alert(1)>');
    findButton(doc, 'Review assignments').click();
    await vi.waitFor(() => expect(findButton(doc, 'Submit assignments').disabled).toBe(false));
    expect(post).not.toHaveBeenCalled(); expect(doc.querySelector('img')).toBeNull();
    expect(doc.body.innerHTML).not.toContain('not retained');
    expect(doc.querySelector('textarea').value).toBe('');
    findButton(doc, 'Submit assignments').click();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls.map(call => call[0])).toEqual(['/wallet/address', '/wallet/custody']);
    await vi.waitFor(() => expect(findButton(doc, 'Close').disabled).toBe(false));
    findButton(doc, 'Close').click();
    expect(doc.querySelector('dialog')).toBeNull(); expect(doc.body.innerHTML).not.toContain(wif);
  });
  it('requires exact typed REVEAL, then removes the revealed key when closed', async () => {
    const { api, doc, dom } = boot();
    const get = vi.fn(async () => ok({ wif, address, label: 'Wallet #1' }));
    api.create({ get, post: vi.fn(), changed() {} }).openReveal(students[0]);
    const confirm = doc.querySelector('input');
    confirm.value = 'reveal'; confirm.dispatchEvent(new dom.window.Event('input'));
    expect(findButton(doc, 'Reveal key').disabled).toBe(true); expect(get).not.toHaveBeenCalled();
    confirm.value = 'REVEAL'; confirm.dispatchEvent(new dom.window.Event('input'));
    findButton(doc, 'Reveal key').click();
    await vi.waitFor(() => expect(doc.querySelector('input[readonly]')?.value).toBe(wif));
    expect(get).toHaveBeenCalledWith('/wallet/custody/b?confirm=1');
    findButton(doc, 'Close').click(); expect(doc.querySelector('dialog')).toBeNull();
  });
  it('never requests reveal without the typed confirm and shows no secret on an auth failure', async () => {
    const { api, doc, dom } = boot();
    const get = vi.fn(async () => ({ status: 401, data: { error: 'forbidden' } }));
    api.create({ get, changed() {} }).openReveal(students[0]);
    const confirm = doc.querySelector('input'); confirm.value = 'REVEAL'; confirm.dispatchEvent(new dom.window.Event('input'));
    findButton(doc, 'Reveal key').click();
    await vi.waitFor(() => expect(doc.querySelector('.wallet-status').textContent).toBe('forbidden'));
    expect(doc.querySelector('input[readonly]')).toBeNull();
  });
  it('loads custody scripts only from the teacher dashboard', () => {
    expect(DASH).toContain('id="wallet-load-btn"');
    expect(DASH).toContain('_walletLoader.decorateAddressCell(addrTd, s)');
    for (const file of ['doge-keys.js', 'js/teacher-wallet-loading.js', 'js/wallet-qr-scanner.js']) {
      expect(DASH).toContain('src="' + file + '"');
      expect(readFileSync(new URL('../ap_stats_roadmap_square_mode.html', import.meta.url), 'utf8')).not.toContain('src="' + file + '"');
    }
  });
  it('can toggle custody off and on after a matching WIF scan without losing the ready state', async () => {
    const { api, doc, dom } = boot();
    let scan;
    dom.window.WalletQrScanner = { create(options) { scan = options.onCode; return { start: async () => true, stop() {} }; } };
    api.create({ get: vi.fn(), post: vi.fn(), changed() {} }).openScan(students[0]);
    await scan(address); await scan(wif);
    const keep = doc.querySelector('input[type=checkbox]');
    expect(findButton(doc, 'Save scanned wallet').disabled).toBe(false);
    keep.checked = false; keep.dispatchEvent(new dom.window.Event('change'));
    keep.checked = true; keep.dispatchEvent(new dom.window.Event('change'));
    expect(findButton(doc, 'Save scanned wallet').disabled).toBe(false);
    findButton(doc, 'Close').click();
  });
  it('ignores late WIF decoding after the teacher chooses address-only and starts saving', async () => {
    const { api, doc, dom } = boot();
    let scan, finishDecode, finishSave;
    dom.window.DogeKeys = { addressFromWIF: () => new Promise(resolve => { finishDecode = resolve; }) };
    dom.window.WalletQrScanner = { create(options) { scan = options.onCode; return { start: async () => true, stop() {} }; } };
    const post = vi.fn(() => new Promise(resolve => { finishSave = resolve; }));
    api.create({ get: async () => ok({ accounts: [] }), post, changed() {} }).openScan(students[0]);
    await scan(address); const decoding = scan(wif);
    const keep = doc.querySelector('input[type=checkbox]'); keep.checked = false; keep.dispatchEvent(new dom.window.Event('change'));
    findButton(doc, 'Save scanned wallet').click();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    finishDecode(address); await decoding;
    expect(findButton(doc, 'Save scanned wallet').disabled).toBe(true);
    finishSave(ok({}));
    await vi.waitFor(() => expect(doc.querySelector('dialog')).toBeNull());
    expect(post).toHaveBeenCalledTimes(1); expect(post.mock.calls[0][0]).toBe('/wallet/address');
  });

  it('reads the same WIF QR again after a custody toggle invalidates pending validation', async () => {
    const { api, doc, dom } = boot();
    const camera = attachScanner(dom);
    let finishDecode;
    const derive = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishDecode = resolve; }))
      .mockResolvedValue(address);
    dom.window.DogeKeys = { addressFromWIF: derive };
    const post = vi.fn();
    api.create({ get: vi.fn(), post, changed() {} }).openScan(students[0]);
    await vi.waitFor(() => expect(camera.frames.size).toBe(1));
    camera.frame(address); camera.frame(wif);
    expect(derive).toHaveBeenCalledOnce();
    const keep = doc.querySelector('input[type=checkbox]');
    keep.checked = false; keep.dispatchEvent(new dom.window.Event('change'));
    keep.checked = true; keep.dispatchEvent(new dom.window.Event('change'));
    // Starting too soon would cache the repeated QR while the old decode is busy.
    expect(camera.getUserMedia).toHaveBeenCalledOnce();
    camera.frame(wif); expect(derive).toHaveBeenCalledOnce();
    finishDecode(address);
    await vi.waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(camera.frames.size).toBe(1));
    camera.frame(wif);
    await vi.waitFor(() => expect(findButton(doc, 'Save scanned wallet').disabled).toBe(false));
    expect(derive).toHaveBeenCalledTimes(2);
    expect(post).not.toHaveBeenCalled();
    findButton(doc, 'Close').click();
    expect(camera.frames.size).toBe(0);
  });

  it.each(['closed', 'hidden', 'pagehide'])('never restarts a late WIF decode after the scanner is %s', async mode => {
    const { api, doc, dom } = boot();
    const camera = attachScanner(dom);
    let finishDecode;
    dom.window.DogeKeys = { addressFromWIF: () => new Promise(resolve => { finishDecode = resolve; }) };
    api.create({ get: vi.fn(), post: vi.fn(), changed() {} }).openScan(students[0]);
    await vi.waitFor(() => expect(camera.frames.size).toBe(1));
    camera.frame(address); camera.frame(wif);
    const keep = doc.querySelector('input[type=checkbox]');
    keep.checked = false; keep.dispatchEvent(new dom.window.Event('change'));
    keep.checked = true; keep.dispatchEvent(new dom.window.Event('change'));
    if (mode === 'closed') findButton(doc, 'Close').click();
    if (mode === 'hidden') doc.dispatchEvent(new dom.window.Event('visibilitychange'));
    if (mode === 'pagehide') dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    finishDecode(address);
    await Promise.resolve(); await Promise.resolve();
    expect(camera.getUserMedia).toHaveBeenCalledOnce();
    expect(camera.frames.size).toBe(0);
    if (mode !== 'closed') findButton(doc, 'Close').click();
  });
});

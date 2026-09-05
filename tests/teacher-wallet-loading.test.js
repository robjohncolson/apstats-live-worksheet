// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
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

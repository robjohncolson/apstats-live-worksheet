// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createECDH, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { deriveAddress, deriveWIF, NETWORKS } from '../tools/doge-wallet-gen.mjs';

const encoderBytes = readFileSync(new URL('../vendor/qrcode-generator/qrcode-2.0.4.js', import.meta.url));
const decoderSource = readFileSync(new URL('../vendor/jsqr/jsQR-1.4.0.js', import.meta.url), 'utf8');

function qrLibraries() {
  const window = {};
  window.window = window;
  window.self = window;
  const sandbox = createContext(window);
  runInContext(encoderBytes.toString('utf8'), sandbox);
  runInContext(decoderSource, sandbox);
  return { qrcode: window.qrcode, jsQR: window.jsQR };
}

function encoderPixels(qrcode, value) {
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();

  const scale = 6;
  const quietZone = 4;
  const modules = qr.getModuleCount();
  const size = (modules + quietZone * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - quietZone;
      const column = Math.floor(x / scale) - quietZone;
      const inside = row >= 0 && column >= 0 && row < modules && column < modules;
      const color = inside && qr.isDark(row, column) ? 0 : 255;
      const offset = (y * size + x) * 4;
      data[offset] = color;
      data[offset + 1] = color;
      data[offset + 2] = color;
      data[offset + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

// Public deterministic fixtures only. Never load a real wallet or backup.
const fixtures = [
  ['scalar one', '1'.padStart(64, '0')],
  ['last valid scalar', 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140'],
].flatMap(([name, hex]) => {
  const privateKey = Buffer.from(hex, 'hex');
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privateKey);
  const address = deriveAddress(ecdh.getPublicKey(null, 'compressed'), NETWORKS.mainnet.p2pkh);
  const wif = deriveWIF(privateKey, NETWORKS.mainnet.wif);
  privateKey.fill(0);
  return [[`${name} address`, address], [`${name} WIF`, wif]];
});

describe('wallet print QR encoder', () => {
  it('preserves the official encoder and MIT license bytes', () => {
    expect(createHash('sha256').update(encoderBytes).digest('hex'))
      .toBe('79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c');
    const license = readFileSync(new URL('../vendor/qrcode-generator/LICENSE', import.meta.url));
    expect(createHash('sha256').update(license).digest('hex'))
      .toBe('3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c');
  });

  it.each(fixtures)('round-trips %s through the actual vendored encoder and decoder', (_name, value) => {
    const { qrcode, jsQR } = qrLibraries();
    const { data, width, height } = encoderPixels(qrcode, value);
    const decoded = jsQR(data, width, height);
    expect(decoded).not.toBeNull();
    expect(decoded.data).toBe(value);
  });
});

const rendererSource = readFileSync(new URL('../js/wallet-print-sheets.js', import.meta.url), 'utf8');
const printDisposers = [];
afterEach(() => printDisposers.splice(0).forEach(dispose => dispose()));

function printWallets() {
  return [
    { studentId: 'student-1', realName: 'Alex Example', username: 'alex', section: 'Period 1', label: 'Wallet #17', address: fixtures[0][1], wif: fixtures[1][1] },
    { studentId: 'student-2', realName: 'Sam Example', username: 'sam', section: 'Period 2', label: 'Wallet #18', address: fixtures[2][1], wif: fixtures[3][1] },
  ];
}

function printHarness({ blocked = false, encoder = true } = {}) {
  const dashboard = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://school.example/teacher-dashboard.html', runScripts: 'outside-only' });
  const child = new JSDOM('<!doctype html><html><body></body></html>', { url: 'about:blank' });
  const root = dashboard.window;
  const popup = child.window;
  const disposeChild = popup.close.bind(popup);
  printDisposers.push(() => { root.close(); disposeChild(); });
  const frames = new Map();
  const timers = new Map();
  let nextId = 1;
  popup.requestAnimationFrame = vi.fn(callback => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  popup.cancelAnimationFrame = vi.fn(id => frames.delete(id));
  root.setTimeout = vi.fn(callback => {
    const id = nextId++;
    timers.set(id, callback);
    return id;
  });
  root.clearTimeout = vi.fn(id => timers.delete(id));
  const nativeClose = vi.fn(() => { popup.closed = true; });
  popup.close = nativeClose;
  popup.print = vi.fn();
  popup.focus = vi.fn();
  root.open = vi.fn(() => blocked ? null : popup);
  root.fetch = vi.fn();
  const localWrite = vi.spyOn(root.Storage.prototype, 'setItem');
  const indexedDbOpen = vi.fn();
  root.indexedDB = { open: indexedDbOpen };
  if (encoder) root.qrcode = qrLibraries().qrcode;
  root.eval(rendererSource);

  function frame() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback());
  }
  function timeout() {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach(callback => callback());
  }
  return { root, popup, frames, timers, frame, timeout, nativeClose, localWrite, indexedDbOpen };
}

// Rasterize the actual emitted SVG elements, including their quiet zone and
// explicit colors. The encoder matrix is intentionally not consulted here.
function renderedSvgPixels(svg) {
  const [originX, originY, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  expect([originX, originY]).toEqual([0, 0]);
  const scale = 6;
  const pixelWidth = width * scale;
  const pixelHeight = height * scale;
  const data = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);
  for (const rect of svg.querySelectorAll('rect')) {
    const x = Number(rect.getAttribute('x') || 0) * scale;
    const y = Number(rect.getAttribute('y') || 0) * scale;
    const rectangleWidth = Number(rect.getAttribute('width')) * scale;
    const rectangleHeight = Number(rect.getAttribute('height')) * scale;
    const fill = rect.getAttribute('fill');
    expect(['#fff', '#000']).toContain(fill);
    const color = fill === '#000' ? 0 : 255;
    for (let row = y; row < y + rectangleHeight; row += 1) {
      for (let column = x; column < x + rectangleWidth; column += 1) {
        const offset = (row * pixelWidth + column) * 4;
        data[offset] = color;
        data[offset + 1] = color;
        data[offset + 2] = color;
        data[offset + 3] = 255;
      }
    }
  }
  return { data, width: pixelWidth, height: pixelHeight };
}

describe('wallet print sheets', () => {
  it('renders a cover and separate letter pages with each private key only on its own page', async () => {
    const h = printHarness();
    const wallets = printWallets();
    const expected = wallets.map(wallet => ({ ...wallet }));
    const session = h.root.WalletPrintSheets.open();
    expect(h.root.open).toHaveBeenCalledWith('', '_blank');
    const printing = session.print(wallets, { section: 'All sections', cover: true, date: '2026-09-05T12:00:00Z' });
    expect(wallets.map(wallet => wallet.wif)).toEqual(['', '']);
    expect(h.popup.print).not.toHaveBeenCalled();

    const doc = h.popup.document;
    const cover = doc.querySelector('.wallet-cover');
    const pages = [...doc.querySelectorAll('section.wallet-sheet.page-break')];
    expect(doc.querySelectorAll('section.page-break')).toHaveLength(3);
    expect(cover.textContent).toContain('All sections');
    expect(cover.textContent).toContain('2 wallets');
    expect(cover.textContent).toContain('Keep sealed');
    expect(cover.textContent).toContain(new Date('2026-09-05T12:00:00Z').toLocaleDateString());
    expect(doc.querySelector('style').textContent).toMatch(/@page\s*\{\s*size:\s*letter/);
    expect(doc.querySelector('style').textContent).toContain('page-break-after: always');
    expect(pages).toHaveLength(2);
    pages.forEach((page, index) => {
      const wallet = expected[index];
      for (const field of ['realName', 'section', 'label', 'address', 'wif']) expect(page.textContent).toContain(wallet[field]);
      expect(page.textContent).toContain("Handle offline. Each card's private key controls real money.");
      expect(page.textContent).toContain('Print, cut, hand out — then delete this file or move it to an offline drive.');
      expect(page.textContent).toContain('Students can print their own wallet sheet. Keep all private keys confidential.');
      expect(page.textContent).toContain('Anyone with this key owns the coins.');
      const outside = doc.documentElement.cloneNode(true);
      outside.querySelectorAll('.wallet-sheet')[index].remove();
      expect(outside.outerHTML).not.toContain(wallet.wif);
      expect(page.querySelectorAll('svg')).toHaveLength(2);
    });
    expect(h.root.document.documentElement.outerHTML).not.toContain(expected[0].wif);
    expect(h.localWrite).not.toHaveBeenCalled();
    expect(h.indexedDbOpen).not.toHaveBeenCalled();
    expect(h.root.fetch).not.toHaveBeenCalled();
    expect(doc.querySelector('script, img, link, iframe')).toBeNull();
    expect(doc.querySelector('.wallet-print-controls')).toBeNull();
    h.frame();
    expect(h.popup.print).not.toHaveBeenCalled();
    h.frame();
    expect(await printing).toBe(true);
    expect(h.popup.print).toHaveBeenCalledOnce();
    expect(doc.body.textContent).toContain(expected[0].wif);
    expect(h.frames.size + h.timers.size).toBe(0);
    session.close();
  });

  it('reprints a single page and decodes both actual rendered QR codes with vendored jsQR', async () => {
    const h = printHarness();
    const wallets = printWallets().slice(0, 1);
    const { address, wif } = wallets[0];
    const session = h.root.WalletPrintSheets.open();
    const printing = session.print(wallets, { cover: false, section: 'Period 1' });
    expect(h.popup.document.querySelector('.wallet-cover')).toBeNull();
    expect(h.popup.document.querySelectorAll('section.page-break')).toHaveLength(1);
    const codes = [...h.popup.document.querySelectorAll('.wallet-sheet svg')];
    const { jsQR } = qrLibraries();
    expect(codes).toHaveLength(2);
    codes.forEach((svg, index) => {
      const pixels = renderedSvgPixels(svg);
      const decoded = jsQR(pixels.data, pixels.width, pixels.height);
      expect(decoded).not.toBeNull();
      expect(decoded.data).toBe([address, wif][index]);
    });
    h.timeout();
    expect(await printing).toBe(true);
    expect(h.popup.print).toHaveBeenCalledOnce();
    session.close();
  });

  it.each(['return', 'early afterprint', 'later afterprint'])('retains a student sheet after print %s until Done clears its keys', async completedBy => {
    const h = printHarness();
    const wallets = printWallets().slice(0, 1);
    const { address, wif } = wallets[0];
    const session = h.root.WalletPrintSheets.open({ isCurrent: () => true });
    const printing = session.print(wallets, { cover: false, audience: 'student' });
    const doc = h.popup.document;
    expect(doc.querySelector('.wallet-cover')).toBeNull();
    expect(doc.querySelectorAll('.wallet-sheet')).toHaveLength(1);
    expect(doc.body.textContent).toContain('Keep this sheet sealed in a safe place.');
    expect(doc.body.textContent).toContain('Anyone with the private key can spend');
    expect(doc.body.textContent).toContain('Your teacher keeps a backup.');
    expect(doc.body.textContent).not.toContain('Student surfaces use only the address');
    expect(doc.body.textContent).not.toContain('teacher-custody dashboard');
    expect(wallets[0].wif).toBe('');
    expect(h.root.document.documentElement.outerHTML).not.toContain(wif);
    const { jsQR } = qrLibraries();
    [...doc.querySelectorAll('.wallet-sheet svg')].forEach((svg, index) => {
      const pixels = renderedSvgPixels(svg);
      expect(jsQR(pixels.data, pixels.width, pixels.height).data).toBe([address, wif][index]);
    });
    if (completedBy === 'early afterprint') {
      h.popup.print.mockImplementation(() => {
        h.popup.dispatchEvent(new h.popup.Event('afterprint'));
        expect(doc.body.textContent).toContain(wif);
      });
    }
    h.timeout();
    expect(await printing).toBe(true);
    expect(h.popup.print).toHaveBeenCalledOnce();
    if (completedBy === 'later afterprint') h.popup.dispatchEvent(new h.popup.Event('afterprint'));
    expect(session.isClosed()).toBeFalsy();
    expect(doc.body.textContent).toContain(wif);
    expect(h.nativeClose).not.toHaveBeenCalled();
    const closeButton = doc.querySelector('.wallet-print-controls button');
    expect(closeButton.textContent).toBe('Done — close wallet sheet');
    expect(doc.querySelector('style').textContent).toMatch(/@media print\s*\{\s*\.wallet-print-controls\s*\{\s*display:\s*none/);
    closeButton.click();
    expect(session.isClosed()).toBe(true);
    expect(h.nativeClose).toHaveBeenCalledOnce();
    expect(doc.documentElement.outerHTML).not.toContain(wif);
    expect(doc.body.childNodes).toHaveLength(0);
    expect(doc.head.childNodes).toHaveLength(0);
    expect(h.frames.size + h.timers.size).toBe(0);
    expect(h.localWrite).not.toHaveBeenCalled();
    expect(h.indexedDbOpen).not.toHaveBeenCalled();
    expect(h.root.fetch).not.toHaveBeenCalled();
  });

  it.each(['stale', 'throws'])('refuses to render private material when its session guard %s', async invalid => {
    const h = printHarness();
    const wallets = printWallets();
    const secret = wallets[0].wif;
    h.root.qrcode = vi.fn(h.root.qrcode);
    const isCurrent = () => {
      if (invalid === 'throws') throw new Error(secret);
      return false;
    };
    const session = h.root.WalletPrintSheets.open({ isCurrent });
    expect(await session.print(wallets, { audience: 'student', cover: false })).toBe(false);
    expect(wallets.map(wallet => wallet.wif)).toEqual(['', '']);
    expect(h.root.qrcode).not.toHaveBeenCalled();
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(h.popup.document.documentElement.outerHTML).not.toContain(secret);
    expect(session.isClosed()).toBe(true);
    expect(h.frames.size + h.timers.size).toBe(0);
  });

  it.each(['timeout', 'frame', 'focus', 'guard error'])('cancels student printing if identity changes before %s', async boundary => {
    const h = printHarness();
    const wallets = printWallets().slice(0, 1);
    const secret = wallets[0].wif;
    let current = true;
    let failed = false;
    const isCurrent = () => {
      if (failed) throw new Error(secret);
      return current;
    };
    const session = h.root.WalletPrintSheets.open({ isCurrent });
    const printing = session.print(wallets, { cover: false, audience: 'student' });
    expect(h.popup.document.body.textContent).toContain(secret);
    if (boundary === 'focus') h.popup.focus.mockImplementation(() => { current = false; });
    else if (boundary === 'guard error') failed = true;
    else current = false;
    if (boundary === 'frame') { h.frame(); h.frame(); }
    else h.timeout();
    expect(await printing).toBe(false);
    expect(h.popup.print).not.toHaveBeenCalled();
    expect(session.isClosed()).toBe(true);
    expect(h.popup.document.body.childNodes).toHaveLength(0);
    expect(h.popup.document.documentElement.outerHTML).not.toContain(secret);
    expect(h.frames.size + h.timers.size).toBe(0);
  });

  it('treats identity, label, section, and wallet values as text rather than markup', async () => {
    const h = printHarness();
    const payload = '<img src=x onerror="alert(1)"> & <script>bad()</script>';
    const wallet = { realName: payload, username: payload, section: payload, label: payload, address: payload, wif: payload };
    const session = h.root.WalletPrintSheets.open();
    const printing = session.print([wallet], { section: payload });
    const doc = h.popup.document;
    expect(doc.querySelector('img, script, [onerror]')).toBeNull();
    expect(doc.querySelector('h1').textContent).toBe('Dogecoin wallet sheets');
    expect(doc.querySelector('.wallet-sheet h1').textContent).toBe(payload);
    expect(doc.querySelector('.wallet-sheet h2').textContent).toBe(payload);
    expect(doc.querySelector('.public-address code').textContent).toBe(payload);
    expect(doc.querySelector('.private-key code').textContent).toBe(payload);
    expect(doc.querySelector('.wallet-cover').textContent).toContain(payload);
    expect(wallet.wif).toBe('');
    session.close();
    expect(await printing).toBe(false);
  });

  it('fails before opening when tools are unavailable and reports popup blocking safely', () => {
    const missing = printHarness({ encoder: false });
    expect(() => missing.root.WalletPrintSheets.open()).toThrow('Wallet print tools did not load');
    expect(missing.root.open).not.toHaveBeenCalled();
    const blocked = printHarness({ blocked: true });
    expect(() => blocked.root.WalletPrintSheets.open()).toThrow('Allow popups');
    expect(blocked.root.fetch).not.toHaveBeenCalled();
  });

  it.each(['session', 'window', 'pagehide', 'beforeunload', 'parent'])('clears keys and cancels late printing on %s close', async method => {
    const h = printHarness();
    const wallets = printWallets();
    const secret = wallets[0].wif;
    const session = h.root.WalletPrintSheets.open();
    const printing = session.print(wallets);
    const lateFrame = [...h.frames.values()][0];
    const doc = h.popup.document;
    expect(doc.body.textContent).toContain(secret);
    if (method === 'session') session.close();
    else if (method === 'window') h.popup.close();
    else if (method === 'parent') h.root.dispatchEvent(new h.root.Event('pagehide'));
    else h.popup.dispatchEvent(new h.popup.Event(method));
    expect(await printing).toBe(false);
    expect(session.isClosed()).toBe(true);
    expect(doc.documentElement.outerHTML).not.toContain(secret);
    expect(doc.body.childNodes).toHaveLength(0);
    expect(h.frames.size + h.timers.size).toBe(0);
    lateFrame();
    h.frame();
    h.timeout();
    expect(h.popup.print).not.toHaveBeenCalled();
    session.close();
  });

  it('clears a completed print window when window.close is called', async () => {
    const h = printHarness();
    const wallets = printWallets();
    const secret = wallets[0].wif;
    const session = h.root.WalletPrintSheets.open();
    const printing = session.print(wallets);
    h.timeout();
    expect(await printing).toBe(true);
    expect(h.popup.document.body.textContent).toContain(secret);
    h.popup.close();
    expect(h.popup.document.body.childNodes).toHaveLength(0);
    expect(session.isClosed()).toBe(true);
    expect(h.nativeClose).toHaveBeenCalledOnce();
  });

  it('wipes all inputs and partially rendered pages if one wallet cannot render', () => {
    const h = printHarness();
    const wallets = printWallets();
    const secret = wallets[0].wif;
    wallets[1].address = '';
    const session = h.root.WalletPrintSheets.open();
    expect(() => session.print(wallets)).toThrow('Wallet sheets could not be prepared');
    expect(wallets.map(wallet => wallet.wif)).toEqual(['', '']);
    expect(h.popup.document.documentElement.outerHTML).not.toContain(secret);
    expect(session.isClosed()).toBe(true);
    expect(h.nativeClose).toHaveBeenCalledOnce();
    expect(h.popup.print).not.toHaveBeenCalled();
  });

  it('clears keys and returns a sanitized error if browser printing fails', async () => {
    const h = printHarness();
    const wallets = printWallets();
    const secret = wallets[0].wif;
    h.popup.print.mockImplementation(() => { throw new Error(secret); });
    const session = h.root.WalletPrintSheets.open();
    const printing = session.print(wallets);
    const failure = expect(printing).rejects.toThrow('Printing could not start');
    h.timeout();
    await failure;
    expect(h.popup.document.documentElement.outerHTML).not.toContain(secret);
    expect(session.isClosed()).toBe(true);
    expect(h.frames.size + h.timers.size).toBe(0);
  });
});

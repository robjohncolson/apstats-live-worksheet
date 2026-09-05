// Printable wallets. Private material stays in the print window.
(function (root) {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  const WARNING = "Handle offline. Each card's private key controls real money. " +
    'Print, cut, hand out — then delete this file or move it to an offline drive. ' +
    'Students can print their own wallet sheet. Keep all private keys confidential. Import a private key only into ' +
    'your trusted teacher-custody dashboard or wallet software. ' +
    'Test on testnet before funding mainnet.';
  const STUDENT_WARNING = 'Keep this sheet sealed in a safe place. Never share ' +
    'the private key or its QR code. Anyone with the private key can spend ' +
    'this wallet’s DOGE. Your teacher keeps a backup. If you save a PDF, keep it private too.';
  const STYLE = `
    @page { size: letter; margin: 0.6in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: white; font: 14px Arial, sans-serif; }
    .page-break { page-break-after: always; break-after: page; break-inside: avoid; }
    .page-break:last-child { page-break-after: auto; break-after: auto; }
    .wallet-sheet, .wallet-cover { padding: 0.15in 0; }
    h1 { font-size: 25px; margin: 0 0 12px; overflow-wrap: anywhere; }
    h2 { font-size: 18px; margin: 0 0 12px; overflow-wrap: anywhere; }
    .identity { margin-bottom: 24px; overflow-wrap: anywhere; }
    .wallet-field { display: flex; gap: 20px; align-items: center; margin: 24px 0; }
    .wallet-field svg { width: 1.7in; height: 1.7in; flex: none; }
    .wallet-value { min-width: 0; }
    .wallet-value p { margin: 0 0 10px; }
    .wallet-value code { font: 15px 'Courier New', monospace; overflow-wrap: anywhere; }
    .public-address { color: #075b26; }
    .private-key { color: #8d1414; }
    .warning { border: 2px solid #8d1414; padding: 14px; font-size: 12px; line-height: 1.5; }
    .warning strong { display: block; margin-bottom: 7px; font-size: 14px; }
    .wallet-cover { padding-top: 1in; }
    .wallet-cover p { font-size: 18px; margin: 24px 0; overflow-wrap: anywhere; }
    .wallet-print-controls { max-width: 7.3in; margin: 0 auto 20px; }
    .wallet-print-controls button { padding: 10px 14px; font: 16px Arial, sans-serif; }
    @media print { .wallet-print-controls { display: none; } }
    @media screen {
      body { background: #eee; padding: 20px; }
      .wallet-sheet, .wallet-cover { background: white; width: 7.3in; max-width: 100%; padding: 24px; margin: 0 auto 20px; }
    }
  `;

  function textElement(doc, tag, text, className) {
    const element = doc.createElement(tag);
    element.textContent = text == null ? '' : String(text);
    if (className) element.className = className;
    return element;
  }

  function qrSvg(doc, value, description) {
    const code = root.qrcode(0, 'M');
    code.addData(value, 'Byte');
    code.make();
    const modules = code.getModuleCount();
    const margin = 4;
    const size = modules + margin * 2;
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', description);
    const background = doc.createElementNS(SVG, 'rect');
    background.setAttribute('width', String(size));
    background.setAttribute('height', String(size));
    background.setAttribute('fill', '#fff');
    svg.appendChild(background);
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (!code.isDark(row, column)) continue;
        const square = doc.createElementNS(SVG, 'rect');
        square.setAttribute('x', String(column + margin));
        square.setAttribute('y', String(row + margin));
        square.setAttribute('width', '1');
        square.setAttribute('height', '1');
        square.setAttribute('fill', '#000');
        svg.appendChild(square);
      }
    }
    return svg;
  }

  function walletField(doc, heading, value, className, description) {
    const field = textElement(doc, 'div', '', 'wallet-field ' + className);
    const text = textElement(doc, 'div', '', 'wallet-value');
    text.append(textElement(doc, 'p', heading), textElement(doc, 'code', value));
    field.append(qrSvg(doc, value, description), text);
    return field;
  }

  function walletPage(doc, wallet, audience) {
    if (!wallet || typeof wallet.address !== 'string' || !wallet.address || typeof wallet.wif !== 'string' || !wallet.wif) {
      throw new Error('Incomplete wallet.');
    }
    const page = textElement(doc, 'section', '', 'wallet-sheet page-break');
    page.appendChild(textElement(doc, 'h1', wallet.realName || wallet.username || 'Student wallet'));
    page.appendChild(textElement(doc, 'p', 'Section: ' + (wallet.section || 'Unassigned'), 'identity'));
    page.appendChild(textElement(doc, 'h2', wallet.label || 'Paper wallet'));
    page.appendChild(walletField(doc, 'Address (public — fund this, watch-only):', wallet.address, 'public-address', 'Public address QR'));
    page.appendChild(walletField(doc, '⚠ Private key (KEEP SECRET — controls the coins):', wallet.wif, 'private-key', 'Private key QR'));
    const warning = textElement(doc, 'div', '', 'warning');
    const student = audience === 'student';
    warning.append(
      textElement(doc, 'strong', student ? 'Anyone with this key can spend the coins.' : 'Anyone with this key owns the coins.'),
      textElement(doc, 'span', student ? STUDENT_WARNING : WARNING)
    );
    page.appendChild(warning);
    return page;
  }

  function renderPrintDocument(doc, wallets, options) {
    if (!Array.isArray(wallets) || !wallets.length) throw new Error('No wallets to print.');
    const style = textElement(doc, 'style', STYLE);
    doc.head.replaceChildren(textElement(doc, 'title', 'Dogecoin wallet sheets'), style);
    doc.body.replaceChildren();
    if (options.cover !== false) {
      const date = options.date == null ? new Date() : new Date(options.date);
      if (!Number.isFinite(date.getTime())) throw new Error('Invalid print date.');
      const cover = textElement(doc, 'section', '', 'wallet-cover page-break');
      cover.append(
        textElement(doc, 'h1', 'Dogecoin wallet sheets'),
        textElement(doc, 'p', 'Date: ' + date.toLocaleDateString()),
        textElement(doc, 'p', 'Section: ' + (options.section || 'All sections')),
        textElement(doc, 'p', wallets.length + ' wallet' + (wallets.length === 1 ? '' : 's')),
        textElement(doc, 'p', 'Keep sealed. Each following page contains one student’s private key.')
      );
      doc.body.appendChild(cover);
    }
    for (const wallet of wallets) doc.body.appendChild(walletPage(doc, wallet, options.audience));
  }

  function forgetWalletKeys(wallets) {
    if (!Array.isArray(wallets)) return;
    for (const wallet of wallets) {
      if (wallet && typeof wallet === 'object') wallet.wif = '';
    }
  }

  function open(options = {}) {
    if (typeof root.qrcode !== 'function') throw new Error('Wallet print tools did not load. Reload this page.');
    let popup = root.open('', '_blank');
    if (!popup || popup.closed) throw new Error('Allow popups for this page, then try printing again.');
    let nativeClose = popup.close.bind(popup);
    let pending = null;
    let frame = null;
    let timer = null;
    let isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : null;
    let closeButton = null;
    options = null;

    function isClosed() {
      return !popup || popup.closed;
    }

    function cancelSchedule() {
      if (frame !== null && popup) popup.cancelAnimationFrame(frame);
      if (timer !== null) root.clearTimeout(timer);
      frame = null;
      timer = null;
    }

    function finish(value) {
      if (!pending) return;
      const resolve = pending.resolve;
      pending = null;
      resolve(value);
    }

    function clear() {
      cancelSchedule();
      finish(false);
      isCurrent = null;
      removeCloseControl();
      root.removeEventListener('pagehide', close);
      if (!popup) return;
      try {
        popup.removeEventListener('pagehide', clear);
        popup.removeEventListener('beforeunload', clear);
        popup.document.body.replaceChildren();
        popup.document.head.replaceChildren();
      } catch (_) { /* A window navigated away from the blank print document. */ }
      popup = null;
      nativeClose = null;
    }

    function close() {
      const closeWindow = nativeClose;
      clear();
      if (closeWindow) closeWindow();
    }

    function hasCurrentSession() {
      if (isClosed()) return false;
      try {
        return !isCurrent || isCurrent() === true;
      } catch (_) {
        return false;
      }
    }

    function removeCloseControl() {
      if (!closeButton) return;
      closeButton.removeEventListener('click', close);
      closeButton = null;
    }

    function addCloseControl() {
      const doc = popup.document;
      const controls = textElement(doc, 'div', '', 'wallet-print-controls');
      closeButton = textElement(doc, 'button', 'Done — close wallet sheet');
      closeButton.type = 'button';
      closeButton.addEventListener('click', close);
      controls.append(
        closeButton,
        textElement(doc, 'p', 'After printing or saving your PDF, close this sheet to clear the private key from this window.')
      );
      doc.body.prepend(controls);
    }

    function printReady() {
      cancelSchedule();
      if (isClosed()) { clear(); return; }
      if (!hasCurrentSession()) { close(); return; }
      try {
        popup.focus();
        // Focusing the window can dispatch events that invalidate the student.
        if (!hasCurrentSession()) { close(); return; }
        popup.print();
        // Mobile print dialogs may outlive this call and even afterprint.
        // Keep the document until the student explicitly closes it.
        finish(true);
      } catch (_) {
        const reject = pending && pending.reject;
        pending = null;
        close();
        if (reject) reject(new Error('Printing could not start. Try printing the wallet sheets again.'));
      }
    }

    function schedulePrint() {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        // Inline SVG and local fonts need no downloads. Allow layout to finish;
        // the timer also permits printing when a background tab suspends frames.
        timer = root.setTimeout(printReady, 150);
        if (typeof popup.requestAnimationFrame !== 'function') return;
        frame = popup.requestAnimationFrame(() => {
          if (isClosed()) { clear(); return; }
          frame = popup.requestAnimationFrame(printReady);
        });
      });
    }

    function print(wallets, options = {}) {
      try {
        if (isClosed() || pending) throw new Error('Print window unavailable.');
        if (!hasCurrentSession()) { close(); return Promise.resolve(false); }
        removeCloseControl();
        renderPrintDocument(popup.document, wallets, options);
        if (options.audience === 'student') addCloseControl();
      } catch (_) {
        close();
        throw new Error('Wallet sheets could not be prepared. Try printing again.');
      } finally {
        // Strings cannot be overwritten; release caller references immediately.
        // Scheduling retains only the print window, never the response array.
        forgetWalletKeys(wallets);
      }
      return schedulePrint();
    }

    try {
      popup.opener = null;
      popup.document.open();
      popup.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dogecoin wallet sheets</title></head><body>Preparing wallet sheets…</body></html>');
      popup.document.close();
      popup.addEventListener('pagehide', clear);
      popup.addEventListener('beforeunload', clear);
      popup.close = close;
      root.addEventListener('pagehide', close);
    } catch (_) {
      close();
      throw new Error('The print window could not open. Try printing again.');
    }
    return { print, close, isClosed };
  }

  root.WalletPrintSheets = { open };
})(typeof window !== 'undefined' ? window : globalThis);

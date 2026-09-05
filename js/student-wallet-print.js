// A signed-in student may explicitly print only their own teacher-held wallet.
// Private material goes directly to the temporary print document, never storage.
(function (root) {
  'use strict';

  const ADDRESS = /^D[1-9A-HJ-NP-Za-km-z]{25,34}$/;
  let active = null;

  function currentSession() {
    try {
      if (root.__WS_READ_ONLY__) return null;
      if (typeof root._viewAsContext === 'function' && root._viewAsContext()) return null;
      const client = root.rosterClient;
      const who = client && client.current();
      const token = client && client.token();
      const base = root.ROSTER_SERVICE_URL;
      if (!who || who.role !== 'student' || !who.studentId || !token || typeof base !== 'string' || !base) return null;
      // The server verifies the signature. Locally, reject stale identity and
      // expiry while a fetched sheet waits for the browser's print dialog.
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[1]) return null;
      const encoded = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(root.atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)));
      if (claims.sid !== who.studentId || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) return null;
      return { studentId: who.studentId, token, base: base.replace(/\/+$/, '') };
    } catch (_) {
      return null;
    }
  }

  function sameSession(expected) {
    const current = currentSession();
    return Boolean(current && current.studentId === expected.studentId
      && current.token === expected.token && current.base === expected.base);
  }

  function element(tag, text) {
    const node = root.document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function clear() {
    if (active) active();
  }

  function unavailableMessage(status) {
    if (status === 401 || status === 403) return 'Sign in again to print your wallet.';
    if (status === 404) return 'No printable key is held for this wallet. Ask your teacher for your paper wallet.';
    if (status === 409) return 'Your wallet changed. Close this dialog, refresh your wallet, and try again.';
    if (status === 429) return 'Please wait one minute before printing your wallet again.';
    if (status === 503) return 'Wallet printing is not available yet. Ask your teacher for a paper copy.';
    return 'Could not prepare your wallet sheet. Try again or ask your teacher.';
  }

  function openDialog(trigger, address, owner) {
    clear();
    if (!trigger.isConnected || !sameSession(owner)) return;

    const overlay = element('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
    const dialog = element('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'student-wallet-print-title');
    dialog.style.cssText = 'background:#fff8e6;color:#332700;border:2px solid #5a4500;box-shadow:4px 4px #222;padding:20px;max-width:440px;width:100%;max-height:90vh;overflow:auto;font:14px Arial,sans-serif';
    const title = element('h2', 'Print my wallet');
    title.id = 'student-wallet-print-title';
    title.style.cssText = 'font-size:20px;margin:0 0 12px';
    const warning = element('p', 'This sheet includes your private key. Anyone with that key can spend your DOGE. Keep the sheet and any saved PDF private.');
    const backup = element('p', 'Your teacher also keeps a backup. Printing does not move any coins.');
    const publicAddress = element('p', 'Your address: ' + address);
    publicAddress.style.overflowWrap = 'anywhere';
    const label = element('label', 'Type PRINT to reveal your key and print your wallet');
    const confirmation = element('input');
    confirmation.type = 'text';
    confirmation.autocomplete = 'off';
    confirmation.spellcheck = false;
    confirmation.setAttribute('autocapitalize', 'characters');
    confirmation.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:8px 0 14px;padding:8px;font-size:16px';
    label.appendChild(confirmation);
    const actions = element('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const print = element('button', 'Print / Save PDF');
    const cancel = element('button', 'Cancel');
    for (const button of [print, cancel]) {
      button.type = 'button';
      button.className = 's7btn';
      button.style.cssText = 'padding:8px 12px;font-size:13px';
    }
    print.disabled = true;
    const status = element('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    actions.append(print, cancel);
    dialog.append(title, warning, backup, publicAddress, label, actions, status);
    overlay.appendChild(dialog);
    root.document.body.appendChild(overlay);

    let disposed = false;
    let busy = false;
    let sheetOpen = false;
    let session = null;
    let controller = null;
    let timeout = null;
    let identityTimer = null;

    function isCurrent() {
      return !disposed && trigger.isConnected && overlay.isConnected && sameSession(owner);
    }

    function cleanup() {
      if (disposed) return;
      disposed = true;
      if (controller) controller.abort();
      if (timeout !== null) root.clearTimeout(timeout);
      if (identityTimer !== null) root.clearInterval(identityTimer);
      if (session) session.close();
      session = null;
      controller = null;
      confirmation.value = '';
      root.removeEventListener('pagehide', cleanup);
      root.removeEventListener('storage', checkIdentity);
      overlay.remove();
      if (active === cleanup) active = null;
      if (trigger.isConnected) trigger.focus();
    }

    function checkIdentity() {
      if (!isCurrent() || (session && session.isClosed())) cleanup();
    }

    function updateButton() {
      print.disabled = busy || sheetOpen || confirmation.value !== 'PRINT';
    }

    async function printWallet() {
      if (busy || sheetOpen || confirmation.value !== 'PRINT' || !isCurrent()) return;
      busy = true;
      updateButton();
      status.textContent = 'Preparing your wallet sheet…';
      let data = null;
      let wallet = null;
      try {
        // Open during the click, before awaiting the authenticated request.
        try {
          session = root.WalletPrintSheets.open({ isCurrent });
        } catch (_) {
          status.textContent = 'Allow popups for this page and reload, then try printing again.';
          return;
        }
        controller = new root.AbortController();
        timeout = root.setTimeout(() => controller && controller.abort(), 15000);
        const response = await root.fetch(owner.base + '/wallet/custody/print', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          if (isCurrent()) status.textContent = unavailableMessage(response.status);
          if (session) session.close();
          return;
        }
        data = await response.json();
        wallet = data && data.wallet;
        if (!isCurrent() || !session || session.isClosed()) return;
        if (data.ok !== true || !wallet || wallet.studentId !== owner.studentId
          || wallet.address !== address || typeof wallet.wif !== 'string'
          || !wallet.wif || wallet.wif.length > 100) {
          throw new Error('Wallet response did not match this session');
        }
        root.clearTimeout(timeout);
        timeout = null;
        controller = null;
        cancel.textContent = 'Done';
        status.textContent = 'Print or save your sheet in the new window. Choose Done when finished to clear the private key.';
        const printed = await session.print([wallet], { cover: false, audience: 'student' });
        if (!printed || !isCurrent() || !session || session.isClosed()) {
          cleanup();
          return;
        }
        // Some browsers return before the print dialog finishes. Retain its
        // document until Done, window close, or the existing identity cleanup.
        sheetOpen = true;
      } catch (_) {
        if (session) session.close();
        if (isCurrent()) status.textContent = unavailableMessage(500);
      } finally {
        if (wallet && typeof wallet === 'object') wallet.wif = '';
        if (data && data.wallet && typeof data.wallet === 'object') data.wallet.wif = '';
        wallet = null;
        data = null;
        if (timeout !== null) root.clearTimeout(timeout);
        timeout = null;
        controller = null;
        if (!sheetOpen) {
          if (session) session.close();
          session = null;
        }
        busy = false;
        confirmation.value = '';
        if (!disposed) updateButton();
      }
    }

    active = cleanup;
    print.addEventListener('click', printWallet);
    cancel.addEventListener('click', cleanup);
    confirmation.addEventListener('input', updateButton);
    overlay.addEventListener('click', event => { if (event.target === overlay) cleanup(); });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); cleanup(); return; }
      if (event.key !== 'Tab') return;
      const controls = [confirmation, print, cancel].filter(control => !control.disabled);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && root.document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && root.document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    root.addEventListener('pagehide', cleanup);
    root.addEventListener('storage', checkIdentity);
    // Same-tab identity changes have no storage event. Also guard the tiny delay
    // between receiving the key and the renderer's scheduled browser print call.
    identityTimer = root.setInterval(checkIdentity, 250);
    confirmation.focus();
  }

  function attach(host, wallet) {
    const owner = currentSession();
    if (!host || !owner || !wallet || !ADDRESS.test(wallet.dogeAddress || '')) return;
    const address = wallet.dogeAddress;
    const print = element('button', 'Print my wallet');
    print.type = 'button';
    print.className = 's7btn';
    print.style.cssText = 'font-size:11px;min-width:0;padding:4px 8px';
    print.addEventListener('click', () => openDialog(print, address, owner));
    host.appendChild(print);
  }

  root.StudentWalletPrint = { attach, clear };
})(typeof window !== 'undefined' ? window : globalThis);

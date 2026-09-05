// Teacher-only paper-wallet import. Private material lives only in an open dialog.
(function (root) {
  'use strict';

  const ADDRESS = /^D[1-9A-HJ-NP-Za-km-z]{33}$/;

  function csvRows(text) {
    if (typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('Use a CSV smaller than 1 MB.');
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
        else if (ch === '"') { quoted = false; closed = true; }
        else field += ch;
        continue;
      }
      if (ch === '"') {
        if (field || closed) throw new Error('Invalid CSV quoting.');
        quoted = true;
      } else if (ch === ',' || ch === '\n' || ch === '\r') {
        row.push(field); field = ''; closed = false;
        if (ch !== ',') {
          if (row.some(value => value.trim())) rows.push(row);
          row = [];
          if (ch === '\r' && text[i + 1] === '\n') i += 1;
        }
      } else {
        if (closed) throw new Error('Invalid CSV quoting.');
        field += ch;
      }
    }
    if (quoted) throw new Error('Unclosed CSV quote.');
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
  }

  async function parseCsv(text, addressFromWIF) {
    const rows = csvRows(text);
    const header = rows.shift() || [];
    if (header.map(value => value.trim()).join(',') !== 'label,address,wif,privHex') {
      throw new Error('Expected the generator header: label,address,wif,privHex.');
    }
    if (!rows.length || rows.length > 500) throw new Error('Use a CSV with 1–500 wallets.');
    const wallets = [], addresses = new Set();
    for (let i = 0; i < rows.length; i += 1) {
      const values = rows[i].map(value => value.trim());
      const [label, address, wif] = values;
      if (values.length !== 4 || !label || label.length > 120 || /[\x00-\x1f]/.test(label) || !ADDRESS.test(address)) {
        throw new Error('Invalid label or mainnet address on CSV row ' + (i + 2) + '.');
      }
      let derived;
      try { derived = await addressFromWIF(wif); }
      catch (_) { throw new Error('Invalid mainnet WIF on CSV row ' + (i + 2) + '.'); }
      if (derived !== address) throw new Error('WIF does not match the address on CSV row ' + (i + 2) + '.');
      if (addresses.has(address)) throw new Error('Duplicate wallet address on CSV row ' + (i + 2) + '.');
      addresses.add(address);
      // privHex is redundant. Do not retain or transmit it.
      wallets.push({ label, address, wif });
    }
    return wallets;
  }

  function accountMap(accounts) {
    return new Map(accounts.map(account => [account.studentId, account.dogeAddress || '']));
  }

  function planAssignments(students, wallets, accounts) {
    const current = accountMap(accounts);
    const reserved = new Set(accounts.map(account => account.dogeAddress).filter(Boolean));
    const available = wallets.map((wallet, index) => reserved.has(wallet.address) ? -1 : index).filter(index => index >= 0);
    return students.filter(student => student.status !== 'archived' && student.role !== 'teacher' && !current.get(student.studentId))
      .slice().sort((a, b) => String(a.section || '').localeCompare(String(b.section || ''), undefined, { numeric: true })
        || String(a.realName || a.username || '').localeCompare(String(b.realName || b.username || ''), undefined, { sensitivity: 'base' }))
      .map((student, index) => ({ student, walletIndex: available[index] ?? -1, addressSaved: false, custodySaved: false, done: false, message: '' }));
  }

  async function submitAssignments({ rows, wallets, keepKeys, loadAccounts, saveAddress, saveCustody, onProgress = () => {}, isActive = () => true }) {
    const selected = rows.filter(row => !row.done && row.selected !== false && row.walletIndex >= 0);
    const indexes = selected.map(row => row.walletIndex);
    if (new Set(indexes).size !== indexes.length || selected.some(row => !wallets[row.walletIndex])) {
      throw new Error('Choose a different wallet for each student.');
    }
    // A failed refresh must not be interpreted as an empty account registry.
    const accounts = await loadAccounts();
    if (!isActive()) return rows;
    const current = accountMap(accounts);
    const owners = new Map();
    accounts.forEach(account => {
      if (!account.dogeAddress) return;
      const ids = owners.get(account.dogeAddress) || new Set();
      ids.add(account.studentId); owners.set(account.dogeAddress, ids);
    });
    for (const row of selected) {
      if (!isActive()) return rows;
      const wallet = wallets[row.walletIndex], id = row.student.studentId;
      const holdKey = keepKeys || wallet.generated === true;
      try {
        const address = current.get(id);
        if (address && address !== wallet.address) throw new Error('This student already has another address. Reload the assignment table.');
        if (Array.from(owners.get(wallet.address) || []).some(owner => owner !== id)) {
          throw new Error('This wallet is already assigned to another roster student.');
        }
        if (!address) await saveAddress(id, wallet.address);
        row.addressSaved = true;
        current.set(id, wallet.address); owners.set(wallet.address, new Set([id]));
        if (!isActive()) return rows;
        if (holdKey && !row.custodySaved) {
          await saveCustody(id, wallet.wif, wallet.label);
          row.custodySaved = true;
          if (wallet.generated) wallet.wif = '';
        }
        row.done = true;
        row.message = holdKey ? '✓ Address saved; key held.' : '✓ Address saved.';
      } catch (error) {
        row.message = wallet.generated
          ? (row.addressSaved ? '✗ Address saved; key not held — retry.' : '✗ Wallet was not saved. Refresh addresses and retry.')
          : (row.addressSaved ? '✗ Address saved; key not held. ' : '✗ ') + error.message;
      }
      if (isActive()) onProgress(row);
    }
    return rows;
  }

  function create(options) {
    const doc = options.document || root.document;
    let custody = {}, custodyLoadedAt = 0, custodyPending = false;

    function element(tag, text, className) {
      const node = doc.createElement(tag);
      if (text != null) node.textContent = text;
      if (className) node.className = className;
      return node;
    }
    function button(text, action) {
      const node = element('button', text, 's7btn');
      node.type = 'button'; node.addEventListener('click', action);
      return node;
    }
    function inputField(parent, label, type = 'text') {
      const wrap = element('label', label, 'wallet-field');
      const input = element(type === 'textarea' ? 'textarea' : 'input');
      if (type !== 'textarea') input.type = type;
      wrap.appendChild(input); parent.appendChild(wrap);
      return input;
    }
    function requireOk(result, fallback) {
      if (result && result.status === 200 && result.data && result.data.ok) return result.data;
      throw new Error(result?.data?.error || fallback);
    }
    async function loadAccounts() {
      const data = requireOk(await options.get('/class/wallets?includeArchived=1'), 'Could not refresh wallet addresses.');
      if (!Array.isArray(data.accounts)) throw new Error('Wallet address response is incomplete.');
      return data.accounts;
    }
    async function saveAddress(studentId, address) {
      requireOk(await options.post('/wallet/address', { studentId, address }), 'Address was not saved.');
    }
    async function saveCustody(studentId, wif, label) {
      requireOk(await options.post('/wallet/custody', { studentId, wif, label }), 'Key was not stored.');
    }
    function paintBadges() {
      doc.querySelectorAll('[data-wallet-held]').forEach(node => {
        const held = custody[node.dataset.walletHeld]?.held;
        node.textContent = held ? '🔑 held · reveal' : '🔑 reveal';
        node.title = held ? 'Reveal the stored key for reprinting' : 'Check for a stored key';
      });
      doc.querySelectorAll('[data-wallet-reprint]').forEach(node => {
        node.disabled = !custody[node.dataset.walletReprint]?.held;
      });
    }
    async function refreshBadges(force) {
      if (custodyPending || (!force && Date.now() - custodyLoadedAt < 30000)) return;
      custodyPending = true;
      try {
        const result = await options.get('/class/wallet-custody');
        custody = result.status === 200 && result.data?.ok ? result.data.wallets || {} : {};
        custodyLoadedAt = Date.now(); paintBadges();
      } finally { custodyPending = false; }
    }
    function changed() {
      refreshBadges(true).catch(() => {});
      options.changed();
    }
    function dialog(title) {
      const node = element('dialog', null, 'wallet-dialog');
      const heading = element('h3', title);
      const content = element('div');
      const status = element('p', '', 'wallet-status'); status.setAttribute('role', 'status');
      const closeButton = button('Close', close);
      let cleanup = () => {}, beforeClose = () => true, busy = false;
      function close() {
        if (busy || !beforeClose()) return;
        cleanup();
        if (typeof node.close === 'function') node.close();
        node.remove();
      }
      node.addEventListener('cancel', event => { event.preventDefault(); close(); });
      node.append(heading, content, status, closeButton); doc.body.appendChild(node);
      if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open', '');
      return { node, content, status, close, cleanup(fn) { cleanup = fn; }, beforeClose(fn) { beforeClose = fn; },
        busy(value) { busy = value; closeButton.disabled = value; } };
    }

    function generationUnavailableReason() {
      if (root.isSecureContext === false || typeof root.crypto?.getRandomValues !== 'function'
        || typeof root.crypto?.subtle?.digest !== 'function') {
        return 'Wallet generation requires secure browser randomness. Open this page with HTTPS or localhost.';
      }
      if (typeof root.DogeKeys?.generateWallet !== 'function') return 'Wallet generation did not load. Reload this page.';
      return '';
    }

    function openGenerate() {
      return openBulk({ generated: true });
    }

    async function openBulk({ generated = false } = {}) {
      const section = generated && typeof options.section === 'function' ? String(options.section() || '').trim() : '';
      const ui = dialog(generated ? '✨ Generate wallets' : '📥 Load paper wallets');
      const csv = inputField(ui.content, 'Paste the KEYS CSV', 'textarea'); csv.rows = 5; csv.spellcheck = false;
      const file = inputField(ui.content, 'Or choose the KEYS CSV', 'file'); file.accept = '.csv,text/csv';
      const keep = inputField(ui.content, 'Also keep the private keys (teacher custody)', 'checkbox'); keep.checked = true;
      if (generated) {
        csv.parentElement.hidden = true; file.parentElement.hidden = true; keep.disabled = true;
        ui.content.appendChild(element('p', 'Section: ' + (section || 'All sections') + '. Generated wallets always keep their keys in teacher custody.', 'hint'));
      }
      ui.content.appendChild(element('p', 'Keys are stored encrypted on the server, visible only to you, so a lost sheet can be reprinted.', 'hint'));
      const table = element('table', null, 'wallet-assignment-table');
      const tableWrap = element('div', null, 'wallet-table-wrap'); tableWrap.appendChild(table);
      let wallets = [], rows = [], snapshot = null, parsed = false, disposed = false, finished = false, saving = false;
      const controls = element('div', null, 'wallet-actions');
      const parse = button('Review assignments', review);
      const ordered = button('Assign in order', assignInOrder); ordered.disabled = true;
      const submit = element('button', 'Submit assignments', 's7btn'); submit.type = 'button'; submit.disabled = true;
      controls.append(parse, ordered, submit); ui.content.append(controls, tableWrap);
      if (generated) { parse.hidden = true; ordered.hidden = true; }
      function hasUnsavedKeys() {
        return generated && wallets.some(wallet => wallet.wif);
      }
      function wipeWallets() {
        wallets.forEach(wallet => { wallet.wif = ''; });
      }
      function cleanupBulk() {
        disposed = true; csv.value = ''; file.value = ''; wipeWallets(); wallets = []; rows = []; snapshot = null;
        table.replaceChildren();
        root.removeEventListener('beforeunload', warnBeforeUnload);
        root.removeEventListener('pagehide', leavePage);
      }
      function warnBeforeUnload(event) {
        if (!hasUnsavedKeys()) return;
        event.preventDefault(); event.returnValue = '';
      }
      function leavePage() {
        cleanupBulk(); ui.node.remove();
      }
      ui.cleanup(cleanupBulk);
      ui.beforeClose(() => !hasUnsavedKeys() || root.confirm('Some generated keys are not held by the server. Closing discards them. Any student with an address saved but no held key will need a new wallet. Close anyway?'));
      if (generated) {
        root.addEventListener('beforeunload', warnBeforeUnload);
        root.addEventListener('pagehide', leavePage);
      }
      file.addEventListener('change', async () => {
        const selected = file.files && file.files[0];
        if (!selected) return;
        if (selected.size > 1024 * 1024) { ui.status.textContent = 'Use a CSV smaller than 1 MB.'; return; }
        try { const text = await selected.text(); if (ui.node.isConnected) csv.value = text; }
        catch (_) { ui.status.textContent = 'Could not read this file.'; }
      });

      async function snapshotRoster() {
        const [rosterResult, classResult, accounts] = await Promise.all([
          options.get('/roster/list'), options.get('/class/grades'), loadAccounts(),
        ]);
        const roster = requireOk(rosterResult, 'Could not load the roster.').students;
        const active = requireOk(classResult, 'Could not load active students.').students;
        if (!Array.isArray(roster) || !Array.isArray(active)) throw new Error('Roster response is incomplete.');
        // /roster/list contains password-recovery fields. Retain only names/status.
        const people = roster.map(student => ({ studentId: student.studentId, realName: student.realName,
          username: student.username, section: student.section, status: student.status, role: student.role }));
        const activeIds = new Set(active.filter(student => student.role !== 'teacher').map(student => student.studentId));
        return { people, accounts, students: people.filter(student => student.status !== 'archived' && activeIds.has(student.studentId)
          && (!section || student.section === section)) };
      }
      async function generateBatch() {
        const unavailable = generationUnavailableReason();
        if (unavailable) { ui.status.textContent = unavailable; return; }
        ui.busy(true); ui.status.textContent = 'Loading the roster and generating wallets…';
        try {
          const [nextSnapshot, metadataResult] = await Promise.all([snapshotRoster(), options.get('/class/wallet-custody?includeArchived=1')]);
          if (disposed) return;
          const metadata = requireOk(metadataResult, 'Could not load wallet labels.').wallets;
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Wallet labels are unavailable.');
          snapshot = nextSnapshot;
          rows = planAssignments(snapshot.students, [], snapshot.accounts);
          let highest = 0;
          Object.values(metadata).forEach(held => {
            const match = held?.held && /^Wallet #(\d+)$/.exec(held.label || '');
            if (match) highest = Math.max(highest, Number(match[1]));
          });
          if (!Number.isSafeInteger(highest + rows.length)) throw new Error('Wallet labels are out of range.');
          const addresses = new Set(snapshot.accounts.map(account => account.dogeAddress).filter(Boolean));
          for (const row of rows) {
            const wallet = await root.DogeKeys.generateWallet();
            if (disposed) { if (wallet) wallet.wif = ''; return; }
            // Retain one key object only; the generator already wiped its byte buffers.
            wallets.push(wallet);
            if (!wallet || !ADDRESS.test(wallet.address) || typeof wallet.wif !== 'string' || !wallet.wif || addresses.has(wallet.address)) {
              throw new Error('Generated wallet validation failed.');
            }
            addresses.add(wallet.address);
            wallet.label = 'Wallet #' + (++highest); wallet.generated = true;
            row.walletIndex = wallets.length - 1; row.selected = true;
          }
          parsed = true; paint();
          if (rows.length) ui.status.textContent = wallets.length + ' wallets generated. Untick students to skip them; nothing is written until Submit.';
        } catch (_) {
          wallets.filter(Boolean).forEach(wallet => { wallet.wif = ''; }); wallets = []; rows = []; parsed = false;
          if (!disposed) ui.status.textContent = 'Could not generate the complete batch. Check the roster and custody configuration, then reopen Generate wallets.';
        } finally { if (!disposed) ui.busy(false); }
      }
      async function review() {
        parse.disabled = true; ui.busy(true); ui.status.textContent = 'Validating wallets and loading the active roster…';
        try {
          if (!root.DogeKeys) throw new Error('Wallet validation did not load. Reload this page.');
          const next = await parseCsv(csv.value, wif => root.DogeKeys.addressFromWIF(wif));
          try { snapshot = await snapshotRoster(); }
          catch (error) { next.forEach(wallet => { wallet.wif = ''; }); throw error; }
          wallets.forEach(wallet => { wallet.wif = ''; }); wallets = next;
          rows = planAssignments(snapshot.students, wallets, snapshot.accounts);
          parsed = true; csv.value = ''; file.value = ''; csv.disabled = true; file.disabled = true;
          parse.hidden = true; ordered.disabled = false; paint();
          ui.status.textContent = wallets.length + ' wallets validated. Review the choices; nothing is written until Submit.';
        } catch (error) { ui.status.textContent = error.message; }
        finally { parse.disabled = false; ui.busy(false); }
      }
      function assignInOrder() {
        if (!snapshot || rows.some(row => row.addressSaved)) return;
        rows = planAssignments(snapshot.students, wallets, snapshot.accounts); paint();
      }
      function paint() {
        if (disposed || !snapshot) return;
        table.replaceChildren();
        const header = element('tr');
        ['Student', 'Section', 'Paper wallet', 'Result'].forEach(title => header.appendChild(element('th', title)));
        table.appendChild(header);
        const owners = new Map(snapshot.accounts.filter(account => account.dogeAddress).map(account => [account.dogeAddress, account.studentId]));
        const names = new Map(snapshot.people.map(student => [student.studentId, student.realName || student.username]));
        rows.forEach(row => {
          const tr = element('tr');
          tr.append(element('td', row.student.realName || row.student.username), element('td', row.student.section));
          if (generated) {
            const wallet = wallets[row.walletIndex];
            const choice = element('input'); choice.type = 'checkbox'; choice.checked = row.selected !== false;
            choice.setAttribute('aria-label', 'Assign wallet to ' + (row.student.realName || row.student.username));
            choice.disabled = saving || finished || row.addressSaved || row.done;
            choice.addEventListener('change', () => { row.selected = choice.checked; row.message = ''; paint(); });
            const label = element('label', wallet.label + ' · …' + wallet.address.slice(-4) + ' '); label.prepend(choice);
            const cell = element('td'); cell.appendChild(label); tr.append(cell, element('td', row.message)); table.appendChild(tr);
            return;
          }
          const choice = element('select'); choice.setAttribute('aria-label', 'Wallet for ' + (row.student.realName || row.student.username));
          const blank = element('option', 'Skip this student'); blank.value = '-1'; choice.appendChild(blank);
          wallets.forEach((wallet, index) => {
            const owner = owners.get(wallet.address);
            const option = element('option', wallet.label + ' · …' + wallet.address.slice(-4) + (owner ? ' — assigned to ' + (names.get(owner) || 'a roster student') : ''));
            option.value = String(index);
            option.disabled = !!owner || rows.some(other => other !== row && other.walletIndex === index);
            choice.appendChild(option);
          });
          choice.value = String(row.walletIndex); choice.disabled = row.addressSaved || row.done;
          choice.addEventListener('change', () => { row.walletIndex = Number(choice.value); row.message = ''; paint(); });
          const cell = element('td'); cell.appendChild(choice); tr.append(cell, element('td', row.message)); table.appendChild(tr);
        });
        submit.disabled = saving || finished || !rows.some(row => !row.done && row.selected !== false && row.walletIndex >= 0);
        ordered.disabled = rows.some(row => row.addressSaved);
        if (!rows.length) ui.status.textContent = 'Every active student already has an address. Nothing to assign.';
      }
      submit.addEventListener('click', async function () {
        if (!parsed || disposed || saving || finished || !rows.some(row => !row.done && row.selected !== false && row.walletIndex >= 0)) return;
        saving = true;
        ui.busy(true); submit.disabled = true; ordered.disabled = true; keep.disabled = true;
        table.querySelectorAll('select, input').forEach(choice => { choice.disabled = true; });
        ui.status.textContent = 'Saving assignments…';
        try {
          await submitAssignments({ rows, wallets, keepKeys: generated || keep.checked, loadAccounts, saveAddress, saveCustody,
            isActive: () => !disposed,
            onProgress() { paint(); table.querySelectorAll('select, input').forEach(choice => { choice.disabled = true; }); submit.disabled = true; ordered.disabled = true; } });
          if (disposed) return;
          if (generated && rows.filter(row => row.selected !== false).every(row => row.done)) {
            wipeWallets(); finished = true;
          }
          changed();
          ui.status.textContent = rows.filter(row => row.done).length + (finished
            ? ' saved with keys held. Generated keys have been cleared from this dialog.'
            : ' saved. Any failed rows remain available for retry.');
        } catch (error) {
          if (!disposed) ui.status.textContent = generated ? 'Could not save this batch. Refresh addresses and retry.' : error.message;
        } finally {
          saving = false;
          if (!disposed) { ui.busy(false); keep.disabled = generated; keep.checked = generated || keep.checked; paint(); }
        }
      });
      if (generated) await generateBatch();
    }

    async function openPrint(student) {
      const section = student ? String(student.section || '')
        : typeof options.section === 'function' ? String(options.section() || '').trim() : '';
      const ui = dialog(student ? 'Reprint wallet for ' + (student.realName || student.username) : '🖨 Print wallet sheets');
      const scope = element('p', 'Loading held wallet count…');
      ui.content.appendChild(scope);
      const confirmation = inputField(ui.content, 'Type PRINT to reveal and print these private keys');
      confirmation.autocomplete = 'off';
      const print = button('Print wallet sheets', printKeys); print.disabled = true;
      ui.content.append(print, element('p', 'Keep the printed sheets sealed. Anyone with a private key owns its coins.', 'hint'));
      let count = 0, saving = false, disposed = false, activeSession = null;
      function updatePrint() { print.disabled = saving || count === 0 || confirmation.value !== 'PRINT'; }
      confirmation.addEventListener('input', updatePrint);
      function cleanupPrint() {
        disposed = true; confirmation.value = '';
        if (activeSession) activeSession.close();
        activeSession = null;
        root.removeEventListener('pagehide', leavePrint);
      }
      function leavePrint() { cleanupPrint(); ui.node.remove(); }
      ui.cleanup(cleanupPrint);
      root.addEventListener('pagehide', leavePrint);

      async function printKeys() {
        if (saving || disposed || !count || confirmation.value !== 'PRINT') return;
        saving = true; ui.busy(true); updatePrint();
        let data = null, wallets = [], session = null;
        try {
          // Opening during this click avoids losing user activation while fetching.
          try {
            session = root.WalletPrintSheets.open();
            activeSession = session;
          } catch (_) {
            ui.status.textContent = 'The print window could not open. Allow popups and reload the print tools, then try again.';
            return;
          }
          const path = student ? '/wallet/custody/' + encodeURIComponent(student.studentId) + '?confirm=1'
            : '/class/wallet-custody/export?confirm=1' + (section ? '&section=' + encodeURIComponent(section) : '');
          const result = await options.get(path);
          data = result?.data;
          if (disposed || session.isClosed()) { session.close(); return; }
          if (result?.status !== 200 || data?.ok !== true) throw new Error('print unavailable');
          if (student) {
            wallets = [{ studentId: student.studentId, realName: student.realName, username: student.username,
              section, address: data.address, wif: data.wif, label: data.label }];
            data.wif = '';
          } else {
            if (!Array.isArray(data.wallets)) throw new Error('invalid wallet response');
            wallets = data.wallets;
          }
          if (wallets.some(wallet => !wallet || !ADDRESS.test(wallet.address) || typeof wallet.wif !== 'string' || !wallet.wif)) {
            throw new Error('invalid wallet response');
          }
          const printed = wallets.length;
          const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
          if (printed) await session.print(wallets, { section, cover: !student });
          else session.close();
          if (disposed || (printed && session.isClosed())) return;
          confirmation.value = '';
          ui.status.textContent = printed + ' wallet sheets opened for printing.'
            + (skipped ? ' ' + skipped + ' wallet' + (skipped === 1 ? '' : 's') + ' skipped because held keys could not be verified or revealed.' : '')
            + ' Close the print window when finished.';
        } catch (_) {
          if (session) session.close();
          if (!disposed) ui.status.textContent = 'Could not print wallet sheets. Check custody access and try again.';
        } finally {
          // The renderer also clears its input, including failures; keep this boundary independent.
          wallets.forEach(wallet => { if (wallet && typeof wallet === 'object') wallet.wif = ''; });
          if (data && typeof data === 'object') {
            data.wif = '';
            if (Array.isArray(data.wallets)) data.wallets.forEach(wallet => { if (wallet && typeof wallet === 'object') wallet.wif = ''; });
          }
          wallets = []; data = null; activeSession = null; session = null;
          saving = false;
          if (!disposed) { ui.busy(false); updatePrint(); }
        }
      }

      try {
        if (student) count = 1;
        else {
          const result = await options.get('/class/wallet-custody?includeArchived=1' + (section ? '&section=' + encodeURIComponent(section) : ''));
          if (disposed) return;
          const metadata = requireOk(result, 'Could not count held wallets.').wallets;
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('missing metadata');
          count = Object.values(metadata).filter(wallet => wallet?.held).length;
        }
        scope.textContent = count + ' held wallet' + (count === 1 ? '' : 's') + ' · Section: ' + (section || 'All sections');
        if (!count) ui.status.textContent = 'There are no held wallet keys in this section.';
        updatePrint();
      } catch (_) {
        if (!disposed) { scope.textContent = 'Held wallet count unavailable.'; ui.status.textContent = 'Could not load held wallets. Check custody access and reopen Print.'; }
      }
    }

    function openReveal(student) {
      const ui = dialog('Reveal key for ' + (student.realName || student.username));
      const confirmation = inputField(ui.content, 'Type REVEAL to show this private key'); confirmation.autocomplete = 'off';
      const reveal = button('Reveal key', load); reveal.disabled = true;
      const output = element('div'); ui.content.append(reveal, output);
      confirmation.addEventListener('input', () => { reveal.disabled = confirmation.value !== 'REVEAL'; });
      ui.cleanup(() => { confirmation.value = ''; output.querySelectorAll('input').forEach(input => { input.value = ''; }); output.replaceChildren(); });
      async function load() {
        if (confirmation.value !== 'REVEAL') return;
        ui.busy(true); reveal.disabled = true; output.replaceChildren();
        try {
          const data = requireOk(await options.get('/wallet/custody/' + encodeURIComponent(student.studentId) + '?confirm=1'), 'Could not reveal this key.');
          if (typeof data.wif !== 'string' || !ADDRESS.test(data.address)) throw new Error('Key response is incomplete.');
          output.append(element('p', data.label || 'Paper wallet'), element('p', data.address));
          const wif = inputField(output, 'Private key (WIF)'); wif.readOnly = true; wif.value = data.wif; wif.autocomplete = 'off';
          data.wif = null;
          output.appendChild(button('Reprint sheet', async () => {
            let session;
            const wallet = { studentId: student.studentId, realName: student.realName, username: student.username,
              section: student.section, address: data.address, label: data.label, wif: wif.value };
            ui.busy(true);
            try {
              session = root.WalletPrintSheets.open();
              await session.print([wallet], { section: student.section || '', cover: false });
            } catch (_) {
              if (session) session.close();
              ui.status.textContent = 'Could not print this sheet. Allow popups and reload the print tools, then try again.';
            } finally { wallet.wif = ''; ui.busy(false); }
          }));
          ui.status.textContent = 'This reveal was recorded in the wallet ledger. Close this dialog when finished.';
        } catch (error) { ui.status.textContent = error.message; }
        finally { ui.busy(false); reveal.disabled = confirmation.value !== 'REVEAL'; }
      }
    }

    function openScan(student) {
      const ui = dialog('📷 Scan wallet for ' + (student.realName || student.username));
      const video = element('video'); video.muted = true; video.playsInline = true; video.className = 'wallet-camera';
      ui.content.appendChild(video);
      const address = inputField(ui.content, 'Address'); address.readOnly = true;
      const label = inputField(ui.content, 'Paper-wallet label'); label.maxLength = 120;
      label.value = 'Wallet for ' + (student.realName || student.username);
      const keep = inputField(ui.content, 'Also scan and keep the WIF QR', 'checkbox'); keep.checked = true;
      const save = button('Save scanned wallet', saveScan); save.disabled = true; ui.content.appendChild(save);
      let wif = '', decoding = false, scanner = null, addressSaved = false, saving = false, scanEpoch = 0, scanPaused = false;
      function stop() { if (scanner) scanner.stop(); }
      function pause() { scanPaused = true; scanEpoch += 1; stop(); }
      function visibility() { if (doc.hidden) { pause(); ui.status.textContent = 'Camera stopped. Close and reopen Scan to continue.'; } }
      root.addEventListener('pagehide', pause); doc.addEventListener('visibilitychange', visibility);
      ui.cleanup(() => { scanEpoch += 1; stop(); wif = ''; address.value = ''; label.value = ''; root.removeEventListener('pagehide', pause); doc.removeEventListener('visibilitychange', visibility); });
      keep.addEventListener('change', () => { scanEpoch += 1; update(); restartForCustody(); });
      function restartForCustody() {
        if (!scanner || !keep.checked || wif || decoding || saving || scanPaused || !ui.node.isConnected) return;
        // Reset the scanner's duplicate suppression so the same sheet can be
        // read again after a checkbox change invalidated its pending decode.
        scanner.start().catch(() => {});
      }
      function update() {
        save.disabled = saving || !address.value || (keep.checked && !wif);
        if (saving) return;
        ui.status.textContent = !address.value ? 'Scan the public address QR.' : keep.checked && !wif
          ? 'Address read. Scan the WIF QR from the same sheet, or uncheck custody to save only the address.' : 'Ready. Review the student and address, then save.';
      }
      async function decoded(value) {
        if (decoding || saving || !ui.node.isConnected) return;
        const text = String(value || '').trim();
        if (!address.value) {
          const candidate = text.replace(/^dogecoin:/i, '').split('?')[0];
          if (ADDRESS.test(candidate)) { address.value = candidate; update(); }
          return;
        }
        if (!keep.checked || wif || ADDRESS.test(text)) return;
        decoding = true;
        const epoch = scanEpoch;
        try {
          if (await root.DogeKeys.addressFromWIF(text) !== address.value) throw new Error('mismatch');
          if (!ui.node.isConnected || epoch !== scanEpoch || saving) return;
          wif = text; update(); stop();
        } catch (_) { if (ui.node.isConnected && epoch === scanEpoch && !saving) ui.status.textContent = 'That QR is not a matching mainnet WIF. Scan the private-key QR from the same sheet.'; }
        finally {
          decoding = false;
          // Wait until the old decode finishes before restarting. Otherwise a
          // repeat QR frame could be cached while decoding still blocks it.
          if (epoch !== scanEpoch) restartForCustody();
        }
      }
      async function saveScan() {
        if (saving || !address.value || (keep.checked && !wif)) return;
        saving = true; scanEpoch += 1;
        ui.busy(true); save.disabled = true; keep.disabled = true; stop();
        try {
          if (!label.value.trim()) throw new Error('Enter the paper-wallet label.');
          if (keep.checked && await root.DogeKeys.addressFromWIF(wif) !== address.value) throw new Error('The WIF does not match this address.');
          const accounts = await loadAccounts();
          if (accounts.some(account => account.studentId !== student.studentId && account.dogeAddress === address.value)) {
            throw new Error('This wallet is already assigned to another roster student.');
          }
          if (!addressSaved) { await saveAddress(student.studentId, address.value); addressSaved = true; }
          if (keep.checked) await saveCustody(student.studentId, wif, label.value.trim());
          wif = ''; changed(); ui.busy(false); ui.close();
        } catch (error) {
          ui.status.textContent = (addressSaved ? 'Address saved; key not held. ' : '') + error.message;
          save.disabled = false;
        } finally { saving = false; ui.busy(false); keep.disabled = false; }
      }
      update();
      if (!root.WalletQrScanner || !root.DogeKeys) { ui.status.textContent = 'Camera tools did not load. Reload the page or use CSV import.'; return; }
      scanner = root.WalletQrScanner.create({ video, onCode: decoded, onError() { if (ui.node.isConnected) ui.status.textContent = 'Camera unavailable. Allow camera access on HTTPS, or use CSV import.'; } });
      scanner.start().catch(() => {});
    }

    function decorateAddressCell(cell, student) {
      cell.appendChild(button('📷 Scan', () => openScan(student)));
      const reveal = button('🔑 reveal', () => openReveal(student));
      reveal.dataset.walletHeld = student.studentId; cell.appendChild(reveal);
      const reprint = button('Reprint', () => openPrint(student));
      reprint.dataset.walletReprint = student.studentId; reprint.disabled = true; cell.appendChild(reprint);
      paintBadges(); refreshBadges(false).catch(() => {});
    }
    return { openBulk, openGenerate, generationUnavailableReason, openPrint, openScan, openReveal, decorateAddressCell, refreshBadges };
  }

  root.TeacherWalletLoading = { parseCsv, planAssignments, submitAssignments, create };
})(typeof window !== 'undefined' ? window : globalThis);

// Teacher custody is separate from student wallets and from password recovery.
// Never log a request, crypto exception, or database error on this path.
import { requirePayoutTeacher } from './teacher-auth.js';
import { walletCryptoEnabled, encryptWalletWif, decryptWalletWif } from './crypto.js';
import { decodeWIF } from './lib/doge-keys.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function custodyNotProvisioned(error) {
  const code = String(error && error.code || '');
  const message = String(error && error.message || '').toLowerCase();
  if (['42P01', 'PGRST205'].includes(code)) return true;
  return ['42703', '42883', 'PGRST202', 'PGRST204'].includes(code)
    && ['doge_wif_enc', 'doge_wallet_label', 'doge_key_held_at',
      'doge_store_wallet_custody', 'doge_audit_key_reveal'].some((name) => message.includes(name));
}

function custodyError(res, error) {
  if (custodyNotProvisioned(error)) {
    return res.status(503).json({ ok: false, error: 'wallet custody not provisioned (run migration 0035)' });
  }
  return res.status(500).json({ ok: false, error: 'wallet custody request failed' });
}

function needWalletKey(res) {
  if (walletCryptoEnabled()) return false;
  res.status(503).json({ ok: false, error: 'wallet custody key not configured' });
  return true;
}

export function mountWalletCustody(app, { db }) {
  // The app's JSON parser runs before routes. Its default error can include the
  // rejected body in both HTML and logs, so consume custody parsing errors here.
  app.use('/wallet/custody', (error, _req, res, _next) => {
    res.set('Cache-Control', 'no-store');
    const status = error && error.type === 'entity.too.large' ? 413 : 400;
    return res.status(status).json({ ok: false, error: 'invalid wallet custody request' });
  });
  // Use the existing hardened teacher gate: published fallback credentials and
  // student tokens cannot reveal keys. TEACHER_KEY must be privately configured.
  const teacherRoute = (handler) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    try {
      if (!await requirePayoutTeacher(req, db)) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
      return await handler(req, res);
    } catch (error) {
      return custodyError(res, error);
    }
  };

  app.post('/wallet/custody', teacherRoute(async (req, res) => {
    if (needWalletKey(res)) return;
    const { studentId, wif, label = '' } = req.body || {};
    if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
      return res.status(400).json({ ok: false, error: 'valid studentId required' });
    }
    if (typeof label !== 'string' || label.length > 120 || /[\r\n\0]/.test(label)) {
      return res.status(400).json({ ok: false, error: 'label must be a single line of at most 120 characters' });
    }
    let address;
    try {
      if (typeof wif !== 'string' || wif.length > 100) throw new Error();
      address = decodeWIF(wif).address;
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid Dogecoin mainnet WIF' });
    }
    const encrypted = encryptWalletWif(wif.trim());
    if (!encrypted) return custodyError(res);
    const result = await db.storeWalletCustody(studentId, address, encrypted, label.trim() || null);
    if (result.error) return custodyError(res, result.error);
    if (!result.data) {
      return res.status(409).json({ ok: false, error: 'private key does not match the current wallet address' });
    }
    return res.json({ ok: true, held: true, label: label.trim() || null, addressLast4: address.slice(-4) });
  }));

  app.get('/wallet/custody/:studentId', teacherRoute(async (req, res) => {
    if (needWalletKey(res)) return;
    if (req.query.confirm !== '1') {
      return res.status(400).json({ ok: false, error: 'confirm=1 required to reveal a private key' });
    }
    const studentId = req.params.studentId;
    if (!UUID_RE.test(studentId)) return res.status(404).json({ ok: false, error: 'no held wallet key' });
    const result = await db.getWalletCustody(studentId);
    if (result.error) return custodyError(res, result.error);
    const account = result.data;
    if (!account || !account.doge_wif_enc) {
      return res.status(404).json({ ok: false, error: 'no held wallet key' });
    }
    const wif = decryptWalletWif(account.doge_wif_enc);
    if (!wif) return custodyError(res);
    let address;
    try {
      address = decodeWIF(wif).address;
    } catch {
      return custodyError(res);
    }
    if (address !== account.doge_address) {
      return res.status(409).json({ ok: false, error: 'held key no longer matches the wallet address' });
    }
    // Audit is mandatory and checks the live address AND exact ciphertext under
    // a row lock. A concurrent replacement/delete/address edit aborts this reveal.
    const audit = await db.auditWalletKeyReveal(studentId, address, account.doge_wif_enc);
    if (audit.error) return custodyError(res, audit.error);
    if (audit.data !== true) {
      return res.status(409).json({ ok: false, error: 'held wallet changed; refresh before revealing' });
    }
    return res.json({ ok: true, wif, address, label: account.doge_wallet_label || null });
  }));

  app.delete('/wallet/custody/:studentId', teacherRoute(async (req, res) => {
    const studentId = req.params.studentId;
    if (!UUID_RE.test(studentId)) return res.status(404).json({ ok: false, error: 'unknown student' });
    const result = await db.deleteWalletCustody(studentId);
    if (result.error) return custodyError(res, result.error);
    return res.json({ ok: true, held: false });
  }));

  app.get('/class/wallet-custody/export', teacherRoute(async (req, res) => {
    if (needWalletKey(res)) return;
    if (req.query.confirm !== '1') {
      return res.status(400).json({ ok: false, error: 'confirm=1 required to print private keys' });
    }
    const section = typeof req.query.section === 'string' ? req.query.section.trim() || null : null;
    const roster = await db.listRoster(section, { includeArchived: true });
    if (roster.error) return custodyError(res, roster.error);
    // Roster rows also contain password-recovery fields. Copy only print metadata.
    const students = new Map((roster.data || []).map(student => [student.student_id, {
      studentId: student.student_id,
      realName: student.real_name || '',
      username: student.login_username || '',
      section: student.section || '',
    }]));
    // Probe the explicit custody columns even when the requested class is empty.
    const metadata = await db.listWalletCustody([...students.keys()]);
    if (metadata.error) return custodyError(res, metadata.error);
    const heldIds = new Set((metadata.data || [])
      .filter(row => row.doge_key_held_at && students.has(row.student_id))
      .map(row => row.student_id));
    const wallets = [], skipped = [];
    for (const [studentId, student] of students) {
      if (!heldIds.has(studentId)) continue;
      try {
        const result = await db.getWalletCustody(studentId);
        if (result.error) throw result.error;
        const account = result.data;
        if (!account || !account.doge_wif_enc) {
          skipped.push({ studentId, reason: 'no held wallet key' });
          continue;
        }
        const wif = decryptWalletWif(account.doge_wif_enc);
        let address;
        try {
          if (!wif) throw new Error();
          address = decodeWIF(wif).address;
        } catch {
          skipped.push({ studentId, reason: 'held key could not be read' });
          continue;
        }
        if (address !== account.doge_address) {
          skipped.push({ studentId, reason: 'held key no longer matches the wallet address' });
          continue;
        }
        // Every exported key is a reveal. The existing RPC locks the live row
        // and checks this exact address/ciphertext before writing its audit row.
        const audit = await db.auditWalletKeyReveal(studentId, address, account.doge_wif_enc);
        if (audit.error) throw audit.error;
        if (audit.data !== true) {
          skipped.push({ studentId, reason: 'held wallet changed; refresh before printing' });
          continue;
        }
        wallets.push({ ...student, address, wif, label: account.doge_wallet_label || null });
      } catch (error) {
        if (custodyNotProvisioned(error)) return custodyError(res, error);
        skipped.push({ studentId, reason: 'held key could not be exported' });
      }
    }
    return res.json({ ok: true, wallets, skipped });
  }));

  app.get('/class/wallet-custody', teacherRoute(async (req, res) => {
    const section = typeof req.query.section === 'string' ? req.query.section.trim() || null : null;
    const roster = req.query.includeArchived === '1'
      ? await db.listRoster(section, { includeArchived: true })
      : await db.listRoster(section);
    if (roster.error) return custodyError(res, roster.error);
    const ids = (roster.data || []).map((student) => student.student_id);
    // Even an empty class probes explicit custody columns, so missing migration
    // cannot masquerade as an enabled-but-empty custody feature.
    const result = await db.listWalletCustody(ids);
    if (result.error) return custodyError(res, result.error);
    const wallets = {};
    for (const studentId of ids) wallets[studentId] = { held: false, label: null, heldAt: null };
    for (const row of result.data || []) {
      if (!ids.includes(row.student_id)) continue;
      wallets[row.student_id] = {
        held: Boolean(row.doge_key_held_at),
        label: row.doge_wallet_label || null,
        heldAt: row.doge_key_held_at || null,
      };
    }
    return res.json({ ok: true, wallets });
  }));
}

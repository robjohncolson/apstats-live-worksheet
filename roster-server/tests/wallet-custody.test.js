import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { mountDogeWallet } from '../doge-wallet.js';
import { createDb } from '../db.js';
import { signToken, verifyToken } from '../token.js';
import { decryptPassword, decryptWalletWif, encryptPassword, encryptWalletWif, walletCryptoEnabled } from '../crypto.js';
import { deriveWIF, decodeWIF, NETWORKS } from '../lib/doge-keys.mjs';
import { createWalletDb } from './fixtures/pg-wallet.js';

const SID = '00000000-0000-4000-8000-000000000001';
const ARCHIVED = '00000000-0000-4000-8000-000000000002';
const TEACHER = '00000000-0000-4000-8000-000000000003';
const WIF = deriveWIF(Buffer.alloc(32, 7), NETWORKS.mainnet.wif);
const OTHER_WIF = deriveWIF(Buffer.alloc(32, 8), NETWORKS.mainnet.wif);
const ADDRESS = decodeWIF(WIF).address;
const OTHER_ADDRESS = decodeWIF(OTHER_WIF).address;
const SECRET = 'custody-test-only-secret-32-bytes-minimum';
const ENV_NAMES = ['WALLET_KEY_SECRET', 'ROSTER_PW_ENC_KEY', 'TEACHER_KEY', 'ROSTER_TEACHER_SECRET', 'ROSTER_TOKEN_SECRET'];
let savedEnv;
const servers = [];

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  process.env.WALLET_KEY_SECRET = SECRET;
  process.env.TEACHER_KEY = 'private-custody-test-teacher';
  process.env.ROSTER_TOKEN_SECRET = 'custody-test-token-secret';
  delete process.env.ROSTER_TEACHER_SECRET;
});
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  vi.restoreAllMocks();
});

async function world() {
  const accounts = new Map([
    [SID, { student_id: SID, doge_address: ADDRESS, doge_balance: 0, candy_given: 0 }],
    [ARCHIVED, { student_id: ARCHIVED, doge_address: OTHER_ADDRESS, doge_balance: 0 }],
  ]);
  const roster = [
    { student_id: SID, status: 'active', role: 'student' },
    { student_id: ARCHIVED, status: 'archived', role: 'student' },
    { student_id: TEACHER, status: 'active', role: 'teacher' },
  ];
  const audit = [];
  const copy = (value) => ({ data: structuredClone(value), error: null });
  const db = {
    findByStudentId: vi.fn(async (id) => copy(roster.find((row) => row.student_id === id))),
    getRoleByStudentId: vi.fn(async (id) => roster.find((row) => row.student_id === id)?.role || 'student'),
    listRoster: vi.fn(async (_section, options = {}) => copy(roster.filter((row) => options.includeArchived || row.status !== 'archived'))),
    getDogeAccount: vi.fn(async (id) => copy(accounts.get(id))),
    listDogeAccounts: vi.fn(async (ids) => copy([...accounts.values()].filter((row) => ids.includes(row.student_id)))),
    listDogeLedger: vi.fn(async () => copy(audit)),
    updateDogeChain: vi.fn(async () => copy(null)),
    storeWalletCustody: vi.fn(async (id, address, encrypted, label) => {
      const account = accounts.get(id);
      if (!account || account.doge_address !== address) return copy(false);
      Object.assign(account, { doge_wif_enc: encrypted, doge_wallet_label: label, doge_key_held_at: new Date().toISOString() });
      return copy(true);
    }),
    getWalletCustody: vi.fn(async (id) => copy(accounts.get(id))),
    auditWalletKeyReveal: vi.fn(async (id, address, encrypted) => {
      const account = accounts.get(id);
      if (account?.doge_address !== address || account?.doge_wif_enc !== encrypted) return copy(false);
      audit.push({ kind: 'key_reveal', student_id: id, candy_delta: 0, doge_delta: 0 });
      return copy(true);
    }),
    deleteWalletCustody: vi.fn(async (id) => {
      if (accounts.has(id)) Object.assign(accounts.get(id), { doge_wif_enc: null, doge_wallet_label: null, doge_key_held_at: null });
      return copy({ student_id: id });
    }),
    listWalletCustody: vi.fn(async () => copy([...accounts.values()])),
    dogeSpend: vi.fn(async () => copy(accounts.get(SID))),
  };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, {
    db, ledgerDb: { getLedgerByStudent: async () => copy([]) }, verifyToken,
    getPrice: async () => 0.1,
    fetchChainBalance: async (address) => ({ address, confirmedDoge: 0 }),
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const request = async (path, { method = 'GET', body, rawBody, auth = 'teacher', headers = {} } = {}) => {
    const authHeaders = auth === 'teacher' ? { 'x-teacher-secret': process.env.TEACHER_KEY }
      : auth === 'student' ? { authorization: `Bearer ${signToken(SID)}` }
        : auth === 'bearerTeacher' ? { authorization: `Bearer ${signToken(TEACHER)}` } : {};
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'content-type': 'application/json', ...authHeaders, ...headers },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const store = (body = {}) => request('/wallet/custody', { method: 'POST', body: { studentId: SID, wif: WIF, label: 'Wallet #7', ...body } });
  return { accounts, audit, db, request, store };
}

describe('teacher-only wallet custody', () => {
  it('stores an encrypted matching mainnet key and reveals only after an audit', async () => {
    const w = await world();
    const stored = await w.store();
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual({ ok: true, held: true, label: 'Wallet #7', addressLast4: ADDRESS.slice(-4) });
    const encrypted = w.accounts.get(SID).doge_wif_enc;
    expect(encrypted).not.toContain(WIF);
    expect(decryptWalletWif(encrypted)).toBe(WIF);
    const revealed = await w.request(`/wallet/custody/${SID}?confirm=1`);
    expect(revealed.body).toEqual({ ok: true, wif: WIF, address: ADDRESS, label: 'Wallet #7' });
    expect(revealed.headers.get('cache-control')).toBe('no-store');
    expect(w.audit).toEqual([{ kind: 'key_reveal', student_id: SID, candy_delta: 0, doge_delta: 0 }]);
    expect(JSON.stringify(w.audit)).not.toContain(WIF);
  });

  it.each(['', 'short', 'a'.repeat(31)])('fails closed for missing/short key on store and reveal', async (secret) => {
    const w = await world();
    await w.store();
    process.env.WALLET_KEY_SECRET = secret;
    for (const response of [await w.store(), await w.request(`/wallet/custody/${SID}?confirm=1`)]) {
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('wallet custody key not configured');
      expect(JSON.stringify(response.body)).not.toContain(WIF);
    }
    expect(w.audit).toHaveLength(0);
  });

  it('requires explicit confirm and never reads the key without it', async () => {
    const w = await world();
    expect((await w.request(`/wallet/custody/${SID}`)).status).toBe(400);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it('rejects student and unauthenticated callers on every custody route', async () => {
    const w = await world();
    for (const auth of ['student', 'none']) {
      for (const [method, path] of [['POST', '/wallet/custody'], ['GET', `/wallet/custody/${SID}?confirm=1`], ['DELETE', `/wallet/custody/${SID}`], ['GET', '/class/wallet-custody']]) {
        const response = await w.request(path, { method, auth, body: method === 'POST' ? { studentId: SID, wif: WIF } : undefined });
        expect(response.status).toBe(401);
        expect(JSON.stringify(response.body)).not.toContain(WIF);
      }
    }
    expect(w.db.storeWalletCustody).not.toHaveBeenCalled();
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it('rejects the repository fallback and accepts a genuine teacher bearer with configured teacher key', async () => {
    const w = await world();
    delete process.env.TEACHER_KEY;
    expect((await w.request('/class/wallet-custody', { auth: 'none', headers: { 'x-teacher-secret': 'apteacher2627' } })).status).toBe(401);
    process.env.TEACHER_KEY = 'apteacher2627';
    expect((await w.request('/class/wallet-custody')).status).toBe(401);
    process.env.TEACHER_KEY = 'private-custody-test-teacher';
    expect((await w.request('/class/wallet-custody', { auth: 'bearerTeacher' })).status).toBe(200);
  });

  it('refuses a mismatched key, including an address change at the atomic write', async () => {
    const w = await world();
    expect((await w.store({ wif: OTHER_WIF })).status).toBe(409);
    w.db.storeWalletCustody.mockImplementationOnce(async () => ({ data: false, error: null }));
    expect((await w.store()).status).toBe(409);
    expect(w.accounts.get(SID).doge_wif_enc).toBeUndefined();
  });

  it.each([null, 'invalid key', WIF.slice(0, -1) + (WIF.endsWith('1') ? '2' : '1'), deriveWIF(Buffer.alloc(32, 7), NETWORKS.testnet.wif)])('rejects invalid/testnet WIF without echoing or logging it', async (wif) => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    const response = await w.store({ wif });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid Dogecoin mainnet WIF');
    expect(w.db.storeWalletCustody).not.toHaveBeenCalled();
    expect(logs).not.toHaveBeenCalled();
  });

  it('returns sanitized errors and no plaintext when storage/audit throws', async () => {
    const w = await world();
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    w.db.storeWalletCustody.mockRejectedValueOnce(new Error(WIF));
    expect((await w.store()).body).toEqual({ ok: false, error: 'wallet custody request failed' });
    await w.store();
    w.db.auditWalletKeyReveal.mockRejectedValueOnce(new Error(WIF));
    const reveal = await w.request(`/wallet/custody/${SID}?confirm=1`);
    expect(reveal.status).toBe(500);
    expect(JSON.stringify(reveal.body)).not.toContain(WIF);
    expect(w.audit).toHaveLength(0);
    expect(logs).not.toHaveBeenCalled();
  });

  it('sanitizes malformed JSON before Express can echo a WIF or log its parser error', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    const response = await w.request('/wallet/custody', { method: 'POST', rawBody: `{"wif":"${WIF}",broken}` });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, error: 'invalid wallet custody request' });
    expect(logs).not.toHaveBeenCalled();
  });

  it('refuses stale stored bindings and replacements between decrypt and audit', async () => {
    const w = await world();
    await w.store();
    w.accounts.get(SID).doge_address = OTHER_ADDRESS;
    expect((await w.request(`/wallet/custody/${SID}?confirm=1`)).status).toBe(409);
    expect(w.db.auditWalletKeyReveal).not.toHaveBeenCalled();
    w.accounts.get(SID).doge_address = ADDRESS;
    w.db.auditWalletKeyReveal.mockResolvedValueOnce({ data: false, error: null });
    expect((await w.request(`/wallet/custody/${SID}?confirm=1`)).status).toBe(409);
  });

  it('rejects a changed encryption key and tampered ciphertext', async () => {
    const w = await world();
    await w.store();
    process.env.WALLET_KEY_SECRET = 'another-test-key-of-at-least-32-bytes';
    expect((await w.request(`/wallet/custody/${SID}?confirm=1`)).status).toBe(500);
    process.env.WALLET_KEY_SECRET = SECRET;
    w.accounts.get(SID).doge_wif_enc = 'v1:tampered';
    expect((await w.request(`/wallet/custody/${SID}?confirm=1`)).status).toBe(500);
    expect(w.audit).toHaveLength(0);
  });

  it('returns metadata without ciphertext; allows metadata/delete without the encryption key', async () => {
    const w = await world();
    await w.store();
    delete process.env.WALLET_KEY_SECRET;
    const response = await w.request('/class/wallet-custody');
    expect(response.body.wallets[SID]).toMatchObject({ held: true, label: 'Wallet #7' });
    expect(JSON.stringify(response.body)).not.toContain('doge_wif_enc');
    expect(JSON.stringify(response.body)).not.toContain(WIF);
    expect((await w.request(`/wallet/custody/${SID}`, { method: 'DELETE' })).body).toEqual({ ok: true, held: false });
    expect(w.accounts.get(SID).doge_wif_enc).toBeNull();
    expect(w.accounts.get(SID).doge_address).toBe(ADDRESS);
  });

  it('fails gracefully before migration 0035 on all new endpoints', async () => {
    const w = await world();
    const missing = { data: null, error: { code: '42703', message: 'column doge_account.doge_wif_enc does not exist' } };
    for (const method of ['storeWalletCustody', 'getWalletCustody', 'deleteWalletCustody', 'listWalletCustody']) w.db[method].mockResolvedValue(missing);
    for (const response of [await w.store(), await w.request(`/wallet/custody/${SID}?confirm=1`), await w.request(`/wallet/custody/${SID}`, { method: 'DELETE' }), await w.request('/class/wallet-custody')]) {
      expect(response.status).toBe(503);
      expect(response.body.error).toContain('migration 0035');
    }
  });

  it('keeps held material out of student wallet, chain, mutation and class responses', async () => {
    const w = await world();
    await w.store();
    const encrypted = w.accounts.get(SID).doge_wif_enc;
    for (const response of [await w.request('/wallet', { auth: 'student' }), await w.request('/wallet/chain', { auth: 'student' }), await w.request('/wallet/eat', { auth: 'student', method: 'POST' }), await w.request('/class/wallets')]) {
      expect(response.status).toBe(200);
      for (const secret of [WIF, encrypted, 'doge_wif_enc']) expect(JSON.stringify(response.body)).not.toContain(secret);
    }
  });

  it('includes archived address reservations only on the requested teacher view', async () => {
    const w = await world();
    const normal = await w.request('/class/wallets');
    const all = await w.request('/class/wallets?includeArchived=1');
    expect(normal.body.accounts.map((row) => row.studentId)).toEqual([SID]);
    expect(all.body.accounts.map((row) => row.studentId)).toEqual([SID, ARCHIVED]);
    expect((await w.request('/class/wallets?includeArchived=1', { auth: 'student' })).status).toBe(401);
  });
});

describe('wallet crypto separation and database projection', () => {
  it('uses the existing GCM envelope with a separate domain, and measures UTF-8 bytes', () => {
    process.env.ROSTER_PW_ENC_KEY = SECRET;
    const encrypted = encryptWalletWif(WIF);
    expect(encrypted).toMatch(/^v1:/);
    expect(decryptWalletWif(encrypted)).toBe(WIF);
    expect(decryptPassword(encrypted)).toBeNull();
    expect(decryptWalletWif(encryptPassword('password'))).toBeNull();
    process.env.WALLET_KEY_SECRET = 'é'.repeat(16);
    expect(walletCryptoEnabled()).toBe(true);
    expect(decryptWalletWif(encryptWalletWif(WIF))).toBe(WIF);
  });

  it('selects only public account columns and tolerates absent optional migrations', async () => {
    const projections = [];
    let attempts = 0;
    const client = { from: () => {
      const query = {
        select: (columns) => { projections.push(columns); return query; },
        eq: () => query, in: () => query, maybeSingle: () => query,
        then: (resolve) => resolve(++attempts === 1
          ? { data: null, error: { code: '42703', message: 'column doge_account.candy_returned does not exist' } }
          : { data: [], error: null }),
      };
      return query;
    } };
    const db = createDb(client);
    expect((await db.getDogeAccount(SID)).error).toBeNull();
    expect((await db.listDogeAccounts([SID])).error).toBeNull();
    expect(projections[1]).not.toContain('candy_returned');
    for (const projection of projections) {
      expect(projection).not.toContain('*');
      expect(projection).not.toContain('doge_wif_enc');
      expect(projection).toContain('candy_given');
    }
  });
});

describe('real PostgreSQL custody invariants', () => {
  it('is idempotent, preserves give_back, atomically binds/invalidate keys and audits zero-value reveals', async () => {
    const db = await createWalletDb([SID]);
    try {
      const migration = await readFile(new URL('../migrations/0035_wallet_custody.sql', import.meta.url), 'utf8');
      await db.exec(migration);
      await db.exec(migration);
      await db.query('insert into doge_account(student_id, doge_address, candy_given) values ($1,$2,5)', [SID, ADDRESS]);
      const store = async (address, ciphertext = 'v1:test-envelope') => (await db.query('select doge_store_wallet_custody($1,$2,$3,$4) as stored', [SID, address, ciphertext, 'Wallet #7'])).rows[0].stored;
      const audit = async (address, ciphertext = 'v1:test-envelope') => (await db.query('select doge_audit_key_reveal($1,$2,$3) as revealed', [SID, address, ciphertext])).rows[0].revealed;
      expect(await store(OTHER_ADDRESS)).toBe(false);
      expect(await store(ADDRESS)).toBe(true);
      expect(await audit(ADDRESS, 'v1:stale')).toBe(false);
      expect(await audit(ADDRESS)).toBe(true);
      await db.query('select doge_give_back($1,2)', [SID]);
      const ledger = (await db.query('select kind,candy_delta,doge_delta from doge_ledger order by id')).rows;
      expect(ledger.map((row) => row.kind)).toEqual(['key_reveal', 'give_back']);
      expect(Number(ledger[0].candy_delta)).toBe(0);
      expect(Number(ledger[0].doge_delta)).toBe(0);
      await db.query('update doge_account set doge_address=$2 where student_id=$1', [SID, ADDRESS]);
      expect(await audit(ADDRESS)).toBe(true); // Same-address retries preserve custody.
      await db.query('update doge_account set doge_address=$2 where student_id=$1', [SID, OTHER_ADDRESS]);
      const account = (await db.query('select * from doge_account where student_id=$1', [SID])).rows[0];
      expect(account.doge_wif_enc).toBeNull();
      expect(account.doge_key_held_at).toBeNull();
      expect(account.doge_wallet_label).toBeNull();
      expect(Number(account.candy_given)).toBe(5);
      expect(Number(account.candy_returned)).toBe(2);
      expect(await audit(ADDRESS)).toBe(false);
      expect(await store(ADDRESS)).toBe(false); // Address won the race before key storage.
    } finally {
      await db.close();
    }
  }, 60000);
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createHmac } from 'node:crypto';
import { mountWalletCustody } from '../wallet-custody.js';
import { encryptWalletWif } from '../crypto.js';
import { signToken } from '../token.js';
import { deriveWIF, decodeWIF, NETWORKS } from '../lib/doge-keys.mjs';

const ANA = '00000000-0000-4000-8000-000000000001';
const BETH = '00000000-0000-4000-8000-000000000002';
const TEACHER = '00000000-0000-4000-8000-000000000003';
const MISSING = '00000000-0000-4000-8000-000000000099';
const WIF = deriveWIF(Buffer.alloc(32, 7), NETWORKS.mainnet.wif);
const OTHER_WIF = deriveWIF(Buffer.alloc(32, 8), NETWORKS.mainnet.wif);
const ADDRESS = decodeWIF(WIF).address;
const OTHER_ADDRESS = decodeWIF(OTHER_WIF).address;
const SECRET = 'student-print-test-only-secret-of-at-least-32-bytes';
const ENV_NAMES = ['WALLET_KEY_SECRET', 'ROSTER_TOKEN_SECRET', 'TEACHER_KEY'];
const servers = [];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map(name => [name, process.env[name]]));
  process.env.WALLET_KEY_SECRET = SECRET;
  process.env.ROSTER_TOKEN_SECRET = 'student-print-session-test-secret';
  process.env.TEACHER_KEY = 'private-student-print-teacher-test-secret';
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  vi.restoreAllMocks();
});

async function printWorld() {
  const roster = new Map([
    [ANA, { student_id: ANA, status: 'active', role: 'student', real_name: 'Ana Example', login_username: 'ana', section: 'B', password_cipher: 'NEVER_RETURN_PASSWORDS' }],
    [BETH, { student_id: BETH, status: 'active', role: 'student', real_name: 'Beth Example', login_username: 'beth', section: 'E' }],
    [TEACHER, { student_id: TEACHER, status: 'active', role: 'teacher' }],
  ]);
  const accounts = new Map([
    [ANA, { student_id: ANA, doge_address: ADDRESS, doge_wif_enc: encryptWalletWif(WIF), doge_wallet_label: 'Wallet #7' }],
    [BETH, { student_id: BETH, doge_address: OTHER_ADDRESS, doge_wif_enc: encryptWalletWif(OTHER_WIF), doge_wallet_label: 'Wallet #8' }],
  ]);
  const auditRows = [];
  const copy = data => ({ data: structuredClone(data), error: null });
  const db = {
    findByStudentId: vi.fn(async id => copy(roster.get(id))),
    getWalletCustody: vi.fn(async id => copy(accounts.get(id))),
    auditWalletKeyReveal: vi.fn(async (id, address, ciphertext) => {
      const account = accounts.get(id);
      if (account?.doge_address !== address || account?.doge_wif_enc !== ciphertext) return copy(false);
      auditRows.push({ student_id: id, kind: 'key_reveal', candy_delta: 0, doge_delta: 0 });
      return copy(true);
    }),
    listRoster: vi.fn(async () => copy([...roster.values()])),
    listWalletCustody: vi.fn(async () => copy([...accounts.values()])),
    storeWalletCustody: vi.fn(),
    deleteWalletCustody: vi.fn(),
  };
  const app = express();
  app.use(express.json());
  mountWalletCustody(app, { db });
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const request = async ({ path = '/wallet/custody/print', method = 'POST', studentId = ANA, token, body = { confirm: true }, headers = {}, rawBody } = {}) => {
    const auth = token !== undefined ? token : studentId ? signToken(studentId) : null;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...headers },
      body: method === 'GET' ? undefined : rawBody ?? JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { request, db, roster, accounts, auditRows };
}

function expectNoKey(response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  for (const secret of [WIF, OTHER_WIF, 'doge_wif_enc', 'NEVER_RETURN_PASSWORDS']) {
    expect(JSON.stringify(response.body)).not.toContain(secret);
  }
}

describe('student-owned printable wallet', () => {
  it('returns each student only their own wallet after exactly one audit', async () => {
    const w = await printWorld();
    const ana = await w.request();
    expect(ana.status).toBe(200);
    expect(ana.headers.get('cache-control')).toBe('no-store');
    expect(ana.headers.get('pragma')).toBe('no-cache');
    expect(ana.body).toEqual({ ok: true, wallet: {
      studentId: ANA, realName: 'Ana Example', username: 'ana', section: 'B',
      address: ADDRESS, wif: WIF, label: 'Wallet #7',
    } });
    expect(JSON.stringify(ana.body)).not.toContain(OTHER_WIF);
    expect(JSON.stringify(ana.body)).not.toContain('NEVER_RETURN_PASSWORDS');
    expect(w.db.auditWalletKeyReveal).toHaveBeenCalledWith(ANA, ADDRESS, w.accounts.get(ANA).doge_wif_enc);
    const beth = await w.request({ studentId: BETH });
    expect(beth.body.wallet).toMatchObject({ studentId: BETH, address: OTHER_ADDRESS, wif: OTHER_WIF });
    expect(JSON.stringify(beth.body)).not.toContain(WIF);
    expect(w.db.getWalletCustody.mock.calls).toEqual([[ANA], [BETH]]);
    expect(w.auditRows).toEqual([ANA, BETH].map(student_id => ({ student_id, kind: 'key_reveal', candy_delta: 0, doge_delta: 0 })));
    expect(JSON.stringify(w.auditRows)).not.toContain(WIF);
  });

  it.each([
    ['studentId', BETH], ['address', OTHER_ADDRESS], ['username', 'beth'],
    ['section', 'E'], ['token', 'query-auth-is-forbidden'], ['wif', OTHER_WIF],
  ])('rejects the %s body selector before reading any key', async (field, value) => {
    const w = await printWorld();
    const response = await w.request({ body: { confirm: true, [field]: value } });
    expect(response.status).toBe(400);
    expectNoKey(response);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
    expect(w.auditRows).toHaveLength(0);
  });

  it.each(['studentId', 'address', 'token', 'confirm'])('rejects every %s query parameter with a valid bearer', async field => {
    const w = await printWorld();
    const response = await w.request({ path: `/wallet/custody/print?${field}=${encodeURIComponent(BETH)}` });
    expect(response.status).toBe(400);
    expectNoKey(response);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it.each([null, {}, [], { confirm: false }, { confirm: 1 }, { confirm: 'true' }])('requires boolean confirmation (%j)', async body => {
    const w = await printWorld();
    const response = await w.request({ body });
    expect(response.status).toBe(400);
    expectNoKey(response);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it('rejects missing, forged, expired, non-UUID and unknown sessions', async () => {
    const w = await printWorld();
    const payload = Buffer.from(JSON.stringify({ sid: ANA, exp: Date.now() - 1000 })).toString('base64url');
    const expired = payload + '.' + createHmac('sha256', process.env.ROSTER_TOKEN_SECRET).update(payload).digest('base64url');
    for (const token of [null, 'forged.token', expired, signToken('not-a-student-id'), signToken(MISSING)]) {
      const response = await w.request({ token });
      expect(response.status).toBe(401);
      expectNoKey(response);
    }
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
    expect(w.auditRows).toHaveLength(0);
  });

  it('does not accept query tokens, teacher keys or teacher sessions as student authentication', async () => {
    const w = await printWorld();
    const requests = [
      { studentId: null, path: `/wallet/custody/print?token=${encodeURIComponent(signToken(ANA))}` },
      { studentId: null, headers: { 'x-teacher-secret': process.env.TEACHER_KEY } },
      { studentId: TEACHER },
      { studentId: null, body: { confirm: true, token: signToken(ANA) } },
    ];
    for (const options of requests) {
      const response = await w.request(options);
      expect(response.status).toBe(401);
      expectNoKey(response);
    }
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it.each(['archived', null, 'unknown'])('rejects an inactive roster row (%s) even with an unexpired token', async status => {
    const w = await printWorld();
    w.roster.get(ANA).status = status;
    const response = await w.request();
    expect(response.status).toBe(401);
    expectNoKey(response);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it('fails closed when session signing is not configured', async () => {
    const w = await printWorld();
    const token = signToken(ANA);
    delete process.env.ROSTER_TOKEN_SECRET;
    const response = await w.request({ token });
    expect(response.status).toBe(401);
    expectNoKey(response);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it.each(['', 'short', 'a'.repeat(31)])('fails closed when custody encryption is not configured (%s)', async secret => {
    const w = await printWorld();
    process.env.WALLET_KEY_SECRET = secret;
    const response = await w.request();
    expect(response.status).toBe(503);
    expectNoKey(response);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it('returns a clean absence when the student has no held key', async () => {
    const w = await printWorld();
    w.accounts.delete(ANA);
    const response = await w.request();
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('no held wallet key');
    expectNoKey(response);
    expect(w.auditRows).toHaveLength(0);
  });

  it('checks that both database rows belong to the authenticated student', async () => {
    const w = await printWorld();
    w.db.findByStudentId.mockResolvedValueOnce({ data: w.roster.get(BETH), error: null });
    const rosterMismatch = await w.request();
    expect(rosterMismatch.status).toBe(401);
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
    w.db.getWalletCustody.mockResolvedValueOnce({ data: w.accounts.get(BETH), error: null });
    const walletMismatch = await w.request();
    expect(walletMismatch.status).toBe(500);
    expectNoKey(rosterMismatch);
    expectNoKey(walletMismatch);
    expect(w.auditRows).toHaveLength(0);
  });

  it('rechecks active roster membership after reading the wallet and before auditing', async () => {
    const w = await printWorld();
    w.db.getWalletCustody.mockImplementationOnce(async () => {
      w.roster.get(ANA).status = 'archived';
      return { data: structuredClone(w.accounts.get(ANA)), error: null };
    });
    const response = await w.request();
    expect(response.status).toBe(401);
    expectNoKey(response);
    expect(w.db.auditWalletKeyReveal).not.toHaveBeenCalled();
  });

  it.each(['archive', 'delete', 'expire'])('refuses a key when authorization changes during the audit (%s)', async change => {
    const w = await printWorld();
    const token = signToken(ANA);
    const audit = w.db.auditWalletKeyReveal.getMockImplementation();
    w.db.auditWalletKeyReveal.mockImplementationOnce(async (...args) => {
      const result = await audit(...args);
      if (change === 'archive') w.roster.get(ANA).status = 'archived';
      if (change === 'delete') w.roster.delete(ANA);
      if (change === 'expire') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 86400000);
      return result;
    });
    const response = await w.request({ token });
    expect(response.status).toBe(401);
    expectNoKey(response);
    // An attempted reveal may already have its zero-value audit row, but no
    // private material is returned after the final authorization check fails.
    expect(w.auditRows).toHaveLength(1);
    expect(JSON.stringify(w.auditRows)).not.toContain(WIF);
  });

  it('uses current print metadata after the audit completes', async () => {
    const w = await printWorld();
    const audit = w.db.auditWalletKeyReveal.getMockImplementation();
    w.db.auditWalletKeyReveal.mockImplementationOnce(async (...args) => {
      w.roster.get(ANA).real_name = 'Ana Updated';
      return audit(...args);
    });
    const response = await w.request();
    expect(response.status).toBe(200);
    expect(response.body.wallet.realName).toBe('Ana Updated');
  });

  it('refuses a token that expires while the final roster lookup is pending', async () => {
    const w = await printWorld();
    const token = signToken(ANA);
    const findStudent = w.db.findByStudentId.getMockImplementation();
    let lookups = 0;
    w.db.findByStudentId.mockImplementation(async id => {
      const result = await findStudent(id);
      lookups += 1;
      if (lookups === 3) vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 86400000);
      return result;
    });
    const response = await w.request({ token });
    expect(response.status).toBe(401);
    expectNoKey(response);
    expect(w.auditRows).toHaveLength(1);
  });

  it('limits repeated prints by student before reading or auditing another key', async () => {
    const w = await printWorld();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await w.request()).status).toBe(200);
    const limited = await w.request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expectNoKey(limited);
    expect(w.db.getWalletCustody).toHaveBeenCalledTimes(5);
    expect(w.db.auditWalletKeyReveal).toHaveBeenCalledTimes(5);
    // Students sharing a classroom NAT do not consume each other's allowance.
    expect((await w.request({ studentId: BETH })).status).toBe(200);
    clock.mockReturnValue(now + 60000);
    expect((await w.request()).status).toBe(200);
    expect(w.auditRows).toHaveLength(7);
  });

  it('rejects a stale wallet address before an audit or disclosure', async () => {
    const w = await printWorld();
    w.accounts.get(ANA).doge_address = OTHER_ADDRESS;
    const response = await w.request();
    expect(response.status).toBe(409);
    expectNoKey(response);
    expect(w.db.auditWalletKeyReveal).not.toHaveBeenCalled();
  });

  it.each(['replace', 'delete', 'address'])('refuses a concurrent custody %s at the audit', async change => {
    const w = await printWorld();
    const audit = w.db.auditWalletKeyReveal.getMockImplementation();
    w.db.auditWalletKeyReveal.mockImplementationOnce(async (...args) => {
      if (change === 'replace') w.accounts.get(ANA).doge_wif_enc = encryptWalletWif(WIF);
      if (change === 'delete') w.accounts.delete(ANA);
      if (change === 'address') w.accounts.get(ANA).doge_address = OTHER_ADDRESS;
      return audit(...args);
    });
    const response = await w.request();
    expect(response.status).toBe(409);
    expectNoKey(response);
    expect(w.auditRows).toHaveLength(0);
  });

  it.each(['findByStudentId', 'getWalletCustody', 'auditWalletKeyReveal'])('sanitizes %s failures without logging private data', async method => {
    const w = await printWorld();
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const throws of [false, true]) {
      const error = new Error(WIF);
      if (throws) w.db[method].mockRejectedValueOnce(error);
      else w.db[method].mockResolvedValueOnce({ data: true, error });
      const response = await w.request();
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('wallet custody request failed');
      expectNoKey(response);
    }
    expect(w.auditRows).toHaveLength(0);
    expect(logs).not.toHaveBeenCalled();
  });

  it('requires the audit to return exactly true', async () => {
    const w = await printWorld();
    for (const data of [null, false, 'true', 1, undefined]) {
      w.db.auditWalletKeyReveal.mockResolvedValueOnce({ data, error: null });
      const response = await w.request();
      expect(response.status).toBe(409);
      expectNoKey(response);
    }
    expect(w.auditRows).toHaveLength(0);
  });

  it.each(['v1:tampered', 'encrypted-invalid-wif', 'encrypted-testnet-wif'])('refuses unreadable or invalid stored material (%s)', async value => {
    const w = await printWorld();
    w.accounts.get(ANA).doge_wif_enc = value === 'encrypted-invalid-wif' ? encryptWalletWif('invalid-private-key')
      : value === 'encrypted-testnet-wif' ? encryptWalletWif(deriveWIF(Buffer.alloc(32, 7), NETWORKS.testnet.wif)) : value;
    const response = await w.request();
    expect(response.status).toBe(500);
    expectNoKey(response);
    expect(w.db.auditWalletKeyReveal).not.toHaveBeenCalled();
  });

  it('sanitizes malformed request bodies with the same non-caching headers', async () => {
    const w = await printWorld();
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await w.request({ rawBody: `{"wif":"${WIF}",broken}` });
    expect(response.status).toBe(400);
    expectNoKey(response);
    expect(logs).not.toHaveBeenCalled();
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
  });

  it('keeps teacher reveal, bulk export, storage, metadata and deletion teacher-only', async () => {
    const w = await printWorld();
    const paths = [
      ['GET', `/wallet/custody/${BETH}?confirm=1`],
      ['GET', `/wallet/custody/${ANA}?confirm=1`],
      ['GET', '/class/wallet-custody/export?confirm=1'],
      ['GET', '/class/wallet-custody'],
      ['DELETE', `/wallet/custody/${ANA}`],
      ['POST', '/wallet/custody'],
    ];
    for (const [method, path] of paths) {
      const response = await w.request({ method, path });
      expect(response.status).toBe(401);
      expectNoKey(response);
    }
    expect(w.db.getWalletCustody).not.toHaveBeenCalled();
    expect(w.db.listWalletCustody).not.toHaveBeenCalled();
    expect(w.db.storeWalletCustody).not.toHaveBeenCalled();
    expect(w.db.deleteWalletCustody).not.toHaveBeenCalled();
  });
});

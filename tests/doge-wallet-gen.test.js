// @vitest-environment node
// doge-wallet-gen.test.js — correctness of the offline Dogecoin paper-wallet
// generator's encoding. Anchored on the canonical base58check vector (DOGE only
// swaps the version byte), plus round-trips and network prefixes. The teacher
// ALSO testnet-verifies before funding real DOGE — this is the code-level net.

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  base58encode, base58decode, base58check, base58checkDecode,
  hash160, deriveAddress, deriveWIF, generateWallet, NETWORKS, selfTest, renderReprintSheet,
} from '../tools/doge-wallet-gen.mjs';

describe('doge-wallet-gen — base58check correctness', () => {
  it('matches the canonical base58check vector (validates the whole pipeline)', () => {
    const h160 = Buffer.from('010966776006953D5567439E5E39F86A0D273BEE', 'hex');
    const addr = base58check(Buffer.concat([Buffer.from([0x00]), h160]));
    expect(addr).toBe('16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM');
  });

  it('base58 round-trips arbitrary bytes incl. leading zeros', () => {
    for (const hex of ['00', '0000ff', 'deadbeef', '01']) {
      const b = Buffer.from(hex, 'hex');
      expect(base58decode(base58encode(b)).toString('hex')).toBe(hex);
    }
  });

  it('base58check rejects a tampered string', () => {
    const good = base58check(Buffer.from([0x1e, 1, 2, 3]));
    const bad = good.slice(0, -1) + (good.slice(-1) === '1' ? '2' : '1');
    expect(() => base58checkDecode(bad)).toThrow();
  });

  it('hash160 = RIPEMD160(SHA256(x)) (known empty-string vector)', () => {
    // SHA256("") then RIPEMD160 → b472a266d0bd89c13706a4132ccfb16f7c3b9fcb
    expect(hash160(Buffer.from('')).toString('hex')).toBe('b472a266d0bd89c13706a4132ccfb16f7c3b9fcb');
  });
});

describe('doge-wallet-gen — existing wallet reprint', () => {
  // Public test key 1; never fund this address.
  const wif = 'QNcdLVw8fHkixm6NNyN6nVwxKek4u7qrioRbQmjxac5TVoTtZuot';
  const address = 'DFpN6QqFfUm3gKNaxN6tNcab1FArL9cZLE';
  const cli = fileURLToPath(new URL('../tools/doge-wallet-gen.mjs', import.meta.url));

  it('reprints one sheet with both QRs and escapes the supplied label', async () => {
    const createECDH = crypto.createECDH.bind(crypto);
    const generateKeys = vi.fn(() => { throw new Error('Unexpected new key generation'); });
    const spy = vi.spyOn(crypto, 'createECDH').mockImplementation((curve) => {
      const ecdh = createECDH(curve);
      ecdh.generateKeys = generateKeys;
      return ecdh;
    });
    try {
      const html = await renderReprintSheet(wif, '<img src=x onerror=alert(1)> & "Wallet"');
      expect(html).toContain(address);
      expect(html).toContain(wif);
      expect(html.match(/class="card"/g)).toHaveLength(1);
      expect(html.match(/<svg\b/g)).toHaveLength(2);
      expect(html).toContain('1 reprinted');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Wallet&quot;');
      expect(html).not.toContain('<img');
      expect(generateKeys).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects testnet WIFs for reprints', async () => {
    await expect(renderReprintSheet('cejxntqoC3o8qiC8HG8DrwoNyiRDBrMCEU8QrUVpLKdXsGy8LpTM')).rejects.toThrow('network');
  });

  it('CLI creates only the requested sheet, generates no keys, and keeps WIF out of logs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doge-reprint-test-'));
    const guard = `import crypto from 'node:crypto'; const original=crypto.createECDH.bind(crypto); crypto.createECDH=(curve)=>{const key=original(curve); key.generateKeys=()=>{throw new Error('Key generation forbidden')}; return key;};`;
    try {
      const result = spawnSync(process.execPath, [
        '--import', 'data:text/javascript,' + encodeURIComponent(guard), cli,
        '--reprint', '--wif', wif, '--label', 'Wallet #17', '--out', 'sheet.html',
      ], { cwd: directory, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).not.toContain(wif);
      expect(readdirSync(directory)).toEqual(['sheet.html']);
      const html = readFileSync(join(directory, 'sheet.html'), 'utf8');
      expect(html).toContain('Wallet #17');
      expect(html).toContain(address);
      expect(html).toContain(wif);
    } finally {
      // Test-owned path returned by mkdtemp, confined to the temp directory.
      expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('CLI rejects unsafe reprint combinations and invalid WIFs without writing or logging keys', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doge-reprint-invalid-'));
    try {
      for (const flags of [
        ['--reprint'],
        ['--wif', wif],
        ['--reprint', '--wif', wif, '--testnet'],
        ['--reprint', '--wif', wif, '--count', '2'],
        ['--reprint', '--wif', wif, '--backup', 'keys.csv'],
        ['--reprint', '--wif', wif.slice(0, -1) + '1'],
      ]) {
        const result = spawnSync(process.execPath, [cli, ...flags], { cwd: directory, encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).not.toContain(wif);
        expect(readdirSync(directory)).toEqual([]);
      }
    } finally {
      expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('doge-wallet-gen — Dogecoin wallets', () => {
  it('self-test passes', () => {
    expect(selfTest()).toBe(true);
  });

  it('mainnet: address starts with D, valid checksum, WIF round-trips to the key', () => {
    const w = generateWallet(NETWORKS.mainnet);
    expect(w.address[0]).toBe('D');
    expect(() => base58checkDecode(w.address)).not.toThrow();   // checksum valid
    expect(w.privHex).toHaveLength(64);                          // padded to 32 bytes
    const payload = base58checkDecode(w.wif);
    expect(payload[0]).toBe(0x9e);                              // DOGE WIF version
    expect(payload.subarray(1, 33).toString('hex')).toBe(w.privHex); // recovers the key
    expect(payload[33]).toBe(0x01);                            // compressed flag
  });

  it('testnet: address starts with n', () => {
    expect(generateWallet(NETWORKS.testnet).address[0]).toBe('n');
  });

  it('deriveAddress/deriveWIF build valid base58check for a fixed key', () => {
    // deterministic pubkey-ish bytes → address is internally consistent
    const pub = Buffer.from('02' + 'a'.repeat(64), 'hex');
    const addr = deriveAddress(pub, NETWORKS.mainnet.p2pkh);
    expect(addr[0]).toBe('D');
    expect(() => base58checkDecode(addr)).not.toThrow();
    const wif = deriveWIF(Buffer.alloc(32, 7), NETWORKS.mainnet.wif);
    expect(base58checkDecode(wif)[0]).toBe(0x9e);
  });

  it('every generated address is unique (random keys)', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(generateWallet(NETWORKS.mainnet).address);
    expect(seen.size).toBe(50);
  });
});

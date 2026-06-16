// doge-wallet-gen.test.js — correctness of the offline Dogecoin paper-wallet
// generator's encoding. Anchored on the canonical base58check vector (DOGE only
// swaps the version byte), plus round-trips and network prefixes. The teacher
// ALSO testnet-verifies before funding real DOGE — this is the code-level net.

import { describe, it, expect } from 'vitest';
import {
  base58encode, base58decode, base58check, base58checkDecode,
  hash160, deriveAddress, deriveWIF, generateWallet, NETWORKS, selfTest,
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

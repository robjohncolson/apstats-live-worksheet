// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { base58check, decodeWIF, addressFromWIF } from '../tools/lib/doge-keys.mjs';
import { decodeWIF as serverDecodeWIF } from '../roster-server/lib/doge-keys.mjs';

// Public test scalars 1, 2, 0x0707...07 and n-1. Never fund these addresses.
// Independently computed with Python cryptography SECP256K1 + hashlib + base58.
const VECTORS = [
  ['mainnet', true, 'QNcdLVw8fHkixm6NNyN6nVwxKek4u7qrioRbQmjxac5TVoTtZuot', 'DFpN6QqFfUm3gKNaxN6tNcab1FArL9cZLE'],
  ['testnet', true, 'cejxntqoC3o8qiC8HG8DrwoNyiRDBrMCEU8QrUVpLKdXsGy8LpTM', 'nesRpRaAbTDmZHwmzBkLd2AtF7Z9L9z5S2'],
  ['mainnet', false, '6J8csdv3eDrnJcpSEb4shfjMh2JTiG9MKzC1Yfge4Y4GyUsjdM6', 'DJRU7MLhcPwCTNRZ4e8gJzDebtG1H5M7pc'],
  ['testnet', false, '95UQWtAhNXzaVi3yUhaosHVdhVR4fi62e34wo6n3ZvcTw67if2k', 'nhUXqN5cYNPvLLzk6Tn8ZPowqkeJP7Qws2'],
  ['mainnet', true, 'QNcdLVw8fHkixm6NNyN6nVwxKek4u7qrioRbQmjxac5TWJNCSSxJ', 'D5kTEGxmas71USKAcAaJptKjq8NJc6EK8C'],
  ['testnet', true, 'cejxntqoC3o8qiC8HG8DrwoNyiRDBrMCEU8QrUVpLKdXsmrvpEqB', 'nUoWxHhgWqZjMQtMdzDm5Hv34zkbacZa64'],
  ['mainnet', false, '6J8csdv3eDrnJcpSEb4shfjMh2JTiG9MKzC1Yfge4Y4GyVc1mxU', 'DQimpZgfZP6mZWBT6sVQDor99CBjw7xV5m'],
  ['testnet', false, '95UQWtAhNXzaVi3yUhaosHVdhVR4fi62e34wo6n3ZvcTw7CKDRR', 'nomqYaRaVMZVSUke8h8rUDSSP4a2w1rdUD'],
  ['mainnet', true, 'QNrHeExAKZ1buJrHgur2HyHtmydZgoQMrZoHRSDodfLkzrRFQ9x3', 'DL54i6msdfchWaR7NHFA41HxSiYciTwhqW'],
  ['testnet', true, 'ceyd6drprK41nFx3bCc9NR9KS3JhyXuhNEW6s8yfPNtqNKv4cUBs', 'nj88S7WnZe5RPYzJQ6tcJQtFgavumH1b9o'],
  ['mainnet', false, '6JBiP2oUwW18udfoq1ePVmUPc7VDqtkMatPGW6iRADK55XjDn56', 'DJCpHkYybWEgGufpZswp9YCfamoyB6mtoV'],
  ['testnet', false, '95XW2H48fp8w6iuM58AKfPEfcabpoLh2twGCkXopfbsG3Bb8ZVK', 'nhFt1mHtXUhQ9tF1bhbGPwnxpeCGB1YiW6'],
  ['mainnet', true, 'QXCFufJ2qSfrwH78w3kzag36ZqfSrcaLELwaFeffZEh6hGWYApVE', 'DLzRk2S3qDsb4aZu9DqSR91Yr4RsNmv2Tg'],
  ['testnet', true, 'coKbN4ChNCiGpECtqLX7f7tXDuLb9M5fk1ePhMRXJxFB4k66PwmH', 'nk3VU3AxmCLJwZ96B3UtfYbr5vpARM6Y8m'],
  ['mainnet', false, '6L5N3sN5VeY1SSQ99AgsezL45GZGpwjSev18XxfDMu3HhS9o655', 'DNXhXropFRCG7DbQ4waP42ySYHYWNxXGcR'],
  ['testnet', false, '97R9h7cjDxfodXdgPHCopc6L5jfsnPg7xxt4nPkcsHbUf5SEZyD', 'nmamFsYjBPeyzCAb6mDqJSZjn9voU6uDVX'],
];

const browserSource = readFileSync(new URL('../doge-keys.js', import.meta.url), 'utf8');
function browserKeys(crypto = webcrypto) {
  const window = { crypto };
  runInNewContext(browserSource, { window });
  return window.DogeKeys;
}

describe('shared Dogecoin WIF decoder', () => {
  it('uses the exact same implementation from the CLI and deployed server', () => {
    expect(decodeWIF).toBe(serverDecodeWIF);
  });

  for (const [network, compressed, wif, address] of VECTORS) {
    it(`matches the independent ${network} ${compressed ? 'compressed' : 'uncompressed'} vector ${address}`, async () => {
      const expected = { address, compressed, network };
      expect(decodeWIF(wif, { network })).toEqual(expected);
      expect(addressFromWIF(wif, { network })).toBe(address);
      expect(await browserKeys().decodeWIF(wif, { network })).toEqual(expected);
    });
  }

  it('defaults to mainnet and rejects every testnet WIF without an explicit override', async () => {
    const browser = browserKeys();
    for (const [network, , wif] of VECTORS) {
      if (network !== 'testnet') continue;
      expect(() => decodeWIF(wif)).toThrow();
      await expect(browser.decodeWIF(wif)).rejects.toThrow();
    }
  });

  it('normalizes surrounding whitespace without returning secret fields', async () => {
    const [, , wif, address] = VECTORS[0];
    const padded = ` \n${wif}\r\n`;
    expect(Object.keys(decodeWIF(padded)).sort()).toEqual(['address', 'compressed', 'network']);
    expect(await browserKeys().addressFromWIF(padded)).toBe(address);
  });

  it('rejects invalid checksums, payloads, flags, networks and scalars in both runtimes', async () => {
    const one = Buffer.alloc(32); one[31] = 1;
    const order = Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 'hex');
    const wifFor = (key, flag = Buffer.from([1]), prefix = 0x9e) => base58check(Buffer.concat([Buffer.from([prefix]), key, flag]));
    const valid = VECTORS[0][2];
    const invalid = [
      '', null, 123, {}, '1'.repeat(10000),
      valid.slice(0, -1) + '1', '0' + valid.slice(1), valid.slice(0, 5) + ' ' + valid.slice(6),
      wifFor(Buffer.alloc(32)), wifFor(order), wifFor(Buffer.alloc(32, 255)),
      wifFor(one, Buffer.from([0])), wifFor(one, Buffer.from([2])),
      wifFor(one, Buffer.from([1, 1])), wifFor(Buffer.alloc(31, 1), Buffer.alloc(0)),
      wifFor(one, Buffer.from([1]), 0x80),
    ];
    const browser = browserKeys();
    for (const input of invalid) {
      expect(() => decodeWIF(input)).toThrow();
      await expect(browser.decodeWIF(input)).rejects.toThrow();
      if (typeof input === 'string' && input.length >= 20) {
        try { decodeWIF(input); } catch (error) { expect(error.message).not.toContain(input); }
        try { await browser.decodeWIF(input); } catch (error) { expect(error.message).not.toContain(input); }
      }
    }
    expect(() => decodeWIF(valid, { network: '__proto__' })).toThrow('Invalid Dogecoin network');
    await expect(browser.decodeWIF(valid, { network: '__proto__' })).rejects.toThrow('Invalid Dogecoin network');
  });

  it('requires only SHA-256 from Web Crypto and never generates keys', async () => {
    const browser = browserKeys({
      subtle: { digest: webcrypto.subtle.digest.bind(webcrypto.subtle) },
      getRandomValues() { throw new Error('Key generation is forbidden'); },
    });
    expect(Object.keys(browser).sort()).toEqual(['addressFromWIF', 'decodeWIF']);
    expect(await browser.addressFromWIF(VECTORS[0][2])).toBe(VECTORS[0][3]);
    await expect(browserKeys({}).addressFromWIF(VECTORS[0][2])).rejects.toThrow('Web Crypto');
  });
});

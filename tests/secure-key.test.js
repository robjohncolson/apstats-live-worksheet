/**
 * Tests for secure-key.js (ANDROID Phase 4 §3B). The bridge wraps the native
 * SecureKeyStore plugin into window.SecureKeyStore — always defined, with an
 * `available` flag, so teacher-app.html degrades on the web instead of crashing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'secure-key.js'), 'utf8');

function load(capacitor) {
  const win = { Capacitor: capacitor };
  runInContext(SRC, createContext({ window: win, globalThis: win, Promise }));
  return win.SecureKeyStore;
}

function mockPlugin() {
  const calls = [];
  const plugin = {
    setKey: (a) => { calls.push(['setKey', a]); return Promise.resolve(); },
    getKey: (a) => { calls.push(['getKey', a]); return Promise.resolve({ value: 'JWK-' + a.key }); },
    hasKey: (a) => { calls.push(['hasKey', a]); return Promise.resolve({ exists: a.key === 'present' }); },
    removeKey: (a) => { calls.push(['removeKey', a]); return Promise.resolve(); },
    isBiometricAvailable: () => Promise.resolve({ available: true, code: 0 }),
  };
  return { plugin, calls };
}

describe('secure-key bridge — web (no native plugin)', () => {
  it('is defined but unavailable on the web', () => {
    const sk = load(undefined);
    expect(sk).toBeTruthy();
    expect(sk.available).toBe(false);
  });
  it('hasKey/removeKey/isBiometricAvailable degrade quietly; set/get reject', async () => {
    const sk = load({ isNativePlatform: () => false, Plugins: {} });
    expect(await sk.hasKey('x')).toBe(false);
    expect(await sk.isBiometricAvailable()).toBe(false);
    await expect(sk.setKey('x', 'y')).rejects.toThrow(/only available in the AP Stats app/);
    await expect(sk.getKey('x')).rejects.toThrow(/only available in the AP Stats app/);
  });
});

describe('secure-key bridge — native app', () => {
  it('reports available', () => {
    const { plugin } = mockPlugin();
    expect(load({ isNativePlatform: () => true, Plugins: { SecureKeyStore: plugin } }).available).toBe(true);
  });

  it('setKey forwards {key,value}', async () => {
    const { plugin, calls } = mockPlugin();
    const sk = load({ isNativePlatform: () => true, Plugins: { SecureKeyStore: plugin } });
    await sk.setKey('signing', '{"kty":"OKP"}');
    expect(calls).toContainEqual(['setKey', { key: 'signing', value: '{"kty":"OKP"}' }]);
  });

  it('getKey unwraps the value', async () => {
    const { plugin } = mockPlugin();
    const sk = load({ isNativePlatform: () => true, Plugins: { SecureKeyStore: plugin } });
    expect(await sk.getKey('signing')).toBe('JWK-signing');
  });

  it('hasKey maps {exists}', async () => {
    const { plugin } = mockPlugin();
    const sk = load({ isNativePlatform: () => true, Plugins: { SecureKeyStore: plugin } });
    expect(await sk.hasKey('present')).toBe(true);
    expect(await sk.hasKey('absent')).toBe(false);
  });

  it('isBiometricAvailable maps {available}', async () => {
    const { plugin } = mockPlugin();
    const sk = load({ isNativePlatform: () => true, Plugins: { SecureKeyStore: plugin } });
    expect(await sk.isBiometricAvailable()).toBe(true);
  });
});

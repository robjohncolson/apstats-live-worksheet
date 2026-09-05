// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createECDH, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { deriveAddress, deriveWIF, NETWORKS } from '../tools/doge-wallet-gen.mjs';

const encoderBytes = readFileSync(new URL('../vendor/qrcode-generator/qrcode-2.0.4.js', import.meta.url));
const decoderSource = readFileSync(new URL('../vendor/jsqr/jsQR-1.4.0.js', import.meta.url), 'utf8');

function qrLibraries() {
  const window = {};
  window.window = window;
  window.self = window;
  const sandbox = createContext(window);
  runInContext(encoderBytes.toString('utf8'), sandbox);
  runInContext(decoderSource, sandbox);
  return { qrcode: window.qrcode, jsQR: window.jsQR };
}

function encoderPixels(qrcode, value) {
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();

  const scale = 6;
  const quietZone = 4;
  const modules = qr.getModuleCount();
  const size = (modules + quietZone * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - quietZone;
      const column = Math.floor(x / scale) - quietZone;
      const inside = row >= 0 && column >= 0 && row < modules && column < modules;
      const color = inside && qr.isDark(row, column) ? 0 : 255;
      const offset = (y * size + x) * 4;
      data[offset] = color;
      data[offset + 1] = color;
      data[offset + 2] = color;
      data[offset + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

// Public deterministic fixtures only. Never load a real wallet or backup.
const fixtures = [
  ['scalar one', '1'.padStart(64, '0')],
  ['last valid scalar', 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140'],
].flatMap(([name, hex]) => {
  const privateKey = Buffer.from(hex, 'hex');
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privateKey);
  const address = deriveAddress(ecdh.getPublicKey(null, 'compressed'), NETWORKS.mainnet.p2pkh);
  const wif = deriveWIF(privateKey, NETWORKS.mainnet.wif);
  privateKey.fill(0);
  return [[`${name} address`, address], [`${name} WIF`, wif]];
});

describe('wallet print QR encoder', () => {
  it('preserves the official encoder and MIT license bytes', () => {
    expect(createHash('sha256').update(encoderBytes).digest('hex'))
      .toBe('79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c');
    const license = readFileSync(new URL('../vendor/qrcode-generator/LICENSE', import.meta.url));
    expect(createHash('sha256').update(license).digest('hex'))
      .toBe('3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c');
  });

  it.each(fixtures)('round-trips %s through the actual vendored encoder and decoder', (_name, value) => {
    const { qrcode, jsQR } = qrLibraries();
    const { data, width, height } = encoderPixels(qrcode, value);
    const decoded = jsQR(data, width, height);
    expect(decoded).not.toBeNull();
    expect(decoded.data).toBe(value);
  });
});

import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import StudentWallet, {
  BIP39_ENGLISH_WORDS,
  DOGECOIN_DERIVATION_PATH,
  createWallet,
  deriveBip32PrivateKey,
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
  pickWordIndexes,
  privateKeyToCompressedPublicKey,
  validateMnemonic,
  walletFromMnemonic,
} from '../js/student-wallet.js';

const OFFICIAL_VECTORS = [
  {
    entropy: '00000000000000000000000000000000',
    mnemonic:
      'abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon about',
    seed:
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553' +
      '1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
  },
  {
    entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f',
    mnemonic:
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
    seed:
      '2e8905819b8723fe2c1d161860e5ee1830318dbf49a83bd451cfb8440c28bd6f' +
      'a457fe1296106559a3c80937a1c1069be3a3a5bd381ee6260e8d9739fce1f607',
  },
];

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('student wallet BIP-39', () => {
  it('embeds the complete official English word list in order', () => {
    expect(BIP39_ENGLISH_WORDS).toHaveLength(2048);
    expect(new Set(BIP39_ENGLISH_WORDS).size).toBe(2048);
    expect(BIP39_ENGLISH_WORDS.slice(0, 4)).toEqual([
      'abandon',
      'ability',
      'able',
      'about',
    ]);
    expect(BIP39_ENGLISH_WORDS.slice(-4)).toEqual([
      'zebra',
      'zero',
      'zone',
      'zoo',
    ]);
  });

  for (const vector of OFFICIAL_VECTORS) {
    it('matches the official vector for entropy ' + vector.entropy, async () => {
      const entropy = Uint8Array.from(Buffer.from(vector.entropy, 'hex'));
      expect(await entropyToMnemonic(entropy, webcrypto)).toBe(vector.mnemonic);

      const recovered = await mnemonicToEntropy(vector.mnemonic, webcrypto);
      expect(toHex(recovered)).toBe(vector.entropy);

      const seed = await mnemonicToSeed(
        vector.mnemonic,
        'TREZOR',
        webcrypto,
      );
      expect(toHex(seed)).toBe(vector.seed);
    });
  }

  it('applies NFKD to the mnemonic and passphrase before PBKDF2', async () => {
    const mnemonic = OFFICIAL_VECTORS[0].mnemonic;
    const composed = await mnemonicToSeed(mnemonic, '\u00e9', webcrypto);
    const decomposed = await mnemonicToSeed(mnemonic, 'e\u0301', webcrypto);
    expect(toHex(composed)).toBe(toHex(decomposed));
  });

  it('rejects an invalid checksum', async () => {
    const invalid =
      'abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon';
    await expect(validateMnemonic(invalid, webcrypto)).resolves.toBe(false);
    await expect(mnemonicToEntropy(invalid, webcrypto)).rejects.toThrow(
      /checksum/i,
    );
  });
});

describe('student wallet Dogecoin derivation', () => {
  it('pins the independently derived mainnet address and compressed key', async () => {
    // Oracle generated independently with Python hashlib/hmac for BIP-32,
    // cryptography's SECP256K1 implementation, and hashlib RIPEMD-160.
    const mnemonic = OFFICIAL_VECTORS[0].mnemonic;
    const seed = await mnemonicToSeed(mnemonic, '', webcrypto);
    const privateKey = await deriveBip32PrivateKey(seed, webcrypto);
    const publicKey = privateKeyToCompressedPublicKey(privateKey);
    const wallet = await walletFromMnemonic(mnemonic, { crypto: webcrypto });

    expect(DOGECOIN_DERIVATION_PATH).toBe("m/44'/3'/0'/0/0");
    expect(toHex(privateKey)).toBe(
      '21f5e16d57b9b70a1625020b59a85fa9342de9c103af3dd9f7b94393a4ac2f46',
    );
    expect(toHex(publicKey)).toBe(
      '02cc6b0dc33aabcf3a23643e5e2919a80c50fb3dd2129ce409bbc5f0d4643d05e0',
    );
    expect(wallet).toEqual({
      address: 'DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC',
      path: "m/44'/3'/0'/0/0",
    });
  }, 15_000);

  it('retries the next BIP-32 index when child derivation is invalid', async () => {
    const seed = await mnemonicToSeed(
      OFFICIAL_VECTORS[0].mnemonic,
      '',
      webcrypto,
    );
    const invalidChildDigest = new Uint8Array(64);
    invalidChildDigest.set(Buffer.from(
      'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
      'hex',
    ));
    let signCalls = 0;
    const retryingCrypto = {
      subtle: {
        digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
        importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle),
        deriveBits: webcrypto.subtle.deriveBits.bind(webcrypto.subtle),
        sign: async (...args) => {
          signCalls += 1;
          if (signCalls === 2) return invalidChildDigest.buffer.slice(0);
          return webcrypto.subtle.sign(...args);
        },
      },
    };

    const privateKey = await deriveBip32PrivateKey(seed, retryingCrypto);

    expect(privateKey).toHaveLength(32);
    expect(signCalls).toBe(7);
  });

  it('creates a reveal-once session from exactly 128 random bits', async () => {
    const requestedLengths = [];
    const deterministicCrypto = {
      subtle: webcrypto.subtle,
      getRandomValues(bytes) {
        requestedLengths.push(bytes.byteLength);
        bytes.fill(0);
        return bytes;
      },
    };

    const session = await createWallet({ crypto: deterministicCrypto });
    expect(requestedLengths).toEqual([16]);
    expect(session.address).toBe('DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC');
    expect(session.words()).toEqual(OFFICIAL_VECTORS[0].mnemonic.split(' '));
    expect(session.destroyed).toBe(false);

    const revealedWords = session.words();
    expect(() => { revealedWords[0] = 'wrong'; }).toThrow(/read-only/i);
    expect(revealedWords[0]).toBe('abandon');
    session.destroy();
    expect(session.destroyed).toBe(true);
    expect(() => session.words()).toThrow(/destroyed/i);
    expect(revealedWords).toEqual(new Array(12).fill(''));
  }, 15_000);

  it('chooses sorted, distinct write-down checks without modulo bias', () => {
    const samples = [0xffffffff, 11, 2, 11, 5];
    const deterministicCrypto = {
      subtle: webcrypto.subtle,
      getRandomValues(values) {
        values[0] = samples.shift();
        return values;
      },
    };
    expect(pickWordIndexes(12, 3, deterministicCrypto)).toEqual([2, 5, 11]);
  });

  it('publishes the frozen browser API on globalThis', () => {
    expect(globalThis.StudentWallet).toBe(StudentWallet);
    expect(Object.isFrozen(StudentWallet)).toBe(true);
  });
});

describe('student wallet fail-closed and W1 guards', () => {
  it('refuses wallet creation without crypto.getRandomValues', async () => {
    await expect(
      createWallet({ crypto: { subtle: webcrypto.subtle } }),
    ).rejects.toThrow(/getRandomValues/);
  });

  it('refuses wallet derivation without the Web Crypto subtle API', async () => {
    const randomOnly = {
      getRandomValues(bytes) {
        bytes.fill(0);
        return bytes;
      },
    };
    await expect(createWallet({ crypto: randomOnly })).rejects.toThrow(
      /subtle/i,
    );
    await expect(
      mnemonicToSeed(OFFICIAL_VECTORS[0].mnemonic, '', randomOnly),
    ).rejects.toThrow(/subtle/i);
  });

  it('has no dependency, network, persistence, or logging sinks', async () => {
    const modulePath = resolve(process.cwd(), 'js/student-wallet.js');
    const source = await readFile(modulePath, 'utf8');

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b|\bWebSocket\b/);
    expect(source).not.toMatch(/\bsendBeacon\s*\(/);
    expect(source).not.toMatch(
      /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
    );
    expect(source).not.toMatch(/\bcaches\s*\.\s*(?:open|put|add)\s*\(/);
    expect(source).not.toMatch(/\bconsole\s*\./);
  });
});

// Teacher-only wallet generation and WIF validation; no network requests.
// SHA-256 uses Web Crypto. RIPEMD-160 and secp256k1 arithmetic below are copied
// from the repository's vector-tested js/student-wallet.js; no mnemonic handling
// or student-wallet ceremony is included.
(function (root) {
  'use strict';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const NETWORKS = Object.freeze({
  mainnet: Object.freeze({ p2pkh: 0x1e, wif: 0x9e }),
  testnet: Object.freeze({ p2pkh: 0x71, wif: 0xf1 }),
});

function requireWebCrypto(cryptoProvider) {
  if (typeof cryptoProvider?.subtle?.digest !== 'function') {
    throw new Error('Web Crypto digest API is required');
  }
  return cryptoProvider;
}

const SECP256K1_P =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_G = Object.freeze([
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
]);


const RIPEMD_LEFT_WORD = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
]);
const RIPEMD_RIGHT_WORD = Object.freeze([
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
]);
const RIPEMD_LEFT_ROTATION = Object.freeze([
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
]);
const RIPEMD_RIGHT_ROTATION = Object.freeze([
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
]);
const RIPEMD_LEFT_CONSTANT = Object.freeze([
  0x00000000,
  0x5a827999,
  0x6ed9eba1,
  0x8f1bbcdc,
  0xa953fd4e,
]);
const RIPEMD_RIGHT_CONSTANT = Object.freeze([
  0x50a28be6,
  0x5c4dd124,
  0x6d703ef3,
  0x7a6d76e9,
  0x00000000,
]);

function asByteArray(value, label) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }

  if (!ArrayBuffer.isView(value)) {
    throw new TypeError(label + ' must be an ArrayBuffer or typed array.');
  }

  return new Uint8Array(
    value.buffer,
    value.byteOffset,
    value.byteLength,
  ).slice();
}

function joinBytes(...parts) {
  const byteParts = parts.map((part) => asByteArray(part, 'Byte input'));
  const length = byteParts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;

  for (const part of byteParts) {
    joined.set(part, offset);
    offset += part.length;
    wipeBytes(part);
  }

  return joined;
}

function bigIntFromBytes(bytes) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function bytesFromBigInt(value, length) {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new TypeError('The integer must be a non-negative bigint.');
  }

  const bytes = new Uint8Array(length);
  let remaining = value;

  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  if (remaining !== 0n) {
    wipeBytes(bytes);
    throw new RangeError('The integer does not fit in the requested byte length.');
  }

  return bytes;
}

function wipeBytes(value) {
  if (value instanceof ArrayBuffer) {
    new Uint8Array(value).fill(0);
    return;
  }

  if (ArrayBuffer.isView(value)) {
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(0);
  }
}

async function sha256Bytes(input, cryptoProvider) {
  const cryptoApi = requireWebCrypto(cryptoProvider);
  const bytes = asByteArray(input, 'SHA-256 input');

  try {
    return new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
  } finally {
    wipeBytes(bytes);
  }
}

function rotateLeft32(value, count) {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

function ripemdRoundValue(round, x, y, z) {
  if (round < 16) {
    return (x ^ y ^ z) >>> 0;
  }
  if (round < 32) {
    return ((x & y) | (~x & z)) >>> 0;
  }
  if (round < 48) {
    return ((x | ~y) ^ z) >>> 0;
  }
  if (round < 64) {
    return ((x & z) | (y & ~z)) >>> 0;
  }
  return (x ^ (y | ~z)) >>> 0;
}

function ripemd160Bytes(input) {
  const bytes = asByteArray(input, 'RIPEMD-160 input');
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = BigInt(bytes.length) * 8n;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(
    paddedLength - 8,
    Number(bitLength & 0xffffffffn),
    true,
  );
  paddedView.setUint32(
    paddedLength - 4,
    Number((bitLength >> 32n) & 0xffffffffn),
    true,
  );

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  try {
    for (let offset = 0; offset < padded.length; offset += 64) {
      const words = new Uint32Array(16);
      for (let index = 0; index < words.length; index += 1) {
        words[index] = paddedView.getUint32(offset + index * 4, true);
      }

      let al = h0;
      let bl = h1;
      let cl = h2;
      let dl = h3;
      let el = h4;
      let ar = h0;
      let br = h1;
      let cr = h2;
      let dr = h3;
      let er = h4;

      for (let round = 0; round < 80; round += 1) {
        const leftRound = Math.floor(round / 16);
        const leftSum = (
          al +
          ripemdRoundValue(round, bl, cl, dl) +
          words[RIPEMD_LEFT_WORD[round]] +
          RIPEMD_LEFT_CONSTANT[leftRound]
        ) >>> 0;
        const leftNext = (
          rotateLeft32(leftSum, RIPEMD_LEFT_ROTATION[round]) + el
        ) >>> 0;
        al = el;
        el = dl;
        dl = rotateLeft32(cl, 10);
        cl = bl;
        bl = leftNext;

        const rightRound = Math.floor(round / 16);
        const rightSum = (
          ar +
          ripemdRoundValue(79 - round, br, cr, dr) +
          words[RIPEMD_RIGHT_WORD[round]] +
          RIPEMD_RIGHT_CONSTANT[rightRound]
        ) >>> 0;
        const rightNext = (
          rotateLeft32(rightSum, RIPEMD_RIGHT_ROTATION[round]) + er
        ) >>> 0;
        ar = er;
        er = dr;
        dr = rotateLeft32(cr, 10);
        cr = br;
        br = rightNext;
      }

      const nextH0 = (h1 + cl + dr) >>> 0;
      const nextH1 = (h2 + dl + er) >>> 0;
      const nextH2 = (h3 + el + ar) >>> 0;
      const nextH3 = (h4 + al + br) >>> 0;
      const nextH4 = (h0 + bl + cr) >>> 0;
      h0 = nextH0;
      h1 = nextH1;
      h2 = nextH2;
      h3 = nextH3;
      h4 = nextH4;
      wipeBytes(words);
    }

    const digest = new Uint8Array(20);
    const digestView = new DataView(digest.buffer);
    digestView.setUint32(0, h0, true);
    digestView.setUint32(4, h1, true);
    digestView.setUint32(8, h2, true);
    digestView.setUint32(12, h3, true);
    digestView.setUint32(16, h4, true);
    return digest;
  } finally {
    wipeBytes(bytes);
    wipeBytes(padded);
  }
}

async function hash160Bytes(input, cryptoProvider) {
  const shaDigest = await sha256Bytes(input, cryptoProvider);
  try {
    return ripemd160Bytes(shaDigest);
  } finally {
    wipeBytes(shaDigest);
  }
}

function base58EncodeBytes(input) {
  const bytes = asByteArray(input, 'Base58 input');
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }

  let value = bigIntFromBytes(bytes);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }

  wipeBytes(bytes);
  return '1'.repeat(leadingZeros) + encoded;
}

async function base58Check(payloadInput, cryptoProvider) {
  const payload = asByteArray(payloadInput, 'Base58Check payload');
  let firstHash;
  let secondHash;
  let encoded;

  try {
    firstHash = await sha256Bytes(payload, cryptoProvider);
    secondHash = await sha256Bytes(firstHash, cryptoProvider);
    encoded = joinBytes(payload, secondHash.subarray(0, 4));
    return base58EncodeBytes(encoded);
  } finally {
    wipeBytes(payload);
    wipeBytes(firstHash);
    wipeBytes(secondHash);
    wipeBytes(encoded);
  }
}

function modP(value) {
  const result = value % SECP256K1_P;
  return result >= 0n ? result : result + SECP256K1_P;
}

function invertModP(value) {
  const normalized = modP(value);
  if (normalized === 0n) {
    throw new RangeError('Cannot invert zero on the secp256k1 field.');
  }

  let exponent = SECP256K1_P - 2n;
  let base = normalized;
  let inverse = 1n;

  while (exponent > 0n) {
    if ((exponent & 1n) === 1n) {
      inverse = modP(inverse * base);
    }
    base = modP(base * base);
    exponent >>= 1n;
  }

  return inverse;
}

function doubleCurvePoint(point) {
  if (point === null || point[1] === 0n) {
    return null;
  }

  const [x, y] = point;
  const slope = modP(3n * x * x * invertModP(2n * y));
  const nextX = modP(slope * slope - 2n * x);
  const nextY = modP(slope * (x - nextX) - y);
  return [nextX, nextY];
}

function addCurvePoints(left, right) {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }

  const [leftX, leftY] = left;
  const [rightX, rightY] = right;

  if (leftX === rightX) {
    if (leftY !== rightY) {
      return null;
    }
    return doubleCurvePoint(left);
  }

  const slope = modP(
    (rightY - leftY) * invertModP(rightX - leftX),
  );
  const nextX = modP(slope * slope - leftX - rightX);
  const nextY = modP(slope * (leftX - nextX) - leftY);
  return [nextX, nextY];
}

function multiplyGenerator(scalar) {
  if (scalar <= 0n || scalar >= SECP256K1_N) {
    throw new RangeError('The secp256k1 private scalar is out of range.');
  }

  let remaining = scalar;
  let addend = SECP256K1_G;
  let result = null;

  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = addCurvePoints(result, addend);
    }
    addend = doubleCurvePoint(addend);
    remaining >>= 1n;
  }

  return result;
}

function base58DecodeBytes(value) {
  let scalar = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid base58 character');
    scalar = scalar * 58n + BigInt(digit);
  }
  const bytes = [];
  while (scalar > 0n) {
    bytes.unshift(Number(scalar & 255n));
    scalar >>= 8n;
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === '1') zeros++;
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}

async function base58CheckDecode(value) {
  const full = base58DecodeBytes(value);
  let firstHash;
  let secondHash;
  try {
    if (full.length < 5) throw new Error('Invalid base58check length');
    const payload = full.subarray(0, full.length - 4);
    const checksum = full.subarray(full.length - 4);
    firstHash = await sha256Bytes(payload, root.crypto);
    secondHash = await sha256Bytes(firstHash, root.crypto);
    let difference = 0;
    for (let i = 0; i < 4; i++) difference |= checksum[i] ^ secondHash[i];
    if (difference !== 0) throw new Error('Invalid checksum');
    return payload.slice();
  } finally {
    wipeBytes(full);
    wipeBytes(firstHash);
    wipeBytes(secondHash);
  }
}

function publicKeyFromScalar(scalar, compressed) {
  const point = multiplyGenerator(scalar);
  const publicKey = new Uint8Array(compressed ? 33 : 65);
  publicKey[0] = compressed ? (point[1] % 2n === 0n ? 0x02 : 0x03) : 0x04;
  publicKey.set(bytesFromBigInt(point[0], 32), 1);
  if (!compressed) publicKey.set(bytesFromBigInt(point[1], 32), 33);
  return publicKey;
}

async function decodeWIF(wif, { network = 'mainnet' } = {}) {
  if (network !== 'mainnet' && network !== 'testnet') throw new Error('Invalid Dogecoin network');
  if (typeof wif !== 'string' || wif.length > 128) throw new Error('Invalid WIF');
  const normalized = wif.trim();
  if (normalized.length !== 51 && normalized.length !== 52) throw new Error('Invalid WIF length');

  const payload = await base58CheckDecode(normalized);
  let publicKey;
  let publicKeyHash;
  let addressPayload;
  try {
    if (payload.length !== 33 && payload.length !== 34) throw new Error('Invalid WIF payload');
    const net = NETWORKS[network];
    if (payload[0] !== net.wif) throw new Error('Invalid WIF network');
    const compressed = payload.length === 34;
    if (compressed && payload[33] !== 0x01) throw new Error('Invalid WIF compression flag');
    const scalar = bigIntFromBytes(payload.subarray(1, 33));
    if (scalar <= 0n || scalar >= SECP256K1_N) throw new Error('Invalid WIF private scalar');

    publicKey = publicKeyFromScalar(scalar, compressed);
    publicKeyHash = await hash160Bytes(publicKey, root.crypto);
    addressPayload = joinBytes(new Uint8Array([net.p2pkh]), publicKeyHash);
    const address = await base58Check(addressPayload, root.crypto);
    return { address, compressed, network };
  } finally {
    wipeBytes(payload);
    wipeBytes(publicKey);
    wipeBytes(publicKeyHash);
    wipeBytes(addressPayload);
  }
}

async function addressFromWIF(wif, options) {
  return (await decodeWIF(wif, options)).address;
}

async function generateWallet({ random } = {}) {
  const cryptoApi = requireWebCrypto(root.crypto);
  if (root.isSecureContext === false || (random === undefined && typeof cryptoApi.getRandomValues !== 'function')) {
    throw new Error('Wallet generation requires secure Web Crypto randomness (HTTPS or localhost).');
  }
  // The injection is for deterministic tests; production always uses Web Crypto.
  const draw = random === undefined ? bytes => cryptoApi.getRandomValues(bytes) : random;
  if (typeof draw !== 'function') throw new Error('A secure random byte provider is required.');

  const privateBytes = new Uint8Array(32);
  let scalar = 0n, publicKey, publicKeyHash, addressPayload, wifPayload;
  try {
    do {
      wipeBytes(privateBytes);
      draw(privateBytes);
      scalar = bigIntFromBytes(privateBytes);
    } while (scalar <= 0n || scalar >= SECP256K1_N);

    publicKey = publicKeyFromScalar(scalar, true);
    publicKeyHash = await hash160Bytes(publicKey, cryptoApi);
    addressPayload = joinBytes(new Uint8Array([NETWORKS.mainnet.p2pkh]), publicKeyHash);
    const address = await base58Check(addressPayload, cryptoApi);
    wifPayload = joinBytes(new Uint8Array([NETWORKS.mainnet.wif]), privateBytes, new Uint8Array([1]));
    const wif = await base58Check(wifPayload, cryptoApi);
    if ((await decodeWIF(wif)).address !== address) {
      throw new Error('Generated wallet self-check failed.');
    }
    return { address, wif };
  } finally {
    scalar = 0n;
    wipeBytes(privateBytes);
    wipeBytes(publicKey);
    wipeBytes(publicKeyHash);
    wipeBytes(addressPayload);
    wipeBytes(wifPayload);
  }
}

root.DogeKeys = Object.freeze({ decodeWIF, addressFromWIF, generateWallet });
})(typeof window !== 'undefined' ? window : globalThis);

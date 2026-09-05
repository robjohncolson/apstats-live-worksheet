// Shared Dogecoin encodings and WIF validation. Crypto uses Node built-ins.
// decodeWIF returns public metadata only; errors never include key input.
import crypto from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export const NETWORKS = Object.freeze({
  mainnet: Object.freeze({ p2pkh: 0x1e, wif: 0x9e, label: 'Dogecoin' }),
  testnet: Object.freeze({ p2pkh: 0x71, wif: 0xf1, label: 'Dogecoin testnet' }),
});

export function base58encode(buf) {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of buf) num = num * 256n + BigInt(b);
  let out = '';
  while (num > 0n) {
    out = B58[Number(num % 58n)] + out;
    num /= 58n;
  }
  return '1'.repeat(zeros) + out;
}

export function base58decode(str) {
  if (typeof str !== 'string') throw new Error('Invalid base58 input');
  let num = 0n;
  for (const ch of str) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base58 character');
    num = num * 58n + BigInt(idx);
  }
  const bytes = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  return Buffer.from([...new Array(zeros).fill(0), ...bytes]);
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
const dsha256 = (b) => sha256(sha256(b));
export const hash160 = (b) => crypto.createHash('ripemd160').update(sha256(b)).digest();

export function base58check(payload) {
  return base58encode(Buffer.concat([payload, dsha256(payload).subarray(0, 4)]));
}

export function base58checkDecode(str) {
  const full = base58decode(str);
  try {
    if (full.length < 5) throw new Error('Invalid base58check length');
    const payload = full.subarray(0, full.length - 4);
    const checksum = full.subarray(full.length - 4);
    const expected = dsha256(payload).subarray(0, 4);
    if (!crypto.timingSafeEqual(checksum, expected)) throw new Error('Invalid checksum');
    return Buffer.from(payload);
  } finally {
    full.fill(0);
  }
}

export function deriveAddress(pubkey, version) {
  return base58check(Buffer.concat([Buffer.from([version]), hash160(pubkey)]));
}

export function deriveWIF(priv32, version, compressed = true) {
  const parts = [Buffer.from([version]), priv32];
  if (compressed) parts.push(Buffer.from([0x01]));
  return base58check(Buffer.concat(parts));
}

export function decodeWIF(wif, { network = 'mainnet' } = {}) {
  if (network !== 'mainnet' && network !== 'testnet') throw new Error('Invalid Dogecoin network');
  if (typeof wif !== 'string' || wif.length > 128) throw new Error('Invalid WIF');
  const normalized = wif.trim();
  if (normalized.length !== 51 && normalized.length !== 52) throw new Error('Invalid WIF length');

  const payload = base58checkDecode(normalized);
  try {
    if (payload.length !== 33 && payload.length !== 34) throw new Error('Invalid WIF payload');
    const net = NETWORKS[network];
    if (payload[0] !== net.wif) throw new Error('Invalid WIF network');
    const compressed = payload.length === 34;
    if (compressed && payload[33] !== 0x01) throw new Error('Invalid WIF compression flag');

    const privateKey = payload.subarray(1, 33);
    const scalar = BigInt('0x' + privateKey.toString('hex'));
    if (scalar <= 0n || scalar >= SECP256K1_N) throw new Error('Invalid WIF private scalar');
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(privateKey);
    const publicKey = ecdh.getPublicKey(null, compressed ? 'compressed' : 'uncompressed');
    return { address: deriveAddress(publicKey, net.p2pkh), compressed, network };
  } finally {
    payload.fill(0);
  }
}

export function addressFromWIF(wif, options) {
  return decodeWIF(wif, options).address;
}

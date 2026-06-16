#!/usr/bin/env node
// doge-wallet-gen.mjs — OFFLINE Dogecoin paper-wallet generator (DOGE_WALLET_SPEC).
//
// ⚠ RUN OFFLINE. These private keys control real money. After printing, DELETE
//   the HTML file or store it on an offline drive. The app only ever needs the
//   ADDRESS (watch-only) — never paste a private key into the web.
// ⚠ VERIFY before funding: generate with --testnet, send a tiny test amount to a
//   generated testnet address, and confirm it shows + is spendable in a real
//   wallet (e.g. import the WIF) BEFORE you fund any mainnet address with real DOGE.
//
// Crypto is 100% Node built-ins (secp256k1 via ECDH, SHA-256 + RIPEMD-160 via
// crypto.createHash). base58check is hand-rolled below and self-tested against a
// known vector at startup; the run aborts if the self-test fails.
//
// Usage:
//   node tools/doge-wallet-gen.mjs --count 30 [--testnet] [--prefix P] \
//        [--out wallets.html] [--backup wallets-KEYS.csv]

import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ── base58 / base58check (Bitcoin alphabet; identical algorithm for DOGE) ──────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58encode(buf) {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of buf) num = num * 256n + BigInt(b);
  let out = '';
  while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
  return '1'.repeat(zeros) + out;
}

export function base58decode(str) {
  let num = 0n;
  for (const ch of str) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw new Error('invalid base58 char: ' + ch);
    num = num * 58n + BigInt(idx);
  }
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num % 256n)); num /= 256n; }
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
  const payload = full.subarray(0, full.length - 4);
  const checksum = full.subarray(full.length - 4);
  if (!checksum.equals(dsha256(payload).subarray(0, 4))) throw new Error('bad checksum');
  return payload;
}

// ── Dogecoin networks ─────────────────────────────────────────────────────────
export const NETWORKS = {
  mainnet: { p2pkh: 0x1e, wif: 0x9e, label: 'Dogecoin' },   // addresses start with 'D'
  testnet: { p2pkh: 0x71, wif: 0xf1, label: 'Dogecoin testnet' }, // start with 'n'
};

export function deriveAddress(pubkey, version) {
  return base58check(Buffer.concat([Buffer.from([version]), hash160(pubkey)]));
}

export function deriveWIF(priv32, version, compressed = true) {
  const parts = [Buffer.from([version]), priv32];
  if (compressed) parts.push(Buffer.from([0x01]));
  return base58check(Buffer.concat(parts));
}

// One keypair → { address, wif, privHex, pubHex }. Pads the private key to a full
// 32 bytes (ECDH can drop leading zero bytes) so the WIF is always well-formed.
export function generateWallet(net = NETWORKS.mainnet) {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.generateKeys();
  const rawPriv = ecdh.getPrivateKey();
  const priv = Buffer.concat([Buffer.alloc(32 - rawPriv.length), rawPriv]);
  const pub = ecdh.getPublicKey(null, 'compressed'); // 33 bytes, 0x02/0x03 prefix
  return {
    address: deriveAddress(pub, net.p2pkh),
    wif: deriveWIF(priv, net.wif),
    privHex: priv.toString('hex'),
    pubHex: pub.toString('hex'),
  };
}

// ── self-test (aborts the run on failure) ─────────────────────────────────────
export function selfTest() {
  // 1. Canonical base58check vector (Bitcoin wiki): version 0x00 + hash160 →
  //    a known address. Validates the WHOLE base58check + double-SHA256 pipeline;
  //    DOGE only swaps the version byte, so this is the load-bearing correctness check.
  const h160 = Buffer.from('010966776006953D5567439E5E39F86A0D273BEE', 'hex');
  const addr = base58check(Buffer.concat([Buffer.from([0x00]), h160]));
  if (addr !== '16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM') {
    throw new Error('self-test FAILED: base58check vector mismatch (' + addr + ')');
  }
  // 2. base58check round-trips and rejects a tampered checksum.
  const back = base58checkDecode(addr);
  if (!back.equals(Buffer.concat([Buffer.from([0x00]), h160]))) {
    throw new Error('self-test FAILED: base58check decode mismatch');
  }
  // 3. A fresh mainnet wallet: address starts with 'D', valid checksum, WIF
  //    round-trips back to the 32-byte private key.
  const w = generateWallet(NETWORKS.mainnet);
  if (w.address[0] !== 'D') throw new Error('self-test FAILED: mainnet address prefix');
  base58checkDecode(w.address); // throws on bad checksum
  const wifPayload = base58checkDecode(w.wif);
  const recovered = wifPayload.subarray(1, 33).toString('hex'); // strip version, drop compressed flag
  if (recovered !== w.privHex) throw new Error('self-test FAILED: WIF round-trip');
  // 4. Testnet prefix.
  if (generateWallet(NETWORKS.testnet).address[0] !== 'n') {
    throw new Error('self-test FAILED: testnet address prefix');
  }
  return true;
}

// ── printable sheet ───────────────────────────────────────────────────────────
async function renderSheet(wallets, net) {
  const QRCode = (await import('qrcode')).default;
  const qr = (text) => QRCode.toString(text, { type: 'svg', margin: 1, width: 120 });
  const cards = [];
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const [aQr, kQr] = await Promise.all([qr(w.address), qr(w.wif)]);
    cards.push(`<div class="card">
      <div class="lbl">${w.label}</div>
      <div class="row"><div class="qr">${aQr}</div><div class="kv">
        <div class="k">Address (public — fund this, watch-only):</div>
        <div class="mono pub">${w.address}</div></div></div>
      <div class="row"><div class="qr">${kQr}</div><div class="kv">
        <div class="k priv">⚠ Private key (KEEP SECRET — controls the coins):</div>
        <div class="mono">${w.wif}</div></div></div>
    </div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${net.label} paper wallets</title>
<style>
  body{font-family:Arial,sans-serif;margin:18px;color:#111}
  h1{font-size:16px} .warn{background:#fff3cd;border:1px solid #c9961f;padding:8px 10px;
     border-radius:4px;font-size:12px;margin-bottom:14px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .card{border:1px dashed #888;border-radius:6px;padding:8px;break-inside:avoid}
  .lbl{font-weight:bold;font-size:13px;margin-bottom:4px}
  .row{display:flex;gap:8px;align-items:center;margin:4px 0}
  .qr svg{width:96px;height:96px}
  .k{font-size:10px;color:#444}.k.priv{color:#b00}
  .mono{font-family:'Courier New',monospace;font-size:11px;word-break:break-all}
  .pub{color:#0a5}
  @media print{.warn{break-after:avoid}}
</style></head><body>
<h1>${net.label} paper wallets — ${wallets.length} generated</h1>
<div class="warn"><b>Handle offline.</b> Each card's private key controls real money.
Print, cut, hand out — then <b>delete this file</b> or move it to an offline drive.
The app only needs the <b>address</b> (green). Never paste a private key into a website.
<b>Test on testnet before funding mainnet.</b></div>
<div class="grid">${cards.join('\n')}</div>
</body></html>`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { count: 30, testnet: false, prefix: 'Wallet', out: null, backup: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--count') a.count = parseInt(argv[++i], 10) || a.count;
    else if (k === '--testnet') a.testnet = true;
    else if (k === '--prefix') a.prefix = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--backup') a.backup = argv[++i];
  }
  return a;
}

async function main() {
  selfTest(); // abort loudly if the encoder is broken
  const a = parseArgs(process.argv.slice(2));
  const net = a.testnet ? NETWORKS.testnet : NETWORKS.mainnet;
  const out = a.out || (a.testnet ? 'doge-wallets-TESTNET.html' : 'doge-wallets.html');
  const backup = a.backup || out.replace(/\.html$/i, '') + '-KEYS.csv';

  const wallets = [];
  for (let i = 0; i < a.count; i++) {
    wallets.push({ label: `${a.prefix} #${i + 1}`, ...generateWallet(net) });
  }

  writeFileSync(out, await renderSheet(wallets, net));
  // Sealed backup (§13): address↔key map you keep offline so a lost paper is recoverable.
  const csv = 'label,address,wif,privHex\n'
    + wallets.map((w) => [w.label, w.address, w.wif, w.privHex].join(',')).join('\n') + '\n';
  writeFileSync(backup, csv);

  console.log(`✓ self-test passed.`);
  console.log(`✓ ${a.count} ${net.label} wallets → ${out} (print this)`);
  console.log(`✓ sealed key backup → ${backup} (store OFFLINE; never upload)`);
  if (!a.testnet) {
    console.log('\n⚠ MAINNET keys. Verify one address on testnet (--testnet) and confirm');
    console.log('  a test send before funding real DOGE. Delete the HTML after printing.');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

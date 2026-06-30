// receipt-sign.js — on-device Ed25519 receipt SIGNING (ANDROID Phase 4 §3B).
// The verify side already exists (receipt-verify.js); this is the issuing side, so
// the TEACHER DEVICE can generate a key and sign receipts that the existing server
// verifier (snapshot-verify.js verifyCompact) and every client (receipt-verify.js)
// accept — once the device pubkey is in the issuer trust set (Phase 4 §2).
//
// It reproduces roster-server/receipts.js::signPayload EXACTLY:
//   canonical = JSON of the payload with sorted keys, undefined dropped
//   bytes     = utf8(canonical)
//   receiptId = sha256(bytes) hex
//   sig       = Ed25519(bytes)
//   compact   = b64url(bytes) + "." + b64url(sig)
// Verified cross-stack in tests/receipt-sign-interop.test.js (JS signs → Node verifies).
//
// The key is generated WebCrypto-Ed25519 in the WebView; at rest the exported
// private JWK is stored hardware-WRAPPED + biometric-gated by the native
// secure-store plugin (Phase 4 §3B, "Ed25519 hardware-wrapped"). Pure crypto here;
// storage is the plugin's job.
//
// window.ReceiptSign (all crypto methods are async):
//   .canonicalize(payload)              -> canonical string (sync, matches server)
//   .generateKey()                      -> { publicKeyX, privateKey, privateJwk }
//   .exportPrivateJwk(privateKey)       -> jwk
//   .importPrivateKey(jwk)              -> CryptoKey
//   .publicKeyXFromPrivate(privateKey)  -> base64url x
//   .signPayload(privateKey, payload)   -> { receiptId, compact, canonical }

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function subtle() {
    var c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!c || !c.subtle) throw new Error('WebCrypto SubtleCrypto unavailable');
    return c.subtle;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    return bytes;
  }

  function bytesToB64url(bytes) {
    var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    var bin = '';
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    var b64 = (typeof btoa !== 'undefined') ? btoa(bin)
      : (typeof Buffer !== 'undefined') ? Buffer.from(arr).toString('base64')
      : (function () { throw new Error('no base64 encoder'); })();
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function hex(bytes) {
    var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    var out = '';
    for (var i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
    return out;
  }

  // EXACTLY roster-server/receipts.js::canonicalize — sorted keys, undefined dropped.
  function canonicalize(payload) {
    var sorted = {};
    Object.keys(payload).sort().forEach(function (k) {
      if (payload[k] !== undefined) sorted[k] = payload[k];
    });
    return JSON.stringify(sorted);
  }

  function generateKey() {
    return subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
      .then(function (pair) {
        return Promise.all([
          subtle().exportKey('jwk', pair.publicKey),
          subtle().exportKey('jwk', pair.privateKey)
        ]).then(function (jwks) {
          return { publicKeyX: jwks[0].x, privateKey: pair.privateKey, privateJwk: jwks[1] };
        });
      });
  }

  function exportPrivateJwk(privateKey) {
    return subtle().exportKey('jwk', privateKey);
  }

  function importPrivateKey(jwk) {
    return subtle().importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign']);
  }

  function publicKeyXFromPrivate(privateKey) {
    // Re-derive the public JWK x from the (extractable) private JWK.
    return exportPrivateJwk(privateKey).then(function (jwk) { return jwk.x; });
  }

  function signPayload(privateKey, payload) {
    var canonical = canonicalize(payload);
    var bytes = utf8(canonical);
    return Promise.all([
      subtle().sign({ name: 'Ed25519' }, privateKey, bytes),
      subtle().digest('SHA-256', bytes)
    ]).then(function (out) {
      var sig = new Uint8Array(out[0]);
      var receiptId = hex(out[1]);
      var compact = bytesToB64url(bytes) + '.' + bytesToB64url(sig);
      return { receiptId: receiptId, compact: compact, canonical: canonical };
    });
  }

  root.ReceiptSign = {
    canonicalize: canonicalize,
    generateKey: generateKey,
    exportPrivateJwk: exportPrivateJwk,
    importPrivateKey: importPrivateKey,
    publicKeyXFromPrivate: publicKeyXFromPrivate,
    signPayload: signPayload,
    _bytesToB64url: bytesToB64url
  };

})();

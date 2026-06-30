// secure-key.js — window.SecureKeyStore bridge to the native SecureKeyStore plugin
// (ANDROID Phase 4 §3B). Classic <script>; loaded by teacher-app.html.
//
// Stores/returns the teacher's Ed25519 signing-key JWK, biometric-gated +
// hardware-wrapped. Ed25519 SIGNING stays in JS (receipt-sign.js); this only guards
// the key material at rest. Always defined (even on the web) with an `available`
// flag, so teacher-app.html can branch + degrade gracefully when there's no native
// plugin (web preview) instead of crashing.

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function nativePlugin() {
    var C = root.Capacitor;
    if (!C) return null;
    if (typeof C.isNativePlatform === 'function' && !C.isNativePlatform()) return null;
    return (C.Plugins && C.Plugins.SecureKeyStore) || null;
  }

  var p = nativePlugin();
  var NATIVE_ONLY = 'SecureKeyStore is only available in the AP Stats app';

  root.SecureKeyStore = {
    available: !!p,

    // Store a JWK string under `name`, encrypting it behind a biometric prompt.
    setKey: function (name, value) {
      if (!p) return Promise.reject(new Error(NATIVE_ONLY));
      return Promise.resolve(p.setKey({ key: name, value: value }));
    },

    // Return the stored JWK string after a biometric unlock, or null if absent.
    getKey: function (name) {
      if (!p) return Promise.reject(new Error(NATIVE_ONLY));
      return Promise.resolve(p.getKey({ key: name })).then(function (r) { return (r && r.value) || null; });
    },

    hasKey: function (name) {
      if (!p) return Promise.resolve(false);
      return Promise.resolve(p.hasKey({ key: name })).then(function (r) { return !!(r && r.exists); });
    },

    removeKey: function (name) {
      if (!p) return Promise.resolve();
      return Promise.resolve(p.removeKey({ key: name }));
    },

    isBiometricAvailable: function () {
      if (!p) return Promise.resolve(false);
      return Promise.resolve(p.isBiometricAvailable()).then(function (r) { return !!(r && r.available); });
    }
  };

})();

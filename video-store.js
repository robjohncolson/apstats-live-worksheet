// video-store.js — Capacitor Filesystem storage adapter for VideoOnDemand
// (ANDROID Phase 5). Stores downloaded videos under Data/videos/<file> and resolves
// a WebView-playable URI via Capacitor.convertFileSrc. Sets window.VideoOnDemand._store.
// On the web (no Capacitor Filesystem) it stays inert and VideoOnDemand degrades.
//
// Adapter contract: has(key)->Promise<bool>, uri(key)->Promise<string|null>,
//   write(key, blob)->Promise, remove(key)->Promise.

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var DIR = 'DATA';      // Capacitor Directory.Data
  var SUB = 'videos';

  function fs() {
    var C = root.Capacitor;
    return (C && C.Plugins && C.Plugins.Filesystem) || null;
  }
  function p(key) { return SUB + '/' + key; }

  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      try {
        var fr = new FileReader();
        fr.onloadend = function () { var s = String(fr.result || ''); res(s.slice(s.indexOf(',') + 1)); };
        fr.onerror = function () { rej(new Error('read failed')); };
        fr.readAsDataURL(blob);
      } catch (e) { rej(e); }
    });
  }

  var store = {
    has: function (key) {
      var f = fs(); if (!f) return Promise.resolve(false);
      return f.stat({ path: p(key), directory: DIR }).then(function () { return true; }).catch(function () { return false; });
    },
    size: function (key) {
      var f = fs(); if (!f) return Promise.resolve(0);
      return f.stat({ path: p(key), directory: DIR }).then(function (s) { return Number(s && s.size) || 0; }).catch(function () { return 0; });
    },
    uri: function (key) {
      var f = fs(); if (!f) return Promise.resolve(null);
      return f.getUri({ path: p(key), directory: DIR }).then(function (r) {
        var u = r && r.uri;
        return (root.Capacitor && typeof root.Capacitor.convertFileSrc === 'function') ? root.Capacitor.convertFileSrc(u) : u;
      });
    },
    write: function (key, blob) {
      var f = fs(); if (!f) return Promise.reject(new Error('no Filesystem'));
      // Stage to a .part temp, then rename to the final key only after the write
      // fully lands — so a killed/interrupted download leaves a .part orphan that
      // has() never sees as 'downloaded' (it would otherwise play a corrupt partial).
      var tmp = p(key) + '.part';
      return blobToBase64(blob).then(function (b64) {
        return f.writeFile({ path: tmp, data: b64, directory: DIR, recursive: true });
      }).then(function () {
        return f.deleteFile({ path: p(key), directory: DIR }).catch(function () {}); // clear a stale final, if any
      }).then(function () {
        return f.rename({ from: tmp, to: p(key), directory: DIR, toDirectory: DIR });
      });
    },
    remove: function (key) {
      var f = fs(); if (!f) return Promise.resolve();
      return f.deleteFile({ path: p(key), directory: DIR }).catch(function () {});
    }
  };

  root.VideoStore = store;
  if (root.VideoOnDemand) root.VideoOnDemand._store = store;

})();

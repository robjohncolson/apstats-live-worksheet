// offline-video.js — OFFLINE_MODE_SPEC §4.H. In an OFFLINE_MODE pack, resolve a
// lesson video's network URL (apclassroom or the Drive altUrl) to the bundled
// local file via media-manifest.json and play it in a local <video> overlay.
// Pure browser IIFE → window.OfflineVideo. No-ops cleanly when not offline / no
// manifest / no local copy (the caller then keeps the normal network link).
//
//   OfflineVideo.localFor(url)  → 'media/…' local path, or null
//   OfflineVideo.open(file, label) → play a local file in an Esc-closable overlay
//   OfflineVideo.load()         → (re)load media-manifest.json (auto-runs on load)

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var STATE = { ready: false, map: {} };

  function load() {
    try {
      if (!root.OFFLINE_MODE || typeof root.fetch !== 'function') { STATE.ready = true; return Promise.resolve(); }
      return root.fetch('media-manifest.json', { cache: 'no-store' })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (m) { STATE.map = (m && m.byUrl) || {}; STATE.ready = true; })
        .catch(function () { STATE.ready = true; });
    } catch (_) { STATE.ready = true; return Promise.resolve(); }
  }

  function localFor(url) {
    try {
      if (!url) return null;
      var rec = STATE.map[url];
      return (rec && rec.file) ? rec.file : null;
    } catch (_) { return null; }
  }

  function open(file, label) {
    try {
      if (typeof document === 'undefined' || !document.body || !file) return null;
      var ex = document.getElementById('offline-video-overlay');
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);

      var ov = document.createElement('div');
      ov.id = 'offline-video-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center';

      var vid = document.createElement('video');
      vid.src = file; vid.controls = true; vid.autoplay = true;
      vid.style.cssText = 'max-width:92vw;max-height:80vh;background:#000';

      var bar = document.createElement('div');
      bar.style.cssText = 'color:#fff;font-family:Geneva,Verdana,sans-serif;margin:10px;font-size:13px;display:flex;align-items:center;gap:14px';
      var lbl = document.createElement('span');
      lbl.textContent = (label || 'Video') + ' — offline copy';
      bar.appendChild(lbl);
      var close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Close';
      close.style.cssText = 'font-family:inherit;font-size:13px;cursor:pointer';
      bar.appendChild(close);

      function done() {
        try { vid.pause(); } catch (_) {}
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        document.removeEventListener('keydown', esc);
      }
      function esc(e) { if (e.key === 'Escape') done(); }
      close.addEventListener('click', done);
      ov.addEventListener('click', function (e) { if (e.target === ov) done(); });
      document.addEventListener('keydown', esc);

      ov.appendChild(vid); ov.appendChild(bar);
      document.body.appendChild(ov);
      return ov;
    } catch (_) { return null; }
  }

  root.OfflineVideo = { load: load, localFor: localFor, open: open, _state: STATE };
  load();
})();

// video-ondemand.js — per-unit on-demand video for the Google Play build
// (ANDROID_PHASE5_PLAY_SPEC §2). Play caps the AAB at 150 MB, so video is NOT
// bundled; this downloads a lesson's video from MEDIA_BASE_URL on demand, stores it
// in app storage (window.VideoStore — Capacitor Filesystem), and resolves a playable
// URI. Per-unit download + eviction ("delete old units to free space").
//
// "Play is a flag, not a fork": in a SIDELOAD pack the video is bundled and
// offline-video.js plays it; in a PLAY build (window.PLAY_BUILD) this manager fills
// the same lesson→file resolution by downloading. Catalog + store are INJECTABLE so
// the logic is unit-tested without a device.
//
// Catalog entry: { url (lesson video network url), file (filename = storage key),
//                  unit (number), label, bytes? }.
// window.VideoOnDemand:
//   .setCatalog(entries) / .loadCatalog(url)
//   .resolve(url)            -> {state:'bundled'|'downloaded'|'remote'|'none', playUri?, downloadUrl?, key?, bytes?}
//   .download(url, onProg)   -> Promise<playUri>
//   .downloadUnit(unit, onProg) -> Promise<{downloaded, failed}>
//   .evictUnit(unit)         -> Promise<{removed}>
//   .isDownloaded(url)       -> Promise<bool>
//   .unitsState()            -> Promise<{ [unit]: {total, downloaded, bytes} }>
//   .evictionPlan({currentUnit, keep}) -> [unit, …]  (downloaded units safe to evict)

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var CATALOG = [];
  var BY_URL = {};
  var BY_FILE = {};

  function setCatalog(entries) {
    CATALOG = Array.isArray(entries) ? entries.filter(function (e) { return e && e.url && e.file; }) : [];
    BY_URL = {}; BY_FILE = {};
    CATALOG.forEach(function (e) { BY_URL[e.url] = e; BY_FILE[e.file] = e; });
    return CATALOG.length;
  }
  function loadCatalog(url) {
    if (typeof root.fetch !== 'function') return Promise.resolve(0);
    return root.fetch(url || 'video-catalog.json', { cache: 'no-store' })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (j) { return setCatalog((j && j.videos) || j || []); })
      .catch(function () { return 0; });
  }

  function entryFor(url) { return BY_URL[url] || BY_FILE[url] || null; }
  function mediaBase() { return (typeof root.MEDIA_BASE_URL === 'string' ? root.MEDIA_BASE_URL : '').replace(/\/$/, ''); }
  function isPlayBuild() { return root.PLAY_BUILD === true || root.PLAY_BUILD === '1'; }
  function downloadUrlFor(e) { var b = mediaBase(); return b ? (b + '/' + e.file) : null; }

  // The storage adapter (Capacitor Filesystem by default; injectable for tests).
  function store() {
    return (root.VideoOnDemand && root.VideoOnDemand._store) || root.VideoStore || null;
  }

  function resolve(url) {
    var e = entryFor(url);
    if (!e) return Promise.resolve({ state: 'none', url: url });
    var key = e.file;
    // Bundled sideload pack: the local file is present and offline-video.js maps it.
    if (!isPlayBuild() && root.OfflineVideo && typeof OfflineVideo.localFor === 'function') {
      var local = OfflineVideo.localFor(url);
      if (local) return Promise.resolve({ state: 'bundled', key: key, playUri: local });
    }
    var s = store();
    if (!s) return Promise.resolve({ state: 'remote', key: key, downloadUrl: downloadUrlFor(e), bytes: e.bytes || null, unit: e.unit, label: e.label });
    return Promise.resolve(s.has(key)).then(function (have) {
      if (!have) return { state: 'remote', key: key, downloadUrl: downloadUrlFor(e), bytes: e.bytes || null, unit: e.unit, label: e.label };
      return Promise.resolve(s.uri(key)).then(function (uri) { return { state: 'downloaded', key: key, playUri: uri, bytes: e.bytes || null, unit: e.unit }; });
    });
  }

  function isDownloaded(url) {
    var e = entryFor(url); var s = store();
    if (!e || !s) return Promise.resolve(false);
    return Promise.resolve(s.has(e.file));
  }

  // fetch → blob, reporting progress via the stream reader when available.
  function fetchBlob(dlUrl, onProgress) {
    if (typeof root.fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
    return root.fetch(dlUrl).then(function (res) {
      if (!res || !res.ok) throw new Error('download HTTP ' + (res && res.status));
      var total = Number(res.headers && res.headers.get && res.headers.get('Content-Length')) || 0;
      if (!res.body || !res.body.getReader || typeof onProgress !== 'function') return res.blob();
      var reader = res.body.getReader();
      var chunks = [], loaded = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return new Blob(chunks);
          chunks.push(r.value); loaded += r.value.length;
          try { onProgress(loaded, total); } catch (_) {}
          return pump();
        });
      }
      return pump();
    });
  }

  function download(url, onProgress) {
    var e = entryFor(url);
    if (!e) return Promise.reject(new Error('not in catalog: ' + url));
    var dl = downloadUrlFor(e);
    if (!dl) return Promise.reject(new Error('MEDIA_BASE_URL not set'));
    var s = store();
    if (!s) return Promise.reject(new Error('no VideoStore'));
    return fetchBlob(dl, onProgress)
      .then(function (blob) { return s.write(e.file, blob, e); })
      .then(function () {
        // Integrity guard: a truncated/size-mismatched file is removed + the download
        // rejected, never left for resolve() (which trusts has()) to play. Skipped
        // when the store can't size or the catalog has no expected bytes.
        if (typeof s.size !== 'function' || !e.bytes) return;
        return Promise.resolve(s.size(e.file)).then(function (got) {
          if (got > 0 && got !== Number(e.bytes)) {
            return Promise.resolve(s.remove(e.file)).then(function () { throw new Error('download size mismatch'); });
          }
        });
      })
      .then(function () { return s.uri(e.file); });
  }

  function videosForUnit(unit) {
    return CATALOG.filter(function (e) { return Number(e.unit) === Number(unit); });
  }

  function downloadUnit(unit, onProgress) {
    var vids = videosForUnit(unit);
    var s = store();
    if (!s) return Promise.reject(new Error('no VideoStore'));
    var downloaded = 0, failed = 0, i = 0;
    return vids.reduce(function (chain, e) {
      return chain.then(function () {
        return Promise.resolve(s.has(e.file)).then(function (have) {
          i += 1;
          if (have) { downloaded += 1; return; }
          return download(e.url, function (loaded, total) {
            if (typeof onProgress === 'function') onProgress({ index: i, count: vids.length, file: e.file, loaded: loaded, total: total });
          }).then(function () { downloaded += 1; }, function () { failed += 1; });
        });
      });
    }, Promise.resolve()).then(function () { return { downloaded: downloaded, failed: failed, total: vids.length }; });
  }

  function evictUnit(unit) {
    var vids = videosForUnit(unit);
    var s = store();
    if (!s) return Promise.resolve({ removed: 0 });
    var removed = 0;
    return vids.reduce(function (chain, e) {
      return chain.then(function () {
        return Promise.resolve(s.has(e.file)).then(function (have) {
          if (!have) return;
          return Promise.resolve(s.remove(e.file)).then(function () { removed += 1; }, function () {});
        });
      });
    }, Promise.resolve()).then(function () { return { removed: removed }; });
  }

  function unitsState() {
    var s = store();
    var units = {};
    CATALOG.forEach(function (e) {
      var u = units[e.unit] || (units[e.unit] = { total: 0, downloaded: 0, bytes: 0 });
      u.total += 1;
    });
    if (!s) return Promise.resolve(units);
    return CATALOG.reduce(function (chain, e) {
      return chain.then(function () {
        return Promise.resolve(s.has(e.file)).then(function (have) {
          if (have) { units[e.unit].downloaded += 1; units[e.unit].bytes += (Number(e.bytes) || 0); }
        });
      });
    }, Promise.resolve()).then(function () { return units; });
  }

  // Pure: which DOWNLOADED units are safe to evict — everything except the current
  // unit and `keep` units of adjacency, furthest-from-current first (the teacher's
  // "delete old units to free space"). downloadedUnits = [unit, …].
  function evictionPlan(opts, downloadedUnits) {
    opts = opts || {};
    var cur = Number(opts.currentUnit);
    var keep = (opts.keep == null) ? 1 : Number(opts.keep);
    var dl = (Array.isArray(downloadedUnits) ? downloadedUnits : []).map(Number);
    var safe = dl.filter(function (u) { return isFinite(cur) ? Math.abs(u - cur) > keep : true; });
    safe.sort(function (a, b) { return isFinite(cur) ? (Math.abs(b - cur) - Math.abs(a - cur)) : (b - a); });
    return safe;
  }

  root.VideoOnDemand = {
    setCatalog: setCatalog,
    loadCatalog: loadCatalog,
    entryFor: entryFor,
    downloadUrlFor: downloadUrlFor,
    resolve: resolve,
    isDownloaded: isDownloaded,
    download: download,
    downloadUnit: downloadUnit,
    evictUnit: evictUnit,
    unitsState: unitsState,
    evictionPlan: evictionPlan,
    videosForUnit: videosForUnit,
    _store: null   // tests / video-store.js set this
  };

})();

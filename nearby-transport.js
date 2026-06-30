// nearby-transport.js — registers window.GossipTransport over the native
// GossipNearby Capacitor plugin (ANDROID Phase 3). Classic <script>; loaded by the
// Desk alongside ledger-gossip.js.
//
// Only the APK (which ships the gossip-nearby plugin) exposes a transport. On the
// GH-Pages web Desk there's no native plugin → window.GossipTransport stays
// undefined → the "Sync nearby" affordance is hidden and the gossip layer is inert.
// Nothing here changes web behavior.
//
// GossipTransport contract (consumed by ledger-gossip.js sessions):
//   start({ onPeer(peerId,name), onMessage(peerId,msg), onLost(peerId) }) -> Promise
//   send(peerId, framedMsg) -> Promise
//   stop() -> Promise

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function nativePlugin() {
    var C = root.Capacitor;
    if (!C) return null;
    // isNativePlatform guards out the browser, where Plugins proxies exist but no
    // native impl is wired.
    if (typeof C.isNativePlatform === 'function' && !C.isNativePlatform()) return null;
    var P = C.Plugins && C.Plugins.GossipNearby;
    return P || null;
  }

  var plugin = nativePlugin();
  if (!plugin) return; // web / no plugin → no transport registered (feature inert)

  var listeners = [];

  function on(event, cb) {
    // addListener returns a handle (or a Promise of one) with .remove().
    var h = plugin.addListener(event, cb);
    listeners.push(h);
  }

  root.GossipTransport = {
    kind: 'nearby',

    start: function (handlers) {
      handlers = handlers || {};
      on('peer', function (e) { if (handlers.onPeer) handlers.onPeer(e && e.peerId, e && e.name); });
      on('message', function (e) { if (handlers.onMessage) handlers.onMessage(e && e.peerId, e && e.message); });
      on('lost', function (e) { if (handlers.onLost) handlers.onLost(e && e.peerId); });
      return Promise.resolve(plugin.start());
    },

    send: function (peerId, framedMsg) {
      return Promise.resolve(plugin.send({ peerId: peerId, message: framedMsg }));
    },

    stop: function () {
      listeners.forEach(function (h) {
        try {
          if (h && typeof h.remove === 'function') h.remove();
          else if (h && typeof h.then === 'function') h.then(function (hh) { if (hh && hh.remove) hh.remove(); });
        } catch (_) {}
      });
      listeners = [];
      return Promise.resolve(plugin.stop());
    }
  };

})();

// Teacher camera adapter. Frames and decoded text stay in memory only.
// The decoder is loaded from the same deployment when scanning first starts.
(function (global) {
  'use strict';

  var source = document.currentScript && document.currentScript.src;
  var decoderUrl = source
    ? new URL('../vendor/jsqr/jsQR-1.4.0.js', source).href
    : new URL('vendor/jsqr/jsQR-1.4.0.js', document.baseURI).href;
  var decoderLoading = null;

  function loadDecoder() {
    if (typeof global.jsQR === 'function') return Promise.resolve(global.jsQR);
    if (decoderLoading) return decoderLoading;

    decoderLoading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = decoderUrl;
      script.async = true;
      script.onload = function () {
        if (typeof global.jsQR === 'function') {
          resolve(global.jsQR);
          return;
        }
        script.remove();
        reject(new Error('The QR scanner could not load. Try again.'));
      };
      script.onerror = function () {
        script.remove();
        reject(new Error('The QR scanner could not load. Try again.'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      decoderLoading = null;
      throw error;
    });
    return decoderLoading;
  }

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (track) {
      try { track.stop(); } catch (_) { /* Continue closing the other tracks. */ }
    });
  }

  function create(options) {
    var video = options && options.video;
    if (!video || typeof video.play !== 'function') {
      throw new Error('A video element is required for the QR scanner.');
    }

    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d', { willReadFrequently: true });
    var generation = 0;
    var stream = null;
    var frameId = null;
    var lastCode = null;

    function stop() {
      generation += 1;
      if (frameId !== null) global.cancelAnimationFrame(frameId);
      frameId = null;
      var previousStream = stream;
      stream = null;
      stopTracks(previousStream);
      if (previousStream && video.srcObject === previousStream) {
        try { video.pause(); } catch (_) { /* Track shutdown still takes effect. */ }
        video.srcObject = null;
      }
      canvas.width = 0;
      canvas.height = 0;
      lastCode = null;
    }

    function fail(token, message) {
      if (token !== generation) return;
      stop();
      if (typeof options.onError === 'function') options.onError(new Error(message));
    }

    async function start() {
      stop();
      var token = generation;
      if (global.isSecureContext === false) {
        fail(token, 'Camera scanning needs HTTPS or localhost.');
        return false;
      }
      if (!global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
        fail(token, 'Camera scanning is unavailable in this browser.');
        return false;
      }
      if (!context) {
        fail(token, 'The browser could not prepare the QR scanner.');
        return false;
      }

      var decode;
      try {
        decode = await loadDecoder();
      } catch (_) {
        fail(token, 'The QR scanner could not load. Try again.');
        return false;
      }
      if (token !== generation) return false;

      try {
        var acquired = await global.navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        // A permission prompt can outlive the modal that requested it.
        if (token !== generation) {
          stopTracks(acquired);
          return false;
        }
        stream = acquired;
        video.srcObject = acquired;
        video.muted = true;
        video.playsInline = true;
        await video.play();
      } catch (_) {
        fail(token, 'Camera access failed. Allow camera access and try again.');
        return false;
      }
      if (token !== generation) return false;

      var lastFrameAt = -Infinity;
      function readFrame(timestamp) {
        if (token !== generation) return;
        frameId = null;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
              && timestamp - lastFrameAt >= 100) {
            lastFrameAt = timestamp;
            var scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            var result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
            var code = result && result.data;
            if (typeof code === 'string' && code && code !== lastCode) {
              lastCode = code;
              if (typeof options.onCode === 'function') options.onCode(code);
            }
          }
        } catch (_) {
          fail(token, 'Could not read the camera image. Open the scanner and try again.');
          return;
        }
        if (token === generation) frameId = global.requestAnimationFrame(readFrame);
      }
      frameId = global.requestAnimationFrame(readFrame);
      return true;
    }

    return { start: start, stop: stop };
  }

  global.WalletQrScanner = { create: create };
})(window);

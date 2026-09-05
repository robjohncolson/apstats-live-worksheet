// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createECDH, createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import QRCode from 'qrcode';
import { deriveAddress, deriveWIF, NETWORKS } from '../tools/doge-wallet-gen.mjs';

const adapterSource = readFileSync(new URL('../js/wallet-qr-scanner.js', import.meta.url), 'utf8');
const decoderBytes = readFileSync(new URL('../vendor/jsqr/jsQR-1.4.0.js', import.meta.url));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function cameraStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { getTracks: () => tracks, tracks };
}

function scannerHarness({ lazy = false, realDecoder = false, pixels } = {}) {
  const image = pixels || { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
  const context2d = { drawImage: vi.fn(), getImageData: vi.fn(() => image) };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context2d) };
  const scripts = [];
  const frames = new Map();
  let nextFrame = 1;
  const stream = cameraStream();
  const window = {
    URL,
    isSecureContext: true,
    navigator: { mediaDevices: { getUserMedia: vi.fn(async () => stream) } },
    requestAnimationFrame: vi.fn(callback => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn(id => frames.delete(id)),
    document: {
      currentScript: { src: 'https://school.example/follow-alongs/js/wallet-qr-scanner.js' },
      baseURI: 'https://school.example/follow-alongs/teacher-dashboard.html',
      createElement: tag => tag === 'canvas' ? canvas : { remove: vi.fn() },
      head: { appendChild: script => scripts.push(script) },
    },
  };
  window.window = window;
  window.self = window;
  const sandbox = createContext(window);
  if (realDecoder) runInContext(decoderBytes.toString('utf8'), sandbox);
  else if (!lazy) window.jsQR = vi.fn(() => null);
  runInContext(adapterSource, sandbox);

  const video = {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    readyState: 4,
    videoWidth: image.width,
    videoHeight: image.height,
    srcObject: null,
  };
  const onCode = vi.fn();
  const onError = vi.fn();
  const scanner = window.WalletQrScanner.create({ video, onCode, onError });
  function frame(timestamp = 100) {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(timestamp));
  }
  return { window, video, scanner, stream, scripts, frames, canvas, context2d, onCode, onError, frame };
}

function qrPixels(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const scale = 6;
  const margin = 4;
  const size = (qr.modules.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - margin;
      const column = Math.floor(x / scale) - margin;
      const inside = row >= 0 && column >= 0 && row < qr.modules.size && column < qr.modules.size;
      const value = inside && qr.modules.get(row, column) ? 0 : 255;
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe('wallet QR camera lifecycle', () => {
  it('decodes strings locally, suppresses repeated frames, and stops every camera track', async () => {
    const h = scannerHarness();
    h.window.jsQR.mockReturnValue({ data: 'test-address' });
    expect(await h.scanner.start()).toBe(true);
    expect(h.video.srcObject).toBe(h.stream);
    expect(h.window.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: false, video: { facingMode: { ideal: 'environment' } },
    });
    h.frame(100);
    h.frame(200);
    expect(h.onCode).toHaveBeenCalledOnce();
    expect(h.onCode).toHaveBeenCalledWith('test-address');
    h.window.jsQR.mockReturnValue({ data: 'test-private-key' });
    h.frame(300);
    expect(h.onCode).toHaveBeenLastCalledWith('test-private-key');
    h.scanner.stop();
    h.scanner.stop();
    h.stream.tracks.forEach(track => expect(track.stop).toHaveBeenCalledTimes(1));
    expect(h.video.srcObject).toBeNull();
    expect(h.frames.size).toBe(0);
    expect([h.canvas.width, h.canvas.height]).toEqual([0, 0]);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('closes a camera permission grant that arrives after the scanner closed', async () => {
    const h = scannerHarness();
    const permission = deferred();
    h.window.navigator.mediaDevices.getUserMedia.mockReturnValue(permission.promise);
    const started = h.scanner.start();
    await settle();
    h.scanner.stop();
    permission.resolve(h.stream);
    expect(await started).toBe(false);
    h.stream.tracks.forEach(track => expect(track.stop).toHaveBeenCalledOnce());
    expect(h.video.play).not.toHaveBeenCalled();
    expect(h.video.srcObject).toBeNull();
    expect(h.frames.size).toBe(0);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('does not let an earlier pending start detach the replacement camera stream', async () => {
    const h = scannerHarness();
    const firstPermission = deferred();
    const replacement = cameraStream();
    h.window.navigator.mediaDevices.getUserMedia
      .mockReturnValueOnce(firstPermission.promise)
      .mockResolvedValueOnce(replacement);
    const first = h.scanner.start();
    await settle();
    expect(await h.scanner.start()).toBe(true);
    firstPermission.resolve(h.stream);
    expect(await first).toBe(false);
    expect(h.video.srcObject).toBe(replacement);
    h.stream.tracks.forEach(track => expect(track.stop).toHaveBeenCalledOnce());
    replacement.tracks.forEach(track => expect(track.stop).not.toHaveBeenCalled());
    h.scanner.stop();
    replacement.tracks.forEach(track => expect(track.stop).toHaveBeenCalledOnce());
  });

  it('cancels pending video playback without restarting frames or showing a late error', async () => {
    const h = scannerHarness();
    const playback = deferred();
    h.video.play.mockReturnValue(playback.promise);
    const started = h.scanner.start();
    await vi.waitFor(() => expect(h.video.play).toHaveBeenCalledOnce());
    h.scanner.stop();
    playback.reject(new Error('late playback rejection'));
    expect(await started).toBe(false);
    expect(h.frames.size).toBe(0);
    expect(h.video.srcObject).toBeNull();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('reports denied permissions without echoing arbitrary underlying exception text', async () => {
    const h = scannerHarness();
    h.window.navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('private test material'));
    expect(await h.scanner.start()).toBe(false);
    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.onError.mock.calls[0][0].message).toContain('Allow camera access');
    expect(h.onError.mock.calls[0][0].message).not.toContain('private test material');
    expect(h.frames.size).toBe(0);
  });

  it('closes the camera and discards image data when decoding fails', async () => {
    const h = scannerHarness();
    h.window.jsQR.mockImplementation(() => { throw new Error('private test material'); });
    await h.scanner.start();
    h.frame();
    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.onError.mock.calls[0][0].message).not.toContain('private test material');
    expect(h.video.srcObject).toBeNull();
    h.stream.tracks.forEach(track => expect(track.stop).toHaveBeenCalledOnce());
    expect(h.frames.size).toBe(0);
    expect(h.canvas.width).toBe(0);
  });

  it('allows onCode to close the scanner before another frame is scheduled', async () => {
    const h = scannerHarness();
    h.window.jsQR.mockReturnValue({ data: 'done' });
    h.onCode.mockImplementation(() => h.scanner.stop());
    await h.scanner.start();
    h.frame();
    expect(h.frames.size).toBe(0);
    expect(h.video.srcObject).toBeNull();
  });

  it.each(['insecure', 'unsupported'])('does not ask for camera access when %s', async mode => {
    const h = scannerHarness({ lazy: true });
    const requestCamera = h.window.navigator.mediaDevices.getUserMedia;
    if (mode === 'insecure') h.window.isSecureContext = false;
    else h.window.navigator.mediaDevices = undefined;
    expect(await h.scanner.start()).toBe(false);
    expect(requestCamera).not.toHaveBeenCalled();
    expect(h.scripts).toHaveLength(0);
    expect(h.onError).toHaveBeenCalledOnce();
  });
});

describe('wallet QR decoder delivery', () => {
  it('loads only the local versioned decoder, lazily, before asking for the camera', async () => {
    const h = scannerHarness({ lazy: true });
    expect(h.scripts).toHaveLength(0);
    const started = h.scanner.start();
    expect(h.scripts).toHaveLength(1);
    expect(h.scripts[0].src).toBe('https://school.example/follow-alongs/vendor/jsqr/jsQR-1.4.0.js');
    expect(h.window.navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    h.window.jsQR = () => null;
    h.scripts[0].onload();
    expect(await started).toBe(true);
    h.scanner.stop();
    await h.scanner.start();
    expect(h.scripts).toHaveLength(1);
    h.scanner.stop();
  });

  it('permits retry after a decoder download failure', async () => {
    const h = scannerHarness({ lazy: true });
    const failed = h.scanner.start();
    h.scripts[0].onerror();
    expect(await failed).toBe(false);
    expect(h.scripts[0].remove).toHaveBeenCalledOnce();
    expect(h.window.navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    const retried = h.scanner.start();
    h.window.jsQR = () => null;
    h.scripts[1].onload();
    expect(await retried).toBe(true);
    h.scanner.stop();
  });

  it('never opens the camera after closing while the decoder is loading', async () => {
    const h = scannerHarness({ lazy: true });
    const started = h.scanner.start();
    h.scanner.stop();
    h.window.jsQR = () => null;
    h.scripts[0].onload();
    expect(await started).toBe(false);
    expect(h.window.navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('keeps the unmodified upstream decoder and license hashes reviewable', () => {
    expect(createHash('sha256').update(decoderBytes).digest('hex'))
      .toBe('bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859');
    const license = readFileSync(new URL('../vendor/jsqr/LICENSE', import.meta.url));
    expect(createHash('sha256').update(license).digest('hex'))
      .toBe('c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08');
  });

  // Public deterministic fixture only; no real paper wallets are read.
  const privateKey = Buffer.alloc(32);
  privateKey[31] = 1;
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privateKey);
  const address = deriveAddress(ecdh.getPublicKey(null, 'compressed'), NETWORKS.mainnet.p2pkh);
  const wif = deriveWIF(privateKey, NETWORKS.mainnet.wif);

  it.each([['address', address], ['WIF', wif]])('decodes a generator-compatible %s QR with the actual vendored decoder', async (_label, value) => {
    const h = scannerHarness({ realDecoder: true, pixels: qrPixels(value) });
    expect(await h.scanner.start()).toBe(true);
    h.frame();
    expect(h.onCode).toHaveBeenCalledOnce();
    expect(h.onCode).toHaveBeenCalledWith(value);
    expect(h.onError).not.toHaveBeenCalled();
    h.scanner.stop();
  });
});

// Pins the .8xl list-transfer builder promoted from the week-one spike
// (TI84_TRAINER_SPIKE_RESULT.md — 6/6 echo-oracle matches on the real ROM).
// The byte expectations here are hand-derived from the TI-8x variable file
// format, NOT round-tripped through the implementation, so an encoding bug
// cannot certify itself. The 32-byte head pin is the spike's logged output.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve(__dirname, '..', 'ti84-trainer-v2');

new Function(fs.readFileSync(path.join(V2, 'bridge.js'), 'utf8'))();
const B = window.TI84V2Bridge;

const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');

const SMALL_INT = [1, 2, 3, 4, 5];
const REALISTIC_20 = [
  28, 32, 29, 35, 30.5, 27, 33, 31, 29.5, 34,
  26, 30, 32.5, 28.5, 31.5, 29, 33.5, 27.5, 30, 35.5,
];

// Logged by the spike harness for L1 = small-int (121 bytes total).
const SPIKE_HEAD_PIN = '2a 2a 54 49 38 33 46 2a 1a 0a 00 74 69 38 34 2d 74 72 61 69 6e 65 72 20 73 70 69 6b 65 20 68 61';

describe('encodeTiReal — hand-derived BCD vectors', () => {
  const CASES = [
    [0, '00 80 00 00 00 00 00 00 00'],
    [1, '00 80 10 00 00 00 00 00 00'],
    [-3.1, '80 80 31 00 00 00 00 00 00'],
    [12.25, '00 81 12 25 00 00 00 00 00'],
    [0.5, '00 7f 50 00 00 00 00 00 00'],
    [0.05, '00 7e 50 00 00 00 00 00 00'],
    [30.5, '00 81 30 50 00 00 00 00 00'],
    [-0.5, '80 7f 50 00 00 00 00 00 00'],
    [200, '00 82 20 00 00 00 00 00 00'],
  ];

  it.each(CASES)('encodes %s', (value, expected) => {
    expect(hex(B.encodeTiReal(value))).toBe(expected);
  });

  it('rejects non-finite values', () => {
    expect(() => B.encodeTiReal(Infinity)).toThrow();
    expect(() => B.encodeTiReal(NaN)).toThrow();
  });
});

describe('buildRealList8xl — TI83F container', () => {
  it('matches the spike-logged head and size for L1 small-int', () => {
    const file = B.buildRealList8xl('L1', SMALL_INT);
    expect(file.length).toBe(121);
    expect(hex(file.slice(0, 32))).toBe(SPIKE_HEAD_PIN);
  });

  it('matches the spike-logged size for realistic-20', () => {
    expect(B.buildRealList8xl('L1', REALISTIC_20).length).toBe(256);
  });

  it('sizes as 55 header + 17 entry header + (2 + 9n) data + 2 checksum', () => {
    for (const n of [1, 5, 20]) {
      const file = B.buildRealList8xl('L1', Array(n).fill(1));
      expect(file.length).toBe(55 + 17 + 2 + 9 * n + 2);
    }
  });

  it('writes the list name token bytes (L1 = 5D 00, L2 = 5D 01)', () => {
    const l1 = B.buildRealList8xl('L1', SMALL_INT);
    expect([l1[60], l1[61]]).toEqual([0x5d, 0x00]);
    const l2 = B.buildRealList8xl('L2', SMALL_INT);
    expect([l2[60], l2[61]]).toEqual([0x5d, 0x01]);
  });

  it('marks the variable as RAM (archive flag 0x00) with version 0x00', () => {
    const file = B.buildRealList8xl('L1', SMALL_INT);
    expect(file[55 + 13]).toBe(0x00);
    expect(file[55 + 14]).toBe(0x00);
  });

  it('stores the element count little-endian at the start of var data', () => {
    const file = B.buildRealList8xl('L1', REALISTIC_20);
    expect(file[55 + 17]).toBe(20);
    expect(file[55 + 18]).toBe(0);
  });

  it('stores the entry length little-endian in the header length field', () => {
    const file = B.buildRealList8xl('L1', SMALL_INT);
    const entryLength = 17 + 2 + 9 * SMALL_INT.length;
    expect(file[53] | (file[54] << 8)).toBe(entryLength);
  });

  it('appends the checksum = sum of entry bytes mod 0x10000, little-endian', () => {
    const file = B.buildRealList8xl('L2', REALISTIC_20);
    const entry = file.slice(55, file.length - 2);
    let sum = 0;
    for (const byte of entry) sum = (sum + byte) & 0xffff;
    expect(file[file.length - 2]).toBe(sum & 0xff);
    expect(file[file.length - 1]).toBe((sum >> 8) & 0xff);
  });

  it('rejects list names without a token', () => {
    expect(() => B.buildRealList8xl('L7', SMALL_INT)).toThrow(/Unsupported list/);
  });
});

describe('transferList — FS probe chain and call fallback', () => {
  it('returns no-module without an emulator module', () => {
    expect(B.transferList(null, 'L1', SMALL_INT)).toEqual({ ok: false, reason: 'no-module' });
  });

  it('returns unsupported-list for names without a token', () => {
    const module = { FS: { writeFile: vi.fn() }, ccall: vi.fn(() => 0) };
    expect(B.transferList(module, 'L7', SMALL_INT)).toEqual({ ok: false, reason: 'unsupported-list' });
  });

  it('prefers Module.FS.writeFile and calls emu_send_variable via ccall with loc 0', () => {
    const module = { FS: { writeFile: vi.fn() }, ccall: vi.fn(() => 0) };
    const sent = B.transferList(module, 'L1', SMALL_INT);
    expect(sent).toEqual({ ok: true, via: 'ccall', fsApi: 'Module.FS.writeFile' });
    const [fsPath, bytes] = module.FS.writeFile.mock.calls[0];
    expect(fsPath).toBe('/autofill.8xl');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(121);
    expect(module.ccall).toHaveBeenCalledWith(
      'emu_send_variable', 'number', ['string', 'number'], ['/autofill.8xl', 0],
    );
  });

  it('falls back to Module.FS.createDataFile when writeFile is missing', () => {
    const module = { FS: { createDataFile: vi.fn() }, ccall: vi.fn(() => 0) };
    const sent = B.transferList(module, 'L1', SMALL_INT);
    expect(sent.fsApi).toBe('Module.FS.createDataFile');
    const [parent, name, , canRead, canWrite] = module.FS.createDataFile.mock.calls[0];
    expect([parent, name, canRead, canWrite]).toEqual(['/', 'autofill.8xl', true, true]);
  });

  it('falls back to Module.FS_createDataFile as the last FS probe', () => {
    const module = { FS_createDataFile: vi.fn(), ccall: vi.fn(() => 0) };
    expect(B.transferList(module, 'L1', SMALL_INT).fsApi).toBe('Module.FS_createDataFile');
  });

  it('fails cleanly when no FS write API exists', () => {
    const sent = B.transferList({ ccall: vi.fn(() => 0) }, 'L1', SMALL_INT);
    expect(sent.ok).toBe(false);
    expect(sent.reason).toMatch(/No Emscripten FS write API/);
  });

  it('uses the _malloc+direct call path when ccall is missing, and frees the pointer', () => {
    const heap = new Uint8Array(64);
    const module = {
      FS: { writeFile: vi.fn() },
      _emu_send_variable: vi.fn(() => 0),
      _malloc: vi.fn(() => 8),
      _free: vi.fn(),
      HEAPU8: heap,
    };
    const sent = B.transferList(module, 'L2', SMALL_INT);
    expect(sent).toEqual({ ok: true, via: '_malloc+direct', fsApi: 'Module.FS.writeFile' });
    const pathBytes = new TextEncoder().encode('/autofill.8xl');
    expect(Array.from(heap.slice(8, 8 + pathBytes.length))).toEqual(Array.from(pathBytes));
    expect(heap[8 + pathBytes.length]).toBe(0);
    expect(module._emu_send_variable).toHaveBeenCalledWith(8, 0);
    expect(module._free).toHaveBeenCalledWith(8);
  });

  it('reports a nonzero send result as a failure', () => {
    const module = { FS: { writeFile: vi.fn() }, ccall: vi.fn(() => 3) };
    expect(B.transferList(module, 'L1', SMALL_INT)).toEqual({ ok: false, reason: 'send-result-3' });
  });

  it('never throws — FS exceptions surface as { ok: false }', () => {
    const module = { FS: { writeFile: vi.fn(() => { throw new Error('disk full'); }) }, ccall: vi.fn(() => 0) };
    expect(B.transferList(module, 'L1', SMALL_INT)).toEqual({ ok: false, reason: 'disk full' });
  });
});

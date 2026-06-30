/**
 * Tests for nearby-transport.js (ANDROID Phase 3). The bridge registers
 * window.GossipTransport over the native GossipNearby Capacitor plugin ONLY inside
 * the app (native platform + plugin present); on the web it must stay inert.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'nearby-transport.js'), 'utf8');

function load(capacitor) {
  const win = { Capacitor: capacitor };
  const ctx = createContext({ window: win, globalThis: win, Promise });
  runInContext(SRC, ctx);
  return win.GossipTransport;
}

function mockPlugin() {
  const state = { listeners: {}, removed: [], sent: [], started: 0, stopped: 0 };
  const plugin = {
    addListener: (ev, cb) => { state.listeners[ev] = cb; return { remove: () => state.removed.push(ev) }; },
    start: () => { state.started += 1; return Promise.resolve(); },
    send: (args) => { state.sent.push(args); return Promise.resolve(); },
    stop: () => { state.stopped += 1; return Promise.resolve(); },
  };
  return { plugin, state };
}

describe('nearby-transport — registration', () => {
  it('does NOT register on the web (no Capacitor)', () => {
    expect(load(undefined)).toBeUndefined();
  });
  it('does NOT register when not a native platform', () => {
    const { plugin } = mockPlugin();
    expect(load({ isNativePlatform: () => false, Plugins: { GossipNearby: plugin } })).toBeUndefined();
  });
  it('registers a GossipTransport in the native app', () => {
    const { plugin } = mockPlugin();
    const t = load({ isNativePlatform: () => true, Plugins: { GossipNearby: plugin } });
    expect(t).toBeTruthy();
    expect(t.kind).toBe('nearby');
  });
});

describe('nearby-transport — contract', () => {
  it('start wires events to handlers and starts the plugin', async () => {
    const { plugin, state } = mockPlugin();
    const t = load({ isNativePlatform: () => true, Plugins: { GossipNearby: plugin } });
    const peers = [], msgs = [], lost = [];
    await t.start({
      onPeer: (id, name) => peers.push([id, name]),
      onMessage: (id, m) => msgs.push([id, m]),
      onLost: (id) => lost.push(id),
    });
    expect(state.started).toBe(1);
    // simulate native events
    state.listeners.peer({ peerId: 'b', name: 'apstats-x' });
    state.listeners.message({ peerId: 'b', message: '{"t":"hello"}' });
    state.listeners.lost({ peerId: 'b' });
    expect(peers).toEqual([['b', 'apstats-x']]);
    expect(msgs).toEqual([['b', '{"t":"hello"}']]);
    expect(lost).toEqual(['b']);
  });

  it('send forwards {peerId, message} to the plugin', async () => {
    const { plugin, state } = mockPlugin();
    const t = load({ isNativePlatform: () => true, Plugins: { GossipNearby: plugin } });
    await t.send('b', '{"t":"send"}');
    expect(state.sent).toEqual([{ peerId: 'b', message: '{"t":"send"}' }]);
  });

  it('stop removes listeners and stops the plugin', async () => {
    const { plugin, state } = mockPlugin();
    const t = load({ isNativePlatform: () => true, Plugins: { GossipNearby: plugin } });
    await t.start({});
    await t.stop();
    expect(state.stopped).toBe(1);
    expect(state.removed.sort()).toEqual(['lost', 'message', 'peer']);
  });
});

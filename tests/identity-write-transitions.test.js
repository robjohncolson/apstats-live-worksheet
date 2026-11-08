import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const SESSION_KEY = 'apstats_roster.v1';
// Load the optional queue after the client, so boot does not start a drain.
const sources = ['roster-client.js', 'gradebook-client.js', 'offline-queue.js'].map(file =>
  readFileSync(new URL('../' + file, import.meta.url), 'utf8'));

function openClient() {
  const win = new JSDOM('<!doctype html><body></body>', {
    url: 'https://worksheet.test'
  }).window;
  win.ROSTER_SERVICE_URL = 'https://roster.test';
  const context = createContext(win);
  for (const source of sources) runInContext(source, context);
  // Keep the tests in control of background replay; explicit drains still run.
  win.setTimeout = vi.fn(() => 1);
  return win;
}

function setSession(win, studentId, token = 'token-' + studentId) {
  const session = {
    studentId, token, signedInAt: '2026-01-01T00:00:00.000Z',
    mustChangePassword: true, spriteHue: 10
  };
  win.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function response(status = 200) {
  return { ok: status === 200, status, json: async () => ({ ok: status === 200 }) };
}

const answer = { source: 'worksheet', itemId: 'Q1', response: 'A answer' };

describe('gradebook writes across identity transitions', () => {
  it.each(['other-student', 'signed-out'])('retains the admitted owner after a delayed failure: %s', async mode => {
    const win = openClient();
    try {
      setSession(win, 'A');
      const post = deferred();
      win.fetch = vi.fn(() => post.promise);
      const save = win.gradebookClient.record(answer);
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledOnce());
      if (mode === 'signed-out') win.rosterClient.signOut();
      else setSession(win, 'B');
      post.reject(new Error('connection lost'));
      expect(await save).toEqual({ ok: false, reason: 'network', queued: true });
      expect(await win.OfflineQueue.all()).toMatchObject([{ studentId: 'A', response: 'A answer' }]);
    } finally { win.close(); }
  });

  it('rechecks a direct save owner after waiting behind another POST', async () => {
    const win = openClient();
    try {
      setSession(win, 'A');
      const post = deferred();
      win.fetch = vi.fn(() => post.promise);
      const first = win.gradebookClient.record(answer);
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledOnce());
      const second = win.gradebookClient.record({ ...answer, response: 'A revision' });
      setSession(win, 'B');
      post.resolve(response());
      await first;
      expect(await second).toEqual({ ok: false, reason: 'network', queued: true });
      expect(win.fetch).toHaveBeenCalledOnce();
      expect(await win.OfflineQueue.all()).toMatchObject([{ studentId: 'A', response: 'A revision' }]);
    } finally { win.close(); }
  });

  it('keeps the send tail until the last same-owner POST settles', async () => {
    const win = openClient();
    try {
      setSession(win, 'A');
      const posts = [deferred(), deferred(), deferred()];
      win.fetch = vi.fn(() => posts[win.fetch.mock.calls.length - 1].promise);
      const first = win.gradebookClient.record(answer);
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(1));
      const second = win.gradebookClient.record({ ...answer, response: 'second' });
      posts[0].resolve(response());
      await first;
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(2));
      const third = win.gradebookClient.record({ ...answer, response: 'third' });
      await new Promise(resolve => setImmediate(resolve));
      expect(win.fetch).toHaveBeenCalledTimes(2);
      posts[1].resolve(response());
      await second;
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(3));
      posts[2].resolve(response());
      expect((await third).ok).toBe(true);
      expect(win.fetch.mock.calls.map(([, options]) => JSON.parse(options.body).response))
        .toEqual(['A answer', 'second', 'third']);
    } finally { win.close(); }
  });

  it('does not let a new owner block or supersede the prior owner in memory', async () => {
    const win = openClient();
    try {
      setSession(win, 'A');
      const oldPost = deferred();
      win.fetch = vi.fn((url, options) => JSON.parse(options.body).token === 'token-A'
        ? oldPost.promise : Promise.resolve(response()));
      const oldSave = win.gradebookClient.record(answer);
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(1));
      setSession(win, 'B');
      const newSave = win.gradebookClient.record({ ...answer, response: 'B answer' });
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledTimes(2));
      expect((await newSave).ok).toBe(true);
      oldPost.reject(new Error('connection lost'));
      expect(await oldSave).toEqual({ ok: false, reason: 'network', queued: true });
      expect(await win.OfflineQueue.all()).toMatchObject([{ studentId: 'A', response: 'A answer' }]);
    } finally { win.close(); }
  });

  it.each([
    ['direct', 'other-student'], ['drain', 'other-student'],
    ['direct', 'refreshed-token'], ['drain', 'refreshed-token']
  ])('a stale %s auth failure cannot expire or suppress replay after %s', async (path, mode) => {
    const win = openClient();
    try {
      setSession(win, 'A');
      const queue = win.OfflineQueue;
      // A direct request starts before the queue is loaded; its completion is
      // the first chance to schedule replay, exposing stale-token suppression.
      if (path === 'direct') delete win.OfflineQueue;
      else await queue.enqueue({ ...answer, studentId: 'A' });
      const post = deferred();
      win.fetch = vi.fn(() => post.promise);
      const save = path === 'direct'
        ? win.gradebookClient.record(answer) : win.gradebookClient.syncOfflineQueue();
      await vi.waitFor(() => expect(win.fetch).toHaveBeenCalledOnce());
      setSession(win, mode === 'other-student' ? 'B' : 'A', 'replacement-token');
      win.OfflineQueue = queue;
      post.resolve(response(401));
      await save;
      win.dispatchEvent(new win.Event('online'));
      expect(win.document.getElementById('gb-no-identity-nudge')).toBeNull();
      expect(win.setTimeout).toHaveBeenCalled();
      expect(await queue.all()).toMatchObject([{ studentId: 'A', response: 'A answer' }]);
    } finally { win.close(); }
  });
});

describe('password completion across identity transitions', () => {
  it.each(['other-student', 'signed-out', 'unidentified'])('leaves a changed session intact: %s', async mode => {
    const win = openClient();
    try {
      setSession(win, mode === 'unidentified' ? null : 'A');
      const post = deferred();
      win.fetch = vi.fn(() => post.promise);
      const change = win.rosterClient.changePassword('new-password');
      if (mode === 'signed-out') win.rosterClient.signOut();
      else setSession(win, mode === 'unidentified' ? null : 'B', 'replacement-token');
      const current = win.localStorage.getItem(SESSION_KEY);
      post.resolve(response());
      expect(await change).toMatchObject({ ok: false, error: expect.stringMatching(/password changed.*original account/i) });
      expect(win.localStorage.getItem(SESSION_KEY)).toBe(current);
    } finally { win.close(); }
  });

  it('finishes a password change after the same student renews the session', async () => {
    const win = openClient();
    try {
      setSession(win, 'A');
      const post = deferred();
      win.fetch = vi.fn(() => post.promise);
      const change = win.rosterClient.changePassword('new-password');
      const renewed = {
        ...setSession(win, 'A', 'renewed-token'),
        signedInAt: '2026-11-08T12:00:00.000Z', spriteHue: 42
      };
      win.localStorage.setItem(SESSION_KEY, JSON.stringify(renewed));
      const expiresAt = win.rosterClient.expiresAt();

      post.resolve(response());

      expect(await change).toEqual({ ok: true });
      expect(JSON.parse(win.localStorage.getItem(SESSION_KEY))).toEqual({
        ...renewed, mustChangePassword: false
      });
      expect(win.rosterClient.expiresAt()).toBe(expiresAt);
    } finally { win.close(); }
  });

  it('clears only the password flag without renewing age or reverting newer profile edits', async () => {
    const win = openClient();
    try {
      const original = setSession(win, 'A');
      const expiresAt = win.rosterClient.expiresAt();
      const post = deferred();
      win.fetch = vi.fn(() => post.promise);
      const change = win.rosterClient.changePassword('new-password');
      win.rosterClient.updateSpriteHue(42);
      post.resolve(response());
      expect(await change).toEqual({ ok: true });
      expect(JSON.parse(win.localStorage.getItem(SESSION_KEY))).toEqual({
        ...original, mustChangePassword: false, spriteHue: 42
      });
      expect(win.rosterClient.expiresAt()).toBe(expiresAt);
    } finally { win.close(); }
  });
});

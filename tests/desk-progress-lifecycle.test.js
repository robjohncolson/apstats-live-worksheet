// Exercise the real view and login handlers: cached/tab equality alone must not
// allow work from a prior session or window lifetime to update the current view.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const SOURCE = readFileSync(resolve(import.meta.dirname, '../js/desk-progress-app.js'), 'utf8');
const windows = [];
afterEach(() => { for (const window of windows.splice(0)) window.close(); });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function response(data) { return { ok: true, json: async () => data }; }
function answer(text) { return [{ question_id: 'Q1', answer_value: text, timestamp: 1 }]; }

function setup(intercept = () => undefined) {
  const dom = new JSDOM('<div id="app-progress-overlay"><div class="app-window"><div id="progress-content"></div></div></div>', {
    url: 'https://desk.test', runScripts: 'outside-only',
  });
  const window = dom.window;
  windows.push(window);
  window.bumpUsage = () => {};
  window.MacSFX = { play() {} };
  window.fetch = vi.fn(async (url, options) => {
    const intercepted = intercept(String(url), options);
    if (intercepted !== undefined) return intercepted;
    if (url.endsWith('/verify')) {
      const { username } = JSON.parse(options.body);
      return response({ valid: true, real_name: username });
    }
    if (url.includes('/rest/v1/users')) return response([{ real_name: new URL(url).searchParams.get('username').slice(3) }]);
    if (url.includes('/answers?')) return response(answer(new URL(url).searchParams.get('username').slice(3) + ' answer'));
    return response({});
  });
  window.eval(SOURCE + '\nwindow.progressApp = ProgressApp;');
  const app = window.progressApp;
  app.userList = [{ username: 'alice' }, { username: 'bob' }];
  app.activeTab = 'quiz';
  return { window, app };
}

function login(window, app, username) {
  app.renderLogin();
  window.document.getElementById('prog-user-select').value = username;
  window.document.getElementById('prog-pass-input').value = 'password';
  app.handleLogin();
}

async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

describe('My Progress request ownership', () => {
  it('does not cache or paint Alice answers after actual logout/login as Bob', async () => {
    const old = deferred();
    const { window, app } = setup((url) => url.includes('/answers?username=eq.alice') ? old.promise : undefined);
    login(window, app, 'alice');
    await vi.waitFor(() => expect(window.fetch.mock.calls.some(([url]) => url.includes('/answers?'))).toBe(true));
    app.logout();
    login(window, app, 'bob');
    await vi.waitFor(() => expect(app.cache.quiz?.data[0].answer_value).toBe('bob answer'));
    old.resolve(response(answer('alice private answer')));
    await settle();
    expect(app.cache.quiz.data[0].answer_value).toBe('bob answer');
    expect(window.document.getElementById('progress-content').textContent).not.toContain('alice private answer');
  });

  it('invalidates old work even when the same username logs in again', async () => {
    const old = deferred();
    let reads = 0;
    const { window, app } = setup((url) => {
      if (url.includes('/answers?') && ++reads === 1) return old.promise;
    });
    login(window, app, 'alice');
    await vi.waitFor(() => expect(reads).toBe(1));
    app.logout();
    login(window, app, 'alice');
    await vi.waitFor(() => expect(app.cache.quiz?.data[0].answer_value).toBe('alice answer'));
    old.resolve(response(answer('obsolete answer')));
    await settle();
    expect(app.cache.quiz.data[0].answer_value).toBe('alice answer');
  });

  it('ignores a successful password response after the window closes', async () => {
    const old = deferred();
    const { window, app } = setup((url) => url.endsWith('/verify') ? old.promise : undefined);
    login(window, app, 'alice');
    app.close();
    old.resolve(response({ valid: true, real_name: 'alice' }));
    await settle();
    expect(app.username).toBeNull();
    expect(window.localStorage.getItem('progress-username')).toBeNull();
  });

  it('ignores an old login failure after a newer successful login', async () => {
    const old = deferred();
    const { window, app } = setup((url, opts) => {
      if (url.endsWith('/verify') && JSON.parse(opts.body).username === 'alice') return old.promise;
    });
    login(window, app, 'alice');
    login(window, app, 'bob');
    await vi.waitFor(() => expect(app.cache.quiz).toBeDefined());
    old.resolve(response({ valid: false, error: 'Old login failed' }));
    await settle();
    expect(window.document.getElementById('progress-body')).not.toBeNull();
    expect(window.document.getElementById('progress-content').textContent).not.toContain('Old login failed');
  });

  it('does not let an obsolete remembered-user lookup clear a new session', async () => {
    const old = deferred();
    const { window, app } = setup((url) => {
      if (url.includes('/api/users/alice/stars')) return old.promise;
      if (url.includes('/rest/v1/users?username=eq.alice')) return response([]);
    });
    window.localStorage.setItem('progress-username', 'alice');
    app.open();
    app.logout();
    login(window, app, 'bob');
    await vi.waitFor(() => expect(app.cache.quiz).toBeDefined());
    old.resolve(response({ error: 'not found' }));
    await settle();
    expect(app.username).toBe('bob');
    expect(window.localStorage.getItem('progress-username')).toBe('bob');
  });

  it('keeps the newest result when two reads of one tab finish in reverse order', async () => {
    const first = deferred();
    const second = deferred();
    let reads = 0;
    const { window, app } = setup((url) => {
      if (url.includes('/answers?')) return (++reads === 1 ? first : second).promise;
    });
    login(window, app, 'alice');
    await vi.waitFor(() => expect(reads).toBe(1));
    app.switchTab('quiz');
    second.resolve(response(answer('newest')));
    await vi.waitFor(() => expect(app.cache.quiz?.data[0].answer_value).toBe('newest'));
    first.resolve(response(answer('oldest')));
    await settle();
    expect(app.cache.quiz.data[0].answer_value).toBe('newest');
  });

  it('discards a read after destroy and still loads on reopening', async () => {
    const old = deferred();
    let reads = 0;
    const { window, app } = setup((url) => {
      if (url.includes('/answers?') && ++reads === 1) return old.promise;
    });
    login(window, app, 'alice');
    await vi.waitFor(() => expect(reads).toBe(1));
    app.destroy();
    old.resolve(response(answer('closed window result')));
    await settle();
    expect(app.cache).toEqual({});
    app.open();
    await vi.waitFor(() => expect(app.cache.quiz?.data[0].answer_value).toBe('alice answer'));
  });
});

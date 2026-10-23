// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fnBody } from './helpers/desk-source.js';

const client = readFileSync(new URL('../roster-client.js', import.meta.url), 'utf8');
const classLog = readFileSync(new URL('../js/desk-class-log.js', import.meta.url), 'utf8');
const teacherReply = () => ({
  status: 200,
  json: async () => ({ ok: true, role: 'teacher', token: 'fresh-class-log-token' }),
});

function tabs() {
  const stored = new Map([
    ['apstats_user_role', 'teacher'],
    ['apstats_desk_student_email', 'teacher'],
    ['apstats_classlog_token', 'old-class-log-token'],
  ]);
  const localStorage = {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const open = () => {
    const win = {
      localStorage,
      sessionStorage: { getItem() { return null; } },
      updateStudentMenu() {},
      updateUserRoleUI() {},
      location: { reload() {} },
    };
    win.window = win;
    runInNewContext([client, classLog, fnBody('_deskIsTeacher'), fnBody('signOutStudent')].join('\n'), win);
    return win;
  };
  return { first: open(), second: open(), stored };
}

describe('Class Log sign-in across a shared-storage logout', () => {
  it('does not restore a teacher token when another tab signs out during the request', async () => {
    const { first, second, stored } = tabs();
    let reply;
    first.fetch = vi.fn(() => new Promise(resolve => { reply = resolve; }));
    const pending = first.DeskClassLog.signIn(first, 'teacher', 'password');
    second.signOutStudent();
    expect(first._deskIsTeacher()).toBe(false);
    expect(stored.has('apstats_classlog_token')).toBe(false);

    reply(teacherReply());
    await expect(pending).rejects.toThrow('Teacher sign-in is required');
    expect(stored.has('apstats_classlog_token')).toBe(false);
    expect(first.fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a stale form submission after another tab has signed out', async () => {
    const { first, second, stored } = tabs();
    first.fetch = vi.fn(async () => teacherReply());
    second.signOutStudent();

    await expect(first.DeskClassLog.signIn(first, 'teacher', 'password')).rejects.toThrow('Teacher sign-in is required');
    expect(first.fetch).not.toHaveBeenCalled();
    expect(stored.has('apstats_classlog_token')).toBe(false);
  });

  it('also cancels pending sign-in when a sibling page uses the shared roster client directly', async () => {
    const { first, second, stored } = tabs();
    let reply;
    first.fetch = vi.fn(() => new Promise(resolve => { reply = resolve; }));
    const pending = first.DeskClassLog.signIn(first, 'teacher', 'password');
    second.rosterClient.signOut();
    reply(teacherReply());

    await expect(pending).rejects.toThrow('Teacher sign-in is required');
    expect(first._deskIsTeacher()).toBe(false);
    expect(stored.has('apstats_user_role')).toBe(false);
    expect(stored.has('apstats_classlog_token')).toBe(false);
  });

  it('still stores a successful response while teacher access remains active', async () => {
    const { first, stored } = tabs();
    first.fetch = vi.fn(async () => teacherReply());

    await expect(first.DeskClassLog.signIn(first, 'teacher', 'password')).resolves.toBe('fresh-class-log-token');
    expect(stored.get('apstats_classlog_token')).toBe('fresh-class-log-token');
  });
});

// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fnBody } from './helpers/desk-source.js';

describe('Class Log credentials on a shared Desk', () => {
  it('removes the Algebra 2 teacher credential before sign-out reloads for the next user', () => {
    const stored = new Map([
      ['apstats_classlog_token', 'previous-teacher-token'],
      ['apstats_user_role', 'teacher'],
      ['apstats_desk_student_email', 'teacher'],
      ['apstats_guest_active', '1'],
      ['unrelated-preference', 'keep'],
    ]);
    let tokenAtReload;
    const client = readFileSync(new URL('../roster-client.js', import.meta.url), 'utf8');
    runInNewContext(client + '\n' + fnBody('signOutStudent') + '\nsignOutStudent();', {
      window: {},
      localStorage: {
        getItem(key) { return stored.get(key) || null; },
        removeItem(key) { stored.delete(key); },
      },
      updateStudentMenu() {},
      updateUserRoleUI() {},
      location: { reload() { tokenAtReload = stored.get('apstats_classlog_token'); } },
    });
    expect(tokenAtReload).toBeUndefined();
    expect(stored.has('apstats_classlog_token')).toBe(false);
    expect(stored.get('unrelated-preference')).toBe('keep');
  });
});

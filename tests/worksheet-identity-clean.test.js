// worksheet-identity-clean.test.js — every follow-along worksheet must populate
// its name/period/username from the LIVE shared session (roster student > active
// guest alias > local cache), never a stale 'worksheet-user' from a previous
// person on the device. Pins the 69-worksheet rollout (codemod
// scripts/wire-identity-clean.mjs) and the field-id-agnostic coverage of the one
// divergent worksheet (u3_lesson6-7).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worksheets = readdirSync(repo).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f));
const MARKER = 'IDENTITY (clean): the live shared session is AUTHORITATIVE';

function restoreFn(src) {
  const at = src.indexOf('function restoreSavedUser()');
  return at < 0 ? '' : src.slice(at, at + 3000);
}

describe('Worksheet identity — clean (no stale name/period/username)', () => {
  it('covers all 69 follow-along worksheets', () => {
    expect(worksheets.length).toBe(69);
  });

  it('every worksheet uses the identity-aware restoreSavedUser', () => {
    const missing = worksheets.filter((f) => !readFileSync(resolve(repo, f), 'utf8').includes(MARKER));
    expect(missing).toEqual([]);
  });

  it('prioritizes roster session > active guest > local cache', () => {
    const fn = restoreFn(readFileSync(resolve(repo, worksheets[0]), 'utf8'));
    const rosterAt = fn.indexOf('rosterClient.current');
    const guestAt = fn.indexOf('apstats_guest_active');
    const cacheAt = fn.indexOf('localStorage.getItem(anonKey)');
    expect(rosterAt).toBeGreaterThan(-1);
    expect(guestAt).toBeGreaterThan(rosterAt);
    expect(cacheAt).toBeGreaterThan(guestAt);
    // Guest alias read straight from localStorage — getGuestIdentity()'s file
    // (railway_client.js) 404s from a root worksheet's ../ path, so don't depend on it.
    expect(fn).toContain("localStorage.getItem('apstats_guest_identity')");
    expect(fn).not.toContain('window.getGuestIdentity()');
  });

  it('resolves fields by either id set (covers the divergent u3_lesson6-7)', () => {
    const v = readFileSync(resolve(repo, 'u3_lesson6-7_live.html'), 'utf8');
    expect(v).toContain(MARKER);
    const fn = restoreFn(v);
    expect(fn).toContain("getElementById('worksheetName')");
    expect(fn).toContain("getElementById('studentName')");
    expect(fn).toContain('LOCAL_USER_KEY'); // anon fallback uses the worksheet's own key
  });

  it('does NOT touch edgar / MIT worksheets (pattern-guarded)', () => {
    for (const f of ['edgar_u6_conceptual_driller_live.html', 'mit_ocw_6.0001_lec1_live.html', 'mit_ocw_6.0001_lec2_live.html']) {
      let src = '';
      try { src = readFileSync(resolve(repo, f), 'utf8'); } catch (_) { continue; }
      expect(src).not.toContain(MARKER);
    }
  });
});

describe('Worksheet config scripts load same-dir (../ 404s on GH Pages)', () => {
  it('no worksheet loads ../railway_client.js or ../railway_config.js', () => {
    const bad = worksheets.filter((f) => {
      const s = readFileSync(resolve(repo, f), 'utf8');
      return s.includes('src="../railway_client.js"') || s.includes('src="../railway_config.js"');
    });
    expect(bad).toEqual([]);
  });

  it('worksheets load railway_client.js + railway_config.js same-dir', () => {
    const s = readFileSync(resolve(repo, worksheets[0]), 'utf8');
    expect(s).toContain('src="railway_client.js"');
    expect(s).toContain('src="railway_config.js"');
  });
});

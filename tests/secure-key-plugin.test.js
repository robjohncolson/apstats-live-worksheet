// secure-key-plugin.test.js — source pins on the native SecureKeyStorePlugin.java
// (offline-grading mesh §2.5). Java isn't run in the vitest suite, so these guard the
// security-critical invariants that only an APK rebuild would otherwise reveal:
//   - TWO master key classes: an auth-required (teacher) and a NO-auth (student) one.
//   - requireAuth=false → NO setUserAuthenticationRequired → silent (no biometric).
//   - the biometric subtitle is CALLER-provided, never the hardcoded "teacher signing
//     key" that used to show for students.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const JAVA = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..',
    'android-app', 'plugins', 'secure-key-store', 'android', 'src', 'main', 'java',
    'com', 'robcolson', 'apstats', 'securekey', 'SecureKeyStorePlugin.java'),
  'utf8'
);

describe('SecureKeyStorePlugin — two key classes (§2.5)', () => {
  it('declares separate auth + no-auth master aliases', () => {
    expect(JAVA).toMatch(/MASTER_ALIAS\s*=\s*"apstats_securekey_master_v1"/);
    expect(JAVA).toMatch(/MASTER_ALIAS_NOAUTH\s*=\s*"apstats_securekey_master_noauth_v1"/);
  });

  it('masterKey takes requireAuth and only gates the auth-required class', () => {
    expect(JAVA).toMatch(/SecretKey masterKey\(boolean requireAuth\)/);
    // the alias is chosen by requireAuth
    expect(JAVA).toMatch(/requireAuth \? MASTER_ALIAS : MASTER_ALIAS_NOAUTH/);
    // setUserAuthenticationRequired lives INSIDE an `if (requireAuth)` block, so the
    // student (no-auth) key never gets it.
    const idx = JAVA.indexOf('if (requireAuth)');
    const authFlag = JAVA.indexOf('setUserAuthenticationRequired(true)');
    expect(idx).toBeGreaterThan(-1);
    expect(authFlag).toBeGreaterThan(idx);   // the flag appears after (inside) the guard
  });

  it('setKey/getKey read requireAuth (default true) and branch to a SILENT path', () => {
    expect(JAVA).toMatch(/call\.getBoolean\("requireAuth", true\)/);
    // requireAuth → biometric; else → runDirect (no prompt)
    expect(JAVA).toContain('if (requireAuth) authThenRun(');
    expect(JAVA).toContain('else runDirect(');
    expect(JAVA).toMatch(/private void runDirect\(/);
  });

  it('the biometric subtitle is caller-provided, not the hardcoded teacher string', () => {
    expect(JAVA).toMatch(/final String subtitle = call\.getString\("subtitle"/);
    expect(JAVA).toContain('.setSubtitle(subtitle)');
    // the old hardcoded student-wrong copy is gone from the prompt builder
    expect(JAVA).not.toContain('.setSubtitle("AP Statistics — teacher signing key")');
  });
});

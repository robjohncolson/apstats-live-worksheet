#!/usr/bin/env node
// build-android.mjs — assemble the AP Stats Android APK end-to-end (ANDROID_PACKET_APP_SPEC §12).
// One command for the whole pipeline:
//   1. build the offline pack (prefers media-compressed/) → android-app/www
//   2. capacitor sync (copy www → the native android assets)
//   3. gradle assembleDebug → app-debug.apk
//
// Flags:
//   --no-media   fast app-shell build, skip the ~1.3 GB video (toolchain smoke test)
//   --release    assembleRelease instead of assembleDebug (needs a signing config)
//
// Prereqs (already set up on the build machine): Node, the Android SDK (ANDROID_HOME), and
// JDK 17 — gradle is pinned to it in android/gradle.properties (the machine's JAVA_HOME is JDK 22,
// which Gradle 8.2.1 can't run under). Connect a phone (USB debugging) and `adb install -r` the APK.

import { execSync } from 'node:child_process';
import { existsSync, statSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(REPO, 'android-app');
const noMedia = process.argv.includes('--no-media');
const release = process.argv.includes('--release');
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';   // cmd needs the .\ prefix

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}   (in ${resolve(cwd)})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log(`\n── 1/3  offline pack → android-app/www  ${noMedia ? '(no video)' : '(with media-compressed video)'}`);
run(`node scripts/build-offline-pack.mjs --out android-app/www${noMedia ? ' --no-media' : ''}`, REPO);

// Mobile launcher (ANDROID_PACKET_APP_SPEC §2): the phone home is the lessons list, NOT the Desk.
// Generate the per-lesson index from the bundled video set, drop in mobile-home.html, and make it
// the WebView entry (index.html) so the app opens straight to units → lessons.
console.log('   + mobile launcher (lessons-index.json + mobile-home as index.html)');
run(`node scripts/build-lessons-index.mjs --out android-app/www/lessons-index.json${noMedia ? ' --media none' : ''}`, REPO);
copyFileSync(resolve(REPO, 'mobile-home.html'), resolve(APP, 'www/mobile-home.html'));
copyFileSync(resolve(REPO, 'mobile-home.html'), resolve(APP, 'www/index.html')); // WebView entry

console.log('\n── 2/3  capacitor sync (www → native assets)');
run('npx cap sync android', APP);

console.log('\n── 3/3  gradle assemble');
run(`${gradlew} ${release ? 'assembleRelease' : 'assembleDebug'} --no-daemon`, resolve(APP, 'android'));

const apkDir = resolve(APP, 'android/app/build/outputs/apk', release ? 'release' : 'debug');
const apk = existsSync(apkDir) ? readdirSync(apkDir).find((f) => f.endsWith('.apk')) : null;
if (apk) {
  const p = resolve(apkDir, apk);
  console.log(`\n✓ APK ready: ${p}  (${(statSync(p).size / 1e6).toFixed(0)} MB)`);
  console.log(`  sideload:  adb install -r "${p}"`);
} else {
  console.log('\n⚠ APK not found under', apkDir, '— check the gradle output above.');
}

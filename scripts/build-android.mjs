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

import { execSync, execFileSync } from 'node:child_process';
import { existsSync, statSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(REPO, 'android-app');
const noMedia = process.argv.includes('--no-media');
const release = process.argv.includes('--release');
const play = process.argv.includes('--play');                 // Phase 5: Play AAB, video downloads on-demand
const mbArg = process.argv.indexOf('--media-base');
const mediaBase = mbArg >= 0 ? process.argv[mbArg + 1] : '';   // host serving media-compressed/*.mp4
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';   // cmd needs the .\ prefix

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}   (in ${resolve(cwd)})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}
// runNode passes args as a literal argv (no shell), so a teacher-supplied
// --media-base value can never be parsed by a shell (build-path review fix).
function runNode(args, cwd) {
  console.log(`\n$ node ${args.join(' ')}   (in ${resolve(cwd)})`);
  execFileSync('node', args, { cwd, stdio: 'inherit' });
}

console.log(`\n── 1/3  offline pack → android-app/www  ${play ? '(Play: video on-demand)' : noMedia ? '(no video)' : '(with media-compressed video)'}`);
const packArgs = ['scripts/build-offline-pack.mjs', '--out', 'android-app/www', '--app-nav', '--keep-media'];
if (noMedia) packArgs.push('--no-media');
if (play) packArgs.push('--play', '--media-base', mediaBase);
runNode(packArgs, REPO);

// Mobile launcher (ANDROID_PACKET_APP_SPEC §2): the phone home is the lessons list, NOT the Desk.
// Generate the per-lesson index from the video set. In a Play build we KEEP the video refs (so the
// launcher renders download buttons) even though the files aren't bundled.
console.log('   + mobile launcher (lessons-index.json + mobile-home as index.html)');
const liArgs = ['scripts/build-lessons-index.mjs', '--out', 'android-app/www/lessons-index.json'];
if (noMedia && !play) liArgs.push('--media', 'none');
runNode(liArgs, REPO);
copyFileSync(resolve(REPO, 'mobile-home.html'), resolve(APP, 'www/mobile-home.html'));
copyFileSync(resolve(REPO, 'mobile-home.html'), resolve(APP, 'www/index.html')); // WebView entry

console.log('\n── 2/3  capacitor sync (www → native assets)');
run('npx cap sync android', APP);

// Play → an AAB (bundle*); sideload → an APK (assemble*).
const gradleTask = play ? (release ? 'bundleRelease' : 'bundleDebug') : (release ? 'assembleRelease' : 'assembleDebug');
console.log(`\n── 3/3  gradle ${gradleTask}`);
run(`${gradlew} ${gradleTask} --no-daemon`, resolve(APP, 'android'));

if (play) {
  const bundleDir = resolve(APP, 'android/app/build/outputs/bundle', release ? 'release' : 'debug');
  const aab = existsSync(bundleDir) ? readdirSync(bundleDir).find((f) => f.endsWith('.aab')) : null;
  if (aab) {
    const p = resolve(bundleDir, aab);
    console.log(`\n✓ AAB ready: ${p}  (${(statSync(p).size / 1e6).toFixed(0)} MB)`);
    console.log('  Play: upload to the Play Console (internal testing first). Host media-compressed/*.mp4 at MEDIA_BASE_URL so the app can download video per-unit.');
    if (!mediaBase) console.log('  ⚠ no --media-base given → MEDIA_BASE_URL is empty; the app will show "video unavailable" until set + hosted.');
  } else {
    console.log('\n⚠ AAB not found under', bundleDir, '— check the gradle output above.');
  }
} else {
  const apkDir = resolve(APP, 'android/app/build/outputs/apk', release ? 'release' : 'debug');
  const apk = existsSync(apkDir) ? readdirSync(apkDir).find((f) => f.endsWith('.apk')) : null;
  if (apk) {
    const p = resolve(apkDir, apk);
    console.log(`\n✓ APK ready: ${p}  (${(statSync(p).size / 1e6).toFixed(0)} MB)`);
    console.log(`  sideload:  adb install -r "${p}"`);
  } else {
    console.log('\n⚠ APK not found under', apkDir, '— check the gradle output above.');
  }
}

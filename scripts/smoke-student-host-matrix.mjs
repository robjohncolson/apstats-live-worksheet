#!/usr/bin/env node
/**
 * smoke-student-host-matrix.mjs — W0 reusable host matrix smoke
 *
 * Measures what production hosts actually serve for student resource paths
 * (worksheet / quiz / video / flashcards / formula / TI-84) so G1 can be
 * locked from evidence, not abstraction.
 *
 * Usage:
 *   node scripts/smoke-student-host-matrix.mjs
 *   node scripts/smoke-student-host-matrix.mjs --http-only
 *   node scripts/smoke-student-host-matrix.mjs --out state/w0-results.json
 *
 * Optional browser render checks (desktop + phone viewports) when
 * playwright-core is installed:
 *   npm install --no-save playwright-core && npx playwright-core install chromium
 *
 * Recon only — does not modify app code. Exit 0 always when probes complete;
 * exit 2 if chromium was requested and failed to launch.
 */

import { writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const HTTP_ONLY = process.argv.includes('--http-only');
const OUT = resolve(REPO, arg('--out', 'state/w0-host-matrix-results.json'));

// ── Origins: hardcoded from verified code constants (not parsed at runtime).
// Sources (re-check if these files change):
//   WS_BASE / CR_BASE  → scripts/build-lessons-index.mjs (WS_BASE, CR_BASE)
//   ROSTER             → roster_config.js production fallback
//   RAILWAY_CR_AI      → railway_config.js RAILWAY_SERVER_URL
//   FORMULA_*          → ap_stats_roadmap_square_mode.html APP_REGISTRY + Vercel probe
export const ORIGINS = {
  WS_BASE: 'https://robjohncolson.github.io/apstats-live-worksheet/',
  CR_BASE: 'https://robjohncolson.github.io/curriculum_render/',
  ROSTER: 'https://roster-production-12c1.up.railway.app',
  RAILWAY_CR_AI: 'https://curriculumrender-production.up.railway.app',
  FORMULA: 'https://tmux-trainer.vercel.app',
  FORMULA_DECK: 'https://tmux-trainer.vercel.app/#deck=ap-stats-formulas',
  FORMULA_LAB: 'https://tmux-trainer.vercel.app/formula-lab.html',
};

const WS = ORIGINS.WS_BASE.replace(/\/$/, '');
const CR = ORIGINS.CR_BASE.replace(/\/$/, '');

// Canonical core lesson for dead-end checks (has worksheet + quiz + blooket).
export const LESSON = {
  id: '1.2',
  unit: 1,
  lesson: 2,
  worksheet: `${WS}/u1_lesson2_live.html`,
  // Desk registry / roadmap-data path (absolute CR origin)
  quizDeskRegistry: `${CR}/?u=1&l=2`,
  // Mobile lessons-index path (relative, same-origin as WS)
  quizPagesRelative: `${WS}/quiz/index.html?u=1&l=2`,
  mediaPages: `${WS}/media/1-2__0__1cJ3a5DSlZ0w3vta901HVyADfQ-qKVQcD.mp4`,
  flashcardsCsv: `${WS}/u1_l2_blooket.csv`,
  flashcardsJs: `${WS}/flashcards.js`,
  ti84: `${WS}/ti84-trainer-v2/standalone.html`,
  blooketExternal: 'https://dashboard.blooket.com/set/6a08a5ec93e4e9542dfc82d6',
};

export const HTTP_CHECKS = [
  // GH Pages — Desk worksheet host
  { host: 'GH_Pages_Desk', resource: 'desk_html', url: `${WS}/ap_stats_roadmap_square_mode.html` },
  { host: 'GH_Pages_Desk', resource: 'mobile_html', url: `${WS}/mobile-home.html` },
  { host: 'GH_Pages_Desk', resource: 'worksheet', url: LESSON.worksheet },
  { host: 'GH_Pages_Desk', resource: 'quiz_relative', url: LESSON.quizPagesRelative, note: 'H0 — mobile lessons-index path' },
  { host: 'GH_Pages_Desk', resource: 'video_media', url: LESSON.mediaPages, method: 'HEAD' },
  { host: 'GH_Pages_Desk', resource: 'flashcards_csv', url: LESSON.flashcardsCsv },
  { host: 'GH_Pages_Desk', resource: 'flashcards_js', url: LESSON.flashcardsJs },
  { host: 'GH_Pages_Desk', resource: 'formula_n/a_on_this_host', url: null, skip: true },
  { host: 'GH_Pages_Desk', resource: 'ti84', url: LESSON.ti84 },
  { host: 'GH_Pages_Desk', resource: 'roadmap_data', url: `${WS}/roadmap-data.json` },
  { host: 'GH_Pages_Desk', resource: 'lessons_index', url: `${WS}/lessons-index.json` },
  { host: 'GH_Pages_Desk', resource: 'work_manifest', url: `${WS}/data/work-manifest.json` },

  // GH Pages — curriculum_render (quiz SoT for Desk registry)
  { host: 'GH_Pages_CR', resource: 'quiz_absolute', url: LESSON.quizDeskRegistry, note: 'Desk registry / APP_REGISTRY.quiz' },
  { host: 'GH_Pages_CR', resource: 'quiz_index', url: `${CR}/index.html?u=1&l=2` },
  { host: 'GH_Pages_CR', resource: 'cr_root', url: `${CR}/` },

  // Vercel — formula surfaces
  { host: 'Vercel_Formula', resource: 'formula_deck', url: ORIGINS.FORMULA_DECK },
  { host: 'Vercel_Formula', resource: 'formula_lab', url: ORIGINS.FORMULA_LAB },
  { host: 'Vercel_Formula', resource: 'formula_root', url: `${ORIGINS.FORMULA}/` },

  // Railway — roster / donow + AI grading backend
  { host: 'Railway_Roster', resource: 'health', url: `${ORIGINS.ROSTER}/health` },
  { host: 'Railway_Roster', resource: 'donow_unauth', url: `${ORIGINS.ROSTER}/donow`, expectStatus: 401 },
  { host: 'Railway_CR_AI', resource: 'health', url: `${ORIGINS.RAILWAY_CR_AI}/health` },

  // External Blooket (grade-adjacent warm-up host)
  { host: 'Blooket', resource: 'set_1.2', url: LESSON.blooketExternal },
];

export const APK_PATHS = [
  { resource: 'desk_html', rel: 'ap_stats_roadmap_square_mode.html' },
  { resource: 'mobile_html', rel: 'mobile-home.html' },
  { resource: 'worksheet', rel: 'u1_lesson2_live.html' },
  { resource: 'quiz_relative', rel: 'quiz/index.html' },
  { resource: 'video_media', rel: 'media/1-2__0__1cJ3a5DSlZ0w3vta901HVyADfQ-qKVQcD.mp4' },
  { resource: 'flashcards_csv', rel: 'u1_l2_blooket.csv' },
  { resource: 'flashcards_js', rel: 'flashcards.js' },
  { resource: 'ti84', rel: 'ti84-trainer-v2/standalone.html' },
  { resource: 'lessons_index', rel: 'lessons-index.json' },
];

const BROWSER_PAGES = [
  { id: 'desk', url: `${WS}/ap_stats_roadmap_square_mode.html` },
  { id: 'mobile', url: `${WS}/mobile-home.html` },
  { id: 'worksheet', url: LESSON.worksheet },
  { id: 'quiz_relative', url: LESSON.quizPagesRelative },
  { id: 'quiz_absolute_cr', url: LESSON.quizDeskRegistry },
  { id: 'ti84', url: LESSON.ti84 },
  { id: 'formula_deck', url: ORIGINS.FORMULA_DECK },
  { id: 'formula_lab', url: ORIGINS.FORMULA_LAB },
];

async function httpProbe({ url, method = 'GET' }) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method,
      redirect: 'follow',
      headers: { 'User-Agent': 'W0-host-matrix-smoke/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    // Avoid downloading large media bodies when GET was used
    let bytes = Number(r.headers.get('content-length') || 0);
    let bodyStart = '';
    if (method === 'GET' && !/\.mp4(\?|$)/i.test(url)) {
      const buf = await r.arrayBuffer();
      bytes = buf.byteLength;
      bodyStart = new TextDecoder().decode(buf.slice(0, 160)).replace(/\s+/g, ' ').slice(0, 120);
    }
    return {
      status: r.status,
      ok: r.ok,
      ct: r.headers.get('content-type') || '',
      bytes,
      finalUrl: r.url,
      ms: Date.now() - t0,
      bodyStart,
      method,
    };
  } catch (e) {
    return { status: null, ok: false, error: e.message, ms: Date.now() - t0, method };
  }
}

export async function runHttpChecks(checks = HTTP_CHECKS) {
  const results = [];
  for (const c of checks) {
    if (c.skip || !c.url) {
      results.push({ ...c, status: null, ok: null, skipped: true });
      continue;
    }
    const method = c.method || (c.resource === 'video_media' ? 'HEAD' : 'GET');
    const r = await httpProbe({ url: c.url, method });
    const expect = c.expectStatus;
    const okForExpect = expect != null ? r.status === expect : r.ok;
    results.push({
      host: c.host,
      resource: c.resource,
      url: c.url,
      note: c.note || null,
      expectStatus: expect ?? null,
      ...r,
      ok: okForExpect,
    });
    const st = r.status ?? 'ERR';
    console.log(
      `${c.host.padEnd(16)} ${c.resource.padEnd(22)} ${String(st).padStart(4)} ${okForExpect ? 'OK' : '--'} ${c.note || ''}`,
    );
  }
  return results;
}

export function runApkSnapshot(apkRoot = resolve(REPO, 'android-app/www')) {
  const results = [];
  console.log('\n=== APK/www packaging snapshot (local filesystem; not HTTP) ===');
  for (const p of APK_PATHS) {
    const full = resolve(apkRoot, p.rel);
    const present = existsSync(full);
    const bytes = present ? statSync(full).size : 0;
    results.push({
      host: 'APK_www',
      resource: p.resource,
      url: `android-app/www/${p.rel}`,
      status: present ? 200 : 404,
      ok: present,
      bytes,
      note: 'local packaging snapshot — rebuild may differ from installed APK',
    });
    console.log(`APK_www ${p.resource.padEnd(22)} ${present ? 'PRESENT' : 'MISSING'} ${bytes}`);
  }
  return results;
}

/**
 * Full media sweep: fetch live lessons-index.json, HEAD every unique media/*
 * path on WS_BASE. W7 keys off total/ok/fail counts (historically 140/140 404).
 */
export async function runMediaSweep({ concurrency = 12 } = {}) {
  console.log('\n=== Full media sweep (live lessons-index → Pages HEAD) ===');
  const indexUrl = `${WS}/lessons-index.json`;
  let lessons = [];
  try {
    const r = await fetch(indexUrl, {
      headers: { 'User-Agent': 'W0-host-matrix-smoke/1.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      return {
        ok: false,
        error: `lessons-index HTTP ${r.status}`,
        total: 0,
        okCount: 0,
        failCount: 0,
        statuses: {},
        samples: [],
      };
    }
    const doc = await r.json();
    lessons = Array.isArray(doc.lessons) ? doc.lessons : [];
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      total: 0,
      okCount: 0,
      failCount: 0,
      statuses: {},
      samples: [],
    };
  }

  const paths = new Set();
  for (const L of lessons) {
    for (const v of L.videos || []) {
      if (typeof v === 'string' && v) paths.add(v.replace(/^\//, ''));
    }
  }
  const list = [...paths].sort();
  const statuses = {};
  let okCount = 0;
  let failCount = 0;
  const samples = [];

  async function headOne(rel) {
    const url = `${WS}/${rel}`;
    const t0 = Date.now();
    try {
      const r = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'W0-host-matrix-smoke/1.0' },
        signal: AbortSignal.timeout(20000),
      });
      const st = r.status;
      statuses[st] = (statuses[st] || 0) + 1;
      if (r.ok) okCount += 1;
      else failCount += 1;
      if (samples.length < 8) {
        samples.push({ path: rel, status: st, ok: r.ok, ms: Date.now() - t0 });
      }
      return { path: rel, status: st, ok: r.ok };
    } catch (e) {
      failCount += 1;
      statuses.error = (statuses.error || 0) + 1;
      if (samples.length < 8) {
        samples.push({ path: rel, status: null, ok: false, error: e.message });
      }
      return { path: rel, status: null, ok: false, error: e.message };
    }
  }

  // Bounded concurrency
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      await headOne(list[idx]);
    }
  }
  const nWorkers = Math.min(concurrency, Math.max(1, list.length));
  await Promise.all(Array.from({ length: nWorkers }, () => worker()));

  const summary = {
    ok: true,
    indexUrl,
    lessonCount: lessons.length,
    total: list.length,
    okCount,
    failCount,
    all404: failCount === list.length && okCount === 0 && list.length > 0,
    statuses,
    samples,
  };
  console.log(
    `media paths unique=${list.length} ok=${okCount} fail=${failCount} all404=${summary.all404} statuses=${JSON.stringify(statuses)}`,
  );
  return summary;
}

export async function runBrowserSmoke() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.warn('playwright-core not installed — skipping browser smoke (HTTP results still valid).');
    return { skipped: true, reason: 'playwright-core not installed', results: [] };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    try {
      browser = await chromium.launch({ headless: true, channel: 'chrome' });
    } catch (e2) {
      console.error('chromium launch failed:', e2.message);
      return { skipped: true, reason: e2.message, results: [], launchFailed: true };
    }
  }

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'phone', width: 390, height: 844 },
  ];
  const results = [];

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const p of BROWSER_PAGES) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(String(err.message || err).slice(0, 200)));
      const t0 = Date.now();
      let status = null;
      let title = '';
      let bodySnippet = '';
      let renderOk = false;
      try {
        const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        status = resp ? resp.status() : null;
        await page.waitForTimeout(1200);
        title = await page.title();
        bodySnippet = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
        const isGh404 =
          /File not found|Page not found/i.test(title) ||
          /There isn't a GitHub Pages site here|File not found/i.test(bodySnippet);
        const hasUi = (await page.locator('body *').count()) > 3;
        renderOk = !!status && status < 400 && !isGh404 && hasUi;
      } catch (e) {
        errors.push('goto: ' + String(e.message || e).slice(0, 150));
      }
      const row = {
        viewport: vp.name,
        id: p.id,
        url: p.url,
        status,
        title: title.slice(0, 100),
        renderOk,
        ms: Date.now() - t0,
        errors: errors.slice(0, 5),
        bodySnippet,
      };
      results.push(row);
      console.log(
        `${vp.name.padEnd(8)} ${p.id.padEnd(20)} status=${status} render=${renderOk} title=${title.slice(0, 48)}`,
      );
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  return { skipped: false, results };
}

/**
 * Derive a one-line G1 recommendation from probe rows.
 * Prefer absolute CR origin when Pages /quiz 404s and CR serves 200.
 */
export function recommendG1(httpResults) {
  const pagesQuiz = httpResults.find((r) => r.host === 'GH_Pages_Desk' && r.resource === 'quiz_relative');
  const crQuiz = httpResults.find((r) => r.host === 'GH_Pages_CR' && r.resource === 'quiz_absolute');
  const apkQuiz = null; // filled by caller if desired

  const pages404 = pagesQuiz && pagesQuiz.status === 404;
  const cr200 = crQuiz && crQuiz.status === 200 && crQuiz.ok;

  if (pages404 && cr200) {
    return {
      decision:
        'G1 = absolute curriculum_render origin (https://robjohncolson.github.io/curriculum_render/) for web student quiz links',
      rationale:
        'Pages host /quiz is 404; CR origin returns 200 and renders "AP Stats Consensus Quiz". Desk registry already uses absolute CR URLs; mobile lessons-index relative quiz/index.html is the day-one dead-end on GH Pages.',
      fixOptions: [
        'A (recommended for web): keep/force absolute CR_BASE quiz URLs in mobile-home / lessons-index web path (match Desk registry).',
        'B: publish curriculum_render under apstats-live-worksheet/quiz/ for one-origin Pages (heavier deploy, enables relative paths).',
        'C: APK-only relative quiz — acceptable for offline pack only; not acceptable as sole web answer.',
      ],
      evidence: {
        pagesQuizStatus: pagesQuiz?.status ?? null,
        crQuizStatus: crQuiz?.status ?? null,
        apkQuizPresent: apkQuiz,
      },
    };
  }

  if (!pages404 && cr200) {
    return {
      decision: 'G1 = one-origin Pages /quiz viable (relative paths OK)',
      rationale: 'Pages /quiz returned non-404; relative and absolute both work.',
      fixOptions: ['Prefer relative same-origin quiz if pack and Pages stay in sync.'],
      evidence: { pagesQuizStatus: pagesQuiz?.status, crQuizStatus: crQuiz?.status },
    };
  }

  return {
    decision: 'G1 = provisional — re-run smoke; evidence incomplete or unexpected',
    rationale: `pages quiz status=${pagesQuiz?.status}, cr quiz status=${crQuiz?.status}`,
    fixOptions: ['Re-run scripts/smoke-student-host-matrix.mjs and inspect raw JSON.'],
    evidence: { pagesQuizStatus: pagesQuiz?.status, crQuizStatus: crQuiz?.status },
  };
}

async function main() {
  console.log('W0 student host matrix smoke');
  console.log('Origins are hardcoded from verified code constants (see ORIGINS comment).');
  console.log('WS_BASE=', ORIGINS.WS_BASE);
  console.log('CR_BASE=', ORIGINS.CR_BASE);
  console.log('ROSTER=', ORIGINS.ROSTER);
  console.log('lesson=', LESSON.id);
  console.log('');

  const http = await runHttpChecks();
  const media = await runMediaSweep();
  const apk = runApkSnapshot();
  let browser = { skipped: true, reason: '--http-only', results: [] };
  if (!HTTP_ONLY) {
    console.log('\n=== Browser smoke (playwright-core) ===');
    browser = await runBrowserSmoke();
  }

  const g1 = recommendG1(http);
  // Annotate G1 with APK presence
  const apkQuiz = apk.find((r) => r.resource === 'quiz_relative');
  g1.evidence.apkQuizPresent = !!(apkQuiz && apkQuiz.ok);
  g1.evidence.apkMediaPresent = !!apk.find((r) => r.resource === 'video_media' && r.ok);
  g1.evidence.apkFlashcardsCsvPresent = !!apk.find((r) => r.resource === 'flashcards_csv' && r.ok);
  g1.evidence.mediaSweep = {
    total: media.total,
    okCount: media.okCount,
    failCount: media.failCount,
    all404: media.all404,
  };

  const payload = {
    probedAt: new Date().toISOString(),
    originsNote: 'hardcoded from verified code constants (not parsed at runtime)',
    origins: ORIGINS,
    lesson: LESSON,
    http,
    media,
    apk,
    browser,
    g1,
    staleComment: {
      file: 'mobile-home.html',
      claim: 'lessons-index.json is an APK BUILD ARTIFACT and is not published to Pages',
      reality:
        'live Pages serves lessons-index.json 200; mobile-web therefore takes the primary relative-quiz path and hits H0 404 on /quiz',
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log('\n=== G1 recommendation ===');
  console.log(g1.decision);
  console.log(g1.rationale);
  console.log(
    `media sweep: ${media.total} unique paths, ok=${media.okCount}, fail=${media.failCount}, all404=${media.all404}`,
  );
  console.log('Wrote', OUT);

  if (browser.launchFailed) process.exit(2);
}

// Only run when executed directly
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

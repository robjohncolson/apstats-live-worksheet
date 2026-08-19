#!/usr/bin/env node

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePromptsSource } from './frq-regrade-manifest.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(THIS_FILE), '..');
const DEFAULT_CONFIG_PATH = join(homedir(), 'grade-backups', 'config.json');
const DEFAULT_LOG_PATH = join(homedir(), 'grade-backups', 'frq-regrade.log');
const DEFAULT_MANIFEST_PATH = resolve(ROOT, 'data/frq-regrade-manifest.json');
export const MINIMUM_ROW_AGE_MS = 10 * 60 * 1_000;
export const GRADER_INTERVAL_MS = 60_000 / 20;

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseRecordedTime(record) {
  const value = record.recorded_at ?? record.recordedAt ?? record.ts;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value) return Number.NaN;
  return Date.parse(value);
}

export function indexManifest(manifest) {
  const byItemId = new Map();
  for (const worksheet of manifest.worksheets || []) {
    for (const textareaId of worksheet.textareaIds || []) {
      const itemId = `${worksheet.prefix}-${textareaId}`;
      if (byItemId.has(itemId)) throw new Error(`duplicate manifest itemId: ${itemId}`);
      byItemId.set(itemId, { worksheet, textareaId });
    }
  }
  return byItemId;
}

export function selectUngradedFrqRows(snapshot, manifest, options = {}) {
  const now = options.now ?? Date.now();
  const minimumAgeMs = options.minimumAgeMs ?? MINIMUM_ROW_AGE_MS;
  const byItemId = indexManifest(manifest);
  const selected = [];

  for (const student of snapshot.students || []) {
    if (options.student && student.username !== options.student) continue;

    for (const record of student.bundle?.records || []) {
      if (record.source !== 'frq') continue;
      if (record.score !== null && record.score !== undefined) continue;
      if (typeof record.response !== 'string' || record.response.trim().length < 20) continue;

      const itemId = record.itemId ?? record.item_id;
      const match = byItemId.get(itemId);
      if (!match) continue;

      const recordedAt = parseRecordedTime(record);
      if (Number.isFinite(recordedAt) && now - recordedAt < minimumAgeMs) continue;

      selected.push({
        studentId: student.studentId,
        username: student.username,
        itemId,
        response: record.response,
        attempt: record.attempt ?? 1,
        worksheet: match.worksheet,
        textareaId: match.textareaId,
        record,
      });
    }
  }

  return selected;
}

export const selectEligibleRows = selectUngradedFrqRows;

export function verdictToScore(verdict, missing) {
  const rawScore = verdict && typeof verdict === 'object' ? verdict.score : verdict;
  const missingElements = verdict && typeof verdict === 'object' ? verdict.missing : missing;
  const letter = rawScore == null ? '' : String(rawScore).trim().charAt(0).toUpperCase();
  if (!(letter === 'E' || letter === 'P' || letter === 'I')) return null;
  if (letter === 'P' && Array.isArray(missingElements) && missingElements.length === 0) return 1;
  return { E: 1, P: 0.5, I: 0 }[letter];
}

export function buildPrompt(worksheet, textareaId, response, promptWindow) {
  const builder = promptWindow[worksheet.builderName];
  if (typeof builder !== 'function') {
    throw new Error(`${worksheet.promptsFile}: ${worksheet.builderName} is not a function`);
  }
  const prompt = builder(textareaId, response);
  if (typeof prompt !== 'string' || !prompt) {
    throw new Error(`${worksheet.filename}: prompt builder returned no prompt for ${textareaId}`);
  }
  return prompt;
}

export function buildGraderRequest(worksheet, textareaId, response, prompt, lessonContext) {
  return {
    scenario: {
      topic: worksheet.topic,
      questionId: textareaId,
      lessonContext,
    },
    answers: { answer: response },
    prompt,
  };
}

export function buildRegradeRequest(candidate, score) {
  const body = {
    studentId: candidate.studentId,
    itemId: candidate.itemId,
    score,
    provenance: 'ai-batch',
  };
  if (Number(candidate.attempt) !== 1) body.attempt = candidate.attempt;
  return body;
}

export class IntervalRateLimiter {
  constructor({ intervalMs = GRADER_INTERVAL_MS, now = Date.now, sleep = delay } = {}) {
    this.intervalMs = intervalMs;
    this.now = now;
    this.sleep = sleep;
    this.nextStartAt = 0;
  }

  async wait() {
    const current = this.now();
    const waitMs = Math.max(0, this.nextStartAt - current);
    if (waitMs) await this.sleep(waitMs);
    this.nextStartAt = Math.max(this.nextStartAt, this.now()) + this.intervalMs;
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function loadPromptWindow(rootDir, worksheet, cache) {
  if (cache.has(worksheet.promptsFile)) return cache.get(worksheet.promptsFile);
  const source = readFileSync(resolve(rootDir, worksheet.promptsFile), 'utf8');
  const { window } = evaluatePromptsSource(source, worksheet.promptsFile);
  cache.set(worksheet.promptsFile, window);
  return window;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export async function fetchSnapshot(config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${stripTrailingSlash(config.rosterUrl)}/admin/snapshot`, {
    headers: { 'x-teacher-secret': config.teacherKey },
  });
  if (!response.ok) throw new Error(`snapshot request failed with HTTP ${response.status}`);
  const snapshot = await readJsonResponse(response);
  if (!snapshot || !Array.isArray(snapshot.students)) throw new Error('snapshot response was malformed');
  return snapshot;
}

function worksheetCounts(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    counts[candidate.worksheet.filename] = (counts[candidate.worksheet.filename] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export async function runRegradeJob(options) {
  const {
    config,
    manifest,
    apply = false,
    limit = Number.POSITIVE_INFINITY,
    student,
    rootDir = ROOT,
    now = Date.now(),
    fetchImpl = globalThis.fetch,
    rateLimiter = new IntervalRateLimiter(),
    onEvent = () => {},
  } = options;

  const snapshot = await fetchSnapshot(config, fetchImpl);
  const allCandidates = selectUngradedFrqRows(snapshot, manifest, { now, student });
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : allCandidates.length;
  const candidates = allCandidates.slice(0, boundedLimit);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    found: candidates.length,
    graded: 0,
    applied: 0,
    floorHeld: 0,
    failed: 0,
    worksheetCounts: worksheetCounts(candidates),
    grader5xx: false,
  };

  if (!apply) return { summary, candidates, exitCode: 0 };

  const promptCache = new Map();
  const graderUrl = `${stripTrailingSlash(manifest.railwayServerUrl)}/api/ai/grade`;
  const regradeUrl = `${stripTrailingSlash(config.rosterUrl)}/ledger/frq-regrade`;

  for (const candidate of candidates) {
    try {
      const promptWindow = loadPromptWindow(rootDir, candidate.worksheet, promptCache);
      const prompt = buildPrompt(
        candidate.worksheet,
        candidate.textareaId,
        candidate.response,
        promptWindow,
      );
      const graderBody = buildGraderRequest(
        candidate.worksheet,
        candidate.textareaId,
        candidate.response,
        prompt,
        promptWindow[candidate.worksheet.contextName],
      );

      await rateLimiter.wait();
      const graderResponse = await fetchImpl(graderUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graderBody),
      });
      if (graderResponse.status >= 500 && graderResponse.status <= 599) summary.grader5xx = true;
      if (!graderResponse.ok) {
        summary.failed += 1;
        let snippet = '';
        try { snippet = String(await graderResponse.text()).slice(0, 160).replace(/\s+/g, ' '); } catch (_) {}
        onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId, reason: `grader HTTP ${graderResponse.status} ${snippet}` });
        continue;
      }

      const result = await readJsonResponse(graderResponse);
      const score = verdictToScore(result);
      if (score === null) {
        summary.failed += 1;
        onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId, reason: `unusable verdict: ${JSON.stringify(result && result.score)} (${String(result && result.feedback || '').slice(0, 80)})` });
        continue;
      }
      summary.graded += 1;

      const regradeResponse = await fetchImpl(regradeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teacher-secret': config.teacherKey,
        },
        body: JSON.stringify(buildRegradeRequest(candidate, score)),
      });
      if (!regradeResponse.ok) {
        summary.failed += 1;
        onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId, score, reason: `regrade HTTP ${regradeResponse.status}` });
        continue;
      }

      const appliedResult = await readJsonResponse(regradeResponse);
      if (appliedResult?.applied === false) {
        summary.floorHeld += 1;
        onEvent({ type: 'floor-held', username: candidate.username, itemId: candidate.itemId, score });
        continue;
      }
      if (appliedResult?.applied !== true) {
        summary.failed += 1;
        onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId, score });
        continue;
      }

      summary.applied += 1;
      onEvent({ type: 'applied', username: candidate.username, itemId: candidate.itemId, score });
    } catch (_) {
      summary.failed += 1;
      onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId });
    }
  }

  return { summary, candidates, exitCode: summary.grader5xx ? 1 : 0 };
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    limit: Number.POSITIVE_INFINITY,
    student: undefined,
    configPath: DEFAULT_CONFIG_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.apply = false;
      continue;
    }
    if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 0) throw new Error('--limit requires a non-negative integer');
      options.limit = value;
      index += 1;
      continue;
    }
    if (arg === '--student') {
      options.student = argv[index + 1];
      if (!options.student) throw new Error('--student requires a username');
      index += 1;
      continue;
    }
    if (arg === '--config') {
      options.configPath = resolve(argv[index + 1] || '');
      if (!argv[index + 1]) throw new Error('--config requires a path');
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

export function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!config.rosterUrl || !config.teacherKey) {
    throw new Error(`${configPath}: rosterUrl and teacherKey are required`);
  }
  return { rosterUrl: config.rosterUrl, teacherKey: config.teacherKey };
}

export function appendSummary(summary, logPath = DEFAULT_LOG_PATH) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...summary })}\n`);
}

function printSummary(summary) {
  if (summary.mode === 'dry-run') {
    console.log(`Dry run: ${summary.found} FRQ row(s) would be graded.`);
    for (const [filename, count] of Object.entries(summary.worksheetCounts)) {
      console.log(`${filename}: ${count}`);
    }
  }
  console.log(
    `Summary: found=${summary.found} graded=${summary.graded} applied=${summary.applied} `
      + `floorHeld=${summary.floorHeld} failed=${summary.failed}`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  const config = loadConfig(cli.configPath);
  const manifest = JSON.parse(readFileSync(DEFAULT_MANIFEST_PATH, 'utf8'));
  const result = await runRegradeJob({
    config,
    manifest,
    apply: cli.apply,
    limit: cli.limit,
    student: cli.student,
    onEvent(event) {
      if (event.type === 'applied') {
        console.log(`Applied ${event.username} ${event.itemId} score=${event.score}`);
      } else if (event.type === 'floor-held') {
        console.log(`Floor held ${event.username} ${event.itemId} score=${event.score}`);
      } else {
        console.error(`Failed ${event.username} ${event.itemId}${event.score === undefined ? '' : ` score=${event.score}`}${event.reason ? ` — ${event.reason}` : ''}`);
      }
    },
  });
  printSummary(result.summary);
  appendSummary({
    ...result.summary,
    student: cli.student || null,
    limit: Number.isFinite(cli.limit) ? cli.limit : null,
  });
  return result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

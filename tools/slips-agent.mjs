#!/usr/bin/env node
// Local print agent for the paper "where you stand" slips (SLIPS_V2_SPEC.md §2).
//
// Loopback only. The DOK app's teacher panel POSTs here; the agent runs
// `node scripts/weekly-slips.mjs` on THIS laptop (slips carry names, so they are never built
// on a server), then opens the output folder. The agent never reads or forwards the teacher
// secret: the slips script resolves it itself.
//
//   node tools/slips-agent.mjs              # 127.0.0.1:47831
//   node tools/slips-agent.mjs --port 47899

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SLIPS_AGENT_PORT = 47831;
export const VERSION = '1';
const HOST = '127.0.0.1';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(REPO, 'tools', '.slips-agent-logs');
const DEFAULT_OUT = path.join(os.homedir(), 'grade-backups', 'slips');
const RUN_TIMEOUT_MS = 120000;
const MAX_BODY_BYTES = 4096;
const SECTION_RE = /^Period[A-Z]$/;
const ALLOWED_ORIGINS = ['https://robjohncolson.github.io', 'https://apstats-live-worksheet.vercel.app'];
const LOOPBACK_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
// DNS-rebinding guard: a browser only reaches us under one of these Host names.
const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function originAllowed(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return LOOPBACK_ORIGIN_RE.test(origin);
}

// "Slips: 9 printed candidates (B 5, E 4) -> C:\...\slips" → { counts: { B: 5, E: 4 }, out }.
export function parseSummaryLine(line) {
  const match = /^Slips: \d+ .*?\(([^)]*)\) -> (.+)$/.exec(String(line || '').trim());
  if (!match) return null;
  const counts = {};
  for (const part of match[1].split(',')) {
    const pair = /^\s*([A-Z])\s+(\d+)\s*$/.exec(part);
    if (pair) counts[pair[1]] = Number(pair[2]);
  }
  return { counts, out: match[2].trim() };
}

// The last `Slips:` line of the script's stdout plus every PDF it reported writing.
export function parseSummary(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  const summaryLine = lines.filter(line => line.startsWith('Slips: ')).pop();
  const summary = parseSummaryLine(summaryLine);
  if (!summary) return null;
  const pdfs = lines
    .map(line => /^Period[A-Z]: \d+ candidates -> (.+\.pdf)$/.exec(line.trim()))
    .filter(Boolean)
    .map(match => match[1]);
  return { ...summary, pdfs, line: summaryLine.trim() };
}

function tailLines(text, count) {
  return String(text || '').split(/\r?\n/).filter(line => line.trim()).slice(-count);
}

// "Last printed": the newest *-slips.pdf in the output folder, with the counts from the last
// `Slips:` line of weekly.log (written by the Monday task and by this agent's own runs).
export function readLastRun({ outDir = DEFAULT_OUT, weeklyLog = path.join(LOG_DIR, 'weekly.log') } = {}) {
  let newest = null;
  try {
    for (const name of fs.readdirSync(outDir)) {
      if (!name.endsWith('-slips.pdf')) continue;
      const mtime = fs.statSync(path.join(outDir, name)).mtimeMs;
      if (!newest || mtime > newest) newest = mtime;
    }
  } catch (_) {
    return null;
  }
  if (!newest) return null;
  let summary = null;
  try {
    const line = fs.readFileSync(weeklyLog, 'utf8').split(/\r?\n/).filter(text => text.startsWith('Slips: ')).pop();
    summary = parseSummaryLine(line);
  } catch (_) {
    summary = null;
  }
  return { at: new Date(newest).toISOString(), counts: summary ? summary.counts : null, out: summary ? summary.out : outDir };
}

// Runs the slips script: argv only (execFile, never a shell), repo root as cwd, 120 s cap.
export function defaultRunSlips(args) {
  return new Promise(resolve => {
    const script = path.join(REPO, 'scripts', 'weekly-slips.mjs');
    execFile(process.execPath, [script, ...args], { cwd: REPO, timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) code = typeof error.code === 'number' ? error.code : 1;
        const timedOut = error && error.killed ? '\nweekly-slips timed out after 120 s' : '';
        resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') + timedOut });
      });
  });
}

// Best-effort: explorer.exe exits 1 even when it opened the window, so errors are ignored.
function defaultOpenFolder(folder) {
  if (process.platform !== 'win32') return;
  try {
    execFile('explorer.exe', [folder], { windowsHide: false }, () => {});
  } catch (_) { /* best-effort */ }
}

function makeLogger(logFile) {
  if (!logFile) return () => {};
  return message => {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
    } catch (_) { /* logging never breaks a request */ }
  };
}

function appendWeeklyLog(weeklyLog, line) {
  if (!weeklyLog) return;
  try {
    fs.mkdirSync(path.dirname(weeklyLog), { recursive: true });
    fs.appendFileSync(weeklyLog, `=== ${new Date().toISOString()} print agent ===\n${line}\n`);
  } catch (_) { /* best-effort */ }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Validated script flags from the optional JSON body, or null when the body is invalid.
export function slipArgs(body) {
  if (body == null) return [];
  if (typeof body !== 'object' || Array.isArray(body)) return null;
  const args = [];
  if (body.section !== undefined) {
    if (typeof body.section !== 'string' || !SECTION_RE.test(body.section)) return null;
    args.push('--section', body.section);
  }
  if (body.all !== undefined) {
    if (typeof body.all !== 'boolean') return null;
    if (body.all) args.push('--all');
  }
  return args;
}

export function createServer(opts = {}) {
  const runSlips = opts.runSlips || defaultRunSlips;
  const openFolder = opts.openFolder || defaultOpenFolder;
  const outDir = opts.outDir || DEFAULT_OUT;
  const weeklyLog = opts.weeklyLog === undefined ? path.join(LOG_DIR, 'weekly.log') : opts.weeklyLog;
  const log = makeLogger(opts.logFile === undefined ? path.join(LOG_DIR, 'agent.log') : opts.logFile);
  let running = false;

  function send(res, status, payload, origin) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
  }

  async function handleSlips(req, res, origin) {
    let body = null;
    try {
      const text = await readBody(req);
      body = text.trim() ? JSON.parse(text) : null;
    } catch (_) {
      return send(res, 400, { ok: false, error: 'bad-request' }, origin);
    }
    const args = slipArgs(body);
    if (!args) return send(res, 400, { ok: false, error: 'bad-request' }, origin);
    if (running) return send(res, 409, { ok: false, error: 'busy' }, origin);
    running = true;
    log(`run weekly-slips ${args.join(' ')}`.trim());
    try {
      const result = await runSlips(args);
      const summary = result && result.code === 0 ? parseSummary(result.stdout) : null;
      if (!summary) {
        // Diagnostics stay in the private local log: script output can quote student rows,
        // and the caller is a public web page (Codex review 2026-09-26).
        const tail = tailLines(result && result.stderr, 20);
        log(`failed (${result ? result.code : 'no result'}): ${tail.join(' | ') || 'no summary line'}`);
        return send(res, 500, { ok: false, error: 'The slips build failed. Details are in tools/.slips-agent-logs/agent.log on this computer.' }, origin);
      }
      log(summary.line);
      appendWeeklyLog(weeklyLog, summary.line);
      openFolder(summary.out);
      return send(res, 200, { ok: true, counts: summary.counts, out: summary.out, pdfs: summary.pdfs }, origin);
    } finally {
      running = false;
    }
  }

  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (!LOOPBACK_HOST_RE.test(String(req.headers.host || ''))) return send(res, 403, { ok: false, error: 'forbidden' });
    if (origin !== undefined && !originAllowed(origin)) return send(res, 403, { ok: false, error: 'forbidden-origin' });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      };
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      // Chrome's Private Network Access preflight (a public page calling a loopback address).
      if (req.headers['access-control-request-private-network'] === 'true') headers['Access-Control-Allow-Private-Network'] = 'true';
      res.writeHead(204, headers);
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, agent: 'slips', version: VERSION, lastRun: readLastRun({ outDir, weeklyLog }) }, origin);
    }
    if (req.method === 'POST' && url.pathname === '/slips') {
      handleSlips(req, res, origin).catch(() => send(res, 500, { ok: false, error: 'agent error' }, origin));
      return undefined;
    }
    return send(res, 404, { ok: false, error: 'not-found' }, origin);
  });
}

export function parsePort(args) {
  const index = args.indexOf('--port');
  if (index < 0) return SLIPS_AGENT_PORT;
  const port = Number(args[index + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be 1-65535');
  return port;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.argv.slice(2));
  const server = createServer();
  server.listen(port, HOST, () => console.log(`slips agent listening on http://${HOST}:${port}`));
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';

const API_BASE = 'https://curriculumrender-production.up.railway.app';
const DELAY_MS = 500;
const ID_PATTERN = /"id":\s*"(U\d-[^"]+-QS\d+)"/g;
const SUPPLEMENT_FILE = new URL('../data/formula-probe-supplement.js', import.meta.url);
const REPORT_DIR = new URL('../probe-signal-reports/', import.meta.url);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTodayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function readProbeIds() {
  const source = await readFile(SUPPLEMENT_FILE, 'utf8');
  const ids = [...source.matchAll(ID_PATTERN)].map((match) => match[1]);

  return [...new Set(ids)].sort();
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) {
    return '-';
  }

  const parsed = new Date(lastSeen);
  if (Number.isNaN(parsed.getTime())) {
    return String(lastSeen);
  }

  return parsed.toISOString().slice(0, 10);
}

function formatAnswerDistribution(answers) {
  if (!answers || typeof answers !== 'object') {
    return '-';
  }

  const parts = Object.entries(answers)
    .map(([choice, count]) => [choice, Number(count)])
    .filter(([, count]) => Number.isFinite(count))
    .map(([choice, count]) => `${choice}:${count}`);

  return parts.length > 0 ? parts.join(' ') : '-';
}

function getTotal(stats) {
  const directTotal = Number(stats?.total);
  if (Number.isFinite(directTotal)) {
    return directTotal;
  }

  if (!stats?.answers || typeof stats.answers !== 'object') {
    return 0;
  }

  return Object.values(stats.answers)
    .map((count) => Number(count))
    .filter((count) => Number.isFinite(count))
    .reduce((sum, count) => sum + count, 0);
}

function normalizeError(error) {
  const message = typeof error?.message === 'string' ? error.message : String(error);

  if (/fetch failed|network|timed out|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    return 'network unreachable';
  }

  return message;
}

async function fetchProbeSignal(id) {
  const url = `${API_BASE}/api/question-stats/${encodeURIComponent(id)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        id,
        status: 'error',
        error: `${response.status} ${response.statusText || 'HTTP error'}`.trim(),
      };
    }

    const stats = await response.json();
    const total = getTotal(stats);

    return {
      id,
      total,
      answerDist: formatAnswerDistribution(stats?.answers),
      lastSeen: formatLastSeen(stats?.lastSeen),
      status: total >= 1 ? 'signal' : 'silent',
    };
  } catch (error) {
    return {
      id,
      status: 'error',
      error: normalizeError(error),
    };
  }
}

function buildSignalRows(results) {
  if (results.length === 0) {
    return '| None | - | - | - |';
  }

  return results
    .map(
      (result) =>
        `| ${result.id} | ${result.total} | ${result.answerDist || '-'} | ${result.lastSeen || '-'} |`,
    )
    .join('\n');
}

function buildBulletList(items, formatter) {
  if (items.length === 0) {
    return '- None';
  }

  return items.map(formatter).join('\n');
}

function buildReport(dateStamp, results) {
  const signal = results.filter((result) => result.status === 'signal');
  const silent = results.filter((result) => result.status === 'silent');
  const errors = results.filter((result) => result.status === 'error');

  return [
    `# Supplement Probe Signal Report - ${dateStamp}`,
    '',
    `**Queried**: ${results.length} probes | **Signal**: ${signal.length} | **Silent**: ${silent.length} | **Errors**: ${errors.length}`,
    '',
    '## Signal (has student submissions)',
    '| Probe | Total | Answer distribution | Last seen |',
    '|-------|-------|---------------------|-----------|',
    buildSignalRows(signal),
    '',
    '## Silent (zero submissions)',
    buildBulletList(silent, (result) => `- ${result.id}`),
    '',
    '## Errors',
    buildBulletList(errors, (result) => `- ${result.id} - ${result.error || 'Unknown error'}`),
    '',
  ].join('\n');
}

async function main() {
  const probeIds = await readProbeIds();
  const dateStamp = getTodayStamp();
  const reportPath = `probe-signal-reports/${dateStamp}.md`;
  const reportFile = new URL(`../${reportPath}`, import.meta.url);
  const results = [];

  for (let index = 0; index < probeIds.length; index += 1) {
    const id = probeIds[index];
    results.push(await fetchProbeSignal(id));

    if (index < probeIds.length - 1) {
      await delay(DELAY_MS);
    }
  }

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(reportFile, buildReport(dateStamp, results), 'utf8');

  const signalCount = results.filter((result) => result.status === 'signal').length;
  console.log(`Signal: ${signalCount}/${probeIds.length} probes have real-student data. Report: ${reportPath}`);

  if (results.length > 0 && results.every((result) => result.status === 'error')) {
    process.exitCode = 1;
  }
}

main();

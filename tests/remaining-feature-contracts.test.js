/**
 * Remaining feature-contract coverage for the canonical user-story tracker.
 *
 * These are intentionally narrow, high-level checks for public entry points and
 * Start Here helper behavior that were otherwise only manually documented.
 */

import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const START = readFileSync(resolve(repo, 'start-here.html'), 'utf8');
const INDEX = readFileSync(resolve(repo, 'index.html'), 'utf8');
const TOC = readFileSync(resolve(repo, 'TOC.html'), 'utf8');
const WSX = readFileSync(resolve(repo, 'wsx.js'), 'utf8');
// Pin the LIVE shipping surfaces (not the dead wsx.js extraction) for features
// that were only manually documented before the audit.
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const SG = readFileSync(resolve(repo, 'study_guide_diagnostic.html'), 'utf8');

function extractStartHereProgressScript() {
  const match = START.match(/<script src="roster-client\.js"><\/script>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!match) throw new Error('could not find Start Here progress script');
  return match[1];
}

function extractFunction(name) {
  const start = WSX.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`could not find ${name}()`);

  const brace = WSX.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < WSX.length; i += 1) {
    const ch = WSX[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return WSX.slice(start, i + 1);
  }
  throw new Error(`could not extract ${name}()`);
}

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('F002 Start Here orientation and expectations', () => {
  it('keeps the course orientation, expectations, grade model, toolkit, and Desk path present', () => {
    const markers = [
      'Welcome to AP Statistics',
      'My promise to you',
      "What I'll ask of you",
      'The rhythm',
      'How your grade actually works',
      'Your summer on-ramp',
      'Your toolkit',
      'The Desk',
      'Your AI tutor',
      'ap_stats_roadmap_square_mode.html',
    ];

    for (const marker of markers) {
      expect(START).toContain(marker);
    }
  });
});

describe('F004 Start Here signed-in progress preview', () => {
  it('renders the signed-out fallback when identity or service config is unavailable', async () => {
    const dom = new JSDOM('<div id="wys-status"><p class="wys-loading">Loading</p></div>', {
      runScripts: 'outside-only',
      url: 'https://example.test/start-here.html',
    });

    dom.window.eval(extractStartHereProgressScript());
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await waitForMicrotasks();

    const fallback = dom.window.document.querySelector('.wys-signed-out');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toContain('Sign in on the Desk');
    expect(fallback.querySelector('a').getAttribute('href')).toBe('ap_stats_roadmap_square_mode.html');
  });

  it('fetches /grade with rosterClient.token() and renders quarter/unit progress for signed-in students', async () => {
    const dom = new JSDOM('<div id="wys-status"><p class="wys-loading">Loading</p></div>', {
      runScripts: 'outside-only',
      url: 'https://example.test/start-here.html',
    });
    const body = {
      ok: true,
      quarters: {
        Q1: { quarterGrade: 88.24, ceiling: 95.1, unitsGraded: 2, unitsTotal: 3 },
      },
      units: {
        U1: { unitGrade: 92.16, graded: true, banked: 90, P: 0.84 },
        U2: { unitGrade: null, graded: false, banked: null, P: 0 },
      },
      completion: {
        U1: { worksheet: 3, frq: 1, curriculum_quiz: 2 },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    });

    dom.window.rosterClient = { token: () => 'student-token' };
    dom.window.ROSTER_SERVICE_URL = 'https://roster.example';
    dom.window.fetch = fetchMock;
    dom.window.eval(extractStartHereProgressScript());
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await waitForMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith('https://roster.example/grade?token=student-token');
    expect(dom.window.document.querySelector('.wys-quarters').textContent).toContain('Q1');
    expect(dom.window.document.querySelector('.wys-unit .grade').textContent).toBe('92.2');
    expect(dom.window.document.body.textContent).toContain('Recorded: 4 worksheet items');
  });
});

describe('F034 AI tutor prompt copy', () => {
  it('copies lesson and progress-check tutor prompts from the expected ai-tutor paths', async () => {
    const dom = new JSDOM(
      '<span id="ai-tutor-status"></span><span id="ai-tutor-pc-status"></span>',
      { url: 'https://example.test/ap_stats_roadmap_square_mode.html' },
    );
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'AP Stats tutor prompt',
    });
    const context = createContext({
      document: dom.window.document,
      navigator: { clipboard },
      fetch: fetchMock,
      setTimeout: () => 0,
    });

    runInContext(
      [
        extractFunction('_copyTutorPromptByPath'),
        extractFunction('copyTutorPrompt'),
        extractFunction('copyTutorPromptPc'),
      ].join('\n'),
      context,
    );

    await context.copyTutorPrompt(1, 2);
    await context.copyTutorPromptPc(1);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'ai-tutor/u1_l2.md');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'ai-tutor/u1_pc.md');
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);
    expect(dom.window.document.getElementById('ai-tutor-status').textContent).toContain('Copied');
    expect(dom.window.document.getElementById('ai-tutor-pc-status').textContent).toContain('Copied');
  });
});

describe('F061 public worksheet table of contents', () => {
  it('index links TOC.html and TOC lists all 69 live worksheet files that exist on disk', () => {
    expect(INDEX).toMatch(/href="TOC\.html"/);
    expect(INDEX).toContain('69 video follow-alongs');

    const hrefs = [...TOC.matchAll(/href="([^"]*_live\.html)"/g)].map(match => match[1]);
    expect(hrefs).toHaveLength(69);
    expect(new Set(hrefs).size).toBe(69);

    for (const href of hrefs) {
      expect(existsSync(resolve(repo, href)), `${href} should exist`).toBe(true);
    }
  });
});

describe('F070 sealed transcript export + printable progress summary', () => {
  it('exports a sealed /transcript JSON as a download and offers a printable summary, both gated on a signed-in token', () => {
    // The Desk ships both export paths.
    expect(DESK).toMatch(/async function exportSealedTranscript\s*\(/);
    expect(DESK).toMatch(/async function printSealedSummary\s*\(/);
    // Authenticated fetch of the sealed transcript.
    expect(DESK).toMatch(/fetch\(\s*base \+ '\/transcript'/);
    expect(DESK).toContain("'Authorization': 'Bearer ' + token");
    // Token gate: no token -> sign-in message, never a silent/empty file.
    expect(DESK).toContain('_sealedTranscriptSignInMessage');
    // The transcript is serialized to a Blob and downloaded via a generated anchor.
    expect(DESK).toContain('new Blob([JSON.stringify(transcript, null, 2)]');
    expect(DESK).toMatch(/a\.download = _sealedTranscriptFilename\(transcript\)/);
  });
});

describe('F072 diagnostic study guide peer scoreboard', () => {
  it('renders a Scoreboard modal ranking students by green mastery-node count and highlights the signed-in student', () => {
    // A Scoreboard button wires to the modal opener.
    expect(SG).toContain("make('button', 'sg-scoreboard-btn', 'Scoreboard')");
    expect(SG).toMatch(/scoreboardBtn\.addEventListener\('click', showScoreboardModal\)/);
    // The modal + its data fetch exist.
    expect(SG).toMatch(/async function showScoreboardModal\s*\(/);
    expect(SG).toMatch(/async function fetchScoreboardData\s*\(/);
    expect(SG).toContain('sg-scoreboard-modal');
    // Ranked by green-node count (descending), self row highlighted, Escape-closable.
    expect(SG).toContain('b.greenCount - a.greenCount');
    expect(SG).toContain('sg-scoreboard-row-me');
    expect(SG).toMatch(/if \(e\.key === 'Escape'\) closeModal\(\)/);
  });
});

describe('F062 external Equation Trainer link', () => {
  it('opens the external formula deck in a new tab with noopener labeling', () => {
    const dom = new JSDOM(INDEX);
    const link = dom.window.document.querySelector('a[href="https://tmux-trainer.vercel.app/#deck=ap-stats-formulas"]');

    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('Equation Trainer');
    expect(link.textContent).toContain('external');
    expect(link.textContent).toContain('opens in new tab');
  });
});

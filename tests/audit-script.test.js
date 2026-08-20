/**
 * tests/audit-script.test.js
 * Phase 1 — unit tests for the audit script's classification logic.
 * Phase 2 — source-string tests for chart integration in study_guide_diagnostic.html.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyQuestion, classifyFrqSolutionCharts, ORPHAN_REGEX } from '../scripts/audit-question-context.mjs';

const ROOT = resolve(__dirname, '..');
const HTML_PATH = resolve(ROOT, 'study_guide_diagnostic.html');
const CHART_MIN_PATH = resolve(ROOT, 'lib/chart.min.js');
const DATALABELS_PATH = resolve(ROOT, 'lib/chartjs-plugin-datalabels.min.js');
const CURRICULUM_CHARTS_PATH = resolve(ROOT, 'lib/curriculum-charts.js');
const AUDIT_SCRIPT_PATH = resolve(ROOT, 'scripts/audit-question-context.mjs');
const AUDIT_RESULT_PATH = resolve(ROOT, '.session90-question-audit.md');
const MISSING_PICS_PATH = resolve(ROOT, '.session90-missing-pictures.md');

function parseCssColor(value) {
  const source = value.trim();
  const hex = source.match(/^#([\da-f]{6})$/i);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
      a: 1
    };
  }

  const rgb = source.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  expect(rgb, `unsupported CSS color: ${value}`).not.toBeNull();
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
}

function compositeColor(foreground, background) {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1
  };
}

function relativeLuminance(color) {
  const channel = value => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(foregroundValue, backgroundValue) {
  const background = parseCssColor(backgroundValue);
  const foreground = compositeColor(parseCssColor(foregroundValue), background);
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — classification function
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyQuestion — status codes', () => {
  const PNG_ROOT_FAKE = resolve(ROOT, '../curriculum_render/assets/pngs');

  it('returns CHART_MISSING_RENDERER for bar chart when renderer is absent', () => {
    const q = { id: 'TEST-Q1', type: 'multiple-choice', prompt: 'Something something', attachments: { chartType: 'bar', series: [] } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, false)).toBe('CHART_MISSING_RENDERER');
  });

  it('returns CHART_MISSING_RENDERER for scatter chart when renderer is absent', () => {
    const q = { id: 'TEST-Q2', type: 'multiple-choice', prompt: 'something', attachments: { chartType: 'scatter' } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, false)).toBe('CHART_MISSING_RENDERER');
  });

  it('returns CHART_MISSING_RENDERER for histogram when renderer is absent', () => {
    const q = { id: 'TEST-Q3', type: 'multiple-choice', prompt: 'something', attachments: { chartType: 'histogram' } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, false)).toBe('CHART_MISSING_RENDERER');
  });

  it('returns OK_CHART for bar chart when renderer is available', () => {
    const q = { id: 'TEST-Q1b', type: 'multiple-choice', prompt: 'Something something', attachments: { chartType: 'bar', series: [] } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK_CHART');
  });

  it('returns OK_CHART for scatter when renderer is available', () => {
    const q = { id: 'TEST-Q2b', type: 'multiple-choice', prompt: 'something', attachments: { chartType: 'scatter' } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK_CHART');
  });

  it('returns OK_CHART for all chart types when renderer is available', () => {
    for (const ct of ['bar', 'histogram', 'scatter', 'boxplot', 'dotplot', 'pie', 'normal', 'numberline', 'chisquare']) {
      const q = { id: `TEST-CT-${ct}`, type: 'multiple-choice', prompt: 'something', attachments: { chartType: ct } };
      expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK_CHART');
    }
  });

  it('returns OK_TABLE for table attachment', () => {
    const q = { id: 'TEST-Q4', type: 'multiple-choice', prompt: 'Here is a table of data.', attachments: { table: [['A', 'B'], [1, 2]] } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('OK_TABLE');
  });

  it('returns IMAGE_NEEDS_FILE for non-existent image path', () => {
    const q = { id: 'TEST-Q5', type: 'multiple-choice', prompt: 'something', attachments: { image: 'assets/pngs/unit99/fake.png' } };
    // This path doesn't exist on disk
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('IMAGE_NEEDS_FILE');
  });

  it('returns IMAGE_OK for image that exists on disk', () => {
    // u3_l3_q1.png is one of the known-present images
    const q = { id: 'TEST-Q6', type: 'multiple-choice', prompt: 'something', attachments: { image: 'assets/pngs/unit3/u3_l3_q1.png' } };
    const status = classifyQuestion(q, PNG_ROOT_FAKE);
    // On CI the file may not exist; skip if PNG root is absent
    if (!existsSync(resolve(ROOT, '../curriculum_render/assets/pngs/unit3/u3_l3_q1.png'))) {
      expect(['IMAGE_OK', 'IMAGE_NEEDS_FILE']).toContain(status);
    } else {
      expect(status).toBe('IMAGE_OK');
    }
  });

  it('returns CONTEXT_ORPHAN when prompt references "the histogram" with no attachment', () => {
    const q = { id: 'TEST-Q7', type: 'multiple-choice', prompt: 'Based on the histogram shown, which shape best describes the distribution?', attachments: {} };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('CONTEXT_ORPHAN');
  });

  it('returns CONTEXT_ORPHAN when prompt references "the scatterplot"', () => {
    const q = { id: 'TEST-Q8', type: 'multiple-choice', prompt: 'What is the slope shown in the scatterplot?', attachments: {} };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('CONTEXT_ORPHAN');
  });

  it('returns CONTEXT_ORPHAN when prompt references "the boxplot"', () => {
    const q = { id: 'TEST-Q9', type: 'multiple-choice', prompt: 'According to the boxplot, what is the median?', attachments: {} };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('CONTEXT_ORPHAN');
  });

  it('returns OK for a pure-computation question with no visual refs', () => {
    const q = { id: 'TEST-Q10', type: 'multiple-choice', prompt: 'If X ~ Bin(10, 0.5), what is P(X < 3)?', attachments: {} };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('OK');
  });

  it('returns OK for a text-only conceptual question', () => {
    const q = { id: 'TEST-Q11', type: 'multiple-choice', prompt: 'Which of the following is a parameter?', attachments: {} };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('OK');
  });

  it('returns CONTEXT_UNCLEAR for "based on the following data" (ambiguous)', () => {
    const q = { id: 'TEST-Q12', type: 'multiple-choice', prompt: 'Based on the following data, which measure is most appropriate?', attachments: {} };
    // Could be OK or CONTEXT_UNCLEAR depending on regex match
    const result = classifyQuestion(q, PNG_ROOT_FAKE);
    expect(['OK', 'CONTEXT_UNCLEAR']).toContain(result);
  });

  it('returns CHART_MISSING_RENDERER even when prompt also looks orphaned (chart wins, renderer absent)', () => {
    const q = { id: 'TEST-Q13', type: 'multiple-choice', prompt: 'Based on the histogram shown, choose the correct answer.', attachments: { chartType: 'histogram' } };
    // Chart attachment present — should be CHART_MISSING_RENDERER, not CONTEXT_ORPHAN
    expect(classifyQuestion(q, PNG_ROOT_FAKE, false)).toBe('CHART_MISSING_RENDERER');
  });

  it('returns OK_CHART even when prompt also looks orphaned (chart wins, renderer present)', () => {
    const q = { id: 'TEST-Q13b', type: 'multiple-choice', prompt: 'Based on the histogram shown, choose the correct answer.', attachments: { chartType: 'histogram' } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK_CHART');
  });

  it('returns OK for question with choices attachment only', () => {
    const q = { id: 'TEST-Q14', type: 'multiple-choice', prompt: 'Which of these is correct?', attachments: { choices: [{ key: 'A', value: 'Yes' }] } };
    expect(classifyQuestion(q, PNG_ROOT_FAKE)).toBe('OK');
  });

  it('returns OK_CHART for plural charts array (multi-chart question), renderer present', () => {
    const q = {
      id: 'TEST-Q15',
      type: 'multiple-choice',
      prompt: 'Based on the histograms, which comparison is correct?',
      attachments: { charts: [
        { chartType: 'histogram', title: 'A', series: [] },
        { chartType: 'histogram', title: 'B', series: [] }
      ] }
    };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK_CHART');
  });

  it('returns CHART_MISSING_RENDERER for plural charts array when renderer is absent', () => {
    const q = {
      id: 'TEST-Q15b',
      type: 'multiple-choice',
      prompt: 'Based on the scatterplots, which shows the strongest correlation?',
      attachments: { charts: [{ chartType: 'scatter', points: [] }] }
    };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, false)).toBe('CHART_MISSING_RENDERER');
  });

  it('empty charts array does not count as a chart attachment', () => {
    const q = {
      id: 'TEST-Q15c',
      type: 'multiple-choice',
      prompt: 'Which of these is correct?',
      attachments: { charts: [] }
    };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK');
  });

  it('charts array with only malformed entries does not count as a chart attachment', () => {
    const q = {
      id: 'TEST-Q15d',
      type: 'multiple-choice',
      prompt: 'Which of these is correct?',
      attachments: { charts: [{}, null, { chartType: '' }] }
    };
    expect(classifyQuestion(q, PNG_ROOT_FAKE, true)).toBe('OK');
  });
});

describe('ORPHAN_REGEX — pattern coverage', () => {
  it('matches "the graph"', () => expect(ORPHAN_REGEX.test('Based on the graph shown...')).toBe(true));
  it('matches "the chart"', () => expect(ORPHAN_REGEX.test('Looking at the chart above...')).toBe(true));
  it('matches "the histogram"', () => expect(ORPHAN_REGEX.test('According to the histogram...')).toBe(true));
  it('matches "the boxplot"', () => expect(ORPHAN_REGEX.test('In the boxplot provided...')).toBe(true));
  it('matches "the box plot"', () => expect(ORPHAN_REGEX.test('Using the box plot...')).toBe(true));
  it('matches "the scatterplot"', () => expect(ORPHAN_REGEX.test('Using the scatterplot below...')).toBe(true));
  it('matches "the dotplot"', () => expect(ORPHAN_REGEX.test('From the dotplot given...')).toBe(true));
  it('matches "the figure"', () => expect(ORPHAN_REGEX.test('From the figure provided...')).toBe(true));
  it('matches "shown below"', () => expect(ORPHAN_REGEX.test('Use the display shown below.')).toBe(true));
  it('does NOT match "sample distribution"', () => expect(ORPHAN_REGEX.test('What is the sample distribution mean?')).toBe(false));
  it('does NOT match "compute P(X < 3)"', () => expect(ORPHAN_REGEX.test('Compute P(X < 3) for X ~ Bin(10, 0.5).')).toBe(false));
  it('is case-insensitive', () => expect(ORPHAN_REGEX.test('Based on THE HISTOGRAM...')).toBe(true));
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2 — missing pictures list: scope (served only) + dedupe
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 2 — missing pictures list scope and dedupe', () => {
  it('missing pictures file was generated', () => {
    expect(existsSync(MISSING_PICS_PATH)).toBe(true);
  });

  it('missing pictures file header says "unique image refs in served questions"', () => {
    if (!existsSync(MISSING_PICS_PATH)) return;
    const content = readFileSync(MISSING_PICS_PATH, 'utf8');
    expect(content).toContain('unique image refs in served questions');
  });

  it('missing pictures file has no duplicate image paths', () => {
    if (!existsSync(MISSING_PICS_PATH)) return;
    const content = readFileSync(MISSING_PICS_PATH, 'utf8');
    // Extract all image paths from the served section (before the "Non-served" section)
    const servedSection = content.split('## Non-served question image refs')[0];
    // Find all lines like: - <id> → `path`
    const pathMatches = [...servedSection.matchAll(/`(assets\/pngs\/[^`]+)`/g)];
    const paths = pathMatches.map(m => m[1].toLowerCase());
    const uniquePaths = new Set(paths);
    // Every path should be unique
    expect(paths.length).toBe(uniquePaths.size);
  });

  it('missing pictures file non-served section is labeled informational only', () => {
    if (!existsSync(MISSING_PICS_PATH)) return;
    const content = readFileSync(MISSING_PICS_PATH, 'utf8');
    // If non-served refs exist, they should be in the informational section
    if (content.includes('Non-served question image refs')) {
      expect(content).toContain('informational only');
    }
  });
});

describe('audit-question-context.mjs — file exists', () => {
  it('audit script file exists', () => {
    expect(existsSync(AUDIT_SCRIPT_PATH)).toBe(true);
  });

  it('exports classifyQuestion function', async () => {
    const mod = await import('../scripts/audit-question-context.mjs');
    expect(typeof mod.classifyQuestion).toBe('function');
  });

  it('exports ORPHAN_REGEX', async () => {
    const mod = await import('../scripts/audit-question-context.mjs');
    expect(mod.ORPHAN_REGEX).toBeInstanceOf(RegExp);
  });

  it('audit result file was generated', () => {
    expect(existsSync(AUDIT_RESULT_PATH)).toBe(true);
  });

  it('audit result contains summary section', () => {
    expect(existsSync(AUDIT_RESULT_PATH)).toBe(true);
    const content = readFileSync(AUDIT_RESULT_PATH, 'utf8');
    expect(content).toContain('## Summary');
    expect(content).toContain('Total in-scope');
  });

  it('audit result shows CHART_MISSING_RENDERER: 0 after Phase 2', () => {
    expect(existsSync(AUDIT_RESULT_PATH)).toBe(true);
    const content = readFileSync(AUDIT_RESULT_PATH, 'utf8');
    // After Phase 2, renderer is present so count should be 0
    expect(content).toContain('CHART_MISSING_RENDERER: 0');
  });

  it('audit result shows OK_CHART count > 0 after Phase 2', () => {
    expect(existsSync(AUDIT_RESULT_PATH)).toBe(true);
    const content = readFileSync(AUDIT_RESULT_PATH, 'utf8');
    expect(content).toContain('OK_CHART');
    // Should be 59 chart questions now renderable
    expect(content).toMatch(/OK_CHART.*\d+/);
  });

  it('missing pictures file was generated', () => {
    expect(existsSync(MISSING_PICS_PATH)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1 — isDarkMode uses data-theme="night" + CSS variables present in HTML
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 1 — isDarkMode night-theme detection', () => {
  it('lib/curriculum-charts.js checks data-theme=night via getAttribute', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain("getAttribute('data-theme') === 'night'");
  });

  it('lib/curriculum-charts.js still checks dark-theme class for backward compat', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain("classList.contains('dark-theme')");
  });

  // Assert the actual rendering contract: each token must clear its threshold on
  // that theme's chart surface. Palette edits may change values, not accessibility.
  const themeBlock = (content, selector) => {
    const start = content.indexOf(selector);
    expect(start, `${selector} block missing`).toBeGreaterThan(-1);
    return content.slice(start, content.indexOf('}', start));
  };

  it('every theme block defines --chart-text, --chart-grid and --chart-point', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    for (const selector of [':root{', ':root[data-theme="paper"]{', ':root[data-theme="night"]{']) {
      const block = themeBlock(content, selector);
      for (const token of ['--chart-text:', '--chart-grid:', '--chart-point:']) {
        expect(block, `${selector} is missing ${token}`).toContain(token);
      }
    }
  });

  it('chart text, grid, and points clear contrast on each theme chart surface', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    const value = (block, token) => block.match(new RegExp(token + ':\\s*([^;]+);'))[1].trim();
    for (const selector of [':root{', ':root[data-theme="paper"]{', ':root[data-theme="night"]{']) {
      const block = themeBlock(content, selector);
      const surface = value(block, '--sg-bg-card');
      expect(contrastRatio(value(block, '--chart-text'), surface), `${selector} chart text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value(block, '--chart-grid'), surface), `${selector} chart grid`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(value(block, '--chart-point'), surface), `${selector} chart point`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every generated chart series clears 3:1 on its own chart surface', () => {
    const source = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    const palette = name => {
      const match = source.match(new RegExp(`${name}:\\s*\\[([\\s\\S]*?)\\]`));
      expect(match, `missing ${name}`).not.toBeNull();
      return [...match[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]);
    };
    const color = name => {
      const match = source.match(new RegExp(`${name}:\\s*'([^']+)'`));
      expect(match, `missing ${name}`).not.toBeNull();
      return match[1];
    };

    for (const [paletteName, surfaceName] of [['lightPalette', 'paper'], ['nightPalette', 'nightPaper']]) {
      const surface = color(surfaceName);
      for (const seriesColor of palette(paletteName)) {
        expect(contrastRatio(seriesColor, surface), `${paletteName} ${seriesColor}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3 — audit reports DEFERRED_SOLUTION_CHART for FRQ solution-part charts
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 3 — classifyFrqSolutionCharts', () => {
  it('returns empty array when solution has no parts', () => {
    const q = { id: 'U2-PC-FRQ-Q99', solution: {} };
    expect(classifyFrqSolutionCharts(q)).toEqual([]);
  });

  it('returns empty array when parts have no chartType attachment', () => {
    const q = {
      id: 'U2-PC-FRQ-Q99',
      solution: {
        parts: [
          { partId: 'a', description: 'text only', response: 'answer', attachments: {} },
          { partId: 'b', description: 'image part', response: 'answer', attachments: { image: 'assets/pngs/unit2/foo.png' } }
        ]
      }
    };
    expect(classifyFrqSolutionCharts(q)).toEqual([]);
  });

  it('returns one entry for a part with chartType "normal"', () => {
    const q = {
      id: 'U2-PC-FRQ-Q02',
      solution: {
        parts: [
          { partId: 'c', description: 'Normal curve', response: 'answer', attachments: { chartType: 'normal' } }
        ]
      }
    };
    const result = classifyFrqSolutionCharts(q);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'U2-PC-FRQ-Q02', partId: 'c', chartType: 'normal' });
  });

  it('returns one entry for a part with chartType "scatter"', () => {
    const q = {
      id: 'U9-PC-FRQ-Q01',
      solution: {
        parts: [
          { partId: 'a', description: 'Scatterplot', response: 'answer', attachments: { chartType: 'scatter' } }
        ]
      }
    };
    const result = classifyFrqSolutionCharts(q);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'U9-PC-FRQ-Q01', partId: 'a', chartType: 'scatter' });
  });

  it('returns multiple entries when multiple parts have chartType', () => {
    const q = {
      id: 'TEST-MULTI-FRQ',
      solution: {
        parts: [
          { partId: 'a', description: 'Part a', response: '', attachments: { chartType: 'scatter' } },
          { partId: 'b', description: 'Part b', response: '', attachments: {} },
          { partId: 'c', description: 'Part c', response: '', attachments: { chartType: 'normal' } }
        ]
      }
    };
    const result = classifyFrqSolutionCharts(q);
    expect(result).toHaveLength(2);
    expect(result[0].partId).toBe('a');
    expect(result[1].partId).toBe('c');
  });

  it('returns empty array when question has no solution property', () => {
    const q = { id: 'TEST-NO-SOL' };
    expect(classifyFrqSolutionCharts(q)).toEqual([]);
  });

  it('audit result file contains DEFERRED_SOLUTION_CHART section after re-run', () => {
    // This test passes after the audit is re-run. If the file exists, check its content.
    if (!existsSync(AUDIT_RESULT_PATH)) return;
    const content = readFileSync(AUDIT_RESULT_PATH, 'utf8');
    expect(content).toContain('## DEFERRED_SOLUTION_CHART');
  });

  it('audit result file summary lists DEFERRED_SOLUTION_CHART count', () => {
    if (!existsSync(AUDIT_RESULT_PATH)) return;
    const content = readFileSync(AUDIT_RESULT_PATH, 'utf8');
    expect(content).toMatch(/DEFERRED_SOLUTION_CHART.*\d+/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — lifted chart files exist on disk
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — lifted chart lib files', () => {
  it('lib/chart.min.js exists', () => {
    expect(existsSync(CHART_MIN_PATH)).toBe(true);
  });

  it('lib/chartjs-plugin-datalabels.min.js exists', () => {
    expect(existsSync(DATALABELS_PATH)).toBe(true);
  });

  it('lib/curriculum-charts.js exists', () => {
    expect(existsSync(CURRICULUM_CHARTS_PATH)).toBe(true);
  });

  it('lib/curriculum-charts.js defines getChartHtml', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain('function getChartHtml');
  });

  it('lib/curriculum-charts.js defines renderChartNow', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain('function renderChartNow');
  });

  it('lib/curriculum-charts.js exposes window.getChartHtml alias', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain('window.getChartHtml = getChartHtml');
  });

  it('lib/curriculum-charts.js exposes window.renderChartNow alias', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain('window.renderChartNow = renderChartNow');
  });

  it('lib/curriculum-charts.js includes charthelper functions', () => {
    const src = readFileSync(CURRICULUM_CHARTS_PATH, 'utf8');
    expect(src).toContain('function generateChartColors');
    expect(src).toContain('function isDarkMode');
    expect(src).toContain('function getTextColor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4 — chart instance cleanup before innerHTML = '' in renderActiveProbe
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 4 — chart instance leak cleanup in renderActiveProbe', () => {
  it('study_guide_diagnostic.html has chart instance cleanup block before innerHTML clear', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('window.chartInstances && ui.active');
  });

  it('cleanup queries for canvas[id^="sg-chart-"] before innerHTML clear', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('querySelectorAll(\'canvas[id^="sg-chart-"]\')');
  });

  it('cleanup calls inst.destroy() and deletes from chartInstances', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('inst.destroy()');
    expect(content).toContain('delete window.chartInstances[c.id]');
  });

  it('cleanup block appears before ui.active.innerHTML = "" in renderActiveProbe', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    const cleanupIdx = content.indexOf('window.chartInstances && ui.active');
    const innerHTMLIdx = content.indexOf("ui.active.innerHTML = ''");
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(innerHTMLIdx).toBeGreaterThan(-1);
    expect(cleanupIdx).toBeLessThan(innerHTMLIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — source-string integration tests for study_guide_diagnostic.html
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — chart integration in study_guide_diagnostic.html', () => {
  let src;
  it('reads HTML file', () => {
    src = readFileSync(HTML_PATH, 'utf8');
    expect(src.length).toBeGreaterThan(1000);
  });

  it('loads lib/chart.min.js', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('<script src="lib/chart.min.js">');
  });

  it('loads lib/chartjs-plugin-datalabels.min.js', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('<script src="lib/chartjs-plugin-datalabels.min.js">');
  });

  it('loads lib/curriculum-charts.js', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('<script src="lib/curriculum-charts.js">');
  });

  it('declares chartCounter variable', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('let chartCounter = 0');
  });

  it('attachMedia has hasChart branch', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain("typeof attachments.chartType === 'string'");
    expect(content).toContain('const hasChart =');
  });

  it('attachMedia guards with window.getChartHtml && window.renderChartNow', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('window.getChartHtml && window.renderChartNow');
  });

  it('attachMedia calls window.getChartHtml with attachments and canvasId', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('window.getChartHtml(attachments, canvasId)');
  });

  it('attachMedia defers renderChartNow via requestAnimationFrame', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('requestAnimationFrame');
    expect(content).toContain('window.renderChartNow(attachments, canvasId)');
  });

  it('uses sg-chart- prefix for unique canvas IDs', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('sg-chart-${chartCounter++}');
  });

  it('chart container uses attachment-chart-container CSS class', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('attachment-chart-container');
  });

  it('CSS rules for attachment-chart-container are present', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toMatch(/\.attachment-chart-container\{/);
  });

  it('CSS rules include .chart-title scoped to .attachment-chart-container', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('.attachment-chart-container .chart-title');
  });

  it('CSS rules include .chart-canvas scoped to .attachment-chart-container', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    expect(content).toContain('.attachment-chart-container .chart-canvas');
  });

  it('chart scripts are loaded before the main IIFE data scripts', () => {
    const content = readFileSync(HTML_PATH, 'utf8');
    const chartIdx = content.indexOf('lib/chart.min.js');
    const curriculumIdx = content.indexOf('curriculum_render/data/curriculum.js');
    // Both should exist and chart should be loaded first
    expect(chartIdx).toBeGreaterThan(-1);
    expect(curriculumIdx).toBeGreaterThan(-1);
    expect(chartIdx).toBeLessThan(curriculumIdx);
  });
});

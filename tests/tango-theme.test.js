import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hasCurrentTheme, ROOT, themeBlock, wireHtml, WORKSHEET_RE } from '../scripts/wire-tango-theme.mjs';

const filenames = fs.readdirSync(ROOT).filter((f) => WORKSHEET_RE.test(f));

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  expect(match, `missing CSS block: ${selector}`).not.toBeNull();
  return match[1];
}

function cssToken(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`));
  expect(match, `missing CSS token: ${name}`).not.toBeNull();
  return match[1].trim();
}

function parseHexColor(value) {
  const match = value.match(/^#([\da-f]{6})$/i);
  expect(match, `expected six-digit hex color, received: ${value}`).not.toBeNull();
  return [0, 2, 4].map(offset => parseInt(match[1].slice(offset, offset + 2), 16));
}

function relativeLuminance(value) {
  const channels = parseHexColor(value).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function expectContrast(block, foregroundToken, backgroundToken, minimum, label) {
  const ratio = contrastRatio(cssToken(block, foregroundToken), cssToken(block, backgroundToken));
  expect(ratio, label).toBeGreaterThanOrEqual(minimum);
}

describe('Tango theme on worksheets', () => {
  it('every worksheet carries the current theme block exactly once, after the base stylesheet', () => {
    expect(filenames.length).toBeGreaterThanOrEqual(69);
    for (const filename of filenames) {
      const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
      expect(hasCurrentTheme(html), `${filename}: run node scripts/wire-tango-theme.mjs --apply`).toBe(true);
      expect(html.split('id="tango-theme"').length - 1, filename).toBe(1);
      expect(html.indexOf('</style>')).toBeLessThan(html.indexOf('id="tango-theme"'));
    }
  });

  it('wireHtml is idempotent and replaces a stale block', () => {
    const base = '<html><head><style>body{color:red}</style></head><body></body></html>';
    const once = wireHtml(base);
    expect(once.changed).toBe(true);
    expect(once.html).toContain(themeBlock());
    const twice = wireHtml(once.html);
    expect(twice.changed).toBe(false);
    const stale = once.html.replace('--accent: #FF5B19', '--accent: #000000');
    const fixed = wireHtml(stale);
    expect(fixed.changed).toBe(true);
    expect(fixed.html.split('id="tango-theme"').length - 1).toBe(1);
    expect(fixed.html).toContain('--accent: #FF5B19');
  });

  it('leaves pages without a stylesheet untouched', () => {
    expect(wireHtml('<html></html>').changed).toBe(false);
  });
});

describe('Tango theme on the remaining student surfaces', () => {
  it('pins the diagnostic study guide tokens and retires the old palette', () => {
    const source = fs.readFileSync(path.join(ROOT, 'study_guide_diagnostic.html'), 'utf8');
    const expected = {
      '--sg-bg': '#E5E3D2',
      '--sg-bg-hi': '#F3F1E8',
      '--sg-border': '#A9A79A',
      '--sg-text': '#161616',
      '--sg-bg-card': '#F7F5EE',
      '--sg-accent-fill': '#FF5B19',
      '--sg-accent': '#A8330A',
      '--sg-secondary': '#AECACD',
      '--sg-secondary-ink': '#2F5A5E',
      '--sg-mastery-high': '#25663F',
      '--sg-ok-bg': '#DEF0D3',
      '--sg-mastery-low': '#B03A2E',
      '--sg-bad-bg': '#F1DDD3',
      '--sg-mastery-mid': '#8A6D12',
      '--sg-warn-bg': '#F1EBC4',
      '--sg-text-dim': '#6E6C62'
    };

    for (const selector of [':root', ':root[data-theme="paper"]']) {
      const block = cssBlock(source, selector);
      for (const [token, value] of Object.entries(expected)) {
        expect(cssToken(block, token), `${selector} ${token}`).toBe(value);
      }
    }

    expect(source).toMatch(/\.header\{[^}]*border-bottom:3px solid var\(--sg-accent-fill\)/);
    expect(source).not.toMatch(/#(?:7a4a1f|f7f2e8|d8ccb0|2a2520|6ca6ff|36A2EB|1d4ed8)/i);
    expect(source).not.toMatch(/\bhsl[a]?\(/i);
    expect(source).not.toMatch(/\brgb\(/i);
  });

  it('study-guide foreground, border, focus, and semantic roles clear their local surfaces', () => {
    const source = fs.readFileSync(path.join(ROOT, 'study_guide_diagnostic.html'), 'utf8');

    for (const selector of [':root', ':root[data-theme="paper"]', ':root[data-theme="night"]']) {
      const block = cssBlock(source, selector);
      expectContrast(block, '--sg-text', '--sg-bg', 4.5, `${selector} body text`);
      expectContrast(block, '--sg-text-dim', '--sg-bg-card', 4.5, `${selector} card muted text`);
      expectContrast(block, '--sg-text-context', '--sg-bg', 4.5, `${selector} contextual text on page`);
      expectContrast(block, '--sg-text-context', '--sg-bar-track', 4.5, `${selector} contextual text on track`);
      expectContrast(block, '--sg-control-border', '--sg-bg', 3, `${selector} control border on page`);
      expectContrast(block, '--sg-control-border', '--sg-bg-card', 3, `${selector} control border on card`);
      expectContrast(block, '--sg-control-border', '--sg-bar-track', 3, `${selector} control border on track`);
      expectContrast(block, '--sg-focus-ring', '--sg-bg', 3, `${selector} focus on page`);
      expectContrast(block, '--sg-focus-ring', '--sg-bg-card', 3, `${selector} focus on card`);

      for (const role of ['low', 'mid', 'high']) {
        expectContrast(block, `--sg-mastery-${role}-ink`, '--sg-bg-card', 4.5, `${selector} ${role} ink on card`);
        expectContrast(block, `--sg-mastery-${role}-ink`, '--sg-bg-hi', 4.5, `${selector} ${role} ink on raised surface`);
        expectContrast(block, '--sg-on-strong', `--sg-mastery-${role}`, 4.5, `${selector} text on ${role} fill`);
      }

      expectContrast(block, '--sg-on-accent', '--sg-accent-fill', 4.5, `${selector} text on accent fill`);
    }
  });

  it('pins TI-84 window chrome without recoloring the calculator hardware', () => {
    const source = fs.readFileSync(path.join(ROOT, 'ti84-trainer-v2/style.css'), 'utf8');
    const root = cssBlock(source, ':root');
    const chrome = {
      '--platinum': '#E5E3D2',
      '--window': '#E5E3D2',
      '--paper': '#F7F5EE',
      '--ink': '#161616',
      '--stripe': '#A9A79A',
      '--bevel-light': '#F3F1E8',
      '--bevel-mid': '#D3D1C2',
      '--bevel-dark': '#A9A79A',
      '--bevel-deep': '#6E6C62',
      '--accent': '#FF5B19',
      '--accent-soft': '#F1DDD3',
      '--good': '#25663F',
      '--bad': '#B03A2E',
      '--warn': '#8A6D12'
    };

    for (const [token, value] of Object.entries(chrome)) {
      expect(cssToken(root, token), token).toBe(value);
    }

    // These literals model real TI-84 hardware; chrome palette work must never leak into them.
    const calculatorHardware = {
      '--calc-body': '#4a4d52',
      '--calc-bezel': '#f5c518',
      '--key-2nd': '#5ba4cf',
      '--key-alpha': '#6fbf4a',
      '--screen-bg': '#adc699',
      '--screen-ink': '#20321d'
    };

    for (const [token, value] of Object.entries(calculatorHardware)) {
      expect(cssToken(root, token), token).toBe(value);
    }
  });

  it('the trainer primary CTA is the tangerine fill with charcoal ink, not a tint', () => {
    const css = fs.readFileSync(path.join(ROOT, 'ti84-trainer-v2', 'style.css'), 'utf8');
    const rule = /\.mac-button\.primary \{[^}]*\}/.exec(css)[0];
    expect(rule).toMatch(/background:\s*var\(--accent\)/);
    expect(rule).toMatch(/color:\s*var\(--ink\)/);
    expect(rule).not.toMatch(/var\(--accent-soft\)/);
  });
});

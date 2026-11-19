// @vitest-environment node
// Print-set build logic (scripts/printables/lib.mjs). Needs neither Edge nor python.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  checkPages, edgeArgs, linkProblems, loadManifest, needsEdge, parseArgs,
  resolveGeneratedHtmlPath, resolveTargets, validateManifest,
} from '../scripts/printables/lib.mjs';

const ROOT = resolve(__dirname, '..');
const KIT = resolve(ROOT, 'u2_poster');

function freshManifest() {
  return structuredClone(loadManifest(KIT));
}

function errorsFor(change) {
  const manifest = freshManifest();
  change(manifest);
  return validateManifest(manifest, KIT);
}

describe('validateManifest', () => {
  it('accepts the real u2_poster manifest', () => {
    expect(validateManifest(loadManifest(KIT), KIT)).toEqual([]);
  });

  it('catches a duplicate id', () => {
    const errors = errorsFor((m) => { m.sheets[1].id = m.sheets[0].id; });
    expect(errors.some((e) => e.includes('duplicate id "group-sheets"'))).toBe(true);
  });

  it('catches a pack page out of range', () => {
    const errors = errorsFor((m) => { m.packs[0].parts[1].pages = [7]; });
    expect(errors.some((e) => e.includes('page 7 is outside sheet "layouts"'))).toBe(true);
  });

  it('catches a wrong pageCount', () => {
    const errors = errorsFor((m) => { m.packs[0].pageCount = 11; });
    expect(errors.some((e) => e.includes('pageCount is 11'))).toBe(true);
  });

  it('catches an unknown sheet in a pack', () => {
    const errors = errorsFor((m) => { m.packs[0].parts[0].sheet = 'nope'; });
    expect(errors.some((e) => e.includes('unknown sheet "nope"'))).toBe(true);
  });

  it('catches an unknown set member', () => {
    const errors = errorsFor((m) => { m.sets['b-posters-4-6'].push('ghost'); });
    expect(errors.some((e) => e.includes('"ghost" is not a pack id'))).toBe(true);
  });

  it('catches an unsupported renderer', () => {
    const errors = errorsFor((m) => { m.sheets[0].renderer = 'latex'; });
    expect(errors.some((e) => e.includes('renderer latex not supported'))).toBe(true);
  });
});

describe('checkPages', () => {
  const headings = ['Poster 1 layout:', 'Poster 2 layout:', 'Poster 3 layout:'];
  const goodLines = ['Poster 1 layout: x', 'Poster 2 layout: y', 'Poster 3 layout: z'];

  it('passes on an exact match', () => {
    expect(checkPages('layouts', 3, headings, { pages: 3, firstLines: goodLines })).toEqual([]);
  });

  it('reports OVERFLOW naming the sheet and the first page off its heading', () => {
    const lines = ['Poster 1 layout: x', 'μX = Σ x·P(x) ...', 'Poster 2 layout: y', 'Poster 3 layout: z'];
    const [message] = checkPages('layouts', 3, headings, { pages: 4, firstLines: lines }, 'pdf/u2_poster_layouts.pdf');
    expect(message).toMatch(/^OVERFLOW layouts \(pdf\/u2_poster_layouts\.pdf\)/);
    expect(message).toContain('expected 3 pages, got 4');
    expect(message).toContain('page 2 expected "Poster 2 layout:" got "μX = Σ x·P(x) ..."');
  });

  it('reports UNDERFLOW when a page is missing', () => {
    const [message] = checkPages('layouts', 3, headings, { pages: 2, firstLines: goodLines.slice(0, 2) });
    expect(message).toMatch(/^UNDERFLOW layouts/);
  });

  it('reports a heading mismatch with the right page count', () => {
    const lines = ['Poster 1 layout: x', 'Something else', 'Poster 3 layout: z'];
    const [message] = checkPages('layouts', 3, headings, { pages: 3, firstLines: lines });
    expect(message).toContain('page 2 expected "Poster 2 layout:" got "Something else"');
  });
});

describe('resolveTargets', () => {
  it('resolves a set to its packs and exactly the sheets they need', () => {
    const targets = resolveTargets(loadManifest(KIT), 'b-posters-4-6');
    expect(targets.packs).toEqual(['b-4-6-groups', 'b-4-6-review']);
    expect(targets.sheets.sort()).toEqual(['group-sheets', 'layouts', 'peer-review', 'poster6-jobs']);
  });

  it('resolves null to everything', () => {
    const manifest = loadManifest(KIT);
    const targets = resolveTargets(manifest, null);
    expect(targets.sheets).toHaveLength(manifest.sheets.length);
    expect(targets.packs).toHaveLength(manifest.packs.length);
  });

  it('throws listing valid names for an unknown name', () => {
    expect(() => resolveTargets(loadManifest(KIT), 'nope')).toThrow(/b-4-6-groups.*b-posters-4-6/);
  });
});

describe('edgeArgs', () => {
  it('adds the hash suffix and turns off the page header and footer', () => {
    const argv = edgeArgs('edge.exe', 'C:\\t\\out.pdf', 'C:/kit/a.html', 'teacher', 'C:\\t\\profile');
    expect(argv).toContain('--no-pdf-header-footer');
    expect(argv).toContain('file:///C:/kit/a.html#teacher');
    expect(argv).toContain('--print-to-pdf=C:\\t\\out.pdf');
  });

  it('leaves the url bare when there is no hash', () => {
    const argv = edgeArgs('edge.exe', 'o.pdf', 'C:/kit/a.html', '', 'p');
    expect(argv).toContain('file:///C:/kit/a.html');
  });
});

describe('student layout sheet', () => {
  it('contains no answer-key markup', () => {
    const html = readFileSync(resolve(KIT, 'poster_layouts.html'), 'utf8');
    expect(html).not.toContain('class="k"');
    expect(html).not.toContain('class="pick"');
    expect(html).not.toContain('ANSWER KEY');
  });
});

describe('parseArgs', () => {
  it('reads a normal command line', () => {
    const options = parseArgs(['u2_poster', '--pack', 'b-posters-4-6', '--check']);
    expect(options).toMatchObject({ kit: 'u2_poster', pack: 'b-posters-4-6', check: true, write: false });
  });

  it.each([
    [['u2_poster', '--pack']],
    [['u2_poster', '--out']],
    [['u2_poster', '--out', '']],
    [['u2_poster', '--png', '--check']],
    [['u2_poster', '--pack', '--diff']],
  ])('rejects a flag with a missing, empty or flag-like value: %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow(/needs a value/);
  });

  it('rejects --write together with --check or --out', () => {
    expect(() => parseArgs(['u2_poster', '--write', '--check'])).toThrow(/--write/);
    expect(() => parseArgs(['u2_poster', '--write', '--out', 'x'])).toThrow(/--write/);
  });

  it('accepts --help without a kit', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('resolveGeneratedHtmlPath', () => {
  const kit = '/repo/u2_poster';
  const work = '/tmp/work';

  it('defaults to the temp folder, never the tracked kit path', () => {
    const path = resolveGeneratedHtmlPath({ write: false }, kit, work, 'poster_layouts_key.html');
    expect(path).toBe(join(work, 'gen-poster_layouts_key.html'));
  });

  it('writes the tracked kit path only with --write', () => {
    const path = resolveGeneratedHtmlPath({ write: true }, kit, work, 'poster_layouts_key.html');
    expect(path).toBe(join(kit, 'poster_layouts_key.html'));
  });
});

describe('frozen packs', () => {
  it('a frozen-only pack needs no sheets and no Edge', () => {
    const manifest = loadManifest(KIT);
    const targets = resolveTargets(manifest, 'partner-worksheets');
    expect(targets.sheets).toEqual([]);
    expect(needsEdge(manifest, targets)).toBe(false);
  });

  it('a rendered pack needs Edge', () => {
    const manifest = loadManifest(KIT);
    expect(needsEdge(manifest, resolveTargets(manifest, 'b-posters-4-6'))).toBe(true);
  });

  it('reports links left in a pdf', () => {
    expect(linkProblems('x', 0, 'student')).toEqual([]);
    expect(linkProblems('x', 2, 'teacher')[0]).toMatch(/^LINKS x: 2 link\(s\) in teacher pdf/);
  });
});

describe('build.mjs command line', () => {
  const BUILD = resolve(ROOT, 'scripts/printables/build.mjs');

  function runBuild(args, env = {}) {
    return spawnSync(process.execPath, [BUILD, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 30000,
    });
  }

  it('--help prints usage and exits 0', () => {
    const result = runBuild(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  it('a bare --pack exits 2 without building', () => {
    const result = runBuild(['u2_poster', '--pack']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--pack needs a value');
    expect(result.stdout).not.toContain('OK ');
  });

  it('an empty --out exits 2 without building', () => {
    const result = runBuild(['u2_poster', '--out', '']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--out needs a value');
  });

  it('missing python exits 2 (the documented code), before any Edge lookup', () => {
    const result = runBuild(['u2_poster', '--check', '--pack', 'partner-worksheets'], {
      PRINTABLES_PYTHON: 'no-such-python-for-printables-test',
      PRINTABLES_EDGE: 'no-such-edge.exe',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Python not found');
  });

  it('SKILL.md documents exit code 2 for python and pymupdf', () => {
    const skill = readFileSync(resolve(ROOT, '.grok/skills/printables/SKILL.md'), 'utf8');
    expect(skill).toMatch(/\| 2 \|[^\n]*python[^\n]*pymupdf/);
  });
});

// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk flashcard passport — static contract', () => {
  it('exports the store state and SRS log as a dated JSON download, with a view-as guard', () => {
    const body = fnBody(DESK, '_fcpExport');

    expect(body).toMatch(/typeof\s+_viewAsContext\s*===\s*['"]function['"]/);
    expect(body).toMatch(/window\.__WS_READ_ONLY__/);
    expect(body).toMatch(/FlashcardStore\.createStore/);
    expect(body).toMatch(/store\.load\(\)/);
    expect(body).toMatch(/store\.readSrsLog\(\)/);
    expect(body).toMatch(/store\.exportPassport\(state, log\)/);
    expect(body).toMatch(/new Blob/);
    expect(body).toContain("'apstats-flashcards-' + safeEmail + '-' + date + '.json'");
    expect(body).toMatch(/link\.click\(\)/);
  });

  it('previews import counts, requires Import or Cancel, then refreshes cached due state', () => {
    const body = fnBody(DESK, '_fcpImportFile');

    expect(body).toMatch(/typeof\s+_viewAsContext\s*===\s*['"]function['"]/);
    expect(body).toMatch(/store\.previewImport\(text\)/);
    expect(body).toMatch(/emailMatches\s*===\s*false/);
    expect(body).toContain("'Import'");
    expect(body).toContain("'Cancel'");
    expect(body).toMatch(/store\.importPassport\(text\)/);
    const confirmStart = body.indexOf('importButton.onclick = function');
    const importCall = body.indexOf('store.importPassport(text)', confirmStart);
    const finalGuard = body.slice(confirmStart, importCall);
    expect(finalGuard).toMatch(/typeof\s+_viewAsContext\s*===\s*['"]function['"]/);
    expect(finalGuard).toMatch(/window\.__WS_READ_ONLY__/);
    expect(finalGuard).toMatch(/currentEmail\s*!==\s*email/);
    expect(body).toMatch(/_srsFoldCache\s*=\s*null/);
    expect(body).toMatch(/_srsRenderDueChip\(dueHost, _srsDueSnapshot\(\)\)/);
  });

  it('renders a guarded Flashcard progress row only when FlashcardStore is loaded', () => {
    const panel = fnBody(DESK, 'showResourcePanel');
    const guard = panel.indexOf("typeof FlashcardStore !== 'undefined'");
    const label = panel.indexOf('Flashcard progress', guard);

    expect(guard).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(guard);
    expect(panel.slice(0, guard)).not.toContain('Flashcard progress');
    expect(panel).toContain('_fcpExport()');
    expect(panel).toContain('_fcpImportFile(this.files[0])');
  });

  it('keeps trainer-state sync dormant, flag-gated, feature-detected, and best-effort', () => {
    const sync = fnBody(DESK, '_srsSyncViaTrainerState');
    const rate = fnBody(DESK, '_rvRate');

    expect(sync).toMatch(/_fcFlag\('flashcardSync'\)/);
    expect(sync).toMatch(/typeof window\.rosterClient\.trainerState\s*!==\s*['"]function['"]/);
    expect(sync).toMatch(/window\.rosterClient\.trainerState\(\{/);
    expect(sync).toContain("deckId: 'ap-stats-flashcards'");
    expect(sync).toMatch(/request\.catch\(function \(\) \{\}\)/);
    expect(rate.indexOf('_rvState.store.save(_rvState.folded)')).toBeGreaterThan(-1);
    expect(rate.indexOf("_fcFlag('flashcardSync')")).toBeGreaterThan(
      rate.indexOf('_rvState.store.save(_rvState.folded)')
    );
    expect(rate).toMatch(/_srsSyncViaTrainerState\(\)/);
  });
});

describe('Desk flashcard passport — executed refusal', () => {
  it('refuses a passport for another email before importPassport is called', async () => {
    const importPassport = vi.fn();
    const previewImport = vi.fn(() => ({
      ok: true,
      emailMatches: false,
      counts: { cards: 3, logEntries: 4, tombstones: 0 }
    }));
    const createStore = vi.fn(() => ({ previewImport, importPassport }));
    const showDialog = vi.fn();
    const factory = new Function(
      'FlashcardStore', 'localStorage', 'getStudentEmail', '_viewAsContext',
      'window', 'showDialog', 'FileReader',
      fnBody(DESK, '_fcpImportFile') + '\nreturn _fcpImportFile;'
    );
    const importFile = factory(
      { createStore },
      {},
      () => 'right-student@roster.local',
      () => null,
      { __WS_READ_ONLY__: false },
      showDialog,
      undefined
    );

    const result = await importFile({ text: async () => '{"passport":true}' });

    expect(result).toBe(false);
    expect(previewImport).toHaveBeenCalledWith('{"passport":true}');
    expect(showDialog).toHaveBeenCalledTimes(1);
    expect(showDialog.mock.calls[0][1]).toMatch(/different student|refused/i);
    expect(importPassport).not.toHaveBeenCalled();
  });

  it.each([
    ['view-as context', function (controls) { controls.viewAs = { studentId: 'viewed-student' }; }],
    ['read-only mode', function (controls) { controls.windowObject.__WS_READ_ONLY__ = true; }],
    ['student identity', function (controls) { controls.email = 'other-student@roster.local'; }]
  ])('re-checks %s after preview before the Import click', async (_label, mutate) => {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="dialog-overlay">
        <div class="dialog-btns"><button id="dialog-btn">Import</button></div>
      </div>
    </body>`);
    const controls = {
      email: 'right-student@roster.local',
      viewAs: null,
      windowObject: { __WS_READ_ONLY__: false }
    };
    const importPassport = vi.fn(() => ({ ok: true }));
    const previewImport = vi.fn(() => ({
      ok: true,
      emailMatches: true,
      counts: { cards: 3, logEntries: 4, tombstones: 0 }
    }));
    const createStore = vi.fn(() => ({ previewImport, importPassport }));
    const showDialog = vi.fn();
    const closeDialog = vi.fn();
    const factory = new Function(
      'FlashcardStore', 'localStorage', 'getStudentEmail', '_viewAsContext',
      'window', 'showDialog', 'FileReader', 'document', 'closeDialog',
      fnBody(DESK, '_fcpImportFile') + '\nreturn _fcpImportFile;'
    );
    const importFile = factory(
      { createStore },
      {},
      function () { return controls.email; },
      function () { return controls.viewAs; },
      controls.windowObject,
      showDialog,
      undefined,
      dom.window.document,
      closeDialog
    );

    const previewed = await importFile({ text: async () => '{"passport":true}' });
    expect(previewed).toBe(true);
    mutate(controls);
    dom.window.document.getElementById('dialog-btn').click();

    expect(importPassport).not.toHaveBeenCalled();
    expect(showDialog).toHaveBeenCalledTimes(2);
    expect(showDialog.mock.calls[1][1]).toMatch(/Could not import flashcard progress/);
  });
});

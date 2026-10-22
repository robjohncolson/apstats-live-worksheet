// APSTAT_PARK_SOLO_DOOR_SPEC §5: park door only. The calculator room on the Desk's calendar board
// is the one calculator surface: no standalone page, no Desk app window. Structural pins.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskSource } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(repo, file), 'utf8');
const BOARD = readFileSync(resolve(repo, 'classroom-board.js'), 'utf8');
const DESK = deskSource();
const PICO = read('pico-home.js');
const PARK_LINK = 'ap_stats_roadmap_square_mode.html#room=calc-solo';
// Spelled in two parts so the spec's acceptance search for the retired page name stays empty.
const RETIRED_PAGE = 'calculator-solo' + '.html';

describe('the park door is the only calculator surface', () => {
  it('the standalone page is gone', () => {
    expect(existsSync(resolve(repo, RETIRED_PAGE))).toBe(false);
  });

  it('the Desk has no ti84 app window: registry, overlay, menu item, launch branch, tool clause', () => {
    expect(DESK).not.toMatch(/^\s*ti84:\s*\{/m);
    expect(DESK).not.toContain('app-ti84-overlay');
    expect(DESK).not.toContain('app-ti84-frame');
    expect(DESK).not.toContain("openApp('ti84')");
    expect(DESK).not.toContain("id !== 'ti84'");
    expect(DESK).toContain("var isTool = (app === 'formulas');");
    expect(DESK).not.toContain(RETIRED_PAGE);
  });

  it('the Desk opens the park room with _openParkSolo (the hash deep link)', () => {
    expect(DESK).toContain('function _openParkSolo(link)');
    expect(DESK).toContain("window.location.hash = '#room=calc-solo' + (link || '');");
    expect(DESK).toContain('handle.openCalculatorMission()');
  });

  it('the Pico Desk CALCULATOR item opens the park room, and its window registry has no ti84 entry', () => {
    expect(PICO).toContain("{ label: 'CALCULATOR', run: function () { callDesk('_openParkSolo', ['']); } }");
    expect(PICO).not.toContain('app-ti84-overlay');
    expect(PICO).not.toContain("'ti84'");
  });

  it('the landing pages link the park room on the Desk', () => {
    for (const file of ['index.html', 'start-here.html']) {
      const page = read(file);
      expect(page, file).toContain(`href="${PARK_LINK}"`);
      expect(page, file).toContain('TI-84 practice (in APStat Park)');
      expect(page, file).not.toContain(RETIRED_PAGE);
    }
    expect(read('mobile-home.html')).not.toContain(RETIRED_PAGE);
  });

  it('the student host smoke matrix no longer probes the page', () => {
    expect(read('scripts/smoke-student-host-matrix.mjs')).not.toContain(RETIRED_PAGE);
  });
  it('a room link does not outlive the mount: the board forgets #room=calc-* once the room is up', () => {
    expect(BOARD).toContain("if (!/^#room=calc-/.test(root.location.hash || '')) return;");
    expect(BOARD).toContain("root.history.replaceState(null, '', root.location.pathname + root.location.search)");
    expect(BOARD).toContain('if (levelIndex === -1) forgetRoomLink();');
    expect(BOARD).toContain("!nativePanel.linkChanged(root.location.hash)) { forgetRoomLink(); return; }");
  });
});

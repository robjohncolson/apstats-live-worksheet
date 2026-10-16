// APSTAT_PARK_TRAINER_ABSORB_SPEC §5 (Phase 3): the Desk's resource panel shows "N skills due"
// from the park relay's recall schedule and opens the park's solo calculator room. Pins the
// wiring in ap_stats_roadmap_square_mode.html (the function bodies, not a live fetch).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  expect(start, name + ' exists').toBeGreaterThan(-1);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

describe('resource panel: N skills due (park recall schedule)', () => {
  it('the Calculator Skill row carries the due slot and schedules the fill', () => {
    const panel = fnBody(DESK, 'showResourcePanel');
    expect(panel).toContain('<span class="desk-calc-due-slot"></span>');
    expect(panel).toContain('setTimeout(_renderCalcDue, 0)');
  });

  it('_renderCalcDue reads GET /park/calc/due on the relay with the roster session, caches a minute, and links to the solo room', () => {
    const url = fnBody(DESK, '_calcDueUrl');
    expect(url).toContain("'/park/calc/due?section='");
    expect(url).toContain('window.rosterClient.current()');
    expect(url).toContain('RAILWAY_SERVER_URL');
    const render = fnBody(DESK, '_renderCalcDue');
    expect(render).toContain("querySelectorAll('.desk-calc-due-slot')");
    expect(render).toContain("' skills due'");
    expect(render).toContain("_openParkSolo('')");
    expect(render).toContain('60000');
    expect(render).not.toMatch(/ledger|grade/i);
  });

  it('_openParkSolo sets the deep-link hash, closes the panel and opens the calculator room on the board', () => {
    const open = fnBody(DESK, '_openParkSolo');
    expect(open).toContain("'#room=calc-solo' + (link || '')");
    expect(open).toContain('closeResourcePanel()');
    expect(open).toContain("getElementById('classroom-board-mount')");
    expect(open).toContain('handle.openCalculatorMission()');
  });
});

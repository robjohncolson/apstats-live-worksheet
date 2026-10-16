// APSTAT_PARK_TRAINER_ABSORB_SPEC §8.2: calculator-solo.html is the park solo room as a page
// (the Desk's ti84 app window target and the landing pages' TI-84 link). Structural pins.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(resolve(repo, 'calculator-solo.html'), 'utf8');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

describe('calculator-solo.html', () => {
  it('lives at the root (the board imports ./apstat-park/... relative to the page) and mounts the same board as the Desk', () => {
    expect(existsSync(resolve(repo, 'calculator-solo.html'))).toBe(true);
    expect(PAGE).toContain('<script src="roster-client.js"></script>');
    expect(PAGE).toContain("script.src = 'classroom-board.js'");
    expect(PAGE).toContain("window.ClassroomBoard.mount(document.getElementById('classroom-board-mount')");
    expect(PAGE).toContain('playable: true');
    expect(PAGE).toContain("role: s.role === 'teacher' ? 'teacher' : 'student'");
  });

  it('a bare page opens the solo room; the roster session is required; no grade write', () => {
    expect(PAGE).toContain("'#room=calc-solo'");
    expect(PAGE).toContain('Sign in on the Desk first');
    expect(PAGE).not.toMatch(/ledger|\/grade/);
  });

  it('the Desk app window and the lesson deep links point here, not at the retired trainer', () => {
    expect(DESK).toContain("ti84:     { url: 'calculator-solo.html', sfx: 'wildEep' }");
    expect(DESK).toContain("app.url + '#room=calc-solo&topic=' + topic");
    expect(DESK).not.toContain('ti84-trainer-v2');
  });
});

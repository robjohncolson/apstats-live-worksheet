// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const desk = readFileSync('ap_stats_roadmap_square_mode.html', 'utf8');
describe('Retired per-lesson DOK rows', () => {
  it('has no row helper, calls, pending group links or derived PDF URLs', () => {
    expect(desk).not.toMatch(/_dokLadderRowHtml|dok-ladder-row|dok\/pdf\/aps_|e-wednesday-sheets/);
  });
  it('retains the Teacher menu and registered DOK index app', () => {
    expect(desk).toContain('id="menu-dok-ladders"');
    expect(desk).toMatch(/dok:\s*\{ url: 'https:\/\/robjohncolson\.github\.io\/apstats-live-worksheet\/dok\/index\.html'/);
  });
});

// tests/cockpit-level.test.js
//
// LIVE_CLASSROOM V7 Unit C -- cockpit additions for the 'level' activity
// type.
//
// Verifies that teacher-classroom.html
//   * adds a "U1.1 The Cola Mystery (level)" option to #activity-type
//     (alongside the bridge-mean / colorbox-hue / colorbox-grid options),
//   * extends startActivity()'s ':variant' parser to set opts.levelKey
//     when the type is 'level',
//   * extends renderActivity(summary) with a `typ === 'level'` branch
//     that writes the Sips / Door votes / Doors opened / Players in
//     reflection / Goal reached readout from state.tally, state.gates,
//     state.players, state.reflection, state.goal,
//   * extends showActivityHint() with a `type === 'level'` case.
//
// Structural assertions over the source file -- mirrors the pattern
// from tests/cockpit-activity.test.js (Layer 1 style).
//
// ASCII-only. LF line endings. No emojis.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COCKPIT_SRC = readFileSync(resolve(REPO_ROOT, 'teacher-classroom.html'), 'utf8');

// ============================================================
// Dropdown additions
// ============================================================

describe('V7 Unit C: activity-type dropdown adds the level option', () => {
  it('includes <option value="level:U1.1"> in the #activity-type dropdown', () => {
    expect(COCKPIT_SRC).toMatch(/value=["']level:U1\.1["']/);
  });

  it('the new option text labels the activity as a level', () => {
    // Spec C5: 'U1.1 The Cola Mystery (level)'.
    expect(COCKPIT_SRC).toMatch(/U1\.1[^<]*Cola Mystery[^<]*\(level\)/i);
  });

  it('the existing bridge-mean / colorbox-hue / colorbox-grid options are still present (additive change)', () => {
    expect(COCKPIT_SRC).toMatch(/value=["']bridge-mean["']/);
    expect(COCKPIT_SRC).toMatch(/value=["']colorbox-hue["']/);
    expect(COCKPIT_SRC).toMatch(/value=["']colorbox-grid:hand["']/);
    expect(COCKPIT_SRC).toMatch(/value=["']colorbox-grid:group["']/);
  });

  it('the level option lives inside the #activity-type <select>', () => {
    // Locate the activity-type select and confirm the level option is
    // inside it (not floating elsewhere in the file).
    var selOpen  = COCKPIT_SRC.indexOf('id="activity-type"');
    var selClose = COCKPIT_SRC.indexOf('</select>', selOpen);
    expect(selOpen).toBeGreaterThan(-1);
    expect(selClose).toBeGreaterThan(selOpen);
    var inside = COCKPIT_SRC.slice(selOpen, selClose);
    expect(inside).toMatch(/value=["']level:U1\.1["']/);
  });
});

// ============================================================
// startActivity()'s level branch
// ============================================================

describe('V7 Unit C: startActivity sets opts.levelKey for type === level', () => {
  it('startActivity contains a "type === \'level\'" branch that sets opts.levelKey = variant', () => {
    var idx = COCKPIT_SRC.indexOf('function startActivity');
    expect(idx).toBeGreaterThan(-1);
    // The whole function body fits comfortably inside a 2 KB window;
    // V7's branch is ~3 lines below the existing colorbox-grid block.
    var body = COCKPIT_SRC.slice(idx, idx + 2800);
    expect(body).toMatch(/type\s*===\s*['"]level['"]/);
    expect(body).toMatch(/opts\.levelKey\s*=\s*variant/);
  });

  it('the level branch is positioned AFTER the existing variant parser (parts[0]/parts[1])', () => {
    var idx = COCKPIT_SRC.indexOf('function startActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 2800);
    var splitIdx  = body.search(/var\s+parts\s*=\s*String\(rawType\)\.split\(['"]:["']\)/);
    var levelIdx  = body.search(/type\s*===\s*['"]level['"]/);
    expect(splitIdx).toBeGreaterThan(-1);
    expect(levelIdx).toBeGreaterThan(-1);
    expect(levelIdx).toBeGreaterThan(splitIdx);
  });

  it('the colorbox-grid variant parsing is still in place (additive change)', () => {
    var idx = COCKPIT_SRC.indexOf('function startActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 2800);
    expect(body).toMatch(/type\s*===\s*['"]colorbox-grid['"]/);
    expect(body).toMatch(/secondAxis/);
  });
});

// ============================================================
// renderActivity()'s level branch
// ============================================================

describe('V7 Unit C: renderActivity has a level branch with the V7 readout', () => {
  it('renderActivity contains a "typ === \'level\'" branch', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    expect(idx).toBeGreaterThan(-1);
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    expect(body).toMatch(/typ\s*===\s*['"]level['"]/);
  });

  it('the level branch writes the spec-mandated readout labels (Sips / Door votes / Doors opened / Players in reflection / Goal reached)', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    // Locate the level branch and check the labels are inside its body.
    var lvlIdx = body.search(/typ\s*===\s*['"]level['"]/);
    expect(lvlIdx).toBeGreaterThan(-1);
    var lvlBody = body.slice(lvlIdx, lvlIdx + 4000);
    expect(lvlBody).toMatch(/Sips:/);
    expect(lvlBody).toMatch(/Door votes:/);
    expect(lvlBody).toMatch(/Doors opened:/);
    expect(lvlBody).toMatch(/Players in reflection:/);
    expect(lvlBody).toMatch(/Goal reached:/);
  });

  it('the level branch reads state.tally, state.gates, state.players, state.reflection, state.goal', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    var lvlIdx = body.search(/typ\s*===\s*['"]level['"]/);
    var lvlBody = body.slice(lvlIdx, lvlIdx + 4000);
    expect(lvlBody).toMatch(/state\.tally/);
    expect(lvlBody).toMatch(/state\.gates/);
    expect(lvlBody).toMatch(/state\.players/);
    expect(lvlBody).toMatch(/state\.reflection/);
    expect(lvlBody).toMatch(/state\.goal/);
  });

  it('the level branch references tally.sips and tally.votes (spec C4)', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    var lvlIdx = body.search(/typ\s*===\s*['"]level['"]/);
    var lvlBody = body.slice(lvlIdx, lvlIdx + 4000);
    // Either dotted access or the labels themselves are sufficient
    // evidence; spec C5 says "Sips: A=3 B=2" / "Door votes: d1=1 ...".
    expect(lvlBody).toMatch(/\.sips/);
    expect(lvlBody).toMatch(/\.votes/);
  });

  it('the level branch uses textContent (XSS-safe), not innerHTML, for the readout', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    var lvlIdx = body.search(/typ\s*===\s*['"]level['"]/);
    // Find where the next existing branch begins (colorbox-grid) so we
    // only inspect the level branch body.
    var nextIdx = body.indexOf("typ === 'colorbox-grid'", lvlIdx + 1);
    if (nextIdx < 0) nextIdx = body.indexOf('colorbox-grid', lvlIdx + 1);
    var lvlBody = (nextIdx > lvlIdx) ? body.slice(lvlIdx, nextIdx) : body.slice(lvlIdx, lvlIdx + 4000);
    expect(lvlBody).toMatch(/readout\.textContent/);
    // Roster items are constructed via createElement + textContent.
    expect(lvlBody).toMatch(/createElement\(['"]li['"]\)/);
  });

  it('the level branch returns early (does not fall through to the bridge-mean default)', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    var lvlIdx = body.search(/typ\s*===\s*['"]level['"]/);
    // Find where the colorbox-grid block starts (a known later branch);
    // an early `return;` should sit between the two.
    var nextIdx = body.indexOf("typ === 'colorbox-grid'", lvlIdx + 1);
    if (nextIdx < 0) nextIdx = body.indexOf('colorbox-grid', lvlIdx + 1);
    expect(nextIdx).toBeGreaterThan(lvlIdx);
    var lvlBody = body.slice(lvlIdx, nextIdx);
    expect(lvlBody).toMatch(/return;/);
  });

  it('the existing bridge-mean / colorbox-hue / colorbox-grid branches are still present (additive change)', () => {
    var idx = COCKPIT_SRC.indexOf('function renderActivity');
    var body = COCKPIT_SRC.slice(idx, idx + 13000);
    expect(body).toMatch(/typ\s*===\s*['"]colorbox-hue['"]/);
    expect(body).toMatch(/typ\s*===\s*['"]colorbox-grid['"]/);
    expect(body).toMatch(/currentMean/);
  });
});

// ============================================================
// showActivityHint()'s level branch
// ============================================================

describe('V7 Unit C: showActivityHint covers the level type', () => {
  it('showActivityHint contains a "type === \'level\'" branch', () => {
    var idx = COCKPIT_SRC.indexOf('function showActivityHint');
    expect(idx).toBeGreaterThan(-1);
    var body = COCKPIT_SRC.slice(idx, idx + 2800);
    expect(body).toMatch(/type\s*===\s*['"]level['"]/);
  });

  it('the level hint text mentions sip stations and question doors (so students know what to do)', () => {
    var idx = COCKPIT_SRC.indexOf('function showActivityHint');
    var body = COCKPIT_SRC.slice(idx, idx + 2800);
    var lvlIdx = body.search(/type\s*===\s*['"]level['"]/);
    // The hint string runs roughly 5-15 lines after the branch start.
    var lvlBody = body.slice(lvlIdx, lvlIdx + 800);
    expect(lvlBody).toMatch(/sip/i);
    expect(lvlBody).toMatch(/door/i);
  });

  it('the existing bridge-mean / colorbox-hue / colorbox-grid hints are still present (additive change)', () => {
    var idx = COCKPIT_SRC.indexOf('function showActivityHint');
    var body = COCKPIT_SRC.slice(idx, idx + 2800);
    expect(body).toMatch(/type\s*===\s*['"]bridge-mean['"]/);
    expect(body).toMatch(/type\s*===\s*['"]colorbox-hue['"]/);
    expect(body).toMatch(/type\s*===\s*['"]colorbox-grid['"]/);
  });
});

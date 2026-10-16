// Route audit (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §5): a hint must never send a student the long
// way and then charge them for the short one. Replays every catalogue problem on the native engine
// and reports every step where an accepted key reaches a checkpoint >= 2 keys further than the
// written route's next step, plus menu items the route scrolls to instead of using their letter.
//
//   node scripts/audit-calculator-routes.mjs                 report (exit 1 when a case is open)
//   node scripts/audit-calculator-routes.mjs --json out.json also write the report as JSON
//   node scripts/audit-calculator-routes.mjs --apply         rewrite the catalogue to the short path
//
// build-park-curriculum.mjs regenerates the catalogue with the long routes: run --apply after it.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { nativeScriptFilenames } from '../apstat-park/calculator-native/manifest.mjs';
import { CALCULATOR_PROBLEMS } from '../apstat-park/calculator-catalog.mjs';
import { createMissionEngine } from '../apstat-park/calculator-engine.mjs';
import { KEYS } from '../apstat-park/calculator-mission.mjs';
import { keySublabels } from '../apstat-park/calculator-key-labels.mjs';

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('../apstat-park/calculator-native/' + file, import.meta.url), 'utf8'), sandbox);
const create = sandbox.window.TI84Native.create;
const keys = KEYS.map(tile => tile.key);
const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const MIN_SAVING = 2;

// The calculator after pressing `history`, plus the last payload it rendered.
function replay(problem, history) {
  let rendered = null;
  const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph']
    .map(name => ['render' + name, value => { rendered = value; }]));
  renderer.clear = () => { rendered = null; };
  const calculator = create(null, { renderer });
  for (const [name, values] of Object.entries(problem.setup.lists)) calculator.setList(name, values);
  for (const [name, values] of Object.entries(problem.setup.matrices)) calculator.setMatrix(name, values);
  if (problem.setup.histogramWindow) calculator.setHistogramWindow(problem.setup.histogramWindow);
  for (const key of history) calculator.pressKey(key);
  return { calculator, rendered: () => rendered };
}

// Everything a student can see or that the result depends on (stored lists, the home history).
function visible(problem, history) {
  const { calculator, rendered } = replay(problem, history);
  const snapshot = calculator.save();
  return JSON.stringify({ screen: snapshot.screen, rendered: rendered(), values: calculator.getWizardValues(),
    computed: calculator.getComputedValues(), lists: snapshot.lists, matrices: snapshot.matrices,
    second: snapshot.secondActive, alpha: snapshot.alphaActive });
}

// A shortcut is natural when a student who knows the calculator would press it on their own.
function naturalShortcut(problem, step, key) {
  const before = replay(problem, problem.route.slice(0, step)).calculator.getScreen();
  const after = replay(problem, [...problem.route.slice(0, step), key]).calculator.getScreen();
  if (key === 'ENTER') return 'ENTER';
  if (key === 'ZOOM' && /^plot/.test(before.id)) return 'ZOOM from the plot editor';
  // A digit counts only when it opens its item, as on a real TI-84. A digit that merely moves
  // the cursor (an item the trainer cannot open) is a trainer artefact, not a shortcut.
  if (DIGITS.has(key) && before.type === 'menu' && after.type !== 'menu') return 'menu number';
  return null;
}

// Single keys the engine accepts that skip >= MIN_SAVING written keys.
function engineCases(problem) {
  const engine = createMissionEngine(create, problem.setup, problem.route, keys);
  const finalState = visible(problem, problem.route);
  const cases = [];
  for (let step = 0; step < problem.route.length; step++) {
    const transitions = engine.transitions({ step, keys: problem.route.slice(0, step) });
    for (const [key, reaches] of Object.entries(transitions)) {
      const saving = reaches - step - 1;
      if (saving < MIN_SAVING) continue;
      const route = [...problem.route.slice(0, step), key, ...problem.route.slice(reaches)];
      // The engine fingerprints screens, not hidden state: skipping a seed still "matches" a later
      // menu. Only a shortcut that ends on the same result is a real one.
      const sameResult = visible(problem, route) === finalState;
      cases.push({ problemId: problem.id, step, kind: 'engine', keys: [key], replaces: problem.route.slice(step, reaches),
        reaches, saving, sameResult, natural: sameResult ? naturalShortcut(problem, step, key) : null });
    }
  }
  return cases;
}

const letterKeys = Object.fromEntries(keys.map(key => [keySublabels(key).alpha, key]).filter(([letter]) => /^[A-Z]$/.test(letter)));

// A route that scrolls a menu to a lettered item (A:binompdf() and then presses ENTER takes
// ALPHA + letter on a real TI-84, as the geometpdf and chi-square routes already do.
function letterCases(problem) {
  const cases = [];
  const { route } = problem;
  for (let start = 0; start < route.length; start++) {
    if (!['DOWN', 'UP'].includes(route[start]) || ['DOWN', 'UP'].includes(route[start - 1])) continue;
    let enter = start;
    while (['DOWN', 'UP'].includes(route[enter])) enter++;
    if (route[enter] !== 'ENTER') continue;
    const { calculator, rendered } = replay(problem, route.slice(0, enter));
    if (calculator.getScreen().type !== 'menu') continue;
    const menu = rendered();
    const item = menu.items[menu.cursorIndex];
    const letter = /^([A-Z]):/.exec(item)?.[1];
    if (!letter || !letterKeys[letter]) continue;
    const shortcut = ['ALPHA', letterKeys[letter]];
    const saving = enter + 1 - start - shortcut.length;
    if (saving < MIN_SAVING) continue;
    const reached = visible(problem, [...route.slice(0, start), ...shortcut]) === visible(problem, route.slice(0, enter + 1));
    cases.push({ problemId: problem.id, step: start, kind: 'letter', keys: shortcut, replaces: route.slice(start, enter + 1),
      reaches: enter + 1, saving, sameResult: reached, natural: reached ? 'menu letter ' + letter : null, item });
  }
  return cases;
}

const auditProblem = problem => [...engineCases(problem), ...letterCases(problem)];
const rewritable = item => item.sameResult && item.natural;

function hintsFor(problem, item) {
  if (item.kind === 'engine') {
    const last = item.reaches - 1;
    return [problem.route[last] === item.keys[0] ? problem.hints[last] : 'Choose ' + item.keys[0] + '.'];
  }
  const name = item.item.replace(/^[A-Z]:/, '').replace(/\($/, '');
  return ['Press [alpha] to activate letter input.',
    'Press [' + item.keys[1].toLowerCase() + '] (the ' + item.item[0] + ' key) to select ' + name + '.'];
}

// Rewrite one problem to its shortest natural path, earliest case first, until none is left.
function shorten(problem) {
  const before = { route: problem.route, finalView: problem.finalView, computed: problem.computed };
  const applied = [];
  for (let guard = 0; guard < 50; guard++) {
    const cases = auditProblem(problem).filter(rewritable).sort((a, b) => a.step - b.step || b.saving - a.saving);
    if (!cases.length) break;
    const item = cases[0];
    problem.hints = [...problem.hints.slice(0, item.step), ...hintsFor(problem, item), ...problem.hints.slice(item.reaches)];
    problem.route = [...problem.route.slice(0, item.step), ...item.keys, ...problem.route.slice(item.reaches)];
    applied.push(item);
  }
  if (!applied.length) return null;
  // The short route must end exactly where the written one did.
  const { calculator, rendered } = replay(problem, problem.route);
  assert.deepEqual(JSON.parse(JSON.stringify(rendered())), before.finalView, problem.id + ': finalView changed');
  assert.deepEqual(JSON.parse(JSON.stringify(calculator.getComputedValues())), before.computed, problem.id + ': computed changed');
  assert.equal(problem.hints.length, problem.route.length, problem.id + ': one hint per key');
  return { problemId: problem.id, from: before.route, to: problem.route, applied };
}

function describe(item) {
  const verdict = rewritable(item) ? 'REWRITE (' + item.natural + ')'
    : item.sameResult ? 'kept: not a natural shortcut' : 'kept: skips work (different result)';
  return item.problemId + ' step ' + item.step + ': ' + item.keys.join(' ') + ' instead of '
    + item.replaces.join(' ') + ' (saves ' + item.saving + ') - ' + verdict;
}

const args = process.argv.slice(2);
const jsonPath = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

if (args.includes('--apply')) {
  const problems = structuredClone(CALCULATOR_PROBLEMS);
  const rewrites = problems.map(shorten).filter(Boolean);
  for (const rewrite of rewrites) {
    console.log(rewrite.problemId + ': ' + rewrite.from.length + ' -> ' + rewrite.to.length + ' keys');
    for (const item of rewrite.applied) console.log('  ' + describe(item));
  }
  const catalogue = new URL('../apstat-park/calculator-catalog.mjs', import.meta.url);
  writeFileSync(catalogue, '// Generated by scripts/build-park-curriculum.mjs. Do not edit.\nexport const CALCULATOR_PROBLEMS = '
    + JSON.stringify(problems, null, 2) + ';\nexport const CALCULATOR_LEVELS = CALCULATOR_PROBLEMS.filter(level => level.id === level.skillId);\n');
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(rewrites, null, 2) + '\n');
  console.log(rewrites.length + ' routes shortened. Re-run without --apply to confirm zero open cases.');
  process.exit(0);
}

const cases = CALCULATOR_PROBLEMS.flatMap(auditProblem);
for (const item of cases) console.log(describe(item));
const open = cases.filter(rewritable);
console.log(CALCULATOR_PROBLEMS.length + ' problems, ' + cases.length + ' shortcut cases, '
  + open.length + ' open (route takes >= ' + MIN_SAVING + ' more keys than a natural shortcut).');
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(cases, null, 2) + '\n');
process.exit(open.length ? 1 : 0);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DATA, ROUTE, SUMMARY, HOLD_MS, ROUND_MS, tilesFor, expectedAt, createMission, advanceMission as advance } from './calculator-mission.mjs';
import { createCalculatorRuntime } from '../../curriculum_render/railway-server/apstat-park/calculator-runtime.mjs';
import { nativeScriptFilenames } from './calculator-native/manifest.mjs';
import { createClassroomRegistry } from '../../curriculum_render/railway-server/classroom.js';
import { createCalculatorService } from '../../curriculum_render/railway-server/apstat-park/calculator-service.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { pressMissionKey, WRONG_KEY_MS } from './calculator-mission.mjs';
import { levelById } from './calculator-curriculum.mjs';
const engine = createCalculatorRuntime();
const advanceMission = (state, members, now) => advance(state, members, now, engine.transitions(state));

function pose(key, step = 0) {
  const tile = tilesFor(step).find(tile => tile.key === key);
  return { x: tile.x + 10, y: tile.y - 24 };
}
test('mission follows the trainer route and computes the real five-number summary', () => {
  const procedures = JSON.parse(fs.readFileSync(new URL('../data/ti84-procedures-data.json', import.meta.url)));
  assert.deepEqual(ROUTE, procedures.procedures.find(item => item.id === 'one-var-stats').steps.map(step => step.key));
  const sandbox = { window: {}, console }; vm.createContext(sandbox);
  for (const file of nativeScriptFilenames) vm.runInContext(fs.readFileSync(new URL('./calculator-native/' + file, import.meta.url), 'utf8'), sandbox);
  const calculator = sandbox.window.TI84Native.create(); calculator.setList('L1', DATA);
  for (const key of ROUTE) calculator.pressKey(key);
  assert.equal(calculator.getScreen().id, 'one-var-stats-result-page2');
  const result = sandbox.window.TI84StatMath.oneVarStats(DATA);
  assert.deepEqual([result.minX, result.Q1, result.Med, result.Q3, result.maxX], SUMMARY);
});
test('shared relay and client mission definitions are identical', () => {
  for (const file of ['calculator-mission.mjs', 'calculator-engine.mjs', 'calculator-curriculum.mjs', 'calculator-catalog.mjs', 'calculator-variation.mjs', 'calculator-goals.mjs']) {
    assert.equal(fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../../curriculum_render/railway-server/apstat-park/' + file, import.meta.url), 'utf8'));
  }
  for (const file of [...nativeScriptFilenames, 'manifest.mjs']) {
    assert.equal(fs.readFileSync(new URL('./calculator-native/' + file, import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../../curriculum_render/railway-server/apstat-park/calculator-native/' + file, import.meta.url), 'utf8'));
  }
});
test('all players must hold the correct tile; stale and old-revision poses cannot advance', () => {
  const state = createMission(0);
  const a = { pose: pose('STAT'), at: 0, revision: 0 }, b = { pose: pose('ENTER'), at: 0, revision: 0 };
  advanceMission(state, [a, b], 0); assert.equal(state.holdAt, null);
  b.pose = pose('STAT'); advanceMission(state, [a, b], 100);
  advanceMission(state, [a, b], 100 + HOLD_MS); assert.equal(state.step, 1);
  a.pose = b.pose = pose('RIGHT'); a.at = b.at = 1100;
  advanceMission(state, [a, b], 1100); assert.equal(state.holdAt, null);
  a.revision = b.revision = 1;
  advanceMission(state, [a, b], 4000); assert.equal(state.holdAt, null);
});
test('expired calculator input cannot renew the deadline or advance', () => {
  const state = createMission(0);
  const member = { pose: pose('STAT'), revision: 0, at: ROUND_MS - 1 };
  advanceMission(state, [member], ROUND_MS - 1);
  advanceMission(state, [member], ROUND_MS);
  assert.equal(state.step, 0);
  assert.equal(state.startedAt, 0);
  assert.equal(state.revision, 0);
});
test('standing on a repeated key is not a fresh choice until released', () => {
  const state = { ...createMission(0), step: 4, revision: 4, keys: ROUTE.slice(0, 4) };
  const member = { pose: pose('DOWN'), at: 0, revision: 4, ready: false };
  advanceMission(state, [member], 0); advanceMission(state, [member], HOLD_MS);
  assert.equal(state.step, 4); assert.equal(state.holdAt, null);
  member.ready = true; member.at = 1000;
  advanceMission(state, [member], 1000); advanceMission(state, [member], 1000 + HOLD_MS);
  assert.equal(state.step, 5);
});
test('a silent lobby connection expires without starting a calculator attempt', () => {
  let now = 0; const registry = createClassroomRegistry(), received = new Map();
  const service = createCalculatorService({ registry, now: () => now, send: (ws, packet) => received.set(ws, packet) });
  const a = {}, b = {};
  const watch = ws => service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
    pose: { x: 65, y: 676 } });
  try {
    for (const [ws, name] of [[a,'a'],[b,'b']]) {
      registry.join(ws, 'B', name, 'student', 0); watch(ws);
    }
    now = 5100; watch(a); service.tick();
    assert.deepEqual(received.get(a).members.map(member => member.name), ['a']);
    assert.equal(received.get(a).phase, 'gathering');
    assert.equal(received.get(a).startedAt, undefined);
  } finally { service.close(); }
});

test('lobby isolates periods and counts each identity once across multiple tabs', () => {
  const registry = createClassroomRegistry(), received = new Map();
  const service = createCalculatorService({ registry, now: () => 0, send: (ws, packet) => received.set(ws, packet) });
  const a = {}, b = {}, other = {}, tab = {};
  try {
    for (const [ws, section, name] of [[a,'B','a'],[b,'B','b'],[other,'E','a'],[tab,'B','a']]) {
      registry.join(ws, section, name, 'student', 0);
      service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: 380, y: 676 }, pushing: true });
    }
    service.tick();
    assert.equal(received.get(a).members.length, 2);
    assert.equal(received.get(a).pushers.length, 2);
    assert.equal(received.get(other).pushers.length, 1);
    assert.notEqual(received.get(a).epoch, received.get(other).epoch);
    service.detached(tab); assert.equal(received.get(a).members.length, 2);
    service.detached(b); assert.equal(received.get(a).members.length, 1);
  } finally { service.close(); }
});

// Protocol 10 (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC section 5): a wrong key costs the step 2 s.
function press(state, key, now) {
  return pressMissionKey(state, key, now, engine.transitions(state), candidate => engine.isWrongKey(state, candidate));
}
test('a shortcut or an equivalent key is never a wrong key', () => {
  // At the CALC menu, 1 is the digit shortcut for ENTER on 1:1-Var Stats.
  const state = { ...createMission(0), step: 2, keys: ROUTE.slice(0, 2), checkpointKeys: ROUTE.slice(0, 2) };
  assert.equal(engine.isWrongKey(state, '1'), false);
  assert.equal(engine.isWrongKey(state, 'ENTER'), false);
  press(state, '1', 1000);
  assert.equal(state.step, 3);
  assert.equal(state.lastPress.wrong, undefined);
  assert.equal(state.startedAt, 1000, 'an advance renews the clock as before');
});
test('a wrong key costs 2 s; CLEAR back out is free; a key that changes nothing is ignored', () => {
  const state = createMission(0);
  press(state, 'MATH', 1000);
  assert.equal(WRONG_KEY_MS, 2000);
  assert.deepEqual(state.lastPress, { key: 'MATH', advanced: false, wrong: true, penaltyMs: 2000 });
  assert.equal(state.startedAt, -2000);
  press(state, 'CLEAR', 4000);
  assert.deepEqual(state.lastPress, { key: 'CLEAR', advanced: false });
  assert.equal(state.startedAt, -2000);
  // At the STAT menu: back to the start is recovery; a key the engine ignores changes nothing;
  // a modifier alone only arms the next key; opening the list editor (ENTER on EDIT) is wrong.
  press(state, 'STAT', 5000);
  assert.equal(state.step, 1);
  assert.equal(engine.isWrongKey(state, 'CLEAR'), false);
  assert.equal(engine.isWrongKey(state, 'STAT'), false);
  assert.equal(engine.isWrongKey(state, 'MATH'), false, 'MATH does nothing on the STAT menu');
  assert.equal(engine.isWrongKey(state, '2ND'), false);
  assert.equal(engine.isWrongKey(state, 'ENTER'), true);
  press(state, 'MATH', 6000);
  assert.deepEqual(state.lastPress, { key: 'MATH', advanced: false });
});
test('wrong keys in a burst are charged once per 2 s', () => {
  const state = createMission(10000);
  press(state, 'MATH', 11000);
  assert.equal(state.lastPress.penaltyMs, 2000);
  // On the MATH menu a digit runs an entry: a key that does something, off the route.
  press(state, '7', 12000);
  assert.equal(state.lastPress.wrong, true);
  assert.equal(state.lastPress.penaltyMs, 0, 'within 2 s of the last charge');
  assert.equal(state.startedAt, 8000);
  press(state, '8', 13000);
  assert.equal(state.lastPress.wrong, true);
  assert.equal(state.lastPress.penaltyMs, 2000, 'charged again after 2 s');
  assert.equal(state.startedAt, 6000);
});
test('cursor keys and modifiers are never wrong: the old long way on a shortened route is free', () => {
  // scatterplot was shortened to 2ND Y= ENTER ZOOM ... (ZOOM straight from the plot editor).
  const level = levelById('scatterplot'), plotEngine = createCalculatorRuntime(level);
  assert.deepEqual(level.route.slice(0, 4), ['2ND', 'Y=', 'ENTER', 'ZOOM']);
  const pressOn = (state, key, now) => pressMissionKey(state, key, now, plotEngine.transitions(state),
    candidate => plotEngine.isWrongKey(state, candidate));
  const state = { ...createMission(0, level), step: 3, keys: level.route.slice(0, 3), checkpointKeys: level.route.slice(0, 3) };
  assert.equal(plotEngine.isWrongKey(state, 'DOWN'), true, 'the checkpoint rule alone would charge it');
  for (const [key, now] of [['DOWN', 1000], ['DOWN', 4000], ['UP', 7000], ['2ND', 9000], ['2ND', 10000]]) {
    pressOn(state, key, now);
    assert.deepEqual(state.lastPress, { key, advanced: false }, key + ' is never wrong');
  }
  assert.equal(state.startedAt, 0, 'nothing charged');
  pressOn(state, 'ZOOM', 11000);
  assert.equal(state.step, 4, 'ZOOM still advances after the walk');
  // A stray MATH (it opens a menu) at the start of the same route is wrong and charged.
  const fresh = createMission(0, level);
  pressOn(fresh, 'MATH', 1000);
  assert.deepEqual(fresh.lastPress, { key: 'MATH', advanced: false, wrong: true, penaltyMs: 2000 });
  assert.equal(fresh.startedAt, -2000);
});
test('CLEAR back home after ZOOM changed the plot settings is recovery, not a wrong key', () => {
  // ZOOM stored the histogram plot; home is no longer pristine, but it is still the way back.
  const level = levelById('histogram'), plotEngine = createCalculatorRuntime(level);
  const zoom = level.route.indexOf('ZOOM');
  const keys = level.route.slice(0, zoom + 1);
  const state = { ...createMission(0, level), step: zoom + 1, keys: keys.slice(), checkpointKeys: keys.slice() };
  assert.equal(plotEngine.isWrongKey(state, 'CLEAR'), false, 'the engine itself calls it recovery');
  assert.equal(plotEngine.isWrongKey({ ...state, keys: [...keys, '2ND'] }, 'MODE'), false, '2ND QUIT too');
  pressMissionKey(state, 'CLEAR', 1000, plotEngine.transitions(state), candidate => plotEngine.isWrongKey(state, candidate));
  assert.deepEqual(state.lastPress, { key: 'CLEAR', advanced: false });
  assert.equal(state.startedAt, 0, 'nothing charged');
  // Typing on that home screen still does something off the route.
  assert.equal(plotEngine.isWrongKey(state, '7'), true);
});
test('without the engine judgment (older callers, the client) no press is wrong', () => {
  const state = createMission(0);
  pressMissionKey(state, 'MATH', 1000, engine.transitions(state));
  assert.deepEqual(state.lastPress, { key: 'MATH', advanced: false });
  assert.equal(state.startedAt, 0);
});

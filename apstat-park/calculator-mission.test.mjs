import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DATA, ROUTE, SUMMARY, HOLD_MS, ROUND_MS, tilesFor, expectedAt, createMission, advanceMission as advance } from './calculator-mission.mjs';
import { createCalculatorRuntime } from '../../curriculum_render/railway-server/apstat-park/calculator-runtime.mjs';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { createClassroomRegistry } from '../../curriculum_render/railway-server/classroom.js';
import { createCalculatorService } from '../../curriculum_render/railway-server/apstat-park/calculator-service.mjs';
const engine = createCalculatorRuntime();
const advanceMission = (state, members, now) => advance(state, members, now, engine.transitions(state));

function pose(key, step = 0) {
  const tile = tilesFor(step).find(tile => tile.key === key);
  return { x: tile.x + 10, y: tile.y - 24 };
}
test('mission follows the trainer route and computes the real five-number summary', () => {
  const procedures = JSON.parse(fs.readFileSync(new URL('../ti84-procedures-data.json', import.meta.url)));
  assert.deepEqual(ROUTE, procedures.procedures.find(item => item.id === 'one-var-stats').steps.map(step => step.key));
  const sandbox = { window: {}, console }; vm.createContext(sandbox);
  for (const file of nativeScriptFilenames) vm.runInContext(fs.readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
  const calculator = sandbox.window.TI84Native.create(); calculator.setList('L1', DATA);
  for (const key of ROUTE) calculator.pressKey(key);
  assert.equal(calculator.getScreen().id, 'one-var-stats-result-page2');
  const result = sandbox.window.TI84StatMath.oneVarStats(DATA);
  assert.deepEqual([result.minX, result.Q1, result.Med, result.Q3, result.maxX], SUMMARY);
});
test('shared relay and client mission definitions are identical', () => {
  for (const file of ['calculator-mission.mjs', 'calculator-engine.mjs']) {
    assert.equal(fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../../curriculum_render/railway-server/apstat-park/' + file, import.meta.url), 'utf8'));
  }
  for (const file of [...nativeScriptFilenames, 'manifest.mjs']) {
    assert.equal(fs.readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'),
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
test('30-second expiry resets the current step, hints, and requires fresh selections', () => {
  const state = createMission(0);
  const member = { pose: pose('STAT'), revision: 0, at: ROUND_MS - 1 };
  advanceMission(state, [member], ROUND_MS - 1);
  assert.equal(state.timeoutCount, 0);
  advanceMission(state, [member], ROUND_MS);
  assert.equal(state.step, 0); assert.equal(state.revision, 1);
  assert.equal(state.timeoutCount, 1); assert.equal(state.startedAt, ROUND_MS);
  assert.deepEqual(state.hintKeys, ['STAT']); assert.equal(state.holdAt, null);
  advanceMission(state, [member], ROUND_MS + 1);
  assert.equal(state.holdAt, null, 'pre-timeout choices cannot advance');
  let now = ROUND_MS + 100;
  for (let step = 0; step < 12; step++) {
    const member = { pose: pose(expectedAt(step), step), revision: state.revision, at: now };
    advanceMission(state, [member], now);
    advanceMission(state, [member], now + HOLD_MS);
    now += 1200;
  }
  assert.equal(state.complete, true); assert.equal(state.bonus, 11);
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
test('a silent connection expires and cannot keep the team blocked', () => {
  let now = 0; const registry = createClassroomRegistry(), received = new Map();
  const service = createCalculatorService({ registry, now: () => now, send: (ws, packet) => received.set(ws, packet) });
  const a = {}, b = {};
  try {
    for (const [ws, name] of [[a,'a'],[b,'b']]) {
      registry.join(ws, 'B', name, 'student', 0); service.handle(ws, { type: 'calculator_join' });
    }
    now = 5100;
    service.handle(a, { type: 'calculator_pose', epoch: received.get(a).epoch, revision: 0, pose: pose('STAT') });
    service.tick();
    assert.deepEqual(received.get(a).members.map(member => member.name), ['a']);
    now += HOLD_MS; service.tick(); assert.equal(received.get(a).step, 1);
  } finally { service.close(); }
});
test('relay isolates periods, resumes progress, deduplicates tabs, and drops disconnected members', () => {
  let now = 0; const registry = createClassroomRegistry(), received = new Map();
  const service = createCalculatorService({ registry, now: () => now, send: (ws, packet) => received.set(ws, packet) });
  const a = {}, b = {}, other = {}, tab = {};
  try {
    for (const [ws, section, name] of [[a,'B','a'],[b,'B','b'],[other,'E','a'],[tab,'B','a']]) {
      registry.join(ws, section, name, 'student', 0); service.handle(ws, { type: 'calculator_join' });
    }
    assert.equal(received.get(a).members.length, 2);
    assert.notEqual(received.get(a).epoch, received.get(other).epoch);
    const sendPose = ws => service.handle(ws, { type: 'calculator_pose', epoch: received.get(ws).epoch,
      revision: received.get(ws).revision, pose: pose('STAT') });
    sendPose(a); sendPose(b); service.tick(); now = 950; sendPose(a); sendPose(b); service.tick();
    assert.equal(received.get(a).step, 1); assert.equal(received.get(other).step, 0);
    service.detached(b); service.detached(tab); assert.equal(received.get(a).members.length, 1);
    service.handle(b, { type: 'calculator_join' }); assert.equal(received.get(b).step, 1);
    service.handle(a, { type: 'calculator_pose', epoch: received.get(a).epoch, revision: 0, pose: pose('STAT') });
    assert.equal(received.get(a).step, 1);
  } finally { service.close(); }
});

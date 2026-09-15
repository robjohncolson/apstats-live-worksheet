// Lobby occupancy: the labels drawn under each puzzle door and the lobby status
// line, fed by the relay's park_lobby reply. Pure helpers, no canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL_TITLES, occupantLabel, occupantsOf, lobbySummary } from './board-scene.mjs';

const levels = [
  { levelIndex: 0, online: ['carol'] },
  { levelIndex: 3, online: ['alice', 'bob', 'dave', 'erin'] },
  { levelIndex: 5, online: ['me'] },
];

test('occupantLabel shows at most two names then a +N overflow', () => {
  assert.equal(occupantLabel([]), '');
  assert.equal(occupantLabel(null), '');
  assert.equal(occupantLabel(['alice']), 'alice');
  assert.equal(occupantLabel(['alice', 'bob']), 'alice, bob');
  assert.equal(occupantLabel(['alice', 'bob', 'dave', 'erin']), 'alice, bob +2');
  assert.equal(occupantLabel(['alice', 'bob', 'dave'], 3), 'alice, bob, dave');
  assert.equal(occupantLabel(['alice', '', null, 7]), 'alice');
});

test('occupantsOf reads one level and excludes the viewer', () => {
  assert.deepEqual(occupantsOf(levels, 3, 'me'), ['alice', 'bob', 'dave', 'erin']);
  assert.deepEqual(occupantsOf(levels, 3, 'bob'), ['alice', 'dave', 'erin']);
  assert.deepEqual(occupantsOf(levels, 5, 'me'), []);
  assert.deepEqual(occupantsOf(levels, 1, 'me'), []);
  assert.deepEqual(occupantsOf(undefined, 0, 'me'), []);
  assert.deepEqual(occupantsOf([{ levelIndex: 0 }], 0, 'me'), []);
});

test('lobbySummary names non-empty levels in door order and is empty when nobody is inside', () => {
  assert.equal(lobbySummary(levels, 'me'),
    'Friends inside: Hello together (carol) · Moving walls (alice, bob, dave +1)');
  assert.equal(lobbySummary([], 'me'), '');
  assert.equal(lobbySummary([{ levelIndex: 5, online: ['me'] }], 'me'), '');
  assert.equal(LEVEL_TITLES.length, 6);
});

test('the panel polls park_lobby only in the lobby and hands occupancy to the scene', () => {
  const panel = readFileSync(new URL('./panel.mjs', import.meta.url), 'utf8');
  assert.match(panel, /request\('park_lobby'\)/);
  assert.match(panel, /if \(selectedLevel === null\) \{ await pollLobby\(\); return; \}/);
  assert.match(panel, /occupancy: \(\) => lobbyOnline/);
  assert.match(panel, /lobbyOnline = \[\]; lastLobbyAt = 0;/);
  const scene = readFileSync(new URL('./board-scene.mjs', import.meta.url), 'utf8');
  assert.match(scene, /Up to join them/);
});

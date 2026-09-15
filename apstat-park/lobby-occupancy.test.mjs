// Park doors on the calendar board: three doors, each opening one level, with
// the relay's park_lobby occupancy drawn on them so friends can meet without
// planning. Pure helpers plus static pins on the board and panel source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL_TITLES, occupantLabel, occupantsOf } from './board-scene.mjs';

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
  assert.equal(LEVEL_TITLES.length, 6);
});

test('the scene is always one level: no lobby, every exit returns to the calendar', () => {
  const scene = readFileSync(new URL('./board-scene.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(scene, /lobby\s*[=:?]/);
  assert.doesNotMatch(scene, /onLobby|onSelect|lobbyDoor/);
  assert.match(scene, /Up returns to the calendar/);
  const panel = readFileSync(new URL('./panel.mjs', import.meta.url), 'utf8');
  assert.match(panel, /levelIndex = 0/);
  assert.doesNotMatch(panel, /park_lobby|lobbySummary/);
  assert.match(panel, /showScene\(\[0, 1, 2, 3, 4, 5\]\.includes\(levelIndex\) \? levelIndex : 0\)/);
});

test('the calendar board owns three doors (Hello together, Moving walls, Upstairs / downstairs) and the occupancy poll', () => {
  const board = readFileSync(new URL('../classroom-board.js', import.meta.url), 'utf8');
  const doors = /var PARK_DOORS = \[\s*\{ level: 0, title: 'Hello together' \},\s*\{ level: 3, title: 'Moving walls' \},\s*\{ level: 4, title: 'Upstairs \/ downstairs' \}\s*\];/;
  assert.match(board, doors);
  assert.match(board, /type: 'park_lobby', requestId: 'board_lobby_'/);
  assert.match(board, /msg\.requestId\.indexOf\('board_lobby_'\) === 0/);
  assert.match(board, /levelIndex: levelIndex,/);                 // the panel opens straight into the chosen level
  assert.match(board, /enterPark\(PARK_DOORS\[di\]\.level\)/);     // Up on any door
  assert.match(board, /enterPark\(PARK_DOORS\[0\]\.level\)/);      // walk-in on door 1 only
  assert.match(board, /'Enter APStat Park door ' \+ \(i \+ 1\)/);
  assert.match(board, /name !== username/);                        // the viewer is never listed on a door
});

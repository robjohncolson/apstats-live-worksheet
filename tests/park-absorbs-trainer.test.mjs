// Phase 0 of APSTAT_PARK_TRAINER_ABSORB_SPEC.md (§2): contract tests, no behavior change.
// Proves the park catalogue is the superset of every surface the v2 trainer served, so the
// trainer can be retired (Phase 6) without losing a skill. If one of these fails, the fix is
// CONTENT and it is the teacher's call — do not edit this test to make it pass.
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALCULATOR_LEVELS } from '../apstat-park/calculator-curriculum.mjs';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const PARK_SKILL_IDS = new Set(CALCULATOR_LEVELS.map(level => level.skillId));

// v2 procedure ids that have NO park skill, each with a one-line reason (spec §2.1).
// Empty today: every v2 procedure id is a park skillId. Add to this list only with the teacher's call.
const RETIRED_PROCEDURES = [
  // { id: 'example-id', reason: 'why the park does not carry it' },
];

const notParkSkills = ids => [...new Set(ids)].filter(id => !PARK_SKILL_IDS.has(id));

describe('park catalogue covers the lesson map (spec §2.1)', () => {
  const lessonMap = readJson('data/ti84-lesson-map.json');

  test('every `lessons` skill id is a CALCULATOR_LEVELS skillId', () => {
    const ids = Object.values(lessonMap.lessons).flat();
    expect(ids.length).toBeGreaterThan(0);
    expect(notParkSkills(ids)).toEqual([]);
  });

  test('every `bonus` skill id is a CALCULATOR_LEVELS skillId', () => {
    const ids = Object.values(lessonMap.bonus).flat();
    expect(ids.length).toBeGreaterThan(0);
    expect(notParkSkills(ids)).toEqual([]);
  });
});

describe('park catalogue covers the v2 procedures (spec §2.1)', () => {
  const procedures = readJson('ti84-procedures-data.json').procedures;
  const retiredIds = new Set(RETIRED_PROCEDURES.map(entry => entry.id));

  test('every v2 procedure id is a park skillId or an explicitly retired procedure', () => {
    const ids = procedures.map(procedure => procedure.id);
    const missing = notParkSkills(ids).filter(id => !retiredIds.has(id));
    expect(missing).toEqual([]);
  });

  test('every RETIRED_PROCEDURES entry names a real v2 procedure with a reason', () => {
    const procedureIds = new Set(procedures.map(procedure => procedure.id));
    for (const entry of RETIRED_PROCEDURES) {
      expect(procedureIds.has(entry.id), `${entry.id} is not a v2 procedure`).toBe(true);
      expect(typeof entry.reason === 'string' && entry.reason.length > 0, `${entry.id} needs a reason`).toBe(true);
      expect(PARK_SKILL_IDS.has(entry.id), `${entry.id} is a park skill; it is not retired`).toBe(false);
    }
  });
});

describe('relay calculator-native mirrors ti84-trainer-v2/native (spec §2.2)', () => {
  const clientDir = path.join(ROOT, 'ti84-trainer-v2', 'native');
  const relayDir = path.resolve(ROOT, '..', 'curriculum_render', 'railway-server', 'apstat-park', 'calculator-native');
  const relayPresent = fs.existsSync(relayDir);
  const expectedFiles = [...nativeScriptFilenames, 'manifest.mjs'];

  test.skipIf(!relayPresent)('every manifest script and the manifest are byte-identical on both sides', () => {
    for (const file of expectedFiles) {
      const client = fs.readFileSync(path.join(clientDir, file));
      const relay = fs.readFileSync(path.join(relayDir, file));
      expect(client.equals(relay), `${file} differs between client and relay`).toBe(true);
    }
  });

  test.skipIf(!relayPresent)('the relay directory carries nothing the client does not, and nothing drifts', () => {
    const relayFiles = fs.readdirSync(relayDir).filter(name => fs.statSync(path.join(relayDir, name)).isFile());
    expect([...relayFiles].sort()).toEqual([...expectedFiles].sort());
    for (const file of relayFiles) {
      expect(fs.existsSync(path.join(clientDir, file)), `${file} exists on the relay but not the client`).toBe(true);
    }
  });
});

describe('pattern recognition data references only park skillIds (spec §2.3)', () => {
  const patterns = readJson('ti84-pattern-recognition-data.json');

  test('every patternSignatures key is a park skillId', () => {
    expect(notParkSkills(Object.keys(patterns.patternSignatures))).toEqual([]);
  });

  test('canonical problems are keyed by park skillIds and each skill has at least one problem', () => {
    expect(notParkSkills(Object.keys(patterns.canonicalProblems))).toEqual([]);
    for (const [skillId, problems] of Object.entries(patterns.canonicalProblems)) {
      expect(Array.isArray(problems) && problems.length > 0, `${skillId} has no canonical problem`).toBe(true);
    }
  });

  test('confusion pairs name park skillIds on both sides', () => {
    const ids = patterns.confusionMatrix.flatMap(pair => [pair.a, pair.b]);
    expect(notParkSkills(ids)).toEqual([]);
  });

  test('distractor sets are keyed by park skillIds and list only park skillIds', () => {
    expect(notParkSkills(Object.keys(patterns.distractorSets))).toEqual([]);
    expect(notParkSkills(Object.values(patterns.distractorSets).flat())).toEqual([]);
  });
});

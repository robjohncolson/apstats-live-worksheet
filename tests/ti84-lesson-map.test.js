// Audits the curated Desk↔trainer lesson map (TI84_TRAINER_DESK_LINK_SPEC.md
// §1). The map is hand-curated; these checks are the floor that catches
// typos and drift — CED-correct topic placement stays a human review job.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

const map = JSON.parse(fs.readFileSync(path.join(root, 'data', 'ti84-lesson-map.json'), 'utf8'));
const schedule = JSON.parse(fs.readFileSync(path.join(root, 'data', 'lesson-schedule.json'), 'utf8'));

const w = {};
new Function('window', fs.readFileSync(path.join(root, 'ti84-trainer-v2', 'generated', 'data-procedures.js'), 'utf8'))(w);
const procedures = new Map(Object.values(w)[0].procedures.map((p) => [p.id, p]));

describe('ti84-lesson-map', () => {
  it('has the expected schema', () => {
    expect(map.schemaVersion).toBe(1);
    expect(Object.keys(map.lessons).length).toBeGreaterThan(0);
    for (const ids of [...Object.values(map.lessons), ...Object.values(map.planned)]) {
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it('every mapped procedure exists in the trainer', () => {
    for (const [topic, ids] of Object.entries(map.lessons)) {
      for (const id of ids) {
        expect(procedures.has(id), `${topic} maps unknown procedure "${id}"`).toBe(true);
      }
    }
  });

  it('planned procedures do NOT exist yet — promote them to lessons when they ship', () => {
    for (const [topic, ids] of Object.entries(map.planned)) {
      for (const id of ids) {
        expect(procedures.has(id), `${topic} planned procedure "${id}" now exists — move it to lessons`).toBe(false);
      }
    }
  });

  it('every topic key exists in the lesson schedule', () => {
    for (const topic of [...Object.keys(map.lessons), ...Object.keys(map.planned)]) {
      expect(schedule.lessons[topic], `unknown topic key "${topic}"`).toBeTruthy();
    }
  });

  it('mapped procedures match their lesson unit (typo floor)', () => {
    for (const [topic, ids] of Object.entries(map.lessons)) {
      const lessonUnit = schedule.lessons[topic].unit;
      for (const id of ids) {
        expect(procedures.get(id).unit, `${topic} (unit ${lessonUnit}) maps ${id} (unit ${procedures.get(id).unit})`).toBe(lessonUnit);
      }
    }
  });

  it('no procedure is mapped to more than one lesson', () => {
    const seen = new Map();
    for (const [topic, ids] of Object.entries(map.lessons)) {
      for (const id of ids) {
        expect(seen.has(id), `${id} mapped to both ${seen.get(id)} and ${topic}`).toBe(false);
        seen.set(id, topic);
      }
    }
  });

  it('every unit with trainer procedures maps at least one lesson (coverage floor)', () => {
    const unitsWithProcedures = new Set([...procedures.values()].map((p) => p.unit));
    const mappedUnits = new Set(Object.keys(map.lessons).map((topic) => schedule.lessons[topic].unit));
    for (const unit of unitsWithProcedures) {
      expect(mappedUnits.has(unit), `unit ${unit} has procedures but no mapped lesson`).toBe(true);
    }
  });
});

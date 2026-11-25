// @vitest-environment node
// Lesson locks were retired 2026-09-10 and their inert machinery was removed 2026-11-25.
// Pin that the Desk carries no sequential-gate / override-gate code and keeps every lesson open.
import { describe, it, expect } from 'vitest';
import { deskSource, deskHtml } from './helpers/desk-source.js';

const html = deskHtml();
const src = deskSource();

describe('lesson-lock machinery stays retired', () => {
  it('Desk HTML and modules define no sequential-gate or override-gate functions, ids, or classes', () => {
    for (const fn of [
      '_isLessonUnlocked', '_showLessonLockedDialog', '_readLessonUnlocks',
      '_isTopicLessonUnlocked', '_refreshLessonUnlocks',
      '_showOverrideGateModal', '_hideOverrideGateModal', '_confirmOverrideGate',
    ]) {
      expect(src, fn).not.toMatch(new RegExp(`function\\s+${fn}\\s*\\(`));
    }
    for (const token of ['id="override-gate-modal"', 'id="view-as-override-gate"', '.cell-locked', "'cell-locked'"]) {
      expect(html, token).not.toContain(token);
      expect(src, token).not.toContain(token);
    }
  });
});

/**
 * Unit tests for unit4_schedule_v4.html
 * Tests schedule structure, dates, topics, quizzes, and lagged quiz system
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { join } from 'path';

let document;
let periodBTable;
let periodETable;
let quizInventoryTable;

beforeAll(() => {
  const html = readFileSync(join(__dirname, '..', 'unit4_schedule_v4.html'), 'utf-8');
  const dom = new JSDOM(html);
  document = dom.window.document;

  // Get schedule tables
  const tables = document.querySelectorAll('.schedule-table');
  periodBTable = tables[0];
  periodETable = tables[1];
  quizInventoryTable = tables[2];
});

describe('Schedule Structure', () => {
  it('should have a header with Unit 4 title', () => {
    const header = document.querySelector('.header h1');
    expect(header).toBeDefined();
    expect(header.textContent).toContain('Unit 4');
    expect(header.textContent).toContain('Probability');
  });

  it('should show correct date range in meta', () => {
    const meta = document.querySelector('.header .meta');
    expect(meta.textContent).toContain('January 20');
    expect(meta.textContent).toContain('February 6, 2026');
  });

  it('should have both Period B and Period E sections', () => {
    const periodBHeader = document.querySelector('.section-header.period-b');
    const periodEHeader = document.querySelector('.section-header.period-e');

    expect(periodBHeader).toBeDefined();
    expect(periodEHeader).toBeDefined();
    expect(periodBHeader.textContent).toContain('Period B');
    expect(periodEHeader.textContent).toContain('Period E');
  });

  it('should show correct meeting days for each period', () => {
    const periodBHeader = document.querySelector('.section-header.period-b');
    const periodEHeader = document.querySelector('.section-header.period-e');

    expect(periodBHeader.textContent).toContain('Mon / Tue / Thu / Fri');
    expect(periodEHeader.textContent).toContain('Mon / Wed / Thu / Fri');
  });

  it('should have three schedule tables (B, E, Quiz Inventory)', () => {
    const tables = document.querySelectorAll('.schedule-table');
    expect(tables.length).toBe(3);
  });
});

describe('Daily Rhythm Section', () => {
  it('should have daily rhythm section', () => {
    const rhythmBox = document.querySelector('.rhythm-box');
    expect(rhythmBox).toBeDefined();
  });

  it('should show the correct daily flow steps', () => {
    const rhythmSteps = document.querySelectorAll('.rhythm-step');
    const stepTexts = Array.from(rhythmSteps).map(s => s.textContent);

    expect(stepTexts).toContain('Videos + Follow-Along');
    expect(stepTexts).toContain('Blooket (12 min)');
    expect(stepTexts).toContain('Drill (assigned)');
  });

  it('should explain the lagged quiz system', () => {
    const laggedAlert = document.querySelector('.alert-success');
    expect(laggedAlert.textContent).toContain('Lagged Quiz System');
    expect(laggedAlert.textContent).toContain('following class');
  });
});

describe('Period B Schedule', () => {
  const getRowByDate = (dateStr) => {
    const rows = periodBTable.querySelectorAll('tbody tr:not(.week-divider)');
    return Array.from(rows).find(row =>
      row.querySelector('.date-cell')?.textContent.includes(dateStr)
    );
  };

  it('should have Week 1, 2, 3 dividers', () => {
    const dividers = periodBTable.querySelectorAll('.week-divider');
    expect(dividers.length).toBe(3);
    expect(dividers[0].textContent).toContain('Week 1');
    expect(dividers[1].textContent).toContain('Week 2');
    expect(dividers[2].textContent).toContain('Week 3');
  });

  it('should start with Topics 4.1-4.2 on Tue 1/20', () => {
    const row = getRowByDate('1/20');
    expect(row).toBeDefined();
    expect(row.textContent).toContain('4.1');
    expect(row.textContent).toContain('4.2');
    expect(row.textContent).toContain('Simulation');
  });

  it('should have Topics 4.3-4.5 on Thu 1/22 (Long block)', () => {
    const row = getRowByDate('1/22');
    expect(row).toBeDefined();
    expect(row.classList.contains('long-block')).toBe(true);
    expect(row.textContent).toContain('4.3');
    expect(row.textContent).toContain('4.4');
    expect(row.textContent).toContain('4.5');
  });

  it('should assign Quiz 4.1-4.2 on Thu 1/22', () => {
    const row = getRowByDate('1/22');
    expect(row.querySelector('.assign-cell').textContent).toContain('Quiz 4.1-4.2');
  });

  it('should have Quiz 4.1-4.2 due on Fri 1/23', () => {
    const row = getRowByDate('1/23');
    expect(row.querySelector('.due-cell').textContent).toContain('Quiz 4.1-4.2');
  });

  it('should have Progress Check on Fri 1/30', () => {
    const row = getRowByDate('1/30');
    expect(row).toBeDefined();
    expect(row.textContent).toContain('Progress Check');
    expect(row.querySelector('.badge-progress')).toBeDefined();
  });

  it('should have Unit 4 Test on Thu 2/5', () => {
    const row = getRowByDate('2/5');
    expect(row).toBeDefined();
    expect(row.classList.contains('test-day')).toBe(true);
    expect(row.textContent).toContain('UNIT 4 TEST');
    expect(row.textContent).toContain('20 MC');
    expect(row.textContent).toContain('2 FRQ');
  });

  it('should have Binomial & Geometric (4.10-4.12) on Thu 1/29', () => {
    const row = getRowByDate('1/29');
    expect(row).toBeDefined();
    expect(row.textContent).toContain('4.10');
    expect(row.textContent).toContain('4.11');
    expect(row.textContent).toContain('4.12');
    expect(row.textContent).toContain('Binomial');
    expect(row.textContent).toContain('Geometric');
  });
});

describe('Period E Schedule', () => {
  const getRowByDate = (dateStr) => {
    const rows = periodETable.querySelectorAll('tbody tr:not(.week-divider)');
    return Array.from(rows).find(row =>
      row.querySelector('.date-cell')?.textContent.includes(dateStr)
    );
  };

  it('should start with Topics 4.1-4.2 on Wed 1/21', () => {
    const row = getRowByDate('1/21');
    expect(row).toBeDefined();
    expect(row.textContent).toContain('4.1');
    expect(row.textContent).toContain('4.2');
  });

  it('should have standalone 4.3 on Thu 1/22', () => {
    const row = getRowByDate('1/22');
    expect(row).toBeDefined();
    expect(row.textContent).toContain('4.3');
    expect(row.textContent).toContain('9 min');
  });

  it('should have Unit 4 Test on Fri 2/6', () => {
    const row = getRowByDate('2/6');
    expect(row).toBeDefined();
    expect(row.classList.contains('test-day')).toBe(true);
    expect(row.textContent).toContain('UNIT 4 TEST');
  });

  it('should split binomial/geometric across two days', () => {
    // 4.10-4.11 on Fri 1/30
    const row1 = getRowByDate('1/30');
    expect(row1.textContent).toContain('4.10');
    expect(row1.textContent).toContain('4.11');
    expect(row1.textContent).toContain('Binomial');

    // 4.12 on Mon 2/2
    const row2 = getRowByDate('2/2');
    expect(row2.textContent).toContain('4.12');
    expect(row2.textContent).toContain('Geometric');
  });

  it('should have Progress Check on Thu 2/5', () => {
    const row = getRowByDate('2/5');
    expect(row).toBeDefined();
    expect(row.textContent).toContain('Progress Check');
  });
});

describe('Lagged Quiz System Validation', () => {
  it('should never have quiz due on same day as content', () => {
    // Period B: Check that content day doesn't have same-topic quiz due
    const periodBRows = periodBTable.querySelectorAll('tbody tr:not(.week-divider)');

    periodBRows.forEach(row => {
      const topics = row.querySelectorAll('.topic-tag');
      const dueCell = row.querySelector('.due-cell');

      if (topics.length > 0 && dueCell) {
        const topicNums = Array.from(topics).map(t => t.textContent.trim());
        const dueText = dueCell.textContent;

        // If learning 4.3 today, Quiz 4.3 should NOT be due today
        topicNums.forEach(topic => {
          const topicQuiz = `Quiz ${topic}`;
          if (dueText.includes(topicQuiz)) {
            // This would be a violation - quiz due same day as learning
            expect(dueText).not.toContain(topicQuiz);
          }
        });
      }
    });
  });

  it('should have quiz assigned AFTER content is covered', () => {
    // Quiz 4.1-4.2 should be assigned on or after topics 4.1-4.2 are covered
    const periodBRows = periodBTable.querySelectorAll('tbody tr:not(.week-divider)');
    const rowsArray = Array.from(periodBRows);

    // Find when 4.1-4.2 content is covered
    const contentDayIndex = rowsArray.findIndex(row =>
      row.textContent.includes('4.1') && row.textContent.includes('4.2') &&
      row.querySelector('.topic-tag')
    );

    // Find when Quiz 4.1-4.2 is assigned
    const quizAssignIndex = rowsArray.findIndex(row =>
      row.querySelector('.assign-cell')?.textContent.includes('Quiz 4.1-4.2')
    );

    expect(quizAssignIndex).toBeGreaterThanOrEqual(contentDayIndex);
  });
});

describe('Quiz Inventory Table', () => {
  it('should list all quizzes', () => {
    const quizzes = quizInventoryTable.querySelectorAll('tbody tr');
    expect(quizzes.length).toBeGreaterThanOrEqual(7);
  });

  it('should have Quiz 4.1-4.2 with correct dates', () => {
    const rows = quizInventoryTable.querySelectorAll('tbody tr');
    const quiz412 = Array.from(rows).find(r => r.textContent.includes('Quiz 4.1-4.2'));

    expect(quiz412).toBeDefined();
    expect(quiz412.textContent).toContain('Simulation');
    expect(quiz412.textContent).toContain('LLN');
    expect(quiz412.textContent).toContain('Thu 1/22'); // B Assigned
    expect(quiz412.textContent).toContain('Fri 1/23'); // B Due
  });

  it('should show different quiz splits for Period E', () => {
    const text = quizInventoryTable.textContent;
    // Period E has separate Quiz 4.10-4.11 and Quiz 4.12
    expect(text).toContain('Quiz 4.10-4.11');
    expect(text).toContain('Quiz 4.12');
  });
});

describe('Autograder Rules Section', () => {
  it('should have Communication Gate rules', () => {
    const dangerAlert = document.querySelector('.alert-danger');
    expect(dangerAlert).toBeDefined();
    expect(dangerAlert.textContent).toContain('Communication Gate');
    expect(dangerAlert.textContent).toContain('No Naked Numbers');
  });

  it('should list three requirements for full credit', () => {
    const dangerAlert = document.querySelector('.alert-danger');
    expect(dangerAlert.textContent).toContain('probability statement');
    expect(dangerAlert.textContent).toContain('setup structure');
    expect(dangerAlert.textContent).toContain('final number');
  });

  it('should have feedback tags listed', () => {
    const feedbackTags = document.querySelectorAll('.feedback-tag');
    const tagTexts = Array.from(feedbackTags).map(t => t.textContent);

    expect(tagTexts).toContain('MISSING_PROB_STATEMENT');
    expect(tagTexts).toContain('MISSING_SETUP');
    expect(tagTexts).toContain('CALCULATOR_SPEAK_ONLY');
  });
});

describe('Drill Cartridge Priority', () => {
  it('should list drill cartridges in priority order', () => {
    const priorityItems = document.querySelectorAll('.priority-list li');
    expect(priorityItems.length).toBeGreaterThanOrEqual(3);
  });

  it('should have U4-TABLE-TREE as first priority', () => {
    const firstPriority = document.querySelector('.priority-list li:first-child');
    expect(firstPriority.textContent).toContain('U4-TABLE-TREE');
    expect(firstPriority.textContent).toContain('Conditional');
  });

  it('should have U4-BINOM-GEO as second priority', () => {
    const items = document.querySelectorAll('.priority-list li');
    expect(items[1].textContent).toContain('U4-BINOM-GEO');
  });

  it('should have U4-RV-PARAMS as third priority', () => {
    const items = document.querySelectorAll('.priority-list li');
    expect(items[2].textContent).toContain('U4-RV-PARAMS');
  });
});

describe('Visual Indicators', () => {
  it('should have long-block class on extended period days', () => {
    const longBlocks = document.querySelectorAll('.long-block');
    expect(longBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it('should have test-day class on test days', () => {
    const testDays = document.querySelectorAll('.test-day');
    expect(testDays.length).toBe(2); // One for Period B, one for Period E
  });

  it('should have badge-long on long block days', () => {
    const longBadges = document.querySelectorAll('.badge-long');
    expect(longBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('should have badge-test on test days', () => {
    const testBadges = document.querySelectorAll('.badge-test');
    expect(testBadges.length).toBe(2);
  });

  it('should have badge-progress on progress check days', () => {
    const pcBadges = document.querySelectorAll('.badge-progress');
    expect(pcBadges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Content Coverage Completeness', () => {
  it('should cover all topics 4.1 through 4.12 in Period B', () => {
    const topics = periodBTable.querySelectorAll('.topic-tag');
    const topicNums = Array.from(topics).map(t => t.textContent.trim());

    for (let i = 1; i <= 12; i++) {
      expect(topicNums).toContain(`4.${i}`);
    }
  });

  it('should cover all topics 4.1 through 4.12 in Period E', () => {
    const topics = periodETable.querySelectorAll('.topic-tag');
    const topicNums = Array.from(topics).map(t => t.textContent.trim());

    for (let i = 1; i <= 12; i++) {
      expect(topicNums).toContain(`4.${i}`);
    }
  });

  it('should include FRQ Workshop for both periods', () => {
    expect(periodBTable.textContent).toContain('FRQ Workshop');
    expect(periodETable.textContent).toContain('FRQ Workshop');
  });
});

describe('Footer Information', () => {
  it('should have school name in footer', () => {
    const footer = document.querySelector('.footer');
    expect(footer.textContent).toContain('Lynn English High School');
  });

  it('should show both period meeting patterns', () => {
    const footer = document.querySelector('.footer');
    expect(footer.textContent).toContain('Period B: Mon/Tue/Thu/Fri');
    expect(footer.textContent).toContain('Period E: Mon/Wed/Thu/Fri');
  });
});

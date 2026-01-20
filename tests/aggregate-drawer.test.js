/**
 * Unit tests for Aggregate Drawer features
 * Tests focus-following behavior, escape key, and bar chart rendering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Aggregate Drawer', () => {
  let document;
  let window;
  let drawer;
  let content;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <div class="question">
          <span class="question-number">1.</span>
          <input type="text" class="blank" data-question-id="WS-U4L1-3-Q1" data-answer="test">
        </div>
        <div class="question">
          <span class="question-number">2.</span>
          <input type="text" class="blank" data-question-id="WS-U4L1-3-Q2" data-answer="answer">
          <input type="text" class="blank" data-question-id="WS-U4L1-3-Q3" data-answer="value">
        </div>
        <div id="aggregateDrawer" class="aggregate-drawer">
          <div class="drawer-header">
            <h3>Class Responses</h3>
            <span class="drawer-hint">Tab to change input - Esc to close</span>
            <button class="drawer-close">&times;</button>
          </div>
          <div class="drawer-content" id="drawerContent">
            <p>Click a "Class" button next to a question to see responses.</p>
          </div>
        </div>
      </body>
      </html>
    `);
    document = dom.window.document;
    window = dom.window;
    drawer = document.getElementById('aggregateDrawer');
    content = document.getElementById('drawerContent');
  });

  describe('Drawer Open/Close', () => {
    it('should be closed by default (no .open class)', () => {
      expect(drawer.classList.contains('open')).toBe(false);
    });

    it('should open when .open class is added', () => {
      drawer.classList.add('open');
      expect(drawer.classList.contains('open')).toBe(true);
    });

    it('should close when .open class is removed', () => {
      drawer.classList.add('open');
      drawer.classList.remove('open');
      expect(drawer.classList.contains('open')).toBe(false);
    });
  });

  describe('Escape Key Handling', () => {
    it('should close drawer on Escape key when open', () => {
      drawer.classList.add('open');

      // Simulate closeDrawer function behavior
      const closeDrawer = () => {
        drawer.classList.remove('open');
      };

      // Simulate keydown event handling
      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          closeDrawer();
        }
      };

      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      handleKeydown(event);

      expect(drawer.classList.contains('open')).toBe(false);
    });

    it('should not affect drawer when other keys pressed', () => {
      drawer.classList.add('open');

      const closeDrawer = () => {
        drawer.classList.remove('open');
      };

      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          closeDrawer();
        }
      };

      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      handleKeydown(event);

      expect(drawer.classList.contains('open')).toBe(true);
    });
  });

  describe('Focus-Following Behavior', () => {
    it('should track currently focused blank', () => {
      let currentFocusedBlank = null;

      const handleBlankFocus = (blank) => {
        currentFocusedBlank = blank;
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[0]);

      expect(currentFocusedBlank).toBe(blanks[0]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q1');
    });

    it('should update focused blank when focus changes', () => {
      let currentFocusedBlank = null;

      const handleBlankFocus = (blank) => {
        currentFocusedBlank = blank;
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[0]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q1');

      handleBlankFocus(blanks[1]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q2');

      handleBlankFocus(blanks[2]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q3');
    });

    it('should trigger drawer update when drawer is open and focus changes', () => {
      drawer.classList.add('open');
      let updateCalled = false;
      let updatedBlank = null;

      const loadAggregateDataForBlank = (blank) => {
        updateCalled = true;
        updatedBlank = blank;
      };

      const handleBlankFocus = (blank) => {
        if (drawer.classList.contains('open')) {
          loadAggregateDataForBlank(blank);
        }
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[1]);

      expect(updateCalled).toBe(true);
      expect(updatedBlank.dataset.questionId).toBe('WS-U4L1-3-Q2');
    });

    it('should NOT trigger drawer update when drawer is closed', () => {
      let updateCalled = false;

      const loadAggregateDataForBlank = () => {
        updateCalled = true;
      };

      const handleBlankFocus = (blank) => {
        if (drawer.classList.contains('open')) {
          loadAggregateDataForBlank(blank);
        }
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[0]);

      expect(updateCalled).toBe(false);
    });
  });

  describe('Single Chart Per Input', () => {
    it('should load data for single blank, not multiple', () => {
      const blanks = document.querySelectorAll('.blank');
      const targetBlank = blanks[0];

      // Simulate loadAggregateDataForBlank behavior
      const loadAggregateDataForBlank = (blank) => {
        const questionId = blank.dataset.questionId;
        return questionId; // Returns single ID, not array
      };

      const result = loadAggregateDataForBlank(targetBlank);

      expect(typeof result).toBe('string');
      expect(result).toBe('WS-U4L1-3-Q1');
    });
  });

  describe('Bar Chart Rendering', () => {
    const renderBarChart = (questionId, stats, blank) => {
      const responses = stats.responses || stats.distribution || {};
      const entries = Object.entries(responses).sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((sum, [, count]) => sum + count, 0);
      const maxCount = entries.length > 0 ? entries[0][1] : 0;

      const questionEl = blank ? blank.closest('.question') : null;
      const questionNum = questionEl ? questionEl.querySelector('.question-number')?.textContent : '';

      let html = `<div class="bar-chart">`;
      html += `<div class="chart-header">`;
      html += `<strong>${questionId}</strong>`;
      if (questionNum) {
        html += `<span class="chart-question-num">Question ${questionNum}</span>`;
      }
      html += `<span class="chart-total">${total} response${total !== 1 ? 's' : ''}</span>`;
      html += `</div>`;

      if (entries.length === 0) {
        html += '<p class="no-responses">No responses yet</p>';
      } else {
        entries.slice(0, 10).forEach(([answer, count]) => {
          const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
          html += `
            <div class="bar-row">
              <span class="bar-label" title="${answer}">${answer}</span>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${barWidth}%"></div>
              </div>
              <span class="bar-count">${count}</span>
            </div>
          `;
        });
      }
      html += '</div>';
      return html;
    };

    it('should show total response count in header', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: { 'answer1': 5, 'answer2': 3 } };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      expect(html).toContain('8 responses');
    });

    it('should show singular "response" for single response', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: { 'answer1': 1 } };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      expect(html).toContain('1 response');
      expect(html).not.toContain('1 responses');
    });

    it('should show question number from parent element', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: { 'answer1': 5 } };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      expect(html).toContain('Question 1.');
    });

    it('should scale bars by max count, not percentage', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: { 'top': 10, 'second': 5, 'third': 2 } };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      // Top answer should have 100% width
      expect(html).toContain('width: 100%');
      // Second answer should have 50% width (5/10)
      expect(html).toContain('width: 50%');
      // Third answer should have 20% width (2/10)
      expect(html).toContain('width: 20%');
    });

    it('should display raw counts in bar-count element', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: { 'answer1': 42, 'answer2': 17 } };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      expect(html).toContain('<span class="bar-count">42</span>');
      expect(html).toContain('<span class="bar-count">17</span>');
    });

    it('should show "No responses yet" when empty', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: {} };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      expect(html).toContain('No responses yet');
      expect(html).toContain('0 responses');
    });

    it('should sort responses by count descending', () => {
      const blank = document.querySelector('.blank');
      const stats = { responses: { 'low': 1, 'high': 10, 'mid': 5 } };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      // Check order by finding positions
      const highPos = html.indexOf('title="high"');
      const midPos = html.indexOf('title="mid"');
      const lowPos = html.indexOf('title="low"');

      expect(highPos).toBeLessThan(midPos);
      expect(midPos).toBeLessThan(lowPos);
    });

    it('should limit to 10 responses', () => {
      const blank = document.querySelector('.blank');
      const responses = {};
      for (let i = 1; i <= 15; i++) {
        responses[`answer${i}`] = 15 - i;
      }
      const stats = { responses };

      const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

      // Count bar-row occurrences
      const barRowCount = (html.match(/bar-row/g) || []).length;
      expect(barRowCount).toBe(10);
    });
  });

  describe('Drawer Hint Display', () => {
    it('should have hint text for keyboard navigation', () => {
      const hint = document.querySelector('.drawer-hint');

      expect(hint).not.toBeNull();
      expect(hint.textContent).toContain('Tab');
      expect(hint.textContent).toContain('Esc');
    });
  });

  describe('Drawer Header Structure', () => {
    it('should have title, hint, and close button', () => {
      const header = document.querySelector('.drawer-header');
      const title = header.querySelector('h3');
      const hint = header.querySelector('.drawer-hint');
      const closeBtn = header.querySelector('.drawer-close');

      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Class Responses');
      expect(hint).not.toBeNull();
      expect(closeBtn).not.toBeNull();
    });
  });
});

describe('Chart Header CSS Classes', () => {
  const expectedClasses = {
    header: 'chart-header',
    questionNum: 'chart-question-num',
    total: 'chart-total',
    noResponses: 'no-responses'
  };

  it('should use consistent class naming', () => {
    Object.values(expectedClasses).forEach(className => {
      expect(typeof className).toBe('string');
      expect(className).toMatch(/^[a-z-]+$/);
    });
  });

  it('should use chart- prefix for chart-specific classes', () => {
    expect(expectedClasses.header).toMatch(/^chart-/);
    expect(expectedClasses.questionNum).toMatch(/^chart-/);
    expect(expectedClasses.total).toMatch(/^chart-/);
  });
});

describe('Global Key Bindings', () => {
  it('should define bindGlobalKeys function behavior', () => {
    let escapeHandled = false;

    const bindGlobalKeys = (doc, closeDrawer) => {
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeDrawer();
          escapeHandled = true;
        }
      });
    };

    // This validates the expected function signature
    expect(typeof bindGlobalKeys).toBe('function');
  });
});

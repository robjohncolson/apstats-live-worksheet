/**
 * Unit tests for ai-grading-prompts-u4.js
 * Tests rubric configuration, prompt building, and lesson context for Unit 4
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Import the module (need to handle browser globals)
let REFLECTION_RUBRICS_U4, LESSON_CONTEXT_U4, buildReflectionPromptU4, getRubricU4, getReflectionQuestionIdsU4;

beforeAll(async () => {
  // Set up window object for browser-targeted code
  global.window = global.window || {};

  // Import the module
  const module = await import('../ai-grading-prompts-u4.js');
  REFLECTION_RUBRICS_U4 = module.REFLECTION_RUBRICS_U4;
  LESSON_CONTEXT_U4 = module.LESSON_CONTEXT_U4;
  buildReflectionPromptU4 = module.buildReflectionPromptU4;
  getRubricU4 = module.getRubricU4;
  getReflectionQuestionIdsU4 = module.getReflectionQuestionIdsU4;
});

describe('LESSON_CONTEXT_U4', () => {
  it('should have correct unit and lesson info', () => {
    expect(LESSON_CONTEXT_U4.unit).toBe(4);
    expect(LESSON_CONTEXT_U4.lessons).toBe('1-2');
  });

  it('should have topics array', () => {
    expect(LESSON_CONTEXT_U4.topics).toBeInstanceOf(Array);
    expect(LESSON_CONTEXT_U4.topics.length).toBeGreaterThan(0);
    expect(LESSON_CONTEXT_U4.topics).toContain('Random and Non-Random Patterns');
    expect(LESSON_CONTEXT_U4.topics).toContain('Estimating Probabilities Using Simulation');
  });

  it('should have learning objectives', () => {
    expect(LESSON_CONTEXT_U4.learningObjectives).toBeInstanceOf(Array);
    expect(LESSON_CONTEXT_U4.learningObjectives.length).toBe(2);
    expect(LESSON_CONTEXT_U4.learningObjectives[0]).toContain('VAR-1.F');
    expect(LESSON_CONTEXT_U4.learningObjectives[1]).toContain('UNC-2.A');
  });

  it('should have key vocabulary with definitions', () => {
    expect(LESSON_CONTEXT_U4.keyVocabulary).toBeDefined();

    const requiredTerms = [
      'random process',
      'outcome',
      'event',
      'simulation',
      'empirical probability',
      'law of large numbers'
    ];

    requiredTerms.forEach(term => {
      expect(LESSON_CONTEXT_U4.keyVocabulary[term]).toBeDefined();
      expect(typeof LESSON_CONTEXT_U4.keyVocabulary[term]).toBe('string');
      expect(LESSON_CONTEXT_U4.keyVocabulary[term].length).toBeGreaterThan(10);
    });
  });

  it('should have key principles array', () => {
    expect(LESSON_CONTEXT_U4.keyPrinciples).toBeInstanceOf(Array);
    expect(LESSON_CONTEXT_U4.keyPrinciples.length).toBeGreaterThan(0);
  });
});

describe('REFLECTION_RUBRICS_U4', () => {
  const expectedQuestionIds = [
    'reflect1',
    'reflect2',
    'exitTicket'
  ];

  it('should have all 3 reflection questions', () => {
    expect(Object.keys(REFLECTION_RUBRICS_U4)).toHaveLength(3);
    expectedQuestionIds.forEach(id => {
      expect(REFLECTION_RUBRICS_U4[id]).toBeDefined();
    });
  });

  describe.each(expectedQuestionIds)('rubric for %s', (questionId) => {
    it('should have questionText', () => {
      expect(REFLECTION_RUBRICS_U4[questionId].questionText).toBeDefined();
      expect(typeof REFLECTION_RUBRICS_U4[questionId].questionText).toBe('string');
      expect(REFLECTION_RUBRICS_U4[questionId].questionText.length).toBeGreaterThan(10);
    });

    it('should have expectedElements array', () => {
      const elements = REFLECTION_RUBRICS_U4[questionId].expectedElements;
      expect(elements).toBeInstanceOf(Array);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should have expectedElements with id, description, and required fields', () => {
      const elements = REFLECTION_RUBRICS_U4[questionId].expectedElements;
      elements.forEach(element => {
        expect(element.id).toBeDefined();
        expect(element.description).toBeDefined();
        expect(typeof element.required).toBe('boolean');
      });
    });

    it('should have at least one required element', () => {
      const elements = REFLECTION_RUBRICS_U4[questionId].expectedElements;
      const requiredElements = elements.filter(e => e.required);
      expect(requiredElements.length).toBeGreaterThan(0);
    });

    it('should have scoringGuide with E, P, I descriptions', () => {
      const guide = REFLECTION_RUBRICS_U4[questionId].scoringGuide;
      expect(guide).toBeDefined();
      expect(guide.E).toBeDefined();
      expect(guide.P).toBeDefined();
      expect(guide.I).toBeDefined();
    });

    it('should have commonMistakes array', () => {
      const mistakes = REFLECTION_RUBRICS_U4[questionId].commonMistakes;
      expect(mistakes).toBeInstanceOf(Array);
      expect(mistakes.length).toBeGreaterThan(0);
    });

    it('should have contextFromVideo', () => {
      const context = REFLECTION_RUBRICS_U4[questionId].contextFromVideo;
      expect(context).toBeDefined();
      expect(typeof context).toBe('string');
      expect(context.length).toBeGreaterThan(50);
    });
  });
});

describe('getReflectionQuestionIdsU4()', () => {
  it('should return array of 3 question IDs', () => {
    const ids = getReflectionQuestionIdsU4();
    expect(ids).toBeInstanceOf(Array);
    expect(ids).toHaveLength(3);
  });

  it('should return correct question IDs', () => {
    const ids = getReflectionQuestionIdsU4();
    expect(ids).toContain('reflect1');
    expect(ids).toContain('reflect2');
    expect(ids).toContain('exitTicket');
  });
});

describe('getRubricU4()', () => {
  it('should return rubric for valid question ID', () => {
    const rubric = getRubricU4('reflect1');
    expect(rubric).toBeDefined();
    expect(rubric.questionText).toBeDefined();
  });

  it('should return null for invalid question ID', () => {
    const rubric = getRubricU4('nonexistent');
    expect(rubric).toBeNull();
  });

  it('should return null for undefined', () => {
    const rubric = getRubricU4(undefined);
    expect(rubric).toBeNull();
  });
});

describe('buildReflectionPromptU4()', () => {
  it('should build prompt for valid question ID', () => {
    const prompt = buildReflectionPromptU4('reflect1', 'Humans avoid long streaks when creating fake random sequences.');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should include question text in prompt', () => {
    const prompt = buildReflectionPromptU4('reflect1', 'Test answer');
    expect(prompt).toContain('fake');
    expect(prompt).toContain('random');
  });

  it('should include student answer in prompt', () => {
    const testAnswer = 'This is my unique test answer about streaks and randomness';
    const prompt = buildReflectionPromptU4('reflect1', testAnswer);
    expect(prompt).toContain(testAnswer);
  });

  it('should include expected elements', () => {
    const prompt = buildReflectionPromptU4('reflect1', 'Test answer');
    expect(prompt).toContain('REQUIRED');
    expect(prompt).toContain('Expected Elements');
  });

  it('should include scoring guide', () => {
    const prompt = buildReflectionPromptU4('reflect1', 'Test answer');
    expect(prompt).toContain('Essentially Correct');
    expect(prompt).toContain('Partially Correct');
    expect(prompt).toContain('Incorrect');
  });

  it('should include video context', () => {
    const prompt = buildReflectionPromptU4('reflect1', 'Test answer');
    expect(prompt).toContain('Lesson Context from Video');
  });

  it('should include JSON response format instruction', () => {
    const prompt = buildReflectionPromptU4('reflect1', 'Test answer');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('score');
    expect(prompt).toContain('feedback');
  });

  it('should throw error for unknown question ID', () => {
    expect(() => buildReflectionPromptU4('invalidId', 'Test')).toThrow('Unknown question ID');
  });
});

describe('Rubric Content Quality - Unit 4', () => {
  describe('reflect1 - Fake vs Real Random Sequences', () => {
    it('should address streaks and human behavior', () => {
      const rubric = REFLECTION_RUBRICS_U4.reflect1;
      const elements = rubric.expectedElements.map(e => e.description.toLowerCase());

      expect(elements.some(e => e.includes('streak') || e.includes('run'))).toBe(true);
      expect(elements.some(e => e.includes('human'))).toBe(true);
    });
  });

  describe('reflect2 - Gambler\'s Fallacy', () => {
    it('should require independence and Law of Large Numbers concepts', () => {
      const rubric = REFLECTION_RUBRICS_U4.reflect2;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions.includes('independent') || descriptions.includes('independence')).toBe(true);
      expect(descriptions.includes('due') || descriptions.includes('50%')).toBe(true);
      expect(descriptions.includes('long run') || descriptions.includes('law of large numbers')).toBe(true);
    });
  });

  describe('exitTicket - Simulation Design', () => {
    it('should require simulation design elements', () => {
      const rubric = REFLECTION_RUBRICS_U4.exitTicket;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions.includes('digit') || descriptions.includes('assign')).toBe(true);
      expect(descriptions.includes('trial')).toBe(true);
      expect(descriptions.includes('count') || descriptions.includes('record')).toBe(true);
    });

    it('should mention the success criterion (at least 3 correct)', () => {
      const rubric = REFLECTION_RUBRICS_U4.exitTicket;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions.includes('3') || descriptions.includes('three')).toBe(true);
    });
  });
});

describe('Unit 4 specific content validation', () => {
  it('should reference coin flip examples in context', () => {
    const reflect1 = REFLECTION_RUBRICS_U4.reflect1;
    expect(reflect1.contextFromVideo.toLowerCase()).toContain('streak');
  });

  it('should reference the Sharpshooter or probability examples', () => {
    const exitTicket = REFLECTION_RUBRICS_U4.exitTicket;
    expect(
      exitTicket.contextFromVideo.toLowerCase().includes('82') ||
      exitTicket.contextFromVideo.toLowerCase().includes('digit') ||
      exitTicket.contextFromVideo.toLowerCase().includes('simulation')
    ).toBe(true);
  });

  it('should have vocabulary terms matching Unit 4 content', () => {
    const vocab = LESSON_CONTEXT_U4.keyVocabulary;

    // Check that definitions are substantive
    expect(vocab['random process'].length).toBeGreaterThan(20);
    expect(vocab['simulation'].length).toBeGreaterThan(20);
    expect(vocab['law of large numbers'].length).toBeGreaterThan(20);
  });
});

/**
 * Unit tests for ai-grading-prompts.js
 * Tests rubric configuration, prompt building, and lesson context
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Import the module (need to handle browser globals)
let REFLECTION_RUBRICS, LESSON_CONTEXT, buildReflectionPrompt, getRubric, getReflectionQuestionIds;

beforeAll(async () => {
  // Set up window object for browser-targeted code
  global.window = global.window || {};

  // Import the module
  const module = await import('../ai-grading-prompts.js');
  REFLECTION_RUBRICS = module.REFLECTION_RUBRICS;
  LESSON_CONTEXT = module.LESSON_CONTEXT;
  buildReflectionPrompt = module.buildReflectionPrompt;
  getRubric = module.getRubric;
  getReflectionQuestionIds = module.getReflectionQuestionIds;
});

describe('LESSON_CONTEXT', () => {
  it('should have correct unit and lesson info', () => {
    expect(LESSON_CONTEXT.unit).toBe(3);
    expect(LESSON_CONTEXT.lessons).toBe('6-7');
  });

  it('should have topics array', () => {
    expect(LESSON_CONTEXT.topics).toBeInstanceOf(Array);
    expect(LESSON_CONTEXT.topics.length).toBeGreaterThan(0);
    expect(LESSON_CONTEXT.topics).toContain('Selecting an Experimental Design');
    expect(LESSON_CONTEXT.topics).toContain('Inference and Experiments');
  });

  it('should have learning objectives', () => {
    expect(LESSON_CONTEXT.learningObjectives).toBeInstanceOf(Array);
    expect(LESSON_CONTEXT.learningObjectives.length).toBe(2);
    expect(LESSON_CONTEXT.learningObjectives[0]).toContain('VAR-3.D');
    expect(LESSON_CONTEXT.learningObjectives[1]).toContain('VAR-3.E');
  });

  it('should have key vocabulary with definitions', () => {
    expect(LESSON_CONTEXT.keyVocabulary).toBeDefined();

    const requiredTerms = [
      'random assignment',
      'random selection',
      'blocking',
      'confounding variable',
      'statistical significance',
      'causation',
      'generalization'
    ];

    requiredTerms.forEach(term => {
      expect(LESSON_CONTEXT.keyVocabulary[term]).toBeDefined();
      expect(typeof LESSON_CONTEXT.keyVocabulary[term]).toBe('string');
      expect(LESSON_CONTEXT.keyVocabulary[term].length).toBeGreaterThan(10);
    });
  });

  it('should have key principles array', () => {
    expect(LESSON_CONTEXT.keyPrinciples).toBeInstanceOf(Array);
    expect(LESSON_CONTEXT.keyPrinciples.length).toBeGreaterThan(0);
  });
});

describe('REFLECTION_RUBRICS', () => {
  const expectedQuestionIds = [
    'reflect53',
    'reflect54a',
    'reflect54b',
    'reflect55',
    'reflect56',
    'exitTicket'
  ];

  it('should have all 6 reflection questions', () => {
    expect(Object.keys(REFLECTION_RUBRICS)).toHaveLength(6);
    expectedQuestionIds.forEach(id => {
      expect(REFLECTION_RUBRICS[id]).toBeDefined();
    });
  });

  describe.each(expectedQuestionIds)('rubric for %s', (questionId) => {
    it('should have questionText', () => {
      expect(REFLECTION_RUBRICS[questionId].questionText).toBeDefined();
      expect(typeof REFLECTION_RUBRICS[questionId].questionText).toBe('string');
      expect(REFLECTION_RUBRICS[questionId].questionText.length).toBeGreaterThan(10);
    });

    it('should have expectedElements array', () => {
      const elements = REFLECTION_RUBRICS[questionId].expectedElements;
      expect(elements).toBeInstanceOf(Array);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should have expectedElements with id, description, and required fields', () => {
      const elements = REFLECTION_RUBRICS[questionId].expectedElements;
      elements.forEach(element => {
        expect(element.id).toBeDefined();
        expect(element.description).toBeDefined();
        expect(typeof element.required).toBe('boolean');
      });
    });

    it('should have at least one required element', () => {
      const elements = REFLECTION_RUBRICS[questionId].expectedElements;
      const requiredElements = elements.filter(e => e.required);
      expect(requiredElements.length).toBeGreaterThan(0);
    });

    it('should have scoringGuide with E, P, I descriptions', () => {
      const guide = REFLECTION_RUBRICS[questionId].scoringGuide;
      expect(guide).toBeDefined();
      expect(guide.E).toBeDefined();
      expect(guide.P).toBeDefined();
      expect(guide.I).toBeDefined();
    });

    it('should have commonMistakes array', () => {
      const mistakes = REFLECTION_RUBRICS[questionId].commonMistakes;
      expect(mistakes).toBeInstanceOf(Array);
      expect(mistakes.length).toBeGreaterThan(0);
    });

    it('should have contextFromVideo', () => {
      const context = REFLECTION_RUBRICS[questionId].contextFromVideo;
      expect(context).toBeDefined();
      expect(typeof context).toBe('string');
      expect(context.length).toBeGreaterThan(50);
    });
  });
});

describe('getReflectionQuestionIds()', () => {
  it('should return array of 6 question IDs', () => {
    const ids = getReflectionQuestionIds();
    expect(ids).toBeInstanceOf(Array);
    expect(ids).toHaveLength(6);
  });

  it('should return correct question IDs', () => {
    const ids = getReflectionQuestionIds();
    expect(ids).toContain('reflect53');
    expect(ids).toContain('reflect54a');
    expect(ids).toContain('reflect54b');
    expect(ids).toContain('reflect55');
    expect(ids).toContain('reflect56');
    expect(ids).toContain('exitTicket');
  });
});

describe('getRubric()', () => {
  it('should return rubric for valid question ID', () => {
    const rubric = getRubric('reflect53');
    expect(rubric).toBeDefined();
    expect(rubric.questionText).toBeDefined();
  });

  it('should return null for invalid question ID', () => {
    const rubric = getRubric('nonexistent');
    expect(rubric).toBeNull();
  });

  it('should return null for undefined', () => {
    const rubric = getRubric(undefined);
    expect(rubric).toBeNull();
  });
});

describe('buildReflectionPrompt()', () => {
  it('should build prompt for valid question ID', () => {
    const prompt = buildReflectionPrompt('reflect53', 'Random selection chooses from population, random assignment assigns treatments.');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should include question text in prompt', () => {
    const prompt = buildReflectionPrompt('reflect53', 'Test answer');
    expect(prompt).toContain('random selection');
    expect(prompt).toContain('random assignment');
  });

  it('should include student answer in prompt', () => {
    const testAnswer = 'This is my unique test answer about statistics';
    const prompt = buildReflectionPrompt('reflect53', testAnswer);
    expect(prompt).toContain(testAnswer);
  });

  it('should include expected elements', () => {
    const prompt = buildReflectionPrompt('reflect53', 'Test answer');
    expect(prompt).toContain('REQUIRED');
    expect(prompt).toContain('Expected Elements');
  });

  it('should include scoring guide', () => {
    const prompt = buildReflectionPrompt('reflect53', 'Test answer');
    expect(prompt).toContain('Essentially Correct');
    expect(prompt).toContain('Partially Correct');
    expect(prompt).toContain('Incorrect');
  });

  it('should include video context', () => {
    const prompt = buildReflectionPrompt('reflect53', 'Test answer');
    expect(prompt).toContain('Lesson Context from Video');
  });

  it('should include JSON response format instruction', () => {
    const prompt = buildReflectionPrompt('reflect53', 'Test answer');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('score');
    expect(prompt).toContain('feedback');
  });

  it('should throw error for unknown question ID', () => {
    expect(() => buildReflectionPrompt('invalidId', 'Test')).toThrow('Unknown question ID');
  });
});

describe('Rubric Content Quality', () => {
  describe('reflect53 - Random Selection vs Assignment', () => {
    it('should distinguish between selection and assignment', () => {
      const rubric = REFLECTION_RUBRICS.reflect53;
      const elements = rubric.expectedElements.map(e => e.description.toLowerCase());

      expect(elements.some(e => e.includes('selection'))).toBe(true);
      expect(elements.some(e => e.includes('assignment'))).toBe(true);
    });
  });

  describe('reflect54a - Confounding Variable', () => {
    it('should require identifying and explaining confounding', () => {
      const rubric = REFLECTION_RUBRICS.reflect54a;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions).toContain('confound');
    });
  });

  describe('reflect54b - Blocking Design', () => {
    it('should require blocking and randomization within blocks', () => {
      const rubric = REFLECTION_RUBRICS.reflect54b;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions).toContain('block');
      expect(descriptions).toContain('random');
    });
  });

  describe('reflect55 - Statistical Significance', () => {
    it('should address p-value interpretation and causation', () => {
      const rubric = REFLECTION_RUBRICS.reflect55;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions).toContain('chance');
      expect(descriptions).toContain('causation') || expect(descriptions).toContain('causal');
    });
  });

  describe('reflect56 - Generalization', () => {
    it('should require random selection or representative sample', () => {
      const rubric = REFLECTION_RUBRICS.reflect56;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions).toContain('random selection') || expect(descriptions).toContain('representative');
    });
  });

  describe('exitTicket - Three Concepts', () => {
    it('should require all three concepts: assignment, significance, causation', () => {
      const rubric = REFLECTION_RUBRICS.exitTicket;
      const descriptions = rubric.expectedElements.map(e => e.description.toLowerCase()).join(' ');

      expect(descriptions.includes('assignment') || descriptions.includes('random')).toBe(true);
      expect(descriptions.includes('significance') || descriptions.includes('significant')).toBe(true);
      expect(descriptions.includes('causation') || descriptions.includes('causal')).toBe(true);
    });
  });
});

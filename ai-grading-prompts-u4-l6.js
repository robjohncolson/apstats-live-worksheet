/**
 * AI Grading Prompts for Unit 4 Lesson 6: Independent Events and Unions of Events
 *
 * Based on AP Statistics Course Framework (VAR-4.E) and
 * Daily Videos from College Board.
 *
 * Topics covered:
 * - Determining if events are independent
 * - Multiplication rule for independent events
 * - Union of events (Addition Rule)
 * - Applying probability rules to FRQ problems
 */

const LESSON_CONTEXT_U4L6 = {
  unit: 4,
  lesson: 6,
  topic: "Independent Events and Unions of Events",
  learningObjective: "VAR-4.E: Calculate probabilities for independent events and for the union of two events.",
  keyVocabulary: {
    "independent events": "Events where knowing one occurred does not change the probability of the other: P(A|B) = P(A)",
    "multiplication rule (independent)": "P(A and B) = P(A) · P(B) — only valid for independent events",
    "union of events": "P(A or B) — the probability that A or B (or both) occurs",
    "addition rule": "P(A or B) = P(A) + P(B) - P(A and B)",
    "mutually exclusive": "Events that cannot occur together; P(A and B) = 0"
  },
  keyPrinciples: [
    "Two ways to check independence: (1) P(A|B) = P(A), or (2) P(A and B) = P(A)·P(B)",
    "The simplified multiplication rule P(A)·P(B) ONLY works for independent events",
    "We subtract P(A and B) in the addition rule to avoid double-counting the intersection",
    "If events are mutually exclusive, P(A or B) = P(A) + P(B) since intersection is 0",
    "Independent ≠ mutually exclusive: independent events CAN occur together",
    "For conditional probability from tables: restrict to the given condition's row/column"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4L6 = {

  // R1: Independent vs. mutually exclusive
  "reflect1": {
    questionText: "Explain the difference between independent events and mutually exclusive events. Can two events be both independent and mutually exclusive? Why or why not?",
    expectedElements: [
      { id: "independent-def", description: "Independent: knowing one occurred doesn't change probability of other (P(A|B) = P(A))", required: true },
      { id: "mutually-exclusive-def", description: "Mutually exclusive: events cannot occur together (P(A and B) = 0)", required: true },
      { id: "cannot-be-both", description: "Events with non-zero probabilities cannot be both independent AND mutually exclusive", required: true },
      { id: "reasoning", description: "Explains why: if mutually exclusive with P(A),P(B)>0, then P(A and B)=0, but independence requires P(A and B)=P(A)·P(B)>0", required: false }
    ],
    scoringGuide: {
      E: "Correctly defines both concepts AND explains that events (with P>0) cannot be both, with valid reasoning",
      P: "Defines both concepts but reasoning about whether they can be both is incomplete or missing",
      I: "Confuses the two concepts OR incorrectly claims events can be both independent and mutually exclusive"
    },
    commonMistakes: [
      "Confusing independent with mutually exclusive",
      "Thinking independent means the events don't affect each other so they can't happen together",
      "Not recognizing that P(A and B) = 0 for mutually exclusive but P(A)·P(B) > 0 creates a contradiction"
    ],
    contextFromVideo: `From Video 1: "Events A and B are independent if, and only if, knowing whether event A has occurred does not change the probability that event B will occur." From Video 2: "Two events are mutually exclusive or disjoint if they cannot occur at the same time. So P(A ∩ B) = 0." For independent events with non-zero probabilities, P(A and B) = P(A)·P(B) > 0, which contradicts mutual exclusivity.`
  },

  // R2: Checking independence
  "reflect2": {
    questionText: "A student says: 'I checked that P(A|B) = P(A), so I know the events are independent.' Is checking just one conditional probability enough? Explain what else you might verify.",
    expectedElements: [
      { id: "one-check-sufficient", description: "Yes, checking P(A|B) = P(A) IS sufficient to establish independence", required: true },
      { id: "equivalent-checks", description: "Could also check P(B|A) = P(B) or P(A and B) = P(A)·P(B) — all are equivalent", required: true },
      { id: "any-one-works", description: "If one condition holds, all others automatically hold for independence", required: false },
      { id: "calculation-accuracy", description: "Main concern is ensuring the calculation is done correctly", required: false }
    ],
    scoringGuide: {
      E: "Correctly states that one check IS sufficient, and mentions the equivalent alternative methods",
      P: "Mentions alternative checks but is unclear about whether one check is sufficient",
      I: "Incorrectly claims you must check multiple conditions OR doesn't understand the equivalent forms"
    },
    commonMistakes: [
      "Thinking you must check ALL conditions (P(A|B)=P(A) AND P(B|A)=P(B) AND product rule)",
      "Not recognizing that the three conditions are mathematically equivalent",
      "Confusing what needs to be checked vs. what could be checked"
    ],
    contextFromVideo: `From Video 1: "Two events A and B are independent if, and only if, the conditional probability is equal to the unconditional probability... Two events are independent if, and only if, the joint probability is equal to the product of the individual probabilities." From Video 3: The video demonstrates both methods on the same problem, showing they give the same conclusion.`
  },

  // Exit Ticket: Independence check and union calculation
  "exitTicket": {
    questionText: "Given P(A) = 0.3, P(B) = 0.5, P(A and B) = 0.15. Determine: (1) Are A and B independent? Show your work. (2) Find P(A or B).",
    expectedElements: [
      { id: "independence-check", description: "Checks if P(A)·P(B) = P(A and B): 0.3 × 0.5 = 0.15", required: true },
      { id: "independence-conclusion", description: "Concludes events ARE independent since 0.15 = 0.15", required: true },
      { id: "addition-rule", description: "Uses addition rule: P(A or B) = P(A) + P(B) - P(A and B)", required: true },
      { id: "correct-calculation", description: "Calculates P(A or B) = 0.3 + 0.5 - 0.15 = 0.65", required: true },
      { id: "shows-work", description: "Shows the arithmetic steps clearly", required: false }
    ],
    scoringGuide: {
      E: "Correctly determines independence (yes, with work shown) AND correctly calculates P(A or B) = 0.65",
      P: "Gets one part correct but makes an error on the other, OR correct answers without sufficient work",
      I: "Both parts incorrect OR fundamental misunderstanding of the formulas"
    },
    commonMistakes: [
      "Forgetting to subtract the intersection in the addition rule",
      "Using the simplified P(A) + P(B) without checking if events are mutually exclusive",
      "Calculating P(A)·P(B) but not comparing it to the given P(A and B)",
      "Not showing work/formula before plugging in numbers"
    ],
    contextFromVideo: `From Video 1: "One way that we can determine whether or not events are independent is by checking to see if the joint probability is equal to the product of the probability of A and probability of B." From Video 2: "The addition rule states that the probability that event A or event B or both will occur is equal to the probability that event A will occur, plus the probability that event B will occur, and then we subtract the probability that both events will occur."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4L6(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4L6[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about probability.

## Topic Context
Unit 4, Lesson 6: Independent Events and Unions of Events
Learning Objective: ${LESSON_CONTEXT_U4L6.learningObjective}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4L6.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

## Question
${rubric.questionText}

## Expected Elements (Rubric)
${expectedList}

## Scoring Guide
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

## Common Mistakes to Watch For
${mistakesList}

## Lesson Context from Video
${rubric.contextFromVideo}

## Student's Response
"${studentAnswer}"

## Instructions
Grade this response using the E/P/I scoring system. Be generous but accurate.
- Award credit for correct concepts even if phrasing is imperfect
- Look for understanding of key relationships, not just keywords
- Students may use synonyms or informal language
- For calculation problems, check both the process and the answer

Respond in JSON format:
{
  "score": "E" or "P" or "I",
  "feedback": "1-2 sentence explanation of the grade",
  "matched": ["list of rubric elements the student addressed"],
  "missing": ["list of required rubric elements the student missed"],
  "suggestion": "One specific thing the student could add to improve (optional for E scores)"
}`;
}

/**
 * Get the rubric configuration for a question
 * @param {string} questionId
 * @returns {object} The rubric object
 */
function getRubricU4L6(questionId) {
  return REFLECTION_RUBRICS_U4L6[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4L6() {
  return Object.keys(REFLECTION_RUBRICS_U4L6);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4L6 = REFLECTION_RUBRICS_U4L6;
  window.LESSON_CONTEXT_U4L6 = LESSON_CONTEXT_U4L6;
  window.buildReflectionPromptU4L6 = buildReflectionPromptU4L6;
  window.getRubricU4L6 = getRubricU4L6;
  window.getReflectionQuestionIdsU4L6 = getReflectionQuestionIdsU4L6;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4L6,
    LESSON_CONTEXT_U4L6,
    buildReflectionPromptU4L6,
    getRubricU4L6,
    getReflectionQuestionIdsU4L6
  };
}

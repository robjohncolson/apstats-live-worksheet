/**
 * AI Grading Prompts for Unit 4 Lessons 7-8: Random Variables & Probability Distributions
 *
 * Based on AP Statistics Course Framework (VAR-5.A through VAR-5.D) and
 * Daily Video transcripts from Penny Smeltzer.
 *
 * Topics covered:
 * - Random variables (discrete vs continuous)
 * - Probability distributions (representation and interpretation)
 * - Mean (expected value) of a random variable
 * - Standard deviation and variance of a random variable
 * - Interpreting parameters in context
 */

const LESSON_CONTEXT_U4L78 = {
  unit: 4,
  lessons: "7-8",
  topics: [
    "Introduction to Random Variables and Probability Distributions",
    "Mean and Standard Deviation of Random Variables"
  ],
  learningObjectives: [
    "VAR-5.A: Represent the probability distribution for a discrete random variable",
    "VAR-5.B: Interpret a probability distribution",
    "VAR-5.C: Calculate parameters for a discrete random variable",
    "VAR-5.D: Interpret parameters for a discrete random variable"
  ],
  keyVocabulary: {
    "random variable": "A numerical outcome of random behavior, labeled with capital letters (X, Y, etc.)",
    "discrete random variable": "Can only take a countable number of values (with space between values on number line)",
    "continuous random variable": "Can take an infinite number of values in an interval (no space between values)",
    "probability distribution": "A table, graph, or function showing all possible values and their probabilities",
    "expected value (mean)": "The long-run average: μₓ = Σxᵢ·P(xᵢ)",
    "standard deviation": "Typical deviation from the mean: σₓ = √[Σ(xᵢ - μₓ)²·P(xᵢ)]",
    "variance": "The square of the standard deviation: σₓ² = Σ(xᵢ - μₓ)²·P(xᵢ)",
    "parameter": "A numerical value measuring a characteristic of a population or distribution"
  },
  keyPrinciples: [
    "Random variables must be defined in context with appropriate units",
    "Discrete variables have countable values with gaps; continuous variables fill intervals",
    "All probabilities in a distribution must be between 0 and 1, and sum to 1",
    "Describe distributions using shape, center, and spread",
    "Expected value is a weighted average using probabilities as weights",
    "Interpret mean as 'long-run average' from many repetitions",
    "Interpret standard deviation as 'typical deviation from the mean'",
    "Parameters should be interpreted with units and context"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4L78 = {

  // R1: Discrete vs continuous random variables
  "reflect1": {
    questionText: "Explain the difference between a discrete and continuous random variable. Give one original example of each (not from the video) and explain why it fits that category.",
    expectedElements: [
      { id: "discrete-definition", description: "Discrete = countable values with gaps/spaces between them", required: true },
      { id: "continuous-definition", description: "Continuous = infinite values in an interval (no gaps)", required: true },
      { id: "discrete-example", description: "Provides a valid original example of a discrete random variable", required: true },
      { id: "continuous-example", description: "Provides a valid original example of a continuous random variable", required: true },
      { id: "example-justification", description: "Explains WHY each example fits its category", required: false }
    ],
    scoringGuide: {
      E: "Correctly defines both types AND gives valid original examples with reasonable justification",
      P: "Defines both types OR gives correct examples, but missing one component or explanation is weak",
      I: "Confuses discrete and continuous OR gives invalid/copied examples OR missing definitions"
    },
    commonMistakes: [
      "Using examples from the video instead of original ones",
      "Confusing 'countable' with 'finite' (discrete can be infinite but countable)",
      "Saying continuous means 'any number' without mentioning 'in an interval'",
      "Giving examples without explaining why they fit the category"
    ],
    contextFromVideo: `From Topic 4.7v1: "A discrete random variable can only take a countable number of values... there is space between the values. There's not never going to be a 1.5." "A continuous random variable can take on an infinite number of values in an interval on a number line... Between four and five minutes, there's an infinite number of values."`
  },

  // R2: Expected value calculation and decision-making
  "reflect2": {
    questionText: "A game show offers a contestant three doors. Behind one door is $10,000, behind another is $1,000, and behind the third is $0. The contestant picks randomly. Calculate the expected winnings and explain what this value means. Would you recommend playing if there's a $3,000 entry fee?",
    expectedElements: [
      { id: "probability-distribution", description: "Sets up correct probabilities (1/3 for each outcome)", required: true },
      { id: "expected-value-calculation", description: "Correctly calculates E(X) = (1/3)(10000) + (1/3)(1000) + (1/3)(0) = $3,666.67", required: true },
      { id: "mean-interpretation", description: "Interprets expected value as long-run average over many games", required: true },
      { id: "decision-with-reasoning", description: "Makes recommendation based on comparing expected value ($3,666.67) to cost ($3,000)", required: true },
      { id: "expected-profit", description: "Correctly identifies expected profit is $666.67 (winnings minus fee)", required: false }
    ],
    scoringGuide: {
      E: "Correct calculation ($3,666.67), interprets as long-run average, makes logical recommendation with reasoning",
      P: "Calculation correct but interpretation weak OR good interpretation but calculation error OR recommendation without clear reasoning",
      I: "Major calculation error OR misunderstands what expected value represents OR no logical decision-making"
    },
    commonMistakes: [
      "Using wrong probabilities (not recognizing equal 1/3 chance for each)",
      "Forgetting to interpret what the expected value means",
      "Saying 'yes' or 'no' without comparing to the $3,000 fee",
      "Confusing expected value with guaranteed outcome"
    ],
    contextFromVideo: `From Topic 4.8: "The mean, or expected value, for a discrete random variable X is μₓ = Σxᵢ·P(xᵢ)... In the long run, if many prairie dog litters are randomly selected, the average number of pups per litter will be about 2.66 pups." Insurance example: "The insurance company can expect to make, on average, about $113.40 per renter's policy from a large number of randomly selected policies."`
  },

  // Exit Ticket: Carnival game analysis
  "exitTicket": {
    questionText: "A carnival game costs $2 to play. Roll a die: roll 6 wins $10, roll 1 wins $3, otherwise win nothing. Define X as net profit, create a probability distribution, calculate expected value, and determine if it's a 'fair' game.",
    expectedElements: [
      { id: "net-profit-values", description: "Correctly identifies net profits: roll 6 → $8 net, roll 1 → $1 net, other → -$2 net", required: true },
      { id: "probabilities", description: "Correct probabilities: P(6)=1/6, P(1)=1/6, P(other)=4/6", required: true },
      { id: "distribution-format", description: "Creates clear probability distribution table or list", required: true },
      { id: "expected-value", description: "Calculates E(X) = (1/6)(8) + (1/6)(1) + (4/6)(-2) = $0.17 (approximately)", required: true },
      { id: "fair-game-interpretation", description: "Interprets: positive expected value means game favors player; not 'fair' from carnival's perspective", required: true },
      { id: "long-run-context", description: "Explains expected value in terms of long-run average", required: false }
    ],
    scoringGuide: {
      E: "Correct net profits, correct probabilities, accurate expected value (~$0.17), and correct interpretation of fairness",
      P: "Minor calculation error OR correct math but weak interpretation OR missing one component (distribution vs. interpretation)",
      I: "Fundamental error in net profit calculation OR major probability error OR misunderstands 'fair game' concept"
    },
    commonMistakes: [
      "Using gross winnings ($10, $3, $0) instead of net profit ($8, $1, -$2)",
      "Forgetting that 'other' outcomes (2,3,4,5) have probability 4/6, not 1/6",
      "Saying expected value of $0.17 means you'll win 17 cents every game",
      "Confusing 'fair to the player' with 'fair to the carnival'"
    ],
    contextFromVideo: `From Topic 4.8: "The formula takes into account the different weights of each X value... when we calculate the mean, the weight of each value is important." Insurance example showed how to set up profit from company's perspective: "$150 (no claim), -$2,850 (theft), -$24,850 (fire)... On an individual policy, they will either lose money or make $150. But in the long run, with lots of policies, they will average $113.40 per policy."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4L78(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4L78[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about random variables and probability distributions.

## Topic Context
Unit 4, Lessons 7-8: Random Variables & Probability Distributions
Learning Objectives: ${LESSON_CONTEXT_U4L78.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4L78.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- Students may use equivalent forms (e.g., "1/3" = "0.333" = "33.3%")
- For calculations, accept reasonable rounding (e.g., $3666.67 or $3667 or approximately $3700)

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
function getRubricU4L78(questionId) {
  return REFLECTION_RUBRICS_U4L78[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4L78() {
  return Object.keys(REFLECTION_RUBRICS_U4L78);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4L78 = REFLECTION_RUBRICS_U4L78;
  window.LESSON_CONTEXT_U4L78 = LESSON_CONTEXT_U4L78;
  window.buildReflectionPromptU4L78 = buildReflectionPromptU4L78;
  window.getRubricU4L78 = getRubricU4L78;
  window.getReflectionQuestionIdsU4L78 = getReflectionQuestionIdsU4L78;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4L78,
    LESSON_CONTEXT_U4L78,
    buildReflectionPromptU4L78,
    getRubricU4L78,
    getReflectionQuestionIdsU4L78
  };
}

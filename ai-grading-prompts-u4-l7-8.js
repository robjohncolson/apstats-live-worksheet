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
      { id: "discrete-example", description: "Provides a valid original example of a discrete random variable", required: false },
      { id: "continuous-example", description: "Provides a valid original example of a continuous random variable", required: false },
      { id: "example-justification", description: "Explains why the discrete example has countable separated values and why the continuous example can take any value in an interval", required: true }
    ],
    scoringGuide: {
      E: "Discrete = countable values with gaps; continuous = any value in an interval; gives an example of each and explains why it fits. The examples need not be original; a correct example with its reason earns the point.",
      P: "Both definitions are right but the examples are missing or unexplained, or one definition is muddled.",
      I: "Confuses the two types, or gives examples with no definitions."
    },
    commonMistakes: [
      "Giving an example of only one type",
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
      { id: "probability-distribution", description: "Sets up correct probabilities (1/3 for each outcome)", required: false },
      { id: "expected-value-calculation", description: "Correctly calculates E(X) = (1/3)(10000) + (1/3)(1000) + (1/3)(0) = $3,666.67", required: true },
      { id: "mean-interpretation", description: "Interprets expected value as long-run average over many games", required: true },
      { id: "decision-with-reasoning", description: "Makes recommendation based on comparing expected value ($3,666.67) to cost ($3,000)", required: true },
      { id: "expected-profit", description: "Correctly identifies expected profit is $666.67 (winnings minus fee)", required: false }
    ],
    scoringGuide: {
      E: "E(X) = (1/3)(10000) + (1/3)(1000) + (1/3)(0) = $3,666.67 with the work; interprets it as the long-run average winnings per game; recommends playing because $3,666.67 exceeds the $3,000 fee (expected profit about $667). The 1/3 probabilities are implied by the calculation.",
      P: "Two of the three are correct; one is missing (commonly a yes/no with no comparison to $3,000, or no long-run interpretation).",
      I: "Fewer than two are correct: e.g. a wrong expected value with a decision that has no reasoning."
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
      { id: "distribution-format", description: "Creates clear probability distribution table or list", required: false },
      { id: "expected-value", description: "Calculates E(X) = (1/6)(8) + (1/6)(1) + (4/6)(-2) = $0.17 (approximately)", required: true },
      { id: "fair-game-interpretation", description: "Interprets: positive expected value means game favors player; not 'fair' from carnival's perspective", required: true },
      { id: "long-run-context", description: "Explains that over many plays the player's net profit would average about +$0.17 per play", required: false }
    ],
    scoringGuide: {
      E: "Net profits 8, 1, -2 with probabilities 1/6, 1/6, 4/6; E(X) = (1/6)(8) + (1/6)(1) + (4/6)(-2) = about $0.17; interprets the positive expected value as favoring the player in the long run, so the game is not fair from the carnival's side. A tidy table strengthens the answer.",
      P: "Three of the four are correct; one is missing or wrong (commonly gross winnings used instead of net, or P(other) = 1/6).",
      I: "Two or more of the four are missing or wrong."
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
GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

Grade this response using the E/P/I scoring system. Be generous but accurate.
- Award credit for correct concepts even if phrasing is imperfect
- Look for understanding of key relationships, not just keywords
- Students may use equivalent forms (e.g., "1/3" = "0.333" = "33.3%")
- For calculations, accept reasonable rounding (e.g., $3666.67 or $3667 or approximately $3700)

Respond in JSON format:
{
  "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
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

/**
 * AI Grading Prompts for Unit 4 Lessons 10-12: Binomial & Geometric Distributions
 *
 * Based on AP Statistics Course Framework (UNC-3.A through UNC-3.G) and
 * Daily Video transcripts from Penny Smeltzer.
 *
 * Topics covered:
 * - 4.10: Introduction to the Binomial Distribution
 * - 4.11: Parameters for a Binomial Distribution
 * - 4.12: The Geometric Distribution
 */

const LESSON_CONTEXT_U4L1012 = {
  unit: 4,
  lessons: "10-12",
  topics: [
    "Introduction to the Binomial Distribution",
    "Parameters for a Binomial Distribution",
    "The Geometric Distribution"
  ],
  learningObjectives: [
    "UNC-3.A: Estimate probabilities of binomial random variables using simulation",
    "UNC-3.B: Calculate probabilities for a binomial distribution",
    "UNC-3.C: Calculate parameters for a binomial distribution",
    "UNC-3.D: Interpret probabilities and parameters for a binomial distribution",
    "UNC-3.E: Calculate probabilities for geometric random variables",
    "UNC-3.F: Calculate parameters of a geometric distribution",
    "UNC-3.G: Interpret probabilities and parameters for a geometric distribution"
  ],
  keyVocabulary: {
    "binomial setting": "Binary outcomes, Independent trials, fixed Number of trials (n), Same probability (p) — BINS",
    "binomial random variable": "X = the number of successes in n independent trials with probability p",
    "binomial probability formula": "P(X = x) = C(n,x) · p^x · (1-p)^(n-x)",
    "binomial mean": "μ = np",
    "binomial standard deviation": "σ = √[np(1-p)]",
    "geometric setting": "Binary, Independent, Same p, but NO fixed number of trials (count until first success)",
    "geometric random variable": "X = the number of trials until the first success",
    "geometric probability formula": "P(X = x) = (1-p)^(x-1) · p",
    "geometric mean": "μ = 1/p (expected number of trials to first success)",
    "geometric standard deviation": "σ = √(1-p) / p"
  },
  keyPrinciples: [
    "Binomial: fixed n, count successes; Geometric: no fixed n, count trials to first success",
    "Always define the random variable before calculating",
    "Always identify the distribution and its parameters (n, p)",
    "Calculator notation alone (binompdf, geompdf) does NOT earn credit on AP exam",
    "Must show formula setup with substituted values",
    "Interpret parameters in context with units",
    "For cumulative binomial: P(X ≥ k) = 1 - P(X ≤ k-1)",
    "For cumulative geometric: P(X ≤ k) = sum of individual probabilities"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4L1012 = {

  // R1: Comparing binomial vs geometric distributions
  "reflect1": {
    questionText: "A meteorologist says there is a 30% chance that a given tropical storm will become a major hurricane. Compare binomial vs geometric: (1) Binomial: probability exactly 4 of 10 storms become major hurricanes; (2) Geometric: probability 3rd storm is first to become major hurricane. State distribution with parameters, set up calculation, explain how you know which distribution to use.",
    expectedElements: [
      { id: "binomial-identification", description: "Correctly identifies binomial for the first scenario (fixed n, counting successes)", required: true },
      { id: "binomial-parameters", description: "States binomial parameters: n = 10, p = 0.30", required: true },
      { id: "binomial-setup", description: "Sets up calculation: P(X=4) = C(10,4) · (0.30)^4 · (0.70)^6", required: true },
      { id: "geometric-identification", description: "Correctly identifies geometric for the second scenario (counting trials to first success)", required: true },
      { id: "geometric-parameters", description: "States geometric parameter: p = 0.30", required: true },
      { id: "geometric-setup", description: "Sets up calculation: P(X=3) = (0.70)^2 · (0.30)", required: true },
      { id: "distinction-explanation", description: "Explains key distinction: binomial has fixed n; geometric counts until first success", required: true }
    ],
    scoringGuide: {
      E: "Correctly identifies both distributions with parameters AND sets up both formulas AND explains the key distinction (fixed n vs counting to first success)",
      P: "Correctly handles one distribution but not the other, OR missing setup for one, OR weak/missing explanation of distinction",
      I: "Confuses binomial and geometric OR major errors in parameters OR missing critical components of both setups"
    },
    commonMistakes: [
      "Using geometric when n is fixed (counting successes out of n trials)",
      "Using binomial when counting trials until first success",
      "Forgetting to state parameters (n, p for binomial; p for geometric)",
      "Setting up geometric with p^(x-1) instead of (1-p)^(x-1)",
      "Not explaining WHY each distribution applies",
      "Writing calculator commands instead of formula setup"
    ],
    contextFromVideo: `From Topic 4.10: "A binomial setting involves repeated trials of a random process where four conditions are met: Binary, Independent, Number fixed, Same probability." From Topic 4.12: "Just like binomial, there's two possible outcomes. Each outcome is independent, and each trial has the same probability of success. But a binomial distribution has a fixed number of trials. The geometric distribution does not have a fixed number of trials. We're going to keep performing trials until we have a success."`
  },

  // Exit Ticket: Hurricane landfall analysis
  "exitTicket": {
    questionText: "40% of Atlantic hurricanes make landfall in the US. In a season with 8 hurricanes: (a) P(exactly 3 make landfall), (b) expected number that make landfall + interpretation, (c) P(first landfall is 4th hurricane), (d) average hurricanes until first landfall + interpretation.",
    expectedElements: [
      { id: "part-a-binomial", description: "Part (a): Identifies binomial with n=8, p=0.40", required: true },
      { id: "part-a-calculation", description: "Part (a): P(X=3) = C(8,3) · (0.40)^3 · (0.60)^5 ≈ 0.279", required: true },
      { id: "part-b-mean", description: "Part (b): μ = np = 8(0.40) = 3.2 hurricanes", required: true },
      { id: "part-b-interpretation", description: "Part (b): Interprets as 'on average' or 'in the long run' over many seasons", required: true },
      { id: "part-c-geometric", description: "Part (c): Identifies geometric with p=0.40", required: true },
      { id: "part-c-calculation", description: "Part (c): P(X=4) = (0.60)^3 · (0.40) ≈ 0.0864", required: true },
      { id: "part-d-mean", description: "Part (d): μ = 1/p = 1/0.40 = 2.5 hurricanes", required: true },
      { id: "part-d-interpretation", description: "Part (d): Interprets as 'on average' how many hurricanes form before one makes landfall", required: true }
    ],
    scoringGuide: {
      E: "All four parts correct with proper setup, calculations, and interpretations in context",
      P: "3 parts substantially correct OR all parts attempted but with minor errors (calculation mistakes, weak interpretations)",
      I: "Fewer than 3 parts correct OR major conceptual errors (wrong distribution choice) OR missing interpretations for both b and d"
    },
    commonMistakes: [
      "Using geometric for part (a) or binomial for part (c)",
      "Forgetting the (1-p)^5 term in binomial calculation",
      "Using (0.60)^4 instead of (0.60)^3 for geometric (should be x-1 failures)",
      "Not interpreting the means in context",
      "Saying 'the probability is 3.2' instead of 'expected value'",
      "Confusing the two means (np vs 1/p)"
    ],
    contextFromVideo: `From Topic 4.11: "The mean of a binomial random variable is n times p... in many random samples of 40 cell phone owners, the team can expect, on average, 8.4 people to have a cracked screen." From Topic 4.12: "To find the mean of a geometric distribution... the formula is 1 over p. So here, over many seasons, we can expect that it will take 2.44 tropical storms on average to get the first hurricane."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4L1012(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4L1012[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about binomial and geometric distributions.

## Topic Context
Unit 4, Lessons 10-12: Binomial & Geometric Distributions
Learning Objectives: ${LESSON_CONTEXT_U4L1012.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4L1012.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- Look for understanding of the KEY distinction between binomial and geometric
- Accept equivalent notation: C(n,x) = nCx = "n choose x" = C(n,x) = (n x)
- Accept reasonable rounding for calculations (e.g., 0.279 or 0.28 or 27.9%)
- For geometric, accept both P(X=k) = (1-p)^(k-1) · p and the equivalent form
- Students must show formula setup, not just calculator commands

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
function getRubricU4L1012(questionId) {
  return REFLECTION_RUBRICS_U4L1012[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4L1012() {
  return Object.keys(REFLECTION_RUBRICS_U4L1012);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4L1012 = REFLECTION_RUBRICS_U4L1012;
  window.LESSON_CONTEXT_U4L1012 = LESSON_CONTEXT_U4L1012;
  window.buildReflectionPromptU4L1012 = buildReflectionPromptU4L1012;
  window.getRubricU4L1012 = getRubricU4L1012;
  window.getReflectionQuestionIdsU4L1012 = getReflectionQuestionIdsU4L1012;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4L1012,
    LESSON_CONTEXT_U4L1012,
    buildReflectionPromptU4L1012,
    getRubricU4L1012,
    getReflectionQuestionIdsU4L1012
  };
}

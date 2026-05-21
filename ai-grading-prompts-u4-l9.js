/**
 * AI Grading Prompts for Unit 4 Lesson 9: Combining Random Variables
 *
 * Based on AP Statistics Course Framework (VAR-5.E and VAR-5.F) and
 * Daily Video transcripts from Penny Smeltzer.
 *
 * Topics covered:
 * - Linear transformations (Y = a + bX)
 * - Combining independent random variables (X + Y, X - Y)
 * - The Variance Trap (variances add, SDs do NOT)
 * - Linear combinations (aX + bY)
 */

const LESSON_CONTEXT_U4L9 = {
  unit: 4,
  lessons: "9",
  topics: [
    "Linear Transformations of Random Variables",
    "Combining Independent Random Variables",
    "The Variance Trap"
  ],
  learningObjectives: [
    "VAR-5.E: Calculate parameters for linear combinations of random variables",
    "VAR-5.F: Describe the effects of linear transformations on parameters of random variables"
  ],
  keyVocabulary: {
    "linear transformation": "Y = a + bX, where a shifts the distribution and b scales it",
    "linear combination": "aX + bY, combining two random variables with coefficients",
    "independent random variables": "Knowing one variable's value doesn't change the other's probability distribution",
    "variance": "The square of standard deviation: σ²",
    "the variance trap": "The common error of adding standard deviations instead of variances"
  },
  keyPrinciples: [
    "For Y = a + bX: μY = a + b·μX (constant shifts mean)",
    "For Y = a + bX: σY = |b|·σX (constant does NOT affect spread)",
    "Shape of distribution is preserved under linear transformation",
    "For independent X and Y: μ(X+Y) = μX + μY and μ(X-Y) = μX - μY",
    "VARIANCE TRAP: σ²(X+Y) = σ²X + σ²Y (variances ADD)",
    "VARIANCE TRAP: σ²(X-Y) = σ²X + σ²Y (variances STILL ADD for subtraction!)",
    "Standard deviations NEVER add: σ(X+Y) ≠ σX + σY",
    "For linear combinations: σ²(aX+bY) = a²σ²X + b²σ²Y"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4L9 = {

  // R1: The Variance Trap - Common Student Error
  "reflect1": {
    questionText: "A student claims that if σX = 3 and σY = 4 (where X and Y are independent), then σ(X+Y) = 7. Explain the error in their reasoning and calculate the correct answer.",
    expectedElements: [
      { id: "identify-error", description: "Identifies that the student incorrectly added standard deviations directly", required: true },
      { id: "variance-rule", description: "States that variances (not SDs) add for independent random variables", required: true },
      { id: "correct-calculation", description: "Shows correct calculation: σ = √(3² + 4²) = √(9 + 16) = √25 = 5", required: true },
      { id: "conceptual-explanation", description: "Explains WHY variances add (uncertainty/variability increases when combining)", required: false }
    ],
    scoringGuide: {
      E: "Correctly identifies the error (adding SDs), states variance rule, and calculates σ(X+Y) = 5",
      P: "Identifies the error OR gives correct answer, but missing one key component or explanation is incomplete",
      I: "Does not identify the error OR gives wrong answer OR shows same misconception as the student"
    },
    commonMistakes: [
      "Agreeing with the student that 3 + 4 = 7 is correct",
      "Knowing to use variances but making arithmetic errors",
      "Subtracting variances instead of adding",
      "Not taking the square root at the end"
    ],
    contextFromVideo: `From Topic 4.9v2: "Note that standard deviations NEVER add! And that for a sum or difference of independent random variables, the variances ALWAYS add." The video emphasizes: "So the variance of X + Y, or X - Y, is the sum of the two individual variances."`
  },

  // R2: Practical Application - Package Weights
  "reflect2": {
    questionText: "A delivery service tracks Package A (mean weight 5 lbs, SD 0.8 lbs) and Package B (mean weight 12 lbs, SD 1.5 lbs). If packages are independent, find the mean and standard deviation of the TOTAL weight (A + B), and explain each step of your calculation.",
    expectedElements: [
      { id: "mean-calculation", description: "Correctly calculates mean: μ(A+B) = 5 + 12 = 17 lbs", required: true },
      { id: "variance-step", description: "Shows variance calculation: σ² = 0.8² + 1.5² = 0.64 + 2.25 = 2.89", required: true },
      { id: "sd-calculation", description: "Correctly calculates SD: σ = √2.89 ≈ 1.7 lbs", required: true },
      { id: "explains-process", description: "Explains that means add directly but SDs require variance addition then square root", required: true },
      { id: "independence-note", description: "Mentions that independence is required for the variance addition rule", required: false }
    ],
    scoringGuide: {
      E: "Correct mean (17 lbs), correct SD (≈1.7 lbs), with clear step-by-step explanation including variance calculation",
      P: "Correct answers but weak explanation OR correct process with minor arithmetic error",
      I: "Major calculation error (e.g., adding SDs directly to get 2.3) OR missing key steps"
    },
    commonMistakes: [
      "Adding standard deviations directly: 0.8 + 1.5 = 2.3 lbs (THE TRAP!)",
      "Forgetting to take the square root after adding variances",
      "Not showing the variance step",
      "Subtracting instead of adding for the mean"
    ],
    contextFromVideo: `From Topic 4.9v2: "So here, the standard deviation for the total number of cars sold—because our two independent random variables are independent—is we add the two variances, and then take the square root to find the standard deviation."`
  },

  // Exit Ticket: Coffee Shop Multi-Step Problem
  "exitTicket": {
    questionText: "A coffee shop: Lattes (μL = $4.50, σL = $0.60) and Muffins (μM = $3.25, σM = $0.45). Find mean and SD of total bill, then apply 10% discount (multiply by 0.9). Show all work.",
    expectedElements: [
      { id: "total-mean", description: "Calculates total mean: μ = 4.50 + 3.25 = $7.75", required: true },
      { id: "total-variance", description: "Calculates variance: σ² = 0.60² + 0.45² = 0.36 + 0.2025 = 0.5625", required: true },
      { id: "total-sd", description: "Calculates SD: σ = √0.5625 = $0.75", required: true },
      { id: "discount-mean", description: "Applies discount to mean: 0.9 × $7.75 = $6.975 (or ≈$6.98)", required: true },
      { id: "discount-sd", description: "Applies discount to SD: |0.9| × $0.75 = $0.675 (or ≈$0.68)", required: true },
      { id: "shows-work", description: "Shows clear step-by-step work for each calculation", required: true }
    ],
    scoringGuide: {
      E: "All calculations correct: total ($7.75, $0.75) and discounted ($6.975, $0.675) with clear work shown",
      P: "Most calculations correct with minor errors OR correct process but missing one component (e.g., forgot discount on SD)",
      I: "Major errors (adding SDs directly, wrong discount application) OR missing multiple components"
    },
    commonMistakes: [
      "Adding SDs directly: 0.60 + 0.45 = 1.05 (THE TRAP!)",
      "Forgetting to apply discount to standard deviation",
      "Subtracting 10% instead of multiplying by 0.9",
      "Not showing variance calculation step",
      "Thinking the constant in a transformation (like discount) affects SD differently than multiplication"
    ],
    contextFromVideo: `From Topic 4.9v1: "The standard deviation of Y is the absolute value of the slope times the standard deviation of X." From Topic 4.9v2: "For linear combinations, if X and Y are independent, the mean is the sum of the two variables with their linear function added to it. And for the standard deviation, we use this formula here [a²σ²X + b²σ²Y]."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4L9(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4L9[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about combining random variables.

## Topic Context
Unit 4, Lesson 9: Combining Random Variables (Linear Transformations & The Variance Trap)
Learning Objectives: ${LESSON_CONTEXT_U4L9.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4L9.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

## Critical Concept: THE VARIANCE TRAP
- Standard deviations NEVER add directly!
- For independent X and Y: σ(X+Y) = √(σ²X + σ²Y), NOT σX + σY
- For X - Y: Variances STILL ADD (σ²(X-Y) = σ²X + σ²Y)

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
- Students may use equivalent forms (e.g., "0.75" = "3/4" = "75 cents")
- For calculations, accept reasonable rounding
- ESPECIALLY watch for the Variance Trap error (adding SDs instead of variances)

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
function getRubricU4L9(questionId) {
  return REFLECTION_RUBRICS_U4L9[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4L9() {
  return Object.keys(REFLECTION_RUBRICS_U4L9);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4L9 = REFLECTION_RUBRICS_U4L9;
  window.LESSON_CONTEXT_U4L9 = LESSON_CONTEXT_U4L9;
  window.buildReflectionPromptU4L9 = buildReflectionPromptU4L9;
  window.getRubricU4L9 = getRubricU4L9;
  window.getReflectionQuestionIdsU4L9 = getReflectionQuestionIdsU4L9;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4L9,
    LESSON_CONTEXT_U4L9,
    buildReflectionPromptU4L9,
    getRubricU4L9,
    getReflectionQuestionIdsU4L9
  };
}

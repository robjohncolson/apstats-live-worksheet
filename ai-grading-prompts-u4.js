/**
 * AI Grading Prompts for Unit 4 Lessons 1-2: Random Patterns & Estimating Probabilities
 *
 * Based on AP Statistics Course Framework (VAR-1.F, UNC-2.A) and
 * Daily Video transcripts from Michael Joy and Joshua Soya.
 *
 * Topics covered:
 * - Random processes and predictability
 * - Outcomes and events
 * - Simulation as a modeling tool
 * - Law of Large Numbers
 * - Designing simulations with random number generators
 */

const LESSON_CONTEXT_U4 = {
  unit: 4,
  lessons: "1-2",
  topics: ["Random and Non-Random Patterns", "Estimating Probabilities Using Simulation"],
  learningObjectives: [
    "VAR-1.F: Identify questions suggested by patterns in data",
    "UNC-2.A: Estimate probabilities using simulation"
  ],
  keyVocabulary: {
    "random process": "A situation where all possible outcomes are known, but individual outcomes are unpredictable",
    "outcome": "The result of a single trial of a random process",
    "event": "A collection of outcomes from a random process",
    "simulation": "A way to model random events such that simulated outcomes closely match real-world outcomes",
    "empirical probability": "Probability estimated by performing many trials and calculating relative frequency",
    "law of large numbers": "As the number of trials increases, simulated probabilities get closer to the true probability",
    "independent": "Knowing the result of one trial does not affect the probability of future trials"
  },
  keyPrinciples: [
    "Individual outcomes are unpredictable, but patterns emerge in the long run",
    "Streaks and clusters are NORMAL in random data - humans tend to avoid them when faking randomness",
    "Past outcomes do not influence future outcomes in independent trials (no 'due' effect)",
    "Simulation requires: (1) digit assignment matching real probabilities, (2) many trials, (3) counting relative frequency",
    "Law of Large Numbers: more trials → closer to true probability"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4 = {

  // R1: Why fake sequences look different from random
  "reflect1": {
    questionText: "Explain why your 'fake' coin flip sequence might look different from truly random data. What patterns do humans tend to avoid that actually appear in random sequences?",
    expectedElements: [
      { id: "humans-avoid-streaks", description: "Humans tend to avoid long streaks/runs of the same outcome", required: true },
      { id: "real-random-has-streaks", description: "Truly random sequences often contain longer streaks than expected", required: true },
      { id: "humans-alternate", description: "Humans tend to alternate too frequently (HTHTHTHT pattern)", required: false },
      { id: "streaks-are-normal", description: "Acknowledges that streaks of 5, 6, 7, or 8+ are actually common in 100 flips", required: false }
    ],
    scoringGuide: {
      E: "Identifies that humans avoid streaks AND that real random data has longer streaks than expected",
      P: "Mentions one concept (avoiding streaks OR random data having streaks) but not the connection",
      I: "Does not address the key difference between human-generated and truly random sequences"
    },
    commonMistakes: [
      "Saying random means 'equal' or 'balanced' (e.g., exactly 50-50)",
      "Not recognizing that streaks are normal in random data",
      "Focusing on total counts rather than patterns/streaks"
    ],
    contextFromVideo: `From Topic 4.1: "The longest streak that I had was eight... that set of eight tails that we got may not be as weird as you may think." From Topic 4.2v1: "A string of eight or more heads or tails actually became a little more prevalent than what we may have expected, showing up about 32% of the time."`
  },

  // R2: Gambler's fallacy / independence
  "reflect2": {
    questionText: "A friend says: 'I've flipped tails 5 times in a row, so the next flip is almost certain to be heads.' Explain why this reasoning is flawed, using the concept of independent events and the Law of Large Numbers.",
    expectedElements: [
      { id: "independence", description: "Each flip is independent - past flips don't affect future flips", required: true },
      { id: "no-due-effect", description: "The coin is not 'due' for heads; probability remains 50%", required: true },
      { id: "lln-long-run", description: "Law of Large Numbers applies to LONG RUN, not next single flip", required: true },
      { id: "gamblers-fallacy", description: "This is called the gambler's fallacy (optional term)", required: false }
    ],
    scoringGuide: {
      E: "Explains independence (50% each flip), no 'due' effect, and that LLN is about long-run convergence",
      P: "Mentions independence OR LLN misapplication but doesn't fully connect both concepts",
      I: "Agrees with the friend's reasoning OR does not address independence"
    },
    commonMistakes: [
      "Saying the Law of Large Numbers means things 'balance out' in the short run",
      "Not clearly stating that each flip remains 50-50",
      "Confusing long-run patterns with predictions for the next trial"
    ],
    contextFromVideo: `From Topic 4.1: "In the first five flips, we noticed that it was all tails. Is this any type of indication that the next flip needs to be a heads? And the answer is no. It did so happen that the next one was a heads, but it was not because I was due for a heads." From Topic 4.2v2: "The law of large numbers says that simulated probabilities seem to get closer to the true probability as the number of trials increases."`
  },

  // Exit Ticket: Design a simulation
  "exitTicket": {
    questionText: "Design a simulation: A multiple choice test has 5 questions, each with 4 options (A, B, C, D). A student guesses randomly on every question. Design a simulation to estimate the probability of getting at least 3 correct by guessing.",
    expectedElements: [
      { id: "digit-assignment", description: "Assigns digits to represent correct/incorrect (e.g., 1=correct, 2-4=incorrect; or 1-25=correct, 26-100=incorrect)", required: true },
      { id: "trial-definition", description: "One trial = generating 5 random numbers (one per question)", required: true },
      { id: "recording", description: "Count how many of the 5 are 'correct' in each trial", required: true },
      { id: "success-criterion", description: "Success = 3 or more correct out of 5", required: true },
      { id: "many-trials", description: "Repeat for many trials and calculate proportion of successes", required: false }
    ],
    scoringGuide: {
      E: "Correct digit assignment reflecting 25% probability, defines trial as 5 numbers, records count ≥3, mentions repeating",
      P: "Has correct structure but digit assignment doesn't match 25% OR missing one key component",
      I: "Fundamentally misunderstands simulation design (e.g., wrong probability, unclear trial definition)"
    },
    commonMistakes: [
      "Using digits 1-4 where 1=correct gives 25% but not explaining this clearly",
      "Not specifying that one trial consists of exactly 5 random selections",
      "Forgetting to mention the success threshold (at least 3 correct)",
      "Not mentioning the need for many trials to estimate probability"
    ],
    contextFromVideo: `From Topic 4.2v2: "First of all, we have to describe how the random digits will imitate the trial... what digits or what numbers will be used to represent which outcomes. And also determine what will be recorded from each trial. We then perform many, many, many trials of the simulation and then we're going to calculate the relative frequency of successful trials in order to get a simulated probability." Example: "We can represent the numbers from 1 to 82, those will represent a made shot and the numbers from 83 to 100 can represent a missed shot."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about probability and simulation.

## Topic Context
Unit 4, Lessons 1-2: Random Patterns & Estimating Probabilities Using Simulation
Learning Objectives: ${LESSON_CONTEXT_U4.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- Students may use synonyms (e.g., "streak" for "run", "each flip is separate" for "independent")

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
function getRubricU4(questionId) {
  return REFLECTION_RUBRICS_U4[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4() {
  return Object.keys(REFLECTION_RUBRICS_U4);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4 = REFLECTION_RUBRICS_U4;
  window.LESSON_CONTEXT_U4 = LESSON_CONTEXT_U4;
  window.buildReflectionPromptU4 = buildReflectionPromptU4;
  window.getRubricU4 = getRubricU4;
  window.getReflectionQuestionIdsU4 = getReflectionQuestionIdsU4;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4,
    LESSON_CONTEXT_U4,
    buildReflectionPromptU4,
    getRubricU4,
    getReflectionQuestionIdsU4
  };
}

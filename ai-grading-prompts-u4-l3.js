/**
 * AI Grading Prompts for Unit 4 Lessons 1-3: Random Patterns, Simulation & Introduction to Probability
 *
 * Based on AP Statistics Course Framework (VAR-1.F, UNC-2.A, VAR-4.A, VAR-4.B) and
 * Daily Video transcripts from Michael Joy and Joshua Soya.
 *
 * Topics covered:
 * - Random processes and predictability (4.1)
 * - Outcomes and events (4.2)
 * - Simulation as a modeling tool (4.2)
 * - Law of Large Numbers (4.2)
 * - Sample spaces (4.3)
 * - Probability for equally likely outcomes (4.3)
 * - Interpreting probability (4.3)
 * - Complement rule (4.3)
 */

const LESSON_CONTEXT_U4L3 = {
  unit: 4,
  lessons: "1-3",
  topics: [
    "Random and Non-Random Patterns",
    "Estimating Probabilities Using Simulation",
    "Introduction to Probability"
  ],
  learningObjectives: [
    "VAR-1.F: Identify questions suggested by patterns in data",
    "UNC-2.A: Estimate probabilities using simulation",
    "VAR-4.A: Calculate probabilities for events and their complements",
    "VAR-4.B: Interpret probabilities for events"
  ],
  keyVocabulary: {
    "random process": "A situation where all possible outcomes are known, but individual outcomes are unpredictable",
    "outcome": "The result of a single trial of a random process",
    "event": "A collection of outcomes from a random process",
    "sample space": "The collection of all possible non-overlapping outcomes of a random process (denoted S)",
    "simulation": "A way to model random events such that simulated outcomes closely match real-world outcomes",
    "empirical probability": "Probability estimated by performing many trials and calculating relative frequency",
    "law of large numbers": "As the number of trials increases, simulated probabilities get closer to the true probability",
    "independent": "Knowing the result of one trial does not affect the probability of future trials",
    "complement": "The event that A does NOT happen, denoted A' or A^c; P(A') = 1 - P(A)",
    "probability distribution": "A table, graph, or formula showing all probabilities for a random variable; probabilities must sum to 1"
  },
  keyPrinciples: [
    "Individual outcomes are unpredictable, but patterns emerge in the long run",
    "Streaks and clusters are NORMAL in random data - humans tend to avoid them when faking randomness",
    "Past outcomes do not influence future outcomes in independent trials (no 'due' effect)",
    "Simulation requires: (1) digit assignment matching real probabilities, (2) many trials, (3) counting relative frequency",
    "Law of Large Numbers: more trials → closer to true probability",
    "P(A) = (outcomes in A) / (total outcomes in sample space) for equally likely outcomes",
    "Probability is always between 0 and 1, inclusive",
    "Probability can be interpreted as relative frequency in the long run",
    "P(A') = 1 - P(A) (complement rule)"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4L3 = {

  // R1: Why fake sequences look different from random (from U4 L1-2)
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

  // R2: Gambler's fallacy / independence (from U4 L1-2)
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

  // R3: Interpreting probability as relative frequency (NEW for L3)
  "reflect3": {
    questionText: "Using the record store example: If the owner says 'About 20% of albums sold are jazz,' explain what this probability means in terms of what would happen if we randomly selected many albums from the store's sales. Why is this interpretation more useful than just saying '431 out of 2105'?",
    expectedElements: [
      { id: "long-run-interpretation", description: "If we randomly select many albums, about 20% would be jazz", required: true },
      { id: "relative-frequency", description: "Probability represents relative frequency in long run / repeated selections", required: true },
      { id: "generalizability", description: "Percentage/probability generalizes to any sample size, not just 2105", required: true },
      { id: "prediction-utility", description: "Can make predictions about future selections or different sample sizes", required: false },
      { id: "with-replacement", description: "With replacement maintains the probability for each selection", required: false }
    ],
    scoringGuide: {
      E: "Explains long-run relative frequency interpretation AND why this is more generalizable/useful than raw counts",
      P: "Mentions relative frequency interpretation OR generalizability but doesn't fully connect both ideas",
      I: "Does not explain what the probability means for repeated selections OR why it's more useful than counts"
    },
    commonMistakes: [
      "Saying exactly 20% will be jazz (rather than approximately or on average)",
      "Not connecting probability to long-run behavior",
      "Focusing only on the specific calculation without interpreting what it means"
    ],
    contextFromVideo: `From Topic 4.3: "The probability of an event in a repeatable situation can be interpreted as the relative frequency in which this event will occur in the long run. So that means that if we were to randomly select many albums that were sold—if we were to randomly select many albums from this collection and we continue to replace and continue to select albums many, many times... if we continue to do this thing a lot, a lot of times, the relative frequency that we would select a jazz album would be approximately 0.205."`
  },

  // Exit Ticket: Sample space, probability, complement, interpretation (NEW for L3)
  "exitTicket": {
    questionText: "A bag contains 8 red marbles, 5 blue marbles, and 7 green marbles. You randomly select one marble. (1) What is the sample space? (2) Calculate P(blue) and interpret what this probability means. (3) Calculate P(not red) using the complement rule. (4) If you select 100 marbles (with replacement), about how many would you expect to be green?",
    expectedElements: [
      { id: "sample-space", description: "Identifies sample space as {red, blue, green} or all 20 individual marbles", required: true },
      { id: "total-outcomes", description: "Correctly identifies total as 20 marbles (8+5+7)", required: true },
      { id: "p-blue-calculation", description: "P(blue) = 5/20 = 0.25 or 25%", required: true },
      { id: "p-blue-interpretation", description: "Interprets P(blue) as long-run relative frequency (about 25% of many selections would be blue)", required: true },
      { id: "complement-rule", description: "Uses complement rule: P(not red) = 1 - P(red) = 1 - 8/20 = 12/20 = 0.60", required: true },
      { id: "expected-green", description: "Expected green = 100 × (7/20) = 35 marbles", required: true }
    ],
    scoringGuide: {
      E: "Correctly calculates all probabilities, interprets P(blue), uses complement rule properly, and calculates expected value",
      P: "Gets most calculations right but missing interpretation OR makes one computational error",
      I: "Multiple errors in probability calculations OR fundamentally misunderstands sample space or complement rule"
    },
    commonMistakes: [
      "Forgetting to calculate total outcomes (20 marbles)",
      "Not interpreting probability as relative frequency in long run",
      "Calculating P(not red) by adding other probabilities instead of using 1 - P(red)",
      "Not showing complement rule formula even if answer is correct",
      "Confusing expected value with guaranteed exact count"
    ],
    contextFromVideo: `From Topic 4.3: "For a random process, the sample space is the collection of all possible non-overlapping outcomes." "P(A) = total number of outcomes in event A / total number of outcomes in sample space." "The probability of the complement of A is equal to 1 minus the probability that A occurs." "Probabilities of events in repeatable situations can be interpreted as the relative frequency with which the event will occur in the long run."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4L3(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4L3[questionId];
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
Unit 4, Lessons 1-3: Random Patterns, Simulation & Introduction to Probability
Learning Objectives: ${LESSON_CONTEXT_U4L3.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4L3.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- For calculation problems, accept equivalent forms (fractions, decimals, percentages)

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
function getRubricU4L3(questionId) {
  return REFLECTION_RUBRICS_U4L3[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4L3() {
  return Object.keys(REFLECTION_RUBRICS_U4L3);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4L3 = REFLECTION_RUBRICS_U4L3;
  window.LESSON_CONTEXT_U4L3 = LESSON_CONTEXT_U4L3;
  window.buildReflectionPromptU4L3 = buildReflectionPromptU4L3;
  window.getRubricU4L3 = getRubricU4L3;
  window.getReflectionQuestionIdsU4L3 = getReflectionQuestionIdsU4L3;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4L3,
    LESSON_CONTEXT_U4L3,
    buildReflectionPromptU4L3,
    getRubricU4L3,
    getReflectionQuestionIdsU4L3
  };
}

/**
 * AI Grading Prompts for Unit 4 Lessons 3-5: Probability, Mutually Exclusive & Conditional Probability
 *
 * Based on AP Statistics Course Framework (VAR-4.A, VAR-4.B, VAR-4.C, VAR-4.D) and
 * Daily Video transcripts from Joshua Soyo.
 *
 * Topics covered:
 * - Sample spaces (4.3)
 * - Probability for equally likely outcomes (4.3)
 * - Interpreting probability as relative frequency (4.3)
 * - Complement rule (4.3)
 * - Mutually exclusive (disjoint) events (4.4)
 * - Intersection and joint probability (4.4)
 * - Venn diagrams (4.4)
 * - Conditional probability (4.5)
 * - General multiplication rule (4.5)
 * - Two-way tables for conditional probability (4.5)
 */

const LESSON_CONTEXT_U4L345 = {
  unit: 4,
  lessons: "3-5",
  topics: [
    "Introduction to Probability",
    "Mutually Exclusive Events",
    "Conditional Probability"
  ],
  learningObjectives: [
    "VAR-4.A: Calculate probabilities for events and their complements",
    "VAR-4.B: Interpret probabilities for events",
    "VAR-4.C: Explain why two events are (or are not) mutually exclusive",
    "VAR-4.D: Calculate conditional probabilities"
  ],
  keyVocabulary: {
    "sample space": "The collection of all possible non-overlapping outcomes of a random process (denoted S)",
    "probability": "P(A) = (outcomes in A) / (total outcomes in sample space); always between 0 and 1",
    "complement": "The event that A does NOT happen, denoted A' or A^c; P(A') = 1 - P(A)",
    "probability distribution": "A table showing all probabilities for events; probabilities must sum to 1",
    "mutually exclusive": "Events that cannot occur at the same time; also called disjoint; P(A ∩ B) = 0",
    "intersection": "The event that both A and B occur, denoted A ∩ B; also called joint probability",
    "joint probability": "P(A ∩ B) - the probability of the intersection of two events",
    "conditional probability": "P(B|A) - the probability of B given that A has occurred = P(A ∩ B) / P(A)",
    "multiplication rule": "P(A ∩ B) = P(A) · P(B|A) - used to find joint probability"
  },
  keyPrinciples: [
    "P(A) = (outcomes in A) / (total outcomes in sample space) for equally likely outcomes",
    "Probability is always between 0 and 1, inclusive (0 = impossible, 1 = certain)",
    "Probability can be interpreted as relative frequency in the long run",
    "P(A') = 1 - P(A) (complement rule)",
    "If P(A ∩ B) = 0, events A and B are mutually exclusive (disjoint)",
    "Venn diagrams: non-touching circles = mutually exclusive; overlapping = intersection exists",
    "P(B|A) = P(A ∩ B) / P(A) - conditional probability formula",
    "P(A ∩ B) = P(A) · P(B|A) - general multiplication rule",
    "Order matters: P(A|B) ≠ P(B|A) in general",
    "For two-way tables: focus on the row/column specified by the condition"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_U4L345 = {

  // R1: Interpreting probability as relative frequency (Topic 4.3)
  "reflect1": {
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

  // R2: Mutually exclusive vs. low probability events (Topic 4.4)
  "reflect2": {
    questionText: "Explain the difference between mutually exclusive events and events that simply have a low probability of both occurring. Give an example of each using the Super Status! survey data.",
    expectedElements: [
      { id: "mutually-exclusive-definition", description: "Mutually exclusive means events CANNOT occur together (P(A ∩ B) = 0)", required: true },
      { id: "low-probability-definition", description: "Low probability means events CAN occur together but rarely do (P(A ∩ B) > 0 but small)", required: true },
      { id: "mutually-exclusive-example", description: "Gives a correct example of mutually exclusive from the table (e.g., Famous and Telepathy where intersection is 0)", required: true },
      { id: "low-probability-example", description: "Gives a correct example of non-mutually exclusive events with small intersection (e.g., Famous and Fly with 5 students)", required: true },
      { id: "impossibility-vs-rarity", description: "Distinguishes between impossible (zero probability) and just unlikely (small probability)", required: false }
    ],
    scoringGuide: {
      E: "Clearly distinguishes between impossible (P=0) and unlikely (P>0 but small), with correct examples from the table",
      P: "Understands the distinction but gives only one example OR has minor errors in examples",
      I: "Confuses mutually exclusive with low probability OR does not provide clear examples"
    },
    commonMistakes: [
      "Thinking mutually exclusive means 'unlikely' rather than 'impossible'",
      "Not checking the actual intersection values in the table",
      "Confusing 'independent' with 'mutually exclusive'",
      "Saying events with small intersection are mutually exclusive"
    ],
    contextFromVideo: `From Topic 4.4: "Mutually exclusive or disjoint events cannot occur at the same time." "If we look at the intersection of being famous and choosing to have telepathy, we see that there is a zero in that place, so zero out of 433, which is equal to zero. And so because no students chose to be both famous and telepathic, the two events are mutually exclusive." "P(Happy ∩ Freeze Time) = 63/433 ≈ 0.145" — this is small but NOT zero, so these are NOT mutually exclusive.`
  },

  // R3: Conditional probability and sampling without replacement (Topic 4.5)
  "reflect3": {
    questionText: "In the marble example, why does the probability of the second marble being red depend on what happened with the first marble? How would this change if we selected marbles WITH replacement instead?",
    expectedElements: [
      { id: "without-replacement-changes-composition", description: "Without replacement: the first selection changes the composition of remaining marbles", required: true },
      { id: "fewer-remaining", description: "If first marble is red, there are fewer red marbles AND fewer total marbles for second draw", required: true },
      { id: "conditional-probability", description: "The probability of the second event depends on (is conditional on) the first outcome", required: true },
      { id: "with-replacement-independence", description: "With replacement: the composition stays the same, so second probability is unchanged", required: true },
      { id: "specific-values", description: "Mentions specific values: 3/9 vs 4/10 without replacement, or 4/10 each time with replacement", required: false }
    ],
    scoringGuide: {
      E: "Explains how removal changes composition AND that with replacement probabilities stay constant",
      P: "Correctly explains either without replacement OR with replacement but not both clearly",
      I: "Does not correctly explain how the first selection affects the second"
    },
    commonMistakes: [
      "Not mentioning that both the numerator AND denominator change",
      "Saying probabilities are always the same regardless of replacement",
      "Confusing independence with sampling with replacement",
      "Not connecting 'conditional probability' to the concept of changing composition"
    ],
    contextFromVideo: `From Topic 4.5: "So, the chance that the first marble is fully red is going to be 4 out of 10. But what about the second marble being fully red? It is going to depend on what the first marble was, and so because of that, then we say that the probability of the second marble is conditional on the status of whatever the first marble that was selected." "What if the first marble is red? Now what's my likelihood of getting an all red? It changes to 3 out of 9."`
  },

  // Exit Ticket: Two-way table with probability, joint probability, mutually exclusive, conditional
  "exitTicket": {
    questionText: "A survey of 200 students asked about favorite subject (Math or English) and grade level (Freshman or Sophomore). (1) Calculate P(Math) and interpret. (2) Calculate P(Freshman ∩ Math). (3) Are 'Freshman' and 'Math' mutually exclusive? Explain. (4) Calculate P(Math | Freshman) and P(Math | Sophomore).",
    expectedElements: [
      { id: "p-math-calculation", description: "P(Math) = 105/200 = 0.525 or 52.5%", required: true },
      { id: "p-math-interpretation", description: "Interprets P(Math) as long-run relative frequency (about 52.5% of randomly selected students prefer Math)", required: true },
      { id: "joint-probability", description: "P(Freshman ∩ Math) = 45/200 = 0.225 or 22.5%", required: true },
      { id: "not-mutually-exclusive", description: "Freshman and Math are NOT mutually exclusive because their intersection is not zero (45 students are both)", required: true },
      { id: "conditional-freshman", description: "P(Math | Freshman) = 45/100 = 0.45 or 45%", required: true },
      { id: "conditional-sophomore", description: "P(Math | Sophomore) = 60/100 = 0.60 or 60%", required: true },
      { id: "comparison", description: "Notes that sophomores are more likely to prefer Math than freshmen (optional but good)", required: false }
    ],
    scoringGuide: {
      E: "All calculations correct, interprets P(Math), correctly explains why not mutually exclusive, and calculates both conditional probabilities",
      P: "Most calculations correct but missing interpretation OR makes one computational error OR incomplete explanation of mutual exclusivity",
      I: "Multiple errors in probability calculations OR fundamentally misunderstands mutually exclusive or conditional probability"
    },
    commonMistakes: [
      "Forgetting to divide by 200 for overall probability vs row/column total for conditional",
      "Not interpreting probability as relative frequency in long run",
      "Saying Freshman and Math ARE mutually exclusive because some students chose English",
      "Confusing P(Freshman ∩ Math) with P(Math | Freshman)",
      "Using wrong denominator for conditional probabilities"
    ],
    contextFromVideo: `From Topic 4.4: "Two events are mutually exclusive or disjoint if they cannot occur at the same time. And if two events are mutually exclusive, then the probability of their intersection is zero." From Topic 4.5: "For P(Rich | Fly), focus only on the 'Fly' row. The answer is simply 22 out of 89." "The probability of B given A is equal to the probability of both A and B divided by the probability of A."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptU4L345(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_U4L345[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about probability, mutually exclusive events, and conditional probability.

## Topic Context
Unit 4, Lessons 3-5: Probability, Mutually Exclusive Events & Conditional Probability
Learning Objectives: ${LESSON_CONTEXT_U4L345.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT_U4L345.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- Students may use synonyms (e.g., "disjoint" for "mutually exclusive", "intersection" for "joint probability")
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
function getRubricU4L345(questionId) {
  return REFLECTION_RUBRICS_U4L345[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsU4L345() {
  return Object.keys(REFLECTION_RUBRICS_U4L345);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_U4L345 = REFLECTION_RUBRICS_U4L345;
  window.LESSON_CONTEXT_U4L345 = LESSON_CONTEXT_U4L345;
  window.buildReflectionPromptU4L345 = buildReflectionPromptU4L345;
  window.getRubricU4L345 = getRubricU4L345;
  window.getReflectionQuestionIdsU4L345 = getReflectionQuestionIdsU4L345;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_U4L345,
    LESSON_CONTEXT_U4L345,
    buildReflectionPromptU4L345,
    getRubricU4L345,
    getReflectionQuestionIdsU4L345
  };
}

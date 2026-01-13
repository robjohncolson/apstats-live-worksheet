/**
 * AI Grading Prompts for Unit 3 Lessons 6-7: Experimental Design & Inference
 *
 * Based on AP Statistics Course Framework (VAR-3.D, VAR-3.E) and
 * Daily Video transcripts from Joshua Sawyer.
 *
 * Topics covered:
 * - Blocking in experimental design
 * - Matched pairs design
 * - Statistical significance
 * - Causation from experiments
 * - Generalization to population
 */

const LESSON_CONTEXT = {
  unit: 3,
  lessons: "6-7",
  topics: ["Selecting an Experimental Design", "Inference and Experiments"],
  learningObjectives: [
    "VAR-3.D: Explain why a particular experimental design is appropriate",
    "VAR-3.E: Interpret the results of a well-designed experiment"
  ],
  keyVocabulary: {
    "random assignment": "Assigning treatments to experimental units by chance; allows causal conclusions",
    "random selection": "Choosing experimental units from population by chance; allows generalization",
    "blocking": "Grouping similar experimental units before random assignment to reduce variability",
    "matched pairs": "Special case of blocking with pairs of similar units or same unit gets both treatments",
    "confounding variable": "Variable related to explanatory variable that influences response; creates false perception",
    "statistical significance": "Observed difference too large to be due to chance alone (small p-value)",
    "causation": "Treatment caused the observed effect; requires random assignment + statistical significance",
    "generalization": "Applying results to larger population; requires random selection or representative sample"
  },
  keyPrinciples: [
    "Random assignment → can establish causation (if statistically significant)",
    "Random selection → can generalize to population",
    "Blocking helps separate natural variability from treatment effects",
    "Statistical significance means difference unlikely due to chance alone",
    "p-value near 0 means strong evidence against chance explanation"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS = {

  // Q53: Random Selection vs. Random Assignment
  "reflect53": {
    questionText: "Explain the difference between random selection and random assignment and when each is used.",
    expectedElements: [
      { id: "selection-def", description: "Random selection = choosing sample from population", required: true },
      { id: "assignment-def", description: "Random assignment = assigning treatments to units", required: true },
      { id: "selection-purpose", description: "Random selection allows generalization to population", required: true },
      { id: "assignment-purpose", description: "Random assignment allows causal conclusions", required: true }
    ],
    scoringGuide: {
      E: "All 4 elements: both definitions AND both purposes",
      P: "2-3 elements OR definitions without clear connection to purpose",
      I: "0-1 elements OR confuses the two concepts"
    },
    commonMistakes: [
      "Confusing the two terms (using them interchangeably)",
      "Only defining without explaining when/why each is used",
      "Saying random selection establishes causation (it doesn't)"
    ],
    contextFromVideo: `From Topic 3.7 transcript: "Random selection of experimental units allows for results to be generalized to the population of interest." Random assignment "allows us to conclude that very large observed changes are not merely by chance (statistically significant)." "Statistically significant differences between or among experimental treatment groups are evidence that the treatments caused the effect."`
  },

  // Q54a: Confounding Variable
  "reflect54a": {
    questionText: "A researcher tests a new fertilizer on 10 fields with different soil types. She applies the new fertilizer to 5 fields and the old fertilizer to 5 fields. What is a potential confounding variable?",
    expectedElements: [
      { id: "identify-variable", description: "Names a confounding variable (soil type, terrain, moisture, sunlight, drainage)", required: true },
      { id: "explain-confounding", description: "Explains WHY it's confounding: related to treatment AND affects response", required: true },
      { id: "assignment-issue", description: "Notes that different fields got different treatments without proper randomization", required: false }
    ],
    scoringGuide: {
      E: "Names variable AND explains why it's confounding (affects both treatment assignment and yield)",
      P: "Names variable but incomplete/unclear explanation of confounding",
      I: "No variable identified OR fundamental misunderstanding of confounding"
    },
    commonMistakes: [
      "Listing variables without explaining why they're confounding",
      "Naming the treatment (fertilizer) as the confounding variable",
      "Confusing confounding with lurking variables"
    ],
    contextFromVideo: `From Topic 3.6v2 (Tractor Plots): "The draft is affected by environmental conditions such as soil type, terrain, and moisture. But because we only applied each hitch to one plot, it could be that the two plots are different." "The treatments are confounded with the plots themselves."`
  },

  // Q54b: Improved Design with Blocking
  "reflect54b": {
    questionText: "Propose an improved design using blocking.",
    expectedElements: [
      { id: "blocking-variable", description: "Identifies blocking variable (soil type)", required: true },
      { id: "block-creation", description: "Groups fields by soil type into blocks", required: true },
      { id: "random-within-blocks", description: "Random assignment of treatments WITHIN each block", required: true },
      { id: "response-measurement", description: "Measure and compare yield", required: false }
    ],
    scoringGuide: {
      E: "Blocking variable + grouping + random assignment within blocks",
      P: "Mentions blocking but incomplete procedure (missing randomization within blocks)",
      I: "No blocking mentioned OR completely wrong procedure"
    },
    commonMistakes: [
      "Blocking without random assignment within blocks",
      "Proposing more replication without blocking",
      "Confusing blocking with stratified sampling"
    ],
    contextFromVideo: `From Topic 3.6v1 (High Cholesterol): "By blocking, we could block according to exercise level. We can separate the volunteers into blocks based on reported exercise levels. And then within each block, we're going to perform our randomization." "Notice we block according to exercise level—and that blocking is done BEFORE the randomization is performed within each block."`
  },

  // Q55: Statistical Significance
  "reflect55": {
    questionText: "In a study comparing two medications, researchers found a statistically significant difference (p = 0.02). What does this mean, and what can we conclude about causation?",
    expectedElements: [
      { id: "significance-meaning", description: "p = 0.02 means only 2% chance of seeing this difference by random chance alone", required: true },
      { id: "not-by-chance", description: "Difference is unlikely to be due to chance variation", required: true },
      { id: "causation-requirement", description: "Can conclude causation IF random assignment was used", required: true },
      { id: "random-assignment-check", description: "Need to verify study used random assignment to treatments", required: false }
    ],
    scoringGuide: {
      E: "Correct interpretation of p-value AND connects to causation with random assignment caveat",
      P: "Partial interpretation (e.g., just 'not by chance' without p-value meaning) OR missing causation connection",
      I: "Misinterprets p-value OR wrong conclusion about causation"
    },
    commonMistakes: [
      "Saying p = 0.02 means 2% chance the null hypothesis is true",
      "Claiming causation without mentioning need for random assignment",
      "Confusing statistical significance with practical significance"
    ],
    contextFromVideo: `From Topic 3.7: "Random assignment allows us to conclude that very large observed changes are not merely by chance (statistically significant)." "The probability of having an outcome this extreme due to chance variation was a p-value of approximately zero... the type of name did indeed affect the callback rate." "Statistically significant differences between or among experimental treatment groups are evidence that the treatments caused the effect."`
  },

  // Q56: Conditions for Generalization
  "reflect56": {
    questionText: "Under what two conditions can the results of an experiment be generalized to a larger population?",
    expectedElements: [
      { id: "random-selection", description: "Random selection of experimental units from population", required: true },
      { id: "representative-sample", description: "OR experimental units are representative of the population", required: true },
      { id: "population-specification", description: "Results generalize to population from which sample was drawn", required: false }
    ],
    scoringGuide: {
      E: "Both conditions: random selection AND/OR representative sample",
      P: "Only one condition mentioned clearly",
      I: "Neither condition OR confuses with conditions for causation"
    },
    commonMistakes: [
      "Confusing generalization with causation (mentioning random assignment)",
      "Only mentioning random selection without representative alternative",
      "Saying large sample size is sufficient (it's not)"
    ],
    contextFromVideo: `From Topic 3.7: "If our experimental units are representative of the population, then our results can be generalized to the population of subjects similar to the ones that are in the study. And one way to help make that happen is by using random selection of individuals. That gives us a better chance that the sample will be representative of the population." From Framework VAR-3.E.4: "If the experimental units used in an experiment are representative of some larger group of units, the results can be generalized. Random selection of experimental units gives a better chance that the units will be representative."`
  },

  // Exit Ticket: Relationship between random assignment, statistical significance, and causation
  "exitTicket": {
    questionText: "In 2–3 sentences, explain the relationship between random assignment, statistical significance, and establishing causation in experiments.",
    expectedElements: [
      { id: "random-assignment-role", description: "Random assignment balances confounding variables across groups", required: true },
      { id: "significance-role", description: "Statistical significance indicates difference unlikely due to chance", required: true },
      { id: "causation-connection", description: "Together they allow causal conclusions: treatment caused the effect", required: true },
      { id: "chain-of-logic", description: "Shows logical connection between all three concepts", required: false }
    ],
    scoringGuide: {
      E: "All three concepts connected in logical chain showing how they lead to causation",
      P: "Two concepts connected OR all three mentioned without clear connection",
      I: "Missing key concepts OR fundamental misunderstanding of relationships"
    },
    commonMistakes: [
      "Treating the three concepts as independent rather than connected",
      "Confusing random assignment with random selection",
      "Claiming any significant result proves causation (without random assignment)"
    ],
    contextFromVideo: `From Topic 3.7: "Random assignment allows us to conclude that very large observed changes are not merely by chance (statistically significant). Statistically significant differences between or among experimental treatment groups are evidence that the treatments caused the effect." From Framework: "Because random assignment to treatments in an experiment tends to balance the effects of uncontrolled variables across groups, researchers can conclude that statistically significant differences in the response are caused by the effects of the treatments."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect53")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPrompt(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's response to a free-response question about experimental design and inference.

## Topic Context
Unit 3, Lessons 6-7: Selecting an Experimental Design & Inference and Experiments
Learning Objectives: ${LESSON_CONTEXT.learningObjectives.join('; ')}

## Key Vocabulary for This Topic
${Object.entries(LESSON_CONTEXT.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- Students may use synonyms (e.g., "chance" for "random")

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
function getRubric(questionId) {
  return REFLECTION_RUBRICS[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIds() {
  return Object.keys(REFLECTION_RUBRICS);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS = REFLECTION_RUBRICS;
  window.LESSON_CONTEXT = LESSON_CONTEXT;
  window.buildReflectionPrompt = buildReflectionPrompt;
  window.getRubric = getRubric;
  window.getReflectionQuestionIds = getReflectionQuestionIds;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS,
    LESSON_CONTEXT,
    buildReflectionPrompt,
    getRubric,
    getReflectionQuestionIds
  };
}

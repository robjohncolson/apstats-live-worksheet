/**
 * AI Grading Prompts for MIT 6.0001 Lecture 1: What is Computation?
 *
 * Based on MIT OpenCourseWare 6.0001 Introduction to Computer Science
 * and Programming in Python, Fall 2016, Instructor: Ana Bell
 *
 * Topics covered:
 * - Declarative vs. imperative knowledge
 * - Algorithms and their components
 * - Stored-program computer architecture
 * - Syntax, static semantics, and semantics
 * - Python objects, types, and operators
 * - Variable binding and assignment
 */

const LESSON_CONTEXT_MIT6001 = {
  course: "MIT 6.0001",
  lecture: 1,
  title: "What is Computation?",
  instructor: "Ana Bell",
  keyTopics: [
    "Declarative vs. imperative knowledge",
    "Algorithms: steps, flow of control, stopping condition",
    "Fixed-program vs. stored-program computers",
    "Turing completeness",
    "Syntax, static semantics, and semantics",
    "Error types: syntactic, static semantic, semantic/logical",
    "Python scalar types: int, float, bool, NoneType",
    "Expressions and operators",
    "Variable binding and assignment"
  ],
  keyVocabulary: {
    "algorithm": "A recipe for computation: sequence of steps, flow of control, and stopping condition",
    "declarative knowledge": "Statements of fact ('what is true')",
    "imperative knowledge": "Procedure for how to do something ('how to')",
    "syntax": "Rules for which strings/forms are legal in a language",
    "static semantics": "Which syntactically valid strings have meaning",
    "semantics": "The meaning of a syntactically valid expression",
    "binding": "Associating a variable name with a value in memory",
    "expression": "Combination of objects and operators that evaluates to a value",
    "stored-program computer": "A computer that treats instructions as data, allowing it to run different programs"
  },
  keyPrinciples: [
    "A computer only does what you tell it - it has no intuition or common sense",
    "Declarative knowledge tells WHAT, imperative knowledge tells HOW",
    "Computers need procedures (algorithms), not just facts",
    "Assignment (=) binds a name to a value; it's not mathematical equality",
    "Python evaluates the right side first, then binds the name",
    "Variables store values, not formulas - they don't auto-update",
    "Semantic errors are hardest to find because the program runs without crashing"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_MIT = {

  // R1: Why "a computer only does what you tell it" is important
  "reflect1": {
    questionText: "Why is 'a computer only does what you tell it' so important for beginners?",
    expectedElements: [
      { id: "no-intuition", description: "Computers have no intuition, common sense, or ability to infer intent", required: true },
      { id: "precise-instructions", description: "Programmers must give precise, explicit instructions", required: true },
      { id: "blame-the-code", description: "When something goes wrong, the error is in YOUR code/instructions, not the computer's fault", required: false },
      { id: "debugging-mindset", description: "Helps beginners adopt a debugging mindset rather than blaming the machine", required: false }
    ],
    scoringGuide: {
      E: "Explains that computers lack intuition AND that programmers must be precise/explicit with instructions",
      P: "Mentions one concept (no intuition OR need for precision) but not how they connect",
      I: "Does not address the fundamental limitation of computers or the need for explicit instructions"
    },
    commonMistakes: [
      "Focusing on speed/power of computers rather than their literal-mindedness",
      "Not connecting the concept to the programmer's responsibility",
      "Vague answers like 'computers are dumb' without explaining implications"
    ],
    contextFromVideo: `From the lecture: "A computer only knows what you tell it." The instructor emphasizes that computers cannot infer meaning or intent - they execute exactly what they're told, which means beginners must learn to give precise, unambiguous instructions.`
  },

  // R2: Why declarative knowledge isn't enough
  "reflect2": {
    questionText: "Explain why declarative knowledge is not enough for a computer to solve problems.",
    expectedElements: [
      { id: "declarative-is-facts", description: "Declarative knowledge is statements of fact (WHAT is true)", required: true },
      { id: "computers-need-procedure", description: "Computers need procedures/instructions (HOW to do something)", required: true },
      { id: "algorithm-required", description: "An algorithm (sequence of steps) is required to compute a result", required: true },
      { id: "example", description: "Provides or references an example (e.g., square root: knowing 'y is sqrt of x if y*y=x' vs. how to find y)", required: false }
    ],
    scoringGuide: {
      E: "Clearly distinguishes declarative (facts) from imperative (procedures) and explains why computers need procedures",
      P: "Mentions the distinction but doesn't clearly explain why procedures are necessary for computation",
      I: "Confuses declarative and imperative knowledge OR doesn't address why procedures are needed"
    },
    commonMistakes: [
      "Confusing declarative and imperative knowledge",
      "Not explaining WHY a procedure is needed (just saying 'computers need algorithms')",
      "Missing the connection between facts and actionable steps"
    ],
    contextFromVideo: `From the lecture: "Declarative knowledge is statements of fact... imperative knowledge is a recipe, how to." The example of square root: knowing that "y is the square root of x if y*y=x" is declarative, but to actually FIND the square root, you need a procedure like the Heron algorithm.`
  },

  // R3: Memory-binding model - why total doesn't change
  "reflect3": {
    questionText: "Using the memory-binding model, explain why total does not change after price is reassigned.",
    expectedElements: [
      { id: "value-not-formula", description: "Variables store VALUES, not formulas/expressions", required: true },
      { id: "evaluated-at-assignment", description: "The expression was evaluated at assignment time and the RESULT was stored", required: true },
      { id: "binding-is-snapshot", description: "total is bound to the computed value (108), not to the calculation 'price * (1 + tax_rate)'", required: true },
      { id: "no-auto-update", description: "Changing price later doesn't affect already-computed values", required: false }
    ],
    scoringGuide: {
      E: "Explains that total stores a value (not a formula), computed at assignment time, and doesn't auto-update",
      P: "Mentions that values are stored but doesn't fully explain why changes don't propagate",
      I: "Suggests total should update OR doesn't address the value vs. formula distinction"
    },
    commonMistakes: [
      "Thinking variables work like spreadsheet cells that auto-update",
      "Not specifying that the right side is evaluated FIRST",
      "Confusing assignment (=) with mathematical equality"
    ],
    contextFromVideo: `From the lecture: "The computer remembers the stored value, not the formula." Assignment evaluates the right side first, then binds the name. In the example, total = 100 * 1.08 = 108 is stored. When price becomes 120, total is still 108 because Python stored the NUMBER, not the expression.`
  },

  // R4: Hardest error type to find
  "reflect4": {
    questionText: "Which error type is hardest to find and fix: syntactic, static semantic, or semantic/logical? Why?",
    expectedElements: [
      { id: "semantic-hardest", description: "Semantic/logical errors are hardest to find", required: true },
      { id: "no-crash", description: "The program runs without crashing or error messages", required: true },
      { id: "wrong-output", description: "The program produces incorrect results silently", required: true },
      { id: "no-help-from-computer", description: "The computer can't detect the error because the code is technically valid", required: false },
      { id: "requires-testing", description: "Finding semantic errors requires careful testing and comparing expected vs. actual output", required: false }
    ],
    scoringGuide: {
      E: "Identifies semantic/logical errors as hardest AND explains that the program runs but gives wrong results with no error message",
      P: "Identifies semantic errors but explanation is incomplete (e.g., doesn't mention lack of error messages)",
      I: "Claims syntactic or static semantic errors are hardest OR doesn't understand error types"
    },
    commonMistakes: [
      "Thinking syntactic errors are hardest (they're actually caught by the interpreter immediately)",
      "Not distinguishing between 'program crashes' vs. 'program gives wrong answer'",
      "Confusing static semantic errors with semantic errors"
    ],
    contextFromVideo: `From the lecture: A syntactic error is immediately flagged by Python. A static semantic error (like "hi"5) is caught before running. But a semantic error means the program runs fine - it just doesn't do what you intended. "The program might crash during runtime... give you a wrong answer, or run forever."`
  },

  // Exit Ticket: Stored-program vs. fixed-program
  "exitTicket": {
    questionText: "Explain what distinguishes a stored-program computer from a fixed-program computer, and why this matters for programming.",
    expectedElements: [
      { id: "fixed-one-task", description: "Fixed-program computer can only do one specific task (e.g., calculator)", required: true },
      { id: "stored-treats-instructions-as-data", description: "Stored-program computer treats instructions as data that can be changed", required: true },
      { id: "flexibility", description: "This allows the same hardware to run many different programs", required: true },
      { id: "why-matters", description: "Explains why this matters: enables general-purpose computing, software can be written/modified", required: false }
    ],
    scoringGuide: {
      E: "Clearly explains fixed (one task) vs. stored (instructions as data) AND why this flexibility matters for programming",
      P: "Describes the difference but doesn't fully explain why it matters OR explanation is vague",
      I: "Confuses the concepts OR doesn't address why stored-program architecture is significant"
    },
    commonMistakes: [
      "Focusing on storage/memory size rather than the conceptual distinction",
      "Not explaining WHY treating instructions as data enables flexibility",
      "Missing the connection to writing software/programming"
    ],
    contextFromVideo: `From the lecture: "A fixed-program computer does one thing... A stored-program computer treats the sequence of instructions itself as data." This is the foundation of modern programming - the same hardware can run any program because instructions are just data that can be loaded, modified, and executed.`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptMIT(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_MIT[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are a computer science instructor grading a student's response to a reflection question about fundamental programming concepts.

## Course Context
MIT 6.0001: Introduction to Computer Science and Programming in Python
Lecture 1: What is Computation?
Instructor: Ana Bell

## Key Vocabulary for This Lecture
${Object.entries(LESSON_CONTEXT_MIT6001.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

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
- Students may use their own words to express concepts
- Introductory CS students may not use precise terminology

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
function getRubricMIT(questionId) {
  return REFLECTION_RUBRICS_MIT[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsMIT() {
  return Object.keys(REFLECTION_RUBRICS_MIT);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_MIT = REFLECTION_RUBRICS_MIT;
  window.LESSON_CONTEXT_MIT6001 = LESSON_CONTEXT_MIT6001;
  window.buildReflectionPromptMIT = buildReflectionPromptMIT;
  window.getRubricMIT = getRubricMIT;
  window.getReflectionQuestionIdsMIT = getReflectionQuestionIdsMIT;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_MIT,
    LESSON_CONTEXT_MIT6001,
    buildReflectionPromptMIT,
    getRubricMIT,
    getReflectionQuestionIdsMIT
  };
}

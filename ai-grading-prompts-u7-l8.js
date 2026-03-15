/**
 * AI Grading Prompts for Unit 7 Lesson 8: Setting Up a Test for the Difference of Two Population Means
 * Topic 7.8: Setting Up a Test for the Difference of Two Population Means
 *
 * Learning Objectives:
 *   State a null hypothesis for a test about the difference of two population means
 *   State an alternative hypothesis for a test about the difference of two population means
 *   Explain the null hypothesis as a statement of no treatment effect, no difference, or no change
 *   Distinguish between one-sided and two-sided alternative hypotheses based on context
 *   Explain how reversing the order of subtraction changes a one-sided inequality
 *   Write hypotheses using population parameters, not sample statistics, and define subscripts
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L8 = `
VIDEO 1 - Setting Up a Test for the Difference of Two Population Means (~6 min):
- Presenter: Mrs. Matamoros
- MAIN IDEAS:
  - Students learn how to state both the null hypothesis and the alternative hypothesis for a test about the difference of two population means
  - The null hypothesis represents the skeptical view: no treatment effect, no difference between groups, and no change
  - For a difference in means, the null can be written as the two means being equal or the difference equaling zero
  - The alternative hypothesis represents a treatment effect or a difference between groups and must use a strict inequality
  - A one-sided alternative is used for a directional claim about one mean being larger or smaller
  - A two-sided alternative is used when the claim is only that the two means are different
  - The direction of a one-sided inequality depends on the context and on the order in which the means are subtracted
  - If the subtraction order is reversed, the one-sided inequality must also reverse
  - Hypotheses must be written about population parameters, never sample statistics
  - Students should define any parameters or subscripts they use
- CONTAGIOUS YAWNING EXPERIMENT:
  - Three students tested the urban legend that yawning is contagious
  - From 27 volunteers, 14 were assigned to hear a bedtime story while the storyteller yawned occasionally
  - The other 13 heard the same story without any yawning by the storyteller
  - The response variable was the number of times each person yawned
  - The question was whether people yawn more, on average, when watching someone yawn
  - Let mu_Y be the true mean number of yawns for people exposed to someone yawning
  - Let mu_N be the true mean number of yawns for people not exposed to someone yawning
  - Null hypothesis in words: the mean number of yawns is the same in the two groups
  - Null hypothesis in symbols: H_0: mu_Y = mu_N or H_0: mu_Y - mu_N = 0
  - Alternative hypothesis in words: the mean number of yawns for the exposed group is greater than the mean for the non-exposed group
  - Alternative hypothesis in symbols: H_a: mu_Y > mu_N or H_a: mu_Y - mu_N > 0
  - It would not make sense to use H_a: mu_Y < mu_N or a two-sided alternative because the claim is specifically that exposure increases yawning
  - If the order were rewritten as mu_N - mu_Y, the correct one-sided alternative would be H_a: mu_N - mu_Y < 0
- TYPES OF ALTERNATIVES:
  - One-sided alternatives use > or < and are for directional claims
  - Two-sided alternatives use not equal to and are for claims of a difference without a stated direction
- PRACTICE MULTIPLE-CHOICE EXAMPLE:
  - A statistics major sampled 200 words from a chemistry textbook and 200 words from a physics textbook
  - The sample statistics were x-bar_C = 5.71, s_C = 3.02 and x-bar_P = 6.03, s_P = 3.58
  - The correct hypotheses for that proposed test used a two-sided alternative because the question asked whether the mean word lengths were different
  - Answer choice E was correct because it used the proper population parameters, equality in the null, and inequality in the alternative
  - Incorrect choices included hypotheses that used statistics, failed to use equality in the null, or used the wrong form of the alternative
- TAKEAWAYS:
  - The null is a statement of equality, usually that the difference in means is zero
  - The alternative always contains a strict inequality
  - Use context to decide whether the alternative is one-sided or two-sided
  - Define the parameters and keep the subtraction order consistent
  - Never write hypotheses using sample means or other statistics
`;

// Rubrics for each reflection question
window.RUBRICS_U7L8 = {
    reflect1: {
        questionText: "Explain how to write the null and alternative hypotheses for the contagious-yawning study. Define mu_Y and mu_N, describe the skeptic's view, write the hypotheses in words or symbols, and explain why the hypotheses must be about population parameters instead of sample statistics.",
        expectedElements: [
            { id: "define-parameters", description: "Defines mu_Y and mu_N as the true population mean number of yawns for the exposed and non-exposed groups", required: true },
            { id: "null-no-effect", description: "Explains that the null hypothesis represents no treatment effect, no difference, or no change", required: true },
            { id: "null-equality", description: "States a correct null hypothesis such as mu_Y = mu_N or mu_Y - mu_N = 0", required: true },
            { id: "alternative-directional", description: "States a correct directional alternative such as mu_Y > mu_N or mu_Y - mu_N > 0", required: true },
            { id: "yawn-more-context", description: "Connects the alternative to the contextual claim that people yawn more on average when watching someone yawn", required: true },
            { id: "parameters-not-statistics", description: "Explains that hypotheses must use population parameters rather than sample statistics like x-bar values", required: true },
            { id: "words-or-symbols", description: "May give both a verbal and symbolic version of the hypotheses", required: false },
            { id: "skeptic-language", description: "May explicitly describe the skeptic as shrugging off the claim or not expecting a treatment effect", required: false }
        ],
        scoringGuide: {
            E: "Response correctly defines the parameters, gives valid null and alternative hypotheses for the yawning study, and clearly explains that hypotheses are about population means rather than sample statistics",
            P: "Response shows the main setup idea but misses either a clear parameter definition, a fully correct hypothesis statement, or the explanation about parameters versus statistics",
            I: "Response gives incorrect hypotheses, uses statistics in the hypotheses, or does not connect the setup to the yawning context"
        },
        commonMistakes: [
            "Writing the null hypothesis with an inequality instead of equality",
            "Using sample means or other statistics in the hypotheses",
            "Failing to define mu_Y and mu_N in context",
            "Using a non-directional alternative when the claim is specifically that yawning increases",
            "Leaving the hypotheses disconnected from the population means"
        ],
        contextFromVideo: "The video uses the contagious-yawning experiment to show that the null is a statement of equality and the alternative is a directional claim about the true mean number of yawns."
    },

    reflect2: {
        questionText: "Explain how to decide whether an alternative hypothesis should be one-sided or two-sided. Use the contagious-yawning study and the chemistry-vs.-physics textbook practice problem to compare directional and non-directional claims, and explain how reversing the order of subtraction changes a one-sided inequality.",
        expectedElements: [
            { id: "one-sided-definition", description: "Explains that a one-sided alternative is used when the claim is directional and asks whether one mean is larger or smaller", required: true },
            { id: "yawning-direction", description: "Explains that the yawning study uses a one-sided alternative because the claim is that exposure increases the mean number of yawns", required: true },
            { id: "not-two-sided-yawning", description: "States that it would not make sense to use the opposite inequality or a two-sided alternative for the yawning study", required: true },
            { id: "two-sided-definition", description: "Explains that a two-sided alternative is used when the question is simply whether the means are different", required: true },
            { id: "textbook-example", description: "Uses the chemistry-vs.-physics textbook example as a two-sided test because the question asks whether the mean word lengths differ", required: true },
            { id: "reverse-order", description: "Explains that reversing the subtraction order reverses the direction of a one-sided inequality", required: true },
            { id: "not-equal-symbol", description: "May mention that a two-sided alternative uses the not-equal-to symbol", required: false },
            { id: "context-controls-direction", description: "May explicitly say that context determines the direction of the alternative hypothesis", required: false }
        ],
        scoringGuide: {
            E: "Response clearly distinguishes one-sided and two-sided alternatives, applies both examples correctly, and explains how reversing subtraction order changes a one-sided inequality",
            P: "Response understands the difference between one-sided and two-sided alternatives but leaves one example vague or does not clearly explain the subtraction-order issue",
            I: "Response confuses one-sided and two-sided alternatives, applies the wrong form to an example, or fails to explain the effect of reversing the subtraction order"
        },
        commonMistakes: [
            "Using a two-sided alternative when the claim has a specific direction",
            "Using a one-sided alternative when the question only asks whether the means differ",
            "Forgetting that reversing subtraction order also reverses the inequality",
            "Ignoring the role of context in choosing the alternative",
            "Claiming that the same inequality works after reversing the group order"
        ],
        contextFromVideo: "The video contrasts the directional yawning claim with a textbook example that requires a two-sided alternative and explicitly notes that reversing subtraction order reverses a one-sided inequality."
    },

    exitTicket: {
        questionText: "A statistics major wants to test whether chemistry and physics textbooks differ in mean word length. A random sample of 200 words from a chemistry textbook had x-bar_C = 5.71 letters and s_C = 3.02 letters. A random sample of 200 words from a physics textbook had x-bar_P = 6.03 letters and s_P = 3.58 letters. (a) Define mu_C and mu_P in context. (b) Write the null and alternative hypotheses for testing whether the textbooks differ in mean word length. (c) Explain why the alternative should be two-sided rather than one-sided. (d) Explain why the hypotheses should use parameters instead of the sample means 5.71 and 6.03.",
        expectedElements: [
            { id: "define-mu-c", description: "Defines mu_C as the true mean word length for the chemistry textbook population of words", required: true },
            { id: "define-mu-p", description: "Defines mu_P as the true mean word length for the physics textbook population of words", required: true },
            { id: "null-correct", description: "States a correct null hypothesis such as mu_C = mu_P or mu_C - mu_P = 0", required: true },
            { id: "alternative-correct", description: "States a correct two-sided alternative such as mu_C not equal mu_P or mu_C - mu_P not equal 0", required: true },
            { id: "two-sided-reason", description: "Explains that the alternative should be two-sided because the question asks whether the mean word lengths differ without specifying a direction", required: true },
            { id: "parameters-not-samples", description: "Explains that hypotheses should use population parameters rather than the sample means 5.71 and 6.03", required: true },
            { id: "consistent-order", description: "Uses a consistent subtraction order between the null and alternative hypotheses", required: false },
            { id: "statistics-descriptive", description: "May note that the sample means are descriptive statistics from the samples, not the parameters being tested", required: false }
        ],
        scoringGuide: {
            E: "Response correctly defines both parameters, writes valid null and two-sided alternative hypotheses, explains why the test is two-sided, and states why the hypotheses must use parameters instead of sample means",
            P: "Response gets most of the setup right but misses either one parameter definition, the reason for a two-sided alternative, or the explanation about parameters versus sample statistics",
            I: "Response gives incorrect hypotheses, uses the sample means in the hypotheses, or does not explain why the alternative is two-sided"
        },
        commonMistakes: [
            "Using the sample means 5.71 and 6.03 directly in the hypotheses",
            "Writing a one-sided alternative when the question asks whether the means differ",
            "Failing to define mu_C and mu_P in context",
            "Writing the null hypothesis without equality",
            "Mixing subtraction order between the null and alternative hypotheses"
        ],
        contextFromVideo: "The practice multiple-choice example in the video uses chemistry and physics textbook word lengths to show that a difference-without-direction question needs a two-sided alternative and population parameters."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L8 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L8[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Setting Up a Test for the Difference of Two Population Means.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L8}

REQUIRED ELEMENTS (must address for E score):
${requiredElements.map(e => `- ${e.description}`).join('\n')}

OPTIONAL ELEMENTS (strengthen response):
${optionalElements.map(e => `- ${e.description}`).join('\n')}

SCORING GUIDE:
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

COMMON MISTAKES TO WATCH FOR:
${rubric.commonMistakes.map(m => `- ${m}`).join('\n')}

CONTEXT FROM VIDEO:
${rubric.contextFromVideo}

Grade this response and provide:
1. A score (E, P, or I)
2. Brief feedback explaining the score
3. List of elements the student addressed correctly (matched)
4. List of elements that are missing or incorrect (missing)
5. A helpful suggestion for improvement (if not E)

Respond in JSON format:
{
    "score": "E|P|I",
    "feedback": "Brief explanation of score",
    "matched": ["element1", "element2"],
    "missing": ["element3"],
    "suggestion": "Helpful tip for improvement or null if E"
}`;
};

/**
 * Get the rubric for a specific question
 * @param {string} questionId - The ID of the question
 * @returns {object} The rubric object
 */
window.getRubricU7L8 = function(questionId) {
    return window.RUBRICS_U7L8[questionId];
};

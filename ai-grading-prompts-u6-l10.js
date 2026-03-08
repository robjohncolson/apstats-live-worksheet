/**
 * AI Grading Prompts for Unit 6 Lesson 10: Setting Up a Test for the Difference of Two Population Proportion
 * Topic 6.10: Setting Up a Test for the Difference of Two Population Proportion
 *
 * Learning Objectives:
 *   VAR-6.H - Identify null and alternative hypotheses for a difference of two population proportions
 *   VAR-6.I/VAR-6.J - Identify test method and verify conditions for a two-sample z test
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L10 = `
VIDEO 1 - Stating Null and Alternative Hypotheses (~9 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - This topic focuses on significance tests for a difference in two population proportions
  - Null hypotheses for this setting state equality/no difference: p1 = p2 or p1 - p2 = 0
  - Alternative hypotheses use strict inequalities and must match the research question: p1 > p2, p1 < p2, or p1 != p2
  - One-sided alternatives use > or <; two-sided alternatives use !=
  - The alternative should be chosen from the context/question before data collection
  - Hypotheses must use population parameters, not sample statistics (do not use p-hat values in H0 or Ha)
  - Parameters must be clearly defined in context
- EYE-DROP EXAMPLE:
  - Clinical trial compares azithromycin to placebo for pink-eye recovery
  - Data: 82/130 cured for azithromycin; 74/149 cured for placebo
  - Parameter definitions: p1 = true cure proportion for patients like these using azithromycin; p2 = true cure proportion using placebo
  - Appropriate hypotheses for "more effective" claim:
    - H0: p1 = p2 (or p1 - p2 = 0)
    - Ha: p1 > p2 (or p1 - p2 > 0)
- BRIGHT IDEA EXAMPLE:
  - Soltown vs Brightville sunglasses purchases
  - Because question asks for "a difference" without direction, use two-sided alternative:
    - H0: pS = pB (or pS - pB = 0)
    - Ha: pS != pB (or pS - pB != 0)

VIDEO 2 - Identifying Procedure and Checking Conditions (~9.5 min):
- MAIN IDEAS:
  - Appropriate test is a two-sample z test for a difference in population proportions
  - Applies to two independent random samples OR two groups in a randomized experiment
  - Before expected-count checks, compute pooled proportion under H0:
    - p-hat-c = (x1 + x2)/(n1 + n2)
- CONDITION CHECKS FOR RANDOM SAMPLES:
  - Independence: two independent random samples
  - 10% condition when sampling without replacement: n1 <= 10%N1 and n2 <= 10%N2
  - Large-count condition using pooled proportion:
    - n1*p-hat-c >= 10
    - n1*(1 - p-hat-c) >= 10
    - n2*p-hat-c >= 10
    - n2*(1 - p-hat-c) >= 10
- CONDITION CHECKS FOR RANDOMIZED EXPERIMENTS:
  - Independence from random assignment to two groups
  - Large-count condition still checked with pooled proportion
  - 10% condition does not apply to random assignment designs
- EYE-DROP CONDITION VALUES:
  - Pooled proportion: p-hat-c = (82 + 74)/(130 + 149) = 156/279 = 0.559
  - Expected counts: 72.67, 57.33, 83.29, 65.71 (all >= 10)
  - Conditions are met
- BRIGHT IDEA CONDITION VALUES:
  - Pooled proportion: (314 + 452)/(400 + 550) = 0.806
  - Expected counts: 322.4, 77.6, 444.3, 106.7 (all >= 10)
  - Random samples and 10% condition are reasonable; conditions are met
- TAKEAWAYS:
  - Write hypotheses with parameters and clear definitions
  - Pick one-sided vs two-sided from the question wording
  - Use the two-sample z test for difference in proportions
  - Verify independence and large counts using the pooled proportion
`;

// Rubrics for each reflection question
window.RUBRICS_U6L10 = {
    reflect1: {
        questionText: "In the pink-eye trial, define p1 and p2, then state appropriate null and alternative hypotheses to test whether azithromycin is more effective than placebo. Explain why your alternative is one-sided.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines p1 and p2 as true population cure proportions for patients like those in the study (azithromycin vs placebo)", required: true },
            { id: "null-hypothesis", description: "States a correct null hypothesis of equality/no difference: p1 = p2 or p1 - p2 = 0", required: true },
            { id: "alternative-hypothesis", description: "States the correct directional alternative for the claim 'more effective': p1 > p2 or p1 - p2 > 0", required: true },
            { id: "one-sided-justification", description: "Explains that the test is one-sided because the research claim is specifically greater than (not just different)", required: true },
            { id: "parameter-not-statistic", description: "Uses population parameters in hypotheses and does not write hypotheses with sample statistics (such as p-hat)", required: true },
            { id: "equivalent-notation", description: "May provide both equivalent forms (p1 vs p2 and p1 - p2 vs 0)", required: false }
        ],
        scoringGuide: {
            E: "Response correctly defines parameters, states valid H0 and directional Ha, and clearly justifies why the alternative is one-sided",
            P: "Response has the general idea but is incomplete in parameter definitions, hypothesis notation, or one-sided justification",
            I: "Response gives incorrect hypotheses, wrong direction, uses sample statistics in hypotheses, or omits major required components"
        },
        commonMistakes: [
            "Using sample proportions (p-hat) in H0 or Ha",
            "Writing H0 with an inequality instead of equality",
            "Using Ha: p1 != p2 when the claim is specifically 'more effective'",
            "Failing to define p1 and p2 in context",
            "Reversing the direction and writing p1 < p2"
        ],
        contextFromVideo: "Doug Tyson states that null hypotheses are equality statements and alternatives use strict inequalities that match the question. For the eye-drop claim 'more effective,' the lesson uses Ha: p1 > p2 and emphasizes defining parameters in context."
    },

    reflect2: {
        questionText: "For the sunglasses study (314/400 in Soltown and 452/550 in Brightville), identify the appropriate significance test and verify whether conditions are met. Include pooled proportion and expected-count reasoning.",
        expectedElements: [
            { id: "procedure", description: "Identifies the correct procedure as a two-sample z test for a difference in population proportions", required: true },
            { id: "pooled-proportion", description: "Computes or states pooled proportion p-hat-c = (314 + 452)/(400 + 550) = 0.806 (approximately)", required: true },
            { id: "independence", description: "Checks independence by noting two independent random samples (one from each city)", required: true },
            { id: "ten-percent", description: "Checks or discusses the 10% condition for both samples when sampling without replacement", required: true },
            { id: "large-counts", description: "Checks expected counts with pooled proportion: n1*p-hat-c, n1*(1-p-hat-c), n2*p-hat-c, n2*(1-p-hat-c), all at least 10", required: true },
            { id: "conditions-conclusion", description: "Concludes that conditions are met for using the test", required: true },
            { id: "numeric-expected-counts", description: "May include approximate expected counts 322.4, 77.6, 444.3, 106.7", required: false }
        ],
        scoringGuide: {
            E: "Response identifies the correct test and correctly verifies independence and large-count conditions using the pooled proportion, with a clear conditions-met conclusion",
            P: "Response identifies the test and some conditions correctly but is incomplete or vague about pooled-proportion calculations or condition checks",
            I: "Response uses the wrong procedure, omits key condition checks, or gives incorrect condition conclusions"
        },
        commonMistakes: [
            "Naming a confidence interval procedure instead of a significance test",
            "Checking counts with separate sample proportions instead of pooled proportion",
            "Skipping the 10% condition for random samples",
            "Checking only successes and not failures",
            "Stating conditions are met without evidence"
        ],
        contextFromVideo: "Video 2 identifies the two-sample z test for difference in proportions and demonstrates pooled-proportion and expected-count checks. For the sunglasses data, p-hat-c is 0.806 and all expected counts exceed 10."
    },

    exitTicket: {
        questionText: "A clinical trial compares two drops for pink eye. Of 130 patients randomly assigned to azithromycin drops, 82 were cured within one week. Of 149 patients randomly assigned to placebo drops, 74 were cured within one week. (a) Define parameters and state null and alternative hypotheses for testing whether azithromycin is more effective. (b) Identify the appropriate test procedure. (c) Compute the pooled proportion and verify whether expected-count conditions are met.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines p1 and p2 as true cure proportions for patients like those in the study under azithromycin and placebo", required: true },
            { id: "correct-hypotheses", description: "States H0: p1 = p2 (or p1 - p2 = 0) and Ha: p1 > p2 (or p1 - p2 > 0)", required: true },
            { id: "procedure", description: "Identifies a two-sample z test for a difference in population proportions", required: true },
            { id: "pooled-proportion", description: "Computes pooled proportion as (82 + 74)/(130 + 149) = 156/279 = 0.559 (approximately)", required: true },
            { id: "independence", description: "Checks independence via random assignment to two groups in the experiment", required: true },
            { id: "large-counts", description: "Verifies expected counts using pooled proportion are all at least 10 (about 72.67, 57.33, 83.29, 65.71)", required: true },
            { id: "conditions-conclusion", description: "Concludes conditions are met for conducting the significance test", required: true },
            { id: "ten-percent-note", description: "May note that 10% condition is for random-sample designs and not required for random assignment experiments", required: false }
        ],
        scoringGuide: {
            E: "Response correctly handles hypotheses, procedure identification, pooled-proportion calculation, and condition verification with an appropriate conclusion",
            P: "Response includes most major pieces but has incomplete setup, weak condition evidence, or minor errors in calculations/notation",
            I: "Response misstates hypotheses or procedure, omits pooled/condition checks, or gives incorrect overall setup"
        },
        commonMistakes: [
            "Using Ha: p1 != p2 instead of the directional claim Ha: p1 > p2",
            "Failing to define the parameters in context",
            "Not computing pooled proportion before expected-count checks",
            "Checking only two expected counts instead of all four",
            "Confusing experimental random assignment with random-sample 10% checks"
        ],
        contextFromVideo: "The lesson's eye-drop example uses a directional alternative for 'more effective,' pooled proportion 0.559, and expected counts all above 10. Random assignment plus large counts supports using the two-sample z test."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L10 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L10[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Setting Up a Test for the Difference of Two Population Proportion.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L10}

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
window.getRubricU6L10 = function(questionId) {
    return window.RUBRICS_U6L10[questionId];
};




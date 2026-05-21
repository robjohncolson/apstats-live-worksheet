/**
 * AI Grading Prompts for Unit 6 Lesson 11: Carrying Out a Test for the Difference of Two Population Proportions
 * Topic 6.11: Carrying Out a Test for the Difference of Two Population Proportions
 *
 * Learning Objectives:
 *   VAR-6.K - Calculate an appropriate test statistic for the difference of two population proportions
 *   DAT-3.C - Interpret the p-value of a significance test for a difference of two population proportions
 *   DAT-3.D - Justify a claim using a decision from a significance test
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U6L11 = `
VIDEO 1 - Calculating the Test Statistic and p-value (~10 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - The lesson focuses on carrying out a significance test for a difference in two population proportions
  - Students calculate an appropriate standardized test statistic and then a p-value
  - The standardized test statistic follows the general form (statistic - parameter) / standard error
  - For a two-sample z-test for a difference in proportions, use the pooled standard error because the null hypothesis assumes the population proportions are equal
  - The pooled proportion is p-hat-c = (X1 + X2) / (n1 + n2)
  - The p-value comes from the standard normal distribution
  - For a greater-than alternative, use the right tail; for a less-than alternative, use the left tail; for a not-equal alternative, use both tails
- EYE-DROP EXAMPLE:
  - Clinical trial comparing azithromycin drops and placebo drops for pink eye
  - Data: 82/130 cured with azithromycin and 74/149 cured with placebo
  - Difference in sample proportions: 0.134
  - Pooled proportion: p-hat-c = (82 + 74) / (130 + 149) = 156/279 = 0.559
  - Test statistic: z = 2.25
  - Because Ha: p1 > p2, the p-value is P(z >= 2.25) = 0.0122
- BRIGHT IDEA EXAMPLE:
  - Soltown vs Brightville sunglasses-purchase proportions
  - Data: 314/400 for Soltown and 452/550 for Brightville
  - Sample proportions: 0.785 and 0.822
  - Pooled proportion: 0.806
  - Test statistic: z = -1.42
  - Because Ha: pS != pB, the two-sided p-value is 0.1556

VIDEO 2 - Interpreting the p-value and Stating a Conclusion (~10 min):
- MAIN IDEAS:
  - A p-value interpretation must assume the null hypothesis is true
  - The p-value is the probability of getting a difference in sample proportions as extreme or more extreme than the observed one by chance alone
  - Interpretation wording depends on the alternative: "or greater," "or less," or "more different in either direction"
  - Small p-values indicate the result would be unlikely by chance alone if the null were true
  - If p-value <= alpha, reject H0 and say there is convincing statistical evidence for the alternative in context
  - If p-value > alpha, fail to reject H0 and say there is not convincing statistical evidence for the alternative in context
- EYE-DROP CONCLUSION:
  - With alpha = 0.05, p-value 0.0122 is less than 0.05
  - Reject H0
  - There is convincing statistical evidence that the azithromycin cure proportion is greater than the placebo cure proportion for patients like those in the study
- SUNGLASSES CONCLUSION:
  - With alpha = 0.10, p-value 0.1556 is greater than 0.10
  - Fail to reject H0
  - There is not convincing statistical evidence that the Soltown and Brightville population proportions differ
  - Failing to reject H0 does not prove the population proportions are equal

VIDEO 3 - A Complete Significance Test from Start to Finish (~8.5 min):
- AP EXAM SURVEY EXAMPLE:
  - In December 2008, 676 of 1009 randomly selected U.S. adults said "yes"
  - In December 2007, 622 of 1020 randomly selected U.S. adults said "yes"
  - Research question asks whether the proportion changed, so the alternative is two-sided
  - Parameters: p1 = proportion of all U.S. adults in December 2008 who would say yes; p2 = proportion of all U.S. adults in December 2007 who would say yes
  - If no significance level is given, use alpha = 0.05
  - Procedure: two-sample z-test for a difference in population proportions
  - Conditions:
    - Two independent random samples
    - Each sample is less than 10% of the relevant population
    - Use pooled proportion p-hat-c = (676 + 622) / (1009 + 1020) = 0.640
    - Expected counts: 645.76, 363.24, 652.8, and 367.2, all at least 10
  - Test statistic: z = 2.82
  - Two-sided p-value: 0.0048
  - Since 0.0048 < 0.05, reject H0
  - Conclusion: there is convincing statistical evidence that the proportion of U.S. adults who would respond yes changed from December 2007 to December 2008
- FULL TEST CHECKLIST:
  - State null and alternative hypotheses
  - Define parameters and direction of subtraction
  - Identify alpha if needed
  - Name the procedure
  - Verify conditions with evidence
  - Calculate pooled proportion, test statistic, and p-value
  - Make a conclusion in context
`;

// Rubrics for each reflection question
window.RUBRICS_U6L11 = {
    reflect1: {
        questionText: "In the pink-eye eye-drop study, explain how to calculate the pooled proportion, the standardized test statistic, and the p-value. Include the numerical results and explain why the p-value is found in the right tail. Then interpret the p-value in context.",
        expectedElements: [
            { id: "pooled-proportion", description: "Computes the pooled proportion as (82 + 74) / (130 + 149) = 156/279 = 0.559", required: true },
            { id: "test-statistic", description: "States or computes the standardized test statistic as z = 2.25 using the difference in sample proportions and pooled standard error", required: true },
            { id: "p-value", description: "States the p-value as 0.0122", required: true },
            { id: "right-tail-justification", description: "Explains that the p-value is a right-tail probability because the alternative is p1 > p2", required: true },
            { id: "p-value-interpretation", description: "Interprets the p-value by assuming the null hypothesis is true and describing the probability of getting a difference of 0.134 or greater by chance alone in the random assignment", required: true },
            { id: "context-language", description: "Uses context about azithromycin and placebo cure proportions for patients like those in the study", required: false }
        ],
        scoringGuide: {
            E: "Response correctly gives the pooled proportion, z statistic, and p-value, explains the right-tail choice, and interprets the p-value in context under the null hypothesis",
            P: "Response includes most major components but is incomplete or unclear about the calculation details, tail direction, or p-value interpretation",
            I: "Response has major errors in the calculation results, tail choice, or interpretation of the p-value"
        },
        commonMistakes: [
            "Using the separate sample proportions instead of the pooled proportion in the standard error",
            "Giving the wrong z statistic or p-value",
            "Using a two-sided or left-tail p-value when the alternative is greater than",
            "Interpreting the p-value as the probability that the null hypothesis is true",
            "Leaving the interpretation out of context"
        ],
        contextFromVideo: "The video computes p-hat-c = 0.559, z = 2.25, and p-value = 0.0122 for the eye-drop study, then emphasizes that the right tail is used because Ha: p1 > p2."
    },

    reflect2: {
        questionText: "For the Soltown vs Brightville sunglasses study, interpret the p-value of 0.1556 and state the conclusion at the alpha = 0.10 significance level. Explain why the conclusion is fail to reject H0 rather than saying the two population proportions are proven equal.",
        expectedElements: [
            { id: "null-assumption", description: "Begins the interpretation by assuming the null hypothesis is true, meaning the population proportions are equal or their difference is zero", required: true },
            { id: "two-sided-interpretation", description: "Interprets 0.1556 as the probability of getting a sample difference of -0.037 or one more different in either direction by chance alone in the random samples", required: true },
            { id: "compare-to-alpha", description: "Compares 0.1556 to alpha = 0.10 and notes that the p-value is larger", required: true },
            { id: "decision", description: "States the decision to fail to reject H0", required: true },
            { id: "context-conclusion", description: "Concludes there is not convincing statistical evidence that the Soltown and Brightville population proportions differ", required: true },
            { id: "not-proving-equality", description: "Explains that failing to reject H0 does not prove the population proportions are equal", required: true }
        ],
        scoringGuide: {
            E: "Response correctly interprets the two-sided p-value, compares it to alpha, gives the correct fail-to-reject decision, and explains why that does not prove equality",
            P: "Response has the general idea but is missing part of the interpretation, conclusion, or explanation about why fail to reject does not prove the null",
            I: "Response misinterprets the p-value, makes the wrong decision, or claims the test proves the population proportions are equal"
        },
        commonMistakes: [
            "Forgetting to assume the null hypothesis is true when interpreting the p-value",
            "Not mentioning that the result is two-sided or in either direction",
            "Rejecting H0 even though 0.1556 is greater than 0.10",
            "Saying the data prove the two city proportions are equal",
            "Leaving the conclusion out of context"
        ],
        contextFromVideo: "The video interprets 0.1556 as the probability of a sample difference of -0.037 or one more different in either direction by chance alone, then concludes fail to reject H0 at alpha = 0.10."
    },

    exitTicket: {
        questionText: "A school compares two study apps. In random samples, 84 of 120 students using App A met a benchmark, and 66 of 120 students using App B met the benchmark. Assume each sample is less than 10% of its population. The school wants to test whether App A has a higher true benchmark-success proportion than App B. (a) Define pA and pB, and state H0 and Ha in symbols. (b) Name the appropriate significance test and verify the conditions. (c) Compute the pooled proportion, the standardized test statistic, and the p-value. (d) State the conclusion at alpha = 0.05 in context.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines pA and pB as the true population benchmark-success proportions for students using App A and App B", required: true },
            { id: "hypotheses", description: "States H0 as pA = pB or pA - pB = 0 and Ha as pA > pB or pA - pB > 0", required: true },
            { id: "procedure", description: "Identifies the method as a two-sample z-test for a difference in population proportions", required: true },
            { id: "conditions", description: "Verifies conditions by citing random samples, the given 10% condition, and large counts using the pooled proportion", required: true },
            { id: "pooled-proportion", description: "Computes the pooled proportion as (84 + 66) / (120 + 120) = 150/240 = 0.625", required: true },
            { id: "expected-counts", description: "Checks expected counts with pooled proportion: 120(0.625)=75 and 120(0.375)=45 in each group, all at least 10", required: true },
            { id: "test-statistic", description: "Computes the standardized test statistic as z = 2.40", required: true },
            { id: "p-value", description: "Computes or states the right-tail p-value as about 0.0082", required: true },
            { id: "decision-and-conclusion", description: "Compares 0.0082 to alpha = 0.05, rejects H0, and concludes there is convincing statistical evidence that App A has a higher true success proportion", required: true },
            { id: "context-language", description: "Keeps the conclusion in context rather than only reporting a symbolic decision", required: false }
        ],
        scoringGuide: {
            E: "Response correctly sets up the full test, verifies conditions, computes the pooled proportion, z statistic, and p-value, and gives the correct conclusion in context",
            P: "Response includes most major parts but has minor computational errors, incomplete condition checks, or an unclear conclusion",
            I: "Response has major errors in the hypotheses, procedure, calculations, or decision, or omits major parts of the test"
        },
        commonMistakes: [
            "Using a two-sided alternative instead of a greater-than alternative",
            "Forgetting to use the pooled proportion in the standard error and expected counts",
            "Giving incorrect pooled proportion, z, or p-value calculations",
            "Not checking the large-count condition with expected successes and failures",
            "Failing to compare the p-value to alpha before stating the conclusion"
        ],
        contextFromVideo: "Video 3 emphasizes a complete test: hypotheses, alpha, named procedure, conditions with pooled counts, the z statistic and p-value, and then a conclusion based on comparing the p-value to alpha."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L11 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L11[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Carrying Out a Test for the Difference of Two Population Proportions.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L11}

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
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
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
window.getRubricU6L11 = function(questionId) {
    return window.RUBRICS_U6L11[questionId];
};

/**
 * AI Grading Prompts for Unit 6 Lesson 11: Carrying Out a Test for the Difference of Two Population Proportions
 * Topic 6.11: Carrying Out a Test for the Difference of Two Population Proportions
 *
 * Learning Objectives:
 *   VAR-6.K - Calculate the test statistic for a two-sample z test for a difference in population proportions
 *   DAT-3.C - Interpret the p-value for a significance test for a difference in population proportions
 *   DAT-3.D - Use p-value vs alpha to make and justify a contextual conclusion
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U6L11 = `
VIDEO 1 - Calculating Test Statistic and p-Value (~9 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - Topic focus: carrying out a significance test for a difference in two population proportions
  - Goals: calculate an appropriate z test statistic and calculate a p-value
  - Standardized test statistic form: (statistic - parameter) / standard error
  - For tests of H0: p1 = p2, use pooled proportion in the standard error
  - Pooled proportion formula: p-hat-c = (x1 + x2)/(n1 + n2)
  - p-value is found from the standard normal distribution using the direction of Ha
- EYE-DROP EXAMPLE (azithromycin vs placebo):
  - Data: 82/130 vs 74/149
  - Sample difference: p-hat1 - p-hat2 = 0.134
  - Pooled proportion: p-hat-c = (82 + 74)/(130 + 149) = 156/279 = 0.559
  - Test statistic: z = 2.25
  - Because Ha is greater-than, p-value uses right tail: P(Z >= 2.25) = 0.0122
- BRIGHT IDEA PRACTICE:
  - Data: Soltown 314/400, Brightville 452/550
  - p-hat-S = 0.785, p-hat-B = 0.822, pooled p-hat-c = 0.806
  - Test statistic: z = -1.42
  - Two-sided p-value: 2 * P(Z >= 1.42) = 0.1556

VIDEO 2 - Interpreting p-Value and Stating Conclusion (~9 min):
- MAIN IDEAS:
  - p-value interpretation must assume H0 is true
  - p-value measures probability of evidence as extreme or more extreme by chance alone
  - Template: assuming null true, probability of getting observed difference (or more extreme) in random assignment/samples
  - Decision rule:
    - If p-value <= alpha, reject H0 and claim convincing evidence for Ha
    - If p-value > alpha, fail to reject H0 and claim not convincing evidence for Ha
- EYE-DROP INTERPRETATION:
  - Assuming true difference (azithromycin - placebo) is 0,
    there is a 0.0122 probability of getting a sample difference of 0.134 or greater
    by chance alone in random assignment
  - With alpha = 0.05: reject H0, convincing evidence azithromycin is more effective
- BRIGHT IDEA INTERPRETATION/CONCLUSION:
  - Assuming true difference (Soltown - Brightville) is 0,
    there is a 0.1556 probability of getting -0.037 or one more different in either direction
    by chance alone in random samples
  - With alpha = 0.10: fail to reject H0, not convincing evidence of a difference

VIDEO 3 - Complete Significance Test Workflow (~8.5 min):
- MAIN IDEAS:
  - Perform a full significance test from hypotheses to conclusion
  - Include hypotheses, parameter definitions, significance level, procedure, conditions, calculations, and conclusion
  - If alpha is not given, use alpha = 0.05
- AP EXAM PRACTICE (2008 vs 2007 survey):
  - Data: 676/1009 (Dec 2008) vs 622/1020 (Dec 2007)
  - Research wording: "changed" implies two-sided alternative
  - Hypotheses: H0: p1 - p2 = 0 vs Ha: p1 - p2 != 0
  - Procedure: two-sample z test for a difference in population proportions
  - Conditions:
    - two independent random samples
    - 10% condition for each sample
    - pooled proportion p-hat-c = (676 + 622)/(1009 + 1020) = 0.640
    - expected counts: 645.76, 363.24, 652.8, 367.2 (all >= 10)
  - Test statistic: z = 2.82
  - p-value: 0.0048 (two-sided)
  - Decision at alpha = 0.05: reject H0
  - Conclusion: convincing statistical evidence the proportion responding yes changed from 2007 to 2008
`;

// Rubrics for each reflection question
window.RUBRICS_U6L11 = {
    reflect1: {
        questionText: "For the pink-eye study (82/130 vs 74/149), describe how to carry out the test statistic calculation for H0: p1 - p2 = 0, then interpret the p-value 0.0122 in context.",
        expectedElements: [
            { id: "procedure", description: "Identifies a two-sample z test for a difference in population proportions", required: true },
            { id: "pooled-proportion", description: "Computes or states pooled proportion p-hat-c = (82 + 74)/(130 + 149) = 0.559 (approximately)", required: true },
            { id: "test-statistic", description: "States or supports that the test statistic is z = 2.25 (from the pooled standard error setup)", required: true },
            { id: "null-assumption", description: "Interprets p-value under the assumption that the true difference (azithromycin minus placebo) is 0", required: true },
            { id: "contextual-probability", description: "Interprets 0.0122 as probability of getting a difference of 0.134 or greater by chance alone in random assignment", required: true },
            { id: "direction-link", description: "Connects the one-sided interpretation to the greater-than alternative", required: true },
            { id: "alpha-decision", description: "May include that 0.0122 < 0.05 so reject H0 and conclude convincing evidence azithromycin is more effective", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains pooled-z setup, references z = 2.25, and gives a correct contextual p-value interpretation under the null",
            P: "Response shows partial understanding but misses key calculation setup details or omits part of the p-value interpretation template",
            I: "Response misstates the test/statistic setup or gives an incorrect p-value interpretation that does not assume the null is true"
        },
        commonMistakes: [
            "Interpreting p-value as probability that the null hypothesis is true",
            "Failing to mention the null-assumption phrase in p-value interpretation",
            "Using a two-sided interpretation for this one-sided alternative",
            "Not using pooled proportion in the standard error setup",
            "Giving direction opposite to the claim (less than instead of greater than)"
        ],
        contextFromVideo: "Video 1 computes p-hat-c = 0.559, z = 2.25, and p-value = 0.0122; Video 2 models the full contextual p-value interpretation template for the eye-drop example."
    },

    reflect2: {
        questionText: "For the sunglasses study (314/400 vs 452/550), interpret p-value = 0.1556 and state the decision and conclusion at alpha = 0.10.",
        expectedElements: [
            { id: "null-assumption", description: "States interpretation assuming the true difference (Soltown minus Brightville) is 0", required: true },
            { id: "two-sided-extremes", description: "Describes two-sided extremeness (for example, -0.037 or one more different in either direction)", required: true },
            { id: "chance-language", description: "Uses chance-alone language tied to random samples", required: true },
            { id: "alpha-comparison", description: "Compares p-value 0.1556 to alpha 0.10 correctly", required: true },
            { id: "decision", description: "States fail to reject H0", required: true },
            { id: "contextual-conclusion", description: "Concludes there is not convincing statistical evidence of a difference in population proportions", required: true },
            { id: "two-sided-note", description: "May explicitly mention that Ha is not equal (two-sided)", required: false }
        ],
        scoringGuide: {
            E: "Response gives a correct null-based p-value interpretation and correctly makes the fail-to-reject conclusion at alpha = 0.10",
            P: "Response has the right general direction but is incomplete in interpretation language, alpha comparison, or contextual conclusion",
            I: "Response gives an incorrect decision, incorrect interpretation, or does not connect results to the population claim"
        },
        commonMistakes: [
            "Saying reject H0 even though 0.1556 > 0.10",
            "Treating the test as one-sided instead of two-sided",
            "Interpreting p-value as chance the alternative is true",
            "Missing contextual language about population proportions",
            "Forgetting to include random-samples chance wording"
        ],
        contextFromVideo: "Video 2 gives this exact example: p-value 0.1556 at alpha 0.10 leads to fail to reject H0 and no convincing evidence of a difference."
    },

    exitTicket: {
        questionText: "In 2008, 676 of 1009 randomly selected U.S. adults said yes to a TV-commercial question, while in 2007, 622 of 1020 said yes. (a) Define parameters and state hypotheses for whether the proportion changed. (b) Identify test and verify conditions. (c) Report test statistic and p-value, then conclude at alpha = 0.05.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines p1 and p2 as population yes-response proportions for 2008 and 2007, respectively", required: true },
            { id: "two-sided-hypotheses", description: "States H0: p1 = p2 (or p1 - p2 = 0) and Ha: p1 != p2 (or p1 - p2 != 0) because the claim is changed", required: true },
            { id: "significance-level", description: "Uses alpha = 0.05 when no significance level is stated", required: true },
            { id: "procedure", description: "Identifies the procedure as a two-sample z test for a difference in population proportions", required: true },
            { id: "independence", description: "Checks two independent random samples", required: true },
            { id: "ten-percent", description: "Checks or states the 10% condition for both samples", required: true },
            { id: "pooled-proportion", description: "Computes pooled proportion as (676 + 622)/(1009 + 1020) = 0.640 (approximately)", required: true },
            { id: "large-counts", description: "Verifies expected counts using pooled proportion are all at least 10", required: true },
            { id: "test-results", description: "Reports test statistic z = 2.82 and p-value = 0.0048", required: true },
            { id: "decision-conclusion", description: "Compares p-value to alpha, rejects H0, and concludes convincing evidence the population proportion changed", required: true },
            { id: "direction-clarity", description: "May explicitly state the subtraction order (2008 minus 2007) in the conclusion", required: false }
        ],
        scoringGuide: {
            E: "Response correctly completes all major steps of the significance test and gives a proper reject-H0 contextual conclusion",
            P: "Response includes most core steps but has minor omissions, weak condition evidence, or incomplete conclusion wording",
            I: "Response omits major steps, uses wrong hypotheses/procedure, or makes an incorrect decision/conclusion"
        },
        commonMistakes: [
            "Using a one-sided alternative when the question says changed",
            "Not defining parameters as population proportions",
            "Skipping pooled proportion before expected-count checks",
            "Not checking the 10% condition for random samples",
            "Failing to compare p-value with alpha in the formal decision"
        ],
        contextFromVideo: "Video 3 works this exact AP exam-style problem and reports p-hat-c = 0.640, z = 2.82, p-value = 0.0048, reject H0 at alpha = 0.05, and a contextual changed conclusion."
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
window.getRubricU6L11 = function(questionId) {
    return window.RUBRICS_U6L11[questionId];
};

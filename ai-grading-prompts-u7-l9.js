/**
 * AI Grading Prompts for Unit 7 Lesson 9: Carrying Out a Test for the Difference of Two Population Means
 * Topic 7.9: Carrying Out a Test for the Difference of Two Population Means
 *
 * Learning Objectives:
 *   Check whether the conditions for a test about the difference of two population means are satisfied
 *   Compute the test statistic for a two-sample t test using sample statistics
 *   Interpret the sign and magnitude of a test statistic in context
 *   Find and interpret a P-value for a test about the difference of two means
 *   Use the P-value to decide whether to reject or fail to reject the null hypothesis
 *   Write a conclusion in context and explain why failing to reject H0 does not prove the means are equal
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L9 = `
VIDEO 1 - Carrying Out a Test for the Difference of Two Population Means (~6 min):
- Presenter walks through the full process for carrying out a two-sample t test after the hypotheses have already been written
- MAIN IDEAS:
  - Students first check conditions, then calculate the test statistic, find the P-value, make a decision, and write a conclusion in context
  - The test uses a chemistry-vs.-physics textbook example about mean word lengths
  - Because the question asks whether the mean word lengths differ, the alternative hypothesis is two-sided
  - The null hypothesis sets the difference in population means equal to 0
  - Conditions include random sampling, independence within each sample using the 10% condition, and a large enough sample size or roughly normal distributions
  - The test statistic compares the observed sample difference to the null value of 0 using the estimated standard error
  - The sign of the test statistic depends on the order of subtraction used for the sample means
  - The P-value is found under the assumption that the null hypothesis is true
  - Decision-making depends on comparing the P-value to the significance level alpha
  - Failing to reject the null does not prove the population means are equal
- CHEMISTRY VS. PHYSICS TEXTBOOK EXAMPLE:
  - A statistics major sampled 200 words from a chemistry textbook and 200 words from a physics textbook
  - Sample statistics were x-bar_C = 5.71, s_C = 3.02 and x-bar_P = 6.03, s_P = 3.58
  - Parameters are mu_C and mu_P, the true mean word lengths for words in the chemistry and physics textbooks
  - Hypotheses: H_0: mu_C - mu_P = 0 and H_a: mu_C - mu_P != 0
  - Random condition: each sample should come from a random process
  - Independence condition: 200 words should be less than 10% of the words in each textbook
  - Large-sample condition: with n = 200 in each group, the sampling distribution is approximately normal
  - Observed difference: x-bar_C - x-bar_P = 5.71 - 6.03 = -0.32
  - Test statistic: about -0.97
  - The negative sign indicates the chemistry sample mean is lower than the physics sample mean when using chemistry minus physics
  - Two-sided P-value: about 0.33
  - Because 0.33 > 0.05, the correct decision is to fail to reject H_0
  - Conclusion: there is not convincing evidence that the mean word lengths of chemistry and physics textbooks differ
  - This result is not statistically significant at the 5% level
  - If the subtraction order were reversed, the test statistic sign would reverse, but the two-sided P-value would stay the same
- TAKEAWAYS:
  - Carrying out the test means checking conditions, computing the t statistic, finding the P-value, and making a context-based conclusion
  - The P-value is the probability, assuming the null is true, of getting a result at least as extreme as the one observed
  - A non-significant result does not prove that the population means are equal
`;

// Rubrics for each reflection question
window.RUBRICS_U7L9 = {
    reflect1: {
        questionText: "Explain how to carry out the two-sample t test for the chemistry-vs.-physics textbook example. Include the hypotheses, the conditions, how the test statistic is computed and interpreted, the approximate P-value, and the final decision at alpha = 0.05.",
        expectedElements: [
            { id: "correct-hypotheses", description: "States correct hypotheses such as mu_C - mu_P = 0 and mu_C - mu_P not equal 0", required: true },
            { id: "random-condition", description: "Checks or explains the random condition for each sample", required: true },
            { id: "independence-condition", description: "Checks or explains the independence or 10% condition", required: true },
            { id: "large-sample-condition", description: "Checks or explains that the sample sizes are large enough or the distributions are approximately normal", required: true },
            { id: "test-statistic-setup", description: "Explains that the test statistic compares the observed sample difference to 0 using the standard error of x-bar_C minus x-bar_P", required: true },
            { id: "observed-difference", description: "Uses or identifies the observed sample difference as -0.32", required: true },
            { id: "test-statistic-value", description: "Gives an approximate test statistic of about -0.97 and/or interprets the negative sign correctly", required: true },
            { id: "p-value", description: "Gives an approximate two-sided P-value of about 0.33", required: true },
            { id: "decision-conclusion", description: "States fail to reject H0 at alpha = 0.05 and concludes there is not convincing evidence that the mean word lengths differ", required: true },
            { id: "standard-error-language", description: "May explicitly name the denominator as the estimated standard error", required: false },
            { id: "statistical-significance", description: "May note that the result is not statistically significant at the 5% level", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states the hypotheses, checks the conditions, describes the test statistic and its value, gives the approximate P-value, and makes the correct fail-to-reject decision with a conclusion in context",
            P: "Response shows the main structure of the test but misses one major condition, a numerical summary, or the final decision and conclusion",
            I: "Response gives incorrect hypotheses, skips the key test steps, or makes the wrong decision or conclusion for the textbook example"
        },
        commonMistakes: [
            "Using a one-sided alternative even though the question asks whether the means differ",
            "Forgetting to check the 10% condition or the large-sample condition",
            "Using the sample means alone without describing the test statistic setup",
            "Giving the wrong decision by rejecting H0 even though the P-value is about 0.33",
            "Writing a conclusion that claims the means are proven equal"
        ],
        contextFromVideo: "The lesson carries out a two-sample t test for chemistry and physics textbook word lengths, leading to t about -0.97, P about 0.33, and a fail-to-reject decision."
    },

    reflect2: {
        questionText: "Explain how to interpret the P-value and the final conclusion in this example. Describe why the test is two-sided, what the negative test statistic means, and why failing to reject H0 does not prove that the population means are equal.",
        expectedElements: [
            { id: "p-value-meaning", description: "Explains that the P-value is the probability, assuming the null hypothesis is true, of getting a result at least as extreme as the one observed", required: true },
            { id: "two-sided-reason", description: "Explains that the test is two-sided because the question asks whether the mean word lengths differ without naming a direction", required: true },
            { id: "negative-sign", description: "Explains that the negative test statistic means the chemistry sample mean was lower than the physics sample mean because the subtraction was chemistry minus physics", required: true },
            { id: "compare-to-alpha", description: "Explains that the P-value is greater than 0.05, so the result is not statistically significant and we fail to reject H0", required: true },
            { id: "not-proof-equal", description: "Explains that failing to reject H0 does not prove the population means are equal; it only means there is not convincing evidence of a difference", required: true },
            { id: "contextual-conclusion", description: "States the conclusion in context about the population mean word lengths of chemistry and physics textbooks", required: true },
            { id: "reverse-order", description: "May mention that reversing the subtraction order would reverse the sign of the test statistic but not the two-sided P-value", required: false },
            { id: "sampling-language", description: "May emphasize that the sample evidence was not strong enough to rule out random variation", required: false }
        ],
        scoringGuide: {
            E: "Response clearly interprets the P-value, explains the two-sided setup and the negative sign, and gives the correct contextual conclusion without claiming the means are proven equal",
            P: "Response understands the basic meaning of the P-value and conclusion but leaves one interpretation incomplete or weakly connected to context",
            I: "Response misinterprets the P-value, confuses the sign or direction, or treats a fail-to-reject decision as proof that the means are equal"
        },
        commonMistakes: [
            "Describing the P-value as the probability that H0 is true",
            "Saying the test is one-sided when the question only asks whether the means differ",
            "Ignoring what the negative sign means for the chosen subtraction order",
            "Claiming that fail to reject H0 proves the two population means are equal",
            "Leaving the conclusion disconnected from chemistry and physics textbook word lengths"
        ],
        contextFromVideo: "The lesson emphasizes that the two-sided P-value is about 0.33, the test statistic is negative because of the subtraction order, and the final conclusion is a lack of convincing evidence rather than proof of equality."
    },

    exitTicket: {
        questionText: "A statistics major sampled 200 words from a chemistry textbook and 200 words from a physics textbook. The chemistry sample had x-bar_C = 5.71 letters and s_C = 3.02 letters. The physics sample had x-bar_P = 6.03 letters and s_P = 3.58 letters. Use alpha = 0.05. (a) State the null and alternative hypotheses for testing whether the textbooks differ in mean word length. (b) Check the conditions needed for a two-sample t test. (c) Compute or describe the test statistic and the approximate P-value. (d) State the decision and write a conclusion in context. (e) Explain why failing to reject H0 does not prove that the mean word lengths are equal.",
        expectedElements: [
            { id: "null-hypothesis", description: "States a correct null hypothesis such as mu_C - mu_P = 0", required: true },
            { id: "alternative-hypothesis", description: "States a correct two-sided alternative such as mu_C - mu_P not equal 0", required: true },
            { id: "conditions", description: "Checks the needed conditions, including random sampling, the 10% condition or independence, and a large sample or roughly normal distributions", required: true },
            { id: "test-statistic", description: "Gives or describes a test statistic of about -0.97 using the difference in sample means and the standard error", required: true },
            { id: "p-value", description: "Gives an approximate two-sided P-value of about 0.33", required: true },
            { id: "decision", description: "States the correct decision to fail to reject H0 at alpha = 0.05", required: true },
            { id: "context-conclusion", description: "Writes a conclusion in context that there is not convincing evidence that the textbook mean word lengths differ", required: true },
            { id: "not-proof-equal", description: "Explains that failing to reject H0 does not prove the population means are equal", required: true },
            { id: "negative-sign-meaning", description: "May explain that the negative sign comes from chemistry minus physics being negative in the sample", required: false },
            { id: "not-significant", description: "May note that the result is not statistically significant at the 5% level", required: false }
        ],
        scoringGuide: {
            E: "Response correctly sets up the two-sided test, checks the conditions, gives the approximate test statistic and P-value, makes the correct decision, and writes a valid contextual conclusion that does not overclaim",
            P: "Response gets most of the test correct but misses one of the conditions, one numerical result, or the explanation about why fail to reject is not proof of equality",
            I: "Response gives incorrect hypotheses, a wrong decision, or a conclusion that misstates what the sample evidence shows"
        },
        commonMistakes: [
            "Using a one-sided alternative instead of a two-sided one",
            "Skipping the conditions entirely or only naming one of them",
            "Reporting the wrong P-value or rejecting H0 at alpha = 0.05",
            "Writing a conclusion that says the textbooks definitely have the same mean word length",
            "Forgetting to state the conclusion in context"
        ],
        contextFromVideo: "The example in the lesson uses chemistry and physics textbook word lengths to model the full two-sample t test process from conditions to conclusion."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L9 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L9[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Carrying Out a Test for the Difference of Two Population Means.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L9}

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
window.getRubricU7L9 = function(questionId) {
    return window.RUBRICS_U7L9[questionId];
};

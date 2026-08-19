/**
 * AI Grading Prompts for Unit 8 Lesson 3: Carrying Out a Chi-Square Test for Goodness of Fit
 * Topic 8.3: Carrying Out a Chi-Square Test for Goodness of Fit
 *
 * Learning Objectives:
 *   Calculate the chi-square test statistic from observed and expected counts for a goodness-of-fit test
 *   Use technology or Table C to find or estimate a p-value from a chi-square distribution
 *   Interpret the p-value for a chi-square goodness-of-fit test in context
 *   State a statistical decision and conclusion in context by comparing the p-value to alpha
 *   Use contributions to identify which categories produce the largest discrepancy
 *   Perform a complete significance test for one categorical variable with multiple categories
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L3 = `
VIDEO 1 - Carrying Out the Mechanics of a Chi-Square Goodness-of-Fit Test (~9 min):
- Presenter explains how to calculate the chi-square test statistic and the p-value for a chi-square goodness-of-fit test
- MAIN IDEAS:
  - After hypotheses and conditions are established, the next step is the mechanics of the test
  - Expected counts come from multiplying the null-hypothesis proportions by the sample size
  - Differences are calculated as observed minus expected counts
  - The differences are squared to keep them positive and give more weight to larger deviations
  - Each squared difference is divided by the expected count to produce a category contribution
  - The chi-square test statistic is the sum of all contributions, written as sum of (Obs - Exp)^2 / Exp
  - Degrees of freedom depend on the number of categories minus one, not the sample size
  - Chi-square goodness-of-fit tests use the upper tail of the chi-square distribution for the p-value
  - Technology such as the TI-84 GOF-Test or chi-square cdf can produce the p-value directly
  - Table C only gives a range estimate for the p-value by locating where the test statistic falls among critical values
  - A chi-square statistic of 0 means a perfect fit between observed and expected counts
  - Larger chi-square statistics mean larger discrepancies and a worse fit to the null model
- PREDATORY LENDING EXAMPLE DETAILS:
  - Random sample of 40 predatory lending businesses in Dallas, Texas
  - Null proportions: p1 = 0.452, p2 = 0.292, p3 = 0.256
  - Observed counts: 20, 17, 3
  - Expected counts: 18.08, 11.68, 10.24
  - Obs - Exp differences: 1.92, 5.32, -7.24
  - Squared differences: 3.6864, 28.3024, 52.4176
  - Contributions: 0.20389, 2.42315, 5.11891
  - Observed chi-square statistic: 7.746
  - Degrees of freedom: 2 because there are 3 categories
  - TI-84 GOF-Test output gives p = 0.0207964003
  - Chi-square cdf with lower bound 7.746, upper bound 1000, and df = 2 gives the same p-value
  - Table C for df = 2 shows 7.746 lies between 7.38 and 7.82, so the p-value is between 0.025 and 0.02
- BATTLESHIP PRACTICE DETAILS:
  - Observed counts for quadrants 1 to 4 are 16, 22, 33, and 29
  - If no quadrant is preferred, expected counts are 25 in each category
  - Correct chi-square statistic is 6.8 with df = 3 and p = 0.07855316, which rounds to 0.079
  - A common mistake is using df = 4 instead of 3, which gives an incorrect p-value around 0.147

VIDEO 2 - Interpreting the P-Value and Stating a Conclusion (~9 min):
- Presenter explains how to interpret a chi-square goodness-of-fit p-value and how to write the conclusion of the test
- MAIN IDEAS:
  - The p-value is the probability of obtaining a result as extreme as the one in the study, or more extreme, by chance alone, assuming the null hypothesis is true
  - In a chi-square test, that means the probability of getting the observed chi-square statistic or greater from the upper tail
  - A conclusion has two parts: compare the p-value to alpha and make a decision about H0, then interpret what that says about Ha in context
  - If p-value <= alpha, reject H0 and say there is convincing statistical evidence for Ha in context
  - If p-value > alpha, fail to reject H0 and say there is not convincing statistical evidence for Ha in context
  - Context matters; the conclusion should be written about the actual categorical variable, not just symbols
  - Looking at category contributions helps identify where the largest discrepancy from the null model occurred
- PREDATORY LENDING INTERPRETATION DETAILS:
  - Test statistic from the previous video is chi-square = 7.746 and p-value = 0.0208
  - Using alpha = 0.05, the p-value is less than alpha, so H0 is rejected
  - Conclusion: there is convincing statistical evidence that the distribution of predatory lending businesses across Dallas income brackets is not the same as the household proportions in the specified brackets
  - The highest income bracket, $100,000 and above, has the largest contribution to the chi-square statistic
  - Because predatory lending businesses were represented much less than expected in the highest income bracket, the data suggest they tend to be located in lower income regions
- BATTLESHIP INTERPRETATION DETAILS:
  - A p-value of 0.079 means there is a 0.079 probability of getting results this extreme or more extreme by chance alone if the quadrant proportions are all the same
  - The correct interpretation uses the null hypothesis as the assumption, not the alternative
  - Incorrect interpretations include treating the p-value as a category proportion or as the probability that the null is true

VIDEO 3 - Performing a Complete Significance Test for One Categorical Variable (~9 min):
- Presenter works a full AP exam style free-response question about household participation across six city districts
- MAIN IDEAS:
  - For one sample and one categorical variable with multiple categories, the correct procedure is a chi-square goodness-of-fit test
  - A full significance test includes hypotheses and parameters, procedure and conditions, mechanics, and conclusion
  - Null hypotheses should give the actual category proportions and define what the parameters represent
  - Conditions are a random sample or randomized experiment, the 10% condition when sampling without replacement, and all expected counts greater than 5
  - Mechanics should include the test statistic, the degrees of freedom, and the p-value
  - Contributions can be used afterward to identify which category changed the most
- CITY DISTRICT EXAMPLE DETAILS:
  - Null proportions for districts A through F are 0.32, 0.12, 0.10, 0.27, 0.05, and 0.14
  - Observed counts are 100, 35, 40, 22, 12, and 31
  - Total sample size is 240 households
  - Expected counts are 76.8, 28.8, 24, 64.8, 12, and 33.6
  - All expected counts are greater than 5
  - Degrees of freedom are 5 because there are 6 categories
  - Calculator output gives chi-square = 47.48 and p-value = 4.53 x 10^-9, approximately 0
  - Since the p-value is far below alpha = 0.05, the null hypothesis is rejected
  - Conclusion: there is convincing statistical evidence that the district participation proportions are not the same as those used by the city
  - District D has the largest contribution, 28.27, so it had the greatest change in participation
`;

// Rubrics for each reflection question
window.RUBRICS_U8L3 = {
    reflect1: {
        questionText: 'Walk through the complete mechanics of the predatory lending chi-square GOF test. Include the hypothesized proportions, expected counts, chi-square statistic, degrees of freedom, p-value, and the conclusion at alpha = 0.05. Then explain which income bracket showed the largest discrepancy and what that tells us about where predatory lending businesses are located.',
        expectedElements: [
            { id: 'null-model', description: 'States the hypothesized Dallas household proportions 0.452, 0.292, and 0.256 for the three income brackets', required: true },
            { id: 'expected-counts', description: 'Gives expected counts 18.08, 11.68, and 10.24 for the sample of 40', required: true },
            { id: 'chi-square', description: 'Explains that the category contributions (Observed - Expected)^2 / Expected are summed and reports chi-square = 7.746', required: true },
            { id: 'degrees-freedom', description: 'States df = 3 - 1 = 2', required: true },
            { id: 'p-value', description: 'Reports the upper-tail p-value of about 0.0208', required: true },
            { id: 'decision-conclusion', description: 'Because 0.0208 < 0.05, rejects H0 and concludes there is convincing evidence that the distribution of predatory lending businesses is not the same as the specified Dallas household proportions', required: true },
            { id: 'largest-contribution', description: 'Identifies the $100,000-and-above bracket as having the largest contribution', required: true },
            { id: 'practical-meaning', description: 'Explains that predatory lending businesses were underrepresented in the highest-income areas relative to the null model', required: true }
        ],
        scoringGuide: {
            E: 'Response accurately gives the null-model proportions, expected counts, chi-square mechanics, df and P-value, makes the correct decision and contextual conclusion, and interprets the largest contribution.',
            P: 'Response shows a substantially correct GOF process but omits or weakly explains one major stage, the contextual conclusion, or the largest-contribution interpretation.',
            I: 'Response does not demonstrate the GOF test process and reaches an incorrect or unsupported conclusion.'
        },
        commonMistakes: [
            'Using equal proportions instead of 0.452, 0.292, and 0.256',
            'Omitting division by expected count in the contributions',
            'Using df = 3 instead of 2',
            'Failing to reject H0 even though 0.0208 < 0.05',
            'Choosing the category with the largest observed count instead of the largest contribution'
        ],
        contextFromVideo: 'The worksheet develops the predatory-lending GOF test from the Dallas household null proportions through chi-square = 7.746, df = 2, p = 0.0208, rejection at alpha = 0.05, and the highest-income bracket\'s largest contribution.'
    },

    reflect2: {
        questionText: 'Explain how to interpret a p-value for a chi-square goodness-of-fit test and how to state a conclusion. Use both the predatory lending result (p = 0.0208) and the Battleship result (p = 0.079) to illustrate the difference between rejecting and failing to reject the null hypothesis at alpha = 0.05.',
        expectedElements: [
            { id: 'p-value-template', description: 'Explains that a P-value is the probability, assuming H0 is true, of a chi-square result as large as or larger than the observed result', required: true },
            { id: 'predatory-interpretation', description: 'Interprets 0.0208 as the chance of chi-square 7.746 or greater under the specified Dallas household-proportion model', required: true },
            { id: 'predatory-decision', description: 'Compares 0.0208 to 0.05 and rejects H0', required: true },
            { id: 'predatory-conclusion', description: 'Concludes there is convincing evidence that the predatory-lending-business distribution differs from the specified household proportions', required: true },
            { id: 'battleship-interpretation', description: 'Interprets 0.079 as the chance of a result this extreme or more extreme if quadrant preferences are equally distributed', required: true },
            { id: 'battleship-decision', description: 'Compares 0.079 to 0.05 and fails to reject H0', required: true },
            { id: 'battleship-conclusion', description: 'Concludes there is not convincing evidence that Battleship players\' quadrant preferences differ from equal proportions', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly interprets a GOF P-value under H0 and accurately contrasts rejection for predatory lending with failure to reject for Battleship at alpha = 0.05, with contextual conclusions.',
            P: 'Response has the correct general P-value and decision logic but incompletely interprets or concludes for one of the two examples.',
            I: 'Response misinterprets P-values and does not make the correct reject/fail-to-reject comparison.'
        },
        commonMistakes: [
            'Saying the p-value is the probability that the null hypothesis is true',
            'Omitting as-extreme-or-more-extreme language',
            'Failing to reject H0 for predatory lending',
            'Rejecting H0 for Battleship',
            'Claiming that failing to reject proves equal quadrant preferences'
        ],
        contextFromVideo: 'The worksheet contrasts p = 0.0208 for predatory lending, which leads to rejection at alpha = 0.05, with p = 0.079 for Battleship, which leads to failure to reject.'
    },

    exitTicket: {
        questionText: 'The city summer program problem: a simple random sample of 240 households produced observed counts of 100, 35, 40, 22, 12, and 31 for districts A through F. The year-2000 proportions are 0.32, 0.12, 0.10, 0.27, 0.05, and 0.14. (a) State the null and alternative hypotheses. (b) Check the three conditions for inference, showing the expected counts. (c) Give the test statistic, degrees of freedom, and p-value. (d) State the conclusion in context at alpha = 0.05. (e) Which district had the greatest change in participation? Justify using contributions.',
        expectedElements: [
            { id: 'hypotheses', description: 'States H0 with the six specified district proportions and Ha that at least one district proportion differs', required: true },
            { id: 'parameter-definition', description: 'May define the parameters as the population participation proportions for districts A through F', required: false },
            { id: 'procedure', description: 'Identifies the procedure as a chi-square goodness-of-fit test for one sample and one categorical variable with six categories', required: true },
            { id: 'conditions', description: 'Checks the simple random sample condition, the 10% condition for n = 240, and that all expected counts are greater than 5', required: true },
            { id: 'expected-counts', description: 'Uses or reports the expected counts 76.8, 28.8, 24, 64.8, 12, and 33.6', required: true },
            { id: 'mechanics', description: 'Reports chi-square = 47.48, df = 5, and p-value = 4.53 x 10^-9 or approximately 0', required: true },
            { id: 'decision-and-conclusion', description: 'Rejects H0 at alpha = 0.05 and concludes that the district participation proportions are not the same as those used by the city', required: true },
            { id: 'district-d', description: 'Identifies District D as having the greatest change because it has the largest contribution, about 28.27', required: true },
            { id: 'sample-size', description: 'May mention that the total sample size is 240 households', required: false },
            { id: 'full-test-structure', description: 'May organize the answer into hypotheses, procedure/conditions, mechanics, and conclusion', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly gives the hypotheses, procedure and conditions, mechanics, conclusion, and identifies District D with contribution-based support.',
            P: 'Response shows most parts of the full chi-square test but misses one major condition, one numerical summary, or the contribution-based justification for District D.',
            I: 'Response gives the wrong procedure, missing or incorrect hypotheses, wrong mechanics, or an incorrect conclusion about the city district proportions.'
        },
        commonMistakes: [
            'Using df = 6 instead of 5',
            'Omitting the specific null proportions or failing to define the parameters',
            'Skipping the expected counts when checking conditions',
            'Failing to reject even though the p-value is essentially 0',
            'Choosing the district with the largest observed count instead of the district with the largest contribution'
        ],
        contextFromVideo: 'Video 3 models a full AP exam response for the city district example, including expected counts, chi-square = 47.48, df = 5, p-value about 0, rejection of H0, and District D as the largest contributor.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L3[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Carrying Out a Chi-Square Test for Goodness of Fit.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L3}

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
    'score': 'E', 'P', or 'I', // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    'feedback': 'Brief explanation of score',
    'matched': ['element1', 'element2'],
    'missing': ['element3'],
    'suggestion': 'Helpful tip for improvement or null if E'
}`;
};

/**
 * Get the rubric for a specific question
 * @param {string} questionId - The ID of the question
 * @returns {object} The rubric object
 */
window.getRubricU8L3 = function(questionId) {
    return window.RUBRICS_U8L3[questionId];
};

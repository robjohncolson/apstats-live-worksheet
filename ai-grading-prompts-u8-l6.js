/**
 * AI Grading Prompts for Unit 8 Lesson 6: Carrying Out a Chi-Square Test for Homogeneity or Independence
 * Topic 8.6: Carrying Out a Chi-Square Test for Homogeneity or Independence
 *
 * Learning Objectives:
 *   Calculate the chi-square test statistic for a chi-square test for homogeneity or independence
 *   Calculate degrees of freedom and a p-value for a chi-square test for homogeneity or independence
 *   Interpret the p-value in context for a chi-square test for homogeneity or independence
 *   State an appropriate conclusion based on the p-value and significance level
 *   Identify the largest contribution to the chi-square statistic in a follow-up analysis
 *   Perform a complete chi-square test for homogeneity or independence
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L6 = `
VIDEO 1 - Calculating the chi-square statistic and p-value (~10 min):
- Presenter explains how to carry out a chi-square test for homogeneity or independence after the hypotheses, procedure, and conditions are already set.
- MAIN IDEAS:
  - The two questions are how to calculate the chi-square test statistic and how to calculate the p-value.
  - The chi-square test statistic uses the same formula as the chi-square goodness-of-fit test: sum of (observed - expected)^2 / expected.
  - Each cell contributes a value to the chi-square statistic, and the contributions add to the final chi-square value.
  - The p-value is the probability of observing a chi-square statistic at least as large as the one observed, assuming the null hypothesis and probability model are true.
  - Degrees of freedom for a chi-square test for homogeneity or independence are calculated with df = (rows - 1)(columns - 1).
  - When counting rows and columns for degrees of freedom, do not include the total row or total column.
  - The p-value comes from the right tail of the chi-square distribution.
  - Table C gives an interval for the p-value, while technology such as chi-squared CDF gives the exact value.
- SCHOOL EXAMPLE DETAILS:
  - Context: parents with school-aged children were sampled in 2019 and again in 2020, and researchers wanted to compare the distribution of school type between the two years.
  - Procedure from earlier lessons: chi-square test for homogeneity.
  - Conditions were already checked and met.
  - Expected counts were 257.1, 171.9, 22.2, 14.8, 40.7, and 27.3.
  - The six contributions add to a chi-square statistic of 5.55.
  - The degrees of freedom are (3 - 1)(2 - 1) = 2.
  - Using Table C, the p-value is between 0.05 and 0.10.
  - Using chi-squared CDF on a calculator, the exact p-value is about 0.062.
- EMPLOYMENT EXAMPLE DETAILS:
  - Context: one random sample of 2000 adults with education level and employment status recorded.
  - Procedure from earlier lessons: chi-square test for independence.
  - Conditions were already checked and met.
  - The contributions add to a chi-square statistic of 14.30.
  - The degrees of freedom are (2 - 1)(3 - 1) = 2.
  - Using Table C, the p-value is between 0.0005 and 0.001.
  - Using technology, the exact p-value is about 0.0008.

VIDEO 2 - Interpreting the p-value and stating a conclusion (~10 min):
- Presenter explains how to interpret a chi-square p-value and how to write a conclusion in context.
- MAIN IDEAS:
  - The p-value measures how likely it is to get evidence for the alternative hypothesis as strong as or stronger than the observed evidence by chance alone when the null hypothesis is true.
  - Template for interpretation: assuming the null hypothesis is true, there is a p-value probability of getting a chi-square statistic of the observed value or greater by chance alone in the random sample or random assignment.
  - Conclusion depends on comparing the p-value with alpha.
  - If the p-value is less than or equal to alpha, reject the null hypothesis and say there is convincing statistical evidence for the alternative in context.
  - If the p-value is greater than alpha, fail to reject the null hypothesis and say there is not convincing statistical evidence for the alternative in context.
- SCHOOL CONCLUSION DETAILS:
  - Null hypothesis: there is no difference in the distribution of school types for school-aged children from 2019 to 2020.
  - Alternative hypothesis: there is a difference in the distribution of school types for school-aged children from 2019 to 2020.
  - Chi-square statistic: 5.55.
  - p-value: 0.062.
  - No significance level was given, so the video uses alpha = 0.05.
  - Because 0.062 > 0.05, fail to reject the null hypothesis.
  - Conclusion: there is not convincing statistical evidence that the distribution of school types differed from 2019 to 2020.
- EMPLOYMENT CONCLUSION DETAILS:
  - Null hypothesis: there is no association between education level and employment status for all adults.
  - Alternative hypothesis: there is an association between education level and employment status for all adults.
  - Chi-square statistic: 14.30.
  - p-value: 0.0008.
  - The conclusion is made at alpha = 0.01.
  - Because 0.0008 <= 0.01, reject the null hypothesis.
  - Conclusion: there is convincing statistical evidence of an association between education level and employment status for all adults.
- FOLLOW-UP ANALYSIS:
  - When a chi-square test is significant, it can make sense to look at the contributions.
  - The largest contribution in the employment example is 8.30.
  - That contribution comes from the unemployed / no high school diploma cell because the observed count of 14 is much larger than the expected count of 6.6.

VIDEO 3 - Performing a complete chi-square test (~7 min):
- Presenter works through a full AP exam style significance test about schizophrenia diagnosis age group and gender.
- MAIN IDEAS:
  - The phrase convincing statistical evidence signals that a full significance test is needed.
  - Because the question asks about association between two categorical variables in one random sample, the correct procedure is a chi-square test for independence.
  - Null hypothesis: age group at diagnosis and gender are independent, meaning not associated, for the population of people currently being treated for schizophrenia.
  - Alternative hypothesis: age group at diagnosis and gender are not independent, meaning associated, for that population.
  - If no significance level is given, use alpha = 0.05.
  - Conditions: random sample of 207 men and women, 10 percent condition, and all expected counts are at least 5.
  - The chi-square statistic is 10.884.
  - The degrees of freedom are (2 - 1)(4 - 1) = 3.
  - Technology gives a p-value of 0.012.
  - Because 0.012 < 0.05, reject the null hypothesis.
  - Conclusion: there is convincing statistical evidence of an association between age group at diagnosis and gender for the population currently being treated for schizophrenia.
  - A TI calculator can run chi-square test from the STAT TESTS menu after observed counts are entered in matrix A, and the expected counts are stored in matrix B.
- FINAL TAKEAWAY:
  - A complete chi-square test includes hypotheses, significance level, procedure, conditions, test statistic, p-value, and conclusion.
  - You do not need to interpret the p-value unless the question specifically asks for that interpretation.
`;

// Rubrics for each reflection question
window.RUBRICS_U8L6 = {
    reflect1: {
        questionText: 'Explain how to calculate the chi-square test statistic and p-value for a chi-square test for homogeneity or independence. Include observed and expected counts, the idea of contributions, the degrees of freedom formula, not counting totals in the degrees of freedom, using Table C or chi-squared CDF, and the school example values chi-square = 5.55, df = 2, and p-value = 0.062.',
        expectedElements: [
            { id: 'chi-square-formula', description: 'States that the chi-square statistic is computed by summing (observed minus expected) squared divided by expected across all cells', required: true },
            { id: 'contributions', description: 'Explains that each cell makes a contribution and the contributions add to the overall chi-square statistic', required: true },
            { id: 'observed-expected', description: 'Makes clear that both observed counts and expected counts are used in the calculation', required: true },
            { id: 'df-formula', description: 'States that degrees of freedom are calculated with (rows minus 1) times (columns minus 1)', required: true },
            { id: 'exclude-totals', description: 'States that the total row and total column are not counted when finding rows and columns for degrees of freedom', required: true },
            { id: 'p-value-methods', description: 'Explains that the p-value is found from the right tail of a chi-square distribution and can be estimated with Table C or found exactly with chi-squared CDF or other technology', required: true },
            { id: 'school-example', description: 'Uses the school example with chi-square statistic 5.55, degrees of freedom 2, and p-value about 0.062 or between 0.05 and 0.10', required: true },
            { id: 'employment-example', description: 'May mention the employment example with chi-square statistic 14.30 and a very small p-value of about 0.0008', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains how to compute the chi-square statistic and p-value, includes the degrees of freedom rule, and correctly ties the process to the school example values.',
            P: 'Response shows the main calculation process but misses one major element such as the degrees of freedom rule, excluding totals, or how the p-value is obtained.',
            I: 'Response gives an incorrect chi-square process, confuses observed and expected counts, or does not explain how to find the p-value.'
        },
        commonMistakes: [
            'Forgetting to divide by the expected count in each term',
            'Using only observed counts and leaving out expected counts',
            'Counting the total row or total column when finding degrees of freedom',
            'Describing the p-value as a left-tail or two-tail probability instead of a right-tail probability',
            'Leaving out the school example values from the explanation'
        ],
        contextFromVideo: 'The first video shows the full calculation path for the school and employment examples, including contributions, degrees of freedom, and p-value methods.'
    },

    reflect2: {
        questionText: 'Explain how to interpret a p-value and state a conclusion for a chi-square test for homogeneity or independence. Include assuming the null hypothesis is true, chance alone, comparing the p-value to alpha, fail to reject versus reject, the school example at alpha = 0.05, the employment example at alpha = 0.01, and the follow-up analysis idea of looking for the largest contribution.',
        expectedElements: [
            { id: 'interpretation-template', description: 'Explains that a p-value interpretation starts by assuming the null hypothesis is true', required: true },
            { id: 'chance-alone', description: 'States that the p-value is the probability of getting the observed chi-square statistic or greater by chance alone in the random sample or random assignment', required: true },
            { id: 'compare-to-alpha', description: 'Explains that the statistical decision is made by comparing the p-value to alpha', required: true },
            { id: 'large-pvalue', description: 'States that if the p-value is greater than alpha, fail to reject the null hypothesis and say there is not convincing statistical evidence for the alternative in context', required: true },
            { id: 'small-pvalue', description: 'States that if the p-value is less than or equal to alpha, reject the null hypothesis and say there is convincing statistical evidence for the alternative in context', required: true },
            { id: 'school-conclusion', description: 'Uses the school example: p-value 0.062 is greater than 0.05, so fail to reject and conclude there is not convincing statistical evidence of a difference in school-type distributions from 2019 to 2020', required: true },
            { id: 'employment-conclusion', description: 'Uses the employment example: p-value 0.0008 is less than or equal to 0.01, so reject and conclude there is convincing statistical evidence of an association between education level and employment status', required: true },
            { id: 'follow-up-analysis', description: 'Explains that follow-up analysis looks for the largest contribution, and in the employment example the largest contribution is 8.30 because the observed unemployed with no high school diploma count is much higher than expected', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly explains both p-value interpretation and statistical conclusion templates and accurately applies them to the school and employment examples, including follow-up analysis.',
            P: 'Response shows the main idea of interpreting a p-value and making a conclusion but misses one major part such as one example, the comparison to alpha, or the follow-up analysis detail.',
            I: 'Response misinterprets the p-value, gives the wrong reject or fail-to-reject decision, or does not connect the conclusion to the alternative hypothesis in context.'
        },
        commonMistakes: [
            'Saying the p-value is the probability that the null hypothesis is true',
            'Rejecting the null hypothesis when the p-value is larger than alpha',
            'Failing to state the conclusion in context of the problem',
            'Mixing up the school and employment conclusions',
            'Ignoring the largest contribution in the follow-up analysis'
        ],
        contextFromVideo: 'The second video provides the p-value interpretation template, the reject versus fail-to-reject templates, and the contribution-based follow-up analysis.'
    },

    exitTicket: {
        questionText: 'Use the schizophrenia age-group and gender example to describe a complete chi-square test for independence. Identify the procedure and why it fits, state H0 and Ha in context, state alpha = 0.05 if not given, verify the random sample condition, the 10 percent condition, and that all expected counts are at least 5, report chi-square = 10.884, df = 3, and p-value = 0.012, then state the decision and conclusion in context. You may also mention calculator support with matrix A, matrix B, and chi-square test.',
        expectedElements: [
            { id: 'procedure', description: 'Identifies the procedure as a chi-square test for independence because the problem asks about association between two categorical variables in one random sample', required: true },
            { id: 'null-hypothesis', description: 'States the null hypothesis that age group at diagnosis and gender are independent or not associated for the population of people currently being treated for schizophrenia', required: true },
            { id: 'alternative-hypothesis', description: 'States the alternative hypothesis that age group at diagnosis and gender are not independent or are associated for that population', required: true },
            { id: 'alpha', description: 'States that alpha = 0.05 can be used when no significance level is given', required: true },
            { id: 'conditions', description: 'Verifies the conditions using the random sample of 207 people, the 10 percent condition, and the fact that all expected counts are at least 5', required: true },
            { id: 'statistic-and-df', description: 'Reports the chi-square statistic 10.884 and degrees of freedom 3', required: true },
            { id: 'p-value', description: 'Reports the p-value of 0.012', required: true },
            { id: 'decision-and-conclusion', description: 'States that because 0.012 is less than 0.05 we reject the null hypothesis and conclude there is convincing statistical evidence of an association between age group at diagnosis and gender for the population currently being treated for schizophrenia', required: true },
            { id: 'calculator', description: 'May mention that a calculator can run chi-square test after observed counts are entered in matrix A and that expected counts are stored in matrix B', required: false },
            { id: 'interpretation-note', description: 'May mention that a p-value interpretation is not required unless the question specifically asks for it', required: false }
        ],
        scoringGuide: {
            E: 'Response includes the full structure of the significance test, correctly states the procedure and hypotheses, verifies the conditions, reports the test results, and gives the correct conclusion in context.',
            P: 'Response covers most of the complete test but misses one major element such as a condition, a hypothesis, the significance level, or the final contextual conclusion.',
            I: 'Response misidentifies the procedure, gives incorrect hypotheses or decision, or does not present the full significance-test setup accurately.'
        },
        commonMistakes: [
            'Calling the procedure homogeneity instead of independence',
            'Writing the null hypothesis as there is an association',
            'Leaving out alpha when it must be assumed from context',
            'Forgetting one of the three conditions',
            'Reporting the statistic or p-value incorrectly or giving the wrong final decision'
        ],
        contextFromVideo: 'The third video models a full AP exam style chi-square test for independence from start to finish using the schizophrenia example.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L6[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Carrying Out a Chi-Square Test for Homogeneity or Independence.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L6}

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
window.getRubricU8L6 = function(questionId) {
    return window.RUBRICS_U8L6[questionId];
};

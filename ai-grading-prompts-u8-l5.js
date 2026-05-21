/**
 * AI Grading Prompts for Unit 8 Lesson 5: Setting Up a Chi-Square Test for Homogeneity or Independence
 * Topic 8.5: Setting Up a Chi-Square Test for Homogeneity or Independence
 *
 * Learning Objectives:
 *   Identify whether a two-way table calls for a chi-square test for homogeneity or independence
 *   Explain how the study goal and data-collection method determine which chi-square test is appropriate
 *   State null and alternative hypotheses for a chi-square test for homogeneity
 *   State null and alternative hypotheses for a chi-square test for independence
 *   Verify the three conditions for performing a chi-square test for homogeneity or independence
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L5 = `
VIDEO 1 - Choosing the correct chi-square test and writing hypotheses (~8 min):
- Presenter explains how to set up a chi-square test for homogeneity or independence from a two-way table.
- MAIN IDEAS:
  - There are two significance tests for categorical data in a two-way table: chi-square test for homogeneity and chi-square test for independence.
  - The correct procedure depends on the goal of the study and how the data were collected.
  - If the goal is to compare distributions of one categorical variable across multiple populations or treatment groups, use a chi-square test for homogeneity.
  - Homogeneity uses independent random samples from each population or multiple groups within a randomized experiment.
  - If the goal is to determine whether two categorical variables are associated in one population, use a chi-square test for independence.
  - Independence uses one single random sample and measures both categorical variables for each individual.
  - For chi-square tests in this lesson, the hypotheses do not define a single numerical parameter.
- SCHOOL EXAMPLE DETAILS:
  - Context: parents with school-aged children sampled in 2019 and again in 2020 and asked what type of school their children attended.
  - Goal: compare the distribution of school type between the two years.
  - Procedure: chi-square test for homogeneity.
  - Null hypothesis: there is no difference in the distribution of school types attended by school-aged children from 2019 to 2020.
  - Alternative hypothesis: there is a difference in the distribution of school types attended by school-aged children from 2019 to 2020.
  - The alternative is many-sided because several category proportions could change.
- EMPLOYMENT EXAMPLE DETAILS:
  - Context: one random sample of 2000 adults with education level and employment status recorded.
  - Goal: decide whether education level and employment status are associated.
  - Procedure: chi-square test for independence.
  - Null hypothesis: there is no association between education level and employment status for all adults.
  - Alternate acceptable null wording: education level and employment status are independent for all adults.
  - Alternative hypothesis: there is an association between education level and employment status for all adults.
  - Alternate acceptable alternative wording: education level and employment status are not independent for all adults.

VIDEO 2 - Checking conditions for chi-square tests (~7 min):
- Before carrying out the procedure, verify the conditions for inference.
- In general, check for independence in the data-collection method and that the sampling distribution has the correct chi-square shape.
- THREE CONDITIONS:
  1. Use a stratified random sample or randomized experiment for homogeneity, or a single random sample for independence.
  2. If sampling without replacement, the sample size must be less than or equal to 10% of the population size.
  3. All expected counts must be greater than 5.
- IMPORTANT REMINDER:
  - Check expected counts, not observed counts.
- SCHOOL CONDITION CHECK:
  - There are two independent random samples, one from 2019 and one from 2020.
  - Sample sizes are 320 and 214, and it is reasonable that each is no more than 10% of its population.
  - Expected counts from the prior lesson are 257.1, 171.9, 22.2, 14.8, 40.7, and 27.3.
  - The smallest expected count is 14.8, so all expected counts are greater than 5.
  - Conclusion: the conditions are met.
- EMPLOYMENT CONDITION CHECK:
  - The 2000 adults were randomly selected.
  - It is reasonable that 2000 is no more than 10% of all adults.
  - Expected counts from the prior lesson are 213.4, 552.9, 1173.7, 6.6, 17.1, and 36.3.
  - All expected counts are greater than 5.
  - Conclusion: the conditions are met.
- FINAL TAKEAWAY:
  - Choose the test from the study goal and data collection, state the correct hypothesis language, and verify the three chi-square conditions before proceeding.
`;

// Rubrics for each reflection question
window.RUBRICS_U8L5 = {
    reflect1: {
        questionText: 'Explain how you choose between a chi-square test for homogeneity and a chi-square test for independence. Include the study goal, how the data are collected, comparing distributions across multiple populations or treatments versus checking association between two categorical variables, the school example as homogeneity with two separate random samples, and the employment example as independence with one random sample of 2,000 adults.',
        expectedElements: [
            { id: 'goal-matters', description: 'Explains that the choice of test depends on the goal of the study and how the data were collected', required: true },
            { id: 'homogeneity-purpose', description: 'States that homogeneity is used to compare distributions of one categorical variable across multiple populations or treatment groups', required: true },
            { id: 'homogeneity-collection', description: 'States that homogeneity uses independent random samples from each population or multiple groups in a randomized experiment', required: true },
            { id: 'independence-purpose', description: 'States that independence is used to decide whether two categorical variables are associated', required: true },
            { id: 'independence-collection', description: 'States that independence uses one random sample and measures both variables on each individual', required: true },
            { id: 'school-example', description: 'Identifies the school-type-by-year example as a chi-square test for homogeneity because there were separate random samples from 2019 and 2020', required: true },
            { id: 'employment-example', description: 'Identifies the education-level-by-employment example as a chi-square test for independence because one random sample of 2000 adults was used', required: true },
            { id: 'two-way-table', description: 'May mention that both situations are summarized in a two-way table of categorical data', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes homogeneity from independence using both the study goal and the data-collection method, and correctly applies each test to the school and employment examples.',
            P: 'Response gives the main difference between the two tests but misses one major part such as the data-collection method or one of the two examples.',
            I: 'Response confuses the two chi-square tests, describes the wrong goal or sampling method, or misclassifies the lesson examples.'
        },
        commonMistakes: [
            'Choosing homogeneity just because there are two variables instead of because distributions are compared across populations or groups',
            'Choosing independence even when separate random samples were taken from different populations',
            'Leaving out the role of data collection when deciding the procedure',
            'Mixing up the school example and the employment example',
            'Failing to mention that independence uses one random sample with both variables measured on each person'
        ],
        contextFromVideo: 'The first video contrasts the goals and sampling plans for the two chi-square procedures, then applies them to the school and employment examples.'
    },

    reflect2: {
        questionText: 'Explain how to write null and alternative hypotheses and how to check conditions for the chi-square tests in Topic 8.5. Include no difference in distribution for homogeneity, no association or independence for independence, the fact that no parameter is defined, why the homogeneity alternative is many-sided, the 10% condition, the rule that all expected counts must be greater than 5, and the reminder to check expected rather than observed counts.',
        expectedElements: [
            { id: 'homogeneity-hypotheses', description: 'States that for homogeneity the null says no difference in distributions and the alternative says there is a difference in distributions', required: true },
            { id: 'independence-hypotheses', description: 'States that for independence the null says no association or that the variables are independent, and the alternative says there is an association or that the variables are not independent', required: true },
            { id: 'no-parameter', description: 'Explains that these chi-square hypotheses do not define a single numerical parameter', required: true },
            { id: 'many-sided', description: 'Explains that the homogeneity alternative is many-sided because several category proportions could be higher or lower', required: true },
            { id: 'design-condition', description: 'States the data-collection condition: stratified random sample or randomized experiment for homogeneity, single random sample for independence', required: true },
            { id: 'ten-percent', description: 'States the 10% condition when sampling without replacement', required: true },
            { id: 'expected-counts', description: 'States that all expected counts must be greater than 5', required: true },
            { id: 'expected-not-observed', description: 'States that expected counts, not observed counts, are checked', required: true },
            { id: 'school-minimum', description: 'May mention that the smallest expected count in the school example is 14.8', required: false },
            { id: 'conditions-met', description: 'May explicitly conclude that the conditions are met in both lesson examples', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly states the hypothesis language for both chi-square tests and clearly explains the full set of conditions, including the 10% rule and checking expected counts greater than 5.',
            P: 'Response shows the general hypothesis and condition ideas but misses one major element such as the no-parameter point, the many-sided explanation, or one of the three conditions.',
            I: 'Response gives incorrect hypothesis language, confuses observed and expected counts, or does not explain the chi-square conditions accurately.'
        },
        commonMistakes: [
            'Writing hypotheses about a single proportion or mean instead of about distributions or association',
            'Forgetting that no parameter is defined in these chi-square hypotheses',
            'Leaving out the 10% condition for sampling without replacement',
            'Checking observed counts instead of expected counts',
            'Saying only some expected counts need to be above 5 rather than all of them'
        ],
        contextFromVideo: 'The first video establishes the hypothesis language for both tests, and the second video gives the three chi-square conditions and the warning to check expected counts rather than observed counts.'
    },

    exitTicket: {
        questionText: 'Use the two lesson contexts to explain the full setup for a chi-square test. (a) For the school-type-by-year study, identify the correct test and explain why. (b) State H0 and Ha for the school study. (c) Verify the three conditions for the school study using two independent random samples, the sample sizes 320 and 214, and the smallest expected count 14.8. (d) For the education-level-by-employment study, identify the correct test and explain why. (e) State H0 and Ha for the adult study, then verify the conditions using one random sample of 2,000 adults, the 10% condition, and the fact that all expected counts are greater than 5.',
        expectedElements: [
            { id: 'school-test', description: 'Identifies the school study as a chi-square test for homogeneity because it compares distributions across two years with separate random samples', required: true },
            { id: 'school-hypotheses', description: 'States the school-study hypotheses as no difference in distribution versus a difference in distribution of school type from 2019 to 2020', required: true },
            { id: 'school-condition-1', description: 'Checks that the school study used two independent random samples, which satisfies the design condition for homogeneity', required: true },
            { id: 'school-condition-2', description: 'Checks the 10% condition for the school sample sizes 320 and 214', required: true },
            { id: 'school-condition-3', description: 'Checks that the smallest expected count is 14.8, so all expected counts are greater than 5', required: true },
            { id: 'employment-test', description: 'Identifies the adult study as a chi-square test for independence because one random sample of 2000 adults was used to study association between two variables', required: true },
            { id: 'employment-hypotheses', description: 'States the adult-study hypotheses as no association or independence versus association or not independent between education level and employment status', required: true },
            { id: 'employment-conditions', description: 'Checks the adult-study conditions using one random sample, the 10% condition, and the fact that all expected counts are greater than 5', required: true },
            { id: 'expected-not-observed', description: 'May state that expected counts, not observed counts, are the values used in the third condition', required: false },
            { id: 'conditions-met', description: 'May explicitly conclude that the conditions are met in both contexts', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies both procedures, states the matching hypotheses, and verifies all three conditions for each context using the lesson details.',
            P: 'Response gets most of the setup right but misses one major piece such as a hypothesis pair, a condition check, or the reason one test is homogeneity while the other is independence.',
            I: 'Response misidentifies one or both chi-square procedures, gives incorrect hypotheses, or does not verify the conditions correctly.'
        },
        commonMistakes: [
            'Calling the school study independence instead of homogeneity',
            'Calling the adult study homogeneity instead of independence',
            'Writing the null as there is a difference or there is an association',
            'Forgetting to use the specific condition details 320, 214, 14.8, or the one random sample of 2000 adults',
            'Leaving out one of the three chi-square conditions'
        ],
        contextFromVideo: 'The exit ticket combines both lesson examples: choose the correct chi-square test, write the hypothesis language, and verify the three conditions using the specific details from each context.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L5[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Setting Up a Chi-Square Test for Homogeneity or Independence.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L5}

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
window.getRubricU8L5 = function(questionId) {
    return window.RUBRICS_U8L5[questionId];
};

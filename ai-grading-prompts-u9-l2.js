/**
 * AI Grading Prompts for Unit 9 Lesson 2: Confidence Intervals for the Slope of a Regression Model
 * Topic 9.2: Confidence Intervals for the Slope of a Regression Model
 *
 * Learning Objectives:
 *   Identify the conditions needed for valid confidence intervals and significance tests for slope
 *   Describe the shape, center, and variability of the sampling distribution of the slope
 *   Verify conditions for inference about slope using sample data and collection details
 *   Explain why a t-interval is used and how sample statistics estimate unknown population values
 *   Calculate a confidence interval for slope and describe what affects its width
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U9L2 = `
VIDEO 1 - Conditions and the sampling distribution of slope (~9 min):
- The lesson asks what conditions the population regression model must meet for valid confidence intervals and significance tests for slope.
- The Old Faithful example returns: July 1995 is the full population of 262 eruptions and July 2019 is a random sample of 25 eruptions.
- The July 1995 population regression model is predicted wait time = 33.34 + 13.29(duration).
- The July 2019 sample regression line is predicted wait time = 62.95 + 7.79(duration).
- The goal is to make an inference about the slope of the population regression line in 2019.
- Repeated random samples of 25 eruptions from the 1995 population produce a simulated sampling distribution of sample slopes.
- That simulated sampling distribution is approximately normal, has mean 13.29, and standard deviation 1.10.
- The population regression model has form mu_y = alpha + beta x.
- Valid confidence intervals and significance tests for slope require three conditions:
  - The true relationship between x and y is linear.
  - The standard deviation of the y-values is the same for all x-values.
  - For a particular x-value, the responses are approximately normally distributed.
- When those conditions are met, the sampling distribution of the sample slope b is approximately normal.
- Its center is the true slope beta.
- Its variability is sigma_b = sigma / (sigma_x * sqrt(n)), if the sample size is no more than 10% of the population size.
- In the 1995 population, sigma = 6.47, sigma_x = 1.18, n = 25, and the 10% condition is satisfied because 25 <= 0.10(262) = 26.2.

VIDEO 2 - Choosing the procedure and checking conditions (~8 min):
- We want a confidence interval for the slope of the population regression line in 2019 using only the sample data.
- The 2019 scatterplot shows a moderately weak, positive, linear relationship between duration and wait time.
- The residual plot shows random scatter about the zero line and no leftover curved pattern.
- The scatterplot and residual plot show roughly similar spread across the x-values.
- A dotplot of residuals shows no obvious skewness or outliers.
- If there are clear departures from normality, the sample size should be greater than 30.
- The data came from a random sample of 25 eruptions.
- Independence is justified with the 10% condition when sampling without replacement.
- The sample standard deviation of the x-values is s_x = 0.213, which is used to estimate sigma_x.
- The sample standard deviation of the residuals is s = 4.2097, which is used to estimate sigma.
- The correct procedure is a t-interval for the slope because sigma is estimated with the sample residual standard deviation.

VIDEO 3 - Calculating the confidence interval (~10 min):
- Confidence interval = point estimate +/- margin of error.
- Margin of error = (critical value)(standard error).
- For slope, the interval is b +/- t*SE_b.
- The standard error of the slope is SE_b = s / (s_x * sqrt(n - 1)).
- Critical values come from a t distribution with degrees of freedom n - 2.
- For the Old Faithful sample, n = 25, so df = 23.
- For a 95% confidence interval, t* = 2.069.
- The sample slope is b = 7.79.
- The standard error of the slope is 4.03.
- The margin of error is 8.34.
- The 95% confidence interval for the population slope is -0.55 to 16.13.
- Confidence intervals get narrower when the sample size increases or when the confidence level decreases.
- In the practice problem about rubber band airplanes, n = 16, b = 0.04625, SE_b = 0.01565, df = 14, t* = 2.145, and the correct interval form is 0.04625 +/- (2.145)(0.01565).
`;

// Rubrics for each reflection question
window.RUBRICS_U9L2 = {
    reflect1: {
        questionText: 'Explain how the population regression model conditions determine the shape, center, and variability of the sampling distribution of the slope. Include the three conditions, the idea that the sampling distribution is approximately normal, that its center is the true slope beta, the formula sigma_b = sigma / (sigma_x sqrt(n)), and the Old Faithful values 13.29 and 1.10.',
        expectedElements: [
            { id: 'linear-condition', description: 'States that the true relationship between x and y must be linear', required: true },
            { id: 'equal-variance-condition', description: 'States that the standard deviation of the y-values must stay the same for all x-values', required: true },
            { id: 'normal-condition', description: 'States that for a particular x-value the responses are approximately normally distributed', required: true },
            { id: 'normal-shape', description: 'Explains that when the conditions are met, the sampling distribution of the sample slope is approximately normal', required: true },
            { id: 'center-beta', description: 'Explains that the center of the sampling distribution is the true population slope beta', required: true },
            { id: 'variability-formula', description: 'Gives or correctly describes the variability formula sigma_b = sigma / (sigma_x sqrt(n))', required: true },
            { id: 'old-faithful-values', description: 'Includes the Old Faithful values mean 13.29 and standard deviation 1.10 for the simulated sampling distribution', required: true },
            { id: 'ten-percent', description: 'May mention the 10% condition when sampling without replacement', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly connects the three population model conditions to the approximately normal sampling distribution of slope, its center at beta, and its variability formula, while using the Old Faithful values accurately.',
            P: 'Response gives the main relationship between conditions and the sampling distribution but misses one major element such as one of the conditions, the center at beta, the variability formula, or the Old Faithful values.',
            I: 'Response does not accurately explain how the conditions relate to the sampling distribution of slope or gives a substantially incorrect account of the shape, center, or variability.'
        },
        commonMistakes: [
            'Listing only one or two of the three required population regression model conditions',
            'Saying the sampling distribution is always normal without tying that to the conditions being met',
            'Failing to say that the center of the sampling distribution is beta',
            'Leaving out the variability formula or confusing it with a confidence interval formula',
            'Omitting the Old Faithful values 13.29 and 1.10'
        ],
        contextFromVideo: 'Video 1 explicitly links the three population regression model conditions to the sampling distribution of the slope and gives the Old Faithful values mean 13.29 and SD 1.10.'
    },

    reflect2: {
        questionText: 'Explain how the 2019 Old Faithful sample is used to justify and set up a t-interval for slope. Include checking the scatterplot and residual plot, the random sample idea, using s_x = 0.213 to estimate sigma_x, using s = 4.2097 to estimate sigma, and why a t-interval is used.',
        expectedElements: [
            { id: 'scatterplot-linearity', description: 'Uses the scatterplot and/or residual plot to say the relationship looks linear and there is no leftover curved pattern', required: true },
            { id: 'equal-spread', description: 'Explains that the spread appears roughly similar across x-values', required: true },
            { id: 'residual-normality', description: 'States that the residuals show no obvious skewness or outliers, or explains the normality check', required: true },
            { id: 'random-sample', description: 'States that the data came from a random sample of 25 eruptions', required: true },
            { id: 'estimate-sigma-x', description: 'Explains that s_x = 0.213 is used to estimate sigma_x', required: true },
            { id: 'estimate-sigma', description: 'Explains that s = 4.2097 is used to estimate sigma', required: true },
            { id: 't-interval-reason', description: 'States that the correct procedure is a t-interval for slope because sigma is estimated using sample information', required: true },
            { id: 'independence', description: 'May mention independence and the 10% condition', required: false },
            { id: 'n-greater-than-30', description: 'May mention that if there are clear departures from normality, the sample size should be greater than 30', required: false }
        ],
        scoringGuide: {
            E: 'Response accurately explains how the sample graphs and collection method justify inference, shows how s_x and s estimate unknown population values, and explains why a t-interval is the correct procedure.',
            P: 'Response describes the basic setup for the t-interval but misses one major element such as a key condition check, the role of s_x or s, or the reason for using a t-interval.',
            I: 'Response gives an incorrect procedure, does not explain the sample-based condition checks, or does not connect the sample statistics to the t-interval setup.'
        },
        commonMistakes: [
            'Ignoring the residual plot when discussing linearity',
            'Leaving out the equal-spread or normality check',
            'Confusing s_x with s or swapping what each one estimates',
            'Saying z-interval instead of t-interval',
            'Forgetting to mention that the data came from a random sample'
        ],
        contextFromVideo: 'Video 2 uses the 2019 scatterplot, residual plot, and residual dotplot to check conditions, then uses s_x = 0.213 and s = 4.2097 to set up a t-interval for slope.'
    },

    exitTicket: {
        questionText: 'Use the 2019 Old Faithful sample to describe how a 95% confidence interval for slope is calculated. Identify the procedure and why it is appropriate, state the point estimate, degrees of freedom, and critical value, report the standard error and margin of error, give the final interval, and explain one change that would make the interval narrower.',
        expectedElements: [
            { id: 'procedure', description: 'Identifies the procedure as a t-interval for the slope of a population regression line', required: true },
            { id: 'why-appropriate', description: 'Explains that the procedure is appropriate because the conditions are satisfied and sigma is estimated from sample data', required: true },
            { id: 'point-estimate', description: 'States that the point estimate is the sample slope b = 7.79', required: true },
            { id: 'df-and-critical', description: 'Gives df = 23 and t* = 2.069 for the 95% interval', required: true },
            { id: 'se-and-me', description: 'Reports the standard error 4.03 and the margin of error 8.34', required: true },
            { id: 'final-interval', description: 'Gives the final interval -0.55 to 16.13', required: true },
            { id: 'narrower-interval', description: 'Explains that a larger sample or a lower confidence level would make the interval narrower', required: true },
            { id: 'sample-based-estimates', description: 'May mention that s_x = 0.213 estimates sigma_x and s = 4.2097 estimates sigma', required: false },
            { id: 'conditions', description: 'May summarize the graphical and data-collection conditions that were checked', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly walks through the full calculation setup for the 95% confidence interval, includes the correct numerical ingredients, and explains how to make the interval narrower.',
            P: 'Response includes most of the interval setup and calculation ideas but misses one major element such as the correct procedure, the critical value, the margin of error, the final interval, or the interval-width idea.',
            I: 'Response gives an incorrect interval procedure or fails to provide the main numerical components needed to calculate the confidence interval.'
        },
        commonMistakes: [
            'Using the intercept instead of the slope as the point estimate',
            'Giving the wrong degrees of freedom or critical value',
            'Confusing standard error with margin of error',
            'Leaving out the final interval or reporting the wrong endpoints',
            'Saying the interval gets narrower by increasing the confidence level'
        ],
        contextFromVideo: 'Video 3 computes the interval using b = 7.79, SE = 4.03, df = 23, t* = 2.069, margin of error 8.34, and final interval -0.55 to 16.13, then explains what makes intervals narrower.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU9L2 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U9L2[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Confidence Intervals for the Slope of a Regression Model.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U9L2}

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
window.getRubricU9L2 = function(questionId) {
    return window.RUBRICS_U9L2[questionId];
};

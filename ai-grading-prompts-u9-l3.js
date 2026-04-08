/**
 * AI Grading Prompts for Unit 9 Lesson 3: Justifying a Claim About the Slope of a Regression Model Based on a Confidence Interval
 * Topic 9.3: Justifying a Claim About the Slope of a Regression Model Based on a Confidence Interval
 *
 * Learning Objectives:
 *   Interpret a confidence interval for the slope of a population regression line in context
 *   Interpret the meaning of a confidence level for slope using repeated random sampling
 *   Use a confidence interval to justify a claim about the slope of a regression model
 *   Determine how including or excluding a claimed slope value affects the conclusion
 *   Construct, calculate, interpret, and evaluate a confidence interval for slope from regression output
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U9L3 = `
VIDEO 1 - Interpreting a confidence interval and justifying a claim (~7 min):
- The lesson asks how to interpret a confidence interval for the slope of a population regression line and how to justify a claim based on a confidence interval for slope.
- The Old Faithful example returns from Topic 9.2.
- In July 2019, a random sample of 25 Old Faithful eruptions was used to study wait time and eruption duration.
- The 95% confidence interval for the slope of the population regression line from Topic 9.2 was -0.55 to 16.13.
- The general interpretation form is: We are C% confident that the interval from ___ to ___ captures the slope of the population regression line in context.
- For Old Faithful, the correct interpretation is that we are 95% confident that the interval from -0.55 to 16.13 captures the slope of the population regression line for predicting wait time until the next eruption in minutes from the duration of the previous eruption in minutes for all Old Faithful eruptions in July 2019.
- The confidence level is interpreted with repeated random sampling: if we took many random samples of size 25 and built a 95% confidence interval from each one, about 95% of those intervals would capture the true slope.
- A value of beta = 0 means the population regression line is horizontal.
- If beta = 0, the model predicts the same response value regardless of x, so there is no linear relationship.
- Because the Old Faithful interval contains 0, there is not convincing evidence that wait time until the next eruption is linearly related to the duration of the previous eruption in July 2019.
- Raoul's rubber band airplane experiment had a 95% confidence interval for slope of 0.013 to 0.080.
- Because all values in Raoul's interval are positive, there is convincing evidence of a positive linear relationship between number of rotations and flight time.
- To justify a claim with a confidence interval, check whether the interval contains values that are consistent with the claim.

VIDEO 2 - Constructing and interpreting a confidence interval from start to finish (~7 min):
- The lesson uses the 2019 AP Statistics International Exam free-response question about three-bedroom houses in a large city.
- A real estate agent believes selling price decreases by about $2,000 for every additional mile from the city center.
- The explanatory variable is distance from the city center in miles.
- The response variable is selling price in thousands of dollars.
- A random sample of 20 three-bedroom houses was obtained.
- The problem says to assume all conditions for inference are met.
- The parameter is beta, the slope of the population regression line for predicting selling price from distance from the city center for all three-bedroom houses near this city.
- The correct procedure is a one-sample t interval for the slope beta.
- The sample slope is b = -2.158.
- With n = 20, the degrees of freedom are 18.
- For a 95% confidence interval with df = 18, the critical value is t* = 2.101.
- The standard error of the slope is 0.149.
- The margin of error is 0.313.
- The 95% confidence interval is -2.471 to -1.845.
- The interval means the true slope is between -2.471 and -1.845 thousands of dollars per mile.
- In context, for each additional mile away from the city center, selling price is expected to decline by between $1,845 and $2,471.
- Because the interval contains -2, corresponding to a $2,000 decrease per mile, the data do not contradict the agent's belief.
- The full process is: define the parameter, identify the procedure, verify conditions, calculate the interval, and interpret the interval in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U9L3 = {
    reflect1: {
        questionText: 'Explain how to interpret the Old Faithful 95% confidence interval for slope and how to interpret the 95% confidence level. Include the interval -0.55 to 16.13, the slope of the population regression line for predicting wait time from the duration of the previous eruption for all Old Faithful eruptions in July 2019, and the repeated random sampling idea.',
        expectedElements: [
            { id: 'confidence-statement', description: 'States that we are 95% confident the interval captures the parameter', required: true },
            { id: 'interval-values', description: 'Includes the interval endpoints -0.55 and 16.13', required: true },
            { id: 'parameter-context', description: 'Identifies the parameter as the slope of the population regression line for predicting wait time from eruption duration for all Old Faithful eruptions in July 2019', required: true },
            { id: 'confidence-level-meaning', description: 'Explains that the confidence level is about repeated random sampling, not about this one interval alone', required: true },
            { id: 'long-run-capture', description: 'States that about 95% of 95% confidence intervals from many random samples of size 25 would capture the true slope', required: true },
            { id: 'sample-size-25', description: 'May mention the repeated samples are size 25', required: false },
            { id: 'parameter-not-statistic', description: 'May clearly distinguish the population slope from the sample slope', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly interprets the Old Faithful interval in context and correctly explains the meaning of the 95% confidence level using repeated random sampling.',
            P: 'Response gives the basic interpretation or the repeated-sampling meaning but misses one major element such as the interval values, the parameter in context, or the long-run capture idea.',
            I: 'Response does not correctly interpret the confidence interval for slope or gives an incorrect explanation of the confidence level.'
        },
        commonMistakes: [
            'Saying there is a 95% chance the true slope is in this one computed interval',
            'Leaving out the interval endpoints -0.55 and 16.13',
            'Failing to identify the parameter as the slope of the population regression line in context',
            'Not mentioning repeated random sampling when interpreting the confidence level',
            'Explaining the sample slope instead of the population slope'
        ],
        contextFromVideo: 'Video 1 interprets the Old Faithful interval -0.55 to 16.13 in context and then explains the 95% confidence level with repeated random samples of size 25.'
    },

    reflect2: {
        questionText: 'Explain how confidence intervals can be used to justify claims about slope. Include that beta = 0 means a horizontal line and no linear relationship, why the Old Faithful interval does not show convincing evidence of a linear relationship, and why Raoul\'s interval from 0.013 to 0.080 does show convincing evidence of a positive linear relationship.',
        expectedElements: [
            { id: 'beta-zero-meaning', description: 'Explains that beta = 0 means a horizontal line or no linear relationship', required: true },
            { id: 'old-faithful-contains-zero', description: 'States that the Old Faithful interval contains 0', required: true },
            { id: 'old-faithful-conclusion', description: 'Concludes that there is not convincing evidence of a linear relationship for Old Faithful', required: true },
            { id: 'raoul-interval-values', description: 'Includes Raoul\'s interval 0.013 to 0.080 or notes that it contains only positive values', required: true },
            { id: 'raoul-conclusion', description: 'Concludes that there is convincing evidence of a positive linear relationship for Raoul\'s experiment', required: true },
            { id: 'justify-claim-rule', description: 'Explains that claims are justified by checking whether the interval contains values consistent with the claim', required: true },
            { id: 'plausible-language', description: 'May use language like plausible value or consistent with the data', required: false },
            { id: 'negative-interval-case', description: 'May note that an interval containing only negative values would support a negative linear relationship', required: false }
        ],
        scoringGuide: {
            E: 'Response accurately explains how intervals justify claims, correctly treats beta = 0, and correctly contrasts the Old Faithful and Raoul conclusions.',
            P: 'Response shows the general idea of using the interval to justify a claim but misses one major element such as the meaning of beta = 0, one of the interval conclusions, or the rule about values consistent with the claim.',
            I: 'Response does not correctly explain how a confidence interval is used to justify a claim about slope or gives incorrect conclusions for the examples.'
        },
        commonMistakes: [
            'Saying Old Faithful shows convincing evidence even though the interval contains 0',
            'Ignoring the meaning of beta = 0',
            'Failing to mention that Raoul\'s interval contains only positive values',
            'Using p-value reasoning instead of interval reasoning',
            'Not connecting the conclusion to values consistent with the claim'
        ],
        contextFromVideo: 'Video 1 uses Old Faithful to show that containing 0 means no convincing evidence of a linear relationship, then uses Raoul\'s positive interval to show convincing evidence of a positive linear relationship.'
    },

    exitTicket: {
        questionText: 'Use the 2019 real estate agent example to describe the confidence interval for slope from start to finish. Define the parameter and identify the procedure, state the sample slope, degrees of freedom, critical value, and standard error, report the margin of error and final interval, interpret the interval in context, and explain whether the interval contradicts the agent\'s belief about a $2,000 decrease per mile and why.',
        expectedElements: [
            { id: 'parameter', description: 'Defines the parameter as the slope of the population regression line for predicting selling price from distance from the city center for all three-bedroom houses near this city', required: true },
            { id: 'procedure', description: 'Identifies the procedure as a one-sample t interval for the slope beta and notes that conditions are assumed met', required: true },
            { id: 'b-df-tstar', description: 'Gives b = -2.158, df = 18, and t* = 2.101', required: true },
            { id: 'se-and-me', description: 'Reports the standard error 0.149 and the margin of error 0.313', required: true },
            { id: 'final-interval', description: 'Gives the final interval -2.471 to -1.845', required: true },
            { id: 'interpretation', description: 'Interprets the interval in context as a decline of between $1,845 and $2,471 in selling price for each additional mile from the city center', required: true },
            { id: 'claim-justification', description: 'Explains that the interval contains -2, so the data do not contradict the agent\'s belief about a $2,000 decrease per mile', required: true },
            { id: 'units', description: 'May mention the slope is in thousands of dollars per mile', required: false },
            { id: 'sample-size', description: 'May mention the random sample size is 20 houses', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly walks through the real estate confidence interval from setup through interpretation and correctly explains why the interval does not contradict the agent\'s belief.',
            P: 'Response includes most of the interval setup and interpretation but misses one major element such as the procedure, key numerical values, the final interval, the contextual interpretation, or the claim justification.',
            I: 'Response gives an incorrect procedure or fails to provide the main numerical and contextual pieces needed to describe and interpret the interval.'
        },
        commonMistakes: [
            'Using the intercept instead of the slope as the point estimate',
            'Giving the wrong degrees of freedom or critical value',
            'Confusing the standard error with the margin of error',
            'Interpreting the slope without context or units',
            'Saying the interval contradicts the agent even though -2 is inside the interval'
        ],
        contextFromVideo: 'Video 2 computes the real estate interval using b = -2.158, df = 18, t* = 2.101, SE = 0.149, margin of error 0.313, final interval -2.471 to -1.845, and then notes that containing -2 means the data do not contradict the agent\'s belief.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU9L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U9L3[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Justifying a Claim About the Slope of a Regression Model Based on a Confidence Interval.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U9L3}

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
    'score': 'E|P|I',
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
window.getRubricU9L3 = function(questionId) {
    return window.RUBRICS_U9L3[questionId];
};

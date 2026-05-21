/**
 * AI Grading Prompts for Unit 9 Lesson 1: Introducing Statistics: Do Those Points Align?
 * Topic 9.1: Introducing Statistics: Do Those Points Align?
 *
 * Learning Objectives:
 *   Describe the inferential question behind comparing a sample regression slope to a population regression model
 *   Explain why sample regression line slopes vary because of random variation
 *   Use simulation to build a sampling distribution of slope values
 *   Estimate how likely an observed sample slope is under a population regression model
 *   Use the estimated probability to decide whether a population regression model is believable in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U9L1 = `
VIDEO 1 - Introducing inference about the slope of a population regression model (~6 min):
- Presenter introduces the final unit of AP Statistics: inference for quantitative data slopes.
- MAIN IDEAS:
  - The lesson question is how to determine if the slope of a sample regression line is consistent with random variation from a population regression model.
  - The Old Faithful example compares a July 1995 population to a July 2019 random sample.
  - In July 1995, all 262 recorded eruptions are shown in a scatterplot.
  - The July 1995 population has a moderately strong, positive, linear relationship between duration and wait time.
  - The July 1995 population regression model is predicted wait time = 33.34 + 13.29(duration).
  - In July 2019, a random sample of 25 eruptions is shown.
  - The July 2019 sample has a moderately weak, positive, linear relationship between duration and wait time.
  - The July 2019 sample regression line is predicted wait time = 62.95 + 7.79(duration).
  - The question is whether it is believable that the July 1995 population regression model is still valid for predicting wait time from duration in 2019.
  - To investigate, we estimate the probability of getting a sample regression line with slope at least as unusual as 7.79 in a random sample of 25 observations from the July 1995 population.
  - The simulation process is to repeatedly take random samples of 25 points from the July 1995 population, compute the sample regression line, and record the slope.
  - In simulation trial 1, the sample regression line is predicted wait time = 28.74 + 14.46(duration), so the slope is 14.46.
  - In simulation trial 2, the sample regression line is predicted wait time = 39.27 + 11.97(duration), so the slope is 11.97.
  - Repeating this many times creates a simulated sampling distribution of the slope of the sample regression line.
  - The observed slope 7.79 is far to the left of the simulated distribution.
  - The estimated probability of getting a slope at least as surprising as 7.79, in either direction from the center, is approximately 0.
  - Therefore, it is not believable that the July 1995 population regression model still applies for predicting wait time from duration in July 2019.
- FINAL TAKEAWAYS:
  - Sample slopes vary from sample to sample because of random variation.
  - Simulation helps decide whether an observed sample slope is plausible under a population regression model.
  - A contextual conclusion should explain whether the older model still seems valid for the newer data.
`;

// Rubrics for each reflection question
window.RUBRICS_U9L1 = {
    reflect1: {
        questionText: 'Explain how the Old Faithful example uses simulation to build a sampling distribution of slope values. Include the July 1995 population, repeated random samples of 25 eruptions, calculating a sample regression line for each sample, recording slopes like 14.46 and 11.97, and the idea of random variation from sample to sample.',
        expectedElements: [
            { id: 'population', description: 'Identifies the July 1995 Old Faithful data as the population or starting model for the simulation', required: true },
            { id: 'sample-size', description: 'States that repeated random samples of 25 eruptions are taken from the 1995 population', required: true },
            { id: 'sample-regression-line', description: 'Explains that a sample regression line is calculated for each simulated sample', required: true },
            { id: 'record-slope', description: 'Explains that the slope from each sample regression line is recorded', required: true },
            { id: 'random-variation', description: 'States that slopes vary from sample to sample because of random variation', required: true },
            { id: 'trial-values', description: 'Includes sample slope examples such as 14.46 and 11.97 from the first two trials', required: true },
            { id: 'sampling-distribution', description: 'Explains that the repeated slopes form a simulated sampling distribution of the slope', required: true },
            { id: 'old-model', description: 'May mention that the simulation is based on the older July 1995 regression model', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains the simulation process for building a sampling distribution of slopes and connects the process to the Old Faithful example values.',
            P: 'Response describes the main simulation idea but misses one major element such as repeated samples of 25, recording slopes, random variation, or the example slope values.',
            I: 'Response gives an incorrect description of the simulation process or does not explain how the sampling distribution of slope is built.'
        },
        commonMistakes: [
            'Treating the 2019 sample as the population used for simulation',
            'Leaving out that many random samples of size 25 are taken',
            'Forgetting that each simulated sample produces its own regression line and slope',
            'Ignoring random variation as the reason slopes differ',
            'Leaving out the sample slope examples from the first two trials'
        ],
        contextFromVideo: 'The video models two specific simulation trials and then describes repeating the process many times to build the sampling distribution of slope.'
    },

    reflect2: {
        questionText: 'Explain how the sample slope 7.79 from July 2019 is used to judge whether the July 1995 population regression model is still believable. Include comparing 7.79 to the simulated distribution, the phrase at least as unusual in either direction from the center, the estimated probability of about 0, and the conclusion about predicting wait time from duration in 2019.',
        expectedElements: [
            { id: 'observed-slope', description: 'Identifies 7.79 as the observed slope from the July 2019 sample regression line', required: true },
            { id: 'compare-to-distribution', description: 'Explains that 7.79 is compared to the simulated sampling distribution built from the July 1995 model', required: true },
            { id: 'unusual-language', description: 'Uses the idea of a slope at least as unusual or surprising as 7.79', required: true },
            { id: 'either-direction', description: 'States that unusualness is judged in either direction from the center of the distribution', required: true },
            { id: 'estimated-probability', description: 'States that the estimated probability is approximately 0', required: true },
            { id: 'interpretation', description: 'Explains that a probability near 0 means the observed slope would be very unlikely if the 1995 model were still valid', required: true },
            { id: 'contextual-conclusion', description: 'Concludes in context that it is not believable that the July 1995 model still applies for predicting wait time from duration in July 2019', required: true },
            { id: 'left-tail', description: 'May mention that 7.79 is far to the left of the simulated distribution', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains how 7.79 is judged against the simulated distribution and uses the near-zero estimated probability to make the correct contextual conclusion.',
            P: 'Response gives the main comparison and conclusion idea but misses one major element such as either direction, the estimated probability, or the contextual conclusion.',
            I: 'Response misinterprets what the simulation is doing, gives the wrong meaning for the near-zero probability, or does not connect the result to whether the old model is believable.'
        },
        commonMistakes: [
            'Saying the slope 7.79 is compared directly to the intercept instead of to simulated slopes',
            'Leaving out the idea of at least as unusual in either direction',
            'Interpreting the estimated probability as exactly impossible instead of approximately 0 from simulation',
            'Concluding that the 1995 model is believable even though the observed slope is far outside the simulated results',
            'Failing to state the conclusion in the context of predicting Old Faithful wait times'
        ],
        contextFromVideo: 'The video explicitly compares 7.79 to the simulated sampling distribution and concludes that the old model is not believable because the estimated probability is about 0.'
    },

    exitTicket: {
        questionText: 'Use the Old Faithful example to describe the logic of inference about slope. Describe the July 1995 population and the July 2019 sample, report the population regression model and the 2019 sample regression line, explain how repeatedly simulating random samples of n = 25 from the 1995 population builds a sampling distribution of slopes, explain why 7.79 is unusual and what an estimated probability of about 0 means, and state a contextual conclusion about whether the July 1995 model still seems valid in July 2019.',
        expectedElements: [
            { id: 'population-and-sample', description: 'Describes the July 1995 Old Faithful population and the July 2019 random sample of 25 eruptions', required: true },
            { id: 'regression-lines', description: 'Reports the July 1995 population regression model and the July 2019 sample regression line, including the key slopes 13.29 and 7.79', required: true },
            { id: 'simulation-process', description: 'Explains that many random samples of size 25 are simulated from the 1995 population and a sample regression line is computed for each one', required: true },
            { id: 'sampling-distribution', description: 'Explains that the repeated slopes create a simulated sampling distribution of the slope', required: true },
            { id: 'unusual-slope', description: 'Explains that the observed slope 7.79 is unusually far from the center of the simulated distribution', required: true },
            { id: 'estimated-probability', description: 'States that the estimated probability of getting a slope that unusual is about 0', required: true },
            { id: 'meaning-of-probability', description: 'Explains that such a result would be very unlikely if the July 1995 population regression model were still valid', required: true },
            { id: 'contextual-conclusion', description: 'Concludes in context that it is not believable that the July 1995 model still applies for predicting wait time from duration in July 2019', required: true },
            { id: 'trial-slopes', description: 'May mention the example simulated slopes 14.46 and 11.97 from the first two trials', required: false },
            { id: 'either-direction', description: 'May mention that unusualness is judged in either direction from the center of the distribution', required: false }
        ],
        scoringGuide: {
            E: 'Response includes the full logic of the inference process, accurately describes the simulation, explains why 7.79 is unusual, and gives the correct contextual conclusion.',
            P: 'Response covers most of the inference logic but misses one major element such as the regression lines, the repeated simulation process, the near-zero probability, or the final contextual conclusion.',
            I: 'Response gives an incorrect account of the inference logic or does not accurately explain how the simulation result supports the conclusion.'
        },
        commonMistakes: [
            'Leaving out either the 1995 population or the 2019 sample',
            'Not reporting the regression lines or confusing the two slopes',
            'Forgetting that the simulation repeatedly samples from the 1995 population',
            'Saying a probability of about 0 proves the model is impossible rather than not believable',
            'Failing to state the conclusion in context about predicting wait time from duration in 2019'
        ],
        contextFromVideo: 'The video uses Old Faithful to introduce the full logic of inference about slope by comparing the observed 2019 slope to a simulated sampling distribution based on the 1995 model.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU9L1 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U9L1[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Introducing Statistics: Do Those Points Align?.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U9L1}

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
window.getRubricU9L1 = function(questionId) {
    return window.RUBRICS_U9L1[questionId];
};

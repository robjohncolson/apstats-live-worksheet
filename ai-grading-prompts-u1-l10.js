/**
 * AI Grading Prompts for Unit 1 Lesson 10: Topic 1.10
 * Topic 1.10: which is about normal
 *
 * Learning Objectives:
 *   Use percentiles and z-scores to describe relative position in a quantitative data set
 *   Describe a normal distribution and apply the empirical rule
 *   Use z-scores and Table A to find proportions and cutoff values for a normal distribution
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L10 = `
VIDEO 1 - Relative Position with Percentiles and z-Scores (~7:58):
- The video introduces two ways to describe the relative position of a value in a quantitative data set: percentiles and standardized scores.
- Percentile is defined as the percent of data values less than or equal to a given value. AP Statistics uses less than or equal to, not just less than.
- A percentile can be interpreted by saying a value is at the Pth percentile, meaning about P% of the values are less than or equal to that value.
- A standardized score measures how far a value is from the mean in units of standard deviation.
- In AP Statistics, the most common standardized score is the z-score, calculated as (value - mean) / standard deviation.
- A z-score is interpreted as the number of standard deviations above or below the mean.
- Percentiles and z-scores can be calculated for any distribution and do not automatically imply a normal distribution.
- The example uses Flint water-sample lead levels from 71 samples collected in 2015.
- A water sample of 20 parts per billion is at the 91.5th percentile because 65 of 71 values are less than or equal to 20.
- The z-score for 20 parts per billion is 0.88, so it is 0.88 standard deviations above the mean.
- A water sample of 2 parts per billion is at the 39.4th percentile because 28 of 71 values are less than or equal to 2.
- The z-score for 2 parts per billion is -0.37, so it is 0.37 standard deviations below the mean.

VIDEO 2 - The Normal Distribution and the Empirical Rule (~8:57):
- A normal distribution is mound-shaped, often called a bell curve, and symmetric.
- Many real-world quantitative variables can be closely modeled by a normal distribution.
- A normal distribution is determined by the population mean and the population standard deviation.
- The example uses adult systolic blood pressure modeled with mean 110 and standard deviation 10.
- Students should start normal-distribution problems with a picture and mark the mean and standard-deviation steps.
- The empirical rule says about 68% of observations lie within 1 standard deviation of the mean, 95% lie within 2, and 99.7% lie within 3.
- Using the empirical rule, about 16% of adults have blood pressure below 100.
- Using the empirical rule, about 97.5% of adults have blood pressure below 130.
- If a boundary value is not exactly 1, 2, or 3 standard deviations from the mean, the empirical rule is not enough and a z-score with Table A is needed.
- For a blood pressure of 125, the z-score is 1.50 and Table A gives a left-tail area of 0.9332.

VIDEO 3 - Table A, Areas, and Working Backward (~8:42):
- Table A gives the area to the left of a z-score.
- To find area to the right, subtract the left-tail area from 1.
- For blood pressure above 125, the proportion is 0.0668 because 1 - 0.9332 = 0.0668.
- To find area between two values, calculate two z-scores, find both left-tail areas in Table A, and subtract.
- For blood pressures between 120 and 129, the lesson finds left areas of 0.8413 and 0.9713, then subtracts to get about 0.13.
- To work backward from an area, first convert the target region to an area to the left if necessary.
- For the highest 10%, the area to the left is 0.90.
- The z-score closest to a left-tail area of 0.90 is 1.28.
- Substituting z = 1.28 into the z-score formula with mean 110 and standard deviation 10 gives a cutoff value of 122.8.
- The main strategies are: left area directly from Table A, right area as 1 minus left, between area as a difference of two left areas, and backward problems by finding z first and then solving for the original value.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L10 = {
    reflect1: {
        questionText: 'Explain how percentiles and z-scores each describe the relative position of a Flint water-sample value. Include what percentile counts and what a positive or negative z-score means.',
        expectedElements: [
            { id: 'percentile-definition', description: 'Explains that percentile is the percent of values less than or equal to a given value', required: true },
            { id: 'zscore-definition', description: 'Explains that a z-score tells how many standard deviations a value is from the mean', required: true },
            { id: 'sign-meaning', description: 'States that a positive z-score means above the mean and a negative z-score means below the mean', required: true },
            { id: 'two-tools', description: 'Makes clear that percentile and z-score are two different ways to describe relative position', required: false },
            { id: 'context', description: 'Uses Flint water-sample context such as lead levels, water samples, or parts per billion', required: false },
            { id: 'example-values', description: 'May reference examples such as 20 parts per billion at the 91.5th percentile and 0.88 standard deviations above the mean, or 2 parts per billion at the 39.4th percentile and 0.37 standard deviations below the mean', required: false },
            { id: 'any-distribution', description: 'May note that percentiles and z-scores can be used for any distribution and do not require a normal distribution', required: false }
        ],
        scoringGuide: {
            E: 'Percentile = percent of values at or below a given value; z-score = number of standard deviations from the mean; positive means above the mean, negative below.',
            P: 'Two of the three are correct; one is missing or wrong (commonly a z-score described as a percent).',
            I: 'Fewer than two are correct.'
        },
        commonMistakes: [
            'Forgetting that percentile includes values less than or equal to the given value',
            'Describing a z-score as a percent instead of a number of standard deviations',
            'Mixing up what positive and negative z-scores mean',
            'Describing percentile and z-score as if they were the same thing'
        ],
        contextFromVideo: 'Video 1 defines percentile as the percent less than or equal to a value and z-score as the number of standard deviations above or below the mean, using Flint lead-level examples.'
    },

    reflect2: {
        questionText: 'Explain how Table A helps you solve three kinds of normal-distribution problems: area to the right, area between two values, and working backward from an area to a cutoff value. Use z-score language in your response.',
        expectedElements: [
            { id: 'table-a-left', description: 'States that Table A gives the area to the left of a z-score', required: true },
            { id: 'area-right', description: 'Explains that area to the right is found by subtracting the left-tail area from 1', required: true },
            { id: 'area-between', description: 'Explains that area between two values is found by calculating two z-scores and subtracting two left-tail areas', required: true },
            { id: 'backward-process', description: 'Explains that backward problems use the target area to find a z-score first and then solve for the original value with the mean and standard deviation', required: true },
            { id: 'zscore-language', description: 'Uses z-score language such as area to the left, z-score, mean, or standard deviation', required: false },
            { id: 'context', description: 'Uses normal-distribution context such as the blood-pressure examples from class', required: false },
            { id: 'example-values', description: 'May mention examples like 0.0668 for above 125, 0.13 between 120 and 129, or z = 1.28 and x = 122.8 for the highest 10%', required: false }
        ],
        scoringGuide: {
            E: 'States that Table A gives area to the left, then explains all three: right = 1 minus the left area; between = two z-scores, subtract the two left areas; backward = find the z for the target area, then solve for x with the mean and standard deviation.',
            P: 'Three of the four are correct; one process is missing or wrong.',
            I: 'Two or more processes are missing or wrong, or Table A is described as giving area to the right.'
        },
        commonMistakes: [
            'Forgetting that Table A gives area to the left, not area to the right',
            'Using one minus when the problem is asking for area between two values',
            'Working backward by searching for the area in the z-score column instead of in the body of the table',
            'Failing to mention the role of the mean and standard deviation when solving for the cutoff value'
        ],
        contextFromVideo: 'Video 3 shows three Table A moves: right area is 1 minus left area, between area is the difference of two left areas, and backward problems use a target area to find z first and then solve for x.'
    },

    exitTicket: {
        questionText: 'A bakery models loaf weights with a normal distribution with mean 16 ounces and standard deviation 0.5 ounce. Describe the shape and parameters, use the empirical rule to estimate the percent between 15.5 and 16.5 ounces and the percent above 17 ounces, and explain how to use Table A and a z-score to estimate the cutoff for the heaviest 10% of loaves.',
        expectedElements: [
            { id: 'shape-parameters', description: 'States that the distribution is normal, symmetric, and mound-shaped and identifies the mean as 16 ounces and the standard deviation as 0.5 ounce', required: true },
            { id: 'within-one-sd', description: 'Uses the empirical rule to state that about 68% of loaves are between 15.5 and 16.5 ounces', required: true },
            { id: 'above-two-sd', description: 'Uses the empirical rule to state that about 2.5% of loaves are above 17 ounces', required: true },
            { id: 'backward-left-area', description: 'Explains that the heaviest 10% means 90% is to the left before using Table A', required: false },
            { id: 'backward-zscore', description: 'Uses a z-score of about 1.28 and solves for a cutoff of about 16.64 ounces or about 16.6 ounces', required: true },
            { id: 'context', description: 'Uses loaf-weight context throughout the response', required: false },
            { id: 'notation', description: 'May refer to the parameters with symbols such as mu and sigma or mention the z-score formula', required: false }
        ],
        scoringGuide: {
            E: 'Says the model is normal (symmetric, bell-shaped) with mean 16 and SD 0.5; about 68% between 15.5 and 16.5; about 2.5% above 17; and finds the heaviest-10% cutoff with the work shown (90% to the left, z about 1.28, cutoff about 16.6 ounces).',
            P: 'Three of the four are correct; one is missing or wrong (commonly 5% instead of 2.5%, or the cutoff left as a z-score).',
            I: 'Two or more of the four are missing or wrong.'
        },
        commonMistakes: [
            'Forgetting that 15.5 to 16.5 is exactly within one standard deviation of the mean',
            'Saying the percent above 17 ounces is 5% instead of 2.5%',
            'Using 10% as the left-tail area instead of converting it to 90% to the left',
            'Failing to solve back to an actual loaf weight for the cutoff'
        ],
        contextFromVideo: 'Videos 2 and 3 explain the empirical rule, Table A left-tail areas, and backward calculations from a target area to a cutoff value using a z-score.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L10 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L10[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.10: which is about normal.

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Key Elements (what a complete answer usually covers)
${requiredElements}

## Optional Elements (bonus, not required)
${optionalElements || 'None'}

## Scoring Guide
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

## Common Mistakes to Watch For
${rubric.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}

## Lesson Context
${rubric.contextFromVideo}

## Instructions
GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

Grade the student's response. Return JSON:
{
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "brief explanation of the score",
    "matched": ["list of required elements the student addressed"],
    "missing": ["list of required elements the student missed"],
    "suggestion": "one specific thing the student could add to improve their answer"
}`;
};

// Get rubric for a question (used by appeal system)
window.getRubricU1L10 = function(questionId) {
    return window.RUBRICS_U1L10[questionId] || null;
};

/**
 * AI Grading Prompts for Unit 1 Lesson 10: Topic 1.10
 * Topic 1.10: which is about normal
 *
 * Learning Objectives:
 *   Use percentiles to describe the position of a value in a quantitative data set
 *   Use standardized scores to describe the relative position of a value
 *   Interpret z-scores as numbers of standard deviations above or below the mean
 *   Describe normal distributions and use the empirical rule
 *   Use z-scores and Table A to find normal areas and work backward from a proportion
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L10 = `
VIDEO 1 - Percentiles and Standardized Scores (~7:58):
- The lesson starts with two questions: how to use percentile and how to use standardized scores to describe the position of a value in a quantitative data set.
- Both percentile and standardized score describe the relative position of a value within a list of other values.
- Percentile is defined for AP Statistics as the percent of data values less than or equal to a given value.
- Students are warned that some outside sources say less than, but AP Statistics uses less than or equal to.
- A standardized score compares a value to the mean in units of standard deviation.
- The AP Statistics formula is the z-score: z = (value - mean) / standard deviation.
- A z-score is interpreted as the number of standard deviations above or below the mean.
- Percentiles and z-scores can be calculated for any distribution, not just normal distributions.
- In the Flint water example, 20 parts per billion is at the 91.5th percentile and has z = 0.88, which means 0.88 standard deviations above the mean.
- In the same data, 2 parts per billion is at the 39.4th percentile and has z = -0.37, which means 0.37 standard deviations below the mean.

VIDEO 2 - Normal Distribution and the Empirical Rule (~9:00):
- A normal distribution is mound-shaped, often called a bell curve, and symmetric.
- Many real-world quantitative variables can be closely modeled by a normal distribution.
- A normal distribution is determined by the mean mu and the standard deviation sigma.
- Students are told to start normal distribution problems with a picture and label the mean plus one, two, and three standard deviations above and below it.
- The empirical rule, also called the 68-95-99.7 rule, says about 68% of the data are within 1 standard deviation of the mean, 95% within 2, and 99.7% within 3.
- In the blood pressure example with mean 110 and standard deviation 10, the percent below 100 is 16%.
- In the same example, the percent below 130 is 97.5% because 130 is two standard deviations above the mean.
- If a value is not exactly one, two, or three standard deviations from the mean, the empirical rule cannot solve the problem by itself.

VIDEO 3 - Table A and Working Backwards (~8:42):
- Table A gives area to the left of a z-score on the standard normal distribution.
- For blood pressure below 125, the z-score is 1.50 and Table A gives an area of 0.9332, so about 93.32% are below 125.
- To find area to the right, subtract the left-tail area from 1. In the example, above 125 is 1 - 0.9332 = 0.0668.
- To find area between two values, calculate two z-scores, find two left-tail areas, and subtract.
- For 120 and 129, the areas to the left are 0.8413 and 0.9713, so the area between is about 0.13.
- To work backward from the highest 10%, first convert that to a left-tail area of 0.90.
- Students are warned not to look for 0.90 in the z-score column; instead they find the closest area in the body of Table A.
- The z-score closest to a left-tail area of 0.90 is about 1.28, which leads to a cutoff of 122.8 in the blood pressure example.
- The overall takeaway is to use percentiles and z-scores for relative position, the empirical rule for exact 1, 2, or 3 standard deviation intervals, and Table A for more precise normal distribution work.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L10 = {
    reflect1: {
        questionText: 'How do percentile and z-scores each describe relative position, and what does a negative z-score tell you?',
        expectedElements: [
            { id: 'percentile-definition', description: 'Explains that a percentile gives the percent of data values less than or equal to a given value', required: true },
            { id: 'zscore-meaning', description: 'Explains that a z-score gives the number of standard deviations a value is above or below the mean', required: true },
            { id: 'negative-zscore', description: 'States that a negative z-score means the value is below the mean', required: true },
            { id: 'any-distribution', description: 'May note that percentiles and z-scores can be calculated for any distribution, not only normal ones', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains percentile, z-score interpretation, and the meaning of a negative z-score.',
            P: 'Response shows partial understanding of percentile or z-score interpretation but leaves out or confuses one important idea.',
            I: 'Response does not correctly explain how percentile and z-scores describe relative position.'
        },
        commonMistakes: [
            'Defining percentile as just the percent below a value and leaving out equal to',
            'Describing a z-score as a percent instead of a number of standard deviations',
            'Saying a negative z-score means the value is above the mean',
            'Assuming percentiles or z-scores only apply to normal distributions'
        ],
        contextFromVideo: 'Luke defines percentile as less than or equal to, interprets z-scores as standard deviations above or below the mean, and emphasizes that both measures work for any distribution.'
    },

    reflect2: {
        questionText: 'What defines a normal distribution, when can you use the empirical rule, and what do you do when a value is not exactly 1, 2, or 3 standard deviations from the mean?',
        expectedElements: [
            { id: 'normal-shape', description: 'States that a normal distribution is mound-shaped or bell-shaped and symmetric', required: true },
            { id: 'empirical-rule', description: 'Explains the empirical rule as 68%, 95%, and 99.7% within 1, 2, and 3 standard deviations of the mean', required: true },
            { id: 'when-to-use-empirical', description: 'Explains that the empirical rule works when the value or interval lines up with exact 1, 2, or 3 standard deviation marks', required: true },
            { id: 'table-a-step', description: 'Explains that when the value is not exactly 1, 2, or 3 standard deviations away, you calculate a z-score and use Table A', required: true },
            { id: 'start-with-picture', description: 'May note that students should begin with a labeled normal curve sketch', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly defines a normal distribution, explains the empirical rule, and describes using z-scores with Table A when the empirical rule does not apply directly.',
            P: 'Response includes some of these ideas but leaves out or weakly explains at least one major part of the process.',
            I: 'Response does not correctly explain normal distributions, the empirical rule, or what to do when the interval is not at exact standard deviation marks.'
        },
        commonMistakes: [
            'Saying any symmetric distribution is automatically normal without mentioning bell-shaped or mound-shaped',
            'Using the empirical rule for a value that is not exactly 1, 2, or 3 standard deviations from the mean',
            'Forgetting the 68-95-99.7 percentages',
            'Not mentioning z-scores or Table A when more exact normal probabilities are needed'
        ],
        contextFromVideo: 'Luke describes normal distributions as symmetric bell curves, presents the 68-95-99.7 rule, and then switches to z-scores with Table A when the value 125 is not exactly a whole-number standard deviation from the mean.'
    },

    exitTicket: {
        questionText: 'A clinic models adult resting heart rates with a normal distribution that has mean 70 beats per minute and standard deviation 8 beats per minute. (a) Use the empirical rule to estimate the percent of adults with heart rates between 62 and 78 beats per minute. (b) Find the proportion of adults with heart rates below 82 beats per minute and describe the z-score and Table A area you would use. (c) The clinic flags the highest 10% of heart rates for follow-up. About what heart rate is the cutoff? Explain how you know.',
        expectedElements: [
            { id: 'part-a', description: 'States that about 68% of adults are between 62 and 78 beats per minute because that interval is within 1 standard deviation of the mean', required: true },
            { id: 'part-b-zscore', description: 'Calculates or identifies the z-score for 82 as 1.50 standard deviations above the mean', required: true },
            { id: 'part-b-area', description: 'Uses Table A to give a left-tail area of about 0.9332 or 93.32% below 82', required: true },
            { id: 'part-c-cutoff', description: 'Works backward from the top 10% by using a left-tail area of 0.90, z about 1.28, and a cutoff of about 80.2 beats per minute', required: true },
            { id: 'context-and-interpretation', description: 'Interprets the results in context using heart rate language rather than only isolated calculations', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly uses the empirical rule, z-scores, Table A, and a backward normal calculation, all explained in context.',
            P: 'Response gets much of the normal-distribution work right but misses or confuses one major piece such as the empirical rule result, the Table A area, the backward calculation, or the context.',
            I: 'Response has major errors or omissions in using normal distribution ideas to answer the heart-rate questions.'
        },
        commonMistakes: [
            'Saying 95% instead of 68% for the interval from 62 to 78',
            'Using the right-tail area instead of the left-tail area for part b',
            'Forgetting that the highest 10% means a left-tail area of 0.90 before using Table A',
            'Treating 0.90 as a z-score instead of an area in the table body',
            'Giving calculations without interpreting them in terms of adult resting heart rates'
        ],
        contextFromVideo: 'The lesson uses the empirical rule for exact standard deviation intervals, Table A for left-tail probabilities such as z = 1.50, and a backward calculation using a 0.90 left-tail area to locate the top 10% cutoff.'
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

    return `You are grading an AP Statistics student's response about percentiles, z-scores, and the normal distribution (Topic 1.10).

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Required Elements (must be present for full credit)
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
Grade the student's response. Return JSON:
{
    "score": "E" or "P" or "I",
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

/**
 * AI Grading Prompts for Unit 1 Lesson 7: Topic 1.7
 * Topic 1.7: Topic 1.7
 *
 * Learning Objectives:
 *   Calculate and interpret mean, median, quartiles, and measures of variability for quantitative data
 *   Use range, IQR, standard deviation, and variance to describe spread
 *   Identify outliers using the 1.5 IQR rule or the 2 standard deviation rule
 *   Choose resistant or nonresistant statistics based on the shape of a distribution
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L7 = `
VIDEO 1 - Summary Statistics for a Quantitative Variable (~8:04):
- The video focuses on summary statistics for the center and variability of quantitative data.
- The lesson returns to the Flint water crisis data set with lead levels from 71 water samples collected from Flint residents.
- Mean is the average found by adding all values and dividing by the number of values.
- For a sample, x-bar represents the mean and n represents the number of data values.
- Median is the middle value in an ordered list.
- If there is an even number of values, the median is found by averaging the two middle values.
- Q1 is the median of the first half of the ordered data and Q3 is the median of the second half.
- For the Flint data, the total is 519 and the mean is 7.31 parts per billion.
- The median Flint lead level is 3 parts per billion.
- For the Flint data, Q1 is 2 and Q3 is 7.
- The video discusses range, IQR, and standard deviation as measures of variability.
- Range is the maximum minus the minimum.
- IQR is Q3 minus Q1 and describes the spread of the middle 50% of the data.
- Standard deviation describes the typical distance each value is from the mean.
- Variance is the square of the standard deviation.
- For the Flint data, the range is 104, the IQR is 5, and the standard deviation is 14.35.
- The teacher interprets these summary statistics in context of Flint lead levels.

VIDEO 2 - Outliers, Resistant Measures, and Choosing Statistics (~8:30):
- The video focuses on identifying outliers, classifying statistics as resistant or nonresistant, and choosing the best measures for a distribution.
- Method 1 says an outlier is more than 1.5 IQR below Q1 or more than 1.5 IQR above Q3.
- For the Flint data, the IQR is 5, so the high outlier cutoff by method 1 is 14.5.
- There are eight high outliers for Flint by the 1.5 IQR rule.
- Method 2 says an outlier is a value two or more standard deviations above or below the mean.
- For the Flint data, the high outlier cutoff by method 2 is 36.04.
- There are three high outliers for Flint by the two-standard-deviation method.
- Removing the largest outlier, 104, changes the mean from 7.31 to 5.9 and the standard deviation from 14.35 to 8.45.
- After removing 104, the median stays 3 and the IQR changes only slightly from 5 to 4.
- Mean, range, and standard deviation are nonresistant because they are strongly affected by outliers.
- Median and IQR are resistant because they stay the same or change very little when outliers are removed.
- For skewed distributions with outliers, the preferred measures are median for center and IQR for variability.
- For symmetric distributions, the preferred measures are mean for center and standard deviation for variability.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L7 = {
    reflect1: {
        questionText: 'Explain what the mean, median, and IQR tell you about the Flint lead-level data. Use context and include at least one numerical value from the lesson.',
        expectedElements: [
            { id: 'mean-interpretation', description: 'Explains that the mean describes the average Flint lead level and may reference 7.31 parts per billion', required: true },
            { id: 'median-interpretation', description: 'Explains that the median is 3 parts per billion and means about half the lead levels are below 3 and about half are above 3', required: true },
            { id: 'iqr-interpretation', description: 'Explains that the IQR is 5 parts per billion or that the middle 50% of Flint lead levels run from Q1 = 2 to Q3 = 7', required: true },
            { id: 'context', description: 'Uses context by referring to Flint lead levels or Flint water samples', required: true },
            { id: 'center-vs-variability', description: 'Distinguishes that mean and median describe center while IQR describes variability', required: true },
            { id: 'numerical-detail', description: 'Includes more than one correct numerical detail from the lesson', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains what the mean, median, and IQR say about the Flint data and uses correct context.',
            P: 'Response shows partial understanding of the Flint summary statistics but misses one major interpretation or uses weak context.',
            I: 'Response does not correctly explain what these statistics tell us about the Flint lead-level distribution.'
        },
        commonMistakes: [
            'Listing the statistics without explaining what they mean',
            'Confusing the mean with the median',
            'Treating the IQR as the full range of the data',
            'Leaving out the Flint lead-level context'
        ],
        contextFromVideo: 'The video says the Flint mean is 7.31 parts per billion, the median is 3 parts per billion, and the IQR is 5 because Q1 is 2 and Q3 is 7.'
    },

    reflect2: {
        questionText: 'Explain why the median and IQR are better than the mean and standard deviation for the Flint lead-level distribution. Use the ideas of skewness, outliers, and resistant versus nonresistant measures.',
        expectedElements: [
            { id: 'shape-or-outliers', description: 'States that the Flint distribution is skewed right or has large high outliers', required: true },
            { id: 'median-iqr-choice', description: 'States that median and IQR are the best measures for the Flint distribution', required: true },
            { id: 'resistant-language', description: 'Explains that median and IQR are resistant measures', required: true },
            { id: 'nonresistant-language', description: 'Explains that mean and standard deviation are nonresistant and are pulled by outliers', required: true },
            { id: 'context', description: 'Uses context by referring to Flint lead levels or Flint water samples', required: true },
            { id: 'removal-example', description: 'May mention that removing 104 changed the mean and standard deviation a lot but changed the median and IQR very little', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains why resistant measures are better for the skewed Flint distribution with outliers.',
            P: 'Response includes some correct reasoning but misses one major idea about skewness, resistance, or the choice of statistics.',
            I: 'Response does not correctly justify why median and IQR are preferred for the Flint data.'
        },
        commonMistakes: [
            'Saying median and IQR are always better for every distribution',
            'Mentioning outliers without explaining resistance',
            'Choosing mean and standard deviation even after noting the skew or outliers',
            'Using generic language without connecting to Flint lead levels'
        ],
        contextFromVideo: 'The video shows that removing the outlier 104 changes the mean and standard deviation a lot, while the median stays 3 and the IQR changes only from 5 to 4, so the resistant measures are better for the Flint distribution.'
    },

    exitTicket: {
        questionText: 'A coach recorded the number of minutes 10 students waited for rides after practice: 3, 4, 4, 5, 5, 5, 6, 6, 7, 22. Choose the best measure of center and variability, explain whether 22 is an outlier using one method from the lesson, and explain why your chosen statistics fit the distribution.',
        expectedElements: [
            { id: 'best-center', description: 'Chooses the median as the best measure of center and may identify it as 5 minutes', required: true },
            { id: 'best-variability', description: 'Chooses the IQR as the best measure of variability and may identify it as 2 minutes or note that the middle 50% run from 4 to 6 minutes', required: true },
            { id: 'outlier-identification', description: 'Identifies 22 minutes as an outlier using a valid lesson method such as the 1.5 IQR rule or the two-standard-deviation rule', required: true },
            { id: 'resistant-justification', description: 'Explains that median and IQR are resistant and therefore appropriate because of the skew or outlier', required: true },
            { id: 'context', description: 'Uses context by referring to minutes waiting for rides after practice or student waiting times', required: true },
            { id: 'skew-language', description: 'May describe the distribution as right-skewed or skewed right', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly chooses and justifies the best summary statistics, identifies the outlier, and uses context.',
            P: 'Response includes several correct ideas but misses one major part of the justification, outlier explanation, or context.',
            I: 'Response does not correctly choose or justify appropriate statistics for this distribution.'
        },
        commonMistakes: [
            'Choosing mean and standard deviation even though 22 creates a strong outlier',
            'Calling 22 unusual without connecting it to an outlier rule',
            'Giving the range instead of the IQR as the preferred variability measure',
            'Describing the numbers without mentioning student wait times'
        ],
        contextFromVideo: 'The lesson says that for skewed distributions or distributions with outliers, the preferred measures are the median for center and the IQR for variability, because they are resistant.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L7 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L7[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.7: Topic 1.7.

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
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "brief explanation of the score",
    "matched": ["list of required elements the student addressed"],
    "missing": ["list of required elements the student missed"],
    "suggestion": "one specific thing the student could add to improve their answer"
}`;
};

// Get rubric for a question (used by appeal system)
window.getRubricU1L7 = function(questionId) {
    return window.RUBRICS_U1L7[questionId] || null;
};

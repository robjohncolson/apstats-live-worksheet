/**
 * AI Grading Prompts for Unit 1 Lesson 7: Topic 1.7
 * Topic 1.7: Summary Statistics for a Quantitative Variable
 *
 * Learning Objectives:
 *   Identify summary statistics that describe center and variability in a quantitative distribution
 *   Find and interpret mean, median, quartiles, range, IQR, and standard deviation
 *   Use summary statistics to identify possible outliers
 *   Distinguish resistant and nonresistant measures
 *   Choose appropriate measures of center and variability based on distribution shape
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L7 = `
VIDEO 1 - Summary Statistics for a Quantitative Variable (~8:04):
- The video focuses on summary statistics for the center and variability of a quantitative data set.
- The two main center measures are the mean and the median.
- The mean is the average found by adding all values and dividing by the number of values.
- The median is the middle value in an ordered list; if there is an even number of values, the median is the average of the two middle values.
- Q1 is the median of the first half of the data and Q3 is the median of the second half of the data, excluding the overall median when the number of values is odd.
- The Flint water crisis example uses 71 lead-level measurements in parts per billion.
- For the Flint data, the sum is 519 and the mean is 7.31 parts per billion.
- For the Flint data, the median is the 36th value and equals 3 parts per billion.
- For the Flint data, Q1 is 2 and Q3 is 7.
- Measures of variability discussed are the range, the interquartile range, and standard deviation.
- The range is the maximum minus the minimum and should be described as a single value.
- The IQR is Q3 minus Q1 and describes the spread of the middle 50% of the data.
- Standard deviation is interpreted as the typical distance that values are from the mean.
- The square of the standard deviation is the variance.
- For the Flint data, the range is 104, the IQR is 5, and the standard deviation is about 14.35.
- A standard deviation interpretation should mention typical distance from the mean in context.

VIDEO 2 - Summary Statistics, Outliers, and Resistant Measures (~8:30):
- The video answers three questions: how to identify outliers, which summary statistics are resistant or nonresistant, and which measures are best for describing a distribution.
- Method 1 for checking outliers is the 1.5 IQR rule: more than 1.5 IQR below Q1 or more than 1.5 IQR above Q3.
- For the Flint data, Method 1 gives a low cutoff of -5.5 and a high cutoff of 14.5, so there are 8 high outliers and no low outliers.
- Method 2 checks for values two or more standard deviations below or above the mean.
- For the Flint data, Method 2 gives a low cutoff of about -21.384 and a high cutoff of 36.04, so there are 3 high outliers and no low outliers.
- Removing the largest outlier, 104, changes the mean from 7.31 to 5.9, the standard deviation from 14.347 to 8.45, and the range from 104 to 42.
- Removing that outlier leaves the median at 3 and changes the IQR only slightly from 5 to 4.
- The median and the IQR are resistant because they do not change much when an outlier is removed.
- The mean, the standard deviation, and the range are nonresistant because they change a lot when outliers are present or removed.
- For skewed distributions, the best measures are the median for center and the IQR for variability.
- For symmetric distributions, the best measures are the mean for center and the standard deviation for variability.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L7 = {
    reflect1: {
        questionText: 'Which summary statistics describe center, and which describe variability? Briefly explain what each one tells you.',
        expectedElements: [
            { id: 'center-measures', description: 'Identifies mean and median as measures used to describe center', required: true },
            { id: 'variability-measures', description: 'Identifies range, IQR, and standard deviation as measures used to describe variability', required: true },
            { id: 'center-explanation', description: 'Explains what a center measure tells you, such as mean being the average or median being the middle value', required: true },
            { id: 'variability-explanation', description: 'Explains what variability measures tell you, such as overall spread, middle 50% spread, or typical distance from the mean', required: true },
            { id: 'quartiles-mention', description: 'May mention Q1 and Q3 as values used to find the IQR or describe the ordered data', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies mean and median for center and range, IQR, and standard deviation for variability, and briefly explains what these measures mean.',
            P: 'Response identifies some correct measures or explanations, but leaves out or confuses an important part of center or variability.',
            I: 'Response does not correctly identify the main summary statistics for center and variability.'
        },
        commonMistakes: [
            'Leaving out either mean or median when discussing center',
            'Naming only one variability measure instead of range, IQR, and standard deviation',
            'Confusing the median with the mean',
            'Listing the statistics without explaining what they tell you'
        ],
        contextFromVideo: 'Video 1 states that mean and median describe center, while range, IQR, and standard deviation describe variability.'
    },

    reflect2: {
        questionText: 'Why are the median and IQR called resistant, and when should you use median and IQR instead of mean and standard deviation?',
        expectedElements: [
            { id: 'resistant-meaning', description: 'Explains that resistant measures do not change much when outliers are added or removed', required: true },
            { id: 'identify-resistant', description: 'Identifies the median and IQR as the resistant measures', required: true },
            { id: 'skewed-use', description: 'States that median and IQR should be used for skewed distributions or distributions with outliers', required: true },
            { id: 'symmetric-use', description: 'States that mean and standard deviation should be used for symmetric distributions', required: true },
            { id: 'nonresistant-contrast', description: 'May note that mean, standard deviation, and range are nonresistant because they change more with outliers', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains what resistant means, identifies median and IQR as resistant, and correctly matches skewed distributions with median and IQR and symmetric distributions with mean and standard deviation.',
            P: 'Response shows partial understanding of resistant measures or when to use each pair of statistics, but misses one major idea.',
            I: 'Response does not correctly explain resistant measures or does not correctly choose measures based on distribution shape.'
        },
        commonMistakes: [
            'Saying the mean is resistant',
            'Failing to connect median and IQR to skewed data or outliers',
            'Saying mean and standard deviation are always the best measures',
            'Explaining resistant without naming which measures are resistant'
        ],
        contextFromVideo: 'Video 2 shows that removing the outlier 104 changes the mean, standard deviation, and range a lot, but leaves the median and IQR nearly unchanged.'
    },

    exitTicket: {
        questionText: 'A teacher recorded the number of minutes 11 students spent studying for a quiz one night: 12, 13, 14, 14, 15, 16, 16, 17, 18, 20, 35. Find the median, Q1, Q3, and IQR, use the 1.5 IQR rule to decide whether 35 is an outlier, decide whether mean and standard deviation or median and IQR are better measures, and write one complete sentence describing the center and variability in context.',
        expectedElements: [
            { id: 'quartiles-and-iqr', description: 'Finds or clearly states median 16, Q1 14, Q3 18, and IQR 4', required: true },
            { id: 'outlier-decision', description: 'Uses the 1.5 IQR rule correctly and concludes that 35 is an outlier because it is above the upper fence of 24', required: true },
            { id: 'best-measures', description: 'Chooses median and IQR as the better measures for this distribution', required: true },
            { id: 'reasoning', description: 'Explains that the distribution is right-skewed or has a high outlier, so resistant measures are better', required: true },
            { id: 'context-sentence', description: 'Writes a complete sentence in context about students studying, including a reasonable center and variability description', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly finds the quartiles and IQR, identifies 35 as an outlier with the 1.5 IQR rule, chooses median and IQR for the skewed data, and writes a contextualized sentence about the study times.',
            P: 'Response gets much of the work right but misses or confuses one major component such as the quartiles, the outlier decision, the best measures, or the context sentence.',
            I: 'Response has major errors or omissions in computing or interpreting the summary statistics for the study-time data.'
        },
        commonMistakes: [
            'Using the mean and standard deviation even though 35 creates right skew',
            'Forgetting to exclude the overall median when finding Q1 and Q3',
            'Calculating the IQR incorrectly',
            'Saying 35 is not an outlier without using the 1.5 IQR rule',
            'Writing a sentence with numbers but no context about students studying'
        ],
        contextFromVideo: 'The videos emphasize finding quartiles carefully, using the 1.5 IQR rule for outliers, and choosing median and IQR when a distribution is skewed or contains outliers.'
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

    return `You are grading an AP Statistics student's response about summary statistics for a quantitative variable (Topic 1.7).

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
window.getRubricU1L7 = function(questionId) {
    return window.RUBRICS_U1L7[questionId] || null;
};

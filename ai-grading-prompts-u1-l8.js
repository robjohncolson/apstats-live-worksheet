/**
 * AI Grading Prompts for Unit 1 Lesson 8: Topic 1.8
 * Topic 1.8: Topic 1.8
 *
 * Learning Objectives:
 *   Represent summary statistics for quantitative data graphically using the five-number summary and box plots
 *   Describe what a box plot shows about quartiles, outliers, and the middle 50% of the data
 *   Explain how the shape of a distribution affects the relationship between the mean and the median
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L8 = `
VIDEO 1 - Graphical Representations of Summary Statistics (~8:04):
- The video focuses on graphical representations of summary statistics.
- Two main questions guide the lesson: what the five-number summary is and how to use it to make a box plot, and how distribution shape affects the relationship between the mean and the median.
- The lesson returns to the Flint water crisis data with lead levels from 71 water samples collected from Flint residents from January to June 2015.
- To build a box plot, the x-axis should be labeled with the variable and use a scale that fits all the data values from 0 to 104.
- The five-number summary for the Flint lead-level data is minimum 0, Q1 2, median 3, Q3 7, and maximum 104.
- Before completing the box plot, the lesson checks for outliers using the 1.5 IQR method.
- The Flint data have eight outliers by this method.
- In a box plot, outliers are shown as separate dots or asterisks.
- The box extends from Q1 to Q3, and the median is marked inside the box.
- The left whisker extends to the minimum value of 0.
- Because the Flint data have high outliers, the right whisker does not go to the maximum of 104; it goes to the largest value that is not an outlier, which is 13.
- A box plot divides the data into four quartiles, and each quartile contains 25% of the data.
- Advantages of a box plot include quickly showing the five-number summary and possible outliers.
- Disadvantages of a box plot include hiding individual values and hiding some shape details such as clusters or gaps.
- For the Flint data, the mean is 7.31 and the median is 3.
- The mean is much larger than the median because the high outliers pull the nonresistant mean upward.
- The median is resistant, so it stays lower in the skewed-right Flint distribution.
- General rule: if a distribution is skewed right, the mean is usually greater than the median.
- If a distribution is skewed left, the mean is usually less than the median.
- If a distribution is relatively symmetric, the mean and median are about equal.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L8 = {
    reflect1: {
        questionText: 'Explain how the five-number summary appears in the box plot for the Flint lead-level data. Include at least two numerical values from the lesson and mention the box, whiskers, or outliers.',
        expectedElements: [
            { id: 'five-number-summary', description: 'Identifies that the five-number summary is the minimum, Q1, median, Q3, and maximum', required: true },
            { id: 'box-and-median', description: 'Explains that the box runs from Q1 to Q3 and that the median is marked inside the box', required: true },
            { id: 'whiskers-or-outliers', description: 'Explains that whiskers extend to the most extreme non-outliers or that outliers are plotted separately', required: true },
            { id: 'flint-context', description: 'Uses context by referring to Flint lead levels or Flint water samples', required: true },
            { id: 'numerical-details', description: 'Includes at least two correct numerical values such as 0, 2, 3, 7, 13, or 104', required: true },
            { id: 'quartile-meaning', description: 'May explain that the box plot splits the data into quartiles or that each section contains 25% of the data', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains how the Flint five-number summary is represented on the box plot and uses accurate numerical details.',
            P: 'Response shows partial understanding of how the box plot represents the Flint data but misses one major feature or uses weak detail.',
            I: 'Response does not correctly explain how the five-number summary appears on the Flint box plot.'
        },
        commonMistakes: [
            'Listing numbers without explaining what part of the box plot they represent',
            'Saying the whiskers always go to the minimum and maximum even when outliers exist',
            'Forgetting that the median is the line inside the box',
            'Leaving out the Flint lead-level context'
        ],
        contextFromVideo: 'The video gives the Flint five-number summary as 0, 2, 3, 7, and 104, and shows that the right whisker stops at 13 because larger values are outliers.'
    },

    reflect2: {
        questionText: 'Explain how the shape of a distribution helps you compare mean and median. Use skewed right, skewed left, and symmetric in your answer, and connect at least one part of your explanation to the Flint box plot.',
        expectedElements: [
            { id: 'skewed-right', description: 'States that in a skewed-right distribution the mean is usually greater than the median', required: true },
            { id: 'skewed-left', description: 'States that in a skewed-left distribution the mean is usually less than the median', required: true },
            { id: 'symmetric', description: 'States that in a relatively symmetric distribution the mean and median are about equal or very close', required: true },
            { id: 'outlier-effect', description: 'Explains that outliers or a long tail pull the mean more than the median because the mean is nonresistant', required: true },
            { id: 'flint-connection', description: 'Connects the rule to the Flint box plot or Flint lead levels by noting that the Flint distribution is skewed right and has mean 7.31 above median 3', required: true },
            { id: 'median-resistant', description: 'May mention that the median is resistant compared with the mean', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains how shape affects the relationship between mean and median and connects the rule to the Flint example.',
            P: 'Response includes some correct comparisons but misses one major relationship, the role of outliers, or the Flint connection.',
            I: 'Response does not correctly explain how distribution shape affects the relative positions of the mean and median.'
        },
        commonMistakes: [
            'Reversing the relationships for skewed-right and skewed-left distributions',
            'Saying the mean and median are always exactly equal for symmetric distributions',
            'Ignoring the way outliers pull the mean more than the median',
            'Failing to connect the explanation to the Flint box plot'
        ],
        contextFromVideo: 'The video shows that the Flint distribution is skewed right with high outliers, so the mean is 7.31 while the median is only 3.'
    },

    exitTicket: {
        questionText: 'A school counselor summarized one evening\'s homework times for 12 students with minimum 12, Q1 18, median 22, Q3 31, largest non-outlier 38, and one high outlier at 58. Describe how these values would appear on a box plot, explain what interval contains the middle 50% of homework times, and predict whether the mean is greater than, less than, or about equal to the median.',
        expectedElements: [
            { id: 'box-and-median', description: 'Explains that the box would run from Q1 = 18 to Q3 = 31 with a median line at 22', required: true },
            { id: 'whiskers-and-outlier', description: 'Explains that the whiskers would extend to 12 and 38 and that 58 would be shown as a separate outlier point', required: true },
            { id: 'middle-50', description: 'States that the middle 50% of homework times are between 18 and 31 minutes', required: true },
            { id: 'mean-vs-median', description: 'Predicts that the mean is greater than the median because the high outlier suggests a skewed-right distribution', required: true },
            { id: 'context', description: 'Uses context by referring to homework times or minutes spent on homework', required: true },
            { id: 'quartile-language', description: 'May mention quartiles or the five-number summary by name', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly describes the box plot, identifies the middle 50%, predicts the mean-median relationship, and uses context.',
            P: 'Response includes several correct ideas but misses one major box-plot feature, the interval for the middle 50%, the mean-median comparison, or clear context.',
            I: 'Response does not correctly describe the box plot or justify the expected relationship between the mean and the median.'
        },
        commonMistakes: [
            'Sending the right whisker to 58 even though 58 is identified as an outlier',
            'Saying the middle 50% runs from the minimum to the maximum',
            'Predicting the mean is less than the median despite the high outlier on the right',
            'Using generic language without mentioning homework times'
        ],
        contextFromVideo: 'The lesson says the box runs from Q1 to Q3, whiskers extend to the most extreme non-outliers, outliers are shown separately, and skewed-right distributions usually have mean greater than median.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L8 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L8[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.8: Topic 1.8.

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
window.getRubricU1L8 = function(questionId) {
    return window.RUBRICS_U1L8[questionId] || null;
};

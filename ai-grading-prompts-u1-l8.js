/**
 * AI Grading Prompts for Unit 1 Lesson 8: Topic 1.8
 * Topic 1.8: Graphical Representations of Summary Statistics
 *
 * Learning Objectives:
 *   Define the five-number summary for a quantitative data set
 *   Use the five-number summary to construct and interpret a box plot
 *   Explain how quartiles and outliers appear on a box plot
 *   Describe advantages and disadvantages of box plots
 *   Predict how distribution shape affects the relationship between the mean and the median
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L8 = `
VIDEO 1 - Graphical Representations of Summary Statistics (~8:03):
- The lesson begins with two main questions: what the five-number summary is and how it is used to make a box plot, and how the shape of a distribution affects the relationship between the mean and the median.
- The example throughout the video uses Flint water crisis lead-level data from 71 water samples collected from January to June 2015.
- To begin a box plot, students first set up an x-axis with the variable and a scale that covers all values, from 0 to 104 in the Flint example.
- The five-number summary is defined as the minimum, Q1, median, Q3, and maximum.
- For the Flint data, the minimum is 0, Q1 is 2, the median is 3, Q3 is 7, and the maximum is 104.
- Before completing the box plot, the lesson checks for outliers using the 1.5 IQR method and finds eight outliers.
- On the box plot, outliers are shown as separate dots or asterisks.
- The box extends from Q1 to Q3, the median is marked inside the box, and whiskers extend outward.
- Because the Flint data have large high-end outliers, the right whisker stops at 13, the largest value that is not an outlier, rather than going all the way to 104.
- A box plot divides the distribution into four quartiles, and each quartile contains 25% of the observations.
- Advantages of a box plot include quickly showing the five-number summary and whether outliers are present, and clearly dividing the data into quartiles.
- Disadvantages of a box plot include hiding individual values and hiding shape details such as clusters and gaps within quartiles.
- The video compares the mean and median for the Flint data and notes that the mean is 7.31 while the median is 3.
- Because the mean is non-resistant, the high outliers pull it upward in this skewed-right distribution, so the mean is greater than the median.
- The general relationship is: skewed right means mean > median, skewed left means mean < median, and symmetric means mean and median are about equal.
- The key takeaway is that box plots graph the five-number summary, highlight quartiles and outliers, and that shape helps predict how mean and median compare.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L8 = {
    reflect1: {
        questionText: 'What is the five-number summary, and how do the quartiles help you build a box plot?',
        expectedElements: [
            { id: 'five-values', description: 'Identifies the five-number summary as the minimum, Q1, median, Q3, and maximum', required: true },
            { id: 'box-uses-quartiles', description: 'Explains that the box is built from Q1 to Q3 with the median marked inside', required: true },
            { id: 'quartiles-split-data', description: 'Explains that quartiles divide the data into four groups of 25%', required: true },
            { id: 'whiskers-or-outliers', description: 'May mention that whiskers extend to the smallest and largest non-outliers or that outliers are plotted separately', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly names all five parts of the five-number summary and clearly explains how quartiles are used to form the box plot.',
            P: 'Response shows partial understanding of the five-number summary or box plot construction, but leaves out or confuses one major component.',
            I: 'Response does not correctly explain the five-number summary or how quartiles are used in a box plot.'
        },
        commonMistakes: [
            'Leaving out one or more of the five values such as Q1 or Q3',
            'Confusing quartiles with random intervals instead of four equal parts of the data',
            'Describing only the median and not how the box is formed from Q1 to Q3',
            'Ignoring how whiskers or outliers connect to the box plot'
        ],
        contextFromVideo: 'Luke Wilcox explicitly defines the five-number summary, identifies the Flint values as 0, 2, 3, 7, and 104, and explains that the box plot uses Q1 and Q3 for the box and quartiles for the 25% sections.'
    },

    reflect2: {
        questionText: 'How does the shape of a distribution help you predict the relationship between the mean and the median?',
        expectedElements: [
            { id: 'skewed-right', description: 'States that in a skewed-right distribution the mean is greater than the median', required: true },
            { id: 'skewed-left', description: 'States that in a skewed-left distribution the mean is less than the median', required: true },
            { id: 'symmetric', description: 'States that in a symmetric distribution the mean and median are about equal or very similar', required: true },
            { id: 'why-mean-moves', description: 'May explain that the non-resistant mean is pulled toward the longer tail or outliers more than the median', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly connects skewed-right, skewed-left, and symmetric shapes to the correct relationship between the mean and median.',
            P: 'Response gets some of the shape relationships correct but leaves out or mixes up at least one important case.',
            I: 'Response does not correctly explain how shape helps predict the relationship between the mean and median.'
        },
        commonMistakes: [
            'Reversing the skewed-right and skewed-left relationships',
            'Saying the mean and median are always equal',
            'Ignoring the symmetric case',
            'Not recognizing that outliers and long tails pull the mean more strongly than the median'
        ],
        contextFromVideo: 'The video states that the Flint data are skewed right with mean 7.31 and median 3, then generalizes to skewed right mean > median, skewed left mean < median, and symmetric mean about equal to median.'
    },

    exitTicket: {
        questionText: 'A teacher recorded the number of minutes 15 students spent reading before class one morning: 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 15, 22. Find the five-number summary, describe what the box plot would show including any outlier, predict whether the mean is greater than, less than, or about equal to the median and explain why, and write one complete sentence in context.',
        expectedElements: [
            { id: 'five-number-summary', description: 'Gives a correct or very close five-number summary of 1, 3, 5, 9, and 22', required: true },
            { id: 'boxplot-details', description: 'Describes a box from 3 to 9 with a median at 5 and notes whiskers or the right whisker stopping before the outlier', required: true },
            { id: 'outlier', description: 'Identifies 22 as a high outlier or clearly notes a possible high outlier on the right', required: true },
            { id: 'mean-median-relationship', description: 'Explains that the distribution is skewed right so the mean should be greater than the median', required: true },
            { id: 'context-sentence', description: 'Writes in context about students and minutes spent reading before class', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly gives the five-number summary, describes the box plot and outlier, explains that skewed-right shape makes the mean greater than the median, and writes in context.',
            P: 'Response gets much of the analysis right but misses or confuses one major component such as the five-number summary, outlier, box plot details, mean-median comparison, or context.',
            I: 'Response has major errors or omissions in describing the reading-time data with a box plot and shape-based mean-median reasoning.'
        },
        commonMistakes: [
            'Using the maximum 22 as the end of the right whisker even after identifying it as an outlier',
            'Giving an incorrect quartile or median value in the five-number summary',
            'Saying the mean is less than the median even though the data have a long right tail',
            'Forgetting to mention the outlier at 22',
            'Writing about the numbers without mentioning students or reading time in context'
        ],
        contextFromVideo: 'The lesson models how to use the five-number summary to sketch a box plot, how outliers change the whiskers, and how a skewed-right shape means the mean is larger than the median.'
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

    return `You are grading an AP Statistics student's response about graphical representations of summary statistics (Topic 1.8).

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
window.getRubricU1L8 = function(questionId) {
    return window.RUBRICS_U1L8[questionId] || null;
};

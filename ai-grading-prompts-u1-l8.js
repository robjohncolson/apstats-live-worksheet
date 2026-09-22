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
            { id: 'boxplot-feature', description: 'Correctly explains at least one requested box-plot feature: the box runs from Q1 to Q3 with the median inside it, whiskers extend to the most extreme non-outliers, or outliers are plotted separately', required: true },
            { id: 'flint-context', description: 'Uses context by referring to Flint lead levels or Flint water samples', required: false },
            { id: 'numerical-details', description: 'Includes at least two correct numerical values such as 0, 2, 3, 7, 13, or 104', required: false },
            { id: 'quartile-meaning', description: 'May explain that the box plot splits the data into quartiles or that each section contains 25% of the data', required: false }
        ],
        scoringGuide: {
            E: 'Names the five-number summary (min, Q1, median, Q3, max) and correctly describes at least one box-plot feature: the box runs Q1 to Q3 with the median inside, whiskers reach the most extreme non-outliers, or outliers are plotted separately. Lesson values strengthen the answer but are not needed.',
            P: 'Names the summary but describes the box plot incorrectly (e.g. whiskers always reach the min and max), or describes the plot without naming what the five values are.',
            I: 'Neither the five-number summary nor a box-plot feature is correctly explained.'
        },
        commonMistakes: [
            'Listing numbers without explaining what part of the box plot they represent',
            'Saying the whiskers always go to the minimum and maximum even when outliers exist',
            'Forgetting that the median is the line inside the box',
            'Listing five numbers without saying which part of the box plot each one becomes'
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
            { id: 'flint-connection', description: 'Connects the rule to the Flint box plot or Flint lead levels by noting that the Flint distribution is skewed right and has mean 7.31 above median 3', required: false },
            { id: 'median-resistant', description: 'May mention that the median is resistant compared with the mean', required: false }
        ],
        scoringGuide: {
            E: 'States all three relationships (skewed right: mean above median; skewed left: mean below; symmetric: about equal) and explains that the tail or outliers pull the mean because it is not resistant.',
            P: 'Three of the four are correct; one relationship is missing or reversed, or the pulling-the-mean reason is missing.',
            I: 'Two or more relationships are wrong or missing.'
        },
        commonMistakes: [
            'Reversing the relationships for skewed-right and skewed-left distributions',
            'Saying the mean and median are always exactly equal for symmetric distributions',
            'Ignoring the way outliers pull the mean more than the median',
            'Stating the rules without saying why the tail moves the mean'
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
            { id: 'context', description: 'Uses context by referring to homework times or minutes spent on homework', required: false },
            { id: 'quartile-language', description: 'May mention quartiles or the five-number summary by name', required: false }
        ],
        scoringGuide: {
            E: 'Box from 18 to 31 with the median line at 22; whiskers to 12 and 38 with 58 as a separate outlier point; middle 50% between 18 and 31 minutes; mean predicted greater than the median because of the high outlier.',
            P: 'Three of the four are correct; one is missing or wrong (commonly the whisker sent to 58, or the mean predicted below the median).',
            I: 'Two or more of the four are missing or wrong.'
        },
        commonMistakes: [
            'Sending the right whisker to 58 even though 58 is identified as an outlier',
            'Saying the middle 50% runs from the minimum to the maximum',
            'Predicting the mean is less than the median despite the high outlier on the right',
            'Sending the whisker to the outlier instead of the largest non-outlier'
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
window.getRubricU1L8 = function(questionId) {
    return window.RUBRICS_U1L8[questionId] || null;
};

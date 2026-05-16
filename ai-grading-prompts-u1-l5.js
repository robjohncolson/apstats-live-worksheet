/**
 * AI Grading Prompts for Unit 1 Lesson 5: Topic 1.5
 * Topic 1.5: Representing a Quantitative Variable with Graphs
 *
 * Learning Objectives:
 *   Distinguish between discrete and continuous quantitative variables
 *   Connect discrete variables to counting and continuous variables to measuring
 *   Represent quantitative data with dot plots, stem-and-leaf plots, and histograms
 *   Explain the advantages and disadvantages of each display
 *   Choose an appropriate graph for small or large quantitative data sets
 *   Use graphs to describe the shape of a distribution
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L5 = `
VIDEO 1 - Representing a Quantitative Variable with Graphs (~8:37):
- The lesson asks how to represent a quantitative variable with graphs.
- Students review that categorical variables use category names or labels, while quantitative variables use numerical values for measured or counted quantities.
- There are two types of quantitative variables: discrete and continuous.
- A discrete variable can take a countable number of values with gaps.
- The example of a discrete variable is number of siblings because values such as 2.5 or 2.73 do not make sense.
- A continuous variable can take infinitely many values with no gaps.
- The example of a continuous variable is height because values such as 61, 61.5, and 61.97 are all possible.
- A good rule of thumb is that discrete variables usually come from counting and continuous variables usually come from measuring.
- The main data set is the Flint water crisis example: lead levels measured in 71 water samples from Flint residents from January to June 2015.
- The lead level variable is quantitative and continuous because the original measured values included decimals even though the reported values were rounded to whole numbers.
- A dot plot is highlighted as a favorite display because it shows every individual value and makes the shape of the distribution easy to see.
- A disadvantage of a dot plot is that it becomes hard to make and read when the data set is very large.
- A stem-and-leaf plot also shows every individual value and makes the shape easy to see.
- In a stem-and-leaf plot, the stem is on the left of the vertical line and the leaf is on the right.
- When one stem has many leaves, split stems can be used, usually with one row for 0 through 4 and another for 5 through 9.
- A histogram groups data into intervals of values instead of showing each exact value.
- Endpoint rules matter in a histogram: in the example, the value 10 belongs in the bar with the left endpoint.
- Changing the interval width can change the look and feel of a histogram.
- A histogram is easier to make for large data sets and still makes the shape of the distribution easy to see.
- A disadvantage of a histogram is that it loses the information about each individual data value.
- The key takeaway is that dot plots and stem-and-leaf plots are best when seeing exact values matters, while histograms are especially useful for larger quantitative data sets.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L5 = {
    reflect1: {
        questionText: 'How can you tell whether a quantitative variable is discrete or continuous?',
        expectedElements: [
            { id: 'discrete-definition', description: 'Explains that a discrete variable has countable values and gaps between possible values', required: true },
            { id: 'continuous-definition', description: 'Explains that a continuous variable can take infinitely many values and has no gaps', required: true },
            { id: 'counting-vs-measuring', description: 'Explains that discrete variables usually come from counting and continuous variables usually come from measuring', required: true },
            { id: 'example', description: 'May use an example such as siblings for discrete or height for continuous', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes discrete from continuous by describing countable values with gaps versus infinitely many values with no gaps, and connects them to counting versus measuring.',
            P: 'Response shows partial understanding of the difference, but leaves out a major idea such as gaps, infinitely many values, or the connection to counting and measuring.',
            I: 'Response does not correctly explain how to distinguish discrete and continuous quantitative variables.'
        },
        commonMistakes: [
            'Saying discrete and continuous are both just numbers without explaining the difference',
            'Leaving out gaps for discrete variables',
            'Leaving out no gaps or infinitely many values for continuous variables',
            'Not connecting the distinction to counting versus measuring'
        ],
        contextFromVideo: 'The video emphasizes that discrete variables are countable with gaps, continuous variables have infinitely many values with no gaps, and counting versus measuring is a useful clue.'
    },

    reflect2: {
        questionText: 'When would you choose a histogram instead of a dot plot or stem-and-leaf plot?',
        expectedElements: [
            { id: 'large-data-set', description: 'Explains that a histogram is especially useful when the data set is very large', required: true },
            { id: 'shape-visible', description: 'Explains that a histogram still makes it easy to see the shape of the distribution', required: true },
            { id: 'contrast-with-dot-stem', description: 'Explains that dot plots and stem-and-leaf plots show individual values but become harder to make or read for large data sets', required: true },
            { id: 'tradeoff', description: 'May mention that a histogram loses the exact individual values or depends on interval width', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that histograms are better for large data sets because they still show overall shape, while dot plots and stem-and-leaf plots become harder to use even though they show exact values.',
            P: 'Response recognizes that histograms can help, but does not clearly explain the large-data-set advantage, the shape advantage, or the tradeoff with individual values.',
            I: 'Response does not correctly explain when a histogram should be chosen over a dot plot or stem-and-leaf plot.'
        },
        commonMistakes: [
            'Saying a histogram is always better no matter the data size',
            'Ignoring that dot plots and stem-and-leaf plots show exact individual values',
            'Not mentioning that histograms are especially helpful for large data sets',
            'Not mentioning shape or the tradeoff of losing exact values'
        ],
        contextFromVideo: 'The video says histograms are easier to make for large data sets and still show shape, but they lose information about each individual value.'
    },

    exitTicket: {
        questionText: 'A teacher recorded the commute times, in minutes, for 18 students one morning: 12, 15, 15, 18, 19, 21, 22, 22, 24, 25, 27, 29, 30, 31, 33, 35, 37, 44. Identify the individuals and the variable, state whether the variable is categorical or quantitative, decide whether it is discrete or continuous and explain why, decide whether a dot plot or stem-and-leaf plot is a better choice than a histogram and justify that choice, explain why a histogram would be more useful with hundreds of commute times, and describe one thing a graph could help you notice about the distribution.',
        expectedElements: [
            { id: 'individuals-variable', description: 'Identifies the individuals as the 18 students and the variable as commute time in minutes, and states that the variable is quantitative', required: true },
            { id: 'continuous-reasoning', description: 'Explains that commute time is continuous because it is measured and could take many decimal values with no gaps even if recorded in whole minutes', required: true },
            { id: 'small-data-display', description: 'Chooses a dot plot or stem-and-leaf plot for this small data set and justifies that it shows each individual value while still showing shape', required: true },
            { id: 'histogram-large-data', description: 'Explains that a histogram would be more useful with hundreds of data values because it is easier to make and interpret for large data sets', required: true },
            { id: 'distribution-feature', description: 'Describes one thing the graph could reveal, such as shape, clusters, gaps, or a possible high value like 44', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the individuals and quantitative variable, explains why the variable is continuous, chooses an appropriate small-data display with justification, explains why histograms help with very large data sets, and states a valid feature the graph could reveal about the distribution.',
            P: 'Response gets much of the reasoning correct but misses or confuses one major part such as the variable type, the continuous explanation, the graph choice, the histogram comparison, or the distribution feature.',
            I: 'Response has major errors or omissions in identifying the variable, classifying it, choosing and justifying a display, or explaining what the graph would reveal.'
        },
        commonMistakes: [
            'Calling commute time discrete just because the listed values are whole numbers',
            'Choosing a histogram without explaining why exact individual values are useful for a small data set',
            'Forgetting that measured quantities can have decimal values even when rounded',
            'Not explaining why histograms are more helpful for hundreds of observations',
            'Giving no description of what the graph could reveal about the distribution'
        ],
        contextFromVideo: 'The lesson stresses that measured quantities are continuous, dot plots and stem-and-leaf plots are good for seeing each exact value in smaller data sets, and histograms are especially useful once the data set becomes large.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L5[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about representing a quantitative variable with graphs (Topic 1.5).

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
window.getRubricU1L5 = function(questionId) {
    return window.RUBRICS_U1L5[questionId] || null;
};





/**
 * AI Grading Prompts for Unit 1 Lesson 4: Representing a Categorical Variable with Graphs
 * Topic 1.4: Representing a Categorical Variable with Graphs
 *
 * Learning Objectives:
 *   Represent categorical data graphically with bar charts and pie charts
 *   Construct well-labeled graphs with appropriate scales
 *   Interpret graphs of categorical data and decide whether claims are supported
 *   Compare multiple sets of categorical data using relative frequencies
 *   Use grouped relative frequency bar charts to compare distributions in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L4 = `
VIDEO 1 - Representing a Categorical Variable with Graphs (~8:53):
- The lesson asks how categorical data can be represented graphically and how graphs help describe categorical data.
- Main example: a random sample of 50 high school students completed an online survey about which superpower they would most like to have.
- The individuals are the 50 students, and the variable is superpower preference, which is categorical.
- A frequency bar chart or bar graph can represent the category counts.
- A relative frequency bar chart can represent the category proportions or percents.
- Good bar chart habits include labeling the axes, putting the variable on the horizontal axis, using frequency or relative frequency on the vertical axis, starting the vertical axis at zero, and drawing equal-width bars with gaps between categories.
- In the superpower practice question, the unsupported statement is that freeze time was chosen by twice as many students as fly, because freeze time is 15 and fly is 9.
- Freeze time and telepathy together account for 31 out of 50 students, which is 62%.
- Telepathy is the most popular choice with frequency 16.
- Pie charts are another graphical representation for categorical data, and they should include a legend or key.
- In the screen media practice graph, the unsupported statement is choice C because the graph shows about four times as many, not five times as many.
- The takeaway is that bar charts, relative frequency bar charts, and pie charts reveal information that can be used to justify claims in context.

VIDEO 2 - Comparing Multiple Sets of Categorical Data (~8:53):
- The lesson asks how to represent multiple sets of data for the same categorical variable in tables and graphs and how to compare the distributions.
- A teacher surveyed students in her classes and wants to compare superpower preferences for 80 boys and 125 girls.
- The frequency counts are: fly 20 males and 40 females, freeze time 28 males and 28 females, invisibility 15 males and 21 females, super strength 10 males and 5 females, and telepathy 7 males and 31 females.
- A count can be the same in two groups while the proportions are different because the group sizes are different.
- The supported statement from the table is that telepathy was preferred by less than 10% of males and almost 25% of females.
- Relative frequencies are better than raw counts when comparing groups of different sizes.
- A grouped relative frequency bar chart should still have labeled axes, an appropriate scale, spaces between category groups, and a legend or key.
- The grouped bars may be organized by category or by group, so students need to interpret either display correctly.
- In the tweens versus teens screen media graph, the supported statement is choice B because both groups have about 0.51 in the 2+ to 8 hours range.
- The graph shows that teens generally report more screen media use than tweens.
- The takeaway is that tables and relative frequency bar graphs can both be used to compare multiple sets of categorical data and justify claims in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L4 = {
    reflect1: {
        questionText: 'How do labels, scales, and bar heights help a graph communicate the distribution of a categorical variable?',
        expectedElements: [
            { id: 'axis-labels', description: 'Explains that the axes should be labeled with the variable and with frequency or relative frequency', required: true },
            { id: 'appropriate-scale', description: 'Explains that the vertical axis should use an appropriate scale and start at zero to avoid distortion', required: true },
            { id: 'bar-heights', description: 'Explains that bar heights show the frequencies or relative frequencies for the categories', required: true },
            { id: 'clear-design', description: 'May mention equal-width bars, gaps, or other features that make the graph easier to read', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains how labels identify what is being graphed, how scale prevents distortion, and how bar heights show the distribution across categories.',
            P: 'Response shows partial understanding of graph communication but leaves out a major idea such as labels, scale, or what the bar heights represent.',
            I: 'Response does not correctly explain how labels, scales, and bar heights help communicate the distribution.'
        },
        commonMistakes: [
            'Only saying graphs help you see the data without explaining how',
            'Ignoring the need to label axes',
            'Not mentioning that the vertical scale should start at zero',
            'Failing to connect bar heights to frequencies or relative frequencies'
        ],
        contextFromVideo: 'The video emphasizes labeling the axes, starting the vertical axis at zero, and using bar heights to represent category frequencies or relative frequencies.'
    },

    reflect2: {
        questionText: 'Why are relative frequencies usually more useful than raw counts when comparing categorical data from groups of different sizes?',
        expectedElements: [
            { id: 'different-group-sizes', description: 'Explains that raw counts can be misleading when the groups are different sizes', required: true },
            { id: 'within-group-proportions', description: 'Explains that relative frequencies compare proportions or percents within each group', required: true },
            { id: 'fair-comparison', description: 'Explains that relative frequencies make comparisons between groups more fair or meaningful', required: true },
            { id: 'video-example', description: 'May mention an example such as 28 males and 28 females choosing freeze time but a larger male proportion', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that different group sizes make counts alone misleading and that relative frequencies allow fair comparisons using within-group proportions or percents.',
            P: 'Response recognizes that relative frequencies help, but does not clearly explain why different group sizes matter or how proportions improve the comparison.',
            I: 'Response does not correctly explain why relative frequencies are more useful for comparing groups of different sizes.'
        },
        commonMistakes: [
            'Treating equal counts as meaning equal popularity across groups',
            'Not mentioning that the group sizes are different',
            'Saying relative frequencies and counts tell the same comparison story',
            'Giving no explanation of proportions or percents within each group'
        ],
        contextFromVideo: 'The video stresses that even though 28 males and 28 females chose freeze time, the larger proportion is for males because there were only 80 males but 125 females.'
    },

    exitTicket: {
        questionText: 'A school surveyed two grade levels about which school event they enjoy most. Among 40 sophomores, the responses were pep rallies = 14, dances = 10, games = 9, and assemblies = 7. Among 60 seniors, the responses were pep rallies = 12, dances = 18, games = 15, and assemblies = 15. Identify the individuals and variable, state whether the variable is categorical or quantitative, explain why a relative frequency bar chart is better for comparing the groups, give the relative frequencies or percents, describe key graph features, and write one supported comparison in context.',
        expectedElements: [
            { id: 'individuals', description: 'Identifies the individuals as the surveyed sophomores and seniors', required: true },
            { id: 'variable-type', description: 'Identifies the variable as preferred school event and states that it is categorical', required: true },
            { id: 'why-relative-frequency', description: 'Explains that a relative frequency bar chart is better because the group sizes are different, 40 versus 60', required: true },
            { id: 'relative-frequencies', description: 'Gives the relative frequencies or percents for the categories in each group, such as 35%, 25%, 22.5%, 17.5% for sophomores and 20%, 30%, 25%, 25% for seniors', required: true },
            { id: 'graph-features', description: 'Describes key graph features such as labeled axes, a vertical scale starting at zero, grouped equal-width bars with gaps, and a legend or key', required: true },
            { id: 'supported-comparison', description: 'Writes one valid supported comparison in context using numbers from the data', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the individuals and categorical variable, explains why relative frequencies are needed, gives the percents, describes the graph features, and provides a supported comparison in context.',
            P: 'Response gets most of the comparison work correct but misses or confuses one major part such as the variable type, the need for relative frequencies, the percents, or the graph features.',
            I: 'Response has major errors or omissions in the identification, comparison reasoning, percentages, graph description, or contextual interpretation.'
        },
        commonMistakes: [
            'Calling the variable quantitative instead of categorical',
            'Using only counts without explaining why relative frequencies matter',
            'Forgetting that the groups have different sizes',
            'Describing the graph without labels, a zero baseline, or a legend',
            'Making a comparison without supporting it with numbers in context'
        ],
        contextFromVideo: 'The lesson emphasizes that grouped categorical comparisons should usually use relative frequencies when group sizes differ and that good graphs need labels, scales, and legends to justify claims in context.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L4[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about representing a categorical variable with graphs (Topic 1.4).

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
window.getRubricU1L4 = function(questionId) {
    return window.RUBRICS_U1L4[questionId] || null;
};

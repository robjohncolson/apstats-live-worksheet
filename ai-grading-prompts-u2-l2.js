/**
 * AI Grading Prompts for Unit 2 Lesson 2: Representing Two Categorical Variables
 * Topic 2.2: Required Course Content
 *
 * Learning Objectives:
 *   Use a two-way table to summarize two categorical variables
 *   Calculate relative frequencies within groups
 *   Compare distributions with side-by-side bar graphs, segmented bar graphs, and mosaic plots
 *   Determine whether two categorical variables are associated
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L2 = `
VIDEO 1 - Representing Two Categorical Variables (~7:21):
- The lesson introduces two main questions: how to construct graphical displays for two categorical variables and how to use those displays to determine whether the variables are associated.
- The example compares age group and educational attainment using a two-way table with three age-group columns and four educational-attainment categories.
- A two-way table is also called a contingency table.
- Before making graphs, the speaker finds the total for each age-group column.
- To compare educational attainment within each age group, each cell count is divided by that column total, producing percents that describe the distribution within the group.
- Those percents are then used to build a side-by-side bar graph.
- A segmented bar graph is created by stacking the bars for each group so the full bar reaches 100%.
- A mosaic plot is a segmented bar graph in which bar width depends on the size of the group, so it shows both distributions and group sizes.
- The segmented bar graph and mosaic plot can be used to compare distributions across groups.
- If the distributions are not the same for each group, then the two categorical variables are associated.
- Another way to say this is that if knowing one variable helps predict the other, there is an association.

AP CLASSROOM FRAMEWORK CONNECTION:
- A two-way table can contain frequency counts or relative frequencies.
- A joint relative frequency is a cell frequency divided by the total for the entire table.
- Side-by-side bar graphs, segmented bar graphs, and mosaic plots are standard displays for comparing two categorical variables.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L2 = {
    reflect1: {
        questionText: 'Why does dividing by the column total help when comparing educational attainment across age groups?',
        expectedElements: [
            { id: 'within-group-percent', description: 'Explains that dividing by the column total converts counts to percents or relative frequencies within each age group', required: true },
            { id: 'fair-comparison', description: 'Explains that this makes the comparison fair because the age groups can have different sizes', required: true },
            { id: 'compare-distributions', description: 'Explains that using percents lets you compare the distributions across groups rather than raw counts', required: true },
            { id: 'sum-to-100', description: 'May mention that the percents within a group add to 100%', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that dividing by the column total creates within-group percents, makes comparisons fair across different-sized groups, and helps compare distributions rather than raw counts.',
            P: 'Response explains part of the idea, such as using percents or accounting for different group sizes, but is incomplete.',
            I: 'Response does not correctly explain why the column total is used.'
        },
        commonMistakes: [
            'Saying the column total is used only because the calculator requires it',
            'Comparing raw counts instead of percents',
            'Not mentioning that the groups can be different sizes',
            'Confusing a column relative frequency with a joint relative frequency'
        ],
        contextFromVideo: 'The video repeatedly divides each educational-attainment count by the age-group column total so the distribution within each age group can be compared fairly.'
    },

    reflect2: {
        questionText: 'How can a segmented bar graph or mosaic plot help you decide whether two categorical variables are associated?',
        expectedElements: [
            { id: 'compare-distributions', description: 'Explains that you compare the distributions for the groups', required: true },
            { id: 'not-same-means-association', description: 'States that if the distributions are not the same, the variables are associated', required: true },
            { id: 'predictive-language', description: 'May explain that if knowing one variable helps predict the other, that indicates association', required: false },
            { id: 'mosaic-widths', description: 'May mention that a mosaic plot also shows group sizes through bar widths', required: false }
        ],
        scoringGuide: {
            E: 'Response explains that segmented bar graphs or mosaic plots let you compare group distributions and that different distributions indicate an association.',
            P: 'Response mentions graphs or association but does not clearly connect the comparison of distributions to the conclusion about association.',
            I: 'Response does not correctly explain how these graphs are used to decide whether variables are associated.'
        },
        commonMistakes: [
            'Claiming there is association whenever the groups have different sizes',
            'Looking only at raw counts instead of distributions',
            'Saying the bars must be exactly equal for the variables to be associated',
            'Describing correlation or slope instead of association between categorical variables'
        ],
        contextFromVideo: 'Near the end of the video, the speaker says that if the distributions in the segmented bar graph are not the same for each group, then the variables are associated.'
    },

    exitTicket: {
        questionText: 'A school surveyed students about grade level and whether they play a school sport. The table shows 18 yes and 12 no for 9th grade, 24 yes and 16 no for 10th grade, and 14 yes and 36 no for 11th grade. Identify the variables, explain why the table is two-way, find the conditional distributions within 9th and 11th grade, explain what a segmented bar graph would show about association, and state one advantage of a mosaic plot.',
        expectedElements: [
            { id: 'identify-variables', description: 'Identifies the variables as grade level and school sport participation and recognizes that both are categorical', required: true },
            { id: 'two-way-table', description: 'Explains that it is a two-way table because it summarizes counts for two categorical variables together', required: true },
            { id: 'ninth-grade-distribution', description: 'Gives the 9th-grade conditional distribution as 60% plays a sport and 40% does not', required: true },
            { id: 'eleventh-grade-distribution', description: 'Gives the 11th-grade conditional distribution as 28% plays a sport and 72% does not, or equivalent approximations', required: true },
            { id: 'association-conclusion', description: 'Explains that the segmented bars would look different because the distributions are different, so the variables are associated', required: true },
            { id: 'mosaic-advantage', description: 'States that a mosaic plot also shows the different group sizes through bar widths', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the variables, explains the two-way table, gives the 9th-grade and 11th-grade conditional distributions, concludes the variables are associated because the distributions differ, and explains that a mosaic plot shows group sizes.',
            P: 'Response gets most major ideas correct but misses one or two parts, such as a percentage, the reason for association, or the mosaic-plot advantage.',
            I: 'Response has major errors about the variables, the conditional distributions, or the conclusion about association, or omits several required elements.'
        },
        commonMistakes: [
            'Using raw counts instead of conditional percents',
            'Dividing by the grand total instead of the grade-level total',
            'Saying the variables are associated only because the totals 30, 40, and 50 are different',
            'Forgetting that a mosaic plot shows group size with bar width'
        ],
        contextFromVideo: 'The video builds percents within each group, compares those distributions with segmented bars, and then uses mosaic plots to add information about group size.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L2 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L2[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about representing two categorical variables (Topic 2.2).

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
window.getRubricU2L2 = function(questionId) {
    return window.RUBRICS_U2L2[questionId] || null;
};

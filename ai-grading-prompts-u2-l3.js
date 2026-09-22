/**
 * AI Grading Prompts for Unit 2 Lesson 3: Statistics for Two Categorical Variables
 * Topic 2.3: Required Course Content
 *
 * Learning Objectives:
 *   Calculate joint, marginal, and conditional relative frequencies for two categorical variables
 *   Compare conditional distributions across groups
 *   Use summary statistics to determine whether two categorical variables are associated
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L3 = `
VIDEO 1 - Statistics for Two Categorical Variables (~8:53):
- The lesson introduces two main questions: how to calculate summary statistics for two categorical variables and how to use those statistics to determine whether the variables are associated.
- The example again compares age group and educational attainment using a two-way table.
- The first step is to find the column totals, row totals, and grand table total.
- A joint relative frequency is a cell frequency divided by the total for the entire table. The example of 25 to 34 years old with a master's degree or higher gives 2.1%.
- A marginal relative frequency is a row total or column total divided by the table total. The example of only a high school diploma gives 39%, and the example of being 35 to 54 years old gives 37.6%.
- A conditional relative frequency is a relative frequency within a specific row or column. The video finds 34.1% for the percent of high school diploma holders who are 35 to 54 and 7.2% for the percent of 25 to 34 year olds with no high school diploma.
- The previous lesson's within-column distributions are identified as conditional relative frequencies.
- Those conditional relative frequencies can be represented with segmented bar graphs.
- The key summary statistics for deciding whether variables are associated are the conditional relative frequencies.
- If the distributions of conditional relative frequencies are not the same for all groups, then the two categorical variables are associated.

AP CLASSROOM FRAMEWORK CONNECTION:
- Marginal relative frequencies are the row and column totals in a two-way table divided by the total for the entire table.
- Conditional relative frequencies describe a specific part of a two-way table by using a row total or column total as the denominator.
- Summary statistics for two categorical variables can be used to compare distributions and determine whether variables are associated.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L3 = {
    reflect1: {
        questionText: 'How is a marginal relative frequency different from a conditional relative frequency?',
        expectedElements: [
            { id: 'marginal-definition', description: 'Explains that a marginal relative frequency uses a row total or column total divided by the table total', required: true },
            { id: 'conditional-definition', description: 'Explains that a conditional relative frequency uses a cell count divided by a specific row total or column total', required: true },
            { id: 'overall-vs-within-group', description: 'Explains that marginal describes an overall proportion while conditional describes a proportion within a group', required: false },
            { id: 'denominator-language', description: 'May explicitly mention that the denominators are different', required: false }
        ],
        scoringGuide: {
            E: 'Marginal: a row or column total over the table total (an overall proportion). Conditional: a cell over its row or column total (a proportion within a group). The overall-vs-within-group contrast is carried by those two definitions.',
            P: 'One of the two is defined correctly; the other is missing or muddled.',
            I: 'Neither is defined correctly (e.g. the table total used for both), or they are treated as the same thing.'
        },
        commonMistakes: [
            'Using the table total for both statistics',
            'Saying marginal and conditional relative frequencies are the same thing',
            'Describing only the numerator and not the denominator',
            'Not explaining that conditional relative frequency is within a chosen row or column'
        ],
        contextFromVideo: 'The lesson uses row total or column total over table total for marginal relative frequencies, then uses one row or one column at a time for conditional relative frequencies.'
    },

    reflect2: {
        questionText: 'Why are conditional relative frequencies the best summary statistics for deciding whether two categorical variables are associated?',
        expectedElements: [
            { id: 'within-group-distributions', description: 'Explains that conditional relative frequencies show the distribution within each group', required: true },
            { id: 'compare-groups', description: 'Explains that these within-group distributions can be compared across groups', required: false },
            { id: 'different-means-association', description: 'States that if the conditional distributions are not the same, the variables are associated', required: true },
            { id: 'supports-graphical-conclusion', description: 'May mention that these summary statistics support the conclusion seen in a segmented bar graph', required: false }
        ],
        scoringGuide: {
            E: 'Explains that conditional relative frequencies give the distribution within each group so the groups can be compared, and that different conditional distributions mean the variables are associated.',
            P: 'Says they show within-group distributions without the association rule, or states the rule without saying what is compared.',
            I: 'Uses marginal frequencies or raw counts to decide association.'
        },
        commonMistakes: [
            'Using marginal relative frequencies to decide association',
            'Comparing raw counts instead of within-group percentages',
            'Saying the variables are associated only because the groups have different totals',
            'Not stating that the conditional distributions must be compared across groups'
        ],
        contextFromVideo: 'Near the end of the lesson, the speaker says the important summary statistics for determining association are the conditional relative frequencies, and if their distributions differ across groups, the variables are associated.'
    },

    exitTicket: {
        questionText: 'A school surveyed students about grade level and preferred study style. The table shows 18 alone and 12 group for 9th grade, 12 alone and 18 group for 10th grade, and 10 alone and 30 group for 11th grade. Identify the variables, explain why the table is two-way, find the joint relative frequency for 11th grade and prefers group, find the marginal relative frequency for 10th grade, find the conditional distributions within 9th and 11th grade, and decide whether the variables are associated.',
        expectedElements: [
            { id: 'identify-variables', description: 'Identifies the variables as grade level and preferred study style and recognizes that both are categorical', required: true },
            { id: 'two-way-table', description: 'Explains that it is a two-way table because it summarizes counts for two categorical variables together', required: false },
            { id: 'joint-relative-frequency', description: 'Gives the joint relative frequency for 11th grade and prefers group as 30% or 0.30', required: true },
            { id: 'marginal-relative-frequency', description: 'Gives the marginal relative frequency for 10th grade as 30% or 0.30', required: true },
            { id: 'conditional-ninth', description: 'Gives the 9th-grade conditional distribution as 60% alone and 40% group', required: false },
            { id: 'conditional-eleventh', description: 'Gives the 11th-grade conditional distribution as 25% alone and 75% group', required: true },
            { id: 'association-conclusion', description: 'Explains that the variables are associated because the conditional distributions are different across grade levels', required: true }
        ],
        scoringGuide: {
            E: 'Variables: grade level and preferred study style, both categorical; joint (11th grade and group) = 30/100 = 0.30; marginal (10th grade) = 30/100 = 0.30; 11th-grade conditional 25% alone / 75% group (grade total as denominator); concludes association because the conditional distributions differ across grades. The 9th-grade distribution and \'two-way\' explanation strengthen the answer.',
            P: 'Four of the five are correct; one is missing or wrong (commonly a wrong denominator).',
            I: 'Two or more of the five are missing or wrong, or association is concluded from totals alone.'
        },
        commonMistakes: [
            'Using the wrong denominator for the joint relative frequency',
            'Using the grand total instead of the grade-level total for the conditional distributions',
            'Confusing the marginal relative frequency with a conditional relative frequency',
            'Concluding association from totals alone instead of comparing conditional distributions'
        ],
        contextFromVideo: 'The lesson distinguishes joint, marginal, and conditional relative frequencies by denominator, then uses the conditional distributions to determine whether the variables are associated.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L3[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about statistics for two categorical variables (Topic 2.3).

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
window.getRubricU2L3 = function(questionId) {
    return window.RUBRICS_U2L3[questionId] || null;
};

/**
 * AI Grading Prompts for Unit 2 Lesson 1: Required Course Content
 * Topic 2.1: Required Course Content
 *
 * Learning Objectives:
 *   Identify questions to be answered about possible relationships in data
 *   Distinguish between categorical and quantitative variables in two-variable settings
 *   Choose appropriate graphical displays for two categorical variables and two quantitative variables
 *   Recognize numerical summaries used to study possible relationships
 *   Explain that apparent patterns and associations in data may be random or not
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L1 = `
VIDEO 1 - Introducing Statistics: Are Variables Related? (~6:55):
- Unit 2 begins with two-variable analysis and asks two core questions: how to decide whether two categorical variables are related, and how to decide whether two quantitative variables are related.
- Review from Unit 1: a categorical variable takes values that are category names or labels, while a quantitative variable takes numerical values for a measured or counted quantity.
- First example: age group and educational attainment.
- Educational attainment is categorical because it consists of categories.
- Age group is also categorical in this example because ages have been grouped into categories such as 25 to 34, 35 to 54, and 55 and older.
- To determine whether two categorical variables are related, start with graphical representations and then use numerical representations.
- The video shows a segmented bar graph and a mosaic plot as graphical displays for two categorical variables.
- The video then uses percents in a two-way table, which are conditional relative frequencies, to compare groups.
- Example interpretations from those percents: people ages 25 to 34 are less likely to have no high school diploma, and people ages 35 to 54 are more likely to have a master's degree or higher.
- Second example: school attendance and math scores from a random sample of 11 students.
- Attendance is recorded as percent of school days attended, and math performance is recorded as number of Algebra 1 questions answered correctly.
- Both variables in this second example are quantitative.
- To determine whether two quantitative variables are related, start with a scatter plot and then use numerical representations.
- The numerical summaries named in the video are correlation r, the equation of a line of best fit, and the coefficient of determination.
- The scatter plot suggests that as attendance increases, exam performance tends to increase.
- Final takeaway: for two categorical variables, use bar-graph-based displays and conditional relative frequencies from a two-way table; for two quantitative variables, use a scatter plot plus correlation, linear regression, and coefficient of determination.
- Essential knowledge emphasis: apparent patterns and associations in data may be random or not.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L1 = {
    reflect1: {
        questionText: 'How does identifying whether variables are categorical or quantitative help you choose the correct graph and numerical summary?',
        expectedElements: [
            { id: 'identify-type-first', description: 'Explains that you first identify whether the variables are categorical or quantitative', required: true },
            { id: 'categorical-tools', description: 'States that two categorical variables use displays such as segmented bar graphs or mosaic plots and numerical summaries such as conditional relative frequencies from a two-way table', required: true },
            { id: 'quantitative-tools', description: 'States that two quantitative variables use a scatter plot and numerical summaries such as correlation, line of best fit, or coefficient of determination', required: true },
            { id: 'match-method-to-data', description: 'May explain that the variable type tells you which method fits the data and helps you judge whether a relationship appears to exist', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly says that the variable type must be identified first and correctly matches two categorical variables with categorical tools and two quantitative variables with quantitative tools.',
            P: 'Response includes part of the matching correctly, but misses one set of tools or does not clearly explain why identifying the variable type matters.',
            I: 'Response does not correctly connect variable type to the appropriate graph and numerical summary.'
        },
        commonMistakes: [
            'Mixing up categorical and quantitative variables',
            'Saying to use a scatter plot for categorical variables',
            'Leaving out numerical summaries entirely',
            'Naming tools without explaining that variable type determines the choice'
        ],
        contextFromVideo: 'The video says to start with graphical representations and then use numerical representations, with segmented bar graphs and mosaic plots for two categorical variables and scatter plots plus correlation/regression summaries for two quantitative variables.'
    },

    reflect2: {
        questionText: 'Why does this lesson warn that an apparent pattern or association may be random and not automatically meaningful?',
        expectedElements: [
            { id: 'random-variation', description: 'Explains that a visible pattern or association could happen because of random variation or chance', required: true },
            { id: 'not-automatic-proof', description: 'Explains that seeing a pattern does not automatically prove a real relationship', required: true },
            { id: 'need-analysis', description: 'Explains that we use graphs and numerical summaries to investigate the relationship more carefully before drawing conclusions', required: true },
            { id: 'uncertain-conclusions', description: 'May mention that conclusions in statistics are uncertain because variation may be random or not', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that an observed pattern could be due to chance, does not automatically prove a relationship, and therefore needs careful statistical investigation.',
            P: 'Response mentions chance or uncertainty, but does not clearly explain why that matters for deciding whether variables are related.',
            I: 'Response treats any visible pattern as definite proof of a relationship or does not address randomness.'
        },
        commonMistakes: [
            'Claiming that any pattern in a graph proves the variables are related',
            'Ignoring random variation or chance',
            'Talking only about strong relationships without mentioning uncertainty',
            'Confusing an apparent pattern with a guaranteed cause-and-effect conclusion'
        ],
        contextFromVideo: 'The AP framework for this lesson states that apparent patterns and associations in data may be random or not, so conclusions about relationships are uncertain.'
    },

    exitTicket: {
        questionText: 'A school counselor is investigating Study A: grade level and preferred after-school activity, and Study B: hours of sleep and quiz score. Identify the variable types, name appropriate graphs and numerical summaries, describe a pattern that would suggest a relationship in each study, and explain why an apparent pattern might still be due to random variation.',
        expectedElements: [
            { id: 'study-a-types', description: 'States that in Study A both variables are categorical', required: true },
            { id: 'study-a-tools', description: 'Names an appropriate graph for Study A such as a segmented bar graph or mosaic plot and a numerical summary such as conditional relative frequencies from a two-way table', required: true },
            { id: 'study-b-types', description: 'States that in Study B both variables are quantitative', required: true },
            { id: 'study-b-tools', description: 'Names an appropriate graph for Study B as a scatter plot and names two numerical summaries such as correlation, line of best fit, or coefficient of determination', required: true },
            { id: 'pattern-study-a', description: 'Describes a possible pattern for Study A such as noticeably different conditional distributions across grade levels or activity groups', required: true },
            { id: 'pattern-study-b', description: 'Describes a possible pattern for Study B such as points trending upward or downward in the scatter plot', required: true },
            { id: 'random-variation', description: 'Explains that an apparent pattern in either study could still be caused by random variation or chance and therefore does not automatically prove a real relationship', required: true },
            { id: 'careful-conclusion', description: 'May mention that we use the chosen displays and summaries to investigate before making a conclusion', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the variable types for both studies, matches each study with the right graph and numerical summaries, describes a sensible pattern that would suggest a relationship, and explains that the pattern could still be due to random variation.',
            P: 'Response gets most major ideas correct but misses one part, such as the variable types, the appropriate summaries, or the explanation about random variation.',
            I: 'Response has major mix-ups about variable types or tools, or does not explain how apparent patterns may still be random.'
        },
        commonMistakes: [
            'Treating grade level and after-school activity as quantitative variables',
            'Using a scatter plot for Study A or a bar graph for Study B',
            'Listing only graphs and no numerical summaries',
            'Forgetting to explain that an apparent pattern might be due to chance',
            'Describing a pattern without connecting it to whether the variables might be related'
        ],
        contextFromVideo: 'The lesson ends by pairing two categorical variables with bar-graph-based displays and conditional relative frequencies, and pairing two quantitative variables with a scatter plot plus correlation, linear regression, and coefficient of determination.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L1 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L1[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about introducing statistics and deciding whether variables are related (Topic 2.1).

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
window.getRubricU2L1 = function(questionId) {
    return window.RUBRICS_U2L1[questionId] || null;
};

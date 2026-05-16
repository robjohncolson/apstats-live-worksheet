/**
 * AI Grading Prompts for Unit 1 Lesson 2: Topic 1.2
 * Topic 1.2: The Language of Variation: Variables
 *
 * Learning Objectives:
 *   Identify the individuals in a data set
 *   Identify the variables in a data set and describe them in context
 *   Recognize when a column is an identifier rather than a variable
 *   Classify variables as categorical or quantitative
 *   Explain why some number-looking variables are categorical
 *   Describe how grouping a quantitative variable can create a categorical variable
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L2 = `
VIDEO 1 - The Language of Variation: Variables (~8:24):
- The lesson is Topic 1.2, the language of variation: variables.
- The two main goals are to identify the individuals and variables in a data set and to classify variables as categorical or quantitative.
- The main example is a spreadsheet of home prices in Charleston, South Carolina.
- The skill focus is describing data presented numerically or graphically, and the Charleston example is presented numerically in a table.
- Individuals are the people, animals, or objects described by the data set.
- In the Charleston spreadsheet, the individuals are the properties for sale, shown in the rows.
- A variable is a characteristic that changes or varies from one individual to another.
- In a spreadsheet, variables are shown in the columns.
- The leftmost ID column is an identifier, not a variable.
- Variables in the housing data include type of property, sales price, year built, number of bedrooms, whether or not it has a pool, distance to the beach in miles, parking location, and zip code.
- The lesson warns students not to copy awkward column headings verbatim; for example, instead of saying "pool?" they should say whether or not the property has a pool.
- A categorical variable takes values that are category names or group labels.
- Categorical variables in the housing data include type of property, whether or not it has a pool, parking location, and zip code.
- Zip code looks numerical, but it is categorical because the numbers represent locations.
- A quantitative variable takes numerical values for a measured or counted quantity.
- A quick clue that a variable is quantitative is that it makes sense to find an average of the values.
- Quantitative variables in the housing data include price, year built, number of bedrooms, and distance to the beach.
- When a variable is measured, the units of measurement should be stated.
- Researchers can turn a quantitative variable into a categorical variable by grouping values together.
- The example groups distance to the beach into categories such as close, nearby, and far.
- In the practice survey of 30 AP Statistics students, the number of students in the class is not a variable; it is a constant.
- In that survey, age is quantitative, birth month is categorical, grade level is categorical even though it uses numbers, and number of people in the household is quantitative because it is a count.
- The lesson closes by emphasizing that individuals are the cases described by the data and that variables either use labels (categorical) or measured or counted numbers (quantitative).
`;

// Rubrics for each reflection question
window.RUBRICS_U1L2 = {
    reflect1: {
        questionText: 'Why is zip code a categorical variable even though it is written with numbers?',
        expectedElements: [
            { id: 'location-label', description: 'Explains that zip codes are labels for locations or groups, not amounts', required: true },
            { id: 'not-measured-or-counted', description: 'Explains that zip code is not a measured or counted quantity', required: true },
            { id: 'average-not-meaningful', description: 'Explains that doing arithmetic such as finding an average of zip codes does not make sense in context', required: true },
            { id: 'numbers-can-still-be-categorical', description: 'May mention that not every variable written with numbers is quantitative', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that zip codes are location labels, not measured or counted amounts, and that arithmetic like averaging does not make sense for them.',
            P: 'Response shows some understanding that zip code is categorical, but misses one key idea such as the label role, the lack of measurement or count, or why arithmetic is not meaningful.',
            I: 'Response treats zip code as a quantity or does not correctly explain why it is categorical.'
        },
        commonMistakes: [
            'Saying zip code is quantitative just because it uses digits',
            'Ignoring that the numbers stand for locations',
            'Failing to explain why it is not measured or counted',
            'Using the idea of numbers without addressing meaning in context'
        ],
        contextFromVideo: 'The video uses zip code as the main reminder that a variable can look numerical but still be categorical because the values are labels for location.'
    },

    reflect2: {
        questionText: 'How does grouping a quantitative variable like distance to the beach into categories change the way the variable is described?',
        expectedElements: [
            { id: 'grouping-intervals', description: 'Explains that numerical values are grouped into labeled ranges such as close, nearby, and far', required: true },
            { id: 'becomes-categorical', description: 'Explains that once the labels are used, the grouped version is categorical rather than quantitative', required: true },
            { id: 'reason-for-grouping', description: 'Explains that grouping can make the data easier to summarize, compare, or describe', required: true },
            { id: 'loss-of-detail', description: 'May mention that grouping can reduce detail from the original numerical values', required: false }
        ],
        scoringGuide: {
            E: 'Response explains how the numerical values are turned into labeled groups, states that the grouped variable becomes categorical, and gives a sensible reason for grouping.',
            P: 'Response identifies part of the grouping idea but misses either the change in variable type or the purpose of grouping.',
            I: 'Response does not correctly explain what grouping does to the variable or how the description changes.'
        },
        commonMistakes: [
            'Saying the variable stays quantitative after replacing numbers with labels',
            'Giving examples of groups without explaining the change in type',
            'Ignoring why a researcher might want grouped categories',
            'Confusing grouping with changing the individuals in the study'
        ],
        contextFromVideo: 'The lesson shows distance to the beach changing from exact miles to categories like close, nearby, and far, which turns a quantitative variable into a categorical one.'
    },

    exitTicket: {
        questionText: 'A school counselor creates a spreadsheet about 40 students with Student ID, grade level, commute time in minutes, preferred lunch period, and number of clubs joined. The counselor later groups commute time as short, medium, or long. Identify the individuals and the identifier, classify the variables, explain why grade level is categorical, and explain how grouping commute time changes the variable and why a researcher might do that.',
        expectedElements: [
            { id: 'individuals-and-identifier', description: 'Identifies the individuals as the students and Student ID as the identifier rather than a variable', required: true },
            { id: 'classifications', description: 'Correctly classifies grade level as categorical, commute time in minutes as quantitative, preferred lunch period as categorical, and number of clubs as quantitative', required: true },
            { id: 'grade-level-reason', description: 'Explains that grade level is categorical because the numbers act as labels for categories rather than measured or counted amounts', required: true },
            { id: 'grouped-commute-type', description: 'Explains that grouping commute time into short, medium, and long turns it into a categorical variable', required: true },
            { id: 'reason-for-grouping', description: 'Explains that a researcher might group commute time to simplify summaries, comparisons, or communication of patterns', required: true },
            { id: 'units-or-count-language', description: 'May mention that commute time is measured in minutes and number of clubs is a count', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the students and Student ID, classifies all listed variables, explains why grade level is categorical, and explains that grouped commute time becomes categorical for easier summary or comparison.',
            P: 'Response gets most major parts correct but misses or confuses one important piece, such as the identifier, one classification, the reason grade level is categorical, or the effect of grouping commute time.',
            I: 'Response has major classification errors or does not show understanding of identifiers, categorical versus quantitative variables, or the effect of grouping.'
        },
        commonMistakes: [
            'Treating Student ID as a variable instead of an identifier',
            'Calling grade level quantitative because it uses numbers',
            'Calling preferred lunch period quantitative',
            'Forgetting that number of clubs is a count and therefore quantitative',
            'Failing to explain that grouped commute time becomes categorical'
        ],
        contextFromVideo: 'The lesson repeatedly distinguishes identifiers from variables, shows that number-looking labels such as grade level can be categorical, and explains that grouping a measured quantity can create a categorical variable.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L2 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L2[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.2.

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
window.getRubricU1L2 = function(questionId) {
    return window.RUBRICS_U1L2[questionId] || null;
};





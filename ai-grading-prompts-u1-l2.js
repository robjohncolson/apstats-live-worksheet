/**
 * AI Grading Prompts for Unit 1 Lesson 2: Topic 1.2
 * Topic 1.2: The Language of Variation: Variables
 *
 * Learning Objectives:
 *   Identify the individuals and variables in a data set
 *   Recognize that a variable changes from one individual to another
 *   Classify variables as categorical or quantitative
 *   Explain why some number-valued fields are still categorical
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L2 = `
VIDEO 1 - The Language of Variation: Variables (~8:24):
- The video introduces two main goals: identifying the individuals and variables in a data set, and classifying variables as categorical or quantitative.
- The main example is a spreadsheet of home prices in Charleston, South Carolina.
- The skill practiced is describing data presented numerically or graphically; in this example, the data are presented numerically.
- Individuals in a data set can be people, animals, or objects.
- In the Charleston spreadsheet, the individuals are the properties for sale, and they are shown in the rows.
- Variables are shown in the columns of the table.
- A variable is a characteristic that changes or varies from one individual to another.
- The leftmost ID column is an identifier, not a variable.
- Variables in the Charleston data set include type of property, sales price, year built, number of bedrooms, whether or not the property has a pool, distance to the beach in miles, parking location, and zip code.
- Students are warned not to repeat awkward column labels verbatim. For example, instead of saying "pool?" they should say whether or not the property has a pool.
- A categorical variable takes on values that are category names or group labels.
- Categorical variables in the example include type of property, whether or not it has a pool, parking location, and zip code.
- Zip code is categorical even though it uses numbers, because the numbers represent a location.
- A quantitative variable takes on numerical values for a measured or counted quantity.
- One clue that a variable is quantitative is that it makes sense to find an average of its values.
- Quantitative variables in the example include price, year built, number of bedrooms, and distance to the beach in miles.
- When a variable measures something, the units should be stated.
- Not all numerical-looking variables are quantitative.
- A quantitative variable can be turned into a categorical variable by grouping values, such as labeling beach distance as close, nearby, or far.
- The practice survey of 30 AP Statistics students includes variables such as age, birth month, reaction time, height, whether the student can roll their tongue, and number of people in the household.
- The number of students in the class is not a variable because it is a constant equal to 30.
- In the survey, age is quantitative, birth month is categorical, grade level is categorical even if coded with numbers, and number of people in the household is quantitative because it is a count.
- The video closes by reviewing that individuals are the people, animals, or objects described by the data, while variables are characteristics that vary from one individual to another.
- It also reviews that categorical variables use category names or labels, while quantitative variables use numerical values for measured or counted quantities.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L2 = {
    reflect1: {
        questionText: 'Using the Charleston spreadsheet, explain the difference between an individual and a variable.',
        expectedElements: [
            { id: 'individuals-are-properties', description: 'Identifies the individuals as the properties or homes for sale in Charleston', required: true },
            { id: 'variable-definition', description: 'Explains that a variable is a characteristic recorded for each individual that can change from one property to another', required: true },
            { id: 'gives-example-variable', description: 'Gives at least one example of a variable from the Charleston data set, such as price, year built, pool, or zip code', required: true },
            { id: 'rows-vs-columns', description: 'May note that individuals appear in rows while variables appear in columns', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes individuals from variables in the Charleston example and includes at least one correct variable in context.',
            P: 'Response shows partial understanding of individuals and variables but does not clearly explain one of them or does not use the Charleston example well.',
            I: 'Response does not correctly distinguish an individual from a variable.'
        },
        commonMistakes: [
            'Calling the houses variables instead of individuals',
            'Naming a column heading without explaining what a variable is',
            'Giving an identifier such as ID as an example of a variable',
            'Ignoring the Charleston context entirely'
        ],
        contextFromVideo: 'In the video, the individuals are the Charleston properties for sale, and the variables are characteristics such as sales price, year built, whether the property has a pool, and zip code.'
    },

    reflect2: {
        questionText: 'Why are zip code and grade level considered categorical variables even though they can be written with numbers?',
        expectedElements: [
            { id: 'numbers-as-labels', description: 'Explains that the numbers act as labels or categories rather than measurements or counts', required: true },
            { id: 'zip-code-location', description: 'Explains that zip code represents a location or category of place', required: true },
            { id: 'grade-level-categories', description: 'Explains that grade level really stands for labels such as freshman, sophomore, junior, or senior', required: true },
            { id: 'not-average', description: 'May mention that taking an average would not be meaningful for these values', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that zip code and grade level are labels or categories, not measured or counted quantities, and correctly interprets both examples.',
            P: 'Response correctly explains one example or gives the general idea of labels versus measurements, but not fully for both zip code and grade level.',
            I: 'Response treats zip code or grade level as quantitative without explaining the categorical reasoning.'
        },
        commonMistakes: [
            'Assuming that any variable written with numbers must be quantitative',
            'Explaining zip code as a count or measurement',
            'Ignoring the grade-level example',
            'Failing to distinguish labels from measured or counted quantities'
        ],
        contextFromVideo: 'The video explicitly says that zip code is categorical because the numbers represent location, and grade level is categorical because the values really stand for labels like freshman, sophomore, junior, and senior.'
    },

    exitTicket: {
        questionText: 'A school keeps a spreadsheet for 25 students who play a spring sport. The columns are student ID, sport played, resting heart rate in beats per minute, and number of practices missed this month. Identify the individuals, name two variables in context, classify sport played and resting heart rate, and explain why student ID is not a variable for this lesson.',
        expectedElements: [
            { id: 'individuals', description: 'Identifies the individuals as the 25 students who play a spring sport', required: true },
            { id: 'two-variables', description: 'Names two actual variables from the spreadsheet in context, such as sport played, resting heart rate, or number of practices missed', required: true },
            { id: 'sport-played-categorical', description: 'Classifies sport played as categorical because it uses category names or labels', required: true },
            { id: 'heart-rate-quantitative', description: 'Classifies resting heart rate as quantitative because it is a numerical measured quantity in beats per minute', required: true },
            { id: 'id-not-variable', description: 'Explains that student ID is an identifier used to label each student, not a characteristic that varies in the lesson sense', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the individuals, names variables in context, classifies sport played and resting heart rate correctly, and explains why student ID is only an identifier.',
            P: 'Response includes several correct ideas but misses one major part, such as explaining why student ID is not a variable or misclassifying one variable type.',
            I: 'Response omits multiple required parts or shows weak understanding of individuals, variables, and variable type.'
        },
        commonMistakes: [
            'Calling student ID a variable just because it is listed in a column',
            'Treating sport played as quantitative',
            'Failing to state that resting heart rate is measured in beats per minute',
            'Not identifying the students as the individuals'
        ],
        contextFromVideo: 'The lesson emphasizes that individuals are the people, animals, or objects described by the data, that variables are characteristics that vary, that categorical variables use labels, that quantitative variables measure or count, and that identifiers such as ID are not variables.'
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

    return `You are grading an AP Statistics student's response about Topic 1.2: The Language of Variation: Variables.

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

/**
 * AI Grading Prompts for Unit 1 Lesson 3: Representing a Categorical Variable with Tables
 * Topic 1.3: Topic 1.3
 *
 * Learning Objectives:
 *   Identify individuals and variables in a categorical data set
 *   Represent categorical data with frequency tables
 *   Represent categorical data with relative frequency tables
 *   Convert counts to proportions and percents
 *   Use tables to describe the distribution of categorical data
 *   Decide whether statements about categorical data are supported by a table
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L3 = `
VIDEO 1 - Representing a Categorical Variable with Tables (~8:06):
- The lesson asks how categorical data can be represented in tabular form and how those tables help describe the data.
- Main example: an online survey asked 50 high school students which superpower they would most like to have.
- The individuals are the 50 high school students who completed the survey.
- The variable is superpower preference, which is categorical because its values are category names or labels.
- A frequency table gives the number of individuals, or cases, in each category.
- In the superpower example, the frequencies are fly = 9, freeze time = 15, invisibility = 7, super strength = 3, and telepathy = 16.
- A relative frequency table gives the proportion or percent of individuals in each category.
- Relative frequencies are found by dividing each category count by the total number of individuals, 50.
- For the superpower example, fly has relative frequency 9/50 = 0.18 = 18%.
- The full relative frequencies are fly 18%, freeze time 30%, invisibility 14%, super strength 6%, and telepathy 32%.
- A majority means at least 50%.
- The true statement from the first multiple-choice set is that exactly 50% of students chose either fly or telepathy.
- Fly plus invisibility is only 32%, so that is not nearly half.
- About three times as many students chose fly as super strength.
- Invisibility is second to last in the table, so it is not one of the more popular choices.
- Practice example: the 2018 Monitoring the Future study asked students about the risk of occasionally vaping nicotine.
- The frequencies shown are no risk = 501, slight risk = 782, moderate risk = 401, great risk = 377, and can't say, drug unfamiliar = 191.
- The total number of responses is 2252.
- Slight risk is 782/2252 = 34.7%, which is over one-third.
- No risk plus slight risk is 1283, which is more than half of 2252.
- Can't say, drug unfamiliar is 191/2252 = 8.5%, so it is not over 10%.
- No risk is 501/2252 = 22.2%.
- The takeaway is that frequency and relative frequency tables help justify claims about categorical data in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L3 = {
    reflect1: {
        questionText: 'How does a relative frequency table help you describe categorical data more clearly than a frequency table by itself?',
        expectedElements: [
            { id: 'counts-vs-percent', description: 'Explains that a frequency table gives counts while a relative frequency table gives proportions or percentages', required: true },
            { id: 'compare-categories', description: 'Explains that proportions or percents make it easier to compare categories', required: true },
            { id: 'justify-claims', description: 'Explains that relative frequencies help support statements such as majority, nearly half, or over one-third', required: true },
            { id: 'context-language', description: 'May mention that the description should be written in context of the data', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that relative frequency tables convert counts to proportions or percents, make comparisons easier, and help justify claims about the distribution.',
            P: 'Response mentions part of the value of relative frequencies but leaves out a major idea such as comparison or justification of claims.',
            I: 'Response does not correctly explain how a relative frequency table helps describe categorical data.'
        },
        commonMistakes: [
            'Saying a relative frequency table is the same as a frequency table',
            'Not mentioning proportions or percentages',
            'Failing to connect relative frequencies to comparisons or claims like majority',
            'Giving a vague answer with no statistical meaning'
        ],
        contextFromVideo: 'The video says a relative frequency table gives the proportion or percent in each category and helps students evaluate statements such as majority or nearly half.'
    },

    reflect2: {
        questionText: 'Why was finding the total of 2252 responses important before deciding whether the vaping statements were supported?',
        expectedElements: [
            { id: 'need-total', description: 'Explains that the total is needed to convert counts into proportions or percentages', required: true },
            { id: 'evaluate-claims', description: 'Explains that percentages are needed to check claims such as over one-third, majority, or over 10%', required: true },
            { id: 'counts-alone', description: 'Explains that counts alone are not enough to judge those proportional statements', required: true },
            { id: 'example-use', description: 'May give an example such as 782/2252 = 34.7% or 191/2252 = 8.5%', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that the total of 2252 is needed to compute percentages and determine whether proportional claims in the table are supported.',
            P: 'Response shows some understanding that the total matters, but does not clearly connect it to percentages or to checking the claims.',
            I: 'Response does not correctly explain why the total is necessary.'
        },
        commonMistakes: [
            'Saying the total was only needed to make the table look complete',
            'Ignoring the role of percentages or proportions',
            'Treating counts alone as enough to check majority or over 10% statements',
            'Giving no connection to the actual claims in the problem'
        ],
        contextFromVideo: 'In the vaping example, the teacher first totaled the frequencies to 2252 and then used that total to check statements like 34.7%, more than half, and 8.5%.'
    },

    exitTicket: {
        questionText: 'A random sample of 40 students was asked which school lunch change they would most like to see. The responses were: more choices = 14, shorter lines = 10, lower prices = 8, healthier meals = 5, and bigger portions = 3. Identify the individuals and variable, state whether the variable is categorical or quantitative, describe a frequency table and relative frequencies, decide whether a majority chose more choices or shorter lines, and write one other valid description in context.',
        expectedElements: [
            { id: 'individuals', description: 'Identifies the individuals as the 40 sampled students', required: true },
            { id: 'variable-type', description: 'Identifies the variable as preferred lunch change and states that it is categorical', required: true },
            { id: 'frequency-table', description: 'Gives or clearly describes the frequency counts for the categories', required: true },
            { id: 'relative-frequencies', description: 'Gives the relative frequencies or percentages for the categories, such as 35%, 25%, 20%, 12.5%, and 7.5%', required: true },
            { id: 'majority-claim', description: 'States that more choices plus shorter lines is 24 out of 40, or 60%, so the majority statement is supported', required: true },
            { id: 'context-description', description: 'Writes another valid statement describing the distribution in context using a count, proportion, or percent', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the individuals and variable, states the variable is categorical, gives the counts and relative frequencies, correctly shows that 24/40 = 60% is a majority, and includes another valid contextual description.',
            P: 'Response gets most of the table and description work correct but misses or confuses one major part such as the variable type, the relative frequencies, or the majority justification.',
            I: 'Response has major errors or omissions in the identification, table description, percentages, or supported-claim reasoning.'
        },
        commonMistakes: [
            'Calling the variable quantitative instead of categorical',
            'Giving counts without converting them to proportions or percents',
            'Not checking the majority claim with 24 out of 40 or 60%',
            'Writing a conclusion without using numbers from the data',
            'Describing the data without keeping the statement in context of school lunch changes'
        ],
        contextFromVideo: 'The lesson emphasizes identifying individuals and a categorical variable, building frequency and relative frequency tables, and using those values to justify claims about the distribution in context.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L3[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about representing a categorical variable with tables (Topic 1.3).

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
window.getRubricU1L3 = function(questionId) {
    return window.RUBRICS_U1L3[questionId] || null;
};

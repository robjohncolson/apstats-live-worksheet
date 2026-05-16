/**
 * AI Grading Prompts for Unit 2 Lesson 4: Representing the Relationship Between Two Quantitative Variables
 * Topic 2.4: Required Course Content
 *
 * Learning Objectives:
 *   Represent bivariate quantitative data using scatterplots
 *   Identify explanatory and response variables
 *   Describe scatterplots using direction, form, strength, and unusual features
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L4 = `
VIDEO 1 - Explanatory and Response Variables; Constructing Scatter Plots (~5:14):
- The lesson introduces three goals: determine the explanatory variable, determine the response variable, and construct a scatterplot for bivariate data.
- The opening context compares income, attendance, and math achievement and stresses that group averages do not describe individual performance or intelligence.
- A random sample of 11 students is used, with percent attendance and number of questions answered correctly on the Texas Algebra 1 end-of-year assessment.
- Attendance is treated as the explanatory variable because it is being used to explain or predict performance.
- Questions correct is the response variable.
- A memory trick from the video is that explanatory matches the x-variable and response matches the y-variable.
- Because the data involve two quantitative variables, the correct display is a scatterplot.
- Each point on the scatterplot represents one student as an ordered pair with x from attendance and y from questions correct.
- A proper scatterplot should include a title, labeled axes, and scales with tick marks.
- Explanatory variables are used to predict or explain trends in response variables.

VIDEO 2 - Describing Scatter Plots (~6:38):
- A complete description of a scatterplot should include direction, form, strength, unusual features, and context.
- Positive association means that as x-values increase, y-values tend to increase.
- Negative association means that as x-values increase, y-values tend to decrease.
- In the attendance example, the relationship is described as positive because higher attendance tends to go with more questions answered correctly.
- The form is approximately linear.
- One unusual feature is a student with especially low attendance.
- Strength describes how closely the points follow the pattern; strong relationships have points close to the pattern, while weak relationships show more variation around the model.
- The video summarizes the example by saying the relationship between attendance rate and exam performance appears positive, linear, and strong, with one student having unusually low attendance.
- The final sentence model emphasizes describing the relationship in context of the variables, not just listing shape words.

AP CLASSROOM FRAMEWORK CONNECTION:
- A bivariate quantitative data set consists of observations of two quantitative variables made on individuals in a sample or population.
- A scatterplot shows two numeric values for each observation, one on the x-axis and one on the y-axis.
- An explanatory variable is used to explain or predict corresponding values of the response variable.
- A scatterplot description includes form, direction, strength, and unusual features.
- Direction can be positive or negative.
- Form can be linear or non-linear.
- Strength describes how closely points follow a pattern and can be described as strong, moderate, or weak.
- Unusual features can include clusters or points with relatively large discrepancies from a predicted value.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L4 = {
    reflect1: {
        questionText: 'How do explanatory and response variables help you decide what goes on each axis of a scatterplot?',
        expectedElements: [
            { id: 'explanatory-role', description: 'Explains that the explanatory variable is used to explain or predict the response variable', required: true },
            { id: 'x-axis', description: 'States that the explanatory variable goes on the x-axis', required: true },
            { id: 'y-axis', description: 'States that the response variable goes on the y-axis', required: true },
            { id: 'paired-values', description: 'Explains that each point represents one observation with both an x-value and a y-value', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that the explanatory variable predicts or explains the response and correctly places the explanatory variable on the x-axis and the response variable on the y-axis.',
            P: 'Response identifies some of the axis roles or the explanatory-response relationship, but it is incomplete or only partly correct.',
            I: 'Response does not correctly explain how explanatory and response variables determine the axes of a scatterplot.'
        },
        commonMistakes: [
            'Putting the response variable on the x-axis',
            'Saying the explanatory and response variables can go on either axis with no reason',
            'Defining the variables without explaining which axis each belongs on',
            'Not connecting explanatory variable to prediction or explanation'
        ],
        contextFromVideo: 'The video says attendance is the explanatory variable, questions correct is the response variable, and uses the memory trick that explanatory matches x while response matches y.'
    },

    reflect2: {
        questionText: 'Why is it not enough to describe a scatterplot only by saying it is positive? What else belongs in a complete description?',
        expectedElements: [
            { id: 'direction-only', description: 'Explains that positive only describes the direction of the association', required: true },
            { id: 'form', description: 'States that a complete description should also include the form, such as linear or nonlinear', required: true },
            { id: 'strength', description: 'States that a complete description should also include the strength of the association', required: true },
            { id: 'features-context', description: 'States that a complete description should mention unusual features and the context of the variables', required: true }
        ],
        scoringGuide: {
            E: 'Response explains that positive gives only direction and that a complete description should also include form, strength, unusual features, and context.',
            P: 'Response mentions that more than direction is needed, but it omits one or more key parts of a complete scatterplot description.',
            I: 'Response does not correctly explain what belongs in a complete description of a scatterplot.'
        },
        commonMistakes: [
            'Treating positive as a complete description by itself',
            'Listing only one extra feature, such as linear, and omitting strength or unusual features',
            'Describing the graph without mentioning context',
            'Confusing positive with strong'
        ],
        contextFromVideo: 'The second video says to describe direction, form, strength, unusual features, and context, then models the sentence positive, linear, and strong with one student having unusually low attendance.'
    },

    exitTicket: {
        questionText: 'A teacher recorded hours studied and quiz score for six students. Identify the explanatory and response variables and explain why, explain why a scatterplot is appropriate, describe the likely direction, form, and strength in context, and list two features a correctly constructed scatterplot should include.',
        expectedElements: [
            { id: 'identify-variables', description: 'Identifies the variables as hours studied and quiz score and recognizes that both are quantitative', required: true },
            { id: 'explanatory-response', description: 'States that hours studied is the explanatory variable and quiz score is the response variable', required: true },
            { id: 'scatterplot-appropriate', description: 'Explains that a scatterplot is appropriate because each student has two quantitative values', required: true },
            { id: 'positive-direction', description: 'Describes the likely direction as positive, meaning higher study time tends to go with higher quiz scores', required: true },
            { id: 'linear-form', description: 'Describes the likely form as approximately linear', required: true },
            { id: 'strong-strength', description: 'Describes the likely strength as strong or notes that the points would be fairly close to a line', required: true },
            { id: 'construction-features', description: 'Lists at least two correct scatterplot features, such as a title, labeled axes, and scale with tick marks', required: true },
            { id: 'no-obvious-unusual-features', description: 'May mention that there is no obvious unusual feature in this small data set', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the variables, assigns explanatory and response roles, explains why a scatterplot is appropriate, describes a positive, approximately linear, strong relationship in context, and lists correct construction features.',
            P: 'Response gets most of the main ideas right but misses or weakly explains one or two required parts.',
            I: 'Response has major errors about the variables, the role of a scatterplot, or the likely description of the relationship, or it omits several required elements.'
        },
        commonMistakes: [
            'Reversing the explanatory and response variables',
            'Saying a scatterplot is used because the variables are categorical',
            'Describing only direction and not form or strength',
            'Listing graph features without explaining the relationship in context',
            'Forgetting to mention labeled axes or tick-mark scales'
        ],
        contextFromVideo: 'The lesson says scatterplots are used for two quantitative variables, the explanatory variable goes on x, the response variable goes on y, and a complete description includes direction, form, strength, unusual features, and context.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L4[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about representing the relationship between two quantitative variables (Topic 2.4).

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
window.getRubricU2L4 = function(questionId) {
    return window.RUBRICS_U2L4[questionId] || null;
};

/**
 * AI Grading Prompts for Unit 2 Lesson 8: Least Squares Regression
 * Topic 2.8: Required Course Content
 *
 * Learning Objectives:
 *   Describe how the LSRL is determined and what properties it has
 *   Interpret slope and y-intercept in context
 *   Interpret r squared and read regression computer output
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L8 = `
VIDEO 1 - How the LSRL Is Determined (~6:48):
- The least squares regression line, or LSRL, is the linear model that minimizes the sum of squared residuals.
- The lesson revisits the Texas attendance and Algebra 1 exam data set, which shows a strong positive linear relationship.
- Comparing two possible lines shows that residuals help us judge which model predicts better.
- Simply summing residuals does not work because positive and negative residuals can cancel each other out.
- A three-point example shows that a bad line can still have a residual sum of zero if positive and negative errors balance.
- Squaring residuals removes the sign issue and makes bad fits produce a larger total.
- The LSRL contains the mean point (x-bar, y-bar).
- The slope of the LSRL can be calculated with b = r(s_y / s_x).
- With r = 0.95, s_y = 6.08, and s_x = 10.2, the slope is about 0.57.

VIDEO 2 - Interpreting Slope and y-Intercept (~6:00):
- The regression equation is y-hat = -7.69 + 0.57x, where x is percent attendance and y-hat predicts exam questions answered correctly.
- The slope tells the predicted change in y for every one-unit increase in x.
- In context, for every 1 percentage point increase in attendance, the model predicts an average increase of 0.57 exam questions answered correctly.
- The y-intercept is the predicted y-value when x = 0.
- In this model, the y-intercept is -7.69, meaning the predicted number of questions correct when attendance is 0%.
- The y-intercept is not meaningful here because 0% attendance is not a reasonable explanatory value in context and a negative predicted number of correct questions is illogical.
- The statistics form y-hat = a + bx matches the algebra idea y = mx + b, but y-hat is a predicted value.

VIDEO 3 - Interpreting r Squared and Computer Output (~7:26):
- The lesson compares the LSRL to a mean model that predicts 41.3 questions correct for everyone when attendance is not used.
- Using attendance in the model greatly reduces the sum of squared residuals compared with the mean model.
- The reduction is 90.3%, which is the coefficient of determination, r squared.
- r squared is the proportion of variation in the response variable explained by the explanatory variable in the model.
- In context, 90.3% of the variation in Algebra 1 questions answered correctly can be explained by the linear relationship with attendance.
- r squared is equal to the correlation squared.
- r squared is always between 0 and 1, and values closer to 1 indicate a stronger relationship.
- In regression computer output, the constant is the y-intercept and the coefficient of the explanatory variable is the slope.
- R-sq gives the coefficient of determination directly in the output.

AP CLASSROOM FRAMEWORK CONNECTION:
- The least-squares regression model minimizes the sum of the squares of the residuals and contains the point (x-bar, y-bar).
- The slope can be calculated with b = r(s_y / s_x).
- The slope is the amount that the predicted y-value changes for every unit increase in x.
- The y-intercept is the predicted value of the response variable when x = 0, but it may not have a logical interpretation in context.
- In simple linear regression, r squared is the coefficient of determination and equals the correlation squared.
- r squared is the proportion of variation in the response variable that is explained by the explanatory variable in the model.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L8 = {
    reflect1: {
        questionText: 'Why do statisticians square residuals when choosing the least squares regression line, and what important properties of the LSRL did Video 1 emphasize?',
        expectedElements: [
            { id: 'canceling-problem', description: 'Explains that raw residuals can cancel because positive and negative values offset each other', required: true },
            { id: 'least-squares-definition', description: 'States that the LSRL minimizes the sum of squared residuals', required: true },
            { id: 'mean-point-property', description: 'States that the LSRL contains the point (x-bar, y-bar)', required: true },
            { id: 'slope-formula-property', description: 'States that the slope can be calculated with b = r(s_y / s_x)', required: true },
            { id: 'numeric-example', description: 'May mention the example where r = 0.95, s_y = 6.08, s_x = 10.2, and b = 0.57', required: false }
        ],
        scoringGuide: {
            E: 'Response explains why squaring residuals is necessary, states that the LSRL minimizes the sum of squared residuals, and includes the main Video 1 properties of the line.',
            P: 'Response gets part of the least-squares idea right but misses an important point about cancellation, the minimization target, or one of the emphasized LSRL properties.',
            I: 'Response does not correctly explain why least squares is used or does not identify the major properties from Video 1.'
        },
        commonMistakes: [
            'Saying the LSRL minimizes the sum of raw residuals',
            'Ignoring that positive and negative residuals can cancel',
            'Forgetting that the line contains the mean point',
            'Confusing the slope formula with the regression equation itself'
        ],
        contextFromVideo: 'Video 1 shows that residuals can cancel in a bad model, so the LSRL is defined by minimizing the sum of squared residuals. It also emphasizes that the line contains (x-bar, y-bar) and that b = r(s_y / s_x).'
    },

    reflect2: {
        questionText: 'How should you interpret the slope and y-intercept of an LSRL in context, and when might the y-intercept not be meaningful?',
        expectedElements: [
            { id: 'slope-change', description: 'Explains that the slope is the predicted change in y for every one-unit increase in x', required: true },
            { id: 'attendance-context', description: 'Interprets the example slope by saying each 1 percentage point increase in attendance predicts about 0.57 more questions correct', required: true },
            { id: 'intercept-definition', description: 'Explains that the y-intercept is the predicted y-value when x = 0', required: true },
            { id: 'intercept-not-meaningful', description: 'Explains that the y-intercept may not be meaningful when x = 0 is not reasonable in context or gives an illogical prediction', required: true },
            { id: 'example-illogical-value', description: 'May mention that 0% attendance gives a prediction of -7.69 questions correct, which is not logical', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly interprets both coefficients in context and explains why a y-intercept may fail to be meaningful.',
            P: 'Response interprets one coefficient well but misses an important point about the other coefficient or about contextual meaning.',
            I: 'Response does not correctly explain what slope or y-intercept means in a regression context.'
        },
        commonMistakes: [
            'Treating slope as an exact rather than predicted change',
            'Forgetting that the y-intercept corresponds to x = 0',
            'Claiming the y-intercept is always meaningful',
            'Ignoring the context of attendance and exam questions'
        ],
        contextFromVideo: 'Video 2 interprets 0.57 as the predicted average increase in questions correct for each 1 percentage point increase in attendance and explains that the intercept -7.69 is not meaningful because 0% attendance is not reasonable and the prediction is illogical.'
    },

    reflect3: {
        questionText: 'What does r squared tell you about a regression model, and how can you identify the slope and y-intercept from computer output?',
        expectedElements: [
            { id: 'r-squared-meaning', description: 'States that r squared is the proportion or percent of variation in the response variable explained by the explanatory variable in the model', required: true },
            { id: 'context-interpretation', description: 'Interprets the example by saying 90.3% of the variation in exam questions correct is explained by the linear relationship with attendance', required: true },
            { id: 'r-squared-equals-r-squared', description: 'States that r squared equals the correlation squared', required: true },
            { id: 'output-slope', description: 'Explains that the slope is the coefficient of the explanatory variable in computer output', required: true },
            { id: 'output-intercept', description: 'Explains that the y-intercept is the constant in computer output', required: true },
            { id: 'strength-note', description: 'May mention that larger r squared values indicate a stronger relationship', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains what r squared measures, interprets it in context, and identifies the slope and y-intercept from regression output.',
            P: 'Response explains some of r squared or output interpretation correctly but misses one major idea.',
            I: 'Response does not correctly explain r squared or how to read slope and intercept from output.'
        },
        commonMistakes: [
            'Saying r squared is the percent of points on the line',
            'Confusing r squared with the slope',
            'Reading the constant as the slope',
            'Failing to connect r squared to explained variation'
        ],
        contextFromVideo: 'Video 3 defines r squared as the proportion of variation in the response explained by the explanatory variable, interprets 90.3% in context, and shows that computer output lists the y-intercept as the constant and the slope as the coefficient of the explanatory variable.'
    },

    exitTicket: {
        questionText: 'A school district models exam questions correct from percent attendance with y-hat = -7.69 + 0.57x, where r = 0.95, s_y = 6.08, s_x = 10.2, and r squared = 0.903. Explain why the LSRL uses squared residuals, interpret the slope and y-intercept, explain whether the y-intercept is meaningful, interpret r squared in context, and name the point that must lie on the LSRL.',
        expectedElements: [
            { id: 'squared-residuals', description: 'Explains that squared residuals are used so positive and negative errors do not cancel and the LSRL minimizes their sum', required: true },
            { id: 'slope-interpretation', description: 'Interprets 0.57 as the predicted average increase in questions correct for each 1 percentage point increase in attendance', required: true },
            { id: 'intercept-definition', description: 'States that -7.69 is the predicted y-value when attendance is 0%', required: true },
            { id: 'intercept-not-meaningful', description: 'Explains that the y-intercept is not meaningful because 0% attendance is not a reasonable context and the prediction is illogical', required: true },
            { id: 'r-squared-context', description: 'Interprets 0.903 as 90.3% of the variation in exam questions correct being explained by the linear relationship with attendance', required: true },
            { id: 'mean-point', description: 'Names the point (x-bar, y-bar) as a point that must lie on the LSRL', required: true },
            { id: 'slope-formula-note', description: 'May mention that the slope could also be found using b = r(s_y / s_x)', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains the least-squares idea, interprets both coefficients, handles the contextual meaning of the intercept, interprets r squared in context, and identifies the mean point property.',
            P: 'Response gets most of the ideas right but misses or weakly explains one major part of the least-squares idea, coefficient interpretation, r squared interpretation, or mean point property.',
            I: 'Response has major errors about least squares, regression coefficients, r squared, or the LSRL properties.'
        },
        commonMistakes: [
            'Saying residuals should just be added instead of squared',
            'Interpreting the slope without the idea of predicted change',
            'Treating the y-intercept as automatically meaningful',
            'Describing r squared without mentioning explained variation',
            'Forgetting that the line contains (x-bar, y-bar)'
        ],
        contextFromVideo: 'Across the three videos, the lesson explains that the LSRL minimizes the sum of squared residuals, interprets slope and y-intercept in the attendance context, defines r squared as explained variation, and emphasizes that the line contains the point (x-bar, y-bar).'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L8 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L8[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about least squares regression (Topic 2.8).

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
window.getRubricU2L8 = function(questionId) {
    return window.RUBRICS_U2L8[questionId] || null;
};

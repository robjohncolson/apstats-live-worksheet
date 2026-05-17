/**
 * AI Grading Prompts for Unit 2 Lesson 9: Analyzing Departures from Linearity
 * Topic 2.9: Required Course Content
 *
 * Learning Objectives:
 *   Identify influential points in regression
 *   Explain how transformations can improve linear model fit
 *   Use residual plots and r squared to assess transformed models
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L9 = `
VIDEO 1 - Influential Points in Regression (~6:28):
- Topic 2.9 focuses on analyzing departures from linearity by finding and categorizing influential points.
- The lesson goals are to define high leverage points, define outliers in regression, and describe how influential points affect the least squares regression line, correlation, and r squared.
- The supermarket example compares average income in San Antonio zip codes with the number of organic items offered at grocery stores and shows a positive trend.
- The point (x-bar, y-bar) still matters because leverage is judged by how far x-values are from x-bar.
- Low leverage points are close to x-bar, and removing them does not change the regression line very much.
- High leverage points have unusually large or small x-values, meaning they are far from x-bar.
- Removing high leverage points can substantially change the slope, the y-intercept, or both.
- An outlier in regression has an unusually large residual and does not follow the modeled trend closely.
- Removing an outlier can strongly change the correlation and r squared.
- Influential points are points that, if removed, change the slope, y-intercept, and/or correlation substantially.
- A point can be a high leverage point, an outlier, or both.

VIDEO 2 - Transforming Nonlinear Relationships (~6:01):
- The lesson studies a nonlinear relationship between income per person and life expectancy for countries in 2018.
- The association is positive, but the form is curved rather than linear.
- The original linear model is not a good fit because the residual plot shows a curved pattern and the original r squared is 46.6%.
- When data show a nonlinear form, AP Statistics often uses a transformation to make the relationship more linear.
- Income data tend to be right-skewed, so a log transformation can reduce skew by making high values less extreme while preserving order.
- After log transforming income, the scatterplot appears more linear.
- The transformed residual plot looks more random and centered near zero, which is evidence of a better linear fit.
- The transformed r squared rises to 71.1%, which is further evidence that the transformed model is stronger.
- Other transformations exist, but AP Statistics students are usually asked to assess given transformed models using residual plots and r squared rather than invent the transformation themselves.

AP CLASSROOM FRAMEWORK CONNECTION:
- An outlier in regression does not follow the general trend and has a large residual when the LSRL is calculated.
- A high leverage point has a substantially larger or smaller x-value than the other observations.
- An influential point is any point that, if removed, changes the relationship substantially, including the slope, y-intercept, and/or correlation.
- Transformations of variables can create transformed data sets that are more linear in form than the untransformed data.
- Increased randomness in residual plots after transformation and/or movement of r squared to a value closer to 1 are evidence that the transformed linear model is more appropriate.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L9 = {
    reflect1: {
        questionText: 'How do high leverage points, outliers, and influential points differ, and what parts of the regression model do they usually affect?',
        expectedElements: [
            { id: 'high-leverage-definition', description: 'Explains that a high leverage point has an unusually large or small x-value and is far from x-bar', required: true },
            { id: 'outlier-definition', description: 'Explains that an outlier has a large residual and does not follow the general trend', required: true },
            { id: 'influential-definition', description: 'Explains that an influential point is one that substantially changes the relationship when removed', required: true },
            { id: 'high-leverage-effect', description: 'States that high leverage points often affect the slope and/or y-intercept', required: true },
            { id: 'outlier-effect', description: 'States that outliers often affect the correlation and may change r squared', required: true },
            { id: 'both-type', description: 'May mention that a point can be both high leverage and an outlier', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes high leverage points, outliers, and influential points and correctly connects them to their usual effects on the regression model.',
            P: 'Response gets some definitions or effects correct but misses one major distinction or mixes up which model features are usually affected.',
            I: 'Response does not correctly define these point types or does not explain their effects on the model.'
        },
        commonMistakes: [
            'Confusing a high leverage point with a point that simply has a large residual',
            'Calling every outlier influential without explaining the removal idea',
            'Saying high leverage points mainly change correlation instead of slope or intercept',
            'Ignoring that influential points are defined by what happens when the point is removed'
        ],
        contextFromVideo: 'Video 1 defines high leverage points by unusual x-values, defines outliers by large residuals, and explains that influential points substantially change the regression relationship when removed.'
    },

    reflect2: {
        questionText: 'When should statisticians consider transforming bivariate data, and what evidence suggests the transformed model is better?',
        expectedElements: [
            { id: 'nonlinear-trigger', description: 'Explains that transformation should be considered when the scatterplot or residual plot suggests a nonlinear pattern', required: true },
            { id: 'purpose-of-transform', description: 'States that the goal is to make the relationship more linear so a linear model fits better', required: true },
            { id: 'log-skew', description: 'Explains that a log transformation can reduce right skew or make large values less extreme', required: true },
            { id: 'residual-evidence', description: 'States that the transformed model is better if the residual plot looks more random and centered around zero', required: true },
            { id: 'r-squared-evidence', description: 'States that a higher r squared or an r squared closer to 1 supports the transformed model', required: true },
            { id: 'numeric-example', description: 'May mention the example where r squared improved from 46.6% to 71.1%', required: false }
        ],
        scoringGuide: {
            E: 'Response explains when transformation is useful, what it is trying to accomplish, and what evidence shows that the transformed model is more appropriate.',
            P: 'Response identifies some transformation ideas correctly but misses a major part of the reason for transforming or the evidence used to judge improvement.',
            I: 'Response does not correctly explain when to transform data or how to tell whether the transformed model is better.'
        },
        commonMistakes: [
            'Saying data should be transformed only because r squared is not perfect',
            'Ignoring the residual plot as evidence',
            'Forgetting that the purpose is to make the relationship more linear',
            'Describing log transformation without mentioning reduced skew or compressed high values'
        ],
        contextFromVideo: 'Video 2 shows that the original income versus life expectancy model had curved residuals and lower r squared, while the log-transformed model had more random residuals and a higher r squared.'
    },

    exitTicket: {
        questionText: 'A scatterplot has one point far from x-bar and another point near x-bar with a very large residual. A second study improves after a log transformation of income, with residuals becoming random around zero and r squared increasing from 46.6% to 71.1%. Identify the high leverage point and outlier, explain what makes a point influential, describe how removing high leverage points versus outliers can change a model, explain why a log transformation can help with income data, and explain why the transformed model is more appropriate.',
        expectedElements: [
            { id: 'high-leverage-identification', description: 'Identifies the point far from x-bar as the high leverage point because it has an unusual x-value', required: true },
            { id: 'outlier-identification', description: 'Identifies the point with the very large residual near x-bar as the outlier because it does not follow the trend', required: true },
            { id: 'influential-definition', description: 'Explains that a point is influential if removing it substantially changes the relationship', required: true },
            { id: 'different-effects', description: 'Explains that high leverage points often change slope and/or y-intercept, while outliers often change correlation and possibly r squared', required: true },
            { id: 'log-transform-purpose', description: 'Explains that a log transformation can reduce right skew and make the relationship more linear by making large income values less extreme', required: true },
            { id: 'better-fit-evidence', description: 'Explains that the transformed model is more appropriate because the residuals are more random around zero and r squared increased from 46.6% to 71.1%', required: true },
            { id: 'both-point-type', description: 'May mention that a point can be both high leverage and an outlier', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the point types, explains influential points and their effects, and uses both residual-plot evidence and r squared evidence to justify the transformed model.',
            P: 'Response gets most of the ideas right but misses or weakly explains one major part of the point classification, influential-point effects, or transformation evidence.',
            I: 'Response has major errors about high leverage points, outliers, influential points, or why the transformed model is better.'
        },
        commonMistakes: [
            'Calling the point near x-bar a high leverage point just because it has a large residual',
            'Describing influential points without the removal idea',
            'Forgetting that high leverage and outlier points usually affect different parts of the model',
            'Explaining the transformed model only with r squared and not with residual-plot evidence',
            'Ignoring how log transformation changes skew in income data'
        ],
        contextFromVideo: 'Across both videos, the lesson classifies unusual points in regression and uses log transformation, residual plots, and r squared to judge whether a linear model is more appropriate.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L9 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L9[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about analyzing departures from linearity (Topic 2.9).

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
window.getRubricU2L9 = function(questionId) {
    return window.RUBRICS_U2L9[questionId] || null;
};

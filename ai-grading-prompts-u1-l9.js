/**
 * AI Grading Prompts for Unit 1 Lesson 9: Topic 1.9
 * Topic 1.9: Topic 1.9
 *
 * Learning Objectives:
 *   Compare graphical representations for multiple sets of quantitative data
 *   Compare summary statistics for multiple sets of quantitative data
 *   Write complete comparison responses using shape, center, variability, unusual features, comparative words, and context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L9 = `
VIDEO 1 - Comparing Distributions of a Quantitative Variable (~8:31):
- The video focuses on comparing distributions of a quantitative variable.
- Two main questions guide the lesson: what characteristics matter when comparing quantitative distributions, and what is needed for a complete written comparison.
- The lesson reviews the four important characteristics for describing or comparing a quantitative distribution: shape, center, variability, and unusual features.
- Shape vocabulary includes skewed left, skewed right, symmetric, unimodal, bimodal, and uniform.
- Center can be described with the mean or median.
- Variability can be compared with the range, IQR, or standard deviation.
- Unusual features include outliers, gaps, and clusters.
- When comparing two distributions, the same four characteristics should still be addressed.
- The example comes from 2015 AP Exam Question 1 about yearly salaries at corporations A and B.
- In 2009, both corporations offered a starting salary of $36,000 to entry-level accountants.
- Data were collected from 30 employees at each corporation who were hired in 2009 and still employed five years later.
- Side-by-side box plots summarize the 2014 yearly salaries.
- In the model comparison, both salary distributions appear fairly symmetric and have approximately the same median.
- Corporation A has greater variability than corporation B because both the range and the IQR are larger.
- Corporation A has two high outliers, while corporation B has no outliers.
- Because box plots do not show how values are distributed inside each quartile, shape language should be cautious, such as saying a distribution appears fairly symmetric.
- A complete response must address all four characteristics, use comparative words, and include context.
- Comparative words in the model solution include similar, same, and greater than.
- Context in the model solution is yearly salary.
- In part (b), one reason to choose corporation A is that at least 3 out of 30 salaries, or 10%, are greater than the maximum salary at corporation B, so corporation A may offer a higher salary.
- One reason to choose corporation B is that its minimum salary is greater than corporation A's minimum salary.
- The video explains that some employees at corporation A may still be making the original $36,000 starting salary and may not have received a raise.
- The takeaway is to compare shape, center, variability, and unusual features, while also using comparative words and context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L9 = {
    reflect1: {
        questionText: 'Explain how the yearly salary distributions for corporations A and B compare in shape, center, variability, and unusual features. Use comparative words and context in your answer.',
        expectedElements: [
            { id: 'shape-comparison', description: 'States that the salary distributions appear similar or fairly symmetric for both corporations', required: true },
            { id: 'center-comparison', description: 'States that the medians are approximately the same for corporations A and B', required: true },
            { id: 'variability-comparison', description: 'Explains that corporation A has greater variability than corporation B, such as a larger range or IQR', required: true },
            { id: 'unusual-features', description: 'Explains that corporation A has two high outliers while corporation B has no outliers', required: true },
            { id: 'comparative-language', description: 'Uses comparative words such as similar, same, greater, or less', required: true },
            { id: 'context', description: 'Uses context by referring to yearly salaries or corporations A and B', required: true },
            { id: 'boxplot-caution', description: 'May note that box plots only show that the distributions appear symmetric because values inside quartiles are hidden', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly compares the salary distributions in shape, center, variability, and unusual features, while using comparative words and context.',
            P: 'Response shows partial understanding of the comparison but misses one major characteristic, weakens the comparison language, or lacks clear context.',
            I: 'Response does not correctly compare the two salary distributions using the key features from the lesson.'
        },
        commonMistakes: [
            'Describing each corporation separately without directly comparing them',
            'Leaving out one of the four characteristics such as variability or unusual features',
            'Forgetting that corporation A has greater variability than corporation B',
            'Ignoring context and writing only generic statements about box plots'
        ],
        contextFromVideo: 'The model solution says both salary distributions appear fairly symmetric, the medians are about the same, corporation A has greater range and IQR, and corporation A has two high outliers while corporation B has none.'
    },

    reflect2: {
        questionText: 'Explain one reason someone might choose corporation A and one reason someone might choose corporation B based on the box plots. Mention a specific box-plot feature and explain why it matters.',
        expectedElements: [
            { id: 'reason-for-a', description: 'Gives a valid reason to choose corporation A, such as the possibility of earning a higher salary because some salaries at A exceed the maximum at B', required: true },
            { id: 'a-feature', description: 'Supports the reason for corporation A with a box-plot feature such as the high outliers or the fact that at least 3 of 30 salaries at A are above the maximum at B', required: true },
            { id: 'reason-for-b', description: 'Gives a valid reason to choose corporation B, such as the higher minimum salary or less risk of never getting a raise', required: true },
            { id: 'b-feature', description: 'Supports the reason for corporation B with a box-plot feature such as the higher minimum or the absence of salaries still at the starting value', required: true },
            { id: 'context', description: 'Uses context by referring to salary, raises, or corporations A and B', required: true },
            { id: 'based-on-box-plots', description: 'May explicitly say that the reasons come from features visible on the box plots', required: false }
        ],
        scoringGuide: {
            E: 'Response gives one valid, well-supported reason for choosing each corporation and clearly connects each reason to a box-plot feature in context.',
            P: 'Response gives partly correct reasons but leaves one reason unsupported, mixes up the corporation evidence, or uses weak context.',
            I: 'Response does not correctly explain a valid reason for choosing both corporations based on the box plots.'
        },
        commonMistakes: [
            'Giving a preference without referring to any feature of the box plots',
            'Mixing up which corporation has the higher minimum salary',
            'Ignoring the high salaries and outliers at corporation A',
            'Failing to explain why the box-plot feature would matter to someone choosing a job'
        ],
        contextFromVideo: 'The video says corporation A may be attractive because at least 3 of 30 salaries are above the maximum salary at corporation B, while corporation B may be attractive because its minimum salary is higher and corporation A may still have employees earning $36,000.'
    },

    exitTicket: {
        questionText: 'A school compared nightly homework times for students in two study halls using side-by-side box plots. Study Hall A had minimum 30, Q1 45, median 60, Q3 90, largest non-outlier 110, and one high outlier at 150. Study Hall B had minimum 45, Q1 54, median 60, Q3 66, maximum 75, and no outliers. Compare center and variability, describe unusual features and apparent shape, and write a complete comparison using comparative words and context.',
        expectedElements: [
            { id: 'center', description: 'States that the centers are about the same because both medians are 60 minutes', required: true },
            { id: 'variability', description: 'Explains that Study Hall A has greater variability than Study Hall B, such as a larger IQR or range', required: true },
            { id: 'unusual-features', description: 'Notes that Study Hall A has a high outlier at 150 while Study Hall B has no outliers', required: true },
            { id: 'shape', description: 'States that Study Hall A appears skewed right and that Study Hall B appears fairly symmetric or less skewed based on the box plots', required: true },
            { id: 'comparative-context', description: 'Uses comparative words and refers to nightly homework times or study halls in context', required: true },
            { id: 'numerical-support', description: 'May include supporting values such as Q1 and Q3 or describe the middle 50% for each study hall', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly compares center, variability, shape, and unusual features for the two homework-time distributions using comparative language and context.',
            P: 'Response includes several correct comparisons but misses one major feature, uses weak comparison language, or lacks clear context.',
            I: 'Response does not correctly compare the two homework-time distributions using the key ideas from the lesson.'
        },
        commonMistakes: [
            'Saying the distributions have different centers even though both medians are 60',
            'Missing that Study Hall A has much greater variability than Study Hall B',
            'Ignoring the high outlier at 150 in Study Hall A',
            'Forgetting to use comparative words or to mention homework times in context'
        ],
        contextFromVideo: 'The lesson says a complete comparison should address shape, center, variability, and unusual features, use comparative words, and include context from the variable being studied.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L9 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L9[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.9: Topic 1.9.

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
window.getRubricU1L9 = function(questionId) {
    return window.RUBRICS_U1L9[questionId] || null;
};

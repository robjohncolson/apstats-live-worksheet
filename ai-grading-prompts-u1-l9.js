/**
 * AI Grading Prompts for Unit 1 Lesson 9: Topic 1.9
 * Topic 1.9: Comparing Distributions of a Quantitative Variable
 *
 * Learning Objectives:
 *   Review the four characteristics used to describe a quantitative distribution
 *   Compare two quantitative distributions using shape, center, variability, and unusual features
 *   Interpret side-by-side box plots in context
 *   Write a complete comparison response using comparative language and context
 *   Use box-plot evidence to justify a choice between two groups
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L9 = `
VIDEO 1 - Comparing Distributions of a Quantitative Variable (~8:31):
- The lesson begins with two questions: what characteristics matter when comparing quantitative distributions and what is needed for a complete response.
- Students review the same four characteristics used to describe a single quantitative distribution: shape, center, variability, and unusual features.
- Shape vocabulary includes skewed left, skewed right, symmetric, unimodal, bimodal, and uniform.
- Center can be described with the mean or median.
- Variability can be described with the range, IQR, or standard deviation.
- Unusual features include outliers, gaps, and clusters.
- When comparing two distributions, students still address the same four characteristics, but they must compare the groups directly.
- The example is a released 2015 AP free-response question about yearly salaries in 2014 for 30 employees at corporation A and 30 employees at corporation B, all hired in 2009 as entry-level accountants.
- The model solution says the box-plot shapes appear similar and fairly symmetric for both corporations.
- The median salary is approximately the same for corporations A and B.
- The range and IQR are greater for corporation A than corporation B, so corporation A has more variability.
- Corporation A has two high outliers, while corporation B has no outliers.
- The lesson stresses that box plots only suggest shape because we do not know how values are distributed within each quartile, so wording like "appears fairly symmetric" is appropriate.
- A complete comparison response must address all four characteristics, use comparative words such as similar, same, greater, or less, and include context such as yearly salary.
- In part B, one reason to choose corporation A is that at least three salaries there are above the maximum salary at corporation B, so A offers the possibility of a higher salary.
- One reason to choose corporation B is that its minimum salary is higher than corporation A's, while some employees at A appear to still make the starting salary after five years.
- The key takeaway is to compare shape, center, variability, and unusual features, while writing with comparative language and context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L9 = {
    reflect1: {
        questionText: 'What four characteristics should you discuss when comparing two quantitative distributions, and how can box plots help you describe them?',
        expectedElements: [
            { id: 'four-characteristics', description: 'Identifies shape, center, variability, and unusual features as the four characteristics to compare', required: true },
            { id: 'center-and-variability', description: 'Explains that box plots help compare center and variability using medians, ranges, or IQRs', required: true },
            { id: 'outliers-or-features', description: 'Explains that box plots can show unusual features such as outliers', required: true },
            { id: 'cautious-shape', description: 'May note that box plots only suggest shape, so wording like appears fairly symmetric is more appropriate than a definite claim', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies all four characteristics and clearly explains how box plots help compare them.',
            P: 'Response shows partial understanding of the four characteristics or how box plots help, but leaves out or confuses one major component.',
            I: 'Response does not correctly explain what should be compared or how box plots help describe the distributions.'
        },
        commonMistakes: [
            'Leaving out one of the four characteristics such as variability or unusual features',
            'Talking only about center and ignoring spread or outliers',
            'Treating a box plot as if it shows every individual value',
            'Using shape language without recognizing that box plots only suggest shape'
        ],
        contextFromVideo: 'Luke reviews shape, center, variability, and unusual features, then uses side-by-side box plots to compare medians, spread, and outliers between the two corporations.'
    },

    reflect2: {
        questionText: 'What makes a response a complete comparison instead of just a list of separate descriptions?',
        expectedElements: [
            { id: 'all-four', description: 'States that a complete response must address all four characteristics', required: true },
            { id: 'comparative-words', description: 'Explains that the response must use comparative words such as similar, same, greater, or less', required: true },
            { id: 'context', description: 'Explains that the response must include context by naming the variable or situation being compared', required: true },
            { id: 'direct-comparison', description: 'Explains that the two groups should be compared directly rather than described separately with no connection', required: true }
        ],
        scoringGuide: {
            E: 'Response clearly explains that a complete comparison addresses all four characteristics, uses comparative language, includes context, and compares the groups directly.',
            P: 'Response includes some of the ingredients of a complete comparison but leaves out or weakly explains at least one major requirement.',
            I: 'Response does not explain what makes a comparison complete in AP Statistics.'
        },
        commonMistakes: [
            'Listing shape, center, spread, or outliers without comparing the groups directly',
            'Forgetting to use words such as greater, less, same, or similar',
            'Leaving out context and talking only about abstract box plots',
            'Addressing only one or two characteristics instead of all four'
        ],
        contextFromVideo: 'The checklist in the lesson says a complete response addresses all four characteristics, uses comparative words, and includes context such as yearly salary.'
    },

    exitTicket: {
        questionText: 'A school compared the number of minutes students spent on homework on weeknights in two study groups. Group A has minimum 20, Q1 35, median 50, Q3 70, largest non-outlier 110, and one high outlier at 145. Group B has minimum 30, Q1 40, median 50, Q3 60, maximum 85, and no outliers. The box plots appear fairly symmetric. Compare the center and variability, compare unusual features and shape using appropriate box-plot language, and write 2-3 complete sentences that would count as a full AP Statistics comparison in context.',
        expectedElements: [
            { id: 'center', description: 'States that the two groups have about the same center because both medians are 50', required: true },
            { id: 'variability', description: 'Explains that Group A has greater variability or spread because its range and IQR are larger than Group B', required: true },
            { id: 'outliers', description: 'Identifies the high outlier at 145 in Group A and notes that Group B has no outliers', required: true },
            { id: 'shape', description: 'Describes the shapes as appearing fairly symmetric or similar and uses appropriate caution because the information comes from box plots', required: true },
            { id: 'context-and-comparison', description: 'Writes the comparison in context about homework minutes for the two study groups and uses direct comparative wording', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly compares center, variability, unusual features, and shape, and writes a complete comparison in context with comparative language.',
            P: 'Response gets much of the comparison right but misses or confuses one major component such as center, variability, outliers, shape, or context.',
            I: 'Response has major errors or omissions in comparing the two homework-time distributions.'
        },
        commonMistakes: [
            'Saying Group A has a higher center even though both medians are 50',
            'Ignoring the outlier at 145 or claiming both groups have outliers',
            'Describing shape too strongly without noting that box plots only suggest shape',
            'Talking about the numbers without mentioning homework minutes or the study groups',
            'Listing facts about each group without using direct comparisons such as greater, same, or more variable'
        ],
        contextFromVideo: 'The lesson models a complete box-plot comparison by discussing shape, center, variability, and outliers, then emphasizes comparative words and context.'
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

    return `You are grading an AP Statistics student's response about comparing distributions of a quantitative variable (Topic 1.9).

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

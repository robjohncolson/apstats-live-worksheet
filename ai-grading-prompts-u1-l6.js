/**
 * AI Grading Prompts for Unit 1 Lesson 6: Topic 1.6
 * Topic 1.6: Topic 1.6
 *
 * Learning Objectives:
 *   Describe quantitative data distributions using shape, center, variability, and unusual features
 *   Use shape vocabulary such as symmetric, skewed left, skewed right, unimodal, bimodal, and uniform
 *   Identify outliers, gaps, and clusters in a quantitative distribution
 *   Describe a distribution in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L6 = `
VIDEO 1 - Describing the Distribution of a Quantitative Variable (~6:28):
- The video focuses on how to describe the distribution of a quantitative variable.
- It introduces two big questions: what characteristics matter when describing a quantitative distribution, and what vocabulary best communicates those characteristics.
- The lesson uses the Flint water crisis data set with lead levels from 71 water samples collected from Flint residents.
- The teacher uses a dotplot of the Flint lead-level data as the main display.
- A complete description of a quantitative distribution should include four characteristics: shape, center, variability or spread, and unusual features.
- A symmetric distribution has a left side that is essentially a mirror image of the right side.
- A skewed left distribution has a longer left tail.
- A skewed right distribution has a longer right tail.
- A distribution with one main peak is unimodal.
- A distribution with two prominent peaks is bimodal.
- A distribution with about the same frequency across values is uniform.
- Center answers the question of which value best describes the typical response.
- Variability or spread answers whether the values are packed close together or more spread out.
- Unusual features include outliers, gaps, and clusters.
- Outliers are values that do not fit with the rest of the distribution and are much higher or lower than most values.
- Gaps are regions where no values appear.
- Clusters are concentrations of values, often separated by gaps.
- The Flint lead-level distribution is described as unimodal and skewed right.
- The teacher says a typical value for the Flint lead levels is about 3 to 4 parts per billion.
- The spread of the Flint data goes from 0 to 104 parts per billion.
- The Flint data have a cluster of values between 0 and 10.
- There is a clear gap in the Flint data between 42 and 104.
- The high-end values, especially 104, may be considered outliers.
- The lesson emphasizes that students should always include context, such as lead levels for Flint water samples, when describing a distribution.
- The summary returns to the four required characteristics: shape, center, variability, and unusual features.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L6 = {
    reflect1: {
        questionText: 'Describe the Flint lead-level distribution using all four characteristics from the lesson. Be sure to use context in your answer.',
        expectedElements: [
            { id: 'shape-description', description: 'Describes the shape as unimodal and skewed right or gives equivalent correct shape language', required: true },
            { id: 'center-description', description: 'Identifies a typical value around 3 to 4 parts per billion', required: true },
            { id: 'variability-description', description: 'Describes the spread or variability as going from 0 to 104 parts per billion or gives an equivalent spread statement', required: true },
            { id: 'unusual-features', description: 'Mentions unusual features such as the cluster from 0 to 10, the gap between 42 and 104, or high outliers', required: true },
            { id: 'context', description: 'Uses context by referring to Flint lead levels or Flint water samples', required: true },
            { id: 'single-peak-detail', description: 'May mention that the single peak is at or near 0', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly describes the Flint distribution with shape, center, variability, unusual features, and context.',
            P: 'Response includes some correct characteristics of the Flint distribution but leaves out one major part or uses weak context.',
            I: 'Response does not correctly describe the Flint distribution using the four required characteristics.'
        },
        commonMistakes: [
            'Describing only the shape and forgetting center or spread',
            'Leaving out context and writing only generic graph vocabulary',
            'Calling the Flint distribution symmetric',
            'Ignoring the unusual features such as the gap or outliers'
        ],
        contextFromVideo: 'The video describes the Flint lead-level distribution as unimodal and skewed right, with a typical value around 3 to 4, spread from 0 to 104, a cluster from 0 to 10, a gap from 42 to 104, and possible outliers on the high end.'
    },

    reflect2: {
        questionText: 'Explain what unusual features you should look for when describing a quantitative distribution. Use at least two terms from the lesson and connect one of them to the Flint data.',
        expectedElements: [
            { id: 'outlier-definition', description: 'Explains that outliers are unusually high or low values that do not fit with the rest of the data', required: true },
            { id: 'gap-definition', description: 'Explains that a gap is a region where no observed data values appear', required: true },
            { id: 'cluster-definition', description: 'Explains that clusters are concentrations of values, often separated by gaps', required: true },
            { id: 'flint-connection', description: 'Connects at least one unusual feature to the Flint data, such as the cluster from 0 to 10, the gap from 42 to 104, or the high outlier', required: true },
            { id: 'distribution-description-role', description: 'States that unusual features are one of the important characteristics in a full distribution description', required: true },
            { id: 'gaps-clusters-together', description: 'May mention that gaps and clusters often appear together', required: false }
        ],
        scoringGuide: {
            E: 'Response accurately explains unusual features, uses lesson vocabulary, and connects at least one feature to the Flint example.',
            P: 'Response shows partial understanding of unusual features but misses one major definition or the Flint connection.',
            I: 'Response does not correctly explain unusual features in a quantitative distribution.'
        },
        commonMistakes: [
            'Treating a gap as a low bar rather than a region with no data',
            'Calling any large value an outlier without explaining why it does not fit',
            'Mentioning clusters without explaining that they are concentrations of values',
            'Forgetting to connect the explanation to the Flint example'
        ],
        contextFromVideo: 'The video says unusual features include outliers, gaps, and clusters. In the Flint data, the teacher points out a cluster from 0 to 10, a gap from 42 to 104, and very high values that may be outliers.'
    },

    exitTicket: {
        questionText: 'A school recorded the number of minutes 11 students waited for a late bus after school. Describe the shape using at least two appropriate terms, give a typical value for the center, describe the variability in context, and identify any unusual features.',
        expectedElements: [
            { id: 'shape', description: 'Describes the distribution as skewed right or right-skewed and also identifies one main peak or says unimodal', required: true },
            { id: 'center', description: 'Gives a typical value around 4 minutes or an equivalent center statement in context', required: true },
            { id: 'variability', description: 'Describes the spread as running from 1 to 18 minutes or gives an equivalent variability statement in context', required: true },
            { id: 'unusual-features', description: 'Identifies unusual features such as a cluster from about 1 to 6, a gap before 18, or the value 18 as an outlier', required: true },
            { id: 'context', description: 'Uses context by referring to minutes waiting for the late bus or waiting times for students', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly describes the distribution with shape, center, variability, unusual features, and context.',
            P: 'Response includes several correct ideas but misses one major part of the description or uses weak context.',
            I: 'Response omits multiple required parts or shows weak understanding of how to describe a quantitative distribution.'
        },
        commonMistakes: [
            'Giving only one shape word when the prompt asks for at least two appropriate terms',
            'Listing the minimum and maximum without describing center',
            'Ignoring the high value of 18 as an unusual feature',
            'Describing the numbers without mentioning bus wait times'
        ],
        contextFromVideo: 'The lesson teaches that a full description of a quantitative distribution should include shape, center, variability, unusual features, and context. Appropriate unusual features here would include the high value 18, the gap before it, and the main cluster of smaller waiting times.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L6[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.6: Topic 1.6.

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
window.getRubricU1L6 = function(questionId) {
    return window.RUBRICS_U1L6[questionId] || null;
};

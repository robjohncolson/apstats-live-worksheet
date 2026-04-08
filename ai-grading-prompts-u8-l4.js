/**
 * AI Grading Prompts for Unit 8 Lesson 4: Expected Counts in Two-Way Tables
 * Topic 8.4: Expected Counts in Two-Way Tables
 *
 * Learning Objectives:
 *   Calculate expected counts in a two-way table using row totals, column totals, and the table total
 *   Explain that expected counts in a two-way table are based on the assumption of no relationship between the variables
 *   Use the expected-count formula for specific cells in a two-way table
 *   Use row totals, column totals, and subtraction to find remaining expected counts efficiently
 *   Distinguish observed counts, expected counts, and total cells in a two-way table
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L4 = `
VIDEO 1 - Expected Counts in Two-Way Tables (~8 min):
- Presenter explains how to calculate expected counts in two-way tables of categorical data
- MAIN IDEAS:
  - Topics 8.4 through 8.6 introduce two new chi-square significance tests that use two-way tables
  - A two-way table summarizes data for two categorical variables
  - Expected counts in a two-way table are calculated assuming there is no relationship between the two categorical variables
  - Start by finding the row totals, the column totals, and the table total
  - The expected count formula is (row total * column total) / table total
  - The formula can also be understood by finding an overall row proportion and applying it to a column total
  - Once enough expected counts are found, the remaining interior cells can often be determined by subtraction
  - Expected counts are only calculated for interior cells, not for the totals
  - If expected counts are written in parentheses in the table, a key should identify them clearly
- SCHOOL EXAMPLE DETAILS:
  - Parents with school-aged children were sampled in 2019 and again in 2020
  - Variables: year and school type
  - Observed counts:
    Public: 266 in 2019 and 163 in 2020
    Private/Parochial/Charter: 16 in 2019 and 21 in 2020
    Home: 38 in 2019 and 30 in 2020
  - Row totals: 429, 37, and 68
  - Column totals: 320 for 2019 and 214 for 2020
  - Table total: 534
  - Public row proportion: 429 / 534 = 0.8034, or about 80.34%
  - Expected Public in 2019 = (429 * 320) / 534 = 257.1
  - Expected Private/Parochial/Charter in 2019 = (37 * 320) / 534 = 22.2
  - Remaining expected counts by subtraction: Home 2019 = 40.7, Public 2020 = 171.9, Private/Parochial/Charter 2020 = 14.8, Home 2020 = 27.3
- EMPLOYMENT PRACTICE DETAILS:
  - Random sample of 2000 adults
  - Variables: education level and employment status
  - Observed counts:
    Employed: 206, 548, 1186
    Unemployed: 14, 22, 24
  - Row totals: 1940 and 60
  - Column totals: 220, 570, and 1210
  - Table total: 2000
  - Expected Employed / No High School Diploma = 213.4
  - Expected Employed / High School Diploma No College = 552.9
  - Remaining expected counts by subtraction: 1173.7, 6.6, 17.1, and 36.3
- FINAL TAKEAWAY:
  - expected count = (row total * column total) / table total, then use subtraction when possible
`;

// Rubrics for each reflection question
window.RUBRICS_U8L4 = {
    reflect1: {
        questionText: 'Explain how the school-type-by-year table is used to calculate expected counts. Include the assumption of no relationship, the row totals and column totals, the table total 534, the formula (row total * column total) / table total, the expected count 257.1 for Public in 2019, and how subtraction gives the remaining expected counts.',
        expectedElements: [
            { id: 'no-relationship', description: 'States that expected counts are calculated assuming there is no relationship between year and school type', required: true },
            { id: 'totals', description: 'Identifies the row totals 429, 37, and 68, the column totals 320 and 214, and the table total 534', required: true },
            { id: 'formula', description: 'Uses or states the formula expected count = (row total * column total) / table total', required: true },
            { id: 'public-2019', description: 'Gives the expected count for Public in 2019 as 257.1, or shows the calculation (429 * 320) / 534', required: true },
            { id: 'private-2019', description: 'Gives the expected count for Private/Parochial/Charter in 2019 as about 22.2', required: true },
            { id: 'subtraction-shortcut', description: 'Explains that subtraction with row totals or column totals can be used once some expected counts are known', required: true },
            { id: 'remaining-counts', description: 'Identifies the remaining expected counts as about 40.7, 171.9, 14.8, and 27.3', required: true },
            { id: 'no-total-cells', description: 'May note that totals do not get expected counts', required: false },
            { id: 'key-parentheses', description: 'May note that a key should identify expected counts if they are shown in parentheses', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains the no-relationship assumption, the totals, the expected-count formula, the 257.1 calculation, and how subtraction is used to complete the school table.',
            P: 'Response shows the main idea of how expected counts are found but misses one major element such as the formula, the totals, or how subtraction completes the remaining cells.',
            I: 'Response confuses observed and expected counts, uses the wrong formula, or does not explain how the school example expected counts are obtained.'
        },
        commonMistakes: [
            'Using the observed count in the cell instead of the row total or column total in the formula',
            'Forgetting to divide by the table total',
            'Assuming the expected counts should all be equal instead of using the no-relationship model',
            'Leaving out the subtraction shortcut for the remaining cells',
            'Treating totals cells as if they also need expected counts'
        ],
        contextFromVideo: 'The school example is used to build the expected-count formula, beginning with Public in 2019 and then finishing the rest of the table with subtraction.'
    },

    reflect2: {
        questionText: 'Explain how the employment example uses both the expected-count formula and the subtraction shortcut. Include the totals 1940, 60, 220, 570, 1210, and 2000, the expected counts 213.4 and 552.9 for the first two employed cells, the remaining expected counts 1173.7, 6.6, 17.1, and 36.3, and why totals do not get expected counts.',
        expectedElements: [
            { id: 'no-relationship', description: 'States that expected counts are based on the assumption of no relationship between education level and employment status', required: true },
            { id: 'totals', description: 'Identifies the row totals 1940 and 60, the column totals 220, 570, and 1210, and the table total 2000', required: true },
            { id: 'formula', description: 'Uses or states the formula expected count = (row total * column total) / table total', required: true },
            { id: 'first-expected-count', description: 'Gives the expected count for Employed and No High School Diploma as 213.4', required: true },
            { id: 'second-expected-count', description: 'Gives the expected count for Employed and High School Diploma No College as 552.9', required: true },
            { id: 'remaining-counts', description: 'Identifies the remaining expected counts as 1173.7, 6.6, 17.1, and 36.3', required: true },
            { id: 'subtraction-shortcut', description: 'Explains that subtraction from row totals or column totals can be used to find the remaining cells after calculating a few expected counts', required: true },
            { id: 'no-total-cells', description: 'Explains that totals do not get expected counts because they are already fixed sums of the interior cells', required: true },
            { id: 'variable-placement', description: 'May mention that education level is in the columns and employment status is in the rows', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains the employment table totals, the first expected counts from the formula, the remaining expected counts from subtraction, and why totals cells do not receive expected counts.',
            P: 'Response gets the general process right but leaves out one major numerical result or the explanation of why subtraction or totals work the way they do.',
            I: 'Response gives the wrong expected counts, uses the wrong totals, or does not explain how the employment example is completed.'
        },
        commonMistakes: [
            'Using 206 or 548 directly in the expected-count formula instead of the row and column totals',
            'Mixing observed counts with expected counts',
            'Forgetting that the table total is 2000',
            'Not using subtraction to finish the table after the first calculations',
            'Claiming that totals should also have expected counts'
        ],
        contextFromVideo: 'The employment example begins with two expected counts from the formula and then uses subtraction with the totals to determine the other four cells.'
    },

    exitTicket: {
        questionText: 'A random sample of 2000 adults produced the following observed counts for employment status by education level: Employed = 206, 548, 1186 and Unemployed = 14, 22, 24. The column totals are 220, 570, and 1210. (a) Find the two row totals and the table total. (b) State the assumption used to calculate expected counts. (c) Use the formula to find the expected counts for Employed/No HS Diploma and Employed/HS Diploma No College. (d) Use subtraction to find the remaining four expected counts. (e) Explain why the totals do not get expected counts and why a key is useful if expected counts are written in parentheses.',
        expectedElements: [
            { id: 'row-and-table-totals', description: 'Finds the row totals as 1940 and 60 and the table total as 2000', required: true },
            { id: 'assumption', description: 'States that expected counts are calculated assuming no relationship between education level and employment status', required: true },
            { id: 'formula', description: 'Uses the formula expected count = (row total * column total) / table total', required: true },
            { id: 'first-two-expected-counts', description: 'Calculates the first two expected counts as 213.4 and 552.9', required: true },
            { id: 'remaining-four-counts', description: 'Finds the remaining expected counts as 1173.7, 6.6, 17.1, and 36.3', required: true },
            { id: 'totals-explanation', description: 'Explains that totals do not get expected counts because they are already the row and column sums of the interior cells', required: true },
            { id: 'key-explanation', description: 'Explains that a key helps the reader know that numbers in parentheses are expected counts', required: true },
            { id: 'column-totals', description: 'May explicitly restate the column totals 220, 570, and 1210', required: false },
            { id: 'subtraction-language', description: 'May explicitly say that subtraction preserves the row totals and column totals', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly gives the totals, assumption, formula, expected counts, subtraction results, and explanations about totals and the key.',
            P: 'Response shows most of the expected-count process but misses one major numerical result or one of the explanations at the end.',
            I: 'Response does not correctly compute the expected counts or does not explain the basic no-relationship model for the two-way table.'
        },
        commonMistakes: [
            'Getting the row totals wrong by not adding across correctly',
            'Using the wrong denominator instead of the table total 2000',
            'Stopping after the first two expected counts and not finishing the table',
            'Saying totals need expected counts',
            'Not explaining the purpose of the key for expected counts in parentheses'
        ],
        contextFromVideo: 'The exit ticket mirrors the practice example from the video: compute totals, apply the expected-count formula, finish with subtraction, and explain why totals and keys are treated differently.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L4[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Expected Counts in Two-Way Tables.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L4}

REQUIRED ELEMENTS (must address for E score):
${requiredElements.map(e => `- ${e.description}`).join('\n')}

OPTIONAL ELEMENTS (strengthen response):
${optionalElements.map(e => `- ${e.description}`).join('\n')}

SCORING GUIDE:
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

COMMON MISTAKES TO WATCH FOR:
${rubric.commonMistakes.map(m => `- ${m}`).join('\n')}

CONTEXT FROM VIDEO:
${rubric.contextFromVideo}

Grade this response and provide:
1. A score (E, P, or I)
2. Brief feedback explaining the score
3. List of elements the student addressed correctly (matched)
4. List of elements that are missing or incorrect (missing)
5. A helpful suggestion for improvement (if not E)

Respond in JSON format:
{
    'score': 'E|P|I',
    'feedback': 'Brief explanation of score',
    'matched': ['element1', 'element2'],
    'missing': ['element3'],
    'suggestion': 'Helpful tip for improvement or null if E'
}`;
};

/**
 * Get the rubric for a specific question
 * @param {string} questionId - The ID of the question
 * @returns {object} The rubric object
 */
window.getRubricU8L4 = function(questionId) {
    return window.RUBRICS_U8L4[questionId];
};

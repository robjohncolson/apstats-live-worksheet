/**
 * AI Grading Prompts for Unit 1 Lesson 3: Topic 1.3
 * Topic 1.3: Representing a Categorical Variable with Tables
 *
 * Learning Objectives:
 *   Represent categorical data using frequency tables
 *   Represent categorical data using relative frequency tables
 *   Describe categorical data using counts, proportions, and percentages
 *   Use table values to justify claims in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L3 = `
VIDEO 1 - Representing a Categorical Variable with Tables (~8:06):
- The video focuses on two questions: how to represent categorical data in tabular form and how tables help describe categorical data.
- The main example is an online survey asking which superpower students would most like to have.
- The categories are invisibility, telepathy, freeze time, super strength, and fly.
- The data come from a random sample of 50 high school students.
- The individuals are the 50 high school students who completed the survey.
- The variable is superpower preference.
- Because the values are category names or labels, superpower preference is a categorical variable.
- The distribution of a categorical variable can be represented with a frequency table.
- A frequency table gives the number of individuals, or cases, in each category.
- In the superpower example, fly has frequency 9, super strength has frequency 3, and telepathy is one of the higher categories.
- The lesson also uses relative frequency tables.
- A relative frequency table gives the proportion or percent of individuals in each category.
- Relative frequencies are found by dividing each count by the total number of cases.
- In the superpower example, the total is 50, so fly has relative frequency 9/50 = 0.18 or 18%.
- The relative frequency table for the superpower survey includes fly 18%, freeze time 30%, invisibility 14%, super strength 6%, and telepathy 32%.
- The learning objective is to represent categorical data using frequency or relative frequency tables.
- The video shows how table values can be used to evaluate statements about the data.
- A majority means at least 50%.
- In the superpower example, exactly 50% of students chose either fly or telepathy because 18% + 32% = 50%.
- Invisibility is second to last in popularity, so it is not one of the more popular choices.
- A second example comes from the 2018 Monitoring the Future study about the perceived risk of occasionally vaping nicotine.
- Students are encouraged to total the frequencies before evaluating claims; the total number of responses is 2252.
- In that table, 782 out of 2252 responded slight risk, which is 34.7%, so that is over one-third.
- Also in that table, 191 out of 2252 responded can't say, drug unfamiliar, which is 8.5%, so that is not over 10%.
- The lesson closes by reviewing that categorical data can be represented with a frequency table or a relative frequency table.
- It also emphasizes that counts, percentages, and proportions reveal information that can be used to justify claims about data in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L3 = {
    reflect1: {
        questionText: 'Using the superpower survey, explain the difference between a frequency table and a relative frequency table.',
        expectedElements: [
            { id: 'frequency-counts', description: 'Explains that a frequency table gives the number of individuals or cases in each category', required: true },
            { id: 'relative-frequency-proportion', description: 'Explains that a relative frequency table gives the proportion or percent in each category', required: true },
            { id: 'superpower-context', description: 'Uses the superpower survey context or a correct category example such as fly, telepathy, or invisibility', required: true },
            { id: 'divide-by-total', description: 'May mention that relative frequencies are found by dividing by the total of 50 students', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes counts from proportions or percentages and explains both tables in the superpower context.',
            P: 'Response shows the general difference between the two tables but does not explain one of them fully or does not use the survey context well.',
            I: 'Response does not correctly distinguish a frequency table from a relative frequency table.'
        },
        commonMistakes: [
            'Saying both tables only show counts',
            'Describing relative frequency without mentioning proportion or percent',
            'Ignoring the superpower survey context entirely',
            'Confusing a category name with a relative frequency'
        ],
        contextFromVideo: 'The lesson defines a frequency table as the number of cases in each category and a relative frequency table as the proportion or percent in each category, using the superpower survey of 50 students.'
    },

    reflect2: {
        questionText: 'How did the video use table values to decide whether a claim about categorical data was true or not supported? Use one example from the superpower or vaping scenario.',
        expectedElements: [
            { id: 'use-counts-or-percentages', description: 'Explains that counts, proportions, or percentages from the table are used to test a claim', required: true },
            { id: 'specific-example', description: 'Uses a correct example from the lesson, such as fly plus telepathy equaling 50 percent or can\'t say drug unfamiliar being 8.5 percent', required: true },
            { id: 'claim-judgment', description: 'States whether the claim is supported or not supported and why the numbers justify that decision', required: true },
            { id: 'majority-threshold', description: 'May mention a benchmark such as majority meaning more than 50 percent or over one-third meaning above about 33 percent', required: false }
        ],
        scoringGuide: {
            E: 'Response explains that table values justify claims and uses a correct lesson example to show why a statement is true or not supported.',
            P: 'Response gives part of the idea or mentions an example, but does not clearly connect the numbers to the claim decision.',
            I: 'Response does not show how counts or relative frequencies are used to evaluate claims about the data.'
        },
        commonMistakes: [
            'Giving an opinion instead of using table values',
            'Using an example that does not match the lesson numbers',
            'Failing to say whether the claim is supported or not supported',
            'Ignoring the need to justify the claim in context'
        ],
        contextFromVideo: 'The video checks statements by comparing counts and relative frequencies to words like majority, nearly half, over one-third, and over 10 percent. It uses examples such as fly plus telepathy equaling exactly 50 percent and can\'t say drug unfamiliar being only 8.5 percent.'
    },

    exitTicket: {
        questionText: 'A random sample of 40 students was asked which school lunch side they prefer. The table shows fruit 12, chips 18, salad 6, and yogurt 4. Explain what a frequency table records, find the relative frequency or percent for chips and yogurt, decide whether a majority prefer chips, and justify your answer in context.',
        expectedElements: [
            { id: 'frequency-definition', description: 'Explains that a frequency table records the number of cases in each category', required: true },
            { id: 'chips-relative-frequency', description: 'Finds chips as 18 out of 40, which is 0.45 or 45 percent', required: true },
            { id: 'yogurt-relative-frequency', description: 'Finds yogurt as 4 out of 40, which is 0.10 or 10 percent', required: true },
            { id: 'no-majority-chips', description: 'States that the claim of a majority preferring chips is not supported because 45 percent is less than 50 percent', required: true },
            { id: 'context-justification', description: 'Uses counts or relative frequencies to justify the conclusion in the lunch-side context', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly explains the frequency table, computes the relative frequencies for chips and yogurt, rejects the majority claim, and justifies the answer in context.',
            P: 'Response includes several correct ideas but misses one major part, such as an incorrect percent, no majority explanation, or weak context justification.',
            I: 'Response omits multiple required parts or shows weak understanding of frequency tables and relative frequencies.'
        },
        commonMistakes: [
            'Treating 18 students as a majority without comparing to the total of 40',
            'Giving counts instead of relative frequencies for chips or yogurt',
            'Forgetting that a majority means more than 50 percent',
            'Explaining the numbers without tying them to the lunch-side context'
        ],
        contextFromVideo: 'The lesson emphasizes that a frequency table gives counts, a relative frequency table gives proportions or percentages, and those values are used to justify claims such as whether a majority chose a category.'
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

    return `You are grading an AP Statistics student's response about Topic 1.3: Representing a Categorical Variable with Tables.

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
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
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

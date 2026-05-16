/**
 * AI Grading Prompts for Unit 1 Lesson 4: Topic 1.4
 * Topic 1.4: Representing a Categorical Variable with Graphs
 *
 * Learning Objectives:
 *   Represent categorical data graphically with bar charts and pie charts
 *   Describe categorical data using graphs
 *   Compare multiple sets of categorical data using relative frequencies
 *   Use graphical and tabular evidence to justify claims in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L4 = `
VIDEO 1 - Representing a Categorical Variable with Graphs (~8:51):
- The video focuses on two questions: how to represent categorical data graphically and how graphical representations help describe categorical data.
- The main example is the superpower survey from the previous lesson with a random sample of 50 high school students.
- The individuals are the 50 students who completed the survey.
- The variable is superpower preference, which is categorical.
- The lesson shows that a frequency table can be turned into a bar chart or bar graph.
- It also shows that a relative frequency table can be turned into a relative frequency bar chart.
- In the superpower example, the frequencies are fly 9, freeze time 15, invisibility 7, super strength 3, and telepathy 16.
- The relative frequencies are fly 0.18, freeze time 0.30, invisibility 0.14, super strength 0.06, and telepathy 0.32.
- When making bar charts, students should label both axes.
- The variable name, superpower preference, goes on the horizontal axis.
- Frequency or relative frequency goes on the vertical axis.
- The vertical axis should start at zero to avoid a distorted impression.
- The bars should be equal in width and should usually have gaps between categories.
- The lesson practices describing categorical data from a bar chart.
- In the superpower multiple-choice question, the statement not supported by the graph is that freeze time was chosen by twice as many students as fly, because 15 is not twice 9.
- The graph does support that telepathy was the most popular choice.
- The lesson also introduces pie charts as another way to represent categorical data.
- A pie chart should include a legend or key connecting slices to categories.
- In the screen media example, the unsupported statement is choice C because the comparison is about four times as many, not five.
- The video closes by emphasizing that categorical data can be represented graphically with bar charts or pie charts and that graphs reveal information used to justify claims in context.

VIDEO 2 - Comparing Multiple Sets of Categorical Data (~8:53):
- The second video focuses on representing multiple sets of data for the same categorical variable in tables and graphs and using them to compare distributions.
- A teacher surveyed students in all of her classes and wants to compare superpower preferences for 80 boys and 125 girls.
- The lesson warns that raw counts can be misleading when group sizes are different.
- Freeze time was chosen by 28 males and 28 females, but it was a larger proportion of males because 28/80 is greater than 28/125.
- Invisibility had counts 15 for males and 21 for females, but it was actually more popular among males because 15/80 is greater than 21/125.
- Super strength had counts 10 for males and 5 for females, so the proportion is much higher among males.
- Telepathy was preferred by 7 of 80 males, which is less than 10 percent, and 31 of 125 females, which is almost 25 percent.
- The supported statement in that table question is choice E about telepathy being less than 10 percent for males and almost 25 percent for females.
- The lesson says relative frequencies are better for comparing groups of different sizes.
- A relative frequency table and a side-by-side relative frequency bar chart can be used to compare the male and female distributions.
- The graph should still have labeled axes, an appropriate scale, spaces between categories, and a legend or key.
- In a side-by-side bar chart, bars may be grouped within each category or grouped within each sex.
- A second example compares screen media use for tweens and teens.
- In that graph question, the supported statement is choice B because both tweens and teens have proportion 0.51 for 2+ to 8 hours of screen media use per day.
- The video closes by emphasizing that tables and graphs can both be used to compare multiple sets of categorical data and justify claims in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L4 = {
    reflect1: {
        questionText: 'Using the superpower survey of 50 students, explain how a frequency bar chart and a relative frequency bar chart show the same data in different ways.',
        expectedElements: [
            { id: 'frequency-counts', description: 'Explains that a frequency bar chart shows counts or frequencies for each category', required: true },
            { id: 'relative-frequency-proportions', description: 'Explains that a relative frequency bar chart shows proportions or percents for each category', required: true },
            { id: 'same-superpower-data', description: 'States that both graphs display the same superpower categories or same distribution', required: true },
            { id: 'superpower-example', description: 'Uses the superpower context or a correct category example such as telepathy, fly, or freeze time', required: true },
            { id: 'divide-by-total', description: 'May mention that relative frequencies come from dividing by the total of 50 students', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that one graph shows counts and the other shows proportions or percents, while tying both to the same superpower data.',
            P: 'Response shows the general difference between the graphs but leaves out part of the explanation or does not use the superpower context clearly.',
            I: 'Response does not correctly distinguish a frequency bar chart from a relative frequency bar chart.'
        },
        commonMistakes: [
            'Saying both graphs only show counts',
            'Describing relative frequency without mentioning proportion or percent',
            'Ignoring that both graphs come from the same superpower data set',
            'Giving graphing details without explaining the difference in what the heights represent'
        ],
        contextFromVideo: 'The lesson uses the superpower survey of 50 students to show both a frequency bar chart and a relative frequency bar chart. The category heights represent counts in one graph and proportions or percents in the other.'
    },

    reflect2: {
        questionText: 'Why are relative frequencies better than raw counts when comparing male and female superpower preferences? Use one example from the lesson.',
        expectedElements: [
            { id: 'different-group-sizes', description: 'Explains that the male and female groups have different sizes, 80 males and 125 females', required: true },
            { id: 'use-proportions', description: 'Explains that relative frequencies or proportions should be used instead of just raw counts', required: true },
            { id: 'lesson-example', description: 'Uses a correct lesson example such as freeze time being 28 and 28 but more popular among males, or telepathy being less than 10 percent of males and almost 25 percent of females', required: true },
            { id: 'comparison-conclusion', description: 'Explains how the relative frequencies change or clarify the comparison', required: true },
            { id: 'graph-or-table-link', description: 'May mention that relative frequency tables or side-by-side relative frequency bar charts make the comparison easier', required: false }
        ],
        scoringGuide: {
            E: 'Response explains that different group sizes require relative frequencies and uses a correct lesson example to show how proportions lead to the correct comparison.',
            P: 'Response shows part of the idea or gives an example, but does not fully explain why raw counts can be misleading.',
            I: 'Response does not show why relative frequencies are preferred when comparing groups of different sizes.'
        },
        commonMistakes: [
            'Comparing counts only and ignoring the different totals',
            'Using an example that does not match the lesson numbers',
            'Saying equal counts mean equal popularity',
            'Not explaining how the proportion changes the conclusion'
        ],
        contextFromVideo: 'The video compares 80 males and 125 females. It shows that equal counts like 28 and 28 for freeze time do not mean equal popularity because 28/80 is greater than 28/125. It also uses telepathy as less than 10 percent of males and almost 25 percent of females.'
    },

    exitTicket: {
        questionText: 'A teacher surveyed two grades about their favorite spirit day theme. Explain why a relative frequency bar graph would be more useful than a frequency bar graph, find the Jersey Day relative frequency for each grade, decide whether Jersey Day was equally popular, and justify your answer in context.',
        expectedElements: [
            { id: 'different-grade-sizes', description: 'Explains that relative frequencies are better because the grades are different sizes, 30 ninth graders and 20 tenth graders', required: true },
            { id: 'ninth-jersey-frequency', description: 'Finds Jersey Day for 9th grade as 6 out of 30, which is 0.20 or 20 percent', required: true },
            { id: 'tenth-jersey-frequency', description: 'Finds Jersey Day for 10th grade as 8 out of 20, which is 0.40 or 40 percent', required: true },
            { id: 'claim-not-supported', description: 'States that the claim Jersey Day was equally popular is not supported', required: true },
            { id: 'context-justification', description: 'Uses the spirit day context and counts or relative frequencies to justify that Jersey Day was more popular among 10th graders', required: true }
        ],
        scoringGuide: {
            E: 'Response explains why relative frequencies are better for comparing different-sized groups, correctly computes both Jersey Day proportions, rejects the equal-popularity claim, and justifies the answer in context.',
            P: 'Response includes several correct ideas but misses one major part, such as an incorrect proportion, weak explanation of why relative frequencies are needed, or incomplete justification.',
            I: 'Response omits multiple required parts or shows weak understanding of relative frequency comparisons.'
        },
        commonMistakes: [
            'Comparing the Jersey Day counts without noticing the grades have different totals',
            'Giving 6 and 8 instead of relative frequencies or percents',
            'Saying the claim is supported because both groups liked Jersey Day',
            'Forgetting to tie the conclusion back to the spirit day context'
        ],
        contextFromVideo: 'The lesson emphasizes that relative frequencies are best for comparing categorical distributions when group sizes differ, and that tables or graphs provide evidence to justify claims in context.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L4[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.4: Representing a Categorical Variable with Graphs.

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
window.getRubricU1L4 = function(questionId) {
    return window.RUBRICS_U1L4[questionId] || null;
};

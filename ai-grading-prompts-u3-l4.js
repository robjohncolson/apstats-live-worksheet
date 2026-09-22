/**
 * AI Grading Prompts for Unit 3 Lesson 4: Potential Problems with Sampling
 * Topic 3.4: Potential Problems with Sampling
 *
 * Learning Objectives:
 *   Identify potential sources of bias in sampling methods
 *   Describe how bias can create overestimates or underestimates
 *   Recognize undercoverage, nonresponse, volunteer response, and survey response bias
 *   Explain why a sample may not be representative of the population
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U3L4 = `
VIDEO 1 - Potential Problems with Sampling (~6:57):
- Topic 3.4 focuses on potential sources of bias in sampling methods.
- The lesson asks which methods lead to biased estimates, how to describe overestimates and underestimates, and what survey problems can arise.
- A college pamphlet claimed that 99.7% of former students were working full-time in careers of their choice, but the statistic was based only on recent graduates.
- The video points out that only 40% of the incoming freshman class graduated within six years, so students who did not graduate were excluded from the group being described.
- Bias is defined as a systematic tendency to favor certain responses over others.
- Undercoverage bias occurs when part of the population has a reduced chance of being included in the sample.
- The college example shows undercoverage because nongraduates were left out.
- Nonresponse bias occurs when individuals chosen for the sample do not respond and those nonrespondents differ from the respondents.
- In the internship example, a random sample of students was surveyed but only 10% responded.
- The AP-style method for explaining bias is to identify the population and sample, explain how the sample may differ from the population, and state whether the estimate is likely an overestimate or underestimate.
- In the internship example, students without paid internships may be less likely to respond, so the reported 85% with internships is likely an overestimate.
- Volunteer response bias occurs when invitations are sent to all individuals and the people who volunteer differ from those who do not.
- The running-study advertisement example shows that a study advertised as being about running may attract people who already enjoy running, which could overestimate the true proportion of all people who enjoy running.
- The lesson advises that even if the exact vocabulary label is unclear, students should still describe how the bias arises and the likely direction of the bias.
- Question wording bias occurs when survey questions are confusing or leading.
- Self-reported response bias occurs when individuals inaccurately report their own traits or behaviors.
- The final takeaway is that strong bias explanations describe how the sample systematically differs from the population and how that affects the estimate.
`;

// Rubrics for each reflection question
window.RUBRICS_U3L4 = {
    reflect1: {
        questionText: 'A university randomly selects students and emails them a survey asking whether they found a paid summer internship. Only 10% respond. Explain why this could lead to nonresponse bias. Identify the population, the sample, and whether the result is likely too high or too low.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all students at the university', required: true },
            { id: 'sample', description: 'Identifies the sample as the students who responded to the survey', required: true },
            { id: 'nonresponse', description: 'Explains that this is nonresponse bias because many selected students did not respond', required: true },
            { id: 'different-responders', description: 'Explains that respondents may differ from nonrespondents, such as students without internships being less likely to respond', required: true },
            { id: 'overestimate', description: 'States that the reported percentage with internships is likely an overestimate of the true percentage', required: true },
            { id: 'underrepresented', description: 'May note that students without internships are underrepresented in the responses', required: false }
        ],
        scoringGuide: {
            E: 'Population = all students at the university; sample = the students who actually responded; identifies nonresponse bias; explains that students without internships are less likely to respond; so the reported percentage is likely too high.',
            P: 'Four of the five are correct; one is missing or wrong (commonly: no direction, or the sample given as everyone selected).',
            I: 'Two or more of the five are missing or wrong, or the result is called unbiased because the selection was random.'
        },
        commonMistakes: [
            'Calling the sample all selected students instead of the students who actually responded',
            'Ignoring that students without internships may respond at lower rates',
            'Saying the result is unbiased just because the original selection was random',
            'Leaving out whether the estimate is likely too high or too low'
        ],
        contextFromVideo: 'The lesson says only 10% of selected students responded to the internship survey, and students without paid internships may be less likely to respond, making the reported percentage an overestimate.'
    },

    reflect2: {
        questionText: 'Describe the difference between undercoverage bias and volunteer response bias. Explain how each one makes the sample differ from the population and how either could lead to a distorted estimate.',
        expectedElements: [
            { id: 'undercoverage-definition', description: 'Defines undercoverage bias as part of the population having a reduced chance of being included', required: false },
            { id: 'volunteer-definition', description: 'Defines volunteer response bias as people choosing themselves to participate', required: false },
            { id: 'undercoverage-difference', description: 'Explains that undercoverage can leave out a subgroup whose responses differ from the rest of the population', required: true },
            { id: 'volunteer-difference', description: 'Explains that volunteer response can overrepresent people with stronger interest, stronger opinions, or more favorable attitudes', required: true },
            { id: 'direction', description: 'States that either bias can distort the estimate by causing an overestimate or underestimate because the sample is not representative', required: true },
            { id: 'example', description: 'May reference an example such as nongraduates being excluded or runners volunteering', required: false }
        ],
        scoringGuide: {
            E: 'Explains the mechanism of each: undercoverage leaves out a subgroup whose answers differ from the rest; volunteer response over-represents people with strong interest or opinions; and either makes the estimate too high or too low because the sample is unrepresentative. A bare definition counts only when it carries that mechanism.',
            P: 'Explains the mechanism for one bias but not the other, or explains both without the distortion / direction idea.',
            I: 'Treats the two biases as the same, defines volunteer response as low response rate, or gives definitions with no mechanism for either.'
        },
        commonMistakes: [
            'Treating undercoverage and volunteer response as the same thing',
            'Defining volunteer response bias as simply low response rate',
            'Forgetting to explain how the sample differs from the population',
            'Leaving out that the bias changes the direction of the estimate'
        ],
        contextFromVideo: 'The lesson contrasts undercoverage, where part of the population is left out, with volunteer response, where volunteers may differ from nonvolunteers. In both cases the sample can systematically differ from the population.'
    },

    exitTicket: {
        questionText: 'A city wants to estimate the proportion of all residents who support adding more bike lanes. Officials mail every household a card that says, "Complete our survey if you support this important plan to make our streets safer by adding more bike lanes." Residents may choose whether to respond online. Identify the population and the sample, identify one source of sampling bias and its likely direction, identify one source of response bias in the wording, and describe one change that would improve the study.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all city residents', required: true },
            { id: 'sample', description: 'Identifies the sample as the residents who choose to respond to the survey', required: true },
            { id: 'volunteer-bias', description: 'Identifies volunteer or voluntary response bias because people choose whether to respond', required: false },
            { id: 'overestimate', description: 'Explains that support for bike lanes is likely overestimated because supporters may be more likely to respond', required: true },
            { id: 'wording-bias', description: 'Identifies question wording bias because words like "important" and "safer" are leading', required: true },
            { id: 'improvement', description: 'Suggests an improvement such as taking a random sample of residents or using neutral wording', required: true }
        ],
        scoringGuide: {
            E: 'Population = all city residents; sample = the residents who choose to respond; explains that this voluntary response over-represents supporters (they are more likely to answer), so support is overestimated; identifies the leading wording (\'important\', \'safer\'); proposes a fix that addresses sampling (random sample) or wording (neutral).',
            P: 'Four of the five are correct; one is missing or wrong.',
            I: 'Two or more of the five are missing or wrong, or the survey is called random.'
        },
        commonMistakes: [
            'Calling the sample all residents instead of only the people who respond',
            'Saying the survey is random because every household got the invitation',
            'Missing that supporters may be more likely to respond than opponents',
            'Ignoring the leading words in the survey question',
            'Suggesting an improvement without addressing either sampling or wording'
        ],
        contextFromVideo: 'The lesson says volunteer response bias happens when people choose themselves to participate and may differ from the population, and question wording bias happens when survey wording is leading or confusing.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU3L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U3L4[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 3.4: Potential Problems with Sampling

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Key Elements (what a complete answer usually covers)
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
GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

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
window.getRubricU3L4 = function(questionId) {
    return window.RUBRICS_U3L4[questionId] || null;
};

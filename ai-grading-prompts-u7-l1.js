/**
 * AI Grading Prompts for Unit 7 Lesson 1: Introducing Statistics: Should I Worry About Error?
 * Topic 7.1: Introducing Statistics: Should I Worry About Error?
 *
 * Learning Objectives:
 *   Identify the evidence for a claim in a two-group means setting
 *   Describe the two competing explanations for an observed difference in means
 *   Explain how a rerandomization simulation estimates probability by chance alone
 *   Decide whether data provide convincing evidence for a claim
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L1 = `
VIDEO 1 - Bonus vs. Rebate and the Logic of Significance Testing (~7.75 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - The lesson introduces the logic of significance testing for a difference in means
  - Students should identify evidence for a claim and determine whether the evidence is convincing
  - In a two-group comparison, if the treatment makes no difference, the expected difference in sample means is 0
  - An observed difference in means can have two explanations:
    - the treatment made no difference and the observed result occurred because of chance variation in random assignment
    - the treatment really caused a difference in the population means for subjects like those in the study
  - To decide between those explanations, ask how likely it would be to get the observed difference or something more extreme by chance alone
  - A rerandomization simulation estimates that probability under the assumption that the treatment makes no difference
  - In each trial of the simulation, the same subjects are randomly reassigned to groups, the two group means are calculated, and the difference in means is recorded
  - If the simulated probability is very small, the chance-alone explanation is unlikely and the data provide convincing evidence for the treatment effect

BONUS VS. REBATE STUDY:
- Volunteer college students were given $50 with no strings attached
- 25 of the 47 students were randomly assigned to hear the money described as bonus income
- The other 22 students were told it was a tuition rebate
- Mean amount spent in bonus group: $22.04
- Mean amount spent in rebate group: $9.55
- Observed difference in means: 22.04 - 9.55 = $12.49
- Operating question: Do these data provide convincing evidence that the bonus wording causes college students like the ones in this study to spend more money on average than the tuition rebate wording?

SIMULATION DETAILS:
- The simulation assumes wording makes no difference in the amount spent
- Under that assumption, subjects are expected to spend the same amount regardless of group
- Subjects are rerandomized into groups again and again
- Example simulated differences shown in the video include -9.81, 11.64, -1.26, and 3.95
- The lesson shows results from 1000 simulation trials
- 13 out of 1000 simulated differences were 12.49 or greater
- Approximate probability by chance alone: 13/1000 = 0.013, about 1%

CONCLUSION FROM THE VIDEO:
- Because it is unlikely to get a difference in means of 12.49 or greater by chance alone when wording makes no difference, explanation 1 can be ruled out
- The data provide convincing evidence that the bonus wording causes college students like the ones in this study to spend more money on average than the tuition rebate wording
`;

// Rubrics for each reflection question
window.RUBRICS_U7L1 = {
    reflect1: {
        questionText: "Using the bonus vs. rebate study, explain what the evidence for the claim is and describe the two possible explanations for that evidence.",
        expectedElements: [
            { id: "evidence-statistic", description: "Identifies the evidence as the observed positive difference in sample means", required: true },
            { id: "observed-value", description: "States that the observed difference was $12.49, or notes that 22.04 is greater than 9.55", required: true },
            { id: "expected-zero", description: "Explains that if wording made no difference, the expected difference in means would be 0", required: true },
            { id: "chance-explanation", description: "Describes explanation 1 as no real wording effect with the observed difference caused by chance variation in random assignment", required: true },
            { id: "treatment-explanation", description: "Describes explanation 2 as the bonus wording causing students to spend more on average", required: true },
            { id: "context", description: "Keeps the explanation in the context of the bonus vs. rebate college student study", required: true }
        ],
        scoringGuide: {
            E: "Response clearly identifies the observed evidence and accurately explains both competing explanations in context",
            P: "Response includes some of the correct evidence and explanation ideas but omits or weakly explains one or more important parts",
            I: "Response misses the main evidence, gives incorrect explanations, or does not connect the response to the study context"
        },
        commonMistakes: [
            "Treating the evidence as a conclusion instead of the observed difference in means",
            "Leaving out that the expected difference is 0 if wording makes no difference",
            "Describing only one explanation instead of both",
            "Ignoring chance variation in random assignment",
            "Not connecting the answer to bonus vs. rebate spending"
        ],
        contextFromVideo: "The video says the evidence is the observed difference of $12.49 and then presents two explanations: chance variation alone or a real bonus-wording effect."
    },

    reflect2: {
        questionText: "Explain how the rerandomization simulation works in this lesson and how the approximate probability of 0.013 helps decide whether the evidence is convincing.",
        expectedElements: [
            { id: "assumption", description: "States that the simulation assumes the wording makes no difference", required: true },
            { id: "rerandomize", description: "Explains that the subjects are randomly reassigned or rerandomized into groups many times", required: true },
            { id: "calculate-statistic", description: "Explains that each trial computes the difference in means", required: true },
            { id: "many-trials", description: "Notes that the process is repeated many times, with 1000 trials shown in the lesson", required: true },
            { id: "tail-count", description: "States that 13 out of 1000 trials were 12.49 or greater, or gives the probability 0.013", required: true },
            { id: "unlikely-chance", description: "Explains that 0.013 is a very small probability under chance alone", required: true },
            { id: "conclusion", description: "Concludes that the chance-alone explanation is unlikely and the data provide convincing evidence for the bonus wording effect", required: true }
        ],
        scoringGuide: {
            E: "Response correctly explains the simulation setup, the probability estimate, and why that small probability supports a convincing-evidence conclusion",
            P: "Response captures the main simulation idea but is incomplete about the assumption, the probability, or the final interpretation",
            I: "Response gives an incorrect simulation process, misinterprets 0.013, or fails to connect the result to the claim"
        },
        commonMistakes: [
            "Forgetting that the simulation assumes no wording effect",
            "Describing sampling new students instead of rerandomizing the existing subjects",
            "Not mentioning the difference in means as the statistic",
            "Treating 0.013 as a large probability",
            "Failing to use the small probability to justify the conclusion"
        ],
        contextFromVideo: "The lesson rerandomizes the subjects 1000 times, counts 13 simulated differences of 12.49 or greater, and uses 0.013 to rule out the chance explanation."
    },

    exitTicket: {
        questionText: "In the bonus vs. rebate experiment, the observed difference in mean amount spent was $12.49, and a rerandomization simulation produced 13 results of $12.49 or greater out of 1000 trials. (a) State the evidence for the claim that wording matters. (b) Describe the two possible explanations for the observed difference. (c) Use the simulation result to decide whether the data provide convincing evidence, and explain the conclusion in context.",
        expectedElements: [
            { id: "evidence", description: "States that the evidence is the observed difference in means of $12.49, with the bonus group spending more on average", required: true },
            { id: "expected-zero", description: "May note that the expected difference would be 0 if wording made no difference", required: false },
            { id: "chance-explanation", description: "Describes one explanation as no wording effect with chance variation in random assignment producing the observed difference", required: true },
            { id: "effect-explanation", description: "Describes the other explanation as the bonus wording causing higher average spending", required: true },
            { id: "simulation-probability", description: "Uses the simulation result 13 out of 1000 or 0.013 as the estimated probability by chance alone", required: true },
            { id: "small-probability", description: "Explains that this probability is very small or unlikely", required: true },
            { id: "convincing-evidence", description: "Concludes that the data provide convincing evidence that the bonus wording causes college students like those in the study to spend more on average", required: true }
        ],
        scoringGuide: {
            E: "Response correctly identifies the evidence, explains both competing explanations, and uses the simulation probability to reach the correct contextual conclusion",
            P: "Response gets most of the significance-testing logic correct but misses or weakly explains one important piece",
            I: "Response omits major parts of the logic, misuses the simulation result, or gives an incorrect conclusion"
        },
        commonMistakes: [
            "Calling the evidence just 'the claim' instead of the observed difference in means",
            "Only giving one explanation for the observed difference",
            "Ignoring the 13 out of 1000 simulation result",
            "Not explaining why a small probability matters",
            "Giving a conclusion without context about students like those in the study"
        ],
        contextFromVideo: "The video concludes that 13 out of 1000 simulated results at least as large as 12.49 is unlikely enough to support the bonus-wording conclusion."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L1 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L1[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Introducing Statistics: Should I Worry About Error?

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L1}

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
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "Brief explanation of score",
    "matched": ["element1", "element2"],
    "missing": ["element3"],
    "suggestion": "Helpful tip for improvement or null if E"
}`;
};

/**
 * Get the rubric for a specific question
 * @param {string} questionId - The ID of the question
 * @returns {object} The rubric object
 */
window.getRubricU7L1 = function(questionId) {
    return window.RUBRICS_U7L1[questionId];
};

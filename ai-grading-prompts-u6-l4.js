// AI Grading Prompts for Unit 6 Lesson 4 (Topic 6.4)
// Inference for Categorical Data: Proportions - Setting Up a Test for a Population Proportion

window.LESSON_CONTEXT_U6L4 = `
Unit 6 Lesson 4 covers Topic 6.4 of AP Statistics: Setting Up a Test for a Population Proportion.

Video 1 - Stating Null and Alternative Hypotheses:
Students learn how to state the null and alternative hypotheses for a significance test for a population proportion.
Lemonade example: 30 students taste lemonade from a green cup and a white cup; 18 say the green cup tastes more natural.
Null hypothesis: often represents "no difference" or "no change." For the lemonade study, H0: p = 0.50, where p is the proportion of all students at the school who would choose the green cup.
Alternative hypothesis: the claim researchers hope to support. For the lemonade study, Ha: p > 0.50 because researchers want to know if more than 50% would choose the green cup.
General rules: the null hypothesis always contains an equality, and the alternative contains a strict inequality.
One-sided alternatives use > or <. Two-sided alternatives use !=.
The choice of alternative is based on the research question and should be stated before data collection begins.
Never include a statistic such as p-hat in hypotheses. Hypotheses must be about a population parameter, not a sample statistic.
Practice example: Nationally, 40% of adults would say football is their favorite sport. For a town study asking whether the town differs from the nation, H0: p = 0.40 and Ha: p != 0.40.
Parameter definitions should use population language such as "would say," not sample language such as "said."

Video 2 - Identifying the Procedure and Checking Conditions:
When testing a claim about the proportion of successes in a single population, the correct procedure is a one-sample z test for a population proportion.
To verify conditions:
1. Random: data come from a random sample or randomized experiment.
2. 10% condition: when sampling without replacement, n <= 10% of the population size.
3. Large counts: assuming H0 is true, verify that n*p0 >= 10 and n*(1-p0) >= 10, where p0 is the null hypothesis value.
Important distinction from confidence intervals: for significance tests, the large counts condition uses p0, not p-hat, because we begin by assuming the null hypothesis is true.
Lemonade example conditions: random sample of 30 students; assume school has more than 300 students; n*p0 = 30(0.5) = 15 and n*(1-p0) = 15, so conditions are met.
Mayor practice example: n = 100, p0 = 0.40, so n*p0 = 40 and n*(1-p0) = 60; conditions are met.
Key takeaway: for a single categorical variable, the correct significance test is a one-sample z test for a population proportion, and the three conditions above must be checked before proceeding.
`;

window.RUBRICS_U6L4 = {
    reflect1: {
        questionText: "A snack company claims that 50% of all teens would prefer its new granola bar to the old version. A researcher wants to investigate whether the true proportion is higher than 50%. Define the parameter, state the null and alternative hypotheses, and explain why the alternative is one-sided instead of two-sided.",
        expectedElements: [
            { id: "define-parameter", description: "Defines the parameter in context as p = the proportion of all teens who would prefer the new granola bar to the old version", required: true },
            { id: "null-hypothesis", description: "States the null hypothesis correctly as H0: p = 0.50", required: true },
            { id: "alternative-hypothesis", description: "States the alternative hypothesis correctly as Ha: p > 0.50", required: true },
            { id: "one-sided-reasoning", description: "Explains that the alternative is one-sided because the research question asks whether the proportion is higher than 50%, so evidence is only being considered in one direction", required: true },
            { id: "equality-rule", description: "Notes that the null contains the equality and the alternative uses a strict inequality", required: false }
        ],
        scoringGuide: {
            E: "Correctly defines the parameter in population language, states both hypotheses accurately, and clearly explains why the alternative is one-sided based on the direction of the claim.",
            P: "Gets most of the setup correct but is incomplete on one part, such as vague parameter wording, missing context, or limited explanation of why the alternative is one-sided.",
            I: "Uses the wrong hypotheses, includes p-hat instead of p, fails to define the parameter as a population proportion, or does not explain the direction of the alternative."
        },
        commonMistakes: [
            "Using p-hat instead of p in the hypotheses",
            "Writing H0: p > 0.50 and Ha: p = 0.50",
            "Defining the parameter in terms of the sample rather than all teens",
            "Using a two-sided alternative when the claim is specifically 'higher than 50%'",
            "Forgetting that the null hypothesis contains the equality"
        ],
        contextFromVideo: "For tests about a population proportion, the null hypothesis is written as H0: p = p0 and represents the assumed initial claim, often 'no difference' or 'no change.' The alternative hypothesis is the claim we hope to support and must use a strict inequality. If the question asks whether the proportion is greater than a value, the alternative is one-sided: Ha: p > p0."
    },

    reflect2: {
        questionText: "A town health department wants to test whether the proportion of all adults in the town who would say walking is their main exercise differs from 0.35. A random sample of 120 adults will be selected. Identify the correct inference procedure and verify whether the conditions for the test are met. Be sure to address the random condition, the 10% condition, the large counts condition, and why the large counts check uses 0.35 rather than the sample proportion.",
        expectedElements: [
            { id: "identify-procedure", description: "Identifies the correct procedure as a one-sample z test for a population proportion", required: true },
            { id: "random-condition", description: "States that the random condition is met because the sample of 120 adults is selected at random", required: true },
            { id: "ten-percent-condition", description: "Checks the 10% condition by noting that 120 must be no more than 10% of the town's adult population, or equivalently assuming the town has at least 1200 adults", required: true },
            { id: "large-counts", description: "Checks large counts using the null value: 120(0.35) = 42 and 120(0.65) = 78, both at least 10", required: true },
            { id: "use-p-zero", description: "Explains that the large counts check uses 0.35 because significance tests assume the null hypothesis is true, so the check uses p0 rather than p-hat", required: true }
        ],
        scoringGuide: {
            E: "Correctly identifies the one-sample z test, verifies all three conditions with appropriate calculations or assumptions, and explains why the large counts condition uses the null value 0.35.",
            P: "Identifies the procedure and most conditions correctly but is incomplete on one part, such as not explaining the 10% assumption clearly or forgetting why p0 is used in the large counts check.",
            I: "Chooses the wrong procedure, fails to verify the conditions correctly, or uses the sample proportion instead of the null value in the large counts condition."
        },
        commonMistakes: [
            "Calling the procedure a confidence interval instead of a significance test",
            "Checking large counts with p-hat instead of p0",
            "Ignoring the 10% condition entirely",
            "Stating the sample is random without linking it to the condition",
            "Forgetting to calculate both n*p0 and n*(1-p0)"
        ],
        contextFromVideo: "When testing a claim about a single population proportion, use a one-sample z test for a population proportion. Check three conditions: random sample or randomized experiment, 10% condition, and large counts. For significance tests, the large counts check uses the null value p0 because we begin by assuming H0 is true."
    },

    exitTicket: {
        questionText: "A state report says that 65% of all high school students get at least 8 hours of sleep on school nights. A principal wonders whether the proportion at her school is lower than 65%. She randomly selects 90 students from the school, and 50 say they usually get at least 8 hours of sleep.\n(a) Define the parameter in context.\n(b) State the null and alternative hypotheses.\n(c) Identify the appropriate test procedure.\n(d) Verify all conditions needed for the test.\n(e) Explain whether it is appropriate to proceed with the significance test, and why p-hat should not appear in the hypotheses.",
        expectedElements: [
            { id: "define-parameter", description: "Defines the parameter as p = the proportion of all students at the school who would say they usually get at least 8 hours of sleep on school nights", required: true },
            { id: "state-hypotheses", description: "States the hypotheses correctly as H0: p = 0.65 and Ha: p < 0.65", required: true },
            { id: "identify-procedure", description: "Identifies the procedure as a one-sample z test for a population proportion", required: true },
            { id: "check-random", description: "Checks the random condition using the fact that the principal randomly selected 90 students", required: true },
            { id: "check-ten-percent", description: "Checks the 10% condition by noting that 90 must be at most 10% of the school's student population, or assuming the school has at least 900 students", required: true },
            { id: "check-large-counts", description: "Checks large counts using the null value: 90(0.65) = 58.5 and 90(0.35) = 31.5, both at least 10", required: true },
            { id: "proceed-and-parameter", description: "Concludes that it is appropriate to proceed because the conditions are met and explains that p-hat should not appear in the hypotheses because hypotheses are about the population proportion p, not the sample statistic", required: true }
        ],
        scoringGuide: {
            E: "Correctly sets up the full test: defines the parameter, states both hypotheses, identifies the one-sample z test, verifies all conditions using p0 = 0.65, and explains both why the test can proceed and why p-hat does not belong in the hypotheses.",
            P: "Shows the main setup correctly but misses or weakens one part, such as incomplete condition checks, weak population wording, or limited explanation of why p-hat should not appear.",
            I: "Misses multiple setup components, uses incorrect hypotheses or procedure, fails to check conditions correctly, or confuses the population parameter with the sample statistic."
        },
        commonMistakes: [
            "Writing a two-sided or greater-than alternative instead of Ha: p < 0.65",
            "Using p-hat in the hypotheses",
            "Checking large counts with 50/90 instead of 0.65",
            "Forgetting to assume the school is large enough for the 10% condition",
            "Defining the parameter as the proportion of sampled students rather than all students at the school"
        ],
        contextFromVideo: "Setup for a significance test for a population proportion includes four core parts in this lesson: define the population proportion parameter in context, state H0 and Ha using p and the null value p0, identify the procedure as a one-sample z test for a population proportion, and verify the random, 10%, and large counts conditions. For the large counts condition, always use p0 because H0 is assumed true during setup."
    }
};

window.getRubricU6L4 = function(questionId) {
    return window.RUBRICS_U6L4[questionId] || null;
};

window.buildReflectionPromptU6L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L4[questionId];
    if (!rubric) return null;

    const requiredElements = rubric.expectedElements.filter(e => e.required).map(e => e.description);
    const optionalElements = rubric.expectedElements.filter(e => !e.required).map(e => e.description);

    return `You are an AP Statistics teacher grading a student's response.

QUESTION: ${rubric.questionText}

STUDENT'S ANSWER: ${studentAnswer}

LESSON CONTEXT: ${rubric.contextFromVideo}

SCORING RUBRIC:
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

REQUIRED ELEMENTS (must address for E):
${requiredElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}

BONUS ELEMENTS (strengthen the response):
${optionalElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}

COMMON MISTAKES TO WATCH FOR:
${rubric.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Grade the response as E, P, or I. Be encouraging but accurate. Identify which elements were addressed and which were missing. Provide a specific suggestion for improvement if the score is P or I.

Respond in JSON format:
{
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "Brief explanation of the grade",
    "matched": ["list of elements the student addressed"],
    "missing": ["list of elements the student missed"],
    "suggestion": "Specific suggestion for improvement (null if E)"
}`;
};

// AI Grading Prompts for Unit 6 Lessons 1-2 (Topics 6.1–6.2)
// Inference for Categorical Data: Proportions — Why Be Normal? & Constructing CI for p

window.LESSON_CONTEXT_U6L12 = `
Unit 6 Lessons 1-2 cover Topics 6.1 and 6.2 of AP Statistics.

Topic 6.1 introduces the logic of significance testing for a population proportion. The "green cup" lemonade example: 30 randomly selected students taste lemonade from a green cup and a white cup (same lemonade). 18 of 30 chose green (p-hat = 0.60). Two explanations: (1) no effect, got 0.60 by chance, or (2) students truly associate green with "more natural." A coin-flip simulation (100 trials, n=30, p=0.50) showed p-hat >= 0.60 occurred 16 times out of 100 — somewhat likely by chance. Conclusion: cannot rule out random chance, so data do NOT provide convincing evidence.

Key logic: Identify evidence (results consistent with claim), consider two explanations (chance vs. real effect), estimate probability of evidence occurring by chance alone, and if you can eliminate random chance as plausible, evidence is convincing.

Topic 6.2 covers constructing a confidence interval for a population proportion across three videos:
Video 1 — Identifying the procedure (one-sample z-interval for a population proportion) and checking conditions: (1) Random sample, (2) 10% condition (n <= 10% of N when sampling without replacement), (3) Large Counts (np-hat >= 10 AND n(1-p-hat) >= 10). Signature verification example: 500 randomly selected from 9,388 signatures, 364 verified. All conditions met. Practice: convenience sample of 40 with only 2 failures — fails random AND large counts conditions.

Video 2 — Calculating the CI: point estimate +/- margin of error. ME = z* x SE. Standard error SE = sqrt(p-hat(1-p-hat)/n). Critical value z* = 1.96 for 95% confidence. Full calculation: 0.728 +/- 1.96 x sqrt(0.728 x 0.272/500) = (0.689, 0.767). Applied to counts: 9,388 x (0.689 to 0.767) = roughly 6,468 to 7,201 valid signatures.

Video 3 — Minimum sample size: rearrange ME formula to solve for n. Use p-hat = 0.5 if no prior estimate (gives largest ME, hence upper bound for n). Always round UP. Example: 95% confidence, ME <= 0.05 gives n >= 385. Practice: 90% confidence (z* = 1.645), ME <= 0.03 gives n >= 752.
`;

const RUBRICS_U6L12 = {
    reflect1: {
        questionText: "Explain the logic of significance testing using the green cup example from Topic 6.1. In your explanation, address: (a) What is the evidence in this study? (b) What are the two possible explanations for the evidence? (c) How did the simulation help evaluate these explanations? (d) Why did we conclude that the evidence was NOT convincing?",
        expectedElements: [
            { id: "identify-evidence", description: "Identifies the evidence: p-hat = 0.60 (18/30 chose green), which is greater than the expected 0.50 if no effect", required: true },
            { id: "two-explanations", description: "States both explanations: (1) no real effect, result by chance alone; (2) students truly associate green with more natural", required: true },
            { id: "simulation-purpose", description: "Explains the simulation: coin flips (50/50) repeated 100 times with n=30 to estimate how often p-hat >= 0.60 occurs by chance", required: true },
            { id: "conclusion-reasoning", description: "Explains why not convincing: 16/100 is somewhat likely, so cannot rule out random chance as an explanation", required: true },
            { id: "general-logic", description: "Articulates the general principle: evidence is convincing only if you can eliminate random chance as a plausible explanation", required: false }
        ],
        scoringGuide: {
            E: "Clearly identifies the evidence (p-hat = 0.60 > 0.50), states both explanations, explains how the simulation estimated the probability of the result by chance (16/100), and logically explains why the evidence is not convincing because random chance cannot be ruled out.",
            P: "Addresses most parts but is vague on at least one: e.g., states both explanations but doesn't clearly explain the simulation or gives an incomplete reason for the conclusion.",
            I: "Misidentifies the evidence, confuses the two explanations, doesn't explain the role of the simulation, or reaches an incorrect conclusion about whether the evidence is convincing."
        },
        commonMistakes: [
            "Saying the evidence IS convincing (it is not — 16/100 is too likely)",
            "Confusing p-hat (0.60) with the probability from the simulation (0.16)",
            "Not explaining WHY 16/100 means we can't rule out chance",
            "Forgetting to mention that the simulation assumes no effect (p = 0.50)"
        ],
        contextFromVideo: "18 out of 30 students chose the green cup (p-hat = 0.60). If the color had no effect, we'd expect 50%. A simulation of 100 trials assuming p = 0.50 and n = 30 showed that getting p-hat >= 0.60 happened 16 out of 100 times. Because it's somewhat likely to get 0.60 by chance alone, we cannot rule out Explanation #1, so the data do NOT provide convincing evidence."
    },

    reflect2: {
        questionText: "A school nurse randomly selects 150 students from a school of 2,400 to survey about flu vaccination. She finds that 96 of the 150 have received the flu vaccine. (a) Verify all three conditions for constructing a confidence interval for the proportion of all students who have received the flu vaccine. (b) Construct a 95% confidence interval. (c) Interpret your interval in context.",
        expectedElements: [
            { id: "random-condition", description: "Checks random: students were randomly selected from the school", required: true },
            { id: "ten-percent-condition", description: "Checks 10%: 150 <= 10% of 2,400 (i.e., 150 <= 240)", required: true },
            { id: "large-counts-condition", description: "Checks Large Counts: successes = 96 >= 10 and failures = 54 >= 10", required: true },
            { id: "ci-calculation", description: "Calculates CI: p-hat = 0.64, SE = sqrt(0.64 x 0.36/150) ≈ 0.0392, ME = 1.96 x 0.0392 ≈ 0.0769, CI ≈ (0.563, 0.717)", required: true },
            { id: "interpretation", description: "Interprets: We are 95% confident that the true proportion of all students at this school who have received the flu vaccine is between approximately 0.563 and 0.717", required: true }
        ],
        scoringGuide: {
            E: "Correctly verifies all three conditions with calculations in context, computes the CI with correct SE and z*, and provides a proper interpretation referencing the sample and population.",
            P: "Verifies conditions but missing calculations (e.g., just says 'random sample' without referencing the problem), or has minor calculation errors, or interpretation lacks context.",
            I: "Skips condition verification, makes fundamental calculation errors, or provides no interpretation or an incorrect interpretation."
        },
        commonMistakes: [
            "Checking conditions superficially without calculations (e.g., just writing 'SRS' without referencing the problem)",
            "Forgetting the 10% condition or not showing the calculation",
            "Using p instead of p-hat in the standard error formula",
            "Interpreting as 'there is a 95% probability that p is in the interval' instead of using confidence language",
            "Not mentioning the specific population in the interpretation"
        ],
        contextFromVideo: "For a one-sample z-interval for a population proportion: (1) Random sample from the population, (2) n <= 10% of N when sampling without replacement, (3) np-hat >= 10 and n(1-p-hat) >= 10. CI = p-hat +/- z* x sqrt(p-hat(1-p-hat)/n). Interpretation template: We are C% confident that the interval from ___ to ___ captures the [parameter in context]."
    },

    exitTicket: {
        questionText: "A city council member claims that more than half of residents support a new park project. A research firm randomly selects 400 residents from a city of 50,000 and finds that 224 support the project (p-hat = 0.56).\n(a) Verify the conditions for constructing a 95% confidence interval.\n(b) Calculate the 95% confidence interval.\n(c) Based on your interval, is there convincing evidence that more than half of residents support the project? Explain using the confidence interval.",
        expectedElements: [
            { id: "conditions-verified", description: "Verifies all three conditions: random sample, 400 <= 10% of 50,000 (400 <= 5,000), successes = 224 >= 10 and failures = 176 >= 10", required: true },
            { id: "ci-calculation", description: "Calculates CI: SE = sqrt(0.56 x 0.44/400) ≈ 0.0248, ME = 1.96 x 0.0248 ≈ 0.0487, CI ≈ (0.511, 0.609)", required: true },
            { id: "evidence-evaluation", description: "Evaluates the claim: since the entire interval is above 0.50, there IS convincing evidence that more than half support the project", required: true },
            { id: "proper-interpretation", description: "Provides a proper CI interpretation: We are 95% confident that the proportion of all city residents who support the park project is between approximately 0.511 and 0.609", required: false }
        ],
        scoringGuide: {
            E: "Correctly verifies all conditions with calculations, computes the CI accurately, and makes the correct connection between the interval being entirely above 0.50 and the conclusion about convincing evidence.",
            P: "Gets the CI approximately correct but has minor errors in conditions or calculation, or makes the correct conclusion but doesn't clearly explain the connection to 0.50.",
            I: "Makes fundamental errors in conditions or CI calculation, or incorrectly evaluates whether there is convincing evidence, or provides no meaningful connection between the CI and the claim."
        },
        commonMistakes: [
            "Confusing this with a significance test (using p0 instead of p-hat in SE)",
            "Saying there is no convincing evidence because 0.56 is close to 0.50",
            "Not connecting the interval bounds to the claimed value of 0.50",
            "Forgetting to verify conditions before calculating"
        ],
        contextFromVideo: "From Topic 6.1: evidence is convincing if we can rule out random chance. From Topic 6.2: construct a CI by verifying conditions, then p-hat +/- z* x SE. If the entire CI is above (or below) a claimed value, that provides evidence for the claim. A CI that contains the claimed value does not provide convincing evidence."
    }
};

window.getRubricU6L12 = function(questionId) {
    return RUBRICS_U6L12[questionId] || null;
};

window.buildReflectionPromptU6L12 = function(questionId, studentAnswer) {
    const rubric = RUBRICS_U6L12[questionId];
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
    "score": "E" | "P" | "I",
    "feedback": "Brief explanation of the grade",
    "matched": ["list of elements the student addressed"],
    "missing": ["list of elements the student missed"],
    "suggestion": "Specific suggestion for improvement (null if E)"
}`;
};

// AI Grading Prompts for Unit 6 Lesson 3 (Topic 6.3)
// Inference for Categorical Data: Proportions — Justifying a Claim Based on a CI for p

window.LESSON_CONTEXT_U6L3 = `
Unit 6 Lesson 3 covers Topic 6.3 of AP Statistics: Justifying a Claim Based on a Confidence Interval for a Population Proportion.

Video 1 — Interpreting a CI & Justifying Claims:
Template: "We are C% confident that the interval from ___ to ___ captures the [population parameter in context]."
Proposition 100 signature example: 95% CI (0.689, 0.767) for proportion of valid signatures. Need 6000/9388 = 63.9% valid. Because ALL values in CI > 0.639, there IS convincing evidence they have enough signatures.
Practice: Will Prop 100 pass? CI = 0.518 ± 0.044 = (0.474, 0.562). The value 0.5 is in the interval, so there is NOT convincing evidence that a majority will vote for it.
Rule: If all values in CI are consistent with claim → convincing evidence. If one or more values inconsistent → NOT convincing evidence.

Video 2 — Interpreting Confidence Level & Factors Affecting Margin of Error:
Driver's license example: 30% of 2000 students have a license, sample n=50. Repeated 95% CIs: some capture p=0.30 (green), some miss (red). About 95% of intervals capture the true proportion.
Interpreting confidence level: "In repeated random sampling with the same sample size, approximately C% of C% confidence intervals will capture the population proportion."
KEY MISCONCEPTION: Confidence level does NOT give the probability that a particular CI captures the true proportion. A specific CI either captures it (prob 1) or doesn't (prob 0).
Width of CI = 2 × ME. To decrease ME: (1) increase sample size (width ∝ 1/√n, so quadruple n to halve ME), (2) decrease confidence level (lower z*: 90% uses 1.645 vs 95% uses 1.96).

Video 3 — Full Worked Example (2010 AP Exam):
Mike & Lori's music player: 2384 songs, 13/50 randomly selected were Lori's.
5-step process for constructing and interpreting a CI:
1. Define the parameter: p = proportion of all songs loaded by Lori.
2. Identify procedure: one-sample z-interval for p.
3. Check conditions: Random (songs randomly selected ✓), 10% (50 ≤ 10% of 2384 ✓), Large Counts (13 ≥ 10 and 37 ≥ 10 ✓).
4. Calculate: p-hat = 0.26, z* = 1.645, ME = 1.645 × √(0.26×0.74/50) ≈ 0.102, CI = (0.158, 0.362).
5. Interpret: "We are 90% confident that the interval from 0.158 to 0.362 captures the proportion of all songs on the player that were loaded by Lori."
Part (b): With/without replacement doesn't matter because 50 < 10% of 2384 (10% condition met).
Note: Do NOT interpret confidence level unless specifically asked.
`;

const RUBRICS_U6L3 = {
    reflect1: {
        questionText: "A survey of 200 randomly selected adults in a large city finds that 124 support expanding public transit. A 95% confidence interval for the proportion of all adults in the city who support expansion is (0.558, 0.682). (a) Interpret this confidence interval in context. (b) A city council member claims that at least 50% of adults support expansion. Does this interval provide convincing evidence for this claim? Explain. (c) Another council member claims that more than 70% support expansion. Does the interval support this claim? Explain.",
        expectedElements: [
            { id: "ci-interpretation", description: "Correctly interprets CI: 'We are 95% confident that the interval from 0.558 to 0.682 captures the proportion of all adults in the city who support expanding public transit'", required: true },
            { id: "at-least-50-claim", description: "Correctly evaluates the 50% claim: Since ALL values in the interval (0.558 to 0.682) are above 0.50, there IS convincing evidence that at least 50% support expansion", required: true },
            { id: "more-than-70-claim", description: "Correctly evaluates the 70% claim: Since 0.70 is NOT in the interval (all values are below 0.682), there is NOT convincing evidence that more than 70% support expansion", required: true },
            { id: "justification-logic", description: "Explains the general logic: if all values are consistent with the claim, there is convincing evidence; if some are inconsistent, there is not", required: false }
        ],
        scoringGuide: {
            E: "Correctly interprets the CI in context with proper confidence language, correctly evaluates both claims by comparing the interval bounds to the claimed values (all values > 0.50 for Part b; 0.70 above the interval for Part c), and provides clear reasoning.",
            P: "Interprets the CI but with incomplete context, or gets one of the two claims correct but not the other, or provides correct evaluations without adequate explanation.",
            I: "Misinterprets the CI (e.g., uses probability language), gets both claim evaluations wrong, or fails to connect the interval values to the claims."
        },
        commonMistakes: [
            "Using probability language: 'There is a 95% probability that...' instead of confidence language",
            "Not referencing the sample or population in the interpretation",
            "Saying 0.70 IS in the interval (it is not — the upper bound is 0.682)",
            "Confusing 'at least 50%' with 'more than 50%' (for this interval, both yield the same conclusion)",
            "Failing to explain WHY the interval supports or doesn't support each claim"
        ],
        contextFromVideo: "Interpretation template: 'We are C% confident that the interval from ___ to ___ captures the [parameter in context].' For justifying claims: if ALL values in the CI are consistent with the claim, there is convincing evidence. If one or more values are inconsistent with the claim, there is NOT convincing evidence. Example: CI (0.689, 0.767) — all values > 0.639, so convincing evidence for that claim. CI (0.474, 0.562) — includes 0.5, so NOT convincing evidence for a majority."
    },

    reflect2: {
        questionText: "Explain what it means to say we are '95% confident' in the context of confidence intervals. In your explanation, address: (a) What does the 95% refer to in terms of repeated sampling? (b) Can we say there is a 95% probability that a specific, already-calculated confidence interval contains the true proportion? Why or why not? (c) Name two ways to decrease the margin of error of a confidence interval and explain why each works.",
        expectedElements: [
            { id: "repeated-sampling", description: "Explains that in repeated random sampling with the same sample size, approximately 95% of the resulting 95% CIs will capture the true population proportion", required: true },
            { id: "not-probability", description: "Correctly states NO — a specific CI either captures the true proportion (probability 1) or doesn't (probability 0); the 95% refers to the long-run capture rate across many intervals, not any single one", required: true },
            { id: "increase-sample-size", description: "Identifies increasing sample size as a way to decrease ME, explaining that n is in the denominator of the SE formula (width ∝ 1/√n)", required: true },
            { id: "decrease-confidence-level", description: "Identifies decreasing the confidence level as a way to decrease ME, explaining that a lower confidence level means a smaller critical value z*", required: true },
            { id: "quadruple-rule", description: "Mentions that you must quadruple the sample size to cut the margin of error in half", required: false }
        ],
        scoringGuide: {
            E: "Clearly explains the repeated sampling interpretation, correctly addresses the probability misconception with reasoning, and identifies both factors (sample size and confidence level) with correct explanations of why each affects ME.",
            P: "Addresses most components but is vague on one: e.g., gives the repeated sampling interpretation but doesn't clearly explain the probability misconception, or identifies both factors but doesn't explain the mechanisms.",
            I: "Confuses confidence level with probability of a specific interval, fails to identify the repeated sampling concept, or provides incorrect explanations of factors affecting margin of error."
        },
        commonMistakes: [
            "Saying '95% probability that the interval contains p' — this is the key misconception",
            "Not distinguishing between what happens across many samples vs. one specific interval",
            "Saying 'increase confidence level' decreases ME (it's the opposite)",
            "Forgetting to explain WHY larger n or lower confidence level decreases ME",
            "Confusing standard error with standard deviation of the population"
        ],
        contextFromVideo: "In repeated random sampling with same sample size, approximately 95% of 95% CIs will capture the population proportion. A specific CI that includes p captures it with probability 1; one that misses has probability 0. Confidence level ≠ probability for a particular interval. Two factors decrease ME: (1) larger sample size — n in denominator, width ∝ 1/√n, quadruple n to halve ME; (2) lower confidence level — smaller z* (e.g., z*=1.645 for 90% vs z*=1.96 for 95%)."
    },

    exitTicket: {
        questionText: "A researcher randomly selects 80 songs from a digital playlist of 1,200 songs and finds that 24 are jazz.\n(a) Check all three conditions for constructing a confidence interval.\n(b) Construct a 90% confidence interval for the proportion of all songs on the playlist that are jazz. Show all 5 steps.\n(c) Interpret your interval in context.\n(d) Based on your interval, is there convincing evidence that more than 20% of songs on the playlist are jazz? Explain using the confidence interval.",
        expectedElements: [
            { id: "define-parameter", description: "Step 1 — Defines the parameter: p = the proportion of all songs on the playlist that are jazz", required: true },
            { id: "identify-procedure", description: "Step 2 — Identifies the procedure: one-sample z-interval for a population proportion", required: true },
            { id: "check-conditions", description: "Step 3 — Checks all three conditions: Random (randomly selected ✓), 10% (80 ≤ 10% of 1200 = 120 ✓), Large Counts (24 successes ≥ 10 and 56 failures ≥ 10 ✓)", required: true },
            { id: "calculate-ci", description: "Step 4 — Calculates: p-hat = 24/80 = 0.30, z* = 1.645, SE = √(0.30×0.70/80) ≈ 0.0512, ME ≈ 0.0843, CI ≈ (0.216, 0.384)", required: true },
            { id: "interpret-ci", description: "Step 5 — Interprets: 'We are 90% confident that the interval from approximately 0.216 to 0.384 captures the proportion of all songs on the playlist that are jazz'", required: true },
            { id: "justify-claim", description: "Justifies the claim: Since all values in the CI (0.216 to 0.384) are greater than 0.20, there IS convincing evidence that more than 20% of songs are jazz", required: true }
        ],
        scoringGuide: {
            E: "Completes all 5 steps correctly: defines parameter, identifies procedure, checks all three conditions with calculations, computes the CI with correct z* and SE, interprets in context, and correctly justifies the claim by comparing interval to 0.20.",
            P: "Completes most steps but has a minor error: e.g., skips defining the parameter, checks conditions without calculations, has a small arithmetic error, or interprets without full context. Still demonstrates understanding of the overall process.",
            I: "Misses multiple steps, makes fundamental calculation errors (wrong z* or wrong SE formula), skips condition checking entirely, fails to interpret, or incorrectly evaluates the claim about 20%."
        },
        commonMistakes: [
            "Forgetting to define the parameter as the first step",
            "Using z* = 1.96 instead of 1.645 for a 90% CI",
            "Checking conditions superficially without showing calculations",
            "Using p instead of p-hat in the standard error formula",
            "Interpreting with probability language instead of confidence language",
            "Saying there is NOT convincing evidence for 20% when the entire interval is above 0.20"
        ],
        contextFromVideo: "5-step process: (1) Define parameter, (2) Identify procedure (one-sample z-interval for p), (3) Verify conditions with evidence (Random, 10%, Large Counts), (4) Calculate (p-hat ± z* × SE), (5) Interpret in context. For justifying claims: check if all values in CI are consistent with the claim. Do NOT interpret confidence level unless specifically asked."
    }
};

window.getRubricU6L3 = function(questionId) {
    return RUBRICS_U6L3[questionId] || null;
};

window.buildReflectionPromptU6L3 = function(questionId, studentAnswer) {
    const rubric = RUBRICS_U6L3[questionId];
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

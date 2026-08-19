// AI Grading Prompts for Unit 5 Lessons 1-2 (Topics 5.1–5.2)
// Sampling Distributions: Introduction & The Normal Distribution, Revisited

window.LESSON_CONTEXT_U5L12 = `
Unit 5 Lessons 1-2 cover Topics 5.1 and 5.2 of AP Statistics.

Topic 5.1 introduces sampling variability — the idea that different random samples from the same population produce different statistics. Examples include:
- Rolling two dice and computing sample means from sets of 5 rolls (discrete)
- Sampling 12 koala weights from a population with μ = 15 lbs, σ = 1.8 lbs (continuous)
- Polling 1,000 voters when a candidate has 51% support (proportions)
Key insight: While a single sample statistic is unpredictable (like a dice roll), the distribution of statistics from many samples of the same size is predictable and clusters around the true population parameter.

Topic 5.2 revisits the normal distribution with three videos:
Video 1 — Calculating probabilities for normal distributions using Z-scores. Giraffe neck example (μ = 5.9 ft, σ = 0.3 ft). Inverse normal problems (given area, find boundary). AP Exam requirements: define random variable, show normal distribution, identify parameters, show value of interest, give correct probability.

Video 2 — Linear combinations of independent normal random variables. Capitol 10K race example: Female times (μ_F = 81 min) and Male times (μ_M = 70 min). Mean of differences = difference of means. Standard deviations cannot be subtracted — must convert to variances and add. Distribution of differences of independent normal RVs is also normal.

Video 3 — Appropriateness of using normal distribution. Binomial example with 14% success rate: n=10 is skewed right (inappropriate for normal approximation), n=75 is approximately normal (passes 68-95-99.7 empirical rule check). Checklist: unimodal, roughly symmetric, bell-shaped.
`;

const RUBRICS_U5L12 = {
    reflect1: {
        questionText: "Explain in your own words what 'sampling variability' means and why it matters in statistics. Use the koala weight example or the election polling example from Video 1 to support your explanation. Why is a single sample statistic not enough to know the 'truth' about a population?",
        expectedElements: [
            { id: "define-variability", description: "Defines sampling variability as the natural variation in statistics from different samples of the same population", required: true },
            { id: "example-connection", description: "Connects explanation to a specific example (koala weights clustering around 15 lbs, or election polls varying around 51%)", required: true },
            { id: "single-sample-limitation", description: "Explains why a single sample is insufficient — it's unpredictable like a dice roll, could be far from the truth", required: true },
            { id: "many-samples-pattern", description: "Notes that many samples form a predictable distribution/pattern that reveals the population truth", required: false }
        ],
        scoringGuide: {
            E: "Clearly defines sampling variability, uses a specific example from the video with correct details, and explains why a single sample is insufficient with reference to the predictable pattern of many samples.",
            P: "Defines sampling variability and references an example, but explanation is vague, lacks specific details from the video, or doesn't fully explain why a single sample is insufficient.",
            I: "Does not demonstrate understanding of sampling variability, confuses it with other concepts, or provides no meaningful connection to the examples."
        },
        commonMistakes: [
            "Confusing sampling variability with measurement error",
            "Saying larger samples are always better without explaining why",
            "Not connecting to a specific example from the lesson",
            "Using 'it' without specifying what varies"
        ],
        contextFromVideo: "Different samples from the same population produce different statistics. If the distribution of a population is known, then the distribution of statistics from many samples of the very same size from that population is predictable. A statistic from a single random sample is not much different than a roll of the dice."
    },

    reflect2: {
        questionText: "A factory produces bolts with lengths that are normally distributed with μ = 5.0 cm and σ = 0.1 cm. A bolt is rejected if it is shorter than 4.8 cm or longer than 5.2 cm. Calculate the probability that a randomly selected bolt is rejected. Show your work with Z-scores and interpret your result in context.",
        expectedElements: [
            { id: "define-variable", description: "Defines the random variable (X = length of a randomly selected bolt in cm)", required: true },
            { id: "z-score-work", description: "Correctly calculates Z-scores: z = (4.8-5.0)/0.1 = -2 and z = (5.2-5.0)/0.1 = 2", required: true },
            { id: "probability-calc", description: "Correctly determines P(rejected) = P(X < 4.8) + P(X > 5.2) ≈ 0.0228 + 0.0228 = 0.0456 (or uses complement: 1 - 0.9544 = 0.0456)", required: true },
            { id: "interpretation", description: "Interprets the result in context: approximately 4.56% of bolts will be rejected", required: true }
        ],
        scoringGuide: {
            E: "Defines the random variable, correctly computes both Z-scores, finds the probability of rejection (≈ 0.0456 or 4.56%), and interprets in context of bolt production.",
            P: "Shows some correct Z-score work but makes a calculation error, uses only one tail, or provides a weak interpretation without proper context.",
            I: "Does not show Z-score work, makes fundamental errors in the probability calculation, or provides no interpretation."
        },
        commonMistakes: [
            "Forgetting to include both tails (only calculating one side)",
            "Calculating P(4.8 < X < 5.2) instead of P(rejected)",
            "Not defining the random variable",
            "Using calculator syntax without showing Z-scores or identifying normal distribution"
        ],
        contextFromVideo: "Define your random variable. Use the Z formula to calculate the Z-score. Using technology or the Table A, find the probability. On the AP exam, you must define the random variable, show you're using a normal distribution, identify the parameters, show the value of interest, and give the correct probability."
    },

    exitTicket: {
        questionText: "The weights of bags of chips from Brand X are normally distributed with μ = 10.0 oz and σ = 0.3 oz. The weights of bags from Brand Y are independently and normally distributed with μ = 9.5 oz and σ = 0.2 oz.\n(a) What is the probability that a randomly selected bag of Brand X weighs less than 9.5 oz? Show your Z-score work.\n(b) Find the mean and standard deviation of the distribution of differences (X − Y).\n(c) What is the probability that a randomly selected bag of Brand Y actually weighs more than a bag of Brand X? Show your work.",
        expectedElements: [
            { id: "part-a-zscore", description: "Calculates z = (9.5 - 10.0)/0.3 = -1.67 and finds P(X < 9.5) ≈ 0.0475", required: true },
            { id: "part-b-mean", description: "Correctly finds μ(X-Y) = 10.0 - 9.5 = 0.5 oz", required: true },
            { id: "part-b-sd", description: "Correctly finds σ(X-Y) = √(0.3² + 0.2²) = √(0.09 + 0.04) = √0.13 ≈ 0.361 oz (does NOT subtract SDs)", required: true },
            { id: "part-c-setup", description: "Recognizes that Y > X means X - Y < 0, finds z = (0 - 0.5)/0.361 ≈ -1.39", required: true },
            { id: "part-c-probability", description: "Correctly finds P(X - Y < 0) ≈ 0.0823", required: true },
            { id: "normal-justification", description: "Notes that X-Y is approximately normal because both X and Y are independently normal", required: false }
        ],
        scoringGuide: {
            E: "Correctly answers all three parts, shows the requested Z-score work, correctly finds the parameters of the difference distribution (especially adding variances), and obtains the correct probability that Brand Y weighs more.",
            P: "Gets 2 of 3 parts substantially correct, or gets all parts but with minor errors (e.g., subtracting SDs instead of adding variances, or rounding errors).",
            I: "Gets fewer than 2 parts correct, shows fundamental misunderstanding of linear combinations or Z-score calculations, or provides minimal work."
        },
        commonMistakes: [
            "Subtracting standard deviations instead of adding variances",
            "Forgetting to take the square root after adding variances",
            "Not recognizing that Y > X means X - Y < 0",
            "Not justifying that the difference distribution is normal"
        ],
        contextFromVideo: "To find the mean of the differences, take the difference of the means. You cannot subtract standard deviations — convert to variances and always add. The distribution of differences of two independent approximately normal random variables can be modeled with a normal distribution."
    }
};

window.getRubricU5L12 = function(questionId) {
    return RUBRICS_U5L12[questionId] || null;
};

window.buildReflectionPromptU5L12 = function(questionId, studentAnswer) {
    const rubric = RUBRICS_U5L12[questionId];
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

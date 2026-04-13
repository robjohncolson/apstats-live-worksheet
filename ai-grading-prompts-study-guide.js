/**
 * AI Grading Prompts for the AP Statistics Diagnostic Study Guide
 *
 * Unlike the per-lesson rubric files, this file uses a generic AP-rubric
 * prompt template. Each gate is a College Board Progress Check FRQ, and
 * the prompt builder passes the full question text through to the grader
 * (DeepSeek already knows the AP scoring rubric), so no per-question
 * hand-crafted `expectedElements` arrays are needed.
 */

const LESSON_CONTEXT_SG = `
This is a diagnostic study guide for AP Statistics. Each question is a College Board Progress Check FRQ that covers the synthesis of one unit of the course. Grade as the AP Exam would grade it — partial credit is allowed, but the student should be addressing every part of the question with statistically correct reasoning. Be strict about statistical vocabulary (population vs sample, parameter vs statistic, interval vs point estimate, interpret vs compute, random assignment vs random selection) but forgiving of minor arithmetic slips as long as the method is right.

The purpose of this diagnostic is to help the student decide which units and lessons to review before the AP Exam. Scores of I (Incorrect) will open a drill-down panel with lesson-level probes and remediation resources. Scores of P (Partially Correct) will offer an optional review panel. Scores of E (Essentially Correct) close the unit off as mastered. Your feedback should be specific enough that the student knows exactly which part of the question they stumbled on.
`;

const UNIT_TITLES_SG = {
  1: 'Unit 1: Exploring One-Variable Data',
  2: 'Unit 2: Exploring Two-Variable Data',
  3: 'Unit 3: Collecting Data',
  4: 'Unit 4: Probability, Random Variables & Probability Distributions',
  5: 'Unit 5: Sampling Distributions',
  6: 'Unit 6: Inference for Categorical Data \u2014 Proportions',
  7: 'Unit 7: Inference for Quantitative Data \u2014 Means',
  8: 'Unit 8: Inference for Categorical Data \u2014 Chi-Square',
  9: 'Unit 9: Inference for Quantitative Data \u2014 Slopes',
};

const UNIT_TOPICS_SG = {
  1: 'Normal distribution, z-scores, comparing two populations',
  2: 'Least-squares regression, residuals, residual interpretation',
  3: 'Experimental design, random assignment vs random selection, scope of inference',
  4: 'Random variables, expected value, probability distributions',
  5: 'Central Limit Theorem, sampling distribution of the mean',
  6: 'Confidence interval for p, justifying a claim from a CI',
  7: 'Confidence interval for \u03bc, scope of generalization',
  8: 'Chi-square test for homogeneity',
  9: 'Regression inference, t-test for slope',
};

const GATE_IDS_SG = {
  1: 'U1-PC-FRQ-Q02',
  2: 'U2-PC-FRQ-Q02',
  3: 'U3-PC-FRQ-Q01',
  4: 'U4-PC-FRQ-Q02',
  5: 'U5-PC-FRQ-Q02',
  6: 'U6-PC-FRQ-Q01',
  7: 'U7-PC-FRQ-Q02',
  8: 'U8-PC-FRQ-Q01',
  9: 'U9-PC-FRQ-Q01',
};

function buildReflectionPromptSG(unitNumber, fullQuestionText, studentAnswer) {
  const unitTitle = UNIT_TITLES_SG[unitNumber] || ('Unit ' + unitNumber);
  const unitTopic = UNIT_TOPICS_SG[unitNumber] || '';

  return [
    'You are grading an AP Statistics Progress Check Free-Response Question for ' + unitTitle + '.',
    'Unit focus: ' + unitTopic + '.',
    '',
    '## Question (full text as it appears on the College Board Progress Check FRQ):',
    fullQuestionText,
    '',
    '## Student\'s answer:',
    studentAnswer,
    '',
    '## Grading instructions:',
    'Grade using the AP Exam rubric convention:',
    '- E (Essentially Correct): Addresses every part of the question with statistically correct reasoning and correct vocabulary. Minor arithmetic slips are OK if the method is right.',
    '- P (Partially Correct): Addresses most parts but has one substantive gap \u2014 e.g., skips a part, uses wrong vocabulary, confuses parameter/statistic, or has a method error in exactly one part.',
    '- I (Incorrect): Missing multiple parts, fundamental conceptual errors, wrong procedure, or essentially blank.',
    '',
    'Be specific about which parts of the question the student nailed and which ones they missed. Use the letters (a), (b), (c), etc. from the question when you can.',
    '',
    'Respond in JSON format:',
    '{',
    '  "score": "E" | "P" | "I",',
    '  "feedback": "1-2 sentence summary of what they did right and what is weakest",',
    '  "matched": ["short bullet phrases for parts handled correctly"],',
    '  "missing": ["short bullet phrases for parts skipped or gotten wrong"],',
    '  "suggestion": "optional: one sentence of specific advice for how to review this unit"',
    '}'
  ].join('\n');
}

function getRubricSG(unitNumber) {
  return {
    unitNumber: unitNumber,
    unitTitle: UNIT_TITLES_SG[unitNumber],
    unitTopic: UNIT_TOPICS_SG[unitNumber],
    gateId: GATE_IDS_SG[unitNumber],
  };
}

function getGateIdForUnitSG(unitNumber) {
  return GATE_IDS_SG[unitNumber];
}

function stripFrqBoilerplateSG(promptText) {
  if (!promptText) return '';
  return promptText
    .replace(/^Show all your work[^.]*\.[^.]*\.\s*/s, '')
    .replace(/^\s+/, '');
}

// Export for browser
if (typeof window !== 'undefined') {
  window.LESSON_CONTEXT_SG = LESSON_CONTEXT_SG;
  window.UNIT_TITLES_SG = UNIT_TITLES_SG;
  window.UNIT_TOPICS_SG = UNIT_TOPICS_SG;
  window.GATE_IDS_SG = GATE_IDS_SG;
  window.buildReflectionPromptSG = buildReflectionPromptSG;
  window.getRubricSG = getRubricSG;
  window.getGateIdForUnitSG = getGateIdForUnitSG;
  window.stripFrqBoilerplateSG = stripFrqBoilerplateSG;
}

// Export for Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LESSON_CONTEXT_SG,
    UNIT_TITLES_SG,
    UNIT_TOPICS_SG,
    GATE_IDS_SG,
    buildReflectionPromptSG,
    getRubricSG,
    getGateIdForUnitSG,
    stripFrqBoilerplateSG,
  };
}

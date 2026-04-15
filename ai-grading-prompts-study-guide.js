/**
 * AI grading prompts for the AP Statistics Diagnostic Study Guide.
 *
 * This file exposes three prompt builders for the diagnostic:
 *
 * 1. `buildReflectionPromptSG(unit, questionRecordOrText, studentAnswer)`
 *    - Grades one unit's Progress Check FRQ using the official scoring data
 *      when a lifted local question record is available.
 *
 * 2. `buildFocusSynthesisPromptSG({unit, unitTitle, unitTopic, mcqResults,
 *    frqAnswer, frqGrade, frameworkContext})`
 *    - Combines the student's MCQ signal, their FRQ answer and grade, and
 *      the AP Course Framework metadata for the unit into a review plan.
 *
 * 3. `getFrameworkContextSG(unitNumber, unitFrameworks)`
 *    - Extracts only the lesson and LO bits the grader needs, so the prompt
 *      stays short even though `UNIT_FRAMEWORKS` is large in memory.
 */

const LESSON_CONTEXT_SG = `
This is a diagnostic study guide for AP Statistics. Each unit is graded independently so the student can see immediate feedback and decide where to focus their review. Grade FRQs as the AP Exam would grade them - partial credit is allowed, but the student should be addressing every part of the question with statistically correct reasoning. Be strict about statistical vocabulary (population vs sample, parameter vs statistic, interval vs point estimate, interpret vs compute, random assignment vs random selection) but forgiving of minor arithmetic slips as long as the method is right.

The purpose of this diagnostic is to help the student decide which units and lessons to review before the AP Exam. Your feedback should be specific enough that the student knows exactly which part of the question they stumbled on, so they can find the corresponding lesson in the AP Course Framework.
`;

const UNIT_TITLES_SG = {
  1: 'Unit 1: Exploring One-Variable Data',
  2: 'Unit 2: Exploring Two-Variable Data',
  3: 'Unit 3: Collecting Data',
  4: 'Unit 4: Probability, Random Variables & Probability Distributions',
  5: 'Unit 5: Sampling Distributions',
  6: 'Unit 6: Inference for Categorical Data - Proportions',
  7: 'Unit 7: Inference for Quantitative Data - Means',
  8: 'Unit 8: Inference for Categorical Data - Chi-Square',
  9: 'Unit 9: Inference for Quantitative Data - Slopes',
};

const UNIT_TOPICS_SG = {
  1: 'Normal distribution, z-scores, comparing two populations',
  2: 'Least-squares regression, residuals, residual interpretation',
  3: 'Experimental design, random assignment vs random selection, scope of inference',
  4: 'Random variables, expected value, probability distributions',
  5: 'Central Limit Theorem, sampling distribution of the mean',
  6: 'Confidence interval for p, justifying a claim from a CI',
  7: 'Confidence interval for mu, scope of generalization',
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

const SCHEMA_VERSION_SG = 2;
const STORAGE_KEY_SG = 'apStatsStudyGuideDiagnostic.v2';

function getPromptTextSG(questionRecordOrText) {
  if (questionRecordOrText && typeof questionRecordOrText === 'object') {
    return typeof questionRecordOrText.prompt === 'string' ? questionRecordOrText.prompt : '';
  }
  return typeof questionRecordOrText === 'string' ? questionRecordOrText : '';
}

function getOfficialScoringSG(questionRecord) {
  if (!questionRecord || typeof questionRecord !== 'object') return null;

  const solutionScoring =
    questionRecord.solution &&
    typeof questionRecord.solution === 'object' &&
    questionRecord.solution.scoring &&
    typeof questionRecord.solution.scoring === 'object'
      ? questionRecord.solution.scoring
      : null;

  if (solutionScoring) return solutionScoring;

  const topLevelScoring =
    questionRecord.scoring && typeof questionRecord.scoring === 'object'
      ? questionRecord.scoring
      : null;

  return topLevelScoring;
}

function getSolutionCheckpointsSG(questionRecord) {
  if (
    !questionRecord ||
    typeof questionRecord !== 'object' ||
    !questionRecord.solution ||
    typeof questionRecord.solution !== 'object' ||
    !Array.isArray(questionRecord.solution.parts)
  ) {
    return [];
  }

  return questionRecord.solution.parts.map(function (part) {
    return {
      partId: part && part.partId ? part.partId : '',
      description: part && part.description ? part.description : '',
      response: part && part.response ? part.response : '',
      calculations:
        part && Array.isArray(part.calculations)
          ? part.calculations.filter(Boolean)
          : [],
    };
  });
}

function buildReflectionPromptSG(unitNumber, questionRecordOrText, studentAnswer) {
  const unitTitle = UNIT_TITLES_SG[unitNumber] || ('Unit ' + unitNumber);
  const unitTopic = UNIT_TOPICS_SG[unitNumber] || '';
  const promptText = getPromptTextSG(questionRecordOrText);
  const questionRecord =
    questionRecordOrText && typeof questionRecordOrText === 'object'
      ? questionRecordOrText
      : null;
  const officialScoring = getOfficialScoringSG(questionRecord);
  const solutionCheckpoints = getSolutionCheckpointsSG(questionRecord);

  return [
    'You are grading an AP Statistics Progress Check Free-Response Question for ' + unitTitle + '.',
    'Unit focus: ' + unitTopic + '.',
    '',
    'Use the official scoring guide below as the primary rubric when it is available.',
    'Do not invent extra scoring rules beyond the official guide.',
    'Use the official solution checkpoints to understand what a complete response covers, but accept equivalent statistically correct wording from the student.',
    '',
    '## Question (full text as it appears on the Progress Check FRQ):',
    promptText,
    '',
    '## Official scoring guide:',
    officialScoring
      ? JSON.stringify(officialScoring, null, 2)
      : '(official scoring guide unavailable for this question)',
    '',
    '## Official solution checkpoints:',
    solutionCheckpoints.length
      ? JSON.stringify(solutionCheckpoints, null, 2)
      : '(official solution checkpoints unavailable for this question)',
    '',
    '## Student answer:',
    studentAnswer,
    '',
    '## Grading instructions:',
    'Return the overall AP-style score using these labels:',
    '- E (Essentially Correct): Addresses every part of the question with statistically correct reasoning and correct vocabulary. Minor arithmetic slips are OK if the method is right.',
    '- P (Partially Correct): Addresses most parts but has one substantive gap, such as skipping one part, using wrong vocabulary, confusing parameter and statistic, or making one real method error.',
    '- I (Incorrect): Missing multiple parts, showing fundamental conceptual errors, using the wrong procedure, or being essentially blank.',
    '',
    'Be specific about which parts of the question the student handled correctly and which parts are missing or wrong. Use the part labels from the question when possible.',
    '',
    'Respond in JSON format:',
    '{',
    '  "score": "E" | "P" | "I",',
    '  "feedback": "1-2 sentence summary of what they did right and what is weakest",',
    '  "matched": ["short bullet phrases for parts handled correctly"],',
    '  "missing": ["short bullet phrases for parts skipped or gotten wrong"],',
    '  "suggestion": "optional: one sentence of specific advice for how to review this unit"',
    '}',
  ].join('\n');
}

function getFrameworkContextSG(unitNumber, unitFrameworks) {
  if (!unitFrameworks || !unitFrameworks[unitNumber]) return null;
  const unit = unitFrameworks[unitNumber];
  const lessons = unit.lessons || {};
  const simplified = {};

  Object.keys(lessons).forEach(function (key) {
    const lesson = lessons[key] || {};
    const los = Array.isArray(lesson.learningObjectives)
      ? lesson.learningObjectives
      : [];

    simplified[key] = {
      topic: lesson.topic || '',
      skills: Array.isArray(lesson.skills) ? lesson.skills : [],
      learningObjectives: los.map(function (lo) {
        return {
          id: lo && lo.id ? lo.id : '',
          text: lo && lo.text ? lo.text : '',
        };
      }),
      keyConcepts: Array.isArray(lesson.keyConcepts) ? lesson.keyConcepts : [],
    };
  });

  return {
    title: unit.title || UNIT_TITLES_SG[unitNumber] || ('Unit ' + unitNumber),
    examWeight: unit.examWeight || '',
    bigIdeas: Array.isArray(unit.bigIdeas) ? unit.bigIdeas : [],
    lessons: simplified,
  };
}

function buildFocusSynthesisPromptSG(options) {
  const opts = options || {};
  const unitNumber = opts.unit;
  const unitTitle =
    opts.unitTitle || UNIT_TITLES_SG[unitNumber] || ('Unit ' + unitNumber);
  const unitTopic = opts.unitTopic || UNIT_TOPICS_SG[unitNumber] || '';
  const mcqResults = Array.isArray(opts.mcqResults) ? opts.mcqResults : [];
  const frqAnswer = typeof opts.frqAnswer === 'string' ? opts.frqAnswer : '';
  const frqGrade = opts.frqGrade || null;
  const frameworkContext = opts.frameworkContext || null;
  const masterySnapshot =
    opts.masterySnapshot && typeof opts.masterySnapshot === 'object'
      ? opts.masterySnapshot
      : null;

  const mcqLines = mcqResults.length
    ? mcqResults
        .map(function (r) {
          return [
            '- Lesson ' + r.lesson + ' (' + (r.questionId || '') + '): ',
            r.correct ? 'correct' : 'INCORRECT',
            ' (student chose ' + (r.selected || '?'),
            ', correct answer is ' + (r.correctAnswer || '?') + ')',
            r.prompt ? '\n    prompt: ' + r.prompt.slice(0, 140) : '',
          ].join('');
        })
        .join('\n')
    : '(no MCQ results - student did not attempt MCQ mode for this unit)';

  const frqBlock = frqAnswer
    ? [
        "## Student's FRQ response:",
        frqAnswer,
        '',
        '## FRQ grade (already assigned by the grader):',
        frqGrade ? JSON.stringify(frqGrade, null, 2) : '(not yet graded)',
      ].join('\n')
    : '(no FRQ response - student did not attempt FRQ mode for this unit)';

  const frameworkBlock = frameworkContext
    ? [
        '## AP Course Framework for this unit (authoritative lesson list):',
        JSON.stringify(frameworkContext, null, 2),
      ].join('\n')
    : '(framework data unavailable for this unit)';

  const masteryBlock =
    masterySnapshot && Object.keys(masterySnapshot).length
      ? [
          '## Current estimated mastery per learning objective (from Bayesian Knowledge Tracing, 0-100%):',
          Object.keys(masterySnapshot)
            .sort()
            .map(function (loId) {
              const raw = Number(masterySnapshot[loId]);
              const pct = Number.isFinite(raw) ? Math.round(raw * 100) : 0;
              return '- ' + loId + ': ' + pct + '%';
            })
            .join('\n'),
          '',
          'Use these numbers to break ties - LOs with lower mastery should be prioritized over LOs the student already understands.',
        ].join('\n')
      : '(no mastery snapshot yet - student has not checked any MCQs)';

  return [
    'You are an AP Statistics tutor building a personalized review plan for a student.',
    'Unit: ' + unitTitle,
    'Unit focus: ' + unitTopic,
    '',
    'The student just completed a diagnostic for this unit. Use their MCQ answers, their FRQ answer (if any), the AP Course Framework, and the current BKT mastery snapshot to recommend which lessons they should review.',
    '',
    '## MCQ signal:',
    mcqLines,
    '',
    frqBlock,
    '',
    frameworkBlock,
    '',
    masteryBlock,
    '',
    '## Your task:',
    'Return a prioritized list of lessons the student should focus on next. Ground every recommendation in a specific learning objective (LO) ID from the framework. If the student nailed the MCQs but stumbled on the FRQ, emphasize synthesis practice. If the student missed adjacent MCQs, group them and recommend the bridging concept. If the student did not attempt the FRQ, say so and keep the recommendation based on MCQ signal alone.',
    '',
    'Respond in JSON format:',
    '{',
    '  "priority": "high" | "medium" | "low",',
    '  "overallSummary": "1-2 sentences naming the biggest gap for this unit",',
    '  "focusLessons": [',
    '    {',
    '      "lesson": <lesson number as integer>,',
    '      "topic": "<lesson topic from the framework>",',
    '      "loIds": ["VAR-1.A", "..."],',
    '      "reason": "1 sentence tying MCQ or FRQ signal to this lesson",',
    '      "suggestedAction": "1 short action - watch the video, do the follow-along, run the Blooket, etc."',
    '    }',
    '  ],',
    '  "synthesisNote": "optional: 1 sentence if FRQ reveals a synthesis gap the MCQs missed"',
    '}',
    '',
    'Keep `focusLessons` to at most 4 entries. If the student did well, return an empty array and set `priority` to "low".',
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
  return promptText.replace(/^Show all your work[^.]*\.[^.]*\.\s*/s, '').replace(/^\s+/, '');
}

if (typeof window !== 'undefined') {
  window.LESSON_CONTEXT_SG = LESSON_CONTEXT_SG;
  window.UNIT_TITLES_SG = UNIT_TITLES_SG;
  window.UNIT_TOPICS_SG = UNIT_TOPICS_SG;
  window.GATE_IDS_SG = GATE_IDS_SG;
  window.SCHEMA_VERSION_SG = SCHEMA_VERSION_SG;
  window.STORAGE_KEY_SG = STORAGE_KEY_SG;
  window.buildReflectionPromptSG = buildReflectionPromptSG;
  window.buildFocusSynthesisPromptSG = buildFocusSynthesisPromptSG;
  window.getFrameworkContextSG = getFrameworkContextSG;
  window.getOfficialScoringSG = getOfficialScoringSG;
  window.getSolutionCheckpointsSG = getSolutionCheckpointsSG;
  window.getRubricSG = getRubricSG;
  window.getGateIdForUnitSG = getGateIdForUnitSG;
  window.stripFrqBoilerplateSG = stripFrqBoilerplateSG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LESSON_CONTEXT_SG,
    UNIT_TITLES_SG,
    UNIT_TOPICS_SG,
    GATE_IDS_SG,
    SCHEMA_VERSION_SG,
    STORAGE_KEY_SG,
    buildReflectionPromptSG,
    buildFocusSynthesisPromptSG,
    getFrameworkContextSG,
    getOfficialScoringSG,
    getSolutionCheckpointsSG,
    getRubricSG,
    getGateIdForUnitSG,
    stripFrqBoilerplateSG,
  };
}

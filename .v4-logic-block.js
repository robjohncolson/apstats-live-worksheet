// .v4-logic-block.js - Pure logic for the v4 daily-queue picker.
// Safe to paste inside study_guide_diagnostic.html's main IIFE; also runnable
// under Node via: new Function('window', src + '; return window.__studyGuideV4__;')({}).

(function(window) {
  'use strict';

  // --- constants ---
  const AP_EXAM_DATE = '2026-05-07';
  const UNIT_EXAM_WEIGHTS = { 1: 0.19, 2: 0.135, 3: 0.06, 4: 0.15, 5: 0.095, 6: 0.135, 7: 0.14, 8: 0.035, 9: 0.035 };
  const TIER_MULTIPLIERS = { core: 4, regular: 3, power: 2, support: 1 };
  const MASTERY_THRESHOLD = 0.75;
  const BKT_INIT = 0.3;
  const DOSE_MIN = 3;
  const DOSE_MAX = 12;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const FORMULA_UNIT_MAP = {
    // U1 - descriptive (one variable)
    mean: 1, 'std-dev': 1, variance: 1, zscore: 1, iqr: 1, 'outlier-iqr': 1, 'empirical-rule': 1,
    // U2 - descriptive (regression)
    linreg: 2, 'linreg-mean': 2, 'corr-r': 2, 'slope-b': 2, residual: 2, 'r-squared': 2, 'y-intercept': 2, 'log-transform': 2,
    // U4 - probability + RVs
    'add-rule': 4, 'cond-prob': 4, complement: 4, 'mult-rule': 4, 'mult-independent': 4,
    'rv-mean': 4, 'rv-sd': 4, 'binom-pmf': 4, 'binom-mean': 4, 'binom-sd': 4,
    'geom-pmf': 4, 'geom-mean': 4, 'geom-sd': 4,
    'lincomb-mean': 4, 'lincomb-var': 4, lintransform: 4,
    // U5 - sampling distributions
    'phat-mean': 5, 'phat-sd': 5, 'xbar-mean': 5, 'xbar-sd': 5,
    'diff-p-sd': 5, 'diff-x-sd': 5, 'large-counts': 5,
    // U6 - inference for proportions + general inference
    'phat-se': 6, 'one-prop-z': 6, 'one-prop-ci': 6, 'two-prop-z': 6, 'two-prop-ci': 6,
    'diff-p-se': 6, 'pooled-se': 6,
    power: 6, 'margin-error': 6, 'width-ci': 6, 'type-i-error': 6, 'type-ii-error': 6,
    'random-condition': 6, 'normal-condition': 6, 'ten-pct-condition': 6, 'p-value-interp': 6,
    'z-test-stat': 6, 'ci-formula': 6,
    // U7 - inference for means
    'xbar-se': 7, 'one-mean-t': 7, 'one-mean-ci': 7, 'two-mean-t': 7, 'two-mean-ci': 7,
    'diff-x-se': 7, 'paired-t': 7, 'df-t': 7,
    // U8 - chi-square
    'chi-sq': 8, 'expected-twoway': 8, 'expected-gof': 8, 'df-gof': 8, 'df-twoway': 8,
    'chi-sq-select': 8, 'chi-sq-hyp': 8, 'chi-sq-conditions': 8, 'chi-sq-conclude': 8,
    'chi-sq-output': 8, 'std-resid-chi': 8,
    // U9 - inference for regression
    'slope-mean': 9, 'slope-sd': 9, 'slope-se': 9, 'resid-s': 9, 'slope-t': 9, 'slope-ci': 9
  };

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    let year;
    let month;
    let day;
    let date;

    if (!match) {
      return null;
    }

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    date = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function getCommands() {
    if (!window.AP_STATS_CARTRIDGE || !Array.isArray(window.AP_STATS_CARTRIDGE.commands)) {
      return [];
    }

    return window.AP_STATS_CARTRIDGE.commands;
  }

  function getFormulaEntry(formulaId) {
    const commands = getCommands();
    let i;

    for (i = 0; i < commands.length; i += 1) {
      if (commands[i] && commands[i].id === formulaId) {
        return commands[i];
      }
    }

    return null;
  }

  function getUnits(state) {
    if (!state || !state.units || typeof state.units !== 'object') {
      return {};
    }

    return state.units;
  }

  function getUnitState(state, unit) {
    const units = getUnits(state);

    if (hasOwn(units, unit)) {
      return units[unit];
    }

    if (hasOwn(units, String(unit))) {
      return units[String(unit)];
    }

    return null;
  }

  function hasQuestionResultInUnit(state, unit, questionId) {
    const unitState = getUnitState(state, unit);

    return !!(
      unitState &&
      unitState.mcqResults &&
      typeof unitState.mcqResults === 'object' &&
      hasOwn(unitState.mcqResults, questionId)
    );
  }

  function hasQuestionResultAnywhere(state, questionId) {
    const units = getUnits(state);
    const unitKeys = Object.keys(units);
    let i;
    let unitState;

    for (i = 0; i < unitKeys.length; i += 1) {
      unitState = units[unitKeys[i]];
      if (
        unitState &&
        unitState.mcqResults &&
        typeof unitState.mcqResults === 'object' &&
        hasOwn(unitState.mcqResults, questionId)
      ) {
        return true;
      }
    }

    return false;
  }

  function compareFormulaIds(a, b, weights) {
    const weightDiff = (weights[b] || 0) - (weights[a] || 0);

    if (weightDiff !== 0) {
      return weightDiff;
    }

    if (a < b) {
      return -1;
    }

    if (a > b) {
      return 1;
    }

    return 0;
  }

  function parseSupplementQuestionId(questionId) {
    const match = /^U(\d+)-L(\d+)-QS?\d+/.exec(questionId);

    if (!match) {
      return null;
    }

    return {
      unit: Number(match[1]),
      lesson: Number(match[2])
    };
  }

  function parseMainQuestionId(questionId) {
    const match = /^U(\d+)-L(\d+)-Q\d+/.exec(questionId);

    if (!match) {
      return null;
    }

    return {
      unit: Number(match[1]),
      lesson: Number(match[2])
    };
  }

  // --- pure helpers ---

  function daysLeft(todayStr, examDateStr) {
    const today = parseIsoDate(todayStr);
    const examDate = parseIsoDate(examDateStr);
    let diffDays;

    if (!today || !examDate) {
      return 1;
    }

    diffDays = Math.ceil((examDate.getTime() - today.getTime()) / MS_PER_DAY);

    if (diffDays <= 0) {
      return 1;
    }

    return Math.max(1, diffDays);
  }

  function computeDailyDose(remaining, days) {
    if (remaining <= 0 || days <= 0) {
      return DOSE_MIN;
    }

    return Math.min(DOSE_MAX, Math.max(DOSE_MIN, Math.ceil(remaining / days)));
  }

  function formulaMastery(formulaId, state) {
    if (
      state &&
      state.touchedFormulas &&
      state.touchedFormulas[formulaId] &&
      typeof state.touchedFormulas[formulaId].lastMastery === 'number'
    ) {
      return state.touchedFormulas[formulaId].lastMastery;
    }

    return BKT_INIT;
  }

  function formulaWeight(formulaId, state) {
    const unit = FORMULA_UNIT_MAP[formulaId];
    const formulaEntry = getFormulaEntry(formulaId);
    const examWeight = UNIT_EXAM_WEIGHTS[unit] || 0;
    const tierMult = formulaEntry ? (TIER_MULTIPLIERS[formulaEntry.tier] || 0) : 0;
    const mastery = formulaMastery(formulaId, state);

    if (!unit || !formulaEntry) {
      return 0;
    }

    return examWeight * tierMult * (1 - mastery);
  }

  function formulaName(formulaId) {
    const formulaEntry = getFormulaEntry(formulaId);

    if (formulaEntry && typeof formulaEntry.action === 'string') {
      return formulaEntry.action;
    }

    return formulaId;
  }

  function touchedFormulaCount(state, tier) {
    const touchedFormulas = state && state.touchedFormulas ? state.touchedFormulas : null;
    let count = 0;
    let formulaIds;
    let i;
    let formulaEntry;

    if (!touchedFormulas || typeof touchedFormulas !== 'object') {
      return 0;
    }

    formulaIds = Object.keys(touchedFormulas);

    for (i = 0; i < formulaIds.length; i += 1) {
      formulaEntry = getFormulaEntry(formulaIds[i]);
      if (formulaEntry && formulaEntry.tier === tier) {
        count += 1;
      }
    }

    return count;
  }

  function pickProbeForFormula(formulaId, state) {
    const formulaEntry = getFormulaEntry(formulaId);
    const tier = formulaEntry ? formulaEntry.tier : null;
    const supplement = Array.isArray(window.EMBEDDED_CURRICULUM_SUPPLEMENT) ? window.EMBEDDED_CURRICULUM_SUPPLEMENT : [];
    const probeMap = window.FORMULA_PROBE_MAP && window.FORMULA_PROBE_MAP.map ? window.FORMULA_PROBE_MAP.map : {};
    let supplementCandidates = [];
    let supplementPick = null;
    let mainQuestionIds;
    let mainPick = null;
    let meta;
    let i;
    let entry;
    let questionId;

    for (i = 0; i < supplement.length; i += 1) {
      entry = supplement[i];
      if (entry && entry.formulaId === formulaId) {
        supplementCandidates.push(entry);
      }
    }

    if (supplementCandidates.length > 0) {
      supplementPick = supplementCandidates[0];

      for (i = 0; i < supplementCandidates.length; i += 1) {
        entry = supplementCandidates[i];
        meta = parseSupplementQuestionId(entry.id);

        if (!meta) {
          continue;
        }

        if (!hasQuestionResultInUnit(state, meta.unit, entry.id)) {
          supplementPick = entry;
          break;
        }
      }

      meta = parseSupplementQuestionId(supplementPick.id);
      if (!meta) {
        return null;
      }

      return {
        formulaId: formulaId,
        questionId: supplementPick.id,
        unit: meta.unit,
        lesson: meta.lesson,
        tier: tier
      };
    }

    if (!hasOwn(probeMap, formulaId) || !probeMap[formulaId] || !Array.isArray(probeMap[formulaId].questionIds) || probeMap[formulaId].questionIds.length === 0) {
      return null;
    }

    mainQuestionIds = probeMap[formulaId].questionIds;
    mainPick = mainQuestionIds[0];

    for (i = 0; i < mainQuestionIds.length; i += 1) {
      questionId = mainQuestionIds[i];
      if (!hasQuestionResultAnywhere(state, questionId)) {
        mainPick = questionId;
        break;
      }
    }

    meta = parseMainQuestionId(mainPick);
    if (!meta) {
      return null;
    }

    return {
      formulaId: formulaId,
      questionId: mainPick,
      unit: meta.unit,
      lesson: meta.lesson,
      tier: tier
    };
  }

  function pickDailyQueue(state, todayStr, examDateStr) {
    const sourceState = state || {};
    const existingDose = sourceState.dailyDose;
    const allFormulas = Object.keys(FORMULA_UNIT_MAP);
    const touchedFormulas = sourceState.touchedFormulas && typeof sourceState.touchedFormulas === 'object' ? sourceState.touchedFormulas : {};
    const touched = [];
    const untouched = [];
    const weights = {};
    const priorityLookup = {};
    const priority = [];
    const others = [];
    const queue = [];
    const days = daysLeft(todayStr, examDateStr);
    const coreAndRegularTouched = touchedFormulaCount(sourceState, 'core') + touchedFormulaCount(sourceState, 'regular');
    let dose;
    let remaining;
    let i;
    let formulaId;
    let formulaEntry;
    let probe;
    let sortedCandidates;

    if (existingDose && existingDose.date === todayStr) {
      return existingDose;
    }

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      if (hasOwn(touchedFormulas, formulaId)) {
        touched.push(formulaId);
      } else {
        untouched.push(formulaId);
      }
    }

    remaining = untouched.length || 81;

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      weights[formulaId] = formulaWeight(formulaId, sourceState);
    }

    if (coreAndRegularTouched < 32) {
      for (i = 0; i < untouched.length; i += 1) {
        formulaId = untouched[i];
        formulaEntry = getFormulaEntry(formulaId);
        if (formulaEntry && (formulaEntry.tier === 'core' || formulaEntry.tier === 'regular')) {
          priorityLookup[formulaId] = true;
        }
      }
    }

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      if (priorityLookup[formulaId]) {
        priority.push(formulaId);
      } else {
        others.push(formulaId);
      }
    }

    priority.sort(function(a, b) {
      return compareFormulaIds(a, b, weights);
    });

    others.sort(function(a, b) {
      return compareFormulaIds(a, b, weights);
    });

    sortedCandidates = priority.concat(others);
    dose = computeDailyDose(remaining, days);

    for (i = 0; i < sortedCandidates.length; i += 1) {
      if (queue.length >= dose) {
        break;
      }

      probe = pickProbeForFormula(sortedCandidates[i], sourceState);
      if (probe) {
        queue.push(probe);
      }
    }

    return {
      date: todayStr,
      queue: queue,
      completed: []
    };
  }

  function recordFormulaTouch(formulaId, correct, state) {
    const sourceState = state || {};
    const touchedFormulas = sourceState.touchedFormulas || {};
    const existingTouch = touchedFormulas[formulaId];
    const prior = existingTouch && typeof existingTouch.lastMastery === 'number' ? existingTouch.lastMastery : BKT_INIT;
    const next = window.BKT && window.BKT.updateMastery ? window.BKT.updateMastery(prior, correct) : prior;

    sourceState.touchedFormulas = touchedFormulas;
    sourceState.touchedFormulas[formulaId] = {
      firstTouchedAt: existingTouch ? existingTouch.firstTouchedAt : new Date().toISOString().slice(0, 10),
      lastMastery: next
    };

    return next;
  }

  // --- diagnostic export for testing + integration ---
  window.__studyGuideV4__ = {
    AP_EXAM_DATE: AP_EXAM_DATE,
    UNIT_EXAM_WEIGHTS: UNIT_EXAM_WEIGHTS,
    TIER_MULTIPLIERS: TIER_MULTIPLIERS,
    MASTERY_THRESHOLD: MASTERY_THRESHOLD,
    BKT_INIT: BKT_INIT,
    DOSE_MIN: DOSE_MIN,
    DOSE_MAX: DOSE_MAX,
    FORMULA_UNIT_MAP: FORMULA_UNIT_MAP,
    daysLeft: daysLeft,
    computeDailyDose: computeDailyDose,
    formulaMastery: formulaMastery,
    formulaWeight: formulaWeight,
    formulaName: formulaName,
    touchedFormulaCount: touchedFormulaCount,
    pickProbeForFormula: pickProbeForFormula,
    pickDailyQueue: pickDailyQueue,
    recordFormulaTouch: recordFormulaTouch
  };
})(typeof window !== 'undefined' ? window : globalThis);

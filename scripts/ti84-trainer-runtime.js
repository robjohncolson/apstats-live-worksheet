(function () {
  const { createState, createRouteState, transition } = window.TI84Machine;

  const STORAGE_KEY = 'ti84trainer_state_v1';
  const root = document.getElementById('app');

  const PROCEDURE_BY_ID = Object.fromEntries(
    DATA.procedures.map((item) => [item.id, item]),
  );

  const ITEMS = [
    ...DATA.procedures.map((item) => ({
      ...item,
      kind: 'procedure',
      unitLabel: `U${item.unit}`,
    })),
    ...DATA.microSkills.map((item) => {
      const units = item.usedBy
        .map((procedureId) => PROCEDURE_BY_ID[procedureId]?.unit)
        .filter(Boolean);

      const unit = units.length ? Math.min(...units) : 0;

      return {
        ...item,
        kind: 'micro-skill',
        unit,
        unitLabel: unit ? `U${unit}` : 'Core',
      };
    }),
  ];

  const ITEM_BY_ID = Object.fromEntries(ITEMS.map((item) => [item.id, item]));
  const SCREEN_BY_ID = Object.fromEntries(DATA.screens.map((screen) => [screen.id, screen]));

  const BUTTONS = [
    ['Y_EQUALS', 'WINDOW', 'ZOOM', 'TRACE', 'GRAPH'],
    ['2ND', 'MODE', 'DEL', null, null],
    ['ALPHA', 'X_T', 'STAT', null, null],
    ['MATH', 'APPS', 'PRGM', 'VARS', 'CLEAR'],
    [null, 'UP', null, null, null],
    ['LEFT', null, 'RIGHT', null, 'ENTER'],
    [null, 'DOWN', null, null, null],
    ['X_INVERSE', 'SIN', 'COS', 'TAN', 'POWER'],
    ['SQUARED', 'COMMA', 'LPAREN', 'RPAREN', 'DIVIDE'],
    ['LOG', 'SEVEN', 'EIGHT', 'NINE', 'MULTIPLY'],
    ['LN', 'FOUR', 'FIVE', 'SIX', 'MINUS'],
    ['STO', 'ONE', 'TWO', 'THREE', 'PLUS'],
    ['ON', 'ZERO', 'DECIMAL', 'NEGATIVE', null],
  ];

  const BUTTON_META = {
    Y_EQUALS: { label: 'Y=', color: 'blue', secondary: 'STAT PLOT' },
    WINDOW: { label: 'WINDOW', color: 'blue', secondary: 'TBLSET' },
    ZOOM: { label: 'ZOOM', color: 'blue', secondary: 'FORMAT' },
    TRACE: { label: 'TRACE', color: 'blue', secondary: 'CALC' },
    GRAPH: { label: 'GRAPH', color: 'blue', secondary: 'TABLE' },
    '2ND': { label: '2ND', color: 'yellow' },
    MODE: { label: 'MODE', color: 'gray', secondary: 'QUIT' },
    DEL: { label: 'DEL', color: 'gray', secondary: 'INS' },
    ALPHA: { label: 'ALPHA', color: 'green' },
    X_T: { label: 'X,T,θ,n', color: 'black' },
    STAT: { label: 'STAT', color: 'blue', secondary: 'LIST' },
    MATH: { label: 'MATH', color: 'black', secondary: 'TEST' },
    APPS: { label: 'APPS', color: 'black', secondary: 'ANGLE' },
    PRGM: { label: 'PRGM', color: 'black', secondary: 'DRAW' },
    VARS: { label: 'VARS', color: 'black', secondary: 'DISTR' },
    CLEAR: { label: 'CLEAR', color: 'blue', secondary: 'CLRTBL' },
    UP: { label: '▲', color: 'gray' },
    LEFT: { label: '◄', color: 'gray' },
    RIGHT: { label: '►', color: 'gray' },
    DOWN: { label: '▼', color: 'gray' },
    ENTER: { label: 'ENTER', color: 'blue', secondary: 'ENTRY', tall: true },
    X_INVERSE: { label: 'x^-1', color: 'gray', secondary: 'MATRIX', alpha: 'D' },
    SIN: { label: 'SIN', color: 'gray' },
    COS: { label: 'COS', color: 'gray' },
    TAN: { label: 'TAN', color: 'gray' },
    POWER: { label: '^', color: 'gray' },
    SQUARED: { label: 'x^2', color: 'gray' },
    COMMA: { label: ',', color: 'gray' },
    LPAREN: { label: '(', color: 'gray' },
    RPAREN: { label: ')', color: 'gray' },
    DIVIDE: { label: '÷', color: 'gray' },
    LOG: { label: 'LOG', color: 'gray' },
    SEVEN: { label: '7', color: 'gray', secondary: 'u' },
    EIGHT: { label: '8', color: 'gray', secondary: 'v' },
    NINE: { label: '9', color: 'gray', secondary: 'w' },
    MULTIPLY: { label: '×', color: 'gray' },
    LN: { label: 'LN', color: 'gray' },
    FOUR: { label: '4', color: 'gray', secondary: 'L4' },
    FIVE: { label: '5', color: 'gray', secondary: 'L5' },
    SIX: { label: '6', color: 'gray', secondary: 'L6' },
    MINUS: { label: '−', color: 'gray' },
    STO: { label: 'STO→', color: 'gray' },
    ONE: { label: '1', color: 'gray', secondary: 'L1' },
    TWO: { label: '2', color: 'gray', secondary: 'L2' },
    THREE: { label: '3', color: 'gray', secondary: 'L3' },
    PLUS: { label: '+', color: 'gray' },
    ON: { label: 'ON', color: 'black', secondary: 'OFF' },
    ZERO: { label: '0', color: 'gray', secondary: 'CATALOG' },
    DECIMAL: { label: '.', color: 'gray' },
    NEGATIVE: { label: '(-)', color: 'gray' },
  };

  const BUTTON_TO_ENGINE = {
    Y_EQUALS: 'Y_EQUALS',
    ZOOM: 'ZOOM',
    TRACE: 'TRACE',
    '2ND': '2ND',
    STAT: 'STAT',
    VARS: 'VARS',
    CLEAR: 'CLEAR',
    UP: 'UP',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    DOWN: 'DOWN',
    ENTER: 'ENTER',
    X_INVERSE: 'X_INVERSE',
    COMMA: ',',
    LPAREN: '(',
    RPAREN: ')',
    ZERO: '0',
    ONE: '1',
    TWO: '2',
    THREE: '3',
    FOUR: '4',
    FIVE: '5',
    SIX: '6',
    SEVEN: '7',
    EIGHT: '8',
    NINE: '9',
    DECIMAL: '.',
    NEGATIVE: '(-)',
  };

  const ENGINE_TO_BUTTON = {
    Y_EQUALS: 'Y_EQUALS',
    ZOOM: 'ZOOM',
    TRACE: 'TRACE',
    '2ND': '2ND',
    STAT: 'STAT',
    VARS: 'VARS',
    CLEAR: 'CLEAR',
    UP: 'UP',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    DOWN: 'DOWN',
    ENTER: 'ENTER',
    X_INVERSE: 'X_INVERSE',
    ',': 'COMMA',
    '(': 'LPAREN',
    ')': 'RPAREN',
    '0': 'ZERO',
    '1': 'ONE',
    '2': 'TWO',
    '3': 'THREE',
    '4': 'FOUR',
    '5': 'FIVE',
    '6': 'SIX',
    '7': 'SEVEN',
    '8': 'EIGHT',
    '9': 'NINE',
    '.': 'DECIMAL',
    '(-)': 'NEGATIVE',
  };

  const PARAMETER_INPUT_KEYS = new Set([
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '.',
    '(-)',
    ',',
    '(',
    ')',
  ]);

  const PARAMETER_SAMPLES = {
    value: '12',
    'x value': '4',
    'y value': '9',
    x: '64',
    n: '100',
    p0: '.5',
    p: '.64',
    'C-Level': '.95',
    'lower bound': '-1',
    lower: '-1',
    upper: '1',
    'upper bound': '1',
    area: '.9',
    df: '18',
    rows: '3',
    cols: '2',
    'cell value': '5',
    numtrials: '10',
    trials: '10',
    'μ': '0',
    'μ0': '0',
    'σ': '1',
    'Sx': '2.4',
    'Sx1': '2.1',
    'Sx2': '1.8',
    'x̄': '12.3',
    'x̄1': '12.4',
    'x̄2': '10.8',
    n1: '40',
    n2: '35',
    'sampling mean': '52',
    'SE = σ/√n': '2.5',
  };

  const RESULT_VALUES = {
    'x̄': '12.4',
    'Σx': '62',
    'Σx²': '812',
    Sx: '2.3',
    'σx': '2.1',
    n: '5',
    minX: '4',
    Q1: '7',
    Med: '12',
    Q3: '16',
    maxX: '23',
    a: '1.7',
    b: '0.92',
    r: '0.84',
    'r²': '0.71',
    'r^2': '0.71',
    z: '2.80',
    p: '.0051',
    'p̂': '.64',
    prop: '.64',
    lower: '.54',
    upper: '.73',
    t: '2.18',
    df: '18',
    mean: '14.2',
    'μ': '0',
    'μ0': '0',
    'χ²': '4.73',
    'χ2': '4.73',
    slope: '0.92',
    intercept: '1.7',
  };

  const app = {
    persisted: loadPersisted(),
    filterUnit: 'all',
    currentItemId: null,
    currentMode: null,
    calcState: createState('home'),
    feedback: 'Select a procedure from the dashboard to start a guided walkthrough.',
    flashKeyId: null,
    flashKind: null,
    errors: 0,
    hints: 0,
    hintVisible: false,
    completion: null,
  };

  app.filterUnit = app.persisted.filterUnit ?? 'all';

  function loadPersisted() {
    const fallback = {
      version: 1,
      filterUnit: 'all',
      records: {},
    };

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);

      return {
        ...fallback,
        ...parsed,
        records: parsed.records ?? {},
      };
    } catch (error) {
      console.warn('Failed to load trainer state.', error);
      return fallback;
    }
  }

  function savePersisted() {
    app.persisted.filterUnit = app.filterUnit;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(app.persisted));
  }

  function todayIso() {
    return formatDate(new Date());
  }

  function startOfDay(input) {
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [year, month, day] = input.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    const value = new Date(input);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function diffDays(left, right) {
    return Math.round((left.getTime() - right.getTime()) / 86400000);
  }

  function getRecord(itemId) {
    return app.persisted.records[itemId] ?? null;
  }

  function ensureRecord(itemId) {
    if (!app.persisted.records[itemId]) {
      app.persisted.records[itemId] = {
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        lastReview: null,
        nextReview: null,
        mode: 'guided',
        guidedPasses: 0,
        lastQuality: null,
        lastErrors: 0,
        lastHints: 0,
      };
    }

    return app.persisted.records[itemId];
  }

  function matchesFilter(item) {
    if (app.filterUnit === 'all') {
      return true;
    }

    return String(item.unit) === app.filterUnit;
  }

  function isDue(record) {
    if (!record?.nextReview) {
      return false;
    }

    return startOfDay(record.nextReview) <= startOfDay(new Date());
  }

  function overdueDays(record) {
    if (!record?.nextReview) {
      return -1;
    }

    return diffDays(startOfDay(new Date()), startOfDay(record.nextReview));
  }

  function masteryForRecord(record) {
    if (!record) {
      return 0;
    }

    if (record.mode === 'guided') {
      return record.guidedPasses ? 0.32 : 0.16;
    }

    return Math.min(1, 0.42 + record.repetitions * 0.17 + Math.min(record.interval, 21) * 0.02);
  }

  function overallMastery(filteredItems) {
    if (!filteredItems.length) {
      return 0;
    }

    const total = filteredItems.reduce((sum, item) => sum + masteryForRecord(getRecord(item.id)), 0);
    return Math.round((total / filteredItems.length) * 100);
  }

  function interleaveByUnit(items) {
    const buckets = new Map();

    items.forEach((item) => {
      const key = item.unitLabel;

      if (!buckets.has(key)) {
        buckets.set(key, []);
      }

      buckets.get(key).push(item);
    });

    const keys = [...buckets.keys()].sort((left, right) => {
      const leftValue = left === 'Core' ? 0 : Number(left.slice(1));
      const rightValue = right === 'Core' ? 0 : Number(right.slice(1));
      return leftValue - rightValue;
    });

    const result = [];
    let advanced = true;

    while (advanced) {
      advanced = false;

      keys.forEach((key) => {
        const bucket = buckets.get(key);

        if (bucket && bucket.length) {
          result.push(bucket.shift());
          advanced = true;
        }
      });
    }

    return result;
  }

  function sessionSnapshot() {
    const filtered = ITEMS.filter(matchesFilter);
    const overdue = interleaveByUnit(
      filtered
        .filter((item) => isDue(getRecord(item.id)))
        .sort((left, right) => overdueDays(getRecord(right.id)) - overdueDays(getRecord(left.id))),
    );
    const newItems = interleaveByUnit(filtered.filter((item) => !getRecord(item.id)));
    const queue = [];
    let freshIndex = 0;

    overdue.forEach((item, index) => {
      queue.push(item);

      if ((index + 1) % 3 === 0 && freshIndex < 2 && newItems[freshIndex]) {
        queue.push(newItems[freshIndex]);
        freshIndex += 1;
      }
    });

    while (!queue.length || (queue.length < 6 && freshIndex < 2 && newItems[freshIndex])) {
      queue.push(newItems[freshIndex]);
      freshIndex += 1;
    }

    return {
      filtered,
      overdueCount: overdue.length,
      newCount: newItems.length,
      mastery: overallMastery(filtered),
      queue,
    };
  }

  function currentItem() {
    return app.currentItemId ? ITEM_BY_ID[app.currentItemId] : null;
  }

  function currentStep() {
    const item = currentItem();

    if (!item) {
      return null;
    }

    return item.steps[app.calcState.routeIndex] ?? null;
  }

  function stepCount() {
    const item = currentItem();
    return item ? item.steps.length : 0;
  }

  function progressPercent() {
    const total = stepCount();

    if (!total) {
      return 0;
    }

    return Math.min(100, Math.round((app.calcState.routeIndex / total) * 100));
  }

  function stepIsParameter(step) {
    return Boolean(step && /^\{.+\}$/.test(step.key));
  }

  function normalizeStepKey(key) {
    if (key === 'Y=') {
      return 'Y_EQUALS';
    }

    return key;
  }

  function displayKey(key) {
    if (stepIsParameter({ key })) {
      return 'number key';
    }

    const buttonId = ENGINE_TO_BUTTON[normalizeStepKey(key)] ?? normalizeStepKey(key);
    const meta = BUTTON_META[buttonId];

    return meta ? meta.label : key;
  }

  function sampleValueForToken(step) {
    const token = step.key.slice(1, -1);
    return PARAMETER_SAMPLES[token] ?? PARAMETER_SAMPLES[token.toLowerCase()] ?? '1';
  }

  function sampleEntriesForItem(item) {
    const seen = new Set();
    const pairs = [];

    item.steps.forEach((step) => {
      if (!stepIsParameter(step)) {
        return;
      }

      const token = step.key.slice(1, -1);

      if (seen.has(token)) {
        return;
      }

      seen.add(token);
      pairs.push(`${token}=${sampleValueForToken(step)}`);
    });

    return pairs;
  }

  function buildRecallPrompt(item) {
    const samples = sampleEntriesForItem(item);
    const suffix = samples.length ? ` Sample entries: ${samples.join(', ')}.` : '';

    return `Recall drill: ${item.name}. ${item.description}${suffix}`;
  }

  function genericWrongFeedback(step) {
    if (stepIsParameter(step)) {
      const token = step.key.slice(1, -1);
      return `That will not fill ${token}. In V1, any numeric key stands in for the full value entry.`;
    }

    return `That is not the right key. Try [${displayKey(step.key)}].`;
  }

  function wrongFeedback(step, buttonId, engineKey) {
    const keyOptions = new Set([
      buttonId,
      engineKey,
      BUTTON_META[buttonId]?.label,
    ]);

    const match = (step.commonErrors ?? []).find((error) => {
      const normalized = normalizeStepKey(error.key);
      return keyOptions.has(normalized) || keyOptions.has(error.key);
    });

    return match?.feedback ?? genericWrongFeedback(step);
  }

  function makeRouteFallback(step) {
    const next = createState(step.screen);

    next.routeId = app.calcState.routeId;
    next.routeIndex = app.calcState.routeIndex + 1;

    return next;
  }

  function applyParameterStep(step) {
    const structuralBase = JSON.parse(JSON.stringify(app.calcState));

    structuralBase.routeId = null;
    structuralBase.routeIndex = 0;

    const sample = sampleValueForToken(step);
    const structuralNext = transition(structuralBase, `{${sample}}`);
    const next = structuralNext ?? createState(step.screen);

    next.routeId = app.calcState.routeId;
    next.routeIndex = app.calcState.routeIndex + 1;

    return next;
  }

  function startItem(item, mode) {
    const record = getRecord(item.id);

    app.currentItemId = item.id;
    app.currentMode = mode ?? record?.mode ?? 'guided';
    app.calcState = createRouteState(item.id);
    app.feedback = app.currentMode === 'guided'
      ? 'Follow the highlighted key and watch the screen update.'
      : buildRecallPrompt(item);
    app.flashKeyId = null;
    app.flashKind = null;
    app.errors = 0;
    app.hints = 0;
    app.hintVisible = false;
    app.completion = null;
    render();
  }

  function flashButton(buttonId, kind) {
    app.flashKeyId = buttonId;
    app.flashKind = kind;

    window.setTimeout(() => {
      if (app.flashKeyId === buttonId) {
        app.flashKeyId = null;
        app.flashKind = null;
        render();
      }
    }, 240);
  }

  function completeCurrentItem() {
    const item = currentItem();
    const record = ensureRecord(item.id);
    const reviewDate = todayIso();
    let summary;

    if (app.currentMode === 'guided') {
      record.guidedPasses += 1;
      record.lastReview = reviewDate;
      record.nextReview = reviewDate;
      record.lastQuality = 4;
      record.lastErrors = 0;
      record.lastHints = 0;
      record.mode = 'recall';
      summary = {
        headline: `${item.name} learned`,
        detail: 'Guided walkthrough complete. This item is now promoted to recall.',
      };
    } else {
      const quality = recallQuality(app.errors, app.hints);
      sm2(quality, record);
      record.lastReview = reviewDate;
      record.lastQuality = quality;
      record.lastErrors = app.errors;
      record.lastHints = app.hints;

      if (app.errors >= 3 || app.hints >= 2) {
        record.mode = 'guided';
        record.interval = 0;
        record.nextReview = reviewDate;
        summary = {
          headline: `${item.name} needs review`,
          detail: 'Too many misses. The item moves back to guided mode for the next pass.',
        };
      } else {
        record.mode = 'recall';
        summary = {
          headline: `${item.name} scheduled`,
          detail: `Recall complete with quality ${quality}. Next review on ${record.nextReview}.`,
        };
      }
    }

    savePersisted();
    app.completion = summary;
    app.feedback = summary.detail;
    render();
  }

  function recallQuality(errors, hints) {
    if (hints >= 2) {
      return 0;
    }

    if (errors >= 3) {
      return 1;
    }

    if (errors >= 2 || hints === 1) {
      return 3;
    }

    if (errors === 1) {
      return 4;
    }

    return 5;
  }

  function sm2(quality, item) {
    if (quality >= 3) {
      if (item.repetitions === 0) {
        item.interval = 1;
      } else if (item.repetitions === 1) {
        item.interval = 6;
      } else {
        item.interval = Math.round(item.interval * item.easeFactor);
      }

      item.repetitions += 1;
    } else {
      item.repetitions = 0;
      item.interval = 1;
    }

    item.easeFactor = Math.max(
      1.3,
      item.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    );
    item.nextReview = formatDate(addDays(startOfDay(new Date()), item.interval));
  }

  function pressButton(buttonId) {
    const item = currentItem();
    const step = currentStep();

    if (!item || !step || app.completion) {
      return;
    }

    const engineKey = BUTTON_TO_ENGINE[buttonId] ?? buttonId;
    const isCorrect = stepIsParameter(step)
      ? PARAMETER_INPUT_KEYS.has(engineKey)
      : normalizeStepKey(step.key) === engineKey;

    if (!isCorrect) {
      if (app.currentMode === 'recall') {
        app.errors += 1;
      }

      app.hintVisible = false;
      app.feedback = wrongFeedback(step, buttonId, engineKey);
      flashButton(buttonId, 'wrong');
      render();
      return;
    }

    const nextState = stepIsParameter(step)
      ? applyParameterStep(step)
      : transition(app.calcState, normalizeStepKey(step.key)) ?? makeRouteFallback(step);

    app.calcState = nextState;
    app.hintVisible = false;
    app.feedback = app.currentMode === 'guided'
      ? 'Good. Keep moving through the route.'
      : 'Correct. Continue from memory.';
    flashButton(buttonId, 'correct');

    if (app.calcState.routeIndex >= item.steps.length) {
      completeCurrentItem();
      return;
    }

    render();
  }

  function showHint() {
    const step = currentStep();

    if (!step || app.currentMode !== 'recall' || app.completion) {
      return;
    }

    app.hints += 1;
    app.errors += 1;
    app.hintVisible = true;

    if (stepIsParameter(step)) {
      const token = step.key.slice(1, -1);
      app.feedback = `Hint: enter the sample value for ${token}. In V1, any numeric key will do.`;
    } else {
      app.feedback = `Hint: press [${displayKey(step.key)}].`;
    }

    render();
  }

  function restartCurrent() {
    const item = currentItem();

    if (!item) {
      return;
    }

    startItem(item, app.currentMode);
  }

  function startNextSuggested() {
    const queue = sessionSnapshot().queue.filter((item) => item.id !== app.currentItemId);

    if (queue[0]) {
      startItem(queue[0]);
    }
  }

  function exportProgress() {
    const payload = {
      exportedAt: new Date().toISOString(),
      state: app.persisted,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = 'ti84-trainer-progress.json';
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function importProgress(file) {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        app.persisted = {
          version: 1,
          filterUnit: parsed.state?.filterUnit ?? 'all',
          records: parsed.state?.records ?? {},
        };
        app.filterUnit = app.persisted.filterUnit;
        savePersisted();
        app.feedback = 'Progress imported.';
        render();
      } catch (error) {
        app.feedback = 'Import failed. The file was not valid trainer progress JSON.';
        render();
      }
    };

    reader.readAsText(file);
  }

  function renderProgressText() {
    const total = stepCount();

    if (!currentItem()) {
      return 'Step 0 of 0';
    }

    if (app.completion) {
      return `Complete. ${total} steps finished.`;
    }

    return `Step ${Math.min(app.calcState.routeIndex + 1, total)} of ${total}`;
  }

  function statusTextForItem(item) {
    const record = getRecord(item.id);

    if (!record) {
      return 'New';
    }

    if (isDue(record)) {
      return `${record.mode === 'guided' ? 'Guided' : 'Recall'} due`;
    }

    return `Next ${record.nextReview}`;
  }

  function suggestedButtons(step) {
    if (!step) {
      return new Set();
    }

    if (stepIsParameter(step)) {
      return new Set(['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'DECIMAL']);
    }

    const expected = ENGINE_TO_BUTTON[normalizeStepKey(step.key)];
    return new Set(expected ? [expected] : []);
  }

  function renderKeypad() {
    const step = currentStep();
    const suggestions = suggestedButtons(step);
    const showGuidedAssist = app.currentMode === 'guided' || (app.currentMode === 'recall' && app.hintVisible);

    return BUTTONS.map((row, rowIndex) =>
      row
        .map((buttonId, columnIndex) => {
          if (!buttonId) {
            return `<div class="key-gap" style="grid-row:${rowIndex + 1};grid-column:${columnIndex + 1};"></div>`;
          }

          const meta = BUTTON_META[buttonId];
          const suggested = showGuidedAssist && suggestions.has(buttonId);
          const flash = app.flashKeyId === buttonId ? ` flash-${app.flashKind}` : '';
          const dimmed = showGuidedAssist && suggestions.size && !suggested ? ' dimmed' : '';
          const active = buttonId === '2ND' && app.calcState.secondActive ? ' active' : '';
          const tall = meta.tall ? ' tall' : '';
          const secondary = meta.secondary ? `<span class="key-secondary">${meta.secondary}</span>` : '';
          const alpha = meta.alpha ? `<span class="key-alpha">${meta.alpha}</span>` : '';

          return `
            <button
              type="button"
              class="key key-${meta.color}${suggested ? ' suggested' : ''}${flash}${dimmed}${active}${tall}"
              data-key="${buttonId}"
              style="grid-row:${rowIndex + 1}${meta.tall ? ' / span 2' : ''};grid-column:${columnIndex + 1};"
              aria-label="${meta.label}"
            >
              ${secondary}
              ${alpha}
              <span class="key-label">${meta.label}</span>
            </button>
          `;
        })
        .join('')
    ).join('');
  }

  function formatResultLine(line, state) {
    if (!line.includes('{value}')) {
      if (line === 'command(...)') {
        return state.id === 'distribution-home-result' ? 'normalcdf(-1,1,0,1)' : line;
      }

      return line;
    }

    const label = line.split('=')[0].replace('{value}', '').trim().replace(/:$/, '');
    const mapped = RESULT_VALUES[label] ?? RESULT_VALUES[label.replace(/\s+/g, '')] ?? '0.9044';

    return line.replace('{value}', mapped);
  }

  function titleForScreen(state) {
    const item = currentItem();

    if (state.title) {
      return state.title;
    }

    if (item) {
      return item.name;
    }

    return 'HOME';
  }

  function renderHome(state) {
    const cursorLine = app.currentItemId ? 'Ready for the next key.' : 'Select a route to begin.';
    const secondBadge = state.secondActive ? '<span class="screen-badge">2ND</span>' : '';

    return `
      <div class="screen-status">
        <span>NORMAL FLOAT AUTO</span>
        ${secondBadge}
      </div>
      <div class="screen-lines">
        <div class="screen-line">${cursorLine}</div>
        <div class="screen-line muted">${app.feedback}</div>
        <div class="screen-line cursor-line">_</div>
      </div>
    `;
  }

  function renderMenu(state) {
    const lines = state.items.map((item, index) => {
      const selected = index === state.cursorIndex ? ' selected' : '';
      const prefix = index === state.cursorIndex ? '▶ ' : '&nbsp;&nbsp;';
      return `<div class="screen-line menu-line${selected}">${prefix}${item}</div>`;
    }).join('');
    const tabs = (state.tabs ?? []).map((tab) => {
      const active = tab === state.activeTab ? ' active' : '';
      return `<span class="tab${active}">${tab}</span>`;
    }).join('');

    return `
      <div class="screen-tabs">${tabs}</div>
      <div class="screen-lines">${lines}</div>
    `;
  }

  function renderWizard(state) {
    const title = titleForScreen(state);
    const actionFields = state.fields.filter((field) => field.type === 'action-button');
    const contentFields = state.fields.filter((field) => field.type !== 'action-button');
    const lines = contentFields.map((field, index) => {
      const selected = index === state.activeField ? ' selected' : '';
      let value = field.value;

      if (field.type === 'choice') {
        value = value || field.options?.[0] || '';
      }

      return `
        <div class="screen-line field-line${selected}">
          <span class="field-label">${field.label}</span>
          <span class="field-value">${value ?? ''}</span>
        </div>
      `;
    }).join('');
    const actions = actionFields.length
      ? `
        <div class="action-row">
          ${actionFields.map((field) => {
            const index = state.fields.findIndex((candidate) => candidate.label === field.label);
            const selected = index === state.activeField ? ' selected' : '';
            return `<span class="action-pill${selected}">${field.label}</span>`;
          }).join('')}
        </div>
      `
      : '';

    return `
      <div class="screen-title-line">${title}</div>
      <div class="screen-lines">${lines}</div>
      ${actions}
    `;
  }

  function renderFieldEditor(state) {
    const lines = state.fields.map((field, index) => {
      const selected = index === state.activeField ? ' selected' : '';
      return `
        <div class="screen-line field-line${selected}">
          <span class="field-label">${field.label}</span>
          <span class="field-value">${field.value ?? ''}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="screen-title-line">${titleForScreen(state)}</div>
      <div class="screen-lines">${lines}</div>
    `;
  }

  function renderListEditor(state) {
    const headers = state.columns.map((column, index) => {
      const selected = state.onHeader && index === state.editorColumn ? ' selected' : '';
      return `<span class="grid-cell header${selected}">${column}</span>`;
    }).join('');
    const rows = Array.from({ length: 4 }, (_, rowIndex) => {
      const cells = state.columns.map((column, columnIndex) => {
        const selected = !state.onHeader
          && rowIndex === Math.min(state.editorRow, 3)
          && columnIndex === state.editorColumn
          ? ' selected'
          : '';
        const value = columnIndex === state.editorColumn && rowIndex === Math.min(state.editorRow, 3)
          ? '▮'
          : '';

        return `<span class="grid-cell${selected}">${value}</span>`;
      }).join('');

      return `<div class="editor-row">${cells}</div>`;
    }).join('');

    return `
      <div class="screen-title-line">STAT EDIT</div>
      <div class="editor-grid">
        <div class="editor-row">${headers}</div>
        ${rows}
      </div>
    `;
  }

  function renderResult(state) {
    const lines = state.lines.map((line) => `<div class="screen-line">${formatResultLine(line, state)}</div>`).join('');

    return `
      <div class="screen-title-line">${titleForScreen(state)}</div>
      <div class="screen-lines">${lines}</div>
    `;
  }

  function graphDotsForState(state) {
    if (state.id.includes('histogram')) {
      return '<span class="graph-bar" style="left:16%;height:28%;"></span><span class="graph-bar" style="left:34%;height:52%;"></span><span class="graph-bar" style="left:52%;height:68%;"></span><span class="graph-bar" style="left:70%;height:34%;"></span>';
    }

    return '<span class="graph-dot" style="left:18%;top:68%;"></span><span class="graph-dot" style="left:36%;top:46%;"></span><span class="graph-dot" style="left:54%;top:40%;"></span><span class="graph-dot" style="left:72%;top:24%;"></span>';
  }

  function renderGraph(state) {
    return `
      <div class="screen-title-line">${titleForScreen(state)}</div>
      <div class="graph-frame">
        <span class="graph-axis x-axis"></span>
        <span class="graph-axis y-axis"></span>
        ${graphDotsForState(state)}
      </div>
      <div class="screen-caption-inline">${state.description}</div>
    `;
  }

  function renderScreen(state) {
    switch (state.type) {
      case 'menu':
        return renderMenu(state);
      case 'wizard':
        return renderWizard(state);
      case 'editor':
        return state.columns ? renderListEditor(state) : renderFieldEditor(state);
      case 'result':
        return renderResult(state);
      case 'graph':
        return renderGraph(state);
      case 'home':
      default:
        return renderHome(state);
    }
  }

  function renderQueueCards(queue) {
    if (!queue.length) {
      return '<p class="empty-copy">No due or new routes in this filter yet.</p>';
    }

    return queue.map((item) => {
      const record = getRecord(item.id);
      const mode = record?.mode ?? 'guided';
      return `
        <button type="button" class="queue-card" data-start="${item.id}">
          <span class="queue-kicker">${item.unitLabel} · ${item.kind}</span>
          <strong>${item.name}</strong>
          <span class="queue-meta">${statusTextForItem(item)} · start in ${mode}</span>
        </button>
      `;
    }).join('');
  }

  function renderLibraryCards(items) {
    const procedures = items.filter((item) => item.kind === 'procedure');

    return procedures.map((item) => `
      <button type="button" class="library-card" data-start-guided="${item.id}">
        <span class="queue-kicker">${item.unitLabel}</span>
        <strong>${item.name}</strong>
        <span>${item.description}</span>
      </button>
    `).join('');
  }

  function renderCoachText() {
    const item = currentItem();
    const step = currentStep();

    if (app.completion) {
      return `
        <h2>${app.completion.headline}</h2>
        <p>${app.completion.detail}</p>
      `;
    }

    if (!item || !step) {
      return `
        <h2>Pick a route</h2>
        <p>Choose a session card or any procedure below to open the guided trainer.</p>
      `;
    }

    if (app.currentMode === 'guided') {
      const parameterNote = stepIsParameter(step)
        ? ' In V1, any numeric key fills the sample value for this field.'
        : '';

      return `
        <h2>${item.name}</h2>
        <p>${step.narration}${parameterNote}</p>
      `;
    }

    return `
      <h2>${item.name}</h2>
      <p>${buildRecallPrompt(item)}</p>
    `;
  }

  function bindEvents() {
    root.querySelectorAll('[data-key]').forEach((button) => {
      button.addEventListener('click', () => pressButton(button.dataset.key));
    });

    root.querySelectorAll('[data-start]').forEach((button) => {
      button.addEventListener('click', () => startItem(ITEM_BY_ID[button.dataset.start]));
    });

    root.querySelectorAll('[data-start-guided]').forEach((button) => {
      button.addEventListener('click', () => startItem(ITEM_BY_ID[button.dataset.startGuided], 'guided'));
    });

    const unitFilter = root.querySelector('#unit-filter');

    if (unitFilter) {
      unitFilter.addEventListener('change', (event) => {
        app.filterUnit = event.target.value;
        savePersisted();
        render();
      });
    }

    const restart = root.querySelector('#restart-route');
    const showHintButton = root.querySelector('#show-hint');
    const startNext = root.querySelector('#start-next');
    const startFirst = root.querySelector('#start-first');
    const exportButton = root.querySelector('#export-progress');
    const importButton = root.querySelector('#import-progress');
    const importInput = root.querySelector('#import-input');

    restart?.addEventListener('click', restartCurrent);
    showHintButton?.addEventListener('click', showHint);
    startNext?.addEventListener('click', startNextSuggested);
    startFirst?.addEventListener('click', () => {
      const queue = sessionSnapshot().queue;

      if (queue[0]) {
        startItem(queue[0]);
      }
    });
    exportButton?.addEventListener('click', exportProgress);
    importButton?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', (event) => {
      const [file] = event.target.files ?? [];

      if (file) {
        importProgress(file);
      }

      event.target.value = '';
    });
  }

  function render() {
    const snapshot = sessionSnapshot();
    const item = currentItem();
    const step = currentStep();
    const currentMode = item ? (app.currentMode === 'guided' ? 'Guided' : 'Recall') : 'Ready';
    const queue = snapshot.queue;
    const filteredUnits = Array.from(new Set(ITEMS.map((candidate) => candidate.unit).filter(Boolean))).sort((a, b) => a - b);

    root.innerHTML = `
      <div class="trainer-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">Offline single-file trainer</p>
            <h1>TI-84 Procedural Trainer</h1>
          </div>
          <div class="topbar-controls">
            <label class="control">
              <span>Unit</span>
              <select id="unit-filter">
                <option value="all"${app.filterUnit === 'all' ? ' selected' : ''}>All units</option>
                ${filteredUnits.map((unit) => `<option value="${unit}"${String(unit) === app.filterUnit ? ' selected' : ''}>U${unit}</option>`).join('')}
              </select>
            </label>
            <div class="pill">
              <span>Mode</span>
              <strong>${currentMode}</strong>
            </div>
            <div class="pill">
              <span>Mastery</span>
              <strong>${snapshot.mastery}%</strong>
            </div>
          </div>
        </header>

        <main class="workspace">
          <section class="panel screen-panel">
            <div class="calculator-shell">
              <div class="screen-bezel">
                <div class="screen">
                  ${renderScreen(app.calcState)}
                </div>
              </div>
              <p class="screen-note">${SCREEN_BY_ID[app.calcState.id]?.description ?? 'Home screen'}</p>
            </div>
          </section>

          <section class="panel keypad-panel">
            <div class="keypad">
              ${renderKeypad()}
            </div>
          </section>
        </main>

        <section class="coach-bar">
          <div class="coach-copy">
            ${renderCoachText()}
            <p class="feedback">${app.feedback}</p>
          </div>
          <div class="coach-controls">
            <div class="progress-copy">
              <span>${renderProgressText()}</span>
              <span>${item ? `${progressPercent()}%` : '0%'}</span>
            </div>
            <div class="progress-track">
              <span class="progress-fill" style="width:${progressPercent()}%;"></span>
            </div>
            <div class="button-row">
              ${app.currentMode === 'recall' && !app.completion ? '<button id="show-hint" type="button">Hint</button>' : ''}
              ${item ? '<button id="restart-route" type="button">Restart</button>' : ''}
              ${app.completion ? '<button id="start-next" type="button">Start next</button>' : ''}
              ${!item && queue[0] ? '<button id="start-first" type="button">Start first due</button>' : ''}
            </div>
            ${app.currentMode === 'recall' && item && !app.completion ? `<p class="score-copy">Errors: ${app.errors} · Hints: ${app.hints}</p>` : ''}
          </div>
        </section>

        <section class="dashboard">
          <article class="dashboard-card">
            <div class="card-header">
              <h2>Session</h2>
              <div class="button-row utility-row">
                <button id="export-progress" type="button">Export</button>
                <button id="import-progress" type="button">Import</button>
              </div>
            </div>
            <div class="metric-grid">
              <div class="metric">
                <span>Due reviews</span>
                <strong>${snapshot.overdueCount}</strong>
              </div>
              <div class="metric">
                <span>New items</span>
                <strong>${snapshot.newCount}</strong>
              </div>
              <div class="metric">
                <span>Routes tracked</span>
                <strong>${snapshot.filtered.length}</strong>
              </div>
            </div>
            <input id="import-input" type="file" accept="application/json" hidden>
          </article>

          <article class="dashboard-card">
            <div class="card-header">
              <h2>Queue</h2>
              <span class="queue-kicker">Due first, then 1-2 fresh routes</span>
            </div>
            <div class="card-stack">
              ${renderQueueCards(queue)}
            </div>
          </article>

          <article class="dashboard-card">
            <div class="card-header">
              <h2>Procedures</h2>
              <span class="queue-kicker">Click any procedure to force guided mode</span>
            </div>
            <div class="card-stack library-grid">
              ${renderLibraryCards(snapshot.filtered)}
            </div>
          </article>
        </section>
      </div>
    `;

    bindEvents();
  }

  render();
}());

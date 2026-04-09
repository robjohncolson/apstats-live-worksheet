(function () {
  function createBackend(options = {}) {
    const bridgeApi = window.TI84V2Bridge;
    const nativeApi = window.TI84Native;

    if (!bridgeApi?.createBridge || !bridgeApi.CHAR_TO_BUTTON || !nativeApi?.create) {
      throw new Error('TI-84 backend dependencies failed to load.');
    }

    const native = nativeApi.create();
    const state = {
      canvas: null,
    };

    const cemu = bridgeApi.createBridge({
      onStatus(status) {
        options.onStatus?.(status);
      },
    });

    function mountCemuCanvas() {
      if (!state.canvas) {
        return;
      }

      cemu.mountCanvas(state.canvas);
    }

    function syncValueToNative(value, options = {}) {
      const input = `${value ?? ''}`.trim();

      if (!input) {
        return false;
      }

      if (options.clearField !== false) {
        native.pressKey('CLEAR');
      }

      for (const char of input) {
        if (char === ' ') {
          continue;
        }

        const buttonId = bridgeApi.CHAR_TO_BUTTON[char];

        if (!buttonId) {
          throw new Error(`Cannot type character "${char}" on the native keypad.`);
        }

        native.pressKey(buttonId);
      }

      return true;
    }

    return {
      async init() {
        await native.init();
        native.reset();
        mountCemuCanvas();
        const ready = await cemu.init();
        options.onStatus?.(cemu.getStatus());
        return ready;
      },

      mountCanvas(canvas) {
        if (!canvas) {
          return;
        }

        state.canvas = canvas;
        mountCemuCanvas();
      },

      async sendButton(buttonId, holdMs) {
        native.pressKey(buttonId);
        await cemu.sendButton(buttonId, holdMs);
        return true;
      },

      async prepareHome() {
        native.reset();
        await cemu.prepareHome();
        return true;
      },

      async typeValue(value) {
        syncValueToNative(value);
        await cemu.typeValue(value);
        return true;
      },

      isRealEmulator() {
        return cemu.isRealEmulator();
      },

      getStatus() {
        return cemu.getStatus();
      },

      getScreen() {
        return native.getScreen();
      },

      getWizardValues() {
        return native.getWizardValues();
      },

      on(event, callback) {
        native.on(event, callback);
      },

      off(event, callback) {
        native.off(event, callback);
      },

      setList(name, data) {
        native.setList(name, data);
      },

      getList(name) {
        return native.getList(name);
      },

      setMatrix(name, data) {
        native.setMatrix(name, data);
      },

      getMatrix(name) {
        return native.getMatrix(name);
      },

      async selectRomFile(file) {
        const ready = await cemu.selectRomFile(file);
        options.onStatus?.(cemu.getStatus());
        return ready;
      },

      async clearStoredRom() {
        native.reset();
        await cemu.clearStoredRom();
        options.onStatus?.(cemu.getStatus());
        return true;
      },

      setMockLines(lines, footer) {
        cemu.setMockLines(lines, footer);
      },

      supportsManualRomSelection() {
        return cemu.supportsManualRomSelection?.() ?? false;
      },

      destroy() {
        native.destroy?.();
        cemu.destroy?.();
      },
    };
  }

  window.TI84V2Backend = {
    createBackend,
  };
}());

(function () {
  const root = document.getElementById('app');

  const proceduresData = window.TI84V2ProceduresData;
  const patternsData = window.TI84V2PatternsData;
  const machine = window.TI84V2Machine;
  const backendApi = window.TI84V2Backend;

  if (!root || !proceduresData || !patternsData || !machine || !backendApi) {
    throw new Error('TI-84 Trainer V3 failed to initialize.');
  }

  const STORAGE_KEY = 'ti84trainer_v2_state';
  const PARAMETER_PATTERN = /^\{.+\}$/;

  const { createState, createRouteState, transition } = machine;
  const { createBackend } = backendApi;

  const PROCEDURES = proceduresData.procedures.filter(
    (procedure) => patternsData.patternSignatures[procedure.id],
  );
  const PROCEDURE_BY_ID = Object.fromEntries(PROCEDURES.map((procedure) => [procedure.id, procedure]));
  const SCREEN_BY_ID = Object.fromEntries(
    proceduresData.screens.map((screen) => [screen.id, screen]),
  );

  const FUNCTION_ROW = ['Y_EQUALS', 'WINDOW', 'ZOOM', 'TRACE', 'GRAPH'];
  const MODIFIER_COLUMN = ['2ND', 'ALPHA'];
  const MODIFIER_GRID = [
    ['MODE', 'DEL'],
    ['X_T', 'STAT'],
  ];
  const MAIN_KEY_ROWS = [
    ['MATH', 'APPS', 'PRGM', 'VARS', 'CLEAR'],
    ['X_INVERSE', 'SIN', 'COS', 'TAN', 'POWER'],
    ['SQUARED', 'COMMA', 'LPAREN', 'RPAREN', 'DIVIDE'],
    ['LOG', 'SEVEN', 'EIGHT', 'NINE', 'MULTIPLY'],
    ['LN', 'FOUR', 'FIVE', 'SIX', 'MINUS'],
    ['STO', 'ONE', 'TWO', 'THREE', 'PLUS'],
    ['ON', 'ZERO', 'DECIMAL', 'NEGATIVE', 'ENTER'],
  ];

  const BUTTON_META = {
    Y_EQUALS: { label: 'y=', color: 'function', secondary: 'stat plot f1' },
    WINDOW: { label: 'window', color: 'function', secondary: 'tblset f2' },
    ZOOM: { label: 'zoom', color: 'function', secondary: 'format f3' },
    TRACE: { label: 'trace', color: 'function', secondary: 'calc f4' },
    GRAPH: { label: 'graph', color: 'function', secondary: 'table f5' },
    '2ND': { label: '2nd', color: 'second' },
    MODE: { label: 'mode', color: 'dark', secondary: 'quit' },
    DEL: { label: 'del', color: 'dark', secondary: 'ins' },
    ALPHA: { label: 'alpha', color: 'alpha', secondary: 'A-lock' },
    X_T: { label: 'x,t,\u03b8,n', color: 'dark', secondary: 'link' },
    STAT: { label: 'stat', color: 'dark', secondary: 'list' },
    MATH: { label: 'math', color: 'dark', secondary: 'test', alpha: 'A' },
    APPS: { label: 'apps', color: 'dark', secondary: 'angle', alpha: 'B' },
    PRGM: { label: 'prgm', color: 'dark', secondary: 'draw', alpha: 'C' },
    VARS: { label: 'vars', color: 'dark', secondary: 'distr' },
    CLEAR: { label: 'clear', color: 'dark' },
    UP: { label: '\u25b2', color: 'dpad' },
    DOWN: { label: '\u25bc', color: 'dpad' },
    LEFT: { label: '\u25c4', color: 'dpad' },
    RIGHT: { label: '\u25ba', color: 'dpad' },
    ENTER: { label: 'enter', color: 'operator', secondary: 'entry solve' },
    X_INVERSE: { label: 'x\u207b\u00b9', color: 'dark', secondary: 'matrix', alpha: 'D' },
    SIN: { label: 'sin', color: 'dark', secondary: 'sin\u207b\u00b9', alpha: 'E' },
    COS: { label: 'cos', color: 'dark', secondary: 'cos\u207b\u00b9', alpha: 'F' },
    TAN: { label: 'tan', color: 'dark', secondary: 'tan\u207b\u00b9', alpha: 'G' },
    POWER: { label: '^', color: 'dark', secondary: '\u03c0', alpha: 'H' },
    SQUARED: { label: 'x\u00b2', color: 'dark', secondary: '\u221a', alpha: 'I' },
    COMMA: { label: ',', color: 'dark', secondary: 'EE', alpha: 'J' },
    LPAREN: { label: '(', color: 'dark', secondary: '{', alpha: 'K' },
    RPAREN: { label: ')', color: 'dark', secondary: '}', alpha: 'L' },
    DIVIDE: { label: '\u00f7', color: 'operator', secondary: 'e', alpha: 'M' },
    LOG: { label: 'log', color: 'dark', secondary: '10\u02e3', alpha: 'N' },
    SEVEN: { label: '7', color: 'number', secondary: 'u', alpha: 'O' },
    EIGHT: { label: '8', color: 'number', secondary: 'v', alpha: 'P' },
    NINE: { label: '9', color: 'number', secondary: 'w', alpha: 'Q' },
    MULTIPLY: { label: '\u00d7', color: 'operator', secondary: '[', alpha: 'R' },
    LN: { label: 'ln', color: 'dark', secondary: 'e\u02e3', alpha: 'S' },
    FOUR: { label: '4', color: 'number', secondary: 'L4', alpha: 'T' },
    FIVE: { label: '5', color: 'number', secondary: 'L5', alpha: 'U' },
    SIX: { label: '6', color: 'number', secondary: 'L6', alpha: 'V' },
    MINUS: { label: '\u2212', color: 'operator', secondary: ']', alpha: 'W' },
    STO: { label: 'sto\u2192', color: 'dark', secondary: 'rcl', alpha: 'X' },
    ONE: { label: '1', color: 'number', secondary: 'L1', alpha: 'Y' },
    TWO: { label: '2', color: 'number', secondary: 'L2', alpha: 'Z' },
    THREE: { label: '3', color: 'number', secondary: 'L3', alpha: '\u03b8' },
    PLUS: { label: '+', color: 'operator', secondary: 'mem', alpha: '"' },
    ON: { label: 'on', color: 'dark', secondary: 'off' },
    ZERO: { label: '0', color: 'number', secondary: 'catalog', alpha: '\u2423' },
    DECIMAL: { label: '.', color: 'number', secondary: 'i', alpha: ':' },
    NEGATIVE: { label: '(-)', color: 'number', secondary: 'ans', alpha: '?' },
  };

  const BUTTON_TO_ENGINE = {
    Y_EQUALS: 'Y_EQUALS',
    WINDOW: 'WINDOW',
    ZOOM: 'ZOOM',
    TRACE: 'TRACE',
    GRAPH: 'GRAPH',
    '2ND': '2ND',
    MODE: 'MODE',
    DEL: 'DEL',
    ALPHA: 'ALPHA',
    X_T: 'X_T',
    STAT: 'STAT',
    MATH: 'MATH',
    APPS: 'APPS',
    PRGM: 'PRGM',
    VARS: 'VARS',
    CLEAR: 'CLEAR',
    UP: 'UP',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    DOWN: 'DOWN',
    ENTER: 'ENTER',
    X_INVERSE: 'X_INVERSE',
    SIN: 'SIN',
    COS: 'COS',
    TAN: 'TAN',
    POWER: '^',
    SQUARED: 'SQUARED',
    COMMA: ',',
    LPAREN: '(',
    RPAREN: ')',
    DIVIDE: '/',
    LOG: 'LOG',
    SEVEN: '7',
    EIGHT: '8',
    NINE: '9',
    MULTIPLY: '*',
    LN: 'LN',
    FOUR: '4',
    FIVE: '5',
    SIX: '6',
    MINUS: '-',
    STO: 'STO',
    ONE: '1',
    TWO: '2',
    THREE: '3',
    PLUS: '+',
    ON: 'ON',
    ZERO: '0',
    DECIMAL: '.',
    NEGATIVE: '(-)',
  };

  const ENGINE_TO_BUTTON = {
    Y_EQUALS: 'Y_EQUALS',
    WINDOW: 'WINDOW',
    ZOOM: 'ZOOM',
    TRACE: 'TRACE',
    GRAPH: 'GRAPH',
    MODE: 'MODE',
    DEL: 'DEL',
    ALPHA: 'ALPHA',
    X_T: 'X_T',
    STAT: 'STAT',
    MATH: 'MATH',
    APPS: 'APPS',
    PRGM: 'PRGM',
    VARS: 'VARS',
    CLEAR: 'CLEAR',
    UP: 'UP',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    DOWN: 'DOWN',
    ENTER: 'ENTER',
    X_INVERSE: 'X_INVERSE',
    SIN: 'SIN',
    COS: 'COS',
    TAN: 'TAN',
    '2ND': '2ND',
    SQUARED: 'SQUARED',
    LOG: 'LOG',
    LN: 'LN',
    STO: 'STO',
    ON: 'ON',
    '^': 'POWER',
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
    ',': 'COMMA',
    '(': 'LPAREN',
    ')': 'RPAREN',
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

  const DEFAULT_VALUE_SAMPLES = {
    value: '12',
    'x value': '4',
    'y value': '9',
    x: '64',
    y: '32',
    n: '100',
    n1: '40',
    n2: '35',
    p0: '0.5',
    p: '0.64',
    'C-Level': '0.95',
    'lower bound': '-1',
    'upper bound': '1',
    lower: '-1',
    upper: '1',
    area: '0.9',
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
    'sampling mean': '52',
    'SE = σ/√n': '2.5',
  };

  const TOKEN_ALIASES = {
    p0: ['p0'],
    x: ['x'],
    y: ['y'],
    n: ['n'],
    n1: ['n1'],
    n2: ['n2'],
    p: ['p', 'prop', 'probability'],
    'C-Level': ['C-Level', 'cLevel'],
    'lower bound': ['lower bound', 'lower'],
    'upper bound': ['upper bound', 'upper'],
    area: ['area'],
    df: ['df'],
    rows: ['rows'],
    cols: ['cols'],
    'cell value': ['cell value', 'cell'],
    numtrials: ['numtrials', 'trials'],
    trials: ['trials', 'numtrials'],
    'μ': ['μ', 'mu'],
    'μ0': ['μ0', 'mu0'],
    'σ': ['σ', 'sigma'],
    Sx: ['Sx', 'sx'],
    Sx1: ['Sx1', 'sx1'],
    Sx2: ['Sx2', 'sx2'],
    'x̄': ['x̄', 'xBar', 'mean', 'xbar'],
    'x̄1': ['x̄1', 'xBar1', 'xbar1'],
    'x̄2': ['x̄2', 'xBar2', 'xbar2'],
    'sampling mean': ['sampling mean', 'sampleMean'],
    'SE = σ/√n': ['SE = σ/√n', 'SE', 'se'],
    'x value': ['x value'],
    'y value': ['y value'],
    value: ['value'],
  };

  const UNIT_OPTIONS = ['all', ...new Set(PROCEDURES.map((procedure) => String(procedure.unit)))];

  const app = {
    persisted: loadPersisted(),
    filterUnit: 'all',
    bridge: null,
    bridgeStatus: { code: 'booting', detail: 'Checking calculator firmware…', romMeta: null, usingMock: false },
    canvasEl: null,
    question: null,
    branchIntro: null,
    walkthrough: null,
    sessionResult: null,
    banner: 'The trainer boots the real calculator firmware when it is cached or configured.',
    busy: false,
    flashKeyId: null,
    flashKind: null,
    romDialogOpen: false,
  };

  app.filterUnit = app.persisted.filterUnit ?? 'all';

  function loadPersisted() {
    const fallback = {
      version: 2,
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
      console.warn('Failed to load TI-84 V2 progress.', error);
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

    const date = new Date(input);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
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

  function ensureProcedureRecord(procedureId) {
    if (!app.persisted.records[procedureId]) {
      app.persisted.records[procedureId] = {
        track1: {
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lastReview: null,
          nextReview: null,
          lastQuality: null,
          exposures: 0,
        },
        track2: {
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lastReview: null,
          nextReview: null,
          lastQuality: null,
          guidedPasses: 0,
          mode: 'guided',
          lastErrors: 0,
          lastHints: 0,
        },
      };
    }

    return app.persisted.records[procedureId];
  }

  function getProcedureRecord(procedureId) {
    return app.persisted.records[procedureId] ?? null;
  }

  function matchesFilter(procedure) {
    if (app.filterUnit === 'all') {
      return true;
    }

    return String(procedure.unit) === app.filterUnit;
  }

  function filteredProcedures() {
    return PROCEDURES.filter(matchesFilter);
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

  function hasTrack1History(record) {
    return Boolean(record?.track1?.lastReview);
  }

  function hasTrack2History(record) {
    return Boolean(record?.track2?.lastReview || record?.track2?.guidedPasses);
  }

  function track1Mastery(record) {
    if (!record?.track1) {
      return 0;
    }

    return Math.min(
      1,
      0.22
        + record.track1.repetitions * 0.18
        + Math.min(record.track1.interval, 21) * 0.02
        + Math.min(record.track1.exposures, 4) * 0.04,
    );
  }

  function track2Mastery(record) {
    if (!record?.track2) {
      return 0;
    }

    if (record.track2.mode === 'guided') {
      return record.track2.guidedPasses ? 0.34 : 0.16;
    }

    return Math.min(1, 0.42 + record.track2.repetitions * 0.17 + Math.min(record.track2.interval, 21) * 0.02);
  }

  function combinedMastery(record) {
    return Math.round(((track1Mastery(record) + track2Mastery(record)) / 2) * 100);
  }

  function sessionSnapshot() {
    const procedures = filteredProcedures();
    const dueCount = procedures.filter((procedure) => {
      const record = getProcedureRecord(procedure.id);
      return isDue(record?.track1) || isDue(record?.track2);
    }).length;
    const newCount = procedures.filter((procedure) => !getProcedureRecord(procedure.id)).length;
    const mastery = procedures.length
      ? Math.round(
          procedures.reduce((sum, procedure) => sum + combinedMastery(getProcedureRecord(procedure.id)), 0)
            / procedures.length,
        )
      : 0;

    return {
      procedures,
      dueCount,
      newCount,
      mastery,
    };
  }

  function pickRandom(items) {
    if (!items.length) {
      return null;
    }

    return items[Math.floor(Math.random() * items.length)];
  }

  function shuffle(items) {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const nextIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    }

    return copy;
  }

  function nextQuestionProcedureId() {
    const procedures = filteredProcedures();
    const due = procedures
      .filter((procedure) => isDue(getProcedureRecord(procedure.id)?.track1))
      .sort((left, right) => {
        const leftRecord = getProcedureRecord(left.id)?.track1;
        const rightRecord = getProcedureRecord(right.id)?.track1;
        return overdueDays(rightRecord) - overdueDays(leftRecord);
      });

    if (due.length) {
      return due[0].id;
    }

    const fresh = procedures.filter((procedure) => !hasTrack1History(getProcedureRecord(procedure.id)));

    if (fresh.length) {
      return fresh[0].id;
    }

    const weakest = [...procedures].sort((left, right) => {
      return track1Mastery(getProcedureRecord(left.id)) - track1Mastery(getProcedureRecord(right.id));
    });

    return weakest[0]?.id ?? null;
  }

  function contrastFor(correctId, wrongId) {
    const direct = patternsData.confusionMatrix.find(
      (entry) =>
        (entry.a === correctId && entry.b === wrongId)
        || (entry.a === wrongId && entry.b === correctId),
    );

    if (direct?.contrast) {
      return direct.contrast;
    }

    const signature = patternsData.patternSignatures[correctId];
    const wrongSignature = patternsData.patternSignatures[wrongId];

    if (!signature || !wrongSignature) {
      return 'That choice follows a different AP Stats pattern, so you need to contrast the parameter, structure, and goal.';
    }

    return [
      `${PROCEDURE_BY_ID[correctId].name} is a ${signature.questionType} about ${signature.parameterType}.`,
      `${PROCEDURE_BY_ID[wrongId].name} is a ${wrongSignature.questionType} about ${wrongSignature.parameterType}.`,
    ].join(' ');
  }

  function buildQuestion(procedureId) {
    const canonical = pickRandom(patternsData.canonicalProblems[procedureId] ?? []);
    const distractors = patternsData.distractorSets[procedureId] ?? [];

    return {
      procedureId,
      correctId: procedureId,
      canonical,
      remainingChoices: shuffle([procedureId, ...distractors]),
      branchCount: 0,
      branchHistory: [],
    };
  }

  function startNextQuestion() {
    const procedureId = nextQuestionProcedureId();

    if (!procedureId) {
      app.banner = 'No procedures match the current unit filter.';
      render();
      return;
    }

    app.question = buildQuestion(procedureId);
    app.branchIntro = null;
    app.walkthrough = null;
    app.sessionResult = null;
    app.banner = 'Choose the correct procedure before the walkthrough starts.';
    render();
  }

  // Map menu letter keys to the physical calculator key that produces them.
  // In TI-84 menus, pressing the key with alpha label "C" selects item C:
  const LETTER_TO_PHYSICAL = {
    A: 'MATH', B: 'APPS', C: 'PRGM', D: 'X_INVERSE',
    E: 'SIN', F: 'COS', G: 'TAN', H: 'POWER',
  };

  function normalizeStepKey(key) {
    if (key === 'Y=') {
      return 'Y_EQUALS';
    }

    return key;
  }

  // Resolve which physical button to highlight/accept for a step.
  // For letter keys (A-H), returns the physical key; otherwise returns the step key.
  function resolvePhysicalKey(step) {
    if (step.physicalKey) return step.physicalKey;
    if (LETTER_TO_PHYSICAL[step.key]) return LETTER_TO_PHYSICAL[step.key];
    return normalizeStepKey(step.key);
  }

  function stepIsParameter(step) {
    return Boolean(step?.key && PARAMETER_PATTERN.test(step.key));
  }

  function currentProcedure() {
    return app.walkthrough ? PROCEDURE_BY_ID[app.walkthrough.procedureId] : null;
  }

  function currentStep() {
    if (!app.walkthrough) {
      return null;
    }

    const procedure = currentProcedure();
    return procedure?.steps[app.walkthrough.routeState.routeIndex] ?? null;
  }

  function currentScreen() {
    return app.walkthrough ? SCREEN_BY_ID[app.walkthrough.routeState.id] : null;
  }

  function currentNativeScreen() {
    return app.bridge?.getScreen?.() ?? null;
  }

  function screenTitleFor(screenId) {
    if (!screenId) {
      return null;
    }

    if (screenId === 'home') {
      return 'HOME';
    }

    return SCREEN_BY_ID[screenId]?.title || screenId;
  }

  function displayKey(key) {
    // For letter keys, show the physical key label + the letter
    if (LETTER_TO_PHYSICAL[key]) {
      const physId = LETTER_TO_PHYSICAL[key];
      const physLabel = BUTTON_META[physId]?.label ?? physId;
      return `${physLabel} (${key})`;
    }
    const buttonId = ENGINE_TO_BUTTON[normalizeStepKey(key)] ?? normalizeStepKey(key);
    return BUTTON_META[buttonId]?.label ?? key;
  }

  function sampleValueForToken(token, problemValues = {}) {
    const aliases = TOKEN_ALIASES[token] ?? [token];

    for (const alias of aliases) {
      if (problemValues[alias] !== undefined) {
        return formatCalculatorValue(problemValues[alias]);
      }
    }

    if (token === 'p' && problemValues.x !== undefined && problemValues.n !== undefined) {
      return formatCalculatorValue(problemValues.x / problemValues.n);
    }

    return DEFAULT_VALUE_SAMPLES[token] ?? DEFAULT_VALUE_SAMPLES[token.toLowerCase()] ?? '1';
  }

  function formatCalculatorValue(value) {
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return String(value);
      }

      const rounded = Math.round(value * 10000) / 10000;
      return String(rounded);
    }

    return `${value}`;
  }

  function seedNativeLists(problem, procedure) {
    if (!app.bridge?.setList) {
      return;
    }

    const values = problem?.values ?? {};
    const assumeDataIn = procedure?.assumeDataIn;

    for (const [key, value] of Object.entries(values)) {
      if (/^L\d$/.test(key) && Array.isArray(value)) {
        app.bridge.setList(key, value);
      }
    }

    if (Array.isArray(values.observed)) {
      app.bridge.setList('L1', values.observed);
    }

    if (Array.isArray(values.expected)) {
      app.bridge.setList('L2', values.expected);
    }

    if (Array.isArray(values.expected_proportions) && Number.isFinite(values.n)) {
      app.bridge.setList(
        'L2',
        values.expected_proportions.map((entry) => entry * values.n),
      );
    }

    if (Array.isArray(values.data) && Array.isArray(assumeDataIn)) {
      assumeDataIn.forEach((listName, index) => {
        if (/^L\d$/.test(listName) && Array.isArray(values.data[index])) {
          app.bridge.setList(listName, values.data[index]);
        }
      });
      return;
    }

    if (Array.isArray(values.data) && typeof assumeDataIn === 'string' && /^L\d$/.test(assumeDataIn)) {
      app.bridge.setList(assumeDataIn, values.data);
    }
  }

  function seedNativeMatrices(problem) {
    if (!app.bridge?.setMatrix) {
      return;
    }

    const values = problem?.values ?? {};

    if (Array.isArray(values.matrix)) {
      app.bridge.setMatrix('[A]', values.matrix);
      return;
    }

    if (Array.isArray(values.data) && Array.isArray(values.data[0])) {
      app.bridge.setMatrix('[A]', values.data);
    }
  }

  function routeFallback(step) {
    const next = createState(step.screen);
    next.routeId = app.walkthrough.routeState.routeId;
    next.routeIndex = app.walkthrough.routeState.routeIndex + 1;
    return next;
  }

  function nextRouteState(step) {
    if (!app.walkthrough) {
      return null;
    }

    if (stepIsParameter(step)) {
      return routeFallback(step);
    }

    try {
      const next = transition(app.walkthrough.routeState, normalizeStepKey(step.key)) ?? routeFallback(step);
      next.routeId = app.walkthrough.routeState.routeId;
      next.routeIndex = app.walkthrough.routeState.routeIndex + 1;
      return next;
    } catch (error) {
      console.warn('Falling back to authored screen state.', error);
      return routeFallback(step);
    }
  }

  function guidedSuggestions(step) {
    if (!step) {
      return new Set();
    }

    if (stepIsParameter(step)) {
      return new Set([
        'ZERO',
        'ONE',
        'TWO',
        'THREE',
        'FOUR',
        'FIVE',
        'SIX',
        'SEVEN',
        'EIGHT',
        'NINE',
        'DECIMAL',
        'NEGATIVE',
      ]);
    }

    const physKey = resolvePhysicalKey(step);
    const expected = ENGINE_TO_BUTTON[physKey] ?? physKey;
    return new Set(expected ? [expected] : []);
  }

  function wrongFeedback(step, buttonId) {
    const engineKey = BUTTON_TO_ENGINE[buttonId] ?? buttonId;
    const direct = (step.commonErrors ?? []).find(
      (entry) => normalizeStepKey(entry.key) === engineKey || entry.key === buttonId,
    );

    if (direct?.feedback) {
      return direct.feedback;
    }

    if (stepIsParameter(step)) {
      const token = step.key.slice(1, -1);
      return `That does not complete the ${token} field. Use the numeric cluster so the trainer can fill the authored sample value.`;
    }

    return `Blocked. The next key is [${displayKey(step.key)}].`;
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
    }, 220);
  }

  function walkthroughDataNote(procedure) {
    if (!procedure?.assumeDataIn) {
      return '';
    }

    return ' Sample list data is assumed to already be entered for this walkthrough.';
  }

  function modeForWalkthrough(record, sourceKind, branchCount) {
    if (sourceKind === 'branch') {
      return 'guided';
    }

    if (!record || record.mode === 'guided') {
      return 'guided';
    }

    if (branchCount > 0) {
      return 'guided';
    }

    return 'recall';
  }

  async function startWalkthrough(procedureId, problem, options = {}) {
    const routeState = createRouteState(procedureId);
    const record = ensureProcedureRecord(procedureId).track2;
    const procedure = PROCEDURE_BY_ID[procedureId];

    app.walkthrough = {
      procedureId,
      problem,
      sourceKind: options.sourceKind ?? 'question',
      mode: modeForWalkthrough(record, options.sourceKind ?? 'question', options.branchCount ?? 0),
      routeState,
      errors: 0,
      hints: 0,
      preparing: true,
      completion: null,
      hintVisible: false,
      sourceQuestion: options.sourceQuestion ?? null,
      branchProcedureId: options.branchProcedureId ?? null,
      summaryCopy: '',
    };
    app.branchIntro = null;
    app.sessionResult = null;
    app.busy = true;
    app.banner = 'Resetting the calculator to HOME before the walkthrough starts.';
    render();

    try {
      await app.bridge.prepareHome();
      seedNativeLists(problem, procedure);
      seedNativeMatrices(problem);
    } catch (error) {
      console.warn('Failed to prepare the calculator home screen.', error);
    }

    app.walkthrough.preparing = false;
    app.busy = false;
    app.banner = app.walkthrough.mode === 'guided'
      ? `Follow the highlighted key. Wrong keys are blocked before they reach the calculator.${walkthroughDataNote(procedure)}`
      : `Recall mode is live. Hints count as misses.${walkthroughDataNote(procedure)}`;
    updateMockCanvas();
    render();
  }

  async function handleCorrectChoice() {
    const question = app.question;

    if (!question) {
      return;
    }

    await startWalkthrough(question.correctId, question.canonical, {
      sourceKind: 'question',
      sourceQuestion: question,
      branchCount: question.branchCount,
    });
  }

  function openBranchIntro(procedureId) {
    const question = app.question;

    if (!question) {
      return;
    }

    app.branchIntro = {
      wrongProcedureId: procedureId,
      sourceQuestion: question,
      canonical: pickRandom(patternsData.canonicalProblems[procedureId] ?? []),
      contrast: contrastFor(question.correctId, procedureId),
    };
    app.banner = `That answer would lead to ${PROCEDURE_BY_ID[procedureId].name}.`;
    render();
  }

  async function startBranchWalkthrough() {
    if (!app.branchIntro) {
      return;
    }

    await startWalkthrough(app.branchIntro.wrongProcedureId, app.branchIntro.canonical, {
      sourceKind: 'branch',
      sourceQuestion: app.branchIntro.sourceQuestion,
      branchProcedureId: app.branchIntro.wrongProcedureId,
      branchCount: app.branchIntro.sourceQuestion.branchCount + 1,
    });
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

  function sm2(quality, record) {
    if (quality >= 3) {
      if (record.repetitions === 0) {
        record.interval = 1;
      } else if (record.repetitions === 1) {
        record.interval = 6;
      } else {
        record.interval = Math.round(record.interval * record.easeFactor);
      }

      record.repetitions += 1;
    } else {
      record.repetitions = 0;
      record.interval = 1;
    }

    record.easeFactor = Math.max(
      1.3,
      record.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    );
    record.nextReview = formatDate(addDays(startOfDay(new Date()), record.interval));
  }

  function applyTrack1Outcome(procedureId, quality) {
    const track1 = ensureProcedureRecord(procedureId).track1;
    track1.exposures += 1;
    track1.lastReview = todayIso();
    track1.lastQuality = quality;
    sm2(quality, track1);
  }

  function applyTrack2Outcome(walkthrough) {
    const track2 = ensureProcedureRecord(walkthrough.procedureId).track2;
    const reviewDate = todayIso();

    if (walkthrough.mode === 'guided') {
      track2.guidedPasses += 1;
      track2.lastReview = reviewDate;
      track2.nextReview = reviewDate;
      track2.lastQuality = 4;
      track2.mode = 'recall';
      track2.lastErrors = 0;
      track2.lastHints = 0;
      return {
        headline: `${PROCEDURE_BY_ID[walkthrough.procedureId].name} learned`,
        detail: 'Guided completion recorded. This route is promoted to recall.',
      };
    }

    const quality = recallQuality(walkthrough.errors, walkthrough.hints);
    sm2(quality, track2);
    track2.lastReview = reviewDate;
    track2.lastQuality = quality;
    track2.lastErrors = walkthrough.errors;
    track2.lastHints = walkthrough.hints;

    if (walkthrough.errors >= 3 || walkthrough.hints >= 2) {
      track2.mode = 'guided';
      track2.interval = 0;
      track2.nextReview = reviewDate;
      return {
        headline: `${PROCEDURE_BY_ID[walkthrough.procedureId].name} demoted`,
        detail: 'Recall was too shaky, so the next pass returns to guided mode.',
      };
    }

    track2.mode = 'recall';
    return {
      headline: `${PROCEDURE_BY_ID[walkthrough.procedureId].name} scheduled`,
      detail: `Recall complete. Next review is ${track2.nextReview}.`,
    };
  }

  function track1QualityForBranches(branchCount) {
    if (branchCount <= 0) {
      return 5;
    }

    if (branchCount === 1) {
      return 3;
    }

    if (branchCount === 2) {
      return 1;
    }

    return 0;
  }

  function completeWalkthrough() {
    const walkthrough = app.walkthrough;

    if (!walkthrough) {
      return;
    }

    const track2Summary = applyTrack2Outcome(walkthrough);

    if (walkthrough.sourceKind === 'branch') {
      applyTrack1Outcome(walkthrough.procedureId, 2);

      const question = walkthrough.sourceQuestion;
      question.branchCount += 1;
      question.branchHistory.push(walkthrough.procedureId);
      question.remainingChoices = question.remainingChoices.filter(
        (choice) => choice !== walkthrough.procedureId,
      );

      app.walkthrough = null;
      app.branchIntro = null;
      app.banner = `${PROCEDURE_BY_ID[walkthrough.procedureId].name} removed from the choices. Return to the original problem.`;
      app.sessionResult = {
        headline: 'Branch complete',
        detail: `${track2Summary.detail} The original problem is back with one fewer distractor.`,
        actionLabel: 'Return to question',
        action: 'return-question',
      };
      savePersisted();
      render();
      return;
    }

    const branchCount = walkthrough.sourceQuestion?.branchCount ?? 0;
    const track1Quality = track1QualityForBranches(branchCount);
    applyTrack1Outcome(walkthrough.procedureId, track1Quality);

    app.question = null;
    app.walkthrough = null;
    app.branchIntro = null;
    app.sessionResult = {
      headline: `${PROCEDURE_BY_ID[walkthrough.procedureId].name} complete`,
      detail: `${track2Summary.detail} Track 1 quality: ${track1Quality}.`,
      actionLabel: 'Next item',
      action: 'next-item',
    };
    app.banner = 'The walkthrough finished. Start the next scheduled item when ready.';
    savePersisted();
    render();
  }

  async function pressButton(buttonId) {
    if (!app.walkthrough || app.walkthrough.preparing || app.walkthrough.completion || app.busy) {
      return;
    }

    const step = currentStep();

    if (!step) {
      return;
    }

    const engineKey = BUTTON_TO_ENGINE[buttonId] ?? buttonId;
    const physKey = resolvePhysicalKey(step);
    const correct = stepIsParameter(step)
      ? PARAMETER_INPUT_KEYS.has(engineKey)
      : normalizeStepKey(step.key) === engineKey || physKey === engineKey || physKey === buttonId;

    if (!correct) {
      if (app.walkthrough.mode === 'recall') {
        app.walkthrough.errors += 1;
      }

      app.walkthrough.hintVisible = false;
      app.banner = wrongFeedback(step, buttonId);
      flashButton(buttonId, 'wrong');
      render();
      return;
    }

    app.busy = true;

    try {
      if (stepIsParameter(step)) {
        const token = step.key.slice(1, -1);
        const value = sampleValueForToken(token, app.walkthrough.problem?.values ?? {});
        await app.bridge.typeValue(value);
        app.banner = `Filled ${token} with ${value}.`;
      } else {
        await app.bridge.sendButton(buttonId);
        app.banner = app.walkthrough.mode === 'guided'
          ? 'Correct. Continue with the next step.'
          : 'Correct. Keep going from memory.';
      }

      app.walkthrough.routeState = nextRouteState(step);
      app.walkthrough.hintVisible = false;
      flashButton(buttonId, 'correct');

      if (app.walkthrough.routeState.routeIndex >= currentProcedure().steps.length) {
        completeWalkthrough();
        return;
      }
    } catch (error) {
      app.banner = error.message;
    } finally {
      app.busy = false;
      updateMockCanvas();
      render();
    }
  }

  function showHint() {
    if (!app.walkthrough || app.walkthrough.mode !== 'recall' || app.walkthrough.preparing) {
      return;
    }

    const step = currentStep();

    if (!step) {
      return;
    }

    app.walkthrough.hints += 1;
    app.walkthrough.errors += 1;
    app.walkthrough.hintVisible = true;

    if (stepIsParameter(step)) {
      const token = step.key.slice(1, -1);
      const value = sampleValueForToken(token, app.walkthrough.problem?.values ?? {});
      app.banner = `Hint: use the numeric cluster so the trainer can type ${value} into ${token}.`;
    } else {
      app.banner = `Hint: press [${displayKey(step.key)}].`;
    }

    render();
  }

  async function restartWalkthrough() {
    if (!app.walkthrough) {
      return;
    }

    const current = app.walkthrough;

    await startWalkthrough(current.procedureId, current.problem, {
      sourceKind: current.sourceKind,
      sourceQuestion: current.sourceQuestion,
      branchProcedureId: current.branchProcedureId,
      branchCount: current.sourceQuestion?.branchCount ?? 0,
    });
  }

  function choiceLabel(procedureId) {
    return PROCEDURE_BY_ID[procedureId]?.name ?? procedureId;
  }

  function renderValueChips(values) {
    if (!values) {
      return '';
    }

    const entries = Object.entries(values).filter(
      ([key]) => key !== 'frameworkSkill' && key !== 'unit',
    );

    if (!entries.length) {
      return '';
    }

    return `
      <div class="chip-row">
        ${entries
          .map(
            ([key, value]) => `
              <span class="chip">
                <strong>${key}</strong>
                <span>${formatCalculatorValue(value)}</span>
              </span>
            `,
          )
          .join('')}
      </div>
    `;
  }

  function renderQuestionPanel(question) {
    const removed = new Set(question.branchHistory);

    return `
      <section class="panel problem-panel">
        <p class="panel-kicker">Track 1: Pattern Recognition</p>
        <h2>Which TI-84 procedure fits this stem?</h2>
        <p class="problem-stem">${question.canonical?.stem ?? 'No canonical problem was available.'}</p>
        ${renderValueChips(question.canonical?.values)}
        <div class="choice-list">
          ${question.remainingChoices
            .map((choiceId) => {
              const disabled = removed.has(choiceId);
              return `
                <button
                  type="button"
                  class="choice-button${disabled ? ' removed' : ''}"
                  data-action="choose-procedure"
                  data-procedure-id="${choiceId}"
                  ${disabled ? 'disabled' : ''}
                >
                  ${choiceLabel(choiceId)}
                </button>
              `;
            })
            .join('')}
        </div>
        ${question.branchHistory.length
          ? `<p class="panel-note">Already explored: ${question.branchHistory.map(choiceLabel).join(', ')}.</p>`
          : '<p class="panel-note">A wrong choice branches into a full guided walkthrough before this question returns.</p>'}
      </section>
    `;
  }

  function renderBranchIntro(branchIntro) {
    return `
      <section class="panel problem-panel branch-panel">
        <p class="panel-kicker">Branch Walkthrough</p>
        <h2>That choice would be ${choiceLabel(branchIntro.wrongProcedureId)}</h2>
        <p class="problem-stem">${branchIntro.contrast}</p>
        <div class="contrast-card">
          <p class="contrast-label">Canonical problem for ${choiceLabel(branchIntro.wrongProcedureId)}</p>
          <p>${branchIntro.canonical?.stem ?? 'No canonical example was found.'}</p>
          ${renderValueChips(branchIntro.canonical?.values)}
        </div>
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="start-branch">
            Start branch walkthrough
          </button>
          <button type="button" class="mac-button" data-action="cancel-branch">
            Back to choices
          </button>
        </div>
      </section>
    `;
  }

  function renderWalkthroughPanel() {
    const walkthrough = app.walkthrough;
    const procedure = currentProcedure();
    const step = currentStep();
    const stepNumber = walkthrough.routeState.routeIndex + 1;
    const totalSteps = procedure.steps.length;

    return `
      <section class="panel problem-panel walkthrough-panel">
        <div class="compact-problem-bar">
          <div>
            <p class="panel-kicker">Track 2: Calculator Navigation</p>
            <h2>${procedure.name}</h2>
          </div>
          <div class="mode-badge-row">
            <span class="mode-badge">${walkthrough.mode === 'guided' ? 'Guided' : 'Recall'}</span>
            ${walkthrough.sourceKind === 'branch' ? '<span class="mode-badge subtle">Branch</span>' : ''}
          </div>
        </div>
        <p class="problem-stem minimized">${walkthrough.problem?.stem ?? procedure.description}</p>
        ${renderValueChips(walkthrough.problem?.values)}
        <div class="walkthrough-copy">
          <p>${walkthrough.preparing ? 'Resetting the calculator to HOME…' : step?.narration ?? 'Walkthrough complete.'}</p>
          <p class="panel-note">${walkthrough.preparing ? 'The trainer clears back to HOME before the first step.' : `Step ${Math.min(stepNumber, totalSteps)} of ${totalSteps}`}</p>
          ${procedure.assumeDataIn ? '<p class="panel-note">Sample list data is treated as already entered for this walkthrough.</p>' : ''}
        </div>
      </section>
    `;
  }

  function renderSessionResult() {
    if (!app.sessionResult) {
      return '';
    }

    return `
      <section class="panel problem-panel result-panel">
        <p class="panel-kicker">Session Update</p>
        <h2>${app.sessionResult.headline}</h2>
        <p class="problem-stem">${app.sessionResult.detail}</p>
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="${app.sessionResult.action}">
            ${app.sessionResult.actionLabel}
          </button>
        </div>
      </section>
    `;
  }

  function renderStartPanel() {
    return `
      <section class="panel problem-panel start-panel">
        <p class="panel-kicker">Session Start</p>
        <h2>TI-84 Trainer V3</h2>
        <p class="problem-stem">
          Track 1 asks for the correct procedure. Track 2 validates each key with the native state machine while
          the calculator panel boots the real TI-84 firmware when it is cached or configured.
        </p>
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="start-session">
            Start next item
          </button>
          <button type="button" class="mac-button" data-action="open-rom-dialog">
            Firmware
          </button>
        </div>
      </section>
    `;
  }

  function renderProblemColumn() {
    if (app.walkthrough) {
      return renderWalkthroughPanel();
    }

    if (app.branchIntro) {
      return renderBranchIntro(app.branchIntro);
    }

    if (app.sessionResult) {
      return renderSessionResult();
    }

    if (app.question) {
      return renderQuestionPanel(app.question);
    }

    return renderStartPanel();
  }

  function renderKeyButton(buttonId, suggestions, showAssist, extraClass = '') {
    const meta = BUTTON_META[buttonId];
    const suggested = showAssist && suggestions.has(buttonId);
    const dimmed = showAssist && suggestions.size && !suggested ? ' dimmed' : '';
    const flash = app.flashKeyId === buttonId ? ` flash-${app.flashKind}` : '';
    const disabled = !app.walkthrough || app.walkthrough.preparing || app.busy ? ' disabled' : '';
    const className = [
      'key',
      `key-${meta.color}`,
      suggested ? 'suggested' : '',
      dimmed.trim(),
      flash.trim(),
      extraClass,
    ]
      .filter(Boolean)
      .join(' ');

    return `
      <button type="button" class="${className}" data-key="${buttonId}" ${disabled}>
        ${meta.secondary ? `<span class="key-secondary">${meta.secondary}</span>` : ''}
        ${meta.alpha ? `<span class="key-alpha-label">${meta.alpha}</span>` : ''}
        <span class="key-label">${meta.label}</span>
      </button>
    `;
  }

  function renderDpad(suggestions, showAssist) {
    return `
      <div class="dpad-shell" aria-label="Directional pad">
        <div class="dpad-disc" aria-hidden="true"></div>
        ${renderKeyButton('UP', suggestions, showAssist, 'key-dpad-arrow key-up')}
        ${renderKeyButton('LEFT', suggestions, showAssist, 'key-dpad-arrow key-left')}
        ${renderKeyButton('RIGHT', suggestions, showAssist, 'key-dpad-arrow key-right')}
        ${renderKeyButton('DOWN', suggestions, showAssist, 'key-dpad-arrow key-down')}
        <div class="dpad-center" aria-hidden="true"></div>
      </div>
    `;
  }

  function renderKeypad() {
    const step = currentStep();
    const suggestions = guidedSuggestions(step);
    const showAssist = app.walkthrough
      && (app.walkthrough.mode === 'guided' || app.walkthrough.hintVisible);

    return `
      <div class="keypad-layout">
        <div class="key-row key-row-function">
          ${FUNCTION_ROW.map((buttonId) => renderKeyButton(buttonId, suggestions, showAssist)).join('')}
        </div>
        <div class="keypad-upper">
          <div class="modifier-column">
            ${MODIFIER_COLUMN.map((buttonId) => renderKeyButton(buttonId, suggestions, showAssist, 'key-modifier')).join('')}
          </div>
          <div class="modifier-grid">
            ${MODIFIER_GRID.flat().map((buttonId) => renderKeyButton(buttonId, suggestions, showAssist)).join('')}
          </div>
          ${renderDpad(suggestions, showAssist)}
        </div>
        ${MAIN_KEY_ROWS.map((row) => `
          <div class="key-row key-row-main">
            ${row.map((buttonId) => {
              const extraClass = [
                BUTTON_META[buttonId].color === 'number' ? 'key-large' : '',
                buttonId === 'ENTER' ? 'key-enter' : '',
                buttonId === 'ON' ? 'key-on' : '',
              ].filter(Boolean).join(' ');

              return renderKeyButton(buttonId, suggestions, showAssist, extraClass);
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderScreenMeta() {
    const nativeScreen = currentNativeScreen();
    const screen = currentScreen();
    const title = screenTitleFor(nativeScreen?.id || screen?.id);

    if (title) {
      return `
        <div class="screen-meta">
          <span>Screen</span>
          <strong>${title}</strong>
        </div>
      `;
    }

    if (app.bridge?.isRealEmulator?.()) {
      return '<p class="calc-placeholder-copy">Real TI-84 firmware is active.</p>';
    }

    if (bridgeStatusTone() === 'loading') {
      return '<p class="calc-placeholder-copy">Loading calculator firmware…</p>';
    }

    if (app.bridgeStatus.manualSelectionAvailable) {
      return '<p class="calc-placeholder-copy">Choose a local ROM file to boot CEmu during development.</p>';
    }

    return '<p class="calc-placeholder-copy">Simplified mode is active while calculator firmware is unavailable.</p>';
  }

  function renderCalculatorColumn() {
    const walkthrough = app.walkthrough;
    const step = currentStep();
    const totalSteps = walkthrough ? currentProcedure().steps.length : 0;
    const currentStepNumber = walkthrough ? Math.min(walkthrough.routeState.routeIndex + 1, totalSteps) : 0;
    const statusTone = bridgeStatusTone();
    const idleHeadline = app.bridge?.isRealEmulator?.()
      ? 'The real TI-84 Plus CE is ready.'
      : statusTone === 'loading'
        ? 'Calculator firmware is loading.'
        : 'Simplified calculator mode is active.';

    return `
      <section class="panel calc-panel">
        <div class="calc-top">
          <div>
            <p class="panel-kicker">Calculator View</p>
            <h2>TI-84 Plus CE</h2>
          </div>
          <div class="status-pills">
            <span class="status-pill status-${statusTone}">
              <span class="status-indicator" aria-hidden="true"></span>
              ${bridgeStatusLabel()}
            </span>
          </div>
        </div>

        <div class="calculator-shell">
          <div class="calculator-branding">
            <div class="calculator-brand-copy">
              <strong>TI-84 Plus CE</strong>
              <span>Texas Instruments</span>
            </div>
            <span class="calculator-model">Python</span>
          </div>
          <div class="lcd-bezel">
            <div class="screen-frame">
              <canvas id="calc-canvas" class="calc-canvas" width="320" height="240"></canvas>
              <div class="screen-overlay">
                ${renderScreenMeta()}
              </div>
            </div>
          </div>
          <div class="narration-bar">
            <div class="narration-copy">
              <strong>${walkthrough ? (step?.narration ?? 'Walkthrough complete.') : idleHeadline}</strong>
              <span>${walkthrough ? `Step ${currentStepNumber} of ${totalSteps}` : app.bridgeStatus.detail}</span>
            </div>
            <div class="button-row compact">
              <button type="button" class="mac-button" data-action="open-rom-dialog">Firmware</button>
              <button type="button" class="mac-button" data-action="restart-walkthrough" ${!walkthrough ? 'disabled' : ''}>Restart</button>
              <button type="button" class="mac-button" data-action="show-hint" ${!walkthrough || walkthrough.mode !== 'recall' ? 'disabled' : ''}>Hint</button>
            </div>
          </div>
          ${walkthrough
            ? `
              <div class="keypad-shell">
                ${renderKeypad()}
              </div>
            `
            : '<div class="keypad-empty">Pattern recognition comes first. The keypad unlocks after you enter a walkthrough.</div>'}
        </div>
      </section>
    `;
  }

  function renderDashboard(snapshot) {
    return `
      <section class="dashboard-row">
        <div class="dashboard-card">
          <span>Due</span>
          <strong>${snapshot.dueCount}</strong>
        </div>
        <div class="dashboard-card">
          <span>New</span>
          <strong>${snapshot.newCount}</strong>
        </div>
        <div class="dashboard-card">
          <span>Mastery</span>
          <strong>${snapshot.mastery}%</strong>
        </div>
        <div class="dashboard-card dashboard-control">
          <label for="unit-filter">Unit</label>
          <select id="unit-filter">
            ${UNIT_OPTIONS.map((option) => `
              <option value="${option}" ${option === app.filterUnit ? 'selected' : ''}>
                ${option === 'all' ? 'All Units' : `Unit ${option}`}
              </option>
            `).join('')}
          </select>
        </div>
      </section>
    `;
  }

  function renderRomDialog() {
    if (!app.romDialogOpen) {
      return '';
    }

    const manualSelectionAvailable = app.bridge?.supportsManualRomSelection?.()
      ?? app.bridgeStatus.manualSelectionAvailable;
    const romName = app.bridgeStatus.romMeta?.name;
    const detail = app.bridge?.isRealEmulator?.()
      ? `Calculator firmware is loaded${romName ? ` from ${romName}` : ''}.`
      : manualSelectionAvailable
        ? 'Firmware auto-download is not configured. Choose a local ROM file for development.'
        : app.bridgeStatus.detail;

    return `
      <div class="dialog-backdrop">
        <section class="dialog-window">
          <div class="dialog-titlebar">
            <span class="close-box"></span>
            <strong>Calculator Firmware</strong>
            <span></span>
          </div>
          <div class="dialog-body">
            <p>${detail}</p>
            <p class="dialog-note">
              ${manualSelectionAvailable
                ? 'Leave the Supabase URL blank during development and choose a local ROM file. The file stays cached in IndexedDB.'
                : 'Automatic firmware download is controlled by the Supabase URL in bridge.js. Cached firmware stays in IndexedDB between sessions.'}
            </p>
            ${romName ? `<p class="dialog-note">Cached firmware: ${romName}</p>` : ''}
            ${manualSelectionAvailable
              ? '<input id="rom-file-input" type="file" accept=".rom,.bin,application/octet-stream">'
              : ''}
            <div class="button-row">
              ${manualSelectionAvailable
                ? `
                  <button type="button" class="mac-button primary" data-action="choose-rom">
                    Choose local ROM
                  </button>
                `
                : ''}
              <button type="button" class="mac-button" data-action="clear-rom">
                Clear cached firmware
              </button>
              <button type="button" class="mac-button" data-action="close-rom-dialog">
                Close
              </button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function bridgeStatusTone() {
    if (app.bridge?.isRealEmulator?.()) {
      return 'ready';
    }

    switch (app.bridgeStatus.code) {
      case 'booting':
      case 'downloading-rom':
      case 'loading-wasm':
        return 'loading';
      default:
        return 'offline';
    }
  }

  function bridgeStatusLabel() {
    if (app.bridge?.isRealEmulator?.()) {
      return 'Calculator Ready';
    }

    return bridgeStatusTone() === 'loading' ? 'Loading…' : 'Offline Mode';
  }

  function render() {
    const snapshot = sessionSnapshot();

    root.innerHTML = `
      <main class="trainer-window">
        <header class="window-titlebar">
          <span class="close-box"></span>
          <strong>TI-84 Procedural Trainer V3</strong>
          <button type="button" class="titlebar-button" data-action="open-rom-dialog">Firmware</button>
        </header>

        <section class="banner-row">
          <span>${app.banner}</span>
        </section>

        <section class="workspace">
          ${renderProblemColumn()}
          ${renderCalculatorColumn()}
        </section>

        ${renderDashboard(snapshot)}
      </main>
      ${renderRomDialog()}
    `;

    const nextCanvas = document.getElementById('calc-canvas');

    if (app.canvasEl && nextCanvas && app.canvasEl !== nextCanvas) {
      nextCanvas.replaceWith(app.canvasEl);
    } else {
      app.canvasEl = nextCanvas;
    }

    app.bridge.mountCanvas(app.canvasEl);
  }

  function screenLinesForMock() {
    const procedure = currentProcedure();
    const screen = currentScreen();
    const step = currentStep();

    if (!procedure || !screen) {
      return {
        lines: [
          'TI-84 Plus CE',
          'Pattern recognition first',
        ],
        footer: app.bridgeStatus.detail,
      };
    }

    const lines = [
      procedure.name,
      `Screen: ${screen.title || screen.id}`,
    ];

    if (screen.items?.length) {
      screen.items.slice(0, 4).forEach((item, index) => {
        const prefix = screen.cursor === index ? '>' : ' ';
        lines.push(`${prefix} ${item}`);
      });
    } else if (screen.fields?.length) {
      screen.fields.slice(0, 4).forEach((field) => {
        lines.push(`${field.label}: ${field.value ?? ''}`);
      });
    } else if (screen.layout?.content?.length) {
      screen.layout.content.slice(0, 4).forEach((line) => {
        lines.push(line.text ?? '');
      });
    } else if (step) {
      lines.push(step.narration);
    }

    return {
      lines,
      footer: step ? `Expect ${stepIsParameter(step) ? 'numeric entry' : displayKey(step.key)}` : procedure.description,
    };
  }

  function updateMockCanvas() {
    if (app.bridge.isRealEmulator() || !app.walkthrough) {
      return;
    }

    const { lines, footer } = screenLinesForMock();
    app.bridge.setMockLines(lines, footer);
  }

  async function handleChoice(procedureId) {
    if (!app.question || app.busy) {
      return;
    }

    if (procedureId === app.question.correctId) {
      await handleCorrectChoice();
      return;
    }

    openBranchIntro(procedureId);
  }

  async function handleClick(event) {
    const button = event.target.closest('button');

    if (!button) {
      return;
    }

    const { action, key, procedureId } = button.dataset;

    if (key) {
      await pressButton(key);
      return;
    }

    if (!action) {
      return;
    }

    switch (action) {
      case 'start-session':
      case 'next-item':
        startNextQuestion();
        break;
      case 'choose-procedure':
        await handleChoice(procedureId);
        break;
      case 'start-branch':
        await startBranchWalkthrough();
        break;
      case 'cancel-branch':
        app.branchIntro = null;
        app.banner = 'Back on the original problem. Choose again.';
        render();
        break;
      case 'show-hint':
        showHint();
        break;
      case 'restart-walkthrough':
        await restartWalkthrough();
        break;
      case 'return-question':
        app.sessionResult = null;
        app.banner = 'Original question restored. The explored distractor is removed.';
        render();
        break;
      case 'open-rom-dialog':
        app.romDialogOpen = true;
        render();
        break;
      case 'close-rom-dialog':
        app.romDialogOpen = false;
        render();
        break;
      case 'choose-rom': {
        document.getElementById('rom-file-input')?.click();
        break;
      }
      case 'clear-rom':
        await app.bridge.clearStoredRom();
        app.bridgeStatus = app.bridge.getStatus();
        app.romDialogOpen = false;
        app.banner = 'Cached firmware cleared. Simplified mode is active until firmware is loaded again.';
        updateMockCanvas();
        render();
        break;
      default:
        break;
    }
  }

  async function handleChange(event) {
    if (event.target.id === 'unit-filter') {
      app.filterUnit = event.target.value;
      savePersisted();
      render();
      return;
    }

    if (event.target.id === 'rom-file-input') {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      app.busy = true;
      app.banner = `Loading calculator firmware from ${file.name}…`;
      render();

      try {
        await app.bridge.selectRomFile(file);
        app.bridgeStatus = app.bridge.getStatus();
        app.romDialogOpen = false;
        app.banner = `Calculator firmware loaded from ${file.name}.`;
      } catch (error) {
        app.banner = error.message;
      } finally {
        app.busy = false;
        updateMockCanvas();
        render();
      }
    }
  }

  function bindEvents() {
    root.addEventListener('click', (event) => {
      void handleClick(event);
    });

    root.addEventListener('change', (event) => {
      void handleChange(event);
    });
  }

  function attachBridge() {
    app.bridge = createBackend({
      onStatus(status) {
        app.bridgeStatus = status;
        updateMockCanvas();
        render();
      },
    });
  }

  async function init() {
    attachBridge();
    bindEvents();
    render();
    await app.bridge.init();
    app.bridgeStatus = app.bridge.getStatus();
    if (app.bridgeStatus.code === 'needs-rom' && app.bridgeStatus.manualSelectionAvailable) {
      app.romDialogOpen = true;
      app.banner = 'Firmware auto-download is not configured. Choose a local ROM file to boot CEmu during development.';
    } else if (bridgeStatusTone() === 'offline') {
      app.banner = app.bridgeStatus.detail;
    }
    updateMockCanvas();
    render();
  }

  window.addEventListener('beforeunload', () => {
    app.bridge?.destroy();
  });

  void init();
}());

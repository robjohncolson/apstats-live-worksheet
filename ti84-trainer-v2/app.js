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

      // Variable transfer into the real emulator. The ?? guard covers a stale
      // cached bridge.js that predates sendList — autofill then falls back to
      // keystrokes instead of crashing.
      sendList(listName, values) {
        return cemu.sendList?.(listName, values) ?? { ok: false, reason: 'no-send-list' };
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

      getComputedValues() {
        return native.getComputedValues?.() ?? null;
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
  const MEMORY_KEY = 'ti84-trainer-list-memory';
  const PARAMETER_PATTERN = /^\{.+\}$/;
  const DATA_SETUP_INPUT_CHAR = {
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
    NEGATIVE: '-',
    MINUS: '-',
  };
  const DIGIT_BUTTON_IDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

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
    bridgeInitStarted: false,
    bridgeInitPromise: null,
    bridgeStatus: { code: 'idle', detail: 'Emulator idle in physical calculator mode.', romMeta: null, usingMock: true },
    canvasEl: null,
    question: null,
    branchIntro: null,
    walkthrough: null,
    sessionResult: null,
    handheldCheck: null,
    banner: 'Pick a problem, choose the right procedure, and we drill the keys.',
    busy: false,
    flashKeyId: null,
    flashKind: null,
    choiceFlash: null,
    romDialogOpen: false,
    optionsDialogOpen: false,
    clutch: {
      engaged: true,
      phase: 'idle',
      dataTarget: null,
      dataProgress: {},
      dataFillMethods: {},
      autoFilling: false,
      manualEntry: null,
    },
  };

  function isMobileViewport() {
    return window.innerWidth <= 600;
  }

  const VERIFICATION_FIELDS = {
    't-test-data': [
      { key: 't', label: 't =' },
      { key: 'p', label: 'p =' },
    ],
    't-test-stats': [
      { key: 't', label: 't =' },
      { key: 'p', label: 'p =' },
    ],
    'two-samp-ttest': [
      { key: 't', label: 't =' },
      { key: 'p', label: 'p =' },
    ],
    'one-propztest': [
      { key: 'z', label: 'z =' },
      { key: 'p', label: 'p =' },
    ],
    'two-propztest': [
      { key: 'z', label: 'z =' },
      { key: 'p', label: 'p =' },
    ],
    'chi-square-gof-test': [
      { key: 'chi2', label: '&#967;&sup2; =' },
      { key: 'p', label: 'p =' },
    ],
    'chi-square-test': [
      { key: 'chi2', label: '&#967;&sup2; =' },
      { key: 'p', label: 'p =' },
    ],
    'linreg-ttest': [
      { key: 't', label: 't =' },
      { key: 'p', label: 'p =' },
    ],
    't-interval-data': [
      { key: 'lower', label: '(' },
      { key: 'upper', label: ',' },
    ],
    't-interval-stats': [
      { key: 'lower', label: '(' },
      { key: 'upper', label: ',' },
    ],
    'two-samp-tint': [
      { key: 'lower', label: '(' },
      { key: 'upper', label: ',' },
    ],
    'one-propzint': [
      { key: 'lower', label: '(' },
      { key: 'upper', label: ',' },
    ],
    'two-propzint': [
      { key: 'lower', label: '(' },
      { key: 'upper', label: ',' },
    ],
    'linreg-tint': [
      { key: 'lower', label: '(' },
      { key: 'upper', label: ',' },
    ],
    'one-var-stats': [
      { key: 'xbar', label: 'x&#772; =' },
      { key: 'Sx', label: 'Sx =' },
    ],
    'linreg-a-plus-bx': [
      { key: 'a', label: 'a =' },
      { key: 'b', label: 'b =' },
      { key: 'r', label: 'r =' },
    ],
    normalcdf: [{ key: 'value', label: 'P =' }],
    invnorm: [{ key: 'value', label: 'z =' }],
    'normalcdf-sampling': [{ key: 'value', label: 'P =' }],
    'invnorm-sampling': [{ key: 'value', label: 'z =' }],
    binompdf: [{ key: 'value', label: 'P =' }],
    binomcdf: [{ key: 'value', label: 'P =' }],
    geometpdf: [{ key: 'value', label: 'P =' }],
    geometcdf: [{ key: 'value', label: 'P =' }],
  };

  function escapeHtml(value) {
    return `${value ?? ''}`.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function computeExpected(procedureId, problem) {
    // Recompute the answer from the canonical problem data. This is the
    // authoritative reference for "what the calculator shows": verified against
    // scipy (a faithful TI-84 proxy) to better than 0.001% on every canonical
    // problem in the bank.
    //
    // We deliberately do NOT use the native simulation's getComputedValues()
    // here. The native sim is a simplified list/wizard model whose state can
    // drift from the real ROM after auto-fill and menu navigation, which made
    // verification reject students who had correctly read the ROM's result.
    const SM = window.TI84StatMath;
    const v = problem?.values && typeof problem.values === 'object'
      ? problem.values
      : problem ?? {};

    if (!SM) {
      return null;
    }

    const singleData = Array.isArray(v.data) && !Array.isArray(v.data[0])
      ? v.data
      : Array.isArray(v.L1)
        ? v.L1
        : null;
    const xValues = Array.isArray(v.L1)
      ? v.L1
      : Array.isArray(v.x_values)
        ? v.x_values
        : Array.isArray(v.xValues)
          ? v.xValues
          : null;
    const yValues = Array.isArray(v.L2)
      ? v.L2
      : Array.isArray(v.y_values)
        ? v.y_values
        : Array.isArray(v.yValues)
          ? v.yValues
          : null;
    const observedMatrix = Array.isArray(v.observed) && Array.isArray(v.observed[0])
      ? v.observed
      : Array.isArray(v.matrix)
        ? v.matrix
        : null;
    const sigma = v.sigma_xbar ?? v.sigma ?? 1;
    const trials = v.trials ?? v.n;

    switch (procedureId) {
      case 'one-var-stats':
        return singleData ? SM.oneVarStats(singleData) : null;
      case 't-test-data': {
        const stats = singleData ? SM.oneVarStats(singleData) : null;
        return stats ? SM.tTest(v.mu0, stats.xbar, stats.Sx, stats.n, v.direction) : null;
      }
      case 't-test-stats':
        return SM.tTest(v.mu0, v.xbar, v.sx, v.n, v.direction);
      case 't-interval-data': {
        const stats = singleData ? SM.oneVarStats(singleData) : null;
        return stats ? SM.tInterval(stats.xbar, stats.Sx, stats.n, v.cLevel) : null;
      }
      case 't-interval-stats':
        return SM.tInterval(v.xbar, v.sx, v.n, v.cLevel);
      case 'one-propztest':
        return SM.onePropZTest(v.p0, v.x, v.n, v.direction);
      case 'one-propzint':
        return SM.onePropZInt(v.x, v.n, v.cLevel);
      case 'two-propztest':
        return SM.twoPropZTest ? SM.twoPropZTest(v.x1, v.n1, v.x2, v.n2, v.direction) : null;
      case 'two-propzint':
        return SM.twoPropZInt ? SM.twoPropZInt(v.x1, v.n1, v.x2, v.n2, v.cLevel) : null;
      case 'chi-square-gof-test': {
        const expected = Array.isArray(v.expected)
          ? v.expected
          : Array.isArray(v.expected_counts)
            ? v.expected_counts
            : Array.isArray(v.expected_proportions) && Number.isFinite(v.n)
              ? v.expected_proportions.map((entry) => entry * v.n)
              : null;
        return Array.isArray(v.observed) && Array.isArray(expected)
          ? SM.chi2GOFTest(v.observed, expected, v.df)
          : null;
      }
      case 'chi-square-test':
        return observedMatrix ? SM.chi2Test(observedMatrix) : null;
      case 'linreg-a-plus-bx':
        return xValues && yValues ? SM.linReg(xValues, yValues) : null;
      case 'linreg-ttest':
        return xValues && yValues ? SM.linRegTTest(xValues, yValues, null, v.direction) : null;
      case 'linreg-tint':
        return xValues && yValues ? SM.linRegTInt(xValues, yValues, null, v.cLevel) : null;
      case 'two-samp-ttest':
        return SM.twoSampTTest(
          v.xbar1 ?? v.x1,
          v.sx1 ?? v.s1,
          v.n1,
          v.xbar2 ?? v.x2,
          v.sx2 ?? v.s2,
          v.n2,
          v.direction,
          false,
        );
      case 'two-samp-tint':
        return SM.twoSampTInt(
          v.xbar1 ?? v.x1,
          v.sx1 ?? v.s1,
          v.n1,
          v.xbar2 ?? v.x2,
          v.sx2 ?? v.s2,
          v.n2,
          v.cLevel,
          false,
        );
      case 'normalcdf':
      case 'normalcdf-sampling':
        return { value: SM.normalcdf(v.lower, v.upper, v.mu ?? 0, sigma) };
      case 'invnorm':
      case 'invnorm-sampling':
        return { value: SM.invNorm(v.area, v.mu ?? 0, sigma, v.tail ?? 'left') };
      case 'binompdf':
        return Number.isFinite(trials) ? { value: SM.binompdf(trials, v.p, v.x) } : null;
      case 'binomcdf':
        return Number.isFinite(trials) ? { value: SM.binomcdf(trials, v.p, v.x) } : null;
      case 'geometpdf':
        return { value: SM.geometpdf(v.p, v.x) };
      case 'geometcdf':
        return { value: SM.geometcdf(v.p, v.x) };
      default:
        return null;
    }
  }

  // Decimal places the student actually wrote, ignoring trailing zeros, so
  // "30.50" and "30.5" read as one place and "9.0" reads as a whole number.
  function typedDecimalPlaces(normStr) {
    const dot = normStr.indexOf('.');
    if (dot === -1) {
      return 0;
    }
    return normStr.slice(dot + 1).replace(/0+$/, '').length;
  }

  function valuesMatch(actual, expected, key) {
    const normalized = `${actual ?? ''}`.trim().replace(/\(-\)/g, '-').replace(/\s+/g, '');
    const a = parseFloat(normalized);

    if (Number.isNaN(a) || typeof expected !== 'number' || Number.isNaN(expected)) {
      return false;
    }

    if (expected === 0) {
      return Math.abs(a) < 0.005;
    }

    // Students read the calculator's value and write it down however they like:
    // full precision, 3 / 2 / 1 decimals, rounded up, rounded down, or clipped
    // to a whole number. Accept the answer if it equals ANY valid rounding or
    // truncation of the exact value at the number of decimal places the student
    // typed — so 3.6055 is satisfied by 3.6055, 3.61, 3.6, 4, or 3.
    //
    // The whole-number leniency only kicks in for values >= 1 in magnitude;
    // for proportions and p-values (|expected| < 1) a bare integer like "0" or
    // "1" is meaningless, so those fall through to the numeric tolerance below.
    const decimals = typedDecimalPlaces(normalized);
    if (decimals > 0 || Math.abs(expected) >= 1) {
      const factor = Math.pow(10, decimals);
      const scaled = expected * factor;
      const candidates = [
        Math.round(scaled),
        Math.floor(scaled),
        Math.ceil(scaled),
        Math.trunc(scaled),
      ];
      if (candidates.some((c) => Math.abs(a - c / factor) <= 1e-7)) {
        return true;
      }
    }

    // Backstop for full-precision entries and small values: a modest tolerance
    // (0.5% relative, 0.0005 absolute) covers numerical-method differences.
    const relTol = 0.005;
    const absTol = 0.0005;
    return Math.abs(a - expected) <= Math.max(relTol * Math.abs(expected), absTol);
  }

  function problemUsesData(problem) {
    const v = problem?.values ?? {};
    return Array.isArray(v.data) || Array.isArray(v.L1)
      || Array.isArray(v.observed) || Array.isArray(v.matrix);
  }

  // Hard check only when EVERY filled data target went in via transfer.
  // Manual entry never records a method, so an empty map stays lenient.
  function allDataTransferFilled() {
    const methods = app.clutch.dataFillMethods ?? {};
    const names = Object.keys(methods);
    return names.length > 0 && names.every((name) => methods[name] === 'transfer');
  }

  // Keystroke-typing data into the WASM emulator can drop keys, so the numeric
  // check stays best-effort for keystroke-filled data: never block a student on
  // a flaky entry path. Variable transfer is soak-proven reliable
  // (TI84_TRAINER_SPIKE_RESULT.md: 120/120), so when every data target went in
  // via transfer the hard check applies — a mismatch then means the procedure
  // was run wrong, and Restart + Auto-fill is the remedy. Physical mode and
  // non-data procedures keep the hard check as before.
  function emulatorDataLeniency() {
    return !app.persisted.physicalMode
      && Boolean(app.bridge?.isRealEmulator?.())
      && problemUsesData(app.walkthrough?.problem)
      && !allDataTransferFilled();
  }

  function formatExpectedValue(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return `${value ?? ''}`;
    }

    return window.TI84StatMath?.formatTI?.(value) ?? formatCalculatorValue(value);
  }

  // Maps the label on a mock result line (e.g. "x̄ = {value}") to the matching
  // key in computeExpected()'s return object. Result lines identify values by
  // label, not position, so substitution must resolve by label too.
  const MOCK_LINE_KEY_ALIASES = {
    'x̄': 'xbar',
    'Σx': 'sumX',
    'Σx²': 'sumX2',
    'σx': 'sigmaX',
    'x̄1': 'x1',
    'x̄2': 'x2',
    'p̂': 'pHat',
    'p̂1': 'pHat1',
    'p̂2': 'pHat2',
    'χ²': 'chi2',
    'r²': 'r2',
    intercept: 'a',
    slope: 'b',
  };

  function renderComputedLine(line, expected) {
    const text = `${line ?? ''}`;
    if (!expected || typeof expected !== 'object') {
      return text;
    }

    const label = text.includes('=') ? text.split('=')[0].trim() : '';

    return text.replace(/\{([^}]+)\}/g, (match, token) => {
      const key = token === 'value'
        ? (MOCK_LINE_KEY_ALIASES[label] ?? label)
        : (MOCK_LINE_KEY_ALIASES[token] ?? token);
      let value = expected[key];
      if (typeof value !== 'number' && token === 'value') {
        value = expected.value;
      }
      return typeof value === 'number' && !Number.isNaN(value) ? formatExpectedValue(value) : match;
    });
  }

  let wasMobile = isMobileViewport();
  let resizeRenderTimer = null;
  let storageWarningShown = false;

  app.filterUnit = app.persisted.filterUnit ?? 'all';
  let listMemory = loadListMemory();

  function loadPersisted() {
    const fallback = {
      version: 2,
      filterUnit: 'all',
      records: {},
      physicalMode: true,
      introSeen: false,
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
        physicalMode: parsed.physicalMode !== false,
      };
    } catch (error) {
      console.warn('Failed to load TI-84 V2 progress.', error);
      return fallback;
    }
  }

  function savePersisted() {
    app.persisted.filterUnit = app.filterUnit;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(app.persisted));
    } catch (error) {
      if (!storageWarningShown) {
        storageWarningShown = true;
        app.banner = "Progress can't be saved in this browser.";
      }
      console.warn('Failed to save TI-84 V2 progress.', error);
    }
  }

  function loadListMemory() {
    try {
      const raw = window.localStorage.getItem(MEMORY_KEY);

      if (!raw) {
        return {};
      }

      return JSON.parse(raw) || {};
    } catch (error) {
      console.warn('Failed to load TI-84 list memory.', error);
      return {};
    }
  }

  function saveListMemory() {
    try {
      window.localStorage.setItem(MEMORY_KEY, JSON.stringify(listMemory));
    } catch (error) {
      if (!storageWarningShown) {
        storageWarningShown = true;
        app.banner = "Progress can't be saved in this browser.";
      }
      console.warn('Failed to save TI-84 list memory.', error);
    }
  }

  function cloneDataValue(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function clearListMemory() {
    listMemory = {};
    window.localStorage.removeItem(MEMORY_KEY);
  }

  function setListMemoryEntry(name, data, source) {
    listMemory[name] = {
      data: cloneDataValue(data),
      source,
      timestamp: Date.now(),
    };
    saveListMemory();
  }

  function dataMatches(left, right) {
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        return false;
      }

      return left.every((entry, index) => dataMatches(entry, right[index]));
    }

    return left === right;
  }

  function listDataMatches(name, targetData) {
    const entry = listMemory[name];

    if (!entry?.data) {
      return false;
    }

    return dataMatches(entry.data, targetData);
  }

  function dataItemCount(data) {
    if (!Array.isArray(data)) {
      return 0;
    }

    if (!Array.isArray(data[0])) {
      return data.length;
    }

    return data.reduce((sum, row) => sum + row.length, 0);
  }

  function dataProgressUnit(name, data) {
    if (/^\[.+\]$/.test(name) || Array.isArray(data[0])) {
      return 'cells';
    }

    return 'values';
  }

  function createDataProgress(dataTarget) {
    const progress = {};

    for (const [name, data] of Object.entries(dataTarget ?? {})) {
      progress[name] = {
        entered: 0,
        total: dataItemCount(data),
        unit: dataProgressUnit(name, data),
      };
    }

    return progress;
  }

  function setProgressComplete(dataTarget) {
    const progress = createDataProgress(dataTarget);

    for (const entry of Object.values(progress)) {
      entry.entered = entry.total;
    }

    app.clutch.dataProgress = progress;
  }

  function resetClutchState() {
    app.clutch.engaged = true;
    app.clutch.phase = 'idle';
    app.clutch.dataTarget = null;
    app.clutch.dataProgress = {};
    app.clutch.dataFillMethods = {};
    app.clutch.autoFilling = false;
    app.clutch.manualEntry = null;
  }

  function hasDataTarget(dataTarget) {
    return Boolean(dataTarget && Object.keys(dataTarget).length);
  }

  function listNameSort(left, right) {
    return Number(left.replace(/\D/g, '')) - Number(right.replace(/\D/g, ''));
  }

  function createManualEntryState(dataTarget) {
    const listOrder = Object.keys(dataTarget ?? {})
      .filter((name) => /^L\d$/.test(name))
      .sort(listNameSort);

    return {
      pendingStat: false,
      editorOpen: false,
      listOrder,
      activeListIndex: 0,
      activeRow: 0,
      buffer: '',
      entries: Object.fromEntries(listOrder.map((name) => [name, []])),
    };
  }

  function currentTrackedListName() {
    const state = app.clutch.manualEntry;

    if (!state?.listOrder.length) {
      return null;
    }

    return state.listOrder[state.activeListIndex] ?? null;
  }

  function sequentialEntryCount(entries) {
    let count = 0;

    while (entries[count] !== undefined) {
      count += 1;
    }

    return count;
  }

  function updateManualDataProgress() {
    const manual = app.clutch.manualEntry;

    if (!manual) {
      return;
    }

    for (const listName of manual.listOrder) {
      const progress = app.clutch.dataProgress[listName];

      if (!progress) {
        continue;
      }

      progress.entered = Math.min(sequentialEntryCount(manual.entries[listName]), progress.total);
    }
  }

  function trackDataSetupInput(buttonId) {
    if (app.clutch.phase !== 'data-setup' || !app.clutch.manualEntry) {
      return;
    }

    const manual = app.clutch.manualEntry;

    if (buttonId === 'STAT') {
      manual.pendingStat = true;
      return;
    }

    if (manual.pendingStat && buttonId === 'ENTER') {
      manual.pendingStat = false;
      manual.editorOpen = true;
      manual.activeListIndex = 0;
      manual.activeRow = 0;
      manual.buffer = '';
      updateManualDataProgress();
      return;
    }

    manual.pendingStat = false;

    if (!manual.editorOpen) {
      return;
    }

    if (buttonId === 'RIGHT') {
      manual.activeListIndex = Math.min(manual.activeListIndex + 1, manual.listOrder.length - 1);
      manual.activeRow = sequentialEntryCount(manual.entries[currentTrackedListName()] ?? []);
      manual.buffer = '';
      return;
    }

    if (buttonId === 'LEFT') {
      manual.activeListIndex = Math.max(manual.activeListIndex - 1, 0);
      manual.activeRow = sequentialEntryCount(manual.entries[currentTrackedListName()] ?? []);
      manual.buffer = '';
      return;
    }

    if (buttonId === 'UP') {
      manual.activeRow = Math.max(manual.activeRow - 1, 0);
      manual.buffer = '';
      return;
    }

    if (buttonId === 'DOWN') {
      manual.activeRow += 1;
      manual.buffer = '';
      return;
    }

    if (buttonId === 'CLEAR' && manual.activeRow === 0) {
      const listName = currentTrackedListName();

      if (!listName) {
        return;
      }

      manual.entries[listName] = [];
      manual.buffer = '';
      updateManualDataProgress();
      return;
    }

    const char = DATA_SETUP_INPUT_CHAR[buttonId];

    if (char) {
      manual.buffer += char;
      return;
    }

    if (buttonId !== 'ENTER' || !manual.buffer) {
      return;
    }

    const value = Number(manual.buffer);
    const listName = currentTrackedListName();

    manual.buffer = '';

    if (!Number.isFinite(value) || !listName) {
      return;
    }

    manual.entries[listName][manual.activeRow] = value;
    manual.activeRow += 1;
    updateManualDataProgress();
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function buttonIdForDigit(digit) {
    return DIGIT_BUTTON_IDS[Number(digit)] ?? null;
  }

  async function sendAndWait(buttonId, delayMs = 80) {
    await app.bridge.sendButton(buttonId);
    await delay(delayMs);
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
          bestScore: 0,
          // Mastery gate: a procedure is only "mastered" once the student has
          // run a fresh problem on their own physical TI-84 and verified the
          // result (handheldPassed). awaitingHandheld means a clean emulator
          // recall pass happened and the handheld check is the next step.
          handheldPassed: false,
          awaitingHandheld: false,
        },
      };
    }

    // Backfill new fields for records persisted before the mastery gate shipped.
    const track2 = app.persisted.records[procedureId].track2;
    if (track2.handheldPassed === undefined) track2.handheldPassed = false;
    if (track2.awaitingHandheld === undefined) track2.awaitingHandheld = false;

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
    const raw = (track1Mastery(record) + track2Mastery(record)) / 2;
    // A procedure isn't fully mastered until it's been proven on a real TI-84,
    // so cap mastery until the handheld check passes. The remaining headroom is
    // what the handheld pass unlocks.
    const capped = record?.track2?.handheldPassed ? raw : Math.min(raw, 0.7);
    return Math.round(capped * 100);
  }

  function sessionSnapshot() {
    const procedures = filteredProcedures();
    // Mirrors the scheduler (nextQuestionProcedureId), which queues by
    // track1 only — counting track2 dues here made Due grow on completion.
    const dueCount = procedures.filter((procedure) => {
      const record = getProcedureRecord(procedure.id);
      return isDue(record?.track1);
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
      wrongChoices: 0,
    };
  }

  function startNextQuestion() {
    const procedureId = nextQuestionProcedureId();

    if (!procedureId) {
      app.banner = 'No procedures match the current unit filter.';
      render();
      return;
    }

    // A procedure that passed emulator recall but hasn't been proven on a real
    // TI-84 goes straight to its handheld mastery check.
    const track2 = ensureProcedureRecord(procedureId).track2;
    if (track2.awaitingHandheld && !track2.handheldPassed) {
      startHandheldCheck(procedureId);
      return;
    }

    app.question = buildQuestion(procedureId);
    app.branchIntro = null;
    app.walkthrough = null;
    app.sessionResult = null;
    app.handheldCheck = null;
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

  function pairedDataProcedure(procedureId) {
    return new Set([
      'scatterplot',
      'residual-plot',
      'linreg-a-plus-bx',
      'linreg-ttest',
      'linreg-tint',
    ]).has(procedureId);
  }

  function procedurePhaseBanner() {
    if (app.walkthrough?.mode === 'guided') {
      return 'Follow the highlighted key. Wrong keys are blocked before they reach the calculator.';
    }

    return 'Recall mode is live. Hints count as misses.';
  }

  function procedureDataNote(procedureId, listName) {
    if (procedureId === 'chi-square-gof-test') {
      return listName === 'L1' ? 'Observed' : 'Expected';
    }

    if (procedureId === 'chi-square-test') {
      return listName === '[A]' ? 'Observed' : 'Expected';
    }

    if (pairedDataProcedure(procedureId)) {
      return listName === 'L1' ? 'X values' : 'Y values';
    }

    return listName === 'L1' ? 'Data' : '';
  }

  function mergeProblemValues(problem) {
    const values = problem?.values && typeof problem.values === 'object'
      ? { ...problem.values }
      : {};

    if (problem?.data !== undefined && values.data === undefined) {
      values.data = problem.data;
    }

    return values;
  }

  function resolveListData(listName, procedure, problem) {
    const values = mergeProblemValues(problem);

    if (Array.isArray(values[listName])) {
      return values[listName];
    }

    if (listName === 'L1') {
      if (Array.isArray(values.observed)) {
        return values.observed;
      }

      if (Array.isArray(values.x_values)) {
        return values.x_values;
      }

      if (Array.isArray(values.xValues)) {
        return values.xValues;
      }
    }

    if (listName === 'L2') {
      if (Array.isArray(values.expected)) {
        return values.expected;
      }

      if (Array.isArray(values.expected_counts)) {
        return values.expected_counts;
      }

      if (Array.isArray(values.expected_proportions) && Number.isFinite(values.n)) {
        return values.expected_proportions.map((entry) => Math.round(entry * values.n * 10000) / 10000);
      }

      if (Array.isArray(values.y_values)) {
        return values.y_values;
      }

      if (Array.isArray(values.yValues)) {
        return values.yValues;
      }
    }

    if (!Array.isArray(values.data)) {
      return null;
    }

    if (!Array.isArray(values.data[0])) {
      if (listName === 'L1') {
        return values.data;
      }

      return null;
    }

    const listOrder = Object.keys(procedure?.dataRequirements ?? {})
      .filter((name) => /^L\d$/.test(name))
      .sort(listNameSort);
    const listIndex = listOrder.indexOf(listName);

    if (listIndex === -1 || !Array.isArray(values.data[listIndex])) {
      return null;
    }

    return values.data[listIndex];
  }

  function expectedMatrixFromObserved(observed) {
    if (!Array.isArray(observed) || !observed.length) {
      return null;
    }

    const rowTotals = observed.map((row) => row.reduce((sum, entry) => sum + entry, 0));
    const colTotals = observed[0].map((_, colIndex) => observed.reduce((sum, row) => sum + row[colIndex], 0));
    const total = rowTotals.reduce((sum, entry) => sum + entry, 0);

    if (!total) {
      return null;
    }

    return observed.map((row, rowIndex) => row.map((_, colIndex) => {
      const expected = (rowTotals[rowIndex] * colTotals[colIndex]) / total;
      return Math.round(expected * 10000) / 10000;
    }));
  }

  function resolveMatrixData(matrixName, problem) {
    const values = mergeProblemValues(problem);

    if (Array.isArray(values[matrixName])) {
      return values[matrixName];
    }

    if (matrixName === '[A]') {
      if (Array.isArray(values.matrix)) {
        return values.matrix;
      }

      if (Array.isArray(values.data) && Array.isArray(values.data[0])) {
        return values.data;
      }
    }

    if (matrixName === '[B]') {
      if (Array.isArray(values.expected_matrix)) {
        return values.expected_matrix;
      }

      if (Array.isArray(values.matrix)) {
        return expectedMatrixFromObserved(values.matrix);
      }
    }

    return null;
  }

  function buildDataTarget(procedure, problem) {
    const requirements = procedure?.dataRequirements;

    if (!requirements) {
      return null;
    }

    const target = {};

    for (const name of Object.keys(requirements)) {
      const data = /^L\d$/.test(name)
        ? resolveListData(name, procedure, problem)
        : resolveMatrixData(name, problem);

      if (!Array.isArray(data) || !data.length) {
        continue;
      }

      target[name] = cloneDataValue(data);
    }

    return hasDataTarget(target) ? target : null;
  }

  function rememberDataTarget(dataTarget, source) {
    for (const [name, data] of Object.entries(dataTarget ?? {})) {
      setListMemoryEntry(name, data, source);
    }
  }

  function syncDataTargetToNative(dataTarget) {
    for (const [name, data] of Object.entries(dataTarget ?? {})) {
      if (/^L\d$/.test(name)) {
        app.bridge.setList?.(name, data);
        continue;
      }

      if (/^\[.+\]$/.test(name)) {
        app.bridge.setMatrix?.(name, data);
      }
    }
  }

  function dataTargetMatchesMemory(dataTarget) {
    return Object.entries(dataTarget ?? {}).every(([name, data]) => listDataMatches(name, data));
  }

  function startProcedurePhase(message) {
    app.walkthrough.preparing = false;
    app.busy = false;
    app.clutch.engaged = true;
    app.clutch.phase = 'procedure';
    app.clutch.dataTarget = null;
    app.clutch.dataProgress = {};
    app.clutch.autoFilling = false;
    app.clutch.manualEntry = null;
    app.banner = message || procedurePhaseBanner();
    updateMockCanvas();
    render();
  }

  function enterDataSetupPhase(procedure, dataTarget) {
    app.walkthrough.preparing = false;
    app.busy = false;
    app.clutch.engaged = false;
    app.clutch.phase = 'data-setup';
    app.clutch.dataTarget = dataTarget;
    app.clutch.dataProgress = createDataProgress(dataTarget);
    app.clutch.autoFilling = false;
    app.clutch.manualEntry = createManualEntryState(dataTarget);
    app.banner = `Enter the required data for ${procedure.name}, or use Auto-fill.`;
    updateMockCanvas();
    render();
  }

  function enterResultReviewPhase() {
    const procedureId = currentProcedure()?.id;

    app.busy = false;
    app.clutch.engaged = false;
    app.clutch.phase = 'result-review';
    app.walkthrough.answerVerified = false;
    app.walkthrough.answerCheckResults = null;
    app.banner = VERIFICATION_FIELDS[procedureId]
      ? 'Walkthrough complete. Check your answer, then finish the review.'
      : 'Walkthrough complete. Explore the result, then finish the review.';
    updateMockCanvas();
    render();
  }

  async function quitToHome() {
    await sendAndWait('2ND');
    await sendAndWait('MODE', 160);
  }

  async function goToListHeader(listIndex) {
    // Quit to home and re-enter STAT>EDIT for reliable positioning
    await quitToHome();
    await delay(100);
    await sendAndWait('STAT', 80);
    await sendAndWait('ENTER', 200);

    // Cursor starts on L1 row 1. Navigate right to target column.
    for (let step = 0; step < listIndex; step += 1) {
      await sendAndWait('RIGHT', 80);
    }

    // Move up to the header row
    await sendAndWait('UP', 80);
  }

  // Only lists the week-one spike proved via the frame oracle may use variable
  // transfer (TI84_TRAINER_SPIKE_RESULT.md). Others fall back to keystrokes.
  const PROVEN_TRANSFER_LISTS = { L1: true, L2: true };

  function transferAutofillEnabled() {
    if (new URLSearchParams(window.location.search).get('autofill') === 'keys') {
      return false;
    }
    return app.persisted.transferAutofill !== false;
  }

  async function autoFillList(listName, values) {
    if (transferAutofillEnabled() && listName in PROVEN_TRANSFER_LISTS) {
      const sent = app.bridge?.sendList?.(listName, values);
      if (sent?.ok) {
        app.clutch.dataProgress[listName] = {
          ...app.clutch.dataProgress[listName],
          entered: values.length,
        };
        app.clutch.dataFillMethods[listName] = 'transfer';
        render();
        return;
      }
      console.warn(`[autofill] transfer failed for ${listName} (${sent?.reason ?? 'unavailable'}) — falling back to keystrokes`);
    }

    app.clutch.dataFillMethods[listName] = 'keys';
    await keystrokeFillList(listName, values);
  }

  async function keystrokeFillList(listName, values) {
    const listIndex = Number(listName.slice(1)) - 1;

    await goToListHeader(listIndex);
    // CLEAR on the header clears the entire list, ENTER confirms
    await sendAndWait('CLEAR', 100);
    await sendAndWait('ENTER', 120);
    // Cursor is now on row 1 of the (empty) list — no extra DOWN needed

    for (let index = 0; index < values.length; index += 1) {
      await app.bridge.typeValue(String(values[index]));
      await delay(70);
      await sendAndWait('ENTER', 110);

      app.clutch.dataProgress[listName] = {
        ...app.clutch.dataProgress[listName],
        entered: index + 1,
      };
      render();
    }
  }

  function matrixMenuIndex(matrixName) {
    const letter = matrixName.slice(1, -1);
    return 'ABCDEFGHIJ'.indexOf(letter) + 1;
  }

  async function autoFillMatrix(matrixName, values) {
    const rows = values.length;
    const cols = values[0]?.length ?? 0;
    const matrixIndex = matrixMenuIndex(matrixName);

    if (!matrixIndex || !rows || !cols) {
      return;
    }

    // Matrices have no proven transfer path yet (.8xm spike pending).
    app.clutch.dataFillMethods[matrixName] = 'keys';

    await quitToHome();
    await sendAndWait('2ND');
    await sendAndWait('X_INVERSE', 100);
    await sendAndWait('RIGHT', 60);
    await sendAndWait('RIGHT', 60);
    await sendAndWait(buttonIdForDigit(matrixIndex), 100);
    await app.bridge.typeValue(String(rows));
    await delay(40);
    await sendAndWait('ENTER', 70);
    await app.bridge.typeValue(String(cols));
    await delay(40);
    await sendAndWait('ENTER', 100);

    let entered = 0;
    const total = rows * cols;

    for (const row of values) {
      for (const cell of row) {
        await app.bridge.typeValue(String(cell));
        await delay(40);
        await sendAndWait('ENTER', 70);
        entered += 1;
        app.clutch.dataProgress[matrixName] = {
          ...app.clutch.dataProgress[matrixName],
          entered,
          total,
        };
        render();
      }
    }
  }

  async function autoFillData(dataTarget) {
    if (!hasDataTarget(dataTarget) || app.clutch.autoFilling) {
      return;
    }

    app.busy = true;
    app.clutch.autoFilling = true;
    app.banner = 'Auto-filling data...';
    render();

    try {
      const listNames = Object.keys(dataTarget)
        .filter((name) => /^L\d$/.test(name))
        .sort(listNameSort);

      for (const listName of listNames) {
        await autoFillList(listName, dataTarget[listName]);
      }

      const matrixNames = Object.keys(dataTarget).filter((name) => /^\[.+\]$/.test(name));

      for (const matrixName of matrixNames) {
        await autoFillMatrix(matrixName, dataTarget[matrixName]);
      }

      if (listNames.length || matrixNames.length) {
        await quitToHome();
      }

      rememberDataTarget(dataTarget, 'auto-fill');
      syncDataTargetToNative(dataTarget);
      startProcedurePhase('Data entered. Starting procedure.');
    } catch (error) {
      app.busy = false;
      app.clutch.autoFilling = false;
      app.banner = error.message;
      render();
    }
  }

  function confirmDataSetup() {
    if (!hasDataTarget(app.clutch.dataTarget)) {
      startProcedurePhase();
      return;
    }

    // On the real emulator, syncing only the native sim leaves the ROM's lists
    // empty/stale, so 1-Var Stats (etc.) runs on the wrong data and the student
    // reads a wrong result. Route "I'm done" through the auto-fill that loads
    // the ROM for real — variable transfer for proven lists, keystrokes
    // otherwise. (Mock mode reads from the native sim, so plain sync is fine.)
    if (!app.persisted.physicalMode && app.bridge?.isRealEmulator?.()) {
      void autoFillData(app.clutch.dataTarget);
      return;
    }

    setProgressComplete(app.clutch.dataTarget);
    rememberDataTarget(app.clutch.dataTarget, 'manual-confirm');
    syncDataTargetToNative(app.clutch.dataTarget);
    startProcedurePhase('Data setup confirmed. Starting procedure.');
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

    if (app.walkthrough?.mode === 'recall') {
      return 'Not that key.';
    }

    return `Blocked. The next key is [${displayKey(step.key)}].`;
  }

  function recallNeutralPrompt(walkthrough, totalSteps) {
    const n = Math.min((walkthrough?.routeState?.routeIndex ?? 0) + 1, totalSteps);
    return `Step ${n} of ${totalSteps} - what comes next?`;
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
    const dataTarget = buildDataTarget(procedure, problem);

    resetClutchState();
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
      answerValues: {},
      answerCheckResults: null,
      answerFailCounts: {},
      answerVerified: false,
    };
    app.branchIntro = null;
    app.sessionResult = null;
    app.busy = true;
    app.banner = 'Resetting the calculator to HOME before the walkthrough starts.';
    render();

    try {
      await app.bridge.prepareHome();

      if (hasDataTarget(dataTarget)) {
        // Always show data setup phase — let the student confirm or re-enter.
        // Memory might be stale if CEmu was reset or auto-fill targeted wrong columns.
        enterDataSetupPhase(procedure, dataTarget);
        return;
      }

      seedNativeLists(problem, procedure);
      seedNativeMatrices(problem);
    } catch (error) {
      console.warn('Failed to prepare the calculator home screen.', error);
    }

    startProcedurePhase(procedurePhaseBanner());
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
      // Tomorrow, not today — finishing an item must visibly clear it.
      track2.nextReview = formatDate(addDays(startOfDay(new Date()), 1));
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

    // A clean emulator recall pass earns the handheld mastery check: the
    // student now proves the procedure on their own physical TI-84. Until they
    // pass it, the procedure is not "mastered".
    if (!track2.handheldPassed) {
      track2.awaitingHandheld = true;
      return {
        headline: `${PROCEDURE_BY_ID[walkthrough.procedureId].name} — recall passed`,
        detail: 'Nicely done on the on-screen calculator. One more step to master it: run a fresh problem on your real TI-84.',
        offerHandheld: true,
      };
    }

    return {
      headline: `${PROCEDURE_BY_ID[walkthrough.procedureId].name} scheduled`,
      detail: `Recall complete. Next review is ${track2.nextReview}.`,
    };
  }

  function recordTrainerAttempt(walkthrough) {
    if (typeof window.gradebookClient?.record !== 'function') {
      return false;
    }

    // Signed-out users skip recording entirely. Calling record() without a token
    // would pop gradebook-client's red "not saved to your grade" nudge - wrong for
    // a tool that always worked anonymously (and the nudge's sign-in link 404s
    // from this subdirectory).
    if (typeof window.rosterClient?.current !== 'function' || !window.rosterClient.current()) {
      return false;
    }

    const procedure = PROCEDURE_BY_ID[walkthrough.procedureId];
    const track2 = ensureProcedureRecord(walkthrough.procedureId).track2;
    const quality = track2.lastQuality ?? 0;
    const score = Math.max(track2.bestScore ?? 0, quality / 5);

    if (app.persisted.physicalMode && !walkthrough.answerVerified) {
      return false;
    }

    track2.bestScore = score;

    // Fire-and-forget roster ledger write; attempt stays 1 so re-practice
    // upserts the same row (latest state per procedure).
    window.gradebookClient.record({
      source: 'trainer',
      itemId: `TI84-${walkthrough.procedureId.replace(/[^A-Za-z0-9-]/g, '-')}`,
      unit: Number.isFinite(procedure?.unit) ? `U${procedure.unit}` : undefined,
      response: {
        procedureId: walkthrough.procedureId,
        quality,
        mode: walkthrough.mode,
        inputMode: app.persisted.physicalMode ? 'physical' : 'emulator',
        hints: walkthrough.hints,
        errors: walkthrough.errors,
      },
      score,
      attempt: 1,
    }).then((result) => {
      if (!app.sessionResult) {
        return;
      }

      app.sessionResult.gradebookSave = result?.ok
        ? 'Saved to your gradebook.'
        : result?.reason === 'auth'
          ? 'Not saved - your sign-in expired. Open the Desk and sign in again.'
          : 'Not saved (connection problem).';
      render();
    }).catch(() => {
      if (!app.sessionResult) {
        return;
      }

      app.sessionResult.gradebookSave = 'Not saved (connection problem).';
      render();
    });

    return true;
  }

  function track1QualityForBranches(branchCount, wrongChoices = 0) {
    const effective = branchCount + Math.max(0, wrongChoices - branchCount);

    if (effective <= 0) {
      return 5;
    }

    if (effective === 1) {
      return 3;
    }

    if (effective === 2) {
      return 1;
    }

    return 0;
  }

  function completeWalkthrough() {
    const walkthrough = app.walkthrough;

    if (!walkthrough) {
      return;
    }

    resetClutchState();

    const track2Summary = applyTrack2Outcome(walkthrough);
    recordTrainerAttempt(walkthrough);

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
    const wrongChoices = walkthrough.sourceQuestion?.wrongChoices ?? 0;
    const track1Quality = track1QualityForBranches(branchCount, wrongChoices);
    applyTrack1Outcome(walkthrough.procedureId, track1Quality);

    const procedureId = walkthrough.procedureId;
    app.question = null;
    app.walkthrough = null;
    app.branchIntro = null;

    if (track2Summary.offerHandheld) {
      app.sessionResult = {
        headline: track2Summary.headline,
        detail: track2Summary.detail,
        actionLabel: 'Do it on my TI-84 →',
        action: 'start-handheld',
        handheldProcedureId: procedureId,
        secondaryLabel: 'Later',
        secondaryAction: 'next-item',
      };
      app.banner = 'Grab your real TI-84 — the next step is a quick handheld check.';
      savePersisted();
      render();
      return;
    }

    app.sessionResult = {
      headline: `${PROCEDURE_BY_ID[procedureId].name} complete`,
      detail: `${track2Summary.detail} Track 1 quality: ${track1Quality}.`,
      actionLabel: 'Next item',
      action: 'next-item',
    };
    app.banner = 'The walkthrough finished. Start the next scheduled item when ready.';
    savePersisted();
    render();
  }

  // ── Handheld mastery check ──────────────────────────────────────────────
  // After a clean emulator recall pass, the student proves the procedure on
  // their own physical TI-84 with a fresh problem. Verifiable procedures check
  // the typed result against the canonical answer (recompute matches the real
  // TI to <0.001%); graph/utility procedures are a self-attested confirmation.

  function startHandheldCheck(procedureId) {
    if (!procedureId) {
      startNextQuestion();
      return;
    }

    app.question = null;
    app.walkthrough = null;
    app.branchIntro = null;
    app.sessionResult = null;
    app.handheldCheck = {
      procedureId,
      problem: pickRandom(patternsData.canonicalProblems[procedureId] ?? []),
      fields: VERIFICATION_FIELDS[procedureId] ?? null,
      values: {},
      checkResults: null,
      failCounts: {},
      verified: false,
    };
    app.banner = 'Handheld check: run this on your own TI-84, then enter the result.';
    render();
  }

  function syncHandheldInputsFromDom() {
    if (!app.handheldCheck) {
      return;
    }

    const values = { ...(app.handheldCheck.values ?? {}) };
    root.querySelectorAll('[data-answer-key]').forEach((input) => {
      values[input.dataset.answerKey] = input.value;
    });
    app.handheldCheck.values = values;
  }

  function recordHandheldMastery(procedureId) {
    if (typeof window.gradebookClient?.record !== 'function') {
      return;
    }

    if (typeof window.rosterClient?.current !== 'function' || !window.rosterClient.current()) {
      return;
    }

    const procedure = PROCEDURE_BY_ID[procedureId];
    const track2 = ensureProcedureRecord(procedureId).track2;
    const score = Math.max(track2.bestScore ?? 0, 1); // verified on real hardware
    track2.bestScore = score;

    window.gradebookClient.record({
      source: 'trainer',
      itemId: `TI84-${procedureId.replace(/[^A-Za-z0-9-]/g, '-')}`,
      unit: Number.isFinite(procedure?.unit) ? `U${procedure.unit}` : undefined,
      response: {
        procedureId,
        event: 'handheld-mastery',
        inputMode: 'physical',
        verified: true,
      },
      score,
      attempt: 1,
    }).then((result) => {
      if (!app.sessionResult) {
        return;
      }

      app.sessionResult.gradebookSave = result?.ok
        ? 'Saved to your gradebook.'
        : result?.reason === 'auth'
          ? 'Not saved - your sign-in expired. Open the Desk and sign in again.'
          : 'Not saved (connection problem).';
      render();
    }).catch(() => {
      if (!app.sessionResult) {
        return;
      }

      app.sessionResult.gradebookSave = 'Not saved (connection problem).';
      render();
    });
  }

  function finishHandheldMastery(procedureId, { recordCredit }) {
    const track2 = ensureProcedureRecord(procedureId).track2;
    track2.handheldPassed = true;
    track2.awaitingHandheld = false;

    app.handheldCheck = null;
    app.sessionResult = {
      headline: `${PROCEDURE_BY_ID[procedureId].name} mastered!`,
      detail: 'You ran it on your own TI-84 and nailed the result. This procedure is now mastered.',
      actionLabel: 'Next item',
      action: 'next-item',
    };
    app.banner = 'Mastered — proven on a real calculator.';
    savePersisted();
    render();

    if (recordCredit) {
      recordHandheldMastery(procedureId);
    }
  }

  function checkHandheld() {
    const check = app.handheldCheck;

    if (!check || !check.fields?.length) {
      return;
    }

    syncHandheldInputsFromDom();
    const expected = computeExpected(check.procedureId, check.problem);

    if (!expected) {
      // No reliable reference for this problem — accept as self-attested.
      finishHandheldMastery(check.procedureId, { recordCredit: false });
      return;
    }

    const results = {};
    let allCorrect = true;

    check.fields.forEach((field) => {
      const correct = valuesMatch(check.values[field.key], expected[field.key], field.key);
      const failCount = correct ? 0 : (check.failCounts?.[field.key] || 0) + 1;
      check.failCounts[field.key] = failCount;
      results[field.key] = {
        actual: check.values[field.key] ?? '',
        expected: expected[field.key],
        correct,
        failCount,
      };
      if (!correct) {
        allCorrect = false;
      }
    });

    check.checkResults = results;
    check.verified = allCorrect;

    if (allCorrect) {
      finishHandheldMastery(check.procedureId, { recordCredit: true });
      return;
    }

    app.banner = 'Not a match yet. Re-run it on your TI-84 and check sign and decimals.';
    render();
  }

  function confirmHandheld() {
    const check = app.handheldCheck;

    if (!check) {
      return;
    }

    // Graph/utility procedures have no numeric result to verify — self-attested.
    finishHandheldMastery(check.procedureId, { recordCredit: false });
  }

  function skipHandheld() {
    // Defer; awaitingHandheld stays set, so it re-offers next time it's due.
    app.handheldCheck = null;
    startNextQuestion();
  }

  function renderHandheldCheck() {
    const check = app.handheldCheck;
    const procedure = PROCEDURE_BY_ID[check.procedureId];
    const stem = check.problem?.stem ?? 'Run this procedure on your own TI-84.';

    if (!check.fields?.length) {
      return `
        <section class="panel problem-panel handheld-panel">
          <p class="panel-kicker">Handheld Check — ${procedure.name}</p>
          <h2>Prove it on your real TI-84</h2>
          <p class="problem-stem">${stem}</p>
          <p class="panel-note">Do this on your own calculator. When the screen looks right, confirm below.</p>
          <div class="button-row">
            <button type="button" class="mac-button primary" data-action="handheld-confirm">I did it on my TI-84</button>
            <button type="button" class="mac-button" data-action="handheld-skip">Later</button>
          </div>
        </section>
      `;
    }

    const fieldRows = renderAnswerFieldRows(check.fields, check.values, check.checkResults ?? {});
    return `
      <section class="panel problem-panel handheld-panel answer-card${check.verified ? ' verified' : ''}">
        <p class="panel-kicker">Handheld Check — ${procedure.name}</p>
        <h2>Prove it on your real TI-84</h2>
        <p class="problem-stem">${stem}</p>
        <p class="panel-note">Run this on your own calculator, then type the result it shows.</p>
        ${fieldRows}
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="check-handheld">Check</button>
          <button type="button" class="mac-button" data-action="handheld-skip">Later</button>
        </div>
      </section>
    `;
  }

  function renderHandheldCalcColumn() {
    return `
      <section class="panel calc-panel physical-panel">
        <div class="calc-top">
          <div>
            <p class="panel-kicker">Your Real Calculator</p>
            <h2>Use your TI-84</h2>
          </div>
        </div>
        <div class="physical-card">
          <div class="physical-card-header">
            <p class="physical-procedure-name">Grab your TI-84 Plus CE</p>
          </div>
          <p class="physical-narration">Work the problem on your own calculator, then enter the result it displays on the left.</p>
        </div>
      </section>
    `;
  }

  function syncAnswerInputsFromDom() {
    if (!app.walkthrough) {
      return;
    }

    const answerValues = { ...(app.walkthrough.answerValues ?? {}) };

    root.querySelectorAll('[data-answer-key]').forEach((input) => {
      answerValues[input.dataset.answerKey] = input.value;
    });

    app.walkthrough.answerValues = answerValues;
  }

  function resetAnswerVerificationUi() {
    const procedureId = currentProcedure()?.id;

    root.querySelector('.answer-card')?.classList.remove('verified');

    if (VERIFICATION_FIELDS[procedureId]) {
      const finishButton = root.querySelector('[data-action="finish-review"]');

      if (finishButton) {
        finishButton.disabled = true;
      }
    }

    root.querySelectorAll('.answer-status').forEach((element) => {
      element.textContent = '';
      element.classList.remove('correct', 'wrong');
    });
  }

  function checkAnswerVerification() {
    const walkthrough = app.walkthrough;
    const procedure = currentProcedure();
    const fields = procedure ? VERIFICATION_FIELDS[procedure.id] : null;

    if (!walkthrough || !fields?.length) {
      return;
    }

    syncAnswerInputsFromDom();

    const expected = computeExpected(procedure.id, walkthrough.problem);

    if (!expected) {
      walkthrough.answerVerified = false;
      walkthrough.answerCheckResults = null;
      app.banner = 'Answer verification is not available for this procedure yet.';
      render();
      return;
    }

    const results = {};
    const values = walkthrough.answerValues ?? {};
    let allCorrect = true;

    fields.forEach((field) => {
      const correct = valuesMatch(values[field.key], expected[field.key], field.key);
      const failCount = correct
        ? 0
        : (walkthrough.answerFailCounts?.[field.key] || 0) + 1;

      walkthrough.answerFailCounts[field.key] = failCount;

      results[field.key] = {
        actual: values[field.key] ?? '',
        expected: expected[field.key],
        correct,
        failCount,
      };

      if (!correct) {
        allCorrect = false;
      }
    });

    walkthrough.answerCheckResults = results;
    walkthrough.answerVerified = allCorrect;
    if (!allCorrect) {
      walkthrough.errors += 1;
    }

    // If this is a data procedure and the result is off by a lot, the most
    // likely cause is the calculator's list not matching the problem's data.
    const pv = walkthrough.problem?.values ?? {};
    const usesData = Array.isArray(pv.data) || Array.isArray(pv.L1) || Array.isArray(pv.observed);
    const wayOff = Object.values(results).some((r) => typeof r.expected === 'number'
      && Math.abs(parseFloat(`${r.actual}`) - r.expected) > Math.max(1, Math.abs(r.expected) * 0.1));

    if (allCorrect) {
      app.banner = 'Answer verified. Finish review is unlocked.';
    } else if (emulatorDataLeniency()) {
      app.banner = "Doesn't match — the on-screen calculator's data entry isn't always perfect, so this won't block you. You can Finish review; your real-calculator check is the graded one.";
    } else if (usesData && wayOff) {
      app.banner = 'These are far from the expected values — your calculator may not have the exact problem data. Click Restart, then Auto-fill to reload the list, and re-run the procedure.';
    } else {
      app.banner = 'Some values do not match yet. Check sign and decimals, then try again.';
    }
    render();
  }

  async function pressButton(buttonId) {
    if (!app.walkthrough || app.walkthrough.preparing || app.walkthrough.completion || app.busy || app.clutch.autoFilling) {
      return;
    }

    if (!app.clutch.engaged) {
      app.busy = true;

      try {
        await app.bridge.sendButton(buttonId);

        if (app.clutch.phase === 'data-setup') {
          trackDataSetupInput(buttonId);
          app.banner = 'Data setup mode is active. Keys go straight to the calculator.';
        } else if (app.clutch.phase === 'result-review') {
          app.banner = 'Result review mode is active. Explore the output, then finish the review.';
        } else if (app.clutch.phase === 'procedure') {
          app.banner = 'Guidance paused. Fix your entry, then click Resume.';
        }
      } catch (error) {
        app.banner = error.message;
      } finally {
        app.busy = false;
        updateMockCanvas();
        render();
      }

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
        enterResultReviewPhase();
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
    if (!app.walkthrough || app.walkthrough.mode !== 'recall' || app.walkthrough.preparing || app.clutch.phase !== 'procedure') {
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

  async function togglePhysicalMode() {
    const next = !app.persisted.physicalMode;
    app.persisted.physicalMode = next;
    app.optionsDialogOpen = false;
    savePersisted();
    app.banner = next
      ? 'Real calculator mode active. Follow the instructions on your TI-84.'
      : 'On-screen emulator mode active. Press the keys shown on screen.';
    render();

    if (!next) {
      await ensureBridgeInitStarted();
    }
  }

  function physicalAdvance() {
    if (!app.walkthrough || app.walkthrough.preparing || app.clutch.phase !== 'procedure') {
      return;
    }

    const step = currentStep();

    if (!step) {
      return;
    }

    app.walkthrough.routeState = nextRouteState(step);
    app.walkthrough.hintVisible = false;

    if (app.walkthrough.routeState.routeIndex >= currentProcedure().steps.length) {
      enterResultReviewPhase();
      return;
    }

    app.banner = 'Nice. Next step ready.';
    render();
  }

  function physicalBack() {
    if (!app.walkthrough || app.walkthrough.preparing) {
      return;
    }

    const currentIndex = app.walkthrough.routeState.routeIndex;

    if (currentIndex <= 0) {
      return;
    }

    app.walkthrough.routeState = {
      ...app.walkthrough.routeState,
      routeIndex: currentIndex - 1,
    };
    app.walkthrough.hintVisible = false;
    app.banner = 'Stepped back one instruction.';
    render();
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
                <span>${Array.isArray(value) ? formatDataPreview(value, 8) : formatCalculatorValue(value)}</span>
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
              const flash = app.choiceFlash?.procedureId === choiceId ? ` choice-flash-${app.choiceFlash.kind}` : '';
              return `
                <button
                  type="button"
                  class="choice-button${disabled ? ' removed' : ''}${flash}"
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

  function formatDataPreview(data, limit = 12) {
    if (!Array.isArray(data)) {
      return formatCalculatorValue(data);
    }

    if (!Array.isArray(data[0])) {
      const values = data.slice(0, limit).map((entry) => formatCalculatorValue(entry));
      return data.length > limit ? `${values.join(', ')}, ...` : values.join(', ');
    }

    return data
      .map((row) => `[${row.map((entry) => formatCalculatorValue(entry)).join(', ')}]`)
      .join(' ');
  }

  function renderDataSetupPanel(procedure) {
    const dataTarget = app.clutch.dataTarget ?? {};
    const progress = app.clutch.dataProgress ?? {};
    const names = Object.keys(dataTarget);

    return `
      <div class="clutch-card clutch-card-setup">
        <p class="panel-kicker">Data Setup</p>
        <h3>Load the required data before the walkthrough.</h3>
        <p class="panel-note clutch-note">Free play: every key goes straight to the calculator.</p>
        <div class="data-target-list">
          ${names
            .map((name) => {
              const note = procedureDataNote(procedure.id, name);
              return `
                <div class="data-target-row">
                  <strong>${name}${note ? ` (${note})` : ''}</strong>
                  <span>${formatDataPreview(dataTarget[name])}</span>
                </div>
              `;
            })
            .join('')}
        </div>
        <p class="panel-note">Open [STAT] then [ENTER] for lists, or use the matrix editor for matrix data. Click Auto-fill if you want the trainer to type it for you.</p>
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="auto-fill-data" ${app.clutch.autoFilling ? 'disabled' : ''}>
            Auto-fill
          </button>
          <button type="button" class="mac-button" data-action="data-setup-done" ${app.clutch.autoFilling ? 'disabled' : ''}>
            I'm done
          </button>
        </div>
        <div class="data-progress-row">
          ${Object.entries(progress)
            .map(([name, entry]) => `<span class="data-progress-pill">${name}: ${entry.entered}/${entry.total} ${entry.unit}</span>`)
            .join('')}
        </div>
      </div>
    `;
  }

  // Shared renderer for the type-the-result answer rows used by both the
  // emulator result-review panel and the handheld mastery check.
  function renderAnswerFieldRows(fields, values, results) {
    return fields
      .map((field) => {
        const value = values?.[field.key] ?? '';
        const status = results?.[field.key];
        const statusMarkup = !status
          ? '<span class="answer-status"></span>'
          : status.correct
            ? '<span class="answer-status correct">&#10003;</span>'
            : status.failCount >= 3
              ? `<span class="answer-status wrong">&#10007; <span class="answer-hint">Expected: ${escapeHtml(formatExpectedValue(status.expected))}</span></span>`
              : '<span class="answer-status wrong">&#10007; <span class="answer-hint">Not a match - check sign and decimals.</span></span>';

        return `
          <div class="answer-field-row">
            <label class="answer-label" for="answer-${field.key}">${field.label}</label>
            <input
              id="answer-${field.key}"
              class="answer-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              data-answer-key="${field.key}"
              value="${escapeHtml(value)}"
            >
            ${statusMarkup}
          </div>
        `;
      })
      .join('');
  }

  function renderResultReviewPanel() {
    const walkthrough = app.walkthrough;
    const procedure = currentProcedure();
    const fields = procedure ? VERIFICATION_FIELDS[procedure.id] : null;

    if (!walkthrough || !fields) {
      return `
        <div class="clutch-card clutch-card-review">
          <p class="panel-kicker">Result Review</p>
          <h3>Explore the calculator output before finishing.</h3>
          <p class="panel-note clutch-note">Free play: keys go straight to the calculator while you read the result.</p>
          <div class="button-row">
            <button type="button" class="mac-button primary" data-action="finish-review">
              Finish review
            </button>
          </div>
        </div>
      `;
    }

    const results = walkthrough.answerCheckResults ?? {};
    const verifiedClass = walkthrough.answerVerified ? ' verified' : '';
    const fieldRows = renderAnswerFieldRows(fields, walkthrough.answerValues, results);

    return `
      <div class="clutch-card clutch-card-review answer-card${verifiedClass}">
        <p class="panel-kicker">Result Review</p>
        <h3>Check Your Answer</h3>
        <p class="panel-note clutch-note">Free play: keys go straight to the calculator while you read the result.</p>
        <p class="panel-note">Enter the key values from your calculator result.</p>
        ${fieldRows}
        <div class="button-row">
          <button type="button" class="mac-button" data-action="check-answer">
            Check
          </button>
          <button type="button" class="mac-button primary" data-action="finish-review" ${walkthrough.answerVerified || !computeExpected(currentProcedure()?.id, walkthrough.problem) || emulatorDataLeniency() ? '' : 'disabled'}>
            Finish review
          </button>
        </div>
      </div>
    `;
  }

  function renderWalkthroughPanel() {
    const walkthrough = app.walkthrough;
    const mobile = isMobileViewport();
    const procedure = currentProcedure();
    const step = currentStep();
    const stepNumber = walkthrough.routeState.routeIndex + 1;
    const totalSteps = procedure.steps.length;
    const stepInfo = walkthrough ? `Step ${Math.min(stepNumber, totalSteps)}/${totalSteps}` : '';
    const phase = app.clutch.phase;
    let copy = walkthrough.preparing ? 'Resetting the calculator to HOME…' : step?.narration ?? 'Walkthrough complete.';
    let note = walkthrough.preparing ? 'The trainer clears back to HOME before the first step.' : `Step ${Math.min(stepNumber, totalSteps)} of ${totalSteps}`;
    let clutchPanel = '';
    const togglePanel = mobile
      ? ' onclick="if (event.target.closest(\'.compact-problem-bar\')) this.classList.toggle(\'expanded\')"'
      : '';

    if (phase === 'data-setup') {
      copy = 'Enter the required list or matrix data before the guided procedure begins.';
      note = 'Data setup mode';
      clutchPanel = renderDataSetupPanel(procedure);
    } else if (phase === 'result-review') {
      copy = 'The guided procedure is finished. Use the calculator freely to inspect the result.';
      note = 'Result review mode';
      clutchPanel = renderResultReviewPanel();
    }

    if (phase === 'procedure' && !walkthrough.preparing && walkthrough.mode === 'recall' && step) {
      copy = recallNeutralPrompt(walkthrough, totalSteps);
    }

    return `
      <section class="panel problem-panel walkthrough-panel"${togglePanel}>
        <div class="compact-problem-bar">
          <div>
            <p class="panel-kicker">Track 2: Calculator Navigation</p>
            <h2>${procedure.name}</h2>
            ${mobile && stepInfo ? `<p class="panel-note">${stepInfo}</p>` : ''}
          </div>
          <div class="mode-badge-row">
            <span class="mode-badge">${walkthrough.mode === 'guided' ? 'Guided' : 'Recall'}</span>
            ${walkthrough.sourceKind === 'branch' ? '<span class="mode-badge subtle">Branch</span>' : ''}
          </div>
        </div>
        <p class="problem-stem minimized">${walkthrough.problem?.stem ?? procedure.description}</p>
        ${renderValueChips(walkthrough.problem?.values)}
        <div class="walkthrough-copy">
          <p>${copy}</p>
          <p class="panel-note">${note}</p>
        </div>
        ${clutchPanel}
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
        ${app.sessionResult.gradebookSave ? `<p class="panel-note">${app.sessionResult.gradebookSave}</p>` : ''}
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="${app.sessionResult.action}">
            ${app.sessionResult.actionLabel}
          </button>
          ${app.sessionResult.secondaryAction ? `
            <button type="button" class="mac-button" data-action="${app.sessionResult.secondaryAction}">
              ${app.sessionResult.secondaryLabel}
            </button>
          ` : ''}
        </div>
      </section>
    `;
  }

  function renderStartPanel() {
    const firstRun = !app.persisted.introSeen && !Object.keys(app.persisted.records).length;

    if (firstRun) {
      return `
        <section class="panel problem-panel start-panel">
          <p class="panel-kicker">Welcome</p>
          <h2>Learn every TI-84 move AP Stats needs</h2>
          <p class="problem-stem">
            1) Read a problem and pick the right calculator procedure.
            2) We walk you through it key by key.
            3) Finished items come back for review on a schedule, like flashcards.
          </p>
          <p class="panel-note">Do you have a TI-84 calculator with you?</p>
          <div class="button-row">
            <button type="button" class="mac-button primary" data-action="intro-physical">
              Yes, I'll use my TI-84
            </button>
            <button type="button" class="mac-button" data-action="intro-emulator">
              No, use the on-screen calculator
            </button>
          </div>
        </section>
      `;
    }

    const snapshot = sessionSnapshot();
    const caughtUp = snapshot.dueCount === 0 && snapshot.newCount === 0;
    const headline = caughtUp ? 'You are caught up for today!' : 'TI-84 Trainer';
    const detail = caughtUp
      ? 'Nothing is due right now. Extra practice sharpens your weakest procedure — or come back tomorrow.'
      : 'Pick the right procedure for the problem, then we drill the exact key presses. Reviews come back on a schedule, like flashcards.';

    return `
      <section class="panel problem-panel start-panel">
        <p class="panel-kicker">Session Start</p>
        <h2>${headline}</h2>
        <p class="problem-stem">${detail}</p>
        <div class="button-row">
          <button type="button" class="mac-button primary" data-action="start-session">
            ${caughtUp ? 'Practice anyway' : 'Start next item'}
          </button>
        </div>
      </section>
    `;
  }

  function renderProblemColumn() {
    if (app.handheldCheck) {
      return renderHandheldCheck();
    }

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
    const disabled = !app.walkthrough || app.walkthrough.preparing || app.busy || app.clutch.autoFilling ? ' disabled' : '';
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
      && app.clutch.phase === 'procedure'
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

  function physicalKeyLabel(step) {
    if (!step) {
      return '';
    }

    if (stepIsParameter(step)) {
      const token = step.key.slice(1, -1);
      const value = sampleValueForToken(token, app.walkthrough?.problem?.values ?? {});
      return `Type ${value}`;
    }

    return displayKey(step.key);
  }

  function renderPhysicalStepCard() {
    const walkthrough = app.walkthrough;
    const procedure = currentProcedure();

    if (!walkthrough || walkthrough.preparing || !procedure) {
      return `
        <div class="physical-card physical-idle">
          <p class="panel-kicker">Real calculator mode</p>
          <h3>Pick a procedure to start</h3>
          <p>Track 1 asks for the correct procedure first. Once you enter a walkthrough, the step-by-step instructions appear here.</p>
        </div>
      `;
    }

    const totalSteps = procedure.steps.length;
    const stepIndex = Math.min(walkthrough.routeState.routeIndex, Math.max(totalSteps - 1, 0));
    const stepNumber = Math.min(walkthrough.routeState.routeIndex + 1, totalSteps);
    const phase = app.clutch.phase;

    if (phase === 'data-setup') {
      return `
        <div class="physical-card physical-data-setup">
          <p class="panel-kicker">Step 0 — Data setup</p>
          <h3>Enter the required data into your calculator</h3>
          <p class="physical-narration">Open <strong>STAT &rarr; Edit</strong> on your TI-84 and key in the values shown on the left. When every list is loaded, click below to start the guided steps.</p>
          <div class="physical-actions">
            <button type="button" class="mac-button primary" data-action="data-setup-done">Data entered — continue</button>
          </div>
        </div>
      `;
    }

    if (phase === 'result-review') {
      const needsVerify = Boolean(VERIFICATION_FIELDS[procedure.id]) && !walkthrough.answerVerified;
      return `
        <div class="physical-card physical-review">
          <p class="panel-kicker">Result review</p>
          <h3>Read the answer off your calculator</h3>
          <p class="physical-narration">${procedure.description}</p>
          ${needsVerify ? '<p class="physical-note">Check your answer on the left, then finish the review.</p>' : ''}
          <div class="physical-actions">
            <button type="button" class="mac-button" data-action="restart-walkthrough">Restart</button>
            <button type="button" class="mac-button primary" data-action="finish-review">Finish review</button>
          </div>
        </div>
      `;
    }

    const step = procedure.steps[stepIndex];

    if (!step) {
      return `
        <div class="physical-card">
          <p class="panel-kicker">All steps complete</p>
          <h3>${procedure.name} walkthrough done</h3>
          <div class="physical-actions">
            <button type="button" class="mac-button primary" data-action="finish-review">Finish review</button>
          </div>
        </div>
      `;
    }

    const keyLabel = physicalKeyLabel(step);
    const recallPrompt = recallNeutralPrompt(walkthrough, totalSteps).replace('what comes next?', 'do the next step on your calculator.');
    const highlight = step.highlight || '';
    const tips = Array.isArray(step.commonErrors)
      ? step.commonErrors.slice(0, 2).map((entry) => entry?.feedback).filter(Boolean)
      : [];
    const isFirst = stepIndex === 0;

    return `
      <div class="physical-card">
        <div class="physical-card-header">
          <p class="panel-kicker">Step ${stepNumber} of ${totalSteps}</p>
          <p class="physical-procedure-name">${procedure.name}</p>
        </div>
        ${walkthrough.mode === 'recall'
          ? `<p class="physical-narration">${recallPrompt}</p>`
          : `
            <div class="physical-key-pane">
              <span class="physical-key-prefix">Press</span>
              <span class="physical-key-value">${keyLabel}</span>
            </div>
            <p class="physical-narration">${step.narration ?? ''}</p>
          `}
        ${highlight ? `
          <div class="physical-expect">
            <span class="physical-expect-label">You should see</span>
            <span class="physical-expect-value">${highlight}</span>
          </div>
        ` : ''}
        ${tips.length ? `
          <ul class="physical-tips">
            ${tips.map((tip) => `<li>${tip}</li>`).join('')}
          </ul>
        ` : ''}
        <div class="physical-actions">
          <button type="button" class="mac-button" data-action="physical-back" ${isFirst ? 'disabled' : ''}>&larr; Back</button>
          <button type="button" class="mac-button primary" data-action="physical-advance">I did it &rarr;</button>
        </div>
      </div>
    `;
  }

  function renderPhysicalColumn() {
    return `
      <section class="panel calc-panel physical-panel">
        <div class="calc-top">
          <div>
            <p class="panel-kicker">Real Calculator Mode</p>
            <h2>Use your TI-84</h2>
          </div>
          <div class="status-pills">
            <span class="status-pill status-ready">
              <span class="status-indicator" aria-hidden="true"></span>
              Offline-ready
            </span>
          </div>
        </div>

        ${renderPhysicalStepCard()}

        <div class="physical-mode-switch">
          <button type="button" class="mac-button" data-action="toggle-physical-mode">Use the on-screen calculator</button>
          <button type="button" class="mac-button" data-action="open-options-dialog">Options</button>
        </div>
      </section>
    `;
  }

  function renderCalculatorColumn() {
    if (app.handheldCheck) {
      return renderHandheldCalcColumn();
    }

    if (app.persisted.physicalMode) {
      return renderPhysicalColumn();
    }

    const walkthrough = app.walkthrough;
    const mobile = isMobileViewport();
    const step = currentStep();
    const totalSteps = walkthrough ? currentProcedure().steps.length : 0;
    const currentStepNumber = walkthrough ? Math.min(walkthrough.routeState.routeIndex + 1, totalSteps) : 0;
    const statusTone = bridgeStatusTone();
    const idleHeadline = app.bridge?.isRealEmulator?.()
      ? 'The real TI-84 Plus CE is ready.'
      : statusTone === 'loading'
        ? 'Calculator firmware is loading.'
        : 'Simplified calculator mode is active.';
    let walkthroughHeadline = step?.narration ?? 'Walkthrough complete.';
    let walkthroughDetail = `Step ${currentStepNumber} of ${totalSteps}`;

    if (app.clutch.phase === 'data-setup') {
      walkthroughHeadline = 'Data setup mode is active.';
      walkthroughDetail = 'Keys go straight to the calculator while you enter the required values.';
    } else if (app.clutch.phase === 'result-review') {
      walkthroughHeadline = 'Result review mode is active.';
      walkthroughDetail = 'Keys go straight to the calculator while you inspect the result.';
    } else if (walkthrough?.mode === 'recall' && step) {
      walkthroughHeadline = recallNeutralPrompt(walkthrough, totalSteps);
    }

    const firmwareLabel = mobile ? '⚙' : 'Firmware';
    const restartLabel = mobile ? '↺' : 'Restart';
    const hintLabel = mobile ? '?' : 'Hint';
    const pauseLabel = mobile ? '⏸' : 'Pause';
    const resumeLabel = mobile ? '▶' : 'Resume';
    const firmwareAttrs = mobile ? 'title="Firmware" aria-label="Firmware"' : '';
    const restartAttrs = mobile ? 'title="Restart" aria-label="Restart"' : '';
    const hintAttrs = mobile ? 'title="Hint" aria-label="Hint"' : '';
    const pauseAttrs = mobile ? 'title="Pause guidance" aria-label="Pause guidance"' : '';
    const resumeAttrs = mobile ? 'title="Resume guidance" aria-label="Resume guidance"' : '';

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
              <strong>${walkthrough ? walkthroughHeadline : idleHeadline}</strong>
              <span>${walkthrough ? walkthroughDetail : app.bridgeStatus.detail}</span>
            </div>
            <div class="button-row compact">
              <button type="button" class="mac-button" data-action="open-rom-dialog" ${firmwareAttrs}>${firmwareLabel}</button>
              <button type="button" class="mac-button" data-action="toggle-physical-mode" title="Follow along on a real TI-84 instead of the emulator">${mobile ? '📱' : 'Real TI-84'}</button>
              <button type="button" class="mac-button" data-action="restart-walkthrough" ${restartAttrs} ${!walkthrough ? 'disabled' : ''}>${restartLabel}</button>
              <button type="button" class="mac-button" data-action="show-hint" ${hintAttrs} ${!walkthrough || walkthrough.mode !== 'recall' || app.clutch.phase !== 'procedure' ? 'disabled' : ''}>${hintLabel}</button>
              ${walkthrough && app.clutch.phase === 'procedure'
                ? app.clutch.engaged
                  ? `<button type="button" class="mac-button" data-action="pause-guidance" ${pauseAttrs}>${pauseLabel}</button>`
                  : `<button type="button" class="mac-button primary" data-action="resume-guidance" ${resumeAttrs}>${resumeLabel}</button>`
                : ''}
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
    const dashHidden = isMobileViewport() && app.walkthrough ? ' mobile-hidden' : '';

    return `
      <section class="dashboard-row${dashHidden}">
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

  function renderOptionsDialog() {
    if (!app.optionsDialogOpen) {
      return '';
    }

    const physical = app.persisted.physicalMode;
    const toggleLabel = physical ? 'Switch to on-screen emulator' : 'Switch to real calculator mode';
    const toggleHint = physical
      ? 'Use the built-in WASM emulator instead (requires network + firmware).'
      : 'Follow along on your physical TI-84 (works offline).';

    return `
      <div class="dialog-backdrop">
        <section class="dialog-window">
          <div class="dialog-titlebar">
            <span class="close-box"></span>
            <strong>Options</strong>
            <span></span>
          </div>
          <div class="dialog-body">
            <p>Calculator firmware and the built-in emulator are tucked away here so students stay focused on the real TI-84.</p>
            <div class="options-row">
              <button type="button" class="mac-button" data-action="open-rom-dialog">Firmware…</button>
              <span class="dialog-note">Manage the cached WASM calculator ROM.</span>
            </div>
            <div class="options-row">
              <button type="button" class="mac-button" data-action="toggle-physical-mode">${toggleLabel}</button>
              <span class="dialog-note">${toggleHint}</span>
            </div>
            <div class="button-row">
              <button type="button" class="mac-button" data-action="close-options-dialog">Close</button>
            </div>
          </div>
        </section>
      </div>
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
          <button type="button" class="titlebar-button" data-action="open-options-dialog">Options</button>
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
      ${renderOptionsDialog()}
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

    if (screen.lines?.length) {
      const expected = computeExpected(procedure.id, app.walkthrough?.problem);
      screen.lines.slice(0, 6).forEach((line) => {
        lines.push(renderComputedLine(line, expected));
      });
    } else if (screen.items?.length) {
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
    } else if (step && app.walkthrough?.mode !== 'recall') {
      lines.push(step.narration);
    }

    return {
      lines,
      footer: step && app.walkthrough?.mode !== 'recall'
        ? `Expect ${stepIsParameter(step) ? 'numeric entry' : displayKey(step.key)}`
        : procedure.description,
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
    if (!app.question || app.busy || app.choiceFlash) {
      return;
    }

    const correct = procedureId === app.question.correctId;
    app.choiceFlash = { procedureId, kind: correct ? 'correct' : 'wrong' };
    app.banner = correct
      ? 'Correct! Starting the walkthrough…'
      : `Not quite. That leads to ${PROCEDURE_BY_ID[procedureId]?.name ?? 'a different procedure'}.`;
    render();

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    app.choiceFlash = null;

    if (correct) {
      await handleCorrectChoice();
      return;
    }

    app.question.wrongChoices = (app.question.wrongChoices || 0) + 1;
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
      case 'intro-physical':
      case 'intro-emulator': {
        app.persisted.physicalMode = action === 'intro-physical';
        app.persisted.introSeen = true;
        savePersisted();
        if (action === 'intro-emulator') {
          await ensureBridgeInitStarted();
        }
        startNextQuestion();
        break;
      }
      case 'start-session':
      case 'next-item':
        startNextQuestion();
        break;
      case 'start-handheld':
        startHandheldCheck(app.sessionResult?.handheldProcedureId);
        break;
      case 'check-handheld':
        checkHandheld();
        break;
      case 'handheld-confirm':
        confirmHandheld();
        break;
      case 'handheld-skip':
        skipHandheld();
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
      case 'auto-fill-data':
        await autoFillData(app.clutch.dataTarget);
        break;
      case 'data-setup-done':
        confirmDataSetup();
        break;
      case 'check-answer':
        checkAnswerVerification();
        break;
      case 'finish-review': {
        const finishProcedure = currentProcedure();
        const needsVerification = VERIFICATION_FIELDS[finishProcedure?.id]
          && computeExpected(finishProcedure.id, app.walkthrough?.problem);
        if (needsVerification && !app.walkthrough?.answerVerified && !emulatorDataLeniency()) {
          app.banner = 'Check your answer before finishing the review.';
          render();
          break;
        }
        completeWalkthrough();
        break;
      }
      case 'pause-guidance':
        app.clutch.engaged = false;
        app.banner = 'Guidance paused. Keys go straight to the calculator — fix your entry, then click Resume.';
        render();
        break;
      case 'resume-guidance':
        app.clutch.engaged = true;
        app.banner = app.walkthrough.mode === 'guided'
          ? 'Guidance resumed. Follow the highlighted key.'
          : 'Guidance resumed. Continue from memory.';
        render();
        break;
      case 'restart-walkthrough':
        await restartWalkthrough();
        break;
      case 'toggle-physical-mode':
        await togglePhysicalMode();
        break;
      case 'physical-advance':
        physicalAdvance();
        break;
      case 'physical-back':
        physicalBack();
        break;
      case 'return-question':
        app.sessionResult = null;
        app.banner = 'Original question restored. The explored distractor is removed.';
        render();
        break;
      case 'open-rom-dialog':
        app.optionsDialogOpen = false;
        app.romDialogOpen = true;
        render();
        await ensureBridgeInitStarted();
        break;
      case 'close-rom-dialog':
        app.romDialogOpen = false;
        render();
        break;
      case 'open-options-dialog':
        app.optionsDialogOpen = true;
        render();
        break;
      case 'close-options-dialog':
        app.optionsDialogOpen = false;
        render();
        break;
      case 'choose-rom': {
        document.getElementById('rom-file-input')?.click();
        break;
      }
      case 'clear-rom':
        try {
          await app.bridge.clearStoredRom();
          clearListMemory();
          app.bridgeStatus = app.bridge.getStatus();
          app.romDialogOpen = false;
          app.banner = 'Cached firmware and saved list memory were cleared. Simplified mode is active until firmware is loaded again.';
          updateMockCanvas();
          render();
        } catch (error) {
          app.banner = `Could not clear cached firmware. ${error.message}`;
          render();
        }
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
        await ensureBridgeInitStarted();
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

  function handleInput(event) {
    const answerKey = event.target?.dataset?.answerKey;

    if (!answerKey) {
      return;
    }

    if (app.handheldCheck) {
      app.handheldCheck.values = {
        ...(app.handheldCheck.values ?? {}),
        [answerKey]: event.target.value,
      };
      return;
    }

    if (!app.walkthrough) {
      return;
    }

    app.walkthrough.answerValues = {
      ...(app.walkthrough.answerValues ?? {}),
      [answerKey]: event.target.value,
    };

    if (app.walkthrough.answerVerified || app.walkthrough.answerCheckResults) {
      app.walkthrough.answerVerified = false;
      app.walkthrough.answerCheckResults = null;
      resetAnswerVerificationUi();
    }
  }

  function handleKeydown(event) {
    if (event.key !== 'Enter' || !event.target?.classList?.contains('answer-input')) {
      return;
    }

    event.preventDefault();

    if (app.handheldCheck) {
      checkHandheld();
      return;
    }

    checkAnswerVerification();
  }

  function bindEvents() {
    root.addEventListener('click', (event) => {
      void handleClick(event);
    });

    root.addEventListener('change', (event) => {
      void handleChange(event);
    });

    root.addEventListener('input', handleInput);
    root.addEventListener('keydown', handleKeydown);
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

  async function ensureBridgeInitStarted() {
    if (app.bridgeInitPromise) {
      return app.bridgeInitPromise;
    }

    app.bridgeInitStarted = true;
    app.bridgeInitPromise = app.bridge.init().then(() => {
      app.bridgeStatus = app.bridge.getStatus();
      if (app.bridgeStatus.code === 'needs-rom' && app.bridgeStatus.manualSelectionAvailable) {
        app.romDialogOpen = true;
        app.banner = 'Firmware auto-download is not configured. Choose a local ROM file to boot CEmu during development.';
      } else if (bridgeStatusTone() === 'offline') {
        app.banner = app.bridgeStatus.detail;
      }
      updateMockCanvas();
      render();
      return app.bridgeStatus;
    });

    return app.bridgeInitPromise;
  }

  // Honor a '#unit=N' deep link (e.g. from the Desk) for this session only —
  // the persisted unit filter is left untouched.
  function applyUnitHash() {
    const match = /[#&]unit=(\d+)/.exec(window.location.hash ?? '');

    if (!match) {
      return;
    }

    const unit = Number(match[1]);

    if (PROCEDURES.some((procedure) => procedure.unit === unit)) {
      app.filterUnit = String(unit);
    }
  }

  async function init() {
    attachBridge();
    bindEvents();
    applyUnitHash();
    render();

    if (!app.persisted.physicalMode) {
      await ensureBridgeInitStarted();
      return;
    }

    app.bridgeStatus = app.bridge.getStatus();
    updateMockCanvas();
    render();
  }

  window.addEventListener('beforeunload', () => {
    app.bridge?.destroy();
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeRenderTimer);
    resizeRenderTimer = window.setTimeout(() => {
      const nowMobile = isMobileViewport();

      if (nowMobile !== wasMobile) {
        wasMobile = nowMobile;
        render();
      }
    }, 120);
  });

  void init();
}());

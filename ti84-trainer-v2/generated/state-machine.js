(function () {
const proceduresData = window.TI84V2ProceduresData;

/**
 * TI-84 Plus CE AP Statistics State Machine
 * Deterministic: transition(state, key) -> newState | null
 *
 * The JSON procedure traces compress some real calculator navigation
 * (for example, jumping deep into long menus with a single DOWN step).
 * To keep the engine deterministic and still replay every authored trace,
 * the machine supports an optional guided-route mode. Generic structural
 * navigation still works without route context.
 */

const SCREENS = Object.fromEntries(
  proceduresData.screens.map((screen) => [screen.id, deepClone(screen)]),
);

const ROUTE_START_SCREENS = {
  'clear-lists': 'stat-edit-lists',
  'select-data-vs-stats': 't-test-data-wizard',
  'set-plot-type': 'plot1-editor-scatter',
  'zoom-stat': 'scatterplot-graph',
  'access-resid-list': 'plot1-editor-resid',
  'select-alternative': 't-test-data-wizard',
  'calculate-vs-draw': 'one-propztest-wizard',
};

const ROUTES = new Map(
  [...proceduresData.procedures, ...proceduresData.microSkills].map((route) => [
    route.id,
    {
      ...deepClone(route),
      startScreen: ROUTE_START_SCREENS[route.id] ?? 'home',
    },
  ]),
);

const TAB_SWITCHES = {
  'stat-menu': { RIGHT: 'stat-calc-menu' },
  'stat-calc-menu': { LEFT: 'stat-menu', RIGHT: 'stat-tests-menu' },
  'stat-tests-menu': { LEFT: 'stat-calc-menu' },
  'matrix-menu-names': { RIGHT: 'matrix-menu-math' },
  'matrix-menu-math': { LEFT: 'matrix-menu-names', RIGHT: 'matrix-menu-edit' },
  'matrix-menu-edit': { LEFT: 'matrix-menu-math' },
};

const MENU_SELECTIONS = {
  'stat-menu': {
    0: 'stat-edit-lists',
  },
  'stat-calc-menu': {
    0: 'one-var-stats-wizard',
    1: 'linreg-wizard',
    2: 'linreg-wizard',
  },
  'stat-tests-menu': {
    1: 't-test-data-wizard',
    3: 'two-samp-ttest-stats-wizard',
    4: 'one-propztest-wizard',
    7: 't-interval-data-wizard',
    9: 'two-samp-tint-stats-wizard',
    10: 'one-propzint-wizard',
    12: 'chi2test-wizard',
    13: 'chi2gof-wizard',
    15: 'linreg-ttest-wizard',
    16: 'linreg-tint-wizard',
  },
  'distr-menu': {
    1: 'normalcdf-wizard',
    2: 'invnorm-wizard',
    10: 'binompdf-wizard',
    11: 'binomcdf-wizard',
    14: 'geometpdf-wizard',
    15: 'geometcdf-wizard',
  },
  'stat-plot-menu': {
    0: 'plot1-editor-scatter',
  },
  'zoom-menu': {
    0: '__zoom_target__',
  },
  'matrix-menu-edit': {
    0: 'matrix-editor-a-dims',
  },
  'list-names-menu': {
    0: '__list_L1__',
    1: '__list_L2__',
    2: '__list_L3__',
    3: '__list_L4__',
    4: '__list_L5__',
    5: '__list_L6__',
    6: '__list_RESID__',
  },
  'catalog-d-section': {
    0: '__catalog_command__',
    1: '__catalog_command__',
    2: '__catalog_command__',
  },
};

const TRACE_SCREENS = {
  'histogram-graph': 'histogram-trace',
  'modified-boxplot-graph': 'modified-boxplot-trace',
  'scatterplot-graph': 'scatterplot-trace',
};

const GRAPH_FOR_PLOT_EDITOR = {
  'plot1-editor-scatter': 'scatterplot-graph',
  'plot1-editor-hist': 'histogram-graph',
  'plot1-editor-modbox': 'modified-boxplot-graph',
  'plot1-editor-resid': 'residual-plot-graph',
};

const PLOT_EDITOR_SEQUENCE = [
  'plot1-editor-scatter',
  'plot1-editor-hist',
  'plot1-editor-modbox',
  'plot1-editor-resid',
];

const RESULT_SCROLL_TARGETS = {
  'one-var-stats-result-page1': { DOWN: 'one-var-stats-result-page2' },
  'one-var-stats-result-page2': { UP: 'one-var-stats-result-page1' },
};

const INPUT_MODE_SWITCHES = {
  't-test-data-wizard': { RIGHT: 't-test-stats-wizard' },
  't-test-stats-wizard': { LEFT: 't-test-data-wizard' },
  't-interval-data-wizard': { RIGHT: 't-interval-stats-wizard' },
  't-interval-stats-wizard': { LEFT: 't-interval-data-wizard' },
};

const ACTION_TARGETS = {
  'one-var-stats-wizard': { Calculate: 'one-var-stats-result-page1' },
  'normalcdf-wizard': { Paste: 'home' },
  'invnorm-wizard': { Paste: 'home' },
  'binompdf-wizard': { Paste: 'home' },
  'binomcdf-wizard': { Paste: 'home' },
  'geometpdf-wizard': { Paste: 'home' },
  'geometcdf-wizard': { Paste: 'home' },
  'linreg-wizard': { Calculate: 'linreg-result' },
  't-test-data-wizard': { Calculate: 't-test-result', Draw: 't-test-result' },
  't-test-stats-wizard': { Calculate: 't-test-result', Draw: 't-test-result' },
  't-interval-data-wizard': { Calculate: 't-interval-result' },
  't-interval-stats-wizard': { Calculate: 't-interval-result' },
  'two-samp-ttest-stats-wizard': {
    Calculate: 'two-samp-ttest-result',
    Draw: 'two-samp-ttest-result',
  },
  'two-samp-tint-stats-wizard': { Calculate: 'two-samp-tint-result' },
  'one-propztest-wizard': {
    Calculate: 'one-propztest-result',
    Draw: 'one-propztest-result',
  },
  'one-propzint-wizard': { Calculate: 'one-propzint-result' },
  'chi2gof-wizard': { Calculate: 'chi2gof-result', Draw: 'chi2gof-draw' },
  'chi2test-wizard': { Calculate: 'chi2test-result', Draw: 'chi2test-draw' },
  'linreg-ttest-wizard': { Calculate: 'linreg-ttest-result' },
  'linreg-tint-wizard': { Calculate: 'linreg-tint-result' },
};

const COMPOUND_KEYS = {
  '2ND_DISTR': 'distr-menu',
  '2ND_STATPLOT': 'stat-plot-menu',
  '2ND_MATRIX': 'matrix-menu-names',
};

const VALIDATION_KEYS = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'ENTER',
  'CLEAR',
  '2ND',
  '2ND_QUIT',
  'STAT',
  'VARS',
  'Y=',
  'ZOOM',
  'TRACE',
  'X_INVERSE',
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
  '2ND_DISTR',
  '2ND_STATPLOT',
  '2ND_MATRIX',
  '2ND_LIST',
];

function createState(screenId = 'home', options = {}) {
  const screen = SCREENS[screenId];

  if (!screen) {
    throw new Error(`Unknown TI-84 screen: ${screenId}`);
  }

  const state = deepClone(screen);

  state.secondActive = options.secondActive ?? screenId === 'home-second';
  state.routeId = options.routeId ?? null;
  state.routeIndex = options.routeIndex ?? 0;
  state.returnScreen = options.returnScreen ?? null;
  state.returnFieldIndex = options.returnFieldIndex ?? null;
  state.zoomTarget = options.zoomTarget ?? defaultZoomTarget(screenId);
  state.homeCommandType = options.homeCommandType ?? null;
  state.selectorMode = options.selectorMode ?? null;
  state.traceMode = options.traceMode ?? screenId.endsWith('-trace');
  state.traceIndex = options.traceIndex ?? 0;
  state.inputMode = options.inputMode ?? defaultInputMode(screenId);

  if (screen.items) {
    state.cursorIndex = options.cursorIndex ?? screen.cursor ?? 0;
    state.cursor = state.cursorIndex;
  }

  if (screen.fields) {
    const initialValues = options.fieldValues ?? [];

    state.fields = screen.fields.map((field, index) => {
      const normalized = normalizeField(field);
      const overrideValue = initialValues[index];

      if (overrideValue !== undefined) {
        normalized.value = overrideValue;
      }

      return normalized;
    });

    state.activeField = options.activeField ?? 0;
  }

  if (screen.columns) {
    state.editorColumn = options.editorColumn ?? 0;
    state.editorRow = options.editorRow ?? 0;
    state.onHeader = options.onHeader ?? false;
  }

  if (screenId === 'matrix-editor-a-dims') {
    state.matrixDimensions = {
      rows: options.rows ?? '',
      cols: options.cols ?? '',
    };
  }

  if (screenId === 'matrix-editor-a-values') {
    state.matrixCursor = {
      row: options.matrixRow ?? 0,
      col: options.matrixCol ?? 0,
    };
  }

  return state;
}

function createRouteState(routeId) {
  const route = ROUTES.get(routeId);

  if (!route) {
    throw new Error(`Unknown TI-84 route: ${routeId}`);
  }

  return createState(route.startScreen, { routeId });
}

function transition(state, key) {
  const currentState = normalizeStateInput(state);
  const structuralNext = structuralTransition(currentState, key);
  const routeStep = getNextRouteStep(currentState);

  if (routeStep && routeStep.key === key) {
    if (structuralNext && structuralNext.id === routeStep.screen) {
      return advanceRoute(structuralNext, currentState);
    }

    return advanceRoute(
      fallbackGuidedState(currentState, routeStep),
      currentState,
    );
  }

  return structuralNext;
}

function validKeys(state) {
  const currentState = normalizeStateInput(state);
  const keys = new Set();

  for (const key of VALIDATION_KEYS) {
    if (transition(currentState, key)) {
      keys.add(key);
    }
  }

  const parameterKey = suggestedParameterKey(currentState);

  if (parameterKey && transition(currentState, parameterKey)) {
    keys.add(parameterKey);
  }

  return [...keys];
}

function structuralTransition(state, key) {
  if (COMPOUND_KEYS[key]) {
    return moveToScreen(state, COMPOUND_KEYS[key], { secondActive: false });
  }

  if (key === '2ND_LIST') {
    return moveToScreen(state, 'list-names-menu', {
      secondActive: false,
      returnScreen: state.id,
      returnFieldIndex: state.activeField ?? null,
    });
  }

  if (key === '2ND_QUIT') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: null,
      selectorMode: null,
      traceMode: false,
    });
  }

  if (key === 'CLEAR') {
    return handleClear(state);
  }

  if (key === '2ND') {
    return handleSecond(state);
  }

  if (state.id === 'home-second') {
    return handleHomeSecond(state, key);
  }

  if (state.secondActive) {
    const comboResult = handleSecondCombo(state, key);

    if (comboResult) {
      return comboResult;
    }
  }

  switch (state.type) {
    case 'home':
      return handleHome(state, key);
    case 'menu':
      return handleMenu(state, key);
    case 'wizard':
      return handleWizard(state, key);
    case 'editor':
      return handleEditor(state, key);
    case 'result':
      return handleResult(state, key);
    case 'graph':
      return handleGraph(state, key);
    default:
      return null;
  }
}

function handleClear(state) {
  if (state.id === 'list-names-menu' && state.returnScreen) {
    return moveToScreen(state, state.returnScreen, {
      secondActive: false,
      returnScreen: null,
      returnFieldIndex: null,
    });
  }

  if (state.type === 'menu') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: null,
    });
  }

  if (state.id === 'home-second') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: state.homeCommandType,
    });
  }

  if (state.type === 'wizard' || state.type === 'result' || state.type === 'graph') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: null,
      traceMode: false,
    });
  }

  if (state.id === 'stat-edit-lists' || state.id === 'residual-list-editor') {
    if (state.onHeader) {
      return cloneOnSameScreen(state, {
        secondActive: false,
      });
    }

    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: null,
    });
  }

  if (isFieldInputScreen(state) && getActiveField(state)) {
    const nextState = cloneOnSameScreen(state, { secondActive: false });

    nextState.fields[nextState.activeField].value = '';
    return nextState;
  }

  return null;
}

function handleSecond(state) {
  if (state.id === 'home') {
    return moveToScreen(state, 'home-second', {
      secondActive: true,
      homeCommandType: state.homeCommandType,
    });
  }

  if (state.id === 'home-second') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: state.homeCommandType,
    });
  }

  return cloneOnSameScreen(state, { secondActive: true });
}

function handleHome(state, key) {
  if (key === 'STAT') {
    return moveToScreen(state, 'stat-menu', { secondActive: false });
  }

  if (key === 'ZOOM') {
    return moveToScreen(state, 'zoom-menu', {
      secondActive: false,
      zoomTarget: 'scatterplot-graph',
    });
  }

  if (key === 'ENTER' && state.homeCommandType === 'distribution') {
    return moveToScreen(state, 'distribution-home-result', {
      secondActive: false,
      homeCommandType: null,
    });
  }

  if (key === 'ENTER' && state.homeCommandType === 'catalog') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: null,
    });
  }

  return null;
}

function handleHomeSecond(state, key) {
  if (key === 'Y=') {
    return moveToScreen(state, 'stat-plot-menu', { secondActive: false });
  }

  if (key === 'VARS') {
    return moveToScreen(state, 'distr-menu', { secondActive: false });
  }

  if (key === 'X_INVERSE') {
    return moveToScreen(state, 'matrix-menu-names', { secondActive: false });
  }

  if (key === '0') {
    return moveToScreen(state, 'catalog-top', { secondActive: false });
  }

  if (key === 'STAT') {
    return moveToScreen(state, 'list-names-menu', {
      secondActive: false,
      returnScreen: 'home',
    });
  }

  return null;
}

function handleSecondCombo(state, key) {
  const activeField = getActiveField(state);

  if (
    state.id === 'plot1-editor-resid' &&
    key === 'STAT'
  ) {
    return moveToScreen(state, 'list-names-menu', {
      secondActive: false,
      returnScreen: state.id,
      returnFieldIndex: state.activeField ?? null,
      cursorIndex: 0,
    });
  }

  if (activeField && isDigitKey(key)) {
    if (activeField.type === 'list-selector' && Number(key) >= 1 && Number(key) <= 6) {
      return setActiveFieldValue(state, `L${key}`, { secondActive: false });
    }

    if (activeField.type === 'matrix-selector' && Number(key) >= 1 && Number(key) <= 3) {
      return setActiveFieldValue(state, `[${String.fromCharCode(64 + Number(key))}]`, {
        secondActive: false,
      });
    }
  }

  return null;
}

function handleMenu(state, key) {
  if (state.id === 'catalog-top' && key === 'X_INVERSE') {
    return moveToScreen(state, 'catalog-d-section', { secondActive: false });
  }

  const tabTarget = TAB_SWITCHES[state.id]?.[key];

  if (tabTarget) {
    return moveToScreen(state, tabTarget, {
      secondActive: false,
      cursorIndex: 0,
    });
  }

  if (key === 'UP' || key === 'DOWN') {
    const delta = key === 'DOWN' ? 1 : -1;
    const itemCount = state.items.length;
    const nextCursor = wrapIndex(state.cursorIndex, itemCount, delta);

    return cloneOnSameScreen(state, {
      cursorIndex: nextCursor,
      secondActive: false,
    });
  }

  if (isDigitKey(key)) {
    const shortcutSelection = shortcutIndex(state.items, key);

    if (shortcutSelection !== null) {
      return selectMenuItem(state, shortcutSelection);
    }
  }

  if (key === 'ENTER') {
    return selectMenuItem(state, state.cursorIndex);
  }

  if (key === 'ZOOM') {
    return moveToScreen(state, 'zoom-menu', {
      secondActive: false,
      zoomTarget: state.zoomTarget ?? 'scatterplot-graph',
    });
  }

  return null;
}

function handleWizard(state, key) {
  if (isParameterKey(key) || (acceptsLiteralInput(state) && isLiteralInputKey(key))) {
    return setActiveFieldValue(state, normalizeInputKey(key), { secondActive: false });
  }

  if (key === 'UP' || key === 'DOWN') {
    const nextField = clampIndex(
      state.activeField + (key === 'DOWN' ? 1 : -1),
      0,
      state.fields.length - 1,
    );

    return cloneOnSameScreen(state, {
      activeField: nextField,
      secondActive: false,
      selectorMode: null,
    });
  }

  if (key === 'VARS' && getActiveField(state)?.type === 'equation-selector') {
    return cloneOnSameScreen(state, {
      secondActive: false,
      selectorMode: 'yvars',
    });
  }

  if (key === 'LEFT' || key === 'RIGHT') {
    const inputModeScreen = INPUT_MODE_SWITCHES[state.id]?.[key];

    if (inputModeScreen && state.activeField === 0) {
      return moveToScreen(state, inputModeScreen, {
        secondActive: false,
      });
    }

    if (
      state.id === 'two-samp-ttest-stats-wizard' &&
      state.activeField === 0
    ) {
      const nextMode = key === 'RIGHT' ? 'Stats' : 'Data';

      return cloneOnSameScreen(state, {
        secondActive: false,
        inputMode: nextMode,
      });
    }

    if (
      state.id === 'two-samp-tint-stats-wizard' &&
      state.activeField === 0
    ) {
      const nextMode = key === 'RIGHT' ? 'Stats' : 'Data';

      return cloneOnSameScreen(state, {
        secondActive: false,
        inputMode: nextMode,
      });
    }

    if (
      getActiveField(state)?.type === 'equation-selector' &&
      state.selectorMode === 'yvars' &&
      key === 'RIGHT'
    ) {
      return cloneOnSameScreen(state, {
        secondActive: false,
        selectorMode: 'function',
      });
    }

    const choiceResult = cycleChoiceField(state, key);

    if (choiceResult) {
      return choiceResult;
    }
  }

  if (key === 'ENTER') {
    if (getActiveField(state)?.type === 'equation-selector') {
      if (state.selectorMode === 'function') {
        return cloneOnSameScreen(state, {
          secondActive: false,
          selectorMode: 'selected-y1',
        });
      }

      if (state.selectorMode === 'selected-y1') {
        return setActiveFieldValue(state, 'Y1', {
          secondActive: false,
          selectorMode: null,
        });
      }
    }

    const actionTarget = actionTargetForState(state);

    if (actionTarget) {
      return actionTarget;
    }

    if (getActiveField(state)?.type === 'choice') {
      return cloneOnSameScreen(state, { secondActive: false });
    }
  }

  return null;
}

function handleEditor(state, key) {
  if (state.id === 'stat-edit-lists' || state.id === 'residual-list-editor') {
    return handleListEditor(state, key);
  }

  if (state.id === 'matrix-editor-a-values') {
    return handleMatrixValueEditor(state, key);
  }

  if (isParameterKey(key) || (acceptsLiteralInput(state) && isLiteralInputKey(key))) {
    return setActiveFieldValue(state, normalizeInputKey(key), { secondActive: false });
  }

  if (key === 'UP' || key === 'DOWN') {
    const nextField = clampIndex(
      state.activeField + (key === 'DOWN' ? 1 : -1),
      0,
      state.fields.length - 1,
    );

    return cloneOnSameScreen(state, {
      activeField: nextField,
      secondActive: false,
    });
  }

  if (key === 'LEFT' || key === 'RIGHT') {
    const typeRow = getActiveField(state)?.label.startsWith('Type');

    if (typeRow && key === 'RIGHT') {
      return cyclePlotEditor(state);
    }

    const choiceResult = cycleChoiceField(state, key);

    if (choiceResult) {
      return choiceResult;
    }
  }

  if (key === 'ENTER') {
    if (state.id === 'matrix-editor-a-dims') {
      if (state.activeField === 0) {
        return cloneOnSameScreen(state, {
          activeField: 1,
          secondActive: false,
        });
      }

      return moveToScreen(state, 'matrix-editor-a-values', {
        secondActive: false,
        rows: state.matrixDimensions?.rows ?? '',
        cols: state.matrixDimensions?.cols ?? '',
      });
    }

    return cloneOnSameScreen(state, { secondActive: false });
  }

  if (key === 'ZOOM') {
    return moveToScreen(state, 'zoom-menu', {
      secondActive: false,
      zoomTarget: GRAPH_FOR_PLOT_EDITOR[state.id] ?? state.zoomTarget,
    });
  }

  return null;
}

function handleListEditor(state, key) {
  if (isParameterKey(key) || isLiteralInputKey(key)) {
    return cloneOnSameScreen(state, { secondActive: false });
  }

  if (key === 'ENTER') {
    return cloneOnSameScreen(state, {
      editorRow: state.editorRow + 1,
      onHeader: false,
      secondActive: false,
    });
  }

  if (key === 'RIGHT') {
    return cloneOnSameScreen(state, {
      editorColumn: clampIndex(state.editorColumn + 1, 0, state.columns.length - 1),
      secondActive: false,
    });
  }

  if (key === 'LEFT') {
    return cloneOnSameScreen(state, {
      editorColumn: clampIndex(state.editorColumn - 1, 0, state.columns.length - 1),
      secondActive: false,
    });
  }

  if (key === 'UP') {
    if (state.onHeader) {
      return cloneOnSameScreen(state, { secondActive: false });
    }

    if (state.editorRow === 0) {
      return cloneOnSameScreen(state, {
        onHeader: true,
        secondActive: false,
      });
    }

    return cloneOnSameScreen(state, {
      editorRow: state.editorRow - 1,
      secondActive: false,
    });
  }

  if (key === 'DOWN') {
    if (state.onHeader) {
      return cloneOnSameScreen(state, {
        onHeader: false,
        editorRow: 0,
        secondActive: false,
      });
    }

    return cloneOnSameScreen(state, {
      editorRow: state.editorRow + 1,
      secondActive: false,
    });
  }

  return null;
}

function handleMatrixValueEditor(state, key) {
  if (isParameterKey(key) || isLiteralInputKey(key)) {
    return cloneOnSameScreen(state, { secondActive: false });
  }

  if (key === 'ENTER') {
    return cloneOnSameScreen(state, {
      matrixCol: state.matrixCursor.col + 1,
      secondActive: false,
    });
  }

  return null;
}

function handleResult(state, key) {
  const scrollTarget = RESULT_SCROLL_TARGETS[state.id]?.[key];

  if (scrollTarget) {
    return moveToScreen(state, scrollTarget, {
      secondActive: false,
    });
  }

  if (key === 'DOWN' && state.scrollable) {
    return cloneOnSameScreen(state, { secondActive: false });
  }

  return null;
}

function handleGraph(state, key) {
  if (key === 'TRACE') {
    const traceScreen = TRACE_SCREENS[state.id];

    if (traceScreen) {
      return moveToScreen(state, traceScreen, {
        secondActive: false,
        traceMode: true,
      });
    }

    return cloneOnSameScreen(state, {
      secondActive: false,
      traceMode: true,
    });
  }

  if ((key === 'LEFT' || key === 'RIGHT') && (state.traceMode || state.id.endsWith('-trace'))) {
    return cloneOnSameScreen(state, {
      traceIndex: Math.max(0, state.traceIndex + (key === 'RIGHT' ? 1 : -1)),
      secondActive: false,
      traceMode: true,
    });
  }

  if (key === 'ZOOM') {
    return moveToScreen(state, 'zoom-menu', {
      secondActive: false,
      zoomTarget: state.id.endsWith('-trace')
        ? graphScreenForTrace(state.id)
        : state.id,
    });
  }

  return null;
}

function selectMenuItem(state, selectionIndex) {
  const target = MENU_SELECTIONS[state.id]?.[selectionIndex];

  if (!target) {
    return null;
  }

  if (target === '__zoom_target__') {
    return moveToScreen(state, state.zoomTarget ?? 'scatterplot-graph', {
      secondActive: false,
    });
  }

  if (target === '__catalog_command__') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: 'catalog',
    });
  }

  if (target.startsWith('__list_')) {
    return resolveListNameSelection(state, target);
  }

  if (target === 'two-samp-ttest-stats-wizard') {
    return moveToScreen(state, target, {
      secondActive: false,
      inputMode: 'Data',
    });
  }

  if (target === 'two-samp-tint-stats-wizard') {
    return moveToScreen(state, target, {
      secondActive: false,
      inputMode: 'Data',
    });
  }

  return moveToScreen(state, target, { secondActive: false });
}

function resolveListNameSelection(state, token) {
  const listName = token.replace('__list_', '').replace('__', '');
  const targetScreen = state.returnScreen ?? 'plot1-editor-resid';

  if (targetScreen === 'home') {
    return moveToScreen(state, 'home', {
      secondActive: false,
    });
  }

  const nextState = moveToScreen(state, targetScreen, {
    secondActive: false,
    activeField: state.returnFieldIndex ?? 0,
    returnScreen: null,
    returnFieldIndex: null,
  });

  if (!nextState.fields || nextState.activeField == null) {
    return nextState;
  }

  nextState.fields[nextState.activeField].value = listName;
  return nextState;
}

function cycleChoiceField(state, key) {
  const activeField = getActiveField(state);

  if (!activeField) {
    return null;
  }

  const adjacentActionIndex = findAdjacentActionField(state, key);

  if (adjacentActionIndex !== null) {
    return cloneOnSameScreen(state, {
      activeField: adjacentActionIndex,
      secondActive: false,
    });
  }

  if (activeField.type !== 'choice') {
    return null;
  }

  const options = activeField.options ?? [];

  if (options.length === 0) {
    return null;
  }

  const currentValue = activeField.value || options[0];
  const currentIndex = Math.max(0, options.indexOf(currentValue));
  const nextIndex = wrapIndex(
    currentIndex,
    options.length,
    key === 'RIGHT' ? 1 : -1,
  );

  return setActiveFieldValue(state, options[nextIndex], { secondActive: false });
}

function actionTargetForState(state) {
  const activeField = getActiveField(state);

  if (!activeField || activeField.type !== 'action-button') {
    return null;
  }

  const targetScreen = ACTION_TARGETS[state.id]?.[activeField.label];

  if (!targetScreen) {
    return null;
  }

  if (targetScreen === 'home') {
    return moveToScreen(state, 'home', {
      secondActive: false,
      homeCommandType: 'distribution',
    });
  }

  return moveToScreen(state, targetScreen, {
    secondActive: false,
  });
}

function cyclePlotEditor(state) {
  const currentIndex = PLOT_EDITOR_SEQUENCE.indexOf(state.id);
  const nextIndex = wrapIndex(currentIndex, PLOT_EDITOR_SEQUENCE.length, 1);
  const nextScreen = PLOT_EDITOR_SEQUENCE[nextIndex];

  return moveToScreen(state, nextScreen, {
    activeField: state.activeField,
    secondActive: false,
  });
}

function setActiveFieldValue(state, value, overrides = {}) {
  const nextState = cloneOnSameScreen(state, overrides);

  if (!nextState.fields || nextState.activeField == null) {
    return nextState;
  }

  if (nextState.id === 'matrix-editor-a-dims') {
    if (nextState.activeField === 0) {
      nextState.matrixDimensions.rows = value;
    } else {
      nextState.matrixDimensions.cols = value;
    }
  }

  nextState.fields[nextState.activeField].value = value;
  return nextState;
}

function moveToScreen(state, screenId, overrides = {}) {
  return createState(screenId, {
    routeId: overrides.routeId ?? state.routeId ?? null,
    routeIndex: overrides.routeIndex ?? state.routeIndex ?? 0,
    secondActive: overrides.secondActive ?? false,
    returnScreen: overrides.returnScreen ?? state.returnScreen ?? null,
    returnFieldIndex: overrides.returnFieldIndex ?? state.returnFieldIndex ?? null,
    zoomTarget: overrides.zoomTarget ?? defaultZoomTarget(screenId) ?? state.zoomTarget ?? null,
    homeCommandType: overrides.homeCommandType ?? null,
    selectorMode: overrides.selectorMode ?? null,
    activeField: overrides.activeField,
    fieldValues: overrides.fieldValues,
    cursorIndex: overrides.cursorIndex,
    inputMode: overrides.inputMode,
    editorColumn: overrides.editorColumn,
    editorRow: overrides.editorRow,
    onHeader: overrides.onHeader,
    rows: overrides.rows,
    cols: overrides.cols,
    matrixRow: overrides.matrixRow,
    matrixCol: overrides.matrixCol,
    traceIndex: overrides.traceIndex,
    traceMode: overrides.traceMode,
  });
}

function cloneOnSameScreen(state, overrides = {}) {
  return createState(state.id, {
    routeId: overrides.routeId ?? state.routeId ?? null,
    routeIndex: overrides.routeIndex ?? state.routeIndex ?? 0,
    secondActive: overrides.secondActive ?? state.secondActive ?? false,
    returnScreen: overrides.returnScreen ?? state.returnScreen ?? null,
    returnFieldIndex: overrides.returnFieldIndex ?? state.returnFieldIndex ?? null,
    zoomTarget: overrides.zoomTarget ?? state.zoomTarget ?? null,
    homeCommandType: overrides.homeCommandType ?? state.homeCommandType ?? null,
    selectorMode: overrides.selectorMode ?? state.selectorMode ?? null,
    activeField: overrides.activeField ?? state.activeField,
    fieldValues:
      overrides.fieldValues ??
      (state.fields ? state.fields.map((field) => field.value ?? '') : undefined),
    cursorIndex: overrides.cursorIndex ?? state.cursorIndex,
    inputMode: overrides.inputMode ?? state.inputMode,
    editorColumn: overrides.editorColumn ?? state.editorColumn,
    editorRow: overrides.editorRow ?? state.editorRow,
    onHeader: overrides.onHeader ?? state.onHeader,
    rows: overrides.rows ?? state.matrixDimensions?.rows,
    cols: overrides.cols ?? state.matrixDimensions?.cols,
    matrixRow: overrides.matrixRow ?? state.matrixCursor?.row,
    matrixCol: overrides.matrixCol ?? state.matrixCursor?.col,
    traceIndex: overrides.traceIndex ?? state.traceIndex,
    traceMode: overrides.traceMode ?? state.traceMode,
  });
}

function normalizeStateInput(state) {
  if (!state?.id || !SCREENS[state.id]) {
    throw new Error('transition() requires a valid TI-84 state created by createState().');
  }

  return state;
}

function getNextRouteStep(state) {
  if (!state.routeId) {
    return null;
  }

  const route = ROUTES.get(state.routeId);

  if (!route) {
    return null;
  }

  return route.steps[state.routeIndex] ?? null;
}

function advanceRoute(nextState, currentState) {
  if (!currentState.routeId) {
    return nextState;
  }

  nextState.routeId = currentState.routeId;
  nextState.routeIndex = currentState.routeIndex + 1;
  return nextState;
}

function fallbackGuidedState(state, routeStep) {
  return moveToScreen(state, routeStep.screen, {
    secondActive: false,
  });
}

function normalizeField(field) {
  if (typeof field === 'string') {
    return {
      label: field,
      type: inferFieldTypeFromLabel(field),
      value: inferDefaultValue(field),
    };
  }

  return {
    ...deepClone(field),
    type: field.type ?? inferFieldTypeFromLabel(field.label),
    value: field.value ?? field.default ?? '',
  };
}

function inferFieldTypeFromLabel(label = '') {
  if (label === 'Calculate' || label === 'Draw' || label === 'Paste') {
    return 'action-button';
  }

  if (
    label === 'Inpt' ||
    label === 'Pooled' ||
    label === 'Tail' ||
    label === 'On/Off' ||
    label === 'Mark' ||
    label === 'Color' ||
    label.startsWith('Type') ||
    label.includes('?') ||
    label === 'β and ρ'
  ) {
    return 'choice';
  }

  if (
    label === 'List' ||
    label === 'List1' ||
    label === 'List2' ||
    label === 'Freq' ||
    label === 'Freq1' ||
    label === 'Freq2' ||
    label === 'FreqList' ||
    label === 'Observed' ||
    label === 'Expected' ||
    label.startsWith('List:') ||
    label.startsWith('Freq:') ||
    label.startsWith('FreqList:') ||
    label.startsWith('Xlist') ||
    label.startsWith('Ylist')
  ) {
    return 'list-selector';
  }

  if (label === 'Store RegEQ' || label === 'RegEQ') {
    return 'equation-selector';
  }

  if (label === 'rows' || label === 'columns' || label.startsWith('cell-by-cell')) {
    return 'number';
  }

  return 'number';
}

function inferDefaultValue(label = '') {
  if (label.startsWith('Type:')) {
    return label.replace('Type: ', '');
  }

  if (label === 'On/Off') {
    return 'On';
  }

  if (label.includes(':')) {
    return label.split(':').slice(1).join(':').trim();
  }

  return '';
}

function getActiveField(state) {
  if (!state.fields || state.activeField == null) {
    return null;
  }

  return state.fields[state.activeField] ?? null;
}

function findAdjacentActionField(state, key) {
  const offset = key === 'RIGHT' ? 1 : -1;
  const targetIndex = state.activeField + offset;
  const targetField = state.fields?.[targetIndex];

  if (targetField?.type === 'action-button') {
    return targetIndex;
  }

  return null;
}

function defaultZoomTarget(screenId) {
  return GRAPH_FOR_PLOT_EDITOR[screenId] ?? null;
}

function graphScreenForTrace(screenId) {
  return Object.entries(TRACE_SCREENS).find(([, traceScreen]) => traceScreen === screenId)?.[0] ?? screenId;
}

function defaultInputMode(screenId) {
  if (screenId.includes('-data-wizard')) {
    return 'Data';
  }

  if (screenId.includes('-stats-wizard')) {
    return 'Stats';
  }

  return null;
}

function shortcutIndex(items, key) {
  const prefix = `${key}:`;
  const index = items.findIndex((item) => item.startsWith(prefix));

  return index >= 0 ? index : null;
}

function acceptsLiteralInput(state) {
  const activeField = getActiveField(state);

  if (!activeField) {
    return false;
  }

  return (
    activeField.type === 'number' ||
    activeField.type === 'integer' ||
    activeField.type === 'list-selector' ||
    activeField.type === 'matrix-selector'
  );
}

function isFieldInputScreen(state) {
  return Array.isArray(state.fields) && state.activeField != null;
}

function suggestedParameterKey(state) {
  if (state.id === 'matrix-editor-a-values') {
    return '{cell value}';
  }

  if (state.id === 'stat-edit-lists' || state.id === 'residual-list-editor') {
    return '{value}';
  }

  const activeField = getActiveField(state);

  if (!activeField) {
    return null;
  }

  if (activeField.type === 'number' || activeField.type === 'integer') {
    return `{${activeField.label}}`;
  }

  return null;
}

function isDigitKey(key) {
  return /^[0-9]$/.test(key);
}

function isParameterKey(key) {
  return /^\{.+\}$/.test(key);
}

function isLiteralInputKey(key) {
  return isDigitKey(key) || key === '.' || key === '(-)' || key === ',' || key === '(' || key === ')';
}

function normalizeInputKey(key) {
  if (!isParameterKey(key)) {
    return key === '(-)' ? '-' : key;
  }

  return key.slice(1, -1);
}

function wrapIndex(current, length, delta) {
  if (length <= 0) {
    return 0;
  }

  return (current + delta + length) % length;
}

function clampIndex(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

window.TI84V2Machine = { createState, createRouteState, transition, validKeys };
}());
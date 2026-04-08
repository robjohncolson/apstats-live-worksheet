(function () {
  const LCD_WIDTH = 320;
  const LCD_HEIGHT = 240;
  const TOTAL_PIXELS = LCD_WIDTH * LCD_HEIGHT;
  const ROM_FILENAME = 'CE.rom';

  const DB_NAME = 'ti84-trainer-v2';
  const STORE_NAME = 'assets';
  const ROM_RECORD_ID = 'ce-rom';

  const DEFAULT_HOLD_MS = 72;

  const KEY_TO_RC = {
    GRAPH: [1, 0],
    TRACE: [1, 1],
    ZOOM: [1, 2],
    WINDOW: [1, 3],
    Y_EQUALS: [1, 4],
    '2ND': [1, 5],
    MODE: [1, 6],
    DEL: [1, 7],
    ON: [2, 0],
    STO: [2, 1],
    LN: [2, 2],
    LOG: [2, 3],
    SQUARED: [2, 4],
    X_INVERSE: [2, 5],
    MATH: [2, 6],
    ALPHA: [2, 7],
    ZERO: [3, 0],
    ONE: [3, 1],
    FOUR: [3, 2],
    SEVEN: [3, 3],
    COMMA: [3, 4],
    SIN: [3, 5],
    APPS: [3, 6],
    X_T: [3, 7],
    DECIMAL: [4, 0],
    TWO: [4, 1],
    FIVE: [4, 2],
    EIGHT: [4, 3],
    LPAREN: [4, 4],
    COS: [4, 5],
    PRGM: [4, 6],
    STAT: [4, 7],
    NEGATIVE: [5, 0],
    THREE: [5, 1],
    SIX: [5, 2],
    NINE: [5, 3],
    RPAREN: [5, 4],
    TAN: [5, 5],
    VARS: [5, 6],
    ENTER: [6, 0],
    PLUS: [6, 1],
    MINUS: [6, 2],
    MULTIPLY: [6, 3],
    DIVIDE: [6, 4],
    POWER: [6, 5],
    CLEAR: [6, 6],
    DOWN: [7, 0],
    LEFT: [7, 1],
    RIGHT: [7, 2],
    UP: [7, 3],
  };

  const CHAR_TO_BUTTON = {
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
    '-': 'NEGATIVE',
    ',': 'COMMA',
    '(': 'LPAREN',
    ')': 'RPAREN',
  };

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });
  }

  function readRecord(id) {
    return openDatabase().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(id);

          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error || new Error('Failed to read IndexedDB record.'));
        }),
    );
  }

  function writeRecord(record) {
    return openDatabase().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(record);

          request.onsuccess = () => resolve(record);
          request.onerror = () => reject(request.error || new Error('Failed to write IndexedDB record.'));
        }),
    );
  }

  function deleteRecord(id) {
    return openDatabase().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(id);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error || new Error('Failed to delete IndexedDB record.'));
        }),
    );
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer.slice(0));
    }

    throw new Error('Unsupported ROM buffer type.');
  }

  function createBridge(options = {}) {
    const state = {
      canvas: null,
      ctx: null,
      imageData: null,
      module: null,
      renderHandle: 0,
      status: { code: 'booting', detail: 'Checking for a saved ROM…' },
      assetBase: new URL(window.TI84V2_ASSET_BASE || './', window.location.href),
      onStatus: options.onStatus ?? (() => {}),
      romMeta: null,
      usingMock: false,
      mockLines: [
        'ROM-backed TI-84 screen',
        'Choose a ROM or drop in WebCEmu.',
      ],
      mockFooter: 'Waiting for emulator assets',
      importPromise: null,
    };

    function setStatus(code, detail) {
      state.status = { code, detail };
      state.onStatus(state.status);
    }

    function mountCanvas(canvas) {
      if (!canvas) {
        return;
      }

      if (state.canvas === canvas) {
        return;
      }

      state.canvas = canvas;
      state.canvas.width = LCD_WIDTH;
      state.canvas.height = LCD_HEIGHT;
      state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
      state.imageData = state.ctx.createImageData(LCD_WIDTH, LCD_HEIGHT);

      if (state.usingMock || !state.module) {
        drawMockFrame();
      }
    }

    function drawMockFrame() {
      if (!state.ctx) {
        return;
      }

      const ctx = state.ctx;

      ctx.fillStyle = '#9cd090';
      ctx.fillRect(0, 0, LCD_WIDTH, LCD_HEIGHT);

      ctx.fillStyle = '#1e3a1f';
      ctx.fillRect(8, 8, LCD_WIDTH - 16, LCD_HEIGHT - 16);

      ctx.fillStyle = '#c9f7c1';
      ctx.font = '14px "Courier New", monospace';

      state.mockLines.forEach((line, index) => {
        ctx.fillText(line, 18, 36 + index * 24);
      });

      ctx.fillStyle = '#98dca6';
      ctx.font = '12px "Courier New", monospace';
      ctx.fillText(state.mockFooter, 18, LCD_HEIGHT - 22);
    }

    function setMockLines(lines, footer) {
      state.mockLines = Array.isArray(lines) && lines.length
        ? lines.slice(0, 7)
        : ['Awaiting walkthrough state'];

      if (footer) {
        state.mockFooter = footer;
      }

      if (state.usingMock || !state.module) {
        drawMockFrame();
      }
    }

    function stopRenderLoop() {
      if (state.renderHandle) {
        window.cancelAnimationFrame(state.renderHandle);
        state.renderHandle = 0;
      }
    }

    function drawRealFrame() {
      if (!state.module || !state.ctx || state.usingMock) {
        return;
      }

      const frameFn = state.module._lcd_get_frame;

      if (typeof frameFn !== 'function') {
        useMock('lcd_get_frame export is unavailable.');
        return;
      }

      const framePtr = frameFn();
      const frame = new Uint32Array(state.module.HEAPU32.buffer, framePtr, TOTAL_PIXELS);
      const rgba = state.imageData.data;

      for (let index = 0; index < TOTAL_PIXELS; index += 1) {
        const pixel = frame[index];
        const offset = index * 4;

        rgba[offset + 0] = (pixel >> 16) & 0xff;
        rgba[offset + 1] = (pixel >> 8) & 0xff;
        rgba[offset + 2] = pixel & 0xff;
        rgba[offset + 3] = 255;
      }

      state.ctx.putImageData(state.imageData, 0, 0);
      state.renderHandle = window.requestAnimationFrame(drawRealFrame);
    }

    function startRenderLoop() {
      stopRenderLoop();
      state.renderHandle = window.requestAnimationFrame(drawRealFrame);
    }

    function useMock(detail) {
      stopRenderLoop();
      state.module = null;
      state.usingMock = true;
      state.mockFooter = detail;
      setStatus('mock', detail);
      drawMockFrame();
    }

    function normalizeRecord(record) {
      if (!record) {
        return null;
      }

      return {
        id: ROM_RECORD_ID,
        name: record.name || ROM_FILENAME,
        updatedAt: record.updatedAt || Date.now(),
        bytes: toUint8Array(record.bytes),
      };
    }

    async function loadFactory() {
      if (state.importPromise) {
        return state.importPromise;
      }

      const source = new URL('./wasm/WebCEmu.js', state.assetBase).href;

      state.importPromise = import(source)
        .then((module) => module.default || module.WebCEmu || window.WebCEmu)
        .catch((error) => {
          state.importPromise = null;
          throw error;
        });

      return state.importPromise;
    }

    async function bootRecord(record) {
      const normalized = normalizeRecord(record);

      if (!normalized) {
        state.romMeta = null;
        setStatus('needs-rom', 'No ROM is stored yet.');
        state.usingMock = true;
        state.mockFooter = 'Select a TI-84 Plus CE ROM to continue';
        drawMockFrame();
        return false;
      }

      setStatus('loading-wasm', 'Loading WebCEmu…');
      state.mockLines = [
        'Booting TI-84 Plus CE…',
        normalized.name,
      ];
      state.mockFooter = 'Preparing ROM-backed calculator';
      drawMockFrame();

      let factory;

      try {
        factory = await loadFactory();
      } catch (error) {
        useMock(`WebCEmu.js was not found in wasm/. ${error.message}`);
        return false;
      }

      try {
        // CEmu's ASM_CONSTS reference these globals during boot.
        // Define stubs so callMain() doesn't throw.
        window.emul_is_inited = false;
        window.emul_is_paused = true;
        window.initFuncs = window.initFuncs || function () {};
        window.initLCD = window.initLCD || function () {};
        window.enableGUI = window.enableGUI || function () {};
        window.disableGUI = window.disableGUI || function () {};

        const module = await factory({
          noInitialRun: true,
          locateFile(file) {
            return new URL(`./wasm/${file}`, state.assetBase).href;
          },
          printErr(...args) {
            console.warn('[WebCEmu]', ...args);
          },
        });

        state.module = module;
        state.usingMock = false;
        state.romMeta = {
          name: normalized.name,
          updatedAt: normalized.updatedAt,
        };

        module.FS.writeFile(ROM_FILENAME, normalized.bytes);

        setStatus('booting', 'Starting the TI-84 Plus CE ROM…');
        module.callMain([]);
        startRenderLoop();

        setStatus('ready', `ROM ready: ${normalized.name}`);
        return true;
      } catch (error) {
        console.error(error);
        useMock(`Failed to boot the ROM. ${error.message}`);
        return false;
      }
    }

    async function init() {
      try {
        const record = await readRecord(ROM_RECORD_ID);
        return bootRecord(record);
      } catch (error) {
        useMock(`IndexedDB failed. ${error.message}`);
        return false;
      }
    }

    async function selectRomFile(file) {
      if (!file) {
        return false;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const record = {
        id: ROM_RECORD_ID,
        name: file.name || ROM_FILENAME,
        updatedAt: Date.now(),
        bytes,
      };

      await writeRecord(record);
      return bootRecord(record);
    }

    async function clearStoredRom() {
      await deleteRecord(ROM_RECORD_ID);
      state.romMeta = null;
      stopRenderLoop();
      state.module = null;
      state.usingMock = true;
      state.mockLines = [
        'Saved ROM cleared.',
        'Choose a new ROM to boot again.',
      ];
      state.mockFooter = 'No ROM currently stored';
      setStatus('needs-rom', 'Saved ROM cleared.');
      drawMockFrame();
    }

    function invokeKeypad(row, col, pressed) {
      if (!state.module) {
        return;
      }

      const handler = state.module._emsc_keypad_event || state.module._emu_keypad_event;

      if (typeof handler !== 'function') {
        useMock('No keypad bridge export was found.');
        return;
      }

      handler(row, col, pressed ? 1 : 0);
    }

    async function sendButton(buttonId, holdMs = DEFAULT_HOLD_MS) {
      const coords = KEY_TO_RC[buttonId];

      if (!coords) {
        return false;
      }

      if (!state.module || state.usingMock) {
        state.mockFooter = `Captured ${buttonId}`;
        drawMockFrame();
        return true;
      }

      const [row, col] = coords;

      invokeKeypad(row, col, true);
      await wait(holdMs);
      invokeKeypad(row, col, false);
      await wait(18);
      return true;
    }

    async function prepareHome() {
      if (!state.module || state.usingMock) {
        state.mockFooter = 'Mock reset to HOME';
        drawMockFrame();
        return true;
      }

      const sequence = ['CLEAR', 'CLEAR', 'CLEAR', 'CLEAR'];

      for (const buttonId of sequence) {
        await sendButton(buttonId, 54);
        await wait(40);
      }

      return true;
    }

    async function typeValue(value, options = {}) {
      const input = `${value ?? ''}`.trim();

      if (!input) {
        return false;
      }

      if (options.clearField !== false) {
        await sendButton('CLEAR', 54);
        await wait(24);
      }

      for (const char of input) {
        if (char === ' ') {
          continue;
        }

        const buttonId = CHAR_TO_BUTTON[char];

        if (!buttonId) {
          throw new Error(`Cannot type character "${char}" on the virtual keypad.`);
        }

        await sendButton(buttonId, 54);
        await wait(22);
      }

      return true;
    }

    function destroy() {
      stopRenderLoop();

      if (state.module && typeof state.module._emsc_cancel_main_loop === 'function') {
        try {
          state.module._emsc_cancel_main_loop();
        } catch (error) {
          console.warn('Failed to cancel the CEmu main loop.', error);
        }
      }

      state.module = null;
    }

    function isRealEmulator() {
      return Boolean(state.module) && !state.usingMock;
    }

    function getStatus() {
      return {
        ...state.status,
        romMeta: state.romMeta,
        usingMock: state.usingMock,
      };
    }

    return {
      init,
      mountCanvas,
      selectRomFile,
      clearStoredRom,
      sendButton,
      typeValue,
      prepareHome,
      setMockLines,
      destroy,
      isRealEmulator,
      getStatus,
      keyMap: KEY_TO_RC,
    };
  }

  window.TI84V2Bridge = {
    CHAR_TO_BUTTON,
    KEY_TO_RC,
    createBridge,
  };
}());

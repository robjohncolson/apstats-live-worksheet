(function () {
  const LCD_WIDTH = 320;
  const LCD_HEIGHT = 240;
  const TOTAL_PIXELS = LCD_WIDTH * LCD_HEIGHT;
  const ROM_FILENAME = 'CE.rom';

  const DB_NAME = 'ti84-trainer-v2';
  const STORE_NAME = 'assets';
  const ROM_RECORD_ID = 'ce-rom';
  const providedRomConfig = window.TI84_ROM_CONFIG || {};
  const ROM_CONFIG = {
    supabaseUrl: providedRomConfig.supabaseUrl || '',
    bucketPath: providedRomConfig.bucketPath || '',
    signedUrl: providedRomConfig.signedUrl || '',
    cacheKey: providedRomConfig.cacheKey || ROM_RECORD_ID,
    cacheVersion: providedRomConfig.cacheVersion || '5.8.2.0029',
  };

  const DEFAULT_HOLD_MS = 90;

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

  // ---------- list variable transfer (.8xl) ----------
  //
  // Proven by the week-one spike (TI84_TRAINER_SPIKE_RESULT.md: 6/6 echo-oracle
  // matches, L1+L2 x 3 datasets). Ported verbatim from spike-harness.html —
  // including the header comment string, so a built file stays byte-identical
  // to the spike-validated artifact.

  // TI-8x real: byte0 sign/type, byte1 exponent biased 0x80, bytes2-8 = 14 BCD
  // digits, mantissa normalized to d.ddddddddddddd.
  function encodeTiReal(value) {
    const bytes = new Uint8Array(9);
    let v = Number(value);
    if (!Number.isFinite(v)) throw new Error(`Cannot encode ${value}`);
    if (v === 0) {
      bytes[1] = 0x80;
      return bytes;
    }
    if (v < 0) {
      bytes[0] = 0x80;
      v = -v;
    }
    const [mantissa, exp] = v.toExponential(13).split('e');
    const digits = mantissa.replace('.', '').padEnd(14, '0').slice(0, 14);
    bytes[1] = 0x80 + Number(exp);
    for (let i = 0; i < 7; i += 1) {
      bytes[2 + i] = (Number(digits[i * 2]) << 4) | Number(digits[i * 2 + 1]);
    }
    return bytes;
  }

  // Token bytes are index-derived so all six lists are buildable, but only
  // L1/L2 are spike-proven — autofill gates which lists may use transfer.
  const LIST_NAME_TOKENS = {
    L1: [0x5d, 0x00],
    L2: [0x5d, 0x01],
    L3: [0x5d, 0x02],
    L4: [0x5d, 0x03],
    L5: [0x5d, 0x04],
    L6: [0x5d, 0x05],
  };

  function buildRealList8xl(listName, values) {
    const token = LIST_NAME_TOKENS[listName];
    if (!token) throw new Error(`Unsupported list ${listName}`);

    const varData = new Uint8Array(2 + values.length * 9);
    varData[0] = values.length & 0xff;
    varData[1] = (values.length >> 8) & 0xff;
    values.forEach((value, index) => varData.set(encodeTiReal(value), 2 + index * 9));

    // 0x0D-format variable entry: 13-byte header (incl. version + archive
    // flag) + var data. flag 0x00 = RAM, which is the whole point (spec §0).
    const entry = new Uint8Array(17 + varData.length);
    const view = new DataView(entry.buffer);
    view.setUint16(0, 0x0d, true);
    view.setUint16(2, varData.length, true);
    entry[4] = 0x01;
    entry[5] = token[0];
    entry[6] = token[1];
    entry[13] = 0x00;
    entry[14] = 0x00;
    view.setUint16(15, varData.length, true);
    entry.set(varData, 17);

    const header = new Uint8Array(55);
    const signature = '**TI83F*';
    for (let i = 0; i < signature.length; i += 1) header[i] = signature.charCodeAt(i);
    header[8] = 0x1a;
    header[9] = 0x0a;
    header[10] = 0x00;
    const comment = 'ti84-trainer spike harness';
    for (let i = 0; i < comment.length; i += 1) header[11 + i] = comment.charCodeAt(i);
    new DataView(header.buffer).setUint16(53, entry.length, true);

    let checksum = 0;
    for (const byte of entry) checksum = (checksum + byte) & 0xffff;

    const file = new Uint8Array(55 + entry.length + 2);
    file.set(header, 0);
    file.set(entry, 55);
    file[55 + entry.length] = checksum & 0xff;
    file[55 + entry.length + 1] = (checksum >> 8) & 0xff;
    return file;
  }

  function writeToEmscriptenFs(module, path, bytes) {
    const bare = path.replace(/^\//, '');
    if (typeof module.FS?.writeFile === 'function') {
      module.FS.writeFile(path, bytes);
      return 'Module.FS.writeFile';
    }
    if (typeof module.FS?.createDataFile === 'function') {
      module.FS.createDataFile('/', bare, bytes, true, true);
      return 'Module.FS.createDataFile';
    }
    if (typeof module.FS_createDataFile === 'function') {
      module.FS_createDataFile('/', bare, bytes, true, true);
      return 'Module.FS_createDataFile';
    }
    throw new Error('No Emscripten FS write API found on the module.');
  }

  function callSendVariable(module, path, loc) {
    if (typeof module.ccall === 'function') {
      return { via: 'ccall', result: module.ccall('emu_send_variable', 'number', ['string', 'number'], [path, loc]) };
    }
    if (typeof module._emu_send_variable === 'function' && typeof module._malloc === 'function') {
      const encoded = new TextEncoder().encode(path);
      const ptr = module._malloc(encoded.length + 1);
      module.HEAPU8.set(encoded, ptr);
      module.HEAPU8[ptr + encoded.length] = 0;
      try {
        return { via: '_malloc+direct', result: module._emu_send_variable(ptr, loc) };
      } finally {
        if (typeof module._free === 'function') module._free(ptr);
      }
    }
    throw new Error('Neither ccall nor _emu_send_variable+_malloc is available.');
  }

  // One-shot list transfer into a running emulator module. Never throws:
  // autofill decides the keystroke fallback from { ok: false }.
  function transferList(module, listName, values) {
    if (!module) return { ok: false, reason: 'no-module' };
    if (!LIST_NAME_TOKENS[listName]) return { ok: false, reason: 'unsupported-list' };
    try {
      const file = buildRealList8xl(listName, values);
      const fsApi = writeToEmscriptenFs(module, '/autofill.8xl', file);
      const call = callSendVariable(module, '/autofill.8xl', 0);
      if (call.result !== 0) return { ok: false, reason: `send-result-${call.result}` };
      return { ok: true, via: call.via, fsApi };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
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
      status: { code: 'idle', detail: 'Emulator idle in physical calculator mode.', progress: null },
      assetBase: new URL(window.TI84V2_ASSET_BASE || './', window.location.href),
      onStatus: options.onStatus ?? (() => {}),
      romMeta: null,
      usingMock: false,
      mockLines: [
        'ROM-backed TI-84 screen',
        'Checking calculator firmware…',
      ],
      mockFooter: 'Waiting for emulator assets',
      importPromise: null,
    };

    function hasSupabaseUrl() {
      return Boolean(`${ROM_CONFIG.supabaseUrl ?? ''}`.trim());
    }

    function supportsManualRomSelection() {
      return !hasSupabaseUrl();
    }

    function getRomFilename() {
      const parts = `${ROM_CONFIG.bucketPath ?? ''}`.split('/').filter(Boolean);
      return parts[parts.length - 1] || ROM_FILENAME;
    }

    function buildSupabaseRomUrl() {
      if (!hasSupabaseUrl()) {
        return null;
      }

      // Use pre-signed URL if available (for private buckets)
      if (ROM_CONFIG.signedUrl) {
        return ROM_CONFIG.signedUrl;
      }

      // Fall back to public bucket URL
      const base = `${ROM_CONFIG.supabaseUrl}`.trim();
      const objectPath = `${ROM_CONFIG.bucketPath}`.replace(/^\/+/, '');
      return new URL(`/storage/v1/object/public/${objectPath}`, base).href;
    }

    function getStatus() {
      return {
        ...state.status,
        romMeta: state.romMeta,
        usingMock: state.usingMock,
        manualSelectionAvailable: supportsManualRomSelection(),
        autoDownloadConfigured: hasSupabaseUrl(),
      };
    }

    function setStatus(code, detail, extra = {}) {
      state.status = {
        code,
        detail,
        progress: extra.progress ?? null,
      };
      state.onStatus(getStatus());
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
      const lines = Array.isArray(detail)
        ? detail
        : [
          'TI-84 Plus CE offline',
          'Using simplified calculator mode.',
        ];
      const footer = typeof detail === 'string' ? detail : state.mockFooter;
      showFallback('offline', footer, lines, footer);
    }

    function showFallback(code, detail, lines, footer) {
      stopRenderLoop();
      state.module = null;
      state.usingMock = true;

      if (Array.isArray(lines) && lines.length) {
        state.mockLines = lines.slice(0, 7);
      }

      state.mockFooter = footer || detail;
      setStatus(code, detail);
      drawMockFrame();
    }

    function normalizeRecord(record) {
      if (!record) {
        return null;
      }

      return {
        id: ROM_CONFIG.cacheKey,
        name: record.name || getRomFilename(),
        updatedAt: record.updatedAt || Date.now(),
        version: record.version || null,
        source: record.source || 'cache',
        bytes: toUint8Array(record.bytes),
      };
    }

    function isCacheCurrent(record) {
      return Boolean(record && record.version === ROM_CONFIG.cacheVersion);
    }

    function concatenateChunks(chunks, totalBytes) {
      const merged = new Uint8Array(totalBytes);
      let offset = 0;

      chunks.forEach((chunk) => {
        merged.set(chunk, offset);
        offset += chunk.length;
      });

      return merged;
    }

    async function downloadRomFromSupabase() {
      const romUrl = buildSupabaseRomUrl();

      if (!romUrl) {
        return null;
      }

      state.usingMock = true;
      state.mockLines = [
        'Downloading calculator firmware…',
        getRomFilename(),
      ];
      state.mockFooter = 'Connecting to Supabase…';
      setStatus('downloading-rom', 'Downloading calculator firmware…', { progress: 0 });
      drawMockFrame();

      let response = null;
      let downloadError = null;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

        if (attempt > 1) {
          setStatus('downloading-rom', 'Retrying calculator firmware download…', { progress: 0 });
          state.mockFooter = 'Retry 2 of 2';
          drawMockFrame();
        }

        try {
          response = await fetch(romUrl, { signal: controller.signal });

          if (!response.ok) {
            throw new Error(`Supabase returned ${response.status} ${response.statusText}.`);
          }

          downloadError = null;
          break;
        } catch (error) {
          response = null;
          downloadError = error?.name === 'AbortError'
            ? new Error('Calculator firmware download timed out after 30 seconds.')
            : error;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      if (!response) {
        throw downloadError ?? new Error('Calculator firmware download failed.');
      }

      const totalBytes = Number.parseInt(response.headers.get('content-length') || '', 10);

      if (!response.body || typeof response.body.getReader !== 'function') {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (Number.isFinite(totalBytes) && totalBytes > 0 && bytes.length !== totalBytes) {
          throw new Error(`Firmware download size mismatch: expected ${totalBytes} bytes, received ${bytes.length}.`);
        }
        return {
          id: ROM_CONFIG.cacheKey,
          name: getRomFilename(),
          updatedAt: Date.now(),
          version: ROM_CONFIG.cacheVersion,
          source: 'supabase',
          bytes,
        };
      }

      const reader = response.body.getReader();
      const chunks = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        chunks.push(value);
        receivedBytes += value.length;

        const hasLength = Number.isFinite(totalBytes) && totalBytes > 0;
        const progress = hasLength ? receivedBytes / totalBytes : null;
        const percent = hasLength ? Math.min(100, Math.round(progress * 100)) : null;

        setStatus(
          'downloading-rom',
          percent === null
            ? 'Downloading calculator firmware…'
            : `Downloading calculator firmware… ${percent}%`,
          { progress },
        );

        state.mockFooter = percent === null
          ? `${(receivedBytes / (1024 * 1024)).toFixed(1)} MB downloaded`
          : `${percent}% complete`;
        drawMockFrame();
      }

      if (Number.isFinite(totalBytes) && totalBytes > 0 && receivedBytes !== totalBytes) {
        throw new Error(`Firmware download size mismatch: expected ${totalBytes} bytes, received ${receivedBytes}.`);
      }

      return {
        id: ROM_CONFIG.cacheKey,
        name: getRomFilename(),
        updatedAt: Date.now(),
        version: ROM_CONFIG.cacheVersion,
        source: 'supabase',
        bytes: concatenateChunks(chunks, receivedBytes),
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
        showFallback(
          supportsManualRomSelection() ? 'needs-rom' : 'offline',
          supportsManualRomSelection()
            ? 'No calculator firmware is stored yet. Choose a ROM file to continue.'
            : 'Could not load calculator firmware. Using simplified mode.',
          [
            'TI-84 Plus CE firmware',
            supportsManualRomSelection()
              ? 'Choose a ROM file for development.'
              : 'Using simplified calculator mode.',
          ],
          supportsManualRomSelection()
            ? 'Manual ROM selection available'
            : 'Firmware unavailable',
        );
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
        showFallback(
          'offline',
          'Could not load calculator firmware. Using simplified mode.',
          [
            'WebCEmu assets missing',
            'Using simplified calculator mode.',
          ],
          `WebCEmu.js was not found in wasm/. ${error.message}`,
        );
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

        try {
          state.module = module;
          state.usingMock = false;
          state.romMeta = {
            name: normalized.name,
            updatedAt: normalized.updatedAt,
            version: normalized.version,
            source: normalized.source,
          };

          module.FS.writeFile(ROM_FILENAME, normalized.bytes);

          setStatus('booting', 'Starting the TI-84 Plus CE ROM…');
          module.callMain([]);
          startRenderLoop();
        } catch (error) {
          try {
            await deleteRecord(ROM_CONFIG.cacheKey);
          } catch (deleteError) {
            console.warn('Failed to clear corrupt calculator firmware cache.', deleteError);
          }
          throw error;
        }

        setStatus('ready', `ROM ready: ${normalized.name}`);
        return true;
      } catch (error) {
        console.error(error);
        showFallback(
          'offline',
          'Could not load calculator firmware. Using simplified mode.',
          [
            'ROM boot failed',
            'Using simplified calculator mode.',
          ],
          `Failed to boot the ROM. ${error.message}`,
        );
        return false;
      }
    }

    async function init() {
      try {
        setStatus('booting', 'Checking for cached calculator firmware…');
        let record = null;

        try {
          record = await readRecord(ROM_CONFIG.cacheKey);
        } catch (error) {
          console.warn('Failed to read calculator firmware cache.', error);
        }

        if (isCacheCurrent(record)) {
          return bootRecord(record);
        }

        if (record) {
          try {
            await deleteRecord(ROM_CONFIG.cacheKey);
          } catch (error) {
            console.warn('Failed to clear stale calculator firmware cache.', error);
          }
        }

        if (!hasSupabaseUrl()) {
          return bootRecord(null);
        }

        const downloadedRecord = await downloadRomFromSupabase();

        if (!downloadedRecord) {
          return bootRecord(null);
        }

        try {
          await writeRecord(downloadedRecord);
        } catch (error) {
          console.warn('Failed to cache calculator firmware locally.', error);
        }

        return bootRecord(downloadedRecord);
      } catch (error) {
        showFallback(
          'offline',
          'Could not load calculator firmware. Using simplified mode.',
          [
            'TI-84 Plus CE offline',
            'Using simplified calculator mode.',
          ],
          error.message,
        );
        return false;
      }
    }

    async function selectRomFile(file) {
      if (!file) {
        return false;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const record = {
        id: ROM_CONFIG.cacheKey,
        name: file.name || getRomFilename(),
        updatedAt: Date.now(),
        version: ROM_CONFIG.cacheVersion,
        source: 'manual',
        bytes,
      };

      await writeRecord(record);
      return bootRecord(record);
    }

    async function clearStoredRom() {
      await deleteRecord(ROM_CONFIG.cacheKey);
      state.romMeta = null;
      stopRenderLoop();
      state.module = null;
      showFallback(
        supportsManualRomSelection() ? 'needs-rom' : 'offline',
        supportsManualRomSelection()
          ? 'Saved ROM cleared.'
          : 'Cached calculator firmware cleared. Reload to download it again.',
        [
          supportsManualRomSelection() ? 'Saved ROM cleared.' : 'Calculator firmware cleared.',
          supportsManualRomSelection()
            ? 'Choose a new ROM to boot again.'
            : 'Reload to fetch a fresh copy.',
        ],
        supportsManualRomSelection()
          ? 'No ROM currently stored'
          : 'Simplified mode active',
      );
    }

    function invokeKeypad(row, col, pressed) {
      if (!state.module) {
        return;
      }

      const handler = state.module._emsc_keypad_event || state.module._emu_keypad_event;

      if (typeof handler !== 'function') {
        showFallback(
          'offline',
          'Could not load calculator firmware. Using simplified mode.',
          [
            'Keypad bridge missing',
            'Using simplified calculator mode.',
          ],
          'No keypad bridge export was found.',
        );
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
      // The TI-OS getkey loop waits for the key to be released before it will
      // accept the next one. Give the released key enough emulated frames to
      // register, or rapid auto-fill drops keys and corrupts list data.
      await wait(45);
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
        await sendButton('CLEAR', 90);
        await wait(55);
      }

      for (const char of input) {
        if (char === ' ') {
          continue;
        }

        const buttonId = CHAR_TO_BUTTON[char];

        if (!buttonId) {
          throw new Error(`Cannot type character "${char}" on the virtual keypad.`);
        }

        // Hold each digit a few emulated frames, then leave a clear gap so the
        // key-up registers before the next digit. Under-spacing here is what
        // dropped digits and corrupted auto-filled list data.
        await sendButton(buttonId, 90);
        await wait(55);
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

    function getFrame() {
      if (!isRealEmulator()) {
        return null;
      }

      const frameFn = state.module._lcd_get_frame;

      if (typeof frameFn !== 'function') {
        return null;
      }

      const framePtr = frameFn();
      return new Uint32Array(state.module.HEAPU32.buffer, framePtr, TOTAL_PIXELS).slice();
    }

    function sampleRegion(x, y, width, height) {
      const frame = getFrame();

      if (!frame) {
        return null;
      }

      const left = Math.max(0, Math.min(LCD_WIDTH, Math.floor(x)));
      const top = Math.max(0, Math.min(LCD_HEIGHT, Math.floor(y)));
      const right = Math.max(left, Math.min(LCD_WIDTH, Math.floor(x + width)));
      const bottom = Math.max(top, Math.min(LCD_HEIGHT, Math.floor(y + height)));
      const regionWidth = right - left;
      const regionHeight = bottom - top;
      const pixels = new Uint32Array(regionWidth * regionHeight);

      for (let row = 0; row < regionHeight; row += 1) {
        const sourceStart = (top + row) * LCD_WIDTH + left;
        pixels.set(frame.subarray(sourceStart, sourceStart + regionWidth), row * regionWidth);
      }

      return { x: left, y: top, width: regionWidth, height: regionHeight, pixels };
    }

    function frameHash(region) {
      const pixels = region
        ? sampleRegion(region.x, region.y, region.width, region.height)?.pixels
        : getFrame();

      if (!pixels) {
        return null;
      }

      // FNV-1a over the RGB bytes only. drawRealFrame never renders the top
      // byte of each pixel, so it must not influence the hash either.
      let hash = 0x811c9dc5;

      for (let index = 0; index < pixels.length; index += 1) {
        const pixel = pixels[index];
        hash = Math.imul(hash ^ (pixel & 0xff), 0x01000193);
        hash = Math.imul(hash ^ ((pixel >> 8) & 0xff), 0x01000193);
        hash = Math.imul(hash ^ ((pixel >> 16) & 0xff), 0x01000193);
      }

      return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function getModule() {
      return isRealEmulator() ? state.module : null;
    }

    function sendList(listName, values) {
      return transferList(getModule(), listName, values);
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
      supportsManualRomSelection,
      getFrame,
      sampleRegion,
      frameHash,
      getModule,
      sendList,
      keyMap: KEY_TO_RC,
    };
  }

  window.TI84V2Bridge = {
    ROM_CONFIG,
    CHAR_TO_BUTTON,
    KEY_TO_RC,
    LCD_WIDTH,
    LCD_HEIGHT,
    createBridge,
    encodeTiReal,
    buildRealList8xl,
    writeToEmscriptenFs,
    callSendVariable,
    transferList,
    LIST_NAME_TOKENS,
  };
}());

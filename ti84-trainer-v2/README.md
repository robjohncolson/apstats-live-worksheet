# TI-84 Trainer V2

ROM-backed procedural trainer for AP Statistics.

## What this folder contains

- `index.html`: development entrypoint
- `style.css`: System 7 UI
- `app.js`: pattern recognition flow, walkthrough flow, SRS state
- `bridge.js`: WebCEmu boot, ROM persistence, LCD rendering, keypad bridge
- `build.mjs`: generates browser-ready data/state-machine files and a bundled `standalone.html`
- `generated/`: generated browser data/state-machine files
- `wasm/`: drop `WebCEmu.js` and `WebCEmu.wasm` here after building CEmu

## Build the browser files

```bash
node ti84-trainer-v2/build.mjs
```

That command:

1. Generates `generated/data-procedures.js`
2. Generates `generated/data-patterns.js`
3. Generates `generated/state-machine.js`
4. Writes `standalone.html`

## Real emulator setup

The folder currently includes a locally built pair of WebCEmu artifacts:

- `WebCEmu.js`
- `WebCEmu.wasm`

The app still does not bundle a ROM. On first real-emulator launch it prompts for a local TI-84 Plus CE ROM, stores it in IndexedDB, and reuses it on later launches.

Build notes and the keypad matrix are documented in [CEMU_BUILD.md](/mnt/c/Users/rober/Downloads/Projects/school/follow-alongs/ti84-trainer-v2/CEMU_BUILD.md).

## Notes

- If the WASM files are missing, the UI still runs with a mock canvas so the overlay flow can be reviewed.
- The full keypad row/column mapping used for CEmu lives in [bridge.js](/mnt/c/Users/rober/Downloads/Projects/school/follow-alongs/ti84-trainer-v2/bridge.js).

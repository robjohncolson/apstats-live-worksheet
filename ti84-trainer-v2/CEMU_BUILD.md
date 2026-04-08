# CEmu Build Notes

## Source

- Upstream repo: `https://github.com/CE-Programming/CEmu`
- Local build path used for this app: `/tmp/CEmu/core`
- Emscripten used here: `3.1.74`

## Local source changes

### `os/os-emscripten.c`

Added the keypad header and a browser-safe wrapper export:

```c
#include "../../core/keypad.h"

void EMSCRIPTEN_KEEPALIVE emsc_keypad_event(int row, int col, int pressed) {
    emu_keypad_event((unsigned int)row, (unsigned int)col, (bool)pressed);
}
```

### `emscripten.mk`

Changes used for the successful build:

- `-O3` -> `-Oz`
- kept `-flto`
- `TOTAL_MEMORY` -> `INITIAL_MEMORY`
- removed obsolete `--memory-init-file 0`
- exported `_emsc_keypad_event`

Flags that did **not** survive in the final build:

- `-s MINIFY_WASM_IMPORTS=1`
  - unsupported by Emscripten `3.1.74`
- `--closure 1`
  - Closure failed on undeclared globals referenced inside CEmu's `EM_ASM` browser hooks

## Build command

```bash
source /tmp/emsdk/emsdk_env.sh
git -C /tmp/CEmu submodule update --init core/debug/zdis
make -C /tmp/CEmu/core -f emscripten.mk
```

## Output

- `WebCEmu.js`: about `72 KB`
- `WebCEmu.wasm`: about `110 KB`
- gzipped wasm: about `52 KB`

## Keypad matrix

The browser bridge uses the following `(row, col)` pairs when calling `_emsc_keypad_event` or `_emu_keypad_event`.

### Row 1

| Key | Row | Col |
|---|---:|---:|
| `GRAPH` | 1 | 0 |
| `TRACE` | 1 | 1 |
| `ZOOM` | 1 | 2 |
| `WINDOW` | 1 | 3 |
| `Y_EQUALS` | 1 | 4 |
| `2ND` | 1 | 5 |
| `MODE` | 1 | 6 |
| `DEL` | 1 | 7 |

### Row 2

| Key | Row | Col |
|---|---:|---:|
| `ON` | 2 | 0 |
| `STO` | 2 | 1 |
| `LN` | 2 | 2 |
| `LOG` | 2 | 3 |
| `SQUARED` | 2 | 4 |
| `X_INVERSE` | 2 | 5 |
| `MATH` | 2 | 6 |
| `ALPHA` | 2 | 7 |

### Row 3

| Key | Row | Col |
|---|---:|---:|
| `ZERO` | 3 | 0 |
| `ONE` | 3 | 1 |
| `FOUR` | 3 | 2 |
| `SEVEN` | 3 | 3 |
| `COMMA` | 3 | 4 |
| `SIN` | 3 | 5 |
| `APPS` | 3 | 6 |
| `X_T` | 3 | 7 |

### Row 4

| Key | Row | Col |
|---|---:|---:|
| `DECIMAL` | 4 | 0 |
| `TWO` | 4 | 1 |
| `FIVE` | 4 | 2 |
| `EIGHT` | 4 | 3 |
| `LPAREN` | 4 | 4 |
| `COS` | 4 | 5 |
| `PRGM` | 4 | 6 |
| `STAT` | 4 | 7 |

### Row 5

| Key | Row | Col |
|---|---:|---:|
| `NEGATIVE` | 5 | 0 |
| `THREE` | 5 | 1 |
| `SIX` | 5 | 2 |
| `NINE` | 5 | 3 |
| `RPAREN` | 5 | 4 |
| `TAN` | 5 | 5 |
| `VARS` | 5 | 6 |

### Row 6

| Key | Row | Col |
|---|---:|---:|
| `ENTER` | 6 | 0 |
| `PLUS` | 6 | 1 |
| `MINUS` | 6 | 2 |
| `MULTIPLY` | 6 | 3 |
| `DIVIDE` | 6 | 4 |
| `POWER` | 6 | 5 |
| `CLEAR` | 6 | 6 |

### Row 7

| Key | Row | Col |
|---|---:|---:|
| `DOWN` | 7 | 0 |
| `LEFT` | 7 | 1 |
| `RIGHT` | 7 | 2 |
| `UP` | 7 | 3 |

The source-of-truth copy of this mapping lives in [bridge.js](/mnt/c/Users/rober/Downloads/Projects/school/follow-alongs/ti84-trainer-v2/bridge.js).

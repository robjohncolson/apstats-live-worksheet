#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: scripts/whisper-transcribe.sh <audio-path> <output-base>" >&2
  exit 1
fi

AUDIO_PATH="$1"
OUTPUT_BASE="$2"
WHISPER_CPP_DIR="${WHISPER_CPP_DIR:-$HOME/whisper.cpp}"
WHISPER_MODELS_DIR="${WHISPER_MODELS_DIR:-$WHISPER_CPP_DIR/models}"
MODEL_SPEC="${WHISPER_MODEL_PATH:-${WHISPER_MODEL:-medium}}"

first_existing() {
  local candidate
  for candidate in "$@"; do
    if [[ -n "$candidate" && -e "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

first_command() {
  local name
  for name in "$@"; do
    if command -v "$name" >/dev/null 2>&1; then
      command -v "$name"
      return 0
    fi
  done
  return 1
}

resolve_model_path() {
  local spec="$1"
  local basename_spec

  if [[ -e "$spec" ]]; then
    printf '%s\n' "$spec"
    return 0
  fi

  basename_spec="$(basename "$spec")"
  if [[ "$basename_spec" != *.bin ]]; then
    if [[ "$basename_spec" == ggml-* ]]; then
      basename_spec="${basename_spec}.bin"
    else
      basename_spec="ggml-${basename_spec}.bin"
    fi
  fi

  first_existing \
    "${WHISPER_MODELS_DIR}/${basename_spec}" \
    "${WHISPER_CPP_DIR}/models/${basename_spec}" \
    "${HOME}/whisper.cpp/models/${basename_spec}"
}

WHISPER_BIN="${WHISPER_BIN:-}"
if [[ -z "$WHISPER_BIN" ]]; then
  WHISPER_BIN="$(
    first_existing \
      "${WHISPER_CPP_DIR}/build/bin/whisper-cli.exe" \
      "${WHISPER_CPP_DIR}/build/bin/Release/whisper-cli.exe" \
      "${WHISPER_CPP_DIR}/build/bin/whisper.exe" \
      "${WHISPER_CPP_DIR}/build/bin/Release/whisper.exe" \
      "${WHISPER_CPP_DIR}/build/bin/main.exe" \
      "${WHISPER_CPP_DIR}/build/bin/Release/main.exe" \
      "${WHISPER_CPP_DIR}/build/bin/whisper-cli" \
      "${WHISPER_CPP_DIR}/build/bin/Release/whisper-cli" \
      "${WHISPER_CPP_DIR}/build/bin/whisper" \
      "${WHISPER_CPP_DIR}/build/bin/Release/whisper" \
      "${WHISPER_CPP_DIR}/build/bin/main" \
      "${WHISPER_CPP_DIR}/build/bin/Release/main" \
      || true
  )"
fi

if [[ -z "$WHISPER_BIN" ]]; then
  WHISPER_BIN="$(first_command whisper-cli.exe whisper.exe main.exe whisper-cli whisper main || true)"
fi

if [[ -z "$WHISPER_BIN" ]]; then
  echo "Could not locate a whisper.cpp binary. Set WHISPER_BIN or WHISPER_CPP_DIR." >&2
  exit 1
fi

MODEL_PATH="$(resolve_model_path "$MODEL_SPEC" || true)"
if [[ -z "$MODEL_PATH" ]]; then
  echo "Could not locate Whisper model '${MODEL_SPEC}'. Set WHISPER_MODEL_PATH or WHISPER_MODELS_DIR." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_BASE")"
"$WHISPER_BIN" -m "$MODEL_PATH" -f "$AUDIO_PATH" -of "$OUTPUT_BASE" -osrt

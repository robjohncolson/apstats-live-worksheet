#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_ENGINE = process.env.WHISPER_ENGINE || "auto";
const DEFAULT_WHISPER_MODEL = process.env.WHISPER_MODEL || "medium";
const DEFAULT_API_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
const PATHS_MODULE_URL = new URL("../Agent/scripts/lib/paths.mjs", import.meta.url);
const WRAPPER_PATH = fileURLToPath(new URL("./scripts/whisper-transcribe.sh", import.meta.url));

export function formatTimestamp(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeSegmentText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function formatTranscriptSegments(segments) {
  const grouped = [];

  for (const segment of segments ?? []) {
    const text = normalizeSegmentText(segment?.text);
    if (!text) continue;

    const timestamp = formatTimestamp(Number(segment?.start) || 0);
    const previous = grouped[grouped.length - 1];

    // Whisper often emits multiple segments within the same second.
    if (previous && previous.timestamp === timestamp) {
      previous.text = `${previous.text} ${text}`.trim();
      continue;
    }

    grouped.push({ timestamp, text });
  }

  return grouped
    .map(({ timestamp, text }) => `**[${timestamp}]** ${text}`)
    .join("\n");
}

export function parseSrt(rawSrt) {
  const blocks = String(rawSrt ?? "")
    .trim()
    .split(/\r?\n\r?\n+/);
  const segments = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) continue;

    const timeIndex = /^\d+$/.test(lines[0]) ? 1 : 0;
    const timeLine = lines[timeIndex];
    const match = timeLine?.match(
      /(\d{2}):(\d{2}):(\d{2})[,.:](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.:](\d{3})/
    );

    if (!match) continue;

    const start =
      Number(match[1]) * 3600 +
      Number(match[2]) * 60 +
      Number(match[3]) +
      Number(match[4]) / 1000;
    const text = lines.slice(timeIndex + 1).join(" ");

    segments.push({ start, text });
  }

  return segments;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  const videos = [];

  let unit = null;
  let lesson = null;
  let part = null;
  let outputDir = null;
  let engine = DEFAULT_ENGINE;
  let whisperModel = DEFAULT_WHISPER_MODEL;
  let apiModel = DEFAULT_API_MODEL;
  let whisperBin = process.env.WHISPER_BIN || null;
  let whisperCppDir = process.env.WHISPER_CPP_DIR || null;
  let force = false;
  let generateSlides = false;
  let useWrapper = true;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--unit" || arg === "-u") {
      unit = args[++i];
    } else if (arg === "--lesson" || arg === "-l") {
      lesson = args[++i];
    } else if (arg === "--part" || arg === "-p") {
      part = Number(args[++i]);
    } else if (arg === "--video" || arg === "--file") {
      videos.push(args[++i]);
    } else if (arg === "--output-dir") {
      outputDir = args[++i];
    } else if (arg === "--engine") {
      engine = args[++i];
    } else if (arg === "--model") {
      whisperModel = args[++i];
    } else if (arg === "--api-model") {
      apiModel = args[++i];
    } else if (arg === "--whisper-bin") {
      whisperBin = args[++i];
    } else if (arg === "--whisper-cpp-dir") {
      whisperCppDir = args[++i];
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--slides") {
      generateSlides = true;
    } else if (arg === "--no-wrapper") {
      useWrapper = false;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!unit && !lesson && positional.length >= 3) {
    [unit, lesson] = positional;
    videos.push(...positional.slice(2));
  } else if (unit && lesson && positional.length > 0) {
    videos.push(...positional);
  } else if (!help && positional.length > 0) {
    throw new Error("Unable to parse positional arguments.");
  }

  if (help) {
    return {
      help,
      unit,
      lesson,
      part,
      videos,
      outputDir,
      engine,
      whisperModel,
      apiModel,
      whisperBin,
      whisperCppDir,
      force,
      generateSlides,
      useWrapper,
    };
  }

  if (!unit || !lesson || videos.length === 0) {
    throw new Error("Missing required arguments.");
  }

  if (!["auto", "local", "api"].includes(engine)) {
    throw new Error(`Invalid engine "${engine}". Expected auto, local, or api.`);
  }

  if (part !== null && (!Number.isInteger(part) || part < 1)) {
    throw new Error("--part must be a positive integer.");
  }

  if (part !== null && videos.length !== 1) {
    throw new Error("--part can only be used when exactly one video is supplied.");
  }

  return {
    help,
    unit,
    lesson,
    part,
    videos,
    outputDir,
    engine,
    whisperModel,
    apiModel,
    whisperBin,
    whisperCppDir,
    force,
    generateSlides,
    useWrapper,
  };
}

export function usageText() {
  return [
    "Usage:",
    "  node video-ingest-whisper.mjs <unit> <lesson> <video1> [video2 ...] [options]",
    "  node video-ingest-whisper.mjs --unit 6 --lesson 4 --video sample.mp4 --part 1 [options]",
    "",
    "Options:",
    "  -u, --unit <n>            Unit number",
    "  -l, --lesson <n>          Lesson number",
    "  -p, --part <n>            Part number for single-video mode",
    "  --video <path>            Video path (repeatable)",
    "  --output-dir <path>       Override output directory",
    "  --engine auto|local|api   Default: auto",
    "  --model <name|path>       whisper.cpp model alias or full .bin path",
    "  --api-model <name>        OpenAI transcription model (default: whisper-1)",
    "  --whisper-bin <path>      Override whisper.cpp binary path",
    "  --whisper-cpp-dir <path>  Root directory for whisper.cpp",
    "  --force                   Overwrite existing transcript files",
    "  --slides                  Reserved flag; transcript generation only for now",
    "  --no-wrapper              Bypass scripts/whisper-transcribe.sh",
    "  -h, --help                Show this help text",
    "",
    "Environment:",
    "  OPENAI_API_KEY            Enables API fallback when local Whisper is unavailable",
    "  WHISPER_MODEL             Default whisper.cpp model alias/path",
    "  WHISPER_BIN               Override whisper.cpp binary path",
    "  WHISPER_CPP_DIR           Root whisper.cpp directory for binary/model discovery",
    "  WHISPER_MODELS_DIR        Directory containing ggml-*.bin model files",
  ].join("\n");
}

async function loadPaths() {
  return import(PATHS_MODULE_URL.href);
}

function resolveCommand(binaryName) {
  const locator = process.platform === "win32" ? "where" : "which";

  try {
    const result = spawnSync(locator, [binaryName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (result.status !== 0) return null;

    const candidate = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return candidate || null;
  } catch {
    return null;
  }
}

function resolveExistingPath(candidate) {
  if (!candidate) return null;
  const fullPath = path.resolve(candidate);
  return existsSync(fullPath) ? fullPath : null;
}

function resolveFfmpegBinary(ffmpegDir) {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const directCandidate = ffmpegDir ? path.join(ffmpegDir, binaryName) : null;

  if (directCandidate && existsSync(directCandidate)) {
    return directCandidate;
  }

  const fromPath = resolveCommand(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (fromPath) return fromPath;

  throw new Error(
    "FFmpeg was not found. Verify FFMPEG_DIR in ../Agent/scripts/lib/paths.mjs or add ffmpeg to PATH."
  );
}

function candidateWhisperRoots(explicitRoot) {
  const roots = [
    explicitRoot,
    process.env.WHISPER_CPP_DIR,
    path.join(os.homedir(), "whisper.cpp"),
    path.join(os.homedir(), "Downloads", "whisper.cpp"),
    path.join(os.homedir(), "source", "repos", "whisper.cpp"),
  ];

  return [...new Set(roots.filter(Boolean).map((value) => path.resolve(value)))];
}

function resolveWhisperBinary(explicitBin, explicitRoot) {
  const namedBinary = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const legacyBinary = process.platform === "win32" ? "main.exe" : "main";
  const whisperBinary = process.platform === "win32" ? "whisper.exe" : "whisper";

  const directCandidates = [
    explicitBin,
    process.env.WHISPER_BIN,
  ];

  for (const candidate of directCandidates) {
    const resolved = resolveExistingPath(candidate);
    if (resolved) return resolved;
  }

  for (const root of candidateWhisperRoots(explicitRoot)) {
    const candidates = [
      path.join(root, "build", "bin", namedBinary),
      path.join(root, "build", "bin", "Release", namedBinary),
      path.join(root, "build", "bin", whisperBinary),
      path.join(root, "build", "bin", "Release", whisperBinary),
      path.join(root, "build", "bin", legacyBinary),
      path.join(root, "build", "bin", "Release", legacyBinary),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  return (
    resolveCommand(namedBinary) ||
    resolveCommand(process.platform === "win32" ? "whisper-cli" : "whisper-cli") ||
    resolveCommand(whisperBinary) ||
    resolveCommand(process.platform === "win32" ? "whisper" : "whisper") ||
    resolveCommand(legacyBinary) ||
    resolveCommand(process.platform === "win32" ? "main" : "main")
  );
}

function resolveWhisperModel(modelSpec, explicitRoot) {
  const directCandidates = [
    process.env.WHISPER_MODEL_PATH,
    modelSpec,
  ];

  for (const candidate of directCandidates) {
    const resolved = resolveExistingPath(candidate);
    if (resolved) return resolved;
  }

  const rawName = path.basename(String(modelSpec || DEFAULT_WHISPER_MODEL));
  const normalizedName = rawName.endsWith(".bin")
    ? rawName
    : rawName.startsWith("ggml-")
      ? `${rawName}.bin`
      : `ggml-${rawName}.bin`;

  const modelDirs = [
    process.env.WHISPER_MODELS_DIR,
    ...candidateWhisperRoots(explicitRoot).map((root) => path.join(root, "models")),
    path.join(os.homedir(), "models"),
  ];

  for (const modelDir of [...new Set(modelDirs.filter(Boolean).map((value) => path.resolve(value)))]) {
    const candidate = path.join(modelDir, normalizedName);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function buildLocalWhisperConfig(options = {}) {
  const modelPath = resolveWhisperModel(options.whisperModel || DEFAULT_WHISPER_MODEL, options.whisperCppDir);
  const whisperBin = resolveWhisperBinary(options.whisperBin, options.whisperCppDir);
  const bashPath = resolveCommand(process.platform === "win32" ? "bash.exe" : "bash") || resolveCommand("bash");
  const wrapperAvailable = existsSync(WRAPPER_PATH) && Boolean(bashPath) && Boolean(modelPath);
  const directAvailable = Boolean(whisperBin) && Boolean(modelPath);

  return {
    modelPath,
    whisperBin,
    bashPath,
    wrapperAvailable,
    directAvailable,
  };
}

function buildLocalInstallMessage(options, config) {
  const requestedModel = options.whisperModel || DEFAULT_WHISPER_MODEL;
  const modelLabel = path.basename(requestedModel).endsWith(".bin")
    ? requestedModel
    : `ggml-${requestedModel}.bin`;

  return [
    "Local Whisper could not be resolved.",
    `Expected a whisper.cpp binary${config.whisperBin ? "" : " (for example whisper-cli)"} and model ${modelLabel}.`,
    "Install whisper.cpp, download a ggml model, then set one of:",
    "  WHISPER_CPP_DIR=<path-to-whisper.cpp>",
    "  WHISPER_BIN=<path-to-whisper-cli>",
    "  WHISPER_MODEL_PATH=<path-to-model.bin>",
    "",
    "If you prefer the API fallback, set OPENAI_API_KEY and use --engine auto or --engine api.",
  ].join("\n");
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`
    );
  }

  return result;
}

function extractAudio(videoPath, outputPath, ffmpegBinary, format) {
  const args =
    format === "mp3"
      ? [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          videoPath,
          "-vn",
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "48k",
          outputPath,
          "-y",
        ]
      : [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          videoPath,
          "-vn",
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "pcm_s16le",
          outputPath,
          "-y",
        ];

  runCommand(ffmpegBinary, args);
  return outputPath;
}

function readSrtSegments(srtPath) {
  if (!existsSync(srtPath)) {
    throw new Error(`Whisper did not produce the expected SRT output: ${srtPath}`);
  }

  const segments = parseSrt(readFileSync(srtPath, "utf8"));
  if (segments.length === 0) {
    throw new Error(`Whisper produced an empty or unreadable SRT file: ${srtPath}`);
  }

  return segments;
}

function transcribeAudioLocal(audioPath, tempDir, options = {}) {
  const config = buildLocalWhisperConfig(options);
  const outputBase = path.join(tempDir, path.parse(audioPath).name);

  if (options.useWrapper !== false && config.wrapperAvailable) {
    const env = {
      ...process.env,
      WHISPER_MODEL: options.whisperModel || DEFAULT_WHISPER_MODEL,
      WHISPER_MODEL_PATH: config.modelPath,
    };

    if (config.whisperBin) env.WHISPER_BIN = config.whisperBin;
    if (options.whisperCppDir) env.WHISPER_CPP_DIR = path.resolve(options.whisperCppDir);

    runCommand(config.bashPath, [WRAPPER_PATH, audioPath, outputBase], { env });
    return readSrtSegments(`${outputBase}.srt`);
  }

  if (config.directAvailable) {
    runCommand(config.whisperBin, [
      "-m",
      config.modelPath,
      "-f",
      audioPath,
      "-of",
      outputBase,
      "-osrt",
    ]);
    return readSrtSegments(`${outputBase}.srt`);
  }

  throw new Error(buildLocalInstallMessage(options, config));
}

async function transcribeAudioViaApi(audioPath, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const audioBytes = readFileSync(audioPath);
  const form = new FormData();

  form.append(
    "file",
    new Blob([audioBytes], { type: "audio/mpeg" }),
    path.basename(audioPath)
  );
  form.append("model", options.apiModel || DEFAULT_API_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.segments) || payload.segments.length === 0) {
    throw new Error("OpenAI transcription returned no segments.");
  }

  return payload.segments.map((segment) => ({
    start: Number(segment.start) || 0,
    text: segment.text || "",
  }));
}

function transcriptFileSet(outputDir, unit, lesson, part) {
  const stem = `apstat_${unit}-${lesson}-${part}`;
  return {
    transcriptionPath: path.join(outputDir, `${stem}_transcription.txt`),
    transcriptPath: path.join(outputDir, `${stem}_transcript.txt`),
    slidesPath: path.join(outputDir, `${stem}_slides.txt`),
  };
}

function writeIfNeeded(targetPath, content, force) {
  if (!force && existsSync(targetPath) && statSync(targetPath).size > 0) {
    return false;
  }

  writeFileSync(targetPath, `${content}\n`);
  return true;
}

function syncExistingTranscriptAliases(fileSet, force) {
  if (force) return false;

  const existingSource = [fileSet.transcriptPath, fileSet.transcriptionPath].find(
    (targetPath) => existsSync(targetPath) && statSync(targetPath).size > 0
  );

  if (!existingSource) return false;

  const content = readFileSync(existingSource, "utf8").trimEnd();
  writeIfNeeded(fileSet.transcriptPath, content, false);
  writeIfNeeded(fileSet.transcriptionPath, content, false);

  return (
    existsSync(fileSet.transcriptPath) &&
    statSync(fileSet.transcriptPath).size > 0 &&
    existsSync(fileSet.transcriptionPath) &&
    statSync(fileSet.transcriptionPath).size > 0
  );
}

export async function transcribeVideo(videoPath, outputDir, unit, lesson, part, options = {}) {
  const absoluteVideoPath = path.resolve(videoPath);
  if (!existsSync(absoluteVideoPath)) {
    throw new Error(`Video file not found: ${absoluteVideoPath}`);
  }

  const paths = options.paths ?? (await loadPaths());
  const finalOutputDir = path.resolve(
    outputDir || path.join(paths.WORKSHEET_REPO, `u${unit}`)
  );
  const ffmpegBinary = resolveFfmpegBinary(paths.FFMPEG_DIR);
  const fileSet = transcriptFileSet(finalOutputDir, unit, lesson, part);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "video-ingest-whisper-"));

  mkdirSync(finalOutputDir, { recursive: true });

  if (syncExistingTranscriptAliases(fileSet, options.force)) {
    return {
      ...fileSet,
      engine: "existing",
      skipped: true,
    };
  }

  let localError = null;
  const localConfig = buildLocalWhisperConfig(options);

  try {
    const shouldTryLocal =
      options.engine === "local" ||
      (options.engine !== "api" &&
        (localConfig.wrapperAvailable || localConfig.directAvailable));

    if (options.engine !== "api" && !shouldTryLocal) {
      localError = new Error(buildLocalInstallMessage(options, localConfig));
    }

    if (shouldTryLocal) {
      const wavPath = path.join(tempDir, `${path.parse(absoluteVideoPath).name}.wav`);
      extractAudio(absoluteVideoPath, wavPath, ffmpegBinary, "wav");

      try {
        const segments = transcribeAudioLocal(wavPath, tempDir, options);
        const formatted = formatTranscriptSegments(segments);
        if (!formatted) throw new Error("Whisper produced no formatted transcript lines.");

        writeIfNeeded(fileSet.transcriptPath, formatted, options.force);
        writeIfNeeded(fileSet.transcriptionPath, formatted, options.force);

        return {
          ...fileSet,
          engine: "local",
          skipped: false,
        };
      } catch (error) {
        localError = error;
        if (options.engine === "local") throw error;
      }
    }

    if (options.engine === "local") {
      throw localError || new Error("Local Whisper transcription failed.");
    }

    const mp3Path = path.join(tempDir, `${path.parse(absoluteVideoPath).name}.mp3`);
    extractAudio(absoluteVideoPath, mp3Path, ffmpegBinary, "mp3");

    let segments;

    try {
      segments = await transcribeAudioViaApi(mp3Path, options);
    } catch (apiError) {
      if (localError) {
        throw new Error(`${localError.message}\n\nAPI fallback failed: ${apiError.message}`);
      }

      throw apiError;
    }

    const formatted = formatTranscriptSegments(segments);
    if (!formatted) throw new Error("API transcription produced no formatted transcript lines.");

    writeIfNeeded(fileSet.transcriptPath, formatted, options.force);
    writeIfNeeded(fileSet.transcriptionPath, formatted, options.force);

    return {
      ...fileSet,
      engine: "api",
      skipped: false,
      localError: localError?.message || null,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    console.log(usageText());
    return;
  }

  if (options.generateSlides) {
    console.warn(
      "Slide description generation is not implemented in video-ingest-whisper.mjs yet. Continuing with transcripts only."
    );
  }

  const paths = await loadPaths();
  const finalOutputDir = path.resolve(
    options.outputDir || path.join(paths.WORKSHEET_REPO, `u${options.unit}`)
  );

  console.log(`Whisper Video Ingest - Unit ${options.unit}, Lesson ${options.lesson}`);
  console.log(`Engine: ${options.engine}`);
  console.log(`Output: ${finalOutputDir}`);

  for (let index = 0; index < options.videos.length; index++) {
    const currentPart = options.part ?? index + 1;
    const currentVideo = options.videos[index];

    console.log(`\n[Part ${currentPart}] ${path.resolve(currentVideo)}`);

    const result = await transcribeVideo(
      currentVideo,
      finalOutputDir,
      options.unit,
      options.lesson,
      currentPart,
      {
        ...options,
        paths,
      }
    );

    if (result.skipped) {
      console.log(`  Reused existing transcript files.`);
    } else {
      console.log(`  Wrote: ${result.transcriptionPath}`);
      console.log(`  Alias: ${result.transcriptPath}`);
      console.log(`  Engine used: ${result.engine}`);
      if (result.localError) {
        console.log(`  Local fallback reason: ${result.localError}`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

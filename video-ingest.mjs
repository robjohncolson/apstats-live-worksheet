#!/usr/bin/env node
/**
 * ⚠️  DORMANT — Gemini 3.1 Pro has zero free API quota as of March 2026.
 * This script cannot be used with the model needed for video transcription.
 * The working alternative is: Agent/scripts/aistudio-ingest.mjs (CDP browser automation)
 * Keep this script for future use if Gemini 3.1 Pro API quota becomes available.
 */

/**
 * video-ingest.mjs — Transcribe + describe slides from AP Classroom videos
 * Uses Gemini 3.1 Pro via free API tier
 *
 * Usage:
 *   node video-ingest.mjs <unit> <lesson> <video1-path> [video2-path] [--model gemini-3.1-pro-preview]
 *
 * Example:
 *   node video-ingest.mjs 6 4 "./videos/6-4a.mp4" "./videos/6-4b.mp4"
 *
 * Output: creates files in u{unit}/ following the naming convention:
 *   apstat_{unit}-{lesson}-1_transcription.txt
 *   apstat_{unit}-{lesson}-1_slides.txt
 *   apstat_{unit}-{lesson}-2_transcription.txt
 *   apstat_{unit}-{lesson}-2_slides.txt
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load API key from .env
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const API_KEY = envContent.match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim();
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
const modelIdx = args.indexOf("--model");
const MODEL = modelIdx !== -1 ? args.splice(modelIdx, 2)[1] : "gemini-3.1-pro-preview";
const [unit, lesson, ...videoPaths] = args;

if (!unit || !lesson || videoPaths.length === 0) {
  console.error("Usage: node video-ingest.mjs <unit> <lesson> <video1> [video2] [--model name]");
  process.exit(1);
}

const BASE_URL = "https://generativelanguage.googleapis.com";
const outDir = path.join(__dirname, `u${unit}`);
fs.mkdirSync(outDir, { recursive: true });

const PROMPTS = {
  transcript: `Transcribe this video with timestamps. Format each segment as:

**[MM:SS]** <transcribed text>

Include all spoken content. Be thorough and accurate.`,

  slides: `Describe each slide or visual change in this video with timestamps. Format as:

**[MM:SS]** — **Slide title or topic**
<Description of what's shown: text, formulas, graphs, diagrams, examples, key definitions>

Be thorough — capture all text on each slide, any formulas, graph labels, and visual details that a student would need to follow along.`,
};

async function uploadVideo(filePath) {
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  const mimeType = filePath.endsWith(".webm")
    ? "video/webm"
    : filePath.endsWith(".mp4")
      ? "video/mp4"
      : filePath.endsWith(".mov")
        ? "video/quicktime"
        : "video/mp4";

  console.log(`  Uploading ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);

  // Start resumable upload
  const initRes = await fetch(
    `${BASE_URL}/upload/v1beta/files?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { displayName: fileName } }),
    }
  );

  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    const errText = await initRes.text();
    throw new Error(`Upload init failed: ${errText}`);
  }

  // Upload the bytes
  const fileBytes = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(fileSize),
    },
    body: fileBytes,
  });

  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const fileName2 = uploadData.file?.name;

  if (!fileUri) {
    throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
  }

  console.log(`  Uploaded → ${fileUri}`);

  // Poll until processing is done
  let state = uploadData.file?.state;
  while (state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${BASE_URL}/v1beta/${fileName2}?key=${API_KEY}`);
    const statusData = await statusRes.json();
    state = statusData.state;
    if (state === "PROCESSING") process.stdout.write(".");
  }
  if (state !== "ACTIVE") {
    throw new Error(`File processing failed, state: ${state}`);
  }
  console.log(`  Ready.`);

  return { fileUri, mimeType };
}

async function generateContent(fileUri, mimeType, prompt) {
  const res = await fetch(
    `${BASE_URL}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { fileData: { mimeType, fileUri } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 65536,
        },
      }),
    }
  );

  const data = await res.json();
  if (data.error) {
    throw new Error(`API error: ${JSON.stringify(data.error)}`);
  }

  // Extract text from response, handling thinking models
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textParts = parts.filter((p) => p.text && !p.thought);
  return textParts.map((p) => p.text).join("\n\n");
}

async function processVideo(filePath, videoNum) {
  const label = `Video ${videoNum}`;
  console.log(`\n${label}: ${path.basename(filePath)}`);

  const { fileUri, mimeType } = await uploadVideo(filePath);

  for (const [key, prompt] of Object.entries(PROMPTS)) {
    const suffix = key === "transcript" ? "transcription" : key;
    const outFile = path.join(outDir, `apstat_${unit}-${lesson}-${videoNum}_${suffix}.txt`);
    console.log(`  ${label} → ${key}...`);

    const text = await generateContent(fileUri, mimeType, prompt);
    const header = `# ${label} — ${key === "transcript" ? "Transcript" : "Slide Descriptions"}\n\n`;
    fs.writeFileSync(outFile, header + text + "\n");
    console.log(`  Saved → ${outFile}`);
  }
}

// Main
console.log(`\nVideo Ingest — Unit ${unit}, Lesson ${lesson}`);
console.log(`Model: ${MODEL}`);
console.log(`Output: ${outDir}\n`);

for (let i = 0; i < videoPaths.length; i++) {
  await processVideo(videoPaths[i], i + 1);
}

console.log(`\nDone! ${videoPaths.length * 2} files written to ${outDir}`);

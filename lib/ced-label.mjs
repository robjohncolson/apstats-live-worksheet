// lib/ced-label.mjs — ESM entry for the CED-2026 label helper (lib/ced-label.js), bound to
// the crosswalk on disk. Node only (reads the file); browsers load the .js as a <script>.
//
// Crosswalk location, first that exists:
//   ../2026-crosswalk.json        repo root (this file at follow-alongs/lib/)
//   ../data/2026-crosswalk.json   roster-server's vendored copy (this file at roster-server/lib/)
// Byte-identical copy at roster-server/lib/ced-label.mjs (scripts/sync-ced-crosswalk.mjs).
import { existsSync, readFileSync } from 'node:fs';
import './ced-label.js';

const CANDIDATES = ['../2026-crosswalk.json', '../data/2026-crosswalk.json'];

function loadCrosswalk() {
  for (const relative of CANDIDATES) {
    const url = new URL(relative, import.meta.url);
    if (existsSync(url)) return JSON.parse(readFileSync(url, 'utf8'));
  }
  throw new Error('ced-label: 2026-crosswalk.json not found next to ' + import.meta.url);
}

export const CED_CROSSWALK = loadCrosswalk();
export const CedLabel = globalThis.CedLabel;

const ced = CedLabel.createCedLabels(CED_CROSSWALK.map, CED_CROSSWALK.units || {});

export const cedLabel = ced.cedLabel;
export const cedTopicLabel = ced.cedTopicLabel;
export const cedColumnTitle = ced.cedColumnTitle;
export const cedTopicCoverage = ced.cedTopicCoverage;
export const cedDisplayText = ced.cedDisplayText;
export const cedReferenceText = ced.cedReferenceText;
export const retitleGradebook = ced.retitleGradebook;
export const cedUnitLabel = ced.cedUnitLabel;
export const expandedTopicKeys = CedLabel.expandedTopicKeys;
export default ced;

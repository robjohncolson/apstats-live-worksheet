// lib/ced-label.js — the ONE CED-2026 label helper (CED2026_SINGLE_SOURCE_SPEC.md §1).
//
// Old lesson keys ("3.5", "3.6-7") are STORAGE ids: file names, ledger keys, Schoology
// history. They are never printed. Every human-facing string goes through this file.
//
// Display projections only. Callers keep OLD lesson identifiers for all work.
//
// Loads three ways:
//   <script src="js/ced2026-labels.js">  browser globals (cedLabel, configureCedLabels, ...) + window.CedLabel
//   import './ced-label.js'              Node ESM side effect → globalThis.CedLabel (see lib/ced-label.mjs)
//   require('./ced-label.js')            CommonJS → module.exports = CedLabel
//
// Byte-identical copies (scripts/sync-ced-crosswalk.mjs writes them, tests pin them):
//   js/ced2026-labels.js, roster-server/lib/ced-label.js
// Edit THIS file, then run: node scripts/sync-ced-crosswalk.mjs
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.CedLabel = api;
  // Browser page (or a test sandbox that sets window = itself): the Desk's bare globals.
  if (root.window === root) Object.assign(root, api.defaultInstance);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const KIND_WORD = { followalong: 'Follow-Along', quiz: 'Quiz', blooket: 'Blooket' };
  const COLUMN_KIND = { FA: 'followalong', QUIZ: 'quiz', BL: 'blooket', PC: 'pc', POSTER: 'poster' };

  function compareTopics(left, right) {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    return a[0] - b[0] || a[1] - b[1];
  }

  function isCombinedKey(key) {
    return key.includes('+') || /^\d+\.\d+[–-](?:\d+\.)?\d+(?:[–-]\d+)*$/.test(key);
  }

  // '3.6-7' → ['3.6', '3.7']; '4.3-4-5' → ['4.3', '4.4', '4.5']; '4.10-12' → ['4.10', '4.11', '4.12'].
  function expandedTopicKeys(oldKey) {
    const keys = [];
    for (const part of String(oldKey || '').split('+')) {
      const key = part.trim();
      const chain = /^(\d+)\.(\d+)(?:-\d+){2,}$/.exec(key);
      if (chain) {
        for (const lesson of key.split('.')[1].split('-')) keys.push(chain[1] + '.' + lesson);
        continue;
      }
      const range = /^(\d+)\.(\d+)[–-](?:(\d+)\.)?(\d+)$/.exec(key);
      if (!range || (range[3] && range[3] !== range[1])
        || Number(range[4]) < Number(range[2]) || Number(range[4]) - Number(range[2]) > 30) {
        keys.push(key);
        continue;
      }
      for (let lesson = Number(range[2]); lesson <= Number(range[4]); lesson += 1) keys.push(range[1] + '.' + lesson);
    }
    return [...new Set(keys)];
  }

  // 'Beyond the Exam: Slope inference (t-test)' → 'Slope inference'.
  function shortBonusLabel(newLabel) {
    return String(newLabel || 'Additional practice')
      .replace(/^Beyond the Exam:\s*/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim();
  }

  // Topics → 'CED-style ranges': ['2.4','2.5','2.6','3.3'] → ['2.4–2.6', '3.3'].
  // Column titles pass dash '-' (plain ASCII: the Schoology sync matches titles exactly).
  function topicRanges(topics, dash) {
    const sep = dash || '–';
    const ordered = [...new Set(topics)].sort(compareTopics);
    const ranges = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const start = ordered[index];
      let end = start;
      while (index + 1 < ordered.length) {
        const currentParts = end.split('.').map(Number);
        const nextParts = ordered[index + 1].split('.').map(Number);
        if (nextParts[0] !== currentParts[0] || nextParts[1] !== currentParts[1] + 1) break;
        end = ordered[++index];
      }
      ranges.push(start === end ? start : start + sep + end);
    }
    return ranges;
  }

  // Column-title day part: 'Day 2', 'Days 1-2', '' (every day of the topic is covered).
  // Plain ASCII, never ', ' (data/ced-column-titles.json rules).
  function dayText(days, total) {
    if (!days.length || total <= 1 || days.length === total) return '';
    const sorted = days.slice().sort((a, b) => a - b);
    if (sorted.length === 1) return 'Day ' + sorted[0];
    const contiguous = sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1);
    if (contiguous) return 'Days ' + sorted[0] + '-' + sorted[sorted.length - 1];
    return 'Days ' + sorted.join(' + ');
  }

  const warned = new Set();
  function warnOnce(key, what) {
    if (warned.has(key)) return;
    warned.add(key);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[ced-label] no CED-2026 crosswalk entry for "' + key + '" (' + what + '); showing the stored key');
    }
  }

  // One labeller over one crosswalk. `baseMap` returns the crosswalk map
  // ({ '3.5': { status, newUnit, newTopic, newLabel, bonusUnit } }); a configured
  // registry (the Desk's REGISTRY) overlays it per lesson via lessons[key].ced2026.
  // `baseUnits` returns the crosswalk's units map ({ '1': 'Exploring One-Variable Data ...' }).
  function createCedLabels(baseMap, baseUnits) {
    const readBase = typeof baseMap === 'function' ? baseMap : () => baseMap;
    const readUnits = typeof baseUnits === 'function' ? baseUnits : () => baseUnits;
    let registryProvider = () => null;
    let fingerprint = null;
    let metadata = {};
    let folded = {};
    let bonusFolded = {};
    let labels = new Map();

    function configureCedLabels(provider) {
      registryProvider = typeof provider === 'function' ? provider : () => provider;
      fingerprint = null;
    }

    function refreshMetadata(registry) {
      const source = registry === undefined ? registryProvider() : registry;
      const base = readBase() || {};
      const next = Object.assign({}, base.map && typeof base.map === 'object' ? base.map : base);
      if (source && source.map) Object.assign(next, source.map);
      for (const [key, lesson] of Object.entries(source && source.lessons || {})) {
        // An explicit null clears a live overlay; a missing field uses fallback.
        if (lesson && Object.prototype.hasOwnProperty.call(lesson, 'ced2026')) next[key] = lesson.ced2026;
      }
      const nextFingerprint = JSON.stringify(next);
      if (nextFingerprint === fingerprint) return;
      fingerprint = nextFingerprint;
      metadata = next;
      folded = {};
      bonusFolded = {};
      labels = new Map();
      for (const key of Object.keys(metadata).sort(compareTopics)) {
        const entry = metadata[key];
        if (!entry) continue;
        if (entry.status === 'bonus') {
          const short = shortBonusLabel(entry.newLabel);
          if (!bonusFolded[short]) bonusFolded[short] = [];
          bonusFolded[short].push(key);
          continue;
        }
        if (entry.status !== 'core' || !entry.newTopic) continue;
        if (!folded[entry.newTopic]) folded[entry.newTopic] = [];
        folded[entry.newTopic].push(key);
      }
    }

    function cedLabel(oldKey, registry) {
      refreshMetadata(registry);
      const key = String(oldKey || '');
      if (labels.has(key)) return labels.get(key);

      const entry = metadata[key];
      let result = { id: '', label: 'Lesson', unit: null, bonus: false,
        bonusUnit: null, text: 'Lesson', day: null, days: 1, mapped: false };
      if (entry && entry.status === 'bonus') {
        const label = String(entry.newLabel || 'Additional practice').replace(/^Beyond the Exam:\s*/i, '');
        result = { id: '★', label, unit: null, bonus: true,
          bonusUnit: entry.bonusUnit || null, text: '★ Beyond the Exam · ' + label,
          day: null, days: 1, mapped: true };
      } else if (entry && entry.status === 'core' && /^[1-5]\.\d+$/.test(entry.newTopic)
        && Number.isInteger(entry.newUnit) && entry.newUnit >= 1 && entry.newUnit <= 5) {
        const group = folded[entry.newTopic] || [key];
        const day = group.length > 1 ? group.indexOf(key) + 1 : null;
        const label = String(entry.newLabel || 'Lesson');
        result = { id: entry.newTopic, label, unit: entry.newUnit, bonus: false,
          bonusUnit: null, text: entry.newTopic + ' · ' + label + (day ? ' · Day ' + day : ''),
          day, days: group.length, mapped: true };
      } else if (isCombinedKey(key)) {
        const parts = expandedTopicKeys(key).filter(part => part !== key).map(part => cedLabel(part, registry));
        if (parts.length && parts.every(part => part.mapped)) {
          const units = [...new Set(parts.filter(part => !part.bonus).map(part => part.unit))];
          result = { id: parts.map(part => part.id).join(' / '),
            label: parts.map(part => part.label).join(' / '),
            unit: units.length === 1 ? units[0] : null,
            bonus: parts.every(part => part.bonus), bonusUnit: null,
            text: parts.map(part => part.text).join(' / '), day: null, days: 1, mapped: true };
        }
      }
      labels.set(key, result);
      return result;
    }

    function cedUnitClass(oldKey, registry) {
      const label = cedLabel(oldKey, registry);
      if (label.bonus) return 'bonus';
      return label.unit ? 'u' + label.unit : '';
    }

    function cedTopicCoverage(oldKeys, registry) {
      const topics = new Set();
      let bonus = false;
      for (const key of (oldKeys || []).flatMap(expandedTopicKeys)) {
        const label = cedLabel(key, registry);
        if (!label.mapped) continue;
        if (label.bonus) bonus = true;
        else if (/^[1-5]\.\d+$/.test(label.id)) topics.add(label.id);
      }
      const ranges = topicRanges([...topics]);
      const text = ranges.length ? 'CED topics ' + ranges.join(' · ') : '';
      if (bonus) return (text ? text + ' · ' : '') + '★ Beyond the Exam';
      return text || 'Course work';
    }

    function cedLegacyUnitLabel(oldUnit, registry) {
      refreshMetadata(registry);
      const unit = String(oldUnit || '').replace(/^U/i, '');
      const keys = Object.keys(metadata).filter(key => key.split('.')[0] === unit);
      return cedTopicCoverage(keys, registry);
    }

    // Use only on raw legacy display strings, never on URLs, keys, or CED labels.
    function cedDisplayText(raw, registry) {
      const text = String(raw || '');
      const arrow = /^(\d+\.\d+)\s*(?:→|->)\s*\d+\.\d+\s*[·:—-]/.exec(text);
      if (arrow) return cedLabel(arrow[1], registry).text;
      return text.replace(/\bU(\d+)[_-]?L(?:esson)?(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\bUnit\s+(\d+)\s*(?:[·,:-]\s*)?Lesson\s+(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\b([1-9]\.\d+(?:[–-](?:\d+\.)?\d+)?)\b|\b(?:Unit\s+|U)([6-9])\b/gi,
        (_match, unit, lesson, wordUnit, wordLesson, topic, legacyUnit) => legacyUnit
          ? cedLegacyUnitLabel(legacyUnit, registry)
          : cedLabel(topic || (unit || wordUnit) + '.' + (lesson || wordLesson), registry).text);
    }

    // Prose can contain decimal grades. Translate explicit lesson references only.
    function cedReferenceText(raw, registry) {
      return String(raw || '').replace(/\b(?:Topic|Lesson)\s+([1-9]\.\d+(?:[–-](?:\d+\.)?\d+)?)\b|\bU(\d+)[_-]?L(?:esson)?(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\bUnit\s+(\d+)\s*(?:[·,:-]\s*)?Lesson\s+(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\b(?:Unit\s+|U)([6-9])\b/gi,
        (_match, topic, unit, lesson, wordUnit, wordLesson, legacyUnit) => legacyUnit
          ? cedLegacyUnitLabel(legacyUnit, registry)
          : cedLabel(topic || (unit || wordUnit) + '.' + (lesson || wordLesson), registry).text);
    }

    // The spec's shape: { topic: '1.13', text: '1.13 · Experimental Design · Day 1', unit: 1,
    // status: 'core' | 'bonus' }. An unknown key warns once and shows the stored key
    // (status 'unmapped') — tests/ced-no-raw-keys.test.js fails any scheduled lesson that does.
    function cedTopicLabel(oldKey) {
      const key = String(oldKey || '');
      const label = cedLabel(key);
      if (!label.mapped) {
        warnOnce(key, 'topic label');
        return { topic: key, text: key, unit: null, status: 'unmapped', day: null, days: 1 };
      }
      if (label.bonus) {
        const entry = metadata[key];
        return { topic: null, text: label.text, unit: entry ? entry.bonusUnit || null : null,
          status: 'bonus', day: null, days: 1 };
      }
      return { topic: label.id, text: label.text, unit: label.unit, status: 'core',
        day: label.day, days: label.days };
    }

    // The name a gradebook column shows before its kind word:
    //   '3.5' → '1.13 Day 1'   '6.1-2' → '3.3'   '4.3-4-5' → '2.4-2.6'
    //   '9.3' → 'Beyond the Exam: Slope inference Day 3'.
    // Core topics win over bonus segments in a mixed worksheet ('3.6-7' → '1.13 Day 2').
    // null when the crosswalk does not know the key.
    function columnName(oldKey) {
      refreshMetadata();
      const parts = expandedTopicKeys(String(oldKey || ''));
      const core = [];
      const bonus = [];
      for (const part of parts) {
        const entry = metadata[part];
        if (entry && entry.status === 'core' && entry.newTopic) core.push(part);
        else if (entry && entry.status === 'bonus') bonus.push(part);
        else return null;
      }
      if (core.length) {
        const topics = [...new Set(core.map(part => metadata[part].newTopic))];
        if (topics.length > 1) return topicRanges(topics, '-').join(' + ');
        const group = folded[topics[0]] || core;
        const days = core.map(part => group.indexOf(part) + 1);
        const day = dayText(days, group.length);
        return topics[0] + (day ? ' ' + day : '');
      }
      const short = shortBonusLabel(metadata[bonus[0]].newLabel);
      const group = bonusFolded[short] || bonus;
      const days = bonus.filter(part => shortBonusLabel(metadata[part].newLabel) === short)
        .map(part => group.indexOf(part) + 1);
      const day = dayText(days, group.length);
      return 'Beyond the Exam: ' + short + (day ? ' ' + day : '');
    }

    // Gradebook / Schoology column title in CED numbering:
    //   ('followalong', '3.5') → '1.13 Day 1 Follow-Along'   ('blooket', '3.1') → '1.10 Day 1 Blooket'
    //   ('quiz', '1.4') → '1.4 Quiz'                          ('pc', 1) / ('pc', 'U1') → 'Unit 1 Progress Check'
    // The kind word always ENDS the title (tools/schoology_official.column_category reads it).
    // Plain ASCII, never ', ': data/ced-column-titles.json is the contract (tests pin equality).
    // An unknown key warns once and keeps the stored key ('3.99 Quiz').
    function cedColumnTitle(kind, oldKey) {
      if (kind === 'pc' || kind === 'poster') {
        const unit = String(oldKey == null ? '' : oldKey).replace(/^U/i, '');
        return 'Unit ' + unit + (kind === 'pc' ? ' Progress Check' : ' Poster');
      }
      const word = KIND_WORD[kind];
      if (!word) return String(oldKey || '');
      const name = columnName(oldKey);
      if (name) return name + ' ' + word;
      warnOnce(String(oldKey || ''), kind + ' column');
      return String(oldKey || '') + ' ' + word;
    }

    // Retitle a buildGradebook() result in place: `title` becomes the CED title and
    // `schoologyTitle` the title the real Schoology column has today (the old one until the
    // teacher runs the rename and flips SCHOOLOGY_TITLES_CED). Returns the same object.
    function retitleGradebook(gradebook, options) {
      const schoologyCed = !!(options && options.schoologyTitlesCed);
      const quarters = gradebook && gradebook.quarters;
      if (!quarters || typeof quarters !== 'object') return gradebook;
      for (const quarter of Object.values(quarters)) {
        const columns = quarter && Array.isArray(quarter.columns) ? quarter.columns : [];
        for (const col of columns) retitleColumn(col, schoologyCed);
      }
      return gradebook;
    }

    function retitleColumn(col, schoologyCed) {
      if (!col || typeof col.key !== 'string') return;
      const colon = col.key.indexOf(':');
      if (colon < 0) return;
      const kind = COLUMN_KIND[col.key.slice(0, colon)];
      if (!kind) return;
      // Schoology's real column never carries the roster's teacher-facing " (bonus)" note.
      const oldTitle = (typeof col.title === 'string' ? col.title : col.key).replace(/ \(bonus\)$/, '');
      const cedTitle = cedColumnTitle(kind, col.key.slice(colon + 1));
      const bonusNote = kind === 'blooket' && col.blooketBonus && !/^Beyond the Exam/.test(cedTitle);
      col.title = bonusNote ? cedTitle + ' (bonus)' : cedTitle;
      col.schoologyTitle = schoologyCed ? cedTitle : oldTitle;
    }

    // CED-2026 unit name from the crosswalk's `units` map: 1 → 'Exploring One-Variable Data &
    // Collecting Data'. Unknown unit → 'Unit 7' (never an empty heading).
    function cedUnitLabel(newUnit) {
      const unit = String(newUnit == null ? '' : newUnit).replace(/^U/i, '');
      const units = readUnits() || {};
      return units[unit] || 'Unit ' + unit;
    }

    return {
      configureCedLabels, cedLabel, cedUnitClass, cedTopicCoverage, cedLegacyUnitLabel,
      cedDisplayText, cedReferenceText, cedTopicLabel, cedColumnTitle, retitleGradebook, cedUnitLabel,
    };
  }

  // The page's own labeller: the synchronous fallback map (js/ced2026-crosswalk.js sets
  // window.CED2026_CROSSWALK + CED2026_UNITS), overlaid by whatever registry the page configures.
  const defaultInstance = createCedLabels(() => root.CED2026_CROSSWALK || {}, () => root.CED2026_UNITS || {});

  return Object.assign({ createCedLabels, expandedTopicKeys, defaultInstance }, defaultInstance);
});

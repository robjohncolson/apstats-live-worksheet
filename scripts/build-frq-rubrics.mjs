#!/usr/bin/env node

import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  buildServerReflectionPrompt,
  FRQ_RUBRIC_SCHEMA,
  FRQ_RUBRIC_SCHOOL_YEAR,
  validateFrqRubricRegistry,
} from '../roster-server/frq-prompt.js';
import { buildManifest } from '../tools/frq-regrade-manifest.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(THIS_FILE), '..');
const MANIFEST_RELATIVE_PATH = 'data/frq-regrade-manifest.json';
const OUTPUT_RELATIVE_PATH = 'roster-server/data/frq-rubrics.SY2627.json';

export const EXPECTED_WORKSHEET_COUNT = 69;
export const EXPECTED_ITEM_COUNT = 212;
export const MAX_PRETTY_ARTIFACT_BYTES = Math.floor(1.5 * 1024 * 1024);
export const FIXED_SAMPLE_ANSWER = '__APSTATS_FRQ_SAMPLE_7f4c5e2d91b8436aa76f0d39c821e5b7__';
export const ADVERSARIAL_SAMPLE_ANSWER = [
  '"double" and \'single\' quotes',
  'line one\nline two\r\nline three',
  '`backticks` and ${templateLike} and \\${escapedTemplateLike}',
  '^$.*+?()[]{}|\\ /regex/g',
  `long-run:${'Z'.repeat(16_384)}:end`,
].join('\n');
export const PURITY_SAMPLE_ANSWER = '  Unicode: 数据 📊 — leading and trailing whitespace  ';

const FORBIDDEN_AMBIENT_GLOBALS = new Set([
  'Date',
  'XMLHttpRequest',
  'crypto',
  'document',
  'fetch',
  'globalThis',
  'history',
  'localStorage',
  'location',
  'navigator',
  'performance',
  'requestAnimationFrame',
  'screen',
  'self',
  'sessionStorage',
  'WebSocket',
  'window',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function addDigestPart(hash, label, value) {
  const bytes = Buffer.from(value, 'utf8');
  hash.update(`${Buffer.byteLength(label, 'utf8')}:${label}:${bytes.length}:`);
  hash.update(bytes);
}

export function computeFrqRubricSourceDigest(manifestSource, promptSources) {
  const hash = createHash('sha256');
  addDigestPart(hash, MANIFEST_RELATIVE_PATH, manifestSource);
  for (const [filename, source] of [...promptSources.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  ))) {
    addDigestPart(hash, filename, source);
  }
  return `sha256:${hash.digest('hex')}`;
}

function countOccurrences(value, marker) {
  let count = 0;
  let offset = 0;
  while (offset <= value.length) {
    const foundAt = value.indexOf(marker, offset);
    if (foundAt === -1) return count;
    count += 1;
    offset = foundAt + marker.length;
  }
  return count;
}

function firstDifferingByte(expected, actual) {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  const sharedLength = Math.min(expectedBytes.length, actualBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (expectedBytes[index] !== actualBytes[index]) return index;
  }
  return expectedBytes.length === actualBytes.length ? -1 : sharedLength;
}

function divergenceError(worksheet, textareaId, expected, actual, sampleName) {
  return new Error([
    `FRQ prompt divergence (${sampleName})`,
    `prefix: ${worksheet.prefix}`,
    `textareaId: ${textareaId}`,
    `sourceFile: ${worksheet.promptsFile}`,
    `builderName: ${worksheet.builderName}`,
    `firstDifferingByte: ${firstDifferingByte(expected, actual)}`,
    `expectedSha256: ${sha256(expected)}`,
    `actualSha256: ${sha256(actual)}`,
  ].join('\n'));
}

function readNamedValue(window, context, name, sourceFile) {
  if (!/^[A-Za-z_$][\w$]*$/.test(name || '')) {
    throw new Error(`${sourceFile}: invalid global name ${JSON.stringify(name)}`);
  }
  if (Object.hasOwn(window, name)) return window[name];
  try {
    return runInContext(name, context);
  } catch (error) {
    throw new Error(`${sourceFile}: could not read ${name}: ${error.message}`);
  }
}

function memberName(node) {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal') return String(node.property.value);
  return null;
}

function addPatternNames(pattern, names) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    names.add(pattern.name);
    return;
  }
  if (pattern.type === 'RestElement') {
    addPatternNames(pattern.argument, names);
    return;
  }
  if (pattern.type === 'AssignmentPattern') {
    addPatternNames(pattern.left, names);
    return;
  }
  if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) addPatternNames(element, names);
    return;
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      addPatternNames(property.type === 'RestElement' ? property.argument : property.value, names);
    }
  }
}

function collectLocalNames(node) {
  const names = new Set();
  ancestor(node, {
    VariableDeclarator(declaration) {
      addPatternNames(declaration.id, names);
    },
    FunctionDeclaration(fn) {
      if (fn.id) names.add(fn.id.name);
      for (const parameter of fn.params) addPatternNames(parameter, names);
    },
    FunctionExpression(fn) {
      if (fn.id) names.add(fn.id.name);
      for (const parameter of fn.params) addPatternNames(parameter, names);
    },
    ArrowFunctionExpression(fn) {
      for (const parameter of fn.params) addPatternNames(parameter, names);
    },
    CatchClause(clause) {
      addPatternNames(clause.param, names);
    },
  });
  return names;
}

function topLevelBindings(program) {
  const bindings = new Map();
  for (const statement of program.body) {
    if (statement.type === 'FunctionDeclaration' && statement.id) {
      bindings.set(statement.id.name, { kind: 'function', node: statement });
      continue;
    }
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      const names = new Set();
      addPatternNames(declaration.id, names);
      for (const name of names) {
        bindings.set(name, { kind: statement.kind, node: declaration.init });
      }
    }
  }
  return bindings;
}

function findBuilderFunction(program, builderName, bindings) {
  const binding = bindings.get(builderName);
  if (binding?.node && (
    binding.node.type === 'FunctionDeclaration'
    || binding.node.type === 'FunctionExpression'
    || binding.node.type === 'ArrowFunctionExpression'
  )) {
    return binding.node;
  }

  let builder = null;
  ancestor(program, {
    AssignmentExpression(assignment) {
      if (assignment.left.type !== 'MemberExpression') return;
      if (assignment.left.object.type !== 'Identifier') return;
      if (assignment.left.object.name !== 'window') return;
      if (memberName(assignment.left) !== builderName) return;
      if (
        assignment.right.type === 'FunctionExpression'
        || assignment.right.type === 'ArrowFunctionExpression'
      ) {
        builder = assignment.right;
      }
    },
  });
  return builder;
}

function assignmentRootName(node) {
  let current = node;
  while (current?.type === 'MemberExpression') current = current.object;
  return current?.type === 'Identifier' ? current.name : null;
}

function purityError(worksheet, detail) {
  return new Error(
    `${worksheet.promptsFile}: ${worksheet.builderName} violates prompt purity: ${detail}`,
  );
}

export function assertPromptBuilderPurity(promptsSource, worksheet) {
  let program;
  try {
    program = parse(promptsSource, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (error) {
    throw new Error(`${worksheet.promptsFile}: could not parse prompt source: ${error.message}`);
  }

  const bindings = topLevelBindings(program);
  const builder = findBuilderFunction(program, worksheet.builderName, bindings);
  if (!builder) {
    throw new Error(`${worksheet.promptsFile}: could not statically locate ${worksheet.builderName}`);
  }

  const allowedWindowMembers = new Set([worksheet.contextName, worksheet.rubricsName]);
  const visitedBindings = new Set();

  function inspect(node, label) {
    if (!node) return;
    const locals = collectLocalNames(node);
    ancestor(node, {
      ThisExpression() {
        throw purityError(worksheet, `${label} references this`);
      },
      MemberExpression(member) {
        if (
          member.object.type === 'Identifier'
          && member.object.name === 'Math'
          && memberName(member) === 'random'
        ) {
          throw purityError(worksheet, `${label} references Math.random`);
        }
        if (member.object.type !== 'Identifier' || member.object.name !== 'window') return;
        const property = memberName(member);
        if (property && allowedWindowMembers.has(property)) return;
        throw purityError(
          worksheet,
          `${label} references forbidden browser global window.${property || '<computed>'}`,
        );
      },
      CallExpression(call) {
        if (call.callee.type !== 'MemberExpression') return;
        const rootName = assignmentRootName(call.callee.object);
        const method = memberName(call.callee);
        const mutatingMethods = new Set([
          'add', 'clear', 'copyWithin', 'delete', 'fill', 'pop', 'push',
          'reverse', 'set', 'shift', 'sort', 'splice', 'unshift',
        ]);
        if (!rootName || locals.has(rootName) || !bindings.has(rootName)) return;
        if (!mutatingMethods.has(method)) return;
        throw purityError(
          worksheet,
          `${label} mutates module binding ${rootName} with ${method}()`,
        );
      },
      AssignmentExpression(assignment) {
        const rootName = assignmentRootName(assignment.left);
        if (!rootName || locals.has(rootName)) return;
        throw purityError(worksheet, `${label} writes mutable module/global state ${rootName}`);
      },
      UpdateExpression(update) {
        const rootName = assignmentRootName(update.argument);
        if (!rootName || locals.has(rootName)) return;
        throw purityError(worksheet, `${label} writes mutable module/global state ${rootName}`);
      },
      UnaryExpression(expression) {
        if (expression.operator !== 'delete') return;
        const rootName = assignmentRootName(expression.argument);
        if (!rootName || locals.has(rootName)) return;
        throw purityError(worksheet, `${label} writes mutable module/global state ${rootName}`);
      },
      Identifier(identifier, _state, ancestors) {
        if (locals.has(identifier.name)) return;
        const parent = ancestors[ancestors.length - 2];
        if (
          identifier.name === 'window'
          && parent?.type === 'MemberExpression'
          && parent.object === identifier
          && allowedWindowMembers.has(memberName(parent))
        ) {
          return;
        }
        if (FORBIDDEN_AMBIENT_GLOBALS.has(identifier.name)) {
          throw purityError(worksheet, `${label} references forbidden ambient ${identifier.name}`);
        }

        const dependency = bindings.get(identifier.name);
        if (!dependency || visitedBindings.has(identifier.name)) return;
        if (dependency.kind === 'let' || dependency.kind === 'var') {
          throw purityError(
            worksheet,
            `${label} references mutable module binding ${identifier.name}`,
          );
        }
        visitedBindings.add(identifier.name);
        inspect(dependency.node, `dependency ${identifier.name}`);
      },
    });
  }

  inspect(builder, 'builder');
}

function evaluateIsolatedPromptsSource(source, filename) {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = createContext(sandbox);
  runInContext(source, context, { filename });
  return { window: sandbox, context, close() {} };
}

export function evaluateWorksheetPromptsSource(
  source,
  filename,
  worksheetHtml,
  worksheetFilename = filename,
) {
  const dom = new JSDOM(worksheetHtml, {
    runScripts: 'outside-only',
    url: `https://worksheet.local/${worksheetFilename}`,
  });
  const context = dom.getInternalVMContext();
  runInContext(source, context, { filename });
  return {
    window: dom.window,
    context,
    close() { dom.window.close(); },
  };
}

function promptCallKey(textareaId, answer) {
  return JSON.stringify([textareaId, answer]);
}

function callBuilder(runtime, worksheet, textareaId, answer) {
  const builder = readNamedValue(
    runtime.window,
    runtime.context,
    worksheet.builderName,
    worksheet.promptsFile,
  );
  if (typeof builder !== 'function') {
    throw new Error(`${worksheet.promptsFile}: ${worksheet.builderName} is not a function`);
  }
  const prompt = builder(textareaId, answer);
  if (typeof prompt !== 'string' || !prompt) {
    throw new Error(
      `${worksheet.promptsFile}: ${worksheet.builderName} returned no prompt for ${textareaId}`,
    );
  }
  return prompt;
}

function promptParityError(worksheet, textareaId, expected, actual, sequence) {
  return new Error([
    `FRQ prompt purity divergence (${sequence})`,
    `prefix: ${worksheet.prefix}`,
    `textareaId: ${textareaId}`,
    `sourceFile: ${worksheet.promptsFile}`,
    `builderName: ${worksheet.builderName}`,
    `firstDifferingByte: ${firstDifferingByte(expected, actual)}`,
    `expectedSha256: ${sha256(expected)}`,
    `actualSha256: ${sha256(actual)}`,
  ].join('\n'));
}

function assertRuntimeSequence(runtime, worksheet, calls, canonical, sequence, repetitions = 1) {
  for (const { textareaId, answer } of calls) {
    const expected = canonical.get(promptCallKey(textareaId, answer));
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const actual = callBuilder(runtime, worksheet, textareaId, answer);
      if (actual !== expected) {
        throw promptParityError(worksheet, textareaId, expected, actual, sequence);
      }
    }
  }
}

function validatePromptBuilderParity(promptsSource, worksheet, worksheetHtml) {
  assertPromptBuilderPurity(promptsSource, worksheet);
  const answers = [FIXED_SAMPLE_ANSWER, ADVERSARIAL_SAMPLE_ANSWER, PURITY_SAMPLE_ANSWER];
  const calls = worksheet.textareaIds.flatMap((textareaId) => (
    answers.map((answer) => ({ textareaId, answer }))
  ));

  const baseline = evaluateIsolatedPromptsSource(promptsSource, worksheet.promptsFile);
  const canonical = new Map();
  for (const { textareaId, answer } of calls) {
    canonical.set(
      promptCallKey(textareaId, answer),
      callBuilder(baseline, worksheet, textareaId, answer),
    );
  }

  const repeated = evaluateIsolatedPromptsSource(promptsSource, worksheet.promptsFile);
  assertRuntimeSequence(repeated, worksheet, calls, canonical, 'isolated repeated calls', 3);

  const permuted = evaluateIsolatedPromptsSource(promptsSource, worksheet.promptsFile);
  assertRuntimeSequence(
    permuted,
    worksheet,
    [...calls].reverse(),
    canonical,
    'isolated permuted calls',
  );

  const browser = evaluateWorksheetPromptsSource(
    promptsSource,
    worksheet.promptsFile,
    worksheetHtml,
    worksheet.filename,
  );
  try {
    assertRuntimeSequence(
      browser,
      worksheet,
      [...calls].reverse(),
      canonical,
      'worksheet browser calls',
    );
    assertRuntimeSequence(browser, worksheet, calls, canonical, 'worksheet repeated calls', 3);
  } finally {
    browser.close();
  }

  return {
    window: baseline.window,
    context: baseline.context,
    promptFor(textareaId, answer) {
      return canonical.get(promptCallKey(textareaId, answer));
    },
  };
}

function cloneJsonValue(value, label) {
  if (value === undefined) throw new Error(`${label} is undefined`);
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(`${label} is not JSON serializable: ${error.message}`);
  }
}

function assertExactRubricIds(worksheet, rubrics) {
  if (!rubrics || typeof rubrics !== 'object' || Array.isArray(rubrics)) {
    throw new Error(`${worksheet.promptsFile}: ${worksheet.rubricsName} is not an object`);
  }

  const textareaIds = [...worksheet.textareaIds].sort();
  const rubricIds = Object.keys(rubrics).sort();
  if (JSON.stringify(textareaIds) === JSON.stringify(rubricIds)) return;

  const textareaSet = new Set(textareaIds);
  const rubricSet = new Set(rubricIds);
  const missing = textareaIds.filter((id) => !rubricSet.has(id));
  const extra = rubricIds.filter((id) => !textareaSet.has(id));
  throw new Error([
    `${worksheet.prefix}: textarea/rubric ids disagree in ${worksheet.promptsFile}`,
    `missing rubric ids: ${missing.join(', ') || 'none'}`,
    `extra rubric ids: ${extra.join(', ') || 'none'}`,
  ].join('\n'));
}

function buildItemRecipe(registry, worksheet, textareaId, promptFor) {
  const samplePrompt = promptFor(textareaId, FIXED_SAMPLE_ANSWER);
  if (typeof samplePrompt !== 'string' || !samplePrompt) {
    throw new Error(`${worksheet.promptsFile}: ${worksheet.builderName} returned no prompt for ${textareaId}`);
  }

  const markerCount = countOccurrences(samplePrompt, FIXED_SAMPLE_ANSWER);
  if (markerCount !== 1) {
    throw new Error(
      `${worksheet.prefix} ${textareaId} ${worksheet.promptsFile} ${worksheet.builderName}: `
      + `fixed sample marker occurred ${markerCount} times; expected exactly once`,
    );
  }

  const markerOffset = samplePrompt.indexOf(FIXED_SAMPLE_ANSWER);
  const item = {
    promptBeforeAnswer: samplePrompt.slice(0, markerOffset),
    promptAfterAnswer: samplePrompt.slice(markerOffset + FIXED_SAMPLE_ANSWER.length),
    samplePromptSha256: sha256(samplePrompt),
  };
  registry.worksheets[worksheet.prefix].items[textareaId] = item;

  const rebuiltSample = buildServerReflectionPrompt(
    registry,
    worksheet.prefix,
    textareaId,
    FIXED_SAMPLE_ANSWER,
  );
  if (rebuiltSample !== samplePrompt) {
    throw divergenceError(worksheet, textareaId, samplePrompt, rebuiltSample, 'fixed sample');
  }

  const adversarialPrompt = promptFor(textareaId, ADVERSARIAL_SAMPLE_ANSWER);
  const rebuiltAdversarial = buildServerReflectionPrompt(
    registry,
    worksheet.prefix,
    textareaId,
    ADVERSARIAL_SAMPLE_ANSWER,
  );
  if (rebuiltAdversarial !== adversarialPrompt) {
    throw divergenceError(
      worksheet,
      textareaId,
      adversarialPrompt,
      rebuiltAdversarial,
      'adversarial sample',
    );
  }
}

function assertBundleGates(registry, serialized, itemIds) {
  const prefixes = Object.keys(registry.worksheets);
  if (prefixes.length !== EXPECTED_WORKSHEET_COUNT) {
    throw new Error(`expected ${EXPECTED_WORKSHEET_COUNT} unique prefixes, found ${prefixes.length}`);
  }
  if (itemIds.size !== EXPECTED_ITEM_COUNT) {
    throw new Error(`expected ${EXPECTED_ITEM_COUNT} unique FRQ item ids, found ${itemIds.size}`);
  }

  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  if (sizeBytes > MAX_PRETTY_ARTIFACT_BYTES) {
    throw new Error(
      `FRQ rubric artifact is ${sizeBytes} bytes; limit is ${MAX_PRETTY_ARTIFACT_BYTES} bytes`,
    );
  }
  validateFrqRubricRegistry(registry);
}

export function serializeFrqRubricBundle(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

export function generateFrqRubricBundle(rootDir = ROOT) {
  const manifestPath = resolve(rootDir, MANIFEST_RELATIVE_PATH);
  const manifestSource = readFileSync(manifestPath, 'utf8');
  const committedManifest = JSON.parse(manifestSource);
  if (!Array.isArray(committedManifest.worksheets)) {
    throw new Error(`${manifestPath}: worksheets must be an array`);
  }
  const manifest = buildManifest(rootDir);
  if (!isDeepStrictEqual(manifest, committedManifest)) {
    throw new Error(
      `${manifestPath}: committed manifest does not match the live worksheet page inventory`,
    );
  }

  const promptSources = new Map();
  for (const worksheet of manifest.worksheets) {
    if (promptSources.has(worksheet.promptsFile)) continue;
    promptSources.set(
      worksheet.promptsFile,
      readFileSync(resolve(rootDir, worksheet.promptsFile), 'utf8'),
    );
  }

  const registry = {
    schema: FRQ_RUBRIC_SCHEMA,
    schoolYear: FRQ_RUBRIC_SCHOOL_YEAR,
    sourceDigest: computeFrqRubricSourceDigest(manifestSource, promptSources),
    worksheets: {},
  };
  const itemIds = new Set();
  const sortedWorksheets = [...manifest.worksheets].sort((left, right) => (
    left.prefix.localeCompare(right.prefix)
  ));

  for (const worksheet of sortedWorksheets) {
    if (registry.worksheets[worksheet.prefix]) {
      throw new Error(`duplicate worksheet prefix: ${worksheet.prefix}`);
    }
    if (!Array.isArray(worksheet.textareaIds) || !worksheet.textareaIds.length) {
      throw new Error(`${worksheet.prefix}: textareaIds must be a non-empty array`);
    }

    const promptsSource = promptSources.get(worksheet.promptsFile);
    const worksheetHtml = readFileSync(resolve(rootDir, worksheet.filename), 'utf8');
    const { window, context, promptFor } = validatePromptBuilderParity(
      promptsSource,
      worksheet,
      worksheetHtml,
    );
    const lessonContext = readNamedValue(
      window,
      context,
      worksheet.contextName,
      worksheet.promptsFile,
    );
    const rubrics = readNamedValue(window, context, worksheet.rubricsName, worksheet.promptsFile);
    assertExactRubricIds(worksheet, rubrics);

    registry.worksheets[worksheet.prefix] = {
      filename: worksheet.filename,
      topic: worksheet.topic,
      lessonContext: cloneJsonValue(
        lessonContext,
        `${worksheet.promptsFile}: ${worksheet.contextName}`,
      ),
      items: {},
    };

    const textareaIds = [...worksheet.textareaIds].sort((left, right) => left.localeCompare(right));
    for (const textareaId of textareaIds) {
      const itemId = `${worksheet.prefix}-${textareaId}`;
      if (itemIds.has(itemId)) throw new Error(`duplicate FRQ item id: ${itemId}`);
      itemIds.add(itemId);
      buildItemRecipe(registry, worksheet, textareaId, promptFor);
    }
  }

  const serialized = serializeFrqRubricBundle(registry);
  assertBundleGates(registry, serialized, itemIds);
  return {
    registry,
    serialized,
    parityCount: itemIds.size,
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
  };
}

export function writeFrqRubricBundle(rootDir = ROOT) {
  const generated = generateFrqRubricBundle(rootDir);
  const outputPath = resolve(rootDir, OUTPUT_RELATIVE_PATH);
  writeFileSync(outputPath, generated.serialized);
  return { ...generated, outputPath };
}

function checkCommittedBundle(rootDir = ROOT) {
  const generated = generateFrqRubricBundle(rootDir);
  const outputPath = resolve(rootDir, OUTPUT_RELATIVE_PATH);
  let committed;
  try {
    committed = readFileSync(outputPath, 'utf8');
  } catch (error) {
    throw new Error(`${outputPath}: committed FRQ rubric bundle is missing: ${error.message}`);
  }
  if (committed === generated.serialized) return;
  throw new Error(
    `${outputPath}: committed FRQ rubric bundle is stale `
    + `(first differing byte ${firstDifferingByte(generated.serialized, committed)})`,
  );
}

function parseArgs(argv) {
  if (!argv.length) return { check: false };
  if (argv.length === 1 && argv[0] === '--check') return { check: true };
  throw new Error(`unknown argument: ${argv.join(' ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.check) {
      checkCommittedBundle();
    } else {
      const result = writeFrqRubricBundle();
      console.log(
        `Wrote ${result.parityCount}/${EXPECTED_ITEM_COUNT} FRQ rubrics `
        + `(${result.sizeBytes} bytes) to ${result.outputPath}`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeScriptFilenames } from './native/manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const proceduresPath = path.join(projectRoot, 'ti84-procedures-data.json');
const patternsPath = path.join(projectRoot, 'ti84-pattern-recognition-data.json');
const stateMachinePath = path.join(projectRoot, 'ti84-state-machine.js');

const stylePath = path.join(__dirname, 'style.css');
const appPath = path.join(__dirname, 'app.js');
const bridgePath = path.join(__dirname, 'bridge.js');
const nativeDir = path.join(__dirname, 'native');

const generatedDir = path.join(__dirname, 'generated');
const generatedProceduresPath = path.join(generatedDir, 'data-procedures.js');
const generatedPatternsPath = path.join(generatedDir, 'data-patterns.js');
const generatedStateMachinePath = path.join(generatedDir, 'state-machine.js');
const standalonePath = path.join(__dirname, 'standalone.html');

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function transformStateMachine(source, dataBinding) {
  const stripped = source.replace(
    /import \{ createRequire \} from 'node:module';\r?\n\r?\nconst require = createRequire\(import\.meta\.url\);\r?\nconst proceduresData = require\('\.\/ti84-procedures-data\.json'\);\r?\n/,
    `${dataBinding}\n`,
  );
  const browserReady = stripped.replace(/export function /g, 'function ');

  return [
    '(function () {',
    browserReady,
    'window.TI84V2Machine = { createState, createRouteState, transition, validKeys };',
    '}());',
  ].join('\n');
}

export function buildStandalone() {
  const proceduresData = JSON.stringify(JSON.parse(fs.readFileSync(proceduresPath, 'utf8')));
  const patternsData = JSON.stringify(JSON.parse(fs.readFileSync(patternsPath, 'utf8')));
  const stateMachineSource = fs.readFileSync(stateMachinePath, 'utf8');
  const styleSource = fs.readFileSync(stylePath, 'utf8');
  const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const nativeSources = nativeScriptFilenames.map((filename) => ({
    filename,
    source: fs.readFileSync(path.join(nativeDir, filename), 'utf8'),
  }));

  const generatedProcedures = [
    '(function () {',
    `window.TI84V2ProceduresData = ${proceduresData};`,
    '}());',
    '',
  ].join('\n');

  const generatedPatterns = [
    '(function () {',
    `window.TI84V2PatternsData = ${patternsData};`,
    '}());',
    '',
  ].join('\n');

  const generatedStateMachine = transformStateMachine(
    stateMachineSource,
    'const proceduresData = window.TI84V2ProceduresData;',
  );

  const nativeInlineScripts = nativeSources
    .map(
      ({ source }) => `  <script>
${escapeInlineScript(source)}
  </script>`,
    )
    .join('\n');

  const standalone = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TI-84 Procedural Trainer V3</title>
  <style>
${styleSource}
  </style>
</head>
<body>
  <div id="app"></div>
  <!-- Roster identity + practice recording (optional — trainer works without them) -->
  <script src="../roster_config.js"></script>
  <script src="../roster-client.js"></script>
  <script src="../gradebook-client.js"></script>
  <script src="./rom-config.js"></script>
  <script>
${escapeInlineScript(generatedProcedures)}
  </script>
  <script>
${escapeInlineScript(generatedPatterns)}
  </script>
  <script>
${escapeInlineScript(generatedStateMachine)}
  </script>
  <script>
${escapeInlineScript(bridgeSource)}
  </script>
${nativeInlineScripts}
  <script>
${escapeInlineScript(appSource)}
  </script>
</body>
</html>
`;

  return {
    standalone,
    generated: {
      'data-procedures.js': generatedProcedures,
      'data-patterns.js': generatedPatterns,
      'state-machine.js': generatedStateMachine,
    },
  };
}

function writeStandaloneBuild() {
  fs.mkdirSync(generatedDir, { recursive: true });

  const build = buildStandalone();

  fs.writeFileSync(generatedProceduresPath, build.generated['data-procedures.js']);
  fs.writeFileSync(generatedPatternsPath, build.generated['data-patterns.js']);
  fs.writeFileSync(generatedStateMachinePath, build.generated['state-machine.js']);
  fs.writeFileSync(standalonePath, build.standalone);

  const bytes = Buffer.byteLength(build.standalone, 'utf8');
  console.log(`Generated ${path.relative(projectRoot, generatedProceduresPath)}`);
  console.log(`Generated ${path.relative(projectRoot, generatedPatternsPath)}`);
  console.log(`Generated ${path.relative(projectRoot, generatedStateMachinePath)}`);
  console.log(`Generated ${path.relative(projectRoot, standalonePath)} (${(bytes / 1024).toFixed(1)} KB)`);
}

if (process.argv[1] === __filename) {
  writeStandaloneBuild();
}

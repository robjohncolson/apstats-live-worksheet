import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const dataPath = path.join(projectRoot, 'ti84-procedures-data.json');
const stateMachinePath = path.join(projectRoot, 'ti84-state-machine.js');
const runtimePath = path.join(__dirname, 'ti84-trainer-runtime.js');
const stylesPath = path.join(__dirname, 'ti84-trainer-styles.css');
const outputPath = path.join(projectRoot, 'ti84_trainer.html');

const rawData = JSON.stringify(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const stylesSource = fs.readFileSync(stylesPath, 'utf8');
const stateMachineSource = fs.readFileSync(stateMachinePath, 'utf8');

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function transformStateMachine(source) {
  const stripped = source.replace(
    /import \{ createRequire \} from 'node:module';\r?\n\r?\nconst require = createRequire\(import\.meta\.url\);\r?\nconst proceduresData = require\('\.\/ti84-procedures-data\.json'\);\r?\n/,
    'const proceduresData = DATA;\n',
  );

  return stripped.replace(/export function /g, 'function ');
}

const browserStateMachine = [
  '(function () {',
  transformStateMachine(stateMachineSource),
  'window.TI84Machine = { createState, createRouteState, transition, validKeys };',
  '}());',
].join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TI-84 Procedural Trainer</title>
  <style>
${stylesSource}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
const DATA = ${rawData};
  </script>
  <script>
${escapeInlineScript(browserStateMachine)}
  </script>
  <script>
${escapeInlineScript(runtimeSource)}
  </script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);

const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`Generated ${path.basename(outputPath)} (${sizeKb} KB)`);

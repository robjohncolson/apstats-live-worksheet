// Usage: node scripts/build-pico-box2d.mjs <path-to-em++>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = process.argv[2];
if (!compiler) throw new Error('Supply the pinned Emscripten 3.1.74 em++ path');
const version = execFileSync(compiler, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (!version.includes('3.1.74')) throw new Error('This build requires Emscripten 3.1.74');
const vendor = resolve(root, 'apstat-park/vendor/box2d-2.3.1');
const sources = readdirSync(vendor, { recursive: true }).filter(path => path.endsWith('.cpp')).sort().map(path => resolve(vendor, path));
const bridge = resolve(root, 'apstat-park/native-box2d-bridge.cpp');
const exports = [...readFileSync(bridge, 'utf8').matchAll(/\b(pico_\w+)\(/g)].map(match => '_' + match[1]);
const output = resolve(root, 'apstat-park/recovered/box2d.mjs');
const args = [...sources, bridge, '-I', vendor, '-std=c++11', '-O2', '-DNDEBUG', '-ffp-contract=off',
  '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,node', '-sALLOW_MEMORY_GROWTH=1',
  '-sFILESYSTEM=0', '-sEXPORTED_FUNCTIONS=' + JSON.stringify(exports), '-o', output];
// Response file avoids Windows command-line length and shell-quoting problems.
const response = resolve(root, 'test-results/pico-box2d-build.rsp');
mkdirSync(resolve(root, 'test-results'), { recursive: true });
writeFileSync(response, args.map(value => '"' + value.replaceAll('\\', '/').replaceAll('"', '\\"') + '"').join('\n'));
execFileSync(compiler, ['@' + response], { stdio: 'inherit', shell: process.platform === 'win32' });
writeFileSync(output, readFileSync(output, 'utf8').replace(/[ \t]+$/gm, ''));
const files = [bridge, ...readdirSync(vendor, { recursive: true }).filter(path => /\.(cpp|h)$/.test(path)).sort().map(path => resolve(vendor, path))];
writeFileSync(resolve(root, 'apstat-park/recovered/box2d-provenance.json'), JSON.stringify({
  upstream: 'https://github.com/erincatto/box2d', tag: 'v2.3.1', commit: '7e633c4fb86a68bf072fb8ae67ea2c060114750e',
  compiler: 'Emscripten 3.1.74', flags: args.slice(sources.length + 1, -2),
  evidence: 'Body, fixture and world layouts match recovered offsets; full solver parity remains unverified.',
  hashes: Object.fromEntries(files.map(path => [relative(root, path).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(path)).digest('hex')])),
}, null, 2) + '\n');
console.log(`Built Box2D 2.3.1 from ${sources.length} upstream translation units.`);

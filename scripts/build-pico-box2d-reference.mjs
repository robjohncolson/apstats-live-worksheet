// Compile/run the independent desktop fixture oracle (no ROM execution).
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = process.argv[2] || 'clang++';
const vendor = resolve(root, 'apstat-park/vendor/box2d-2.3.1');
const sources = readdirSync(vendor, { recursive: true }).filter(path => path.endsWith('.cpp')).sort().map(path => resolve(vendor, path));
mkdirSync(resolve(root, 'test-results'), { recursive: true });
const executable = resolve(root, 'test-results/pico-box2d-reference' + (process.platform === 'win32' ? '.exe' : ''));
const args = [...sources, resolve(root, 'scripts/pico-box2d-reference.cpp'), '-I', vendor,
  '-std=c++17', '-O2', '-DNDEBUG', '-ffp-contract=off', '-o', executable];
const response = resolve(root, 'test-results/pico-box2d-reference.rsp');
writeFileSync(response, args.map(value => '"' + value.replaceAll('\\', '/').replaceAll('"', '\\"') + '"').join('\n'));
execFileSync(compiler, ['@' + response], { stdio: 'inherit' });
const output = execFileSync(executable, [], { encoding: 'utf8' });
writeFileSync(resolve(root, 'apstat-park/recovered/box2d-reference.json'), JSON.stringify(JSON.parse(output), null, 2) + '\n');
console.log(output);

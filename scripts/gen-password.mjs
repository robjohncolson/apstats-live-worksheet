#!/usr/bin/env node
// gen-password.mjs — print a cryptographically random password.
//
//   node scripts/gen-password.mjs            # 32 chars
//   node scripts/gen-password.mjs 24         # custom length
//   node scripts/gen-password.mjs --alnum    # letters + digits only
//   node scripts/gen-password.mjs --count 3  # several at once
import { randomInt } from 'node:crypto';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

function parseArgs(argv) {
  const opts = { length: 32, alnum: false, count: 1 };
  const rest = argv.slice(2);

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--alnum') {
      opts.alnum = true;
      continue;
    }
    if (arg === '--count' || arg === '-n') {
      opts.count = Number(rest[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--length' || arg === '-l') {
      opts.length = Number(rest[i + 1]);
      i += 1;
      continue;
    }
    if (/^\d+$/.test(arg)) {
      opts.length = Number(arg);
      continue;
    }
    console.error('Unknown argument: ' + arg);
    process.exit(1);
  }

  if (!Number.isInteger(opts.length) || opts.length < 4 || opts.length > 256) {
    console.error('Length must be an integer between 4 and 256.');
    process.exit(1);
  }
  if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > 50) {
    console.error('Count must be an integer between 1 and 50.');
    process.exit(1);
  }
  return opts;
}

function pick(alphabet) {
  return alphabet[randomInt(alphabet.length)];
}

function shuffle(chars) {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars;
}

function generate(length, alnum) {
  const pools = alnum
    ? [LOWER, UPPER, DIGITS]
    : [LOWER, UPPER, DIGITS, SYMBOLS];
  const alphabet = pools.join('');

  // Guarantee one char from each pool so the result meets common site rules.
  const chars = pools.map(pick);
  while (chars.length < length) chars.push(pick(alphabet));
  return shuffle(chars).join('');
}

const opts = parseArgs(process.argv);
for (let i = 0; i < opts.count; i += 1) {
  process.stdout.write(generate(opts.length, opts.alnum) + '\n');
}

// desk-student-wallet-onboarding.test.js — executes the Desk's opt-in
// self-custody ceremony with deterministic wallet/session collaborators.
// Secret material is fake test data; the production path is extracted unchanged
// from ap_stats_roadmap_square_mode.html.
//
// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf8');

const WORDS = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent',
  'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
];
const CHECK_INDEXES = [0, 5, 11];
const ADDRESS = 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L';
const MASKED_ADDRESS = 'DH5y…mr7L';
const EXACT_WARNING = 'Your teacher cannot recover this. The school cannot recover this. Nobody can. '
  + 'If you lose the phrase, any DOGE at this address is gone forever. '
  + 'A paper wallet from your teacher is the safe option.';

function fnSrc(name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!match) throw new Error('fn not found: ' + name);

  const openingBrace = DESK.indexOf('{', match.index);
  let depth = 0;
  for (let index = openingBrace; index < DESK.length; index += 1) {
    if (DESK[index] === '{') depth += 1;
    if (DESK[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return DESK.slice(match.index, index + 1);
  }

  throw new Error('unbalanced: ' + name);
}

function button(root, text) {
  return [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
}

function setInput(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function wallet(overrides = {}) {
  return {
    ok: true,
    candyBalance: 0,
    candyOwed: 0,
    candyEarned: 0,
    candyMaterialized: 0,
    candyReceived: 0,
    candyGiftedOut: 0,
    candyConverted: 0,
    candyRealized: 0,
    dogeBalance: 0,
    dogeSent: 0,
    dogeToDeposit: 0,
    sellableDoge: 0,
    candyPerDoge: 0,
    dogeUsd: 0,
    dogeAddress: null,
    studentWalletOptInEnabled: false,
    studentWalletOnboardingEligible: true,
    proposedAddressMasked: null,
    proposalRejectionReason: null,
    ...overrides,
  };
}

function renderWallet(overrides = {}) {
  const box = document.createElement('div');
  document.body.appendChild(box);
  globalThis._dogeWalletRender(box, wallet(overrides), { total: 0 });
  return box;
}

function openDetails(box) {
  const toggle = [...box.querySelectorAll('span')]
    .find((candidate) => candidate.textContent.includes('Details'));
  expect(toggle, 'wallet Details toggle').toBeTruthy();
  toggle.click();
  return box;
}

function openCeremony() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  globalThis._studentWalletOnboarding(host, wallet({ studentWalletOptInEnabled: true }));

  const start = button(host, '🔐 Create my own wallet (advanced)');
  expect(start, 'advanced wallet action').toBeTruthy();
  start.click();
  return host;
}

async function revealWords(host) {
  const gate = host.querySelector('input[type="text"]');
  const generate = button(host, 'Generate 12-word wallet');
  expect(gate, 'warning acknowledgement input').toBeTruthy();
  expect(generate, 'wallet generation button').toBeTruthy();

  setInput(gate, 'I UNDERSTAND');
  generate.click();
  await settle();
  return host.querySelector('ol[aria-label="wallet recovery words"]');
}

function openWordCheck(host) {
  const check = button(host, 'I wrote all 12 words down');
  expect(check, 'write-down confirmation button').toBeTruthy();
  check.click();

  const inputs = [...host.querySelectorAll('input[type="text"]')];
  expect(inputs).toHaveLength(3);
  return inputs;
}

function enterCheckedWords(inputs) {
  inputs.forEach((input, position) => {
    input.value = WORDS[CHECK_INDEXES[position]];
  });
}

let actionSpy;
let createWalletSpy;
let destroySpy;
let liveWords;
let privateMaterial;
let printSpy;

beforeAll(() => {
  (0, eval)(
    fnSrc('_candyFmt') + '\n'
    + fnSrc('_dogeFmt') + '\n'
    + fnSrc('_dogeWalletRender') + '\n'
    + fnSrc('_walletLedgerDetail') + '\n'
    + fnSrc('_studentWalletOnboardingAllowed') + '\n'
    + fnSrc('_clearStudentWalletCeremony') + '\n'
    + fnSrc('_studentWalletOnboarding') + '\n'
    + fnSrc('_studentWalletCeremony') + '\n'
    + 'globalThis._candyFmt=_candyFmt;'
    + 'globalThis._dogeFmt=_dogeFmt;'
    + 'globalThis._dogeWalletRender=_dogeWalletRender;'
    + 'globalThis._walletLedgerDetail=_walletLedgerDetail;'
    + 'globalThis._studentWalletOnboardingAllowed=_studentWalletOnboardingAllowed;'
    + 'globalThis._clearStudentWalletCeremony=_clearStudentWalletCeremony;'
    + 'globalThis._studentWalletOnboarding=_studentWalletOnboarding;'
    + 'globalThis._studentWalletCeremony=_studentWalletCeremony;',
  );
});

beforeEach(() => {
  document.body.replaceChildren();

  liveWords = WORDS.slice();
  privateMaterial = new Uint8Array([9, 8, 7, 6]);
  destroySpy = vi.fn(() => privateMaterial.fill(0));
  createWalletSpy = vi.fn().mockResolvedValue({
    address: ADDRESS,
    words: vi.fn(() => liveWords),
    destroy: destroySpy,
  });

  const studentWallet = {
    createWallet: createWalletSpy,
    pickWordIndexes: vi.fn(() => CHECK_INDEXES.slice()),
  };
  window.StudentWallet = studentWallet;
  globalThis.StudentWallet = studentWallet;

  actionSpy = vi.fn().mockResolvedValue({
    ok: true,
    proposedAddressMasked: MASKED_ADDRESS,
  });
  globalThis._dogeWalletAction = actionSpy;
  globalThis._dogeWalletPreviewFallback = vi.fn();
  globalThis._dogeWalletFetch = vi.fn();
  globalThis._dogeWalletGiftForm = vi.fn();
  globalThis._dogeWalletChainArm = vi.fn();

  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  delete window.__studentWalletCeremonyCleanup;
  delete window.__WS_READ_ONLY__;
  delete window.rosterClient;
  delete globalThis._viewAsContext;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  delete window.StudentWallet;
  delete globalThis.StudentWallet;
});

describe('Desk student wallet onboarding — server-driven states', () => {
  it('stays hidden when the feature is off and there is no pending/rejected state', () => {
    const box = renderWallet();

    expect(box.textContent).not.toContain('Create my own wallet');
    expect(box.textContent).not.toContain('Address awaiting teacher approval');
    expect(box.textContent).not.toContain('Details');
  });

  it('shows the advanced action in Details when enabled without an approved address', () => {
    const box = openDetails(renderWallet({ studentWalletOptInEnabled: true }));

    expect(box.textContent).toContain('🔐 Create my own wallet (advanced)');
    expect(box.textContent).toContain('The safe default is still a paper wallet from your teacher');
  });

  it('shows a pending masked address and read-aloud instruction without another create action', () => {
    const box = openDetails(renderWallet({ proposedAddressMasked: MASKED_ADDRESS }));

    expect(box.textContent).toContain('⏳ Address awaiting teacher approval: ' + MASKED_ADDRESS);
    expect(box.textContent).toContain('Read the last 4 characters aloud');
    expect(box.textContent).not.toContain('Create my own wallet');
  });

  it('shows a rejection reason and allows a fresh ceremony while the feature remains enabled', () => {
    const box = openDetails(renderWallet({
      studentWalletOptInEnabled: true,
      proposalRejectionReason: 'Last four did not match.',
    }));

    expect(box.textContent).toContain(
      'Your teacher did not approve the proposed address: Last four did not match.',
    );
    expect(box.textContent).toContain('🔐 Create my own wallet (advanced)');
  });

  it('hides onboarding for an approved address even if the opt-in flag is enabled', () => {
    const box = openDetails(renderWallet({
      candyBalance: 1,
      candyOwed: 1,
      candyEarned: 1,
      dogeAddress: ADDRESS,
      studentWalletOptInEnabled: true,
    }));

    expect(box.textContent).not.toContain('Create my own wallet');
    expect(box.textContent).not.toContain('I UNDERSTAND');
  });

  it('fails closed for an ineligible, read-only, view-as, or teacher context', () => {
    const ineligible = openDetails(renderWallet({
      studentWalletOptInEnabled: true,
      studentWalletOnboardingEligible: false,
    }));
    expect(ineligible.textContent).not.toContain('Create my own wallet');

    window.__WS_READ_ONLY__ = true;
    const readOnly = openDetails(renderWallet({ studentWalletOptInEnabled: true }));
    expect(readOnly.textContent).not.toContain('Create my own wallet');
    delete window.__WS_READ_ONLY__;

    globalThis._viewAsContext = () => ({ studentId: 'viewed-student' });
    const viewAs = openDetails(renderWallet({ studentWalletOptInEnabled: true }));
    expect(viewAs.textContent).not.toContain('Create my own wallet');
    delete globalThis._viewAsContext;

    window.rosterClient = { current: () => ({ role: 'teacher' }) };
    const teacher = openDetails(renderWallet({ studentWalletOptInEnabled: true }));
    expect(teacher.textContent).not.toContain('Create my own wallet');
  });
});

describe('Desk student wallet onboarding — reveal ceremony', () => {
  it('requires the exact warning acknowledgement before generation', () => {
    const host = openCeremony();
    const gate = host.querySelector('input[type="text"]');
    const generate = button(host, 'Generate 12-word wallet');

    expect(host.textContent).toContain(EXACT_WARNING);
    expect(host.textContent).toContain('Type I UNDERSTAND exactly to continue.');
    expect(generate.disabled).toBe(true);

    setInput(gate, 'I understand');
    expect(generate.disabled).toBe(true);
    setInput(gate, 'I UNDERSTAND ');
    expect(generate.disabled).toBe(true);
    setInput(gate, 'I UNDERSTAND');
    expect(generate.disabled).toBe(false);
  });

  it('reveals 12 numbered words, prevents copy, and offers printing', async () => {
    const host = openCeremony();
    const wordList = await revealWords(host);

    expect(wordList, 'numbered recovery-word list').toBeTruthy();
    expect(wordList.tagName).toBe('OL');
    expect([...wordList.querySelectorAll('li')].map((item) => item.textContent)).toEqual(WORDS);
    expect(wordList.style.userSelect).toBe('none');

    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    expect(wordList.dispatchEvent(copyEvent)).toBe(false);
    expect(copyEvent.defaultPrevented).toBe(true);

    expect(host.textContent).toContain('Copy is disabled.');
    const print = button(host, 'Print backup');
    expect(print, 'print-backup button').toBeTruthy();
    print.click();
    expect(printSpy).toHaveBeenCalledOnce();
  });

  it('returns a failed three-word check to the same phrase and session', async () => {
    const host = openCeremony();
    await revealWords(host);
    const inputs = openWordCheck(host);

    inputs[0].value = WORDS[CHECK_INDEXES[0]];
    inputs[1].value = 'wrong';
    inputs[2].value = WORDS[CHECK_INDEXES[2]];
    button(host, 'Verify and seal').click();

    expect(host.textContent).toContain('Those words did not match.');
    expect([...host.querySelectorAll('ol li')].map((item) => item.textContent)).toEqual(WORDS);
    expect(createWalletSpy).toHaveBeenCalledOnce();
    expect(destroySpy).not.toHaveBeenCalled();
    expect(liveWords).toEqual(WORDS);
    expect(actionSpy).not.toHaveBeenCalled();
  });

  it('proposes only the public address, then clears secret data and reveal DOM', async () => {
    const host = openCeremony();
    await revealWords(host);
    const inputs = openWordCheck(host);
    enterCheckedWords(inputs);

    button(host, 'Verify and seal').click();
    await settle();

    expect(actionSpy).toHaveBeenCalledOnce();
    expect(actionSpy).toHaveBeenCalledWith(
      '/wallet/address/propose',
      { address: ADDRESS },
    );
    const requestBody = actionSpy.mock.calls[0][1];
    expect(Object.keys(requestBody)).toEqual(['address']);
    expect(JSON.stringify(requestBody)).not.toMatch(new RegExp(WORDS.join('|')));

    expect(destroySpy).toHaveBeenCalledOnce();
    expect([...privateMaterial]).toEqual([0, 0, 0, 0]);
    expect(liveWords).toEqual(new Array(12).fill(''));
    expect(host.querySelectorAll('input')).toHaveLength(0);
    expect(host.querySelector('[aria-label="wallet recovery words"]')).toBeNull();
    WORDS.forEach((word) => expect(host.textContent).not.toContain(word));
    expect(host.textContent).toContain('⏳ Address awaiting teacher approval: ' + MASKED_ADDRESS);
  });

  it('keeps the same session after a failed POST and permits an address-only retry', async () => {
    actionSpy
      .mockResolvedValueOnce({ ok: false, error: 'queue unavailable' })
      .mockResolvedValueOnce({ ok: true, proposedAddressMasked: MASKED_ADDRESS });

    const host = openCeremony();
    await revealWords(host);
    const inputs = openWordCheck(host);
    enterCheckedWords(inputs);
    const seal = button(host, 'Verify and seal');

    seal.click();
    await settle();

    expect(host.textContent).toContain('queue unavailable');
    expect(seal.disabled).toBe(false);
    expect(inputs.map((input) => input.value)).toEqual(['', '', '']);
    expect(createWalletSpy).toHaveBeenCalledOnce();
    expect(destroySpy).not.toHaveBeenCalled();
    expect(liveWords).toEqual(WORDS);

    enterCheckedWords(inputs);
    seal.click();
    await settle();

    expect(actionSpy).toHaveBeenCalledTimes(2);
    actionSpy.mock.calls.forEach(([path, body]) => {
      expect(path).toBe('/wallet/address/propose');
      expect(body).toEqual({ address: ADDRESS });
    });
    expect(createWalletSpy).toHaveBeenCalledOnce();
    expect(destroySpy).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('⏳ Address awaiting teacher approval: ' + MASKED_ADDRESS);
  });

  it('erases the active session when Details closes', async () => {
    const box = openDetails(renderWallet({ studentWalletOptInEnabled: true }));
    button(box, '🔐 Create my own wallet (advanced)').click();
    await revealWords(box);

    const details = [...box.querySelectorAll('span')]
      .find((candidate) => candidate.textContent.includes('Details'));
    details.click();

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(liveWords).toEqual(new Array(12).fill(''));
    expect(box.querySelector('[aria-label="wallet recovery words"]')).toBeNull();

    details.click();
    expect(button(box, '🔐 Create my own wallet (advanced)')).toBeTruthy();
  });

  it('erases the active session before a direct wallet-panel repaint', async () => {
    const box = openDetails(renderWallet({ studentWalletOptInEnabled: true }));
    button(box, '🔐 Create my own wallet (advanced)').click();
    await revealWords(box);

    globalThis._dogeWalletRender(
      box,
      wallet({ studentWalletOptInEnabled: true }),
      { total: 0 },
    );

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(liveWords).toEqual(new Array(12).fill(''));
    expect(box.querySelector('[aria-label="wallet recovery words"]')).toBeNull();
    WORDS.forEach((word) => expect(box.textContent).not.toContain(word));
  });

  it('destroys a wallet that resolves after pagehide cleanup', async () => {
    let resolveWallet;
    createWalletSpy.mockReturnValue(new Promise((resolve) => { resolveWallet = resolve; }));
    const host = openCeremony();
    const gate = host.querySelector('input[type="text"]');
    setInput(gate, 'I UNDERSTAND');
    button(host, 'Generate 12-word wallet').click();

    window.dispatchEvent(new Event('pagehide'));
    resolveWallet({
      address: ADDRESS,
      words: vi.fn(() => liveWords),
      destroy: destroySpy,
    });
    await settle();

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="wallet recovery words"]')).toBeNull();
    expect(host.textContent).not.toContain(WORDS[0]);
  });

  it('wires cleanup into repaint, close, Escape, and minimize paths', () => {
    expect(fnSrc('_dogeWalletRender')).toContain('_clearStudentWalletCeremony()');
    expect(fnSrc('_walletPaint')).toContain('_clearStudentWalletCeremony()');
    expect(fnSrc('destroyWallet')).toContain('_clearStudentWalletCeremony()');
    expect(fnSrc('destroyApp')).toContain("id === 'wallet'");
    expect(fnSrc('minimizeApp')).toContain("id === 'wallet'");
  });
});

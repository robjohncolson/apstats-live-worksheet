// Teacher wallet-proposal queue — structural contract for the static dashboard.
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');

function functionBody(name, nextName) {
  const start = dashboard.indexOf(`function ${name}`);
  const end = nextName ? dashboard.indexOf(`function ${nextName}`, start + 1) : dashboard.length;
  if (start < 0 || end < 0) throw new Error(`Could not find ${name}`);
  return dashboard.slice(start, end);
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function proposalLoaderHarness(fetchProposals, paintProposals, paintError) {
  const loader = functionBody('_loadWalletProposals', '_fetchRewardChain');
  return new Function(
    '_fetchWalletProposals',
    '_paintWalletProposals',
    '_paintWalletProposalError',
    `
      var _walletProposals = null;
      var _walletProposalsLoading = false;
      var _walletProposalsRequestEpoch = 0;
      ${loader}
      return {
        load: _loadWalletProposals,
        state: function () {
          return {
            proposals: _walletProposals,
            loading: _walletProposalsLoading,
            epoch: _walletProposalsRequestEpoch
          };
        }
      };
    `,
  )(fetchProposals, paintProposals, paintError);
}

describe('teacher wallet proposal strip', () => {
  it('loads a teacher-only masked queue independently of the opt-in flag', () => {
    expect(dashboard).toContain('id="wallet-proposals-strip"');
    expect(dashboard).toContain("fetchJson('/class/wallet-proposals', teacherSecret())");
    expect(dashboard).not.toMatch(/STUDENT_WALLET_OPTIN/);
  });

  it('renders count, masked address, loud NEW/CHANGE state, and the read-aloud habit', () => {
    const body = functionBody('_paintWalletProposals', '_paintWalletProposalError');
    expect(body).toContain("'📥 proposed addresses (' + proposals.length + ')'");
    expect(body).toContain('proposal.maskedAddress');
    expect(body).toContain("proposal.change ? 'CHANGE' : 'NEW'");
    expect(body).toContain('reads the last 4 characters aloud');
    expect(body).not.toContain('proposal.address');
    expect(body).not.toContain('proposedAddress');
  });

  it('uses textContent for all server-returned student/address fields', () => {
    const body = functionBody('_paintWalletProposals', '_paintWalletProposalError');
    expect(body).toContain('student.textContent = proposal.studentName');
    expect(body).toContain('address.textContent = proposal.maskedAddress');
    expect(body).not.toContain('innerHTML');
  });

  it('approves or rejects the exact proposal version the teacher reviewed', () => {
    const decide = functionBody('_walletProposalDecide', '_paintWalletProposals');
    expect(decide).toContain('studentId: proposal.studentId');
    expect(decide).toContain('proposedAt: proposal.proposedAt');
    expect(decide).toContain('body.reason = reason');
    expect(dashboard).toContain("'/wallet/address/approve'");
    expect(dashboard).toContain("'/wallet/address/reject'");
  });

  it('keeps a failed decision visible and refreshes wallets after success', () => {
    const decide = functionBody('_walletProposalDecide', '_paintWalletProposals');
    expect(decide).toContain('_walletProposalRefresh()');
    expect(decide).toContain("showError('Address decision failed:");
    const refresh = functionBody('_walletProposalRefresh', '_walletProposalDecide');
    expect(refresh).toContain('_fetchRewardWallets()');
    expect(refresh).toContain('_loadWalletProposals(true)');
  });

  it('does not approve an archived roster row', () => {
    const body = functionBody('_paintWalletProposals', '_paintWalletProposalError');
    expect(body).toContain("proposal.rosterStatus === 'archived'");
    expect(body).toContain('approve.disabled = true');
  });

  it('refetches on every class load and exposes proposal errors with Retry', () => {
    const loader = functionBody('_loadWalletProposals', '_fetchRewardChain');
    const error = functionBody('_paintWalletProposalError', '_loadWalletProposals');
    expect(dashboard).toContain('_loadWalletProposals(true);');
    expect(loader).toContain('if (force) _walletProposals = null');
    expect(loader).toContain('_paintWalletProposalError(error)');
    expect(error).toContain("retry.textContent = 'Retry'");
    expect(error).toContain('_loadWalletProposals(true)');
  });

  it('starts a forced request in flight and ignores an older late response', async () => {
    let resolveOlder;
    let resolveNewer;
    const requests = [
      new Promise((resolveRequest) => { resolveOlder = resolveRequest; }),
      new Promise((resolveRequest) => { resolveNewer = resolveRequest; }),
    ];
    const painted = [];
    const errors = [];
    const harness = proposalLoaderHarness(
      () => requests.shift(),
      (proposals) => painted.push(proposals),
      (error) => errors.push(error),
    );

    harness.load(false);
    harness.load(true);
    expect(harness.state()).toMatchObject({ loading: true, epoch: 2 });

    const newer = [{ studentId: 'newer' }];
    resolveNewer(newer);
    await settle();
    expect(harness.state()).toMatchObject({ proposals: newer, loading: false });

    resolveOlder([{ studentId: 'older' }]);
    await settle();
    expect(harness.state()).toMatchObject({ proposals: newer, loading: false });
    expect(painted).toEqual([newer]);
    expect(errors).toEqual([]);
  });
});

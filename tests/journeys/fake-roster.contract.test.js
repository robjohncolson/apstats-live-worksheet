/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { createFakeRoster } from './fake-roster.js';

const URL = 'https://roster.test/ledger/record';
const TRAINER_URL = 'https://roster.test/trainer/state/ap-stats-flashcards';
const PRODUCTION_TRAINER_ALLOWLIST = [
  'ap-stats-formulas',
  'joyo-kanji',
  'jlpt-n5',
  'formula-lab',
];
const JOURNEY_TRAINER_ALLOWLIST = [...PRODUCTION_TRAINER_ALLOWLIST, 'ap-stats-flashcards'];
const VALID_BODY = {
  token: 'token:alpha_otter',
  source: 'worksheet',
  itemId: 'WS-U1-L1-DESK_DONE',
  response: { selfAttest: 'worksheet' },
  attempt: 1,
};

async function post(fake, body) {
  const response = await fake.fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function trainerRequest(fake, method, {
  body,
  headers,
  url = TRAINER_URL,
} = {}) {
  const response = await fake.fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function createTrainerFake() {
  return createFakeRoster({ trainerAllowlist: JOURNEY_TRAINER_ALLOWLIST });
}

describe('fake-roster POST /ledger/record production contract', () => {
  it('uses production invalid-token responses for missing and unknown tokens', async () => {
    const fake = createFakeRoster();

    await expect(post(fake, { ...VALID_BODY, token: undefined })).resolves.toEqual({
      status: 401,
      body: { ok: false, error: 'invalid token' },
    });
    await expect(post(fake, { ...VALID_BODY, token: 'token:not-a-user' })).resolves.toEqual({
      status: 401,
      body: { ok: false, error: 'invalid token' },
    });
  });

  it.each([
    ['source', { ...VALID_BODY, source: undefined }],
    ['itemId', { ...VALID_BODY, itemId: undefined }],
    ['response', { ...VALID_BODY, response: undefined }],
  ])('rejects a missing required %s with the production 400 error', async (_field, body) => {
    const fake = createFakeRoster();
    await expect(post(fake, body)).resolves.toEqual({
      status: 400,
      body: { ok: false, error: 'source, itemId, and response are required' },
    });
    expect(fake.state.ledgerRecords).toEqual([]);
  });

  it('records a valid payload only after validation succeeds', async () => {
    const fake = createFakeRoster();
    await expect(post(fake, VALID_BODY)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, ledgerId: 'ledger-1' },
    });
    expect(fake.state.ledgerRecords).toEqual([VALID_BODY]);
  });
});

describe('fake-roster /trainer/state production contract', () => {
  it('requires Bearer auth for GET and returns the stored state with its exact stamp', async () => {
    const fake = createTrainerFake();

    await expect(trainerRequest(fake, 'GET', {
      url: `${TRAINER_URL}?token=token%3Aalpha_otter`,
    })).resolves.toEqual({
      status: 401,
      body: { ok: false, error: 'forbidden' },
    });

    await expect(trainerRequest(fake, 'GET', {
      headers: { Authorization: 'Bearer token:alpha_otter' },
    })).resolves.toEqual({
      status: 200,
      body: { ok: true, found: false },
    });

    const saved = await trainerRequest(fake, 'PUT', {
      body: {
        token: 'token:alpha_otter',
        state: { v: 1, e: [['round-a', 0]] },
        baseUpdatedAt: null,
      },
    });
    expect(saved.status).toBe(200);

    await expect(trainerRequest(fake, 'GET', {
      headers: { Authorization: 'Bearer token:alpha_otter' },
    })).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
        found: true,
        state: { v: 1, e: [['round-a', 0]] },
        updatedAt: saved.body.updatedAt,
      },
    });
  });

  it.each([
    ['header-only', {
      headers: { Authorization: 'Bearer token:alpha_otter' },
      body: { state: { v: 1 }, baseUpdatedAt: null },
    }],
    ['query-only', {
      url: `${TRAINER_URL}?token=token%3Aalpha_otter`,
      body: { state: { v: 1 }, baseUpdatedAt: null },
    }],
  ])('rejects %s PUT auth because production accepts body.token only', async (_name, request) => {
    const fake = createTrainerFake();
    await expect(trainerRequest(fake, 'PUT', request)).resolves.toEqual({
      status: 401,
      body: { ok: false, error: 'invalid token' },
    });
    expect(fake.state.trainerStates.size).toBe(0);
  });

  it('rejects PATCH without a delta object using the production error', async () => {
    const fake = createTrainerFake();
    await expect(trainerRequest(fake, 'PATCH', {
      body: { token: 'token:alpha_otter' },
    })).resolves.toEqual({
      status: 400,
      body: { ok: false, error: 'delta object is required' },
    });
    expect(fake.state.trainerStates.size).toBe(0);
  });

  it('uses the production default write allowlist unless a journey opts in', async () => {
    const fake = createFakeRoster();

    await expect(trainerRequest(fake, 'PUT', {
      body: {
        token: 'token:alpha_otter',
        state: { v: 1 },
        baseUpdatedAt: null,
      },
    })).resolves.toEqual({
      status: 400,
      body: { ok: false, error: 'unknown deck' },
    });

    for (const deckId of PRODUCTION_TRAINER_ALLOWLIST) {
      const response = await trainerRequest(fake, 'PUT', {
        url: `https://roster.test/trainer/state/${deckId}`,
        body: {
          token: 'token:alpha_otter',
          state: { v: 1 },
          baseUpdatedAt: null,
        },
      });
      expect(response.status, `${deckId} should be in the production default allowlist`).toBe(200);
    }
  });

  it('enforces the write allowlist and optimistic-concurrency stamp', async () => {
    const fake = createTrainerFake();
    const first = await trainerRequest(fake, 'PUT', {
      body: {
        token: 'token:alpha_otter',
        state: { v: 1, e: [['round-a', 0]] },
        baseUpdatedAt: null,
      },
    });

    await expect(trainerRequest(fake, 'PUT', {
      body: {
        token: 'token:alpha_otter',
        state: { v: 1, e: [['round-b', 0]] },
        baseUpdatedAt: 'stale-stamp',
      },
    })).resolves.toEqual({
      status: 409,
      body: { ok: false, error: 'stale', updatedAt: first.body.updatedAt },
    });

    await expect(trainerRequest(fake, 'PUT', {
      url: 'https://roster.test/trainer/state/not-allowlisted',
      body: {
        token: 'token:alpha_otter',
        state: { v: 1 },
        baseUpdatedAt: null,
      },
    })).resolves.toEqual({
      status: 400,
      body: { ok: false, error: 'unknown deck' },
    });
  });
});

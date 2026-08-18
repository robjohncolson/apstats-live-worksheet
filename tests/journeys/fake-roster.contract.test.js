/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { createFakeRoster } from './fake-roster.js';

const URL = 'https://roster.test/ledger/record';
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

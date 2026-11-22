import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { assertOk, request, requestOk, USER_AGENT } from './http.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('should identify the application in the User-Agent', () => {
  expect(USER_AGENT).toMatch(
    /^volunteer-contributions-fetch \(https:\/\/github\.com\//
  );
});

test('should send the User-Agent and a timeout signal', async () => {
  await request('https://example.com');
  expect(fetch).toHaveBeenCalledWith('https://example.com', {
    headers: { 'User-Agent': USER_AGENT },
    signal: expect.any(AbortSignal),
  });
});

test('should return the response for a successful request', async () => {
  const response = await requestOk('https://example.com', 'Test');
  expect(response.status).toBe(200);
});

test('should throw with source name, url and status if not ok', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(requestOk('https://example.com', 'Test')).rejects.toThrow(
    'Test request to https://example.com failed with status 503'
  );
});

test('assertOk should not throw for an ok response', () => {
  expect(() => assertOk({ ok: true }, 'Test', 'https://x')).not.toThrow();
});

export const FETCH_TIMEOUT = 30000;

// Several APIs (e.g. OpenStreetMap, Wikimedia) require a User-Agent that
// identifies the application instead of the generic one sent by Node's fetch.
export const USER_AGENT = `volunteer-contributions-fetch (https://github.com/MichaelKohler/volunteer-contributions-fetch)`;

export function request(url) {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
}

export function assertOk(response, sourceName, url) {
  if (!response.ok) {
    throw new Error(
      `${sourceName} request to ${url} failed with status ${response.status}`
    );
  }
}

export async function requestOk(url, sourceName) {
  const response = await request(url);
  assertOk(response, sourceName, url);
  return response;
}

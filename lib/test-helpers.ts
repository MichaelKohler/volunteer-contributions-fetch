import { type Mock, vi } from 'vitest';

// Tests answer fetch with partial responses that only provide what the code
// under test reads, so the mock accepts any resolved value.
export type FetchMock = Mock<
  (input: string | URL, init?: RequestInit) => Promise<unknown>
>;

export function mockedFetch(): FetchMock {
  return vi.mocked(fetch) as unknown as FetchMock;
}

// Tests read the calls and provide implementations with partial values, so
// this deliberately opts out of type checking.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseMock = Mock<(...args: any[]) => any>;

// Gives access to a mock without the types of the mocked function, so tests
// can answer it with partial values.
export function loose(fn: unknown): LooseMock {
  return fn as LooseMock;
}

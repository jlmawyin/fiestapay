import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  REQUEST_TIMEOUT_MESSAGES,
  REQUEST_TIMEOUT_MS,
  request,
} from '../api/client';

function abortableHangingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const fail = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener('abort', fail, { once: true });
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bounded API request timeout', () => {
  it('turns a 30 second mutation timeout into a check-state-first message', async () => {
    vi.useFakeTimers();
    abortableHangingFetch();

    const pending = request('/api/events/demo/orders', { method: 'POST', body: JSON.stringify({ quoteId: 'q1' }) });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiError',
      status: 408,
      message: REQUEST_TIMEOUT_MESSAGES.mutation,
    });

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('uses a friendly read message for a timed out GET', async () => {
    vi.useFakeTimers();
    abortableHangingFetch();

    const pending = request('/api/health');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiError',
      status: 408,
      message: REQUEST_TIMEOUT_MESSAGES.read,
    });

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('preserves an external caller abort instead of reporting a timeout', async () => {
    abortableHangingFetch();
    const controller = new AbortController();
    const pending = request('/api/health', { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await assertion;

    const error = await pending.catch((caught) => caught);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

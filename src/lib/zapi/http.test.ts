import { describe, expect, it, vi } from 'vitest';
import { fetchJson } from './http';

describe('fetchJson', () => {
  it('retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const p = fetchJson<{ ok: boolean }>('https://example.com', { method: 'GET' }, { fetcher, maxRetries: 2 });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});


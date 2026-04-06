import { describe, expect, it, vi } from 'vitest';
import { ZapiClient } from './client';

describe('ZapiClient', () => {
  it('builds base URL and sets Client-Token', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new ZapiClient(
      { instanceId: 'INST', token: 'TOK', clientToken: 'CT' },
      { fetcher },
    );

    await client.get('/chats');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/instances/INST/token/TOK/chats');
    expect((init as any).headers['Client-Token']).toBe('CT');
  });
});


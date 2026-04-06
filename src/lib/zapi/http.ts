import { ZapiError } from './errors';

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ZapiHttpOptions {
  fetcher?: Fetcher;
  timeoutMs?: number;
  maxRetries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get('retry-after');
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(retryAfter);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  opts: ZapiHttpOptions = {},
): Promise<T> {
  const fetcher = opts.fetcher ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.maxRetries ?? 3;

  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher(url, { ...init, signal: controller.signal });
      const contentType = res.headers.get('content-type') ?? '';
      const isJson = contentType.includes('application/json');

      if (res.ok) {
        if (isJson) return (await res.json()) as T;
        const text = await res.text();
        return text as unknown as T;
      }

      const retryAfterMs = parseRetryAfterMs(res.headers);
      const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

      const shouldRetry = (res.status === 429 || res.status >= 500) && attempt <= maxRetries;
      if (shouldRetry) {
        const base = retryAfterMs ?? Math.min(10_000, 250 * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 150);
        await sleep(base + jitter);
        continue;
      }

      throw new ZapiError(`Z-API request failed (${res.status})`, {
        status: res.status,
        details: body,
      });
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      const shouldRetry = !isAbort && attempt <= maxRetries;
      if (shouldRetry) {
        const base = Math.min(10_000, 250 * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 150);
        await sleep(base + jitter);
        continue;
      }
      if (isAbort) throw new ZapiError('Z-API request timed out', { code: 'timeout' });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}


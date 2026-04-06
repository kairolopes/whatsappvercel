import { fetchJson, type ZapiHttpOptions } from './http';
import type { ZapiClientConfig } from './types';

export class ZapiClient {
  private base: string;
  private clientToken: string;
  private http: ZapiHttpOptions;

  constructor(config: ZapiClientConfig, http: ZapiHttpOptions = {}) {
    const origin = config.baseUrl ?? 'https://api.z-api.io';
    this.base = `${origin}/instances/${config.instanceId}/token/${config.token}`;
    this.clientToken = config.clientToken;
    this.http = http;
  }

  async get<T>(path: string): Promise<T> {
    return fetchJson<T>(`${this.base}${path}`, {
      method: 'GET',
      headers: {
        'Client-Token': this.clientToken,
      },
    }, this.http);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return fetchJson<T>(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        'Client-Token': this.clientToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, this.http);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return fetchJson<T>(`${this.base}${path}`, {
      method: 'PUT',
      headers: {
        'Client-Token': this.clientToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, this.http);
  }
}


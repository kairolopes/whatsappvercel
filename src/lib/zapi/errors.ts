export class ZapiError extends Error {
  name = 'ZapiError' as const;
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, init?: { status?: number; code?: string; details?: unknown }) {
    super(message);
    this.status = init?.status;
    this.code = init?.code;
    this.details = init?.details;
  }
}


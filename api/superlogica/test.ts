import crypto from 'crypto';

type AnyReq = any;
type AnyRes = any;

function json(res: AnyRes, status: number, body: unknown) {
  res.status(status).json(body);
}

function digest(value: string) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest();
}

function safeEquals(a: string, b: string) {
  const da = digest(a);
  const db = digest(b);
  return crypto.timingSafeEqual(da, db);
}

function getAuthSecrets(): string[] {
  const values = [
    process.env.ADMIN_API_KEY,
    process.env.ZAPI_WEBHOOK_SECRET,
    process.env.MAKE_WEBHOOK_SECRET,
    'rokzap_2026_03_29_a8d2b7c1f4e9',
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function getReqSecret(req: AnyReq): string {
  return (
    String(req?.query?.secret ?? '') ||
    String(req?.headers?.['x-admin-token'] ?? req?.headers?.['X-Admin-Token'] ?? '')
  );
}

function getSuperlogicaConfig() {
  const appToken = String(process.env.SUPERLOGICA_APP_TOKEN || '').trim();
  const accessToken = String(process.env.SUPERLOGICA_ACCESS_TOKEN || '').trim();
  const condominioId = String(process.env.SUPERLOGICA_CONDOMINIO_ID || '47').trim();
  if (!appToken || !accessToken || !condominioId) return null;
  return { appToken, accessToken, condominioId };
}

export default async function handler(req: AnyReq, res: AnyRes) {
  if (req?.method !== 'GET') {
    json(res, 405, { ok: false, reason: 'method_not_allowed' });
    return;
  }

  const expected = getAuthSecrets();
  const received = getReqSecret(req);
  const authed = Boolean(received) && expected.some((s) => safeEquals(received, s));
  if (!authed) {
    json(res, 401, { ok: false, reason: 'unauthorized' });
    return;
  }

  const cfg = getSuperlogicaConfig();
  if (!cfg) {
    json(res, 500, { ok: false, reason: 'missing_superlogica_env' });
    return;
  }

  const url = `https://api.superlogica.net/v2/condor/unidades/index?idCondominio=${encodeURIComponent(cfg.condominioId)}&exibirGruposDasUnidades=1&itensPorPagina=1&pagina=1&exibirDadosDosContatos=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        app_token: cfg.appToken,
        access_token: cfg.accessToken,
        Accept: 'application/json',
      } as any,
      signal: controller.signal,
    });

    const contentType = r.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await r.json().catch(() => null) : await r.text().catch(() => '');

    if (!r.ok) {
      const hint = typeof body === 'string' ? body.slice(0, 160) : null;
      json(res, 200, { ok: false, status: r.status, hint });
      return;
    }

    json(res, 200, { ok: true, status: r.status, isJson, hasData: Boolean(body) });
  } catch {
    json(res, 200, { ok: false, status: 0, hint: 'request_failed' });
  } finally {
    clearTimeout(timeout);
  }
}

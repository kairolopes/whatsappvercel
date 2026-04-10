import { createClient } from '@supabase/supabase-js';

type AnyReq = any;
type AnyRes = any;

function json(res: AnyRes, status: number, body: unknown) {
  res.status(status).json(body);
}

async function readJsonBody(req: AnyReq): Promise<any> {
  if (typeof req?.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req?.body ?? null;
}

let supabaseAdmin: any | null = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const serviceKey =
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    String(process.env.SUPABASE_SERVICE_KEY || '').trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!url || !serviceKey) throw new Error('missing_supabase_service_key');
  supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabaseAdmin;
}

function getBearerToken(req: AnyReq) {
  const raw = String(req.headers?.authorization || '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
}

function getCondominioId(req: AnyReq) {
  const v = req.headers?.['x-condominio-id'] ?? req.headers?.['X-Condominio-Id'] ?? req.headers?.['x-condominio'] ?? '';
  return String(v || '').trim();
}

async function requireTenantAdmin(req: AnyReq, res: AnyRes) {
  const token = getBearerToken(req);
  if (!token) {
    json(res, 401, { ok: false, reason: 'unauthorized' });
    return null;
  }

  const condominioId = getCondominioId(req);
  if (!condominioId) {
    json(res, 400, { ok: false, reason: 'missing_condominio' });
    return null;
  }

  const sb = getSupabaseAdmin();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  const userId = String(userData?.user?.id || '').trim();
  if (userErr || !userId) {
    json(res, 401, { ok: false, reason: 'unauthorized' });
    return null;
  }

  const { data: membership, error: mErr } = await sb
    .from('membros_condominio')
    .select('role,ativo')
    .eq('user_id', userId)
    .eq('condominio_id', condominioId)
    .eq('ativo', true)
    .maybeSingle();
  if (mErr || !membership) {
    json(res, 403, { ok: false, reason: 'forbidden' });
    return null;
  }

  const role = String((membership as any)?.role || '').trim();
  if (!(role === 'admin' || role === 'master')) {
    json(res, 403, { ok: false, reason: 'forbidden' });
    return null;
  }

  return { sb, userId, condominioId, role } as const;
}

const memoryCounters = new Map<string, { resetAt: number; count: number }>();

function rateLimit(req: AnyReq, res: AnyRes, opts?: { limit?: number; windowMs?: number }): boolean {
  const limit = opts?.limit ?? 60;
  const windowMs = opts?.windowMs ?? 60_000;
  const ip = String((req.headers?.['x-forwarded-for'] ?? '').split(',')[0] || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const current = memoryCounters.get(ip);
  if (!current || current.resetAt <= now) {
    memoryCounters.set(ip, { resetAt: now + windowMs, count: 1 });
    return true;
  }
  if (current.count >= limit) {
    const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
    res.setHeader('retry-after', String(retryAfterSec));
    json(res, 429, { ok: false, reason: 'rate_limited' });
    return false;
  }
  current.count += 1;
  return true;
}

type ZapiCfg = { instanceId: string; token: string; clientToken: string };

function normalizeZapiCfg(row: any): ZapiCfg | null {
  const instanceId = String(row?.instance_id ?? '').trim();
  const token = String(row?.token ?? '').trim();
  const clientToken = String(row?.client_token ?? '').trim();
  if (!instanceId || !token || !clientToken) return null;
  return { instanceId, token, clientToken };
}

async function getZapiConfigForTenant(sb: any, condominioId: string): Promise<ZapiCfg> {
  const { data, error } = await sb
    .from('zapi_config')
    .select('instance_id,token,client_token')
    .eq('condominio_id', condominioId)
    .maybeSingle();
  if (error) throw error;
  const cfg = normalizeZapiCfg(data);
  if (!cfg) {
    const err: any = new Error('missing_zapi_tenant_config');
    err.status = 400;
    throw err;
  }
  return cfg;
}

async function zapiFetchWithCfg(cfg: ZapiCfg, method: string, path: string, body?: any) {
  const baseUrl = `https://api.z-api.io/instances/${cfg.instanceId}/token/${cfg.token}`;
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Client-Token': cfg.clientToken,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const err: any = new Error('zapi_error');
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function normalizeRoute(value: unknown): string {
  const r = typeof value === 'string' ? value : Array.isArray(value) ? value.join('/') : '';
  return r.replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeContactPhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export default async function handler(req: AnyReq, res: AnyRes) {
  if (!rateLimit(req, res)) return;

  const route = normalizeRoute(req.query?.route);

  if (route === 'version' && req.method === 'GET') {
    const gitSha =
      String(process.env.VERCEL_GIT_COMMIT_SHA || '') ||
      String(process.env.GIT_COMMIT_SHA || '') ||
      String(process.env.COMMIT_SHA || '') ||
      '';

    const deploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || '').trim();
    const vercelEnv = String(process.env.VERCEL_ENV || '').trim();
    const region = String(process.env.VERCEL_REGION || '').trim();
    const vercelUrl = String(process.env.VERCEL_URL || '').trim();

    const hasOpenAiKey = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
    const hasGeminiKey = Boolean(String(process.env.GOOGLE_API_KEY || '').trim());
    const hasSupabaseUrl = Boolean(String(process.env.SUPABASE_URL || '').trim());
    const hasSupabaseServiceRoleKey = Boolean(
      String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
        String(process.env.SUPABASE_SERVICE_KEY || '').trim() ||
        String(process.env.SUPABASE_SERVICE_ROLE || '').trim(),
    );

    json(res, 200, {
      ok: true,
      sha: gitSha || null,
      deploymentId: deploymentId || null,
      env: vercelEnv || null,
      region: region || null,
      url: vercelUrl ? `https://${vercelUrl}` : null,
      hasOpenAiKey,
      hasGeminiKey,
      hasSupabaseUrl,
      hasSupabaseServiceRoleKey,
      serverTime: new Date().toISOString(),
    });
    return;
  }

  const ctx = await requireTenantAdmin(req, res);
  if (!ctx) return;
  const cfg = await getZapiConfigForTenant(ctx.sb, ctx.condominioId);
  const zapiFetch = (method: string, path: string, body?: any) => zapiFetchWithCfg(cfg, method, path, body);

  try {
    if (route === '' && req.method === 'GET') {
      json(res, 200, {
        ok: true,
        routes: [
          'version',
          'contacts',
          'chats',
          'chat-messages',
          'send-text',
          'send-image',
          'send-sticker',
          'send-gif',
          'send-video',
          'send-ptv',
          'send-audio',
          'send-message-audio',
          'send-document',
          'send-link',
          'send-location',
          'send-contact',
          'send-message-contact',
          'send-contacts',
          'send-option-list',
          'send-button-pix',
          'set-read-receipts',
          'send-remove-reaction',
          'forward-message',
          'webhooks',
          'update-auto-read-status',
          'profile-picture',
          'profile-name',
          'profile-description',
          'request',
        ],
      });
      return;
    }

    if (route === 'chats' && req.method === 'GET') {
      const data = await zapiFetch('GET', '/chats');
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'contacts' && req.method === 'GET') {
      const data = await zapiFetch('GET', '/contacts');
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'chat-messages' && req.method === 'GET') {
      const phone = String(req.query?.phone ?? '');
      if (!phone) {
        json(res, 400, { ok: false, reason: 'missing_phone' });
        return;
      }
      const data = await zapiFetch('GET', `/chat-messages/${encodeURIComponent(phone)}`);
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-text' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const message = String(body?.message ?? '');
      if (!phone || !message) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-text', { phone, message, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-image' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const image = String(body?.image ?? '');
      if (!phone || !image) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-image', { phone, image, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-sticker' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const sticker = String(body?.sticker ?? '');
      if (!phone || !sticker) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-sticker', { phone, sticker, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-gif' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const gif = String(body?.gif ?? '');
      if (!phone || !gif) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-gif', { phone, gif, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-video' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const video = String(body?.video ?? '');
      if (!phone || !video) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-video', { phone, video, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-ptv' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const ptv = String(body?.ptv ?? '');
      if (!phone || !ptv) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-ptv', { phone, ptv, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if ((route === 'send-audio' || route === 'send-message-audio') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const audio = String(body?.audio ?? '');
      if (!phone || !audio) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-audio', { phone, audio, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-document' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const document = String(body?.document ?? '');
      const extension = String(body?.extension ?? '');
      if (!phone || !document || !extension) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', `/send-document/${encodeURIComponent(extension)}`, { phone, document, ...(body?.opts ?? {}) });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-link' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const message = String(body?.message ?? '');
      const image = String(body?.image ?? '');
      const linkUrl = String(body?.linkUrl ?? '');
      const title = String(body?.title ?? '');
      const linkDescription = String(body?.linkDescription ?? '');

      if (!phone || !message || !image || !linkUrl || !title || !linkDescription) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }

      const data = await zapiFetch('POST', '/send-link', {
        phone,
        message,
        image,
        linkUrl,
        title,
        linkDescription,
        ...(typeof body?.messageId === 'string' ? { messageId: body.messageId } : {}),
        ...(typeof body?.delayMessage === 'number' ? { delayMessage: body.delayMessage } : {}),
        ...(typeof body?.delayTyping === 'number' ? { delayTyping: body.delayTyping } : {}),
        ...(typeof body?.linkType === 'string' ? { linkType: body.linkType } : {}),
      });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-location' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const title = String(body?.title ?? '');
      const address = String(body?.address ?? '');
      const latitude = String(body?.latitude ?? '');
      const longitude = String(body?.longitude ?? '');
      if (!phone || !title || !address || !latitude || !longitude) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-location', {
        phone,
        title,
        address,
        latitude,
        longitude,
        ...(typeof body?.messageId === 'string' ? { messageId: body.messageId } : {}),
        ...(typeof body?.delayMessage === 'number' ? { delayMessage: body.delayMessage } : {}),
      });
      json(res, 200, { ok: true, data });
      return;
    }

    if ((route === 'send-contact' || route === 'send-message-contact') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const contactName = String(body?.contactName ?? '');
      const contactPhone = normalizeContactPhone(body?.contactPhone);
      if (!phone || !contactName || !contactPhone) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-contact', {
        phone,
        contactName,
        contactPhone,
        ...(typeof body?.contactBusinessDescription === 'string'
          ? { contactBusinessDescription: body.contactBusinessDescription }
          : {}),
        ...(typeof body?.messageId === 'string' ? { messageId: body.messageId } : {}),
        ...(typeof body?.delayMessage === 'number' ? { delayMessage: body.delayMessage } : {}),
      });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-contacts' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const contacts = Array.isArray(body?.contacts) ? body.contacts : null;
      if (!phone || !contacts || contacts.length === 0) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }

      const normalizedContacts = contacts
        .map((c: any) => {
          const name = String(c?.name ?? '').trim();
          const phones = Array.isArray(c?.phones) ? c.phones.map((p: any) => normalizeContactPhone(p)).filter(Boolean) : [];
          if (!name || phones.length === 0) return null;
          const businessDescription = typeof c?.businessDescription === 'string' ? c.businessDescription : undefined;
          return {
            name,
            phones,
            ...(businessDescription ? { businessDescription } : {}),
          };
        })
        .filter(Boolean);

      if (normalizedContacts.length === 0) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }

      const data = await zapiFetch('POST', '/send-contacts', {
        phone,
        contacts: normalizedContacts,
        ...(typeof body?.messageId === 'string' ? { messageId: body.messageId } : {}),
        ...(typeof body?.delayMessage === 'number' ? { delayMessage: body.delayMessage } : {}),
      });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-option-list' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const message = String(body?.message ?? '');
      const optionList = body?.optionList;
      if (!phone || !message || !optionList) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-option-list', {
        phone,
        message,
        optionList,
        ...(typeof body?.delayMessage === 'number' ? { delayMessage: body.delayMessage } : {}),
      });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-button-pix' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const pixKey = String(body?.pixKey ?? '');
      const type = String(body?.type ?? '');
      if (!phone || !pixKey || !type) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-button-pix', {
        phone,
        pixKey,
        type,
        ...(typeof body?.merchantName === 'string' ? { merchantName: body.merchantName } : {}),
      });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'set-read-receipts' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const raw = body?.value;
      const value =
        raw === true || String(raw).toLowerCase() === 'enable'
          ? 'enable'
          : raw === false || String(raw).toLowerCase() === 'disable'
            ? 'disable'
            : '';

      if (!value) {
        json(res, 400, { ok: false, reason: 'invalid_value' });
        return;
      }

      const data = await zapiFetch('POST', `/privacy/read-receipts?value=${encodeURIComponent(value)}`);
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'send-remove-reaction' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const messageId = String(body?.messageId ?? body?.id ?? '');
      if (!phone || !messageId) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/send-remove-reaction', { phone, messageId });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'forward-message' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const phone = String(body?.phone ?? '');
      const messageId = String(body?.messageId ?? body?.id ?? '');
      if (!phone || !messageId) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const data = await zapiFetch('POST', '/forward-message', { phone, messageId });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'webhooks' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = String(body?.action ?? '');
      const value = String(body?.value ?? '');
      if (!action || !value) {
        json(res, 400, { ok: false, reason: 'missing_fields' });
        return;
      }
      const path =
        action === 'received'
          ? '/update-webhook-received'
          : action === 'received_delivery'
            ? '/update-webhook-received-delivery'
            : action === 'message_status'
              ? '/update-webhook-message-status'
              : null;
      if (!path) {
        json(res, 400, { ok: false, reason: 'invalid_action' });
        return;
      }
      const data = await zapiFetch('PUT', path, { value });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'update-auto-read-status' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      const value = body?.value;
      if (typeof value !== 'boolean') {
        json(res, 400, { ok: false, reason: 'invalid_value' });
        return;
      }
      const data = await zapiFetch('PUT', '/update-auto-read-status', { value });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'profile-picture' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      const value = String(body?.value ?? '');
      if (!value) {
        json(res, 400, { ok: false, reason: 'invalid_value' });
        return;
      }
      const data = await zapiFetch('PUT', '/profile-picture', { value });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'profile-name' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      const value = String(body?.value ?? '');
      if (!value) {
        json(res, 400, { ok: false, reason: 'invalid_value' });
        return;
      }
      const data = await zapiFetch('PUT', '/profile-name', { value });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'profile-description' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      const value = String(body?.value ?? '');
      if (!value) {
        json(res, 400, { ok: false, reason: 'invalid_value' });
        return;
      }
      const data = await zapiFetch('PUT', '/profile-description', { value });
      json(res, 200, { ok: true, data });
      return;
    }

    if (route === 'request' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const method = String(body?.method ?? 'GET').toUpperCase();
      const path = String(body?.path ?? '');
      if (!path.startsWith('/')) {
        json(res, 400, { ok: false, reason: 'invalid_path' });
        return;
      }
      if (!['GET', 'POST', 'PUT'].includes(method)) {
        json(res, 400, { ok: false, reason: 'unsupported_method' });
        return;
      }
      const data = await zapiFetch(method, path, method === 'GET' ? undefined : body?.data);
      json(res, 200, { ok: true, data });
      return;
    }

    json(res, 404, { ok: false, reason: 'not_found' });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500;
    json(res, status, { ok: false, reason: e?.message || 'proxy_error', status, details: e?.details ?? null });
  }
}

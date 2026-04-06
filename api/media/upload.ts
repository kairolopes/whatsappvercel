import { createClient } from '@supabase/supabase-js';

function json(res: any, status: number, body: any) {
  res.status(status);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stripDataUrl(base64OrDataUrl: string) {
  const s = String(base64OrDataUrl || '');
  const idx = s.indexOf('base64,');
  if (idx >= 0) return s.slice(idx + 'base64,'.length);
  return s;
}

function safeFileName(name: string) {
  const base = String(name || 'file').trim() || 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return cleaned || 'file';
}

function requireAdminIfConfigured(req: any, res: any): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return true;

  const builtInSharedSecret = 'rokzap_2026_03_29_a8d2b7c1f4e9';
  const fallbackSharedSecret = process.env.ZAPI_SHARED_SECRET || builtInSharedSecret;

  const cookieHeader = String(req.headers?.cookie ?? '');
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((v: string) => v.trim())
      .filter(Boolean)
      .map((pair: string) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return [pair, ''] as const;
        return [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))] as const;
      }),
  );

  const receivedHeader = req.headers?.['x-admin-token'] ?? req.headers?.['X-Admin-Token'];
  const receivedCookie = cookies.zapi_admin;

  const okAdmin = receivedHeader === expected || receivedCookie === expected;
  const okShared =
    Boolean(fallbackSharedSecret) &&
    (receivedHeader === fallbackSharedSecret || receivedCookie === fallbackSharedSecret);

  if (!okAdmin && !okShared) {
    json(res, 401, { ok: false, reason: 'unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req: any, res: any) {
  if (req?.method !== 'POST') {
    json(res, 405, { ok: false, reason: 'method_not_allowed' });
    return;
  }

  if (!requireAdminIfConfigured(req, res)) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    json(res, 500, {
      ok: false,
      reason: 'missing_server_env',
      missing: {
        SUPABASE_URL: !supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: !supabaseServiceRoleKey,
      },
    });
    return;
  }

  const body = await readJsonBody(req);
  const base64 = stripDataUrl(String(body?.base64 ?? ''));
  const fileName = safeFileName(String(body?.fileName ?? 'file'));
  const mimeType = String(body?.mimeType ?? 'application/octet-stream');
  const folder = String(body?.folder ?? 'uploads').replace(/[^a-zA-Z0-9/_-]+/g, '').slice(0, 80) || 'uploads';
  const bucket = String(body?.bucket ?? 'chat-media');

  if (!base64 || base64.length < 8) {
    json(res, 400, { ok: false, reason: 'missing_base64' });
    return;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    json(res, 400, { ok: false, reason: 'invalid_base64' });
    return;
  }

  if (buf.byteLength > 12 * 1024 * 1024) {
    json(res, 413, { ok: false, reason: 'file_too_large' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = Array.isArray(buckets) && buckets.some((b: any) => b?.name === bucket);
    if (!exists) {
      await supabase.storage.createBucket(bucket, { public: true });
    }
  } catch {
  }

  const path = `${folder}/${Date.now()}_${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, buf, { contentType: mimeType, upsert: true });

  if (uploadError) {
    json(res, 500, { ok: false, reason: 'upload_failed' });
    return;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  json(res, 200, {
    ok: true,
    data: {
      bucket,
      path,
      url: data?.publicUrl ?? '',
      mimeType,
      size: buf.byteLength,
      fileName,
    },
  });
}

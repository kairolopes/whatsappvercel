import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

function normalizeDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getExpectedSecret(): string {
  const builtInShared = 'rokzap_2026_03_29_a8d2b7c1f4e9';
  return (
    process.env.MAKE_WEBHOOK_SECRET ||
    process.env.ZAPI_WEBHOOK_SECRET ||
    process.env.ZAPI_SHARED_SECRET ||
    builtInShared
  );
}

function getSignatureName(body: any): string {
  const fromBody = typeof body?.signature === 'string' ? body.signature : typeof body?.signatureName === 'string' ? body.signatureName : '';
  const fromEnv = process.env.MAKE_SIGNATURE_NAME || '';
  const name = String(fromBody || fromEnv || 'Síndico X').trim();
  return name || 'Síndico X';
}

function signedText(signatureName: string, message: string): string {
  const base = String(message ?? '').trim();
  const prefix = `*${signatureName}*`;
  return base ? `${prefix}\n${base}` : prefix;
}

function getZapiConfig() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) return null;
  return { instanceId, token, clientToken };
}

async function zapiFetch(method: string, path: string, body?: any) {
  const cfg = getZapiConfig();
  if (!cfg) {
    const err: any = new Error('missing_zapi_env');
    err.status = 500;
    throw err;
  }

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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function formatTimeHM(d: Date) {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

async function ensureConversationId(sb: any, phoneDigits: string, contactName?: string) {
  const { data, error } = await sb
    .from('conversations')
    .upsert(
      {
        phone: phoneDigits,
        contact_name: String(contactName || phoneDigits),
        avatar_url: null,
        last_message: '',
        last_message_time: formatTimeHM(new Date()),
        unread_count: 0,
        is_active: true,
      },
      { onConflict: 'phone' },
    )
    .select('id')
    .single();

  if (error) throw error;
  return String(data?.id || '');
}

function guessExtension(fileName: string, mimeType: string) {
  const lower = String(fileName || '').toLowerCase();
  const fromName = lower.includes('.') ? lower.split('.').pop() || '' : '';
  if (fromName) return fromName;
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('msword')) return 'doc';
  if (m.includes('wordprocessingml')) return 'docx';
  if (m.includes('spreadsheetml')) return 'xlsx';
  if (m.includes('ms-excel')) return 'xls';
  if (m.includes('powerpoint')) return 'ppt';
  if (m.includes('presentationml')) return 'pptx';
  if (m.includes('zip')) return 'zip';
  if (m.includes('json')) return 'json';
  return 'bin';
}

export default async function handler(req: AnyReq, res: AnyRes) {
  if (req?.method !== 'POST') {
    json(res, 405, { ok: false, reason: 'method_not_allowed' });
    return;
  }

  const expected = getExpectedSecret();
  const received =
    String(req.query?.secret ?? '') ||
    String(req.headers?.['x-make-secret'] ?? req.headers?.['X-Make-Secret'] ?? '') ||
    String(req.headers?.['x-webhook-secret'] ?? req.headers?.['X-Webhook-Secret'] ?? '');

  if (!received || !timingSafeEqual(received, expected)) {
    json(res, 401, { ok: false, reason: 'unauthorized' });
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    json(res, 400, { ok: false, reason: 'invalid_json' });
    return;
  }

  const items = Array.isArray(body?.messages) ? body.messages : Array.isArray(body) ? body : [body];
  if (!items || items.length === 0) {
    json(res, 400, { ok: false, reason: 'empty_payload' });
    return;
  }

  const sbCfg = getSupabaseConfig();
  const sb = sbCfg ? createClient(sbCfg.url, sbCfg.key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

  const results: any[] = [];

  for (const raw of items) {
    const phoneDigits = normalizeDigits(raw?.phone);
    if (!phoneDigits) {
      results.push({ ok: false, reason: 'missing_phone' });
      continue;
    }

    const signatureName = getSignatureName(raw);
    const type = String(raw?.type ?? raw?.kind ?? 'text').trim().toLowerCase();
    const text = String(raw?.text ?? raw?.message ?? '').trim();
    const caption = String(raw?.caption ?? '').trim();
    const url = String(raw?.url ?? raw?.fileUrl ?? raw?.file_url ?? '').trim();
    const base64 = String(raw?.base64 ?? '').trim();
    const mimeType = String(raw?.mimeType ?? raw?.mime_type ?? '').trim();
    const fileName = String(raw?.fileName ?? raw?.file_name ?? '').trim();

    const now = new Date();
    const timeString = formatTimeHM(now);
    let convId = '';
    try {
      if (sb) {
        convId = await ensureConversationId(sb, phoneDigits, raw?.contactName || raw?.contact_name);
      }
    } catch {
    }

    const persistMessage = async (row: any) => {
      if (!sb || !convId) return;
      try {
        await sb.from('messages').insert([{ ...row, conversation_id: convId }]);
      } catch {
      }
    };

    const updateConversationLast = async (lastMessage: string) => {
      if (!sb || !convId) return;
      try {
        await sb
          .from('conversations')
          .update({ last_message: lastMessage, last_message_time: timeString })
          .eq('id', convId);
      } catch {
      }
    };

    try {
      if (type === 'text' || type === 'message') {
        const finalText = signedText(signatureName, text);
        const resp = await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '');

        await persistMessage({
          text: finalText,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'text',
          meta: {},
        });

        await updateConversationLast(finalText);
        results.push({ ok: true, type: 'text', externalId: externalId || null });
        continue;
      }

      if (type === 'document' || type === 'pdf') {
        const docRef = url || base64;
        if (!docRef) {
          results.push({ ok: false, reason: 'missing_document' });
          continue;
        }

        const ext = guessExtension(fileName, mimeType);
        const signedCaption = signedText(signatureName, caption || text);
        const resp = await zapiFetch('POST', `/send-document/${encodeURIComponent(ext)}`, {
          phone: phoneDigits,
          document: docRef,
          fileName: fileName || `document.${ext}`,
          caption: signedCaption,
        });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '');

        await persistMessage({
          text: signedCaption,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'document',
          meta: {
            url: url || undefined,
            fileName: fileName || `document.${ext}`,
            mimeType: mimeType || undefined,
          },
        });

        await updateConversationLast('📄 Documento');
        results.push({ ok: true, type: 'document', externalId: externalId || null });
        continue;
      }

      if (type === 'image') {
        const image = url || base64;
        if (!image) {
          results.push({ ok: false, reason: 'missing_image' });
          continue;
        }
        const signedCaption = signedText(signatureName, caption || text);
        const resp = await zapiFetch('POST', '/send-image', {
          phone: phoneDigits,
          image,
          caption: signedCaption,
        });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '');

        await persistMessage({
          text: signedCaption,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'image',
          meta: {
            url: url || undefined,
            caption: signedCaption,
            mimeType: mimeType || undefined,
            fileName: fileName || undefined,
          },
        });
        await updateConversationLast('📷 Foto');
        results.push({ ok: true, type: 'image', externalId: externalId || null });
        continue;
      }

      if (type === 'audio') {
        const audio = url || base64;
        if (!audio) {
          results.push({ ok: false, reason: 'missing_audio' });
          continue;
        }
        const resp = await zapiFetch('POST', '/send-audio', {
          phone: phoneDigits,
          audio,
          waveform: true,
        });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '');

        await persistMessage({
          text: signedText(signatureName, text || '🎵 Áudio'),
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'audio',
          meta: {
            url: url || undefined,
            mimeType: mimeType || undefined,
            fileName: fileName || undefined,
          },
        });
        await updateConversationLast('🎵 Áudio');
        results.push({ ok: true, type: 'audio', externalId: externalId || null });
        continue;
      }

      if (type === 'video') {
        const video = url || base64;
        if (!video) {
          results.push({ ok: false, reason: 'missing_video' });
          continue;
        }
        const signedCaption = signedText(signatureName, caption || text);
        const resp = await zapiFetch('POST', '/send-video', {
          phone: phoneDigits,
          video,
          caption: signedCaption,
        });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '');

        await persistMessage({
          text: signedCaption,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'video',
          meta: {
            url: url || undefined,
            caption: signedCaption,
            mimeType: mimeType || undefined,
            fileName: fileName || undefined,
          },
        });
        await updateConversationLast('🎥 Vídeo');
        results.push({ ok: true, type: 'video', externalId: externalId || null });
        continue;
      }

      results.push({ ok: false, reason: 'unsupported_type', type });
    } catch (e: any) {
      results.push({ ok: false, reason: 'send_failed', status: e?.status ?? 500, details: e?.details ?? null });
    }
  }

  json(res, 200, { ok: true, results });
}


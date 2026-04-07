import { createClient } from '@supabase/supabase-js';

type AnyRecord = Record<string, unknown>;

function getQueryParam(req: any, key: string): string | null {
  const q = req?.query ?? {};
  const value = q[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function safeJsonParse(input: unknown): AnyRecord | unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function normalizeEventType(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function addMessageIdCandidates(target: Set<string>, input: unknown) {
  const raw = String(input ?? '').trim();
  if (!raw) return;
  target.add(raw);
  if (raw.includes('@')) {
    const withoutAt = raw.split('@')[0].trim();
    if (withoutAt) target.add(withoutAt);
  }
}

function isPlaceholderMessageText(input: unknown): boolean {
  const raw = typeof input === 'string' ? input : '';
  if (!raw) return false;

  const lower = raw.trim().toLowerCase();
  const simplified = lower
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!simplified) return false;
  if (simplified.includes('unsupported')) return true;

  const hasMensagem = /\bmensagem\b/.test(simplified) || lower.includes('mensagem');
  const hasSuport = simplified.includes('suport') || lower.includes('suport');
  if (!hasMensagem || !hasSuport) return false;

  const mentionsMedia =
    simplified.includes('midia') ||
    simplified.includes('media') ||
    /m.*dia/.test(lower) ||
    lower.includes('m├');

  const mentionsNao = simplified.includes('nao') || /n.*o/.test(lower) || lower.includes('nã') || lower.includes('n├');

  return mentionsMedia || mentionsNao;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  }
  return null;
}

function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withoutAt = raw.includes('@') ? raw.split('@')[0] : raw;
  const digits = withoutAt.replace(/\D/g, '');
  return digits || withoutAt;
}

function formatTimeHM(d: Date) {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function signedText(signatureName: string, message: string): string {
  const base = String(message ?? '').trim();
  const prefix = `*${signatureName}*`;
  return base ? `${prefix}\n${base}` : prefix;
}

function isMenuChoice(text: string) {
  const t = String(text || '').trim();
  return t === '1' || t === '2' || t === '3' || t === '4';
}

function buildWelcomeMenu(params: { name: string; apartment: string; block: string }) {
  const name = String(params.name || '').trim() || 'morador';
  const apartment = String(params.apartment || '').trim();
  const block = String(params.block || '').trim();
  return (
    `Olá, ${name}, sua conta está vinculada ao apartamento ${apartment}, Bloco ${block}, do CONDOMINIO CAMPOS ALTOS!\n\n` +
    `Como posso te ajudar hoje?\n\n` +
    `1 - Boletos a pagar;\n\n` +
    `2 - Reserva de Ambientes;\n\n` +
    `3 - Dúvidas sobre a Convenção e Regimento Interno;\n\n` +
    `4 - Falar com a Administração;`
  );
}

function getAiSignatureName(): string {
  const s = String(process.env.MAKE_SIGNATURE_NAME || 'Síndico X').trim();
  return s || 'Síndico X';
}

function shouldAutoReply(): boolean {
  return String(process.env.AI_AUTOREPLY || '').trim().toLowerCase() === 'true';
}

function getAiModel(): string {
  const m = String(process.env.AI_MODEL || '').trim();
  return m || 'gpt-4o-mini';
}

function getOpenAiKey(): string {
  return String(process.env.OPENAI_API_KEY || '').trim();
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
  if (!cfg) throw new Error('missing_zapi_env');
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

function extractJsonObject(text: string) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function getSuperlogicaConfig() {
  const appToken = String(process.env.SUPERLOGICA_APP_TOKEN || '').trim();
  const accessToken = String(process.env.SUPERLOGICA_ACCESS_TOKEN || '').trim();
  const condominioId = String(process.env.SUPERLOGICA_CONDOMINIO_ID || '47').trim();
  const pages = Number(process.env.SUPERLOGICA_PAGES || '5');
  if (!appToken || !accessToken || !condominioId) return null;
  return { appToken, accessToken, condominioId, pages: Number.isFinite(pages) && pages > 0 ? pages : 5 };
}

async function fetchSuperlogicaPage(page: number) {
  const cfg = getSuperlogicaConfig();
  if (!cfg) throw new Error('missing_superlogica_env');

  const url = `https://api.superlogica.net/v2/condor/unidades/index?idCondominio=${encodeURIComponent(cfg.condominioId)}&exibirGruposDasUnidades=1&itensPorPagina=50&pagina=${encodeURIComponent(String(page))}&exibirDadosDosContatos=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        app_token: cfg.appToken,
        access_token: cfg.accessToken,
      } as any,
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      const err: any = new Error('superlogica_error');
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function collectDigitsFromUnknown(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    const digits = normalizeDigits(value);
    if (digits.length >= 8 && digits.length <= 16) out.add(digits);
    return;
  }
  if (typeof value === 'number') {
    const digits = normalizeDigits(String(value));
    if (digits.length >= 8 && digits.length <= 16) out.add(digits);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) collectDigitsFromUnknown(v, out);
    return;
  }
  const rec = value as Record<string, unknown>;
  for (const v of Object.values(rec)) collectDigitsFromUnknown(v, out);
}

function findValueByKeys(root: any, keys: string[]): string {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  const stack: any[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (want.has(k.toLowerCase())) {
        const s = String(v ?? '').trim();
        if (s) return s;
      }
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return '';
}

function findMatchInSuperlogicaPayload(payload: any, last5: string) {
  const stack: any[] = [payload];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }

    const phones = new Set<string>();
    collectDigitsFromUnknown(cur, phones);
    for (const p of phones) {
      if (p.endsWith(last5)) {
        const unitId = findValueByKeys(cur, ['id_unidade_uni', 'idUnidadeUni', 'id_unidade']);
        const block = findValueByKeys(cur, ['st_bloco_uni', 'bloco', 'bloco_uni', 'blocoUnidade', 'bloco_unidade', 'st_grupo_ugbu']);
        const apartment = findValueByKeys(cur, ['st_unidade_uni', 'apartamento', 'apto', 'unidade', 'numero', 'numero_apartamento', 'apartment', 'st_identificacao_uni']);
        return { unitId, block, apartment, raw: cur };
      }
    }

    for (const v of Object.values(cur as Record<string, unknown>)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

async function findUnitByPhoneLast5(last5: string) {
  const cfg = getSuperlogicaConfig();
  if (!cfg) throw new Error('missing_superlogica_env');
  const pages = Math.min(20, Math.max(1, cfg.pages));
  for (let page = 1; page <= pages; page += 1) {
    const data = await fetchSuperlogicaPage(page);
    const match = findMatchInSuperlogicaPayload(data, last5);
    if (match) return match;
  }
  return null;
}

async function decideWithChatGpt(input: { phone: string; message: string }) {
  const apiKey = getOpenAiKey();
  if (!apiKey) return { action: 'none' as const };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const model = getAiModel();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você é um roteador de atendimento via WhatsApp. Sua saída DEVE ser JSON. Escolha uma ação: "reply" (responder) ou "none" (não responder). Se responder, inclua "reply" com texto curto e educado. Nunca inclua markdown além de \"*negrito*\" do WhatsApp. Se não tiver certeza, use action="none".',
          },
          {
            role: 'user',
            content: JSON.stringify({
              phone: input.phone,
              message: input.message,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);
    const content = String(json?.choices?.[0]?.message?.content ?? '');
    const parsed = extractJsonObject(content);
    const actionRaw = String((parsed as any)?.action ?? '').trim().toLowerCase();
    if (actionRaw !== 'reply') return { action: 'none' as const };
    const reply = String((parsed as any)?.reply ?? '').trim();
    if (!reply) return { action: 'none' as const };
    return { action: 'reply' as const, reply };
  } catch {
    return { action: 'none' as const };
  } finally {
    clearTimeout(timeout);
  }
}

function getWebhookMessageData(payload: any): { kind: string; text: string | null; meta: AnyRecord } {
  const rawText = payload?.text?.message ?? payload?.text ?? payload?.message;
  if (typeof rawText === 'string' && rawText.trim()) {
    return { kind: 'text', text: rawText, meta: {} };
  }

  if (payload?.image) {
    const caption = typeof payload?.image?.caption === 'string' ? payload.image.caption : '';
    const url =
      (typeof payload?.image?.imageUrl === 'string' ? payload.image.imageUrl : null) ||
      (typeof payload?.image?.url === 'string' ? payload.image.url : null) ||
      (typeof payload?.imageUrl === 'string' ? payload.imageUrl : null) ||
      '';
    const meta: AnyRecord = { url, caption };
    if (typeof payload?.image?.mimeType === 'string') meta.mimeType = payload.image.mimeType;
    if (typeof payload?.image?.thumbnailUrl === 'string') meta.thumbnailUrl = payload.image.thumbnailUrl;
    return { kind: 'image', text: caption || '📷 Foto', meta };
  }

  if (payload?.video) {
    const caption = typeof payload?.video?.caption === 'string' ? payload.video.caption : '';
    const url =
      (typeof payload?.video?.videoUrl === 'string' ? payload.video.videoUrl : null) ||
      (typeof payload?.video?.url === 'string' ? payload.video.url : null) ||
      (typeof payload?.videoUrl === 'string' ? payload.videoUrl : null) ||
      '';
    const meta: AnyRecord = { url, caption };
    if (typeof payload?.video?.mimeType === 'string') meta.mimeType = payload.video.mimeType;
    return { kind: 'video', text: caption || '🎥 Vídeo', meta };
  }

  if (payload?.ptv) {
    const url =
      (typeof payload?.ptv?.ptvUrl === 'string' ? payload.ptv.ptvUrl : null) ||
      (typeof payload?.ptv?.url === 'string' ? payload.ptv.url : null) ||
      (typeof payload?.ptvUrl === 'string' ? payload.ptvUrl : null) ||
      (typeof payload?.ptv === 'string' ? payload.ptv : null) ||
      '';
    return { kind: 'ptv', text: '🎥 PTV', meta: { url } };
  }

  if (payload?.audio) {
    const url =
      (typeof payload?.audio?.audioUrl === 'string' ? payload.audio.audioUrl : null) ||
      (typeof payload?.audio?.url === 'string' ? payload.audio.url : null) ||
      (typeof payload?.audioUrl === 'string' ? payload.audioUrl : null) ||
      (typeof payload?.audio === 'string' ? payload.audio : null) ||
      '';
    const meta: AnyRecord = { url };
    if (typeof payload?.audio?.mimeType === 'string') meta.mimeType = payload.audio.mimeType;
    return { kind: 'audio', text: '🎵 Áudio', meta };
  }

  if (payload?.document) {
    const url =
      (typeof payload?.document?.documentUrl === 'string' ? payload.document.documentUrl : null) ||
      (typeof payload?.document?.url === 'string' ? payload.document.url : null) ||
      (typeof payload?.documentUrl === 'string' ? payload.documentUrl : null) ||
      '';
    const fileName = payload?.document?.fileName ?? payload?.document?.title;
    const safeName = typeof fileName === 'string' ? fileName : '';
    const meta: AnyRecord = { url };
    if (safeName) meta.fileName = safeName;
    if (typeof payload?.document?.mimeType === 'string') meta.mimeType = payload.document.mimeType;
    return { kind: 'document', text: safeName ? `📄 ${safeName}` : '📄 Documento', meta };
  }

  if (payload?.sticker) {
    const url =
      (typeof payload?.sticker?.stickerUrl === 'string' ? payload.sticker.stickerUrl : null) ||
      (typeof payload?.sticker?.url === 'string' ? payload.sticker.url : null) ||
      (typeof payload?.stickerUrl === 'string' ? payload.stickerUrl : null) ||
      (typeof payload?.sticker === 'string' ? payload.sticker : null) ||
      '';
    return { kind: 'sticker', text: '🧩 Figurinha', meta: { url } };
  }

  if (payload?.gif) {
    const caption = typeof payload?.gif?.caption === 'string' ? payload.gif.caption : '';
    const url =
      (typeof payload?.gif?.gifUrl === 'string' ? payload.gif.gifUrl : null) ||
      (typeof payload?.gif?.url === 'string' ? payload.gif.url : null) ||
      (typeof payload?.gifUrl === 'string' ? payload.gifUrl : null) ||
      (typeof payload?.gif === 'string' ? payload.gif : null) ||
      '';
    return { kind: 'gif', text: caption || 'GIF', meta: { url, caption } };
  }

  if (payload?.reaction) {
    const emoji =
      (typeof payload?.reaction?.emoji === 'string' ? payload.reaction.emoji : null) ||
      (typeof payload?.reaction?.reaction === 'string' ? payload.reaction.reaction : null) ||
      '';
    const reactedMessageId =
      (typeof payload?.reaction?.messageId === 'string' ? payload.reaction.messageId : null) ||
      (typeof payload?.reactionMessageId === 'string' ? payload.reactionMessageId : null) ||
      '';
    return { kind: 'reaction', text: 'Reação', meta: { emoji, reactedMessageId } };
  }

  return { kind: 'text', text: null, meta: {} };
}

export default async function handler(req: any, res: any) {
  if (req?.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'method_not_allowed' });
    return;
  }

  const secret = getQueryParam(req, 'secret');
  if (!secret) {
    res.status(401).json({ ok: false, reason: 'missing_secret' });
    return;
  }

  const payload = safeJsonParse(req?.body);
  const eventType = typeof (payload as any)?.type === 'string' ? (payload as any).type : null;
  const phoneRaw = typeof (payload as any)?.phone === 'string' ? (payload as any).phone : null;
  let fromMe = parseBooleanLike((payload as any)?.fromMe ?? (payload as any)?.from_me ?? (payload as any)?.fromme);
  const messageIdFromRoot = typeof (payload as any)?.messageId === 'string' ? (payload as any).messageId : null;
  const ids = Array.isArray((payload as any)?.ids) ? (payload as any).ids : null;
  const messageIdFromIds = ids && typeof ids?.[0] === 'string' ? String(ids[0]) : null;
  const messageId = messageIdFromRoot || messageIdFromIds;

  const eventLower = String(eventType ?? '').toLowerCase();
  const eventKey = normalizeEventType(eventLower);
  if (fromMe === null) {
    if (eventKey.includes('deliverycallback')) {
      fromMe = true;
    }
  }

  const PUBLIC_SUPABASE_URL = 'https://ejuoefbmofozggbvsehh.supabase.co';
  const PUBLIC_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdW9lZmJtb2ZvemdnYnZzZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2OTMzNTIsImV4cCI6MjA4ODI2OTM1Mn0.UeoEqFPJoEja4ryVgocubHsI3qqLbMhCxIQCxlWcxlc';

  const SUPABASE_URL = process.env.SUPABASE_URL || PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    '';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE || PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authOk, error: authError } = await supabase.rpc('insert_zapi_webhook_event', {
    p_secret: secret,
    p_payload: payload,
  });

  if (authError || authOk !== true) {
    res.status(200).json({ ok: true, stored: false, reason: 'rpc_failed' });
    return;
  }

  const isStatusEvent =
    eventKey.includes('messagestatuscallback') ||
    eventKey.includes('deliverycallback') ||
    eventKey.includes('receiveddeliverycallback') ||
    eventKey.includes('readcallback');

  if (isStatusEvent) {
    const statusRaw = String((payload as any)?.status ?? '').toLowerCase();
    const mappedStatus: 'sent' | 'delivered' | 'read' =
      eventKey.includes('readcallback') || statusRaw.includes('read')
        ? 'read'
        : eventKey.includes('deliverycallback') || eventKey.includes('receiveddeliverycallback') || statusRaw.includes('deliver') || statusRaw.includes('received')
          ? 'delivered'
          : 'sent';

    const messageIds = new Set<string>();
    addMessageIdCandidates(messageIds, messageIdFromRoot);
    for (const v of Array.isArray(ids) ? ids : []) addMessageIdCandidates(messageIds, v);

    if (messageIds.size === 0) {
      res.status(200).json({ ok: true, stored: true, synced: true, reason: 'no_ids' });
      return;
    }

    const { data: updated } = await supabase
      .from('messages')
      .update({ status: mappedStatus, is_read: mappedStatus === 'read' })
      .in('external_id', Array.from(messageIds))
      .select('id');

    res
      .status(200)
      .json({ ok: true, stored: true, synced: true, updatedCount: Array.isArray(updated) ? updated.length : 0 });
    return;
  }

  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!phone) {
    res.status(200).json({ ok: true, stored: true, synced: false, reason: 'missing_phone' });
    return;
  }

  const momment = (payload as any)?.momment;
  const date = typeof momment === 'number' ? new Date(momment) : new Date();
  const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  const msg = getWebhookMessageData(payload as any);
  const text = msg.text;
  const contactName = (payload as any)?.chatName || (payload as any)?.senderName || (payload as any)?.contact?.displayName || phone;
  const avatarUrl = (payload as any)?.senderPhoto || (payload as any)?.photo || null;

  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, unread_count, last_message, last_message_time')
    .eq('phone', phone)
    .maybeSingle();

  let inferredFromMe: boolean | null = fromMe;
  if (messageId && inferredFromMe === null) {
    const { data: ev } = await supabase
      .from('zapi_webhook_events')
      .select('from_me')
      .eq('phone', phone)
      .eq('message_id', messageId)
      .order('created_at', { ascending: false })
      .limit(10);

    const rows = Array.isArray(ev) ? ev : [];
    if (rows.some((r: any) => r?.from_me === true)) inferredFromMe = true;
    else if (rows.some((r: any) => r?.from_me === false)) inferredFromMe = false;
  }

  const hasMessage = Boolean(text);
  const unreadCount =
    hasMessage && inferredFromMe === false
      ? (existingConv?.unread_count ?? 0) + 1
      : (existingConv?.unread_count ?? 0);

  const lastMessage = hasMessage ? (text as string) : (existingConv?.last_message ?? '');
  const lastMessageTime = hasMessage ? timeString : (existingConv?.last_message_time ?? timeString);

  const { data: upsertedConv, error: convError } = await supabase
    .from('conversations')
    .upsert(
      {
        phone,
        contact_name: contactName,
        avatar_url: avatarUrl,
        last_message: lastMessage,
        last_message_time: lastMessageTime,
        unread_count: unreadCount,
        is_active: true,
      },
      { onConflict: 'phone' },
    )
    .select('id')
    .single();

  if (convError) {
    res.status(200).json({ ok: true, stored: true, synced: false, reason: 'conversation_upsert_failed' });
    return;
  }

  const statusRaw = String((payload as any)?.status ?? '').toLowerCase();
  const status = statusRaw.includes('read') ? 'read' : statusRaw.includes('deliver') || statusRaw.includes('received') ? 'delivered' : 'sent';
  let sender: 'user' | 'other' = inferredFromMe === true ? 'user' : 'other';

  let existingMsg: any = null;
  if (messageId) {
    const { data } = await supabase
      .from('messages')
      .select('sender, kind, text, meta')
      .eq('conversation_id', upsertedConv.id)
      .eq('external_id', messageId)
      .limit(1)
      .maybeSingle();
    existingMsg = data ?? null;
  }

  if (existingMsg?.sender === 'user' || existingMsg?.sender === 'other') {
    sender = existingMsg.sender;
  }

  let insertedMessage = false;
  const shouldUpsertMessage = Boolean(messageId) && (hasMessage || Boolean(existingMsg));
  if (messageId && shouldUpsertMessage) {
    const existingText = typeof existingMsg?.text === 'string' ? existingMsg.text : '';
    const existingKind = typeof existingMsg?.kind === 'string' ? existingMsg.kind : '';
    const existingMeta = existingMsg?.meta && typeof existingMsg.meta === 'object' ? (existingMsg.meta as AnyRecord) : null;
    const hasExistingUrl = Boolean(existingMeta && typeof (existingMeta as any).url === 'string' && String((existingMeta as any).url).trim());
    const hasNewUrl = Boolean(typeof (msg.meta as any)?.url === 'string' && String((msg.meta as any).url).trim());

    const newKind = msg.kind;
    const mergedKind =
      hasNewUrl && !hasExistingUrl
        ? newKind
        : existingKind
          ? existingKind
          : newKind;
    const mergedMeta =
      hasNewUrl && !hasExistingUrl
        ? msg.meta
        : existingMeta
          ? existingMeta
          : msg.meta;

    const newText = typeof text === 'string' ? text : '';
    const mergedText =
      isPlaceholderMessageText(existingText) && newText && !isPlaceholderMessageText(newText)
        ? newText
        : existingText || newText || (typeof msg.text === 'string' ? msg.text : '') || existingText;

    await supabase
      .from('messages')
      .upsert(
        {
          conversation_id: upsertedConv.id,
          text: mergedText,
          sender,
          timestamp: timeString,
          status,
          external_id: messageId,
          kind: mergedKind,
          meta: mergedMeta,
        },
        { onConflict: 'conversation_id,external_id' },
      );
    insertedMessage = true;
  }

  let handledByLookup = false;

  if (inferredFromMe === false) {
    const phoneDigits = normalizeDigits(phone);
    const isPhoneNumber = phoneDigits.length >= 10;
    const signature = getAiSignatureName();
    let isNewClient = false;
    let needsLookup = false;
    let clientUnitId = '';
    let clientBlock = '';
    let clientApartment = '';
    let lastAutoReplyTo = '';
    let lastAutoReplyAt: string | null = null;

    try {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('phone,status,matched,unit_id,block,apartment,last_auto_reply_to,last_auto_reply_at')
        .eq('phone', phoneDigits)
        .maybeSingle();

      if (!existingClient) {
        isNewClient = true;
        needsLookup = true;
        await supabase.from('clients').insert([
          {
            phone: phoneDigits,
            status: 2,
            whatsapp_name: contactName,
            whatsapp_photo_url: avatarUrl,
            matched: false,
            match_payload: {},
          },
        ]);
      } else {
        const matched = Boolean((existingClient as any)?.matched) || Number((existingClient as any)?.status) === 1;
        const hasBlock = Boolean(String((existingClient as any)?.block ?? '').trim());
        const hasApartment = Boolean(String((existingClient as any)?.apartment ?? '').trim());
        needsLookup = !matched || !hasBlock || !hasApartment;
        clientUnitId = String((existingClient as any)?.unit_id ?? '').trim();
        clientBlock = String((existingClient as any)?.block ?? '').trim();
        clientApartment = String((existingClient as any)?.apartment ?? '').trim();
        lastAutoReplyTo = String((existingClient as any)?.last_auto_reply_to ?? '').trim();
        lastAutoReplyAt = (existingClient as any)?.last_auto_reply_at ?? null;
        await supabase
          .from('clients')
          .update({ whatsapp_name: contactName, whatsapp_photo_url: avatarUrl })
          .eq('phone', phoneDigits);
      }
    } catch {
    }

    if (isPhoneNumber && needsLookup) {
      const last5 = phoneDigits.slice(-5);
      if (last5.length === 5) {
        try {
          const match = await findUnitByPhoneLast5(last5);
          if (match) {
            const unitId = String(match.unitId || '').trim();
            const block = String(match.block || '').trim();
            const apartment = String(match.apartment || '').trim();

            try {
              await supabase
                .from('clients')
                .update({
                  status: 1,
                  matched: true,
                  unit_id: unitId || null,
                  block: block || null,
                  apartment: apartment || null,
                  match_payload: match.raw ?? {},
                })
                .eq('phone', phoneDigits);
            } catch {
            }
            clientUnitId = unitId;
            clientBlock = block;
            clientApartment = apartment;
          } else if (isNewClient) {
          }
        } catch {
        }
      }
    }

    const shouldSendMenu =
      shouldAutoReply() &&
      msg.kind === 'text' &&
      typeof text === 'string' &&
      text.trim() &&
      !isMenuChoice(text.trim());

    if (shouldSendMenu) {
      const now = Date.now();
      const lastAtMs = lastAutoReplyAt ? Date.parse(String(lastAutoReplyAt)) : NaN;
      const tooSoon = Number.isFinite(lastAtMs) ? now - lastAtMs < 5000 : false;
      const sameMessage = Boolean(messageId) && Boolean(lastAutoReplyTo) && lastAutoReplyTo === String(messageId);

      if (!tooSoon && !sameMessage) {
        let replyBody = '';

        if (!clientApartment || !clientBlock) {
          replyBody = `Olá, ${contactName}. Não consegui identificar seu apartamento e bloco automaticamente. Me informe seu bloco e apartamento para eu vincular seu acesso.`;
        } else {
          replyBody = buildWelcomeMenu({ name: contactName, apartment: clientApartment, block: clientBlock });
        }

        const finalText = signedText(signature, replyBody);

        try {
          const resp: any = await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
          const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '').trim();

          await supabase.from('messages').insert([
            {
              conversation_id: upsertedConv.id,
              text: finalText,
              sender: 'user',
              timestamp: formatTimeHM(new Date()),
              status: 'sent',
              external_id: externalId || null,
              kind: 'text',
              meta: {
                ai: true,
                ai_welcome: true,
                auto_reply_to: messageId || null,
                superlogica: true,
                unit_id: clientUnitId || null,
                block: clientBlock || null,
                apartment: clientApartment || null,
              },
            },
          ]);

          await supabase
            .from('conversations')
            .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
            .eq('id', upsertedConv.id);

          await supabase
            .from('clients')
            .update({ last_auto_reply_at: new Date().toISOString(), last_auto_reply_to: messageId || null })
            .eq('phone', phoneDigits);

          handledByLookup = true;
        } catch {
        }
      }
    }
  }

  if (!handledByLookup && shouldAutoReply() && inferredFromMe === false && msg.kind === 'text' && typeof text === 'string' && text.trim()) {
    const decision = await decideWithChatGpt({ phone, message: text.trim() });
    if (decision.action === 'reply') {
      const signature = getAiSignatureName();
      const finalText = signedText(signature, decision.reply);
      try {
        const resp: any = await zapiFetch('POST', '/send-text', { phone, message: finalText });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '').trim();
        await supabase.from('messages').insert([
          {
            conversation_id: upsertedConv.id,
            text: finalText,
            sender: 'user',
            timestamp: formatTimeHM(new Date()),
            status: 'sent',
            external_id: externalId || null,
            kind: 'text',
            meta: { ai: true, model: getAiModel() },
          },
        ]);

        await supabase
          .from('conversations')
          .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
          .eq('id', upsertedConv.id);
      } catch {
      }
    }
  }

  res.status(200).json({ ok: true, stored: true, synced: true, insertedMessage, eventType, phone });
}

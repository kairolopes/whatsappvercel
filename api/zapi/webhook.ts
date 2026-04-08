import { createClient } from '@supabase/supabase-js';
import { searchCondoDocs } from '../lib/condoDocs.js';
import {
  isAdminIntent,
  isAffirmative,
  isBoletoIntent,
  isCancel,
  isMenuChoice,
  isNegative,
  isRegimentoIntent,
  isReservaIntent,
  simplifyText,
} from '../lib/intents.js';
import { transcribeAudioFromUrl } from '../lib/voice.js';

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

function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant(seed: string, variants: string[]) {
  const list = Array.isArray(variants) ? variants.filter(Boolean) : [];
  if (list.length === 0) return '';
  const idx = hashSeed(seed) % list.length;
  return list[idx];
}

function extractPreferredName(input: string, allowSingleWord: boolean) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const s = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const m = s.match(/\b(meu nome e|meu nome é|eu sou|pode me chamar de|chama(\-)?me de)\s+(.{2,40})$/i);
  const simplified = simplifyText(s);
  const greetings = new Set(['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite']);
  if (!m && (greetings.has(simplified) || simplified.length < 4)) return '';

  const candidate = (m ? m[3] : s).trim();
  const cleaned = candidate
    .replace(/[^A-Za-zÀ-ÿ\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (!allowSingleWord && parts.length < 2 && !m) return '';

  const name = parts.slice(0, 3).join(' ');
  if (name.length < 2) return '';
  if (name.length > 40) return name.slice(0, 40).trim();
  return name;
}

function looksLikeCondoQuestion(input: string) {
  const s = simplifyText(String(input || ''));
  if (!s) return false;
  const keywords = [
    'condominio',
    'regimento',
    'convencao',
    'barulho',
    'obra',
    'reforma',
    'pet',
    'cachorro',
    'gato',
    'multa',
    'vaga',
    'garagem',
    'piscina',
    'churrasqueira',
    'salao',
    'horario',
    'horarios',
    'permitido',
    'proibido',
    'pode',
  ];
  if (keywords.some((k) => s.includes(k))) return true;
  if (String(input || '').includes('?')) return true;
  return false;
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

function normalizeDigitsOnly(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function getAdminForwardPhone(): string {
  return normalizeDigitsOnly(process.env.ADMIN_FORWARD_PHONE || '');
}

function getReservaUrl(): string {
  return String(process.env.RESERVA_URL || '').trim();
}

function getRegimentoPdfUrl(): string {
  return String(process.env.REGIMENTO_PDF_URL || '').trim();
}

function getConvencaoPdfUrl(): string {
  return String(process.env.CONVENCAO_PDF_URL || '').trim();
}

function buildWelcomeMenu(params: { name: string; apartment: string; block: string }) {
  const name = String(params.name || '').trim() || 'morador';
  const apartment = String(params.apartment || '').trim();
  const block = String(params.block || '').trim();
  return (
    `Olá, ${name}, sua conta está vinculada ao apartamento ${apartment}, Bloco ${block}, do CONDOMINIO CAMPOS ALTOS!\n\n` +
    `Como posso te ajudar hoje?\n\n` +
    `1 - Boleto;\n\n` +
    `2 - Reservar ambiente;\n\n` +
    `3 - Falar com a Administração / Síndico;\n\n` +
    `4 - Dúvidas sobre o condomínio (Convenção/Regimento).`
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

async function fetchSuperlogicaCobranca(unitId: string) {
  const cfg = getSuperlogicaConfig();
  if (!cfg) throw new Error('missing_superlogica_env');

  const url = `https://api.superlogica.net/v2/condor/cobranca/index?idCondominio=${encodeURIComponent(cfg.condominioId)}&UNIDADES[0]=${encodeURIComponent(
    String(unitId),
  )}&itensPorPagina=50&pagina=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        app_token: cfg.appToken,
        access_token: cfg.accessToken,
        Accept: 'application/json',
      } as any,
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      const err: any = new Error('superlogica_cobranca_error');
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSuperlogicaDate(input: string | undefined) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAgreementRecebimento(item: any) {
  const idAcordo = String(item?.id_acordo_recb ?? '').trim();
  if (idAcordo) return true;
  const parc = String(item?.fl_parcelamento_recb ?? '').trim();
  if (parc && parc !== '0') return true;
  const keys = Object.keys(item || {});
  for (const k of keys) {
    const v = item[k];
    if (typeof v !== 'string') continue;
    const s = simplifyText(v);
    if (s.includes('acordo') || s.includes('parcel') || s.includes('negoci')) return true;
  }
  return false;
}

function collectRecebimentos(payload: any) {
  const out: { id: string; due?: string; amount?: string }[] = [];
  const seen = new Set<string>();
  const stack: any[] = [payload];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }

    const rec = cur as Record<string, any>;
    const id = String(rec.id_recebimento_recb ?? '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      const due = String(rec.dt_vencimento_recb ?? rec.dt_vencimento ?? '').trim() || undefined;
      const amount = String(rec.vl_total_recb ?? rec.vl_valor_recb ?? rec.vl_valor ?? '').trim() || undefined;
      out.push({ id, due, amount });
    }

    for (const v of Object.values(rec)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }

  return out;
}

function collectRecebimentoItems(payload: any) {
  const out: any[] = [];
  const seen = new Set<string>();
  const stack: any[] = [payload];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    const rec = cur as Record<string, any>;
    const id = String(rec.id_recebimento_recb ?? '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(cur);
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }

  return out;
}

async function fetchSuperlogicaSegundaViaLink(recebimentoId: string) {
  const cfg = getSuperlogicaConfig();
  if (!cfg) throw new Error('missing_superlogica_env');

  const url = `https://api.superlogica.net/v2/condor/cobranca/gerarlinksegundavia?ID_CONDOMINIO_COND=${encodeURIComponent(
    cfg.condominioId,
  )}&ID_RECEBIMENTO_RECB=${encodeURIComponent(String(recebimentoId))}&DT_VENCIMENTO_RECB=01/01/2025&DT_ATUALIZACAO_VENCIMENTO=12/31/2026`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        app_token: cfg.appToken,
        access_token: cfg.accessToken,
        Accept: 'application/json',
      } as any,
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      const err: any = new Error('superlogica_segundavia_error');
      err.status = res.status;
      err.details = data;
      throw err;
    }

    if (typeof data === 'string') {
      const s = data.trim();
      if (s.startsWith('http')) return s;
    }

    const link = findValueByKeys(data, ['link', 'url', 'st_link', 'st_url', 'st_link_recb', 'st_linkboleto_recb']);
    return link;
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

async function refreshClientUnitFromSuperlogica(params: {
  supabase: any;
  phoneDigits: string;
  senderDisplayName: string;
  avatarUrl: string | null;
}) {
  const phoneDigits = normalizeDigits(params.phoneDigits);
  if (phoneDigits.length < 10) return null;
  const last5 = phoneDigits.slice(-5);
  if (last5.length !== 5) return null;

  try {
    const match = await findUnitByPhoneLast5(last5);
    if (!match) return null;

    const unitId = String(match.unitId || '').trim();
    const block = String(match.block || '').trim();
    const apartment = String(match.apartment || '').trim();

    try {
      await params.supabase
        .from('clients')
        .upsert(
          {
            phone: phoneDigits,
            status: 1,
            matched: true,
            unit_id: unitId || null,
            block: block || null,
            apartment: apartment || null,
            whatsapp_name: params.senderDisplayName,
            whatsapp_photo_url: params.avatarUrl,
            match_payload: match.raw ?? {},
          },
          { onConflict: 'phone' },
        );
    } catch {
    }

    return { unitId, block, apartment };
  } catch {
    return null;
  }
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

async function answerWithCondoDocs(question: string) {
  const hits = await searchCondoDocs(question, 6).catch(() => [] as any[]);
  if (hits.length === 0) {
    return {
      answer:
        'Entendi sua dúvida. Eu não encontrei essa informação com clareza na Convenção ou no Regimento usando os termos enviados. Você pode me dar mais detalhes (por exemplo: qual área/assunto e qual situação aconteceu)?',
      sources: [] as { doc: string; page: number; excerpt: string }[],
    };
  }

  const first = hits[0];
  const excerpt = String(first?.snippet ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

  return {
    answer:
      `Entendi sua dúvida. Pelo que consta nos documentos, encontrei o seguinte trecho relacionado ao seu tema. Se você me disser sua situação (dia/horário/local), eu te ajudo a aplicar na prática.`,
    sources: [
      {
        doc: String(first?.docName ?? '').trim(),
        page: Number(first?.page ?? 0) || 0,
        excerpt,
      },
    ].filter((s) => s.doc && s.page > 0 && s.excerpt),
  };
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
  const conversationName = (payload as any)?.chatName || (payload as any)?.contact?.displayName || (payload as any)?.senderName || phone;
  const senderDisplayName = (payload as any)?.senderName || (payload as any)?.chatName || (payload as any)?.contact?.displayName || phone;
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
        contact_name: conversationName,
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
    let incomingText = typeof text === 'string' ? text.trim() : '';
    let isNewClient = false;
    let needsLookup = false;
    let clientUnitId = '';
    let clientBlock = '';
    let clientApartment = '';
    let lastAutoReplyTo = '';
    let lastAutoReplyAt: string | null = null;
    let supportState = '';
    let supportTopic = '';
    let supportPayload: any = {};
    let preferredName = '';

    if (msg.kind === 'audio' && !incomingText) {
      const audioUrl = typeof (msg.meta as any)?.url === 'string' ? String((msg.meta as any).url).trim() : '';
      const mimeType = typeof (msg.meta as any)?.mimeType === 'string' ? String((msg.meta as any).mimeType).trim() : '';
      const apiKey = getOpenAiKey();
      if (audioUrl && apiKey) {
        try {
          const stt = await transcribeAudioFromUrl({ openAiApiKey: apiKey, audioUrl, mimeType });
          if (stt?.text) {
            incomingText = stt.text;
            if (messageId) {
              try {
                await supabase
                  .from('messages')
                  .update({ meta: { ...(msg.meta as any), transcript: stt.text, transcript_model: stt.model } })
                  .eq('conversation_id', upsertedConv.id)
                  .eq('external_id', messageId);
              } catch {
              }
            }
          }
        } catch {
        }
      }
    }

    try {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('phone,status,matched,unit_id,block,apartment,preferred_name,last_auto_reply_to,last_auto_reply_at,support_state,support_topic,support_payload')
        .eq('phone', phoneDigits)
        .maybeSingle();

      if (!existingClient) {
        isNewClient = true;
        needsLookup = true;
        await supabase.from('clients').insert([
          {
            phone: phoneDigits,
            status: 2,
            whatsapp_name: senderDisplayName,
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
        supportState = String((existingClient as any)?.support_state ?? '').trim();
        supportTopic = String((existingClient as any)?.support_topic ?? '').trim();
        supportPayload = (existingClient as any)?.support_payload && typeof (existingClient as any)?.support_payload === 'object' ? (existingClient as any).support_payload : {};
        preferredName = String((existingClient as any)?.preferred_name ?? '').trim();
        await supabase
          .from('clients')
          .update({ whatsapp_name: senderDisplayName, whatsapp_photo_url: avatarUrl })
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

    const nameForChat = preferredName || senderDisplayName;

    const onboardingState = String(supportState || '').trim();
    const onboardingSeed = `${phoneDigits}:${messageId || ''}:${incomingText || ''}`;

    if (!handledByLookup && incomingText && onboardingState === 'onboard_wait_name') {
      const extracted = extractPreferredName(incomingText, true);
      if (!extracted) {
        const variants = [
          'Perfeito. Como você prefere ser chamado(a)?',
          'Claro. Qual é o seu nome?',
          'Pode me dizer seu nome para eu te chamar direitinho?',
        ];
        const finalText = signedText(signature, pickVariant(onboardingSeed, variants));
        try {
          await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
        } catch {
        }
        handledByLookup = true;
      } else {
        try {
          await supabase.from('clients').update({ preferred_name: extracted }).eq('phone', phoneDigits);
        } catch {
        }

        if (clientApartment && clientBlock) {
          const confirmVariants = [
            `Prazer, ${extracted}. Só confirmando: você está vinculado(a) ao apartamento ${clientApartment}, bloco ${clientBlock}?\n\nResponda 1 para SIM ou 2 para NÃO.`,
            `${extracted}, só para eu não errar: seu vínculo é no apto ${clientApartment}, bloco ${clientBlock}?\n\n1 = Sim\n2 = Não`,
          ];
          const finalText = signedText(signature, pickVariant(onboardingSeed, confirmVariants));
          try {
            await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            await supabase
              .from('clients')
              .update({ support_state: 'onboard_confirm_unit', support_payload: { apartment: clientApartment, block: clientBlock, unit_id: clientUnitId || null } })
              .eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        } else {
          const askUnit =
            `Prazer, ${extracted}. Você está vinculado(a) a qual unidade?\n\n` +
            `- Apartamento/Bloco (ex: Bloco 07, Apto 0107)\n` +
            `- Casa/Quadra/Lote/Unidade (ex: Quadra A, Lote 12)\n\n` +
            `Me envie como texto para eu encaminhar à Administração e vincular.`;
          const finalText = signedText(signature, askUnit);
          try {
            await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            await supabase.from('clients').update({ support_state: 'onboard_wait_unit', support_payload: {} }).eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        }
      }
    }

    if (!handledByLookup && incomingText && onboardingState === 'onboard_confirm_unit') {
      if (isAffirmative(incomingText)) {
        const finalText = signedText(signature, buildWelcomeMenu({ name: nameForChat, apartment: clientApartment, block: clientBlock }));
        try {
          await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
          await supabase.from('clients').update({ support_state: null, support_payload: {} }).eq('phone', phoneDigits);
        } catch {
        }
        handledByLookup = true;
      } else if (isNegative(incomingText)) {
        const ask =
          `Sem problemas, ${nameForChat}. Me diga qual é sua unidade para eu encaminhar e ajustar o vínculo.\n\n` +
          `- Apartamento/Bloco (ex: Bloco 07, Apto 0107)\n` +
          `- Casa/Quadra/Lote/Unidade (ex: Quadra A, Lote 12)`;
        const finalText = signedText(signature, ask);
        try {
          await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
          await supabase.from('clients').update({ support_state: 'onboard_wait_unit', support_payload: {} }).eq('phone', phoneDigits);
        } catch {
        }
        handledByLookup = true;
      }
    }

    if (!handledByLookup && incomingText && onboardingState === 'onboard_wait_unit') {
      const provided = incomingText;
      const adminPhone = getAdminForwardPhone();
      const ackVariants = [
        `Obrigado, ${nameForChat}. Vou encaminhar sua unidade para a Administração e, enquanto isso, posso te ajudar com as opções abaixo.`,
        `Perfeito, ${nameForChat}. Já vou passar isso para a Administração. Enquanto isso, posso te ajudar com:`,
      ];
      const ack = pickVariant(onboardingSeed, ackVariants);

      const menu =
        `1 - Boleto\n` +
        `2 - Reservar ambiente\n` +
        `3 - Falar com a Administração / Síndico\n` +
        `4 - Dúvidas sobre o condomínio (Convenção/Regimento)`;

      const finalText = signedText(signature, `${ack}\n\n${menu}`);
      try {
        await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
      } catch {
      }

      if (adminPhone) {
        const forward = signedText(
          signature,
          `Vínculo informado pelo morador:\nCliente: ${nameForChat}\nTelefone: ${phoneDigits}\nInformado: ${provided}`,
        );
        try {
          await zapiFetch('POST', '/send-text', { phone: adminPhone, message: forward });
        } catch {
        }
      }

      try {
        await supabase
          .from('clients')
          .update({ support_state: null, support_payload: { provided_unit: provided }, support_topic: 'onboarding' })
          .eq('phone', phoneDigits);
      } catch {
      }

      handledByLookup = true;
    }

    const docsState = String(supportState || '').trim();
    const isDocsFlow = docsState.startsWith('docs_');

    if (!handledByLookup && isDocsFlow && msg.kind === 'audio' && !incomingText) {
      const finalText = signedText(
        signature,
        'Eu recebi seu áudio, mas não consegui transcrever com clareza. Você pode digitar sua dúvida (ou enviar um áudio mais curto)?',
      );
      try {
        await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
      } catch {
      }
      handledByLookup = true;
    }

    const isOtherIntent =
      isMenuChoice(incomingText) ||
      isBoletoIntent(incomingText) ||
      isReservaIntent(incomingText) ||
      isRegimentoIntent(incomingText) ||
      isAdminIntent(incomingText);

    if (!handledByLookup && incomingText && !isDocsFlow && !isOtherIntent) {
      const now = Date.now();
      const lastAtMs = lastAutoReplyAt ? Date.parse(String(lastAutoReplyAt)) : NaN;
      const tooSoon = Number.isFinite(lastAtMs) ? now - lastAtMs < 5000 : false;
      const sameMessage = Boolean(messageId) && Boolean(lastAutoReplyTo) && lastAutoReplyTo === String(messageId);
      if (!tooSoon && !sameMessage) {
      if (looksLikeCondoQuestion(incomingText)) {
        const q = incomingText;
        const confirmTemplates = [
          `Só confirmando: sua dúvida é esta?\n\n"${q}"\n\nResponda 1 para SIM ou 2 para NÃO.`,
          `Entendi. Você quer perguntar isso, certo?\n\n"${q}"\n\n1 = Sim\n2 = Não`,
        ];
        const confirm = signedText(signature, pickVariant(onboardingSeed, confirmTemplates));
        try {
          const resp: any = await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: confirm });
          const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '').trim();
          await supabase.from('messages').insert([
            {
              conversation_id: upsertedConv.id,
              text: confirm,
              sender: 'user',
              timestamp: formatTimeHM(new Date()),
              status: 'sent',
              external_id: externalId || null,
              kind: 'text',
              meta: { action: 'docs_confirm_prompt', ai: true, question: q },
            },
          ]);
          await supabase
            .from('clients')
            .update({ support_state: 'docs_confirm', support_topic: 'regimento_convencao', support_payload: { question: q } })
            .eq('phone', phoneDigits);
        } catch {
        }
        handledByLookup = true;
      } else {
        if (!preferredName) {
          const extracted = extractPreferredName(incomingText, false);
          if (extracted) {
            try {
              await supabase.from('clients').update({ preferred_name: extracted }).eq('phone', phoneDigits);
            } catch {
            }

            if (clientApartment && clientBlock) {
              const confirmTemplates = [
                `Prazer, ${extracted}. Só confirmando: você está vinculado(a) ao apartamento ${clientApartment}, bloco ${clientBlock}?\n\nResponda 1 para SIM ou 2 para NÃO.`,
                `${extracted}, só para eu não errar: seu vínculo é no apto ${clientApartment}, bloco ${clientBlock}?\n\n1 = Sim\n2 = Não`,
              ];
              const confirm = signedText(signature, pickVariant(onboardingSeed, confirmTemplates));
              try {
                await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: confirm });
                await supabase
                  .from('clients')
                  .update({ support_state: 'onboard_confirm_unit', support_topic: 'onboarding', support_payload: { apartment: clientApartment, block: clientBlock, unit_id: clientUnitId || null } })
                  .eq('phone', phoneDigits);
              } catch {
              }
              handledByLookup = true;
            } else {
              const ask =
                `Prazer, ${extracted}. Você está vinculado(a) a qual unidade?\n\n` +
                `- Apartamento/Bloco (ex: Bloco 07, Apto 0107)\n` +
                `- Casa/Quadra/Lote/Unidade (ex: Quadra A, Lote 12)`;
              const finalText = signedText(signature, ask);
              try {
                await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
                await supabase
                  .from('clients')
                  .update({ support_state: 'onboard_wait_unit', support_topic: 'onboarding', support_payload: {} })
                  .eq('phone', phoneDigits);
              } catch {
              }
              handledByLookup = true;
            }
          }

          if (!handledByLookup) {
          const helloVariants = [
            `Olá! Eu sou o ${signature}. Como posso te chamar?`,
            `Oi! Aqui é o ${signature}. Qual é o seu nome?`,
            `Olá! Sou o ${signature}. Me diz seu nome para eu te atender melhor?`,
          ];
          const finalText = signedText(signature, pickVariant(onboardingSeed, helloVariants));
          try {
            await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            await supabase.from('clients').update({ support_state: 'onboard_wait_name', support_topic: 'onboarding', support_payload: {} }).eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
          }
        } else {
          if (clientApartment && clientBlock) {
            const menu = buildWelcomeMenu({ name: nameForChat, apartment: clientApartment, block: clientBlock });
            const finalText = signedText(signature, menu);
            try {
              await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            } catch {
            }
            handledByLookup = true;
          } else {
            const ask =
              `Entendi, ${nameForChat}. Você está vinculado(a) a qual unidade?\n\n` +
              `- Apartamento/Bloco (ex: Bloco 07, Apto 0107)\n` +
              `- Casa/Quadra/Lote/Unidade (ex: Quadra A, Lote 12)`;
            const finalText = signedText(signature, ask);
            try {
              await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
              await supabase.from('clients').update({ support_state: 'onboard_wait_unit', support_topic: 'onboarding', support_payload: {} }).eq('phone', phoneDigits);
            } catch {
            }
            handledByLookup = true;
          }
        }
      }
      }
    }

    if (!handledByLookup && incomingText && isDocsFlow && (docsState === 'docs_confirm' || !isOtherIntent)) {
      const questionFromPayload = String(supportPayload?.question ?? '').trim();

      if (docsState === 'docs_confirm') {
        if (isCancel(incomingText)) {
          const finalText = signedText(signature, 'Tudo bem. Se quiser, me diga qual é a sua dúvida sobre a Convenção ou Regimento Interno.');
          try {
            await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            await supabase
              .from('clients')
              .update({ support_state: 'docs_wait_question', support_payload: {}, support_topic: supportTopic || 'regimento_convencao' })
              .eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        } else if (isAffirmative(incomingText)) {
          const q = questionFromPayload || incomingText;
          const result = await answerWithCondoDocs(q);
          const src = (result.sources || []).slice(0, 2);
          const lines: string[] = [];
          lines.push(result.answer);
          if (src.length) {
            lines.push('');
            lines.push('Onde encontrei:');
            for (const s of src) lines.push(`${s.doc}, pág. ${s.page}`);
            const excerpt = String(src[0]?.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
            if (excerpt) {
              lines.push('');
              lines.push(`Trecho: "${excerpt}"`);
            }
          }
          lines.push('');
          lines.push('Quer que eu procure mais detalhes, ou prefere falar com a Administração? (Responda 3)');

          const finalText = signedText(signature, lines.join('\n'));
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
                meta: { action: 'docs_answer', ai: true, sources: src, question: q },
              },
            ]);
            await supabase
              .from('conversations')
              .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
              .eq('id', upsertedConv.id);
            await supabase
              .from('clients')
              .update({ support_state: 'docs_active', support_topic: supportTopic || 'regimento_convencao', support_payload: {} })
              .eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        } else if (isNegative(incomingText)) {
          const finalText = signedText(
            signature,
            'Sem problemas. Pode me dizer novamente qual é a sua dúvida? Se puder, cite o tema (barulho, obra, pet, vaga, piscina, multa, etc.).',
          );
          try {
            await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            await supabase
              .from('clients')
              .update({ support_state: 'docs_wait_question', support_payload: {}, support_topic: supportTopic || 'regimento_convencao' })
              .eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        } else {
          const q = incomingText;
          const confirm = signedText(
            signature,
            `Só confirmando: você quer tirar a seguinte dúvida?\n\n"${q}"\n\nResponda 1 para SIM ou 2 para NÃO.`,
          );
          try {
            const resp: any = await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: confirm });
            const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '').trim();
            await supabase.from('messages').insert([
              {
                conversation_id: upsertedConv.id,
                text: confirm,
                sender: 'user',
                timestamp: formatTimeHM(new Date()),
                status: 'sent',
                external_id: externalId || null,
                kind: 'text',
                meta: { action: 'docs_confirm_prompt', ai: true, question: q },
              },
            ]);
            await supabase
              .from('conversations')
              .update({ last_message: confirm, last_message_time: formatTimeHM(new Date()) })
              .eq('id', upsertedConv.id);
            await supabase
              .from('clients')
              .update({ support_state: 'docs_confirm', support_topic: supportTopic || 'regimento_convencao', support_payload: { question: q } })
              .eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        }
      } else if (docsState === 'docs_wait_question' || docsState === 'docs_active') {
        if (isCancel(incomingText)) {
          const finalText = signedText(
            signature,
            'Tudo bem. Posso te ajudar com:\n\n1 - Boleto\n2 - Reservar ambiente\n3 - Administração/Síndico\n4 - Dúvidas (Convenção/Regimento)',
          );
          try {
            await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: finalText });
            await supabase.from('clients').update({ support_state: null, support_payload: {} }).eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        } else {
          const q = incomingText;
          const confirm = signedText(
            signature,
            `Só confirmando: você quer tirar a seguinte dúvida?\n\n"${q}"\n\nResponda 1 para SIM ou 2 para NÃO.`,
          );
          try {
            const resp: any = await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: confirm });
            const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '').trim();
            await supabase.from('messages').insert([
              {
                conversation_id: upsertedConv.id,
                text: confirm,
                sender: 'user',
                timestamp: formatTimeHM(new Date()),
                status: 'sent',
                external_id: externalId || null,
                kind: 'text',
                meta: { action: 'docs_confirm_prompt', ai: true, question: q },
              },
            ]);
            await supabase
              .from('conversations')
              .update({ last_message: confirm, last_message_time: formatTimeHM(new Date()) })
              .eq('id', upsertedConv.id);
            await supabase
              .from('clients')
              .update({ support_state: 'docs_confirm', support_topic: supportTopic || 'regimento_convencao', support_payload: { question: q } })
              .eq('phone', phoneDigits);
          } catch {
          }
          handledByLookup = true;
        }
      }
    }

    if (!handledByLookup && incomingText && isBoletoIntent(incomingText)) {
      if (!clientUnitId) {
        const replyBody = `Olá, ${nameForChat}. Não consegui identificar sua unidade para buscar boletos. Me informe seu bloco e apartamento para eu vincular seu acesso.`;
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
              meta: { superlogica: true, action: 'boleto', missing_unit: true },
            },
          ]);
          await supabase
            .from('conversations')
            .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
            .eq('id', upsertedConv.id);
        } catch {
        }

        handledByLookup = true;
      } else {
        const nowIso = new Date().toISOString();

        try {
          const cobranca = await fetchSuperlogicaCobranca(clientUnitId);
          const items = collectRecebimentoItems(cobranca);
          const now = new Date();
          const nowMs = now.getTime();
          const month = now.getUTCMonth();
          const year = now.getUTCFullYear();

          const normalized = items
            .map((it: any) => {
              const id = String(it?.id_recebimento_recb ?? '').trim();
              if (!id) return null;
              const dueRaw = String(it?.dt_vencimento_recb ?? '').trim();
              const due = dueRaw ? dueRaw.slice(0, 10) : '';
              const dueDate = parseSuperlogicaDate(due);
              const amount = String(it?.vl_total_recb ?? it?.vl_valor_recb ?? '').trim();
              return { id, due, dueMs: dueDate ? dueDate.getTime() : null, dueDate, amount };
            })
            .filter(Boolean) as any[];

          const maxCandidates = 5;
          const maxWindowDays = 62;
          const maxWindowMs = maxWindowDays * 24 * 60 * 60 * 1000;

          const candidatesThisMonth = normalized
            .filter((x) => x.dueDate && x.dueDate.getUTCFullYear() === year && x.dueDate.getUTCMonth() === month)
            .sort((a, b) => {
              const ad = a.dueMs ?? Number.POSITIVE_INFINITY;
              const bd = b.dueMs ?? Number.POSITIVE_INFINITY;
              const diffA = Math.abs(ad - nowMs);
              const diffB = Math.abs(bd - nowMs);
              if (diffA !== diffB) return diffA - diffB;
              return String(a.id).localeCompare(String(b.id));
            })
            .slice(0, maxCandidates);

          const candidatesRecentPast = normalized
            .filter((x) => typeof x.dueMs === 'number' && x.dueMs <= nowMs && nowMs - x.dueMs <= maxWindowMs)
            .sort((a, b) => (b.dueMs ?? 0) - (a.dueMs ?? 0))
            .slice(0, maxCandidates);

          const candidatesNearFuture = normalized
            .filter((x) => typeof x.dueMs === 'number' && x.dueMs > nowMs && x.dueMs - nowMs <= maxWindowMs)
            .sort((a, b) => (a.dueMs ?? 0) - (b.dueMs ?? 0))
            .slice(0, maxCandidates);

          const candidatesFallback = normalized
            .slice()
            .sort((a, b) => {
              const ad = typeof a.dueMs === 'number' ? a.dueMs : -1;
              const bd = typeof b.dueMs === 'number' ? b.dueMs : -1;
              if (ad !== bd) return bd - ad;
              return String(a.id).localeCompare(String(b.id));
            })
            .slice(0, maxCandidates);

          const unique = new Set<string>();
          const candidates = [...candidatesThisMonth, ...candidatesRecentPast, ...candidatesNearFuture, ...candidatesFallback].filter((c) => {
            if (!c?.id) return false;
            if (unique.has(c.id)) return false;
            unique.add(c.id);
            return true;
          });

          if (candidates.length === 0) {
            const finalText = signedText(
              signature,
              `Olá, ${nameForChat}. Não foi possível localizar o boleto do mês para sua unidade. Entre em contato com a Administração.`,
            );
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
                meta: { superlogica: true, action: 'boleto_mes', unit_id: clientUnitId, not_found: true },
              },
            ]);
            await supabase
              .from('conversations')
              .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
              .eq('id', upsertedConv.id);
            handledByLookup = true;
          } else {
            let chosen: any = null;
            let link = '';
            for (const cand of candidates) {
              try {
                const candidateLink = await fetchSuperlogicaSegundaViaLink(cand.id);
                if (candidateLink) {
                  chosen = cand;
                  link = candidateLink;
                  break;
                }
                if (!chosen) chosen = cand;
              } catch {
                if (!chosen) chosen = cand;
              }
            }

            if (!link) {
              const finalText = signedText(
                signature,
                `Olá, ${nameForChat}. Não foi possível localizar um link pagável do boleto do mês. Entre em contato com a Administração.`,
              );
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
                    superlogica: true,
                    action: 'boleto_mes',
                    unit_id: clientUnitId,
                    id_recebimento_recb: chosen?.id || null,
                    empty_link: true,
                  },
                },
              ]);
              await supabase
                .from('conversations')
                .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
                .eq('id', upsertedConv.id);

              const adminPhone = getAdminForwardPhone();
              if (adminPhone) {
                const forward = signedText(
                  signature,
                  `Falha ao gerar link do boleto do mês.\nCliente: ${senderDisplayName}\nTelefone: ${phoneDigits}\nBloco: ${clientBlock || '-'}\nApto: ${clientApartment || '-'}\nUnidade: ${clientUnitId}\nID_RECEBIMENTO_RECB: ${chosen.id}`,
                );
                try {
                  await zapiFetch('POST', '/send-text', { phone: adminPhone, message: forward });
                } catch {
                }
              }

              handledByLookup = true;
            } else {
              const info = [
                'Segue o boleto do mês:',
                chosen?.due ? `Vencimento: ${chosen.due}` : '',
                chosen?.amount ? `Valor: ${chosen.amount}` : '',
                link,
              ]
                .filter(Boolean)
                .join('\n');
              const finalText = signedText(signature, info);
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
                    superlogica: true,
                    action: 'boleto_mes',
                    unit_id: clientUnitId,
                    id_recebimento_recb: chosen?.id || null,
                    due: chosen?.due || null,
                  },
                },
              ]);
              await supabase
                .from('conversations')
                .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
                .eq('id', upsertedConv.id);
              await supabase
                .from('clients')
                .update({ last_auto_reply_at: nowIso, last_auto_reply_to: messageId || null })
                .eq('phone', phoneDigits);
              handledByLookup = true;
            }
          }
        } catch {
          const replyBody = `Olá, ${nameForChat}. Tive um problema ao consultar seus boletos agora. Tente novamente em instantes.`;
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
                meta: { superlogica: true, action: 'boleto', unit_id: clientUnitId, error: true },
              },
            ]);
            await supabase
              .from('conversations')
              .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
              .eq('id', upsertedConv.id);
          } catch {
          }
          handledByLookup = true;
        }
      }
    }

    if (!handledByLookup && incomingText && isReservaIntent(incomingText)) {
      const reservaUrl = getReservaUrl();
      const lines: string[] = [];
      lines.push(`Olá, ${nameForChat}.`);
      if (reservaUrl) {
        lines.push('Para reservar ambientes, acesse o link abaixo:');
        lines.push(reservaUrl);
      }
      lines.push('Se preferir, me envie:');
      lines.push('1) Ambiente (ex: salão, churrasqueira, quadra)');
      lines.push('2) Data');
      lines.push('3) Horário (início e fim)');

      const finalText = signedText(signature, lines.join('\n'));
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
            meta: { action: 'reserva', ai: true },
          },
        ]);
        await supabase
          .from('conversations')
          .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
          .eq('id', upsertedConv.id);
      } catch {
      }

      handledByLookup = true;
    }

    if (!handledByLookup && incomingText && isRegimentoIntent(incomingText)) {
      const prompt =
        'Claro — me diga qual é a sua dúvida sobre a Convenção ou o Regimento Interno.\n\n' +
        'Você pode digitar ou enviar um áudio.\n\n' +
        'Se puder, informe: qual tema (barulho, obra, pet, vaga, piscina, multa, etc.) e o que aconteceu. Eu vou confirmar se entendi antes de responder.';
      const finalText = signedText(signature, prompt);

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
            meta: { action: 'docs_prompt', ai: true },
          },
        ]);
        await supabase
          .from('conversations')
          .update({ last_message: finalText, last_message_time: formatTimeHM(new Date()) })
          .eq('id', upsertedConv.id);
        await supabase
          .from('clients')
          .update({
            support_state: 'docs_wait_question',
            support_topic: 'regimento_convencao',
            support_started_at: new Date().toISOString(),
            support_payload: {},
          })
          .eq('phone', phoneDigits);
      } catch {
      }

      handledByLookup = true;
    }

    if (!handledByLookup && incomingText && isAdminIntent(incomingText)) {
      const adminPhone = getAdminForwardPhone();
      const ack = signedText(signature, 'Certo. Vou encaminhar sua mensagem para a Administração.');

      try {
        const resp: any = await zapiFetch('POST', '/send-text', { phone: phoneDigits, message: ack });
        const externalId = String(resp?.messageId ?? resp?.zaapId ?? resp?.id ?? '').trim();
        await supabase.from('messages').insert([
          {
            conversation_id: upsertedConv.id,
            text: ack,
            sender: 'user',
            timestamp: formatTimeHM(new Date()),
            status: 'sent',
            external_id: externalId || null,
            kind: 'text',
            meta: { action: 'admin', ai: true },
          },
        ]);
      } catch {
      }

      if (adminPhone) {
        const refreshed = await refreshClientUnitFromSuperlogica({
          supabase,
          phoneDigits,
          senderDisplayName,
          avatarUrl,
        });
        if (refreshed) {
          clientUnitId = refreshed.unitId;
          clientBlock = refreshed.block;
          clientApartment = refreshed.apartment;
        }

        const info = [
          `Cliente: ${senderDisplayName}`,
          `Telefone: ${phoneDigits}`,
          clientApartment ? `Apartamento: ${clientApartment}` : '',
          clientBlock ? `Bloco: ${clientBlock}` : '',
          clientUnitId ? `Unidade: ${clientUnitId}` : '',
          '',
          `Mensagem: ${incomingText}`,
        ]
          .filter(Boolean)
          .join('\n');
        const forwardText = signedText(signature, info);
        try {
          await zapiFetch('POST', '/send-text', { phone: adminPhone, message: forwardText });
        } catch {
        }
      }

      handledByLookup = true;
    }

    const shouldSendMenu =
      shouldAutoReply() &&
      incomingText &&
      !isMenuChoice(incomingText) &&
      !isBoletoIntent(incomingText) &&
      !isReservaIntent(incomingText) &&
      !isRegimentoIntent(incomingText) &&
      !isAdminIntent(incomingText);

    if (!handledByLookup && shouldSendMenu) {
      const now = Date.now();
      const lastAtMs = lastAutoReplyAt ? Date.parse(String(lastAutoReplyAt)) : NaN;
      const tooSoon = Number.isFinite(lastAtMs) ? now - lastAtMs < 5000 : false;
      const sameMessage = Boolean(messageId) && Boolean(lastAutoReplyTo) && lastAutoReplyTo === String(messageId);

      if (!tooSoon && !sameMessage) {
        const refreshed = await refreshClientUnitFromSuperlogica({
          supabase,
          phoneDigits,
          senderDisplayName,
          avatarUrl,
        });
        if (refreshed) {
          clientUnitId = refreshed.unitId;
          clientBlock = refreshed.block;
          clientApartment = refreshed.apartment;
        }

        let replyBody = '';

        if (!clientApartment || !clientBlock) {
          replyBody = `Olá, ${nameForChat}. Não consegui identificar seu apartamento e bloco automaticamente. Me informe seu bloco e apartamento para eu vincular seu acesso.`;
        } else {
          replyBody = buildWelcomeMenu({ name: nameForChat, apartment: clientApartment, block: clientBlock });
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

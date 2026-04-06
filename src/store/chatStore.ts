import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { zapi } from '@/lib/zapi';
import { fileToBase64 } from '@/utils/media';

const DEFAULT_SHARED_SECRET = 'rokzap_2026_03_29_a8d2b7c1f4e9';

export interface Conversation {
  id: string;
  contact_name: string;
  avatar_url: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  is_active: boolean;
  created_at?: string;
  phone?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  text: string;
  sender: 'user' | 'other';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  created_at?: string;
  kind?: string;
  meta?: Record<string, unknown>;
  client_id?: string;
  external_id?: string;
  local?: boolean;
}

function formatTime(value?: string) {
  if (!value) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function compareByCreatedAt(a: Message, b: Message) {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

async function ensureConversationId(phone: string) {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .upsert(
      {
        phone,
        contact_name: phone,
        avatar_url: null,
        last_message: '',
        last_message_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread_count: 0,
        is_active: true,
      },
      { onConflict: 'phone' },
    )
    .select('id')
    .single();

  if (convErr) throw convErr;
  return conv.id as string;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildPhoneLookupCandidates(value: string) {
  const raw = String(value ?? '').trim();
  const candidates: string[] = [];

  if (raw) candidates.push(raw);

  const withoutAt = raw.includes('@') ? raw.split('@')[0] : raw;
  if (withoutAt && withoutAt !== raw) candidates.push(withoutAt);

  const digits = raw.replace(/\D/g, '');
  if (digits && digits !== raw && digits !== withoutAt) candidates.push(digits);

  if (digits) {
    candidates.push(`${digits}@lid`);
    candidates.push(`${digits}@c.us`);
  }

  return Array.from(new Set(candidates));
}

function normalizePhone(value: string) {
  const raw = String(value ?? '').trim();
  const withoutAt = raw.includes('@') ? raw.split('@')[0] : raw;
  const digits = withoutAt.replace(/\D/g, '');
  return digits || withoutAt;
}

function normalizeExternalId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withoutAt = raw.includes('@') ? raw.split('@')[0] : raw;
  return withoutAt.trim();
}

function extractExternalMessageId(resp: any): string {
  const candidates = [
    resp?.messageId,
    resp?.zaapId,
    resp?.id,
    resp?.message?.id,
    resp?.data?.messageId,
    resp?.data?.zaapId,
    resp?.data?.id,
  ];

  for (const c of candidates) {
    const v = normalizeExternalId(c);
    if (v) return v;
  }
  return '';
}

function getZapiMessageText(msg: any): string | null {
  const text = msg?.text?.message ?? msg?.text ?? msg?.message ?? msg?.body ?? msg?.content;
  if (typeof text === 'string' && text.trim()) return text;

  const imageCaption = msg?.image?.caption;
  if (typeof imageCaption === 'string' && imageCaption.trim()) return imageCaption;
  if (msg?.image) return '📷 Imagem';

  const videoCaption = msg?.video?.caption;
  if (typeof videoCaption === 'string' && videoCaption.trim()) return videoCaption;
  if (msg?.video) return '🎥 Vídeo';

  if (msg?.audio) return '🎵 Áudio';

  const fileName = msg?.document?.fileName ?? msg?.document?.title;
  if (typeof fileName === 'string' && fileName.trim()) return `📄 ${fileName}`;
  if (msg?.document) return '📄 Documento';

  const sticker = msg?.sticker;
  if (sticker) return '🧩 Figurinha';

  const reaction = msg?.reaction;
  if (reaction) return 'Reação';

  return null;
}

function messageKey(m: Pick<Message, 'external_id' | 'id'>) {
  return m.external_id || m.id;
}

function isPlaceholderMessageText(text: unknown) {
  if (typeof text !== 'string') return true;
  const raw = text.trim().toLowerCase();
  const simplified = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!simplified) return true;

  if (simplified.includes('unsupported')) return true;

  const hasMensagem = /\bmensagem\b/.test(simplified) || raw.includes('mensagem');
  const hasSuport = simplified.includes('suport') || raw.includes('suport');
  if (!hasMensagem || !hasSuport) return false;

  const mentionsMedia =
    simplified.includes('midia') ||
    simplified.includes('media') ||
    /m.*dia/.test(raw) ||
    raw.includes('míd') ||
    raw.includes('m├');
  const mentionsNao = simplified.includes('nao') || /n.*o/.test(raw) || raw.includes('nã') || raw.includes('n├');

  return mentionsMedia || mentionsNao;
}

function preferMessage(a: Message, b: Message) {
  const aPlaceholder = isPlaceholderMessageText(a.text);
  const bPlaceholder = isPlaceholderMessageText(b.text);
  if (aPlaceholder && !bPlaceholder) return b;
  if (!aPlaceholder && bPlaceholder) return a;

  const aLocal = Boolean(a.local);
  const bLocal = Boolean(b.local);
  if (aLocal !== bLocal) {
    return aLocal ? b : a;
  }

  if ((b.text?.length ?? 0) > (a.text?.length ?? 0)) return b;
  return a;
}

interface ChatState {
  conversations: Conversation[];
  messages: Message[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  
  fetchConversations: (silent?: boolean) => Promise<void>;
  importContacts: () => Promise<{ imported: number }>;
  fetchMessages: (conversationId: string, silent?: boolean) => Promise<void>;
  setActiveConversation: (id: string) => void;
  sendMessage: (text: string) => Promise<void>;
  sendMedia: (
    kind: 'image' | 'sticker' | 'gif' | 'audio' | 'video' | 'ptv' | 'document',
    payload: { file: File; caption?: string },
  ) => Promise<void>;
  sendLink: (payload: { url: string; message?: string; title?: string; description?: string; image?: string }) => Promise<void>;
  sendLocation: (payload: { title: string; address: string; latitude: string; longitude: string }) => Promise<void>;
  sendContact: (payload: { contactName: string; contactPhone: string; contactBusinessDescription?: string }) => Promise<void>;
  sendContacts: (payload: { contacts: Array<{ name: string; phones: string[]; businessDescription?: string }> }) => Promise<void>;
  sendOptionList: (payload: { message: string; title: string; buttonLabel: string; options: Array<{ id?: string; title: string; description?: string }> }) => Promise<void>;
  sendButtonPix: (payload: { pixKey: string; type: string; merchantName?: string }) => Promise<void>;
  removeReaction: (messageExternalId: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  startRealtime: () => void;
  stopRealtime: () => void;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let realtimeChannel: any | null = null;
let realtimeScheduled: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(get: () => ChatState) {
  if (realtimeScheduled) return;
  realtimeScheduled = setTimeout(() => {
    realtimeScheduled = null;
    const { activeConversationId, fetchConversations, fetchMessages } = get();
    fetchConversations(true);
    if (activeConversationId) fetchMessages(activeConversationId, true);
  }, 400);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  isLoading: false,
  error: null,

  fetchConversations: async (silent = false) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      let zapiConversations: Conversation[] | null = null;

      try {
        const raw = await zapi.getChats();
        const zapiChats = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.chats) ? (raw as any).chats : [];

        if (zapiChats.length > 0) {
          const formattedConversations: Conversation[] = zapiChats.map((chat: any) => {
            const lastMessageTime = chat?.lastMessage?.timestamp
              ? new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const rawPhone = String(chat?.phone ?? chat?.id ?? '');
            const phone = normalizePhone(rawPhone);
            const name = String(chat?.name ?? phone);
            const avatarUrl =
              chat?.profilePictureUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

            return {
              id: phone,
              phone,
              contact_name: name,
              avatar_url: avatarUrl,
              last_message: String(chat?.lastMessage?.message ?? ''),
              last_message_time: lastMessageTime,
              unread_count: Number(chat?.unreadCount ?? 0),
              is_active: true,
            };
          });

          const uniqueById = new Map<string, Conversation>();
          for (const c of formattedConversations) {
            if (!c.id) continue;
            uniqueById.set(c.id, c);
          }
          zapiConversations = Array.from(uniqueById.values());
        }
      } catch {
      }

      let supabaseConversations: Conversation[] = [];
      try {
        const { data } = await supabase
          .from('conversations')
          .select('*')
          .order('created_at', { ascending: false });
        supabaseConversations = (data as Conversation[]) ?? [];
      } catch {
      }

      if (zapiConversations && zapiConversations.length > 0) {
        const keyOf = (c: Conversation) => {
          const p = normalizePhone(String((c as any)?.phone ?? ''));
          return p || String(c.id ?? '');
        };

        const merged = new Map<string, Conversation>();
        for (const c of zapiConversations) {
          const k = keyOf(c);
          if (!k) continue;
          merged.set(k, c);
        }

        for (const c of supabaseConversations) {
          const k = keyOf(c);
          if (!k) continue;
          const existing = merged.get(k);
          if (!existing) {
            merged.set(k, c);
            continue;
          }
          merged.set(k, {
            ...existing,
            phone: existing.phone || c.phone,
            contact_name: String(existing.contact_name ?? '').trim() ? existing.contact_name : c.contact_name,
            avatar_url: existing.avatar_url || c.avatar_url,
            last_message: String(existing.last_message ?? '').trim() ? existing.last_message : c.last_message,
            last_message_time: String(existing.last_message_time ?? '').trim() ? existing.last_message_time : c.last_message_time,
          });
        }

        const final = Array.from(merged.values());
        set({ conversations: final, isLoading: false });

        const currentActiveId = get().activeConversationId;
        if (!currentActiveId && final.length > 0) {
          set({ activeConversationId: final[0].id });
          get().fetchMessages(final[0].id);
        }
        return;
      }

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const convs = (data as Conversation[]) ?? [];
      const ids = convs.map((c) => c.id).filter(Boolean);
      let latestByConv = new Map<string, { text: string; created_at: string | null }>();

      if (ids.length > 0) {
        const { data: msgRows } = await supabase
          .from('messages')
          .select('conversation_id,text,created_at')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false })
          .limit(500);

        for (const row of (msgRows as any[]) ?? []) {
          const cid = String(row.conversation_id);
          if (latestByConv.has(cid)) continue;
          latestByConv.set(cid, { text: String(row.text ?? ''), created_at: row.created_at ?? null });
        }
      }

      const enriched = convs
        .map((c) => {
          const latest = latestByConv.get(c.id);
          const lastMessage = latest?.text ?? c.last_message ?? '';
          const lastTime = latest?.created_at ? formatTime(latest.created_at) : c.last_message_time ?? '';
          return { ...c, last_message: lastMessage, last_message_time: lastTime };
        })
        .sort((a, b) => {
          const la = latestByConv.get(a.id)?.created_at ?? a.created_at ?? null;
          const lb = latestByConv.get(b.id)?.created_at ?? b.created_at ?? null;
          const ta = la ? new Date(la).getTime() : 0;
          const tb = lb ? new Date(lb).getTime() : 0;
          return tb - ta;
        });

      set({ conversations: enriched, isLoading: false });
      
      // Auto-select first conversation if none selected
      const currentActiveId = get().activeConversationId;
      if (!currentActiveId && data && data.length > 0) {
        set({ activeConversationId: data[0].id });
        get().fetchMessages(data[0].id);
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  importContacts: async () => {
    set({ error: null });
    const raw = await zapi.getContacts();
    const contacts =
      Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any)?.contacts)
          ? (raw as any).contacts
          : Array.isArray((raw as any)?.data)
            ? (raw as any).data
            : [];

    const byPhone = new Map<string, { phone: string; contact_name: string; avatar_url: string | null }>();
    for (const c of contacts as any[]) {
      const phone = normalizePhone(String(c?.phone ?? c?.id ?? c?.number ?? ''));
      if (!phone || phone.length < 8) continue;
      const name = String(c?.vname ?? c?.notify ?? c?.short ?? c?.name ?? phone).trim() || phone;
      const avatar = typeof c?.imgUrl === 'string' && c.imgUrl.trim() ? String(c.imgUrl) : null;
      byPhone.set(phone, { phone, contact_name: name, avatar_url: avatar });
    }

    const rows = Array.from(byPhone.values()).map((c) => ({
      phone: c.phone,
      contact_name: c.contact_name,
      avatar_url: c.avatar_url,
      last_message: '',
      last_message_time: '',
      unread_count: 0,
      is_active: true,
    }));

    if (rows.length === 0) return { imported: 0 };

    const { error } = await supabase
      .from('conversations')
      .upsert(rows as any, { onConflict: 'phone' });

    if (error) {
      set({ error: error.message });
      throw error;
    }

    await get().fetchConversations(true);
    return { imported: rows.length };
  },

  fetchMessages: async (conversationId: string, silent = false) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      let convId = conversationId;

      if (!isUuid(convId)) {
        const candidates = buildPhoneLookupCandidates(convId);
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .in('phone', candidates)
          .limit(1)
          .maybeSingle();

        if (conv?.id) {
          convId = conv.id;
        } else {
          const phone = normalizePhone(convId);
          const { data: created, error: createErr } = await supabase
            .from('conversations')
            .upsert(
              {
                phone,
                contact_name: phone,
                avatar_url: null,
                last_message: '',
                last_message_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                unread_count: 0,
                is_active: true,
              },
              { onConflict: 'phone' },
            )
            .select('id')
            .single();

          if (createErr) throw createErr;
          convId = created.id;
        }
      }

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const ordered = ((data as any[]) ?? [])
        .map((m) => {
          const createdAt = typeof m.created_at === 'string' ? m.created_at : undefined;
          return {
            id: String(m.id),
            conversation_id: String(m.conversation_id),
            text: String(m.text ?? ''),
            sender: m.sender === 'user' ? 'user' : 'other',
            timestamp: formatTime(createdAt),
            status: (m.status as any) ?? 'sent',
            created_at: createdAt,
            external_id: m.external_id ? String(m.external_id) : undefined,
            kind: typeof m.kind === 'string' ? m.kind : 'text',
            meta: (m.meta && typeof m.meta === 'object' ? m.meta : {}) as Record<string, unknown>,
          } as Message;
        })
        .filter((m) => !(m.kind === 'text' && isPlaceholderMessageText(m.text)));
      const existing = get().messages.filter((m) => m.conversation_id === conversationId || m.conversation_id === convId);
      const keepLocal = existing.filter((m) => m.local);

      const merged = new Map<string, Message>();
      for (const m of ordered) {
        const k = messageKey(m);
        const prev = merged.get(k);
        merged.set(k, prev ? preferMessage(prev, m) : m);
      }
      for (const m of keepLocal) {
        const k = messageKey(m);
        const prev = merged.get(k);
        merged.set(k, prev ? preferMessage(prev, m) : m);
      }

      const finalMessages = Array.from(merged.values()).sort(compareByCreatedAt);
      set({ messages: finalMessages, isLoading: false });
      return;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  setActiveConversation: (id: string) => {
    set({ activeConversationId: id });
    get().fetchMessages(id);
  },

  sendMessage: async (text: string) => {
    const { activeConversationId, messages, conversations } = get();
    if (!activeConversationId || !text.trim()) return;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);
    
    const tempId = `temp-${Date.now()}`;
    const newMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'text',
      meta: {},
    };

    set({ messages: [...messages, newMessage] });

    try {
      const resp: any = await zapi.sendText(phone, text);
      const externalId = extractExternalMessageId(resp);
      if (externalId) {
        set({
          messages: get().messages.map((m) =>
            m.id === tempId ? { ...m, id: externalId, external_id: externalId } : m,
          ),
        });
      }

      set({
        conversations: get().conversations.map((c) =>
          c.id === activeConversationId || c.id === convId ? { ...c, last_message: text, last_message_time: timeString } : c,
        ),
      });

      try {
        await supabase.from('messages').insert([
          {
            conversation_id: convId,
            text,
            sender: 'user',
            timestamp: timeString,
            status: 'sent',
            external_id: externalId || null,
            kind: 'text',
            meta: {},
          },
        ]);

        await supabase
          .from('conversations')
          .update({ last_message: text, last_message_time: timeString })
          .eq('id', convId);
      } catch {
      }

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter(m => m.id !== tempId) });
      throw error;
    }
  },

  sendMedia: async (kind, payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;
    const file = payload.file;
    if (!file) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();

    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tempUrl = URL.createObjectURL(file);
    const caption = payload.caption?.trim() || '';

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: caption,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind,
      meta: { url: tempUrl, caption, fileName: file.name, mimeType: file.type, uploading: true },
    };

    set({ messages: [...get().messages, localMessage] });

    let shouldRevokeTempUrl = true;

    try {
      let url: string | null = null;
      let uploadedSize: number | undefined;
      let uploadedPath: string | undefined;
      let uploadedBucket: string | undefined;
      let preview: string | null = null;

      const prefersSignedUpload = file.size > 1_000_000 || kind === 'document' || kind === 'video' || kind === 'ptv' || kind === 'audio';

      if (prefersSignedUpload) {
        const signedRes = await fetch('/api/media/signed-upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': DEFAULT_SHARED_SECRET },
          credentials: 'include',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            folder: `zapi/${phone}`,
            bucket: 'chat-media',
          }),
        });
        const signedJson = await signedRes.json().catch(() => null);
        if (!signedRes.ok || !signedJson?.ok) {
          const reason = String(signedJson?.reason ?? 'signed_upload_failed');
          if (reason === 'unauthorized') throw new Error('Sem permissão para upload. Faça login no sistema novamente.');
          if (reason === 'missing_server_env') {
            throw new Error('Upload não configurado no servidor (Vercel). Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
          }
          throw new Error(reason);
        }

        const token = String(signedJson.data?.token ?? '');
        const path = String(signedJson.data?.path ?? '');
        const bucket = String(signedJson.data?.bucket ?? 'chat-media');
        const publicUrl = String(signedJson.data?.publicUrl ?? '');
        if (!token || !path || !publicUrl) throw new Error('signed_upload_failed');

        const { data: uploaded, error: uploadErr } = await supabase.storage
          .from(bucket)
          .uploadToSignedUrl(path, token, file, { contentType: file.type, upsert: true });

        if (uploadErr || !uploaded?.path) throw new Error('upload_failed');

        url = publicUrl;
        uploadedPath = path;
        uploadedBucket = bucket;
        uploadedSize = file.size;
      } else {
        const rawBase64 = await fileToBase64(file);
        const mime = file.type || 'application/octet-stream';
        preview = `data:${mime};base64,${rawBase64}`;
        url = null;
      }

      const mediaRef = url ?? preview;
      if (!mediaRef) throw new Error('Falha no envio do arquivo');

      const localPreview =
        kind === 'image' || kind === 'sticker' || kind === 'gif'
          ? preview
          : kind === 'video' || kind === 'ptv' || kind === 'audio'
            ? tempUrl
            : null;

      if (localPreview === tempUrl) shouldRevokeTempUrl = false;

      set({
        messages: get().messages.map((m) =>
          m.id === tempId
            ? {
                ...m,
                meta: {
                  ...(m.meta ?? {}),
                  url: url ?? undefined,
                  preview: localPreview ?? undefined,
                  uploading: false,
                  size: uploadedSize,
                  path: uploadedPath,
                  bucket: uploadedBucket,
                },
              }
            : m,
        ),
      });

      let resp: any = null;
      if (kind === 'image') resp = await zapi.sendImage(phone, mediaRef, caption ? { caption } : undefined);
      if (kind === 'sticker') resp = await zapi.sendSticker(phone, mediaRef);
      if (kind === 'gif') resp = await zapi.sendGif(phone, mediaRef, caption ? { caption } : undefined);
      if (kind === 'audio') resp = await zapi.sendAudio(phone, mediaRef, { waveform: true });
      if (kind === 'video') resp = await zapi.sendVideo(phone, mediaRef, caption ? { caption } : undefined);
      if (kind === 'ptv') resp = await zapi.sendPtv(phone, mediaRef);
      if (kind === 'document') {
        const ext = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
        resp = await zapi.sendDocument(phone, mediaRef, ext || 'pdf', {
          fileName: file.name,
          ...(caption ? { caption } : {}),
        });
      }

      const externalId = extractExternalMessageId(resp);

      set({
        messages: get().messages.map((m) =>
          m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m,
        ),
      });

      const lastMessage =
        kind === 'image'
          ? caption || '📷 Foto'
          : kind === 'sticker'
            ? '🧩 Figurinha'
            : kind === 'gif'
              ? caption || 'GIF'
              : kind === 'audio'
                ? '🎵 Áudio'
                : kind === 'video'
                  ? caption || '🎥 Vídeo'
                  : kind === 'ptv'
                    ? '🎥 PTV'
                    : caption || `📄 ${file.name}`;

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: caption || lastMessage,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind,
          meta: {
            ...(url ? { url } : {}),
            ...(!url && preview && (kind === 'image' || kind === 'sticker' || kind === 'gif') && file.size <= 200_000 ? { preview } : {}),
            caption,
            fileName: file.name,
            mimeType: file.type,
            size: uploadedSize ?? file.size,
            ...(uploadedPath ? { path: uploadedPath } : {}),
            ...(uploadedBucket ? { bucket: uploadedBucket } : {}),
          },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: lastMessage, last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    } finally {
      try {
        if (shouldRevokeTempUrl) URL.revokeObjectURL(tempUrl);
      } catch {
      }
    }
  },

  sendLink: async (payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);

    const url = payload.url.trim();
    const title = payload.title?.trim() || url;
    const description = payload.description?.trim() || '';
    const image = payload.image?.trim() || '';
    const message = (payload.message?.trim() || title).replace(/\s+$/g, '');
    const finalMessage = message.endsWith(url) ? message : `${message} ${url}`;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: finalMessage,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'link',
      meta: { url, title, description, image },
    };

    set({ messages: [...get().messages, localMessage] });

    try {
      const resp: any = await zapi.sendLink({
        phone,
        message: finalMessage,
        image: image || 'https://ui-avatars.com/api/?name=Link&background=random',
        linkUrl: url,
        title,
        linkDescription: description || url,
        linkType: 'SMALL',
      });

      const externalId = extractExternalMessageId(resp);

      set({
        messages: get().messages.map((m) => (m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m)),
      });

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: finalMessage,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'link',
          meta: { url, title, description, image },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: '🔗 Link', last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    }
  },

  sendLocation: async (payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);
    const title = payload.title.trim();
    const address = payload.address.trim();
    const latitude = payload.latitude.trim();
    const longitude = payload.longitude.trim();
    if (!title || !address || !latitude || !longitude) {
      const err = new Error('Campos obrigatórios: título, endereço, latitude e longitude');
      set({ error: err.message });
      throw err;
    }

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: title,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'location',
      meta: { title, address, latitude, longitude },
    };

    set({ messages: [...get().messages, localMessage] });

    try {
      const resp: any = await zapi.sendLocation({ phone, title, address, latitude, longitude });
      const externalId = extractExternalMessageId(resp);
      set({
        messages: get().messages.map((m) => (m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m)),
      });

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: title,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'location',
          meta: { title, address, latitude, longitude },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: '📍 Localização', last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    }
  },

  sendContact: async (payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);
    const contactName = payload.contactName.trim();
    const contactPhone = normalizePhone(payload.contactPhone);
    const contactBusinessDescription = payload.contactBusinessDescription?.trim() || '';
    if (!contactName || !contactPhone) {
      const err = new Error('Campos obrigatórios: nome e telefone do contato');
      set({ error: err.message });
      throw err;
    }

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: contactName,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'contact',
      meta: { contactName, contactPhone, contactBusinessDescription },
    };

    set({ messages: [...get().messages, localMessage] });

    try {
      const resp: any = await zapi.sendContact({
        phone,
        contactName,
        contactPhone,
        ...(contactBusinessDescription ? { contactBusinessDescription } : {}),
      });
      const externalId = extractExternalMessageId(resp);
      set({
        messages: get().messages.map((m) => (m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m)),
      });

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: contactName,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'contact',
          meta: { contactName, contactPhone, ...(contactBusinessDescription ? { contactBusinessDescription } : {}) },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: '👤 Contato', last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    }
  },

  sendContacts: async (payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    if (contacts.length === 0) {
      const err = new Error('Adicione pelo menos um contato');
      set({ error: err.message });
      throw err;
    }

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: `${contacts.length} contato(s)`,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'contacts',
      meta: { contacts },
    };

    set({ messages: [...get().messages, localMessage] });

    try {
      const resp: any = await zapi.sendContacts({ phone, contacts });
      const externalId = extractExternalMessageId(resp);
      set({
        messages: get().messages.map((m) => (m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m)),
      });

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: `${contacts.length} contato(s)`,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'contacts',
          meta: { contacts },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: '👥 Contatos', last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    }
  },

  sendOptionList: async (payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);
    const message = payload.message.trim();
    const title = payload.title.trim();
    const buttonLabel = payload.buttonLabel.trim();
    const options = Array.isArray(payload.options) ? payload.options : [];
    if (!message || !title || !buttonLabel || options.length === 0) {
      const err = new Error('Preencha mensagem, título, botão e opções');
      set({ error: err.message });
      throw err;
    }

    const optionList = { title, buttonLabel, options };

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: message,
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'option_list',
      meta: { optionList },
    };

    set({ messages: [...get().messages, localMessage] });

    try {
      const resp: any = await zapi.sendOptionList({ phone, message, optionList });
      const externalId = extractExternalMessageId(resp);
      set({
        messages: get().messages.map((m) => (m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m)),
      });

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: message,
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'option_list',
          meta: { optionList },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: '📋 Lista de opções', last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    }
  },

  sendButtonPix: async (payload) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) {
      const err = new Error('Conversa sem telefone para envio');
      set({ error: err.message });
      throw err;
    }

    const convId = isUuid(activeConversationId) ? activeConversationId : await ensureConversationId(phone);
    const pixKey = payload.pixKey.trim();
    const type = payload.type.trim();
    const merchantName = payload.merchantName?.trim() || '';
    if (!pixKey || !type) {
      const err = new Error('Campos obrigatórios: chave Pix e tipo');
      set({ error: err.message });
      throw err;
    }

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const createdAt = now.toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const localMessage: Message = {
      id: tempId,
      client_id: tempId,
      conversation_id: convId,
      text: merchantName || 'Pix',
      sender: 'user',
      timestamp: timeString,
      status: 'sent',
      local: true,
      created_at: createdAt,
      kind: 'pix',
      meta: { pixKey, type, ...(merchantName ? { merchantName } : {}) },
    };

    set({ messages: [...get().messages, localMessage] });

    try {
      const resp: any = await zapi.sendButtonPix({ phone, pixKey, type, ...(merchantName ? { merchantName } : {}) });
      const externalId = extractExternalMessageId(resp);
      set({
        messages: get().messages.map((m) => (m.id === tempId ? { ...m, external_id: externalId || m.external_id } : m)),
      });

      await supabase.from('messages').insert([
        {
          conversation_id: convId,
          text: merchantName || 'Pix',
          sender: 'user',
          timestamp: timeString,
          status: 'sent',
          external_id: externalId || null,
          kind: 'pix',
          meta: { pixKey, type, ...(merchantName ? { merchantName } : {}) },
        },
      ]);

      await supabase
        .from('conversations')
        .update({ last_message: 'Pix', last_message_time: timeString })
        .eq('id', convId);

      get().fetchMessages(convId, true);
    } catch (error: any) {
      set({ error: error.message });
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw error;
    }
  },

  removeReaction: async (messageExternalId: string) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;
    const conversation = conversations.find((c) => c.id === activeConversationId);
    const phone = normalizePhone(conversation?.phone ?? activeConversationId);
    if (!phone) return;
    if (!messageExternalId) return;
    await zapi.removeReaction(phone, messageExternalId);
  },

  startPolling: () => {
    if (pollingInterval) return;
    pollingInterval = setInterval(() => {
      const { activeConversationId, fetchConversations, fetchMessages } = get();
      fetchConversations(true);
      if (activeConversationId) {
        fetchMessages(activeConversationId, true);
      }
    }, 5000);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },

  startRealtime: () => {
    if (realtimeChannel) return;
    realtimeChannel = supabase
      .channel('realtime-chat')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => scheduleRefresh(get),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => scheduleRefresh(get),
      )
      .subscribe();
  },

  stopRealtime: () => {
    if (realtimeScheduled) {
      clearTimeout(realtimeScheduled);
      realtimeScheduled = null;
    }
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  },
}));

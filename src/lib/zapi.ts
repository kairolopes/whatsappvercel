import { ZapiClient, createZapiApi, type ZapiClientConfig, type ZapiSendResponse } from './zapi/index';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export const ZAPI_INSTANCE = import.meta.env.VITE_ZAPI_INSTANCE;
export const ZAPI_TOKEN = import.meta.env.VITE_ZAPI_TOKEN;
export const ZAPI_CLIENT_TOKEN = import.meta.env.VITE_ZAPI_CLIENT_TOKEN;

const ALLOW_DIRECT = false;

function getFrontendConfig(): ZapiClientConfig | null {
  if (!ALLOW_DIRECT) return null;
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) return null;
  return { instanceId: ZAPI_INSTANCE, token: ZAPI_TOKEN, clientToken: ZAPI_CLIENT_TOKEN };
}

async function buildAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const condominioId = useAuthStore.getState().activeCondominioId;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  if (!condominioId) throw new Error('Selecione um condomínio para continuar.');
  return {
    authorization: `Bearer ${token}`,
    'x-condominio-id': condominioId,
  } as Record<string, string>;
}

async function apiFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const authHeaders = await buildAuthHeaders();
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ? (init.headers as any) : {}),
      ...authHeaders,
    },
  });
  const json = await res.json().catch(() => null);

  const formatDetails = (details: unknown) => {
    if (!details) return '';
    if (typeof details === 'string') return details;
    if (typeof details === 'object') {
      const anyDetails = details as any;
      const msg = anyDetails?.error ?? anyDetails?.message ?? anyDetails?.details;
      if (typeof msg === 'string' && msg.trim()) return msg;
      try {
        return JSON.stringify(details);
      } catch {
        return String(details);
      }
    }
    return String(details);
  };

  if (!res.ok || !json?.ok) {
    const base = json?.message || json?.reason || 'Erro Z-API';
    const details = formatDetails(json?.details);
    throw new Error(details ? `${base}: ${details}` : base);
  }
  return json.data as T;
}

async function apiGet<T>(path: string): Promise<T> {
  return apiFetchJson<T>(path);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const directConfig = getFrontendConfig();
const directApi = directConfig ? createZapiApi(new ZapiClient(directConfig)) : null;

export const zapi = {
  getChats: () => (directApi ? directApi.chats.getChats() : apiGet('/api/zapi/chats')),
  getChatMessages: (phone: string) =>
    directApi ? directApi.chats.getChatMessages(phone) : apiGet(`/api/zapi/chat-messages?phone=${encodeURIComponent(phone)}`),
  getContacts: () => (directApi ? directApi.contacts.getAll() : apiGet('/api/zapi/contacts')),
  sendText: (phone: string, message: string, opts?: any): Promise<ZapiSendResponse> =>
    directApi
      ? directApi.messages.sendText(phone, message, opts)
      : apiPost('/api/zapi/send-text', { phone, message, opts }),
  sendImage: (phone: string, image: string, opts?: any) =>
    directApi ? directApi.messages.sendImage(phone, image, opts) : apiPost('/api/zapi/send-image', { phone, image, opts }),
  sendSticker: (phone: string, sticker: string, opts?: any) =>
    directApi ? directApi.messages.sendSticker(phone, sticker, opts) : apiPost('/api/zapi/send-sticker', { phone, sticker, opts }),
  sendGif: (phone: string, gif: string, opts?: any) =>
    directApi ? directApi.messages.sendGif(phone, gif, opts) : apiPost('/api/zapi/send-gif', { phone, gif, opts }),
  sendVideo: (phone: string, video: string, opts?: any) =>
    directApi ? directApi.messages.sendVideo(phone, video, opts) : apiPost('/api/zapi/send-video', { phone, video, opts }),
  sendPtv: (phone: string, ptv: string, opts?: any) =>
    directApi ? directApi.messages.sendPtv(phone, ptv, opts) : apiPost('/api/zapi/send-ptv', { phone, ptv, opts }),
  sendAudio: (phone: string, audio: string, opts?: any) =>
    directApi ? directApi.messages.sendAudio(phone, audio, opts) : apiPost('/api/zapi/send-audio', { phone, audio, opts }),
  sendDocument: (phone: string, document: string, extension: string, opts?: any) =>
    directApi
      ? directApi.messages.sendDocument(phone, document, extension, opts)
      : apiPost('/api/zapi/send-document', { phone, document, extension, opts }),
  sendLink: (body: any) => (directApi ? directApi.messages.sendLink(body) : apiPost('/api/zapi/send-link', body)),

  sendLocation: (body: any) =>
    directApi ? directApi.messages.sendLocation(body) : apiPost('/api/zapi/send-location', body),
  sendContact: (body: any) =>
    directApi ? directApi.messages.sendContact(body) : apiPost('/api/zapi/send-contact', body),
  sendContacts: (body: any) =>
    directApi ? directApi.messages.sendContacts(body) : apiPost('/api/zapi/send-contacts', body),
  sendOptionList: (body: any) =>
    directApi ? directApi.messages.sendOptionList(body) : apiPost('/api/zapi/send-option-list', body),
  sendButtonPix: (body: any) =>
    directApi ? directApi.messages.sendButtonPix(body) : apiPost('/api/zapi/send-button-pix', body),
  removeReaction: (phone: string, messageId: string) =>
    directApi
      ? directApi.messages.removeReaction(phone, messageId)
      : apiPost('/api/zapi/send-remove-reaction', { phone, messageId }),
  request: (method: string, path: string, data?: unknown) => apiPost('/api/zapi/request', { method, path, data }),

  forwardMessage: (phone: string, messageId: string) => apiPost('/api/zapi/forward-message', { phone, messageId }),
  updateAutoReadStatus: (value: boolean) =>
    apiFetchJson('/api/zapi/update-auto-read-status', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  updateProfilePicture: (value: string) =>
    apiFetchJson('/api/zapi/profile-picture', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  updateProfileName: (value: string) =>
    apiFetchJson('/api/zapi/profile-name', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  updateProfileDescription: (value: string) =>
    apiFetchJson('/api/zapi/profile-description', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    }),

  setReadReceipts: (value: 'enable' | 'disable' | boolean) =>
    apiPost('/api/zapi/set-read-receipts', {
      value: value === true ? 'enable' : value === false ? 'disable' : value,
    }),
};

import type {
  ZapiChat,
  ZapiSendAudioOptions,
  ZapiSendDocumentOptions,
  ZapiSendGifOptions,
  ZapiSendImageOptions,
  ZapiSendLocationBody,
  ZapiSendLinkBody,
  ZapiSendContactBody,
  ZapiSendContactsBody,
  ZapiSendOptionListBody,
  ZapiSendButtonPixBody,
  ZapiSendPtvOptions,
  ZapiSendResponse,
  ZapiSendStickerOptions,
  ZapiSendTextOptions,
  ZapiSendVideoOptions,
} from './types';
import { ZapiClient } from './client';

export function createZapiApi(client: ZapiClient) {
  return {
    messages: {
      sendText: (phone: string, message: string, opts?: ZapiSendTextOptions) =>
        client.post<ZapiSendResponse>('/send-text', { phone, message, ...opts }),

      sendImage: (
        phone: string,
        image: string,
        opts?: ZapiSendImageOptions,
      ) => client.post<ZapiSendResponse>('/send-image', { phone, image, ...opts }),

      sendSticker: (phone: string, sticker: string, opts?: ZapiSendStickerOptions) =>
        client.post<ZapiSendResponse>('/send-sticker', { phone, sticker, ...opts }),

      sendGif: (phone: string, gif: string, opts?: ZapiSendGifOptions) =>
        client.post<ZapiSendResponse>('/send-gif', { phone, gif, ...opts }),

      sendVideo: (
        phone: string,
        video: string,
        opts?: ZapiSendVideoOptions,
      ) => client.post<ZapiSendResponse>('/send-video', { phone, video, ...opts }),

      sendPtv: (phone: string, ptv: string, opts?: ZapiSendPtvOptions) =>
        client.post<ZapiSendResponse>('/send-ptv', { phone, ptv, ...opts }),

      sendAudio: (
        phone: string,
        audio: string,
        opts?: ZapiSendAudioOptions,
      ) => client.post<ZapiSendResponse>('/send-audio', { phone, audio, ...opts }),

      sendDocument: (
        phone: string,
        document: string,
        extension: string,
        opts?: ZapiSendDocumentOptions,
      ) => client.post<ZapiSendResponse>(`/send-document/${encodeURIComponent(extension)}`, { phone, document, ...opts }),

      sendLink: (body: ZapiSendLinkBody) => client.post<ZapiSendResponse>('/send-link', body),

      sendLocation: (body: ZapiSendLocationBody) => client.post<ZapiSendResponse>('/send-location', body),

      sendContact: (body: ZapiSendContactBody) => client.post<ZapiSendResponse>('/send-contact', body),

      sendContacts: (body: ZapiSendContactsBody) => client.post<ZapiSendResponse>('/send-contacts', body),

      sendOptionList: (body: ZapiSendOptionListBody) => client.post<ZapiSendResponse>('/send-option-list', body),

      sendButtonPix: (body: ZapiSendButtonPixBody) => client.post<ZapiSendResponse>('/send-button-pix', body),

      removeReaction: (phone: string, messageId: string) =>
        client.post<ZapiSendResponse>('/send-remove-reaction', { phone, messageId }),

      forwardMessage: (phone: string, messageId: string) =>
        client.post<any>('/forward-message', { phone, messageId }),
    },

    chats: {
      getChats: () => client.get<ZapiChat[] | { chats: ZapiChat[] }>('/chats'),
      getChatMessages: (phone: string) => client.get<any>(`/chat-messages/${encodeURIComponent(phone)}`),
    },

    webhooks: {
      updateReceived: (value: string) => client.put<any>('/update-webhook-received', { value }),
      updateReceivedDelivery: (value: string) => client.put<any>('/update-webhook-received-delivery', { value }),
      updateMessageStatus: (value: string) => client.put<any>('/update-webhook-message-status', { value }),
    },

    instance: {
      getStatus: () => client.get<any>('/status'),
      getQrCode: () => client.get<any>('/qr-code'),

      updateAutoReadStatus: (value: boolean) => client.put<any>('/update-auto-read-status', { value }),
      updateProfilePicture: (value: string) => client.put<any>('/profile-picture', { value }),
      updateProfileName: (value: string) => client.put<any>('/profile-name', { value }),
      updateProfileDescription: (value: string) => client.put<any>('/profile-description', { value }),
    },

    privacy: {
      setReadReceipts: (value: 'enable' | 'disable') =>
        client.post<any>(`/privacy/read-receipts?value=${encodeURIComponent(value)}`, {}),
    },

    groups: {
      create: (name: string, phones: string[]) => client.post<any>('/create-group', { name, phones }),
      addParticipant: (groupId: string, phone: string) =>
        client.post<any>(`/add-participant/${encodeURIComponent(groupId)}`, { phone }),
      removeParticipant: (groupId: string, phone: string) =>
        client.post<any>(`/remove-participant/${encodeURIComponent(groupId)}`, { phone }),
      getGroups: () => client.get<any>('/groups'),
    },

    contacts: {
      getAll: () => client.get<any>('/contacts'),
      get: (phone: string) => client.get<any>(`/contact/${encodeURIComponent(phone)}`),
    },

    raw: {
      get: <T>(path: string) => client.get<T>(path),
      post: <T>(path: string, body: unknown) => client.post<T>(path, body),
      put: <T>(path: string, body: unknown) => client.put<T>(path, body),
    },
  };
}

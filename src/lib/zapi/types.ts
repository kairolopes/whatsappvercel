export type ZapiMessageStatus = 'PENDING' | 'SENT' | 'RECEIVED' | 'READ' | 'PLAYED' | string;

export interface ZapiSendResponse {
  zaapId?: string;
  messageId?: string;
  [key: string]: unknown;
}

export interface ZapiSendTextOptions {
  delayMessage?: number;
  delayTyping?: number;
  editMessageId?: string;
  messageId?: string;
}

export interface ZapiSendImageOptions {
  caption?: string;
  messageId?: string;
  delayMessage?: number;
  viewOnce?: boolean;
}

export interface ZapiSendStickerOptions {
  messageId?: string;
  delayMessage?: number;
  stickerAuthor?: string;
}

export interface ZapiSendGifOptions {
  caption?: string;
  messageId?: string;
  delayMessage?: number;
}

export interface ZapiSendAudioOptions {
  messageId?: string;
  delayMessage?: number;
  viewOnce?: boolean;
  async?: boolean;
  waveform?: boolean;
}

export interface ZapiSendVideoOptions {
  caption?: string;
  messageId?: string;
  delayMessage?: number;
  viewOnce?: boolean;
  async?: boolean;
}

export interface ZapiSendPtvOptions {
  messageId?: string;
  delayMessage?: number;
}

export interface ZapiSendDocumentOptions {
  fileName?: string;
  caption?: string;
  messageId?: string;
  delayMessage?: number;
  editDocumentMessageId?: string;
}

export interface ZapiSendLinkBody {
  phone: string;
  message: string;
  image: string;
  linkUrl: string;
  title: string;
  linkDescription: string;
  messageId?: string;
  delayMessage?: number;
  delayTyping?: number;
  linkType?: 'SMALL' | 'MEDIUM' | 'LARGE' | string;
}

export interface ZapiSendLocationBody {
  phone: string;
  title: string;
  address: string;
  latitude: string;
  longitude: string;
  messageId?: string;
  delayMessage?: number;
}

export interface ZapiSendContactBody {
  phone: string;
  contactName: string;
  contactPhone: string;
  contactBusinessDescription?: string;
  messageId?: string;
  delayMessage?: number;
}

export interface ZapiSendContactsBody {
  phone: string;
  contacts: Array<{
    name: string;
    phones: string[];
    businessDescription?: string;
  }>;
  messageId?: string;
  delayMessage?: number;
}

export interface ZapiSendOptionListBody {
  phone: string;
  message: string;
  optionList: {
    title: string;
    buttonLabel: string;
    options: Array<{
      id?: string;
      title: string;
      description?: string;
    }>;
  };
  delayMessage?: number;
}

export interface ZapiSendButtonPixBody {
  phone: string;
  pixKey: string;
  type: 'EVP' | 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | string;
  merchantName?: string;
}

export interface ZapiChat {
  phone: string;
  name?: string;
  unreadCount?: number;
  profilePictureUrl?: string;
  lastMessage?: {
    message?: string;
    timestamp?: number;
  };
  [key: string]: unknown;
}

export interface ZapiWebhookReceivedPayload {
  type?: string;
  phone?: string;
  fromMe?: boolean;
  messageId?: string;
  status?: ZapiMessageStatus;
  momment?: number;
  photo?: string;
  contact?: { displayName?: string };
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string; thumbnailUrl?: string; mimeType?: string };
  document?: { documentUrl?: string; fileName?: string; title?: string; mimeType?: string };
  audio?: { audioUrl?: string; mimeType?: string };
  video?: { videoUrl?: string; caption?: string; mimeType?: string };
  [key: string]: unknown;
}

export interface ZapiClientConfig {
  instanceId: string;
  token: string;
  clientToken: string;
  baseUrl?: string;
}

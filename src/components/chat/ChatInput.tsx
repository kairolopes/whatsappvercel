import { Smile, Paperclip, Mic, Send, Image as ImageIcon, FileText, Sticker, Film, Video, Link as LinkIcon, X, MapPin, User, Users, ListOrdered, BadgeDollarSign } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { useChatStore } from '@/store/chatStore';
import { prettyBytes } from '@/utils/media';
import { LocationPickerModal } from '@/components/chat/LocationPickerModal';

type MediaKind = 'image' | 'sticker' | 'gif' | 'audio' | 'video' | 'ptv' | 'document';

export function ChatInput() {
  const [message, setMessage] = useState('');
  const sendMessage = useChatStore((state) => state.sendMessage);
  const sendMedia = useChatStore((state) => state.sendMedia);
  const sendLink = useChatStore((state) => state.sendLink);
  const sendLocation = useChatStore((state) => state.sendLocation);
  const sendContact = useChatStore((state) => state.sendContact);
  const sendContacts = useChatStore((state) => state.sendContacts);
  const sendOptionList = useChatStore((state) => state.sendOptionList);
  const sendButtonPix = useChatStore((state) => state.sendButtonPix);

  const [attachOpen, setAttachOpen] = useState(false);
  const attachRef = useRef<HTMLDivElement>(null);

  const [media, setMedia] = useState<{ kind: MediaKind; file: File; previewUrl: string; caption: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkPreview, setLinkPreview] = useState<{ title: string; description: string; image: string; domain: string } | null>(null);

  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSending, setLocationSending] = useState(false);

  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsRows, setContactsRows] = useState<Array<{ name: string; phone: string; businessDescription: string }>>([
    { name: '', phone: '', businessDescription: '' },
  ]);

  const [optionListOpen, setOptionListOpen] = useState(false);
  const [optionListMessage, setOptionListMessage] = useState('');
  const [optionListTitle, setOptionListTitle] = useState('');
  const [optionListButtonLabel, setOptionListButtonLabel] = useState('Abrir lista de opções');
  const [optionListOptions, setOptionListOptions] = useState<Array<{ id: string; title: string; description: string }>>([
    { id: '1', title: '', description: '' },
  ]);

  const [pixOpen, setPixOpen] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState<'EVP' | 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL'>('EVP');
  const [pixMerchantName, setPixMerchantName] = useState('');

  const fileInputs = {
    image: useRef<HTMLInputElement>(null),
    sticker: useRef<HTMLInputElement>(null),
    gif: useRef<HTMLInputElement>(null),
    audio: useRef<HTMLInputElement>(null),
    video: useRef<HTMLInputElement>(null),
    ptv: useRef<HTMLInputElement>(null),
    document: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!attachOpen) return;
      if (!attachRef.current) return;
      if (attachRef.current.contains(e.target as Node)) return;
      setAttachOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [attachOpen]);

  const canSend = message.trim().length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      try {
        await sendMessage(message.trim());
        setMessage('');
      } catch {
        const msg = useChatStore.getState().error || 'Falha ao enviar';
        window.alert(msg);
      }
    }
  };

  const acceptByKind: Record<MediaKind, string> = useMemo(
    () => ({
      image: 'image/*,video/*',
      sticker: 'image/webp,image/*',
      gif: 'video/mp4',
      audio: 'audio/*',
      video: 'video/*',
      ptv: 'video/*',
      document:
        '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/x-7z-compressed,application/x-rar-compressed,application/json',
    }),
    [],
  );

  const openPicker = (kind: MediaKind) => {
    setAttachOpen(false);
    fileInputs[kind].current?.click();
  };

  const onFilePicked = (kind: MediaKind, files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const actualKind = kind === 'image' && f.type.startsWith('video/') ? 'video' : kind;
    setMedia({ kind: actualKind as MediaKind, file: f, previewUrl: url, caption: '' });
  };

  const closeMedia = () => {
    if (media?.previewUrl) {
      try {
        URL.revokeObjectURL(media.previewUrl);
      } catch {
      }
    }
    setMedia(null);
  };

  const supportsCaption = (k: MediaKind) => ['image', 'gif', 'video', 'document'].includes(k);

  const sendSelectedMedia = async () => {
    if (!media) return;
    try {
      await sendMedia(media.kind, { file: media.file, caption: supportsCaption(media.kind) ? media.caption : '' });
      closeMedia();
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    }
  };

  const fetchLinkPreview = async (u: string) => {
    const url = u.trim();
    if (!url) return;
    setLinkLoading(true);
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error('Falha ao carregar preview');
      setLinkPreview({
        title: String(json.data?.title ?? url),
        description: String(json.data?.description ?? ''),
        image: String(json.data?.image ?? ''),
        domain: String(json.data?.domain ?? ''),
      });
    } catch {
      setLinkPreview(null);
    } finally {
      setLinkLoading(false);
    }
  };

  const openLink = () => {
    setAttachOpen(false);
    setLinkOpen(true);
    setLinkUrl('');
    setLinkPreview(null);
  };

  const openLocation = () => {
    setAttachOpen(false);
    setLocationOpen(true);
  };

  const openContact = () => {
    setAttachOpen(false);
    setContactOpen(true);
    setContactName('');
    setContactPhone('');
  };

  const openContacts = () => {
    setAttachOpen(false);
    setContactsOpen(true);
    setContactsRows([{ name: '', phone: '', businessDescription: '' }]);
  };

  const openOptionList = () => {
    setAttachOpen(false);
    setOptionListOpen(true);
    setOptionListMessage('');
    setOptionListTitle('');
    setOptionListButtonLabel('Abrir lista de opções');
    setOptionListOptions([{ id: '1', title: '', description: '' }]);
  };

  const openPix = () => {
    setAttachOpen(false);
    setPixOpen(true);
    setPixKey('');
    setPixType('EVP');
    setPixMerchantName('');
  };

  const sendSelectedLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    try {
      await sendLink({
        url,
        message: linkPreview?.title || url,
        title: linkPreview?.title || url,
        description: linkPreview?.description || '',
        image: linkPreview?.image || '',
      });
      setLinkOpen(false);
      setLinkUrl('');
      setLinkPreview(null);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    }
  };

  const sendSelectedLocation = async (payload: { title: string; address: string; latitude: string; longitude: string }) => {
    setLocationSending(true);
    try {
      await sendLocation(payload);
      setLocationOpen(false);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    } finally {
      setLocationSending(false);
    }
  };

  const sendSelectedContact = async () => {
    try {
      await sendContact({ contactName, contactPhone });
      setContactOpen(false);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    }
  };

  const sendSelectedContacts = async () => {
    try {
      const contacts = contactsRows
        .map((r) => ({
          name: r.name,
          phones: [r.phone],
          ...(r.businessDescription.trim() ? { businessDescription: r.businessDescription } : {}),
        }))
        .filter((c) => c.name.trim() && c.phones[0].trim());
      await sendContacts({ contacts });
      setContactsOpen(false);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    }
  };

  const sendSelectedOptionList = async () => {
    try {
      const options = optionListOptions
        .map((o) => ({
          id: o.id,
          title: o.title,
          ...(o.description.trim() ? { description: o.description } : {}),
        }))
        .filter((o) => o.title.trim());

      await sendOptionList({
        message: optionListMessage,
        title: optionListTitle,
        buttonLabel: optionListButtonLabel,
        options,
      });
      setOptionListOpen(false);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    }
  };

  const sendSelectedPix = async () => {
    try {
      await sendButtonPix({ pixKey, type: pixType, merchantName: pixMerchantName });
      setPixOpen(false);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao enviar';
      window.alert(msg);
    }
  };

  return (
    <div className="h-[62px] bg-wa-header flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-3 text-[#54656f]">
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <Smile size={24} />
        </button>
        <div className="relative" ref={attachRef}>
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
          <Paperclip size={24} />
          </button>
          {attachOpen && (
            <div className="absolute bottom-[56px] left-0 bg-white rounded-lg shadow-lg border border-wa-border w-[240px] overflow-hidden z-50">
              <button type="button" onClick={() => openPicker('image')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <ImageIcon size={18} className="text-[#00a884]" />
                <span className="text-[14px] text-wa-text">Foto/Vídeo</span>
              </button>
              <button type="button" onClick={() => openPicker('document')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <FileText size={18} className="text-[#4a6dff]" />
                <span className="text-[14px] text-wa-text">Documento</span>
              </button>
              <button type="button" onClick={() => openPicker('sticker')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <Sticker size={18} className="text-[#ffb300]" />
                <span className="text-[14px] text-wa-text">Figurinha</span>
              </button>
              <button type="button" onClick={() => openPicker('gif')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <Film size={18} className="text-[#ff2f6d]" />
                <span className="text-[14px] text-wa-text">GIF (MP4)</span>
              </button>
              <button type="button" onClick={() => openPicker('audio')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <Mic size={18} className="text-[#667781]" />
                <span className="text-[14px] text-wa-text">Áudio</span>
              </button>
              <button type="button" onClick={() => openPicker('ptv')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <Video size={18} className="text-[#8b5cf6]" />
                <span className="text-[14px] text-wa-text">PTV</span>
              </button>
              <button type="button" onClick={openLink} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <LinkIcon size={18} className="text-[#00a884]" />
                <span className="text-[14px] text-wa-text">Link</span>
              </button>
              <button type="button" onClick={openLocation} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <MapPin size={18} className="text-[#d92929]" />
                <span className="text-[14px] text-wa-text">Localização</span>
              </button>
              <button type="button" onClick={openContact} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <User size={18} className="text-[#00a884]" />
                <span className="text-[14px] text-wa-text">Contato</span>
              </button>
              <button type="button" onClick={openContacts} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <Users size={18} className="text-[#4a6dff]" />
                <span className="text-[14px] text-wa-text">Vários contatos</span>
              </button>
              <button type="button" onClick={openOptionList} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <ListOrdered size={18} className="text-[#8b5cf6]" />
                <span className="text-[14px] text-wa-text">Lista de opções</span>
              </button>
              <button type="button" onClick={openPix} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-header text-left">
                <BadgeDollarSign size={18} className="text-[#00a884]" />
                <span className="text-[14px] text-wa-text">Botão Pix</span>
              </button>
            </div>
          )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 bg-white rounded-lg h-[42px] flex items-center px-3">
        <input 
          type="text" 
          placeholder="Digite uma mensagem"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-transparent outline-none text-[15px] text-wa-text placeholder:text-wa-muted"
        />
      </form>

      <div className="text-[#54656f]">
        {canSend ? (
          <button onClick={handleSubmit} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <Send size={24} />
          </button>
        ) : (
          <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <Mic size={24} />
          </button>
        )}
      </div>

      {Object.entries(fileInputs).map(([k, ref]) => (
        <input
          key={k}
          ref={ref as any}
          type="file"
          accept={acceptByKind[k as MediaKind]}
          className="hidden"
          onChange={(e) => {
            onFilePicked(k as MediaKind, e.target.files);
            e.currentTarget.value = '';
          }}
        />
      ))}

      {media && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[760px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
            <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
              <div className="text-[14px] text-wa-text">Pré-visualização</div>
              <button type="button" onClick={closeMedia} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 flex gap-4">
              <div className="flex-1 bg-[#f0f2f5] rounded-lg flex items-center justify-center min-h-[320px] overflow-hidden">
                {media.kind === 'image' || media.kind === 'sticker' ? (
                  <img src={media.previewUrl} className="max-h-[420px] max-w-full object-contain" />
                ) : media.kind === 'video' || media.kind === 'gif' || media.kind === 'ptv' ? (
                  <video src={media.previewUrl} className="max-h-[420px] max-w-full" controls />
                ) : media.kind === 'audio' ? (
                  <audio src={media.previewUrl} controls className="w-full" />
                ) : (
                  <div className="w-full p-4">
                    <div className="text-[14px] text-wa-text font-medium truncate">{media.file.name}</div>
                    <div className="text-[12px] text-wa-muted">{prettyBytes(media.file.size)}</div>
                  </div>
                )}
              </div>

              <div className="w-[280px] shrink-0">
                <div className="text-[13px] text-wa-muted mb-2">{media.file.name}</div>
                {supportsCaption(media.kind) && (
                  <div className="bg-white border border-wa-border rounded-lg px-3 py-2">
                    <input
                      value={media.caption}
                      onChange={(e) => setMedia({ ...media, caption: e.target.value })}
                      placeholder="Adicionar legenda"
                      className="w-full outline-none text-[14px] text-wa-text"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={sendSelectedMedia}
                  className="mt-4 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {linkOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[640px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
            <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
              <div className="text-[14px] text-wa-text">Enviar link</div>
              <button type="button" onClick={() => setLinkOpen(false)} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <div className="flex gap-2">
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onBlur={() => fetchLinkPreview(linkUrl)}
                  placeholder="Cole o link aqui"
                  className="flex-1 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => fetchLinkPreview(linkUrl)}
                  className="h-[42px] px-4 rounded-lg bg-wa-header hover:bg-gray-200 text-[14px]"
                >
                  {linkLoading ? 'Carregando...' : 'Preview'}
                </button>
              </div>

              {linkPreview && (
                <div className="mt-4 border border-wa-border rounded-lg overflow-hidden">
                  {linkPreview.image ? (
                    <img src={linkPreview.image} className="w-full h-[180px] object-cover" />
                  ) : null}
                  <div className="p-3">
                    <div className="text-[12px] uppercase tracking-wide text-wa-muted">{linkPreview.domain}</div>
                    <div className="text-[14px] text-wa-text font-medium mt-1 overflow-hidden text-ellipsis">{linkPreview.title}</div>
                    {linkPreview.description ? (
                      <div className="text-[13px] text-wa-muted mt-1 overflow-hidden text-ellipsis">{linkPreview.description}</div>
                    ) : null}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={sendSelectedLink}
                className="mt-4 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      <LocationPickerModal
        open={locationOpen}
        isSending={locationSending}
        onClose={() => setLocationOpen(false)}
        onConfirm={sendSelectedLocation}
      />

      {contactOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[640px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
            <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
              <div className="text-[14px] text-wa-text">Enviar contato</div>
              <button type="button" onClick={() => setContactOpen(false)} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nome" className="w-full h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Telefone (somente números)" className="w-full h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
              <button type="button" onClick={sendSelectedContact} className="mt-2 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95">
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {contactsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[720px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
            <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
              <div className="text-[14px] text-wa-text">Enviar vários contatos</div>
              <button type="button" onClick={() => setContactsOpen(false)} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {contactsRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input value={row.name} onChange={(e) => {
                    const next = contactsRows.slice();
                    next[idx] = { ...next[idx], name: e.target.value };
                    setContactsRows(next);
                  }} placeholder="Nome" className="col-span-4 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                  <input value={row.phone} onChange={(e) => {
                    const next = contactsRows.slice();
                    next[idx] = { ...next[idx], phone: e.target.value };
                    setContactsRows(next);
                  }} placeholder="Telefone" className="col-span-4 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                  <input value={row.businessDescription} onChange={(e) => {
                    const next = contactsRows.slice();
                    next[idx] = { ...next[idx], businessDescription: e.target.value };
                    setContactsRows(next);
                  }} placeholder="Descrição (opcional)" className="col-span-4 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                </div>
              ))}
              <button type="button" onClick={() => setContactsRows([...contactsRows, { name: '', phone: '', businessDescription: '' }])} className="h-[40px] px-4 rounded-lg bg-wa-header hover:bg-gray-200 text-[14px]">
                Adicionar contato
              </button>
              <button type="button" onClick={sendSelectedContacts} className="mt-2 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95">
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {optionListOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[760px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
            <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
              <div className="text-[14px] text-wa-text">Enviar lista de opções</div>
              <button type="button" onClick={() => setOptionListOpen(false)} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input value={optionListMessage} onChange={(e) => setOptionListMessage(e.target.value)} placeholder="Mensagem" className="w-full h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
              <div className="grid grid-cols-12 gap-2">
                <input value={optionListTitle} onChange={(e) => setOptionListTitle(e.target.value)} placeholder="Título" className="col-span-6 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                <input value={optionListButtonLabel} onChange={(e) => setOptionListButtonLabel(e.target.value)} placeholder="Texto do botão" className="col-span-6 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
              </div>
              <div className="text-[12px] text-wa-muted">Opções</div>
              {optionListOptions.map((opt, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input value={opt.id} onChange={(e) => {
                    const next = optionListOptions.slice();
                    next[idx] = { ...next[idx], id: e.target.value };
                    setOptionListOptions(next);
                  }} placeholder="ID" className="col-span-2 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                  <input value={opt.title} onChange={(e) => {
                    const next = optionListOptions.slice();
                    next[idx] = { ...next[idx], title: e.target.value };
                    setOptionListOptions(next);
                  }} placeholder="Título" className="col-span-4 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                  <input value={opt.description} onChange={(e) => {
                    const next = optionListOptions.slice();
                    next[idx] = { ...next[idx], description: e.target.value };
                    setOptionListOptions(next);
                  }} placeholder="Descrição (opcional)" className="col-span-6 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
                </div>
              ))}
              <button type="button" onClick={() => setOptionListOptions([...optionListOptions, { id: String(optionListOptions.length + 1), title: '', description: '' }])} className="h-[40px] px-4 rounded-lg bg-wa-header hover:bg-gray-200 text-[14px]">
                Adicionar opção
              </button>
              <button type="button" onClick={sendSelectedOptionList} className="mt-2 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95">
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {pixOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[640px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
            <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
              <div className="text-[14px] text-wa-text">Enviar botão Pix</div>
              <button type="button" onClick={() => setPixOpen(false)} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input value={pixMerchantName} onChange={(e) => setPixMerchantName(e.target.value)} placeholder="Título (opcional)" className="w-full h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
              <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Chave Pix" className="w-full h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none" />
              <select value={pixType} onChange={(e) => setPixType(e.target.value as any)} className="w-full h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none bg-white">
                <option value="EVP">EVP</option>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="PHONE">PHONE</option>
                <option value="EMAIL">EMAIL</option>
              </select>
              <button type="button" onClick={sendSelectedPix} className="mt-2 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95">
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

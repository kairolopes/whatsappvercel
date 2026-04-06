import { cn } from "@/lib/utils";
import { Check, CheckCheck, ChevronDown, Trash2, Play, Pause, MapPin, User, Users, ListOrdered, BadgeDollarSign, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { prettyBytes } from '@/utils/media';
import { buildGoogleMapsUrl, buildGoogleStaticMapUrl } from '@/utils/maps';

interface MessageBubbleProps {
  id: string;
  text: string;
  sender: 'user' | 'other';
  time: string;
  status?: 'sent' | 'delivered' | 'read';
  kind?: string;
  meta?: Record<string, unknown>;
  externalId?: string;
}

function asString(v: unknown) {
  return typeof v === 'string' ? v : '';
}

function getMetaUrl(meta?: Record<string, unknown>) {
  return asString(meta?.url) || asString((meta as any)?.preview);
}

function getMetaCaption(meta?: Record<string, unknown>) {
  return asString(meta?.caption);
}

function getMetaFileName(meta?: Record<string, unknown>) {
  return asString(meta?.fileName);
}

function getMetaMime(meta?: Record<string, unknown>) {
  return asString(meta?.mimeType);
}

function getMetaUploading(meta?: Record<string, unknown>) {
  return Boolean((meta as any)?.uploading);
}

function MediaAudio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setPos(el.currentTime || 0);
    const onMeta = () => setDur(el.duration || 0);
    const onEnd = () => setPlaying(false);

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, []);

  const label = useMemo(() => {
    const mm = (n: number) => n.toString().padStart(2, '0');
    const s = Math.floor(pos % 60);
    const m = Math.floor(pos / 60);
    return `${mm(m)}:${mm(s)}`;
  }, [pos]);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      if (playing) {
        el.pause();
        setPlaying(false);
      } else {
        await el.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };

  const pct = dur > 0 ? Math.min(1, Math.max(0, pos / dur)) : 0;

  return (
    <div className="w-[280px] max-w-full">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <div className="flex items-center gap-2">
        <button type="button" onClick={toggle} className="w-9 h-9 rounded-full bg-white/70 hover:bg-white flex items-center justify-center">
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-[1px]" />}
        </button>
        <div className="flex-1">
          <div className="h-[4px] bg-black/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#00a884]" style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-wa-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({ text, sender, time, status, kind = 'text', meta, externalId }: MessageBubbleProps) {
  const isUser = sender === 'user';
  const removeReaction = useChatStore((s) => s.removeReaction);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuOpen) return;
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const url = getMetaUrl(meta);
  const caption = getMetaCaption(meta) || (kind === 'text' ? text : '');
  const uploading = getMetaUploading(meta);
  const fileName = getMetaFileName(meta);
  const mimeType = getMetaMime(meta);

  const content = (() => {
    if (kind === 'image' && url) {
      return (
        <div className="w-[320px] max-w-full">
          <img src={url} className="w-full rounded-lg object-cover" />
          {caption ? <div className="mt-2 text-[14.2px] text-wa-text whitespace-pre-wrap break-words">{caption}</div> : null}
        </div>
      );
    }
    if (kind === 'sticker' && url) {
      return <img src={url} className="w-[160px] max-w-full rounded-lg object-contain" />;
    }
    if ((kind === 'video' || kind === 'ptv') && url) {
      return (
        <div className="w-[320px] max-w-full">
          <video src={url} className="w-full rounded-lg" controls playsInline />
          {caption ? <div className="mt-2 text-[14.2px] text-wa-text whitespace-pre-wrap break-words">{caption}</div> : null}
        </div>
      );
    }
    if (kind === 'gif' && url) {
      return (
        <div className="w-[320px] max-w-full">
          <video src={url} className="w-full rounded-lg" autoPlay loop muted playsInline />
          {caption ? <div className="mt-2 text-[14.2px] text-wa-text whitespace-pre-wrap break-words">{caption}</div> : null}
        </div>
      );
    }
    if (kind === 'audio' && url) {
      return <MediaAudio url={url} />;
    }
    if (kind === 'document' && url) {
      const size = typeof (meta as any)?.size === 'number' ? prettyBytes((meta as any).size) : '';
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block w-[320px] max-w-full">
          <div className="rounded-lg border border-black/10 bg-white/70 p-3 hover:bg-white">
            <div className="text-[14px] text-wa-text font-medium truncate">{fileName || 'Documento'}</div>
            <div className="text-[12px] text-wa-muted mt-1">{size || mimeType || ''}</div>
          </div>
          {caption ? <div className="mt-2 text-[14.2px] text-wa-text whitespace-pre-wrap break-words">{caption}</div> : null}
        </a>
      );
    }
    if (kind === 'link') {
      const linkUrl = asString((meta as any)?.url) || text;
      const title = asString((meta as any)?.title) || linkUrl;
      const description = asString((meta as any)?.description) || '';
      const image = asString((meta as any)?.image) || '';
      return (
        <a href={linkUrl} target="_blank" rel="noreferrer" className="block w-[360px] max-w-full">
          <div className="rounded-lg border border-black/10 bg-white/70 overflow-hidden hover:bg-white">
            {image ? <img src={image} className="w-full h-[140px] object-cover" /> : null}
            <div className="p-3">
              <div className="text-[14px] text-wa-text font-medium">{title}</div>
              {description ? <div className="text-[13px] text-wa-muted mt-1">{description}</div> : null}
              <div className="text-[12px] text-[#00a884] mt-2 truncate">{linkUrl}</div>
            </div>
          </div>
        </a>
      );
    }
    if (kind === 'location') {
      const title = asString((meta as any)?.title) || text || 'Localização';
      const address = asString((meta as any)?.address) || '';
      const latitude = asString((meta as any)?.latitude) || '';
      const longitude = asString((meta as any)?.longitude) || '';
      const mapsUrl = buildGoogleMapsUrl(latitude, longitude);
      const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
      const thumbUrl = apiKey
        ? buildGoogleStaticMapUrl({ apiKey, latitude, longitude, width: 520, height: 220, zoom: 16, scale: 2 })
        : '';
      return (
        <div className="w-[360px] max-w-full">
          <a href={mapsUrl || undefined} target={mapsUrl ? '_blank' : undefined} rel="noreferrer" className="block rounded-lg border border-black/10 bg-white/70 p-3 hover:bg-white">
            {thumbUrl ? (
              <div className="mb-2 overflow-hidden rounded-lg border border-black/10 bg-white">
                <img src={thumbUrl} className="w-full h-[140px] object-cover" />
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-[#d92929]" />
              <div className="text-[14px] text-wa-text font-medium">{title}</div>
            </div>
            {address ? <div className="text-[13px] text-wa-muted mt-1 whitespace-pre-wrap">{address}</div> : null}
            {mapsUrl ? <div className="text-[12px] text-[#00a884] mt-2 truncate">{mapsUrl}</div> : null}
          </a>
        </div>
      );
    }
    if (kind === 'contact') {
      const contactName = asString((meta as any)?.contactName) || text || 'Contato';
      const contactPhone = asString((meta as any)?.contactPhone) || '';
      const business = asString((meta as any)?.contactBusinessDescription) || '';
      return (
        <div className="w-[320px] max-w-full rounded-lg border border-black/10 bg-white/70 p-3">
          <div className="flex items-center gap-2">
            <User size={18} className="text-[#00a884]" />
            <div className="text-[14px] text-wa-text font-medium truncate">{contactName}</div>
          </div>
          {contactPhone ? <div className="text-[13px] text-wa-muted mt-1">{contactPhone}</div> : null}
          {business ? <div className="text-[13px] text-wa-muted mt-1">{business}</div> : null}
        </div>
      );
    }
    if (kind === 'contacts') {
      const contacts = Array.isArray((meta as any)?.contacts) ? (meta as any).contacts : [];
      return (
        <div className="w-[320px] max-w-full rounded-lg border border-black/10 bg-white/70 p-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#4a6dff]" />
            <div className="text-[14px] text-wa-text font-medium">{contacts.length || 0} contato(s)</div>
          </div>
          <div className="mt-2 space-y-1">
            {contacts.slice(0, 3).map((c: any, idx: number) => (
              <div key={idx} className="text-[13px] text-wa-text truncate">{asString(c?.name) || 'Contato'}</div>
            ))}
            {contacts.length > 3 ? <div className="text-[12px] text-wa-muted">+{contacts.length - 3} mais</div> : null}
          </div>
        </div>
      );
    }
    if (kind === 'option_list') {
      const message = text;
      const optionList = (meta as any)?.optionList;
      const title = asString(optionList?.title) || 'Lista de opções';
      const buttonLabel = asString(optionList?.buttonLabel) || 'Abrir lista';
      const options = Array.isArray(optionList?.options) ? optionList.options : [];
      return (
        <div className="w-[360px] max-w-full">
          {message ? <div className="text-[14.2px] text-wa-text whitespace-pre-wrap break-words mb-2">{message}</div> : null}
          <div className="rounded-lg border border-black/10 bg-white/70 p-3">
            <div className="flex items-center gap-2">
              <ListOrdered size={18} className="text-[#8b5cf6]" />
              <div className="text-[14px] text-wa-text font-medium truncate">{title}</div>
            </div>
            <div className="mt-2 space-y-1">
              {options.slice(0, 3).map((o: any, idx: number) => (
                <div key={idx} className="text-[13px] text-wa-text truncate">{asString(o?.title) || 'Opção'}</div>
              ))}
              {options.length > 3 ? <div className="text-[12px] text-wa-muted">+{options.length - 3} mais</div> : null}
            </div>
            <div className="mt-3 text-[12px] text-[#00a884] font-medium">{buttonLabel}</div>
          </div>
        </div>
      );
    }
    if (kind === 'pix') {
      const pixKey = asString((meta as any)?.pixKey);
      const merchantName = asString((meta as any)?.merchantName) || text || 'Pix';
      const type = asString((meta as any)?.type);
      return (
        <div className="w-[320px] max-w-full rounded-lg border border-black/10 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BadgeDollarSign size={18} className="text-[#00a884]" />
              <div className="text-[14px] text-wa-text font-medium truncate">{merchantName}</div>
            </div>
            <button
              type="button"
              disabled={!pixKey}
              onClick={async () => {
                if (!pixKey) return;
                try {
                  await navigator.clipboard.writeText(pixKey);
                } catch {
                }
              }}
              className={cn(
                'p-2 rounded-full hover:bg-black/5',
                pixKey ? '' : 'opacity-40 cursor-not-allowed',
              )}
            >
              <Copy size={16} className="text-wa-muted" />
            </button>
          </div>
          {type ? <div className="text-[12px] text-wa-muted mt-1">{type}</div> : null}
          {pixKey ? <div className="text-[13px] text-wa-text mt-2 break-all">{pixKey}</div> : null}
        </div>
      );
    }
    return (
      <span className="text-[14.2px] text-wa-text leading-[19px] whitespace-pre-wrap break-words inline-block pb-[10px] pr-[10px]">
        {text}
      </span>
    );
  })();

  return (
    <div className={cn("flex w-full mb-2", isUser ? "justify-end" : "justify-start")}>
      <div 
        className={cn(
          "max-w-[65%] rounded-lg px-2 py-1.5 relative group shadow-sm",
          isUser ? "bg-[#d9fdd3]" : "bg-white"
        )}
      >
        <div className={cn(kind === 'text' ? '' : 'pb-[10px] pr-[10px]')}>{content}</div>
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded-full hover:bg-black/5">
            <ChevronDown size={16} className="text-wa-muted" />
          </button>
        </div>
        {menuOpen && (
          <div ref={menuRef} className="absolute top-8 right-2 bg-white border border-wa-border rounded-lg shadow-lg overflow-hidden z-50">
            <button
              type="button"
              disabled={!externalId}
              onClick={async () => {
                try {
                  setMenuOpen(false);
                  if (!externalId) return;
                  await removeReaction(externalId);
                } catch {
                }
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left",
                externalId ? "hover:bg-wa-header" : "opacity-50 cursor-not-allowed",
              )}
            >
              <Trash2 size={16} className="text-[#d92929]" />
              Remover reação
            </button>
          </div>
        )}
        <div className="float-right -mb-[5px] ml-1.5 flex items-end gap-1 text-[11px] text-wa-muted">
          <span>{time}</span>
          {uploading ? <span className="text-[10px]">• enviando</span> : null}
          {isUser && (
            <span className="mb-[2px]">
              {status === 'read' ? (
                <CheckCheck size={15} className="text-[#53bdeb]" />
              ) : status === 'delivered' ? (
                <CheckCheck size={15} />
              ) : (
                <Check size={15} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

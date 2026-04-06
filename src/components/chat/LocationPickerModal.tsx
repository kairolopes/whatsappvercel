import { X, Crosshair, MapPin } from 'lucide-react';
import { useEffect } from 'react';
import { formatCoordinate } from '@/utils/maps';
import { useLocationPicker } from '@/hooks/useLocationPicker';

interface LocationPickerModalProps {
  open: boolean;
  isSending?: boolean;
  onClose: () => void;
  onConfirm: (payload: { title: string; address: string; latitude: string; longitude: string }) => void | Promise<void>;
}

export function LocationPickerModal({ open, isSending = false, onClose, onConfirm }: LocationPickerModalProps) {
  const {
    status,
    error,
    mapElRef,
    searchInputRef,
    selected,
    title,
    setTitle,
    address,
    setAddress,
    latitude,
    longitude,
    geoState,
    resolvingAddress,
    requestGeolocation,
  } = useLocationPicker(open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const canSend = Boolean(selected) && !isSending;

  const confirm = async () => {
    if (!selected) return;
    const titleFinal = title.trim() || 'Localização';
    const latStr = formatCoordinate(selected.lat);
    const lngStr = formatCoordinate(selected.lng);
    const addressFinal = address.trim() || `${latStr}, ${lngStr}`;
    await onConfirm({ title: titleFinal, address: addressFinal, latitude: latStr, longitude: lngStr });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div
        className="w-[900px] max-w-[94vw] h-[70vh] max-h-[720px] bg-white rounded-lg overflow-hidden shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
          <div className="text-[14px] text-wa-text">Selecionar localização</div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="h-[calc(70vh-56px)] max-h-[664px] grid grid-cols-12">
          <div className="col-span-8 relative bg-[#f0f2f5]">
            {status === 'ready' ? <div ref={mapElRef} className="absolute inset-0" /> : null}

            {status !== 'ready' ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[420px] max-w-[92%] rounded-lg border border-wa-border bg-white p-4">
                  <div className="text-[14px] text-wa-text font-medium">Mapa</div>
                  <div className="text-[13px] text-wa-muted mt-1">
                    {status === 'loading' ? 'Carregando Google Maps…' : error || 'Falha ao carregar o mapa.'}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="absolute left-3 top-3 flex gap-2">
              <button
                type="button"
                onClick={requestGeolocation}
                className="h-[36px] px-3 rounded-lg bg-white/95 border border-wa-border text-[13px] hover:bg-white flex items-center gap-2"
              >
                <Crosshair size={16} className="text-[#00a884]" />
                Usar minha localização
              </button>
            </div>
          </div>

          <div className="col-span-4 border-l border-wa-border p-4 flex flex-col">
            <div className="text-[12px] uppercase tracking-wide text-wa-muted">Busca</div>
            <input
              ref={searchInputRef}
              placeholder="Buscar endereço ou lugar"
              className="mt-2 h-[42px] rounded-lg border border-wa-border px-3 text-[14px] outline-none"
            />

            <div className="mt-4 text-[12px] uppercase tracking-wide text-wa-muted">Confirmação</div>
            <div className="mt-2 rounded-lg border border-wa-border p-3 bg-white">
              <div className="flex items-start gap-2">
                <MapPin size={18} className="text-[#d92929] mt-[1px]" />
                <div className="min-w-0 flex-1">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Título"
                    className="w-full text-[14px] text-wa-text font-medium outline-none"
                  />
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={resolvingAddress ? 'Obtendo endereço…' : 'Endereço (opcional)'}
                    className="w-full mt-1 text-[13px] text-wa-muted outline-none resize-none"
                    rows={3}
                  />
                  <div className="mt-2 text-[12px] text-wa-muted">
                    {latitude && longitude ? `${latitude}, ${longitude}` : 'Selecione um ponto no mapa'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-[12px] text-wa-muted">
              {geoState === 'requesting' ? 'Pedindo permissão de localização…' : null}
              {geoState === 'denied' ? 'Permissão negada. Você ainda pode buscar ou escolher no mapa.' : null}
              {geoState === 'unavailable' ? 'Localização indisponível. Use a busca ou selecione no mapa.' : null}
            </div>

            <div className="mt-auto pt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-[40px] rounded-full bg-wa-header hover:bg-gray-200 text-[14px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canSend}
                className="flex-1 h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95 disabled:opacity-40 disabled:hover:brightness-100"
              >
                {isSending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

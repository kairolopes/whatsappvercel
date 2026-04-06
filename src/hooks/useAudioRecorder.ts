import { useEffect, useMemo, useRef, useState } from 'react';

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'ready' | 'error';

function pickBestMimeType() {
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  const mr = (globalThis as any).MediaRecorder as any;
  if (!mr?.isTypeSupported) return '';
  for (const c of candidates) {
    if (mr.isTypeSupported(c)) return c;
  }
  return '';
}

function extFromMime(mime: string) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('webm')) return 'webm';
  return 'webm';
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string>('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const mimeType = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return pickBestMimeType();
  }, []);

  const stopTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const cleanupStream = () => {
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {
    }
    streamRef.current = null;
  };

  const reset = () => {
    stopTick();
    cleanupStream();
    try {
      recorderRef.current?.stop();
    } catch {
    }
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = 0;
    setElapsedMs(0);
    setBlob(null);
    setError('');
    setStatus('idle');
  };

  const start = async () => {
    if (status === 'requesting' || status === 'recording') return;
    setError('');
    setBlob(null);
    setElapsedMs(0);
    setStatus('requesting');

    try {
      if (typeof window === 'undefined') throw new Error('unsupported');
      if (!(navigator as any)?.mediaDevices?.getUserMedia) throw new Error('unsupported');
      if (!(globalThis as any).MediaRecorder) throw new Error('unsupported');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onerror = () => {
        setError('Falha ao gravar áudio');
        setStatus('error');
        stopTick();
        cleanupStream();
      };

      rec.onstop = () => {
        stopTick();
        cleanupStream();
        const out = new Blob(chunksRef.current, { type: mimeType || rec.mimeType || 'audio/webm' });
        setBlob(out.size > 0 ? out : null);
        setStatus(out.size > 0 ? 'ready' : 'error');
        if (out.size === 0) setError('Áudio vazio');
      };

      startedAtRef.current = Date.now();
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);

      rec.start();
      setStatus('recording');
    } catch (e: any) {
      const name = String(e?.name ?? '');
      if (name === 'NotAllowedError') setError('Permissão de microfone negada');
      else if (name === 'NotFoundError') setError('Microfone não encontrado');
      else setError('Seu navegador não suporta gravação de áudio');
      setStatus('error');
      stopTick();
      cleanupStream();
    }
  };

  const stop = () => {
    if (status !== 'recording') return;
    try {
      recorderRef.current?.stop();
    } catch {
      setError('Falha ao finalizar gravação');
      setStatus('error');
      stopTick();
      cleanupStream();
    }
  };

  const audioUrl = useMemo(() => {
    if (!blob) return '';
    try {
      return URL.createObjectURL(blob);
    } catch {
      return '';
    }
  }, [blob]);

  useEffect(() => {
    return () => {
      stopTick();
      cleanupStream();
      if (audioUrl) {
        try {
          URL.revokeObjectURL(audioUrl);
        } catch {
        }
      }
    };
  }, [audioUrl]);

  const file = useMemo(() => {
    if (!blob) return null;
    const mime = blob.type || mimeType || 'audio/webm';
    const ext = extFromMime(mime);
    return new File([blob], `audio-${Date.now()}.${ext}`, { type: mime });
  }, [blob, mimeType]);

  return {
    status,
    error,
    elapsedMs,
    audioUrl,
    file,
    start,
    stop,
    reset,
  };
}


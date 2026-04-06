import { useEffect, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

type MapsStatus = 'idle' | 'loading' | 'ready' | 'error';

let globalLoaderPromise: Promise<typeof google> | null = null;
let globalLoaderKey: string | null = null;

function loadGoogleMaps(apiKey: string) {
  if (!globalLoaderPromise || globalLoaderKey !== apiKey) {
    globalLoaderKey = apiKey;
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
    });
    globalLoaderPromise = loader.load();
  }
  return globalLoaderPromise;
}

export function useGoogleMaps(apiKey: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<MapsStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      setError(null);
      return;
    }
    if (!apiKey || !apiKey.trim()) {
      setStatus('error');
      setError('Defina VITE_GOOGLE_MAPS_API_KEY para habilitar o mapa.');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    loadGoogleMaps(apiKey.trim())
      .then(() => {
        if (cancelled) return;
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        const msg = e instanceof Error ? e.message : '';
        setError(msg || 'Falha ao carregar o Google Maps.');
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, enabled]);

  return { status, error };
}

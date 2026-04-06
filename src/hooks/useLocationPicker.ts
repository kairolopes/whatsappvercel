import { useEffect, useMemo, useRef, useState } from 'react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { formatCoordinate } from '@/utils/maps';

type LatLng = { lat: number; lng: number };

export function useLocationPicker(open: boolean) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? undefined;
  const { status, error } = useGoogleMaps(apiKey, open);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const reverseTimerRef = useRef<number | null>(null);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);

  const [selected, setSelected] = useState<LatLng | null>(null);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [geoState, setGeoState] = useState<'idle' | 'requesting' | 'available' | 'denied' | 'unavailable'>('idle');
  const [resolvingAddress, setResolvingAddress] = useState(false);

  const latitude = useMemo(() => (selected ? formatCoordinate(selected.lat) : ''), [selected]);
  const longitude = useMemo(() => (selected ? formatCoordinate(selected.lng) : ''), [selected]);

  const cleanupMaps = () => {
    if (reverseTimerRef.current) {
      window.clearTimeout(reverseTimerRef.current);
      reverseTimerRef.current = null;
    }
    listenersRef.current.forEach((l) => l.remove());
    listenersRef.current = [];
    autocompleteRef.current = null;
    geocoderRef.current = null;
    markerRef.current = null;
    mapRef.current = null;
  };

  const resetState = () => {
    setSelected(null);
    setTitle('');
    setAddress('');
    setGeoState('idle');
    setResolvingAddress(false);
  };

  useEffect(() => {
    if (!open) {
      cleanupMaps();
      resetState();
    }
  }, [open]);

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoState('unavailable');
      return;
    }
    setGeoState('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState('available');
        setSelected({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGeoState(err.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    if (!open) return;
    requestGeolocation();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (status !== 'ready') return;
    if (!mapElRef.current) return;

    const center = selected ?? { lat: 0, lng: 0 };
    const zoom = selected ? 16 : 2;

    const map = new google.maps.Map(mapElRef.current, {
      center,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    });
    const marker = new google.maps.Marker({
      map,
      position: selected ?? undefined,
      draggable: true,
      visible: Boolean(selected),
    });
    mapRef.current = map;
    markerRef.current = marker;
    geocoderRef.current = new google.maps.Geocoder();

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      setSelected({ lat: ll.lat(), lng: ll.lng() });
    });
    const dragListener = marker.addListener('dragend', () => {
      const ll = marker.getPosition();
      if (!ll) return;
      setSelected({ lat: ll.lat(), lng: ll.lng() });
    });
    listenersRef.current.push(clickListener, dragListener);

    if (searchInputRef.current) {
      const ac = new google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ['geometry', 'formatted_address', 'name'],
      });
      autocompleteRef.current = ac;
      const placeListener = ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        setSelected({ lat: loc.lat(), lng: loc.lng() });
        const addr = typeof place?.formatted_address === 'string' ? place.formatted_address : '';
        const nm = typeof place?.name === 'string' ? place.name : '';
        if (addr) setAddress(addr);
        if (nm) setTitle(nm);
      });
      listenersRef.current.push(placeListener);
    }

    return () => {
      cleanupMaps();
    };
  }, [open, status]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (!selected) {
      marker.setVisible(false);
      return;
    }

    marker.setVisible(true);
    marker.setPosition(selected);
    map.panTo(selected);
    if ((map.getZoom() ?? 0) < 12) map.setZoom(16);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    if (status !== 'ready') return;
    if (!selected) return;
    if (!geocoderRef.current) return;

    if (reverseTimerRef.current) window.clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = window.setTimeout(async () => {
      if (!geocoderRef.current) return;
      setResolvingAddress(true);
      try {
        const { results } = await geocoderRef.current.geocode({ location: selected });
        const first = results?.[0]?.formatted_address;
        if (typeof first === 'string' && first.trim()) {
          setAddress(first);
          setTitle((prev) => (prev.trim() ? prev : first.split(',')[0] || 'Localização'));
        }
      } catch {
        void 0;
      } finally {
        setResolvingAddress(false);
      }
    }, 450);

    return () => {
      if (reverseTimerRef.current) {
        window.clearTimeout(reverseTimerRef.current);
        reverseTimerRef.current = null;
      }
    };
  }, [open, selected, status]);

  return {
    apiKey,
    status,
    error,
    mapElRef,
    searchInputRef,
    selected,
    setSelected,
    title,
    setTitle,
    address,
    setAddress,
    latitude,
    longitude,
    geoState,
    resolvingAddress,
    requestGeolocation,
  };
}

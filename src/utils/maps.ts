export function formatCoordinate(value: number, decimals = 6) {
  if (!Number.isFinite(value)) return '';
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}

export function buildGoogleMapsUrl(latitude: string, longitude: string) {
  const lat = latitude.trim();
  const lng = longitude.trim();
  if (!lat || !lng) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function buildGoogleStaticMapUrl(params: {
  apiKey: string;
  latitude: string;
  longitude: string;
  width?: number;
  height?: number;
  zoom?: number;
  scale?: 1 | 2;
}) {
  const apiKey = params.apiKey.trim();
  const lat = params.latitude.trim();
  const lng = params.longitude.trim();
  if (!apiKey || !lat || !lng) return '';

  const width = Math.max(120, Math.min(640, Math.floor(params.width ?? 520)));
  const height = Math.max(120, Math.min(640, Math.floor(params.height ?? 220)));
  const zoom = Math.max(1, Math.min(20, Math.floor(params.zoom ?? 16)));
  const scale = params.scale ?? 2;

  const qs = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: String(scale),
    maptype: 'roadmap',
    markers: `color:red|${lat},${lng}`,
    key: apiKey,
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${qs.toString()}`;
}


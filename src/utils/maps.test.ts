import { describe, expect, it } from 'vitest';
import { buildGoogleMapsUrl, buildGoogleStaticMapUrl, formatCoordinate } from './maps';

describe('maps utils', () => {
  it('formatCoordinate trims trailing zeros', () => {
    expect(formatCoordinate(10)).toBe('10');
    expect(formatCoordinate(10.5)).toBe('10.5');
    expect(formatCoordinate(10.1234567)).toBe('10.123457');
  });

  it('buildGoogleMapsUrl returns empty if incomplete', () => {
    expect(buildGoogleMapsUrl('', '1')).toBe('');
    expect(buildGoogleMapsUrl('1', '')).toBe('');
  });

  it('buildGoogleMapsUrl encodes coordinates', () => {
    expect(buildGoogleMapsUrl(' -23.55 ', ' -46.63 ')).toContain('google.com/maps?q=');
  });

  it('buildGoogleStaticMapUrl returns empty without key', () => {
    expect(
      buildGoogleStaticMapUrl({ apiKey: '', latitude: '-23.55', longitude: '-46.63' }),
    ).toBe('');
  });

  it('buildGoogleStaticMapUrl builds URL', () => {
    const url = buildGoogleStaticMapUrl({
      apiKey: 'k',
      latitude: '-23.55',
      longitude: '-46.63',
      width: 400,
      height: 200,
      zoom: 15,
      scale: 2,
    });
    expect(url).toContain('maps.googleapis.com/maps/api/staticmap');
    expect(url).toContain('center=-23.55%2C-46.63');
    expect(url).toContain('key=k');
  });
});


import { describe, expect, it, vi } from 'vitest';
import { areaName, coordsSchema, reverseGeocode } from './geocode';

describe('areaName', () => {
  it('combines the neighbourhood-level area with the city', () => {
    expect(areaName({ suburb: 'Koramangala', city: 'Bengaluru', state: 'Karnataka' })).toBe('Koramangala, Bengaluru');
  });

  it('prefers the most specific area and skips duplicates', () => {
    expect(areaName({ neighbourhood: 'Indiranagar', suburb: 'East', city: 'Bengaluru' })).toBe('Indiranagar, Bengaluru');
    expect(areaName({ suburb: 'Bengaluru', city: 'Bengaluru' })).toBe('Bengaluru');
  });

  it('falls back to town, then state, then the display name', () => {
    expect(areaName({ village: 'Hampi', county: 'Vijayanagara' })).toBe('Hampi, Vijayanagara');
    expect(areaName({ state: 'Goa' })).toBe('Goa');
    expect(areaName({}, 'MG Road, Ashok Nagar, Bengaluru, Karnataka, India')).toBe('MG Road, Ashok Nagar');
    expect(areaName({}, '')).toBeNull();
  });
});

describe('coordsSchema', () => {
  it('accepts valid coordinates from query strings', () => {
    expect(coordsSchema.parse({ lat: '12.97', lon: '77.59' })).toEqual({ lat: 12.97, lon: 77.59 });
  });

  it.each([{ lat: '91', lon: '0' }, { lat: '0', lon: '-181' }, { lat: 'abc', lon: '0' }, { lon: '0' }])('rejects %j', value => {
    expect(coordsSchema.safeParse(value).success).toBe(false);
  });
});

describe('reverseGeocode', () => {
  it('queries Nominatim with rounded coordinates and an identifying User-Agent', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ address: { suburb: 'Koramangala', city: 'Bengaluru' } }));
    await expect(reverseGeocode(12.9352719, 77.6245123, fetchImpl)).resolves.toBe('Koramangala, Bengaluru');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(url.startsWith('https://nominatim.openstreetmap.org/reverse?')).toBe(true);
    expect([params.get('lat'), params.get('lon')]).toEqual(['12.9353', '77.6245']);
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^PocketLedger\//);
  });

  it('returns null for errors and unknown places', async () => {
    await expect(reverseGeocode(0, 0, vi.fn(async () => new Response('busy', { status: 429 })))).resolves.toBeNull();
    await expect(reverseGeocode(0, 0, vi.fn(async () => Response.json({ error: 'Unable to geocode' })))).resolves.toBeNull();
  });
});

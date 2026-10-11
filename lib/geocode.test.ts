import { describe, expect, it, vi } from 'vitest';
import { areaName, coordsSchema, reverseGeocode } from './geocode';

describe('areaName', () => {
  it('returns the area and city, without the ward prefix', () => {
    expect(areaName({ neighbourhood: 'Lakshmi Nagar', suburb: 'Ward 24 Saidabad', city_district: 'Greater Hyderabad Municipal Corporation South Zone', city: 'Hyderabad', state_district: 'Hyderabad', state: 'Telangana', postcode: '500059', country: 'India' })).toBe('Saidabad, Hyderabad');
    expect(areaName({ suburb: 'Ward No. 7 - Ameerpet', city: 'Hyderabad' })).toBe('Ameerpet, Hyderabad');
  });

  it('uses the district for villages outside a city', () => {
    expect(areaName({ village: 'Hampi', county: 'Hosapete taluk', state_district: 'Vijayanagara', state: 'Karnataka' })).toBe('Hampi, Vijayanagara');
  });

  it('returns whichever part exists and skips duplicates', () => {
    expect(areaName({ city: 'Hyderabad', state: 'Telangana' })).toBe('Hyderabad');
    expect(areaName({ suburb: 'Saidabad' })).toBe('Saidabad');
    expect(areaName({ town: 'Udupi', state_district: 'Udupi' })).toBe('Udupi');
    expect(areaName({ road: 'MG Road', state: 'Karnataka' })).toBeNull();
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
    const fetchImpl = vi.fn(async () => Response.json({ address: { suburb: 'Ward 24 Saidabad', city: 'Hyderabad' } }));
    await expect(reverseGeocode(12.9352719, 77.6245123, fetchImpl)).resolves.toBe('Saidabad, Hyderabad');
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

import { z } from 'zod';

export const coordsSchema = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });
type Address = Record<string, string | undefined>;

// Saved location is "area, city" only, e.g. "Saidabad, Hyderabad". Villages fall back to their district.
const AREA_KEYS = ['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet', 'town'];
const CITY_KEYS = ['city', 'town', 'state_district', 'county'];
// OSM often names Indian suburbs after municipal wards, e.g. "Ward 24 Saidabad".
const clean = (value?: string) => value?.replace(/^ward\s*(no\.?\s*)?\d+\s*[-:]?\s*/i, '').trim();
const first = (address: Address, keys: string[]) => keys.map(key => clean(address[key])).find(Boolean);

export function areaName(address: Address = {}) {
  const parts = [first(address, AREA_KEYS), first(address, CITY_KEYS)].filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  return parts.join(', ').slice(0, 250) || null;
}

// OpenStreetMap Nominatim: free, requires an identifying User-Agent and at most ~1 request per second.
export async function reverseGeocode(lat: number, lon: number, fetchImpl: typeof fetch = fetch) {
  const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(4), lon: lon.toFixed(4), zoom: '16', addressdetails: '1', 'accept-language': 'en' });
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: { 'User-Agent': 'PocketLedger/1.0 (expense tracker)' }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as { address?: Address; error?: string } | null;
  if (!data || data.error) return null;
  return areaName(data.address);
}

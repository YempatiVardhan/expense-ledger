import { z } from 'zod';

export const coordsSchema = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });
type Address = Record<string, string | undefined>;

const AREA_KEYS = ['neighbourhood', 'suburb', 'quarter', 'city_district', 'village', 'hamlet', 'residential'];
const CITY_KEYS = ['city', 'town', 'municipality', 'county', 'state_district'];
const first = (address: Address, keys: string[]) => keys.map(key => address[key]?.trim()).find(Boolean);

export function areaName(address: Address = {}, displayName = '') {
  const parts = [first(address, AREA_KEYS), first(address, CITY_KEYS)].filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  if (!parts.length && address.state) parts.push(address.state);
  const name = parts.length ? parts.join(', ') : displayName.split(',').slice(0, 2).map(s => s.trim()).filter(Boolean).join(', ');
  return name.slice(0, 250) || null;
}

// OpenStreetMap Nominatim: free, requires an identifying User-Agent and at most ~1 request per second.
export async function reverseGeocode(lat: number, lon: number, fetchImpl: typeof fetch = fetch) {
  const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(4), lon: lon.toFixed(4), zoom: '16', addressdetails: '1', 'accept-language': 'en' });
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: { 'User-Agent': 'PocketLedger/1.0 (expense tracker)' }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as { address?: Address; display_name?: string; error?: string } | null;
  if (!data || data.error) return null;
  return areaName(data.address, data.display_name);
}

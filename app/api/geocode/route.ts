import { ApiError, failure } from '@/lib/http';
import { coordsSchema, reverseGeocode } from '@/lib/geocode';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const coords = coordsSchema.safeParse({ lat: params.get('lat') ?? undefined, lon: params.get('lon') ?? undefined });
    if (!coords.success) throw new ApiError('Invalid coordinates.');
    const area = await reverseGeocode(coords.data.lat, coords.data.lon).catch(() => null);
    if (!area) throw new ApiError('Could not find an area name for this location. Type a place instead.', 502);
    return Response.json({ area });
  } catch (error) { return failure(error); }
}
